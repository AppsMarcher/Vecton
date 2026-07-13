(function attachVectonShellEventsModule(window) {
  function createShellEventsModule(deps) {
    const {
      appLayout,
      sidebar,
      profileTrigger,
      paramsToggle,
      paramsSubmenu,
      comercialModules,
      menuButtons,
      submenuButtons,
      periodTrigger,
      periodPopover,
      closePeriodPicker,
      openProfileDialog,
      renderNavigation,
      renderReportsView,
      renderPeriodPicker,
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
      getSelectedHeadcountBatchId,
      getState,
      getPeriodPickerYear,
      setPeriodPickerYear,
      getActiveView,
      setActiveView,
      setSelectedReportId,
      setSelectedBudgetLoadType,
      setSelectedActualsLoadType,
      loadAndRenderUsers,
      loadAndRenderManagements,
      bindManagementsAddButton,
      renderPlanningView,
      resetPlanningState,
      getPlanningContainer,
    } = deps;

    function bindShellEvents() {
      profileTrigger.addEventListener("click", () => {
        closePeriodPicker();
        openProfileDialog();
      });

      // Logo do Vecton (sidebar + header quando a sidebar está oculta) leva pra Home
      // reaproveitando o botão de menu "dashboard" (roda toda a lógica de navegação).
      const goHome = () => {
        const dashboardButton = document.querySelector('.menu-button[data-view="dashboard"]');
        if (dashboardButton) dashboardButton.click();
      };
      document.querySelectorAll(".brand-logo-sidebar, .header-brand-logo").forEach((logo) => {
        logo.classList.add("brand-logo-home");
        logo.setAttribute("role", "button");
        logo.setAttribute("tabindex", "0");
        logo.setAttribute("title", "Ir para a Home");
        logo.addEventListener("click", goHome);
        logo.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            goHome();
          }
        });
      });

      paramsToggle.addEventListener("click", () => {
        const isOpen = paramsSubmenu.classList.toggle("open");
        paramsToggle.setAttribute("aria-expanded", String(isOpen));
      });


      menuButtons.forEach((button) => {
        button.addEventListener("click", () => {
          if (!button.dataset.view) {
            return;
          }
          closePeriodPicker();
          if (button.dataset.view === "reports") {
            setSelectedReportId(null);
          }
          if (button.dataset.view === "budgetLoad") {
            setSelectedBudgetLoadType(null);
          }
          if (button.dataset.view !== "planning") {
            resetPlanningState();
          }
          setActiveView(button.dataset.view);
          renderNavigation();
          if (getActiveView() === "reports") {
            renderReportsView();
          }
          if (getActiveView() === "planning") {
            renderPlanningView(getPlanningContainer());
          }
        });
      });

      submenuButtons.forEach((button) => {
        button.addEventListener("click", async (event) => {
          closePeriodPicker();
          if (!button.dataset.view) return;

          if (button.dataset.view === "actualsLoad") {
            event.preventDefault();
            setSelectedActualsLoadType(null);
            setActiveView("actualsLoad");
            renderNavigation();
            ensureActualsViewShell();
            renderActualsCatalog();
            await ensureActualsBatchRowsLoaded(getSelectedActualsBatchId());
            renderActualsView();
            return;
          }

          if (button.dataset.view === "budgetLoad") {
            event.preventDefault();
            setSelectedBudgetLoadType(null);
            setActiveView("budgetLoad");
            renderNavigation();
            ensureBudgetViewShell();
            renderBudgetCatalog();
            await ensureBudgetBatchRowsLoaded(getSelectedBudgetBatchId());
            renderBudgetView();
            return;
          }

          setActiveView(button.dataset.view);
          renderNavigation();
          if (getActiveView() === "users") {
            loadAndRenderUsers();
            return;
          }
          if (getActiveView() === "managements") {
            loadAndRenderManagements();
            bindManagementsAddButton();
            return;
          }
          if (comercialModules && comercialModules[getActiveView()]) {
            const mod = comercialModules[getActiveView()];
            mod.loadAndRender();
            mod.bindAddButton();
            return;
          }
          if (getActiveView() === "headcountLoad") {
            ensureHeadcountViewShell();
            renderHeadcountCatalog();
            await ensureHeadcountBatchRowsLoaded(getSelectedHeadcountBatchId());
            renderHeadcountView();
          }
        });
      });

      const reportsCardGrid = document.querySelector("#reports-card-grid");
      const reportsView = document.querySelector("#reports-view");

      reportsCardGrid?.addEventListener("click", (event) => {
        if (event.target.closest(".rrc-edit-btn") || event.target.closest(".rrc-edit-popover")) return;
        const card = event.target.closest("[data-report-id]");
        if (!card) return;
        setSelectedReportId(card.dataset.reportId || null);
        renderReportsView();
      });

      reportsView?.addEventListener("click", (event) => {
        const backButton = event.target.closest("[data-back-to-reports]");
        if (!backButton) {
          return;
        }
        setSelectedReportId(null);
        renderReportsView();
      });

      document.querySelector("#sidebar-toggle").addEventListener("click", () => {
        closePeriodPicker();
        sidebar.classList.toggle("collapsed");
        appLayout.classList.toggle("sidebar-collapsed");
      });

      periodTrigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const isHidden = periodPopover.hasAttribute("hidden");
        if (isHidden) {
          setPeriodPickerYear(getState().currentPeriod?.year || 2026);
          renderPeriodPicker();
          periodPopover.removeAttribute("hidden");
          periodTrigger.setAttribute("aria-expanded", "true");
        } else {
          closePeriodPicker();
        }
      });

      document.querySelector("#period-prev-year").addEventListener("click", () => {
        setPeriodPickerYear(getPeriodPickerYear() - 1);
        renderPeriodPicker();
      });

      document.querySelector("#period-next-year").addEventListener("click", () => {
        setPeriodPickerYear(getPeriodPickerYear() + 1);
        renderPeriodPicker();
      });

      document.addEventListener("click", (event) => {
        if (periodPopover.hasAttribute("hidden")) {
          return;
        }
        if (!periodPopover.contains(event.target) && !periodTrigger.contains(event.target)) {
          closePeriodPicker();
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closePeriodPicker();
        }
      });
    }

    return {
      bindShellEvents
    };
  }

  window.VECTON_SHELL_EVENTS = {
    createShellEventsModule
  };
})(window);
