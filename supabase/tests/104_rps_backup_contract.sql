do $$
begin
  if to_regclass('public.rps_backup_runs') is null then raise exception 'rps_backup_runs ausente'; end if;
  if to_regclass('public.rps_backup_snapshots') is null then raise exception 'rps_backup_snapshots ausente'; end if;
  if to_regclass('public.rps_backup_files') is null then raise exception 'rps_backup_files ausente'; end if;
  if to_regclass('public.rps_restore_operations') is null then raise exception 'rps_restore_operations ausente'; end if;
  if to_regclass('public.rps_maintenance_locks') is null then raise exception 'rps_maintenance_locks ausente'; end if;
  if to_regprocedure('public.rps_capture_backup(uuid,integer,integer,text,uuid,uuid)') is null then raise exception 'rps_capture_backup ausente'; end if;
  if to_regprocedure('public.rps_start_restore(uuid,integer,integer,uuid,uuid)') is null then raise exception 'rps_start_restore ausente'; end if;
  if to_regprocedure('public.rps_apply_restore_snapshot(uuid)') is null then raise exception 'rps_apply_restore_snapshot ausente'; end if;
  if to_regprocedure('public.rps_rollback_restore_snapshot(uuid)') is null then raise exception 'rps_rollback_restore_snapshot ausente'; end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_rps_snapshots_restore_lock' and not tgisinternal
  ) then raise exception 'trigger de lock ausente'; end if;
end;
$$;
