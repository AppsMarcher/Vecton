// Carga do Balanco Patrimonial (saldo acumulado no fechamento do mes) -> bp_import_batches.
// Mesma consulta do Base Carga BP.xlsm e mesmas regras da tela Carga de Realizado - Balanco Patrimonial:
// saldo por conta analitica do Plano BP, carga completa da competencia (substitui o fechamento anterior),
// conta desconhecida/divergente bloqueia. Diferente das outras cargas: so roda sob demanda ("Carregar agora"
// com o mes escolhido na tela, ou --mes=AAAA-MM) e so para mes fechado.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { consultar } from "../protheus.js";
import { intervaloMes, sha256, round } from "../util.js";

const SQL_TEMPLATE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "sql", "bp_mes.sql"), "utf8");

export const nome = "bp";
export const precisaRegioes = false;
// Sem janela automatica: o mes vem do pedido (ou --mes) e precisa ser um mes ja encerrado.
export const exigeMes = true;
export const somenteMesFechado = true;

const FAIXA = /^[0-9A-Za-z]+$/;
const p2 = (n) => String(n).padStart(2, "0");

export function intervaloBp({ ano, mes }) {
  const { ini, fim } = intervaloMes({ ano, mes });
  const anterior = new Date(Date.UTC(ano, mes - 1, 0));
  return { ini, fim, fimAnterior: `${anterior.getUTCFullYear()}${p2(anterior.getUTCMonth() + 1)}${p2(anterior.getUTCDate())}` };
}

export function montarSql(params, mes) {
  const de = String(params.conta_de ?? "1").trim();
  const ate = String(params.conta_ate ?? "2zzzzzzzzzzzzzzzz").trim();
  if (!FAIXA.test(de) || !FAIXA.test(ate)) throw new Error("Parametros conta_de/conta_ate invalidos (somente letras e numeros)");
  const { ini, fim, fimAnterior } = intervaloBp(mes);
  return SQL_TEMPLATE
    .replaceAll("{{DATA_ATE}}", fim).replaceAll("{{INICIO_MES}}", ini).replaceAll("{{FIM_MES_ANTERIOR}}", fimAnterior)
    .replaceAll("{{CONTA_DE}}", de).replaceAll("{{CONTA_ATE}}", ate);
}

const txt = (v) => (v == null ? "" : String(v).trim());
// Mesma normalizacao da tela (bpModel.normalize): sem acento/pontuacao, maiusculas.
const norm = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

// Linha do balancete -> linha "plana" (mesmas colunas da aba Balancete do Excel).
export function normalizarLinha(r) {
  const pegar = (c) => (c in r ? r[c] : r[Object.keys(r).find((k) => k.toLowerCase() === c.toLowerCase())]);
  return {
    conta: txt(pegar("CONTA")),
    nome: txt(pegar("NOME DA CONTA")),
    saldo: round(pegar("SALDO") == null || pegar("SALDO") === "" ? null : Number(pegar("SALDO"))),
    tipo: norm(pegar("TIPO_CONTA"))
  };
}

export function hashDasLinhas(linhas) {
  return sha256(linhas.map((l) => JSON.stringify([l.conta, l.tipo, l.saldo])).sort().join("\n"));
}

export function resumir(linhas) {
  const analiticas = linhas.filter((l) => l.tipo === "ANALITICA").length;
  return {
    linhas,
    hash: hashDasLinhas(linhas),
    // total = contas analiticas que viram saldo na carga (as sinteticas sao apenas conferencia).
    resumo: { total: analiticas, sinteticas: linhas.length - analiticas, linhasProtheus: linhas.length }
  };
}

export async function extrairMes(ctx, mes) {
  const { cfg, params } = ctx;
  return resumir((await consultar(cfg, montarSql(params, mes))).map(normalizarLinha));
}

// Regras da carga manual (bpModel.parse): conta tem que existir no Plano BP com o mesmo tipo, sem duplicidade;
// analitica precisa estar ativa e ter chave agrupadora; sintetica nao grava (o saldo ja esta nas analiticas).
// Devolve as linhas { account_id, amount } e os erros agrupados no formato do e-mail de erro.
export function montarLinhasBP(linhas, plano) {
  const contas = new Map(plano.map((n) => [n.account_code || n.source_name, n]));
  const vistas = new Set();
  const rows = [];
  const erros = [];
  const falha = (l, motivo) => erros.push({ resumo: `conta ${l.conta || "-"} · ${l.nome || "-"}`, ocorrencias: 1, validation_errors: [motivo] });
  for (const l of linhas) {
    const no = contas.get(l.conta);
    if (!no) { falha(l, "Conta inexistente no Plano BP"); continue; }
    if (vistas.has(no.id)) { falha(l, "Conta duplicada na extracao"); continue; }
    vistas.add(no.id);
    if (l.tipo && l.tipo !== norm(no.node_class)) { falha(l, "O tipo da conta difere do Plano BP"); continue; }
    if (no.node_class === "Sintetica") continue;
    if (!no.active) { falha(l, "Conta inativa no Plano BP"); continue; }
    if (!String(no.group_key ?? "").trim()) { falha(l, "Conta sem chave agrupadora no Plano BP"); continue; }
    if (l.saldo == null) { falha(l, "Saldo invalido"); continue; }
    rows.push({ account_id: no.id, amount: l.saldo });
  }
  return { rows, erros };
}

