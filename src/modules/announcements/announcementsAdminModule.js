(function attachVectonAnnouncementsAdmin(window) {
  "use strict";

  function createAnnouncementsAdminModule(deps) {
    const root = deps.root;
    const esc = deps.escapeHtml;
    const el = (selector) => root.querySelector(selector);
    const allowed = () => deps.isAdmin();

    let announcements = [];   // [{id, title, active, starts_at, ends_at, sort_order, slides: [...]}]
    let context = null;       // {user, org}
    let loaded = false, pending = false, busy = false, mounted = false;

    let editingItem = null;   // cópia editável aberta no painel — nunca a referência da lista
    let editingIsNew = false;

    let viewingId = null;             // id do anúncio com o painel de visualizações aberto
    let dismissals = [];              // [{userId, name, dismissedAt}] do anúncio em `viewingId`
    let dismissalsLoadedFor = null;
    let dismissalsPending = false;

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

    function cloneItem(item) {
      return { ...item, slides: item.slides.map((s) => ({ ...s })) };
    }

    function status(message, error) {
      deps.showToast(message, error ? "error" : "success");
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
            <button type="button" id="ann-add" class="primary-button">+ Novo anúncio</button>
          </div>
          <div class="content-card ann-list-card">
            <div id="ann-list" class="ann-rows"></div>
          </div>
        </div>

        <div id="ann-editor-panel" class="ue-panel ann-editor-panel">
          <form id="ann-form" class="ue-panel-inner ann-editor-inner">
            <div class="ue-panel-header">
              <div>
                <p class="ann-panel-kicker" id="ann-editor-kicker">Editar anúncio</p>
                <span class="ue-panel-title" id="ann-editor-title">Anúncio</span>
              </div>
              <button type="button" class="ue-close-btn" id="ann-editor-close" aria-label="Fechar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="ue-panel-body">
              <div class="form-grid">
                <label class="full-span">Título interno<input name="title" required maxlength="120" placeholder="Ex.: Lançamento módulo X"></label>
                <label>Situação<select name="active"><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
                <label>Início da vigência<input name="starts_at" type="date"><span class="toolbar-note">Vazio = já vale.</span></label>
                <label>Fim da vigência<input name="ends_at" type="date"><span class="toolbar-note">Vazio = sem prazo.</span></label>
                <div class="full-span ann-slides-header">
                  <p class="section-kicker">Slides do carrossel</p>
                  <button type="button" id="ann-slide-add" class="ghost-button compact-button">+ Slide</button>
                </div>
                <div id="ann-slides" class="ann-slides full-span"></div>
              </div>
            </div>
            <div class="ue-panel-footer ann-editor-footer">
              <button type="button" class="delete-button secondary-danger" id="ann-delete">Remover</button>
              <div class="ann-editor-footer-main">
                <button type="button" class="ghost-button" id="ann-editor-cancel">Cancelar</button>
                <button type="submit" class="primary-button">Salvar</button>
              </div>
            </div>
          </form>
        </div>

        <div id="ann-views-panel" class="ue-panel ann-views-panel">
          <div class="ue-panel-inner ann-views-inner">
            <div class="ue-panel-header">
              <div>
                <p class="ann-panel-kicker">Visualizações</p>
                <span class="ue-panel-title" id="ann-views-title">Anúncio</span>
              </div>
              <button type="button" class="ue-close-btn" id="ann-views-close" aria-label="Fechar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="ue-panel-body">
              <p id="ann-views-status" class="toolbar-note"></p>
              <div id="ann-views-list" class="ann-views-list"></div>
            </div>
          </div>
        </div>`;

      el("#ann-add").onclick = () => {
        if (!loaded || busy) return;
        const maxOrder = Math.max(0, ...announcements.map((a) => a.sort_order || 0));
        openEditor({
          id: crypto.randomUUID(),
          title: "",
          active: true,
          starts_at: "",
          ends_at: "",
          sort_order: maxOrder + 1,
          slides: [newSlide(0)]
        }, true);
      };
      el("#ann-slide-add").onclick = () => {
        if (!editingItem || busy) return;
        editingItem.slides.push(newSlide(editingItem.slides.length));
        drawSlides();
      };
      el("#ann-form").onsubmit = async (event) => {
        event.preventDefault();
        const item = editingItem;
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
      el("#ann-delete").onclick = () => void remove(editingItem?.id);
      el("#ann-editor-close").onclick = () => closeEditor();
      el("#ann-editor-cancel").onclick = () => closeEditor();
      el("#ann-editor-panel").addEventListener("click", (event) => {
        if (event.target.id === "ann-editor-panel") closeEditor();
      });
      el("#ann-views-close").onclick = () => closeViews();
      el("#ann-views-panel").addEventListener("click", (event) => {
        if (event.target.id === "ann-views-panel") closeViews();
      });
    }

    function controls() {
      if (!mounted) return;
      root.querySelectorAll("button, input, select, textarea").forEach((node) => { node.disabled = busy || !loaded; });
      el("#ann-add").disabled = busy || !loaded;
    }

    function slideTypeLabel(type) {
      return type === "image" ? "Imagem cheia" : "Cabeçalho + texto";
    }

    // ── Lista principal ──────────────────────────────────────────────────
    function formatVigencia(item) {
      if (!item.starts_at && !item.ends_at) return "Já vale · sem prazo";
      const now = new Date().toISOString().slice(0, 10);
      if (item.ends_at && item.ends_at < now) return `Encerrado em ${formatDateBR(item.ends_at)}`;
      if (item.starts_at && item.starts_at > now) return `A partir de ${formatDateBR(item.starts_at)}`;
      if (item.starts_at && item.ends_at) return `${formatDateBR(item.starts_at)} até ${formatDateBR(item.ends_at)}`;
      if (item.ends_at) return `Até ${formatDateBR(item.ends_at)}`;
      return `A partir de ${formatDateBR(item.starts_at)}`;
    }

    function formatDateBR(isoDate) {
      const [y, m, d] = String(isoDate).split("-");
      return `${d}/${m}/${y}`;
    }

    function drawList() {
      const list = el("#ann-list");
      if (!announcements.length) {
        list.innerHTML = `<p class="ann-empty">Nenhum anúncio cadastrado.</p>`;
        return;
      }
      const iconEdit = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      const iconEye = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      const iconTrash = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

      list.innerHTML = announcements.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((item) => `
        <div class="ann-row" data-id="${esc(item.id)}">
          <div class="ann-row-main">
            <span class="ann-row-title">${esc(item.title)}</span>
            <span class="ann-row-meta">${item.slides.length} slide${item.slides.length === 1 ? "" : "s"}</span>
          </div>
          <div class="ann-row-vigencia">
            <span class="ann-row-vig-value">${esc(formatVigencia(item))}</span>
            <span class="ann-row-meta"><span class="ann-status-dot ${item.active ? "on" : ""}"></span>${item.active ? "Ativo" : "Inativo"}</span>
          </div>
          <div class="ann-row-actions">
            <button type="button" class="users-action-btn" data-action="edit" data-id="${esc(item.id)}" title="Editar">${iconEdit}</button>
            <button type="button" class="users-action-btn" data-action="views" data-id="${esc(item.id)}" title="Ver visualizações">${iconEye}</button>
            <button type="button" class="users-action-btn users-action-delete" data-action="delete" data-id="${esc(item.id)}" title="Remover">${iconTrash}</button>
          </div>
        </div>`).join("");

      list.querySelectorAll('[data-action="edit"]').forEach((btn) => {
        btn.onclick = () => {
          const item = announcements.find((a) => a.id === btn.dataset.id);
          if (item) openEditor(cloneItem(item), false);
        };
      });
      list.querySelectorAll('[data-action="views"]').forEach((btn) => {
        btn.onclick = () => {
          const item = announcements.find((a) => a.id === btn.dataset.id);
          if (item) openViews(item);
        };
      });
      list.querySelectorAll('[data-action="delete"]').forEach((btn) => {
        btn.onclick = () => void remove(btn.dataset.id);
      });
    }

    // ── Painel do editor ─────────────────────────────────────────────────
    function openEditor(item, isNew) {
      editingItem = item;
      editingIsNew = isNew;
      el("#ann-editor-kicker").textContent = isNew ? "Novo anúncio" : "Editar anúncio";
      el("#ann-editor-title").textContent = isNew ? "Novo anúncio" : item.title;
      const form = el("#ann-form");
      form.elements.title.value = item.title;
      form.elements.active.value = String(item.active);
      form.elements.starts_at.value = item.starts_at || "";
      form.elements.ends_at.value = item.ends_at || "";
      el("#ann-delete").hidden = isNew;
      drawSlides();
      el("#ann-editor-panel").classList.add("open");
    }

    function closeEditor() {
      el("#ann-editor-panel").classList.remove("open");
      editingItem = null;
    }

    function drawSlides() {
      const item = editingItem;
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

    // ── Painel de visualizações ──────────────────────────────────────────
    function openViews(item) {
      viewingId = item.id;
      el("#ann-views-title").textContent = item.title;
      el("#ann-views-panel").classList.add("open");
      if (dismissalsLoadedFor === item.id) {
        drawDismissals();
      } else {
        void loadDismissals(item.id);
      }
    }

    function closeViews() {
      el("#ann-views-panel").classList.remove("open");
      viewingId = null;
    }

    function formatDismissedAt(iso) {
      try {
        return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      } catch {
        return iso || "";
      }
    }

    async function loadDismissals(announcementId) {
      dismissalsPending = true;
      el("#ann-views-status").textContent = "Carregando…";
      el("#ann-views-list").innerHTML = "";
      const key = context;
      try {
        const rows = await deps.fetchDismissals(key.org, announcementId);
        if (key !== context || viewingId !== announcementId) return;
        dismissals = rows;
        dismissalsLoadedFor = announcementId;
        drawDismissals();
      } catch (error) {
        if (key === context && viewingId === announcementId) {
          el("#ann-views-status").textContent = `Não foi possível carregar as visualizações: ${error.message}`;
        }
      } finally {
        dismissalsPending = false;
      }
    }

    function drawDismissals() {
      const list = el("#ann-views-list");
      el("#ann-views-status").textContent = dismissals.length
        ? `${dismissals.length} pessoa${dismissals.length === 1 ? "" : "s"} ${dismissals.length === 1 ? "marcou" : "marcaram"} "não exibir mais".`
        : `Ninguém marcou "não exibir mais" para este anúncio ainda.`;
      list.innerHTML = dismissals.map((row) => `
        <div class="ann-view-row">
          <div class="ann-view-row-info">
            <span class="ann-view-row-name">${esc(row.name)}</span>
            <span class="ann-view-row-date">Dispensou em ${esc(formatDismissedAt(row.dismissedAt))}</span>
          </div>
          <button type="button" class="ghost-button compact-button" data-action="reactivate" data-user-id="${esc(row.userId)}">Reativar</button>
        </div>`).join("");
      list.querySelectorAll('[data-action="reactivate"]').forEach((btn) => {
        btn.onclick = () => void reactivate(btn.dataset.userId);
      });
    }

    async function reactivate(userId) {
      if (!viewingId || busy) return;
      const announcementId = viewingId;
      const row = dismissals.find((d) => d.userId === userId);
      const key = context;
      try {
        await deps.reactivateForUser(key.org, announcementId, userId);
        if (key !== context || viewingId !== announcementId) return;
        dismissals = dismissals.filter((d) => d.userId !== userId);
        drawDismissals();
        status(`Anúncio reativado para ${row?.name || "o usuário"}.`);
      } catch (error) {
        if (key === context) status(`Não foi possível reativar: ${error.message}`, true);
      }
    }

    // ── Persistência ─────────────────────────────────────────────────────
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
        closeEditor();
        status("Anúncio salvo.");
        drawList();
      } catch (error) {
        if (key === context) status(`Não foi possível salvar: ${error.message}`, true);
      } finally {
        busy = false; if (key === context) controls();
      }
    }

    async function remove(id) {
      if (busy || !loaded || !allowed() || !id) return;
      const item = announcements.find((a) => a.id === id);
      if (!item) return;
      if (!await deps.confirm(`Remover o anúncio "${item.title}"? Ele deixa de aparecer para os usuários.`, "danger")) return;
      const key = context;
      busy = true; controls();
      try {
        await deps.deleteAnnouncement(key.org, item.id);
        if (key !== context) return;
        announcements = announcements.filter((a) => a.id !== item.id);
        if (editingItem?.id === item.id) closeEditor();
        if (viewingId === item.id) closeViews();
        status("Anúncio removido.");
        drawList();
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
      if (context?.user !== user) {
        loaded = false; announcements = []; dismissals = []; dismissalsLoadedFor = null;
        closeEditor(); closeViews();
      }
      if (pending || loaded) return;
      pending = true; drawList(); controls();
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
        drawList();
      } catch (error) {
        el("#ann-list").innerHTML = `<p class="ann-empty">Não foi possível carregar os anúncios. ${esc(error.message)}</p>`;
      } finally {
        pending = false; controls();
      }
    }

    return { render };
  }

  window.VECTON_ANNOUNCEMENTS_ADMIN = { createAnnouncementsAdminModule };
})(window);
