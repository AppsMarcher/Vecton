begin;

-- Carga planejada (meta) por PERIODO MAIS LONGO que 1 mes, para revisoes.
--
-- Antes: 1 lote = 1 mes (o mes do seletor). Agora cada LINHA pode carregar o
-- seu proprio mes (coluna 'mes' da planilha, 1-12). Um upload cobre qualquer
-- conjunto de meses (ex: revisao set-dez). O ano continua vindo do lote (o
-- cenario e de um ano so).
--
-- Comportamento da "Carga completa": apaga e regrava SO os meses presentes no
-- arquivo (no cenario+ano do lote). Meses ausentes ficam intactos. Assim uma
-- revisao parcial (ex: 8+4 -> reprojeta set-dez) nao toca jan-ago.
--
-- Compatibilidade: linha sem 'mes' cai no mes do seletor (fallback), entao o
-- fluxo per-mes antigo continua funcionando.

-- Mes por linha (nulo = usa o mes do lote como fallback, resolvido na trigger).
alter table public.comercial_planejado_import_rows
  add column if not exists reference_month integer;

-- ---------------------------------------------------------------------------
-- Trigger de validacao: resolve o mes da linha (coluna 'mes' ou mes do lote)
-- ---------------------------------------------------------------------------

create or replace function public.validate_comercial_planejado_import_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_rec   public.comercial_planejado_import_batches%rowtype;
  error_list  jsonb := '[]'::jsonb;
  norm_prod   text;
  norm_terr   text;
  tipo_nome   text;
  cultura_nome text;
  linha_nome  text;
  lookup_territorio_id uuid;
  eff_month   integer;
  ref_date    date;
  atrib_rec   record;
begin
  select * into batch_rec
  from public.comercial_planejado_import_batches
  where id = new.batch_id;

  if not found then
    raise exception 'Lote de importacao nao encontrado';
  end if;

  -- Mes efetivo da linha: coluna 'mes' se veio, senao o mes do lote.
  eff_month := coalesce(new.reference_month, batch_rec.reference_month);
  new.reference_month := eff_month;

  if eff_month is null or eff_month < 1 or eff_month > 12 then
    error_list := error_list || jsonb_build_array('Mes invalido (use 1 a 12)');
    ref_date := make_date(batch_rec.reference_year, batch_rec.reference_month, 1);
  else
    ref_date := make_date(batch_rec.reference_year, eff_month, 1);
  end if;

  norm_prod := nullif(btrim(new.cod_produto), '');
  norm_terr := nullif(btrim(new.cod_territorio), '');

  new.cod_produto      := norm_prod;
  new.cod_territorio   := norm_terr;
  new.produto_id       := null;
  new.territorio_id    := null;
  new.linha_negocio_id := null;
  new.coordenacao_id   := null;
  new.responsavel      := null;

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
      select ln.id into new.linha_negocio_id
      from public.comercial_linhas_negocio ln
      where ln.organization_id = batch_rec.organization_id and ln.nome = linha_nome;

      if new.linha_negocio_id is null then
        error_list := error_list || jsonb_build_array('Linha de negocio derivada nao cadastrada: ' || linha_nome);
      end if;
    end if;
  end if;

  -- Territorio: obrigatorio (menos Pecas, nacional)
  if norm_terr is not null then
    select tr.id into new.territorio_id
    from public.comercial_territorios tr
    where tr.organization_id = batch_rec.organization_id and tr.nome = norm_terr;

    if new.territorio_id is null then
      error_list := error_list || jsonb_build_array('Territorio nao cadastrado: ' || norm_terr);
    end if;
  elsif linha_nome is not null and linha_nome <> 'Peças' then
    error_list := error_list || jsonb_build_array('Territorio obrigatorio (em branco so para Pecas)');
  end if;

  -- Coordenacao + responsavel (vigente no MES da linha):
  --   Grao/Pecuaria -> por territorio; Pecas -> nacional; Outros -> so carimba.
  if new.linha_negocio_id is not null and linha_nome <> 'Outros' then
    lookup_territorio_id := case when linha_nome = 'Peças' then null else new.territorio_id end;

    if (lookup_territorio_id is not null or linha_nome = 'Peças') then
      select ar.coordenacao_id, ar.responsavel
        into atrib_rec
      from public.comercial_atribuicao_responsavel ar
      where ar.organization_id = batch_rec.organization_id
        and ar.linha_negocio_id = new.linha_negocio_id
        and (ar.territorio_id is not distinct from lookup_territorio_id)
        and ref_date >= ar.data_inicio
        and (ar.data_fim is null or ref_date <= ar.data_fim)
      order by ar.data_inicio desc
      limit 1;

      if atrib_rec.coordenacao_id is null then
        error_list := error_list || jsonb_build_array('Sem atribuicao de responsavel/coordenacao vigente para territorio+linha no mes');
      else
        new.coordenacao_id := atrib_rec.coordenacao_id;
        new.responsavel    := atrib_rec.responsavel;
      end if;
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
-- Sync do ledger (lote aplicado): usa o mes DA LINHA
-- ---------------------------------------------------------------------------

create or replace function public.after_comercial_planejado_import_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_batch_id uuid;
  batch_rec public.comercial_planejado_import_batches%rowtype;
