-- FAT: cálculo para o ledger, leitura e escrita autorizadas, sobreposição com o 08 e integração.
begin;

-- Base do cálculo: uma linha por região × modelo × mês com FAT, MP e impostos (zero em Exportação).
-- Só meses com fonte formulário; modelo sem premissa (nem local nem Marcher) é ignorado.
create function public.planning_fat_base(p_form uuid,p_cells jsonb default '[]')
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
   join public.planning_fat_taxes t on t.scenario_id=f.scenario_id and t.line=case m.group_name when 'Transgrain' then 'tra' when 'Linhas complementares' then 'pec' else 'maq' end
   left join lateral (select cc.id,cc.nome from coord cc where cc.line=public.planning_fat_line_of(m.group_name)
     and cc.territorio_id is not distinct from (case when v.region_key='PECAS' then null else v.region_key::uuid end) limit 1) c on true
   where v.amount>0 and (pl.region_key is not null or pm.region_key is not null))
 select b.region_key,b.model_key,b.reference_month,b.group_name,b.fat_driven,b.exp,b.coordination_id,b.q,b.fat,b.mp,
   case when b.exp then 0 else b.fat*b.ipi/100 end,case when b.exp then 0 else b.fat*b.icms/100 end,
   case when b.exp then 0 else b.fat*b.pis/100 end,case when b.exp then 0 else b.fat*b.cofins/100 end from b;
$$;

-- Cálculo interno (quem chama valida formulário, escopo e rascunho). Receita negativa; impostos e MP positivos.
-- Conta × mês, sem centro de custo; arredonda DEPOIS de agrupar.
create function public.planning_fat_calculate(p_form uuid,p_cells jsonb default '[]') returns table(account_number text,reference_month integer,amount numeric)
language sql stable security definer set search_path=public as $$
 select a.acct,b.reference_month,round(sum(a.amt),2) from public.planning_fat_base(p_form,p_cells) b cross join lateral (values
   (case when b.exp then '31101002' when b.group_name='Transgrain' then '31101007' when b.group_name='Linhas complementares' then '31101006' else '31101001' end,-b.fat),
   ('31203001',b.ipi),('31203002',b.icms),('31203004',b.cofins),('31203005',b.pis),('412010901',b.mp)) a(acct,amt)
 group by a.acct,b.reference_month having round(sum(a.amt),2)<>0;
$$;

-- Meta por modelo × território × coordenação × mês (Peças: volume = 1 por mês).
create function public.planning_fat_meta_rows(p_form uuid) returns table(model_key text,territory_id uuid,coordination_id uuid,reference_month integer,volume numeric,fat numeric,rl numeric,mp numeric)
language sql stable security definer set search_path=public as $$
 select b.model_key,case when b.region_key='PECAS' then null else b.region_key::uuid end,b.coordination_id,b.reference_month,
  sum(case when b.fat_driven then 1 else b.q end),round(sum(b.fat),2),round(sum(b.fat-b.ipi-b.icms-b.pis-b.cofins),2),round(sum(b.mp),2)
 from public.planning_fat_base(p_form) b group by 1,2,3,4 having round(sum(b.fat),2)<>0;
$$;

-- Contas e meses em que o FAT vai gravar e algum formulário OPEX liberado do cenário já tem valor salvo na mesma conta.
create function public.planning_fat_overlap(p_org uuid,p_form uuid) returns table(account_number text,months integer[])
language plpgsql stable security definer set search_path=public as $$
begin
 if public.planning_form_mode(p_form) is distinct from 'write' or not exists(select 1 from public.planning_forms where id=p_form and organization_id=p_org and form_type='fat') then raise exception 'Sem permissão de lançamento';end if;
 return query select d.account_number,array_agg(distinct d.reference_month order by d.reference_month)
 from public.planning_fat_calculate(p_form) d join public.planning_forms f on f.id=p_form
 join public.accounts a on a.organization_id=f.organization_id and a.account_number=d.account_number
 join public.planning_form_lines l on l.account_id=a.id and l.origin='input'
 join public.planning_forms o on o.id=l.form_id and o.scenario_id=f.scenario_id and o.form_type='opex' and o.status='released'
 join public.planning_entries e on e.line_id=l.id and e.reference_month=d.reference_month and e.amount<>0
 group by d.account_number order by d.account_number;
