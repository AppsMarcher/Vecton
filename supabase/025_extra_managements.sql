begin;

alter table public.user_profiles
  add column if not exists extra_managements text[] not null default '{}';

commit;
