const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.PLANNING_PGLITE_TEST_LIB || '../artifacts/bp-test-deps/node_modules/@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  try {
    const org='0070482f-c2d5-4766-b20a-0549a7984e94', admin='11111111-1111-4111-8111-111111111111', manager='22222222-2222-4222-8222-222222222222';
    await db.exec(`create role authenticated;create role anon;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
      create table organizations(id uuid primary key,name text);
      create table user_profiles(organization_id uuid,user_id uuid,access_role text,is_active boolean,additional_access_roles text[] default '{}');
      create function is_org_member(o uuid) returns boolean language sql stable security definer as $$select exists(select 1 from user_profiles where organization_id=o and user_id=auth.uid() and is_active)$$;
      insert into organizations values('${org}','Marcher Brasil');
      insert into user_profiles values('${org}','${admin}','admin',true,'{}'),('${org}','${manager}','manager',true,'{}');
      select set_config('test.user','${admin}',false);grant usage on schema public,auth to authenticated;`);
    const schema=fs.readFileSync('supabase/301_bp_account_plan.sql','utf8'), seed=fs.readFileSync('supabase/302_seed_bp_plan_marcher.sql','utf8');
    await db.exec(schema);await db.exec(seed);await db.exec(schema);await db.exec(seed);
    const rows=(await db.query('select * from bp_plan_nodes order by sort_order')).rows;
    assert.equal(rows.length,173);
    assert.equal(rows.filter(n=>n.node_class==='Sintetica').length,59);
    assert.equal(rows.filter(n=>n.node_class==='Analitica').length,114);
    assert.equal(new Set(rows.map(n=>n.group_key).filter(Boolean)).size,26);
    assert.equal(rows.filter(n=>n.node_class==='Sintetica'&&n.group_key).length,0);
    assert.equal(rows.filter(n=>n.node_class==='Analitica'&&!n.group_key).length,0);
    assert.equal(rows.find(n=>n.account_code==='1.1.1.02.002').group_key,'Caixa e equivalente de Caixa');
    assert.equal(rows.find(n=>n.account_code==='2.3.2.03.003').group_key,'Resultado do Exercício');
    const byId=new Map(rows.map(n=>[n.id,n]));
    rows.filter(n=>n.parent_id).forEach(n=>assert.equal(n.account_code.startsWith(byId.get(n.parent_id).account_code+'.'),true));
    if(fs.existsSync('artifacts/bp/source-plan.json')) {
      const source=JSON.parse(fs.readFileSync('artifacts/bp/source-plan.json','utf8'));
      assert.deepEqual(rows.map(n=>({code:n.account_code,name:n.name,type:n.node_class==='Analitica'?'ANALITICA':'SINTETICA',group_key:n.group_key||'',parent_code:byId.get(n.parent_id)?.account_code||null})),source);
    }
    assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='public' and tablename='bp_import_batches'")).rows[0].n,0);
    await db.exec('set role authenticated');
    await assert.rejects(db.query("update bp_plan_nodes set group_key='inválido' where account_code='1'"),/Somente contas analíticas/);
    await assert.rejects(db.query("update bp_plan_nodes set group_key=null where account_code='1.1.1.02.002'"),/chave agrupadora/);
    await assert.rejects(db.query("update bp_plan_nodes set parent_id=(select id from bp_plan_nodes where account_code='2') where account_code='1.1.1.02.002'"),/hierarquia/);
    await db.exec(`reset role;select set_config('test.user','${manager}',false);set role authenticated;`);
    assert.equal((await db.query('select count(*)::int n from bp_plan_nodes')).rows[0].n,173);
    assert.equal((await db.query("update bp_plan_nodes set name='não autorizado' returning id")).rows.length,0);
    await db.exec('reset role;set role anon;');
    await assert.rejects(db.query('select * from bp_plan_nodes'),/permission denied/);
    console.log('BP plan config: 173 exact source accounts, 114 analytic keys, 26 groups, hierarchy, idempotence and RLS OK');
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
