import { test } from "node:test";
import assert from "node:assert/strict";
import { intervaloBp, montarSql, normalizarLinha, resumir, hashDasLinhas, montarLinhasBP } from "../src/jobs/bp.js";
import { mesAberto, JOBS } from "../src/runner.js";

test("bp: intervalo traz inicio, fim e o fim do mes anterior (virada de ano e bissexto)", () => {
  assert.deepEqual(intervaloBp({ ano: 2026, mes: 9 }), { ini: "20260901", fim: "20260930", fimAnterior: "20260831" });
  assert.deepEqual(intervaloBp({ ano: 2026, mes: 1 }), { ini: "20260101", fim: "20260131", fimAnterior: "20251231" });
  assert.equal(intervaloBp({ ano: 2024, mes: 3 }).fimAnterior, "20240229");
});
test("bp: montarSql troca todos os placeholders e usa a faixa padrao da planilha", () => {
  const sql = montarSql({}, { ano: 2026, mes: 9 });
  assert.ok(!sql.includes("{{"), "sobrou placeholder");
  assert.ok(sql.includes("CQ0_DATA <= '20250831'") === false && sql.includes("CQ0_DATA <= '20260831'"));
  assert.equal(sql.split("CT2_DATA >= '20260901'").length - 1, 2);
  assert.equal(sql.split("CT2_DATA <= '20260930'").length - 1, 2);
  assert.ok(sql.includes("BETWEEN '1' AND '2zzzzzzzzzzzzzzzz'"));
  assert.ok(sql.includes("OPTION (MAXRECURSION 100)"));
});
test("bp: montarSql recusa faixa com caracteres perigosos", () => {
  assert.throws(() => montarSql({ conta_de: "1'; drop table x;--" }, { ano: 2026, mes: 9 }), /invalidos/);
});

test("bp: normalizarLinha limpa texto, arredonda e padroniza o tipo", () => {
  const l = normalizarLinha({ CONTA: " 1.1.1.01.001 ", "NOME DA CONTA": "BANCO ", SALDO: 1234.567, TIPO_CONTA: "ANALITICA" });
  assert.deepEqual(l, { conta: "1.1.1.01.001", nome: "BANCO", saldo: 1234.57, tipo: "ANALITICA" });
  assert.equal(normalizarLinha({ CONTA: "1", SALDO: 0, TIPO_CONTA: "Sintética" }).tipo, "SINTETICA");
});

const plano = [
  { id: "p", account_code: "1.1", name: "Circulante", node_class: "Sintetica", group_key: null, active: true },
  { id: "a1", account_code: "1.1.01", name: "Bancos", node_class: "Analitica", group_key: "Caixa", active: true },
  { id: "a2", account_code: "1.1.02", name: "Clientes", node_class: "Analitica", group_key: "Clientes", active: true },
  { id: "a3", account_code: "1.1.03", name: "Inativa", node_class: "Analitica", group_key: "X", active: false },
  { id: "a4", account_code: "1.1.04", name: "Sem chave", node_class: "Analitica", group_key: "", active: true }
];
const L = (conta, saldo, tipo = "ANALITICA", nome = "N") => ({ conta, nome, saldo, tipo });

test("bp: grava so analiticas e ignora sinteticas", () => {
  const r = montarLinhasBP([L("1.1", 150, "SINTETICA"), L("1.1.01", 100), L("1.1.02", 50)], plano);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.rows, [{ account_id: "a1", amount: 100 }, { account_id: "a2", amount: 50 }]);
});
test("bp: conta fora do plano, tipo divergente, duplicada, inativa e sem chave bloqueiam", () => {
  const r = montarLinhasBP([L("9.9.99", 1), L("1.1.01", 1, "SINTETICA"), L("1.1.02", 1), L("1.1.02", 2), L("1.1.03", 5), L("1.1.04", 5)], plano);
  assert.deepEqual(r.erros.map((e) => e.validation_errors[0]), [
    "Conta inexistente no Plano BP", "O tipo da conta difere do Plano BP", "Conta duplicada na extracao",
    "Conta inativa no Plano BP", "Conta sem chave agrupadora no Plano BP"
  ]);
  assert.equal(r.erros[0].resumo, "conta 9.9.99 · N");
  assert.deepEqual(r.rows, [{ account_id: "a2", amount: 1 }]);
});
test("bp: contas do plano ausentes na extracao nao entram (carga completa, nao aditiva)", () => {
  assert.deepEqual(montarLinhasBP([L("1.1.02", 7)], plano).rows, [{ account_id: "a2", amount: 7 }]);
});

