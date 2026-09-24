/* Production renderers with local fixtures, without the mockup color adapter. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts/theme');
const get = name => fs.readFileSync(path.join(root, name), 'utf8');
// Reuse navigation and API fixtures only. The automatic color adapter is excluded.
const navigation = get('mockup-fiel/preview.js').split('  function navigate(id){')[1];
const driver = '(()=>{const adapt=()=>{};function theme(v){VECTON_APPEARANCE.preview(v)};function navigate(id){if(id==="garantiaAtivacoesCarga"){openGarantiaAtivacoesCarga();return;}' + navigation;
let html = get('index.html').replace('<head>', '<head><script src="mockup-fiel/guard.js"></script>');
html = html.replace(/<script[^>]+src="(?:https:[^"]+|supabase-config\.js[^"]*|src\/core\/pwa\.js[^"]*)"[^>]*><\/script>/g, '')
  .replace(/<link[^>]+(?:https:[^"]*|rel="manifest")[^>]*>/g, '');
html = html.replace(/(<script src="app\.js[^>]+><\/script>)/,
  '<script src="mockup-fiel/vendor/lucide.min.js"></script><script src="mockup-fiel/fixtures.js"></script><script src="mockup-fiel/bridge.js"></script>$1<script src="test-driver.js"></script>');
const fixtures = get('mockup-fiel/fixtures.js')
  .replace('quantity:12+i,', 'stateCode:uf,invoices:16+i,purchasesPerCustomer:1.5,share:.2,quantity:12+i,quantidade:12+i,modelo:`Modelo ${i%3+1}`,cultura:i%2?"Pecuária":"Grãos",')
  .replace('kpis:a3Kpis(a?.code),isClosed:false', 'kpis:a3Kpis(a?.code),period:{year:2026,month:9,status:"open"},isClosed:false')
  .replace('territories:geo.map', 'map:geo.map(g=>({...g,territory:g.uf})),territories:geo.map');
function signature() {
  const el = [...document.querySelectorAll('dialog[open],[role=dialog],.rpc-vendas-panel,.users-invite-modal,.msn-painel,.notif-popover')].find(e=>e.getBoundingClientRect().width && e.getBoundingClientRect().height) || (document.body.classList.contains('auth-only') ? document.querySelector('#auth-shell') : document.body.classList.contains('mobile-shell-active') ? document.querySelector('#vmob-screen') : document.querySelector('.content-view.active'));
  return {
    text: el.innerText,
    headings: [...el.querySelectorAll('h1,h2,h3,h4,th')].map(e => e.textContent),
    shapes: [...el.querySelectorAll('svg path,svg rect,svg circle,svg line,svg polygon')].map(e =>
      Object.fromEntries(['d','x','y','width','height','cx','cy','r','points','x1','x2','y1','y2'].map(k => [k, e.getAttribute(k)]))),
    tables: el.querySelectorAll('table').length
  };
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const errors = [], failures = [], screens = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'vecton.test') return route.abort();
      const name = decodeURIComponent(url.pathname.slice(1)) || 'index.html';
      if (name === 'index.html') return route.fulfill({ contentType: 'text/html', body: html });
      if (name === 'test-driver.js') return route.fulfill({ contentType: 'text/javascript', body: driver });
      if (name === 'mockup-fiel/fixtures.js') return route.fulfill({ contentType: 'text/javascript', body: fixtures });
      const file = path.join(root, name);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ path: file });
    });
    await page.goto('https://vecton.test/');
    await page.waitForFunction(() => window.VECTON_ORIGINAL_PREVIEW && window.PREVIEW_FIXTURES?.catalog);
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#preview-adapted-colors').count(), 0);
    const all = await page.evaluate(() => VECTON_ORIGINAL_PREVIEW.screens);
    const targets = all.filter(s => !['profile', 'login'].includes(s.id));
    async function compare(id) {
      await page.evaluate(() => VECTON_APPEARANCE.preview('dark'));
      await page.waitForTimeout(250);
      const dark = await page.evaluate(signature);
      assert.ok(dark.text.trim(), 'View must not be empty');
      assert.ok(!/^Carregando[.\u2026]*$/i.test(dark.text.trim()), 'Must render content, not only a loading placeholder');
      await page.screenshot({ path: path.join(out, id.replace(':','-') + '-dark.png') });
      await page.evaluate(() => VECTON_APPEARANCE.preview('clear'));
      await page.waitForTimeout(250);
      assert.deepEqual(await page.evaluate(signature), dark, 'Data and SVG geometry must match across themes');
      await page.screenshot({ path: path.join(out, id.replace(':','-') + '-clear.png') });
      return { id, unchanged: true, tables: dark.tables, shapes: dark.shapes.length };
    }
    for (const screen of targets) {
      try {
        await page.evaluate(id => VECTON_ORIGINAL_PREVIEW.navigate(id), screen.id);
        await page.waitForTimeout(250);
        screens.push(await compare(screen.id));
      } catch (error) { failures.push({ id: screen.id, error: error.message.slice(0,500) }); }
    }
    async function navigate(id) {
      await page.evaluate(id => VECTON_ORIGINAL_PREVIEW.navigate(id), id);
      await page.waitForTimeout(250);
    }
    async function scenario(id, action) {
      try { await action(); await page.waitForTimeout(180); screens.push(await compare(id)); }
      catch (error) { console.error(id,error.message.slice(0,300)); failures.push({ id, error: error.message.slice(0,500) }); }
    }
    await navigate('strategic');
    await scenario('a3-create', () => page.locator('[data-action="open-create-a3"]').click());
    await page.locator('[data-action="close-modal"]').click();
    await scenario('a3-detail', () => page.locator('[data-action="open-detail"]').first().click());
    await scenario('a3-kpi-create', () => page.locator('[data-action="open-create-kpi"]').click());
    await page.locator('[data-action="close-modal"]').click();
    await scenario('a3-monthly-entry', async () => { await page.locator('[data-action="open-entry"]').click(); await page.locator('.sa3-entry-row').first().waitFor(); });
    await navigate('rps');
    await scenario('rps-backups', () => page.locator('[data-rps-action="backups"]').click());
    await page.locator('[data-rps-backup-action="close"]').click();
    await scenario('rps-presentation', () => page.locator('[data-rps-action="present"]').click());
    await page.locator('[data-rps-action="present"]').click();
    await navigate('rpsComercial');
    await scenario('rps-commercial-presentation', () => page.locator('#rps-comercial-view [data-action="present"]').click());
    await scenario('rps-commercial-sales', () => page.locator('#rps-comercial-view [data-action="vendas-popover"]').click());
    await page.locator('.rpc-vendas-close').click();
    await page.locator('#rps-comercial-view [data-action="present"]').click();
    await navigate('planning');
    await scenario('planning-create', () => page.locator('#fc-new-btn').click());
    await navigate('users');
    await scenario('users-invite', () => page.locator('#users-invite-btn').click());
    await page.locator('#inv-cancel').click();
    await navigate('profile');
    screens.push(await compare('profile'));
    await page.locator('#profile-dialog-cancel').click();
    await navigate('dashboard');
    await page.evaluate(() => startNotifications());
    await page.locator('#notifications-trigger').click();
    await page.locator('.notif-popover').waitFor();
    screens.push(await compare('notifications-popover'));
    await page.keyboard.press('Escape');
    await page.locator('#messages-trigger').click();
    await page.locator('.msn-painel').waitFor();
    screens.push(await compare('messages'));
    await page.locator('#messages-trigger').click();
    await navigate('login');
    screens.push(await compare('login'));
    await navigate('dashboard');

    // Different map encodings and cash flow drill-down must survive live theme changes.
    await page.evaluate(() => VECTON_ORIGINAL_PREVIEW.navigate('report:comercialMapaGeografico'));
    await page.waitForTimeout(200);
    for (const mode of ['mix','precoMedio','cultura']) {
      await page.locator('[data-mode="' + mode + '"]').click();
      screens.push(await compare('map-' + mode));
    }
    await page.evaluate(() => VECTON_ORIGINAL_PREVIEW.navigate('report:cashFlow'));
    await page.waitForTimeout(200);
    await page.locator('[data-fc-period="YTD"]').click();
    screens.push(await compare('cashflow-YTD'));
    await page.locator('[data-fc-detail]').click();
    assert.equal(await page.locator('.fc-detail-analytic').count(), 76);
    screens.push(await compare('cashflow-detail'));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => VECTON_ORIGINAL_PREVIEW.navigate('dashboard'));
    await page.waitForTimeout(200);
    screens.push(await compare('dashboard-notebook'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.locator('[data-mobile-key="a3"]').waitFor();
    screens.push(await compare('mobile-catalog'));
    await page.locator('[data-mobile-key="a3"]').click();
    await page.locator('[data-action="open-detail"]').first().waitFor();
    screens.push(await compare('mobile-a3'));
    await page.locator('[data-action="open-detail"]').first().click();
    await page.waitForTimeout(300);
    screens.push(await compare('mobile-a3-detail'));
    const report = { screens, errors, failures };
    fs.writeFileSync(path.join(out,'browser-verification.json'), JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
