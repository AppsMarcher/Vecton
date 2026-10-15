begin;

-- 259: infraestrutura das cargas automaticas (robo "Protheus -> Vecton").
--
--   1. comercial_regioes_municipio : municipio -> regional (territorio) Marcher, editavel na tela
--      Parametros > Comercial > Municipios. Substitui a aba "Regioes" do Painel_Vecton.xlsm
--      (dados iniciais em 260_seed_comercial_regioes_municipio.sql).
--   2. carga_automatica_config     : uma linha por carga automatica (ligada/desligada, janela
--      de meses, horarios, parametros). O robo le daqui a cada execucao.
--   3. carga_automatica_log        : historico de execucoes (resultado, linhas, hash, erro).
--   4. notify_batch_applied        : lotes com notes iniciando em '[auto]' nao geram aviso/e-mail.
--
-- O robo entra como usuario de servico com papel 'editor' em organization_users.

-- 1. Municipio -> regional ---------------------------------------------------------------------
-- Por organizacao, com id, para a tela de manutencao (Parametros > Comercial > Municipios).
-- territorio_id aponta para comercial_territorios (on delete restrict: nao da para excluir um
-- territorio que ainda tem municipios; renomear o territorio reflete aqui automaticamente).
create table if not exists public.comercial_regioes_municipio (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  codigo_ibge     text not null,
  municipio       text not null,
  uf              text not null,
  territorio_id   uuid not null references public.comercial_territorios(id) on delete restrict,
  coord           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, codigo_ibge)
);

create index if not exists idx_comercial_regioes_municipio_busca
  on public.comercial_regioes_municipio (organization_id, uf, municipio);
create index if not exists idx_comercial_regioes_municipio_territorio
  on public.comercial_regioes_municipio (territorio_id);

alter table public.comercial_regioes_municipio enable row level security;
drop policy if exists "members read comercial regioes municipio" on public.comercial_regioes_municipio;
create policy "members read comercial regioes municipio"
  on public.comercial_regioes_municipio for select using (public.is_org_member(organization_id));
drop policy if exists "editors manage comercial regioes municipio" on public.comercial_regioes_municipio;
create policy "editors manage comercial regioes municipio"
  on public.comercial_regioes_municipio for all
  using (public.is_org_editor(organization_id)) with check (public.is_org_editor(organization_id));

drop trigger if exists trg_comercial_regioes_municipio_updated_at on public.comercial_regioes_municipio;
create trigger trg_comercial_regioes_municipio_updated_at
before update on public.comercial_regioes_municipio
for each row execute function public.set_updated_at();

-- 2. Configuracao ------------------------------------------------------------------------------
create table if not exists public.carga_automatica_config (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job             text not null,
  descricao       text,
  enabled         boolean not null default false,
  meses_atras     integer not null default 0 check (meses_atras between 0 and 24),
  meses_frente    integer not null default 0 check (meses_frente between 0 and 24),
  horarios        text[] not null default array['08:00','14:00'],
  params          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, job)
);

-- 3. Log ---------------------------------------------------------------------------------------
create table if not exists public.carga_automatica_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job             text not null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null check (status in ('ok', 'sem_mudanca', 'erro', 'simulacao', 'bloqueada')),
  reference_year  integer,
  reference_month integer,
  total_rows      integer,
  rows_fat        integer,
  rows_cart       integer,
  data_hash       text,
  batch_id        uuid,
  mensagem        text,
  detalhes        jsonb not null default '{}'::jsonb
);

create index if not exists idx_carga_automatica_log_job
  on public.carga_automatica_log (organization_id, job, started_at desc);

alter table public.carga_automatica_config enable row level security;
alter table public.carga_automatica_log    enable row level security;

drop policy if exists "members read carga automatica config" on public.carga_automatica_config;
create policy "members read carga automatica config"
  on public.carga_automatica_config for select using (public.is_org_member(organization_id));
drop policy if exists "editors manage carga automatica config" on public.carga_automatica_config;
create policy "editors manage carga automatica config"
  on public.carga_automatica_config for all
  using (public.is_org_editor(organization_id)) with check (public.is_org_editor(organization_id));

drop policy if exists "members read carga automatica log" on public.carga_automatica_log;
create policy "members read carga automatica log"
  on public.carga_automatica_log for select using (public.is_org_member(organization_id));
drop policy if exists "editors manage carga automatica log" on public.carga_automatica_log;
create policy "editors manage carga automatica log"
  on public.carga_automatica_log for all
  using (public.is_org_editor(organization_id)) with check (public.is_org_editor(organization_id));

drop trigger if exists trg_carga_automatica_config_updated_at on public.carga_automatica_config;
create trigger trg_carga_automatica_config_updated_at
before update on public.carga_automatica_config
for each row execute function public.set_updated_at();

-- Carga de vendas: nasce DESLIGADA (enabled = false). Ligue depois da primeira simulacao.
insert into public.carga_automatica_config (organization_id, job, descricao, enabled, meses_atras, meses_frente, horarios, params)
select o.id, 'vendas', 'Vendas realizadas (FAT + CART) do Protheus - mes corrente', false, 0, 0,
       array['08:00','14:00'],
       jsonb_build_object(
         'cfops_saida', jsonb_build_array('5101','5102','5119','5403','5501','5922','5933','6101','6102','6107','6109','6113','6404','6501','6922','7101','7102'),
         'cfops_devol', jsonb_build_array('1201','1202','2201','2202','2203','3201','3202'),
         'queda_max_pct', 30,
         'diretorio_saida', 'O:\Controladoria\Gerencial\Vecton\02 - CARGA PAINEL DE VENDAS\3 - CARGAS ENVIADAS'
       )
from public.organizations o
where o.name = 'Marcher Brasil'
on conflict (organization_id, job) do nothing;

-- 4. Sem aviso/e-mail para lotes automaticos ----------------------------------------------------
-- Patch por string-replace na funcao viva (mesmo padrao das migrations 250/254). Idempotente.
do $do$
declare
  v_def    text;
  v_anchor constant text := E'  v_rows     := coalesce((v_row ->> ''valid_rows'')::int, (v_row ->> ''total_rows'')::int, 0);';
  v_patch  constant text := E'  if coalesce(v_row ->> ''notes'', '''') like ''[auto]%'' then return new; end if;\n';
begin
  select pg_get_functiondef('public.notify_batch_applied()'::regprocedure) into v_def;
  if position('[auto]%' in v_def) > 0 then
    raise notice '259: notify_batch_applied ja ignora lotes [auto]';
  elsif position(v_anchor in v_def) = 0 then
    raise exception '259: ancora nao encontrada em notify_batch_applied; ajustar o patch';
  else
    execute replace(v_def, v_anchor, v_patch || v_anchor);
  end if;
end;
$do$;

commit;
