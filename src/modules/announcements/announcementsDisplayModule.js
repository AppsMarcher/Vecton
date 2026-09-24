(function attachVectonAnnouncementsDisplay(window) {
  "use strict";

  function createAnnouncementsDisplayModule(deps) {
    const dialog = deps.dialog;
    const esc = deps.escapeHtml;
    let current = null;   // anúncio mostrado agora: {id, org, slides: [...]}
    let slideIndex = 0;
    let queue = [];        // ids dos anúncios pendentes desta visita, na ordem de exibição
    let queueIndex = 0;

    function withinPeriod(row, now) {
      if (row.starts_at && new Date(row.starts_at) > now) return false;
      if (row.ends_at && new Date(row.ends_at) < now) return false;
      return true;
    }

    async function checkAndShow() {
      if (!dialog) return;
      try {
        const org = await deps.resolveOrganizationId();
        const userId = deps.getCurrentUserId();
        if (!userId) return;

        const [announcementRows, dismissalRows] = await Promise.all([
          deps.fetchAnnouncements(org),
          deps.fetchDismissals(org, userId)
        ]);

        const dismissed = new Set(dismissalRows.map((row) => row.announcement_id));
        const now = new Date();
        queue = announcementRows
          .filter((row) => row.active && withinPeriod(row, now) && !dismissed.has(row.id))
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((row) => row.id);
        queueIndex = 0;

        if (!queue.length) return;
        await advance(org);
      } catch (error) {
        console.error("Falha ao carregar anúncios:", error);
      }
    }

    // Mostra o próximo anúncio pendente da fila (pulando os sem slides), sem
    // fechar/reabrir o <dialog> entre um e outro — só troca o conteúdo. Fecha
    // de fato só quando a fila desta visita acaba.
    async function advance(org) {
      while (queueIndex < queue.length) {
        const id = queue[queueIndex];
        let slideRows;
        try {
          slideRows = await deps.fetchSlides(org, id);
        } catch (error) {
          console.error("Falha ao carregar slides do anúncio:", error);
          queueIndex++;
          continue;
        }
        if (slideRows.length) {
          current = { id, org, slides: slideRows.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)) };
          slideIndex = 0;
          render();
          if (!dialog.open) dialog.showModal();
          return;
        }
        queueIndex++;
      }
      current = null;
      if (dialog.open) dialog.close();
    }

    function renderSlide(slide) {
      const imageUrl = slide.image_path ? deps.publicImageUrl(slide.image_path) : "";
      const cta = slide.cta_url
        ? `<a class="ann-view-cta" href="${esc(slide.cta_url)}" target="_blank" rel="noopener noreferrer">${esc(slide.cta_label || "Saiba mais")}</a>`
        : "";

      if (slide.slide_type === "image") {
        return `<div class="ann-view-slide ann-view-slide-image">
          ${imageUrl ? `<img src="${esc(imageUrl)}" alt="">` : ""}
          ${cta ? `<div class="ann-view-image-cta">${cta}</div>` : ""}
        </div>`;
      }

      // Cabeçalho sempre no topo, imagem centralizada logo abaixo — só depois
      // vem o texto/CTA. Mantém a leitura em ordem mesmo quando algum campo
      // opcional falta.
      return `<div class="ann-view-slide ann-view-slide-content">
        ${slide.heading ? `<h3 class="ann-view-heading">${esc(slide.heading)}</h3>` : ""}
        ${imageUrl ? `<div class="ann-view-image-wrap"><img src="${esc(imageUrl)}" alt=""></div>` : ""}
        ${(slide.body || cta) ? `<div class="ann-view-copy">
          ${slide.body ? `<p>${esc(slide.body)}</p>` : ""}
          ${cta}
        </div>` : ""}
      </div>`;
    }

    function render() {
      if (!current) return;
      const slides = current.slides;
      const hasMultiple = slides.length > 1;

      dialog.innerHTML = `
        <div class="ann-view-inner">
          <button type="button" id="ann-view-close-x" class="ann-view-close-x" aria-label="Fechar">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div class="ann-view-stage">
            <button type="button" id="ann-view-prev" class="ann-view-nav ann-view-nav-prev" aria-label="Anterior" ${hasMultiple ? "" : "hidden"}>‹</button>
            <div id="ann-view-slide-host" class="ann-view-slide-host">${renderSlide(slides[slideIndex])}</div>
            <button type="button" id="ann-view-next" class="ann-view-nav ann-view-nav-next" aria-label="Próximo" ${hasMultiple ? "" : "hidden"}>›</button>
          </div>
          ${hasMultiple ? `<div class="ann-view-dots">${slides.map((_, i) => `<span class="ann-view-dot${i === slideIndex ? " on" : ""}"></span>`).join("")}</div>` : ""}
          <div class="ann-view-footer">
            <label class="ann-view-dismiss-check">
              <input type="checkbox" id="ann-view-dismiss">
              Não exibir mais esta informação
            </label>
            <button type="button" id="ann-view-close" class="ghost-button">Fechar</button>
          </div>
        </div>`;

      dialog.querySelector("#ann-view-close-x").onclick = () => close(false);
      dialog.querySelector("#ann-view-close").onclick = () => close(dialog.querySelector("#ann-view-dismiss").checked);
      dialog.querySelector("#ann-view-prev")?.addEventListener("click", () => { slideIndex = (slideIndex - 1 + slides.length) % slides.length; render(); });
      dialog.querySelector("#ann-view-next")?.addEventListener("click", () => { slideIndex = (slideIndex + 1) % slides.length; render(); });
    }

    async function close(dismiss) {
      const announcementId = current?.id;
      const org = current?.org;
      if (dismiss && announcementId) {
        try {
          await deps.dismiss(announcementId);
        } catch (error) {
          console.error("Falha ao registrar dispensa do anúncio:", error);
        }
      }
      queueIndex++;
      await advance(org);
    }

    dialog?.addEventListener("cancel", (event) => { event.preventDefault(); close(false); });
    dialog?.addEventListener("click", (event) => { if (event.target === dialog) close(false); });

    return { checkAndShow };
  }

  window.VECTON_ANNOUNCEMENTS_DISPLAY = { createAnnouncementsDisplayModule };
})(window);
