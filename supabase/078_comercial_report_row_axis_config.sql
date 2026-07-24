begin;

-- Generaliza o schema de configuracao dos relatorios comerciais pra suportar
-- eixos de linha alem de vendedor (mes, produto, cultura, territorio) e a
-- metrica de margem em R$. Tudo aditivo: configs existentes (Bateu-Levou,
-- Final de Ano) nao tem esses campos e continuam validando exatamente como
-- antes (row_axis ausente == 'seller', o default/comportamento de hoje).
create or replace function public.comercial_report_config_is_valid(p_config jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' then return false; end if;
  if coalesce((p_config->>'schema_version')::integer, 0) <> 1 then return false; end if;

  v := p_config->>'primary_metric';
  -- A margem chega pronta por movimento em mb_pct. Como metrica agregada ela
  -- soma (valor * mb_pct) preservando o sinal da devolucao — decisao fechada
  -- com o usuario (R$ de margem, nao percentual ponderado).
  if v is null or v not in ('quantity', 'revenue', 'margin') then return false; end if;

  v := p_config->>'evaluation';
  if v is null or v not in ('target_reached', 'highest_attainment', 'highest_overachievement',
               'rank_quantity', 'rank_revenue') then return false; end if;

  v := coalesce(p_config->>'row_axis', 'seller');
  if v not in ('seller', 'month', 'product', 'culture', 'territory') then return false; end if;

  if jsonb_typeof(coalesce(p_config->'origins', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'cargos', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'selected_codes', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'product_types', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'cultures', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'product_type_ids', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'culture_ids', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'territory_ids', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'complementary_metrics', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'charts', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'conditions', '{}'::jsonb)) <> 'object' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'ranking', '{}'::jsonb)) <> 'object' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'award', '{}'::jsonb)) <> 'object' then return false; end if;
  perform x::uuid
  from jsonb_array_elements_text(coalesce(p_config->'product_type_ids', '[]'::jsonb)) x;
  perform x::uuid
  from jsonb_array_elements_text(coalesce(p_config->'culture_ids', '[]'::jsonb)) x;
  perform x::uuid
  from jsonb_array_elements_text(coalesce(p_config->'territory_ids', '[]'::jsonb)) x;

  if exists (
    select 1 from jsonb_array_elements_text(coalesce(p_config->'origins', '[]'::jsonb)) x
    where x not in ('FAT', 'CART')
  ) then return false; end if;
  if exists (
    select 1 from jsonb_array_elements_text(coalesce(p_config->'cargos', '[]'::jsonb)) x
    where x not in (
      'Gerente Comercial', 'Coordenador Sul', 'Coordenador Norte',
      'Coordenador Oeste', 'Coordenador Pecuária', 'Especialista Exportação',
      'Representante Comercial', 'Vendedor'
    )
  ) then return false; end if;
  if exists (
    select 1 from jsonb_array_elements_text(coalesce(p_config->'complementary_metrics', '[]'::jsonb)) x
    where x not in ('quantity', 'revenue', 'margin')
  ) then return false; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_config->'charts', '[]'::jsonb)) chart
    where jsonb_typeof(chart) <> 'object'
       or chart->>'type' is null
       or chart->>'type' not in (
         'ranking_bar', 'target_vs_actual', 'time_line', 'product_distribution',
         'culture_distribution', 'eligibility'
       )
  ) then return false; end if;

  v := coalesce(p_config->'conditions'->>'zero_target_policy', 'null');
  if v not in ('null', 'real_is_100') then return false; end if;

  v := coalesce(p_config->>'selection_type', 'general');
  if v not in ('general', 'partial', 'individual') then return false; end if;
  if v = 'general' and jsonb_array_length(coalesce(p_config->'selected_codes', '[]'::jsonb)) <> 0 then return false; end if;
  if v = 'individual' and jsonb_array_length(coalesce(p_config->'selected_codes', '[]'::jsonb)) <> 1 then return false; end if;
  if v = 'partial' and jsonb_array_length(coalesce(p_config->'selected_codes', '[]'::jsonb)) < 2 then return false; end if;

  return true;
exception when others then
  return false;
end;
$$;

