begin;

-- Funções internas, usadas só por triggers (que são SECURITY DEFINER e rodam como o dono).
-- Nenhum código do app, do robô de cargas ou das Edge Functions chama estas duas pela API,
-- e elas não conferem quem está chamando: tira o EXECUTE de quem vem pela API pública.
-- service_role e o dono (postgres) continuam com acesso.

revoke execute on function public.refresh_forecast_monthly_account_totals(uuid, uuid, integer, integer)
  from public, anon, authenticated;

revoke execute on function public.backfill_comercial_atribuicao_ledger(uuid)
  from public, anon, authenticated;

commit;
