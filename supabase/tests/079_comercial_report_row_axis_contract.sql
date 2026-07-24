-- Execute depois das migrations 078, 079 e 080 em um banco com pelo menos
-- uma organizacao cadastrada (usa a primeira encontrada, so leitura/preview,
-- sem gravar nada — comercial_report_preview nunca persiste). O rollback
-- mantem o teste sem efeitos persistentes mesmo assim.
begin;

do $test$
declare
  v_org uuid;
  v_base jsonb := jsonb_build_object(
    'schema_version', 1,
    'primary_metric', 'quantity',
    'evaluation', 'rank_quantity',
    'origins', jsonb_build_array('FAT'),
    'cargos', '[]'::jsonb,
    'selected_codes', '[]'::jsonb,
    'selection_type', 'general',
    'product_types', '[]'::jsonb,
    'cultures', '[]'::jsonb,
    'product_type_ids', '[]'::jsonb,
    'culture_ids', '[]'::jsonb,
    'territory_ids', '[]'::jsonb,
    'complementary_metrics', '[]'::jsonb,
    'conditions', jsonb_build_object('requires_target', false, 'minimum_quantity', 0, 'minimum_attainment_pct', 0, 'zero_target_policy', 'null'),
    'ranking', jsonb_build_object('enabled', false),
    'award', jsonb_build_object('enabled', false),
    'groupings', '[]'::jsonb,
    'charts', '[]'::jsonb
  );
  v_config jsonb;
  v_payload jsonb;
  v_year integer := extract(year from current_date)::integer;
  v_month integer := extract(month from current_date)::integer;
begin
  select id into v_org from public.organizations order by created_at limit 1;
  if v_org is null then
    raise notice 'Nenhuma organizacao encontrada — pulando teste de row_axis (nada a validar).';
    return;
  end if;

  -- 1) row_axis ausente == 'seller': validador aceita, e config antigo (sem
  -- o campo) continua batendo com o comportamento de sempre.
  if not public.comercial_report_config_is_valid(v_base) then
    raise exception 'Contrato violado: config sem row_axis (legado) foi recusado';
  end if;

  -- 2) Os 4 valores novos de row_axis sao aceitos; qualquer outro, rejeitado.
  if not public.comercial_report_config_is_valid(v_base || jsonb_build_object('row_axis', 'month')) then
    raise exception 'Contrato violado: row_axis=month foi recusado';
  end if;
  if not public.comercial_report_config_is_valid(v_base || jsonb_build_object('row_axis', 'product')) then
    raise exception 'Contrato violado: row_axis=product foi recusado';
  end if;
  if not public.comercial_report_config_is_valid(v_base || jsonb_build_object('row_axis', 'culture')) then
    raise exception 'Contrato violado: row_axis=culture foi recusado';
  end if;
  if not public.comercial_report_config_is_valid(v_base || jsonb_build_object('row_axis', 'territory')) then
    raise exception 'Contrato violado: row_axis=territory foi recusado';
  end if;
  if public.comercial_report_config_is_valid(v_base || jsonb_build_object('row_axis', 'invalido')) then
    raise exception 'Contrato violado: row_axis invalido foi aceito';
  end if;

  -- 3) Margem e aceita como metrica principal e complementar.
  if not public.comercial_report_config_is_valid(v_base || jsonb_build_object('primary_metric', 'margin')) then
    raise exception 'Contrato violado: primary_metric=margin foi recusado';
  end if;
  if not public.comercial_report_config_is_valid(
    v_base || jsonb_build_object('complementary_metrics', jsonb_build_array('margin'))
  ) then
    raise exception 'Contrato violado: complementary_metrics com margin foi recusado';
  end if;

  -- 4) territory_ids precisa ser array de uuid valido.
  if public.comercial_report_config_is_valid(
    v_base || jsonb_build_object('territory_ids', jsonb_build_array('nao-e-uuid'))
  ) then
    raise exception 'Contrato violado: territory_ids com valor nao-uuid foi aceito';
  end if;

  -- 5) comercial_report_preview roda sem erro pra cada eixo e devolve o
  -- shape esperado de colunas (nao depende de haver dado no periodo).
  v_config := v_base || jsonb_build_object('row_axis', 'seller');
  v_payload := public.comercial_report_preview(
    v_org, 'custom', 'monthly', null, null, v_config, v_year, v_month, null
  );
  if not (v_payload -> 'columns' @> '[{"key": "cod_vendedor"}]'::jsonb) then
    raise exception 'Contrato violado: eixo seller nao devolveu coluna cod_vendedor';
  end if;

  v_config := v_base || jsonb_build_object('row_axis', 'month', 'primary_metric', 'margin');
  v_payload := public.comercial_report_preview(
    v_org, 'custom', 'monthly', null, null, v_config, v_year, v_month, null
  );
  if not (v_payload -> 'columns' @> '[{"key": "label"}]'::jsonb) then
    raise exception 'Contrato violado: eixo month nao devolveu coluna label';
  end if;
  if jsonb_typeof(v_payload -> 'rows') <> 'array' or jsonb_array_length(v_payload -> 'rows') < 1 then
    raise exception 'Contrato violado: eixo month deveria gerar 1 linha (o proprio mes) mesmo sem dado';
  end if;

  v_config := v_base || jsonb_build_object('row_axis', 'product');
  v_payload := public.comercial_report_preview(
    v_org, 'custom', 'monthly', null, null, v_config, v_year, v_month, null
  );
  if not (v_payload -> 'columns' @> '[{"key": "label"}]'::jsonb) then
    raise exception 'Contrato violado: eixo product nao devolveu coluna label';
  end if;

  v_config := v_base || jsonb_build_object('row_axis', 'territory');
  v_payload := public.comercial_report_preview(
    v_org, 'custom', 'monthly', null, null, v_config, v_year, v_month, null
  );
  if not (v_payload -> 'columns' @> '[{"key": "label"}]'::jsonb) then
    raise exception 'Contrato violado: eixo territory nao devolveu coluna label';
  end if;

  -- 6) Preview de tipo/modalidade invalidos tem que falhar alto (nao devolver
  -- payload vazio silenciosamente).
  begin
    perform public.comercial_report_preview(
      v_org, 'tipo-invalido', 'monthly', null, null, v_config, v_year, v_month, null
    );
    raise exception 'Contrato violado: preview aceitou report_kind invalido';
  exception when others then
    if sqlerrm = 'Contrato violado: preview aceitou report_kind invalido' then
      raise;
    end if;
  end;
end;
$test$;

rollback;
