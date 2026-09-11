(function attachCockpitAggregate(window) {
  "use strict";
  const norm = value => String(value ?? "").replace(/\D/g, "");
  const monthOf = row => Number(row.reference_month ?? row.referenceMonth);
  const accountOf = row => norm(row.account_number ?? row.accountNumber);
  const ccOf = row => norm(row.cost_center_number ?? row.costCenterNumber);
  const sum = values => values.reduce((total, value) => total + value, 0);
  const ratio = (a, b) => a == null || b == null || b === 0 ? null : a / b;
  const difference = (a, b) => a == null || b == null ? null : a - b;
  const variance = (actual, budget) => ({ actual, budget, variance: difference(actual, budget), variancePercent: ratio(difference(actual, budget), budget == null ? null : Math.abs(budget)) });
  const indexes = (start, end) => Array.from({ length: end - start }, (_, i) => start + i);
  // Incomplete periods stay unavailable, never silently reducing the average denominator.
  const periodSum = (series, selected) => selected.every(i => series[i] != null) ? sum(selected.map(i => series[i])) : null;
  function monthly(rows, predicate = () => true, count = false, coverage = new Set(rows.map(monthOf))) {
    const values = Array.from({ length: 12 }, (_, i) => coverage.has(i + 1) ? 0 : null);
    for (const row of rows) {
      const i = monthOf(row) - 1, amount = count ? 1 : Number(row.amount);
      if (i >= 0 && i < 12 && predicate(row) && Number.isFinite(amount)) values[i] = (values[i] ?? 0) + amount;
    }
    return values;
  }
  function indexRows(rows, key) {
    const result = new Map();
    for (const row of rows) { const code = key(row); if (!result.has(code)) result.set(code, []); result.get(code).push(row); }
    return result;
  }
  /** Pure aggregation of authorized Supabase records. Budget fields refer to comparisonLabel (the starred source). */
  function aggregate(filters, source) {
    if (!source) return null;
    const { month, periodType } = filters;
    if (!Number.isInteger(month) || month < 1 || month > 12 || !["month", "YTD", "year"].includes(periodType)) throw new Error("Período inválido");
    const { actualRows, comparisonRows, headcountRows, comparisonHeadcountRows, groups, costCenters } = source;
    const accounts = new Set(groups.flatMap(group => group.accounts.map(norm)));
    const selected = indexes(periodType === "month" ? month - 1 : 0, periodType === "year" ? 12 : month);
    const actualIndexes = indexes(periodType === "month" ? month - 1 : 0, month);
    const actualCoverage = new Set(actualRows.map(monthOf)), compareCoverage = new Set(comparisonRows.map(monthOf));
    const actual = monthly(actualRows, row => accounts.has(accountOf(row)));
    const comparison = monthly(comparisonRows, row => accounts.has(accountOf(row)));
    const blend = (a, b) => a.map((value, i) => i < month ? value : (source.hasForecast ? b[i] : null));
    const forecast = blend(actual, comparison);
    const hcActual = monthly(headcountRows, () => true, true), hcComparison = monthly(comparisonHeadcountRows, () => true, true);
    const hcMean = ratio(periodSum(periodType === "year" ? blend(hcActual, hcComparison) : hcActual, selected), selected.length);
    const hcBudgetMean = ratio(periodSum(hcComparison, selected), selected.length);
    if (![...actualIndexes.map(i => actual[i]), ...selected.map(i => comparison[i]), hcActual[month - 1], hcComparison[month - 1]].some(value => value != null)) return null;
    const opex = { ...variance(periodSum(periodType === "year" ? forecast : actual, selected), periodSum(comparison, selected)),
      realized: periodSum(actual, actualIndexes), forecast: source.hasForecast || month === 12 ? periodSum(forecast, indexes(0, 12)) : null,
      annualBudget: periodSum(comparison, indexes(0, 12)) };
    const headcount = { ...variance(hcActual[month - 1], hcComparison[month - 1]), average: hcMean, budgetAverage: hcBudgetMean };
    // Index once: rankings/groups do not each rescan the full annual ledger.
    const actualAccounts = indexRows(actualRows, accountOf), compareAccounts = indexRows(comparisonRows, accountOf);
    const actualCcs = indexRows(actualRows, ccOf), compareCcs = indexRows(comparisonRows, ccOf);
    function financialPair(aRows, bRows) {
      const a = monthly(aRows, row => accounts.has(accountOf(row)), false, actualCoverage);
      const b = monthly(bRows, row => accounts.has(accountOf(row)), false, compareCoverage);
      return variance(periodSum(periodType === "year" ? blend(a, b) : a, selected), periodSum(b, selected));
    }
    const rowsFor = (map, keys) => [...new Set(keys)].flatMap(key => map.get(key) || []);
    const accountPair = codes => financialPair(rowsFor(actualAccounts, codes), rowsFor(compareAccounts, codes));
    const accountNames = new Map((source.accountNames || []).map(row => [norm(row.code), row.name]));
    // Só entram grupos com movimento real ou comparativo. `actual`/`budget` podem ser
    // 0 (sem lançamento na competência) ou null (fonte sem cobertura) — ambos são
    // "vazios" pra esse filtro, por isso o teste é de truthiness, não `!== 0`.
    // `accounts` (drilldown) só traz as contas do próprio grupo com movimento —
    // mesma regra do grupo, e ordenadas pelo Real absoluto (maior primeiro).
    const expenseGroups = groups.map(group => {
      const codes = group.accounts.map(norm);
      const accountRows = codes.map(code => ({ code, name: accountNames.get(code) || code, ...accountPair([code]) }))
        .filter(row => row.actual || row.budget)
        .sort((a, b) => Math.abs(b.actual || 0) - Math.abs(a.actual || 0));
      return { name: group.name, ...accountPair(codes), accounts: accountRows };
    }).filter(row => row.actual || row.budget);
    const names = new Map(costCenters.map(cc => [norm(cc.number), cc])), areas = new Map();
    for (const row of [...actualRows, ...comparisonRows, ...headcountRows, ...comparisonHeadcountRows]) {
      const number = ccOf(row), cc = names.get(number);
      const key = filters.management === "Marcher" ? (cc?.management?.trim() || "Sem gestão cadastrada") : number;
      if (!areas.has(key)) areas.set(key, { name: filters.management === "Marcher" ? key : (cc ? cc.name : number || "Sem centro de custo"), code: filters.management === "Marcher" ? null : (cc ? cc.number : null), codes: new Set() });
      areas.get(key).codes.add(number);
    }
    // Raio-X por Área: separa o OPEX de cada CC/gestão em Pessoal e o resto.
    // "Pessoal" usa as contas dos próprios grupos de Pessoal/Mão-de-obra do
    // catálogo (groups) — não a lista solta HC_PESSOAL_ACCOUNTS, que ficou
    // incompleta em relação ao grupo "DESPESAS COM PESSOAL - ADM" e batia
    // diferente do que "Composição do OPEX"/"OPEX por Grupo" já mostram pro
    // mesmo período. Mesma definição usada aqui e no indicador "Pessoal / OPEX".
    const personnelSet = new Set(groups.filter(group => /pessoal|m[ãa]o-de-obra/i.test(group.name)).flatMap(group => group.accounts.map(norm)));
    const headcountByArea = [...areas.values()].map(area => {
      const areaActualRows = rowsFor(actualCcs, area.codes), areaCompareRows = rowsFor(compareCcs, area.codes);
      const total = financialPair(areaActualRows, areaCompareRows);
      const personnelPair = financialPair(areaActualRows.filter(row => personnelSet.has(accountOf(row))), areaCompareRows.filter(row => personnelSet.has(accountOf(row))));
      return { name: area.name, code: area.code,
        ...variance(monthly(headcountRows, row => area.codes.has(ccOf(row)), true)[month - 1], monthly(comparisonHeadcountRows, row => area.codes.has(ccOf(row)), true)[month - 1]),
        opex: total.actual, personnelOpex: personnelPair.actual,
        otherOpex: total.actual != null && personnelPair.actual != null ? total.actual - personnelPair.actual : null };
    // Some da lista o CC/gestão cujas 3 colunas (HC, Pessoal, Demais Opex) vêm
    // zeradas ou indisponíveis — sem isso, cada área da empresa aparecia mesmo
    // sem nenhum lançamento na competência selecionada.
    }).filter(area => area.actual || area.personnelOpex || area.otherOpex).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const topOpexDeviations = [...accounts].map(code => ({ name: accountNames.get(code) || code, code, ...accountPair([code]) }))
      .filter(row => row.variance != null && Math.abs(row.variance) >= 0.005).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 5);
    const ra = source.revenueActual || Array(12).fill(null), rb = source.revenueComparison || Array(12).fill(null);
    const revenue = periodSum(periodType === "year" ? blend(ra, rb) : ra, selected), revenueBudget = periodSum(rb, selected);
    const personnel = accountPair([...personnelSet]);
    // Demais OPEX = total menos Pessoal, no Real e no comparativo — usado pelo
    // card "Atingimento do OPEX" (Pessoal x Demais, Mês x Acumulado).
    const otherOpexActual = opex.actual != null && personnel.actual != null ? opex.actual - personnel.actual : null;
    const otherOpexBudget = opex.budget != null && personnel.budget != null ? opex.budget - personnel.budget : null;
    const rate = ratio(opex.actual, opex.budget), personnelRate = ratio(personnel.actual, opex.actual);
    const warnings = [...(source.warnings || [])];
    if (opex.actual == null) warnings.push("Real/Forecast incompleto no período selecionado; o total não foi estimado.");
    if (opex.budget == null) warnings.push("Comparativo sem cobertura completa do período.");
    if (hcMean == null || hcBudgetMean == null) warnings.push("HC médio indisponível: há competência sem base de pessoas.");
    if (revenue == null) warnings.push("Receita líquida Marcher indisponível ou incompleta no período.");
    return { ...filters, source: "supabase", comparisonLabel: source.comparisonLabel, valueLabel: periodType === "year" ? "Forecast" : "Real",
      areaLabel: filters.management === "Marcher" ? "Gestão" : "CC", warnings, opex, headcount,
      opexPerHeadcount: variance(ratio(ratio(opex.actual, selected.length), hcMean), ratio(ratio(opex.budget, selected.length), hcBudgetMean)),
      monthlyOpex: actual.map((value, i) => ({ month: i + 1, actual: i < month ? value : null, budget: comparison[i], forecast: source.hasForecast || i < month ? forecast[i] : null })),
      expenseGroups, headcountByArea, topOpexDeviations,
      personnelOpex: personnel.actual, personnelOpexBudget: personnel.budget,
      otherOpex: otherOpexActual, otherOpexBudget,
      expenseComposition: expenseGroups.map(row => ({ name: row.name, value: row.actual, share: ratio(row.actual, opex.actual) })),
      efficiencyIndicators: [
        { label: "OPEX / Receita líquida Marcher", value: ratio(opex.actual, revenue), format: "percent", delta: difference(ratio(opex.actual, revenue), ratio(opex.budget, revenueBudget)), unit: "p.p." },
        { label: "Pessoal / OPEX", value: personnelRate, format: "percent", delta: difference(personnelRate, ratio(personnel.budget, opex.budget)), unit: "p.p." },
        { label: "HC médio", value: hcMean, format: "number", delta: null },
        { label: `Aderência ao ${source.comparisonLabel}`, value: rate, format: "percent", delta: difference(rate, 1), unit: "p.p." }
      ] };
  }
  function createService(loader) {
    if (typeof loader !== "function") throw new Error("Configure uma fonte de dados do Cockpit");
    const pending = new Map();
    return { load(filters) {
      const snapshot = { ...filters }, key = JSON.stringify(snapshot);
      if (!pending.has(key)) {
        const request = Promise.resolve().then(() => loader(snapshot)); pending.set(key, request);
        request.finally(() => pending.delete(key)).catch(() => {});
      }
      return pending.get(key);
    } };
  }
  window.VECTON_COCKPIT_DATA = { aggregate, createService, monthly, periodSum };
})(window);
