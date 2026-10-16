// Orquestra uma carga automatica: janela de meses, protecoes, lote no Vecton e log.
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Supabase } from "./supabase.js";
import { agora, janelaMeses, chunk } from "./util.js";
import { ROOT_DIR } from "./config.js";
import { agruparErros } from "./erros.js";
import * as vendas from "./jobs/vendas.js";
import * as dre from "./jobs/dre.js";

export const JOBS = { vendas, dre };
const CHUNK_LINHAS = 500;
const pad2 = (n) => String(n).padStart(2, "0");

async function conectar(cfg) {
  const sb = new Supabase(cfg.supabase);
  let user;
  try {
    user = await sb.signIn(cfg.supabase.email, cfg.supabase.password);
  } catch (e) {
    // Diagnostico sem expor a senha: tamanho e espacos nas pontas ajudam a achar aspas/escape errados.
    const pw = cfg.supabase.password;
    throw new Error(`${e.message} [usuario ${cfg.supabase.email}; a senha recebida tem ${pw.length} caracteres${pw !== pw.trim() ? ", com espaco no inicio/fim" : ""}]`);
  }
  const [org] = await sb.select("organizations", `name=eq.${encodeURIComponent(cfg.supabase.organizationName)}&select=id&limit=1`);
  if (!org) throw new Error(`Organizacao "${cfg.supabase.organizationName}" nao encontrada (o usuario do robo precisa ser membro dela)`);
  return { sb, user, orgId: org.id };
}

// Horario programado ja vencido hoje e ainda sem nenhuma tentativa?
export async function devida(sb, orgId, job, config, tz) {
  const agoraSP = agora(tz);
  const vencidos = [...(config.horarios || [])].sort().filter((h) => h <= agoraSP.hhmm);
  if (!vencidos.length) return false;
  const slot = vencidos[vencidos.length - 1];
  const logs = await sb.select("carga_automatica_log", `organization_id=eq.${orgId}&job=eq.${job}&started_at=gte.${new Date(Date.now() - 36 * 3600e3).toISOString()}&select=started_at`);
  return !logs.some((l) => {
    const t = agora(tz, new Date(l.started_at));
    return t.data === agoraSP.data && t.hhmm >= slot;
  });
}

async function registrarLog(sb, orgId, base, extra) {
  const row = { organization_id: orgId, ...base, ...extra, finished_at: new Date().toISOString() };
  try { await sb.insert("carga_automatica_log", row); } catch (e) { console.error("Falha ao gravar log:", e.message); }
}

// Remove lotes automaticos antigos que nao chegaram a ser aplicados (ex.: lote com erro de validacao).
async function limparLotesAutoPendentes(sb, orgId, alvo, jobNome) {
  const pend = await sb.select(alvo.batches,
    `organization_id=eq.${orgId}&notes=like.${encodeURIComponent(`[auto] ${jobNome} *`)}&status=in.(draft,validating,error,ready)&select=id`);
  for (const b of pend) await sb.rpc(alvo.remove, { target_batch_id: b.id });
  return pend.length;
}

