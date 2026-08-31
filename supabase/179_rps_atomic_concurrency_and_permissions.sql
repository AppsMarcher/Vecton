begin;

-- Escrita da RPS segue o perfil funcional do Vecton, não o papel genérico
-- organization_users.role. Usuários convidados são membros "viewer", mas
-- Gestor/RPS Gestão precisam gravar somente neste módulo.
create or replace function public.rps_can_write(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_member(target_organization_id)
    and exists (
      select 1
      from public.user_profiles p
      where p.organization_id = target_organization_id
        and p.user_id = auth.uid()
        and coalesce(p.is_active, true)
        and (
          p.access_role::text in ('super_admin', 'admin', 'manager', 'rps_gestao')
          or coalesce(p.additional_access_roles, '{}'::text[])
             && array['super_admin', 'admin', 'manager', 'rps_gestao']::text[]
        )
    )
$$;

create or replace function public.rps_can_manage(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_member(target_organization_id)
    and exists (
      select 1
      from public.user_profiles p
      where p.organization_id = target_organization_id
        and p.user_id = auth.uid()
        and coalesce(p.is_active, true)
        and (
          p.access_role::text in ('super_admin', 'admin', 'manager')
          or coalesce(p.additional_access_roles, '{}'::text[])
             && array['super_admin', 'admin', 'manager']::text[]
        )
    )
$$;

grant execute on function public.rps_can_write(uuid) to authenticated;
grant execute on function public.rps_can_manage(uuid) to authenticated;

drop policy if exists "org editors manage rps snapshots" on public.rps_snapshots;
drop policy if exists "rps profiles manage rps snapshots" on public.rps_snapshots;
create policy "rps profiles manage rps snapshots"
on public.rps_snapshots
for all to authenticated
using (public.rps_can_write(organization_id))
with check (public.rps_can_write(organization_id));

-- Corrige a mesma divergência no bucket de anexos e preserva o lock de backup.
drop policy if exists "org editors upload rps attachments" on storage.objects;
create policy "org editors upload rps attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'rps-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.rps_can_write(((storage.foldername(name))[1])::uuid)
  and public.rps_attachment_period_unlocked(name)
);

drop policy if exists "org editors update rps attachments" on storage.objects;
create policy "org editors update rps attachments"
on storage.objects for update to authenticated
using (
  bucket_id = 'rps-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.rps_can_write(((storage.foldername(name))[1])::uuid)
  and public.rps_attachment_period_unlocked(name)
)
with check (
  bucket_id = 'rps-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.rps_can_write(((storage.foldername(name))[1])::uuid)
  and public.rps_attachment_period_unlocked(name)
);

drop policy if exists "org editors delete rps attachments" on storage.objects;
create policy "org editors delete rps attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'rps-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.rps_can_write(((storage.foldername(name))[1])::uuid)
  and public.rps_attachment_period_unlocked(name)
);

-- Auditoria granular: permite reconstruir quem alterou cada chave, inclusive
-- deleções. Não depende do backup semanal.
create table if not exists public.rps_change_audit (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ano             integer not null,
  mes             integer not null,
  snapshot_version bigint not null,
  request_id      uuid not null,
  section_name    text not null,
  entry_key       text not null,
  old_exists      boolean not null,
  old_value       jsonb,
  new_exists      boolean not null,
  new_value       jsonb,
  changed_by      uuid references auth.users(id) on delete set null,
  changed_at      timestamptz not null default now(),
  unique (organization_id, request_id, section_name, entry_key)
);

create index if not exists rps_change_audit_period_idx
  on public.rps_change_audit (organization_id, ano, mes, changed_at desc);

alter table public.rps_change_audit enable row level security;
drop policy if exists "rps managers read change audit" on public.rps_change_audit;
create policy "rps managers read change audit"
on public.rps_change_audit for select to authenticated
using (public.rps_can_manage(organization_id));
grant select on public.rps_change_audit to authenticated;

