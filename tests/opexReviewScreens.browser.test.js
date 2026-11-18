const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { openCockpitPage, root } = require('./helpers/opexCockpitPage');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.COCKPIT_BROWSER_CHANNEL || 'msedge' });
  try {
    const { page, errors } = await openCockpitPage(browser);
    await page.evaluate(() => {
      window.calls = []; window.state = { status: 'awaiting_ack', version: 1, cycle: 1, forbidden: false, mine: [], pending: null };
      const dto = (over = {}) => ({ id: 'act-1', title: 'Renegociar contrato', expectedResult: 'Proposta renegociada', dueDate: '2099-11-30', status: state.status, overdue: false, assignmentCycle: state.cycle, version: state.version,
        owner: { id: 'o', name: 'Ricardo' }, assignee: { id: 'me', name: 'Executor' }, acknowledgedAt: state.status === 'awaiting_ack' ? null : '2026-09-10T10:00:00Z', submittedAt: null, submitNote: null, validatedAt: null, createdAt: '2026-09-09',
        events: [{ kind: 'created', actor: 'Ricardo', at: '2026-09-09T10:00:00Z', text: 'Ação criada' }],
        permissions: { isOwner: false, isAssignee: true, canAck: state.status === 'awaiting_ack', canSubmit: ['in_progress', 'adjustments_requested'].includes(state.status), canComment: true, canValidate: false, canReturn: false, canReassign: false, canEditTerms: false }, ...over });
      window.dto = dto;
      const rec = (over) => ({ type: 'analysis', id: 'an-9', analysisId: 'an-9', title: 'Reajuste', costCenterId: 'cc2', costCenterNumber: '200', costCenterName: 'Apoio', managementName: 'Controladoria', accountNumber: '102', accountName: 'Consultoria', groupName: 'Serviços', year: 2025, periodType: 'YTD', month: 6, sourceKey: 'scenario:old-scenario', sourceLabel: 'Budget 2025', sourceYear: 2025, responsible: 'Ricardo', responsibleUserId: 'o', dueDate: null, status: 'analyzed', overdue: false, monitor: false, ...over });
      window.rpcHandler = async (name, args) => {
        calls.push([name, args]);
        const err = (code, message) => Object.assign(new Error(JSON.stringify({ code, message })), {});
        switch (name) {
          case 'opex_get_action': if (state.forbidden) throw err('42501', 'Ação indisponível'); return dto();
          case 'opex_my_actions': return { items: args.p_cursor ? [dto({ id: 'act-3', title: 'Terceira' })] : [dto(), dto({ id: 'act-2', title: 'Outra ação', status: 'in_progress', overdue: true })], total: 3, nextCursor: args.p_cursor ? null : { due: '2099-11-30', id: 'act-2' } };
          case 'opex_ack_action': state.status = 'in_progress'; state.version++; return dto();
          case 'opex_submit_action': state.status = 'awaiting_validation'; state.version++; return dto({ submitNote: args.p_note });
          case 'opex_comment_action': return dto();
          case 'opex_entry_pending': return state.pending;
          case 'opex_delete_record': return { deleted: true };
          case 'opex_hub_responsibles': return [{ userId: 'o', name: 'Ricardo' }];
          case 'opex_list_records': return { items: [rec(), rec({ type: 'action', id: 'act-7', title: 'Ação do consolidado', dueDate: '2099-05-05', status: 'in_progress', responsible: 'Executor' })], total: 2, nextCursor: null };
          case 'opex_get_analysis': return { found: false, canWrite: true, live: {} };
          case 'opex_actions_for_analysis': return [dto({ id: 'act-7', title: 'Ação do consolidado' })];
          case 'opex_list_attachments': return [];
        }
      };
      testModule.render();
    });
    await page.waitForSelector('.cockpit-groups-panel .cockpit-table');
    const names = () => page.evaluate(() => calls.map(c => c[0]));

    // ---- deep link / abrir ação (executor sem CC): a tela só mostra o DTO operacional e abrir não confirma ciência
    await page.evaluate(() => review.openAction('act-1'));
    const mine = page.locator('#test-report-panel');
    await mine.locator('.opex-action').waitFor();
    assert.equal(await page.evaluate(() => navigated), 'minhasAcoes');
    const txt = await mine.innerText();
    for (const expected of ['Renegociar contrato', 'Ricardo', '30/11/2099', 'Proposta renegociada', 'Aguardando ciência']) assert.ok(txt.includes(expected), expected);
    assert.doesNotMatch(await mine.innerHTML(), /R\$|Orçado|Realizado|variação|Centro de custo|snapshot/i, 'nenhum conteúdo financeiro na tela do executor');
    assert.ok(!(await names()).includes('opex_ack_action'), 'abrir a ação não confirma ciência');
    assert.equal(await mine.locator('[data-act="ack"]').count(), 1);
    // ciência explícita: ciclo e versão atuais
    await mine.locator('[data-act="ack"]').click();
    await mine.locator('.opex-chip', { hasText: 'Em andamento' }).waitFor();
    const ack = await page.evaluate(() => calls.find(c => c[0] === 'opex_ack_action')[1]);
    assert.deepEqual([ack.p_cycle, ack.p_expected_version], [1, 1]); assert.ok(ack.p_idem_key);
    // concluir exige descrição
    await mine.locator('[data-act-mode="submit"]').click();
    await mine.locator('[data-act="submit"]').click();
    assert.match(await mine.locator('[data-banner]').innerText(), /Descreva a entrega/);
    await mine.locator('[data-in="note"]').fill('Contrato renegociado');
    await mine.locator('[data-act="submit"]').click();
    await mine.locator('.opex-chip', { hasText: 'Aguardando validação' }).waitFor();
    assert.equal(await mine.locator('[data-act="submit"], [data-act="ack"]').count(), 0, 'executor não vê mais cobrança após entregar');
    await page.screenshot({ path: path.join(root, 'artifacts/opex/my-action-desktop.png') });

    // ---- indisponível: mensagem genérica, sem vazar detalhes
    await page.evaluate(() => { state.forbidden = true; review.openAction('act-x'); });
    await mine.locator('[role="alert"]', { hasText: 'Esta ação não está mais disponível para você.' }).waitFor();
    assert.doesNotMatch(await mine.innerText(), /Renegociar|Ricardo/);
    await page.evaluate(() => { state.forbidden = false; });

    // ---- lista com filtros e paginação
    await mine.locator('[data-my-back]').click();
    await mine.locator('.opex-my-table').waitFor();
    assert.equal(await mine.locator('.opex-my-table tbody tr').count(), 2);
    assert.match(await mine.locator('.opex-foot').innerText(), /2 de 3/);
    await mine.locator('[data-my-more]').click();
    await mine.locator('.opex-my-table tbody tr', { hasText: 'Terceira' }).waitFor();
    await mine.locator('[data-my-filter="overdue"]').click();
    await mine.locator('.opex-my-table').waitFor();
    assert.equal((await page.evaluate(() => calls.filter(c => c[0] === 'opex_my_actions').at(-1)[1])).p_filters.overdueOnly, true);

    // ---- consolidado: filtros no servidor e abertura com o contexto SALVO
    await page.evaluate(() => review.openHub());
    await page.locator('#test-report-panel .opex-hub-table').waitFor();
    // duas visões na mesma tela, cartões empilhados: Minhas ações (quem tem tarefa) e, abaixo, o consolidado
    assert.equal(await page.locator('#test-report-panel .opex-split-pane').count(), 2);
    await page.locator('#test-report-panel [data-pane="mine"] .opex-my-table').waitFor();
    const hubHeads = await page.locator('#test-report-panel [data-pane="hub"] thead th').allInnerTexts();
    assert.match(hubHeads[1], /Causa/i); assert.match(hubHeads[2], /Gestão/i, 'coluna Gestão logo depois de Causa / ação');
    assert.match(await page.locator('#test-report-panel [data-pane="hub"] tbody tr').first().locator('td:nth-child(3)').innerText(), /Controladoria/);
    assert.ok((await page.locator('#test-report-panel [data-pane="hub"] thead th').first().boundingBox()).width <= 100, 'coluna Tipo estreita');
    for (const width of [1000, 1100, 1400]) {
      await page.setViewportSize({ width, height: 800 });
      const cells = await page.locator('#test-report-panel [data-pane="hub"] tbody tr td:first-child').evaluateAll(nodes => nodes.map(n => [n.innerText, n.scrollWidth <= n.clientWidth]));
      assert.ok(cells.every(([, fits]) => fits), 'Tipo (Análise/Ação) nunca cortado em ' + width + 'px: ' + JSON.stringify(cells));
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    // legenda padrão com o texto completo ao passar o mouse em Causa / ação e CC · Conta
    await page.locator('#test-report-panel [data-pane="hub"] tbody tr:first-child td:nth-child(2)').hover();
    await page.locator('#opex-tip:not([hidden])').waitFor();
    assert.match(await page.locator('#opex-tip').innerText(), /Causa \/ ação[\s\S]*Reajuste/i);
    await page.locator('#test-report-panel [data-pane="hub"] tbody tr:first-child td:nth-child(4)').hover();
    await page.waitForFunction(() => /CC · Conta/i.test(document.querySelector('#opex-tip').innerText));
    assert.match(await page.locator('#opex-tip').innerText(), /200 · 102 Consultoria/);
    // classificador padrão nos cabeçalhos: alfabético ↑/↓, azul quando ativo, sem perder a identidade da linha
    const hubTh = page.locator('#test-report-panel [data-pane="hub"] th[data-sort="responsible"]');
    await hubTh.click();
    assert.match(await hubTh.innerText(), /↑/);
    assert.match(await hubTh.getAttribute('style'), /var\(--blue\)/);
    const resp = () => page.locator('#test-report-panel [data-pane="hub"] tbody tr td:nth-child(6)').allInnerTexts();
    let names1 = await resp(); assert.deepEqual(names1, [...names1].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    await hubTh.click();
    assert.match(await hubTh.innerText(), /↓/);
    names1 = await resp(); assert.deepEqual(names1, [...names1].sort((a, b) => b.localeCompare(a, 'pt-BR')));
    const myTh = page.locator('#test-report-panel [data-pane="mine"] th[data-sort="title"]');
    await myTh.click();
    assert.match(await myTh.innerText(), /↑/);
    // sem o Cockpit na sessão (host ausente) a legenda continua funcionando, com o cartão próprio
    await page.evaluate(async () => { review.attach({ bindTips: () => {}, refresh: () => {}, reopenGroupDrilldown: () => {} }); await review.openHub(); });
    await page.locator('#test-report-panel [data-pane="hub"] tbody tr:first-child td:nth-child(2)').waitFor();
    await page.locator('#test-report-panel [data-pane="hub"] tbody tr:first-child td:nth-child(2)').hover();
    await page.locator('#opex-tip:not([hidden])').waitFor();
    assert.match(await page.locator('#opex-tip').innerText(), /Causa \/ ação[\s\S]*Reajuste/i);
    await page.mouse.move(5, 5);
    await page.locator('#opex-tip').waitFor({ state: 'hidden' });
    const size = sel => page.locator(sel).first().evaluate(n => getComputedStyle(n).fontSize);
    const rowSel = '#test-report-panel [data-pane="hub"] tbody tr:first-child';
    assert.equal(await size(rowSel + ' td:nth-child(2)'), await size(rowSel + ' td.gap-code'), 'texto da lista no mesmo tamanho das colunas de período/prazo');
    const hubBox = await page.locator('[data-pane="hub"]').boundingBox(), mineBox = await page.locator('[data-pane="mine"]').boundingBox();
    assert.ok(hubBox.y > mineBox.y + mineBox.height - 1, 'consolidado fica abaixo de Minhas ações');
    assert.ok(Math.abs(hubBox.width - mineBox.width) <= 1, 'cartões com a mesma largura');
    await page.screenshot({ path: 'artifacts/opex/hub-split.png' });
    assert.equal(await page.locator('#test-report-panel .opex-hub-table tbody tr').count(), 2);
    assert.match(await page.locator('#test-report-panel [data-pane="hub"]').innerText(), /Análise.*Ação/s);
    assert.match(await page.locator('#test-report-panel [data-pane="hub"] tbody tr').nth(0).innerText(), /Jun\/2025 · YTD/);
    assert.match(await page.locator('#test-report-panel [data-pane="hub"] tbody tr').nth(1).innerText(), /05\/05\/2099/);
    await page.locator('#test-report-panel [data-hub-f="type"]').selectOption('actions');
    await page.waitForFunction(() => calls.filter(c => c[0] === 'opex_list_records').at(-1)[1].p_filters.type === 'actions');
    await page.locator('#test-report-panel [data-hub-sort="due"]').click();
    await page.waitForFunction(() => calls.filter(c => c[0] === 'opex_list_records').at(-1)[1].p_filters.sort === 'due');
    await page.locator('#test-report-panel [data-hub-f="responsibleUserId"]').selectOption('o');
    await page.waitForFunction(() => calls.filter(c => c[0] === 'opex_list_records').at(-1)[1].p_filters.responsibleUserId === 'o');
    await page.locator('#test-report-panel [data-pane="hub"] tbody tr').first().click();
    await page.locator('.opex-analysis-pop').waitFor();
    const opened = await page.evaluate(() => calls.filter(c => c[0] === 'opex_get_analysis').at(-1)[1].p_ctx);
    assert.deepEqual([opened.sourceKey, opened.year, opened.periodType, opened.month, opened.costCenterId, opened.accountNumber], ['scenario:old-scenario', 2025, 'YTD', 6, 'cc2', '102'], 'restaura fonte/ano/competência salvos, não o filtro do Cockpit');
    assert.match(await page.locator('.opex-analysis-pop .gap-badge').innerText(), /Acumulado Jan–Jun\/2025/i);
    await page.keyboard.press('Escape');
    await page.locator('#test-report-panel [data-pane="hub"] tbody tr').nth(1).click();
    await page.locator('.opex-analysis-pop [data-opex-tab="plan"][aria-selected="true"]').waitFor();
    await page.keyboard.press('Escape');

    // ---- exclusão (lixeira): só administrador; não abre a análise; pede confirmação
    assert.equal(await page.locator('#test-report-panel [data-hub-delete]').count(), 0, 'sem lixeira para quem não é administrador');
    await page.evaluate(async () => { rpcState.thresholds = { ...rpcState.thresholds, canEdit: true }; reviewService.invalidate(); await review.openHub(); });
    await page.locator('#test-report-panel [data-hub-delete]').first().waitFor();
    assert.equal(await page.locator('#test-report-panel [data-hub-delete]').count(), 2);
    await page.evaluate(() => { window.confirmAnswer = false; });
    await page.locator('#test-report-panel [data-hub-delete]').nth(1).click();
    assert.equal(await page.evaluate(() => calls.filter(c => c[0] === 'opex_delete_record').length), 0, 'cancelar a confirmação não exclui');
    await page.evaluate(() => { window.confirmAnswer = true; });
    await page.locator('#test-report-panel [data-hub-delete]').nth(1).click();
    await page.waitForFunction(() => calls.some(c => c[0] === 'opex_delete_record'));
    assert.deepEqual(await page.evaluate(() => calls.find(c => c[0] === 'opex_delete_record')[1]), { p_type: 'action', p_id: 'act-7' });
    assert.equal(await page.locator('.opex-analysis-pop').count(), 0, 'a lixeira não abre o registro');
    assert.equal(await page.locator('#test-report-panel [data-hub-delete][data-tip]').count(), 0, 'lixeira sem legenda');
    const actionsTd = page.locator('#test-report-panel [data-pane="hub"] tbody tr:first-child td:last-child');
    assert.ok(await actionsTd.evaluate(n => n.scrollWidth <= n.clientWidth + 1), 'coluna de ações sem corte ("…")');
    assert.ok((await page.evaluate(() => toasts)).includes('Registro excluído.'));

    // ---- popover de entrada
    const pendingData = () => ({ total: 6, sections: {
      ack: { total: 2, items: [dto({ id: 'a1', title: 'Ciência 1', dueDate: '2099-01-02' }), dto({ id: 'a2', title: 'Ciência 2 vencida', dueDate: '2000-01-01', overdue: true })] },
      overdue: { total: 1, items: [dto({ id: 'o1', title: 'Vencida', status: 'in_progress', overdue: true, dueDate: '2001-01-01' })] },
      upcoming: { total: 1, items: [dto({ id: 'u1', title: 'A vencer', status: 'in_progress' })] },
      validate: { total: 2, items: [dto({ id: 'v1', title: 'Validar isto', status: 'awaiting_validation' })] } } });
    await page.evaluate(() => { state.status = 'awaiting_ack'; state.version = 1; window.dto = window.dto; });
    await page.evaluate(src => { window.pendingFactory = eval('(' + src + ')'); state.pending = pendingFactory(); window.entryDone = false; review.runEntry().then(() => { entryDone = true; }); }, pendingData.toString());
    const entry = page.locator('.opex-entry-pop');
    await entry.waitFor();
    const heads = await entry.locator('h4').allInnerTexts();
    assert.deepEqual(heads.map(h => h.replace(/\s+\d+$/, '').trim()), ['Aguardando ciência', 'Vencidas', 'A vencer', 'Entregas para você validar']);
    assert.equal(await entry.locator('[data-section="ack"] li').count(), 2, 'vencida aguardando ciência aparece só na seção de ciência');
    assert.equal(await entry.locator('[data-section="overdue"] li', { hasText: 'Ciência 2' }).count(), 0);
    assert.match(await entry.innerText(), /Há mais 1 ação pendente além das exibidas/);
    assert.equal(await entry.locator('[data-section="validate"] [data-entry-ack]').count(), 0, 'Ciente só na seção de ciência');
    await page.screenshot({ path: path.join(root, 'artifacts/opex/entry-popover.png') });
    // Ciente remove o item; fechar não confirma nada
    const before = (await names()).filter(n => n === 'opex_ack_action').length;
    await entry.locator('[data-section="ack"] li', { hasText: 'Ciência 1' }).locator('[data-entry-ack]').click();
    await entry.locator('[data-section="ack"] li', { hasText: 'Ciência 1' }).waitFor({ state: 'detached' });
    assert.equal((await names()).filter(n => n === 'opex_ack_action').length, before + 1);
    await entry.locator('[data-entry-close]').first().click();
    await page.waitForFunction(() => entryDone === true);
    assert.equal((await names()).filter(n => n === 'opex_ack_action').length, before + 1, 'fechar não confirma ciência dos demais');
    // abrir a ação fecha o popover e navega sem confirmar ciência
    await page.evaluate(() => { state.pending = pendingFactory(); entryDone = false; review.runEntry().then(() => { entryDone = true; }); });
    await entry.waitFor();
    await entry.locator('li[data-item="a2"] [data-entry-open]').click();
    await page.waitForFunction(() => entryDone === true);
    // já na tela combinada: abre a ação no painel de baixo, sem trocar de tela
    await page.locator('#test-report-panel [data-pane="mine"] .opex-action').waitFor();
    assert.equal((await names()).filter(n => n === 'opex_ack_action').length, before + 1);
    // sem pendências não abre
    await page.evaluate(() => { state.pending = { total: 0, sections: {} }; return review.runEntry(); });
    assert.equal(await page.locator('.opex-entry-pop').count(), 0);

    // ---- fila de overlays: prioridade, um por vez, adiada sobre formulário não salvo
    const order = await page.evaluate(async () => {
      const log = []; let dirty = true;
      const queue = VECTON_OVERLAY_QUEUE.createOverlayQueue({ gate: () => dirty, gatePollMs: 20 });
      const open = (name, ms) => async () => { log.push('open:' + name); await new Promise(r => setTimeout(r, ms)); log.push('close:' + name); };
      queue.enqueue('novidades', 20, open('novidades', 30));
      queue.enqueue('pendencias', 10, open('pendencias', 30));
      await new Promise(r => setTimeout(r, 120));
      const blocked = log.length;
      dirty = false;
      await new Promise(r => setTimeout(r, 250));
      return { blocked, log };
    });
    assert.equal(order.blocked, 0, 'nada abre sobre formulário com alterações não salvas');
    assert.deepEqual(order.log, ['open:pendencias', 'close:pendencias', 'open:novidades', 'close:novidades']);
    assert.deepEqual(errors, []);
    console.log('opexReview telas (Minhas ações, consolidado, popover de entrada, fila de overlays): OK');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
