-- Melhoria #10 do review de segurança (2026-08-29): não existia teste SQL
-- nenhum pro módulo Estratégico — RBAC por-A3, ação multi-A3, período
-- fechado, troca de cenário, override automático e concorrência (CAS) só
-- eram validados manualmente. Roda dentro de begin;/rollback; (mesmo
-- padrão de 079_comercial_report_row_axis_contract.sql) — nada persiste,
-- mesmo se todas as asserções passarem.
--
-- AVISO: a parte de RBAC precisa simular usuários diferentes chamando
-- auth.uid() (impersonação via request.jwt.claim.sub), o que exige criar
-- linhas reais em auth.users — não existe precedente disso em nenhum outro
-- teste deste repositório, e não foi possível rodar este arquivo contra um
-- banco de verdade antes de commitar (sem acesso a psql/Supabase CLI nesta
-- sessão). A criação das fixtures fica isolada num bloco próprio com
-- "exception when others" — se o schema de auth.users deste projeto tiver
-- alguma particularidade não prevista aqui (trigger, coluna NOT NULL a
-- mais), o teste pula com um NOTICE explicando o motivo em vez de falhar
-- destrutivamente. Rode isto numa branch/staging antes de confiar nele em
-- produção.
begin;

do $test$
declare
  v_org uuid;
  v_cycle uuid;
  v_scenario_a uuid;
  v_scenario_b uuid;
  v_a3_comercial uuid;
  v_a3_industrial uuid;
  v_a3_disabled uuid;
  v_kpi_direct uuid;
  v_kpi_computed uuid;
  v_admin uuid := gen_random_uuid();
  v_mgr_comercial uuid := gen_random_uuid();
  v_mgr_industrial uuid := gen_random_uuid();
  v_mgr_none uuid := gen_random_uuid();
  v_ge_read uuid := gen_random_uuid();
  v_ge_write uuid := gen_random_uuid();
  v_action_id uuid;
  v_record_id uuid;
  v_version bigint;
  v_result numeric;
  v_source text;
  v_setup_ok boolean := true;
  v_raised boolean;
