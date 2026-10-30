-- Importação de Planejado nos formulários: lançamento sem centro de custo, prevalência do FAT/CPX e RPCs de importação.
-- Pré-requisito: migrations 278–331. Aplicar antes de publicar os arquivos do front.
begin;

-- ── Lançamento sem centro de custo (só administrador vê e edita) ──────────────────────────────
-- A chave passa a ser linha + centro de custo (ou vazio) + mês; o NULL conta como um valor só.
alter table public.planning_entries drop constraint planning_entries_pkey;
alter table public.planning_entries alter column cost_center_id drop not null;
create unique index planning_entries_key on public.planning_entries(line_id,cost_center_id,reference_month) nulls not distinct;
alter table public.planning_entry_audit alter column cost_center_id drop not null;

drop policy planning_entries_read on public.planning_entries;
create policy planning_entries_read on public.planning_entries for select using(public.planning_form_mode(form_id) is not null
  and (cost_center_id in(select public.planning_cc_scope(organization_id)) or (cost_center_id is null and public.planning_is_admin(organization_id))));

-- ── Leitura sem centro de custo: seleção vazia (só administrador) devolve o lançamento sem centro de custo ──
create or replace function public.planning_read_form(p_org uuid,p_form uuid,p_cc_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare f public.planning_forms; nocc boolean; begin
 select * into f from public.planning_forms where id=p_form and organization_id=p_org;
 if not found or public.planning_form_mode(p_form) is null then raise exception 'Sem acesso ao formulário'; end if;
 nocc:=cardinality(p_cc_ids)=0;
 if nocc and not public.planning_is_admin(p_org) then raise exception 'Centro de custo fora do escopo'; end if;
 if cardinality(p_cc_ids)>1000 or exists(select 1 from unnest(p_cc_ids) c where c not in(select public.planning_cc_scope(p_org))) then raise exception 'Centro de custo fora do escopo'; end if;
 return jsonb_build_object('entries',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.planning_entries e where e.form_id=p_form and (e.cost_center_id=any(p_cc_ids) or (nocc and e.cost_center_id is null))),
 'copied',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select l.account_number,l.cost_center_id,l.reference_month,sum(l.amount) amount from public.forecast_ledger_entries l
 join public.planning_scenario_months m on m.scenario_id=l.scenario_id and m.reference_month=l.reference_month and m.source_type<>'forms'
 where l.scenario_id=f.scenario_id and (l.cost_center_id=any(p_cc_ids) or (nocc and l.cost_center_id is null)) group by l.account_number,l.cost_center_id,l.reference_month) x));
end $$;

