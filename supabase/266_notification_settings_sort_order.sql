begin;

-- 266: ordem dos cartoes na tela Parametros > Notificacoes, por organizacao.
-- A tela passa a ter cartoes arrastaveis; a ordem escolhida pelo admin e gravada aqui (1..N). Sem valor
-- (null), vale a ordem do catalogo (notification_event_types.sort_order); tipos novos vao para o fim.
alter table public.notification_settings
  add column if not exists sort_order integer;

commit;
