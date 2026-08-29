begin;

-- ============================================================================
-- Melhoria #9 do review de segurança (2026-08-29): as RPCs de catálogo mais
-- novas (strategic_create_a3, strategic_create_kpi, migration 155) não
-- validavam decimal_places nem management antes de gravar — o banco até
-- rejeitava valor fora do enum de management (CHECK da migration 142), mas
-- com uma mensagem de constraint crua, não a mensagem amigável que o resto
-- do módulo usa. decimal_places nem tinha CHECK nenhum: um valor negativo
-- passava direto e quebrava toLocaleString(...) no frontend (RangeError,
-- "options.minimumFractionDigits deve estar entre 0 e 100") pra QUALQUER
-- tela que tentasse formatar aquele indicador dali pra frente.
-- ============================================================================

-- decimal_places negativo nunca fazia sentido (é "quantas casas decimais
-- mostrar"); acima de 6 também não — nenhuma unidade do módulo (R$, %,
-- unidade, kg...) precisa de mais que isso. Defesa em profundidade: vale
-- pra QUALQUER caminho de escrita futuro na tabela, não só a RPC de criar.
alter table public.strategic_kpis
  add constraint strategic_kpis_decimal_places_range check (decimal_places between 0 and 6);

create or replace function public.strategic_create_a3(
  p_organization_id uuid,
  p_year            int,
  p_name            text,
  p_parent_id       uuid default null,
  p_management      text default null
)
returns public.strategic_a3
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_id uuid;
  v_parent record;
  v_color text;
  v_code text;
  v_code_base text;
  v_suffix int := 1;
  v_display_order int;
  v_out public.strategic_a3;
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.organization_id = p_organization_id and up.user_id = auth.uid()
      and (
        up.access_role in ('super_admin', 'admin')
        or 'super_admin' = any(up.additional_access_roles)
        or 'admin' = any(up.additional_access_roles)
      )
  ) then
    raise exception 'sem permissão — só super_admin/admin criam A3 no catálogo';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'nome da A3 é obrigatório';
  end if;
  -- Mesma lista da CHECK constraint de strategic_a3.management (migration
  -- 142) — mensagem amigável em vez do erro cru de constraint violation.
  if p_management is not null and btrim(p_management) <> '' and btrim(p_management) not in (
    'Diretoria', 'Controladoria', 'Recursos Humanos', 'Supply Chain',
    'Industrial', 'Engenharia', 'Marketing', 'Produto', 'Qualidade', 'Comercial'
  ) then
    raise exception 'gestão "%" não é uma das gestões válidas do módulo', p_management;
  end if;

  select id into v_cycle_id from public.strategic_cycles
  where organization_id = p_organization_id and year = p_year limit 1;
  if v_cycle_id is null then
    raise exception 'ciclo estratégico %/% não encontrado pra esta organização', p_year, p_organization_id;
  end if;

  if p_parent_id is not null then
    select id, color, management into v_parent
    from public.strategic_a3
    where id = p_parent_id and cycle_id = v_cycle_id and parent_id is null;
    if v_parent.id is null then
      raise exception 'A3-mãe informada não encontrada (ou não é uma A3-mãe de verdade)';
    end if;
    v_color := v_parent.color;
  else
    v_color := (array['#4f7cff','#14b8a6','#f59e0b','#8b5cf6','#f472b6','#6366f1','#fb923c','#a78bfa','#22c55e','#ef4444'])[
      (select count(*) from public.strategic_a3 where cycle_id = v_cycle_id and parent_id is null) % 10 + 1
    ];
  end if;

  v_code_base := public.strategic_slugify(p_name);
  if v_code_base = '' then v_code_base := 'a3'; end if;
  v_code := v_code_base;
  while exists (select 1 from public.strategic_a3 where cycle_id = v_cycle_id and code = v_code) loop
    v_suffix := v_suffix + 1;
    v_code := v_code_base || '_' || v_suffix;
  end loop;

  select coalesce(max(display_order), 0) + 1 into v_display_order
  from public.strategic_a3
  where cycle_id = v_cycle_id
    and ((p_parent_id is null and parent_id is null) or parent_id = p_parent_id);

  insert into public.strategic_a3 (
    organization_id, cycle_id, parent_id, code, name, color, display_order, is_active, created_by, updated_by
  ) values (
    p_organization_id, v_cycle_id, p_parent_id, v_code, btrim(p_name),
    coalesce(v_color, '#4f7cff'), v_display_order, true, auth.uid(), auth.uid()
  )
  returning * into v_out;

  if p_parent_id is null and p_management is not null and btrim(p_management) <> '' then
    update public.strategic_a3 set management = btrim(p_management) where id = v_out.id
    returning * into v_out;
  end if;

  return v_out;
