begin;

-- Evita que cargas sobrepostas voltem a se acumular (ver limpeza manual das
-- migrations 195-203). Quando uma recarga 'complete' e aplicada, qualquer
-- lote anterior JA APLICADO da mesma organizacao que fica sem nenhuma linha
-- viva no razao e removido na hora (lote + auditoria dele).
--
-- Criterio de seguranca (lição da limpeza manual: uma versao anterior desse
-- criterio apagou por engano lotes 'ready'/'error' que nunca tinham sido
-- aplicados -- nao eram sobrepostos, so ainda nao tinham sido usados):
--   - so considera lotes com status = 'applied' (nunca ready/error/draft)
--   - so remove se, na pratica, NENHUMA linha do lote tem correspondente
--     no razao vivo agora (confere de verdade, nao supoe por load_mode)
--   - nunca remove o lote que acabou de ser aplicado (id <> target_batch_id)

create or replace function public.apply_actuals_import_batch(target_batch_id uuid)
returns public.actuals_import_batches
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '0'
as $function$
declare
  batch_rec public.actuals_import_batches%rowtype;
  previous_batch_id uuid;
begin
  select *
    into batch_rec
  from public.actuals_import_batches
  where id = target_batch_id;

  if not found then
    raise exception 'Lote de importacao nao encontrado';
  end if;

  if not public.is_org_editor(batch_rec.organization_id) then
    raise exception 'Usuario sem permissao para aplicar este lote';
  end if;

  if not exists (
    select 1
    from public.actuals_import_rows r
    where r.batch_id = target_batch_id
  ) then
    raise exception 'O lote nao possui linhas para aplicacao';
  end if;

  if exists (
    select 1
    from public.actuals_import_rows r
    where r.batch_id = target_batch_id
      and r.validation_status = 'error'
  ) then
    raise exception 'Corrija todas as linhas com erro antes de aplicar o lote';
  end if;

  if batch_rec.load_mode = 'complete' then
    delete from public.actuals_ledger_entries l
    where l.organization_id = batch_rec.organization_id
      and l.reference_year = batch_rec.reference_year
      and l.reference_month = batch_rec.reference_month;
  else
    delete from public.actuals_ledger_entries l
    where l.batch_id = target_batch_id;
  end if;

  insert into public.actuals_ledger_entries (
    organization_id,
    batch_id,
    batch_row_id,
    reference_year,
    reference_month,
    entry_date,
    branch_id,
    account_id,
    cost_center_id,
    branch_code,
    account_number,
    cost_center_number,
    history,
    lot_code,
    amount,
    source_type,
    created_by,
    updated_by
  )
  select
    batch_rec.organization_id,
    r.batch_id,
    r.id,
    batch_rec.reference_year,
    batch_rec.reference_month,
    r.entry_date,
    r.branch_id,
    r.account_id,
    r.cost_center_id,
    r.branch_code,
    r.account_number,
    r.cost_center_number,
    r.history,
    r.lot_code,
    r.amount,
    batch_rec.source_type,
    auth.uid(),
    auth.uid()
  from public.actuals_import_rows r
  where r.batch_id = target_batch_id
    and r.validation_status = 'valid'
  on conflict (batch_row_id) do update
    set entry_date = excluded.entry_date,
        branch_id = excluded.branch_id,
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

  perform public.refresh_actuals_monthly_account_totals(
    batch_rec.organization_id,
    batch_rec.reference_year,
    batch_rec.reference_month
  );

  update public.actuals_import_batches
     set status = 'applied',
         applied_by = auth.uid(),
         applied_at = now(),
         updated_at = now()
   where id = target_batch_id
   returning *
    into batch_rec;

  if batch_rec.load_mode = 'complete' then
    for previous_batch_id in
      select b.id
      from public.actuals_import_batches b
      where b.organization_id = batch_rec.organization_id
        and b.status = 'applied'
        and b.id <> target_batch_id
        and not exists (
          select 1
          from public.actuals_import_rows r
          join public.actuals_ledger_entries l on l.batch_row_id = r.id
          where r.batch_id = b.id
        )
    loop
      delete from public.actuals_import_batches where id = previous_batch_id;
      delete from public.actuals_ledger_audit where batch_id = previous_batch_id;
      delete from public.actuals_import_row_audit where batch_id = previous_batch_id;
      delete from public.actuals_import_batch_audit where batch_id = previous_batch_id;
    end loop;
  end if;

  return batch_rec;
end;
$function$;

