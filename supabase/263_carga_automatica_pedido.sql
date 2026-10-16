begin;

-- 263: pedidos de carga automatica sob demanda ("Carregar agora" na tela Carga de Realizado - Automatizadas).
--
-- O navegador nao executa o robo; ele grava um pedido aqui. O robo (servidor), a cada execucao da tarefa
-- agendada, procura pedidos 'pendente', executa a carga do job pedido (mesmo caminho do horario programado,
-- mesmas protecoes) e devolve o resultado no proprio pedido.
--
-- Um unico pedido em aberto (pendente/executando) por organizacao e job: cliques repetidos nao empilham cargas.

create table if not exists public.carga_automatica_pedido (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job             text not null,
  status          text not null default 'pendente'
                  check (status in ('pendente', 'executando', 'concluido', 'erro')),
  requested_by    uuid default auth.uid() references auth.users(id) on delete set null,
  requested_at    timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  resultado       text
);

create unique index if not exists uq_carga_automatica_pedido_aberto
  on public.carga_automatica_pedido (organization_id, job)
  where status in ('pendente', 'executando');

create index if not exists idx_carga_automatica_pedido_job
  on public.carga_automatica_pedido (organization_id, job, requested_at desc);

alter table public.carga_automatica_pedido enable row level security;

drop policy if exists "members read carga automatica pedido" on public.carga_automatica_pedido;
create policy "members read carga automatica pedido"
  on public.carga_automatica_pedido for select using (public.is_org_member(organization_id));

-- Quem pede precisa ser editor/admin e so pode criar pedido 'pendente' em seu proprio nome.
drop policy if exists "editors request carga automatica" on public.carga_automatica_pedido;
create policy "editors request carga automatica"
  on public.carga_automatica_pedido for insert
  with check (
    public.is_org_editor(organization_id)
    and status = 'pendente'
    and requested_by = auth.uid()
  );

-- O robo (usuario editor/admin) atualiza o andamento e o resultado.
drop policy if exists "editors update carga automatica pedido" on public.carga_automatica_pedido;
create policy "editors update carga automatica pedido"
  on public.carga_automatica_pedido for update
  using (public.is_org_editor(organization_id)) with check (public.is_org_editor(organization_id));

commit;
