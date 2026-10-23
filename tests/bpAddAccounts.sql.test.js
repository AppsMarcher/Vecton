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

    const before=(await db.query('select id,account_code,name,node_class,parent_id,group_key,active from bp_plan_nodes order by id')).rows;
    const migration=fs.readFileSync('supabase/306_bp_add_accounts_marcher.sql','utf8');await db.exec(migration);await db.exec(migration);
    const next=fs.readFileSync('supabase/307_bp_add_accounts_marcher.sql','utf8');await db.exec(next);await db.exec(next);
    const after=(await db.query('select * from bp_plan_nodes')).rows;
    assert.equal(after.length,192);assert.equal(after.filter(n=>n.node_class==='Analitica').length,132);
    for(const node of before)assert.deepEqual(Object.fromEntries(Object.keys(node).map(k=>[k,after.find(n=>n.id===node.id)[k]])),node);
    const account=code=>after.find(n=>n.account_code===code);
    assert.equal(account('1.1.5.03.00009').group_key,'Estoques');
    assert.equal(account('2.1.6.01.00008').group_key,'Estoques de Terceiros');
    assert.equal(account('2.1.6.02.010').parent_id,account('2.1.6.02').id);
    assert.equal(account('2.1.6.02').node_class,'Sintetica');assert.equal(account('2.1.6.02').group_key,null);
    assert.equal(account('1.1.2.01.00002').group_key,'Contas a Receber - Clientes');
    assert.equal(account('1.1.1.03.012').group_key,'Caixa e equivalente de Caixa');
    assert.equal(account('2.1.4.01.016').group_key,'Impostos e Contribuições');
    const affected=new Set(after.filter(n=>!before.some(b=>b.id===n.id)).map(n=>n.parent_id));
    for(const parent of affected){const actual=after.filter(n=>n.parent_id===parent).sort((a,b)=>a.sort_order-b.sort_order).map(n=>n.account_code);const expected=(await db.query("select account_code from bp_plan_nodes where parent_id=$1 order by string_to_array(account_code,'.')::numeric[],account_code",[parent])).rows.map(n=>n.account_code);assert.deepEqual(actual,expected);}
    console.log('BP new accounts: 18 analytic accounts, one synthetic parent, numeric order, original configuration preserved and idempotence OK');
  }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
