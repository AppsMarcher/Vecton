-- Administrador pode renomear o formulário FAT (o código FAT é reservado e não muda).
-- A 319 barrava qualquer save_form de formulário FAT; aqui abre só o nome, sem mexer em
-- status nem revisão (o rascunho de quem está preenchendo continua válido).
begin;

create or replace function public.planning_write(p_org uuid,p_action text,p_scenario uuid default null,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare fid uuid;res jsonb;src uuid;nm text;
begin
 fid:=coalesce(nullif(p_payload->>'form_id','')::uuid,case when p_action='save_form' then nullif(p_payload->>'id','')::uuid end);
 if fid is not null and exists(select 1 from public.planning_forms where id=fid and form_type='fat') then
   if p_action<>'save_form' then raise exception 'Use as operações autorizadas do FAT';end if;
   if auth.uid() is null or not public.is_org_member(p_org) then raise exception 'Sem acesso à organização';end if;
   if not public.planning_is_admin(p_org) then raise exception 'Sem permissão';end if;
   if not exists(select 1 from public.planning_forms where id=fid and organization_id=p_org and scenario_id=p_scenario) then raise exception 'Formulário inválido';end if;
   if upper(trim(coalesce(p_payload->>'code','')))<>'FAT' then raise exception 'O código do FAT não pode ser alterado';end if;
   nm:=trim(coalesce(p_payload->>'name',''));
   if nm='' then raise exception 'Informe o nome do formulário';end if;
   perform set_config('vecton.planning_write',p_scenario::text,true);
   update public.planning_forms set name=nm where id=fid;
   return jsonb_build_object('id',fid);
 end if;
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

commit;
