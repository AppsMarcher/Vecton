const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/modules/reports/reportsComercialMargensModule.js'), 'utf8'), context);
const calculate = context.window.VECTON_COMERCIAL_MARGENS.calculateMarginBridge;
const cell = (q, price = 100, cost = 60) => ({ q, rl: q * price, mp: q * cost });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function bridge(pairs) {
  const rows = calculate(pairs.map(([a, b, kind]) => ({ a, b, kind })));
  rows.forEach(r => near(r.M0 + r.vol + r.mix + r.pr + r.co, r.M1));
  return Object.fromEntries(['vol', 'mix', 'pr', 'co'].map(k => [k, rows.reduce((t, r) => t + r[k], 0)]));
}
// Volume alone must create no fictitious mix or cost effect.
let b = bridge([[cell(10), cell(12)]]);
near(b.vol, 80); near(b.mix, 0);
// Composition: same total units, shift toward the higher-margin machine = pure mix.
b = bridge([[cell(10), cell(15)], [cell(10, 100, 80), cell(5, 100, 80)]]);
near(b.vol, 0); near(b.mix, 100); near(b.pr, 0); near(b.co, 0);
// Simultaneous proportional growth, price increase and cost increase.
b = bridge([[cell(10), cell(12, 110, 65)], [cell(20), cell(24, 110, 65)]]);
near(b.vol, 240); near(b.mix, 0); near(b.pr, 360); near(b.co, -180);
// New machines have no comparable base (go to mix); disappearance is a volume loss.
b = bridge([[cell(10), cell(0)], [cell(0), cell(5)]]);
near(b.vol, -400); near(b.mix, 200);
// Parts are one block measured in RL: a huge change in cheap parts must not reweight machines.
b = bridge([[cell(10, 100000, 60000), cell(10, 100000, 60000)], [cell(10000, 2, 1), cell(100, 2, 1), 'B']]);
near(b.vol, -9900); near(b.mix, 0); near(b.pr, 0); near(b.co, 0);
// Parts block: volume = dRL x previous MC1%, price = 0, MP = change in MP/RL.
b = bridge([[{ q: 50, rl: 1000, mp: 600 }, { q: 10, rl: 1200, mp: 780 }, 'B']]);
near(b.vol, 80); near(b.pr, 0); near(b.co, -60); near(b.mix, 0);
// Returns, financial adjustments with zero quantity and an entirely new portfolio.
bridge([[cell(10), cell(-2)]]);
bridge([[cell(0), { q: 0, rl: -50, mp: -20 }]]);
b = bridge([[cell(0), cell(5)]]);
near(b.vol, 0); near(b.mix, 200);
bridge([]);
console.log('Margin bridge tests passed');
