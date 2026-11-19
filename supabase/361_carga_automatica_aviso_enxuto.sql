begin;

-- 361: aviso de erro da carga automatica ENXUTO no sininho (o e-mail mantem o texto completo de 335).
--
-- Sininho: "Motivo do erro: cliente X sem cadastro e produto Y sem cadastro." + "Acesse em: <caminho>"
-- (a tela mostra o caminho em linha propria e pinta de vermelho o aviso nao lido).
-- Abaixo, o texto completo de 335, que segue valendo para o e-mail:
--   * titulo com o nome da carga por extenso (DRE, Vendas, Balanco) em vez do codigo interno;
--   * "O que aconteceu" + "O que precisa ser corrigido" + "Como resolver", sem jargao;
--   * a orientacao de cadastro so aparece quando ha itens a cadastrar (carga vazia nao pede cadastro);
--   * nao repete o rodape quando a propria mensagem da carga ja traz o passo a passo ("Carregar agora").

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
  v_job      text;
  v_title    text;
  v_head     text;
  v_linhas   text;
  v_dica     text;
  v_notif_id uuid;
  v_arr      jsonb;
  v_cli      text[];
  v_prod     text[];
  v_motivos  text[] := '{}';
  v_curto    text;
  v_caminho  text;
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
  v_job := case new.job
    when 'dre'    then 'DRE'
    when 'vendas' then 'Vendas'
    when 'bp'     then 'Balanço (BP)'
    else new.job
  end;
  v_title := v_type.label || ' — ' || v_job
             || case when v_period <> '' then ' (' || v_period || ')' else '' end;
  v_head  := 'A carga automática de ' || v_job
             || case when v_period <> '' then ' de ' || v_period else '' end
             || case when new.status = 'bloqueada'
                     then ' não foi aplicada: o Vecton a bloqueou por segurança.'
                     else ' não foi concluída.' end
             || E'\n\nO que aconteceu:\n' || coalesce(new.mensagem, 'Sem detalhes. Avise a TI.');

  -- Itens novos trazem "resumo" + "ocorrencias"; itens antigos (vendas) trazem origem/documento/cliente/produto.
  select string_agg(
           '• ' || case
             when e ? 'resumo' then
               coalesce(e ->> 'resumo', '-')
               || case when coalesce((e ->> 'ocorrencias')::int, 1) > 1
                       then ' (' || (e ->> 'ocorrencias') || ' lançamentos)' else '' end
             else
               'Documento ' || coalesce(nullif(e ->> 'documento', ''), 'sem número')
               || ' · cliente ' || coalesce(nullif(e ->> 'cod_cliente', ''), 'sem código')
               || ' · produto ' || coalesce(nullif(e ->> 'cod_produto', ''), 'sem código')
             end
           || ' — ' || coalesce((
                select string_agg(x, '; ') from jsonb_array_elements_text(
                  case when jsonb_typeof(e -> 'validation_errors') = 'array' then e -> 'validation_errors' else '[]'::jsonb end) x
              ), 'motivo não informado'),
           E'\n' order by coalesce((e ->> 'row_number')::int, 0))
    into v_linhas
  from jsonb_array_elements(
         case when jsonb_typeof(new.detalhes -> 'primeiros_erros') = 'array'
              then new.detalhes -> 'primeiros_erros' else '[]'::jsonb end) e;

  if v_linhas is not null then
    v_head := v_head || E'\n\nO que precisa ser corrigido (itens iguais aparecem uma vez só, no máximo 20):\n' || v_linhas;
  end if;

  if position('Carregar agora' in coalesce(new.mensagem, '')) = 0 then
    if v_linhas is not null then
      v_dica := case new.job
        when 'dre'    then 'Cadastre o que está faltando: a conta em Parâmetros > Plano de Contas DRE, o centro de custos em Centro de Custos e a empresa em Empresas. '
        when 'vendas' then 'Cadastre o que está faltando, por exemplo o cliente em Parâmetros > Comercial > Clientes. '
        when 'bp'     then 'Ajuste o Plano BP em Parâmetros para que ele tenha as contas listadas. '
        else 'Corrija os itens listados acima. '
      end || 'Depois, clique em "Carregar agora" em Parâmetros > Carga de Realizado, ou aguarde: o robô tenta de novo sozinho na próxima execução.';
    elsif new.status = 'bloqueada' then
      v_dica := 'Em geral não é preciso fazer nada: o robô tenta de novo sozinho na próxima execução. Se o aviso se repetir por vários dias, avise a TI.';
    else
      v_dica := 'O robô tenta de novo sozinho na próxima execução. Se o aviso se repetir, avise a TI.';
    end if;
    v_head := v_head || E'\n\nComo resolver:\n' || v_dica;
  end if;

  if v_settings.in_app then
    -- Texto curto do sininho: so o motivo e onde corrigir.
    v_arr := case when jsonb_typeof(new.detalhes -> 'primeiros_erros') = 'array'
                  then new.detalhes -> 'primeiros_erros' else '[]'::jsonb end;
    select array_agg(c order by c) into v_cli from (
      select distinct e ->> 'cod_cliente' as c from jsonb_array_elements(v_arr) e
      where e -> 'validation_errors' @> '"Cliente nao cadastrado"'::jsonb and coalesce(e ->> 'cod_cliente', '') <> '') s;
    select array_agg(c order by c) into v_prod from (
      select distinct e ->> 'cod_produto' as c from jsonb_array_elements(v_arr) e
      where e -> 'validation_errors' @> '"Produto nao cadastrado"'::jsonb and coalesce(e ->> 'cod_produto', '') <> '') s;
    if v_cli is not null then
      v_motivos := v_motivos || ((case when array_length(v_cli, 1) > 1 then 'clientes ' else 'cliente ' end)
        || array_to_string(v_cli[1:3], ', ')
        || case when array_length(v_cli, 1) > 3 then ' e mais ' || (array_length(v_cli, 1) - 3) else '' end
        || ' sem cadastro');
    end if;
    if v_prod is not null then
      v_motivos := v_motivos || ((case when array_length(v_prod, 1) > 1 then 'produtos ' else 'produto ' end)
        || array_to_string(v_prod[1:3], ', ')
        || case when array_length(v_prod, 1) > 3 then ' e mais ' || (array_length(v_prod, 1) - 3) else '' end
        || ' sem cadastro');
    end if;
    if array_length(v_motivos, 1) > 0 then
      v_curto := 'Motivo do erro: ' || array_to_string(v_motivos, ' e ') || '.';
      v_caminho := case
        when v_cli is not null and v_prod is not null then 'Parâmetros > Comercial > Clientes ou Produtos'
        when v_cli is not null then 'Parâmetros > Comercial > Clientes'
        else 'Parâmetros > Comercial > Produtos' end;
    else
      v_curto := 'Motivo do erro: '
        || left(replace(coalesce(nullif(split_part(coalesce(new.mensagem, ''), E'\n', 1), ''), 'sem detalhes, avise a TI'), ' · ', ' - '), 200);
      v_caminho := case when v_linhas is null then null else case new.job
        when 'dre' then 'Parâmetros > Plano de Contas DRE, Centro de Custos ou Empresas'
        when 'bp'  then 'Parâmetros > Plano BP'
        else null end end;
    end if;
    v_curto := v_curto || coalesce(' Acesse em: ' || v_caminho, '');

    insert into public.notifications (organization_id, kind, title, body, ref_year, ref_month, target_report_id)
    values (new.organization_id, v_kind, v_title, left(v_curto, 1500), new.reference_year, new.reference_month, null)
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
