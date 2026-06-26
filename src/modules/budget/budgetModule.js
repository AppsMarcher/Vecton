(function attachVectonBudget(window) {
  function createBudgetModule(deps) {
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
      chunkArray,
      ensureBudgetReportsDataForYear,
      ensureSeedBranchesInSupabase,
      escapeHtml,
      fetchSupabaseRowsSafe,
      formatActualsFieldName,
      formatActualsStatus,
      formatAmountInput,
      formatFileSize,
      formatMonthLabel,
      formatSyncError,
      getActualsStatusClass,
      invalidateBudgetReportsForYear,
      isSupabaseConfigured,
      normalizeBranchCode,
      normalizeCode,
      normalizeHeaderName,
      openHeadcountFromCatalog,
      parseDelimitedText,
      parseLocalizedAmount,
      persistAndRender,
      resolveOrganizationId,
      setSyncStatus,
      upsertSupabaseRows,
      deleteSupabaseRows,
      callSupabaseRpc,
      appConfirm
    } = deps;

    const BUDGET_LOAD_LABELS = {
      dre: "DRE",
      balanco: "Balanco Patrimonial",
      fluxo: "Fluxo de Caixa",
      volumes: "Volumes de Vendas",
      headcount: "Headcount"
    };

    const BUDGET_LOAD_TITLES = {
      dre: "Carga do DRE planejado",
      balanco: "Carga do Balanco Patrimonial",
      fluxo: "Carga do Fluxo de Caixa",
      volumes: "Carga de Volumes de Vendas",
      headcount: "Carga de Headcount Planejado"
    };

    let selectedBatchId = null;
    let rowsPage = 1;
    let rowsFilter = "";
    let activeErrorRowId = null;
    let selectedLoadType = null;
    let selectedScenarioTarget = "budget"; // "budget" | forecast scenario UUID
    let availableScenarios = null;         // null = not loaded for current year
    let availableScenariosYear = null;     // year for which scenarios were loaded
    const loadingBatchIds = new Set();
    const ROWS_PER_PAGE = 200;
    let sortKey = "rowNumber";
    let sortDir = 1;

    function getSelectedBatchId() { return selectedBatchId; }
    function setSelectedBatchId(value) { selectedBatchId = value || null; }
    function getSelectedLoadType() { return selectedLoadType; }
    function setSelectedLoadType(value) { selectedLoadType = value || null; }

    function syncBatchSelection() {
      if (!selectedBatchId || !state.budgetBatches.some((batch) => batch.id === selectedBatchId)) {
        selectedBatchId = state.budgetBatches[0]?.id || null;
      }
    }

    function getCurrentPeriodBatches() {
      state.budgetBatches = Array.isArray(state.budgetBatches) ? state.budgetBatches : [];
      const year = Number(state.currentPeriod?.year || 2026);
      const month = Number(state.currentPeriod?.month || 1);
      return state.budgetBatches.filter((batch) =>
        Number(batch.referenceYear) === year && Number(batch.referenceMonth) === month
      );
    }

    function syncSelectedBatchWithCurrentPeriod() {
      if (!selectedLoadType) {
        selectedBatchId = null;
        return;
      }
      const periodBatches = getCurrentPeriodBatches();
      const selectedStillValid = periodBatches.some((batch) => batch.id === selectedBatchId);
      if (!selectedStillValid) {
        selectedBatchId = periodBatches[0]?.id || null;
        rowsPage = 1;
        rowsFilter = "";
      }
    }

    function hasViewShellMarkup(view) {
      return !!(
        view &&
        view.querySelector("#budget-catalog") &&
        view.querySelector('[data-budget-load-type="dre"]') &&
        view.querySelector("#budget-detail") &&
        view.querySelector("#budget-upload-form")
      );
    }

    function ensureViewShell() {
      const view = views.budgetLoad;
      if (!view) return;
      if (view.dataset.ready === "true" && hasViewShellMarkup(view)) return;

      view.innerHTML = `
        <div id="budget-catalog" class="actuals-catalog">
          <div class="load-catalog-header"><h2 class="load-catalog-title">Carga de Planejado</h2></div>
          <div class="load-catalog-grid">
            <button class="load-catalog-card load-catalog-card--blue" type="button" data-budget-load-type="dre">
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
            <button class="load-catalog-card load-catalog-card--amber load-catalog-card--soon" type="button" disabled>
              <span class="lcc-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.4 5.6A1 1 0 0 0 6.6 20H19"/><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/></svg>
              </span>
              <strong>Volumes de Vendas</strong>
            </button>
            <button class="load-catalog-card load-catalog-card--green" type="button" data-headcount-entry="orcado">
              <span class="lcc-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </span>
              <strong>Headcount</strong>
            </button>
          </div>
        </div>

        <div id="budget-detail" class="actuals-layout" style="display:none">
          <div class="content-card actuals-intake-card">
            <div class="actuals-intake-header">
              <div class="actuals-intake-controls">
                <button id="budget-period-button" class="actuals-period-trigger" type="button">
                  <span class="actuals-period-kicker">Periodo</span>
                  <strong id="budget-period-label">Jun/2026</strong>
                </button>
                <select id="budget-load-mode" name="loadMode" class="actuals-mode-select">
                  <option value="complete">Carga completa</option>
                  <option value="additional">Carga adicional</option>
                </select>
                <div class="budget-target-wrap">
                  <span class="budget-target-label">Destino</span>
                  <select id="budget-scenario-select" class="actuals-mode-select">
                    <option value="budget">Budget (Orçamento)</option>
                  </select>
                </div>
              </div>
              <a href="https://jwjnvxshtdekzcprmsyl.supabase.co/storage/v1/object/public/Vecton_Templates/modelo-carga-dre.xlsx" download="modelo-carga-dre.xlsx" title="Baixar modelo de carga" style="display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel-alt);color:var(--text-faint);font-size:0.72rem;text-decoration:none;flex-shrink:0;transition:color .15s,border-color .15s" onmouseover="this.style.color='var(--blue)';this.style.borderColor='var(--blue)'" onmouseout="this.style.color='var(--text-faint)';this.style.borderColor='var(--line)'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>Modelo</a>
            </div>
            <form id="budget-upload-form" class="form-grid actuals-upload-form">
              <label class="full-span">
                Arquivo
                <input id="budget-file-input" name="file" type="file" accept=".xlsx,.xls,.csv,.txt">
              </label>
              <div class="editor-actions full-span">
                <button class="primary-button" type="submit">Importar arquivo</button>
                <button id="budget-create-manual-batch" class="ghost-button" type="button">Novo lote manual</button>
                <button class="ghost-button" type="button" data-back-to-budget-catalog>&larr; Voltar</button>
              </div>
            </form>
            <div id="budget-upload-feedback" class="actuals-upload-feedback"></div>
          </div>

          <div class="content-card actuals-batch-card">
            <div class="card-toolbar">
              <div>
                <p class="section-kicker">Historico</p>
                <h4 class="inline-card-title">Lotes</h4>
              </div>
            </div>
            <div id="budget-batch-list" class="actuals-batch-list"></div>
          </div>

          <div class="content-card actuals-detail-card">
            <div class="actuals-detail-head">
              <div class="editor-header actuals-detail-title">
                <p class="section-kicker">Detalhe</p>
                <h4 id="budget-batch-title">Selecione um lote</h4>
              </div>
              <div class="actuals-detail-actions">
                <button id="budget-delete-batch" class="delete-button secondary-danger" type="button">Excluir lote</button>
                <button id="budget-add-row" class="ghost-button" type="button">Adicionar linha</button>
                <button id="budget-apply-batch" class="primary-button" type="button">Aplicar lote</button>
              </div>
            </div>

            <div id="budget-batch-summary" class="actuals-summary-grid"></div>

            <div class="actuals-log-shell">
              <div class="actuals-log-head">
                <strong>Log de importacao</strong>
                <span id="budget-log-caption">Sem lote carregado.</span>
              </div>
              <div id="budget-error-log" class="actuals-error-log"></div>
            </div>

            <div class="actuals-rows-toolbar">
              <label class="actuals-rows-search">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input id="budget-rows-search" type="text" placeholder="Buscar por conta, CC, historico, lote...">
              </label>
              <span id="budget-rows-count" class="actuals-rows-count"></span>
            </div>

            <div class="table-shell actuals-table-shell">
              <table class="data-table actuals-table">
                <thead>
                  <tr>
                    <th class="actuals-col-row">#</th>
                    <th class="actuals-col-branch">Emp</th>
                    <th class="actuals-col-account">Conta</th>
                    <th class="actuals-col-cc">CC</th>
                    <th class="actuals-col-history">Historico</th>
                    <th class="actuals-col-lot">Lote</th>
                    <th class="actuals-col-amount">Valor</th>
                    <th class="actuals-col-status">Status</th>
                    <th class="actuals-col-action">Acao</th>
                  </tr>
                </thead>
                <tbody id="budget-rows-body"></tbody>
              </table>
            </div>

            <div id="budget-rows-pagination" class="actuals-rows-pagination"></div>
          </div>
        </div>
      `;

      view.dataset.ready = "true";
      view.dataset.eventsBound = "false";
      bindEvents();
      view.dataset.eventsBound = "true";
    }

    function bindEvents() {
      const budgetView = views.budgetLoad;

      budgetView?.addEventListener("click", (event) => {
        const hcCard = event.target.closest("[data-headcount-entry]");
        if (hcCard && !hcCard.disabled) {
          openHeadcountFromCatalog(hcCard.dataset.headcountEntry, "budgetLoad");
          return;
        }
        const card = event.target.closest("[data-budget-load-type]");
        if (card && !card.disabled) {
          selectedLoadType = card.dataset.budgetLoadType;
          renderCatalog();
          renderView();
          return;
        }
        if (event.target.closest("[data-back-to-budget-catalog]")) {
          selectedLoadType = null;
          renderCatalog();
        }
      });

      const uploadForm = document.querySelector("#budget-upload-form");
      const manualBatchButton = document.querySelector("#budget-create-manual-batch");
      const addRowButton = document.querySelector("#budget-add-row");
      const applyBatchButton = document.querySelector("#budget-apply-batch");
      const deleteBatchButton = document.querySelector("#budget-delete-batch");
      const periodButton = document.querySelector("#budget-period-button");
      const batchList = document.querySelector("#budget-batch-list");
      const rowsBody = document.querySelector("#budget-rows-body");

      document.querySelector("#budget-scenario-select")?.addEventListener("change", (e) => {
        selectedScenarioTarget = e.target.value || "budget";
      });

      uploadForm?.addEventListener("submit", handleBudgetUploadSubmit);
      manualBatchButton?.addEventListener("click", handleCreateManualBudgetBatch);
      addRowButton?.addEventListener("click", handleAddBudgetRow);
      applyBatchButton?.addEventListener("click", handleApplyBudgetBatch);
      deleteBatchButton?.addEventListener("click", handleDeleteBudgetBatch);
      periodButton?.addEventListener("click", () => periodTrigger?.click());

      batchList?.addEventListener("click", async (event) => {
        const item = event.target.closest("[data-batch-id]");
        if (!item) return;
        selectedBatchId = item.dataset.batchId;
        rowsPage = 1;
        rowsFilter = "";
        renderView();
        await ensureBatchRowsLoaded(selectedBatchId, true);
        renderView();
      });

      document.querySelector("#budget-rows-search")?.addEventListener("input", (event) => {
        rowsFilter = event.target.value;
        rowsPage = 1;
        renderRowsTable();
      });

      document.querySelector("#budget-rows-body")?.closest("table")?.querySelector("thead")?.addEventListener("click", (event) => {
        const th = event.target.closest("th[data-sort]");
        if (!th) return;
        const key = th.dataset.sort;
        sortDir = key === sortKey ? -sortDir : 1;
        sortKey = key;
        rowsPage = 1;
        renderRowsTable();
      });

      rowsBody?.addEventListener("change", async (event) => {
        const rowElement = event.target.closest("tr[data-row-id]");
        if (!rowElement) return;
        await updateBudgetRowFromDom(rowElement);
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
        const deleteButton = event.target.closest("[data-delete-row]");
        if (!deleteButton) return;
        await deleteBudgetRow(deleteButton.dataset.deleteRow);
      });

      document.addEventListener("click", (event) => {
        if (!activeErrorRowId) return;
        if (event.target.closest(".actuals-error-popover") || event.target.closest("[data-error-row]")) return;
        activeErrorRowId = null;
        renderRowsTable();
      });
    }

    function renderCatalog() {
      ensureViewShell();

      const catalog = document.querySelector("#budget-catalog");
      const detail = document.querySelector("#budget-detail");
      const viewTitle = document.querySelector("#view-title");
      if (!catalog || !detail) return;

      if (selectedLoadType) {
        catalog.style.display = "none";
        detail.style.display = "";
        if (viewTitle && getActiveView() === "budgetLoad") viewTitle.textContent = BUDGET_LOAD_TITLES[selectedLoadType] || "Carga de planejado";
      } else {
        catalog.style.display = "";
        detail.style.display = "none";
        if (viewTitle && getActiveView() === "budgetLoad") viewTitle.textContent = "Carga de planejado";
      }
    }

    function renderView() {
      const detail = document.querySelector("#budget-detail");
      if (!detail || detail.style.display === "none") return;

      syncSelectedBatchWithCurrentPeriod();

      const periodLabel = document.querySelector("#budget-period-label");
      const loadModeSelect = document.querySelector("#budget-load-mode");
      if (!loadModeSelect) return;

      if (periodLabel) {
        periodLabel.textContent = `${formatMonthLabel(state.currentPeriod.month)}/${state.currentPeriod.year}`;
      }

      const year = Number(state.currentPeriod?.year || 2026);
      if (availableScenariosYear !== year) {
        availableScenarios = null;
        if (selectedScenarioTarget !== "budget") selectedScenarioTarget = "budget";
      }
      loadAvailableScenarios(year).then(() => populateScenarioSelect());

      const selectedBatch = getSelectedBudgetBatch();
      if (selectedBatch) {
        loadModeSelect.value = selectedBatch.loadMode;
      }

      renderBatchList();
      renderBatchSummary();
      renderErrorLog();
      renderRowsTable();
    }

    async function ensureBatchRowsLoaded(batchId, force = false) {
      if (!batchId) return;
      if (!force && Array.isArray(state.budgetRowsByBatch[batchId])) return;
      if (loadingBatchIds.has(batchId)) return;
      loadingBatchIds.add(batchId);
      try {
        await loadBudgetRows(batchId, force);
      } finally {
        loadingBatchIds.delete(batchId);
      }
    }

    function renderBatchList() {
      const container = document.querySelector("#budget-batch-list");
      if (!container) return;
      container.innerHTML = "";

      if (!state.budgetBatches.length) {
        const empty = document.createElement("div");
        empty.className = "actuals-empty";
        empty.textContent = "Nenhum lote carregado ainda.";
        container.append(empty);
        return;
      }

      state.budgetBatches.forEach((batch) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "actuals-batch-item";
        if (batch.id === selectedBatchId) button.classList.add("active");
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
      const container = document.querySelector("#budget-batch-summary");
      const title = document.querySelector("#budget-batch-title");
      const caption = document.querySelector("#budget-log-caption");
      const applyButton = document.querySelector("#budget-apply-batch");
      const addRowButton = document.querySelector("#budget-add-row");
      const deleteBatchButton = document.querySelector("#budget-delete-batch");
      if (!container || !title || !caption || !applyButton || !addRowButton || !deleteBatchButton) return;

      const batch = getSelectedBudgetBatch();
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

    function renderErrorLog() {
      const container = document.querySelector("#budget-error-log");
      if (!container) return;
      container.innerHTML = "";

      const batch = getSelectedBudgetBatch();
      if (!batch) {
        container.innerHTML = `<div class="actuals-empty">Sem lote selecionado.</div>`;
        return;
      }

      if (batch.errorRows === 0) {
        container.innerHTML = `<div class="actuals-success-box">Lote sem erros. O resumo fica concentrado no cabecalho do lote.</div>`;
        return;
      }

      getSelectedBudgetRows()
        .filter((row) => row.validationStatus === "error")
        .forEach((row) => {
          const item = document.createElement("div");
          item.className = "actuals-error-item";
          item.innerHTML = `<strong>Linha ${row.rowNumber}</strong><span>${escapeHtml((row.validationErrors || []).join(" • "))}</span>`;
          container.append(item);
        });
    }

    function renderBudgetThead() {
      function th(key, cls, label) {
        const active = sortKey === key;
        const arrow = active ? (sortDir === 1 ? " ↑" : " ↓") : "";
        return `<th class="${cls}" data-sort="${key}" style="cursor:pointer;user-select:none${active ? ";color:var(--blue)" : ""}">${label}${arrow}</th>`;
      }
      return `
        ${th("rowNumber", "actuals-col-row", "#")}
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
      const tbody = document.querySelector("#budget-rows-body");
      if (!tbody) return;

      const theadRow = tbody.closest("table")?.querySelector("thead tr");
      if (theadRow) theadRow.innerHTML = renderBudgetThead();

      tbody.innerHTML = "";
      const batch = getSelectedBudgetBatch();
      if (batch && loadingBatchIds.has(batch.id)) {
        tbody.append(buildEmptyRow("Carregando linhas do lote selecionado...", 9));
        renderRowsPagination(0, 0);
        return;
      }

      const allRows = getSelectedBudgetRows();
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

      const countEl = document.querySelector("#budget-rows-count");
      if (countEl) {
        countEl.textContent = filter
          ? `${filtered.length} de ${allRows.length} linha(s)`
          : `${allRows.length} linha(s)`;
      }

      if (!filtered.length) {
        tbody.append(buildEmptyRow(filter ? "Nenhuma linha encontrada para este filtro." : "Nenhuma linha carregada para este lote.", 9));
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

        const hasError = row.validationStatus === "error";
        const isActiveError = activeErrorRowId === row.id;
        const statusCell = hasError
          ? `<td class="actuals-col-status">
               <button class="actuals-badge is-error actuals-error-trigger" type="button" data-error-row="${row.id}">${escapeHtml(formatActualsStatus(row.validationStatus))}</button>
               ${isActiveError ? `<div class="actuals-error-popover"><strong>Erros nesta linha</strong><ul>${(row.validationErrors || []).map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>` : ""}
             </td>`
          : `<td class="actuals-col-status"><span class="actuals-badge ${escapeHtml(getActualsStatusClass(row.validationStatus))}">${escapeHtml(formatActualsStatus(row.validationStatus))}</span></td>`;

        tr.innerHTML = `
          <td class="actuals-col-row">${row.rowNumber}</td>
          <td class="actuals-col-branch"><input class="actuals-field actuals-field-branch" data-field="branchCode" type="text" inputmode="numeric" maxlength="2" value="${escapeHtml(row.branchCode || "")}"></td>
          <td class="actuals-col-account"><input class="actuals-field actuals-field-account" data-field="accountNumber" type="text" inputmode="numeric" maxlength="12" value="${escapeHtml(row.accountNumber || "")}"></td>
          <td class="actuals-col-cc"><input class="actuals-field actuals-field-cc" data-field="costCenterNumber" type="text" inputmode="numeric" maxlength="8" value="${escapeHtml(row.costCenterNumber || "")}"></td>
          <td class="actuals-col-history"><input class="actuals-field actuals-field-history" data-field="history" type="text" maxlength="35" value="${escapeHtml(row.history || "")}"></td>
          <td class="actuals-col-lot"><input class="actuals-field actuals-field-lot" data-field="lotCode" type="text" maxlength="16" value="${escapeHtml(row.lotCode || "")}"></td>
          <td class="actuals-col-amount"><input class="actuals-field actuals-field-amount" data-field="amount" type="text" maxlength="15" value="${escapeHtml(formatAmountInput(row.amount))}"></td>
          ${statusCell}
          <td class="actuals-col-action"><button class="table-icon-button table-icon-button-only" type="button" data-delete-row="${row.id}" aria-label="Excluir linha"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#vp-icon-trash"></use></svg></button></td>
        `;
        tbody.append(tr);
      });

      renderRowsPagination(rowsPage, totalPages);
    }

    function renderRowsPagination(currentPage, totalPages) {
      const container = document.querySelector("#budget-rows-pagination");
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
        if (page !== currentPage) btn.onclick = () => { rowsPage = page; renderRowsTable(); };
        buttons.push(btn);
        previous = page;
      });
      return buttons;
    }

    async function handleBudgetUploadSubmit(event) {
      event.preventDefault();
      const fileInput = document.querySelector("#budget-file-input");
      const file = fileInput?.files?.[0];
      const loadMode = document.querySelector("#budget-load-mode")?.value || "complete";

      if (!file) {
        setUploadFeedback("Selecione um arquivo para importar.", "error");
        return;
      }

      if (loadMode === "complete" && selectedScenarioTarget === "budget") {
        const confirmed = await appConfirm("Carga completa vai apagar o planejado existente da competencia e substituir. Deseja continuar?", "warn");
        if (!confirmed) return;
      }

      try {
        setUploadFeedback("Lendo arquivo...", "warn");
        const importedRows = await parseBudgetFile(file);
        const batch = await createBudgetBatch({
          loadMode,
          sourceType: "file",
          sourceFileName: file.name
        });
        const preparedRows = importedRows.map((row, index) => normalizeImportedBudgetRow(batch.id, row, index + 1));
        await saveBudgetRows(batch.id, preparedRows);
        selectedBatchId = batch.id;
        fileInput.value = "";
        await refreshBudgetBatch(batch.id);
        const applied = await autoApplyBudgetBatch(batch.id, { auto: true });
        if (applied) {
          setUploadFeedback(`Carga importada e aplicada com ${preparedRows.length} linha(s).`, "ok");
        } else {
          const refreshed = getBudgetBatchById(batch.id);
          if (refreshed?.status === "error") {
            setUploadFeedback("Carga importada, mas nao aplicada porque ha linhas com erro.", "warn");
          } else {
            setUploadFeedback(`Lote criado com ${preparedRows.length} linha(s).`, "ok");
          }
        }
        renderView();
      } catch (error) {
        console.error(error);
        setUploadFeedback(String(error?.message || error || "Falha na importacao."), "error");
      }
    }

    async function handleCreateManualBudgetBatch() {
      try {
        const loadMode = document.querySelector("#budget-load-mode")?.value || "additional";
        const batch = await createBudgetBatch({ loadMode, sourceType: "manual", sourceFileName: null });
        selectedBatchId = batch.id;
        setUploadFeedback("Lote manual criado.", "ok");
        renderView();
      } catch (error) {
        console.error(error);
        setUploadFeedback(String(error?.message || error || "Falha ao criar lote manual."), "error");
      }
    }

    async function handleAddBudgetRow() {
      if (!selectedBatchId) {
        await handleCreateManualBudgetBatch();
      }
      const rows = getSelectedBudgetRows();
      const nextRowNumber = rows.length ? Math.max(...rows.map((row) => row.rowNumber)) + 1 : 1;
      const newRow = normalizeImportedBudgetRow(selectedBatchId, {
        branchCode: "",
        accountNumber: "",
        costCenterNumber: "",
        history: "",
        lotCode: "",
        amount: ""
      }, nextRowNumber);
      await saveBudgetRows(selectedBatchId, [newRow]);
      renderView();
    }

    async function handleApplyBudgetBatch() {
      const batch = getSelectedBudgetBatch();
      if (!batch) return;

      try {
        const applied = await autoApplyBudgetBatch(batch.id, { auto: false });
        if (applied) {
          setUploadFeedback("Lote aplicado com sucesso.", "ok");
        } else {
          const refreshed = getBudgetBatchById(batch.id);
          if (refreshed?.status === "error") {
            setUploadFeedback("Corrija as linhas com erro antes de aplicar o lote.", "error");
          }
        }
      } catch (error) {
        console.error(error);
        setUploadFeedback(String(error?.message || error || "Falha ao aplicar lote."), "error");
        setSyncStatus(`Erro planejado: ${formatSyncError(error)}`, "error");
      }
    }

    async function autoApplyBudgetBatch(batchId, { auto = false } = {}) {
      const batch = getBudgetBatchById(batchId);
      if (!batch) return false;
      if (batch.status === "applied") return true;
      if (batch.status === "error" || batch.status === "draft") return false;

      const scenarioId = selectedScenarioTarget !== "budget" ? selectedScenarioTarget : null;
      const scenarioName = scenarioId
        ? (availableScenarios || []).find(s => s.id === scenarioId)?.name || "cenário"
        : null;

      if (batch.loadMode === "complete" && !auto) {
        const destLabel = scenarioName
          ? `cenário "${scenarioName}"`
          : "planejado (Budget)";
        const confirmed = await appConfirm(
          `Carga completa vai apagar as entradas existentes de ${destLabel} para ${formatMonthLabel(batch.referenceMonth)}/${batch.referenceYear} e substituir. Deseja continuar?`,
          "warn"
        );
        if (!confirmed) return false;
      }

      if (isSupabaseConfigured()) {
        // → Forecast scenario
        if (scenarioId) {
          setSyncStatus(`Aplicando carga no cenário "${scenarioName}"…`, "warn");
          await applyBatchToForecast(batchId, scenarioId);
          setSyncStatus(`Carga aplicada no cenário "${scenarioName}"`, "ok");
          return true;
        }

        // → Budget (existing RPC path)
        setSyncStatus(auto ? "Aplicando carga de planejado no BD..." : "Aplicando lote de planejado no BD...", "warn");
        await callSupabaseRpc("apply_budget_import_batch", { target_batch_id: batch.id });
        invalidateBudgetReportsForYear(batch.referenceYear);
        await refreshBudgetBatch(batch.id);
        void ensureBudgetReportsDataForYear(batch.referenceYear);
        setSyncStatus(auto ? "Carga de planejado aplicada no BD" : "Lote de planejado aplicado no BD", "ok");
        return true;
      }

      const localBatch = getBudgetBatchById(batch.id);
      if (!localBatch || (localBatch.status !== "ready" && localBatch.status !== "applied")) return false;
      localBatch.status = "applied";
      localBatch.appliedAt = new Date().toISOString();
      invalidateBudgetReportsForYear(localBatch.referenceYear);
      persistAndRender();
      setSyncStatus(auto ? "Carga de planejado aplicada localmente" : "Lote de planejado aplicado localmente", "ok");
      return true;
    }

    async function handleDeleteBudgetBatch() {
      const batch = getSelectedBudgetBatch();
      if (!batch) return;
      const confirmed = await appConfirm("Deseja excluir este lote e todas as suas linhas? Esta acao nao pode ser desfeita.", "danger");
      if (!confirmed) return;

      try {
        if (isSupabaseConfigured()) {
          await deleteSupabaseRows("budget_import_rows", `batch_id=eq.${encodeURIComponent(batch.id)}`);
          await deleteSupabaseRows("budget_import_batches", `id=eq.${encodeURIComponent(batch.id)}`);
        }
        delete state.budgetRowsByBatch[batch.id];
        state.budgetBatches = state.budgetBatches.filter((item) => item.id !== batch.id);
        selectedBatchId = getCurrentPeriodBatches()[0]?.id || null;
        if (selectedBatchId) await loadBudgetRows(selectedBatchId, true);
        persistAndRender();
        setUploadFeedback("Lote excluido com sucesso.", "ok");
      } catch (error) {
        console.error(error);
        setUploadFeedback("Nao foi possivel excluir o lote.", "error");
      }
    }

    async function updateBudgetRowFromDom(rowElement) {
      const rowId = rowElement.dataset.rowId;
      const batch = getSelectedBudgetBatch();
      const currentRow = getSelectedBudgetRows().find((item) => item.id === rowId);
      if (!batch || !currentRow) return;

      const updatedRow = normalizeImportedBudgetRow(batch.id, {
        id: currentRow.id,
        rowNumber: currentRow.rowNumber,
        branchCode: rowElement.querySelector('[data-field="branchCode"]').value,
        accountNumber: rowElement.querySelector('[data-field="accountNumber"]').value,
        costCenterNumber: rowElement.querySelector('[data-field="costCenterNumber"]').value,
        history: rowElement.querySelector('[data-field="history"]').value,
        lotCode: rowElement.querySelector('[data-field="lotCode"]').value,
        amount: rowElement.querySelector('[data-field="amount"]').value
      }, currentRow.rowNumber);

      try {
        rowElement.classList.add("row-saving");
        await saveBudgetRows(batch.id, [updatedRow]);
        rowElement.classList.remove("row-saving");
        rowElement.classList.add("row-saved");
        setTimeout(() => rowElement.classList.remove("row-saved"), 1800);
      } catch (error) {
        rowElement.classList.remove("row-saving");
        rowElement.classList.add("row-save-error");
        setTimeout(() => rowElement.classList.remove("row-save-error"), 3000);
        console.error(error);
        setUploadFeedback(String(error?.message || error || "Falha ao salvar linha."), "error");
      }
    }

    async function deleteBudgetRow(rowId) {
      const batch = getSelectedBudgetBatch();
      if (!batch) return;
      try {
        if (isSupabaseConfigured()) {
          await deleteSupabaseRows("budget_import_rows", `id=eq.${encodeURIComponent(rowId)}`);
        }
        state.budgetRowsByBatch[batch.id] = getSelectedBudgetRows().filter((row) => row.id !== rowId);
        await refreshBudgetBatch(batch.id);
      } catch (error) {
        console.error(error);
        setUploadFeedback(String(error?.message || error || "Falha ao excluir linha."), "error");
      }
    }

    async function createBudgetBatch({ loadMode, sourceType, sourceFileName }) {
      state.budgetBatches = Array.isArray(state.budgetBatches) ? state.budgetBatches : [];
      state.budgetRowsByBatch = state.budgetRowsByBatch && typeof state.budgetRowsByBatch === "object" ? state.budgetRowsByBatch : {};

      const batch = normalizeBudgetBatch({
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

      state.budgetBatches = [batch, ...state.budgetBatches.filter((item) => item.id !== batch.id)];
      state.budgetRowsByBatch[batch.id] = [];

      if (isSupabaseConfigured()) {
        const organizationId = await resolveOrganizationId();
        const [saved] = await upsertSupabaseRows("budget_import_batches", [{
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
        state.budgetBatches = [normalizeBudgetBatch(saved), ...state.budgetBatches.filter((item) => item.id !== batch.id)];
      }

      persistAndRender();
      return getBudgetBatchById(batch.id);
    }

    async function saveBudgetRows(batchId, rows) {
      state.budgetBatches = Array.isArray(state.budgetBatches) ? state.budgetBatches : [];
      state.budgetRowsByBatch = state.budgetRowsByBatch && typeof state.budgetRowsByBatch === "object" ? state.budgetRowsByBatch : {};
      if (!batchId) throw new Error("Lote de planejado nao encontrado.");
      if (!rows.length) return;

      const validatedRows = rows.map((row) => validateBudgetRow(batchId, row));
      const currentRows = state.budgetRowsByBatch[batchId] || [];
      const previousRows = currentRows.slice();
      const merged = new Map(currentRows.map((row) => [row.id, row]));
      validatedRows.forEach((row) => merged.set(row.id, row));
      state.budgetRowsByBatch[batchId] = Array.from(merged.values()).sort((a, b) => a.rowNumber - b.rowNumber);

      try {
        if (isSupabaseConfigured()) {
          const organizationId = await resolveOrganizationId();
          await ensureSeedBranchesInSupabase(organizationId);
          const payloadRows = validatedRows.map((row) => ({
            id: row.id,
            batch_id: batchId,
            row_number: row.rowNumber,
            branch_code: row.branchCode || null,
            account_number: row.accountNumber || null,
            cost_center_number: row.costCenterNumber || null,
            history: row.history || null,
            lot_code: row.lotCode || null,
            amount: row.amount == null || Number.isNaN(Number(row.amount)) ? null : Number(row.amount),
            raw_payload: row.rawPayload || {}
          }));
          const chunks = chunkArray(payloadRows, ACTUALS_IMPORT_UPSERT_CHUNK_SIZE);
          for (let idx = 0; idx < chunks.length; idx += 1) {
            if (chunks.length > 1) setUploadFeedback(`Gravando lote: bloco ${idx + 1} de ${chunks.length}...`, "warn");
            await upsertSupabaseRows("budget_import_rows", chunks[idx], ["id"]);
          }
        }
      } catch (error) {
        state.budgetRowsByBatch[batchId] = previousRows;
        persistAndRender();
        throw error;
      }

      await refreshBudgetBatch(batchId);
    }

    async function refreshBudgetBatch(batchId) {
      if (isSupabaseConfigured()) {
        const organizationId = await resolveOrganizationId();
        const [batch] = await fetchSupabaseRowsSafe("budget_import_batches", `id=eq.${batchId}&organization_id=eq.${organizationId}&select=id,reference_year,reference_month,load_mode,source_type,source_file_name,status,total_rows,error_rows,valid_rows,uploaded_at,applied_at&limit=1`);
        if (batch) {
          state.budgetBatches = [
            normalizeBudgetBatch(batch),
            ...state.budgetBatches.filter((item) => item.id !== batchId)
          ].sort((a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")));
        }
        await loadBudgetRows(batchId, true);
        const afterDb = getBudgetBatchById(batchId);
        if (afterDb && afterDb.status !== "applied") recomputeLocalBudgetBatch(batchId);
      } else {
        recomputeLocalBudgetBatch(batchId);
      }
      persistAndRender();
    }

    async function loadBudgetRows(batchId, force = false) {
      if (!batchId) return;
      if (!force && Array.isArray(state.budgetRowsByBatch[batchId])) return;

      if (!isSupabaseConfigured()) {
        state.budgetRowsByBatch[batchId] = state.budgetRowsByBatch[batchId] || [];
        return;
      }

      const pageSize = 1000;
      let allRows = [];
      let offset = 0;

      while (true) {
        const page = await fetchSupabaseRowsSafe(
          "budget_import_rows",
          `batch_id=eq.${batchId}&select=id,row_number,branch_code,account_number,cost_center_number,history,lot_code,amount,validation_status,validation_errors,raw_payload&order=row_number.asc&limit=${pageSize}&offset=${offset}`
        );
        if (!page || page.length === 0) break;
        allRows = allRows.concat(page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }

      state.budgetRowsByBatch[batchId] = allRows.map(normalizeBudgetRow);
    }

    function recomputeLocalBudgetBatch(batchId) {
      const batch = getBudgetBatchById(batchId);
      if (!batch) return;
      const rows = state.budgetRowsByBatch[batchId] || [];
      batch.totalRows = rows.length;
      batch.errorRows = rows.filter((row) => row.validationStatus === "error").length;
      batch.validRows = rows.filter((row) => row.validationStatus === "valid").length;
      batch.status = rows.length === 0 ? "draft" : (batch.errorRows > 0 ? "error" : "ready");
    }

    function normalizeBudgetBatch(row) {
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

    function normalizeBudgetRow(row) {
      const rawAmount = row.amount ?? null;
      return {
        id: row.id || crypto.randomUUID(),
        batchId: row.batchId ?? row.batch_id,
        rowNumber: Number(row.rowNumber ?? row.row_number ?? 1),
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

    function normalizeImportedBudgetRow(batchId, row, rowNumber) {
      return normalizeBudgetRow({
        id: row.id || crypto.randomUUID(),
        batchId,
        rowNumber: row.rowNumber || rowNumber,
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

    function validateBudgetRow(batchId, row) {
      const errors = [];
      const branchCode = normalizeBranchCode(normalizeCode(row.branchCode));
      const accountNumber = normalizeCode(row.accountNumber);
      const costCenterNumber = normalizeCode(row.costCenterNumber);
      const amount = Number.isFinite(Number(row.amount)) ? Number(row.amount) : NaN;

      if (!branchCode) {
        errors.push("Empresa obrigatoria");
      } else if (!state.branches.some((branch) => branch.code === branchCode)) {
        errors.push("Empresa nao cadastrada");
      }

      if (!accountNumber) {
        errors.push("Conta obrigatoria");
      } else if (!state.accounts.some((account) => account.number === accountNumber)) {
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
        branchCode,
        accountNumber,
        costCenterNumber,
        amount: Number.isFinite(amount) ? amount : null,
        validationStatus: errors.length ? "error" : "valid",
        validationErrors: errors
      };
    }

    async function loadAvailableScenarios(year) {
      if (availableScenarios !== null && availableScenariosYear === year) return;
      try {
        const orgId = await resolveOrganizationId();
        const rows = await fetchSupabaseRowsSafe(
          "forecast_scenarios",
          `organization_id=eq.${orgId}&reference_year=eq.${year}&order=sort_order.asc,created_at.asc&select=id,name,color,icon`
        );
        availableScenarios = rows || [];
        availableScenariosYear = year;
      } catch (err) {
        console.warn("Não foi possível carregar cenários de forecast:", err);
        availableScenarios = [];
      }
    }

    function populateScenarioSelect() {
      const sel = document.querySelector("#budget-scenario-select");
      if (!sel) return;
      sel.innerHTML = [
        `<option value="budget">Budget</option>`,
        ...(availableScenarios || []).map(s =>
          `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`
        )
      ].join("");
      sel.value = selectedScenarioTarget;
      if (sel.value !== selectedScenarioTarget) sel.value = "budget";
    }

    async function applyBatchToForecast(batchId, scenarioId) {
      const batch = getBudgetBatchById(batchId);
      if (!batch) throw new Error("Lote não encontrado.");

      const validRows = (state.budgetRowsByBatch[batchId] || []).filter(r => r.validationStatus === "valid");
      if (!validRows.length) throw new Error("Nenhuma linha válida no lote.");

      const orgId = await resolveOrganizationId();

      if (batch.loadMode === "complete") {
        setSyncStatus("Limpando entradas anteriores do cenário…", "warn");
        await deleteSupabaseRows(
          "forecast_ledger_entries",
          `organization_id=eq.${orgId}&scenario_id=eq.${scenarioId}&reference_year=eq.${batch.referenceYear}&reference_month=eq.${batch.referenceMonth}`
        );
      }

      const ledgerRows = validRows.map(r => ({
        id:                  crypto.randomUUID(),
        organization_id:     orgId,
        scenario_id:         scenarioId,
        reference_year:      batch.referenceYear,
        reference_month:     batch.referenceMonth,
        account_number:      r.accountNumber,
        cost_center_id:      null,
        cost_center_number:  r.costCenterNumber || null,
        amount:              r.amount ?? 0,
        entry_date:          null,
        history:             r.history || null,
      }));

      const CHUNK = 500;
      for (let i = 0; i < ledgerRows.length; i += CHUNK) {
        setSyncStatus(`Gravando entradas: ${i + 1}–${Math.min(i + CHUNK, ledgerRows.length)} de ${ledgerRows.length}…`, "warn");
        await upsertSupabaseRows("forecast_ledger_entries", ledgerRows.slice(i, i + CHUNK), ["id"]);
      }

      // Mark batch as applied in DB (partial upsert — Supabase merge-duplicates preserves other columns)
      await upsertSupabaseRows("budget_import_batches", [{
        id:         batchId,
        status:     "applied",
        applied_at: new Date().toISOString(),
      }], ["id"]);

      // Sync local state
      const localBatch = getBudgetBatchById(batchId);
      if (localBatch) {
        localBatch.status    = "applied";
        localBatch.appliedAt = new Date().toISOString();
      }
      persistAndRender();
    }

    async function parseBudgetFile(file) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (extension === "csv" || extension === "txt") {
        if (file.size > MAX_BROWSER_TEXT_IMPORT_BYTES) {
          throw new Error(`Arquivo muito grande (${formatFileSize(file.size)}). Divida o arquivo antes de importar.`);
        }
        const text = await file.text();
        return parseBudgetSheetRows(parseDelimitedText(text));
      }

      if (file.size > MAX_BROWSER_XLSX_BYTES) {
        throw new Error(`Arquivo Excel muito grande (${formatFileSize(file.size)}). Exporte para CSV ou reduza o arquivo.`);
      }

      if (!window.XLSX) throw new Error("Leitor de planilha nao carregado.");

      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true, dense: true });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("Arquivo sem abas para leitura.");
      const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: "", raw: true });
      return parseBudgetSheetRows(rows);
    }

    function parseBudgetSheetRows(rows) {
      if (!Array.isArray(rows) || !rows.length) throw new Error("Arquivo sem linhas para importacao.");

      const firstRow = rows[0];
      const headerMap = mapBudgetHeaders(Object.keys(firstRow));
      const requiredHeaders = ["accountNumber", "branchCode", "amount"];
      const missingHeaders = requiredHeaders.filter((key) => !headerMap[key]);
      if (missingHeaders.length) {
        throw new Error(`Colunas obrigatorias ausentes: ${missingHeaders.map(formatActualsFieldName).join(", ")}`);
      }

      return rows.map((sourceRow) => ({
        branchCode: sourceRow[headerMap.branchCode],
        accountNumber: sourceRow[headerMap.accountNumber],
        costCenterNumber: headerMap.costCenterNumber ? sourceRow[headerMap.costCenterNumber] : "",
        history: headerMap.history ? sourceRow[headerMap.history] : "",
        lotCode: headerMap.lotCode ? sourceRow[headerMap.lotCode] : "",
        amount: sourceRow[headerMap.amount],
        rawPayload: sourceRow
      }));
    }

    function mapBudgetHeaders(headers) {
      const aliases = {
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
          if (!result[key] && options.includes(normalized)) result[key] = header;
        });
      });
      return result;
    }

    function getSelectedBudgetBatch() { return getBudgetBatchById(selectedBatchId); }
    function getBudgetBatchById(batchId) { return state.budgetBatches.find((batch) => batch.id === batchId) || null; }
    function getSelectedBudgetRows() { return selectedBatchId ? (state.budgetRowsByBatch[selectedBatchId] || []) : []; }

    function setUploadFeedback(message, level = "warn") {
      const feedback = document.querySelector("#budget-upload-feedback");
      if (!feedback) return;
      feedback.textContent = message;
      feedback.classList.remove("is-error", "is-ok", "is-warn");
      feedback.classList.add(level === "error" ? "is-error" : level === "ok" ? "is-ok" : "is-warn");
    }

    return {
      BUDGET_LOAD_LABELS,
      ensureViewShell,
      renderCatalog,
      renderView,
      ensureBatchRowsLoaded,
      normalizeBudgetBatch,
      getSelectedBatchId,
      setSelectedBatchId,
      getSelectedLoadType,
      setSelectedLoadType,
      syncBatchSelection,
      getCurrentPeriodBatches
    };
  }

  window.VECTON_BUDGET = {
    createBudgetModule
  };
})(window);
