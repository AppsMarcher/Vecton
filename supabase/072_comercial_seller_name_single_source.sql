begin;

-- Lei de exibição: comercial_vendedores.nome é a única fonte oficial do nome.
-- Código identifica a pessoa; nome não é dimensão histórica. Cargo e situação
-- continuam versionados normalmente em comercial_vendedor_vigencias.

create or replace function public.comercial_current_seller_name(
  p_organization_id uuid,
  p_cod_vendedor text,
  p_fallback text default null
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select v.nome
      from public.comercial_vendedores v
      where v.organization_id = p_organization_id
        and v.codigo = p_cod_vendedor
      limit 1
    ),
    p_fallback,
    p_cod_vendedor
  );
$$;

create or replace function public.comercial_current_seller_name_for_assignment(
  p_organization_id uuid,
  p_territorio_id uuid,
  p_linha_negocio_id uuid,
  p_reference_date date,
  p_fallback text default null
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select v.nome
      from public.comercial_atribuicao_responsavel ar
      join public.comercial_vendedores v
        on v.organization_id = ar.organization_id
       and v.codigo = ar.cod_vendedor
      where ar.organization_id = p_organization_id
        and ar.territorio_id is not distinct from p_territorio_id
        and ar.linha_negocio_id = p_linha_negocio_id
        and p_reference_date >= ar.data_inicio
        and (ar.data_fim is null or p_reference_date <= ar.data_fim)
      order by ar.data_inicio desc
      limit 1
    ),
    p_fallback
  );
$$;

