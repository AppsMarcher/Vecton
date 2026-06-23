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
      initDreGerDrilldown,
      initDreSocDrilldown,
      getAllowedCcNumbers,
      fetchActualsLedgerFullForYear,
      fetchBudgetLedgerFullForYear
    } = deps;

    const REPORT_HANDLERS = {
      dreGerReal: renderDreGerReal,
      dreDfsReal: renderDreDfsReal,
      dreSocReal: renderDreSocReal,
      dreGerBudget: renderDreGerBudget,
      dreSocBudget: renderDreSocBudget,
      dreDfsBudget: renderDreDfsBudget
    };

    function renderSelectedDreReport(detailPanel, selectedReportId) {
      const handler = REPORT_HANDLERS[selectedReportId];
      if (!handler) {
        return false;
      }
      handler(detailPanel);
      return true;
    }

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

      tableWrap.innerHTML = buildDreGerRealTableMarkup(report);
      initAllReportTableResizers();
      initDreGerDrilldown(tableWrap, cacheEntry?.rows || [], year, "real");
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
    }

    function renderDreSocReal(detailPanel) {
      detailPanel.innerHTML = `<div id="reports-dre-table-wrap" class="reports-table-wrap"><div class="actuals-empty">Preparando relatorio...</div></div>`;
      const tableWrap = document.querySelector("#reports-dre-table-wrap");
      if (!tableWrap) return;

      const year = getCurrentYear();
      const allowedCcs = getAllowedCcNumbers();

      if (!allowedCcs) {
        // Admin: usa cache pré-agregado (sem CC, mas sem restrição)
        const cacheEntry = reportsLedgerCache.get(year);
        if (getReportsErrorMessage() && !cacheEntry && getReportsLoadingYear() !== year) {
          tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(getReportsErrorMessage())}</div>`;
          return;
        }
        if (getReportsLoadingYear() === year && !cacheEntry) {
          tableWrap.innerHTML = window.vpSkeletonTable();
          return;
        }
        const report = buildDreSocRealReport(year, cacheEntry?.rows || []);
        if (!report.rows.length) {
          tableWrap.innerHTML = `<div class="actuals-empty">Nenhuma linha de DRE disponivel para ${year}.</div>`;
          return;
        }
        tableWrap.innerHTML = buildDreSocRealTableMarkup(report);
        initAllReportTableResizers();
        initDreSocDrilldown(tableWrap, year);
        return;
      }

      // Gestor/Analista: precisa do ledger com CC para filtrar
      const ccCacheKey = `soc-real-cc-${year}`;
      const ccCached = reportsLedgerCache.get(ccCacheKey);
      if (!ccCached) {
        tableWrap.innerHTML = window.vpSkeletonTable();
        fetchActualsLedgerFullForYear(year).then((fullRows) => {
          const filtered = fullRows.filter(r => allowedCcs.has(String(r.cost_center_number ?? "").trim()));
          reportsLedgerCache.set(ccCacheKey, { rows: filtered });
          renderDreSocReal(detailPanel);
        }).catch(() => {
          tableWrap.innerHTML = `<div class="actuals-empty">Erro ao carregar DRE Societário.</div>`;
        });
        return;
      }

      const report = buildDreSocRealReport(year, ccCached.rows);
      if (!report.rows.length) {
        tableWrap.innerHTML = `<div class="actuals-empty">Nenhuma linha de DRE disponivel para ${year}.</div>`;
        return;
      }
      tableWrap.innerHTML = buildDreSocRealTableMarkup(report);
      initAllReportTableResizers();
      initDreSocDrilldown(tableWrap, year);
    }

    function renderDreGerBudget(detailPanel) {
      detailPanel.innerHTML = `<div id="reports-ger-budget-wrap" class="reports-table-wrap"><div class="actuals-empty">Preparando relatorio...</div></div>`;
      const tableWrap = document.querySelector("#reports-ger-budget-wrap");
      if (!tableWrap) return;

      const year = getCurrentYear();
      const cacheEntry = reportsBudgetCache.get(year);
      if (getBudgetReportsLoadingYear() === year && !cacheEntry) {
        tableWrap.innerHTML = window.vpSkeletonTable();
        return;
      }
      if (getBudgetReportsErrorMessage() && !cacheEntry) {
        tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(getBudgetReportsErrorMessage())}</div>`;
        return;
      }

      const report = buildDreGerRealReport(year, cacheEntry?.rows || []);
      if (!report.lines.length) {
        tableWrap.innerHTML = `<div class="actuals-empty">Nenhum dado de planejado disponivel para ${year}.</div>`;
        return;
      }

      tableWrap.innerHTML = buildDreGerRealTableMarkup(report);
      initAllReportTableResizers();
      initDreGerDrilldown(tableWrap, cacheEntry?.rows || [], year, "budget");
    }

    function renderDreSocBudget(detailPanel) {
      detailPanel.innerHTML = `<div id="reports-soc-budget-wrap" class="reports-table-wrap"><div class="actuals-empty">Preparando relatorio...</div></div>`;
      const tableWrap = document.querySelector("#reports-soc-budget-wrap");
      if (!tableWrap) return;

      const year = getCurrentYear();
      const allowedCcs = getAllowedCcNumbers();

      if (!allowedCcs) {
        // Admin: usa cache pré-agregado (sem restrição)
        const cacheEntry = reportsBudgetCache.get(year);
        if (getBudgetReportsLoadingYear() === year && !cacheEntry) {
          tableWrap.innerHTML = window.vpSkeletonTable();
          return;
        }
        if (getBudgetReportsErrorMessage() && !cacheEntry) {
          tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(getBudgetReportsErrorMessage())}</div>`;
          return;
        }
        const report = buildDreSocRealReport(year, cacheEntry?.rows || []);
        if (!report.rows.length) {
          tableWrap.innerHTML = `<div class="actuals-empty">Nenhuma linha de DRE de planejado disponivel para ${year}.</div>`;
          return;
        }
        tableWrap.innerHTML = buildDreSocRealTableMarkup(report);
        initAllReportTableResizers();
        initDreSocDrilldown(tableWrap, year, "budget");
        return;
      }

      // Gestor/Analista: precisa do ledger com CC para filtrar
      const ccCacheKey = `soc-budget-cc-${year}`;
      const ccCached = reportsLedgerCache.get(ccCacheKey);
      if (!ccCached) {
        tableWrap.innerHTML = window.vpSkeletonTable();
        fetchBudgetLedgerFullForYear(year).then((fullRows) => {
          const filtered = fullRows.filter(r => allowedCcs.has(String(r.cost_center_number ?? "").trim()));
          reportsLedgerCache.set(ccCacheKey, { rows: filtered });
          renderDreSocBudget(detailPanel);
        }).catch(() => {
          tableWrap.innerHTML = `<div class="actuals-empty">Erro ao carregar DRE Societário Budget.</div>`;
        });
        return;
      }

      const report = buildDreSocRealReport(year, ccCached.rows);
      if (!report.rows.length) {
        tableWrap.innerHTML = `<div class="actuals-empty">Nenhuma linha de DRE de planejado disponivel para ${year}.</div>`;
        return;
      }
      tableWrap.innerHTML = buildDreSocRealTableMarkup(report);
      initAllReportTableResizers();
      initDreSocDrilldown(tableWrap, year, "budget");
    }

    function renderDreDfsBudget(detailPanel) {
      detailPanel.innerHTML = `<div id="reports-dfs-budget-wrap" class="reports-table-wrap"><div class="actuals-empty">Preparando relatorio...</div></div>`;
      const tableWrap = document.querySelector("#reports-dfs-budget-wrap");
      if (!tableWrap) return;

      const year = getCurrentYear();
      const cacheEntry = reportsBudgetCache.get(year);
      if (getBudgetReportsLoadingYear() === year && !cacheEntry) {
        tableWrap.innerHTML = window.vpSkeletonTable();
        return;
      }
      if (getBudgetReportsErrorMessage() && !cacheEntry) {
        tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(getBudgetReportsErrorMessage())}</div>`;
        return;
      }

      const rows = cacheEntry?.rows || [];
      const gerReport = buildDreGerRealReport(year, rows);
      const report = buildDreDfsRealReport(year, rows, gerReport);
      if (!report.lines.length) {
        tableWrap.innerHTML = `<div class="actuals-empty">Nenhum dado de planejado disponivel para ${year}.</div>`;
        return;
      }

      tableWrap.innerHTML = buildDreDfsRealTableMarkup(report);
      initAllReportTableResizers();
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
