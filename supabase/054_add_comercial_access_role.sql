-- Novo perfil "Comercial": acesso direto à tela Relatórios, somente aos
-- relatórios Painel de Vendas e Mapa de Vendas (allowlist fixa no front,
-- ver canSeeReport() em app.js). Sem Dashboard, Planejamento, Parâmetros
-- ou cargas. Visão consolidada (Brasil todo), sem recorte por gestão.
--
-- ALTER TYPE ... ADD VALUE não pode ser usado na mesma transação em que o
-- valor novo é referenciado, então roda sozinho, sem BEGIN/COMMIT.
alter type public.access_profile_role add value if not exists 'comercial';
