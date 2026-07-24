begin;

alter table public.user_profiles
  add column if not exists extra_branch_ids    uuid[]   not null default '{}',
  add column if not exists extra_cc_ids        uuid[]   not null default '{}',
  add column if not exists extra_account_codes text[]   not null default '{}',
  add column if not exists extra_report_ids    text[]   not null default '{}';

commit;
