// Envio semanal do Painel de Vendas por e-mail (PDF), no dia/horario/destinatarios da tela Parametros > Notificacoes
// ("Envio semanal do Painel de Vendas", tabela notification_settings, kind abaixo; migration 265).
//
// Fluxo: devido? -> navegador sem tela monta o Painel como o botao "Enviar por e-mail" -> Edge Function
// send-report-email gera o PDF e envia -> carimba schedule_last_fired_on e grava carga_automatica_log.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agora } from "../util.js";
import { ROOT_DIR } from "../config.js";
import { devidaSemanal, tentativaRecente, montarEnvio } from "./agenda.js";
import { sessaoParaApp, montarRelatorio } from "./navegador.js";

export const KIND = "relatorio_painel_vendas_semanal";
export const JOB = "relatorio_painel_vendas";
export const REPORT_ID = "comercialPainel";

async function registrarLog(sb, orgId, base, extra) {
  try {
    await sb.insert("carga_automatica_log", { organization_id: orgId, job: JOB, ...base, ...extra, finished_at: new Date().toISOString() });
  } catch (e) { console.error("Falha ao gravar log:", e.message); }
}

// opcoes: { dryRun } simula (monta o Painel, salva o html em logs/ e NAO envia); { force } ignora dia/horario/ativo.
export async function executarPainelVendas(cfg, { sb, orgId }, { dryRun = false, force = false } = {}) {
  const [st] = await sb.select("notification_settings",
    `organization_id=eq.${orgId}&kind=eq.${KIND}&select=is_active,email,email_recipients,schedule_weekday,schedule_time,schedule_last_fired_on&limit=1`);
  if (!st) {
    console.error(`${JOB}: sem configuracao (rode a migration 265).`);
    return { status: "sem_config" };
  }
  const ag = agora(cfg.timezone);
  if (!force && !dryRun) {
    if (!devidaSemanal(st, ag)) return { status: "nao_devida" };
    const recentes = await sb.select("carga_automatica_log",
      `organization_id=eq.${orgId}&job=eq.${JOB}&started_at=gte.${new Date(Date.now() - 2 * 3600e3).toISOString()}&select=started_at`);
    if (tentativaRecente(recentes, Date.now(), 60)) return { status: "aguardando" };
  }
  const destinatarios = st.email_recipients || [];
  if (!dryRun && !destinatarios.length) {
    console.error(`${JOB}: sem destinatarios (Parametros > Notificacoes).`);
    return { status: "erro", mensagem: "Sem destinatarios configurados" };
  }

  const rel = cfg.relatorios || {};
  const base = { started_at: new Date().toISOString() };
  let construido;
  try {
    construido = await montarRelatorio({
      appUrl: rel.appUrl || "https://vecton.marcher.com.br",
      sessao: sessaoParaApp(sb.session),
      reportId: REPORT_ID,
      assinatura: rel.assinatura || "Vecton Planning (envio automático)",
      canal: rel.canal || "msedge",
      executavel: rel.executavel || "",
      timeoutMs: (rel.timeoutSegundos || 120) * 1000
    });
  } catch (e) {
    await registrarLog(sb, orgId, base, { status: "erro", mensagem: `Falha ao montar o Painel de Vendas: ${e.message}` });
    console.error(`${JOB}: ${e.message}`);
    return { status: "erro", mensagem: e.message };
  }
  const ref = { reference_year: construido.ano, reference_month: construido.mes };
  const rotulo = `${construido.ano}-${String(construido.mes).padStart(2, "0")}`;

  if (dryRun) {
    const dir = join(ROOT_DIR, "logs");
    mkdirSync(dir, { recursive: true });
    const arq = join(dir, `Painel-Vendas_${rotulo}.html`);
    writeFileSync(arq, construido.html, "utf8");
    console.log(`[SIMULACAO] ${JOB} ${rotulo}: painel montado (cenario ${construido.cenario}; cenarios visiveis: ${(construido.cenarios || []).join(", ") || "nenhum"}; ${Math.round(construido.html.length / 1024)} KB).`);
    console.log(`            html de conferencia: ${arq}`);
    console.log(`            destinatarios que receberiam: ${destinatarios.join(", ") || "(nenhum configurado)"}`);
    console.log("            nada foi enviado.");
    return { status: "simulacao" };
  }

  try {
    const envio = montarEnvio(construido, destinatarios);
    await sb.request("POST", "/functions/v1/send-report-email", { body: envio });
    await sb.update("notification_settings", `organization_id=eq.${orgId}&kind=eq.${KIND}`, { schedule_last_fired_on: ag.data });
    const msg = `Painel de Vendas ${rotulo} enviado a ${envio.to.length} destinatario(s) (cenario ${construido.cenario}; ${(construido.cenarios || []).length} cenario(s) visivel(is))`;
    await registrarLog(sb, orgId, base, { ...ref, status: "ok", mensagem: msg });
    console.log(`${JOB}: ${msg}.`);
    return { status: "ok", mensagem: msg };
  } catch (e) {
    await registrarLog(sb, orgId, base, { ...ref, status: "erro", mensagem: `Falha ao enviar o Painel de Vendas: ${e.message}` });
    console.error(`${JOB}: ${e.message}`);
    return { status: "erro", mensagem: e.message };
  }
}