-- comercial_report_save ja valida product_type_ids/culture_ids contra as
-- dimensoes da organizacao; territory_ids segue o mesmo padrao.
create or replace function public.comercial_report_save(
  p_report_id uuid,
  p_definition jsonb,
  p_config jsonb,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.comercial_report_definitions%rowtype;
  v_org uuid;
  v_old_version integer := 0;
  v_new_version integer;
  v_version_id uuid;
  v_code text;
  v_order integer := 0;
  v_selection_type text;
  v_old_config jsonb;
  v_old_definition jsonb;
begin
  if not public.comercial_report_config_is_valid(p_config) then
    raise exception 'Configuracao de relatorio comercial invalida';
  end if;

  if p_report_id is not null then
    select * into v_report
    from public.comercial_report_definitions
    where id = p_report_id;
    if not found then raise exception 'Relatorio comercial nao encontrado'; end if;
    if v_report.status = 'closed' then
      raise exception 'Relatorio encerrado nao pode ser alterado; duplique para criar uma nova campanha';
    end if;
    v_org := v_report.organization_id;
    v_old_version := v_report.current_version;
    v_old_definition := jsonb_build_object(
      'nome', v_report.nome,
      'descricao', v_report.descricao,
      'status', v_report.status,
      'report_kind', v_report.report_kind,
      'modalidade', v_report.modalidade,
      'data_inicio', v_report.data_inicio,
      'data_fim', v_report.data_fim,
      'display_order', v_report.display_order
    );
    select config into v_old_config
    from public.comercial_report_versions
    where report_id = p_report_id and version_number = v_old_version;
  else
    v_org := nullif(p_definition->>'organization_id', '')::uuid;
  end if;

  if v_org is null or not public.can_manage_comercial_reports(v_org) then
    raise exception 'Usuario sem permissao para gerenciar relatorios comerciais';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(p_config->'product_type_ids', '[]'::jsonb)) x
    left join public.comercial_tipos t
      on t.id = x::uuid and t.organization_id = v_org
    where t.id is null
  ) then
    raise exception 'Grupo de produto invalido para esta organizacao';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(p_config->'culture_ids', '[]'::jsonb)) x
    left join public.comercial_culturas c
      on c.id = x::uuid and c.organization_id = v_org
    where c.id is null
  ) then
    raise exception 'Cultura invalida para esta organizacao';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(p_config->'territory_ids', '[]'::jsonb)) x
    left join public.comercial_territorios tr
      on tr.id = x::uuid and tr.organization_id = v_org
    where tr.id is null
  ) then
    raise exception 'Territorio invalido para esta organizacao';
  end if;

  if coalesce(btrim(p_definition->>'nome'), '') = '' then
    raise exception 'Nome do relatorio e obrigatorio';
  end if;
  if coalesce(p_definition->>'status', 'draft') not in ('draft', 'active', 'closed') then
    raise exception 'Status do relatorio invalido';
  end if;
  if coalesce(p_definition->>'modalidade', '') not in ('monthly', 'annual_ytd') then
    raise exception 'Modalidade do relatorio invalida';
  end if;

  if p_report_id is null then
    insert into public.comercial_report_definitions (
      organization_id, slug, nome, descricao, status, report_kind, modalidade,
      data_inicio, data_fim, display_order, created_by, updated_by
    ) values (
      v_org,
      coalesce(nullif(btrim(p_definition->>'slug'), ''), 'custom-' || gen_random_uuid()::text),
      btrim(p_definition->>'nome'),
      coalesce(p_definition->>'descricao', ''),
      coalesce(p_definition->>'status', 'draft'),
      coalesce(p_definition->>'report_kind', 'custom'),
      p_definition->>'modalidade',
      nullif(p_definition->>'data_inicio', '')::date,
      nullif(p_definition->>'data_fim', '')::date,
      coalesce((p_definition->>'display_order')::integer, 0),
      auth.uid(), auth.uid()
    ) returning * into v_report;
    p_report_id := v_report.id;

    insert into public.report_section_items (
      organization_id, section_id, report_id, sort_order
    )
    select v_org, s.id, 'comercialRelatorio_' || p_report_id::text,
           coalesce((p_definition->>'display_order')::integer, 0)
    from public.report_sections s
    where s.organization_id = v_org and lower(s.name) = 'comercial'
    order by s.sort_order
    limit 1
    on conflict (organization_id, report_id) do nothing;
  else
    update public.comercial_report_definitions
    set nome = btrim(p_definition->>'nome'),
        descricao = coalesce(p_definition->>'descricao', ''),
        status = coalesce(p_definition->>'status', status),
        modalidade = p_definition->>'modalidade',
        data_inicio = nullif(p_definition->>'data_inicio', '')::date,
        data_fim = nullif(p_definition->>'data_fim', '')::date,
        display_order = coalesce((p_definition->>'display_order')::integer, display_order),
        updated_by = auth.uid()
    where id = p_report_id
    returning * into v_report;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_new_version
  from public.comercial_report_versions
  where report_id = p_report_id;

  insert into public.comercial_report_versions (
    organization_id, report_id, version_number, config, config_hash,
    change_reason, created_by
  ) values (
    v_org, p_report_id, v_new_version, p_config, md5(p_config::text),
    nullif(btrim(p_change_reason), ''), auth.uid()
  ) returning id into v_version_id;

  v_selection_type := coalesce(p_config->>'selection_type', 'general');
  for v_code in
    select jsonb_array_elements_text(coalesce(p_config->'selected_codes', '[]'::jsonb))
  loop
    insert into public.comercial_report_version_participants (
      organization_id, report_version_id, cod_vendedor, selection_type,
      list_version, sort_order, created_by
    ) values (
      v_org, v_version_id, v_code, v_selection_type,
      coalesce((p_config->>'participant_list_version')::integer, 1), v_order, auth.uid()
    );
    v_order := v_order + 1;
  end loop;

  update public.comercial_report_definitions
  set current_version = v_new_version,
      updated_by = auth.uid()
  where id = p_report_id;

  insert into public.comercial_report_audit (
    organization_id, report_id, action, field_name, old_value, new_value,
    old_version, new_version, changed_by
  ) values (
    v_org, p_report_id,
    case when v_old_version = 0 then 'create' else 'new_version' end,
    'config', v_old_config, p_config, nullif(v_old_version, 0), v_new_version, auth.uid()
  );

  insert into public.comercial_report_audit (
    organization_id, report_id, action, field_name, old_value, new_value,
    old_version, new_version, changed_by
  ) values (
    v_org, p_report_id,
    case when v_old_version = 0 then 'create' else 'new_version' end,
    'definition', v_old_definition,
    jsonb_build_object(
      'nome', v_report.nome,
      'descricao', v_report.descricao,
      'status', v_report.status,
      'report_kind', v_report.report_kind,
      'modalidade', v_report.modalidade,
      'data_inicio', v_report.data_inicio,
      'data_fim', v_report.data_fim,
      'display_order', v_report.display_order
    ),
    nullif(v_old_version, 0), v_new_version, auth.uid()
  );

  return p_report_id;
end;
$$;

commit;
