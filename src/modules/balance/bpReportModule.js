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
    function tableRows(section) {
      return `<section class="bp-statement-section" data-bp-section="${section.id}"><h3>${esc(section.title)}</h3><table class="bp-statement-table" aria-label="${esc(section.title)}"><colgroup><col class="bp-label-col"><col><col></colgroup><tbody>${section.lines.map((line,index) => `<tr class="${index === section.lines.length - 1 ? "bp-section-last" : ""}" data-bp-line="${esc(line.id)}"><th scope="row">${esc(line.label)}</th><td>${format(line.current)}</td><td>${format(line.previous)}</td></tr>`).join("")}<tr class="bp-section-total"><th scope="row">${esc(section.total)}</th><td>${format(section.current)}</td><td>${format(section.previous)}</td></tr></tbody></table></section>`;
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
      shown = model;
      exporter.bind(root, () => shown);
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
    function reset() { generation++; if (reportRoot) reportRoot.innerHTML = ""; reportRoot = null; }
    return { renderSelected, reset, read };
  }
  window.VECTON_BP_REPORT = { createModule };
})(window);