export const descreverErro = (e) => e.resumo;
export const textoResumo = (resumo) => `${resumo.total} contas analíticas`;
export const textoSimulacao = (resumo) => `${resumo.total} contas analíticas (${resumo.sinteticas} sintéticas só para conferência)`;

const cel = (v) => (v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : `"${String(v).replaceAll('"', '""')}"`);

export function gravarCsv(dir, mes, linhas) {
  mkdirSync(dir, { recursive: true });
  const colunas = ["conta", "nome", "saldo", "tipo"];
  const corpo = linhas.map((l) => colunas.map((c) => cel(l[c])).join(";"));
  const arq = join(dir, `BP_${mes.ano}-${p2(mes.mes)}.csv`);
  writeFileSync(arq, "﻿" + [colunas.join(";"), ...corpo].join("\r\n") + "\r\n", "utf8");
  return arq;
}

const PREFIXO_ARQUIVO = "Protheus BP ";

// Aplica no Vecton pelo mesmo caminho da tela: rascunho (bp_save_draft) + aplicacao (bp_apply_draft), que troca o
// fechamento da competencia na mesma transacao. `h` traz o que o runner ja preparou (log, detalhes, rotulo, hora).
export async function aplicarMes({ sb, orgId, params, mes, rotulo, hhmm, extraido, detalhes, log, gravarCopia }) {
  const plano = await sb.selectAll("bp_plan_nodes", `organization_id=eq.${orgId}&select=*&order=sort_order.asc,id.asc`);
  const { rows, erros } = montarLinhasBP(extraido.linhas, plano);
  if (erros.length || !rows.length) {
    const msg = erros.length
      ? `${erros.length} conta(s) com erro de validação (nada foi aplicado). Ajuste o Plano BP e carregue de novo.`
      : "Nenhuma conta analítica com saldo (nada foi aplicado)";
    await log({ status: "erro", detalhes: { ...detalhes, primeiros_erros: erros.slice(0, 20) }, mensagem: msg });
    console.error(`bp ${rotulo}: ${msg}`);
    return { status: "erro", mensagem: msg };
  }

  // Rascunhos de tentativas anteriores do robo para este mes que nao chegaram a ser aplicados.
  const antigos = await sb.select("bp_import_drafts",
    `organization_id=eq.${orgId}&reference_year=eq.${mes.ano}&reference_month=eq.${mes.mes}&source_type=eq.actual&file_name=like.${encodeURIComponent(`${PREFIXO_ARQUIVO}*`)}&select=id,revision`);
  for (const d of antigos) await sb.rpc("bp_delete_batch", { p_org: orgId, p_id: d.id, p_draft: true, p_revision: d.revision });
  if (antigos.length) detalhes.rascunhos_removidos = antigos.length;

  const arquivo = `${PREFIXO_ARQUIVO}${rotulo} ${hhmm}`;
  let rascunho;
  let lote;
  try {
    rascunho = await sb.rpc("bp_save_draft", {
      p_org: orgId, p_id: null, p_revision: null, p_year: mes.ano, p_month: mes.mes,
      p_source: "actual", p_scenario: null, p_file: arquivo, p_rows: rows, p_plan: plano
    });
    lote = await sb.rpc("bp_apply_draft", { p_org: orgId, p_id: rascunho, p_revision: 1 });
  } catch (e) {
    const msg = `Falha ao aplicar o BP: ${e.message}${rascunho ? ` (rascunho ${rascunho} mantido na tela de carga)` : ""}`;
    await log({ status: "erro", detalhes, mensagem: msg });
    console.error(`bp ${rotulo}: ${msg}`);
    return { status: "erro", mensagem: msg };
  }

  // Confere o fechamento gravado: mesmas contas e mesmo saldo total que o robo enviou.
  const [gravado] = await sb.select("bp_import_batches", `organization_id=eq.${orgId}&id=eq.${lote}&select=rows,reference_year,reference_month`);
  const soma = (xs) => round(xs.reduce((s, r) => s + Number(r.amount || 0), 0));
  if (!gravado || gravado.rows.length !== rows.length || soma(gravado.rows) !== soma(rows)) {
    const msg = `Aplicado, mas o fechamento gravado tem ${gravado?.rows?.length ?? 0} de ${rows.length} contas (ou saldo diferente)`;
    await log({ status: "erro", detalhes: { ...detalhes, batch: lote }, mensagem: msg });
    console.error(`bp ${rotulo}: ${msg}.`);
    return { status: "erro", mensagem: msg };
  }

  const aviso = gravarCopia ? gravarCopia() : "";
  await log({ status: "ok", batch_id: lote, detalhes: { ...detalhes, saldo_total: soma(rows) }, mensagem: `Carga aplicada: ${rows.length} contas${aviso}` });
  console.log(`bp ${rotulo}: aplicada (${rows.length} contas analíticas)${aviso}.`);
  return { status: "ok", mensagem: `Aplicada: ${rows.length} contas analíticas` };
}
