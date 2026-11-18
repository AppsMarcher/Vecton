const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { openCockpitPage, root } = require('./helpers/opexCockpitPage');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.COCKPIT_BROWSER_CHANNEL || 'msedge' });
  try {
    const { page, errors } = await openCockpitPage(browser);
    await page.evaluate(() => { rpcState.presence = [{ costCenterId: 'cc2', accountNumber: '102', analyses: 1, actions: 2, open: 1 }]; testModule.render(); });
    await page.waitForSelector('.cockpit-groups-panel .cockpit-table');

    // Cockpit preservado: 4 KPIs e 4 cards na mesma ordem
    assert.equal(await page.locator('.cockpit-kpis .kpi-card').count(), 4);
    const titles = await page.locator('.cockpit-grid > section h3').allInnerTexts();
    assert.deepEqual(titles.map(t => t.replace(/\s+/g, ' ').trim()), ['OPEX Mensal — Real x Forecast favorito', 'Raio-X por Área', 'OPEX por Grupo de Despesa', 'Atingimento do OPEX']);
    assert.ok(await page.locator('[data-opex-hub]').isVisible(), 'botão do consolidado no cabeçalho do card de grupos');
    assert.equal(await page.locator('[data-opex-params]').isVisible(), false, 'Parâmetros só para administrador (canEdit)');

    // Tabela de grupos: 1ª coluna = registro, última = sinaleira
    const groups = page.locator('.cockpit-groups-panel');
    const heads = await groups.locator('thead th').allInnerTexts();
    assert.equal(heads.length, 7);
    assert.match(heads[0], /Registro/i); assert.match(heads[1], /Grupo/i); assert.match(heads[6], /Sinal/i);
    const rowOf = name => groups.locator('tbody tr', { has: page.locator(`th:has-text("${name}")`) });
    assert.equal(await rowOf('Serviços').locator('td:first-child .opex-rec').count(), 1, 'ícone na linha com registro');
    assert.equal(await rowOf('Pessoal').locator('.opex-rec').count(), 0, 'sem registro = célula vazia');
    assert.equal(await rowOf('Serviços').locator('.opex-rec--cancelled').count(), 0, 'análise ativa: ícone sem borda vermelha');
    // todas as análises canceladas: o ícone ganha borda vermelha
    await page.evaluate(async () => { rpcState.presence = [{ costCenterId: 'cc2', accountNumber: '102', analyses: 1, actions: 0, open: 0, cancelled: 1 }]; reviewService.invalidate(); await testModule.refresh(); });
    await page.locator('.cockpit-groups-panel .opex-rec--cancelled').waitFor();
    assert.match(await page.locator('.cockpit-groups-panel .opex-rec--cancelled').evaluate(n => getComputedStyle(n).boxShadow), /rgb/);
    await page.evaluate(async () => { rpcState.presence = [{ costCenterId: 'cc2', accountNumber: '102', analyses: 1, actions: 2, open: 1 }]; reviewService.invalidate(); await testModule.refresh(); });
    await page.locator('.cockpit-groups-panel .opex-rec').waitFor();
    assert.equal(await rowOf('Serviços').locator('td:last-child .opex-signal').getAttribute('data-level'), 'red');
    assert.equal(await rowOf('Pessoal').locator('td:last-child .opex-signal').getAttribute('data-level'), 'yellow');
    const text = await groups.innerText();
    assert.doesNotMatch(text, /Análise registrada|ações? abertas?/i, 'sem textos de contagem sob o nome');
    // total sem ícone nem sinaleira, mesma quantidade de células
    const totalCells = groups.locator('tbody tr.ger-row-subtotal > *');
    assert.equal(await totalCells.count(), 7);
    assert.equal(await groups.locator('tbody tr.ger-row-subtotal .opex-rec, tbody tr.ger-row-subtotal .opex-signal').count(), 0);
    // sinaleira por tooltip de teclado
    await rowOf('Serviços').locator('.opex-signal').focus();
    assert.match(await page.locator('#cockpit-tip').innerText(), /Vermelho/);
    assert.match(await rowOf('Serviços').locator('.opex-rec').getAttribute('aria-label'), /1 análise registrada · 2 planos de ação, 1 em aberto/);

    // Drilldown: grupo abre o drilldown conta × CC com as duas colunas novas
    await rowOf('Serviços').click();
    const pop = page.locator('.cockpit-drill-pop');
    await pop.waitFor();
    const dHeads = await pop.locator('thead th').allInnerTexts();
    assert.equal(dHeads.length, 10);
    assert.match(dHeads[0], /Registro/i); assert.match(dHeads[1], /Conta/i); assert.match(dHeads[9], /Sinal/i);
    assert.equal(await pop.locator('tbody tr').first().locator('td:last-child .opex-signal').count(), 1);
    assert.equal(await pop.locator('tbody tr').first().locator('td:first-child .opex-rec').count(), 1);
    // total alinhado: coluna Real do total coincide com a do corpo
    const x = async sel => (await pop.locator(sel).first().boundingBox()).x;
    assert.ok(Math.abs(await x('tfoot td:nth-child(3)') - await x('tbody tr:first-child td:nth-child(6)')) <= 1, 'Real alinhado ao total');
    assert.ok(Math.abs(await x('tfoot td:nth-child(6)') - await x('tbody tr:first-child td:nth-child(9)')) <= 1, 'Var. % alinhado ao total');
    assert.equal(await pop.locator('tfoot .opex-rec, tfoot .opex-signal').count(), 0);
    // ordenar por nome preserva a identidade (ícone continua na linha da conta 102)
    await pop.locator('th[data-sort="name"]').click();
    assert.match(await pop.locator('tbody tr:has(.opex-rec)').getAttribute('data-row'), /\|102$/);
    assert.equal(await pop.locator('tbody tr:has(.opex-rec)').count(), 1);
    // classificar pelo "Sinal": vermelho primeiro; segundo clique inverte (verde primeiro)
    const order = async () => pop.locator('tbody tr .opex-signal').evaluateAll(n => n.map(x => x.dataset.level));
    const rank = { red: 0, yellow: 1, green: 2 };
    await pop.locator('th[data-sort="signal"]').click();
    let lv = (await order()).map(l => rank[l] ?? 3);
    assert.deepEqual(lv, [...lv].sort((a, b) => a - b));
    await pop.locator('th[data-sort="signal"]').click();
    lv = (await order()).map(l => rank[l] ?? 3);
    assert.deepEqual(lv, [...lv].sort((a, b) => b - a));
    await page.screenshot({ path: path.join(root, 'artifacts/opex/drilldown-desktop.png') });
    await pop.locator('.gap-close').click();
    // classificar o card por Sinal
    await page.locator('.cockpit-groups-panel th[data-sort="signal"]').click();
    const gl = await page.locator('.cockpit-groups-panel tbody tr .opex-signal').evaluateAll(n => n.map(x => x.dataset.level));
    assert.deepEqual(gl.map(l => rank[l] ?? 3), gl.map(l => rank[l] ?? 3).sort((a, b) => a - b));
    assert.match(await page.locator('.cockpit-groups-panel th[data-sort="signal"]').innerText(), /Sinal ↑/i);

    // falha na leitura de presença não vira "sem registro": sem ícones, sem exceção, sinaleira continua
    await page.evaluate(async () => { rpcState.presenceFail = true; reviewService.invalidate(); await testModule.refresh(); });
    assert.equal(await groups.locator('.opex-rec').count(), 0);
    assert.equal(await groups.locator('.opex-signal[data-level]').count(), 2);
    // falha nos parâmetros: sinaleira indisponível ("—"), nunca uma cor inventada
    await page.evaluate(async () => { rpcState.presenceFail = false; window.rpcHandler = async name => { if (name === 'opex_get_thresholds') throw new Error('x'); }; reviewService.invalidate(); await testModule.refresh(); });
    assert.equal(await groups.locator('.opex-signal--na').count(), 2);
    await page.evaluate(() => { window.rpcHandler = null; reviewService.invalidate(); return testModule.refresh(); });

    // Dark e tela pequena
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.screenshot({ path: path.join(root, 'artifacts/opex/cockpit-dark.png') });
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await page.setViewportSize({ width: 390, height: 2400 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem overflow global em 390px');
    await page.screenshot({ path: path.join(root, 'artifacts/opex/cockpit-mobile.png') });
    assert.deepEqual(errors, []);
    console.log('opexReview browser (colunas, drilldown, falhas, dark/mobile): OK');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
