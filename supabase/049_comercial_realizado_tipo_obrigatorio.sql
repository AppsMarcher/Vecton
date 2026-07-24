begin;

-- 049: a carga de vendas realizadas passa a EXIGIR a coluna "tipo" na planilha.
-- O tipo informado (Maquinas/Pecas/Transgrain/Acessorios) manda no roteamento:
--   * tipo = Pecas  -> NAO trava produto/cliente. Se o codigo nao existir no
--     cadastro, autopreenche os genericos "Pecas diversas"/"Cliente diverso"
--     (o codigo digitado fica guardado como texto). Quantidade opcional (so
--     valor). Nacional -> Jenifer.
--   * tipo = Maquinas -> exige produto cadastrado (pra pegar a cultura Grao/
--     Pecuaria) + territorio. Igual antes.
--   * tipo = Transgrain/Acessorios -> exige produto cadastrado (sao poucos,
--     ja cadastrados); territorio opcional; linha "Outros".
--   * Coerencia: se o produto ESTA no cadastro, o tipo informado tem que bater
--     com o tipo do cadastro (senao trava) -> pega engano de digitacao.
--
-- So realizado. Meta de Pecas continua vindo do Jenifer (planejado inalterado).

-- ---------------------------------------------------------------------------
-- Genericos "diversos" para Pecas sem cadastro (satisfazem o FK do ledger).
-- ---------------------------------------------------------------------------
with org as (select id from public.organizations where name = 'Marcher Brasil' limit 1),
tp as (select id from public.comercial_tipos where organization_id = (select id from org) and nome = 'Peças' limit 1)
insert into public.comercial_produtos (organization_id, codigo, descricao, tipo_id, cultura_id)
select (select id from org), 'PECAS-DIVERSAS', 'Peças diversas', (select id from tp), null
where (select id from org) is not null and (select id from tp) is not null
on conflict (organization_id, codigo) do nothing;

with org as (select id from public.organizations where name = 'Marcher Brasil' limit 1)
insert into public.comercial_clientes (organization_id, codigo, descricao)
select (select id from org), 'CLIENTE-DIVERSO', 'Cliente diverso'
where (select id from org) is not null
on conflict (organization_id, codigo) do nothing;

-- ---------------------------------------------------------------------------
-- Coluna do tipo informado na staging.
-- ---------------------------------------------------------------------------
alter table public.comercial_realizado_import_rows
  add column if not exists tipo_informado text;

-- ---------------------------------------------------------------------------
-- Validacao/derivacao com o tipo informado como fonte de verdade do roteamento.
-- ---------------------------------------------------------------------------
create or replace function public.validate_comercial_realizado_import_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_rec     public.comercial_realizado_import_batches%rowtype;
  error_list    jsonb := '[]'::jsonb;
  norm_origem   text;
  norm_tipo     text;
  tipo_nome     text;   -- tipo canonico informado
  prod_tipo     text;   -- tipo do produto no cadastro (se existir)
  norm_prod     text;
  norm_cli      text;
  norm_terr     text;
  cultura_nome  text;
  linha_nome    text;
  generico_prod uuid;
  generico_cli  uuid;
  lookup_territorio_id uuid;
  atrib_rec     record;