create or replace function public.apply_budget_import_batch(target_batch_id uuid)
returns public.budget_import_batches
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '0'
as $function$
declare
  batch_rec public.budget_import_batches%rowtype;
  previous_batch_id uuid;
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

  if batch_rec.load_mode = 'complete' then
    for previous_batch_id in
      select b.id
      from public.budget_import_batches b
      where b.organization_id = batch_rec.organization_id
        and b.status = 'applied'
        and b.id <> target_batch_id
        and not exists (
          select 1
          from public.budget_import_rows r
          join public.budget_ledger_entries l on l.batch_row_id = r.id
          where r.batch_id = b.id
        )
    loop
      delete from public.budget_import_batches where id = previous_batch_id;
      delete from public.budget_ledger_audit where batch_id = previous_batch_id;
      delete from public.budget_import_row_audit where batch_id = previous_batch_id;
      delete from public.budget_import_batch_audit where batch_id = previous_batch_id;
    end loop;
  end if;

  return batch_rec;
end;
$function$;

create or replace function public.apply_comercial_realizado_import_batch(target_batch_id uuid)
returns public.comercial_realizado_import_batches
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  batch_rec public.comercial_realizado_import_batches%rowtype;
  previous_batch_id uuid;
begin
  select * into batch_rec from public.comercial_realizado_import_batches where id = target_batch_id;
  if not found then raise exception 'Lote de importacao nao encontrado'; end if;
  if not public.is_org_editor(batch_rec.organization_id) then raise exception 'Usuario sem permissao para aplicar este lote'; end if;
  if not exists (select 1 from public.comercial_realizado_import_rows where batch_id = target_batch_id) then raise exception 'O lote nao possui linhas para aplicacao'; end if;
  if exists (select 1 from public.comercial_realizado_import_rows where batch_id = target_batch_id and validation_status = 'error') then raise exception 'Corrija todas as linhas com erro antes de aplicar o lote'; end if;

  if batch_rec.load_mode = 'complete' then
    delete from public.comercial_realizado_ledger_entries where organization_id = batch_rec.organization_id and reference_year = batch_rec.reference_year and reference_month = batch_rec.reference_month;
  else
    delete from public.comercial_realizado_ledger_entries where batch_id = target_batch_id;
  end if;

  insert into public.comercial_realizado_ledger_entries (
    organization_id,batch_id,batch_row_id,reference_year,reference_month,entry_date,origem,produto_id,cliente_id,territorio_id,linha_negocio_id,coordenacao_id,responsavel,cod_produto,cod_cliente,quantidade,valor,mb_pct,source_type,created_by,updated_by,cod_vendedor,campanha_atribuicao_id,campanha_status
  )
  select batch_rec.organization_id,r.batch_id,r.id,batch_rec.reference_year,batch_rec.reference_month,r.entry_date,r.origem,r.produto_id,r.cliente_id,r.territorio_id,r.linha_negocio_id,r.coordenacao_id,r.responsavel,r.cod_produto,r.cod_cliente,r.quantidade,r.valor,r.mb_pct,batch_rec.source_type,auth.uid(),auth.uid(),r.cod_vendedor,r.campanha_atribuicao_id,r.campanha_status
  from public.comercial_realizado_import_rows r where r.batch_id = target_batch_id and r.validation_status = 'valid'
  on conflict (batch_row_id) do update set entry_date=excluded.entry_date,origem=excluded.origem,produto_id=excluded.produto_id,cliente_id=excluded.cliente_id,territorio_id=excluded.territorio_id,linha_negocio_id=excluded.linha_negocio_id,coordenacao_id=excluded.coordenacao_id,responsavel=excluded.responsavel,cod_produto=excluded.cod_produto,cod_cliente=excluded.cod_cliente,quantidade=excluded.quantidade,valor=excluded.valor,mb_pct=excluded.mb_pct,source_type=excluded.source_type,cod_vendedor=excluded.cod_vendedor,campanha_atribuicao_id=excluded.campanha_atribuicao_id,campanha_status=excluded.campanha_status,updated_by=auth.uid(),updated_at=now();

  update public.comercial_realizado_import_batches set status='applied', applied_by=auth.uid(), applied_at=now(), updated_at=now() where id=target_batch_id returning * into batch_rec;

  if batch_rec.load_mode = 'complete' then
    for previous_batch_id in
      select b.id
      from public.comercial_realizado_import_batches b
      where b.organization_id = batch_rec.organization_id
        and b.status = 'applied'
        and b.id <> target_batch_id
        and not exists (
          select 1
          from public.comercial_realizado_import_rows r
          join public.comercial_realizado_ledger_entries l on l.batch_row_id = r.id
          where r.batch_id = b.id
        )
    loop
      delete from public.comercial_realizado_import_batches where id = previous_batch_id;
      delete from public.comercial_realizado_ledger_audit where batch_id = previous_batch_id;
      delete from public.comercial_realizado_row_audit where batch_id = previous_batch_id;
      delete from public.comercial_realizado_batch_audit where batch_id = previous_batch_id;
    end loop;
  end if;

  return batch_rec;
