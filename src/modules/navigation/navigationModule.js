(function attachVectonNavigationModule(window) {
  function createNavigationModule(deps) {
    const {
      VIEW_HEADER_METADATA,
      MONTH_LABELS,
      menuButtons,
      submenuButtons,
      paramsToggle,
      views,
      periodTriggerLabel,
      periodYearLabel,
      periodMonthGrid,
      periodPopover,
      periodTrigger,
      getActiveView,
      getSelectedReportId,
      getState,
      getPeriodPickerYear,
      setCurrentPeriod,
      ensureReportsDataForYear,
      ensureBudgetReportsDataForYear,
      ensureDashboardData,
      formatMonthLabel,
      persistAndRender,
      getOpexHideZeros,
      setOpexHideZeros,
      isAdmin,
      canAccessDashboard,
      canAccessPlanning,
      canManageUsers
    } = deps;

    function renderNavigation() {
      const activeView = getActiveView();
      const selectedReportId = getSelectedReportId();
      const state = getState();

      menuButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.view === activeView);
      });
      submenuButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.view === activeView);
      });
      const paramsViews = [
        "branchPlan", "drePlan", "managements", "ccPlan", "actualsLoad", "budgetLoad", "headcountLoad", "users", "accessProfiles",
        "comProdutos", "comClientes", "comTerritorios", "comCoordenacoes", "comTipos", "comCulturas", "comLinhasNegocio", "comAtribuicao",
        "comercialVendas", "comercialPlanejado"
      ];
      paramsToggle.classList.toggle("active", paramsViews.includes(activeView));

      Object.entries(views).forEach(([key, node]) => {
        if (node) node.classList.toggle("active", key === activeView);
      });

      // restrições de menu por perfil de acesso.
      // Usa style.display (não o atributo `hidden`): essas classes têm
      // display: grid/flex no CSS, que sobrescreve o [hidden] do user-agent.
      const dashBtn = document.querySelector(".menu-button[data-view='dashboard']");
      if (dashBtn) dashBtn.style.display = canAccessDashboard() ? "" : "none";

      const planBtn = document.querySelector(".menu-button[data-view='planning']");
      if (planBtn) planBtn.style.display = canAccessPlanning() ? "" : "none";

      const menuStack = document.querySelector(".menu-stack");
      if (menuStack) menuStack.style.display = isAdmin() ? "" : "none";

      const usersBtn = document.querySelector(".submenu-button[data-view='users']");
      const profilesBtn = document.querySelector(".submenu-button[data-view='accessProfiles']");
      const canUsers = canManageUsers();
      if (usersBtn)    usersBtn.style.display    = canUsers ? "" : "none";
      if (profilesBtn) profilesBtn.style.display = canUsers ? "" : "none";

      document.querySelector("#view-kicker").textContent = VIEW_HEADER_METADATA[activeView].kicker;
      document.querySelector("#view-title").textContent = VIEW_HEADER_METADATA[activeView].title;

      const ticker = document.querySelector("#market-ticker");
      if (ticker) ticker.hidden = activeView !== "dashboard";

      // O slot de filtro (Gestão + Ocultar zeros) só pode aparecer DENTRO da view
      // de relatórios, e só para os relatórios por CC. Em qualquer outra view
      // (dashboard, etc.) ele é escondido e limpo — antes ele vazava pro cockpit
      // porque dependia só de selectedReportId, que não é resetado ao navegar.
      const opexSlot = document.querySelector("#opex-gestao-slot");
      const isOpexSlotView = activeView === "reports" &&
        ["opexReal", "opexBudget", "headcountReal", "headcountBudget"].includes(selectedReportId);
      if (opexSlot && !isOpexSlotView) {
        opexSlot.hidden = true;
        opexSlot.innerHTML = "";
        if (getOpexHideZeros()) {
          setOpexHideZeros(false);
        }
      }

      if (activeView === "reports") {
        void ensureReportsDataForYear(Number(state.currentPeriod?.year || 2026));
        void ensureBudgetReportsDataForYear(Number(state.currentPeriod?.year || 2026));
      }
      if (activeView === "dashboard") {
        void ensureDashboardData();
      }
    }

    function renderPeriodSummary() {
      const state = getState();
      const month = Number(state.currentPeriod?.month || 6);
      const year = Number(state.currentPeriod?.year || 2026);
      if (periodTriggerLabel) {
        periodTriggerLabel.textContent = `${formatMonthLabel(month)}/${year}`;
      }
      if (periodYearLabel) {
        periodYearLabel.textContent = String(getPeriodPickerYear());
      }
    }

    function renderPeriodPicker() {
      if (!periodYearLabel || !periodMonthGrid) {
        return;
      }

      const state = getState();
      const pickerYear = getPeriodPickerYear();
      periodYearLabel.textContent = String(pickerYear);
      periodMonthGrid.innerHTML = "";

      MONTH_LABELS.forEach((label, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "period-month-button";
        button.textContent = label;
        const monthNumber = index + 1;
        if (
          Number(state.currentPeriod?.year) === pickerYear &&
          Number(state.currentPeriod?.month) === monthNumber
        ) {
          button.classList.add("active");
        }
        button.addEventListener("click", () => {
          setCurrentPeriod({
            year: pickerYear,
            month: monthNumber
          });
          persistAndRender();
          closePeriodPicker();
        });
        periodMonthGrid.append(button);
      });
    }

    function closePeriodPicker() {
      if (!periodPopover || !periodTrigger) {
        return;
      }
      periodPopover.setAttribute("hidden", "");
      periodTrigger.setAttribute("aria-expanded", "false");
    }

    return {
      renderNavigation,
      renderPeriodSummary,
      renderPeriodPicker,
      closePeriodPicker
    };
  }

  window.VECTON_NAVIGATION = {
    createNavigationModule
  };
})(window);
