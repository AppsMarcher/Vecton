(function attachOpexReviewModule(window) {
  "use strict";
  // Coordenação do módulo: decora o Cockpit (sinaleira e ícones), abre "Analisar variação" com rascunho preservado
  // entre abas, controla conflitos de versão e devolve o usuário ao drilldown do mesmo grupo.
  const norm = value => String(value ?? "").replace(/\D/g, "");
  const newKey = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  function createOpexReviewModule({ service, confirm, toast, getCostCenters, openReport, setMyActionsVisible, signalRoot, setSignalMenuVisible }) {
    const PLAN = () => window.VECTON_OPEX_REVIEW_PLAN, ATT = () => window.VECTON_OPEX_REVIEW_ATTACHMENTS;
    const C = window.VECTON_OPEX_REVIEW_CORE, V = window.VECTON_OPEX_REVIEW_VIEWS;
    let decorateToken = 0, host = null, panel = null, onDocKey = null;
    const attach = value => { host = value; };
    // Legenda padrão (.cockpit-tip) com cartão PRÓPRIO do módulo: as telas do OPEX moram na Central de Relatórios e não podem
    // depender do Cockpit (o gancho do Cockpit existe desde o início, mas só funciona depois que a tela dele é montada).
    let ownTip = null;
    function bindTips(node) {
      const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
      const tip = () => { if (!ownTip) { ownTip = document.createElement("div"); ownTip.id = "opex-tip"; ownTip.className = "cockpit-tip"; ownTip.hidden = true; document.body.appendChild(ownTip); } return ownTip; };
      const show = point => {
        let rows = [];
        try { rows = JSON.parse(point.dataset.tipRows || "[]"); } catch { rows = []; }
        tip().innerHTML = rows.map(row => `<div class="cockpit-tip-row"><span>${esc(row.label)}</span><strong${row.tone || row.wrap ? ` class="${[row.tone ? `kpi-trend ${esc(row.tone)}` : "", row.wrap ? "cockpit-tip-wrap" : ""].filter(Boolean).join(" ")}"` : ""}>${esc(row.value)}</strong></div>`).join("");
        tip().hidden = false;
      };
      const place = (x, y) => { const t = tip(), w = t.offsetWidth || 120; t.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - w - 8))}px`; t.style.top = `${Math.max(y - 64, 8)}px`; };
      const hide = () => { if (ownTip) ownTip.hidden = true; };
      node.addEventListener("pointerover", event => { const p = event.target.closest("[data-tip]"); if (p) show(p); });
      node.addEventListener("pointermove", event => { if (event.target.closest("[data-tip]")) place(event.clientX, event.clientY); });
      node.addEventListener("pointerout", event => { if (event.target.closest("[data-tip]") && !event.relatedTarget?.closest?.("[data-tip]")) hide(); });
      node.addEventListener("focusin", event => { const p = event.target.closest("[data-tip]"); if (p) { show(p); const r = p.getBoundingClientRect(); place(r.left, r.top); } });
      node.addEventListener("focusout", event => { if (event.target.closest("[data-tip]")) hide(); });
    }

    /** Anexa data.review ao resultado do Cockpit. Falhas viram flags de erro: nunca "sem registro" nem R$ 0. */
    async function decorate(data) {
      const token = ++decorateToken;
      const review = { thresholds: null, thresholdsError: false, presence: new Map(), presenceError: false,
        ctx: { year: data.year, periodType: data.periodType, month: data.month, sourceKey: data.comparisonScenarioId ? `scenario:${data.comparisonScenarioId}` : null, scopeKey: "" } };
      const seen = new Set(), rows = [];
      for (const group of data.expenseGroups || []) for (const account of group.accounts || []) {
        if (!account.ccId) continue;
        const key = `${account.ccId}|${account.code}`;
        if (!seen.has(key)) { seen.add(key); rows.push({ cc: account.ccId, account: account.code }); }
      }
      const [thresholds, presence] = await Promise.allSettled([service.thresholds(), service.presence(review.ctx, rows)]);
      if (thresholds.status === "fulfilled") review.thresholds = thresholds.value; else review.thresholdsError = true;
      if (presence.status === "fulfilled") review.presence = presence.value; else review.presenceError = true;
      if (token !== decorateToken) return null;
      data.review = review;
      return review;
    }
    function invalidate() { service.invalidate(); }


    // ---------------------------------------------------------------- telas próprias: Minhas ações e consolidado
    // As telas moram na Central de Relatórios (seção OPEX): cada abertura monta uma instância nova no painel de detalhe.
    let myView = null, hubView = null, entry = null, pendingFocus = null, myAvailable = false;
    const setMy = visible => { myAvailable = Boolean(visible); setMyActionsVisible?.(myAvailable); };
    function renderReport(panelEl, reportId) {
      if (reportId !== "opexAnalises" && reportId !== "minhasAcoes") return false;
      const wrap = document.createElement("div");
      wrap.className = "opex-report-host";
      panelEl.innerHTML = "";
      panelEl.appendChild(wrap);
      const pane = name => { const node = document.createElement("div"); node.className = "opex-split-pane"; node.dataset.pane = name; wrap.appendChild(node); bindTips(node); return node; };
      const mountMine = node => {
        myView = window.VECTON_OPEX_REVIEW_MYACTIONS.createMyActionsView({ service, root: node, toast, confirm, onChanged: () => { void refreshMyActionsVisibility(); } });
        if (pendingFocus) { myView.focus(pendingFocus); pendingFocus = null; }
        void myView.show();
      };
      if (reportId === "minhasAcoes") { mountMine(pane("mine")); return true; }
      // Análises e planos de ação: dois cartões empilhados, "Minhas ações" primeiro (quem tem tarefa) e o consolidado abaixo; a página rola inteira.
      wrap.classList.toggle("opex-split", myAvailable);
      if (myAvailable) mountMine(pane("mine"));
      else myView = null;
      hubView = window.VECTON_OPEX_REVIEW_HUB.createHubView({ service, root: pane("hub"), getCostCenters, toast, confirm,
        openAnalysis: record => openAnalysisFromRecord(record, { tab: record.type === "action" ? "plan" : "cause", focusActionId: record.type === "action" ? record.id : null }) });
      void hubView.show();
      return true;
    }
    // "Minhas ações" aparece para quem tem tarefa (ou entrega para validar), sem liberar nenhum relatório financeiro.
    async function refreshMyActionsVisibility() {
      try { const r = await service.myActions({ limit: 1, status: null }, null); const any = r.total > 0 || (await service.myActions({ status: "completed", limit: 1 }, null)).total > 0; setMy(any); }
      catch { /* mantém o estado atual */ }
    }
    // Já estando em "Minhas ações" (ex.: clicar numa notificação nessa tela), a navegação não re-renderiza: mostra direto.
    function openAction(id) {
      setMy(true);
      if (myView?.isShown?.()) { myView.focus(id); void myView.show(); return; }
      pendingFocus = id;
      openReport?.("minhasAcoes");
    }
    function openMyActions() { setMy(true); openReport?.("minhasAcoes"); }
    function openHub() { openReport?.("opexAnalises"); }
    function runEntry() {
      entry = entry || window.VECTON_OPEX_REVIEW_ENTRY.createEntryPopover({ service, toast, openAction, openMyActions });
      return entry.run();
    }
    function resetSession() { myView = null; hubView = null; entry = null; pendingFocus = null; signalShown = false; params = null; setMy(false); setSignalMenuVisible?.(false); }
    const hasDirtyForm = () => Boolean(panel && dirty());

    // ---------------------------------------------------------------- Parâmetros da sinaleira (Parâmetros → Sinaleira OPEX)
    let params = null, signalShown = false;
    const parseNum = text => { const clean = String(text ?? "").trim().replace(/\./g, "").replace(",", "."); return clean === "" ? NaN : Number(clean); };
    const directionOf = values => (values.above && values.below ? "both" : values.below ? "under" : values.above ? "over" : null);
    const paramFormat = (key, n) => n.toLocaleString("pt-BR", key.endsWith("Pct") ? { minimumFractionDigits: 1, maximumFractionDigits: 2 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const paintParams = () => { if (params) params.root.innerHTML = `<section class="content-card opex-screen opex-signal-screen">${V.paramsPanel({ ...params, inline: true })}</section>`; };
    // Chamado a cada renderNavigation: só monta quando a tela ENTRA (não a cada re-render).
    function renderSignalView(activeView) {
      if (activeView !== "opexSignal") { signalShown = false; params = null; return; }
      if (signalShown) return;
      signalShown = true;
      void mountSignalScreen();
    }
    async function mountSignalScreen() {
      const root = signalRoot;
      if (!root) return;
      root.innerHTML = '<section class="content-card opex-screen"><div class="opex-empty" role="status">Carregando…</div></section>';
      let thresholds;
      try { thresholds = await service.thresholds(); }
      catch { if (signalShown) root.innerHTML = '<section class="content-card opex-screen"><div class="opex-empty" role="alert">Não foi possível carregar os parâmetros da sinaleira.</div></section>'; return; }
      if (!signalShown) return;
      params = { root, thresholds, values: { ...thresholds, above: thresholds.direction !== "under", below: thresholds.direction !== "over" }, saving: false };
      paintParams();
      if (root.dataset.opexBound) return;
      root.dataset.opexBound = "1";
      root.addEventListener("input", event => { const f = event.target.closest("[data-p]"); if (f && params) params.values[f.dataset.p] = f.type === "checkbox" ? f.checked : f.value; });
      // Ao sair do campo, mostra no padrão pt-BR (10.000,00 / 10,0) quando o número é válido.
      root.addEventListener("focusout", event => {
        const f = event.target.closest("input[data-p]");
        if (!f || !params) return;
        const n = parseNum(f.value);
        if (Number.isFinite(n)) { f.value = paramFormat(f.dataset.p, n); params.values[f.dataset.p] = f.value; }
      });
      root.addEventListener("click", event => { if (event.target.closest("[data-opex-params-save]")) void saveParameters(); });
    }
    async function saveParameters() {
      if (!params || params.saving) return;
      const mine = params;
      const next = { yellowMoney: parseNum(mine.values.yellowMoney), yellowPct: parseNum(mine.values.yellowPct), redMoney: parseNum(mine.values.redMoney), redPct: parseNum(mine.values.redPct), direction: directionOf(mine.values) };
      const valid = C.validateThresholds(next);
      const show = message => { const node = mine.root.querySelector("[data-opex-banner]"); if (node) { node.hidden = !message; node.textContent = message || ""; } };
      if (!next.direction) { show("Marque ao menos um sentido a sinalizar."); return; }
      if (!valid.ok) { show(valid.error); return; }
      mine.saving = true; paintParams(); show("");
      try {
        await service.saveThresholds(next, mine.thresholds.version);
        if (params !== mine) return;
        mine.thresholds = await service.thresholds();
        mine.saving = false; paintParams();
        toast?.("Parâmetros salvos.");
      } catch (error) {
        if (params !== mine) return;
        const info = service.parseError(error);
        mine.saving = false; paintParams();
        show(info.kind === "conflict" ? "Os parâmetros foram alterados por outra pessoa. Saia e abra novamente." : info.kind === "forbidden" ? "Somente administradores alteram os parâmetros." : `Não foi possível salvar: ${info.message}`);
      }
    }
    // O item "Sinaleira OPEX" do menu Parâmetros só aparece para quem edita (administrador/super administrador, decidido pelo servidor).
    async function refreshSignalMenu() {
      try { const t = await service.thresholds(); setSignalMenuVisible?.(Boolean(t.canEdit)); }
      catch { /* mantém o estado atual */ }
    }

    // ---------------------------------------------------------------- Analisar variação
    const fmtImpact = n => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const draftFrom = analysis => ({
      nature: analysis?.nature || "", analysisState: analysis?.analysisState || "in_analysis", monitor: Boolean(analysis?.monitor),
      cause: analysis?.cause || "", futureEffect: analysis?.futureEffect || "",
      impact: analysis?.expectedFinancialImpact != null ? fmtImpact(Number(analysis.expectedFinancialImpact)) : ""
    });
    const parseImpact = text => {
      const clean = String(text || "").trim();
      if (!clean) return { ok: true, value: null };
      const value = Number(clean.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(value) && value >= 0 ? { ok: true, value } : { ok: false, value: null };
    };

    // Abertura a partir do drilldown do Cockpit: contexto = filtros do Cockpit + linha conta × CC.
    function openAnalysis({ data, group, account, sort }) {
      if (!account.ccId || !data.comparisonScenarioId) { toast?.("Não há fonte de comparação para registrar esta análise."); return; }
      openPanel({
        ctx: { costCenterId: account.ccId, accountNumber: account.code, year: data.year, periodType: data.periodType, month: data.month,
          sourceKey: `scenario:${data.comparisonScenarioId}`, scopeKey: "", groupName: group.name, accountName: account.name },
        account, groupName: group.name, comparisonLabel: data.comparisonLabel, actualLabel: data.valueLabel || "Real", sourceLabel: data.comparisonLabel,
        onBack: () => host?.reopenGroupDrilldown?.(group.name, sort), onSaved: async () => { service.invalidate(); await host?.refresh?.(); }
      });
    }
    // Abertura a partir do consolidado: restaura o contexto SALVO (fonte/ano/competência), nunca o filtro atual do Cockpit.
    function openAnalysisFromRecord(record, { tab, focusActionId, onBack } = {}) {
      openPanel({
        ctx: { costCenterId: record.costCenterId, accountNumber: record.accountNumber, year: record.year, periodType: record.periodType, month: record.month,
          sourceKey: record.sourceKey, scopeKey: "", groupName: record.groupName || "", accountName: record.accountName || "" },
        account: { code: record.accountNumber, name: record.accountName || "", ccId: record.costCenterId, ccNumber: record.costCenterNumber, ccName: record.costCenterName },
        groupName: record.groupName || "—", comparisonLabel: record.sourceLabel || "Comparativo", actualLabel: record.periodType === "year" ? "Forecast" : "Real", sourceLabel: record.sourceLabel || "—",
        tab, focusActionId, onBack
      });
    }
    function openPanel(spec) {
      closePanel(true);
      const { ctx, account } = spec;
      const state = { ctx, account, groupName: spec.groupName, tab: spec.tab || "cause", focusActionId: spec.focusActionId || null, draft: draftFrom(null), baseline: draftFrom(null), version: 0, canWrite: false,
        dataChanged: false, saving: false, loading: true, loadError: false, idemKey: null, savedOnce: false, presenceDirty: false,
        ledger: null, analysisId: null, live: null, planCtl: null, attCtl: null, comparisonLabel: spec.comparisonLabel, actualLabel: spec.actualLabel, sourceLabel: spec.sourceLabel, actionCount: 0, planHtml: "" };
      const root = document.createElement("div");
      root.className = "ger-audit-popover opex-analysis-pop";
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-label", `Analisar variação — ${account.code} ${account.name}`);
      root.tabIndex = -1;
      const origin = document.activeElement;
      document.body.appendChild(root);
      panel = { root, state, origin, spec };
      renderShell();
      root.addEventListener("click", onClick);
      root.addEventListener("input", onInput);
      root.addEventListener("change", onInput);
      // Ao sair do campo de impacto, mostra no padrão pt-BR (1.500,50) quando o número é válido.
      root.addEventListener("focusout", event => {
        const field = event.target.closest('input[data-f="impact"]');
        if (!field || !panel) return;
        const parsed = parseImpact(field.value);
        if (parsed.ok && parsed.value != null) { field.value = fmtImpact(parsed.value); onInput({ target: field }); }
      });
      bindTips(root);
      onDocKey = event => { if (event.key === "Escape" && panel) { if (panel.root.querySelector(".opex-picker-list:not([hidden])")) return; event.stopPropagation(); void requestClose(); } };
      document.addEventListener("keydown", onDocKey, true);
      root.focus();
      void load();
    }

    const dirty = () => {
      if (!panel) return false;
      const { draft, baseline } = panel.state;
      return Object.keys(draft).some(key => draft[key] !== baseline[key]);
    };
    function renderShell() {
      const { root, state } = panel;
      state.dirty = dirty();
      root.innerHTML = V.panelShell({ ...state, summary: summaryOf(state) });
      renderTab();
      mountAttachments();
    }
    function renderTab() {
      const { root, state } = panel;
      state.dirty = dirty();
      root.querySelectorAll("[data-opex-tab]").forEach(button => button.setAttribute("aria-selected", String(button.dataset.opexTab === state.tab)));
      const draftBadge = root.querySelector('[data-opex-tab="cause"]');
      if (draftBadge) draftBadge.innerHTML = `Analisar variação${state.dirty ? ' <span class="opex-draft">Rascunho</span>' : ""}`;
      const body = root.querySelector("[data-opex-body]");
      if (state.loading) { body.innerHTML = '<div class="opex-empty" role="status">Carregando análise…</div>'; return; }
      if (state.loadError) { body.innerHTML = '<div class="opex-empty" role="alert">Não foi possível carregar a análise. <button type="button" class="ghost-button" data-opex-reload>Tentar novamente</button></div>'; return; }
      state.planCtl?.destroy(); state.planCtl = null;
      if (state.tab === "plan") { body.innerHTML = ""; mountPlan(body); return; }
      body.innerHTML = state.tab === "cause" ? V.causeTab(state) : V.ledgerTab(state);
    }
    // Resumo do contexto: valores do servidor (mesmo cálculo do snapshot) quando disponíveis; antes disso, os do Cockpit.
    function summaryOf(state) {
      const live = state.live;
      if (live && (live.actual != null || live.comparison != null)) return { actual: live.actual == null ? null : Number(live.actual), comparison: live.comparison == null ? null : Number(live.comparison), variance: live.variance == null ? null : Number(live.variance), variancePct: live.variance_pct == null ? null : Number(live.variance_pct) };
      const a = state.account;
      return { actual: a.actual ?? null, comparison: a.budget ?? null, variance: a.variance ?? null, variancePct: a.variancePercent == null ? null : a.variancePercent * 100 };
    }
    function updateSummary() {
      const node = panel?.root.querySelector(".opex-summary");
      if (!node) return;
      const tmp = document.createElement("div");
      tmp.innerHTML = V.panelShell({ ...panel.state, summary: summaryOf(panel.state) });
      node.replaceWith(tmp.querySelector(".opex-summary"));
    }
    function updateTabCount() {
      const tab = panel?.root.querySelector('[data-opex-tab="plan"]');
      if (tab) tab.textContent = `Plano de ação${panel.state.actionCount ? ` · ${panel.state.actionCount}` : ""}`;
    }
    function mountPlan(body) {
      const state = panel.state, mine = panel;
      state.planCtl = PLAN().mountPlanTab(body, {
        service, ctx: state.ctx, costCenterId: state.ctx.costCenterId, canWrite: state.canWrite, toast, confirm, focusActionId: state.focusActionId,
        getAnalysisId: () => state.analysisId,
        onAnalysisId: id => { if (id && state.analysisId !== id) { state.analysisId = id; mountAttachments(); } },
        onCount: n => { if (panel === mine) { state.actionCount = n; updateTabCount(); } },
        onChanged: () => { state.presenceDirty = true; }
      });
    }
    // "Anexos da análise": fica abaixo do conteúdo das abas. Só existe depois que a análise foi salva (ou criada por uma ação).
    function mountAttachments() {
      if (!panel) return;
      const { state, root } = panel, host = root.querySelector("[data-opex-attachments]");
      if (!host || !ATT()) return;
      state.attCtl?.destroy();
      state.attCtl = ATT().mountAttachments(host, { service, entity: state.analysisId ? { type: "analysis", id: state.analysisId } : null, title: "Anexos da análise",
        canUpload: state.canWrite, canRemove: state.canWrite, needsSaveFirst: "Salve a análise antes de anexar arquivos.", toast, confirm });
    }
    function banner(message) {
      const node = panel?.root.querySelector("[data-opex-banner]");
      if (!node) return;
      node.hidden = !message;
      node.innerHTML = message || "";
    }

    async function load(keepDraft = false) {
      const { state } = panel, mine = panel;
      state.loading = true; state.loadError = false; renderTab();
      try {
        const result = await service.getAnalysis(state.ctx);
        if (panel !== mine) return;
        state.canWrite = Boolean(result.canWrite);
        state.live = result.live || null;
        state.analysisId = result.found ? result.id : state.analysisId;
        if (result.found) {
          state.version = Number(result.version);
          state.dataChanged = Boolean(result.dataChangedSinceReview);
          state.baseline = draftFrom(result);
          if (!keepDraft) state.draft = draftFrom(result);
        } else { state.version = 0; state.dataChanged = false; state.baseline = draftFrom(null); if (!keepDraft) state.draft = draftFrom(null); }
        state.loading = false;
        banner("");
        updateSummary(); mountAttachments();
        service.actionsForAnalysis(state.ctx).then(list => { if (panel === mine) { state.actionCount = list.length; updateTabCount(); } }).catch(() => {});
      } catch (error) {
        if (panel !== mine) return;
        state.loading = false; state.loadError = true;
        if (service.parseError(error).kind === "forbidden") { state.loadError = false; state.canWrite = false; banner("Sem acesso a este centro de custo."); }
      }
      renderTab();
    }

    function onInput(event) {
      const field = event.target.closest("[data-f]");
      if (!field || !panel) return;
      const key = field.dataset.f;
      panel.state.draft[key] = field.type === "checkbox" ? field.checked : field.value;
      panel.state.idemKey = null; // conteúdo mudou: a próxima tentativa é uma nova operação
      const badge = panel.root.querySelector('[data-opex-tab="cause"]');
      panel.state.dirty = dirty();
      if (badge) badge.innerHTML = `Analisar variação${panel.state.dirty ? ' <span class="opex-draft">Rascunho</span>' : ""}`;
    }

    async function onClick(event) {
      if (!panel) return;
      const state = panel.state;
      if (event.target.closest("[data-opex-close]")) { await requestClose(); return; }
      if (event.target.closest("[data-opex-back]")) { await requestClose(true); return; }
      const tab = event.target.closest("[data-opex-tab]");
      if (tab) { state.tab = tab.dataset.opexTab; renderTab(); if (state.tab === "ledger" && !state.ledger) void loadLedger(); return; }
      if (event.target.closest("[data-opex-reload]")) { void load(); return; }
      if (event.target.closest("[data-opex-ledger-retry]")) { void loadLedger(); return; }
      if (event.target.closest("[data-opex-reload-keep]")) { banner(""); await load(true); return; }
      const sortTh = event.target.closest(".opex-ledger th[data-sort]");
      if (sortTh && state.ledger) {
        const key = sortTh.dataset.sort;
        state.ledger.sort = { key, dir: state.ledger.sort.key === key ? -state.ledger.sort.dir : 1 };
        renderTab();
        return;
      }
      if (event.target.closest("[data-opex-save]")) await save();
    }

    async function loadLedger() {
      const state = panel.state, mine = panel;
      state.ledger = { status: "loading", rows: [], sort: { key: "entry_date", dir: 1 } };
      renderTab();
      try {
        const rows = await service.loadLedger(state.ctx);
        if (panel !== mine) return;
        state.ledger = { ...state.ledger, status: "ready", rows: rows.map(row => ({ ...row, amount: Number(row.amount) })) };
      } catch { if (panel !== mine) return; state.ledger = { ...state.ledger, status: "error" }; }
      if (state.tab === "ledger") renderTab();
    }

    async function save() {
      const { state } = panel, mine = panel;
      if (state.saving) return;
      const impact = parseImpact(state.draft.impact);
      if (!state.draft.cause.trim()) { banner("Informe a causa da variação."); return; }
      if (state.draft.analysisState === "analyzed" && !state.draft.nature) { banner("Informe a natureza da variação."); return; }
      if (!impact.ok) { banner("Informe um impacto financeiro válido (valor não negativo)."); return; }
      state.saving = true; banner(""); renderTab();
      if (!state.idemKey) state.idemKey = newKey(); // retry do mesmo conteúdo reaproveita a chave
      try {
        const saved = await service.saveAnalysis(state.ctx, {
          analysisState: state.draft.analysisState, monitor: state.draft.monitor, nature: state.draft.nature || null,
          cause: state.draft.cause, futureEffect: state.draft.futureEffect, expectedFinancialImpact: impact.value
        }, state.version, state.idemKey);
        if (panel !== mine) return;
        state.version = Number(saved.version); state.dataChanged = Boolean(saved.dataChangedSinceReview);
        state.baseline = { ...state.draft }; state.idemKey = null; state.presenceDirty = true;
        if (saved.id && state.analysisId !== saved.id) { state.analysisId = saved.id; mountAttachments(); }
        if (saved.live) { state.live = saved.live; updateSummary(); }
        toast?.("Análise salva.");
      } catch (error) {
        if (panel !== mine) return;
        const info = service.parseError(error);
        banner(info.kind === "conflict"
          ? 'A análise foi alterada por outra sessão. <button type="button" class="ghost-button" data-opex-reload-keep>Recarregar mantendo meu texto</button>'
          : window.VECTON_OPEX_REVIEW_VIEWS.esc(info.kind === "forbidden" ? "Você não tem permissão para salvar esta análise." : `Não foi possível salvar: ${info.message}`));
      } finally { if (panel === mine) { state.saving = false; renderTab(); } }
    }

    async function requestClose(goBack = false) {
      if (!panel) return;
      if (dirty() && !(await confirm?.("Há alterações não salvas nesta análise. Sair agora descarta o rascunho."))) return;
      const { presenceDirty } = panel.state, spec = panel.spec, origin = panel.origin;
      closePanel(false);
      if (presenceDirty) await spec.onSaved?.();
      if (goBack && spec.onBack) spec.onBack();
      else origin?.focus?.();
    }
    function closePanel() {
      if (!panel) return;
      document.removeEventListener("keydown", onDocKey, true);
      panel.state.planCtl?.destroy(); panel.state.attCtl?.destroy();
      panel.root.remove();
      panel = null;
    }

    return { decorate, invalidate, attach, openAnalysis, openAnalysisFromRecord, renderSignalView, refreshSignalMenu, renderReport, refreshMyActionsVisibility, openAction, openMyActions, openHub, runEntry, resetSession, hasDirtyForm, norm, hasOpenPanel: () => Boolean(panel) };
  }
  window.VECTON_OPEX_REVIEW = { createOpexReviewModule };
})(window);