end $$;
revoke all on function public.planning_fat_base(uuid,jsonb),public.planning_fat_calculate(uuid,jsonb),public.planning_fat_meta_rows(uuid) from public,anon,authenticated;
revoke all on function public.planning_fat_overlap(uuid,uuid) from public,anon;
grant execute on function public.planning_fat_overlap(uuid,uuid) to authenticated;
-- Modo do formulário: o FAT usa a matriz de acessos por região (write se houver alguma região com escrita).
create or replace function public.planning_form_mode(p_form uuid) returns text
language sql stable security definer set search_path=public as $$
 select case when public.planning_is_admin(f.organization_id) then 'write'
 when f.status='released' and f.form_type='fat' then (select case when count(*)=0 then null when bool_or(a.access_mode='write') then 'write' else 'read' end
   from public.planning_fat_access a where a.form_id=f.id and a.user_id=auth.uid())
 when f.status='released' and (case when f.form_type='capex'
 then exists(select 1 from public.planning_capex_cc_scope(f.organization_id))
 else exists(select 1 from public.planning_cc_scope(f.organization_id)) end)
 then (select a.access_mode from public.planning_form_access a where a.form_id=f.id and a.user_id=auth.uid()) end
 from public.planning_forms f where f.id=p_form and public.is_org_member(f.organization_id);
$$;

create function public.planning_fat_region_mode(p_form uuid,p_region text) returns text
language sql stable security definer set search_path=public as $$
 select case when public.planning_is_admin(f.organization_id) then 'write'
 when f.status='released' then (select a.access_mode from public.planning_fat_access a where a.form_id=f.id and a.user_id=auth.uid() and a.region_key=p_region) end
 from public.planning_forms f where f.id=p_form and f.form_type='fat' and public.is_org_member(f.organization_id);
$$;

-- Leitura: só as regiões autorizadas; o histórico das premissas e os ajustes só chegam ao admin.
create function public.planning_fat_read(p_org uuid,p_form uuid,p_asof date default current_date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare f public.planning_forms;sc public.forecast_scenarios;adm boolean:=public.planning_is_admin(p_org);regs text[];lastwin integer[];newest integer;
 cur integer:=extract(year from p_asof)::integer*100+extract(month from p_asof)::integer;
begin
 select * into f from public.planning_forms where id=p_form and organization_id=p_org and form_type='fat';
 if not found or public.planning_form_mode(p_form) is null then raise exception 'Sem acesso ao formulário';end if;
 select * into sc from public.forecast_scenarios where id=f.scenario_id;
 select coalesce(array_agg(r.region_key),'{}') into regs from public.planning_fat_regions(p_org) r
  where adm or exists(select 1 from public.planning_fat_access a where a.form_id=p_form and a.user_id=auth.uid() and a.region_key=r.region_key);
 select window_months into lastwin from public.planning_fat_premise_runs where scenario_id=f.scenario_id order by run_at desc limit 1;
 select max(z.ym) into newest from (select le.reference_year*100+le.reference_month ym from public.comercial_realizado_ledger_entries le
  join (select unnest(x.product_ids) produto_id from public.planning_fat_models x where x.scenario_id=f.scenario_id) m on m.produto_id=le.produto_id
  where le.organization_id=p_org and le.origem='FAT' and le.reference_year*100+le.reference_month<cur and le.reference_year*100+le.reference_month>=cur-200 group by 1 having sum(le.quantidade)>0) z;
 return jsonb_build_object('revision',f.revision,'status',f.status,'year',sc.reference_year,'window_months',to_jsonb(coalesce(lastwin,'{}')),
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
  'access',(select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'region_key',a.region_key,'access_mode',a.access_mode)),'[]') from public.planning_fat_access a where a.form_id=p_form and adm),
  'taxes',(select coalesce(jsonb_agg(jsonb_build_object('line',t.line,'ipi',t.ipi,'icms',t.icms,'pis',t.pis,'cofins',t.cofins,'version',t.row_version) order by t.line),'[]') from public.planning_fat_taxes t where t.scenario_id=f.scenario_id),
  'history',(select coalesce(jsonb_agg(jsonb_build_object('region_key',h.rk,'model_key',h.model_key,'year',h.y,'qty',h.q,'fat',h.f,'rl',h.r,'mp',h.p)),'[]') from (
    select case when m.fat_driven then 'PECAS' else le.territorio_id::text end rk,m.model_key,le.reference_year y,
     case when m.fat_driven then count(distinct le.reference_month) else sum(le.quantidade) end q,sum(le.valor) f,sum(coalesce(le.rl,0)) r,sum(coalesce(le.mp,0)) p
    from (select x.model_key,x.fat_driven,x.scenario_id,unnest(x.product_ids) produto_id from public.planning_fat_models x where x.scenario_id=f.scenario_id) m join public.comercial_realizado_ledger_entries le on le.organization_id=p_org and le.origem='FAT' and le.produto_id=m.produto_id
     and le.reference_year in(sc.reference_year-2,sc.reference_year-1)
    where m.scenario_id=f.scenario_id and ((m.fat_driven and 'PECAS'=any(regs)) or (not m.fat_driven and le.territorio_id::text=any(regs))) group by 1,2,3,m.fat_driven) h));
