(function attachCockpitData(window) {
  "use strict";
  // Development fixture only. No production ledger is mixed with these values.
  const dashboardConfig = {
    Marcher: { factor: 12, areas: ["Comercial", "Industrial", "Engenharia", "Controladoria", "Supply Chain"] },
    Comercial: { factor: 1.8, areas: ["Vendas", "Pós-vendas", "Peças", "Exportação", "Gestão Comercial"] },
    Controladoria: { factor: 1, areas: ["Controladoria", "Contabilidade", "Fiscal", "Financeiro", "Diretoria"] },
    Diretoria: { factor: 0.8, areas: ["Presidência", "Operações", "Finanças", "Estratégia", "Governança"] },
    Engenharia: { factor: 1.6, areas: ["Projetos", "Desenvolvimento", "Validação", "Processos", "Gestão Engenharia"] },
    Industrial: { factor: 4.2, areas: ["Produção", "Montagem", "Manutenção", "PCP", "Gestão Industrial"] },
    Marketing: { factor: 0.7, areas: ["Marca", "Comunicação", "Eventos", "Digital", "Inteligência de Mercado"] },
    Produto: { factor: 0.9, areas: ["Portfólio", "Pesquisa", "Aplicação", "Documentação", "Gestão Produto"] },
    Qualidade: { factor: 0.6, areas: ["Inspeção", "Fornecedores", "Auditoria", "Garantia", "Gestão Qualidade"] },
    "Recursos Humanos": { factor: 0.85, areas: ["Pessoas", "Departamento Pessoal", "Desenvolvimento", "Segurança", "Gestão RH"] },
    "Supply Chain": { factor: 2.1, areas: ["Compras", "Logística", "Estoques", "Planejamento", "Gestão Supply Chain"] }
  };
  const mockManagementDashboardData = {
    year: 2026,
    actual: [310, 335, 348, 350, 355, 360, 375, 390, 427, 405, 415, 425],
    budget: [330, 345, 355, 365, 365, 375, 390, 405, 420, 425, 430, 445],
    groups: [
      { name: "Pessoal", actual: 202, budget: 210 },
      { name: "Serviços", actual: 61, budget: 58 },
      { name: "Sistemas/TI", actual: 37, budget: 40 },
      { name: "Viagens", actual: 12, budget: 14 },
      { name: "Outros", actual: 13, budget: 13 }
    ],
    areaWeights: [92, 73, 66, 57, 37],
    headcount: [5, 4, 4, 3, 2],
    headcountBudget: [5, 5, 4, 3, 2],
    accounts: [
      { name: "Consultoria", group: "Serviços", variance: 42000 },
      { name: "Licenças de Software", group: "Sistemas/TI", variance: 28000 },
      { name: "Viagens e Estadias", group: "Viagens", variance: -22000 },
      { name: "Treinamentos", group: "Pessoal", variance: -18000 },
      { name: "Serviços de Terceiros", group: "Serviços", variance: -15000 }
    ]
  };
  const sum = (rows, field) => rows.reduce((total, row) => total + (field ? row[field] : row), 0);
  const ratio = (a, b) => b ? a / b : null;
  const variance = (actual, budget) => ({ actual, budget, variance: actual - budget, variancePercent: ratio(actual - budget, budget) });
  /** @typedef {{management: string, year: number, month: number, periodType: 'month'|'YTD'|'year'}} DashboardFilters */
  /** Pure aggregate adapter. All widgets consume the same immutable filter snapshot. */
  function aggregate(filters, fixture = mockManagementDashboardData) {
    const config = dashboardConfig[filters.management];
    if (!config || filters.year !== fixture.year) return null;
    const { factor } = config;
    const month = filters.month;
    if (!Number.isInteger(month) || month < 1 || month > 12 || !["month", "YTD", "year"].includes(filters.periodType)) throw new Error("Período inválido");
    const start = filters.periodType === "month" ? month - 1 : 0;
    const end = filters.periodType === "year" ? 12 : month;
    const monthlyOpex = fixture.actual.map((value, i) => ({
      month: i + 1, actual: i < month ? value * 1000 * factor : null,
      budget: fixture.budget[i] * 1000 * factor,
      forecast: (i < month ? value : fixture.budget[i] * 0.98) * 1000 * factor
    }));
    const actual = sum(monthlyOpex.slice(start, Math.min(end, month)).map(row => row.actual));
    const budget = sum(monthlyOpex.slice(start, end), "budget");
    // In Ano, Real remains actual through the selected competence; future months are never zero actuals.
    const comparableBudget = sum(monthlyOpex.slice(start, Math.min(end, month)), "budget");
    const expenseGroups = fixture.groups.map(group => ({ name: group.name, ...variance(actual * group.actual / 325, budget * group.budget / 335) }));
    const headcountByArea = config.areas.map((name, i) => ({ name,
      actual: Math.max(1, Math.round(fixture.headcount[i] * factor)),
      budget: Math.max(1, Math.round(fixture.headcountBudget[i] * factor)), opex: actual * fixture.areaWeights[i] / 325
    }));
    const headcount = variance(sum(headcountByArea, "actual"), sum(headcountByArea, "budget"));
    headcount.average = headcount.actual; // Fixture has constant monthly HC; real adapter must average monthly snapshots.
    const opex = { ...variance(actual, budget), forecast: sum(monthlyOpex, "forecast"), annualBudget: sum(monthlyOpex, "budget") };
    const scale = actual / 3250000;
    const accounts = fixture.accounts.map(row => ({ ...row, variance: row.variance * scale }));
    // Reconcile remaining account variances with each expense group, instead of unrelated ranking numbers.
    expenseGroups.forEach(group => {
      const remainder = group.variance - sum(accounts.filter(row => row.group === group.name), "variance");
      for (let i = 0; i < 5; i++) accounts.push({ name: `${group.name} — demais contas ${i + 1}`, variance: remainder / 5 });
    });
    const revenue = actual * 125;
    return { ...filters, source: "mock", opex, headcount,
      opexPerHeadcount: variance(ratio(actual, headcount.average), ratio(budget, headcount.budget)),
      monthlyOpex, expenseGroups, headcountByArea,
      expenseComposition: expenseGroups.map(row => ({ name: row.name, value: row.actual, share: ratio(row.actual, actual) })),
      topOpexDeviations: accounts.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 5),
      efficiencyIndicators: [
        { label: "OPEX / Receita", value: ratio(actual, revenue), format: "percent", delta: ratio(actual - comparableBudget, revenue), unit: "p.p." },
        { label: "Pessoal / OPEX", value: ratio(expenseGroups[0].actual, actual), format: "percent", delta: 202 / 325 - 210 / 335, unit: "p.p." },
        { label: "HC médio", value: headcount.average, format: "integer", delta: null },
        { label: "Aderência ao Budget", value: ratio(actual, budget), format: "percent", delta: null }
      ]
    };
  }
  function createService(loader = async filters => aggregate(filters)) {
    const pending = new Map();
    return { load(filters) {
      const snapshot = { ...filters };
      const key = JSON.stringify(snapshot);
      if (!pending.has(key)) {
        const request = Promise.resolve().then(() => loader(snapshot));
        pending.set(key, request);
        request.finally(() => pending.delete(key)).catch(() => {});
      }
      return pending.get(key);
    } };
  }
  window.VECTON_COCKPIT_DATA = { dashboardConfig, mockManagementDashboardData, aggregate, createService };
})(window);
