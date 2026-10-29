-- Acesso do formulário FAT por coordenação (e não mais por região/UF).
-- Cada coordenação cobre as células (região × linha de negócio) da Atribuição vigente:
--   Sul/Norte = UFs do território, só linha Grão (e Outros); Oeste = todas as linhas; Pecuária = UFs, linha Pecuária;
--   Exportação = EX (todas as linhas); Peças = Peças. 'MARCHER' cobre tudo.
-- Os acessos por região (planning_fat_access) ficam intactos e deixam de valer; não são convertidos.
begin;

create table public.planning_fat_coord_access (
 organization_id uuid not null references public.organizations(id),
 form_id uuid not null references public.planning_forms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 coord_key text not null,
 access_mode text not null check(access_mode in ('read','write')),
 primary key(form_id,user_id,coord_key)
);
alter table public.planning_fat_coord_access enable row level security;
revoke all on public.planning_fat_coord_access from public,anon,authenticated;

-- Células cobertas por cada coordenação na Atribuição vigente.
create function public.planning_fat_coord_scope(p_org uuid) returns table(coord_key text,coord_name text,region_key text,line text)
language sql stable security definer set search_path=public as $$
 select c.id::text,c.nome,case when ar.territorio_id is null then 'PECAS' else ar.territorio_id::text end,l.nome
 from public.comercial_atribuicao_responsavel ar
 join public.comercial_coordenacoes c on c.id=ar.coordenacao_id
 join public.comercial_linhas_negocio l on l.id=ar.linha_negocio_id
 where ar.organization_id=p_org and public.is_org_member(p_org) and ar.data_inicio<=current_date and (ar.data_fim is null or ar.data_fim>=current_date);
$$;

-- Modo de uma célula (região × modelo): admin escreve; os demais, pelas coordenações concedidas.
create function public.planning_fat_cell_mode(p_form uuid,p_region text,p_model text) returns text
language sql stable security definer set search_path=public as $$
 select case when public.planning_is_admin(f.organization_id) then 'write'
 when f.status='released' then (
   select case when bool_or(a.access_mode='write') then 'write' when count(*)>0 then 'read' end
   from public.planning_fat_coord_access a
   where a.form_id=f.id and a.user_id=auth.uid() and (a.coord_key='MARCHER' or exists(
     select 1 from public.planning_fat_coord_scope(f.organization_id) s
     join public.planning_fat_models m on m.scenario_id=f.scenario_id and m.model_key=p_model
     where s.coord_key=a.coord_key and s.region_key=p_region and s.line=public.planning_fat_line_of(m.group_name)))) end
 from public.planning_forms f where f.id=p_form and f.form_type='fat' and public.is_org_member(f.organization_id);
$$;

-- Modo da região: o melhor modo entre os modelos que a pessoa enxerga nela.
create or replace function public.planning_fat_region_mode(p_form uuid,p_region text) returns text
language sql stable security definer set search_path=public as $$
 select case when public.planning_is_admin(f.organization_id) then 'write'
 when f.status='released' then (
   select case when bool_or(x.m='write') then 'write' when count(x.m)>0 then 'read' end
   from (select public.planning_fat_cell_mode(f.id,p_region,m.model_key) m from public.planning_fat_models m where m.scenario_id=f.scenario_id) x where x.m is not null) end
 from public.planning_forms f where f.id=p_form and f.form_type='fat' and public.is_org_member(f.organization_id);
$$;

create or replace function public.planning_form_mode(p_form uuid) returns text
language sql stable security definer set search_path=public as $$
 select case when public.planning_is_admin(f.organization_id) then 'write'
 when f.status='released' and f.form_type='fat' then (select case when count(*)=0 then null when bool_or(a.access_mode='write') then 'write' else 'read' end
   from public.planning_fat_coord_access a where a.form_id=f.id and a.user_id=auth.uid())
 when f.status='released' and (case when f.form_type='capex'
 then exists(select 1 from public.planning_capex_cc_scope(f.organization_id))
 else exists(select 1 from public.planning_cc_scope(f.organization_id)) end)
 then (select a.access_mode from public.planning_form_access a where a.form_id=f.id and a.user_id=auth.uid()) end
 from public.planning_forms f where f.id=p_form and public.is_org_member(f.organization_id);
