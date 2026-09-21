begin;

-- Plano independente da DRE: a descrição no arquivo identifica a conta dentro
-- do grupo. UUIDs são internos; nenhum código passa a ser exigido no Excel.
create table public.fc_plan_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid,
  name text not null check (length(btrim(name)) between 1 and 200),
  node_class text not null check (node_class in ('Analitica', 'Sintetica')),
  source_name text,
  source_row integer,
  seed_key text,
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  note text not null default '' check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, seed_key),
  foreign key (organization_id, parent_id) references public.fc_plan_nodes(organization_id, id),
  check (parent_id is distinct from id),
  check ((node_class = 'Sintetica' and source_name is null) or
    (node_class = 'Analitica' and parent_id is not null and source_name is not null and length(btrim(source_name)) between 1 and 200))
);
create index fc_plan_parent_idx on public.fc_plan_nodes(organization_id, parent_id, sort_order);
create unique index fc_plan_source_idx on public.fc_plan_nodes
  (organization_id, parent_id, lower(regexp_replace(btrim(source_name), '\s+', ' ', 'g')))
  where node_class = 'Analitica';

create function public.can_manage_fc_plan(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_org_member(target_organization_id) and exists (
    select 1 from public.user_profiles p
    where p.organization_id = target_organization_id and p.user_id = auth.uid()
      and p.is_active
      and (p.access_role in ('admin', 'super_admin')
        or p.additional_access_roles && array['admin', 'super_admin']::text[])
  );
$$;
revoke all on function public.can_manage_fc_plan(uuid) from public;
grant execute on function public.can_manage_fc_plan(uuid) to authenticated;

alter table public.fc_plan_nodes enable row level security;
grant select, insert, update, delete on public.fc_plan_nodes to authenticated;
create policy "members read FC plan" on public.fc_plan_nodes for select to authenticated
  using (public.is_org_member(organization_id));
create policy "admins insert FC plan" on public.fc_plan_nodes for insert to authenticated
  with check (public.can_manage_fc_plan(organization_id));
create policy "admins update FC plan" on public.fc_plan_nodes for update to authenticated
  using (public.can_manage_fc_plan(organization_id)) with check (public.can_manage_fc_plan(organization_id));
create policy "admins delete FC plan" on public.fc_plan_nodes for delete to authenticated
  using (public.can_manage_fc_plan(organization_id));

create function public.validate_fc_plan_node()
returns trigger language plpgsql security definer set search_path = public
as $$
declare parent_node public.fc_plan_nodes;
begin
  -- Serializa alterações de hierarquia na mesma empresa.
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 219));
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.id <> old.id then
      raise exception 'A empresa e a identificação da conta não podem ser alteradas.';
    end if;
  end if;
  new.name := btrim(new.name);
  new.source_name := nullif(btrim(new.source_name), '');
  new.updated_at := now();
  if new.node_class = 'Analitica' and exists (
    select 1 from public.fc_plan_nodes where organization_id = new.organization_id and parent_id = new.id
  ) then raise exception 'Uma conta com filhas deve permanecer sintética.'; end if;
  if not new.active and exists (
    select 1 from public.fc_plan_nodes where organization_id = new.organization_id and parent_id = new.id and active
  ) then raise exception 'Inative as contas filhas antes da conta pai.'; end if;
  if new.parent_id is not null then
    select * into parent_node from public.fc_plan_nodes where organization_id = new.organization_id and id = new.parent_id;
    if not found or parent_node.node_class <> 'Sintetica' then
      raise exception 'A conta pai deve ser uma conta sintética da mesma empresa.';
    end if;
    if new.active and not parent_node.active then raise exception 'A conta pai deve estar ativa.'; end if;
    if exists (
      with recursive ancestors as (
        select id, parent_id from public.fc_plan_nodes where organization_id = new.organization_id and id = new.parent_id
        union
        select n.id, n.parent_id from public.fc_plan_nodes n join ancestors a on n.id = a.parent_id
          where n.organization_id = new.organization_id
      ) select 1 from ancestors where id = new.id
    ) then raise exception 'Este vínculo criaria um ciclo na hierarquia.'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_fc_plan_node() from public;
