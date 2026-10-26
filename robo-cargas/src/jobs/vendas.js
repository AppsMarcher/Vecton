// Carga de vendas realizadas (FAT + CART) -> comercial_realizado_import_*.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { consultar } from "../protheus.js";
import { criarResolvedor } from "../territorio.js";
import { agora, intervaloMes, sha256, round } from "../util.js";

const SQL_TEMPLATE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "sql", "vendas_mes.sql"), "utf8");

export const nome = "vendas";
export const precisaRegioes = true;

// Tabelas/funcoes do Vecton usadas por esta carga (o runner e generico).
export const alvo = {
  batches: "comercial_realizado_import_batches",
  rows: "comercial_realizado_import_rows",
  ledger: "comercial_realizado_ledger_entries",
  apply: "apply_comercial_realizado_import_batch",
  remove: "delete_comercial_realizado_import_batch",
  errorSelect: "row_number,origem,documento,cod_cliente,cod_produto,tipo_informado,valor,validation_errors"
};

const ERRO_CLIENTE = "Cliente nao cadastrado";
const ERRO_PRODUTO = "Produto nao cadastrado";
const ERRO_SEM_CULTURA = "Produto MAQUINAS sem cultura definida";
const brl = (v) => `R$ ${Math.round(Number(v) || 0).toLocaleString("pt-BR")}`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const juntar = (itens) => (itens.length > 1 ? `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}` : itens[0] ?? "");
const MAX_ITENS = 8;
const MAX_DOCS = 5;

// Texto claro para quem vai corrigir: agrupa as linhas reprovadas por CLIENTE/PRODUTO a cadastrar (com os
// documentos e o valor afetados) e diz onde cadastrar. A 1a linha cabe nos 160 caracteres do card das cargas.
// Devolve null quando nao ha linhas reprovadas (o runner usa entao a mensagem generica).
export function mensagemErros(reprovadas, { batchId } = {}) {
  if (!reprovadas?.length) return null;
  const grupos = { cliente: new Map(), produto: new Map(), semCultura: new Map(), outros: new Map() };
  const somar = (mapa, codigo, l, extra = {}) => {
    const g = mapa.get(codigo) ?? { docs: new Set(), valor: 0, tipos: new Set() };
    g.docs.add(l.documento || `linha ${l.row_number}`);
    g.valor += Number(l.valor) || 0;
    if (l.tipo_informado) g.tipos.add(l.tipo_informado);
    Object.assign(g, extra);
    mapa.set(codigo, g);
  };
  for (const l of reprovadas) {
    const erros = Array.isArray(l.validation_errors) ? l.validation_errors : [];
    const faltaProduto = erros.includes(ERRO_PRODUTO);
    for (const e of erros) {
      if (e === ERRO_CLIENTE) somar(grupos.cliente, l.cod_cliente || "(sem código)", l);
      else if (e === ERRO_PRODUTO) somar(grupos.produto, l.cod_produto || "(sem código)", l);
      else if (e.startsWith(ERRO_SEM_CULTURA)) { if (!faltaProduto) somar(grupos.semCultura, l.cod_produto || "(sem código)", l); }
      else somar(grupos.outros, e, l);
    }
  }
  const total = reprovadas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const docsTotal = new Set(reprovadas.map((l) => l.documento || `linha ${l.row_number}`)).size;
  const partes = [];
  if (grupos.cliente.size) partes.push(plural(grupos.cliente.size, "cliente", "clientes"));
  if (grupos.produto.size) partes.push(plural(grupos.produto.size, "produto", "produtos"));
  if (grupos.semCultura.size) partes.push(`${plural(grupos.semCultura.size, "produto", "produtos")} sem cultura`);
  if (grupos.outros.size) partes.push(plural(grupos.outros.size, "outro problema", "outros problemas"));
  const titulo = `Faltam cadastros: ${juntar(partes)} (${plural(docsTotal, "documento", "documentos")}, ${brl(total)}). Cadastre e clique em Carregar agora.`;

  const docsTexto = (g) => {
    const docs = [...g.docs].sort();
    return docs.length > MAX_DOCS ? `${docs.slice(0, MAX_DOCS).join(", ")} e mais ${docs.length - MAX_DOCS}` : docs.join(", ");
  };
  const secao = (rotulo, mapa, unidade, linha) => {
    if (!mapa.size) return null;
    const itens = [...mapa.entries()].sort((a, b) => b[1].valor - a[1].valor || String(a[0]).localeCompare(String(b[0])));
    const linhas = itens.slice(0, MAX_ITENS).map(([codigo, g]) => `• ${linha(codigo, g)}`);
    if (itens.length > MAX_ITENS) linhas.push(`• e mais ${itens.length - MAX_ITENS} ${unidade}`);
    return `${rotulo}:\n${linhas.join("\n")}`;
  };
  const base = (codigo, g, { tipo = false, valor = true } = {}) =>
    `${codigo}${tipo && g.tipos.size ? ` (${[...g.tipos].join("/")})` : ""} — ${plural(g.docs.size, "documento", "documentos")} (${docsTexto(g)})${valor ? ` · ${brl(g.valor)}` : ""}`;

  const blocos = [
    secao("Clientes a cadastrar (Parâmetros > Comercial > Clientes)", grupos.cliente, "clientes", (c, g) => base(c, g)),
    secao("Produtos a cadastrar (Parâmetros > Comercial > Produtos)", grupos.produto, "produtos",
      (c, g) => base(c, g, { tipo: true }) + ([...g.tipos].includes("Máquinas") ? " · ao cadastrar, informe a cultura (Grão ou Pecuária)" : "")),
    secao("Produtos sem cultura (edite o produto em Parâmetros > Comercial > Produtos e informe a cultura)", grupos.semCultura, "produtos", (c, g) => base(c, g, { tipo: true })),
    secao("Outros problemas", grupos.outros, "problemas", (c, g) => base(c, g, { valor: false }))
  ].filter(Boolean);
  const rodape = `Nada foi aplicado. Depois de cadastrar, use "Carregar agora" em Parâmetros > Carga de Realizado, ou aguarde a próxima carga automática.`
    + (batchId ? ` O lote com problema fica guardado para consulta (${String(batchId).slice(0, 8)}).` : "");
  return [titulo, ...blocos, rodape].join("\n\n");
}

