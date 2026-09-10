(function attachCockpitWidgets(window) {
  "use strict";
  const F = window.VECTON_COCKPIT_FORMAT;
  const e = F.escape;
  const money = F.formatCompactCurrency;
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const icon = name => `<svg class="nav-icon" aria-hidden="true"><use href="#vp-icon-${name}"></use></svg>`;
  const periodLabel = data => ({ month: "Mês", YTD: "YTD", year: "Ano" }[data.periodType]);
  const trend = value => `<span class="kpi-trend ${F.tone(value)}">${value < 0 ? "↓ " : value > 0 ? "↑ " : ""}${F.formatDelta(value, F.formatPercent)}</span>`;
  function sparkline(values) {
    const max = Math.max(...values, 1), min = Math.min(...values);
    return `<svg class="cockpit-spark" viewBox="0 0 120 28" aria-hidden="true"><polyline points="${values.map((value, i) => `${i * 120 / Math.max(1, values.length - 1)},${25 - (value - min) / (max - min || 1) * 22}`).join(" ")}"/></svg>`;
  }
  function executiveKpis(data) {
    const { opex, headcount, opexPerHeadcount: perHc } = data;
    const series = data.monthlyOpex.filter(row => row.actual != null).map(row => row.actual);
    const cards = [
      { label: `OPEX Gestão ${data.management}`, value: money(opex.actual), detail: `vs Budget ${trend(opex.variancePercent)}`, icon: "accounts", series },
      { label: "Headcount", value: F.formatInteger(headcount.actual), detail: `Budget ${F.formatInteger(headcount.budget)} | Δ ${F.formatDelta(headcount.variance, F.formatInteger)}`, icon: "users" },
      { label: "OPEX por HC", value: money(perHc.actual), detail: `vs Budget ${trend(perHc.variancePercent)}`, icon: "activity", series: series.map(value => value / headcount.average) },
      { label: "Forecast Anual OPEX", value: money(opex.forecast), detail: `${F.formatPercent(opex.forecast / opex.annualBudget)} do Budget`, icon: "target", series: data.monthlyOpex.map(row => row.forecast) }
    ];
    return cards.map(card => `<article class="kpi-card cockpit-kpi"><span class="kpi-label">${icon(card.icon)} ${e(card.label)}</span><strong class="kpi-value">${card.value}</strong><div class="cockpit-kpi-detail">${card.detail}</div>${card.series ? sparkline(card.series) : ""}</article>`).join("");
  }
  function opexTrend(data) {
    const rows = data.monthlyOpex, max = Math.ceil(Math.max(...rows.flatMap(row => [row.actual || 0, row.budget, row.forecast])) / 100000) * 100000;
    const x = i => 58 + i * 51;
    const y = value => 226 - value / max * 182;
    const points = (field, start = 0) => rows.slice(start).map((row, i) => `${x(i + start)},${y(row[field])}`).join(" ");
    const grid = Array.from({ length: 5 }, (_, i) => {
      const value = max * i / 4;
      return `<line class="cockpit-gridline" x1="34" x2="646" y1="${y(value)}" y2="${y(value)}"/><text x="28" y="${y(value) + 4}" text-anchor="end">${F.formatInteger(value / 1000)}</text>`;
    }).join("");
    const bars = rows.map((row, i) => {
      const description = `${months[i]}/${data.year} · Real: ${money(row.actual)} · Budget: ${money(row.budget)} · Forecast: ${money(row.forecast)}${row.actual == null ? "" : ` · Variação: ${F.formatDelta(row.actual - row.budget)} (${F.formatDelta((row.actual - row.budget) / row.budget, F.formatPercent)})`}`;
      return `<g tabindex="0" role="img" aria-label="${e(description)}" data-chart-tip="${e(description)}"><title>${e(description)}</title><rect class="cockpit-chart-hit" x="${x(i) - 23}" y="30" width="46" height="204"/>${row.actual != null ? `<rect class="cockpit-real" x="${x(i) - 12}" y="${y(row.actual)}" width="24" height="${226 - y(row.actual)}" rx="2"/>` : ""}<text x="${x(i)}" y="250" text-anchor="middle">${months[i]}</text></g>`;
    }).join("");
    return `<div class="cockpit-chart-scroll"><svg class="cockpit-trend" viewBox="0 0 665 270" aria-label="OPEX mensal em milhares de reais"><text x="8" y="16">R$ mil</text>${data.month < 12 ? `<rect class="cockpit-future" x="${x(data.month) - 25}" y="30" width="${646 - x(data.month) + 25}" height="196"/><line class="cockpit-cutoff" x1="${x(data.month) - 25}" x2="${x(data.month) - 25}" y1="26" y2="226"/><text x="${x(data.month) - 28}" y="18" text-anchor="end">Real | Forecast →</text>` : ""}${grid}${bars}<polyline class="cockpit-budget" points="${points("budget")}"/><polyline class="cockpit-forecast" points="${points("forecast", Math.max(0, data.month - 1))}"/></svg></div><div class="cockpit-chart-legend"><span class="cockpit-real-key">Real</span><span class="cockpit-budget-key">Budget</span><span class="cockpit-forecast-key">Forecast</span></div><p class="cockpit-tooltip" role="status">Passe o mouse ou use Tab para consultar cada mês.</p>`;
  }
  function composition(data) {
    let offset = 0;
    const slices = data.expenseComposition.map((row, i) => {
      const length = (row.share || 0) * 100;
      const markup = `<circle class="cockpit-color-${i}" cx="100" cy="100" r="72" pathLength="100" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${-offset}" tabindex="0" role="img" aria-label="${e(row.name)}: ${F.formatPercent(row.share)}, ${money(row.value)}"><title>${e(row.name)}: ${F.formatPercent(row.share)} — ${money(row.value)}</title></circle>`;
      offset += length;
      return markup;
    }).join("");
    return `<div class="cockpit-composition"><svg viewBox="0 0 200 200" class="cockpit-donut" aria-label="Composição do OPEX"><g class="cockpit-donut-slices">${slices}</g><text x="100" y="98" text-anchor="middle" class="cockpit-donut-total">${money(data.opex.actual)}</text><text x="100" y="120" text-anchor="middle">${periodLabel(data)}</text></svg><ul class="cockpit-composition-legend">${data.expenseComposition.map((row, i) => `<li><span class="cockpit-dot cockpit-color-${i}"></span><span>${e(row.name)}</span><strong>${F.formatPercent(row.share)}</strong></li>`).join("")}</ul></div>`;
  }
  function table(caption, headers, rows, total) {
    const renderRow = (cells, totalRow = false) => `<tr${totalRow ? ' class="ger-row-subtotal"' : ""}>${cells.map((cell, i) => i === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`).join("")}</tr>`;
    return `<div class="reports-table-wrap cockpit-table-scroll" tabindex="0" role="region" aria-label="${e(caption)}"><table class="data-table reports-ger-table cockpit-table"><caption class="cockpit-sr-only">${e(caption)}</caption><thead><tr>${headers.map(label => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${rows.map(row => renderRow(row)).join("")}${renderRow(total, true)}</tbody></table></div>`;
  }
  function expenseGroups(data) {
    const row = group => [e(group.name), money(group.actual), money(group.budget), `<span class="kpi-trend ${F.tone(group.variance)}">${F.formatDelta(group.variance)}</span>`, trend(group.variancePercent)];
    return table("OPEX por Grupo de Despesa", ["Grupo", `Real ${periodLabel(data)}`, `Budget ${periodLabel(data)}`, "Var.", "Var. %"], data.expenseGroups.map(row), row({ name: "Total", ...data.opex }));
  }
  function headcountAreas(data) {
    const row = area => [e(area.name), F.formatInteger(area.actual), F.formatInteger(area.budget), F.formatDelta(area.actual - area.budget, F.formatInteger), money(area.opex)];
    return table("Headcount por Área", ["Área", "HC Atual", "Budget", "Δ", `OPEX ${periodLabel(data)}`], data.headcountByArea.map(row), row({ name: "Total", ...data.headcount, opex: data.opex.actual }));
  }
  function deviations(data) {
    const max = Math.max(...data.topOpexDeviations.map(row => Math.abs(row.variance)), 1);
    return `<ol class="cockpit-ranking">${data.topOpexDeviations.map(row => `<li><span>${e(row.name)}</span><svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><rect class="${F.tone(row.variance)}" width="${Math.abs(row.variance) / max * 200}" height="12" rx="3"/></svg><strong class="kpi-trend ${F.tone(row.variance)}">${F.formatDelta(row.variance)}</strong></li>`).join("")}</ol>`;
  }
  function efficiency(data) {
    return `<div class="cockpit-efficiency">${data.efficiencyIndicators.map(row => `<article class="kpi-card"><span class="kpi-label">${e(row.label)}</span><strong>${row.format === "percent" ? F.formatPercent(row.value) : F.formatInteger(row.value)}</strong>${row.delta == null ? '<span class="kpi-trend neutral">Período selecionado</span>' : `<span class="kpi-trend ${F.tone(row.delta)}">${F.formatDelta(row.delta * 100, F.number)} ${e(row.unit)}</span>`}</article>`).join("")}</div>`;
  }
  const sections = [
    ["trend", "OPEX Mensal — Real x Budget x Forecast", "activity", opexTrend],
    ["composition", "Composição do OPEX", "dashboard", composition],
    ["groups", "OPEX por Grupo de Despesa", "accounts", expenseGroups],
    ["areas", "Headcount por Área", "users", headcountAreas],
    ["deviations", "Top Desvios do OPEX", "activity", deviations],
    ["efficiency", "Indicadores de Eficiência", "target", efficiency]
  ];
  function shell() {
    return `<div class="kpi-grid cockpit-kpis" data-cockpit-kpis></div><div class="cockpit-grid">${sections.map(([id, title, symbol]) => `<section class="content-card dashboard-panel cockpit-panel cockpit-${id}-panel"><div class="panel-header"><h3>${icon(symbol)} ${title}</h3></div><div data-cockpit-widget="${id}"></div></section>`).join("")}</div>`;
  }
  function render(root, data) {
    root.classList.remove("cockpit-loading");
    root.querySelector("[data-cockpit-kpis]").innerHTML = executiveKpis(data);
    sections.forEach(([id, , , renderer]) => { root.querySelector(`[data-cockpit-widget="${id}"]`).innerHTML = renderer(data); });
  }
  function loading(root) {
    if (root.querySelector(".kpi-value")) { root.classList.add("cockpit-loading"); return; }
    root.querySelector("[data-cockpit-kpis]").innerHTML = Array.from({ length: 4 }, () => '<article class="kpi-card cockpit-kpi"><span class="vp-skel-bar cockpit-skeleton"></span><span class="vp-skel-bar cockpit-skeleton"></span><span class="vp-skel-bar cockpit-skeleton"></span></article>').join("");
    root.querySelectorAll("[data-cockpit-widget]").forEach(node => { node.innerHTML = '<div class="vp-skel-bar cockpit-widget-skeleton"></div>'; });
  }
  window.VECTON_COCKPIT_WIDGETS = { shell, render, loading };
})(window);
