begin;

-- Ajuste na amarração de atribuição da carga de vendas realizadas (038):
--
-- PEÇAS roteia NACIONALMENTE. A atribuição de Peças é única (território nulo
-- -> Jenifer/coordenação Peças), mas a planilha traz um território em cada
-- linha de Peças. Antes, o lookup casava pelo território da linha e não
-- achava a atribuição nacional -> "Sem atribuição". Agora, para linha=Peças,
-- o roteamento ignora o território da linha (busca território nulo). O
-- territorio_id da linha continua gravado, só como referência.
--
-- ESCOPO da carga por enquanto: Máquinas (por regional, regra intacta) + Peças
-- (nacional/Jenifer). Transgrain e Acessórios NÃO são tratados ainda -> ficam
-- FORA (quantidade e valor), sem regra de roteamento. (Ver tratamento dessas
-- linhas na trigger / no arquivo — decisão à parte.)

-- ---------------------------------------------------------------------------
-- 1) Trigger de validação: Peças roteia nacional (só ela)
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
  lookup_territorio_id uuid;
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

  -- Coordenacao + responsavel: da atribuicao vigente na data.
  -- PECAS roteia nacionalmente (ignora o territorio da linha; busca territorio
  -- nulo). Grao/Pecuaria/Outros roteiam pelo territorio da linha. O territorio_id
  -- da linha e mantido gravado em qualquer caso (referencia).
  if new.linha_negocio_id is not null then
    lookup_territorio_id := case when linha_nome = 'Peças' then null else new.territorio_id end;

    if new.entry_date is not null
       and (lookup_territorio_id is not null or linha_nome = 'Peças') then
      select ar.coordenacao_id, ar.responsavel
        into atrib_rec
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

commit;
