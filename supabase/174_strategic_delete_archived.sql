begin;

-- ============================================================================
-- Pedido do usuário (2026-08-29): a Tela "Itens arquivados" só tinha
-- Restaurar — pediu um botão Excluir (vermelho) do lado, pra apagar de
-- vez itens de teste/lixo (ex.: o A3 "Teste" do print dele) sem precisar
-- mexer direto no banco.
--
-- Decisão combinada com o usuário: exclusão é IRREVERSÍVEL, então só é
-- permitida quando o item está "vazio" — sem nenhum histórico real por
-- trás (metas lançadas, realizados, ações, causas/contramedidas, anexos,
-- ou — no caso de A3 — indicadores/A3-filhas/períodos ainda dependendo
-- dele). Se tiver qualquer coisa, a RPC recusa com uma mensagem
-- explicando o que está bloqueando — mesmo espírito de proteção contra
-- clique errado que strategic_restore_a3/kpi já tinham pra evitar estado
-- inconsistente (migration 166).
--
-- Mesmo gate das outras RPCs de catálogo: strategic_can_manage_catalog
-- (só super_admin/admin — Gestor/A3 Estratégicos nunca editam catálogo,
-- migration 159). Precisa estar arquivado (is_active=false) pra excluir —
-- não dá pra pular o Restaurar/Excluir de um item ainda ativo por engano.
-- ============================================================================

create or replace function public.strategic_delete_kpi(
  p_kpi_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_active boolean;
  v_name text;
  v_blockers text[] := array[]::text[];
begin
  select organization_id, is_active, name into v_org, v_active, v_name
  from public.strategic_kpis where id = p_kpi_id;
  if v_org is null then raise exception 'KPI não encontrado'; end if;
  if not public.strategic_can_manage_catalog(v_org) then
    raise exception 'sem permissão — só super_admin/admin excluem indicador do catálogo';
  end if;
  if v_active then
    raise exception 'este indicador ainda está ativo — arquive antes de excluir';
  end if;

  if exists (select 1 from public.strategic_kpi_targets where kpi_id = p_kpi_id) then
    v_blockers := v_blockers || 'metas lançadas';
  end if;
  if exists (select 1 from public.strategic_kpi_records where kpi_id = p_kpi_id) then
    v_blockers := v_blockers || 'realizados lançados';
  end if;
  if exists (select 1 from public.strategic_kpi_benchmarks where kpi_id = p_kpi_id) then
    v_blockers := v_blockers || 'benchmarks anuais';
  end if;
  if exists (select 1 from public.strategic_analysis_item_kpis where kpi_id = p_kpi_id) then
    v_blockers := v_blockers || 'causas/contramedidas vinculadas';
  end if;
  if exists (select 1 from public.strategic_action_kpis where kpi_id = p_kpi_id) then
    v_blockers := v_blockers || 'ações vinculadas';
  end if;
  if exists (select 1 from public.strategic_attachments where kpi_id = p_kpi_id) then
    v_blockers := v_blockers || 'anexos de suporte';
  end if;

  if array_length(v_blockers, 1) > 0 then
    raise exception 'não é possível excluir "%": ainda tem % — a exclusão é permanente, esse histórico precisa ser removido antes (ou o indicador continua arquivado)',
      v_name, array_to_string(v_blockers, ', ');
  end if;

  delete from public.strategic_kpis where id = p_kpi_id;
end;
$$;

grant execute on function public.strategic_delete_kpi(uuid) to authenticated;

create or replace function public.strategic_delete_a3(
  p_a3_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_active boolean;
  v_name text;
  v_blockers text[] := array[]::text[];
begin
  select organization_id, is_active, name into v_org, v_active, v_name
  from public.strategic_a3 where id = p_a3_id;
  if v_org is null then raise exception 'A3 não encontrada'; end if;
  if not public.strategic_can_manage_catalog(v_org) then
    raise exception 'sem permissão — só super_admin/admin excluem A3 do catálogo';
  end if;
  if v_active then
    raise exception 'esta A3 ainda está ativa — arquive antes de excluir';
  end if;

  if exists (select 1 from public.strategic_kpis where primary_a3_id = p_a3_id) then
    v_blockers := v_blockers || 'indicadores ainda vinculados (mesmo arquivados)';
  end if;
  if exists (select 1 from public.strategic_a3 where parent_id = p_a3_id) then
    v_blockers := v_blockers || 'A3-filhas ainda vinculadas';
  end if;
  if exists (select 1 from public.strategic_a3_periods where a3_id = p_a3_id) then
    v_blockers := v_blockers || 'períodos abertos/fechados no histórico';
  end if;
  if exists (select 1 from public.strategic_period_analyses where a3_id = p_a3_id) then
    v_blockers := v_blockers || 'análises mensais (causas/contramedidas)';
  end if;
  if exists (select 1 from public.strategic_action_a3 where a3_id = p_a3_id) then
    v_blockers := v_blockers || 'ações vinculadas';
  end if;

  if array_length(v_blockers, 1) > 0 then
    raise exception 'não é possível excluir "%": ainda tem % — a exclusão é permanente, esse histórico precisa ser removido antes (ou a A3 continua arquivada)',
      v_name, array_to_string(v_blockers, ', ');
  end if;

  delete from public.strategic_a3 where id = p_a3_id;
end;
$$;

grant execute on function public.strategic_delete_a3(uuid) to authenticated;

commit;
