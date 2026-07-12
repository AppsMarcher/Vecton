(function attachVectonComercialVendasCarga(window) {
  // Tela de Carga de Vendas realizadas (FAT + CART) — clone da mecanica da carga
  // do DRE (actualsModule), adaptada as colunas de venda e ao backend
  // comercial_realizado_* (migration 038). Uma unica carga mescla as duas
  // origens (FAT = faturado, CART = carteira) na mesma espinha dorsal.
  function createComercialVendasCargaModule(deps) {
    const {
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
      escapeHtml,
      fetchSupabaseRowsSafe,
      formatActualsStatus,
      formatDisplayDate,
      formatAmountInput,
      formatFileSize,
      formatMonthLabel,
      formatSyncError,
      getActualsStatusClass,
      isSupabaseConfigured,
      normalizeDateInput,
      normalizeHeaderName,
      parseLocalizedAmount,
      persistAndRender,
      resolveOrganizationId,
      setSyncStatus,
      upsertSupabaseRows,
      appConfirm,
      onBack,
      MAX_BROWSER_TEXT_IMPORT_BYTES,
      MAX_BROWSER_XLSX_BYTES,
      UPSERT_CHUNK_SIZE
    } = deps;

    const TEMPLATE_URL = "templates/modelo-carga-vendas.xlsx";
    const CHUNK = UPSERT_CHUNK_SIZE || 500;
    const ROWS_PER_PAGE = 200;
    const COL_COUNT = 12;

    if (!Array.isArray(state.comercialRealizadoBatches)) state.comercialRealizadoBatches = [];
    if (!state.comercialRealizadoRowsByBatch || typeof state.comercialRealizadoRowsByBatch !== "object") {
      state.comercialRealizadoRowsByBatch = {};
    }

    let selectedBatchId = state.comercialRealizadoBatches[0]?.id || null;
    let rowsPage = 1;
    let rowsFilter = "";
    let activeErrorRowId = null;
    let sortKey = "rowNumber";
    let sortDir = 1;
    const loadingBatchIds = new Set();

    // -------------------------------------------------------------- shell

    function ensureViewShell() {
      const view = views.comercialVendas;
      if (!view || view.dataset.ready === "true") return;

      view.innerHTML = `
        <div id="comven-detail" class="actuals-layout">
          <div class="content-card actuals-intake-card">
            <div class="actuals-intake-header">
              <div class="actuals-intake-controls">
                <button id="comven-period-button" class="actuals-period-trigger" type="button">
                  <span class="actuals-period-kicker">Periodo</span>
                  <strong id="comven-period-label">Jun/2026</strong>
                </button>
                <select id="comven-load-mode" class="actuals-mode-select">
                  <option value="complete">Carga completa</option>
                  <option value="additional">Carga adicional</option>
                </select>
              </div>
              <a href="${TEMPLATE_URL}" download="modelo-carga-vendas.xlsx" title="Baixar modelo de carga" style="display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel-alt);color:var(--text-faint);font-size:0.72rem;text-decoration:none;flex-shrink:0;transition:color .15s,border-color .15s" onmouseover="this.style.color='var(--blue)';this.style.borderColor='var(--blue)'" onmouseout="this.style.color='var(--text-faint)';this.style.borderColor='var(--line)'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>Modelo</a>
            </div>
            <form id="comven-upload-form" class="form-grid actuals-upload-form">
              <label class="full-span">
                Arquivo
                <input id="comven-file-input" name="file" type="file" accept=".xlsx,.xls,.csv,.txt">
              </label>
              <div class="editor-actions full-span">
                <button class="primary-button" type="submit">Importar arquivo</button>
                <button id="comven-create-manual-batch" class="ghost-button" type="button">Novo lote manual</button>
                <button id="comven-back" class="ghost-button" type="button">&larr; Voltar</button>
              </div>
            </form>
            <div id="comven-upload-feedback" class="actuals-upload-feedback"></div>
          </div>

          <div class="content-card actuals-batch-card">
            <div class="card-toolbar">
              <div>
                <p class="section-kicker">Historico</p>
                <h4 class="inline-card-title">Lotes</h4>
              </div>
            </div>
            <div id="comven-batch-list" class="actuals-batch-list"></div>
          </div>

          <div class="content-card actuals-detail-card">
            <div class="actuals-detail-head">
              <div class="editor-header actuals-detail-title">
                <p class="section-kicker">Detalhe</p>
                <h4 id="comven-batch-title">Selecione um lote</h4>
              </div>
              <div class="actuals-detail-actions">
                <button id="comven-delete-batch" class="delete-button secondary-danger" type="button">Excluir lote</button>
                <button id="comven-revalidate-batch" class="ghost-button" type="button" style="display:none">Revalidar lote</button>
                <button id="comven-add-row" class="ghost-button" type="button">Adicionar lancamento</button>
                <button id="comven-apply-batch" class="primary-button" type="button">Aplicar lote</button>
              </div>
            </div>

            <div id="comven-batch-summary" class="actuals-summary-grid"></div>

            <div class="actuals-log-shell">
              <div class="actuals-log-head">
                <strong>Log de importacao</strong>
                <span id="comven-log-caption">Sem lote carregado.</span>
              </div>
              <div id="comven-error-log" class="actuals-error-log"></div>
            </div>

            <div class="actuals-rows-toolbar">
              <label class="actuals-rows-search">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input id="comven-rows-search" type="text" placeholder="Buscar por produto, cliente, territorio, origem...">
              </label>
              <span id="comven-rows-count" class="actuals-rows-count"></span>
            </div>

            <datalist id="comven-tipo-list"><option value="Máquinas"></option><option value="Peças"></option><option value="Transgrain"></option><option value="Acessórios"></option></datalist>
            <div class="table-shell actuals-table-shell">
              <table class="data-table actuals-table">
                <thead><tr></tr></thead>
                <tbody id="comven-rows-body"></tbody>
              </table>
            </div>

            <div id="comven-rows-pagination" class="actuals-rows-pagination"></div>
          </div>
        </div>
      `;

      view.dataset.ready = "true";
      bindEvents();
    }

    function bindEvents() {
      document.querySelector("#comven-upload-form")?.addEventListener("submit", handleUploadSubmit);
      document.querySelector("#comven-create-manual-batch")?.addEventListener("click", handleCreateManualBatch);
      document.querySelector("#comven-add-row")?.addEventListener("click", handleAddRow);
      document.querySelector("#comven-apply-batch")?.addEventListener("click", handleApplyBatch);
      document.querySelector("#comven-delete-batch")?.addEventListener("click", handleDeleteBatch);
      document.querySelector("#comven-revalidate-batch")?.addEventListener("click", handleRevalidateBatch);
      document.querySelector("#comven-period-button")?.addEventListener("click", () => periodTrigger?.click());
      document.querySelector("#comven-back")?.addEventListener("click", () => onBack?.());

      document.querySelector("#comven-rows-search")?.addEventListener("input", (event) => {
        rowsFilter = event.target.value;
        rowsPage = 1;
        renderRowsTable();
      });

      document.querySelector("#comven-rows-body")?.closest("table")?.querySelector("thead")?.addEventListener("click", (event) => {
        const th = event.target.closest("th[data-sort]");
        if (!th) return;
        const key = th.dataset.sort;
        sortDir = key === sortKey ? -sortDir : 1;
        sortKey = key;
        rowsPage = 1;
        renderRowsTable();
      });

      const batchList = document.querySelector("#comven-batch-list");
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

      const rowsBody = document.querySelector("#comven-rows-body");
      rowsBody?.addEventListener("change", async (event) => {
        const rowElement = event.target.closest("tr[data-row-id]");
        if (rowElement) await updateRowFromDom(rowElement);
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
          await handleRefreshRow(refreshButton.dataset.refreshRow);
          return;
        }
        const deleteButton = event.target.closest("[data-delete-row]");
        if (deleteButton) showDeleteConfirm(() => deleteRow(deleteButton.dataset.deleteRow));
      });

      document.addEventListener("click", (event) => {
        if (!activeErrorRowId) return;
        if (event.target.closest(".actuals-error-popover") || event.target.closest("[data-error-row]")) return;
        activeErrorRowId = null;
        renderRowsTable();
      });
    }

    // -------------------------------------------------------------- render

    function renderView() {
      ensureViewShell();
      const detail = document.querySelector("#comven-detail");
      if (!detail) return;
      const periodLabel = document.querySelector("#comven-period-label");
      const loadModeSelect = document.querySelector("#comven-load-mode");
      if (periodLabel) {
        periodLabel.textContent = `${formatMonthLabel(state.currentPeriod.month)}/${state.currentPeriod.year}`;
      }
      const batch = getSelectedBatch();
      if (batch && loadModeSelect) loadModeSelect.value = batch.loadMode;

      renderBatchList();
      renderBatchSummary();
      renderErrorLog();
      renderRowsTable();
    }

    function renderBatchList() {
      const container = document.querySelector("#comven-batch-list");
      if (!container) return;
      container.innerHTML = "";
      if (!state.comercialRealizadoBatches.length) {
        const empty = document.createElement("div");
        empty.className = "actuals-empty";
        empty.textContent = "Nenhum lote carregado ainda.";
        container.append(empty);
        return;
      }
      state.comercialRealizadoBatches.forEach((batch) => {
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
      const container = document.querySelector("#comven-batch-summary");
      const title = document.querySelector("#comven-batch-title");
      const caption = document.querySelector("#comven-log-caption");
      const applyButton = document.querySelector("#comven-apply-batch");
      const addRowButton = document.querySelector("#comven-add-row");
      const deleteBatchButton = document.querySelector("#comven-delete-batch");
      if (!container || !title || !caption || !applyButton || !addRowButton || !deleteBatchButton) return;

      const batch = getSelectedBatch();
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
      const revalidateButton = document.querySelector("#comven-revalidate-batch");
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

    function renderErrorLog() {
      const container = document.querySelector("#comven-error-log");
      if (!container) return;
      container.innerHTML = "";
      const batch = getSelectedBatch();
      if (!batch) {
        container.innerHTML = `<div class="actuals-empty">Sem lote selecionado.</div>`;
        return;
      }
      if (batch.errorRows === 0) {
        container.innerHTML = `<div class="actuals-success-box">Lote sem erros. O resumo fica concentrado no cabecalho do lote.</div>`;
      }
    }

    function renderThead() {
      function th(key, cls, label) {
        const active = sortKey === key;
        const arrow = active ? (sortDir === 1 ? " ↑" : " ↓") : "";
        return `<th class="${cls}" data-sort="${key}" style="cursor:pointer;user-select:none${active ? ";color:var(--blue)" : ""}">${label}${arrow}</th>`;
      }
      return `
        ${th("rowNumber", "actuals-col-row", "#")}
        ${th("entryDate", "actuals-col-date", "Data")}
        ${th("origem", "comven-col-origem", "Origem")}
        ${th("tipo", "comven-col-tipo", "Tipo")}
        ${th("codProduto", "comven-col-produto", "Produto")}
        ${th("codCliente", "comven-col-cliente", "Cliente")}
        ${th("codTerritorio", "comven-col-territorio", "Território")}
        ${th("quantidade", "comven-col-qtd", "Qtd")}
        ${th("valor", "comven-col-valor", "Valor")}
        ${th("mbPct", "comven-col-mb", "%MB")}
        ${th("validationStatus", "actuals-col-status", "Status")}
        <th class="actuals-col-action">Acao</th>
      `;
    }

    function renderRowsTable() {
      const tbody = document.querySelector("#comven-rows-body");
      if (!tbody) return;
      const theadRow = tbody.closest("table")?.querySelector("thead tr");
      if (theadRow) theadRow.innerHTML = renderThead();

      tbody.innerHTML = "";
      const batch = getSelectedBatch();
      if (batch && loadingBatchIds.has(batch.id)) {
        tbody.append(buildEmptyRow("Carregando linhas do lote selecionado...", COL_COUNT));
        renderRowsPagination(0, 0);
        return;
      }

      const allRows = getSelectedRows();
      const filter = rowsFilter.toLowerCase().trim();
      const filtered = filter
        ? allRows.filter((row) =>
            (row.codProduto || "").toLowerCase().includes(filter) ||
            (row.codCliente || "").toLowerCase().includes(filter) ||
            (row.codTerritorio || "").toLowerCase().includes(filter) ||
            (row.tipo || "").toLowerCase().includes(filter) ||
            (row.origem || "").toLowerCase().includes(filter) ||
            String(row.rowNumber).includes(filter) ||
            String(row.valor ?? "").includes(filter)
          )
        : allRows;

      const countEl = document.querySelector("#comven-rows-count");
      if (countEl) {
        countEl.textContent = filter ? `${filtered.length} de ${allRows.length} linha(s)` : `${allRows.length} linha(s)`;
      }

      if (!filtered.length) {
        tbody.append(buildEmptyRow(filter ? "Nenhuma linha encontrada para este filtro." : "Nenhuma linha carregada para este lote.", COL_COUNT));
        renderRowsPagination(0, 0);
        return;
      }

      const sorted = filtered.slice().sort((a, b) => {
        if (sortKey === "rowNumber") return sortDir * (a.rowNumber - b.rowNumber);
        if (sortKey === "valor") return sortDir * ((a.valor ?? 0) - (b.valor ?? 0));
        if (sortKey === "quantidade") return sortDir * ((a.quantidade ?? 0) - (b.quantidade ?? 0));
        if (sortKey === "mbPct") return sortDir * ((a.mbPct ?? 0) - (b.mbPct ?? 0));
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
          <td class="comven-col-origem"><input class="actuals-field" data-field="origem" type="text" maxlength="4" style="text-transform:uppercase" value="${escapeHtml(row.origem || "")}"></td>
          <td class="comven-col-tipo"><input class="actuals-field" data-field="tipo" type="text" list="comven-tipo-list" maxlength="12" value="${escapeHtml(row.tipo || "")}"></td>
          <td class="comven-col-produto"><input class="actuals-field" data-field="codProduto" type="text" maxlength="20" value="${escapeHtml(row.codProduto || "")}"></td>
          <td class="comven-col-cliente"><input class="actuals-field" data-field="codCliente" type="text" maxlength="20" value="${escapeHtml(row.codCliente || "")}"></td>
          <td class="comven-col-territorio"><input class="actuals-field" data-field="codTerritorio" type="text" maxlength="30" value="${escapeHtml(row.codTerritorio || "")}"></td>
          <td class="comven-col-qtd"><input class="actuals-field actuals-field-amount" data-field="quantidade" type="text" maxlength="15" value="${escapeHtml(row.quantidade == null ? "" : String(row.quantidade))}"></td>
          <td class="comven-col-valor"><input class="actuals-field actuals-field-amount" data-field="valor" type="text" maxlength="18" value="${escapeHtml(formatAmountInput(row.valor))}"></td>
          <td class="comven-col-mb"><input class="actuals-field" data-field="mbPct" type="text" maxlength="8" value="${escapeHtml(formatMbPct(row.mbPct))}"></td>
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

    function renderRowsPagination(currentPage, totalPages) {
      const container = document.querySelector("#comven-rows-pagination");
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
      const mkBtn = (label, disabled, page) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "rows-pagination-btn";
        btn.textContent = label;
        btn.disabled = disabled;
        if (!disabled) btn.addEventListener("click", () => { rowsPage = page; renderRowsTable(); });
        return btn;
      };
      controls.append(
        mkBtn("‹ Anterior", currentPage === 1, currentPage - 1),
        mkBtn(`${currentPage} / ${totalPages}`, true, currentPage),
        mkBtn("Proximo ›", currentPage === totalPages, currentPage + 1)
      );
      nav.append(controls);
      container.append(nav);
    }

    // -------------------------------------------------------------- upload

    async function handleUploadSubmit(event) {
      event.preventDefault();
      const fileInput = document.querySelector("#comven-file-input");
      const loadMode = document.querySelector("#comven-load-mode")?.value || "complete";
      const file = fileInput?.files?.[0];
      if (!file) {
        setFeedback("Selecione um arquivo para importar.", "error");
        return;
      }
      if (loadMode === "complete") {
        const confirmed = await appConfirm("Carga completa vai apagar as vendas realizadas existentes da competencia e substituir. Deseja continuar?", "warn");
        if (!confirmed) return;
      }
      try {
        setFeedback("Lendo arquivo...", "warn");
        const importedRows = await parseFile(file);
        const batch = await createBatch({ loadMode, sourceType: "file", sourceFileName: file.name });
        const preparedRows = importedRows.map((row, index) => normalizeImportedRow(batch.id, row, index + 1));
        await saveRows(batch.id, preparedRows);
        selectedBatchId = batch.id;
        fileInput.value = "";
        await refreshBatch(batch.id);
        try {
          const applied = await autoApplyBatch(batch.id, { auto: true });
          if (applied) {
            setFeedback(`Carga importada e aplicada com ${preparedRows.length} linha(s).`, "ok");
          } else {
            const refreshed = getBatchById(batch.id);
            if (refreshed?.status === "error") {
              setFeedback("Carga importada, mas nao aplicada porque ha linhas com erro.", "warn");
            } else {
              setFeedback(`Lote criado com ${preparedRows.length} linha(s).`, "ok");
            }
          }
        } catch (applyError) {
          console.error(applyError);
          setFeedback(`Carga importada, mas a aplicacao automatica falhou: ${String(applyError?.message || applyError)}`, "error");
        }
        renderView();
      } catch (error) {
        console.error(error);
        setFeedback(String(error?.message || error || "Falha na importacao."), "error");
      }
    }

    async function handleCreateManualBatch() {
      try {
        const loadMode = document.querySelector("#comven-load-mode")?.value || "additional";
        const batch = await createBatch({ loadMode, sourceType: "manual", sourceFileName: null });
        selectedBatchId = batch.id;
        setFeedback("Lote manual criado.", "ok");
        renderView();
      } catch (error) {
        console.error(error);
        setFeedback(String(error?.message || error || "Falha ao criar lote manual."), "error");
      }
    }

    async function handleAddRow() {
      try {
        if (!selectedBatchId) await handleCreateManualBatch();
        const rows = getSelectedRows();
        const nextRowNumber = rows.length ? Math.max(...rows.map((row) => row.rowNumber)) + 1 : 1;
        const newRow = normalizeImportedRow(selectedBatchId, {
          origem: "FAT",
          tipo: "",
          entryDate: buildPeriodDate(state.currentPeriod.year, state.currentPeriod.month),
          codProduto: "",
          codCliente: "",
          codTerritorio: "",
          quantidade: "",
          valor: "",
          mbPct: ""
        }, nextRowNumber);
        await saveRows(selectedBatchId, [newRow]);
        renderView();
      } catch (error) {
        console.error(error);
        setFeedback(String(error?.message || error || "Falha ao adicionar linha manual."), "error");
      }
    }

    async function handleApplyBatch() {
      const batch = getSelectedBatch();
      if (!batch) return;
      try {
        const applied = await autoApplyBatch(batch.id, { auto: false });
        if (applied) {
          setFeedback("Lote aplicado com sucesso.", "ok");
        } else {
          const refreshed = getBatchById(batch.id);
          if (refreshed?.status === "error") setFeedback("Corrija as linhas com erro antes de aplicar o lote.", "error");
        }
      } catch (error) {
        console.error(error);
        setFeedback(String(error?.message || error || "Falha ao aplicar lote."), "error");
        setSyncStatus(`Erro vendas: ${formatSyncError(error)}`, "error");
      }
    }

    async function autoApplyBatch(batchId, { auto = false } = {}) {
      const batch = getBatchById(batchId);
      if (!batch) return false;
      if (batch.status === "applied") return true;
      if (batch.status === "error" || batch.status === "draft") return false;

      if (batch.loadMode === "complete" && !auto) {
        const confirmed = await appConfirm("Carga completa vai apagar as vendas realizadas existentes da competencia e substituir. Deseja continuar?", "warn");
        if (!confirmed) return false;
      }

      if (isSupabaseConfigured()) {
        setSyncStatus(auto ? "Aplicando carga no BD..." : "Aplicando lote no BD...", "warn");
        await callSupabaseRpc("apply_comercial_realizado_import_batch", { target_batch_id: batch.id });
        await refreshBatch(batch.id);
        setSyncStatus(auto ? "Carga aplicada no BD" : "Lote aplicado no BD", "ok");
        return true;
      }

      const localBatch = getBatchById(batch.id);
      if (!localBatch || (localBatch.status !== "ready" && localBatch.status !== "applied")) return false;
      localBatch.status = "applied";
      localBatch.appliedAt = new Date().toISOString();
      persistAndRender();
      return true;
    }

    async function handleDeleteBatch() {
      const batch = getSelectedBatch();
      if (!batch) return;
      const confirmed = await appConfirm("Deseja excluir este lote e todas as suas linhas? Esta acao nao pode ser desfeita.", "danger");
      if (!confirmed) return;
      try {
        if (isSupabaseConfigured()) {
          if (batch.status === "applied") {
            await callSupabaseRpc("delete_comercial_realizado_import_batch", { target_batch_id: batch.id });
          } else {
            await deleteSupabaseRows("comercial_realizado_import_batches", `id=eq.${encodeURIComponent(batch.id)}`);
          }
        }
        delete state.comercialRealizadoRowsByBatch[batch.id];
        state.comercialRealizadoBatches = state.comercialRealizadoBatches.filter((item) => item.id !== batch.id);
        selectedBatchId = state.comercialRealizadoBatches[0]?.id || null;
        if (selectedBatchId) await loadRows(selectedBatchId, true);
        persistAndRender();
        setFeedback("Lote excluido com sucesso.", "ok");
        renderView();
      } catch (error) {
        console.error(error);
        setFeedback(String(error?.message || error || "Falha ao excluir lote."), "error");
      }
    }

    async function handleRevalidateBatch() {
      const batch = getSelectedBatch();
      if (!batch) return;
      try {
        setFeedback("Revalidando lote...", "warn");
        await ensureBatchRowsLoaded(batch.id, true);
        const rows = getSelectedRows();
        if (!rows.length) return;
        const payloadRows = rows.map((r) => toPayload(batch.id, r));
        const chunks = chunkArray(payloadRows, CHUNK);
        for (let i = 0; i < chunks.length; i += 1) {
          if (chunks.length > 1) setFeedback(`Revalidando: bloco ${i + 1} de ${chunks.length}...`, "warn");
          await upsertSupabaseRows("comercial_realizado_import_rows", chunks[i], ["id"]);
        }
        await refreshBatch(batch.id);
        setFeedback("Lote revalidado com sucesso.", "ok");
        renderView();
      } catch (error) {
        console.error(error);
        setFeedback(String(error?.message || error || "Falha ao revalidar lote."), "error");
      }
    }

    async function updateRowFromDom(rowElement) {
      const rowId = rowElement.dataset.rowId;
      const batch = getSelectedBatch();
      const currentRow = getSelectedRows().find((item) => item.id === rowId);
      if (!batch || !currentRow) return;
      const updatedRow = normalizeImportedRow(batch.id, {
        id: currentRow.id,
        rowNumber: currentRow.rowNumber,
        origem: rowElement.querySelector('[data-field="origem"]').value,
        tipo: rowElement.querySelector('[data-field="tipo"]').value,
        entryDate: rowElement.querySelector('[data-field="entryDate"]').value,
        codProduto: rowElement.querySelector('[data-field="codProduto"]').value,
        codCliente: rowElement.querySelector('[data-field="codCliente"]').value,
        codTerritorio: rowElement.querySelector('[data-field="codTerritorio"]').value,
        quantidade: rowElement.querySelector('[data-field="quantidade"]').value,
        valor: rowElement.querySelector('[data-field="valor"]').value,
        mbPct: rowElement.querySelector('[data-field="mbPct"]').value
      }, currentRow.rowNumber);
      try {
        rowElement.classList.add("row-saving");
        await saveRows(batch.id, [updatedRow]);
        rowElement.classList.remove("row-saving");
        rowElement.classList.add("row-saved");
        setTimeout(() => rowElement.classList.remove("row-saved"), 1800);
        renderView();
      } catch (error) {
        rowElement.classList.remove("row-saving");
        rowElement.classList.add("row-save-error");
        setTimeout(() => rowElement.classList.remove("row-save-error"), 3000);
        console.error(error);
        setFeedback(String(error?.message || error || "Falha ao salvar linha."), "error");
      }
    }

    async function handleRefreshRow(rowId) {
      const batch = getSelectedBatch();
      const row = getSelectedRows().find((r) => r.id === rowId);
      if (!batch || !row) return;
      const btn = document.querySelector(`[data-refresh-row="${rowId}"]`);
      btn?.classList.add("refreshing");
      try {
        await saveRows(batch.id, [row]);
        if (isSupabaseConfigured()) {
          const [fresh] = await fetchSupabaseRowsSafe(
            "comercial_realizado_import_rows",
            `id=eq.${encodeURIComponent(rowId)}&select=id,row_number,origem,tipo_informado,entry_date,cod_produto,cod_cliente,cod_territorio,quantidade,valor,mb_pct,validation_status,validation_errors,raw_payload&limit=1`
          );
          if (fresh) {
            const normalized = normalizeRow(fresh);
            state.comercialRealizadoRowsByBatch[batch.id] = (state.comercialRealizadoRowsByBatch[batch.id] || []).map((r) =>
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
        setFeedback("Linha revalidada.", "ok");
      } catch (error) {
        console.error(error);
        setFeedback(String(error?.message || error || "Falha ao revalidar linha."), "error");
      } finally {
        btn?.classList.remove("refreshing");
      }
    }

    async function deleteRow(rowId) {
      const batch = getSelectedBatch();
      if (!batch) return;
      try {
        if (isSupabaseConfigured()) {
          await deleteSupabaseRows("comercial_realizado_import_rows", `id=eq.${encodeURIComponent(rowId)}`);
        }
        state.comercialRealizadoRowsByBatch[batch.id] = getSelectedRows().filter((row) => row.id !== rowId);
        await refreshBatch(batch.id);
      } catch (error) {
        console.error(error);
        setFeedback(String(error?.message || error || "Falha ao excluir linha."), "error");
      }
    }

    // ------------------------------------------------------ persistence

    async function createBatch({ loadMode, sourceType, sourceFileName }) {
      const batch = normalizeBatch({
        id: crypto.randomUUID(),
        referenceYear: state.currentPeriod.year,
        referenceMonth: state.currentPeriod.month,
        loadMode, sourceType, sourceFileName,
        status: "draft", totalRows: 0, errorRows: 0, validRows: 0,
        uploadedAt: new Date().toISOString()
      });
      state.comercialRealizadoBatches = [batch, ...state.comercialRealizadoBatches.filter((item) => item.id !== batch.id)];
      state.comercialRealizadoRowsByBatch[batch.id] = [];

      if (isSupabaseConfigured()) {
        const organizationId = await resolveOrganizationId();
        const [saved] = await upsertSupabaseRows("comercial_realizado_import_batches", [{
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
        state.comercialRealizadoBatches = [normalizeBatch(saved), ...state.comercialRealizadoBatches.filter((item) => item.id !== batch.id)];
      }
      persistAndRender();
      return getBatchById(batch.id);
    }

    function toPayload(batchId, row) {
      return {
        id: row.id,
        batch_id: batchId,
        row_number: row.rowNumber,
        origem: row.origem || null,
        tipo_informado: row.tipo || null,
        entry_date: row.entryDate || null,
        cod_produto: row.codProduto || null,
        cod_cliente: row.codCliente || null,
        cod_territorio: row.codTerritorio || null,
        quantidade: row.quantidade == null || Number.isNaN(Number(row.quantidade)) ? null : Number(row.quantidade),
        valor: row.valor == null || Number.isNaN(Number(row.valor)) ? null : Number(row.valor),
        mb_pct: row.mbPct == null || Number.isNaN(Number(row.mbPct)) ? null : Number(row.mbPct),
        raw_payload: row.rawPayload || {}
      };
    }

    async function saveRows(batchId, rows) {
      if (!rows.length) return;
      const currentRows = state.comercialRealizadoRowsByBatch[batchId] || [];
      const previousRows = currentRows.slice();
      const merged = new Map(currentRows.map((row) => [row.id, row]));
      rows.forEach((row) => merged.set(row.id, row));
      state.comercialRealizadoRowsByBatch[batchId] = Array.from(merged.values()).sort((a, b) => a.rowNumber - b.rowNumber);

      try {
        if (isSupabaseConfigured()) {
          const payloadRows = rows.map((row) => toPayload(batchId, row));
          const chunks = chunkArray(payloadRows, CHUNK);
          for (let index = 0; index < chunks.length; index += 1) {
            if (chunks.length > 1) setFeedback(`Gravando lote: bloco ${index + 1} de ${chunks.length}...`, "warn");
            await upsertSupabaseRows("comercial_realizado_import_rows", chunks[index], ["id"]);
          }
        }
      } catch (error) {
        state.comercialRealizadoRowsByBatch[batchId] = previousRows;
        persistAndRender();
        throw error;
      }
      await refreshBatch(batchId);
    }

    async function refreshBatch(batchId) {
      if (isSupabaseConfigured()) {
        const organizationId = await resolveOrganizationId();
        const [batch] = await fetchSupabaseRowsSafe("comercial_realizado_import_batches", `id=eq.${batchId}&organization_id=eq.${organizationId}&select=id,reference_year,reference_month,load_mode,source_type,source_file_name,status,total_rows,error_rows,valid_rows,uploaded_at,applied_at&limit=1`);
        if (batch) {
          state.comercialRealizadoBatches = [
            normalizeBatch(batch),
            ...state.comercialRealizadoBatches.filter((item) => item.id !== batchId)
          ].sort((a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")));
        }
        await loadRows(batchId, true);
      } else {
        recomputeLocalBatch(batchId);
      }
      persistAndRender();
    }

    async function loadRows(batchId, force = false) {
      if (!batchId) return;
      if (!force && Array.isArray(state.comercialRealizadoRowsByBatch[batchId])) return;
      if (!isSupabaseConfigured()) {
        state.comercialRealizadoRowsByBatch[batchId] = state.comercialRealizadoRowsByBatch[batchId] || [];
        return;
      }
      const pageSize = 1000;
      let allRows = [];
      let offset = 0;
      while (true) {
        const page = await fetchSupabaseRowsSafe(
          "comercial_realizado_import_rows",
          `batch_id=eq.${batchId}&select=id,row_number,origem,tipo_informado,entry_date,cod_produto,cod_cliente,cod_territorio,quantidade,valor,mb_pct,validation_status,validation_errors,raw_payload&order=row_number.asc&limit=${pageSize}&offset=${offset}`
        );
        if (!page || page.length === 0) break;
        allRows = allRows.concat(page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }
      state.comercialRealizadoRowsByBatch[batchId] = allRows.map(normalizeRow);
    }

    function recomputeLocalBatch(batchId) {
      const batch = getBatchById(batchId);
      if (!batch) return;
      const rows = state.comercialRealizadoRowsByBatch[batchId] || [];
      batch.totalRows = rows.length;
      batch.errorRows = rows.filter((row) => row.validationStatus === "error").length;
      batch.validRows = rows.filter((row) => row.validationStatus === "valid").length;
      batch.status = rows.length === 0 ? "draft" : (batch.errorRows > 0 ? "error" : "ready");
    }

    async function ensureBatchRowsLoaded(batchId, force = false) {
      if (!batchId) return;
      if (!force && Array.isArray(state.comercialRealizadoRowsByBatch[batchId])) return;
      if (loadingBatchIds.has(batchId)) return;
      loadingBatchIds.add(batchId);
      try {
        await loadRows(batchId, force);
      } finally {
        loadingBatchIds.delete(batchId);
      }
    }

    async function loadBatches() {
      if (!isSupabaseConfigured()) {
        state.comercialRealizadoBatches = state.comercialRealizadoBatches || [];
        return;
      }
      const organizationId = await resolveOrganizationId();
      const rows = await fetchSupabaseRowsSafe(
        "comercial_realizado_import_batches",
        `organization_id=eq.${organizationId}&select=id,reference_year,reference_month,load_mode,source_type,source_file_name,status,total_rows,error_rows,valid_rows,uploaded_at,applied_at&order=uploaded_at.desc&limit=200`
      );
      state.comercialRealizadoBatches = (rows || []).map(normalizeBatch);
      if (!selectedBatchId || !state.comercialRealizadoBatches.some((b) => b.id === selectedBatchId)) {
        selectedBatchId = state.comercialRealizadoBatches[0]?.id || null;
      }
    }

    async function loadAndRender() {
      ensureViewShell();
      try {
        await loadBatches();
        if (selectedBatchId) await ensureBatchRowsLoaded(selectedBatchId, true);
      } catch (error) {
        console.error(error);
        setFeedback(String(error?.message || error || "Falha ao carregar lotes."), "error");
      }
      renderView();
    }

    // ------------------------------------------------------ parse / normalize

    async function parseFile(file) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (extension === "csv" || extension === "txt") {
        if (file.size > MAX_BROWSER_TEXT_IMPORT_BYTES) {
          throw new Error(`Arquivo muito grande para leitura direta no navegador (${formatFileSize(file.size)}).`);
        }
        const text = await file.text();
        return parseSheetRows(parseDelimitedText(text));
      }
      if (file.size > MAX_BROWSER_XLSX_BYTES) {
        throw new Error(`Arquivo Excel muito grande para importacao no navegador (${formatFileSize(file.size)}). Exporte a aba para CSV.`);
      }
      if (!window.XLSX) throw new Error("Leitor de planilha nao carregado no navegador.");
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true, dense: true });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("Arquivo sem abas para leitura.");
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = window.XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: true });
      return parseSheetRows(rows);
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

    function parseSheetRows(rows) {
      if (!Array.isArray(rows) || !rows.length) throw new Error("Arquivo sem linhas para importacao.");
      const headerMap = mapHeaders(Object.keys(rows[0]));
      const required = ["origem", "tipo", "entryDate", "codProduto", "codCliente", "quantidade", "valor"];
      const missing = required.filter((key) => !headerMap[key]);
      if (missing.length) {
        const labels = { origem: "origem", tipo: "tipo", entryDate: "data", codProduto: "cod_produto", codCliente: "cod_cliente", quantidade: "quantidade", valor: "valor" };
        throw new Error(`Colunas obrigatorias ausentes: ${missing.map((k) => labels[k]).join(", ")}`);
      }
      return rows.map((sourceRow) => ({
        origem: sourceRow[headerMap.origem],
        tipo: sourceRow[headerMap.tipo],
        entryDate: sourceRow[headerMap.entryDate],
        codProduto: sourceRow[headerMap.codProduto],
        codCliente: sourceRow[headerMap.codCliente],
        codTerritorio: headerMap.codTerritorio ? sourceRow[headerMap.codTerritorio] : "",
        quantidade: sourceRow[headerMap.quantidade],
        valor: sourceRow[headerMap.valor],
        mbPct: headerMap.mbPct ? sourceRow[headerMap.mbPct] : "",
        rawPayload: sourceRow
      }));
    }

    function mapHeaders(headers) {
      const aliases = {
        origem: ["origem"],
        tipo: ["tipo"],
        entryDate: ["data", "datalancamento", "dataprevisao"],
        codProduto: ["codproduto", "produto", "codprod", "codigoproduto"],
        codCliente: ["codcliente", "cliente", "codcli", "codigocliente"],
        codTerritorio: ["territorio", "regional", "regionalmarcher"],
        quantidade: ["quantidade", "qtd", "qtde", "qtdpedido"],
        valor: ["valor", "valorpedido"],
        mbPct: ["mb", "mbpct", "margembruta", "margem", "percentmb"]
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

    function normalizeBatch(row) {
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

    function normalizeRow(row) {
      const qtd = row.quantidade ?? null;
      const val = row.valor ?? null;
      const mb = row.mbPct ?? row.mb_pct ?? null;
      return {
        id: row.id || crypto.randomUUID(),
        batchId: row.batchId ?? row.batch_id,
        rowNumber: Number(row.rowNumber ?? row.row_number ?? 1),
        origem: String(row.origem ?? "").trim().toUpperCase(),
        tipo: String(row.tipo ?? row.tipo_informado ?? "").trim(),
        entryDate: normalizeDateInput(row.entryDate ?? row.entry_date ?? ""),
        codProduto: String(row.codProduto ?? row.cod_produto ?? "").trim(),
        codCliente: String(row.codCliente ?? row.cod_cliente ?? "").trim(),
        codTerritorio: String(row.codTerritorio ?? row.cod_territorio ?? "").trim(),
        quantidade: qtd == null || qtd === "" ? null : Number(qtd),
        valor: val == null || val === "" ? null : Number(val),
        mbPct: mb == null || mb === "" ? null : Number(mb),
        validationStatus: row.validationStatus ?? row.validation_status ?? "pending",
        validationErrors: Array.isArray(row.validationErrors ?? row.validation_errors) ? (row.validationErrors ?? row.validation_errors) : [],
        rawPayload: row.rawPayload ?? row.raw_payload ?? {}
      };
    }

    function normalizeImportedRow(batchId, row, rowNumber) {
      const qtd = parseLocalizedAmount(row.quantidade);
      const val = parseLocalizedAmount(row.valor);
      const mb = parseMbInput(row.mbPct);
      return normalizeRow({
        id: row.id || crypto.randomUUID(),
        batchId,
        rowNumber: row.rowNumber || rowNumber,
        origem: row.origem,
        tipo: row.tipo ?? row.tipo_informado ?? "",
        entryDate: normalizeDateInput(row.entryDate),
        codProduto: String(row.codProduto ?? "").trim(),
        codCliente: String(row.codCliente ?? "").trim(),
        codTerritorio: String(row.codTerritorio ?? "").trim(),
        quantidade: Number.isNaN(qtd) ? null : qtd,
        valor: Number.isNaN(val) ? null : val,
        mbPct: mb,
        validationStatus: "pending",
        validationErrors: [],
        rawPayload: row.rawPayload || row
      });
    }

    // ------------------------------------------------------ helpers

    function parseMbInput(value) {
      if (value == null || value === "") return null;
      if (typeof value === "number") return value > 1 ? value / 100 : value;
      const raw = String(value).trim().replace("%", "").replace(/\s/g, "").replace(",", ".");
      if (!raw) return null;
      const num = Number(raw);
      if (Number.isNaN(num)) return null;
      return num > 1 ? num / 100 : num;
    }

    function formatMbPct(value) {
      if (value == null || Number.isNaN(Number(value))) return "";
      return `${(Number(value) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    }

    function setFeedback(message, level = "warn") {
      const feedback = document.querySelector("#comven-upload-feedback");
      if (!feedback) return;
      feedback.textContent = message;
      feedback.classList.remove("is-error", "is-ok", "is-warn");
      feedback.classList.add(level === "error" ? "is-error" : level === "ok" ? "is-ok" : "is-warn");
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

    function getSelectedBatch() { return getBatchById(selectedBatchId); }
    function getBatchById(batchId) { return state.comercialRealizadoBatches.find((batch) => batch.id === batchId) || null; }
    function getSelectedRows() {
      if (!selectedBatchId) return [];
      return state.comercialRealizadoRowsByBatch[selectedBatchId] || [];
    }

    return {
      ensureViewShell,
      renderView,
      loadAndRender
    };
  }

  window.VECTON_COMERCIAL_VENDAS_CARGA = { createComercialVendasCargaModule };
})(window);
