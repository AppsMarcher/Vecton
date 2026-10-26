(function (window) {
  "use strict";
  function createModule(d) {
    const M = window.VECTON_BP_REPORT_MODEL, esc = d.escapeHtml;
    const exporter = window.VECTON_BP_EXPORT.create(d);
    let generation = 0, reportRoot = null, shown = null;
    const format = cents => cents === null ? "—" : (cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 }).replace(/^-0$/, "0");
    async function all(table, query) {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await d.fetch(table, `${query}&limit=1000&offset=${offset}`);
        rows.push(...page); if (page.length < 1000) return rows;
      }
    }
    async function read(org, selected) {
      const dates = M.periods(selected);
      const plan = await all("bp_plan_nodes", `organization_id=eq.${org}&select=id,account_code,name,node_class,group_key,source_name,parent_id,sort_order,active&order=sort_order.asc,id.asc`);
      let batches;
      try {
        batches = await all("bp_import_batches", `organization_id=eq.${org}&source_type=eq.actual&superseded_at=is.null&or=(and(reference_year.eq.${dates.current.year},reference_month.eq.${dates.current.month}),and(reference_year.eq.${dates.previous.year},reference_month.eq.12))&select=id,branch_id,reference_year,reference_month,plan_snapshot,rows&order=id.asc`);
      } catch (error) {
        const message = String(error.message || error);
        if (!message.includes("bp_import_batches") || !/PGRST205|42P01|does not exist|Could not find the table/.test(message)) throw error;
        batches = [];
      }
      const forPeriod = p => batches.filter(b => Number(b.reference_year) === p.year && Number(b.reference_month) === p.month);
      const ongoingYear = d.getCurrentYear?.() ?? M.calendarYear();
      const resultCurrent = dates.current.year === ongoingYear && forPeriod(dates.current).length ? await d.getDreResult(dates.current.year, dates.current.month) : 0;
      return M.build(plan, forPeriod(dates.current), forPeriod(dates.previous), selected, { current: resultCurrent }, ongoingYear);
    }
    // ── Drilldown: contas analíticas que compõem a linha (mesmo popover do DRE Gerencial) ──
    const money2 = cents => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let popover = null;
    function closePopover() { if (popover) { popover.remove(); popover = null; } }
    function openDrill(model, lineId, column) {
      const line = model.sections.flatMap(s => s.lines).find(l => l.id === lineId);
      if (!line || line[column] === null) return;
      if (popover && popover.dataset.lineId === lineId && popover.dataset.column === column) { closePopover(); return; }
      closePopover();
      const date = model[column === "current" ? "current" : "previous"].date;
      const rows = column === "current" && line.detail.currentFromDre
        ? [{ code: "51401001", name: `Resultado do DRE Societário (jan–${String(model.current.month).padStart(2, "0")}/${model.current.year})`, cents: line.current }]
        : line.detail[column];
      const total = rows.reduce((n, r) => n + r.cents, 0);
      let sortKey = "code", sortDir = 1;
      const sorted = () => rows.slice().sort((a, b) => sortKey === "cents" ? sortDir * (a.cents - b.cents) : sortDir * String(a[sortKey] || "").localeCompare(String(b[sortKey] || ""), "pt-BR", { numeric: true }));
      const th = (key, cls, label) => `<th class="${cls}" data-sort="${key}" style="cursor:pointer;user-select:none${sortKey === key ? ";color:var(--blue)" : ""}">${esc(label)}${sortKey === key ? (sortDir === 1 ? " ↑" : " ↓") : ""}</th>`;
      const head = () => th("code", "gap-code", "Conta") + th("name", "gap-name", "Descrição") + th("cents", "gap-val", "Saldo");
      const body = () => sorted().map(r => `<tr><td class="gap-code">${esc(r.code)}</td><td class="gap-name">${esc(r.name)}</td><td class="gap-val">${money2(r.cents)}</td></tr>`).join("");
      popover = document.createElement("div");
      popover.className = "ger-audit-popover";
      popover.dataset.lineId = lineId; popover.dataset.column = column;
      popover.setAttribute("role", "dialog"); popover.setAttribute("aria-label", `Composição de ${line.label} em ${date}`);
      popover.innerHTML = `<div class="gap-header"><span class="gap-title">${esc(line.label)}</span><span class="gap-badge">${date}</span>${rows.length && d.exportRows ? '<button type="button" class="vp-export-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 19h14"/></svg><span>Excel</span></button>' : ""}<button class="gap-close" aria-label="Fechar">✕</button></div>${rows.length
        ? `<div class="gap-table-wrap"><table class="gap-table"><thead><tr>${head()}</tr></thead><tbody>${body()}</tbody></table></div><div class="gap-footer"><span class="gap-footer-label">Total</span><span class="gap-footer-val ${total < 0 ? "gap-neg" : total > 0 ? "gap-pos" : ""}">${money2(total)}</span></div>`
        : '<div class="gap-empty">Sem contas com saldo nesta linha.</div>'}`;
      popover.style.cssText = "position:fixed;top:50%;left:50%;right:auto;transform:translate(-50%,-50%);max-height:90vh;overflow-y:auto";
      popover.querySelector(".gap-close").addEventListener("click", event => { event.stopPropagation(); closePopover(); });
      popover.addEventListener("click", event => {
        const header = event.target.closest("th[data-sort]");
        if (!header) return;
        event.stopPropagation();
        sortDir = header.dataset.sort === sortKey ? -sortDir : 1; sortKey = header.dataset.sort;
        popover.querySelector("thead tr").innerHTML = head(); popover.querySelector("tbody").innerHTML = body();
      });
      popover.querySelector(".vp-export-btn")?.addEventListener("click", event => {
        event.stopPropagation();
        d.exportRows(sorted().map(r => ({ code: r.code, name: r.name, amount: r.cents / 100 })), [["code", "Conta"], ["name", "Descrição"], ["amount", "Saldo"]], `Composicao_${line.label}_${date.replace(/\//g, "-")}`);
      });
      document.body.appendChild(popover);
    }
    function bindDrill(root) {
      if (root._bpDrill) root.removeEventListener("click", root._bpDrill);
      root._bpDrill = event => {
        const cell = event.target.closest("[data-bp-drill]");
        if (cell && shown) openDrill(shown, cell.closest("[data-bp-line]").dataset.bpLine, cell.dataset.bpDrill);
      };
      root.addEventListener("click", root._bpDrill);
      if (!document._bpDrillClose) {
        document._bpDrillClose = event => { if (popover && !popover.contains(event.target) && !event.target.closest("[data-bp-drill]")) closePopover(); };
        document.addEventListener("click", document._bpDrillClose, true);
      }
    }
    function tableRows(section) {
      return `<section class="bp-statement-section" data-bp-section="${section.id}"><h3>${esc(section.title)}</h3><table class="bp-statement-table" aria-label="${esc(section.title)}"><colgroup><col class="bp-label-col"><col><col></colgroup><tbody>${section.lines.map((line,index) => `<tr class="${index === section.lines.length - 1 ? "bp-section-last" : ""}" data-bp-line="${esc(line.id)}"><th scope="row">${esc(line.label)}</th>${["current", "previous"].map(column => line[column] === null ? "<td>—</td>" : `<td class="bp-drillable" data-bp-drill="${column}" tabindex="0">${format(line[column])}</td>`).join("")}</tr>`).join("")}<tr class="bp-section-total"><th scope="row">${esc(section.total)}</th><td>${format(section.current)}</td><td>${format(section.previous)}</td></tr></tbody></table></section>`;
    }
    function side(model, kind, label, totalLabel) {
      const groups = model.sections.filter(s => s.side === kind);
      const totals = model[kind];
      return `<section class="bp-statement-side bp-statement-${kind}" aria-label="${esc(label)}">
        <table class="bp-statement-table bp-statement-heading"><colgroup><col class="bp-label-col"><col><col></colgroup><thead><tr><th scope="col">${esc(label)}</th><th scope="col" aria-label="Saldo em ${model.current.date}">${model.current.year}</th><th scope="col" aria-label="Saldo em ${model.previous.date}">${model.previous.year}</th></tr></thead></table>
        ${groups.map(tableRows).join("")}${kind === "asset" ? '<div class="bp-equity-space" aria-hidden="true"></div>' : ""}
        <table class="bp-statement-table bp-statement-grandtotal"><colgroup><col class="bp-label-col"><col><col></colgroup><tbody><tr><th scope="row">${esc(totalLabel)}</th><td>${format(totals.current)}</td><td>${format(totals.previous)}</td></tr></tbody></table></section>`;
    }
    function draw(root, model) {
      root.innerHTML = `<article class="content-card bp-statement" aria-label="Balanço Patrimonial Real consolidado Marcher">
        <header class="bp-statement-intro"><div><p class="section-kicker">MARCHER</p><h2>Balanço Patrimonial</h2></div><div class="bp-statement-actions"><p class="bp-statement-dates">${model.current.date}<span>comparado a ${model.previous.date}</span></p>${exporter.menu()}</div></header>
        <div class="bp-statement-scroll" tabindex="0" role="region" aria-label="Ativo e Passivo lado a lado"><div class="bp-statement-grid">${side(model,"asset","ATIVO","TOTAL DO ATIVO")}${side(model,"liability","PASSIVO","TOTAL DO PASSIVO")}</div></div>
        </article>`;
      closePopover();
      shown = model;
      exporter.bind(root, () => shown);
      bindDrill(root);
    }
    function renderSelected(root, reportId) {
      if (reportId !== "balanceSheetReal") return false;
      const token = ++generation, user = d.getUserId(), selected = { ...d.getPeriod() };
      reportRoot = root;
      const current = () => token === generation && user === d.getUserId() && d.isReportActive() && d.canSeeReport();
      root.innerHTML = '<div class="content-card" role="status">Carregando Balanço Patrimonial Real…</div>';
      void (async () => {
        try {
          if (!user || !d.canSeeReport()) throw new Error("Sem acesso ao Balanço Patrimonial Real.");
          const org = await d.resolveOrganizationId();
          if (!current()) return;
          const model = await read(org, selected);
          if (!current()) return;
          draw(root, model);
        } catch (error) {
          if (token === generation && user === d.getUserId() && d.isReportActive()) root.innerHTML = `<div class="content-card bp-statement-error" role="alert"><p>${esc(error.message)}</p><button type="button" class="ghost-button" data-bp-retry>Tentar novamente</button></div>`;
          root.querySelector("[data-bp-retry]")?.addEventListener("click", () => renderSelected(root, reportId));
        }
      })();
      return true;
    }
    function reset() { generation++; closePopover(); if (reportRoot) reportRoot.innerHTML = ""; reportRoot = null; }
    return { renderSelected, reset, read };
  }
  window.VECTON_BP_REPORT = { createModule };
})(window);
