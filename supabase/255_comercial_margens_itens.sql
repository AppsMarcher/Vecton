begin;

-- Relatorio "Margens por Maquinas" (Comercial).
--
-- Devolve, para o ano pedido e o ano anterior, o realizado FATURADO (origem FAT)
-- agregado por produto e mes: quantidade, FAT (valor), RL e MP. Os valores sao
-- liquidos de devolucao porque as devolucoes entram no ledger com sinal negativo.
--
-- Definicoes (confirmadas com a Controladoria):
--   MP  = custo de materia-prima (coluna MP da carga);
--   MB% = (RL - MP) / RL.
-- A MB% NAO e lida de mb_pct (a carga 2023-2026 gravou MP/RL nessa coluna): o
-- relatorio recalcula a partir de rl e mp.
--
-- CART (carteira) fica de fora: nao tem RL/MP e nao e faturamento realizado.
--
-- Retorno jsonb {"rows":[[ano, mes, cod_produto, descricao, nome_reduzido, tipo,
-- cultura, quantidade, fat, rl, mp], ...]}: um unico valor jsonb contorna o limite
-- de linhas do PostgREST e o cliente monta todas as visoes (KPIs, mapa, ponte e
-- tabela) sem novas idas ao banco.
--
-- Acesso: margem e dado sensivel; so admin, super_admin e gestor (manager).

create or replace function public.comercial_margens_itens(
  p_org  uuid,
  p_year integer
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
        left join public.comercial_culturas cu on cu.id = pr.cultura_id
       where le.organization_id = p_org
         and le.origem = 'FAT'
         and le.reference_year in (p_year - 1, p_year)
       group by le.reference_year, le.reference_month, le.cod_produto,
                pr.descricao, nullif(btrim(pr.nome_reduzido), ''), ti.nome, cu.nome
    ) x;

  return jsonb_build_object('rows', v_rows);
end;
$$;

grant execute on function public.comercial_margens_itens(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Card no catalogo de Relatorios, secao "Comercial", logo apos "Meta de Final
-- de Ano". A ancora e o relatorio comercial de nome "Meta de Final de Ano"
-- (comercialRelatorio_<id>) ou, na falta dele, o card fixo comercialFinalDeAno.
-- Os itens seguintes da secao sobem uma posicao. Idempotente.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_anchor integer;
begin
  for r in
    select s.id as section_id, s.organization_id
      from public.report_sections s
     where lower(s.name) = 'comercial'
  loop
    if exists (
      select 1 from public.report_section_items
       where organization_id = r.organization_id and report_id = 'comercialMargens'
    ) then
      continue;
    end if;

    select i.sort_order into v_anchor
      from public.report_section_items i
     where i.organization_id = r.organization_id
       and i.section_id = r.section_id
       and (
         i.report_id in (
           select 'comercialRelatorio_' || d.id::text
             from public.comercial_report_definitions d
            where d.organization_id = r.organization_id
              and lower(btrim(d.nome)) like 'meta de final de ano%'
         )
         or i.report_id = 'comercialFinalDeAno'
       )
     order by (i.report_id = 'comercialFinalDeAno') asc, i.sort_order desc
     limit 1;

    if v_anchor is null then
      select coalesce(max(sort_order), -1) into v_anchor
        from public.report_section_items
       where organization_id = r.organization_id and section_id = r.section_id;
    end if;

    update public.report_section_items
       set sort_order = sort_order + 1
     where organization_id = r.organization_id
       and section_id = r.section_id
       and sort_order > v_anchor;

    insert into public.report_section_items (organization_id, section_id, report_id, sort_order)
    values (r.organization_id, r.section_id, 'comercialMargens', v_anchor + 1)
    on conflict (organization_id, report_id) do nothing;
  end loop;
end $$;

commit;
