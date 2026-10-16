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
// Link do e-mail NÃO é mais o action_link bruto do GoTrue (2026-08-27): era
// consumido pelo Microsoft Defender Safe Links (varredura em tempo de
// ENTREGA do e-mail, tenant @marcher.com.br) antes do usuário clicar, dando
// sempre "link inválido ou expirado" no primeiro clique real. Troca pra link
// do PRÓPRIO app com `?token_hash=...&type=invite` na query — ver nota
// grande em authSession.js (handleInviteRecoveryFlow) no front.
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
    const redirectTo = body.redirect_to ? String(body.redirect_to).trim() : "";
    if (!targetUserId) return json({ error: "user_id é obrigatório" }, 400);
    if (!redirectTo) return json({ error: "redirect_to é obrigatório" }, 400);

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
      options: { redirectTo },
    });
    if (linkErr) return json({ error: linkErr.message || "Falha ao gerar o convite" }, 400);
    const hashedToken = linkData?.properties?.hashed_token;
    if (!hashedToken) return json({ error: "Link de convite não foi gerado" }, 500);
    const confirmLink = buildConfirmLink(redirectTo, "invite", hashedToken);

    const emailResult = await sendInviteEmailViaResend(targetProfile.email, confirmLink);
    if (!emailResult.ok) return json({ error: `Falha ao enviar o e-mail de convite: ${emailResult.error}` }, 500);

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

// Envio do e-mail de convite via Resend -- ver comentário no topo do arquivo
// sobre por que não vai pelo SMTP do painel e por que esta função é
// duplicada aqui e em invite-user/index.ts em vez de vir de _shared/.
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
// com {{ .ConfirmationURL }} já resolvido pro link de confirmação real (o
// Resend não processa a sintaxe de template do Supabase -- o link precisa ir
// pronto). Se o template visual mudar lá, replicar aqui também (e em invite-user).
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
