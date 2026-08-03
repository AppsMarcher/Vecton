-- 092: Central de Notificações (sininho do header + e-mail opcional)
-- Criado por: Ricardo Guimarães — 2026-08-03
--
-- ORIGEM DOS EVENTOS: trigger nas tabelas de lote, não no frontend. O "aplicar
-- carga" hoje passa por 4 RPCs SECURITY DEFINER (apply_actuals_import_batch,
-- apply_budget_import_batch, apply_comercial_realizado_import_batch,
-- apply_comercial_planejado_import_batch) e, no headcount, por um PATCH REST
-- direto do cliente (app.js autoApplyHeadcountBatch) — cinco caminhos
-- diferentes. Amarrar no status da linha cobre todos de uma vez, inclusive
-- apply feito à mão no SQL editor, e deixa um único ponto de manutenção.
--
-- MODELO: fan-out no READ. Um evento = UMA linha em `notifications` (vale pra
-- org inteira); o estado de "lido" mora em `notification_reads`, uma linha por
-- pessoa que leu. O custo não cresce com o número de usuários.
--
-- CONFIGURAÇÃO: org-wide, editável só por admin na tela Parâmetros →
-- Notificações. Cada tipo de evento tem flag de sininho, flag de e-mail e uma
-- lista fixa de destinatários (mesmo padrão de "admin define, vale pra todos"
-- já usado em 059_create_report_sections.sql).
--
-- E-MAIL: a trigger NÃO envia — grava em `notification_email_outbox`. Quem
-- envia é a Edge Function `send-notification-emails` (Resend), acionada por um
-- cron a cada 5 min. Fila em vez de chamada direta porque assim uma falha do
-- Resend não perde o e-mail: o item continua pendente e sai no próximo tick.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Catálogo de tipos de evento (global, não por org)
-- ─────────────────────────────────────────────────────────────────────────────
-- É o que a tela de Parâmetros lista. Tipo novo no futuro (cenário criado,
-- relatório publicado, etc.) entra por INSERT aqui + um branch na trigger —
-- sem deploy de frontend pra aparecer na tela.
create table if not exists public.notification_event_types (
  kind             text primary key,
  label            text not null,
  description      text not null default '',
  target_report_id text,               -- pra onde o clique no sininho navega
  sort_order       int  not null default 0
);

insert into public.notification_event_types (kind, label, description, target_report_id, sort_order) values
  ('actuals_batch_applied',             'Carga de Realizado aplicada',           'Dispara quando um lote de realizado (DRE) é aplicado no banco.',            'dreSocReal',      10),
  ('budget_batch_applied',              'Carga de Planejado aplicada',           'Dispara quando um lote de planejado (Budget ou cenário) é aplicado.',       'dreSocBudget',    20),
  ('headcount_batch_applied',           'Carga de Headcount aplicada',           'Dispara quando um lote de quadro de pessoal é aplicado.',                   'headcountReal',   30),
  ('comercial_realizado_batch_applied', 'Carga de Vendas (realizado) aplicada',  'Dispara quando um lote de vendas realizadas é aplicado.',                   'comercialPainel', 40),
  ('comercial_planejado_batch_applied', 'Carga de Vendas (planejado) aplicada',  'Dispara quando um lote de metas/planejado comercial é aplicado.',           'comercialPainel', 50)
on conflict (kind) do update
  set label            = excluded.label,
      description      = excluded.description,
      target_report_id = excluded.target_report_id,
      sort_order       = excluded.sort_order;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Configuração por org (as flags da tela de Parâmetros)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.notification_settings (
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  kind             text        not null references public.notification_event_types(kind) on delete cascade,
  in_app           boolean     not null default true,
  email            boolean     not null default false,
  email_recipients text[]      not null default '{}',
  updated_at       timestamptz not null default now(),
  updated_by       uuid        references auth.users(id) on delete set null,
  primary key (organization_id, kind)
);

-- Semeia a configuração padrão pra todas as orgs que já existem (sininho
-- ligado, e-mail desligado). Org criada depois é semeada pela própria trigger
-- na primeira carga aplicada — não há trigger em `organizations`.
insert into public.notification_settings (organization_id, kind)
select o.id, t.kind
from public.organizations o
cross join public.notification_event_types t
on conflict (organization_id, kind) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Notificações e estado de leitura
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  kind             text        not null,
  title            text        not null,
  body             text        not null default '',
  ref_year         int,
  ref_month        int,
  target_report_id text,
  actor_user_id    uuid        references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists notifications_org_created_idx
  on public.notifications (organization_id, created_at desc);

