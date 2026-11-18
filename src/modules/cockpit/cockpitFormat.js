(function attachCockpitFormat(window) {
  "use strict";
  const number = (value, decimals = 1) => (Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const formatCurrency = value => !Number.isFinite(value) ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  function formatCompactCurrency(value) {
    if (!Number.isFinite(value)) return "—";
    const abs = Math.abs(value);
    return `${value < 0 ? "-" : ""}R$ ${abs >= 1e6 ? `${number(abs / 1e6, 2)} mi` : abs >= 1000 ? `${number(abs / 1000, abs >= 100000 ? 0 : 1)} mil` : number(abs, 0)}`;
  }
  const formatPercent = value => !Number.isFinite(value) ? "—" : `${number(value * 100)}%`;
  const formatInteger = value => !Number.isFinite(value) ? "—" : number(value, 0);
  const formatDelta = (value, formatter = formatCompactCurrency) => value == null ? "—" : `${value > 0 ? "+" : ""}${formatter(value)}`;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const tone = value => value == null || Math.abs(value) < 0.000001 ? "neutral" : value < 0 ? "positive" : "negative";
  const MONTHS_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  /** Selo do período nos popovers: "Out/2026", "Acumulado Jan–Out/2026" ou "Ano 2026". */
  function periodBadge(periodType, month, year) {
    const m = MONTHS_ABBR[Number(month) - 1];
    if (periodType === "year") return `Ano ${year}`;
    if (periodType === "YTD") return m ? `Acumulado Jan–${m}/${year}` : `Acumulado ${year}`;
    return m ? `${m}/${year}` : String(year ?? "");
  }
  window.VECTON_COCKPIT_FORMAT = { periodBadge, number, formatCurrency, formatCompactCurrency, formatPercent, formatInteger, formatDelta, escape, tone };
})(window);
