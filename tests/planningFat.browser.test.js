const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLANNING_PLAYWRIGHT_LIB || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('https://planning.test/', r => r.fulfill({ contentType: 'text/html', body: '<style>:root{--text:#25334a;--text-soft:#677994;--text-faint:#677994;--panel:white;--panel-alt:#f6f8fc;--line:#d7dfed;--blue:#365fe6}body{font:14px Arial;background:white;margin:0}</style><main id="planning"></main>' }));
    await page.goto('https://planning.test/');
    for (const name of ['planningCore', 'planningFatCore', 'planningViews', 'planningFatViews', 'planningModule', 'planningFatModule']) await page.addScriptTag({ path: path.join(__dirname, `../src/modules/planning/${name}.js`) });
    await page.addStyleTag({ path: path.join(__dirname, '../src/modules/planning/planning.css') });
    await page.evaluate(async () => {
      const scenario = { id: 'scenario', name: 'Budget 2027', reference_year: 2027, status: 'open', planning_version: 1 };
      const fatForm = { id: 'fat', scenario_id: 'scenario', code: 'FAT', name: 'Vendas · Projeção de volumes', form_type: 'fat', status: 'released', revision: 1, access_mode: 'write' };
      const opex = { id: 'o8', scenario_id: 'scenario', code: '08', name: 'Faturamento | Impostos | Matéria-prima', form_type: 'opex', status: 'released', revision: 1, access_mode: 'write' };
      const context = { version: 1, capex_enabled: true, is_admin: true, user_id: 'admin', scenarios: [scenario], forms: [opex, { id: 'cpx', scenario_id: 'scenario', code: 'CPX', name: 'CAPEX · Investimentos', form_type: 'capex', status: 'released', revision: 1, access_mode: 'write' }, fatForm],
        months: Array.from({ length: 12 }, (_, i) => ({ scenario_id: 'scenario', reference_month: i + 1, source_type: 'forms' })), users: [{ user_id: 'u1', full_name: 'Maria', management: 'Comercial' }, { user_id: 'admin', full_name: 'Admin' }], lines: [], cost_centers: [], accounts: [], access: [], fat_enabled: true };
      const D = { revision: 1, status: 'released', year: 2027, stale: false, window_months: [202609, 202608],
        regions: [{ region_key: 'BA', label: 'BA', mode: 'write' }, { region_key: 'EX', label: 'EX', mode: 'write' }, { region_key: 'SP', label: 'SP', mode: 'write' }, { region_key: 'PECAS', label: 'Peças', mode: 'write' }],
        models: [{ model_key: 'INGRAIN100', group: 'Grãos', sort: 1, fat_driven: false }, { model_key: 'INGRAIN90', group: 'Pecuária', sort: 1, fat_driven: false }, { model_key: 'CARGOGRAIN 14000', group: 'Cargograin', sort: 1, fat_driven: false }, { model_key: 'TRANSGRAIN 215', group: 'Transgrain', sort: 1, fat_driven: false }, { model_key: 'PECAS', group: 'Linhas complementares', sort: 1, fat_driven: true }],
        coordination: [['BA', 'Grão', 'Norte', 'PENINHA'], ['BA', 'Outros', 'Norte', 'PENINHA'], ['BA', 'Pecuária', 'Pecuária', 'A definir'], ['EX', 'Grão', 'Exportação', 'Pablo'], ['EX', 'Outros', 'Exportação', 'Pablo'], ['EX', 'Pecuária', 'Exportação', 'Pablo'], ['SP', 'Grão', 'Sul', 'A definir'], ['SP', 'Outros', 'Sul', 'A definir'], ['SP', 'Pecuária', 'Pecuária', 'A definir'], ['PECAS', 'Peças', 'Peças', 'JENIFER VIANA']].map(([r, l, c, p]) => ({ region_key: r, line: l, coordination: c, responsible: p })),
        premises: [{ region_key: 'BA', model_key: 'INGRAIN100', fat_unit: 53000, mp_unit: 25400, origin: 'local', adjusted: false, window_months: [202609, 202608], version: 1, calc_fat_unit: 53000, calc_mp_unit: 25400 },
          { region_key: 'marcher', model_key: 'INGRAIN100', fat_unit: 53000, mp_unit: 25400, origin: 'marcher', adjusted: false, window_months: [202609, 202608], version: 1 },
          { region_key: 'marcher', model_key: 'INGRAIN90', fat_unit: 173000, mp_unit: 76000, origin: 'marcher', adjusted: false, window_months: [202608, 202607], version: 1 },
          { region_key: 'marcher', model_key: 'TRANSGRAIN 215', fat_unit: 62000, mp_unit: 33000, origin: 'marcher', adjusted: false, window_months: [202609, 202608], version: 1 },
          { region_key: 'PECAS', model_key: 'PECAS', fat_unit: 1, mp_unit: 0.364, origin: 'local', adjusted: false, window_months: [202609, 202608], version: 1, calc_fat_unit: 1, calc_mp_unit: 0.364 }],
        taxes: [{ line: 'maq', ipi: 0, icms: 4.1, pis: 1, cofins: 4.8, version: 1 }, { line: 'tra', ipi: 0, icms: 4.1, pis: 1, cofins: 4.8, version: 1 }, { line: 'pec', ipi: 1.92, icms: 5.64, pis: 1.62, cofins: 7.46, version: 1 }],
        volumes: [{ region_key: 'BA', model_key: 'INGRAIN100', reference_month: 1, amount: 8, row_version: 1 }, { region_key: 'BA', model_key: 'INGRAIN90', reference_month: 2, amount: 2, row_version: 1 }, { region_key: 'EX', model_key: 'INGRAIN100', reference_month: 2, amount: 8, row_version: 1 }, { region_key: 'PECAS', model_key: 'PECAS', reference_month: 1, amount: 330000, row_version: 1 }],
        history: [{ region_key: 'BA', model_key: 'INGRAIN100', year: 2025, qty: 10, fat: 530000, rl: 477000, mp: 254000 }, { region_key: 'BA', model_key: 'INGRAIN100', year: 2026, qty: 5, fat: 265000, rl: 238500, mp: 127000 }, { region_key: 'PECAS', model_key: 'PECAS', year: 2026, qty: 9, fat: 3000000, rl: 2500000, mp: 1100000 }],
        access: [] };
      window.fix = { D, context, overlap: [], calls: [], draftWrites: 0, conflict: false };
      window.testModule = VECTON_PLANNING.createPlanningModule({ escapeHtml: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), MONTH_LABELS: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'], state: { currentPeriod: { year: 2027 } }, resolveOrganizationId: async () => 'org', openScenarioDreReport: () => {},
        callSupabaseRpc: async (name, args) => {
          fix.calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
          if (name === 'planning_context') return JSON.parse(JSON.stringify(fix.context));
          if (name === 'planning_fat_read') return JSON.parse(JSON.stringify(fix.D));
          if (name === 'planning_fat_overlap') return fix.overlap;
          if (name === 'planning_read_form') return { entries: [], copied: [], revision: 1 };
          if (name === 'planning_integrate_all') return { ok: true, rows_written: 5, notes: [], fat: { ok: true, pending: 0 } };
          if (name === 'planning_fat_write') {
            const p = args.p_payload;
            if (args.p_action === 'save_volumes') {
              const cur = c => fix.D.volumes.find(x => x.region_key === c.region_key && x.model_key === c.model_key && x.reference_month === c.month);
              if (fix.conflict) { fix.conflict = false; p.cells.forEach(c => { const v = cur(c); if (v) v.row_version++; else fix.D.volumes.push({ region_key: c.region_key, model_key: c.model_key, reference_month: c.month, amount: 7, row_version: 1 }); }); return { ok: false, conflicts: [{}] }; }
              if (p.cells.some(c => (cur(c)?.row_version ?? 0) !== c.version)) return { ok: false, conflicts: [{}] };
              p.cells.forEach(c => { const v = fix.D.volumes.find(x => x.region_key === c.region_key && x.model_key === c.model_key && x.reference_month === c.month); if (v) { v.amount = Number(c.amount); v.row_version++; } else fix.D.volumes.push({ region_key: c.region_key, model_key: c.model_key, reference_month: c.month, amount: Number(c.amount), row_version: 1 }); });
              return { ok: true };
            }
            if (args.p_action === 'save_taxes') { Object.assign(fix.D.taxes.find(t => t.line === p.line), { ipi: p.ipi, icms: p.icms, pis: p.pis, cofins: p.cofins, version: p.version + 1 }); return { ok: true }; }
            if (args.p_action === 'refresh_premises') { fix.D.stale = false; return { ok: true }; }
            return { ok: true };
          }
          return { ok: true };
        } });
      await testModule.open(document.getElementById('planning'), scenario, () => {}, { manage: true });
    });
    const cells = sel => page.locator(sel).allTextContents();
    const calls = name => page.evaluate(n => fix.calls.filter(c => c.name === n).length, name);

    // ── lista: bloco FAT sem numeração, depois do CPX
    assert.equal(await page.locator('.pl-fat-list .pl-code').innerText(), 'FAT');
    assert.equal(await page.locator('.pl-list:not(.pl-capex-list):not(.pl-fat-list) .pl-code').innerText(), '08');
    assert.equal(await page.evaluate(() => { const a = document.querySelector('.pl-capex-list'), b = document.querySelector('.pl-fat-list'); return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); }), true);
    await page.locator('.pl-fat-list [data-pl="open-form"]').click();
    await page.waitForSelector('#fat-grid');

    // ── grade: 16 colunas, mesma largura em todas as métricas, fontes do Evolutivo
    assert.equal(await page.locator('#fat-grid thead th').count(), 16);
    assert.deepEqual(await cells('#fat-grid thead th'), ['Modelo', '2025', '2026', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez', '2027']);
    const widths = async () => page.evaluate(() => [...document.querySelectorAll('#fat-grid thead th')].map(t => Math.round(t.getBoundingClientRect().width)).join(','));
    const base = await widths();
    for (const m of ['FAT', 'RL', 'MP', 'MC1%', 'VOL']) { await page.locator('.fat-seg button', { hasText: new RegExp('^' + m.replace('%', '\\%') + '$') }).click(); assert.equal(await widths(), base, 'largura igual em ' + m); }
    const fonts = await page.evaluate(() => ({ v: getComputedStyle(document.querySelector('#fat-grid td .v')).fontSize, th: getComputedStyle(document.querySelector('#fat-grid thead th')).fontSize, grp: getComputedStyle(document.querySelector('#fat-grid tr.grp td')).fontSize, row: Math.round(document.querySelector('#fat-grid tbody tr:nth-child(3) td').getBoundingClientRect().height) }));
    assert.deepEqual(fonts, { v: '11.5px', th: '10.5px', grp: '10.5px', row: 34 });
    assert.equal(await page.locator('.fat-card .pl-note, .fat-card small, .fat-card-h .s, #fat-grid [title]').count(), 0, 'sem subtítulo nem nota na tela');
    assert.equal(await page.locator('.pl-app [title]').count(), 0, 'nenhum title nativo');

    // ── totalizador pelo nome da visão e Marcher sem Peças na grade
    assert.equal((await cells('#fat-grid tr.top td:first-child'))[0], 'Total Marcher');
    assert.deepEqual((await cells('#fat-grid tr.grp td')).slice(-1), ['Linhas complementares'], 'Peças ao fim da grade da Marcher');
    assert.equal((await cells('#fat-grid tbody tr:last-child td'))[0], 'Peças');
    await page.locator('[data-pl="fat-view"][data-v="coord"]').click();
    await page.locator('select[data-fat="coord"]').selectOption('Exportação');
    assert.equal((await cells('#fat-grid tr.top td:first-child'))[0], 'Total Exportação');
    assert.equal(await page.locator('.fat-chip').innerText(), 'Somente leitura · FAT = RL');
    const expTotal = async m => { await page.locator('.fat-seg button', { hasText: new RegExp('^' + m + '$') }).click(); return (await cells('#fat-grid tr.top td.tot'))[0]; };
    assert.equal(await expTotal('FAT'), await expTotal('RL'), 'Exportação: RL = FAT');
    await page.locator('.fat-seg button', { hasText: /^VOL$/ }).click();

    // ── Peças: coordenação e região são a mesma tela; abre em FAT; VOL = 1
    await page.locator('select[data-fat="coord"]').selectOption('Peças');
    assert.equal(await page.locator('.fat-seg button.on').last().innerText(), 'FAT', 'a métrica abre em FAT');
    assert.equal((await cells('#fat-grid tr.top td:first-child'))[0], 'Total Peças');
    assert.equal(await page.locator('#fat-grid tbody tr').count(), 3);
    assert.equal(await page.locator('#fat-grid input[data-fat="vol"]').count(), 12);
    assert.equal(await page.locator('.fat-chip').innerText(), 'VOL = 1');
    const pecIn = page.locator('#fat-grid input[data-fat="vol"]').nth(2);
    await pecIn.fill(''); await pecIn.pressSequentially('1234,56');
    assert.equal(await pecIn.inputValue(), '1234,56', 'Peças aceita centavos');
    await page.locator('[data-pl="fat-discard"]').click();
    await page.locator('.fat-seg button', { hasText: /^VOL$/ }).click();
    assert.equal((await cells('#fat-grid tbody tr:nth-child(3) td'))[3], '1', 'VOL = 1 em todo mês');
    await page.locator('[data-pl="fat-view"][data-v="vend"]').click();
    await page.locator('select[data-fat="region"]').selectOption('PECAS');
    assert.equal((await cells('#fat-grid tr.top td:first-child'))[0], 'Total Peças', 'a região Peças é a mesma tela da coordenação Peças');

    // ── região: formulário inteiro (todos os grupos), responsável por linha, campos de digitação
    await page.locator('select[data-fat="region"]').selectOption('BA');
    await page.locator('.fat-seg button', { hasText: /^VOL$/ }).click();
    assert.deepEqual(await cells('#fat-grid tr.grp td'), ['Grãos', 'Pecuária', 'Cargograin', 'Transgrain']);
    assert.equal(await page.locator('.fat-chip').first().innerText(), 'Responsável · PENINHA (Grãos) · A definir (Pecuária)');
    assert.equal(await page.locator('#fat-grid input[data-fat="vol"]').count(), 4 * 12);
    assert.equal(await page.locator('#fat-grid input[data-model="INGRAIN100"][data-month="1"]').inputValue(), '8');

    // ── digitar, rascunho local e salvar (sem consultar sobreposição)
    const overlapBefore = await calls('planning_fat_overlap');
    await page.locator('#fat-grid input[data-model="INGRAIN100"][data-month="3"]').fill('5');
    assert.equal(await page.locator('#fat-grid input[data-model="INGRAIN100"][data-month="3"]').getAttribute('class'), 'dirty');
    assert.equal(await page.locator('.fat-state').innerText(), 'Alterações não salvas');
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('vecton-planning-fat:')).length), 1);
    // o terceiro bloco acompanha a digitação: 5 un × 53.000 = 265.000 em março
    await page.locator('[data-pl="fat-toggle"][data-id="dre"]').click();
    assert.equal((await cells('#fat-dre tbody tr:nth-child(2) td'))[3], '265.000');
    // recarregar mantém o rascunho enquanto a revisão for a mesma
    await page.evaluate(async () => { await testModule.open(document.getElementById('planning'), { id: 'scenario', name: 'Budget 2027', reference_year: 2027, status: 'open', planning_version: 1 }, () => {}, { manage: true }); });
    await page.locator('.pl-fat-list [data-pl="open-form"]').click(); await page.waitForSelector('#fat-grid');
    await page.locator('[data-pl="fat-view"][data-v="vend"]').click(); await page.locator('select[data-fat="region"]').selectOption('BA');
    assert.equal(await page.locator('#fat-grid input[data-model="INGRAIN100"][data-month="3"]').inputValue(), '5', 'rascunho recuperado');
    // conflito: o rascunho não se perde e o aviso aparece
    await page.evaluate(() => { fix.conflict = true; });
    await page.locator('[data-pl="fat-save"]').click();
    assert.match(await page.locator('.pl-error').innerText(), /Outra pessoa/);
    assert.equal(await page.locator('#fat-grid input[data-model="INGRAIN100"][data-month="3"]').inputValue(), '5');
    await page.locator('[data-pl="fat-save"]').click();
    assert.equal(await page.locator('.fat-state').innerText(), 'Valores salvos', 'depois do conflito, salvar de novo usa a versão relida');
    const saveCall = await page.evaluate(() => fix.calls.filter(c => c.name === 'planning_fat_write' && c.args.p_action === 'save_volumes').pop().args.p_payload);
    assert.deepEqual(saveCall.cells, [{ region_key: 'BA', model_key: 'INGRAIN100', month: 3, amount: '5', version: 1 }]);
    assert.equal(await calls('planning_fat_overlap'), overlapBefore, 'Salvar valores não consulta a sobreposição');
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('vecton-planning-fat:')).length), 0);
    // descartar
    await page.locator('#fat-grid input[data-model="INGRAIN100"][data-month="4"]').fill('9');
    await page.locator('[data-pl="fat-discard"]').click();
    assert.equal(await page.locator('#fat-grid input[data-model="INGRAIN100"][data-month="4"]').inputValue(), '0');

    // ── digitação: vírgula e ponto decimais sobrevivem ao redesenho da grade
    const vol5 = page.locator('#fat-grid input[data-model="INGRAIN100"][data-month="5"]');
    await vol5.fill(''); await vol5.pressSequentially('2,5');
    assert.equal(await vol5.inputValue(), '2', 'máquina não aceita fração: o dígito depois da vírgula é recusado');
    await vol5.fill('4');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('vecton-planning-fat:')))).cells.pop().amount), 4);
    await page.locator('[data-pl="fat-discard"]').click();

    // ── terceiro bloco: ordem das linhas
    const labels = (await cells('#fat-dre tbody tr td:first-child')).map(t => t.replace(/^\d+\s*/, '').trim());
    assert.deepEqual(labels.filter(t => /^(FATURAMENTO|IMPOSTOS SOBRE VENDAS|RECEITA LÍQUIDA|MATÉRIA-PRIMA|% MP \/ RL)$/.test(t)), ['FATURAMENTO', 'IMPOSTOS SOBRE VENDAS', 'RECEITA LÍQUIDA', 'MATÉRIA-PRIMA', '% MP / RL']);
    assert.equal(await page.locator('#fat-dre tr.sp').count(), 1, 'uma linha em branco entre a receita líquida e a matéria-prima');
    assert(labels.indexOf('RECEITA LÍQUIDA') < labels.indexOf('MATÉRIA-PRIMA'));
    assert.equal(labels.at(-1), '% MP / RL');
    assert.equal(await page.locator('#fat-dre').innerText().then(t => /CBS/.test(t)), false, 'sem CBS');

    // ── premissas: recolhidas, e a faixa de defasagem só quando houver defasagem
    assert.equal(await page.locator('.fat-sect-h', { hasText: 'Premissas do local' }).count(), 1);
    assert.equal(await page.locator('.fat-stale').count(), 0);
    await page.evaluate(() => { fix.D.stale = true; });
    await page.locator('[data-pl="index"]').click();
    await page.locator('.pl-fat-list [data-pl="open-form"]').click(); await page.waitForSelector('#fat-grid');
    assert.match(await page.locator('.fat-stale').innerText(), /Premissas defasadas · base set\/26 · ago\/26/);
    await page.locator('.fat-stale [data-pl="fat-refresh"]').click();
    assert.equal(await page.locator('.fat-stale').count(), 0);

    // ── Integrar: direto sem sobreposição; com sobreposição, confirmação sem bloquear
    await page.locator('[data-pl="project"]').click();
    await page.waitForFunction(() => fix.calls.some(c => c.name === 'planning_integrate_all'));
    assert.equal(await page.locator('dialog[open]').count(), 0, 'sem sobreposição integra direto');
    await page.evaluate(() => { fix.overlap = [{ account_number: '31101001', months: [1, 2, 3] }]; fix.calls.length = 0; });
    await page.locator('[data-pl="project"]').click();
    await page.waitForSelector('dialog[open]');
    assert.match(await page.locator('dialog[open]').innerText(), /31101001[\s\S]*Jan, Fev, Mar/);
    assert.equal(await calls('planning_integrate_all'), 0);
    await page.locator('dialog[open] [data-pl="dismiss"]').last().click();
    assert.equal(await calls('planning_integrate_all'), 0, 'Cancelar não integra');
    await page.locator('[data-pl="project"]').click();
    await page.locator('dialog[open] [data-pl="confirm"]').click();
    await page.waitForFunction(() => fix.calls.some(c => c.name === 'planning_integrate_all'));
    assert.equal(await page.locator('dialog[open] [data-pl="confirm"]').count(), 0);

    // ── ajuste de premissa: milhar e decimal pt-BR; vale também para a que vem da média Marcher
    await page.locator('[data-pl="index"]').click();
    await page.locator('.pl-fat-list [data-pl="open-form"]').click(); await page.waitForSelector('#fat-grid');
    await page.locator('[data-pl="fat-view"][data-v="vend"]').click(); await page.locator('select[data-fat="region"]').selectOption('BA');
    if (await page.locator('#fat-grid ~ .fat-sect [id="x"], .fat-sect .fat-grid.fat-small').count() === 0) await page.locator('[data-pl="fat-toggle"][data-id="prem"]').click();
    const adj90 = page.locator('.fat-small tr', { hasText: 'INGRAIN90' }).locator('[data-pl="fat-adjust"]');
    assert.equal(await adj90.count(), 1, 'o admin ajusta também a premissa da média Marcher');
    await adj90.click();
    await page.locator('#fat-adj-fat').fill('60.000,50'); await page.locator('#fat-adj-mp').fill('30000');
    await page.locator('dialog[open] [data-pl="confirm"]').click();
    await page.waitForFunction(() => fix.calls.some(c => c.name === 'planning_fat_write' && c.args.p_action === 'adjust_premise'));
    const adjCall = await page.evaluate(() => fix.calls.filter(c => c.name === 'planning_fat_write' && c.args.p_action === 'adjust_premise').pop().args.p_payload);
    assert.equal(adjCall.adj_fat, 60000.5); assert.equal(adjCall.adj_mp, 30000); assert.equal(adjCall.region_key, 'BA');

    // ── Integrar a partir do OPEX também avisa a sobreposição do FAT
    await page.locator('[data-pl="index"]').click();
    await page.evaluate(() => { fix.overlap = [{ account_number: '31101001', months: [1, 2] }]; fix.calls.length = 0; });
    await page.locator('.pl-list:not(.pl-capex-list):not(.pl-fat-list) [data-pl="open-form"]').click(); await page.waitForSelector('[data-pl="project"]');
    await page.locator('[data-pl="project"]').click(); await page.waitForSelector('dialog[open]');
    assert.equal(await calls('planning_fat_overlap'), 1, 'consulta a sobreposição do FAT');
    assert.match(await page.locator('dialog[open]').innerText(), /FAT[\s\S]*31101001[\s\S]*Jan, Fev/);
    await page.locator('dialog[open] [data-pl="dismiss"]').last().click();
    await page.evaluate(() => { fix.overlap = []; });
    await page.locator('[data-pl="index"]').click();
    await page.locator('.pl-fat-list [data-pl="open-form"]').click(); await page.waitForSelector('#fat-grid');

    // ── configuração: percentuais recalculam grade, premissas e bloco; Atualizar premissas
    await page.locator('[data-pl="fat-tab"][data-tab="cfg"]').click();
    assert.deepEqual(await cells('.fat-cfg thead th'), ['Linha', 'IPI', 'ICMS', 'PIS', 'COFINS', 'Total do FAT']);
    assert.equal(await page.locator('.fat-cfg input').count(), 12);
    assert.equal(await page.locator('.fat-cfg tbody tr').first().locator('td.mut').innerText(), '9,90%');
    await page.locator('.fat-cfg input[data-line="maq"][data-key="icms"]').fill('8');
    await page.locator('.fat-cfg input[data-line="maq"][data-key="icms"]').blur();
    await page.waitForFunction(() => fix.D.taxes[0].icms === 8);
    assert.equal(await page.locator('.fat-cfg tbody tr').first().locator('td.mut').innerText(), '13,80%');
    assert.equal(await page.locator('[data-pl="fat-refresh"]').count(), 1);
    await page.locator('[data-pl="fat-tab"][data-tab="pre"]').click();
    assert.equal(await page.locator('[data-pl="fat-tab"][data-tab="acc"]').count(), 1);

    // ── sem permissão de escrita: campos somente leitura
    await page.evaluate(() => { fix.D.regions.forEach(r => { r.mode = 'read'; }); });
    await page.locator('[data-pl="index"]').click();
    await page.locator('.pl-fat-list [data-pl="open-form"]').click(); await page.waitForSelector('#fat-grid');
    await page.locator('[data-pl="fat-view"][data-v="vend"]').click(); await page.locator('select[data-fat="region"]').selectOption('BA');
    assert.equal(await page.locator('#fat-grid input').count(), 0);
    assert.deepEqual(errors, []);
    console.log('FAT browser: list, grid, formats, views, Peças, Exportação, draft, save, conflict, DRE block, premises, integration and config passed.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