$$;

create or replace function public.planning_fat_read(p_org uuid,p_form uuid,p_asof date default current_date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare f public.planning_forms;sc public.forecast_scenarios;adm boolean:=public.planning_is_admin(p_org);regs text[];lastwin integer[];newest integer;
 cur integer:=extract(year from p_asof)::integer*100+extract(month from p_asof)::integer;
begin
 select * into f from public.planning_forms where id=p_form and organization_id=p_org and form_type='fat';
 if not found or public.planning_form_mode(p_form) is null then raise exception 'Sem acesso ao formulário';end if;
 select * into sc from public.forecast_scenarios where id=f.scenario_id;
 select coalesce(array_agg(r.region_key),'{}') into regs from public.planning_fat_regions(p_org) r
  where adm or public.planning_fat_region_mode(p_form,r.region_key) is not null;
 select window_months into lastwin from public.planning_fat_premise_runs where scenario_id=f.scenario_id order by run_at desc limit 1;
 select max(z.ym) into newest from (select le.reference_year*100+le.reference_month ym from public.comercial_realizado_ledger_entries le
  join (select unnest(x.product_ids) produto_id from public.planning_fat_models x where x.scenario_id=f.scenario_id) m on m.produto_id=le.produto_id
  where le.organization_id=p_org and le.origem='FAT' and le.reference_year*100+le.reference_month<cur and le.reference_year*100+le.reference_month>=cur-200 group by 1 having sum(le.quantidade)>0) z;
 return jsonb_build_object('admin',adm,'revision',f.revision,'status',f.status,'year',sc.reference_year,'window_months',to_jsonb(coalesce(lastwin,'{}')),
  'stale',coalesce(newest,0)>coalesce((select max(x) from unnest(lastwin) x),0),
  'orphans',case when adm then (select count(*) from (select distinct v.region_key,v.model_key from public.planning_fat_volumes v where v.form_id=p_form and v.amount>0
     and not exists(select 1 from public.planning_fat_regions(p_org) r where r.region_key=v.region_key)) z) else 0 end,
  'regions',(select coalesce(jsonb_agg(jsonb_build_object('region_key',r.region_key,'territory_id',r.territory_id,'label',r.label,'responsibles',to_jsonb(r.responsibles),'mode',public.planning_fat_region_mode(p_form,r.region_key)) order by r.label),'[]')
    from public.planning_fat_regions(p_org) r where r.region_key=any(regs)),
  'models',(select coalesce(jsonb_agg(jsonb_build_object('model_key',m.model_key,'group',m.group_name,'sort',m.sort,'fat_driven',m.fat_driven) order by m.group_name,m.sort),'[]') from public.planning_fat_models m where m.scenario_id=f.scenario_id),
  'coordination',(select coalesce(jsonb_agg(jsonb_build_object('region_key',r.region_key,'line',l.nome,'coordination',c.nome,'responsible',ar.responsavel)),'[]')
    from public.planning_fat_regions(p_org) r join public.comercial_atribuicao_responsavel ar on ar.organization_id=p_org
     and ar.territorio_id is not distinct from (case when r.region_key='PECAS' then null else r.region_key::uuid end)
     and ar.data_inicio<=current_date and (ar.data_fim is null or ar.data_fim>=current_date)
    join public.comercial_linhas_negocio l on l.id=ar.linha_negocio_id join public.comercial_coordenacoes c on c.id=ar.coordenacao_id where r.region_key=any(regs)),
  'volumes',(select coalesce(jsonb_agg(jsonb_build_object('region_key',v.region_key,'model_key',v.model_key,'reference_month',v.reference_month,'amount',v.amount,'row_version',v.row_version)),'[]')
    from public.planning_fat_volumes v where v.form_id=p_form and v.region_key=any(regs)),
  'premises',(select coalesce(jsonb_agg(jsonb_build_object('region_key',p.region_key,'model_key',p.model_key,'fat_unit',coalesce(p.adj_fat,p.fat_unit),'mp_unit',coalesce(p.adj_mp,p.mp_unit),
     'origin',p.origin,'adjusted',(p.adj_fat is not null or p.adj_mp is not null),'window_months',to_jsonb(p.window_months),'version',p.row_version)
     ||case when adm then jsonb_build_object('calc_fat_unit',p.fat_unit,'calc_mp_unit',p.mp_unit,'adj_fat',p.adj_fat,'adj_mp',p.adj_mp,'calculated_at',p.calculated_at) else '{}'::jsonb end),'[]')
    from public.planning_fat_premises p where p.scenario_id=f.scenario_id and (p.region_key='marcher' or p.region_key=any(regs))),
  'access',(select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'coord_key',a.coord_key,'access_mode',a.access_mode)),'[]') from public.planning_fat_coord_access a where a.form_id=p_form and adm),
  'coords',(select coalesce(jsonb_agg(jsonb_build_object('key',c.k,'name',c.n) order by c.o,c.n),'[]') from (select 'MARCHER'::text k,'Marcher'::text n,0 o union select s.coord_key,s.coord_name,1 from (select distinct coord_key,coord_name from public.planning_fat_coord_scope(p_org)) s) c where adm),
  'cell_modes',(select coalesce(jsonb_agg(jsonb_build_object('region_key',r.region_key,'model_key',m.model_key,'mode',x.mode)),'[]')
    from public.planning_fat_regions(p_org) r cross join public.planning_fat_models m cross join lateral (select public.planning_fat_cell_mode(p_form,r.region_key,m.model_key) mode) x
    where not adm and m.scenario_id=f.scenario_id and r.region_key=any(regs) and x.mode is not null),
  'taxes',(select coalesce(jsonb_agg(jsonb_build_object('line',t.line,'ipi',t.ipi,'icms',t.icms,'pis',t.pis,'cofins',t.cofins,'version',t.row_version) order by t.line),'[]') from public.planning_fat_taxes t where t.scenario_id=f.scenario_id),
  'history',(select coalesce(jsonb_agg(jsonb_build_object('region_key',h.rk,'model_key',h.model_key,'year',h.y,'qty',h.q,'fat',h.f,'rl',h.r,'mp',h.p)),'[]') from (
    select case when m.fat_driven then 'PECAS' else le.territorio_id::text end rk,m.model_key,le.reference_year y,
     case when m.fat_driven then count(distinct le.reference_month) else sum(le.quantidade) end q,sum(le.valor) f,sum(coalesce(le.rl,0)) r,sum(coalesce(le.mp,0)) p
    from (select x.model_key,x.fat_driven,x.scenario_id,unnest(x.product_ids) produto_id from public.planning_fat_models x where x.scenario_id=f.scenario_id) m join public.comercial_realizado_ledger_entries le on le.organization_id=p_org and le.origem='FAT' and le.produto_id=m.produto_id
     and le.reference_year in(sc.reference_year-2,sc.reference_year-1)
    where m.scenario_id=f.scenario_id and ((m.fat_driven and 'PECAS'=any(regs)) or (not m.fat_driven and le.territorio_id::text=any(regs))) group by 1,2,3,m.fat_driven) h));
