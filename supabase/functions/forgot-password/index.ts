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
    const redirectTo = body.redirect_to ? String(body.redirect_to).trim() : "";
    if (!email || !email.includes("@")) return json({ error: "E-mail inválido" }, 400);
    if (!redirectTo) return json({ error: "redirect_to é obrigatório" }, 400);

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
      options: { redirectTo },
    });
    if (linkErr) {
      console.error("generateLink falhou:", linkErr.message);
      return GENERIC_OK;
    }
    const hashedToken = linkData?.properties?.hashed_token;
    if (!hashedToken) return GENERIC_OK;
    const confirmLink = buildConfirmLink(redirectTo, "recovery", hashedToken);

    const emailResult = await sendResetPasswordEmailViaResend(profile.email, confirmLink);
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

// Constrói o link do e-mail apontando pro PRÓPRIO app (não mais o
// action_link bruto do GoTrue) -- ver nota no topo do arquivo e em
// authSession.js (handleInviteRecoveryFlow) sobre o Defender Safe Links.
function buildConfirmLink(redirectTo: string, type: string, hashedToken: string): string {
  const sep = redirectTo.includes("?") ? "&" : "?";
  return `${redirectTo}${sep}token_hash=${encodeURIComponent(hashedToken)}&type=${type}`;
}

// Envio do e-mail de redefinição de senha via Resend — réplica exata do
// helper em resend-password/index.ts (mesmo template visual). Se o layout
// mudar lá, replicar aqui também.
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
  return buildEmailLayout({
    tag: "Segurança",
    title: "Redefina sua senha",
    paragraphs: ["Recebemos uma solicitação para redefinir sua senha de acesso ao VectonPlan. Use o botão abaixo para continuar com segurança."],
    buttonLabel: "Criar nova senha",
    href: confirmLink,
    noteTitle: "Atenção",
    note: "Se você não pediu a redefinição, basta ignorar esta mensagem. Sua senha atual continuará válida até que uma nova seja criada.",
    fallbackLink: confirmLink,
    footer: "Proteção de acesso para manter seus dados financeiros em segurança.",
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
