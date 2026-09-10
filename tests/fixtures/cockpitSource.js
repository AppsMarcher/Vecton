(function (target) {
  // Synthetic records for tests only, shaped like the existing ledgers.
  function buildSource(management = "Controladoria") {
    const factor = management === "Industrial" ? 2 : management === "Comercial" ? 3 : 1;
    const result = { actualRows: [], comparisonRows: [], headcountRows: [], comparisonHeadcountRows: [],
      groups: [{ name: "Pessoal", accounts: ["101"] }, { name: "Serviços", accounts: ["102"] }],
      costCenters: [{ id: "cc1", number: "100", name: management === "Industrial" ? "Produção" : "Financeiro", management }, { id: "cc2", number: "200", name: "Apoio", management }],
      accountNames: [{ code: "101", name: "Salários" }, { code: "102", name: "Consultoria" }], personnelAccounts: ["101"], comparisonLabel: "Forecast favorito", hasForecast: true,
      revenueActual: Array(12).fill(100000), revenueComparison: Array(12).fill(110000) };
    for (let month = 1; month <= 12; month++) {
      result.actualRows.push({ id: `a${month}`, reference_month: month, account_number: "101", cost_center_number: "100", amount: 1000 * month * factor }, { id: `b${month}`, reference_month: month, account_number: "102", cost_center_number: "200", amount: 500 * factor });
      result.comparisonRows.push({ id: `c${month}`, reference_month: month, account_number: "101", cost_center_number: "100", amount: 1100 * month * factor }, { id: `d${month}`, reference_month: month, account_number: "102", cost_center_number: "200", amount: 600 * factor });
      for (let i = 0; i < (month < 3 ? 2 : 4) * factor; i++) result.headcountRows.push({ id: `h${month}-${i}`, reference_month: month, cost_center_number: i % 2 ? "100" : "200" });
      for (let i = 0; i < 4 * factor; i++) result.comparisonHeadcountRows.push({ id: `j${month}-${i}`, reference_month: month, cost_center_number: i % 2 ? "100" : "200" });
    }
    return result;
  }
  target.TEST_COCKPIT_SOURCE = { buildSource };
})(typeof window === "undefined" ? module.exports : window);
