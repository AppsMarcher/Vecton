const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.PLANNING_PGLITE_TEST_LIB || '../artifacts/bp-test-deps/node_modules/@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  try {
    const org='0070482f-c2d5-4766-b20a-0549a7984e94', admin='11111111-1111-4111-8111-111111111111';
    await db.exec(`create role authenticated;create role anon;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
      create table organizations(id uuid primary key,name text);
      create table user_profiles(organization_id uuid,user_id uuid,access_role text,is_active boolean,additional_access_roles text[] default '{}');
      create function is_org_member(o uuid) returns boolean language sql stable security definer as $$select exists(select 1 from user_profiles where organization_id=o and user_id=auth.uid() and is_active)$$;
      insert into organizations values('${org}','Marcher Brasil');
      insert into user_profiles values('${org}','${admin}','admin',true,'{}');
      select set_config('test.user','${admin}',false);grant usage on schema public,auth to authenticated;`);
    for (const f of ['301_bp_account_plan','302_seed_bp_plan_marcher','306_bp_add_accounts_marcher','307_bp_add_accounts_marcher','337_bp_plan_global_order']) await db.exec(fs.readFileSync(`supabase/${f}.sql`,'utf8'));
    const mig=fs.readFileSync('supabase/339_bp_add_accounts_carga_out2026.sql','utf8');
    await db.exec(mig);await db.exec(mig);
    const nodes=(await db.query('select * from bp_plan_nodes')).rows, by=c=>nodes.find(n=>n.account_code===c);
    const exp={'1.1.3.08.010':['Analitica','Impostos a Recuperar','1.1.3.08'],
      '1.1.5.01.00001.002':['Sintetica',null,'1.1.5.01.00001'],
      '1.1.5.01.00001.002.006':['Analitica','Estoques','1.1.5.01.00001.002'],
      '2.1.4.01.009':['Analitica','Impostos e Contribuições','2.1.4.01'],
      '2.1.4.01.010':['Analitica','Impostos e Contribuições','2.1.4.01'],
      '2.1.5.01':['Sintetica',null,'2.1.5'],
      '2.1.5.01.001':['Analitica','Obrigações Trabalhistas','2.1.5.01'],
      '2.1.6.02.004':['Analitica','Outros Contas a Pagar','2.1.6.02']};
    for(const [c,[cl,gk,p]] of Object.entries(exp)){const n=by(c);assert.ok(n,c);assert.equal(n.node_class,cl,c);assert.equal(n.group_key,gk,c);assert.equal(nodes.find(x=>x.id===n.parent_id).account_code,p,c);}
    assert.equal(nodes.filter(n=>n.group_key==='Obrigaçãoes Trabalhistas').length,0);
    assert.ok(nodes.filter(n=>n.group_key==='Obrigações Trabalhistas').length>=10);
    // ordem global: 1..N sem buracos e irmãs em ordem numérica
    const so=nodes.map(n=>n.sort_order).sort((a,b)=>a-b);assert.deepEqual(so,so.map((_,i)=>i+1));
    for(const p of new Set(nodes.map(n=>n.parent_id))){const s=nodes.filter(n=>n.parent_id===p).sort((a,b)=>a.sort_order-b.sort_order).map(n=>n.account_code.split('.').map(Number));
      for(let i=1;i<s.length;i++){const a=s[i-1],b=s[i];let k=0;while(k<a.length&&k<b.length&&a[k]===b[k])k++;assert.ok((a[k]??-1)<(b[k]??-1),`ordem ${a} / ${b}`);}}
    const ord=c=>by(c).sort_order;
    assert.ok(ord('2.1.5')<ord('2.1.5.01')&&ord('2.1.5.01.001')<ord('2.1.5.02'));
    console.log('339 OK: 8 contas, chaves, pais, ordem numérica, grafia corrigida, idempotente');
  }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
