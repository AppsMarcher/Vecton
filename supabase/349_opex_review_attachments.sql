begin;

-- Anexos privados das análises e ações de OPEX.
--   * Bucket privado `opex-review-attachments` (20 MiB, tipos comuns sem conteúdo ativo). Sem URL pública.
--   * O caminho é gerado no servidor (organização/entidade/id) e a autorização do Storage olha o registro do anexo,
--     não só o primeiro segmento do caminho: adivinhar UUID/caminho não libera nada.
--   * Arquivo da análise só chega ao executor por compartilhamento explícito (ação + anexo), revogável.
--   * Upload em duas fases (prepare → upload → finalize): registro `pending` não aparece em lista nenhuma.
-- Idempotente.

create table if not exists public.opex_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  analysis_id uuid references public.opex_variance_analyses(id),
  action_id uuid references public.opex_action_plans(id),
  file_name text not null check (char_length(file_name) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  state text not null default 'pending' check (state in ('pending', 'ready', 'removed')),
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  removed_at timestamptz,
  check ((analysis_id is not null)::int + (action_id is not null)::int = 1)
);
create index if not exists opex_attachments_analysis_idx on public.opex_attachments (analysis_id) where state = 'ready';
create index if not exists opex_attachments_action_idx on public.opex_attachments (action_id) where state = 'ready';

create table if not exists public.opex_action_attachment_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  action_id uuid not null references public.opex_action_plans(id),
  attachment_id uuid not null references public.opex_attachments(id),
  shared_by uuid not null,
  shared_at timestamptz not null default now(),
  confirmed_restricted boolean not null default false,
  revoked_at timestamptz,
  revoked_by uuid
);
create unique index if not exists opex_action_attachment_shares_active_uq on public.opex_action_attachment_shares (action_id, attachment_id) where revoked_at is null;
create index if not exists opex_action_attachment_shares_attachment_idx on public.opex_action_attachment_shares (attachment_id) where revoked_at is null;

alter table public.opex_attachments enable row level security;
alter table public.opex_action_attachment_shares enable row level security;
revoke all on public.opex_attachments, public.opex_action_attachment_shares from public, anon, authenticated;
-- Sem policy: leitura/escrita só pelas funções abaixo.

-- ---------------------------------------------------------------- autorização
create or replace function public.opex_can_read_attachment(p_att uuid)
returns boolean
language plpgsql stable security definer set search_path to 'public'
as $$
declare a public.opex_attachments; v_cc uuid; p public.opex_action_plans;
begin
  if auth.uid() is null then return false; end if;
  select * into a from public.opex_attachments where id = p_att and state = 'ready';
  if not found or not public.is_org_member(a.organization_id) then return false; end if;
  if a.analysis_id is not null then
    select cost_center_id into v_cc from public.opex_variance_analyses where id = a.analysis_id and deleted_at is null;
    if v_cc is not null and public.opex_can_read_cc(a.organization_id, v_cc) then return true; end if;
    return exists (select 1 from public.opex_action_attachment_shares s join public.opex_action_plans pl on pl.id = s.action_id
                    where s.attachment_id = a.id and s.revoked_at is null and pl.deleted_at is null
                      and auth.uid() in (pl.owner_user_id, pl.assignee_user_id));
  end if;
  select * into p from public.opex_action_plans where id = a.action_id and deleted_at is null;
  if not found then return false; end if;
  if auth.uid() in (p.owner_user_id, p.assignee_user_id) then return true; end if;
  select cost_center_id into v_cc from public.opex_variance_analyses where id = p.analysis_id;
  return public.opex_can_read_cc(a.organization_id, v_cc);
end;
$$;

