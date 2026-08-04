begin;

-- Permite combinar perfis de acesso numa mesma pessoa (ex: Comercial + RPS
-- Gestão). access_role continua sendo o perfil "primário" (mantém compat
-- com todo código/RLS/RPC que já lia essa coluna — sempre o de MAIOR
-- prioridade dentre os selecionados, ver PROFILE_ROLE_PRIORITY em
-- usersModule.js e ROLE_PRIORITY no invite-user); additional_access_roles
-- guarda os demais perfis marcados, como texto livre (não precisa estar
-- amarrado ao enum access_profile_role — mesmo padrão de extra_managements/
-- extra_report_ids etc., que também são text[] soltos).
alter table public.user_profiles
  add column if not exists additional_access_roles text[] not null default '{}';

commit;
