begin;

-- A regionalizacao geografica (territorio/cidade/UF) continua no ledger.
-- Estas colunas guardam a chave comercial da NF para campanhas de vendedor.
alter table public.comercial_atribuicao_responsavel
  add column if not exists cod_vendedor text;

alter table public.comercial_realizado_import_rows
  add column if not exists cod_vendedor text,
  add column if not exists campanha_atribuicao_id uuid references public.comercial_atribuicao_responsavel(id) on delete restrict,
  add column if not exists campanha_status text not null default 'sem_atribuicao_valida'
    check (campanha_status in ('valida', 'sem_atribuicao_valida', 'nao_fat'));

alter table public.comercial_realizado_ledger_entries
  add column if not exists cod_vendedor text,
  add column if not exists campanha_atribuicao_id uuid references public.comercial_atribuicao_responsavel(id) on delete restrict,
  add column if not exists campanha_status text not null default 'sem_atribuicao_valida'
    check (campanha_status in ('valida', 'sem_atribuicao_valida', 'nao_fat'));

-- Cadastro auxiliar para exibir o codigo com o nome oficial, sem usar o nome
-- como chave. Codigos novos encontrados na carga sao historicos ate revisao.
create table if not exists public.comercial_vendedores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  codigo text not null,
  nome text not null,
  situacao text not null default 'historico' check (situacao in ('ativo', 'historico')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, codigo)
);

create index if not exists idx_comercial_atribuicao_vendedor_vigencia
  on public.comercial_atribuicao_responsavel (organization_id, cod_vendedor, linha_negocio_id, data_inicio);
create index if not exists idx_comercial_ledger_vendedor_campanha
  on public.comercial_realizado_ledger_entries (organization_id, cod_vendedor, campanha_status, entry_date);

-- Uma pessoa pode cobrir mais de um territorio na mesma linha (ex.: MA e PI),
-- mas nao pode ter duas atribuicoes vigentes para a mesma combinacao de
-- vendedor + territorio + linha. Isso torna o cruzamento deterministico.
alter table public.comercial_atribuicao_responsavel
  drop constraint if exists comercial_atribuicao_responsavel_vendedor_linha_vigencia_excl;
alter table public.comercial_atribuicao_responsavel
  add constraint comercial_atribuicao_responsavel_vendedor_linha_vigencia_excl
  exclude using gist (
    organization_id with =,
    cod_vendedor with =,
    territorio_id with =,
    linha_negocio_id with =,
    daterange(data_inicio, coalesce(data_fim, 'infinity'::date), '[]') with &&
  ) where (cod_vendedor is not null);

with org as (select id from public.organizations where name = 'Marcher Brasil' limit 1),
v(codigo, nome, situacao) as (
  values
    ('000636', 'ANDRE CARDOSO', 'ativo'), ('000672', 'CAIO HENRIQUE MENDES BINSFELD', 'ativo'),
    ('000348', 'CLAUDEMIR ALEXANDRE DE ALMEIDA', 'ativo'), ('000600', 'JOSE ESCOURA', 'ativo'),
    ('000629', 'GABRIEL SANTANA FELIPE', 'ativo'), ('000322', 'GLESON CARVALHO FREITAS', 'ativo'),
    ('000459', 'GRAZIAN MAGALHAES', 'ativo'), ('000664', 'GUSTAVO SIMAO OLIVEIRA', 'ativo'),
    ('000635', 'GUSTAVO CARVALHO', 'ativo'), ('000633', 'JENIFER VIANA', 'ativo'),
    ('000641', 'JOAO FELIPE XAVIER', 'ativo'), ('000472', 'NABOR MUNIZ', 'ativo'),
    ('000253', 'PAULO SCOLARI', 'ativo'), ('000590', 'RENAN BORBA', 'ativo'),
    ('000274', 'RENNAN FELIPE', 'ativo'), ('000551', 'RICARDO SANTOS', 'ativo'),
    ('000423', 'RCM REPRESENTACAO AGRICOLA E PECUARIA', 'ativo'), ('000673', 'VALTUIR MEZZOMO', 'ativo'),
    ('000674', 'ROGERIO CAVALLI', 'historico')
)
insert into public.comercial_vendedores (organization_id, codigo, nome, situacao)
select org.id, v.codigo, v.nome, v.situacao from org cross join v
on conflict (organization_id, codigo) do update set nome = excluded.nome, situacao = excluded.situacao, updated_at = now();

