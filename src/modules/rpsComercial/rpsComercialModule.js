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

  const MONTHS_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  function createRpsComercialModule(deps) {
    const {
      root,
      resolveOrganizationId,
      authenticatedFetch,
      callSupabaseRpc,
      supabaseApiUrl,
      getCurrentUserId,
      appAlert,
      appConfirm,
      uploadToStorage,
      createStorageSignedUrl,
      deleteFromStorage,
      escapeHtml
    } = deps;

    // Painel de Vendas (popover do modo apresentação): reaproveita tal e qual
    // o motor de dados do relatório real (transform/buildCoordDetail/
    // miniHtml/pecasVendLines em comercialPainelDataModule.js) — mesma
    // regra do arquivo de origem: nenhuma tela pode ter sua própria conta.
    const {
      transform: painelTransform,
      buildCoordDetail: painelBuildCoordDetail,
      miniHtml: painelMiniHtml,
      pecasVendLines: painelPecasVendLines
    } = window.VECTON_COMERCIAL_PAINEL_DATA || {};

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

    function findAttachment(attachmentId) {
      for (const entryId in state.attachments) {
        const byBlock = state.attachments[entryId];
        for (const blockId in byBlock) {
          const found = byBlock[blockId].find((a) => a.id === attachmentId);
          if (found) return found;
        }
      }
      return null;
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

    // ---------------------------------------------------------------- Painel de Vendas (popover)
    function weekMonthYear() {
      const d = new Date(`${state.weekStart}T00:00:00`);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    }

    // Mesma preferência de cenário do Painel de Vendas real (loadScenarios em
    // reportsComercialPainelModule.js): prioriza Fcst/5+7, senão o primeiro,
    // senão Budget (scenario_id nulo) — sem isso o popover podia mostrar
    // números de um cenário diferente do que a tela oficial mostraria.
    async function pickScenarioId(orgId, year) {
      try {
        const rows = await fetchRest(
          "forecast_scenarios",
          `organization_id=eq.${orgId}&reference_year=eq.${year}&order=created_at.asc&select=id,name`
        );
        const fcst = (rows || []).find((s) => /fcst|5\s*\+\s*7/i.test(s.name || ""));
        return (fcst || rows?.[0])?.id || null;
      } catch (_err) {
        return null;
      }
    }

    let vendasPopoverEl = null;
    function closeVendasPopover() {
      if (!vendasPopoverEl) return;
      vendasPopoverEl.remove();
      vendasPopoverEl = null;
      document.removeEventListener("keydown", handleVendasPopoverKeydown);
    }
    function handleVendasPopoverKeydown(event) {
      if (event.key === "Escape") closeVendasPopover();
    }

    // Reproduz o cartão "consolidado + território a território" do Painel de
    // Vendas real pra uma coordenação, no mês da semana selecionada — sem o
    // drill de transações (scope sempre null: só os cartões, como pedido).
    async function openVendasPopover(area) {
      closeVendasPopover();
      if (!painelTransform || !painelBuildCoordDetail || !painelMiniHtml) return;
      const coordNome = AREA_COORDENACAO_NOME[area.id];
      const { year, month } = weekMonthYear();
      const accent = AREA_ACCENT[area.id] || "#4f7cff";

      const backdrop = document.createElement("div");
      backdrop.className = "rpc-vendas-backdrop";
      backdrop.innerHTML = `
        <div class="rpc-vendas-panel">
          <button type="button" class="rpc-vendas-close" aria-label="Fechar">✕</button>
          <div class="rpc-vendas-body cvp" data-vendas-body><div class="cvp-empty">Carregando painel de vendas…</div></div>
        </div>
      `;
      document.body.appendChild(backdrop);
      vendasPopoverEl = backdrop;
      backdrop.addEventListener("click", (event) => { if (event.target === backdrop) closeVendasPopover(); });
      backdrop.querySelector(".rpc-vendas-close").addEventListener("click", closeVendasPopover);
      document.addEventListener("keydown", handleVendasPopoverKeydown);

      const body = backdrop.querySelector("[data-vendas-body]");
      if (!coordNome) {
        body.innerHTML = `<div class="cvp-empty">${escapeHtml(area.label)} não tem uma coordenação de vendas equivalente cadastrada.</div>`;
        return;
      }
      try {
        if (!state.organizationId) state.organizationId = await resolveOrganizationId();
        const orgId = state.organizationId;
        const scenarioId = await pickScenarioId(orgId, year);
        const basePayload = { p_org: orgId, p_year: year, p_month: month, p_period: "mes" };
        const [rows, pecasVendRows] = await Promise.all([
          callSupabaseRpc("comercial_painel_vendas", { ...basePayload, p_scenario_id: scenarioId }),
          coordNome === "Peças"
            ? callSupabaseRpc("comercial_painel_pecas_vendedor", basePayload).catch(() => [])
            : Promise.resolve([])
        ]);
        if (vendasPopoverEl !== backdrop) return; // fechou (ou trocou de área) enquanto carregava
        const { coords, regioes } = painelTransform(rows || []);
        const det = painelBuildCoordDetail(coordNome, coords, regioes);
        if (!det) {
          body.innerHTML = `<div class="cvp-empty">Sem dados de vendas pra ${escapeHtml(coordNome)} em ${MONTHS_FULL[month - 1]}/${year}.</div>`;
          return;
        }
        const cards = [];
        if (det.isPecas) {
          const consPecas = det.consolidado.pecas;
          cards.push(painelMiniHtml(coordNome.toUpperCase(), det.coord.gestor || "", null, null, consPecas, true, null, null, year, escapeHtml));
          const vendCards = painelPecasVendLines ? painelPecasVendLines(consPecas, pecasVendRows) : [];
          if (vendCards.length) {
            vendCards.forEach((vc) => cards.push(painelMiniHtml(vc.label, vc.sub, null, null, vc.line, false, null, null, year, escapeHtml)));
          } else {
            det.territorios.forEach((t) => cards.push(painelMiniHtml(t.terr, t.resp, null, null, t.pecas, false, null, null, year, escapeHtml)));
          }
        } else {
          cards.push(painelMiniHtml(coordNome.toUpperCase(), det.coord.gestor || "", det.consolidado.grao, det.consolidado.pec, null, true, null, det.consolidado.memo, year, escapeHtml));
          det.territorios.forEach((t) => cards.push(painelMiniHtml(t.terr, t.resp, t.grao, t.pec, null, false, null, null, year, escapeHtml)));
        }
        body.innerHTML = `
          <div class="cvp-detail" style="--accent:${accent};--accent-soft:${accent}26">
            <div class="cvp-detail-head">
              <h2><span class="cvp-dot"></span>${escapeHtml(coordNome)}</h2>
              <span class="cvp-note">${MONTHS_FULL[month - 1]}/${year} · Consolidado + território a território</span>
            </div>
            <div class="cvp-mini-grid">${cards.join("")}</div>
          </div>
        `;
      } catch (err) {
        if (vendasPopoverEl !== backdrop) return;
        body.innerHTML = `<div class="cvp-empty">${escapeHtml(friendlyError(err))}</div>`;
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

    // Comentário por anexo (comment_text, migration 236) — sem coluna de
    // versão em rps_comercial_attachments (diferente de rps_comercial_
    // entries), então é um PATCH direto por id. Atualiza o objeto em
    // memória (mesma referência guardada em state.attachments) pra não
    // precisar recarregar tudo nem perder a posição do carrossel.
    async function saveAttachmentComment(att, value) {
      const response = await authenticatedFetch(
        `${supabaseApiUrl}/rest/v1/${TABLE_ATTACHMENTS}?id=eq.${att.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "Prefer": "return=minimal" },
          body: JSON.stringify({ comment_text: value })
        }
      );
      if (!response.ok) throw new Error(await response.text());
      att.comment_text = value;
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
          <div class="rps-carousel-comment" data-carousel-comment></div>
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
      const commentWrap = carousel.querySelector("[data-carousel-comment]");

      // Comentário deste anexo — abaixo da imagem (pedido do usuário: cada
      // anexo tem seu próprio comentário, não mais um só campo por bloco).
      // Editável só fora do modo apresentação; no modo apresentação mostra
      // como texto fixo, e some se não houver comentário.
      const renderComment = (att) => {
        const value = att.comment_text || "";
        if (readOnly) {
          commentWrap.style.display = value ? "" : "none";
          commentWrap.innerHTML = value ? `<p class="rps-carousel-comment-text"><span class="rps-carousel-comment-label">Comentário:</span> ${escapeHtml(value)}</p>` : "";
          return;
        }
        commentWrap.style.display = "";
        commentWrap.innerHTML = `
          <div class="rps-carousel-comment-field">
            <span class="rps-carousel-comment-label">Comentário</span>
            <textarea class="rps-carousel-comment-input" data-carousel-comment-input placeholder="Escreva um comentário para este anexo…">${escapeHtml(value)}</textarea>
          </div>
        `;
        const input = commentWrap.querySelector("[data-carousel-comment-input]");
        input.addEventListener("blur", async () => {
          const newValue = input.value;
          if (newValue === (att.comment_text || "")) return;
          input.disabled = true;
          try {
            await saveAttachmentComment(att, newValue);
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
          } finally {
            input.disabled = false;
          }
        });
      };

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
        renderComment(att);
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
        .rpc-attachments-list { display:flex; flex-direction:column; gap:8px; margin-bottom:8px; }
        .rpc-attachment-item { padding:8px; border-radius:8px; border:1px solid var(--rpc-line); background:rgba(255,255,255,.03); }
        .rpc-attachment-item-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .rpc-attachment-item-open { display:flex; flex:1; align-items:center; min-width:0; gap:6px; padding:0; border:none; background:none; color:var(--rpc-soft); font-size:.68rem; cursor:pointer; }
        .rpc-attachment-item-open:hover { color:var(--rpc-text); }
        .rpc-attachment-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .rpc-attachment-remove { background:none; border:none; color:var(--rpc-faint); cursor:pointer; font-size:.9rem; line-height:1; padding:0 0 0 2px; flex-shrink:0; }
        .rpc-attachment-remove:hover { color:#f87171; }
        .rpc-attachment-comment { width:100%; min-height:42px; margin-top:6px; padding:6px 8px; resize:vertical; border-radius:6px; border:1px solid var(--rpc-line); background:var(--rpc-panel); color:var(--rpc-text); font-size:.74rem; line-height:1.35; overflow-wrap:anywhere; }
        .rpc-attachment-comment:focus { outline:none; border-color:var(--rpc-blue); }
        .rpc-attachment-add { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 10px; border-radius:8px; border:1px dashed var(--rpc-line); color:var(--rpc-faint); font-size:.68rem; cursor:pointer; }
        .rpc-attachment-add:hover { border-color:rgba(79,124,255,.4); color:#8fb0ff; }
        .rpc-attachments-empty { font-size:.68rem; color:var(--rpc-faint); margin-bottom:8px; }
        .rpc-attachments-thumbs { gap:8px; }
        .rpc-attachment-thumb { display:grid; place-items:center; width:110px; height:110px; padding:0; border-radius:10px; border:1px solid var(--rpc-line); background:rgba(255,255,255,.04); color:var(--rpc-faint); overflow:hidden; cursor:pointer; }
        .rpc-attachment-thumb:hover { border-color:rgba(79,124,255,.55); }
        .rpc-attachment-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
        .rpc-attachment-thumb-icon { font-size:2.2rem; }
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
        .rpc-vendas-backdrop { position:fixed; inset:0; z-index:9700; background:rgba(0,0,0,.72); display:flex; align-items:center; justify-content:center; padding:5vh 5vw; }
        .rpc-vendas-panel { position:relative; width:90vw; height:90vh; background:#09090a; border:1px solid #2a2d34; border-radius:16px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 30px 90px rgba(0,0,0,.6); }
        .rpc-vendas-close { position:absolute; top:14px; right:14px; z-index:2; width:32px; height:32px; border-radius:8px; border:1px solid var(--rpc-line); background:rgba(255,255,255,.06); color:#fff; cursor:pointer; font-size:15px; }
        .rpc-vendas-close:hover { background:rgba(255,255,255,.12); }
        .rpc-vendas-body { flex:1; min-height:0; overflow:auto; padding:24px; }
        /* Subconjunto de .cvp-* do Painel de Vendas (reportsComercialPainelModule.js)
           — mesmas classes, reaproveitadas tal e qual pra o cartão de
           coordenação/território ficar idêntico ao relatório real. */
        .cvp { --cvp-bg:#09090a; --cvp-bg-soft:#0e0e10; --cvp-panel:#121317; --cvp-panel-hover:#191b20; --cvp-line:#2a2d34; --cvp-text:#fff; --cvp-soft:#a1a7b3; --cvp-faint:#6b7280; --cvp-pos:#4ade80; --cvp-neg:#f87171; color:var(--cvp-text); }
        .cvp * { box-sizing:border-box; }
        .cvp-detail { background:var(--cvp-panel); border:1px solid var(--cvp-line); border-radius:16px; overflow:hidden; }
        .cvp-detail-head { display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid var(--cvp-line); flex-wrap:wrap; gap:6px; }
        .cvp-detail-head h2 { font-size:15px; font-weight:600; margin:0; display:flex; align-items:center; gap:8px; text-transform:uppercase; letter-spacing:.03em; }
        .cvp-dot { width:8px; height:8px; border-radius:50%; background:var(--accent); }
        .cvp-note { font-size:12px; color:var(--cvp-faint); text-transform:none; letter-spacing:0; }
        .cvp-mini-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; padding:16px; }
        .cvp-mini { border:1px solid var(--cvp-line); border-radius:10px; overflow:hidden; background:var(--cvp-bg-soft); min-width:0; }
        .cvp-mini-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; padding:9px 10px; background:rgba(255,255,255,.03); border-bottom:1px solid var(--cvp-line); }
        .cvp-mini-terr { font-size:13px; font-weight:700; letter-spacing:.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .cvp-mini-terr .cvp-mini-sep { color:var(--cvp-faint); font-weight:400; margin:0 2px; }
        .cvp-mini-name { font-size:10.5px; color:var(--cvp-faint); font-weight:500; white-space:nowrap; }
        .cvp-mini-status { display:flex; align-items:center; gap:6px; font-size:10.5px; font-weight:600; color:var(--cvp-soft); white-space:nowrap; flex-shrink:0; }
        .cvp-mini-status::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--dot-color,#6b7280); box-shadow:0 0 0 3px var(--dot-glow,rgba(107,114,128,.15)); flex-shrink:0; }
        .cvp-mini.sum { border-color:var(--accent); } .cvp-mini.sum .cvp-mini-head { background:var(--accent-soft); } .cvp-mini.sum .cvp-mini-terr { color:var(--accent); }
        .cvp-mini-wrap { overflow-x:auto; }
        .cvp-mini-tbl { width:100%; border-collapse:collapse; table-layout:fixed; }
        .cvp-mini-tbl th, .cvp-mini-tbl td { padding:5px 4px; font-size:10.3px; text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .cvp-mini-tbl th:first-child, .cvp-mini-tbl td:first-child { width:78px; text-align:left; }
        .cvp-mini-tbl th { color:var(--cvp-faint); font-weight:500; font-size:9px; text-transform:uppercase; letter-spacing:.03em; }
        .cvp-mini-tbl td:first-child { color:var(--cvp-soft); font-size:9.5px; text-transform:uppercase; letter-spacing:.03em; }
        .cvp-mini-tbl tbody tr:not(:last-child) td { border-bottom:1px solid rgba(255,255,255,.05); }
        .cvp-mini-tbl tr.fat td { font-weight:600; font-size:9.3px; color:var(--cvp-text); border-top:1px solid var(--cvp-line); }
        .cvp-mini-tbl tr.tkt td { font-size:9.3px; color:var(--cvp-soft); }
        .cvp-mini-tbl tr.memo td { color:var(--cvp-faint); font-style:italic; opacity:.85; }
        .cvp-mini-tbl tr.memo + tr td { border-top:1px dashed rgba(255,255,255,.12); }
        .cvp-mini-foot { padding:0 2px 2px; font-size:9px; font-style:italic; color:var(--cvp-faint); line-height:1.35; }
        .cvp-empty { padding:40px; text-align:center; color:var(--cvp-faint); }
        @media (max-width:900px) { .cvp-mini-grid { grid-template-columns:1fr; } }
      `;
      document.head.append(s);
    }

    // ---------------------------------------------------------------- Render
    // Comentário passou a ser por anexo (campo comment_text, editado dentro
    // do carrossel — abre-se o anexo, comenta ali mesmo). O textarea do
    // bloco inteiro só aparece quando não há nenhum anexo: nesse caso não
    // tem onde comentar por anexo, então mantém a nota livre de antes.
    function renderBlock(area, entry, block, readOnlyAttachments = false) {
      const attachments = getBlockAttachments(area, block);
      const value = entry?.[block.field] || "";
      const showBlockText = attachments.length === 0;
      return `
        <div class="rpc-block" data-area="${area.id}" data-block="${block.id}">
          <div class="rpc-block-head"><span class="rpc-block-label">${escapeHtml(block.label)}</span></div>
          ${readOnlyAttachments ? renderAttachmentsViewer(area, block, attachments) : renderAttachmentsStrip(area, block, attachments)}
          ${showBlockText ? `<textarea class="rpc-block-text" data-area="${area.id}" data-block="${block.id}" placeholder="${escapeHtml(block.placeholder)}" rows="3">${escapeHtml(value)}</textarea>` : ""}
        </div>
      `;
    }

    // Cada anexo vira um item com nome + remover + campo de comentário logo
    // abaixo (pedido do usuário: o campo de comentário tem que aparecer na
    // tela normal assim que o arquivo é anexado, não só dentro do carrossel).
    function renderAttachmentsStrip(area, block, attachments) {
      const items = attachments.map((att, index) => `
        <div class="rpc-attachment-item">
          <div class="rpc-attachment-item-head">
            <button type="button" class="rpc-attachment-item-open" data-attachment-open data-area="${area.id}" data-block="${block.id}" data-index="${index}" title="Abrir ${escapeHtml(att.file_name)}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v2"/></svg>
              <span class="rpc-attachment-name">${escapeHtml(truncateFileName(att.file_name))}</span>
            </button>
            <button type="button" class="rpc-attachment-remove" data-action="remove-attachment" data-attachment-id="${escapeHtml(att.id)}" data-attachment-path="${escapeHtml(att.storage_path)}" title="Remover anexo">&times;</button>
          </div>
          <textarea class="rpc-attachment-comment" data-action="attachment-comment" data-attachment-id="${escapeHtml(att.id)}" placeholder="Comentário deste anexo…" rows="2">${escapeHtml(att.comment_text || "")}</textarea>
        </div>
      `).join("");
      return `
        <div class="rpc-attachments-list">
          ${items}
          <label class="rpc-attachment-add">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
            Anexar
            <input type="file" data-action="upload-attachment" data-area="${area.id}" data-block="${block.id}" multiple hidden>
          </label>
        </div>
      `;
    }

    function attachmentThumbIcon(kind) {
      if (kind === "pdf") return "▧";
      if (kind === "video") return "▶";
      if (kind === "audio") return "♫";
      return "▤";
    }

    // Modo apresentação: sem upload/remoção — miniaturas clicáveis (imagem de
    // verdade pra fotos, já que é o tipo mais comum aqui; ícone genérico pra
    // PDF/vídeo/áudio/outros) que abrem o carrossel naquele anexo. "Sem
    // anexo" quando vazio. As miniaturas de imagem são preenchidas depois
    // (hydrateThumbnails), pra não travar o render esperando as URLs
    // assinadas do Storage.
    function renderAttachmentsViewer(area, block, attachments) {
      if (!attachments.length) {
        return `<div class="rpc-attachments-empty">Sem anexo</div>`;
      }
      const thumbs = attachments.map((att, index) => {
        const kind = attachmentMediaKind(att);
        const label = escapeHtml(att.file_name || `Arquivo ${index + 1}`);
        const inner = kind === "image"
          ? `<img data-thumb-img data-attachment-id="${escapeHtml(att.id)}" data-storage-path="${escapeHtml(att.storage_path)}" alt="${label}">`
          : `<span class="rpc-attachment-thumb-icon">${attachmentThumbIcon(kind)}</span>`;
        return `
          <button type="button" class="rpc-attachment-thumb" data-attachment-open data-area="${area.id}" data-block="${block.id}" data-index="${index}" title="Clique na imagem para tela cheia">
            ${inner}
          </button>
        `;
      }).join("");
      return `<div class="rpc-attachments rpc-attachments-thumbs">${thumbs}</div>`;
    }

    // Cache simples de URL assinada por anexo (miniaturas de imagem), pra
    // não pedir de novo ao trocar de área/semana e voltar.
    const thumbnailUrlCache = new Map();
    async function hydrateThumbnails(container) {
      const imgs = Array.from(container.querySelectorAll("img[data-thumb-img]"));
      await Promise.all(imgs.map(async (img) => {
        const attachmentId = img.dataset.attachmentId;
        try {
          let url = thumbnailUrlCache.get(attachmentId);
          if (!url) {
            url = await createStorageSignedUrl(ATTACHMENT_BUCKET, img.dataset.storagePath, 3600);
            thumbnailUrlCache.set(attachmentId, url);
          }
          img.src = url;
        } catch (_err) {
          img.closest(".rpc-attachment-thumb")?.replaceChildren(
            Object.assign(document.createElement("span"), { className: "rpc-attachment-thumb-icon", textContent: attachmentThumbIcon("image") })
          );
        }
      }));
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
            ${state.presentation ? `<button type="button" class="rps-action" data-action="vendas-popover" title="Painel de Vendas desta coordenação, no mês da reunião">📊 <span>Painel de Vendas</span></button>
            <button type="button" class="rps-action" data-action="zoom-in" title="Aumentar os textos em 2 pixels">＋ <span>Zoom</span></button>
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
      void hydrateThumbnails(root);
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
      root.querySelector('[data-action="vendas-popover"]')?.addEventListener("click", () => {
        openVendasPopover(AREAS[state.presentationAreaIndex]);
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

      container.querySelectorAll('[data-action="attachment-comment"]').forEach((textarea) => {
        textarea.addEventListener("blur", async () => {
          const att = findAttachment(textarea.dataset.attachmentId);
          if (!att) return;
          if (textarea.value === (att.comment_text || "")) return;
          textarea.disabled = true;
          try {
            await saveAttachmentComment(att, textarea.value);
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
          } finally {
            textarea.disabled = false;
          }
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
      closeVendasPopover();
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
      if (document.querySelector(".rps-attachment-carousel") || vendasPopoverEl) return;
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
      closeVendasPopover();
      document.body.style.removeProperty("--rpc-presentation-zoom");
      state.presentation = false;
    }

    return { render, destroy };
  }

  window.VECTON_RPS_COMERCIAL = { createRpsComercialModule };
})(window);
