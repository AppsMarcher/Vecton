const assert = require('node:assert/strict');
const fs = require('node:fs');

const fonte = fs.readFileSync('src/modules/reports/reportsComercialPecasGeoModule.js', 'utf8');
const linhaValor = fonte.split('\n').find((l) => l.includes('title:"Valor de Peças"'));
assert.ok(linhaValor, 'glossario: entrada "Valor de Peças" nao encontrada');

// A carteira passou a ser a foto mais recente dos pedidos em aberto, distribuida pela data de entrega prevista.
assert.ok(!/mês de referência/.test(linhaValor), 'nao pode mais falar em "mês de referência"');
assert.ok(!/último mês com carga/.test(linhaValor), 'nao pode mais falar em "último mês com carga"');
assert.ok(!/já virou faturamento/.test(linhaValor), 'a justificativa antiga (carteira anterior virou faturamento) nao vale mais');
assert.ok(/foto mais recente/.test(linhaValor), 'deve explicar que a carteira e a foto mais recente');
assert.ok(/data de entrega/.test(linhaValor), 'deve explicar a distribuicao pela data de entrega');
assert.ok(/não é comparada/.test(linhaValor), 'deve avisar que a carteira nao e comparada com o periodo anterior');
console.log('comercialPecasGeoCarteiraTexto.test: ok');
