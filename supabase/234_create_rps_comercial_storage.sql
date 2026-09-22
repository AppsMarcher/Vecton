begin;

-- ============================================================================
-- Módulo RPS Comercial — bucket de anexos. Isolado do RPS Gestão e do A3
-- Estratégico (bucket próprio), mesmo padrão de 133_create_strategic_a3_storage
-- (que por sua vez seguiu 103_rps_attachments): gate de permissão é
-- can_manage_rps_comercial nas 4 operações, sem leitura ampla.
--
-- Caminho: organization_id/period/area_id/entry_id/block_type/file_id_filename
-- Primeiro segmento sempre o organization_id, valida como UUID antes de
-- checar permissão.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('rps-comercial-attachments', 'rps-comercial-attachments', false, 20971520)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "rps comercial managers read rps comercial attachments" on storage.objects;
create policy "rps comercial managers read rps comercial attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'rps-comercial-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_rps_comercial(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "rps comercial managers upload rps comercial attachments" on storage.objects;
create policy "rps comercial managers upload rps comercial attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'rps-comercial-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_rps_comercial(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "rps comercial managers update rps comercial attachments" on storage.objects;
create policy "rps comercial managers update rps comercial attachments"
on storage.objects for update
to authenticated
using (
  bucket_id = 'rps-comercial-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_rps_comercial(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'rps-comercial-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_rps_comercial(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "rps comercial managers delete rps comercial attachments" on storage.objects;
create policy "rps comercial managers delete rps comercial attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'rps-comercial-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_rps_comercial(((storage.foldername(name))[1])::uuid)
);

commit;
