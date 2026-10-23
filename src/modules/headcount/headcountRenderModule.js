(function attachVectonHeadcountRenderModule(window) {
  function createHeadcountRenderModule(deps) {
    const {
      escapeHtml,
      formatMonthLabel,
      formatActualsStatus,
      getActualsStatusClass,
      buildEmptyRow,
      HEADCOUNT_ROWS_PER_PAGE,
      getState,
      getActiveView,
      getSelectedHeadcountLoadType,
      getSelectedHcBatch,
      getSelectedHcRows,
      getLoadingHeadcountBatchIds,
      getHeadcountRowsFilter,
      getHeadcountRowsPage,
      setHeadcountRowsPage,
      getActiveHcErrorRowId,
      renderHcRowsTableRef
    } = deps;

    function renderHeadcountView() {
      const detail = document.querySelector("#headcount-detail");
      if (!detail || detail.style.display === "none") return;

      const periodLabel = document.querySelector("#hc-period-label");
      const state = getState();
      if (periodLabel) periodLabel.textContent = `${formatMonthLabel(state.currentPeriod.month)}/${state.currentPeriod.year}`;

      const loadModeSelect = document.querySelector("#hc-load-mode");
      const selectedBatch = getSelectedHcBatch();
      if (loadModeSelect && selectedBatch) loadModeSelect.value = selectedBatch.loadMode;

      renderHcBatchList();
      renderHcBatchSummary();
      renderHcErrorLog();
      renderHcRowsTable();
    }

    function renderHcBatchList() {
      const container = document.querySelector("#hc-batch-list");
      if (!container) return;

      container.innerHTML = "";
      const batches = getState().headcountBatches.filter((batch) =>
        !getSelectedHeadcountLoadType() || batch.loadType === getSelectedHeadcountLoadType()
      );
      if (!batches.length) {
        const empty = document.createElement("div");
        empty.className = "actuals-empty";
        empty.textContent = "Nenhum lote carregado ainda.";
        container.append(empty);
        return;
      }

      batches.forEach((batch) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "actuals-batch-item";
        if (batch.id === getSelectedHcBatch()?.id) button.classList.add("active");
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

    function renderHcBatchSummary() {
      const container = document.querySelector("#hc-batch-summary");
      const title = document.querySelector("#hc-batch-title");
      const caption = document.querySelector("#hc-log-caption");
      const applyButton = document.querySelector("#hc-apply-batch");
      const addRowButton = document.querySelector("#hc-add-row");
      const deleteBatchButton = document.querySelector("#hc-delete-batch");
      if (!container || !title || !caption || !applyButton || !addRowButton || !deleteBatchButton) return;

      const batch = getSelectedHcBatch();
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
        ? `${batch.errorRows} linha(s) com erro bloqueando a importação.`
        : `Lote com ${batch.validRows} linha(s) válidas.`;
      applyButton.disabled = batch.totalRows === 0 || batch.errorRows > 0;
      addRowButton.disabled = false;
      deleteBatchButton.disabled = false;

      [
        { label: "Ano base", value: String(batch.referenceYear) },
        { label: "Mês da carga", value: formatMonthLabel(batch.referenceMonth) },
        { label: "Tipo", value: batch.loadMode === "complete" ? "Carga completa" : "Carga adicional" },
        { label: "Origem", value: batch.sourceType === "manual" ? "Manual" : batch.sourceFileName || "Arquivo" },
        { label: "Linhas", value: String(batch.totalRows) },
        { label: "Válidas", value: String(batch.validRows) },
        { label: "Erros", value: String(batch.errorRows) },
        { label: "Status", value: formatActualsStatus(batch.status) }
      ].forEach((item) => {
        const stat = document.createElement("div");
        stat.className = "actuals-summary-card";
        stat.innerHTML = `<span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong>`;
        container.append(stat);
      });
    }

    function renderHcErrorLog() {
      const container = document.querySelector("#hc-error-log");
      if (!container) return;
      container.innerHTML = "";

      const batch = getSelectedHcBatch();
      if (!batch) {
        container.innerHTML = `<div class="actuals-empty">Sem lote selecionado.</div>`;
        return;
      }

      if (batch.errorRows === 0) {
        container.innerHTML = `<div class="actuals-success-box">Lote sem erros. O resumo fica concentrado no cabeçalho do lote.</div>`;
        return;
      }

      getSelectedHcRows()
        .filter((row) => row.validationStatus === "error")
        .forEach((row) => {
          const item = document.createElement("div");
          item.className = "actuals-error-item";
          item.innerHTML = `<strong>Linha ${row.rowNumber}</strong><span>${escapeHtml((row.validationErrors || []).join(" • "))}</span>`;
          container.append(item);
        });
    }

    function renderHcRowsTable() {
      const tbody = document.querySelector("#hc-rows-body");
      if (!tbody) return;
      tbody.innerHTML = "";

      const batch = getSelectedHcBatch();
      if (batch && getLoadingHeadcountBatchIds().has(batch.id)) {
        tbody.append(buildEmptyRow("Carregando linhas...", 8));
        renderHcRowsPagination(0, 0);
        return;
      }

      const allRows = getSelectedHcRows().slice().sort((a, b) => a.rowNumber - b.rowNumber);
      const filter = getHeadcountRowsFilter().toLowerCase().trim();
      const filtered = filter
        ? allRows.filter((row) =>
          (row.costCenterNumber || "").toLowerCase().includes(filter)
          || (row.matricula || "").toLowerCase().includes(filter)
          || (row.colab || "").toLowerCase().includes(filter)
          || (row.cargo || "").toLowerCase().includes(filter)
          || (row.branchCode || "").toLowerCase().includes(filter)
          || String(row.rowNumber).includes(filter)
        )
        : allRows;

      const countEl = document.querySelector("#hc-rows-count");
      if (countEl) countEl.textContent = filter ? `${filtered.length} de ${allRows.length} colaborador(es)` : `${allRows.length} colaborador(es)`;

      if (!filtered.length) {
        tbody.append(buildEmptyRow(filter ? "Nenhum resultado para este filtro." : "Nenhuma linha carregada.", 8));
        renderHcRowsPagination(0, 0);
        return;
      }

      const totalPages = Math.ceil(filtered.length / HEADCOUNT_ROWS_PER_PAGE);
      setHeadcountRowsPage(Math.min(Math.max(1, getHeadcountRowsPage()), totalPages));
      const start = (getHeadcountRowsPage() - 1) * HEADCOUNT_ROWS_PER_PAGE;
      const pageRows = filtered.slice(start, start + HEADCOUNT_ROWS_PER_PAGE);
      const activeHcErrorRowId = getActiveHcErrorRowId() || null;

      pageRows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.dataset.rowId = row.id;
        const isErrorOpen = activeHcErrorRowId === row.id && row.validationStatus === "error";
        const statusCell = row.validationStatus === "error"
          ? `<div class="actuals-status-wrap">
               <button class="actuals-badge is-error actuals-error-trigger" type="button" data-hc-error-row="${row.id}">${escapeHtml(formatActualsStatus(row.validationStatus))}</button>
               ${isErrorOpen ? `<div class="actuals-error-popover"><strong>Erros nesta linha</strong><ul>${(row.validationErrors || []).map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>` : ""}
             </div>`
          : `<span class="actuals-badge ${escapeHtml(getActualsStatusClass(row.validationStatus))}">${escapeHtml(formatActualsStatus(row.validationStatus))}</span>`;
        tr.innerHTML = `
          <td class="actuals-col-row">${row.rowNumber}</td>
          <td class="actuals-col-branch"><input class="actuals-field actuals-field-branch" data-field="branchCode" type="text" inputmode="numeric" maxlength="10" value="${escapeHtml(row.branchCode || "")}"></td>
          <td class="actuals-col-cc"><input class="actuals-field actuals-field-cc" data-field="costCenterNumber" type="text" inputmode="numeric" maxlength="10" value="${escapeHtml(row.costCenterNumber || "")}"></td>
          <td class="actuals-col-lot hc-col-registration"><input class="actuals-field actuals-field-lot" data-field="matricula" type="text" maxlength="20" value="${escapeHtml(row.matricula || "")}"></td>
          <td class="actuals-col-history hc-col-employee"><input class="actuals-field actuals-field-history" data-field="colab" type="text" maxlength="80" value="${escapeHtml(row.colab || "")}"></td>
          <td class="actuals-col-history hc-col-role"><input class="actuals-field actuals-field-history" data-field="cargo" type="text" maxlength="80" value="${escapeHtml(row.cargo || "")}"></td>
          <td class="actuals-col-status">${statusCell}</td>
          <td class="actuals-col-action"><button class="table-icon-button table-icon-button-only" type="button" data-delete-row="${row.id}" aria-label="Excluir linha"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#vp-icon-trash"></use></svg></button></td>
        `;
        tbody.append(tr);
      });

      renderHcRowsPagination(getHeadcountRowsPage(), totalPages);
    }

    function renderHcRowsPagination(currentPage, totalPages) {
      const container = document.querySelector("#hc-rows-pagination");
      if (!container) return;
      container.innerHTML = "";
      if (totalPages <= 1) return;

      const nav = document.createElement("div");
      nav.className = "rows-pagination-inner";
      const info = document.createElement("span");
      info.className = "rows-pagination-info";
      info.textContent = `Página ${currentPage} de ${totalPages}`;
      nav.append(info);

      const controls = document.createElement("div");
      controls.className = "rows-pagination-controls";
      const btnFirst = buildPaginationBtn("«", currentPage === 1, () => {
        setHeadcountRowsPage(1);
        renderHcRowsTableRef();
      });
      const btnPrev = buildPaginationBtn("‹ Anterior", currentPage === 1, () => {
        setHeadcountRowsPage(getHeadcountRowsPage() - 1);
        renderHcRowsTableRef();
      });
      const pageButtons = buildPageNumberButtons(currentPage, totalPages).map((element) => {
        if (element.tagName === "BUTTON" && !element.classList.contains("active")) {
          const page = Number(element.textContent);
          element.onclick = () => {
            setHeadcountRowsPage(page);
            renderHcRowsTableRef();
          };
        }
        return element;
      });
      const btnNext = buildPaginationBtn("Proximo ›", currentPage === totalPages, () => {
        setHeadcountRowsPage(getHeadcountRowsPage() + 1);
        renderHcRowsTableRef();
      });
      const btnLast = buildPaginationBtn("»", currentPage === totalPages, () => {
        setHeadcountRowsPage(totalPages);
        renderHcRowsTableRef();
      });

      controls.append(btnFirst, btnPrev, ...pageButtons, btnNext, btnLast);
      nav.append(controls);
      container.append(nav);
    }

    function buildPaginationBtn(label, disabled, onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rows-pagination-btn";
      button.textContent = label;
      button.disabled = disabled;
      if (!disabled) button.onclick = onClick;
      return button;
    }

    function buildPageNumberButtons(currentPage, totalPages) {
      const buttons = [];
      const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
      const validPages = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
      let previousPage = 0;

      validPages.forEach((page) => {
        if (page - previousPage > 1) {
          const ellipsis = document.createElement("span");
          ellipsis.className = "rows-pagination-ellipsis";
          ellipsis.textContent = "...";
          buttons.push(ellipsis);
        }

        const button = document.createElement("button");
        button.type = "button";
        button.className = "rows-pagination-btn";
        button.textContent = String(page);
        if (page === currentPage) button.classList.add("active");
        buttons.push(button);
        previousPage = page;
      });

      return buttons;
    }

    return {
      renderHeadcountView,
      renderHcBatchList,
      renderHcBatchSummary,
      renderHcErrorLog,
      renderHcRowsTable,
      renderHcRowsPagination
    };
  }

  window.VECTON_HEADCOUNT_RENDER = {
    createHeadcountRenderModule
  };
})(window);
