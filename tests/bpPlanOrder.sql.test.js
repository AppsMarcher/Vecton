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
    await db.exec(fs.readFileSync('supabase/301_bp_account_plan.sql','utf8'));await db.exec(fs.readFileSync('supabase/302_seed_bp_plan_marcher.sql','utf8'));
    // Empates de hoje: todas as irmãs de um grupo na mesma posição.
    const parent=(await db.query(`select parent_id from bp_plan_nodes where parent_id is not null group by parent_id having count(*)>=4 order by count(*) desc limit 1`)).rows[0].parent_id;
    await db.exec(`update bp_plan_nodes set sort_order=4 where parent_id='${parent}'`);
    const migration=fs.readFileSync('supabase/336_bp_plan_sequential_order.sql','utf8');
    await db.exec(migration);await db.exec(migration); // reexecutável
    const group=async p=>(await db.query(`select id,account_code,sort_order from bp_plan_nodes where parent_id ${p?`='${p}'`:'is null'} order by sort_order`)).rows;
    const sequential=rows=>rows.every((r,i)=>r.sort_order===i+1);
    const all=async()=>{const bad=(await db.query(`select parent_id from bp_plan_nodes group by parent_id having count(*)<>count(distinct sort_order) or min(sort_order)<>1 or max(sort_order)<>count(*)`)).rows;return bad.length;};
    assert.equal(await all(),0,'migration deixa todos os grupos em 1..n');
    const base=await group(parent), codes=base.map(r=>r.account_code), n=base.length;
    assert.deepEqual(codes,[...codes].sort((a,b)=>a.localeCompare(b,'en',{numeric:true})),'empates antigos seguem o código contábil');
    const parentCode=(await db.query(`select account_code from bp_plan_nodes where id='${parent}'`)).rows[0].account_code;
    // Inserir no meio: a nova conta fica na posição pedida e as seguintes avançam.
    await db.exec(`insert into bp_plan_nodes(organization_id,account_code,name,node_class,parent_id,group_key,sort_order) values('${org}','${parentCode}.9999','NOVA','Analitica','${parent}','Teste',2)`);
    let rows=await group(parent);
    assert.equal(rows.length,n+1);assert.ok(sequential(rows));assert.equal(rows[1].account_code,`${parentCode}.9999`);
    assert.deepEqual(rows.filter(r=>r.account_code!==`${parentCode}.9999`).map(r=>r.account_code),codes,'as demais mantêm a ordem relativa');
    // Mover para baixo (da 1ª para a 3ª) e para cima (da última para a 1ª).
    const first=rows[0].id;
    await db.exec(`update bp_plan_nodes set sort_order=3 where id='${first}'`);
    rows=await group(parent);assert.ok(sequential(rows));assert.equal(rows[2].id,first);
    const last=rows[rows.length-1].id;
    await db.exec(`update bp_plan_nodes set sort_order=1 where id='${last}'`);
    rows=await group(parent);assert.ok(sequential(rows));assert.equal(rows[0].id,last);
    // Posição além do fim é compactada; alterar outros campos não mexe na ordem.
    await db.exec(`update bp_plan_nodes set sort_order=500 where id='${last}'`);
    rows=await group(parent);assert.ok(sequential(rows));assert.equal(rows[rows.length-1].id,last);
    const snapshot=JSON.stringify(rows.map(r=>[r.id,r.sort_order]));
    await db.exec(`update bp_plan_nodes set name='RENOMEADA' where id='${last}'`);
    assert.equal(JSON.stringify((await group(parent)).map(r=>[r.id,r.sort_order])),snapshot);
    // Remover fecha o buraco.
    await db.exec(`delete from bp_plan_nodes where id='${rows[1].id}'`);
    rows=await group(parent);assert.equal(rows.length,n);assert.ok(sequential(rows));
    // Trocar de conta pai compacta os dois grupos.
    const other=(await db.query(`select id,account_code from bp_plan_nodes where node_class='Sintetica' and id<>'${parent}' and account_code like '${parentCode.split('.').slice(0,-1).join('.')}.%' and parent_id=(select parent_id from bp_plan_nodes where id='${parent}') limit 1`)).rows[0];
    if(other){
      const moved=rows[0];
      if(moved.account_code.startsWith(other.account_code+'.')){
        await db.exec(`update bp_plan_nodes set parent_id='${other.id}',sort_order=1 where id='${moved.id}'`);
        assert.ok(sequential(await group(parent)));assert.ok(sequential(await group(other.id)));
      }
    }
    assert.equal(await all(),0,'nenhum grupo com repetição ou buraco no fim');
    console.log('BP plan order: sequential 1..n, middle insert, move up/down, delete, tie cleanup and idempotence OK');
  }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
