begin;

-- Mesmo backfill da migration 182, agora para 2023 e 2024. Pecas e
-- roteamento nacional -> 100% cai pra Jenifer (000633), sem excecao por
-- territorio/UF (regra da migration 039 e da atribuicao seedada com
-- data_inicio = 2023-01-01, cobrindo esses dois anos por completo).
--
-- Escopo: organizacao Marcher Brasil, linha_negocio = 'Pecas', anos 2023 e
-- 2024, origem FAT ou CART, somente linhas onde cod_vendedor ainda esta
-- nulo (idempotente — rodar de novo nao altera nada ja preenchido).

do $$
declare
  v_org uuid;
  v_line uuid;
  v_count integer;
begin
  select id into v_org from public.organizations where name = 'Marcher Brasil' limit 1;
  if v_org is null then raise exception 'Organizacao Marcher Brasil nao encontrada'; end if;

  select id into v_line from public.comercial_linhas_negocio
   where organization_id = v_org and nome = 'Peças' limit 1;
  if v_line is null then raise exception 'Linha de negocio Pecas nao encontrada'; end if;

  select count(*) into v_count
  from public.comercial_realizado_ledger_entries
  where organization_id = v_org
    and linha_negocio_id = v_line
    and reference_year in (2023, 2024)
    and origem in ('FAT', 'CART')
    and cod_vendedor is null;

  raise notice 'Linhas de Pecas 2023/2024 sem cod_vendedor a atualizar: %', v_count;

  update public.comercial_realizado_ledger_entries le
  set cod_vendedor = '000633',
      updated_by = auth.uid(),
      updated_at = now()
  where le.organization_id = v_org
    and le.linha_negocio_id = v_line
    and le.reference_year in (2023, 2024)
    and le.origem in ('FAT', 'CART')
    and le.cod_vendedor is null;

  -- Resolve campanha_atribuicao_id/campanha_status com a mesma logica do
  -- gatilho zzz_validate_comercial_vendedor_campanha (migration 064), pra
  -- essas linhas ficarem consistentes com o que teriam recebido se o
  -- cod_vendedor já viesse preenchido na carga original.
  update public.comercial_realizado_ledger_entries le
  set campanha_atribuicao_id = ar.id,
      campanha_status = 'valida'
  from public.comercial_atribuicao_responsavel ar
  where le.organization_id = v_org
    and le.linha_negocio_id = v_line
    and le.reference_year in (2023, 2024)
    and le.origem in ('FAT', 'CART')
    and le.cod_vendedor = '000633'
    and le.campanha_status = 'sem_atribuicao_valida'
    and ar.organization_id = v_org
    and ar.cod_vendedor = '000633'
    and ar.territorio_id is not distinct from le.territorio_id
    and ar.linha_negocio_id = v_line
    and le.entry_date >= ar.data_inicio
    and (ar.data_fim is null or le.entry_date <= ar.data_fim)
    and ar.id = (
      select ar2.id from public.comercial_atribuicao_responsavel ar2
      where ar2.organization_id = v_org
        and ar2.cod_vendedor = '000633'
        and ar2.territorio_id is not distinct from le.territorio_id
        and ar2.linha_negocio_id = v_line
        and le.entry_date >= ar2.data_inicio
        and (ar2.data_fim is null or le.entry_date <= ar2.data_fim)
      order by ar2.data_inicio desc limit 1
    );
end $$;

-- Conferencia pos-backfill: deve dar 0 linhas de Pecas 2023/2024 com
-- cod_vendedor nulo, e o faturamento total por ano+cod_vendedor deve bater
-- 100% em 000633.
select
  l.reference_year,
  coalesce(l.cod_vendedor, '(nulo)') as cod_vendedor,
  count(*) as linhas,
  sum(l.valor) as faturamento
from public.comercial_realizado_ledger_entries l
join public.comercial_linhas_negocio ln on ln.id = l.linha_negocio_id
where ln.nome = 'Peças' and l.reference_year in (2023, 2024) and l.origem in ('FAT', 'CART')
group by 1, 2
order by 1, faturamento desc nulls last;

commit;
