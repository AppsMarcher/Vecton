// Orquestra uma carga automatica: janela de meses, protecoes, lote no Vecton e log.
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Supabase } from "./supabase.js";
import { agora, janelaMeses, chunk } from "./util.js";
import { ROOT_DIR } from "./config.js";
import * as vendas from "./jobs/vendas.js";

export const JOBS = { vendas };
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

async function limparLotesAutoPendentes(sb, orgId) {
  const pend = await sb.select("comercial_realizado_import_batches",
    `organization_id=eq.${orgId}&notes=like.${encodeURIComponent("[auto]*")}&status=in.(draft,validating,error,ready)&select=id`);
  for (const b of pend) await sb.rpc("delete_comercial_realizado_import_batch", { target_batch_id: b.id });
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
  const cabecalho = { total_rows: resumo.total, rows_fat: resumo.fat, rows_cart: resumo.cart, data_hash: hash };

  if (opcoes.dryRun) {
    const dir = join(ROOT_DIR, "logs");
    mkdirSync(dir, { recursive: true });
    const csv = job.gravarCsv(dir, mes, linhas);
    console.log(`[SIMULACAO] ${job.nome} ${rotulo}: ${resumo.total} linhas (FAT ${resumo.fat}, CART ${resumo.cart}); sem territorio: ${resumo.semTerritorio}; sem tipo: ${resumo.semTipo}`);
    console.log(`            hash ${hash.slice(0, 12)}…  CSV de conferencia: ${csv}`);
    console.log("            nada foi gravado no Vecton.");
    return { status: "simulacao" };
  }

  if (resumo.total === 0 && !opcoes.force) {
    await registrarLog(sb, orgId, base, { ...cabecalho, status: "bloqueada", mensagem: "Extracao vazia: carga nao aplicada para nao apagar o mes", detalhes });
    return { status: "bloqueada" };
  }

  const [ultimo] = await sb.select("carga_automatica_log",
    `organization_id=eq.${orgId}&job=eq.${job.nome}&reference_year=eq.${mes.ano}&reference_month=eq.${mes.mes}&status=in.(ok,sem_mudanca)&select=total_rows,data_hash&order=started_at.desc&limit=1`);
  // Carga sempre completa: apaga o mes e regrava tudo, mesmo que nada tenha mudado desde a ultima execucao.
  const quedaMax = Number(params.queda_max_pct ?? 30);
  if (ultimo?.total_rows && resumo.total < ultimo.total_rows * (1 - quedaMax / 100) && !opcoes.force) {
    await registrarLog(sb, orgId, base, { ...cabecalho, status: "bloqueada", detalhes: { ...detalhes, linhas_anteriores: ultimo.total_rows },
      mensagem: `Queda anormal: ${resumo.total} linhas contra ${ultimo.total_rows} na ultima carga (limite ${quedaMax}%). Use --force se for esperado.` });
    return { status: "bloqueada" };
  }

  const removidos = await limparLotesAutoPendentes(sb, orgId);
  if (removidos) detalhes.lotes_pendentes_removidos = removidos;

  const hhmm = agora(cfg.timezone).hhmm;
  const nomeArquivo = `Protheus ${job.nome} ${rotulo} ${hhmm}`;
  const batchId = randomUUID();
  await sb.insert("comercial_realizado_import_batches", [{
    id: batchId, organization_id: orgId, reference_year: mes.ano, reference_month: mes.mes,
    load_mode: "complete", source_type: "file", source_file_name: nomeArquivo, status: "draft",
    uploaded_by: user.id, notes: `[auto] ${job.nome} ${rotulo} (robo-cargas)`
  }]);
  const importRows = linhas.map((l, i) => job.paraLinhaImport(l, batchId, i + 1, nomeArquivo));
  for (const parte of chunk(importRows, CHUNK_LINHAS)) await sb.insert("comercial_realizado_import_rows", parte);

  const [lote] = await sb.select("comercial_realizado_import_batches", `id=eq.${batchId}&select=status,total_rows,error_rows,valid_rows`);
  if (lote.error_rows > 0 || lote.total_rows !== resumo.total) {
    const erros = await sb.select("comercial_realizado_import_rows",
      `batch_id=eq.${batchId}&validation_status=eq.error&select=row_number,origem,documento,cod_cliente,cod_produto,validation_errors&order=row_number&limit=20`);
    await registrarLog(sb, orgId, base, { ...cabecalho, batch_id: batchId, status: "erro", detalhes: { ...detalhes, lote, primeiros_erros: erros },
      mensagem: `Lote com ${lote.error_rows} linha(s) com erro de validacao (nada foi aplicado). Lote ${batchId} mantido para analise na tela de carga.` });
    console.error(`${job.nome} ${rotulo}: ${lote.error_rows} linha(s) com erro. Lote ${batchId} mantido sem aplicar.`);
    return { status: "erro" };
  }

  await sb.rpc("apply_comercial_realizado_import_batch", { target_batch_id: batchId });

  let aviso = "";
  if (params.diretorio_saida) {
    try { job.gravarCsv(params.diretorio_saida, mes, linhas); } catch (e) { aviso = ` (CSV nao gravado: ${e.message})`; }
  }
  await registrarLog(sb, orgId, base, { ...cabecalho, batch_id: batchId, status: "ok", detalhes, mensagem: `Carga aplicada: ${resumo.total} linhas${aviso}` });
  console.log(`${job.nome} ${rotulo}: aplicada (${resumo.total} linhas: FAT ${resumo.fat}, CART ${resumo.cart})${aviso}.`);
  return { status: "ok" };
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
    if (!dryRun && !config.enabled) { if (!agenda) console.log(`${nome}: carga desligada na configuracao.`); continue; }
    if (agenda && !(await devida(sb, orgId, nome, config, cfg.timezone))) continue;

    const regioes = (await sb.selectAll("comercial_regioes_municipio", `organization_id=eq.${orgId}&select=municipio,uf,comercial_territorios(nome)&order=codigo_ibge`))
      .map((r) => ({ municipio: r.municipio, uf: r.uf, regional: r.comercial_territorios?.nome }));
    if (!regioes.length) throw new Error("comercial_regioes_municipio esta vazia (rode a migration 260)");
    const meses = mes ? [mes] : janelaMeses(agora(cfg.timezone), config.meses_atras, config.meses_frente);
    const ctx = { cfg, sb, user, orgId, config, regioes, opcoes: { dryRun, force } };
    for (const m of meses) {
      try { resultados.push({ job: nome, mes: m, ...(await processarMes(ctx, job, m)) }); }
      catch (e) { console.error(`${nome} ${m.ano}-${pad2(m.mes)}: ${e.message}`); resultados.push({ job: nome, mes: m, status: "erro" }); }
    }
  }
  return resultados;
}
