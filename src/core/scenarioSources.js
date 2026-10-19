(function attachVectonScenarioSources(global) {
// Fontes comparáveis dos relatórios: "Real {ano}" e cenários (qualquer ano).
// Funções puras, sem DOM nem rede. Valores de fonte: "real:{ano}" e "scenario:{id}";
// o valor legado "budget" é resolvido para o cenário "Budget {ano do toggle}".

function withYearSuffix(name, year) {
  const clean = String(name ?? "").trim();
  if (!clean) return "";
  return new RegExp(`${year}$`).test(clean) ? clean : `${clean} ${year}`;
}

function buildSourceOptions({ scenarios = [], realYears = [] } = {}) {
  const real = [...new Set(realYears.map(Number))]
    .sort((a, b) => b - a)
    .map((year) => ({ value: `real:${year}`, label: `Real ${year}`, year, kind: "real" }));
  const planned = [...scenarios]
    .sort((a, b) => (b.reference_year - a.reference_year) || String(a.name).localeCompare(String(b.name), "pt-BR"))
    .map((s) => ({
      value: `scenario:${s.id}`,
      label: s.name,
      year: Number(s.reference_year),
      kind: "scenario"
    }));
  return [...real, ...planned];
}

function parseSource(value) {
  if (typeof value !== "string" || !value) return null;
  if (value === "budget") return { kind: "legacyBudget" };
  if (value.startsWith("real:")) {
    const year = Number(value.slice(5));
    return Number.isInteger(year) ? { kind: "real", year } : null;
  }
  if (value.startsWith("scenario:") && value.length > 9) {
    return { kind: "scenario", id: value.slice(9) };
  }
  return null;
}

function resolveLegacyBudget(scenarios, toggleYear) {
  const budget = (scenarios || []).find((s) => s.name === `Budget ${toggleYear}`);
  return budget ? `scenario:${budget.id}` : null;
}

function resolveDefaultSource({ scenarios = [], toggleYear } = {}) {
  const favorite = scenarios.find((s) => s.is_default);
  if (favorite) return `scenario:${favorite.id}`;
  return resolveLegacyBudget(scenarios, toggleYear) || `real:${toggleYear}`;
}

// Opções de um seletor de fonte e o valor a assumir: o atual se ainda existir; senão a
// estrela global / "Budget {ano do toggle}" / primeira opção. O legado "budget" vira
// "Budget {ano do toggle}". includeReal=false para seletores só de planejamento.
function chooseSource({ scenarios = [], realYears = [], current, toggleYear, includeReal = true } = {}) {
  const options = buildSourceOptions({ scenarios, realYears: includeReal ? realYears : [] });
  let fallback = resolveDefaultSource({ scenarios, toggleYear });
  if (!options.some((o) => o.value === fallback)) fallback = options[0]?.value || null;
  let value = current;
  if (parseSource(value)?.kind === "legacyBudget") value = resolveLegacyBudget(scenarios, toggleYear);
  if (!value || !options.some((o) => o.value === value)) value = fallback;
  return { options, value };
}

// Destinos possíveis da carga: cenários do ano da competência (o ano do cenário
// e o da competência coincidem, então os lotes continuam listados no período).
function loadTargetsForYear(scenarios = [], year) {
  return scenarios.filter((s) => Number(s.reference_year) === Number(year));
}

// Destino pré-selecionado: "Budget {ano}" se existir; senão o primeiro do ano; senão "".
function pickDefaultLoadTarget(scenarios = [], year) {
  const targets = loadTargetsForYear(scenarios, year);
  const budget = targets.find((s) => s.name === `Budget ${year}`);
  return (budget || targets[0])?.id || "";
}

global.VECTON_SCENARIO_SOURCES = {
  chooseSource,
  loadTargetsForYear,
  pickDefaultLoadTarget,
  withYearSuffix,
  buildSourceOptions,
  parseSource,
  resolveDefaultSource,
  resolveLegacyBudget
};
})(window);