begin
  select * into batch_rec from public.comercial_realizado_import_batches where id = new.batch_id;
  if not found then raise exception 'Lote de importacao nao encontrado'; end if;

  norm_origem := upper(nullif(btrim(new.origem), ''));
  norm_tipo   := lower(nullif(btrim(new.tipo_informado), ''));
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

  -- Valor sempre obrigatorio
  if new.valor is null then
    error_list := error_list || jsonb_build_array('Valor obrigatorio');
  end if;

  -- Tipo informado (obrigatorio): canonicaliza (aceita com/sem acento).
  tipo_nome := case
    when norm_tipo in ('peças', 'pecas', 'peca', 'peça') then 'Peças'
    when norm_tipo in ('máquinas', 'maquinas', 'maquina', 'máquina') then 'Máquinas'
    when norm_tipo in ('transgrain', 'transgrains') then 'Transgrain'
    when norm_tipo in ('acessórios', 'acessorios', 'acessorio', 'acessório') then 'Acessórios'
    else null
  end;
  if norm_tipo is null then
    error_list := error_list || jsonb_build_array('Tipo obrigatorio (Maquinas, Pecas, Transgrain ou Acessorios)');
  elsif tipo_nome is null then
    error_list := error_list || jsonb_build_array('Tipo invalido (use Maquinas, Pecas, Transgrain ou Acessorios)');
  end if;

  -- Produto: resolve id + tipo(cadastro) + cultura, se o codigo existir.
  if norm_prod is not null then
    select p.id, t.nome, c.nome
      into new.produto_id, prod_tipo, cultura_nome
    from public.comercial_produtos p
    join public.comercial_tipos t on t.id = p.tipo_id
    left join public.comercial_culturas c on c.id = p.cultura_id
    where p.organization_id = batch_rec.organization_id and p.codigo = norm_prod;
  end if;

  -- Regras de produto por tipo informado.
  if tipo_nome is not null then
    if new.produto_id is not null then
      if prod_tipo is distinct from tipo_nome then
        error_list := error_list || jsonb_build_array('Tipo informado (' || tipo_nome || ') diverge do cadastro do produto (' || coalesce(prod_tipo, '?') || ')');
      end if;
    elsif tipo_nome = 'Peças' then
      -- Autopreenche o generico "Pecas diversas"; guarda o codigo digitado.
      select id into generico_prod from public.comercial_produtos
      where organization_id = batch_rec.organization_id and codigo = 'PECAS-DIVERSAS';
      if generico_prod is null then
        error_list := error_list || jsonb_build_array('Produto generico de Pecas ausente (rodar seed da migration 049)');
      end if;
      new.produto_id := generico_prod;
      new.cod_produto := coalesce(norm_prod, 'PECAS-DIVERSAS');
      cultura_nome := null;
    elsif norm_prod is null then
      error_list := error_list || jsonb_build_array('Produto obrigatorio');
    else
      error_list := error_list || jsonb_build_array('Produto nao cadastrado');
    end if;
  end if;

  -- Cliente: resolve id se existir.
  if norm_cli is not null then
    select cl.id into new.cliente_id
    from public.comercial_clientes cl
    where cl.organization_id = batch_rec.organization_id and cl.codigo = norm_cli;
  end if;
  if tipo_nome = 'Peças' then
    if new.cliente_id is null then
      select id into generico_cli from public.comercial_clientes
      where organization_id = batch_rec.organization_id and codigo = 'CLIENTE-DIVERSO';
      if generico_cli is null then
        error_list := error_list || jsonb_build_array('Cliente generico ausente (rodar seed da migration 049)');
      end if;
      new.cliente_id := generico_cli;
      new.cod_cliente := coalesce(norm_cli, 'CLIENTE-DIVERSO');
    end if;
  elsif tipo_nome is not null then
    if norm_cli is null then
      error_list := error_list || jsonb_build_array('Cliente obrigatorio');
    elsif new.cliente_id is null then
      error_list := error_list || jsonb_build_array('Cliente nao cadastrado');
    end if;
  end if;

  -- Linha de negocio: derivada do TIPO informado (+ cultura do produto p/ Maquinas).
  if tipo_nome is not null then
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

  -- Quantidade: opcional para Pecas (so valor -> 0); obrigatoria para o resto.
  if linha_nome = 'Peças' then
    new.quantidade := coalesce(new.quantidade, 0);
  elsif new.quantidade is null then
    error_list := error_list || jsonb_build_array('Quantidade obrigatoria');
  end if;

  -- Territorio: obrigatorio p/ Maquinas (Grao/Pecuaria). Opcional p/ Pecas e Outros.
  if norm_terr is not null then
    select tr.id into new.territorio_id
    from public.comercial_territorios tr
    where tr.organization_id = batch_rec.organization_id and tr.nome = norm_terr;
    if new.territorio_id is null then
      error_list := error_list || jsonb_build_array('Territorio nao cadastrado: ' || norm_terr);
    end if;
  elsif linha_nome is not null and linha_nome not in ('Peças', 'Outros') then
    error_list := error_list || jsonb_build_array('Territorio obrigatorio (em branco so para Pecas/Transgrain/Acessorios)');
  end if;

  -- Coordenacao + responsavel:
  --   Grao/Pecuaria -> atribuicao por territorio; Pecas -> nacional (Jenifer);
  --   Outros -> nulos.
  if new.linha_negocio_id is not null and linha_nome <> 'Outros' then
    lookup_territorio_id := case when linha_nome = 'Peças' then null else new.territorio_id end;
    if new.entry_date is not null and (lookup_territorio_id is not null or linha_nome = 'Peças') then
      select ar.coordenacao_id, ar.responsavel into atrib_rec
      from public.comercial_atribuicao_responsavel ar
      where ar.organization_id = batch_rec.organization_id
        and ar.linha_negocio_id = new.linha_negocio_id
        and (ar.territorio_id is not distinct from lookup_territorio_id)
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
  end if;

  new.validation_errors := error_list;
  new.validation_status := case when jsonb_array_length(error_list) > 0 then 'error' else 'valid' end;

  if batch_rec.status = 'applied' and new.validation_status <> 'valid' then
    raise exception 'Lotes aplicados nao aceitam linhas invalidas';
  end if;

  return new;
end;
$$;

commit;
