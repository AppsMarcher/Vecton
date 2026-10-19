-- Verificação da migration 275. Somente leitura.

-- A) ANTES de aplicar: linhas orcado SEM linha idêntica no realizado. Esperado: 0.
select count(*) as orcado_diferente_do_realizado
  from public.headcount_entries o
 where o.load_type = 'orcado'
   and not exists (
     select 1 from public.headcount_entries r
      where r.load_type = 'realizado'
        and r.organization_id = o.organization_id
        and r.reference_year = o.reference_year
        and r.reference_month = o.reference_month
        and r.matricula = o.matricula
        and r.colab = o.colab
        and r.cost_center_number = o.cost_center_number
        and coalesce(r.cargo, '') = coalesce(o.cargo, '')
   );

-- B) DEPOIS de aplicar: nada de orcado. Esperado: 0 e 0.
select count(*) as linhas_orcado from public.headcount_entries where load_type = 'orcado';
select count(*) as lotes_orcado from public.headcount_import_batches where load_type = 'orcado';

-- C) O realizado não pode mudar. Esperado: 1101 linhas em 2026 (9 meses).
select reference_year, count(*) as linhas, count(distinct reference_month) as meses
  from public.headcount_entries
 where load_type = 'realizado'
 group by reference_year;
