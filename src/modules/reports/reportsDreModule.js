(function attachVectonReportsDreModule(window) {
  function createReportsDreModule(deps) {
    const {
      escapeHtml,
      getCurrentYear,
      getReportsLoadingYear,
      getReportsErrorMessage,
      getBudgetReportsLoadingYear,
      getBudgetReportsErrorMessage,
      reportsLedgerCache,
      reportsBudgetCache,
      buildDreGerRealReport,
      buildDreGerRealTableMarkup,
      buildDreSocRealReport,
      buildDreSocRealTableMarkup,
      buildDreDfsRealReport,
      buildDreDfsRealTableMarkup,
      initAllReportTableResizers,
      initFloatingScrollbar,
      initDreGerDrilldown,
      initDreSocDrilldown,
      isAccessRestricted,
      fetchScenariosForYear,
      fetchScenarioLedgerForYear,
    } = deps;

    const REPORT_HANDLERS = {
      dreGerReal: renderDreGerReal,
      dreDfsReal: renderDreDfsReal,
      dreSocReal: renderDreSocReal,
      dreGerBudget: renderDreGerBudget,
      dreSocBudget: renderDreSocBudget,
      dreDfsBudget: renderDreDfsBudget
    };

    let _budgetSource = "budget";

    function renderSelectedDreReport(detailPanel, selectedReportId) {
      const handler = REPORT_HANDLERS[selectedReportId];
      if (!handler) return false;
      handler(detailPanel);
      return true;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function initBudgetShell(detailPanel, wrapId) {
      detailPanel.innerHTML = `
        <div class="vp-source-bar">
          <span class="vp-source-label">Fonte</span>
          <select class="vp-source-sel" id="vp-dre-src-sel">
            <option value="budget">Budget</option>
          </select>
        </div>
        <div id="${wrapId}" class="reports-table-wrap">
          <div class="actuals-empty">Preparando relatório...</div>
        </div>`;
      return detailPanel.querySelector(`#${wrapId}`);
    }

    async function populateSourceSel(detailPanel, year) {
      const sel = detailPanel.querySelector("#vp-dre-src-sel");
      if (!sel) return;
      try {
        const scenarios = await fetchScenariosForYear(year);
        scenarios.forEach(s => {
          const opt = document.createElement("option");
          opt.value = `scenario:${s.id}`;
          opt.textContent = s.name;
          sel.appendChild(opt);
        });
      } catch (_) {}
      if ([...sel.options].some(o => o.value === _budgetSource)) sel.value = _budgetSource;
    }

    async function getSourceRows(year) {
      if (_budgetSource === "budget") {
        return reportsBudgetCache.get(year)?.rows || [];
      }
      const scenarioId = _budgetSource.slice("scenario:".length);
      return fetchScenarioLedgerForYear(scenarioId, year);
    }

    // ── Real reports ─────────────────────────────────────────────────────────

    function renderDreGerReal(detailPanel) {
      detailPanel.innerHTML = `<div id="reports-ger-table-wrap" class="reports-table-wrap"><div class="actuals-empty">Preparando relatorio...</div></div>`;
      const tableWrap = document.querySelector("#reports-ger-table-wrap");
      if (!tableWrap) return;

      const year = getCurrentYear();
      const cacheEntry = reportsLedgerCache.get(year);
      if (getReportsLoadingYear() === year && !cacheEntry) {
        tableWrap.innerHTML = window.vpSkeletonTable();
        return;
      }
      if (getReportsErrorMessage() && !cacheEntry && getReportsLoadingYear() !== year) {
        tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(getReportsErrorMessage())}</div>`;
        return;
      }

      const report = buildDreGerRealReport(year, cacheEntry?.rows || []);
      if (!report.lines.length) {
        tableWrap.innerHTML = `<div class="actuals-empty">Nenhum dado disponivel para ${year}.</div>`;
        return;
      }

      tableWrap.innerHTML = buildDreGerRealTableMarkup(report, !isAccessRestricted());
      initAllReportTableResizers();
      initFloatingScrollbar(tableWrap);
      if (!isAccessRestricted()) initDreGerDrilldown(tableWrap, cacheEntry?.rows || [], year, "real");
    }

    function renderDreDfsReal(detailPanel) {
      detailPanel.innerHTML = `<div id="reports-dfs-table-wrap" class="reports-table-wrap"><div class="actuals-empty">Preparando relatorio...</div></div>`;
      const tableWrap = document.querySelector("#reports-dfs-table-wrap");
      if (!tableWrap) return;

      const year = getCurrentYear();
      const cacheEntry = reportsLedgerCache.get(year);
      if (getReportsLoadingYear() === year && !cacheEntry) {
        tableWrap.innerHTML = window.vpSkeletonTable();
        return;
      }
      if (getReportsErrorMessage() && !cacheEntry && getReportsLoadingYear() !== year) {
        tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(getReportsErrorMessage())}</div>`;
        return;
      }

      const rows = cacheEntry?.rows || [];
      const gerReport = buildDreGerRealReport(year, rows);
      const report = buildDreDfsRealReport(year, rows, gerReport);
      if (!report.lines.length) {
        tableWrap.innerHTML = `<div class="actuals-empty">Nenhum dado disponivel para ${year}.</div>`;
        return;
      }

      tableWrap.innerHTML = buildDreDfsRealTableMarkup(report);
      initAllReportTableResizers();
      initFloatingScrollbar(tableWrap);
    }

    function renderDreSocReal(detailPanel) {
      detailPanel.innerHTML = `<div id="reports-dre-table-wrap" class="reports-table-wrap"><div class="actuals-empty">Preparando relatorio...</div></div>`;
      const tableWrap = document.querySelector("#reports-dre-table-wrap");
      if (!tableWrap) return;

      const year = getCurrentYear();
      const cacheEntry = reportsLedgerCache.get(year);
      const report = buildDreSocRealReport(year, cacheEntry?.rows || []);

      if (getReportsErrorMessage() && !cacheEntry && getReportsLoadingYear() !== year) {
        tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(getReportsErrorMessage())}</div>`;
        return;
      }
      if (getReportsLoadingYear() === year && !cacheEntry) {
        tableWrap.innerHTML = window.vpSkeletonTable();
        return;
      }
      if (!report.rows.length) {
        tableWrap.innerHTML = `<div class="actuals-empty">Nenhuma linha de DRE disponivel para ${year}.</div>`;
        return;
      }

      tableWrap.innerHTML = buildDreSocRealTableMarkup(report);
      initAllReportTableResizers();
      initFloatingScrollbar(tableWrap);
      const drillReal = initDreSocDrilldown(tableWrap, year);
      setTimeout(() => drillReal.prefetch(), 300);
    }

    // ── Budget / Cenário reports ──────────────────────────────────────────────

    function renderDreGerBudget(detailPanel) {
      const year = getCurrentYear();
      const tableWrap = initBudgetShell(detailPanel, "reports-ger-budget-wrap");
      initFloatingScrollbar(tableWrap);

      populateSourceSel(detailPanel, year).then(() => {
        const sel = detailPanel.querySelector("#vp-dre-src-sel");
        if (sel) sel.addEventListener("change", () => { _budgetSource = sel.value; doRender(); });
        doRender();
      });

      async function doRender() {
        tableWrap.innerHTML = `<div class="actuals-empty">Carregando...</div>`;
        if (_budgetSource === "budget") {
          const cacheEntry = reportsBudgetCache.get(year);
          if (getBudgetReportsLoadingYear() === year && !cacheEntry) { tableWrap.innerHTML = window.vpSkeletonTable(); return; }
          if (getBudgetReportsErrorMessage() && !cacheEntry) { tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(getBudgetReportsErrorMessage())}</div>`; return; }
          const report = buildDreGerRealReport(year, cacheEntry?.rows || []);
          if (!report.lines.length) { tableWrap.innerHTML = `<div class="actuals-empty">Nenhum dado disponivel para ${year}.</div>`; return; }
          tableWrap.innerHTML = buildDreGerRealTableMarkup(report, !isAccessRestricted());
          initAllReportTableResizers();
          if (!isAccessRestricted()) initDreGerDrilldown(tableWrap, cacheEntry?.rows || [], year, "budget");
        } else {
          const rows = await getSourceRows(year);
          const report = buildDreGerRealReport(year, rows);
          if (!report.lines.length) { tableWrap.innerHTML = `<div class="actuals-empty">Nenhum dado de cenário disponivel para ${year}.</div>`; return; }
          tableWrap.innerHTML = buildDreGerRealTableMarkup(report, false);
          initAllReportTableResizers();
        }
      }
    }

    function renderDreSocBudget(detailPanel) {
      const year = getCurrentYear();
      const tableWrap = initBudgetShell(detailPanel, "reports-soc-budget-wrap");
      initFloatingScrollbar(tableWrap);

      populateSourceSel(detailPanel, year).then(() => {
        const sel = detailPanel.querySelector("#vp-dre-src-sel");
        if (sel) sel.addEventListener("change", () => { _budgetSource = sel.value; doRender(); });
        doRender();
      });

      async function doRender() {
        tableWrap.innerHTML = `<div class="actuals-empty">Carregando...</div>`;
        const rows = await getSourceRows(year);
        if (_budgetSource === "budget") {
          const cacheEntry = reportsBudgetCache.get(year);
          if (getBudgetReportsLoadingYear() === year && !cacheEntry) { tableWrap.innerHTML = window.vpSkeletonTable(); return; }
          if (getBudgetReportsErrorMessage() && !cacheEntry) { tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(getBudgetReportsErrorMessage())}</div>`; return; }
        }
        const report = buildDreSocRealReport(year, rows);
        if (!report.rows.length) { tableWrap.innerHTML = `<div class="actuals-empty">Nenhuma linha de DRE disponivel para ${year}.</div>`; return; }
        tableWrap.innerHTML = buildDreSocRealTableMarkup(report);
        initAllReportTableResizers();
        if (_budgetSource === "budget" && !isAccessRestricted()) {
          const drill = initDreSocDrilldown(tableWrap, year, "budget");
          setTimeout(() => drill.prefetch(), 300);
        }
      }
    }

    function renderDreDfsBudget(detailPanel) {
      const year = getCurrentYear();
      const tableWrap = initBudgetShell(detailPanel, "reports-dfs-budget-wrap");
      initFloatingScrollbar(tableWrap);

      populateSourceSel(detailPanel, year).then(() => {
        const sel = detailPanel.querySelector("#vp-dre-src-sel");
        if (sel) sel.addEventListener("change", () => { _budgetSource = sel.value; doRender(); });
        doRender();
      });

      async function doRender() {
        tableWrap.innerHTML = `<div class="actuals-empty">Carregando...</div>`;
        if (_budgetSource === "budget") {
          const cacheEntry = reportsBudgetCache.get(year);
          if (getBudgetReportsLoadingYear() === year && !cacheEntry) { tableWrap.innerHTML = window.vpSkeletonTable(); return; }
          if (getBudgetReportsErrorMessage() && !cacheEntry) { tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(getBudgetReportsErrorMessage())}</div>`; return; }
        }
        const rows = await getSourceRows(year);
        const gerReport = buildDreGerRealReport(year, rows);
        const report = buildDreDfsRealReport(year, rows, gerReport);
        if (!report.lines.length) { tableWrap.innerHTML = `<div class="actuals-empty">Nenhum dado disponivel para ${year}.</div>`; return; }
        tableWrap.innerHTML = buildDreDfsRealTableMarkup(report);
        initAllReportTableResizers();
      }
    }

    function renderFallbackSocReal(detailPanel) {
      renderDreSocReal(detailPanel);
    }

    return {
      renderSelectedDreReport,
      renderFallbackSocReal
    };
  }

  window.VECTON_REPORTS_DRE = {
    createReportsDreModule
  };
})(window);
