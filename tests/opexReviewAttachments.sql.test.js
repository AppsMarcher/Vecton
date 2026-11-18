const assert = require('node:assert/strict');
const { createOpexDb } = require('./helpers/opexSqlHarness');
const FILES = ['346_opex_review_schema.sql', '347_opex_review_analysis_rpcs.sql', '348_opex_review_actions_rpcs.sql', '349_opex_review_attachments.sql'];
(async () => {
  const { db, ids, as, asSuper, fails, uuid } = await createOpexDb(FILES);
  try {
    const budget = uuid();
    await asSuper();
    await db.query(`insert into forecast_scenarios(id,organization_id,name,reference_year) values($1,$2,'Budget 2026',2026)`, [budget, ids.org]);
    const ctx = JSON.stringify({ costCenterId: ids.cc1, accountNumber: '0010', year: 2026, periodType: 'month', month: 9, sourceKey: `scenario:${budget}` });
    const call = async (fn, ...args) => (await db.query(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) r`, args)).rows[0].r;
    const as_ = (user, fn, ...args) => as(user).then(() => call(fn, ...args));
    const action = await as_(ids.manager, 'opex_create_action', ctx, JSON.stringify({ title: 'Ação', expectedResult: 'R', dueDate: '2099-12-31', assigneeUserId: ids.exec }), uuid());
    await asSuper();
    const analysisId = (await db.query('select id from opex_variance_analyses')).rows[0].id;
    const meta = (over = {}) => JSON.stringify({ fileName: 'planilha.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 1000, path: 'outra/pasta/x', ...over });
    const upload = async (user, entity, over) => {
      const prep = await as_(user, 'opex_prepare_upload', JSON.stringify(entity), meta(over));
      await as(user);
      await db.query(`insert into storage.objects(bucket_id,name,owner) values('opex-review-attachments',$1,$2)`, [prep.path, user]);
      await call('opex_finalize_upload', prep.attachmentId);
      return prep;
    };
    const visible = async (user, path) => { await as(user); return (await db.query(`select count(*)::int n from storage.objects where bucket_id='opex-review-attachments' and name=$1`, [path])).rows[0].n; };

    // prepare: validações e permissões
    const analysisEntity = { type: 'analysis', id: analysisId };
    await fails(as_(ids.manager, 'opex_prepare_upload', JSON.stringify(analysisEntity), meta({ fileName: 'a.html', mimeType: 'text/html' })), '22023');
    await fails(as_(ids.manager, 'opex_prepare_upload', JSON.stringify(analysisEntity), meta({ fileName: 'a.svg', mimeType: 'image/svg+xml' })), '22023');
    await fails(as_(ids.manager, 'opex_prepare_upload', JSON.stringify(analysisEntity), meta({ fileName: 'a.exe', mimeType: 'application/pdf' })), '22023');
    await fails(as_(ids.manager, 'opex_prepare_upload', JSON.stringify(analysisEntity), meta({ size: 20 * 1024 * 1024 + 1 })), '22023');
    await fails(as_(ids.manager, 'opex_prepare_upload', JSON.stringify(analysisEntity), meta({ size: 0 })), '22023');
    await fails(as_(ids.manager, 'opex_prepare_upload', JSON.stringify(analysisEntity), meta({ fileName: '../x.pdf', mimeType: 'application/pdf' })), '22023');
    await fails(as_(ids.analyst, 'opex_prepare_upload', JSON.stringify(analysisEntity), meta()), '42501');
    await fails(as_(ids.exec, 'opex_prepare_upload', JSON.stringify(analysisEntity), meta()), '42501');
    const att = await upload(ids.manager, analysisEntity);
    assert.equal(att.path.startsWith(`${ids.org}/analysis/${analysisId}/`), true, 'caminho gerado no servidor');
    assert.equal(att.bucket, 'opex-review-attachments');

    // pendente não aparece; finalize exige upload real; outro usuário não envia no caminho alheio
    const pending = await as_(ids.manager, 'opex_prepare_upload', JSON.stringify(analysisEntity), meta({ fileName: 'b.pdf', mimeType: 'application/pdf' }));
    await fails(call('opex_finalize_upload', pending.attachmentId), '22023');
    await as(ids.exec2);
    await fails(db.query(`insert into storage.objects(bucket_id,name,owner) values('opex-review-attachments',$1,$2)`, [pending.path, ids.exec2]), '42501');
    await as(ids.manager);
    await fails(db.query(`insert into storage.objects(bucket_id,name,owner) values('opex-review-attachments','qualquer/caminho',$1)`, [ids.manager]), '42501');
    assert.equal((await call('opex_list_attachments', JSON.stringify(analysisEntity))).length, 1);

    // leitura: gestor e admin leem; executor sem CC não; adivinhar caminho não ajuda
    assert.equal(await visible(ids.manager, att.path), 1);
    assert.equal(await visible(ids.admin, att.path), 1);
    assert.equal(await visible(ids.exec, att.path), 0);
    assert.equal(await visible(ids.exec2, att.path), 0);
    assert.equal(await visible(ids.outsider, att.path), 0);
    await fails(as_(ids.exec, 'opex_list_attachments', JSON.stringify(analysisEntity)), '42501');
    await fails(as_(ids.exec, 'opex_attachment_access', att.attachmentId), '42501');

    // compartilhamento: confirmação obrigatória para executor sem CC; só o dono
    await fails(as_(ids.manager, 'opex_share_attachment', action.id, att.attachmentId, false), '22023');
    await fails(as_(ids.exec, 'opex_share_attachment', action.id, att.attachmentId, true), '42501');
    await fails(as_(ids.admin, 'opex_share_attachment', action.id, att.attachmentId, true), '42501');
    const shared = await as_(ids.manager, 'opex_share_attachment', action.id, att.attachmentId, true);
    assert.equal(shared.restricted, true);
    await asSuper();
    assert.equal((await db.query(`select audit->>'confirmedRestricted' c from opex_action_events where kind='attachment_shared'`)).rows[0].c, 'true');
    const execList = await as_(ids.exec, 'opex_list_attachments', JSON.stringify({ type: 'action', id: action.id }));
    assert.deepEqual(execList.map(f => [f.fileName, f.origin]), [['planilha.xlsx', 'shared']]);
    assert.ok(!JSON.stringify(execList).includes(analysisId), 'sem ID da análise no DTO do executor');
    assert.equal((await as_(ids.exec, 'opex_attachment_access', att.attachmentId)).expiresIn, 60);
    assert.equal(await visible(ids.exec, att.path), 1, 'executor lê o objeto compartilhado');
    assert.equal(await visible(ids.exec2, att.path), 0);
    await fails(as_(ids.exec2, 'opex_list_attachments', JSON.stringify({ type: 'action', id: action.id })), '42501');
    // outros anexos da análise não vazam por causa do compartilhamento
    const other = await upload(ids.manager, analysisEntity, { fileName: 'outro.pdf', mimeType: 'application/pdf' });
    assert.equal(await visible(ids.exec, other.path), 0);
    assert.equal((await as_(ids.exec, 'opex_list_attachments', JSON.stringify({ type: 'action', id: action.id }))).length, 1);

    // evidência da ação: executor envia; dono e executor veem; terceiro não
    const evidence = await upload(ids.exec, { type: 'action', id: action.id }, { fileName: 'evidencia.png', mimeType: 'image/png' });
    assert.equal(evidence.path.startsWith(`${ids.org}/action/${action.id}/`), true);
    assert.equal(await visible(ids.manager, evidence.path), 1);
    assert.equal(await visible(ids.exec2, evidence.path), 0);
    assert.equal((await as_(ids.manager, 'opex_list_attachments', JSON.stringify({ type: 'action', id: action.id }))).length, 2);
    await asSuper();
    assert.equal((await db.query(`select count(*)::int n from opex_action_events where kind='attachment_added'`)).rows[0].n, 1);

    // revogar bloqueia nova URL e novo acesso ao objeto
    await fails(as_(ids.exec, 'opex_revoke_share', action.id, att.attachmentId), '42501');
    assert.equal((await as_(ids.manager, 'opex_revoke_share', action.id, att.attachmentId)).revoked, 1);
    await fails(as_(ids.exec, 'opex_attachment_access', att.attachmentId), '42501');
    assert.equal(await visible(ids.exec, att.path), 0);
    assert.equal((await as_(ids.exec, 'opex_list_attachments', JSON.stringify({ type: 'action', id: action.id }))).length, 1);
    assert.equal((await as_(ids.manager, 'opex_revoke_share', action.id, att.attachmentId)).revoked, 0, 'idempotente');

    // reatribuição não amplia acesso: novo executor só vê o que a ação compartilha
    await as_(ids.manager, 'opex_share_attachment', action.id, att.attachmentId, true);
    const re = await as_(ids.manager, 'opex_reassign_action', action.id, ids.exec2, 1, uuid());
    assert.equal(await visible(ids.exec, att.path), 0, 'antigo executor perde o acesso');
    assert.equal(await visible(ids.exec2, att.path), 1, 'compartilhamento da ação acompanha o executor atual');
    assert.equal(await visible(ids.exec2, other.path), 0, 'demais anexos da análise seguem privados');

    // remoção: bloqueada com compartilhamento ativo; depois some das listas e do acesso
    await fails(as_(ids.manager, 'opex_remove_attachment', att.attachmentId), '22023');
    await as_(ids.manager, 'opex_revoke_share', action.id, att.attachmentId);
    await fails(as_(ids.exec2, 'opex_remove_attachment', att.attachmentId), '42501');
    await as_(ids.manager, 'opex_remove_attachment', att.attachmentId);
    assert.equal(await visible(ids.manager, att.path), 0);
    await fails(as_(ids.manager, 'opex_attachment_access', att.attachmentId), '42501');
    assert.equal((await as_(ids.manager, 'opex_list_attachments', JSON.stringify(analysisEntity))).length, 1);

    // ação concluída não recebe novos anexos; usuário desativado não acessa
    await asSuper();
    await db.query(`update opex_action_plans set status='completed' where id=$1`, [action.id]);
    await fails(as_(ids.exec2, 'opex_prepare_upload', JSON.stringify({ type: 'action', id: action.id }), meta()), '42501');
    await asSuper();
    await db.query(`update user_profiles set is_active=false where user_id=$1`, [ids.manager]);
    assert.equal(await visible(ids.manager, other.path), 0);
    await fails(as_(ids.manager, 'opex_list_attachments', JSON.stringify(analysisEntity)), '42501');
    console.log('opexReviewAttachments.sql: OK');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exit(1); });
