begin;

-- Ativacoes de garantia (fonte: exportacao do AltForce, planilha "Ativacoes de
-- garantia.xlsx", aba AltForce). Alimenta o relatorio "Ativacoes de Garantia"
-- (heatmap cidade/UF/revenda, preco medio por modelo x UF, ranking de
-- vendedores de revenda, estoque estimado de revenda cruzando com
-- comercial_realizado_ledger_entries).
--
-- Diferente do pipeline comercial_realizado_* (migration 038): aqui nao ha
-- competencia mes/ano nem grade de edicao linha a linha — e uma carga
-- recorrente e aditiva (reexportacao do AltForce), upsert simples por
-- (organization_id, numero), sem lotes/auditoria em 3 niveis.
--
-- produto_id/cliente_id sao resolvidos na carga (client-side) por matching de
-- texto normalizado contra comercial_produtos.nome_reduzido / comercial_clientes.descricao
-- — ficam null quando nao ha correspondencia (o relatorio lista essas linhas
-- a parte, para revisao).

create table if not exists public.garantia_ativacoes (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  numero              text not null,
  numero_serie        text,
  status              text,
  quem_cadastrou      text,
  cadastrado_em       timestamptz,
  produto_raw         text,
  modelo_normalizado  text,
  produto_id          uuid references public.comercial_produtos(id) on delete set null,
  cliente_final       text,
  revenda_raw         text,
  cliente_id          uuid references public.comercial_clientes(id) on delete set null,
  vendedor_revenda    text,
  data_localizacao    date,
  pais                text,
  uf                  text check (uf is null or uf in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  )),
  cidade              text,
  endereco            text,
  nf_numero           text,
  nf_serie            text,
  nf_valor_unitario   numeric(18, 2),
  nf_valor_total      numeric(18, 2),
  nf_emissao          date,
  em_servico_desde    date,
  data_compra         date,
  data_emissao_nf     date,
  raw_payload         jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, numero)
);

create index if not exists idx_garantia_ativacoes_org_uf
  on public.garantia_ativacoes (organization_id, uf);

create index if not exists idx_garantia_ativacoes_cliente
  on public.garantia_ativacoes (organization_id, cliente_id);

create index if not exists idx_garantia_ativacoes_produto
  on public.garantia_ativacoes (organization_id, produto_id);

create index if not exists idx_garantia_ativacoes_cadastrado_em
  on public.garantia_ativacoes (organization_id, cadastrado_em);

drop trigger if exists trg_garantia_ativacoes_updated_at on public.garantia_ativacoes;
create trigger trg_garantia_ativacoes_updated_at
before update on public.garantia_ativacoes
for each row
execute function public.set_updated_at();

alter table public.garantia_ativacoes enable row level security;

drop policy if exists "members can read garantia ativacoes" on public.garantia_ativacoes;
create policy "members can read garantia ativacoes"
on public.garantia_ativacoes
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage garantia ativacoes" on public.garantia_ativacoes;
create policy "editors can manage garantia ativacoes"
on public.garantia_ativacoes
for all
using (public.is_org_editor(garantia_ativacoes.organization_id))
with check (public.is_org_editor(garantia_ativacoes.organization_id));

commit;
