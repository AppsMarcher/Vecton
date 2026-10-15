begin;

-- 261: aviso por e-mail (e sininho) quando uma carga automatica falha ou e bloqueada.
--
-- Usa a Central de Notificacoes existente (092/110/178): um tipo de evento novo
-- ('carga_automatica_erro') aparece em Parametros > Notificacoes, onde o admin liga/desliga
-- sininho e e-mail e edita os destinatarios. O e-mail sai pela fila notification_email_outbox
-- (Edge Function send-notification-emails, cron de 5 min).
--
-- A trigger fica em carga_automatica_log: qualquer carga automatica (vendas hoje, outras depois)
-- que gravar status 'erro' ou 'bloqueada' dispara o aviso, com as linhas que reprovaram.

insert into public.notification_event_types (kind, label, description, target_report_id, sort_order) values
  ('carga_automatica_erro', 'Carga automática com erro',
   'Dispara quando uma carga automática (robô) falha, é bloqueada ou tem linhas reprovadas na validação. O e-mail lista as linhas com erro.',
   null, 60)
on conflict (kind) do update
  set label = excluded.label, description = excluded.description, sort_order = excluded.sort_order;

-- Configuracao inicial: sininho + e-mail ligados, destinatarios = administradores ativos da organizacao
-- (ajustavel depois em Parametros > Notificacoes).
insert into public.notification_settings (organization_id, kind, in_app, email, email_recipients)
select o.id, 'carga_automatica_erro', true, true,
       coalesce((
         select array_agg(distinct lower(u.email))
         from public.user_profiles up
         join auth.users u on u.id = up.user_id
         where up.organization_id = o.id
           and up.access_role in ('admin', 'super_admin')
           and up.is_active
           and u.email is not null
           and u.email <> 'robo.vecton@marcher.com.br'
       ), '{}')
from public.organizations o
on conflict (organization_id, kind) do nothing;

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

  select string_agg(
           '• Linha ' || coalesce(e ->> 'row_number', '?')
           || ' · ' || coalesce(nullif(e ->> 'origem', ''), '-')
           || ' · doc ' || coalesce(nullif(e ->> 'documento', ''), '-')
           || ' · cliente ' || coalesce(nullif(e ->> 'cod_cliente', ''), '-')
           || ' · produto ' || coalesce(nullif(e ->> 'cod_produto', ''), '-')
           || ' — ' || coalesce((
                select string_agg(x, '; ') from jsonb_array_elements_text(
                  case when jsonb_typeof(e -> 'validation_errors') = 'array' then e -> 'validation_errors' else '[]'::jsonb end) x
              ), 'sem detalhe'),
           E'\n' order by (e ->> 'row_number')::int)
    into v_linhas
  from jsonb_array_elements(
         case when jsonb_typeof(new.detalhes -> 'primeiros_erros') = 'array'
              then new.detalhes -> 'primeiros_erros' else '[]'::jsonb end) e;

  if v_linhas is not null then
    v_head := v_head || E'\n\nLinhas com erro (até 20):\n' || v_linhas;
  end if;
  v_head := v_head || E'\n\nCorrija a causa (ex.: cadastre o cliente em Parâmetros > Comercial > Clientes). '
                   || 'A próxima execução do robô tenta de novo sozinha.';

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

drop trigger if exists trg_notify_carga_automatica_erro on public.carga_automatica_log;
create trigger trg_notify_carga_automatica_erro
after insert on public.carga_automatica_log
for each row execute function public.notify_carga_automatica_erro();

commit;