test("bp: resumo conta so analiticas e o hash independe da ordem", () => {
  const ls = [L("1.1", 150, "SINTETICA"), L("1.1.01", 100), L("1.1.02", 50)];
  const r = resumir(ls);
  assert.deepEqual([r.resumo.total, r.resumo.sinteticas, r.resumo.linhasProtheus], [2, 1, 3]);
  assert.equal(hashDasLinhas(ls), hashDasLinhas([...ls].reverse()));
  assert.notEqual(hashDasLinhas(ls), hashDasLinhas([ls[0], ls[1], L("1.1.02", 51)]));
});

test("bp: so aceita mes fechado; outros jobs nao tem essa trava", () => {
  const hoje = { ano: 2026, mes: 10 };
  assert.equal(mesAberto(JOBS.bp, { ano: 2026, mes: 9 }, hoje), false);
  assert.equal(mesAberto(JOBS.bp, { ano: 2026, mes: 10 }, hoje), true);
  assert.equal(mesAberto(JOBS.bp, { ano: 2026, mes: 11 }, hoje), true);
  assert.equal(mesAberto(JOBS.vendas, { ano: 2026, mes: 10 }, hoje), false);
});

import { aplicarMes } from "../src/jobs/bp.js";

// Vecton de mentira: registra as chamadas e devolve o que a tela receberia.
function falsoSb({ falhaAplicar = false, gravado = null } = {}) {
  const chamadas = [];
  return {
    chamadas,
    selectAll: async () => plano,
    select: async (t) => (t === "bp_import_drafts" ? [{ id: "d0", revision: 3 }] : [{ rows: gravado ?? [{ account_id: "a1", amount: 100 }, { account_id: "a2", amount: 50 }] }]),
    rpc: async (fn, args) => {
      chamadas.push([fn, args]);
      if (fn === "bp_apply_draft" && falhaAplicar) throw new Error("O Plano BP mudou");
      return fn === "bp_save_draft" ? "rasc1" : fn === "bp_apply_draft" ? "lote1" : null;
    }
  };
}
const execucao = (sb, linhas) => {
  const logs = [];
  const base = { sb, orgId: "org", params: {}, mes: { ano: 2026, mes: 9 }, rotulo: "2026-09", hhmm: "10:00", extraido: { linhas }, detalhes: {}, log: async (x) => logs.push(x), gravarCopia: null };
  return { base, logs };
};

test("bp: aplicarMes salva o rascunho, aplica e confere o fechamento gravado", async () => {
  const sb = falsoSb();
  const { base, logs } = execucao(sb, [L("1.1", 150, "SINTETICA"), L("1.1.01", 100), L("1.1.02", 50)]);
  const r = await aplicarMes(base);
  assert.equal(r.status, "ok");
  assert.deepEqual(sb.chamadas.map((c) => c[0]), ["bp_delete_batch", "bp_save_draft", "bp_apply_draft"]);
  const salvar = sb.chamadas[1][1];
  assert.deepEqual([salvar.p_year, salvar.p_month, salvar.p_source, salvar.p_scenario, salvar.p_file], [2026, 9, "actual", null, "Protheus BP 2026-09 10:00"]);
  assert.equal(salvar.p_rows.length, 2);
  assert.deepEqual(sb.chamadas[2][1], { p_org: "org", p_id: "rasc1", p_revision: 1 });
  assert.equal(logs[0].status, "ok");
  assert.equal(logs[0].batch_id, "lote1");
});
test("bp: conta fora do plano bloqueia antes de gravar qualquer coisa", async () => {
  const sb = falsoSb();
  const { base, logs } = execucao(sb, [L("9.9.99", 10), L("1.1.01", 100)]);
  const r = await aplicarMes(base);
  assert.equal(r.status, "erro");
  assert.equal(sb.chamadas.length, 0);
  assert.equal(logs[0].detalhes.primeiros_erros[0].resumo, "conta 9.9.99 · N");
});
test("bp: falha ao aplicar vira erro no log e mantem o rascunho", async () => {
  const sb = falsoSb({ falhaAplicar: true });
  const { base, logs } = execucao(sb, [L("1.1.01", 100)]);
  const r = await aplicarMes(base);
  assert.equal(r.status, "erro");
  assert.match(logs[0].mensagem, /O Plano BP mudou.*rascunho rasc1/);
});
test("bp: fechamento gravado diferente do enviado nao e dado como aplicado", async () => {
  const sb = falsoSb({ gravado: [{ account_id: "a1", amount: 99 }] });
  const { base, logs } = execucao(sb, [L("1.1.01", 100)]);
  assert.equal((await aplicarMes(base)).status, "erro");
  assert.match(logs[0].mensagem, /fechamento gravado/);
});
