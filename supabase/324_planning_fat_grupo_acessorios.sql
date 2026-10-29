-- FAT: grupo Acessórios (abaixo do Transgrain) com 3 modelos fixos por código de produto.
--   · linha de negócio Grão (coordenação e acesso seguem a linha Grão: planning_fat_line_of já devolve 'Grão' para o grupo);
--   · conta de receita 31101006 (VENDA DE PEÇAS E ACESSÓRIOS), como Peças;
--   · linha de impostos própria 'ace', com os mesmos percentuais padrão de Peças.
-- O nome do modelo é só o nome (sem código), como nos demais itens.
begin;

alter table public.planning_fat_models drop constraint planning_fat_models_group_name_check;
alter table public.planning_fat_models add constraint planning_fat_models_group_name_check
 check(group_name in ('Grãos','Pecuária','Cargograin','Transgrain','Acessórios','Linhas complementares'));
alter table public.planning_fat_taxes drop constraint planning_fat_taxes_line_check;
alter table public.planning_fat_taxes add constraint planning_fat_taxes_line_check check(line in ('maq','tra','ace','pec'));

-- Modelos do cenário: um por nome reduzido de Máquinas, os 4 Transgrain, os 3 Acessórios e o modelo Peças.
create or replace function public.planning_fat_seed_models(p_org uuid,p_scenario uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare n integer;begin
 insert into public.planning_fat_models(organization_id,scenario_id,model_key,group_name,sort,fat_driven,product_ids)
 select p_org,p_scenario,x.model_key,x.group_name,
  row_number() over(partition by x.group_name order by x.ord,case when x.model_key like 'INGRAIN%' then 0 else 1 end,coalesce(nullif(regexp_replace(x.model_key,'[^0-9]','','g'),'')::integer,0),x.model_key),
  x.fat_driven,x.product_ids
 from (
  select btrim(p.nome_reduzido) model_key,
   case when btrim(p.nome_reduzido) ~* '^CARGOGRAIN' then 'Cargograin' when max(c.nome)='Pecuária' then 'Pecuária' else 'Grãos' end group_name,
   false fat_driven,array_agg(p.id order by p.codigo) product_ids,0 ord
  from public.comercial_produtos p join public.comercial_tipos t on t.id=p.tipo_id and t.nome='Máquinas'
  left join public.comercial_culturas c on c.id=p.cultura_id
  where p.organization_id=p_org and nullif(btrim(p.nome_reduzido),'') is not null group by btrim(p.nome_reduzido)
  union all
  select m.key,'Transgrain',false,array_agg(p.id order by p.codigo),0
  from (values ('04003306','TRANSGRAIN 170'),('08203065','TRANSGRAIN 215'),('09003310','TRANSGRAIN IN-65'),('09103075','TRANSGRAIN IN-90'),('09103100','TRANSGRAIN IN-90')) m(code,key)
  join public.comercial_produtos p on p.organization_id=p_org and p.codigo=m.code group by m.key
  union all
  select m.key,'Acessórios',false,array_agg(p.id order by p.codigo),min(m.ord)
  from (values ('0500001','CJ PROTECT SKATE',1),('0100000','SELADORA SILO BOLSA',2),('08103263','ENROLADOR DE BOLSA',3)) m(code,key,ord)
  join public.comercial_produtos p on p.organization_id=p_org and p.codigo=m.code group by m.key
  union all
  select 'PECAS','Linhas complementares',true,array_agg(p.id order by p.codigo),0
  from public.comercial_produtos p join public.comercial_tipos t on t.id=p.tipo_id and t.nome='Peças' where p.organization_id=p_org having count(*)>0
 ) x
 on conflict(scenario_id,model_key) do update set group_name=excluded.group_name,sort=excluded.sort,fat_driven=excluded.fat_driven,product_ids=excluded.product_ids;
 get diagnostics n=row_count;return n;
end $$;

-- Prepara o FAT de um cenário: formulário (rascunho), percentuais (herdados do cenário de origem ou padrão) e modelos.
create or replace function public.planning_fat_prepare(p_org uuid,p_scenario uuid,p_source uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare fid uuid;begin
 perform set_config('vecton.planning_write',p_scenario::text,true);
 select id into fid from public.planning_forms where scenario_id=p_scenario and form_type='fat';
 if fid is null then
   insert into public.planning_forms(organization_id,scenario_id,code,name,form_type) values(p_org,p_scenario,'FAT','Vendas · Projeção de volumes','fat') returning id into fid;
 end if;
 if p_source is not null and p_source<>p_scenario then
   insert into public.planning_fat_taxes(organization_id,scenario_id,line,ipi,icms,pis,cofins)
   select p_org,p_scenario,line,ipi,icms,pis,cofins from public.planning_fat_taxes where scenario_id=p_source and organization_id=p_org on conflict(scenario_id,line) do nothing;
 end if;
 insert into public.planning_fat_taxes(organization_id,scenario_id,line,ipi,icms,pis,cofins)
 select p_org,p_scenario,x.line,x.ipi,x.icms,x.pis,x.cofins from (values ('maq',0,4.10,1.00,4.80),('tra',0,4.10,1.00,4.80),('ace',1.92,5.64,1.62,7.46),('pec',1.92,5.64,1.62,7.46)) x(line,ipi,icms,pis,cofins)
 on conflict(scenario_id,line) do nothing;
 perform public.planning_fat_seed_models(p_org,p_scenario);
 return fid;
end $$;

-- Base do cálculo: Acessórios usa a linha de impostos 'ace'.
create or replace function public.planning_fat_base(p_form uuid,p_cells jsonb default '[]')
returns table(region_key text,model_key text,reference_month integer,group_name text,fat_driven boolean,exp boolean,coordination_id uuid,q numeric,fat numeric,mp numeric,ipi numeric,icms numeric,pis numeric,cofins numeric)
language sql stable security definer set search_path=public as $$
 with f as (select * from public.planning_forms where id=p_form and form_type='fat'),
 drafts as (select x.region_key,x.model_key,x.month reference_month,x.amount::numeric amount
   from jsonb_to_recordset(p_cells) x(region_key text,model_key text,month integer,amount text)),
 vals as (select v.region_key,v.model_key,v.reference_month,v.amount from public.planning_fat_volumes v join f on f.id=v.form_id
   where not exists(select 1 from drafts d where d.region_key=v.region_key and d.model_key=v.model_key and d.reference_month=v.reference_month)
   union all select * from drafts),
 regs as (select r.region_key from public.planning_fat_regions((select organization_id from f)) r),
 coord as (select ar.territorio_id,l.nome line,c.id,c.nome from public.comercial_atribuicao_responsavel ar
   join public.comercial_linhas_negocio l on l.id=ar.linha_negocio_id join public.comercial_coordenacoes c on c.id=ar.coordenacao_id
   where ar.organization_id=(select organization_id from f) and ar.data_inicio<=current_date and (ar.data_fim is null or ar.data_fim>=current_date)),
 b as (
   select v.region_key,v.model_key,v.reference_month,m.group_name,m.fat_driven,c.id coordination_id,coalesce(c.nome='Exportação',false) exp,v.amount q,
     v.amount*(case when pl.region_key is not null then coalesce(pl.adj_fat,pl.fat_unit) else coalesce(pm.adj_fat,pm.fat_unit) end) fat,
     v.amount*(case when pl.region_key is not null then coalesce(pl.adj_mp,pl.mp_unit) else coalesce(pm.adj_mp,pm.mp_unit) end) mp,
     t.ipi,t.icms,t.pis,t.cofins
   from vals v cross join f
   join regs on regs.region_key=v.region_key
   join public.planning_fat_models m on m.scenario_id=f.scenario_id and m.model_key=v.model_key
   join public.planning_scenario_months sm on sm.scenario_id=f.scenario_id and sm.reference_month=v.reference_month and sm.source_type='forms'
   left join public.planning_fat_premises pl on pl.scenario_id=f.scenario_id and pl.region_key=v.region_key and pl.model_key=v.model_key
   left join public.planning_fat_premises pm on pm.scenario_id=f.scenario_id and pm.region_key='marcher' and pm.model_key=v.model_key
   join public.planning_fat_taxes t on t.scenario_id=f.scenario_id and t.line=case m.group_name when 'Transgrain' then 'tra' when 'Acessórios' then 'ace' when 'Linhas complementares' then 'pec' else 'maq' end
   left join lateral (select cc.id,cc.nome from coord cc where cc.line=public.planning_fat_line_of(m.group_name)
     and cc.territorio_id is not distinct from (case when v.region_key='PECAS' then null else v.region_key::uuid end) limit 1) c on true
   where v.amount>0 and (pl.region_key is not null or pm.region_key is not null))
 select b.region_key,b.model_key,b.reference_month,b.group_name,b.fat_driven,b.exp,b.coordination_id,b.q,b.fat,b.mp,
   case when b.exp then 0 else b.fat*b.ipi/100 end,case when b.exp then 0 else b.fat*b.icms/100 end,
   case when b.exp then 0 else b.fat*b.pis/100 end,case when b.exp then 0 else b.fat*b.cofins/100 end from b;
$$;

-- Cálculo interno: Acessórios vai na conta 31101006 (VENDA DE PEÇAS E ACESSÓRIOS), junto com Peças.
create or replace function public.planning_fat_calculate(p_form uuid,p_cells jsonb default '[]') returns table(account_number text,reference_month integer,amount numeric)
language sql stable security definer set search_path=public as $$
 select a.acct,b.reference_month,round(sum(a.amt),2) from public.planning_fat_base(p_form,p_cells) b cross join lateral (values
   (case when b.exp then '31101002' when b.group_name='Transgrain' then '31101007' when b.group_name in('Linhas complementares','Acessórios') then '31101006' else '31101001' end,-b.fat),
   ('31203001',b.ipi),('31203002',b.icms),('31203004',b.cofins),('31203005',b.pis),('412010901',b.mp)) a(acct,amt)
 group by a.acct,b.reference_month having round(sum(a.amt),2)<>0;
$$;

-- Cenários de planejamento que já existem ganham a linha de impostos 'ace' e os 3 modelos.
do $$declare r record;begin
 for r in select id,organization_id from public.forecast_scenarios where planning_version=1 order by created_at loop
   perform public.planning_fat_prepare(r.organization_id,r.id,null);
 end loop;
end $$;

commit;
