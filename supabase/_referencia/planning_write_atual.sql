-- REFERÊNCIA, NÃO É MIGRATION. Versão vigente de public.planning_write.
-- Última migration que recria a função: 290_planning_capex.sql
-- A partir da 319_planning_fat_integration.sql o nome `planning_write` é um envoltório: esta versão passou a se chamar
-- planning_write_before_fat (o corpo abaixo não mudou) e o envoltório bloqueia as operações estruturais sobre o FAT
-- e prepara o FAT em cenário novo.
create or replace function public.planning_write(p_org uuid,p_action text,p_scenario uuid default null,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.forecast_scenarios; f public.planning_forms; oldline public.planning_form_lines;
 sid uuid:=p_scenario; fid uuid; lid uuid; source_id uuid; src_year integer; m jsonb; item jsonb; cell jsonb;
 mo integer; nm text; yr integer; affected integer:=0; actual_version integer; conflicts jsonb:='[]';
 started timestamptz; run_id uuid; err text; old_setting text; new_line jsonb; rowkey text;
begin
 if auth.uid() is null or not public.is_org_member(p_org) then raise exception 'Sem acesso à organização'; end if;
 if p_action='create' then
   if not public.planning_is_admin(p_org) then raise exception 'Apenas administradores criam cenários'; end if;
   yr:=(p_payload->>'year')::integer;nm:=trim(p_payload->>'name');
   if yr not between 2000 and 2200 or coalesce(length(nm),0) not between 1 and 80 then raise exception 'Nome e ano inválidos'; end if;
   if right(nm,length(yr::text))<>yr::text then nm:=nm||' '||yr; end if;
   if jsonb_typeof(p_payload->'months') is distinct from 'array' then raise exception 'Defina exatamente 12 meses'; end if;
   if jsonb_array_length(p_payload->'months')<>12 then raise exception 'Defina exatamente 12 meses'; end if;
   sid:=gen_random_uuid(); perform set_config('vecton.planning_write',sid::text,true);
   insert into public.forecast_scenarios(id,organization_id,name,color,icon,reference_year,cutoff_month,created_by,planning_version,kind)
   values(sid,p_org,nm,coalesce(p_payload->>'color','#4f7cff'),coalesce(nullif(p_payload->>'icon',''),'vp-icon-cost'),yr,0,auth.uid(),1,
    case when exists(select 1 from jsonb_array_elements(p_payload->'months') x where x->>'type'='forms') then 'built' else 'imported' end);
   -- Explicit base wins; otherwise inherit the latest planning scenario in this org.
   source_id:=nullif(p_payload->>'base_scenario_id','')::uuid;
   if source_id is null then select id into source_id from public.forecast_scenarios where organization_id=p_org and planning_version=1 and id<>sid order by created_at desc,id limit 1;end if;
   if source_id is not null and not exists(select 1 from public.forecast_scenarios where id=source_id and organization_id=p_org) then raise exception 'Cenário base inválido';end if;
   perform public.planning_capex_inherit(p_org,sid,source_id);
   mo:=0;
   for m in select * from jsonb_array_elements(p_payload->'months') loop
     mo:=mo+1;source_id:=null;src_year:=null;
     if m->>'type'='real' then src_year:=(m->>'year')::integer;
     elsif m->>'type'='scenario' then
       source_id:=(m->>'scenario_id')::uuid;
       select reference_year into src_year from public.forecast_scenarios where id=source_id and organization_id=p_org for share;
       if not found then raise exception 'Cenário de origem inválido'; end if;
     elsif m->>'type'<>'forms' then raise exception 'Fonte inválida'; end if;
     insert into public.planning_scenario_months values(sid,p_org,mo,m->>'type',case when m->>'type'='real' then src_year end,source_id);
     if m->>'type'='real' then
       insert into public.forecast_ledger_entries(organization_id,scenario_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount,history)
       select p_org,sid,yr,mo,account_number,cost_center_id,cost_center_number,amount,'Snapshot Real '||src_year from public.actuals_ledger_entries where organization_id=p_org and reference_year=src_year and reference_month=mo;
     elsif m->>'type'='scenario' then
       insert into public.forecast_ledger_entries(organization_id,scenario_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount,history)
       select p_org,sid,yr,mo,account_number,cost_center_id,cost_center_number,amount,'Snapshot cenário '||source_id from public.forecast_ledger_entries where organization_id=p_org and scenario_id=source_id and reference_year=src_year and reference_month=mo;
     end if;
   end loop;
   update public.forecast_scenarios set cutoff_month=coalesce((select min(reference_month)-1 from public.planning_scenario_months where scenario_id=sid and source_type<>'real'),12) where id=sid;
   for item in select * from jsonb_array_elements(coalesce(p_payload->'forms','[]')) loop
     if item->>'source_form_id' is not null then fid:=public.planning_clone_form(p_org,sid,(item->>'source_form_id')::uuid,item);
     else
       fid:=gen_random_uuid();insert into public.planning_forms(id,organization_id,scenario_id,code,name) values(fid,p_org,sid,trim(item->>'code'),trim(item->>'name'));
     end if;
     if item ? 'access' then
       delete from public.planning_form_access where form_id=fid;
       for cell in select * from jsonb_array_elements(item->'access') loop
         if not exists(select 1 from public.user_profiles where organization_id=p_org and user_id=(cell->>'user_id')::uuid and is_active) then raise exception 'Pessoa inválida'; end if;
         insert into public.planning_form_access values(p_org,fid,(cell->>'user_id')::uuid,cell->>'access_mode');
       end loop;
     end if;
   end loop;
   if not exists(select 1 from public.planning_forms where scenario_id=sid and form_type='capex') then
     insert into public.planning_forms(organization_id,scenario_id,code,name,form_type) values(p_org,sid,'CPX','CAPEX · Investimentos','capex');
   end if;
   insert into public.planning_audit_log(organization_id,scenario_id,actor,action) values(p_org,sid,auth.uid(),'created');
   return jsonb_build_object('id',sid);
 end if;
 select * into s from public.forecast_scenarios where id=sid and organization_id=p_org for update;
 if not found or (s.planning_version<>1 and p_action<>'favorite') then raise exception 'Cenário de planejamento inválido'; end if;
 perform set_config('vecton.planning_write',sid::text,true);
 if p_action='lock' then
   if not public.planning_is_admin(p_org) then raise exception 'Sem permissão'; end if;
   update public.forecast_scenarios set status=case when (p_payload->>'locked')::boolean then 'locked' else 'open' end,lock_at=nullif(p_payload->>'lock_at','')::timestamptz where id=sid;
 elsif p_action<>'favorite' and (s.status='locked' or s.lock_at<=clock_timestamp()) then raise exception 'Cenário bloqueado';
 elsif p_action='favorite' then
   if not public.planning_is_admin(p_org) then raise exception 'Sem permissão'; end if;
   -- Global favorite can include other managed scenarios, so authorize each row.
   old_setting:=current_setting('vecton.planning_write',true);
   for item in select to_jsonb(x) from public.forecast_scenarios x where organization_id=p_org and is_default loop
     perform set_config('vecton.planning_write',item->>'id',true);
     update public.forecast_scenarios set is_default=false where id=(item->>'id')::uuid;
   end loop;
   perform set_config('vecton.planning_write',old_setting,true);
   update public.forecast_scenarios set is_default=coalesce((p_payload->>'enabled')::boolean,true) where id=sid;
 elsif p_action='delete_scenario' then
   if not public.planning_is_admin(p_org) or p_payload->>'confirmation' is distinct from 'REMOVER' then raise exception 'Remoção exige administrador e confirmação'; end if;
   if exists(select 1 from public.planning_scenario_months where source_scenario_id=sid and scenario_id<>sid) then raise exception 'Este cenário é fonte de outro cenário e não pode ser removido'; end if;
   delete from public.forecast_ledger_entries where scenario_id=sid;
   delete from public.planning_entries where form_id in(select id from public.planning_forms where scenario_id=sid);
   delete from public.planning_forms where scenario_id=sid;
   delete from public.forecast_scenarios where id=sid;
 elsif p_action in ('save_form','copy_form') then
   if not public.planning_is_admin(p_org) then raise exception 'Sem permissão'; end if;
   if p_action='copy_form' then fid:=public.planning_clone_form(p_org,sid,(p_payload->>'source_form_id')::uuid,p_payload||'{"copy_values":false,"copy_access":false,"status":"draft"}'::jsonb);
   else
     fid:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
     if exists(select 1 from public.planning_forms where id=fid and (organization_id<>p_org or scenario_id<>sid)) then raise exception 'Formulário inválido'; end if;
     if upper(trim(p_payload->>'code'))='CPX' and not exists(select 1 from public.planning_forms where id=fid and form_type='capex') then raise exception 'Código CPX reservado ao CAPEX';end if;
     if exists(select 1 from public.planning_forms where id=fid and form_type='capex') and p_payload->>'code' is distinct from 'CPX' then raise exception 'CAPEX usa código CPX';end if;
     if p_payload->>'status'='released' and not exists(select 1 from public.planning_forms where id=fid and form_type='capex') and not exists(select 1 from public.planning_form_lines where form_id=fid and origin='input') then raise exception 'Adicione linhas digitadas antes de liberar'; end if;
     insert into public.planning_forms(id,organization_id,scenario_id,code,name,status) values(fid,p_org,sid,trim(p_payload->>'code'),trim(p_payload->>'name'),coalesce(p_payload->>'status','draft'))
     on conflict(id) do update set code=excluded.code,name=excluded.name,status=excluded.status,revision=planning_forms.revision+1;
   end if;
 else
   fid:=(p_payload->>'form_id')::uuid;
   select * into f from public.planning_forms where id=fid and scenario_id=sid and organization_id=p_org;
   if not found then raise exception 'Formulário inválido'; end if;
   if f.form_type='capex' and p_action not in ('save_access') then raise exception 'Use as operações autorizadas do CAPEX';end if;
   if p_action='save_entries' then
     if public.planning_form_mode(fid) is distinct from 'write' then raise exception 'Sem permissão de lançamento'; end if;
     if (p_payload->>'form_revision')::integer is distinct from f.revision then raise exception 'A estrutura ou os acessos do formulário mudaram; reabra o formulário antes de salvar'; end if;
     if jsonb_typeof(p_payload->'cells') is distinct from 'array' then raise exception 'Lote inválido; máximo 5000 células'; end if;
     if jsonb_array_length(p_payload->'cells')>5000 then raise exception 'Lote inválido; máximo 5000 células'; end if;
     if exists(select 1 from jsonb_array_elements(p_payload->'cells') x group by x->>'line_id',x->>'cost_center_id',x->>'month' having count(*)>1) then raise exception 'Célula repetida no lote'; end if;
     -- Lote validado e gravado em comandos únicos (sem consulta por célula).
     if exists(select 1 from jsonb_to_recordset(p_payload->'cells') as x(line_id uuid,cost_center_id uuid,month integer,amount text,version integer)
       where x.line_id is null or x.cost_center_id is null or x.month is null
       or x.amount is null or x.amount !~ '^-?[0-9]+(\.[0-9]{1,2})?$'
       or not exists(select 1 from public.planning_form_lines l where l.id=x.line_id and l.form_id=fid and l.origin='input')
       or x.cost_center_id not in(select public.planning_cc_scope(p_org))
       or not exists(select 1 from public.planning_scenario_months mm where mm.scenario_id=sid and mm.reference_month=x.month and mm.source_type='forms')) then
       raise exception 'Célula inválida ou fora do escopo';
     end if;
     select coalesce(jsonb_agg(jsonb_build_object('line_id',x.line_id,'cost_center_id',x.cost_center_id,'month',x.month,'amount',x.amount::numeric,'version',x.version,
         'current_version',coalesce(e.row_version,0),'current_amount',e.amount)),'[]') into conflicts
       from jsonb_to_recordset(p_payload->'cells') as x(line_id uuid,cost_center_id uuid,month integer,amount text,version integer)
       left join public.planning_entries e on e.line_id=x.line_id and e.cost_center_id=x.cost_center_id and e.reference_month=x.month
       where coalesce(e.row_version,0)<>coalesce(x.version,-1);
     if jsonb_array_length(conflicts)>0 then return jsonb_build_object('ok',false,'conflicts',conflicts); end if;
     insert into public.planning_entries(organization_id,form_id,line_id,cost_center_id,reference_month,amount,updated_by)
       select p_org,fid,x.line_id,x.cost_center_id,x.month,x.amount::numeric,auth.uid()
       from jsonb_to_recordset(p_payload->'cells') as x(line_id uuid,cost_center_id uuid,month integer,amount text,version integer)
     on conflict(line_id,cost_center_id,reference_month) do update set amount=excluded.amount,row_version=planning_entries.row_version+1,updated_by=auth.uid(),updated_at=clock_timestamp();
   elsif p_action='project' then
     if public.planning_form_mode(fid) is distinct from 'write' then raise exception 'Sem permissão para integrar'; end if;
     started:=clock_timestamp();run_id:=gen_random_uuid();
     begin
       delete from public.forecast_ledger_entries where scenario_id=sid and planning_form_id in(select id from public.planning_forms where scenario_id=sid and form_type='opex');
       insert into public.forecast_ledger_entries(organization_id,scenario_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount,history,planning_form_id)
       select p_org,sid,s.reference_year,e.reference_month,a.account_number,c.id,c.cost_center_number,sum(e.amount),'Planejamento: '||pf.code,pf.id
       from public.planning_entries e join public.planning_forms pf on pf.id=e.form_id join public.planning_form_lines l on l.id=e.line_id
       join public.accounts a on a.id=l.account_id join public.cost_centers c on c.id=e.cost_center_id
       join public.planning_scenario_months m on m.scenario_id=sid and m.reference_month=e.reference_month and m.source_type='forms'
       where pf.scenario_id=sid and pf.form_type='opex' and pf.status='released' and e.organization_id=p_org and l.origin='input'
       group by e.reference_month,a.account_number,c.id,c.cost_center_number,pf.id,pf.code having sum(e.amount)<>0;
       get diagnostics affected=row_count;
     exception when others then err:=sqlerrm;
     end;
     insert into public.planning_runs(id,organization_id,scenario_id,initiated_form_id,status,started_by,started_at,rows_written,error)
     values(run_id,p_org,sid,fid,case when err is null then 'ok' else 'error' end,auth.uid(),started,case when err is null then affected else 0 end,err);
     return jsonb_build_object('ok',err is null,'run_id',run_id,'rows_written',affected,'error',err);
   else
     if not public.planning_is_admin(p_org) then raise exception 'Apenas administradores configuram formulários'; end if;
     if p_action='save_access' then
       if jsonb_typeof(p_payload->'access') is distinct from 'array' then raise exception 'Lista de acessos inválida'; end if;
       delete from public.planning_form_access where form_id=fid;
       for item in select * from jsonb_array_elements(p_payload->'access') loop
         if not exists(select 1 from public.user_profiles where organization_id=p_org and user_id=(item->>'user_id')::uuid and is_active) then raise exception 'Pessoa inválida'; end if;
         insert into public.planning_form_access values(p_org,fid,(item->>'user_id')::uuid,item->>'access_mode');
       end loop;
     elsif p_action='import_accounts' then
       affected:=coalesce((select max(seq) from public.planning_form_lines where form_id=fid),0);
       for source_id in select distinct x::uuid from jsonb_array_elements_text(p_payload->'account_ids') x loop
         if not exists(select 1 from public.accounts a join public.dre_plan_nodes d on d.account_id=a.id and d.organization_id=a.organization_id where a.id=source_id and a.organization_id=p_org and a.active and d.active and d.node_class='Analitica') then raise exception 'Conta DRE inválida'; end if;
         if not exists(select 1 from public.planning_form_lines where form_id=fid and account_id=source_id) then
           affected:=affected+1;
           insert into public.planning_form_lines(organization_id,form_id,seq,description,origin,formula_name,account_id)
           select p_org,fid,affected,account_name,'input','CTA_'||replace(id::text,'-',''),id from public.accounts where id=source_id;
         end if;
       end loop;
     elsif p_action='clear_entries' then
       if p_payload->>'confirmation' is distinct from 'APAGAR' then raise exception 'Confirmação obrigatória'; end if;
       -- Keep zero-valued cells (and increment versions) to prevent ABA conflicts.
       update public.planning_entries set amount=0,row_version=row_version+1,updated_at=clock_timestamp(),updated_by=auth.uid() where form_id=fid;
     elsif p_action in ('save_line','delete_line') then
       lid:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
       select * into oldline from public.planning_form_lines where id=lid;
       if found and oldline.form_id<>fid then raise exception 'Linha inválida'; end if;
       if oldline.id is not null and exists(select 1 from public.planning_entries where form_id=fid) then
         if p_action='delete_line' or oldline.origin is distinct from p_payload->>'origin'
         or oldline.account_id is distinct from nullif(p_payload->>'account_id','')::uuid
         or oldline.formula_name is distinct from nullif(p_payload->>'formula_name','')
         or oldline.formula_text is distinct from nullif(p_payload->>'formula_text','')
         or oldline.seq is distinct from (p_payload->>'seq')::int then raise exception 'Estrutura bloqueada: já existem valores salvos'; end if;
       end if;
       -- Mudar a sequência renumera as fórmulas que a referenciam (as referências são <seq>).
       -- A sequência nova precisa estar livre; trocar duas linhas exige passar por um número livre.
       if p_action='save_line' and oldline.id is not null and oldline.seq is distinct from (p_payload->>'seq')::int then
         if exists(select 1 from public.planning_form_lines where form_id=fid and seq=(p_payload->>'seq')::int and id<>lid) then
           raise exception 'A sequência % já está em uso por outra linha', (p_payload->>'seq')::int;
         end if;
         if oldline.origin<>'label' then
           update public.planning_form_lines set formula_text=replace(formula_text,'<'||oldline.seq||'>','<'||(p_payload->>'seq')||'>')
           where form_id=fid and origin='formula' and id<>lid and formula_text like '%<'||oldline.seq||'>%';
         end if;
       end if;
       if p_action='delete_line' then delete from public.planning_form_lines where id=lid and form_id=fid;
       else
         if p_payload->>'origin'='input' and not exists(select 1 from public.accounts a join public.dre_plan_nodes d on d.account_id=a.id and d.organization_id=a.organization_id where a.id=(p_payload->>'account_id')::uuid and a.organization_id=p_org and a.active and d.active and d.node_class='Analitica') then raise exception 'Selecione conta DRE analítica ativa'; end if;
         insert into public.planning_form_lines(id,organization_id,form_id,seq,description,origin,formula_name,formula_text,account_id,group_name,style)
         values(lid,p_org,fid,(p_payload->>'seq')::int,trim(p_payload->>'description'),p_payload->>'origin',nullif(p_payload->>'formula_name',''),nullif(p_payload->>'formula_text',''),nullif(p_payload->>'account_id','')::uuid,coalesce(p_payload->>'group_name',''),coalesce(p_payload->'style','{}'))
         on conflict(id) do update set seq=excluded.seq,description=excluded.description,origin=excluded.origin,formula_name=excluded.formula_name,formula_text=excluded.formula_text,account_id=excluded.account_id,group_name=excluded.group_name,style=excluded.style;
       end if;
       perform public.planning_validate_form(fid);
     else raise exception 'Operação desconhecida'; end if;
     update public.planning_forms set revision=revision+1 where id=fid;
   end if;
 end if;
 insert into public.planning_audit_log(organization_id,scenario_id,actor,action,details) values(p_org,sid,auth.uid(),p_action,jsonb_build_object('form_id',fid));
 return jsonb_build_object('ok',true,'id',coalesce(lid,fid,sid));
end $$;
