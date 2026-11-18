(function attachOpexReviewPlan(window) {
  "use strict";
  // Aba "Plano de ação" da análise: lista as ações do contexto, cria/atribui e abre a tela operacional de cada uma.
  // Só quem lê o CC chega aqui; o executor sem CC nunca vê esta aba (usa "Minhas ações").
  const A = () => window.VECTON_OPEX_REVIEW_ACTION;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  /**
   * @param container elemento hospedeiro
   * @param opts { service, ctx, costCenterId, canWrite, getAnalysisId(), onAnalysisId(id), onCount(n), onChanged(), toast, confirm, focusActionId? }
   */
  function mountPlanTab(container, opts) {
    const { service, toast, confirm } = opts;
    let actions = [], loading = true, loadError = false, selectedId = opts.focusActionId || null, detail = null, mode = "list", destroyed = false;
    let users = null, form = { title: "", assignee: "", dueDate: "", expectedResult: "", shares: new Set(), confirmShare: false }, files = null, saving = false, formKey = null, banner = "", colSort = null;
    const VW = () => window.VECTON_OPEX_REVIEW_VIEWS;
    const GETTERS = { title: a => a.title, assignee: a => a.assignee.name, due: a => a.dueDate || "", status: a => A().statusLabel(a) };
    const planHead = () => `${VW().sortTh("Ação", "title", colSort)}${VW().sortTh("Responsável", "assignee", colSort)}${VW().sortTh("Prazo", "due", colSort)}${VW().sortTh("Situação", "status", colSort)}<th scope="col"><span class="cockpit-sr-only">Abrir</span></th>`;
    const sortedActions = () => VW().sortItems(actions, GETTERS, colSort).map(x => x.r);

    function render() {
      if (destroyed) return;
      const dateBr = A().dateBr;
      container.innerHTML = `<div class="opex-plan">
        <div class="opex-plan-head">${opts.canWrite && mode === "list" ? '<button type="button" class="ghost-button opex-primary" data-plan-new>Nova ação</button>' : ""}</div>
        <div class="opex-banner" data-plan-banner role="alert"${banner ? "" : " hidden"}>${banner}</div>
        ${mode === "new" ? newForm() : loadError ? '<div class="opex-empty" role="alert">Não foi possível carregar as ações. <button type="button" class="ghost-button" data-plan-retry>Tentar novamente</button></div>'
          : loading ? '<div class="opex-empty" role="status">Carregando ações…</div>'
          : actions.length ? `<table class="gap-table opex-plan-table"><thead><tr>${planHead()}</tr></thead><tbody>${sortedActions().map(a => `<tr data-plan-row="${esc(a.id)}"${a.id === selectedId ? ' class="opex-row-selected"' : ""}><td class="gap-name">${esc(a.title)}</td><td class="gap-name">${esc(a.assignee.name)}</td><td class="gap-code">${esc(dateBr(a.dueDate))}</td><td>${A().chip(a)}</td><td><button type="button" class="opex-open-btn" data-plan-open>${a.id === selectedId ? "Fechar" : "Abrir →"}</button></td></tr>`).join("")}</tbody></table>`
          : '<div class="opex-empty" role="status">Nenhuma ação registrada.</div>'}
        <div data-plan-detail></div></div>`;
      if (detail && selectedId && mode === "list") mountDetail(detail.dto);
      const pickerHost = container.querySelector("[data-pf-picker]");
      if (pickerHost && users) window.VECTON_OPEX_REVIEW_PICKER.mountPicker(pickerHost, { users, value: form.assignee, onChange: id => { form.assignee = id; formKey = null; render(); } });
    }

    function newForm() {
      const sel = users?.find(u => u.userId === form.assignee);
      const restricted = sel && !sel.hasCcAccess;
      const off = saving ? " disabled" : "";
      return `<div class="opex-subform opex-form opex-form--plan" data-plan-form>
        <label class="opex-field opex-field--wide"><span>O que será feito</span><textarea data-pf="title" rows="2" maxlength="1000">${esc(form.title)}</textarea></label>
        <div class="opex-field opex-field--fit"><span>Responsável pela execução</span>${users ? "<div data-pf-picker></div>" : "<span>Carregando pessoas…</span>"}</div>
        <label class="opex-field opex-field--fit"><span>Prazo</span><input type="date" data-pf="dueDate" value="${esc(form.dueDate)}"></label>
        <label class="opex-field opex-field--wide"><span>Resultado esperado</span><textarea data-pf="expectedResult" rows="2" maxlength="2000">${esc(form.expectedResult)}</textarea></label>
        ${restricted ? `<p class="opex-warning opex-field--wide" role="status">${esc(A().NO_CC_WARNING)}</p>` : ""}
        ${files?.length ? `<div class="opex-field opex-field--wide"><span>Arquivos da análise a compartilhar</span><ul class="opex-attach-list">${files.map(f => `<li><label><input type="checkbox" data-pshare="${esc(f.id)}"${form.shares.has(f.id) ? " checked" : ""}> ${esc(f.fileName)}</label></li>`).join("")}</ul>
          ${restricted && form.shares.size ? `<label class="opex-check"><input type="checkbox" data-pf-confirm${form.confirmShare ? " checked" : ""}><span>Confirmo que estes arquivos podem ser vistos por quem não tem acesso ao centro de custo</span></label>` : ""}</div>` : ""}
        <div class="opex-foot opex-field--wide"><button type="button" class="ghost-button" data-plan-cancel>Cancelar</button><button type="button" class="ghost-button opex-primary" data-plan-save${off}>${saving ? "Salvando…" : "Atribuir ação"}</button></div></div>`;
    }

    function mountDetail(dto) {
      const host = container.querySelector("[data-plan-detail]");
      if (!host) return;
      detail?.ctl?.destroy();
      const ctl = A().mountActionDetail(host, { service, dto, analysisId: opts.getAnalysisId?.(), shareable: opts.canWrite, toast, confirm,
        onChanged: next => { const i = actions.findIndex(a => a.id === next.id); if (i >= 0) actions[i] = next; detail = { dto: next, ctl }; opts.onChanged?.(); refreshRows(); },
        onUnavailable: () => { toast?.("Esta ação não está mais disponível para você."); selectedId = null; detail = null; void load(); } });
      detail = { dto, ctl };
    }
    // Atualiza só a linha/lista sem destruir a tela de detalhe aberta.
    function refreshRows() {
      const tbody = container.querySelector(".opex-plan-table tbody");
      if (!tbody) return;
      const dateBr = A().dateBr;
      tbody.innerHTML = sortedActions().map(a => `<tr data-plan-row="${esc(a.id)}"${a.id === selectedId ? ' class="opex-row-selected"' : ""}><td class="gap-name">${esc(a.title)}</td><td class="gap-name">${esc(a.assignee.name)}</td><td class="gap-code">${esc(dateBr(a.dueDate))}</td><td>${A().chip(a)}</td><td><button type="button" class="opex-open-btn" data-plan-open>${a.id === selectedId ? "Fechar" : "Abrir →"}</button></td></tr>`).join("");
    }

    async function load() {
      loading = true; loadError = false; render();
      try { actions = await service.actionsForAnalysis(opts.ctx); opts.onCount?.(actions.length); }
      catch { loadError = true; }
      loading = false; render();
      if (selectedId && actions.some(a => a.id === selectedId)) await open(selectedId, true);
    }
    async function open(id, keep) {
      if (!keep && selectedId === id) { detail?.ctl?.destroy(); detail = null; selectedId = null; render(); return; }
      selectedId = id;
      try {
        const dto = await service.getAction(id);
        if (destroyed || selectedId !== id) return;
        detail = { dto, ctl: null }; render();
      } catch { toast?.("Não foi possível abrir a ação."); selectedId = null; render(); }
    }

    async function startNew() {
      mode = "new"; banner = ""; formKey = null;
      form = { title: "", assignee: "", dueDate: "", expectedResult: "", shares: new Set(), confirmShare: false };
      render();
      try { users = await service.assignableUsers(opts.costCenterId); } catch { users = []; banner = "Não foi possível carregar as pessoas."; }
      const analysisId = opts.getAnalysisId?.();
      files = null;
      if (analysisId) { try { files = await service.listAttachments({ type: "analysis", id: analysisId }); } catch { files = null; } }
      render();
    }
    async function save() {
      if (saving) return;
      const f = form, sel = users?.find(u => u.userId === f.assignee);
      if (!f.title.trim() || !f.assignee || !f.dueDate || !f.expectedResult.trim()) { banner = "Informe o que será feito, o responsável, o prazo e o resultado esperado."; render(); return; }
      if (sel && !sel.hasCcAccess && f.shares.size && !f.confirmShare) { banner = "Confirme o compartilhamento dos arquivos com quem não tem acesso ao centro de custo."; render(); return; }
      saving = true; banner = ""; render();
      formKey = formKey || service.newKey(); // retry/duplo clique reaproveita a chave: nunca duplica a ação
      try {
        const created = await service.createAction(opts.ctx, { title: f.title, expectedResult: f.expectedResult, dueDate: f.dueDate, assigneeUserId: f.assignee }, formKey);
        opts.onAnalysisId?.(created.analysisId);
        const failedShares = [];
        for (const fileId of f.shares) { try { await service.shareAttachment(created.id, fileId, true); } catch { failedShares.push(fileId); } }
        mode = "list"; selectedId = created.id; formKey = null;
        toast?.(failedShares.length ? "Ação atribuída, mas alguns arquivos não foram compartilhados. Compartilhe-os na ação." : "Ação atribuída.");
        opts.onChanged?.();
        saving = false;
        await load();
        return;
      } catch (error) {
        const info = service.parseError(error);
        banner = esc(info.kind === "forbidden" ? "Você não tem permissão para criar ações neste centro de custo." : info.message);
      }
      saving = false; render();
    }

    container.addEventListener("click", event => {
      if (destroyed) return;
      if (event.target.closest("[data-plan-new]")) { void startNew(); return; }
      if (event.target.closest("[data-plan-retry]")) { void load(); return; }
      if (event.target.closest("[data-plan-cancel]")) { mode = "list"; banner = ""; render(); return; }
      if (event.target.closest("[data-plan-save]")) { void save(); return; }
      const colTh = event.target.closest("th[data-sort]");
      if (colTh) { colSort = VW().nextSort(colSort, colTh.dataset.sort); const head = container.querySelector(".opex-plan-table thead tr"); if (head) head.innerHTML = planHead(); refreshRows(); return; }
      const row = event.target.closest("tr[data-plan-row]");
      if (row && !event.target.closest("[data-plan-detail]")) void open(row.dataset.planRow);
    });
    container.addEventListener("input", event => {
      const field = event.target.closest("[data-pf]");
      if (field) { form[field.dataset.pf] = field.value; formKey = null; if (field.dataset.pf === "assignee") render(); }
    });
    container.addEventListener("change", event => {
      const share = event.target.closest("[data-pshare]");
      if (share) { share.checked ? form.shares.add(share.dataset.pshare) : form.shares.delete(share.dataset.pshare); render(); return; }
      if (event.target.closest("[data-pf-confirm]")) form.confirmShare = event.target.checked;
      const field = event.target.closest('select[data-pf="assignee"]');
      if (field) { form.assignee = field.value; render(); }
    });
    void load();
    return { destroy() { destroyed = true; detail?.ctl?.destroy(); container.innerHTML = ""; }, reload: load };
  }
  window.VECTON_OPEX_REVIEW_PLAN = { mountPlanTab };
})(window);