async function processarMes(ctx, job, mes) {
  const { cfg, sb, user, orgId, config, opcoes } = ctx;
  const params = config.params || {};
  const inicio = new Date().toISOString();
  const base = { job: job.nome, started_at: inicio, reference_year: mes.ano, reference_month: mes.mes };
  const rotulo = `${mes.ano}-${pad2(mes.mes)}`;
  let extraido;
  try {
    extraido = await job.extrairMes({ cfg, params, regioes: ctx.regioes }, mes);
  } catch (e) {
    await registrarLog(sb, orgId, base, { status: "erro", mensagem: `Falha na extracao do Protheus: ${e.message}` });
    throw e;
  }
  const { linhas, hash, resumo } = extraido;
  const detalhes = { resumo };
  const cabecalho = { total_rows: resumo.total, rows_fat: resumo.fat ?? null, rows_cart: resumo.cart ?? null, data_hash: hash };
  const alvo = job.alvo;

  if (opcoes.dryRun) {
    const dir = join(ROOT_DIR, "logs");
    mkdirSync(dir, { recursive: true });
    const csv = job.gravarCsv(dir, mes, linhas);
    console.log(`[SIMULACAO] ${job.nome} ${rotulo}: ${job.textoSimulacao(resumo)}`);
    console.log(`            hash ${hash.slice(0, 12)}…  CSV de conferencia: ${csv}`);
    console.log("            nada foi gravado no Vecton.");
    return { status: "simulacao" };
  }

  if (resumo.total === 0 && !opcoes.force) {
    await registrarLog(sb, orgId, base, { ...cabecalho, status: "bloqueada", mensagem: "Extracao vazia: carga nao aplicada para nao apagar o mes", detalhes });
    return { status: "bloqueada", mensagem: "Extração vazia: carga não aplicada para não apagar o mês" };
  }

  const [ultimo] = await sb.select("carga_automatica_log",
    `organization_id=eq.${orgId}&job=eq.${job.nome}&reference_year=eq.${mes.ano}&reference_month=eq.${mes.mes}&status=in.(ok,sem_mudanca)&select=total_rows,data_hash&order=started_at.desc&limit=1`);
  // Carga sempre completa: apaga o mes e regrava tudo, mesmo que nada tenha mudado desde a ultima execucao.
  const quedaMax = Number(params.queda_max_pct ?? 30);
  if (ultimo?.total_rows && resumo.total < ultimo.total_rows * (1 - quedaMax / 100) && !opcoes.force) {
    await registrarLog(sb, orgId, base, { ...cabecalho, status: "bloqueada", detalhes: { ...detalhes, linhas_anteriores: ultimo.total_rows },
      mensagem: `Queda anormal: ${resumo.total} linhas contra ${ultimo.total_rows} na ultima carga (limite ${quedaMax}%). Use --force se for esperado.` });
    return { status: "bloqueada", mensagem: `Queda anormal: ${resumo.total} linhas contra ${ultimo.total_rows} na última carga (limite ${quedaMax}%)` };
  }

  const removidos = await limparLotesAutoPendentes(sb, orgId, alvo, job.nome);
  if (removidos) detalhes.lotes_pendentes_removidos = removidos;

  const hhmm = agora(cfg.timezone).hhmm;
  const nomeArquivo = `Protheus ${job.nome} ${rotulo} ${hhmm}`;
  const batchId = randomUUID();
  await sb.insert(alvo.batches, [{
    id: batchId, organization_id: orgId, reference_year: mes.ano, reference_month: mes.mes,
    load_mode: "complete", source_type: "file", source_file_name: nomeArquivo, status: "draft",
    uploaded_by: user.id, notes: `[auto] ${job.nome} ${rotulo} (robo-cargas)`
  }]);
  const importRows = linhas.map((l, i) => job.paraLinhaImport(l, batchId, i + 1, nomeArquivo));
  for (const parte of chunk(importRows, CHUNK_LINHAS)) await sb.insert(alvo.rows, parte);

  const [lote] = await sb.select(alvo.batches, `id=eq.${batchId}&select=status,total_rows,error_rows,valid_rows`);
  if (lote.error_rows > 0 || lote.total_rows !== resumo.total) {
    // Ate 200 linhas reprovadas, agrupadas por motivo (varias linhas costumam falhar pelo mesmo cadastro faltando).
    const reprovadas = await sb.select(alvo.rows,
      `batch_id=eq.${batchId}&validation_status=eq.error&select=${alvo.errorSelect}&order=row_number&limit=200`);
    const erros = agruparErros(reprovadas, job.descreverErro, 20);
    await registrarLog(sb, orgId, base, { ...cabecalho, batch_id: batchId, status: "erro", detalhes: { ...detalhes, lote, primeiros_erros: erros },
      mensagem: `Lote com ${lote.error_rows} linha(s) com erro de validacao (nada foi aplicado). Lote ${batchId} mantido para analise na tela de carga.` });
    console.error(`${job.nome} ${rotulo}: ${lote.error_rows} linha(s) com erro. Lote ${batchId} mantido sem aplicar.`);
    return { status: "erro", mensagem: `${lote.error_rows} linha(s) com erro de validação; nada foi aplicado` };
  }

  await sb.rpc(alvo.apply, { target_batch_id: batchId });

  let aviso = "";
  if (params.diretorio_saida) {
    try { job.gravarCsv(params.diretorio_saida, mes, linhas); } catch (e) { aviso = ` (CSV nao gravado: ${e.message})`; }
  }
  await registrarLog(sb, orgId, base, { ...cabecalho, batch_id: batchId, status: "ok", detalhes, mensagem: `Carga aplicada: ${resumo.total} linhas${aviso}` });
  console.log(`${job.nome} ${rotulo}: aplicada (${job.textoResumo(resumo)})${aviso}.`);
  return { status: "ok", mensagem: `Aplicada: ${job.textoResumo(resumo)}` };
}

// ---- pedidos de carga sob demanda (botao "Carregar agora" na tela do Vecton) ----------------------------------

// Resultado do pedido a partir dos resultados por mes.
export function resumirPedido(resultados) {
  const falhou = resultados.some((r) => r.status === "erro" || r.status === "bloqueada");
  const texto = resultados
    .map((r) => `${r.mes.ano}-${pad2(r.mes.mes)}: ${r.mensagem || r.status}`)
    .join(" | ");
  return { status: falhou || !resultados.length ? "erro" : "concluido", resultado: (texto || "Nenhum mês processado").slice(0, 1000) };
}

