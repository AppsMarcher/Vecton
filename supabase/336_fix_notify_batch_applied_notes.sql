-- A 328 acrescentou `new.notes` em notify_batch_applied. O gatilho roda tambem em headcount_import_batches,
-- que nao tem a coluna notes: a carga de headcount falhava com 'record "new" has no field "notes"'.
-- Le o campo via to_jsonb(new), que devolve null quando a coluna nao existe.
begin;

do $$declare def text;patched text;
begin
  def:=pg_get_functiondef('public.notify_batch_applied()'::regprocedure);
  patched:=replace(def,'new.notes is not distinct from ''Ajustes do formulário FAT''','(to_jsonb(new) ->> ''notes'') is not distinct from ''Ajustes do formulário FAT''');
  if patched=def then raise exception 'notify_batch_applied mudou: ajuste o patch da 336';end if;
  execute patched;
end $$;

commit;
