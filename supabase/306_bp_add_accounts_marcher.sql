begin;
-- Contas autorizadas na revisão de 23/10/2026. Não altera cargas de saldos.
lock table public.bp_plan_nodes in share row exclusive mode;
do $$
declare
 org uuid := '0070482f-c2d5-4766-b20a-0549a7984e94';
 item record; parent public.bp_plan_nodes; existing public.bp_plan_nodes;
 affected_parents uuid[] := '{}';
begin
 perform pg_advisory_xact_lock(hashtextextended(org::text,300));
 if not exists(select 1 from public.organizations where id=org) then raise exception 'Organização Marcher não encontrada'; end if;
 -- A conta de processos judiciais precisa desta sintética, ausente no plano inicial.
 select * into parent from public.bp_plan_nodes where organization_id=org and account_code='2.1.6';
 if not found or parent.node_class<>'Sintetica' or not parent.active then raise exception 'Grupo 2.1.6 indisponível'; end if;
 insert into public.bp_plan_nodes(organization_id,account_code,name,node_class,parent_id,sort_order)
 values(org,'2.1.6.02','CONTAS A PAGAR','Sintetica',parent.id,0)
 on conflict(organization_id,account_code) do nothing;
 affected_parents:=array_append(affected_parents,parent.id);
 select * into existing from public.bp_plan_nodes where organization_id=org and account_code='2.1.6.02';
 if existing.node_class<>'Sintetica' or not existing.active or existing.parent_id is distinct from parent.id
 then raise exception 'Grupo 2.1.6.02 existe com configuração diferente'; end if;
 for item in select * from (values
   ('1.2.4.01.006','EQUIP. PROCES. DE DADOS','Imobilizado'),
   ('1.2.4.01.008','INST EM PREDIO','Imobilizado'),
   ('1.2.4.07.00005','(-) DEP. EQUIP. PROCES. DE DADOS','Imobilizado'),
   ('1.2.4.07.00006','(-) DEP. INST. EM PREDIO','Imobilizado'),
   ('1.2.5.01.003','DESENVOLVIMENTO WEB SITE','Intangível'),
   ('1.2.5.01.006','P&D_MAQUINAS','Intangível'),
   ('2.1.6.01.00007','(-)ESTOQUE REM.CONSIGNACAO','Estoques de Terceiros'),
   ('2.1.6.02.010','PROCESSOS JUDICIAIS A PAGAR','Outros Contas a Pagar'),
   ('1.1.5.03.00009','ESTOQUE REM.DE TERCEIROS','Estoques'),
   ('2.1.6.01.00008','(-)ESTOQUE DE REM.TERCEIROS','Estoques de Terceiros')
 ) v(code,name,group_key) loop
  -- Mesma regra do cadastro inicial: ancestral sintético cadastrado mais próximo.
  select * into parent from public.bp_plan_nodes where organization_id=org and node_class='Sintetica' and active
   and left(item.code,length(account_code)+1)=account_code||'.' order by length(account_code) desc limit 1;
  if not found then raise exception 'Sem grupo sintético para %',item.code; end if;
  select * into existing from public.bp_plan_nodes where organization_id=org and account_code=item.code;
  if found then
   if existing.node_class<>'Analitica' or not existing.active or existing.parent_id is distinct from parent.id
    or existing.group_key is distinct from item.group_key then raise exception 'Conta % já existe com configuração diferente',item.code; end if;
  else
   insert into public.bp_plan_nodes(organization_id,account_code,name,node_class,parent_id,group_key,source_name,sort_order)
   values(org,item.code,item.name,'Analitica',parent.id,item.group_key,item.code,0);
  end if;
  affected_parents:=array_append(affected_parents,parent.id);
 end loop;
 -- Reordena apenas os grupos afetados, comparando cada segmento como número.
 with ordered as (
  select id,(row_number() over(partition by parent_id order by string_to_array(account_code,'.')::numeric[],account_code)*10)::integer as new_order
  from public.bp_plan_nodes where organization_id=org and parent_id=any(affected_parents)
 ) update public.bp_plan_nodes n set sort_order=o.new_order from ordered o where n.id=o.id and n.sort_order<>o.new_order;
end $$;
commit;
