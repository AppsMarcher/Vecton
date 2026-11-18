begin;

-- Análises e planos de ação de OPEX (acompanhamento orçamentário) — schema, RLS e helpers de escopo.
-- Regras:
--   * Todas as escritas passam por RPCs SECURITY DEFINER (migrations 347+); o cliente só tem SELECT.
--   * Análise financeira só é legível por quem enxerga o centro de custo (admin ou escopo em forecast_read_scope()).
--   * Executor sem acesso ao CC NUNCA lê estas tabelas diretamente: lê a tarefa por RPC operacional redigida.
--   * Escrita: admin ou gestor ativo com escopo no CC (sem papel novo).
-- Idempotente.

-- ---------------------------------------------------------------- helpers de escopo
create or replace function public.opex_is_admin(p_org uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.user_profiles u
    where u.user_id = auth.uid() and u.organization_id = p_org and u.is_active
      and (u.access_role::text in ('admin', 'super_admin')
           or coalesce(u.additional_access_roles::text[], '{}') && array['admin', 'super_admin'])
  );
$$;

create or replace function public.opex_can_read_cc(p_org uuid, p_cc uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select public.is_org_member(p_org) and (
    public.opex_is_admin(p_org)
    or exists (select 1 from public.forecast_read_scope() s where s.organization_id = p_org and s.cost_center_id = p_cc)
  );
$$;

create or replace function public.opex_can_write_cc(p_org uuid, p_cc uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select public.is_org_member(p_org) and (
    public.opex_is_admin(p_org)
    or (
      exists (
        select 1 from public.user_profiles u
        where u.user_id = auth.uid() and u.organization_id = p_org and u.is_active
          and (u.access_role::text = 'manager' or coalesce(u.additional_access_roles::text[], '{}') && array['manager'])
      )
      and exists (select 1 from public.forecast_read_scope() s where s.organization_id = p_org and s.cost_center_id = p_cc)
    )
  );
$$;

-- ---------------------------------------------------------------- tabelas
create table if not exists public.opex_variance_thresholds (
  organization_id uuid primary key references public.organizations(id),
  yellow_money numeric(14,2) not null default 10000 check (yellow_money > 0),
  yellow_pct numeric(8,2) not null default 5 check (yellow_pct > 0),
  red_money numeric(14,2) not null default 20000 check (red_money > 0),
  red_pct numeric(8,2) not null default 10 check (red_pct > 0),
  version integer not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (red_money >= yellow_money and red_pct >= yellow_pct)
);

create table if not exists public.opex_variance_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  cost_center_id uuid not null references public.cost_centers(id),
  cost_center_number_snapshot text not null,
  cost_center_name_snapshot text,
  account_number text not null,
  account_name_snapshot text,
  group_reference text,
  reference_year integer not null,
  period_type text not null check (period_type in ('month', 'YTD', 'year')),
  reference_month integer not null check (reference_month between 1 and 12),
  comparison_source_key text not null,
  comparison_source_label text,
  comparison_source_year integer not null,
  scope_key text not null default '',
  analysis_state text not null default 'in_analysis' check (analysis_state in ('in_analysis', 'analyzed')),
  monitor boolean not null default false,
  nature text check (nature is null or nature in ('recurring', 'temporary', 'one_off', 'data_issue')),
  cause text check (cause is null or char_length(cause) <= 8000),
  future_effect text check (future_effect is null or char_length(future_effect) <= 8000),
  expected_financial_impact numeric(16,2) check (expected_financial_impact is null or expected_financial_impact >= 0),
  actual_snapshot numeric(16,2),
  comparison_snapshot numeric(16,2),
  variance_snapshot numeric(16,2),
  variance_pct_snapshot numeric(12,4),
  snapshot_coverage jsonb,
  source_revision text,
  snapshot_at timestamptz,
  version integer not null default 1,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- Uma análise corrente por chave lógica; o nome do grupo e do usuário não entram na unicidade.
create unique index if not exists opex_variance_analyses_context_uq
  on public.opex_variance_analyses (organization_id, cost_center_id, account_number, reference_year, period_type,
                                    reference_month, comparison_source_key, comparison_source_year, scope_key)
  where deleted_at is null;
create index if not exists opex_variance_analyses_org_cc_idx
  on public.opex_variance_analyses (organization_id, cost_center_id, reference_year) where deleted_at is null;

create table if not exists public.opex_analysis_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  analysis_id uuid not null references public.opex_variance_analyses(id),
  version integer not null,
  content jsonb not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (analysis_id, version)
);

create table if not exists public.opex_action_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  analysis_id uuid not null references public.opex_variance_analyses(id),
  owner_user_id uuid not null,
  assignee_user_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 1000),
  expected_result text not null check (char_length(btrim(expected_result)) between 1 and 2000),
  due_date date not null,
  status text not null default 'awaiting_ack'
    check (status in ('awaiting_ack', 'in_progress', 'awaiting_validation', 'adjustments_requested', 'completed')),
  assignment_cycle integer not null default 1,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  submitted_at timestamptz,
  submit_note text,
  validated_at timestamptz,
  validated_by uuid,
  due_date_version integer not null default 1,
  version integer not null default 1,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists opex_action_plans_assignee_idx on public.opex_action_plans (organization_id, assignee_user_id, status, due_date) where deleted_at is null;
