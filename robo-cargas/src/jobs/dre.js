// Carga de DRE (razao contabil do Protheus, CT2010) -> actuals_import_*.
// Mesma consulta e mesmas regras de normalizacao da carga manual (Razao_Contabil [carga dados].xlsm +
// tela Carga de Realizado - Manuais - DRE): so muda que o robo roda sozinho, para o mes corrente.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { consultar } from "../protheus.js";
import { intervaloMes, sha256, round } from "../util.js";

const SQL_TEMPLATE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "sql", "dre_mes.sql"), "utf8");

export const nome = "dre";
export const precisaRegioes = false;

// Tabelas/funcoes do Vecton usadas por esta carga (o runner e generico).
export const alvo = {
  batches: "actuals_import_batches",
  rows: "actuals_import_rows",
  apply: "apply_actuals_import_batch",
  remove: "delete_actuals_import_batch",
  errorSelect: "row_number,branch_code,account_number,cost_center_number,history,validation_errors"
};

const FAIXA = /^[0-9A-Za-z]+$/;

export function montarSql(params, { ini, fim }) {
  const de = String(params.conta_de ?? "3").trim();
  const ate = String(params.conta_ate ?? "4zzzzzzzzzzzzzzzz").trim();
  if (!FAIXA.test(de) || !FAIXA.test(ate)) throw new Error("Parametros conta_de/conta_ate invalidos (somente letras e numeros)");
  return SQL_TEMPLATE
    .replaceAll("{{DATA_INI}}", ini).replaceAll("{{DATA_FIM}}", fim)
    .replaceAll("{{CONTA_DE}}", de).replaceAll("{{CONTA_ATE}}", ate);
}

const txt = (v) => (v == null ? "" : String(v).trim());
const digitos = (v) => String(v ?? "").replace(/\D/g, "");
const num = (v) => (v == null || v === "" ? null : Number(v));

// Mesma regra da tela (normalizeBranchCode): so digitos, ate 2 posicoes.
export function normalizarFilial(v) {
  const d = digitos(v);
  return d.slice(0, 2).padStart(Math.min(2, Math.max(1, d.length)), "0");
}

// Le a coluna pelo nome sem depender de maiusculas/minusculas.
function pegar(r, nomeColuna) {
  if (nomeColuna in r) return r[nomeColuna];
  const k = Object.keys(r).find((c) => c.toLowerCase() === nomeColuna.toLowerCase());
  return k ? r[k] : undefined;
}

// CT2_DATA vem como 'yyyymmdd' (texto) ou Date.
function dataIso(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = txt(v);
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.slice(0, 10);
}

// Linha do razao -> linha "plana" (mesmas colunas da aba Razao_DRE do Excel).
export function normalizarLinha(r) {
  return {
    conta: digitos(pegar(r, "CONTA")),
    data: dataIso(pegar(r, "DATA")),
    lote: txt(pegar(r, "LOTE/SUB/DOC/LINHA")),
    historico: txt(pegar(r, "HISTORICO")),
    filial: normalizarFilial(pegar(r, "FILIAL DE ORIGEM")),
    cc: digitos(pegar(r, "C CUSTO")),
    valor: round(num(pegar(r, "VALOR")))
  };
}

export function hashDasLinhas(linhas) {
  const ordenado = linhas.map((l) => JSON.stringify([l.conta, l.data, l.lote, l.historico, l.filial, l.cc, l.valor])).sort();
  return sha256(ordenado.join("\n"));
}

export function paraLinhaImport(l, batchId, rowNumber, nomeArquivo) {
  return {
    id: randomUUID(), batch_id: batchId, row_number: rowNumber,
    entry_date: l.data || null, branch_code: l.filial || null, account_number: l.conta || null,
    cost_center_number: l.cc || null, history: l.historico || null, lot_code: l.lote || null,
    amount: l.valor, raw_payload: { arquivo: nomeArquivo }
  };
}

export function resumir(linhas) {
  return {
    linhas,
    hash: hashDasLinhas(linhas),
    resumo: {
      total: linhas.length,
      semConta: linhas.filter((l) => !l.conta).length,
      semFilial: linhas.filter((l) => !l.filial).length,
      semCentroDeCusto: linhas.filter((l) => !l.cc).length,
      saldo: round(linhas.reduce((s, l) => s + (l.valor || 0), 0))
    }
  };
}

export async function extrairMes(ctx, mes) {
  const { cfg, params } = ctx;
  const brutas = await consultar(cfg, montarSql(params, intervaloMes(mes)));
  return resumir(brutas.map(normalizarLinha));
}

// Texto curto da linha reprovada (log e e-mail de erro).
export function descreverErro(l) {
  return `conta ${l.account_number || "-"} · CC ${l.cost_center_number || "-"} · filial ${l.branch_code || "-"}`;
}

export const textoResumo = (resumo) => `${resumo.total} lançamentos`;
export const textoSimulacao = (resumo) =>
  `${resumo.total} lançamentos; saldo ${resumo.saldo?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}; sem conta: ${resumo.semConta}; sem filial: ${resumo.semFilial}`;

const cel = (v) => (v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : `"${String(v).replaceAll('"', '""')}"`);

// Copia do que foi carregado (1 arquivo por mes, sobrescrito a cada execucao).
export function gravarCsv(dir, mes, linhas) {
  mkdirSync(dir, { recursive: true });
  const colunas = ["conta", "data", "lote", "historico", "filial", "cc", "valor"];
  const corpo = linhas.map((l) => colunas.map((c) => cel(l[c])).join(";"));
  const arq = join(dir, `DRE_${mes.ano}-${String(mes.mes).padStart(2, "0")}.csv`);
  writeFileSync(arq, "﻿" + [colunas.join(";"), ...corpo].join("\r\n") + "\r\n", "utf8");
  return arq;
}
