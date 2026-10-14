begin;

-- 256 — Margens por Maquinas ganha o filtro "Equipe Comercial" (Territorio /
-- Coordenacao / Vendedor), igual ao do Mapa de Vendas (migration 125).
--
-- O filtro e usado apenas pela tabela "Evolutivo de Margens · Maquinas"; os demais
-- blocos do relatorio seguem chamando a funcao sem filtro.
--
-- Assinatura ganha 3 parametros no final, com default null. Como o numero de
-- argumentos muda, a funcao antiga (uuid, integer) e removida antes para nao
-- deixar duas sobrecargas ambiguas para o PostgREST; as chamadas existentes
-- (so p_org e p_year) continuam funcionando pelos defaults.
--
-- Demais regras iguais as da 255: so FAT, liquido de devolucao, acesso restrito
-- a super_admin, admin e manager.

drop function if exists public.comercial_margens_itens(uuid, integer);

create or replace function public.comercial_margens_itens(
  p_org         uuid,
  p_year        integer,
  p_territorio  text[] default null,
  p_coordenacao text[] default null,
  p_vendedor    text[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if not public.is_org_member(p_org) then
    raise exception 'Usuario sem acesso a organizacao';
  end if;

  if not exists (
    select 1 from public.user_profiles up
     where up.organization_id = p_org
       and up.user_id = auth.uid()
       and (
         up.access_role in ('super_admin', 'admin', 'manager')
         or 'manager' = any(up.additional_access_roles)
       )
  ) then
    raise exception 'Usuario sem permissao para o relatorio de margens';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_array(
             x.ano, x.mes, x.cod_produto, x.descricao, x.nome_reduzido, x.tipo, x.cultura,
             x.quantidade, x.fat, x.rl, x.mp
           )
           order by x.ano, x.mes, x.cod_produto
         ), '[]'::jsonb)
    into v_rows
    from (
      select le.reference_year                   as ano,
             le.reference_month                  as mes,
             le.cod_produto                      as cod_produto,
             pr.descricao                        as descricao,
             nullif(btrim(pr.nome_reduzido), '') as nome_reduzido,
             ti.nome                             as tipo,
             cu.nome                             as cultura,
             sum(le.quantidade)                  as quantidade,
             sum(le.valor)                       as fat,
             sum(coalesce(le.rl, 0))             as rl,
             sum(coalesce(le.mp, 0))             as mp
        from public.comercial_realizado_ledger_entries le
        join public.comercial_produtos pr on pr.id = le.produto_id
        join public.comercial_tipos    ti on ti.id = pr.tipo_id
        left join public.comercial_culturas    cu on cu.id = pr.cultura_id
        left join public.comercial_territorios tr on tr.id = le.territorio_id
        left join public.comercial_coordenacoes co on co.id = le.coordenacao_id
       where le.organization_id = p_org
         and le.origem = 'FAT'
         and le.reference_year in (p_year - 1, p_year)
         and (p_territorio  is null or cardinality(p_territorio)  = 0 or tr.nome = any(p_territorio))
         and (p_coordenacao is null or cardinality(p_coordenacao) = 0 or co.nome = any(p_coordenacao))
         and (p_vendedor    is null or cardinality(p_vendedor)    = 0 or le.cod_vendedor = any(p_vendedor))
       group by le.reference_year, le.reference_month, le.cod_produto,
                pr.descricao, nullif(btrim(pr.nome_reduzido), ''), ti.nome, cu.nome
    ) x;

  return jsonb_build_object('rows', v_rows);
end;
$$;

grant execute on function public.comercial_margens_itens(uuid, integer, text[], text[], text[]) to authenticated;

commit;
