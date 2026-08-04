(function attachVectonRenderModule(window) {
  function createRenderModule(deps) {
    const {
      getActiveView,
      renderUserProfile,
      renderStats,
      renderNavigation,
      renderPeriodSummary,
      renderProfileEditor,
      renderReportsView,
      renderBranchTree,
      renderBranchEditor,
      renderDreTree,
      renderDreEditor,
      renderCcTree,
      renderCcEditor,
      ensureActualsViewShell,
      renderActualsCatalog,
      renderActualsView,
      ensureBudgetViewShell,
      renderBudgetCatalog,
      renderBudgetView,
      ensureHeadcountViewShell,
      renderHeadcountCatalog,
      renderHeadcountView,
      renderComercialVendasView,
      renderComercialPlanejadoView,
      renderRps,
      renderDashboard
    } = deps;

    function render() {
      renderUserProfile();
      renderStats();
      renderNavigation();
      renderPeriodSummary();
      renderProfileEditor();
      renderReportsView();
      renderBranchTree();
      renderBranchEditor();
      renderDreTree();
      renderDreEditor();
      renderCcTree();
      renderCcEditor();

      if (getActiveView() === "actualsLoad") {
        ensureActualsViewShell();
        renderActualsCatalog();
        renderActualsView();
      }

      if (getActiveView() === "budgetLoad") {
        ensureBudgetViewShell();
        renderBudgetCatalog();
        renderBudgetView();
      }

      if (getActiveView() === "headcountLoad") {
        ensureHeadcountViewShell();
        renderHeadcountCatalog();
        renderHeadcountView();
      }

      if (getActiveView() === "comercialVendas") {
        renderComercialVendasView();
      }

      if (getActiveView() === "comercialPlanejado") {
        renderComercialPlanejadoView();
      }

      if (getActiveView() === "rps") {
        renderRps();
      }

      renderDashboard();
    }

    return {
      render
    };
  }

  window.VECTON_RENDER = {
    createRenderModule
  };
})(window);
