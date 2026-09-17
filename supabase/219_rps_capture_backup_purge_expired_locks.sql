begin;

-- rps_capture_backup (104_rps_resilient_backups.sql) insere um lock em
-- rps_maintenance_locks e so descobre conflito pela constraint unica
-- (organization_id, ano, mes), sem antes purgar locks ja expirados --
-- ao contrario de rps_start_restore, que ja faz essa limpeza. Quando uma
-- execucao do worker e encerrada no meio (ex.: timeout da Edge Function),
-- o lock fica orfao e bloqueia PARA SEMPRE qualquer novo backup daquele
-- periodo, mesmo depois de expirado (bug relatado 2026-09-17: "Criar
-- backup agora" falhando com "Periodo temporariamente bloqueado por
-- outra operacao" 3 dias depois do travamento).

-- Limpeza pontual dos locks ja vencidos que estao bloqueando hoje.
delete from public.rps_maintenance_locks
where expires_at <= now();

-- Execucoes que ficaram presas em "building" (mortas pelo timeout da
-- Edge Function antes de conseguirem se marcar como failed) nunca sao
-- retomadas nem entram na faxina de expurgo (que so olha ready/failed).
update public.rps_backup_runs
set status = 'failed',
    completed_at = now(),
    error_message = 'Execucao interrompida antes de concluir (worker encerrado no meio do processamento).'
where status = 'building'
  and captured_at <= now() - interval '2 hours';

create or replace function public.rps_capture_backup(
  p_organization_id uuid,
  p_ano integer,
  p_mes integer,
  p_kind text,
  p_created_by uuid default null,
  p_source_restore_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_snapshot public.rps_snapshots%rowtype;
  v_run_id uuid := gen_random_uuid();
  v_hash text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'rps_capture_backup exige service_role';
  end if;
  if p_kind not in ('scheduled', 'manual', 'pre_restore') then
    raise exception 'Tipo de backup invalido';
  end if;

  if p_kind <> 'pre_restore' then
    lock table public.rps_snapshots in share mode;
    lock table storage.objects in share mode;

    delete from public.rps_maintenance_locks
    where organization_id = p_organization_id and ano = p_ano and mes = p_mes
      and expires_at <= now();

    begin
      insert into public.rps_maintenance_locks (
        organization_id, ano, mes, backup_run_id, lock_reason, locked_by
      ) values (
        p_organization_id, p_ano, p_mes, v_run_id, 'backup', p_created_by
      );
    exception when unique_violation then
      raise exception 'Periodo temporariamente bloqueado por outra operacao';
    end;
  end if;

  select * into v_snapshot
  from public.rps_snapshots
  where organization_id = p_organization_id and ano = p_ano and mes = p_mes
  for share;

  if not found then
    raise exception 'Snapshot RPS %/% nao encontrado', p_mes, p_ano;
  end if;

  v_hash := encode(digest(convert_to(v_snapshot.payload::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.rps_backup_runs (
    id, organization_id, ano, mes, kind, status, retention_until,
    source_version, source_updated_at, snapshot_hash, storage_prefix,
    created_by, source_restore_id
  ) values (
    v_run_id, p_organization_id, p_ano, p_mes, p_kind, 'building',
    now() + interval '6 months', v_snapshot.version, v_snapshot.updated_at,
    v_hash,
    v_run_id::text || '/' || p_organization_id::text || '/' ||
      p_ano::text || '-' || lpad(p_mes::text, 2, '0'),
    p_created_by, p_source_restore_id
  );

  insert into public.rps_backup_snapshots (
    run_id, payload, source_version, source_updated_at, snapshot_hash
  ) values (
    v_run_id, v_snapshot.payload, v_snapshot.version, v_snapshot.updated_at, v_hash
  );

  return v_run_id;
end;
$$;

commit;
