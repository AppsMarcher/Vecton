-- Tabela de apoio pro self-service "Esqueci minha senha" da tela de login
-- (Edge Function forgot-password): guarda o horário da última solicitação
-- por e-mail pra aplicar um cooldown simples e não virar oráculo de
-- enumeração de e-mail (ver nota em [[project_vecton_plan]] 2026-08-26,
-- "resend-password"). RLS habilitada sem nenhuma policy: só a service_role
-- (usada pela Edge Function) enxerga a tabela — anon/authenticated não têm
-- acesso via PostgREST.

create table if not exists public.password_reset_requests (
  email text primary key,
  requested_at timestamptz not null default now()
);

alter table public.password_reset_requests enable row level security;