// Texto curto da linha reprovada (log e e-mail de erro).
export function descreverErro(l) {
  return `${l.origem || "-"} · doc ${l.documento || "-"} · cliente ${l.cod_cliente || "-"} · produto ${l.cod_produto || "-"}`;
}

export const textoResumo = (resumo) => `${resumo.total} linhas (FAT ${resumo.fat}, CART ${resumo.cart})`;
export const textoSimulacao = (resumo) =>
  `${resumo.total} linhas (FAT ${resumo.fat}, CART ${resumo.cart}); sem territorio: ${resumo.semTerritorio}; sem tipo: ${resumo.semTipo}`
  + `; carteira sem data de entrega (fora da carga): ${resumo.cartSemData}; entrega mais antiga na carteira: ${resumo.cartMaisAntiga ?? "-"}`;

// Carteira completa so no mes corrente; meses fechados carregam apenas o faturamento.
export const deveIncluirCarteira = (mes, hoje) => mes.ano === hoje.ano && mes.mes === hoje.mes;

export function montarSql(params, { ini, fim, incluiCarteira = false }) {
  const lista = (cfops) => cfops.map((c) => `'${String(c).replace(/\D/g, "").padStart(4, "0")}'`).join(", ");
  if (!params.cfops_saida?.length || !params.cfops_devol?.length) throw new Error("Parametros cfops_saida/cfops_devol vazios na configuracao da carga");
  return SQL_TEMPLATE
    .replaceAll("{{DATA_INI}}", ini).replaceAll("{{DATA_FIM}}", fim)
    .replaceAll("{{CART_FILTRO}}", incluiCarteira ? "" : "AND 1 = 0")
    .replaceAll("{{CFOPS_SAIDA}}", lista(params.cfops_saida)).replaceAll("{{CFOPS_DEVOL}}", lista(params.cfops_devol));
}

// Item de carteira sem data de entrega nao pode virar lancamento (a validacao exige data): sai da carga e e contado.
export function excluirCartSemData(linhas) {
  const sem = (l) => l.origem === "CART" && !l.data;
  return { linhas: linhas.filter((l) => !sem(l)), semData: linhas.filter(sem).length };
}

const txt = (v) => (v == null ? "" : String(v).trim());
const num = (v) => (v == null || v === "" ? null : Number(v));