end $$;

create or replace function public.planning_clone_form(p_org uuid,p_target uuid,p_source uuid,p_options jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare src public.planning_forms;fid uuid;begin
 select * into src from public.planning_forms where id=p_source and organization_id=p_org;
 if not found then raise exception 'Formulário de origem inválido';end if;
 if src.form_type<>'fat' then return public.planning_clone_form_before_fat(p_org,p_target,p_source,p_options);end if;
 perform 1 from public.forecast_scenarios where id=src.scenario_id for share;
 fid:=public.planning_fat_prepare(p_org,p_target,src.scenario_id);
 update public.planning_forms set status=coalesce(p_options->>'status','draft') where id=fid;
 if coalesce((p_options->>'copy_access')::boolean,false) then
   delete from public.planning_fat_coord_access where form_id=fid;
   insert into public.planning_fat_coord_access(organization_id,form_id,user_id,coord_key,access_mode) select p_org,fid,user_id,coord_key,access_mode from public.planning_fat_coord_access where form_id=src.id;
 end if;
 if coalesce((p_options->>'copy_values')::boolean,false) then
   insert into public.planning_fat_premises(organization_id,scenario_id,region_key,model_key,fat_unit,mp_unit,origin,window_months,adj_fat,adj_mp,calculated_at)
   select p_org,p_target,region_key,model_key,fat_unit,mp_unit,origin,window_months,adj_fat,adj_mp,calculated_at from public.planning_fat_premises where scenario_id=src.scenario_id
   on conflict(scenario_id,region_key,model_key) do update set fat_unit=excluded.fat_unit,mp_unit=excluded.mp_unit,origin=excluded.origin,window_months=excluded.window_months,adj_fat=excluded.adj_fat,adj_mp=excluded.adj_mp;
   insert into public.planning_fat_volumes(organization_id,scenario_id,form_id,region_key,model_key,reference_month,amount)
   select p_org,p_target,fid,v.region_key,v.model_key,v.reference_month,v.amount from public.planning_fat_volumes v
   join public.planning_scenario_months m on m.scenario_id=p_target and m.reference_month=v.reference_month and m.source_type='forms' where v.form_id=src.id;
 end if;
 return fid;
end $$;

-- Escrita: save_access passa a gravar coordenações; save_volumes confere o modo de cada célula.
alter function public.planning_fat_write(uuid,text,uuid,jsonb) rename to planning_fat_write_before_coord;
revoke all on function public.planning_fat_write_before_coord(uuid,text,uuid,jsonb) from public,anon,authenticated;
create function public.planning_fat_write(p_org uuid,p_action text,p_scenario uuid,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.forecast_scenarios;f public.planning_forms;acc jsonb;
begin
 if p_action='save_access' then
   if auth.uid() is null or not public.is_org_member(p_org) then raise exception 'Sem acesso à organização';end if;
   if not public.planning_is_admin(p_org) then raise exception 'Apenas administradores configuram o FAT';end if;
   select * into s from public.forecast_scenarios where id=p_scenario and organization_id=p_org and planning_version=1 for update;
   if not found then raise exception 'Cenário inválido';end if;
   select * into f from public.planning_forms where id=nullif(p_payload->>'form_id','')::uuid and scenario_id=s.id and organization_id=p_org and form_type='fat';
   if not found then raise exception 'Formulário inválido';end if;
   perform set_config('vecton.planning_write',s.id::text,true);
   acc:=p_payload->'access';
   if jsonb_typeof(acc) is distinct from 'array' or jsonb_array_length(acc)>2000 then raise exception 'Matriz de acessos inválida';end if;
   if exists(select 1 from jsonb_to_recordset(acc) x(user_id uuid,coord_key text,access_mode text) where x.access_mode not in('read','write')
      or not exists(select 1 from public.user_profiles u where u.organization_id=p_org and u.user_id=x.user_id and u.is_active)
      or x.coord_key is null or (x.coord_key<>'MARCHER' and x.coord_key not in(select c.coord_key from public.planning_fat_coord_scope(p_org) c))) then raise exception 'Acesso inválido: pessoa ou coordenação fora do cadastro';end if;
   delete from public.planning_fat_coord_access where form_id=f.id;
   insert into public.planning_fat_coord_access(organization_id,form_id,user_id,coord_key,access_mode) select distinct p_org,f.id,x.user_id,x.coord_key,x.access_mode from jsonb_to_recordset(acc) x(user_id uuid,coord_key text,access_mode text);
   update public.planning_forms set revision=revision+1 where id=f.id;
   return jsonb_build_object('ok',true);
 end if;
 if p_action='save_volumes' and jsonb_typeof(p_payload->'cells')='array'
    and exists(select 1 from public.planning_forms where id=nullif(p_payload->>'form_id','')::uuid and form_type='fat')
    and exists(select 1 from jsonb_to_recordset(p_payload->'cells') x(region_key text,model_key text)
      where public.planning_fat_cell_mode((p_payload->>'form_id')::uuid,x.region_key,x.model_key) is distinct from 'write') then
   raise exception 'Sem permissão de lançamento nesta coordenação';
 end if;
 return public.planning_fat_write_before_coord(p_org,p_action,p_scenario,p_payload);
end $$;

revoke all on function public.planning_fat_coord_scope(uuid),public.planning_fat_cell_mode(uuid,text,text),public.planning_fat_region_mode(uuid,text) from public,anon,authenticated;
revoke all on function public.planning_fat_write(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.planning_fat_write(uuid,text,uuid,jsonb) to authenticated;

commit;
