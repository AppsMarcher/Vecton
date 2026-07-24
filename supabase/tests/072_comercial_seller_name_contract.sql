-- Contrato: o nome oficial do Time Comercial deve prevalecer em todos os
-- relatórios, vigências, atribuições e snapshots publicados.
do $$
declare
  v_definition text;
begin
  if exists (
    select 1
    from public.comercial_vendedor_vigencias h
    join public.comercial_vendedores v
      on v.organization_id = h.organization_id and v.codigo = h.cod_vendedor
    where h.nome is distinct from v.nome
  ) then
    raise exception 'Contrato violado: vigência contém nome diferente do Time Comercial';
  end if;

  if exists (
    select 1
    from public.comercial_atribuicao_responsavel ar
    join public.comercial_vendedores v
      on v.organization_id = ar.organization_id and v.codigo = ar.cod_vendedor
    where ar.responsavel is distinct from v.nome
  ) then
    raise exception 'Contrato violado: atribuição contém nome diferente do Time Comercial';
  end if;

  if exists (
    select 1
    from public.comercial_report_runs r
    where r.result_snapshot is distinct from
      public.comercial_apply_current_seller_names(r.organization_id, r.result_snapshot)
       or r.result_hash is distinct from md5(r.result_snapshot::text)
  ) then
    raise exception 'Contrato violado: snapshot publicado contém nome ou hash desatualizado';
  end if;

  v_definition := pg_get_functiondef(
    'public.comercial_report_execute(uuid,integer,integer,uuid,boolean)'::regprocedure
  );
  if position('public.comercial_apply_current_seller_names' in v_definition) = 0 then
    raise exception 'Contrato violado: motor dinâmico não normaliza nomes';
  end if;

  v_definition := pg_get_functiondef(
    'public.comercial_report_movements(uuid,integer,integer,uuid,text)'::regprocedure
  );
  if position('public.comercial_apply_current_seller_names' in v_definition) = 0 then
    raise exception 'Contrato violado: extrato dinâmico não normaliza nomes';
  end if;

  if to_regprocedure('public.comercial_painel_vendas(uuid,integer,integer,text,uuid)') is not null then
    v_definition := pg_get_functiondef(
      'public.comercial_painel_vendas(uuid,integer,integer,text,uuid)'::regprocedure
    );
    if position('public.comercial_current_seller_name_for_assignment' in v_definition) = 0 then
      raise exception 'Contrato violado: Painel de Vendas não usa o nome central';
    end if;
  end if;
end;
$$;
