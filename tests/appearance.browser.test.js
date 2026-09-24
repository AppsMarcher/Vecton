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
const driver = '(()=>{const adapt=()=>{};function theme(v){VECTON_APPEARANCE.preview(v)};function navigate(id){' + navigation;
let html = get('index.html').replace('<head>', '<head><script src="mockup-fiel/guard.js"></script>');
html = html.replace(/<script[^>]+src="(?:https:[^"]+|supabase-config\.js[^"]*|src\/core\/pwa\.js[^"]*)"[^>]*><\/script>/g, '')
  .replace(/<link[^>]+(?:https:[^"]*|rel="manifest")[^>]*>/g, '');
html = html.replace(/(<script src="app\.js[^>]+><\/script>)/,
  '<script src="mockup-fiel/vendor/lucide.min.js"></script><script src="mockup-fiel/fixtures.js"></script><script src="mockup-fiel/bridge.js"></script>$1<script src="test-driver.js"></script>');
const fixtures = get('mockup-fiel/fixtures.js')
  .replace('quantity:12+i,', 'stateCode:uf,invoices:16+i,purchasesPerCustomer:1.5,share:.2,quantity:12+i,quantidade:12+i,modelo:`Modelo ${i%3+1}`,cultura:i%2?"Pecuária":"Grãos",')
  .replace('territories:geo.map', 'map:geo.map(g=>({...g,territory:g.uf})),territories:geo.map');
function signature() {
  const el = document.querySelector('.content-view.active');
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
    const targets = all.filter(s => ['dashboard','cockpit'].includes(s.id) || s.id.startsWith('report:'));
    async function compare(id) {
      await page.evaluate(() => VECTON_APPEARANCE.preview('dark'));
      await page.waitForTimeout(250);
      const dark = await page.evaluate(signature);
      assert.ok(dark.text.trim(), 'View must not be empty');
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
    const report = { screens, errors, failures };
    fs.writeFileSync(path.join(out,'browser-verification.json'), JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
