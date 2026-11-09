begin;
-- Contas exigidas pela carga de Outubro/2026 (Protheus) e correção da grafia da chave "Obrigaçãoes Trabalhistas".
-- Sintéticas não têm chave agrupadora. Não altera cargas de saldos.
lock table public.bp_plan_nodes in share row exclusive mode;
do $$
declare
 org uuid := '0070482f-c2d5-4766-b20a-0549a7984e94';
 item record; parent public.bp_plan_nodes; existing public.bp_plan_nodes;
 affected_parents uuid[] := '{}';
begin
 perform pg_advisory_xact_lock(hashtextextended(org::text,300));
 if not exists(select 1 from public.organizations where id=org) then raise exception 'Organização Marcher não encontrada'; end if;

 -- Grafia correta da chave em todas as contas do grupo.
 update public.bp_plan_nodes set group_key='Obrigações Trabalhistas'
  where organization_id=org and group_key='Obrigaçãoes Trabalhistas';

 -- Ordem importa: as sintéticas entram antes das analíticas que ficam abaixo delas.
 for item in select * from (values
   ('1.1.5.01.00001.002','MERCADORIA PARA REVENDA','Sintetica',null),
   ('2.1.5.01','OBRIGACOES COM PESSOAL','Sintetica',null),
   ('1.1.3.08.010','INSS A COMPENSAR','Analitica','Impostos a Recuperar'),
   ('1.1.5.01.00001.002.006','MATERIAL DE EXPEDIENTE','Analitica','Estoques'),
   ('2.1.4.01.009','PIS A RECOLHER','Analitica','Impostos e Contribuições'),
   ('2.1.4.01.010','COFINS A RECOLHER','Analitica','Impostos e Contribuições'),
   ('2.1.5.01.001','SALARIOS E ORDENADOS A PAGAR','Analitica','Obrigações Trabalhistas'),
   ('2.1.6.02.004','OUTRAS CONTAS A PAGAR','Analitica','Outros Contas a Pagar')
 ) v(code,name,node_class,group_key) loop
  -- Mesma regra do cadastro inicial: ancestral sintético cadastrado mais próximo.
  select * into parent from public.bp_plan_nodes where organization_id=org and node_class='Sintetica' and active
   and left(item.code,length(account_code)+1)=account_code||'.' order by length(account_code) desc limit 1;
  if not found then raise exception 'Sem grupo sintético para %',item.code; end if;
  select * into existing from public.bp_plan_nodes where organization_id=org and account_code=item.code;
  if found then
   if existing.node_class<>item.node_class or not existing.active or existing.parent_id is distinct from parent.id
    or existing.group_key is distinct from item.group_key then raise exception 'Conta % já existe com configuração diferente',item.code; end if;
  else
   insert into public.bp_plan_nodes(organization_id,account_code,name,node_class,parent_id,group_key,source_name,sort_order)
   values(org,item.code,item.name,item.node_class,parent.id,item.group_key,
    case when item.node_class='Analitica' then item.code end,0);
  end if;
  affected_parents:=array_append(affected_parents,parent.id);
 end loop;

 -- Ordem numérica entre irmãs (cada segmento comparado como número), sem disparar a renumeração por linha;
 -- depois renumera o plano inteiro 1..N, como a 337.
 alter table public.bp_plan_nodes disable trigger bp_plan_resequence_update;
 with ordered as (
  select id,(row_number() over(partition by parent_id order by string_to_array(account_code,'.')::numeric[],account_code)*10)::integer as new_order
  from public.bp_plan_nodes where organization_id=org and parent_id=any(affected_parents)
 ) update public.bp_plan_nodes n set sort_order=o.new_order from ordered o where n.id=o.id and n.sort_order<>o.new_order;
 alter table public.bp_plan_nodes enable trigger bp_plan_resequence_update;
 perform public.bp_resequence_plan(org,null,false);
end $$;
notify pgrst,'reload schema';
commit;
