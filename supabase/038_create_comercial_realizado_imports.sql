begin;

-- Carga de realizado de VENDAS (modulo Comercial).
-- Espelha o pipeline do DRE (011_create_actuals_imports.sql): batch -> rows
-- (staging validado linha-a-linha) -> ledger + auditoria em 3 niveis.
--
-- Diferencas em relacao ao DRE:
-- - Uma unica carga mescla duas ORIGENS na mesma espinha dorsal: FAT (faturado,
--   NF emitida) e CART (carteira, pedido a faturar). Discriminador = coluna `origem`.
-- - Colunas da planilha: origem, data, cod_produto, cod_cliente, territorio,
--   quantidade, valor, mb_pct(opcional). O resto o sistema DERIVA na trigger:
--     * produto (cod_produto)  -> produto_id, tipo, cultura
--     * cliente (cod_cliente)  -> cliente_id
--     * linha_negocio          -> do tipo/cultura do produto
--     * territorio             -> valida o texto da planilha contra comercial_territorios
--     * coordenacao/responsavel-> de comercial_atribuicao_responsavel vigente na data
-- - Competencia da linha CART = data de PREVISAO (vem na coluna `data`).
-- - load_mode 'complete' apaga o realizado da competencia (org, ano, mes) e
--   substitui; 'additional' apaga so as linhas do proprio lote.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.comercial_realizado_import_batches (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  reference_year    integer not null,
  reference_month   integer not null check (reference_month between 1 and 12),
  load_mode         text not null check (load_mode in ('complete', 'additional')),
  source_type       text not null default 'file' check (source_type in ('file', 'manual')),
  source_file_name  text,
  status            text not null default 'draft' check (status in ('draft', 'validating', 'error', 'ready', 'applied', 'cancelled')),
  notes             text,
  total_rows        integer not null default 0,
  error_rows        integer not null default 0,
  valid_rows        integer not null default 0,
  uploaded_by       uuid references auth.users(id) on delete set null,
  applied_by        uuid references auth.users(id) on delete set null,
  uploaded_at       timestamptz not null default now(),
  applied_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (
    (source_type = 'file' and source_file_name is not null)
    or source_type = 'manual'
  )
);

create table if not exists public.comercial_realizado_import_rows (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references public.comercial_realizado_import_batches(id) on delete cascade,
  row_number        integer not null check (row_number >= 1),
  origem            text,
  entry_date        date,
  cod_produto       text,
  produto_id        uuid references public.comercial_produtos(id) on delete restrict,
  cod_cliente       text,
  cliente_id        uuid references public.comercial_clientes(id) on delete restrict,
  cod_territorio    text,
  territorio_id     uuid references public.comercial_territorios(id) on delete restrict,
  linha_negocio_id  uuid references public.comercial_linhas_negocio(id) on delete restrict,
  coordenacao_id    uuid references public.comercial_coordenacoes(id) on delete restrict,
  responsavel       text,
  quantidade        numeric(18, 4),
  valor             numeric(18, 2),
  mb_pct            numeric(9, 6),
  validation_status text not null default 'pending' check (validation_status in ('pending', 'valid', 'error')),
  validation_errors jsonb not null default '[]'::jsonb,
  raw_payload       jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (batch_id, row_number)
);

create table if not exists public.comercial_realizado_ledger_entries (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  batch_id          uuid not null references public.comercial_realizado_import_batches(id) on delete restrict,
  batch_row_id      uuid not null references public.comercial_realizado_import_rows(id) on delete restrict,
  reference_year    integer not null,
  reference_month   integer not null check (reference_month between 1 and 12),
  entry_date        date not null,
  origem            text not null check (origem in ('FAT', 'CART')),
  produto_id        uuid not null references public.comercial_produtos(id) on delete restrict,
  cliente_id        uuid not null references public.comercial_clientes(id) on delete restrict,
  territorio_id     uuid references public.comercial_territorios(id) on delete restrict,
  linha_negocio_id  uuid not null references public.comercial_linhas_negocio(id) on delete restrict,
  coordenacao_id    uuid not null references public.comercial_coordenacoes(id) on delete restrict,
  responsavel       text,
  cod_produto       text not null,
  cod_cliente       text not null,
  quantidade        numeric(18, 4) not null,
  valor             numeric(18, 2) not null,
  mb_pct            numeric(9, 6),
  source_type       text not null check (source_type in ('file', 'manual')),
  created_by        uuid references auth.users(id) on delete set null,
  updated_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (batch_row_id)
);

