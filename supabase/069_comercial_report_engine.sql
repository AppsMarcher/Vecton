begin;

-- Motor comum: aplica calendario, participantes, cargos, origem, produto,
-- cultura, metas, ranking e premiacao no backend. O frontend recebe um contrato
-- dinamico e nao recalcula regras.
create or replace function public.comercial_report_execute(
  p_report_id uuid,
  p_year integer,
  p_month integer,
  p_scenario_id uuid default null,
  p_persist boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.comercial_report_definitions%rowtype;
  v_version public.comercial_report_versions%rowtype;
  v_config jsonb;
  v_start date;
  v_end date;
  v_origins text[] := array[]::text[];
  v_cargos text[] := array[]::text[];
  v_selected text[] := array[]::text[];
  v_product_types text[] := array[]::text[];
  v_cultures text[] := array[]::text[];
  v_product_type_ids uuid[] := array[]::uuid[];
  v_culture_ids uuid[] := array[]::uuid[];
  v_product_labels text[] := array[]::text[];
  v_culture_labels text[] := array[]::text[];
  v_complements text[] := array[]::text[];
  v_primary text;
  v_evaluation text;
  v_active_only boolean;
  v_include_historical boolean;
  v_group_culture boolean;
  v_ranking boolean;
  v_award_enabled boolean;
  v_requires_target boolean;
  v_uses_target boolean;
  v_min_quantity numeric;
  v_min_attainment numeric;
  v_zero_target_policy text;
  v_close_year integer;
  v_close_month integer;
  v_scenario_name text;
  v_selected_label text;
  v_rows jsonb := '[]'::jsonb;
  v_summary jsonb := '[]'::jsonb;
  v_columns jsonb := '[]'::jsonb;
  v_charts jsonb := '[]'::jsonb;
  v_timeline jsonb := '[]'::jsonb;
  v_product_chart jsonb := '[]'::jsonb;
  v_culture_chart jsonb := '[]'::jsonb;
  v_eligibility_chart jsonb := '[]'::jsonb;
  v_compliance jsonb;
  v_rules jsonb;
  v_chart_description text;
  v_payload jsonb;
begin
  if p_month not between 1 and 12 then
    raise exception 'Mes de referencia invalido';
  end if;

  select * into v_report
  from public.comercial_report_definitions
  where id = p_report_id;
  if not found then raise exception 'Relatorio comercial nao encontrado'; end if;
  if not public.is_org_member(v_report.organization_id) then
    raise exception 'Usuario sem acesso a organizacao';
  end if;
  if v_report.status = 'draft'
     and not public.can_manage_comercial_reports(v_report.organization_id) then
    raise exception 'Relatorio em rascunho';
  end if;

  select * into v_version
  from public.comercial_report_versions
  where report_id = v_report.id
    and version_number = v_report.current_version;
  if not found then raise exception 'Relatorio sem versao publicada'; end if;
  v_config := v_version.config;

  -- Relatorios encerrados reutilizam o ultimo snapshot oficial do mesmo
  -- periodo/cenario. Mudancas posteriores nas cargas nao reescrevem historico.
  if v_report.status = 'closed' and not p_persist then
    select r.result_snapshot into v_payload
    from public.comercial_report_runs r
    where r.report_id = v_report.id
      and r.report_version_id = v_version.id
      and r.reference_year = p_year
      and r.reference_month = p_month
      and r.scenario_id is not distinct from p_scenario_id
      and r.run_status = 'official'
      and r.result_snapshot is not null
    order by r.created_at desc
    limit 1;
    if v_payload is not null then return v_payload; end if;
  end if;

  if v_report.modalidade = 'monthly' then
    v_start := make_date(p_year, p_month, 1);
  else
    v_start := make_date(p_year, 1, 1);
  end if;
  v_end := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  if v_report.data_inicio is not null then v_start := greatest(v_start, v_report.data_inicio); end if;
  if v_report.data_fim is not null then v_end := least(v_end, v_report.data_fim); end if;

  select coalesce(array_agg(x), array[]::text[]) into v_origins
  from jsonb_array_elements_text(coalesce(v_config->'origins', '[]'::jsonb)) x;
  select coalesce(array_agg(x), array[]::text[]) into v_cargos
  from jsonb_array_elements_text(coalesce(v_config->'cargos', '[]'::jsonb)) x;
  select coalesce(array_agg(x), array[]::text[]) into v_selected
  from jsonb_array_elements_text(coalesce(v_config->'selected_codes', '[]'::jsonb)) x;
  select coalesce(array_agg(x), array[]::text[]) into v_product_types
  from jsonb_array_elements_text(coalesce(v_config->'product_types', '[]'::jsonb)) x;
  select coalesce(array_agg(x), array[]::text[]) into v_cultures
  from jsonb_array_elements_text(coalesce(v_config->'cultures', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), array[]::uuid[]) into v_product_type_ids
  from jsonb_array_elements_text(coalesce(v_config->'product_type_ids', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), array[]::uuid[]) into v_culture_ids
  from jsonb_array_elements_text(coalesce(v_config->'culture_ids', '[]'::jsonb)) x;
  select coalesce(array_agg(t.nome order by t.nome), array[]::text[]) into v_product_labels
  from public.comercial_tipos t
  where t.organization_id = v_report.organization_id and t.id = any(v_product_type_ids);
  select coalesce(array_agg(c.nome order by c.nome), array[]::text[]) into v_culture_labels
  from public.comercial_culturas c
  where c.organization_id = v_report.organization_id and c.id = any(v_culture_ids);
  select coalesce(array_agg(x), array[]::text[]) into v_complements
  from jsonb_array_elements_text(coalesce(v_config->'complementary_metrics', '[]'::jsonb)) x;

  v_primary := v_config->>'primary_metric';
  v_evaluation := v_config->>'evaluation';
  v_active_only := coalesce((v_config->>'active_only')::boolean, true);
  v_include_historical := coalesce((v_config->>'include_historical')::boolean, true);
  v_group_culture := coalesce(v_config->'groupings', '[]'::jsonb) ? 'culture';
  v_ranking := coalesce((v_config->'ranking'->>'enabled')::boolean, false);
  v_award_enabled := coalesce((v_config->'award'->>'enabled')::boolean, false);
  v_requires_target := coalesce((v_config->'conditions'->>'requires_target')::boolean, false);
  v_uses_target := v_requires_target or v_evaluation in (
    'target_reached', 'highest_attainment', 'highest_overachievement'
  );
  v_min_quantity := coalesce((v_config->'conditions'->>'minimum_quantity')::numeric, 0);
  v_min_attainment := coalesce((v_config->'conditions'->>'minimum_attainment_pct')::numeric, 0);
  v_zero_target_policy := coalesce(v_config->'conditions'->>'zero_target_policy', 'null');
  v_close_year := nullif(v_config->'award'->>'close_year', '')::integer;
  v_close_month := nullif(v_config->'award'->>'close_month', '')::integer;
  if p_scenario_id is null then
    v_scenario_name := 'Budget';
  else
    select fs.name into v_scenario_name
    from public.forecast_scenarios fs
    where fs.id = p_scenario_id and fs.organization_id = v_report.organization_id;
    if v_scenario_name is null then
      raise exception 'Cenario de planejamento nao encontrado nesta organizacao';
    end if;
  end if;
  if cardinality(v_selected) > 0 then
    select string_agg(x.code || ' — ' || coalesce(v.nome, x.code), '; ' order by x.ord)
    into v_selected_label
    from unnest(v_selected) with ordinality x(code, ord)
    left join public.comercial_vendedores v
      on v.organization_id = v_report.organization_id and v.codigo = x.code;
  end if;

  if v_end < v_start then
    v_compliance := jsonb_build_object(
      'auditable', true,
      'rules', jsonb_build_array('Periodo selecionado fora da vigencia da campanha.'),
      'generated_at', now(),
      'config_hash', v_version.config_hash
    );
    return jsonb_build_object(
      'report', jsonb_build_object('id', v_report.id, 'name', v_report.nome,
        'version', v_version.version_number, 'status', v_report.status,
        'mode', v_report.modalidade),
      'period', jsonb_build_object('year', p_year, 'month', p_month,
        'effective_start', v_start, 'effective_end', v_end),
      'columns', '[]'::jsonb, 'summary', '[]'::jsonb, 'rows', '[]'::jsonb,
      'charts', '[]'::jsonb, 'compliance', v_compliance, 'config', v_config
    );
  end if;

  with participant_base as (
    select distinct on (h.cod_vendedor)
      h.cod_vendedor,
      v.nome,
      h.cargo,
      v.situacao
    from public.comercial_vendedor_vigencias h
    join public.comercial_vendedores v
      on v.organization_id = h.organization_id
     and v.codigo = h.cod_vendedor
    where h.organization_id = v_report.organization_id
      and h.data_inicio <= v_end
      and (h.data_fim is null or h.data_fim >= v_start)
      and v.situacao = 'ativo'
      and (cardinality(v_selected) = 0 or h.cod_vendedor = any(v_selected))
      and (
        cardinality(v_selected) > 0
        or cardinality(v_cargos) = 0
        or h.cargo = any(v_cargos)
      )
    order by h.cod_vendedor, h.data_inicio desc
  ), participant_rows as (
    select p.*, s.segment
    from participant_base p
    cross join lateral (
      select null::text as segment where not v_group_culture
      union all
      select c.nome as segment
      from public.comercial_culturas c
      where c.organization_id = v_report.organization_id
        and case when cardinality(v_culture_ids) > 0 then c.id = any(v_culture_ids)
                 when cardinality(v_cultures) > 0 then c.nome = any(v_cultures)
                 else true end
        and v_group_culture
    ) s
  ), real as (
    select
      l.cod_vendedor,
      case when v_group_culture then coalesce(c.nome, 'Sem cultura') else null end as segment,
      sum(l.quantidade) as real_quantity,
      sum(l.valor) as real_revenue,
      count(*) as movement_count
    from public.comercial_realizado_ledger_entries l
    left join public.comercial_vendedores v
      on v.organization_id = l.organization_id and v.codigo = l.cod_vendedor
    left join lateral (
      select vh.nome, vh.cargo, vh.situacao
      from public.comercial_vendedor_vigencias vh
      where vh.organization_id = l.organization_id
        and vh.cod_vendedor = l.cod_vendedor
        and l.entry_date >= vh.data_inicio
        and (vh.data_fim is null or l.entry_date <= vh.data_fim)
      order by vh.data_inicio desc limit 1
    ) h on true
    join public.comercial_produtos p on p.id = l.produto_id
    join public.comercial_tipos t on t.id = p.tipo_id
    left join public.comercial_culturas c on c.id = p.cultura_id
    where l.organization_id = v_report.organization_id
      and l.entry_date between v_start and v_end
      and l.cod_vendedor is not null
      and v.situacao = 'ativo'
      and (cardinality(v_origins) = 0 or l.origem = any(v_origins))
      and (cardinality(v_selected) = 0 or l.cod_vendedor = any(v_selected))
      and (cardinality(v_cargos) = 0 or coalesce(h.cargo, v.cargo) = any(v_cargos))
      and (not v_active_only or coalesce(h.situacao, v.situacao) = 'ativo')
      and (v_include_historical or coalesce(h.situacao, v.situacao) <> 'historico')
      and case when cardinality(v_product_type_ids) > 0 then p.tipo_id = any(v_product_type_ids)
               when cardinality(v_product_types) > 0 then t.nome = any(v_product_types) else true end
      and case when cardinality(v_culture_ids) > 0 then p.cultura_id = any(v_culture_ids)
               when cardinality(v_cultures) > 0 then c.nome = any(v_cultures) else true end
    group by l.cod_vendedor,
      case when v_group_culture then coalesce(c.nome, 'Sem cultura') else null end
  ), target as (
    select
      ar.cod_vendedor,
      case when v_group_culture then coalesce(c.nome, 'Sem cultura') else null end as segment,
      sum(m.quantidade) as target_quantity,
      sum(m.valor) as target_revenue
    from public.comercial_planejado_ledger_entries m
    join lateral (
      select a.*
      from public.comercial_atribuicao_responsavel a
      where a.organization_id = m.organization_id
        and a.territorio_id is not distinct from m.territorio_id
        and a.linha_negocio_id = m.linha_negocio_id
        and make_date(m.reference_year, m.reference_month, 1) >= a.data_inicio
        and (a.data_fim is null or make_date(m.reference_year, m.reference_month, 1) <= a.data_fim)
      order by a.data_inicio desc limit 1
    ) ar on true
    left join public.comercial_vendedores v
      on v.organization_id = m.organization_id and v.codigo = ar.cod_vendedor
    left join lateral (
      select vh.nome, vh.cargo, vh.situacao
      from public.comercial_vendedor_vigencias vh
      where vh.organization_id = m.organization_id
        and vh.cod_vendedor = ar.cod_vendedor
        and make_date(m.reference_year, m.reference_month, 1) >= vh.data_inicio
        and (vh.data_fim is null or make_date(m.reference_year, m.reference_month, 1) <= vh.data_fim)
      order by vh.data_inicio desc limit 1
    ) h on true
    join public.comercial_produtos p on p.id = m.produto_id
    join public.comercial_tipos t on t.id = p.tipo_id
    left join public.comercial_culturas c on c.id = p.cultura_id
    where m.organization_id = v_report.organization_id
      and make_date(m.reference_year, m.reference_month, 1)
          between date_trunc('month', v_start)::date and v_end
      and ar.cod_vendedor is not null
      and v.situacao = 'ativo'
      and (cardinality(v_selected) = 0 or ar.cod_vendedor = any(v_selected))
      and (cardinality(v_cargos) = 0 or coalesce(h.cargo, v.cargo) = any(v_cargos))
      and (not v_active_only or coalesce(h.situacao, v.situacao) = 'ativo')
      and (v_include_historical or coalesce(h.situacao, v.situacao) <> 'historico')
      and case when cardinality(v_product_type_ids) > 0 then p.tipo_id = any(v_product_type_ids)
               when cardinality(v_product_types) > 0 then t.nome = any(v_product_types) else true end
      and case when cardinality(v_culture_ids) > 0 then p.cultura_id = any(v_culture_ids)
               when cardinality(v_cultures) > 0 then c.nome = any(v_cultures) else true end
      and ((p_scenario_id is null and m.scenario_id is null) or m.scenario_id = p_scenario_id)
    group by ar.cod_vendedor,
      case when v_group_culture then coalesce(c.nome, 'Sem cultura') else null end
  ), keys as (
    select cod_vendedor, segment from participant_rows
    union
    select cod_vendedor, segment from real
    union
    select cod_vendedor, segment from target
  ), combined as (
    select
      k.cod_vendedor,
      coalesce(v.nome, pr.nome, k.cod_vendedor) as nome,
      coalesce(pr.cargo, v.cargo) as cargo,
      coalesce(v.situacao, pr.situacao, 'historico') as situacao,
      k.segment,
      coalesce(r.real_quantity, 0) as real_quantity,
      coalesce(r.real_revenue, 0) as real_revenue,
      coalesce(t.target_quantity, 0) as target_quantity,
      coalesce(t.target_revenue, 0) as target_revenue,
      coalesce(r.movement_count, 0) as movement_count,
      -- Real e meta ja foram filtrados pelo cargo/status vigentes em cada data.
      -- Assim uma mudanca posterior de cargo nao invalida movimentos historicos.
      (r.cod_vendedor is not null or t.cod_vendedor is not null or (
        pr.cargo is not null
        and (cardinality(v_cargos) = 0 or pr.cargo = any(v_cargos))
        and (not v_active_only or pr.situacao = 'ativo')
      )) as eligible
    from keys k
    left join participant_rows pr
      on pr.cod_vendedor = k.cod_vendedor and pr.segment is not distinct from k.segment
    left join real r
      on r.cod_vendedor = k.cod_vendedor and r.segment is not distinct from k.segment
    left join target t
      on t.cod_vendedor = k.cod_vendedor and t.segment is not distinct from k.segment
    left join public.comercial_vendedores v
      on v.organization_id = v_report.organization_id and v.codigo = k.cod_vendedor
    where v.situacao = 'ativo'
  ), metrics as (
    select c.*,
      case when v_primary = 'quantity' then c.real_quantity else c.real_revenue end as realized,
      case when v_primary = 'quantity' then c.target_quantity else c.target_revenue end as target,
      case
        when (case when v_primary = 'quantity' then c.target_quantity else c.target_revenue end) > 0
          then (case when v_primary = 'quantity' then c.real_quantity else c.real_revenue end)
               / (case when v_primary = 'quantity' then c.target_quantity else c.target_revenue end) * 100
        when (case when v_primary = 'quantity' then c.real_quantity else c.real_revenue end) > 0
             and v_zero_target_policy = 'real_is_100' then 100
        else null
      end as attainment_pct
    from combined c
  ), scored as (
    select m.*,
      case when m.attainment_pct is null then null else m.attainment_pct - 100 end as overachievement_pct,
      (m.eligible
       and (not v_requires_target or m.target > 0)
       and m.real_quantity >= v_min_quantity
       and coalesce(m.attainment_pct, 0) >= v_min_attainment) as qualified
    from metrics m
  ), ranked as (
    select s.*,
      case when v_ranking then
        row_number() over (
          partition by s.segment
          order by
            case when v_evaluation = 'highest_overachievement' then s.overachievement_pct end desc nulls last,
            case when v_evaluation in ('target_reached', 'highest_attainment') then s.attainment_pct end desc nulls last,
            case when v_evaluation = 'rank_quantity' then s.real_quantity end desc nulls last,
            case when v_evaluation = 'rank_revenue' then s.real_revenue end desc nulls last,
            case when v_evaluation = 'highest_overachievement' then s.real_revenue else s.real_quantity end desc,
            s.cod_vendedor
        )
      end as position
    from scored s
  ), final_rows as (
    select r.*,
      case
        when not v_award_enabled then false
        when v_report.report_kind = 'bateu_levou' then r.qualified
        when v_report.report_kind = 'final_ano'
             and p_year = v_close_year and p_month = v_close_month
             and r.eligible and r.target > 0 and r.position = 1 then true
        else false
      end as awarded,
      case
        when not r.eligible then 'Inelegível'
        when v_report.report_kind = 'final_ano'
             and (p_year <> v_close_year or p_month <> v_close_month) then 'Em andamento'
        when v_report.report_kind = 'final_ano' and r.position = 1 and r.target > 0 then 'Vencedor'
        when r.qualified then 'Atingiu'
        else 'Não atingiu'
      end as situation,
      case
        when not r.eligible and r.cargo is null then 'Código sem cadastro ou vigência válida'
        when not r.eligible and cardinality(v_cargos) > 0 and not (r.cargo = any(v_cargos)) then 'Cargo não participante'
        when not r.eligible and v_active_only and r.situacao <> 'ativo' then 'Integrante inativo no período'
        when v_requires_target and r.target <= 0 then 'Meta válida não encontrada'
        when r.real_quantity < v_min_quantity then 'Não atingiu a quantidade mínima'
        when coalesce(r.attainment_pct, 0) < v_min_attainment then 'Não atingiu a meta'
        else null
      end as reason
    from ranked r
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'cod_vendedor', f.cod_vendedor,
        'nome', f.nome,
        'cargo', f.cargo,
        'status', f.situacao,
        'segment', f.segment,
        'realized', f.realized,
        'target', f.target,
        'attainment_pct', f.attainment_pct,
        'overachievement_pct', f.overachievement_pct,
        'position', f.position,
        'eligible', f.eligible,
        'awarded', f.awarded,
        'situation', f.situation,
        'reason', f.reason,
        'quantity', f.real_quantity,
        'revenue', f.real_revenue,
        'movement_count', f.movement_count
      ) order by f.segment nulls first, f.position nulls last, f.nome
    ), '[]'::jsonb),
    jsonb_build_array(
      jsonb_build_object('key', 'participants', 'label', 'Participantes', 'value', count(*)),
      jsonb_build_object('key', 'eligible', 'label', 'Elegíveis', 'value', count(*) filter (where f.eligible))
    ) || case when v_award_enabled then jsonb_build_array(
      jsonb_build_object('key', 'awarded', 'label', 'Premiados', 'value', count(*) filter (where f.awarded))
    ) else '[]'::jsonb end || case when v_uses_target then jsonb_build_array(
      jsonb_build_object('key', 'target_total', 'label', 'Meta total', 'value', coalesce(sum(f.target) filter (where f.eligible), 0))
    ) else '[]'::jsonb end || jsonb_build_array(
      jsonb_build_object('key', 'realized_total', 'label', 'Realizado total', 'value', coalesce(sum(f.realized) filter (where f.eligible), 0))
    )
  into v_rows, v_summary
  from final_rows f;

  v_columns := jsonb_build_array(
    jsonb_build_object('key', 'cod_vendedor', 'label', 'Código', 'type', 'text', 'visible', true, 'order', 1, 'primary_metric', false),
    jsonb_build_object('key', 'nome', 'label', 'Nome', 'type', 'text', 'visible', true, 'order', 2, 'primary_metric', false),
    jsonb_build_object('key', 'cargo', 'label', 'Cargo', 'type', 'text', 'visible', true, 'order', 3, 'primary_metric', false),
    jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'status', 'visible', true, 'order', 4, 'primary_metric', false)
  );
  if v_group_culture then
    v_columns := v_columns || jsonb_build_array(jsonb_build_object(
      'key', 'segment', 'label', 'Cultura', 'type', 'text', 'visible', true,
      'order', 5, 'primary_metric', false));
  end if;
  v_columns := v_columns || jsonb_build_array(
    jsonb_build_object('key', 'realized', 'label', 'Realizado',
      'type', case when v_primary = 'quantity' then 'number' else 'currency' end,
      'format', case when v_primary = 'quantity' then 'decimal' else 'BRL' end,
      'visible', true, 'order', 10, 'primary_metric', true)
  );
  if v_uses_target then
    v_columns := v_columns || jsonb_build_array(
    jsonb_build_object('key', 'target', 'label', 'Meta',
      'type', case when v_primary = 'quantity' then 'number' else 'currency' end,
      'format', case when v_primary = 'quantity' then 'decimal' else 'BRL' end,
      'visible', true, 'order', 11, 'primary_metric', false),
    jsonb_build_object('key', 'attainment_pct', 'label', 'Atingimento', 'type', 'percentage', 'format', 'percent', 'visible', true, 'order', 12, 'primary_metric', false)
    );
  end if;
  if v_primary <> 'quantity' and 'quantity' = any(v_complements) then
    v_columns := v_columns || jsonb_build_array(jsonb_build_object(
      'key', 'quantity', 'label', 'Quantidade', 'type', 'number', 'format', 'decimal',
      'visible', true, 'order', 16, 'primary_metric', false));
  end if;
  if v_primary <> 'revenue' and 'revenue' = any(v_complements) then
    v_columns := v_columns || jsonb_build_array(jsonb_build_object(
      'key', 'revenue', 'label', 'Faturamento', 'type', 'currency', 'format', 'BRL',
      'visible', true, 'order', 17, 'primary_metric', false));
  end if;
  if v_evaluation = 'highest_overachievement'
     or 'overachievement_pct' = any(v_complements) then
    v_columns := v_columns || jsonb_build_array(jsonb_build_object(
      'key', 'overachievement_pct', 'label', 'Superação', 'type', 'percentage',
      'format', 'percent', 'visible', true, 'order', 13,
      'primary_metric', v_primary = 'overachievement_pct'));
  end if;
  if v_ranking then
    v_columns := v_columns || jsonb_build_array(jsonb_build_object(
      'key', 'position', 'label', 'Posição', 'type', 'integer', 'visible', true,
      'order', 14, 'primary_metric', false));
  end if;
  if v_award_enabled then
    v_columns := v_columns || jsonb_build_array(jsonb_build_object(
      'key', 'awarded', 'label', 'Premiado', 'type', 'boolean', 'visible', true,
      'order', 15, 'primary_metric', false));
  end if;
  v_columns := v_columns || jsonb_build_array(
    jsonb_build_object('key', 'eligible', 'label', 'Elegível', 'type', 'boolean', 'visible', true, 'order', 20, 'primary_metric', false),
    jsonb_build_object('key', 'situation', 'label', 'Situação', 'type', 'status', 'visible', true, 'order', 21, 'primary_metric', false),
    jsonb_build_object('key', 'reason', 'label', 'Motivo', 'type', 'text', 'visible', true, 'order', 22, 'primary_metric', false)
  );

  with months as (
    select gs::date as month_start
    from generate_series(
      date_trunc('month', v_start), date_trunc('month', v_end), interval '1 month'
    ) gs
  ), real_month as (
    select date_trunc('month', l.entry_date)::date as month_start,
      sum(case when v_primary = 'quantity' then l.quantidade else l.valor end) as realized
    from public.comercial_realizado_ledger_entries l
    left join public.comercial_vendedores v
      on v.organization_id = l.organization_id and v.codigo = l.cod_vendedor
    left join lateral (
      select vh.cargo, vh.situacao
      from public.comercial_vendedor_vigencias vh
      where vh.organization_id = l.organization_id
        and vh.cod_vendedor = l.cod_vendedor
        and l.entry_date >= vh.data_inicio
        and (vh.data_fim is null or l.entry_date <= vh.data_fim)
      order by vh.data_inicio desc limit 1
    ) h on true
    join public.comercial_produtos p on p.id = l.produto_id
    join public.comercial_tipos t on t.id = p.tipo_id
    left join public.comercial_culturas c on c.id = p.cultura_id
    where l.organization_id = v_report.organization_id
      and l.entry_date between v_start and v_end
      and l.cod_vendedor is not null
      and v.situacao = 'ativo'
      and (cardinality(v_origins) = 0 or l.origem = any(v_origins))
      and (cardinality(v_selected) = 0 or l.cod_vendedor = any(v_selected))
      and (cardinality(v_cargos) = 0 or coalesce(h.cargo, v.cargo) = any(v_cargos))
      and (not v_active_only or coalesce(h.situacao, v.situacao) = 'ativo')
      and (v_include_historical or coalesce(h.situacao, v.situacao) <> 'historico')
      and case when cardinality(v_product_type_ids) > 0 then p.tipo_id = any(v_product_type_ids)
               when cardinality(v_product_types) > 0 then t.nome = any(v_product_types) else true end
      and case when cardinality(v_culture_ids) > 0 then p.cultura_id = any(v_culture_ids)
               when cardinality(v_cultures) > 0 then c.nome = any(v_cultures) else true end
    group by date_trunc('month', l.entry_date)::date
  ), target_month as (
    select make_date(m.reference_year, m.reference_month, 1) as month_start,
      sum(case when v_primary = 'quantity' then m.quantidade else m.valor end) as target
    from public.comercial_planejado_ledger_entries m
    join lateral (
      select a.* from public.comercial_atribuicao_responsavel a
      where a.organization_id = m.organization_id
        and a.territorio_id is not distinct from m.territorio_id
        and a.linha_negocio_id = m.linha_negocio_id
        and make_date(m.reference_year, m.reference_month, 1) >= a.data_inicio
        and (a.data_fim is null or make_date(m.reference_year, m.reference_month, 1) <= a.data_fim)
      order by a.data_inicio desc limit 1
    ) ar on true
    left join public.comercial_vendedores v
      on v.organization_id = m.organization_id and v.codigo = ar.cod_vendedor
    left join lateral (
      select vh.cargo, vh.situacao
      from public.comercial_vendedor_vigencias vh
      where vh.organization_id = m.organization_id
        and vh.cod_vendedor = ar.cod_vendedor
        and make_date(m.reference_year, m.reference_month, 1) >= vh.data_inicio
        and (vh.data_fim is null or make_date(m.reference_year, m.reference_month, 1) <= vh.data_fim)
      order by vh.data_inicio desc limit 1
    ) h on true
    join public.comercial_produtos p on p.id = m.produto_id
    join public.comercial_tipos t on t.id = p.tipo_id
    left join public.comercial_culturas c on c.id = p.cultura_id
    where m.organization_id = v_report.organization_id
      and make_date(m.reference_year, m.reference_month, 1)
          between date_trunc('month', v_start)::date and v_end
      and ar.cod_vendedor is not null
      and v.situacao = 'ativo'
      and (cardinality(v_selected) = 0 or ar.cod_vendedor = any(v_selected))
      and (cardinality(v_cargos) = 0 or coalesce(h.cargo, v.cargo) = any(v_cargos))
      and (not v_active_only or coalesce(h.situacao, v.situacao) = 'ativo')
      and (v_include_historical or coalesce(h.situacao, v.situacao) <> 'historico')
      and case when cardinality(v_product_type_ids) > 0 then p.tipo_id = any(v_product_type_ids)
               when cardinality(v_product_types) > 0 then t.nome = any(v_product_types) else true end
      and case when cardinality(v_culture_ids) > 0 then p.cultura_id = any(v_culture_ids)
               when cardinality(v_cultures) > 0 then c.nome = any(v_cultures) else true end
      and ((p_scenario_id is null and m.scenario_id is null) or m.scenario_id = p_scenario_id)
    group by make_date(m.reference_year, m.reference_month, 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month', to_char(ms.month_start, 'YYYY-MM'),
    'label', to_char(ms.month_start, 'MM/YYYY'),
    'realized', coalesce(r.realized, 0),
    'target', coalesce(t.target, 0)
  ) order by ms.month_start), '[]'::jsonb)
  into v_timeline
  from months ms
  left join real_month r on r.month_start = ms.month_start
  left join target_month t on t.month_start = ms.month_start;

  with filtered as (
    select t.nome as product_group, coalesce(c.nome, 'Sem cultura') as culture,
           l.quantidade, l.valor
    from public.comercial_realizado_ledger_entries l
    left join public.comercial_vendedores v
      on v.organization_id = l.organization_id and v.codigo = l.cod_vendedor
    left join lateral (
      select vh.cargo, vh.situacao
      from public.comercial_vendedor_vigencias vh
      where vh.organization_id = l.organization_id
        and vh.cod_vendedor = l.cod_vendedor
        and l.entry_date >= vh.data_inicio
        and (vh.data_fim is null or l.entry_date <= vh.data_fim)
      order by vh.data_inicio desc limit 1
    ) h on true
    join public.comercial_produtos p on p.id = l.produto_id
    join public.comercial_tipos t on t.id = p.tipo_id
    left join public.comercial_culturas c on c.id = p.cultura_id
    where l.organization_id = v_report.organization_id
      and l.entry_date between v_start and v_end
      and l.cod_vendedor is not null
      and v.situacao = 'ativo'
      and (cardinality(v_origins) = 0 or l.origem = any(v_origins))
      and (cardinality(v_selected) = 0 or l.cod_vendedor = any(v_selected))
      and (cardinality(v_cargos) = 0 or coalesce(h.cargo, v.cargo) = any(v_cargos))
      and (not v_active_only or coalesce(h.situacao, v.situacao) = 'ativo')
      and (v_include_historical or coalesce(h.situacao, v.situacao) <> 'historico')
      and case when cardinality(v_product_type_ids) > 0 then p.tipo_id = any(v_product_type_ids)
               when cardinality(v_product_types) > 0 then t.nome = any(v_product_types) else true end
      and case when cardinality(v_culture_ids) > 0 then p.cultura_id = any(v_culture_ids)
               when cardinality(v_cultures) > 0 then c.nome = any(v_cultures) else true end
  ), product_agg as (
    select product_group as label, sum(quantidade) as quantity, sum(valor) as revenue
    from filtered group by product_group
  ), culture_agg as (
    select culture as label, sum(quantidade) as quantity, sum(valor) as revenue
    from filtered group by culture
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'label', label, 'quantity', quantity, 'revenue', revenue,
      'realized', case when v_primary = 'quantity' then quantity else revenue end
    ) order by label) from product_agg), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'label', label, 'quantity', quantity, 'revenue', revenue,
      'realized', case when v_primary = 'quantity' then quantity else revenue end
    ) order by label) from culture_agg), '[]'::jsonb)
  into v_product_chart, v_culture_chart;

  with row_data as (
    select * from jsonb_to_recordset(v_rows) as r(
      eligible boolean, awarded boolean, realized numeric
    )
  ), classified as (
    select case
      when coalesce(realized, 0) = 0 then 'Sem resultado'
      when awarded then 'Premiados'
      when eligible then 'Elegíveis não premiados'
      else 'Inelegíveis'
    end as label
    from row_data
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'label', label, 'realized', total, 'quantity', total
  ) order by label), '[]'::jsonb)
  into v_eligibility_chart
  from (select label, count(*)::numeric as total from classified group by label) x;

  select coalesce(jsonb_agg(
    chart || jsonb_build_object(
      'data', case chart->>'type'
        when 'time_line' then v_timeline
        when 'product_distribution' then v_product_chart
        when 'culture_distribution' then v_culture_chart
        when 'eligibility' then v_eligibility_chart
        else v_rows end
    )
  ), '[]'::jsonb)
  into v_charts
  from jsonb_array_elements(coalesce(v_config->'charts', '[]'::jsonb)) chart;

  select string_agg(
    chart->>'type' || ' [métrica=' || coalesce(chart->>'metric', v_primary)
      || ', agrupamento=' || coalesce(chart->>'grouping', 'seller')
      || ', top=' || coalesce(chart->>'top_n', 'todos')
      || ', série=' || coalesce(chart->>'series', 'absolute') || ']',
    '; ' order by ord
  ) into v_chart_description
  from jsonb_array_elements(coalesce(v_config->'charts', '[]'::jsonb)) with ordinality x(chart, ord);

  v_rules := jsonb_build_array(
    'Relatório: ' || v_report.nome || ' [status=' || v_report.status || ', versão=' || v_version.version_number || '].',
    'Referência: ano ' || p_year || ', mês ' || p_month || '.',
    'Período efetivo: ' || to_char(v_start, 'DD/MM/YYYY') || ' a ' || to_char(v_end, 'DD/MM/YYYY'),
    'Modalidade: ' || v_report.modalidade,
    'Origens: ' || coalesce(array_to_string(v_origins, ', '), 'todas'),
    'Cargos: ' || coalesce(array_to_string(v_cargos, ', '), 'todos'),
    case when cardinality(v_selected) = 0
         then 'Equipe Comercial: todos os integrantes elegíveis.'
         else 'Equipe Comercial: ' || v_selected_label || '.' end,
    'Status: ' || case when v_active_only then 'somente ativo na data do movimento' else 'ativo e histórico' end
      || case when v_include_historical then '; históricos vigentes incluídos' else '; históricos não incluídos' end,
    'Produtos: ' || case when cardinality(v_product_type_ids) > 0 then array_to_string(v_product_labels, ', ')
                          when cardinality(v_product_types) > 0 then array_to_string(v_product_types, ', ') else 'todos' end,
    'Culturas: ' || case when cardinality(v_culture_ids) > 0 then array_to_string(v_culture_labels, ', ')
                          when cardinality(v_cultures) > 0 then array_to_string(v_cultures, ', ') else 'todas' end,
    'Métrica principal: ' || v_primary,
    'Cenário de planejamento: ' || v_scenario_name,
    'Avaliação: ' || v_evaluation,
    'Devoluções: movimentos negativos reduzem o período de contabilização.',
    'Vigência: cargo e status resolvidos na data do movimento.'
  )
  || case when cardinality(v_complements) > 0 then jsonb_build_array(
       'Métricas complementares: ' || array_to_string(v_complements, ', ')
     ) else '[]'::jsonb end
  || case when v_requires_target then jsonb_build_array('Meta válida obrigatória.') else '[]'::jsonb end
  || case when v_min_quantity > 0 then jsonb_build_array('Quantidade mínima: ' || v_min_quantity) else '[]'::jsonb end
  || case when v_min_attainment > 0 then jsonb_build_array('Atingimento mínimo: ' || v_min_attainment || '%.') else '[]'::jsonb end
  || case when v_ranking then jsonb_build_array('Ranking habilitado: ' || coalesce(v_config->'ranking'->>'metric', v_evaluation) || '.') else '[]'::jsonb end
  || case when v_award_enabled then jsonb_build_array('Premiação: ' || coalesce(v_config->'award'->>'rule', 'conditions_met') || '.') else '[]'::jsonb end
  || case when v_report.report_kind = 'final_ano' then jsonb_build_array('Fechamento da premiação: 12/2026; vence a maior superação acumulada.') else '[]'::jsonb end
  || case when v_chart_description is not null then jsonb_build_array('Gráficos: ' || v_chart_description || '.') else '[]'::jsonb end
  || jsonb_build_array('Atualizado em: ' || to_char(now(), 'DD/MM/YYYY HH24:MI:SS TZ'));

  v_compliance := jsonb_build_object(
    'auditable', true,
    'rules', v_rules,
    'generated_at', now(),
    'config_hash', v_version.config_hash,
    'version', v_version.version_number,
    'scenario_id', p_scenario_id
  );

  v_payload := jsonb_build_object(
    'report', jsonb_build_object(
      'id', v_report.id,
      'name', v_report.nome,
      'description', v_report.descricao,
      'version', v_version.version_number,
      'status', v_report.status,
      'mode', v_report.modalidade,
      'kind', v_report.report_kind
    ),
    'period', jsonb_build_object(
      'year', p_year,
      'month', p_month,
      'effective_start', v_start,
      'effective_end', v_end
    ),
    'columns', v_columns,
    'summary', v_summary,
    'rows', v_rows,
    'charts', v_charts,
    'compliance', v_compliance,
    'config', v_config
  );

  if p_persist then
    if not public.can_manage_comercial_reports(v_report.organization_id) then
      raise exception 'Usuario sem permissao para oficializar execucoes';
    end if;
    insert into public.comercial_report_runs (
      organization_id, report_id, report_version_id, reference_year,
      reference_month, scenario_id, effective_start, effective_end,
      parameters, compliance, result_snapshot, result_hash, auditable,
      run_status, created_by
    ) values (
      v_report.organization_id, v_report.id, v_version.id, p_year, p_month,
      p_scenario_id, v_start, v_end,
      jsonb_build_object('year', p_year, 'month', p_month, 'scenario_id', p_scenario_id),
      v_compliance, v_payload, md5(v_payload::text), true, 'official', auth.uid()
    );
  end if;

  return v_payload;
