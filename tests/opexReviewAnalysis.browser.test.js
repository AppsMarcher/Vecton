const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { openCockpitPage, root } = require('./helpers/opexCockpitPage');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.COCKPIT_BROWSER_CHANNEL || 'msedge' });
  try {
    const { page, errors } = await openCockpitPage(browser);
    await page.evaluate(() => {
      window.store = null; window.saveCalls = []; window.conflictNext = false; window.canWrite = true;
      window.rpcHandler = async (name, args) => {
        if (name === 'opex_get_analysis') return store ? { ...store, found: true, canWrite } : { found: false, canWrite, live: {} };
        if (name === 'opex_save_analysis') {
          saveCalls.push(args);
          if (conflictNext) { conflictNext = false; throw new Error(JSON.stringify({ code: '40001', message: 'A análise foi alterada por outra sessão' })); }
          await new Promise(r => setTimeout(r, 60));
          store = { id: 'an-1', version: (store?.version || 0) + 1, nature: args.p_fields.nature, analysisState: args.p_fields.analysisState, monitor: args.p_fields.monitor, cause: args.p_fields.cause, futureEffect: args.p_fields.futureEffect, expectedFinancialImpact: args.p_fields.expectedFinancialImpact, dataChangedSinceReview: false };
          rpcState.presence = [{ costCenterId: 'cc2', accountNumber: '102', analyses: 1, actions: 0, open: 0 }];
          return { ...store, found: true, canWrite: true };
        }
      };
      window.ledgerRows = [
        { id: 'l1', entry_date: '2026-09-15', branch_code: '01', history: 'Zeta serviço', lot_code: 'L2', amount: 200, reference_month: 9 },
        { id: 'l2', entry_date: '2026-09-02', branch_code: '01', history: 'Alfa serviço', lot_code: 'L1', amount: 300.5, reference_month: 9 }
      ];
      testModule.render();
    });
    await page.waitForSelector('.cockpit-groups-panel .cockpit-table');
    const openPanel = async () => {
      await page.locator('.cockpit-groups-panel tbody tr', { has: page.locator('th:has-text("Serviços")') }).click();
      await page.locator('.cockpit-drill-pop tr[data-row]').first().click();
      await page.locator('.opex-analysis-pop [data-opex-body] textarea, .opex-analysis-pop [data-opex-body] .opex-empty').first().waitFor();
    };
    await openPanel();
    const pop = page.locator('.opex-analysis-pop');
    // conta abre direto em Analisar variação (não em lançamentos) e a consulta do ledger só ocorre sob demanda
    assert.equal(await pop.locator('[data-opex-tab][aria-selected="true"]').innerText().then(t => t.trim()), 'Analisar variação');
    assert.equal(await page.evaluate(() => ledgerCalls), 0);
    const tabs = await pop.locator('[data-opex-tab]').allInnerTexts();
    assert.deepEqual(tabs.map(t => t.trim()), ['Analisar variação', 'Plano de ação', 'Ver lançamentos']);
    const head = await pop.innerText();
    for (const expected of ['102', 'Consultoria', 'Serviços', '200', 'Apoio', 'Set/2026', 'Forecast favorito']) assert.ok(head.includes(expected), `cabeçalho deve conter ${expected}`);
    assert.equal(await page.locator('.cockpit-drill-pop').count(), 0, 'drilldown fecha ao abrir a análise');

    // rascunho preservado entre abas
    await pop.locator('[data-f="cause"]').fill('Reajuste do contrato');
    assert.deepEqual(await pop.locator('[data-f="analysisState"] option').allInnerTexts(), ['Em análise', 'Analisado', 'Cancelado']);
    assert.match(await pop.locator('.gap-badge').innerText(), /^Set\/2026$/i);
    // tamanho estável entre abas e fundo esmaecido
    const hOf = () => pop.evaluate(n => n.offsetHeight); // offsetHeight ignora a animação de escala
    const h0 = await hOf();
    assert.equal(await page.locator('.vp-scrim').count(), 1);
    await pop.locator('[data-opex-tab="plan"]').click();
    assert.equal(await hOf(), h0);
    await pop.locator('[data-opex-tab="ledger"]').click();
    assert.equal(await hOf(), h0);
    await pop.locator('[data-opex-tab="cause"]').click();
    await pop.locator('[data-opex-tab="plan"]').click();
    await pop.locator('[data-opex-tab="ledger"]').click();
    await pop.locator('.opex-ledger').waitFor();
    assert.equal(await page.evaluate(() => ledgerCalls), 1);
    assert.match(await pop.locator('[data-opex-tab="cause"]').innerText(), /Rascunho/i);
    assert.match(await pop.locator('.opex-ledger tfoot').innerText(), /500,50/);
    assert.match(await pop.locator('.opex-ledger tbody tr').first().innerText(), /02\/09\/2026/);
    assert.match(await page.evaluate(() => lastLedgerQuery), /account_number=eq\.102.*cost_center_id=eq\.cc2|cost_center_id=eq\.cc2.*account_number=eq\.102/);
    await pop.locator('.opex-ledger th[data-sort="history"]').click();
    assert.match(await pop.locator('.opex-ledger tbody tr').first().innerText(), /Alfa/);
    await pop.locator('[data-opex-tab="cause"]').click();
    assert.equal(await pop.locator('[data-f="cause"]').inputValue(), 'Reajuste do contrato');

    // validações antes de salvar
    await pop.locator('[data-f="analysisState"]').selectOption('analyzed');
    await pop.locator('[data-opex-save]').click();
    assert.match(await pop.locator('[data-opex-banner]').innerText(), /natureza/i);
    assert.equal(await page.evaluate(() => saveCalls.length), 0);
    await pop.locator('[data-f="nature"]').selectOption('recurring');
    await pop.locator('[data-f="impact"]').fill('1500,5');
    await pop.locator('[data-f="impact"]').blur();
    assert.equal(await pop.locator('[data-f="impact"]').inputValue(), '1.500,50');
    // duplo clique grava uma vez e não envia valores financeiros do cliente
    await pop.locator('[data-opex-save]').dblclick();
    await pop.locator('[data-opex-body]:has-text("Versão 1")').waitFor();
    const calls = await page.evaluate(() => saveCalls);
    assert.equal(calls.length, 1);
    assert.deepEqual(Object.keys(calls[0].p_fields).sort(), ['analysisState', 'cause', 'expectedFinancialImpact', 'futureEffect', 'monitor', 'nature']);
    assert.equal(calls[0].p_fields.expectedFinancialImpact, 1500.5);
    assert.equal(calls[0].p_expected_version, 0);
    assert.ok(calls[0].p_idem_key);
    assert.doesNotMatch(await pop.locator('[data-opex-tab="cause"]').innerText(), /Rascunho/i);

    // conflito de versão: mensagem tratável e rascunho preservado
    await pop.locator('[data-f="cause"]').fill('Reajuste e volume');
    await page.evaluate(() => { conflictNext = true; store.version = 7; });
    await pop.locator('[data-opex-save]').click();
    await pop.locator('[data-opex-reload-keep]').waitFor();
    await pop.locator('[data-opex-reload-keep]').click();
    await pop.locator('[data-opex-body]:has-text("Versão 7")').waitFor();
    assert.equal(await pop.locator('[data-f="cause"]').inputValue(), 'Reajuste e volume', 'rascunho mantido após recarregar');
    await pop.locator('[data-opex-save]').click();
    await pop.locator('[data-opex-body]:has-text("Versão 8")').waitFor();
    assert.equal((await page.evaluate(() => saveCalls)).at(-1).p_expected_version, 7);

    // fechar com rascunho pede confirmação (e respeita a recusa)
    await pop.locator('[data-f="cause"]').fill('Mais um texto');
    await page.evaluate(() => { confirmAnswer = false; });
    await pop.locator('[data-opex-close]').click();
    assert.equal(await pop.count(), 1);
    assert.equal(await page.evaluate(() => confirmCalls.length), 1);
    await page.evaluate(() => { confirmAnswer = true; });
    // Voltar retorna ao drilldown do mesmo grupo e já mostra o ícone do registro salvo
    await pop.locator('[data-opex-back]').click();
    await page.locator('.cockpit-drill-pop').waitFor();
    assert.match(await page.locator('.cockpit-drill-pop .gap-title').innerText(), /Serviços/);
    await page.locator('.cockpit-drill-pop tbody tr:has(.opex-rec)').waitFor();
    // reabrir recarrega o que foi persistido
    await page.locator('.cockpit-drill-pop tr[data-row]').first().click();
    await page.locator('.opex-analysis-pop [data-f="cause"]').waitFor();
    assert.equal(await page.locator('.opex-analysis-pop [data-f="cause"]').inputValue(), 'Reajuste e volume');
    await page.screenshot({ path: path.join(root, 'artifacts/opex/analysis-desktop.png') });
    // Escape fecha; sem permissão de escrita o formulário é somente leitura
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.opex-analysis-pop').count(), 0);
    await page.evaluate(() => { canWrite = false; });
    await page.locator('.cockpit-groups-panel tbody tr', { has: page.locator('th:has-text("Serviços")') }).click();
    await page.locator('.cockpit-drill-pop tr[data-row]').first().click();
    await page.locator('.opex-analysis-pop [data-f="cause"]').waitFor();
    assert.equal(await page.locator('.opex-analysis-pop [data-opex-save]').count(), 0);
    assert.equal(await page.locator('.opex-analysis-pop [data-f="cause"]').isDisabled(), true);
    // falha ao carregar não vira "sem análise"
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const prev = window.rpcHandler; window.rpcHandler = async (n, a) => { if (n === 'opex_get_analysis') throw new Error('falha de rede'); return prev(n, a); }; });
    await page.locator('.cockpit-groups-panel tbody tr', { has: page.locator('th:has-text("Serviços")') }).click();
    await page.locator('.cockpit-drill-pop tr[data-row]').first().click();
    await page.locator('.opex-analysis-pop [data-opex-reload]').waitFor();
    await page.keyboard.press('Escape');
    // mobile sem overflow global
    await page.setViewportSize({ width: 390, height: 900 });
    await page.evaluate(() => { window.rpcHandler = null; });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log('opexReview análise (fluxo, abas, rascunho, conflito, voltar, leitura): OK');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
