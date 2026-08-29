begin;

-- ============================================================================
-- Fix (achado #5 do review externo, 2026-08-29): strategic_save_action
-- (SECURITY DEFINER, migration 131) validava que quem chama pertence a
-- p_organization_id (can_manage_strategic_a3), mas nunca validava que os
-- UUIDs recebidos em p_a3_ids / p_kpi_ids / p_owner_user_ids pertencem a
-- essa mesma organização antes de inserir os vínculos — um cliente
-- comprometido ou com bug podia ligar uma ação da org A a um A3/KPI da
-- org B. Reemitida (131) só com os 3 blocos de validação abaixo, ANTES dos
-- loops de delete+insert de vínculo (achado #4, fix no frontend, continua
-- valendo: contrato "substitui a lista inteira" preservado, só ganhou
-- validação de pertencimento).
-- ============================================================================

create or replace function public.strategic_save_action(
  p_organization_id          uuid,
  p_cycle_id                 uuid,
  p_id                       uuid default null,
  p_title                    text default null,
  p_description              text default null,
  p_status                   text default 'not_started',
  p_priority                 text default null,
  p_due_date                 date default null,
  p_progress                 numeric default null,
  p_source_analysis_item_id  uuid default null,
  p_a3_ids                   uuid[] default array[]::uuid[],
  p_kpi_ids                  uuid[] default array[]::uuid[],
  p_owner_user_ids           uuid[] default array[]::uuid[]
)
returns public.strategic_actions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_id uuid;
  v_uid uuid;
  v_a3_id uuid;
  v_kpi_id uuid;
  v_out public.strategic_actions;
begin
  if not public.can_manage_strategic_a3(p_organization_id) then
    raise exception 'sem permissão';
  end if;
  if p_title is null or btrim(p_title) = '' then
    raise exception 'título da ação é obrigatório';
  end if;

  -- Todo A3/KPI/usuário referenciado precisa pertencer à MESMA organização
  -- do chamador — sem isso, p_a3_ids/p_kpi_ids de outra org criavam vínculo
  -- cruzado silencioso (achado #5).
  if exists (
    select 1
    from unnest(p_a3_ids) as u(a3_id)
    left join public.strategic_a3 a on a.id = u.a3_id and a.organization_id = p_organization_id
    where a.id is null
  ) then
    raise exception 'um ou mais A3 informados não pertencem a esta organização';
  end if;

  if exists (
    select 1
    from unnest(p_kpi_ids) as u(kpi_id)
    left join public.strategic_kpis k on k.id = u.kpi_id and k.organization_id = p_organization_id
    where k.id is null
  ) then
    raise exception 'um ou mais KPIs informados não pertencem a esta organização';
  end if;

  if exists (
    select 1
    from unnest(p_owner_user_ids) as u(user_id)
    left join public.organization_users ou on ou.user_id = u.user_id and ou.organization_id = p_organization_id
    where ou.user_id is null
  ) then
    raise exception 'um ou mais responsáveis informados não pertencem a esta organização';
  end if;

  if p_id is null then
    insert into public.strategic_actions
      (organization_id, cycle_id, source_analysis_item_id, title, description, status, priority, due_date, progress, created_by, updated_by)
    values
      (p_organization_id, p_cycle_id, p_source_analysis_item_id, p_title, p_description,
       coalesce(p_status, 'not_started'), p_priority, p_due_date, p_progress, auth.uid(), auth.uid())
    returning id into v_action_id;
  else
    update public.strategic_actions
    set title = p_title,
        description = p_description,
        status = coalesce(p_status, status),
        priority = p_priority,
        due_date = p_due_date,
        progress = p_progress,
        completed_at = case
          when p_status = 'done' and status <> 'done' then now()
          when p_status <> 'done' then null
          else completed_at
        end,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_id and organization_id = p_organization_id
    returning id into v_action_id;

    if v_action_id is null then raise exception 'ação não encontrada'; end if;
  end if;

  delete from public.strategic_action_a3 where action_id = v_action_id;
  foreach v_a3_id in array p_a3_ids loop
    insert into public.strategic_action_a3 (action_id, a3_id) values (v_action_id, v_a3_id)
    on conflict do nothing;
  end loop;

  delete from public.strategic_action_kpis where action_id = v_action_id;
  foreach v_kpi_id in array p_kpi_ids loop
    insert into public.strategic_action_kpis (action_id, kpi_id) values (v_action_id, v_kpi_id)
    on conflict do nothing;
  end loop;

  delete from public.strategic_action_owners where action_id = v_action_id;
  foreach v_uid in array p_owner_user_ids loop
    insert into public.strategic_action_owners (action_id, user_id, owner_type)
    values (v_action_id, v_uid, 'owner')
    on conflict do nothing;
  end loop;

  select * into v_out from public.strategic_actions where id = v_action_id;
  return v_out;
end;
$$;

grant execute on function public.strategic_save_action(uuid, uuid, uuid, text, text, text, text, date, numeric, uuid, uuid[], uuid[], uuid[]) to authenticated;

commit;
