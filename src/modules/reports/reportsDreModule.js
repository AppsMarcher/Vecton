(function attachVectonReportsDreModule(window) {
  function createReportsDreModule(deps) {
    const {
      escapeHtml,
      getCurrentYear,
      getCurrentPeriodMonth,
      getReportsLoadingYear,
      getReportsErrorMessage,
      reportsLedgerCache,
      buildDreGerRealReport,
      buildDreGerRealTableMarkup,
      buildDreSocRealReport,
      buildDreSocRealTableMarkup,
      buildDreDfsRealReport,
      buildDreDfsRealTableMarkup,
      initAllReportTableResizers,
      initFloatingScrollbar,
      initVerticalScrollBounds,
      initDreGerDrilldown,
      initDreSocDrilldown,
      isAccessRestricted,
      fetchAllScenarios,
      fetchRealYears,
      rowsForSource,
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
      detailPanel.classList.remove("dre-cmp-shell"); // os shells DRE Real e Meta a religam
      handler(detailPanel);
      return true;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function initBudgetShell(detailPanel, wrapId) {
      detailPanel.classList.add("dre-cmp-shell");
      detailPanel.innerHTML = `
        <div class="vp-source-bar dre-cmp-bar">
          <span class="vp-source-label">Fonte</span>
          <select class="vp-source-sel" id="vp-dre-src-sel">
            <option value="">Carregando…</option>
          </select>
        </div>
        <div id="${wrapId}" class="reports-table-wrap">
          <div class="actuals-empty">Preparando relatório...</div>
        </div>`;
      return detailPanel.querySelector(`#${wrapId}`);
    }

    // Opções de fonte (cenários de qualquer ano; "Real {ano}" só nos comparativos)
    // e o valor a assumir: o atual se ainda existir; senão a estrela global, o
    // "Budget {ano do toggle}" ou a primeira opção. O valor legado "budget" vira
    // "Budget {ano do toggle}".
    async function resolveSourceChoices(year, includeReal, current) {
      const S = window.VECTON_SCENARIO_SOURCES;
      let scenarios = [];
      let realYears = [];
      try {
        [scenarios, realYears] = await Promise.all([
          fetchAllScenarios(),
          includeReal ? fetchRealYears() : Promise.resolve([])
        ]);
      } catch (_) { /* sem fontes: select fica vazio */ }
      return S.chooseSource({ scenarios, realYears, current, toggleYear: year });
    }

    function fillSourceSelect(sel, options, value) {
      sel.innerHTML = options.length
        ? options.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("")
        : `<option value="">Nenhuma fonte disponível</option>`;
      if (value) sel.value = value;
    }

    async function populateSourceSel(detailPanel, year) {
      const sel = detailPanel.querySelector("#vp-dre-src-sel");
      if (!sel) return;
      const { options, value } = await resolveSourceChoices(year, false, _budgetSource);
      _budgetSource = value;
      fillSourceSelect(sel, options, value);
    }

    async function fetchRowsForSource(year, source) {
      // Resumo conta × mês (com cache), lido no ano da própria fonte.
      return rowsForSource(source, year);
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
            <option value="">Carregando…</option>
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
      const { options, value } = await resolveSourceChoices(year, true, _compareSource);
      _compareSource = value;
      fillSourceSelect(sel, options, value);
    }

    // Nome de exibicao do comparativo (texto da opcao selecionada, ex: "Budget" ou "Fcst 5+7")
    // pra usar no lugar do rotulo generico "Cenário" nas colunas.
    function compareLabelFor(detailPanel) {
      const sel = detailPanel.querySelector("#vp-dre-cmp-sel");
      return sel?.selectedOptions?.[0]?.textContent || "Cenário";
    }

    // Nome do cenário selecionado no toggle "Fonte" dos DREs de Meta (cabeçalho da tabela).
    function sourceLabelFor(detailPanel) {
      const sel = detailPanel.querySelector("#vp-dre-src-sel");
      return sel?.selectedOptions?.[0]?.textContent || "Meta";
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
      // Sem scrollbar flutuante aqui: o DFs tem poucas linhas e cabe inteiro
      // na tela sem precisar rolar a página, então a barra própria do card
      // (overflow-x do tableWrap) já fica sempre visível — a flutuante virava
      // uma segunda barra duplicada logo abaixo dela (reportado pelo usuário).

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
      initVerticalScrollBounds(tableWrap);

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
        try {
          const rows = await getSourceRows(year);
          const report = buildDreGerRealReport(year, rows);
          if (!report.lines.length) { tableWrap.innerHTML = `<div class="actuals-empty">Nenhum dado de cenário disponivel para ${year}.</div>`; return; }
          tableWrap.innerHTML = buildDreGerRealTableMarkup(report, !isAccessRestricted(), null, null, sourceLabelFor(detailPanel));
          initAllReportTableResizers();
          if (!isAccessRestricted()) initDreGerDrilldown(tableWrap, rows, year, _budgetSource);
        } catch (e) {
          tableWrap.innerHTML = `<div class="actuals-empty">${escapeHtml(friendlyError(e, "Não foi possível carregar o cenário."))}</div>`;
        }
      }
    }

    function renderDreSocBudget(detailPanel) {
      const year = getCurrentYear();
      const tableWrap = initBudgetShell(detailPanel, "reports-soc-budget-wrap");
      initFloatingScrollbar(tableWrap);
      initVerticalScrollBounds(tableWrap);

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
        const report = buildDreSocRealReport(year, rows);
        if (!report.rows.length) { tableWrap.innerHTML = `<div class="actuals-empty">Nenhuma linha de DRE disponivel para ${year}.</div>`; return; }
        tableWrap.innerHTML = buildDreSocRealTableMarkup(report, null, null, sourceLabelFor(detailPanel));
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
      // Mesmo motivo do DFs Real (ver renderDreDfsReal): tabela curta, a
      // barra própria do card já basta — sem a flutuante duplicada.

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
        const gerReport = buildDreGerRealReport(year, rows);
        const report = buildDreDfsRealReport(year, rows, gerReport);
        if (!report.lines.length) { tableWrap.innerHTML = `<div class="actuals-empty">Nenhum dado disponivel para ${year}.</div>`; return; }
        tableWrap.innerHTML = buildDreDfsRealTableMarkup(report, null, null, sourceLabelFor(detailPanel));
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
