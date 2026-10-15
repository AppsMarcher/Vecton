import { test } from "node:test";
import assert from "node:assert/strict";
import { criarResolvedor } from "../src/territorio.js";
import { janelaMeses, intervaloMes, agora } from "../src/util.js";
import { montarSql, normalizarLinha, hashDasLinhas, paraLinhaImport, resumir } from "../src/jobs/vendas.js";

const regioes = [
  { municipio: "RIO VERDE", uf: "GO", regional: "GO_MG SUL" },
  { municipio: "SAO GABRIEL DO OESTE", uf: "MS", regional: "MS" },
  { municipio: "SAO GABRIEL DO OESTE", uf: "MS", regional: "DUPLICADO" },
  { municipio: "Itapecerica", uf: "MG", regional: "GO_MG SUL" }
];
const resolver = criarResolvedor(regioes);

test("territorio: casa exato sem diferenciar maiusculas", () => {
  assert.equal(resolver({ cidade: "rio verde", uf: "go", vend: "" }), "GO_MG SUL");
});
test("territorio: usa o primeiro quando o municipio se repete", () => {
  assert.equal(resolver({ cidade: "SAO GABRIEL DO OESTE", uf: "MS", vend: "" }), "MS");
});
test("territorio: cidade truncada casa por prefixo na mesma UF", () => {
  assert.equal(resolver({ cidade: "SAO GABRIEL DO OES", uf: "MS", vend: "" }), "MS");
  assert.equal(resolver({ cidade: "SAO GABRIEL DO OES", uf: "GO", vend: "" }), "");
});
test("territorio: vendedores fixos tem prioridade", () => {
  assert.equal(resolver({ cidade: "X", uf: "SP", vend: "000274" }), "GO_MG NORTE");
  assert.equal(resolver({ cidade: "X", uf: "SP", vend: "000590" }), "GO_MG SUL");
});
test("territorio: nao encontrado ou cidade vazia retorna vazio", () => {
  assert.equal(resolver({ cidade: "NAO EXISTE", uf: "GO", vend: "" }), "");
  assert.equal(resolver({ cidade: "", uf: "GO", vend: "" }), "");
});

test("janela de meses: so o corrente por padrao e virada de ano", () => {
  assert.deepEqual(janelaMeses({ ano: 2026, mes: 10 }), [{ ano: 2026, mes: 10 }]);
  assert.deepEqual(janelaMeses({ ano: 2026, mes: 1 }, 1, 1), [{ ano: 2025, mes: 12 }, { ano: 2026, mes: 1 }, { ano: 2026, mes: 2 }]);
});
test("intervalo do mes cobre do dia 1 ao ultimo dia", () => {
  assert.deepEqual(intervaloMes({ ano: 2026, mes: 2 }), { ini: "20260201", fim: "20260228" });
  assert.deepEqual(intervaloMes({ ano: 2024, mes: 2 }), { ini: "20240201", fim: "20240229" });
  assert.deepEqual(intervaloMes({ ano: 2026, mes: 10 }), { ini: "20261001", fim: "20261031" });
});
test("agora respeita o fuso informado", () => {
  const t = agora("America/Sao_Paulo", new Date("2026-10-15T02:30:00Z"));
  assert.equal(t.data, "2026-10-14");
  assert.equal(t.hhmm, "23:30");
});

test("montarSql substitui todos os placeholders", () => {
  const sql = montarSql({ cfops_saida: ["5101", 5102], cfops_devol: ["1201"] }, { ini: "20261001", fim: "20261031" });
  assert.ok(!sql.includes("{{"), "sobrou placeholder");
  assert.ok(sql.includes("D2.D2_EMISSAO >= '20261001'"));
  assert.ok(sql.includes("IN ('5101', '5102')"));
  assert.ok(sql.includes("D1.D1_CF)) IN ('1201')"));
  assert.ok(sql.includes("Acessórios"), "acentos preservados");
});
test("montarSql exige CFOPs configurados", () => {
  assert.throws(() => montarSql({ cfops_saida: [], cfops_devol: ["1201"] }, { ini: "a", fim: "b" }), /cfops/);
});

const bruta = { origem: "FAT", tipo: "Máquinas", data: new Date("2026-10-05T00:00:00Z"), documento: " 123 ", cod_produto: "P1", cod_cliente: "C1", cod_vendedor: "000599", qtd: 2, valor: 1000.456, RL: 800, MP: 200, Cidade: "Rio Verde", UF: "go", vend: "" };

test("normalizarLinha: limpa textos, arredonda e resolve territorio", () => {
  const l = normalizarLinha(bruta, resolver);
  assert.equal(l.data, "2026-10-05");
  assert.equal(l.documento, "123");
  assert.equal(l.uf, "GO");
  assert.equal(l.fat, 1000.46);
  assert.equal(l.territorio, "GO_MG SUL");
});
test("paraLinhaImport calcula MB = MP/RL e deixa nula sem RL", () => {
  const l = normalizarLinha(bruta, resolver);
  assert.equal(paraLinhaImport(l, "b", 1, "arq").mb_pct, 0.25);
  assert.equal(paraLinhaImport({ ...l, rl: 0 }, "b", 1, "arq").mb_pct, null);
  assert.equal(paraLinhaImport({ ...l, rl: null, mp: null }, "b", 1, "arq").mb_pct, null);
});
test("hash independe da ordem das linhas e muda com os valores", () => {
  const a = normalizarLinha(bruta, resolver);
  const b = normalizarLinha({ ...bruta, documento: "999" }, resolver);
  assert.equal(hashDasLinhas([a, b]), hashDasLinhas([b, a]));
  assert.notEqual(hashDasLinhas([a, b]), hashDasLinhas([a, { ...b, fat: 1 }]));
});
test("resumir conta FAT/CART e pendencias de territorio", () => {
  const l = normalizarLinha({ ...bruta, Cidade: "Nada", UF: "SP" }, resolver);
  const r = resumir([l, { ...l, origem: "CART", tipo: "Peças" }]);
  assert.deepEqual([r.resumo.total, r.resumo.fat, r.resumo.cart, r.resumo.semTerritorio], [2, 1, 1, 1]);
});