-- ── planning_write: salvar e integrar lançamentos sem centro de custo (wrapper, padrão da 319) ──
alter function public.planning_write(uuid,text,uuid,jsonb) rename to planning_write_before_import;
revoke all on function public.planning_write_before_import(uuid,text,uuid,jsonb) from public,anon,authenticated;
create function public.planning_write(p_org uuid,p_action text,p_scenario uuid default null,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare fid uuid; f public.planning_forms; cells jsonb:='[]'; nocc jsonb:='[]'; conflicts jsonb; res jsonb; n int:=0; old_setting text; ck record;
begin

 -- FAT e CPX prevalecem: o servidor recusa lançar valor numa chave que eles ocupam (zerar continua permitido).
 if p_action='save_entries' and jsonb_typeof(p_payload->'cells')='array' then
   if auth.uid() is null or not public.is_org_member(p_org) then raise exception 'Sem acesso à organização'; end if;
   select a.account_number,x.month,k.source into ck
   from jsonb_to_recordset(p_payload->'cells') as x(line_id uuid,cost_center_id uuid,month integer,amount text)
   join public.planning_form_lines l on l.id=x.line_id
   join public.planning_forms pf on pf.id=l.form_id and pf.form_type='opex' and pf.scenario_id=p_scenario
   join public.accounts a on a.id=l.account_id
   join public.planning_prevailing_keys(p_scenario) k on k.account_number=a.account_number and k.reference_month=x.month and k.cost_center_id is not distinct from x.cost_center_id
   where case when x.amount ~ '^-?[0-9]+(\.[0-9]+)?$' then x.amount::numeric else 0 end<>0 limit 1;
   if found then raise exception 'Valor já alimentado pelo % (conta %, mês %)',ck.source,ck.account_number,ck.month; end if;
 end if;
 if p_action='save_entries' and jsonb_typeof(p_payload->'cells')='array'
    and exists(select 1 from jsonb_array_elements(p_payload->'cells') x where nullif(x->>'cost_center_id','') is null) then
   if auth.uid() is null or not public.planning_is_admin(p_org) then raise exception 'Célula inválida ou fora do escopo'; end if;
   fid:=nullif(p_payload->>'form_id','')::uuid;
   select * into f from public.planning_forms where id=fid and scenario_id=p_scenario and organization_id=p_org;
   if not found or f.form_type<>'opex' then raise exception 'Formulário inválido'; end if;
   perform 1 from public.forecast_scenarios where id=p_scenario for update;
   select coalesce(jsonb_agg(x),'[]') into nocc from jsonb_array_elements(p_payload->'cells') x where nullif(x->>'cost_center_id','') is null;
   select coalesce(jsonb_agg(x),'[]') into cells from jsonb_array_elements(p_payload->'cells') x where nullif(x->>'cost_center_id','') is not null;
   if exists(select 1 from jsonb_to_recordset(nocc) as x(line_id uuid,month integer,amount text,version integer)
     where x.line_id is null or x.month is null or x.amount is null or x.amount !~ '^-?[0-9]+(\.[0-9]{1,2})?$'
     or not exists(select 1 from public.planning_form_lines l where l.id=x.line_id and l.form_id=fid and l.origin='input')
     or not exists(select 1 from public.planning_scenario_months mm where mm.scenario_id=p_scenario and mm.reference_month=x.month and mm.source_type='forms')) then
     raise exception 'Célula inválida ou fora do escopo';
   end if;
   if exists(select 1 from jsonb_to_recordset(nocc) as x(line_id uuid,month integer) group by x.line_id,x.month having count(*)>1) then raise exception 'Célula repetida no lote'; end if;
   select coalesce(jsonb_agg(jsonb_build_object('line_id',x.line_id,'cost_center_id',null,'month',x.month,'amount',x.amount::numeric,'version',x.version,
       'current_version',coalesce(e.row_version,0),'current_amount',e.amount)),'[]') into conflicts
     from jsonb_to_recordset(nocc) as x(line_id uuid,month integer,amount text,version integer)
     left join public.planning_entries e on e.line_id=x.line_id and e.cost_center_id is null and e.reference_month=x.month
     where coalesce(e.row_version,0)<>coalesce(x.version,-1);
   if jsonb_array_length(conflicts)>0 then return jsonb_build_object('ok',false,'conflicts',conflicts); end if;
   res:=public.planning_write_before_import(p_org,p_action,p_scenario,jsonb_set(p_payload,'{cells}',cells));
   if coalesce((res->>'ok')::boolean,true) is false then return res; end if;
   insert into public.planning_entries(organization_id,form_id,line_id,cost_center_id,reference_month,amount,updated_by)
     select p_org,fid,x.line_id,null,x.month,x.amount::numeric,auth.uid()
     from jsonb_to_recordset(nocc) as x(line_id uuid,month integer,amount text,version integer)
   on conflict(line_id,cost_center_id,reference_month) do update set amount=excluded.amount,row_version=planning_entries.row_version+1,updated_by=auth.uid(),updated_at=clock_timestamp();
   return res;
 end if;
 res:=public.planning_write_before_import(p_org,p_action,p_scenario,p_payload);
 if p_action='project' and coalesce((res->>'ok')::boolean,false) then
   fid:=nullif(p_payload->>'form_id','')::uuid;
   if exists(select 1 from public.planning_forms where id=fid and form_type='opex') then
     old_setting:=current_setting('vecton.planning_write',true);
     perform set_config('vecton.planning_write',p_scenario::text,true);
     insert into public.forecast_ledger_entries(organization_id,scenario_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount,history,planning_form_id)
     select p_org,p_scenario,s.reference_year,e.reference_month,a.account_number,null,null,sum(e.amount),'Planejamento: '||pf.code,pf.id
     from public.planning_entries e join public.planning_forms pf on pf.id=e.form_id join public.planning_form_lines l on l.id=e.line_id
     join public.accounts a on a.id=l.account_id join public.forecast_scenarios s on s.id=p_scenario
     join public.planning_scenario_months m on m.scenario_id=p_scenario and m.reference_month=e.reference_month and m.source_type='forms'
     where pf.scenario_id=p_scenario and pf.form_type='opex' and pf.status='released' and e.organization_id=p_org and e.cost_center_id is null and l.origin='input'
     group by s.reference_year,e.reference_month,a.account_number,pf.id,pf.code having sum(e.amount)<>0;
     get diagnostics n=row_count;
     perform set_config('vecton.planning_write',coalesce(old_setting,''),true);
     res:=jsonb_set(res,'{rows_written}',to_jsonb(coalesce((res->>'rows_written')::int,0)+n));
     perform public.planning_ledger_resolve_overlaps(p_scenario);
   end if;
 end if;
 return res;
end $$;
grant execute on function public.planning_write(uuid,text,uuid,jsonb) to authenticated;

-- ── FAT e CPX prevalecem: uma chave (conta + centro de custo + mês) vale um valor só no razão ──
create function public.planning_ledger_resolve_overlaps(p_scenario uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare n integer; old_setting text; begin
 old_setting:=current_setting('vecton.planning_write',true);
 perform set_config('vecton.planning_write',p_scenario::text,true);
 delete from public.forecast_ledger_entries o using public.planning_forms of
 where o.scenario_id=p_scenario and o.planning_form_id=of.id and of.form_type='opex'
 and exists(select 1 from public.forecast_ledger_entries x join public.planning_forms xf on xf.id=x.planning_form_id and xf.form_type in('fat','capex')
   where x.scenario_id=p_scenario and x.account_number=o.account_number and x.reference_month=o.reference_month and x.cost_center_id is not distinct from o.cost_center_id);
 get diagnostics n=row_count;
 perform set_config('vecton.planning_write',coalesce(old_setting,''),true);
 return n;
end $$;
revoke all on function public.planning_ledger_resolve_overlaps(uuid) from public,anon,authenticated;

alter function public.planning_integrate_all(uuid,uuid,uuid) rename to planning_integrate_all_before_import;
revoke all on function public.planning_integrate_all_before_import(uuid,uuid,uuid) from public,anon,authenticated;
create function public.planning_integrate_all(p_org uuid,p_scenario uuid,p_form uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare res jsonb; begin
 res:=public.planning_integrate_all_before_import(p_org,p_scenario,p_form);
 perform public.planning_ledger_resolve_overlaps(p_scenario);
 return res;
end $$;
grant execute on function public.planning_integrate_all(uuid,uuid,uuid) to authenticated;

alter function public.planning_fat_write(uuid,text,uuid,jsonb) rename to planning_fat_write_before_import;
revoke all on function public.planning_fat_write_before_import(uuid,text,uuid,jsonb) from public,anon,authenticated;
create function public.planning_fat_write(p_org uuid,p_action text,p_scenario uuid,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare res jsonb; begin
 res:=public.planning_fat_write_before_import(p_org,p_action,p_scenario,p_payload);
 if p_action='project' then perform public.planning_ledger_resolve_overlaps(p_scenario); end if;
 return res;
end $$;
grant execute on function public.planning_fat_write(uuid,text,uuid,jsonb) to authenticated;

alter function public.planning_capex_write(uuid,text,uuid,jsonb) rename to planning_capex_write_before_import;
revoke all on function public.planning_capex_write_before_import(uuid,text,uuid,jsonb) from public,anon,authenticated;
create function public.planning_capex_write(p_org uuid,p_action text,p_scenario uuid,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare res jsonb; begin
 res:=public.planning_capex_write_before_import(p_org,p_action,p_scenario,p_payload);
 if p_action='project' then perform public.planning_ledger_resolve_overlaps(p_scenario); end if;
 return res;
end $$;
grant execute on function public.planning_capex_write(uuid,text,uuid,jsonb) to authenticated;

-- ── Chaves que o FAT e o CPX ocupam (calculadas e já integradas) ──
create function public.planning_prevailing_keys(p_scenario uuid) returns table(account_number text,cost_center_id uuid,reference_month integer,source text)
language sql stable security definer set search_path=public as $$
 select d.account_number,null::uuid,d.reference_month,'FAT'::text
   from public.planning_fat_calculate((select id from public.planning_forms where scenario_id=p_scenario and form_type='fat' and status='released')) d
 union
 select x.account_number,x.cost_center_id,x.reference_month,'FAT'
   from public.forecast_ledger_entries x join public.planning_forms f on f.id=x.planning_form_id and f.form_type='fat' where x.scenario_id=p_scenario
 union
 select d.account_number,d.cost_center_id,d.reference_month,'CPX'
   from public.planning_capex_calculate((select id from public.planning_forms where scenario_id=p_scenario and form_type='capex' and status='released')) d where d.amount<>0
 union
 select x.account_number,x.cost_center_id,x.reference_month,'CPX'
   from public.forecast_ledger_entries x join public.planning_forms f on f.id=x.planning_form_id and f.form_type='capex' where x.scenario_id=p_scenario;
$$;
revoke all on function public.planning_prevailing_keys(uuid) from public,anon,authenticated;


create function public.planning_import_stage(p_org uuid,p_form uuid,p_rows jsonb)
returns table(rn int,account text,month int,month_text text,amount text,cc_number text,acc_id uuid,line_id uuid,cc_id uuid)
language sql stable security definer set search_path=public as $$
select x."row",nullif(trim(x.account),''),case when trim(x.month) ~ '^[0-9]{1,3}$' then trim(x.month)::int end,nullif(trim(x.month),''),nullif(trim(x.amount),''),nullif(trim(x.cost_center),''),
   a.id,(select l.id from public.planning_form_lines l where l.form_id=p_form and l.account_id=a.id and l.origin='input' order by l.seq limit 1),c.id
 from jsonb_to_recordset(p_rows) as x("row" int,account text,month text,amount text,cost_center text)
 left join public.accounts a on a.organization_id=p_org and a.account_number=nullif(trim(x.account),'')
 left join public.cost_centers c on c.organization_id=p_org and c.cost_center_number=nullif(trim(x.cost_center),'');
$$;
revoke all on function public.planning_import_stage(uuid,uuid,jsonb) from public,anon,authenticated;

-- ── Importação em lote de um formulário (só administrador; qualquer erro bloqueia o arquivo inteiro) ──
-- p_rows: [{row, account, month, amount, cost_center}]; amount já normalizado (ex. "1234.56").
create function public.planning_import_entries(p_org uuid,p_form uuid,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare f public.planning_forms; errs jsonb; replaced int:=0; inserted int:=0; total int; begin
 if auth.uid() is null or not public.planning_is_admin(p_org) then raise exception 'Somente o administrador importa'; end if;
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
 select count(*) into replaced from public.planning_import_stage(p_org,p_form,p_rows) s join public.planning_entries e on e.line_id=s.line_id and e.cost_center_id is not distinct from s.cc_id and e.reference_month=s.month;
 inserted:=total-replaced;
 insert into public.planning_entries(organization_id,form_id,line_id,cost_center_id,reference_month,amount,updated_by)
   select p_org,p_form,s.line_id,s.cc_id,s.month,s.amount::numeric,auth.uid() from public.planning_import_stage(p_org,p_form,p_rows) s
 on conflict(line_id,cost_center_id,reference_month) do update set amount=excluded.amount,row_version=planning_entries.row_version+1,updated_by=auth.uid(),updated_at=clock_timestamp();
 return jsonb_build_object('ok',true,'replaced',replaced,'inserted',inserted);
end $$;
grant execute on function public.planning_import_entries(uuid,uuid,jsonb) to authenticated;

-- ── Alertas: chaves de lançamento que o FAT/CPX ocupam (digitação e integração) ──
-- Células [{line_id,cost_center_id,month,amount}] de um formulário OPEX cuja chave (conta + centro de custo + mês) o FAT ou o CPX já ocupa.
create function public.planning_key_conflicts(p_org uuid,p_form uuid,p_cells jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare f public.planning_forms; begin
 select * into f from public.planning_forms where id=p_form and organization_id=p_org;
 if not found or f.form_type<>'opex' or public.planning_form_mode(p_form) is distinct from 'write' then raise exception 'Sem permissão de lançamento'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('account_number',a.account_number,'month',x.month,'cost_center_number',c.cost_center_number,'source',k.source) order by x.month,a.account_number),'[]')
   from jsonb_to_recordset(p_cells) as x(line_id uuid,cost_center_id uuid,month integer,amount text)
   join public.planning_form_lines l on l.id=x.line_id and l.form_id=p_form
   join public.accounts a on a.id=l.account_id
   left join public.cost_centers c on c.id=x.cost_center_id
   join public.planning_prevailing_keys(f.scenario_id) k on k.account_number=a.account_number and k.reference_month=x.month and k.cost_center_id is not distinct from x.cost_center_id);
end $$;
grant execute on function public.planning_key_conflicts(uuid,uuid,jsonb) to authenticated;

-- Integração do FAT: só colide o que o 08 tem sem centro de custo (mesma chave do FAT).
create or replace function public.planning_fat_overlap(p_org uuid,p_form uuid) returns table(account_number text,months integer[])
language plpgsql stable security definer set search_path=public as $$
begin
 if public.planning_form_mode(p_form) is distinct from 'write' or not exists(select 1 from public.planning_forms where id=p_form and organization_id=p_org and form_type='fat') then raise exception 'Sem permissão de lançamento';end if;
 return query select d.account_number,array_agg(distinct d.reference_month order by d.reference_month)
 from public.planning_fat_calculate(p_form) d join public.planning_forms f on f.id=p_form
 join public.accounts a on a.organization_id=f.organization_id and a.account_number=d.account_number
 join public.planning_form_lines l on l.account_id=a.id and l.origin='input'
 join public.planning_forms o on o.id=l.form_id and o.scenario_id=f.scenario_id and o.form_type='opex' and o.status='released'
 join public.planning_entries e on e.line_id=l.id and e.reference_month=d.reference_month and e.cost_center_id is null and e.amount<>0
 group by d.account_number order by d.account_number;
end $$;

-- Integração do CPX: contas, centros de custo e meses em que o 04 já tem valor na mesma chave da depreciação.
create function public.planning_capex_overlap(p_org uuid,p_form uuid) returns table(account_number text,months integer[])
language plpgsql stable security definer set search_path=public as $$
begin
 if public.planning_form_mode(p_form) is distinct from 'write' or not exists(select 1 from public.planning_forms where id=p_form and organization_id=p_org and form_type='capex') then raise exception 'Sem permissão de lançamento';end if;
 return query select d.account_number,array_agg(distinct d.reference_month order by d.reference_month)
 from public.planning_capex_calculate(p_form) d join public.planning_forms f on f.id=p_form
 join public.accounts a on a.organization_id=f.organization_id and a.account_number=d.account_number
 join public.planning_form_lines l on l.account_id=a.id and l.origin='input'
 join public.planning_forms o on o.id=l.form_id and o.scenario_id=f.scenario_id and o.form_type='opex' and o.status='released'
 join public.planning_entries e on e.line_id=l.id and e.reference_month=d.reference_month and e.cost_center_id=d.cost_center_id and e.amount<>0
 where d.amount<>0
 group by d.account_number order by d.account_number;
end $$;
grant execute on function public.planning_capex_overlap(uuid,uuid) to authenticated;

-- ── Importação do FAT: template da carga de planejado vendas (cod_produto, mes, territorio, quantidade, valor, MC1%) ──
-- Volume obrigatório (Peças: valor em R$); território obrigatório, exceto Peças. O modelo soma os códigos de produto
-- (quantidade arredondada; Peças soma o valor). Valor e MC1% dos demais modelos são aceitos e o FAT segue usando as premissas do formulário.
-- p_rows: [{row, cod_produto, month, territorio, quantidade, valor, mc1}].
create function public.planning_fat_import_stage(p_org uuid,p_scenario uuid,p_rows jsonb)
returns table(rn int,cod text,month int,month_text text,terr text,qty text,val text,mc text,produto_id uuid,model_key text,fat_driven boolean,terr_id uuid,region_ok boolean)
language sql stable security definer set search_path=public as $$
 select x."row",nullif(trim(x.cod_produto),''),case when trim(x.month) ~ '^[0-9]{1,3}$' then trim(x.month)::int end,nullif(trim(x.month),''),
   nullif(trim(x.territorio),''),nullif(trim(x.quantidade),''),nullif(trim(x.valor),''),nullif(trim(x.mc1),''),
   p.id,m.model_key,coalesce(m.fat_driven,false),t.id,
   (t.id is not null and exists(select 1 from public.planning_fat_regions(p_org) r where r.region_key=t.id::text))
 from jsonb_to_recordset(p_rows) as x("row" int,cod_produto text,month text,territorio text,quantidade text,valor text,mc1 text)
 left join public.comercial_produtos p on p.organization_id=p_org and p.codigo=nullif(trim(x.cod_produto),'')
 left join public.planning_fat_models m on m.scenario_id=p_scenario and p.id=any(m.product_ids)
 left join public.comercial_territorios t on t.organization_id=p_org and t.nome=nullif(trim(x.territorio),'');
$$;
revoke all on function public.planning_fat_import_stage(uuid,uuid,jsonb) from public,anon,authenticated;

create function public.planning_fat_import_cells(p_org uuid,p_scenario uuid,p_rows jsonb) returns table(region_key text,model_key text,month int,amount numeric)
language sql stable security definer set search_path=public as $$
 select case when s.fat_driven then 'PECAS' else s.terr_id::text end,s.model_key,s.month,
   case when s.fat_driven then round(sum(s.val::numeric),2) else round(sum(s.qty::numeric)) end
 from public.planning_fat_import_stage(p_org,p_scenario,p_rows) s group by 1,2,3,s.fat_driven;
$$;
revoke all on function public.planning_fat_import_cells(uuid,uuid,jsonb) from public,anon,authenticated;

create function public.planning_fat_import(p_org uuid,p_form uuid,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare f public.planning_forms; errs jsonb; replaced int; inserted int; total int; begin
 if auth.uid() is null or not public.planning_is_admin(p_org) then raise exception 'Somente o administrador importa'; end if;
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
 select count(*) into replaced from public.planning_fat_import_cells(p_org,f.scenario_id,p_rows) c join public.planning_fat_volumes v on v.form_id=p_form and v.region_key=c.region_key and v.model_key=c.model_key and v.reference_month=c.month;
 select count(*) into total from public.planning_fat_import_cells(p_org,f.scenario_id,p_rows);
 inserted:=total-replaced;
 perform set_config('vecton.planning_write',f.scenario_id::text,true);
 insert into public.planning_fat_volumes(organization_id,scenario_id,form_id,region_key,model_key,reference_month,amount)
   select p_org,f.scenario_id,p_form,c.region_key,c.model_key,c.month,c.amount from public.planning_fat_import_cells(p_org,f.scenario_id,p_rows) c
 on conflict(form_id,region_key,model_key,reference_month) do update set amount=excluded.amount,row_version=planning_fat_volumes.row_version+1;
 return jsonb_build_object('ok',true,'replaced',replaced,'inserted',inserted);
end $$;
grant execute on function public.planning_fat_import(uuid,uuid,jsonb) to authenticated;

-- ── Carga de planejado vendas (cenários sem formulário): todos os campos são obrigatórios ──
-- cod_produto, mes, territorio (exceto Peças), quantidade (exceto Peças, em valor) e valor. Cenários com formulários mantêm a regra
-- anterior no banco; a tela deixa de oferecê-los (o FAT passa a ser alimentado pelo botão Importar do formulário).
do $$
declare def text; novo text; passo record;
begin
  def := replace(pg_get_functiondef('public.validate_comercial_planejado_import_row()'::regprocedure), E'\r', '');
  novo := def;
  for passo in select * from (values
    ('declare', E'  eff_month   integer;\n', E'  eff_month   integer;\n  strict_rules boolean;\n'),
    ('lote', E'    raise exception ''Lote de importacao nao encontrado'';\n  end if;\n',
             E'    raise exception ''Lote de importacao nao encontrado'';\n  end if;\n  strict_rules := batch_rec.scenario_id is null or not exists(select 1 from public.forecast_scenarios s where s.id = batch_rec.scenario_id and coalesce(s.planning_version, 0) > 0);\n'),
    ('mes', E'  eff_month := coalesce(new.reference_month, batch_rec.reference_month);\n',
            E'  if strict_rules and new.reference_month is null then\n    error_list := error_list || jsonb_build_array(''Mes obrigatorio'');\n  end if;\n  eff_month := coalesce(new.reference_month, batch_rec.reference_month);\n'),
    ('valor', E'    new.quantidade := coalesce(new.quantidade, 0);\n    if new.valor is null then\n      error_list := error_list || jsonb_build_array(''Valor obrigatorio para Pecas'');\n    end if;\n  elsif new.quantidade is null then\n    error_list := error_list || jsonb_build_array(''Volume (quantidade) obrigatorio'');\n  end if;\n',
              E'    new.quantidade := coalesce(new.quantidade, 0);\n    if new.valor is null then\n      error_list := error_list || jsonb_build_array(''Valor obrigatorio para Pecas'');\n    end if;\n  elsif new.quantidade is null then\n    error_list := error_list || jsonb_build_array(''Volume (quantidade) obrigatorio'');\n  end if;\n  if strict_rules and tipo_nome is distinct from ''Peças'' and new.valor is null then\n    error_list := error_list || jsonb_build_array(''Valor obrigatorio'');\n  end if;\n'),
    ('territorio', E'  elsif linha_nome is not null and linha_nome not in (''Peças'', ''Outros'') then\n',
                   E'  elsif tipo_nome is not null and tipo_nome <> ''Peças'' and (strict_rules or (linha_nome is not null and linha_nome not in (''Peças'', ''Outros''))) then\n')
  ) as t(nome, de, para) loop
    if position(passo.de in novo) = 0 then raise exception 'Trecho nao encontrado na funcao de validacao do planejado: %', passo.nome; end if;
    novo := replace(novo, passo.de, passo.para);
  end loop;
  execute novo;
end $$;

-- ── Grants: só usuário autenticado executa (padrão das migrations 319/322) ──
revoke all on function public.planning_write(uuid,text,uuid,jsonb),public.planning_integrate_all(uuid,uuid,uuid),public.planning_fat_write(uuid,text,uuid,jsonb),
  public.planning_capex_write(uuid,text,uuid,jsonb),public.planning_import_entries(uuid,uuid,jsonb),public.planning_fat_import(uuid,uuid,jsonb),
  public.planning_key_conflicts(uuid,uuid,jsonb),public.planning_capex_overlap(uuid,uuid),public.planning_fat_overlap(uuid,uuid),public.planning_read_form(uuid,uuid,uuid[])
  from public,anon;
grant execute on function public.planning_write(uuid,text,uuid,jsonb),public.planning_integrate_all(uuid,uuid,uuid),public.planning_fat_write(uuid,text,uuid,jsonb),
  public.planning_capex_write(uuid,text,uuid,jsonb),public.planning_import_entries(uuid,uuid,jsonb),public.planning_fat_import(uuid,uuid,jsonb),
  public.planning_key_conflicts(uuid,uuid,jsonb),public.planning_capex_overlap(uuid,uuid),public.planning_fat_overlap(uuid,uuid),public.planning_read_form(uuid,uuid,uuid[]) to authenticated;

commit;
