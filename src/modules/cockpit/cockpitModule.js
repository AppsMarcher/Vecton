(function attachCockpitModule(window) {
  "use strict";
  function createCockpitModule({ getActiveView, getPeriod, canAccess, service, getManagementAccess, syncHeaderPeriod }) {
    const F = window.VECTON_COCKPIT_FORMAT;
    const W = window.VECTON_COCKPIT_WIDGETS;
    let management = "Marcher", periodType = "month", lastKey = "", requestId = 0;
    let controls, root, body, status, mobileHost, home, controlsHome, periodHome, hideTrendTip, lastData, drillPopover;
    let entered = false; // reseta toda vez que o usuário SAI da tela (ver render())
    function initialize() {
      root = document.querySelector("#cockpit-view");
      root.innerHTML = `<div class="panel-header cockpit-heading"><div><h1></h1><p>Visão integrada de desempenho, custos e pessoas</p></div><div class="cockpit-heading-actions"><button type="button" class="period-month-button" data-cockpit-refresh>Atualizar dados</button></div></div><p class="cockpit-source"></p><div class="cockpit-status" role="status" aria-live="polite"></div><div class="cockpit-body">${W.shell()}</div>`;
      body = root.querySelector(".cockpit-body");
      status = root.querySelector(".cockpit-status");
      controls = document.createElement("div");
      controls.id = "cockpit-header-filters";
      controls.className = "cockpit-header-filters";
      controls.innerHTML = `<label class="cockpit-management"><span>Gestão</span><select class="vp-source-sel" aria-label="Gestão"></select></label><div class="cockpit-period-types" role="group" aria-label="Tipo de período">${[["month", "Mês"], ["YTD", "YTD"], ["year", "Ano"]].map(([value, label]) => `<button type="button" class="period-month-button" data-period="${value}" aria-pressed="${value === periodType}">${label}</button>`).join("")}</div>`;
      // Gestão + Mês/YTD/Ano ficam no cabeçalho local do Cockpit, dentro do
      // mesmo grupo do botão "Atualizar dados" (.cockpit-heading-actions) —
      // assim os três ficam colados entre si e encostados na direita, em vez
      // de espalhados pelo justify-content:space-between do cabeçalho.
      root.querySelector(".cockpit-heading-actions [data-cockpit-refresh]").before(controls);
      controls.querySelector("select").addEventListener("change", event => { management = event.target.value; render(); });
      controls.querySelectorAll("[data-period]").forEach(button => button.addEventListener("click", () => {
        periodType = button.dataset.period;
        controls.querySelectorAll("[data-period]").forEach(node => node.setAttribute("aria-pressed", String(node.dataset.period === periodType)));
        render();
      }));
      // Tooltip padrão do Cockpit: cartão flutuante de N linhas (rótulo + valor),
      // usado no gráfico OPEX Mensal, no Raio-X por Área e no Top Desvios — no
      // lugar do title nativo do navegador. Cada linha vem em data-tip-rows
      // (JSON: [{label, value, tone?}]). Segue o mouse (pointermove) e também
      // aparece por teclado (focusin), posicionado sobre o próprio elemento.
      let tip = document.querySelector("#cockpit-tip");
      if (!tip) {
        tip = document.createElement("div");
        tip.id = "cockpit-tip";
        tip.className = "cockpit-tip";
        tip.hidden = true;
        document.body.appendChild(tip);
      }
      const fillTip = point => {
        let rows = [];
        try { rows = JSON.parse(point.dataset.tipRows || "[]"); } catch { rows = []; }
        tip.innerHTML = rows.map(row => `<div class="cockpit-tip-row"><span>${F.escape(row.label)}</span><strong${row.tone ? ` class="kpi-trend ${F.escape(row.tone)}"` : ""}>${F.escape(row.value)}</strong></div>`).join("");
        tip.hidden = false;
      };
      const positionTip = (clientX, clientY) => {
        const width = tip.offsetWidth || 120;
        tip.style.left = `${Math.min(clientX + 14, window.innerWidth - width - 8)}px`;
        tip.style.top = `${Math.max(clientY - 64, 8)}px`;
      };
      const hideTip = () => { tip.hidden = true; };
      // Também acessível fora do listener: some o cartão se a view for trocada
      // com o mouse/foco ainda "em cima" de um elemento (sem pointerout/focusout).
      hideTrendTip = hideTip;
      root.addEventListener("pointerover", event => {
        const point = event.target.closest("[data-tip]");
        if (point) fillTip(point);
      });
      root.addEventListener("pointermove", event => {
        if (event.target.closest("[data-tip]")) positionTip(event.clientX, event.clientY);
      });
      root.addEventListener("pointerout", event => {
        if (event.target.closest("[data-tip]") && !event.relatedTarget?.closest?.("[data-tip]")) hideTip();
      });
      root.addEventListener("focusin", event => {
        const point = event.target.closest("[data-tip]");
        if (!point) return;
        fillTip(point);
        const rect = point.getBoundingClientRect();
        positionTip(rect.left + rect.width / 2, rect.top);
      });
      root.addEventListener("focusout", event => {
        if (event.target.closest("[data-tip]")) hideTip();
      });
      root.addEventListener("click", event => {
        if (event.target.closest("[data-cockpit-retry], [data-cockpit-refresh]")) { service.invalidate?.(); refresh(); return; }
        // Cabeçalho ordenável (mesmo padrão ↑/↓ dos popovers de auditoria do
        // app) e drilldown por grupo — reordena/abre com os dados já
        // carregados, sem precisar de uma nova consulta.
        const sortTh = event.target.closest(".cockpit-groups-panel th[data-sort]");
        if (sortTh) { W.setGroupsSort(sortTh.dataset.sort); if (lastData) W.render(body, lastData); return; }
        const areaSortTh = event.target.closest(".cockpit-areas-panel th[data-sort]");
        if (areaSortTh) { W.setAreasSort(areaSortTh.dataset.sort); if (lastData) W.render(body, lastData); return; }
        const groupRow = event.target.closest(".cockpit-groups-panel tr[data-group]");
        if (groupRow && lastData) openGroupDrilldown(groupRow.dataset.group, lastData);
      });
    }
    // Popover de detalhamento de um grupo de despesa: lista as contas do
    // grupo com Real e o comparativo (Fcst 5+7/Budget), ordenável — mesma
    // linguagem visual dos popovers de auditoria (.gap-*) usados no resto do
    // app, só que próprio do Cockpit (dado já vem agregado, não por lançamento).
    function openGroupDrilldown(groupName, data) {
      const group = data.expenseGroups.find(g => g.name === groupName);
      if (!group) return;
      closeGroupDrilldown();
      let sortKey = "actual", sortDir = -1;
      const money = F.formatCompactCurrency;
      const sortedAccounts = () => group.accounts.slice().sort((a, b) => {
        if (sortKey === "name") return sortDir * a.name.localeCompare(b.name, "pt-BR");
        return sortDir * ((a[sortKey] ?? 0) - (b[sortKey] ?? 0));
      });
      const th = (key, label, align) => {
        const active = sortKey === key;
        const arrow = active ? (sortDir === 1 ? " ↑" : " ↓") : "";
        return `<th data-sort="${key}" style="cursor:pointer;user-select:none${align ? `;text-align:${align}` : ""}${active ? ";color:var(--blue)" : ""}">${F.escape(label)}${arrow}</th>`;
      };
      const renderThead = () => `${th("name", "Conta")}${th("actual", "Real", "center")}${th("budget", data.comparisonLabel || "Meta", "center")}`;
      const renderRows = () => sortedAccounts().map(a => `<tr><td class="gap-name" title="${F.escape(a.code)}">${F.escape(a.name)}</td><td class="gap-val">${F.escape(money(a.actual))}</td><td class="gap-val">${F.escape(money(a.budget))}</td></tr>`).join("");
      const periodBadge = { month: "Mês", YTD: "YTD", year: "Ano" }[data.periodType] || "";
      const popover = document.createElement("div");
      popover.className = "ger-audit-popover";
      // Total de cada coluna embutido no próprio <tfoot> — table-layout:fixed
      // garante o mesmo alinhamento das linhas de conta, em vez de um rodapé
      // solto fora da tabela (ficava deslocado das colunas Real/Fcst).
      popover.innerHTML = `
        <div class="gap-header">
          <span class="gap-title">${F.escape(group.name)}</span>
          <span class="gap-badge">${F.escape(periodBadge)}</span>
          <button class="gap-close" type="button" aria-label="Fechar">✕</button>
        </div>
        <div class="gap-table-wrap"><table class="gap-table">
          <thead><tr>${renderThead()}</tr></thead>
          <tbody>${renderRows()}</tbody>
          <tfoot><tr class="gap-total-row"><td class="gap-name">Total</td><td class="gap-val">${F.escape(money(group.actual))}</td><td class="gap-val">${F.escape(money(group.budget))}</td></tr></tfoot>
        </table></div>`;
      // Direto no body, sem overlay escuro por trás — mesmo padrão dos
      // popovers de auditoria do app (buildAuditPopover), fechado clicando
      // fora (documento) em vez de num backdrop dedicado.
      document.body.appendChild(popover);
      drillPopover = popover;
      popover.querySelector(".gap-close").addEventListener("click", closeGroupDrilldown);
      popover.addEventListener("click", event => {
        const sortTh = event.target.closest("th[data-sort]");
        if (!sortTh) return;
        const key = sortTh.dataset.sort;
        sortDir = key === sortKey ? -sortDir : 1;
        sortKey = key;
        popover.querySelector("thead tr").innerHTML = renderThead();
        popover.querySelector("tbody").innerHTML = renderRows();
      });
      setTimeout(() => document.addEventListener("click", onDocClickCloseDrilldown, true), 0);
    }
    function closeGroupDrilldown() {
      if (!drillPopover) return;
      drillPopover.remove();
      drillPopover = null;
      document.removeEventListener("click", onDocClickCloseDrilldown, true);
    }
    function onDocClickCloseDrilldown(event) {
      if (drillPopover && !drillPopover.contains(event.target) && !event.target.closest(".ger-drillable")) closeGroupDrilldown();
    }
    async function render() {
      const active = (getActiveView() === "cockpit" || !!mobileHost) && canAccess();
      if (!root && !active) return;
      if (!root) initialize();
      if (mobileHost) root.classList.add("active");
      controls.hidden = !active;
      if (!active) { entered = false; requestId++; lastKey = ""; hideTrendTip?.(); closeGroupDrilldown(); return; }
      if (!entered) {
        // Toda vez que ENTRA na tela (não a cada re-render), reseta pro padrão
        // — Gestão Marcher, filtro Mês, mês calendário atual -1 — e empurra
        // esse mês pro seletor de período do cabeçalho (mesmo padrão do
        // Painel de Vendas, ver renderSelectedPainel em
        // reportsComercialPainelModule.js): o toggle do topo nunca pode ficar
        // descasado do que a tela está mostrando. Depois disso, segue o
        // cabeçalho normalmente até o usuário sair e entrar de novo.
        entered = true;
        management = "Marcher";
        periodType = "month";
        controls.querySelectorAll("[data-period]").forEach(node => node.setAttribute("aria-pressed", String(node.dataset.period === periodType)));
        const lastMonth = new Date();
        lastMonth.setDate(1); // evita estourar o mês ao cair num dia 29-31 que não existe no mês anterior
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        syncHeaderPeriod?.(lastMonth.getFullYear(), lastMonth.getMonth() + 1);
      }
      const access = getManagementAccess(management);
      management = access.selected;
      const select = controls.querySelector("select");
      const optionsKey = JSON.stringify([access.options, access.selected, access.locked]);
      if (select.dataset.optionsKey !== optionsKey) {
        select.innerHTML = access.options.map(name => `<option value="${F.escape(name)}"${name === management ? " selected" : ""}>${F.escape(name)}</option>`).join("");
        select.disabled = access.locked;
        select.dataset.optionsKey = optionsKey;
      }
      const managementLabel = controls.querySelector(".cockpit-management > span");
      if (managementLabel) managementLabel.textContent = access.partial ? "Gestão · parcial" : "Gestão";
      // Título segue o filtro de Gestão selecionado (ex.: "Controladoria"), em vez
      // de um texto fixo — antes sempre dizia "Diretoria de Controladoria e
      // Finanças" mesmo com outra gestão escolhida no dropdown.
      root.querySelector(".cockpit-heading h1").textContent = management;
      const period = getPeriod();
      const filters = { management, year: Number(period.year), month: Number(period.month), periodType };
      const key = JSON.stringify([filters, access]);
      if (key === lastKey) return;
      lastKey = key;
      closeGroupDrilldown();
      const token = ++requestId;
      root.querySelector(".cockpit-source").textContent = "";
      root.querySelector(".cockpit-source").removeAttribute("title");
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
          status.classList.remove("cockpit-sr-only");
          body.hidden = true;
        } else {
          lastData = data;
          W.render(body, data);
          const sourceEl = root.querySelector(".cockpit-source");
          sourceEl.textContent = `Comparativo: ${data.comparisonLabel || "Budget"} · Receita líquida total Marcher`;
          if (data.opex.realized != null && periodType === "year") sourceEl.textContent += ` · Real até a competência: ${F.formatCompactCurrency(data.opex.realized)}`;
          // Avisos (ex.: sem Forecast favorito, cobertura incompleta) não viram mais um
          // parágrafo fixo na tela — ficam só no título do resumo (hover) e na região
          // aria-live, pra não poluir o cabeçalho quando tudo carrega normalmente.
          const warnings = data.warnings || [];
          sourceEl.classList.toggle("cockpit-source--warn", warnings.length > 0);
          if (warnings.length) sourceEl.title = warnings.join(" "); else sourceEl.removeAttribute("title");
          status.textContent = warnings.join(" ");
        }
      } catch (error) {
        if (token !== requestId) return;
        body.hidden = true;
        status.classList.remove("cockpit-sr-only");
        status.innerHTML = 'Não foi possível carregar os dados desta gestão. <button class="period-month-button" type="button" data-cockpit-retry>Tentar novamente</button>';
      } finally {
        if (token === requestId) body.setAttribute("aria-busy", "false");
      }
    }
    function mount(host) {
      if (!canAccess() || mobileHost === host) return;
      if (!root) initialize();
      home = { parent: root.parentNode, next: root.nextSibling };
      controlsHome = { parent: controls.parentNode, next: controls.nextSibling };
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
      hideTrendTip?.();
      closeGroupDrilldown();
      document.querySelector("#period-popover").hidden = true;
      document.querySelector("#period-trigger").setAttribute("aria-expanded", "false");
      periodHome.parent.insertBefore(periodHome.picker, periodHome.next);
      controlsHome.parent.insertBefore(controls, controlsHome.next);
      home.parent.insertBefore(root, home.next);
      mobileHost = null;
      root.classList.toggle("active", getActiveView() === "cockpit");
      void render();
    }
    function refresh() { lastKey = ""; return render(); }
    return { render, mount, unmount, refresh };
  }
  window.VECTON_COCKPIT = { createCockpitModule };
})(window);
