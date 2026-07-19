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
      reportsBudgetCache,
      getOpexStructure,
      buildOpexCostCenterFilter,
      buildOpexCcIdsFilter,
      matchesOpexCostCenterFilter,
      buildOpexRealTableMarkup,
      initOpexDrilldown,
      initAllReportTableResizers,
      initFloatingScrollbar,
      fetchActualsLedgerWithCcForYear,
      fetchActualsLedgerForManagementYear,
      fetchActualsLedgerForCcIds,
      fetchBudgetLedgerForManagementYear,
      fetchBudgetLedgerForCcIds,
      renderReportsView,
      renderOpexBudgetReport,
      resolveManagementFilter,
      getPartialManagements,
      fetchScenariosForYear,
      fetchScenarioLedgerForYear
    } = deps;

    // Fonte comparativa do OPEX Real (Mes/Acumulado x Real/Cenario/Var) — mesma
    // dinamica dos DRE Real (reportsDreModule.js). null = ainda nao resolvida ->
    // assume o cenario favorito da org (is_default), ou Budget se nao houver.
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
      if (wrap) initFloatingScrollbar(wrap);
      return true;
    }

    function friendlyError(e, fallback) {
      return window.vpFriendlyError ? window.vpFriendlyError(e, fallback) : fallback;
    }

    async function populateOpexCompareSel(detailPanel, year) {
      const sel = detailPanel.querySelector("#opex-real-cmp-sel");
      if (!sel) return;
      try {
        const scenarios = await fetchScenariosForYear(year);
        scenarios.forEach((s) => {
          const opt = document.createElement("option");
          opt.value = `scenario:${s.id}`;
          opt.textContent = s.name;
          sel.appendChild(opt);
        });
        if (_compareSource === null) {
          const fav = scenarios.find((s) => s.is_default);
          _compareSource = fav ? `scenario:${fav.id}` : "budget";
        }
      } catch (_) { /* sem cenarios: segue so com Budget */ }
      if (!_compareSource || ![...sel.options].some((o) => o.value === _compareSource)) {
        _compareSource = "budget";
      }
      sel.value = _compareSource;
    }

    function compareLabelFor(detailPanel) {
      const sel = detailPanel.querySelector("#opex-real-cmp-sel");
      return sel?.selectedOptions?.[0]?.textContent || "Cenário";
    }

    // Linhas do comparativo: Budget (rows CC-aware, filtro aplicado no fetch pra
    // gestao especifica) ou Cenario (rows org-wide sem filtro de CC — filtradas
    // depois em buildOpexRealTableMarkup via compareValidCcFilter).
    async function fetchOpexCompareRows(year, source, ctx) {
      if (!source || source === "budget") {
        if (ctx.selectedMgmt === ctx.allOption) return reportsBudgetCache.get(year)?.rows || [];
        return ctx.isPartial
          ? fetchBudgetLedgerForCcIds(year, ctx.partialCcIds)
          : fetchBudgetLedgerForManagementYear(year, ctx.selectedMgmt);
      }
      const scenarioId = source.slice("scenario:".length);
      return fetchScenarioLedgerForYear(scenarioId, year);
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
      const { selectedMgmt, locked: mgmtLocked, allowedMgmts, partialMgmts } = resolveManagementFilter(prevMgmt, baseMgmtOptions, allOption);
      const mgmtOptions = mgmtLocked ? [selectedMgmt] : (allowedMgmts ? [...allowedMgmts] : baseMgmtOptions);
      const validCcFilter = buildOpexCostCenterFilter(selectedMgmt);
      const isPartial = partialMgmts?.has(selectedMgmt);
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

      renderHeaderSlot({
        detailPanel,
        year,
        allOption,
        selectedMgmt,
        mgmtOptions,
        locked: mgmtLocked,
        partialMgmts
      });

      detailPanel.classList.add("dre-cmp-shell");
      detailPanel.innerHTML = `
        <div class="vp-source-bar dre-cmp-bar">
          <span class="vp-source-label">Comparar com</span>
          <select class="vp-source-sel" id="opex-real-cmp-sel"><option value="budget">Budget</option></select>
        </div>
        <div class="opex-report-wrap reports-table-wrap"><div id="opex-table-inner">${window.vpSkeletonTable()}</div></div>
      `;
      const tableInner = detailPanel.querySelector("#opex-table-inner");

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

      // Renderiza o real primeiro (rapido, sem esperar rede) — o comparativo
      // chega depois e faz upgrade in-place das colunas extras (igual ao DRE).
      function renderTable(rows, validCcFilterForRows) {
        tableInner.innerHTML = buildOpexRealTableMarkup(rows, validCcFilterForRows, getOpexHideZeros());
        initAllReportTableResizers();
        attachDrilldown(tableInner.querySelector(".reports-opex-table"), rows);
        loadCompare(rows, validCcFilterForRows);
      }

      async function loadCompare(rows, validCcFilterForRows) {
        const src = _compareSource;
        try {
          const compareRows = await fetchOpexCompareRows(year, src, { selectedMgmt, allOption, isPartial, partialCcIds });
          if (!tableInner.isConnected || src !== _compareSource) return; // stale: fonte trocou ou saiu do relatorio
          const compareValidCcFilter = (selectedMgmt !== allOption && src !== "budget")
            ? (isPartial ? buildOpexCcIdsFilter(partialCcIds) : buildOpexCostCenterFilter(selectedMgmt))
            : null;
          tableInner.innerHTML = buildOpexRealTableMarkup(rows, validCcFilterForRows, getOpexHideZeros(), compareRows, compareValidCcFilter, month, compareLabelFor(detailPanel));
          initAllReportTableResizers();
          attachDrilldown(tableInner.querySelector(".reports-opex-table"), rows);
        } catch (e) {
          console.warn("opex real comparativo:", e);
          if (tableInner.isConnected && src === _compareSource) {
            tableInner.insertAdjacentHTML("afterbegin", `<div class="actuals-empty">${escapeHtml(friendlyError(e, "Não foi possível carregar o comparativo."))}</div>`);
          }
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

    function renderHeaderSlot({ detailPanel, year, allOption, selectedMgmt, mgmtOptions, locked = false, partialMgmts }) {
      const opexSlot = document.querySelector("#opex-gestao-slot");
      if (!opexSlot) return;

      opexSlot.hidden = false;
      opexSlot.innerHTML = `
        <div class="opex-header-filter" style="display:flex;align-items:center;gap:10px">
          <select class="opex-filter-select" id="opex-mgmt-select-header" ${locked ? "disabled" : ""}>
            ${mgmtOptions.map((management) => {
              const label = partialMgmts?.has(management) ? `${management} · parcial` : management;
              return `<option value="${escapeHtml(management)}" ${management === selectedMgmt ? "selected" : ""} ${locked && management !== selectedMgmt ? "disabled" : ""}>${escapeHtml(label)}</option>`;
            }).join("")}
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
      renderSelectedOpexReport,
      resetCompareSource
    };
  }

  window.VECTON_REPORTS_OPEX = {
    createReportsOpexModule
  };
})(window);
