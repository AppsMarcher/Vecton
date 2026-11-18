(function attachOpexReviewCore(window) {
  "use strict";
  // Regras puras do acompanhamento de OPEX: sinaleira, estados, atraso, chave de contexto.
  const DEFAULT_THRESHOLDS = Object.freeze({ yellowMoney: 10000, yellowPct: 5, redMoney: 20000, redPct: 10, direction: "over" });
  const cents = value => Math.round(value * 100);
  const isNum = value => typeof value === "number" && Number.isFinite(value);

  // Sentido não monitorado: "over" só olha acima da meta (delta > 0); "under" só abaixo (delta < 0); "both" os dois.
  const ignored = (direction, delta) => (direction === "over" && delta <= 0) || (direction === "under" && delta >= 0);

  /** Classifica a variação (real - comparativo). Vermelho é avaliado antes do amarelo; critérios R$ e % combinam por OU. */
  function classifyVariance({ actual, comparison }, thresholds = DEFAULT_THRESHOLDS) {
    if (!isNum(actual) || !isNum(comparison)) return { level: null, delta: null, pct: null, noBase: false };
    const delta = cents(actual) - cents(comparison); // em centavos, evita erro de ponto flutuante nos limites
    const deltaMoney = delta / 100;
    const base = Math.abs(cents(comparison));
    if (base === 0) {
      if (delta === 0 || ignored(thresholds.direction, delta)) return { level: "green", delta: deltaMoney, pct: 0, noBase: false };
      return { level: "red", delta: deltaMoney, pct: null, noBase: true };
    }
    const pct = Math.abs(delta) / base * 100;
    if (ignored(thresholds.direction, delta)) return { level: "green", delta: deltaMoney, pct, noBase: false }; // abaixo da meta não é sinalizado
    const moneyAbs = Math.abs(delta), pctAbs = Math.abs(pct);
    const atLeastPct = limit => pctAbs >= limit - 1e-9;
    let level = "green";
    if (moneyAbs >= cents(thresholds.redMoney) || atLeastPct(thresholds.redPct)) level = "red";
    else if (moneyAbs >= cents(thresholds.yellowMoney) || atLeastPct(thresholds.yellowPct)) level = "yellow";
    return { level, delta: deltaMoney, pct, noBase: false };
  }

  function validateThresholds(t) {
    const keys = ["yellowMoney", "yellowPct", "redMoney", "redPct"];
    if (!t || keys.some(key => !isNum(t[key]) || t[key] <= 0)) return { ok: false, error: "Informe limites positivos." };
    if (t.direction !== undefined && !["over", "under", "both"].includes(t.direction)) return { ok: false, error: "Direção inválida." };
    if (t.redMoney < t.yellowMoney || t.redPct < t.yellowPct) return { ok: false, error: "O limite vermelho não pode ser menor que o amarelo." };
    return { ok: true, error: null };
  }

  const OPEN_STATES = new Set(["awaiting_ack", "in_progress", "adjustments_requested"]);
  const STATUS_LABELS = {
    awaiting_ack: "Aguardando ciência", in_progress: "Em andamento", awaiting_validation: "Aguardando validação",
    adjustments_requested: "Ajustes solicitados", completed: "Concluída"
  };
  /** Atraso derivado: vence no fim do dia local (todayIso = AAAA-MM-DD no fuso da organização). */
  function isOverdue(action, todayIso) {
    return Boolean(action && action.due_date && OPEN_STATES.has(action.status) && String(action.due_date).slice(0, 10) < todayIso);
  }
  function actionStatusLabel(action, todayIso) {
    const label = STATUS_LABELS[action.status] || String(action.status || "");
    return isOverdue(action, todayIso) ? `${label} · atrasada` : label;
  }

  /** Identidade da análise. O grupo é só apresentação e não entra na chave. */
  function contextKey(ctx) {
    return [ctx.organizationId, ctx.costCenterId, String(ctx.accountNumber), ctx.year, ctx.periodType, ctx.month,
      ctx.sourceKey, ctx.sourceYear, ctx.scopeKey || ""].join("|");
  }

  const TRANSITIONS = {
    ack: ["awaiting_ack"],
    submit: ["in_progress", "adjustments_requested"],
    validate: ["awaiting_validation"],
    return: ["awaiting_validation"],
    reassign: ["awaiting_ack", "in_progress", "awaiting_validation", "adjustments_requested"]
  };
  const canTransition = (from, op) => Boolean(TRANSITIONS[op] && TRANSITIONS[op].includes(from));

  const api = { DEFAULT_THRESHOLDS, classifyVariance, validateThresholds, isOverdue, actionStatusLabel, contextKey, canTransition, STATUS_LABELS };
  window.VECTON_OPEX_REVIEW_CORE = api;
})(typeof window !== "undefined" ? window : globalThis);
