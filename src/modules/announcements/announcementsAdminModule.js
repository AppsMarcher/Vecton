(function attachVectonAnnouncementsAdmin(window) {
  "use strict";

  function createAnnouncementsAdminModule(deps) {
    const root = deps.root;
    const esc = deps.escapeHtml;
    const el = (selector) => root.querySelector(selector);
    const allowed = () => deps.isAdmin();

    let announcements = [];   // [{id, title, active, starts_at, ends_at, sort_order, slides: [...]}]
    let selectedId = null;
    let draft = null;         // anúncio novo, ainda não salvo
    let context = null;       // {user, org}
    let loaded = false, pending = false, busy = false, mounted = false;

    function newSlide(sortOrder) {
      return {
        id: crypto.randomUUID(),
        sort_order: sortOrder,
        slide_type: "content",
        image_path: "",
        heading: "",
        body: "",
        cta_label: "",
        cta_url: "",
        _file: null,
        _previewUrl: ""
      };
    }

    function selected() {
      return draft || announcements.find((item) => item.id === selectedId) || null;
    }

    function mount() {
      if (mounted) return;
      mounted = true;
      root.innerHTML = `
        <div class="cadastro-shell ann-shell">
          <div class="cadastro-header">
            <div>
              <h2 class="cadastro-title">Novidades</h2>
              <p class="cadastro-subtitle">Pop-up de novidades exibido na abertura do Vecton. Cada anúncio pode ter vários slides (carrossel); um slide "Imagem cheia" mostra só a imagem enviada, sem nada por cima — um slide "Cabeçalho + texto" é montado pelo sistema.</p>
            </div>
          </div>
          <p id="ann-status" role="status" aria-live="polite"></p>
          <div class="ann-workspace">
            <div class="content-card ann-list-panel">
              <div class="card-toolbar"><button type="button" id="ann-add" class="primary-button compact-button">Novo anúncio</button><button type="button" id="ann-refresh" class="ghost-button">Atualizar</button></div>
              <div id="ann-list" class="ann-list"></div>
            </div>
            <div class="content-card ann-editor-panel">
              <div class="editor-header"><p class="section-kicker">Editor</p><h4 id="ann-editor-title">Selecione um anúncio</h4></div>
              <form id="ann-form" class="form-grid">
                <label class="full-span">Título interno<input name="title" required maxlength="120" placeholder="Ex.: Lançamento módulo X"></label>
                <label>Situação<select name="active"><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
                <label>Início da vigência<input name="starts_at" type="date"><span class="toolbar-note">Vazio = já vale.</span></label>
                <label>Fim da vigência<input name="ends_at" type="date"><span class="toolbar-note">Vazio = sem prazo.</span></label>
                <div class="full-span ann-slides-header">
                  <p class="section-kicker">Slides do carrossel</p>
                  <button type="button" id="ann-slide-add" class="ghost-button compact-button">+ Slide</button>
                </div>
                <div id="ann-slides" class="ann-slides full-span"></div>
                <div class="editor-actions full-span"><button class="primary-button" type="submit">Salvar</button><button class="delete-button secondary-danger" id="ann-delete" type="button">Remover</button></div>
              </form>
            </div>
          </div>
        </div>`;

      el("#ann-add").onclick = () => {
        if (!loaded || busy) return;
        selectedId = null;
        const maxOrder = Math.max(0, ...announcements.map((a) => a.sort_order || 0));
        draft = {
          id: crypto.randomUUID(),
          title: "",
          active: true,
          starts_at: "",
          ends_at: "",
          sort_order: maxOrder + 1,
          slides: [newSlide(0)]
        };
        drawList(); drawEditor();
        el('[name="title"]').focus();
      };
      el("#ann-refresh").onclick = () => { if (!busy) { loaded = false; void render(); } };
      el("#ann-slide-add").onclick = () => {
        const item = selected();
        if (!item || busy) return;
        item.slides.push(newSlide(item.slides.length));
        drawSlides();
      };
      el("#ann-form").onsubmit = async (event) => {
        event.preventDefault();
        const item = selected();
        if (!item) return;
        const data = new FormData(event.currentTarget);
        item.title = String(data.get("title") || "").trim();
        item.active = data.get("active") === "true";
        item.starts_at = data.get("starts_at") || "";
        item.ends_at = data.get("ends_at") || "";
        if (!item.title) { status("Informe o título do anúncio.", true); return; }
        if (!item.slides.length) { status("Adicione ao menos um slide.", true); return; }
        for (const slide of item.slides) {
          if (slide.slide_type === "content" && !slide.heading.trim() && !slide.body.trim() && !slide.image_path && !slide._file) {
            status("Preencha ao menos um campo em cada slide de cabeçalho + texto.", true);
            return;
          }
          if (slide.slide_type === "image" && !slide.image_path && !slide._file) {
            status("Todo slide de imagem cheia precisa de uma imagem.", true);
            return;
          }
        }
        if (!await deps.confirm(`Salvar o anúncio "${item.title}"?`)) return;
        void save(item);
      };
      el("#ann-delete").onclick = () => void remove();
    }

    function status(message, error = false) {
      if (!mounted) return;
      el("#ann-status").textContent = message;
      el("#ann-status").setAttribute("role", error ? "alert" : "status");
    }

    function controls() {
      if (!mounted) return;
      root.querySelectorAll("button, input, select, textarea").forEach((node) => { node.disabled = busy || !loaded; });
      el("#ann-refresh").disabled = busy || pending;
      el("#ann-delete").disabled = busy || !loaded || Boolean(draft) || !selectedId;
    }

    function drawList() {
      const list = el("#ann-list");
      if (!announcements.length) {
        list.innerHTML = `<span class="ann-empty">Nenhum anúncio cadastrado.</span>`;
      } else {
        list.innerHTML = announcements.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((item) => `
          <div class="ann-list-item${item.id === selectedId ? " selected" : ""}" data-id="${esc(item.id)}">
            <button type="button" class="ann-list-item-main" data-action="select" data-id="${esc(item.id)}">
              <span class="ann-list-title">${esc(item.title)}</span>
              <span class="ann-list-meta">
                <span class="ann-status-dot ${item.active ? "on" : "off"}"></span>
                ${item.active ? "Ativo" : "Inativo"} · ${item.slides.length} slide${item.slides.length === 1 ? "" : "s"}
              </span>
            </button>
            <button type="button" class="ann-list-item-delete" data-action="delete" data-id="${esc(item.id)}" title="Remover anúncio" aria-label="Remover anúncio">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>`).join("");
        list.querySelectorAll('[data-action="select"]').forEach((btn) => {
          btn.onclick = () => {
            if (busy) return;
            selectedId = btn.dataset.id;
            draft = null;
            drawList(); drawEditor();
          };
        });
        list.querySelectorAll('[data-action="delete"]').forEach((btn) => {
          btn.onclick = (event) => {
            event.stopPropagation();
            if (busy) return;
            void remove(btn.dataset.id);
          };
        });
      }
      if (draft) {
        list.insertAdjacentHTML("beforeend", `<div class="ann-list-item selected ann-list-item-draft"><span class="ann-list-item-main"><span class="ann-list-title">${esc(draft.title || "Novo anúncio")}</span><span class="ann-list-meta">Rascunho</span></span></div>`);
      }
    }

    function slideTypeLabel(type) {
      return type === "image" ? "Imagem cheia" : "Cabeçalho + texto";
    }

    function drawSlides() {
      const item = selected();
      const wrap = el("#ann-slides");
      if (!item) { wrap.innerHTML = ""; return; }
      wrap.innerHTML = item.slides.map((slide, index) => {
        const isImage = slide.slide_type === "image";
        const previewSrc = slide._previewUrl || (slide.image_path ? deps.publicImageUrl(slide.image_path) : "");
        return `
        <div class="ann-slide-card" data-slide-id="${esc(slide.id)}">
          <div class="ann-slide-head">
            <span class="ann-slide-num">Slide ${index + 1}</span>
            <select data-field="slide_type" data-slide-id="${esc(slide.id)}">
              <option value="content" ${!isImage ? "selected" : ""}>${slideTypeLabel("content")}</option>
              <option value="image" ${isImage ? "selected" : ""}>${slideTypeLabel("image")}</option>
            </select>
            <span class="ann-slide-move">
              <button type="button" class="ghost-button compact-button" data-action="up" data-slide-id="${esc(slide.id)}" ${index === 0 ? "disabled" : ""} title="Mover para cima">↑</button>
              <button type="button" class="ghost-button compact-button" data-action="down" data-slide-id="${esc(slide.id)}" ${index === item.slides.length - 1 ? "disabled" : ""} title="Mover para baixo">↓</button>
              <button type="button" class="delete-button secondary-danger compact-button" data-action="remove" data-slide-id="${esc(slide.id)}">Remover</button>
            </span>
          </div>
          <div class="ann-slide-body">
            <label class="full-span">
              ${isImage ? "Imagem (ocupa o slide inteiro, sem texto por cima)" : "Imagem de apoio (opcional)"}
              <input type="file" accept="image/*" data-field="image_file" data-slide-id="${esc(slide.id)}">
            </label>
            ${previewSrc ? `<img class="ann-slide-preview" src="${esc(previewSrc)}" alt="">` : ""}
            ${isImage ? "" : `
              <label class="full-span">Cabeçalho<input data-field="heading" data-slide-id="${esc(slide.id)}" value="${esc(slide.heading)}" maxlength="120"></label>
              <label class="full-span">Texto<textarea data-field="body" data-slide-id="${esc(slide.id)}" rows="3" maxlength="600">${esc(slide.body)}</textarea></label>
            `}
            <label>Texto do botão (opcional)<input data-field="cta_label" data-slide-id="${esc(slide.id)}" value="${esc(slide.cta_label)}" maxlength="40"></label>
            <label>Link do botão (opcional)<input data-field="cta_url" data-slide-id="${esc(slide.id)}" value="${esc(slide.cta_url)}" maxlength="500" placeholder="https://"></label>
          </div>
        </div>`;
      }).join("");

      wrap.querySelectorAll("[data-slide-id]").forEach((node) => {
        const slideId = node.dataset.slideId;
        const slide = item.slides.find((s) => s.id === slideId);
        if (!slide) return;
        const field = node.dataset.field;
        const action = node.dataset.action;

        if (field === "slide_type") {
          node.onchange = () => { slide.slide_type = node.value; drawSlides(); };
        } else if (field === "image_file") {
          node.onchange = () => {
            const file = node.files?.[0];
            if (!file) return;
            slide._file = file;
            slide._previewUrl = URL.createObjectURL(file);
            drawSlides();
          };
        } else if (field === "heading" || field === "body" || field === "cta_label" || field === "cta_url") {
          node.oninput = () => { slide[field] = node.value; };
        } else if (action === "up") {
          node.onclick = () => {
            const idx = item.slides.indexOf(slide);
            if (idx <= 0) return;
            [item.slides[idx - 1], item.slides[idx]] = [item.slides[idx], item.slides[idx - 1]];
            drawSlides();
          };
        } else if (action === "down") {
          node.onclick = () => {
            const idx = item.slides.indexOf(slide);
            if (idx < 0 || idx >= item.slides.length - 1) return;
            [item.slides[idx + 1], item.slides[idx]] = [item.slides[idx], item.slides[idx + 1]];
            drawSlides();
          };
        } else if (action === "remove") {
          node.onclick = async () => {
            if (!await deps.confirm(`Remover o slide ${item.slides.indexOf(slide) + 1}?`, "danger")) return;
            item.slides = item.slides.filter((s) => s.id !== slideId);
            drawSlides();
          };
        }
      });
    }

    function drawEditor() {
      const item = selected();
      const form = el("#ann-form");
      form.style.display = item ? "" : "none";
      el("#ann-editor-title").textContent = draft ? "Novo anúncio" : (item?.title || "Selecione um anúncio");
      if (!item) return;
      form.elements.title.value = item.title;
      form.elements.active.value = String(item.active);
      form.elements.starts_at.value = item.starts_at || "";
      form.elements.ends_at.value = item.ends_at || "";
      drawSlides();
      el("#ann-delete").disabled = busy || Boolean(draft);
    }

    async function save(item) {
      if (busy || !loaded || !allowed()) return;
      const key = context;
      busy = true; controls();
      try {
        const fields = {
          organization_id: key.org,
          title: item.title,
          active: item.active,
          starts_at: item.starts_at || null,
          ends_at: item.ends_at || null,
          sort_order: item.sort_order || 0
        };
        const existing = announcements.some((a) => a.id === item.id);
        const savedRows = existing
          ? await deps.updateAnnouncement(key.org, item.id, fields)
          : await deps.insertAnnouncement({ ...fields, id: item.id });
        if (key !== context) return;
        if (savedRows.length !== 1) throw new Error("O anúncio não foi gravado. Atualize a lista e confira suas permissões.");

        for (const slide of item.slides) {
          if (slide._file) {
            const filename = slide._file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `${key.org}/${item.id}/${slide.id}-${filename}`;
            await deps.uploadImage(path, slide._file);
            slide.image_path = path;
            slide._file = null;
          }
        }

        await deps.deleteSlides(item.id);
        if (item.slides.length) {
          await deps.insertSlides(item.slides.map((slide, index) => ({
            id: slide.id,
            organization_id: key.org,
            announcement_id: item.id,
            sort_order: index,
            slide_type: slide.slide_type,
            image_path: slide.image_path || null,
            heading: slide.heading || null,
            body: slide.body || null,
            cta_label: slide.cta_label || null,
            cta_url: slide.cta_url || null
          })));
        }

        if (key !== context) return;
        announcements = [...announcements.filter((a) => a.id !== item.id), { ...item }];
        selectedId = item.id; draft = null;
        status("Anúncio salvo."); drawList(); drawEditor();
      } catch (error) {
        if (key === context) status(`Não foi possível salvar: ${error.message}`, true);
      } finally {
        busy = false; if (key === context) controls();
      }
    }

    async function remove(id) {
      const targetId = id || selectedId;
      if (busy || !loaded || !allowed() || !targetId) return;
      const item = announcements.find((a) => a.id === targetId);
      if (!item) return;
      if (!await deps.confirm(`Remover o anúncio "${item.title}"? Ele deixa de aparecer para os usuários.`, "danger")) return;
      const key = context;
      busy = true; controls();
      try {
        await deps.deleteAnnouncement(key.org, item.id);
        if (key !== context) return;
        announcements = announcements.filter((a) => a.id !== item.id);
        if (selectedId === item.id) selectedId = null;
        status("Anúncio removido."); drawList(); drawEditor();
      } catch (error) {
        if (key === context) status(`Não foi possível remover: ${error.message}`, true);
      } finally {
        busy = false; if (key === context) controls();
      }
    }

    async function render() {
      if (deps.getActiveView() !== "announcements") return;
      if (!allowed()) { root.textContent = "Acesso restrito aos administradores."; mounted = false; loaded = false; context = null; return; }
      mount();
      const user = deps.getCurrentUserId();
      if (context?.user !== user) { loaded = false; announcements = []; selectedId = null; draft = null; }
      if (pending || loaded) return;
      pending = true; drawList(); drawEditor(); controls(); status("Carregando anúncios…");
      try {
        const org = await deps.resolveOrganizationId();
        const [announcementRows, slideRows] = await Promise.all([
          deps.fetchAnnouncements(org),
          deps.fetchSlides(org)
        ]);
        if (user !== deps.getCurrentUserId()) return;
        context = { user, org };
        announcements = announcementRows.map((row) => ({
          id: row.id,
          title: row.title,
          active: row.active,
          starts_at: row.starts_at ? String(row.starts_at).slice(0, 10) : "",
          ends_at: row.ends_at ? String(row.ends_at).slice(0, 10) : "",
          sort_order: row.sort_order || 0,
          slides: slideRows
            .filter((slide) => slide.announcement_id === row.id)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
            .map((slide) => ({
              id: slide.id,
              sort_order: slide.sort_order || 0,
              slide_type: slide.slide_type || "content",
              image_path: slide.image_path || "",
              heading: slide.heading || "",
              body: slide.body || "",
              cta_label: slide.cta_label || "",
              cta_url: slide.cta_url || "",
              _file: null,
              _previewUrl: ""
            }))
        }));
        loaded = true;
        status(`${announcements.length} anúncio${announcements.length === 1 ? "" : "s"} cadastrado${announcements.length === 1 ? "" : "s"}.`);
        drawList(); drawEditor();
      } catch (error) {
        status(`Não foi possível carregar os anúncios. ${error.message}`, true);
      } finally {
        pending = false; controls();
      }
    }

    return { render };
  }

  window.VECTON_ANNOUNCEMENTS_ADMIN = { createAnnouncementsAdminModule };
})(window);
