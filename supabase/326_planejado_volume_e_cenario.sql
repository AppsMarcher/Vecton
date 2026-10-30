-- Carga de vendas planejadas: VOLUME obrigatorio para tudo que nao seja Pecas (Pecas: valor obrigatorio).
-- Valor e %MB vazios na carga sao assumidos do cenario de planejamento (premissas e impostos do FAT); preenchidos, valem os da carga.
-- Substitui a regra da 325 (valor opcional, vira 0). A validacao da linha e a aplicacao do lote mudam; o resto segue como estava.
begin;

-- Valor e %MB assumidos do cenario de planejamento (premissas FAT/un e MP/un do FAT + impostos), quando a carga nao traz.
--  · quantidade x FAT/un = valor; RL = valor - impostos da linha (Exportacao: RL = valor); %MB = (RL - MP) / RL, MP = quantidade x MP/un.
--  · premissa da regiao (territorio) primeiro; sem ela, a media Marcher. Sem premissa nenhuma (ou destino sem FAT): nada a assumir.
--  · Pecas: o valor e sempre digitado; so o %MB e assumido (MP/FAT da premissa PECAS).
create or replace function public.comercial_planejado_assumir_cenario(p_org uuid,p_scenario uuid,p_produto uuid,p_territorio uuid,p_qtd numeric,p_valor numeric,p_mb numeric)
returns table(valor numeric,mb_pct numeric)
language plpgsql stable security definer set search_path=public as $$
declare m public.planning_fat_models;pr public.planning_fat_premises;tx public.planning_fat_taxes;rk text;fu numeric;mu numeric;v numeric;mp numeric;rl numeric;expo boolean:=false;
begin
 valor:=p_valor;mb_pct:=p_mb;
 if p_scenario is null or p_produto is null then return next;return;end if;
 select * into m from public.planning_fat_models x where x.scenario_id=p_scenario and p_produto=any(x.product_ids) limit 1;
 if not found then return next;return;end if;
 rk:=case when m.fat_driven then 'PECAS' else p_territorio::text end;
 if rk is not null then select * into pr from public.planning_fat_premises x where x.scenario_id=p_scenario and x.model_key=m.model_key and x.region_key=rk;end if;
 if pr.region_key is null then select * into pr from public.planning_fat_premises x where x.scenario_id=p_scenario and x.model_key=m.model_key and x.region_key='marcher';end if;
 if pr.region_key is null then return next;return;end if;
 fu:=coalesce(pr.adj_fat,pr.fat_unit);mu:=coalesce(pr.adj_mp,pr.mp_unit);
 select * into tx from public.planning_fat_taxes x where x.scenario_id=p_scenario
   and x.line=case m.group_name when 'Transgrain' then 'tra' when 'Acessórios' then 'ace' when 'Linhas complementares' then 'pec' else 'maq' end;
 if rk is not null and rk<>'PECAS' then
   expo:=exists(select 1 from public.planning_fat_model_coordination(p_org,p_scenario,rk,m.model_key) c where c.coordination_name='Exportação');
 end if;
 if m.fat_driven then v:=p_valor;mp:=coalesce(v,0)*mu;
 else v:=coalesce(p_valor,p_qtd*fu);mp:=coalesce(p_qtd,0)*mu;valor:=coalesce(p_valor,v);end if;
 if p_mb is null and coalesce(v,0)>0 then
   rl:=case when expo then v else v*(1-(coalesce(tx.ipi,0)+coalesce(tx.icms,0)+coalesce(tx.pis,0)+coalesce(tx.cofins,0))/100) end;
   if rl>0 then mb_pct:=round((rl-mp)/rl,6);end if;
 end if;
 return next;
end $$;
revoke all on function public.comercial_planejado_assumir_cenario(uuid,uuid,uuid,uuid,numeric,numeric,numeric) from public,anon,authenticated;

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

  -- Valor (R$) e OPCIONAL: a meta e de volume (default 0). Pecas e a excecao: la o FAT e digitado em R$, entao exige valor.
  if tipo_nome = 'Peças' and new.valor is null then
    error_list := error_list || jsonb_build_array('Valor obrigatorio para Pecas');
  end if;
  new.valor := coalesce(new.valor, 0);

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

create or replace function public.apply_comercial_planejado_import_batch(target_batch_id uuid)
returns public.comercial_planejado_import_batches
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  batch_rec public.comercial_planejado_import_batches%rowtype;
  previous_batch_id uuid;
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
    r.cod_produto, r.quantidade, coalesce(d.valor, 0), d.mb_pct, batch_rec.source_type, auth.uid(), auth.uid()
  from public.comercial_planejado_import_rows r
  cross join lateral public.comercial_planejado_assumir_cenario(batch_rec.organization_id, batch_rec.scenario_id, r.produto_id, r.territorio_id, r.quantidade, r.valor, r.mb_pct) d
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

  if batch_rec.load_mode = 'complete' then
    for previous_batch_id in
      select b.id
      from public.comercial_planejado_import_batches b
      where b.organization_id = batch_rec.organization_id
        and b.scenario_id is not distinct from batch_rec.scenario_id
        and b.status = 'applied'
        and b.id <> target_batch_id
        and not exists (
          select 1
          from public.comercial_planejado_import_rows r
          join public.comercial_planejado_ledger_entries l on l.batch_row_id = r.id
          where r.batch_id = b.id
        )
    loop
      delete from public.comercial_planejado_import_batches where id = previous_batch_id;
      delete from public.comercial_planejado_ledger_audit where batch_id = previous_batch_id;
      delete from public.comercial_planejado_row_audit where batch_id = previous_batch_id;
      delete from public.comercial_planejado_batch_audit where batch_id = previous_batch_id;
    end loop;
  end if;

  return batch_rec;
end;
$function$;

-- Edicao de linha num lote ja aplicado: o razao tambem assume valor e %MB do cenario quando a linha nao traz.
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
      select
        batch_rec.organization_id, batch_rec.scenario_id, new.batch_id, new.id, batch_rec.reference_year, coalesce(new.reference_month, batch_rec.reference_month),
        new.produto_id, new.territorio_id, new.linha_negocio_id, new.coordenacao_id, new.responsavel,
        new.cod_produto, new.quantidade, coalesce(d.valor, 0), d.mb_pct, batch_rec.source_type, auth.uid(), auth.uid()
      from public.comercial_planejado_assumir_cenario(batch_rec.organization_id, batch_rec.scenario_id, new.produto_id, new.territorio_id, new.quantidade, new.valor, new.mb_pct) d
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

commit;
