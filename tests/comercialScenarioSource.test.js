const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// O Budget comercial é o cenário "Budget {ano}": nenhuma tela oferece mais o "Budget"
// fixo (scenario_id nulo) como opção.
const carga = read('src/modules/comercial/comercialPlanejadoCargaModule.js');
assert.ok(!/<option value="budget">/.test(carga), 'carga comercial sem opção "budget"');
assert.ok(!/selectedScenarioTarget\s*[!=]==\s*"budget"/.test(carga), 'carga comercial não compara destino com "budget"');
assert.ok(/pickDefaultLoadTarget/.test(carga), 'carga comercial pré-seleciona o Budget do ano');
assert.ok(/select=id,name,reference_year/.test(carga), 'carga comercial lê o ano do cenário');

const relatorios = read('src/modules/reports/comercialReportsModule.js');
assert.ok(!/<option value="" \$\{!scenarioId \? "selected" : ""\}>Budget<\/option>/.test(relatorios), 'relatórios comerciais sem opção fixa Budget');
assert.ok(/`Budget \$\{year\}`/.test(relatorios), 'relatórios comerciais usam o cenário "Budget {ano}" como padrão');

const painel = read('src/modules/reports/reportsComercialPainelModule.js');
assert.ok(!/>Budget<\/option>/.test(painel), 'Painel de Vendas sem opção fixa Budget');

const mobile = read('src/modules/reports/reportsComercialPainelMobileModule.js');
assert.ok(!/\{ id: "", label: "Budget" \}/.test(mobile), 'Painel mobile sem item fixo Budget');

// A migration 277 move o Budget nulo para o cenário e ajusta a função que lia scenario_id nulo.
const sql = read('supabase/277_comercial_budget_vira_cenario.sql');
assert.ok(/update public\.comercial_planejado_ledger_entries/.test(sql));
assert.ok(/update public\.comercial_planejado_import_batches/.test(sql));
assert.ok(!/le\.scenario_id is null/.test(sql), 'função de evolução de Peças não lê mais scenario_id nulo');
assert.ok(/le\.scenario_id = v_budget_scenario/.test(sql));

console.log('comercialScenarioSource.test.js ok');
