const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/core/scenarioSources.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
// Objetos criados dentro do vm têm outro protótipo; compara via JSON.
const plain = (v) => JSON.parse(JSON.stringify(v));
const {
  withYearSuffix,
  buildSourceOptions,
  parseSource,
  resolveDefaultSource,
  resolveLegacyBudget
} = sandbox.window.VECTON_SCENARIO_SOURCES;

// withYearSuffix
assert.equal(withYearSuffix('Fcst 5+7', 2026), 'Fcst 5+7 2026');
assert.equal(withYearSuffix('Budget 2026', 2026), 'Budget 2026');
assert.equal(withYearSuffix('  Budget Rev 1  ', 2027), 'Budget Rev 1 2027');
assert.equal(withYearSuffix('Cenário 2025', 2026), 'Cenário 2025 2026');

const scenarios = [
  { id: 'a', name: 'Budget 2026', reference_year: 2026, is_default: false },
  { id: 'b', name: 'Fcst 5+7 2026', reference_year: 2026, is_default: true },
  { id: 'c', name: 'Budget 2027', reference_year: 2027, is_default: false }
];

// buildSourceOptions: Real primeiro (ano desc), depois cenários (ano desc, nome)
const opts = buildSourceOptions({ scenarios, realYears: [2025, 2026] });
assert.deepEqual(
  plain(opts.map((o) => o.value)),
  ['real:2026', 'real:2025', 'scenario:c', 'scenario:a', 'scenario:b']
);
assert.deepEqual(
  plain(opts.map((o) => o.label)),
  ['Real 2026', 'Real 2025', 'Budget 2027', 'Budget 2026', 'Fcst 5+7 2026']
);
assert.equal(opts[0].kind, 'real');
assert.equal(opts[2].kind, 'scenario');
assert.equal(opts[2].year, 2027);

// sem anos de Real não gera opção real:
assert.equal(
  buildSourceOptions({ scenarios, realYears: [] }).some((o) => o.value.startsWith('real:')),
  false
);

// parseSource
assert.deepEqual(plain(parseSource('real:2026')), { kind: 'real', year: 2026 });
assert.deepEqual(plain(parseSource('scenario:abc')), { kind: 'scenario', id: 'abc' });
assert.deepEqual(plain(parseSource('budget')), { kind: 'legacyBudget' });
assert.equal(parseSource(''), null);
assert.equal(parseSource(null), null);
assert.equal(parseSource('xyz'), null);

// resolveLegacyBudget
assert.equal(resolveLegacyBudget(scenarios, 2027), 'scenario:c');
assert.equal(resolveLegacyBudget(scenarios, 2030), null);

// resolveDefaultSource: estrela de ano diferente do toggle vale
assert.equal(
  resolveDefaultSource({ scenarios, realYears: [2026], toggleYear: 2027 }),
  'scenario:b'
);
// sem estrela: Budget do ano do toggle
const semEstrela = scenarios.map((s) => ({ ...s, is_default: false }));
assert.equal(
  resolveDefaultSource({ scenarios: semEstrela, realYears: [2026], toggleYear: 2027 }),
  'scenario:c'
);
// sem estrela e sem Budget do ano: Real do ano do toggle
assert.equal(
  resolveDefaultSource({ scenarios: semEstrela, realYears: [2026], toggleYear: 2030 }),
  'real:2030'
);

// chooseSource: opções + valor a assumir
const { chooseSource } = sandbox.window.VECTON_SCENARIO_SOURCES;
const base = { scenarios, realYears: [2026], toggleYear: 2027 };
// valor atual válido é mantido
assert.equal(chooseSource({ ...base, current: 'real:2026' }).value, 'real:2026');
// nulo -> estrela global (de outro ano)
assert.equal(chooseSource({ ...base, current: null }).value, 'scenario:b');
// legado "budget" -> Budget do ano do toggle
assert.equal(chooseSource({ ...base, current: 'budget' }).value, 'scenario:c');
// valor que deixou de existir -> padrão
assert.equal(chooseSource({ ...base, current: 'scenario:removido' }).value, 'scenario:b');
// includeReal=false: sem opções real: e padrão nunca é Real
const semReal = chooseSource({ scenarios: semEstrela, realYears: [2026], toggleYear: 2030, current: null, includeReal: false });
assert.equal(plain(semReal.options).some((o) => o.value.startsWith('real:')), false);
assert.equal(semReal.value, 'scenario:c', 'sem estrela/Budget do ano: primeira opção disponível');
// sem nenhuma fonte: valor nulo e sem opções
const vazio = chooseSource({ scenarios: [], realYears: [], toggleYear: 2027, current: null });
assert.equal(vazio.value, null);
assert.equal(vazio.options.length, 0);

console.log('scenarioSources.test.js ok');
