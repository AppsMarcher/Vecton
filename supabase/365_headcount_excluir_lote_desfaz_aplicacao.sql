begin;

-- Headcount no mesmo padrão das outras cargas (DRE, Budget, Vendas): "Excluir lote" desfaz a aplicação.
-- Antes, os colaboradores aplicados (headcount_entries / forecast_headcount_entries) não sabiam de qual lote vieram,
-- então excluir um lote aplicado removia só o lote e os colaboradores continuavam nos relatórios.
--
-- 1) Cada colaborador aplicado passa a guardar o lote que o gerou (batch_id).
-- 2) Os já existentes recebem o lote aplicado MAIS RECENTE do mesmo mês e tipo (a carga completa substitui o mês
--    inteiro, então o último lote aplicado é o dono dos colaboradores do mês).
-- 3) delete_headcount_import_batch(): remove os colaboradores do lote e depois o lote (as linhas do lote caem em cascata),
--    sem o limite de 8s do DELETE direto.

alter table public.headcount_entries
  add column if not exists batch_id uuid;
alter table public.forecast_headcount_entries
  add column if not exists batch_id uuid;

create index if not exists headcount_entries_batch_id_idx
  on public.headcount_entries (batch_id);
create index if not exists forecast_headcount_entries_batch_id_idx
  on public.forecast_headcount_entries (batch_id);

-- Realizado/Orçado: dono = lote aplicado mais recente do mesmo mês e tipo.
update public.headcount_entries e
   set batch_id = b.id
  from (
    select distinct on (organization_id, reference_year, reference_month, load_type)
           id, organization_id, reference_year, reference_month, load_type
      from public.headcount_import_batches
     where status = 'applied'
     order by organization_id, reference_year, reference_month, load_type, applied_at desc nulls last
  ) b
 where e.batch_id is null
   and e.organization_id = b.organization_id
   and e.reference_year = b.reference_year
   and e.reference_month = b.reference_month
   and e.load_type = b.load_type;

-- Planejado (cenário): o tipo do lote é "cenario:<id do cenário>".
update public.forecast_headcount_entries e
   set batch_id = b.id
  from (
    select distinct on (organization_id, reference_year, reference_month, load_type)
           id, organization_id, reference_year, reference_month, load_type
      from public.headcount_import_batches
     where status = 'applied' and load_type like 'cenario:%'
     order by organization_id, reference_year, reference_month, load_type, applied_at desc nulls last
  ) b
 where e.batch_id is null
   and e.organization_id = b.organization_id
   and e.reference_year = b.reference_year
   and e.reference_month = b.reference_month
   and e.scenario_id::text = substr(b.load_type, length('cenario:') + 1);

create or replace function public.delete_headcount_import_batch(target_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '0'
as $$
declare
  batch_rec public.headcount_import_batches%rowtype;
begin
  select *
    into batch_rec
  from public.headcount_import_batches
  where id = target_batch_id;

  if not found then
    raise exception 'Lote de importacao nao encontrado';
  end if;

  if not public.is_org_editor(batch_rec.organization_id) then
    raise exception 'Usuario sem permissao para excluir este lote';
  end if;

  delete from public.headcount_entries where batch_id = target_batch_id;
  delete from public.forecast_headcount_entries where batch_id = target_batch_id;

  delete from public.headcount_import_batches where id = target_batch_id;
end;
$$;

revoke execute on function public.delete_headcount_import_batch(uuid) from public, anon;
grant execute on function public.delete_headcount_import_batch(uuid) to authenticated;

commit;
