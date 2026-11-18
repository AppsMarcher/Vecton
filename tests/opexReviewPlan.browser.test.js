const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { openCockpitPage, root } = require('./helpers/opexCockpitPage');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.COCKPIT_BROWSER_CHANNEL || 'msedge' });
  try {
    const { page, errors } = await openCockpitPage(browser);
    await page.evaluate(() => {
      window.db = { analysis: { id: 'an-1', version: 1, nature: 'recurring', analysisState: 'analyzed', monitor: false, cause: 'Reajuste', futureEffect: '', expectedFinancialImpact: null, dataChangedSinceReview: false },
        actions: [], files: [{ id: 'f-analysis', fileName: 'planilha-analise.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 2048, createdAt: '2026-09-10', uploadedBy: 'Gestor', sharedActionIds: [] }],
        actionFiles: [], calls: [] };
      const execs = [{ userId: 'u-exec', name: 'Executor Sem CC', hasCcAccess: false }, { userId: 'u-mgr2', name: 'Gestor Dois', hasCcAccess: true }];
      const dtoOf = a => ({ id: a.id, title: a.title, expectedResult: a.expectedResult, dueDate: a.dueDate, status: a.status, overdue: false, assignmentCycle: a.cycle, version: a.version,
        owner: { id: 'u-me', name: 'Eu' }, assignee: { id: a.assignee, name: execs.find(e => e.userId === a.assignee).name }, acknowledgedAt: null, submittedAt: null, submitNote: null, validatedAt: null, createdAt: '2026-09-10',
        events: a.events, permissions: { isOwner: true, isAssignee: false, canAck: false, canSubmit: false, canComment: a.status !== 'completed', canValidate: false, canReturn: false, canReassign: true, canEditTerms: true } });
      window.rpcHandler = async (name, args) => {
        db.calls.push([name, args]);
        switch (name) {
          case 'opex_get_analysis': return { ...db.analysis, found: true, canWrite: true, live: {} };
          case 'opex_actions_for_analysis': return db.actions.map(dtoOf);
          case 'opex_assignable_users': return execs;
          case 'opex_assignable_for_action': return execs;
          case 'opex_list_attachments': return args.p_entity.type === 'analysis' ? db.files : db.actionFiles;
          case 'opex_create_action': {
            const f = args.p_fields; const a = { id: 'act-' + (db.actions.length + 1), title: f.title, expectedResult: f.expectedResult, dueDate: f.dueDate, assignee: f.assigneeUserId, status: 'awaiting_ack', cycle: 1, version: 1, events: [{ kind: 'created', actor: 'Eu', at: '2026-09-10T10:00:00Z', text: 'Ação criada: ' + f.title }] };
            await new Promise(r => setTimeout(r, 80));
            if (!db.actions.some(x => x.title === f.title)) db.actions.push(a);
            return { ...dtoOf(db.actions.find(x => x.title === f.title)), analysisId: 'an-1', analysisVersion: 1 };
          }
          case 'opex_share_attachment': { db.files[0].sharedActionIds = [args.p_action_id]; return { restricted: true }; }
          case 'opex_get_action': return dtoOf(db.actions.find(a => a.id === args.p_action_id));
          case 'opex_update_action_terms': { const a = db.actions.find(x => x.id === args.p_action_id); a.dueDate = args.p_fields.dueDate || a.dueDate; a.version++; return dtoOf(a); }
          case 'opex_prepare_upload': return { attachmentId: 'att-' + (db.actionFiles.length + db.files.length + 1), bucket: 'opex-review-attachments', path: 'org/' + args.p_entity.type + '/' + args.p_entity.id + '/x-' + args.p_meta.fileName };
          case 'opex_finalize_upload': { const m = db.lastMeta; db.files.push({ id: args.p_attachment_id, fileName: db.lastName, mimeType: 'application/pdf', size: 1000, createdAt: '2026-09-11', uploadedBy: 'Eu', sharedActionIds: [] }); return { id: args.p_attachment_id }; }
        }
      };
      testModule.render();
    });
    await page.waitForSelector('.cockpit-groups-panel .cockpit-table');
    await page.locator('.cockpit-groups-panel tbody tr', { has: page.locator('th:has-text("Serviços")') }).click();
    await page.locator('.cockpit-drill-pop tr[data-row]').first().click();
    const pop = page.locator('.opex-analysis-pop');
    await pop.locator('[data-f="cause"]').waitFor();

    // anexos da análise: abaixo do conteúdo das abas, com a lista carregada sob demanda
    await pop.locator('.opex-attach-list li', { hasText: 'planilha-analise.xlsx' }).waitFor();
    assert.match(await pop.locator('[data-opex-attachments]').innerText(), /Anexos da análise/);
    // upload: arquivo grande recusado no cliente sem chamar o servidor; falha de envio mantém o resto e oferece retry
    const upload = async (name, size, mime = 'application/pdf') => {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), pop.locator('[data-att-add]').click()]);
      await chooser.setFiles({ name, mimeType: mime, buffer: Buffer.alloc(size, 1) });
    };
    await page.evaluate(() => { db.lastName = 'boleto.pdf'; });
    await upload('gigante.pdf', 20 * 1024 * 1024 + 1);
    await pop.locator('.opex-attach-failed', { hasText: 'excede 20 MB' }).waitFor();
    assert.equal(await page.evaluate(() => db.calls.filter(c => c[0] === 'opex_prepare_upload').length), 0);
    await pop.locator('[data-att-dismiss]').click();
    await page.evaluate(() => { window.uploadFail = 'rede caiu'; });
    await upload('boleto.pdf', 1000);
    await pop.locator('.opex-attach-failed', { hasText: 'rede caiu' }).waitFor();
    assert.equal(await pop.locator('.opex-attach-list li[data-att-id]').count(), 1, 'falha não apaga os arquivos já anexados');
    await page.evaluate(() => { window.uploadFail = null; });
    await pop.locator('[data-att-retry]').click();
    await pop.locator('.opex-attach-list li[data-att-id]', { hasText: 'boleto.pdf' }).waitFor();
    const uploads = await page.evaluate(() => uploads);
    assert.equal(uploads.at(-1)[0], 'opex-review-attachments'); assert.match(uploads.at(-1)[1], /\/analysis\/an-1\//);

    // aba Plano de ação: vazia → nova ação
    await pop.locator('[data-opex-tab="plan"]').click();
    await pop.locator('.opex-empty', { hasText: 'Nenhuma ação' }).waitFor();
    await pop.locator('[data-plan-new]').click();
    await pop.locator('[data-pf-picker] .opex-picker-btn').waitFor();
    // obrigatórios
    await pop.locator('[data-plan-save]').click();
    assert.match(await pop.locator('[data-plan-banner]').innerText(), /Informe/);
    await pop.locator('[data-pf="title"]').fill('Renegociar contrato de manutenção');
    await pop.locator('[data-pf="dueDate"]').fill('2027-11-30');
    await pop.locator('[data-pf="expectedResult"]').fill('Proposta renegociada');
    await pop.locator('[data-pf-picker] .opex-picker-btn').click();
    await page.screenshot({ path: path.join(root, 'artifacts/opex/plan-picker.png') });
    assert.equal((await pop.locator('.opex-picker-list').innerText()).includes('sem acesso'), false, 'sem sufixo textual');
    assert.equal(await pop.locator('.opex-picker-list li[data-id="u-exec"] .opex-picker-flag').count(), 1);
    assert.equal(await pop.locator('.opex-picker-list li[data-id="u-mgr2"] .opex-picker-flag').count(), 0);
    assert.match(await pop.locator('.opex-picker-list li[data-id="u-exec"] .opex-picker-flag').getAttribute('data-tip-rows'), /Sem acesso ao centro de custo/);
    await pop.locator('.opex-picker-list li[data-id="u-exec"]').click();
    assert.equal(await pop.locator('.opex-picker-list').isHidden(), true);
    // executor sem CC: aviso exato + escolha de anexos + confirmação obrigatória
    assert.equal(await pop.locator('.opex-warning').innerText(), 'Este responsável não possui acesso ao centro de custo. Ele visualizará somente a ação e os conteúdos compartilhados.');
    await pop.locator('[data-pshare="f-analysis"]').check();
    await pop.locator('[data-plan-save]').click();
    assert.match(await pop.locator('[data-plan-banner]').innerText(), /Confirme o compartilhamento/);
    assert.equal(await page.evaluate(() => db.calls.filter(c => c[0] === 'opex_create_action').length), 0, 'nada é atribuído antes de salvar/confirmar');
    await pop.locator('[data-pf-confirm]').check();
    await pop.locator('[data-plan-save]').dblclick();
    await pop.locator('.opex-plan-table tbody tr').waitFor();
    const created = await page.evaluate(() => db.calls.filter(c => c[0] === 'opex_create_action'));
    assert.equal(created.length >= 1, true);
    assert.equal(new Set(created.map(c => c[1].p_idem_key)).size, 1, 'duplo clique reaproveita a chave idempotente');
    assert.equal(await page.evaluate(() => db.actions.length), 1, 'uma ação só');
    assert.deepEqual(Object.keys(created[0][1].p_fields).sort(), ['assigneeUserId', 'dueDate', 'expectedResult', 'title']);
    assert.equal((await page.evaluate(() => db.calls.filter(c => c[0] === 'opex_share_attachment').at(-1)[1])).p_confirm_restricted, true);
    assert.match(await pop.locator('[data-opex-tab="plan"]').innerText(), /Plano de ação · 1/);
    assert.match(await pop.locator('.opex-plan-table').innerText(), /Aguardando ciência/);
    assert.match(await pop.locator('.opex-plan-table').innerText(), /30\/11\/2027/);

    // tela operacional da ação (dono): sem "Ciente", com reatribuir e prazo; arquivos compartilhados e histórico
    await pop.locator('.opex-action').waitFor();
    const action = pop.locator('.opex-action');
    assert.equal(await action.locator('[data-act="ack"]').count(), 0);
    assert.ok(await action.locator('[data-act-mode="reassign"]').isVisible() && await action.locator('[data-act-mode="terms"]').isVisible());
    assert.match(await action.innerText(), /Ação criada: Renegociar contrato de manutenção/);
    assert.ok((await action.locator('[data-share="f-analysis"]').isChecked()), 'compartilhamento explícito aparece marcado');
    await action.locator('[data-act-mode="terms"]').click();
    await action.locator('[data-in="dueDate"]').fill('2027-12-15');
    await action.locator('[data-act="terms"]').click();
    await action.locator('dd', { hasText: '15/12/2027' }).waitFor();
    await action.locator('[data-act-mode="reassign"]').click();
    await action.locator('[data-in-picker] .opex-picker-btn').click();
    await action.locator('[data-in-picker] li[data-id="u-exec"]').click();
    assert.equal(await action.locator('[data-warn]').isHidden(), false, 'aviso também na reatribuição para quem não tem CC');
    await page.screenshot({ path: path.join(root, 'artifacts/opex/plan-desktop.png') });
    assert.deepEqual(errors, []);
    console.log('opexReview plano de ação (nova ação, aviso sem CC, anexos, tela da ação): OK');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