// Linha do Protheus -> linha "plana" (mesmas colunas da aba Vecton do Excel + territorio resolvido).
export function normalizarLinha(r, resolver) {
  const data = r.data instanceof Date ? r.data.toISOString().slice(0, 10) : txt(r.data).slice(0, 10);
  const linha = {
    origem: txt(r.origem), tipo: txt(r.tipo), data, documento: txt(r.documento),
    cod_produto: txt(r.cod_produto), cod_cliente: txt(r.cod_cliente), cod_vendedor: txt(r.cod_vendedor),
    qtd: num(r.qtd), fat: round(num(r.valor ?? r.FAT)), rl: round(num(r.RL ?? r.rl)), mp: round(num(r.MP ?? r.mp)),
    cidade: txt(r.Cidade ?? r.cidade), uf: txt(r.UF ?? r.uf).toUpperCase(), vend: txt(r.vend)
  };
  linha.territorio = resolver({ cidade: linha.cidade, uf: linha.uf, vend: linha.vend });
  return linha;
}

export function hashDasLinhas(linhas) {
  const ordenado = linhas
    .map((l) => JSON.stringify([l.origem, l.tipo, l.data, l.documento, l.cod_produto, l.cod_cliente, l.cod_vendedor, l.territorio, l.qtd, l.fat, l.rl, l.mp]))
    .sort();
  return sha256(ordenado.join("\n"));
}

export function paraLinhaImport(l, batchId, rowNumber, nomeArquivo) {
  const mb = l.rl != null && l.mp != null && l.rl !== 0 ? l.mp / l.rl : null;
  return {
    id: randomUUID(), batch_id: batchId, row_number: rowNumber,
    origem: l.origem || null, tipo_informado: l.tipo || null, entry_date: l.data || null,
    cod_produto: l.cod_produto || null, cod_cliente: l.cod_cliente || null, documento: l.documento || null,
    serie_documento: null, cod_territorio: l.territorio || null, cod_vendedor: l.cod_vendedor || null,
    quantidade: l.qtd, valor: l.fat, rl: l.rl, mp: l.mp, mb_pct: mb,
    raw_payload: { arquivo: nomeArquivo, cidade: l.cidade, uf: l.uf, vend: l.vend }
  };
}

export async function extrairMes(ctx, mes) {
  const { cfg, params, regioes } = ctx;
  const incluiCarteira = deveIncluirCarteira(mes, agora(cfg.timezone));
  const sql = montarSql(params, { ...intervaloMes(mes), incluiCarteira });
  const resolver = criarResolvedor(regioes);
  const brutas = await consultar(cfg, sql);
  const { linhas, semData } = excluirCartSemData(brutas.map((r) => normalizarLinha(r, resolver)));
  return resumir(linhas, semData);
}

export function resumir(linhas, cartSemData = 0) {
  const datasCart = linhas.filter((l) => l.origem === "CART" && l.data).map((l) => l.data).sort();
  return {
    linhas,
    hash: hashDasLinhas(linhas),
    resumo: {
      total: linhas.length,
      fat: linhas.filter((l) => l.origem === "FAT").length,
      cart: linhas.filter((l) => l.origem === "CART").length,
      semTerritorio: linhas.filter((l) => !l.territorio && l.tipo !== "Peças").length,
      semTipo: linhas.filter((l) => !l.tipo).length,
      cartSemData,
      cartMaisAntiga: datasCart[0] ?? null
    }
  };
}

const cel = (v) => (v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : `"${String(v).replaceAll('"', '""')}"`);

// Copia do que foi carregado (1 arquivo por mes, sobrescrito a cada execucao).
export function gravarCsv(dir, mes, linhas) {
  mkdirSync(dir, { recursive: true });
  const colunas = ["origem", "tipo", "data", "documento", "cod_produto", "cod_cliente", "cod_vendedor", "territorio", "qtd", "fat", "rl", "mp", "cidade", "uf"];
  const corpo = linhas.map((l) => colunas.map((c) => cel(l[c])).join(";"));
  const arq = join(dir, `Vendas_${mes.ano}-${String(mes.mes).padStart(2, "0")}.csv`);
  writeFileSync(arq, "﻿" + [colunas.join(";"), ...corpo].join("\r\n") + "\r\n", "utf8");
  return arq;
}
