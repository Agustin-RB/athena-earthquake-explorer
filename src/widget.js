// Widget embebido (text/html+skybridge). Lee window.openai.toolOutput.
// Interacciones principales:
//  1) Slider de magnitud mínima  -> filtra al instante en cliente, muestra "N de M"
//  2) Chips de rango temporal    -> re-llama la tool por MCP (callTool) con otro period
//  3) Filtro por lugar           -> filtra al instante en cliente
//  4) Orden + selección de evento con panel de detalle
// Estado persistido con setWidgetState.
export const widgetHtml = `
<div id="root">Loading earthquake data…</div>
<style>
  :root {
    --bg:#fff; --fg:#14181d; --muted:#656d78; --line:#e3e7ec; --soft:#f4f6f8;
    --accent:#1f6f8b; --m3:#4b9560; --m4:#c89a2b; --m5:#d4762f; --m6:#b33c2c;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#15181b; --fg:#eef0f2; --muted:#9aa3ad; --line:#272c32; --soft:#1d2126;
            --accent:#6fb8d1; --m3:#79c190; --m4:#e3c06a; --m5:#eb9f6e; --m6:#e8766a; }
  }
  * { box-sizing:border-box; }
  body { margin:0; }
  #root { font:14px/1.5 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;
          background:var(--bg); color:var(--fg); padding:16px; }
  h2 { margin:0 0 3px; font-size:17px; letter-spacing:-0.01em; }
  .sub { color:var(--muted); font-size:12px; margin-bottom:14px; }
  .panel { display:flex; flex-direction:column; gap:11px; padding:12px; border:1px solid var(--line);
           border-radius:10px; background:var(--soft); margin-bottom:14px; }
  .row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .lbl { font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--muted);
         font-weight:600; min-width:96px; }
  .chips { display:flex; gap:6px; flex-wrap:wrap; }
  button { font:inherit; color:var(--fg); background:var(--bg); border:1px solid var(--line);
           border-radius:7px; padding:5px 11px; cursor:pointer; }
  button:hover { border-color:var(--accent); }
  button[aria-pressed="true"] { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
  button:disabled { opacity:.5; cursor:wait; }
  input[type="range"] { flex:1; min-width:120px; accent-color:var(--accent); }
  input[type="text"] { flex:1; min-width:120px; font:inherit; color:var(--fg); background:var(--bg);
                       border:1px solid var(--line); border-radius:7px; padding:5px 9px; }
  .val { font-variant-numeric:tabular-nums; font-weight:700; min-width:30px; text-align:right; }
  .count { font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums; }
  ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:5px;
       max-height:340px; overflow-y:auto; }
  li { border:1px solid var(--line); border-radius:9px; padding:9px 11px; cursor:pointer;
       display:flex; align-items:center; gap:11px; }
  li:hover { border-color:var(--accent); }
  li[aria-selected="true"] { border-color:var(--accent); background:var(--soft); }
  .mag { font-variant-numeric:tabular-nums; font-weight:700; font-size:15px; min-width:34px;
         text-align:center; padding:1px 0; border-radius:5px; color:#fff; }
  .place { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .meta { color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .detail { margin-top:12px; border:1px solid var(--accent); border-radius:10px; padding:13px; background:var(--soft); }
  .detail h3 { margin:0 0 9px; font-size:14px; }
  dl { margin:0; display:grid; grid-template-columns:auto 1fr; gap:5px 16px; font-size:13px; }
  dt { color:var(--muted); } dd { margin:0; font-variant-numeric:tabular-nums; }
  .foot { margin-top:12px; color:var(--muted); font-size:11px; }
  a { color:var(--accent); }
  .empty { padding:22px; text-align:center; color:var(--muted); border:1px dashed var(--line); border-radius:9px; }
</style>
<script type="module">
  const api = window.openai;
  const root = document.getElementById("root");
  const saved = api?.widgetState || {};
  let ui = { minMag: saved.minMag ?? null, placeQ: saved.placeQ ?? "",
             sort: saved.sort ?? "magnitude", selectedId: saved.selectedId ?? null, busy: false };

  const magColor = (m) => m >= 6 ? "var(--m6)" : m >= 5 ? "var(--m5)" : m >= 4 ? "var(--m4)" : "var(--m3)";
  const save = () => { try { api?.setWidgetState?.({ ...ui, busy: undefined }); } catch {} };
  const fmtTime = (ms) => {
    try { return new Date(ms).toLocaleString(api?.locale || "en-US",
      { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }); } catch { return String(ms); }
  };
  const ago = (ms) => {
    const m = Math.round((Date.now() - ms) / 60000);
    return m < 60 ? m + "m ago" : m < 1440 ? Math.round(m/60) + "h ago" : Math.round(m/1440) + "d ago";
  };

  function render() {
    const data = api?.toolOutput;
    if (!data || !Array.isArray(data.items)) { root.textContent = "No earthquake data available."; return; }

    const period = data.filters?.period || "day";
    const all = data.items;
    const floor = Math.min(...all.map((i) => i.magnitude), 0);
    const ceil = Math.max(...all.map((i) => i.magnitude), 7);
    if (ui.minMag == null || ui.minMag < floor) ui.minMag = Math.floor(floor * 10) / 10;

    const q = ui.placeQ.trim().toLowerCase();
    let shown = all.filter((i) => i.magnitude >= ui.minMag)
                   .filter((i) => (q ? i.place.toLowerCase().includes(q) : true));
    shown.sort((a, b) =>
      ui.sort === "magnitude" ? b.magnitude - a.magnitude :
      ui.sort === "recent"    ? b.time - a.time :
                                (b.depthKm ?? 0) - (a.depthKm ?? 0));
    const sel = shown.find((i) => i.id === ui.selectedId);

    root.innerHTML = \`
      <h2>\${data.title}</h2>
      <div class="sub">\${data.subtitle}</div>

      <div class="panel">
        <div class="row">
          <span class="lbl">Time range</span>
          <span class="chips">
            \${[["hour","Last hour"],["day","Last 24h"],["week","Last 7 days"]].map(([k,l]) => \`
              <button data-period="\${k}" aria-pressed="\${period === k}" \${ui.busy ? "disabled" : ""}>\${l}</button>\`).join("")}
          </span>
        </div>
        <div class="row">
          <span class="lbl">Min magnitude</span>
          <input type="range" id="magslider" min="\${Math.floor(floor*10)/10}" max="\${Math.ceil(ceil*10)/10}"
                 step="0.1" value="\${ui.minMag}" aria-label="Minimum magnitude">
          <span class="val">\${Number(ui.minMag).toFixed(1)}</span>
        </div>
        <div class="row">
          <span class="lbl">Place</span>
          <input type="text" id="placeq" value="\${ui.placeQ.replace(/"/g,"&quot;")}"
                 placeholder="Filter by place, e.g. Chile" aria-label="Filter by place">
          <span class="count">\${shown.length} of \${all.length}</span>
        </div>
        <div class="row">
          <span class="lbl">Sort by</span>
          <span class="chips">
            \${[["magnitude","Magnitude"],["recent","Most recent"],["depth","Deepest"]].map(([k,l]) => \`
              <button data-sort="\${k}" aria-pressed="\${ui.sort === k}">\${l}</button>\`).join("")}
          </span>
        </div>
      </div>

      \${shown.length ? \`<ul>\${shown.map((i) => \`
        <li data-id="\${i.id}" aria-selected="\${i.id === ui.selectedId}">
          <span class="mag" style="background:\${magColor(i.magnitude)}">\${i.magnitude.toFixed(1)}</span>
          <span class="place">\${i.place}</span>
          <span class="meta">\${i.depthKm != null ? i.depthKm.toFixed(0)+" km" : "—"} · \${ago(i.time)}</span>
        </li>\`).join("")}</ul>\`
        : \`<div class="empty">No events match these filters. Lower the magnitude or widen the time range.</div>\`}

      \${sel ? \`
        <div class="detail">
          <h3>\${sel.place}</h3>
          <dl>
            <dt>Magnitude</dt><dd>\${sel.magnitude.toFixed(1)}</dd>
            <dt>Depth</dt><dd>\${sel.depthKm != null ? sel.depthKm.toFixed(1)+" km" : "—"}</dd>
            <dt>Coordinates</dt><dd>\${sel.lat?.toFixed(3)}, \${sel.lon?.toFixed(3)}</dd>
            <dt>When</dt><dd>\${fmtTime(sel.time)} (\${ago(sel.time)})</dd>
            <dt>Tsunami flag</dt><dd>\${sel.tsunami ? "Yes" : "No"}</dd>
          </dl>
          <div class="foot"><a href="\${sel.url}" target="_blank" rel="noopener">Open full USGS record →</a></div>
        </div>\` : ""}

      <div class="foot">\${data.source} · fetched \${fmtTime(Date.parse(data.fetchedAt))}</div>\`;

    // --- interacción 1: slider de magnitud (instantáneo, cliente)
    const slider = root.querySelector("#magslider");
    slider?.addEventListener("input", (e) => {
      ui.minMag = Number(e.target.value);
      root.querySelector(".val").textContent = ui.minMag.toFixed(1);
    });
    slider?.addEventListener("change", () => { save(); render(); });

    // --- interacción 2: rango temporal (va al server por MCP)
    root.querySelectorAll("[data-period]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (ui.busy || b.dataset.period === period) return;
        ui.busy = true; b.textContent = "Loading…"; b.disabled = true;
        try {
          await api?.callTool?.("get_live_data", {
            period: b.dataset.period,
            minMagnitude: data.filters?.minMagnitude ?? 2.5,
            ...(data.filters?.place ? { place: data.filters.place } : {}),
          });
          ui.minMag = null; ui.selectedId = null; save();
        } catch (err) { console.error(err); ui.busy = false; render(); }
      })
    );

    // --- interacción 3: filtro por lugar (instantáneo, cliente)
    const pq = root.querySelector("#placeq");
    pq?.addEventListener("input", (e) => {
      ui.placeQ = e.target.value;
      const pos = e.target.selectionStart;
      save(); render();
      const again = root.querySelector("#placeq");
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    });

    // --- interacción 4: orden y selección de evento
    root.querySelectorAll("[data-sort]").forEach((b) =>
      b.addEventListener("click", () => { ui.sort = b.dataset.sort; save(); render(); })
    );
    root.querySelectorAll("li[data-id]").forEach((li) =>
      li.addEventListener("click", () => {
        ui.selectedId = ui.selectedId === li.dataset.id ? null : li.dataset.id;
        save(); render();
      })
    );
  }

  render();
  window.addEventListener("openai:set_globals", () => { ui.busy = false; render(); });
</script>
`.trim();