-- Backfill seguro dos codigos que ja existiam no cadastro. Os dois Gustavos
-- sao desambiguados pelo territorio; atribuicoes sem mapeamento ficam nulas e
-- aparecem no relatorio de validacao, sem alterar vendas historicas.
with org as (select id from public.organizations where name = 'Marcher Brasil' limit 1)
update public.comercial_atribuicao_responsavel ar
set cod_vendedor = case
  when lower(ar.responsavel) like 'andr%' then '000636'
  when lower(ar.responsavel) = 'caio' then '000672'
  when lower(ar.responsavel) = 'claudemir' then '000348'
  when lower(ar.responsavel) = 'escoura' then '000600'
  when lower(ar.responsavel) = 'gabriel' then '000629'
  when lower(ar.responsavel) = 'gleson' then '000322'
  when lower(ar.responsavel) = 'grazian' then '000459'
  when lower(ar.responsavel) = 'gustavo' and tr.nome = 'RS SUL' then '000664'
  when lower(ar.responsavel) = 'gustavo' and tr.nome <> 'RS SUL' then '000635'
  when lower(ar.responsavel) = 'jenifer' then '000633'
  when lower(ar.responsavel) like 'jo%' then '000641'
  when lower(ar.responsavel) = 'nabor' then '000472'
  when lower(ar.responsavel) = 'peninha' then '000253'
  when lower(ar.responsavel) = 'renan b.' then '000590'
  when lower(ar.responsavel) = 'rennan' then '000274'
  when lower(ar.responsavel) = 'ricardo' then '000551'
  when lower(ar.responsavel) = 'rodrigo' then '000423'
  when lower(ar.responsavel) = 'valtuir' then '000673'
  when lower(ar.responsavel) like 'roger%' then '000674'
end
from public.comercial_territorios tr, org
where ar.organization_id = org.id and tr.id = ar.territorio_id and ar.cod_vendedor is null;

with org as (select id from public.organizations where name = 'Marcher Brasil' limit 1)
update public.comercial_atribuicao_responsavel ar
set cod_vendedor = '000633'
from org
where ar.organization_id = org.id
  and ar.territorio_id is null
  and lower(ar.responsavel) = 'jenifer'
  and ar.cod_vendedor is null;

-- Complementa a validacao atual sem mexer na derivacao geografica existente.
-- FAT e CART exigem codigo. A atribuicao comercial e resolvida por codigo +
-- linha + data, nunca por Cidade/UF; CART fica pronto para as previas mensais.
create or replace function public.zzz_validate_comercial_vendedor_campanha()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  batch_rec public.comercial_realizado_import_batches%rowtype;
  atrib_rec public.comercial_atribuicao_responsavel%rowtype;
  errs jsonb;
begin
  select * into batch_rec from public.comercial_realizado_import_batches where id = new.batch_id;
  new.cod_vendedor := nullif(btrim(new.cod_vendedor), '');
  new.campanha_atribuicao_id := null;
  new.campanha_status := case when new.origem in ('FAT', 'CART') then 'sem_atribuicao_valida' else 'nao_fat' end;
  errs := coalesce(new.validation_errors, '[]'::jsonb);

  if new.origem in ('FAT', 'CART') and new.cod_vendedor is null then
    errs := errs || jsonb_build_array('Codigo do vendedor obrigatorio para origem FAT ou CART');
  elsif new.origem in ('FAT', 'CART') and new.cod_vendedor is not null and new.entry_date is not null and new.linha_negocio_id is not null then
    select ar.* into atrib_rec from public.comercial_atribuicao_responsavel ar
     where ar.organization_id = batch_rec.organization_id
       and ar.cod_vendedor = new.cod_vendedor
       and ar.territorio_id is not distinct from new.territorio_id
       and ar.linha_negocio_id = new.linha_negocio_id
       and new.entry_date >= ar.data_inicio
       and (ar.data_fim is null or new.entry_date <= ar.data_fim)
     order by ar.data_inicio desc limit 1;
    if found then
      new.campanha_atribuicao_id := atrib_rec.id;
      new.campanha_status := 'valida';
    end if;

    insert into public.comercial_vendedores (organization_id, codigo, nome, situacao)
    values (batch_rec.organization_id, new.cod_vendedor, 'Vendedor historico ' || new.cod_vendedor, 'historico')
    on conflict (organization_id, codigo) do nothing;
  end if;
  new.validation_errors := errs;
  new.validation_status := case when jsonb_array_length(errs) > 0 then 'error' else 'valid' end;
  return new;
end; $$;

drop trigger if exists zzz_validate_comercial_vendedor_campanha on public.comercial_realizado_import_rows;
create trigger zzz_validate_comercial_vendedor_campanha
before insert or update on public.comercial_realizado_import_rows
for each row execute function public.zzz_validate_comercial_vendedor_campanha();

