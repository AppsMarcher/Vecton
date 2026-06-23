(function attachVectonReportsOpexModule(window) {
  function createReportsOpexModule(deps) {
    const {
      state,
      escapeHtml,
      normalizeCode,
      getSelectedReportId,
      getOpexHideZeros,
      setOpexHideZeros,
      reportsLedgerCache,
      getOpexStructure,
      buildOpexCostCenterFilter,
      matchesOpexCostCenterFilter,
      buildOpexRealTableMarkup,
      initOpexDrilldown,
      initAllReportTableResizers,
      initFloatingScrollbar,
      fetchActualsLedgerWithCcForYear,
      fetchActualsLedgerForManagementYear,
      renderReportsView,
      renderOpexBudgetReport,
      resolveManagementFilter
    } = deps;

    function renderSelectedOpexReport(detailPanel, selectedReportId) {
      if (selectedReportId === "opexBudget") {
        renderOpexBudgetReport(detailPanel);
      } else if (selectedReportId === "opexReal") {
        renderOpexRealReport(detailPanel);
      } else {
        return false;
      }
      const wrap = detailPanel.querySelector(".reports-table-wrap");
      if (wrap) initFloatingScrollbar(wrap);
      return true;
    }

    function renderOpexRealReport(detailPanel) {
      const year = Number(state.currentPeriod?.year || 2026);
      const managements = [...new Set(
        state.costCenters
          .map((cc) => (cc.management || "").trim())
          .filter(Boolean)
      )].sort();
      const allOption = "Marcher";
      const baseMgmtOptions = [allOption, ...managements];
      const prevMgmt = detailPanel.dataset.opexMgmt || allOption;
      // Gestor/Analista: trava o seletor na própria gestão (fail-closed: sem CC → vazio).
      const { selectedMgmt, locked: mgmtLocked } = resolveManagementFilter(prevMgmt, baseMgmtOptions, allOption);
      const mgmtOptions = mgmtLocked ? [selectedMgmt] : baseMgmtOptions;
      const validCcFilter = buildOpexCostCenterFilter(selectedMgmt);

      if (selectedMgmt !== allOption) {
        const ccCacheKey = `opex-cc-${year}`;
        const cachedCc = reportsLedgerCache.get(ccCacheKey);
        if (cachedCc) {
          const filtered = cachedCc.rows.filter((row) => matchesOpexCostCenterFilter(
            validCcFilter,
            row.cost_center_id ?? "",
            row.cost_center_number ?? ""
          ));
          const opexAccounts = new Set(getOpexStructure().flatMap((section) =>
            section.groups.flatMap((group) => group.accounts)
          ));
          const normalizedCodes = [...new Set(filtered.map((row) => normalizeCode(row.account_number ?? "")))];
          const notInOpex = normalizedCodes.filter((code) => !opexAccounts.has(code));
          console.log("Contas NÃƒO no OPEX:", notInOpex);
          notInOpex.forEach((code) => {
            const total = filtered
              .filter((row) => normalizeCode(row.account_number ?? "") === code)
              .reduce((sum, row) => sum + Number(row.amount), 0);
            console.log(`  ${code}: ${total.toFixed(2)}`);
          });
        }
      }

      renderHeaderSlot({
        detailPanel,
        year,
        allOption,
        selectedMgmt,
        mgmtOptions,
        locked: mgmtLocked
      });

      const ccCacheKey = `opex-cc-${year}`;
      if (selectedMgmt === allOption) {
        const cacheEntry = reportsLedgerCache.get(year);
        const rows = cacheEntry?.rows || [];
        const tableMarkup = buildOpexRealTableMarkup(rows, null, getOpexHideZeros());
        detailPanel.innerHTML = `<div class="opex-report-wrap reports-table-wrap"><div id="opex-table-inner">${tableMarkup}</div></div>`;
        const cachedCc = reportsLedgerCache.get(ccCacheKey);
        if (cachedCc) {
          const tableEl = detailPanel.querySelector(".reports-opex-table");
          if (tableEl) initOpexDrilldown(tableEl, cachedCc.rows, null);
        } else {
          fetchActualsLedgerWithCcForYear(year).then((rowsWithCc) => {
            reportsLedgerCache.set(ccCacheKey, { rows: rowsWithCc });
            if (getSelectedReportId() === "opexReal") {
              const tableEl = detailPanel.querySelector(".reports-opex-table");
              if (tableEl) initOpexDrilldown(tableEl, rowsWithCc, null);
            }
          }).catch(() => {});
        }
      } else {
        const mgmtCacheKey = `opex-mgmt-${year}-${selectedMgmt}`;
        const cached = reportsLedgerCache.get(mgmtCacheKey);
        if (cached) {
          const tableMarkup = buildOpexRealTableMarkup(cached.rows, null, getOpexHideZeros());
          detailPanel.innerHTML = `<div class="opex-report-wrap reports-table-wrap"><div id="opex-table-inner">${tableMarkup}</div></div>`;
          const tableEl = detailPanel.querySelector(".reports-opex-table");
          if (tableEl) initOpexDrilldown(tableEl, cached.rows, null);
        } else {
          detailPanel.dataset.opexMgmt = selectedMgmt;
          detailPanel.innerHTML = `<div class="opex-report-wrap reports-table-wrap"><div id="opex-table-inner">${window.vpSkeletonTable()}</div></div>`;
          fetchActualsLedgerForManagementYear(year, selectedMgmt).then((rows) => {
            reportsLedgerCache.set(mgmtCacheKey, { rows });
            if (getSelectedReportId() === "opexReal" && detailPanel.dataset.opexMgmt === selectedMgmt) {
              renderReportsView();
            }
          }).catch(() => {
            if (getSelectedReportId() === "opexReal") {
              detailPanel.querySelector("#opex-table-inner").innerHTML = `<div class="actuals-empty">Erro ao carregar dados com CC.</div>`;
            }
          });
          return;
        }
      }

      initAllReportTableResizers();
    }

    function renderHeaderSlot({ detailPanel, year, allOption, selectedMgmt, mgmtOptions, locked = false }) {
      const opexSlot = document.querySelector("#opex-gestao-slot");
      if (!opexSlot) return;

      opexSlot.hidden = false;
      opexSlot.innerHTML = `
        <div class="opex-header-filter" style="display:flex;align-items:center;gap:10px">
          <select class="opex-filter-select" id="opex-mgmt-select-header" ${locked ? "disabled" : ""}>
            ${mgmtOptions.map((management) => `<option value="${escapeHtml(management)}" ${management === selectedMgmt ? "selected" : ""} ${locked && management !== selectedMgmt ? "disabled" : ""}>${escapeHtml(management)}</option>`).join("")}
          </select>
          <button id="opex-hide-zeros-btn" type="button" style="
            height:32px;padding:0 12px;border-radius:8px;font-size:0.74rem;font-weight:500;
            border:1px solid ${getOpexHideZeros() ? "var(--blue)" : "var(--line)"};
            background:${getOpexHideZeros() ? "var(--blue-soft)" : "transparent"};
            color:${getOpexHideZeros() ? "var(--blue)" : "var(--text-faint)"};
            cursor:pointer;white-space:nowrap;transition:all .15s
          ">Ocultar zeros</button>
        </div>
      `;

      const headerSel = opexSlot.querySelector("#opex-mgmt-select-header");
      if (headerSel) {
        headerSel.addEventListener("change", () => {
          detailPanel.dataset.opexMgmt = headerSel.value;
          if (headerSel.value !== allOption) {
            reportsLedgerCache.delete(`opex-mgmt-${year}-${headerSel.value}`);
          }
          renderReportsView();
        });
      }

      const hideZerosBtn = opexSlot.querySelector("#opex-hide-zeros-btn");
      if (hideZerosBtn) {
        hideZerosBtn.addEventListener("click", () => {
          setOpexHideZeros(!getOpexHideZeros());
          renderReportsView();
        });
      }
    }

    return {
      renderSelectedOpexReport
    };
  }

  window.VECTON_REPORTS_OPEX = {
    createReportsOpexModule
  };
})(window);
