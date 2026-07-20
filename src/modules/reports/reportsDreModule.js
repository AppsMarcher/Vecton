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

    // Fonte selecionada nos 3 relatorios "Budget" (Ger/Soc/Dfs).
    // null = ainda nao resolvida -> assume o cenario favorito da org (is_default),
    // ou Budget se nao houver. Troca manual no select vale so para a sessao.
    // setBudgetSource() (chamado ao abrir a partir do detalhe do cenario) sempre
    // define um valor explicito, entao nunca fica null depois de uma chamada dessas.
    let _budgetSource = null;
    // Fonte comparativa embutida nos 3 relatorios "Real" (Mes/Acumulado x Real/Cenario/Var).
    // null = ainda nao resolvida -> assume o cenario favorito da org (is_default),
    // ou Budget se nao houver. Troca manual no select vale so para a sessao.
    let _compareSource = null;

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
        if (_budgetSource === null) {
          const fav = scenarios.find(s => s.is_default);
          _budgetSource = fav ? `scenario:${fav.id}` : "budget";
        }
      } catch (_) {}
      // Fonte inexistente (fetch falhou ou cenario removido) -> volta ao Budget.
      if (!_budgetSource || ![...sel.options].some(o => o.value === _budgetSource)) {
        _budgetSource = "budget";
      }
      sel.value = _budgetSource;
    }

    async function fetchRowsForSource(year, source) {
      if (!source || source === "budget") {
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
        if (_compareSource === null) {
          const fav = scenarios.find(s => s.is_default);
          _compareSource = fav ? `scenario:${fav.id}` : "budget";
        }
      } catch (_) {}
      // Fonte inexistente (fetch falhou ou cenario removido) -> volta ao Budget.
      if (!_compareSource || ![...sel.options].some(o => o.value === _compareSource)) {
        _compareSource = "budget";
      }
      sel.value = _compareSource;
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

        // Espera o comparativo ANTES de pintar — real+comparativo nascem
        // juntos, sem "flash" de upgrade in-place (mesma dinâmica do OPEX Real).
        tableWrap.innerHTML = window.vpSkeletonTable();
        const src = _compareSource;
        let compareReport = null;
        let compareError = null;
        try {
          const compareRows = await fetchRowsForSource(year, src);
          compareReport = buildDreGerRealReport(year, compareRows);
        } catch (e) {
          console.warn("dre ger comparativo:", e);
          compareError = e;
        }
        if (compareIsStale(tableWrap, src)) return;
        tableWrap.innerHTML = buildDreGerRealTableMarkup(report, !isAccessRestricted(), compareReport, month, compareLabelFor(detailPanel));
        initAllReportTableResizers();
        if (!isAccessRestricted()) initDreGerDrilldown(tableWrap, cacheEntry?.rows || [], year, "real");
        if (compareError) showCompareError(tableWrap, compareError);
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

        // Espera o comparativo ANTES de pintar — mesma dinâmica do OPEX Real.
        tableWrap.innerHTML = window.vpSkeletonTable();
        const src = _compareSource;
        let compareReport = null;
        let compareError = null;
        try {
          const compareRows = await fetchRowsForSource(year, src);
          const compareGerReport = buildDreGerRealReport(year, compareRows);
          compareReport = buildDreDfsRealReport(year, compareRows, compareGerReport);
        } catch (e) {
          console.warn("dre dfs comparativo:", e);
          compareError = e;
        }
        if (compareIsStale(tableWrap, src)) return;
        tableWrap.innerHTML = buildDreDfsRealTableMarkup(report, compareReport, month, compareLabelFor(detailPanel));
        initAllReportTableResizers();
        if (compareError) showCompareError(tableWrap, compareError);
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

        // Espera o comparativo ANTES de pintar — mesma dinâmica do OPEX Real.
        tableWrap.innerHTML = window.vpSkeletonTable();
        const src = _compareSource;
        let compareReport = null;
        let compareError = null;
        try {
          const compareRows = await fetchRowsForSource(year, src);
          compareReport = buildDreSocRealReport(year, compareRows);
        } catch (e) {
          console.warn("dre soc comparativo:", e);
          compareError = e;
        }
        if (compareIsStale(tableWrap, src)) return;
        tableWrap.innerHTML = buildDreSocRealTableMarkup(report, compareReport, month, compareLabelFor(detailPanel));
        initAllReportTableResizers();
        const drillReal = initDreSocDrilldown(tableWrap, year);
        setTimeout(() => drillReal.prefetch(), 300);
        if (compareError) showCompareError(tableWrap, compareError);
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

    // Chamado quando o favorito da org muda (estrela no Planejamento): o
    // proximo render dos DREs Real re-resolve o default do "Comparar com".
    function resetCompareSource() {
      _compareSource = null;
    }

    // Idem, para o default da "Fonte" dos 3 relatorios Budget.
    function resetBudgetSource() {
      _budgetSource = null;
    }

    return {
      renderSelectedDreReport,
      renderFallbackSocReal,
      setBudgetSource,
      resetCompareSource,
      resetBudgetSource
    };
  }

  window.VECTON_REPORTS_DRE = {
    createReportsDreModule
  };
})(window);