create table if not exists public.rps_save_requests (
  request_id       uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ano              integer not null,
  mes              integer not null,
  result_version   bigint not null,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

alter table public.rps_save_requests enable row level security;

-- Merge de mapas JSON com semântica de presença (ausente é diferente de null).
-- Conflito só ocorre quando remoto e local mudaram a MESMA chave de formas
-- diferentes. Campos distintos sempre são preservados.
create or replace function public.rps_merge_map_3way(
  p_base jsonb,
  p_remote jsonb,
  p_local jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_base jsonb := case when jsonb_typeof(p_base) = 'object' then p_base else '{}'::jsonb end;
  v_remote jsonb := case when jsonb_typeof(p_remote) = 'object' then p_remote else '{}'::jsonb end;
  v_local jsonb := case when jsonb_typeof(p_local) = 'object' then p_local else '{}'::jsonb end;
  v_result jsonb := '{}'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_key text;
  v_b_exists boolean;
  v_r_exists boolean;
  v_l_exists boolean;
  v_local_changed boolean;
  v_remote_changed boolean;
  v_choose_exists boolean;
  v_choose jsonb;
begin
  for v_key in
    select distinct key
    from (
      select jsonb_object_keys(v_base) key
      union all select jsonb_object_keys(v_remote)
      union all select jsonb_object_keys(v_local)
    ) keys
    order by key
  loop
    v_b_exists := v_base ? v_key;
    v_r_exists := v_remote ? v_key;
    v_l_exists := v_local ? v_key;
    v_local_changed := v_l_exists <> v_b_exists
      or (v_l_exists and v_b_exists and (v_local -> v_key) is distinct from (v_base -> v_key));
    v_remote_changed := v_r_exists <> v_b_exists
      or (v_r_exists and v_b_exists and (v_remote -> v_key) is distinct from (v_base -> v_key));

    if v_local_changed and v_remote_changed
      and (v_l_exists <> v_r_exists
        or (v_l_exists and v_r_exists and (v_local -> v_key) is distinct from (v_remote -> v_key))) then
      v_conflicts := v_conflicts || jsonb_build_array(v_key);
      v_choose_exists := v_r_exists;
      v_choose := v_remote -> v_key;
    elsif v_local_changed then
      v_choose_exists := v_l_exists;
      v_choose := v_local -> v_key;
    else
      v_choose_exists := v_r_exists;
      v_choose := v_remote -> v_key;
    end if;

    if v_choose_exists then
      v_result := jsonb_set(v_result, array[v_key], v_choose, true);
    end if;
  end loop;
  return jsonb_build_object('value', v_result, 'conflicts', v_conflicts);
end;
$$;

create or replace function public.rps_merge_payload_3way(
  p_base jsonb,
  p_remote jsonb,
  p_local jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_sections text[] := array['unidades','dados','cellStyles','comentarios','dadosMes','dadosMeta','anexos','modoMes','modoMeta','configuracoes'];
  v_result jsonb := coalesce(p_remote, '{}'::jsonb);
  v_conflicts jsonb := '[]'::jsonb;
  v_merged jsonb;
  v_section text;
  v_base_value jsonb;
  v_remote_value jsonb;
  v_local_value jsonb;
  v_local_changed boolean;
  v_remote_changed boolean;
begin
  foreach v_section in array array['areas','indicadores'] loop
    v_base_value := coalesce(p_base -> v_section, 'null'::jsonb);
    v_remote_value := coalesce(p_remote -> v_section, 'null'::jsonb);
    v_local_value := coalesce(p_local -> v_section, 'null'::jsonb);
    v_local_changed := v_local_value is distinct from v_base_value;
    v_remote_changed := v_remote_value is distinct from v_base_value;
    if v_local_changed and v_remote_changed and v_local_value is distinct from v_remote_value then
      v_conflicts := v_conflicts || jsonb_build_array(v_section);
    elsif v_local_changed then
      v_result := jsonb_set(v_result, array[v_section], v_local_value, true);
    else
      v_result := jsonb_set(v_result, array[v_section], v_remote_value, true);
    end if;
  end loop;

  foreach v_section in array v_sections loop
    v_merged := public.rps_merge_map_3way(p_base -> v_section, p_remote -> v_section, p_local -> v_section);
    v_result := jsonb_set(v_result, array[v_section], v_merged -> 'value', true);
    select coalesce(jsonb_agg(to_jsonb(v_section || ':' || value)), '[]'::jsonb)
      into v_base_value
      from jsonb_array_elements_text(v_merged -> 'conflicts');
    v_conflicts := v_conflicts || v_base_value;
  end loop;

  v_result := jsonb_set(
    v_result,
    '{version}',
    to_jsonb(greatest(
      coalesce((p_base ->> 'version')::integer, 4),
      coalesce((p_remote ->> 'version')::integer, 4),
      coalesce((p_local ->> 'version')::integer, 4)
    )),
    true
  );
  return jsonb_build_object('payload', v_result, 'conflicts', v_conflicts);
end;
$$;

revoke all on function public.rps_merge_map_3way(jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.rps_merge_payload_3way(jsonb,jsonb,jsonb) from public, anon, authenticated;

create or replace function public.rps_save_snapshot_atomic(
  p_organization_id uuid,
  p_ano integer,
  p_mes integer,
  p_base_payload jsonb,
  p_local_payload jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rps_snapshots%rowtype;
  v_merge jsonb;
  v_payload jsonb;
  v_conflicts jsonb;
  v_version bigint;
  v_updated_at timestamptz;
  v_section text;
  v_key text;
  v_old_section jsonb;
  v_new_section jsonb;
  v_old_exists boolean;
  v_new_exists boolean;
  v_previous_payload jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not public.rps_can_write(p_organization_id) then
    raise exception 'RPS_WRITE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_ano not between 2000 and 2200 or p_mes not between 1 and 12
    or p_local_payload is null or jsonb_typeof(p_local_payload) <> 'object'
    or p_request_id is null then
    raise exception 'RPS_SAVE_INVALID_INPUT' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  -- Também serializa a criação do primeiro snapshot do mês. Sem este lock,
  -- duas pessoas abrindo um período vazio ao mesmo tempo poderiam ambas não
  -- encontrar a linha e disputar o mesmo INSERT.
  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':' || p_ano::text || ':' || p_mes::text,
    1
  ));
  if exists (select 1 from public.rps_save_requests where request_id = p_request_id) then
    select * into v_row from public.rps_snapshots
    where organization_id = p_organization_id and ano = p_ano and mes = p_mes;
    return jsonb_build_object('payload', v_row.payload, 'version', v_row.version, 'updated_at', v_row.updated_at, 'idempotent', true);
  end if;

  select * into v_row
  from public.rps_snapshots
  where organization_id = p_organization_id and ano = p_ano and mes = p_mes
  for update;

  if not found then
    insert into public.rps_snapshots (organization_id, ano, mes, payload, version, created_by, updated_by)
    values (p_organization_id, p_ano, p_mes, p_local_payload, 1, auth.uid(), auth.uid())
    returning * into v_row;
    v_payload := v_row.payload;
    v_version := v_row.version;
    v_updated_at := v_row.updated_at;
  else
    v_previous_payload := v_row.payload;
    v_merge := public.rps_merge_payload_3way(
      coalesce(p_base_payload, v_row.payload),
      v_row.payload,
      p_local_payload
    );
    v_conflicts := v_merge -> 'conflicts';
    if jsonb_array_length(v_conflicts) > 0 then
      raise exception 'RPS_CONCURRENT_CONFLICT'
        using errcode = '40001', detail = v_conflicts::text,
              hint = 'Recarregue a RPS; o rascunho local foi preservado.';
    end if;
    v_payload := v_merge -> 'payload';
    update public.rps_snapshots
    set payload = v_payload,
        version = version + 1,
        updated_by = auth.uid()
    where id = v_row.id
    returning version, updated_at into v_version, v_updated_at;
  end if;

  foreach v_section in array array['unidades','dados','cellStyles','comentarios','dadosMes','dadosMeta','anexos','modoMes','modoMeta','configuracoes'] loop
    v_old_section := case when jsonb_typeof(v_previous_payload -> v_section) = 'object' then v_previous_payload -> v_section else '{}'::jsonb end;
    v_new_section := case when jsonb_typeof(v_payload -> v_section) = 'object' then v_payload -> v_section else '{}'::jsonb end;
    for v_key in
      select distinct key from (
        select jsonb_object_keys(v_old_section) key
        union all select jsonb_object_keys(v_new_section)
      ) keys
    loop
      v_old_exists := v_old_section ? v_key;
      v_new_exists := v_new_section ? v_key;
      if v_old_exists <> v_new_exists
        or (v_old_exists and v_new_exists and (v_old_section -> v_key) is distinct from (v_new_section -> v_key)) then
        insert into public.rps_change_audit (
          organization_id, ano, mes, snapshot_version, request_id,
          section_name, entry_key, old_exists, old_value,
          new_exists, new_value, changed_by
        ) values (
          p_organization_id, p_ano, p_mes, v_version, p_request_id,
          v_section, v_key, v_old_exists, v_old_section -> v_key,
          v_new_exists, v_new_section -> v_key, auth.uid()
        ) on conflict do nothing;
      end if;
    end loop;
  end loop;

  foreach v_section in array array['areas','indicadores'] loop
    if (v_previous_payload -> v_section) is distinct from (v_payload -> v_section) then
      insert into public.rps_change_audit (
        organization_id, ano, mes, snapshot_version, request_id,
        section_name, entry_key, old_exists, old_value,
        new_exists, new_value, changed_by
      ) values (
        p_organization_id, p_ano, p_mes, v_version, p_request_id,
        v_section, '$structure', v_previous_payload ? v_section, v_previous_payload -> v_section,
        v_payload ? v_section, v_payload -> v_section, auth.uid()
      ) on conflict do nothing;
    end if;
  end loop;

  insert into public.rps_save_requests (request_id, organization_id, ano, mes, result_version, created_by)
  values (p_request_id, p_organization_id, p_ano, p_mes, v_version, auth.uid());

  return jsonb_build_object(
    'payload', v_payload,
    'version', v_version,
    'updated_at', v_updated_at,
    'idempotent', false
  );
end;
$$;

revoke all on function public.rps_save_snapshot_atomic(uuid,integer,integer,jsonb,jsonb,uuid) from public, anon;
grant execute on function public.rps_save_snapshot_atomic(uuid,integer,integer,jsonb,jsonb,uuid) to authenticated;

comment on function public.rps_save_snapshot_atomic(uuid,integer,integer,jsonb,jsonb,uuid) is
  'Grava a RPS sob lock, faz merge 3-way por chave, rejeita conflito da mesma célula e audita cada alteração.';

commit;
