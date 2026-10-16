import { test } from "node:test";
import assert from "node:assert/strict";
import { montarSql, normalizarFilial, normalizarLinha, paraLinhaImport, resumir, hashDasLinhas, descreverErro } from "../src/jobs/dre.js";
import { agruparErros } from "../src/erros.js";

test("dre: montarSql troca todos os placeholders e usa a faixa padrao da planilha", () => {
  const sql = montarSql({}, { ini: "20261001", fim: "20261031" });
  assert.ok(!sql.includes("{{"), "sobrou placeholder");
  assert.equal(sql.split("BETWEEN '20261001' AND '20261031'").length - 1, 2);
  assert.ok(sql.includes("BETWEEN '3' AND '4zzzzzzzzzzzzzzzz'"));
  assert.ok(sql.includes("CT2_TPSALD = '1'") && sql.includes("CT2_MOEDLC = '01'"));
});
test("dre: montarSql usa a faixa configurada e recusa caracteres perigosos", () => {
  assert.ok(montarSql({ conta_de: "31", conta_ate: "39zzz" }, { ini: "a", fim: "b" }).includes("BETWEEN '31' AND '39zzz'"));
  assert.throws(() => montarSql({ conta_de: "3'; drop table x;--" }, { ini: "a", fim: "b" }), /invalidos/);
});

test("dre: normalizarFilial segue a regra da tela (digitos, ate 2 posicoes)", () => {
  assert.equal(normalizarFilial("01"), "01");
  assert.equal(normalizarFilial(" 02 "), "02");
  assert.equal(normalizarFilial("1"), "1");
  assert.equal(normalizarFilial("010"), "01");
  assert.equal(normalizarFilial(""), "0");
});

const bruta = { CONTA: "31101001", DATA: "20261014", "LOTE/SUB/DOC/LINHA": "008820/001/000001/001", HISTORICO: " VLR VENDA NF. 000044077/001 ", "FILIAL DE ORIGEM": "01", "C CUSTO": "", VALOR: -223030.004 };

test("dre: normalizarLinha converte data, limpa codigos e arredonda o valor", () => {
  const l = normalizarLinha(bruta);
  assert.deepEqual(l, { conta: "31101001", data: "2026-10-14", lote: "008820/001/000001/001", historico: "VLR VENDA NF. 000044077/001", filial: "01", cc: "", valor: -223030 });
});
test("dre: normalizarLinha aceita Date e nomes de coluna em outra caixa", () => {
  const l = normalizarLinha({ conta: "4.1.01-2", data: new Date("2026-10-05T00:00:00Z"), valor: 10.555, "c custo": " 1234 ", "filial de origem": "2" });
  assert.equal(l.conta, "4101" + "2");
  assert.equal(l.data, "2026-10-05");
  assert.equal(l.cc, "1234");
  assert.equal(l.filial, "2");
  assert.equal(l.valor, 10.56);
});
test("dre: paraLinhaImport usa as colunas de actuals_import_rows e nulos para vazio", () => {
  const r = paraLinhaImport(normalizarLinha(bruta), "lote-1", 7, "arq");
  assert.equal(r.batch_id, "lote-1");
  assert.equal(r.row_number, 7);
  assert.equal(r.entry_date, "2026-10-14");
  assert.equal(r.branch_code, "01");
  assert.equal(r.account_number, "31101001");
  assert.equal(r.cost_center_number, null);
  assert.equal(r.lot_code, "008820/001/000001/001");
  assert.equal(r.amount, -223030);
});
test("dre: hash independe da ordem; resumir soma o saldo e conta pendencias", () => {
  const a = normalizarLinha(bruta);
  const b = normalizarLinha({ ...bruta, CONTA: "41101001", VALOR: 1000, "C CUSTO": "55" });
  assert.equal(hashDasLinhas([a, b]), hashDasLinhas([b, a]));
  assert.notEqual(hashDasLinhas([a, b]), hashDasLinhas([a, { ...b, valor: 1 }]));
  const r = resumir([a, b, { ...a, conta: "" }]);
  assert.equal(r.resumo.total, 3);
  assert.equal(r.resumo.semConta, 1);
  assert.equal(r.resumo.semCentroDeCusto, 2);
  assert.equal(r.resumo.saldo, -445060);
});

test("erros: agruparErros junta linhas com o mesmo motivo e conta as ocorrencias", () => {
  const linhas = [
    { row_number: 1, account_number: "31101099", cost_center_number: "", branch_code: "01", validation_errors: ["Conta nao cadastrada"] },
    { row_number: 2, account_number: "31101099", cost_center_number: "", branch_code: "01", validation_errors: ["Conta nao cadastrada"] },
    { row_number: 3, account_number: "31101099", cost_center_number: "", branch_code: "01", validation_errors: ["Conta nao cadastrada"] },
    { row_number: 4, account_number: "41101001", cost_center_number: "9", branch_code: "02", validation_errors: ["Centro de custos nao cadastrado"] }
  ];
  const g = agruparErros(linhas, descreverErro, 20);
  assert.equal(g.length, 2);
  assert.equal(g[0].ocorrencias, 3);
  assert.equal(g[0].resumo, "conta 31101099 · CC - · filial 01");
  assert.equal(g[1].ocorrencias, 1);
  assert.equal(agruparErros(linhas, descreverErro, 1).length, 1);
});
