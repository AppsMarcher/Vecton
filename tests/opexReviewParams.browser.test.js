const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openCockpitPage } = require('./helpers/opexCockpitPage');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.COCKPIT_BROWSER_CHANNEL || 'msedge' });
  try {
    const { page, errors } = await openCockpitPage(browser);
    await page.evaluate(() => {
      window.saves = []; window.conflictNext = false;
      rpcState.thresholds = { yellowMoney: 10000, yellowPct: 5, redMoney: 20000, redPct: 10, direction: 'both', version: 0, canEdit: true };
      window.rpcHandler = async (name, args) => {
        if (name === 'opex_save_thresholds') {
          saves.push(args);
          if (conflictNext) throw new Error(JSON.stringify({ code: '40001', message: 'Versão desatualizada' }));
          const v = args.p_values;
          rpcState.thresholds = { ...v, version: args.p_expected_version + 1, canEdit: true };
          return rpcState.thresholds;
        }
      };
      testModule.render();
    });
    await page.waitForSelector('.cockpit-groups-panel .cockpit-table');
    const level = async name => page.locator('.cockpit-groups-panel tbody tr', { has: page.locator(`th:has-text("${name}")`) }).locator('.opex-signal').getAttribute('data-level');
    assert.equal(await level('Pessoal'), 'yellow');
    assert.equal(await page.locator('[data-opex-params]').count(), 0, 'o botão Parâmetros saiu do card do Cockpit');
    // item de menu "Sinaleira OPEX": só para quem edita (servidor decide)
    await page.evaluate(() => review.refreshSignalMenu());
    assert.equal(await page.evaluate(() => signalMenu), true);
    // tela dentro de Parâmetros
    const pop = page.locator('#opexSignal-view');
    await page.evaluate(() => { document.querySelector('#cockpit-view').classList.remove('active'); document.querySelector('#opexSignal-view').classList.add('active'); review.renderSignalView('opexSignal'); });
    await pop.locator('[data-p]').first().waitFor();
    assert.deepEqual(await pop.locator('[data-p]').evaluateAll(nodes => nodes.map(n => n.value)), ['10.000,00', '5,0', '20.000,00', '10,0', 'on', 'on']);
    // validações: vermelho menor que amarelo e valores inválidos não chamam o servidor
    await pop.locator('[data-p="redMoney"]').fill('9000');
    await pop.locator('[data-opex-params-save]').click();
    assert.match(await pop.locator('[data-opex-banner]').innerText(), /vermelho/i);
    await pop.locator('[data-p="redMoney"]').fill('abc');
    await pop.locator('[data-opex-params-save]').click();
    assert.match(await pop.locator('[data-opex-banner]').innerText(), /positivos/i);
    assert.equal(await page.evaluate(() => saves.length), 0);
    // conflito
    await pop.locator('[data-p="redMoney"]').fill('20000');
    await page.evaluate(() => { conflictNext = true; });
    await pop.locator('[data-opex-params-save]').click();
    await pop.locator('[data-opex-banner]:has-text("outra pessoa")').waitFor();
    await page.evaluate(() => { conflictNext = false; });
    // formatação pt-BR ao sair do campo e direção
    await pop.locator('[data-p="redPct"]').fill('9');
    await pop.locator('[data-p="yellowMoney"]').focus();
    await pop.locator('[data-p="redPct"]').focus();
    await pop.locator('[data-p="yellowPct"]').focus();
    assert.equal(await pop.locator('[data-p="yellowMoney"]').inputValue(), '10.000,00');
    assert.equal(await pop.locator('[data-p="redPct"]').inputValue(), '9,0');
    await page.screenshot({ path: 'artifacts/opex/params.png' });
    const row = await pop.locator('[data-p="yellowMoney"]').boundingBox(), row2 = await pop.locator('[data-p="redPct"]').boundingBox();
    assert.equal(Math.round(row.y), Math.round(row2.y), 'os 4 limites ficam na mesma linha');
    await pop.locator('[data-opex-params-save]').click();
    await page.waitForFunction(() => window.toasts.includes('Parâmetros salvos.'));
    const last = (await page.evaluate(() => saves)).at(-1);
    assert.deepEqual(last.p_values, { yellowMoney: 10000, yellowPct: 5, redMoney: 20000, redPct: 9, direction: 'both' });
    assert.equal(last.p_expected_version, 0);
    // continua na tela e agora já com a nova versão: salvar de novo usa version 1
    assert.equal(await pop.locator('[data-p="redPct"]').inputValue(), '9,0');
    await pop.locator('[data-p="below"]').uncheck();
    await pop.locator('[data-p="above"]').uncheck();
    await pop.locator('[data-opex-params-save]').click();
    assert.match(await pop.locator('[data-opex-banner]').innerText(), /ao menos um/i);
    await pop.locator('[data-p="above"]').check();
    await pop.locator('[data-opex-params-save]').click();
    await page.waitForFunction(() => saves.length === 3);
    const third = (await page.evaluate(() => saves)).at(-1);
    assert.equal(third.p_values.direction, 'over');
    assert.equal(third.p_expected_version, 1);
    // o Cockpit passa a usar os novos parâmetros (Pessoal abaixo da meta fica verde)
    await page.evaluate(async () => { document.querySelector('#opexSignal-view').classList.remove('active'); document.querySelector('#cockpit-view').classList.add('active'); review.renderSignalView('cockpit'); await testModule.refresh(); });
    await page.waitForFunction(() => document.querySelector('.cockpit-groups-panel tbody tr .opex-signal[data-level="green"]'));
    assert.equal(await level('Pessoal'), 'green');
    // quem não edita: o item de menu some
    await page.evaluate(async () => { rpcState.thresholds = { ...rpcState.thresholds, canEdit: false }; reviewService.invalidate(); await review.refreshSignalMenu(); });
    assert.equal(await page.evaluate(() => signalMenu), false);
    assert.deepEqual(errors, []);
    console.log('opexReview parâmetros (admin, validação, conflito, leitura): OK');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
