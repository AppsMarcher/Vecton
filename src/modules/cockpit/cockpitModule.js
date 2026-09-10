(function attachCockpitModule(window) {
  "use strict";
  function createCockpitModule({ getActiveView, getPeriod, canAccess, service = window.VECTON_COCKPIT_DATA.createService() }) {
    const F = window.VECTON_COCKPIT_FORMAT;
    const W = window.VECTON_COCKPIT_WIDGETS;
    let management = "Controladoria", periodType = "YTD", lastKey = "", requestId = 0;
    let controls, root, body, status, mobileHost, home, periodHome;
    function initialize() {
      root = document.querySelector("#cockpit-view");
      root.innerHTML = `<div class="panel-header cockpit-heading"><div><h1>Diretoria de Controladoria e Finanças</h1><p>Visão integrada de desempenho, custos e pessoas</p></div><span class="cockpit-demo">Dados de demonstração</span></div><p class="cockpit-context"></p><div class="cockpit-status" role="status" aria-live="polite"></div><div class="cockpit-body">${W.shell()}</div>`;
      body = root.querySelector(".cockpit-body");
      status = root.querySelector(".cockpit-status");
      controls = document.createElement("div");
      controls.id = "cockpit-header-filters";
      controls.className = "cockpit-header-filters";
      controls.innerHTML = `<label class="cockpit-management"><span>Gestão</span><select class="vp-source-sel" aria-label="Gestão">${Object.keys(window.VECTON_COCKPIT_DATA.dashboardConfig).map(name => `<option${name === management ? " selected" : ""}>${F.escape(name)}</option>`).join("")}</select></label><div class="cockpit-period-types" role="group" aria-label="Tipo de período">${[["month", "Mês"], ["YTD", "YTD"], ["year", "Ano"]].map(([value, label]) => `<button type="button" class="period-month-button" data-period="${value}" aria-pressed="${value === periodType}">${label}</button>`).join("")}</div>`;
      document.querySelector(".header-actions .period-picker").before(controls);
      controls.querySelector("select").addEventListener("change", event => { management = event.target.value; render(); });
      controls.querySelectorAll("[data-period]").forEach(button => button.addEventListener("click", () => {
        periodType = button.dataset.period;
        controls.querySelectorAll("[data-period]").forEach(node => node.setAttribute("aria-pressed", String(node.dataset.period === periodType)));
        render();
      }));
      const showTip = event => {
        const point = event.target.closest("[data-chart-tip]");
        if (point) root.querySelector(".cockpit-tooltip").textContent = point.dataset.chartTip;
      };
      root.addEventListener("focusin", showTip);
      root.addEventListener("pointerover", showTip);
      root.addEventListener("click", event => { if (event.target.closest("[data-cockpit-retry]")) { lastKey = ""; render(); } });
    }
    async function render() {
      const active = (getActiveView() === "cockpit" || !!mobileHost) && canAccess();
      if (!root && !active) return;
      if (!root) initialize();
      if (mobileHost) root.classList.add("active");
      controls.hidden = !active;
      if (!active) { requestId++; lastKey = ""; return; }
      const period = getPeriod();
      const filters = { management, year: Number(period.year), month: Number(period.month), periodType };
      const key = JSON.stringify(filters);
      if (key === lastKey) return;
      lastKey = key;
      const token = ++requestId;
      root.querySelector(".cockpit-context").textContent = `${management} · ${String(filters.month).padStart(2, "0")}/${filters.year} · ${periodType === "month" ? "Mês" : periodType === "year" ? "Ano — Real até a competência; Budget anual" : "Acumulado no ano"} · OPEX/HC = OPEX do período ÷ HC médio`;
      status.textContent = "Carregando dados da gestão…";
      status.classList.add("cockpit-sr-only");
      body.hidden = false;
      body.setAttribute("aria-busy", "true");
      W.loading(body);
      try {
        const data = await service.load(filters);
        if (token !== requestId) return;
        if (!data) {
          status.textContent = "Nenhum dado disponível para os filtros selecionados.";
          body.hidden = true;
        } else {
          W.render(body, data);
          status.textContent = "";
        }
      } catch (error) {
        if (token !== requestId) return;
        body.hidden = true;
        status.innerHTML = 'Não foi possível carregar os dados desta gestão. <button class="period-month-button" type="button" data-cockpit-retry>Tentar novamente</button>';
      } finally {
        if (token === requestId) {
          body.setAttribute("aria-busy", "false");
          status.classList.remove("cockpit-sr-only");
        }
      }
    }
    function mount(host) {
      if (!canAccess() || mobileHost === host) return;
      if (!root) initialize();
      home = { parent: root.parentNode, next: root.nextSibling };
      const picker = document.querySelector("#period-trigger").closest(".period-picker");
      periodHome = { parent: picker.parentNode, next: picker.nextSibling, picker };
      mobileHost = host;
      host.innerHTML = '<div class="cockpit-mobile-filters"></div>';
      host.querySelector(".cockpit-mobile-filters").append(controls, picker);
      host.append(root);
      lastKey = "";
      void render();
    }
    function unmount() {
      if (!mobileHost) return;
      document.querySelector("#period-popover").hidden = true;
      document.querySelector("#period-trigger").setAttribute("aria-expanded", "false");
      periodHome.parent.insertBefore(periodHome.picker, periodHome.next);
      periodHome.picker.before(controls);
      home.parent.insertBefore(root, home.next);
      mobileHost = null;
      root.classList.toggle("active", getActiveView() === "cockpit");
      void render();
    }
    return { render, mount, unmount };
  }
  window.VECTON_COCKPIT = { createCockpitModule };
})(window);
