begin;

-- Cache diário de cotações de commodities físicas (soja, milho, boi gordo)
-- pra alimentar o ticker do dashboard. Substitui o scraping por iframe da
-- CEPEA (bloqueado desde 2026-08 por proteção Cloudflare no widget deles —
-- ver comentário em src/modules/dashboard/marketTicker.js). Um worker
-- (Edge Function market-commodities-worker) roda 1x/dia via pg_cron e
-- grava aqui; o client só lê, nunca escreve.
--
-- Não é dado organizacional (é referência de mercado, igual dólar/SELIC/
-- IBOV que já são hardcoded no ticker) — por isso a policy de leitura é
-- "qualquer usuário autenticado", sem escopo de organization_id.

create table if not exists public.market_commodities (
  item_id text primary key check (item_id in ('soy', 'corn', 'cattle')),
  label text not null,
  value numeric not null,
  pct numeric not null default 0,
  unit text not null default '',
  source text not null default 'girorural',
  quote_date date,
  updated_at timestamptz not null default now()
);

comment on table public.market_commodities is
  'Cache diário de cotações físicas (soja/milho/boi gordo) pro ticker do dashboard. Escrita só via service_role (Edge Function agendada); leitura pública — mesmo dado já é público no site da CEPEA, e o ticker (USD/SELIC/IBOV etc.) já busca os demais itens sem autenticação, então o módulo continua autocontido, sem precisar do token de sessão do resto do app.';

alter table public.market_commodities enable row level security;

drop policy if exists "authenticated users can read market commodities" on public.market_commodities;
drop policy if exists "anyone can read market commodities" on public.market_commodities;
create policy "anyone can read market commodities"
on public.market_commodities
for select
to anon, authenticated
using (true);

-- Sem policy de insert/update/delete: só o service_role (usado pela Edge
-- Function, que ignora RLS) grava aqui.

commit;
