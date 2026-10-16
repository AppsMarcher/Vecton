begin;

-- 264: carga automatica do DRE (razao contabil do Protheus) + e-mail de erro generico.
--
--   1. carga_automatica_config: linha do job 'dre' (nasce DESLIGADA; ligue depois da simulacao).
--   2. notify_carga_automatica_erro: o e-mail de erro passa a usar o campo "resumo" das linhas reprovadas
--      (varias linhas com o mesmo motivo viram uma, com a contagem) e a orientacao de correcao por carga.
--      Mantem o formato antigo para logs ja gravados (origem/documento/cliente/produto).

-- 1. Configuracao do DRE ------------------------------------------------------------------------
insert into public.carga_automatica_config (organization_id, job, descricao, enabled, meses_atras, meses_frente, horarios, params)
select o.id, 'dre', 'DRE - razao contabil (CT2) do Protheus - mes corrente', false, 0, 0,
       array['12:00','23:30'],
       jsonb_build_object(
         'conta_de', '3',
         'conta_ate', '4zzzzzzzzzzzzzzzz',
         'queda_max_pct', 30,
         'diretorio_saida', 'C:\robo-cargas\logs'
       )
from public.organizations o
where o.name = 'Marcher Brasil'
on conflict (organization_id, job) do nothing;

-- 2. E-mail de erro generico --------------------------------------------------------------------
create or replace function public.notify_carga_automatica_erro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_months   constant text[] := array['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  v_kind     constant text := 'carga_automatica_erro';
  v_type     public.notification_event_types%rowtype;
  v_settings public.notification_settings%rowtype;
  v_period   text;
  v_title    text;
  v_head     text;
  v_linhas   text;
  v_dica     text;
  v_notif_id uuid;
begin
  if new.status not in ('erro', 'bloqueada') then
    return new;
  end if;

  select * into v_type from public.notification_event_types where kind = v_kind;
  if not found then
    return new;
  end if;

  select * into v_settings
  from public.notification_settings
  where organization_id = new.organization_id and kind = v_kind;
  if not found then
    insert into public.notification_settings (organization_id, kind)
    values (new.organization_id, v_kind)
    on conflict (organization_id, kind) do nothing;
    select * into v_settings
    from public.notification_settings
    where organization_id = new.organization_id and kind = v_kind;
    if not found then
      return new;
    end if;
  end if;

  if not v_settings.is_active or (not v_settings.in_app and not v_settings.email) then
    return new;
  end if;

  v_period := case when new.reference_month between 1 and 12
                   then v_months[new.reference_month] || '/' || new.reference_year::text
                   else '' end;
  v_title := v_type.label || ' — ' || new.job
             || case when v_period <> '' then ' (' || v_period || ')' else '' end;
  v_head  := case when new.status = 'bloqueada'
                  then 'A carga NÃO foi aplicada (bloqueada por proteção).'
                  else 'A carga NÃO foi aplicada: houve erro.' end
             || E'\n' || coalesce(new.mensagem, '');

  -- Itens novos trazem "resumo" + "ocorrencias"; itens antigos (vendas) trazem origem/documento/cliente/produto.
  select string_agg(
           '• ' || case
             when e ? 'resumo' then
               coalesce(e ->> 'resumo', '-')
               || case when coalesce((e ->> 'ocorrencias')::int, 1) > 1
                       then ' (' || (e ->> 'ocorrencias') || ' linhas)' else '' end
             else
               'Linha ' || coalesce(e ->> 'row_number', '?')
               || ' · ' || coalesce(nullif(e ->> 'origem', ''), '-')
               || ' · doc ' || coalesce(nullif(e ->> 'documento', ''), '-')
               || ' · cliente ' || coalesce(nullif(e ->> 'cod_cliente', ''), '-')
               || ' · produto ' || coalesce(nullif(e ->> 'cod_produto', ''), '-')
             end
           || ' — ' || coalesce((
                select string_agg(x, '; ') from jsonb_array_elements_text(
                  case when jsonb_typeof(e -> 'validation_errors') = 'array' then e -> 'validation_errors' else '[]'::jsonb end) x
              ), 'sem detalhe'),
           E'\n' order by coalesce((e ->> 'row_number')::int, 0))
    into v_linhas
  from jsonb_array_elements(
         case when jsonb_typeof(new.detalhes -> 'primeiros_erros') = 'array'
              then new.detalhes -> 'primeiros_erros' else '[]'::jsonb end) e;

  if v_linhas is not null then
    v_head := v_head || E'\n\nLinhas com erro (agrupadas por motivo, até 20):\n' || v_linhas;
  end if;

  v_dica := case new.job
    when 'dre' then 'Corrija a causa: cadastre a conta (Parâmetros > Plano de Contas DRE), o centro de custos (Centro de Custos) ou a empresa (Empresas) que faltam. '
    when 'vendas' then 'Corrija a causa (ex.: cadastre o cliente em Parâmetros > Comercial > Clientes). '
    else 'Corrija a causa indicada acima. '
  end;
  v_head := v_head || E'\n\n' || v_dica || 'A próxima execução do robô tenta de novo sozinha, ou use "Carregar agora" em Parâmetros > Carga de Realizado.';

  if v_settings.in_app then
    insert into public.notifications (organization_id, kind, title, body, ref_year, ref_month, target_report_id)
    values (new.organization_id, v_kind, v_title, left(v_head, 1500), new.reference_year, new.reference_month, null)
    returning id into v_notif_id;
  end if;

  if v_settings.email and coalesce(array_length(v_settings.email_recipients, 1), 0) > 0 then
    insert into public.notification_email_outbox (notification_id, organization_id, recipients, subject, body_text)
    values (v_notif_id, new.organization_id, v_settings.email_recipients, '[Vecton] ' || v_title, v_head);
  end if;

  return new;
end;
$$;

commit;
