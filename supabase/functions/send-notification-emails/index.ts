// Supabase Edge Function: send-notification-emails
// Drena a fila `notification_email_outbox` (preenchida pela trigger da
// migration 092) e envia cada item pelo Resend.
//
// Por que fila + cron, e não a trigger chamando isto direto: Postgres não fala
// HTTP sozinho, e mesmo com pg_net uma falha de rede/Resend perderia o e-mail
// sem retry nem rastro. Com a fila, item que falha continua 'pending' e sai no
// próximo tick; depois de MAX_ATTEMPTS ele vira 'failed' com o erro gravado em
// last_error (em vez de tentar pra sempre).
//
// Por que Resend e não SMTP: Supabase Edge Functions bloqueiam saída nas portas
// 25 e 587 (supabase.com/docs/guides/functions/limits) -- SMTP bruto nunca abre
// a conexão. Mesma decisão já documentada em send-report-email.
//
// Pré-requisitos (secrets, os mesmos que send-report-email já usa):
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
//   supabase secrets set RESEND_FROM="VectonPlan <no-reply@marcher.com.br>"
//
// Deploy:
//   supabase functions deploy send-notification-emails --no-verify-jwt
//   (--no-verify-jwt porque a autorização é checada manualmente abaixo: só
//   aceita a service_role key, que é quem o agendamento usa.)
//
// Agendamento (uma vez, depois do deploy): painel do Supabase → Integrations →
// Cron → Create job, tipo "Supabase Edge Function", a cada 5 minutos. O SQL
// equivalente (pg_cron + pg_net) está comentado no fim da migration 092.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Lote pequeno de propósito: o painel do Supabase limita o timeout do pg_net a
// 5 s, e cada envio pelo Resend leva algumas centenas de ms. Com 10 itens a
// execução fecha dentro do teto e o job registra o resultado de verdade em
// net._http_response; com lote grande ele apareceria como falho toda vez que
// tivesse trabalho (o envio até completa, mas o Postgres já parou de ouvir).
// A cada 5 min isso dá 120 e-mails/hora de vazão -- ordens de grandeza acima do
// volume esperado (algumas cargas por mês).
const BATCH_SIZE = 10;      // itens drenados por execução
const MAX_ATTEMPTS = 5;     // depois disso o item vira 'failed' e para de tentar
const APP_URL = "https://vecton.marcher.com.br";
const RETENTION_DAYS = 90;  // notificações mais antigas que isso são apagadas

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Mesmo logo usado no header/sidebar/login do app (fundo escuro) -- ver
// index.html. Hospedado no próprio GitHub Pages, acesso público (não precisa
// de auth), por isso pode ser referenciado direto por URL no <img> do e-mail
// (embutir como data: URI é mal suportado por clientes de e-mail, sobretudo
// Outlook desktop).
const LOGO_URL = "https://vecton.marcher.com.br/logo-branco.png";

