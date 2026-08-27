(function attachVectonComercialMapaGeografico(window) {
  // Relatorio "Vendas - Distribuicao Geografica" — mapa do Brasil por UF com
  // donut de composicao (Quantidade/Mix/Cultura) ou heatmap (Preco Medio),
  // ranking lateral "Top Estados" e detalhamento inferior (mix por modelo,
  // cultura, preco medio, comparativo Brasil x Estado). Especificacao recebida
  // do usuario (PDF), decisoes fechadas em 2026-08-07 — ver memoria do
  // projeto. Fonte: RPC comercial_mapa_geografico_vendas (migration 112),
  // grao UF x Modelo x Cultura, filtrado a Tipo=Maquinas.
  //
  // Diferente do Mapa de Vendas (comercialMapa): periodo aqui e um INTERVALO
  // DE DATAS livre (nao mes/ytd/fy do cabecalho), e nao reaproveita o layout
  // dos outros relatorios comerciais — CSS proprio (prefixo cmg-), decisao
  // explicita do usuario.
  function createComercialMapaGeograficoModule(deps) {
    const { escapeHtml, state, resolveOrganizationId, callSupabaseRpc, fetchAllSupabaseRows, isSupabaseConfigured } = deps;

    const REPORT_ID = "comercialMapaGeografico";

    const REGIOES = {
      AC: "Norte", AP: "Norte", AM: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
      AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste", PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
      DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste",
      ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
      PR: "Sul", RS: "Sul", SC: "Sul"
    };
    const REGIOES_ORDEM = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];
    const PALETTE = ["#3b82f6", "#14b8a6", "#8b5cf6", "#f59e0b", "#ec4899", "#22c55e", "#06b6d4", "#eab308"];
    const OUTROS_COLOR = "#6b7280";
    // Top N antes de agrupar o resto em "Outros" nos donuts/mix por modelo.
    // Era 5 (sugestão da spec original); subiu pra 8 porque em estados de
    // baixo volume com muitos modelos distintos vendidos (ex: MG jul/2026,
    // 9 modelos reais em 12 máquinas) o corte em 5 inflava o Outros sem
    // nenhum problema de dado por trás — só matemática de amostra pequena.
    const MODEL_TOP_N = 8;
    const CULTURA_COLORS = { "Grãos": "#14b8a6", "Pecuária": "#8b5cf6", "Outros": OUTROS_COLOR };
    const HEAT_STOPS = ["#131a28", "#183480", "#1d4ed8"];
    const DF_FALLBACK_LONLAT = [-47.93, -15.78]; // brStatesGeo.js traz DF com rings vazios (embutido em GO no dado simplificado)

    const BR = window.VECTON_BR_GEO || { bbox: [-74, -34, -32, 6], states: [] };
    const [minx, miny, maxx, maxy] = BR.bbox;
    const midlat = (miny + maxy) / 2, kx = Math.cos(midlat * Math.PI / 180);
    const gW = (maxx - minx) * kx, gH = (maxy - miny);
    const VW = 1000, VH = Math.round(VW * gH / gW);
    const proj = (lo, la) => [(lo - minx) * kx / gW * VW, (maxy - la) / gH * VH];

    // ------------------------------------------------------------ centroides
    function ringArea(ring) {
      let a = 0;
      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
        a += x1 * y2 - x2 * y1;
      }
      return a / 2;
    }
    function ringCentroid(ring) {
      let a = 0, cx = 0, cy = 0;
      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
        const cross = x1 * y2 - x2 * y1;
        a += cross; cx += (x1 + x2) * cross; cy += (y1 + y2) * cross;
      }
      a /= 2;
      if (Math.abs(a) < 1e-9) return null;
      return [cx / (6 * a), cy / (6 * a)];
    }
    function stateCentroidLonLat(st) {
      if (!st.rings || !st.rings.length) return st.uf === "DF" ? DF_FALLBACK_LONLAT : null;
      let bestRing = null, bestArea = 0;
      st.rings.forEach((r) => { const ar = Math.abs(ringArea(r)); if (ar > bestArea) { bestArea = ar; bestRing = r; } });
      if (!bestRing) return DF_FALLBACK_LONLAT;
      return ringCentroid(bestRing) || DF_FALLBACK_LONLAT;
    }
    const CENTROIDS = {}; // uf -> [x,y] em coordenadas do viewBox
    const STATE_NAMES = {};
    BR.states.forEach((st) => {
      const ll = stateCentroidLonLat(st);
      if (ll) CENTROIDS[st.uf] = proj(ll[0], ll[1]);
      STATE_NAMES[st.uf] = st.nome;
    });

    // ------------------------------------------------------------ estado
    // Periodo NAO tem controle proprio dentro do relatorio — regra do app e
    // o mes/ano virem sempre do cabecalho do site (state.currentPeriod),
    // igual Painel e Mapa de Vendas. Aqui so um toggle Mes/YTD/Ano define a
    // janela em torno desse mes (mesmo padrao das outras 2 RPCs comerciais).
    let period = "ytd";                 // mes | ytd | fy
    let year = Number(state.currentPeriod?.year || new Date().getFullYear());
    let month = Number(state.currentPeriod?.month || new Date().getMonth() + 1);
    let selUFs = new Set();             // vazio = Todas
    let selCultura = "";                // "" = Todas
    let selModelo = "";                 // "" = Todos
    let equipe = { tipo: "", valor: "" }; // tipo: territorio|coordenacao|vendedor
    let mapMode = "quantidade";         // quantidade | mix | precoMedio | cultura
    let selectedState = null;
    let showAllRanking = false;
    let zoom = 1;
    const ZOOM_MIN = 1, ZOOM_MAX = 5;

    let openPopover = null;             // chave do filtro com popover aberto
    let rows = [];
    let prevTotals = { qtd: 0, val: 0 };
    let loading = false;
    let loadedKey = null;
    let lastError = null;
    let optionsLoaded = false;
    let MODELOS = [];       // lista de nomes de modelo (Maquinas)
    let TERRITORIOS = [];
    let COORDENACOES = [];
    let VENDEDORES = [];    // {codigo, nome}
    let MODEL_COLORS = {};
    let hostContainer = null;
    let docCloseBound = false;

    function syncFromHeader() {
      year = Number(state.currentPeriod?.year || year);
      month = Number(state.currentPeriod?.month || month);
    }
    // "periodo anterior" dos cards: mes -> mes anterior (MoM); ytd/fy -> mesma
    // janela no ano anterior (comparacao YoY, mais natural pra acumulado).
    function prevPeriodParams() {
      if (period === "mes") {
        return month === 1 ? { year: year - 1, month: 12, period: "mes" } : { year, month: month - 1, period: "mes" };
      }
      return { year: year - 1, month, period };
    }

    // ------------------------------------------------------------ helpers
    function nf(v) { return Math.round(v || 0).toLocaleString("pt-BR"); }
    function fmtMoneyShort(v) {
      v = Number(v) || 0;
      const abs = Math.abs(v);
      if (abs >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M";
      if (abs >= 1000) return "R$ " + nf(v / 1000) + " mil";
      return "R$ " + nf(v);
    }
    function fmtMoneyFull(v) { return "R$ " + Math.round(v || 0).toLocaleString("pt-BR"); }
    function fmtPct(frac, digits) {
      if (frac == null || Number.isNaN(frac)) return "—";
      return (frac * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 }) + "%";
    }
    function avgPrice(val, qtd) { return qtd > 0 ? val / qtd : null; }
    function pctDelta(cur, prev) { return prev > 0 ? (cur - prev) / prev : null; }
    function deltaBadge(cur, prev) {
      const d = pctDelta(cur, prev);
      if (d == null) return "";
      const up = d >= 0;
      return `<span class="cmg-delta ${up ? "up" : "down"}">${up ? "↑" : "↓"} ${fmtPct(Math.abs(d))} <small>vs. período anterior</small></span>`;
    }
    function lerp(a, b, t) {
      const ah = a.match(/\w\w/g).map((h) => parseInt(h, 16));
      const bh = b.match(/\w\w/g).map((h) => parseInt(h, 16));
      return "#" + ah.map((v, i) => Math.round(v + (bh[i] - v) * t).toString(16).padStart(2, "0")).join("");
    }
    function heat(v, min, max) {
      if (v == null || max <= min) return "#141922";
      const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
      const s = t * (HEAT_STOPS.length - 1), i = Math.min(HEAT_STOPS.length - 2, Math.floor(s));
      return lerp(HEAT_STOPS[i], HEAT_STOPS[i + 1], s - i);
    }
    function statePath(rings) {
      return rings.map((r) => "M" + r.map(([lo, la]) => { const [x, y] = proj(lo, la); return x.toFixed(1) + "," + y.toFixed(1); }).join("L") + "Z").join(" ");
    }
    function colorForModel(name) { return name === "OUTROS" ? OUTROS_COLOR : (MODEL_COLORS[name] || OUTROS_COLOR); }
    function colorForCultura(name) { return CULTURA_COLORS[name] || OUTROS_COLOR; }

    // agrupa por quantidade DESC, mantem topN e junta o resto em OUTROS
    function topNPlusOutros(map, n) {
      const arr = Object.entries(map).map(([k, v]) => ({ key: k, qtd: v.qtd, val: v.val })).sort((a, b) => b.qtd - a.qtd);
      if (arr.length <= n) return arr;
      const head = arr.slice(0, n);
      const tail = arr.slice(n);
      const outros = tail.reduce((a, r) => { a.qtd += r.qtd; a.val += r.val; return a; }, { key: "OUTROS", qtd: 0, val: 0 });
      return [...head, outros];
    }

    // ------------------------------------------------------------ dados
    function paramsKey() {
      return [year, month, period, [...selUFs].sort().join(","), selCultura, selModelo, equipe.tipo, equipe.valor].join("|");
    }
    function buildFilterParams(y, m, p) {
      return {
        p_org: null, // preenchido em loadData
        p_year: y,
        p_month: m,
        p_period: p,
        p_uf: selUFs.size ? [...selUFs] : null,
        p_cultura: selCultura || null,
        p_modelo: selModelo ? [selModelo] : null,
        p_territorio: equipe.tipo === "territorio" && equipe.valor ? [equipe.valor] : null,
        p_coordenacao: equipe.tipo === "coordenacao" && equipe.valor ? [equipe.valor] : null,
        p_vendedor: equipe.tipo === "vendedor" && equipe.valor ? [equipe.valor] : null
      };
    }
    async function loadOptions(org) {
      if (optionsLoaded) return;
      const [tipos, territorios, coordenacoes, vendedores] = await Promise.all([
        fetchAllSupabaseRows("comercial_tipos", `select=id,nome&organization_id=eq.${org}`),
        fetchAllSupabaseRows("comercial_territorios", `select=nome&organization_id=eq.${org}&order=nome.asc`),
        fetchAllSupabaseRows("comercial_coordenacoes", `select=nome&organization_id=eq.${org}&order=nome.asc`),
        fetchAllSupabaseRows("comercial_vendedores", `select=codigo,nome&organization_id=eq.${org}&order=nome.asc`)
      ]);
      const maquinasId = (tipos || []).find((t) => t.nome === "Máquinas")?.id;
      const produtos = maquinasId
        ? await fetchAllSupabaseRows("comercial_produtos", `select=nome_reduzido,codigo&organization_id=eq.${org}&tipo_id=eq.${maquinasId}`)
        : [];
      const nomes = new Set();
      (produtos || []).forEach((p) => nomes.add((p.nome_reduzido || "").trim() || p.codigo));
      MODELOS = [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
      MODEL_COLORS = {};
      MODELOS.forEach((m, i) => { MODEL_COLORS[m] = PALETTE[i % PALETTE.length]; });
      TERRITORIOS = (territorios || []).map((t) => t.nome);
      COORDENACOES = (coordenacoes || []).map((c) => c.nome);
      VENDEDORES = (vendedores || []).map((v) => ({ codigo: v.codigo, nome: v.nome }));
      optionsLoaded = true;
    }
    async function loadData() {
      loading = true; rows = []; prevTotals = { qtd: 0, val: 0 }; lastError = null;
      if (!isSupabaseConfigured()) { loading = false; loadedKey = paramsKey(); return; }
      try {
        const org = await resolveOrganizationId();
        await loadOptions(org);
        const pv = prevPeriodParams();
        const curParams = buildFilterParams(year, month, period); curParams.p_org = org;
        const prevParams = buildFilterParams(pv.year, pv.month, pv.period); prevParams.p_org = org;
        const [curRows, prevRows] = await Promise.all([
          callSupabaseRpc("comercial_mapa_geografico_vendas", curParams),
          callSupabaseRpc("comercial_mapa_geografico_vendas", prevParams)
        ]);
        rows = curRows || [];
        prevTotals = (prevRows || []).reduce((a, r) => { a.qtd += Number(r.quantidade) || 0; a.val += Number(r.valor) || 0; return a; }, { qtd: 0, val: 0 });
      } catch (e) {
        // Erro real (ex.: RPC com assinatura desatualizada no banco) NAO pode
        // virar silenciosamente "sem dados" — o usuario precisa ver que algo
        // quebrou, nao que o periodo esta vazio.
        console.error(e);
        lastError = (e && e.message) || String(e);
      }
      loadedKey = paramsKey();
      loading = false;
    }

    function derive() {
      const byUF = {};
      const byModeloBR = {}, byCulturaBR = {};
      rows.forEach((r) => {
        const uf = r.uf, modelo = r.modelo, cultura = r.cultura;
        const qtd = Number(r.quantidade) || 0, val = Number(r.valor) || 0;
        if (!byUF[uf]) byUF[uf] = { qtd: 0, val: 0, modelos: {}, culturas: {} };
        byUF[uf].qtd += qtd; byUF[uf].val += val;
        byUF[uf].modelos[modelo] = byUF[uf].modelos[modelo] || { qtd: 0, val: 0 };
        byUF[uf].modelos[modelo].qtd += qtd; byUF[uf].modelos[modelo].val += val;
        byUF[uf].culturas[cultura] = byUF[uf].culturas[cultura] || { qtd: 0, val: 0 };
        byUF[uf].culturas[cultura].qtd += qtd; byUF[uf].culturas[cultura].val += val;
        byModeloBR[modelo] = byModeloBR[modelo] || { qtd: 0, val: 0 };
        byModeloBR[modelo].qtd += qtd; byModeloBR[modelo].val += val;
        byCulturaBR[cultura] = byCulturaBR[cultura] || { qtd: 0, val: 0 };
        byCulturaBR[cultura].qtd += qtd; byCulturaBR[cultura].val += val;
      });
      const totQtd = Object.values(byUF).reduce((a, v) => a + v.qtd, 0);
      const totVal = Object.values(byUF).reduce((a, v) => a + v.val, 0);
      return { byUF, byModeloBR, byCulturaBR, totQtd, totVal };
    }

    // ------------------------------------------------------------ css
    function ensureStyle() {
      if (document.getElementById("cmg-style")) return;
      const s = document.createElement("style");
      s.id = "cmg-style";
      s.textContent = `
        .cmg { --bg:#0a0d16; --panel:#121826; --panel2:#171f30; --line:#232c40; --ink:#eef1f6; --soft:#9aa4b8; --faint:#6b7690; --accent:#1d4ed8; color:var(--ink); }
        .cmg * { box-sizing:border-box; }
        .cmg-crumb { font-size:12px; color:var(--soft); margin-bottom:10px; }
        .cmg-crumb a { color:var(--accent); cursor:pointer; text-decoration:none; }
        /* z-index positivo mas ABAIXO de 20 (o do .period-popover do
           cabecalho do site) — alto o bastante pra sempre ficar acima do
           resto do proprio relatorio (mapa, zoom em z-index:5 etc.), baixo o
           bastante pra nunca cobrir o calendario do cabecalho. */
        .cmg-filters { display:flex; align-items:center; gap:9px; flex-wrap:wrap; margin-bottom:14px; position:relative; z-index:10; }
        .cmg-fspacer { flex:1; }
        .cmg-chip { position:relative; background:var(--panel2); border:1px solid var(--line); border-radius:11px; padding:7px 12px; display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12.5px; }
        .cmg-chip:hover { background:#1d2537; }
        .cmg-chip.on { border-color:var(--accent); }
        .cmg-chip .ico { color:var(--faint); display:flex; }
        .cmg-chip .lbl { color:var(--faint); }
        .cmg-chip .val { color:var(--ink); font-weight:600; white-space:nowrap; }
        .cmg-pop { position:absolute; top:calc(100% + 6px); left:0; z-index:15; background:#171f30; border:1px solid var(--line); border-radius:12px; padding:12px; min-width:220px; max-width:320px; box-shadow:0 20px 44px rgba(0,0,0,.5); }
        .cmg-pop.right { left:auto; right:0; }
        .cmg-pop h4 { margin:0 0 8px; font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; color:var(--faint); font-weight:600; }
        .cmg-pop .grp + .grp { margin-top:10px; padding-top:10px; border-top:1px solid var(--line); }
        .cmg-pop-list { max-height:260px; overflow-y:auto; display:flex; flex-direction:column; gap:2px; }
        /* .cmg-pop input[type=checkbox|radio] herda width:100% do <input> global
           do site (styles.css) — sem isso, o controle "estica" e empurra o
           texto do label pro canto direito do popover. */
        .cmg-pop label { display:flex; flex-direction:row; align-items:center; justify-content:flex-start; gap:8px; font-size:12.5px; text-align:left; padding:5px 6px; border-radius:7px; cursor:pointer; }
        .cmg-pop label:hover { background:#1d2537; }
        .cmg-pop label span { text-align:left; }
        .cmg-pop input[type=checkbox], .cmg-pop input[type=radio] { width:auto; min-width:0; flex:none; accent-color:var(--accent); margin:0; }
        .cmg-pop-ufgrid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:2px; max-height:260px; overflow-y:auto; }
        .cmg-pop-foot { display:flex; justify-content:flex-end; margin-top:9px; padding-top:9px; border-top:1px solid var(--line); }
        .cmg-pop-clear { background:none; border:none; color:var(--accent); font:inherit; font-size:12px; cursor:pointer; padding:4px 6px; }
        .cmg-seg { display:flex; gap:2px; background:var(--panel2); border:1px solid var(--line); border-radius:11px; padding:3px; }
        .cmg-seg button { border:none; background:transparent; color:var(--soft); font:inherit; font-size:12.5px; font-weight:500; padding:7px 14px; border-radius:8px; cursor:pointer; white-space:nowrap; }
        .cmg-seg button.on { background:var(--accent); color:#fff; }
        .cmg-kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:16px; }
        @media (max-width:1200px) { .cmg-kpis { grid-template-columns:repeat(3,1fr); } }
        @media (max-width:760px) { .cmg-kpis { grid-template-columns:repeat(2,1fr); } }
        .cmg-kpi { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:14px 18px; display:flex; gap:14px; align-items:center; }
        .cmg-kpi .icon { width:53px; height:53px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex:none; }
        .cmg-kpi .icon svg { width:24px; height:24px; }
        .cmg-kpi .icon.img { background:none; }
        .cmg-kpi .icon.img img { width:100%; height:100%; border-radius:11px; object-fit:cover; display:block; }
        .cmg-kpi .body { min-width:0; }
        .cmg-kpi .v { font-size:21px; font-weight:700; line-height:1.15; white-space:nowrap; }
        .cmg-kpi .l { font-size:12px; color:var(--soft); margin-top:2px; }
        .cmg-delta { display:block; font-size:10.5px; margin-top:5px; font-weight:600; }
        .cmg-delta.up { color:#22c55e; }
        .cmg-delta.down { color:#f87171; }
        .cmg-delta small { color:var(--faint); font-weight:400; }
        .cmg-row2 { display:grid; grid-template-columns:1fr 360px; gap:14px; margin-bottom:14px; align-items:start; }
        @media (max-width:1000px) { .cmg-row2 { grid-template-columns:1fr; } }
        .cmg-card { background:var(--panel); border:1px solid var(--line); border-radius:16px; }
        /* mapa flutua direto no preto, sem caixa de card ao redor — mesma
           tecnica que .cvm-mapcard ja usa no Mapa de Vendas existente */
        /* Nada de card aqui de proposito: sem fundo, sem borda, sem raio —
           o mapa fica direto em cima do fundo da propria pagina, sem caixa
           nenhuma ao redor. */
        .cmg-mapcard { background:transparent; border:none; border-radius:0; }
        .cmg-card-head { display:flex; align-items:center; justify-content:space-between; padding:15px 16px 0; }
        .cmg-card-head h3 { margin:0; font-size:13.5px; font-weight:600; }
        .cmg-card-head .info { color:var(--faint); cursor:help; font-size:11px; }
        .cmg-mapwrap { position:relative; padding:8px; }
        .cmg-mapwrap svg { display:block; width:100%; height:auto; }
        /* Preenchimento azul, um degrau mais forte que o fundo da pagina
           (#09090a) — so pra dar presenca ao mapa, nao codifica dado (quem
           representa dado e o tamanho do donut, exceto no modo Preco Medio,
           que sobrescreve via inline style). Linhas cinzas = fronteira. */
        .cmg-state { fill:#13203a; stroke:rgba(148,163,184,.4); stroke-width:.7; cursor:pointer; transition:fill .12s; }
        .cmg-state:hover { fill:#1a2c50; }
        .cmg-state.cmg-dim { opacity:.25; }
        .cmg-state.cmg-hi { stroke:#fff; stroke-width:1.6; }
        .cmg-donut { cursor:pointer; }
        .cmg-donut.cmg-dim { opacity:.18; }
        .cmg-donut-lbl { fill:#fff; font-weight:700; text-anchor:middle; dominant-baseline:middle; paint-order:stroke; stroke:#0a0d16; stroke-width:2px; pointer-events:none; }
        .cmg-price-lbl { fill:#dfe6f2; font-weight:600; text-anchor:middle; pointer-events:none; paint-order:stroke; stroke:#0a0d16; stroke-width:2.4px; }
        .cmg-zoom { position:absolute; top:12px; left:12px; z-index:5; display:flex; flex-direction:column; gap:5px; background:rgba(18,24,38,.85); border:1px solid var(--line); border-radius:10px; padding:5px; backdrop-filter:blur(4px); }
        .cmg-zoom button { width:26px; height:26px; border:none; border-radius:7px; background:#1d2537; color:var(--ink); font-size:14px; cursor:pointer; }
        .cmg-zoom button:hover { background:#26304a; }
        .cmg-legend { display:flex; flex-wrap:wrap; gap:12px; align-items:center; padding:0 16px 14px; font-size:11.5px; color:var(--soft); }
        .cmg-lg-dot { width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:6px; vertical-align:middle; }
        .cmg-lg-scale { display:flex; align-items:center; gap:8px; }
        .cmg-lg-bar { width:120px; height:8px; border-radius:99px; background:linear-gradient(90deg,${HEAT_STOPS.join(",")}); }
        .cmg-note { font-size:10.5px; color:var(--faint); padding:0 16px 12px; }
        .cmg-side { padding:14px 16px 16px; }
        .cmg-side table { width:100%; border-collapse:collapse; font-size:11.5px; table-layout:fixed; }
        .cmg-side thead th { text-align:left; font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--faint); font-weight:600; padding:0 5px 8px; white-space:nowrap; }
        .cmg-side thead th.num, .cmg-side td.num { text-align:right; white-space:nowrap; }
        .cmg-side tbody td { padding:8px 5px; border-top:1px solid var(--line); vertical-align:middle; }
        .cmg-side tbody tr { cursor:pointer; }
        .cmg-side tbody tr:hover td { background:#171f30; }
        .cmg-side tbody tr.sel td { background:rgba(29,78,216,.14); }
        .cmg-rk { color:var(--faint); font-variant-numeric:tabular-nums; width:18px; display:inline-block; }
        .cmg-uf-bar-wrap { display:flex; align-items:center; gap:8px; }
        .cmg-uf-bar { flex:1; height:5px; border-radius:99px; background:#1c2438; overflow:hidden; min-width:40px; }
        .cmg-uf-bar i { display:block; height:100%; background:var(--accent); }
        .cmg-more { display:block; text-align:left; margin-top:10px; background:none; border:none; color:var(--accent); font:inherit; font-size:12.5px; cursor:pointer; padding:4px 6px; }
        .cmg-more:hover { text-decoration:underline; }
        .cmg-row3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
        @media (max-width:980px) { .cmg-row3 { grid-template-columns:1fr; } }
        .cmg-bars { padding:14px 16px 16px; display:flex; flex-direction:column; gap:10px; }
        .cmg-bar-row { display:grid; grid-template-columns:minmax(96px,128px) 1fr 38px; align-items:center; gap:8px; font-size:11.5px; }
        .cmg-bar-row .nm { color:var(--soft); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cmg-bar-track { height:9px; border-radius:99px; background:#1c2438; overflow:hidden; }
        .cmg-bar-fill { height:100%; border-radius:99px; }
        .cmg-bar-pct { text-align:right; color:var(--ink); font-weight:600; }
        .cmg-cult { padding:14px 16px 16px; display:flex; align-items:center; gap:18px; }
        .cmg-cult-legend { display:flex; flex-direction:column; gap:12px; flex:1; }
        .cmg-cult-item { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .cmg-cult-item .nm { display:flex; align-items:center; gap:8px; font-size:12.5px; color:var(--soft); }
        .cmg-cult-item .sub { font-size:11px; color:var(--faint); margin-top:1px; }
        .cmg-cult-item .pct { font-size:17px; font-weight:700; }
        .cmg-price-list { padding:14px 16px 16px; display:flex; flex-direction:column; gap:9px; }
        .cmg-price-row { display:grid; grid-template-columns:minmax(88px,118px) 1fr 60px; align-items:center; gap:8px; font-size:11.5px; }
        .cmg-price-row .nm { color:var(--soft); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cmg-price-row .v { text-align:right; font-weight:600; white-space:nowrap; }
        .cmg-cmp { margin-top:14px; }
        .cmg-cmp table { width:100%; border-collapse:collapse; font-size:12.5px; }
        .cmg-cmp th { text-align:right; font-size:10px; text-transform:uppercase; color:var(--faint); padding:0 8px 8px; }
        .cmg-cmp th:first-child { text-align:left; }
        .cmg-cmp td { padding:8px; border-top:1px solid var(--line); text-align:right; }
        .cmg-cmp td:first-child { text-align:left; display:flex; align-items:center; gap:7px; }
        .cmg-cmp .pos { color:#22c55e; } .cmg-cmp .neg { color:#f87171; }
        .cmg-tt { position:fixed; pointer-events:none; z-index:9700; background:#0e1320; border:1px solid var(--line); border-radius:9px; padding:9px 12px; font-size:12px; box-shadow:0 12px 34px rgba(0,0,0,.6); max-width:250px; color:var(--ink); }
        .cmg-tt .t { font-weight:600; margin-bottom:4px; }
        .cmg-tt .m { color:var(--soft); line-height:1.6; }
        .cmg-empty { padding:44px 20px; text-align:center; color:var(--faint); }
        .cmg-empty button { margin-top:10px; background:var(--panel2); border:1px solid var(--line); color:var(--ink); font:inherit; font-size:12.5px; padding:8px 14px; border-radius:9px; cursor:pointer; }
        .cmg-skel { opacity:.45; pointer-events:none; }
      `;
      document.head.appendChild(s);
    }

    // ------------------------------------------------------------ filtros: chips/popovers
    function ufLabel() {
      if (!selUFs.size) return "Todas";
      if (selUFs.size <= 2) return [...selUFs].join(", ");
      return `${selUFs.size} estados`;
    }
    function regiaoLabel() {
      const active = REGIOES_ORDEM.filter((r) => ufsOfRegiao(r).every((u) => selUFs.has(u)) && ufsOfRegiao(r).length);
      if (!active.length) return "Todas";
      if (active.length <= 2) return active.join(", ");
      return `${active.length} regiões`;
    }
    function ufsOfRegiao(regiao) { return Object.keys(REGIOES).filter((u) => REGIOES[u] === regiao); }
    function equipeLabel() {
      if (!equipe.tipo || !equipe.valor) return "Todas";
      const pref = equipe.tipo === "territorio" ? "Território" : equipe.tipo === "coordenacao" ? "Coordenação" : "Vendedor";
      return `${pref}: ${equipe.valor}`;
    }

    function popoverHtml(key) {
      if (key === "regiao") {
        return `<div class="cmg-pop" data-pop="regiao">
          <h4>Região</h4>
          <div class="cmg-pop-list">${REGIOES_ORDEM.map((r) => {
            const ufs = ufsOfRegiao(r), checked = ufs.every((u) => selUFs.has(u));
            return `<label><input type="checkbox" data-regiao="${r}" ${checked ? "checked" : ""}>${escapeHtml(r)}</label>`;
          }).join("")}</div>
          <div class="cmg-pop-foot"><button class="cmg-pop-clear" data-clear="regiao">Limpar</button></div>
        </div>`;
      }
      if (key === "uf") {
        return `<div class="cmg-pop" data-pop="uf" style="min-width:280px">
          <h4>UF</h4>
          <div class="cmg-pop-ufgrid">${Object.keys(REGIOES).sort().map((u) =>
            `<label><input type="checkbox" data-uf="${u}" ${selUFs.has(u) ? "checked" : ""}>${u}</label>`
          ).join("")}</div>
          <div class="cmg-pop-foot"><button class="cmg-pop-clear" data-clear="uf">Limpar</button></div>
        </div>`;
      }
      if (key === "cultura") {
        return `<div class="cmg-pop" data-pop="cultura">
          <h4>Cultura</h4>
          <div class="cmg-pop-list">
            <label><input type="radio" name="cmg-cultura" value="" ${!selCultura ? "checked" : ""}>Todas</label>
            <label><input type="radio" name="cmg-cultura" value="Grãos" ${selCultura === "Grãos" ? "checked" : ""}>Grãos</label>
            <label><input type="radio" name="cmg-cultura" value="Pecuária" ${selCultura === "Pecuária" ? "checked" : ""}>Pecuária</label>
          </div>
        </div>`;
      }
      if (key === "modelo") {
        return `<div class="cmg-pop" data-pop="modelo">
          <h4>Modelo</h4>
          <div class="cmg-pop-list">
            <label><input type="radio" name="cmg-modelo" value="" ${!selModelo ? "checked" : ""}>Todos</label>
            ${MODELOS.map((m) => `<label><input type="radio" name="cmg-modelo" value="${escapeHtml(m)}" ${selModelo === m ? "checked" : ""}>${escapeHtml(m)}</label>`).join("")}
          </div>
        </div>`;
      }
      if (key === "equipe") {
        return `<div class="cmg-pop right" data-pop="equipe" style="min-width:260px">
          <h4>Equipe Comercial</h4>
          <div class="cmg-pop-list">
            <label><input type="radio" name="cmg-equipe" value="|" ${!equipe.tipo ? "checked" : ""}>Todas</label>
          </div>
          <div class="grp"><h4>Território</h4><div class="cmg-pop-list">${TERRITORIOS.map((t) =>
            `<label><input type="radio" name="cmg-equipe" value="territorio|${escapeHtml(t)}" ${equipe.tipo === "territorio" && equipe.valor === t ? "checked" : ""}>${escapeHtml(t)}</label>`
          ).join("")}</div></div>
          <div class="grp"><h4>Coordenação</h4><div class="cmg-pop-list">${COORDENACOES.map((c) =>
            `<label><input type="radio" name="cmg-equipe" value="coordenacao|${escapeHtml(c)}" ${equipe.tipo === "coordenacao" && equipe.valor === c ? "checked" : ""}>${escapeHtml(c)}</label>`
          ).join("")}</div></div>
          <div class="grp"><h4>Vendedor</h4><div class="cmg-pop-list">${VENDEDORES.map((v) =>
            `<label><input type="radio" name="cmg-equipe" value="vendedor|${escapeHtml(v.codigo)}" ${equipe.tipo === "vendedor" && equipe.valor === v.codigo ? "checked" : ""}>${escapeHtml(v.nome)}</label>`
          ).join("")}</div></div>
        </div>`;
      }
      return "";
    }

    function filterChip(key, iconSvg, label, value) {
      return `<div class="cmg-chip ${openPopover === key ? "on" : ""}" data-chip="${key}">
        <span class="ico">${iconSvg}</span>
        <span class="lbl">${label}</span>
        <span class="val">${escapeHtml(value)}</span>
        ${openPopover === key ? popoverHtml(key) : ""}
      </div>`;
    }

    const ICO = {
      regiao: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18"/></svg>`,
      uf: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z"/></svg>`,
      cultura: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22V12M12 12C7 12 4 8 4 3c5 0 8 3 8 9zM12 12c5 0 8-4 8-9-5 0-8 3-8 9z"/></svg>`,
      modelo: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
      equipe: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="18" cy="8.5" r="2.6"/><path d="M15.7 14.3c2.9.3 5 2.4 5.8 5.7"/></svg>`
    };

    function renderFilterBar() {
      return `<div class="cmg-filters">
        <div class="cmg-seg" id="cmg-period">
          <button data-p="mes" ${period === "mes" ? 'class="on"' : ""}>Mês</button>
          <button data-p="ytd" ${period === "ytd" ? 'class="on"' : ""}>YTD</button>
          <button data-p="fy" ${period === "fy" ? 'class="on"' : ""}>Ano</button>
        </div>
        ${filterChip("regiao", ICO.regiao, "Região", regiaoLabel())}
        ${filterChip("uf", ICO.uf, "UF", ufLabel())}
        ${filterChip("cultura", ICO.cultura, "Cultura", selCultura || "Todas")}
        ${filterChip("modelo", ICO.modelo, "Modelo", selModelo || "Todos")}
        ${filterChip("equipe", ICO.equipe, "Equipe Comercial", equipeLabel())}
        <div class="cmg-fspacer"></div>
        <div class="cmg-seg" id="cmg-mode">
          <span style="padding:7px 4px 7px 8px;font-size:11px;color:var(--faint);white-space:nowrap">Exibir mapa por:</span>
          <button data-mode="quantidade" ${mapMode === "quantidade" ? 'class="on"' : ""}>Quantidade</button>
          <button data-mode="mix" ${mapMode === "mix" ? 'class="on"' : ""}>Mix</button>
          <button data-mode="precoMedio" ${mapMode === "precoMedio" ? 'class="on"' : ""}>Preço Médio</button>
          <button data-mode="cultura" ${mapMode === "cultura" ? 'class="on"' : ""}>Cultura</button>
        </div>
      </div>`;
    }

    // ------------------------------------------------------------ mapa
    function donutSvg(cx, cy, r, strokeW, segments) {
      const total = segments.reduce((a, s) => a + s.qtd, 0);
      if (total <= 0) return "";
      const C = 2 * Math.PI * r;
      let offset = 0;
      return segments.filter((s) => s.qtd > 0).map((s) => {
        const frac = s.qtd / total;
        const len = Math.max(0.01, frac * C);
        const dash = `${len.toFixed(2)} ${Math.max(0.01, C - len).toFixed(2)}`;
        const rotate = (offset / C) * 360 - 90;
        offset += len;
        // data-model/data-share: permitem o tooltip mostrar a fatia
        // especifica sob o mouse (nao so o resumo do estado inteiro).
        const segAttrs = s.label != null ? ` class="cmg-donut-seg" data-model="${escapeHtml(s.label)}" data-share="${frac}" data-color="${s.color}"` : "";
        return `<circle${segAttrs} cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${s.color}" stroke-width="${strokeW.toFixed(1)}" stroke-dasharray="${dash}" transform="rotate(${rotate.toFixed(2)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;
      }).join("");
    }

    function mapSvg(d) {
      const isPreco = mapMode === "precoMedio";
      let minP = Infinity, maxP = -Infinity;
      if (isPreco) {
        Object.values(d.byUF).forEach((v) => { const p = avgPrice(v.val, v.qtd); if (p != null) { minP = Math.min(minP, p); maxP = Math.max(maxP, p); } });
        if (!Number.isFinite(minP)) { minP = 0; maxP = 1; }
      }
      const states = BR.states.map((st) => {
        const v = d.byUF[st.uf];
        const fill = isPreco ? heat(v ? avgPrice(v.val, v.qtd) : null, minP, maxP) : "";
        const cls = ["cmg-state"];
        if (selectedState && selectedState !== st.uf) cls.push("cmg-dim");
        if (selectedState === st.uf) cls.push("cmg-hi");
        const style = isPreco ? ` style="fill:${fill}"` : "";
        return `<path class="${cls.join(" ")}" d="${statePath(st.rings)}"${style} data-uf="${st.uf}" data-nm="${escapeHtml(st.nome)}"/>`;
      }).join("");

      let donuts = "";
      if (!isPreco) {
        const maxQty = Math.max(1, ...Object.values(d.byUF).map((v) => v.qtd));
        donuts = Object.entries(d.byUF).filter(([uf]) => CENTROIDS[uf]).map(([uf, v]) => {
          const [cx, cy] = CENTROIDS[uf];
          const r = mapMode === "mix" ? VW * 0.032
            : (VW * 0.014 + Math.sqrt(v.qtd / maxQty) * (VW * 0.05 - VW * 0.014));
          const sw = r * 0.55;
          let segs;
          if (mapMode === "cultura") {
            segs = topNPlusOutros(v.culturas, MODEL_TOP_N).map((e) => ({ qtd: e.qtd, color: colorForCultura(e.key), label: e.key === "OUTROS" ? "Outros" : e.key }));
          } else {
            segs = topNPlusOutros(v.modelos, MODEL_TOP_N).map((e) => ({ qtd: e.qtd, color: colorForModel(e.key), label: e.key === "OUTROS" ? "Outros" : e.key }));
          }
          const cls = ["cmg-donut"];
          if (selectedState && selectedState !== uf) cls.push("cmg-dim");
          const fs = Math.max(10, r * 0.34);
          return `<g class="${cls.join(" ")}" data-uf="${uf}">
            <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r + sw / 2 + 1.5).toFixed(1)}" fill="#0a0d16" opacity=".55"/>
            ${donutSvg(cx, cy, r, sw, segs)}
            <text class="cmg-donut-lbl" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="${fs.toFixed(1)}">${uf}</text>
          </g>`;
        }).join("");
      } else {
        donuts = Object.keys(CENTROIDS).filter((uf) => d.byUF[uf]).map((uf) => {
          const [cx, cy] = CENTROIDS[uf];
          return `<text class="cmg-price-lbl" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="13">${uf}</text>`;
        }).join("");
      }

      return `<svg viewBox="${(VW * (1 - zoom) / 2).toFixed(1)} ${(VH * (1 - zoom) / 2).toFixed(1)} ${(VW * zoom).toFixed(1)} ${(VH * zoom).toFixed(1)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mapa de distribuição geográfica de vendas de máquinas">
        <g>${states}</g><g>${donuts}</g>
      </svg>`;
    }

    // ------------------------------------------------------------ blocos
    function renderKpis(d) {
      const price = avgPrice(d.totVal, d.totQtd);
      const prevPrice = avgPrice(prevTotals.val, prevTotals.qtd);
      const leaderModel = topNPlusOutros(d.byModeloBR, 1)[0];
      const leaderModelReal = Object.entries(d.byModeloBR).sort((a, b) => b[1].qtd - a[1].qtd)[0];
      const leaderUF = Object.entries(d.byUF).sort((a, b) => b[1].qtd - a[1].qtd)[0];
      // Icones sao PNGs de verdade (pedido do usuario, cansado de SVG feito a
      // mao) — cada um ja vem com seu proprio "tile" glass/neon, entao o
      // .icon aqui nao aplica fundo colorido, so encaixa a imagem.
      // ?v= evita servir icone antigo do cache do service worker (sw.js
      // cacheia por URL exata) quando o PNG e trocado sem mudar o nome.
      const ICON_BASE = "src/modules/reports/icons/";
      const ICON_V = "20260807c";
      const kpiImg = (file, val, label, delta) => `<div class="cmg-kpi">
        <span class="icon img"><img src="${ICON_BASE}${file}?v=${ICON_V}" alt="" loading="lazy"></span>
        <div class="body"><div class="v">${val}</div><div class="l">${label}</div>${delta || ""}</div>
      </div>`;
      return `<div class="cmg-kpis">
        ${kpiImg("kpi-tractor.png", nf(d.totQtd), "Máquinas vendidas", deltaBadge(d.totQtd, prevTotals.qtd))}
        ${kpiImg("kpi-faturamento.png", fmtMoneyShort(d.totVal), "Faturamento", deltaBadge(d.totVal, prevTotals.val))}
        ${kpiImg("kpi-preco.png", price != null ? fmtMoneyShort(price) : "—", "Preço médio", price != null && prevPrice != null ? deltaBadge(price, prevPrice) : "")}
        ${kpiImg("kpi-trofeu.png", leaderModelReal ? leaderModelReal[0] : "—", `Modelo líder${leaderModelReal ? " · " + fmtPct(leaderModelReal[1].qtd / (d.totQtd || 1)) : ""}`, "")}
        ${kpiImg("kpi-brasil.png", leaderUF ? leaderUF[0] : "—", leaderUF ? `Maior mercado · ${fmtPct(leaderUF[1].qtd / (d.totQtd || 1))}` : "Maior mercado", "")}
      </div>`;
    }

    function renderRanking(d) {
      const arr = Object.entries(d.byUF).map(([uf, v]) => ({ uf, qtd: v.qtd, val: v.val })).sort((a, b) => b.qtd - a.qtd);
      const shown = showAllRanking ? arr : arr.slice(0, 5);
      const maxQtd = arr.length ? arr[0].qtd : 1;
      const rows = shown.map((r, i) => {
        const price = avgPrice(r.val, r.qtd);
        return `<tr class="${selectedState === r.uf ? "sel" : ""}" data-uf="${r.uf}">
          <td><span class="cmg-rk">${i + 1}</span></td>
          <td><strong>${r.uf}</strong></td>
          <td class="num">
            <div class="cmg-uf-bar-wrap">
              <div class="cmg-uf-bar"><i style="width:${maxQtd ? (100 * r.qtd / maxQtd) : 0}%"></i></div>
              <span>${nf(r.qtd)}</span>
            </div>
          </td>
          <td class="num">${fmtPct(d.totQtd ? r.qtd / d.totQtd : 0)}</td>
          <td class="num">${price != null ? fmtMoneyShort(price) : "—"}</td>
        </tr>`;
      }).join("");
      return `<div class="cmg-card">
        <div class="cmg-card-head"><h3>Top Estados</h3></div>
        <div class="cmg-side">
          ${arr.length ? `<table>
            <colgroup><col style="width:16px"><col style="width:15%"><col style="width:34%"><col style="width:17%"><col style="width:26%"></colgroup>
            <thead><tr><th></th><th>UF</th><th class="num">Qtd</th><th class="num">Part</th><th class="num">Preço médio</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>` : `<div class="cmg-note" style="padding:12px 0">Sem dados no período/filtros.</div>`}
          ${arr.length > 5 ? `<button class="cmg-more" id="cmg-toggle-ranking">${showAllRanking ? "Ver top 5" : "Ver todos os estados ›"}</button>` : ""}
        </div>
      </div>`;
    }

    function scopeForDetail(d) {
      if (selectedState && d.byUF[selectedState]) {
        const uf = d.byUF[selectedState];
        return { label: STATE_NAMES[selectedState] ? STATE_NAMES[selectedState].toUpperCase() : selectedState, modelos: uf.modelos, culturas: uf.culturas, qtd: uf.qtd, val: uf.val };
      }
      return { label: "BRASIL", modelos: d.byModeloBR, culturas: d.byCulturaBR, qtd: d.totQtd, val: d.totVal };
    }

    function renderMixModelo(scope) {
      const list = topNPlusOutros(scope.modelos, MODEL_TOP_N);
      const max = list.length ? Math.max(...list.map((e) => e.qtd)) : 1;
      const rows = list.map((e) => `<div class="cmg-bar-row">
        <span class="nm" title="${escapeHtml(e.key)}">${escapeHtml(e.key)}</span>
        <div class="cmg-bar-track"><div class="cmg-bar-fill" style="width:${max ? (100 * e.qtd / max) : 0}%;background:${colorForModel(e.key)}"></div></div>
        <span class="cmg-bar-pct">${fmtPct(scope.qtd ? e.qtd / scope.qtd : 0)}</span>
      </div>`).join("");
      return `<div class="cmg-card">
        <div class="cmg-card-head"><h3>Mix por Modelo — ${escapeHtml(scope.label)}</h3></div>
        <div class="cmg-bars">${rows || `<div class="cmg-note" style="padding:0">Sem dados.</div>`}</div>
      </div>`;
    }

    function renderCultura(scope) {
      const list = ["Grãos", "Pecuária"].map((c) => ({ key: c, ...(scope.culturas[c] || { qtd: 0, val: 0 }) })).filter((e) => e.qtd > 0);
      const outrosQ = Object.entries(scope.culturas).filter(([k]) => k !== "Grãos" && k !== "Pecuária").reduce((a, [, v]) => a + v.qtd, 0);
      if (outrosQ > 0) list.push({ key: "Outros", qtd: outrosQ });
      const r = 46, sw = 20, cx = 55, cy = 55;
      const donut = donutSvg(cx, cy, r, sw, list.map((e) => ({ qtd: e.qtd, color: colorForCultura(e.key) })));
      const legend = list.map((e) => `<div class="cmg-cult-item">
        <span class="nm"><span class="cmg-lg-dot" style="background:${colorForCultura(e.key)}"></span>${escapeHtml(e.key)}<span class="sub"> · ${nf(e.qtd)} máquinas</span></span>
        <span class="pct" style="color:${colorForCultura(e.key)}">${fmtPct(scope.qtd ? e.qtd / scope.qtd : 0)}</span>
      </div>`).join("");
      return `<div class="cmg-card">
        <div class="cmg-card-head"><h3>Cultura</h3></div>
        <div class="cmg-cult">
          <svg width="110" height="110" viewBox="0 0 110 110">${donut}</svg>
          <div class="cmg-cult-legend">${legend || `<div class="cmg-note" style="padding:0">Sem dados.</div>`}</div>
        </div>
      </div>`;
    }

    function renderPrecoMedio(d, scope) {
      const selected = !!selectedState;
      let title = "Preço Médio", rows;
      if (selected) {
        const list = topNPlusOutros(scope.modelos, MODEL_TOP_N).filter((e) => e.key !== "OUTROS");
        const max = list.length ? Math.max(...list.map((e) => avgPrice(e.val, e.qtd) || 0)) : 1;
        rows = list.map((e) => {
          const p = avgPrice(e.val, e.qtd);
          return `<div class="cmg-price-row"><span class="nm" title="${escapeHtml(e.key)}">${escapeHtml(e.key)}</span>
            <div class="cmg-bar-track"><div class="cmg-bar-fill" style="width:${p && max ? (100 * p / max) : 0}%;background:#8b5cf6"></div></div>
            <span class="v">${p != null ? fmtMoneyShort(p) : "—"}</span></div>`;
        }).join("");
      } else {
        const list = Object.entries(d.byUF).map(([uf, v]) => ({ uf, p: avgPrice(v.val, v.qtd) })).filter((e) => e.p != null).sort((a, b) => b.p - a.p).slice(0, 5);
        const max = list.length ? list[0].p : 1;
        rows = list.map((e) => `<div class="cmg-price-row"><span class="nm">${e.uf}</span>
          <div class="cmg-bar-track"><div class="cmg-bar-fill" style="width:${max ? (100 * e.p / max) : 0}%;background:#8b5cf6"></div></div>
          <span class="v">${fmtMoneyShort(e.p)}</span></div>`).join("");
      }
      return `<div class="cmg-card">
        <div class="cmg-card-head"><h3>${title}${selected ? " por modelo — " + escapeHtml(scope.label) : ""}</h3></div>
        <div class="cmg-price-list">${rows || `<div class="cmg-note" style="padding:0">Sem dados.</div>`}</div>
      </div>`;
    }

    function renderComparativo(d, scope) {
      if (!selectedState) return "";
      const list = topNPlusOutros(scope.modelos, MODEL_TOP_N);
      const rows = list.map((e) => {
        const ufShare = scope.qtd ? e.qtd / scope.qtd : 0;
        const brEntry = d.byModeloBR[e.key];
        const brQtd = e.key === "OUTROS"
          ? Object.entries(d.byModeloBR).filter(([k]) => !list.some((l) => l.key === k)).reduce((a, [, v]) => a + v.qtd, 0) || (brEntry ? brEntry.qtd : 0)
          : (brEntry ? brEntry.qtd : 0);
        const brShare = d.totQtd ? brQtd / d.totQtd : 0;
        const dpp = (ufShare - brShare) * 100;
        return `<tr><td>${e.key === "OUTROS" ? "Outros" : `<span class="cmg-lg-dot" style="background:${colorForModel(e.key)}"></span>${escapeHtml(e.key)}`}</td>
          <td>${fmtPct(ufShare)}</td><td>${fmtPct(brShare)}</td>
          <td class="${dpp >= 0 ? "pos" : "neg"}">${dpp >= 0 ? "+" : ""}${dpp.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.</td></tr>`;
      }).join("");
      return `<div class="cmg-card cmg-cmp">
        <div class="cmg-card-head"><h3>Comparativo Mix — ${escapeHtml(scope.label)} × Brasil</h3></div>
        <div style="padding:12px 16px 16px"><table>
          <thead><tr><th>Modelo</th><th>${escapeHtml(scope.label)}</th><th>Brasil</th><th>Δ</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
    }

    // ------------------------------------------------------------ render
    function render(container) {
      ensureStyle();
      hostContainer = container;
      if (!isSupabaseConfigured()) {
        container.innerHTML = `<div class="cmg"><div class="cmg-empty">Configuração do Supabase ausente.</div></div>`;
        return;
      }
      const d = derive();
      const empty = !loading && !lastError && rows.length === 0;
      container.innerHTML = `
        <div class="cmg ${loading ? "cmg-skel" : ""}">
          ${selectedState ? `<div class="cmg-crumb"><a data-crumb-brasil>Brasil</a> &nbsp;›&nbsp; ${escapeHtml(STATE_NAMES[selectedState] || selectedState)}</div>` : ""}
          ${renderFilterBar()}
          ${lastError ? `<div class="cmg-empty">Não foi possível carregar os dados. Tente novamente em instantes.<br><button id="cmg-retry">Tentar novamente</button></div>`
            : empty ? `<div class="cmg-empty">Nenhuma venda de máquinas encontrada para os filtros selecionados.<br><button id="cmg-clear-filters">Limpar filtros</button></div>` : `
          ${renderKpis(d)}
          <div class="cmg-row2">
            <div class="cmg-card cmg-mapcard">
              <div class="cmg-mapwrap" id="cmg-mapwrap">
                <div class="cmg-zoom"><button data-z="in" title="Aproximar">+</button><button data-z="reset" title="Início">⟳</button><button data-z="out" title="Afastar">−</button></div>
                ${loading ? `<div class="cmg-empty">Carregando…</div>` : mapSvg(d)}
              </div>
              ${mapMode === "precoMedio" ? `<div class="cmg-legend"><span>Preço médio</span><div class="cmg-lg-scale"><span>menor</span><div class="cmg-lg-bar"></div><span>maior</span></div></div>`
                : mapMode === "cultura" ? `<div class="cmg-legend">${Object.entries(CULTURA_COLORS).filter(([k]) => k !== "Outros").map(([k, c]) => `<span><span class="cmg-lg-dot" style="background:${c}"></span>${k}</span>`).join("")}</div>`
                : `<div class="cmg-legend">${topNPlusOutros(mapMode === "cultura" ? d.byCulturaBR : d.byModeloBR, MODEL_TOP_N).map((e) => `<span><span class="cmg-lg-dot" style="background:${colorForModel(e.key)}"></span>${e.key === "OUTROS" ? "Outros" : escapeHtml(e.key)}</span>`).join("")}</div>`}
              <div class="cmg-note">Tamanho do gráfico = quantidade de máquinas vendidas. Clique num estado pra detalhar.</div>
            </div>
            ${renderRanking(d)}
          </div>
          <div class="cmg-row3">
            ${renderMixModelo(scopeForDetail(d))}
            ${renderCultura(scopeForDetail(d))}
            ${renderPrecoMedio(d, scopeForDetail(d))}
          </div>
          ${renderComparativo(d, scopeForDetail(d))}
          `}
        </div>`;
      bind(container);
    }

    // ------------------------------------------------------------ eventos
    let tt = null;
    function ensureTt() { if (!tt) { tt = document.createElement("div"); tt.className = "cmg-tt"; tt.hidden = true; document.body.appendChild(tt); } return tt; }
    function showTt(e, t, m) { const el = ensureTt(); el.hidden = false; el.innerHTML = `<div class="t">${t}</div><div class="m">${m}</div>`; el.style.left = Math.min(e.clientX + 14, window.innerWidth - 260) + "px"; el.style.top = (e.clientY + 14) + "px"; }
    function hideTt() { if (tt) tt.hidden = true; }

    function closeAllPopovers(container) { openPopover = null; render(container); }

    function bindDocClose() {
      if (docCloseBound) return; docCloseBound = true;
      document.addEventListener("click", (e) => {
        if (!hostContainer || !document.body.contains(hostContainer)) return;
        if (!openPopover) return;
        if (e.target.closest(".cmg-chip")) return;
        closeAllPopovers(hostContainer);
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && openPopover && hostContainer) closeAllPopovers(hostContainer);
      });
    }

    function selectState(uf) {
      selectedState = selectedState === uf ? null : uf;
      showAllRanking = false;
    }

    function bind(container) {
      // filtros: abrir/fechar popover
      container.querySelectorAll(".cmg-chip").forEach((chip) => {
        chip.addEventListener("click", (e) => {
          if (e.target.closest(".cmg-pop")) return;
          const key = chip.dataset.chip;
          openPopover = openPopover === key ? null : key;
          render(container);
        });
      });
      container.querySelectorAll(".cmg-pop").forEach((p) => p.addEventListener("click", (e) => e.stopPropagation()));

      // periodo: segue o cabecalho do site, so o toggle Mes/YTD/Ano e local
      container.querySelector("#cmg-period")?.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-p]"); if (!b) return;
        period = b.dataset.p; reloadAndRender(container);
      });

      // regiao
      container.querySelectorAll('[data-regiao]').forEach((cb) => cb.addEventListener("change", () => {
        const ufs = ufsOfRegiao(cb.dataset.regiao);
        if (cb.checked) ufs.forEach((u) => selUFs.add(u)); else ufs.forEach((u) => selUFs.delete(u));
        reloadAndRender(container);
      }));
      container.querySelector('[data-clear="regiao"]')?.addEventListener("click", () => { selUFs.clear(); reloadAndRender(container); });

      // uf
      container.querySelectorAll('[data-uf]').forEach((cb) => {
        if (cb.tagName !== "INPUT") return;
        cb.addEventListener("change", () => {
          if (cb.checked) selUFs.add(cb.dataset.uf); else selUFs.delete(cb.dataset.uf);
          reloadAndRender(container);
        });
      });
      container.querySelector('[data-clear="uf"]')?.addEventListener("click", () => { selUFs.clear(); reloadAndRender(container); });

      // cultura / modelo
      container.querySelectorAll('input[name="cmg-cultura"]').forEach((r) => r.addEventListener("change", () => { selCultura = r.value; reloadAndRender(container); }));
      container.querySelectorAll('input[name="cmg-modelo"]').forEach((r) => r.addEventListener("change", () => { selModelo = r.value; reloadAndRender(container); }));
      container.querySelectorAll('input[name="cmg-equipe"]').forEach((r) => r.addEventListener("change", () => {
        const [tipo, valor] = r.value.split("|");
        equipe = tipo ? { tipo, valor } : { tipo: "", valor: "" };
        reloadAndRender(container);
      }));

      // modo do mapa
      container.querySelector("#cmg-mode")?.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-mode]"); if (!b) return;
        mapMode = b.dataset.mode; render(container);
      });

      // zoom
      container.querySelector(".cmg-zoom")?.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-z]"); if (!b) return;
        if (b.dataset.z === "in") zoom = Math.max(0.35, zoom - 0.2);
        else if (b.dataset.z === "out") zoom = Math.min(ZOOM_MAX, zoom + 0.2);
        else zoom = 1;
        render(container);
      });

      // clique no estado / donut / ranking / crumb
      container.querySelectorAll(".cmg-state, .cmg-donut").forEach((el) => {
        el.addEventListener("click", (e) => { e.stopPropagation(); selectState(el.dataset.uf); render(container); });
        el.addEventListener("mousemove", (e) => {
          const uf = el.dataset.uf; const d = derive(); const v = d.byUF[uf];
          if (!v) { showTt(e, `${STATE_NAMES[uf] || uf} (${uf})`, "Nenhuma máquina vendida no período selecionado."); return; }
          const price = avgPrice(v.val, v.qtd);
          const leaderModel = Object.entries(v.modelos).sort((a, b) => b[1].qtd - a[1].qtd)[0];
          // fatia especifica sob o mouse (donut de modelo ou de cultura) —
          // mostrada como linha extra, abaixo do Modelo lider.
          const segEl = e.target.closest(".cmg-donut-seg");
          const segLine = segEl && segEl.dataset.model
            ? `<br><strong style="color:${escapeHtml(segEl.dataset.color || "")}">${escapeHtml(segEl.dataset.model)} — ${fmtPct(Number(segEl.dataset.share))}</strong>`
            : "";
          showTt(e, `${STATE_NAMES[uf] || uf} (${uf})`,
            `Máquinas: ${nf(v.qtd)}<br>Faturamento: ${fmtMoneyShort(v.val)}<br>Preço médio: ${price != null ? fmtMoneyShort(price) : "—"}<br>% Brasil: ${fmtPct(d.totQtd ? v.qtd / d.totQtd : 0)}` +
            (leaderModel ? `<br>Modelo líder: ${escapeHtml(leaderModel[0])} — ${fmtPct(v.qtd ? leaderModel[1].qtd / v.qtd : 0)}` : "") +
            segLine);
        });
        el.addEventListener("mouseleave", hideTt);
      });
      container.querySelectorAll(".cmg-side tbody tr[data-uf]").forEach((tr) => {
        tr.addEventListener("click", () => { selectState(tr.dataset.uf); render(container); });
      });
      container.querySelector("#cmg-toggle-ranking")?.addEventListener("click", () => { showAllRanking = !showAllRanking; render(container); });
      container.querySelector("[data-crumb-brasil]")?.addEventListener("click", () => { selectedState = null; render(container); });

      container.querySelector("#cmg-clear-filters")?.addEventListener("click", () => {
        selUFs.clear(); selCultura = ""; selModelo = ""; equipe = { tipo: "", valor: "" }; selectedState = null;
        reloadAndRender(container);
      });
      container.querySelector("#cmg-retry")?.addEventListener("click", () => reloadAndRender(container));

      bindDocClose();
    }

    async function reloadAndRender(container) {
      openPopover = null;
      loading = true; render(container);
      try { await loadData(); } catch (e) { console.error(e); }
      loading = false; render(container);
    }

    function renderSelectedMapaGeografico(container, reportId) {
      if (reportId !== REPORT_ID) return false;
      syncFromHeader();
      hideTt();
      if (loadedKey === paramsKey() && (rows.length || loadedKey !== null)) {
        render(container);
      } else {
        loading = true; render(container);
        loadData().then(() => render(container)).catch((e) => { console.error(e); loading = false; render(container); });
      }
      return true;
    }

    return { renderSelectedMapaGeografico, REPORT_ID };
  }

  window.VECTON_COMERCIAL_MAPA_GEOGRAFICO = { createComercialMapaGeograficoModule };
})(window);
