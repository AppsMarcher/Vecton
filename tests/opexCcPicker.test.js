const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/modules/reports/opexCcPicker.js'), 'utf8');
globalThis.window = {};
vm.runInThisContext(source);
const picker = globalThis.window.VECTON_OPEX_CC_PICKER;

const centers = [
  { id: 'a1', number: '2201', name: 'Contabilidade', management: 'Controladoria' },
  { id: 'a2', number: '2202', name: 'Fiscal', management: 'Controladoria' },
  { id: 'a3', number: '2203', name: 'Tesouraria', management: 'Controladoria' },
  { id: 'b1', number: '3101', name: 'Linha 1', management: 'Industrial' },
  { id: 'b2', number: '3102', name: 'Linha 2', management: 'Industrial' }
];

const tree = picker.buildTree(centers, ['Marcher', 'Controladoria', 'Industrial']);
assert.deepEqual(tree.map((g) => [g.mgmt, g.ccs.length]), [['Controladoria', 3], ['Industrial', 2]], 'Marcher não vira gestão na árvore');

const partial = new Map([['Controladoria', ['a1', 'a3']]]);
assert.deepEqual(picker.buildTree(centers, ['Controladoria'], partial)[0].ccs.map((c) => c.id), ['a1', 'a3'], 'acesso parcial limita os CCs');

assert.deepEqual(picker.resolveSelection(tree, ['a1', 'a2', 'a3', 'b1', 'b2'], true), { mgmt: 'Marcher', customIds: null }, 'tudo marcado = Marcher');
assert.deepEqual(picker.resolveSelection(tree, ['b1', 'b2'], true), { mgmt: 'Industrial', customIds: null }, 'gestão inteira não vira lista de CCs');
assert.deepEqual(picker.resolveSelection(tree, ['a2', 'b1'], true), { mgmt: 'Controladoria', customIds: ['a2', 'b1'] }, 'mistura vira lista de CCs');
assert.equal(picker.resolveSelection(tree, ['a1', 'a2', 'a3', 'b1', 'b2'], false).customIds.length, 5, 'sem Marcher, tudo marcado continua lista');

const base = { selectedMgmt: 'Marcher', partialMgmts: new Map(), locked: false };
const custom = picker.applyCustom(base, ['a2'], tree);
assert.equal(custom.selectedMgmt, 'Controladoria · 2202');
assert.deepEqual(custom.partialMgmts.get('Controladoria · 2202'), ['a2'], 'a lista entra como gestão parcial');
assert.equal(base.partialMgmts.size, 0, 'não altera o mapa original');
assert.equal(picker.applyCustom(base, ['zz'], tree).selectedMgmt, 'Marcher', 'IDs fora do acesso são ignorados');
assert.equal(picker.customLabel(tree, ['a1', 'a2']), 'Controladoria · 2 CCs');
assert.equal(picker.customLabel(tree, ['a1', 'b1', 'b2']), '2 gestões · 3 CCs');

assert.deepEqual([...picker.currentIds(tree, { selectedMgmt: 'Industrial' })], ['b1', 'b2']);
assert.equal(picker.currentIds(tree, { selectedMgmt: 'Marcher' }).size, 5);

const panel = { dataset: {} };
picker.writeCustom(panel, ['a1', 'b2']);
assert.deepEqual(picker.readCustom(panel), ['a1', 'b2']);
picker.writeCustom(panel, null);
assert.equal(picker.readCustom(panel), null);

console.log('opexCcPicker ok');
