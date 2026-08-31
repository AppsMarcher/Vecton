-- Execute depois da migration 179. Todas as verificações são revertidas.
begin;

do $test$
declare
  v_base jsonb := '{"dados":{"industrial|a|S4":"1"},"configuracoes":{}}'::jsonb;
  v_remote jsonb := '{"dados":{"industrial|a|S4":"1","industrial|b|S4":"2"},"configuracoes":{}}'::jsonb;
  v_local jsonb := '{"dados":{"industrial|a|S4":"1","industrial|c|S4":"3"},"configuracoes":{}}'::jsonb;
  v_result jsonb;
  v_conflict jsonb;
  v_rps_user uuid;
  v_rps_org uuid;
begin
  if to_regprocedure('public.rps_can_write(uuid)') is null then raise exception 'rps_can_write ausente'; end if;
  if to_regprocedure('public.rps_can_manage(uuid)') is null then raise exception 'rps_can_manage ausente'; end if;
  if to_regprocedure('public.rps_merge_map_3way(jsonb,jsonb,jsonb)') is null then raise exception 'rps_merge_map_3way ausente'; end if;
  if to_regprocedure('public.rps_merge_payload_3way(jsonb,jsonb,jsonb)') is null then raise exception 'rps_merge_payload_3way ausente'; end if;
  if to_regprocedure('public.rps_save_snapshot_atomic(uuid,integer,integer,jsonb,jsonb,uuid)') is null then raise exception 'rps_save_snapshot_atomic ausente'; end if;
  if to_regclass('public.rps_change_audit') is null then raise exception 'rps_change_audit ausente'; end if;
  if to_regclass('public.rps_save_requests') is null then raise exception 'rps_save_requests ausente'; end if;

  v_result := public.rps_merge_payload_3way(v_base, v_remote, v_local);
  if v_result #>> '{payload,dados,industrial|b|S4}' <> '2'
    or v_result #>> '{payload,dados,industrial|c|S4}' <> '3'
    or jsonb_array_length(v_result -> 'conflicts') <> 0 then
    raise exception 'merge de campos diferentes não preservou os dois lados: %', v_result;
  end if;

  v_conflict := public.rps_merge_map_3way(
    '{"mesma":"1"}'::jsonb,
    '{"mesma":"2"}'::jsonb,
    '{"mesma":"3"}'::jsonb
  );
  if v_conflict -> 'conflicts' <> '["mesma"]'::jsonb
    or v_conflict #>> '{value,mesma}' <> '2' then
    raise exception 'conflito da mesma chave não foi detectado: %', v_conflict;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rps_snapshots'
      and policyname = 'rps profiles manage rps snapshots'
  ) then raise exception 'policy funcional de escrita da RPS ausente'; end if;

  select p.user_id, p.organization_id
    into v_rps_user, v_rps_org
  from public.user_profiles p
  where coalesce(p.is_active, true)
    and (
      p.access_role::text = 'rps_gestao'
      or 'rps_gestao' = any(coalesce(p.additional_access_roles, '{}'::text[]))
    )
  limit 1;
  if v_rps_user is not null then
    perform set_config('request.jwt.claim.sub', v_rps_user::text, true);
    if not public.rps_can_write(v_rps_org) then
      raise exception 'perfil RPS Gestão ativo não recebeu permissão funcional de escrita';
    end if;
  end if;
end;
$test$;

rollback;