-- Quem pode enviar para a entidade: análise = escrita no CC; ação = dono ou executor atual (ação não concluída).
create or replace function public.opex_can_attach_to(p_type text, p_id uuid)
returns boolean
language plpgsql stable security definer set search_path to 'public'
as $$
declare an public.opex_variance_analyses; p public.opex_action_plans;
begin
  if auth.uid() is null then return false; end if;
  if p_type = 'analysis' then
    select * into an from public.opex_variance_analyses where id = p_id and deleted_at is null;
    return found and public.opex_can_write_cc(an.organization_id, an.cost_center_id);
  elsif p_type = 'action' then
    select * into p from public.opex_action_plans where id = p_id and deleted_at is null;
    return found and public.is_org_member(p.organization_id) and p.status <> 'completed' and auth.uid() in (p.owner_user_id, p.assignee_user_id);
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------- preparar / finalizar upload
create or replace function public.opex_prepare_upload(p_entity jsonb, p_meta jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_type text := p_entity ->> 'type'; v_id uuid := nullif(p_entity ->> 'id', '')::uuid; v_org uuid;
  v_name text := btrim(coalesce(p_meta ->> 'fileName', '')); v_mime text := lower(btrim(coalesce(p_meta ->> 'mimeType', '')));
  v_size bigint := nullif(p_meta ->> 'size', '')::bigint; v_ext text; v_att uuid := gen_random_uuid(); v_path text;
begin
  if not public.opex_can_attach_to(v_type, v_id) then raise exception 'Sem permissão para anexar' using errcode = '42501'; end if;
  if v_type = 'analysis' then select organization_id into v_org from public.opex_variance_analyses where id = v_id;
  else select organization_id into v_org from public.opex_action_plans where id = v_id; end if;
  if v_name = '' or char_length(v_name) > 255 or v_name ~ '[\\/[:cntrl:]]' then raise exception 'Nome de arquivo inválido' using errcode = '22023'; end if;
  if v_size is null or v_size <= 0 or v_size > 20971520 then raise exception 'O arquivo excede 20 MiB ou está vazio' using errcode = '22023'; end if;
  v_ext := lower(substring(v_name from '\.([^.]+)$'));
  if v_ext in ('html', 'htm', 'xhtml', 'svg', 'js', 'mjs', 'exe', 'bat', 'cmd', 'msi', 'sh', 'php', 'jar', 'vbs', 'ps1', 'dll', 'com', 'scr', 'xml')
     or v_mime in ('text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/javascript', 'application/javascript', 'application/xml', 'text/xml')
     or v_mime not in ('image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/csv', 'text/plain', 'application/zip') then
    raise exception 'Tipo de arquivo não permitido' using errcode = '22023';
  end if;
  v_path := v_org::text || '/' || v_type || '/' || v_id::text || '/' || v_att::text;
  insert into public.opex_attachments (id, organization_id, analysis_id, action_id, file_name, storage_path, mime_type, size_bytes, uploaded_by)
  values (v_att, v_org, case when v_type = 'analysis' then v_id end, case when v_type = 'action' then v_id end, v_name, v_path, v_mime, v_size, auth.uid());
  return jsonb_build_object('attachmentId', v_att, 'bucket', 'opex-review-attachments', 'path', v_path);
end;
$$;

create or replace function public.opex_finalize_upload(p_attachment_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public', 'storage'
as $$
declare a public.opex_attachments;
begin
  select * into a from public.opex_attachments where id = p_attachment_id and uploaded_by = auth.uid() and state = 'pending' for update;
  if not found then raise exception 'Anexo indisponível' using errcode = '42501'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'opex-review-attachments' and o.name = a.storage_path) then
    raise exception 'O upload não foi concluído' using errcode = '22023';
  end if;
  update public.opex_attachments set state = 'ready', finalized_at = now() where id = a.id returning * into a;
  if a.action_id is not null then
    insert into public.opex_action_events (organization_id, action_id, kind, actor_user_id, assignment_cycle, action_version, shared_text)
    select p.organization_id, p.id, 'attachment_added', auth.uid(), p.assignment_cycle, p.version, 'Arquivo adicionado: ' || a.file_name
      from public.opex_action_plans p where p.id = a.action_id;
  end if;
  return jsonb_build_object('id', a.id, 'fileName', a.file_name, 'mimeType', a.mime_type, 'size', a.size_bytes);
end;
$$;

-- ---------------------------------------------------------------- listar / acessar
create or replace function public.opex_list_attachments(p_entity jsonb)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare v_type text := p_entity ->> 'type'; v_id uuid := nullif(p_entity ->> 'id', '')::uuid; v_cc uuid; v_org uuid; p public.opex_action_plans; result jsonb;
begin
  if auth.uid() is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  if v_type = 'analysis' then
    select cost_center_id, organization_id into v_cc, v_org from public.opex_variance_analyses where id = v_id and deleted_at is null;
    if v_cc is null or not public.opex_can_read_cc(v_org, v_cc) then raise exception 'Sem acesso' using errcode = '42501'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'fileName', a.file_name, 'mimeType', a.mime_type, 'size', a.size_bytes, 'createdAt', a.created_at,
        'uploadedBy', public.opex_user_name(a.organization_id, a.uploaded_by),
        'sharedActionIds', coalesce((select jsonb_agg(s.action_id) from public.opex_action_attachment_shares s where s.attachment_id = a.id and s.revoked_at is null), '[]'::jsonb))
        order by a.created_at, a.id), '[]'::jsonb) into result
      from public.opex_attachments a where a.analysis_id = v_id and a.state = 'ready';
    return result;
  elsif v_type = 'action' then
    select * into p from public.opex_action_plans where id = v_id and deleted_at is null;
    if not found or not public.is_org_member(p.organization_id) then raise exception 'Sem acesso' using errcode = '42501'; end if;
    select cost_center_id into v_cc from public.opex_variance_analyses where id = p.analysis_id;
    if auth.uid() not in (p.owner_user_id, p.assignee_user_id) and not public.opex_can_read_cc(p.organization_id, v_cc) then raise exception 'Sem acesso' using errcode = '42501'; end if;
    -- DTO operacional: só arquivos da própria ação e os compartilhados com ela (sem ID da análise).
    select coalesce(jsonb_agg(x.item order by x.created_at, x.id), '[]'::jsonb) into result from (
      select a.created_at, a.id, jsonb_build_object('id', a.id, 'fileName', a.file_name, 'mimeType', a.mime_type, 'size', a.size_bytes, 'createdAt', a.created_at,
          'origin', 'action', 'uploadedBy', public.opex_user_name(a.organization_id, a.uploaded_by)) as item
        from public.opex_attachments a where a.action_id = p.id and a.state = 'ready'
      union all
      select a.created_at, a.id, jsonb_build_object('id', a.id, 'fileName', a.file_name, 'mimeType', a.mime_type, 'size', a.size_bytes, 'createdAt', a.created_at,
          'origin', 'shared', 'uploadedBy', public.opex_user_name(a.organization_id, a.uploaded_by))
        from public.opex_action_attachment_shares s join public.opex_attachments a on a.id = s.attachment_id and a.state = 'ready'
       where s.action_id = p.id and s.revoked_at is null) x;
    return result;
  end if;
  raise exception 'Entidade inválida' using errcode = '22023';
