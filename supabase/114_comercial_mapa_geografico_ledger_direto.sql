begin;

-- ---------------------------------------------------------------------------
-- 114 — Corrige "column le.cod_vendedor does not exist" na RPC
-- comercial_mapa_geografico_vendas.
--
-- Causa: a função lia de public.comercial_faturado, uma view
-- `select * from comercial_realizado_ledger_entries where origem = 'FAT'`
-- criada na migration 038 — ANTES da coluna cod_vendedor existir (adicionada
-- só na 064). Em Postgres, `select *` numa view fica congelado na lista de
-- colunas de quando ela foi criada/recriada; colunas novas na tabela base não
-- aparecem na view automaticamente.
--
-- Fix: ler direto de comercial_realizado_ledger_entries (com origem='FAT'
-- explícito), igual o RPC comercial_painel_detalhe (048/055/090) já faz.
-- Mesma assinatura da 113 — create or replace sem precisar dropar.
-- ---------------------------------------------------------------------------

create or replace function public.comercial_mapa_geografico_vendas(
  p_org          uuid,
  p_year         integer,
  p_month        integer,
  p_period       text,
  p_uf           text[] default null,
  p_cultura      text   default null,
  p_modelo       text[] default null,
  p_territorio   text[] default null,
  p_coordenacao  text[] default null,
  p_vendedor     text[] default null
)
returns table(
  uf          text,
  modelo      text,
  cultura     text,
  quantidade  numeric,
  valor       numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_lo integer; v_hi integer;
begin
  if not public.is_org_member(p_org) then
    raise exception 'Usuario sem acesso a organizacao';
  end if;
  v_lo := case when p_period = 'mes' then p_month else 1 end;
  v_hi := case when p_period = 'fy' then 12 else p_month end;

  return query
  select
    cl.uf,
    coalesce(nullif(pr.nome_reduzido, ''), pr.codigo) as modelo,
    coalesce(cu.nome, 'Outros') as cultura,
    sum(le.quantidade),
    sum(le.valor)
  from public.comercial_realizado_ledger_entries le
  join public.comercial_produtos pr on pr.id = le.produto_id
  join public.comercial_tipos ti on ti.id = pr.tipo_id and ti.nome = 'Máquinas'
  join public.comercial_clientes cl on cl.id = le.cliente_id
  left join public.comercial_culturas cu on cu.id = pr.cultura_id
  left join public.comercial_territorios tr on tr.id = le.territorio_id
  left join public.comercial_coordenacoes co on co.id = le.coordenacao_id
  where le.organization_id = p_org
    and le.origem = 'FAT'
    and le.reference_year = p_year
    and le.reference_month between v_lo and v_hi
    and cl.uf is not null
    and (p_uf is null or cardinality(p_uf) = 0 or cl.uf = any(p_uf))
    and (p_cultura is null or p_cultura = '' or coalesce(cu.nome, 'Outros') = p_cultura)
    and (p_modelo is null or cardinality(p_modelo) = 0
         or coalesce(nullif(pr.nome_reduzido, ''), pr.codigo) = any(p_modelo))
    and (p_territorio is null or cardinality(p_territorio) = 0 or tr.nome = any(p_territorio))
    and (p_coordenacao is null or cardinality(p_coordenacao) = 0 or co.nome = any(p_coordenacao))
    and (p_vendedor is null or cardinality(p_vendedor) = 0 or le.cod_vendedor = any(p_vendedor))
  group by cl.uf, coalesce(nullif(pr.nome_reduzido, ''), pr.codigo), coalesce(cu.nome, 'Outros')
  having coalesce(sum(le.valor), 0) <> 0;
end;
$$;

grant execute on function public.comercial_mapa_geografico_vendas(
  uuid, integer, integer, text, text[], text, text[], text[], text[], text[]
) to authenticated;

commit;