function buildHtml(subject: string, bodyText: string, linkPath?: string | null): string {
  const lines = bodyText.split("\n").filter(Boolean).map(escapeHtml);
  const title = lines.shift() ?? escapeHtml(subject);
  const rest = lines.map((l) => `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#a1a7b3;">${l}</p>`).join("");
  // link_path vem da trigger (migration 093) como "?report=...&ano=&mes=", e
  // abre o relatorio do evento no mes certo. Sem ele o botao cai na home.
  // Aceita so o formato esperado -- o conteudo vai pra dentro de um href.
  const safePath = linkPath && /^\?[A-Za-z0-9_=&]+$/.test(linkPath) ? linkPath : "";
  const href = APP_URL + safePath;
  const rotulo = safePath ? "Abrir o relatório" : "Abrir o Vecton";
  // Mesma linguagem visual dos templates de auth (supabase/email-templates/):
  // fundo escuro, card com gradiente + borda sutil, botão azul arredondado.
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#09090a;font-family:Inter,Segoe UI,Arial,sans-serif;color:#ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#09090a;margin:0;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;">
          <tr>
            <td style="padding:0 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(180deg,#111214 0%,#0f1013 100%);border:1px solid #2a2d34;border-radius:20px;overflow:hidden;">
                <tr>
                  <td style="padding:28px;">
                    <img src="${LOGO_URL}" width="120" alt="Vecton Planning" style="display:block;width:120px;height:auto;margin:0 0 20px;border:0;outline:none;">
                    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:700;">${escapeHtml(title)}</h1>
                    ${rest}
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 0;">
                      <tr>
                        <td align="center" bgcolor="#4f7cff" style="border-radius:12px;">
                          <a href="${href}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;line-height:1;text-decoration:none;color:#ffffff;">${rotulo}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Só o agendamento chama isto. Sem sessão de usuário: exige uma chave
    // privilegiada no Authorization, senão qualquer um com a anon key drenaria
    // a fila.
    //
    // Aceita mais de um formato de propósito: o painel de Cron insere a chave
    // NOVA (`sb_secret_...`) no header, enquanto SUPABASE_SERVICE_ROLE_KEY é
    // injetada no formato LEGADO (JWT `eyJ...`). Comparar só com uma das duas
    // dá 401 mesmo com o job configurado certo. CRON_SECRET é a saída de
    // emergência: se nenhuma das duas bater, basta criar esse secret e usar o
    // mesmo valor no header do job. Todas são segredos — aceitar as três não
    // afrouxa nada.
    const accepted = [
      serviceKey,
      Deno.env.get("SB_SECRET_KEY"),
      Deno.env.get("CRON_SECRET"),
    ].filter(Boolean);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token || !accepted.includes(token)) return json({ error: "Não autorizado" }, 401);

    const db = createClient(url, serviceKey);

    // Claim atômico: marca os candidatos como tentados ANTES de enviar. Se duas
    // execuções se sobrepuserem, só a primeira leva as linhas (o filtro
    // status='pending' + o retorno do update decidem quem ficou com o quê).
    const { data: candidates, error: pickErr } = await db
      .from("notification_email_outbox")
      .select("id")
      .eq("status", "pending")
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);
    if (pickErr) return json({ error: `Falha ao ler a fila: ${pickErr.message}` }, 500);

    const ids = (candidates ?? []).map((r: { id: string }) => r.id);
    if (!ids.length) {
      await purgeOld(db);
      return json({ ok: true, sent: 0, failed: 0, message: "Fila vazia" });
    }

    const { data: claimed, error: claimErr } = await db
      .from("notification_email_outbox")
      .update({ status: "pending" })
      .in("id", ids)
      .eq("status", "pending")
      .select("id, recipients, subject, body_text, attempts, link_path");
    if (claimErr) return json({ error: `Falha ao reservar itens: ${claimErr.message}` }, 500);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return json({ error: "Envio não configurado nesta function (secret RESEND_API_KEY ausente)" }, 500);
    }
    const from = Deno.env.get("RESEND_FROM") || "VectonPlan <onboarding@resend.dev>";

    let sent = 0;
    let failed = 0;

    for (const item of claimed ?? []) {
      const attempts = (item.attempts ?? 0) + 1;
      const recipients: string[] = Array.isArray(item.recipients) ? item.recipients.filter(Boolean) : [];

      if (!recipients.length) {
        await db.from("notification_email_outbox")
          .update({ status: "failed", attempts, last_error: "Sem destinatários configurados" })
          .eq("id", item.id);
        failed++;
        continue;
      }

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: recipients,
            subject: item.subject,
            text: item.body_text,
            html: buildHtml(item.subject, item.body_text, item.link_path),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || `Resend ${res.status}`);

        await db.from("notification_email_outbox")
          .update({ status: "sent", attempts, sent_at: new Date().toISOString(), last_error: null })
          .eq("id", item.id);
        sent++;
      } catch (e) {
        const msg = String((e as Error)?.message ?? e).slice(0, 500);
        // Estourou as tentativas → para de tentar. Senão volta pra fila e o
        // próximo tick tenta de novo.
        await db.from("notification_email_outbox")
          .update({
            status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
            attempts,
            last_error: msg,
          })
          .eq("id", item.id);
        failed++;
      }
    }

    await purgeOld(db);
    return json({ ok: true, sent, failed });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

// Retenção: o feed do sininho só mostra 90 dias, então guardar mais que isso é
// só peso morto. Da fila, some o que já foi enviado há mais de 30 dias --
// 'failed' fica, é o rastro de que alguém precisa olhar.
async function purgeOld(db: ReturnType<typeof createClient>) {
  const notifCutoff = new Date(Date.now() - RETENTION_DAYS * 864e5).toISOString();
  const outboxCutoff = new Date(Date.now() - 30 * 864e5).toISOString();
  try {
    await db.from("notifications").delete().lt("created_at", notifCutoff);
    await db.from("notification_email_outbox").delete().eq("status", "sent").lt("created_at", outboxCutoff);
  } catch (_) {
    // limpeza é oportunista -- nunca deve derrubar o envio
  }
}
