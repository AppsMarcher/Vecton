begin;

-- Reafirma a leitura do bucket privado da RPS. Algumas bases chegaram à
-- migration de concorrência com as policies de escrita atualizadas, mas sem
-- a policy SELECT original; nesse estado o upload funciona e o carrossel não
-- consegue criar uma URL assinada para PNGs ou outros anexos.
drop policy if exists "org members read rps attachments" on storage.objects;
create policy "org members read rps attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'rps-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

commit;
