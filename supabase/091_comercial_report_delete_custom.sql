begin;

-- 091: permite excluir relatorio personalizado ja ativo.
--
-- Contexto: comercial_report_delete_draft (068) so apaga status = 'draft'. Os
-- templates simplificados do Criador de Relatorios passaram a nascer 'active'
-- para ficarem visiveis a quem nao e admin, e com isso viraram permanentes --
-- nao havia mais nenhum caminho para excluir um relatorio criado pelo usuario.
--
-- Esta migration adiciona comercial_report_delete, com regras proprias:
--   * so report_kind = 'custom'. As campanhas nativas (bateu_levou, final_ano)
--     continuam protegidas -- tem premiacao e historico de resultado.
--   * qualquer status (draft, active, closed).
--   * apaga tambem as execucoes oficializadas (comercial_report_runs), ao
--     contrario da delete_draft, que barrava a exclusao quando existiam. As FKs
--     de runs/versions/audit para definitions sao ON DELETE RESTRICT, entao a
--     ordem de remocao abaixo e obrigatoria (participants cai por cascade da
--     propria version).
--
-- comercial_report_delete_draft continua existindo e inalterada: bundles antigos
-- em cache seguem funcionando com a semantica que ja conheciam.

create or replace function public.comercial_report_delete(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.comercial_report_definitions%rowtype;
begin
  select * into v_report
  from public.comercial_report_definitions
  where id = p_report_id;
  if not found then return; end if;

  if not public.can_manage_comercial_reports(v_report.organization_id) then
    raise exception 'Usuario sem permissao para excluir relatorios comerciais';
  end if;
  if v_report.report_kind <> 'custom' then
    raise exception 'Somente relatorios personalizados podem ser excluidos';
  end if;

  delete from public.report_section_items
  where organization_id = v_report.organization_id
    and report_id = 'comercialRelatorio_' || p_report_id::text;
  delete from public.comercial_report_runs where report_id = p_report_id;
  delete from public.comercial_report_audit where report_id = p_report_id;
  delete from public.comercial_report_versions where report_id = p_report_id;
  delete from public.comercial_report_definitions where id = p_report_id;
end;
$$;

grant execute on function public.comercial_report_delete(uuid) to authenticated;

commit;
