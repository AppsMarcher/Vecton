begin;

-- O eixo Mes ("Desempenho de um vendedor") precisa mostrar o ANO INTEIRO
-- (Jan-Dez) no grafico, com barra solida nos meses que ja tem realizado e
-- barra fantasma (meta/forecast do cenario escolhido) nos meses futuros —
-- igual ao combo chart do Dashboard (renderDashComboChart). Antes, a branch
-- so gerava linhas de v_start a v_end (Jan ate o mes selecionado), entao nao
-- existia dado nenhum pros meses futuros.
--
-- Os KPIs de resumo (Realizado/Meta acumulados) continuam restritos a
-- Jan->mes selecionado — so o grafico ganha visao do ano inteiro. Isso e
-- feito com a flag within_accumulation por linha, usada so no agregado do
-- summary (nao filtra as linhas devolvidas, que sempre cobrem o ano).
--
-- Reescreve a funcao inteira (nao um patch textual) porque a mudanca troca
-- a estrutura das CTEs internas da branch 'month', nao so uma linha isolada
-- como no 081. As branches seller/product/culture/territory e todo o resto
-- (graficos, compliance, payload) permanecem identicos a 079+081.
create or replace function public.comercial_report_compute(
  p_organization_id uuid,
  p_report_id uuid,
  p_report_name text,
  p_report_kind text,
  p_report_status text,
  p_modalidade text,
  p_data_inicio date,
  p_data_fim date,
  p_config jsonb,
  p_version_number integer,
  p_config_hash text,
  p_year integer,
  p_month integer,
  p_scenario_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
  v_origins text[] := array[]::text[];
  v_cargos text[] := array[]::text[];
  v_selected text[] := array[]::text[];
  v_product_types text[] := array[]::text[];
  v_cultures text[] := array[]::text[];
  v_product_type_ids uuid[] := array[]::uuid[];
  v_culture_ids uuid[] := array[]::uuid[];
  v_territory_ids uuid[] := array[]::uuid[];
  v_product_labels text[] := array[]::text[];
  v_culture_labels text[] := array[]::text[];
  v_territory_labels text[] := array[]::text[];
  v_complements text[] := array[]::text[];
  v_row_axis text;
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

  if p_modalidade = 'monthly' then
    v_start := make_date(p_year, p_month, 1);
  else
    v_start := make_date(p_year, 1, 1);
  end if;
  v_end := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  if p_data_inicio is not null then v_start := greatest(v_start, p_data_inicio); end if;
  if p_data_fim is not null then v_end := least(v_end, p_data_fim); end if;

  select coalesce(array_agg(x), array[]::text[]) into v_origins
  from jsonb_array_elements_text(coalesce(p_config->'origins', '[]'::jsonb)) x;
  select coalesce(array_agg(x), array[]::text[]) into v_cargos
  from jsonb_array_elements_text(coalesce(p_config->'cargos', '[]'::jsonb)) x;
  select coalesce(array_agg(x), array[]::text[]) into v_selected
  from jsonb_array_elements_text(coalesce(p_config->'selected_codes', '[]'::jsonb)) x;
  select coalesce(array_agg(x), array[]::text[]) into v_product_types
  from jsonb_array_elements_text(coalesce(p_config->'product_types', '[]'::jsonb)) x;
  select coalesce(array_agg(x), array[]::text[]) into v_cultures
  from jsonb_array_elements_text(coalesce(p_config->'cultures', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), array[]::uuid[]) into v_product_type_ids
  from jsonb_array_elements_text(coalesce(p_config->'product_type_ids', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), array[]::uuid[]) into v_culture_ids
  from jsonb_array_elements_text(coalesce(p_config->'culture_ids', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), array[]::uuid[]) into v_territory_ids
  from jsonb_array_elements_text(coalesce(p_config->'territory_ids', '[]'::jsonb)) x;
  select coalesce(array_agg(t.nome order by t.nome), array[]::text[]) into v_product_labels
  from public.comercial_tipos t
  where t.organization_id = p_organization_id and t.id = any(v_product_type_ids);
  select coalesce(array_agg(c.nome order by c.nome), array[]::text[]) into v_culture_labels
  from public.comercial_culturas c
  where c.organization_id = p_organization_id and c.id = any(v_culture_ids);
  select coalesce(array_agg(tr.nome order by tr.nome), array[]::text[]) into v_territory_labels
  from public.comercial_territorios tr
  where tr.organization_id = p_organization_id and tr.id = any(v_territory_ids);
  select coalesce(array_agg(x), array[]::text[]) into v_complements
  from jsonb_array_elements_text(coalesce(p_config->'complementary_metrics', '[]'::jsonb)) x;

  v_row_axis := coalesce(p_config->>'row_axis', 'seller');
  v_primary := p_config->>'primary_metric';
  v_evaluation := p_config->>'evaluation';
  v_active_only := coalesce((p_config->>'active_only')::boolean, true);
  v_include_historical := coalesce((p_config->>'include_historical')::boolean, true);
  v_group_culture := coalesce(p_config->'groupings', '[]'::jsonb) ? 'culture';
  v_ranking := v_row_axis = 'seller' and coalesce((p_config->'ranking'->>'enabled')::boolean, false);
  v_award_enabled := v_row_axis = 'seller' and coalesce((p_config->'award'->>'enabled')::boolean, false);
  v_requires_target := coalesce((p_config->'conditions'->>'requires_target')::boolean, false);
  v_uses_target := v_primary in ('quantity', 'revenue') and (v_row_axis = 'month' or v_requires_target or v_evaluation in (
    'target_reached', 'highest_attainment', 'highest_overachievement'
  ));
  v_min_quantity := coalesce((p_config->'conditions'->>'minimum_quantity')::numeric, 0);
  v_min_attainment := coalesce((p_config->'conditions'->>'minimum_attainment_pct')::numeric, 0);
  v_zero_target_policy := coalesce(p_config->'conditions'->>'zero_target_policy', 'null');
  v_close_year := nullif(p_config->'award'->>'close_year', '')::integer;
  v_close_month := nullif(p_config->'award'->>'close_month', '')::integer;
  if p_scenario_id is null then
    v_scenario_name := 'Budget';
  else
    select fs.name into v_scenario_name
    from public.forecast_scenarios fs
    where fs.id = p_scenario_id and fs.organization_id = p_organization_id;
    if v_scenario_name is null then
      raise exception 'Cenario de planejamento nao encontrado nesta organizacao';
    end if;
  end if;
  if cardinality(v_selected) > 0 then
    select string_agg(x.code || ' — ' || coalesce(v.nome, x.code), '; ' order by x.ord)
    into v_selected_label
    from unnest(v_selected) with ordinality x(code, ord)
    left join public.comercial_vendedores v
      on v.organization_id = p_organization_id and v.codigo = x.code;
  end if;

  if v_end < v_start then
    v_compliance := jsonb_build_object(
      'auditable', true,
      'rules', jsonb_build_array('Periodo selecionado fora da vigencia da campanha.'),
      'generated_at', now(),
      'config_hash', p_config_hash
    );
    return jsonb_build_object(
      'report', jsonb_build_object('id', p_report_id, 'name', p_report_name,
        'version', p_version_number, 'status', p_report_status,
        'mode', p_modalidade, 'kind', p_report_kind),
      'period', jsonb_build_object('year', p_year, 'month', p_month,
        'effective_start', v_start, 'effective_end', v_end),
      'columns', '[]'::jsonb, 'summary', '[]'::jsonb, 'rows', '[]'::jsonb,
      'charts', '[]'::jsonb, 'compliance', v_compliance, 'config', p_config
    );
  end if;

  -- Eixo Vendedor (default, comportamento identico ao motor anterior): 1 linha
  -- por vendedor (+segmento de cultura), com ranking/elegibilidade/premiacao.
  if v_row_axis = 'seller' then
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
      where h.organization_id = p_organization_id
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
        where c.organization_id = p_organization_id
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
        sum(l.valor * l.mb_pct) as real_margin,
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
      where l.organization_id = p_organization_id
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
        and (cardinality(v_territory_ids) = 0 or l.territorio_id = any(v_territory_ids))
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
      where m.organization_id = p_organization_id
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
        and (cardinality(v_territory_ids) = 0 or m.territorio_id = any(v_territory_ids))
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
        coalesce(r.real_margin, 0) as real_margin,
        coalesce(t.target_quantity, 0) as target_quantity,
        coalesce(t.target_revenue, 0) as target_revenue,
        coalesce(r.movement_count, 0) as movement_count,
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
        on v.organization_id = p_organization_id and v.codigo = k.cod_vendedor
      where v.situacao = 'ativo'
    ), metrics as (
      select c.*,
        case when v_primary = 'quantity' then c.real_quantity
             when v_primary = 'revenue' then c.real_revenue
             else c.real_margin end as realized,
        case when v_primary = 'quantity' then c.target_quantity
             when v_primary = 'revenue' then c.target_revenue
             else 0 end as target,
        case
          when v_primary = 'margin' then null
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
          when p_report_kind = 'bateu_levou' then r.qualified
          when p_report_kind = 'final_ano'
               and p_year = v_close_year and p_month = v_close_month
               and r.eligible and r.target > 0 and r.position = 1 then true
          else false
        end as awarded,
        case
          when not r.eligible then 'Inelegível'
          when p_report_kind = 'final_ano'
               and (p_year <> v_close_year or p_month <> v_close_month) then 'Em andamento'
          when p_report_kind = 'final_ano' and r.position = 1 and r.target > 0 then 'Vencedor'
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
          'margin', f.real_margin,
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
    if v_primary <> 'margin' and 'margin' = any(v_complements) then
      v_columns := v_columns || jsonb_build_array(jsonb_build_object(
        'key', 'margin', 'label', 'Margem', 'type', 'currency', 'format', 'BRL',
        'visible', true, 'order', 18, 'primary_metric', false));
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

  -- Eixo Mes: 1 linha por mes do ANO INTEIRO (Jan-Dez, clipado por data_inicio/
  -- data_fim do relatorio se houver) — nao mais so ate o mes selecionado. Meses
  -- sem realizado ficam com quantity/revenue/margin=0 (nenhum lancamento) mas
  -- ainda trazem a meta/forecast do cenario, alimentando o grafico combo
  -- (barra solida = realizado, barra fantasma = so meta). Os KPIs de resumo
  -- (Realizado/Meta acumulados) continuam restritos a Jan->mes selecionado via
  -- within_accumulation, calculado em cima de v_end (que ja reflete YTD).
  elsif v_row_axis = 'month' then
    with year_bounds as (
      select
        greatest(make_date(p_year, 1, 1), coalesce(p_data_inicio, make_date(p_year, 1, 1))) as y_start,
        least(make_date(p_year, 12, 31), coalesce(p_data_fim, make_date(p_year, 12, 31))) as y_end
    ), months as (
      select gs::date as month_start
      from year_bounds, generate_series(
        date_trunc('month', year_bounds.y_start), date_trunc('month', year_bounds.y_end), interval '1 month'
      ) gs
    ), real_month as (
      select date_trunc('month', l.entry_date)::date as month_start,
        sum(l.quantidade) as real_quantity,
        sum(l.valor) as real_revenue,
        sum(l.valor * l.mb_pct) as real_margin
      from public.comercial_realizado_ledger_entries l
      cross join year_bounds yb
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
      where l.organization_id = p_organization_id
        and l.entry_date between yb.y_start and yb.y_end
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
        and (cardinality(v_territory_ids) = 0 or l.territorio_id = any(v_territory_ids))
      group by date_trunc('month', l.entry_date)::date
    ), target_month as (
      select make_date(m.reference_year, m.reference_month, 1) as month_start,
        sum(m.quantidade) as target_quantity,
        sum(m.valor) as target_revenue
      from public.comercial_planejado_ledger_entries m
      cross join year_bounds yb
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
      where m.organization_id = p_organization_id
        and make_date(m.reference_year, m.reference_month, 1)
            between date_trunc('month', yb.y_start)::date and yb.y_end
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
        and (cardinality(v_territory_ids) = 0 or m.territorio_id = any(v_territory_ids))
        and ((p_scenario_id is null and m.scenario_id is null) or m.scenario_id = p_scenario_id)
      group by make_date(m.reference_year, m.reference_month, 1)
    ), joined as (
      select
        to_char(ms.month_start, 'YYYY-MM') as row_key,
        to_char(ms.month_start, 'MM/YYYY') as label,
        coalesce(r.real_quantity, 0) as quantity,
        coalesce(r.real_revenue, 0) as revenue,
        coalesce(r.real_margin, 0) as margin,
        coalesce(t.target_quantity, 0) as target_quantity,
        coalesce(t.target_revenue, 0) as target_revenue,
        (ms.month_start <= date_trunc('month', v_end)::date) as within_accumulation
      from months ms
      left join real_month r on r.month_start = ms.month_start
      left join target_month t on t.month_start = ms.month_start
    ), scored as (
      select j.*,
        case when v_primary = 'quantity' then j.quantity
             when v_primary = 'revenue' then j.revenue
             else j.margin end as realized,
        case when v_primary = 'quantity' then j.target_quantity
             when v_primary = 'revenue' then j.target_revenue
             else 0 end as target
      from joined j
    ), final_rows as (
      select s.*,
        case
          when v_primary = 'margin' then null
          when s.target > 0 then s.realized / s.target * 100
          when s.realized > 0 and v_zero_target_policy = 'real_is_100' then 100
          else null
        end as attainment_pct
      from scored s
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'row_key', f.row_key, 'label', f.label,
        'quantity', f.quantity, 'revenue', f.revenue, 'margin', f.margin,
        'realized', f.realized, 'target', f.target, 'attainment_pct', f.attainment_pct
      ) order by f.row_key), '[]'::jsonb),
      jsonb_build_array(
        jsonb_build_object('key', 'periods', 'label', 'Meses', 'value', count(*) filter (where f.within_accumulation)),
        jsonb_build_object('key', 'realized_total', 'label', 'Realizado total', 'value', coalesce(sum(f.realized) filter (where f.within_accumulation), 0))
      ) || case when v_uses_target then jsonb_build_array(
        jsonb_build_object('key', 'target_total', 'label', 'Meta total', 'value', coalesce(sum(f.target) filter (where f.within_accumulation), 0))
      ) else '[]'::jsonb end
    into v_rows, v_summary
    from final_rows f;

    v_columns := jsonb_build_array(
      jsonb_build_object('key', 'label', 'label', 'Mês', 'type', 'text', 'visible', true, 'order', 1, 'primary_metric', false),
      jsonb_build_object('key', 'realized', 'label',
        case when v_primary = 'quantity' then 'Volume' when v_primary = 'revenue' then 'Faturamento' else 'Margem' end,
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
        'key', 'quantity', 'label', 'Volume', 'type', 'number', 'format', 'decimal', 'visible', true, 'order', 16, 'primary_metric', false));
    end if;
    if v_primary <> 'revenue' and 'revenue' = any(v_complements) then
      v_columns := v_columns || jsonb_build_array(jsonb_build_object(
        'key', 'revenue', 'label', 'Faturamento', 'type', 'currency', 'format', 'BRL', 'visible', true, 'order', 17, 'primary_metric', false));
    end if;
    if v_primary <> 'margin' and 'margin' = any(v_complements) then
      v_columns := v_columns || jsonb_build_array(jsonb_build_object(
        'key', 'margin', 'label', 'Margem', 'type', 'currency', 'format', 'BRL', 'visible', true, 'order', 18, 'primary_metric', false));
    end if;

  -- Eixos Produto/Cultura: 1 linha por grupo de produto (tipo) ou por cultura,
  -- sem meta (planejado nao tem grao fino o suficiente pra comparar aqui).
  elsif v_row_axis in ('product', 'culture') then
    with filtered as (
      select t.nome as product_group, coalesce(c.nome, 'Sem cultura') as culture_name,
             l.quantidade, l.valor, l.mb_pct
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
      where l.organization_id = p_organization_id
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
        and (cardinality(v_territory_ids) = 0 or l.territorio_id = any(v_territory_ids))
    ), grouped as (
      select
        case when v_row_axis = 'product' then product_group else culture_name end as label,
        sum(quantidade) as quantity,
        sum(valor) as revenue,
        sum(valor * mb_pct) as margin
      from filtered
      group by case when v_row_axis = 'product' then product_group else culture_name end
    ), final_rows as (
      select g.*,
        case when v_primary = 'quantity' then g.quantity
             when v_primary = 'revenue' then g.revenue
             else g.margin end as realized
      from grouped g
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'row_key', f.label, 'label', f.label,
        'quantity', f.quantity, 'revenue', f.revenue, 'margin', f.margin,
        'realized', f.realized
      ) order by f.realized desc nulls last, f.label), '[]'::jsonb),
      jsonb_build_array(
        jsonb_build_object('key', 'groups', 'label', case when v_row_axis = 'product' then 'Grupos de produto' else 'Culturas' end, 'value', count(*)),
        jsonb_build_object('key', 'realized_total', 'label', 'Realizado total', 'value', coalesce(sum(f.realized), 0))
      )
    into v_rows, v_summary
    from final_rows f;

    v_columns := jsonb_build_array(
      jsonb_build_object('key', 'label', 'label', case when v_row_axis = 'product' then 'Produto' else 'Cultura' end, 'type', 'text', 'visible', true, 'order', 1, 'primary_metric', false),
      jsonb_build_object('key', 'realized', 'label',
        case when v_primary = 'quantity' then 'Volume' when v_primary = 'revenue' then 'Faturamento' else 'Margem' end,
        'type', case when v_primary = 'quantity' then 'number' else 'currency' end,
        'format', case when v_primary = 'quantity' then 'decimal' else 'BRL' end,
        'visible', true, 'order', 10, 'primary_metric', true)
    );
    if v_primary <> 'quantity' and 'quantity' = any(v_complements) then
      v_columns := v_columns || jsonb_build_array(jsonb_build_object(
        'key', 'quantity', 'label', 'Volume', 'type', 'number', 'format', 'decimal', 'visible', true, 'order', 16, 'primary_metric', false));
    end if;
    if v_primary <> 'revenue' and 'revenue' = any(v_complements) then
      v_columns := v_columns || jsonb_build_array(jsonb_build_object(
        'key', 'revenue', 'label', 'Faturamento', 'type', 'currency', 'format', 'BRL', 'visible', true, 'order', 17, 'primary_metric', false));
    end if;
    if v_primary <> 'margin' and 'margin' = any(v_complements) then
      v_columns := v_columns || jsonb_build_array(jsonb_build_object(
        'key', 'margin', 'label', 'Margem', 'type', 'currency', 'format', 'BRL', 'visible', true, 'order', 18, 'primary_metric', false));
    end if;

  -- Eixo Territorio: 1 linha por territorio, mesmo padrao de Produto/Cultura.
  -- territorio_id ja vem gravado direto no ledger (mesmo join usado em
  -- comercial_report_movements), sem precisar resolver via atribuicao.
  elsif v_row_axis = 'territory' then
    with filtered as (
      select coalesce(tr.nome, 'Sem território') as territory_name,
             l.quantidade, l.valor, l.mb_pct
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
      left join public.comercial_territorios tr on tr.id = l.territorio_id
      where l.organization_id = p_organization_id
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
        and (cardinality(v_territory_ids) = 0 or l.territorio_id = any(v_territory_ids))
    ), grouped as (
      select territory_name as label,
        sum(quantidade) as quantity,
        sum(valor) as revenue,
        sum(valor * mb_pct) as margin
      from filtered
      group by territory_name
    ), final_rows as (
      select g.*,
        case when v_primary = 'quantity' then g.quantity
             when v_primary = 'revenue' then g.revenue
             else g.margin end as realized
      from grouped g
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'row_key', f.label, 'label', f.label,
        'quantity', f.quantity, 'revenue', f.revenue, 'margin', f.margin,
        'realized', f.realized
      ) order by f.realized desc nulls last, f.label), '[]'::jsonb),
      jsonb_build_array(
        jsonb_build_object('key', 'groups', 'label', 'Territórios', 'value', count(*)),
        jsonb_build_object('key', 'realized_total', 'label', 'Realizado total', 'value', coalesce(sum(f.realized), 0))
      )
    into v_rows, v_summary
    from final_rows f;

    v_columns := jsonb_build_array(
      jsonb_build_object('key', 'label', 'label', 'Território', 'type', 'text', 'visible', true, 'order', 1, 'primary_metric', false),
      jsonb_build_object('key', 'realized', 'label',
        case when v_primary = 'quantity' then 'Volume' when v_primary = 'revenue' then 'Faturamento' else 'Margem' end,
        'type', case when v_primary = 'quantity' then 'number' else 'currency' end,
        'format', case when v_primary = 'quantity' then 'decimal' else 'BRL' end,
        'visible', true, 'order', 10, 'primary_metric', true)
    );
    if v_primary <> 'quantity' and 'quantity' = any(v_complements) then
      v_columns := v_columns || jsonb_build_array(jsonb_build_object(
        'key', 'quantity', 'label', 'Volume', 'type', 'number', 'format', 'decimal', 'visible', true, 'order', 16, 'primary_metric', false));
    end if;
    if v_primary <> 'revenue' and 'revenue' = any(v_complements) then
      v_columns := v_columns || jsonb_build_array(jsonb_build_object(
        'key', 'revenue', 'label', 'Faturamento', 'type', 'currency', 'format', 'BRL', 'visible', true, 'order', 17, 'primary_metric', false));
    end if;
    if v_primary <> 'margin' and 'margin' = any(v_complements) then
      v_columns := v_columns || jsonb_build_array(jsonb_build_object(
        'key', 'margin', 'label', 'Margem', 'type', 'currency', 'format', 'BRL', 'visible', true, 'order', 18, 'primary_metric', false));
    end if;

  else
    raise exception 'Eixo de linha invalido: %', v_row_axis;
  end if;

  -- Graficos e timeline sao independentes do eixo de linha da tabela principal.
  with months as (
    select gs::date as month_start
    from generate_series(
      date_trunc('month', v_start), date_trunc('month', v_end), interval '1 month'
    ) gs
  ), real_month as (
    select date_trunc('month', l.entry_date)::date as month_start,
      sum(case when v_primary = 'quantity' then l.quantidade
               when v_primary = 'revenue' then l.valor
               else l.valor * l.mb_pct end) as realized
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
    where l.organization_id = p_organization_id
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
      and (cardinality(v_territory_ids) = 0 or l.territorio_id = any(v_territory_ids))
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
    where m.organization_id = p_organization_id
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
      and (cardinality(v_territory_ids) = 0 or m.territorio_id = any(v_territory_ids))
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
    where l.organization_id = p_organization_id
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
      and (cardinality(v_territory_ids) = 0 or l.territorio_id = any(v_territory_ids))
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

  if v_row_axis = 'seller' then
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
  end if;

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
  from jsonb_array_elements(coalesce(p_config->'charts', '[]'::jsonb)) chart;

  select string_agg(
    chart->>'type' || ' [métrica=' || coalesce(chart->>'metric', v_primary)
      || ', agrupamento=' || coalesce(chart->>'grouping', 'seller')
      || ', top=' || coalesce(chart->>'top_n', 'todos')
      || ', série=' || coalesce(chart->>'series', 'absolute') || ']',
    '; ' order by ord
  ) into v_chart_description
  from jsonb_array_elements(coalesce(p_config->'charts', '[]'::jsonb)) with ordinality x(chart, ord);

  v_rules := jsonb_build_array(
    'Relatório: ' || p_report_name || ' [status=' || p_report_status || ', versão=' || p_version_number || '].',
    'Referência: ano ' || p_year || ', mês ' || p_month || '.',
    'Período efetivo: ' || to_char(v_start, 'DD/MM/YYYY') || ' a ' || to_char(v_end, 'DD/MM/YYYY'),
    'Modalidade: ' || p_modalidade,
    'Eixo da tabela: ' || v_row_axis,
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
    'Territórios: ' || case when cardinality(v_territory_ids) > 0 then array_to_string(v_territory_labels, ', ') else 'todos' end,
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
  || case when v_ranking then jsonb_build_array('Ranking habilitado: ' || coalesce(p_config->'ranking'->>'metric', v_evaluation) || '.') else '[]'::jsonb end
  || case when v_award_enabled then jsonb_build_array('Premiação: ' || coalesce(p_config->'award'->>'rule', 'conditions_met') || '.') else '[]'::jsonb end
  || case when p_report_kind = 'final_ano' then jsonb_build_array('Fechamento da premiação: 12/2026; vence a maior superação acumulada.') else '[]'::jsonb end
  || case when v_chart_description is not null then jsonb_build_array('Gráficos: ' || v_chart_description || '.') else '[]'::jsonb end
  || jsonb_build_array('Atualizado em: ' || to_char(now(), 'DD/MM/YYYY HH24:MI:SS TZ'));

  v_compliance := jsonb_build_object(
    'auditable', true,
    'rules', v_rules,
    'generated_at', now(),
    'config_hash', p_config_hash,
    'version', p_version_number,
    'scenario_id', p_scenario_id
  );

  v_payload := jsonb_build_object(
    'report', jsonb_build_object(
      'id', p_report_id,
      'name', p_report_name,
      'version', p_version_number,
      'status', p_report_status,
      'mode', p_modalidade,
      'kind', p_report_kind
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
    'config', p_config
  );

  return public.comercial_apply_current_seller_names(p_organization_id, v_payload);
end;
$$;

revoke all on function public.comercial_report_compute(
  uuid, uuid, text, text, text, text, date, date, jsonb, integer, text, integer, integer, uuid
) from public;

commit;
