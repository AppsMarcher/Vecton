-- Carga de vendas realizadas: novo layout com FAT (valor), RL (receita liquida) e
-- MP (margem). A MB (%) = MP / RL e e gravada em mb_pct na carga (fracao, 0,10 = 10%).
-- Nenhum relatorio usa a MB por enquanto. Dados existentes ficam intactos
-- (rl/mp nulos ate a recarga da base).
begin;

alter table public.comercial_realizado_import_rows
  add column if not exists rl numeric(18, 2),
  add column if not exists mp numeric(18, 2);

alter table public.comercial_realizado_ledger_entries
  add column if not exists rl numeric(18, 2),
  add column if not exists mp numeric(18, 2);

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
    organization_id,batch_id,batch_row_id,reference_year,reference_month,entry_date,origem,produto_id,cliente_id,territorio_id,linha_negocio_id,coordenacao_id,responsavel,cod_produto,cod_cliente,quantidade,valor,mb_pct,rl,mp,source_type,created_by,updated_by,cod_vendedor,campanha_atribuicao_id,campanha_status
  )
  select batch_rec.organization_id,r.batch_id,r.id,batch_rec.reference_year,batch_rec.reference_month,r.entry_date,r.origem,r.produto_id,r.cliente_id,r.territorio_id,r.linha_negocio_id,r.coordenacao_id,r.responsavel,r.cod_produto,r.cod_cliente,r.quantidade,r.valor,r.mb_pct,r.rl,r.mp,batch_rec.source_type,auth.uid(),auth.uid(),r.cod_vendedor,r.campanha_atribuicao_id,r.campanha_status
  from public.comercial_realizado_import_rows r where r.batch_id = target_batch_id and r.validation_status = 'valid'
  on conflict (batch_row_id) do update set entry_date=excluded.entry_date,origem=excluded.origem,produto_id=excluded.produto_id,cliente_id=excluded.cliente_id,territorio_id=excluded.territorio_id,linha_negocio_id=excluded.linha_negocio_id,coordenacao_id=excluded.coordenacao_id,responsavel=excluded.responsavel,cod_produto=excluded.cod_produto,cod_cliente=excluded.cod_cliente,quantidade=excluded.quantidade,valor=excluded.valor,mb_pct=excluded.mb_pct,rl=excluded.rl,mp=excluded.mp,source_type=excluded.source_type,cod_vendedor=excluded.cod_vendedor,campanha_atribuicao_id=excluded.campanha_atribuicao_id,campanha_status=excluded.campanha_status,updated_by=auth.uid(),updated_at=now();

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

create or replace function public.after_comercial_realizado_import_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_batch_id uuid;
  batch_rec public.comercial_realizado_import_batches%rowtype;
begin
  target_batch_id := coalesce(new.batch_id, old.batch_id);

  perform public.refresh_comercial_realizado_batch_stats(target_batch_id);

  select *
    into batch_rec
  from public.comercial_realizado_import_batches
  where id = target_batch_id;

  if batch_rec.status = 'applied' then
    if tg_op = 'DELETE' then
      delete from public.comercial_realizado_ledger_entries
      where batch_row_id = old.id;
    elsif coalesce(new.validation_status, 'error') = 'valid' then
      insert into public.comercial_realizado_ledger_entries (
        organization_id, batch_id, batch_row_id, reference_year, reference_month,
        entry_date, origem, produto_id, cliente_id, territorio_id, linha_negocio_id,
        coordenacao_id, responsavel, cod_produto, cod_cliente, quantidade, valor,
        mb_pct, rl, mp, source_type, created_by, updated_by
      )
      values (
        batch_rec.organization_id, new.batch_id, new.id, batch_rec.reference_year, batch_rec.reference_month,
        new.entry_date, new.origem, new.produto_id, new.cliente_id, new.territorio_id, new.linha_negocio_id,
        new.coordenacao_id, new.responsavel, new.cod_produto, new.cod_cliente, new.quantidade, new.valor,
        new.mb_pct, new.rl, new.mp, batch_rec.source_type, auth.uid(), auth.uid()
      )
      on conflict (batch_row_id) do update
        set entry_date = excluded.entry_date,
            origem = excluded.origem,
            produto_id = excluded.produto_id,
            cliente_id = excluded.cliente_id,
            territorio_id = excluded.territorio_id,
            linha_negocio_id = excluded.linha_negocio_id,
            coordenacao_id = excluded.coordenacao_id,
            responsavel = excluded.responsavel,
            cod_produto = excluded.cod_produto,
            cod_cliente = excluded.cod_cliente,
            quantidade = excluded.quantidade,
            valor = excluded.valor,
            mb_pct = excluded.mb_pct,
            rl = excluded.rl,
            mp = excluded.mp,
            source_type = excluded.source_type,
            updated_by = auth.uid(),
            updated_at = now();
    else
      delete from public.comercial_realizado_ledger_entries
      where batch_row_id = new.id;
    end if;
  end if;

  return null;
end;
$$;

commit;
