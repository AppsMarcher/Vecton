// Supabase Edge Function: invite-user
// Convida um novo usuário (envia email de convite) e cria as linhas de
// membership (organization_users) e perfil (user_profiles).
//
// Por que Edge Function: criar conta de auth exige a service_role, que NUNCA
// pode ir pro browser. Aqui ela roda no servidor (a Supabase injeta
// SUPABASE_SERVICE_ROLE_KEY automaticamente nas Edge Functions).
//
// E-mail via Resend, não via inviteUserByEmail (2026-08-26): usamos
// `generateLink` (cria o usuário, devolve o link, NÃO envia e-mail) + envio
// manual pelo Resend — motivo: pro SMTP do painel (Office365), destinatários
// @marcher.com.br têm o nome do remetente sobrescrito pelo GAL/Diretório do
// Outlook, ignorando o "Sender name" configurado no Supabase. send-report-email
// e send-notification-emails já contornam isso do mesmo jeito. A função de
// envio (sendInviteEmailViaResend) é DUPLICADA em resend-invite/index.ts em
// vez de importada de _shared/ -- o deploy é feito pelo editor do painel
// Supabase (sem CLI/config.toml neste projeto), que empacota só a pasta da
// function e não resolve import relativo pra fora dela (erro "Module not
// found" ao tentar `../_shared/...`). Se algum dia passar a deployar via
// CLI (`supabase functions deploy`, que bundla o supabase/functions inteiro),
// aí sim compensa voltar a extrair pra _shared/.
//
// Deploy:
//   supabase functions deploy invite-user --no-verify-jwt
//   (--no-verify-jwt porque validamos o token do chamador manualmente abaixo)
//
// Pré-requisitos no painel Supabase:
//   - Authentication → URL Configuration → Site URL e Redirect URLs apontando
//     para a URL do app (é pra onde o convidado vai definir a senha).
//   - Secrets RESEND_API_KEY e RESEND_FROM (já usados por send-report-email /
//     send-notification-emails).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ROLES = ["super_admin", "admin", "manager", "analyst", "comercial", "rps_gestao"];
// Perfis se combinam (ex: Comercial + RPS Gestão). ROLE_PRIORITY decide qual
// vira o "primário" (access_role) quando vários vêm marcados — mesma ordem
// de PROFILE_ROLE_PRIORITY em usersModule.js. Não confiamos no que o cliente
// já veio calculando como primário: recomputamos aqui em cima da UNIÃO de
// access_role + additional_access_roles do payload, e o gate de "só
// super_admin cria admin/super_admin" também olha essa união inteira — senão
// dava pra escapar do gate mandando o admin escondido em additional_access_roles.
const ROLE_PRIORITY = ALLOWED_ROLES;

function pickPrimaryRole(roles: string[]): string {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? "analyst";
}

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

    const { data: profile } = await caller
      .from("user_profiles")
      .select("organization_id, access_role")
      .eq("user_id", userData.user.id)
      .limit(1)
      .maybeSingle();

    if (!profile) return json({ error: "Perfil do solicitante não encontrado" }, 403);
    if (!["admin", "super_admin"].includes(profile.access_role)) {
      return json({ error: "Apenas administradores podem convidar usuários" }, 403);
    }
    const orgId = profile.organization_id;

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? "").trim();
    const department = String(body.department ?? "").trim();
    const rawRoles = new Set<string>();
    const bodyPrimary = String(body.access_role ?? "").trim();
    if (bodyPrimary) rawRoles.add(bodyPrimary);
    if (Array.isArray(body.additional_access_roles)) {
      for (const r of body.additional_access_roles) rawRoles.add(String(r).trim());
    }
    let selectedRoles = [...rawRoles].filter((r) => ALLOWED_ROLES.includes(r));
    if (!selectedRoles.length) selectedRoles = ["analyst"];
    // Só super_admin pode criar admin/super_admin — checa a união inteira dos
    // perfis marcados, não só o primário.
    if (selectedRoles.some((r) => ["admin", "super_admin"].includes(r)) && profile.access_role !== "super_admin") {
      return json({ error: "Apenas Super Admin pode criar Admin/Super Admin" }, 403);
    }
    const accessRole = pickPrimaryRole(selectedRoles);
    const additionalRoles = selectedRoles.filter((r) => r !== accessRole);
    const management = body.management ? String(body.management).trim() : null;
    const redirectTo = body.redirect_to ? String(body.redirect_to).trim() : null;
    if (!email) return json({ error: "Email é obrigatório" }, 400);

    // Cliente admin (service_role) — cria o usuário e grava perfil/membership.
    const admin = createClient(url, serviceKey);

    // generateLink (em vez de inviteUserByEmail) cria o usuário e devolve o
    // link de ativação SEM disparar o e-mail pelo SMTP do painel — o e-mail é
    // enviado abaixo, pelo Resend (sendInviteEmailViaResend, fim do arquivo).
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (linkErr || !linkData?.user) {
      return json({ error: linkErr?.message || "Falha ao gerar o convite" }, 400);
    }
    const newUserId = linkData.user.id;
    const actionLink = linkData.properties?.action_link;

    const { error: memErr } = await admin
      .from("organization_users")
      .upsert({ organization_id: orgId, user_id: newUserId, role: "viewer" }, { onConflict: "organization_id,user_id" });
    if (memErr) return json({ error: `Convite enviado, mas falhou o vínculo: ${memErr.message}` }, 500);

    const { error: profErr } = await admin
      .from("user_profiles")
      .upsert({
        organization_id: orgId,
        user_id: newUserId,
        email,
        full_name: fullName || email,
        department: department || null,
        profile_label: ROLE_LABEL(accessRole),
        access_role: accessRole,
        additional_access_roles: additionalRoles,
        management,
      }, { onConflict: "organization_id,user_id" });
    if (profErr) return json({ error: `Convite enviado, mas falhou o perfil: ${profErr.message}` }, 500);

    if (!actionLink) {
      return json({ error: "Usuário criado, mas o link de convite não foi gerado. Use \"Reenviar convite\"." }, 500);
    }
    const emailResult = await sendInviteEmailViaResend(email, actionLink);
    if (!emailResult.ok) {
      return json({ error: `Usuário criado, mas falhou o envio do e-mail de convite: ${emailResult.error}. Use "Reenviar convite".` }, 500);
    }

    return json({ ok: true, user_id: newUserId, email });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

function ROLE_LABEL(role: string): string {
  return { super_admin: "Super Admin", admin: "Administrador", manager: "Gestor", analyst: "Analista", comercial: "Comercial", rps_gestao: "RPS Gestão" }[role] ?? "Analista";
}

// Envio do e-mail de convite via Resend -- ver comentário no topo do arquivo
// sobre por que não vai pelo SMTP do painel e por que esta função é
// duplicada aqui e em resend-invite/index.ts em vez de vir de _shared/.
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
// Se o template visual mudar lá, replicar aqui também (e em resend-invite).
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
