begin;

-- ============================================================================
-- Módulo A3 - Gestão Estratégica — bucket de anexos (Etapa 2, storage).
-- Isolado de RPS Gestão (bucket próprio, mesmo padrão de 103_rps_attachments,
-- mas gate de permissão é can_manage_strategic_a3 nas 4 operações — sem
-- leitura ampla, mesma regra das tabelas do módulo, decisão #15).
--
-- Caminho: organization_id/year/month/entity_type/entity_id/file_id_filename
-- Primeiro segmento sempre o organization_id — mesma convenção de
-- rps-attachments, valida como UUID antes de checar permissão.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('strategic-a3-attachments', 'strategic-a3-attachments', false, 20971520)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "strategic managers read strategic a3 attachments" on storage.objects;
create policy "strategic managers read strategic a3 attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'strategic-a3-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_strategic_a3(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "strategic managers upload strategic a3 attachments" on storage.objects;
create policy "strategic managers upload strategic a3 attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'strategic-a3-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_strategic_a3(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "strategic managers update strategic a3 attachments" on storage.objects;
create policy "strategic managers update strategic a3 attachments"
on storage.objects for update
to authenticated
using (
  bucket_id = 'strategic-a3-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_strategic_a3(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'strategic-a3-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_strategic_a3(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "strategic managers delete strategic a3 attachments" on storage.objects;
create policy "strategic managers delete strategic a3 attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'strategic-a3-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_manage_strategic_a3(((storage.foldername(name))[1])::uuid)
);

commit;
