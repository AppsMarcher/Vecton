(function attachCockpitFormat(window) {
  "use strict";
  const number = (value, decimals = 1) => (Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const formatCurrency = value => value == null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  function formatCompactCurrency(value) {
    if (value == null) return "—";
    const abs = Math.abs(value);
    return `${value < 0 ? "-" : ""}R$ ${abs >= 1e6 ? `${number(abs / 1e6, 2)} mi` : abs >= 1000 ? `${number(abs / 1000, abs >= 100000 ? 0 : 1)} mil` : number(abs, 0)}`;
  }
  const formatPercent = value => value == null ? "—" : `${number(value * 100)}%`;
  const formatInteger = value => value == null ? "—" : number(value, 0);
  const formatDelta = (value, formatter = formatCompactCurrency) => value == null ? "—" : `${value > 0 ? "+" : ""}${formatter(value)}`;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const tone = value => value == null || Math.abs(value) < 0.000001 ? "neutral" : value < 0 ? "positive" : "negative";
  window.VECTON_COCKPIT_FORMAT = { number, formatCurrency, formatCompactCurrency, formatPercent, formatInteger, formatDelta, escape, tone };
})(window);
