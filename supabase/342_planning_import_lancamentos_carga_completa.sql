-- Importação dos formulários de lançamento (01 a 09) com dois modos: 'incremental' (grava/atualiza só o arquivo, como antes)
-- e 'completa' (apaga todos os lançamentos do formulário e grava só o arquivo). Erro de validação não apaga nada.
drop function if exists public.planning_import_entries(uuid,uuid,jsonb);
create function public.planning_import_entries(p_org uuid,p_form uuid,p_rows jsonb,p_mode text default 'incremental') returns jsonb
language plpgsql security definer set search_path=public as $$
declare f public.planning_forms; errs jsonb; replaced int:=0; inserted int:=0; total int; removed int:=0; begin
 if auth.uid() is null or not public.planning_is_admin(p_org) then raise exception 'Somente o administrador importa'; end if;
 if p_mode is null or p_mode not in ('incremental','completa') then raise exception 'Modo de carga inválido'; end if;
 select * into f from public.planning_forms where id=p_form and organization_id=p_org;
 if not found or f.form_type<>'opex' then raise exception 'Formulário inválido'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)=0 then
   return jsonb_build_object('ok',false,'errors',jsonb_build_array(jsonb_build_object('row',0,'message','O arquivo não tem linhas de dados')));
 end if;
 total:=jsonb_array_length(p_rows);
 if total>5000 then
   return jsonb_build_object('ok',false,'errors',jsonb_build_array(jsonb_build_object('row',0,'message','O arquivo passa do limite de 5.000 linhas')));
 end if;
 perform 1 from public.forecast_scenarios where id=f.scenario_id for update;
 with s as (select * from public.planning_import_stage(p_org,p_form,p_rows))
 select coalesce(jsonb_agg(jsonb_build_object('row',e.rn,'message',e.message) order by e.rn,e.message),'[]') into errs from (
   select s.rn,'Linha '||s.rn||': conta obrigatória' message from s where s.account is null
   union all select s.rn,'Linha '||s.rn||': conta '||s.account||' não cadastrada' from s where s.account is not null and s.acc_id is null
   union all select s.rn,'Linha '||s.rn||': a conta '||s.account||' não é uma linha digitável deste formulário' from s where s.acc_id is not null and s.line_id is null
   union all select s.rn,'Linha '||s.rn||': centro de custo '||s.cc_number||' não cadastrado' from s where s.cc_number is not null and s.cc_id is null
   union all select s.rn,'Linha '||s.rn||': mês obrigatório' from s where s.month_text is null
   union all select s.rn,'Linha '||s.rn||': o mês '||s.month_text||' não recebe lançamento deste formulário' from s
     where s.month_text is not null and (s.month is null or not exists(select 1 from public.planning_scenario_months m where m.scenario_id=f.scenario_id and m.reference_month=s.month and m.source_type='forms'))
   union all select s.rn,'Linha '||s.rn||': valor obrigatório' from s where s.amount is null
   union all select s.rn,'Linha '||s.rn||': valor inválido' from s where s.amount is not null and s.amount !~ '^-?[0-9]+(\.[0-9]{1,2})?$'
   union all select s.rn,'Linha '||s.rn||': conta '||s.account||', '||coalesce('centro de custo '||s.cc_number,'sem centro de custo')||' e mês '||s.month||' aparecem mais de uma vez no arquivo'
     from s where s.line_id is not null and s.month is not null
     and (select count(*) from s t where t.line_id=s.line_id and t.cc_id is not distinct from s.cc_id and t.month=s.month)>1
   union all select s.rn,'Linha '||s.rn||': o '||k.source||' prevalece sobre esta chave (conta '||s.account||', mês '||s.month||')'
     from s join public.planning_prevailing_keys(f.scenario_id) k on k.account_number=s.account and k.reference_month=s.month and k.cost_center_id is not distinct from s.cc_id
     where s.line_id is not null and s.month is not null and case when s.amount ~ '^-?[0-9]+(\.[0-9]{1,2})?$' then s.amount::numeric else 0 end<>0
 ) e;
 if jsonb_array_length(errs)>0 then return jsonb_build_object('ok',false,'errors',errs); end if;
 if p_mode='completa' then
   delete from public.planning_entries where form_id=p_form;
   get diagnostics removed = row_count;
 end if;
 select count(*) into replaced from public.planning_import_stage(p_org,p_form,p_rows) s join public.planning_entries e on e.line_id=s.line_id and e.cost_center_id is not distinct from s.cc_id and e.reference_month=s.month;
 inserted:=total-replaced;
 insert into public.planning_entries(organization_id,form_id,line_id,cost_center_id,reference_month,amount,updated_by)
   select p_org,p_form,s.line_id,s.cc_id,s.month,s.amount::numeric,auth.uid() from public.planning_import_stage(p_org,p_form,p_rows) s
 on conflict(line_id,cost_center_id,reference_month) do update set amount=excluded.amount,row_version=planning_entries.row_version+1,updated_by=auth.uid(),updated_at=clock_timestamp();
 return jsonb_build_object('ok',true,'mode',p_mode,'removed',removed,'replaced',replaced,'inserted',inserted);
end $$;
revoke all on function public.planning_import_entries(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.planning_import_entries(uuid,uuid,jsonb,text) to authenticated;
