-- 275: Limpa o "Headcount orçado" de 2026, que era cópia do realizado.
-- Os 5 lotes (jan-26-real.xlsx a mai-26-real.xlsx, enviados em 11/06/2026) foram
-- carregados como tipo "orcado", mas as 603 linhas de headcount_entries são
-- idênticas às do realizado (mesmo mês, matrícula, colaborador, CC e cargo).
-- O headcount planejado passa a viver nos cenários (forecast_headcount_entries).
--
-- Segurança: aborta sem apagar nada se existir qualquer linha "orcado" que NÃO
-- tenha uma linha idêntica no realizado (ou seja, se houver orçamento de verdade).

begin;

do $$
declare
  nao_identicas integer;
begin
  select count(*) into nao_identicas
    from public.headcount_entries o
   where o.load_type = 'orcado'
     and not exists (
       select 1
         from public.headcount_entries r
        where r.load_type = 'realizado'
          and r.organization_id = o.organization_id
          and r.reference_year = o.reference_year
          and r.reference_month = o.reference_month
          and r.matricula = o.matricula
          and r.colab = o.colab
          and r.cost_center_number = o.cost_center_number
          and coalesce(r.cargo, '') = coalesce(o.cargo, '')
     );

  if nao_identicas > 0 then
    raise exception 'Há % linha(s) orcado diferentes do realizado; nada foi apagado. Revise antes de aplicar a 275.', nao_identicas;
  end if;
end;
$$;

delete from public.headcount_entries where load_type = 'orcado';

-- As linhas importadas (headcount_import_rows) saem em cascata.
delete from public.headcount_import_batches where load_type = 'orcado';

commit;
