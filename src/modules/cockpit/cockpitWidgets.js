(function attachCockpitWidgets(window) {
  "use strict";
  const F = window.VECTON_COCKPIT_FORMAT;
  const e = F.escape;
  const money = F.formatCompactCurrency;
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const icon = name => `<svg class="nav-icon" aria-hidden="true"><use href="#vp-icon-${name}"></use></svg>`;
  const periodLabel = data => ({ month: "Mês", YTD: "YTD", year: "Ano" }[data.periodType]);
  const comparisonLabel = data => e(data.comparisonLabel || "Budget");
  const valueLabel = data => data.valueLabel || "Real";
  const safeRatio = (a, b) => a == null || b == null || !b ? null : a / b;
  const trend = value => `<span class="kpi-trend ${F.tone(value)}">${value < 0 ? "↓ " : value > 0 ? "↑ " : ""}${F.formatDelta(value, F.formatPercent)}</span>`;
  // Conteúdo do tooltip padrão (cockpitModule.js lê e desenha o cartão):
  // marca o elemento com data-tip e serializa as linhas {label, value, tone?}.
  const tip = rows => `data-tip data-tip-rows='${e(JSON.stringify(rows))}'`;
  let sparkSeq = 0;
  // Curva suave (Catmull-Rom simplificado via ponto de controle no meio de cada
  // segmento) em vez de segmentos retos — mesma técnica usada nos gráficos do
  // Dashboard (ver renderDashHcLineChart), com área em degradê sob a linha.
  function sparkline(values) {
    values = values.filter(Number.isFinite);
    if (values.length < 2) return "";
    const W = 120, H = 28, padY = 3;
    const max = Math.max(...values), min = Math.min(...values);
    const points = values.map((value, i) => ({
      x: i * W / Math.max(1, values.length - 1),
      y: padY + (H - padY * 2) - (value - min) / (max - min || 1) * (H - padY * 2)
    }));
    let line = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1], curr = points[i], midX = ((prev.x + curr.x) / 2).toFixed(1);
      line += ` C${midX},${prev.y.toFixed(1)} ${midX},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
    }
    const last = points[points.length - 1];
    const area = `${line} L${last.x.toFixed(1)},${H} L${points[0].x.toFixed(1)},${H} Z`;
    const gradId = `cockpit-spark-grad-${sparkSeq++}`;
    return `<svg class="cockpit-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity="0.30"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.02"/></linearGradient></defs><path class="cockpit-spark-area" d="${area}" fill="url(#${gradId})" stroke="none"/><path class="cockpit-spark-line" d="${line}" fill="none"/></svg>`;
  }
  function executiveKpis(data) {
    const { opex, headcount, opexPerHeadcount: perHc } = data;
    const series = data.monthlyOpex.filter(row => row.actual != null).map(row => row.actual);
    const cards = [
      { label: `OPEX Gestão ${data.management}${data.periodType === "year" ? " · Forecast" : ""}`, value: money(opex.actual), detail: `vs ${comparisonLabel(data)} ${trend(opex.variancePercent)}`, icon: "accounts", series },
      { label: "Headcount", value: F.formatInteger(headcount.actual), detail: `${comparisonLabel(data)} ${F.formatInteger(headcount.budget)} | Δ ${F.formatDelta(headcount.variance, F.formatInteger)}`, icon: "users" },
      { label: "OPEX por HC · média mensal", value: money(perHc.actual), detail: `vs ${comparisonLabel(data)} ${trend(perHc.variancePercent)}`, icon: "activity", series: series.map(value => safeRatio(value, headcount.average)) },
      { label: "Forecast Anual OPEX", value: money(opex.forecast), detail: `${F.formatPercent(safeRatio(opex.forecast, opex.annualBudget))} do ${comparisonLabel(data)}`, icon: "target", series: data.monthlyOpex.map(row => row.forecast) }
    ];
    return cards.map((card, i) => `<article class="kpi-card cockpit-kpi cockpit-kpi--${i}"><span class="kpi-label">${icon(card.icon)}${e(card.label)}</span><strong class="kpi-value">${card.value}</strong><div class="cockpit-kpi-detail">${card.detail}</div>${card.series ? sparkline(card.series) : ""}</article>`).join("");
  }
  function opexTrend(data) {
    const rows = data.monthlyOpex, values = rows.flatMap(row => [row.actual, row.budget, row.forecast]).filter(Number.isFinite);
    const max = Math.max(1, ...values), min = Math.min(0, ...values);
    const x = i => 58 + i * 51;
    const y = value => 226 - (value - min) / (max - min) * 182;
    // Curva suave entre os pontos (ponto de controle no meio de cada segmento),
    // mesma técnica do sparkline dos KPIs — só quebra a curva onde falta dado.
    const points = (field, start = 0) => {
      let prev = null, d = "";
      rows.slice(start).forEach((row, i) => {
        if (!Number.isFinite(row[field])) { prev = null; return; }
        const curr = { x: x(i + start), y: y(row[field]) };
        d += prev
          ? ` C${((prev.x + curr.x) / 2).toFixed(1)},${prev.y.toFixed(1)} ${((prev.x + curr.x) / 2).toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`
          : `M${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
        prev = curr;
      });
      return d.trim();
    };
    const grid = Array.from({ length: 5 }, (_, i) => {
      const value = min + (max - min) * i / 4;
      return `<line class="cockpit-gridline" x1="34" x2="646" y1="${y(value)}" y2="${y(value)}"/><text x="28" y="${y(value) + 4}" text-anchor="end">${F.formatInteger(value / 1000)}</text>`;
    }).join("");
    const bars = rows.map((row, i) => {
      const delta = row.actual == null || row.budget == null ? null : row.actual - row.budget;
      const pct = safeRatio(delta, row.budget == null ? null : Math.abs(row.budget));
      const description = `${months[i]}/${data.year} · Real: ${money(row.actual)} · ${data.comparisonLabel || "Budget"}: ${money(row.budget)} · Variação: ${F.formatDelta(delta)} (${F.formatDelta(pct, F.formatPercent)})`;
      // Meses futuros sem Real ainda ganham uma coluna própria com o valor do
      // comparativo (ex.: Fcst 5+7) — contorno tracejado pra não confundir com
      // Real, mas visível como coluna preenchida, não só uma linha fina.
      const fcstBar = row.actual == null && row.budget != null
        ? `<rect class="cockpit-fcst-bar" x="${x(i) - 12}" y="${Math.min(y(row.budget), y(0))}" width="24" height="${Math.abs(y(0) - y(row.budget))}" rx="5"/>`
        : "";
      // aria-label carrega a descrição completa pra leitor de tela; o cartão
      // flutuante (cockpitModule.js) usa data-tip-rows — 3 linhas, sem frase.
      const rows = [
        { label: "Real", value: money(row.actual) },
        { label: data.comparisonLabel || "Budget", value: money(row.budget) },
        { label: "%", value: F.formatDelta(pct, F.formatPercent), tone: F.tone(delta) }
      ];
      return `<g tabindex="0" role="img" aria-label="${e(description)}" ${tip(rows)}><rect class="cockpit-chart-hit" x="${x(i) - 23}" y="30" width="46" height="204"/>${row.actual != null ? `<rect class="cockpit-real" x="${x(i) - 12}" y="${Math.min(y(row.actual), y(0))}" width="24" height="${Math.abs(y(0) - y(row.actual))}" rx="5"/>` : fcstBar}<text x="${x(i)}" y="250" text-anchor="middle">${months[i]}</text></g>`;
    }).join("");
    // A linha "Forecast" foi removida do gráfico e da legenda: ela sempre
    // coincide com Real (meses já fechados) ou com o comparativo (meses
    // futuros, quando há Forecast favorito) — redundante com as colunas de
    // Real e com a coluna tracejada do comparativo. O card "Forecast Anual
    // OPEX" no topo continua mostrando o total do ano.
    return `<div class="cockpit-chart-scroll"><svg class="cockpit-trend" viewBox="0 0 665 270" aria-label="OPEX mensal em milhares de reais"><text x="8" y="16">R$ mil</text>${data.month < 12 ? `<rect class="cockpit-future" x="${x(data.month) - 25}" y="30" width="${646 - x(data.month) + 25}" height="196"/><line class="cockpit-cutoff" x1="${x(data.month) - 25}" x2="${x(data.month) - 25}" y1="26" y2="226"/><text x="${x(data.month) - 28}" y="18" text-anchor="end">Real | Forecast →</text>` : ""}${grid}${bars}<path class="cockpit-budget" d="${points("budget")}"/></svg></div><div class="cockpit-chart-legend"><span class="cockpit-real-key">Real</span><span class="cockpit-budget-key">${comparisonLabel(data)}</span></div>`;
  }
  // headers já vem como <th> prontos (plain ou ordenável); rowAttrs (opcional)
  // aplica atributos por linha, ex.: pra abrir um drilldown ao clicar.
  function table(caption, headers, rows, total, rowAttrs = []) {
    const renderRow = (cells, totalRow = false, attrs = "") => `<tr${totalRow ? ' class="ger-row-subtotal"' : ""}${attrs}>${cells.map((cell, i) => i === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`).join("")}</tr>`;
    return `<div class="reports-table-wrap cockpit-table-scroll" tabindex="0" role="region" aria-label="${e(caption)}"><table class="data-table reports-ger-table cockpit-table"><caption class="cockpit-sr-only">${e(caption)}</caption><thead><tr>${headers.join("")}</tr></thead><tbody>${rows.map((cells, i) => renderRow(cells, false, rowAttrs[i] || "")).join("")}${renderRow(total, true)}</tbody></table></div>`;
  }
  const th = (label, sortKey, active, dir) => `<th scope="col"${sortKey ? ` data-sort="${sortKey}" class="cockpit-sortable${active ? " cockpit-sort-active" : ""}"` : ""}>${e(label)}${active ? (dir === 1 ? " ↑" : " ↓") : ""}</th>`;
  // Ordenação clicável do cabeçalho (mesmo padrão ↑/↓ dos popovers de
  // auditoria do resto do app) — estado guardado aqui e reaplicado a cada
  // render(); cockpitModule.js só chama setGroupsSort + re-render.
  let groupsSort = { key: null, dir: 1 };
  function setGroupsSort(key) { groupsSort = { key, dir: groupsSort.key === key ? -groupsSort.dir : 1 }; }
  function sortGroups(list) {
    if (!groupsSort.key) return list;
    const { key, dir } = groupsSort;
    return list.slice().sort((a, b) => typeof a[key] === "string" ? dir * a[key].localeCompare(b[key], "pt-BR") : dir * ((a[key] ?? -Infinity) - (b[key] ?? -Infinity)));
  }
  function expenseGroups(data) {
    const sorted = sortGroups(data.expenseGroups);
    const row = group => [e(group.name), money(group.actual), money(group.budget), `<span class="kpi-trend ${F.tone(group.variance)}">${F.formatDelta(group.variance)}</span>`, trend(group.variancePercent)];
    const headers = [
      th("Grupo", "name", groupsSort.key === "name", groupsSort.dir),
      th(`${valueLabel(data)} ${periodLabel(data)}`, "actual", groupsSort.key === "actual", groupsSort.dir),
      th(`Meta ${periodLabel(data)}`, "budget", groupsSort.key === "budget", groupsSort.dir),
      th("Var.", "variance", groupsSort.key === "variance", groupsSort.dir),
      th("Var. %", "variancePercent", groupsSort.key === "variancePercent", groupsSort.dir)
    ];
    // Clique na linha abre o drilldown por conta (lista + Real + comparativo),
    // tratado em cockpitModule.js — aqui só marca a linha.
    const rowAttrs = sorted.map(group => group.accounts.length ? ` class="ger-drillable" data-group="${e(group.name)}"` : "");
    return table("OPEX por Grupo de Despesa", headers, sorted.map(row), row({ name: "Total", ...data.opex }), rowAttrs);
  }
  // Mesmo padrão de ordenação clicável do "OPEX por Grupo de Despesa"
  // (groupsSort/setGroupsSort/sortGroups acima), estado próprio pra não
  // interferir na outra tabela.
  let areasSort = { key: null, dir: 1 };
  function setAreasSort(key) { areasSort = { key, dir: areasSort.key === key ? -areasSort.dir : 1 }; }
  function sortAreas(list) {
    if (!areasSort.key) return list;
    const { key, dir } = areasSort;
    return list.slice().sort((a, b) => typeof a[key] === "string" ? dir * a[key].localeCompare(b[key], "pt-BR") : dir * ((a[key] ?? -Infinity) - (b[key] ?? -Infinity)));
  }
  function headcountAreas(data) {
    const sorted = sortAreas(data.headcountByArea);
    // Número do CC só no tooltip padrão do Cockpit, não mais escrito na linha
    // — o nome sozinho já identifica a área na maioria dos casos.
    const row = area => [area.code ? `<span tabindex="0" ${tip([{ label: "CC", value: area.code }])}>${e(area.name)}</span>` : e(area.name), F.formatInteger(area.actual), money(area.personnelOpex), money(area.otherOpex)];
    const headers = [
      th(data.areaLabel || "CC", "name", areasSort.key === "name", areasSort.dir),
      th("HC", "actual", areasSort.key === "actual", areasSort.dir),
      th("Gasto com Pessoal", "personnelOpex", areasSort.key === "personnelOpex", areasSort.dir),
      th("Demais Opex", "otherOpex", areasSort.key === "otherOpex", areasSort.dir)
    ];
    return table("Raio-X por Área", headers, sorted.map(row), row({ name: "Total", actual: data.headcount.actual, personnelOpex: data.personnelOpex, otherOpex: data.otherOpex }));
  }
  function deviations(data) {
    if (!data.topOpexDeviations.length) return '<p class="dash-empty">Nenhum desvio disponível para os filtros selecionados.</p>';
    const max = Math.max(...data.topOpexDeviations.map(row => Math.abs(row.variance)), 1);
    return `<ol class="cockpit-ranking">${data.topOpexDeviations.map(row => `<li><span tabindex="0" ${tip([{ label: "Conta", value: row.code }])}>${e(row.name)}</span><svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><rect class="${F.tone(row.variance)}" width="${Math.abs(row.variance) / max * 200}" height="12" rx="3"/></svg><strong class="kpi-trend ${F.tone(row.variance)}">${F.formatDelta(row.variance)}</strong></li>`).join("")}</ol>`;
  }
  const sections = [
    ["trend", "OPEX Mensal — Real x Budget", "activity", opexTrend],
    ["areas", "Raio-X por Área", "users", headcountAreas],
    ["groups", "OPEX por Grupo de Despesa", "accounts", expenseGroups],
    ["deviations", "Top Desvios do OPEX", "activity", deviations]
  ];
  function shell() {
    return `<div class="kpi-grid cockpit-kpis" data-cockpit-kpis></div><div class="cockpit-grid">${sections.map(([id, title, symbol]) => `<section class="content-card dashboard-panel cockpit-panel cockpit-${id}-panel"><div class="panel-header"><h3>${icon(symbol)} ${title}</h3></div><div data-cockpit-widget="${id}"></div></section>`).join("")}</div>`;
  }
  function render(root, data) {
    root.classList.remove("cockpit-loading");
    root.querySelector(".cockpit-loading-indicator")?.remove();
    root.querySelector(".cockpit-trend-panel h3").innerHTML = `${icon("activity")} OPEX Mensal — Real x ${comparisonLabel(data)}`;
    root.querySelector("[data-cockpit-kpis]").innerHTML = executiveKpis(data);
    sections.forEach(([id, , , renderer]) => { root.querySelector(`[data-cockpit-widget="${id}"]`).innerHTML = renderer(data); });
  }
  function loading(root) {
    // Mesmo spinner + texto do overlay de carregamento inicial do app
    // (#app-loading-overlay), centralizado sobre o corpo do Cockpit — no
    // lugar de só os retângulos cinza parados.
    if (!root.querySelector(".cockpit-loading-indicator")) {
      const indicator = document.createElement("div");
      indicator.className = "cockpit-loading-indicator";
      indicator.innerHTML = '<span class="cockpit-loading-spinner" aria-hidden="true"></span><span>Carregando dados…</span>';
      root.appendChild(indicator);
    }
    if (root.querySelector(".kpi-value")) { root.classList.add("cockpit-loading"); return; }
    root.querySelector("[data-cockpit-kpis]").innerHTML = Array.from({ length: 4 }, () => '<article class="kpi-card cockpit-kpi"><span class="vp-skel-bar cockpit-skeleton"></span><span class="vp-skel-bar cockpit-skeleton"></span><span class="vp-skel-bar cockpit-skeleton"></span></article>').join("");
    root.querySelectorAll("[data-cockpit-widget]").forEach(node => { node.innerHTML = '<div class="vp-skel-bar cockpit-widget-skeleton"></div>'; });
  }
  window.VECTON_COCKPIT_WIDGETS = { shell, render, loading, setGroupsSort, setAreasSort };
})(window);
