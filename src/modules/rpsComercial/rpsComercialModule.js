(function attachVectonRpsComercialModule(window) {
  // ==========================================================================
  // RPS Comercial — condução/registro da reunião comercial semanal.
  //
  // Módulo novo e independente do RPS Gestão (src/modules/rps/rpsModule.js):
  // não são indicadores numéricos, é ata semanal por região (o que aconteceu
  // na semana anterior, planejamento da semana atual, comentários diversos),
  // cada bloco com carrossel de anexos + texto. Segue o mesmo molde do módulo
  // A3 Estratégico (strategicModule.js) — isolado (tabelas/bucket próprios,
  // migrations 233-234), reaproveitando as classes globais `.rps-carousel-*`
  // de styles.css pro visualizador de anexos, sem o sistema de snapshot/
  // backup/lock do RPS Gestão (poucos campos de texto por semana,
  // recuperáveis pelo histórico normal do banco). Sem perfil de acesso
  // próprio — reaproveita o perfil 'comercial' já existente (pedido do
  // usuário), mesmo critério de can_manage_rps_comercial no banco.
  //
  // Áreas fixas (não é cadastro administrável — mesma decisão de produto
  // que MANAGEMENT_OPTIONS no A3): Norte, Sul, Oeste, Exportação, Peças,
  // Administrativo. Quem tem acesso ao módulo preenche as 6, sem recorte
  // por região nesta v1 (RLS: can_manage_rps_comercial, migration 233).
  // ==========================================================================

  const ATTACHMENT_BUCKET = "rps-comercial-attachments";
  const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // mesmo limite do bucket (migration 234)
  const TABLE_ENTRIES = "rps_comercial_entries";
  const TABLE_ATTACHMENTS = "rps_comercial_attachments";

  const AREAS = [
    { id: "norte", label: "Comercial Norte" },
    { id: "sul", label: "Comercial Sul" },
    { id: "oeste", label: "Comercial Oeste" },
    { id: "exportacao", label: "Comercial Exportação" },
    { id: "pecas", label: "Comercial Peças" },
    { id: "administrativo", label: "Comercial Administrativo" }
  ];

  const BLOCKS = [
    { id: "semana_anterior", field: "semana_anterior_texto", label: "Semana Anterior", placeholder: "O que aconteceu na semana anterior…" },
    { id: "planejamento_atual", field: "planejamento_atual_texto", label: "Planejamento da Semana Atual", placeholder: "O que está planejado para esta semana…" },
    { id: "comentarios", field: "comentarios_texto", label: "Comentários Diversos", placeholder: "Outros comentários…" }
  ];

  // Nome de cada área -> nome da coordenação equivalente em Parâmetros ->
  // Comercial -> Coordenação, pra buscar o gestor cadastrado lá (a busca é
  // por nome, pega qualquer linha existente hoje na tabela — inclusive
  // "Comercial Administrativo", cadastrado direto pela tela, fora do seed
  // original da migration 033).
  const AREA_COORDENACAO_NOME = {
    norte: "Norte",
    sul: "Sul",
    oeste: "Oeste",
    exportacao: "Exportação",
    pecas: "Peças",
    administrativo: "Comercial Administrativo"
  };

  // Mesmas cores da Central de Vendas (COORD_STYLE em
  // src/modules/reports/comercialPainelDataModule.js) — "Administrativo" não
  // existe lá (pedido do usuário: rosa, cor nova só pra esta tela).
  const AREA_ACCENT = {
    norte: "#14b8a6",
    sul: "#4f7cff",
    oeste: "#8b5cf6",
    exportacao: "#22c55e",
    pecas: "#ef4444",
    administrativo: "#ec4899"
  };

  const ICON_TRASH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>`;

  // ------------------------------------------------------------ Semana (segunda-feira como âncora)
  function mondayOf(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0=dom..6=sáb
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }
  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function currentWeekStart() {
    return toISODate(mondayOf(new Date()));
  }
  function addDays(isoDate, days) {
    const d = new Date(`${isoDate}T00:00:00`);
    d.setDate(d.getDate() + days);
    return toISODate(d);
  }
  function formatWeekLabel(weekStart) {
    if (!weekStart) return "";
    const start = new Date(`${weekStart}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    const year = end.getFullYear();
    return `${fmt(start)} – ${fmt(end)} de ${year}`;
  }
  function truncateFileName(name, max = 22) {
    const s = String(name || "arquivo");
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }
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
  function friendlyError(err) {
    const msg = String(err?.message || err || "Erro desconhecido");
    try {
      const parsed = JSON.parse(msg);
      return parsed.message || parsed.error || msg;
    } catch (_) {
      return msg;
    }
  }

  function createRpsComercialModule(deps) {
    const {
      root,
      resolveOrganizationId,
      authenticatedFetch,
      supabaseApiUrl,
      getCurrentUserId,
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
      organizationId: null,
      currentUserId: null,
      weekStart: null,
      loadedWeekStart: null,
      entries: {},       // areaId -> rps_comercial_entries row
      attachments: {},   // entryId -> { [blockId]: rps_comercial_attachments[] }
      presentation: false,
      presentationAreaIndex: 0,
      presentationZoom: 0,
      status: "idle",    // "idle" | "saving" | "error" — mesmo padrão de statusLabel() do rpsModule.js
      message: "",
      lastSavedAt: null,
      coordinators: {},        // nome da coordenação (comercial_coordenacoes.nome) -> gestor
      coordinatorsLoaded: false
    };

    // Pill "Salvo às HH:MM" do cabeçalho — mesma lógica de statusLabel() em
    // rpsModule.js, reaproveitando as classes .rps-status-pill globais.
    function statusLabel() {
      if (state.loading) return "Carregando dados...";
      if (state.status === "saving") return "Salvando alterações...";
      if (state.status === "error") return state.message || "Falha na sincronização";
      if (state.lastSavedAt) return `Salvo às ${state.lastSavedAt}`;
      return "Sincronizado";
    }

    // Atualização leve (sem re-render da árvore inteira) pra não perder foco
    // ou digitação em outro campo enquanto o pill de status pisca.
    function updateStatusElements() {
      const pill = root?.querySelector("[data-rpc-status]");
      const text = root?.querySelector("[data-rpc-status-text]");
      if (pill) pill.dataset.state = state.status;
      if (text) text.textContent = statusLabel();
    }

    // ---------------------------------------------------------------- REST
    async function fetchRest(table, query) {
      const response = await authenticatedFetch(`${supabaseApiUrl}/rest/v1/${table}?${query}`);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    }

    function indexByAreaId(rows) {
      const map = {};
      (rows || []).forEach((row) => { map[row.area_id] = row; });
      return map;
    }

    async function ensureEntriesForWeek(weekStart) {
      const existing = await fetchRest(
        TABLE_ENTRIES,
        `organization_id=eq.${state.organizationId}&period=eq.${weekStart}&select=*`
      );
      const existingAreaIds = new Set(existing.map((row) => row.area_id));
      const missing = AREAS.filter((area) => !existingAreaIds.has(area.id));
      if (!missing.length) {
        state.entries = indexByAreaId(existing);
        return;
      }
      const payload = missing.map((area) => ({
        organization_id: state.organizationId,
        period: weekStart,
        area_id: area.id
      }));
      const response = await authenticatedFetch(
        `${supabaseApiUrl}/rest/v1/${TABLE_ENTRIES}?on_conflict=organization_id,period,area_id`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Prefer": "resolution=ignore-duplicates,return=minimal" },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) throw new Error(await response.text());
      const refreshed = await fetchRest(
        TABLE_ENTRIES,
        `organization_id=eq.${state.organizationId}&period=eq.${weekStart}&select=*`
      );
      state.entries = indexByAreaId(refreshed);
    }

    async function loadAttachments() {
      const ids = Object.values(state.entries).map((entry) => entry.id).filter(Boolean);
      if (!ids.length) { state.attachments = {}; return; }
      const rows = await fetchRest(
        TABLE_ATTACHMENTS,
        `entry_id=in.(${ids.join(",")})&select=*&order=block_type.asc,display_order.asc,created_at.asc`
      );
      const grouped = {};
      rows.forEach((att) => {
        grouped[att.entry_id] = grouped[att.entry_id] || {};
        grouped[att.entry_id][att.block_type] = grouped[att.entry_id][att.block_type] || [];
        grouped[att.entry_id][att.block_type].push(att);
      });
      state.attachments = grouped;
    }

    async function reloadEntry(areaId) {
      const entry = state.entries[areaId];
      if (!entry) return;
      const rows = await fetchRest(TABLE_ENTRIES, `id=eq.${entry.id}&select=*`);
      if (rows[0]) state.entries[areaId] = rows[0];
    }

    function getBlockAttachments(area, block) {
      const entry = state.entries[area.id];
      if (!entry) return [];
      return (state.attachments[entry.id]?.[block.id]) || [];
    }

    // Gestor de cada área, lido de Parâmetros -> Comercial -> Coordenação
    // (tabela comercial_coordenacoes, campo "gestor") — carregado 1x só,
    // não muda com a semana selecionada.
    function coordinatorFor(area) {
      const coordenacaoNome = AREA_COORDENACAO_NOME[area.id];
      if (!coordenacaoNome) return "";
      return state.coordinators[coordenacaoNome] || "";
    }

    async function loadCoordinators() {
      try {
        const rows = await fetchRest("comercial_coordenacoes", `organization_id=eq.${state.organizationId}&select=nome,gestor`);
        const map = {};
        rows.forEach((row) => { map[row.nome] = row.gestor || ""; });
        state.coordinators = map;
      } catch (_err) {
        state.coordinators = {};
      } finally {
        state.coordinatorsLoaded = true;
      }
    }

    // ---------------------------------------------------------------- Carregamento
    async function loadWeek(weekStart) {
      state.loading = true;
      state.error = "";
      renderShell();
      try {
        if (!state.organizationId) state.organizationId = await resolveOrganizationId();
        if (!state.currentUserId) state.currentUserId = getCurrentUserId ? getCurrentUserId() : null;
        if (!state.coordinatorsLoaded) await loadCoordinators();
        await ensureEntriesForWeek(weekStart);
        await loadAttachments();
        state.loadedWeekStart = weekStart;
      } catch (err) {
        state.error = friendlyError(err);
      } finally {
        state.loading = false;
        renderShell();
      }
    }

    function goToWeek(weekStart) {
      state.weekStart = weekStart;
      state.loadedWeekStart = null;
      loadWeek(weekStart);
    }

    function changeWeek(deltaDays) {
      goToWeek(addDays(state.weekStart, deltaDays));
    }

    // ---------------------------------------------------------------- Salvar texto
    async function saveBlockText(area, block, value) {
      const entry = state.entries[area.id];
      if (!entry) return;
      const expectedVersion = entry.version;
      state.status = "saving";
      updateStatusElements();
      try {
        const response = await authenticatedFetch(
          `${supabaseApiUrl}/rest/v1/${TABLE_ENTRIES}?id=eq.${entry.id}&version=eq.${expectedVersion}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "Prefer": "return=representation" },
            body: JSON.stringify({ [block.field]: value, version: expectedVersion + 1, updated_by: state.currentUserId })
          }
        );
        if (!response.ok) throw new Error(await response.text());
        const rows = await response.json();
        if (!rows.length) {
          appAlert?.("Este campo foi atualizado por outra pessoa nesse meio tempo. Recarregando o valor mais recente.", "warn");
          await reloadEntry(area.id);
          state.status = "idle";
          renderShell();
          return;
        }
        state.entries[area.id] = rows[0];
        state.status = "idle";
        state.lastSavedAt = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        updateStatusElements();
      } catch (err) {
        state.status = "error";
        state.message = friendlyError(err);
        updateStatusElements();
        appAlert?.(friendlyError(err), "error");
      }
    }

    // ---------------------------------------------------------------- Anexos
    async function uploadAttachment(area, block, file) {
      const entry = state.entries[area.id];
      const fileId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const safeName = String(file.name || "arquivo").replace(/[^\w.\-]+/g, "_");
      const path = `${state.organizationId}/${entry.period}/${area.id}/${entry.id}/${block.id}/${fileId}_${safeName}`;
      await uploadToStorage(ATTACHMENT_BUCKET, path, file);
      const body = {
        organization_id: state.organizationId,
        entry_id: entry.id,
        block_type: block.id,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        file_size: file.size || null
      };
      try {
        const response = await authenticatedFetch(`${supabaseApiUrl}/rest/v1/${TABLE_ATTACHMENTS}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Prefer": "return=minimal" },
          body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(await response.text());
      } catch (err) {
        await deleteFromStorage(ATTACHMENT_BUCKET, path).catch(() => {});
        throw err;
      }
    }

    async function uploadAttachmentFiles(area, block, fileList) {
      const files = Array.from(fileList || []);
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          appAlert?.(`O arquivo "${file.name}" ultrapassa o limite de 20 MB — não foi enviado.`, "warn");
          continue;
        }
        await uploadAttachment(area, block, file);
      }
    }

    function closeAttachmentCarousel() {
      document.querySelector(".rps-attachment-carousel")?.remove();
      document.body.classList.remove("rps-carousel-open");
    }

    // Reaproveita as classes .rps-carousel-* globais (styles.css) — mesmo
    // visualizador do RPS Gestão e do A3 Estratégico, sem duplicar CSS.
    function openAttachmentCarousel(area, block, startIndex, readOnly = false) {
      closeAttachmentCarousel();
      const attachments = getBlockAttachments(area, block);
      if (!attachments.length) return;

      let activeIndex = startIndex || 0;
      let renderGeneration = 0;
      const signedUrls = new Map();
      const title = `${area.label} · ${block.label}`;
      const carousel = document.createElement("div");
      carousel.className = "rps-attachment-carousel";
      carousel.tabIndex = -1;
      carousel.innerHTML = `
        <section class="rps-carousel-stage" role="dialog" aria-modal="true" aria-labelledby="rpc-carousel-title">
          <header class="rps-carousel-header">
            <div class="rps-carousel-heading">
              <span>Anexos</span>
              <h3 id="rpc-carousel-title">${escapeHtml(title)}</h3>
            </div>
            <div class="rps-carousel-actions">
              <span class="rps-carousel-counter" data-carousel-counter></span>
              ${readOnly ? "" : `<label class="rps-carousel-external rps-carousel-add" title="Adicionar anexo">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" style="margin-right:4px;vertical-align:-1px"><path d="M12 5v14M5 12h14"/></svg>Adicionar
                <input type="file" data-carousel-add-input multiple hidden>
              </label>`}
              <a class="rps-carousel-external" data-carousel-external target="_blank" rel="noopener noreferrer">Abrir arquivo ↗</a>
              <button type="button" class="rps-carousel-close" data-carousel-close aria-label="Fechar">×</button>
            </div>
          </header>
          <main class="rps-carousel-viewport" data-carousel-viewport aria-live="polite"></main>
          ${attachments.length > 1 ? `<button type="button" class="rps-carousel-arrow is-previous" data-carousel-previous aria-label="Anexo anterior">‹</button>
          <button type="button" class="rps-carousel-arrow is-next" data-carousel-next aria-label="Próximo anexo">›</button>` : ""}
          <footer class="rps-carousel-footer">
            <div style="display:flex;align-items:center;gap:12px;min-width:0;">
              <div class="rps-carousel-caption"><strong data-carousel-name></strong><span data-carousel-meta></span></div>
              ${readOnly ? "" : `<button type="button" class="rps-carousel-remove" data-carousel-remove title="Remover este anexo">${ICON_TRASH} Remover</button>`}
            </div>
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
      const addInput = carousel.querySelector("[data-carousel-add-input]");

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

      addInput?.addEventListener("change", async () => {
        if (!addInput.files?.length) return;
        const previousCount = attachments.length;
        addInput.disabled = true;
        try {
          await uploadAttachmentFiles(area, block, addInput.files);
          await loadAttachments();
          renderShell();
          openAttachmentCarousel(area, block, previousCount);
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          addInput.disabled = false;
        }
      });

      const removeCurrent = async () => {
        const att = attachments[activeIndex];
        if (!att) return;
        const ok = await appConfirm?.("Remover este anexo?", "warn");
        if (!ok) return;
        try {
          const response = await authenticatedFetch(
            `${supabaseApiUrl}/rest/v1/${TABLE_ATTACHMENTS}?id=eq.${att.id}`,
            { method: "DELETE" }
          );
          if (!response.ok) throw new Error(await response.text());
          await deleteFromStorage(ATTACHMENT_BUCKET, att.storage_path);
          await loadAttachments();
          renderShell();
          const remaining = getBlockAttachments(area, block);
          if (remaining.length) {
            openAttachmentCarousel(area, block, Math.min(activeIndex, remaining.length - 1));
          } else {
            close();
          }
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
        }
      };

      carousel.addEventListener("click", (event) => {
        if (event.target === carousel || event.target.closest("[data-carousel-close]")) return close();
        if (event.target.closest("[data-carousel-previous]")) return show(activeIndex - 1);
        if (event.target.closest("[data-carousel-next]")) return show(activeIndex + 1);
        if (event.target.closest("[data-carousel-retry]")) { signedUrls.delete(attachments[activeIndex].id); return void renderActive(); }
        if (event.target.closest("[data-carousel-remove]")) return void removeCurrent();
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

    // ---------------------------------------------------------------- CSS
    function ensureStyle() {
      if (document.getElementById("rpc-style")) return;
      const s = document.createElement("style");
      s.id = "rpc-style";
      s.textContent = `
        :root {
          --rpc-bg:#09090a; --rpc-panel:#121317; --rpc-panel-alt:#0f1013;
          --rpc-line:#2a2d34; --rpc-line-soft:rgba(255,255,255,.06);
          --rpc-text:#ffffff; --rpc-soft:#a1a7b3; --rpc-faint:#6b7280; --rpc-blue:#4f7cff;
        }
        .rpc { color:var(--rpc-text); font-family:inherit; }
        .rpc * { box-sizing:border-box; }
        .rpc button, .rpc textarea { font-family:inherit; }
        .rpc > .rps-hero { margin-bottom:16px; }
        .rpc .rps-title-line { row-gap:6px; }
        .rpc .rps-period-chip { display:inline-flex; align-items:center; min-height:34px; padding:0 12px; border-radius:8px; }
        .rpc-loading, .rpc-error { padding:40px; text-align:center; color:var(--rpc-soft); }
        .rpc-week-today { border:none; background:none; color:var(--rpc-blue); font-size:.68rem; cursor:pointer; padding:0; margin-left:4px; }
        .rpc-btn { border-radius:10px; padding:8px 14px; font-size:.78rem; font-weight:600; cursor:pointer; border:1px solid var(--rpc-line); background:transparent; color:var(--rpc-soft); }
        .rpc-btn:hover { background:rgba(255,255,255,.05); color:var(--rpc-text); }
        .rpc-grid { display:grid; grid-template-columns:1fr; gap:16px; }
        .rpc-area-card { background:rgba(12,14,18,.9); border:1px solid var(--rpc-line); border-radius:16px; box-shadow:0 18px 48px rgba(0,0,0,.32); padding:16px 18px; }
        .rpc-area-head { display:flex; align-items:center; gap:10px; margin:0 0 18px; }
        .rpc-area-title { margin:0; font-size:.95rem; letter-spacing:.03em; text-transform:uppercase; color:var(--rpc-text); }
        .rpc-area-coordinator { display:inline-flex; align-items:center; padding:3px 10px; border-radius:8px; border:1px solid var(--rpc-accent, var(--rpc-line)); background:color-mix(in srgb, var(--rpc-accent, var(--rpc-blue)) 16%, transparent); color:var(--rpc-accent, var(--rpc-soft)); font-size:.68rem; font-weight:600; letter-spacing:normal; text-transform:none; }
        .rpc-present-coordinator { display:inline-flex; align-items:center; margin-left:12px; padding:3px 12px; border-radius:8px; border:1px solid var(--rpc-accent, var(--rpc-line)); background:color-mix(in srgb, var(--rpc-accent, var(--rpc-blue)) 16%, transparent); color:var(--rpc-accent, var(--rpc-soft)); font-size:.55em; font-weight:600; letter-spacing:normal; text-transform:none; vertical-align:middle; }
        .rpc-block { margin-bottom:14px; padding:12px; border-radius:12px; background:var(--rpc-panel-alt); border:1px solid var(--rpc-line-soft); }
        .rpc-block:last-child { margin-bottom:0; }
        .rpc-block-head { margin-bottom:8px; }
        .rpc-block-label { font-size:.68rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--rpc-faint); }
        .rpc-block-text { width:100%; min-height:70px; resize:vertical; padding:8px 10px; border-radius:8px; border:1px solid var(--rpc-line); background:var(--rpc-panel); color:var(--rpc-text); font-size:.82rem; line-height:1.4; }
        .rpc-block-text:focus { outline:none; border-color:var(--rpc-blue); }
        .rpc-attachments { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-bottom:8px; }
        .rpc-attachment-chip, .rpc-attachment-add { display:inline-flex; align-items:center; gap:6px; height:26px; border-radius:8px; border:1px solid var(--rpc-line); font-size:.68rem; cursor:pointer; }
        .rpc-attachment-chip { gap:5px; padding:0 6px 0 8px; background:rgba(255,255,255,.04); color:var(--rpc-soft); max-width:220px; }
        .rpc-attachment-chip:hover { border-color:rgba(79,124,255,.4); }
        .rpc-attachment-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .rpc-attachment-remove { background:none; border:none; color:var(--rpc-faint); cursor:pointer; font-size:.9rem; line-height:1; padding:0 0 0 2px; }
        .rpc-attachment-remove:hover { color:#f87171; }
        .rpc-attachment-add { padding:0 10px; border:1px dashed var(--rpc-line); color:var(--rpc-faint); }
        .rpc-attachment-add:hover { border-color:rgba(79,124,255,.4); color:#8fb0ff; }
        .rpc-attachments-empty { font-size:.68rem; color:var(--rpc-faint); margin-bottom:8px; }
        .rpc-attachments-view { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 10px; border-radius:8px; border:1px solid rgba(79,124,255,.38); background:rgba(79,124,255,.08); color:#8fb0ff; font-size:.68rem; cursor:pointer; }
        .rpc-attachments-view:hover { border-color:rgba(79,124,255,.6); background:rgba(79,124,255,.14); }
        .rpc-present { position:fixed; inset:0; z-index:9500; display:flex; flex-direction:column; align-items:center; padding:22px 34px; background:var(--rpc-bg); overflow:auto; }
        .rpc-present > .rps-hero { width:100%; margin-bottom:18px; }
        .rpc-present-areas-row { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:18px; }
        .rpc-present-areas { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:6px; }
        .rpc-present-dot { display:inline-flex; align-items:center; min-height:32px; border-radius:9px; border:1px solid var(--rpc-line); background:transparent; color:var(--rpc-soft); font-size:calc(.7rem + var(--rpc-presentation-zoom, 0px)); padding:0 12px; cursor:pointer; }
        .rpc-present-dot.is-active { background:var(--rpc-blue); border-color:var(--rpc-blue); color:#fff; }
        .rpc-present-title { margin:0 0 18px; font-size:calc(1.6rem + var(--rpc-presentation-zoom, 0px)); text-align:center; text-transform:uppercase; letter-spacing:.03em; }
        .rpc-present-blocks { display:grid; gap:16px; width:100%; max-width:900px; margin:0 auto; }
        .rpc-present-blocks .rpc-block-label { font-size:calc(.68rem + var(--rpc-presentation-zoom, 0px)); }
        .rpc-present-blocks .rpc-block-text { min-height:110px; font-size:calc(.95rem + var(--rpc-presentation-zoom, 0px)); }
      `;
      document.head.append(s);
    }

    // ---------------------------------------------------------------- Render
    function renderBlock(area, entry, block, readOnlyAttachments = false) {
      const attachments = getBlockAttachments(area, block);
      const value = entry?.[block.field] || "";
      return `
        <div class="rpc-block" data-area="${area.id}" data-block="${block.id}">
          <div class="rpc-block-head"><span class="rpc-block-label">${escapeHtml(block.label)}</span></div>
          ${readOnlyAttachments ? renderAttachmentsViewer(area, block, attachments) : renderAttachmentsStrip(area, block, attachments)}
          <textarea class="rpc-block-text" data-area="${area.id}" data-block="${block.id}" placeholder="${escapeHtml(block.placeholder)}" rows="3">${escapeHtml(value)}</textarea>
        </div>
      `;
    }

    function renderAttachmentsStrip(area, block, attachments) {
      const chips = attachments.map((att, index) => `
        <span class="rpc-attachment-chip" data-attachment-open data-area="${area.id}" data-block="${block.id}" data-index="${index}" title="${escapeHtml(att.file_name)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v2"/></svg>
          <span class="rpc-attachment-name">${escapeHtml(truncateFileName(att.file_name))}</span>
          <button type="button" class="rpc-attachment-remove" data-action="remove-attachment" data-attachment-id="${escapeHtml(att.id)}" data-attachment-path="${escapeHtml(att.storage_path)}" title="Remover anexo">&times;</button>
        </span>
      `).join("");
      return `
        <div class="rpc-attachments">
          ${chips}
          <label class="rpc-attachment-add">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
            Anexar
            <input type="file" data-action="upload-attachment" data-area="${area.id}" data-block="${block.id}" multiple hidden>
          </label>
        </div>
      `;
    }

    // Modo apresentação: sem upload/remoção, só um link que abre o carrossel
    // (mesmo openAttachmentCarousel) em popover — ou "Sem anexo" quando vazio.
    function renderAttachmentsViewer(area, block, attachments) {
      if (!attachments.length) {
        return `<div class="rpc-attachments-empty">Sem anexo</div>`;
      }
      return `
        <div class="rpc-attachments">
          <button type="button" class="rpc-attachments-view" data-attachment-open data-area="${area.id}" data-block="${block.id}" data-index="0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v2"/></svg>
            Ver ${attachments.length} anexo${attachments.length > 1 ? "s" : ""}
          </button>
        </div>
      `;
    }

    function renderAreaCard(area) {
      const entry = state.entries[area.id];
      const gestor = coordinatorFor(area);
      const accent = AREA_ACCENT[area.id] || "#4f7cff";
      return `
        <section class="rpc-area-card" data-area="${area.id}">
          <div class="rpc-area-head">
            <h3 class="rpc-area-title">${escapeHtml(area.label)}</h3>
            ${gestor ? `<span class="rpc-area-coordinator" style="--rpc-accent:${accent}">${escapeHtml(gestor)}</span>` : ""}
          </div>
          ${BLOCKS.map((block) => renderBlock(area, entry, block)).join("")}
        </section>
      `;
    }

    function renderShell() {
      if (!root) return;
      ensureStyle();
      root.className = "rpc";

      if (state.loading && !state.loadedWeekStart) {
        root.innerHTML = `<div class="rpc-loading">Carregando…</div>`;
        return;
      }
      if (state.error) {
        root.innerHTML = `<div class="rpc-error">${escapeHtml(state.error)}</div><button type="button" class="rpc-btn" data-action="retry">Tentar de novo</button>`;
        root.querySelector('[data-action="retry"]')?.addEventListener("click", () => loadWeek(state.weekStart));
        return;
      }
      if (state.presentation) {
        renderPresentation();
        return;
      }

      root.innerHTML = `
        ${renderHero()}
        <div class="rpc-grid">
          ${AREAS.map((area) => renderAreaCard(area)).join("")}
        </div>
      `;
      bindShellEvents();
      bindBlockInteractions(root);
    }

    // Mesmo cabeçalho .rps-hero da tela normal, reaproveitado tal e qual no
    // modo apresentação (pedido do usuário) — só o rótulo do botão
    // Apresentar/Sair muda conforme state.presentation.
    function renderHero() {
      return `
        <div class="rps-hero">
          <div class="rps-hero-copy">
            <p class="section-kicker">GESTÃO DE PERFORMANCE</p>
            <div class="rps-title-line">
              <h2>RPS - Comercial</h2>
              <button type="button" class="rps-action" data-action="prev-week" aria-label="Semana anterior">‹</button>
              <span class="rps-period-chip">${escapeHtml(formatWeekLabel(state.weekStart))}</span>
              <button type="button" class="rps-action" data-action="next-week" aria-label="Próxima semana">›</button>
              ${state.weekStart !== currentWeekStart() ? `<button type="button" class="rpc-week-today" data-action="today">Ir para a semana atual</button>` : ""}
            </div>
          </div>
          <div class="rps-toolbar">
            <strong class="rps-status-pill" data-rpc-status data-state="${state.status}"><i></i><span data-rpc-status-text>${escapeHtml(statusLabel())}</span></strong>
            ${state.presentation ? `<button type="button" class="rps-action" data-action="zoom-in" title="Aumentar os textos em 2 pixels">＋ <span>Zoom</span></button>
            <button type="button" class="rps-action" data-action="zoom-out" title="Diminuir os textos em 2 pixels" ${state.presentationZoom <= 0 ? "disabled" : ""}>− <span>Zoom</span></button>` : ""}
            <button type="button" class="rps-action" data-action="refresh" title="Recarregar dados">↻ <span>Atualizar</span></button>
            <button type="button" class="rps-action rps-action-primary" data-action="present">▣ <span>${state.presentation ? "Sair" : "Apresentar"}</span></button>
          </div>
        </div>
      `;
    }

    function renderPresentation() {
      const area = AREAS[state.presentationAreaIndex];
      const entry = state.entries[area.id];
      root.innerHTML = `
        <div class="rpc-present">
          ${renderHero()}
          <div class="rpc-present-areas-row">
            <button type="button" class="rps-action" data-action="present-prev" ${state.presentationAreaIndex === 0 ? "disabled" : ""} aria-label="Área anterior">‹</button>
            <div class="rpc-present-areas">
              ${AREAS.map((a, i) => `<button type="button" class="rpc-present-dot${i === state.presentationAreaIndex ? " is-active" : ""}" data-action="present-goto" data-index="${i}">${escapeHtml(a.label)}</button>`).join("")}
            </div>
            <button type="button" class="rps-action" data-action="present-next" ${state.presentationAreaIndex === AREAS.length - 1 ? "disabled" : ""} aria-label="Próxima área">›</button>
          </div>
          <h2 class="rpc-present-title">${escapeHtml(area.label)}${coordinatorFor(area) ? `<span class="rpc-present-coordinator" style="--rpc-accent:${AREA_ACCENT[area.id] || "#4f7cff"}">${escapeHtml(coordinatorFor(area))}</span>` : ""}</h2>
          <div class="rpc-present-blocks">
            ${BLOCKS.map((block) => renderBlock(area, entry, block, true)).join("")}
          </div>
        </div>
      `;
      bindShellEvents();
      bindPresentationEvents();
      bindBlockInteractions(root);
    }

    // ---------------------------------------------------------------- Eventos
    function bindShellEvents() {
      root.querySelector('[data-action="prev-week"]')?.addEventListener("click", () => changeWeek(-7));
      root.querySelector('[data-action="next-week"]')?.addEventListener("click", () => changeWeek(7));
      root.querySelector('[data-action="today"]')?.addEventListener("click", () => goToWeek(currentWeekStart()));
      root.querySelector('[data-action="refresh"]')?.addEventListener("click", () => loadWeek(state.weekStart));
      root.querySelector('[data-action="present"]')?.addEventListener("click", () => {
        if (state.presentation) exitPresentation(); else enterPresentation();
      });
      root.querySelector('[data-action="zoom-in"]')?.addEventListener("click", () => {
        state.presentationZoom += 2;
        applyPresentationZoom();
        renderShell();
      });
      root.querySelector('[data-action="zoom-out"]')?.addEventListener("click", () => {
        state.presentationZoom = Math.max(0, state.presentationZoom - 2);
        applyPresentationZoom();
        renderShell();
      });
    }

    function applyPresentationZoom() {
      document.body.style.setProperty("--rpc-presentation-zoom", `${state.presentationZoom}px`);
    }

    function bindPresentationEvents() {
      root.querySelector('[data-action="present-prev"]')?.addEventListener("click", () => gotoPresentationArea(state.presentationAreaIndex - 1));
      root.querySelector('[data-action="present-next"]')?.addEventListener("click", () => gotoPresentationArea(state.presentationAreaIndex + 1));
      root.querySelectorAll('[data-action="present-goto"]').forEach((btn) => {
        btn.addEventListener("click", () => gotoPresentationArea(Number(btn.dataset.index)));
      });
    }

    // Reaproveitado tanto pela tela normal quanto pela apresentação — mesmo
    // markup de bloco (.rpc-block-text + tiras de anexo) nas duas.
    function bindBlockInteractions(container) {
      container.querySelectorAll(".rpc-block-text").forEach((textarea) => {
        textarea.addEventListener("blur", async () => {
          const area = AREAS.find((a) => a.id === textarea.dataset.area);
          const block = BLOCKS.find((b) => b.id === textarea.dataset.block);
          if (!area || !block) return;
          const entry = state.entries[area.id];
          const currentValue = entry?.[block.field] || "";
          if (textarea.value === currentValue) return;
          textarea.disabled = true;
          await saveBlockText(area, block, textarea.value);
          textarea.disabled = false;
        });
      });

      container.querySelectorAll('[data-action="upload-attachment"]').forEach((input) => {
        input.addEventListener("change", async () => {
          if (!input.files?.length) return;
          const area = AREAS.find((a) => a.id === input.dataset.area);
          const block = BLOCKS.find((b) => b.id === input.dataset.block);
          input.disabled = true;
          try {
            await uploadAttachmentFiles(area, block, input.files);
            await loadAttachments();
            renderShell();
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
          } finally {
            input.value = "";
            input.disabled = false;
          }
        });
      });

      container.querySelectorAll("[data-attachment-open]").forEach((chip) => {
        chip.addEventListener("click", (e) => {
          if (e.target.closest('[data-action="remove-attachment"]')) return;
          const area = AREAS.find((a) => a.id === chip.dataset.area);
          const block = BLOCKS.find((b) => b.id === chip.dataset.block);
          openAttachmentCarousel(area, block, Number(chip.dataset.index || 0), state.presentation);
        });
      });

      container.querySelectorAll('[data-action="remove-attachment"]').forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ok = await appConfirm?.("Remover este anexo?", "warn");
          if (!ok) return;
          btn.disabled = true;
          try {
            const response = await authenticatedFetch(
              `${supabaseApiUrl}/rest/v1/${TABLE_ATTACHMENTS}?id=eq.${btn.dataset.attachmentId}`,
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

    // ---------------------------------------------------------------- Apresentação
    // Tela cheia no documentElement inteiro (mesmo padrão do RPS Gestão) —
    // nunca numa seção específica: o carrossel de anexos é anexado em
    // document.body (fora de #rps-comercial-view), e a Fullscreen API só
    // renderiza descendentes do elemento fullscreened. Fullscreening a
    // seção deixava o carrossel invisível ao abrir durante a apresentação.
    function enterPresentation() {
      state.presentation = true;
      state.presentationAreaIndex = 0;
      state.presentationZoom = 0;
      applyPresentationZoom();
      renderShell();
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }

    function exitPresentation() {
      state.presentation = false;
      state.presentationZoom = 0;
      document.body.style.removeProperty("--rpc-presentation-zoom");
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      renderShell();
    }

    function gotoPresentationArea(index) {
      if (index < 0 || index >= AREAS.length) return;
      state.presentationAreaIndex = index;
      renderShell();
    }

    function handleFullscreenChange() {
      if (!document.fullscreenElement && state.presentation) {
        state.presentation = false;
        state.presentationZoom = 0;
        document.body.style.removeProperty("--rpc-presentation-zoom");
        renderShell();
      }
    }

    // Ignora teclado enquanto o carrossel de anexos está aberto (ele tem seu
    // próprio handler de Esc/setas) — sem isso, Esc pra fechar o carrossel
    // também derrubava a apresentação inteira.
    function handlePresentationKeydown(event) {
      if (!state.presentation) return;
      if (document.querySelector(".rps-attachment-carousel")) return;
      if (event.key === "Escape") exitPresentation();
      else if (event.key === "ArrowLeft") gotoPresentationArea(state.presentationAreaIndex - 1);
      else if (event.key === "ArrowRight") gotoPresentationArea(state.presentationAreaIndex + 1);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("keydown", handlePresentationKeydown);

    // ---------------------------------------------------------------- API pública
    function render() {
      if (!root) return;
      if (!state.weekStart) state.weekStart = currentWeekStart();
      if (state.loading) { renderShell(); return; }
      if (state.loadedWeekStart !== state.weekStart) { loadWeek(state.weekStart); return; }
      renderShell();
    }

    function destroy() {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("keydown", handlePresentationKeydown);
      closeAttachmentCarousel();
      document.body.style.removeProperty("--rpc-presentation-zoom");
      state.presentation = false;
    }

    return { render, destroy };
  }

  window.VECTON_RPS_COMERCIAL = { createRpsComercialModule };
})(window);
