(function (global) {
  'use strict';
  // Cálculo do FAT (projeção de vendas): puro, sem DOM nem servidor.
  // O servidor repete a mesma conta em planning_fat_calculate; os dois são testados com os mesmos números.
  const TAX_KEYS = ['ipi', 'icms', 'pis', 'cofins'];
  const ZERO = () => ({ q: 0, fat: 0, rl: 0, mp: 0 });

  function taxSum(tax) { return TAX_KEYS.reduce((sum, key) => sum + Number((tax || {})[key] || 0), 0); }

  // Ajuste do admin vence o histórico; depois o território; depois a média Marcher.
  function resolvePremise(local, marcher) {
    if (local) return { fat_unit: local.fat_unit, mp_unit: local.mp_unit, origin: local.adjusted ? 'adjusted' : 'local' };
    if (marcher) return { fat_unit: marcher.fat_unit, mp_unit: marcher.mp_unit, origin: 'marcher' };
    return { fat_unit: null, mp_unit: null, origin: null };
  }

  // opts.exportation: sem impostos (RL = FAT). opts.fatDriven: Peças, o valor digitado é o FAT e VOL = 1.
  function cell(premise, tax, volume, opts = {}) {
    const amount = Number(volume || 0);
    if (!premise || premise.fat_unit == null || !amount) return ZERO();
    const fat = amount * premise.fat_unit;
    return { q: opts.fatDriven ? 1 : amount, fat, rl: opts.exportation ? fat : fat * (1 - taxSum(tax) / 100), mp: amount * premise.mp_unit };
  }
  const add = (a, b) => ({ q: a.q + b.q, fat: a.fat + b.fat, rl: a.rl + b.rl, mp: a.mp + b.mp });
  const mc1 = c => (c.rl ? (c.rl - c.mp) / c.rl : null);
  // Valores unitários (total ÷ volume), como no Evolutivo de Margens; sem volume não há valor.
  function metric(c, key) {
    if (key === 'vol') return c.q;
    if (key === 'mb') return mc1(c);
    return c.q ? c[key] / c.q : null;
  }

  // Terceiro bloco (Faturamento | Impostos | Matéria-prima). parts: {maq, tra, ace, exp, pec}, cada um com 12 células
  // (em exp o RL já é igual ao FAT). Os impostos são FAT × %, direto; Exportação não tem imposto.
  // Acessórios (ace) vai na mesma conta de Peças (31101006), com a própria linha de impostos.
  function dreLines(source, taxes) {
    const months = Array.from({ length: 12 }, (_, j) => j);
    const parts = { ...source, ace: source.ace || months.map(ZERO) };
    const col = fn => months.map(fn);
    const taxOf = (list, line, key) => col(j => (list ? list[j].fat * Number((taxes[line] || {})[key] || 0) / 100 : 0));
    const sumCols = (...arrays) => col(j => arrays.reduce((s, a) => s + a[j], 0));
    const accounts = {
      '31101001': col(j => parts.maq[j].fat), '31101002': col(j => parts.exp[j].fat),
      '31101006': col(j => parts.pec[j].fat + parts.ace[j].fat), '31101007': col(j => parts.tra[j].fat)
    };
    const tax = key => sumCols(taxOf(parts.maq, 'maq', key), taxOf(parts.tra, 'tra', key), taxOf(parts.ace, 'ace', key), taxOf(parts.pec, 'pec', key));
    accounts['31203001'] = tax('ipi'); accounts['31203002'] = tax('icms'); accounts['31203004'] = tax('cofins'); accounts['31203005'] = tax('pis');
    const fat = sumCols(accounts['31101001'], accounts['31101002'], accounts['31101006'], accounts['31101007']);
    const imposto = sumCols(accounts['31203001'], accounts['31203002'], accounts['31203004'], accounts['31203005']);
    const rl = col(j => fat[j] - imposto[j]);
    const mp = col(j => parts.maq[j].mp + parts.tra[j].mp + parts.ace[j].mp + parts.exp[j].mp + parts.pec[j].mp);
    accounts['412010901'] = mp;
    return { accounts, fat, imposto, rl, mp, mpPct: col(j => (rl[j] ? mp[j] / rl[j] : null)) };
  }

  global.VECTON_PLANNING_FAT_CORE = { taxSum, resolvePremise, cell, add, metric, mc1, dreLines };
})(window);
