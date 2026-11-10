-- Importação do FAT com dois modos: 'incremental' (grava/atualiza só as células do arquivo, como antes) e
-- 'completa' (apaga todos os volumes do formulário e grava só o que vem no arquivo). Validação idêntica nos dois modos:
-- qualquer erro devolve a lista e nada é apagado nem gravado.
drop function if exists public.planning_fat_import(uuid,uuid,jsonb);
create function public.planning_fat_import(p_org uuid,p_form uuid,p_rows jsonb,p_mode text default 'incremental') returns jsonb
language plpgsql security definer set search_path=public as $$
declare f public.planning_forms; errs jsonb; replaced int; inserted int; total int; removed int:=0; begin
 if auth.uid() is null or not public.planning_is_admin(p_org) then raise exception 'Somente o administrador importa'; end if;
 if p_mode is null or p_mode not in ('incremental','completa') then raise exception 'Modo de carga inválido'; end if;
 select * into f from public.planning_forms where id=p_form and organization_id=p_org and form_type='fat';
 if not found then raise exception 'Formulário inválido'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)=0 then
   return jsonb_build_object('ok',false,'errors',jsonb_build_array(jsonb_build_object('row',0,'message','O arquivo não tem linhas de dados')));
 end if;
 if jsonb_array_length(p_rows)>5000 then
   return jsonb_build_object('ok',false,'errors',jsonb_build_array(jsonb_build_object('row',0,'message','O arquivo passa do limite de 5.000 linhas')));
 end if;
 perform 1 from public.forecast_scenarios where id=f.scenario_id for update;
 with s as (select * from public.planning_fat_import_stage(p_org,f.scenario_id,p_rows))
 select coalesce(jsonb_agg(jsonb_build_object('row',e.rn,'message',e.message) order by e.rn,e.message),'[]') into errs from (
   select s.rn,'Linha '||s.rn||': código do produto obrigatório' message from s where s.cod is null
   union all select s.rn,'Linha '||s.rn||': produto '||s.cod||' não cadastrado' from s where s.cod is not null and s.produto_id is null
   union all select s.rn,'Linha '||s.rn||': o produto '||s.cod||' não pertence a nenhum modelo do FAT' from s where s.produto_id is not null and s.model_key is null
   union all select s.rn,'Linha '||s.rn||': território '||s.terr||' não cadastrado' from s where s.terr is not null and s.terr_id is null
   union all select s.rn,'Linha '||s.rn||': o território '||s.terr||' não é uma região do FAT' from s where s.terr_id is not null and not s.region_ok and not s.fat_driven
   union all select s.rn,'Linha '||s.rn||': território obrigatório' from s where s.terr is null and s.model_key is not null and not s.fat_driven
   union all select s.rn,'Linha '||s.rn||': mês obrigatório' from s where s.month_text is null
   union all select s.rn,'Linha '||s.rn||': o mês '||s.month_text||' não recebe lançamento do FAT' from s
     where s.month_text is not null and (s.month is null or not exists(select 1 from public.planning_scenario_months m where m.scenario_id=f.scenario_id and m.reference_month=s.month and m.source_type='forms'))
   union all select s.rn,'Linha '||s.rn||': volume (quantidade) obrigatório' from s where s.model_key is not null and not s.fat_driven and s.qty is null
   union all select s.rn,'Linha '||s.rn||': quantidade inválida' from s where s.qty is not null and s.qty !~ '^[0-9]+(\.[0-9]+)?$'
   union all select s.rn,'Linha '||s.rn||': valor obrigatório para Peças' from s where s.fat_driven and s.val is null
   union all select s.rn,'Linha '||s.rn||': valor inválido' from s where s.val is not null and s.val !~ '^-?[0-9]+(\.[0-9]+)?$'
   union all select s.rn,'Linha '||s.rn||': MC1% inválido' from s where s.mc is not null and s.mc !~ '^-?[0-9]+(\.[0-9]+)?$'
 ) e;
 if jsonb_array_length(errs)>0 then return jsonb_build_object('ok',false,'errors',errs); end if;
 perform set_config('vecton.planning_write',f.scenario_id::text,true);
 if p_mode='completa' then
   delete from public.planning_fat_volumes where form_id=p_form;
   get diagnostics removed = row_count;
 end if;
 select count(*) into replaced from public.planning_fat_import_cells(p_org,f.scenario_id,p_rows) c join public.planning_fat_volumes v on v.form_id=p_form and v.region_key=c.region_key and v.model_key=c.model_key and v.reference_month=c.month;
 select count(*) into total from public.planning_fat_import_cells(p_org,f.scenario_id,p_rows);
 inserted:=total-replaced;
 insert into public.planning_fat_volumes(organization_id,scenario_id,form_id,region_key,model_key,reference_month,amount)
   select p_org,f.scenario_id,p_form,c.region_key,c.model_key,c.month,c.amount from public.planning_fat_import_cells(p_org,f.scenario_id,p_rows) c
 on conflict(form_id,region_key,model_key,reference_month) do update set amount=excluded.amount,row_version=planning_fat_volumes.row_version+1;
 return jsonb_build_object('ok',true,'mode',p_mode,'removed',removed,'replaced',replaced,'inserted',case when p_mode='completa' then total else inserted end);
end $$;
revoke all on function public.planning_fat_import(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.planning_fat_import(uuid,uuid,jsonb,text) to authenticated;
