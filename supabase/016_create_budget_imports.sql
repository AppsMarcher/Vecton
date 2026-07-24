begin;

create table if not exists public.budget_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference_year integer not null,
  reference_month integer not null check (reference_month between 1 and 12),
  load_mode text not null check (load_mode in ('complete', 'additional')),
  source_type text not null default 'file' check (source_type in ('file', 'manual')),
  source_file_name text,
  status text not null default 'draft' check (status in ('draft', 'validating', 'error', 'ready', 'applied', 'cancelled')),
  notes text,
  total_rows integer not null default 0,
  error_rows integer not null default 0,
  valid_rows integer not null default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  applied_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_type = 'file' and source_file_name is not null)
    or source_type = 'manual'
  )
);

create table if not exists public.budget_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.budget_import_batches(id) on delete cascade,
  row_number integer not null check (row_number >= 1),
  branch_code text,
  branch_id uuid references public.branches(id) on delete restrict,
  account_number text,
  account_id uuid references public.accounts(id) on delete restrict,
  cost_center_number text,
  cost_center_id uuid references public.cost_centers(id) on delete restrict,
  history text,
  lot_code text,
  amount numeric(18, 2),
  validation_status text not null default 'pending' check (validation_status in ('pending', 'valid', 'error')),
  validation_errors jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

create table if not exists public.budget_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null references public.budget_import_batches(id) on delete restrict,
  batch_row_id uuid not null references public.budget_import_rows(id) on delete restrict,
  reference_year integer not null,
  reference_month integer not null check (reference_month between 1 and 12),
  branch_id uuid not null references public.branches(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  cost_center_id uuid references public.cost_centers(id) on delete restrict,
  branch_code text not null,
  account_number text not null,
  cost_center_number text,
  history text,
  lot_code text,
  amount numeric(18, 2) not null,
  source_type text not null check (source_type in ('file', 'manual')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_row_id)
);

create table if not exists public.budget_monthly_account_totals (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference_year integer not null,
  reference_month integer not null check (reference_month between 1 and 12),
  account_id uuid references public.accounts(id) on delete set null,
  account_number text not null,
  total_amount numeric(18, 2) not null default 0,
  entry_count integer not null default 0,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, reference_year, reference_month, account_number)
);

create table if not exists public.budget_import_batch_audit (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  organization_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);

create table if not exists public.budget_import_row_audit (
  id uuid primary key default gen_random_uuid(),
  batch_row_id uuid not null,
  batch_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);

create table if not exists public.budget_ledger_audit (
  id uuid primary key default gen_random_uuid(),
  ledger_entry_id uuid not null,
  organization_id uuid not null,
  batch_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);

create index if not exists idx_budget_batches_org_period
  on public.budget_import_batches (organization_id, reference_year, reference_month, status);
create index if not exists idx_budget_rows_batch_number
  on public.budget_import_rows (batch_id, row_number);
create index if not exists idx_budget_rows_validation
  on public.budget_import_rows (batch_id, validation_status);
create index if not exists idx_budget_ledger_org_period
  on public.budget_ledger_entries (organization_id, reference_year, reference_month);
create index if not exists idx_budget_ledger_branch
  on public.budget_ledger_entries (organization_id, branch_id, reference_year, reference_month);
create index if not exists idx_budget_ledger_account
  on public.budget_ledger_entries (organization_id, account_id, reference_year, reference_month);
create index if not exists idx_budget_ledger_batch_id
  on public.budget_ledger_entries (batch_id);
create index if not exists idx_budget_monthly_account_totals_org_year
  on public.budget_monthly_account_totals (organization_id, reference_year, reference_month);
create index if not exists idx_budget_monthly_account_totals_account
  on public.budget_monthly_account_totals (organization_id, account_number, reference_year, reference_month);
create index if not exists idx_budget_batch_audit_batch
  on public.budget_import_batch_audit (batch_id, changed_at desc);
create index if not exists idx_budget_row_audit_batch_row
  on public.budget_import_row_audit (batch_row_id, changed_at desc);
create index if not exists idx_budget_ledger_audit_entry
  on public.budget_ledger_audit (ledger_entry_id, changed_at desc);

