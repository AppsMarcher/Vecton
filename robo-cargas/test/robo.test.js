import { test } from "node:test";
import assert from "node:assert/strict";
import { criarResolvedor } from "../src/territorio.js";
import { janelaMeses, intervaloMes, agora } from "../src/util.js";
import { montarSql, normalizarLinha, hashDasLinhas, paraLinhaImport, resumir, deveIncluirCarteira, excluirCartSemData, mensagemErros } from "../src/jobs/vendas.js";

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

const cfgSql = { cfops_saida: ["5101"], cfops_devol: ["1201"] };
test("montarSql sem carteira nao inclui linhas CART", () => {
  const sql = montarSql(cfgSql, { ini: "20260301", fim: "20260331", incluiCarteira: false });
  assert.ok(sql.includes("AND 1 = 0"), "carteira deveria estar desligada");
  assert.ok(!sql.includes("{{"), "sobrou placeholder");
  assert.ok(sql.includes("D2.D2_EMISSAO >= '20260301'"), "faturamento deve continuar igual");
});
test("montarSql com carteira nao corta por data de entrega", () => {
  const sql = montarSql(cfgSql, { ini: "20261001", fim: "20261031", incluiCarteira: true });
  assert.ok(!sql.includes("AND 1 = 0"));
  assert.ok(!sql.includes("C6.C6_ENTREG >= '"), "nao pode haver corte inferior de entrega");
  assert.ok(!sql.includes("C6.C6_ENTREG <= '"), "nao pode haver corte superior de entrega");
  assert.ok(sql.includes("D2.D2_EMISSAO >= '20261001'"), "faturamento deve continuar igual");
});
test("montarSql sem incluiCarteira informado assume sem carteira", () => {
  const sql = montarSql(cfgSql, { ini: "20261001", fim: "20261031" });
  assert.ok(sql.includes("AND 1 = 0"));
});

