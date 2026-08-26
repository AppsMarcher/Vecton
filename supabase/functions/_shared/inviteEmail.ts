// Envio do e-mail de convite via Resend — usado por invite-user e
// resend-invite.
//
// Por que não deixar o Supabase Auth enviar (inviteUserByEmail) direto pelo
// SMTP customizado configurado no painel (Office365, no-reply@marcher.com.br):
// para destinatários do mesmo domínio/tenant (@marcher.com.br), o Outlook
// resolve o nome do remetente pelo Diretório/GAL do Exchange Online e IGNORA
// o "Sender name" configurado em Authentication > Emails > SMTP Settings do
// Supabase — mostra o nome cadastrado na ficha da caixa no M365 (hoje
// desatualizado) em vez do nome do produto. Constatado em 2026-08-26 com
// print do Outlook mostrando "Marcher Brasil" mesmo com o Sender name do
// Supabase já configurado como "VectonPlan".
//
// send-report-email e send-notification-emails já contornam isso enviando
// pelo Resend (API HTTPS, fora do Exchange — o cabeçalho From é respeitado
// mesmo para destinatários internos). Este arquivo replica o mesmo mecanismo
// para o e-mail de convite: em vez de `admin.auth.admin.inviteUserByEmail`
// (que cria o usuário E dispara o envio pelo SMTP do painel), as duas
// functions chamam `admin.auth.admin.generateLink({ type: "invite", ... })`
// (cria o usuário e devolve o link, SEM enviar e-mail) e usam este helper
// para mandar o e-mail pelo Resend.
//
// Pré-requisito (secrets — já existem no projeto, usados pelas outras
// functions de e-mail):
//   RESEND_API_KEY
//   RESEND_FROM   (ex: "Vecton Marcher <no-reply@marcher.com.br>")

export async function sendInviteEmailViaResend(
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
      subject: "Seu acesso ao VectonPlan foi liberado",
      html: buildInviteHtml(actionLink),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.message || `Falha no Resend (${res.status})` };
  return { ok: true };
}

// Mesmo conteúdo/visual de supabase/email-templates/invite-user.html, só que
// com {{ .ConfirmationURL }} já resolvido para o action_link real (o Resend
// não processa a sintaxe de template do Supabase — o link precisa ir pronto).
// Se o template visual mudar lá, replicar aqui também.
function buildInviteHtml(actionLink: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seu acesso ao VectonPlan</title>
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
                      Você recebeu um convite
                    </h1>
                    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:#a1a7b3;">
                      Um administrador criou seu acesso ao VectonPlan. Clique no botão abaixo para definir sua senha e entrar pela primeira vez.
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 24px 0;">
                      <tr>
                        <td align="center" bgcolor="#4f7cff" style="border-radius:14px;">
                          <a href="${actionLink}" style="display:inline-block;padding:15px 24px;font-size:15px;font-weight:700;line-height:1;text-decoration:none;color:#ffffff;">
                            Definir senha e acessar
                          </a>
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;background:#0b0c0f;border:1px solid #2a2d34;border-radius:16px;">
                      <tr>
                        <td style="padding:18px 18px 16px 18px;">
                          <p style="margin:0 0 8px 0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;font-weight:700;">
                            Importante
                          </p>
                          <p style="margin:0;font-size:14px;line-height:1.7;color:#cbd5e1;">
                            Este link leva você diretamente ao fluxo de ativação da conta. Depois de definir a senha, seu acesso será liberado automaticamente no sistema.
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
                Se você recebeu este e-mail por engano, pode ignorá-lo com segurança.
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
