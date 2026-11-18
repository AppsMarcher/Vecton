// Monta o Cockpit real (index.html + módulos) no Playwright com um serviço de revisão de OPEX e um RPC simulado.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
async function openCockpitPage(browser, { viewport = { width: 1600, height: 1400 }, rpcSource = '' } = {}) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, '').replace('class="auth-only"', '');
  await page.setContent(html);
  await page.addStyleTag({ path: path.join(root, 'styles.css') });
  for (const file of ['cockpit/cockpitAggregate', 'cockpit/cockpitFormat', 'opexReview/opexReviewCore', 'opexReview/opexReviewService', 'opexReview/opexReviewViews', 'opexReview/opexReviewPicker', 'opexReview/opexReviewAttachments', 'opexReview/opexReviewActionDetail', 'opexReview/opexReviewPlan', 'opexReview/opexReviewMyActions', 'opexReview/opexReviewHub', 'opexReview/opexReviewEntry', 'opexReview/opexReviewModule', 'cockpit/cockpitWidgets', 'cockpit/cockpitModule', 'reports/opexCcPicker']) {
    await page.addScriptTag({ path: path.join(root, `src/modules/${file}.js`) });
  }
  await page.addScriptTag({ path: path.join(root, 'src/core/overlayQueue.js') });
  await page.addScriptTag({ path: path.join(root, 'src/core/modalScrim.js') });
  await page.addScriptTag({ path: path.join(root, 'tests/fixtures/cockpitSource.js') });
  await page.evaluate(`(() => {
    document.querySelector('#auth-shell').classList.remove('active');
    document.querySelector('#market-ticker').hidden = true;
    document.querySelector('#dashboard-view').classList.remove('active');
    document.querySelector('#cockpit-view').classList.add('active');
    document.querySelector('.header-select:not(.header-select-small)')?.remove();
    document.body.insertAdjacentHTML('beforeend', '<div id="test-report-panel"></div>');
    window.testPeriod = { year: 2026, month: 9 };
    window.rpcLog = [];
    window.rpcState = { presenceFail: false, thresholds: { yellowMoney: 10000, yellowPct: 5, redMoney: 20000, redPct: 10, direction: 'both', version: 0, canEdit: false }, presence: [] };
    ${rpcSource}
    const rpc = async (name, args) => {
      window.rpcLog.push([name, args]);
      if (window.rpcHandler) { const handled = await window.rpcHandler(name, args); if (handled !== undefined) return handled; }
      if (name === 'opex_get_thresholds') return rpcState.thresholds;
      if (name === 'opex_record_presence') { if (rpcState.presenceFail) throw new Error('falha'); return rpcState.presence; }
      throw new Error('rpc inesperado ' + name);
    };
    window.ledgerCalls = 0; window.ledgerRows = [];
    window.confirmCalls = []; window.confirmAnswer = true; window.toasts = [];
    const readRows = async (table, query) => { if (table === 'actuals_ledger_entries') { window.ledgerCalls++; window.lastLedgerQuery = query; return window.ledgerFail ? Promise.reject(new Error('x')) : window.ledgerRows; } throw new Error('tabela inesperada ' + table); };
    window.reviewService = VECTON_OPEX_REVIEW_SERVICE.createOpexReviewService({ rpc, readRows, uploadFile: async (bucket, path, file) => { window.uploads = (window.uploads || []).concat([[bucket, path, file.name]]); if (window.uploadFail) throw new Error(window.uploadFail); }, signUrl: async (bucket, path) => 'about:blank#' + path, resolveOrganizationId: async () => 'org-1', getSessionKey: () => 'user-1' });
    window.review = VECTON_OPEX_REVIEW.createOpexReviewModule({ service: reviewService, confirm: async message => { window.confirmCalls.push(message); return window.confirmAnswer; }, toast: message => window.toasts.push(message),
      getCostCenters: () => [{ id: 'cc1', number: '100', name: 'Financeiro' }, { id: 'cc2', number: '200', name: 'Apoio' }],
      openReport: id => { window.navigated = id; review.renderReport(document.querySelector('#test-report-panel'), id); },
      signalRoot: document.querySelector('#opexSignal-view'), setSignalMenuVisible: visible => { window.signalMenu = visible; },
      setMyActionsVisible: visible => { window.myActionsVisible = visible; } });
    window.testModule = VECTON_COCKPIT.createCockpitModule({
      review, getActiveView: () => 'cockpit', getPeriod: () => testPeriod, canAccess: () => true,
      getManagementAccess: selected => {
        const options = ['Controladoria'];
        const centers = [1, 2].map(n => ({ id: 'cc' + n, number: n + '00', name: 'CC ' + n, management: 'Controladoria' }));
        return { options, selected, locked: false, customIds: null, tree: VECTON_OPEX_CC_PICKER.buildTree(centers, options, new Map()) };
      },
      service: VECTON_COCKPIT_DATA.createService(async filters => ({ ...VECTON_COCKPIT_DATA.aggregate(filters, { ...TEST_COCKPIT_SOURCE.buildSource('Controladoria'), comparisonScenarioId: 'sc-1', comparisonSourceYear: 2026 }), source: 'test' }))
    });
  })()`);
  return { page, errors };
}
module.exports = { openCockpitPage, root };