create table if not exists public.notification_reads (
  notification_id uuid        not null references public.notifications(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists notification_reads_user_idx
  on public.notification_reads (user_id, notification_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Fila de e-mail
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.notification_email_outbox (
  id              uuid        primary key default gen_random_uuid(),
  notification_id uuid        references public.notifications(id) on delete cascade,
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  recipients      text[]      not null,
  subject         text        not null,
  body_text       text        not null,
  status          text        not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts        int         not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

-- Índice parcial: a Edge Function só varre pendente, e essa é a fatia pequena.
create index if not exists notification_email_outbox_pending_idx
  on public.notification_email_outbox (created_at)
  where status = 'pending';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Trigger: lote aplicado → notificação (+ item na fila de e-mail)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_batch_applied()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_months   constant text[] := array['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  v_kind     text;
  v_type     public.notification_event_types%rowtype;
  v_settings public.notification_settings%rowtype;
  v_row      jsonb := to_jsonb(new);
  v_actor    uuid  := auth.uid();
  v_actor_nm text;
  v_period   text;
  v_title    text;
  v_body     text;
  v_rows     int;
  v_loadtype text;
  v_notif_id uuid;
begin
  -- Só interessa a transição para 'applied'. Reaplicar um lote que já estava
  -- aplicado não gera duplicata; recarregar o mês gera um lote NOVO, e aí sim
  -- uma notificação nova (que é o comportamento desejado).
  if new.status is distinct from 'applied' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'applied' then
    return new;
  end if;

  v_kind := case tg_table_name
    when 'actuals_import_batches'              then 'actuals_batch_applied'
    when 'budget_import_batches'               then 'budget_batch_applied'
    when 'headcount_import_batches'            then 'headcount_batch_applied'
    when 'comercial_realizado_import_batches'  then 'comercial_realizado_batch_applied'
    when 'comercial_planejado_import_batches'  then 'comercial_planejado_batch_applied'
    else null
  end;
  if v_kind is null then
    return new;
  end if;

  select * into v_type from public.notification_event_types where kind = v_kind;
  if not found then
    return new;
  end if;

  -- Org nova (criada depois desta migration) ainda não tem configuração:
  -- semeia o padrão na hora, em vez de silenciosamente não notificar.
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

  if not v_settings.in_app and not v_settings.email then
    return new;
  end if;

  -- Campos opcionais lidos via jsonb: `load_type` só existe no headcount, e a
  -- mesma função serve as 5 tabelas — acesso direto (new.load_type) quebraria
  -- em tempo de execução nas outras quatro.
  v_rows     := coalesce((v_row ->> 'valid_rows')::int, (v_row ->> 'total_rows')::int, 0);
  v_loadtype := v_row ->> 'load_type';

  v_period := coalesce(v_months[new.reference_month], '') || '/' || new.reference_year::text;

  select nullif(trim(coalesce(full_name, '')), '') into v_actor_nm
  from public.user_profiles
  where user_id = v_actor and organization_id = new.organization_id
  limit 1;

  v_title := v_type.label;
  if v_kind = 'headcount_batch_applied' and v_loadtype is not null then
    -- 'realizado' | 'planejado' | 'cenario:<uuid>' (codificação do app.js)
    v_title := v_title || case
      when v_loadtype = 'realizado' then ' (realizado)'
      when v_loadtype = 'planejado' then ' (planejado)'
      when v_loadtype like 'cenario:%' then ' (cenário)'
      else ''
    end;
  end if;

  v_body := v_period
    || case when v_rows > 0 then ' · ' || to_char(v_rows, 'FM999G999G999') || ' linhas' else '' end
    || case when v_actor_nm is not null then ' · por ' || v_actor_nm else '' end;

  if v_settings.in_app then
    insert into public.notifications
      (organization_id, kind, title, body, ref_year, ref_month, target_report_id, actor_user_id)
    values
      (new.organization_id, v_kind, v_title, v_body,
       new.reference_year, new.reference_month, v_type.target_report_id, v_actor)
    returning id into v_notif_id;
  end if;

  if v_settings.email and array_length(v_settings.email_recipients, 1) > 0 then
    insert into public.notification_email_outbox
      (notification_id, organization_id, recipients, subject, body_text)
    values
      (v_notif_id, new.organization_id, v_settings.email_recipients,
       '[Vecton] ' || v_title || ' — ' || v_period,
       v_title || E'\n' || v_body);
  end if;

  return new;
end;
$$;

-- Uma trigger por tabela de lote. O loop pula tabela inexistente em vez de
-- abortar a migration inteira: `headcount_import_batches` existe no banco mas
-- não tem arquivo de migration no repositório (foi criada direto no painel).
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'actuals_import_batches',
    'budget_import_batches',
    'headcount_import_batches',
    'comercial_realizado_import_batches',
    'comercial_planejado_import_batches'
  ]
  loop
    if to_regclass('public.' || v_table) is null then
      raise notice '092: tabela public.% não existe — trigger não criada', v_table;
      continue;
    end if;
    execute format('drop trigger if exists trg_notify_batch_applied on public.%I', v_table);
    execute format(
      'create trigger trg_notify_batch_applied
         after insert or update of status on public.%I
         for each row execute function public.notify_batch_applied()', v_table);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.notification_event_types   enable row level security;
alter table public.notification_settings      enable row level security;
alter table public.notifications              enable row level security;
alter table public.notification_reads         enable row level security;
alter table public.notification_email_outbox  enable row level security;

drop policy if exists "authenticated read notification event types" on public.notification_event_types;
create policy "authenticated read notification event types"
  on public.notification_event_types for select
  to authenticated
  using (true);

drop policy if exists "org members read notification settings" on public.notification_settings;
create policy "org members read notification settings"
  on public.notification_settings for select
  using (is_org_member(organization_id));

drop policy if exists "admin write notification settings" on public.notification_settings;
create policy "admin write notification settings"
  on public.notification_settings for all
  using (
    exists (
      select 1 from public.user_profiles
      where organization_id = notification_settings.organization_id
        and user_id = auth.uid()
        and access_role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where organization_id = notification_settings.organization_id
        and user_id = auth.uid()
        and access_role in ('admin', 'super_admin')
    )
  );

-- notifications: leitura pra quem é da org, e NENHUMA policy de escrita — quem
-- insere é a trigger (SECURITY DEFINER, roda como owner e passa por cima da
-- RLS). Cliente não forja notificação.
drop policy if exists "org members read notifications" on public.notifications;
create policy "org members read notifications"
  on public.notifications for select
  using (is_org_member(organization_id));

-- notification_reads: cada um só enxerga e grava as próprias linhas.
drop policy if exists "own notification reads" on public.notification_reads;
create policy "own notification reads"
  on public.notification_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- outbox: nenhuma policy. Só a Edge Function (service_role) toca aqui.

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPCs pro frontend
-- ─────────────────────────────────────────────────────────────────────────────
-- Por que RPC e não REST direto: o feed precisa de "não existe linha em
-- notification_reads", que o PostgREST não expressa bem. Todas filtram pela org
-- do próprio chamador (fail-closed: sem perfil, sem resultado) e ignoram o que
-- é anterior à entrada da pessoa na organização — quem chega hoje não recebe um
-- badge com 90 dias de histórico.

create or replace function public.notifications_feed(p_limit int default 30)
returns table (
  id               uuid,
  kind             text,
  title            text,
  body             text,
  ref_year         int,
  ref_month        int,
  target_report_id text,
  created_at       timestamptz,
  is_read          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.kind, n.title, n.body, n.ref_year, n.ref_month,
         n.target_report_id, n.created_at,
         (r.notification_id is not null) as is_read
  from public.notifications n
  join public.user_profiles me
    on me.user_id = auth.uid()
   and me.organization_id = n.organization_id
  left join public.notification_reads r
    on r.notification_id = n.id
   and r.user_id = auth.uid()
  where n.created_at >= now() - interval '90 days'
    and n.created_at >= me.created_at
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.notifications_unread_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.notifications n
  join public.user_profiles me
    on me.user_id = auth.uid()
   and me.organization_id = n.organization_id
  left join public.notification_reads r
    on r.notification_id = n.id
   and r.user_id = auth.uid()
  where r.notification_id is null
    and n.created_at >= now() - interval '90 days'
    and n.created_at >= me.created_at;
$$;

create or replace function public.notifications_mark_read(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notification_reads (notification_id, user_id)
  select n.id, auth.uid()
  from public.notifications n
  join public.user_profiles me
    on me.user_id = auth.uid()
   and me.organization_id = n.organization_id
  where n.id = any(coalesce(p_ids, '{}'::uuid[]))
  on conflict (notification_id, user_id) do nothing;
$$;

create or replace function public.notifications_mark_all_read()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notification_reads (notification_id, user_id)
  select n.id, auth.uid()
  from public.notifications n
  join public.user_profiles me
    on me.user_id = auth.uid()
   and me.organization_id = n.organization_id
  where n.created_at >= now() - interval '90 days'
    and n.created_at >= me.created_at
  on conflict (notification_id, user_id) do nothing;
$$;

grant execute on function public.notifications_feed(int)          to authenticated;
grant execute on function public.notifications_unread_count()     to authenticated;
grant execute on function public.notifications_mark_read(uuid[])  to authenticated;
grant execute on function public.notifications_mark_all_read()    to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Agendamento do envio de e-mail (rodar SEPARADO, ver README abaixo)
-- ─────────────────────────────────────────────────────────────────────────────
-- A fila só é drenada quando alguém chama a Edge Function `send-notification-emails`.
-- Depois de fazer o deploy dela, criar o agendamento no painel do Supabase
-- (Integrations → Cron → Create job, "Supabase Edge Function", a cada 5 min),
-- ou por SQL, se pg_cron e pg_net estiverem habilitados:
--
--   select cron.schedule(
--     'vecton-notification-emails',
--     '*/5 * * * *',
--     $cron$
--       select net.http_post(
--         url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-notification-emails',
--         headers := jsonb_build_object(
--           'Content-Type',  'application/json',
--           'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>'
--         ),
--         body    := '{}'::jsonb
--       );
--     $cron$
--   );
--
-- Sem esse agendamento a central funciona normalmente no sininho; só o e-mail
-- (que já nasce desligado em todos os tipos) fica parado na fila.
