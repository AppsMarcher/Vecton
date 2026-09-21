// Valores inteiramente sintéticos. Nenhum dado financeiro da empresa é publicado.
const structure = require('./fcPlanSeed.json');
function matrix(year = 2026) {
  const rows = Array.from({ length: 94 }, () => Array(13).fill(null));
  rows[1] = [null, ...Array.from({ length: 12 }, (_, i) => new Date(year, i, 1))];
  rows[2] = [null, ...Array.from({ length: 12 }, (_, i) => i < 8 ? 'ACT' : i < 11 ? 'FCST' : 'BUD')];
  const movements = {};
  for (const n of structure.filter(n => n.node_class === 'Analitica')) {
    const values = Array.from({ length: 12 }, (_, i) => {
      if (n.seed_key === 'linha-12') return 7200000 + Math.sin(i) * 600000;
      if (n.parent_key === 'entradas') return 10000;
      if (n.seed_key === 'linha-19') return -3400000 - (i === 9 ? 2000000 : 0);
      if (n.seed_key === 'linha-26') return -1100000;
      return -40000 - i * 1500;
    });
    rows[n.source_row - 1] = [n.name, ...values]; movements[n.seed_key] = values;
  }
  const groupRows = [[10,'Entradas Operacionais'],[18,'Saídas Operacionais'],[30,'COMISSOES'],[48,'SERVIÇOS DE TERCEIROS'],[56,'IMPOSTOS / TAXAS'],[70,'Fluxo de Caixa Operacional'],[77,'Fluxo de Caixa de Investimentos'],[93,'Fluxo de Caixa Financeiro'],[94,'Fluxo de Caixa Líquido']];
  for (const [row, name] of groupRows) rows[row - 1] = [name, ...Array(12).fill(999)]; // subtotais salvos deliberadamente incorretos
  const net = Object.values(movements).reduce((s, a) => s + a[0], 0);
  rows[3] = ['Maquinas Vendidas', ...Array(12).fill(42)];
  rows[5] = ['SALDOS BANCÁRIOS', 8000000 + net, ...Array(11).fill(999)];
  rows[7] = ['GERAÇÃO LIQUIDA DE CAIXA', ...Array(12).fill(999)];
  return rows;
}
module.exports = { matrix };
