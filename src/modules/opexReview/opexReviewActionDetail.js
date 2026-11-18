(function attachOpexReviewActionDetail(window) {
  "use strict";
  // Tela operacional de uma ação (DTO limitado): o mesmo componente serve o executor sem acesso ao CC ("Minhas ações"),
  // o dono do plano e a aba "Plano de ação" da análise. Nada financeiro é lido nem renderizado aqui.
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const dateBr = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"; };
  const dateTimeBr = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); };
  const STATUS = { awaiting_ack: "Aguardando ciência", in_progress: "Em andamento", awaiting_validation: "Aguardando validação", adjustments_requested: "Ajustes solicitados", completed: "Concluída" };
  const statusLabel = dto => `${STATUS[dto.status] || dto.status}${dto.overdue ? " · atrasada" : ""}`;
  const chip = dto => `<span class="opex-chip opex-chip--${esc(dto.status)}${dto.overdue ? " opex-chip--overdue" : ""}">${esc(statusLabel(dto))}</span>`;
  const NO_CC_WARNING = "Este responsável não possui acesso ao centro de custo. Ele visualizará somente a ação e os conteúdos compartilhados.";

  /**
   * @param container elemento hospedeiro
   * @param opts { service, dto, analysisId?, shareable?:boolean, toast, confirm, onChanged(dto), onUnavailable() }
   */
  function mountActionDetail(container, opts) {
    const { service, toast, confirm } = opts;
    let dto = opts.dto, mode = "view", busy = false, banner = "", pendingKey = null, users = null, destroyed = false, attachCtl = null, shareCtl = null;

    function actions() {
      const p = dto.permissions, buttons = [];
      if (p.canAck) buttons.push('<button type="button" class="ghost-button opex-primary" data-act="ack">Ciente</button>');
      if (p.canSubmit) buttons.push('<button type="button" class="ghost-button opex-primary" data-act-mode="submit">Concluir e pedir validação</button>');
      if (p.canValidate) buttons.push('<button type="button" class="ghost-button opex-primary" data-act="validate">Validar entrega</button>');
      if (p.canReturn) buttons.push('<button type="button" class="ghost-button" data-act-mode="return">Devolver para ajuste</button>');
      if (p.canReassign) buttons.push('<button type="button" class="ghost-button" data-act-mode="reassign">Reatribuir</button>');
      if (p.canEditTerms) buttons.push('<button type="button" class="ghost-button" data-act-mode="terms">Alterar prazo ou resultado</button>');
      return buttons.join("");
    }
    function form() {
      const off = busy ? " disabled" : "";
      if (mode === "submit") return `<div class="opex-subform"><label class="opex-field opex-field--wide"><span>Descrição da entrega</span><textarea data-in="note" rows="3" maxlength="2000"></textarea></label><div class="opex-foot"><button type="button" class="ghost-button" data-act-cancel>Cancelar</button><button type="button" class="ghost-button opex-primary" data-act="submit"${off}>Pedir validação</button></div></div>`;
      if (mode === "return") return `<div class="opex-subform"><label class="opex-field opex-field--wide"><span>Justificativa do ajuste</span><textarea data-in="reason" rows="3" maxlength="2000"></textarea></label><div class="opex-foot"><button type="button" class="ghost-button" data-act-cancel>Cancelar</button><button type="button" class="ghost-button opex-primary" data-act="return"${off}>Devolver</button></div></div>`;
      if (mode === "terms") return `<div class="opex-subform opex-form"><label class="opex-field"><span>Prazo</span><input type="date" data-in="dueDate" value="${esc(dto.dueDate)}"></label><label class="opex-field opex-field--wide"><span>Resultado esperado</span><textarea data-in="expectedResult" rows="2" maxlength="2000">${esc(dto.expectedResult)}</textarea></label><div class="opex-foot opex-field--wide"><button type="button" class="ghost-button" data-act-cancel>Cancelar</button><button type="button" class="ghost-button opex-primary" data-act="terms"${off}>Salvar</button></div></div>`;
      if (mode === "reassign") {
        if (!users) return '<div class="opex-subform opex-empty" role="status">Carregando pessoas…</div>';
        return `<div class="opex-subform"><div class="opex-field opex-field--fit"><span>Novo responsável</span><div data-in-picker></div></div><p class="opex-warning" data-warn hidden>${esc(NO_CC_WARNING)}</p><div class="opex-foot"><button type="button" class="ghost-button" data-act-cancel>Cancelar</button><button type="button" class="ghost-button opex-primary" data-act="reassign"${off}>Reatribuir</button></div></div>`;
      }
      if (dto.permissions.canComment) return `<div class="opex-subform opex-comment"><label class="opex-field opex-field--wide"><span>Comentário</span><textarea data-in="comment" rows="2" maxlength="2000"></textarea></label><div class="opex-foot"><span></span><button type="button" class="ghost-button" data-act="comment"${off}>Comentar</button></div></div>`;
      return "";
    }
    function render() {
      if (destroyed) return;
      const p = dto.permissions;
      container.innerHTML = `<article class="opex-action" data-action-id="${esc(dto.id)}" aria-label="Ação: ${esc(dto.title)}">
        <header class="opex-action-head"><h3>${esc(dto.title)}</h3>${chip(dto)}</header>
        <dl class="opex-action-facts">
          <div><dt>Atribuída por</dt><dd>${esc(dto.owner.name)}</dd></div>
          <div><dt>Responsável</dt><dd>${esc(dto.assignee.name)}</dd></div>
          <div><dt>Prazo</dt><dd>${esc(dateBr(dto.dueDate))}</dd></div>
          <div><dt>Ciência</dt><dd>${dto.acknowledgedAt ? esc(dateTimeBr(dto.acknowledgedAt)) : "Pendente"}</dd></div>
          <div class="opex-field--wide"><dt>Resultado esperado</dt><dd>${esc(dto.expectedResult)}</dd></div>
          ${dto.submitNote && ["awaiting_validation", "completed"].includes(dto.status) ? `<div class="opex-field--wide"><dt>Entrega informada</dt><dd>${esc(dto.submitNote)}</dd></div>` : ""}
        </dl>
        <div class="opex-banner" data-banner role="alert"${banner ? "" : " hidden"}>${banner}</div>
        <div class="opex-action-buttons">${actions()}</div>
        ${form()}
        <div data-action-attachments></div>
        ${opts.shareable && p.isOwner ? '<div data-action-shares></div>' : ""}
        <section class="opex-timeline" aria-label="Histórico"><strong>Histórico</strong><ol>${(dto.events || []).slice().reverse().map(e => `<li><span class="opex-timeline-meta">${esc(dateTimeBr(e.at))} · ${esc(e.actor || "")}</span><span>${esc(e.text)}</span></li>`).join("")}</ol></section>
      </article>`;
      mountAttachmentsArea();
      void mountShares();
      const pickerHost = container.querySelector("[data-in-picker]");
      if (pickerHost && users) {
        window.VECTON_OPEX_REVIEW_PICKER.mountPicker(pickerHost, { users, value: "", inputName: "assignee", onChange: (id, user) => { const warn = container.querySelector("[data-warn]"); if (warn) warn.hidden = !user || user.hasCcAccess; } });
      }
    }
    // Compartilhamento explícito de arquivos da análise com ESTA ação (dono do plano). Nada é liberado por padrão.
    async function mountShares() {
      const host = container.querySelector("[data-action-shares]");
      if (!host || !opts.analysisId) return;
      let files = [];
      try { files = await service.listAttachments({ type: "analysis", id: opts.analysisId }); } catch { return; }
      if (destroyed || !host.isConnected) return;
      if (!files.length) { host.innerHTML = ""; return; }
      host.innerHTML = `<section class="opex-attach" aria-label="Arquivos da análise compartilhados com esta ação"><div class="opex-attach-head"><strong>Arquivos da análise compartilhados com esta ação</strong></div><ul class="opex-attach-list">${files.map(f => `<li><label><input type="checkbox" data-share="${esc(f.id)}"${f.sharedActionIds?.includes(dto.id) ? " checked" : ""}> <span class="opex-attach-name">${esc(f.fileName)}</span></label></li>`).join("")}</ul></section>`;
      host.onchange = async event => {
        const box = event.target.closest("[data-share]");
        if (!box) return;
        const attachmentId = box.dataset.share;
        try {
          if (box.checked) {
            try { await service.shareAttachment(dto.id, attachmentId, false); }
            catch (error) {
              const info = service.parseError(error);
              if (info.hint !== "confirm_required") throw error;
              if (!(await confirm?.(`${info.message}`, "warn"))) { box.checked = false; return; }
              await service.shareAttachment(dto.id, attachmentId, true);
            }
          } else await service.revokeShare(dto.id, attachmentId);
          attachCtl?.reload();
        } catch (error) { box.checked = !box.checked; toast?.(service.parseError(error).message); }
      };
    }
    function mountAttachmentsArea() {
      const host = container.querySelector("[data-action-attachments]");
      if (!host || !window.VECTON_OPEX_REVIEW_ATTACHMENTS) return;
      attachCtl?.destroy();
      attachCtl = window.VECTON_OPEX_REVIEW_ATTACHMENTS.mountAttachments(host, {
        service, entity: { type: "action", id: dto.id }, title: "Arquivos compartilhados e evidências", canUpload: dto.status !== "completed" && (dto.permissions.isOwner || dto.permissions.isAssignee),
        canRemove: dto.permissions.isOwner || dto.permissions.isAssignee, toast, confirm
      });
    }

    async function reload(message) {
      try { dto = await service.getAction(dto.id); banner = message || ""; }
      catch (error) { if (service.parseError(error).kind === "forbidden") { opts.onUnavailable?.(); return; } banner = "Não foi possível recarregar a ação."; }
      mode = "view"; render();
    }
    async function run(op, arg) {
      if (busy) return;
      busy = true; banner = ""; render();
      pendingKey = pendingKey || service.newKey();
      try {
        const result = await service.mutate(op, dto, pendingKey, arg);
        pendingKey = null;
        dto = result; mode = "view";
        toast?.("Ação atualizada.");
        opts.onChanged?.(dto);
      } catch (error) {
        const info = service.parseError(error);
        if (info.kind === "conflict") { pendingKey = null; busy = false; await reload('A ação foi alterada por outra pessoa ou sessão; os dados foram recarregados. Confira e tente novamente.'); return; }
        if (info.kind === "forbidden") { opts.onUnavailable?.(); busy = false; return; }
        banner = esc(info.kind === "validation" ? info.message : `Não foi possível concluir: ${info.message}`);
      }
      busy = false; render();
    }

    container.addEventListener("click", async event => {
      if (destroyed) return;
      const modeBtn = event.target.closest("[data-act-mode]");
      if (modeBtn) {
        mode = modeBtn.dataset.actMode; pendingKey = null; banner = "";
        if (mode === "reassign" && !users) { render(); try { users = await service.assignableForAction(dto.id); } catch { users = []; banner = "Não foi possível carregar as pessoas."; } }
        render(); return;
      }
      if (event.target.closest("[data-act-cancel]")) { mode = "view"; pendingKey = null; render(); return; }
      const act = event.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      const val = name => container.querySelector(`[data-in="${name}"]`)?.value ?? "";
      if (act === "ack") return run("ack");
      if (act === "validate") return run("validate");
      if (act === "submit") { if (!val("note").trim()) { banner = "Descreva a entrega."; render(); return; } return run("submit", val("note")); }
      if (act === "return") { if (!val("reason").trim()) { banner = "Informe a justificativa do ajuste."; render(); return; } return run("return", val("reason")); }
      if (act === "comment") { if (!val("comment").trim()) return; return run("comment", val("comment")); }
      if (act === "reassign") { if (!val("assignee")) { banner = "Escolha o novo responsável."; render(); return; } return run("reassign", val("assignee")); }
      if (act === "terms") return run("terms", { dueDate: val("dueDate"), expectedResult: val("expectedResult") });
    });
    render();
    return {
      get dto() { return dto; },
      reload,
      destroy() { destroyed = true; attachCtl?.destroy(); shareCtl?.destroy(); container.innerHTML = ""; }
    };
  }
  window.VECTON_OPEX_REVIEW_ACTION = { mountActionDetail, statusLabel, chip, STATUS, dateBr, NO_CC_WARNING, esc };
})(window);