end;
$$;

-- Reautoriza a cada abertura; o cliente então assina a URL (curta) no Storage, cuja policy repete esta checagem.
create or replace function public.opex_attachment_access(p_attachment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare a public.opex_attachments;
begin
  if not public.opex_can_read_attachment(p_attachment_id) then raise exception 'Anexo indisponível' using errcode = '42501'; end if;
  select * into a from public.opex_attachments where id = p_attachment_id;
  return jsonb_build_object('bucket', 'opex-review-attachments', 'path', a.storage_path, 'fileName', a.file_name, 'mimeType', a.mime_type, 'expiresIn', 60);
end;
$$;

-- ---------------------------------------------------------------- compartilhar / revogar / remover
create or replace function public.opex_share_attachment(p_action_id uuid, p_attachment_id uuid, p_confirm_restricted boolean)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare p public.opex_action_plans; a public.opex_attachments; v_cc uuid; restricted boolean;
begin
  p := public.opex_lock_action(p_action_id);
  select cost_center_id into v_cc from public.opex_variance_analyses where id = p.analysis_id;
  if p.owner_user_id <> auth.uid() or not public.opex_can_write_cc(p.organization_id, v_cc) then raise exception 'Somente o dono do plano compartilha arquivos' using errcode = '42501'; end if;
  select * into a from public.opex_attachments where id = p_attachment_id and state = 'ready' and analysis_id = p.analysis_id;
  if not found then raise exception 'Anexo indisponível' using errcode = '42501'; end if;
  restricted := not public.opex_user_can_read_cc(p.assignee_user_id, p.organization_id, v_cc);
  if restricted and not coalesce(p_confirm_restricted, false) then
    raise exception 'Este arquivo será visível a quem não tem acesso ao centro de custo. Confirme para compartilhar.' using errcode = '22023', hint = 'confirm_required';
  end if;
  insert into public.opex_action_attachment_shares (organization_id, action_id, attachment_id, shared_by, confirmed_restricted)
  values (p.organization_id, p.id, a.id, auth.uid(), restricted and coalesce(p_confirm_restricted, false))
  on conflict (action_id, attachment_id) where revoked_at is null do nothing;
  perform public.opex_log_event(p, 'attachment_shared', 'Arquivo compartilhado: ' || a.file_name, jsonb_build_object('attachment', a.id, 'confirmedRestricted', restricted), null);
  return jsonb_build_object('actionId', p.id, 'attachmentId', a.id, 'restricted', restricted);
end;
$$;

create or replace function public.opex_revoke_share(p_action_id uuid, p_attachment_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare p public.opex_action_plans; a public.opex_attachments; v_count integer;
begin
  p := public.opex_lock_action(p_action_id);
  if p.owner_user_id <> auth.uid() then raise exception 'Somente o dono do plano revoga compartilhamentos' using errcode = '42501'; end if;
  update public.opex_action_attachment_shares set revoked_at = now(), revoked_by = auth.uid()
   where action_id = p.id and attachment_id = p_attachment_id and revoked_at is null;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    select * into a from public.opex_attachments where id = p_attachment_id;
    perform public.opex_log_event(p, 'attachment_unshared', 'Compartilhamento removido: ' || a.file_name, jsonb_build_object('attachment', a.id), null);
  end if;
  return jsonb_build_object('revoked', v_count);
end;
$$;

create or replace function public.opex_remove_attachment(p_attachment_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare a public.opex_attachments;
begin
  select * into a from public.opex_attachments where id = p_attachment_id and state in ('pending', 'ready') for update;
  if not found then raise exception 'Anexo indisponível' using errcode = '42501'; end if;
  if not (a.uploaded_by = auth.uid() or public.opex_can_attach_to(case when a.analysis_id is not null then 'analysis' else 'action' end, coalesce(a.analysis_id, a.action_id))) then
    raise exception 'Sem permissão para remover' using errcode = '42501';
  end if;
  if exists (select 1 from public.opex_action_attachment_shares s where s.attachment_id = a.id and s.revoked_at is null) then
    raise exception 'Revogue os compartilhamentos antes de remover o arquivo' using errcode = '22023';
  end if;
  update public.opex_attachments set state = 'removed', removed_at = now() where id = a.id;
  return jsonb_build_object('removed', true);
end;
$$;

-- ---------------------------------------------------------------- Storage
insert into storage.buckets (id, name, public, file_size_limit)
values ('opex-review-attachments', 'opex-review-attachments', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- As policies chamam funções SECURITY DEFINER: o usuário não tem (nem deve ter) SELECT direto nas tabelas de anexos.
create or replace function public.opex_storage_can_read(p_name text)
returns boolean
language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from public.opex_attachments a where a.storage_path = p_name and public.opex_can_read_attachment(a.id)) $$;

create or replace function public.opex_storage_can_upload(p_name text)
returns boolean
language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from public.opex_attachments a where a.storage_path = p_name and a.state = 'pending' and a.uploaded_by = auth.uid()) $$;

revoke all on function public.opex_storage_can_read(text), public.opex_storage_can_upload(text) from public, anon;
grant execute on function public.opex_storage_can_read(text), public.opex_storage_can_upload(text) to authenticated;

drop policy if exists "opex read attachments" on storage.objects;
create policy "opex read attachments" on storage.objects for select to authenticated
using (bucket_id = 'opex-review-attachments' and public.opex_storage_can_read(name));

drop policy if exists "opex upload attachments" on storage.objects;
create policy "opex upload attachments" on storage.objects for insert to authenticated
with check (bucket_id = 'opex-review-attachments' and public.opex_storage_can_upload(name));

revoke all on function public.opex_can_read_attachment(uuid), public.opex_can_attach_to(text, uuid) from public, anon;
grant execute on function public.opex_can_read_attachment(uuid), public.opex_can_attach_to(text, uuid) to authenticated;
revoke all on function
  public.opex_prepare_upload(jsonb, jsonb), public.opex_finalize_upload(uuid), public.opex_list_attachments(jsonb), public.opex_attachment_access(uuid),
  public.opex_share_attachment(uuid, uuid, boolean), public.opex_revoke_share(uuid, uuid), public.opex_remove_attachment(uuid) from public, anon;
grant execute on function
  public.opex_prepare_upload(jsonb, jsonb), public.opex_finalize_upload(uuid), public.opex_list_attachments(jsonb), public.opex_attachment_access(uuid),
  public.opex_share_attachment(uuid, uuid, boolean), public.opex_revoke_share(uuid, uuid), public.opex_remove_attachment(uuid) to authenticated;

commit;
