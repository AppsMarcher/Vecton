begin;

-- O realizado dos relatórios comerciais é atribuído pelo código estável do
-- vendedor. A validação territorial do ledger continua disponível para
-- auditoria, mas não pode zerar vendas que já possuem cod_vendedor.
-- O nome é sempre exibido a partir do cadastro central atual; cargo e situação
-- continuam respeitando a vigência histórica usada pelo motor.
do $$
declare
  v_signature regprocedure;
  v_definition text;
begin
  v_signature := to_regprocedure(
    'public.comercial_report_execute(uuid,integer,integer,uuid,boolean)'
  );
  if v_signature is null then
    raise exception 'Função comercial_report_execute não encontrada. Aplique primeiro a migração 069.';
  end if;

  v_definition := pg_get_functiondef(v_signature);
  if position('l.campanha_status = ''valida''' in v_definition) = 0
     and position('l.cod_vendedor is not null' in v_definition) = 0 then
    raise exception 'Estrutura inesperada em comercial_report_execute; correção 071 não aplicada.';
  end if;

  v_definition := replace(
    v_definition,
    'l.campanha_status = ''valida''',
    'l.cod_vendedor is not null'
  );
  v_definition := replace(
    v_definition,
    'coalesce(pr.nome, v.nome, k.cod_vendedor)',
    'coalesce(v.nome, pr.nome, k.cod_vendedor)'
  );
  execute v_definition;

  v_signature := to_regprocedure(
    'public.comercial_report_movements(uuid,integer,integer,uuid,text)'
  );
  if v_signature is null then
    raise exception 'Função comercial_report_movements não encontrada. Aplique primeiro a migração 069.';
  end if;

  v_definition := pg_get_functiondef(v_signature);
  if position('l.campanha_status = ''valida''' in v_definition) = 0
     and position('l.cod_vendedor is not null' in v_definition) = 0 then
    raise exception 'Estrutura inesperada em comercial_report_movements; correção 071 não aplicada.';
  end if;

  v_definition := replace(
    v_definition,
    'l.campanha_status = ''valida''',
    'l.cod_vendedor is not null'
  );
  v_definition := replace(
    v_definition,
    'coalesce(h.nome, v.nome, l.cod_vendedor)',
    'coalesce(v.nome, h.nome, l.cod_vendedor)'
  );
  v_definition := replace(
    v_definition,
    'when l.campanha_status <> ''valida'' then ''Código sem atribuição válida''',
    'when l.cod_vendedor is null then ''Movimento sem código de vendedor'''
  );
  execute v_definition;
end;
$$;

commit;
