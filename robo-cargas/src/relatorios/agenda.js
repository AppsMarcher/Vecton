// Regras de agenda do envio semanal de relatorio (puras, sem rede): configuradas na tela
// Parametros > Notificacoes (tabela notification_settings, tipos "relatorio_*").

// Esta na hora? Ativo, com e-mail ligado e destinatarios, no dia da semana certo, depois do horario e
// ainda nao enviado hoje. Sem janela de 15 min: se o robo estava fora do ar no horario, envia no mesmo dia.
export function devidaSemanal(cfgTipo, ag) {
  if (!cfgTipo || !cfgTipo.is_active || !cfgTipo.email) return false;
  if (!(cfgTipo.email_recipients || []).length) return false;
  if (cfgTipo.schedule_weekday == null || !cfgTipo.schedule_time) return false;
  if (Number(cfgTipo.schedule_weekday) !== ag.dow) return false;
  if (ag.hhmm < String(cfgTipo.schedule_time).slice(0, 5)) return false;
  if (cfgTipo.schedule_last_fired_on && String(cfgTipo.schedule_last_fired_on) >= ag.data) return false;
  return true;
}

// Houve tentativa (ok ou erro) nos ultimos `minutos`? Evita repetir a cada rodada de 5 min (e a cada e-mail de erro)
// quando o envio falha: apos uma falha, so tenta de novo depois de 1 hora.
export function tentativaRecente(logs, agoraMs, minutos = 60) {
  return (logs || []).some((l) => agoraMs - new Date(l.started_at).getTime() < minutos * 60e3);
}

// Corpo da chamada a Edge Function send-report-email (mesmo contrato do botao "Enviar por e-mail").
export function montarEnvio(construido, destinatarios) {
  const to = [...new Set((destinatarios || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  if (!to.length) throw new Error("Nenhum destinatario configurado (Parametros > Notificacoes)");
  if (!construido?.html) throw new Error("Relatorio sem conteudo (html vazio)");
  return {
    to,
    subject: construido.subject,
    filename: construido.filename,
    body_text: construido.bodyText,
    html: construido.html
  };
}
