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
  //   - SEM upload de anexo nesta leva (bucket já existe, migration 133,
  //     mas a UI de anexar fica pra depois).
  //   - SEM edição de meta/cenário — meta aparece só como leitura.
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
      escapeHtml
    } = deps;

    const state = {
      loading: false,
      error: "",
      screen: "overview",      // "overview" | "detail" | "entry"
      organizationId: null,
      cycleId: null,
      overview: null,          // { northGoals, areas }
      a3RootId: null,          // A3 clicado na Tela 1 (sempre uma mãe, filhos não aparecem lá)
      a3Children: [],          // filhos do a3RootId — vira aba "Consolidado + filhos"
      a3Id: null,              // aba ativa da Tela 2 (pode ser o próprio a3RootId ou um filho)
      a3Detail: null,          // { a3, children, kpis } — dados da aba ativa
      monthlyEntry: null,      // { a3, period, kpis }
      actions: [],             // ações do A3 atual (todas, filtro é feito na leitura)
      periodAnalysis: null,    // { id, summary, strategic_analysis_items: [...] } do A3+mês ativo, ou null se nunca salvo
      dirtyDrafts: {}          // { [kpiId]: { resultValue, drivers: {code: value} } } — edição em andamento, não salva
    };

    const myRoles = () => (getAllAccessRoles ? getAllAccessRoles() : []);
    const canManage = () => myRoles().some((r) => ["super_admin", "admin", "gestao_estrategica"].includes(r));

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
        .sa3-analysis-summary { width:100%; min-height:56px; resize:vertical; background:rgba(255,255,255,.03); border:1px solid var(--sa3-line); border-radius:8px; color:var(--sa3-text); font:inherit; font-size:.8rem; padding:9px 11px; margin-bottom:10px; }
        .sa3-analysis-list { display:flex; flex-direction:column; gap:8px; margin-bottom:6px; }
        .sa3-analysis-item { display:grid; grid-template-columns:auto 1fr auto; gap:10px; align-items:start; padding:10px 12px; border-radius:9px; background:var(--sa3-panel-alt); border:1px solid var(--sa3-line-soft); font-size:.78rem; }
        .sa3-analysis-tag { padding:3px 9px; border-radius:999px; font-size:.64rem; font-weight:700; white-space:nowrap; }
        .sa3-analysis-tag.cause { background:rgba(245,158,11,.12); color:var(--sa3-amber); }
        .sa3-analysis-tag.countermeasure { background:rgba(74,222,128,.12); color:var(--sa3-pos); }
        .sa3-analysis-kpis { margin-top:5px; display:flex; gap:5px; flex-wrap:wrap; }
        .sa3-analysis-kpi-chip { font-size:.62rem; color:var(--sa3-faint); background:rgba(255,255,255,.04); border-radius:999px; padding:2px 7px; }
        .sa3-analysis-remove { background:none; border:none; color:var(--sa3-faint); cursor:pointer; padding:2px; }
        .sa3-analysis-remove:hover { color:var(--sa3-neg); }
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
        .sa3-kpi-nums { text-align:right; }
        .sa3-kpi-nums .v { font-size:1.05rem; font-weight:800; }
        .sa3-kpi-nums .t { font-size:.68rem; color:var(--sa3-faint); margin-top:1px; }
        .sa3-bars { display:flex; align-items:flex-end; gap:6px; height:140px; padding:0 2px; margin-top:8px; }
        .sa3-bar-col { flex:1 1 0; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:6px; height:100%; min-width:0; }
        .sa3-bar-stack { position:relative; width:100%; max-width:24px; height:100%; display:flex; align-items:flex-end; justify-content:center; }
        .sa3-bar-ghost { position:absolute; bottom:0; width:100%; border-radius:4px 4px 0 0; border:1.5px dashed rgba(255,255,255,.22); background:rgba(255,255,255,.02); }
        .sa3-bar-real { position:relative; width:65%; border-radius:4px 4px 0 0; z-index:1; }
        .sa3-bar-real.pos { background:linear-gradient(180deg,#4ade80,#16a34a); }
        .sa3-bar-real.neg { background:linear-gradient(180deg,#f87171,#dc2626); }
        .sa3-bar-month { font-size:.58rem; color:var(--sa3-faint); text-transform:uppercase; }
        .sa3-action-plan { margin-top:14px; padding-top:12px; border-top:1px solid var(--sa3-line-soft); }
        .sa3-action-item { display:grid; grid-template-columns:1fr 130px 90px 110px; gap:10px; align-items:center; padding:9px 12px; border-radius:9px; background:var(--sa3-panel-alt); border:1px solid var(--sa3-line-soft); font-size:.75rem; margin-bottom:6px; }
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
        const { year, month } = currentPeriod();
        state.overview = await callSupabaseRpc("strategic_get_overview", {
          p_organization_id: state.organizationId, p_year: year, p_month: month
        });
      } catch (err) {
        state.error = friendlyError(err);
      } finally {
        state.loading = false; renderShell();
      }
    }

    // isRoot=true quando vem da Tela 1 (sempre uma A3 mãe) — reseta as abas.
    // isRoot=false é clique numa aba (Consolidado/filho) dentro da própria
    // Tela 2 — mantém as abas já carregadas, só troca o KPI exibido.
    async function loadA3Detail(a3Id, isRoot = true) {
      state.loading = true; state.error = ""; state.a3Id = a3Id; state.screen = "detail";
      if (isRoot) { state.a3RootId = a3Id; state.a3Children = []; }
      renderShell();
      try {
        await ensureContext();
        const { year, month } = currentPeriod();
        state.a3Detail = await callSupabaseRpc("strategic_get_a3_detail", {
          p_organization_id: state.organizationId, p_a3_id: a3Id, p_year: year, p_month: month
        });
        if (isRoot) state.a3Children = state.a3Detail?.children || [];
        await loadActionsForA3(a3Id);
        await loadPeriodAnalysis(a3Id, year, month);
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
        const { year, month } = currentPeriod();
        state.monthlyEntry = await callSupabaseRpc("strategic_get_monthly_entry", {
          p_organization_id: state.organizationId, p_a3_id: a3Id, p_year: year, p_month: month
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
        `organization_id=eq.${state.organizationId}&select=*,strategic_action_kpis(kpi_id),strategic_action_a3(a3_id)&order=due_date.asc.nullslast`
      );
      state.actions = (rows || []).filter((a) =>
        (a.strategic_action_a3 || []).some((l) => l.a3_id === a3Id) ||
        (a.strategic_action_kpis || []).some((l) => kpiIds.includes(l.kpi_id))
      );
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

      const summary = state.periodAnalysis?.summary || "";

      root.innerHTML = `
        <button class="sa3-back" data-action="back-overview"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 6l-6 6 6 6"/></svg>Voltar</button>
        <div class="sa3-card">
          <div class="sa3-head">
            <div><h2 style="color:${escapeHtml(a3.color || "#4f7cff")}">${escapeHtml(a3.name)}</h2><p>${escapeHtml(a3.objective || `${kpis.length} indicador${kpis.length === 1 ? "" : "es"}`)}</p></div>
            <button class="sa3-btn primary" data-action="open-entry">Preenchimento mensal</button>
          </div>
          ${tabsHtml}
          <div style="margin-top:12px">
            <label style="display:block;font-size:.64rem;font-weight:700;text-transform:uppercase;color:var(--sa3-faint);margin-bottom:4px">Resumo do período (opcional)</label>
            <textarea class="sa3-analysis-summary" data-field="analysis-summary" placeholder="Como foi o mês pra esta área, em 1 parágrafo...">${escapeHtml(summary)}</textarea>
            <div style="text-align:right"><button class="sa3-btn" data-action="save-analysis-summary">Salvar resumo</button></div>
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
      root.querySelector('[data-action="save-analysis-summary"]')?.addEventListener("click", async (e) => {
        if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
        const btn = e.currentTarget;
        const value = root.querySelector('[data-field="analysis-summary"]').value.trim();
        btn.disabled = true;
        try {
          await saveAnalysis(state.a3Id, value, (items) => items);
          renderShell();
        } catch (err) {
          appAlert?.(friendlyError(err), "error"); btn.disabled = false;
        }
      });

      kpis.forEach((k) => { bindActionForm(k.id); bindKpiAnalysisForm(k.id); });
      bindAnalysisRemoveButtons();
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
    function renderKpiAnalysisSection(k) {
      const items = (state.periodAnalysis?.strategic_analysis_items || [])
        .filter((it) => (it.strategic_analysis_item_kpis || []).some((l) => l.kpi_id === k.id))
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

      const itemsHtml = items.length ? items.map((it) => `
        <div class="sa3-analysis-item">
          <span class="sa3-analysis-tag ${it.item_type}">${it.item_type === "cause" ? "Causa" : "Contramedida"}</span>
          <div>${escapeHtml(it.description)}</div>
          <button class="sa3-analysis-remove" data-action="remove-analysis-item" data-item-id="${escapeHtml(it.id)}" title="Remover">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      `).join("") : `<div class="sa3-empty">Nenhuma causa ou contramedida registrada.</div>`;

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
      addBtn?.addEventListener("click", async () => {
        if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
        const itemType = form.querySelector('[data-field="item_type"]').value;
        const description = form.querySelector('[data-field="description"]').value.trim();
        if (!description) { appAlert?.("Descreva a causa ou contramedida antes de salvar.", "warn"); return; }
        addBtn.disabled = true;
        try {
          await saveAnalysis(state.a3Id, undefined, (items) => [
            ...items,
            { item_type: itemType, description, display_order: items.length, kpi_ids: [kpiId] }
          ]);
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
          const ok = await appConfirm?.("Remover este item da análise?", "warn");
          if (!ok) return;
          try {
            await saveAnalysis(state.a3Id, undefined, (items) => items.filter((it) => it.id !== btn.dataset.itemId));
            renderShell();
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
          }
        });
      });
    }

    function renderKpiBlock(k) {
      const status = STATUS_META[k.status] || STATUS_META.not_available;
      const monthly = k.monthlyValues || [];
      const targets = k.monthlyTargets || [];
      const maxVal = Math.max(1, ...monthly.map((m) => Math.abs(m.value || 0)), ...targets.map((t) => Math.abs(t.value || 0)));

      const bars = monthly.map((m, i) => {
        const tVal = targets[i]?.value;
        const hasReal = m.value !== null && m.value !== undefined;
        const ghostH = tVal !== null && tVal !== undefined ? Math.min(100, (Math.abs(tVal) / maxVal) * 100) : 0;
        const realH = hasReal ? Math.min(100, (Math.abs(m.value) / maxVal) * 100) : 0;
        let tone = "";
        if (hasReal && tVal !== null && tVal !== undefined) {
          const hit = k.comparisonMode === "lower" ? m.value <= tVal : m.value >= tVal;
          tone = hit ? "pos" : "neg";
        }
        return `
          <div class="sa3-bar-col">
            <div class="sa3-bar-stack">
              ${ghostH ? `<div class="sa3-bar-ghost" style="height:${ghostH}%"></div>` : ""}
              ${hasReal ? `<div class="sa3-bar-real ${tone}" style="height:${realH}%"></div>` : ""}
            </div>
            <span class="sa3-bar-month">${MONTH_LABELS_SHORT[i]}</span>
          </div>
        `;
      }).join("");

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
            <div class="sa3-kpi-nums">
              <div class="v">${formatByUnit(k.accumulatedResult, k.unit, k.decimalPlaces)}</div>
              <div class="t">Meta acum.: ${formatByUnit(k.accumulatedTarget, k.unit, k.decimalPlaces)}</div>
              <span class="sa3-pill ${status.tone}">${status.label}</span>
            </div>
          </div>
          <div class="sa3-bars">${bars}</div>
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

    function renderActionItem(a) {
      const tone = ACTION_STATUS_TONE[a.status] || "muted";
      const label = (ACTION_STATUS_OPTIONS.find((o) => o.value === a.status) || {}).label || a.status;
      return `
        <div class="sa3-action-item">
          <div class="sa3-action-desc">${escapeHtml(a.title)}${a.description ? `<div class="sa3-action-meta">${escapeHtml(a.description)}</div>` : ""}</div>
          <div class="sa3-action-meta">${a.priority ? escapeHtml(a.priority) : "—"}</div>
          <div class="sa3-action-meta">${a.due_date ? escapeHtml(a.due_date) : "—"}</div>
          <span class="sa3-pill ${tone}">${escapeHtml(label)}</span>
        </div>
      `;
    }

    function renderActionForm(kpiId) {
      const statusOptions = ACTION_STATUS_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
      return `
        <div class="sa3-form hidden" data-action-form="${escapeHtml(kpiId)}">
          <div><label>Descrição da ação</label><textarea rows="2" data-field="title" placeholder="O que precisa ser feito?"></textarea></div>
          <div class="sa3-form-grid">
            <div><label>Detalhe (opcional)</label><input type="text" data-field="description"></div>
            <div><label>Prazo</label><input type="date" data-field="due_date"></div>
            <div><label>Status</label><select data-field="status">${statusOptions}</select></div>
          </div>
          <div class="sa3-form-foot">
            <button class="sa3-btn" data-action="cancel-action-form" data-kpi-id="${escapeHtml(kpiId)}">Cancelar</button>
            <button class="sa3-btn primary" data-action="save-action" data-kpi-id="${escapeHtml(kpiId)}">Salvar ação</button>
          </div>
        </div>
      `;
    }

    function bindActionForm(kpiId) {
      const toggleBtn = root.querySelector(`[data-action="toggle-action-form"][data-kpi-id="${cssEscape(kpiId)}"]`);
      const form = root.querySelector(`[data-action-form="${cssEscape(kpiId)}"]`);
      const cancelBtn = root.querySelector(`[data-action="cancel-action-form"][data-kpi-id="${cssEscape(kpiId)}"]`);
      const saveBtn = root.querySelector(`[data-action="save-action"][data-kpi-id="${cssEscape(kpiId)}"]`);

      toggleBtn?.addEventListener("click", () => form?.classList.toggle("hidden"));
      cancelBtn?.addEventListener("click", () => form?.classList.add("hidden"));
      saveBtn?.addEventListener("click", async () => {
        if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
        const title = form.querySelector('[data-field="title"]').value.trim();
        if (!title) { appAlert?.("Descreva a ação antes de salvar.", "warn"); return; }
        const description = form.querySelector('[data-field="description"]').value.trim();
        const dueDate = form.querySelector('[data-field="due_date"]').value || null;
        const status = form.querySelector('[data-field="status"]').value;
        saveBtn.disabled = true;
        try {
          await callSupabaseRpc("strategic_save_action", {
            p_organization_id: state.organizationId,
            p_cycle_id: state.cycleId,
            p_title: title,
            p_description: description || null,
            p_status: status,
            p_due_date: dueDate,
            p_a3_ids: [state.a3Id],
            p_kpi_ids: [kpiId]
          });
          await loadA3Detail(state.a3Id);
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          saveBtn.disabled = false;
        }
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
    //  - breakdown: nota "editor ainda não disponível" (composição por linha
    //    ainda não tem editor — só a meta é salva aqui por enquanto).
    function renderEntryRow(k, isClosed) {
      const targetInputs = renderTargetInputs(k, isClosed);
      const saveBtn = !isClosed
        ? `<button class="sa3-btn primary" data-action="save-row" data-kpi-id="${escapeHtml(k.id)}">Salvar</button>`
        : "";
      const nameNote = k.entryMode === "drivers"
        ? `<div class="sa3-entry-target">Resultado atual: ${formatByUnit(k.resultValue, k.unit, k.decimalPlaces)}</div>`
        : "";

      let realCell;
      if (k.entryMode === "drivers") {
        const driverRows = (k.drivers || []).map((d) => `
          <div class="sa3-entry-driver-row">
            <label title="${escapeHtml(d.name)} (${escapeHtml(d.role)})">${escapeHtml(d.name)}</label>
            <input type="number" step="any" data-driver-code="${escapeHtml(d.code)}" value="${d.value ?? ""}" ${isClosed ? "disabled" : ""}>
          </div>
        `).join("");
        realCell = `<div class="sa3-entry-real"><span class="k">Real</span>${driverRows}</div>`;
      } else if (k.entryMode === "breakdown") {
        realCell = `<div class="sa3-entry-real"><span class="k">Real</span><div class="sa3-entry-target">Editor de composição ainda não disponível</div></div>`;
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
      `;
    }

    // Um Salvar só: manda a meta (sempre) e o realizado (conforme o modo) na
    // mesma ação. Em 'computed', salvar aqui é a sobrescrita manual da
    // sugestão automática — strategic_save_kpi_record já aceita isso.
    function bindEntryRow(k, isClosed) {
      if (isClosed) return;
      const rowEl = root.querySelector(`[data-kpi-row="${cssEscape(k.id)}"]`);
      const btn = root.querySelector(`[data-action="save-row"][data-kpi-id="${cssEscape(k.id)}"]`);
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
            // sem editor de composição ainda — só a meta é persistida aqui.
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
    function render() {
      if (!root) return;
      if (!state.overview && state.screen === "overview" && !state.loading) {
        loadOverview();
        return;
      }
      renderShell();
    }

    function destroy() {
      state.overview = null;
      state.a3Detail = null;
      state.monthlyEntry = null;
      state.screen = "overview";
    }

    return { render, destroy };
  }

  window.VECTON_STRATEGIC = { createStrategicModule };
})(window);
