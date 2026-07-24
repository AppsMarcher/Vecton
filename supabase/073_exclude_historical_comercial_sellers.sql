begin;

-- Regra soberana: o status atual de comercial_vendedores vale para todos os
-- períodos. Cargo continua histórico; status HISTORICO é exclusão absoluta.
create or replace function public.invalidate_comercial_reports_on_seller_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.situacao is distinct from new.situacao then
    update public.comercial_vendedor_vigencias
    set situacao = new.situacao,
        updated_at = now()
    where organization_id = new.organization_id
      and cod_vendedor = new.codigo
      and situacao is distinct from new.situacao;

    -- Campanhas legadas consultam esta flag. Ao tornar histórico, nunca pode
    -- continuar elegível. Uma futura reativação exige revisão manual da regra.
    if new.situacao = 'historico' then
      update public.comercial_atribuicao_responsavel
      set elegivel_campanha = false,
          updated_at = now()
      where organization_id = new.organization_id
        and cod_vendedor = new.codigo
        and coalesce(elegivel_campanha, true);
    end if;

    -- Preserva o snapshot anterior para auditoria, mas impede sua reutilização.
    update public.comercial_report_runs
    set run_status = 'invalid',
        auditable = false,
        audit_message = 'Snapshot invalidado por alteração de status no Time Comercial'
    where organization_id = new.organization_id
      and run_status <> 'invalid';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invalidate_comercial_reports_on_seller_status
  on public.comercial_vendedores;
create trigger trg_invalidate_comercial_reports_on_seller_status
after update of situacao on public.comercial_vendedores
for each row execute function public.invalidate_comercial_reports_on_seller_status();

-- Backfill: elimina o conflito que fazia uma vigência antiga reativar um
-- integrante atualmente histórico.
update public.comercial_vendedor_vigencias h
set situacao = v.situacao,
    updated_at = now()
from public.comercial_vendedores v
where v.organization_id = h.organization_id
  and v.codigo = h.cod_vendedor
  and h.situacao is distinct from v.situacao;

update public.comercial_atribuicao_responsavel ar
set elegivel_campanha = false,
    updated_at = now()
from public.comercial_vendedores v
where v.organization_id = ar.organization_id
  and v.codigo = ar.cod_vendedor
  and v.situacao = 'historico'
  and coalesce(ar.elegivel_campanha, true);

-- Versões passam a exigir ativo e a rejeitar histórico. O motor já aplica
-- estes dois campos em participantes, movimentos, metas, gráficos e totais.
with normalized as (
  select id,
    jsonb_set(
      jsonb_set(config, '{active_only}', 'true'::jsonb, true),
      '{include_historical}', 'false'::jsonb, true
    ) as new_config
  from public.comercial_report_versions
)
update public.comercial_report_versions v
set config = n.new_config,
    config_hash = md5(n.new_config::text)
from normalized n
where n.id = v.id
  and v.config is distinct from n.new_config;

-- Todo snapshot calculado antes desta regra fica preservado como inválido.
update public.comercial_report_runs
set run_status = 'invalid',
    auditable = false,
    audit_message = 'Snapshot invalidado pela regra de exclusão de integrantes históricos (073)'
where run_status <> 'invalid'
  and result_snapshot is not null;

-- Algumas instalações ainda exibem as campanhas legadas. O ajuste é
-- incremental e não aborta a migração se elas não existirem.
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_original text;
begin
  foreach v_signature in array array[
    to_regprocedure('public.comercial_bateu_levou(uuid,integer,integer,uuid)'),
    to_regprocedure('public.comercial_final_de_ano(uuid,integer,integer,uuid)')
  ] loop
    if v_signature is null then continue; end if;
    v_definition := pg_get_functiondef(v_signature);
    v_original := v_definition;
    if position('v.situacao=''ativo''' in v_definition) = 0
       and position('v.situacao = ''ativo''' in v_definition) = 0 then
      v_definition := replace(
        v_definition,
        'left join public.comercial_vendedores v',
        'join public.comercial_vendedores v'
      );
      v_definition := regexp_replace(
        v_definition,
        'v\.codigo\s*=\s*a\.cod_vendedor',
        'v.codigo=a.cod_vendedor and v.situacao=''ativo''',
        'g'
      );
    end if;
    if v_definition is distinct from v_original then execute v_definition; end if;
  end loop;
end;
$$;

-- O criador/filtro de equipe nunca lista cadastro histórico, ainda que exista
-- uma vigência antiga para o mesmo código.
create or replace function public.comercial_report_team(
  p_report_id uuid,
  p_year integer,
  p_month integer
)
returns table(
  cod_vendedor text,
  nome text,
  cargo text,
  situacao text,
  data_inicio date,
  data_fim date,
  vigente boolean,
  selected boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report public.comercial_report_definitions%rowtype;
  v_version public.comercial_report_versions%rowtype;
  v_start date;
  v_end date;
begin
  select * into v_report
  from public.comercial_report_definitions
  where id = p_report_id;

  if not found or not public.is_org_member(v_report.organization_id) then
    raise exception 'Relatorio comercial indisponivel';
  end if;

  select * into v_version
  from public.comercial_report_versions
  where report_id = v_report.id
    and version_number = v_report.current_version;

  v_start := case when v_report.modalidade = 'monthly'
    then make_date(p_year, p_month, 1)
    else make_date(p_year, 1, 1)
  end;
  v_end := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;

  return query
  select
    h.cod_vendedor,
    v.nome,
    h.cargo,
    v.situacao,
    h.data_inicio,
    h.data_fim,
    h.data_inicio <= v_end and (h.data_fim is null or h.data_fim >= v_start),
    exists (
      select 1
      from public.comercial_report_version_participants p
      where p.report_version_id = v_version.id
        and p.cod_vendedor = h.cod_vendedor
    )
  from public.comercial_vendedor_vigencias h
  join public.comercial_vendedores v
    on v.organization_id = h.organization_id
   and v.codigo = h.cod_vendedor
  where h.organization_id = v_report.organization_id
    and h.data_inicio <= v_end
    and v.situacao = 'ativo'
  order by v.nome, h.data_inicio desc;
end;
$$;

grant execute on function public.comercial_report_team(uuid, integer, integer)
  to authenticated;

commit;
