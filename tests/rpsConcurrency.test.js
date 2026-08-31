const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "src", "modules", "rps", "rpsModule.js");
let source = fs.readFileSync(modulePath, "utf8");
source = source.replace(
  "window.VECTON_RPS = { createRpsModule };",
  "window.VECTON_RPS = { createRpsModule, defaultPayload, normalizePayload, calculatedIndicatorsNeedRepair, mergePayloads, recoverLegacyPayload, evaluateFormula };"
);
global.window = {};
eval(source);

const { defaultPayload, normalizePayload, calculatedIndicatorsNeedRepair, mergePayloads, recoverLegacyPayload, evaluateFormula } = window.VECTON_RPS;
const clone = (value) => JSON.parse(JSON.stringify(value));

{
  const base = defaultPayload();
  const remote = clone(base);
  const local = clone(base);
  remote.dados["industrial|indicador-remoto|S4"] = "15";
  local.dados["supply|indicador-local|S4"] = "27";
  const merged = mergePayloads(base, remote, local).payload;
  assert.equal(merged.dados["industrial|indicador-remoto|S4"], "15");
  assert.equal(merged.dados["supply|indicador-local|S4"], "27");
}

{
  const broken = defaultPayload();
  ["comercial", "industrial", "supply"].forEach((areaId) => {
    broken.indicadores[areaId] = broken.indicadores[areaId].map((indicator) => indicator.type === "calculated"
      ? { ...indicator, label: `( = ) ${indicator.label}`, type: "item", formula: null }
      : indicator);
  });
  assert.equal(calculatedIndicatorsNeedRepair(broken), true);
  const restored = normalizePayload(broken);
  const calculated = (areaId, label) => restored.indicadores[areaId].find((item) => item.label === label);
  assert.equal(calculated("comercial", "Total Volume Máquinas").type, "calculated");
  assert.equal(calculated("comercial", "Total Faturamento Bruto").formula, "=({Nacional}+{Exportação}+{Graneleiro}+{Peças}+{Transgrain})");
  assert.equal(calculated("comercial", "Ticket Médio Máquinas").editableFields.semanas, false);
  assert.equal(calculated("industrial", "Estoque PA").formula, "={Estoque Embolsadoras}+{Estoque Extratoras}+{Estoque Acessórios}");
  assert.equal(calculated("industrial", "Produção Máquinas").type, "calculated");
  assert.equal(calculated("supply", "Estoque Marcher").type, "calculated");
  assert.equal(calculatedIndicatorsNeedRepair(restored), false);
}

{
  const calculate = (formula, values) => evaluateFormula(formula, Object.keys(values), (label) => values[label] ?? null);
  assert.equal(calculate("={Nacional (qtd)}+{Exportação (qtd)}+{Graneleiro (qtd)}", {
    "Nacional (qtd)": 8, "Exportação (qtd)": 0, "Graneleiro (qtd)": 0
  }), 8);
  assert.equal(calculate("=({Nacional}+{Exportação}+{Graneleiro}+{Peças}+{Transgrain})", {
    Nacional: 1045901, Exportação: 0, Graneleiro: 0, Peças: 118000, Transgrain: 53347
  }), 1217248);
  assert.equal(calculate("=({Nacional}+{Exportação}+{Graneleiro})/{Total Volume Máquinas}", {
    Nacional: 1045901, Exportação: 0, Graneleiro: 0, "Total Volume Máquinas": 8
  }), 130737.625);
  assert.equal(calculate("={Estoque Embolsadoras}+{Estoque Extratoras}+{Estoque Acessórios}", {
    "Estoque Embolsadoras": 60, "Estoque Extratoras": 21, "Estoque Acessórios": 11
  }), 92);
  assert.equal(calculate("={Produção Embolsadoras}+{Produção Extratoras}+{Produção Acessórios}", {
    "Produção Embolsadoras": 8, "Produção Extratoras": 6, "Produção Acessórios": 12
  }), 26);
}

{
  const remote = defaultPayload();
  remote.dados["industrial|valor-ja-na-nuvem|S4"] = "96";
  remote.dados["industrial|conflito|S4"] = "10";
  const legacyDraft = defaultPayload();
  legacyDraft.dados["industrial|valor-so-no-rascunho|S4"] = "21";
  legacyDraft.dados["industrial|conflito|S4"] = "20";
  const recovered = recoverLegacyPayload(remote, legacyDraft);
  assert.equal(recovered.payload.dados["industrial|valor-ja-na-nuvem|S4"], "96");
  assert.equal(recovered.payload.dados["industrial|valor-so-no-rascunho|S4"], "21");
  assert.equal(recovered.payload.dados["industrial|conflito|S4"], "10");
  assert.equal(recovered.conflicts, 1);
}

assert.match(source, /rpc\/rps_save_snapshot_atomic/);
assert.match(source, /data-rps-status/);
assert.doesNotMatch(source, /"Rascunho recuperado" : statusLabel\(\)/);
assert.match(source, /function renderWhenIdle\(\)/);
assert.match(source, /function refreshVisibleCells\(\)/);
assert.match(source, /data-rps-calculated-month/);
assert.match(source, /data-rps-calculated-week/);
assert.match(source, /if \(isEditingField\(\)\) return;/);
assert.doesNotMatch(source, /void requestSave\(\);\s*renderShell\(\);/);
assert.doesNotMatch(source, /setStatus\(state\.dirty[\s\S]{0,250}renderWhenIdle\(\);/);
console.log("RPS concurrency tests passed");
