-- FAT (projeção de vendas do Planejamento): tipo de formulário, tabelas privadas, regiões e modelos.
-- Região = território (cadastro de Atribuições). Peças é a região sem território (chave 'PECAS').
begin;
alter table public.planning_forms drop constraint planning_forms_form_type_check;
alter table public.planning_forms add constraint planning_forms_form_type_check check(form_type in ('opex','capex','fat'));
create unique index planning_one_fat on public.planning_forms(scenario_id) where form_type='fat';

create table public.planning_fat_models (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 scenario_id uuid not null references public.forecast_scenarios(id) on delete cascade,
 model_key text not null check(length(trim(model_key)) between 1 and 80),
 group_name text not null check(group_name in ('Grãos','Pecuária','Cargograin','Transgrain','Linhas complementares')),
 sort integer not null default 0,
 fat_driven boolean not null default false,
 product_ids uuid[] not null default '{}',
 unique(scenario_id,model_key)
);
create table public.planning_fat_volumes (
 organization_id uuid not null references public.organizations(id),
 scenario_id uuid not null references public.forecast_scenarios(id) on delete cascade,
 form_id uuid not null references public.planning_forms(id) on delete cascade,
 region_key text not null,
 model_key text not null,
 reference_month integer not null check(reference_month between 1 and 12),
 amount numeric(18,4) not null check(amount>=0),
 row_version integer not null default 1,
 primary key(form_id,region_key,model_key,reference_month)
);
create table public.planning_fat_premises (
 organization_id uuid not null references public.organizations(id),
 scenario_id uuid not null references public.forecast_scenarios(id) on delete cascade,
 region_key text not null,
 model_key text not null,
 fat_unit numeric(18,6) not null,
 mp_unit numeric(18,6) not null,
 origin text not null check(origin in ('local','marcher')),
 window_months integer[] not null default '{}',
 adj_fat numeric(18,6),
 adj_mp numeric(18,6),
 calculated_at timestamptz not null default clock_timestamp(),
 row_version integer not null default 1,
 primary key(scenario_id,region_key,model_key)
);
create table public.planning_fat_taxes (
 organization_id uuid not null references public.organizations(id),
 scenario_id uuid not null references public.forecast_scenarios(id) on delete cascade,
 line text not null check(line in ('maq','tra','pec')),
 ipi numeric(7,4) not null default 0 check(ipi>=0),
 icms numeric(7,4) not null default 0 check(icms>=0),
 pis numeric(7,4) not null default 0 check(pis>=0),
 cofins numeric(7,4) not null default 0 check(cofins>=0),
 row_version integer not null default 1,
 primary key(scenario_id,line)
);
create table public.planning_fat_access (
 organization_id uuid not null references public.organizations(id),
 form_id uuid not null references public.planning_forms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 region_key text not null,
 access_mode text not null check(access_mode in ('read','write')),
 primary key(form_id,user_id,region_key)
);
create table public.planning_fat_premise_runs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 scenario_id uuid not null references public.forecast_scenarios(id) on delete cascade,
 user_id uuid references auth.users(id),
 run_at timestamptz not null default clock_timestamp(),
 window_months integer[] not null default '{}',
 rows_written integer not null default 0
);
-- Meta comercial por modelo (o Painel de Vendas passará a ler esta tabela em plano à parte).
create table public.planning_fat_meta (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 scenario_id uuid not null references public.forecast_scenarios(id) on delete cascade,
 model_key text not null,
 territory_id uuid,
 coordination_id uuid,
 reference_month integer not null check(reference_month between 1 and 12),
 volume numeric(18,4) not null,
 fat numeric(18,2) not null,
 rl numeric(18,2) not null,
 mp numeric(18,2) not null
);
create unique index planning_fat_meta_key on public.planning_fat_meta(scenario_id,model_key,coalesce(territory_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(coordination_id,'00000000-0000-0000-0000-000000000000'::uuid),reference_month);

-- Nenhuma rota direta de tabela: tudo passa pelas funções autorizadas.
do $$declare t text;begin
 foreach t in array array['planning_fat_models','planning_fat_volumes','planning_fat_premises','planning_fat_taxes','planning_fat_access','planning_fat_premise_runs','planning_fat_meta'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;

create function public.planning_fat_audit() returns trigger
language plpgsql security definer set search_path=public as $$
declare r jsonb;begin
 r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 insert into public.planning_audit_log(organization_id,scenario_id,actor,action,details)
 values((r->>'organization_id')::uuid,(r->>'scenario_id')::uuid,auth.uid(),'fat_'||lower(tg_op),jsonb_build_object('table',tg_table_name,
 'old',case when tg_op<>'INSERT' then to_jsonb(old) end,'new',case when tg_op<>'DELETE' then to_jsonb(new) end));
 return null;
end $$;
create trigger fat_volumes_audit after insert or update or delete on public.planning_fat_volumes for each row execute function public.planning_fat_audit();
create trigger fat_premises_audit after insert or update or delete on public.planning_fat_premises for each row execute function public.planning_fat_audit();
create trigger fat_taxes_audit after insert or update or delete on public.planning_fat_taxes for each row execute function public.planning_fat_audit();

-- Regiões: um território vigente na Atribuição; a atribuição sem território (Peças) vira a região 'PECAS'.
create function public.planning_fat_regions(p_org uuid) returns table(region_key text,territory_id uuid,label text,responsibles text[])
language sql stable security definer set search_path=public as $$
 select case when x.territorio_id is null then 'PECAS' else x.territorio_id::text end,x.territorio_id,
 case when x.territorio_id is null then 'Peças' else max(x.tn) end,
 array_agg(distinct x.responsavel order by x.responsavel)
 from (select ar.territorio_id,ar.responsavel,t.nome tn,l.nome ln from public.comercial_atribuicao_responsavel ar
   left join public.comercial_territorios t on t.id=ar.territorio_id
   join public.comercial_linhas_negocio l on l.id=ar.linha_negocio_id
   where ar.organization_id=p_org and public.is_org_member(p_org) and ar.data_inicio<=current_date and (ar.data_fim is null or ar.data_fim>=current_date)) x
 where x.territorio_id is not null or x.ln='Peças'
 group by x.territorio_id order by 3;
$$;

-- Linha de negócio de cada grupo de modelos.
create function public.planning_fat_line_of(p_group text) returns text language sql immutable as $$
 select case p_group when 'Pecuária' then 'Pecuária' when 'Transgrain' then 'Outros' when 'Linhas complementares' then 'Peças' else 'Grão' end;
$$;

-- Coordenação do modelo numa região: atribuição vigente de (território × linha do modelo).
create function public.planning_fat_model_coordination(p_org uuid,p_scenario uuid,p_region_key text,p_model_key text) returns table(coordination_id uuid,coordination_name text)
language sql stable security definer set search_path=public as $$
 select c.id,c.nome from public.planning_fat_models m
 join public.comercial_linhas_negocio l on l.organization_id=p_org and l.nome=public.planning_fat_line_of(m.group_name)
 join public.comercial_atribuicao_responsavel ar on ar.organization_id=p_org and ar.linha_negocio_id=l.id
   and ar.territorio_id is not distinct from (case when p_region_key='PECAS' then null else p_region_key::uuid end)
   and ar.data_inicio<=current_date and (ar.data_fim is null or ar.data_fim>=current_date)
 join public.comercial_coordenacoes c on c.id=ar.coordenacao_id
 where m.scenario_id=p_scenario and m.organization_id=p_org and m.model_key=p_model_key limit 1;
$$;

-- Modelos do cenário: um por nome reduzido de Máquinas, os 4 Transgrain e o modelo Peças.
create function public.planning_fat_seed_models(p_org uuid,p_scenario uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare n integer;begin
 insert into public.planning_fat_models(organization_id,scenario_id,model_key,group_name,sort,fat_driven,product_ids)
 select p_org,p_scenario,x.model_key,x.group_name,
  row_number() over(partition by x.group_name order by case when x.model_key like 'INGRAIN%' then 0 else 1 end,coalesce(nullif(regexp_replace(x.model_key,'[^0-9]','','g'),'')::integer,0),x.model_key),
  x.fat_driven,x.product_ids
 from (
  select btrim(p.nome_reduzido) model_key,
   case when btrim(p.nome_reduzido) ~* '^CARGOGRAIN' then 'Cargograin' when max(c.nome)='Pecuária' then 'Pecuária' else 'Grãos' end group_name,
   false fat_driven,array_agg(p.id order by p.codigo) product_ids
  from public.comercial_produtos p join public.comercial_tipos t on t.id=p.tipo_id and t.nome='Máquinas'
  left join public.comercial_culturas c on c.id=p.cultura_id
  where p.organization_id=p_org and nullif(btrim(p.nome_reduzido),'') is not null group by btrim(p.nome_reduzido)
  union all
  select m.key,'Transgrain',false,array_agg(p.id order by p.codigo)
  from (values ('04003306','TRANSGRAIN 170'),('08203065','TRANSGRAIN 215'),('09003310','TRANSGRAIN IN-65'),('09103075','TRANSGRAIN IN-90'),('09103100','TRANSGRAIN IN-90')) m(code,key)
  join public.comercial_produtos p on p.organization_id=p_org and p.codigo=m.code group by m.key
  union all
  select 'PECAS','Linhas complementares',true,array_agg(p.id order by p.codigo)
  from public.comercial_produtos p join public.comercial_tipos t on t.id=p.tipo_id and t.nome='Peças' where p.organization_id=p_org having count(*)>0
 ) x
 on conflict(scenario_id,model_key) do update set group_name=excluded.group_name,sort=excluded.sort,fat_driven=excluded.fat_driven,product_ids=excluded.product_ids;
 get diagnostics n=row_count;return n;
end $$;

revoke all on function public.planning_fat_audit(),public.planning_fat_regions(uuid),public.planning_fat_line_of(text),public.planning_fat_model_coordination(uuid,uuid,text,text),public.planning_fat_seed_models(uuid,uuid) from public,anon,authenticated;
commit;
