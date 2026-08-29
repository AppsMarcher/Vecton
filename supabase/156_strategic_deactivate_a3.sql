begin;

-- ============================================================================
-- Pedido do usuário (2026-08-29): testou o fluxo de "+ Criar A3" e agora
-- quer excluir a A3 de teste — não existia nenhum jeito de apagar uma A3
-- pela tela. Mesmo padrão de strategic_deactivate_kpi (migration 154):
-- nunca DELETE de verdade (strategic_a3_kpis/strategic_actions/
-- strategic_period_analyses referenciam a3_id, e strategic_kpis referencia
-- primary_a3_id — apagar a linha destruiria histórico já lançado). Marca
-- is_active=false — some de toda tela (Tela 1 filtra is_active desde a
-- migration 146, Tela 2 filtra os filhos com "and c.is_active").
--
-- Só super_admin/admin (mesma checagem de strategic_create_a3/
-- strategic_rename_kpi/strategic_deactivate_kpi — catálogo, não o A3 em si).
--
-- Bloqueia (não faz cascade automático) se a A3 ainda tem A3-filha ativa ou
-- indicador (KPI) próprio ativo — força excluir esses primeiro pela própria
-- tela (trash icon de cada KPI já existe; A3-filha usa esta mesma RPC).
-- Cascade automático apagaria dados de filhos/indicadores sem o usuário
-- perceber o alcance — mais seguro pedir confirmação explícita item a item.
-- ============================================================================
create or replace function public.strategic_deactivate_a3(
  p_a3_id uuid
)
returns public.strategic_a3
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_children_count int;
  v_kpis_count int;
  v_out public.strategic_a3;
begin
  select organization_id into v_org from public.strategic_a3 where id = p_a3_id;
  if v_org is null then raise exception 'A3 não encontrada'; end if;

  if not exists (
    select 1 from public.user_profiles up
    where up.organization_id = v_org and up.user_id = auth.uid()
      and (
        up.access_role in ('super_admin', 'admin')
        or 'super_admin' = any(up.additional_access_roles)
        or 'admin' = any(up.additional_access_roles)
      )
  ) then
    raise exception 'sem permissão — só super_admin/admin excluem A3 do catálogo';
  end if;

  select count(*) into v_children_count
  from public.strategic_a3 where parent_id = p_a3_id and is_active;
  if v_children_count > 0 then
    raise exception 'esta A3 tem % A3-filha(s) ativa(s) — exclua-as primeiro', v_children_count;
  end if;

  select count(*) into v_kpis_count
  from public.strategic_kpis where primary_a3_id = p_a3_id and is_active;
  if v_kpis_count > 0 then
    raise exception 'esta A3 tem % indicador(es) ativo(s) — exclua-os primeiro', v_kpis_count;
  end if;

  update public.strategic_a3
  set is_active = false, updated_by = auth.uid(), updated_at = now()
  where id = p_a3_id
  returning * into v_out;

  return v_out;
end;
$$;

grant execute on function public.strategic_deactivate_a3(uuid) to authenticated;

commit;