-- Reescreve recursivamente qualquer payload/snapshot que contenha
-- { cod_vendedor, nome }, inclusive rankings, gráficos, linhas e exportações.
create or replace function public.comercial_apply_current_seller_names(
  p_organization_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_name text;
begin
  if p_payload is null then return null; end if;

  if jsonb_typeof(p_payload) = 'array' then
    select coalesce(
      jsonb_agg(public.comercial_apply_current_seller_names(p_organization_id, item)),
      '[]'::jsonb
    )
    into v_result
    from jsonb_array_elements(p_payload) as items(item);
    return v_result;
  end if;

  if jsonb_typeof(p_payload) = 'object' then
    select coalesce(
      jsonb_object_agg(key, public.comercial_apply_current_seller_names(p_organization_id, value)),
      '{}'::jsonb
    )
    into v_result
    from jsonb_each(p_payload);

    if v_result ? 'cod_vendedor' and nullif(v_result ->> 'cod_vendedor', '') is not null then
      select public.comercial_current_seller_name(
        p_organization_id,
        v_result ->> 'cod_vendedor',
        v_result ->> 'nome'
      ) into v_name;
      if v_name is not null then
        v_result := jsonb_set(v_result, '{nome}', to_jsonb(v_name), true);
      end if;
    end if;
    return v_result;
  end if;

  return p_payload;
end;
$$;

-- Nome é propagado como atributo de apresentação. Somente alterações de
-- cargo/situação abrem uma nova vigência.
create or replace function public.sync_comercial_vendedor_vigencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  atual public.comercial_vendedor_vigencias%rowtype;
begin
  if tg_op = 'UPDATE' then
    if old.nome is distinct from new.nome then
      update public.comercial_vendedor_vigencias
      set nome = new.nome, updated_at = now()
      where organization_id = new.organization_id
        and cod_vendedor = new.codigo
        and nome is distinct from new.nome;

      update public.comercial_atribuicao_responsavel
      set responsavel = new.nome, updated_at = now()
      where organization_id = new.organization_id
        and cod_vendedor = new.codigo
        and responsavel is distinct from new.nome;

      update public.comercial_report_runs
      set result_snapshot = public.comercial_apply_current_seller_names(
        new.organization_id,
        result_snapshot
      ),
          result_hash = md5(public.comercial_apply_current_seller_names(
            new.organization_id,
            result_snapshot
          )::text)
      where organization_id = new.organization_id
        and result_snapshot is not null;
    end if;
  end if;

  select * into atual
  from public.comercial_vendedor_vigencias
  where organization_id = new.organization_id
    and cod_vendedor = new.codigo
    and data_fim is null
  order by data_inicio desc
  limit 1;

  if not found then
    insert into public.comercial_vendedor_vigencias (
      organization_id, cod_vendedor, nome, cargo, situacao, data_inicio, created_by
    ) values (
      new.organization_id, new.codigo, new.nome, new.cargo, new.situacao,
      current_date, auth.uid()
    );
    return new;
  end if;

  if atual.cargo = new.cargo and atual.situacao = new.situacao then
    return new;
  end if;

  if atual.data_inicio = current_date then
    update public.comercial_vendedor_vigencias
    set nome = new.nome,
        cargo = new.cargo,
        situacao = new.situacao,
        updated_at = now()
    where id = atual.id;
  else
    update public.comercial_vendedor_vigencias
    set data_fim = current_date - 1,
        updated_at = now()
    where id = atual.id;

    insert into public.comercial_vendedor_vigencias (
      organization_id, cod_vendedor, nome, cargo, situacao, data_inicio, created_by
    ) values (
      new.organization_id, new.codigo, new.nome, new.cargo, new.situacao,
      current_date, auth.uid()
    );
  end if;
  return new;
end;
$$;

-- Corrige todas as cópias de apresentação existentes sem alterar fatos.
update public.comercial_vendedor_vigencias h
set nome = v.nome, updated_at = now()
from public.comercial_vendedores v
where v.organization_id = h.organization_id
  and v.codigo = h.cod_vendedor
  and h.nome is distinct from v.nome;

update public.comercial_atribuicao_responsavel ar
set responsavel = v.nome, updated_at = now()
from public.comercial_vendedores v
where v.organization_id = ar.organization_id
  and v.codigo = ar.cod_vendedor
  and ar.responsavel is distinct from v.nome;

update public.comercial_report_runs r
set result_snapshot = public.comercial_apply_current_seller_names(
  r.organization_id,
  r.result_snapshot
),
    result_hash = md5(public.comercial_apply_current_seller_names(
      r.organization_id,
      r.result_snapshot
    )::text)
where r.result_snapshot is not null;

-- A equipe de qualquer relatório sempre mostra o nome atual do cadastro.
create or replace function public.comercial_report_team(
  p_report_id uuid,
  p_year integer,
  p_month integer
)
returns table(
  cod_vendedor text,
  nome text,
  cargo text,
  situacao text,
  data_inicio date,
  data_fim date,
  vigente boolean,
  selected boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report public.comercial_report_definitions%rowtype;
  v_version public.comercial_report_versions%rowtype;
  v_start date;
  v_end date;
begin
  select * into v_report from public.comercial_report_definitions where id = p_report_id;
  if not found or not public.is_org_member(v_report.organization_id) then
    raise exception 'Relatorio comercial indisponivel';
  end if;
  select * into v_version from public.comercial_report_versions
  where report_id = v_report.id and version_number = v_report.current_version;

  v_start := case when v_report.modalidade = 'monthly'
    then make_date(p_year, p_month, 1) else make_date(p_year, 1, 1) end;
  v_end := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;

  return query
  select h.cod_vendedor, coalesce(v.nome, h.nome), h.cargo, h.situacao,
    h.data_inicio, h.data_fim,
    h.data_inicio <= v_end and (h.data_fim is null or h.data_fim >= v_start),
    exists (
      select 1 from public.comercial_report_version_participants p
      where p.report_version_id = v_version.id
        and p.cod_vendedor = h.cod_vendedor
    )
  from public.comercial_vendedor_vigencias h
  left join public.comercial_vendedores v
    on v.organization_id = h.organization_id
   and v.codigo = h.cod_vendedor
  where h.organization_id = v_report.organization_id
    and h.data_inicio <= v_end
  order by coalesce(v.nome, h.nome), h.data_inicio desc;
end;
$$;

-- Extratos legados também resolvem o nome pelo código, nunca pelo snapshot.
create or replace function public.comercial_bateu_levou_extrato(
  p_org uuid, p_year integer, p_month integer, p_linha text
)
returns table(
  responsavel text, territorio text, cod_cliente text, cliente text,
  cidade text, uf text, cod_produto text, produto text,
  quantidade numeric, valor numeric, mb_pct numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_org_member(p_org) then raise exception 'Usuario sem acesso a organizacao'; end if;
  return query
  select public.comercial_current_seller_name(p_org, le.cod_vendedor, le.responsavel),
    tr.nome, le.cod_cliente, cl.descricao, cl.cidade, cl.uf,
    le.cod_produto, pr.descricao, le.quantidade, le.valor, le.mb_pct
  from public.comercial_realizado_ledger_entries le
  join public.comercial_linhas_negocio ln on ln.id = le.linha_negocio_id
  join public.comercial_atribuicao_responsavel ar on ar.id = le.campanha_atribuicao_id
  left join public.comercial_territorios tr on tr.id = le.territorio_id
  left join public.comercial_clientes cl on cl.id = le.cliente_id
  left join public.comercial_produtos pr on pr.id = le.produto_id
  where le.organization_id = p_org
    and le.reference_year = p_year and le.reference_month = p_month
    and le.origem = 'FAT' and le.campanha_status = 'valida'
    and ln.nome = p_linha and le.cod_vendedor is not null
    and coalesce(ar.elegivel_campanha, true)
  order by le.valor desc nulls last;
end;
$$;

create or replace function public.comercial_final_de_ano_extrato(
  p_org uuid, p_year integer, p_month integer
)
returns table(
  responsavel text, territorio text, cod_cliente text, cliente text,
  cidade text, uf text, cod_produto text, produto text,
  quantidade numeric, valor numeric, mb_pct numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_org_member(p_org) then raise exception 'Usuario sem acesso a organizacao'; end if;
  return query
  select public.comercial_current_seller_name(p_org, le.cod_vendedor, le.responsavel),
    tr.nome, le.cod_cliente, cl.descricao, cl.cidade, cl.uf,
    le.cod_produto, pr.descricao, le.quantidade, le.valor, le.mb_pct
  from public.comercial_realizado_ledger_entries le
  left join public.comercial_territorios tr on tr.id = le.territorio_id
  left join public.comercial_clientes cl on cl.id = le.cliente_id
  left join public.comercial_produtos pr on pr.id = le.produto_id
  where le.organization_id = p_org
    and le.reference_year = p_year and le.reference_month <= p_month
    and le.origem = 'FAT' and le.cod_vendedor is not null
    and le.cod_vendedor <> '000633'
  order by le.valor desc nulls last;
end;
$$;

-- Garante nome atual inclusive na leitura de snapshots fechados e movimentos.
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_original text;
  v_old text := 'coalesce(fat.responsavel, cart.responsavel, meta.responsavel, y1.responsavel, y2.responsavel, y3.responsavel, atrib.responsavel, sl.responsavel)';
  v_new text := 'public.comercial_current_seller_name_for_assignment(p_org, k.territorio_id, k.linha_negocio_id, make_date(p_year, v_hi, 1), coalesce(fat.responsavel, cart.responsavel, meta.responsavel, y1.responsavel, y2.responsavel, y3.responsavel, atrib.responsavel, sl.responsavel))';
begin
  v_signature := to_regprocedure('public.comercial_report_execute(uuid,integer,integer,uuid,boolean)');
  if v_signature is null then raise exception 'comercial_report_execute não encontrada'; end if;
  v_definition := pg_get_functiondef(v_signature);
  v_original := v_definition;
  v_definition := replace(v_definition, 'l.campanha_status = ''valida''', 'l.cod_vendedor is not null');
  v_definition := replace(v_definition, 'coalesce(pr.nome, v.nome, k.cod_vendedor)', 'coalesce(v.nome, pr.nome, k.cod_vendedor)');
  if position('public.comercial_apply_current_seller_names' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      'return v_payload;',
      'return public.comercial_apply_current_seller_names(v_report.organization_id, v_payload);'
    );
  end if;
  if v_definition is distinct from v_original then
    execute v_definition;
  end if;

  v_signature := to_regprocedure('public.comercial_report_movements(uuid,integer,integer,uuid,text)');
  if v_signature is null then raise exception 'comercial_report_movements não encontrada'; end if;
  v_definition := pg_get_functiondef(v_signature);
  v_original := v_definition;
  v_definition := replace(v_definition, 'l.campanha_status = ''valida''', 'l.cod_vendedor is not null');
  v_definition := replace(v_definition, 'coalesce(h.nome, v.nome, l.cod_vendedor)', 'coalesce(v.nome, h.nome, l.cod_vendedor)');
  v_definition := replace(
    v_definition,
    'when l.campanha_status <> ''valida'' then ''Código sem atribuição válida''',
    'when l.cod_vendedor is null then ''Movimento sem código de vendedor'''
  );
  if position('public.comercial_apply_current_seller_names' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      'return v_result;',
      'return public.comercial_apply_current_seller_names(v_report.organization_id, v_result);'
    );
  end if;
  if v_definition is distinct from v_original then
    execute v_definition;
  end if;

  v_signature := to_regprocedure('public.comercial_painel_vendas(uuid,integer,integer,text,uuid)');
  if v_signature is not null then
    v_definition := pg_get_functiondef(v_signature);
    if position(v_new in v_definition) = 0 then
      if position(v_old in v_definition) = 0 then
        raise exception 'Estrutura inesperada em comercial_painel_vendas';
      end if;
      v_definition := replace(v_definition, v_old, v_new);
      execute v_definition;
    end if;
  end if;
end;
$$;

revoke all on function public.comercial_current_seller_name(uuid, text, text) from public;
revoke all on function public.comercial_current_seller_name_for_assignment(uuid, uuid, uuid, date, text) from public;
revoke all on function public.comercial_apply_current_seller_names(uuid, jsonb) from public;
grant execute on function public.comercial_report_team(uuid, integer, integer) to authenticated;
grant execute on function public.comercial_bateu_levou_extrato(uuid, integer, integer, text) to authenticated;
grant execute on function public.comercial_final_de_ano_extrato(uuid, integer, integer) to authenticated;

commit;
