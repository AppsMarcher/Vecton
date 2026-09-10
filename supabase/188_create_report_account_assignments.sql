begin;

-- Guarda a decisao (opcional) de incluir uma conta do Plano de Contas em
-- algum relatorio "padrao" cuja estrutura de linhas/grupos e fixa no
-- codigo (OPEX_STRUCTURE, HC_PESSOAL_ACCOUNTS em app.js) -- diferente do
-- DRE Societario, que ja segue a arvore de dre_plan_nodes automaticamente
-- e por isso nao precisa de atribuicao nenhuma.
--
-- section_label/group_label so fazem sentido para report='opex' (a
-- OPEX_STRUCTURE tem 2 niveis: secao -> grupo -> contas). Para
-- report='headcount' a propria linha na tabela ja e o "sim" -- HC_PESSOAL
-- e um conjunto simples, sem grupo.
create table if not exists public.report_account_assignments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  account_number   text not null,
  report           text not null check (report in ('opex', 'headcount')),
  section_label    text,
  group_label      text,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id),
  unique (organization_id, account_number, report),
  constraint report_account_assignments_opex_needs_group
    check (report <> 'opex' or group_label is not null)
);

create index if not exists idx_report_account_assignments_org_report
  on public.report_account_assignments (organization_id, report);

alter table public.report_account_assignments enable row level security;

drop policy if exists "members can read report account assignments" on public.report_account_assignments;
create policy "members can read report account assignments"
  on public.report_account_assignments for select
  using (public.is_org_member(organization_id));

drop policy if exists "editors can manage report account assignments" on public.report_account_assignments;
create policy "editors can manage report account assignments"
  on public.report_account_assignments for all
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

commit;
