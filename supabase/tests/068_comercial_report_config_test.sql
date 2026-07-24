-- Execute depois das migrations 067, 068 e 069 em um banco de teste.
-- O rollback mantem o teste sem efeitos persistentes.
begin;

do $test$
declare
  valid_config jsonb := jsonb_build_object(
    'schema_version', 1,
    'primary_metric', 'quantity',
    'evaluation', 'target_reached',
    'origins', jsonb_build_array('FAT'),
    'cargos', jsonb_build_array('Representante Comercial'),
    'selected_codes', '[]'::jsonb,
    'product_types', '[]'::jsonb,
    'cultures', '[]'::jsonb,
    'product_type_ids', '[]'::jsonb,
    'culture_ids', '[]'::jsonb,
    'charts', '[]'::jsonb
  );
  final_config jsonb;
begin
  if not public.comercial_report_config_is_valid(valid_config) then
    raise exception 'Configuração mínima válida foi recusada';
  end if;

  if public.comercial_report_config_is_valid(
    valid_config || jsonb_build_object('primary_metric', 'margin_value')
  ) then
    raise exception 'Margem agregada não pode ser habilitada sem fonte persistida';
  end if;

  if public.comercial_report_config_is_valid(
    valid_config || jsonb_build_object('product_type_ids', jsonb_build_array('id-invalido'))
  ) then
    raise exception 'UUID inválido de produto foi aceito';
  end if;

  select v.config into final_config
  from public.comercial_report_definitions d
  join public.comercial_report_versions v
    on v.report_id = d.id and v.version_number = d.current_version
  where d.slug = 'final-ano-2026'
  order by d.created_at
  limit 1;

  if final_config is not null and (
    final_config->>'evaluation' <> 'highest_overachievement'
    or (final_config->'award'->>'close_year')::integer <> 2026
    or (final_config->'award'->>'close_month')::integer <> 12
    or final_config->>'default_scenario' <> 'budget'
  ) then
    raise exception 'Preset Final de Ano diverge das decisões aprovadas';
  end if;
end;
$test$;

rollback;