begin
  -- ------------------------------------------------------------ contrato de schema
  if to_regprocedure('public.strategic_can_view_a3(uuid)') is null then raise exception 'strategic_can_view_a3 ausente'; end if;
  if to_regprocedure('public.strategic_can_edit_a3(uuid)') is null then raise exception 'strategic_can_edit_a3 ausente'; end if;
  if to_regprocedure('public.strategic_can_manage_catalog(uuid)') is null then raise exception 'strategic_can_manage_catalog ausente'; end if;
  if to_regprocedure('public.strategic_action_editable_all(uuid)') is null then raise exception 'strategic_action_editable_all ausente'; end if;
  if to_regprocedure('public.strategic_restore_a3(uuid)') is null then raise exception 'strategic_restore_a3 ausente'; end if;
  if to_regprocedure('public.strategic_restore_kpi(uuid)') is null then raise exception 'strategic_restore_kpi ausente'; end if;
  if to_regprocedure('public.strategic_list_archived_a3(uuid)') is null then raise exception 'strategic_list_archived_a3 ausente'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'strategic_kpi_records' and column_name = 'result_source'
  ) then raise exception 'strategic_kpi_records.result_source ausente'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'strategic_kpi_targets' and column_name = 'version'
  ) then raise exception 'strategic_kpi_targets.version ausente'; end if;

  select id into v_org from public.organizations order by created_at limit 1;
  if v_org is null then
    raise notice 'Nenhuma organização encontrada — pulando testes comportamentais do módulo estratégico (contrato de schema já validado acima).';
    return;
  end if;

  -- ------------------------------------------------------------ fixtures
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'strategic-test-' || u.id || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
    from unnest(array[v_admin, v_mgr_comercial, v_mgr_industrial, v_mgr_none, v_ge_read, v_ge_write]) as u(id);

    insert into public.user_profiles (organization_id, user_id, access_role, management, strategic_access_mode, extra_strategic_a3_ids)
    values
      (v_org, v_admin, 'admin', null, null, '{}'),
      (v_org, v_mgr_none, 'manager', null, null, '{}');
    -- management/extra_strategic_a3_ids dos demais são setados MAIS ABAIXO,
    -- depois que as A3 de teste existem (precisa do código 'Comercial'/
    -- 'Industrial' batendo com strategic_a3.management e dos ids reais).

    insert into public.strategic_cycles (organization_id, year, name, status)
    values (v_org, 9999, 'Ciclo de teste (rollback)', 'active')
    returning id into v_cycle;

    insert into public.strategic_scenarios (organization_id, cycle_id, name, scenario_type, is_current)
    values (v_org, v_cycle, 'Original (teste)', 'original', true)
    returning id into v_scenario_a;
    insert into public.strategic_scenarios (organization_id, cycle_id, name, scenario_type, is_current)
    values (v_org, v_cycle, 'Revisado (teste)', 'revised', false)
    returning id into v_scenario_b;

    insert into public.strategic_a3 (organization_id, cycle_id, code, name, management, is_active)
    values (v_org, v_cycle, 'teste_comercial', 'Teste Comercial', 'Comercial', true)
    returning id into v_a3_comercial;
    insert into public.strategic_a3 (organization_id, cycle_id, code, name, management, is_active)
    values (v_org, v_cycle, 'teste_industrial', 'Teste Industrial', 'Industrial', true)
    returning id into v_a3_industrial;
    insert into public.strategic_a3 (organization_id, cycle_id, code, name, management, is_active)
    values (v_org, v_cycle, 'teste_desativada', 'Teste Desativada', null, true)
    returning id into v_a3_disabled;

    update public.user_profiles set management = 'Comercial' where user_id = v_mgr_comercial and organization_id = v_org;
    update public.user_profiles set management = 'Industrial' where user_id = v_mgr_industrial and organization_id = v_org;
    insert into public.user_profiles (organization_id, user_id, access_role, strategic_access_mode, extra_strategic_a3_ids)
    values
      (v_org, v_mgr_comercial, 'manager', null, '{}'),
      (v_org, v_mgr_industrial, 'manager', null, '{}'),
      (v_org, v_ge_read, 'gestao_estrategica', 'read', array[v_a3_comercial]),
      (v_org, v_ge_write, 'gestao_estrategica', 'write', array[v_a3_comercial]);

    insert into public.strategic_kpis (
      organization_id, cycle_id, primary_a3_id, code, name, entry_mode, monthly_calculation,
      accumulation_method, comparison_mode, is_active
    ) values (
      v_org, v_cycle, v_a3_comercial, 'teste_kpi_direct', 'KPI direto (teste)', 'direct', 'direct',
      'sum', 'higher', true
    ) returning id into v_kpi_direct;
    insert into public.strategic_a3_kpis (a3_id, kpi_id, relationship_type) values (v_a3_comercial, v_kpi_direct, 'primary');

    -- code='labor_cost' bate com o dispatcher de strategic_compute_kpi_result
    -- (migration 130) — sem isso o sync levantaria "KPI marcado computed sem
    -- fórmula implementada".
    insert into public.strategic_kpis (
      organization_id, cycle_id, primary_a3_id, code, name, entry_mode, monthly_calculation,
      accumulation_method, comparison_mode, is_active
    ) values (
      v_org, v_cycle, v_a3_industrial, 'labor_cost', 'KPI computed (teste)', 'computed', 'direct',
      'sum', 'lower', true
    ) returning id into v_kpi_computed;
    insert into public.strategic_a3_kpis (a3_id, kpi_id, relationship_type) values (v_a3_industrial, v_kpi_computed, 'primary');
  exception when others then
    raise notice 'Não foi possível montar as fixtures de teste (%), pulando testes comportamentais do módulo estratégico.', sqlerrm;
    v_setup_ok := false;
  end;

  if not v_setup_ok then return; end if;

  -- ============================================================ RBAC (achados #2/#3/#7 revisados)
  perform set_config('request.jwt.claim.sub', v_mgr_industrial::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mgr_industrial)::text, true);
  if not public.strategic_can_view_a3(v_a3_comercial) then
    raise exception 'RBAC: manager (qualquer gestão) deveria VER qualquer A3, inclusive fora da própria gestão';
  end if;
  if public.strategic_can_edit_a3(v_a3_comercial) then
    raise exception 'RBAC: manager de Industrial não deveria EDITAR A3 de Comercial';
  end if;
  if not public.strategic_can_edit_a3(v_a3_industrial) then
    raise exception 'RBAC: manager de Industrial deveria editar a própria A3';
  end if;

  perform set_config('request.jwt.claim.sub', v_mgr_none::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mgr_none)::text, true);
  if not (public.strategic_can_edit_a3(v_a3_comercial) and public.strategic_can_edit_a3(v_a3_industrial)) then
    raise exception 'RBAC: manager SEM gestão marcada deveria editar qualquer A3 (achado da migration 147)';
  end if;

  perform set_config('request.jwt.claim.sub', v_ge_read::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_ge_read)::text, true);
  if not public.strategic_can_view_a3(v_a3_comercial) then
    raise exception 'RBAC: A3 Estratégicos com A3 concedida deveria VER essa A3';
  end if;
  if public.strategic_can_view_a3(v_a3_industrial) then
    raise exception 'RBAC: A3 Estratégicos NÃO deveria ver A3 fora da concessão';
  end if;
  if public.strategic_can_edit_a3(v_a3_comercial) then
    raise exception 'RBAC: A3 Estratégicos em modo READ não deveria EDITAR mesmo com a A3 concedida';
  end if;

  perform set_config('request.jwt.claim.sub', v_ge_write::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_ge_write)::text, true);
  if not public.strategic_can_edit_a3(v_a3_comercial) then
    raise exception 'RBAC: A3 Estratégicos em modo WRITE com a A3 concedida deveria EDITAR';
  end if;

  -- ============================================================ soft-delete bloqueia acesso (achado #7)
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, true);
  update public.strategic_a3 set is_active = false where id = v_a3_disabled;
  if public.strategic_can_view_a3(v_a3_disabled) then
    raise exception 'soft-delete: A3 desativada não deveria ser visível nem pra admin';
  end if;
  perform public.strategic_restore_a3(v_a3_disabled);
  if not public.strategic_can_view_a3(v_a3_disabled) then
    raise exception 'restore: A3 restaurada deveria voltar a ser visível';
  end if;

  -- ============================================================ ação multi-A3 exige editar TODOS os A3 vinculados (achado #3)
  perform public.strategic_save_action(
    p_organization_id := v_org, p_cycle_id := v_cycle, p_title := 'Ação de teste multi-A3',
    p_a3_ids := array[v_a3_comercial, v_a3_industrial]
  );
  select id into v_action_id from public.strategic_actions
  where organization_id = v_org and title = 'Ação de teste multi-A3' limit 1;

  perform set_config('request.jwt.claim.sub', v_mgr_industrial::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mgr_industrial)::text, true);
  if public.strategic_action_editable_all(v_action_id) then
    raise exception 'ação multi-A3: manager que só edita Industrial não deveria poder editar ação também ligada a Comercial';
  end if;

  v_raised := false;
  begin
    perform public.strategic_save_action(
      p_organization_id := v_org, p_cycle_id := v_cycle, p_id := v_action_id,
      p_title := 'Tentativa de sequestro', p_a3_ids := array[v_a3_industrial]
    );
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ação multi-A3: salvar removendo o vínculo com Comercial deveria ser bloqueado pra quem só edita Industrial';
  end if;

  perform set_config('request.jwt.claim.sub', v_mgr_none::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mgr_none)::text, true);
  if not public.strategic_action_editable_all(v_action_id) then
    raise exception 'ação multi-A3: manager sem gestão (edita tudo) deveria poder editar a ação';
  end if;

  -- ============================================================ meta+realizado, fechamento, concorrência (achados #6/#7)
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, true);

  select id into v_record_id from public.strategic_save_kpi_record(
    p_kpi_id := v_kpi_direct, p_year := 9999, p_month := 1, p_result_value := 100,
    p_target_value := 90
  );

  v_raised := false;
  begin
    perform public.strategic_close_a3_period(v_a3_industrial, 9999, 1); -- KPI computed sem meta/realizado ainda
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'fechamento: não deveria fechar período com KPI primário sem meta/realizado (validação de completude)';
  end if;

  perform public.strategic_close_a3_period(v_a3_comercial, 9999, 1); -- v_kpi_direct já tem meta+realizado — deve fechar

  v_raised := false;
  begin
    perform public.strategic_save_kpi_record(p_kpi_id := v_kpi_direct, p_year := 9999, p_month := 1, p_result_value := 200);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'período fechado: salvar KPI de período fechado deveria ser bloqueado';
  end if;

  perform public.strategic_reopen_a3_period(v_a3_comercial, 9999, 1);
  perform public.strategic_save_kpi_record(p_kpi_id := v_kpi_direct, p_year := 9999, p_month := 1, p_result_value := 150);

  select version into v_version from public.strategic_kpi_records where id = v_record_id;
  v_raised := false;
  begin
    perform public.strategic_save_kpi_record(
      p_kpi_id := v_kpi_direct, p_year := 9999, p_month := 1, p_result_value := 300,
      p_expected_version := v_version - 1 -- versão propositalmente desatualizada
    );
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'concorrência: salvar com p_expected_version desatualizada deveria levantar conflito (CAS)';
  end if;

  -- ============================================================ troca de cenário restrita a admin (decisão do usuário, 2026-08-29)
  perform set_config('request.jwt.claim.sub', v_mgr_none::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mgr_none)::text, true);
  v_raised := false;
  begin
    perform public.strategic_set_current_scenario(v_scenario_b);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'cenário: manager não deveria poder trocar o cenário vigente, só super_admin/admin';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, true);
  perform public.strategic_set_current_scenario(v_scenario_b);
  if not exists (select 1 from public.strategic_scenarios where id = v_scenario_b and is_current) then
    raise exception 'cenário: admin trocando o cenário vigente deveria ter funcionado';
  end if;

  -- ============================================================ override manual não é sobrescrito pelo sync (achado #4)
  perform public.strategic_sync_computed_kpi_records(v_org, 9999, 2, v_a3_industrial);
  perform public.strategic_save_kpi_record(p_kpi_id := v_kpi_computed, p_year := 9999, p_month := 2, p_result_value := 12345);

  select result_value, result_source into v_result, v_source
  from public.strategic_kpi_records where kpi_id = v_kpi_computed and year = 9999 and month = 2;
  if v_source <> 'manual' or v_result is distinct from 12345 then
    raise exception 'override: sobrescrita manual de KPI computed deveria marcar result_source=manual e manter o valor digitado';
  end if;

  perform public.strategic_sync_computed_kpi_records(v_org, 9999, 2, v_a3_industrial);
  select result_value, result_source into v_result, v_source
  from public.strategic_kpi_records where kpi_id = v_kpi_computed and year = 9999 and month = 2;
  if v_source <> 'manual' or v_result is distinct from 12345 then
    raise exception 'override: "Sincronizar automáticos" NÃO deveria sobrescrever um registro result_source=manual';
  end if;

  raise notice 'strategic module: todas as asserções passaram.';
end;
$test$;

rollback;
