// Supabase Edge Function: resend-password
// Envia o email de REDEFINIÇÃO de senha para um usuário já ativo que
// esqueceu a senha (botão "Reenviar senha" no painel de Usuários, só
// admin/super_admin). Substitui o antigo fluxo público GoTrue
// /auth/v1/recover chamado direto do front (requestPasswordRecovery em
// app.js, removido).
//
// Por que trocar para Edge Function + Resend (2026-08-26): o /auth/v1/recover
// manda pelo SMTP do painel (Office365) -- para destinatários @marcher.com.br
// (mesmo tenant), o Outlook resolve o nome do remetente pelo GAL/Diretório do
// Exchange e ignora o "Sender name" configurado no Supabase, mostrando o nome
// desatualizado da caixa no M365 em vez do nome do produto. Mesmo problema (e
// mesmo fix) já aplicado em invite-user/resend-invite: `generateLink` (cria o
// link, NÃO envia e-mail) + envio manual pelo Resend (API HTTPS, fora do
// Exchange -- cabeçalho From respeitado mesmo para destinatários internos).
// send-report-email/send-notification-emails já usavam esse caminho.
//
// Bônus de segurança: o endpoint antigo era público (só a anon key, sem
// checar quem chama) -- a UI escondia o botão pra não-admin, mas a chamada
// em si não validava nada. Esta function agora exige sessão de
// admin/super_admin da mesma organização do alvo, mesmo gate de
// set-user-password/resend-invite.
//
// A lógica de envio é DUPLICADA aqui em vez de importada de _shared/ -- o
// deploy é feito pelo editor do painel Supabase (sem CLI/config.toml neste
// projeto), que empacota só a pasta da própria function e não resolve import
// relativo pra fora dela.
//
// Link do e-mail NÃO é mais o action_link bruto do GoTrue (2026-08-27): era
// consumido pelo Microsoft Defender Safe Links (varredura em tempo de
// ENTREGA do e-mail, tenant @marcher.com.br) antes do usuário clicar, dando
// sempre "link inválido ou expirado" no primeiro clique real. Troca pra link
// do PRÓPRIO app com `?token_hash=...&type=recovery` na query — ver nota
// grande em authSession.js (handleInviteRecoveryFlow) no front.
//
// Deploy:
//   supabase functions deploy resend-password --no-verify-jwt
//   (--no-verify-jwt porque validamos o token do chamador manualmente abaixo)
//
// Pré-requisitos: secrets RESEND_API_KEY e RESEND_FROM (já existem, usados
// por invite-user/resend-invite/send-report-email/send-notification-emails).

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "Não autenticado" }, 401);

    // Cliente como o chamador — valida quem é e qual o papel/org dele.
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Sessão inválida" }, 401);

    const { data: callerProfile } = await caller
      .from("user_profiles")
      .select("organization_id, access_role")
      .eq("user_id", userData.user.id)
      .limit(1)
      .maybeSingle();

    if (!callerProfile) return json({ error: "Perfil do solicitante não encontrado" }, 403);
    if (!["admin", "super_admin"].includes(callerProfile.access_role)) {
      return json({ error: "Apenas administradores podem reenviar redefinição de senha" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body.user_id ?? "").trim();
    const redirectTo = body.redirect_to ? String(body.redirect_to).trim() : "";
    if (!targetUserId) return json({ error: "user_id é obrigatório" }, 400);
    if (!redirectTo) return json({ error: "redirect_to é obrigatório" }, 400);

    const admin = createClient(url, serviceKey);

    // Confirma que o alvo pertence à MESMA org do chamador — evita disparar
    // reset pra usuário de outra organização.
    const { data: targetProfile } = await admin
      .from("user_profiles")
      .select("organization_id, email, access_role")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (!targetProfile || targetProfile.organization_id !== callerProfile.organization_id) {
      return json({ error: "Usuário não encontrado nesta organização" }, 404);
    }
    // Só Super Admin reenvia senha de Admin/Super Admin (mesma regra de resend-invite/set-user-password).
    if (["admin", "super_admin"].includes(targetProfile.access_role) && callerProfile.access_role !== "super_admin") {
      return json({ error: "Apenas Super Admin pode reenviar senha de um Admin/Super Admin" }, 403);
    }
    if (!targetProfile.email) return json({ error: "Usuário sem email cadastrado" }, 400);

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: targetProfile.email,
      options: { redirectTo },
    });
    if (linkErr) return json({ error: linkErr.message || "Falha ao gerar o link de redefinição" }, 400);
    const hashedToken = linkData?.properties?.hashed_token;
    if (!hashedToken) return json({ error: "Link de redefinição não foi gerado" }, 500);
    const confirmLink = buildConfirmLink(redirectTo, "recovery", hashedToken);

    const emailResult = await sendResetPasswordEmailViaResend(targetProfile.email, confirmLink);
    if (!emailResult.ok) return json({ error: `Falha ao enviar o e-mail de redefinição: ${emailResult.error}` }, 500);

    return json({ ok: true, email: targetProfile.email });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

// Constrói o link do e-mail apontando pro PRÓPRIO app (não mais o
// action_link bruto do GoTrue) -- ver nota no topo do arquivo e em
// authSession.js (handleInviteRecoveryFlow) sobre o Defender Safe Links.
function buildConfirmLink(redirectTo: string, type: string, hashedToken: string): string {
  const sep = redirectTo.includes("?") ? "&" : "?";
  return `${redirectTo}${sep}token_hash=${encodeURIComponent(hashedToken)}&type=${type}`;
}

// Envio do e-mail de redefinição de senha via Resend -- ver comentário no
// topo do arquivo sobre por que não vai pelo SMTP do painel.
async function sendResetPasswordEmailViaResend(
  to: string,
  confirmLink: string
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
      html: buildResetPasswordHtml(confirmLink),
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
function buildResetPasswordHtml(confirmLink: string): string {
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
                          <a href="${confirmLink}" style="display:inline-block;padding:15px 24px;font-size:15px;font-weight:700;line-height:1;text-decoration:none;color:#ffffff;">
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
                      ${confirmLink}
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
