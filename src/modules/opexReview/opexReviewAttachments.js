(function attachOpexReviewAttachments(window) {
  "use strict";
  // Área de anexos (análise ou ação): seleção múltipla, lista com abrir/remover, retry por arquivo.
  // Falha de um upload nunca apaga a análise/ação nem os demais arquivos; nada é guardado em URL pública.
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const MAX_BYTES = 20 * 1024 * 1024;
  const sizeLabel = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR")} KB`;
  const KIND = mime => mime === "application/pdf" ? "PDF" : mime.startsWith("image/") ? "Imagem" : /spreadsheet|excel|csv/.test(mime) ? "Planilha" : /word/.test(mime) ? "Documento" : /presentation|powerpoint/.test(mime) ? "Apresentação" : mime === "text/plain" ? "Texto" : "Arquivo";

  /**
   * @param container elemento hospedeiro
   * @param opts { service, entity:{type,id}|null, title, canUpload, canRemove, needsSaveFirst, toast, confirm, onChange }
   */
  function mountAttachments(container, opts) {
    const { service, title, toast, confirm } = opts;
    let entity = opts.entity, items = [], loading = true, loadError = false, uploads = [], destroyed = false;
    const input = document.createElement("input");
    input.type = "file"; input.multiple = true; input.hidden = true;

    function render() {
      if (destroyed) return;
      const failed = uploads.filter(u => u.status !== "done");
      container.innerHTML = `<section class="opex-attach" aria-label="${esc(title)}">
        <div class="opex-attach-head"><strong>${esc(title)}</strong>${opts.canUpload ? '<button type="button" class="ghost-button" data-att-add>Anexar arquivo</button>' : ""}</div>
        ${loadError ? '<div class="opex-empty" role="alert">Não foi possível carregar os arquivos. <button type="button" class="ghost-button" data-att-retry-list>Tentar novamente</button></div>'
          : loading ? '<div class="opex-empty" role="status">Carregando arquivos…</div>'
          : `<ul class="opex-attach-list">${items.map(item => `<li data-att-id="${esc(item.id)}"><span class="opex-attach-name">${esc(item.fileName)}</span><span class="opex-attach-meta">${KIND(item.mimeType)} · ${sizeLabel(item.size)}${item.origin === "shared" ? " · compartilhado" : ""}${item.sharedActionIds?.length ? ` · compartilhado em ${item.sharedActionIds.length} ação(ões)` : ""}</span>
              <button type="button" class="opex-open-btn" data-att-open aria-label="Abrir ${esc(item.fileName)}">Abrir →</button>${opts.canRemove && item.origin !== "shared" ? `<button type="button" class="ghost-button" data-att-remove aria-label="Remover ${esc(item.fileName)}">Remover</button>` : ""}</li>`).join("")}
            ${failed.map((u, i) => `<li class="opex-attach-failed" data-att-upload="${i}" role="alert"><span class="opex-attach-name">${esc(u.file.name)}</span><span class="opex-attach-meta">${u.status === "uploading" ? "Enviando…" : esc(u.error)}</span>${u.status === "failed" ? '<button type="button" class="ghost-button" data-att-retry>Tentar novamente</button><button type="button" class="ghost-button" data-att-dismiss>Descartar</button>' : ""}</li>`).join("")}
            </ul>${!items.length && !failed.length ? '<div class="opex-empty">Nenhum arquivo anexado.</div>' : ""}`}
      </section>`;
    }

    async function reload() {
      if (!entity?.id) { loading = false; items = []; render(); return; }
      loading = true; loadError = false; render();
      try { items = await service.listAttachments(entity); } catch { loadError = true; }
      loading = false; render();
      opts.onChange?.(items);
    }

    async function send(upload) {
      upload.status = "uploading"; upload.error = ""; render();
      try { await service.uploadAttachment(entity, upload.file); upload.status = "done"; }
      catch (error) { upload.status = "failed"; upload.error = `Falha no envio: ${service.parseError(error).message}`; }
      render();
    }
    async function addFiles(files) {
      if (!entity?.id) { toast?.(opts.needsSaveFirst || "Salve antes de anexar arquivos."); return; }
      const batch = [...files].map(file => ({ file, status: file.size > MAX_BYTES ? "failed" : "uploading", error: file.size > MAX_BYTES ? "O arquivo excede 20 MB." : "" }));
      uploads.push(...batch);
      render();
      for (const upload of batch) if (upload.status === "uploading") await send(upload);
      uploads = uploads.filter(u => u.status !== "done");
      await reload();
    }

    container.addEventListener("click", async event => {
      if (destroyed) return;
      if (event.target.closest("[data-att-add]")) { input.value = ""; input.click(); return; }
      if (event.target.closest("[data-att-retry-list]")) { void reload(); return; }
      const row = event.target.closest("li[data-att-id]");
      if (row && event.target.closest("[data-att-open]")) {
        const win = window.open("", "_blank");
        try {
          const access = await service.attachmentUrl(row.dataset.attId);
          if (win) { win.opener = null; win.location.href = access.url; }
        } catch (error) { win?.close(); toast?.(`Não foi possível abrir o arquivo: ${service.parseError(error).message}`); }
        return;
      }
      if (row && event.target.closest("[data-att-remove]")) {
        const item = items.find(i => i.id === row.dataset.attId);
        if (!(await confirm?.(`Remover o arquivo “${item?.fileName}”?`))) return;
        try { await service.removeAttachment(row.dataset.attId); await reload(); }
        catch (error) { toast?.(service.parseError(error).message); }
        return;
      }
      const failedRow = event.target.closest("li[data-att-upload]");
      if (failedRow) {
        const failed = uploads.filter(u => u.status !== "done"), upload = failed[Number(failedRow.dataset.attUpload)];
        if (!upload) return;
        if (event.target.closest("[data-att-dismiss]")) { uploads = uploads.filter(u => u !== upload); render(); return; }
        if (event.target.closest("[data-att-retry]")) { await send(upload); uploads = uploads.filter(u => u.status !== "done"); await reload(); }
      }
    });
    input.addEventListener("change", () => { if (input.files?.length) void addFiles(input.files); });
    void reload();
    return {
      setEntity(next) { entity = next; void reload(); },
      reload,
      destroy() { destroyed = true; container.innerHTML = ""; }
    };
  }
  window.VECTON_OPEX_REVIEW_ATTACHMENTS = { mountAttachments, sizeLabel };
})(window);