end;
$$;

grant execute on function public.comercial_report_execute(uuid, integer, integer, uuid, boolean)
  to authenticated;

-- Lista usada pelo filtro Equipe Comercial. Selecoes fora da vigencia continuam
-- visiveis como invalidas, em vez de serem substituidas automaticamente.
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
  select * into v_report from public.comercial_report_definitions where id = p_report_id;
  if not found or not public.is_org_member(v_report.organization_id) then
    raise exception 'Relatorio comercial indisponivel';
  end if;
  select * into v_version from public.comercial_report_versions
  where report_id = v_report.id and version_number = v_report.current_version;

  v_start := case when v_report.modalidade = 'monthly'
    then make_date(p_year, p_month, 1) else make_date(p_year, 1, 1) end;
  v_end := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;

  return query
  select h.cod_vendedor, coalesce(v.nome, h.nome), h.cargo, h.situacao, h.data_inicio, h.data_fim,
    h.data_inicio <= v_end and (h.data_fim is null or h.data_fim >= v_start),
    exists (
      select 1 from public.comercial_report_version_participants p
      where p.report_version_id = v_version.id
        and p.cod_vendedor = h.cod_vendedor
    )
  from public.comercial_vendedor_vigencias h
  left join public.comercial_vendedores v
    on v.organization_id = h.organization_id
   and v.codigo = h.cod_vendedor
  where h.organization_id = v_report.organization_id
    and h.data_inicio <= v_end
    and v.situacao = 'ativo'
  order by coalesce(v.nome, h.nome), h.data_inicio desc;
