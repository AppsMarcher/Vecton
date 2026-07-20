(function attachVectonComercialPainel(window) {
  // Relatorio "Painel de Vendas" — clone do mockup dark (hero Marcher Brasil +
  // 6 cards de coordenacao + detalhe territorio a territorio), consumindo a RPC
  // comercial_painel_vendas (agregacao server-side). Classes prefixadas cvp-
  // pra nao colidir com o CSS do VectonPlan.
  function createComercialPainelModule(deps) {
    const {
      escapeHtml,
      formatMonthLabel,
      state,
      resolveOrganizationId,
      fetchSupabaseRowsSafe,
      callSupabaseRpc,
      isSupabaseConfigured
    } = deps;

    const REPORT_ID = "comercialPainel";
    const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const COORD_STYLE = {
      "Sul":        { accent: "#4f7cff", soft: "rgba(79,124,255,0.16)" },
      "Norte":      { accent: "#14b8a6", soft: "rgba(20,184,166,0.16)" },
      "Oeste":      { accent: "#8b5cf6", soft: "rgba(139,92,246,0.16)" },
      "Pecuária":   { accent: "#f59e0b", soft: "rgba(245,158,11,0.16)" },
      "Exportação": { accent: "#22c55e", soft: "rgba(34,197,94,0.16)" },
      "Peças":      { accent: "#ef4444", soft: "rgba(239,68,68,0.16)" }
    };
    const COORD_ORDER = ["Sul", "Norte", "Oeste", "Pecuária", "Exportação", "Peças"];
    const METRICS = ["fat", "cart", "meta", "y1", "y2", "y3"];

    let period = "ytd";
    let month = Number(state.currentPeriod?.month || 6);
    let year = Number(state.currentPeriod?.year || 2026);
    let currentCoord = null;
    let scenarioId = null;
    let scenarios = [];
    let scenariosYear = null;
    let coords = [];              // [{nome,gestor,terrs:{terr:{grao,pecuaria,pecas}}}] — por coordenacao de ROTEAMENTO (totais)
    let regioes = [];             // idem, mas por CASA geografica (regiao=coord do Grao) — detalhe matricial
    let tipos = [];               // [{tipo, fat_val, cart_val, meta_val, y1_val, y2_val, y3_val}] (Pecas/Transgrain/Acessorios)
    let loadedKey = null;         // guarda params da ultima carga
    let loading = false;

    // ---------------------------------------------------------------- CSS

    function ensureStyle() {
      if (document.getElementById("cvp-style")) return;
      const s = document.createElement("style");
      s.id = "cvp-style";
      s.textContent = `
        .cvp { --cvp-bg:#09090a; --cvp-bg-soft:#0e0e10; --cvp-panel:#121317; --cvp-panel-hover:#191b20; --cvp-line:#2a2d34; --cvp-text:#fff; --cvp-soft:#a1a7b3; --cvp-faint:#6b7280; --cvp-pos:#4ade80; --cvp-neg:#f87171; color:var(--cvp-text); }
        .cvp * { box-sizing:border-box; }
        .cvp-header { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; flex-wrap:wrap; margin-bottom:18px; }
        .cvp-h1 { font-size:20px; font-weight:600; margin:0; }
        .cvp-kicker { font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--cvp-faint); margin:0 0 4px; }
        .cvp-controls { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .cvp-period { display:flex; align-items:center; gap:8px; background:var(--cvp-panel); border:1px solid var(--cvp-line); border-radius:12px; padding:6px; }
        .cvp-period select { background:transparent; border:none; color:var(--cvp-text); font-size:13px; font-family:inherit; padding:6px 8px; outline:none; }
        .cvp-seg { display:flex; gap:2px; background:var(--cvp-bg-soft); border-radius:8px; padding:2px; }
        .cvp-seg button { border:none; background:transparent; color:var(--cvp-soft); font-size:12px; font-family:inherit; font-weight:500; padding:6px 12px; border-radius:6px; cursor:pointer; }
        .cvp-seg button.active { background:#4f7cff; color:#fff; }
        .cvp-tabs { display:flex; gap:6px; margin-bottom:16px; }
        .cvp-tabs button { border:1px solid var(--cvp-line); background:var(--cvp-panel); color:var(--cvp-soft); font-size:12.5px; font-family:inherit; font-weight:500; padding:8px 14px; border-radius:10px; cursor:pointer; }
        .cvp-tabs button.active { border-color:#4f7cff; color:var(--cvp-text); background:var(--cvp-panel-hover); }
        .cvp-hero { display:flex; flex-direction:column; gap:14px; background:var(--cvp-panel); border:1px solid var(--cvp-line); border-radius:16px; padding:18px 22px; }
        .cvp-hero-left { display:flex; align-items:center; gap:14px; padding-bottom:14px; border-bottom:1px solid var(--cvp-line); }
        .cvp-hero-av { width:46px; height:46px; border-radius:50%; background:rgba(255,255,255,.08); display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:600; }
        .cvp-hero-name { font-size:17px; font-weight:600; margin:0; }
        .cvp-hero-sub { font-size:12px; color:var(--cvp-faint); margin:2px 0 0; }
        .cvp-hero-stats { display:flex; align-items:baseline; gap:28px; }
        .cvp-hero-stat { text-align:right; }
        .cvp-hero-label { font-size:11px; color:var(--cvp-faint); text-transform:uppercase; letter-spacing:.05em; }
        .cvp-hero-val { font-size:26px; font-weight:600; font-variant-numeric:tabular-nums; }
        .cvp-hero-val .u { font-size:13px; color:var(--cvp-faint); font-weight:500; margin-left:4px; }
        .cvp-hero-secondary { font-size:12.5px; color:var(--cvp-soft); font-variant-numeric:tabular-nums; margin-top:2px; }
        .cvp-hero-gauge { margin-left:auto; display:flex; align-items:center; gap:10px; }
        .cvp-hero-gauge-ring { position:relative; width:54px; height:54px; flex-shrink:0; }
        .cvp-hero-gauge-ring svg { transform:rotate(-90deg); }
        .cvp-hero-gauge-pct { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; font-variant-numeric:tabular-nums; }
        .cvp-hero-gauge-label { font-size:10px; color:var(--cvp-faint); text-transform:uppercase; letter-spacing:.04em; text-align:right; line-height:1.5; }
        .cvp-hero-gauge-label b { display:block; color:var(--cvp-soft); font-size:11.5px; font-weight:600; text-transform:none; letter-spacing:0; }
        .cvp-delta { font-size:12px; font-variant-numeric:tabular-nums; }
        .cvp-delta.pos { color:var(--cvp-pos); } .cvp-delta.neg { color:var(--cvp-neg); }
        .cvp-section { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--cvp-faint); margin:22px 0 10px; }
        .cvp-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; margin-bottom:24px; }
        .cvp-card { background:var(--cvp-panel); border:1px solid var(--cvp-line); border-top:3px solid var(--accent); border-radius:16px; padding:14px 16px; cursor:pointer; text-align:left; }
        .cvp-card.active { background:var(--cvp-panel-hover); border-color:var(--accent); }
        .cvp-card-top { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
        .cvp-card-av { width:28px; height:28px; border-radius:50%; background:var(--accent-soft); color:var(--accent); display:flex; align-items:center; justify-content:center; font-size:10.5px; font-weight:600; }
        .cvp-card-name { font-size:14px; font-weight:600; margin:0; }
        .cvp-card-sub { font-size:11px; color:var(--cvp-faint); margin:1px 0 0; }
        .cvp-qty { font-size:24px; font-weight:600; font-variant-numeric:tabular-nums; line-height:1; }
        .cvp-qty .u { font-size:11.5px; color:var(--cvp-faint); font-weight:500; margin-left:3px; }
        .cvp-split { display:flex; gap:14px; margin:8px 0; }
        .cvp-split span { font-size:11px; color:var(--cvp-soft); } .cvp-split b { color:var(--cvp-text); font-variant-numeric:tabular-nums; }
        .cvp-fatline { font-size:11.5px; color:var(--cvp-faint); font-variant-numeric:tabular-nums; border-top:1px solid var(--cvp-line); padding-top:8px; margin-top:4px; display:flex; justify-content:space-between; }
        .cvp-detail { background:var(--cvp-panel); border:1px solid var(--cvp-line); border-radius:16px; overflow:hidden; }
        .cvp-detail-head { display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid var(--cvp-line); flex-wrap:wrap; gap:6px; }
        .cvp-detail-head h2 { font-size:15px; font-weight:600; margin:0; display:flex; align-items:center; gap:8px; text-transform:uppercase; letter-spacing:.03em; }
        .cvp-dot { width:8px; height:8px; border-radius:50%; background:var(--accent); }
        .cvp-note { font-size:12px; color:var(--cvp-faint); text-transform:none; letter-spacing:0; }
        .cvp-mini-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; padding:16px; }
        .cvp-mini { border:1px solid var(--cvp-line); border-radius:10px; overflow:hidden; background:var(--cvp-bg-soft); min-width:0; }
        .cvp-mini-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; padding:9px 10px; background:rgba(255,255,255,.03); border-bottom:1px solid var(--cvp-line); }
        .cvp-mini-terr { font-size:13px; font-weight:700; letter-spacing:.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .cvp-mini-terr .cvp-mini-sep { color:var(--cvp-faint); font-weight:400; margin:0 2px; }
        .cvp-mini-name { font-size:10.5px; color:var(--cvp-faint); font-weight:500; white-space:nowrap; }
        .cvp-mini-status { display:flex; align-items:center; gap:6px; font-size:10.5px; font-weight:600; color:var(--cvp-soft); white-space:nowrap; flex-shrink:0; }
        .cvp-mini-status::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--dot-color,#6b7280); box-shadow:0 0 0 3px var(--dot-glow,rgba(107,114,128,.15)); flex-shrink:0; }
        .cvp-mini.sum { border-color:var(--accent); } .cvp-mini.sum .cvp-mini-head { background:var(--accent-soft); } .cvp-mini.sum .cvp-mini-terr { color:var(--accent); }
        .cvp-mini-wrap { overflow-x:auto; }
        .cvp-mini-tbl { width:100%; border-collapse:collapse; table-layout:fixed; }
        .cvp-mini-tbl th, .cvp-mini-tbl td { padding:5px 4px; font-size:10.3px; text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .cvp-mini-tbl th:first-child, .cvp-mini-tbl td:first-child { width:78px; text-align:left; }
        .cvp-mini-tbl th { color:var(--cvp-faint); font-weight:500; font-size:9px; text-transform:uppercase; letter-spacing:.03em; }
        .cvp-mini-tbl td:first-child { color:var(--cvp-soft); font-size:9.5px; text-transform:uppercase; letter-spacing:.03em; }
        .cvp-mini-tbl tbody tr:not(:last-child) td { border-bottom:1px solid rgba(255,255,255,.05); }
        .cvp-mini-tbl tr.fat td { font-weight:600; font-size:9.3px; color:var(--cvp-text); border-top:1px solid var(--cvp-line); }
        .cvp-mini-tbl tr.tkt td { font-size:9.3px; color:var(--cvp-soft); }
        .cvp-empty { padding:40px; text-align:center; color:var(--cvp-faint); }
        .cvp-hero-tbl { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
        .cvp-hero-tbl th, .cvp-hero-tbl td { padding:6px 8px; font-size:12px; text-align:right; white-space:nowrap; }
        .cvp-hero-tbl th:first-child, .cvp-hero-tbl td:first-child { text-align:left; padding-left:0; }
        .cvp-hero-tbl th { color:var(--cvp-faint); font-weight:500; font-size:10px; text-transform:uppercase; letter-spacing:.03em; }
        .cvp-hero-tbl td:first-child { color:var(--cvp-soft); font-size:10.5px; text-transform:uppercase; letter-spacing:.03em; }
        .cvp-hero-tbl tbody tr:not(:last-child) td { border-bottom:1px solid rgba(255,255,255,.05); }
        .cvp-hero-tbl tr.fat td { font-weight:600; color:var(--cvp-text); border-top:1px solid var(--cvp-line); }
        .cvp-hero-tbl tr.tkt td { color:var(--cvp-soft); }
        .cvp-hero-row { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; margin-bottom:24px; align-items:stretch; }
        .cvp-hero { grid-column:span 4; margin-bottom:0; }
        .cvp-hero-side { display:flex; flex-direction:column; grid-column:span 2; background:var(--cvp-panel); border:1px solid var(--cvp-line); border-radius:16px; padding:18px 20px; min-width:0; }
        .cvp-side-title { display:flex; align-items:center; gap:8px; font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--cvp-faint); padding-bottom:14px; margin-bottom:4px; border-bottom:1px solid var(--cvp-line); }
        .cvp-side-title::before { content:""; width:8px; height:8px; border-radius:50%; background:#ef4444; box-shadow:0 0 0 3px rgba(239,68,68,.15); }
        .cvp-side-tbl { width:100%; }
        .cvp-side-tbl th, .cvp-side-tbl td { padding:5px 6px; font-size:11px; }
        .cvp-side-tbl th:first-child, .cvp-side-tbl td:first-child { padding-left:0; }
        .cvp-side-meter { margin-top:auto; padding-top:16px; }
        .cvp-side-meter-top { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:7px; }
        .cvp-side-meter-top .lbl { color:var(--cvp-faint); text-transform:uppercase; letter-spacing:.04em; font-size:10px; }
        .cvp-side-meter-top .pct { font-weight:600; font-variant-numeric:tabular-nums; font-size:14px; }
        .cvp-side-bar { height:6px; border-radius:99px; background:var(--cvp-bg-soft); overflow:hidden; }
        .cvp-side-bar-fill { height:100%; border-radius:99px; background:linear-gradient(90deg,#4f7cff,#22c55e); transition:width .3s ease; }
        .cvp-print { display:flex; align-items:center; gap:6px; background:var(--cvp-panel); border:1px solid var(--cvp-line); border-radius:12px; color:var(--cvp-soft); font-size:12.5px; font-family:inherit; font-weight:500; padding:9px 14px; cursor:pointer; }
        .cvp-print:hover { color:var(--cvp-text); border-color:#4f7cff; }
        .cvp-print:disabled { opacity:.55; cursor:default; }
        .cvp-print svg { width:14px; height:14px; }
        .cvp-drill { cursor:pointer; }
        .cvp-drill:hover { color:#7aa2ff; text-decoration:underline; text-underline-offset:2px; }
        .cvp-pop-backdrop { position:fixed; inset:0; z-index:9800; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; padding:32px; }
        .cvp-pop { background:#121317; border:1px solid #2a2d34; border-radius:14px; box-shadow:0 30px 80px rgba(0,0,0,.65); color:#fff; width:min(1240px,96vw); max-height:86vh; display:flex; flex-direction:column; overflow:hidden; }
        .cvp-pop-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 18px; border-bottom:1px solid #2a2d34; font-size:11px; font-weight:600; color:#a1a7b3; text-transform:uppercase; letter-spacing:.05em; }
        .cvp-pop-x { background:none; border:none; color:#6b7280; font-size:16px; cursor:pointer; line-height:1; padding:0 2px; }
        .cvp-pop-x:hover { color:#fff; }
        .cvp-pop-body { overflow:auto; }
        .cvp-pop-tbl { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
        .cvp-pop-tbl th, .cvp-pop-tbl td { padding:6px 12px; font-size:10px; text-align:left; white-space:nowrap; }
        .cvp-pop-tbl th { position:sticky; top:0; background:#121317; color:#6b7280; font-weight:500; font-size:8px; text-transform:uppercase; letter-spacing:.03em; border-bottom:1px solid #2a2d34; z-index:1; }
        .cvp-pop-tbl th[data-sort]:hover { color:#a1a7b3; }
        .cvp-pop-tbl .num { text-align:right; }
        .cvp-pop-tbl td.mut { color:#a1a7b3; }
        .cvp-pop-tbl td.neg { color:#f87171; }
        .cvp-pop-tbl tbody tr:not(:last-child) td { border-bottom:1px solid rgba(255,255,255,.05); }
        .cvp-pop-tbl tr.cvp-pop-sum td { background:rgba(255,255,255,.03); color:#cbd2dc; border-top:1px solid rgba(255,255,255,.09); }
        .cvp-pop-tbl tr.cvp-pop-sum td:first-child { color:#a1a7b3; text-transform:uppercase; letter-spacing:.03em; font-size:9px; font-weight:600; }
        .cvp-pop-tbl tfoot td { border-top:1px solid #2a2d34; font-weight:600; color:#fff; position:sticky; bottom:0; background:#121317; }
        @media (max-width:1100px){ .cvp-grid{ grid-template-columns:repeat(3,1fr);} .cvp-mini-grid{ grid-template-columns:1fr;} .cvp-hero-row{ grid-template-columns:1fr;} .cvp-hero,.cvp-hero-side{ grid-column:auto;} }
      `;
      document.head.appendChild(s);
    }

    // ---------------------------------------------------------------- data

    function paramsKey() { return `${year}|${month}|${period}|${scenarioId || "budget"}`; }

    async function loadScenarios() {
      if (scenariosYear === year) return;
      scenarios = [];
      if (isSupabaseConfigured()) {
        try {
          const org = await resolveOrganizationId();
          const rows = await fetchSupabaseRowsSafe("forecast_scenarios", `organization_id=eq.${org}&reference_year=eq.${year}&order=created_at.asc&select=id,name`);
          scenarios = rows || [];
        } catch (e) { console.warn("cenarios:", e); scenarios = []; }
      }
      scenariosYear = year;
      if (!scenarioId || !scenarios.some((s) => s.id === scenarioId)) {
        const fcst = scenarios.find((s) => /fcst|5\s*\+\s*7/i.test(s.name));
        scenarioId = (fcst || scenarios[0])?.id || null;
      }
    }

    async function loadData() {
      loading = true;
      await loadScenarios();
      let rows = [], tiposRows = [];
      if (isSupabaseConfigured()) {
        const org = await resolveOrganizationId();
        const payload = { p_org: org, p_year: year, p_month: month, p_period: period, p_scenario_id: scenarioId };
        [rows, tiposRows] = await Promise.all([
          callSupabaseRpc("comercial_painel_vendas", payload),
          callSupabaseRpc("comercial_painel_tipos", payload)
        ]);
      }
      const tr = transform(rows || []);
      coords = tr.coords;
      regioes = tr.regioes;
      tipos = tiposRows || [];
      loadedKey = paramsKey();
      loading = false;
      if (!currentCoord || !coords.some((c) => c.nome === currentCoord)) {
        currentCoord = (coords.find((c) => c.terrs && Object.keys(c.terrs).length) || coords[0])?.nome || "Sul";
      }
    }

    function metricObj(r) {
      return {
        fat:  { q: Number(r.fat_qtd) || 0,  v: Number(r.fat_val) || 0 },
        cart: { q: Number(r.cart_qtd) || 0, v: Number(r.cart_val) || 0 },
        meta: { q: Number(r.meta_qtd) || 0, v: Number(r.meta_val) || 0 },
        y1:   { q: Number(r.y1_qtd) || 0,   v: Number(r.y1_val) || 0 },
        y2:   { q: Number(r.y2_qtd) || 0,   v: Number(r.y2_val) || 0 },
        y3:   { q: Number(r.y3_qtd) || 0,   v: Number(r.y3_val) || 0 },
        resp: r.responsavel || "",
        orfao: !!r.orfao            // responsavel == gestor da coord de roteamento -> nao vira card
      };
    }

    // Monta 2 agrupamentos: por coordenacao de ROTEAMENTO (totais/rollup) e por
    // CASA geografica (regiao = coord do Grao), pro detalhe matricial.
    function transform(rows) {
      const byCoord = {};
      const byReg = {};
      const put = (bucket, key, gestor, r) => {
        if (!key) return;
        if (!bucket[key]) bucket[key] = { nome: key, gestor: gestor || "", terrs: {} };
        const tKey = r.territorio || "Nacional";
        if (!bucket[key].terrs[tKey]) bucket[key].terrs[tKey] = { grao: null, pecuaria: null, pecas: null };
        const lk = r.linha === "Grão" ? "grao" : r.linha === "Pecuária" ? "pecuaria" : "pecas";
        bucket[key].terrs[tKey][lk] = metricObj(r);
      };
      rows.forEach((r) => {
        put(byCoord, r.coordenacao, r.gestor, r);       // roteamento
        put(byReg, r.regiao, null, r);                  // casa geografica
      });
      const order = (b) => COORD_ORDER.filter((n) => b[n]).map((n) => b[n])
        .concat(Object.values(b).filter((c) => !COORD_ORDER.includes(c.nome)));
      return { coords: order(byCoord), regioes: order(byReg) };
    }

    // ---------------------------------------------------------------- helpers

    function round(v) { return Math.round(v || 0); }
    function nf(v) { return round(v).toLocaleString("pt-BR"); }
    function fmtR$(v) { return "R$ " + nf((v || 0) / 1000) + " mil"; }

    // Total de uma coordenacao (qtd Grao/Pecuaria + valor). Cards mostram o
    // FATURADO (real); a comparacao das 3 metricas fica no hero e no detalhe.
    function coordTotals(c) {
      let grao = 0, pec = 0, val = 0;
      Object.values(c.terrs).forEach((t) => {
        if (t.grao) { grao += t.grao.fat.q; val += t.grao.fat.v; }
        if (t.pecuaria) { pec += t.pecuaria.fat.q; val += t.pecuaria.fat.v; }
        if (t.pecas) { val += t.pecas.fat.v; }
      });
      return { grao, pec, val, isPecas: c.nome === "Peças" };
    }

    // ------------------------------------------------- fusao de card por responsavel
    // Territorios como MA+PI (mesmo responsavel, Claudemir, nas duas linhas) devem
    // aparecer como 1 card só, somando tudo (fat/cart/meta/anos). Usado tanto pelo
    // detalhe ao vivo quanto pelo One Page Report — mesma regra nos dois lugares.

    function isNamedResp(resp) {
      return !!(resp && resp.trim() && resp.trim().toLowerCase() !== "a definir");
    }

    // Soma N linhas metricObj (mesma forma) em uma só.
    function sumLines(lines) {
      const present = lines.filter(Boolean);
      if (!present.length) return null;
      const acc = {}; METRICS.forEach((m) => { acc[m] = { q: 0, v: 0 }; });
      present.forEach((l) => METRICS.forEach((m) => { acc[m].q += l[m].q; acc[m].v += l[m].v; }));
      acc.resp = present[0].resp || "";
      acc.orfao = false;
      return acc;
    }

    // Recebe cards-base já resolvidos por território (1 território cada, com
    // grao/pec/resp/linhas já decididos pela regra sameResp de cada chamador) e
    // funde os que tem o MESMO responsavel NOMEADO (nunca "A definir"/vazio,
    // pra não juntar territórios distintos só por coincidência de placeholder)
    // cobrindo o MESMO conjunto de linhas em territórios diferentes.
    function mergeSameRespCards(baseCards) {
      const bySig = {}; const out = [];
      baseCards.forEach((card) => {
        const sig = isNamedResp(card.resp) ? `${card.resp}|${card.linhas.join(",")}` : null;
        if (sig && bySig[sig]) { bySig[sig].terrs.push(card.terr); bySig[sig].parts.push(card); return; }
        const grp = { terrs: [card.terr], resp: card.resp, linhas: card.linhas, parts: [card] };
        if (sig) bySig[sig] = grp;
        out.push(grp);
      });
      return out.map((g) => ({
        terr: g.terrs.join("_"),
        terrs: g.terrs,
        resp: g.resp,
        linhas: g.linhas,
        grao: sumLines(g.parts.map((p) => p.grao)),
        pec: sumLines(g.parts.map((p) => p.pec))
      }));
    }

    // ---------------------------------------------------------------- render

    function render(container) {
      ensureStyle();
      const scenOpts = scenarios.length
        ? scenarios.map((s) => `<option value="${escapeHtml(s.id)}"${s.id === scenarioId ? " selected" : ""}>${escapeHtml(s.name)}</option>`).join("")
        : `<option value="">(sem cenário)</option>`;
      container.innerHTML = `
        <div class="cvp">
          <div class="cvp-header">
            <div>
              <p class="cvp-kicker">Comercial</p>
              <h1 class="cvp-h1" id="cvp-title">Painel de Vendas — ${escapeHtml(MONTHS[month - 1])}/${year}</h1>
            </div>
            <div class="cvp-controls">
              <div class="cvp-period">
                <div class="cvp-seg" id="cvp-seg">
                  <button data-p="mes"${period === "mes" ? ' class="active"' : ""}>Mês</button>
                  <button data-p="ytd"${period === "ytd" ? ' class="active"' : ""}>YTD</button>
                  <button data-p="fy"${period === "fy" ? ' class="active"' : ""}>Ano</button>
                </div>
              </div>
              <div class="cvp-period">
                <span class="cvp-hero-label" style="padding-left:6px">Cenário</span>
                <select id="cvp-scenario">${scenOpts}</select>
              </div>
              <button type="button" class="cvp-print" id="cvp-print" title="One Page Report para impressão (PDF)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                Imprimir
              </button>
            </div>
          </div>
          <div id="cvp-hero"></div>
          <p class="cvp-section">Coordenações</p>
          <div class="cvp-grid" id="cvp-grid"></div>
          <div id="cvp-detail-wrap"></div>
        </div>
      `;
      bind(container);
      if (loading) {
        container.querySelector("#cvp-hero").innerHTML = `<div class="cvp-empty">Carregando…</div>`;
        return;
      }
      if (!coords.length) {
        container.querySelector("#cvp-hero").innerHTML = `<div class="cvp-empty">Sem dados de vendas para o período. Suba uma carga de vendas realizadas.</div>`;
        return;
      }
      renderHero(container);
      renderCards(container);
      renderDetail(container);
    }

    // Anel de atingimento de meta (Faturado/Meta) — mesmo gradiente da barra do box lateral.
    function gaugeSvg(pct) {
      const r = 21, circ = 2 * Math.PI * r;
      const clamped = Math.max(0, Math.min(pct, 100));
      const offset = circ * (1 - clamped / 100);
      const color = pct >= 100 ? "#22c55e" : "url(#cvp-hero-gauge-grad)";
      return `
        <svg viewBox="0 0 54 54" width="54" height="54">
          <defs>
            <linearGradient id="cvp-hero-gauge-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#4f7cff"/>
              <stop offset="100%" stop-color="#22c55e"/>
            </linearGradient>
          </defs>
          <circle cx="27" cy="27" r="${r}" fill="none" stroke="var(--cvp-bg-soft)" stroke-width="6"/>
          <circle cx="27" cy="27" r="${r}" fill="none" stroke="${color}" stroke-width="6"
            stroke-linecap="round" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/>
        </svg>`;
    }

    // Consolidado da empresa: qtd Grao/Pecuaria + Faturado total (inclui Pecas
    // via coords e Transgrain/Acessorios via tipos — Pecas nao dobra). Usado
    // pelo hero e pelo One Page Report.
    function companyTotals(coordsArr, tiposArr) {
      const blank = () => ({ fat: 0, cart: 0, meta: 0, y1: 0, y2: 0, y3: 0 });
      const grao = blank(), pec = blank(), fatv = blank();
      coordsArr.forEach((c) => Object.values(c.terrs).forEach((t) => {
        ["grao", "pecuaria", "pecas"].forEach((lk) => {
          const line = t[lk]; if (!line) return;
          METRICS.forEach((m) => { fatv[m] += line[m].v; });
          if (lk === "grao") METRICS.forEach((m) => { grao[m] += line[m].q; });
          if (lk === "pecuaria") METRICS.forEach((m) => { pec[m] += line[m].q; });
        });
      }));
      tiposArr.forEach((r) => {
        if (r.tipo !== "Transgrain" && r.tipo !== "Acessórios") return;
        METRICS.forEach((m) => { fatv[m] += Number(r[`${m}_val`]) || 0; });
      });
      return { grao, pec, fatv };
    }

    // Hero = mini-tabela consolidada da empresa (Grão/Pecuária qtd + Faturado R$,
    // colunas Fatur/Fat+Cart/Meta/2025/2024/2023), ao lado do nome.
    function renderHero(container) {
      const { grao, pec, fatv } = companyTotals(coords, tipos);
      const qtyRow = (o) => METRICS.map((m) => `<td>${nf(o[m])}</td>`).join("");
      const ttlRow = () => METRICS.map((m) => `<td>${nf(grao[m] + pec[m])}</td>`).join("");
      const valRow = (o) => METRICS.map((m) => `<td>${fmtR$(o[m])}</td>`).join("");
      // Ticket do hero: Faturado INTEIRO (fatv, inclui pecas/transgrain/acessorios) / TTL qtd maquinas.
      const tktRow = () => METRICS.map((m) => { const q = grao[m] + pec[m]; return `<td>${q > 0 ? fmtR$(fatv[m] / q) : "—"}</td>`; }).join("");
      // Drill do consolidado da empresa inteira (todas as coordenacoes/linhas).
      const heroScope = { label: "Marcher Brasil", linhas: ["Grão", "Pecuária"], tipos: true };
      // Atingimento de meta da empresa inteira: Fat.+Cart. (fatv.cart JA é o
      // total combinado Faturado+Carteira, nao e incremental) / Meta do periodo.
      const heroPct = fatv.meta > 0 ? (fatv.cart / fatv.meta) * 100 : 0;
      const heroEl = container.querySelector("#cvp-hero");
      heroEl.innerHTML = `
        <div class="cvp-hero-row">
          <div class="cvp-hero">
            <div class="cvp-hero-left">
              <div class="cvp-hero-av">PE</div>
              <div><p class="cvp-hero-name">Marcher Brasil</p><p class="cvp-hero-sub">Gestor Pedro</p></div>
              <div class="cvp-hero-gauge">
                <div class="cvp-hero-gauge-label"><b>Meta</b>Atingimento</div>
                <div class="cvp-hero-gauge-ring">
                  ${gaugeSvg(heroPct)}
                  <span class="cvp-hero-gauge-pct">${heroPct.toFixed(0)}%</span>
                </div>
              </div>
            </div>
            <table class="cvp-hero-tbl">
              <thead><tr><th></th><th${drillAttrs("FAT", heroScope)}>Fatur.</th><th${drillAttrs("FAT,CART", heroScope)}>Fat.+Cart.</th><th>Meta</th><th>${year - 1}</th><th>${year - 2}</th><th>${year - 3}</th></tr></thead>
              <tbody>
                <tr><td>Grão</td>${qtyRow(grao)}</tr>
                <tr><td>Pecuária</td>${qtyRow(pec)}</tr>
                <tr><td>TTL qtd</td>${ttlRow()}</tr>
                <tr class="fat"><td>Faturado</td>${valRow(fatv)}</tr>
                <tr class="tkt"><td>Ticket</td>${tktRow()}</tr>
              </tbody>
            </table>
          </div>
          ${renderTiposSide()}
        </div>
      `;
      bindDrill(heroEl);
    }

    // Box lateral (largura de 2 cards): Peças / Transgrain / Acessórios — só R$.
    function renderTiposSide() {
      const order = ["Peças", "Transgrain", "Acessórios"];
      const byName = {};
      tipos.forEach((r) => { byName[r.tipo] = r; });
      const tot = { fat_val: 0, cart_val: 0, meta_val: 0 };
      const rows = order.map((nome) => {
        const r = byName[nome] || {};
        tot.fat_val += Number(r.fat_val) || 0; tot.cart_val += Number(r.cart_val) || 0; tot.meta_val += Number(r.meta_val) || 0;
        return `<tr><td>${nome}</td><td>${fmtR$(r.fat_val)}</td><td>${fmtR$(r.cart_val)}</td><td>${fmtR$(r.meta_val)}</td></tr>`;
      }).join("");
      // Os tres (Pecas/Transgrain/Acessorios) tem meta -> comparacao valor x
      // valor: quanto do Fat.+Cart. (cart_val JA e o total combinado) ja
      // atingiu a Meta do periodo.
      const pct = tot.meta_val > 0 ? (tot.cart_val / tot.meta_val) * 100 : 0;
      return `
        <div class="cvp-hero-side">
          <div class="cvp-side-title">Peças · Transgrain · Acessórios</div>
          <table class="cvp-hero-tbl cvp-side-tbl">
            <thead><tr><th></th><th>Fatur.</th><th>Fat.+Cart.</th><th>Meta</th></tr></thead>
            <tbody>
              ${rows}
              <tr class="fat"><td>Total</td><td>${fmtR$(tot.fat_val)}</td><td>${fmtR$(tot.cart_val)}</td><td>${fmtR$(tot.meta_val)}</td></tr>
            </tbody>
          </table>
          <div class="cvp-side-meter">
            <div class="cvp-side-meter-top"><span class="lbl">Fat.+Cart. vs. Meta</span><span class="pct">${pct.toFixed(0)}%</span></div>
            <div class="cvp-side-bar"><div class="cvp-side-bar-fill" style="width:${Math.min(pct, 100).toFixed(1)}%"></div></div>
          </div>
        </div>`;
    }

    function renderCards(container) {
      const grid = container.querySelector("#cvp-grid");
      grid.innerHTML = coords.map((c) => {
        const st = COORD_STYLE[c.nome] || { accent: "#4f7cff", soft: "rgba(79,124,255,0.16)" };
        const t = coordTotals(c);
        const initials = (c.gestor || c.nome).slice(0, 2).toUpperCase();
        // delta da coordenacao: Faturado vs META do mesmo periodo (cenario atual).
        // (Fat - Meta)/Meta -> positivo/verde = atingiu/passou a meta; negativo/vermelho = abaixo.
        let cur = 0, prev = 0;
        Object.values(c.terrs).forEach((tt) => ["grao", "pecuaria", "pecas"].forEach((lk) => { if (tt[lk]) { cur += tt[lk].fat.v; prev += tt[lk].meta.v; } }));
        const delta = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
        const dCls = delta >= 0 ? "pos" : "neg", dSign = delta >= 0 ? "+" : "";
        let body;
        if (t.isPecas) {
          body = `<div class="cvp-card-sub" style="margin-bottom:4px">Faturado</div><div class="cvp-qty" style="font-size:20px">${fmtR$(t.val)}</div>`;
        } else {
          body = `<div class="cvp-qty">${nf(t.grao + t.pec)} <span class="u">un</span></div>
            <div class="cvp-split"><span>Grão <b>${nf(t.grao)}</b></span><span>Pecuária <b>${nf(t.pec)}</b></span></div>
            <div class="cvp-fatline"><span>Faturado</span><span>${fmtR$(t.val)}</span></div>`;
        }
        return `<button class="cvp-card${c.nome === currentCoord ? " active" : ""}" data-coord="${escapeHtml(c.nome)}" style="--accent:${st.accent};--accent-soft:${st.soft}">
          <div class="cvp-card-top"><div class="cvp-card-av">${escapeHtml(initials)}</div><div><p class="cvp-card-name">${escapeHtml(c.nome)}</p><p class="cvp-card-sub">Gestor ${escapeHtml(c.gestor || "—")}</p></div></div>
          ${body}
          <div style="margin-top:6px;text-align:right"><span style="font-size:9.5px;color:var(--cvp-faint);margin-right:5px">vs meta</span><span class="cvp-delta ${dCls}" style="font-size:11px">${dSign}${delta.toFixed(1)}%</span></div>
        </button>`;
      }).join("");
      grid.querySelectorAll(".cvp-card").forEach((b) => b.addEventListener("click", () => { currentCoord = b.dataset.coord; renderCards(container); renderDetail(container); }));
    }

    // colunas da mini-tabela: [Fatur, Fat+Cart, Meta, 2025, 2024, 2023]
    function qtyCells(line) {
      if (!line) return new Array(6).fill("<td></td>").join("");
      const cols = [line.fat.q, line.cart.q, line.meta.q, line.y1.q, line.y2.q, line.y3.q];
      return cols.map((v) => `<td>${nf(v)}</td>`).join("");
    }
    function valCells(lines) {
      const sum = (k, m) => lines.reduce((s, l) => s + (l ? l[k][m] : 0), 0);
      const cols = [sum("fat", "v"), sum("cart", "v"), sum("meta", "v"), sum("y1", "v"), sum("y2", "v"), sum("y3", "v")];
      return cols.map((v) => `<td>${fmtR$(v)}</td>`).join("");
    }
    function ttlCells(grao, pec) {
      const lines = [grao, pec].filter(Boolean);
      if (!lines.length) return new Array(6).fill("<td></td>").join("");
      const sum = (m) => lines.reduce((s, l) => s + l[m].q, 0);
      const cols = [sum("fat"), sum("cart"), sum("meta"), sum("y1"), sum("y2"), sum("y3")];
      return cols.map((v) => `<td>${nf(v)}</td>`).join("");
    }
    // Ticket medio por maquina = valor (Grao+Pecuaria) / TTL qtd, por coluna.
    function ticketCells(grao, pec) {
      return ["fat", "cart", "meta", "y1", "y2", "y3"].map((m) => {
        const val = (grao ? grao[m].v : 0) + (pec ? pec[m].v : 0);
        const qty = (grao ? grao[m].q : 0) + (pec ? pec[m].q : 0);
        return `<td>${qty > 0 ? fmtR$(val / qty) : "—"}</td>`;
      }).join("");
    }

    // Escopo do drill -> atributos no <th>. Compartilhado por miniHtml e hero.
    function drillAttrs(origens, scope) {
      if (!scope || !(scope.linhas || []).length) return "";
      return ` class="cvp-drill" data-origens="${origens}" data-linhas="${escapeHtml((scope.linhas || []).join(","))}"`
        + (scope.coord ? ` data-coord="${escapeHtml(scope.coord)}"` : "")
        + (scope.terr ? ` data-terr="${escapeHtml(scope.terr)}"` : "")
        + (scope.terrs && scope.terrs.length ? ` data-terrs="${escapeHtml(scope.terrs.join(","))}"` : "")
        + (scope.label ? ` data-label="${escapeHtml(scope.label)}"` : "")
        + (scope.tipos ? ` data-tipos="1"` : "");
    }
    function bindDrill(root) {
      root.querySelectorAll(".cvp-drill").forEach((th) => th.addEventListener("click", (e) => {
        e.stopPropagation();
        const origens = (th.dataset.origens || "").split(",").filter(Boolean);
        const linhas = (th.dataset.linhas || "").split(",").filter(Boolean);
        const terrs = (th.dataset.terrs || "").split(",").filter(Boolean);
        openDetailPopover(th, { coord: th.dataset.coord || null, terr: th.dataset.terr || null, terrs, label: th.dataset.label || null, tipos: th.dataset.tipos === "1", linhas }, origens);
      }));
    }

    function miniHtml(terr, name, grao, pec, pecas, isSum, scope) {
      const valLines = pecas ? [pecas] : [grao, pec].filter(Boolean);
      const rows = pecas
        ? `<tr class="fat"><td>Faturado</td>${valCells([pecas])}</tr>`
        : `<tr><td>Grão</td>${qtyCells(grao)}</tr>
           <tr><td>Pecuária</td>${qtyCells(pec)}</tr>
           <tr><td>TTL qtd</td>${ttlCells(grao, pec)}</tr>
           <tr class="fat"><td>Faturado</td>${valCells(valLines)}</tr>
           <tr class="tkt"><td>Ticket</td>${ticketCells(grao, pec)}</tr>`;
      // Rotulos Fatur./Fat.+Cart. viram clicaveis (drill) quando ha escopo.
      const drill = (origens) => drillAttrs(origens, scope);
      // Status "vs meta" (Fat.+Cart./Meta do periodo) — mesma bolinha semaforo do
      // box lateral (>=100% verde, >=80% amarelo, abaixo vermelho, sem meta cinza).
      // l.cart.v JA e o total combinado Faturado+Carteira, nao e incremental.
      const fatCartVal = valLines.reduce((s, l) => s + (l ? l.cart.v : 0), 0);
      const metaVal = valLines.reduce((s, l) => s + (l ? l.meta.v : 0), 0);
      const pct = metaVal > 0 ? (fatCartVal / metaVal) * 100 : null;
      const dotColor = pct === null ? "#6b7280" : pct >= 100 ? "#22c55e" : pct >= 80 ? "#f59e0b" : "#ef4444";
      const dotGlow  = pct === null ? "rgba(107,114,128,.15)" : pct >= 100 ? "rgba(34,197,94,.15)" : pct >= 80 ? "rgba(245,158,11,.15)" : "rgba(239,68,68,.15)";
      const statusLabel = pct === null ? "vs meta —" : `vs meta ${pct.toFixed(1)}%`;
      return `<div class="cvp-mini${isSum ? " sum" : ""}">
        <div class="cvp-mini-head">
          <span class="cvp-mini-terr">${escapeHtml(terr)} <span class="cvp-mini-sep">·</span> <span class="cvp-mini-name">${escapeHtml(name)}</span></span>
          <span class="cvp-mini-status" style="--dot-color:${dotColor};--dot-glow:${dotGlow}">${statusLabel}</span>
        </div>
        <div class="cvp-mini-wrap"><table class="cvp-mini-tbl"><thead><tr><th></th><th${drill("FAT")}>Fatur.</th><th${drill("FAT,CART")}>Fat.+Cart.</th><th>Meta</th><th>${year - 1}</th><th>${year - 2}</th><th>${year - 3}</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
    }

    function renderDetail(container) {
      closeDetailPopover();
      const c = coords.find((x) => x.nome === currentCoord) || coords[0];
      const wrap = container.querySelector("#cvp-detail-wrap");
      if (!c) { wrap.innerHTML = ""; return; }
      const st = COORD_STYLE[c.nome] || { accent: "#4f7cff", soft: "rgba(79,124,255,0.16)" };
      const isPecas = c.nome === "Peças";

      // Consolidado da aba = rollup de ROTEAMENTO (c) -> bate com o card do topo.
      // Sul/Norte ficam so-Grao (Pecuaria roteou pro Paulo); Oeste/Exportacao
      // incluem a propria Pecuaria (que fica na regiao).
      const sumLine = (lk) => {
        const acc = { fat: { q: 0, v: 0 }, cart: { q: 0, v: 0 }, meta: { q: 0, v: 0 }, y1: { q: 0, v: 0 }, y2: { q: 0, v: 0 }, y3: { q: 0, v: 0 } };
        let has = false;
        Object.values(c.terrs).forEach((t) => { if (t[lk]) { has = true; ["fat", "cart", "meta", "y1", "y2", "y3"].forEach((m) => { acc[m].q += t[lk][m].q; acc[m].v += t[lk][m].v; }); } });
        return has ? acc : null;
      };

      // Tabelas por territorio: por CASA geografica nas coordenacoes geograficas
      // (Sul/Norte/Oeste/Exportacao) -> traz o territorio com Grao E Pecuaria,
      // mesmo os "so Pecuaria" (informativa, ja somada no Paulo pelo rollup).
      // Nas funcionais (Pecuaria/Pecas) o detalhe segue por roteamento.
      const GEO = ["Sul", "Norte", "Oeste", "Exportação"];
      const src = GEO.includes(c.nome) ? (regioes.find((x) => x.nome === c.nome) || c) : c;
      const eff = (line) => (line && !line.orfao) ? line : null;  // orfao nao vira card

      const cards = [];
      if (isPecas) {
        cards.push(miniHtml(c.nome.toUpperCase(), c.gestor || "", null, null, sumLine("pecas"), true));
        Object.entries(src.terrs).forEach(([terr, t]) => { if (t.pecas) cards.push(miniHtml(terr, t.pecas.resp || "", null, null, t.pecas)); });
      } else {
        // Consolidado: drill pela coordenacao de roteamento (popover ganha col Territorio).
        const graoSum = sumLine("grao"), pecSum = sumLine("pecuaria");
        const consLinhas = [graoSum && "Grão", pecSum && "Pecuária"].filter(Boolean);
        cards.push(miniHtml(c.nome.toUpperCase(), c.gestor || "", graoSum, pecSum, null, true, { coord: c.nome, linhas: consLinhas }));
        // Territorios: resolve cada um (sameResp/split), depois funde os que
        // tem o mesmo responsavel nomeado em territorios diferentes (MA+PI).
        const terrBaseCards = [];
        Object.entries(src.terrs).forEach(([terr, t]) => {
          const g = eff(t.grao), p = eff(t.pecuaria);
          if (!g && !p) return;
          const sameResp = g && p && g.resp === p.resp;
          if (sameResp || (g && !p) || (!g && p)) {
            const linhas = [g && "Grão", p && "Pecuária"].filter(Boolean);
            terrBaseCards.push({ terr, resp: (g || p).resp || "", grao: g, pec: p, linhas });
          } else {
            terrBaseCards.push({ terr, resp: g.resp || "", grao: g, pec: null, linhas: ["Grão"] });
            terrBaseCards.push({ terr, resp: p.resp || "", grao: null, pec: p, linhas: ["Pecuária"] });
          }
        });
        mergeSameRespCards(terrBaseCards).forEach((card) => {
          cards.push(miniHtml(card.terr, card.resp, card.grao, card.pec, null, false, { terr: card.terr, terrs: card.terrs, linhas: card.linhas }));
        });
      }
      wrap.innerHTML = `<div class="cvp-detail" style="--accent:${st.accent};--accent-soft:${st.soft}">
        <div class="cvp-detail-head"><h2><span class="cvp-dot"></span>${escapeHtml(c.nome)}</h2><span class="cvp-note">Consolidado + território a território · clique em Fatur./Fat.+Cart. para o detalhe</span></div>
        <div class="cvp-mini-grid">${cards.join("")}</div></div>`;
      bindDrill(wrap);
    }

    // ---------------------------------------------------------------- drill popover

    let popEl = null;
    let popRows = [], popShowTerr = false, popSort = { key: null, dir: 1 };
    function fmtFullR$(v) { return "R$ " + nf(v || 0); }

    function closeDetailPopover() {
      if (!popEl) return;
      popEl.remove(); popEl = null;
      document.removeEventListener("keydown", onPopKey);
    }
    function onPopKey(e) { if (e.key === "Escape") closeDetailPopover(); }

    function renderPopTable(rows, showTerr) {
      if (!rows.length) return `<div class="cvp-empty" style="padding:22px">Sem transações no período.</div>`;
      const NUM = ["quantidade", "valor"];
      const items = rows.filter((r) => !r.resumo);
      const resumos = rows.filter((r) => r.resumo);   // ficam sempre no fim
      if (popSort.key) {
        const k = popSort.key, d = popSort.dir, isNum = NUM.includes(k);
        items.sort((a, b) => isNum
          ? d * ((Number(a[k]) || 0) - (Number(b[k]) || 0))
          : d * String(a[k] || "").localeCompare(String(b[k] || ""), "pt-BR"));
      }
      const ordered = items.concat(resumos);
      const span = showTerr ? 8 : 7;
      const sortTh = (key, label, cls) => {
        const active = popSort.key === key;
        const arrow = active ? (popSort.dir === 1 ? " ↑" : " ↓") : "";
        return `<th data-sort="${key}"${cls ? ` class="${cls}"` : ""} style="cursor:pointer;user-select:none${active ? ";color:#7aa2ff" : ""}">${label}${arrow}</th>`;
      };
      let totQ = 0, totV = 0;
      const body = ordered.map((r) => {
        if (r.resumo) {
          totV += Number(r.valor) || 0;
          return `<tr class="cvp-pop-sum"><td colspan="${span}">${escapeHtml(r.label)} · consolidado</td><td class="num">—</td><td class="num${Number(r.valor) < 0 ? " neg" : ""}">${fmtFullR$(r.valor)}</td></tr>`;
        }
        totQ += Number(r.quantidade) || 0; totV += Number(r.valor) || 0;
        const cidadeUf = [r.cidade, r.uf].filter(Boolean).join("/");
        return `<tr>
          <td>${escapeHtml(r.tipo || "")}</td>
          ${showTerr ? `<td>${escapeHtml(r.territorio || "")}</td>` : ""}
          <td class="mut">${escapeHtml(r.cod_cliente || "")}</td>
          <td class="l">${escapeHtml(r.cliente || "")}</td>
          <td class="mut">${escapeHtml(cidadeUf)}</td>
          <td>${escapeHtml(r.cultura || "")}</td>
          <td class="mut">${escapeHtml(r.cod_produto || "")}</td>
          <td class="l">${escapeHtml(r.produto || "")}</td>
          <td class="num${Number(r.quantidade) < 0 ? " neg" : ""}">${nf(r.quantidade)}</td>
          <td class="num${Number(r.valor) < 0 ? " neg" : ""}">${fmtFullR$(r.valor)}</td>
        </tr>`;
      }).join("");
      return `<table class="cvp-pop-tbl">
        <thead><tr>${sortTh("tipo", "Tipo")}${showTerr ? sortTh("territorio", "Território") : ""}${sortTh("cod_cliente", "Cód. Cli.")}${sortTh("cliente", "Cliente")}${sortTh("cidade", "Cidade/UF")}${sortTh("cultura", "Cult")}${sortTh("cod_produto", "Cód. Prod.")}${sortTh("produto", "Produto")}${sortTh("quantidade", "Qtd", "num")}${sortTh("valor", "Valor", "num")}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td colspan="${span}">Total · ${items.length} ${items.length === 1 ? "linha" : "linhas"}</td><td class="num${totQ < 0 ? " neg" : ""}">${nf(totQ)}</td><td class="num${totV < 0 ? " neg" : ""}">${fmtFullR$(totV)}</td></tr></tfoot>
      </table>`;
    }

    // Renderiza a tabela no popover atual e liga o sort (setas ↑↓) nos cabecalhos.
    function paintPopTable() {
      if (!popEl) return;
      const body = popEl.querySelector(".cvp-pop-body");
      if (!body) return;
      body.innerHTML = renderPopTable(popRows, popShowTerr);
      body.querySelectorAll(".cvp-pop-tbl th[data-sort]").forEach((th) => th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (popSort.key === key) popSort.dir *= -1; else { popSort.key = key; popSort.dir = 1; }
        paintPopTable();
      }));
    }

    // Busca as transacoes (NF/Ped) que formam o numero clicado e abre o modal centralizado.
    async function openDetailPopover(anchor, scope, origens) {
      closeDetailPopover();
      const titulo = (origens.length > 1 ? "Faturado + Carteira" : "Faturado") + " · " + (scope.coord || scope.terr || scope.label || "");
      const backdrop = document.createElement("div");
      backdrop.className = "cvp-pop-backdrop";
      backdrop.innerHTML = `<div class="cvp-pop">
          <div class="cvp-pop-head"><span>${escapeHtml(titulo)}</span><button class="cvp-pop-x" type="button" aria-label="Fechar">✕</button></div>
          <div class="cvp-pop-body"><div class="cvp-empty" style="padding:22px">Carregando…</div></div>
        </div>`;
      document.body.appendChild(backdrop);
      popEl = backdrop;
      backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeDetailPopover(); });
      backdrop.querySelector(".cvp-pop-x").addEventListener("click", closeDetailPopover);
      setTimeout(() => document.addEventListener("keydown", onPopKey), 0);

      let rows = [];
      try {
        if (isSupabaseConfigured()) {
          const org = await resolveOrganizationId();
          // Card fundido (ex: MA_PI) cobre 2+ territorios reais -- a RPC so
          // filtra 1 territorio por vez, entao busca cada um e junta as linhas.
          const terrList = (scope.terrs && scope.terrs.length) ? scope.terrs : [scope.terr || null];
          const results = await Promise.all(terrList.map((terr) => callSupabaseRpc("comercial_painel_detalhe", {
            p_org: org, p_year: year, p_month: month, p_period: period,
            p_origens: origens, p_linhas: scope.linhas || [],
            p_coordenacao: scope.coord || null, p_territorio: terr
          })));
          rows = results.flat().filter(Boolean);
        }
      } catch (e) { console.error("detalhe:", e); }
      if (popEl !== backdrop) return;                  // fechou/trocou enquanto carregava
      // Drill do hero: maquinas 1 a 1 (Grao/Pecuaria acima) + 1 linha consolidada
      // por tipo "so valor" (Pecas/Transgrain/Acessorios), vinda do box/tipos.
      if (scope.tipos) {
        const metric = origens.length > 1 ? "cart_val" : "fat_val";
        const byT = {}; tipos.forEach((r) => { byT[r.tipo] = r; });
        ["Peças", "Transgrain", "Acessórios"].forEach((nome) => {
          rows.push({ resumo: true, label: nome, valor: Number((byT[nome] || {})[metric]) || 0 });
        });
      }
      popRows = rows;
      // Mostra a coluna Território quando não há filtro de território único
      // (consolidado/hero) OU quando o card fundido cobre 2+ territórios (MA_PI).
      const singleTerr = scope.terr && !(scope.terrs && scope.terrs.length > 1);
      popShowTerr = !singleTerr;
      popSort = { key: null, dir: 1 };                 // cada abertura comeca na ordem padrao (valor desc)
      paintPopTable();
    }

    // ---------------------------------------------------------------- one page report (impressão)
    // Espelha o "modelo OnePageReport" (impressão da aba Painel do Excel):
    // A4 paisagem, tema claro, cards compactos com linhas GRÃO/PECUÁRIA/TTL/FATURA
    // × colunas Fatur/Fat+Cart/Meta/anos. Página 1 = mês do cabeçalho, página 2 = YTD.

    const PRINT_COLORS = {
      geral:      { head: "#C00000", ttl: "#F5B8A3" },
      pecuaria:   { head: "#ED7D31", ttl: "#FBDCC3" },
      exportacao: { head: "#7030A0", ttl: "#EFB9EE" },
      sul:        { head: "#1F3864", ttl: "#BDD7EE" },
      norte:      { head: "#538135", ttl: "#C9E2B8" },
      oeste:      { head: "#404040", ttl: "#D9D9D9" },
      pecas:      { head: "#D8358C", ttl: "#F9CFE6" }
    };

    // Formato do modelo: inteiro pt-BR, zero = "-", negativo entre parênteses.
    function pfmt(v) {
      const r = Math.round(v || 0);
      if (!r) return "-";
      const s = Math.abs(r).toLocaleString("pt-BR");
      return r < 0 ? `(${s})` : s;
    }

    // Soma uma linha (grao/pecuaria/pecas) por metrica ao longo dos territorios
    // de uma coordenacao/regiao. null quando a linha nao existe em nenhum terr.
    function sumTerrLine(c, lk) {
      if (!c) return null;
      const acc = {}; METRICS.forEach((m) => { acc[m] = { q: 0, v: 0 }; });
      let has = false;
      Object.values(c.terrs).forEach((t) => {
        const l = t[lk]; if (!l) return;
        has = true;
        METRICS.forEach((m) => { acc[m].q += l[m].q; acc[m].v += l[m].v; });
      });
      return has ? acc : null;
    }

    // Card do report. grao/pec = linhas de quantidade (null = linha apagada,
    // igual ao modelo); fatVals = os 6 valores da linha FATURA (sempre R$ cheio).
    function printCard(cfg) {
      const { name, terr, colors, grao, pec, fatVals, label } = cfg;
      const cells = (line, k) => METRICS.map((m) => `<td>${line ? pfmt(line[m][k]) : ""}</td>`).join("");
      const empty = METRICS.map(() => "<td></td>").join("");
      const ttlCellsP = (grao || pec)
        ? METRICS.map((m) => `<td>${pfmt((grao ? grao[m].q : 0) + (pec ? pec[m].q : 0))}</td>`).join("")
        : empty;
      const initials = escapeHtml((name || terr || "?").trim().slice(0, 2).toUpperCase());
      return `${label ? `<div class="plab">${escapeHtml(label)}</div>` : ""}<div class="pc">
        <table>
          <colgroup><col style="width:15%"><col style="width:13%"><col span="6" style="width:12%"></colgroup>
          <thead><tr style="background:${colors.head}">
            <th class="nm" colspan="2"><div class="nmw"><span class="av" style="color:${colors.head}">${initials}</span><span class="nmx">${escapeHtml(name)}</span><span class="tr">${escapeHtml(terr)}</span></div></th>
            <th>FATUR.</th><th>FAT.+CART.</th><th>META</th><th>${year - 1}</th><th>${year - 2}</th><th>${year - 3}</th>
          </tr></thead>
          <tbody>
            <tr><td class="lab${grao ? "" : " off"}" colspan="2">GRÃO</td>${grao ? cells(grao, "q") : empty}</tr>
            <tr><td class="lab${pec ? "" : " off"}" colspan="2">PECUÁRIA</td>${pec ? cells(pec, "q") : empty}</tr>
            <tr class="ttl" style="background:${colors.ttl}"><td class="lab" colspan="2">TTL qtd</td>${ttlCellsP}</tr>
            <tr class="fat"><td class="lab" colspan="2">FATURA</td>${METRICS.map((m) => `<td>${pfmt(fatVals[m])}</td>`).join("")}</tr>
          </tbody>
        </table>
      </div>`;
    }

    // Card a partir de linhas metricObj: FATURA = soma dos valores das linhas.
    function cardFromLines(name, terr, colors, grao, pec, pecas, label) {
      const fatVals = {};
      METRICS.forEach((m) => {
        fatVals[m] = (grao ? grao[m].v : 0) + (pec ? pec[m].v : 0) + (pecas ? pecas[m].v : 0);
      });
      return printCard({ name, terr, colors, grao, pec, fatVals, label });
    }

    // Grade FIXA dos cards de território — espelha a posição exata do modelo
    // real (Razao_MATR550 [painel].xlsm, aba Painel), extraída célula a célula.
    // NÃO é balanceamento automático: cada território tem uma posição de coluna
    // fixa, igual à planilha. A COR de cada card segue a coordenação de ORIGEM
    // (casa geográfica), não a coluna física — por isso RR/Nabor e TO ficam
    // pintados de verde (Norte) mesmo fisicamente nas colunas 1 e 3.
    const PRINT_COL_LAYOUT = [
      [
        { terr: "SP" },
        { terr: "PR", mode: "grao" },
        { terr: "PR", mode: "pec" },
        { terr: "RS SUL" },
        { terr: "RS NORTE" },
        { pecas: true },
        { terr: "RR" }
      ],
      [
        { terr: "GO_MG SUL" },
        { terr: "GO_MG NORTE" },
        { terr: "BA", mode: "grao" },
        { terr: "BA", mode: "pec" },
        { terr: "PA" },
        { terr: "SEALBA" },
        { terrs: ["MA", "PI"] }
      ],
      [
        { terr: "MT OESTE" },
        { terr: "MT CENTRO" },
        { terr: "MT LESTE" },
        { terr: "RO" },
        { terr: "MS" },
        { terr: "TO", mode: "grao" },
        { terr: "TO", mode: "pec" }
      ]
    ];
    const HOME_COLOR_KEY = { "Sul": "sul", "Norte": "norte", "Oeste": "oeste", "Exportação": "exportacao" };

    function buildPrintPage(data, subtitle, scenarioName) {
      const { coords: pc, regioes: pr, tipos: pt } = data;
      const coord = (n) => pc.find((x) => x.nome === n) || null;

      // --- 6 cards consolidados (topo de cada coluna) ---
      const tot = companyTotals(pc, pt);
      const numLine = (qMap) => { const o = {}; METRICS.forEach((m) => { o[m] = { q: qMap[m], v: 0 }; }); return o; };
      const geralCard = printCard({
        name: "Pedro", terr: "BRASIL", colors: PRINT_COLORS.geral, label: "GERAL",
        grao: numLine(tot.grao), pec: numLine(tot.pec), fatVals: tot.fatv
      });
      const consolidated = (nome, terrLabel, colors, label) => {
        const c = coord(nome); if (!c) return "";
        return cardFromLines(c.gestor || nome, terrLabel, colors,
          sumTerrLine(c, "grao"), sumTerrLine(c, "pecuaria"), sumTerrLine(c, "pecas"), label);
      };
      const col1Top = geralCard + consolidated("Sul", "SUL", PRINT_COLORS.sul, "REG. SUL");
      const col2Top = consolidated("Pecuária", "PECUÁRIA", PRINT_COLORS.pecuaria, "PECUÁRIA")
        + consolidated("Norte", "NORTE", PRINT_COLORS.norte, "REG. NORTE");
      const col3Top = consolidated("Exportação", "EXPO", PRINT_COLORS.exportacao, "EXPORTAÇÃO")
        + consolidated("Oeste", "OESTE", PRINT_COLORS.oeste, "REG. OESTE");

      // --- cards de território: posição fixa (ver PRINT_COL_LAYOUT acima) ---
      // allTerrs junta todo território de qualquer "casa" num mapa só (a grade
      // fixa mistura territórios de casas diferentes na mesma coluna, ex: RR é
      // Norte mas fica na coluna 1); terrHome guarda a casa original só pra cor.
      const allTerrs = {}; const terrHome = {};
      pr.forEach((r) => Object.entries(r.terrs).forEach(([terr, t]) => { allTerrs[terr] = t; terrHome[terr] = r.nome; }));
      const colorFor = (terr) => PRINT_COLORS[HOME_COLOR_KEY[terrHome[terr]] || "norte"];
      const lineOf = (terr, lk) => { const t = allTerrs[terr]; const l = t && t[lk]; return (l && !l.orfao) ? l : null; };
      const baseCardFor = (terr) => {
        const g = lineOf(terr, "grao"), p = lineOf(terr, "pecuaria");
        if (!g && !p) return null;
        const linhas = [g && "Grão", p && "Pecuária"].filter(Boolean);
        return { terr, resp: (g || p).resp || "A definir", grao: g, pec: p, linhas };
      };
      const cardHtmlFor = (slot) => {
        if (slot.pecas) {
          const cp = coord("Peças");
          return cp ? cardFromLines(cp.gestor || "—", "PEÇAS", PRINT_COLORS.pecas, null, null, sumTerrLine(cp, "pecas")) : "";
        }
        if (slot.terrs) {
          const parts = slot.terrs.map((terr) => baseCardFor(terr)).filter(Boolean);
          const merged = mergeSameRespCards(parts)[0];
          return merged ? cardFromLines(merged.resp || "A definir", merged.terr, colorFor(slot.terrs[0]), merged.grao, merged.pec, null) : "";
        }
        if (slot.mode === "grao") {
          const g = lineOf(slot.terr, "grao");
          return g ? cardFromLines(g.resp || "A definir", slot.terr, colorFor(slot.terr), g, null, null) : "";
        }
        if (slot.mode === "pec") {
          const p = lineOf(slot.terr, "pecuaria");
          return p ? cardFromLines(p.resp || "A definir", slot.terr, colorFor(slot.terr), null, p, null) : "";
        }
        const base = baseCardFor(slot.terr);
        return base ? cardFromLines(base.resp, base.terr, colorFor(slot.terr), base.grao, base.pec, null) : "";
      };
      const flow = PRINT_COL_LAYOUT.map((col) => col.map(cardHtmlFor).filter(Boolean));

      // Território fora da grade fixa (cadastro novo na Atribuição): funde por
      // responsável e anexa na coluna mais curta — não quebra o report.
      const covered = new Set();
      PRINT_COL_LAYOUT.forEach((col) => col.forEach((slot) => {
        if (slot.terrs) slot.terrs.forEach((t) => covered.add(t)); else if (slot.terr) covered.add(slot.terr);
      }));
      const leftoverBase = Object.keys(allTerrs)
        .filter((terr) => !covered.has(terr))
        .map(baseCardFor)
        .filter(Boolean);
      mergeSameRespCards(leftoverBase).forEach((card) => {
        let shortest = 0;
        for (let i = 1; i < flow.length; i++) if (flow[i].length < flow[shortest].length) shortest = i;
        flow[shortest].push(cardFromLines(card.resp || "A definir", card.terr, colorFor(card.terrs[0]), card.grao, card.pec, null));
      });

      const emitted = new Date().toLocaleDateString("pt-BR");
      return `<section class="page">
        <div class="ph">
          <h1>Painel de Vendas · Marcher Brasil</h1>
          <span class="per">${escapeHtml(subtitle)}</span>
          <span class="meta">Meta: ${escapeHtml(scenarioName)} · emitido em ${emitted}</span>
        </div>
        ${(!pc.length) ? `<p class="pempty">Sem dados de vendas para o período.</p>` : `
        <div class="cols">
          <div class="col">${col1Top}${flow[0].join("")}</div>
          <div class="col">${col2Top}${flow[1].join("")}</div>
          <div class="col">${col3Top}${flow[2].join("")}</div>
        </div>`}
      </section>`;
    }

    function buildPrintDoc(mesData, ytdData) {
      const scenarioName = scenarios.find((s) => s.id === scenarioId)?.name || "Budget";
      const mLabel = MONTHS[month - 1];
      const p1 = buildPrintPage(mesData, `Mês — ${mLabel}/${year}`, scenarioName);
      const p2 = buildPrintPage(ytdData, `Acumulado YTD — Janeiro a ${mLabel}/${year}`, scenarioName);
      return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>One Page Report — Painel de Vendas ${mLabel}/${year}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  @page { size: A4 landscape; margin: 7mm; }
  html, body { background:#fff; color:#1a1a1a; font-family:"Segoe UI", Calibri, Arial, sans-serif;
    -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page { width:283mm; page-break-after:always; }
  .page:last-child { page-break-after:auto; }
  .ph { display:flex; justify-content:space-between; align-items:baseline; gap:6mm;
    border-bottom:1.5px solid #1F3864; padding-bottom:1.4mm; margin-bottom:2.4mm; }
  .ph h1 { font-size:11px; font-weight:700; color:#1F3864; }
  .ph .per { font-size:10px; font-weight:600; }
  .ph .meta { font-size:8px; color:#666; }
  .cols { display:grid; grid-template-columns:repeat(3, 1fr); gap:0 3.4mm; align-items:start; }
  .col { display:flex; flex-direction:column; }
  .plab { font-size:6.4px; font-weight:700; letter-spacing:.07em; color:#555; margin:1.3mm 0 .4mm; }
  .pc { margin-top:1.3mm; }
  .plab + .pc { margin-top:0; }
  .col > :first-child { margin-top:0; }
  .pc table { width:100%; border-collapse:collapse; table-layout:fixed; }
  .pc th, .pc td { font-size:6.6px; line-height:1.15; padding:.42mm .7mm; text-align:right;
    border:.5px solid #cfcfcf; font-variant-numeric:tabular-nums; overflow:hidden; white-space:nowrap; }
  .pc thead th { color:#fff; font-weight:600; font-size:6px; letter-spacing:.03em; border-color:rgba(0,0,0,.18); }
  .pc th.nm { text-align:left; font-size:7px; font-weight:700; }
  .pc th.nm .nmw { display:flex; align-items:center; gap:.8mm; }
  .pc th.nm .av { flex:none; width:3.2mm; height:3.2mm; line-height:3.2mm; border-radius:50%;
    background:#fff; font-size:5px; font-weight:700; text-align:center; }
  .pc th.nm .nmx { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pc th.nm .tr { flex:none; font-weight:600; font-size:6.2px; opacity:.92; }
  .pc td.lab { text-align:left; font-size:6.3px; font-weight:600; letter-spacing:.02em; color:#333; }
  .pc td.lab.off { color:#b8b8b8; font-weight:400; }
  .pc tr.ttl td { font-weight:700; }
  .pc tr.fat td { font-weight:600; background:#f5f5f5; }
  .pempty { padding:20mm; text-align:center; color:#888; font-size:11px; }
  @media screen {
    body { background:#8a8f98; padding:14px; }
    .page { background:#fff; margin:0 auto 14px; padding:7mm; box-shadow:0 3px 18px rgba(0,0,0,.35); }
  }
</style>
</head>
<body>
${p1}
${p2}
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 400); });<\/script>
</body>
</html>`;
    }

    async function fetchPainelData(periodKey) {
      if (!isSupabaseConfigured()) return { coords: [], regioes: [], tipos: [] };
      const org = await resolveOrganizationId();
      const payload = { p_org: org, p_year: year, p_month: month, p_period: periodKey, p_scenario_id: scenarioId };
      const [rows, tiposRows] = await Promise.all([
        callSupabaseRpc("comercial_painel_vendas", payload),
        callSupabaseRpc("comercial_painel_tipos", payload)
      ]);
      const tr = transform(rows || []);
      return { coords: tr.coords, regioes: tr.regioes, tipos: tiposRows || [] };
    }

    async function openOnePagePrint(container) {
      const btn = container.querySelector("#cvp-print");
      // window.open precisa ser síncrono no clique, senão o popup blocker segura.
      const w = window.open("", "_blank");
      if (!w) { alert("O navegador bloqueou a janela do report. Libere pop-ups para este site e tente de novo."); return; }
      w.document.write(`<p style="font-family:sans-serif;padding:24px;color:#555">Gerando One Page Report…</p>`);
      if (btn) btn.disabled = true;
      try {
        const [mesData, ytdData] = await Promise.all([fetchPainelData("mes"), fetchPainelData("ytd")]);
        const html = buildPrintDoc(mesData, ytdData);
        w.document.open();
        w.document.write(html);
        w.document.close();
      } catch (e) {
        console.error("one page report:", e);
        try { w.close(); } catch (_) { /* já fechada */ }
        alert("Falha ao gerar o One Page Report. Verifique a conexão e tente de novo.");
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    // ---------------------------------------------------------------- events

    function bind(container) {
      container.querySelector("#cvp-seg")?.addEventListener("click", async (e) => {
        const b = e.target.closest("button[data-p]"); if (!b) return;
        period = b.dataset.p; await reloadAndRender(container);
      });
      container.querySelector("#cvp-scenario")?.addEventListener("change", async (e) => {
        scenarioId = e.target.value || null; await reloadAndRender(container);
      });
      container.querySelector("#cvp-print")?.addEventListener("click", () => openOnePagePrint(container));
    }

    // O mes/ano do painel seguem o seletor de periodo do cabecalho do site.
    function syncFromHeader() {
      year = Number(state.currentPeriod?.year || year);
      month = Number(state.currentPeriod?.month || month);
    }

    async function reloadAndRender(container) {
      loading = true; render(container);
      try { await loadData(); } catch (e) { console.error(e); }
      render(container);
    }

    // ---------------------------------------------------------------- public

    function renderSelectedPainel(container, reportId) {
      if (reportId !== REPORT_ID) return false;
      syncFromHeader();
      if (loadedKey === paramsKey() && coords.length) {
        // Tem cache pros mesmos parametros: mostra na hora (sem flash), mas
        // SEMPRE revalida em background — uma carga aplicada em outra tela pode
        // ter mudado o dado desde a ultima vez que abrimos o painel.
        render(container);
        loadData().then(() => render(container)).catch((e) => console.error(e));
      } else {
        loading = true; render(container);
        loadData().then(() => render(container)).catch((e) => { console.error(e); loading = false; render(container); });
      }
      return true;
    }

    return { renderSelectedPainel, REPORT_ID };
  }

  window.VECTON_COMERCIAL_PAINEL = { createComercialPainelModule };
})(window);
