// Widget embebido (text/html+skybridge). Lee window.openai.toolOutput.
//
// Arquitectura de la información (de arriba hacia abajo, de general a específico):
//   1. Cabecera          — qué estoy viendo
//   2. Franja de métricas— los 4 números que resumen el conjunto
//   3. Panel de control  — cómo acoto el conjunto (vidrio translúcido)
//   4. Columna izquierda — timeline + lista de eventos (el detalle del conjunto)
//   5. Columna derecha   — dispersión profundidad×magnitud + ficha del evento elegido
//   En pantallas angostas colapsa a una sola columna.
//
// Interacciones:
//   slider de magnitud · chips de rango temporal (round-trip MCP) · filtro por lugar
//   orden · selección desde la lista, el timeline o la dispersión
export const widgetHtml = `
<div id="root"><div class="boot">Loading seismic data…</div></div>
<style>
  :root {
    --bg:#fbfbfd; --surface:255,255,255; --fg:#13171c; --muted:#6a727c; --faint:#99a1ab;
    --line:222,226,232; --accent:#1b6b8a; --accent-soft:27,107,138;
    --m2:#5b9279; --m3:#4e9460; --m4:#c7982c; --m5:#d4762f; --m6:#b8382a;
    --shadow-sm:0 1px 2px rgba(16,22,30,.055), 0 2px 8px rgba(16,22,30,.045);
    --shadow-lg:0 2px 6px rgba(16,22,30,.07), 0 14px 36px rgba(16,22,30,.11);
    --spring:cubic-bezier(.22,1,.36,1);
    --r-lg:15px; --r-md:11px; --r-sm:9px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#0e1114; --surface:28,33,39; --fg:#eef1f4; --muted:#949da7; --faint:#6b747e;
      --line:42,48,55; --accent:#64b9d8; --accent-soft:100,185,216;
      --m2:#6cbb95; --m3:#74c48a; --m4:#e0bd68; --m5:#eb9d6b; --m6:#e8766a;
      --shadow-sm:0 1px 2px rgba(0,0,0,.42); --shadow-lg:0 14px 38px rgba(0,0,0,.55);
    }
  }
  * { box-sizing:border-box; }
  body { margin:0; }
  #root {
    font:400 14px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Helvetica, Arial, sans-serif;
    background:var(--bg); color:var(--fg); padding:20px;
    -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
  }
  .boot { color:var(--muted); padding:34px; text-align:center; }

  /* ── 1. Cabecera ─────────────────────────────────────────── */
  .head { margin-bottom:14px; }
  h2 { margin:0 0 3px; font-size:21px; font-weight:600; line-height:1.12; letter-spacing:-.024em; }
  .sub { color:var(--muted); font-size:12.5px; line-height:1.4; }
  .sub b { color:var(--fg); font-weight:600; font-variant-numeric:tabular-nums; }

  /* ── 2. Franja de métricas ───────────────────────────────── */
  .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:9px; margin-bottom:13px; }
  .stat {
    padding:11px 13px; border-radius:var(--r-md); border:1px solid rgba(var(--line),.85);
    background:rgba(var(--surface),.6); backdrop-filter:blur(14px) saturate(160%);
    -webkit-backdrop-filter:blur(14px) saturate(160%); box-shadow:var(--shadow-sm);
    animation:rise .4s var(--spring) backwards;
  }
  .stat .k { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.08em;
             color:var(--faint); margin-bottom:4px; }
  .stat .v { font-size:20px; font-weight:650; line-height:1.1; letter-spacing:-.022em;
             font-variant-numeric:tabular-nums; }
  .stat .u { font-size:11.5px; color:var(--muted); margin-top:2px; overflow:hidden;
             text-overflow:ellipsis; white-space:nowrap; }

  /* ── 3. Panel de control (vidrio) ────────────────────────── */
  .panel {
    position:relative; display:grid; gap:11px 18px; grid-template-columns:repeat(auto-fit,minmax(265px,1fr));
    padding:14px 16px; margin-bottom:15px; border-radius:var(--r-lg);
    background:rgba(var(--surface),.7);
    backdrop-filter:blur(24px) saturate(185%); -webkit-backdrop-filter:blur(24px) saturate(185%);
    border:1px solid rgba(var(--line),.9); box-shadow:var(--shadow-sm);
  }
  .panel::before {
    content:""; position:absolute; inset:0 0 auto; height:1px; border-radius:var(--r-lg) var(--r-lg) 0 0;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent); pointer-events:none;
  }
  @media (prefers-color-scheme: dark) {
    .panel::before { background:linear-gradient(90deg,transparent,rgba(255,255,255,.13),transparent); }
  }
  .ctl { display:flex; align-items:center; gap:11px; min-width:0; }
  .lbl { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.08em;
         color:var(--faint); flex:none; }
  .chips { display:flex; gap:6px; flex-wrap:wrap; }
  button {
    font:inherit; font-size:13px; color:var(--fg); background:rgba(var(--surface),.92);
    border:1px solid rgba(var(--line),1); border-radius:var(--r-sm); padding:5px 12px; cursor:pointer;
    transition:transform .14s var(--spring), background-color .18s ease, border-color .18s ease, color .18s ease;
    will-change:transform; white-space:nowrap;
  }
  button:hover { border-color:rgba(var(--accent-soft),.55); }
  button:active { transform:scale(.955); transition-duration:.08s; }
  button[aria-pressed="true"] { background:var(--accent); border-color:var(--accent); color:#fff;
    font-weight:600; box-shadow:0 1px 3px rgba(var(--accent-soft),.42); }
  button:disabled { opacity:.45; cursor:progress; }
  button:focus-visible, input:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }

  input[type="range"] { flex:1; min-width:90px; -webkit-appearance:none; appearance:none;
                        height:22px; background:transparent; cursor:grab; }
  input[type="range"]:active { cursor:grabbing; }
  input[type="range"]::-webkit-slider-runnable-track { height:5px; border-radius:3px;
    background:linear-gradient(90deg,var(--accent) var(--fill,0%),rgba(var(--line),1) var(--fill,0%)); }
  input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; appearance:none;
    width:17px; height:17px; margin-top:-6px; border-radius:50%; background:#fff;
    border:1px solid rgba(16,22,30,.16); box-shadow:var(--shadow-sm);
    transition:transform .14s var(--spring); }
  input[type="range"]:active::-webkit-slider-thumb { transform:scale(1.2); }
  .val { font-variant-numeric:tabular-nums; font-weight:650; font-size:14px; min-width:27px;
         text-align:right; letter-spacing:-.01em; flex:none; }
  input[type="text"] { flex:1; min-width:0; font:inherit; font-size:13px; color:var(--fg);
    background:rgba(var(--surface),.92); border:1px solid rgba(var(--line),1);
    border-radius:var(--r-sm); padding:5px 10px; transition:border-color .18s ease; }
  input[type="text"]:hover { border-color:rgba(var(--accent-soft),.5); }
  input[type="text"]::placeholder { color:var(--faint); }

  /* ── 4-5. Rejilla de dos columnas ────────────────────────── */
  .grid { display:grid; grid-template-columns:minmax(0,1.45fr) minmax(0,1fr); gap:15px; align-items:start; }
  @media (max-width:880px) { .grid { grid-template-columns:minmax(0,1fr); } .stats { grid-template-columns:repeat(2,1fr); } }
  .col { display:flex; flex-direction:column; gap:13px; min-width:0; }
  .card {
    border-radius:var(--r-lg); border:1px solid rgba(var(--line),.85);
    background:rgba(var(--surface),.55); box-shadow:var(--shadow-sm); overflow:hidden;
  }
  .card-h { display:flex; align-items:baseline; justify-content:space-between; gap:10px;
            padding:11px 14px 9px; }
  .card-t { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:var(--faint); }
  .card-n { font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums; }

  /* Gráficos */
  .chart { padding:0 12px 10px; }
  .chart svg { display:block; width:100%; overflow:visible; }
  .dot-g { cursor:pointer; }
  .dot-g circle { transition:r .2s var(--spring), opacity .2s ease, stroke-width .2s ease; }
  .dot-g:hover circle { opacity:1; }
  .ax { stroke:rgba(var(--line),1); stroke-width:1; }
  .axlab { font-size:9px; fill:var(--faint); letter-spacing:.05em; text-transform:uppercase; }
  .gridline { stroke:rgba(var(--line),.7); stroke-width:1; stroke-dasharray:2 3; }

  /* Lista */
  .listwrap { -webkit-mask-image:linear-gradient(180deg,transparent 0,#000 9px,#000 calc(100% - 11px),transparent 100%);
              mask-image:linear-gradient(180deg,transparent 0,#000 9px,#000 calc(100% - 11px),transparent 100%); }
  ul { list-style:none; margin:0; padding:4px 10px 10px; display:flex; flex-direction:column; gap:5px;
       max-height:355px; overflow-y:auto; scrollbar-width:thin; }
  li { display:flex; align-items:center; gap:11px; padding:9px 11px; cursor:pointer;
       border:1px solid rgba(var(--line),.8); border-radius:var(--r-md);
       background:rgba(var(--surface),.75);
       transition:transform .16s var(--spring), border-color .18s ease, background-color .18s ease;
       will-change:transform; animation:rise .34s var(--spring) backwards; }
  @keyframes rise { from { opacity:0; transform:translate3d(0,7px,0); } }
  li:hover { border-color:rgba(var(--accent-soft),.5); background:rgba(var(--surface),1); }
  li:active { transform:scale(.993); transition-duration:.08s; }
  li[aria-selected="true"] { border-color:var(--accent); background:rgba(var(--accent-soft),.08);
    box-shadow:inset 0 0 0 1px rgba(var(--accent-soft),.2); }
  .mag { font-variant-numeric:tabular-nums; font-weight:680; font-size:14px; letter-spacing:-.015em;
         min-width:38px; text-align:center; padding:3px 0; border-radius:7px; color:#fff; flex:none;
         box-shadow:0 1px 2px rgba(16,22,30,.2); }
  .place { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13.5px; }
  .meta { color:var(--muted); font-size:11.5px; font-variant-numeric:tabular-nums; white-space:nowrap; flex:none; }

  /* Ficha de detalle */
  .detail {
    border-radius:var(--r-lg); padding:15px; background:rgba(var(--surface),.78);
    backdrop-filter:blur(24px) saturate(185%); -webkit-backdrop-filter:blur(24px) saturate(185%);
    border:1px solid rgba(var(--accent-soft),.42); box-shadow:var(--shadow-lg);
    animation:materialize .36s var(--spring) backwards;
  }
  @keyframes materialize { from { opacity:0; transform:scale(.97) translate3d(0,6px,0); filter:blur(6px); } }
  .detail-top { display:flex; align-items:flex-start; gap:11px; margin-bottom:12px; }
  .detail-top .mag { font-size:17px; min-width:48px; padding:6px 0; border-radius:9px; }
  .detail h3 { margin:0; font-size:14.5px; font-weight:600; letter-spacing:-.012em; line-height:1.3; }
  dl { margin:0; display:grid; grid-template-columns:auto 1fr; gap:7px 18px; font-size:13px; }
  dt { color:var(--muted); }
  dd { margin:0; font-variant-numeric:tabular-nums; }
  .ph { padding:30px 18px; text-align:center; color:var(--faint); font-size:12.5px; line-height:1.55;
        border:1px dashed rgba(var(--line),1); border-radius:var(--r-lg); }
  .empty { padding:30px; text-align:center; color:var(--muted); font-size:13px;
           border:1px dashed rgba(var(--line),1); border-radius:var(--r-md); margin:4px 10px 10px; }
  .foot { margin-top:13px; color:var(--faint); font-size:11px; }
  .detail .foot { margin-top:12px; }
  a { color:var(--accent); text-decoration:none; font-weight:500; }
  a:hover { text-decoration:underline; }

  /* ── Preferencias del sistema ────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    *, *::before { animation-duration:.01ms !important; animation-iteration-count:1 !important;
                   transition-duration:.12s !important; }
    li, .stat { animation:none; }
    .detail { animation:fade .16s ease backwards; }
    @keyframes fade { from { opacity:0; } }
    button:active, li:active { transform:none; }
  }
  @media (prefers-reduced-transparency: reduce) {
    .panel, .detail, .stat { background:rgba(var(--surface),1); backdrop-filter:none; -webkit-backdrop-filter:none; }
    .panel::before { display:none; }
  }
  @media (prefers-contrast: more) {
    .panel, .detail, .stat, .card, li { background:rgba(var(--surface),1); backdrop-filter:none; }
    .panel, .card, li, button, input[type="text"] { border-color:var(--fg); }
    .sub, .meta, .lbl, .card-t, .card-n, .foot, .stat .k, .stat .u { color:var(--fg); }
  }
</style>
<script type="module">
  const api = window.openai;
  const root = document.getElementById("root");
  const saved = (api && api.widgetState) || {};
  let ui = { minMag: saved.minMag ?? null, placeQ: saved.placeQ ?? "", sort: saved.sort ?? "magnitude",
             selectedId: saved.selectedId ?? null, busy: false };

  const magVar = (m) => m >= 6 ? "--m6" : m >= 5 ? "--m5" : m >= 4 ? "--m4" : m >= 3 ? "--m3" : "--m2";
  const save = () => { try { api?.setWidgetState?.({ ...ui, busy: undefined }); } catch {} };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  const fmtTime = (ms) => { try { return new Date(ms).toLocaleString(api?.locale || "en-US",
    { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }); } catch { return String(ms); } };
  const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000);
    return m < 1 ? "just now" : m < 60 ? m + "m ago" : m < 1440 ? Math.round(m/60) + "h ago" : Math.round(m/1440) + "d ago"; };
  const shortPlace = (p) => String(p).replace(/^\\d+\\s*km\\s+[NSEW]{1,3}\\s+of\\s+/i, "");

  /* Timeline: magnitud (Y) contra tiempo (X) */
  function timelineChart(items, selId) {
    if (items.length < 2) return "";
    const W = 100, H = 46, padX = 3, padT = 5, padB = 11;
    const ts = items.map((i) => i.time), t0 = Math.min(...ts), t1 = Math.max(...ts);
    const span = Math.max(t1 - t0, 1);
    const ms = items.map((i) => i.magnitude), mLo = Math.min(...ms), mHi = Math.max(...ms);
    const mSpan = Math.max(mHi - mLo, .1);
    const dots = items.map((i) => {
      const x = padX + ((i.time - t0) / span) * (W - padX * 2);
      const y = padT + (1 - (i.magnitude - mLo) / mSpan) * (H - padT - padB);
      const s = i.id === selId;
      return \`<g class="dot-g" data-pick="\${i.id}"><circle cx="\${x.toFixed(2)}" cy="\${y.toFixed(2)}"
        r="\${s ? 4.6 : 2.7}" fill="var(\${magVar(i.magnitude)})" opacity="\${s ? 1 : .68}"
        stroke="\${s ? "var(--accent)" : "none"}" stroke-width="\${s ? 1.5 : 0}"
        vector-effect="non-scaling-stroke"></circle></g>\`;
    }).join("");
    return \`<div class="chart"><svg viewBox="0 0 \${W} \${H}" preserveAspectRatio="none" style="height:76px"
        role="img" aria-label="Magnitude over time">
      <line class="ax" x1="\${padX}" y1="\${H-padB+1}" x2="\${W-padX}" y2="\${H-padB+1}" vector-effect="non-scaling-stroke"></line>
      \${dots}
    </svg>
    <div class="card-h" style="padding:2px 2px 0"><span class="card-n">\${fmtTime(t0)}</span>
      <span class="card-n">\${fmtTime(t1)}</span></div></div>\`;
  }

  /* Dispersión: profundidad (X) contra magnitud (Y) — los superficiales fuertes son los peligrosos */
  function depthChart(items, selId) {
    if (items.length < 2) return "";
    const W = 100, H = 58, padL = 4, padR = 4, padT = 6, padB = 13;
    const ds = items.map((i) => i.depthKm ?? 0), dHi = Math.max(...ds, 10);
    const ms = items.map((i) => i.magnitude), mLo = Math.min(...ms), mHi = Math.max(...ms);
    const mSpan = Math.max(mHi - mLo, .1);
    const gridlines = [.25, .5, .75].map((f) => {
      const x = padL + f * (W - padL - padR);
      return \`<line class="gridline" x1="\${x}" y1="\${padT}" x2="\${x}" y2="\${H-padB}" vector-effect="non-scaling-stroke"></line>\`;
    }).join("");
    const dots = items.map((i) => {
      const x = padL + ((i.depthKm ?? 0) / dHi) * (W - padL - padR);
      const y = padT + (1 - (i.magnitude - mLo) / mSpan) * (H - padT - padB);
      const s = i.id === selId;
      return \`<g class="dot-g" data-pick="\${i.id}"><circle cx="\${x.toFixed(2)}" cy="\${y.toFixed(2)}"
        r="\${s ? 4.4 : 2.6}" fill="var(\${magVar(i.magnitude)})" opacity="\${s ? 1 : .66}"
        stroke="\${s ? "var(--accent)" : "none"}" stroke-width="\${s ? 1.5 : 0}"
        vector-effect="non-scaling-stroke"></circle></g>\`;
    }).join("");
    return \`<div class="chart"><svg viewBox="0 0 \${W} \${H}" preserveAspectRatio="none" style="height:116px"
        role="img" aria-label="Magnitude against depth">
      \${gridlines}
      <line class="ax" x1="\${padL}" y1="\${H-padB}" x2="\${W-padR}" y2="\${H-padB}" vector-effect="non-scaling-stroke"></line>
      \${dots}
    </svg>
    <div class="card-h" style="padding:2px 2px 0"><span class="card-n">0 km</span>
      <span class="card-n">depth →</span><span class="card-n">\${dHi.toFixed(0)} km</span></div></div>\`;
  }

  function render() {
    const data = api?.toolOutput;
    if (!data || !Array.isArray(data.items)) { root.innerHTML = '<div class="boot">No earthquake data available.</div>'; return; }

    const period = data.filters?.period || "day";
    const all = data.items;
    const floor = all.length ? Math.min(...all.map((i) => i.magnitude)) : 0;
    const ceil  = all.length ? Math.max(...all.map((i) => i.magnitude)) : 7;
    const lo = Math.floor(floor * 10) / 10, hi = Math.max(Math.ceil(ceil * 10) / 10, lo + .1);
    if (ui.minMag == null || ui.minMag < lo || ui.minMag > hi) ui.minMag = lo;

    const q = ui.placeQ.trim().toLowerCase();
    const shown = all.filter((i) => i.magnitude >= ui.minMag)
                     .filter((i) => (q ? i.place.toLowerCase().includes(q) : true))
                     .sort((a,b) => ui.sort === "magnitude" ? b.magnitude - a.magnitude
                                  : ui.sort === "recent"    ? b.time - a.time
                                  :                           (b.depthKm ?? 0) - (a.depthKm ?? 0));
    const sel = shown.find((i) => i.id === ui.selectedId);
    const fillPct = (((ui.minMag - lo) / (hi - lo)) * 100).toFixed(1);

    const strongest = shown.length ? shown.reduce((a,b) => b.magnitude > a.magnitude ? b : a) : null;
    const shallowest = shown.filter((i) => i.depthKm != null);
    const shallow = shallowest.length ? shallowest.reduce((a,b) => b.depthKm < a.depthKm ? b : a) : null;
    const latest = shown.length ? shown.reduce((a,b) => b.time > a.time ? b : a) : null;

    root.innerHTML = \`
      <div class="head">
        <h2>\${esc(data.title)}</h2>
        <div class="sub">\${esc(data.subtitle)}</div>
      </div>

      <div class="stats">
        <div class="stat" style="animation-delay:0ms">
          <div class="k">Events shown</div><div class="v">\${shown.length}</div>
          <div class="u">of \${all.length} retrieved</div></div>
        <div class="stat" style="animation-delay:40ms">
          <div class="k">Strongest</div>
          <div class="v" style="color:var(\${strongest ? magVar(strongest.magnitude) : "--fg"})">\${strongest ? "M " + strongest.magnitude.toFixed(1) : "—"}</div>
          <div class="u">\${strongest ? esc(shortPlace(strongest.place)) : "no events"}</div></div>
        <div class="stat" style="animation-delay:80ms">
          <div class="k">Shallowest</div><div class="v">\${shallow ? shallow.depthKm.toFixed(0) + " km" : "—"}</div>
          <div class="u">\${shallow ? "M " + shallow.magnitude.toFixed(1) + " · " + esc(shortPlace(shallow.place)) : "—"}</div></div>
        <div class="stat" style="animation-delay:120ms">
          <div class="k">Most recent</div><div class="v">\${latest ? ago(latest.time) : "—"}</div>
          <div class="u">\${latest ? "M " + latest.magnitude.toFixed(1) + " · " + esc(shortPlace(latest.place)) : "—"}</div></div>
      </div>

      <div class="panel">
        <div class="ctl"><span class="lbl">Range</span>
          <span class="chips">\${[["hour","Hour"],["day","24h"],["week","7 days"]].map(([k,l]) => \`
            <button data-period="\${k}" aria-pressed="\${period === k}" \${ui.busy ? "disabled" : ""}>\${l}</button>\`).join("")}</span>
        </div>
        <div class="ctl"><span class="lbl">Min mag</span>
          <input type="range" id="magslider" min="\${lo}" max="\${hi}" step="0.1" value="\${ui.minMag}"
                 style="--fill:\${fillPct}%" aria-label="Minimum magnitude">
          <span class="val" id="magval">\${Number(ui.minMag).toFixed(1)}</span>
        </div>
        <div class="ctl"><span class="lbl">Place</span>
          <input type="text" id="placeq" value="\${esc(ui.placeQ)}" placeholder="Chile, Alaska, Japan…" aria-label="Filter by place">
        </div>
        <div class="ctl"><span class="lbl">Sort</span>
          <span class="chips">\${[["magnitude","Magnitude"],["recent","Recent"],["depth","Depth"]].map(([k,l]) => \`
            <button data-sort="\${k}" aria-pressed="\${ui.sort === k}">\${l}</button>\`).join("")}</span>
        </div>
      </div>

      <div class="grid">
        <div class="col">
          \${shown.length > 1 ? \`<div class="card">
            <div class="card-h"><span class="card-t">Magnitude over time</span>
              <span class="card-n">\${shown.length} events</span></div>
            \${timelineChart(shown, ui.selectedId)}</div>\` : ""}
          <div class="card">
            <div class="card-h"><span class="card-t">Events</span>
              <span class="card-n">sorted by \${ui.sort}</span></div>
            \${shown.length ? \`<div class="listwrap"><ul>\${shown.map((i,n) => \`
              <li data-pick="\${i.id}" aria-selected="\${i.id === ui.selectedId}" tabindex="0"
                  style="animation-delay:\${Math.min(n*15,240)}ms">
                <span class="mag" style="background:var(\${magVar(i.magnitude)})">\${i.magnitude.toFixed(1)}</span>
                <span class="place">\${esc(i.place)}</span>
                <span class="meta">\${i.depthKm != null ? i.depthKm.toFixed(0) + " km" : "—"} · \${ago(i.time)}</span>
              </li>\`).join("")}</ul></div>\`
              : \`<div class="empty">No events match these filters.<br>Lower the magnitude or widen the range.</div>\`}
          </div>
        </div>

        <div class="col">
          \${shown.length > 1 ? \`<div class="card">
            <div class="card-h"><span class="card-t">Depth vs magnitude</span>
              <span class="card-n">shallow = left</span></div>
            \${depthChart(shown, ui.selectedId)}</div>\` : ""}
          \${sel ? \`
            <div class="detail">
              <div class="detail-top">
                <span class="mag" style="background:var(\${magVar(sel.magnitude)})">\${sel.magnitude.toFixed(1)}</span>
                <h3>\${esc(sel.place)}</h3>
              </div>
              <dl>
                <dt>Depth</dt><dd>\${sel.depthKm != null ? sel.depthKm.toFixed(1) + " km" : "—"}</dd>
                <dt>Coordinates</dt><dd>\${sel.lat?.toFixed(3)}, \${sel.lon?.toFixed(3)}</dd>
                <dt>When</dt><dd>\${fmtTime(sel.time)} · \${ago(sel.time)}</dd>
                <dt>Tsunami flag</dt><dd>\${sel.tsunami ? "Yes" : "No"}</dd>
              </dl>
              <div class="foot"><a href="\${esc(sel.url)}" target="_blank" rel="noopener">Open full USGS record →</a></div>
            </div>\`
            : \`<div class="ph">Select an event — in the list or either chart — to see its depth, coordinates and USGS record.</div>\`}
        </div>
      </div>

      <div class="foot">\${esc(data.source)} · fetched \${fmtTime(Date.parse(data.fetchedAt))}</div>\`;

    wire(data, period, lo, hi);
  }

  function wire(data, period, lo, hi) {
    const slider = root.querySelector("#magslider"), magval = root.querySelector("#magval");
    slider?.addEventListener("input", (e) => {
      ui.minMag = Number(e.target.value);
      magval.textContent = ui.minMag.toFixed(1);
      e.target.style.setProperty("--fill", (((ui.minMag - lo) / (hi - lo)) * 100).toFixed(1) + "%");
      const q = ui.placeQ.trim().toLowerCase();
      const n = data.items.filter((i) => i.magnitude >= ui.minMag)
                          .filter((i) => (q ? i.place.toLowerCase().includes(q) : true)).length;
      const v = root.querySelector(".stats .stat .v");
      if (v) v.textContent = n;
    });
    slider?.addEventListener("change", () => { save(); render(); });

    root.querySelectorAll("[data-period]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (ui.busy || b.dataset.period === period) return;
        ui.busy = true;
        root.querySelectorAll("[data-period]").forEach((x) => (x.disabled = true));
        b.textContent = "…";
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

    const pq = root.querySelector("#placeq");
    pq?.addEventListener("input", (e) => {
      const pos = e.target.selectionStart;
      ui.placeQ = e.target.value; save(); render();
      const again = root.querySelector("#placeq");
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    });

    root.querySelectorAll("[data-sort]").forEach((b) =>
      b.addEventListener("click", () => { ui.sort = b.dataset.sort; save(); render(); })
    );

    // Selección unificada: lista, timeline y dispersión comparten data-pick
    root.querySelectorAll("[data-pick]").forEach((el) => {
      const pick = () => { ui.selectedId = ui.selectedId === el.dataset.pick ? null : el.dataset.pick;
                           save(); render(); };
      el.addEventListener("click", pick);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
      });
    });
  }

  render();
  window.addEventListener("openai:set_globals", () => { ui.busy = false; render(); });
</script>
`.trim();
