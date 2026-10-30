const assert = require('node:assert/strict');
const { createDb } = require('./helpers/planningFatDb');
(async () => {
  const T = await createDb();
  const { db, ids, k } = T;
  const { write } = T;
  try {
    await T.loadFat();
    // a 329 aplicada com CRLF (psql/editor no Windows): o patch da 332 não pode depender de LF
    await db.exec(T.mig('329_planejado_corrige_valor_vazio.sql').split(String.fromCharCode(10)).join(String.fromCharCode(13, 10)));
    await T.loadImport();
    await T.as(ids.admin);
    const months = Array.from({ length: 12 }, () => ({ type: 'forms' }));
    const sid = (await write('create', null, { name: 'Budget', year: 2027, months, forms: [] })).id;
    await db.exec('reset role');
    const acct = id => ({ id, num: null });
    const mkAccount = async num => { const id = require('node:crypto').randomUUID(); await db.query("insert into accounts values($1,$2,$3,$4,true)", [id, ids.org, num, 'Conta ' + num]); await db.query("insert into dre_plan_nodes(organization_id,account_id,node_class) values($1,$2,'Analitica')", [ids.org, id]); return id; };
    const a08 = await mkAccount('31101001');
    await T.as(ids.admin);
    const f08 = (await write('save_form', sid, { code: '08', name: 'Faturamento | Impostos | Matéria-prima' })).id;
    const l08 = (await write('save_line', sid, { form_id: f08, seq: 1, description: 'VENDA', origin: 'input', formula_name: 'VENDA', account_id: a08 })).id;
    await db.exec('reset role');

    // ---- Task 1: lançamento sem centro de custo
    const up = amount => db.query(`insert into planning_entries(organization_id,form_id,line_id,cost_center_id,reference_month,amount) values($1,$2,$3,null,1,$4)
      on conflict(line_id,cost_center_id,reference_month) do update set amount=excluded.amount,row_version=planning_entries.row_version+1`, [ids.org, f08, l08, amount]);
    await up(10); await up(20);
    const rows = (await db.query('select amount::numeric,row_version from planning_entries where line_id=$1 and cost_center_id is null', [l08])).rows;
    assert.deepEqual(rows.map(r => [Number(r.amount), r.row_version]), [[20, 2]], 'sem centro de custo: mesma chave substitui e sobe a versão');

    // ---- Task 2: salvar, ler e integrar sem centro de custo
    const rev = async f => (await db.query('select revision from planning_forms where id=$1', [f])).rows[0].revision;
    const save = async (f, cells) => write('save_entries', sid, { form_id: f, form_revision: await rev(f), cells });
    await db.query('delete from planning_entries');
    await T.as(ids.admin);
    await write('save_form', sid, { id: f08, code: '08', name: 'Faturamento | Impostos | Matéria-prima', status: 'released' });
    await write('save_access', sid, { form_id: f08, access: [{ user_id: ids.writer, access_mode: 'write' }] });
    assert.equal((await save(f08, [{ line_id: l08, cost_center_id: null, month: 1, amount: '-500', version: 0 }])).ok !== false, true, 'administrador salva sem centro de custo');
    const noCc = (await db.query('select planning_read_form($1,$2,$3) r', [ids.org, f08, []])).rows[0].r;
    assert.deepEqual(noCc.entries.map(e => [e.cost_center_id, Number(e.amount)]), [[null, -500]], 'leitura com seleção vazia devolve o lançamento sem centro de custo');
    const conflict = await save(f08, [{ line_id: l08, cost_center_id: null, month: 1, amount: '-600', version: 0 }]);
    assert.equal(conflict.ok, false, 'versão antiga de célula sem centro de custo gera conflito');
    await save(f08, [{ line_id: l08, cost_center_id: null, month: 1, amount: '-600', version: 1 }]);
    await T.as(ids.writer);
    await assert.rejects(save(f08, [{ line_id: l08, cost_center_id: null, month: 2, amount: '1', version: 0 }]), /fora do escopo/, 'quem não é administrador não lança sem centro de custo');
    await assert.rejects(db.query('select planning_read_form($1,$2,$3)', [ids.org, f08, []]), /fora do escopo|Sem acesso/, 'nem lê');
    await T.as(ids.admin);
    await save(f08, [{ line_id: l08, cost_center_id: ids.cc, month: 1, amount: '70', version: 0 }]);
    await write('project', sid, { form_id: f08 });
    await db.exec('reset role');
    const led = (await db.query("select cost_center_id,cost_center_number,amount::float8 a from forecast_ledger_entries where scenario_id=$1 and planning_form_id=$2 and account_number='31101001' and reference_month=1 order by cost_center_number nulls first", [sid, f08])).rows;
    assert.deepEqual(led.map(r => [r.cost_center_number, r.a]), [[null, -600], ['101', 70]], 'integração grava o lançamento sem centro de custo no razão, sem centro de custo');

    // ---- Task 3: FAT e CPX prevalecem sobre o 08 e o 04 no razão
    const fatForm = (await db.query("select id from planning_forms where scenario_id=$1 and form_type='fat'", [sid])).rows[0].id;
    const cpxForm = (await db.query("select id from planning_forms where scenario_id=$1 and form_type='capex'", [sid])).rows[0].id;
    await db.exec(`select set_config('vecton.planning_write','${sid}',false)`);
    const put = (form, cc, month, amount) => db.query(`insert into forecast_ledger_entries(organization_id,scenario_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount,history,planning_form_id)
      values($1,$2,2027,$3,'31101001',$4,$5,$6,'teste',$7)`, [ids.org, sid, month, cc, cc ? '101' : null, amount, form]);
    await db.query('delete from forecast_ledger_entries where scenario_id=$1', [sid]);
    await put(f08, null, 3, -10); await put(f08, null, 4, -10); await put(f08, ids.cc, 3, 5); await put(f08, ids.cc, 4, 7);
    await put(fatForm, null, 3, -99); await put(cpxForm, ids.cc, 4, 8);
    const removed = (await db.query('select planning_ledger_resolve_overlaps($1) n', [sid])).rows[0].n;
    assert.equal(removed, 2, 'apaga as linhas do 08/04 com a mesma conta, centro de custo e mês do FAT/CPX');
    const left = (await db.query("select cost_center_number,reference_month,amount::float8 a from forecast_ledger_entries where planning_form_id=$1 order by 2,1 nulls first", [f08])).rows;
    assert.deepEqual(left.map(r => [r.cost_center_number, r.reference_month]), [['101', 3], [null, 4]], 'centro de custo diferente convive; igual perde');
    // integrar o 08: a linha sem centro de custo do mês 1 perde para o FAT; a com centro de custo permanece
    await db.query('delete from forecast_ledger_entries where scenario_id=$1', [sid]);
    await put(fatForm, null, 1, -99);
    await T.as(ids.admin);
    await write('project', sid, { form_id: f08 });
    await db.exec('reset role');
    const after = (await db.query("select cost_center_number,amount::float8 a from forecast_ledger_entries where scenario_id=$1 and planning_form_id=$2 and reference_month=1", [sid, f08])).rows;
    assert.deepEqual(after.map(r => [r.cost_center_number, r.a]), [['101', 70]], 'integrar o 08 respeita o FAT');
    await T.as(ids.admin);
    await db.query("select planning_integrate_all($1,$2,$3)", [ids.org, sid, f08]);
    await db.exec('reset role');
    assert.equal((await db.query("select count(*)::int n from forecast_ledger_entries where scenario_id=$1 and planning_form_id=$2 and reference_month=1 and cost_center_id is null", [sid, f08])).rows[0].n, 0, 'integrar tudo também respeita o FAT');

    // ---- Task 4: importação dos formulários
    const aNoLine = await mkAccount('31203001');
    await db.query('delete from forecast_ledger_entries where scenario_id=$1', [sid]);
    const imp = async rows => (await db.query('select planning_import_entries($1,$2,$3::jsonb) r', [ids.org, f08, JSON.stringify(rows)])).rows[0].r;
    const r = (row, account, month, amount, cost_center = null) => ({ row, account, month, amount, cost_center });
    const msgs = async rows => (await imp(rows)).errors.map(e => e.message);
    await T.as(ids.writer);
    await assert.rejects(imp([r(2, '31101001', 1, '1')]), /Somente o administrador importa/);
    await T.as(ids.admin);
    assert.deepEqual(await msgs([r(3, '999', 1, '1')]), ['Linha 3: conta 999 não cadastrada']);
    assert.deepEqual(await msgs([r(3, '31203001', 1, '1')]), ['Linha 3: a conta 31203001 não é uma linha digitável deste formulário']);
    assert.deepEqual(await msgs([r(3, '31101001', 1, '1', '9999')]), ['Linha 3: centro de custo 9999 não cadastrado']);
    assert.deepEqual(await msgs([r(3, '31101001', 13, '1')]), ['Linha 3: o mês 13 não recebe lançamento deste formulário']);
    assert.deepEqual(await msgs([r(3, '31101001', 1, 'abc')]), ['Linha 3: valor inválido']);
    assert.deepEqual(await msgs([r(3, '31101001', 1, '')]), ['Linha 3: valor obrigatório']);
    assert.deepEqual(await msgs([r(2, '31101001', 4, '1'), r(3, '31101001', 4, '2')]),
      ['Linha 2: conta 31101001, sem centro de custo e mês 4 aparecem mais de uma vez no arquivo', 'Linha 3: conta 31101001, sem centro de custo e mês 4 aparecem mais de uma vez no arquivo']);
    assert.equal((await msgs([r(3, '999', 1, 'x', '9999'), r(4, '31203001', 20, '1')])).length, 5, 'junta os erros de todas as linhas (3 na linha 3 e 2 na linha 4)');
    assert.deepEqual(await msgs(Array.from({ length: 5001 }, (_, i) => r(i + 2, '31101001', 1, '1', String(i)))), ['O arquivo passa do limite de 5.000 linhas']);
    await db.exec('reset role');
    await db.exec(`select set_config('vecton.planning_write','${sid}',false)`);
    await put(fatForm, null, 5, -1); await put(cpxForm, ids.cc, 6, 1);
    await T.as(ids.admin);
    assert.deepEqual(await msgs([r(2, '31101001', 5, '1')]), ['Linha 2: o FAT prevalece sobre esta chave (conta 31101001, mês 5)']);
    assert.deepEqual(await msgs([r(2, '31101001', 6, '1', '101')]), ['Linha 2: o CPX prevalece sobre esta chave (conta 31101001, mês 6)']);
    assert.equal((await imp([r(2, '31101001', 6, '1')])).ok, true, 'centro de custo diferente do CPX não conflita');
    await db.exec('reset role'); await db.query('delete from forecast_ledger_entries where scenario_id=$1', [sid]);
    await T.as(ids.admin);
    const before = (await db.query('select reference_month m,cost_center_id c,amount::float8 a,row_version v from planning_entries where form_id=$1 order by 1,2 nulls first', [f08])).rows;
    const ok = await imp([r(2, '31101001', 1, '-700'), r(3, '31101001', 2, '5', '101')]);
    assert.deepEqual([ok.ok, ok.replaced, ok.inserted], [true, 1, 1], 'uma chave substituída e uma incluída');
    const afterRows = (await db.query('select reference_month m,cost_center_id c,amount::float8 a,row_version v from planning_entries where form_id=$1 order by 1,2 nulls first', [f08])).rows;
    assert.equal(afterRows.find(x => x.m === 1 && x.c === null).a, -700);
    assert(afterRows.find(x => x.m === 1 && x.c === null).v > before.find(x => x.m === 1 && x.c === null).v, 'substituir sobe a versão');
    assert.equal(afterRows.find(x => x.m === 1 && x.c === ids.cc).a, 70, 'o que o arquivo não cita permanece');
    assert.equal(afterRows.find(x => x.m === 2 && x.c === ids.cc).a, 5);
    // ruling: o bloqueio do cenário não vale para administrador (migration 320); a importação segue o mesmo critério
    // ---- Task 5: alertas de conflito (digitação e integração)
    await db.exec('reset role'); await db.exec(`select set_config('vecton.planning_write','${sid}',false)`);
    await put(fatForm, null, 5, -1);
    await T.as(ids.admin);
    const cells = [{ line_id: l08, cost_center_id: null, month: 5, amount: '10' }, { line_id: l08, cost_center_id: ids.cc, month: 5, amount: '10' }];
    const kc = (await db.query('select planning_key_conflicts($1,$2,$3::jsonb) r', [ids.org, f08, JSON.stringify(cells)])).rows[0].r;
    assert.deepEqual(kc, [{ account_number: '31101001', month: 5, cost_center_number: null, source: 'FAT' }], 'só a chave sem centro de custo colide com o FAT');
    await assert.rejects(save(f08, [{ line_id: l08, cost_center_id: null, month: 5, amount: '10', version: 0 }]), /alimentado pelo FAT/, 'sem centro de custo: bloqueia');
    assert.equal((await save(f08, [{ line_id: l08, cost_center_id: ids.cc, month: 5, amount: '10', version: 0 }])).ok !== false, true, 'com centro de custo a chave é outra: não colide com o FAT');
    assert.equal((await save(f08, [{ line_id: l08, cost_center_id: null, month: 5, amount: '0', version: 0 }])).ok !== false, true, 'zerar a célula em conflito é permitido');
    assert.equal((await imp([r(2, '31101001', 5, '0')])).ok, true, 'importar zero numa chave do FAT é permitido (limpa o valor)');
    const capOv = (await db.query('select * from planning_capex_overlap($1,$2)', [ids.org, cpxForm])).rows;
    assert.deepEqual(capOv, [], 'sem investimentos, a integração do CPX não tem sobreposição');
    const fatOv = (await db.query('select * from planning_fat_overlap($1,$2)', [ids.org, fatForm])).rows;
    assert.deepEqual(fatOv, [], 'o FAT só avisa sobre o que o 08 tem sem centro de custo e com valor');

    // ---- Task 8: importação do FAT (template da carga de planejado vendas)
    await db.exec('reset role');
    const code = async d => (await db.query('select codigo from comercial_produtos where descricao=$1', [d])).rows[0].codigo;
    const [cING100a, cING100b, cPEC1, cPEC2] = [await code('ING100a'), await code('ING100b'), await code('PEC1'), await code('PEC2')];
    const tipoMaq = k['tipo:Máquinas'];
    await db.query("insert into comercial_produtos values(gen_random_uuid(),$1,'777','Sem modelo',null,$2,null)", [ids.org, tipoMaq]);
    await db.query("insert into comercial_territorios values(gen_random_uuid(),$1,'RJ')", [ids.org]);
    const fimp = async rows => (await db.query('select planning_fat_import($1,$2,$3::jsonb) r', [ids.org, fatForm, JSON.stringify(rows)])).rows[0].r;
    const fr = (row, cod_produto, month, territorio, quantidade, valor = null, mc1 = null) => ({ row, cod_produto, month, territorio, quantidade, valor, mc1 });
    const fmsgs = async rows => (await fimp(rows)).errors.map(e => e.message);
    await T.as(ids.writer);
    await assert.rejects(fimp([fr(2, cING100a, 1, 'BA', '1')]), /Somente o administrador importa/);
    await T.as(ids.admin);
    assert.deepEqual(await fmsgs([fr(2, '9999', 1, 'BA', '1')]), ['Linha 2: produto 9999 não cadastrado']);
    assert.deepEqual(await fmsgs([fr(2, '777', 1, 'BA', '1')]), ['Linha 2: o produto 777 não pertence a nenhum modelo do FAT']);
    assert.deepEqual(await fmsgs([fr(2, cING100a, 1, 'ZZ', '1')]), ['Linha 2: território ZZ não cadastrado']);
    assert.deepEqual(await fmsgs([fr(2, cING100a, 1, 'RJ', '1')]), ['Linha 2: o território RJ não é uma região do FAT']);
    assert.deepEqual(await fmsgs([fr(2, cING100a, 1, '', '1')]), ['Linha 2: território obrigatório']);
    assert.deepEqual(await fmsgs([fr(2, cING100a, '', 'BA', '1')]), ['Linha 2: mês obrigatório']);
    assert.deepEqual(await fmsgs([fr(2, cING100a, 13, 'BA', '1')]), ['Linha 2: o mês 13 não recebe lançamento do FAT']);
    assert.deepEqual(await fmsgs([fr(2, cING100a, 1, 'BA', '')]), ['Linha 2: volume (quantidade) obrigatório']);
    assert.deepEqual(await fmsgs([fr(2, cING100a, 1, 'BA', 'abc')]), ['Linha 2: quantidade inválida']);
    assert.deepEqual(await fmsgs([fr(2, cPEC1, 1, '', null, null)]), ['Linha 2: valor obrigatório para Peças']);
    const first = await fimp([fr(2, cING100a, 1, 'BA', '6', '299507.7', '0.3'), fr(3, cING100b, 1, 'BA', '2'), fr(4, cPEC1, 1, '', null, '1000'), fr(5, cPEC2, 1, null, null, '500')]);
    assert.deepEqual([first.ok, first.replaced, first.inserted], [true, 0, 2], 'modelo soma os códigos; Peças soma o valor');
    const vols = async () => { await db.exec('reset role'); const r = Object.fromEntries((await db.query('select region_key,model_key,reference_month m,amount::float8 a,row_version v from planning_fat_volumes where form_id=$1', [fatForm])).rows.map(r => [r.region_key + '/' + r.model_key + '/' + r.m, [r.a, r.v]])); await T.as(ids.admin); return r; };
    const v1 = await vols();
    assert.deepEqual(v1[k['territorio:BA'] + '/INGRAIN100/1'], [8, 1]);
    assert.deepEqual(v1['PECAS/PECAS/1'], [1500, 1]);
    const second = await fimp([fr(2, cING100a, 1, 'BA', '5')]);
    assert.deepEqual([second.ok, second.replaced, second.inserted], [true, 1, 0], 'chave existente é substituída');
    const v2 = await vols();
    assert.deepEqual(v2[k['territorio:BA'] + '/INGRAIN100/1'], [5, 2], 'substituir sobe a versão');
    assert.deepEqual(v2['PECAS/PECAS/1'], [1500, 1], 'o que o arquivo não cita permanece');

    // ---- Task 9: carga de planejado vendas (cenário sem formulário): todos os campos obrigatórios
    await db.exec('reset role');
    const BA = k['territorio:BA'];
    const base = { month: 1, prod: 'ING100a', terr: BA, qty: 2, valor: 1000 };
    await assert.rejects(T.planned([{ ...base, valor: null }], { scenario: null }), /Valor obrigatorio/, 'valor obrigatório');
    await assert.rejects(T.planned([{ ...base, terr: null }], { scenario: null }), /Territorio obrigatorio/, 'território obrigatório para máquinas');
    await assert.rejects(T.planned([{ ...base, prod: 'T170', terr: null }], { scenario: null }), /Territorio obrigatorio/, 'e para Transgrain');
    await assert.rejects(T.planned([{ ...base, prod: 'SKATE', terr: null }], { scenario: null }), /Territorio obrigatorio/, 'e para Acessórios');
    await assert.rejects(T.planned([{ ...base, month: null }], { scenario: null }), /Mes obrigatorio/, 'mês obrigatório');
    await assert.rejects(T.planned([{ ...base, qty: null }], { scenario: null }), /Volume/, 'quantidade obrigatória');
    await T.planned([base, { month: 1, prod: 'PEC1', terr: null, qty: null, valor: 500 }], { scenario: null });
    assert.equal((await db.query("select count(*)::int n from comercial_planejado_ledger_entries where scenario_id is null and reference_month=1")).rows[0].n >= 2, true, 'Peças sem território e sem quantidade é aceita');

    // grants: nenhuma função nova fica executável por anon/public
    await db.exec('reset role; grant usage on schema public to anon;');
    for (const [fn, args] of [['planning_import_entries', [ids.org, f08, '[]']], ['planning_fat_import', [ids.org, fatForm, '[]']], ['planning_key_conflicts', [ids.org, f08, '[]']], ['planning_capex_overlap', [ids.org, cpxForm]], ['planning_integrate_all', [ids.org, sid, f08]]]) {
      await db.exec('reset role; set role anon;');
      await assert.rejects(db.query(`select ${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args), /permission denied/, fn + ' não é executável por anon');
    }
    await db.exec("reset role; set role anon; select set_config('test.user','',false);");
    await assert.rejects(db.query("select planning_write($1,'save_entries',$2,$3::jsonb)", [ids.org, sid, JSON.stringify({ form_id: f08, cells: [{ line_id: l08, cost_center_id: null, month: 5, amount: '10', version: 0 }] })]), /permission denied/, 'planning_write não é executável por anon');
    await db.exec('reset role');

    console.log('Planning import SQL passed.');
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exit(1); });
