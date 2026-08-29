begin;

-- ============================================================================
-- Achado #3 do review de segurança (2026-08-29): ação vinculada a mais de 1
-- A3 (ex.: Comercial + Industrial) só exigia edição em QUALQUER UM dos A3
-- vinculados pra ser alterada/excluída (strategic_action_editable, migration
-- 144 — usada tanto na RLS de strategic_actions/strategic_action_owners
-- quanto no gate de entrada de strategic_save_action pra UPDATE).
--
-- Isso permitia dois problemas pra quem só edita 1 dos A3 vinculados:
--   1. Excluir a ação inteira (delete via RLS), mesmo afetando o outro A3.
--   2. Editar e enviar p_a3_ids sem o(s) outro(s) A3 — strategic_save_action
--      já validava que TODOS os a3_ids NOVOS eram editáveis (migration 145),
--      mas nunca checava os a3_ids que estavam sendo REMOVIDOS. Resultado:
--      dava pra "sequestrar" a ação da área do colega só removendo o vínculo
--      dela silenciosamente, sem precisar ter permissão nela.
--
-- Fix: strategic_action_editable_all(action_id) — só true se o chamador
-- puder editar TODOS os A3 hoje vinculados à ação (não só 1). Substitui
-- strategic_action_editable (que continua existindo e é usada como está —
-- ANY vinculado — pra strategic_action_viewable/leitura e pro vínculo de
-- anexo em ação, onde "ver que existe"/"anexar 1 arquivo" tem risco bem
-- menor que apagar/reatribuir a ação em si).
-- ============================================================================

create or replace function public.strategic_action_editable_all(p_action_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1 from public.strategic_action_a3 saa
    where saa.action_id = p_action_id and not public.strategic_can_edit_a3(saa.a3_id)
  );
$$;

grant execute on function public.strategic_action_editable_all(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS de tabela: só a policy de ESCRITA muda (ANY -> ALL). Leitura continua
-- strategic_action_viewable (ANY visível já é suficiente pra enxergar).
-- ----------------------------------------------------------------------------
drop policy if exists "strategic write on strategic_actions" on public.strategic_actions;
create policy "strategic write on strategic_actions"
on public.strategic_actions for all
using (public.strategic_action_editable_all(id))
with check (public.strategic_action_editable_all(id));

drop policy if exists "strategic write on strategic_action_owners" on public.strategic_action_owners;
create policy "strategic write on strategic_action_owners"
on public.strategic_action_owners for all
using (public.strategic_action_editable_all(action_id))
with check (public.strategic_action_editable_all(action_id));

-- ----------------------------------------------------------------------------
-- strategic_save_action — reemitida (base: migration 145) só trocando o
-- gate de entrada do UPDATE pra strategic_action_editable_all. Resto
-- idêntico, inclusive a checagem "todos os p_a3_ids NOVOS são editáveis"
-- que a 145 já tinha (continua necessária: editable_all cobre o vínculo
-- ATUAL, não impede trocar por um A3 novo que o chamador não edita).
-- ----------------------------------------------------------------------------
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
  if p_title is null or btrim(p_title) = '' then
    raise exception 'título da ação é obrigatório';
  end if;
  if p_a3_ids is null or cardinality(p_a3_ids) = 0 then
    raise exception 'ação precisa de pelo menos 1 A3 vinculado';
  end if;

  if exists (
    select 1 from unnest(p_a3_ids) as u(a3_id) where not public.strategic_can_edit_a3(u.a3_id)
  ) then
    raise exception 'sem permissão de edição em um ou mais A3 informados';
  end if;

  if exists (
    select 1
    from unnest(p_kpi_ids) as u(kpi_id)
    left join public.strategic_kpis k on k.id = u.kpi_id
    where k.id is null or not public.strategic_can_edit_a3(k.primary_a3_id)
  ) then
    raise exception 'sem permissão de edição em um ou mais KPIs informados';
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
    if not public.strategic_action_editable_all(p_id) then
      raise exception 'sem permissão para editar esta ação — precisa poder editar todos os A3 já vinculados a ela';
    end if;

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