test("deveIncluirCarteira so no mes corrente", () => {
  const hoje = { ano: 2026, mes: 10 };
  assert.equal(deveIncluirCarteira({ ano: 2026, mes: 10 }, hoje), true);
  assert.equal(deveIncluirCarteira({ ano: 2026, mes: 9 }, hoje), false);
  assert.equal(deveIncluirCarteira({ ano: 2026, mes: 11 }, hoje), false);
  assert.equal(deveIncluirCarteira({ ano: 2025, mes: 10 }, hoje), false);
  assert.equal(deveIncluirCarteira({ ano: 2025, mes: 12 }, { ano: 2026, mes: 1 }), false);
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

test("excluirCartSemData tira so carteira sem data e conta quantas", () => {
  const fat = normalizarLinha(bruta, resolver);
  const cartOk = { ...fat, origem: "CART", data: "2026-03-10" };
  const cartSem = { ...fat, origem: "CART", data: "" };
  const r = excluirCartSemData([fat, cartOk, cartSem, cartSem]);
  assert.deepEqual(r.linhas, [fat, cartOk]);
  assert.equal(r.semData, 2);
});
test("resumir informa itens de carteira sem data e a entrega mais antiga", () => {
  const fat = normalizarLinha(bruta, resolver);
  const cart = (data) => ({ ...fat, origem: "CART", data });
  const r = resumir([fat, cart("2026-11-05"), cart("2026-03-10")], 3);
  assert.equal(r.resumo.cartSemData, 3);
  assert.equal(r.resumo.cartMaisAntiga, "2026-03-10");
  assert.equal(resumir([fat]).resumo.cartSemData, 0);
  assert.equal(resumir([fat]).resumo.cartMaisAntiga, null);
});

// Linhas reprovadas reais da carga de 26/10/2026 (cadastro faltando em pedidos de carteira futuros).
const reprovada = (n, doc, cli, prod, tipo, valor, erros) => ({ row_number: n, origem: "CART", documento: doc, cod_cliente: cli, cod_produto: prod, tipo_informado: tipo, valor, validation_errors: erros });
const REPROVADAS_REAIS = [
  reprovada(223, "045919", "007821", "0100022", "Acessórios", "1600.00", ["Cliente nao cadastrado"]),
  reprovada(224, "045917", "007821", "0900000", "Máquinas", "87900.00", ["Cliente nao cadastrado"]),
  reprovada(225, "045918", "007821", "09003294", "Acessórios", "9000.00", ["Cliente nao cadastrado"]),
  reprovada(240, "045846", "007624", "210222", "Máquinas", "199588.12", ["Produto nao cadastrado", "Produto MAQUINAS sem cultura definida (corrigir cadastro do produto)"]),
  reprovada(241, "045350", "007783", "0400012", "Máquinas", "209865.65", ["Cliente nao cadastrado"])
];

test("mensagemErros: primeira frase diz o essencial (o card mostra so 160 caracteres)", () => {
  const m = mensagemErros(REPROVADAS_REAIS, { batchId: "1dd62b68-7292-4eff-8b79-087af19c9d34" });
  const primeira = m.split("\n")[0];
  assert.ok(primeira.length <= 140, `primeira frase com ${primeira.length} caracteres`);
  assert.ok(primeira.startsWith("Faltam cadastros: 2 clientes e 1 produto"), primeira);
  assert.ok(primeira.includes("Carregar agora"), "deve dizer o que fazer depois");
});
test("mensagemErros: agrupa por cliente e por produto e diz onde cadastrar", () => {
  const m = mensagemErros(REPROVADAS_REAIS, { batchId: "1dd62b68-7292-4eff-8b79-087af19c9d34" });
  assert.ok(m.includes("Clientes a cadastrar (Parâmetros > Comercial > Clientes)"));
  assert.ok(m.includes("• 007821 — 3 documentos (045917, 045918, 045919) · R$ 98.500"), "documentos em ordem e valor somado");
  assert.ok(m.includes("• 007783 — 1 documento (045350) · R$ 209.866"));
  assert.ok(m.includes("Produtos a cadastrar (Parâmetros > Comercial > Produtos)"));
  assert.ok(m.includes("• 210222 (Máquinas) — 1 documento (045846) · R$ 199.588"));
  assert.ok(m.includes("informe a cultura"), "Máquinas exige cultura no cadastro do produto");
  assert.ok(!m.includes("Produtos sem cultura"), "sem cultura e consequencia do produto faltando, nao um grupo a parte");
  assert.ok(!/Linha 22\d/.test(m) && !m.includes("validation"), "sem jargao tecnico");
  assert.ok(m.includes("1dd62b68"), "id curto do lote para consulta");
  assert.ok(m.length < 1300, `mensagem com ${m.length} caracteres (o sino corta em 1500)`);
});
test("mensagemErros: produto que existe mas esta sem cultura vira grupo proprio", () => {
  const m = mensagemErros([reprovada(1, "9", "C1", "P9", "Máquinas", "10", ["Produto MAQUINAS sem cultura definida (corrigir cadastro do produto)"])], {});
  assert.ok(m.startsWith("Faltam cadastros: 1 produto sem cultura"), m.split("\n")[0]);
  assert.ok(m.includes("Produtos sem cultura"));
  assert.ok(!m.includes("Produtos a cadastrar"));
});
test("mensagemErros: outros motivos aparecem como estao, agrupados", () => {
  const outro = (n, doc) => reprovada(n, doc, "C1", "P1", "Máquinas", "5", ["Territorio nao cadastrado: GO_MG SUL"]);
  const m = mensagemErros([outro(1, "A1"), outro(2, "A2"), reprovada(3, "A3", "C9", "P1", "Peças", "1", ["Cliente nao cadastrado"])], {});
  assert.ok(m.includes("Outros problemas"));
  assert.ok(m.includes("• Territorio nao cadastrado: GO_MG SUL — 2 documentos (A1, A2)"));
  assert.ok(m.split("\n")[0].includes("1 cliente") && m.split("\n")[0].includes("1 outro problema"), m.split("\n")[0]);
});
test("mensagemErros: lista longa e cortada com 'e mais N' e sem lista vazia devolve null", () => {
  const muitos = Array.from({ length: 30 }, (_, i) => reprovada(i + 1, `D${i}`, `C${String(i).padStart(3, "0")}`, "P1", "Máquinas", "100", ["Cliente nao cadastrado"]));
  const m = mensagemErros(muitos, {});
  assert.ok(m.includes("e mais 22 clientes"), "cortou em 8 e avisou");
  assert.ok(m.length < 1300);
  assert.equal(mensagemErros([], {}), null);
});

import { resumirPedido } from "../src/runner.js";

test("resumirPedido: concluido quando todos os meses deram certo", () => {
  const r = resumirPedido([{ job: "vendas", mes: { ano: 2026, mes: 10 }, status: "ok", mensagem: "Aplicada: 166 linhas (FAT 51, CART 115)" }]);
  assert.equal(r.status, "concluido");
  assert.equal(r.resultado, "2026-10: Aplicada: 166 linhas (FAT 51, CART 115)");
});
test("resumirPedido: erro quando algum mes foi bloqueado ou falhou", () => {
  const bloq = resumirPedido([{ mes: { ano: 2026, mes: 10 }, status: "bloqueada", mensagem: "Queda anormal" }]);
  assert.equal(bloq.status, "erro");
  const falha = resumirPedido([{ mes: { ano: 2026, mes: 9 }, status: "ok", mensagem: "ok" }, { mes: { ano: 2026, mes: 10 }, status: "erro" }]);
  assert.equal(falha.status, "erro");
  assert.match(falha.resultado, /2026-10: erro/);
});
test("resumirPedido: sem resultados e erro; texto limitado a 1000 caracteres", () => {
  assert.equal(resumirPedido([]).status, "erro");
  const longo = resumirPedido([{ mes: { ano: 2026, mes: 10 }, status: "erro", mensagem: "x".repeat(3000) }]);
  assert.equal(longo.resultado.length, 1000);
});

import { totalDoContentRange } from "../src/supabase.js";

test("totalDoContentRange le o total do cabecalho do PostgREST", () => {
  assert.equal(totalDoContentRange("0-0/596"), 596);
  assert.equal(totalDoContentRange("*/0"), 0);
  assert.equal(totalDoContentRange("0-9/12345"), 12345);
  assert.equal(totalDoContentRange("0-9/*"), null);
  assert.equal(totalDoContentRange(null), null);
});
