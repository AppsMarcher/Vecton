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

  // Cálculo puro do gráfico combo (barras de Realizado + linha/banda de
  // Meta) de 1 KPI ao longo dos 12 meses do ano — extraído do desktop
  // (2026-09-02) pra virar a base do gráfico mobile também (pedido do
  // usuário: "cada indicador deve trazer seu gráfico, a visão no mobile
  // fica tão boa quanto no desktop"). Devolve só NÚMEROS/pontos, nunca
  // marcação — cada tela desenha com as próprias classes/tamanhos (desktop:
  // sa3-bar-*/sa3-target-*; mobile: sa3mob-bar-*/sa3mob-target-*), mas a
  // escala (chartMin/Max), o corte "viajar no tempo" (cutoffMonth) e a
  // segmentação da linha de meta (buraco quando falta Real ou Meta no mês)
  // são UMA regra só, nunca duas implementações que podem divergir.
  //
  // Retorna { isRange, zeroY, bars: [{i,label,hasReal,value,top,height,tone,
  // targetValue,targetMin,targetMax,variation} x12], targetLine } onde
  // targetLine é { main: segments } (comparisonMode normal) ou
  // { min: segments, max: segments } (comparisonMode='range', 2 linhas
  // pontilhadas mín/máx) — segments = { paths: [svgPathD...], points:
  // [{x,y}...] }, x em 0..1200 (viewBox largura), y em 0..100 (%, topo=0).
  function buildKpiChartSeries(k, cutoffMonth) {
    const monthly = (k.monthlyValues || []).map((m) => (m && m.month <= cutoffMonth ? m : null));
    const targets = (k.monthlyTargets || []).map((t) => (t && t.month <= cutoffMonth ? t : null));
    const isRange = k.comparisonMode === "range";
    // status já vem calculado do banco (strategic_kpi_status) — só mapeia
    // pra tom pos/neg (attention também é meta não batida -> neg, mesma
    // decisão do usuário 2026-08-29 "retira esse amarelo" do gráfico).
    const STATUS_TONE = { on_target: "pos", attention: "neg", off_target: "neg" };

    const values = [
      ...monthly.map((m) => m?.value),
      ...targets.flatMap((t) => [t?.value, t?.min, t?.max])
    ].filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number);
    const rawMin = Math.min(0, ...values);
    const rawMax = Math.max(0, ...values);
    const rawSpan = rawMax - rawMin || Math.max(Math.abs(rawMax), Math.abs(rawMin), 1);
    const chartMin = rawMin < 0 ? rawMin - rawSpan * 0.08 : 0;
    const chartMax = rawMax > 0 ? rawMax + rawSpan * 0.08 : rawSpan;
    const chartSpan = chartMax - chartMin || 1;
    const yPct = (value) => ((chartMax - Number(value)) / chartSpan) * 100;
    const zeroY = yPct(0);

    const bars = Array.from({ length: 12 }, (_, i) => {
      const m = monthly[i] || {};
      const t = targets[i] || {};
      const hasReal = m.value !== null && m.value !== undefined && Number.isFinite(Number(m.value));
      const realY = hasReal ? yPct(m.value) : zeroY;
      let top = Math.min(realY, zeroY);
      let height = Math.abs(realY - zeroY);
      if (hasReal && height < 1.7) {
        height = 1.7;
        top = Number(m.value) < 0 ? Math.min(98.3, zeroY) : Math.max(0, zeroY - height);
      }
      const tone = STATUS_TONE[m.status] || "";
      const variation = isRange ? "—" : formatTargetVariation(m.value, t.value, { unit: k.unit, comparisonMode: k.comparisonMode });
      return {
        i, label: MONTH_LABELS_SHORT[i], hasReal, value: m.value ?? null,
        top, height, tone, variation,
        targetValue: t.value ?? null, targetMin: t.min ?? null, targetMax: t.max ?? null
      };
    });

    const smoothPath = (points) => {
      if (points.length < 2) return "";
      let path = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i += 1) {
        const previous = points[i - 1];
        const current = points[i];
        const controlX = (previous.x + current.x) / 2;
        path += ` C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
      }
      return path;
    };
    // Segmenta a linha em pedaços contínuos: mês sem Real OU sem Meta vira
    // um "buraco" (não interpola por cima do vazio) — mesma regra do
    // desktop original.
    const buildSegments = (getValue) => {
      const lineSegments = [];
      let currentSegment = [];
      const points = [];
      for (let i = 0; i < 12; i += 1) {
        const targetValue = getValue(i);
        const actualValue = monthly[i]?.value;
        const hasActual = actualValue !== null && actualValue !== undefined && Number.isFinite(Number(actualValue));
        if (!hasActual || targetValue === null || targetValue === undefined || !Number.isFinite(Number(targetValue))) {
          if (currentSegment.length) lineSegments.push(currentSegment);
          currentSegment = [];
          continue;
        }
        const point = { x: ((i + 0.5) / 12) * 1200, y: yPct(targetValue) };
        currentSegment.push(point);
        points.push(point);
      }
      if (currentSegment.length) lineSegments.push(currentSegment);
      return { paths: lineSegments.map((pts) => smoothPath(pts)).filter(Boolean), points };
    };

    const targetLine = isRange
      ? { min: buildSegments((i) => targets[i]?.min), max: buildSegments((i) => targets[i]?.max) }
      : { main: buildSegments((i) => targets[i]?.value) };

    return { isRange, zeroY, bars, targetLine };
  }

  window.VECTON_STRATEGIC_DATA = {
    MONTH_LABELS_SHORT, STATUS_META, ACTION_STATUS_OPTIONS, ACTION_STATUS_TONE, ACTION_CLOSED_STATUSES,
    formatByUnit, formatTargetVariation, buildKpiChartSeries
  };
})(window);
