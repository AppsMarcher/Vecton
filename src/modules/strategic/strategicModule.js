(function attachVectonStrategicModule(window) {
  // ==========================================================================
  // A3 - Gestão Estratégica — módulo frontend (Etapa 3, parte 3).
  //
  // Segue o mesmo padrão de rpsModule.js: renderiza direto num root próprio
  // (#strategic-root), com estado interno e injeção de CSS 1x (mesmo padrão
  // de reportsComercialPainelModule.js — variáveis --sa3-* escopadas, não
  // depende dos tokens globais do app pra não quebrar se algo mudar lá).
  //
  // Escopo desta leva (documentado, não escondido):
  //   - Tela 1 (Visão Executiva), Tela 2 (Detalhe do A3 + plano de ação),
  //     Tela 3 (Preenchimento Mensal) — dados 100% reais via RPC.
  //   - SEM pré-visualização de cálculo no frontend — o motor é 100%
  //     autoritativo no banco (migrations 129/130); a tela manda salvar e
  //     mostra o que a RPC devolve.
  //   - SEM editor de composição (entry_mode='breakdown') nesta leva — KPI
  //     desse tipo aparece como somente-leitura com uma nota.
  //   - Anexos: implementado pra ação e item de causas/contramedidas (chip
  //     list + upload direto pro bucket strategic-a3-attachments, migration
  //     133). Anexo em cima do registro mensal do KPI (kpi_record_id) fica
  //     pra uma leva futura — exige garantir que o registro do mês já
  //     existe antes de anexar.
  // ==========================================================================

  const MONTH_LABELS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const STATUS_META = {
    on_target:     { label: "Dentro da meta", tone: "pos" },
    attention:     { label: "Atenção",        tone: "warn" },
    off_target:    { label: "Fora da meta",   tone: "neg" },
    not_available: { label: "Sem dado",       tone: "muted" }
  };

  const ACTION_STATUS_OPTIONS = [
    { value: "not_started", label: "Não iniciada" },
    { value: "in_progress", label: "Em andamento" },
    { value: "on_hold",     label: "Pausada" },
    { value: "done",        label: "Concluída" },
    { value: "cancelled",   label: "Cancelada" }
  ];
  const ACTION_STATUS_TONE = {
    not_started: "muted", in_progress: "warn", on_hold: "pause", done: "pos", cancelled: "cancel"
  };

  // priority é coluna livre (sem CHECK no banco, migration 128) — armazena o
  // rótulo em pt-BR direto, sem tabela de tradução (diferente de status, que
  // TEM CHECK e por isso precisa do código em inglês).
  const ACTION_PRIORITY_OPTIONS = ["Baixa", "Média", "Alta"];

  const ATTACHMENT_BUCKET = "strategic-a3-attachments";
  const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // mesmo limite do bucket (migration 133)

  function formatByUnit(value, unit, decimalPlaces) {
    if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return "—";
    const n = Number(value);
    const dp = Number.isFinite(decimalPlaces) ? decimalPlaces : (unit === "percent" ? 1 : 0);
    if (unit === "percent") {
      return `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: dp, maximumFractionDigits: dp })}%`;
    }
    if (unit === "BRL") {
      return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    const suffix = unit && unit !== "un" ? ` ${unit}` : "";
    return `${n.toLocaleString("pt-BR", { minimumFractionDigits: dp, maximumFractionDigits: dp })}${suffix}`;
  }

  function formatTargetVariation(actual, target) {
    const actualValue = Number(actual);
    const targetValue = Number(target);
    if (!Number.isFinite(actualValue) || !Number.isFinite(targetValue)) return "—";
    if (targetValue === 0) return actualValue === 0 ? "0,0%" : "—";
    const variation = ((actualValue - targetValue) / Math.abs(targetValue)) * 100;
    const sign = variation > 0 ? "+" : "";
    return `${sign}${variation.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  function createStrategicModule(deps) {
    const {
      root,
      getPeriod,
      resolveOrganizationId,
      callSupabaseRpc,
      authenticatedFetch,
      supabaseApiUrl,
      getAllAccessRoles,
      appAlert,
      appConfirm,
      uploadToStorage,
      createStorageSignedUrl,
      deleteFromStorage,
      escapeHtml
    } = deps;

    const state = {
      loading: false,
      error: "",
      screen: "overview",      // "overview" | "detail" | "entry"
      organizationId: null,
      cycleId: null,
      loadedPeriod: null,      // { year, month } do período já carregado na tela atual — usado
                                // pra detectar troca de período no seletor do topo e recarregar
                                // (achado #1 do review: render() não recarregava ao trocar mês/ano).
      overview: null,          // { northGoals, areas }
      a3RootId: null,          // A3 clicado na Tela 1 (sempre uma mãe, filhos não aparecem lá)
      a3Children: [],          // filhos do a3RootId — vira aba "Consolidado + filhos"
      a3Id: null,              // aba ativa da Tela 2 (pode ser o próprio a3RootId ou um filho)
      a3Detail: null,          // { a3, children, kpis } — dados da aba ativa
      monthlyEntry: null,      // { a3, period, kpis }
      actions: [],             // ações do A3 atual (todas, filtro é feito na leitura)
      periodAnalysis: null,    // { id, summary, strategic_analysis_items: [...] } do A3+mês ativo, ou null se nunca salvo
      dirtyDrafts: {},         // { [kpiId]: { resultValue, drivers: {code: value} } } — edição em andamento, não salva
      attachments: { action: {}, analysis_item: {} }, // { [ownerType]: { [ownerId]: strategic_attachments[] } }
      orgUsers: null           // usuários da org (picker de Responsáveis do plano de ação) — carregado 1x, cacheado
    };

    // RBAC granular por A3 (2026-08-29, migrations 142-145): não dá mais
    // pra decidir "pode editar" só olhando o papel da pessoa — depende de
    // QUAL A3 está em tela (Gestor edita só a Gestão dele; A3 Estratégicos
    // só o que foi concedido). O banco já resolve isso corretamente
    // (strategic_can_edit_a3) e devolve o resultado pronto em "canEdit" nas
    // RPCs strategic_get_a3_detail/strategic_get_monthly_entry — canManage()
    // só lê esse campo do estado já carregado da tela ativa, sem duplicar a
    // regra em JS.
    const canManage = () => !!(state.screen === "entry" ? state.monthlyEntry?.canEdit : state.a3Detail?.canEdit);

    const currentPeriod = () => {
      const p = getPeriod ? getPeriod() : { year: 2026, month: 1 };
      return { year: Number(p.year) || 2026, month: Number(p.month) || 1 };
    };

    // ---------------------------------------------------------------- CSS
    function ensureStyle() {
      if (document.getElementById("sa3-style")) return;
      const s = document.createElement("style");
      s.id = "sa3-style";
      s.textContent = `
        .sa3 {
          --sa3-bg:#09090a; --sa3-bg-soft:#0e0e10; --sa3-panel:#121317; --sa3-panel-alt:#0f1013; --sa3-panel-hover:#191b20;
          --sa3-line:#2a2d34; --sa3-line-soft:rgba(255,255,255,.06);
          --sa3-text:#ffffff; --sa3-soft:#a1a7b3; --sa3-faint:#6b7280;
          --sa3-blue:#4f7cff; --sa3-pos:#4ade80; --sa3-neg:#f87171; --sa3-amber:#f59e0b; --sa3-violet:#8b5cf6;
          color:var(--sa3-text); font-family:inherit;
        }
        .sa3 * { box-sizing:border-box; }
        .sa3 button { font-family:inherit; }
        .sa3-card { background:rgba(12,14,18,.9); border:1px solid var(--sa3-line); border-radius:16px; box-shadow:0 18px 48px rgba(0,0,0,.32); padding:18px 20px; margin-bottom:14px; }
        .sa3-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:14px; flex-wrap:wrap; }
        .sa3-head h2, .sa3-head h3 { margin:0; font-size:1rem; font-weight:700; letter-spacing:-.01em; }
        .sa3-head p { margin:4px 0 0; font-size:.78rem; color:var(--sa3-soft); max-width:520px; line-height:1.45; }
        .sa3-btn { border-radius:10px; padding:8px 14px; font-size:.78rem; font-weight:600; cursor:pointer; border:1px solid var(--sa3-line); background:transparent; color:var(--sa3-soft); }
        .sa3-btn:hover { background:rgba(255,255,255,.05); color:var(--sa3-text); }
        .sa3-btn.primary { background:var(--sa3-blue); border-color:var(--sa3-blue); color:#fff; }
        .sa3-btn.primary:hover { background:#3f68e6; }
        .sa3-btn:disabled { opacity:.45; cursor:not-allowed; }
        .sa3-back { display:inline-flex; align-items:center; gap:6px; color:var(--sa3-soft); background:none; border:none; cursor:pointer; font-size:.78rem; margin-bottom:12px; padding:0; }
        .sa3-back:hover { color:var(--sa3-text); }
        .sa3-north-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); gap:10px; }
        .sa3-north-card { padding:12px 13px; border-radius:12px; background:var(--sa3-panel-alt); border:1px solid var(--sa3-line-soft); min-height:70px; }
        .sa3-north-card .l { font-size:.66rem; color:var(--sa3-faint); }
        .sa3-north-card .v { font-size:.84rem; font-weight:800; margin-top:4px; }
        .sa3-area-list { display:flex; flex-direction:column; gap:8px; }
        .sa3-area-row {
          display:grid; grid-template-columns:38px 1fr auto 16px; align-items:center; gap:14px;
          padding:12px 15px; border-radius:12px; background:var(--sa3-panel); border:1px solid var(--sa3-line-soft);
          border-left:3px solid var(--row-accent, var(--sa3-line)); cursor:pointer; width:100%; text-align:left; color:var(--sa3-text);
        }
        .sa3-area-row:hover { background:var(--sa3-panel-hover); }
        .sa3-area-icon { width:32px; height:32px; border-radius:9px; display:grid; place-items:center; font-weight:700; font-size:.72rem; background:rgba(255,255,255,.05); }
        .sa3-area-name { font-size:.82rem; font-weight:700; }
        .sa3-area-sub { font-size:.68rem; color:var(--sa3-faint); margin-top:1px; }
        .sa3-subtabs { display:flex; gap:6px; flex-wrap:wrap; margin-top:12px; }
        .sa3-subtab { border:1px solid var(--sa3-line); background:rgba(255,255,255,.02); color:var(--sa3-soft); padding:6px 12px; border-radius:9px; font-size:.74rem; font-weight:600; cursor:pointer; }
        .sa3-subtab.active { background:rgba(79,124,255,.14); border-color:rgba(79,124,255,.4); color:#8fb0ff; }
        .sa3-objective-text { white-space:pre-wrap; font-size:.82rem; line-height:1.5; color:var(--sa3-text); }
        .sa3-objective-text.hidden { display:none; }
        .sa3-objective-editor.hidden { display:none; }
        .sa3-objective-textarea { width:100%; min-height:220px; resize:vertical; background:rgba(255,255,255,.03); border:1px solid var(--sa3-line); border-radius:10px; color:var(--sa3-text); font:inherit; font-size:.82rem; line-height:1.5; padding:12px 14px; margin-bottom:10px; }
        .sa3-objective-textarea:focus { border-color:rgba(79,124,255,.6); outline:none; }
        .sa3-analysis-list { display:flex; flex-direction:column; gap:8px; margin-bottom:6px; }
        .sa3-analysis-item { padding:10px 12px; border-radius:9px; background:var(--sa3-panel-alt); border:1px solid var(--sa3-line-soft); font-size:.78rem; }
        .sa3-analysis-item-row { display:grid; grid-template-columns:auto 1fr auto; gap:10px; align-items:start; }
        .sa3-analysis-item-row.hidden { display:none; }
        .sa3-analysis-tag { padding:3px 9px; border-radius:999px; font-size:.64rem; font-weight:700; white-space:nowrap; }
        .sa3-analysis-tag.cause { background:rgba(245,158,11,.12); color:var(--sa3-amber); }
        .sa3-analysis-tag.countermeasure { background:rgba(74,222,128,.12); color:var(--sa3-pos); }
        .sa3-analysis-kpis { margin-top:5px; display:flex; gap:5px; flex-wrap:wrap; }
        .sa3-analysis-kpi-chip { font-size:.62rem; color:var(--sa3-faint); background:rgba(255,255,255,.04); border-radius:999px; padding:2px 7px; }
        .sa3-item-actions { display:flex; gap:4px; }
        .sa3-icon-btn { background:none; border:none; color:var(--sa3-faint); cursor:pointer; padding:2px; }
        .sa3-icon-btn:hover { color:var(--sa3-text); }
        .sa3-attachments { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:8px; }
        .sa3-attachment-chip { display:inline-flex; align-items:center; gap:5px; padding:4px 6px 4px 8px; border-radius:999px; background:rgba(255,255,255,.04); border:1px solid var(--sa3-line-soft); font-size:.68rem; color:var(--sa3-soft); cursor:pointer; max-width:220px; }
        .sa3-attachment-chip:hover { border-color:rgba(79,124,255,.4); }
        .sa3-attachment-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .sa3-attachment-remove { background:none; border:none; color:var(--sa3-faint); cursor:pointer; font-size:.9rem; line-height:1; padding:0 0 0 2px; }
        .sa3-attachment-remove:hover { color:var(--sa3-neg); }
        .sa3-attachment-add { display:inline-flex; align-items:center; gap:4px; padding:4px 10px; border-radius:999px; border:1px dashed var(--sa3-line); color:var(--sa3-faint); font-size:.68rem; font-weight:600; cursor:pointer; }
        .sa3-attachment-add:hover { border-color:rgba(79,124,255,.4); color:#8fb0ff; }
        .sa3-kpi-check-list { display:flex; flex-direction:column; gap:4px; max-height:120px; overflow-y:auto; border:1px solid var(--sa3-line); border-radius:8px; padding:8px 10px; }
        .sa3-kpi-check-list label { display:flex; align-items:center; gap:7px; font-size:.76rem; text-transform:none; font-weight:400; color:var(--sa3-soft); }
        .sa3-pill { display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:999px; font-size:.66rem; font-weight:700; white-space:nowrap; }
        .sa3-pill.pos { background:rgba(74,222,128,.12); color:var(--sa3-pos); }
        .sa3-pill.neg { background:rgba(248,113,113,.12); color:var(--sa3-neg); }
        .sa3-pill.warn { background:rgba(245,158,11,.12); color:var(--sa3-amber); }
        .sa3-pill.pause { background:rgba(139,92,246,.12); color:var(--sa3-violet); }
        .sa3-pill.cancel { background:rgba(255,255,255,.05); color:var(--sa3-faint); text-decoration:line-through; }
        .sa3-pill.muted { background:rgba(255,255,255,.05); color:var(--sa3-faint); }
        .sa3-chevron { color:var(--sa3-faint); }
        .sa3-kpi-block-head { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:12px; }
        .sa3-kpi-title { font-size:.9rem; font-weight:700; }
        .sa3-kpi-sub { font-size:.72rem; color:var(--sa3-faint); margin-top:2px; }
        .sa3-combo-chart { margin-top:8px; }
        .sa3-chart-plot { position:relative; height:116px; }
        .sa3-bars { position:absolute; inset:0; display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:6px; padding:0 2px; z-index:1; }
        .sa3-bar-col { position:relative; height:100%; min-width:0; }
        .sa3-bar-real { position:absolute; left:50%; transform:translateX(-50%); width:min(27px,86%); border-radius:5px 5px 1px 1px; background:linear-gradient(180deg,#b6c2d2 0%,#78889d 24%,#374151 100%); box-shadow:0 8px 12px rgba(15,23,42,.24); overflow:hidden; }
        .sa3-bar-real::after { content:""; position:absolute; top:1px; left:1px; right:1px; height:28%; min-height:2px; border-radius:4px 4px 2px 2px; background:linear-gradient(180deg,rgba(255,255,255,.24),rgba(255,255,255,.06)); pointer-events:none; }
        .sa3-bar-real.pos { background:linear-gradient(180deg,#74e89b 0%,#2dcc6b 24%,#0d6b38 100%); box-shadow:0 8px 12px rgba(34,197,94,.20); }
        .sa3-bar-real.neg { background:linear-gradient(180deg,#f58a8a 0%,#ef5050 24%,#8b202b 100%); box-shadow:0 8px 12px rgba(239,68,68,.20); }
        .sa3-chart-zero { position:absolute; left:2px; right:2px; height:1px; background:rgba(255,255,255,.08); z-index:0; }
        .sa3-target-svg { position:absolute; inset:0 2px; width:calc(100% - 4px); height:100%; overflow:visible; pointer-events:none; z-index:2; }
        .sa3-target-line { fill:none; stroke:#4f7cff; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; vector-effect:non-scaling-stroke; filter:drop-shadow(0 2px 4px rgba(79,124,255,.34)); }
        .sa3-target-point { fill:#4f7cff; stroke:#111318; stroke-width:1.5; vector-effect:non-scaling-stroke; }
        .sa3-chart-months { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:6px; padding:6px 2px 0; text-align:center; }
        .sa3-bar-month { font-size:.58rem; color:var(--sa3-faint); text-transform:uppercase; }
        .sa3-chart-legend { display:flex; justify-content:flex-end; align-items:center; gap:12px; margin-top:7px; color:var(--sa3-faint); font-size:.62rem; }
        .sa3-chart-legend span { display:inline-flex; align-items:center; gap:5px; }
        .sa3-legend-bar { width:10px; height:10px; border-radius:2px 2px 0 0; background:linear-gradient(90deg,#22c55e 0 50%,#ef4444 50% 100%); }
        .sa3-legend-line { width:16px; height:0; border-top:2px solid #4f7cff; }
        .sa3-chart-tooltip { position:fixed; z-index:9999; display:none; min-width:138px; padding:9px 11px; border-radius:8px; background:#0c0e12; border:1px solid var(--sa3-line); box-shadow:0 12px 30px rgba(0,0,0,.42); pointer-events:none; }
        .sa3-chart-tooltip-month { padding-bottom:6px; margin-bottom:5px; border-bottom:1px solid var(--sa3-line-soft); color:var(--sa3-text); font-size:.68rem; font-weight:800; text-transform:lowercase; }
        .sa3-chart-tooltip-row { display:flex; align-items:center; justify-content:space-between; gap:14px; color:var(--sa3-soft); font-size:.68rem; line-height:1.55; }
        .sa3-chart-tooltip-row strong { color:var(--sa3-text); font-weight:700; text-align:right; white-space:nowrap; }
        .sa3-action-plan { margin-top:14px; padding-top:12px; border-top:1px solid var(--sa3-line-soft); }
        .sa3-action-item { display:grid; grid-template-columns:1fr 130px 90px 110px 56px; gap:10px; align-items:center; padding:9px 12px; border-radius:9px; background:var(--sa3-panel-alt); border:1px solid var(--sa3-line-soft); font-size:.75rem; margin-bottom:6px; }
        .sa3-action-desc { color:var(--sa3-text); }
        .sa3-action-meta { color:var(--sa3-faint); font-size:.68rem; }
        .sa3-empty { display:flex; align-items:center; gap:8px; padding:12px; border-radius:10px; border:1px dashed var(--sa3-line-soft); color:var(--sa3-faint); font-size:.76rem; }
        .sa3-form { display:flex; flex-direction:column; gap:10px; margin-top:10px; padding:14px; border-radius:12px; border:1px dashed rgba(79,124,255,.35); background:rgba(79,124,255,.035); }
        .sa3-form.hidden { display:none; }
        .sa3-form label { display:block; font-size:.64rem; font-weight:700; text-transform:uppercase; color:var(--sa3-faint); margin-bottom:4px; }
        .sa3-form input, .sa3-form select, .sa3-form textarea { width:100%; background:rgba(255,255,255,.03); border:1px solid var(--sa3-line); border-radius:8px; color:var(--sa3-text); font:inherit; font-size:.78rem; padding:8px 10px; }
        .sa3-form-grid { display:grid; grid-template-columns:1fr 130px 150px; gap:10px; }
        .sa3-form-foot { display:flex; justify-content:flex-end; gap:8px; }
        /* Tela 3 (lançamento mensal) — layout ÚNICO pra 100% dos indicadores,
           qualquer entry_mode: Nome | Meta | Real | 1 botão Salvar, sempre
           nas mesmas 4 colunas, botões sempre alinhados na mesma borda. */
        .sa3-entry-row { display:grid; grid-template-columns:1fr 190px 190px 100px; align-items:start; gap:14px; padding:14px; border-radius:10px; background:var(--sa3-panel); border:1px solid var(--sa3-line-soft); margin-bottom:8px; }
        .sa3-entry-name { font-size:.82rem; font-weight:700; padding-top:22px; }
        .sa3-entry-target { font-size:.68rem; color:var(--sa3-faint); margin-top:2px; }
        .sa3-entry-meta, .sa3-entry-real { display:flex; flex-direction:column; gap:4px; }
        .sa3-entry-meta .k, .sa3-entry-real .k { font-size:.6rem; text-transform:uppercase; letter-spacing:.04em; color:var(--sa3-faint); font-weight:700; }
        .sa3-entry-meta-row { display:flex; gap:4px; }
        .sa3-entry-meta-row input, .sa3-entry-real > input { width:100%; background:rgba(255,255,255,.03); border:1px solid var(--sa3-line); border-radius:8px; color:var(--sa3-text); font:inherit; font-size:.82rem; padding:8px 10px; text-align:right; }
        .sa3-entry-meta-row input:disabled, .sa3-entry-real > input:disabled { opacity:.55; }
        .sa3-entry-row input[type="number"] { -moz-appearance:textfield; }
        .sa3-entry-row input[type="number"]::-webkit-inner-spin-button,
        .sa3-entry-row input[type="number"]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
        .sa3-entry-real .sa3-entry-target { margin-top:0; padding-top:8px; }
        .sa3-entry-driver-row { display:flex; align-items:center; gap:6px; margin-top:2px; }
        .sa3-entry-driver-row label { font-size:.62rem; color:var(--sa3-faint); flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .sa3-entry-driver-row input { width:76px; background:rgba(255,255,255,.03); border:1px solid var(--sa3-line); border-radius:6px; color:var(--sa3-text); font:inherit; font-size:.74rem; padding:5px 6px; text-align:right; }
        .sa3-entry-save { padding-top:22px; display:flex; justify-content:flex-end; }
        /* Painel de composição (entry_mode='breakdown') — full-width, logo
           abaixo da linha compacta (não cabe nos 190px da coluna Real). */
        .sa3-breakdown-panel { padding:10px 14px 14px; margin:-2px 0 8px; border-radius:0 0 10px 10px; background:var(--sa3-panel-alt); border:1px solid var(--sa3-line-soft); border-top:none; }
        .sa3-breakdown-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .sa3-breakdown-head .k { font-size:.6rem; text-transform:uppercase; letter-spacing:.04em; color:var(--sa3-faint); font-weight:700; }
        .sa3-breakdown-rows { display:flex; flex-direction:column; gap:6px; }
        .sa3-breakdown-row { display:grid; grid-template-columns:1fr 120px 120px 100px 26px; gap:8px; align-items:center; }
        .sa3-breakdown-row.no-weight { grid-template-columns:1fr 120px 120px 26px; }
        .sa3-breakdown-row input { width:100%; background:rgba(255,255,255,.03); border:1px solid var(--sa3-line); border-radius:6px; color:var(--sa3-text); font:inherit; font-size:.76rem; padding:6px 8px; }
        .sa3-breakdown-row input[type="number"] { text-align:right; }
        .sa3-badge-auto { display:inline-flex; align-items:center; gap:4px; margin-left:8px; padding:2px 8px; border-radius:999px; background:rgba(79,124,255,.12); color:#8fb0ff; border:1px solid rgba(79,124,255,.28); font-size:.62rem; font-weight:700; vertical-align:middle; }
        .sa3-period-status { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
        .sa3-loading, .sa3-error { padding:40px 20px; text-align:center; color:var(--sa3-faint); font-size:.84rem; }
        .sa3-error { color:var(--sa3-neg); }
      `;
      document.head.append(s);
    }

    // ---------------------------------------------------------------- API
    async function ensureContext() {
      if (!state.organizationId) {
        state.organizationId = await resolveOrganizationId();
      }
      if (!state.cycleId) {
        const { year } = currentPeriod();
        const rows = await fetchRest(
          "strategic_cycles",
          `organization_id=eq.${state.organizationId}&year=eq.${year}&select=id&limit=1`
        );
        state.cycleId = rows[0]?.id || null;
      }
      if (!state.scenarioId && state.cycleId) {
        const rows = await fetchRest(
          "strategic_scenarios",
          `cycle_id=eq.${state.cycleId}&is_current=eq.true&select=id&limit=1`
        );
        state.scenarioId = rows[0]?.id || null;
      }
    }

    // Upsert direto na tabela (RLS já garante can_manage_strategic_a3 —
    // não precisa de RPC pra isso, mesmo padrão de upsertSupabaseRows do
    // resto do Vecton). Sempre manda a linha inteira (não é update
    // parcial), então não cai no gotcha de upsert documentado no projeto.
    async function saveKpiTarget(kpiId, payload) {
      const body = {
        kpi_id: kpiId,
        scenario_id: state.scenarioId,
        year: payload.year,
        month: payload.month,
        target_value: payload.target_value ?? null,
        target_min: payload.target_min ?? null,
        target_max: payload.target_max ?? null,
        tolerance: payload.tolerance ?? null
      };
      const response = await authenticatedFetch(
        `${supabaseApiUrl}/rest/v1/strategic_kpi_targets?on_conflict=kpi_id,scenario_id,year,month`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
          body: JSON.stringify(body)
        }
      );
      if (!response.ok) throw new Error(await response.text());
    }

    async function fetchRest(table, query) {
      const response = await authenticatedFetch(`${supabaseApiUrl}/rest/v1/${table}?${query}`);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    }

    async function loadOverview() {
      state.loading = true; state.error = ""; renderShell();
      try {
        await ensureContext();
        const period = currentPeriod();
        state.loadedPeriod = period;
        state.overview = await callSupabaseRpc("strategic_get_overview", {
          p_organization_id: state.organizationId, p_year: period.year, p_month: period.month
        });
      } catch (err) {
        state.error = friendlyError(err);
      } finally {
        state.loading = false; renderShell();
      }
    }

    // isRoot=true quando vem da Tela 1 (sempre uma A3 mãe) — reseta as abas.
    // isRoot=false é clique numa aba (Consolidado/filho) dentro da própria
    // Tela 2, OU recarga por troca de período mantendo a aba ativa — mantém
    // as abas já carregadas, só troca o KPI exibido.
    async function loadA3Detail(a3Id, isRoot = true) {
      state.loading = true; state.error = ""; state.a3Id = a3Id; state.screen = "detail";
      if (isRoot) { state.a3RootId = a3Id; state.a3Children = []; }
      renderShell();
      try {
        await ensureContext();
        const period = currentPeriod();
        state.loadedPeriod = period;
        state.a3Detail = await callSupabaseRpc("strategic_get_a3_detail", {
          p_organization_id: state.organizationId, p_a3_id: a3Id, p_year: period.year, p_month: period.month
        });
        if (isRoot) state.a3Children = state.a3Detail?.children || [];
        await loadActionsForA3(a3Id);
        await loadPeriodAnalysis(a3Id, period.year, period.month);
        await loadAttachments();
        await ensureOrgUsers();
      } catch (err) {
        state.error = friendlyError(err);
      } finally {
        state.loading = false; renderShell();
      }
    }

    async function loadMonthlyEntry(a3Id) {
      state.loading = true; state.error = ""; state.a3Id = a3Id; state.screen = "entry"; renderShell();
      try {
        await ensureContext();
        const period = currentPeriod();
        state.loadedPeriod = period;
        state.monthlyEntry = await callSupabaseRpc("strategic_get_monthly_entry", {
          p_organization_id: state.organizationId, p_a3_id: a3Id, p_year: period.year, p_month: period.month
        });
        state.dirtyDrafts = {};
      } catch (err) {
        state.error = friendlyError(err);
      } finally {
        state.loading = false; renderShell();
      }
    }

    async function loadActionsForA3(a3Id) {
      const kpiIds = (state.a3Detail?.kpis || []).map((k) => k.id);
      if (!kpiIds.length) { state.actions = []; return; }
      const rows = await fetchRest(
        "strategic_actions",
        `organization_id=eq.${state.organizationId}&select=*,strategic_action_kpis(kpi_id),strategic_action_a3(a3_id),strategic_action_owners(user_id)&order=due_date.asc.nullslast`
      );
      state.actions = (rows || []).filter((a) =>
        (a.strategic_action_a3 || []).some((l) => l.a3_id === a3Id) ||
        (a.strategic_action_kpis || []).some((l) => kpiIds.includes(l.kpi_id))
      );
    }

    // Lista de usuários da org pro picker de Responsáveis do plano de ação.
    // Carregada uma vez só (RLS de user_profiles já libera SELECT pra
    // qualquer membro da org, não só admin — 117_user_profiles_is_active.sql)
    // e cacheada em state.orgUsers pro resto da sessão do módulo.
    async function ensureOrgUsers() {
      if (state.orgUsers) return;
      try {
        state.orgUsers = await fetchRest(
          "user_profiles",
          `organization_id=eq.${state.organizationId}&is_active=eq.true&select=user_id,full_name,email&order=full_name.asc`
        );
      } catch (_) {
        state.orgUsers = []; // não trava o módulo — Responsáveis só fica sem opções
      }
    }

    function ownerNameById(userId) {
      const u = (state.orgUsers || []).find((x) => x.user_id === userId);
      return u ? (u.full_name || u.email || "Usuário") : null;
    }

    // Anexos de todas as ações + itens de análise já carregados na tela,
    // numa tacada só por dono (2 requests no total, não 1 por item/ação).
    // kpi_record_id fica pra uma leva futura (exige garantir que o registro
    // do mês já existe antes de anexar).
    async function loadAttachments() {
      const actionIds = (state.actions || []).map((a) => a.id);
      const itemIds = (state.periodAnalysis?.strategic_analysis_items || []).map((it) => it.id);
      const byAction = {};
      const byItem = {};
      if (actionIds.length) {
        const rows = await fetchRest(
          "strategic_attachments",
          `action_id=in.(${actionIds.join(",")})&select=*&order=created_at.asc`
        );
        (rows || []).forEach((r) => { (byAction[r.action_id] ||= []).push(r); });
      }
      if (itemIds.length) {
        const rows = await fetchRest(
          "strategic_attachments",
          `analysis_item_id=in.(${itemIds.join(",")})&select=*&order=created_at.asc`
        );
        (rows || []).forEach((r) => { (byItem[r.analysis_item_id] ||= []).push(r); });
      }
      state.attachments = { action: byAction, analysis_item: byItem };
    }

    // Leitura simples (SELECT direto, RLS já protege) — mesma decisão de
    // não criar RPC só pra listar. Embed do PostgREST traz os itens e os
    // KPIs vinculados de cada item numa chamada só.
    async function loadPeriodAnalysis(a3Id, year, month) {
      const rows = await fetchRest(
        "strategic_period_analyses",
        `a3_id=eq.${a3Id}&year=eq.${year}&month=eq.${month}&select=id,summary,strategic_analysis_items(id,item_type,description,impact_level,display_order,strategic_analysis_item_kpis(kpi_id))`
      );
      state.periodAnalysis = rows?.[0] || null;
    }

    // Reenvia a lista INTEIRA de itens (contrato de strategic_save_period_analysis
    // é "lista completa da tela" — item que não vier é removido). patch()
    // recebe a lista atual e devolve a lista já com a alteração aplicada.
    async function saveAnalysis(a3Id, summary, patch) {
      const currentItems = (state.periodAnalysis?.strategic_analysis_items || []).map((it) => ({
        id: it.id,
        item_type: it.item_type,
        description: it.description,
        impact_level: it.impact_level,
        display_order: it.display_order,
        kpi_ids: (it.strategic_analysis_item_kpis || []).map((l) => l.kpi_id)
      }));
      const items = patch(currentItems);
      const { year, month } = currentPeriod();
      await callSupabaseRpc("strategic_save_period_analysis", {
        p_a3_id: a3Id, p_year: year, p_month: month,
        p_summary: summary !== undefined ? summary : (state.periodAnalysis?.summary ?? null),
        p_items: items
      });
      await loadPeriodAnalysis(a3Id, year, month);
    }

    function friendlyError(err) {
      const msg = String(err?.message || err || "Erro desconhecido");
      try {
        const parsed = JSON.parse(msg);
        return parsed.message || parsed.error || msg;
      } catch (_) {
        return msg;
      }
    }

    // ---------------------------------------------------------------- render: shell
    function renderShell() {
      if (!root) return;
      ensureStyle();
      root.className = "sa3";

      if (state.loading && !state.overview && state.screen === "overview") {
        root.innerHTML = `<div class="sa3-loading">Carregando…</div>`;
        return;
      }
      if (state.error) {
        root.innerHTML = `<div class="sa3-error">${escapeHtml(state.error)}</div><button class="sa3-btn" data-action="retry">Tentar de novo</button>`;
        bindGlobal();
        return;
      }

      if (state.screen === "overview") renderOverviewScreen();
      else if (state.screen === "detail") renderDetailScreen();
      else if (state.screen === "entry") renderEntryScreen();
    }

    function bindGlobal() {
      root.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
        state.error = "";
        if (state.screen === "overview") loadOverview();
        else if (state.screen === "detail") loadA3Detail(state.a3Id);
        else loadMonthlyEntry(state.a3Id);
      });
    }

    // ---------------------------------------------------------------- render: Tela 1
    function renderOverviewScreen() {
      const north = state.overview?.northGoals || [];
      const areas = state.overview?.areas || [];

      const northHtml = north.map((g) => `
        <div class="sa3-north-card">
          <div class="l">${escapeHtml(g.title)}</div>
          <div class="v">${escapeHtml(g.targetLabel || "—")}</div>
        </div>
      `).join("");

      const areaRows = areas.map((a) => {
        const total = a.totalKpis || 0;
        const onTarget = a.onTargetCount || 0;
        const ratio = total ? onTarget / total : null;
        const pillTone = ratio === null ? "muted" : ratio === 1 ? "pos" : "neg";
        return `
          <button class="sa3-area-row" style="--row-accent:${escapeHtml(a.color || "#4f7cff")}" data-action="open-detail" data-a3-id="${escapeHtml(a.id)}">
            <div class="sa3-area-icon" style="color:${escapeHtml(a.color || "#4f7cff")}">${escapeHtml((a.name || "?").slice(0, 1))}</div>
            <div>
              <div class="sa3-area-name">A3 ${escapeHtml(a.name)}</div>
              <div class="sa3-area-sub">${total} indicador${total === 1 ? "" : "es"}${a.childrenCount ? ` &middot; ${a.childrenCount} A3 filho${a.childrenCount === 1 ? "" : "s"}` : ""}</div>
            </div>
            <span class="sa3-pill ${pillTone}">${onTarget}/${total} dentro da meta</span>
            <svg class="sa3-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 6l6 6-6 6"/></svg>
          </button>
        `;
      }).join("");

      root.innerHTML = `
        <div class="sa3-card">
          <div class="sa3-head"><div><h2>Norte Verdadeiro</h2><p>Metas anuais do ciclo — o tracking mensal fica dentro de cada área.</p></div></div>
          <div class="sa3-north-grid">${northHtml || '<div class="sa3-empty">Nenhuma meta cadastrada.</div>'}</div>
        </div>
        <div class="sa3-card">
          <div class="sa3-head"><div><h3>Áreas</h3><p>Abrir uma área leva ao A3 digital dela: metas x realizado, acumulado e plano de&nbsp;ação.</p></div></div>
          <div class="sa3-area-list">${areaRows || '<div class="sa3-empty">Nenhuma área cadastrada pra este ciclo.</div>'}</div>
        </div>
      `;

      root.querySelectorAll('[data-action="open-detail"]').forEach((btn) => {
        btn.addEventListener("click", () => loadA3Detail(btn.dataset.a3Id));
      });
    }

    // ---------------------------------------------------------------- render: Tela 2
    function renderDetailScreen() {
      const a3 = state.a3Detail?.a3;
      const kpis = state.a3Detail?.kpis || [];
      if (!a3) { root.innerHTML = `<div class="sa3-error">Área não encontrada.</div>`; return; }

      const kpiBlocks = kpis.map((k) => renderKpiBlock(k)).join("");

      const hasChildren = state.a3Children.length > 0;
      const tabsHtml = hasChildren ? `
        <div class="sa3-subtabs">
          <button class="sa3-subtab ${state.a3Id === state.a3RootId ? "active" : ""}" data-action="switch-tab" data-a3-id="${escapeHtml(state.a3RootId)}">Consolidado</button>
          ${state.a3Children.map((c) => `
            <button class="sa3-subtab ${state.a3Id === c.id ? "active" : ""}" data-action="switch-tab" data-a3-id="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>
          `).join("")}
        </div>
      ` : "";

      const hasObjective = !!(a3.objective && a3.objective.trim());

      root.innerHTML = `
        <button class="sa3-back" data-action="back-overview"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 6l-6 6 6 6"/></svg>Voltar</button>
        <div class="sa3-card">
          <div class="sa3-head">
            <div><h2 style="color:${escapeHtml(a3.color || "#4f7cff")}">${escapeHtml(a3.name)}</h2><p>${kpis.length} indicador${kpis.length === 1 ? "" : "es"}</p></div>
            <button class="sa3-btn primary" data-action="open-entry">Preenchimento mensal</button>
          </div>
          ${tabsHtml}
          <div style="margin-top:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <label style="font-size:.64rem;font-weight:700;text-transform:uppercase;color:var(--sa3-faint)">Objetivo estratégico</label>
              <button type="button" class="sa3-icon-btn" data-action="toggle-objective-edit" title="Editar">${ICON_EDIT}</button>
            </div>
            <p class="sa3-objective-text" data-objective-display>${hasObjective ? escapeHtml(a3.objective) : '<span style="color:var(--sa3-faint)">Objetivo estratégico ainda não cadastrado.</span>'}</p>
            <div class="sa3-objective-editor hidden" data-objective-form>
              <textarea class="sa3-objective-textarea" data-field="objective-text" placeholder="Objetivo estratégico deste A3...">${escapeHtml(a3.objective || "")}</textarea>
              <div class="sa3-form-foot">
                <button class="sa3-btn" data-action="cancel-objective-edit">Cancelar</button>
                <button class="sa3-btn primary" data-action="save-objective">Salvar objetivo</button>
              </div>
            </div>
          </div>
        </div>
        ${kpiBlocks}
      `;

      root.querySelector('[data-action="back-overview"]')?.addEventListener("click", () => {
        state.screen = "overview"; renderShell();
      });
      root.querySelector('[data-action="open-entry"]')?.addEventListener("click", () => loadMonthlyEntry(state.a3Id));
      root.querySelectorAll('[data-action="switch-tab"]').forEach((btn) => {
        btn.addEventListener("click", () => loadA3Detail(btn.dataset.a3Id, false));
      });

      // Edição in-place: o texto SOME e vira o textarea no lugar dele (nunca
      // os dois juntos). Ícone de editar igual ao de causas/contramedidas e
      // plano de ação (padrão único no módulo); Cancelar/Salvar ficam no
      // rodapé do editor, mesmo formato das outras mini-formas do módulo.
      const objectiveDisplay = root.querySelector('[data-objective-display]');
      const objectiveForm = root.querySelector('[data-objective-form]');
      const objectiveTextarea = root.querySelector('[data-field="objective-text"]');

      const setObjectiveEditing = (editing) => {
        objectiveDisplay?.classList.toggle("hidden", editing);
        objectiveForm?.classList.toggle("hidden", !editing);
        if (editing) {
          objectiveTextarea.value = a3.objective || "";
          objectiveTextarea.focus();
          objectiveTextarea.setSelectionRange(objectiveTextarea.value.length, objectiveTextarea.value.length);
        }
      };
      root.querySelector('[data-action="toggle-objective-edit"]')?.addEventListener("click", () => setObjectiveEditing(true));
      root.querySelector('[data-action="cancel-objective-edit"]')?.addEventListener("click", () => setObjectiveEditing(false));
      root.querySelector('[data-action="save-objective"]')?.addEventListener("click", async (e) => {
        if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
        const btn = e.currentTarget;
        const value = objectiveTextarea.value.trim();
        btn.disabled = true;
        try {
          const response = await authenticatedFetch(`${supabaseApiUrl}/rest/v1/strategic_a3?id=eq.${state.a3Id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "Prefer": "return=minimal" },
            body: JSON.stringify({ objective: value || null })
          });
          if (!response.ok) throw new Error(await response.text());
          if (state.a3Detail?.a3) state.a3Detail.a3.objective = value || null;
          renderShell();
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          btn.disabled = false;
        }
      });

      kpis.forEach((k) => { bindActionForm(k.id); bindKpiAnalysisForm(k.id); });
      bindKpiChartTooltips();
      bindAnalysisRemoveButtons();
      bindActionItemButtons();
      bindAttachmentWidgets();
    }

    // -------------------------------------------------------- Causas/contramedidas por KPI
    // Fica logo abaixo do gráfico de CADA indicador (não num card único no
    // topo da página) — usuário pediu explicitamente pra ficar junto do
    // gráfico a que se refere. O dado continua no mesmo lugar do banco
    // (strategic_analysis_items ligado ao A3+mês via strategic_period_
    // analyses), só a exibição é agrupada por KPI usando o vínculo N:N
    // (strategic_analysis_item_kpis) — um item pode em tese aparecer sob
    // mais de 1 KPI se for linkado a vários, mas o formulário daqui só
    // cria vínculo com o KPI de onde foi aberto.
    // Ícones compactos reaproveitados em causas/contramedidas e plano de ação.
    const ICON_EDIT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
    const ICON_TRASH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>`;

    // Cada item tem sua própria mini-forma de edição escondida (não reaproveita
    // a forma de "novo item" — evita ter que rastrear "criando vs editando"
    // no mesmo form compartilhado por todos os itens do KPI).
    function renderAnalysisItem(it) {
      return `
        <div class="sa3-analysis-item" data-analysis-item-id="${escapeHtml(it.id)}">
          <div class="sa3-analysis-item-row" data-item-view>
            <span class="sa3-analysis-tag ${it.item_type}">${it.item_type === "cause" ? "Causa" : "Contramedida"}</span>
            <div>${escapeHtml(it.description)}</div>
            <div class="sa3-item-actions">
              <button type="button" class="sa3-icon-btn" data-action="edit-analysis-item" data-item-id="${escapeHtml(it.id)}" title="Editar">${ICON_EDIT}</button>
              <button type="button" class="sa3-icon-btn" data-action="remove-analysis-item" data-item-id="${escapeHtml(it.id)}" title="Excluir">${ICON_TRASH}</button>
            </div>
            <div style="grid-column:1/-1">${renderAttachmentsStrip("analysis_item", it.id, it.description)}</div>
          </div>
          <div class="sa3-form hidden" data-item-edit-form="${escapeHtml(it.id)}">
            <div class="sa3-form-grid" style="grid-template-columns:150px 1fr">
              <div><label>Tipo</label><select data-field="item_type">
                <option value="cause" ${it.item_type === "cause" ? "selected" : ""}>Causa</option>
                <option value="countermeasure" ${it.item_type === "countermeasure" ? "selected" : ""}>Contramedida</option>
              </select></div>
              <div><label>Descrição</label><input type="text" data-field="description" value="${escapeHtml(it.description)}"></div>
            </div>
            <div class="sa3-form-foot">
              <button class="sa3-btn" data-action="cancel-item-edit" data-item-id="${escapeHtml(it.id)}">Cancelar</button>
              <button class="sa3-btn primary" data-action="save-item-edit" data-item-id="${escapeHtml(it.id)}">Salvar</button>
            </div>
          </div>
        </div>
      `;
    }

    function renderKpiAnalysisSection(k) {
      const items = (state.periodAnalysis?.strategic_analysis_items || [])
        .filter((it) => (it.strategic_analysis_item_kpis || []).some((l) => l.kpi_id === k.id))
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

      const itemsHtml = items.length ? items.map((it) => renderAnalysisItem(it)).join("") : `<div class="sa3-empty">Nenhuma causa ou contramedida registrada.</div>`;

      return `
        <div class="sa3-action-plan">
          <div class="sa3-head" style="margin-bottom:8px">
            <h3 style="font-size:.76rem;text-transform:uppercase;color:var(--sa3-soft)">Causas e contramedidas</h3>
            <button class="sa3-btn" data-action="toggle-analysis-form" data-kpi-id="${escapeHtml(k.id)}">+ Novo item</button>
          </div>
          ${itemsHtml}
          <div class="sa3-form hidden" data-analysis-form="${escapeHtml(k.id)}">
            <div class="sa3-form-grid" style="grid-template-columns:150px 1fr">
              <div><label>Tipo</label><select data-field="item_type"><option value="cause">Causa</option><option value="countermeasure">Contramedida</option></select></div>
              <div><label>Descrição</label><input type="text" data-field="description" placeholder="O que aconteceu / o que fazer?"></div>
            </div>
            <div>
              <label>Anexo (opcional)</label>
              <div class="vecton-file-field">
                <span class="vecton-file-trigger">
                  <span class="vecton-file-btn">Selecionar arquivo</span>
                  <span class="vecton-file-name" data-file-name>Nenhum arquivo selecionado</span>
                </span>
                <input type="file" data-field="attachment" class="vecton-file-native">
              </div>
            </div>
            <div class="sa3-form-foot">
              <button class="sa3-btn" data-action="cancel-analysis-form" data-kpi-id="${escapeHtml(k.id)}">Cancelar</button>
              <button class="sa3-btn primary" data-action="add-analysis-item" data-kpi-id="${escapeHtml(k.id)}">Adicionar</button>
            </div>
          </div>
        </div>
      `;
    }

    function bindKpiAnalysisForm(kpiId) {
      const toggleBtn = root.querySelector(`[data-action="toggle-analysis-form"][data-kpi-id="${cssEscape(kpiId)}"]`);
      const form = root.querySelector(`[data-analysis-form="${cssEscape(kpiId)}"]`);
      const cancelBtn = root.querySelector(`[data-action="cancel-analysis-form"][data-kpi-id="${cssEscape(kpiId)}"]`);
      const addBtn = root.querySelector(`[data-action="add-analysis-item"][data-kpi-id="${cssEscape(kpiId)}"]`);

      toggleBtn?.addEventListener("click", () => form?.classList.toggle("hidden"));
      cancelBtn?.addEventListener("click", () => form?.classList.add("hidden"));
      bindFileNameDisplay(form);
      addBtn?.addEventListener("click", async () => {
        if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
        const itemType = form.querySelector('[data-field="item_type"]').value;
        const description = form.querySelector('[data-field="description"]').value.trim();
        if (!description) { appAlert?.("Descreva a causa ou contramedida antes de salvar.", "warn"); return; }
        const file = form.querySelector('[data-field="attachment"]')?.files?.[0] || null;
        if (file && file.size > MAX_ATTACHMENT_BYTES) { appAlert?.(`O arquivo "${file.name}" ultrapassa o limite de 20 MB.`, "warn"); return; }
        addBtn.disabled = true;
        try {
          await saveAnalysis(state.a3Id, undefined, (items) => [
            ...items,
            { item_type: itemType, description, display_order: items.length, kpi_ids: [kpiId] }
          ]);
          if (file) {
            // Novo item é sempre o de maior display_order (acabou de ser
            // anexado no fim da lista) — não tem outro jeito de saber o id
            // dele, a RPC de análise devolve só a linha-pai (período).
            const newItem = (state.periodAnalysis?.strategic_analysis_items || [])
              .slice()
              .sort((a, b) => (b.display_order || 0) - (a.display_order || 0))[0];
            if (newItem?.id) {
              await uploadAttachment("analysis_item", newItem.id, file);
              await loadAttachments();
            }
          }
          renderShell();
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          addBtn.disabled = false;
        }
      });
    }

    function bindAnalysisRemoveButtons() {
      root.querySelectorAll('[data-action="remove-analysis-item"]').forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
          const ok = await appConfirm?.("Remover este item da análise? Os anexos dele também são removidos.", "warn");
          if (!ok) return;
          const itemId = btn.dataset.itemId;
          // Guarda a lista ANTES de mandar a RPC — depois do save, o item já
          // some de state.periodAnalysis e o anexo dele fica inalcançável
          // (achado #6 do review: exclusão em cascata apagava só o metadado
          // no banco, o arquivo físico ficava órfão no bucket pra sempre).
          const orphanedAttachments = state.attachments?.analysis_item?.[itemId] || [];
          try {
            await saveAnalysis(state.a3Id, undefined, (items) => items.filter((it) => it.id !== itemId));
            await Promise.all(orphanedAttachments.map((att) =>
              deleteFromStorage(ATTACHMENT_BUCKET, att.storage_path).catch(() => {})
            ));
            renderShell();
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
          }
        });
      });

      root.querySelectorAll('[data-action="edit-analysis-item"]').forEach((btn) => {
        btn.addEventListener("click", () => {
          const wrap = root.querySelector(`[data-analysis-item-id="${cssEscape(btn.dataset.itemId)}"]`);
          wrap?.querySelector("[data-item-view]")?.classList.add("hidden");
          wrap?.querySelector(`[data-item-edit-form="${cssEscape(btn.dataset.itemId)}"]`)?.classList.remove("hidden");
        });
      });

      root.querySelectorAll('[data-action="cancel-item-edit"]').forEach((btn) => {
        btn.addEventListener("click", () => {
          const wrap = root.querySelector(`[data-analysis-item-id="${cssEscape(btn.dataset.itemId)}"]`);
          wrap?.querySelector(`[data-item-edit-form="${cssEscape(btn.dataset.itemId)}"]`)?.classList.add("hidden");
          wrap?.querySelector("[data-item-view]")?.classList.remove("hidden");
        });
      });

      root.querySelectorAll('[data-action="save-item-edit"]').forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
          const itemId = btn.dataset.itemId;
          const form = root.querySelector(`[data-item-edit-form="${cssEscape(itemId)}"]`);
          const itemType = form.querySelector('[data-field="item_type"]').value;
          const description = form.querySelector('[data-field="description"]').value.trim();
          if (!description) { appAlert?.("Descreva a causa ou contramedida antes de salvar.", "warn"); return; }
          btn.disabled = true;
          try {
            await saveAnalysis(state.a3Id, undefined, (items) => items.map((it) =>
              it.id === itemId ? { ...it, item_type: itemType, description } : it
            ));
            renderShell();
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
            btn.disabled = false;
          }
        });
      });
    }

    function renderKpiBlock(k) {
      const monthly = k.monthlyValues || [];
      const targets = k.monthlyTargets || [];
      const values = [
        ...monthly.map((m) => m?.value),
        ...targets.map((t) => t?.value)
      ].filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number);
      const rawMin = Math.min(0, ...values);
      const rawMax = Math.max(0, ...values);
      const rawSpan = rawMax - rawMin || Math.max(Math.abs(rawMax), Math.abs(rawMin), 1);
      const chartMin = rawMin < 0 ? rawMin - rawSpan * 0.08 : 0;
      const chartMax = rawMax > 0 ? rawMax + rawSpan * 0.08 : rawSpan;
      const chartSpan = chartMax - chartMin || 1;
      const yPct = (value) => ((chartMax - Number(value)) / chartSpan) * 100;
      const zeroY = yPct(0);

      const bars = Array.from({ length: 12 }, (_, i) => {
        const m = monthly[i] || {};
        const tVal = targets[i]?.value;
        const hasReal = m.value !== null && m.value !== undefined && Number.isFinite(Number(m.value));
        const hasTarget = tVal !== null && tVal !== undefined && Number.isFinite(Number(tVal));
        const realY = hasReal ? yPct(m.value) : zeroY;
        let realTop = Math.min(realY, zeroY);
        let realH = Math.abs(realY - zeroY);
        if (hasReal && realH < 1.7) {
          realH = 1.7;
          realTop = Number(m.value) < 0 ? Math.min(98.3, zeroY) : Math.max(0, zeroY - realH);
        }
        let tone = "";
        if (hasReal && hasTarget) {
          const hit = k.comparisonMode === "lower" ? m.value <= tVal : m.value >= tVal;
          tone = hit ? "pos" : "neg";
        }
        const variation = formatTargetVariation(m.value, tVal);
        const tooltip = `${MONTH_LABELS_SHORT[i]} — Realizado: ${formatByUnit(m.value, k.unit, k.decimalPlaces)} · Meta: ${formatByUnit(tVal, k.unit, k.decimalPlaces)} · Var: ${variation}`;
        return `
          <div class="sa3-bar-col" data-chart-has-real="${hasReal}" data-chart-month="${MONTH_LABELS_SHORT[i].toLowerCase()}" data-chart-real="${escapeHtml(formatByUnit(m.value, k.unit, k.decimalPlaces))}" data-chart-meta="${escapeHtml(formatByUnit(tVal, k.unit, k.decimalPlaces))}" data-chart-variation="${escapeHtml(variation)}">
            ${hasReal ? `<div class="sa3-bar-real ${tone}" style="top:${realTop}%;height:${realH}%" aria-label="${escapeHtml(tooltip)}"></div>` : ""}
          </div>
        `;
      }).join("");

      const lineSegments = [];
      let currentSegment = [];
      const targetDots = [];
      for (let i = 0; i < 12; i += 1) {
        const targetValue = targets[i]?.value;
        const actualValue = monthly[i]?.value;
        const hasActual = actualValue !== null && actualValue !== undefined && Number.isFinite(Number(actualValue));
        if (!hasActual || targetValue === null || targetValue === undefined || !Number.isFinite(Number(targetValue))) {
          if (currentSegment.length) lineSegments.push(currentSegment);
          currentSegment = [];
          continue;
        }
        const point = { x: ((i + 0.5) / 12) * 1200, y: yPct(targetValue) };
        currentSegment.push(point);
        targetDots.push(`<circle class="sa3-target-point" cx="${point.x}" cy="${point.y}" r="3"></circle>`);
      }
      if (currentSegment.length) lineSegments.push(currentSegment);
      const smoothPath = (points) => {
        if (points.length < 2) return "";
        let path = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i += 1) {
          const previous = points[i - 1];
          const current = points[i];
          const controlX = (previous.x + current.x) / 2;
          path += ` C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
        }
        return path;
      };
      const targetLine = lineSegments.map((points) => {
        const path = smoothPath(points);
        return path ? `<path class="sa3-target-line" d="${path}"></path>` : "";
      }).join("");
      const months = MONTH_LABELS_SHORT.map((label) => `<span class="sa3-bar-month">${label}</span>`).join("");

      const kpiActions = state.actions.filter((a) => (a.strategic_action_kpis || []).some((l) => l.kpi_id === k.id));
      const actionsHtml = kpiActions.length
        ? kpiActions.map((a) => renderActionItem(a)).join("")
        : `<div class="sa3-empty">Nenhuma ação registrada.</div>`;

      const isAuto = k.entryMode === "computed";

      return `
        <div class="sa3-card">
          <div class="sa3-kpi-block-head">
            <div>
              <div class="sa3-kpi-title">${escapeHtml(k.name)}${isAuto ? '<span class="sa3-badge-auto">Auto</span>' : ""}</div>
              <div class="sa3-kpi-sub">Realizado vs. meta mensal</div>
            </div>
          </div>
          <div class="sa3-combo-chart" role="img" aria-label="Gráfico combinado de realizado mensal em colunas e meta mensal em linha">
            <div class="sa3-chart-plot">
              <div class="sa3-chart-zero" style="top:${zeroY}%"></div>
              <div class="sa3-bars">${bars}</div>
              <svg class="sa3-target-svg" viewBox="0 0 1200 100" preserveAspectRatio="none" aria-hidden="true">
                ${targetLine}${targetDots.join("")}
              </svg>
            </div>
            <div class="sa3-chart-months">${months}</div>
            <div class="sa3-chart-legend" aria-hidden="true">
              <span><i class="sa3-legend-bar"></i>Realizado</span>
              <span><i class="sa3-legend-line"></i>Meta mensal</span>
            </div>
          </div>
          ${renderKpiAnalysisSection(k)}
          <div class="sa3-action-plan">
            <div class="sa3-head" style="margin-bottom:8px">
              <h3 style="font-size:.76rem;text-transform:uppercase;color:var(--sa3-soft)">Plano de ação</h3>
              <button class="sa3-btn" data-action="toggle-action-form" data-kpi-id="${escapeHtml(k.id)}">+ Nova ação</button>
            </div>
            ${actionsHtml}
            ${renderActionForm(k.id)}
          </div>
        </div>
      `;
    }

    function bindKpiChartTooltips() {
      const columns = root.querySelectorAll('.sa3-bar-col[data-chart-has-real="true"]');
      if (!columns.length) return;

      const tooltip = document.createElement("div");
      tooltip.className = "sa3-chart-tooltip";
      root.appendChild(tooltip);

      const positionTooltip = (event) => {
        const gap = 12;
        let left = event.clientX + gap;
        let top = event.clientY - tooltip.offsetHeight - gap;
        if (left + tooltip.offsetWidth > window.innerWidth - 8) left = event.clientX - tooltip.offsetWidth - gap;
        if (top < 8) top = event.clientY + gap;
        tooltip.style.left = `${Math.max(8, left)}px`;
        tooltip.style.top = `${Math.max(8, top)}px`;
      };

      columns.forEach((column) => {
        column.addEventListener("mouseenter", (event) => {
          tooltip.innerHTML = `
            <div class="sa3-chart-tooltip-month">${escapeHtml(column.dataset.chartMonth)}</div>
            <div class="sa3-chart-tooltip-row"><span>real</span><strong>${escapeHtml(column.dataset.chartReal)}</strong></div>
            <div class="sa3-chart-tooltip-row"><span>meta</span><strong>${escapeHtml(column.dataset.chartMeta)}</strong></div>
            <div class="sa3-chart-tooltip-row"><span>var</span><strong>${escapeHtml(column.dataset.chartVariation)}</strong></div>
          `;
          tooltip.style.display = "block";
          positionTooltip(event);
        });
        column.addEventListener("mousemove", positionTooltip);
        column.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
      });
    }

    // -------------------------------------------------------- Anexos
    // Mesmo widget pra ação e item de análise (strategic_attachments só
    // aceita exatamente 1 dono — kpi_record_id fica pra depois). Upload
    // dispara na hora, sem botão "enviar" separado (1 arquivo por vez).
    function truncateFileName(name, max = 22) {
      const s = String(name || "arquivo");
      return s.length > max ? `${s.slice(0, max - 1)}…` : s;
    }

    // Atualiza o nome exibido no campo de anexo dos formulários de criação
    // (o input nativo fica invisível — ver .vecton-file-native no styles.css).
    function bindFileNameDisplay(formEl) {
      const input = formEl?.querySelector('[data-field="attachment"]');
      input?.addEventListener("change", () => {
        const nameEl = input.closest(".vecton-file-field")?.querySelector("[data-file-name]");
        if (nameEl) nameEl.textContent = input.files?.[0]?.name || "Nenhum arquivo selecionado";
      });
    }

    // Sobe o arquivo pro storage + grava a linha em strategic_attachments.
    // Usado tanto pelo widget de anexo de item já salvo quanto pelos
    // formulários de criação (anexa junto com o "Salvar", sem passo extra).
    async function uploadAttachment(ownerType, ownerId, file) {
      const { year, month } = currentPeriod();
      const fileId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const safeName = String(file.name || "arquivo").replace(/[^\w.\-]+/g, "_");
      const path = `${state.organizationId}/${year}/${month}/${ownerType}/${ownerId}/${fileId}_${safeName}`;
      await uploadToStorage(ATTACHMENT_BUCKET, path, file);
      const body = {
        organization_id: state.organizationId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        file_size: file.size || null,
        [ownerType === "action" ? "action_id" : "analysis_item_id"]: ownerId
      };
      const response = await authenticatedFetch(`${supabaseApiUrl}/rest/v1/strategic_attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Prefer": "return=minimal" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(await response.text());
    }

    function renderAttachmentsStrip(ownerType, ownerId, title) {
      const list = (state.attachments?.[ownerType]?.[ownerId]) || [];
      const chips = list.map((att, index) => `
        <span class="sa3-attachment-chip" data-attachment-open data-owner-type="${ownerType}" data-owner-id="${escapeHtml(ownerId)}" data-index="${index}" data-title="${escapeHtml(title || "")}" title="${escapeHtml(att.file_name)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v2"/></svg>
          <span class="sa3-attachment-name">${escapeHtml(truncateFileName(att.file_name))}</span>
          <button type="button" class="sa3-attachment-remove" data-action="remove-attachment" data-attachment-id="${escapeHtml(att.id)}" data-attachment-path="${escapeHtml(att.storage_path)}" title="Remover anexo">&times;</button>
        </span>
      `).join("");
      return `
        <div class="sa3-attachments">
          ${chips}
          <label class="sa3-attachment-add">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
            Anexar
            <input type="file" data-action="upload-attachment" data-owner-type="${ownerType}" data-owner-id="${escapeHtml(ownerId)}" hidden>
          </label>
        </div>
      `;
    }

    // -------------------------------------------------------- Carrossel de anexos
    // Mesmo padrão visual do módulo RPS (mesmas classes .rps-carousel-* já
    // definidas no styles.css global — não duplica CSS): imagem/PDF/vídeo/
    // áudio com pré-visualização, setas/miniaturas quando tem mais de 1
    // arquivo. Reaproveita ATTACHMENT_BUCKET + createStorageSignedUrl.
    function attachmentMediaKind(att) {
      const type = String(att?.mime_type || "").toLowerCase();
      const name = String(att?.file_name || "").toLowerCase();
      if (type.startsWith("image/") || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(name)) return "image";
      if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
      if (type.startsWith("video/") || /\.(m4v|mov|mp4|webm)$/.test(name)) return "video";
      if (type.startsWith("audio/") || /\.(aac|m4a|mp3|ogg|wav)$/.test(name)) return "audio";
      return "file";
    }

    function formatAttachmentSize(bytes) {
      const size = Number(bytes || 0);
      if (size < 1024) return `${size} B`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1).replace(".0", "")} KB`;
      return `${(size / (1024 * 1024)).toFixed(1).replace(".0", "")} MB`;
    }

    function closeAttachmentCarousel() {
      document.querySelector(".rps-attachment-carousel")?.remove();
      document.body.classList.remove("rps-carousel-open");
    }

    function openAttachmentCarousel(ownerType, ownerId, startIndex, title) {
      closeAttachmentCarousel();
      const attachments = (state.attachments?.[ownerType]?.[ownerId]) || [];
      if (!attachments.length) return;

      let activeIndex = startIndex || 0;
      let renderGeneration = 0;
      const signedUrls = new Map();
      const carousel = document.createElement("div");
      carousel.className = "rps-attachment-carousel";
      carousel.tabIndex = -1;
      carousel.innerHTML = `
        <section class="rps-carousel-stage" role="dialog" aria-modal="true" aria-labelledby="sa3-carousel-title">
          <header class="rps-carousel-header">
            <div class="rps-carousel-heading">
              <span>Anexos</span>
              <h3 id="sa3-carousel-title">${escapeHtml(title || "")}</h3>
            </div>
            <div class="rps-carousel-actions">
              <span class="rps-carousel-counter" data-carousel-counter></span>
              <a class="rps-carousel-external" data-carousel-external target="_blank" rel="noopener noreferrer">Abrir arquivo ↗</a>
              <button type="button" class="rps-carousel-close" data-carousel-close aria-label="Fechar apresentação">×</button>
            </div>
          </header>
          <main class="rps-carousel-viewport" data-carousel-viewport aria-live="polite"></main>
          ${attachments.length > 1 ? `<button type="button" class="rps-carousel-arrow is-previous" data-carousel-previous aria-label="Anexo anterior">‹</button>
          <button type="button" class="rps-carousel-arrow is-next" data-carousel-next aria-label="Próximo anexo">›</button>` : ""}
          <footer class="rps-carousel-footer">
            <div class="rps-carousel-caption"><strong data-carousel-name></strong><span data-carousel-meta></span></div>
            <nav class="rps-carousel-strip" aria-label="Arquivos anexados">${attachments.map((att, index) => `<button type="button" data-carousel-index="${index}" title="${escapeHtml(att.file_name || `Arquivo ${index + 1}`)}"><span>${index + 1}</span><small>${escapeHtml(att.file_name || "Arquivo")}</small></button>`).join("")}</nav>
          </footer>
        </section>`;
      document.body.appendChild(carousel);
      document.body.classList.add("rps-carousel-open");

      const viewport = carousel.querySelector("[data-carousel-viewport]");
      const counter = carousel.querySelector("[data-carousel-counter]");
      const nameEl = carousel.querySelector("[data-carousel-name]");
      const metaEl = carousel.querySelector("[data-carousel-meta]");
      const external = carousel.querySelector("[data-carousel-external]");

      const mediaMarkup = (att, url) => {
        const safeUrl = escapeHtml(url);
        const safeName = escapeHtml(att.file_name || "Arquivo");
        const kind = attachmentMediaKind(att);
        if (kind === "image") return `<img class="rps-carousel-image" src="${safeUrl}" alt="${safeName}">`;
        if (kind === "pdf") return `<iframe class="rps-carousel-pdf" src="${safeUrl}#view=FitH" title="${safeName}"></iframe>`;
        if (kind === "video") return `<video class="rps-carousel-video" src="${safeUrl}" controls playsinline></video>`;
        if (kind === "audio") return `<div class="rps-carousel-file-card"><span class="rps-carousel-file-symbol">♫</span><strong>${safeName}</strong><audio src="${safeUrl}" controls></audio></div>`;
        return `<div class="rps-carousel-file-card"><span class="rps-carousel-file-symbol">▧</span><strong>${safeName}</strong><p>Este tipo de arquivo não possui pré-visualização no navegador.</p><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Abrir arquivo</a></div>`;
      };

      const renderActive = async () => {
        const generation = ++renderGeneration;
        const att = attachments[activeIndex];
        counter.textContent = `${activeIndex + 1} / ${attachments.length}`;
        nameEl.textContent = att.file_name || "Arquivo";
        metaEl.textContent = `${formatAttachmentSize(att.file_size)}${att.created_at ? ` · ${new Date(att.created_at).toLocaleString("pt-BR")}` : ""}`;
        external.removeAttribute("href");
        external.classList.add("is-loading");
        carousel.querySelectorAll("[data-carousel-index]").forEach((button, index) => button.classList.toggle("is-active", index === activeIndex));
        viewport.innerHTML = `<div class="rps-carousel-loading"><span></span><p>Preparando visualização...</p></div>`;
        try {
          let url = signedUrls.get(att.id);
          if (!url) {
            url = await createStorageSignedUrl(ATTACHMENT_BUCKET, att.storage_path, 3600);
            signedUrls.set(att.id, url);
          }
          if (generation !== renderGeneration || !carousel.isConnected) return;
          external.href = url;
          external.classList.remove("is-loading");
          viewport.innerHTML = mediaMarkup(att, url);
        } catch (err) {
          if (generation !== renderGeneration || !carousel.isConnected) return;
          external.classList.remove("is-loading");
          viewport.innerHTML = `<div class="rps-carousel-error"><strong>Não foi possível carregar este arquivo.</strong><span>Tente novamente ou feche a apresentação.</span><button type="button" data-carousel-retry>Tentar novamente</button></div>`;
        }
      };

      const show = (index) => { activeIndex = (index + attachments.length) % attachments.length; void renderActive(); };
      const close = () => closeAttachmentCarousel();
      carousel.addEventListener("click", (event) => {
        if (event.target === carousel || event.target.closest("[data-carousel-close]")) return close();
        if (event.target.closest("[data-carousel-previous]")) return show(activeIndex - 1);
        if (event.target.closest("[data-carousel-next]")) return show(activeIndex + 1);
        if (event.target.closest("[data-carousel-retry]")) { signedUrls.delete(attachments[activeIndex].id); return void renderActive(); }
        const indexed = event.target.closest("[data-carousel-index]");
        if (indexed) show(Number(indexed.dataset.carouselIndex));
      });
      carousel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") close();
        else if (event.key === "ArrowLeft") show(activeIndex - 1);
        else if (event.key === "ArrowRight") show(activeIndex + 1);
      });
      carousel.focus();
      void renderActive();
    }

    function bindAttachmentWidgets() {
      root.querySelectorAll('[data-action="upload-attachment"]').forEach((input) => {
        input.addEventListener("change", async () => {
          const file = input.files?.[0];
          if (!file) return;
          if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); input.value = ""; return; }
          if (file.size > MAX_ATTACHMENT_BYTES) { appAlert?.(`O arquivo "${file.name}" ultrapassa o limite de 20 MB.`, "warn"); input.value = ""; return; }
          const ownerType = input.dataset.ownerType;
          const ownerId = input.dataset.ownerId;
          input.disabled = true;
          try {
            await uploadAttachment(ownerType, ownerId, file);
            await loadAttachments();
            renderShell();
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
            input.disabled = false;
          }
        });
      });

      root.querySelectorAll("[data-attachment-open]").forEach((chip) => {
        chip.addEventListener("click", (e) => {
          if (e.target.closest('[data-action="remove-attachment"]')) return;
          openAttachmentCarousel(chip.dataset.ownerType, chip.dataset.ownerId, Number(chip.dataset.index || 0), chip.dataset.title);
        });
      });

      root.querySelectorAll('[data-action="remove-attachment"]').forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
          const ok = await appConfirm?.("Remover este anexo?", "warn");
          if (!ok) return;
          btn.disabled = true;
          try {
            const response = await authenticatedFetch(
              `${supabaseApiUrl}/rest/v1/strategic_attachments?id=eq.${btn.dataset.attachmentId}`,
              { method: "DELETE" }
            );
            if (!response.ok) throw new Error(await response.text());
            await deleteFromStorage(ATTACHMENT_BUCKET, btn.dataset.attachmentPath);
            await loadAttachments();
            renderShell();
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
            btn.disabled = false;
          }
        });
      });
    }

    function renderActionItem(a) {
      const tone = ACTION_STATUS_TONE[a.status] || "muted";
      const label = (ACTION_STATUS_OPTIONS.find((o) => o.value === a.status) || {}).label || a.status;
      const ownerNames = (a.strategic_action_owners || []).map((o) => ownerNameById(o.user_id)).filter(Boolean);
      const extraMeta = [];
      if (ownerNames.length) extraMeta.push(`Responsável: ${ownerNames.join(", ")}`);
      if (a.progress !== null && a.progress !== undefined) extraMeta.push(`Progresso: ${a.progress}%`);
      const extraMetaHtml = extraMeta.length ? `<div class="sa3-action-meta">${escapeHtml(extraMeta.join(" · "))}</div>` : "";
      return `
        <div class="sa3-action-item">
          <div class="sa3-action-desc">${escapeHtml(a.title)}${a.description ? `<div class="sa3-action-meta">${escapeHtml(a.description)}</div>` : ""}${extraMetaHtml}</div>
          <div class="sa3-action-meta">${a.priority ? escapeHtml(a.priority) : "—"}</div>
          <div class="sa3-action-meta">${a.due_date ? escapeHtml(a.due_date) : "—"}</div>
          <span class="sa3-pill ${tone}">${escapeHtml(label)}</span>
          <div class="sa3-item-actions">
            <button type="button" class="sa3-icon-btn" data-action="edit-action-item" data-action-id="${escapeHtml(a.id)}" title="Editar">${ICON_EDIT}</button>
            <button type="button" class="sa3-icon-btn" data-action="delete-action-item" data-action-id="${escapeHtml(a.id)}" title="Excluir">${ICON_TRASH}</button>
          </div>
          <div style="grid-column:1/-1">${renderAttachmentsStrip("action", a.id, a.title)}</div>
        </div>
      `;
    }

    function renderActionForm(kpiId) {
      const statusOptions = ACTION_STATUS_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
      const priorityOptions = ACTION_PRIORITY_OPTIONS.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
      const ownersHtml = (state.orgUsers || []).length
        ? state.orgUsers.map((u) => `
            <label><input type="checkbox" data-field="owner" value="${escapeHtml(u.user_id)}"> ${escapeHtml(u.full_name || u.email || "Usuário")}</label>
          `).join("")
        : `<div class="sa3-empty">Nenhum usuário encontrado.</div>`;
      return `
        <div class="sa3-form hidden" data-action-form="${escapeHtml(kpiId)}" data-editing-id="">
          <div><label>Descrição da ação</label><textarea rows="2" data-field="title" placeholder="O que precisa ser feito?"></textarea></div>
          <div class="sa3-form-grid">
            <div><label>Detalhe (opcional)</label><input type="text" data-field="description"></div>
            <div><label>Prazo</label><input type="date" data-field="due_date"></div>
            <div><label>Status</label><select data-field="status">${statusOptions}</select></div>
          </div>
          <div class="sa3-form-grid" style="grid-template-columns:150px 150px">
            <div><label>Prioridade</label><select data-field="priority"><option value="">—</option>${priorityOptions}</select></div>
            <div><label>Progresso</label><input type="number" step="1" min="0" max="100" data-field="progress" placeholder="%"></div>
          </div>
          <div>
            <label>Responsáveis (opcional)</label>
            <div class="sa3-kpi-check-list">${ownersHtml}</div>
          </div>
          <div>
            <label>Anexo (opcional)</label>
            <div class="vecton-file-field">
              <span class="vecton-file-trigger">
                <span class="vecton-file-btn">Selecionar arquivo</span>
                <span class="vecton-file-name" data-file-name>Nenhum arquivo selecionado</span>
              </span>
              <input type="file" data-field="attachment" class="vecton-file-native">
            </div>
          </div>
          <div class="sa3-form-foot">
            <button class="sa3-btn" data-action="cancel-action-form" data-kpi-id="${escapeHtml(kpiId)}">Cancelar</button>
            <button class="sa3-btn primary" data-action="save-action" data-kpi-id="${escapeHtml(kpiId)}">Salvar ação</button>
          </div>
        </div>
      `;
    }

    // Reaproveita o mesmo form pra criar E editar — action=null limpa
    // (modo criação), action preenchido carrega os valores (modo edição).
    // Responsável/prioridade/progresso: campos recomendados, não obrigatórios
    // (decisão #24 da especificação) — banco e RPC já aceitavam, só faltava
    // o formulário expor.
    function fillActionForm(form, action) {
      if (!form) return;
      form.querySelector('[data-field="title"]').value = action?.title || "";
      form.querySelector('[data-field="description"]').value = action?.description || "";
      form.querySelector('[data-field="due_date"]').value = action?.due_date || "";
      form.querySelector('[data-field="status"]').value = action?.status || "not_started";
      form.querySelector('[data-field="priority"]').value = action?.priority || "";
      form.querySelector('[data-field="progress"]').value = action?.progress ?? "";
      const ownerIds = new Set((action?.strategic_action_owners || []).map((o) => o.user_id));
      form.querySelectorAll('[data-field="owner"]').forEach((cb) => { cb.checked = ownerIds.has(cb.value); });
      const fileInput = form.querySelector('[data-field="attachment"]');
      if (fileInput) fileInput.value = "";
      const fileNameEl = form.querySelector("[data-file-name]");
      if (fileNameEl) fileNameEl.textContent = "Nenhum arquivo selecionado";
      form.dataset.editingId = action?.id || "";
      const saveBtn = form.querySelector('[data-action="save-action"]');
      if (saveBtn) saveBtn.textContent = action ? "Salvar alterações" : "Salvar ação";
    }

    function bindActionForm(kpiId) {
      const toggleBtn = root.querySelector(`[data-action="toggle-action-form"][data-kpi-id="${cssEscape(kpiId)}"]`);
      const form = root.querySelector(`[data-action-form="${cssEscape(kpiId)}"]`);
      const cancelBtn = root.querySelector(`[data-action="cancel-action-form"][data-kpi-id="${cssEscape(kpiId)}"]`);
      const saveBtn = root.querySelector(`[data-action="save-action"][data-kpi-id="${cssEscape(kpiId)}"]`);

      toggleBtn?.addEventListener("click", () => {
        if (form?.classList.contains("hidden")) fillActionForm(form, null);
        form?.classList.toggle("hidden");
      });
      cancelBtn?.addEventListener("click", () => form?.classList.add("hidden"));
      bindFileNameDisplay(form);
      saveBtn?.addEventListener("click", async () => {
        if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
        const title = form.querySelector('[data-field="title"]').value.trim();
        if (!title) { appAlert?.("Descreva a ação antes de salvar.", "warn"); return; }
        const description = form.querySelector('[data-field="description"]').value.trim();
        const dueDate = form.querySelector('[data-field="due_date"]').value || null;
        const status = form.querySelector('[data-field="status"]').value;
        const priority = form.querySelector('[data-field="priority"]').value || null;
        const progressRaw = form.querySelector('[data-field="progress"]').value;
        const progress = progressRaw === "" ? null : Number(progressRaw);
        if (progress !== null && (Number.isNaN(progress) || progress < 0 || progress > 100)) {
          appAlert?.("Progresso precisa ser um número entre 0 e 100.", "warn");
          return;
        }
        const ownerIds = Array.from(form.querySelectorAll('[data-field="owner"]:checked')).map((cb) => cb.value);
        const file = form.querySelector('[data-field="attachment"]')?.files?.[0] || null;
        if (file && file.size > MAX_ATTACHMENT_BYTES) { appAlert?.(`O arquivo "${file.name}" ultrapassa o limite de 20 MB.`, "warn"); return; }
        const editingId = form.dataset.editingId || null;
        saveBtn.disabled = true;
        // strategic_save_action substitui a lista INTEIRA de vínculos a cada
        // chamada (mesmo contrato de strategic_save_period_analysis). Editar
        // a partir de um card específico só dá o a3/kpi DESSE card — se a
        // ação já estava ligada a outros, mandar só esse par apagava os
        // demais em silêncio (achado #4 do review). Fix: ao editar, parte
        // dos vínculos que a ação já tem (já carregados em state.actions via
        // o embed de loadActionsForA3) e garante que o card atual entra no
        // conjunto, em vez de truncar pra 1 A3 + 1 KPI.
        const existingAction = editingId ? state.actions.find((a) => a.id === editingId) : null;
        const a3Ids = existingAction
          ? Array.from(new Set([...(existingAction.strategic_action_a3 || []).map((l) => l.a3_id), state.a3Id]))
          : [state.a3Id];
        const kpiIds = existingAction
          ? Array.from(new Set([...(existingAction.strategic_action_kpis || []).map((l) => l.kpi_id), kpiId]))
          : [kpiId];
        try {
          const action = await callSupabaseRpc("strategic_save_action", {
            p_organization_id: state.organizationId,
            p_cycle_id: state.cycleId,
            p_id: editingId,
            p_title: title,
            p_description: description || null,
            p_status: status,
            p_priority: priority,
            p_due_date: dueDate,
            p_progress: progress,
            p_a3_ids: a3Ids,
            p_kpi_ids: kpiIds,
            p_owner_user_ids: ownerIds
          });
          if (file && action?.id) await uploadAttachment("action", action.id, file);
          await loadA3Detail(state.a3Id);
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          saveBtn.disabled = false;
        }
      });
    }

    // Editar/excluir ação — ligado uma vez só (não por KPI, como as ações
    // já vêm listadas dentro de cada bloco/card do KPI dono, achar o form
    // certo é só subir até o .sa3-card mais próximo).
    function bindActionItemButtons() {
      root.querySelectorAll('[data-action="edit-action-item"]').forEach((btn) => {
        btn.addEventListener("click", () => {
          const action = state.actions.find((a) => a.id === btn.dataset.actionId);
          const form = btn.closest(".sa3-card")?.querySelector("[data-action-form]");
          if (!action || !form) return;
          fillActionForm(form, action);
          form.classList.remove("hidden");
          form.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      });

      root.querySelectorAll('[data-action="delete-action-item"]').forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
          const ok = await appConfirm?.("Excluir esta ação? Os anexos dela também são removidos.", "danger");
          if (!ok) return;
          const actionId = btn.dataset.actionId;
          // Idem ao remove-analysis-item: a confirmação já promete "os anexos
          // também são removidos", mas até aqui isso só apagava o metadado
          // via cascata no banco — o arquivo físico ficava órfão no bucket
          // (achado #6 do review). Guarda a lista antes do DELETE.
          const orphanedAttachments = state.attachments?.action?.[actionId] || [];
          btn.disabled = true;
          try {
            const response = await authenticatedFetch(
              `${supabaseApiUrl}/rest/v1/strategic_actions?id=eq.${actionId}`,
              { method: "DELETE" }
            );
            if (!response.ok) throw new Error(await response.text());
            await Promise.all(orphanedAttachments.map((att) =>
              deleteFromStorage(ATTACHMENT_BUCKET, att.storage_path).catch(() => {})
            ));
            await loadA3Detail(state.a3Id);
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
            btn.disabled = false;
          }
        });
      });
    }

    function cssEscape(value) {
      return String(value).replace(/["\\]/g, "\\$&");
    }

    // ---------------------------------------------------------------- render: Tela 3
    function renderEntryScreen() {
      const a3 = state.monthlyEntry?.a3;
      const period = state.monthlyEntry?.period;
      const kpis = state.monthlyEntry?.kpis || [];
      if (!a3) { root.innerHTML = `<div class="sa3-error">Área não encontrada.</div>`; return; }

      const isClosed = period?.status === "closed";
      const rows = kpis.map((k) => renderEntryRow(k, isClosed)).join("");

      root.innerHTML = `
        <button class="sa3-back" data-action="back-detail"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 6l-6 6 6 6"/></svg>Voltar</button>
        <div class="sa3-card">
          <div class="sa3-head">
            <div><h2 style="color:${escapeHtml(a3.color || "#4f7cff")}">${escapeHtml(a3.name)} — lançamento mensal</h2><p>${MONTH_LABELS_SHORT[(period.month || 1) - 1]}/${period.year}</p></div>
            <div style="display:flex;gap:8px;">
              <button class="sa3-btn" data-action="sync-computed">Sincronizar automáticos</button>
              ${isClosed
                ? `<button class="sa3-btn" data-action="reopen-period" ${canManage() ? "" : "disabled"}>Reabrir período</button>`
                : `<button class="sa3-btn primary" data-action="close-period" ${canManage() ? "" : "disabled"}>Fechar período</button>`}
            </div>
          </div>
          <div class="sa3-period-status">
            <span class="sa3-pill ${isClosed ? "neg" : "pos"}">${isClosed ? "Período fechado" : "Período aberto"}</span>
          </div>
          ${rows}
        </div>
      `;

      root.querySelector('[data-action="back-detail"]')?.addEventListener("click", () => loadA3Detail(state.a3Id, false));
      root.querySelector('[data-action="sync-computed"]')?.addEventListener("click", async () => {
        try {
          await callSupabaseRpc("strategic_sync_computed_kpi_records", {
            p_organization_id: state.organizationId, p_year: period.year, p_month: period.month
          });
          await loadMonthlyEntry(state.a3Id);
        } catch (err) { appAlert?.(friendlyError(err), "error"); }
      });
      root.querySelector('[data-action="close-period"]')?.addEventListener("click", async () => {
        const ok = await appConfirm?.("Fechar este período? Os registros deixam de poder ser editados até reabrir.", "warn");
        if (!ok) return;
        try {
          await callSupabaseRpc("strategic_close_a3_period", { p_a3_id: state.a3Id, p_year: period.year, p_month: period.month });
          await loadMonthlyEntry(state.a3Id);
        } catch (err) { appAlert?.(friendlyError(err), "error"); }
      });
      root.querySelector('[data-action="reopen-period"]')?.addEventListener("click", async () => {
        const ok = await appConfirm?.("Reabrir este período pra edição?", "warn");
        if (!ok) return;
        try {
          await callSupabaseRpc("strategic_reopen_a3_period", { p_a3_id: state.a3Id, p_year: period.year, p_month: period.month });
          await loadMonthlyEntry(state.a3Id);
        } catch (err) { appAlert?.(friendlyError(err), "error"); }
      });

      kpis.forEach((k) => bindEntryRow(k, isClosed));
    }

    // Meta editável em TODO entry_mode (inclusive 'computed' e 'breakdown' —
    // sem meta, nenhum KPI classifica status). Campos variam por
    // comparisonMode: higher/lower/exact usam target_value só; range usa
    // min+max; exact_with_tolerance usa value+tolerance.
    function renderTargetInputs(k, isClosed) {
      const t = k.target || {};
      const dis = isClosed ? "disabled" : "";
      if (k.comparisonMode === "range") {
        return `
          <div class="sa3-entry-meta">
            <span class="k">Meta (mín–máx)</span>
            <div class="sa3-entry-meta-row">
              <input type="number" step="any" data-target-field="target_min" value="${t.min ?? ""}" placeholder="mín" ${dis}>
              <input type="number" step="any" data-target-field="target_max" value="${t.max ?? ""}" placeholder="máx" ${dis}>
            </div>
          </div>
        `;
      }
      if (k.comparisonMode === "exact_with_tolerance") {
        return `
          <div class="sa3-entry-meta">
            <span class="k">Meta &plusmn; tolerância</span>
            <div class="sa3-entry-meta-row">
              <input type="number" step="any" data-target-field="target_value" value="${t.value ?? ""}" ${dis}>
              <input type="number" step="any" data-target-field="tolerance" value="${t.tolerance ?? ""}" placeholder="±" ${dis}>
            </div>
          </div>
        `;
      }
      return `
        <div class="sa3-entry-meta">
          <span class="k">Meta</span>
          <div class="sa3-entry-meta-row">
            <input type="number" step="any" data-target-field="target_value" value="${t.value ?? ""}" ${dis}>
          </div>
        </div>
      `;
    }

    function readTargetPayload(rowEl) {
      const val = (sel) => {
        const el = rowEl.querySelector(sel);
        return el && el.value !== "" ? Number(el.value) : null;
      };
      return {
        target_value: val('[data-target-field="target_value"]'),
        target_min: val('[data-target-field="target_min"]'),
        target_max: val('[data-target-field="target_max"]'),
        tolerance: val('[data-target-field="tolerance"]')
      };
    }

    // Layout ÚNICO pra 100% dos indicadores, qualquer entry_mode: Nome | Meta
    // | Real | 1 botão Salvar. O que muda de um modo pro outro é só o
    // CONTEÚDO da célula "Real":
    //  - direct / computed: um input numérico editável. Em 'computed' ele
    //    vem preenchido com o valor calculado (sugestão), mas continua
    //    editável — "Sincronizar automáticos" só ATUALIZA essa sugestão,
    //    quem trava o valor é o botão Salvar da linha.
    //  - drivers: os direcionadores (ex.: admissões/desligamentos/quadro),
    //    compactos, empilhados na mesma célula.
    //  - breakdown: célula "Real" só resume a contagem de linhas; o editor
    //    de composição em si fica num painel full-width logo abaixo da
    //    linha (não cabe nos 190px da coluna) — ver renderBreakdownPanel.
    //    O botão Salvar único da linha manda meta + composição juntos
    //    (achado #2 do review: 8 KPIs breakdown ativos não aceitavam
    //    realizado nenhum — RPC já suportava p_breakdown_rows, só faltava
    //    o editor no frontend).
    function renderEntryRow(k, isClosed) {
      const targetInputs = renderTargetInputs(k, isClosed);
      const saveBtn = !isClosed
        ? `<button class="sa3-btn primary" data-action="save-row" data-kpi-id="${escapeHtml(k.id)}">Salvar</button>`
        : "";
      const nameNote = k.entryMode === "drivers"
        ? `<div class="sa3-entry-target">Resultado atual: ${formatByUnit(k.resultValue, k.unit, k.decimalPlaces)}</div>`
        : "";

      let realCell;
      let breakdownPanel = "";
      if (k.entryMode === "drivers") {
        const driverRows = (k.drivers || []).map((d) => `
          <div class="sa3-entry-driver-row">
            <label title="${escapeHtml(d.name)} (${escapeHtml(d.role)})">${escapeHtml(d.name)}</label>
            <input type="number" step="any" data-driver-code="${escapeHtml(d.code)}" value="${d.value ?? ""}" ${isClosed ? "disabled" : ""}>
          </div>
        `).join("");
        realCell = `<div class="sa3-entry-real"><span class="k">Real</span>${driverRows}</div>`;
      } else if (k.entryMode === "breakdown") {
        const rowCount = (k.breakdownRows || []).length;
        realCell = `<div class="sa3-entry-real"><span class="k">Real (composição)</span><div class="sa3-entry-target">${rowCount} linha${rowCount === 1 ? "" : "s"} — editar abaixo</div></div>`;
        breakdownPanel = renderBreakdownPanel(k, isClosed);
      } else {
        // direct ou computed
        realCell = `
          <div class="sa3-entry-real">
            <span class="k">Real</span>
            <input type="number" step="any" data-field="result" value="${k.resultValue ?? ""}" ${isClosed ? "disabled" : ""}>
          </div>
        `;
      }

      return `
        <div class="sa3-entry-row" data-kpi-row="${escapeHtml(k.id)}" data-entry-mode="${escapeHtml(k.entryMode)}" data-version="${k.version ?? ""}">
          <div>
            <div class="sa3-entry-name">${escapeHtml(k.name)}${k.entryMode === "computed" ? '<span class="sa3-badge-auto">Auto</span>' : ""}</div>
            ${nameNote}
          </div>
          ${targetInputs}
          ${realCell}
          <div class="sa3-entry-save">${saveBtn}</div>
        </div>
        ${breakdownPanel}
      `;
    }

    // Painel full-width (não cabe na coluna "Real" de 190px) com as linhas de
    // composição do KPI breakdown: descrição livre + planejado + real (+ peso,
    // só quando monthly_calculation='weighted_average' — 'ratio' soma
    // actual/planned direto, sem peso). dimension_key é só um slug de
    // identificação da linha (a RPC substitui a lista inteira a cada save,
    // igual strategic_save_period_analysis — não há FK externa nele).
    function renderBreakdownPanel(k, isClosed) {
      const rows = k.breakdownRows || [];
      const showWeight = k.monthlyCalculation === "weighted_average";
      const rowsHtml = rows.length
        ? rows.map((r, i) => renderBreakdownRow(r, i, showWeight, isClosed)).join("")
        : `<div class="sa3-empty">Nenhuma linha cadastrada.</div>`;
      return `
        <div class="sa3-breakdown-panel" data-breakdown-panel="${escapeHtml(k.id)}">
          <div class="sa3-breakdown-head">
            <span class="k">Composição por linha</span>
            ${!isClosed ? `<button type="button" class="sa3-btn" data-action="add-breakdown-row">+ Linha</button>` : ""}
          </div>
          <div class="sa3-breakdown-rows" data-breakdown-rows="${escapeHtml(k.id)}">${rowsHtml}</div>
        </div>
      `;
    }

    function renderBreakdownRow(r, index, showWeight, isClosed) {
      const dis = isClosed ? "disabled" : "";
      return `
        <div class="sa3-breakdown-row${showWeight ? "" : " no-weight"}" data-breakdown-row data-dimension-key="${escapeHtml(r.dimensionKey || "")}">
          <input type="text" data-field="dimension_label" value="${escapeHtml(r.dimensionLabel || "")}" placeholder="Descrição da linha" ${dis}>
          <input type="number" step="any" data-field="planned_value" value="${r.plannedValue ?? ""}" placeholder="Planejado" ${dis}>
          <input type="number" step="any" data-field="actual_value" value="${r.actualValue ?? ""}" placeholder="Real" ${dis}>
          ${showWeight ? `<input type="number" step="any" data-field="weight_value" value="${r.weightValue ?? ""}" placeholder="Peso" ${dis}>` : ""}
          <button type="button" class="sa3-icon-btn" data-action="remove-breakdown-row" title="Remover"${isClosed ? ' style="visibility:hidden"' : ""}>${ICON_TRASH}</button>
        </div>
      `;
    }

    // Slug de exibição só — sem função de chave estrangeira em outra tabela,
    // então não precisa de estabilidade rígida entre saves, só evitar campo
    // vazio (a RPC recebe dimension_key como texto livre).
    function slugifyDimensionKey(label, index) {
      const base = String(label || "")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      return base || `linha_${index + 1}`;
    }

    // Add/remove de linha do painel de composição — puramente client-side
    // até o Salvar da linha (mesmo padrão do form de driver, que também só
    // lê o DOM na hora de salvar, sem draft em state).
    function bindBreakdownPanel(k) {
      const panel = root.querySelector(`[data-breakdown-panel="${cssEscape(k.id)}"]`);
      if (!panel) return;
      const showWeight = k.monthlyCalculation === "weighted_average";
      const rowsWrap = panel.querySelector(`[data-breakdown-rows="${cssEscape(k.id)}"]`);

      const bindRemove = (rowEl) => {
        rowEl.querySelector('[data-action="remove-breakdown-row"]')?.addEventListener("click", () => rowEl.remove());
      };
      rowsWrap?.querySelectorAll("[data-breakdown-row]").forEach(bindRemove);

      panel.querySelector('[data-action="add-breakdown-row"]')?.addEventListener("click", () => {
        rowsWrap.querySelector(".sa3-empty")?.remove();
        const wrap = document.createElement("div");
        wrap.innerHTML = renderBreakdownRow({}, rowsWrap.children.length, showWeight, false).trim();
        const rowEl = wrap.firstElementChild;
        rowsWrap.appendChild(rowEl);
        bindRemove(rowEl);
      });
    }

    // Um Salvar só: manda a meta (sempre) e o realizado (conforme o modo) na
    // mesma ação. Em 'computed', salvar aqui é a sobrescrita manual da
    // sugestão automática — strategic_save_kpi_record já aceita isso.
    function bindEntryRow(k, isClosed) {
      if (isClosed) return;
      const rowEl = root.querySelector(`[data-kpi-row="${cssEscape(k.id)}"]`);
      const btn = root.querySelector(`[data-action="save-row"][data-kpi-id="${cssEscape(k.id)}"]`);

      if (k.entryMode === "breakdown") bindBreakdownPanel(k);

      btn?.addEventListener("click", async () => {
        if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
        btn.disabled = true;
        try {
          const { year, month } = currentPeriod();
          await saveKpiTarget(k.id, { year, month, ...readTargetPayload(rowEl) });

          if (k.entryMode === "drivers") {
            const inputs = rowEl.querySelectorAll("[data-driver-code]");
            const driverInputs = Array.from(inputs).map((inp) => ({
              driver_code: inp.dataset.driverCode,
              numeric_value: inp.value === "" ? null : Number(inp.value)
            }));
            const version = rowEl.dataset.version ? Number(rowEl.dataset.version) : null;
            await callSupabaseRpc("strategic_save_kpi_record", {
              p_kpi_id: k.id, p_year: year, p_month: month, p_expected_version: version, p_driver_inputs: driverInputs
            });
          } else if (k.entryMode === "breakdown") {
            const panelEl = root.querySelector(`[data-breakdown-panel="${cssEscape(k.id)}"]`);
            const rowEls = panelEl ? panelEl.querySelectorAll("[data-breakdown-row]") : [];
            const numVal = (el, sel) => {
              const inp = el.querySelector(sel);
              if (!inp) return null;
              return inp.value === "" ? null : Number(inp.value);
            };
            const breakdownRows = Array.from(rowEls)
              .map((el, i) => {
                const label = el.querySelector('[data-field="dimension_label"]').value.trim();
                return {
                  dimension_key: el.dataset.dimensionKey || slugifyDimensionKey(label, i),
                  dimension_label: label,
                  planned_value: numVal(el, '[data-field="planned_value"]'),
                  actual_value: numVal(el, '[data-field="actual_value"]'),
                  weight_value: numVal(el, '[data-field="weight_value"]'),
                  display_order: i
                };
              })
              .filter((r) => r.dimension_label); // ignora linha em branco adicionada e não preenchida
            const version = rowEl.dataset.version ? Number(rowEl.dataset.version) : null;
            await callSupabaseRpc("strategic_save_kpi_record", {
              p_kpi_id: k.id, p_year: year, p_month: month, p_expected_version: version, p_breakdown_rows: breakdownRows
            });
          } else {
            // direct, ou sobrescrita manual de 'computed'
            const input = rowEl.querySelector('[data-field="result"]');
            const value = input && input.value !== "" ? Number(input.value) : null;
            const version = rowEl.dataset.version ? Number(rowEl.dataset.version) : null;
            await callSupabaseRpc("strategic_save_kpi_record", {
              p_kpi_id: k.id, p_year: year, p_month: month, p_result_value: value, p_expected_version: version
            });
          }
          await loadMonthlyEntry(state.a3Id);
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          btn.disabled = false;
        }
      });
    }

    // ---------------------------------------------------------------- public API
    // Chamado pelo app.js tanto na entrada do módulo quanto a cada troca do
    // período do topo (mesmo padrão de renderComercialVendasView) — por
    // isso precisa comparar contra loadedPeriod, não só checar se já existe
    // dado carregado (achado #1 do review: trocar o mês/ano não recarregava
    // a tela, e Salvar acabava gravando o período novo com os campos ainda
    // do período antigo na tela).
    function render() {
      if (!root) return;
      if (state.loading) { renderShell(); return; }

      const period = currentPeriod();
      const periodChanged = !!state.loadedPeriod &&
        (state.loadedPeriod.year !== period.year || state.loadedPeriod.month !== period.month);

      if (state.screen === "overview") {
        if (!state.overview || periodChanged) { loadOverview(); return; }
      } else if (state.screen === "detail") {
        if (!state.a3Detail || periodChanged) {
          loadA3Detail(state.a3Id, state.a3Id === state.a3RootId);
          return;
        }
      } else if (state.screen === "entry") {
        if (!state.monthlyEntry || periodChanged) { loadMonthlyEntry(state.a3Id); return; }
      }
      renderShell();
    }

    function destroy() {
      state.overview = null;
      state.a3Detail = null;
      state.monthlyEntry = null;
      state.loadedPeriod = null;
      state.screen = "overview";
    }

    return { render, destroy };
  }

  window.VECTON_STRATEGIC = { createStrategicModule };
})(window);
