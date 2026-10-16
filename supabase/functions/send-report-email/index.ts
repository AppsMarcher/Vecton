// Supabase Edge Function: send-report-email
// Gera o PDF do relatório (Chrome de verdade, via Browserless) e envia por
// e-mail via Resend (API HTTPS).
//
// Por que gerar o PDF aqui (servidor) e não no navegador: tentamos 3 vezes
// gerar o PDF no cliente com html2canvas (rasteriza a tela como
// "screenshot"), e nas 3 saiu com defeito visual (fundo preto/diferente do
// que a impressão nativa produz) -- html2canvas NÃO usa o motor de impressão
// real do navegador, é uma aproximação. Browserless roda Chromium de verdade
// e usa page.pdf() (o mesmo motor por trás de window.print()), garantindo
// fidelidade idêntica ao "Imprimir" -- exatamente o mesmo html/CSS do One
// Page Report, sem nenhuma modificação.
//
// Por que Resend e não SMTP: Supabase Edge Functions bloqueiam conexões de
// saída nas portas 25 e 587 (documentado em supabase.com/docs/guides/functions/limits)
// -- SMTP bruto (ex: Office365 via denomailer) NUNCA consegue nem abrir a
// conexão. Resend usa HTTPS normal (porta 443), que não é bloqueada.
//
// Pré-requisito (secrets, configurar uma vez):
//   supabase secrets set BROWSERLESS_API_TOKEN=xxxxxxxxx
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
//   supabase secrets set RESEND_FROM="VectonPlan <no-reply@marcher.com.br>"
//   (RESEND_FROM só funciona com domínio VERIFICADO no Resend -- já está ok
//   pra marcher.com.br. BROWSERLESS_API_TOKEN vem do dashboard de conta em
//   browserless.io, tem free tier limitado -- verificar necessidade de plano
//   pago pra uso contínuo.)
//
// Deploy:
//   supabase functions deploy send-report-email --no-verify-jwt
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_HTML_CHARS = 2 * 1024 * 1024; // 2MB de HTML -- generoso pro One Page Report

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "Não autenticado" }, 401);

    // Cliente como o chamador -- só exige sessão válida + vínculo com uma
    // organização (qualquer papel pode enviar um relatório que já tem acesso
    // pra ver na tela, sem restrição extra de admin).
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Sessão inválida" }, 401);

    const { data: profile } = await caller
      .from("user_profiles")
      .select("organization_id")
      .eq("user_id", userData.user.id)
      .limit(1)
      .maybeSingle();
    if (!profile) return json({ error: "Perfil do solicitante não encontrado" }, 403);

    const body = await req.json().catch(() => ({}));
    const to = Array.isArray(body.to)
      ? body.to.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean)
      : [];
    const cc = Array.isArray(body.cc)
      ? body.cc.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean)
      : [];
    const subject = String(body.subject ?? "Relatório VectonPlan").trim();
    const filename = String(body.filename ?? "relatorio.pdf").trim();
    const bodyText = String(body.body_text ?? "Segue em anexo o relatório solicitado.").trim();
    const html = String(body.html ?? "");

    if (!to.length) return json({ error: "Informe ao menos um destinatário" }, 400);
    if (!to.every((e: string) => EMAIL_RE.test(e))) return json({ error: "Endereço de e-mail inválido em Para" }, 400);
    if (cc.length && !cc.every((e: string) => EMAIL_RE.test(e))) return json({ error: "Endereço de e-mail inválido em Cc" }, 400);
    if (!html) return json({ error: "Conteúdo do relatório ausente" }, 400);
    if (html.length > MAX_HTML_CHARS) return json({ error: "Relatório excede o tamanho máximo permitido" }, 400);

    const browserlessToken = Deno.env.get("BROWSERLESS_API_TOKEN");
    if (!browserlessToken) {
      return json({ error: "Geração de PDF não configurada nesta function (secret BROWSERLESS_API_TOKEN ausente)" }, 500);
    }

    // format/landscape/margin/scale explicitos (em vez de preferCSSPageSize):
    // o preferCSSPageSize nao estava aplicando a margem do @page (7mm) de
    // forma confiavel no Chromium do Browserless, espremendo o conteudo e
    // quebrando texto de linha (linhas da tabela saiam mais altas que na
    // impressao nativa). Repetir aqui os mesmos valores do @page (A4
    // paisagem, 7mm) remove essa ambiguidade -- printBackground continua
    // obrigatorio (Chrome nao imprime cor de fundo por padrao, mesmo com
    // print-color-adjust:exact no CSS).
    const pdfRes = await fetch(`https://production-sfo.browserless.io/pdf?token=${browserlessToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        options: {
          printBackground: true,
          landscape: true,
          format: "A4",
          margin: { top: "7mm", right: "7mm", bottom: "7mm", left: "7mm" },
          scale: 1,
        },
      }),
    });
    if (!pdfRes.ok) {
      const errText = await pdfRes.text().catch(() => "");
      return json({ error: `Falha ao gerar o PDF (Browserless ${pdfRes.status}): ${errText.slice(0, 300)}` }, 502);
    }
    const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
    const pdfBase64 = bytesToBase64(pdfBytes);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return json({ error: "Envio de e-mail não configurado nesta function (secret RESEND_API_KEY ausente)" }, 500);
    }
    const from = Deno.env.get("RESEND_FROM") || "VectonPlan <onboarding@resend.dev>";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        ...(cc.length ? { cc } : {}),
        subject,
        text: bodyText,
        html: buildEmailLayout({
          tag: "Relatório",
          title: subject,
          paragraphs: bodyText.split("\n").filter(Boolean),
          footer: "Relatório em anexo (PDF) · Marcher Brasil Agroindustrial",
        }),
        attachments: [
          {
            filename,
            content: pdfBase64,
            content_type: "application/pdf",
          },
        ],
      }),
    });

    const resendData = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      return json({ error: resendData?.message || `Falha ao enviar e-mail (Resend ${resendRes.status})` }, 502);
    }

    return json({ ok: true, sent_to: to, resend_id: resendData?.id });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
