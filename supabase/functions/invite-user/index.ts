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
// Link do e-mail NÃO é mais o action_link bruto do GoTrue (2026-08-27): era
// consumido pelo Microsoft Defender Safe Links (varredura em tempo de
// ENTREGA do e-mail, tenant @marcher.com.br) antes do usuário clicar, dando
// sempre "link inválido ou expirado" no primeiro clique real. Troca pra link
// do PRÓPRIO app com `?token_hash=...&type=invite` na query — ver nota
// grande em authSession.js (handleInviteRecoveryFlow) no front.
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

const ALLOWED_ROLES = ["super_admin", "admin", "manager", "analyst", "comercial", "marketing", "rps_gestao"];
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
    const redirectTo = body.redirect_to ? String(body.redirect_to).trim() : "";
    if (!email) return json({ error: "Email é obrigatório" }, 400);
    if (!redirectTo) return json({ error: "redirect_to é obrigatório" }, 400);

    // Cliente admin (service_role) — cria o usuário e grava perfil/membership.
    const admin = createClient(url, serviceKey);

    // generateLink (em vez de inviteUserByEmail) cria o usuário e devolve o
    // link de ativação SEM disparar o e-mail pelo SMTP do painel — o e-mail é
    // enviado abaixo, pelo Resend (sendInviteEmailViaResend, fim do arquivo).
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    });
    if (linkErr || !linkData?.user) {
      return json({ error: linkErr?.message || "Falha ao gerar o convite" }, 400);
    }
    const newUserId = linkData.user.id;
    const hashedToken = linkData.properties?.hashed_token;
    const confirmLink = hashedToken ? buildConfirmLink(redirectTo, "invite", hashedToken) : null;

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

    if (!confirmLink) {
      return json({ error: "Usuário criado, mas o link de convite não foi gerado. Use \"Reenviar convite\"." }, 500);
    }
    const emailResult = await sendInviteEmailViaResend(email, confirmLink);
    if (!emailResult.ok) {
      return json({ error: `Usuário criado, mas falhou o envio do e-mail de convite: ${emailResult.error}. Use "Reenviar convite".` }, 500);
    }

    return json({ ok: true, user_id: newUserId, email });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

function ROLE_LABEL(role: string): string {
  return { super_admin: "Super Admin", admin: "Administrador", manager: "Gestor", analyst: "Analista", comercial: "Comercial", marketing: "Marketing", rps_gestao: "RPS Gestão" }[role] ?? "Analista";
}

// Constrói o link do e-mail apontando pro PRÓPRIO app (não mais o
// action_link bruto do GoTrue) -- ver nota no topo do arquivo e em
// authSession.js (handleInviteRecoveryFlow) sobre o Defender Safe Links.
function buildConfirmLink(redirectTo: string, type: string, hashedToken: string): string {
  const sep = redirectTo.includes("?") ? "&" : "?";
  return `${redirectTo}${sep}token_hash=${encodeURIComponent(hashedToken)}&type=${type}`;
}

