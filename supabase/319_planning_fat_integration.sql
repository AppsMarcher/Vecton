-- FAT: botão único de integração (OPEX, CAPEX e FAT), contexto do Planejamento, clonagem e criação do formulário.
begin;

-- Botão único "Integrar no DRE e OPEX": integra os formulários OPEX liberados, recalcula o CAPEX e o FAT na mesma
-- chamada. Cada integração segue atômica e registra a própria execução; a permissão de cada parte é a do formulário.
create or replace function public.planning_integrate_all(p_org uuid,p_scenario uuid,p_form uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare f public.planning_forms;opex_id uuid;capex_id uuid;capex_f public.planning_forms;fat_f public.planning_forms;
 r_opex jsonb;r_capex jsonb;r_fat jsonb;notes text[]:='{}';rows int:=0;ok boolean:=true;errs text[]:='{}';
begin
 if auth.uid() is null or not public.is_org_member(p_org) then raise exception 'Sem acesso à organização';end if;
 select * into f from public.planning_forms where id=p_form and scenario_id=p_scenario and organization_id=p_org;
 if not found then raise exception 'Formulário inválido';end if;

 -- Formulário OPEX usado para autorizar a integração do OPEX (o clicado, ou outro com escrita).
 if f.form_type='opex' and public.planning_form_mode(f.id)='write' then opex_id:=f.id;
 else select id into opex_id from public.planning_forms where scenario_id=p_scenario and organization_id=p_org and form_type='opex'
   and public.planning_form_mode(id)='write' order by code limit 1;end if;
 select * into capex_f from public.planning_forms where scenario_id=p_scenario and organization_id=p_org and form_type='capex';
 select * into fat_f from public.planning_forms where scenario_id=p_scenario and organization_id=p_org and form_type='fat';

 if opex_id is not null then
   r_opex:=public.planning_write(p_org,'project',p_scenario,jsonb_build_object('form_id',opex_id));
   rows:=rows+coalesce((r_opex->>'rows_written')::int,0);
   if not coalesce((r_opex->>'ok')::boolean,false) then ok:=false;errs:=array_append(errs,'OPEX: '||coalesce(r_opex->>'error','falha'));end if;
 else notes:=array_append(notes,'OPEX: sem permissão de escrita em formulário OPEX');end if;

 if capex_f.id is null then notes:=array_append(notes,'CAPEX: formulário inexistente');
 elsif public.planning_form_mode(capex_f.id) is distinct from 'write' then notes:=array_append(notes,'CAPEX: sem permissão de escrita');
 elsif capex_f.status<>'released' then notes:=array_append(notes,'CAPEX: formulário não liberado');
 else
   r_capex:=public.planning_capex_write(p_org,'project',p_scenario,jsonb_build_object('form_id',capex_f.id));
   rows:=rows+coalesce((r_capex->>'rows_written')::int,0);
   if not coalesce((r_capex->>'ok')::boolean,false) then ok:=false;errs:=array_append(errs,'CAPEX: '||coalesce(r_capex->>'error','falha'));end if;
 end if;

 if fat_f.id is null then notes:=array_append(notes,'FAT: formulário inexistente');
 elsif public.planning_form_mode(fat_f.id) is distinct from 'write' then notes:=array_append(notes,'FAT: sem permissão de escrita');
 elsif fat_f.status<>'released' then notes:=array_append(notes,'FAT: formulário não liberado');
 else
   r_fat:=public.planning_fat_write(p_org,'project',p_scenario,jsonb_build_object('form_id',fat_f.id));
   rows:=rows+coalesce((r_fat->>'rows_written')::int,0);
   if not coalesce((r_fat->>'ok')::boolean,false) then ok:=false;errs:=array_append(errs,'FAT: '||coalesce(r_fat->>'error','falha'));end if;
 end if;

 return jsonb_build_object('ok',ok,'rows_written',rows,'opex',r_opex,'capex',r_capex,'fat',r_fat,'notes',to_jsonb(notes),
   'error',case when cardinality(errs)>0 then array_to_string(errs,' · ') end);
end $$;
-- Prepara o FAT de um cenário: formulário (rascunho), percentuais (herdados do cenário de origem ou padrão) e modelos.
create function public.planning_fat_prepare(p_org uuid,p_scenario uuid,p_source uuid default null) returns uuid
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
 select p_org,p_scenario,x.line,x.ipi,x.icms,x.pis,x.cofins from (values ('maq',0,4.10,1.00,4.80),('tra',0,4.10,1.00,4.80),('pec',1.92,5.64,1.62,7.46)) x(line,ipi,icms,pis,cofins)
 on conflict(scenario_id,line) do nothing;
 perform public.planning_fat_seed_models(p_org,p_scenario);
 return fid;
end $$;

-- Cenários de planejamento que já existem ganham o FAT em rascunho, sem acessos.
do $$declare r record;begin
 for r in select id,organization_id from public.forecast_scenarios where planning_version=1 order by created_at loop
   perform public.planning_fat_prepare(r.organization_id,r.id,null);
 end loop;
end $$;

-- planning_write: o FAT só é alterado pelas operações autorizadas; cenário novo nasce com o FAT.
alter function public.planning_write(uuid,text,uuid,jsonb) rename to planning_write_before_fat;
revoke all on function public.planning_write_before_fat(uuid,text,uuid,jsonb) from public,anon,authenticated;
create function public.planning_write(p_org uuid,p_action text,p_scenario uuid default null,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare fid uuid;res jsonb;src uuid;
begin
 fid:=coalesce(nullif(p_payload->>'form_id','')::uuid,case when p_action='save_form' then nullif(p_payload->>'id','')::uuid end);
 if fid is not null and exists(select 1 from public.planning_forms where id=fid and form_type='fat') then raise exception 'Use as operações autorizadas do FAT';end if;
 if p_action='copy_form' and exists(select 1 from public.planning_forms where id=nullif(p_payload->>'source_form_id','')::uuid and form_type='fat') then raise exception 'O FAT não pode ser origem de cópia de estrutura';end if;
 if p_action='save_form' and upper(trim(coalesce(p_payload->>'code','')))='FAT' then raise exception 'Código FAT reservado ao FAT';end if;
 res:=public.planning_write_before_fat(p_org,p_action,p_scenario,p_payload);
 if p_action='create' then
   src:=nullif(p_payload->>'base_scenario_id','')::uuid;
   if src is null then select id into src from public.forecast_scenarios where organization_id=p_org and planning_version=1 and id<>(res->>'id')::uuid order by created_at desc,id limit 1;end if;
   perform public.planning_fat_prepare(p_org,(res->>'id')::uuid,src);
 end if;
 return res;
end $$;

-- Clonagem: o FAT copia percentuais, acessos e, com copy_values, premissas e volumes (nunca o ledger).
alter function public.planning_clone_form(uuid,uuid,uuid,jsonb) rename to planning_clone_form_before_fat;
revoke all on function public.planning_clone_form_before_fat(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
create function public.planning_clone_form(p_org uuid,p_target uuid,p_source uuid,p_options jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare src public.planning_forms;fid uuid;begin
 select * into src from public.planning_forms where id=p_source and organization_id=p_org;
 if not found then raise exception 'Formulário de origem inválido';end if;
 if src.form_type<>'fat' then return public.planning_clone_form_before_fat(p_org,p_target,p_source,p_options);end if;
 perform 1 from public.forecast_scenarios where id=src.scenario_id for share;
 fid:=public.planning_fat_prepare(p_org,p_target,src.scenario_id);
 update public.planning_forms set status=coalesce(p_options->>'status','draft') where id=fid;
 if coalesce((p_options->>'copy_access')::boolean,false) then
   delete from public.planning_fat_access where form_id=fid;
   insert into public.planning_fat_access(organization_id,form_id,user_id,region_key,access_mode) select p_org,fid,user_id,region_key,access_mode from public.planning_fat_access where form_id=src.id;
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

-- Contexto: o FAT aparece na lista de formulários (planning_form_mode já respeita a matriz de acessos por região).
alter function public.planning_context(uuid,uuid) rename to planning_context_before_fat;
revoke all on function public.planning_context_before_fat(uuid,uuid) from public,anon,authenticated;
create function public.planning_context(p_org uuid,p_scenario uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 return public.planning_context_before_fat(p_org,p_scenario)||jsonb_build_object('fat_enabled',true,
  'fat_regions',(select coalesce(jsonb_agg(jsonb_build_object('region_key',r.region_key,'label',r.label) order by r.label),'[]') from public.planning_fat_regions(p_org) r where public.planning_is_admin(p_org)));
end $$;

revoke all on function public.planning_fat_prepare(uuid,uuid,uuid),public.planning_clone_form(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.planning_write(uuid,text,uuid,jsonb),public.planning_context(uuid,uuid),public.planning_integrate_all(uuid,uuid,uuid) from public,anon;
grant execute on function public.planning_write(uuid,text,uuid,jsonb),public.planning_context(uuid,uuid),public.planning_integrate_all(uuid,uuid,uuid) to authenticated;

commit;