create table if not exists public.comercial_realizado_batch_audit (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null,
  organization_id   uuid not null,
  action            text not null check (action in ('insert', 'update', 'delete')),
  changed_by        uuid,
  changed_at        timestamptz not null default now(),
  old_row           jsonb,
  new_row           jsonb
);

create table if not exists public.comercial_realizado_row_audit (
  id                uuid primary key default gen_random_uuid(),
  batch_row_id      uuid not null,
  batch_id          uuid not null,
  action            text not null check (action in ('insert', 'update', 'delete')),
  changed_by        uuid,
  changed_at        timestamptz not null default now(),
  old_row           jsonb,
  new_row           jsonb
);

create table if not exists public.comercial_realizado_ledger_audit (
  id                uuid primary key default gen_random_uuid(),
  ledger_entry_id   uuid not null,
  organization_id   uuid not null,
  batch_id          uuid not null,
  action            text not null check (action in ('insert', 'update', 'delete')),
  changed_by        uuid,
  changed_at        timestamptz not null default now(),
  old_row           jsonb,
  new_row           jsonb
);

-- ---------------------------------------------------------------------------
-- Indices
-- ---------------------------------------------------------------------------

create index if not exists idx_comercial_realizado_batches_org_period
  on public.comercial_realizado_import_batches (organization_id, reference_year, reference_month, status);

create index if not exists idx_comercial_realizado_rows_batch_number
  on public.comercial_realizado_import_rows (batch_id, row_number);

create index if not exists idx_comercial_realizado_rows_validation
  on public.comercial_realizado_import_rows (batch_id, validation_status);

create index if not exists idx_comercial_realizado_ledger_org_period
  on public.comercial_realizado_ledger_entries (organization_id, reference_year, reference_month, entry_date);

create index if not exists idx_comercial_realizado_ledger_origem
  on public.comercial_realizado_ledger_entries (organization_id, origem, reference_year, reference_month);

create index if not exists idx_comercial_realizado_ledger_produto
  on public.comercial_realizado_ledger_entries (organization_id, produto_id, reference_year, reference_month);

create index if not exists idx_comercial_realizado_ledger_cliente
  on public.comercial_realizado_ledger_entries (organization_id, cliente_id, reference_year, reference_month);

create index if not exists idx_comercial_realizado_ledger_coordenacao
  on public.comercial_realizado_ledger_entries (organization_id, coordenacao_id, reference_year, reference_month);

create index if not exists idx_comercial_realizado_ledger_territorio
  on public.comercial_realizado_ledger_entries (organization_id, territorio_id, reference_year, reference_month);

create index if not exists idx_comercial_realizado_batch_audit_batch
  on public.comercial_realizado_batch_audit (batch_id, changed_at desc);

create index if not exists idx_comercial_realizado_row_audit_batch_row
  on public.comercial_realizado_row_audit (batch_row_id, changed_at desc);

