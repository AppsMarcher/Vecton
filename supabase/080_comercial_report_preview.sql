begin;

-- Dry run do motor: roda comercial_report_compute com o config em memoria, sem
-- exigir relatorio/versao salvos. Usado pelo passo final do Criador ("revisao")
-- pra mostrar a tabela antes de gravar uma versao nova, sem sujar o historico
-- com tentativas. Somente quem pode gerenciar relatorios comerciais (mesmo
-- gate de comercial_report_save) pode rodar preview.
create or replace function public.comercial_report_preview(
  p_organization_id uuid,
  p_report_kind text,
  p_modalidade text,
  p_data_inicio date,
  p_data_fim date,
  p_config jsonb,
  p_year integer,
  p_month integer,
  p_scenario_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_comercial_reports(p_organization_id) then
    raise exception 'Usuario sem permissao para pre-visualizar relatorios comerciais';
  end if;
  if not public.comercial_report_config_is_valid(p_config) then
    raise exception 'Configuracao de relatorio comercial invalida';
  end if;
  if coalesce(p_report_kind, 'custom') not in ('custom', 'bateu_levou', 'final_ano') then
    raise exception 'Tipo de relatorio invalido';
  end if;
  if coalesce(p_modalidade, '') not in ('monthly', 'annual_ytd') then
    raise exception 'Modalidade de relatorio invalida';
  end if;

  return public.comercial_report_compute(
    p_organization_id, null, 'Pré-visualização', coalesce(p_report_kind, 'custom'),
    'draft', p_modalidade, p_data_inicio, p_data_fim,
    p_config, 0, md5(p_config::text),
    p_year, p_month, p_scenario_id
  );
end;
$$;

grant execute on function public.comercial_report_preview(
  uuid, text, text, date, date, jsonb, integer, integer, uuid
) to authenticated;

commit;
