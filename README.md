# Athena Earthquake Activity Explorer

An MCP (Model Context Protocol) server for the **Athena AI** platform that exposes a single
tool, `get_live_data`, which pulls **real, recent earthquake data** from a public feed and
renders it inside an interactive widget embedded in the chat.

**Challenge subject:** Earthquake activity explorer.

## Data source

[USGS Earthquake Hazards Program](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php)
— public GeoJSON summary feeds, no API key or authentication required:

- `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson`
- `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`
- `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson`

## Architecture

- **`server.js`** — native Node 20 HTTP server. Single `/mcp` endpoint backed by the official
  SDK's `StreamableHTTPServerTransport` in **stateless** mode (a fresh server + transport per
  request, no session bookkeeping), open CORS, and a JSON health check on `GET /`.
- **`src/datasource.js`** — fetches the USGS feed for the requested period and filters by
  `period`, `minMagnitude`, `maxDepthKm`, `place` and `limit`, returning normalized events plus
  a summary subtitle and the applied filters.
- **`src/widget.js`** — the embedded UI, registered as an MCP resource with mimeType
  `text/html+skybridge` and wired to the tool through `_meta["openai/outputTemplate"]`. Vanilla
  JS, no build step; it reads `window.openai.toolOutput` and persists UI state.
- **Tool contract** — `get_live_data` returns a text summary for the model (strongest and
  deepest event) and the full dataset as `structuredContent` for the widget.

## Widget interactions

1. **Magnitude slider** — filters the event list instantly, client-side.
2. **Time range chips** (last hour / 24h / 7 days) — calls the tool again over MCP to fetch a
   different feed.
3. **Place filter** — free-text, instant client-side narrowing.
4. **Sort + event detail** — sort by magnitude, recency or depth; click an event for depth,
   coordinates, time, tsunami flag and a link to the full USGS record.

## Run locally

```bash
npm install
node server.js                  # http://localhost:8787/mcp
npx localtunnel --port 8787     # public HTTPS URL
```

## Connect to Athena

When creating a chat agent, open the **MCP** section and add the tunnel URL with the endpoint
path: `<tunnel-url>/mcp`. Then ask the agent something like *"show me earthquakes above
magnitude 4 in the last 24 hours"* and the explorer renders in the conversation.
