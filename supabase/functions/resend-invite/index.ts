// Supabase Edge Function: resend-invite
// Reenvia o email de CONVITE original para um usuário que já foi convidado
// mas ainda não definiu a senha (pending). Diferente de "reenviar senha"
// (recovery, público, feito direto no front via /auth/v1/recover): reenviar
// convite exige service_role, por isso precisa de Edge Function.
//
// E-mail via Resend, não via inviteUserByEmail (2026-08-26): mesmo mecanismo
// de invite-user/index.ts — `generateLink` + envio manual pelo Resend, porque
// o SMTP do painel (Office365) tem o "Sender name" ignorado pelo Outlook em
// destinatários @marcher.com.br (GAL/Diretório do Exchange sobrepõe). A
// função de envio é duplicada aqui e em invite-user/index.ts em vez de vir de
// _shared/ -- o deploy é feito pelo editor do painel Supabase (sem CLI neste
// projeto), que não resolve import relativo pra fora da pasta da function.
//
// Deploy:
//   supabase functions deploy resend-invite --no-verify-jwt
//   (--no-verify-jwt porque validamos o token do chamador manualmente abaixo)

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
      return json({ error: "Apenas administradores podem reenviar convites" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body.user_id ?? "").trim();
    const redirectTo = body.redirect_to ? String(body.redirect_to).trim() : null;
    if (!targetUserId) return json({ error: "user_id é obrigatório" }, 400);

    const admin = createClient(url, serviceKey);

    // Confirma que o alvo pertence à MESMA org do chamador — evita reenviar
    // convite pra usuário de outra organização.
    const { data: targetProfile } = await admin
      .from("user_profiles")
      .select("organization_id, email, access_role")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (!targetProfile || targetProfile.organization_id !== callerProfile.organization_id) {
      return json({ error: "Usuário não encontrado nesta organização" }, 404);
    }
    // Só Super Admin reenvia convite de Admin/Super Admin (mesma regra de invite-user).
    if (["admin", "super_admin"].includes(targetProfile.access_role) && callerProfile.access_role !== "super_admin") {
      return json({ error: "Apenas Super Admin pode reenviar convite de Admin/Super Admin" }, 403);
    }
    if (!targetProfile.email) return json({ error: "Usuário sem email cadastrado" }, 400);

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email: targetProfile.email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (linkErr) return json({ error: linkErr.message || "Falha ao gerar o convite" }, 400);
    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) return json({ error: "Link de convite não foi gerado" }, 500);

    const emailResult = await sendInviteEmailViaResend(targetProfile.email, actionLink);
    if (!emailResult.ok) return json({ error: `Falha ao enviar o e-mail de convite: ${emailResult.error}` }, 500);

    return json({ ok: true, email: targetProfile.email });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

// Envio do e-mail de convite via Resend -- ver comentário no topo do arquivo
// sobre por que não vai pelo SMTP do painel e por que esta função é
// duplicada aqui e em invite-user/index.ts em vez de vir de _shared/.
async function sendInviteEmailViaResend(
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
// não processa a sintaxe de template do Supabase -- o link precisa ir pronto).
// Se o template visual mudar lá, replicar aqui também (e em invite-user).
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
