begin;

-- Both validate_actuals_import_row and validate_budget_import_row compared
-- a.account_number directly against the normalized (digits-only) value from
-- the import row. If accounts are stored with formatting (dots, dashes, spaces),
-- the lookup returned no rows and every row was flagged "Conta nao cadastrada".
-- Fix: strip non-digits from a.account_number on both sides of the comparison.

create or replace function public.validate_actuals_import_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_rec public.actuals_import_batches%rowtype;
  error_list jsonb := '[]'::jsonb;
  normalized_branch text;
  normalized_account text;
  normalized_cost_center text;
begin
  select *
    into batch_rec
  from public.actuals_import_batches
  where id = new.batch_id;

  if not found then
    raise exception 'Lote de importacao nao encontrado';
  end if;

  normalized_branch     := nullif(btrim(new.branch_code), '');
  normalized_account    := nullif(btrim(new.account_number), '');
  normalized_cost_center := nullif(btrim(new.cost_center_number), '');

  new.branch_code        := coalesce(normalized_branch, '');
  new.account_number     := coalesce(normalized_account, '');
  new.cost_center_number := normalized_cost_center;
  new.branch_id          := null;
  new.account_id         := null;
  new.cost_center_id     := null;

  if new.entry_date is null then
    error_list := error_list || jsonb_build_array('Data obrigatoria');
  elsif extract(year  from new.entry_date)::integer <> batch_rec.reference_year
     or extract(month from new.entry_date)::integer <> batch_rec.reference_month then
    error_list := error_list || jsonb_build_array('Data fora da competencia do lote');
  end if;

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
      and regexp_replace(a.account_number, '[^0-9]', '', 'g') = normalized_account
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

  new.validation_errors := error_list;
  new.validation_status := case
    when jsonb_array_length(error_list) > 0 then 'error'
    else 'valid'
  end;

  if batch_rec.status = 'applied' and new.validation_status <> 'valid' then
    raise exception 'Lotes aplicados nao aceitam linhas invalidas';
  end if;

  return new;
end;
$$;

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

  normalized_branch      := nullif(btrim(new.branch_code), '');
  normalized_account     := nullif(btrim(new.account_number), '');
  normalized_cost_center := nullif(btrim(new.cost_center_number), '');

  new.branch_code        := coalesce(normalized_branch, '');
  new.account_number     := coalesce(normalized_account, '');
  new.cost_center_number := normalized_cost_center;
  new.branch_id          := null;
  new.account_id         := null;
  new.cost_center_id     := null;

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
      and regexp_replace(a.account_number, '[^0-9]', '', 'g') = normalized_account
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

commit;
