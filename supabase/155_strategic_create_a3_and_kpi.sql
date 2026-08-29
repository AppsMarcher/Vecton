begin;

-- ============================================================================
-- Pedido do usuário (2026-08-29): fluxo de criação de A3 (mãe ou filha) e de
-- indicador (sempre entry_mode='direct' — meta e realizado sempre digitados
-- manualmente, sem exceção) direto pela tela, sem precisar de migration
-- pra cada A3/indicador novo. Só super_admin/admin (mesma checagem própria
-- de strategic_rename_kpi/strategic_deactivate_kpi — catálogo nunca é
-- editável por Gestor/A3 Estratégicos).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- strategic_slugify — código técnico a partir do nome (minúsculo, sem
-- acento, espaço/símbolo vira "_"). Só uso interno das duas RPCs abaixo.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_slugify(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '_' from regexp_replace(
    lower(translate(
      coalesce(p_text, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    )),
    '[^a-z0-9]+', '_', 'g'
  ));
$$;

-- ----------------------------------------------------------------------------
-- strategic_create_a3 — cria A3-mãe (p_parent_id null) ou A3-filha
-- (p_parent_id preenchido). Filha herda Gestão e cor do pai automaticamente
-- (mesma regra que strategic_a3_management() já usa pra resolver a Gestão
-- de qualquer A3 — não precisa perguntar de novo na tela). Pai sem Gestão
-- informada fica com management null (caso do EBITDA — métrica
-- consolidada, sem Gestor-editor único).
-- ----------------------------------------------------------------------------
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
    -- Cor cíclica numa paleta pequena, baseada em quantas A3-mãe já existem
    -- — não pergunta cor na tela, só evita repetir a mesma sempre.
    v_color := (array['#4f7cff','#14b8a6','#f59e0b','#8b5cf6','#f472b6','#6366f1','#fb923c','#a78bfa','#22c55e','#ef4444'])[
      (select count(*) from public.strategic_a3 where cycle_id = v_cycle_id and parent_id is null) % 10 + 1
    ];
  end if;

  -- code único dentro do ciclo — slug do nome, com sufixo numérico se colidir.
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

  -- management só é setada em A3-mãe — filha herda via strategic_a3_management()
  -- (resolve sempre pelo pai, não tem coluna própria significativa).
  if p_parent_id is null and p_management is not null and btrim(p_management) <> '' then
    update public.strategic_a3 set management = btrim(p_management) where id = v_out.id
    returning * into v_out;
  end if;

  return v_out;
end;
$$;

grant execute on function public.strategic_create_a3(uuid, int, text, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_create_kpi — sempre entry_mode='direct'/monthly_calculation=
-- 'direct' (meta e realizado sempre digitados manualmente, decisão do
-- usuário) — nunca cria KPI 'computed'/'drivers'/'breakdown' por este
-- caminho (esses sempre exigem trabalho manual de schema/fórmula à parte).
-- ----------------------------------------------------------------------------
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
