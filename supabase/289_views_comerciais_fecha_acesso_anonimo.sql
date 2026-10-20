begin;

-- Fecha o acesso anônimo às views comerciais.
--
-- Achado (20/10/2026): comercial_faturado, comercial_fat_cart, comercial_planejado e
-- comercial_campanhas_sem_atribuicao_valida pertencem ao dono do banco (postgres) e rodavam com os
-- privilégios dele, ignorando o RLS das tabelas de origem; não filtram por usuário; e tinham SELECT (e, nas views
-- simples, INSERT/UPDATE/DELETE) concedido ao papel anônimo. Com a chave pública do site, qualquer pessoa sem login
-- conseguia ler os dados comerciais pela API.
--
-- Correção:
--   1) security_invoker = true: a view passa a respeitar o RLS de quem consulta. As tabelas de origem liberam leitura
--      a membros da organização (is_org_member), então usuários logados continuam vendo o mesmo; o anônimo não vê nada.
--   2) Remove todo acesso do anon às views e a escrita do authenticated (as views são só de leitura no app;
--      a única leitura é o relatório de Garantia, que usa comercial_faturado como usuário logado).
-- service_role (robôs e edge functions) não é afetado: ele ignora o RLS. Idempotente.

alter view public.comercial_campanhas_sem_atribuicao_valida set (security_invoker = true);
alter view public.comercial_fat_cart set (security_invoker = true);
alter view public.comercial_faturado set (security_invoker = true);
alter view public.comercial_planejado set (security_invoker = true);

revoke all on public.comercial_campanhas_sem_atribuicao_valida from anon;
revoke all on public.comercial_fat_cart from anon;
revoke all on public.comercial_faturado from anon;
revoke all on public.comercial_planejado from anon;

revoke insert, update, delete, truncate, references, trigger on public.comercial_campanhas_sem_atribuicao_valida from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.comercial_fat_cart from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.comercial_faturado from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.comercial_planejado from authenticated;

commit;
