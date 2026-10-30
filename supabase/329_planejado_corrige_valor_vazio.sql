-- Corrige a 326: a validacao da linha deixava `new.valor := coalesce(new.valor, 0)` (resto da 325), o que gravava 0 na linha da carga
-- e impedia o cenario de assumir o valor. Aqui a funcao fica como pretendido na 326: valor vazio continua vazio na linha (so Pecas exige valor)
-- e e assumido do cenario ao aplicar o lote; %MB idem. Mesma funcao, sem o trecho duplicado.
begin;

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

  -- Volume (quantidade): obrigatorio para tudo que nao seja Pecas. Pecas e digitada em R$ (FAT), entao la o VALOR e obrigatorio
  -- e a quantidade e opcional (default 0). Valor e %MB, quando vazios, sao assumidos do cenario de planejamento ao aplicar o lote.
  if tipo_nome = 'Peças' then
    new.quantidade := coalesce(new.quantidade, 0);
    if new.valor is null then
      error_list := error_list || jsonb_build_array('Valor obrigatorio para Pecas');
    end if;
  elsif new.quantidade is null then
    error_list := error_list || jsonb_build_array('Volume (quantidade) obrigatorio');
  end if;

  -- Territorio: obrigatorio para Maquinas (Grao/Pecuaria). OPCIONAL para Pecas
  -- (nacional) e para Transgrain/Acessorios ("Outros": guardado se vier).
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

  -- Coordenacao + responsavel (vigente no MES da linha):
  --   Grao/Pecuaria -> por territorio; Pecas -> nacional;
  --   Outros        -> coordenacao/responsavel nulos (soma no box por tipo).
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

commit;