end; $function$;

create or replace function public.apply_comercial_planejado_import_batch(target_batch_id uuid)
returns public.comercial_planejado_import_batches
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  batch_rec public.comercial_planejado_import_batches%rowtype;
  previous_batch_id uuid;
begin
  select * into batch_rec
  from public.comercial_planejado_import_batches
  where id = target_batch_id;

  if not found then
    raise exception 'Lote de importacao nao encontrado';
  end if;

  if not public.is_org_editor(batch_rec.organization_id) then
    raise exception 'Usuario sem permissao para aplicar este lote';
  end if;

  if not exists (select 1 from public.comercial_planejado_import_rows r where r.batch_id = target_batch_id) then
    raise exception 'O lote nao possui linhas para aplicacao';
  end if;

  if exists (select 1 from public.comercial_planejado_import_rows r where r.batch_id = target_batch_id and r.validation_status = 'error') then
    raise exception 'Corrija todas as linhas com erro antes de aplicar o lote';
  end if;

  -- Carga completa: apaga so os (cenario, ano, mes) que aparecem no lote.
  -- Meses ausentes do arquivo ficam intactos (revisao parcial).
  if batch_rec.load_mode = 'complete' then
    delete from public.comercial_planejado_ledger_entries l
    where l.organization_id = batch_rec.organization_id
      and l.scenario_id is not distinct from batch_rec.scenario_id
      and l.reference_year = batch_rec.reference_year
      and l.reference_month in (
        select distinct coalesce(r.reference_month, batch_rec.reference_month)
        from public.comercial_planejado_import_rows r
        where r.batch_id = target_batch_id and r.validation_status = 'valid'
      );
  else
    delete from public.comercial_planejado_ledger_entries l
    where l.batch_id = target_batch_id;
  end if;

  insert into public.comercial_planejado_ledger_entries (
    organization_id, scenario_id, batch_id, batch_row_id, reference_year, reference_month,
    produto_id, territorio_id, linha_negocio_id, coordenacao_id, responsavel,
    cod_produto, quantidade, valor, mb_pct, source_type, created_by, updated_by
  )
  select
    batch_rec.organization_id, batch_rec.scenario_id, r.batch_id, r.id, batch_rec.reference_year, coalesce(r.reference_month, batch_rec.reference_month),
    r.produto_id, r.territorio_id, r.linha_negocio_id, r.coordenacao_id, r.responsavel,
    r.cod_produto, r.quantidade, r.valor, r.mb_pct, batch_rec.source_type, auth.uid(), auth.uid()
  from public.comercial_planejado_import_rows r
  where r.batch_id = target_batch_id and r.validation_status = 'valid'
  on conflict (batch_row_id) do update
    set scenario_id = excluded.scenario_id,
        reference_month = excluded.reference_month,
        produto_id = excluded.produto_id,
        territorio_id = excluded.territorio_id,
        linha_negocio_id = excluded.linha_negocio_id,
        coordenacao_id = excluded.coordenacao_id,
        responsavel = excluded.responsavel,
        cod_produto = excluded.cod_produto,
        quantidade = excluded.quantidade,
        valor = excluded.valor,
        mb_pct = excluded.mb_pct,
        source_type = excluded.source_type,
        updated_by = auth.uid(),
        updated_at = now();

  update public.comercial_planejado_import_batches
     set status = 'applied', applied_by = auth.uid(), applied_at = now(), updated_at = now()
   where id = target_batch_id
   returning * into batch_rec;

  if batch_rec.load_mode = 'complete' then
    for previous_batch_id in
      select b.id
      from public.comercial_planejado_import_batches b
      where b.organization_id = batch_rec.organization_id
        and b.scenario_id is not distinct from batch_rec.scenario_id
        and b.status = 'applied'
        and b.id <> target_batch_id
        and not exists (
          select 1
          from public.comercial_planejado_import_rows r
          join public.comercial_planejado_ledger_entries l on l.batch_row_id = r.id
          where r.batch_id = b.id
        )
    loop
      delete from public.comercial_planejado_import_batches where id = previous_batch_id;
      delete from public.comercial_planejado_ledger_audit where batch_id = previous_batch_id;
      delete from public.comercial_planejado_row_audit where batch_id = previous_batch_id;
      delete from public.comercial_planejado_batch_audit where batch_id = previous_batch_id;
    end loop;
  end if;

  return batch_rec;
end;
$function$;

commit;
