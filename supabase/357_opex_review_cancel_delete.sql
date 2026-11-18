begin;

-- Situação "Cancelado" da análise (além de Em análise / Analisado) e exclusão (lógica) por administrador.
alter table public.opex_variance_analyses drop constraint if exists opex_variance_analyses_analysis_state_check;
alter table public.opex_variance_analyses
  add constraint opex_variance_analyses_analysis_state_check check (analysis_state in ('in_analysis', 'analyzed', 'cancelled'));

alter table public.opex_variance_analyses add column if not exists deleted_by uuid;
alter table public.opex_action_plans add column if not exists deleted_by uuid;

create or replace function public.opex_save_analysis(p_ctx jsonb, p_fields jsonb, p_expected_version integer, p_idem_key text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare c record; a public.opex_variance_analyses; live jsonb; prev jsonb; result jsonb;
  v_state text; v_nature text; v_cause text; v_effect text; v_impact numeric; v_monitor boolean; v_exists boolean;
begin
  if auth.uid() is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  select * into c from public.opex_parse_ctx(p_ctx);
  if not public.opex_can_write_cc(c.org, c.cc) then raise exception 'Sem permissão para escrever análises neste centro de custo' using errcode = '42501'; end if;
  prev := public.opex_idem_get(c.org, 'save_analysis', p_idem_key);
  if prev is not null then return prev; end if;

  v_state := coalesce(p_fields ->> 'analysisState', 'in_analysis');
  v_nature := nullif(p_fields ->> 'nature', '');
  v_cause := nullif(btrim(coalesce(p_fields ->> 'cause', '')), '');
  v_effect := nullif(btrim(coalesce(p_fields ->> 'futureEffect', '')), '');
  v_monitor := coalesce((p_fields ->> 'monitor')::boolean, false);
  v_impact := nullif(p_fields ->> 'expectedFinancialImpact', '')::numeric;
  if v_state not in ('in_analysis', 'analyzed', 'cancelled') then raise exception 'Situação inválida' using errcode = '22023'; end if;
  if v_nature is not null and v_nature not in ('recurring', 'temporary', 'one_off', 'data_issue') then raise exception 'Natureza inválida' using errcode = '22023'; end if;
  if v_cause is null then raise exception 'Informe a causa da variação' using errcode = '22023'; end if;
  if v_state = 'analyzed' and v_nature is null then raise exception 'Informe a natureza da variação' using errcode = '22023'; end if;
  if char_length(v_cause) > 8000 or char_length(coalesce(v_effect, '')) > 8000 then raise exception 'Texto muito longo' using errcode = '22023'; end if;
  if v_impact is not null and (v_impact < 0 or v_impact > 1e13) then raise exception 'Impacto financeiro inválido' using errcode = '22023'; end if;

  a := public.opex_ensure_analysis(p_ctx, p_fields, true);
  v_exists := a.cause is not null or a.version > 1;
  -- Linha criada agora por esta chamada tem version 1 e cause nula: aceita expected_version nulo ou 0.
  if a.cause is null and a.version = 1 then
    if coalesce(p_expected_version, 0) not in (0, 1) then raise exception 'Versão desatualizada' using errcode = '40001'; end if;
  elsif p_expected_version is distinct from a.version then
    raise exception 'A análise foi alterada por outra sessão' using errcode = '40001';
  end if;

  live := public.opex_compute_snapshot(c.org, c.cc, c.account, c.yr, c.period, c.mth, c.scenario);
  update public.opex_variance_analyses set
    analysis_state = v_state, monitor = v_monitor, nature = v_nature, cause = v_cause, future_effect = v_effect,
    expected_financial_impact = v_impact,
    actual_snapshot = (live ->> 'actual')::numeric, comparison_snapshot = (live ->> 'comparison')::numeric,
    variance_snapshot = (live ->> 'variance')::numeric, variance_pct_snapshot = (live ->> 'variance_pct')::numeric,
    snapshot_coverage = live -> 'coverage', source_revision = live ->> 'source_revision', snapshot_at = now(),
    version = a.version + case when a.cause is null and a.version = 1 then 0 else 1 end,
    updated_by = auth.uid(), updated_at = now()
  where id = a.id returning * into a;

  insert into public.opex_analysis_revisions (organization_id, analysis_id, version, content, created_by)
  values (a.organization_id, a.id, a.version,
    jsonb_build_object('analysisState', a.analysis_state, 'monitor', a.monitor, 'nature', a.nature, 'cause', a.cause,
      'futureEffect', a.future_effect, 'expectedFinancialImpact', a.expected_financial_impact,
      'snapshot', jsonb_build_object('actual', a.actual_snapshot, 'comparison', a.comparison_snapshot, 'variance', a.variance_snapshot),
      'sourceRevision', a.source_revision), auth.uid())
  on conflict (analysis_id, version) do update set content = excluded.content, created_by = excluded.created_by, created_at = now();

  result := public.opex_analysis_dto(a, live) || jsonb_build_object('canWrite', true, 'live', live);
  perform public.opex_idem_put(c.org, 'save_analysis', p_idem_key, result);
  return result;
end;
$$;

create or replace function public.opex_record_presence(p_ctx jsonb, p_rows jsonb)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare v_key text; v_scenario uuid; v_year integer; v_period text; v_month integer; v_scope text; v_src_year integer;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'Lote inválido' using errcode = '22023'; end if;
  v_key := p_ctx ->> 'sourceKey';
  if v_key is null or v_key !~ '^scenario:[0-9a-fA-F-]{36}$' then raise exception 'Fonte de comparação inválida' using errcode = '22023'; end if;
  v_year := (p_ctx ->> 'year')::int; v_period := p_ctx ->> 'periodType'; v_month := (p_ctx ->> 'month')::int; v_scope := coalesce(p_ctx ->> 'scopeKey', '');
  v_scenario := substring(v_key from 10)::uuid;
  select reference_year into v_src_year from public.forecast_scenarios s
   where s.id = v_scenario and public.is_org_member(s.organization_id);
  if v_src_year is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object('costCenterId', t.cc, 'accountNumber', t.account,
           'analyses', t.analyses, 'actions', t.actions, 'open', t.open, 'cancelled', t.cancelled)), '[]'::jsonb) into result
  from (
    select r.cc, r.account,
      count(distinct a.id) filter (where a.cause is not null) as analyses,
      count(p.id) as actions,
      count(p.id) filter (where p.status <> 'completed') as open,
      count(distinct a.id) filter (where a.cause is not null and a.analysis_state = 'cancelled') as cancelled
    from jsonb_to_recordset(p_rows) as r(cc uuid, account text)
    join public.cost_centers c on c.id = r.cc
    join public.opex_variance_analyses a
      on a.organization_id = c.organization_id and a.cost_center_id = r.cc and a.account_number = btrim(r.account)
     and a.reference_year = v_year and a.period_type = v_period and a.reference_month = v_month
     and a.comparison_source_key = v_key and a.comparison_source_year = v_src_year and a.scope_key = v_scope and a.deleted_at is null
    left join public.opex_action_plans p on p.analysis_id = a.id and p.deleted_at is null
    where public.opex_can_read_cc(c.organization_id, r.cc)
    group by r.cc, r.account
    having count(distinct a.id) filter (where a.cause is not null) > 0 or count(p.id) > 0
  ) t;
  return result;
