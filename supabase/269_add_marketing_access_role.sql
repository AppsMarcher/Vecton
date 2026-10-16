-- Novo perfil "Marketing": acesso direto à tela Relatórios, somente aos
-- relatórios Ativações de Garantia e Marcher no Campo (allowlist fixa no
-- front, ver roleCanSeeReport() em app.js). Sem Dashboard, Planejamento,
-- Parâmetros, cargas ou demais relatórios. Admin e Super Admin continuam
-- vendo os dois; o perfil Gestor deixa de ver.
--
-- ALTER TYPE ... ADD VALUE não pode ser usado na mesma transação em que o
-- valor novo é referenciado, então roda sozinho, sem BEGIN/COMMIT (mesmo
-- padrão das migrations 054, 107 e 127).
alter type public.access_profile_role add value if not exists 'marketing';
