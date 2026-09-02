(function attachVectonStrategicMobile(window) {
  // A3 Estratégicos — versão mobile, v1 SOMENTE LEITURA (decisão do usuário,
  // 2026-09-02): Visão Executiva (Norte Verdadeiro + áreas com status) e
  // Detalhe de A3 (KPIs real×meta + status + plano de ação, tudo leitura).
  // Lançamento mensal, causas/contramedidas e anexos ficam de fora desta
  // leva — só no desktop. Mesmas RPCs do desktop (strategic_get_overview/
  // strategic_get_a3_detail) e a mesma tabela strategic_actions (mesmo
  // filtro de loadActionsForA3) — nenhuma regra de negócio nova aqui, só
  // apresentação resumida (mesmo espírito do Painel de Vendas mobile:
  // "os mesmos números, só um jeito resumido de mostrar"). Formatação/
  // status compartilhados com o desktop via strategicDataModule.js.
  function createStrategicMobileModule(deps) {
    const {
      resolveOrganizationId,
      callSupabaseRpc,
      authenticatedFetch,
      supabaseApiUrl,
      escapeHtml
    } = deps;
    const DATA = window.VECTON_STRATEGIC_DATA;
    const { STATUS_META, ACTION_STATUS_OPTIONS, ACTION_STATUS_TONE, formatByUnit, formatTargetVariation } = DATA;

    const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    // Mesmo mapeamento de tom -> cor do desktop (.sa3-pill em strategicModule.js)
    // usando os tokens --vmob-* já definidos em styles.css; "pause" (ação
    // pausada) não tem token vmob equivalente -- usa o próprio acento roxo
    // do módulo A3 no Menu mobile (mobileShellModule.js: accent "#8b5cf6"),
    // consistência de marca do módulo, não uma cor nova inventada.
    const TONE_COLOR = {
      pos: "var(--vmob-positive)", neg: "var(--vmob-negative)", warn: "var(--vmob-warning)",
      pause: "#8b5cf6", cancel: "var(--vmob-faint)", muted: "var(--vmob-faint)"
    };

    let containerEl = null;
    let entered = false;
    let orgId = null;
    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;
    let screen = "overview"; // "overview" | "detail"
    let overview = null;     // { northGoals, areas }
    let a3RootId = null, a3Children = [], activeA3Id = null;
    let a3Detail = null;     // { a3, children, kpis, canEdit }
    let actions = [];
    let orgUsers = null;
    let loading = false;
    let error = "";
    let loadedOverviewKey = null;
    let loadedDetailKey = null;

    // ---------------------------------------------------------------- CSS

    function ensureStyle() {
      if (document.getElementById("vmob-sa3-style")) return;
      const s = document.createElement("style");
      s.id = "vmob-sa3-style";
      s.textContent = `
        /* .vmob-crumbbar/.vmob-level-title/.vmob-section*/.vmob-card/.vmob-chev/
           .vmob-empty/.vmob-loading* base ficam em styles.css -- compartilhados
           com o Menu e o Painel de Vendas mobile. Só o que é específico do A3
           Estratégico fica aqui (mesmo padrão do reportsComercialPainelMobileModule.js). */

        .sa3mob-period { display:flex; align-items:center; justify-content:center; gap:14px; margin-top:10px; }
        .sa3mob-period button { all:unset; box-sizing:border-box; width:30px; height:30px; display:grid; place-items:center; border-radius:9px; background:var(--vmob-panel); border:1px solid var(--vmob-line); color:var(--vmob-soft); font-size:16px; cursor:pointer; }
        .sa3mob-period button:active { background:var(--vmob-panel-elevated); }
        .sa3mob-period-label { font-size:13px; font-weight:700; color:var(--vmob-text); min-width:70px; text-align:center; }

        .sa3mob-north-grid { display:flex; flex-direction:column; gap:8px; }
        .sa3mob-north-row { display:flex; align-items:baseline; justify-content:space-between; gap:10px; padding:9px 0; border-top:1px solid var(--vmob-line); }
        .sa3mob-north-row:first-child { border-top:none; padding-top:0; }
        .sa3mob-north-title { font-size:12.5px; font-weight:600; color:var(--vmob-soft); }
        .sa3mob-north-value { font-size:12.5px; font-weight:800; color:var(--vmob-text); text-align:right; white-space:nowrap; }

        .sa3mob-area-list { display:flex; flex-direction:column; gap:8px; }
        .sa3mob-area-row { all:unset; box-sizing:border-box; display:flex; align-items:center; gap:10px; width:100%; background:var(--vmob-panel); border:1px solid var(--vmob-line); border-left:3px solid var(--vmob-card-accent, var(--vmob-accent)); border-radius:14px; padding:11px 12px; cursor:pointer; }
        .sa3mob-area-row:active { background:var(--vmob-panel-elevated); }
        .sa3mob-area-icon { width:30px; height:30px; border-radius:9px; flex-shrink:0; display:grid; place-items:center; font-size:12.5px; font-weight:800; color:#fff; background:var(--vmob-card-accent, var(--vmob-accent)); }
        .sa3mob-area-id { flex:1 1 auto; min-width:0; }
        .sa3mob-area-name { display:block; font-size:13px; font-weight:800; color:var(--vmob-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sa3mob-area-sub { display:block; font-size:10.5px; color:var(--vmob-faint); margin-top:1px; }

        .sa3mob-pill { display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:999px; font-size:10.5px; font-weight:700; white-space:nowrap; flex-shrink:0; }

        .sa3mob-crumb { display:flex; align-items:center; font-size:13px; font-weight:600; flex-wrap:wrap; margin-bottom:6px; }
        .sa3mob-crumb button { all:unset; color:var(--vmob-faint); cursor:pointer; padding:2px 1px; }
        .sa3mob-crumb .sa3mob-crumb-current { color:var(--vmob-text); }
        .sa3mob-crumb-sep { margin:0 6px; color:var(--vmob-faint); }

        .sa3mob-tabs { display:flex; gap:6px; overflow-x:auto; padding-bottom:2px; margin-top:12px; }
        .sa3mob-tab { all:unset; box-sizing:border-box; flex-shrink:0; padding:7px 13px; font-size:12px; font-weight:700; border-radius:999px; background:var(--vmob-panel); border:1px solid var(--vmob-line); color:var(--vmob-soft); cursor:pointer; }
        .sa3mob-tab.is-active { background:var(--vmob-accent); border-color:var(--vmob-accent); color:#fff; }

        .sa3mob-objective { font-size:12px; color:var(--vmob-soft); line-height:1.6; margin:0; }

        .sa3mob-kpi-list { display:flex; flex-direction:column; gap:10px; }
        .sa3mob-kpi-card { border-left:3px solid var(--vmob-line); }
        .sa3mob-kpi-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:10px; }
        .sa3mob-kpi-name { font-size:13px; font-weight:800; color:var(--vmob-text); }
        .sa3mob-kpi-metrics { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
        .sa3mob-metric-lbl { display:block; font-size:9.5px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:var(--vmob-faint); }
        .sa3mob-metric-val { display:block; font-size:13px; font-weight:800; color:var(--vmob-text); margin-top:2px; }
        .sa3mob-kpi-acc { margin-top:10px; padding-top:9px; border-top:1px solid var(--vmob-line); font-size:11px; color:var(--vmob-faint); display:flex; justify-content:space-between; gap:8px; }
        .sa3mob-kpi-acc b { color:var(--vmob-soft); font-weight:700; }

        .sa3mob-plan { margin-top:12px; padding-top:11px; border-top:1px solid var(--vmob-line); }
        .sa3mob-plan-title { font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--vmob-faint); margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; }
        .sa3mob-action-row { padding:9px 0; border-top:1px solid var(--vmob-line); }
        .sa3mob-action-row:first-child { border-top:none; padding-top:0; }
        .sa3mob-action-title { font-size:12px; font-weight:700; color:var(--vmob-text); }
        .sa3mob-action-meta { font-size:10.5px; color:var(--vmob-faint); margin-top:3px; }
        .sa3mob-action-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:6px; }
      `;
      document.head.appendChild(s);
    }

    // ---------------------------------------------------------------- data

    async function ensureOrg() {
      if (!orgId) orgId = await resolveOrganizationId();
      return orgId;
    }

    async function fetchRest(table, query) {
      const response = await authenticatedFetch(`${supabaseApiUrl}/rest/v1/${table}?${query}`);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
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

    function periodKey() { return `${year}-${month}`; }

    async function loadOverview() {
      loading = true; error = ""; render();
      try {
        await ensureOrg();
        overview = await callSupabaseRpc("strategic_get_overview", {
          p_organization_id: orgId, p_year: year, p_month: month
        });
        loadedOverviewKey = periodKey();
      } catch (err) {
        error = friendlyError(err);
      } finally {
        loading = false; render();
      }
    }

    // isRoot=true: veio da lista de áreas (sempre uma A3-mãe) -- reseta abas.
    // isRoot=false: clique numa aba (Consolidado/filho) dentro do próprio
    // Detalhe, mantendo a3RootId/a3Children já carregados.
    async function loadDetail(a3Id, isRoot) {
      loading = true; error = ""; screen = "detail"; activeA3Id = a3Id;
      if (isRoot) { a3RootId = a3Id; a3Children = []; }
      if (a3Detail?.a3?.id !== a3Id) a3Detail = null;
      render();
      try {
        await ensureOrg();
        a3Detail = await callSupabaseRpc("strategic_get_a3_detail", {
          p_organization_id: orgId, p_a3_id: a3Id, p_year: year, p_month: month
        });
        if (isRoot) a3Children = a3Detail?.children || [];
        loadedDetailKey = periodKey();
        await loadActions(a3Id);
        await ensureOrgUsers();
      } catch (err) {
        error = friendlyError(err);
      } finally {
        loading = false; render();
      }
    }

    // Mesma consulta/filtro de loadActionsForA3 (strategicModule.js) -- ação
    // vinculada ao A3 direto (strategic_action_a3) OU a algum KPI dele
    // (strategic_action_kpis). O agrupamento por KPI (Plano de ação de CADA
    // indicador) usa só o vínculo por KPI, igual renderKpiBlock do desktop.
    async function loadActions(a3Id) {
      const kpiIds = (a3Detail?.kpis || []).map((k) => k.id);
      if (!kpiIds.length) { actions = []; return; }
      const rows = await fetchRest(
        "strategic_actions",
        `organization_id=eq.${orgId}&select=*,strategic_action_kpis(kpi_id),strategic_action_a3(a3_id),strategic_action_owners(user_id)&order=due_date.asc.nullslast`
      );
      actions = (rows || []).filter((a) =>
        (a.strategic_action_a3 || []).some((l) => l.a3_id === a3Id) ||
        (a.strategic_action_kpis || []).some((l) => kpiIds.includes(l.kpi_id))
      );
    }

    async function ensureOrgUsers() {
      if (orgUsers) return;
      try {
        orgUsers = await fetchRest(
          "user_profiles",
          `organization_id=eq.${orgId}&is_active=eq.true&select=user_id,full_name,email&order=full_name.asc`
        );
      } catch (_) {
        orgUsers = [];
      }
    }

    function ownerNameById(userId) {
      const u = (orgUsers || []).find((x) => x.user_id === userId);
      return u ? (u.full_name || u.email || "Usuário") : null;
    }

    function actionsForKpi(kpiId) {
      // Mesmo corte "viajar no tempo" do desktop (renderKpiBlock): ação
      // criada DEPOIS do mês em foco ainda não existia naquele ponto do
      // tempo, não aparece revisando um mês passado.
      const cutoff = new Date(year, month, 1);
      return actions.filter((a) =>
        (a.strategic_action_kpis || []).some((l) => l.kpi_id === kpiId) &&
        (!a.created_at || new Date(a.created_at) < cutoff)
      );
    }

    // ---------------------------------------------------------------- helpers de apresentação

    function monthAbbrev(m) { return MONTH_ABBR[m - 1] || ""; }

    function periodStepper() {
      return '<div class="sa3mob-period">' +
        '<button type="button" data-action="period-prev" aria-label="Mês anterior">&lsaquo;</button>' +
        '<span class="sa3mob-period-label">' + monthAbbrev(month) + "/" + year + "</span>" +
        '<button type="button" data-action="period-next" aria-label="Próximo mês">&rsaquo;</button>' +
        "</div>";
    }

    function statusPillHtml(status) {
      const meta = STATUS_META[status] || STATUS_META.not_available;
      const color = TONE_COLOR[meta.tone] || "var(--vmob-faint)";
      return '<span class="sa3mob-pill" style="background:color-mix(in srgb, ' + color + ' 16%, transparent); color:' + color + '">' + escapeHtml(meta.label) + "</span>";
    }

    function actionPillHtml(status) {
      const label = (ACTION_STATUS_OPTIONS.find((o) => o.value === status) || {}).label || status;
      const tone = ACTION_STATUS_TONE[status] || "muted";
      const color = TONE_COLOR[tone] || "var(--vmob-faint)";
      const strike = tone === "cancel" ? "text-decoration:line-through;" : "";
      return '<span class="sa3mob-pill" style="' + strike + 'background:color-mix(in srgb, ' + color + ' 16%, transparent); color:' + color + '">' + escapeHtml(label) + "</span>";
    }

    // ---------------------------------------------------------------- telas

    function screenOverview() {
      const north = overview?.northGoals || [];
      const areas = overview?.areas || [];
      const northRows = north.map((g) => (
        '<div class="sa3mob-north-row"><span class="sa3mob-north-title">' + escapeHtml(g.title) + '</span><span class="sa3mob-north-value">' + escapeHtml(g.targetLabel || "—") + "</span></div>"
      )).join("");

      const areaRows = areas.map((a) => {
        const total = a.totalKpis || 0;
        const onTarget = a.onTargetCount || 0;
        // "Sem dado" (not_available) sai do denominador -- mesma regra do
        // desktop (renderOverviewScreen).
        const withData = total - (a.notAvailableCount || 0);
        const ratio = withData ? onTarget / withData : null;
        const tone = ratio === null ? "muted" : ratio === 1 ? "pos" : "neg";
        const color = TONE_COLOR[tone] || "var(--vmob-faint)";
        const sub = total + " indicador" + (total === 1 ? "" : "es") +
          (a.childrenCount ? (" &middot; " + a.childrenCount + " A3 filho" + (a.childrenCount === 1 ? "" : "s")) : "");
        const pillLabel = ratio === null ? "Sem dado" : (onTarget + "/" + withData + " dentro da meta");
        return '<button type="button" class="sa3mob-area-row" style="--vmob-card-accent:' + escapeHtml(a.color || "#4f7cff") + '" data-action="open-detail" data-a3-id="' + escapeHtml(a.id) + '">' +
          '<span class="sa3mob-area-icon">' + escapeHtml((a.name || "?").slice(0, 1)) + "</span>" +
          '<span class="sa3mob-area-id"><span class="sa3mob-area-name">A3 ' + escapeHtml(a.name) + '</span><span class="sa3mob-area-sub">' + sub + "</span></span>" +
          '<span class="sa3mob-pill" style="background:color-mix(in srgb, ' + color + ' 16%, transparent); color:' + color + '">' + pillLabel + "</span>" +
          '<svg class="vmob-chev" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          "</button>";
      }).join("");

      return '<div class="vmob-crumbbar">' +
        '<h2 class="vmob-level-title vmob-level-title-center" tabindex="-1">A3 Estratégicos</h2>' +
        periodStepper() + "</div>" +
        '<div class="vmob-section"><div class="vmob-card"><div class="vmob-section-head"><span class="vmob-section-title">Norte Verdadeiro</span></div>' +
        '<div class="sa3mob-north-grid">' + (northRows || '<p class="vmob-empty" style="padding:8px 0">Nenhuma meta cadastrada.</p>') + "</div></div></div>" +
        '<div class="vmob-section"><div class="vmob-section-head"><span class="vmob-section-title">Áreas</span><span class="vmob-section-count">' + areas.length + "</span></div>" +
        '<div class="sa3mob-area-list">' + (areaRows || '<p class="vmob-empty">Nenhuma área cadastrada pra este ciclo.</p>') + "</div></div>";
    }

    function crumbHtml() {
      const parts = [{ label: "A3 Estratégicos", action: "back-overview" }];
      if (a3Detail?.a3) parts.push({ label: a3Detail.a3.name, action: null });
      const html = parts.map((p, i) => {
        const isLast = i === parts.length - 1;
        if (isLast) return '<span class="sa3mob-crumb-current" aria-current="page" tabindex="-1">' + escapeHtml(p.label) + "</span>";
        return '<button type="button" data-action="' + p.action + '">' + escapeHtml(p.label) + '</button><span class="sa3mob-crumb-sep">&rsaquo;</span>';
      }).join("");
      return '<nav class="sa3mob-crumb" aria-label="Caminho de navegação">' + html + "</nav>";
    }

    function tabsHtml() {
      if (!a3Children.length) return "";
      const rootName = (a3Detail?.a3?.id === a3RootId ? a3Detail.a3.name : null) || "Consolidado";
      const rootLabel = a3Detail?.children?.length ? "Consolidado" : rootName;
      const tabs = [{ id: a3RootId, name: rootLabel }].concat(a3Children.map((c) => ({ id: c.id, name: c.name })));
      return '<div class="sa3mob-tabs">' + tabs.map((t) => (
        '<button type="button" class="sa3mob-tab' + (t.id === activeA3Id ? " is-active" : "") + '" data-action="switch-tab" data-a3-id="' + escapeHtml(t.id) + '">' + escapeHtml(t.name) + "</button>"
      )).join("") + "</div>";
    }

    function kpiCardHtml(k) {
      const target = k.currentTarget || {};
      const opts = { unit: k.unit, comparisonMode: k.comparisonMode };
      const kpiActions = actionsForKpi(k.id);
      const actionsHtml = kpiActions.length
        ? kpiActions.map((a) => {
            const ownerNames = (a.strategic_action_owners || []).map((o) => ownerNameById(o.user_id)).filter(Boolean);
            const metaParts = [];
            if (a.due_date) metaParts.push(escapeHtml(a.due_date));
            if (a.priority) metaParts.push(escapeHtml(a.priority));
            if (a.progress !== null && a.progress !== undefined) metaParts.push(a.progress + "%");
            if (ownerNames.length) metaParts.push(escapeHtml(ownerNames.join(", ")));
            return '<div class="sa3mob-action-row"><div class="sa3mob-action-title">' + escapeHtml(a.title) + "</div>" +
              (metaParts.length ? ('<div class="sa3mob-action-meta">' + metaParts.join(" &middot; ") + "</div>") : "") +
              '<div class="sa3mob-action-foot">' + actionPillHtml(a.status) + "</div></div>";
          }).join("")
        : '<p class="vmob-empty" style="padding:6px 0">Nenhuma ação registrada.</p>';

      return '<div class="vmob-card sa3mob-kpi-card">' +
        '<div class="sa3mob-kpi-head"><span class="sa3mob-kpi-name">' + escapeHtml(k.name) + "</span>" + statusPillHtml(k.status) + "</div>" +
        '<div class="sa3mob-kpi-metrics">' +
        '<div><span class="sa3mob-metric-lbl">Real do mês</span><span class="sa3mob-metric-val">' + formatByUnit(k.currentResult, k.unit, k.decimalPlaces) + "</span></div>" +
        '<div><span class="sa3mob-metric-lbl">Meta do mês</span><span class="sa3mob-metric-val">' + formatByUnit(target.value, k.unit, k.decimalPlaces) + "</span></div>" +
        '<div><span class="sa3mob-metric-lbl">Variação</span><span class="sa3mob-metric-val">' + formatTargetVariation(k.currentResult, target.value, opts) + "</span></div>" +
        "</div>" +
        '<div class="sa3mob-kpi-acc"><span>Acumulado no ano</span><span><b>' + formatByUnit(k.accumulatedResult, k.unit, k.decimalPlaces) + '</b> / meta ' + formatByUnit(k.accumulatedTarget, k.unit, k.decimalPlaces) + "</span></div>" +
        '<div class="sa3mob-plan"><div class="sa3mob-plan-title"><span>Plano de ação</span><span>' + kpiActions.length + "</span></div>" + actionsHtml + "</div>" +
        "</div>";
    }

    function screenDetail() {
      const a3 = a3Detail?.a3;
      if (!a3) return screenEmpty();
      const kpis = a3Detail?.kpis || [];
      const kpisHtml = kpis.length
        ? kpis.map((k) => kpiCardHtml(k)).join("")
        : '<p class="vmob-empty">Nenhum indicador cadastrado nesta A3.</p>';
      return '<div class="vmob-crumbbar">' + crumbHtml() +
        '<h2 class="vmob-level-title" tabindex="-1">A3 ' + escapeHtml(a3.name) + "</h2>" +
        periodStepper() + tabsHtml() +
        (a3.objective ? ('<p class="sa3mob-objective">' + escapeHtml(a3.objective) + "</p>") : "") +
        "</div>" +
        '<div class="vmob-section"><div class="vmob-section-head"><span class="vmob-section-title">Indicadores</span><span class="vmob-section-count">' + kpis.length + "</span></div>" +
        '<div class="sa3mob-kpi-list">' + kpisHtml + "</div></div>";
    }

    function screenEmpty() {
      return '<div class="vmob-crumbbar">' + crumbHtml() + "</div>" +
        '<p class="vmob-empty">A3 não encontrada ou sem acesso.</p>';
    }

    function screenLoading() {
      return '<div class="vmob-loading"><div class="vmob-loading-spinner"></div><span>Carregando seus dados...</span></div>';
    }

    function screenError() {
      return '<div class="vmob-crumbbar">' + (screen === "detail" ? crumbHtml() : "") + "</div>" +
        '<p class="vmob-empty">' + escapeHtml(error) + "</p>" +
        '<div style="text-align:center"><button type="button" class="vmob-state-btn" data-action="retry">Tentar de novo</button></div>';
    }

    // ---------------------------------------------------------------- render raiz + eventos

    function render() {
      if (!containerEl) return;
      ensureStyle();
      let html;
      if (loading && !((screen === "overview" && overview) || (screen === "detail" && a3Detail))) html = screenLoading();
      else if (error) html = screenError();
      else if (screen === "detail") html = screenDetail();
      else html = screenOverview();
      containerEl.innerHTML = '<div class="sa3mob">' + html + "</div>";
    }

    function afterNav() {
      render();
      const title = containerEl && containerEl.querySelector(".vmob-level-title, .sa3mob-crumb-current");
      if (title) title.focus();
    }

    function reloadCurrentScreen() {
      if (screen === "detail" && activeA3Id) loadDetail(activeA3Id, activeA3Id === a3RootId);
      else loadOverview();
    }

    function handleClick(event) {
      const el = event.target.closest("[data-action]");
      if (!el || !containerEl || !containerEl.contains(el)) return;
      const action = el.dataset.action;
      if (action === "open-detail") { loadDetail(el.dataset.a3Id, true); }
      else if (action === "back-overview") { screen = "overview"; a3Detail = null; a3RootId = null; a3Children = []; activeA3Id = null; afterNav(); if (loadedOverviewKey !== periodKey()) loadOverview(); }
      else if (action === "switch-tab") { if (el.dataset.a3Id !== activeA3Id) loadDetail(el.dataset.a3Id, false); }
      else if (action === "period-prev") { shiftPeriod(-1); }
      else if (action === "period-next") { shiftPeriod(1); }
      else if (action === "retry") { error = ""; reloadCurrentScreen(); }
    }

    function shiftPeriod(delta) {
      let m = month + delta, y = year;
      if (m < 1) { m = 12; y -= 1; }
      if (m > 12) { m = 1; y += 1; }
      month = m; year = y;
      reloadCurrentScreen();
    }

    // ---------------------------------------------------------------- public

    function mount(container) {
      containerEl = container;
      if (!entered) {
        const today = new Date();
        year = today.getFullYear();
        month = today.getMonth() + 1;
        screen = "overview";
        overview = null; a3Detail = null; a3RootId = null; a3Children = []; activeA3Id = null;
        actions = []; orgUsers = null; error = "";
        entered = true;
      }
      containerEl.removeEventListener("click", handleClick);
      containerEl.addEventListener("click", handleClick);
      if (screen === "detail" && activeA3Id) {
        if (loadedDetailKey === periodKey() && a3Detail) render();
        else loadDetail(activeA3Id, activeA3Id === a3RootId);
      } else if (loadedOverviewKey === periodKey() && overview) {
        render();
      } else {
        loadOverview();
      }
    }

    function unmount() {
      if (containerEl) containerEl.removeEventListener("click", handleClick);
      containerEl = null;
      entered = false;
    }

    return { mount, unmount };
  }

  window.VECTON_STRATEGIC_MOBILE = { createStrategicMobileModule };
})(window);
