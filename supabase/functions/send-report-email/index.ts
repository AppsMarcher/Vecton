// Supabase Edge Function: send-report-email
// Gera o PDF do relatório (Chrome de verdade, via Browserless) e:
//   - modo padrão: envia por e-mail via Resend (API HTTPS);
//   - modo "download" (body.mode === "download"): devolve o PDF em base64
//     pro navegador baixar direto, sem enviar e-mail (nome mantido por ser o
//     uso original/principal da function; ver `isDownload` abaixo).
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
    // mode "download": só gera o PDF e devolve em base64 pro navegador baixar
    // (sem e-mail, sem destinatário) -- mesmo HTML/Browserless do envio por
    // e-mail, garantindo o PDF baixado idêntico ao anexado no e-mail.
    const isDownload = body.mode === "download";
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

    if (!isDownload) {
      if (!to.length) return json({ error: "Informe ao menos um destinatário" }, 400);
      if (!to.every((e: string) => EMAIL_RE.test(e))) return json({ error: "Endereço de e-mail inválido em Para" }, 400);
      if (cc.length && !cc.every((e: string) => EMAIL_RE.test(e))) return json({ error: "Endereço de e-mail inválido em Cc" }, 400);
    }
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

    if (isDownload) {
      return json({ ok: true, filename, pdf_base64: pdfBase64 });
    }

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
