begin;

-- Quando o relatorio separa resultado por cultura (ex: Bateu, Levou = Graos e
-- Pecuaria em rankings distintos), o clique numa linha precisa mostrar somente
-- os movimentos daquele segmento. Antes, comercial_report_movements ignorava
-- a cultura da linha clicada e devolvia Graos + Pecuaria somados no mesmo
-- vendedor, inflando o detalhamento em relacao ao "Realizado" da linha.
drop function if exists public.comercial_report_movements(uuid, integer, integer, uuid, text);

create or replace function public.comercial_report_movements(
  p_report_id uuid,
  p_year integer,
  p_month integer,
  p_scenario_id uuid,
  p_cod_vendedor text,
  p_segment text default null
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
      and (p_segment is null or coalesce(c.nome, 'Sem cultura') = p_segment)
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
      when p_segment is not null and coalesce(c.nome, 'Sem cultura') is distinct from p_segment then 'Fora da cultura desta linha (' || p_segment || ')'
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

grant execute on function public.comercial_report_movements(uuid, integer, integer, uuid, text, text)
  to authenticated;

commit;