// Envio do e-mail de convite via Resend -- ver comentário no topo do arquivo
// sobre por que não vai pelo SMTP do painel e por que esta função é
// duplicada aqui e em resend-invite/index.ts em vez de vir de _shared/.
async function sendInviteEmailViaResend(
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
      subject: "Seu acesso ao VectonPlan foi liberado",
      html: buildInviteHtml(confirmLink),
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
function buildInviteHtml(confirmLink: string): string {
  return buildEmailLayout({
    tag: "Bem-vindo",
    title: "Seu acesso foi liberado",
    paragraphs: ["Um administrador criou seu acesso ao VectonPlan. Clique no botão abaixo para definir sua senha e entrar pela primeira vez."],
    buttonLabel: "Definir senha e acessar",
    href: confirmLink,
    noteTitle: "Importante",
    note: "Este link leva você diretamente ao fluxo de ativação da conta. Depois de definir a senha, seu acesso será liberado automaticamente no sistema.",
    fallbackLink: confirmLink,
    footer: "Se você recebeu este e-mail por engano, pode ignorá-lo com segurança.",
  });
}

// ── Layout padrão dos e-mails do Vecton (opção A: claro corporativo) ──────────
// Mesmo bloco replicado em cada Edge Function que envia e-mail (o deploy pelo
// painel do Supabase não resolve import fora da pasta da function). Se mudar
// aqui, replicar nas outras: send-notification-emails, send-report-email,
// invite-user, resend-invite, forgot-password, resend-password -- e em
// supabase/email-templates/. Imagens hospedadas no GitHub Pages do app.
const EMAIL_IMG = "https://vecton.marcher.com.br/assets/email";

type EmailLayoutOpts = {
  tag: string;               // rótulo azul acima do título
  title: string;             // texto puro (é escapado aqui)
  paragraphs: string[];      // texto puro (é escapado aqui)
  buttonLabel?: string;
  href?: string;             // já validado por quem chama
  noteTitle?: string;        // caixa de destaque opcional
  note?: string;
  fallbackLink?: string;     // link por extenso, abaixo do botão
  footer: string;
};

function emailEsc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildEmailLayout(o: EmailLayoutOpts): string {
  const paras = o.paragraphs
    .map((p) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#4a5565;">${emailEsc(p)}</p>`)
    .join("");
  const button = o.buttonLabel && o.href
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 4px;"><tr>
         <td align="center" bgcolor="#1f4fd8" style="border-radius:8px;">
           <a href="${o.href}" style="display:inline-block;padding:14px 24px;font-size:14px;font-weight:700;line-height:1;text-decoration:none;color:#ffffff;">${emailEsc(o.buttonLabel)}</a>
         </td></tr></table>`
    : "";
  const note = o.note
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0 0;background:#f4f6fa;border:1px solid #dde2ea;border-radius:8px;"><tr><td style="padding:14px 16px;">
         ${o.noteTitle ? `<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7686;font-weight:700;">${emailEsc(o.noteTitle)}</p>` : ""}
         <p style="margin:0;font-size:13px;line-height:1.6;color:#4a5565;">${emailEsc(o.note)}</p>
       </td></tr></table>`
    : "";
  const fallback = o.fallbackLink
    ? `<p style="margin:18px 0 6px;font-size:12px;line-height:1.6;color:#8793a3;">Se o botão não funcionar, copie e cole este link no navegador:</p>
       <p style="margin:0;font-size:12px;line-height:1.6;color:#4a5565;word-break:break-all;">${emailEsc(o.fallbackLink)}</p>`
    : "";
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${emailEsc(o.title)}</title></head>
<body style="margin:0;padding:0;background-color:#f1f3f7;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1b2430;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f3f7;margin:0;padding:24px 0;">
    <tr><td align="center" style="padding:0 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dde2ea;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:18px 24px;border-bottom:4px solid #1f4fd8;">
          <img src="${EMAIL_IMG}/logo-vecton.png" width="140" alt="Vecton Planning" style="display:block;width:140px;height:auto;border:0;">
        </td></tr>
        <tr><td style="padding:26px 24px 22px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
            <td valign="middle" style="padding-right:12px;">
              <p style="margin:0 0 6px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#1f4fd8;font-weight:700;">${emailEsc(o.tag)}</p>
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#1b2430;font-weight:700;">${emailEsc(o.title)}</h1>
              ${paras}
              ${button}
            </td>
            <td valign="middle" width="110" style="width:110px;">
              <img src="${EMAIL_IMG}/mascote.png" width="110" alt="Mascote Marcher" style="display:block;width:110px;height:auto;border:0;">
            </td>
          </tr></table>
          ${note}
          ${fallback}
        </td></tr>
        <tr><td style="padding:14px 24px;border-top:1px solid #e6eaf0;font-size:12px;line-height:1.5;color:#8793a3;">${emailEsc(o.footer)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
