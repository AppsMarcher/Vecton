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
      callEdgeFunction,
      isSupabaseConfigured,
      syncHeaderPeriod,
      appAlert
    } = deps;
    const { exportRowsToExcel, exportButtonHtml } = window.VECTON_CORE_UTILS;

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

    let period = "mes";
    let month = Number(state.currentPeriod?.month || 6);
    let year = Number(state.currentPeriod?.year || 2026);
    let currentCoord = null;
    let scenarioId = null;
    let scenarios = [];
    let scenarioUserSet = false;
    let coords = [];              // [{nome,gestor,terrs:{terr:{grao,pecuaria,pecas}}}] — por coordenacao de ROTEAMENTO (totais)
    let regioes = [];             // idem, mas por CASA geografica (regiao=coord do Grao) — detalhe matricial
    let tipos = [];               // [{tipo, fat_val, cart_val, meta_val, y1_val, y2_val, y3_val}] (Pecas/Transgrain/Acessorios)
    let pecasVend = [];           // [{bucket:'titular'|'demais', cod_vendedor, vendedor, fat_val, cart_val, y1_val, y2_val, y3_val}] (087)
    let loadedKey = null;         // guarda params da ultima carga
    let loading = false;
    let docMenuClickHandler = null; // listener doc-level do menu Exportar (1 so, re-registrado a cada bind)

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
        .cvp-period select option { background:#121317; color:#fff; }
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
        .cvp-split { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:8px 0; }
        .cvp-split span { font-size:11px; color:var(--cvp-soft); white-space:nowrap; } .cvp-split b { color:var(--cvp-text); font-variant-numeric:tabular-nums; }
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
        /* Linha memo: valor da casa geografica que consolida em OUTRA coordenacao.
           Ilustrativa — nao entra em TTL/Faturado/Ticket nem no status vs meta. */
        .cvp-mini-tbl tr.memo td { color:var(--cvp-faint); font-style:italic; opacity:.85; }
        .cvp-mini-tbl tr.memo + tr td { border-top:1px dashed rgba(255,255,255,.12); }
        .cvp-mini-foot { padding:0 2px 2px; font-size:9px; font-style:italic; color:var(--cvp-faint); line-height:1.35; }
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
        .cvp-side-meter { margin-top:auto; padding-top:16px; flex:1; display:flex; flex-direction:column; min-height:0; justify-content:center; }
        .cvp-blockbars { display:flex; flex-direction:column; gap:9px; }
        .cvp-blockbar-row { display:grid; grid-template-columns:72px 1fr 32px; align-items:center; gap:9px; }
        .cvp-blockbar-lbl { font-size:9.5px; font-weight:600; text-transform:uppercase; letter-spacing:.03em; color:var(--cvp-text); }
        .cvp-blockbar-track { display:flex; gap:3px; }
        .cvp-blockbar-track .blk { flex:1; height:9px; border-radius:2px; background:var(--cvp-bg-soft); }
        .cvp-blockbar-track .blk.on { background:var(--accent); }
        .cvp-blockbar-pct { font-size:11px; font-weight:600; text-align:right; font-variant-numeric:tabular-nums; color:var(--cvp-text); }
        .cvp-print-wrap { position:relative; }
        .cvp-print { display:flex; align-items:center; gap:6px; background:var(--cvp-panel); border:1px solid var(--cvp-line); border-radius:12px; color:var(--cvp-soft); font-size:12.5px; font-family:inherit; font-weight:500; padding:9px 14px; cursor:pointer; }
        .cvp-print:hover { color:var(--cvp-text); border-color:#4f7cff; }
        .cvp-print:disabled { opacity:.55; cursor:default; }
        .cvp-print svg { width:14px; height:14px; }
        .cvp-print-menu { position:absolute; top:calc(100% + 6px); right:0; z-index:120; background:var(--cvp-panel-hover); border:1px solid var(--cvp-line); border-radius:12px; box-shadow:0 12px 32px rgba(0,0,0,.45); min-width:180px; padding:6px; display:none; flex-direction:column; gap:2px; }
        .cvp-print-menu.open { display:flex; }
        .cvp-print-menu button { display:flex; align-items:center; gap:8px; background:transparent; border:none; color:var(--cvp-soft); font-size:12.5px; font-family:inherit; font-weight:500; padding:8px 10px; border-radius:8px; cursor:pointer; text-align:left; width:100%; }
        .cvp-print-menu button:hover { background:rgba(255,255,255,.06); color:var(--cvp-text); }
        .cvp-print-menu svg { width:14px; height:14px; flex:none; }
        .cvp-email-backdrop { position:fixed; inset:0; z-index:9900; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; padding:20px; }
        .cvp-email { background:#121317; border:1px solid #2a2d34; border-radius:14px; box-shadow:0 30px 80px rgba(0,0,0,.65); color:#fff; width:85vw; height:85vh; min-width:420px; min-height:380px; display:flex; flex-direction:column; overflow:hidden; }
        .cvp-email-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 20px; border-bottom:1px solid #2a2d34; flex:none; }
        .cvp-email-head h3 { font-size:14px; font-weight:600; margin:0; }
        .cvp-email-head p { font-size:11.5px; color:var(--cvp-faint); margin:2px 0 0; }
        .cvp-email-x { background:none; border:none; color:#6b7280; font-size:16px; cursor:pointer; line-height:1; padding:0 2px; }
        .cvp-email-x:hover { color:#fff; }
        .cvp-email-body { flex:1; min-height:0; overflow-y:auto; padding:14px 20px; display:flex; flex-direction:column; }
        .cvp-email-row { display:flex; align-items:center; gap:12px; border-bottom:1px solid rgba(255,255,255,.16); padding:9px 0; flex:none; }
        .cvp-email-row label { flex:none; width:64px; font-size:11px; font-weight:600; letter-spacing:.03em; text-transform:uppercase; color:var(--cvp-faint); }
        .cvp-email-row input { flex:1; min-width:0; background:transparent; border:none; color:#fff; font-size:13px; font-family:inherit; padding:4px 0; outline:none; }
        .cvp-email-row-text { align-items:stretch; border-bottom:none; flex:1; min-height:0; margin-top:4px; }
        .cvp-email-text { flex:1; min-height:0; resize:none; background:var(--cvp-bg-soft); border:1px solid var(--cvp-line); border-radius:10px; color:#fff; font-size:13px; font-family:inherit; line-height:1.5; padding:10px 12px; outline:none; }
        .cvp-email-text:focus { border-color:#4f7cff; }
        .cvp-email-attach-wrap { border-bottom:1px solid rgba(255,255,255,.16); padding:9px 0; flex:none; }
        .cvp-email-attach { display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--cvp-soft); background:var(--cvp-bg-soft); border:1px solid var(--cvp-line); border-radius:8px; padding:6px 10px; align-self:flex-start; }
        .cvp-email-attach svg { width:13px; height:13px; flex:none; color:var(--cvp-faint); }
        .cvp-email-msg { font-size:12px; padding:0 20px; min-height:16px; flex:none; }
        .cvp-email-msg.err { color:var(--cvp-neg); }
        .cvp-email-msg.ok { color:var(--cvp-pos); }
        .cvp-email-msg.warn { color:#f59e0b; }
        .cvp-email-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 20px; border-top:1px solid #2a2d34; flex:none; }
        .cvp-email-remember { display:flex; align-items:center; gap:7px; font-size:11.5px; color:var(--cvp-soft); cursor:pointer; user-select:none; white-space:nowrap; flex:none; }
        .cvp-email-remember input { accent-color:#4f7cff; }
        .cvp-email-actions { display:flex; justify-content:flex-end; gap:8px; }
        .cvp-email-actions button { border-radius:10px; padding:9px 16px; font-size:12.5px; font-weight:600; font-family:inherit; cursor:pointer; border:1px solid var(--cvp-line); background:transparent; color:var(--cvp-soft); }
        .cvp-email-actions button:hover { color:var(--cvp-text); border-color:#4f7cff; }
        .cvp-email-actions button.primary { background:#4f7cff; border-color:#4f7cff; color:#fff; }
        .cvp-email-actions button.primary:hover { background:#3f6bef; }
        .cvp-email-actions button:disabled { opacity:.55; cursor:default; }
        .cvp-alert-backdrop { position:fixed; inset:0; z-index:9950; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; padding:20px; }
        .cvp-alert { background:#1a1c22; border:1px solid #2a2d34; border-radius:14px; box-shadow:0 30px 80px rgba(0,0,0,.65); color:#fff; width:100%; max-width:360px; padding:20px; display:flex; flex-direction:column; gap:16px; }
        .cvp-alert-row { display:flex; align-items:flex-start; gap:12px; }
        .cvp-alert-icon { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex:none; }
        .cvp-alert-icon.err { background:rgba(239,68,68,.15); color:#f87171; }
        .cvp-alert-icon.ok { background:rgba(34,197,94,.15); color:#4ade80; }
        .cvp-alert-icon svg { width:17px; height:17px; }
        .cvp-alert-msg { font-size:13px; line-height:1.5; color:#e5e7eb; padding-top:5px; }
        .cvp-alert-actions { display:flex; justify-content:flex-end; }
        .cvp-alert-actions button { border-radius:10px; padding:8px 22px; font-size:12.5px; font-weight:600; font-family:inherit; cursor:pointer; border:1px solid #4f7cff; background:#4f7cff; color:#fff; }
        .cvp-alert-actions button:hover { background:#3f6bef; }
        .cvp-drill { cursor:pointer; }
        .cvp-drill:hover { color:#7aa2ff; text-decoration:underline; text-underline-offset:2px; }
        .cvp-pop-backdrop { position:fixed; inset:0; z-index:9800; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; padding:32px; }
        .cvp-pop { background:#121317; border:1px solid #2a2d34; border-radius:14px; box-shadow:0 30px 80px rgba(0,0,0,.65); color:#fff; width:90vw; height:90vh; display:flex; flex-direction:column; overflow:hidden; }
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

    // Sempre busca ao vivo (sem cache por ano) -- senao um cenario criado
    // durante a mesma sessao/ano nunca aparece sem recarregar a pagina.
    // Enquanto o usuario nao mexeu manualmente no seletor (`scenarioUserSet`
    // false), re-resolve o default (Fcst 5+7 ou 1o cenario) TODA vez -- isso
    // e' necessario pra auto-curar o caso em que o 1o fetch (ex: org ainda
    // resolvendo a sessao) veio vazio e travou em "Budget" pra sempre (bug
    // encontrado pelo usuario: dropdown so mostrava Budget mesmo com Fcst 5+7
    // cadastrado). Depois que o usuario escolhe manualmente (mesmo Budget),
    // a escolha fica travada e so e' recalculada se o cenario escolhido
    // deixar de existir na lista.
    async function loadScenarios() {
      scenarios = [];
      if (isSupabaseConfigured()) {
        try {
          const org = await resolveOrganizationId();
          const rows = await fetchSupabaseRowsSafe("forecast_scenarios", `organization_id=eq.${org}&reference_year=eq.${year}&order=created_at.asc&select=id,name`);
          scenarios = rows || [];
        } catch (e) { console.warn("cenarios:", e); scenarios = []; }
      }
      const stillExists = scenarioId && scenarios.some((s) => s.id === scenarioId);
      if ((!scenarioUserSet && !scenarioId) || (scenarioId && !stillExists)) {
        const fcst = scenarios.find((s) => /fcst|5\s*\+\s*7/i.test(s.name));
        scenarioId = (fcst || scenarios[0])?.id || null;
      }
    }

    async function loadData() {
      loading = true;
      await loadScenarios();
      let rows = [], tiposRows = [], pecasVendRows = [];
      if (isSupabaseConfigured()) {
        const org = await resolveOrganizationId();
        const payload = { p_org: org, p_year: year, p_month: month, p_period: period, p_scenario_id: scenarioId };
        // Quebra de Peças por vendedor (087). Sem p_scenario_id: a meta nao e
        // quebrada — o detalhe do titular reaproveita a meta consolidada.
        // Tolera 404 (migration ainda nao aplicada) -> detalhe cai no formato
        // antigo, por territorio, em vez de quebrar o painel inteiro.
        const { p_scenario_id, ...pecasPayload } = payload;
        [rows, tiposRows, pecasVendRows] = await Promise.all([
          callSupabaseRpc("comercial_painel_vendas", payload),
          callSupabaseRpc("comercial_painel_tipos", payload),
          callSupabaseRpc("comercial_painel_pecas_vendedor", pecasPayload)
            .catch((e) => { console.warn("pecas por vendedor indisponivel:", e); return []; })
        ]);
      }
      const tr = transform(rows || []);
      coords = tr.coords;
      regioes = tr.regioes;
      tipos = tiposRows || [];
      pecasVend = pecasVendRows || [];
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
        coord: r.coordenacao || "",  // coord de ROTEAMENTO (quem soma de fato a linha)
        gestor: r.gestor || "",
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
      let grao = 0, pec = 0, val = 0, hasGrao = false, hasPec = false;
      Object.values(c.terrs).forEach((t) => {
        if (t.grao) { grao += t.grao.fat.q; val += t.grao.fat.v; hasGrao = true; }
        if (t.pecuaria) { pec += t.pecuaria.fat.q; val += t.pecuaria.fat.v; hasPec = true; }
        if (t.pecas) { val += t.pecas.fat.v; }
      });
      // hasGrao/hasPec = a coordenacao consolida aquela linha (mesmo criterio do
      // sumLine do detalhe). Sul/Norte nao consolidam Pecuaria (roteia pro Paulo),
      // entao o card omite o rotulo em vez de mostrar um zero que nao significa nada.
      return { grao, pec, val, hasGrao, hasPec, isPecas: c.nome === "Peças" };
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
    // Ordem canonica das siglas num rotulo combinado: o territorio que ancora a
    // grade fixa da impressao vem primeiro (sempre "MA_PI", nunca "PI_MA";
    // sempre "RS NORTE_SC", nunca "SC_RS NORTE"). Sem isso o rotulo seguiria a
    // ordem de chegada das linhas da RPC — que era o motivo de a tela mostrar
    // "PI_MA" enquanto o One Page Report ja mostrava "MA_PI".
    // Le PRINT_COL_LAYOUT, definido mais abaixo: so roda em tempo de render.
    let _fixedAnchors = null;
    function fixedAnchorSet() {
      if (!_fixedAnchors) {
        _fixedAnchors = new Set();
        PRINT_COL_LAYOUT.forEach((col) => col.forEach((slot) => {
          if (slot.terrs) _fixedAnchors.add(slot.terrs[0]);
          else if (slot.terr) _fixedAnchors.add(slot.terr);
        }));
      }
      return _fixedAnchors;
    }

    // So ordena o ROTULO. O array `terrs` fica na ordem original de propósito:
    // `terrs[0]` decide a cor do card no fluxo da impressao (groupCard).
    function combinedTerrLabel(terrs) {
      const anchors = fixedAnchorSet();
      return [...terrs]
        .sort((a, b) => (anchors.has(b) ? 1 : 0) - (anchors.has(a) ? 1 : 0))
        .join("_");
    }

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
        terr: combinedTerrLabel(g.terrs),
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
      // "Budget" e' sentinela (scenario_id null) -- tem que aparecer sempre no
      // dropdown, nao so quando `scenarios` vem vazio, senao fica impossivel
      // selecionar Budget assim que existir pelo menos 1 cenario de forecast.
      const scenOpts = `<option value=""${!scenarioId ? " selected" : ""}>Budget</option>` +
        scenarios.map((s) => `<option value="${escapeHtml(s.id)}"${s.id === scenarioId ? " selected" : ""}>${escapeHtml(s.name)}</option>`).join("");
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
              <div class="cvp-print-wrap">
                <button type="button" class="cvp-print" id="cvp-print-toggle" title="Exportar One Page Report" aria-haspopup="true" aria-expanded="false">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                  Exportar
                </button>
                <div class="cvp-print-menu" id="cvp-print-menu">
                  <button type="button" data-action="print">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                    Imprimir
                  </button>
                  <button type="button" data-action="email">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"></path><path d="m22 6-10 7L2 6"></path></svg>
                    Enviar por e-mail
                  </button>
                  <button type="button" data-action="download-excel">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Baixar Excel
                  </button>
                </div>
              </div>
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
      // graoVal/pecVal = faturamento so de maquinas (Grao/Pecuaria), separado do
      // fatv combinado (que tambem inclui pecas/transgrain/acessorios) — usado
      // pelo hero para as linhas "Faturamento Grão"/"Faturamento Pecuária".
      const graoVal = blank(), pecVal = blank();
      coordsArr.forEach((c) => Object.values(c.terrs).forEach((t) => {
        ["grao", "pecuaria", "pecas"].forEach((lk) => {
          const line = t[lk]; if (!line) return;
          METRICS.forEach((m) => { fatv[m] += line[m].v; });
          if (lk === "grao") METRICS.forEach((m) => { grao[m] += line[m].q; graoVal[m] += line[m].v; });
          if (lk === "pecuaria") METRICS.forEach((m) => { pec[m] += line[m].q; pecVal[m] += line[m].v; });
        });
      }));
      tiposArr.forEach((r) => {
        if (r.tipo !== "Transgrain" && r.tipo !== "Acessórios") return;
        METRICS.forEach((m) => { fatv[m] += Number(r[`${m}_val`]) || 0; });
      });
      return { grao, pec, fatv, graoVal, pecVal };
    }

    // Hero = mini-tabela consolidada da empresa (Grão/Pecuária qtd + Faturado R$,
    // colunas Fatur/Fat+Cart/Meta/2025/2024/2023), ao lado do nome.
    function renderHero(container) {
      const { grao, pec, fatv, graoVal, pecVal } = companyTotals(coords, tipos);
      const qtyRow = (o) => METRICS.map((m) => `<td>${nf(o[m])}</td>`).join("");
      const ttlRow = () => METRICS.map((m) => `<td>${nf(grao[m] + pec[m])}</td>`).join("");
      const valRow = (o) => METRICS.map((m) => `<td>${fmtR$(o[m])}</td>`).join("");
      // Faturado Total = tudo (fatv já soma Grão + Pecuária + peças/transgrain/
      // acessórios) — Fatur. Grão/Fatur. Pecuária acima são só o detalhamento
      // de máquinas, não substituem os demais componentes do total.
      const fatTotal = fatv;
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
                <tr class="tkt"><td>Fatur. Grão</td>${valRow(graoVal)}</tr>
                <tr class="tkt"><td>Fatur. Pecuária</td>${valRow(pecVal)}</tr>
                <tr class="fat"><td>Faturado Total</td>${valRow(fatTotal)}</tr>
                <tr class="tkt"><td>Ticket Médio</td>${tktRow()}</tr>
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
      // 4 barras em blocos, empilhadas uma embaixo da outra (Peças/Transgrain/
      // Acessórios/Total), cada uma comparando FATUR. (fat_val) vs META
      // (meta_val) — cor diferente por categoria, reaproveitando a paleta
      // das coordenações.
      const BLOCKBAR_COLOR = { "Peças": "#8b5cf6", "Transgrain": "#f59e0b", "Acessórios": "#22c55e", "Total": "#ef4444" };
      // Sem meta (meta<=0) -> pinta como se fosse 100% (barra cheia), em vez
      // de 0%: ausência de meta não é "não bateu meta nenhuma".
      const blockbarPct = (fat, meta) => meta > 0 ? (fat / meta) * 100 : 100;
      const TOTAL_BLOCKS = 10;
      const blockbars = order.map((nome) => {
        const r = byName[nome] || {};
        return { nome, pct: blockbarPct(Number(r.fat_val) || 0, Number(r.meta_val) || 0) };
      });
      blockbars.push({ nome: "Total", pct: blockbarPct(tot.fat_val, tot.meta_val) });
      const blockbarsHtml = blockbars.map(({ nome, pct }) => {
        const onBlocks = Math.round((Math.min(pct, 100) / 100) * TOTAL_BLOCKS);
        const blocks = Array.from({ length: TOTAL_BLOCKS }, (_, i) => `<span class="blk${i < onBlocks ? " on" : ""}"></span>`).join("");
        return `
        <div class="cvp-blockbar-row" style="--accent:${BLOCKBAR_COLOR[nome]}">
          <span class="cvp-blockbar-lbl">${escapeHtml(nome)}</span>
          <div class="cvp-blockbar-track">${blocks}</div>
          <span class="cvp-blockbar-pct">${pct.toFixed(0)}%</span>
        </div>`;
      }).join("");
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
            <div class="cvp-blockbars">${blockbarsHtml}</div>
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
          // Slot fixo: Grao sempre na 1a coluna, Pecuaria sempre na 2a (grid no CSS).
          // A linha que a coordenacao nao consolida vira um slot vazio, entao o
          // rotulo que sobra fica na mesma posicao dos demais cards.
          const split = (t.hasGrao ? `<span>Grão <b>${nf(t.grao)}</b></span>` : "<span></span>")
            + (t.hasPec ? `<span>Pecuária <b>${nf(t.pec)}</b></span>` : "<span></span>");
          body = `<div class="cvp-qty">${nf(t.grao + t.pec)} <span class="u">un</span></div>
            <div class="cvp-split">${split}</div>
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
        + (scope.vendModo ? ` data-vend-modo="${escapeHtml(scope.vendModo)}"` : "")
        + (scope.vend ? ` data-vend="${escapeHtml(scope.vend)}"` : "")
        + (scope.pecas ? ` data-pecas="1"` : "")
        + (scope.tipos ? ` data-tipos="1"` : "");
    }
    function bindDrill(root) {
      root.querySelectorAll(".cvp-drill").forEach((th) => th.addEventListener("click", (e) => {
        e.stopPropagation();
        const origens = (th.dataset.origens || "").split(",").filter(Boolean);
        const linhas = (th.dataset.linhas || "").split(",").filter(Boolean);
        const terrs = (th.dataset.terrs || "").split(",").filter(Boolean);
        openDetailPopover(th, {
          coord: th.dataset.coord || null, terr: th.dataset.terr || null, terrs,
          label: th.dataset.label || null, tipos: th.dataset.tipos === "1",
          pecas: th.dataset.pecas === "1",
          vend: th.dataset.vend || null, vendModo: th.dataset.vendModo || null,
          linhas
        }, origens);
      }));
    }

    // Quem de fato consolida a Pecuaria da casa (rotulo do rodape do memo).
    // Le a coord de ROTEAMENTO gravada em cada linha — sem hardcode de Paulo.
    function memoOwner(terrs) {
      const seen = [];
      Object.values(terrs).forEach((t) => {
        const p = t.pecuaria;
        if (!p || !p.coord) return;
        const label = p.gestor ? `${p.coord} (${p.gestor})` : p.coord;
        if (!seen.includes(label)) seen.push(label);
      });
      return seen.join(" / ") || "outra coordenação";
    }

    // memo = linha ilustrativa (ex: Pecuaria da casa geografica do Yuri, que
    // consolida no Paulo). Preenche SO a propria linha; TTL/Faturado/Ticket e o
    // status "vs meta" continuam olhando so o que a coordenacao consolida.
    function miniHtml(terr, name, grao, pec, pecas, isSum, scope, memo) {
      const valLines = pecas ? [pecas] : [grao, pec].filter(Boolean);
      const pecMemo = !pec && memo ? memo.line : null;
      const rows = pecas
        ? `<tr class="fat"><td>Faturado</td>${valCells([pecas])}</tr>`
        : `<tr><td>Grão</td>${qtyCells(grao)}</tr>
           <tr${pecMemo ? ' class="memo"' : ""}><td>Pecuária${pecMemo ? " *" : ""}</td>${qtyCells(pec || pecMemo)}</tr>
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
        <tbody>${rows}</tbody></table></div>
        ${pecMemo ? `<div class="cvp-mini-foot">* Pecuária da região — ilustrativo, consolidado em ${escapeHtml(memo.owner)}. Fora do TTL, do Faturado e do vs meta.</div>` : ""}</div>`;
    }

    // Quebra de Peças por vendedor (087) no formato que o miniHtml consome.
    // - "demais" e calculado como TOTAL - titular (decisao do usuario), nao
    //   somando linhas: garante que as duas tabelas fechem no consolidado mesmo
    //   se a RPC e o rollup do painel divergirem por algum filtro.
    // - Meta so no titular, igual a do total (decisao do usuario). "Demais"
    //   fica com meta zero -> o miniHtml mostra "vs meta —" em vez de um
    //   percentual que nao significa nada.
    function pecasVendLines(consolidado) {
      if (!consolidado || !pecasVend.length) return [];
      const titular = pecasVend.find((r) => r.bucket === "titular");
      if (!titular) return [];
      const num = (v) => Number(v) || 0;
      const zero = { q: 0, v: 0 };
      const tLine = {
        fat:  { q: 0, v: num(titular.fat_val) },
        cart: { q: 0, v: num(titular.cart_val) },
        meta: { ...consolidado.meta },
        y1:   { q: 0, v: num(titular.y1_val) },
        y2:   { q: 0, v: num(titular.y2_val) },
        y3:   { q: 0, v: num(titular.y3_val) }
      };
      const resto = (m) => ({ q: 0, v: num(consolidado[m].v) - num(tLine[m].v) });
      const dLine = {
        fat: resto("fat"), cart: resto("cart"),
        meta: { ...zero },
        y1: resto("y1"), y2: resto("y2"), y3: resto("y3")
      };
      const nome = titular.vendedor || "Titular de Peças";
      const cod = titular.cod_vendedor ? `cód. ${titular.cod_vendedor}` : "sem código na atribuição";
      // `vendModo` alimenta o drill (090): 'igual' = so o titular, 'diferente' =
      // todo o resto (inclusive linha sem cod_vendedor), mesma regra da 087.
      // Sem codigo na atribuicao nao ha como filtrar -> as duas tabelas ficam
      // sem drill, em vez de abrir um popover que nao corresponde ao numero.
      return [
        { label: nome.toUpperCase(), sub: cod, line: tLine, vend: titular.cod_vendedor || null, vendModo: "igual" },
        { label: "DEMAIS", sub: "Demais vendedores", line: dLine, vend: titular.cod_vendedor || null, vendModo: "diferente" }
      ];
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
      const sumFrom = (terrs, lk) => {
        const acc = { fat: { q: 0, v: 0 }, cart: { q: 0, v: 0 }, meta: { q: 0, v: 0 }, y1: { q: 0, v: 0 }, y2: { q: 0, v: 0 }, y3: { q: 0, v: 0 } };
        let has = false;
        Object.values(terrs).forEach((t) => { if (t[lk]) { has = true; ["fat", "cart", "meta", "y1", "y2", "y3"].forEach((m) => { acc[m].q += t[lk][m].q; acc[m].v += t[lk][m].v; }); } });
        return has ? acc : null;
      };
      const sumLine = (lk) => sumFrom(c.terrs, lk);

      // Tabelas por territorio: por CASA geografica nas coordenacoes geograficas
      // (Sul/Norte/Oeste/Exportacao) -> traz o territorio com Grao E Pecuaria,
      // mesmo os "so Pecuaria" (informativa, ja somada no Paulo pelo rollup).
      // Nas funcionais (Pecuaria/Pecas) o detalhe segue por roteamento.
      const GEO = ["Sul", "Norte", "Oeste", "Exportação"];
      const src = GEO.includes(c.nome) ? (regioes.find((x) => x.nome === c.nome) || c) : c;
      const eff = (line) => (line && !line.orfao) ? line : null;  // orfao nao vira card

      const cards = [];
      if (isPecas) {
        // 1) Consolidado: repete o total do card (100% das pecas, com a meta
        //    nacional). 2) Titular da atribuicao nacional. 3) Demais.
        const consPecas = sumLine("pecas");
        // Drill de Peças (090): coordenacao 'Peças' + linha 'Peças'. As tabelas
        // por vendedor filtram por cod_vendedor (igual/diferente do titular).
        const pecasScope = { coord: c.nome, linhas: ["Peças"], pecas: true };
        cards.push(miniHtml(c.nome.toUpperCase(), c.gestor || "", null, null, consPecas, true, pecasScope));
        const vendCards = pecasVendLines(consPecas);
        if (vendCards.length) {
          vendCards.forEach((vc) => cards.push(miniHtml(vc.label, vc.sub, null, null, vc.line, false,
            vc.vend ? { ...pecasScope, vend: vc.vend, vendModo: vc.vendModo, label: vc.label } : null)));
        } else {
          // Migration 087 ainda nao aplicada: mantem o detalhe antigo por
          // territorio em vez de deixar a aba vazia.
          Object.entries(src.terrs).forEach(([terr, t]) => { if (t.pecas) cards.push(miniHtml(terr, t.pecas.resp || "", null, null, t.pecas, false, { ...pecasScope, terr })); });
        }
      } else {
        // Consolidado: drill pela coordenacao de roteamento (popover ganha col Territorio).
        const graoSum = sumLine("grao"), pecSum = sumLine("pecuaria");
        const consLinhas = [graoSum && "Grão", pecSum && "Pecuária"].filter(Boolean);
        // Coordenacao geografica que nao consolida Pecuaria (Sul/Norte -> roteia
        // pro Paulo): mostra a Pecuaria da CASA como linha memo, so ilustrativa.
        // Drill, TTL, Faturado, Ticket e vs meta seguem so o roteamento.
        const memoLine = (!pecSum && src !== c) ? sumFrom(src.terrs, "pecuaria") : null;
        const memo = memoLine ? { line: memoLine, owner: memoOwner(src.terrs) } : null;
        cards.push(miniHtml(c.nome.toUpperCase(), c.gestor || "", graoSum, pecSum, null, true, { coord: c.nome, linhas: consLinhas }, memo));
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
    let popRows = [], popShowTerr = false, popShowVend = false, popSort = { key: null, dir: 1 };
    function fmtFullR$(v) { return "R$ " + nf(v || 0); }

    function closeDetailPopover() {
      if (!popEl) return;
      popEl.remove(); popEl = null;
      document.removeEventListener("keydown", onPopKey);
    }
    function onPopKey(e) { if (e.key === "Escape") closeDetailPopover(); }

    function renderPopTable(rows, showTerr, showVend) {
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
      // colunas antes de Qtd/Valor: Tipo + [Território] + [Vendedor] + Cód.Cli +
      // Cliente + Cidade/UF + Cult + Cód.Prod + Produto
      const span = 7 + (showTerr ? 1 : 0) + (showVend ? 1 : 0);
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
          ${showVend ? `<td class="l">${escapeHtml(r.vendedor || "—")}</td>` : ""}
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
        <thead><tr>${sortTh("tipo", "Tipo")}${showTerr ? sortTh("territorio", "Território") : ""}${showVend ? sortTh("vendedor", "Vendedor") : ""}${sortTh("cod_cliente", "Cód. Cli.")}${sortTh("cliente", "Cliente")}${sortTh("cidade", "Cidade/UF")}${sortTh("cultura", "Cult")}${sortTh("cod_produto", "Cód. Prod.")}${sortTh("produto", "Produto")}${sortTh("quantidade", "Qtd", "num")}${sortTh("valor", "Valor", "num")}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td colspan="${span}">Total · ${items.length} ${items.length === 1 ? "linha" : "linhas"}</td><td class="num${totQ < 0 ? " neg" : ""}">${nf(totQ)}</td><td class="num${totV < 0 ? " neg" : ""}">${fmtFullR$(totV)}</td></tr></tfoot>
      </table>`;
    }

    // Exporta as linhas de transação do popover de detalhe (exclui as linhas
    // "resumo" sintéticas do drill do hero — não são transações reais).
    function exportDetailPopoverRows(titulo) {
      const NUM = ["quantidade", "valor"];
      const items = popRows.filter((r) => !r.resumo);
      if (popSort.key) {
        const k = popSort.key, d = popSort.dir, isNum = NUM.includes(k);
        items.sort((a, b) => isNum
          ? d * ((Number(a[k]) || 0) - (Number(b[k]) || 0))
          : d * String(a[k] || "").localeCompare(String(b[k] || ""), "pt-BR"));
      }
      const columns = [
        { label: "Tipo", value: (r) => r.tipo || "" },
        ...(popShowTerr ? [{ label: "Território", value: (r) => r.territorio || "" }] : []),
        ...(popShowVend ? [{ label: "Vendedor", value: (r) => r.vendedor || "" }] : []),
        { label: "Cód. Cli.", value: (r) => r.cod_cliente || "" },
        { label: "Cliente", value: (r) => r.cliente || "" },
        { label: "Cidade/UF", value: (r) => [r.cidade, r.uf].filter(Boolean).join("/") },
        { label: "Cult", value: (r) => r.cultura || "" },
        { label: "Cód. Prod.", value: (r) => r.cod_produto || "" },
        { label: "Produto", value: (r) => r.produto || "" },
        { label: "Qtd", value: (r) => Number(r.quantidade) || 0 },
        { label: "Valor", value: (r) => Number(r.valor) || 0 },
      ];
      exportRowsToExcel(items, columns, `Detalhamento_${titulo}`);
    }

    // Renderiza a tabela no popover atual e liga o sort (setas ↑↓) nos cabecalhos.
    function paintPopTable() {
      if (!popEl) return;
      const body = popEl.querySelector(".cvp-pop-body");
      if (!body) return;
      body.innerHTML = renderPopTable(popRows, popShowTerr, popShowVend);
      body.querySelectorAll(".cvp-pop-tbl th[data-sort]").forEach((th) => th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (popSort.key === key) popSort.dir *= -1; else { popSort.key = key; popSort.dir = 1; }
        paintPopTable();
      }));
    }

    // Busca as transacoes (NF/Ped) que formam o numero clicado e abre o modal centralizado.
    async function openDetailPopover(anchor, scope, origens) {
      closeDetailPopover();
      // label vem primeiro: nas tabelas de Peças por vendedor o escopo tem coord
      // ('Peças') E label (o nome do vendedor) -- quem identifica o card e o label.
      const titulo = (origens.length > 1 ? "Faturado + Carteira" : "Faturado") + " · " + (scope.label || scope.coord || scope.terr || "");
      const backdrop = document.createElement("div");
      backdrop.className = "cvp-pop-backdrop";
      backdrop.innerHTML = `<div class="cvp-pop">
          <div class="cvp-pop-head"><span>${escapeHtml(titulo)}</span><div style="display:flex;align-items:center;gap:8px;flex-shrink:0"><div class="cvp-pop-export" style="display:none"></div><button class="cvp-pop-x" type="button" aria-label="Fechar">✕</button></div></div>
          <div class="cvp-pop-body"><div class="cvp-empty" style="padding:22px">Carregando…</div></div>
        </div>`;
      document.body.appendChild(backdrop);
      popEl = backdrop;
      backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeDetailPopover(); });
      backdrop.querySelector(".cvp-pop-x").addEventListener("click", closeDetailPopover);
      backdrop.querySelector(".cvp-pop-export").innerHTML = exportButtonHtml();
      backdrop.querySelector(".vp-export-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        exportDetailPopoverRows(titulo);
      });
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
            p_coordenacao: scope.coord || null, p_territorio: terr,
            p_cod_vendedor: scope.vend || null, p_vendedor_modo: scope.vendModo || null
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
      // Coluna Vendedor só nas tabelas de Peças (nas de máquinas o responsável
      // já é o próprio card). Vale inclusive no consolidado e em "Demais", que
      // é onde ela informa de fato — cada linha mostra quem vendeu.
      popShowVend = !!scope.pecas;
      popSort = { key: null, dir: 1 };                 // cada abertura comeca na ordem padrao (valor desc)
      const exportWrap = backdrop.querySelector(".cvp-pop-export");
      if (exportWrap) exportWrap.style.display = popRows.some((r) => !r.resumo) ? "flex" : "none";
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

    // Modelo (dados) de um card do report -- desacoplado do "pintor" (HTML pro
    // Imprimir/E-mail, Excel pro Baixar Excel): as DUAS saidas tem que nascer
    // do mesmo card, senao divergem com o tempo. grao/pec = linhas de
    // quantidade (null = linha apagada, igual ao modelo); fatVals = os 6
    // valores da linha FATURA (sempre R$ cheio).
    function buildCard(cfg) {
      const { name, terr, colors, grao, pec, fatVals, label, pecMemo } = cfg;
      // memo = Pecuaria da casa geografica que consolida em OUTRA coordenacao
      // (Sul/Norte -> Paulo). Preenche so a propria linha: TTL e FATURA ignoram.
      const memo = !pec && pecMemo ? pecMemo : null;
      return { name: name || "", terr: terr || "", colors, grao: grao || null, pec: pec || null, memo, fatVals, label: label || null };
    }

    // Card a partir de linhas metricObj: FATURA = soma dos valores das linhas.
    function cardFromLines(name, terr, colors, grao, pec, pecas, label, pecMemo) {
      const fatVals = {};
      METRICS.forEach((m) => {
        fatVals[m] = (grao ? grao[m].v : 0) + (pec ? pec[m].v : 0) + (pecas ? pecas[m].v : 0);
      });
      return buildCard({ name, terr, colors, grao, pec, fatVals, label, pecMemo });
    }

    // Pintor HTML de um card (Imprimir / anexo de e-mail) -- saida idêntica à
    // versão anterior (mesma marcação/CSS), só que a partir do card já pronto.
    function cardHtml(card) {
      const { name, terr, colors, grao, pec, memo, fatVals, label } = card;
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
            <tr${memo ? ' class="memo"' : ""}><td class="lab${(pec || memo) ? "" : " off"}" colspan="2">PECUÁRIA${memo ? " *" : ""}</td>${(pec || memo) ? cells(pec || memo, "q") : empty}</tr>
            <tr class="ttl" style="background:${colors.ttl}"><td class="lab" colspan="2">TTL qtd</td>${ttlCellsP}</tr>
            <tr class="fat"><td class="lab" colspan="2">FATURA</td>${METRICS.map((m) => `<td>${pfmt(fatVals[m])}</td>`).join("")}</tr>
          </tbody>
        </table>
      </div>`;
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

    // Monta o MODELO do report (dados, sem HTML nem Excel): qual card vai em
    // cada uma das 3 colunas, na ordem. As duas saídas (pageModelToHtml pro
    // Imprimir/e-mail, buildExcelWorkbook pro Baixar Excel) pintam esse mesmo
    // modelo -- garante que os dois formatos nunca divirjam entre si.
    function buildPageModel(data, subtitle, scenarioName) {
      const { coords: pc, regioes: pr, tipos: pt } = data;
      const coord = (n) => pc.find((x) => x.nome === n) || null;

      // --- 6 cards consolidados (topo de cada coluna) ---
      const tot = companyTotals(pc, pt);
      const numLine = (qMap) => { const o = {}; METRICS.forEach((m) => { o[m] = { q: qMap[m], v: 0 }; }); return o; };
      const geralCard = buildCard({
        name: "Pedro", terr: "BRASIL", colors: PRINT_COLORS.geral, label: "GERAL",
        grao: numLine(tot.grao), pec: numLine(tot.pec), fatVals: tot.fatv
      });
      const consolidated = (nome, terrLabel, colors, label) => {
        const c = coord(nome); if (!c) return null;
        const pec = sumTerrLine(c, "pecuaria");
        // Sem Pecuaria no roteamento (Sul/Norte) -> mostra a da CASA geografica
        // como linha memo, ilustrativa. Mesma regra do painel ao vivo.
        const memo = pec ? null : sumTerrLine(pr.find((x) => x.nome === nome), "pecuaria");
        return cardFromLines(c.gestor || nome, terrLabel, colors,
          sumTerrLine(c, "grao"), pec, sumTerrLine(c, "pecas"), label, memo);
      };
      const col1Top = [geralCard, consolidated("Sul", "SUL", PRINT_COLORS.sul, "REG. SUL")].filter(Boolean);
      const col2Top = [
        consolidated("Pecuária", "PECUÁRIA", PRINT_COLORS.pecuaria, "PECUÁRIA"),
        consolidated("Norte", "NORTE", PRINT_COLORS.norte, "REG. NORTE")
      ].filter(Boolean);
      const col3Top = [
        consolidated("Exportação", "EXPO", PRINT_COLORS.exportacao, "EXPORTAÇÃO"),
        consolidated("Oeste", "OESTE", PRINT_COLORS.oeste, "REG. OESTE")
      ].filter(Boolean);

      // --- cards de território: posição fixa (ver PRINT_COL_LAYOUT acima) ---
      // terrHome guarda a casa geográfica de cada território (só pra cor — a
      // grade fixa mistura territórios de casas diferentes na mesma coluna
      // impressa, ex: RR é Norte mas fica na coluna 1).
      const terrHome = {};
      pr.forEach((r) => Object.keys(r.terrs).forEach((terr) => { terrHome[terr] = r.nome; }));
      const colorFor = (terr) => PRINT_COLORS[HOME_COLOR_KEY[terrHome[terr]] || "norte"];

      // Fusão por responsável tem que juntar a grade fixa com território "fora
      // dela" (cadastro novo reatribuído) numa passada só — senão um território
      // reatribuído pro MESMO responsável de um território já fixo (ex: SC
      // reatribuído pro Caio, que já responde por RS NORTE) nunca é comparado
      // contra o da grade e vira card solto em vez de fundir (bug 2026-07-20).
      // MAS a fusão só pode rodar DENTRO da mesma casa geográfica — nomes se
      // repetem entre pessoas DIFERENTES em regiões diferentes (ex: existe um
      // "Gustavo" no Sul/RS SUL e outro "Gustavo" no Oeste/RO — pessoas
      // distintas, mera coincidência de primeiro nome). Fundir cross-região
      // juntaria dado de duas pessoas erradas.
      const mergedGroups = [];
      pr.forEach((r) => {
        const atomicCards = [];
        Object.entries(r.terrs).forEach(([terr, t]) => {
          const g = (t.grao && !t.grao.orfao) ? t.grao : null;
          const p = (t.pecuaria && !t.pecuaria.orfao) ? t.pecuaria : null;
          if (!g && !p) return;
          if (g && p && g.resp !== p.resp) {
            atomicCards.push({ terr, resp: g.resp || "A definir", grao: g, pec: null, linhas: ["Grão"] });
            atomicCards.push({ terr, resp: p.resp || "A definir", grao: null, pec: p, linhas: ["Pecuária"] });
          } else {
            const linhas = [g && "Grão", p && "Pecuária"].filter(Boolean);
            atomicCards.push({ terr, resp: (g || p).resp || "A definir", grao: g, pec: p, linhas });
          }
        });
        mergedGroups.push(...mergeSameRespCards(atomicCards));
      });

      // territorio+linha -> indice do grupo fundido que o contém.
      const ownerIdx = {};
      mergedGroups.forEach((group, idx) => {
        group.terrs.forEach((terr) => group.linhas.forEach((lh) => { ownerIdx[`${terr}|${lh}`] = idx; }));
      });
      const findGroupIdx = (terr, mode) => {
        const key = mode === "grao" ? "Grão" : mode === "pec" ? "Pecuária" : null;
        return key ? ownerIdx[`${terr}|${key}`] : (ownerIdx[`${terr}|Grão`] ?? ownerIdx[`${terr}|Pecuária`]);
      };
      // Mesma regra de rótulo combinado usada na tela (combinedTerrLabel):
      // território da grade fixa primeiro, nunca a ordem de chegada da RPC.
      const labelFor = (g) => combinedTerrLabel(g.terrs);
      const drawnGroups = new Set();   // evita desenhar o mesmo grupo fundido 2x
      const groupCard = (idx, colorTerr) => {
        const g = mergedGroups[idx];
        return cardFromLines(g.resp || "A definir", labelFor(g), colorFor(colorTerr), g.grao, g.pec, null);
      };

      const flow = PRINT_COL_LAYOUT.map((col) => col.map((slot) => {
        if (slot.pecas) {
          const cp = coord("Peças");
          return cp ? cardFromLines(cp.gestor || "—", "PEÇAS", PRINT_COLORS.pecas, null, null, sumTerrLine(cp, "pecas")) : null;
        }
        const anchorTerr = slot.terrs ? slot.terrs[0] : slot.terr;
        const idx = findGroupIdx(anchorTerr, slot.mode);
        if (idx == null || drawnGroups.has(idx)) return null;
        drawnGroups.add(idx);
        return groupCard(idx, anchorTerr);
      }).filter(Boolean));

      // Território fora da grade fixa (cadastro novo na Atribuição): qualquer
      // grupo fundido ainda não desenhado (nem por si, nem por fusão com
      // território da grade) entra na coluna mais curta — não quebra o report.
      mergedGroups.forEach((g, idx) => {
        if (drawnGroups.has(idx)) return;
        drawnGroups.add(idx);
        let shortest = 0;
        for (let i = 1; i < flow.length; i++) if (flow[i].length < flow[shortest].length) shortest = i;
        flow[shortest].push(groupCard(idx, g.terrs[0]));
      });

      return {
        subtitle, scenarioName,
        emitted: new Date().toLocaleDateString("pt-BR"),
        empty: !pc.length,
        cols: [col1Top.concat(flow[0]), col2Top.concat(flow[1]), col3Top.concat(flow[2])]
      };
    }

    // Pintor HTML do modelo (Imprimir / anexo de e-mail) -- saída idêntica à
    // versão anterior.
    function pageModelToHtml(model) {
      const { subtitle, scenarioName, emitted, empty, cols } = model;
      return `<section class="page">
        <div class="ph">
          <h1>Painel de Vendas · Marcher Brasil</h1>
          <span class="per">${escapeHtml(subtitle)}</span>
          <span class="meta">Meta: ${escapeHtml(scenarioName)} · emitido em ${emitted}</span>
        </div>
        ${empty ? `<p class="pempty">Sem dados de vendas para o período.</p>` : `
        <div class="cols">
          <div class="col">${cols[0].map(cardHtml).join("")}</div>
          <div class="col">${cols[1].map(cardHtml).join("")}</div>
          <div class="col">${cols[2].map(cardHtml).join("")}</div>
        </div>`}
      </section>`;
    }

    // autoPrint=false tambem e usado pro caminho de e-mail (Browserless
    // gerando o PDF a partir deste mesmo html no servidor): alem de nao
    // disparar window.print(), remove o @media screen (fundo cinza + sombra +
    // margem "preview de tela") -- o PDF deve sair no layout limpo de
    // impressao, nao no visual de preview em tela.
    function buildPrintDoc(mesData, ytdData, autoPrint = true) {
      const scenarioName = scenarios.find((s) => s.id === scenarioId)?.name || "Budget";
      const mLabel = MONTHS[month - 1];
      const p1 = pageModelToHtml(buildPageModel(mesData, `Mês — ${mLabel}/${year}`, scenarioName));
      const p2 = pageModelToHtml(buildPageModel(ytdData, `Acumulado YTD — Janeiro a ${mLabel}/${year}`, scenarioName));
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
    border:.25px solid #e4e4e4; font-variant-numeric:tabular-nums; overflow:hidden; white-space:nowrap; }
  .pc thead th { color:#fff; font-weight:600; font-size:6px; letter-spacing:.03em; border-color:rgba(0,0,0,.18); }
  .pc th.nm { text-align:left; font-size:7px; font-weight:700; }
  .pc th.nm .nmw { display:flex; align-items:center; gap:.8mm; }
  .pc th.nm .av { flex:none; width:3.2mm; height:3.2mm; line-height:3.2mm; border-radius:50%;
    background:#fff; font-size:5px; font-weight:700; text-align:center; }
  .pc th.nm .nmx { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pc th.nm .tr { flex:none; font-weight:600; font-size:6.2px; opacity:.92; }
  .pc td.lab { text-align:left; font-size:6.3px; font-weight:600; letter-spacing:.02em; color:#333; }
  .pc td.lab.off { color:#b8b8b8; font-weight:400; }
  /* Linha memo (ilustrativa, fora do TTL/FATURA): italico cinza no fundo claro. */
  .pc tr.memo td { color:#8a8a8a; font-style:italic; font-weight:400; }
  .pc tr.ttl td { font-weight:700; }
  .pc tr.fat td { font-weight:600; background:#f5f5f5; }
  .pempty { padding:20mm; text-align:center; color:#888; font-size:11px; }
  ${autoPrint ? `@media screen {
    body { background:#8a8f98; padding:14px; }
    .page { background:#fff; margin:0 auto 14px; padding:7mm; box-shadow:0 3px 18px rgba(0,0,0,.35); }
  }` : ""}
</style>
</head>
<body>
${p1}
${p2}
${autoPrint ? '<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 400); });<\/script>' : ""}
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
      const btn = container.querySelector("#cvp-print-toggle");
      // window.open precisa ser síncrono no clique, senão o popup blocker segura.
      const w = window.open("", "_blank");
      if (!w) { await appAlert("O navegador bloqueou a janela do relatório. Libere pop-ups para este site e tente novamente.", "warn"); return; }
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
        await appAlert("Falha ao gerar o One Page Report. Verifique a conexão e tente novamente.", "error");
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    // ---------------------------------------------------------------- envio por e-mail
    // O PDF nasce no SERVIDOR (Edge Function -> Browserless, Chrome de
    // verdade) a partir do MESMO html do One Page Report, garantindo
    // fidelidade identica ao "Imprimir" -- depois de 3 tentativas com
    // html2canvas (aproximacao por screenshot no navegador) saindo com
    // defeito visual, desistimos de gerar o PDF no cliente. Aqui so montamos
    // o html (sem o script de auto-print, que so faz sentido na janela de
    // impressao) e mandamos pra function converter e anexar no e-mail.

    function reportFilename() {
      return `painel-vendas-${MONTHS[month - 1].toLowerCase()}-${year}.pdf`;
    }

    async function buildReportHtmlForEmail() {
      const [mesData, ytdData] = await Promise.all([fetchPainelData("mes"), fetchPainelData("ytd")]);
      return buildPrintDoc(mesData, ytdData, false);
    }

    // ---------------------------------------------------------------- download em excel
    // Gera um .xlsx EDITÁVEL a partir do mesmo MODELO (buildPageModel) usado
    // no Imprimir/e-mail -- mesmas colunas (FATUR./FAT.+CART./META/anos),
    // mesmas linhas (GRÃO/PECUÁRIA/TTL qtd/FATURA), mesmas cores por
    // coordenação, negrito/itálico, bordas e paginação A4 paisagem em 1
    // página por aba (Mês/YTD) -- só que como planilha de verdade (ExcelJS,
    // 100% no navegador, sem passar pelo servidor). O único ajuste é o
    // cabeçalho do card: o avatar circular + nome + território, que na
    // impressão ficam em elementos HTML separados dentro da mesma célula
    // visual, aqui viram um único texto "Nome · Território" na célula
    // mesclada -- mesma informação, sem o círculo decorativo (Excel não tem
    // um jeito nativo elegante para reproduzir isso numa célula).
    function reportFilenameExcel() {
      return `painel-vendas-${MONTHS[month - 1].toLowerCase()}-${year}.xlsx`;
    }

    const XLS_BORDER_THIN = { style: "thin", color: { argb: "FFE4E4E4" } };
    const XLS_BORDER_ALL = { top: XLS_BORDER_THIN, left: XLS_BORDER_THIN, bottom: XLS_BORDER_THIN, right: XLS_BORDER_THIN };
    const XLS_NUMFMT = '#,##0;(#,##0);"-"'; // mesmo criterio do pfmt: zero vira "-", negativo entre parenteses
    const XLS_CARD_W = 8; // 2 cols (nome/terr mesclado) + 6 metricas, igual ao colgroup do card impresso
    const XLS_BLOCK_STARTS = [1, 10, 19]; // col inicial de cada uma das 3 colunas do report (8 + 1 de respiro)
    const XLS_TOTAL_COLS = XLS_BLOCK_STARTS[XLS_BLOCK_STARTS.length - 1] + XLS_CARD_W - 1;

    function xlsHex(hex) { return `FF${hex.replace("#", "").toUpperCase()}`; }
    function xlsColLetter(n) {
      let s = "", x = n;
      while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); }
      return s;
    }
    function xlsFill(argb) { return { type: "pattern", pattern: "solid", fgColor: { argb } }; }

    // Escreve um card (mesmo shape de buildCard/cardHtml) a partir da linha
    // `row`, ocupando XLS_CARD_W colunas a partir de `col`. Devolve a
    // próxima linha livre.
    function writeCardToSheet(ws, card, row, col) {
      const { name, terr, colors, grao, pec, memo, fatVals, label } = card;
      let r = row;
      const paintRow = (fillArgb) => {
        for (let c = col; c < col + XLS_CARD_W; c++) {
          const cell = ws.getCell(r, c);
          cell.border = XLS_BORDER_ALL;
          if (fillArgb) cell.fill = xlsFill(fillArgb);
        }
      };
      if (label) {
        ws.mergeCells(r, col, r, col + XLS_CARD_W - 1);
        const c = ws.getCell(r, col);
        c.value = label;
        c.font = { size: 6, bold: true, color: { argb: "FF555555" } };
        r++;
      }
      // header: nome+territorio mesclados + 6 metricas
      ws.mergeCells(r, col, r, col + 1);
      const nameCell = ws.getCell(r, col);
      nameCell.value = terr ? `${name} · ${terr}` : name;
      nameCell.font = { size: 7, bold: true, color: { argb: "FFFFFFFF" } };
      nameCell.alignment = { vertical: "middle", wrapText: false };
      ["FATUR.", "FAT.+CART.", "META", String(year - 1), String(year - 2), String(year - 3)].forEach((h, i) => {
        const cell = ws.getCell(r, col + 2 + i);
        cell.value = h;
        cell.font = { size: 6, bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = { horizontal: "right", vertical: "middle" };
      });
      paintRow(xlsHex(colors.head));
      r++;
      // linhas de dado: GRÃO, PECUÁRIA(*), TTL qtd, FATURA
      const dataRow = (labelText, values, opts = {}) => {
        ws.mergeCells(r, col, r, col + 1);
        const labelCell = ws.getCell(r, col);
        labelCell.value = labelText;
        labelCell.font = { size: 6.5, bold: !!opts.bold, italic: !!opts.italic, color: { argb: opts.dim ? "FFB8B8B8" : (opts.italic ? "FF8A8A8A" : "FF333333") } };
        METRICS.forEach((m, i) => {
          const cell = ws.getCell(r, col + 2 + i);
          const v = values ? values[m] : null;
          if (v != null) { cell.value = Math.round(v); cell.numFmt = XLS_NUMFMT; }
          cell.font = { size: 6.5, bold: !!opts.bold, italic: !!opts.italic };
          cell.alignment = { horizontal: "right" };
        });
        paintRow(opts.fill);
        r++;
      };
      const graoVals = grao ? Object.fromEntries(METRICS.map((m) => [m, grao[m].q])) : null;
      dataRow("GRÃO", graoVals, { dim: !grao });
      const pecLine = pec || memo;
      const pecVals = pecLine ? Object.fromEntries(METRICS.map((m) => [m, pecLine[m].q])) : null;
      dataRow(memo ? "PECUÁRIA *" : "PECUÁRIA", pecVals, { dim: !pecLine, italic: !!memo });
      const ttlVals = (grao || pec)
        ? Object.fromEntries(METRICS.map((m) => [m, (grao ? grao[m].q : 0) + (pec ? pec[m].q : 0)]))
        : null;
      dataRow("TTL qtd", ttlVals, { bold: true, fill: xlsHex(colors.ttl) });
      dataRow("FATURA", fatVals, { bold: true, fill: "FFF5F5F5" });
      return r;
    }

    function writeColumnCards(ws, cards, col, startRow) {
      let r = startRow;
      cards.forEach((card) => { r = writeCardToSheet(ws, card, r, col) + 1; }); // +1 = linha de respiro
      return r;
    }

    function writePageSheet(workbook, name, model) {
      const marginIn = 7 / 25.4; // 7mm, igual ao @page da impressão
      const ws = workbook.addWorksheet(name, {
        views: [{ showGridLines: false }],
        pageSetup: {
          paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1,
          margins: { left: marginIn, right: marginIn, top: marginIn, bottom: marginIn, header: 0, footer: 0 }
        }
      });
      XLS_BLOCK_STARTS.forEach((start) => {
        // 9.2, não 9: o ExcelJS trata width===9 como "igual ao default" e
        // silenciosamente NÃO grava o customWidth no xlsx -- ao reabrir, a
        // coluna volta pra largura padrão (bug confirmado empiricamente).
        ws.getColumn(start).width = 9.2;
        ws.getColumn(start + 1).width = 8;
        for (let i = 2; i < XLS_CARD_W; i++) ws.getColumn(start + i).width = 6.5;
        if (start > 1) ws.getColumn(start - 1).width = 2; // respiro entre colunas
      });

      ws.mergeCells(1, 1, 1, XLS_TOTAL_COLS);
      const titleCell = ws.getCell(1, 1);
      titleCell.value = `Painel de Vendas · Marcher Brasil — ${model.subtitle} — Meta: ${model.scenarioName} · emitido em ${model.emitted}`;
      titleCell.font = { size: 11, bold: true, color: { argb: "FF1F3864" } };
      ws.getRow(1).height = 18;

      if (model.empty) {
        ws.mergeCells(3, 1, 3, XLS_TOTAL_COLS);
        const c = ws.getCell(3, 1);
        c.value = "Sem dados de vendas para o período.";
        c.alignment = { horizontal: "center" };
        return;
      }

      const startRow = 3;
      let maxRow = startRow;
      model.cols.forEach((cards, i) => {
        const endRow = writeColumnCards(ws, cards, XLS_BLOCK_STARTS[i], startRow);
        if (endRow > maxRow) maxRow = endRow;
      });
      ws.pageSetup.printArea = `A1:${xlsColLetter(XLS_TOTAL_COLS)}${maxRow}`;
    }

    function buildExcelWorkbook(mesModel, ytdModel) {
      const workbook = new window.ExcelJS.Workbook();
      workbook.creator = "VectonPlan";
      workbook.created = new Date();
      writePageSheet(workbook, "Mês", mesModel);
      writePageSheet(workbook, "YTD", ytdModel);
      return workbook;
    }

    async function downloadReportExcel(container) {
      const btn = container.querySelector("#cvp-print-toggle");
      if (btn) btn.disabled = true;
      try {
        if (!window.ExcelJS) throw new Error("Biblioteca de Excel não carregou. Recarregue a página e tente de novo.");
        const scenarioName = scenarios.find((s) => s.id === scenarioId)?.name || "Budget";
        const mLabel = MONTHS[month - 1];
        const [mesData, ytdData] = await Promise.all([fetchPainelData("mes"), fetchPainelData("ytd")]);
        const mesModel = buildPageModel(mesData, `Mês — ${mLabel}/${year}`, scenarioName);
        const ytdModel = buildPageModel(ytdData, `Acumulado YTD — Janeiro a ${mLabel}/${year}`, scenarioName);
        const workbook = buildExcelWorkbook(mesModel, ytdModel);
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = reportFilenameExcel();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) {
        console.error("baixar excel:", e);
        await appAlert(e?.message || "Falha ao gerar o Excel. Verifique a conexão e tente novamente.", "error");
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    let emailEl = null;

    // Destinatarios lembrados entre envios (localStorage, por navegador/usuario
    // -- nao e um cadastro de servidor). Toggle unico controla as duas pontas:
    // ligado = salva os e-mails usados E sugere os ja salvos; desligado = nem
    // salva nem sugere (nao fica juntando dado silenciosamente).
    const EMAIL_SUGGEST_LIST_KEY = "vp_cvp_email_recipients_v1";
    const EMAIL_SUGGEST_TOGGLE_KEY = "vp_cvp_email_suggest_on_v1";
    const MAX_SAVED_RECIPIENTS = 30;

    function getSuggestEnabled() {
      try { return localStorage.getItem(EMAIL_SUGGEST_TOGGLE_KEY) !== "0"; } catch (_) { return true; } // default ligado
    }
    function setSuggestEnabled(on) {
      try { localStorage.setItem(EMAIL_SUGGEST_TOGGLE_KEY, on ? "1" : "0"); } catch (_) { /* localStorage indisponivel */ }
    }
    function getSavedRecipients() {
      try { return JSON.parse(localStorage.getItem(EMAIL_SUGGEST_LIST_KEY) || "[]"); } catch (_) { return []; }
    }
    function saveRecipients(emails) {
      if (!getSuggestEnabled() || !emails.length) return;
      try {
        const merged = Array.from(new Set([...emails, ...getSavedRecipients()])).slice(0, MAX_SAVED_RECIPIENTS);
        localStorage.setItem(EMAIL_SUGGEST_LIST_KEY, JSON.stringify(merged));
      } catch (_) { /* localStorage indisponivel/cheio -- nao trava o envio */ }
    }

    function closeEmailModal() {
      if (!emailEl) return;
      emailEl.remove();
      emailEl = null;
      document.removeEventListener("keydown", onEmailKey);
    }
    function onEmailKey(e) { if (e.key === "Escape") closeEmailModal(); }

    // Popover de alerta (erro de validacao/envio ou confirmacao de sucesso),
    // sempre exibido por cima do modal de e-mail. Escuta Escape em fase de
    // captura + stopPropagation pra impedir que o Escape "vaze" pro listener
    // do modal de e-mail (onEmailKey) e feche o modal por baixo do popover.
    function showEmailAlert(message, kind, onOk) {
      const backdrop = document.createElement("div");
      backdrop.className = "cvp-alert-backdrop";
      const isErr = kind === "err";
      backdrop.innerHTML = `
        <div class="cvp-alert" role="alertdialog" aria-modal="true">
          <div class="cvp-alert-row">
            <div class="cvp-alert-icon ${isErr ? "err" : "ok"}">
              ${isErr
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>'}
            </div>
            <div class="cvp-alert-msg">${escapeHtml(message)}</div>
          </div>
          <div class="cvp-alert-actions"><button type="button" class="cvp-alert-ok">OK</button></div>
        </div>
      `;
      document.body.appendChild(backdrop);
      const okBtn = backdrop.querySelector(".cvp-alert-ok");
      function dismiss() {
        backdrop.remove();
        document.removeEventListener("keydown", onKey, true);
        if (onOk) onOk();
      }
      function onKey(e) {
        if (e.key === "Escape" || e.key === "Enter") { e.stopPropagation(); dismiss(); }
      }
      okBtn.addEventListener("click", dismiss);
      backdrop.addEventListener("click", (e) => { if (e.target === backdrop) dismiss(); });
      document.addEventListener("keydown", onKey, true);
      okBtn.focus();
    }

    function openEmailModal(container) {
      closeEmailModal();
      const mLabel = MONTHS[month - 1];
      const defaultSubject = `Painel de Vendas — ${mLabel}/${year}`;
      const signature = state.profile?.name || "";
      const defaultBody = `Olá,\n\nSegue em anexo o Painel de Vendas de ${mLabel}/${year} (mês e acumulado YTD).\n\nAtenciosamente,\n${signature}`;
      const suggestOn = getSuggestEnabled();
      const suggestOpts = suggestOn
        ? getSavedRecipients().map((e) => `<option value="${escapeHtml(e)}">`).join("")
        : "";

      const backdrop = document.createElement("div");
      backdrop.className = "cvp-email-backdrop";
      backdrop.innerHTML = `
        <div class="cvp-email">
          <div class="cvp-email-head">
            <div><h3>Enviar por e-mail</h3><p>Painel de Vendas — ${escapeHtml(mLabel)}/${year}</p></div>
            <button type="button" class="cvp-email-x" aria-label="Fechar">✕</button>
          </div>
          <div class="cvp-email-body">
            <div class="cvp-email-row">
              <label for="cvp-email-to">Para</label>
              <input id="cvp-email-to" type="text" list="cvp-email-suggest" placeholder="email@empresa.com, outro@empresa.com" autocomplete="off">
            </div>
            <div class="cvp-email-row">
              <label for="cvp-email-cc">Cc</label>
              <input id="cvp-email-cc" type="text" list="cvp-email-suggest" placeholder="opcional" autocomplete="off">
            </div>
            <div class="cvp-email-row">
              <label for="cvp-email-subject">Assunto</label>
              <input id="cvp-email-subject" type="text" value="${escapeHtml(defaultSubject)}">
            </div>
            <div class="cvp-email-attach-wrap">
              <div class="cvp-email-attach">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                <span>${escapeHtml(reportFilename())}</span>
              </div>
            </div>
            <div class="cvp-email-row cvp-email-row-text">
              <textarea id="cvp-email-text" class="cvp-email-text" aria-label="Texto do e-mail">${escapeHtml(defaultBody)}</textarea>
            </div>
            <datalist id="cvp-email-suggest">${suggestOpts}</datalist>
          </div>
          <div class="cvp-email-msg" id="cvp-email-msg"></div>
          <div class="cvp-email-footer">
            <label class="cvp-email-remember"><input type="checkbox" id="cvp-email-remember"${suggestOn ? " checked" : ""}> Lembrar destinatários para próximos envios</label>
            <div class="cvp-email-actions">
              <button type="button" id="cvp-email-cancel">Cancelar</button>
              <button type="button" id="cvp-email-send" class="primary">Enviar</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
      emailEl = backdrop;
      backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeEmailModal(); });
      backdrop.querySelector(".cvp-email-x").addEventListener("click", closeEmailModal);
      backdrop.querySelector("#cvp-email-cancel").addEventListener("click", closeEmailModal);
      setTimeout(() => document.addEventListener("keydown", onEmailKey), 0);

      const toInput = backdrop.querySelector("#cvp-email-to");
      const ccInput = backdrop.querySelector("#cvp-email-cc");
      const subjectInput = backdrop.querySelector("#cvp-email-subject");
      const textInput = backdrop.querySelector("#cvp-email-text");
      const rememberChk = backdrop.querySelector("#cvp-email-remember");
      const msgEl = backdrop.querySelector("#cvp-email-msg");
      const sendBtn = backdrop.querySelector("#cvp-email-send");
      const fields = [toInput, ccInput, subjectInput, textInput];
      toInput.focus();

      rememberChk.addEventListener("change", () => setSuggestEnabled(rememberChk.checked));

      function setMsg(text, kind) {
        msgEl.textContent = text || "";
        msgEl.className = "cvp-email-msg" + (kind ? ` ${kind}` : "");
      }
      function parseEmails(raw) {
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
      }

      async function handleSend() {
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const to = parseEmails(toInput.value);
        const cc = parseEmails(ccInput.value);
        if (!to.length) { showEmailAlert("Informe ao menos um destinatário em Para.", "err"); return; }
        const invalid = to.concat(cc).filter((e) => !EMAIL_RE.test(e));
        if (invalid.length) {
          showEmailAlert(`E-mail inválido: ${invalid.join(", ")}. Separe múltiplos endereços por vírgula (,).`, "err");
          return;
        }
        if (!subjectInput.value.trim()) { showEmailAlert("Informe o assunto.", "err"); return; }

        sendBtn.disabled = true;
        fields.forEach((el) => { el.disabled = true; });
        try {
          setMsg("Montando relatório…", "warn");
          const html = await buildReportHtmlForEmail();
          if (emailEl !== backdrop) return; // fechou durante a montagem
          setMsg("Gerando PDF e enviando e-mail…", "warn");
          await callEdgeFunction("send-report-email", {
            to,
            cc: cc.length ? cc : undefined,
            subject: subjectInput.value.trim(),
            filename: reportFilename(),
            body_text: textInput.value,
            html
          });
          if (emailEl !== backdrop) return;
          if (rememberChk.checked) saveRecipients(to.concat(cc));
          setMsg("", "");
          showEmailAlert("E-mail enviado com sucesso.", "ok", () => { if (emailEl === backdrop) closeEmailModal(); });
        } catch (e) {
          console.error("enviar por e-mail:", e);
          if (emailEl !== backdrop) return;
          setMsg("", "");
          sendBtn.disabled = false;
          fields.forEach((el) => { el.disabled = false; });
          showEmailAlert(e?.message || "Falha ao enviar o e-mail.", "err");
        }
      }

      sendBtn.addEventListener("click", handleSend);
    }

    // ---------------------------------------------------------------- events

    function bind(container) {
      container.querySelector("#cvp-seg")?.addEventListener("click", async (e) => {
        const b = e.target.closest("button[data-p]"); if (!b) return;
        period = b.dataset.p; await reloadAndRender(container);
      });
      container.querySelector("#cvp-scenario")?.addEventListener("change", async (e) => {
        scenarioId = e.target.value || null; scenarioUserSet = true; await reloadAndRender(container);
      });

      const toggleBtn = container.querySelector("#cvp-print-toggle");
      const menu = container.querySelector("#cvp-print-menu");
      // Nao usar `hidden`/`el.hidden` aqui -- a classe `.cvp-print-menu` tem
      // `display` proprio, que sobrescreve o atributo `hidden` (especificidade
      // do seletor de classe vence a regra `[hidden]` do UA stylesheet, mesmo
      // que empatada em pontos, por vir depois na cascata). Visibilidade
      // controlada só pela classe `.open` (display:flex explicito).
      const closeMenu = () => { menu?.classList.remove("open"); toggleBtn?.setAttribute("aria-expanded", "false"); };
      toggleBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!menu) return;
        const willOpen = !menu.classList.contains("open");
        menu.classList.toggle("open", willOpen);
        toggleBtn.setAttribute("aria-expanded", String(willOpen));
      });
      menu?.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-action]"); if (!b) return;
        closeMenu();
        if (b.dataset.action === "print") openOnePagePrint(container);
        else if (b.dataset.action === "email") openEmailModal(container);
        else if (b.dataset.action === "download-excel") downloadReportExcel(container);
      });
      // container.innerHTML e reconstruido a cada render() (troca de periodo/
      // cenario) -- sem remover o listener antigo antes, cada render empilharia
      // um novo listener global no document (vazamento). So 1 por vez.
      if (docMenuClickHandler) document.removeEventListener("click", docMenuClickHandler);
      docMenuClickHandler = closeMenu;
      document.addEventListener("click", docMenuClickHandler);
    }

    // Enquanto o usuario esta "dentro" do relatorio, o mes/ano seguem o
    // seletor de periodo do cabecalho do site (comportamento normal).
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

    let enteredPainel = false;   // reseta toda vez que o usuario SAI do relatorio

    function renderSelectedPainel(container, reportId) {
      if (reportId !== REPORT_ID) { enteredPainel = false; return false; }
      const prevYear = year;
      if (!enteredPainel) {
        // Toda vez que ENTRA no relatorio (nao a cada re-render), reseta pro
        // mes calendario real de hoje + aba "Mes" -- ignora o que estiver no
        // cabecalho do site. O toggle do CABECALHO (state.currentPeriod, usado
        // por DRE/Budget/Dashboard) tem que acompanhar junto -- nunca podem
        // ficar descasados. Depois disso, segue o cabecalho normalmente (ver
        // syncFromHeader) ate o usuario sair e entrar de novo.
        const today = new Date();
        year = today.getFullYear();
        month = today.getMonth() + 1;
        period = "mes";
        enteredPainel = true;
        syncHeaderPeriod?.(year, month);
      } else {
        syncFromHeader();
      }
      if (year !== prevYear) scenarioUserSet = false;
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
