begin;

-- Arquivos anexados às células semanais da RPS. O conteúdo fica no Storage;
-- o snapshot guarda apenas metadados e o caminho privado de cada objeto.
insert into storage.buckets (id, name, public, file_size_limit)
values ('rps-attachments', 'rps-attachments', false, 20971520)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

-- O primeiro segmento do caminho é sempre o organization_id.
drop policy if exists "org members read rps attachments" on storage.objects;
create policy "org members read rps attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'rps-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "org editors upload rps attachments" on storage.objects;
create policy "org editors upload rps attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'rps-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_org_editor(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "org editors update rps attachments" on storage.objects;
create policy "org editors update rps attachments"
on storage.objects for update
to authenticated
using (
  bucket_id = 'rps-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_org_editor(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'rps-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_org_editor(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "org editors delete rps attachments" on storage.objects;
create policy "org editors delete rps attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'rps-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_org_editor(((storage.foldername(name))[1])::uuid)
);

commit;
