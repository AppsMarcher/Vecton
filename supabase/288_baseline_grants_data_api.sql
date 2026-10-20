begin;

-- BASELINE DE PERMISSÕES DA DATA API (PostgREST / supabase-js) — para recriar o banco do zero.
--
-- Contexto: a partir de 30/10/2026 o Supabase deixa de conceder acesso à Data API automaticamente a tabelas
-- NOVAS do schema public. Tabelas existentes não são afetadas, mas qualquer ambiente recriado pelas migrations
-- (supabase db reset, preview branch, projeto novo) nasceria sem esses acessos. Este arquivo registra, de forma
-- explícita, o acesso de que o app precisa. Só concede (GRANT), nunca revoga: rodar em produção não muda nada,
-- porque tudo abaixo já existe lá. É idempotente.
--
-- O que ele representa (lido da produção em 20/10/2026):
--   * authenticated: SELECT/INSERT/UPDATE/DELETE nas tabelas de dados; só SELECT nas tabelas de planejamento
--     e nos alvos de KPI estratégicos (a escrita passa por funções security definer);
--   * service_role: acesso total (robôs e edge functions);
--   * anon: NENHUM acesso. É de propósito: em produção o papel anônimo ainda tem privilégios amplos herdados do
--     padrão antigo do Supabase (hoje contidos só por RLS e com exceções — ver a análise das views comercial_*);
--     um ambiente recriado não deve herdar isso.
--
-- Tabelas novas: sempre incluir o GRANT na própria migration que cria a tabela.
-- As tabelas _bkp_* (cópias de segurança pontuais) ficam de fora.

do $$
declare
  t text;
  escrita text[] := array[
    'accounts','actuals_import_batch_audit','actuals_import_batches','actuals_import_row_audit','actuals_import_rows',
    'actuals_ledger_audit','actuals_ledger_entries','actuals_monthly_account_totals','branches',
    'budget_import_batch_audit','budget_import_batches','budget_import_row_audit','budget_import_rows',
    'budget_ledger_audit','budget_ledger_entries','budget_monthly_account_totals',
    'carga_automatica_config','carga_automatica_log','carga_automatica_pedido','cc_plan_nodes',
    'comercial_atribuicao_responsavel','comercial_clientes','comercial_coordenacoes','comercial_culturas',
    'comercial_linhas_negocio','comercial_municipios_geo','comercial_planejado_batch_audit',
    'comercial_planejado_import_batches','comercial_planejado_import_rows','comercial_planejado_ledger_audit',
    'comercial_planejado_ledger_entries','comercial_planejado_row_audit','comercial_produtos',
    'comercial_realizado_batch_audit','comercial_realizado_import_batches','comercial_realizado_import_rows',
    'comercial_realizado_ledger_audit','comercial_realizado_ledger_entries','comercial_realizado_row_audit',
    'comercial_regioes_municipio','comercial_report_audit','comercial_report_definitions','comercial_report_runs',
    'comercial_report_version_participants','comercial_report_versions','comercial_territorios','comercial_tipos',
    'comercial_vendedor_vigencias','comercial_vendedores','cost_centers','custom_reports','dre_gerencial_account_lines',
    'dre_plan_nodes','fc_import_batches','fc_import_events','fc_import_files','fc_import_values','fc_plan_nodes',
    'fc_scenarios','forecast_headcount_entries','forecast_ledger_entries','forecast_monthly_account_totals',
    'forecast_scenarios','garantia_ativacoes','headcount_entries','headcount_import_batches','headcount_import_rows',
    'managements','message_attachments','message_deliveries','message_reads','message_thread_participants',
    'message_threads','message_typing','messages','notification_email_outbox','notification_event_types',
    'notification_reads','notification_settings','notifications','organization_users','organizations',
    'password_reset_requests','product_announcement_slides','product_announcements','report_account_assignments',
    'report_card_labels','report_section_items','report_sections','reporting_periods','rps_backup_files',
    'rps_backup_runs','rps_backup_snapshots','rps_change_audit','rps_comercial_attachments','rps_comercial_entries',
    'rps_maintenance_locks','rps_restore_operations','rps_save_requests','rps_snapshots','scenario_load_log',
    'strategic_a3','strategic_a3_kpis','strategic_a3_owners','strategic_a3_periods','strategic_action_a3',
    'strategic_action_kpis','strategic_action_owners','strategic_actions','strategic_analysis_item_kpis',
    'strategic_analysis_items','strategic_attachments','strategic_comments','strategic_cycles',
    'strategic_kpi_benchmarks','strategic_kpi_breakdown_rows','strategic_kpi_drivers','strategic_kpi_owners',
    'strategic_kpi_record_inputs','strategic_kpi_records','strategic_kpis','strategic_north_goals',
    'strategic_period_analyses','strategic_scenarios','user_announcement_dismissals','user_profiles'];
  leitura text[] := array[
    'planning_audit_log','planning_entries','planning_entry_audit','planning_form_access','planning_form_lines',
    'planning_forms','planning_runs','planning_scenario_months','strategic_kpi_targets'];
  views text[] := array[
    'comercial_campanhas_sem_atribuicao_valida','comercial_fat_cart','comercial_faturado','comercial_planejado'];
begin
  foreach t in array escrita loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
      execute format('grant all on public.%I to service_role', t);
    end if;
  end loop;
  foreach t in array leitura loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('grant select on public.%I to authenticated', t);
      execute format('grant all on public.%I to service_role', t);
    end if;
  end loop;
  foreach t in array views loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('grant select on public.%I to authenticated', t);
      execute format('grant all on public.%I to service_role', t);
    end if;
  end loop;
end $$;

commit;