const PEDIDO_EXPIRA_MIN = 30;

// Pega o pedido pendente mais antigo do job e o marca como "executando" (atomico: so vence quem ainda o ve pendente).
async function assumirPedido(sb, orgId, jobNome) {
  const limite = new Date(Date.now() - PEDIDO_EXPIRA_MIN * 60e3).toISOString();
  // Pedido que ficou "executando" ha muito tempo (robo interrompido) deixa de bloquear novos pedidos.
  await sb.update("carga_automatica_pedido", `organization_id=eq.${orgId}&job=eq.${jobNome}&status=eq.executando&started_at=lt.${limite}`,
    { status: "erro", finished_at: new Date().toISOString(), resultado: "Interrompido: o robô não concluiu este pedido" });
  const [pend] = await sb.select("carga_automatica_pedido",
    `organization_id=eq.${orgId}&job=eq.${jobNome}&status=eq.pendente&select=id&order=requested_at.asc&limit=1`);
  if (!pend) return null;
  const [pego] = await sb.request("PATCH", `/rest/v1/carga_automatica_pedido?id=eq.${pend.id}&status=eq.pendente`,
    { body: { status: "executando", started_at: new Date().toISOString() }, prefer: "return=representation" });
  return pego || null;
}

async function concluirPedido(sb, pedidoId, resumo) {
  try {
    await sb.update("carga_automatica_pedido", `id=eq.${pedidoId}`, { status: resumo.status, finished_at: new Date().toISOString(), resultado: resumo.resultado });
  } catch (e) { console.error("Falha ao atualizar o pedido:", e.message); }
}

// modo "agenda": roda o que estiver devido; modo "manual": roda o job pedido agora.
export async function executar(cfg, { jobNome, agenda = false, dryRun = false, force = false, mes = null }) {
  const { sb, user, orgId } = await conectar(cfg);
  const nomes = jobNome ? [jobNome] : Object.keys(JOBS);
  const resultados = [];
  for (const nome of nomes) {
    const job = JOBS[nome];
    if (!job) throw new Error(`Carga desconhecida: ${nome} (disponiveis: ${Object.keys(JOBS).join(", ")})`);
    const [config] = await sb.select("carga_automatica_config", `organization_id=eq.${orgId}&job=eq.${nome}&select=*&limit=1`);
    if (!config) { console.error(`${nome}: sem configuracao em carga_automatica_config (rode a migration 259).`); continue; }
    // Pedido feito pela tela ("Carregar agora"): roda mesmo fora do horario e com a carga pausada.
    const pedido = agenda && !dryRun ? await assumirPedido(sb, orgId, nome) : null;
    if (!pedido) {
      if (!dryRun && !config.enabled) { if (!agenda) console.log(`${nome}: carga desligada na configuracao.`); continue; }
      if (agenda && !(await devida(sb, orgId, nome, config, cfg.timezone))) continue;
    } else {
      console.log(`${nome}: pedido ${pedido.id} (Carregar agora).`);
    }

    const doJob = [];
    try {
      let regioes = [];
      if (job.precisaRegioes) {
        regioes = (await sb.selectAll("comercial_regioes_municipio", `organization_id=eq.${orgId}&select=municipio,uf,comercial_territorios(nome)&order=codigo_ibge`))
          .map((r) => ({ municipio: r.municipio, uf: r.uf, regional: r.comercial_territorios?.nome }));
        if (!regioes.length) throw new Error("comercial_regioes_municipio esta vazia (rode a migration 260)");
      }
      const meses = mes ? [mes] : janelaMeses(agora(cfg.timezone), config.meses_atras, config.meses_frente);
      const ctx = { cfg, sb, user, orgId, config, regioes, opcoes: { dryRun, force } };
      for (const m of meses) {
        try { doJob.push({ job: nome, mes: m, ...(await processarMes(ctx, job, m)) }); }
        catch (e) { console.error(`${nome} ${m.ano}-${pad2(m.mes)}: ${e.message}`); doJob.push({ job: nome, mes: m, status: "erro", mensagem: e.message }); }
      }
    } catch (e) {
      if (!pedido) throw e;
      doJob.push({ job: nome, mes: janelaMeses(agora(cfg.timezone))[0], status: "erro", mensagem: e.message });
    } finally {
      if (pedido) await concluirPedido(sb, pedido.id, resumirPedido(doJob));
    }
    resultados.push(...doJob);
  }
  return resultados;
}
