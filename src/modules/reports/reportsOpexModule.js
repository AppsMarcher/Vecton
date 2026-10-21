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
      buildOpexCcIdsFilter,
      matchesOpexCostCenterFilter,
      buildOpexRealTableMarkup,
      initOpexDrilldown,
      initAllReportTableResizers,
      initFloatingScrollbar,
      initVerticalScrollBounds,
      fetchActualsLedgerWithCcForYear,
      fetchActualsLedgerForManagementYear,
      fetchActualsLedgerForCcIds,
      renderReportsView,
      renderOpexBudgetReport,
      resolveManagementFilter,
      getPartialManagements,
      fetchAllScenarios,
      fetchRealYears,
      rowsForSource,
      resolveSourceRef,
      fetchScenarioLedgerForYear,
      fetchScenarioReportRowsForYear
    } = deps;

    // Fonte comparativa do OPEX Real (Mes/Acumulado x Real/Cenario/Var) — mesma
    // dinamica dos DRE Real (reportsDreModule.js). null = ainda nao resolvida ->
    // assume a estrela global, ou "Budget {ano}" se nao houver (valores: "real:{ano}" | "scenario:{id}").
    let _compareSource = null;

    function renderSelectedOpexReport(detailPanel, selectedReportId) {
      if (selectedReportId === "opexBudget") {
        detailPanel.classList.remove("dre-cmp-shell");
        renderOpexBudgetReport(detailPanel);
      } else if (selectedReportId === "opexReal") {
        renderOpexRealReport(detailPanel);
      } else {
        return false;
      }
      const wrap = detailPanel.querySelector(".reports-table-wrap");
      if (wrap) { initFloatingScrollbar(wrap); initVerticalScrollBounds(wrap); }
      return true;
    }

    function friendlyError(e, fallback) {
      return window.vpFriendlyError ? window.vpFriendlyError(e, fallback) : fallback;
    }

    async function populateOpexCompareSel(detailPanel, year) {
      const sel = detailPanel.querySelector("#opex-real-cmp-sel");
      if (!sel) return;
      let scenarios = [];
      let realYears = [];
      try {
        [scenarios, realYears] = await Promise.all([fetchAllScenarios(), fetchRealYears()]);
      } catch (_) { /* sem fontes: select fica vazio */ }
      const { options, value } = window.VECTON_SCENARIO_SOURCES.chooseSource({
        scenarios, realYears, current: _compareSource, toggleYear: year
      });
      _compareSource = value;
      sel.innerHTML = options.length
        ? options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("")
        : `<option value="">Nenhuma fonte disponível</option>`;
      if (value) sel.value = value;
    }

    function compareLabelFor(detailPanel) {
      const sel = detailPanel.querySelector("#opex-real-cmp-sel");
      return sel?.selectedOptions?.[0]?.textContent || "Cenário";
    }

    // Linhas do comparativo, lidas no ano da PRÓPRIA fonte (cenário ou Real de outro
    // ano), não no do toggle. Consolidado (Marcher, sem recorte de CC) usa o resumo
    // conta×mes (cenario: forecast_monthly_account_totals; Real: actuals_monthly_...)
    // — o ledger completo so e necessario quando ha filtro por gestao/CC.
    async function fetchOpexCompareRows(year, source, ctx) {
      const ref = await resolveSourceRef(source, year);
      if (!ref) return [];
      if (ref.kind === "scenario") {
        if (ctx.selectedMgmt === ctx.allOption) return fetchScenarioReportRowsForYear(ref.id, ref.year);
        return fetchScenarioLedgerForYear(ref.id, ref.year);
      }
      if (ctx.selectedMgmt === ctx.allOption) return rowsForSource(source, year);
      return ctx.isPartial
        ? fetchActualsLedgerForCcIds(ref.year, ctx.partialCcIds)
        : fetchActualsLedgerForManagementYear(ref.year, ctx.selectedMgmt);
    }

    function renderOpexRealReport(detailPanel) {
      const year = Number(state.currentPeriod?.year || 2026);
      const month = Number(state.currentPeriod?.month || 1);
      const managements = [...new Set(
        state.costCenters
          .map((cc) => (cc.management || "").trim())
          .filter(Boolean)
      )].sort();
      const allOption = "Marcher";
      const baseMgmtOptions = [allOption, ...managements];
      const prevMgmt = detailPanel.dataset.opexMgmt || allOption;
      // "Marcher" (consolidado) só para admin/super_admin ou perfis sem restrição.
      // Gestor/Analista com gestões extras vê só as gestões permitidas — sem "Marcher",
      // pois o OPEX não exibe dados consolidados para perfis restritos.
      const resolved = resolveManagementFilter(prevMgmt, baseMgmtOptions, allOption);
      const { locked: mgmtLocked, allowedMgmts } = resolved;
      const mgmtOptions = mgmtLocked ? [resolved.selectedMgmt] : (allowedMgmts ? [...allowedMgmts] : baseMgmtOptions);
      // Seletor de gestão + CCs (multi-seleção): uma lista de CCs escolhida vira uma "gestão parcial".
      const picker = window.VECTON_OPEX_CC_PICKER;
      const ccTree = picker.buildTree(state.costCenters, mgmtOptions, resolved.partialMgmts, allOption);
      const { selectedMgmt, partialMgmts, customIds } = picker.applyCustom(resolved, picker.readCustom(detailPanel), ccTree);
      const isPartial = partialMgmts?.has(selectedMgmt);
      const validCcFilter = isPartial ? buildOpexCcIdsFilter(partialMgmts.get(selectedMgmt)) : buildOpexCostCenterFilter(selectedMgmt);
      const partialCcIds = isPartial ? partialMgmts.get(selectedMgmt) : null;
      const ccCacheKey = `opex-cc-${year}`;
      let ccFetchPromise = null;

      if (selectedMgmt !== allOption) {
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

      detailPanel.classList.add("dre-cmp-shell");
      detailPanel.innerHTML = `
        <div class="vp-source-bar dre-cmp-bar">
          <div id="opex-bar-filter-slot"></div>
          <span class="vp-source-label">Comparar com</span>
          <select class="vp-source-sel" id="opex-real-cmp-sel"><option value="">Carregando…</option></select>
          ${window.vpExportIconButtonHtml("data-opex-export")}
        </div>
        <div class="opex-report-wrap reports-table-wrap"><div id="opex-table-inner">${window.vpSkeletonTable()}</div></div>
      `;
      const tableInner = detailPanel.querySelector("#opex-table-inner");
      detailPanel.querySelector("[data-opex-export]").addEventListener("click", () => {
        const mgmt = detailPanel.querySelector("[data-opex-mgmt-label]")?.textContent?.trim() || "";
        window.vpExportTableToExcel(detailPanel.querySelector(".reports-opex-table"), "OPEX Real", [mgmt]);
      });

      renderHeaderSlot({
        detailPanel,
        year,
        allOption,
        selectedMgmt,
        ccTree,
        canAll: mgmtOptions.includes(allOption),
        customIds,
        partialMgmts
      });

      populateOpexCompareSel(detailPanel, year).then(() => {
        const sel = detailPanel.querySelector("#opex-real-cmp-sel");
        if (sel) sel.addEventListener("change", () => { _compareSource = sel.value; paintReal(); });
        paintReal();
      });

      // Anexa o drilldown (mesma logica de sempre: Marcher usa fetch CC sob
      // demanda com cache/promise compartilhada; gestao especifica usa as
      // proprias rows, ja vieram com CC do fetch por gestao).
      function attachDrilldown(tableEl, rows) {
        if (!tableEl) return;
        if (selectedMgmt === allOption) {
          const cachedCc = reportsLedgerCache.get(ccCacheKey);
          if (cachedCc) { initOpexDrilldown(tableEl, cachedCc.rows, null); return; }
          if (!ccFetchPromise) {
            ccFetchPromise = fetchActualsLedgerWithCcForYear(year)
              .then((rowsWithCc) => { reportsLedgerCache.set(ccCacheKey, { rows: rowsWithCc }); return rowsWithCc; })
              .catch(() => []);
          }
          initOpexDrilldown(tableEl, null, null, ccFetchPromise);
        } else {
          initOpexDrilldown(tableEl, rows, null);
        }
      }

      // A tabela sai numa tacada so: espera o comparativo e renderiza real +
      // colunas Mes/Acumulado JUNTOS (o skeleton segura o lugar). Sem o
      // "upgrade" atrasado em 2 tempos — com o resumo conta×mes do cenario o
      // fetch e barato o suficiente pra aguardar antes de pintar.
      async function renderTable(rows, validCcFilterForRows) {
        const src = _compareSource;
        let compareRows = null;
        let compareError = null;
        try {
          compareRows = await fetchOpexCompareRows(year, src, { selectedMgmt, allOption, isPartial, partialCcIds });
        } catch (e) {
          console.warn("opex real comparativo:", e);
          compareError = e;
        }
        if (!tableInner.isConnected || src !== _compareSource) return; // stale: fonte trocou ou saiu do relatorio
        const compareValidCcFilter = (selectedMgmt !== allOption && window.VECTON_SCENARIO_SOURCES.parseSource(src)?.kind === "scenario")
          ? (isPartial ? buildOpexCcIdsFilter(partialCcIds) : buildOpexCostCenterFilter(selectedMgmt))
          : null;
        // compareRows null (falhou) -> tabela sem comparativo + aviso acima.
        tableInner.innerHTML = buildOpexRealTableMarkup(rows, validCcFilterForRows, getOpexHideZeros(), compareRows, compareValidCcFilter, month, compareLabelFor(detailPanel));
        initAllReportTableResizers();
        attachDrilldown(tableInner.querySelector(".reports-opex-table"), rows);
        if (compareError) {
          tableInner.insertAdjacentHTML("afterbegin", `<div class="actuals-empty">${escapeHtml(friendlyError(compareError, "Não foi possível carregar o comparativo."))}</div>`);
        }
      }

      function paintReal() {
        if (selectedMgmt === allOption) {
          const cacheEntry = reportsLedgerCache.get(year);
          renderTable(cacheEntry?.rows || [], null);
        } else {
          const mgmtCacheKey = isPartial
            ? `opex-partial-${year}-${[...partialCcIds].sort().join(",")}`
            : `opex-mgmt-${year}-${selectedMgmt}`;
          const cached = reportsLedgerCache.get(mgmtCacheKey);
          if (cached) {
            renderTable(cached.rows, null);
          } else {
            detailPanel.dataset.opexMgmt = selectedMgmt;
            tableInner.innerHTML = window.vpSkeletonTable();
            const fetchPromise = isPartial
              ? fetchActualsLedgerForCcIds(year, partialCcIds)
              : fetchActualsLedgerForManagementYear(year, selectedMgmt);
            fetchPromise.then((rows) => {
              reportsLedgerCache.set(mgmtCacheKey, { rows });
              if (getSelectedReportId() === "opexReal" && detailPanel.dataset.opexMgmt === selectedMgmt) {
                renderReportsView();
              }
            }).catch(() => {
              if (getSelectedReportId() === "opexReal") {
                tableInner.innerHTML = `<div class="actuals-empty">Erro ao carregar dados com CC.</div>`;
              }
            });
          }
        }
      }
    }

    // Chamado quando o favorito da org muda (estrela no Planejamento): o
    // proximo render do OPEX Real re-resolve o default do "Comparar com".
    function resetCompareSource() {
      _compareSource = null;
    }

    function renderHeaderSlot({ detailPanel, year, allOption, selectedMgmt, ccTree, canAll, customIds, partialMgmts }) {
      // Gestão + Ocultar zeros ficam na barra "Comparar com" do painel (à
      // esquerda dela), não mais no cabeçalho — o slot do header (compartilhado
      // com Headcount) é escondido aqui.
      const headerSlot = document.querySelector("#opex-gestao-slot");
      if (headerSlot) {
        headerSlot.hidden = true;
        headerSlot.innerHTML = "";
      }
      const opexSlot = detailPanel.querySelector("#opex-bar-filter-slot");
      if (!opexSlot) return;

      opexSlot.innerHTML = `
        <div class="opex-header-filter" style="display:flex;align-items:center;gap:10px">
          <div class="opex-cc-slot"></div>
          <button id="opex-hide-zeros-btn" type="button" style="
            height:32px;padding:0 12px;border-radius:8px;font-size:0.74rem;font-weight:500;
            border:1px solid ${getOpexHideZeros() ? "var(--blue)" : "var(--line)"};
            background:${getOpexHideZeros() ? "var(--blue-soft)" : "transparent"};
            color:${getOpexHideZeros() ? "var(--blue)" : "var(--text-faint)"};
            cursor:pointer;white-space:nowrap;transition:all .15s
          ">Ocultar zeros</button>
        </div>
      `;

      const picker = window.VECTON_OPEX_CC_PICKER;
      picker.mount(opexSlot.querySelector(".opex-cc-slot"), {
        tree: ccTree,
        canAll,
        allOption,
        selectedMgmt,
        customIds,
        partial: !customIds && partialMgmts?.has(selectedMgmt),
        onApply: ({ mgmt, customIds: ids }) => {
          detailPanel.dataset.opexMgmt = mgmt;
          picker.writeCustom(detailPanel, ids);
          if (!ids && mgmt !== allOption) reportsLedgerCache.delete(`opex-mgmt-${year}-${mgmt}`);
          renderReportsView();
        }
      });

      const hideZerosBtn = opexSlot.querySelector("#opex-hide-zeros-btn");
      if (hideZerosBtn) {
        hideZerosBtn.addEventListener("click", () => {
          setOpexHideZeros(!getOpexHideZeros());
          renderReportsView();
        });
      }
    }

    return {
      renderSelectedOpexReport,
      resetCompareSource
    };
  }

  window.VECTON_REPORTS_OPEX = {
    createReportsOpexModule
  };
})(window);
