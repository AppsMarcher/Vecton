(function attachVectonComercialMapa(window) {
  // Relatorio "Mapa de Vendas" — distribuicao do FATURADO de maquinas
  // (Grao/Pecuaria) por estado (calor) e por cidade (bolhas), consumindo a RPC
  // comercial_mapa_vendas. Geografia: window.VECTON_BR_GEO (estados) + a RPC
  // devolve lat/long por municipio. Classes cvm-.
  function createComercialMapaModule(deps) {
    const { escapeHtml, state, resolveOrganizationId, callSupabaseRpc, isSupabaseConfigured } = deps;

    const REPORT_ID = "comercialMapa";
    const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const REGIOES = {
      AC:"Norte", AP:"Norte", AM:"Norte", PA:"Norte", RO:"Norte", RR:"Norte", TO:"Norte",
      AL:"Nordeste", BA:"Nordeste", CE:"Nordeste", MA:"Nordeste", PB:"Nordeste", PE:"Nordeste", PI:"Nordeste", RN:"Nordeste", SE:"Nordeste",
      DF:"Centro-Oeste", GO:"Centro-Oeste", MT:"Centro-Oeste", MS:"Centro-Oeste",
      ES:"Sudeste", MG:"Sudeste", RJ:"Sudeste", SP:"Sudeste",
      PR:"Sul", RS:"Sul", SC:"Sul"
    };

    const BR = window.VECTON_BR_GEO || { bbox: [-74, -34, -32, 6], states: [] };
    const [minx, miny, maxx, maxy] = BR.bbox;
    const midlat = (miny + maxy) / 2, kx = Math.cos(midlat * Math.PI / 180);
    const gW = (maxx - minx) * kx, gH = (maxy - miny);
    const VW = 1000, VH = Math.round(VW * gH / gW);
    const proj = (lo, la) => [(lo - minx) * kx / gW * VW, (maxy - la) / gH * VH];

    const STOPS = ["#101a2e", "#26408f", "#3f63d6"];
    const GRAO = "#63b3ff", PEC = "#f59e0b", BLUE = "#3f63d6";

    let period = "ytd";
    let month = Number(state.currentPeriod?.month || 6);
    let year = Number(state.currentPeriod?.year || 2026);
    let layer = "ambos";       // ambos | grao | pec
    let metric = "val";        // val (R$) | qtd (nº de maquinas)
    const ZOOM_MIN = 0.3, ZOOM_MAX = 8, ZOOM_START = 0.9; // regua: <1 afasta, >1 aproxima
    let zoomUF = null;         // estado em drill (clique)
    let zoom = ZOOM_START;     // fator da regua de zoom
    let panX = 0, panY = 0;    // deslocamento do centro (unidades do viewBox)
    let highlight = null;      // {type:'region'|'uf', key} destacado a partir da lateral
    let hostContainer = null;  // ultimo container renderizado (p/ reset via clique fora)
    let docResetBound = false;
    let cityRows = [];
    let loadedKey = null;
    let loading = false;

    // ---------------------------------------------------------------- css
    function ensureStyle() {
      if (document.getElementById("cvm-style")) return;
      const s = document.createElement("style");
      s.id = "cvm-style";
      s.textContent = `
        .cvm { --bg:#0a0c10; --panel:#12151b; --panel2:#171b22; --line:#232a34; --ink:#eef1f6; --soft:#a2a9b5; --faint:#6b7280; color:var(--ink); }
        .cvm * { box-sizing:border-box; }
        .cvm-head { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; flex-wrap:wrap; margin-bottom:16px; }
        .cvm-kick { font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--faint); margin:0 0 4px; }
        .cvm-h1 { font-size:20px; font-weight:600; margin:0; }
        .cvm-sub { color:var(--soft); font-size:12.5px; margin:5px 0 0; }
        .cvm-ctrls { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .cvm-seg { display:flex; gap:2px; background:var(--panel2); border:1px solid var(--line); border-radius:10px; padding:3px; }
        .cvm-seg button { border:none; background:transparent; color:var(--soft); font:inherit; font-size:12.5px; font-weight:500; padding:6px 13px; border-radius:7px; cursor:pointer; }
        .cvm-seg button.on { background:#222834; color:#fff; }
        .cvm-seg.lay button.on[data-l="grao"] { background:rgba(99,179,255,.22); color:#bcd8ff; }
        .cvm-seg.lay button.on[data-l="pec"] { background:rgba(245,158,11,.20); color:#f6c67a; }
        .cvm-layout { display:grid; grid-template-columns:1fr 288px; gap:16px; }
        @media (max-width:1000px){ .cvm-layout{ grid-template-columns:1fr; } }
        .cvm-card { background:var(--panel); border:1px solid var(--line); border-radius:16px; }
        .cvm-mapcard { padding:8px; position:relative; overflow:hidden; background:transparent; border:none; }
        .cvm-mapcard svg { display:block; width:100%; height:auto; }
        .cvm-state { stroke:#0a0c10; stroke-width:.6; cursor:pointer; transition:opacity .12s; }
        .cvm-state:hover { opacity:.82; }
        .cvm-bub { cursor:pointer; }
        .cvm-halo { pointer-events:none; }
        .cvm-lbl { fill:#cfd6e0; paint-order:stroke; stroke:#0a0c10; stroke-width:2.4px; font-weight:600; pointer-events:none; }
        .cvm-back { position:absolute; top:14px; left:14px; z-index:5; background:#171b22; border:1px solid var(--line); color:var(--ink); font:inherit; font-size:12px; font-weight:500; padding:6px 12px; border-radius:9px; cursor:pointer; }
        .cvm-back:hover { background:#222834; }
        .cvm-zoom { position:absolute; top:50%; left:14px; transform:translateY(-50%); z-index:6; display:flex; flex-direction:column; align-items:center; gap:7px; background:rgba(23,27,34,.82); border:1px solid var(--line); border-radius:12px; padding:9px 6px; backdrop-filter:blur(4px); }
        .cvm-zoom button { width:24px; height:24px; border:none; border-radius:7px; background:#222834; color:var(--ink); font-size:15px; line-height:1; cursor:pointer; padding:0; }
        .cvm-zoom button:hover { background:#2c333f; }
        .cvm-zoom input[type=range] { writing-mode:vertical-lr; direction:rtl; -webkit-appearance:slider-vertical; width:6px; height:120px; accent-color:#3f63d6; cursor:pointer; }
        .cvm-zpct { font-size:9px; color:var(--faint); font-variant-numeric:tabular-nums; }
        .cvm-side { display:flex; flex-direction:column; gap:14px; }
        .cvm-kpis { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
        .cvm-kpi { background:var(--panel2); border:1px solid var(--line); border-radius:12px; padding:11px 8px; text-align:center; }
        .cvm-kpi .l { font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--faint); }
        .cvm-kpi .v { font-size:15px; font-weight:600; margin-top:3px; font-variant-numeric:tabular-nums; white-space:nowrap; }
        .cvm-kpi .v small { font-size:10.5px; color:var(--faint); font-weight:500; }
        .cvm-panel { padding:15px 16px; }
        .cvm-panel h3 { margin:0 0 12px; font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--faint); font-weight:600; }
        .cvm-row { display:grid; grid-template-columns:24px 1fr auto; gap:9px; align-items:center; margin-bottom:9px; font-size:12.5px; }
        .cvm-row .rk { color:var(--faint); font-variant-numeric:tabular-nums; font-size:11px; }
        .cvm-row .nm { color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cvm-row .nm .uf { color:var(--faint); font-size:11px; }
        .cvm-row .val { color:var(--soft); font-variant-numeric:tabular-nums; }
        .cvm-bar { grid-column:2/4; height:5px; border-radius:99px; background:#1c222c; overflow:hidden; display:flex; margin-top:-3px; }
        .cvm-bar i { height:100%; display:block; }
        .cvm-legend { display:flex; flex-direction:column; gap:11px; }
        .cvm-lg { display:flex; align-items:center; gap:9px; font-size:12px; color:var(--soft); }
        .cvm-dot { width:11px; height:11px; border-radius:50%; flex:none; }
        .cvm-scale { height:9px; border-radius:99px; flex:1; background:linear-gradient(90deg,#101a2e,#26408f,#3f63d6); }
        .cvm-tt { position:fixed; pointer-events:none; z-index:9700; background:#0e1116; border:1px solid var(--line); border-radius:9px; padding:8px 11px; font-size:12px; box-shadow:0 12px 34px rgba(0,0,0,.6); max-width:240px; color:var(--ink); }
        .cvm-tt .t { font-weight:600; margin-bottom:3px; }
        .cvm-tt .m { color:var(--soft); font-variant-numeric:tabular-nums; }
        .cvm-note { font-size:10.5px; color:var(--faint); padding:0 8px 6px; }
        .cvm-clk { cursor:pointer; border-radius:7px; padding:3px 5px; margin-left:-5px; margin-right:-5px; transition:background .12s; }
        .cvm-clk:hover { background:#1c222c; }
        .cvm-clk.on { background:rgba(63,99,214,.18); }
        .cvm-state.cvm-dim { opacity:.22; }
        .cvm-state.cvm-hi { stroke:#fff; stroke-width:1.4; }
        .cvm-bub.cvm-dim { opacity:.12; }
        .cvm-empty { padding:40px; text-align:center; color:var(--faint); }
      `;
      document.head.appendChild(s);
    }

    // ---------------------------------------------------------------- data
    function paramsKey() { return `${year}|${month}|${period}`; }

    async function loadData() {
      loading = true; cityRows = [];
      if (isSupabaseConfigured()) {
        const org = await resolveOrganizationId();
        cityRows = await callSupabaseRpc("comercial_mapa_vendas", {
          p_org: org, p_year: year, p_month: month, p_period: period
        }) || [];
      }
      loadedKey = paramsKey(); loading = false;
    }

    // ---------------------------------------------------------------- helpers
    function nf(v) { return Math.round(v || 0).toLocaleString("pt-BR"); }
    function fmtMil(v) { return "R$ " + nf((v || 0) / 1000) + " mil"; }
    function fmtQtd(v) { return nf(v) + " un"; }
    function fmtVal(v) { return metric === "qtd" ? fmtQtd(v) : fmtMil(v); }
    function lval(g, p) { return layer === "grao" ? g : layer === "pec" ? p : (g + p); }
    function lerp(a, b, t) {
      const ah = a.match(/\w\w/g).map((h) => parseInt(h, 16));
      const bh = b.match(/\w\w/g).map((h) => parseInt(h, 16));
      return "#" + ah.map((v, i) => Math.round(v + (bh[i] - v) * t).toString(16).padStart(2, "0")).join("");
    }
    function heat(v, maxUF) {
      if (!v || maxUF <= 0) return "#141922";
      const t = Math.sqrt(Math.min(1, v / maxUF));
      const s = t * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(s));
      return lerp(STOPS[i], STOPS[i + 1], s - i);
    }
    function statePath(rings) {
      return rings.map((r) => "M" + r.map(([lo, la]) => { const [x, y] = proj(lo, la); return x.toFixed(1) + "," + y.toFixed(1); }).join("L") + "Z").join(" ");
    }
    function stateBBox(uf) {
      const st = BR.states.find((s) => s.uf === uf); if (!st) return [0, 0, VW, VH];
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      st.rings.forEach((r) => r.forEach(([lo, la]) => { const [x, y] = proj(lo, la); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }));
      const pw = (x1 - x0) * 0.10, ph = (y1 - y0) * 0.10;
      return [x0 - pw, y0 - ph, (x1 - x0) + 2 * pw, (y1 - y0) + 2 * ph];
    }
    function wedge(cx, cy, r, a0, a1) {
      const x0 = cx + r * Math.sin(a0), y0 = cy - r * Math.cos(a0), x1 = cx + r * Math.sin(a1), y1 = cy - r * Math.cos(a1), la = (a1 - a0) > Math.PI ? 1 : 0;
      return `M${cx.toFixed(1)},${cy.toFixed(1)} L${x0.toFixed(1)},${y0.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 ${la} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`;
    }

    function derive() {
      const uf = {}; const cities = [];
      cityRows.forEach((r) => {
        const g = metric === "qtd" ? (Number(r.grao_qtd) || 0) : (Number(r.grao_val) || 0);
        const p = metric === "qtd" ? (Number(r.pec_qtd) || 0) : (Number(r.pec_val) || 0);
        if (r.uf) { (uf[r.uf] = uf[r.uf] || { g: 0, p: 0 }); uf[r.uf].g += g; uf[r.uf].p += p; }
        if (r.lat != null && r.lng != null) cities.push({ nome: r.municipio || "", uf: r.uf || "", lat: Number(r.lat), lng: Number(r.lng), grao: g, pec: p });
      });
      return { uf, cities };
    }

    function bubblesSvg(cities, vbw, withLabels) {
      const maxCity = Math.max(1, ...cities.map((c) => lval(c.grao, c.pec)));
      const rBase = vbw * 0.006, rSpan = vbw * 0.028, fs = vbw * (withLabels ? 0.013 : 0.021);
      return cities.slice().sort((a, b) => lval(b.grao, b.pec) - lval(a.grao, a.pec)).map((c) => {
        const [cx, cy] = proj(c.lng, c.lat);
        const gg = layer === "pec" ? 0 : c.grao, pp = layer === "grao" ? 0 : c.pec, t2 = gg + pp;
        if (t2 <= 0) return "";
        const rr = rBase + rSpan * Math.sqrt(t2 / maxCity);
        let paths;
        if (gg > 0 && pp > 0) {
          const gAng = 2 * Math.PI * (gg / t2);
          paths = `<path d="${wedge(cx, cy, rr, 0, gAng)}" fill="${GRAO}"/><path d="${wedge(cx, cy, rr, gAng, 2 * Math.PI)}" fill="${PEC}"/>`;
        } else if (gg > 0) {
          paths = `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}" fill="${GRAO}"/>`;
        } else {
          paths = `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}" fill="${PEC}"/>`;
        }
        const label = withLabels ? `<text class="cvm-lbl" x="${(cx + rr + 3).toFixed(1)}" y="${(cy + fs * 0.35).toFixed(1)}" font-size="${fs.toFixed(1)}">${escapeHtml(c.nome)}</text>` : "";
        return `<circle class="cvm-halo" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(rr * 2.2).toFixed(1)}" fill="url(#cvm-halo)"/>`
          + `<g class="cvm-bub" opacity="0.94" data-nm="${escapeHtml(c.nome)}" data-uf="${escapeHtml(c.uf)}" data-g="${c.grao}" data-p="${c.pec}">${paths}`
          + `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="${(vbw * 0.0012).toFixed(2)}"/></g>${label}`;
      }).join("");
    }

    // viewBox base (Brasil inteiro ou estado em drill) + zoom continuo da regua
    function baseBBox() { return zoomUF ? stateBBox(zoomUF) : [0, 0, VW, VH]; }
    function currentViewBox() {
      const [bx, by, bw, bh] = baseBBox();
      const w = bw / zoom, h = bh / zoom;
      const maxX = Math.max(0, (bw - w) / 2), maxY = Math.max(0, (bh - h) / 2);
      panX = Math.max(-maxX, Math.min(maxX, panX));
      panY = Math.max(-maxY, Math.min(maxY, panY));
      const cx = bx + bw / 2 + panX, cy = by + bh / 2 + panY;
      return [cx - w / 2, cy - h / 2, w, h];
    }
    function applyViewBox(container) {
      const svg = container.querySelector("#cvm-map svg"); if (!svg) return;
      svg.setAttribute("viewBox", currentViewBox().map((n) => n.toFixed(1)).join(" "));
      const pct = container.querySelector("#cvm-zpct"); if (pct) pct.textContent = Math.round(zoom * 100) + "%";
      const rng = container.querySelector("#cvm-zrange"); if (rng && parseFloat(rng.value) !== zoom) rng.value = zoom;
      const map = container.querySelector("#cvm-map"); if (map) map.style.cursor = zoom > 1 ? "grab" : "";
    }

    function mapSvg(ufVal, cities) {
      const maxUF = Math.max(0, ...Object.values(ufVal));
      const states = BR.states.map((st) => `<path class="cvm-state" d="${statePath(st.rings)}" fill="${heat(ufVal[st.uf] || 0, maxUF)}" data-uf="${st.uf}" data-nm="${escapeHtml(st.nome)}"/>`).join("");
      const bb = baseBBox();
      const vb = currentViewBox();
      const subset = zoomUF ? cities.filter((c) => c.uf === zoomUF) : cities;
      return `<svg viewBox="${vb.map((n) => n.toFixed(1)).join(" ")}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mapa de vendas do Brasil">
        <defs><radialGradient id="cvm-halo"><stop offset="0%" stop-color="#4f7cff" stop-opacity="0.5"/><stop offset="60%" stop-color="#4f7cff" stop-opacity="0.12"/><stop offset="100%" stop-color="#4f7cff" stop-opacity="0"/></radialGradient></defs>
        <g>${states}</g><g id="cvm-bub-g">${bubblesSvg(subset, bb[2], !!zoomUF)}</g></svg>`;
    }

    // ---------------------------------------------------------------- render
    function render(container) {
      ensureStyle();
      hostContainer = container;
      container.innerHTML = `
        <div class="cvm">
          <div class="cvm-head">
            <div>
              <p class="cvm-kick">Comercial · Máquinas</p>
              <h1 class="cvm-h1">Mapa de Vendas — ${escapeHtml(MONTHS[month - 1])}/${year}</h1>
              <p class="cvm-sub">Faturado por estado (calor) e por cidade (bolhas) · Grão vs. Pecuária</p>
            </div>
            <div class="cvm-ctrls">
              <div class="cvm-seg lay" id="cvm-layer">
                <button data-l="ambos"${layer === "ambos" ? ' class="on"' : ""}>Ambos</button>
                <button data-l="grao"${layer === "grao" ? ' class="on"' : ""}>Grão</button>
                <button data-l="pec"${layer === "pec" ? ' class="on"' : ""}>Pecuária</button>
              </div>
              <div class="cvm-seg" id="cvm-metric">
                <button data-m="val"${metric === "val" ? ' class="on"' : ""}>R$</button>
                <button data-m="qtd"${metric === "qtd" ? ' class="on"' : ""}>Qtd</button>
              </div>
              <div class="cvm-seg" id="cvm-seg">
                <button data-p="mes"${period === "mes" ? ' class="on"' : ""}>Mês</button>
                <button data-p="ytd"${period === "ytd" ? ' class="on"' : ""}>YTD</button>
                <button data-p="fy"${period === "fy" ? ' class="on"' : ""}>Ano</button>
              </div>
            </div>
          </div>
          <div class="cvm-layout">
            <div class="cvm-card cvm-mapcard"><button class="cvm-back" id="cvm-back" hidden>← Brasil</button><div class="cvm-zoom" id="cvm-zoom"><button data-z="in" title="Aproximar">+</button><input type="range" id="cvm-zrange" min="0.3" max="8" step="0.1" value="0.9" aria-label="Zoom do mapa"><button data-z="out" title="Afastar">−</button><span class="cvm-zpct" id="cvm-zpct">90%</span></div><div id="cvm-map"></div><div class="cvm-note" id="cvm-note"></div></div>
            <aside class="cvm-side" id="cvm-side"></aside>
          </div>
        </div>`;
      bind(container);
      const map = container.querySelector("#cvm-map");
      if (loading) { map.innerHTML = `<div class="cvm-empty">Carregando…</div>`; return; }
      if (!cityRows.length) { map.innerHTML = `<div class="cvm-empty">Sem vendas de máquinas no período. Suba uma carga de vendas realizadas.</div>`; return; }
      paint(container);
    }

    function paint(container) {
      const map = container.querySelector("#cvm-map"); if (!map) return;
      const { uf, cities } = derive();
      const ufVal = {}; Object.entries(uf).forEach(([k, v]) => { ufVal[k] = lval(v.g, v.p); });
      map.innerHTML = mapSvg(ufVal, cities);
      renderSide(container, uf, cities);
      renderBack(container);
      wireHover(container, ufVal);
      wireStateClick(container);
      wireSideHl(container);
      applyViewBox(container);
      applyHighlight(container);
    }

    // destaque: clicar numa regiao/estado da lateral realca os estados no mapa
    function ufsFor(hl) {
      if (!hl) return null;
      if (hl.type === "uf") return new Set([hl.key]);
      return new Set(Object.keys(REGIOES).filter((u) => REGIOES[u] === hl.key));
    }
    function applyHighlight(container) {
      const hs = ufsFor(highlight);
      container.querySelectorAll(".cvm-state").forEach((el) => {
        el.classList.toggle("cvm-dim", !!hs && !hs.has(el.dataset.uf));
        el.classList.toggle("cvm-hi", !!hs && hs.has(el.dataset.uf));
      });
      container.querySelectorAll(".cvm-bub").forEach((el) => {
        el.classList.toggle("cvm-dim", !!hs && !hs.has(el.dataset.uf));
      });
      container.querySelectorAll("#cvm-side .cvm-clk").forEach((el) => {
        el.classList.toggle("on", !!highlight && el.dataset.hlt === highlight.type && el.dataset.hlk === highlight.key);
      });
    }
    function wireSideHl(container) {
      container.querySelectorAll("#cvm-side .cvm-clk").forEach((el) => {
        el.addEventListener("click", () => {
          const t = el.dataset.hlt, k = el.dataset.hlk;
          highlight = (highlight && highlight.type === t && highlight.key === k) ? null : { type: t, key: k };
          applyHighlight(container);
        });
      });
    }

    function renderBack(container) {
      const b = container.querySelector("#cvm-back");
      if (!b) return;
      if (zoomUF) { const st = BR.states.find((s) => s.uf === zoomUF); b.hidden = false; b.textContent = "← Brasil · saindo de " + (st ? st.nome : zoomUF); }
      else b.hidden = true;
    }

    function renderSide(container, uf, cities) {
      const totG = Object.values(uf).reduce((a, v) => a + v.g, 0);
      const totP = Object.values(uf).reduce((a, v) => a + v.p, 0);
      const fatFilt = Object.values(uf).reduce((a, v) => a + lval(v.g, v.p), 0);
      const nCidades = cities.filter((c) => lval(c.grao, c.pec) > 0).length;
      const totMix = totG + totP;
      const gpct = totMix > 0 ? Math.round(100 * totG / totMix) : 0;

      const kpiMain = metric === "qtd"
        ? `<div class="l">Máquinas</div><div class="v">${nf(fatFilt)} <small>un</small></div>`
        : `<div class="l">Faturado</div><div class="v">R$ ${nf(fatFilt / 1000)} <small>mil</small></div>`;

      let k3;
      if (layer === "grao") k3 = `<div class="l">Grão / total</div><div class="v">${gpct}<small>%</small></div>`;
      else if (layer === "pec") k3 = `<div class="l">Pec. / total</div><div class="v">${100 - gpct}<small>%</small></div>`;
      else k3 = `<div class="l">Mix G/P</div><div class="v">${gpct}<small>/${100 - gpct}</small></div>`;

      const barCol = layer === "grao" ? GRAO : layer === "pec" ? PEC : BLUE;

      const regAgg = {};
      Object.entries(uf).forEach(([k, v]) => { const rg = REGIOES[k] || "Outros"; regAgg[rg] = (regAgg[rg] || 0) + lval(v.g, v.p); });
      const regTop = Object.entries(regAgg).filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1]);
      const mReg = regTop.length ? regTop[0][1] : 1;

      const ufTop = Object.entries(uf).map(([k, v]) => [k, lval(v.g, v.p)]).filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const mUF = ufTop.length ? ufTop[0][1] : 1;

      const scaleLbl = metric === "qtd" ? "Máquinas por estado" : "Faturado por estado";

      container.querySelector("#cvm-side").innerHTML = `
        <div class="cvm-kpis">
          <div class="cvm-kpi">${kpiMain}</div>
          <div class="cvm-kpi"><div class="l">Cidades</div><div class="v">${nCidades}</div></div>
          <div class="cvm-kpi">${k3}</div>
        </div>
        <div class="cvm-card cvm-panel"><h3>Top regiões</h3>${regTop.map((e, i) => `
          <div class="cvm-row cvm-clk" data-hlt="region" data-hlk="${escapeHtml(e[0])}"><span class="rk">${i + 1}</span><span class="nm">${escapeHtml(e[0])}</span><span class="val">${fmtVal(e[1])}</span><div class="cvm-bar"><i style="width:${100 * e[1] / mReg}%;background:${barCol}"></i></div></div>`).join("") || `<div class="cvm-note" style="padding:0">Sem dados.</div>`}</div>
        <div class="cvm-card cvm-panel"><h3>Top estados</h3>${ufTop.map((e, i) => `
          <div class="cvm-row cvm-clk" data-hlt="uf" data-hlk="${escapeHtml(e[0])}"><span class="rk">${i + 1}</span><span class="nm">${escapeHtml(e[0])}</span><span class="val">${fmtVal(e[1])}</span><div class="cvm-bar"><i style="width:${100 * e[1] / mUF}%;background:${barCol}"></i></div></div>`).join("") || `<div class="cvm-note" style="padding:0">Sem dados.</div>`}</div>
        <div class="cvm-card cvm-panel"><h3>Legenda</h3>
          <div class="cvm-legend">
            ${layer !== "pec" ? `<div class="cvm-lg"><span class="cvm-dot" style="background:${GRAO}"></span>Grão (máquinas)</div>` : ""}
            ${layer !== "grao" ? `<div class="cvm-lg"><span class="cvm-dot" style="background:${PEC}"></span>Pecuária (máquinas)</div>` : ""}
            <div class="cvm-lg"><span class="cvm-scale"></span></div>
            <div class="cvm-lg" style="justify-content:space-between;font-size:10.5px;color:var(--faint)"><span>menor</span><span>${scaleLbl}</span><span>maior</span></div>
          </div>
        </div>`;

      const sizeLbl = metric === "qtd" ? "nº de máquinas" : "faturado";
      container.querySelector("#cvm-note").textContent = "Bolha = cidade (tamanho = " + sizeLbl + (layer === "ambos" ? ", fatia = Grão/Pecuária" : "") + "). Clique num estado para destacar · duplo-clique aproxima.";
    }

    // ---------------------------------------------------------------- events
    let tt = null;
    function ensureTt() { if (!tt) { tt = document.createElement("div"); tt.className = "cvm-tt"; tt.hidden = true; document.body.appendChild(tt); } return tt; }
    function showTt(e, t, m) { const el = ensureTt(); el.hidden = false; el.innerHTML = `<div class="t">${t}</div><div class="m">${m}</div>`; el.style.left = Math.min(e.clientX + 14, window.innerWidth - 250) + "px"; el.style.top = (e.clientY + 14) + "px"; }
    function hideTt() { if (tt) tt.hidden = true; }

    function cityTip(g, p) {
      if (layer === "grao") return `Grão ${fmtVal(g)}`;
      if (layer === "pec") return `Pecuária ${fmtVal(p)}`;
      return `Grão ${fmtVal(g)} · Pecuária ${fmtVal(p)}<br>Total ${fmtVal(g + p)}`;
    }
    function wireHover(container, ufVal) {
      const tipLbl = metric === "qtd" ? "Máquinas" : "Faturado";
      container.querySelectorAll(".cvm-state").forEach((el) => {
        el.addEventListener("mousemove", (e) => showTt(e, `${el.dataset.nm} (${el.dataset.uf})`, `${tipLbl} ${fmtVal(ufVal[el.dataset.uf] || 0)}`));
        el.addEventListener("mouseleave", hideTt);
      });
      container.querySelectorAll(".cvm-bub").forEach((el) => {
        el.addEventListener("mousemove", (e) => showTt(e, `${el.dataset.nm} · ${el.dataset.uf}`, cityTip(+el.dataset.g, +el.dataset.p)));
        el.addEventListener("mouseleave", hideTt);
      });
    }
    // ao dar drill num estado enche o estado (1x); ao voltar ao Brasil, afasta (ZOOM_START)
    function resetZoom() { zoom = zoomUF ? 1 : ZOOM_START; panX = 0; panY = 0; }

    // volta ao nivel Brasil (limpa drill, destaque e zoom); no-op se ja esta assim
    function resetToBrasil(container) {
      if (zoomUF == null && highlight == null && zoom === ZOOM_START) return;
      zoomUF = null; highlight = null; resetZoom(); hideTt(); paint(container);
    }
    // clique fora do card do mapa (mantendo lateral/controles) volta ao nivel Brasil
    function bindDocReset() {
      if (docResetBound) return; docResetBound = true;
      document.addEventListener("click", (e) => {
        const c = hostContainer; if (!c) return;
        const map = c.querySelector("#cvm-map");
        if (!map || !document.body.contains(map)) return;
        if (zoomUF == null && highlight == null && zoom === ZOOM_START) return;
        if (e.target.closest(".cvm-mapcard") || e.target.closest(".cvm-side") || e.target.closest(".cvm-ctrls")) return;
        resetToBrasil(c);
      });
    }

    function wireStateClick(container) {
      container.querySelectorAll(".cvm-state").forEach((el) => {
        // clique simples: destaca (mesmo efeito da lista lateral); duplo-clique: aproxima
        el.addEventListener("click", () => {
          const k = el.dataset.uf;
          highlight = (highlight && highlight.type === "uf" && highlight.key === k) ? null : { type: "uf", key: k };
          applyHighlight(container);
        });
        el.addEventListener("dblclick", () => { const k = el.dataset.uf; zoomUF = k; highlight = { type: "uf", key: k }; resetZoom(); hideTt(); paint(container); });
      });
    }

    function wireZoom(container) {
      const rng = container.querySelector("#cvm-zrange");
      const setZoom = (z) => { zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)); if (zoom <= 1) { panX = 0; panY = 0; } applyViewBox(container); };
      rng?.addEventListener("input", () => setZoom(parseFloat(rng.value)));
      container.querySelector("#cvm-zoom")?.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-z]"); if (!b) return;
        setZoom(zoom * (b.dataset.z === "in" ? 1.25 : 0.8));
      });
    }

    // arraste para deslocar quando aproximado; suprime o clique-drill se houve arrasto
    function wirePan(container) {
      const map = container.querySelector("#cvm-map"); if (!map) return;
      let dragging = false, dragged = false, sx = 0, sy = 0, bpx = 0, bpy = 0;
      map.addEventListener("pointerdown", (e) => {
        if (zoom <= 1) return;
        dragging = true; dragged = false; sx = e.clientX; sy = e.clientY; bpx = panX; bpy = panY;
        try { map.setPointerCapture(e.pointerId); } catch (_) {}
      });
      map.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const svg = map.querySelector("svg"); if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const vb = currentViewBox();
        if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 3) dragged = true;
        panX = bpx - (e.clientX - sx) * (vb[2] / rect.width);
        panY = bpy - (e.clientY - sy) * (vb[3] / rect.height);
        applyViewBox(container);
      });
      const end = () => { dragging = false; };
      map.addEventListener("pointerup", end);
      map.addEventListener("pointercancel", end);
      map.addEventListener("click", (e) => { if (dragged) { e.stopPropagation(); dragged = false; } }, true);
    }

    function bind(container) {
      container.querySelector("#cvm-seg")?.addEventListener("click", async (e) => {
        const b = e.target.closest("button[data-p]"); if (!b) return;
        period = b.dataset.p; await reloadAndRender(container);
      });
      container.querySelector("#cvm-layer")?.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-l]"); if (!b) return;
        layer = b.dataset.l;
        container.querySelectorAll("#cvm-layer button").forEach((x) => x.classList.toggle("on", x === b));
        if (cityRows.length) paint(container);
      });
      container.querySelector("#cvm-metric")?.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-m]"); if (!b) return;
        metric = b.dataset.m;
        container.querySelectorAll("#cvm-metric button").forEach((x) => x.classList.toggle("on", x === b));
        if (cityRows.length) paint(container);
      });
      container.querySelector("#cvm-back")?.addEventListener("click", () => { zoomUF = null; highlight = null; resetZoom(); hideTt(); paint(container); });
      // clique na area vazia do mapa (fora de estado/bolha) volta ao nivel Brasil
      container.querySelector("#cvm-map")?.addEventListener("click", (e) => {
        if (e.target.closest(".cvm-state") || e.target.closest(".cvm-bub")) return;
        resetToBrasil(container);
      });
      wireZoom(container);
      wirePan(container);
      bindDocReset();
    }

    function syncFromHeader() {
      year = Number(state.currentPeriod?.year || year);
      month = Number(state.currentPeriod?.month || month);
    }
    async function reloadAndRender(container) {
      loading = true; render(container);
      try { await loadData(); } catch (e) { console.error(e); }
      render(container);
    }

    function renderSelectedMapa(container, reportId) {
      if (reportId !== REPORT_ID) return false;
      syncFromHeader();
      hideTt();
      if (loadedKey === paramsKey() && cityRows.length) {
        render(container);
        loadData().then(() => render(container)).catch((e) => console.error(e));
      } else {
        loading = true; render(container);
        loadData().then(() => render(container)).catch((e) => { console.error(e); loading = false; render(container); });
      }
      return true;
    }

    return { renderSelectedMapa, REPORT_ID };
  }

  window.VECTON_COMERCIAL_MAPA = { createComercialMapaModule };
})(window);