create index if not exists opex_action_plans_owner_idx on public.opex_action_plans (organization_id, owner_user_id, status, due_date) where deleted_at is null;
create index if not exists opex_action_plans_analysis_idx on public.opex_action_plans (analysis_id) where deleted_at is null;

-- Eventos imutáveis. `shared_text` é o conteúdo operacional visível ao executor; `audit` guarda antes/depois e
-- nunca é devolvido ao executor sem acesso ao CC.
create table if not exists public.opex_action_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  action_id uuid not null references public.opex_action_plans(id),
  kind text not null,
  actor_user_id uuid,
  assignment_cycle integer,
  action_version integer,
  shared_text text,
  audit jsonb,
  idem_key text,
  created_at timestamptz not null default now()
);
create index if not exists opex_action_events_action_idx on public.opex_action_events (action_id, created_at desc, id);
create unique index if not exists opex_action_events_idem_uq on public.opex_action_events (action_id, idem_key) where idem_key is not null;

create or replace function public.opex_block_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'opex_action_events é imutável' using errcode = '42501';
end;
$$;
drop trigger if exists opex_action_events_immutable on public.opex_action_events;
create trigger opex_action_events_immutable before update or delete on public.opex_action_events
  for each row execute function public.opex_block_event_mutation();

-- Chaves idempotentes de mutações (salvar análise, criar ação, ciência...).
create table if not exists public.opex_idempotency (
  organization_id uuid not null,
  actor_user_id uuid not null,
  idem_key text not null,
  operation text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, actor_user_id, idem_key, operation)
);

-- ---------------------------------------------------------------- RLS: SELECT somente para quem lê o CC
alter table public.opex_variance_thresholds enable row level security;
alter table public.opex_variance_analyses enable row level security;
alter table public.opex_analysis_revisions enable row level security;
alter table public.opex_action_plans enable row level security;
alter table public.opex_action_events enable row level security;
alter table public.opex_idempotency enable row level security;

drop policy if exists "members read opex thresholds" on public.opex_variance_thresholds;
create policy "members read opex thresholds" on public.opex_variance_thresholds for select
  using (public.is_org_member(organization_id));

drop policy if exists "scoped read opex analyses" on public.opex_variance_analyses;
create policy "scoped read opex analyses" on public.opex_variance_analyses for select
  using (deleted_at is null and public.opex_can_read_cc(organization_id, cost_center_id));

drop policy if exists "scoped read opex revisions" on public.opex_analysis_revisions;
create policy "scoped read opex revisions" on public.opex_analysis_revisions for select
  using (exists (select 1 from public.opex_variance_analyses a
                 where a.id = analysis_id and public.opex_can_read_cc(a.organization_id, a.cost_center_id)));

drop policy if exists "scoped read opex actions" on public.opex_action_plans;
create policy "scoped read opex actions" on public.opex_action_plans for select
  using (deleted_at is null and exists (select 1 from public.opex_variance_analyses a
                 where a.id = analysis_id and public.opex_can_read_cc(a.organization_id, a.cost_center_id)));

drop policy if exists "scoped read opex events" on public.opex_action_events;
create policy "scoped read opex events" on public.opex_action_events for select
  using (exists (select 1 from public.opex_action_plans p
                 join public.opex_variance_analyses a on a.id = p.analysis_id
                 where p.id = action_id and public.opex_can_read_cc(a.organization_id, a.cost_center_id)));

-- Sem policy para opex_idempotency: só as funções definer a usam.

revoke all on public.opex_variance_thresholds, public.opex_variance_analyses, public.opex_analysis_revisions,
  public.opex_action_plans, public.opex_action_events, public.opex_idempotency from public, anon, authenticated;
grant select on public.opex_variance_thresholds, public.opex_variance_analyses, public.opex_analysis_revisions,
  public.opex_action_plans, public.opex_action_events to authenticated;

revoke all on function public.opex_is_admin(uuid), public.opex_can_read_cc(uuid, uuid), public.opex_can_write_cc(uuid, uuid) from public, anon;
grant execute on function public.opex_is_admin(uuid), public.opex_can_read_cc(uuid, uuid), public.opex_can_write_cc(uuid, uuid) to authenticated;

commit;
