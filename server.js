import http from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { fetchData } from "./src/datasource.js";
import { widgetHtml } from "./src/widget.js";

const PORT = process.env.PORT || 8787;
const MCP_PATH = "/mcp";
const WIDGET_URI = "ui://widget/live-data.html";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, mcp-session-id, authorization",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

function buildServer() {
  const server = new McpServer({ name: "athena-live-data", version: "1.0.0" });

  server.registerResource(
    "live-data-widget",
    WIDGET_URI,
    {},
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: "text/html+skybridge",
          text: widgetHtml,
          _meta: { "openai/widgetPrefersBorder": true },
        },
      ],
    })
  );

  server.registerTool(
    "get_live_data",
    {
      title: "Explore earthquake activity",
      description:
        "Retrieves real, recent earthquake data from the public USGS feed and renders it in an interactive explorer widget. " +
        "Supports filtering by time range (last hour, day or week), minimum magnitude, maximum depth, and place name. " +
        "Use this whenever the user asks about earthquakes, seismic activity, magnitudes, depths, or quakes near a location.",
      inputSchema: {
        period: z.enum(["hour", "day", "week"]).optional()
          .describe("Time range to search: last hour, last 24 hours, or last 7 days. Defaults to day."),
        minMagnitude: z.number().min(0).max(10).optional()
          .describe("Minimum magnitude threshold. Defaults to 2.5."),
        maxDepthKm: z.number().min(0).max(700).optional()
          .describe("Only include earthquakes at or above this depth in km (shallower than this value)."),
        place: z.string().optional()
          .describe("Filter by place name substring, e.g. 'Japan', 'California', 'Chile'."),
        limit: z.number().min(1).max(200).optional()
          .describe("Maximum number of events to return. Defaults to 60."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      _meta: {
        "openai/outputTemplate": WIDGET_URI,
        "openai/visibility": "public",
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Fetching live data…",
        "openai/toolInvocation/invoked": "Live data loaded",
      },
    },
    async (args = {}) => {
      const data = await fetchData(args);
      const top = data.items[0];
      const deepest = [...data.items].sort((a, b) => (b.depthKm ?? 0) - (a.depthKm ?? 0))[0];
      return {
        content: [
          {
            type: "text",
            text: top
              ? `${data.subtitle}. Strongest: magnitude ${top.magnitude} at ${top.place} ` +
                `(depth ${top.depthKm?.toFixed(0) ?? "?"} km). ` +
                `Deepest: ${deepest.depthKm?.toFixed(0) ?? "?"} km at ${deepest.place}. ` +
                `The interactive explorer is rendered above — the user can adjust the magnitude slider and switch time range.`
              : `No earthquakes matched those filters (${data.subtitle}). Suggest widening the time range or lowering the magnitude threshold.`,
          },
        ],
        structuredContent: data,
      };
    }
  );

  return server;
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { ...CORS, "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, service: "athena-live-data", mcp: MCP_PATH }));
  }

  if (url.pathname !== MCP_PATH) {
    res.writeHead(404, CORS);
    return res.end();
  }

  try {
    let body;
    if (req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString("utf8");
      body = raw ? JSON.parse(raw) : undefined;
    }

    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

    // Stateless: un server+transport nuevo por request (evita bookkeeping de sesiones).
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless: cada request es independiente
      enableJsonResponse: true,
    });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error("MCP error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { ...CORS, "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(err?.message || err) }));
    }
  }
});

httpServer.listen(PORT, () => {
  console.log(`MCP server listening on http://localhost:${PORT}${MCP_PATH}`);
});