create index if not exists idx_comercial_realizado_ledger_audit_entry
  on public.comercial_realizado_ledger_audit (ledger_entry_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Helper: organization_id do batch (para RLS nas rows)
-- ---------------------------------------------------------------------------

create or replace function public.get_comercial_realizado_batch_organization_id(target_batch_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.organization_id
  from public.comercial_realizado_import_batches b
  where b.id = target_batch_id
$$;

grant execute on function public.get_comercial_realizado_batch_organization_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Recalculo de contadores/status do batch
-- ---------------------------------------------------------------------------

create or replace function public.refresh_comercial_realizado_batch_stats(target_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_status text;
begin
  select status
    into batch_status
  from public.comercial_realizado_import_batches
  where id = target_batch_id;

  update public.comercial_realizado_import_batches b
     set total_rows = coalesce(stats.total_rows, 0),
         error_rows = coalesce(stats.error_rows, 0),
         valid_rows = coalesce(stats.valid_rows, 0),
         status = case
           when batch_status in ('applied', 'cancelled') then batch_status
           when coalesce(stats.total_rows, 0) = 0 then 'draft'
           when coalesce(stats.error_rows, 0) > 0 then 'error'
           else 'ready'
         end,
         updated_at = now()
    from (
      select
        r.batch_id,
        count(*) as total_rows,
        count(*) filter (where r.validation_status = 'error') as error_rows,
        count(*) filter (where r.validation_status = 'valid') as valid_rows
      from public.comercial_realizado_import_rows r
      where r.batch_id = target_batch_id
      group by r.batch_id
    ) stats
   where b.id = target_batch_id;

  if not exists (
    select 1
    from public.comercial_realizado_import_rows r
    where r.batch_id = target_batch_id
  ) then
    update public.comercial_realizado_import_batches
       set total_rows = 0,
           error_rows = 0,
           valid_rows = 0,
           status = case
             when batch_status in ('applied', 'cancelled') then batch_status
             else 'draft'
           end,
           updated_at = now()
     where id = target_batch_id;
  end if;
end;
$$;

grant execute on function public.refresh_comercial_realizado_batch_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Validacao + derivacao linha-a-linha (o coracao da carga)
-- ---------------------------------------------------------------------------

create or replace function public.validate_comercial_realizado_import_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_rec   public.comercial_realizado_import_batches%rowtype;
  error_list  jsonb := '[]'::jsonb;
  norm_origem text;
  norm_prod   text;
  norm_cli    text;
  norm_terr   text;
  tipo_nome   text;
  cultura_nome text;
  linha_nome  text;
  atrib_rec   record;
begin
  select *
    into batch_rec
  from public.comercial_realizado_import_batches
  where id = new.batch_id;

  if not found then
    raise exception 'Lote de importacao nao encontrado';
  end if;

  norm_origem := upper(nullif(btrim(new.origem), ''));
  norm_prod   := nullif(btrim(new.cod_produto), '');
  norm_cli    := nullif(btrim(new.cod_cliente), '');
  norm_terr   := nullif(btrim(new.cod_territorio), '');

  new.origem           := norm_origem;
  new.cod_produto      := norm_prod;
  new.cod_cliente      := norm_cli;
  new.cod_territorio   := norm_terr;
  new.produto_id       := null;
  new.cliente_id       := null;
  new.territorio_id    := null;
  new.linha_negocio_id := null;
  new.coordenacao_id   := null;
  new.responsavel      := null;

  -- Origem
  if norm_origem is null then
    error_list := error_list || jsonb_build_array('Origem obrigatoria (FAT ou CART)');
  elsif norm_origem not in ('FAT', 'CART') then
    error_list := error_list || jsonb_build_array('Origem invalida (use FAT ou CART)');
  end if;

  -- Data / competencia
  if new.entry_date is null then
    error_list := error_list || jsonb_build_array('Data obrigatoria');
  elsif extract(year from new.entry_date)::integer <> batch_rec.reference_year
     or extract(month from new.entry_date)::integer <> batch_rec.reference_month then
    error_list := error_list || jsonb_build_array('Data fora da competencia do lote');
  end if;

  -- Quantidade / valor
  if new.quantidade is null then
    error_list := error_list || jsonb_build_array('Quantidade obrigatoria');
  end if;
  if new.valor is null then
    error_list := error_list || jsonb_build_array('Valor obrigatorio');
  end if;

  -- Produto (curado): resolve id + tipo + cultura
  if norm_prod is null then
    error_list := error_list || jsonb_build_array('Produto obrigatorio');
  else
    select p.id, t.nome, c.nome
      into new.produto_id, tipo_nome, cultura_nome
    from public.comercial_produtos p
    join public.comercial_tipos t on t.id = p.tipo_id
    left join public.comercial_culturas c on c.id = p.cultura_id
    where p.organization_id = batch_rec.organization_id
      and p.codigo = norm_prod;

    if new.produto_id is null then
      error_list := error_list || jsonb_build_array('Produto nao cadastrado');
    end if;
  end if;

  -- Cliente (curado)
  if norm_cli is null then
    error_list := error_list || jsonb_build_array('Cliente obrigatorio');
  else
    select cl.id
      into new.cliente_id
    from public.comercial_clientes cl
    where cl.organization_id = batch_rec.organization_id
      and cl.codigo = norm_cli;

    if new.cliente_id is null then
      error_list := error_list || jsonb_build_array('Cliente nao cadastrado');
    end if;
  end if;

  -- Linha de negocio: derivada do tipo/cultura do produto
  if new.produto_id is not null then
    linha_nome := case
      when tipo_nome = 'Peças' then 'Peças'
      when tipo_nome = 'Máquinas' and cultura_nome = 'Grãos' then 'Grão'
      when tipo_nome = 'Máquinas' and cultura_nome = 'Pecuária' then 'Pecuária'
      when tipo_nome in ('Transgrain', 'Acessórios') then 'Outros'
      else null
    end;

    if linha_nome is null then
      if tipo_nome = 'Máquinas' then
        error_list := error_list || jsonb_build_array('Produto MAQUINAS sem cultura definida (corrigir cadastro do produto)');
      else
        error_list := error_list || jsonb_build_array('Nao foi possivel derivar a linha de negocio do produto');
      end if;
    else
      select ln.id
        into new.linha_negocio_id
      from public.comercial_linhas_negocio ln
      where ln.organization_id = batch_rec.organization_id
        and ln.nome = linha_nome;

      if new.linha_negocio_id is null then
        error_list := error_list || jsonb_build_array('Linha de negocio derivada nao cadastrada: ' || linha_nome);
      end if;
    end if;
  end if;

  -- Territorio: texto da planilha validado contra o cadastro (opcional so p/ Pecas)
  if norm_terr is not null then
    select tr.id
      into new.territorio_id
    from public.comercial_territorios tr
    where tr.organization_id = batch_rec.organization_id
      and tr.nome = norm_terr;

    if new.territorio_id is null then
      error_list := error_list || jsonb_build_array('Territorio nao cadastrado: ' || norm_terr);
    end if;
  elsif linha_nome is not null and linha_nome <> 'Peças' then
    error_list := error_list || jsonb_build_array('Territorio obrigatorio (em branco so para Pecas)');
  end if;

  -- Coordenacao + responsavel: da atribuicao vigente na data (territorio+linha)
  if new.linha_negocio_id is not null and new.entry_date is not null
     and (new.territorio_id is not null or linha_nome = 'Peças') then
    select ar.coordenacao_id, ar.responsavel
      into atrib_rec
    from public.comercial_atribuicao_responsavel ar
    where ar.organization_id = batch_rec.organization_id
      and ar.linha_negocio_id = new.linha_negocio_id
      and (ar.territorio_id is not distinct from new.territorio_id)
      and new.entry_date >= ar.data_inicio
      and (ar.data_fim is null or new.entry_date <= ar.data_fim)
    order by ar.data_inicio desc
    limit 1;

    if atrib_rec.coordenacao_id is null then
      error_list := error_list || jsonb_build_array('Sem atribuicao de responsavel/coordenacao vigente para territorio+linha na data');
    else
      new.coordenacao_id := atrib_rec.coordenacao_id;
      new.responsavel    := atrib_rec.responsavel;
    end if;
  end if;

  new.validation_errors := error_list;
  new.validation_status := case
    when jsonb_array_length(error_list) > 0 then 'error'
    else 'valid'
  end;

  if batch_rec.status = 'applied' and new.validation_status <> 'valid' then
    raise exception 'Lotes aplicados nao aceitam linhas invalidas';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sincronizacao do ledger quando o lote ja esta aplicado
-- ---------------------------------------------------------------------------

create or replace function public.after_comercial_realizado_import_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_batch_id uuid;
  batch_rec public.comercial_realizado_import_batches%rowtype;
begin
  target_batch_id := coalesce(new.batch_id, old.batch_id);

  perform public.refresh_comercial_realizado_batch_stats(target_batch_id);

  select *
    into batch_rec
  from public.comercial_realizado_import_batches
  where id = target_batch_id;

  if batch_rec.status = 'applied' then
    if tg_op = 'DELETE' then
      delete from public.comercial_realizado_ledger_entries
      where batch_row_id = old.id;
    elsif coalesce(new.validation_status, 'error') = 'valid' then
      insert into public.comercial_realizado_ledger_entries (
        organization_id, batch_id, batch_row_id, reference_year, reference_month,
        entry_date, origem, produto_id, cliente_id, territorio_id, linha_negocio_id,
        coordenacao_id, responsavel, cod_produto, cod_cliente, quantidade, valor,
        mb_pct, source_type, created_by, updated_by
      )
      values (
        batch_rec.organization_id, new.batch_id, new.id, batch_rec.reference_year, batch_rec.reference_month,
        new.entry_date, new.origem, new.produto_id, new.cliente_id, new.territorio_id, new.linha_negocio_id,
        new.coordenacao_id, new.responsavel, new.cod_produto, new.cod_cliente, new.quantidade, new.valor,
        new.mb_pct, batch_rec.source_type, auth.uid(), auth.uid()
      )
      on conflict (batch_row_id) do update
        set entry_date = excluded.entry_date,
            origem = excluded.origem,
            produto_id = excluded.produto_id,
            cliente_id = excluded.cliente_id,
            territorio_id = excluded.territorio_id,
            linha_negocio_id = excluded.linha_negocio_id,
            coordenacao_id = excluded.coordenacao_id,
            responsavel = excluded.responsavel,
            cod_produto = excluded.cod_produto,
            cod_cliente = excluded.cod_cliente,
            quantidade = excluded.quantidade,
            valor = excluded.valor,
            mb_pct = excluded.mb_pct,
            source_type = excluded.source_type,
            updated_by = auth.uid(),
            updated_at = now();
    else
      delete from public.comercial_realizado_ledger_entries
      where batch_row_id = new.id;
    end if;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------

create or replace function public.audit_comercial_realizado_batch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.comercial_realizado_batch_audit (
    batch_id, organization_id, action, changed_by, old_row, new_row
  )
  values (
    coalesce(new.id, old.id),
    coalesce(new.organization_id, old.organization_id),
    lower(tg_op),
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return null;
end;
$$;

create or replace function public.audit_comercial_realizado_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.comercial_realizado_row_audit (
    batch_row_id, batch_id, action, changed_by, old_row, new_row
  )
  values (
    coalesce(new.id, old.id),
    coalesce(new.batch_id, old.batch_id),
    lower(tg_op),
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return null;
end;
$$;

create or replace function public.audit_comercial_realizado_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.comercial_realizado_ledger_audit (
    ledger_entry_id, organization_id, batch_id, action, changed_by, old_row, new_row
  )
  values (
    coalesce(new.id, old.id),
    coalesce(new.organization_id, old.organization_id),
    coalesce(new.batch_id, old.batch_id),
    lower(tg_op),
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aplicar lote (gera o ledger oficial)
-- ---------------------------------------------------------------------------

create or replace function public.apply_comercial_realizado_import_batch(target_batch_id uuid)
returns public.comercial_realizado_import_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_rec public.comercial_realizado_import_batches%rowtype;
begin
  select *
    into batch_rec
  from public.comercial_realizado_import_batches
  where id = target_batch_id;

  if not found then
    raise exception 'Lote de importacao nao encontrado';
  end if;

  if not public.is_org_editor(batch_rec.organization_id) then
    raise exception 'Usuario sem permissao para aplicar este lote';
  end if;

  if not exists (
    select 1 from public.comercial_realizado_import_rows r
    where r.batch_id = target_batch_id
  ) then
    raise exception 'O lote nao possui linhas para aplicacao';
  end if;

  if exists (
    select 1 from public.comercial_realizado_import_rows r
    where r.batch_id = target_batch_id and r.validation_status = 'error'
  ) then
    raise exception 'Corrija todas as linhas com erro antes de aplicar o lote';
  end if;

  if batch_rec.load_mode = 'complete' then
    delete from public.comercial_realizado_ledger_entries l
    where l.organization_id = batch_rec.organization_id
      and l.reference_year = batch_rec.reference_year
      and l.reference_month = batch_rec.reference_month;
  else
    delete from public.comercial_realizado_ledger_entries l
    where l.batch_id = target_batch_id;
  end if;

  insert into public.comercial_realizado_ledger_entries (
    organization_id, batch_id, batch_row_id, reference_year, reference_month,
    entry_date, origem, produto_id, cliente_id, territorio_id, linha_negocio_id,
    coordenacao_id, responsavel, cod_produto, cod_cliente, quantidade, valor,
    mb_pct, source_type, created_by, updated_by
  )
  select
    batch_rec.organization_id, r.batch_id, r.id, batch_rec.reference_year, batch_rec.reference_month,
    r.entry_date, r.origem, r.produto_id, r.cliente_id, r.territorio_id, r.linha_negocio_id,
    r.coordenacao_id, r.responsavel, r.cod_produto, r.cod_cliente, r.quantidade, r.valor,
    r.mb_pct, batch_rec.source_type, auth.uid(), auth.uid()
  from public.comercial_realizado_import_rows r
  where r.batch_id = target_batch_id
    and r.validation_status = 'valid'
  on conflict (batch_row_id) do update
    set entry_date = excluded.entry_date,
        origem = excluded.origem,
        produto_id = excluded.produto_id,
        cliente_id = excluded.cliente_id,
        territorio_id = excluded.territorio_id,
        linha_negocio_id = excluded.linha_negocio_id,
        coordenacao_id = excluded.coordenacao_id,
        responsavel = excluded.responsavel,
        cod_produto = excluded.cod_produto,
        cod_cliente = excluded.cod_cliente,
        quantidade = excluded.quantidade,
        valor = excluded.valor,
        mb_pct = excluded.mb_pct,
        source_type = excluded.source_type,
        updated_by = auth.uid(),
        updated_at = now();

  update public.comercial_realizado_import_batches
     set status = 'applied',
         applied_by = auth.uid(),
         applied_at = now(),
         updated_at = now()
   where id = target_batch_id
   returning *
    into batch_rec;

  return batch_rec;
end;
$$;

grant execute on function public.apply_comercial_realizado_import_batch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Excluir lote (desfaz a aplicacao e remove o lote, numa transacao)
-- ---------------------------------------------------------------------------

create or replace function public.delete_comercial_realizado_import_batch(target_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '0'
as $$
declare
  batch_rec public.comercial_realizado_import_batches%rowtype;
begin
  select *
    into batch_rec
  from public.comercial_realizado_import_batches
  where id = target_batch_id;

  if not found then
    raise exception 'Lote de importacao nao encontrado';
  end if;

  if not public.is_org_editor(batch_rec.organization_id) then
    raise exception 'Usuario sem permissao para excluir este lote';
  end if;

  delete from public.comercial_realizado_ledger_entries l
  where l.batch_id = target_batch_id;

  delete from public.comercial_realizado_import_batches
  where id = target_batch_id;
end;
$$;

grant execute on function public.delete_comercial_realizado_import_batch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists trg_comercial_realizado_batches_updated_at on public.comercial_realizado_import_batches;
create trigger trg_comercial_realizado_batches_updated_at
before update on public.comercial_realizado_import_batches
for each row execute function public.set_updated_at();

drop trigger if exists trg_comercial_realizado_rows_updated_at on public.comercial_realizado_import_rows;
create trigger trg_comercial_realizado_rows_updated_at
before update on public.comercial_realizado_import_rows
for each row execute function public.set_updated_at();

drop trigger if exists trg_comercial_realizado_ledger_updated_at on public.comercial_realizado_ledger_entries;
create trigger trg_comercial_realizado_ledger_updated_at
before update on public.comercial_realizado_ledger_entries
for each row execute function public.set_updated_at();

drop trigger if exists trg_validate_comercial_realizado_row on public.comercial_realizado_import_rows;
create trigger trg_validate_comercial_realizado_row
before insert or update on public.comercial_realizado_import_rows
for each row execute function public.validate_comercial_realizado_import_row();

drop trigger if exists trg_after_comercial_realizado_row_change on public.comercial_realizado_import_rows;
create trigger trg_after_comercial_realizado_row_change
after insert or update or delete on public.comercial_realizado_import_rows
for each row execute function public.after_comercial_realizado_import_row_change();

drop trigger if exists trg_audit_comercial_realizado_batch on public.comercial_realizado_import_batches;
create trigger trg_audit_comercial_realizado_batch
after insert or update or delete on public.comercial_realizado_import_batches
for each row execute function public.audit_comercial_realizado_batch();

drop trigger if exists trg_audit_comercial_realizado_row on public.comercial_realizado_import_rows;
create trigger trg_audit_comercial_realizado_row
after insert or update or delete on public.comercial_realizado_import_rows
for each row execute function public.audit_comercial_realizado_row();

drop trigger if exists trg_audit_comercial_realizado_ledger_entry on public.comercial_realizado_ledger_entries;
create trigger trg_audit_comercial_realizado_ledger_entry
after insert or update or delete on public.comercial_realizado_ledger_entries
for each row execute function public.audit_comercial_realizado_ledger_entry();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.comercial_realizado_import_batches enable row level security;
alter table public.comercial_realizado_import_rows enable row level security;
alter table public.comercial_realizado_ledger_entries enable row level security;
alter table public.comercial_realizado_batch_audit enable row level security;
alter table public.comercial_realizado_row_audit enable row level security;
alter table public.comercial_realizado_ledger_audit enable row level security;

drop policy if exists "members read comercial realizado batches" on public.comercial_realizado_import_batches;
create policy "members read comercial realizado batches"
on public.comercial_realizado_import_batches
for select using (public.is_org_member(organization_id));

drop policy if exists "editors manage comercial realizado batches" on public.comercial_realizado_import_batches;
create policy "editors manage comercial realizado batches"
on public.comercial_realizado_import_batches
for all using (public.is_org_editor(organization_id))
with check (public.is_org_editor(organization_id));

drop policy if exists "members read comercial realizado rows" on public.comercial_realizado_import_rows;
create policy "members read comercial realizado rows"
on public.comercial_realizado_import_rows
for select using (public.is_org_member(public.get_comercial_realizado_batch_organization_id(batch_id)));

drop policy if exists "editors manage comercial realizado rows" on public.comercial_realizado_import_rows;
create policy "editors manage comercial realizado rows"
on public.comercial_realizado_import_rows
for all using (public.is_org_editor(public.get_comercial_realizado_batch_organization_id(batch_id)))
with check (public.is_org_editor(public.get_comercial_realizado_batch_organization_id(batch_id)));

drop policy if exists "members read comercial realizado ledger" on public.comercial_realizado_ledger_entries;
create policy "members read comercial realizado ledger"
on public.comercial_realizado_ledger_entries
for select using (public.is_org_member(organization_id));

drop policy if exists "editors manage comercial realizado ledger" on public.comercial_realizado_ledger_entries;
create policy "editors manage comercial realizado ledger"
on public.comercial_realizado_ledger_entries
for all using (public.is_org_editor(organization_id))
with check (public.is_org_editor(organization_id));

drop policy if exists "members read comercial realizado batch audit" on public.comercial_realizado_batch_audit;
create policy "members read comercial realizado batch audit"
on public.comercial_realizado_batch_audit
for select using (public.is_org_member(organization_id));

drop policy if exists "members read comercial realizado row audit" on public.comercial_realizado_row_audit;
create policy "members read comercial realizado row audit"
on public.comercial_realizado_row_audit
for select using (public.is_org_member(public.get_comercial_realizado_batch_organization_id(batch_id)));

drop policy if exists "members read comercial realizado ledger audit" on public.comercial_realizado_ledger_audit;
create policy "members read comercial realizado ledger audit"
on public.comercial_realizado_ledger_audit
for select using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Views de relatorio (nao duplicam dado)
-- ---------------------------------------------------------------------------

-- Faturado = somente linhas FAT do ledger.
create or replace view public.comercial_faturado as
select *
from public.comercial_realizado_ledger_entries
where origem = 'FAT';

-- FAT + CART = todo o ledger de realizado (faturado + carteira).
create or replace view public.comercial_fat_cart as
select *
from public.comercial_realizado_ledger_entries;

commit;
