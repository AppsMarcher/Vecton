begin;

-- ============================================================================
-- RBAC granular do módulo A3 (2026-08-29) — parte 1/4: colunas + backfill.
--
-- Substitui o modelo "tudo ou nada" original (só super_admin/admin/
-- gestao_estrategica enxergam ou escrevem QUALQUER coisa no módulo, sem
-- distinção por A3 nem por leitura/gravação — migration 128) por 3 papéis:
--
--   - super_admin/admin: acesso total (inalterado).
--   - manager (Gestor): visualização TOTAL de todos os A3 (igual admin);
--     edição só da(s) A3-mãe cuja Gestão bate com `up.management`, mais
--     `extra_strategic_a3_ids` pra concessão pontual de A3 fora da própria
--     Gestão (mesmo padrão de extra_cc_ids/extra_report_ids já usado no
--     resto do Vecton).
--   - gestao_estrategica: reaproveitado como o novo perfil "A3 Estratégicos"
--     (mesmo slug — quem já tinha esse perfil não precisa de migração de
--     dado). Ganha `strategic_access_mode` ('read'|'write', vale igual pra
--     TODOS os A3 concedidos a essa pessoa — não varia por A3) e
--     `extra_strategic_a3_ids` (quais A3-mãe ela enxerga/edita; lista vazia
--     = nenhum, igual todo `extra_*` do app). Quem já tinha gestao_estrategica
--     antes desta migration é promovido pra mode='write' + todas as A3-mãe
--     da própria org (backfill abaixo), mantendo o acesso idêntico ao de
--     hoje sem precisar reconfigurar ninguém manualmente.
-- ============================================================================

alter table public.strategic_a3
  add column if not exists management text check (management in (
    'Diretoria', 'Controladoria', 'Recursos Humanos', 'Supply Chain',
    'Industrial', 'Engenharia', 'Marketing', 'Produto', 'Qualidade', 'Comercial'
  ));

comment on column public.strategic_a3.management is
  'Gestão dona da A3-MÃE (mesmo enum de cost_centers.cost_center_management). Só setada em A3 raiz (parent_id is null) — A3 filha herda via strategic_a3_management(). Null = sem Gestor-editor (só admin/A3 Estratégicos editam; caso do EBITDA, métrica consolidada).';

alter table public.user_profiles
  add column if not exists strategic_access_mode text check (strategic_access_mode in ('read', 'write')),
  add column if not exists extra_strategic_a3_ids uuid[] not null default '{}';

comment on column public.user_profiles.strategic_access_mode is
  'Modo do perfil "A3 Estratégicos" (access_role/additional_access_roles = gestao_estrategica): read ou write, vale igual pra TODOS os A3 em extra_strategic_a3_ids desta pessoa (não varia por A3). Null pra quem não tem o perfil.';
comment on column public.user_profiles.extra_strategic_a3_ids is
  'IDs de A3-MÃE (strategic_a3.id, sempre parent_id is null) concedidos a esta pessoa. Uso duplo: (1) perfil "A3 Estratégicos" — é a lista completa de A3 que a pessoa acessa; (2) Gestor (manager) — concessão EXTRA de A3 fora da própria Gestão (a Gestão em si já dá edição via strategic_a3.management = up.management, sem precisar listar aqui).';

-- Mapeamento das 9 A3-mãe -> Gestão (confirmado com o usuário em 2026-08-29,
-- inclusive o caso ambíguo "Áreas Técnicas" -> Qualidade). Nota de forward-
-- compat: isso é por ID, não por código — se um novo ciclo (ano) recriar as
-- A3-mãe com IDs novos, este mapeamento (e o backfill de gestao_estrategica
-- logo abaixo) precisa ser refeito pro ciclo novo; não há mecanismo
-- automático de herança entre ciclos hoje.
update public.strategic_a3 set management = 'Comercial'         where parent_id is null and code = 'comercial';
update public.strategic_a3 set management = 'Supply Chain'      where parent_id is null and code = 'supply_chain';
update public.strategic_a3 set management = 'Produto'           where parent_id is null and code = 'produto';
update public.strategic_a3 set management = 'Engenharia'        where parent_id is null and code = 'engenharia';
update public.strategic_a3 set management = 'Marketing'         where parent_id is null and code = 'marketing';
update public.strategic_a3 set management = 'Industrial'        where parent_id is null and code = 'fabril';
update public.strategic_a3 set management = 'Recursos Humanos'  where parent_id is null and code = 'pessoas';
update public.strategic_a3 set management = 'Qualidade'         where parent_id is null and code = 'areas_tecnicas';
-- 'ebitda' fica com management = null (default da coluna) — proposital.

-- Backfill: quem hoje tem gestao_estrategica (primário ou adicional) mantém
-- acesso idêntico ao de hoje.
update public.user_profiles up
set strategic_access_mode = 'write',
    extra_strategic_a3_ids = coalesce((
      select array_agg(a3.id)
      from public.strategic_a3 a3
      where a3.organization_id = up.organization_id and a3.parent_id is null
    ), '{}')
where up.access_role = 'gestao_estrategica'
   or 'gestao_estrategica' = any(up.additional_access_roles);

commit;