create or replace function public.get_budget_batch_organization_id(target_batch_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.organization_id
  from public.budget_import_batches b
  where b.id = target_batch_id
$$;

grant execute on function public.get_budget_batch_organization_id(uuid) to authenticated;

create or replace function public.refresh_budget_import_batch_stats(target_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_status text;
begin
  select status
    into batch_status
  from public.budget_import_batches
  where id = target_batch_id;

  update public.budget_import_batches b
     set total_rows = coalesce(stats.total_rows, 0),
         error_rows = coalesce(stats.error_rows, 0),
         valid_rows = coalesce(stats.valid_rows, 0),
         status = case
           when batch_status in ('applied', 'cancelled') then batch_status
           when coalesce(stats.total_rows, 0) = 0 then 'draft'
           when coalesce(stats.error_rows, 0) > 0 then 'error'
           else 'ready'
         end,
         updated_at = now()
    from (
      select
        r.batch_id,
        count(*) as total_rows,
        count(*) filter (where r.validation_status = 'error') as error_rows,
        count(*) filter (where r.validation_status = 'valid') as valid_rows
      from public.budget_import_rows r
      where r.batch_id = target_batch_id
      group by r.batch_id
    ) stats
   where b.id = target_batch_id;

  if not exists (
    select 1
    from public.budget_import_rows r
    where r.batch_id = target_batch_id
  ) then
    update public.budget_import_batches
       set total_rows = 0,
           error_rows = 0,
           valid_rows = 0,
           status = case
             when batch_status in ('applied', 'cancelled') then batch_status
             else 'draft'
           end,
           updated_at = now()
     where id = target_batch_id;
  end if;
end;
$$;

grant execute on function public.refresh_budget_import_batch_stats(uuid) to authenticated;

create or replace function public.refresh_budget_monthly_account_totals(
  target_organization_id uuid,
  target_reference_year integer,
  target_reference_month integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.budget_monthly_account_totals
  where organization_id = target_organization_id
    and reference_year = target_reference_year
    and reference_month = target_reference_month;

  insert into public.budget_monthly_account_totals (
    organization_id,
    reference_year,
    reference_month,
    account_id,
    account_number,
    total_amount,
    entry_count,
    refreshed_at
  )
  select
    l.organization_id,
    l.reference_year,
    l.reference_month,
    (array_agg(l.account_id order by l.account_id) filter (where l.account_id is not null))[1] as account_id,
    l.account_number,
    coalesce(sum(l.amount), 0)::numeric(18, 2) as total_amount,
    count(*)::integer as entry_count,
    now()
  from public.budget_ledger_entries l
  where l.organization_id = target_organization_id
    and l.reference_year = target_reference_year
    and l.reference_month = target_reference_month
  group by
    l.organization_id,
    l.reference_year,
    l.reference_month,
    l.account_number;
end;
$$;

grant execute on function public.refresh_budget_monthly_account_totals(uuid, integer, integer) to authenticated;

create or replace function public.validate_budget_import_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_rec public.budget_import_batches%rowtype;
  error_list jsonb := '[]'::jsonb;
  normalized_branch text;
  normalized_account text;
  normalized_cost_center text;
begin
  select *
    into batch_rec
  from public.budget_import_batches
  where id = new.batch_id;

  if not found then
    raise exception 'Lote de importacao nao encontrado';
  end if;

  normalized_branch := nullif(btrim(new.branch_code), '');
  normalized_account := nullif(btrim(new.account_number), '');
  normalized_cost_center := nullif(btrim(new.cost_center_number), '');

  new.branch_code := coalesce(normalized_branch, '');
  new.account_number := coalesce(normalized_account, '');
  new.cost_center_number := normalized_cost_center;
  new.branch_id := null;
  new.account_id := null;
  new.cost_center_id := null;

  if normalized_branch is null then
    error_list := error_list || jsonb_build_array('Empresa obrigatoria');
  else
    select b.id into new.branch_id
    from public.branches b
    where b.organization_id = batch_rec.organization_id
      and b.branch_code = normalized_branch
      and b.active = true;
    if new.branch_id is null then
      error_list := error_list || jsonb_build_array('Empresa nao cadastrada');
    end if;
  end if;

  if normalized_account is null then
    error_list := error_list || jsonb_build_array('Conta obrigatoria');
  else
    select a.id into new.account_id
    from public.accounts a
    where a.organization_id = batch_rec.organization_id
      and a.account_number = normalized_account
      and a.active = true;
    if new.account_id is null then
      error_list := error_list || jsonb_build_array('Conta nao cadastrada');
    end if;
  end if;

  if normalized_cost_center is not null then
    select cc.id into new.cost_center_id
    from public.cost_centers cc
    where cc.organization_id = batch_rec.organization_id
      and cc.cost_center_number = normalized_cost_center
      and cc.active = true;
    if new.cost_center_id is null then
      error_list := error_list || jsonb_build_array('Centro de custos nao cadastrado');
    end if;
  end if;

  if new.amount is null then
    error_list := error_list || jsonb_build_array('Valor obrigatorio');
  end if;

  new.validation_errors := error_list;
  new.validation_status := case when jsonb_array_length(error_list) > 0 then 'error' else 'valid' end;

  if batch_rec.status = 'applied' and new.validation_status <> 'valid' then
    raise exception 'Lotes aplicados nao aceitam linhas invalidas';
  end if;

  return new;
end;
$$;

create or replace function public.after_budget_import_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_batch_id uuid;
  batch_rec public.budget_import_batches%rowtype;
begin
  target_batch_id := coalesce(new.batch_id, old.batch_id);
  perform public.refresh_budget_import_batch_stats(target_batch_id);

  select * into batch_rec
  from public.budget_import_batches
  where id = target_batch_id;

  if batch_rec.status = 'applied' then
    if tg_op = 'DELETE' then
      delete from public.budget_ledger_entries
      where batch_row_id = old.id;
    elsif coalesce(new.validation_status, 'error') = 'valid' then
      insert into public.budget_ledger_entries (
        organization_id, batch_id, batch_row_id, reference_year, reference_month,
        branch_id, account_id, cost_center_id, branch_code, account_number,
        cost_center_number, history, lot_code, amount, source_type, created_by, updated_by
      )
      values (
        batch_rec.organization_id, new.batch_id, new.id, batch_rec.reference_year, batch_rec.reference_month,
        new.branch_id, new.account_id, new.cost_center_id, new.branch_code, new.account_number,
        new.cost_center_number, new.history, new.lot_code, new.amount, batch_rec.source_type, auth.uid(), auth.uid()
      )
      on conflict (batch_row_id) do update
        set branch_id = excluded.branch_id,
            account_id = excluded.account_id,
            cost_center_id = excluded.cost_center_id,
            branch_code = excluded.branch_code,
            account_number = excluded.account_number,
            cost_center_number = excluded.cost_center_number,
            history = excluded.history,
            lot_code = excluded.lot_code,
            amount = excluded.amount,
            source_type = excluded.source_type,
            updated_by = auth.uid(),
            updated_at = now();
    else
      delete from public.budget_ledger_entries
      where batch_row_id = new.id;
    end if;

    perform public.refresh_budget_monthly_account_totals(
      batch_rec.organization_id,
      batch_rec.reference_year,
      batch_rec.reference_month
    );
  end if;

  return null;
end;
$$;

create or replace function public.audit_budget_import_batch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.budget_import_batch_audit (
    batch_id, organization_id, action, changed_by, old_row, new_row
  )
  values (
    coalesce(new.id, old.id),
    coalesce(new.organization_id, old.organization_id),
    lower(tg_op),
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return null;
end;
$$;

create or replace function public.audit_budget_import_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.budget_import_row_audit (
    batch_row_id, batch_id, action, changed_by, old_row, new_row
  )
  values (
    coalesce(new.id, old.id),
    coalesce(new.batch_id, old.batch_id),
    lower(tg_op),
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return null;
end;
$$;

create or replace function public.audit_budget_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.budget_ledger_audit (
    ledger_entry_id, organization_id, batch_id, action, changed_by, old_row, new_row
  )
  values (
    coalesce(new.id, old.id),
    coalesce(new.organization_id, old.organization_id),
    coalesce(new.batch_id, old.batch_id),
    lower(tg_op),
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return null;
end;
$$;

create or replace function public.apply_budget_import_batch(target_batch_id uuid)
returns public.budget_import_batches
language plpgsql
security definer
set search_path = public
set statement_timeout = '0'
as $$
declare
  batch_rec public.budget_import_batches%rowtype;
begin
  select * into batch_rec
  from public.budget_import_batches
  where id = target_batch_id;

  if not found then
    raise exception 'Lote de importacao nao encontrado';
  end if;

  if not public.is_org_editor(batch_rec.organization_id) then
    raise exception 'Usuario sem permissao para aplicar este lote';
  end if;

  if not exists (
    select 1 from public.budget_import_rows r where r.batch_id = target_batch_id
  ) then
    raise exception 'O lote nao possui linhas para aplicacao';
  end if;

  if exists (
    select 1
    from public.budget_import_rows r
    where r.batch_id = target_batch_id
      and r.validation_status = 'error'
  ) then
    raise exception 'Corrija todas as linhas com erro antes de aplicar o lote';
  end if;

  if batch_rec.load_mode = 'complete' then
    delete from public.budget_ledger_entries l
    where l.organization_id = batch_rec.organization_id
      and l.reference_year = batch_rec.reference_year
      and l.reference_month = batch_rec.reference_month;
  else
    delete from public.budget_ledger_entries l
    where l.batch_id = target_batch_id;
  end if;

  insert into public.budget_ledger_entries (
    organization_id, batch_id, batch_row_id, reference_year, reference_month,
    branch_id, account_id, cost_center_id, branch_code, account_number,
    cost_center_number, history, lot_code, amount, source_type, created_by, updated_by
  )
  select
    batch_rec.organization_id, r.batch_id, r.id, batch_rec.reference_year, batch_rec.reference_month,
    r.branch_id, r.account_id, r.cost_center_id, r.branch_code, r.account_number,
    r.cost_center_number, r.history, r.lot_code, r.amount, batch_rec.source_type, auth.uid(), auth.uid()
  from public.budget_import_rows r
  where r.batch_id = target_batch_id
    and r.validation_status = 'valid'
  on conflict (batch_row_id) do update
    set branch_id = excluded.branch_id,
        account_id = excluded.account_id,
        cost_center_id = excluded.cost_center_id,
        branch_code = excluded.branch_code,
        account_number = excluded.account_number,
        cost_center_number = excluded.cost_center_number,
        history = excluded.history,
        lot_code = excluded.lot_code,
        amount = excluded.amount,
        source_type = excluded.source_type,
        updated_by = auth.uid(),
        updated_at = now();

  perform public.refresh_budget_monthly_account_totals(
    batch_rec.organization_id,
    batch_rec.reference_year,
    batch_rec.reference_month
  );

  update public.budget_import_batches
     set status = 'applied',
         applied_by = auth.uid(),
         applied_at = now(),
         updated_at = now()
   where id = target_batch_id
   returning * into batch_rec;

  return batch_rec;
end;
$$;

grant execute on function public.apply_budget_import_batch(uuid) to authenticated;

drop trigger if exists trg_budget_batches_updated_at on public.budget_import_batches;
create trigger trg_budget_batches_updated_at before update on public.budget_import_batches for each row execute function public.set_updated_at();
drop trigger if exists trg_budget_rows_updated_at on public.budget_import_rows;
create trigger trg_budget_rows_updated_at before update on public.budget_import_rows for each row execute function public.set_updated_at();
drop trigger if exists trg_budget_ledger_updated_at on public.budget_ledger_entries;
create trigger trg_budget_ledger_updated_at before update on public.budget_ledger_entries for each row execute function public.set_updated_at();
drop trigger if exists trg_budget_monthly_account_totals_updated_at on public.budget_monthly_account_totals;
create trigger trg_budget_monthly_account_totals_updated_at before update on public.budget_monthly_account_totals for each row execute function public.set_updated_at();
drop trigger if exists trg_validate_budget_import_row on public.budget_import_rows;
create trigger trg_validate_budget_import_row before insert or update on public.budget_import_rows for each row execute function public.validate_budget_import_row();
drop trigger if exists trg_after_budget_import_row_change on public.budget_import_rows;
create trigger trg_after_budget_import_row_change after insert or update or delete on public.budget_import_rows for each row execute function public.after_budget_import_row_change();
drop trigger if exists trg_audit_budget_import_batch on public.budget_import_batches;
create trigger trg_audit_budget_import_batch after insert or update or delete on public.budget_import_batches for each row execute function public.audit_budget_import_batch();
drop trigger if exists trg_audit_budget_import_row on public.budget_import_rows;
create trigger trg_audit_budget_import_row after insert or update or delete on public.budget_import_rows for each row execute function public.audit_budget_import_row();
drop trigger if exists trg_audit_budget_ledger_entry on public.budget_ledger_entries;
create trigger trg_audit_budget_ledger_entry after insert or update or delete on public.budget_ledger_entries for each row execute function public.audit_budget_ledger_entry();

alter table public.budget_import_batches enable row level security;
alter table public.budget_import_rows enable row level security;
alter table public.budget_ledger_entries enable row level security;
alter table public.budget_monthly_account_totals enable row level security;
alter table public.budget_import_batch_audit enable row level security;
alter table public.budget_import_row_audit enable row level security;
alter table public.budget_ledger_audit enable row level security;

drop policy if exists "members can read budget import batches" on public.budget_import_batches;
create policy "members can read budget import batches" on public.budget_import_batches for select using (public.is_org_member(organization_id));
drop policy if exists "editors can manage budget import batches" on public.budget_import_batches;
create policy "editors can manage budget import batches" on public.budget_import_batches for all using (public.is_org_editor(organization_id)) with check (public.is_org_editor(organization_id));
drop policy if exists "members can read budget import rows" on public.budget_import_rows;
create policy "members can read budget import rows" on public.budget_import_rows for select using (public.is_org_member(public.get_budget_batch_organization_id(batch_id)));
drop policy if exists "editors can manage budget import rows" on public.budget_import_rows;
create policy "editors can manage budget import rows" on public.budget_import_rows for all using (public.is_org_editor(public.get_budget_batch_organization_id(batch_id))) with check (public.is_org_editor(public.get_budget_batch_organization_id(batch_id)));
drop policy if exists "members can read budget ledger" on public.budget_ledger_entries;
create policy "members can read budget ledger" on public.budget_ledger_entries for select using (public.is_org_member(organization_id));
drop policy if exists "editors can manage budget ledger" on public.budget_ledger_entries;
create policy "editors can manage budget ledger" on public.budget_ledger_entries for all using (public.is_org_editor(organization_id)) with check (public.is_org_editor(organization_id));
drop policy if exists "members can read budget monthly account totals" on public.budget_monthly_account_totals;
create policy "members can read budget monthly account totals" on public.budget_monthly_account_totals for select using (public.is_org_member(organization_id));
drop policy if exists "editors can manage budget monthly account totals" on public.budget_monthly_account_totals;
create policy "editors can manage budget monthly account totals" on public.budget_monthly_account_totals for all using (public.is_org_editor(organization_id)) with check (public.is_org_editor(organization_id));
drop policy if exists "members can read budget batch audit" on public.budget_import_batch_audit;
create policy "members can read budget batch audit" on public.budget_import_batch_audit for select using (public.is_org_member(organization_id));
drop policy if exists "members can read budget row audit" on public.budget_import_row_audit;
create policy "members can read budget row audit" on public.budget_import_row_audit for select using (public.is_org_member(public.get_budget_batch_organization_id(batch_id)));
drop policy if exists "members can read budget ledger audit" on public.budget_ledger_audit;
create policy "members can read budget ledger audit" on public.budget_ledger_audit for select using (public.is_org_member(organization_id));

insert into public.budget_monthly_account_totals (
  organization_id, reference_year, reference_month, account_id, account_number, total_amount, entry_count, refreshed_at
)
select
  l.organization_id,
  l.reference_year,
  l.reference_month,
  (array_agg(l.account_id order by l.account_id) filter (where l.account_id is not null))[1] as account_id,
  l.account_number,
  coalesce(sum(l.amount), 0)::numeric(18, 2) as total_amount,
  count(*)::integer as entry_count,
  now()
from public.budget_ledger_entries l
group by l.organization_id, l.reference_year, l.reference_month, l.account_number
on conflict (organization_id, reference_year, reference_month, account_number) do update
  set account_id = excluded.account_id,
      total_amount = excluded.total_amount,
      entry_count = excluded.entry_count,
      refreshed_at = excluded.refreshed_at,
      updated_at = now();

commit;