create trigger validate_fc_plan_node before insert or update on public.fc_plan_nodes
  for each row execute function public.validate_fc_plan_node();

-- Origem: FC.xlsx / FC 2026, linhas 10..93. Inclui contas zeradas.
-- Linhas 30,48,56 são subtotais; a linha 54 tem valores em anos anteriores.
-- Saldos, geração líquida e máquinas vendidas são resultados/indicadores,
-- não contas analíticas. Nenhum valor financeiro é copiado para este cadastro.
create function public.seed_fc_plan(target_org uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare item jsonb; parent_uuid uuid;
begin
  for item in select value from jsonb_array_elements($seed$[
  {"seed_key": "operacional", "parent_key": null, "name": "Fluxo de Caixa Operacional", "source_name": null, "node_class": "Sintetica", "sort_order": 10, "source_row": 10},
  {"seed_key": "entradas", "parent_key": "operacional", "name": "Entradas Operacionais", "source_name": null, "node_class": "Sintetica", "sort_order": 10, "source_row": 10},
  {"seed_key": "saidas", "parent_key": "operacional", "name": "Saídas Operacionais", "source_name": null, "node_class": "Sintetica", "sort_order": 18, "source_row": 18},
  {"seed_key": "linha-11", "parent_key": "entradas", "name": "Projeções de Vendas", "source_name": "Projeções de Vendas", "node_class": "Analitica", "sort_order": 11, "source_row": 11},
  {"seed_key": "linha-12", "parent_key": "entradas", "name": "Vendas Mercado Local", "source_name": "Vendas Mercado Local", "node_class": "Analitica", "sort_order": 12, "source_row": 12},
  {"seed_key": "linha-13", "parent_key": "entradas", "name": "Vendas Exportação", "source_name": "Vendas Exportação", "node_class": "Analitica", "sort_order": 13, "source_row": 13},
  {"seed_key": "linha-14", "parent_key": "entradas", "name": "Adiantamento de Clientes", "source_name": "Adiantamento de Clientes", "node_class": "Analitica", "sort_order": 14, "source_row": 14},
  {"seed_key": "linha-15", "parent_key": "entradas", "name": "Vendas de Peças e Acessórios", "source_name": "Vendas de Peças e Acessórios", "node_class": "Analitica", "sort_order": 15, "source_row": 15},
  {"seed_key": "linha-16", "parent_key": "entradas", "name": "Outras Entradas", "source_name": "Outras Entradas", "node_class": "Analitica", "sort_order": 16, "source_row": 16},
  {"seed_key": "linha-17", "parent_key": "entradas", "name": "Devoluções a Clientes", "source_name": "Devoluções a Clientes", "node_class": "Analitica", "sort_order": 17, "source_row": 17},
  {"seed_key": "linha-19", "parent_key": "saidas", "name": "MP", "source_name": "MP", "node_class": "Analitica", "sort_order": 19, "source_row": 19},
  {"seed_key": "linha-20", "parent_key": "saidas", "name": "ADIANTAMENTOS", "source_name": "ADIANTAMENTOS", "node_class": "Analitica", "sort_order": 20, "source_row": 20},
  {"seed_key": "linha-21", "parent_key": "saidas", "name": "FRETES S/ COMPRAS", "source_name": "FRETES S/ COMPRAS", "node_class": "Analitica", "sort_order": 21, "source_row": 21},
  {"seed_key": "linha-22", "parent_key": "saidas", "name": "MATERIAL DE CONSUMO", "source_name": "MATERIAL DE CONSUMO", "node_class": "Analitica", "sort_order": 22, "source_row": 22},
  {"seed_key": "linha-23", "parent_key": "saidas", "name": "ENERGIA - PRODUCAO", "source_name": "ENERGIA - PRODUCAO", "node_class": "Analitica", "sort_order": 23, "source_row": 23},
  {"seed_key": "linha-24", "parent_key": "saidas", "name": "MANUTENCAO - PRODUCAO", "source_name": "MANUTENCAO - PRODUCAO", "node_class": "Analitica", "sort_order": 24, "source_row": 24},
  {"seed_key": "linha-25", "parent_key": "saidas", "name": "ALUGUEIS EQUIPAMENTOS - PRODUCAO", "source_name": "ALUGUEIS EQUIPAMENTOS - PRODUCAO", "node_class": "Analitica", "sort_order": 25, "source_row": 25},
  {"seed_key": "linha-26", "parent_key": "saidas", "name": "RH", "source_name": "RH", "node_class": "Analitica", "sort_order": 26, "source_row": 26},
  {"seed_key": "linha-27", "parent_key": "saidas", "name": "Suspensão FGTS / Transf Créd ICMS - Calamidade", "source_name": "Suspensão FGTS / Transf Créd ICMS - Calamidade", "node_class": "Analitica", "sort_order": 27, "source_row": 27},
  {"seed_key": "linha-28", "parent_key": "saidas", "name": "Ver compensações de INSS e IRRF", "source_name": "Ver compensações de INSS e IRRF", "node_class": "Analitica", "sort_order": 28, "source_row": 28},
  {"seed_key": "linha-29", "parent_key": "saidas", "name": "MATERIAL DE SEGURANCA - PRODUCAO", "source_name": "MATERIAL DE SEGURANCA - PRODUCAO", "node_class": "Analitica", "sort_order": 29, "source_row": 29},
  {"seed_key": "linha-30", "parent_key": "saidas", "name": "COMISSOES", "source_name": null, "node_class": "Sintetica", "sort_order": 30, "source_row": 30},
  {"seed_key": "linha-31", "parent_key": "linha-30", "name": "COMISSAO REVENDA", "source_name": "COMISSAO REVENDA", "node_class": "Analitica", "sort_order": 31, "source_row": 31},
  {"seed_key": "linha-32", "parent_key": "linha-30", "name": "COMISSAO REPRESENTANTE", "source_name": "COMISSAO REPRESENTANTE", "node_class": "Analitica", "sort_order": 32, "source_row": 32},
  {"seed_key": "linha-33", "parent_key": "linha-30", "name": "COMISSOES DLL", "source_name": "COMISSOES DLL", "node_class": "Analitica", "sort_order": 33, "source_row": 33},
  {"seed_key": "linha-34", "parent_key": "saidas", "name": "PREMIACOES RCS", "source_name": "PREMIACOES RCS", "node_class": "Analitica", "sort_order": 34, "source_row": 34},
  {"seed_key": "linha-35", "parent_key": "saidas", "name": "ROYALTIES - ANO ANTERIOR", "source_name": "ROYALTIES - ANO ANTERIOR", "node_class": "Analitica", "sort_order": 35, "source_row": 35},
  {"seed_key": "linha-36", "parent_key": "saidas", "name": "ROYALTIES PAGOS", "source_name": "ROYALTIES PAGOS", "node_class": "Analitica", "sort_order": 36, "source_row": 36},
  {"seed_key": "linha-37", "parent_key": "saidas", "name": "FEIRAS E EVENTOS", "source_name": "FEIRAS E EVENTOS", "node_class": "Analitica", "sort_order": 37, "source_row": 37},
  {"seed_key": "linha-38", "parent_key": "saidas", "name": "VIAGENS E ESTADIAS", "source_name": "VIAGENS E ESTADIAS", "node_class": "Analitica", "sort_order": 38, "source_row": 38},
  {"seed_key": "linha-39", "parent_key": "saidas", "name": "FRETES", "source_name": "FRETES", "node_class": "Analitica", "sort_order": 39, "source_row": 39},
  {"seed_key": "linha-40", "parent_key": "saidas", "name": "REMESSAS-RETORNOS", "source_name": "REMESSAS-RETORNOS", "node_class": "Analitica", "sort_order": 40, "source_row": 40},
  {"seed_key": "linha-41", "parent_key": "saidas", "name": "DEMONSTRACOES", "source_name": "DEMONSTRACOES", "node_class": "Analitica", "sort_order": 41, "source_row": 41},
  {"seed_key": "linha-42", "parent_key": "saidas", "name": "ASSISTENCIA TECNICA", "source_name": "ASSISTENCIA TECNICA", "node_class": "Analitica", "sort_order": 42, "source_row": 42},
  {"seed_key": "linha-43", "parent_key": "saidas", "name": "CUSTO GARANTIAS", "source_name": "CUSTO GARANTIAS", "node_class": "Analitica", "sort_order": 43, "source_row": 43},
  {"seed_key": "linha-44", "parent_key": "saidas", "name": "SERVICOS DE EXPORTACAO", "source_name": "SERVICOS DE EXPORTACAO", "node_class": "Analitica", "sort_order": 44, "source_row": 44},
  {"seed_key": "linha-45", "parent_key": "saidas", "name": "MARKETING", "source_name": "MARKETING", "node_class": "Analitica", "sort_order": 45, "source_row": 45},
  {"seed_key": "linha-46", "parent_key": "saidas", "name": "UTILIDADES", "source_name": "UTILIDADES", "node_class": "Analitica", "sort_order": 46, "source_row": 46},
  {"seed_key": "linha-47", "parent_key": "saidas", "name": "OUTRAS - ADM", "source_name": "OUTRAS - ADM", "node_class": "Analitica", "sort_order": 47, "source_row": 47},
  {"seed_key": "linha-48", "parent_key": "saidas", "name": "SERVIÇOS DE TERCEIROS", "source_name": null, "node_class": "Sintetica", "sort_order": 48, "source_row": 48},
  {"seed_key": "linha-49", "parent_key": "linha-48", "name": "SERVICOS DE TERCEIROS ADM", "source_name": "SERVICOS DE TERCEIROS ADM", "node_class": "Analitica", "sort_order": 49, "source_row": 49},
  {"seed_key": "linha-50", "parent_key": "linha-48", "name": "SERVICOS DE TERCEIROS RH", "source_name": "SERVICOS DE TERCEIROS RH", "node_class": "Analitica", "sort_order": 50, "source_row": 50},
  {"seed_key": "linha-51", "parent_key": "linha-48", "name": "SERVICOS DE TERCEIROS COMERCIAL", "source_name": "SERVICOS DE TERCEIROS COMERCIAL", "node_class": "Analitica", "sort_order": 51, "source_row": 51},
  {"seed_key": "linha-52", "parent_key": "linha-48", "name": "SERVICOS DE TERCEIROS PRODUCAO", "source_name": "SERVICOS DE TERCEIROS PRODUCAO", "node_class": "Analitica", "sort_order": 52, "source_row": 52},
  {"seed_key": "linha-53", "parent_key": "linha-48", "name": "SERVICOS COM SEGURANCA DO TRABALHO", "source_name": "SERVICOS COM SEGURANCA DO TRABALHO", "node_class": "Analitica", "sort_order": 53, "source_row": 53},
  {"seed_key": "linha-54", "parent_key": "linha-48", "name": "SERVIÇOS DE TERCEIROS", "source_name": "SERVIÇOS DE TERCEIROS", "node_class": "Analitica", "sort_order": 54, "source_row": 54},
  {"seed_key": "linha-55", "parent_key": "saidas", "name": "DESPESAS COM TI", "source_name": "DESPESAS COM TI", "node_class": "Analitica", "sort_order": 55, "source_row": 55},
  {"seed_key": "linha-56", "parent_key": "saidas", "name": "IMPOSTOS / TAXAS", "source_name": null, "node_class": "Sintetica", "sort_order": 56, "source_row": 56},
  {"seed_key": "linha-57", "parent_key": "linha-56", "name": "ASSOCIACOES E MENSALIDADES", "source_name": "ASSOCIACOES E MENSALIDADES", "node_class": "Analitica", "sort_order": 57, "source_row": 57},
  {"seed_key": "linha-58", "parent_key": "linha-56", "name": "COFINS A PAGAR", "source_name": "COFINS A PAGAR", "node_class": "Analitica", "sort_order": 58, "source_row": 58},
  {"seed_key": "linha-59", "parent_key": "linha-56", "name": "DCTF", "source_name": "DCTF", "node_class": "Analitica", "sort_order": 59, "source_row": 59},
  {"seed_key": "linha-60", "parent_key": "linha-56", "name": "ICMS SUBSTITUICAO TRIBUTARIA", "source_name": "ICMS SUBSTITUICAO TRIBUTARIA", "node_class": "Analitica", "sort_order": 60, "source_row": 60},
  {"seed_key": "linha-61", "parent_key": "linha-56", "name": "ICMS A PAGAR", "source_name": "ICMS A PAGAR", "node_class": "Analitica", "sort_order": 61, "source_row": 61},
  {"seed_key": "linha-62", "parent_key": "linha-56", "name": "INSS S/ SERVICOS", "source_name": "INSS S/ SERVICOS", "node_class": "Analitica", "sort_order": 62, "source_row": 62},
  {"seed_key": "linha-63", "parent_key": "linha-56", "name": "IPTU", "source_name": "IPTU", "node_class": "Analitica", "sort_order": 63, "source_row": 63},
  {"seed_key": "linha-64", "parent_key": "linha-56", "name": "IRRF S/ SERVICOS", "source_name": "IRRF S/ SERVICOS", "node_class": "Analitica", "sort_order": 64, "source_row": 64},
  {"seed_key": "linha-65", "parent_key": "linha-56", "name": "ISSQN S/ SERVICOS", "source_name": "ISSQN S/ SERVICOS", "node_class": "Analitica", "sort_order": 65, "source_row": 65},
  {"seed_key": "linha-66", "parent_key": "linha-56", "name": "TAXAS E ANUIDADES", "source_name": "TAXAS E ANUIDADES", "node_class": "Analitica", "sort_order": 66, "source_row": 66},
  {"seed_key": "linha-67", "parent_key": "saidas", "name": "RETENCAO 4,65%", "source_name": "RETENCAO 4,65%", "node_class": "Analitica", "sort_order": 67, "source_row": 67},
  {"seed_key": "linha-68", "parent_key": "saidas", "name": "SEGUROS", "source_name": "SEGUROS", "node_class": "Analitica", "sort_order": 68, "source_row": 68},
  {"seed_key": "linha-69", "parent_key": "saidas", "name": "P&D", "source_name": "P&D", "node_class": "Analitica", "sort_order": 69, "source_row": 69},
  {"seed_key": "investimentos", "parent_key": null, "name": "Fluxo de Caixa de Investimentos", "source_name": null, "node_class": "Sintetica", "sort_order": 71, "source_row": 71},
  {"seed_key": "linha-71", "parent_key": "investimentos", "name": "CAPEX - Desenvolvimento de Produtos", "source_name": "CAPEX - Desenvolvimento de Produtos", "node_class": "Analitica", "sort_order": 71, "source_row": 71},
  {"seed_key": "linha-72", "parent_key": "investimentos", "name": "CAPEX - RH", "source_name": "CAPEX - RH", "node_class": "Analitica", "sort_order": 72, "source_row": 72},
  {"seed_key": "linha-73", "parent_key": "investimentos", "name": "CAPEX - Industrial/Processos/Seg Trabalho", "source_name": "CAPEX - Industrial/Processos/Seg Trabalho", "node_class": "Analitica", "sort_order": 73, "source_row": 73},
  {"seed_key": "linha-74", "parent_key": "investimentos", "name": "CAPEX - TI/ADM/Assist Tecnica", "source_name": "CAPEX - TI/ADM/Assist Tecnica", "node_class": "Analitica", "sort_order": 74, "source_row": 74},
  {"seed_key": "linha-75", "parent_key": "investimentos", "name": "Obra - Projeto Ampliação", "source_name": "Obra - Projeto Ampliação", "node_class": "Analitica", "sort_order": 75, "source_row": 75},
  {"seed_key": "linha-76", "parent_key": "investimentos", "name": "CAPEX - Diversos", "source_name": "CAPEX - Diversos", "node_class": "Analitica", "sort_order": 76, "source_row": 76},
  {"seed_key": "financeiro", "parent_key": null, "name": "Fluxo de Caixa Financeiro", "source_name": null, "node_class": "Sintetica", "sort_order": 78, "source_row": 78},
  {"seed_key": "linha-78", "parent_key": "financeiro", "name": "IRPJ A PAGAR  MENSAL", "source_name": "IRPJ A PAGAR  MENSAL", "node_class": "Analitica", "sort_order": 78, "source_row": 78},
  {"seed_key": "linha-79", "parent_key": "financeiro", "name": "CSLL A PAGAR MENSAL", "source_name": "CSLL A PAGAR MENSAL", "node_class": "Analitica", "sort_order": 79, "source_row": 79},
  {"seed_key": "linha-80", "parent_key": "financeiro", "name": "IRRF/CSSL Pagto Ano Anterior", "source_name": "IRRF/CSSL Pagto Ano Anterior", "node_class": "Analitica", "sort_order": 80, "source_row": 80},
  {"seed_key": "linha-81", "parent_key": "financeiro", "name": "Dividendos - JCP + IR", "source_name": "Dividendos - JCP + IR", "node_class": "Analitica", "sort_order": 81, "source_row": 81},
  {"seed_key": "linha-82", "parent_key": "financeiro", "name": "Dividendos Adicionais - não tem IR", "source_name": "Dividendos Adicionais - não tem IR", "node_class": "Analitica", "sort_order": 82, "source_row": 82},
  {"seed_key": "linha-83", "parent_key": "financeiro", "name": "Aumento Líquido de Dívidas Bancárias - BRDE", "source_name": "Aumento Líquido de Dívidas Bancárias - BRDE", "node_class": "Analitica", "sort_order": 83, "source_row": 83},
  {"seed_key": "linha-84", "parent_key": "financeiro", "name": "Juros dívidas BRDE", "source_name": "Juros dívidas BRDE", "node_class": "Analitica", "sort_order": 84, "source_row": 84},
  {"seed_key": "linha-85", "parent_key": "financeiro", "name": "Aumento Líquido de Dívidas Mútuo", "source_name": "Aumento Líquido de Dívidas Mútuo", "node_class": "Analitica", "sort_order": 85, "source_row": 85},
  {"seed_key": "linha-86", "parent_key": "financeiro", "name": "Juros dívidas Mútuo", "source_name": "Juros dívidas Mútuo", "node_class": "Analitica", "sort_order": 86, "source_row": 86},
  {"seed_key": "linha-87", "parent_key": "financeiro", "name": "Juros pagos contas atrasadas", "source_name": "Juros pagos contas atrasadas", "node_class": "Analitica", "sort_order": 87, "source_row": 87},
  {"seed_key": "linha-88", "parent_key": "financeiro", "name": "Receita Financeira", "source_name": "Receita Financeira", "node_class": "Analitica", "sort_order": 88, "source_row": 88},
  {"seed_key": "linha-89", "parent_key": "financeiro", "name": "Despesa Financeira", "source_name": "Despesa Financeira", "node_class": "Analitica", "sort_order": 89, "source_row": 89},
  {"seed_key": "linha-90", "parent_key": "financeiro", "name": "Doação p/abater do IR", "source_name": "Doação p/abater do IR", "node_class": "Analitica", "sort_order": 90, "source_row": 90},
  {"seed_key": "linha-91", "parent_key": "financeiro", "name": "Participação Resultado", "source_name": "Participação Resultado", "node_class": "Analitica", "sort_order": 91, "source_row": 91},
  {"seed_key": "linha-92", "parent_key": "financeiro", "name": "Antecipação de JSCP (Despesas)", "source_name": "Antecipação de JSCP (Despesas)", "node_class": "Analitica", "sort_order": 92, "source_row": 92}
]$seed$::jsonb)
  loop
    parent_uuid := null;
    if item->>'parent_key' is not null then
      select id into strict parent_uuid from public.fc_plan_nodes
        where organization_id = target_org and seed_key = item->>'parent_key';
    end if;
    insert into public.fc_plan_nodes
      (organization_id, parent_id, name, node_class, source_name, source_row, sort_order, seed_key)
    values (target_org, parent_uuid, item->>'name', item->>'node_class', item->>'source_name',
      (item->>'source_row')::integer, (item->>'sort_order')::integer, item->>'seed_key')
    on conflict (organization_id, seed_key) do nothing;
  end loop;
end;
$$;
revoke all on function public.seed_fc_plan(uuid) from public;

select public.seed_fc_plan(id) from public.organizations;

create function public.seed_fc_plan_for_new_org()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform public.seed_fc_plan(new.id);
  return new;
end;
$$;
revoke all on function public.seed_fc_plan_for_new_org() from public;
create trigger seed_fc_plan_for_new_org after insert on public.organizations
  for each row execute function public.seed_fc_plan_for_new_org();


commit;