end;
$$;

grant execute on function public.comercial_report_team(uuid, integer, integer)
  to authenticated;

create or replace function public.comercial_report_movements(
  p_report_id uuid,
  p_year integer,
  p_month integer,
  p_scenario_id uuid,
  p_cod_vendedor text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report public.comercial_report_definitions%rowtype;
  v_version public.comercial_report_versions%rowtype;
  v_config jsonb;
  v_start date;
  v_end date;
  v_origins text[];
  v_cargos text[];
  v_product_types text[];
  v_cultures text[];
  v_product_type_ids uuid[];
  v_culture_ids uuid[];
  v_selected text[];
  v_active_only boolean;
  v_include_historical boolean;
  v_result jsonb;
begin
  select * into v_report from public.comercial_report_definitions where id = p_report_id;
  if not found or not public.is_org_member(v_report.organization_id) then
    raise exception 'Relatorio comercial indisponivel';
  end if;
  select * into v_version from public.comercial_report_versions
  where report_id = v_report.id and version_number = v_report.current_version;
  v_config := v_version.config;

  v_start := case when v_report.modalidade = 'monthly'
    then make_date(p_year, p_month, 1) else make_date(p_year, 1, 1) end;
  v_end := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  if v_report.data_inicio is not null then v_start := greatest(v_start, v_report.data_inicio); end if;
  if v_report.data_fim is not null then v_end := least(v_end, v_report.data_fim); end if;

  select coalesce(array_agg(x), array[]::text[]) into v_origins
  from jsonb_array_elements_text(coalesce(v_config->'origins', '[]'::jsonb)) x;
  select coalesce(array_agg(x), array[]::text[]) into v_cargos
  from jsonb_array_elements_text(coalesce(v_config->'cargos', '[]'::jsonb)) x;
  select coalesce(array_agg(x), array[]::text[]) into v_product_types
  from jsonb_array_elements_text(coalesce(v_config->'product_types', '[]'::jsonb)) x;
  select coalesce(array_agg(x), array[]::text[]) into v_cultures
  from jsonb_array_elements_text(coalesce(v_config->'cultures', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), array[]::uuid[]) into v_product_type_ids
  from jsonb_array_elements_text(coalesce(v_config->'product_type_ids', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), array[]::uuid[]) into v_culture_ids
  from jsonb_array_elements_text(coalesce(v_config->'culture_ids', '[]'::jsonb)) x;
  select coalesce(array_agg(x), array[]::text[]) into v_selected
  from jsonb_array_elements_text(coalesce(v_config->'selected_codes', '[]'::jsonb)) x;
  v_active_only := coalesce((v_config->>'active_only')::boolean, true);
  v_include_historical := coalesce((v_config->>'include_historical')::boolean, true);

  select coalesce(jsonb_agg(jsonb_build_object(
    'data', l.entry_date,
    'origem', l.origem,
    'tipo_movimento', case when l.quantidade < 0 or l.valor < 0 then 'Devolução' else 'Venda' end,
    'cod_vendedor', l.cod_vendedor,
    'nome', coalesce(v.nome, h.nome, l.cod_vendedor),
    'cargo', coalesce(h.cargo, v.cargo),
    'cod_cliente', l.cod_cliente,
    'cliente', cl.descricao,
    'cod_produto', l.cod_produto,
    'produto', p.descricao,
    'grupo_produto', t.nome,
    'cultura', c.nome,
    'quantidade', l.quantidade,
    'faturamento', l.valor,
    'margem_percentual', l.mb_pct,
    'territorio', tr.nome,
    'regional', co.nome,
    'movimento_considerado', (
      l.cod_vendedor is not null
      and v.situacao = 'ativo'
      and (cardinality(v_origins) = 0 or l.origem = any(v_origins))
      and (cardinality(v_selected) = 0 or l.cod_vendedor = any(v_selected))
      and (cardinality(v_cargos) = 0 or coalesce(h.cargo, v.cargo) = any(v_cargos))
      and (not v_active_only or coalesce(h.situacao, v.situacao) = 'ativo')
      and (v_include_historical or coalesce(h.situacao, v.situacao) <> 'historico')
      and case when cardinality(v_product_type_ids) > 0 then p.tipo_id = any(v_product_type_ids)
               when cardinality(v_product_types) > 0 then t.nome = any(v_product_types) else true end
      and case when cardinality(v_culture_ids) > 0 then p.cultura_id = any(v_culture_ids)
               when cardinality(v_cultures) > 0 then c.nome = any(v_cultures) else true end
    ),
    'motivo_exclusao', case
      when l.cod_vendedor is null then 'Movimento sem código de vendedor'
      when v.situacao is distinct from 'ativo' then 'Integrante histórico no Time Comercial'
      when cardinality(v_origins) > 0 and not (l.origem = any(v_origins)) then 'Origem não permitida'
      when cardinality(v_selected) > 0 and not (l.cod_vendedor = any(v_selected)) then 'Integrante não selecionado'
      when coalesce(h.cargo, v.cargo) is null then 'Código não cadastrado'
      when cardinality(v_cargos) > 0 and not (coalesce(h.cargo, v.cargo) = any(v_cargos)) then 'Cargo não participante'
      when v_active_only and coalesce(h.situacao, v.situacao) <> 'ativo' then 'Vendedor fora da vigência'
      when not v_include_historical and coalesce(h.situacao, v.situacao) = 'historico' then 'Histórico não incluído'
      when cardinality(v_product_type_ids) > 0 and not (p.tipo_id = any(v_product_type_ids)) then 'Produto fora do filtro'
      when cardinality(v_product_type_ids) = 0 and cardinality(v_product_types) > 0 and not (t.nome = any(v_product_types)) then 'Produto fora do filtro'
      when cardinality(v_culture_ids) > 0 and not (p.cultura_id = any(v_culture_ids)) then 'Cultura fora do filtro'
      when cardinality(v_culture_ids) = 0 and cardinality(v_cultures) > 0 and not (c.nome = any(v_cultures)) then 'Cultura fora do filtro'
      else null
    end
  ) order by l.entry_date, l.id), '[]'::jsonb)
  into v_result
  from public.comercial_realizado_ledger_entries l
  left join public.comercial_vendedores v
    on v.organization_id = l.organization_id and v.codigo = l.cod_vendedor
  left join lateral (
    select vh.nome, vh.cargo, vh.situacao
    from public.comercial_vendedor_vigencias vh
    where vh.organization_id = l.organization_id
      and vh.cod_vendedor = l.cod_vendedor
      and l.entry_date >= vh.data_inicio
      and (vh.data_fim is null or l.entry_date <= vh.data_fim)
    order by vh.data_inicio desc limit 1
  ) h on true
  join public.comercial_produtos p on p.id = l.produto_id
  join public.comercial_tipos t on t.id = p.tipo_id
  left join public.comercial_culturas c on c.id = p.cultura_id
  left join public.comercial_clientes cl on cl.id = l.cliente_id
  left join public.comercial_territorios tr on tr.id = l.territorio_id
  left join public.comercial_coordenacoes co on co.id = l.coordenacao_id
  where l.organization_id = v_report.organization_id
    and l.cod_vendedor = p_cod_vendedor
    and l.entry_date between v_start and v_end;

  return v_result;
end;
$$;

grant execute on function public.comercial_report_movements(uuid, integer, integer, uuid, text)
  to authenticated;

commit;
