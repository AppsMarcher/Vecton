(function attachVectonActuals(window) {
  function createActualsModule(deps) {
    const {
      ACTUALS_IMPORT_UPSERT_CHUNK_SIZE,
      MAX_BROWSER_TEXT_IMPORT_BYTES,
      MAX_BROWSER_XLSX_BYTES,
      state,
      views,
      periodTrigger,
      getActiveView,
      getCurrentUser,
      buildEmptyRow,
      buildPeriodDate,
      callSupabaseRpc,
      chunkArray,
      dateMatchesPeriod,
      deleteSupabaseRows,
      ensureReportsDataForYear,
      ensureSeedBranchesInSupabase,
      escapeHtml,
      fetchSupabaseRowsSafe,
      formatActualsFieldName,
      formatActualsStatus,
      formatAmountInput,
      formatDisplayDate,
      formatFileSize,
      formatMonthLabel,
      formatSyncError,
      getActualsStatusClass,
      invalidateReportsForYear,
      isActualsApplyTimeoutError,
      isSupabaseConfigured,
      normalizeBranchCode,
      normalizeCode,
      normalizeDateInput,
      normalizeHeaderName,
      openHeadcountFromCatalog,
      parseLocalizedAmount,
      persistAndRender,
      renderNavigation,
      resolveOrganizationId,
      setSyncStatus,
      upsertSupabaseRows,
      appConfirm,
      openComercialVendasCarga
    } = deps;

    const ACTUALS_LOAD_LABELS = {
      dre: "DRE",
      balanco: "Balanco Patrimonial",
      fluxo: "Fluxo de Caixa",
      volumes: "Volumes de Vendas",
      headcount: "Headcount"
    };

    const ACTUALS_LOAD_TITLES = {
      dre: "Carga do DRE realizado",
      balanco: "Carga do Balanco Patrimonial",
      fluxo: "Carga do Fluxo de Caixa",
      volumes: "Carga de Volumes de Vendas",
      headcount: "Carga de Headcount Realizado"
    };

    let selectedBatchId = state.actualsBatches?.[0]?.id || null;
    let rowsPage = 1;
    let rowsFilter = "";
    let activeErrorRowId = null;
    let selectedLoadType = null;
    const loadingBatchIds = new Set();
    const ROWS_PER_PAGE = 200;
    let sortKey = "rowNumber";
    let sortDir = 1;

    function getSelectedBatchId() {
      return selectedBatchId;
    }

    function setSelectedBatchId(value) {
      selectedBatchId = value || null;
    }

    function getSelectedLoadType() {
      return selectedLoadType;
    }

    function setSelectedLoadType(value) {
      selectedLoadType = value || null;
    }

    function syncBatchSelection() {
      if (!selectedBatchId || !state.actualsBatches.some((batch) => batch.id === selectedBatchId)) {
        selectedBatchId = state.actualsBatches[0]?.id || null;
      }
    }

    function ensureViewShell() {
      const view = views.actualsLoad;
      if (!view || view.dataset.ready === "true") {
        return;
      }

      view.innerHTML = `
        <div id="actuals-catalog" class="actuals-catalog">
          <div class="load-catalog-header"><h2 class="load-catalog-title">Carga de Realizado</h2></div>
          <div class="load-catalog-grid">
            <button class="load-catalog-card load-catalog-card--blue" type="button" data-load-type="dre">
              <span class="lcc-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v18H3z"/><path d="M3 9h18M9 21V9"/></svg>
              </span>
              <strong>DRE</strong>
            </button>
            <button class="load-catalog-card load-catalog-card--purple load-catalog-card--soon" type="button" disabled>
              <span class="lcc-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              </span>
              <strong>Balanço Patrimonial</strong>
            </button>
            <button class="load-catalog-card load-catalog-card--cyan load-catalog-card--soon" type="button" disabled>
              <span class="lcc-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </span>
              <strong>Fluxo de Caixa</strong>
            </button>
            <button class="load-catalog-card load-catalog-card--amber" type="button" data-comercial-carga="vendas">
              <span class="lcc-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.4 5.6A1 1 0 0 0 6.6 20H19"/><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/></svg>
              </span>
              <strong>Volumes de Vendas</strong>
            </button>
            <button class="load-catalog-card load-catalog-card--green" type="button" data-headcount-entry="realizado">
              <span class="lcc-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </span>
              <strong>Headcount</strong>
            </button>
          </div>
        </div>

        <div id="actuals-detail" class="actuals-layout" style="display:none">
          <div class="content-card actuals-intake-card">
            <div class="actuals-intake-header">
              <div class="actuals-intake-controls">
                <button id="actuals-period-button" class="actuals-period-trigger" type="button">
                  <span class="actuals-period-kicker">Periodo</span>
                  <strong id="actuals-period-label">Jun/2026</strong>
                </button>
                <select id="actuals-load-mode" name="loadMode" class="actuals-mode-select">
                  <option value="complete">Carga completa</option>
                  <option value="additional">Carga adicional</option>
                </select>
              </div>
              <a href="https://jwjnvxshtdekzcprmsyl.supabase.co/storage/v1/object/public/Vecton_Templates/modelo-carga-dre.xlsx" download="modelo-carga-dre.xlsx" title="Baixar modelo de carga" style="display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel-alt);color:var(--text-faint);font-size:0.72rem;text-decoration:none;flex-shrink:0;transition:color .15s,border-color .15s" onmouseover="this.style.color='var(--blue)';this.style.borderColor='var(--blue)'" onmouseout="this.style.color='var(--text-faint)';this.style.borderColor='var(--line)'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>Modelo</a>
            </div>
            <form id="actuals-upload-form" class="form-grid actuals-upload-form">
              <label class="full-span">
                Arquivo
                <input id="actuals-file-input" name="file" type="file" accept=".xlsx,.xls,.csv,.txt">
              </label>
              <div class="editor-actions full-span">
                <button class="primary-button" type="submit">Importar arquivo</button>
                <button id="actuals-create-manual-batch" class="ghost-button" type="button">Novo lote manual</button>
                <button class="ghost-button" type="button" data-back-to-actuals-catalog>&larr; Voltar</button>
              </div>
            </form>
            <div id="actuals-upload-feedback" class="actuals-upload-feedback"></div>
          </div>

          <div class="content-card actuals-batch-card">
            <div class="card-toolbar">
              <div>
                <p class="section-kicker">Historico</p>
                <h4 class="inline-card-title">Lotes</h4>
              </div>
            </div>
            <div id="actuals-batch-list" class="actuals-batch-list"></div>
          </div>

          <div class="content-card actuals-detail-card">
            <div class="actuals-detail-head">
              <div class="editor-header actuals-detail-title">
                <p class="section-kicker">Detalhe</p>
                <h4 id="actuals-batch-title">Selecione um lote</h4>
              </div>
              <div class="actuals-detail-actions">
                <button id="actuals-delete-batch" class="delete-button secondary-danger" type="button">Excluir lote</button>
                <button id="actuals-revalidate-batch" class="ghost-button" type="button" style="display:none">Revalidar lote</button>
                <button id="actuals-add-row" class="ghost-button" type="button">Adicionar lancamento</button>
                <button id="actuals-apply-batch" class="primary-button" type="button">Aplicar lote</button>
              </div>
            </div>

            <div id="actuals-batch-summary" class="actuals-summary-grid"></div>

            <div class="actuals-log-shell">
              <div class="actuals-log-head">
                <strong>Log de importacao</strong>
                <span id="actuals-log-caption">Sem lote carregado.</span>
              </div>
              <div id="actuals-error-log" class="actuals-error-log"></div>
            </div>

            <div class="actuals-rows-toolbar">
              <label class="actuals-rows-search">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input id="actuals-rows-search" type="text" placeholder="Buscar por conta, CC, historico, lote...">
              </label>
              <span id="actuals-rows-count" class="actuals-rows-count"></span>
            </div>

            <div class="table-shell actuals-table-shell">
              <table class="data-table actuals-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Data</th>
                    <th>Emp</th>
                    <th>Conta</th>
                    <th>CC</th>
                    <th>Historico</th>
                    <th>Lote</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Acao</th>
                  </tr>
                </thead>
                <tbody id="actuals-rows-body"></tbody>
              </table>
            </div>

            <div id="actuals-rows-pagination" class="actuals-rows-pagination"></div>
          </div>
        </div>
      `;

      view.dataset.ready = "true";
      bindEvents();
    }

    function bindEvents() {
      const actualsView = views.actualsLoad;
      actualsView?.addEventListener("click", (event) => {
        const hcCard = event.target.closest("[data-headcount-entry]");
        if (hcCard && !hcCard.disabled) {
          openHeadcountFromCatalog(hcCard.dataset.headcountEntry, "actualsLoad");
          return;
        }
        const comercialCard = event.target.closest("[data-comercial-carga]");
        if (comercialCard && !comercialCard.disabled) {
          openComercialVendasCarga?.();
          return;
        }
        const card = event.target.closest("[data-load-type]");
        if (card && !card.disabled) {
          selectedLoadType = card.dataset.loadType;
          renderCatalog();
          renderView();
          return;
        }
        if (event.target.closest("[data-back-to-actuals-catalog]")) {
          selectedLoadType = null;
          renderCatalog();
        }
      });

      const uploadForm = document.querySelector("#actuals-upload-form");
      const manualBatchButton = document.querySelector("#actuals-create-manual-batch");
      const addRowButton = document.querySelector("#actuals-add-row");
      const applyBatchButton = document.querySelector("#actuals-apply-batch");
      const deleteBatchButton = document.querySelector("#actuals-delete-batch");
      const periodButton = document.querySelector("#actuals-period-button");
      const batchList = document.querySelector("#actuals-batch-list");
      const rowsBody = document.querySelector("#actuals-rows-body");

      document.querySelector("#actuals-rows-search")?.addEventListener("input", (event) => {
        rowsFilter = event.target.value;
        rowsPage = 1;
        renderRowsTable();
      });

      document.querySelector("#actuals-rows-body")?.closest("table")?.querySelector("thead")?.addEventListener("click", (event) => {
        const th = event.target.closest("th[data-sort]");
        if (!th) return;
        const key = th.dataset.sort;
        sortDir = key === sortKey ? -sortDir : 1;
        sortKey = key;
        rowsPage = 1;
        renderRowsTable();
      });

      uploadForm?.addEventListener("submit", handleUploadSubmit);
      manualBatchButton?.addEventListener("click", handleCreateManualBatch);
      addRowButton?.addEventListener("click", handleAddActualsRow);
      applyBatchButton?.addEventListener("click", handleApplyActualsBatch);
      deleteBatchButton?.addEventListener("click", handleDeleteActualsBatch);
      periodButton?.addEventListener("click", () => periodTrigger?.click());

      batchList?.addEventListener("click", async (event) => {
        const item = event.target.closest("[data-batch-id]");
        if (!item) {
          return;
        }
        selectedBatchId = item.dataset.batchId;
        rowsPage = 1;
        rowsFilter = "";
        renderView();
        await ensureBatchRowsLoaded(selectedBatchId, true);
        renderView();
      });

      rowsBody?.addEventListener("change", async (event) => {
        const rowElement = event.target.closest("tr[data-row-id]");
        if (!rowElement) {
          return;
        }
        await updateRowFromDom(rowElement);
      });

      rowsBody?.addEventListener("click", async (event) => {
        const errorButton = event.target.closest("[data-error-row]");
        if (errorButton) {
          event.stopPropagation();
          const rowId = errorButton.dataset.errorRow;
          activeErrorRowId = activeErrorRowId === rowId ? null : rowId;
          renderRowsTable();
          return;
        }

        const refreshButton = event.target.closest("[data-refresh-row]");
        if (refreshButton) {
          await handleRefreshActualsRow(refreshButton.dataset.refreshRow);
          return;
        }

        const deleteButton = event.target.closest("[data-delete-row]");
        if (!deleteButton) {
          return;
        }
        showDeleteConfirm(() => deleteActualsRow(deleteButton.dataset.deleteRow));
      });

      document.querySelector("#actuals-revalidate-batch")?.addEventListener("click", handleRevalidateActualsBatch);

      document.addEventListener("click", (event) => {
        if (!activeErrorRowId) {
          return;
        }
        if (event.target.closest(".actuals-error-popover") || event.target.closest("[data-error-row]")) {
          return;
        }
        activeErrorRowId = null;
        renderRowsTable();
      });
    }

    function renderCatalog() {
      const catalog = document.querySelector("#actuals-catalog");
      const detail = document.querySelector("#actuals-detail");
      const viewTitle = document.querySelector("#view-title");
      if (!catalog || !detail) return;

      if (selectedLoadType) {
        catalog.style.display = "none";
        detail.style.display = "";
        if (viewTitle && getActiveView() === "actualsLoad") {
          viewTitle.textContent = ACTUALS_LOAD_TITLES[selectedLoadType] || "Carga de realizado";
        }
      } else {
        catalog.style.display = "";
        detail.style.display = "none";
        if (viewTitle && getActiveView() === "actualsLoad") {
          viewTitle.textContent = "Carga de realizado";
        }
      }
    }

    function renderView() {
      const detail = document.querySelector("#actuals-detail");
      if (!detail || detail.style.display === "none") return;
      const periodLabel = document.querySelector("#actuals-period-label");
      const loadModeSelect = document.querySelector("#actuals-load-mode");
      if (!loadModeSelect) {
        return;
      }

      if (periodLabel) {
        periodLabel.textContent = `${formatMonthLabel(state.currentPeriod.month)}/${state.currentPeriod.year}`;
      }
      const selectedBatch = getSelectedActualsBatch();
      if (selectedBatch) {
        loadModeSelect.value = selectedBatch.loadMode;
      }

      renderBatchList();
      renderBatchSummary();
      renderErrorLog();
      renderRowsTable();
    }

    async function ensureBatchRowsLoaded(batchId, force = false) {
      if (!batchId) {
        return;
      }
      if (!force && Array.isArray(state.actualsRowsByBatch[batchId])) {
        return;
      }
      if (loadingBatchIds.has(batchId)) {
        return;
      }

      loadingBatchIds.add(batchId);
      try {
        await loadActualsRows(batchId, force);
      } finally {
        loadingBatchIds.delete(batchId);
      }
    }

    function renderBatchList() {
      const container = document.querySelector("#actuals-batch-list");
      if (!container) return;

      container.innerHTML = "";
      if (!state.actualsBatches.length) {
        const empty = document.createElement("div");
        empty.className = "actuals-empty";
        empty.textContent = "Nenhum lote carregado ainda.";
        container.append(empty);
        return;
      }

      state.actualsBatches.forEach((batch) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "actuals-batch-item";
        if (batch.id === selectedBatchId) {
          button.classList.add("active");
        }
        button.dataset.batchId = batch.id;
        button.innerHTML = `
          <div class="actuals-batch-item-head">
            <strong>${escapeHtml(formatMonthLabel(batch.referenceMonth))}</strong>
            <span class="actuals-badge ${escapeHtml(getActualsStatusClass(batch.status))}">${escapeHtml(formatActualsStatus(batch.status))}</span>
          </div>
          <span>Ano base ${escapeHtml(String(batch.referenceYear))}</span>
          <span>${escapeHtml(batch.sourceType === "manual" ? "Manual" : batch.sourceFileName || "Arquivo")}</span>
          <span>${escapeHtml(batch.loadMode === "complete" ? "Carga completa" : "Carga adicional")} • ${batch.totalRows} linhas</span>
        `;
        container.append(button);
      });
    }

    function renderBatchSummary() {
      const container = document.querySelector("#actuals-batch-summary");
      const title = document.querySelector("#actuals-batch-title");
      const caption = document.querySelector("#actuals-log-caption");
      const applyButton = document.querySelector("#actuals-apply-batch");
      const addRowButton = document.querySelector("#actuals-add-row");
      const deleteBatchButton = document.querySelector("#actuals-delete-batch");
      if (!container || !title || !caption || !applyButton || !addRowButton || !deleteBatchButton) {
        return;
      }

      const batch = getSelectedActualsBatch();
      container.innerHTML = "";

      if (!batch) {
        title.textContent = "Selecione um lote";
        caption.textContent = "Sem lote carregado.";
        applyButton.disabled = true;
        addRowButton.disabled = true;
        deleteBatchButton.disabled = true;
        return;
      }

      title.textContent = `Ano ${batch.referenceYear} • ${formatMonthLabel(batch.referenceMonth)} • ${batch.sourceType === "manual" ? "Lote manual" : (batch.sourceFileName || "Lote importado")}`;
      caption.textContent = batch.errorRows > 0
        ? `${batch.errorRows} linha(s) com erro bloqueando a importacao.`
        : `Lote com ${batch.validRows} linha(s) validas.`;
      applyButton.disabled = batch.totalRows === 0 || batch.errorRows > 0;
      addRowButton.disabled = false;
      deleteBatchButton.disabled = false;
      const revalidateButton = document.querySelector("#actuals-revalidate-batch");
      if (revalidateButton) revalidateButton.style.display = batch.errorRows > 0 ? "" : "none";

      [
        { label: "Ano base", value: String(batch.referenceYear) },
        { label: "Mes da carga", value: formatMonthLabel(batch.referenceMonth) },
        { label: "Tipo", value: batch.loadMode === "complete" ? "Carga completa" : "Carga adicional" },
        { label: "Origem", value: batch.sourceType === "manual" ? "Manual" : batch.sourceFileName || "Arquivo" },
        { label: "Linhas", value: String(batch.totalRows) },
        { label: "Validas", value: String(batch.validRows) },
        { label: "Erros", value: String(batch.errorRows) },
        { label: "Status", value: formatActualsStatus(batch.status) }
      ].forEach((item) => {
        const stat = document.createElement("div");
        stat.className = "actuals-summary-card";
        stat.innerHTML = `<span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong>`;
        container.append(stat);
      });
    }

    function renderRowsPagination(currentPage, totalPages) {
      const container = document.querySelector("#actuals-rows-pagination");
      if (!container) return;
      container.innerHTML = "";
      if (totalPages <= 1) return;

      const nav = document.createElement("div");
      nav.className = "rows-pagination-inner";

      const info = document.createElement("span");
      info.className = "rows-pagination-info";
      info.textContent = `Pagina ${currentPage} de ${totalPages}`;
      nav.append(info);

      const controls = document.createElement("div");
      controls.className = "rows-pagination-controls";

      const btnFirst = buildPaginationBtn("«", currentPage === 1, () => { rowsPage = 1; renderRowsTable(); });
      const btnPrev = buildPaginationBtn("‹ Anterior", currentPage === 1, () => { rowsPage -= 1; renderRowsTable(); });
      const pageButtons = buildPageNumberButtons(currentPage, totalPages);
      const btnNext = buildPaginationBtn("Proximo ›", currentPage === totalPages, () => { rowsPage += 1; renderRowsTable(); });
      const btnLast = buildPaginationBtn("»", currentPage === totalPages, () => { rowsPage = totalPages; renderRowsTable(); });

      controls.append(btnFirst, btnPrev, ...pageButtons, btnNext, btnLast);
      nav.append(controls);
      container.append(nav);
    }

    function buildPaginationBtn(label, disabled, onClick) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rows-pagination-btn";
      btn.textContent = label;
      btn.disabled = disabled;
      if (!disabled) btn.addEventListener("click", onClick);
      return btn;
    }

    function buildPageNumberButtons(currentPage, totalPages) {
      const buttons = [];
      const range = new Set([1, totalPages]);
      for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
        if (page >= 1 && page <= totalPages) range.add(page);
      }
      const sorted = [...range].sort((a, b) => a - b);
      let previous = null;
      sorted.forEach((page) => {
        if (previous !== null && page - previous > 1) {
          const ellipsis = document.createElement("span");
          ellipsis.className = "rows-pagination-ellipsis";
          ellipsis.textContent = "…";
          buttons.push(ellipsis);
        }
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "rows-pagination-btn rows-pagination-page" + (page === currentPage ? " active" : "");
        btn.textContent = String(page);
        if (page !== currentPage) btn.addEventListener("click", () => { rowsPage = page; renderRowsTable(); });
        buttons.push(btn);
        previous = page;
      });
      return buttons;
    }

    async function handleUploadSubmit(event) {
      event.preventDefault();
      const fileInput = document.querySelector("#actuals-file-input");
      const loadMode = document.querySelector("#actuals-load-mode")?.value || "complete";
      const file = fileInput?.files?.[0];

      if (!file) {
        setUploadFeedback("Selecione um arquivo para importar.", "error");
        return;
      }

      if (loadMode === "complete") {
        const confirmed = await appConfirm("Carga completa vai apagar o realizado existente da competencia e substituir. Deseja continuar?", "warn");
        if (!confirmed) {
          return;
        }
      }

      try {
        setUploadFeedback("Lendo arquivo...", "warn");
        const importedRows = await parseActualsFile(file);
        const batch = await createActualsBatch({
          loadMode,
          sourceType: "file",
          sourceFileName: file.name
        });
        const preparedRows = importedRows.map((row, index) => normalizeImportedActualsRow(batch.id, row, index + 1));
        await saveActualsRows(batch.id, preparedRows);
        selectedBatchId = batch.id;
        fileInput.value = "";
        await refreshActualsBatch(batch.id);
        try {
          const applied = await autoApplyActualsBatch(batch.id, { auto: true });
          if (applied) {
            setUploadFeedback(`Carga importada e aplicada com ${preparedRows.length} linha(s).`, "ok");
          } else {
            const refreshedBatch = getActualsBatchById(batch.id);
            if (refreshedBatch?.status === "error") {
              setUploadFeedback("Carga importada, mas nao aplicada porque ha linhas com erro.", "warn");
            } else {
              setUploadFeedback(`Lote criado com ${preparedRows.length} linha(s).`, "ok");
            }
          }
        } catch (applyError) {
          console.error(applyError);
          if (isActualsApplyTimeoutError(applyError)) {
            setUploadFeedback("Carga importada e lote salvo, mas a aplicacao automatica excedeu o tempo limite. Aplique o lote manualmente.", "warn");
          } else {
            setUploadFeedback(`Carga importada, mas a aplicacao automatica falhou: ${String(applyError?.message || applyError)}`, "error");
          }
        }
        renderView();
      } catch (error) {
        console.error(error);
        setUploadFeedback(vpFriendlyError(error, "Falha na importacao."), "error");
      }
    }

    async function handleCreateManualBatch() {
      try {
        const loadMode = document.querySelector("#actuals-load-mode")?.value || "additional";
        const batch = await createActualsBatch({
          loadMode,
          sourceType: "manual",
          sourceFileName: null
        });
        selectedBatchId = batch.id;
        setUploadFeedback("Lote manual criado.", "ok");
        renderView();
      } catch (error) {
        console.error(error);
        setUploadFeedback(vpFriendlyError(error, "Falha ao criar lote manual."), "error");
      }
    }

    async function handleAddActualsRow() {
      try {
        if (!selectedBatchId) {
          await handleCreateManualBatch();
        }
        const rows = getSelectedActualsRows();
        const nextRowNumber = rows.length ? Math.max(...rows.map((row) => row.rowNumber)) + 1 : 1;
        const newRow = normalizeImportedActualsRow(selectedBatchId, {
          entryDate: buildPeriodDate(state.currentPeriod.year, state.currentPeriod.month),
          branchCode: "",
          accountNumber: "",
          costCenterNumber: "",
          history: "",
          lotCode: "",
          amount: ""
        }, nextRowNumber);
        await saveActualsRows(selectedBatchId, [newRow]);
        renderView();
      } catch (error) {
        console.error(error);
        setUploadFeedback(vpFriendlyError(error, "Falha ao adicionar linha manual."), "error");
      }
    }

    async function handleApplyActualsBatch() {
      const batch = getSelectedActualsBatch();
      if (!batch) {
        return;
      }

      try {
        const applied = await autoApplyActualsBatch(batch.id, { auto: false });
        if (applied) {
          setUploadFeedback("Lote aplicado com sucesso.", "ok");
        } else {
          const refreshedBatch = getActualsBatchById(batch.id);
          if (refreshedBatch?.status === "error") {
            setUploadFeedback("Corrija as linhas com erro antes de aplicar o lote.", "error");
          }
        }
      } catch (error) {
        console.error(error);
        if (isActualsApplyTimeoutError(error)) {
          setUploadFeedback("O lote ficou salvo, mas a aplicacao excedeu o tempo limite do banco. Rode o patch de timeout e tente aplicar novamente.", "error");
        } else {
          setUploadFeedback(vpFriendlyError(error, "Falha ao aplicar lote."), "error");
        }
        setSyncStatus(`Erro realizado: ${formatSyncError(error)}`, "error");
      }
    }

    async function autoApplyActualsBatch(batchId, { auto = false } = {}) {
      const batch = getActualsBatchById(batchId);
      if (!batch) return false;
      if (batch.status === "applied") return true;
      if (batch.status === "error" || batch.status === "draft") return false;

      if (batch.loadMode === "complete" && !auto) {
        const confirmed = await appConfirm("Carga completa vai apagar o realizado existente da competencia e substituir. Deseja continuar?", "warn");
        if (!confirmed) return false;
      }

      if (isSupabaseConfigured()) {
        setSyncStatus(auto ? "Aplicando carga no BD..." : "Aplicando lote no BD...", "warn");
        await callSupabaseRpc("apply_actuals_import_batch", { target_batch_id: batch.id });
        invalidateReportsForYear(batch.referenceYear);
        await refreshActualsBatch(batch.id);
        void ensureReportsDataForYear(batch.referenceYear);
        setSyncStatus(auto ? "Carga aplicada no BD" : "Lote aplicado no BD", "ok");
        return true;
      }

      const localBatch = getActualsBatchById(batch.id);
      if (!localBatch || (localBatch.status !== "ready" && localBatch.status !== "applied")) {
        return false;
      }

      localBatch.status = "applied";
      localBatch.appliedAt = new Date().toISOString();
      invalidateReportsForYear(localBatch.referenceYear);
      persistAndRender();
      setSyncStatus(auto ? "Carga aplicada localmente" : "Lote aplicado localmente", "ok");
      return true;
    }

    async function handleDeleteActualsBatch() {
      const batch = getSelectedActualsBatch();
      if (!batch) return;

      const confirmed = await appConfirm("Deseja excluir este lote e todas as suas linhas? Esta acao nao pode ser desfeita.", "danger");
      if (!confirmed) return;

      try {
        if (isSupabaseConfigured()) {
          if (batch.status === "applied") {
            await callSupabaseRpc("delete_actuals_import_batch", { target_batch_id: batch.id });
          } else {
            await deleteSupabaseRows("actuals_import_batches", `id=eq.${encodeURIComponent(batch.id)}`);
          }
        }

        delete state.actualsRowsByBatch[batch.id];
        state.actualsBatches = state.actualsBatches.filter((item) => item.id !== batch.id);
        invalidateReportsForYear(batch.referenceYear);
        selectedBatchId = state.actualsBatches[0]?.id || null;
        if (selectedBatchId) {
          await loadActualsRows(selectedBatchId, true);
        }
        persistAndRender();
        setUploadFeedback("Lote excluido com sucesso.", "ok");
      } catch (error) {
        console.error(error);
        setUploadFeedback(vpFriendlyError(error, "Falha ao excluir lote."), "error");
      }
    }

    async function updateRowFromDom(rowElement) {
      const rowId = rowElement.dataset.rowId;
      const batch = getSelectedActualsBatch();
      const currentRow = getSelectedActualsRows().find((item) => item.id === rowId);
      if (!batch || !currentRow) {
        return;
      }

      const updatedRow = normalizeImportedActualsRow(batch.id, {
        id: currentRow.id,
        rowNumber: currentRow.rowNumber,
        entryDate: rowElement.querySelector('[data-field="entryDate"]').value,
        branchCode: rowElement.querySelector('[data-field="branchCode"]').value,
        accountNumber: rowElement.querySelector('[data-field="accountNumber"]').value,
        costCenterNumber: rowElement.querySelector('[data-field="costCenterNumber"]').value,
        history: rowElement.querySelector('[data-field="history"]').value,
        lotCode: rowElement.querySelector('[data-field="lotCode"]').value,
        amount: rowElement.querySelector('[data-field="amount"]').value
      }, currentRow.rowNumber);

      try {
        rowElement.classList.add("row-saving");
        await saveActualsRows(batch.id, [updatedRow]);
        rowElement.classList.remove("row-saving");
        rowElement.classList.add("row-saved");
        setTimeout(() => rowElement.classList.remove("row-saved"), 1800);
      } catch (error) {
        rowElement.classList.remove("row-saving");
        rowElement.classList.add("row-save-error");
        setTimeout(() => rowElement.classList.remove("row-save-error"), 3000);
        console.error(error);
        setUploadFeedback(vpFriendlyError(error, "Falha ao salvar linha."), "error");
      }
    }

    async function deleteActualsRow(rowId) {
      const batch = getSelectedActualsBatch();
      if (!batch) return;

      try {
        if (isSupabaseConfigured()) {
          await deleteSupabaseRows("actuals_import_rows", `id=eq.${encodeURIComponent(rowId)}`);
        }
        state.actualsRowsByBatch[batch.id] = getSelectedActualsRows().filter((row) => row.id !== rowId);
        await refreshActualsBatch(batch.id);
      } catch (error) {
        console.error(error);
        setUploadFeedback(vpFriendlyError(error, "Falha ao excluir linha."), "error");
      }
    }

    async function createActualsBatch({ loadMode, sourceType, sourceFileName }) {
      const batch = normalizeActualsBatch({
        id: crypto.randomUUID(),
        referenceYear: state.currentPeriod.year,
        referenceMonth: state.currentPeriod.month,
        loadMode,
        sourceType,
        sourceFileName,
        status: "draft",
        totalRows: 0,
        errorRows: 0,
        validRows: 0,
        uploadedAt: new Date().toISOString()
      });

      state.actualsBatches = [batch, ...state.actualsBatches.filter((item) => item.id !== batch.id)];
      state.actualsRowsByBatch[batch.id] = [];

      if (isSupabaseConfigured()) {
        const organizationId = await resolveOrganizationId();
        const [saved] = await upsertSupabaseRows("actuals_import_batches", [{
          id: batch.id,
          organization_id: organizationId,
          reference_year: batch.referenceYear,
          reference_month: batch.referenceMonth,
          load_mode: batch.loadMode,
          source_type: batch.sourceType,
          source_file_name: batch.sourceFileName,
          status: batch.status,
          uploaded_by: getCurrentUser()?.id || null
        }], ["id"]);
        state.actualsBatches = [normalizeActualsBatch(saved), ...state.actualsBatches.filter((item) => item.id !== batch.id)];
      }

      persistAndRender();
      return getActualsBatchById(batch.id);
    }

    async function saveActualsRows(batchId, rows) {
      if (!rows.length) return;

      const validatedRows = rows.map((row) => validateActualsRow(batchId, row));
      const currentRows = state.actualsRowsByBatch[batchId] || [];
      const previousRows = currentRows.slice();
      const merged = new Map(currentRows.map((row) => [row.id, row]));
      validatedRows.forEach((row) => merged.set(row.id, row));
      state.actualsRowsByBatch[batchId] = Array.from(merged.values()).sort((a, b) => a.rowNumber - b.rowNumber);

      try {
        if (isSupabaseConfigured()) {
          const payloadRows = validatedRows.map((row) => ({
            id: row.id,
            batch_id: batchId,
            row_number: row.rowNumber,
            entry_date: row.entryDate || null,
            branch_code: row.branchCode || null,
            account_number: row.accountNumber || null,
            cost_center_number: row.costCenterNumber || null,
            history: row.history || null,
            lot_code: row.lotCode || null,
            amount: row.amount == null || Number.isNaN(Number(row.amount)) ? null : Number(row.amount),
            raw_payload: row.rawPayload || {}
          }));
          const organizationId = await resolveOrganizationId();
          await ensureSeedBranchesInSupabase(organizationId);

          const chunks = chunkArray(payloadRows, ACTUALS_IMPORT_UPSERT_CHUNK_SIZE);
          for (let index = 0; index < chunks.length; index += 1) {
            if (chunks.length > 1) {
              setUploadFeedback(`Gravando lote: bloco ${index + 1} de ${chunks.length}...`, "warn");
            }
            await upsertSupabaseRows("actuals_import_rows", chunks[index], ["id"]);
          }
        }
      } catch (error) {
        state.actualsRowsByBatch[batchId] = previousRows;
        persistAndRender();
        throw error;
      }

      await refreshActualsBatch(batchId);
    }

    async function refreshActualsBatch(batchId) {
      if (isSupabaseConfigured()) {
        const organizationId = await resolveOrganizationId();
        const [batch] = await fetchSupabaseRowsSafe("actuals_import_batches", `id=eq.${batchId}&organization_id=eq.${organizationId}&select=id,reference_year,reference_month,load_mode,source_type,source_file_name,status,total_rows,error_rows,valid_rows,uploaded_at,applied_at&limit=1`);
        if (batch) {
          state.actualsBatches = [
            normalizeActualsBatch(batch),
            ...state.actualsBatches.filter((item) => item.id !== batchId)
          ].sort((a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")));
        }
        await loadActualsRows(batchId, true);
      } else {
        recomputeLocalActualsBatch(batchId);
      }

      persistAndRender();
    }

    async function loadActualsRows(batchId, force = false) {
      if (!batchId) return;
      if (!force && Array.isArray(state.actualsRowsByBatch[batchId])) return;

      if (!isSupabaseConfigured()) {
        state.actualsRowsByBatch[batchId] = state.actualsRowsByBatch[batchId] || [];
        return;
      }

      const pageSize = 1000;
      let allRows = [];
      let offset = 0;

      while (true) {
        const page = await fetchSupabaseRowsSafe(
          "actuals_import_rows",
          `batch_id=eq.${batchId}&select=id,row_number,entry_date,branch_code,account_number,cost_center_number,history,lot_code,amount,validation_status,validation_errors,raw_payload&order=row_number.asc&limit=${pageSize}&offset=${offset}`
        );
        if (!page || page.length === 0) break;
        allRows = allRows.concat(page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }

      state.actualsRowsByBatch[batchId] = allRows.map(normalizeActualsRow);
    }

    function recomputeLocalActualsBatch(batchId) {
      const batch = getActualsBatchById(batchId);
      if (!batch) return;
      const rows = state.actualsRowsByBatch[batchId] || [];
      batch.totalRows = rows.length;
      batch.errorRows = rows.filter((row) => row.validationStatus === "error").length;
      batch.validRows = rows.filter((row) => row.validationStatus === "valid").length;
      batch.status = rows.length === 0 ? "draft" : (batch.errorRows > 0 ? "error" : "ready");
    }

    function showDeleteConfirm(onConfirm) {
      document.querySelector(".vp-delete-confirm")?.remove();
      const pop = document.createElement("div");
      pop.className = "vp-delete-confirm";
      pop.innerHTML = `
        <span>Excluir esta linha?</span>
        <button class="vp-delete-confirm-yes" type="button">Excluir</button>
        <button class="vp-delete-confirm-no" type="button">Cancelar</button>
      `;
      document.body.appendChild(pop);
      pop.querySelector(".vp-delete-confirm-yes").addEventListener("click", () => { pop.remove(); onConfirm(); });
      pop.querySelector(".vp-delete-confirm-no").addEventListener("click", () => pop.remove());
      setTimeout(() => document.addEventListener("click", (e) => { if (!pop.contains(e.target)) pop.remove(); }, { once: true }), 0);
    }

    async function handleRefreshActualsRow(rowId) {
      const batch = getSelectedActualsBatch();
      const row = getSelectedActualsRows().find((r) => r.id === rowId);
      if (!batch || !row) return;
      const btn = document.querySelector(`[data-refresh-row="${rowId}"]`);
      btn?.classList.add("refreshing");
      try {
        await saveActualsRows(batch.id, [row]);
        if (isSupabaseConfigured()) {
          const [fresh] = await fetchSupabaseRowsSafe(
            "actuals_import_rows",
            `id=eq.${encodeURIComponent(rowId)}&select=id,row_number,entry_date,branch_code,account_number,cost_center_number,history,lot_code,amount,validation_status,validation_errors,raw_payload&limit=1`
          );
          if (fresh) {
            const normalized = normalizeActualsRow(fresh);
            state.actualsRowsByBatch[batch.id] = (state.actualsRowsByBatch[batch.id] || []).map((r) =>
              r.id === rowId ? normalized : r
            );
          }
        }
        renderView();
        const freshBtn = document.querySelector(`[data-refresh-row="${rowId}"]`);
        if (freshBtn) {
          freshBtn.classList.add("refresh-ok");
          setTimeout(() => freshBtn.classList.remove("refresh-ok"), 1000);
        }
        setUploadFeedback("Linha revalidada.", "ok");
      } catch (error) {
        console.error(error);
        setUploadFeedback(vpFriendlyError(error, "Falha ao revalidar linha."), "error");
      } finally {
        btn?.classList.remove("refreshing");
      }
    }

    async function handleRevalidateActualsBatch() {
      const batch = getSelectedActualsBatch();
      if (!batch) return;
      try {
        setUploadFeedback("Revalidando lote...", "warn");
        setSyncStatus("Revalidando lote de realizado...", "warn");
        await ensureBatchRowsLoaded(batch.id, true);
        const rows = getSelectedActualsRows();
        if (!rows.length) return;
        const payloadRows = rows.map((r) => ({
          id: r.id,
          batch_id: batch.id,
          row_number: r.rowNumber,
          entry_date: r.entryDate || null,
          branch_code: r.branchCode || null,
          account_number: r.accountNumber || null,
          cost_center_number: r.costCenterNumber || null,
          history: r.history || null,
          lot_code: r.lotCode || null,
          amount: r.amount ?? null,
          raw_payload: r.rawPayload || {}
        }));
        const chunks = chunkArray(payloadRows, ACTUALS_IMPORT_UPSERT_CHUNK_SIZE);
        for (let i = 0; i < chunks.length; i += 1) {
          if (chunks.length > 1) setUploadFeedback(`Revalidando: bloco ${i + 1} de ${chunks.length}...`, "warn");
          await upsertSupabaseRows("actuals_import_rows", chunks[i], ["id"]);
        }
        await refreshActualsBatch(batch.id);
        setSyncStatus("Lote revalidado", "ok");
        setUploadFeedback("Lote revalidado com sucesso.", "ok");
        renderView();
      } catch (error) {
        console.error(error);
        setUploadFeedback(vpFriendlyError(error, "Falha ao revalidar lote."), "error");
        setSyncStatus(`Erro ao revalidar: ${formatSyncError(error)}`, "error");
      }
    }

    function getSelectedActualsBatch() {
      return getActualsBatchById(selectedBatchId);
    }

    function getActualsBatchById(batchId) {
      return state.actualsBatches.find((batch) => batch.id === batchId) || null;
    }

    function getSelectedActualsRows() {
      if (!selectedBatchId) return [];
      return state.actualsRowsByBatch[selectedBatchId] || [];
    }

    function normalizeActualsBatch(row) {
      return {
        id: row.id,
        referenceYear: Number(row.referenceYear ?? row.reference_year ?? state.currentPeriod.year),
        referenceMonth: Number(row.referenceMonth ?? row.reference_month ?? state.currentPeriod.month),
        loadMode: row.loadMode ?? row.load_mode ?? "additional",
        sourceType: row.sourceType ?? row.source_type ?? "file",
        sourceFileName: row.sourceFileName ?? row.source_file_name ?? "",
        status: row.status || "draft",
        totalRows: Number(row.totalRows ?? row.total_rows ?? 0),
        errorRows: Number(row.errorRows ?? row.error_rows ?? 0),
        validRows: Number(row.validRows ?? row.valid_rows ?? 0),
        uploadedAt: row.uploadedAt ?? row.uploaded_at ?? "",
        appliedAt: row.appliedAt ?? row.applied_at ?? ""
      };
    }

    function normalizeActualsRow(row) {
      const rawAmount = row.amount ?? null;
      return {
        id: row.id || crypto.randomUUID(),
        batchId: row.batchId ?? row.batch_id,
        rowNumber: Number(row.rowNumber ?? row.row_number ?? 1),
        entryDate: normalizeDateInput(row.entryDate ?? row.entry_date ?? ""),
        branchCode: String(row.branchCode ?? row.branch_code ?? "").trim(),
        accountNumber: String(row.accountNumber ?? row.account_number ?? "").trim(),
        costCenterNumber: String(row.costCenterNumber ?? row.cost_center_number ?? "").trim(),
        history: String(row.history ?? "").trim(),
        lotCode: String(row.lotCode ?? row.lot_code ?? "").trim(),
        amount: rawAmount == null || rawAmount === "" ? null : Number(rawAmount),
        validationStatus: row.validationStatus ?? row.validation_status ?? "pending",
        validationErrors: Array.isArray(row.validationErrors ?? row.validation_errors) ? (row.validationErrors ?? row.validation_errors) : [],
        rawPayload: row.rawPayload ?? row.raw_payload ?? {}
      };
    }

    function normalizeImportedActualsRow(batchId, row, rowNumber) {
      return normalizeActualsRow({
        id: row.id || crypto.randomUUID(),
        batchId,
        rowNumber: row.rowNumber || rowNumber,
        entryDate: row.entryDate,
        branchCode: normalizeBranchCode(normalizeCode(row.branchCode)),
        accountNumber: normalizeCode(row.accountNumber),
        costCenterNumber: normalizeCode(row.costCenterNumber),
        history: row.history || "",
        lotCode: row.lotCode || "",
        amount: parseLocalizedAmount(row.amount),
        validationStatus: "pending",
        validationErrors: [],
        rawPayload: row.rawPayload || row
      });
    }

    function validateActualsRow(batchId, row) {
      const batch = getActualsBatchById(batchId);
      const errors = [];
      const entryDate = normalizeDateInput(row.entryDate);
      const amount = Number.isFinite(Number(row.amount)) ? Number(row.amount) : NaN;
      const branchCode = normalizeBranchCode(normalizeCode(row.branchCode));
      const accountNumber = normalizeCode(row.accountNumber);
      const costCenterNumber = normalizeCode(row.costCenterNumber);

      if (!entryDate) {
        errors.push("Data obrigatoria");
      } else if (!dateMatchesPeriod(entryDate, batch.referenceYear, batch.referenceMonth)) {
        errors.push("Data fora da competencia do lote");
      }

      if (!branchCode) {
        errors.push("Empresa obrigatoria");
      } else if (!state.branches.some((branch) => branch.code === branchCode)) {
        errors.push("Empresa nao cadastrada");
      }

      if (!accountNumber) {
        errors.push("Conta obrigatoria");
      } else if (!state.accounts.some((account) => normalizeCode(account.number) === accountNumber)) {
        errors.push("Conta nao cadastrada");
      }

      if (costCenterNumber && !state.costCenters.some((cc) => cc.number === costCenterNumber)) {
        errors.push("Centro de custos nao cadastrado");
      }

      if (!Number.isFinite(amount)) {
        errors.push("Valor obrigatorio");
      }

      return {
        ...row,
        entryDate,
        branchCode,
        accountNumber,
        costCenterNumber,
        amount: Number.isFinite(amount) ? Number(amount) : null,
        validationStatus: errors.length ? "error" : "valid",
        validationErrors: errors
      };
    }

    async function parseActualsFile(file) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (extension === "csv" || extension === "txt") {
        if (file.size > MAX_BROWSER_TEXT_IMPORT_BYTES) {
          throw new Error(`Arquivo muito grande para leitura direta no navegador (${formatFileSize(file.size)}). Divida o arquivo ou reduza a carga antes de importar.`);
        }
        const text = await file.text();
        return parseActualsSheetRows(parseDelimitedText(text));
      }

      if (file.size > MAX_BROWSER_XLSX_BYTES) {
        throw new Error(`Arquivo Excel muito grande para importacao no navegador (${formatFileSize(file.size)}). Para esta primeira versao, exporte a aba para CSV ou quebre o arquivo em partes menores.`);
      }

      if (!window.XLSX) {
        throw new Error("Leitor de planilha nao carregado no navegador.");
      }

      const buffer = await file.arrayBuffer();
      let workbook;
      try {
        workbook = window.XLSX.read(buffer, { type: "array", cellDates: true, dense: true });
      } catch (error) {
        if (String(error?.message || error || "").includes("Array buffer allocation failed")) {
          throw new Error(`O navegador nao conseguiu alocar memoria para ler este Excel (${formatFileSize(file.size)}). Exporte a aba para CSV ou reduza o arquivo.`);
        }
        throw error;
      }
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error("Arquivo sem abas para leitura.");
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = window.XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: true });
      return parseActualsSheetRows(rows);
    }

    function parseDelimitedText(text) {
      const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim());
      if (!lines.length) return [];
      const separator = lines[0].includes(";") ? ";" : ",";
      const headers = lines[0].split(separator).map((item) => item.trim());
      return lines.slice(1).map((line) => {
        const parts = line.split(separator);
        return headers.reduce((accumulator, header, index) => {
          accumulator[header] = parts[index] ?? "";
          return accumulator;
        }, {});
      });
    }

    function parseActualsSheetRows(rows) {
      if (!Array.isArray(rows) || !rows.length) {
        throw new Error("Arquivo sem linhas para importacao.");
      }

      const firstRow = rows[0];
      const headerMap = mapActualsHeaders(Object.keys(firstRow));
      const requiredHeaders = ["entryDate", "accountNumber", "branchCode", "amount"];
      const missingHeaders = requiredHeaders.filter((key) => !headerMap[key]);
      if (missingHeaders.length) {
        throw new Error(`Colunas obrigatorias ausentes: ${missingHeaders.map(formatActualsFieldName).join(", ")}`);
      }

      return rows.map((sourceRow) => ({
        entryDate: sourceRow[headerMap.entryDate],
        accountNumber: sourceRow[headerMap.accountNumber],
        branchCode: sourceRow[headerMap.branchCode],
        costCenterNumber: headerMap.costCenterNumber ? sourceRow[headerMap.costCenterNumber] : "",
        history: headerMap.history ? sourceRow[headerMap.history] : "",
        lotCode: headerMap.lotCode ? sourceRow[headerMap.lotCode] : "",
        amount: sourceRow[headerMap.amount],
        rawPayload: sourceRow
      }));
    }

    function mapActualsHeaders(headers) {
      const aliases = {
        entryDate: ["data"],
        accountNumber: ["conta"],
        branchCode: ["empresa", "filial", "filialdeorigem", "empresafilial"],
        costCenterNumber: ["centrodecustos", "centrodecusto", "ccusto", "cc", "custocentro"],
        history: ["historico"],
        lotCode: ["lote", "lotesubdoclinha"],
        amount: ["valor"]
      };

      const result = {};
      headers.forEach((header) => {
        const normalized = normalizeHeaderName(header);
        Object.entries(aliases).forEach(([key, options]) => {
          if (!result[key] && options.includes(normalized)) {
            result[key] = header;
          }
        });
      });
      return result;
    }

    function setUploadFeedback(message, level = "warn") {
      const feedback = document.querySelector("#actuals-upload-feedback");
      if (!feedback) return;
      feedback.textContent = message;
      feedback.classList.remove("is-error", "is-ok", "is-warn");
      feedback.classList.add(level === "error" ? "is-error" : level === "ok" ? "is-ok" : "is-warn");
    }

    function renderErrorLog() {
      const container = document.querySelector("#actuals-error-log");
      if (!container) return;

      container.innerHTML = "";
      const batch = getSelectedActualsBatch();
      if (!batch) {
        container.innerHTML = `<div class="actuals-empty">Sem lote selecionado.</div>`;
        return;
      }
      if (batch.errorRows === 0) {
        container.innerHTML = `<div class="actuals-success-box">Lote sem erros. O resumo fica concentrado no cabecalho do lote.</div>`;
      }
    }

    function renderActualsThead() {
      function th(key, cls, label) {
        const active = sortKey === key;
        const arrow = active ? (sortDir === 1 ? " ↑" : " ↓") : "";
        return `<th class="${cls}" data-sort="${key}" style="cursor:pointer;user-select:none${active ? ";color:var(--blue)" : ""}">${label}${arrow}</th>`;
      }
      return `
        ${th("rowNumber", "actuals-col-row", "#")}
        ${th("entryDate", "actuals-col-date", "Data")}
        ${th("branchCode", "actuals-col-branch", "Emp")}
        ${th("accountNumber", "actuals-col-account", "Conta")}
        ${th("costCenterNumber", "actuals-col-cc", "CC")}
        ${th("history", "actuals-col-history", "Historico")}
        ${th("lotCode", "actuals-col-lot", "Lote")}
        ${th("amount", "actuals-col-amount", "Valor")}
        ${th("validationStatus", "actuals-col-status", "Status")}
        <th class="actuals-col-action">Acao</th>
      `;
    }

    function renderRowsTable() {
      const tbody = document.querySelector("#actuals-rows-body");
      if (!tbody) return;

      const theadRow = tbody.closest("table")?.querySelector("thead tr");
      if (theadRow) theadRow.innerHTML = renderActualsThead();

      tbody.innerHTML = "";
      const batch = getSelectedActualsBatch();
      if (batch && loadingBatchIds.has(batch.id)) {
        tbody.append(buildEmptyRow("Carregando linhas do lote selecionado...", 10));
        renderRowsPagination(0, 0);
        return;
      }

      const allRows = getSelectedActualsRows();
      const filter = rowsFilter.toLowerCase().trim();
      const filtered = filter
        ? allRows.filter((row) =>
            (row.accountNumber || "").toLowerCase().includes(filter) ||
            (row.costCenterNumber || "").toLowerCase().includes(filter) ||
            (row.history || "").toLowerCase().includes(filter) ||
            (row.lotCode || "").toLowerCase().includes(filter) ||
            (row.branchCode || "").toLowerCase().includes(filter) ||
            String(row.rowNumber).includes(filter) ||
            String(row.amount ?? "").includes(filter)
          )
        : allRows;

      const countEl = document.querySelector("#actuals-rows-count");
      if (countEl) {
        countEl.textContent = filter
          ? `${filtered.length} de ${allRows.length} linha(s)`
          : `${allRows.length} linha(s)`;
      }

      if (!filtered.length) {
        tbody.append(buildEmptyRow(filter ? "Nenhuma linha encontrada para este filtro." : "Nenhuma linha carregada para este lote.", 10));
        renderRowsPagination(0, 0);
        return;
      }

      const sorted = filtered.slice().sort((a, b) => {
        if (sortKey === "rowNumber") return sortDir * (a.rowNumber - b.rowNumber);
        if (sortKey === "amount") return sortDir * ((a.amount ?? 0) - (b.amount ?? 0));
        return sortDir * String(a[sortKey] || "").toLowerCase().localeCompare(String(b[sortKey] || "").toLowerCase());
      });

      const totalPages = Math.ceil(sorted.length / ROWS_PER_PAGE);
      rowsPage = Math.min(Math.max(1, rowsPage), totalPages);
      const start = (rowsPage - 1) * ROWS_PER_PAGE;
      const pageRows = sorted.slice(start, start + ROWS_PER_PAGE);

      pageRows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.dataset.rowId = row.id;
        const isErrorOpen = activeErrorRowId === row.id && row.validationStatus === "error";
        const statusCell = row.validationStatus === "error"
          ? `<div class="actuals-status-wrap">
               <button class="actuals-badge is-error actuals-error-trigger" type="button" data-error-row="${row.id}">${escapeHtml(formatActualsStatus(row.validationStatus))}</button>
               ${isErrorOpen ? `<div class="actuals-error-popover"><strong>Diagnostico do erro</strong><ul>${(row.validationErrors || []).map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>` : ""}
             </div>`
          : `<span class="actuals-badge ${escapeHtml(getActualsStatusClass(row.validationStatus))}">${escapeHtml(formatActualsStatus(row.validationStatus))}</span>`;

        tr.innerHTML = `
          <td class="actuals-col-row">${row.rowNumber}</td>
          <td class="actuals-col-date"><input class="actuals-field actuals-field-date" data-field="entryDate" type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" value="${escapeHtml(formatDisplayDate(row.entryDate))}"></td>
          <td class="actuals-col-branch"><input class="actuals-field actuals-field-branch" data-field="branchCode" type="text" inputmode="numeric" maxlength="2" value="${escapeHtml(row.branchCode || "")}"></td>
          <td class="actuals-col-account"><input class="actuals-field actuals-field-account" data-field="accountNumber" type="text" inputmode="numeric" maxlength="12" value="${escapeHtml(row.accountNumber || "")}"></td>
          <td class="actuals-col-cc"><input class="actuals-field actuals-field-cc" data-field="costCenterNumber" type="text" inputmode="numeric" maxlength="8" value="${escapeHtml(row.costCenterNumber || "")}"></td>
          <td class="actuals-col-history"><input class="actuals-field actuals-field-history" data-field="history" type="text" maxlength="35" value="${escapeHtml(row.history || "")}"></td>
          <td class="actuals-col-lot"><input class="actuals-field actuals-field-lot" data-field="lotCode" type="text" maxlength="16" value="${escapeHtml(row.lotCode || "")}"></td>
          <td class="actuals-col-amount"><input class="actuals-field actuals-field-amount" data-field="amount" type="text" maxlength="15" value="${escapeHtml(formatAmountInput(row.amount))}"></td>
          <td class="actuals-col-status">${statusCell}</td>
          <td class="actuals-col-action">
            <button class="table-icon-button table-icon-button-only" type="button" data-refresh-row="${row.id}" aria-label="Revalidar linha"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></button>
            <button class="table-icon-button table-icon-button-only" type="button" data-delete-row="${row.id}" aria-label="Excluir linha"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#vp-icon-trash"></use></svg></button>
          </td>
        `;
        tbody.append(tr);
      });

      renderRowsPagination(rowsPage, totalPages);
    }

    return {
      ACTUALS_LOAD_LABELS,
      ensureViewShell,
      renderCatalog,
      renderView,
      ensureBatchRowsLoaded,
      normalizeActualsBatch,
      getSelectedBatchId,
      setSelectedBatchId,
      getSelectedLoadType,
      setSelectedLoadType,
      syncBatchSelection
    };
  }

  window.VECTON_ACTUALS = {
    createActualsModule
  };
})(window);
