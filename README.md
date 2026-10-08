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

## Information architecture

The widget reads from general to specific:

1. **Summary strip** — four metrics over the current selection: events shown, strongest,
   shallowest and most recent. Shallowest earns a slot because depth governs damage: a
   magnitude 5 at 10 km is felt far more sharply than a magnitude 6 at 300 km.
2. **Control panel** — a translucent layer holding every filter.
3. **Two-column grid** — the event list and the magnitude-over-time chart on the left, the
   depth-vs-magnitude scatter and the selected event's detail card on the right. Collapses to
   a single column below 880px, so it still works embedded in a narrow chat.

## Widget interactions

1. **Magnitude slider** — filters instantly client-side; the counter updates during the drag,
   not on release.
2. **Time range chips** (hour / 24h / 7 days) — calls the tool again over MCP to pull a
   different feed; the only control that makes a server round trip.
3. **Place filter** — free-text, instant client-side narrowing.
4. **Sort** — by magnitude, recency or depth.
5. **Linked selection** — click an event in the list *or* either chart and all three highlight
   it together, opening a card with depth, coordinates, time, tsunami flag and the USGS record.

Selection and filter state persist through `window.openai.setWidgetState`.

## Design notes

Material and motion follow Apple's Human Interface guidance: translucent chrome via
`backdrop-filter` with content passing underneath, feedback on pointer-down rather than on
release, and transitions limited to `transform` and `opacity` so they stay on the compositor.
Type uses size-specific tracking and tabular numerals so data columns don't shift.
`prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast` are all
honoured, and the list is keyboard navigable.

## Run locally

```bash
npm install
node server.js                  # http://localhost:8787/mcp
npx localtunnel --port 8787     # public HTTPS URL
```

### Try the widget without Athena

`demo/` contains a local host that injects `window.openai` the same way the platform does and
proxies `callTool` to the running MCP server, so the full round trip is observable without the
platform:

```bash
node server.js                               # terminal 1
node -e "import('./src/widget.js').then(m=>require('fs').writeFileSync('demo/widget.html',m.widgetHtml))"
cd demo && python3 -m http.server 8080       # terminal 2 → http://localhost:8080/host.html
```

## Connect to Athena

When creating a chat agent, open the **MCP** section and add the tunnel URL with the endpoint
path: `<tunnel-url>/mcp`. Then ask the agent something like *"show me earthquakes above
magnitude 4 in the last 24 hours"* and the explorer renders in the conversation.
