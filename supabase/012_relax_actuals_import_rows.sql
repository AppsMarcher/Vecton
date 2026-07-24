begin;

alter table public.actuals_import_rows
  alter column entry_date drop not null,
  alter column branch_code drop not null,
  alter column account_number drop not null,
  alter column amount drop not null;

commit;
