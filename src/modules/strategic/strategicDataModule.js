(function attachVectonStrategicData(window) {
  // Modelo de dados puro (sem DOM) do módulo A3 Estratégico, compartilhado
  // entre desktop (strategicModule.js) e mobile (strategicMobileModule.js).
  // Mesmo padrão de comercialPainelDataModule.js: extraído do desktop pra
  // não duplicar formatação/regra de negócio — o desktop foi editado pra
  // consumir estas mesmas funções em vez de manter cópia própria.

  const MONTH_LABELS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const STATUS_META = {
    on_target:     { label: "Dentro da meta", tone: "pos" },
    attention:     { label: "Atenção",        tone: "warn" },
    off_target:    { label: "Fora da meta",   tone: "neg" },
    not_available: { label: "Sem dado",       tone: "muted" }
  };

  const ACTION_STATUS_OPTIONS = [
    { value: "not_started", label: "Não iniciada" },
    { value: "in_progress", label: "Em andamento" },
    { value: "on_hold",     label: "Pausada" },
    { value: "done",        label: "Concluída" },
    { value: "cancelled",   label: "Cancelada" }
  ];
  const ACTION_STATUS_TONE = {
    not_started: "muted", in_progress: "warn", on_hold: "pause", done: "pos", cancelled: "cancel"
  };
  const ACTION_CLOSED_STATUSES = ["done", "cancelled"];

  function formatByUnit(value, unit, decimalPlaces) {
    if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return "—";
    const n = Number(value);
    const dp = Number.isFinite(decimalPlaces) ? decimalPlaces : (unit === "percent" ? 1 : 0);
    if (unit === "percent") {
      return `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: dp, maximumFractionDigits: dp })}%`;
    }
    if (unit === "BRL") {
      return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    const suffix = unit && unit !== "un" ? ` ${unit}` : "";
    return `${n.toLocaleString("pt-BR", { minimumFractionDigits: dp, maximumFractionDigits: dp })}${suffix}`;
  }

  // achado (melhoria #2 do review): Number(null) === 0 é finito, então
  // "sem realizado" (null) com meta preenchida passava pelo guard de
  // Number.isFinite e calculava uma variação de -100% inventada, em vez de
  // "—". Guard explícito de null/undefined/"" ANTES de converter pra number.
  //
  // achado (melhoria #3): KPI unit='percent' mostrava variação RELATIVA
  // (ex.: real 12% vs meta 10% virava "+20,0%", quando o que interessa pro
  // negócio é a diferença em PONTOS PERCENTUAIS, "+2,0 p.p."). Também
  // sinaliza o sentido favorável (▲ bom / ▼ ruim) conforme comparisonMode
  // do KPI — 'lower' inverte quem é favorável (menor é melhor), sem mudar
  // o número (mantém sinal aritmético honesto: sempre real - meta).
  function formatTargetVariation(actual, target, { unit = null, comparisonMode = null } = {}) {
    if (actual === null || actual === undefined || actual === "" ||
        target === null || target === undefined || target === "") return "—";
    const actualValue = Number(actual);
    const targetValue = Number(target);
    if (!Number.isFinite(actualValue) || !Number.isFinite(targetValue)) return "—";

    let variation;
    let suffix;
    if (unit === "percent") {
      variation = (actualValue - targetValue) * 100; // valores já vêm em fração (0.12 = 12%)
      suffix = " p.p.";
    } else {
      if (targetValue === 0) return actualValue === 0 ? "0,0%" : "—";
      variation = ((actualValue - targetValue) / Math.abs(targetValue)) * 100;
      suffix = "%";
    }

    const favorable = comparisonMode === "lower" ? -variation : variation;
    const arrow = favorable > 0 ? " ▲" : favorable < 0 ? " ▼" : "";
    const sign = variation > 0 ? "+" : "";
    return `${sign}${variation.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suffix}${arrow}`;
  }

  window.VECTON_STRATEGIC_DATA = {
    MONTH_LABELS_SHORT, STATUS_META, ACTION_STATUS_OPTIONS, ACTION_STATUS_TONE, ACTION_CLOSED_STATUSES,
    formatByUnit, formatTargetVariation
  };
})(window);
