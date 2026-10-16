// Navegador sem tela (Edge/Chrome instalado no servidor) para montar um relatorio EXATAMENTE como o Vecton monta
// no botao "Enviar por e-mail": abre o app com a sessao do usuario do robo e pede ao proprio modulo do relatorio
// o html (window.VECTON_REPORT_AUTOMATION, ver reportsComercialPainelModule.js). Nada e enviado daqui.
//
// playwright-core nao traz navegador: usa o Edge/Chrome do Windows (config relatorios.canal / relatorios.executavel).

// Chave e formato da sessao que o app le do localStorage (src/core/constants.js + authSession.js).
export const CHAVE_SESSAO = "forecastapp-auth-session-v1";

export function sessaoParaApp(body) {
  if (!body?.access_token) throw new Error("Sessao do Vecton sem access_token");
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token || "",
    expires_at: body.expires_at || Math.floor(Date.now() / 1000) + (body.expires_in || 3600),
    token_type: body.token_type || "bearer",
    user: body.user || null
  };
}

// Script que roda ANTES do app e deixa a sessao no localStorage (o app entra logado, sem passar pela tela de login).
export function scriptSessao(sessao) {
  return `try { localStorage.setItem(${JSON.stringify(CHAVE_SESSAO)}, ${JSON.stringify(JSON.stringify(sessao))}); } catch (e) {}`;
}

// Endereco do app. O link direto (?report=) ainda vai junto como reforco, mas quem abre o relatorio e o gancho
// window.VECTON_AUTOMATION (app.js), que nao depende de o app ter lido o link.
export function urlDoRelatorio(appUrl, reportId) {
  return `${String(appUrl).replace(/\/$/, "")}/?report=${encodeURIComponent(reportId)}`;
}

export async function montarRelatorio({ appUrl, sessao, reportId, assinatura = "", canal = "msedge", executavel = "", timeoutMs = 120000 }) {
  const { chromium } = await import("playwright-core").catch(() => {
    throw new Error("Pacote playwright-core ausente: rode npm install na pasta do robo");
  });
  const browser = await chromium.launch({
    headless: true,
    ...(executavel ? { executablePath: executavel } : { channel: canal })
  }).catch((e) => {
    throw new Error(`Nao foi possivel abrir o navegador (${executavel || canal}): ${e.message.split("\n")[0]}. Instale o Edge/Chrome ou ajuste relatorios.canal/executavel`);
  });
  const erros = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    await context.addInitScript(scriptSessao(sessao));
    const page = await context.newPage();
    page.on("pageerror", (e) => erros.push(String(e.message || e).slice(0, 200)));
    await page.goto(urlDoRelatorio(appUrl, reportId), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const diagnostico = async (etapa, extra = "") => {
      const texto = await page.evaluate(() => document.body?.innerText?.replace(/\s+/g, " ").slice(0, 200) || "").catch(() => "");
      return new Error(`${etapa} em ${Math.round(timeoutMs / 1000)}s (url ${page.url()}${extra}; tela: "${texto}"; erros: ${erros.slice(0, 3).join(" | ") || "nenhum"})`);
    };
    // 1) o app terminou de carregar (sessao aceita, dados lidos)
    try {
      await page.waitForFunction(() => window.VECTON_AUTOMATION?.ready?.() === true, null, { timeout: timeoutMs, polling: 500 });
    } catch {
      throw await diagnostico("O app nao terminou de carregar");
    }
    // 2) abre o relatorio (idempotente) e confere que abriu
    const aberto = await page.evaluate((id) => window.VECTON_AUTOMATION.openReport(id), reportId);
    if (!aberto?.ok) {
      throw new Error(`O Vecton nao abriu o relatorio ${reportId} para o usuario do robo (permissao: ${aberto?.pode ? "sim" : "NAO"}; tela atual: ${aberto?.view}/${aberto?.selecionado}). Confira o perfil de acesso do usuario do robo.`);
    }
    // 3) o relatorio carregou os dados
    try {
      await page.waitForFunction(
        (id) => window.VECTON_REPORT_AUTOMATION?.[id]?.ready?.() === true,
        reportId,
        { timeout: timeoutMs, polling: 500 }
      );
    } catch {
      throw await diagnostico("O relatorio abriu mas nao terminou de carregar os dados");
    }
    return await page.evaluate(async ({ id, ass }) => await window.VECTON_REPORT_AUTOMATION[id].build({ assinatura: ass }), { id: reportId, ass: assinatura });
  } finally {
    await browser.close().catch(() => {});
  }
}
