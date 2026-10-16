begin;

-- 265: envio semanal do Painel de Vendas por e-mail (PDF), feito pelo robo de cargas.
--
-- Reaproveita a tela Parametros > Notificacoes (tipo "agendado": dia da semana + horario + ativo +
-- destinatarios), como o Lembrete RPS. Diferenca: aqui o e-mail leva o PDF do Painel (o mesmo do botao
-- "Enviar por e-mail"), que so um navegador consegue montar. Quem envia, entao, e o robo no servidor:
-- a cada rodada ele le esta configuracao, abre o Vecton num navegador sem tela e dispara o envio.
--
-- A funcao pg_cron run_scheduled_notifications() trata TODO tipo agendado como lembrete em texto; este tipo
-- (kind iniciando em "relatorio") fica fora dela, senao sairia tambem um e-mail de texto no mesmo horario.

insert into public.notification_event_types (kind, label, description, target_report_id, sort_order, trigger_mode) values
  ('relatorio_painel_vendas_semanal', 'Envio semanal do Painel de Vendas',
   'Envia por e-mail o PDF do Painel de Vendas (mês e acumulado YTD, igual ao botão Enviar por e-mail) aos destinatários marcados, no dia e horário abaixo.',
   null, 70, 'scheduled')
on conflict (kind) do update
  set label = excluded.label, description = excluded.description,
      sort_order = excluded.sort_order, trigger_mode = excluded.trigger_mode;

-- Configuracao inicial: DESLIGADA, segunda-feira 08:00, sem destinatarios (o admin define na tela).
insert into public.notification_settings
  (organization_id, kind, in_app, email, email_recipients, is_active, schedule_weekday, schedule_time)
select o.id, 'relatorio_painel_vendas_semanal', false, true, '{}', false, 1, '08:00'
from public.organizations o
on conflict (organization_id, kind) do nothing;

-- run_scheduled_notifications(): ignora tipos "relatorio*" (patch por string-replace na funcao viva; idempotente).
do $do$
declare
  v_def    text;
  v_anchor constant text := E'where t.trigger_mode = ''scheduled''';
  v_patch  constant text := E'where t.trigger_mode = ''scheduled''\n      and left(t.kind, 9) <> ''relatorio''';
begin
  select pg_get_functiondef('public.run_scheduled_notifications()'::regprocedure) into v_def;
  if position('left(t.kind, 9)' in v_def) > 0 then
    raise notice '265: run_scheduled_notifications ja ignora tipos relatorio*';
  elsif position(v_anchor in v_def) = 0 then
    raise exception '265: ancora nao encontrada em run_scheduled_notifications; ajustar o patch';
  else
    execute replace(v_def, v_anchor, v_patch);
  end if;
end;
$do$;

commit;
