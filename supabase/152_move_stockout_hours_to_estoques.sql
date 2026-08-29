begin;

-- ============================================================================
-- Fix (usuário, 2026-08-29): "Paradas por Falta de Material" (stockout_hours)
-- muda de dono — era primary de Supply Chain (raiz), passa a ser primary de
-- Estoques (onde o usuário confirmou que é lançado/editado de verdade).
-- Continua linkado em Compras também (Paradas por falta de material afeta
-- Compras — decisão de UI, não de dono).
--
-- Reordena Estoques pra bater com a lista do usuário: Obsoletos,
-- Paradas por Falta de Material, Cumprimento de Estoque de Segurança,
-- Acurácia Cíclico (Valor), Acurácia Cíclico (Itens); Acurácia Geral (não
-- citada) empurrada pro final.
-- ============================================================================

-- Muda o dono (primary_a3_id) — RLS/Gestor por Gestão passam a tratar este
-- KPI como pertencente à Gestão de Estoques, não mais Supply Chain.
update public.strategic_kpis k
set primary_a3_id = a3.id
from public.strategic_a3 a3
where a3.code = 'estoques' and k.code = 'stockout_hours';

-- Vínculo antigo (primary em supply_chain) vira linked em Estoques.
update public.strategic_a3_kpis ak
set relationship_type = 'primary'
from public.strategic_a3 a3, public.strategic_kpis k
where ak.a3_id = a3.id and ak.kpi_id = k.id
  and a3.code = 'estoques' and k.code = 'stockout_hours';

-- O vínculo antigo em Supply Chain (raiz) deixa de existir — não aparece
-- mais lá, nem como linked (o usuário só quer CPV + Giro de Estoque no
-- Consolidado de Supply Chain).
delete from public.strategic_a3_kpis ak
using public.strategic_a3 a3, public.strategic_kpis k
where ak.a3_id = a3.id and ak.kpi_id = k.id
  and a3.code = 'supply_chain' and k.code = 'stockout_hours';

-- Linka em Compras também (apareceu nos dois prints do usuário — Estoques
-- é o dono, Compras só enxerga por referência). display_order fica pra
-- quando o lote de Compras for fechado (achado em aberto, ver conversa).
insert into public.strategic_a3_kpis (a3_id, kpi_id, relationship_type)
select a3.id, k.id, 'linked'
from public.strategic_a3 a3, public.strategic_kpis k
where a3.code = 'compras' and k.code = 'stockout_hours'
  and not exists (
    select 1 from public.strategic_a3_kpis link where link.a3_id = a3.id and link.kpi_id = k.id
  );

-- display_order da nova posição em Estoques (2, entre Obsoletos e
-- Cumprimento de Estoque de Segurança) + reordena o resto conforme a lista
-- do usuário.
update public.strategic_kpis set display_order = 1 where code = 'obsolete_stock';
update public.strategic_kpis set display_order = 2 where code = 'stockout_hours';
update public.strategic_kpis set display_order = 3 where code = 'safety_stock_compliance_pct';
update public.strategic_kpis set display_order = 4 where code = 'cyclic_inventory_accuracy_value_pct';
update public.strategic_kpis set display_order = 5 where code = 'cyclic_inventory_accuracy_items_pct';
update public.strategic_kpis set display_order = 6 where code = 'general_inventory_accuracy_pct';

update public.strategic_a3_kpis ak
set display_order = k.display_order
from public.strategic_kpis k
where ak.kpi_id = k.id and ak.relationship_type = 'primary'
  and k.code in ('obsolete_stock', 'stockout_hours', 'safety_stock_compliance_pct',
                 'cyclic_inventory_accuracy_value_pct', 'cyclic_inventory_accuracy_items_pct',
                 'general_inventory_accuracy_pct');

commit;