end;
$$;

grant execute on function public.strategic_create_a3(uuid, int, text, uuid, text) to authenticated;

create or replace function public.strategic_create_kpi(
  p_organization_id     uuid,
  p_a3_id               uuid,
  p_name                text,
  p_description         text default null,
  p_unit                text default null,
  p_decimal_places      int default 0,
  p_comparison_mode     text default 'higher',
  p_accumulation_method text default 'sum'
)
returns public.strategic_kpis
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_id uuid;
  v_code text;
  v_code_base text;
  v_suffix int := 1;
  v_display_order int;
  v_out public.strategic_kpis;
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.organization_id = p_organization_id and up.user_id = auth.uid()
      and (
        up.access_role in ('super_admin', 'admin')
        or 'super_admin' = any(up.additional_access_roles)
        or 'admin' = any(up.additional_access_roles)
      )
  ) then
    raise exception 'sem permissão — só super_admin/admin criam indicador no catálogo';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'nome do indicador é obrigatório';
  end if;
  -- Mensagem amigável pras 3 mesmas listas que já eram CHECK constraint da
  -- tabela (migration 128) — antes disparava um erro cru de constraint.
  if coalesce(p_decimal_places, 0) not between 0 and 6 then
    raise exception 'casas decimais deve estar entre 0 e 6 (recebido: %)', p_decimal_places;
  end if;
  if coalesce(p_comparison_mode, 'higher') not in ('higher', 'lower', 'range', 'exact', 'exact_with_tolerance') then
    raise exception 'modo de comparação "%" inválido', p_comparison_mode;
  end if;
  if coalesce(p_accumulation_method, 'sum') not in ('sum', 'average', 'last_closed', 'ratio_of_sums', 'weighted_average', 'none') then
    raise exception 'método de acumulação "%" inválido', p_accumulation_method;
  end if;

  select cycle_id into v_cycle_id
  from public.strategic_a3 where id = p_a3_id and organization_id = p_organization_id;
  if v_cycle_id is null then raise exception 'A3 não encontrada'; end if;

  v_code_base := public.strategic_slugify(p_name);
  if v_code_base = '' then v_code_base := 'indicador'; end if;
  v_code := v_code_base;
  while exists (select 1 from public.strategic_kpis where cycle_id = v_cycle_id and code = v_code) loop
    v_suffix := v_suffix + 1;
    v_code := v_code_base || '_' || v_suffix;
  end loop;

  select coalesce(max(ak.display_order), 0) + 1 into v_display_order
  from public.strategic_a3_kpis ak
  where ak.a3_id = p_a3_id and ak.relationship_type = 'primary';

  insert into public.strategic_kpis (
    organization_id, cycle_id, primary_a3_id, code, name, description, unit, decimal_places,
    entry_mode, monthly_calculation, accumulation_method, comparison_mode,
    formula_config, is_active, display_order, created_by, updated_by
  ) values (
    p_organization_id, v_cycle_id, p_a3_id, v_code, btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), ''), nullif(btrim(coalesce(p_unit, '')), ''),
    coalesce(p_decimal_places, 0), 'direct', 'direct',
    coalesce(p_accumulation_method, 'sum'), coalesce(p_comparison_mode, 'higher'),
    '{}'::jsonb, true, v_display_order, auth.uid(), auth.uid()
  )
  returning * into v_out;

  insert into public.strategic_a3_kpis (a3_id, kpi_id, relationship_type, display_order)
  values (p_a3_id, v_out.id, 'primary', v_display_order);

  return v_out;
end;
$$;

grant execute on function public.strategic_create_kpi(uuid, uuid, text, text, text, int, text, text) to authenticated;

commit;
