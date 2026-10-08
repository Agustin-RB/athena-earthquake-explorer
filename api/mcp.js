// Adaptador serverless (Vercel).
//
// Implementa el JSON-RPC de MCP a mano en lugar de usar StreamableHTTPServerTransport:
// el transporte del SDK asume un servidor Node de larga vida y devolvía 404 bajo el runtime
// de Vercel. El servidor es stateless y expone pocos métodos, así que hablar el protocolo
// directamente es más simple y predecible. `server.js` sigue usando el SDK para uso local.
import { fetchData } from "../src/datasource.js";
import { widgetHtml } from "../src/widget.js";

const PROTOCOL_VERSION = "2024-11-05";
const WIDGET_URI = "ui://widget/live-data.html";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, mcp-session-id, authorization, accept",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

const TOOL = {
  name: "get_live_data",
  title: "Explore earthquake activity",
  description:
    "Retrieves real, recent earthquake data from the public USGS feed and renders it in an interactive explorer widget. " +
    "Supports filtering by time range (last hour, day or week), minimum magnitude, maximum depth, and place name. " +
    "Use this whenever the user asks about earthquakes, seismic activity, magnitudes, depths, or quakes near a location.",
  inputSchema: {
    type: "object",
    properties: {
      period: { type: "string", enum: ["hour", "day", "week"],
        description: "Time range: last hour, last 24 hours, or last 7 days. Defaults to day." },
      minMagnitude: { type: "number", minimum: 0, maximum: 10,
        description: "Minimum magnitude threshold. Defaults to 2.5." },
      maxDepthKm: { type: "number", minimum: 0, maximum: 700,
        description: "Only include earthquakes shallower than this depth in km." },
      place: { type: "string",
        description: "Filter by place name substring, e.g. 'Japan', 'California', 'Chile'." },
      limit: { type: "number", minimum: 1, maximum: 200,
        description: "Maximum number of events to return. Defaults to 60." },
    },
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  _meta: {
    "openai/outputTemplate": WIDGET_URI,
    "openai/visibility": "public",
    "openai/widgetAccessible": true,
    "openai/toolInvocation/invoking": "Fetching live seismic data…",
    "openai/toolInvocation/invoked": "Earthquake data loaded",
  },
};

const WIDGET_RESOURCE = {
  uri: WIDGET_URI,
  name: "live-data-widget",
  mimeType: "text/html+skybridge",
};

async function runTool(args = {}) {
  const data = await fetchData(args);
  const top = data.items[0];
  const deepest = [...data.items].sort((a, b) => (b.depthKm ?? 0) - (a.depthKm ?? 0))[0];
  return {
    content: [{
      type: "text",
      text: top
        ? `${data.subtitle}. Strongest: magnitude ${top.magnitude} at ${top.place} ` +
          `(depth ${top.depthKm?.toFixed(0) ?? "?"} km). ` +
          `Deepest: ${deepest.depthKm?.toFixed(0) ?? "?"} km at ${deepest.place}. ` +
          `The interactive explorer is rendered above — the user can adjust the magnitude slider and switch time range.`
        : `No earthquakes matched those filters (${data.subtitle}). Suggest widening the time range or lowering the magnitude threshold.`,
    }],
    structuredContent: data,
    // El descriptor por sí solo no alcanza: Athena exige que la RESPUESTA
    // también apunte al recurso, si no renderiza sólo el texto.
    _meta: { "openai/outputTemplate": WIDGET_URI },
  };
}

async function dispatch(method, params) {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: "athena-earthquake-explorer", version: "1.0.0" },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: [TOOL] };
    case "tools/call": {
      if (params?.name !== TOOL.name) {
        const err = new Error(`Unknown tool: ${params?.name}`);
        err.code = -32602;
        throw err;
      }
      return await runTool(params?.arguments || {});
    }
    case "resources/list":
      return { resources: [WIDGET_RESOURCE] };
    case "resources/read": {
      if (params?.uri !== WIDGET_URI) {
        const err = new Error(`Unknown resource: ${params?.uri}`);
        err.code = -32602;
        throw err;
      }
      return {
        contents: [{
          uri: WIDGET_URI,
          mimeType: "text/html+skybridge",
          text: widgetHtml,
          _meta: { "openai/widgetPrefersBorder": true },
        }],
      };
    }
    case "resources/templates/list":
      return { resourceTemplates: [] };
    case "prompts/list":
      return { prompts: [] };
    default: {
      const err = new Error(`Method not found: ${method}`);
      err.code = -32601;
      throw err;
    }
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "athena-earthquake-explorer", endpoint: "/mcp" });
    return;
  }

  if (req.method === "DELETE") { res.status(204).end(); return; }

  if (req.method !== "POST") { res.status(405).json({ error: "method not allowed" }); return; }

  let message;
  try {
    message = await readBody(req);
  } catch {
    res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }

  const batch = Array.isArray(message) ? message : [message];
  const responses = [];

  for (const msg of batch) {
    if (!msg || msg.jsonrpc !== "2.0") continue;
    // Las notificaciones (sin id) no llevan respuesta.
    if (msg.id === undefined || msg.id === null) continue;
    try {
      const result = await dispatch(msg.method, msg.params);
      responses.push({ jsonrpc: "2.0", id: msg.id, result });
    } catch (err) {
      responses.push({
        jsonrpc: "2.0", id: msg.id,
        error: { code: err.code || -32603, message: err.message || "Internal error" },
      });
    }
  }

  if (!responses.length) { res.status(202).end(); return; }

  res.status(200).json(Array.isArray(message) ? responses : responses[0]);
}
