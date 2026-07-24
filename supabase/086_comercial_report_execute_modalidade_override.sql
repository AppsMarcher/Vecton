begin;

-- Toggle ao vivo Mes/YTD na tela do relatorio (pedido do usuario pro
-- "Comparativo do time" e "Performance por vendedor e cultura", que hoje
-- ficam fixos em 'monthly' — so "Desempenho de um vendedor" tem YTD, fixo,
-- sem opcao). Em vez de duplicar o relatorio (1 mensal + 1 YTD) ou expor
-- "Modalidade" no formulario (trocaria a config salva), o usuario escolheu
-- um toggle na propria tela, sem alterar a definicao oficial do relatorio.
--
-- comercial_report_execute sempre usava v_report.modalidade (da definicao
-- salva) direto. Novo parametro opcional p_modalidade_override: quando
-- informado, substitui a modalidade so para ESSA chamada (nao grava nada).
-- Reuso de snapshot oficial (relatorio 'closed') so acontece quando NAO ha
-- override, ja que o snapshot foi calculado pra modalidade original.
-- Oficializacao (p_persist) com override e bloqueada — persist tem que
-- sempre refletir a modalidade oficial do relatorio, nunca a visao ad-hoc
-- do viewer.
-- create or replace nao troca assinatura (o parametro novo criaria um
-- overload separado, deixando a versao de 5 parametros orfa e ambigua pro
-- PostgREST). Precisa dropar a assinatura antiga primeiro.
drop function if exists public.comercial_report_execute(uuid, integer, integer, uuid, boolean);

create or replace function public.comercial_report_execute(
  p_report_id uuid,
  p_year integer,
  p_month integer,
  p_scenario_id uuid default null,
  p_persist boolean default false,
  p_modalidade_override text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.comercial_report_definitions%rowtype;
  v_version public.comercial_report_versions%rowtype;
  v_modalidade text;
  v_payload jsonb;
begin
  if p_modalidade_override is not null and p_modalidade_override not in ('monthly', 'annual_ytd') then
    raise exception 'Modalidade invalida: %', p_modalidade_override;
  end if;
  if p_persist and p_modalidade_override is not null then
    raise exception 'Nao e possivel oficializar uma execucao com modalidade sobrescrita';
  end if;

  select * into v_report
  from public.comercial_report_definitions
  where id = p_report_id;
  if not found then raise exception 'Relatorio comercial nao encontrado'; end if;
  if not public.is_org_member(v_report.organization_id) then
    raise exception 'Usuario sem acesso a organizacao';
  end if;
  if v_report.status = 'draft'
     and not public.can_manage_comercial_reports(v_report.organization_id) then
    raise exception 'Relatorio em rascunho';
  end if;

  v_modalidade := coalesce(p_modalidade_override, v_report.modalidade);

  select * into v_version
  from public.comercial_report_versions
  where report_id = v_report.id
    and version_number = v_report.current_version;
  if not found then raise exception 'Relatorio sem versao publicada'; end if;

  if v_report.status = 'closed' and not p_persist and p_modalidade_override is null then
    select r.result_snapshot into v_payload
    from public.comercial_report_runs r
    where r.report_id = v_report.id
      and r.report_version_id = v_version.id
      and r.reference_year = p_year
      and r.reference_month = p_month
      and r.scenario_id is not distinct from p_scenario_id
      and r.run_status = 'official'
      and r.result_snapshot is not null
    order by r.created_at desc
    limit 1;
    if v_payload is not null then
      return public.comercial_apply_current_seller_names(v_report.organization_id, v_payload);
    end if;
  end if;

  v_payload := public.comercial_report_compute(
    v_report.organization_id, v_report.id, v_report.nome, v_report.report_kind,
    v_report.status, v_modalidade, v_report.data_inicio, v_report.data_fim,
    v_version.config, v_version.version_number, v_version.config_hash,
    p_year, p_month, p_scenario_id
  );

  if p_persist then
    if not public.can_manage_comercial_reports(v_report.organization_id) then
      raise exception 'Usuario sem permissao para oficializar execucoes';
    end if;
    insert into public.comercial_report_runs (
      organization_id, report_id, report_version_id, reference_year,
      reference_month, scenario_id, effective_start, effective_end,
      parameters, compliance, result_snapshot, result_hash, auditable,
      run_status, created_by
    ) values (
      v_report.organization_id, v_report.id, v_version.id, p_year, p_month,
      p_scenario_id, (v_payload->'period'->>'effective_start')::date,
      (v_payload->'period'->>'effective_end')::date,
      jsonb_build_object('year', p_year, 'month', p_month, 'scenario_id', p_scenario_id),
      v_payload->'compliance', v_payload, md5(v_payload::text), true, 'official', auth.uid()
    );
  end if;

  return v_payload;
end;
$$;

revoke all on function public.comercial_report_execute(uuid, integer, integer, uuid, boolean, text) from public;
grant execute on function public.comercial_report_execute(uuid, integer, integer, uuid, boolean, text)
  to authenticated;

commit;
