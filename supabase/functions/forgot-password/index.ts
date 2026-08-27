// Supabase Edge Function: forgot-password
// Self-service "Esqueci minha senha" da tela de LOGIN — diferente de
// resend-password (painel de Usuários, exige sessão de admin da mesma org).
// Este endpoint é público por natureza (chamado por quem ainda não está
// logado), então NÃO reusa resend-password; ver nota em
// [[project_vecton_plan]] 2026-08-26 ("Confirmado (grep): não existe fluxo
// de esqueci minha senha público... se um dia for adicionado, precisaria de
// uma function nova, sem gate de role, mas com rate-limit").
//
// Mesmo motivo de existir de invite-user/resend-invite/resend-password: o
// endpoint nativo GoTrue /auth/v1/recover manda pelo SMTP do painel
// (Office365) -- para destinatários @marcher.com.br (mesmo tenant), o
// Outlook resolve o nome do remetente pelo GAL/Diretório do Exchange e
// ignora o "Sender name" configurado no Supabase, mostrando o nome
// desatualizado da caixa no M365 ("no reply - Marcher Brasil") em vez do
// nome do produto. Fix: `generateLink` (cria o link, NÃO envia e-mail) +
// envio manual pelo Resend (API HTTPS, fora do Exchange).
//
// Proteção contra oráculo de enumeração de e-mail:
// 1. SEMPRE responde {ok:true} genérico, exista o e-mail ou não, e mesmo
//    em cooldown -- nunca revela se o e-mail está cadastrado.
// 2. Cooldown de 5 min por e-mail via tabela password_reset_requests
//    (migration 124) -- silenciosamente ignora pedidos repetidos dentro da
//    janela em vez de gerar/mandar um novo link a cada clique.
//
// A lógica de envio é DUPLICADA de resend-password/index.ts em vez de
// importada de _shared/ -- o deploy é feito pelo editor do painel Supabase
// (sem CLI/config.toml neste projeto), que empacota só a pasta da própria
// function e não resolve import relativo pra fora dela.
//
// Deploy:
//   supabase functions deploy forgot-password --no-verify-jwt
//   (--no-verify-jwt porque é chamado por usuário anônimo, sem sessão)
//
// Pré-requisitos: secrets RESEND_API_KEY e RESEND_FROM (já existem, usados
// por invite-user/resend-invite/resend-password/send-report-email/
// send-notification-emails).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos entre pedidos pro mesmo e-mail

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Resposta genérica — usada em TODO caminho de saída "normal" (e-mail
// inexistente, em cooldown, ou enviado com sucesso). Nunca deixar o front
// diferenciar esses casos.
const GENERIC_OK = json({ ok: true });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const redirectTo = body.redirect_to ? String(body.redirect_to).trim() : null;
    if (!email || !email.includes("@")) return json({ error: "E-mail inválido" }, 400);

    const admin = createClient(url, serviceKey);

    // Cooldown: se já pediu há menos de 5 min, não gera novo link nem manda
    // e-mail de novo — mas responde ok igual, pra não vazar informação.
    const { data: lastRequest } = await admin
      .from("password_reset_requests")
      .select("requested_at")
      .eq("email", email)
      .maybeSingle();
    if (lastRequest && Date.now() - new Date(lastRequest.requested_at).getTime() < COOLDOWN_MS) {
      return GENERIC_OK;
    }
    await admin
      .from("password_reset_requests")
      .upsert({ email, requested_at: new Date().toISOString() });

    // Só gera/manda o link se o e-mail pertencer a um usuário de verdade.
    const { data: profile } = await admin
      .from("user_profiles")
      .select("email")
      .ilike("email", email)
      .maybeSingle();
    if (!profile) return GENERIC_OK;

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: profile.email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (linkErr) {
      console.error("generateLink falhou:", linkErr.message);
      return GENERIC_OK;
    }
    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) return GENERIC_OK;

    const emailResult = await sendResetPasswordEmailViaResend(profile.email, actionLink);
    if (!emailResult.ok) {
      console.error("Resend falhou:", emailResult.error);
    }

    return GENERIC_OK;
  } catch (e) {
    console.error(e);
    // Mesmo em erro inesperado, não vazar detalhe pro front.
    return GENERIC_OK;
  }
});

// Envio do e-mail de redefinição de senha via Resend — réplica exata do
// helper em resend-password/index.ts (mesmo template visual). Se o layout
// mudar lá, replicar aqui também.
async function sendResetPasswordEmailViaResend(
  to: string,
  actionLink: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return { ok: false, error: "Secret RESEND_API_KEY ausente" };
  const from = Deno.env.get("RESEND_FROM") || "VectonPlan <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Redefina sua senha do VectonPlan",
      html: buildResetPasswordHtml(actionLink),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.message || `Falha no Resend (${res.status})` };
  return { ok: true };
}

// Mesmo conteúdo/visual de supabase/email-templates/reset-password.html, só
// que com {{ .ConfirmationURL }} já resolvido para o action_link real (o
// Resend não processa a sintaxe de template do Supabase -- o link precisa ir
// pronto). Se o template visual mudar lá, replicar aqui também.
function buildResetPasswordHtml(actionLink: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redefina sua senha</title>
</head>
<body style="margin:0;padding:0;background-color:#09090a;font-family:Inter,Segoe UI,Arial,sans-serif;color:#ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#09090a;margin:0;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;">
          <tr>
            <td style="padding:0 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(180deg,#111214 0%,#0f1013 100%);border:1px solid #2a2d34;border-radius:24px;overflow:hidden;">
                <tr>
                  <td style="padding:32px;">
                    <div style="display:inline-block;padding:8px 14px;border:1px solid rgba(79,124,255,0.28);border-radius:999px;background:rgba(79,124,255,0.12);font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#c6d3ff;font-weight:700;">
                      VectonPlan
                    </div>
                    <h1 style="margin:22px 0 12px 0;font-size:32px;line-height:1.15;color:#ffffff;font-weight:700;">
                      Redefina sua senha
                    </h1>
                    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:#a1a7b3;">
                      Recebemos uma solicitação para redefinir sua senha de acesso ao VectonPlan. Use o link abaixo para continuar com segurança.
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 24px 0;">
                      <tr>
                        <td align="center" bgcolor="#4f7cff" style="border-radius:14px;">
                          <a href="${actionLink}" style="display:inline-block;padding:15px 24px;font-size:15px;font-weight:700;line-height:1;text-decoration:none;color:#ffffff;">
                            Criar nova senha
                          </a>
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;background:#0b0c0f;border:1px solid #2a2d34;border-radius:16px;">
                      <tr>
                        <td style="padding:18px 18px 16px 18px;">
                          <p style="margin:0 0 8px 0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;font-weight:700;">
                            Atenção
                          </p>
                          <p style="margin:0;font-size:14px;line-height:1.7;color:#cbd5e1;">
                            Se você não pediu a redefinição, basta ignorar esta mensagem. Sua senha atual continuará válida até que uma nova seja criada.
                          </p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.7;color:#6b7280;">
                      Se o botão não funcionar, copie e cole este link no navegador:
                    </p>
                    <p style="margin:0;padding:14px 16px;border-radius:14px;background:#0b0c0f;border:1px solid #2a2d34;font-size:13px;line-height:1.6;color:#cbd5e1;word-break:break-all;">
                      ${actionLink}
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0 0;padding:0 8px;font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">
                Proteção de acesso para manter seus dados financeiros em segurança.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
