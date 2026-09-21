(function attachVectonHeaderModule(window) {
  function createHeaderModule(deps) {
    const {
      escapeHtml,
      closePeriodPicker,
      formatMonthLabel,
      ensureActualsViewShell,
      renderActualsCatalog,
      ensureActualsBatchRowsLoaded,
      getSelectedActualsBatchId,
      renderActualsView,
      ensureBudgetViewShell,
      renderBudgetCatalog,
      ensureBudgetBatchRowsLoaded,
      getSelectedBudgetBatchId,
      renderBudgetView,
      ensureHeadcountViewShell,
      renderHeadcountCatalog,
      ensureHeadcountBatchRowsLoaded,
      renderHeadcountView,
      renderNavigation,
      getRenderDashboard,
      renderReportsView,
      renderBranchTree,
      renderBranchEditor,
      renderDreTree,
      renderDreEditor,
      renderCcTree,
      renderCcEditor,
      getCurrentPeriodHcBatches,
      getState,
      getActiveView,
      setActiveView,
      getSelectedReportId,
      setSelectedReportId,
      setSelectedActualsLoadType,
      setSelectedBudgetLoadType,
      setSelectedDreCode,
      addExpandedDreCode,
      setSelectedCcCode,
      addExpandedCcCode,
      getSelectedHeadcountLoadType,
      setSelectedHeadcountLoadType,
      setHeadcountReturnView,
      setSelectedHeadcountBatchId
    } = deps;

    function configureMainHeader() {
      const header = document.querySelector(".main-header");
      const headerActions = header?.querySelector(".header-actions");
      const searchWrap = header?.querySelector(".header-search-wrap");
      const search = searchWrap?.querySelector(".header-search");
      const searchKey = search?.querySelector(".header-search-key");
      const searchIcon = search?.querySelector(".header-search-icon");
      const periodPicker = header?.querySelector(".period-picker");
      const companySelect = header?.querySelector(".header-select:not(.header-select-small)");
      const prevYearButton = document.querySelector("#period-prev-year");
      const nextYearButton = document.querySelector("#period-next-year");

      if (!header || !headerActions || !searchWrap || !periodPicker || !search) {
        return;
      }

      search.classList.add("header-search-compact");
      searchKey?.remove();
      if (searchIcon) {
        searchIcon.innerHTML = "&#8981;";
      }
      if (prevYearButton) {
        prevYearButton.innerHTML = "&#8249;";
      }
      if (nextYearButton) {
        nextYearButton.innerHTML = "&#8250;";
      }
      companySelect?.remove();

      if (header.dataset.layoutConfigured !== "true") {
        const opexSlot = document.querySelector("#opex-gestao-slot");
        headerActions.prepend(periodPicker);
        if (opexSlot) periodPicker.insertAdjacentElement("beforebegin", opexSlot);
        periodPicker.insertAdjacentElement("afterend", searchWrap);
        header.dataset.layoutConfigured = "true";
      }
    }

    function setupHeaderSearch() {
      const header = document.querySelector(".main-header");
      const searchWrap = header?.querySelector(".header-search-wrap");
      const search = searchWrap?.querySelector(".header-search");
      if (!searchWrap || !search) return;
      if (searchWrap.dataset.searchReady === "1") return;
      searchWrap.dataset.searchReady = "1";

      const input = search.querySelector("input");
      const searchIcon = search.querySelector(".header-search-icon");
      if (!input) return;

      searchWrap.querySelector(".search-dropdown")?.remove();
      const dropdown = document.createElement("div");
      dropdown.className = "search-dropdown";
      dropdown.hidden = true;
      searchWrap.style.position = "relative";
      searchWrap.appendChild(dropdown);

      let activeIdx = -1;
      let entries = [];

      function norm(value) {
        return String(value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();
      }

      async function openTarget(target) {
        if (!target?.view) return;

        closePeriodPicker();
        setActiveView(target.view);

        if (Object.prototype.hasOwnProperty.call(target, "reportId")) {
          setSelectedReportId(target.reportId);
        } else if (target.view !== "reports") {
          setSelectedReportId(null);
        }

        if (Object.prototype.hasOwnProperty.call(target, "actualsLoadType")) {
          setSelectedActualsLoadType(target.actualsLoadType);
        }
        if (Object.prototype.hasOwnProperty.call(target, "budgetLoadType")) {
          setSelectedBudgetLoadType(target.budgetLoadType);
        }

        if (target.dreCode) {
          setSelectedDreCode(target.dreCode);
          if (target.dreParentCode) addExpandedDreCode(target.dreParentCode);
        }
        if (target.ccCode) {
          setSelectedCcCode(target.ccCode);
          if (target.ccParentCode) addExpandedCcCode(target.ccParentCode);
        }

        renderNavigation();

        if (target.view === "dashboard") {
          getRenderDashboard()();
        } else if (target.view === "reports") {
          renderReportsView();
        } else if (target.view === "branchPlan") {
          renderBranchTree();
          renderBranchEditor();
        } else if (target.view === "drePlan") {
          renderDreTree();
          renderDreEditor();
        } else if (target.view === "ccPlan") {
          renderCcTree();
          renderCcEditor();
        } else if (target.view === "actualsLoad") {
          ensureActualsViewShell();
          renderActualsCatalog();
          await ensureActualsBatchRowsLoaded(getSelectedActualsBatchId());
          renderActualsView();
        } else if (target.view === "budgetLoad") {
          ensureBudgetViewShell();
          renderBudgetCatalog();
          await ensureBudgetBatchRowsLoaded(getSelectedBudgetBatchId());
          renderBudgetView();
        } else if (target.view === "headcountLoad") {
          setSelectedHeadcountLoadType(target.headcountLoadType || getSelectedHeadcountLoadType());
          setHeadcountReturnView(target.returnView || null);
          const matchingBatch = getCurrentPeriodHcBatches(target.headcountLoadType || getSelectedHeadcountLoadType())[0];
          setSelectedHeadcountBatchId(matchingBatch?.id || null);
          ensureHeadcountViewShell();
          renderHeadcountCatalog();
          await ensureHeadcountBatchRowsLoaded(matchingBatch?.id || null);
          renderHeadcountView();
        }

        input.value = "";
        dropdown.hidden = true;
        entries = [];
        activeIdx = -1;
      }

      const STATIC = [
        { label: "Fluxo de Caixa", sub: "Relatório gerencial", target: { view: "reports", reportId: "cashFlow" } },
        { label: "Dashboard", sub: "Cockpit Executivo", target: { view: "dashboard" } },
        { label: "Relatorios", sub: "Central de relatorios", target: { view: "reports", reportId: null } },
        { label: "DRE Societario Real", sub: "Relatorio", target: { view: "reports", reportId: "dreSocReal" } },
        { label: "DRE Gerencial Real", sub: "Relatorio", target: { view: "reports", reportId: "dreGerReal" } },
        { label: "DRE DFs Real", sub: "Relatorio", target: { view: "reports", reportId: "dreDfsReal" } },
        { label: "DRE Societario Budget", sub: "Relatorio", target: { view: "reports", reportId: "dreSocBudget" } },
        { label: "DRE Gerencial Budget", sub: "Relatorio", target: { view: "reports", reportId: "dreGerBudget" } },
        { label: "DRE DFs Budget", sub: "Relatorio", target: { view: "reports", reportId: "dreDfsBudget" } },
        { label: "OPEX Real", sub: "Relatorio", target: { view: "reports", reportId: "opexReal" } },
        { label: "Headcount Realizado", sub: "Relatorio", target: { view: "reports", reportId: "headcountReal" } },
        { label: "Headcount Planejado", sub: "Relatorio", target: { view: "reports", reportId: "headcountBudget" } },
        { label: "Empresas", sub: "Parametros", target: { view: "branchPlan" } },
        { label: "Plano de Contas DRE", sub: "Parametros", target: { view: "drePlan" } },
        { label: "Plano de Contas FC", sub: "Parametros", target: { view: "fcPlan" } },
        { label: "Centro de Custos", sub: "Parametros", target: { view: "ccPlan" } },
        { label: "Carga de Realizado", sub: "Parametros", target: { view: "actualsLoad", actualsLoadType: null } },
        { label: "Headcount Realizado", sub: "Carga de Realizado item 5", target: { view: "headcountLoad", headcountLoadType: "realizado", returnView: "actualsLoad" } },
        { label: "Carga de Planejado", sub: "Parametros", target: { view: "budgetLoad", budgetLoadType: null } },
        { label: "Headcount Planejado", sub: "Carga de Planejado item 5", target: { view: "headcountLoad", headcountLoadType: "orcado", returnView: "budgetLoad" } }
      ];

      function buildDynamic(query) {
        const state = getState();
        const dynamicEntries = [];

        state.dreNodes.forEach((node) => {
          if (norm(node.code).includes(query) || norm(node.name).includes(query)) {
            dynamicEntries.push({
              label: node.name,
              sub: `Conta ${node.code} - ${node.class}`,
              target: { view: "drePlan", dreCode: node.code, dreParentCode: node.parentCode }
            });
          }
        });

        state.ccNodes.forEach((node) => {
          if (norm(node.code).includes(query) || norm(node.name).includes(query)) {
            dynamicEntries.push({
              label: node.name,
              sub: `CC ${node.code} - ${node.class}`,
              target: { view: "ccPlan", ccCode: node.code, ccParentCode: node.parentCode }
            });
          }
        });

        return dynamicEntries;
      }

      function getEntries(value) {
        const query = norm(value);
        if (!query) return [];
        const staticMatches = STATIC.filter((entry) => norm(entry.label).includes(query) || norm(entry.sub).includes(query));
        return [...staticMatches, ...buildDynamic(query)].slice(0, 8);
      }

      function renderDropdown(list) {
        entries = list;
        activeIdx = -1;

        if (!list.length) {
          dropdown.innerHTML = "";
          dropdown.hidden = true;
          return;
        }

        dropdown.innerHTML = list.map((entry, index) => `
          <button class="search-result-item" type="button" data-idx="${index}">
            <span class="search-result-label">${escapeHtml(entry.label)}</span>
            <span class="search-result-sub">${escapeHtml(entry.sub)}</span>
          </button>`).join("");

        dropdown.querySelectorAll(".search-result-item").forEach((element) => {
          element.addEventListener("click", () => {
            const entry = entries[Number(element.dataset.idx)];
            if (entry) void openTarget(entry.target);
          });
        });

        dropdown.hidden = false;
      }

      function refresh() {
        renderDropdown(getEntries(input.value));
      }

      input.addEventListener("input", refresh);
      input.addEventListener("focus", refresh);

      input.addEventListener("keydown", (event) => {
        const items = dropdown.querySelectorAll(".search-result-item");

        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (!entries.length) {
            refresh();
            return;
          }
          activeIdx = Math.min(activeIdx + 1, entries.length - 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          if (!entries.length) return;
          activeIdx = Math.max(activeIdx - 1, 0);
        } else if (event.key === "Enter") {
          event.preventDefault();
          const list = entries.length ? entries : getEntries(input.value);
          const entry = list[activeIdx >= 0 ? activeIdx : 0];
          if (entry) void openTarget(entry.target);
          return;
        } else if (event.key === "Escape") {
          dropdown.hidden = true;
          activeIdx = -1;
          input.blur();
          return;
        } else {
          return;
        }

        items.forEach((element, index) => element.classList.toggle("active", index === activeIdx));
        items[activeIdx]?.scrollIntoView({ block: "nearest" });
      });

      searchIcon?.addEventListener("click", () => {
        const foundEntries = getEntries(input.value);
        if (foundEntries.length) {
          void openTarget(foundEntries[0].target);
        } else {
          input.focus();
          refresh();
        }
      });

      const onDocClick = (event) => {
        if (!searchWrap.contains(event.target)) {
          dropdown.hidden = true;
          activeIdx = -1;
        }
      };
      document.addEventListener("click", onDocClick);

      const onDocKey = (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          input.focus();
          input.select();
          refresh();
        }
      };
      document.addEventListener("keydown", onDocKey);
    }

    return {
      configureMainHeader,
      setupHeaderSearch
    };
  }

  window.VECTON_HEADER = {
    createHeaderModule
  };
})(window);
