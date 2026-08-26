begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

-- Antes de ativar o cron, grave estes dois secrets no Vault:
-- select vault.create_secret('https://SEU-PROJETO.supabase.co', 'market_commodities_project_url');
-- select vault.create_secret('UM-SEGREDO-LONGO-E-ALEATORIO', 'market_commodities_cron_secret');
-- O mesmo valor de market_commodities_cron_secret deve ser configurado como
-- secret MARKET_COMMODITIES_CRON_SECRET da Edge Function market-commodities-worker,
-- e GIRORURAL_API_KEY também precisa estar configurada nela.
create or replace function public.invoke_market_commodities_worker()
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
  from vault.decrypted_secrets where name = 'market_commodities_project_url' limit 1;
  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets where name = 'market_commodities_cron_secret' limit 1;

  if nullif(trim(v_project_url), '') is null or nullif(trim(v_cron_secret), '') is null then
    raise warning 'market-commodities-worker nao disparado: configure market_commodities_project_url e market_commodities_cron_secret no Vault';
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/market-commodities-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-market-commodities-secret', v_cron_secret
    ),
    body := jsonb_build_object('trigger', 'cron', 'requested_at', now())
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.invoke_market_commodities_worker() from public, anon, authenticated;
grant execute on function public.invoke_market_commodities_worker() to postgres, service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'market-commodities-daily';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  -- pg_cron usa UTC. 21:15 UTC = 18:15 America/Sao_Paulo — pouco depois do
  -- fechamento diário dos indicadores CEPEA/B3 que o GiroRural consolida.
  perform cron.schedule(
    'market-commodities-daily',
    '15 21 * * 1-5',
    'select public.invoke_market_commodities_worker();'
  );
end;
$$;

commit;