end;
$$;

-- Exclusão lógica (somente administrador/super administrador). Nada é apagado fisicamente: deleted_at/deleted_by ficam
-- registrados, a linha some de todas as telas, listas, lembretes e e-mails pendentes (que já filtram deleted_at).
-- Excluir uma análise também oculta as ações dela (e, por consequência, os anexos).
create or replace function public.opex_delete_record(p_type text, p_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_org uuid; v_analysis uuid;
begin
  if auth.uid() is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  if p_type not in ('analysis', 'action') then raise exception 'Tipo inválido' using errcode = '22023'; end if;
  if p_type = 'analysis' then
    select organization_id into v_org from public.opex_variance_analyses where id = p_id and deleted_at is null for update;
  else
    select organization_id, analysis_id into v_org, v_analysis from public.opex_action_plans where id = p_id and deleted_at is null for update;
  end if;
  if v_org is null then raise exception 'Registro não encontrado' using errcode = '22023'; end if;
  if not public.opex_is_admin(v_org) then raise exception 'Somente administradores excluem registros' using errcode = '42501'; end if;
  if p_type = 'analysis' then
    update public.opex_action_plans set deleted_at = now(), deleted_by = auth.uid() where analysis_id = p_id and deleted_at is null;
    update public.opex_variance_analyses set deleted_at = now(), deleted_by = auth.uid() where id = p_id;
  else
    update public.opex_action_plans set deleted_at = now(), deleted_by = auth.uid() where id = p_id;
  end if;
  return jsonb_build_object('deleted', true, 'type', p_type, 'id', p_id);
end;
$$;

revoke all on function public.opex_delete_record(text, uuid) from public, anon;
grant execute on function public.opex_delete_record(text, uuid) to authenticated;
revoke all on function public.opex_save_analysis(jsonb, jsonb, integer, text), public.opex_record_presence(jsonb, jsonb) from public, anon;
grant execute on function public.opex_save_analysis(jsonb, jsonb, integer, text), public.opex_record_presence(jsonb, jsonb) to authenticated;

commit;