-- Recria aplicacao para carregar o snapshot comercial junto com a venda.
create or replace function public.apply_comercial_realizado_import_batch(target_batch_id uuid)
returns public.comercial_realizado_import_batches language plpgsql security definer set search_path = public as $$
declare batch_rec public.comercial_realizado_import_batches%rowtype;
begin
  select * into batch_rec from public.comercial_realizado_import_batches where id = target_batch_id;
  if not found then raise exception 'Lote de importacao nao encontrado'; end if;
  if not public.is_org_editor(batch_rec.organization_id) then raise exception 'Usuario sem permissao para aplicar este lote'; end if;
  if not exists (select 1 from public.comercial_realizado_import_rows where batch_id = target_batch_id) then raise exception 'O lote nao possui linhas para aplicacao'; end if;
  if exists (select 1 from public.comercial_realizado_import_rows where batch_id = target_batch_id and validation_status = 'error') then raise exception 'Corrija todas as linhas com erro antes de aplicar o lote'; end if;
  if batch_rec.load_mode = 'complete' then
    delete from public.comercial_realizado_ledger_entries where organization_id = batch_rec.organization_id and reference_year = batch_rec.reference_year and reference_month = batch_rec.reference_month;
  else
    delete from public.comercial_realizado_ledger_entries where batch_id = target_batch_id;
  end if;
  insert into public.comercial_realizado_ledger_entries (
    organization_id,batch_id,batch_row_id,reference_year,reference_month,entry_date,origem,produto_id,cliente_id,territorio_id,linha_negocio_id,coordenacao_id,responsavel,cod_produto,cod_cliente,quantidade,valor,mb_pct,source_type,created_by,updated_by,cod_vendedor,campanha_atribuicao_id,campanha_status)
  select batch_rec.organization_id,r.batch_id,r.id,batch_rec.reference_year,batch_rec.reference_month,r.entry_date,r.origem,r.produto_id,r.cliente_id,r.territorio_id,r.linha_negocio_id,r.coordenacao_id,r.responsavel,r.cod_produto,r.cod_cliente,r.quantidade,r.valor,r.mb_pct,batch_rec.source_type,auth.uid(),auth.uid(),r.cod_vendedor,r.campanha_atribuicao_id,r.campanha_status
  from public.comercial_realizado_import_rows r where r.batch_id = target_batch_id and r.validation_status = 'valid'
  on conflict (batch_row_id) do update set entry_date=excluded.entry_date,origem=excluded.origem,produto_id=excluded.produto_id,cliente_id=excluded.cliente_id,territorio_id=excluded.territorio_id,linha_negocio_id=excluded.linha_negocio_id,coordenacao_id=excluded.coordenacao_id,responsavel=excluded.responsavel,cod_produto=excluded.cod_produto,cod_cliente=excluded.cod_cliente,quantidade=excluded.quantidade,valor=excluded.valor,mb_pct=excluded.mb_pct,source_type=excluded.source_type,cod_vendedor=excluded.cod_vendedor,campanha_atribuicao_id=excluded.campanha_atribuicao_id,campanha_status=excluded.campanha_status,updated_by=auth.uid(),updated_at=now();
  update public.comercial_realizado_import_batches set status='applied', applied_by=auth.uid(), applied_at=now(), updated_at=now() where id=target_batch_id returning * into batch_rec;
  return batch_rec;
end; $$;

-- Consulta operacional para corrigir codigos sem atribuicao; inclui somente FAT.
create or replace view public.comercial_campanhas_sem_atribuicao_valida as
select l.organization_id, l.entry_date, l.reference_year, l.reference_month, l.cod_vendedor,
       l.cod_produto, l.cod_cliente, l.quantidade, l.valor, 'SEM ATRIBUICAO VALIDA'::text as classificacao
from public.comercial_realizado_ledger_entries l
where l.origem = 'FAT'
  and l.campanha_status = 'sem_atribuicao_valida';

alter table public.comercial_vendedores enable row level security;
drop policy if exists "members can read comercial vendedores" on public.comercial_vendedores;
create policy "members can read comercial vendedores" on public.comercial_vendedores for select using (public.is_org_member(organization_id));
drop policy if exists "editors can manage comercial vendedores" on public.comercial_vendedores;
create policy "editors can manage comercial vendedores" on public.comercial_vendedores for all using (public.is_org_editor(organization_id)) with check (public.is_org_editor(organization_id));

commit;
