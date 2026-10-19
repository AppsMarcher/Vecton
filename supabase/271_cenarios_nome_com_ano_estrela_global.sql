-- 271: Cenários versionados por ano.
-- 1) O ano passa a fazer parte do nome do cenário ("Fcst 5+7" -> "Fcst 5+7 2026").
-- 2) Nome único por organização (nunca dois cenários com o mesmo nome).
-- 3) Estrela (is_default) global: uma por organização, não mais uma por ano.
-- A assinatura da RPC set_default_forecast_scenario é mantida (o ano passa a
-- ser ignorado) para não quebrar o front atual durante a transição.

begin;

-- ── 1) Ano no nome ───────────────────────────────────────────────────────────
-- Aborta antes de renomear qualquer coisa se o sufixo gerar nomes repetidos.
do $$
declare
  dup record;
begin
  select organization_id, novo_nome, count(*) as qtd
    into dup
    from (
      select organization_id,
             case when name ~ (reference_year::text || '$')
                  then name
                  else name || ' ' || reference_year
             end as novo_nome
        from public.forecast_scenarios
    ) t
   group by organization_id, novo_nome
  having count(*) > 1
   limit 1;

  if found then
    raise exception 'Nomes duplicados após acrescentar o ano: "%" (% cenários). Renomeie manualmente antes de aplicar a 271.',
      dup.novo_nome, dup.qtd;
  end if;
end;
$$;

update public.forecast_scenarios
   set name = name || ' ' || reference_year,
       updated_at = now()
 where name !~ (reference_year::text || '$');

-- ── 2) Nome único por organização ────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'uq_forecast_scenarios_org_name'
       and conrelid = 'public.forecast_scenarios'::regclass
  ) then
    alter table public.forecast_scenarios
      add constraint uq_forecast_scenarios_org_name unique (organization_id, name);
  end if;
end;
$$;

-- ── 3) Estrela global ────────────────────────────────────────────────────────
-- Se hoje há estrelas em mais de um ano, mantém só a do ano mais recente.
update public.forecast_scenarios s
   set is_default = false,
       updated_at = now()
 where s.is_default
   and exists (
     select 1
       from public.forecast_scenarios o
      where o.organization_id = s.organization_id
        and o.is_default
        and (o.reference_year, o.created_at, o.id) > (s.reference_year, s.created_at, s.id)
   );

drop index if exists public.uq_forecast_scenarios_default_per_year;

create unique index if not exists uq_forecast_scenarios_default_per_org
  on public.forecast_scenarios (organization_id)
  where is_default;

create or replace function public.set_default_forecast_scenario(
  target_organization_id uuid,
  target_reference_year integer,   -- ignorado: a estrela é global
  target_scenario_id uuid          -- null = limpa a estrela
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.user_profiles up
    where up.organization_id = target_organization_id
      and up.user_id = auth.uid()
      and up.access_role in ('admin', 'super_admin')
  ) then
    raise exception 'Apenas administradores podem alterar o cenário favorito';
  end if;

  if target_scenario_id is not null and not exists (
    select 1
    from public.forecast_scenarios s
    where s.id = target_scenario_id
      and s.organization_id = target_organization_id
  ) then
    raise exception 'Cenário não encontrado';
  end if;

  update public.forecast_scenarios
     set is_default = false,
         updated_at = now()
   where organization_id = target_organization_id
     and is_default;

  if target_scenario_id is not null then
    update public.forecast_scenarios
       set is_default = true,
           updated_at = now()
     where id = target_scenario_id;
  end if;
end;
$$;

grant execute on function public.set_default_forecast_scenario(uuid, integer, uuid) to authenticated;

commit;
