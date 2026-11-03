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
    // As contas que o usuário criou à mão na posição 4 e 5, empatando com BANCOS.
    await db.exec(`insert into bp_plan_nodes(organization_id,account_code,name,node_class,parent_id,sort_order) values('${org}','1.1.1.01','CAIXA','Sintetica',(select id from bp_plan_nodes where account_code='1.1.1'),4)`);
    await db.exec(`insert into bp_plan_nodes(organization_id,account_code,name,node_class,parent_id,group_key,sort_order) values('${org}','1.1.1.01.003','DEPOSITOS NAO IDENTIFICADOS','Analitica',(select id from bp_plan_nodes where account_code='1.1.1.01'),'Caixa e equivalente de Caixa',5)`);
    // Estado de produção antes da 337: empates por grupo (336 aplicada, depois bagunçada à mão).
    await db.exec(`update bp_plan_nodes set sort_order=4 where parent_id=(select id from bp_plan_nodes where account_code='1.1.1')`);
    await db.exec(fs.readFileSync('supabase/336_bp_plan_sequential_order.sql','utf8'));
    const migration=fs.readFileSync('supabase/337_bp_plan_global_order.sql','utf8');
    await db.exec(migration);await db.exec(migration); // reexecutável

    const rows=async()=>(await db.query('select id,parent_id,account_code,node_class,sort_order from bp_plan_nodes')).rows;
    // O plano inteiro é uma sequência 1..N igual à ordem da árvore (cada conta seguida do seu bloco de filhas).
    const check=async()=>{
      const all=await rows(),kids=new Map();
      all.forEach(r=>{const k=kids.get(r.parent_id)||[];k.push(r);kids.set(r.parent_id,k);});
      const walk=(parent,out)=>{(kids.get(parent)||[]).sort((a,b)=>a.sort_order-b.sort_order).forEach(r=>{out.push(r);walk(r.id,out);});return out;};
      const flat=walk(null,[]);
      assert.equal(flat.length,all.length,'nenhuma conta fora da árvore');
      flat.forEach((r,i)=>assert.equal(r.sort_order,i+1,`posição de ${r.account_code}`));
      return flat;
    };
    let flat=await check();
    const total=flat.length;
    assert.equal(flat[0].account_code,'1');
    const pos=code=>flat.find(r=>r.account_code===code).sort_order;
    assert.ok(pos('1.1.1.01')<pos('1.1.1.01.003')&&pos('1.1.1.01.003')<pos('1.1.1.02'),'CAIXA, sua filha e depois BANCOS');

    // Inserir no meio: a nova conta ocupa a posição pedida e todas as seguintes avançam.
    const leaf=flat.find(r=>r.account_code==='1.1.1.02.002'),parent=flat.find(r=>r.id===leaf.parent_id);
    const before=new Map(flat.map(r=>[r.id,r.sort_order]));
    await db.exec(`insert into bp_plan_nodes(organization_id,account_code,name,node_class,parent_id,group_key,sort_order) values('${org}','${parent.account_code}.9999','NOVA','Analitica','${parent.id}','Teste',${leaf.sort_order})`);
    flat=await check();assert.equal(flat.length,total+1);
    assert.equal(flat.find(r=>r.account_code===`${parent.account_code}.9999`).sort_order,leaf.sort_order);
    flat.filter(r=>before.has(r.id)).forEach(r=>assert.equal(r.sort_order,before.get(r.id)+(before.get(r.id)>=leaf.sort_order?1:0)));
    // Número que cai no bloco de outra conta vira a posição válida mais próxima, dentro da conta pai.
    await db.exec(`insert into bp_plan_nodes(organization_id,account_code,name,node_class,parent_id,group_key,sort_order) values('${org}','${parent.account_code}.9998','FORA','Analitica','${parent.id}','Teste',${total+500})`);
    flat=await check();
    const fora=flat.find(r=>r.account_code===`${parent.account_code}.9998`),sibs=flat.filter(r=>r.parent_id===parent.id);
    assert.equal(fora.sort_order,Math.max(...sibs.map(r=>r.sort_order)),'além do fim: última filha da conta pai');
    // Mover para baixo e para cima, também uma conta com filhas (leva o bloco junto).
    const caixa=flat.find(r=>r.account_code==='1.1.1.01'),bancos=flat.find(r=>r.account_code==='1.1.1.02');
    await db.exec(`update bp_plan_nodes set sort_order=${bancos.sort_order} where id='${caixa.id}'`);
    flat=await check();
    assert.ok(flat.find(r=>r.account_code==='1.1.1.01').sort_order>flat.find(r=>r.account_code==='1.1.1.02').sort_order,'CAIXA desceu para depois de BANCOS');
    assert.equal(flat.find(r=>r.account_code==='1.1.1.01.003').sort_order,flat.find(r=>r.account_code==='1.1.1.01').sort_order+1,'a filha acompanha a conta pai');
    await db.exec(`update bp_plan_nodes set sort_order=${flat.find(r=>r.account_code==='1.1.1.02').sort_order} where id='${caixa.id}'`);
    flat=await check();
    assert.ok(flat.find(r=>r.account_code==='1.1.1.01').sort_order<flat.find(r=>r.account_code==='1.1.1.02').sort_order,'CAIXA subiu para antes de BANCOS');
    // Alterar outros campos não mexe na ordem; remover fecha o buraco; trocar de conta pai mantém tudo sequencial.
    const snap=JSON.stringify(flat.map(r=>[r.id,r.sort_order]));
    await db.exec(`update bp_plan_nodes set name='RENOMEADA' where id='${caixa.id}'`);
    assert.equal(JSON.stringify((await check()).map(r=>[r.id,r.sort_order])),snap);
    await db.exec(`delete from bp_plan_nodes where account_code='${parent.account_code}.9999'`);
    flat=await check();assert.equal(flat.length,total+1);
    console.log('BP plan order: global 1..N in tree order, middle insert, clamp to parent block, move with subtree, delete, tie cleanup and idempotence OK');
  }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
