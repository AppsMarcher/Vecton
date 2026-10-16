import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import vm from "node:vm";
import { agora } from "../src/util.js";
import { devidaSemanal, tentativaRecente, montarEnvio } from "../src/relatorios/agenda.js";
import { CHAVE_SESSAO, sessaoParaApp, scriptSessao, urlDoRelatorio, montarRelatorio } from "../src/relatorios/navegador.js";

// segunda-feira, 19/10/2026, 08:30 em Sao Paulo
const ag = (data, hhmm, dow) => ({ data, hhmm, dow });
const cfgOk = { is_active: true, email: true, email_recipients: ["a@x.com"], schedule_weekday: 1, schedule_time: "08:00:00", schedule_last_fired_on: null };

test("agora() calcula o dia da semana no fuso informado (0 = domingo)", () => {
  assert.equal(agora("America/Sao_Paulo", new Date("2026-10-19T12:00:00Z")).dow, 1);
  assert.equal(agora("America/Sao_Paulo", new Date("2026-10-18T12:00:00Z")).dow, 0);
  // 02:00 UTC de segunda ainda e domingo 23:00 em Sao Paulo
  assert.equal(agora("America/Sao_Paulo", new Date("2026-10-19T02:00:00Z")).dow, 0);
});

test("devidaSemanal: so no dia e depois do horario, ativo, com e-mail e destinatarios", () => {
  assert.equal(devidaSemanal(cfgOk, ag("2026-10-19", "08:30", 1)), true);
  assert.equal(devidaSemanal(cfgOk, ag("2026-10-19", "08:00", 1)), true);
  assert.equal(devidaSemanal(cfgOk, ag("2026-10-19", "07:59", 1)), false);
  assert.equal(devidaSemanal(cfgOk, ag("2026-10-20", "09:00", 2)), false);
  assert.equal(devidaSemanal({ ...cfgOk, is_active: false }, ag("2026-10-19", "09:00", 1)), false);
  assert.equal(devidaSemanal({ ...cfgOk, email: false }, ag("2026-10-19", "09:00", 1)), false);
  assert.equal(devidaSemanal({ ...cfgOk, email_recipients: [] }, ag("2026-10-19", "09:00", 1)), false);
  assert.equal(devidaSemanal({ ...cfgOk, schedule_time: null }, ag("2026-10-19", "09:00", 1)), false);
  assert.equal(devidaSemanal(null, ag("2026-10-19", "09:00", 1)), false);
});
test("devidaSemanal: ja enviado hoje nao repete; envia no mesmo dia mesmo atrasado", () => {
  assert.equal(devidaSemanal({ ...cfgOk, schedule_last_fired_on: "2026-10-19" }, ag("2026-10-19", "10:00", 1)), false);
  assert.equal(devidaSemanal({ ...cfgOk, schedule_last_fired_on: "2026-10-12" }, ag("2026-10-19", "17:45", 1)), true);
});

test("tentativaRecente: bloqueia nova tentativa por 1 hora", () => {
  const agoraMs = new Date("2026-10-19T12:00:00Z").getTime();
  assert.equal(tentativaRecente([{ started_at: "2026-10-19T11:30:00Z" }], agoraMs), true);
  assert.equal(tentativaRecente([{ started_at: "2026-10-19T10:30:00Z" }], agoraMs), false);
  assert.equal(tentativaRecente([], agoraMs), false);
});

test("montarEnvio segue o contrato da Edge Function e limpa/dedup os destinatarios", () => {
  const body = montarEnvio({ subject: "Painel", filename: "p.pdf", bodyText: "oi", html: "<html></html>" }, [" A@X.com ", "a@x.com", "b@x.com", ""]);
  assert.deepEqual(body, { to: ["a@x.com", "b@x.com"], subject: "Painel", filename: "p.pdf", body_text: "oi", html: "<html></html>" });
  assert.throws(() => montarEnvio({ html: "x" }, []), /destinatario/);
  assert.throws(() => montarEnvio({ html: "" }, ["a@x.com"]), /html vazio/);
});

test("sessao do app: formato lido do localStorage e script de injecao", () => {
  const s = sessaoParaApp({ access_token: "tok", refresh_token: "ref", expires_in: 3600, token_type: "bearer", user: { id: "u1" } });
  assert.equal(s.access_token, "tok");
  assert.equal(s.refresh_token, "ref");
  assert.equal(s.user.id, "u1");
  assert.ok(s.expires_at > Math.floor(Date.now() / 1000));
  assert.throws(() => sessaoParaApp({}), /access_token/);
  const guardado = {};
  vm.runInNewContext(scriptSessao(s), { localStorage: { setItem: (k, v) => { guardado[k] = v; } } });
  assert.deepEqual(JSON.parse(guardado[CHAVE_SESSAO]), s);
  assert.equal(CHAVE_SESSAO, "forecastapp-auth-session-v1");
});

test("urlDoRelatorio abre o link direto do relatorio", () => {
  assert.equal(urlDoRelatorio("https://vecton.marcher.com.br/", "comercialPainel"), "https://vecton.marcher.com.br/?report=comercialPainel");
});

// Navegador de verdade (Edge/Chrome) contra uma pagina local que imita o gancho do Painel: prova que a sessao chega
// ao localStorage ANTES do app, que o robo espera o ready() e le o html de build(). Pula se nao houver navegador.
test("navegador: injeta a sessao, espera o relatorio ficar pronto e le o html", async (t) => {
  const pagina = `<!doctype html><meta charset="utf-8"><title>stub</title><body>stub
<script>
  const sessao = localStorage.getItem(${JSON.stringify(CHAVE_SESSAO)});
  let pronto = false;
  setTimeout(() => { pronto = true; }, 600);
  window.VECTON_REPORT_AUTOMATION = { comercialPainel: {
    ready: () => pronto && !!sessao,
    build: async ({ assinatura }) => ({ ano: 2026, mes: 10, cenario: "Fcst 5+7", subject: "Painel de Vendas — Outubro/2026",
      filename: "painel.pdf", bodyText: "assinado por " + assinatura, html: "<html>sessao=" + (JSON.parse(sessao).user || {}).id + "</html>" })
  } };
</script>`;
  const srv = createServer((req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(pagina); });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  try {
    const r = await montarRelatorio({
      appUrl: `http://127.0.0.1:${srv.address().port}`,
      sessao: sessaoParaApp({ access_token: "tok", refresh_token: "ref", user: { id: "robo-1" } }),
      reportId: "comercialPainel",
      assinatura: "Robo",
      timeoutMs: 20000
    });
    assert.equal(r.html, "<html>sessao=robo-1</html>");
    assert.equal(r.subject, "Painel de Vendas — Outubro/2026");
    assert.equal(r.bodyText, "assinado por Robo");
    assert.equal(r.cenario, "Fcst 5+7");
  } catch (e) {
    if (/Nao foi possivel abrir o navegador|playwright-core ausente/.test(String(e.message))) { t.skip("sem navegador/playwright nesta maquina"); return; }
    throw e;
  } finally {
    srv.close();
  }
});