begin
  target_batch_id := coalesce(new.batch_id, old.batch_id);
  perform public.refresh_comercial_planejado_batch_stats(target_batch_id);

  select * into batch_rec
  from public.comercial_planejado_import_batches
  where id = target_batch_id;

  if batch_rec.status = 'applied' then
    if tg_op = 'DELETE' then
      delete from public.comercial_planejado_ledger_entries where batch_row_id = old.id;
    elsif coalesce(new.validation_status, 'error') = 'valid' then
      insert into public.comercial_planejado_ledger_entries (
        organization_id, scenario_id, batch_id, batch_row_id, reference_year, reference_month,
        produto_id, territorio_id, linha_negocio_id, coordenacao_id, responsavel,
        cod_produto, quantidade, valor, mb_pct, source_type, created_by, updated_by
      )
      values (
        batch_rec.organization_id, batch_rec.scenario_id, new.batch_id, new.id, batch_rec.reference_year, coalesce(new.reference_month, batch_rec.reference_month),
        new.produto_id, new.territorio_id, new.linha_negocio_id, new.coordenacao_id, new.responsavel,
        new.cod_produto, new.quantidade, new.valor, new.mb_pct, batch_rec.source_type, auth.uid(), auth.uid()
      )
      on conflict (batch_row_id) do update
        set scenario_id = excluded.scenario_id,
            reference_month = excluded.reference_month,
            produto_id = excluded.produto_id,
            territorio_id = excluded.territorio_id,
            linha_negocio_id = excluded.linha_negocio_id,
            coordenacao_id = excluded.coordenacao_id,
            responsavel = excluded.responsavel,
            cod_produto = excluded.cod_produto,
            quantidade = excluded.quantidade,
            valor = excluded.valor,
            mb_pct = excluded.mb_pct,
            source_type = excluded.source_type,
            updated_by = auth.uid(),
            updated_at = now();
    else
      delete from public.comercial_planejado_ledger_entries where batch_row_id = new.id;
    end if;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aplicar lote: "completa" substitui SO os meses presentes no arquivo
-- ---------------------------------------------------------------------------

create or replace function public.apply_comercial_planejado_import_batch(target_batch_id uuid)
returns public.comercial_planejado_import_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_rec public.comercial_planejado_import_batches%rowtype;
begin
  select * into batch_rec
  from public.comercial_planejado_import_batches
  where id = target_batch_id;

  if not found then
    raise exception 'Lote de importacao nao encontrado';
  end if;

  if not public.is_org_editor(batch_rec.organization_id) then
    raise exception 'Usuario sem permissao para aplicar este lote';
  end if;

  if not exists (select 1 from public.comercial_planejado_import_rows r where r.batch_id = target_batch_id) then
    raise exception 'O lote nao possui linhas para aplicacao';
  end if;

  if exists (select 1 from public.comercial_planejado_import_rows r where r.batch_id = target_batch_id and r.validation_status = 'error') then
    raise exception 'Corrija todas as linhas com erro antes de aplicar o lote';
  end if;

  -- Carga completa: apaga so os (cenario, ano, mes) que aparecem no lote.
  -- Meses ausentes do arquivo ficam intactos (revisao parcial).
  if batch_rec.load_mode = 'complete' then
    delete from public.comercial_planejado_ledger_entries l
    where l.organization_id = batch_rec.organization_id
      and l.scenario_id is not distinct from batch_rec.scenario_id
      and l.reference_year = batch_rec.reference_year
      and l.reference_month in (
        select distinct coalesce(r.reference_month, batch_rec.reference_month)
        from public.comercial_planejado_import_rows r
        where r.batch_id = target_batch_id and r.validation_status = 'valid'
      );
  else
    delete from public.comercial_planejado_ledger_entries l
    where l.batch_id = target_batch_id;
  end if;

  insert into public.comercial_planejado_ledger_entries (
    organization_id, scenario_id, batch_id, batch_row_id, reference_year, reference_month,
    produto_id, territorio_id, linha_negocio_id, coordenacao_id, responsavel,
    cod_produto, quantidade, valor, mb_pct, source_type, created_by, updated_by
  )
  select
    batch_rec.organization_id, batch_rec.scenario_id, r.batch_id, r.id, batch_rec.reference_year, coalesce(r.reference_month, batch_rec.reference_month),
    r.produto_id, r.territorio_id, r.linha_negocio_id, r.coordenacao_id, r.responsavel,
    r.cod_produto, r.quantidade, r.valor, r.mb_pct, batch_rec.source_type, auth.uid(), auth.uid()
  from public.comercial_planejado_import_rows r
  where r.batch_id = target_batch_id and r.validation_status = 'valid'
  on conflict (batch_row_id) do update
    set scenario_id = excluded.scenario_id,
        reference_month = excluded.reference_month,
        produto_id = excluded.produto_id,
        territorio_id = excluded.territorio_id,
        linha_negocio_id = excluded.linha_negocio_id,
        coordenacao_id = excluded.coordenacao_id,
        responsavel = excluded.responsavel,
        cod_produto = excluded.cod_produto,
        quantidade = excluded.quantidade,
        valor = excluded.valor,
        mb_pct = excluded.mb_pct,
        source_type = excluded.source_type,
        updated_by = auth.uid(),
        updated_at = now();

  update public.comercial_planejado_import_batches
     set status = 'applied', applied_by = auth.uid(), applied_at = now(), updated_at = now()
   where id = target_batch_id
   returning * into batch_rec;

  return batch_rec;
end;
$$;

commit;