end $$;

-- Escrita autorizada do FAT.
create function public.planning_fat_write(p_org uuid,p_action text,p_scenario uuid,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.forecast_scenarios;f public.planning_forms;fid uuid;cells jsonb;conflicts jsonb;res jsonb;acc jsonb;pm public.planning_fat_premises;
 rk text;mk text;ln text;rid uuid;started timestamptz;err text;affected int:=0;pend int:=0;skip int:=0;
begin
 if auth.uid() is null or not public.is_org_member(p_org) then raise exception 'Sem acesso à organização';end if;
 select * into s from public.forecast_scenarios where id=p_scenario and organization_id=p_org and planning_version=1 for update;
 if not found then raise exception 'Cenário inválido';end if;
 if s.status='locked' or s.lock_at<=clock_timestamp() then raise exception 'Cenário bloqueado';end if;
 perform set_config('vecton.planning_write',s.id::text,true);
 fid:=(p_payload->>'form_id')::uuid;
 select * into f from public.planning_forms where id=fid and scenario_id=s.id and organization_id=p_org and form_type='fat';
 if not found then raise exception 'Formulário inválido';end if;
 if p_action in ('save_taxes','refresh_premises','adjust_premise','clear_adjust','set_status','save_access') then
   if not public.planning_is_admin(p_org) then raise exception 'Apenas administradores configuram o FAT';end if;
   if p_action='save_taxes' then
     ln:=p_payload->>'line';
     if exists(select 1 from(values(p_payload->>'ipi'),(p_payload->>'icms'),(p_payload->>'pis'),(p_payload->>'cofins')) v(x) where v.x is null or v.x !~ '^[0-9]+(\.[0-9]{1,4})?$' or v.x::numeric>100) then raise exception 'Percentual inválido';end if;
     if exists(select 1 from public.planning_fat_taxes where scenario_id=s.id and line=ln) and (p_payload->>'version')::int is distinct from (select row_version from public.planning_fat_taxes where scenario_id=s.id and line=ln) then raise exception 'Parâmetros mudaram; reabra a tela';end if;
     insert into public.planning_fat_taxes(organization_id,scenario_id,line,ipi,icms,pis,cofins) values(p_org,s.id,ln,(p_payload->>'ipi')::numeric,(p_payload->>'icms')::numeric,(p_payload->>'pis')::numeric,(p_payload->>'cofins')::numeric)
     on conflict(scenario_id,line) do update set ipi=excluded.ipi,icms=excluded.icms,pis=excluded.pis,cofins=excluded.cofins,row_version=planning_fat_taxes.row_version+1;
   elsif p_action='refresh_premises' then
     res:=public.planning_fat_calc_premises(p_org,s.id,coalesce(nullif(p_payload->>'asof','')::date,current_date));
     return res||jsonb_build_object('ok',true);
   elsif p_action in ('adjust_premise','clear_adjust') then
     rk:=p_payload->>'region_key';mk:=p_payload->>'model_key';
     if p_action='adjust_premise' and ((p_payload->>'adj_fat') is not null and (p_payload->>'adj_fat') !~ '^[0-9]+(\.[0-9]{1,6})?$' or (p_payload->>'adj_mp') is not null and (p_payload->>'adj_mp') !~ '^[0-9]+(\.[0-9]{1,6})?$') then raise exception 'Valor de premissa inválido';end if;
     if not exists(select 1 from public.planning_fat_models m where m.scenario_id=s.id and m.model_key=mk) or rk not in(select r.region_key from public.planning_fat_regions(p_org) r) then raise exception 'Região ou modelo fora do cadastro';end if;
     if not exists(select 1 from public.planning_fat_premises where scenario_id=s.id and region_key=rk and model_key=mk) then
       if p_action='clear_adjust' then raise exception 'Sem premissa para ajustar';end if;
       select * into pm from public.planning_fat_premises where scenario_id=s.id and region_key='marcher' and model_key=mk;
       if not found and ((p_payload->>'adj_fat') is null or (p_payload->>'adj_mp') is null) then raise exception 'Sem histórico do modelo: informe os dois valores (FAT/un e MP/un)';end if;
       insert into public.planning_fat_premises(organization_id,scenario_id,region_key,model_key,fat_unit,mp_unit,origin,window_months,adj_fat,adj_mp)
       values(p_org,s.id,rk,mk,coalesce(pm.fat_unit,(p_payload->>'adj_fat')::numeric),coalesce(pm.mp_unit,(p_payload->>'adj_mp')::numeric),'local','{}',nullif(p_payload->>'adj_fat','')::numeric,nullif(p_payload->>'adj_mp','')::numeric);
       return jsonb_build_object('ok',true);
     end if;
     if (p_payload->>'version')::int is distinct from (select row_version from public.planning_fat_premises where scenario_id=s.id and region_key=rk and model_key=mk) then raise exception 'Premissa mudou; reabra a tela';end if;
     if p_action='clear_adjust' and exists(select 1 from public.planning_fat_premises where scenario_id=s.id and region_key=rk and model_key=mk and window_months='{}') then
       delete from public.planning_fat_premises where scenario_id=s.id and region_key=rk and model_key=mk;
       return jsonb_build_object('ok',true);
     end if;
     update public.planning_fat_premises set adj_fat=case when p_action='clear_adjust' then null else nullif(p_payload->>'adj_fat','')::numeric end,
       adj_mp=case when p_action='clear_adjust' then null else nullif(p_payload->>'adj_mp','')::numeric end,row_version=row_version+1 where scenario_id=s.id and region_key=rk and model_key=mk;
   elsif p_action='set_status' then
     if p_payload->>'status' not in ('draft','released') then raise exception 'Situação inválida';end if;
     if p_payload->>'status'='released' and not exists(select 1 from public.planning_fat_premise_runs where scenario_id=s.id) then perform public.planning_fat_calc_premises(p_org,s.id,current_date);end if;
     update public.planning_forms set status=p_payload->>'status',revision=revision+1 where id=fid;
   else
     acc:=p_payload->'access';
     if jsonb_typeof(acc) is distinct from 'array' or jsonb_array_length(acc)>2000 then raise exception 'Matriz de acessos inválida';end if;
     if exists(select 1 from jsonb_to_recordset(acc) x(user_id uuid,region_key text,access_mode text) where x.access_mode not in('read','write')
        or not exists(select 1 from public.user_profiles u where u.organization_id=p_org and u.user_id=x.user_id and u.is_active)
        or x.region_key not in(select r.region_key from public.planning_fat_regions(p_org) r)) then raise exception 'Acesso inválido: pessoa ou região fora do cadastro';end if;
     delete from public.planning_fat_access where form_id=fid;
     insert into public.planning_fat_access(organization_id,form_id,user_id,region_key,access_mode) select distinct p_org,fid,x.user_id,x.region_key,x.access_mode from jsonb_to_recordset(acc) x(user_id uuid,region_key text,access_mode text);
     update public.planning_forms set revision=revision+1 where id=fid;
   end if;
   return jsonb_build_object('ok',true);
 elsif p_action='save_volumes' then
   if (p_payload->>'form_revision')::int is distinct from f.revision then raise exception 'A estrutura ou os acessos mudaram; reabra o formulário';end if;
   cells:=p_payload->'cells';
   if jsonb_typeof(cells) is distinct from 'array' or jsonb_array_length(cells)>5000 then raise exception 'Lote inválido; máximo 5000 células';end if;
   if exists(select 1 from jsonb_array_elements(cells) x group by x->>'region_key',x->>'model_key',x->>'month' having count(*)>1) then raise exception 'Célula repetida no lote';end if;
   if exists(select 1 from jsonb_to_recordset(cells) x(region_key text,model_key text,month int,amount text,version int)
     where x.amount is null or x.amount !~ (case when x.region_key='PECAS' then '^[0-9]+(\.[0-9]{1,2})?$' else '^[0-9]+$' end) or x.month is null or x.version is null
     or not exists(select 1 from public.planning_fat_models m where m.scenario_id=s.id and m.model_key=x.model_key and m.fat_driven=(x.region_key='PECAS'))
     or x.region_key not in(select r.region_key from public.planning_fat_regions(p_org) r)
     or not exists(select 1 from public.planning_scenario_months sm where sm.scenario_id=s.id and sm.reference_month=x.month and sm.source_type='forms')) then raise exception 'Célula inválida ou fora do escopo; verifique região, modelo e mês';end if;
   if exists(select 1 from jsonb_to_recordset(cells) x(region_key text,model_key text,month int,amount text,version int) where public.planning_fat_region_mode(fid,x.region_key) is distinct from 'write') then raise exception 'Sem permissão de lançamento na região';end if;
   select coalesce(jsonb_agg(jsonb_build_object('region_key',x.region_key,'model_key',x.model_key,'month',x.month,'amount',x.amount,'current_amount',v.amount,'current_version',coalesce(v.row_version,0))),'[]') into conflicts
   from jsonb_to_recordset(cells) x(region_key text,model_key text,month int,amount text,version int)
   left join public.planning_fat_volumes v on v.form_id=fid and v.region_key=x.region_key and v.model_key=x.model_key and v.reference_month=x.month where coalesce(v.row_version,0)<>x.version;
   if jsonb_array_length(conflicts)>0 then return jsonb_build_object('ok',false,'conflicts',conflicts);end if;
   insert into public.planning_fat_volumes(organization_id,scenario_id,form_id,region_key,model_key,reference_month,amount)
   select p_org,s.id,fid,x.region_key,x.model_key,x.month,x.amount::numeric from jsonb_to_recordset(cells) x(region_key text,model_key text,month int,amount text)
   on conflict(form_id,region_key,model_key,reference_month) do update set amount=excluded.amount,row_version=planning_fat_volumes.row_version+1;
   return jsonb_build_object('ok',true);
 elsif p_action='project' then
   if public.planning_form_mode(fid) is distinct from 'write' then raise exception 'Sem permissão de lançamento';end if;
   if f.status<>'released' then raise exception 'Libere o formulário antes de integrar';end if;
   rid:=gen_random_uuid();started:=clock_timestamp();
   begin
     select count(*) into pend from (select distinct v.region_key,v.model_key from public.planning_fat_volumes v where v.form_id=fid and v.amount>0
       and exists(select 1 from public.planning_fat_regions(p_org) r where r.region_key=v.region_key)
       and not exists(select 1 from public.planning_fat_premises p where p.scenario_id=s.id and p.model_key=v.model_key and p.region_key in(v.region_key,'marcher'))) z;
     select count(*) into skip from (select distinct v.region_key,v.model_key from public.planning_fat_volumes v where v.form_id=fid and v.amount>0
       and not exists(select 1 from public.planning_fat_regions(p_org) r where r.region_key=v.region_key)) z;
     delete from public.forecast_ledger_entries l using public.planning_forms pf where l.scenario_id=s.id and l.planning_form_id=pf.id and pf.form_type='fat';
     insert into public.forecast_ledger_entries(organization_id,scenario_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount,history,planning_form_id)
     select p_org,s.id,s.reference_year,d.reference_month,d.account_number,null,null,d.amount,'FAT: '||f.code,fid from public.planning_fat_calculate(fid) d;
     get diagnostics affected=row_count;
     delete from public.planning_fat_meta where scenario_id=s.id;
     insert into public.planning_fat_meta(organization_id,scenario_id,model_key,territory_id,coordination_id,reference_month,volume,fat,rl,mp)
     select p_org,s.id,m.model_key,m.territory_id,m.coordination_id,m.reference_month,m.volume,m.fat,m.rl,m.mp from public.planning_fat_meta_rows(fid) m;
   exception when others then err:=sqlerrm;affected:=0;
   end;
   insert into public.planning_runs(id,organization_id,scenario_id,initiated_form_id,status,started_by,started_at,rows_written,error,details)
   values(rid,p_org,s.id,fid,case when err is null then 'ok' else 'error' end,auth.uid(),started,affected,err,jsonb_build_object('form_type','fat','pending',pend,'skipped',skip));
   insert into public.planning_audit_log(organization_id,scenario_id,actor,action,details) values(p_org,s.id,auth.uid(),'fat_project',jsonb_build_object('run_id',rid,'rows_written',affected,'error',err,'pending',pend,'skipped',skip));
   return jsonb_build_object('ok',err is null,'rows_written',affected,'error',err,'pending',pend,'skipped',skip);
 else raise exception 'Operação FAT desconhecida';end if;
end $$;

revoke all on function public.planning_fat_region_mode(uuid,text),public.planning_form_mode(uuid) from public,anon;
grant execute on function public.planning_form_mode(uuid) to authenticated;
revoke all on function public.planning_fat_read(uuid,uuid,date),public.planning_fat_write(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.planning_fat_read(uuid,uuid,date),public.planning_fat_write(uuid,text,uuid,jsonb) to authenticated;

commit;
