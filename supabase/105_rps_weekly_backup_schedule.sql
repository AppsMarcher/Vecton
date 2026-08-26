begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

-- Antes de ativar o cron, grave estes dois secrets no Vault:
-- select vault.create_secret('https://SEU-PROJETO.supabase.co', 'rps_backup_project_url');
-- select vault.create_secret('UM-SEGREDO-LONGO-E-ALEATORIO', 'rps_backup_cron_secret');
-- O mesmo valor de rps_backup_cron_secret deve ser configurado como secret
-- RPS_BACKUP_CRON_SECRET da Edge Function rps-backup-worker.
create or replace function public.invoke_rps_weekly_backup()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_project_url text;
  v_cron_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'rps_backup_project_url' limit 1;
  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets where name = 'rps_backup_cron_secret' limit 1;

  if nullif(trim(v_project_url), '') is null or nullif(trim(v_cron_secret), '') is null then
    raise exception using
      errcode = 'P0001',
      message = 'RPS_BACKUP_VAULT_NOT_CONFIGURED',
      detail = 'Configure rps_backup_project_url e rps_backup_cron_secret no Vault.';
  end if;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/rps-backup-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-rps-backup-secret', v_cron_secret
    ),
    body := jsonb_build_object('trigger', 'cron', 'requested_at', now()),
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.invoke_rps_weekly_backup() from public, anon, authenticated;
grant execute on function public.invoke_rps_weekly_backup() to postgres, service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'rps-weekly-backup';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  -- pg_cron usa UTC. 21:45 UTC = 18:45 America/Sao_Paulo.
  perform cron.schedule(
    'rps-weekly-backup',
    '45 21 * * 1',
    'select public.invoke_rps_weekly_backup();'
  );
end;
$$;

commit;
