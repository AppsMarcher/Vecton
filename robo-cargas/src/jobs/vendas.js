// Carga de vendas realizadas (FAT + CART) -> comercial_realizado_import_*.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { consultar } from "../protheus.js";
import { criarResolvedor } from "../territorio.js";
import { intervaloMes, sha256, round } from "../util.js";

const SQL_TEMPLATE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "sql", "vendas_mes.sql"), "utf8");

export const nome = "vendas";
export const precisaRegioes = true;

// Tabelas/funcoes do Vecton usadas por esta carga (o runner e generico).
export const alvo = {
  batches: "comercial_realizado_import_batches",
  rows: "comercial_realizado_import_rows",
  apply: "apply_comercial_realizado_import_batch",
  remove: "delete_comercial_realizado_import_batch",
  errorSelect: "row_number,origem,documento,cod_cliente,cod_produto,validation_errors"
};

// Texto curto da linha reprovada (log e e-mail de erro).
export function descreverErro(l) {
  return `${l.origem || "-"} · doc ${l.documento || "-"} · cliente ${l.cod_cliente || "-"} · produto ${l.cod_produto || "-"}`;
}

export const textoResumo = (resumo) => `${resumo.total} linhas (FAT ${resumo.fat}, CART ${resumo.cart})`;
export const textoSimulacao = (resumo) =>
  `${resumo.total} linhas (FAT ${resumo.fat}, CART ${resumo.cart}); sem territorio: ${resumo.semTerritorio}; sem tipo: ${resumo.semTipo}`;

export function montarSql(params, { ini, fim }) {
  const lista = (cfops) => cfops.map((c) => `'${String(c).replace(/\D/g, "").padStart(4, "0")}'`).join(", ");
  if (!params.cfops_saida?.length || !params.cfops_devol?.length) throw new Error("Parametros cfops_saida/cfops_devol vazios na configuracao da carga");
  return SQL_TEMPLATE
    .replaceAll("{{DATA_INI}}", ini).replaceAll("{{DATA_FIM}}", fim)
    .replaceAll("{{CFOPS_SAIDA}}", lista(params.cfops_saida)).replaceAll("{{CFOPS_DEVOL}}", lista(params.cfops_devol));
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
  const sql = montarSql(params, intervaloMes(mes));
  const resolver = criarResolvedor(regioes);
  const brutas = await consultar(cfg, sql);
  return resumir(brutas.map((r) => normalizarLinha(r, resolver)));
}

export function resumir(linhas) {
  return {
    linhas,
    hash: hashDasLinhas(linhas),
    resumo: {
      total: linhas.length,
      fat: linhas.filter((l) => l.origem === "FAT").length,
      cart: linhas.filter((l) => l.origem === "CART").length,
      semTerritorio: linhas.filter((l) => !l.territorio && l.tipo !== "Peças").length,
      semTipo: linhas.filter((l) => !l.tipo).length
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
