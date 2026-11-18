begin;

-- RPCs da análise de variação de OPEX: snapshot calculado no servidor, ler/salvar análise,
-- existência de registros em lote e parâmetros da sinaleira.
-- Erros: 42501 acesso negado · 22023 validação · 40001 conflito de versão (expected_version).
-- Idempotente.

-- ---------------------------------------------------------------- idempotência
create or replace function public.opex_idem_get(p_org uuid, p_op text, p_key text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v jsonb;
begin
  if p_key is null or btrim(p_key) = '' then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || auth.uid()::text || p_op || p_key, 0));
  select result into v from public.opex_idempotency
   where organization_id = p_org and actor_user_id = auth.uid() and idem_key = p_key and operation = p_op;
  return v;
end;
$$;

create or replace function public.opex_idem_put(p_org uuid, p_op text, p_key text, p_result jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if p_key is null or btrim(p_key) = '' then return; end if;
  insert into public.opex_idempotency(organization_id, actor_user_id, idem_key, operation, result)
  values (p_org, auth.uid(), p_key, p_op, p_result)
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------- snapshot (interno)
-- Recalcula real e comparativo de uma conta+CC+período+fonte, com as mesmas regras do Cockpit:
--   * mês/YTD: soma dos meses selecionados; um mês sem carga torna o valor indisponível (nunca R$ 0);
--   * ano: realizado até o corte + meses seguintes do comparativo quando ele é Forecast (nome fora de "Budget ...").
-- Assinatura de revisão: contagem + último updated_at do realizado e contagem + soma do cenário no recorte conta/CC.
create or replace function public.opex_compute_snapshot(
  p_org uuid, p_cc uuid, p_account text, p_year integer, p_period text, p_month integer, p_scenario uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  sc record; cc_number text; m integer;
  first_m integer; last_m integer;
  act numeric(18,2)[] := array_fill(null::numeric, array[12]);
  cmp numeric(18,2)[] := array_fill(null::numeric, array[12]);
  act_cov integer[] := '{}'; cmp_cov integer[] := '{}';
  has_forecast boolean;
  v_actual numeric; v_comparison numeric; v_ok boolean;
  rev_a text; rev_c text; tmp numeric;
begin
  select id, name, reference_year into sc from public.forecast_scenarios where id = p_scenario and organization_id = p_org;
  if not found then raise exception 'Fonte de comparação inválida' using errcode = '22023'; end if;
  select cost_center_number into cc_number from public.cost_centers where id = p_cc and organization_id = p_org;
  if not found then raise exception 'Centro de custo inválido' using errcode = '22023'; end if;
  has_forecast := sc.name !~* '^budget([^a-z]|$)';

  for m in 1..12 loop
    if exists (select 1 from public.actuals_ledger_entries where organization_id = p_org and reference_year = p_year and reference_month = m) then
      act_cov := act_cov || m;
    end if;
    if exists (select 1 from public.forecast_ledger_entries where organization_id = p_org and scenario_id = p_scenario and reference_year = sc.reference_year and reference_month = m) then
      cmp_cov := cmp_cov || m;
    end if;
  end loop;

  for m in 1..12 loop
    if m = any (act_cov) then
      select coalesce(sum(amount), 0) into tmp from public.actuals_ledger_entries
       where organization_id = p_org and reference_year = p_year and reference_month = m and account_number = p_account
         and (cost_center_id = p_cc or (cost_center_id is null and cost_center_number = cc_number));
      act[m] := tmp;
    end if;
    if m = any (cmp_cov) then
      select coalesce(sum(amount), 0) into tmp from public.forecast_ledger_entries
       where organization_id = p_org and scenario_id = p_scenario and reference_year = sc.reference_year and reference_month = m and account_number = p_account
         and (cost_center_id = p_cc or (cost_center_id is null and cost_center_number = cc_number));
      cmp[m] := tmp;
    end if;
  end loop;

  first_m := case when p_period = 'month' then p_month else 1 end;
  last_m := case when p_period = 'year' then 12 else p_month end;

  v_ok := true; v_actual := 0;
  for m in first_m..last_m loop
    if p_period = 'year' and m > p_month then
      if has_forecast and cmp[m] is not null then v_actual := v_actual + cmp[m]; else v_ok := false; end if;
    elsif act[m] is null then v_ok := false;
    else v_actual := v_actual + act[m];
    end if;
  end loop;
  if not v_ok then v_actual := null; end if;

  v_ok := true; v_comparison := 0;
  for m in first_m..last_m loop
    if cmp[m] is null then v_ok := false; else v_comparison := v_comparison + cmp[m]; end if;
  end loop;
  if not v_ok then v_comparison := null; end if;

  select count(*)::text || ':' || coalesce(max(updated_at)::text, '') into rev_a from public.actuals_ledger_entries
   where organization_id = p_org and reference_year = p_year and account_number = p_account
     and (cost_center_id = p_cc or (cost_center_id is null and cost_center_number = cc_number));
  select count(*)::text || ':' || coalesce(sum(amount)::text, '') into rev_c from public.forecast_ledger_entries
   where organization_id = p_org and scenario_id = p_scenario and reference_year = sc.reference_year and account_number = p_account
     and (cost_center_id = p_cc or (cost_center_id is null and cost_center_number = cc_number));

  return jsonb_build_object(
    'actual', v_actual,
    'comparison', v_comparison,
    'variance', case when v_actual is null or v_comparison is null then null else v_actual - v_comparison end,
    'variance_pct', case when v_actual is null or v_comparison is null or v_comparison = 0 then null
                         else round((v_actual - v_comparison) / abs(v_comparison) * 100, 4) end,
    'coverage', jsonb_build_object('actualMonths', to_jsonb(act_cov), 'comparisonMonths', to_jsonb(cmp_cov)),
    'source_revision', 'a=' || rev_a || ';c=' || rev_c,
    'source_label', sc.name,
    'source_year', sc.reference_year,
    'has_forecast', has_forecast
  );
end;
$$;
revoke all on function public.opex_compute_snapshot(uuid, uuid, text, integer, text, integer, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- contexto (interno)
create or replace function public.opex_parse_ctx(p_ctx jsonb)
returns table (org uuid, cc uuid, account text, yr integer, period text, mth integer, scenario uuid, source_key text, scope_key text)
language plpgsql stable security definer set search_path to 'public'
as $$
declare v_org uuid; v_cc uuid; v_key text;
begin
  v_cc := nullif(p_ctx ->> 'costCenterId', '')::uuid;
  select c.organization_id into v_org from public.cost_centers c where c.id = v_cc;
  if v_org is null then raise exception 'Centro de custo inválido' using errcode = '22023'; end if;
  v_key := p_ctx ->> 'sourceKey';
  if v_key is null or v_key !~ '^scenario:[0-9a-fA-F-]{36}$' then raise exception 'Fonte de comparação inválida' using errcode = '22023'; end if;
  if (p_ctx ->> 'periodType') not in ('month', 'YTD', 'year') then raise exception 'Período inválido' using errcode = '22023'; end if;
  if (p_ctx ->> 'month')::int not between 1 and 12 then raise exception 'Mês inválido' using errcode = '22023'; end if;
  if nullif(btrim(p_ctx ->> 'accountNumber'), '') is null then raise exception 'Conta inválida' using errcode = '22023'; end if;
  return query select v_org, v_cc, btrim(p_ctx ->> 'accountNumber'), (p_ctx ->> 'year')::int, p_ctx ->> 'periodType',
    (p_ctx ->> 'month')::int, substring(v_key from 10)::uuid, v_key, coalesce(p_ctx ->> 'scopeKey', '');
end;
$$;
revoke all on function public.opex_parse_ctx(jsonb) from public, anon, authenticated;

create or replace function public.opex_analysis_dto(a public.opex_variance_analyses, live jsonb)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', a.id, 'found', true, 'version', a.version,
    'costCenterId', a.cost_center_id, 'costCenterNumber', a.cost_center_number_snapshot, 'costCenterName', a.cost_center_name_snapshot,
    'accountNumber', a.account_number, 'accountName', a.account_name_snapshot, 'groupName', a.group_reference,
    'year', a.reference_year, 'periodType', a.period_type, 'month', a.reference_month,
    'sourceKey', a.comparison_source_key, 'sourceLabel', a.comparison_source_label, 'sourceYear', a.comparison_source_year,
    'analysisState', a.analysis_state, 'monitor', a.monitor, 'nature', a.nature, 'cause', a.cause, 'futureEffect', a.future_effect,
    'expectedFinancialImpact', a.expected_financial_impact,
    'snapshot', jsonb_build_object('actual', a.actual_snapshot, 'comparison', a.comparison_snapshot, 'variance', a.variance_snapshot,
                                   'variancePct', a.variance_pct_snapshot, 'coverage', a.snapshot_coverage, 'at', a.snapshot_at),
    'dataChangedSinceReview', (live is not null and a.source_revision is distinct from live ->> 'source_revision'),
    'createdBy', a.created_by, 'updatedBy', a.updated_by, 'createdAt', a.created_at, 'updatedAt', a.updated_at
  );
$$;
revoke all on function public.opex_analysis_dto(public.opex_variance_analyses, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- ler análise (DTO financeiro)
create or replace function public.opex_get_analysis(p_ctx jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare c record; a public.opex_variance_analyses; live jsonb;
begin
  if auth.uid() is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  select * into c from public.opex_parse_ctx(p_ctx);
  if not public.opex_can_read_cc(c.org, c.cc) then raise exception 'Sem acesso ao centro de custo' using errcode = '42501'; end if;
  live := public.opex_compute_snapshot(c.org, c.cc, c.account, c.yr, c.period, c.mth, c.scenario);
  select * into a from public.opex_variance_analyses
   where organization_id = c.org and cost_center_id = c.cc and account_number = c.account and reference_year = c.yr
     and period_type = c.period and reference_month = c.mth and comparison_source_key = c.source_key
     and comparison_source_year = (live ->> 'source_year')::int and scope_key = c.scope_key and deleted_at is null;
  if not found then
    return jsonb_build_object('found', false, 'canWrite', public.opex_can_write_cc(c.org, c.cc), 'live', live);
  end if;
  return public.opex_analysis_dto(a, live) || jsonb_build_object('canWrite', public.opex_can_write_cc(c.org, c.cc), 'live', live);
end;
$$;

-- Garante a análise do contexto (usada ao salvar e ao criar uma ação). Sem causa quando vem de uma ação.
create or replace function public.opex_ensure_analysis(p_ctx jsonb, p_fields jsonb, p_require_cause boolean)
returns public.opex_variance_analyses
language plpgsql security definer set search_path to 'public'
as $$
declare c record; a public.opex_variance_analyses; live jsonb; cc_row record;
begin
  select * into c from public.opex_parse_ctx(p_ctx);
  live := public.opex_compute_snapshot(c.org, c.cc, c.account, c.yr, c.period, c.mth, c.scenario);
  select * into a from public.opex_variance_analyses
   where organization_id = c.org and cost_center_id = c.cc and account_number = c.account and reference_year = c.yr
     and period_type = c.period and reference_month = c.mth and comparison_source_key = c.source_key
     and comparison_source_year = (live ->> 'source_year')::int and scope_key = c.scope_key and deleted_at is null
   for update;
  if found then return a; end if;
  select cost_center_number, cost_center_name into cc_row from public.cost_centers where id = c.cc;
  insert into public.opex_variance_analyses (
    organization_id, cost_center_id, cost_center_number_snapshot, cost_center_name_snapshot, account_number, account_name_snapshot,
    group_reference, reference_year, period_type, reference_month, comparison_source_key, comparison_source_label, comparison_source_year,
    scope_key, actual_snapshot, comparison_snapshot, variance_snapshot, variance_pct_snapshot, snapshot_coverage, source_revision, snapshot_at,
    created_by, updated_by)
  values (c.org, c.cc, cc_row.cost_center_number, cc_row.cost_center_name, c.account, left(p_ctx ->> 'accountName', 300),
    left(p_ctx ->> 'groupName', 300), c.yr, c.period, c.mth, c.source_key, live ->> 'source_label', (live ->> 'source_year')::int,
    c.scope_key, (live ->> 'actual')::numeric, (live ->> 'comparison')::numeric, (live ->> 'variance')::numeric,
    (live ->> 'variance_pct')::numeric, live -> 'coverage', live ->> 'source_revision', now(), auth.uid(), auth.uid())
  returning * into a;
  return a;
end;
$$;
revoke all on function public.opex_ensure_analysis(jsonb, jsonb, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- salvar análise
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
  if v_state not in ('in_analysis', 'analyzed') then raise exception 'Situação inválida' using errcode = '22023'; end if;
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

-- ---------------------------------------------------------------- existência de registros (lote)
-- Só devolve linhas de CCs que o usuário pode ler: um CC não autorizado nunca aparece, nem por contagem.
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
           'analyses', t.analyses, 'actions', t.actions, 'open', t.open)), '[]'::jsonb) into result
  from (
    select r.cc, r.account,
      count(distinct a.id) filter (where a.cause is not null) as analyses,
      count(p.id) as actions,
      count(p.id) filter (where p.status <> 'completed') as open
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

-- ---------------------------------------------------------------- parâmetros da sinaleira
create or replace function public.opex_get_thresholds(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare t public.opex_variance_thresholds;
begin
  if auth.uid() is null or not public.is_org_member(p_org) then raise exception 'Sem acesso' using errcode = '42501'; end if;
  select * into t from public.opex_variance_thresholds where organization_id = p_org;
  if not found then
    return jsonb_build_object('yellowMoney', 10000, 'yellowPct', 5, 'redMoney', 20000, 'redPct', 10, 'version', 0,
      'canEdit', public.opex_is_admin(p_org));
  end if;
  return jsonb_build_object('yellowMoney', t.yellow_money, 'yellowPct', t.yellow_pct, 'redMoney', t.red_money, 'redPct', t.red_pct,
    'version', t.version, 'updatedBy', t.updated_by, 'updatedAt', t.updated_at, 'canEdit', public.opex_is_admin(p_org));
end;
$$;

create or replace function public.opex_save_thresholds(p_org uuid, p_values jsonb, p_expected_version integer)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare t public.opex_variance_thresholds; ym numeric; yp numeric; rm numeric; rp numeric;
begin
  if auth.uid() is null or not public.opex_is_admin(p_org) then raise exception 'Somente administradores alteram os parâmetros' using errcode = '42501'; end if;
  ym := (p_values ->> 'yellowMoney')::numeric; yp := (p_values ->> 'yellowPct')::numeric;
  rm := (p_values ->> 'redMoney')::numeric; rp := (p_values ->> 'redPct')::numeric;
  if ym is null or yp is null or rm is null or rp is null or least(ym, yp, rm, rp) <= 0 or rm < ym or rp < yp then
    raise exception 'Limites inválidos' using errcode = '22023';
  end if;
  select * into t from public.opex_variance_thresholds where organization_id = p_org for update;
  if not found then
    if coalesce(p_expected_version, 0) <> 0 then raise exception 'Versão desatualizada' using errcode = '40001'; end if;
    insert into public.opex_variance_thresholds (organization_id, yellow_money, yellow_pct, red_money, red_pct, version, updated_by)
    values (p_org, ym, yp, rm, rp, 1, auth.uid());
  else
    if p_expected_version is distinct from t.version then raise exception 'Versão desatualizada' using errcode = '40001'; end if;
    update public.opex_variance_thresholds set yellow_money = ym, yellow_pct = yp, red_money = rm, red_pct = rp,
      version = t.version + 1, updated_by = auth.uid(), updated_at = now() where organization_id = p_org;
  end if;
  return public.opex_get_thresholds(p_org);
end;
$$;

revoke all on function
  public.opex_idem_get(uuid, text, text), public.opex_idem_put(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function
  public.opex_get_analysis(jsonb), public.opex_save_analysis(jsonb, jsonb, integer, text), public.opex_record_presence(jsonb, jsonb),
  public.opex_get_thresholds(uuid), public.opex_save_thresholds(uuid, jsonb, integer) from public, anon;
grant execute on function
  public.opex_get_analysis(jsonb), public.opex_save_analysis(jsonb, jsonb, integer, text), public.opex_record_presence(jsonb, jsonb),
  public.opex_get_thresholds(uuid), public.opex_save_thresholds(uuid, jsonb, integer) to authenticated;

commit;
