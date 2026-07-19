(function attachVectonReportsDreModule(window) {
  function createReportsDreModule(deps) {
    const {
      escapeHtml,
      getCurrentYear,
      getCurrentPeriodMonth,
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
      fetchScenarioReportRowsForYear,
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
    let _compareSource = "budget"; // fonte comparativa embutida nos 3 relatorios "Real" (Mes/Acumulado x Real/Cenario/Var)

    function renderSelectedDreReport(detailPanel, selectedReportId) {
      const handler = REPORT_HANDLERS[selectedReportId];
      if (!handler) return false;
      detailPanel.classList.remove("dre-cmp-shell"); // so os 3 "Real" (initCompareShell) a religam
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

    async function fetchRowsForSource(year, source) {
      if (source === "budget") {
        return reportsBudgetCache.get(year)?.rows || [];
      }
      // Resumo conta × mês (com cache) — os DREs não precisam do ledger completo
      // do cenário, que num "5+7" carrega meses inteiros copiados do realizado.
      const scenarioId = source.slice("scenario:".length);
      return fetchScenarioReportRowsForYear(scenarioId, year);
    }

    async function getSourceRows(year) {
      return fetchRowsForSource(year, _budgetSource);
    }

    // ── Comparador embutido nos relatorios Real (bloco Mes+Acumulado x Real/Cenario/Var) ──

    function initCompareShell(detailPanel, wrapId) {
      detailPanel.classList.add("dre-cmp-shell");
      detailPanel.innerHTML = `
        <div class="vp-source-bar dre-cmp-bar">
          <span class="vp-source-label">Comparar com</span>
          <select class="vp-source-sel" id="vp-dre-cmp-sel">
            <option value="budget">Budget</option>
          </select>
        </div>
        <div id="${wrapId}" class="reports-table-wrap">
          <div class="actuals-empty">Preparando relatório...</div>
        </div>`;
      return detailPanel.querySelector(`#${wrapId}`);
    }

    async function populateCompareSel(detailPanel, year) {
      const sel = detailPanel.querySelector("#vp-dre-cmp-sel");
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
      if ([...sel.options].some(o => o.value === _compareSource)) sel.value = _compareSource;
    }

    // Nome de exibicao do comparativo (texto da opcao selecionada, ex: "Budget" ou "Fcst 5+7")
    // pra usar no lugar do rotulo generico "Cenário" nas colunas.
    function compareLabelFor(detailPanel) {
      const sel = detailPanel.querySelector("#vp-dre-cmp-sel");
      return sel?.selectedOptions?.[0]?.textContent || "Cenário";
    }

    // Falha no comparativo vira aviso visível acima da tabela — antes o erro era
    // engolido pelo catch e as colunas simplesmente não apareciam.
    function friendlyError(e, fallback) {
      return window.vpFriendlyError ? window.vpFriendlyError(e, fallback) : fallback;
    }

    function showCompareError(tableWrap, e) {
      if (!tableWrap.isConnected) return;
      tableWrap.insertAdjacentHTML(
        "afterbegin",
        `<div class="actuals-empty">${escapeHtml(friendlyError(e, "Não foi possível carregar o comparativo."))}</div>`
      );
    }

    // Um doRender pode terminar depois de o usuário já ter trocado a fonte ou
    // saído do relatório — nesse caso o resultado atrasado é descartado.
    function compareIsStale(tableWrap, src) {
      return !tableWrap.isConnected || src !== _compareSource;
    }

    // ── Real reports ─────────────────────────────────────────────────────────

    function renderDreGerReal(detailPanel) {
      const year = getCurrentYear();
      const month = getCurrentPeriodMonth();
      const tableWrap = initCompareShell(detailPanel, "reports-ger-table-wrap");
      initFloatingScrollbar(tableWrap);

      populateCompareSel(detailPanel, year).then(() => {
        const sel = detailPanel.querySelector("#vp-dre-cmp-sel");
        if (sel) sel.addEventListener("change", () => { _compareSource = sel.value; doRender(); });
        doRender();
      });

      async function doRender() {
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

        // Renderiza o real primeiro (rapido, sem esperar rede) — o comparativo
        // chega depois e faz upgrade in-place das colunas extras.
        tableWrap.innerHTML = buildDreGerRealTableMarkup(report, !isAccessRestricted());
        initAllReportTableResizers();
        if (!isAccessRestricted()) initDreGerDrilldown(tableWrap, cacheEntry?.rows || [], year, "real");

        const src = _compareSource;
        try {
          const compareRows = await fetchRowsForSource(year, src);
          if (compareIsStale(tableWrap, src)) return;
          const compareReport = buildDreGerRealReport(year, compareRows);
          tableWrap.innerHTML = buildDreGerRealTableMarkup(report, !isAccessRestricted(), compareReport, month, compareLabelFor(detailPanel));
          initAllReportTableResizers();
          if (!isAccessRestricted()) initDreGerDrilldown(tableWrap, cacheEntry?.rows || [], year, "real");
        } catch (e) {
          console.warn("dre ger comparativo:", e);
          if (!compareIsStale(tableWrap, src)) showCompareError(tableWrap, e);
        }
      }
    }

    function renderDreDfsReal(detailPanel) {
      const year = getCurrentYear();
      const month = getCurrentPeriodMonth();
      const tableWrap = initCompareShell(detailPanel, "reports-dfs-table-wrap");
      initFloatingScrollbar(tableWrap);

      populateCompareSel(detailPanel, year).then(() => {
        const sel = detailPanel.querySelector("#vp-dre-cmp-sel");
        if (sel) sel.addEventListener("change", () => { _compareSource = sel.value; doRender(); });
        doRender();
      });

      async function doRender() {
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

        const src = _compareSource;
        try {
          const compareRows = await fetchRowsForSource(year, src);
          if (compareIsStale(tableWrap, src)) return;
          const compareGerReport = buildDreGerRealReport(year, compareRows);
          const compareReport = buildDreDfsRealReport(year, compareRows, compareGerReport);
          tableWrap.innerHTML = buildDreDfsRealTableMarkup(report, compareReport, month, compareLabelFor(detailPanel));
          initAllReportTableResizers();
        } catch (e) {
          console.warn("dre dfs comparativo:", e);
          if (!compareIsStale(tableWrap, src)) showCompareError(tableWrap, e);
        }
      }
    }

    function renderDreSocReal(detailPanel) {
      const year = getCurrentYear();
      const month = getCurrentPeriodMonth();
      const tableWrap = initCompareShell(detailPanel, "reports-dre-table-wrap");
      initFloatingScrollbar(tableWrap);

      populateCompareSel(detailPanel, year).then(() => {
        const sel = detailPanel.querySelector("#vp-dre-cmp-sel");
        if (sel) sel.addEventListener("change", () => { _compareSource = sel.value; doRender(); });
        doRender();
      });

      async function doRender() {
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
        const drillReal = initDreSocDrilldown(tableWrap, year);
        setTimeout(() => drillReal.prefetch(), 300);

        const src = _compareSource;
        try {
          const compareRows = await fetchRowsForSource(year, src);
          if (compareIsStale(tableWrap, src)) return;
          const compareReport = buildDreSocRealReport(year, compareRows);
          tableWrap.innerHTML = buildDreSocRealTableMarkup(report, compareReport, month, compareLabelFor(detailPanel));
          initAllReportTableResizers();
          const drillReal2 = initDreSocDrilldown(tableWrap, year);
          setTimeout(() => drillReal2.prefetch(), 300);
        } catch (e) {
          console.warn("dre soc comparativo:", e);
          if (!compareIsStale(tableWrap, src)) showCompareError(tableWrap, e);
        }
      }
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
          try {
            const rows = await getSourceRows(year);
            const report = buildDreGerRealReport(year, rows);
            if (!report.lines.length) { tableWrap.innerHTML = `<div class="actuals-empty">Nenhum dado de cenário disponivel para ${year}.</div>`; return; }
            tableWrap.innerHTML = buildDreGerRealTableMarkup(report, !isAccessRestricted());
            initAllReportTableResizers();
            if (!isAccessRestricted()) initDreGerDrilldown(tableWrap, rows, year, _budgetSource);
          } catch (e) {
            tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(friendlyError(e, "Não foi possível carregar o cenário."))}</div>`;
          }
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
        let rows;
        try {
          rows = await getSourceRows(year);
        } catch (e) {
          tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(friendlyError(e, "Não foi possível carregar o cenário."))}</div>`;
          return;
        }
        if (_budgetSource === "budget") {
          const cacheEntry = reportsBudgetCache.get(year);
          if (getBudgetReportsLoadingYear() === year && !cacheEntry) { tableWrap.innerHTML = window.vpSkeletonTable(); return; }
          if (getBudgetReportsErrorMessage() && !cacheEntry) { tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(getBudgetReportsErrorMessage())}</div>`; return; }
        }
        const report = buildDreSocRealReport(year, rows);
        if (!report.rows.length) { tableWrap.innerHTML = `<div class="actuals-empty">Nenhuma linha de DRE disponivel para ${year}.</div>`; return; }
        tableWrap.innerHTML = buildDreSocRealTableMarkup(report);
        initAllReportTableResizers();
        if (!isAccessRestricted()) {
          const drill = initDreSocDrilldown(tableWrap, year, _budgetSource);
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
        let rows;
        try {
          rows = await getSourceRows(year);
        } catch (e) {
          tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(friendlyError(e, "Não foi possível carregar o cenário."))}</div>`;
          return;
        }
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

    function setBudgetSource(source) {
      _budgetSource = source || "budget";
    }

    return {
      renderSelectedDreReport,
      renderFallbackSocReal,
      setBudgetSource
    };
  }

  window.VECTON_REPORTS_DRE = {
    createReportsDreModule
  };
})(window);
