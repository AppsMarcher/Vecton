begin;

-- Repara definicoes que foram criadas sem a respectiva versao publicada.
-- Nao altera relatorios que ja possuem pelo menos uma versao valida.
insert into public.comercial_report_versions (
  organization_id, report_id, version_number, config, config_hash,
  change_reason
)
select
  d.organization_id,
  d.id,
  1,
  cfg.config,
  md5(cfg.config::text),
  'Reparo automatico de definicao sem versao'
from public.comercial_report_definitions d
cross join lateral (
  select case
    when d.slug = 'bateu-levou' then jsonb_build_object(
      'schema_version', 1,
      'origins', jsonb_build_array('FAT'),
      'cargos', jsonb_build_array('Representante Comercial'),
      'active_only', true,
      'include_historical', false,
      'selection_type', 'general',
      'selected_codes', '[]'::jsonb,
      'participant_list_version', 1,
      'product_type_ids', coalesce((
        select jsonb_agg(t.id::text order by t.nome)
        from public.comercial_tipos t
        where t.organization_id = d.organization_id
          and t.nome = 'Máquinas'
      ), '[]'::jsonb),
      'culture_ids', coalesce((
        select jsonb_agg(c.id::text order by c.nome)
        from public.comercial_culturas c
        where c.organization_id = d.organization_id
          and c.nome in ('Grãos', 'Pecuária')
      ), '[]'::jsonb),
      'product_types', '[]'::jsonb,
      'cultures', '[]'::jsonb,
      'primary_metric', 'quantity',
      'complementary_metrics', '[]'::jsonb,
      'evaluation', 'target_reached',
      'conditions', jsonb_build_object(
        'minimum_quantity', 2,
        'minimum_attainment_pct', 100,
        'requires_target', false,
        'zero_target_policy', 'real_is_100'
      ),
      'ranking', jsonb_build_object(
        'enabled', true,
        'metric', 'attainment_pct',
        'direction', 'desc',
        'tie_breaker', 'quantity'
      ),
      'award', jsonb_build_object('enabled', true, 'rule', 'conditions_met'),
      'groupings', jsonb_build_array('culture'),
      'scenario_mode', 'runtime',
      'charts', jsonb_build_array(
        jsonb_build_object(
          'type', 'ranking_bar', 'metric', 'quantity', 'grouping', 'seller',
          'ordering', 'desc', 'top_n', 10, 'series', 'absolute'
        ),
        jsonb_build_object(
          'type', 'target_vs_actual', 'metric', 'quantity', 'grouping', 'seller',
          'ordering', 'desc', 'top_n', 10, 'series', 'absolute'
        )
      )
    )
    when d.slug = 'final-ano-2026' then jsonb_build_object(
      'schema_version', 1,
      'origins', jsonb_build_array('FAT'),
      'cargos', jsonb_build_array('Representante Comercial', 'Vendedor'),
      'active_only', true,
      'include_historical', false,
      'selection_type', 'partial',
      'selected_codes', coalesce((
        select jsonb_agg(v.codigo order by v.codigo)
        from public.comercial_vendedores v
        where v.organization_id = d.organization_id
          and v.codigo <> '000633'
          and v.cargo in ('Representante Comercial', 'Vendedor')
      ), '[]'::jsonb),
      'participant_list_version', 1,
      'product_type_ids', '[]'::jsonb,
      'culture_ids', '[]'::jsonb,
      'product_types', '[]'::jsonb,
      'cultures', '[]'::jsonb,
      'primary_metric', 'revenue',
      'complementary_metrics', '[]'::jsonb,
      'evaluation', 'highest_overachievement',
      'conditions', jsonb_build_object(
        'minimum_quantity', 0,
        'minimum_attainment_pct', 0,
        'requires_target', true,
        'zero_target_policy', 'null'
      ),
      'ranking', jsonb_build_object(
        'enabled', true,
        'metric', 'overachievement_pct',
        'direction', 'desc',
        'tie_breaker', 'revenue'
      ),
      'award', jsonb_build_object(
        'enabled', true,
        'rule', 'rank_1_at_close',
        'close_year', 2026,
        'close_month', 12
      ),
      'groupings', '[]'::jsonb,
      'scenario_mode', 'runtime',
      'default_scenario', 'budget',
      'charts', jsonb_build_array(
        jsonb_build_object(
          'type', 'ranking_bar', 'metric', 'overachievement_pct',
          'grouping', 'seller', 'ordering', 'desc', 'top_n', 10, 'series', 'ytd'
        ),
        jsonb_build_object(
          'type', 'time_line', 'metric', 'revenue', 'grouping', 'month',
          'ordering', 'asc', 'top_n', 12, 'series', 'ytd'
        )
      )
    )
    else jsonb_build_object(
      'schema_version', 1,
      'origins', jsonb_build_array('FAT'),
      'cargos', jsonb_build_array('Representante Comercial'),
      'active_only', true,
      'include_historical', false,
      'selection_type', 'general',
      'selected_codes', '[]'::jsonb,
      'participant_list_version', 1,
      'product_type_ids', '[]'::jsonb,
      'culture_ids', '[]'::jsonb,
      'product_types', '[]'::jsonb,
      'cultures', '[]'::jsonb,
      'primary_metric', 'quantity',
      'complementary_metrics', '[]'::jsonb,
      'evaluation', 'rank_quantity',
      'conditions', jsonb_build_object(
        'minimum_quantity', 0,
        'minimum_attainment_pct', 0,
        'requires_target', false,
        'zero_target_policy', 'null'
      ),
      'ranking', jsonb_build_object(
        'enabled', true, 'metric', 'quantity',
        'direction', 'desc', 'tie_breaker', 'revenue'
      ),
      'award', jsonb_build_object('enabled', false, 'rule', 'conditions_met'),
      'groupings', '[]'::jsonb,
      'scenario_mode', 'runtime',
      'charts', '[]'::jsonb
    )
  end as config
) cfg
where not exists (
  select 1
  from public.comercial_report_versions v
  where v.report_id = d.id
);

-- Aponta cada definicao para sua maior versao realmente existente.
update public.comercial_report_definitions d
set current_version = versions.max_version,
    updated_at = now()
from (
  select report_id, max(version_number) as max_version
  from public.comercial_report_versions
  group by report_id
) versions
where versions.report_id = d.id
  and d.current_version is distinct from versions.max_version;

-- Reconstroi a lista materializada de participantes das versoes reparadas.
insert into public.comercial_report_version_participants (
  organization_id, report_version_id, cod_vendedor, selection_type,
  list_version, sort_order
)
select
  v.organization_id,
  v.id,
  participant.code,
  coalesce(v.config->>'selection_type', 'general'),
  coalesce((v.config->>'participant_list_version')::integer, 1),
  participant.ord::integer - 1
from public.comercial_report_versions v
cross join lateral jsonb_array_elements_text(
  coalesce(v.config->'selected_codes', '[]'::jsonb)
) with ordinality participant(code, ord)
where not exists (
  select 1
  from public.comercial_report_version_participants existing
  where existing.report_version_id = v.id
    and existing.cod_vendedor = participant.code
);

commit;
