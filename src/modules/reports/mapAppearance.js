/* Shared map palette, based on Performance de Peças. */
(function (window) {
  function heat(value, max) {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0 || !(max > 0)) return "var(--theme-map-land, #282d37)";
    const t = Math.max(.12, Math.min(1, value / max));
    const low = [19, 26, 40], high = [29, 78, 216];
    return `rgb(${low.map((v, i) => Math.round(v + (high[i] - v) * t)).join(",")})`;
  }
  window.VECTON_MAP_APPEARANCE = Object.freeze({heat, gradient: "linear-gradient(90deg,rgb(20,32,61),rgb(29,78,216))"});
})(window);
