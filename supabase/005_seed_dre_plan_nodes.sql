-- Estrutura inicial do Plano de DRE extraida da aba DRE Soc Real
begin;

do $$
declare
  v_org_id uuid;
  v_parent_id uuid;
  v_account_id uuid;
begin
  select id into v_org_id from public.organizations where name = 'Marcher Brasil' limit 1;
  if v_org_id is null then
    raise exception 'Organizacao Marcher Brasil nao encontrada';
  end if;

  v_parent_id := null;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '3', 'RECEITAS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  v_parent_id := null;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4', 'CUSTOS E DESPESAS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  v_parent_id := null;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '51401001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '51401001', 'RESULTADO DO EXERCICIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '3' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31', 'RECEITAS OPERACIONAIS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '41', 'CUSTOS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42', 'DESPESAS OPERACIONAIS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '311', 'RECEITA BRUTA DE VENDAS E SERVICOS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '312', '(-) DEDUCOES DA RECEITA BRUTA', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '313', 'OUTRAS RECEITAS OPERACIONAIS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '411', 'CUSTOS DIRETOS DE PRODUCAO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '412', 'CUSTO DO PRODUTO VENDIDO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '413', 'CUSTO DA MERCADORIA VENDIDA', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '421', 'DESPESAS COMERCIAIS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '422', 'DESPESAS ADMINISTRATIVAS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '311' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31101', 'RECEITA BRUTAS DE VENDAS E MERCADORIAS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '311' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31102', 'RECEITA DE PRESTACAO DE SERVICOS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '311' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31103', 'FRETES S/ VENDA OPERACIONAL', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '312' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31201', '(-) CANCELAMENTO E DEVOLUCOES', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '312' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31202', '(-) DESCONTOS INCONDICIONAIS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '312' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31203', '(-) IMPOSTOS SOBRE VENDAS E SERVICOS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '313' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31301', 'OUTRAS RECEITAS OPERACIONAIS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '411' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '41102', 'GGF - GASTOS GERAIS DE FABRICACAO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '411' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '41103', 'MAO DE OBRA - PRODUCAO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '411' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '41104', 'GGF - TRANSITORIA (-)', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '421' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42102', 'COMISSOES SOBRE VENDAS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '421' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42103', 'DESPESAS DE MARKETING', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '421' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42104', 'DESPESAS C/ASSIST.TEC E ENTREGA TEC.', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '421' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42105', 'DESPESAS DE FEIRAS E EVENTOS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '421' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106', 'DESPESAS COM VIAGENS E REPRESENTACOES', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '421' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42107', 'FRETES COMERCIAIS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '421' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42108', 'CUSTO NAO QUALIDADE (GARANTIA)', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '421' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42109', 'DESPESAS COM VENDAS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '421' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42110', 'DESPESAS TREINAMENTO IN HOUSE', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '422' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42202', 'MANUTENCAO E CONSERVACAO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '422' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42203', 'UTILIDADES', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '422' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42204', 'DESPESAS COM SERVICOS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '422' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42205', 'TI - TECNOLOGIA DA INFORMACAO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '422' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42206', 'TAXAS E SEGUROS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '422' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42207', 'OUTRAS DESPESAS - TRABALHISTAS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '422' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42208', 'ENERGIA', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '422' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42209', 'SERVICOS DE TERCEIROS - RH', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '422' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210', 'DESPESAS COM PESQUISA E DESENVOLVIMENTO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42301', 'DEPRECIACAO E AMORTIZACAO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42401', 'DESPESAS FINANCEIRAS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42402', 'RECEITAS FINANCEIRAS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42403', 'OUTRAS RECEITAS/DESPESAS ATF', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '43106', 'OUTRAS DESPESAS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '44101', 'OUTRAS DESPESAS OPERACIONAIS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '411021', 'GGF - VARIAVEL', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '411022', 'GGF - FIXO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '425001', 'PROVISOES DE IMPOSTOS S/ O LUCRO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '412' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4120100' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4120100', 'CUSTO DO PRODUTO VENDIDO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '412' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4120101' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4120101', 'CUSTOS NAO APROPRIADOS - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '412' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4120102' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4120102', 'INVENTARIO - AJUSTES DE ESTOQUES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '412' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4120103' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4120103', 'BAIXA DE SUCATA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '412' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4120104' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4120104', 'VALORIZACAO DE ESTOQUES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '412' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4120105' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4120105', 'INVENTARIO - PROVISOES DE ESTOQUE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '412' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4120106' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4120106', 'AJUSTE - EM TRANSITO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '412' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4120107' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4120107', 'CUSTOS - CORRECOES PROVISOES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '412' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4120108' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4120108', 'FRETES SOBRE COMPRAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '412' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4120109', 'CUSTO DO PRODUTO VENDIDO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '413' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4130100' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4130100', 'CUSTO DA MERCADORIA VENDIDA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '422' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100', 'DESPESAS COM PESSOAL', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31101001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31101001', 'RECEITA DE MAQUINAS - NACIONAL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31101002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31101002', 'RECEITA DE MAQUINAS - MERCADO EXTERNO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31101003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31101003', 'RECEITA DE PEÇAS - MERCADO EXTERNO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31101004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31101004', 'RECEITA DE TRANSGRAIN - MERCADO EXTERNO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31101005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31101005', '(-) IPI - RECEITAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31101006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31101006', 'RECEITA DE PEÇAS - NACIONAL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31101007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31101007', 'RECEITA DE TRANSGRAIN - NACIONAL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31102' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31102001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31102001', 'SERVICOS PRESTADOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31102' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31102002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31102002', 'RECEITAS DE ROYALTIES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31103001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31103001', 'FRETES S/ VENDAS MAQUINAS - NACIONAL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31103002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31103002', 'FRETES S/ VENDAS MAQUINAS - EXPORTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31103003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31103003', 'FRETES S/ VENDAS PECAS - NACIONAL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31103004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31103004', 'FRETES S/ VENDAS PECAS - EXPORTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31201' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31201001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31201001', '(-) DEVOLUCAO DE VENDA DE PRODUTOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31201' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31201002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31201002', '(-) DEV. VENDA DE PRODUTOS MERCADO EXT.', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31201' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31201003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31201003', '(-) DEVOLUCAO DE VENDA DE MERCADORIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31201' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31201004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31201004', '(-) DEV. VENDA DE MERCADORIAS MERC. EXT', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31202' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31202001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31202001', '(-) DESCONTO VENDA DE PRODUTOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31202' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31202002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31202002', '(-) DESCONTO VENDA DE PRODUTO MERC. EXT', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31202' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31202003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31202003', '(-) DESCONTO VENDA DE MERCADORIA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31202' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31202004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31202004', '(-) DESC. VENDA DE MERCADORIAS MERC. EXT', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31203001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31203001', '(-) IPI', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31203002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31203002', '(-) ICMS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31203003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31203003', '(-) ISS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31203004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31203004', '(-) COFINS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31203005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31203005', '(-) PIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31203009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31203009', '(-) SUBSTITUICAO TRIBUTARIA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '31203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '31203012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '31203012', '(-) INSS RECEITA BRUTA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '411021' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '41102101', 'GGF - MATERIAL DE SEGURANCA', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '411021' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '41102102', 'GGF - MATERIAL DE CONSUMO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '411021' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '41102103', 'GGF - ENERGIA', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '411021' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '41102104', 'GGF - SERVICOS DE TERCEIROS PRODUCAO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '411021' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '41102105', 'GGF - SERVICOS_SEGURANCA DO TRABALHO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '411022' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '41102203', 'GGF - MANUTENCAO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '411022' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '41102204', 'GGF - MANUTENCAO VEICULOS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '411022' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '41102205', 'GGF - ALUGUEIS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '411022' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '41102206', 'GGF-DEPRECIACAO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42102' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42102001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42102001', 'COMISSOES REPRESENTANTES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42102' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42102002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42102002', 'RESCISOES REPRESENTANTES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42102' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42102003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42102003', 'COMISSOES REVENDAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42102' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42102004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42102004', 'COMISSOES - DIVERSAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42102' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42102005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42102005', 'COMISSAO CAMPANHA COMERCIAL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42102' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42102006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42102006', 'PREMIACOES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42103001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42103001', 'MKT - PROPAGANDA E PUBLICIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42103002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42103002', 'MKT - REDES SOCIAIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42103003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42103003', 'MKT - ASSESSORIA IMPRENSA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42103004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42103004', 'MKT - MARCAS E PATENTES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42103005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42103005', 'MKT - PREMIOS E BRINDES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42103006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42103006', 'MKT - CONSULTORIA MARKETING', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42103007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42103007', 'MKT - DESPESAS DE EXPORTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42103008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42103008', 'MKT - MATERIAL PROMOCIONAL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42103009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42103009', 'MKT - DESPESAS ROTA PECUARIA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42103010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42103010', 'MKT - DESPESAS ROTA DO LEITE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42103011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42103011', 'MKT - DIA DE CAMPO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42104001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42104001', 'VIAGENS E ESTADIAS - ASSISTENCIA TECNICA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42104002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42104002', 'OUTRAS DESPESAS - ASSISTENCIA TECNICA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42104003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42104003', 'PEDAGIOS - ASSISTENCIA TECNICA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42104004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42104004', 'DESP. ALIMENTACAO - ASSIST.TECNICA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42104005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42104005', 'PASSAGENS AEREAS - ASSISTENCIA TECNICA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42104006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42104006', 'HOSPEDAGEM - ASSISTENCIA TECNICA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42104007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42104007', 'FRETES - ASSISTENCIA TECNICA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42104008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42104008', 'LOCACAO DE VEICULOS - ASSIST. TECNICA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42104009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42104009', 'CONDUCAO - ASSIST.TECNICA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42104010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42104010', 'COMBUSTIVEL - ASSIST.TECNICA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42104011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42104011', 'DESPESAS COM PROJETO UFLA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42104012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42104012', 'MULTAS DE TRANSITO - ASSISTENCIA TECNICA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42105' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42105001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42105001', 'FEIRAS E EVENTOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42105' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42105002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42105002', 'FEIRAS E EVENTOS - MATERIAL PROMOCIONAL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42105' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42105003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42105003', 'FEIRAS E EVENTOS - OUTRAS DESPESAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42105' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42105004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42105004', 'LOCACAO DE MOBILIARIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106001', 'PASSAGENS AEREAS - NACIONAL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106002', 'HOSPEDAGEM E ESTADIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106003', 'MANUTENCAO DE VEICULOS - COMERCIAL', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106007', 'MANUTENCAO DE VEICULOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106008', 'COMBUSTIVEL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106009', 'REFEICOES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106010', 'CONDUCAO - DESLOCAMENTO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106011', 'ESTACIONAMENTOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106012', 'HOSPEDAGEM HOTEIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106013' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106013', 'PEDAGIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106014' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106014', 'LOCACAO DE VEICULOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106015' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106015', 'TREINAMENTOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106016' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106016', 'PASSAGENS AEREAS INTERNACIONAL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106017' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106017', 'MULTAS DE TRANSITO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106018' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106018', 'LAVAGEM DE CARRO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42106019' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42106019', 'PCV - REEMBOLSOS DIVERSOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42107' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42107001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42107001', 'FRETES COMERCIAIS S/ REMESSA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42107' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42107002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42107002', 'FRETES S/ VENDAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42108' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42108001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42108001', 'CUSTO MATERIA PRIMA - ITENS DE GARANTIA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42108' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42108002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42108002', 'OUTROS CUSTOS COM NAO QUALIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42109' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42109001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42109001', 'ROYALTIES - DESPESA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42109' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42109002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42109002', 'COMEX', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42109' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42109003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42109003', 'OUTRAS DESPESAS COMERCIAIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42109' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42109004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42109004', 'BONIFICACOES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42109' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42109005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42109005', 'CONSULTORIAS - COMERCIAL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42109' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42109006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42109006', 'PDD', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42110' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42110001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42110001', 'PASSAGENS AEREAS - IN HOUSE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42110' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42110002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42110002', 'VIAGENS E ESTADIAS - IN HOUSE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42110' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42110003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42110003', 'CURSOS E TREINAMENTOS - IN HOUSE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42110' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42110004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42110004', 'OUTRAS DESPESAS - IN HOUSE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42110' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42110005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42110005', 'PEDAGIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42202' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42202001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42202001', 'MANUTENCAO E CONSERVACAO DE BENS - ADM.', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42202' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42202002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42202002', 'DESPESAS E MANUTENCAO DE VEICULOS - ADM.', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42202' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42202003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42202003', 'DESPESAS E MANUTENCAO DE BENS - ADM.', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42203001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42203001', 'LIMPEZA/HIGIENE/CAFE - ADM.', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42203002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42203002', 'DESPESAS POSTAIS CORREIOS E CARTORIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42203003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42203003', 'ASSOCIACOES E MENSALIDADES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42203004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42203004', 'PERIFERICOS DE INFORMATICA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42203005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42203005', 'CONFRATERNIZACOES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42203006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42203006', 'DESPESAS DIVERSAS/UTILIDADES - ADM.', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42203007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42203007', 'MATERIAL DE EXPEDIENTE - ADM.', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42203008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42203008', 'ENERGIA - ADMINISTRATIVO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42203009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42203009', 'AGUA E ESGOTO - ADMINISTRATIVO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42205' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42205001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42205001', 'SUPORTE PROTHEUS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42205' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42205002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42205002', 'TELEFONES E COMUNICACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42205' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42205003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42205003', 'LICENCAS E SOFTWARE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42205' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42205004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42205004', 'SUPORTE INFRA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42205' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42205005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42205005', 'SUPORTE TELEFONIA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42205' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42205006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42205006', 'IMPRESSOES - ADM', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42206' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42206001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42206001', 'IPTU', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42206' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42206002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42206002', 'SEGUROS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42206' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42206003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42206003', 'TAXAS DIVERSAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42206' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42206004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42206004', 'ICMS DIFAL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42206' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42206005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42206005', 'OUTROS DEBITOS DE ICMS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42206' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42206006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42206006', 'OUTROS CREDITOS DE ICMS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42206' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42206007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42206007', 'ASSOCIACOES E MENSALIDADES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42206' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42206008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42206008', 'IPVA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42206' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42206009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42206009', 'OUTROS DEBITOS DE IPI', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42206' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42206010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42206010', 'MULTAS DE TRANSITO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42207' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42207001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42207001', 'RECLAMATORIAS TRABALHISTAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42207' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42207002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42207002', 'PERICIAS TECNICAS TRABALHISTAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42208' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42208001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42208001', 'ENERGIA - ADMINISTRATIVO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42208' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42208002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42208002', 'AGUA E ESGOTO - ADMINISTRATIVO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42208' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42208003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42208003', 'TARIFAS BANCARIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42208' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42208004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42208004', 'IOF', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42208' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42208005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42208005', 'JUROS S/ CAPITAL PROPRIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42208' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42208006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42208006', 'DESCONTOS CONCEDIDOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42209' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42209001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42209001', 'ESTAGIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42209' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42209002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42209002', 'JOVEM APRENDIZ', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42209' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42209003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42209003', 'LIMPEZA TERCEIRIZADA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42209' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42209004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42209004', 'RECRUTAMENTO E SELECAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42209' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42209005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42209005', 'CONSULTORIAS - RH', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42209' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42209006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42209006', 'TREINAMENTOS - RH', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42209' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42209007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42209007', 'UNIFORMES - ADM', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42209' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42209008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42209008', 'PCMSO / ASO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42209' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42209009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42209009', 'PROVISAO CONTINGENCIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210100', 'DESPESAS-PESQUISA E DESENVOLVIMENTO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200', 'DESPESAS C/ PESSOAL-PESQUISA E DESENVOLV', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42301' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42301001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42301001', 'DEPRECIACAO ADM.', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42301' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42301002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42301002', 'AMORTIZACOES ADM.', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42401' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42401001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42401001', 'JUROS E MULTAS PAGAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42401' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42401002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42401002', 'DESPESAS BANCARIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42401' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42401003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42401003', 'TARIFAS BANCARIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42401' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42401004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42401004', 'IOF', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42401' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42401005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42401005', 'JUROS S/ CAPITAL PROPRIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42401' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42401006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42401006', 'DESCONTOS CONCEDIDOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42401' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42401007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42401007', 'VARIACAO CAMBIAL PASSIVA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42401' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42401008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42401008', 'JUROS S/ EMPRESTIMO GRIFFO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42401' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42401009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42401009', 'JUROS S/ EMPRESTIMO BRDE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42401' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42401010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42401010', 'JUROS S/IMPOSTOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42401' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42401011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42401011', 'MULTAS INDEDUTIVEIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42401' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42401012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42401012', 'JUROS SOBRE MUTUO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42402' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42402001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42402001', 'RECEITAS SOBRE APLICACOES FINANCEIRAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42402' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42402002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42402002', 'JUROS RECEBIDOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42402' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42402003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42402003', 'DESCONTOS OBTIDOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42402' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42402004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42402004', 'VARIACAO CAMBIAL ATIVA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42402' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42402005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42402005', 'SELIC S/RECUPERACAO DE IMPOSTOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42403' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42403001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42403001', 'VENDAS DO ATIVO FIXO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42403' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42403002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42403002', 'CUSTO DE VENDA IMOBILIZADO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '43106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '43106001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '43106001', 'PCLD', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '43106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '43106002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '43106002', 'PIS/COFINS s/ RECEITAS FINANCEIRAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '43106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '43106003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '43106003', 'PERDAS - BAIXAS DE SUCATAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '43106' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '43106004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '43106004', 'INVENTARIO - AJUSTES DE ESTOQUES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '44101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '44101001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '44101001', 'OUTRAS DESPESAS OPERACIONAIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '44101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '44101002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '44101002', 'PARTICIPACAO S/ RESULTADO DIRETORIA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '44101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '44101003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '44101003', 'PROCESSOS JUDICIAIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '44101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '44101004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '44101004', 'DOACOES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '44101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '44101005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '44101005', 'DESPESAS NÃO DEDUTÍVEIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '44101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '44101006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '44101006', 'DISPENDIOS INOVACAO TEC. LEI DO BEM', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '44101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '44101007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '44101007', '(-) DISPENDIOS INOVACAO TEC. LEI DO BEM', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4120109' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '412010901' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '412010901', 'CUSTO DO PRODUTO VENDIDO-M.PRIMA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4120109' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '412010902' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '412010902', 'CUSTO DO PRODUTO VENDIDO-FIXO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4120109' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '412010903' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '412010903', 'CUSTO DO PRODUTO VENDIDO-VARIAVEL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '425001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '425001001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '425001001', '(-) PROVISAO CSLL CORRENTE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '425001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '425001002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '425001002', '(-) PROVISAO IRPJ CORRENTE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '425001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '425001003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '425001003', '(-) PROVISAO CSLL DIFERIDA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '425001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '425001004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '425001004', '(-) PROVISAO IRPJ DIFERIDO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '313' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '3130300001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '3130300001', 'RECEITA DE VENDA DE ATIVO IMOBILIZADO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '313' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '3130300002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '3130300002', 'RECEITAS SOBRE APLICACOES FINANCEIRAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '313' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '3130300003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '3130300003', 'JUROS RECEBIDOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '313' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '3130300004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '3130300004', 'DESCONTOS OBTIDOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '313' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '3130300005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '3130300005', 'VARIACAO CAMBIAL ATIVA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '313' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '3130300006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '3130300006', 'RECEITAS DE BONIFICACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '313' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '3130300007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '3130300007', 'RECEITAS DIVERSAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '313' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '3130300008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '3130300008', 'OUTRAS RECEITAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '313' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '3130300009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '3130300009', 'AJUSTE DE BALANCO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '313' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '3130300010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '3130300010', 'RECEITAS AMOSTRAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '313' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '3130300011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '3130300011', 'RECUPERACAO CREDITOS TRIBUTARIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '313' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '3130300012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '3130300012', 'VENDA DE SUCATAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '313' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '3130300013' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '3130300013', 'RECUPERACAO CREDITOS NÃO TRIBUTADOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210101' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210101', 'MATERIAL DE CONSUMO - MAT. SEGURANCA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210102' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210102', 'UNIFORMES - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102101' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210103' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210103', 'HIGIENIZACAO DE EPIS - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102102' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210201' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210201', 'MATERIAL DE CONSUMO - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102102' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210202' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210202', 'MATERIAL DE CONSUMO - TINTAS/INFLAMAVEIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102102' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210203' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210203', 'MATERIAL DE CONSUMO - EMBALAGENS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102102' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210204' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210204', 'MATERIAL DE CONSUMO - FIXADORES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210301' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210301', 'AGUA E ESGOTO - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210302' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210302', 'DIESEL, GAS E LUBRIFICANTES - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210303' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210303', 'ENERGIA ELETRICA - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210304' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210304', '(-) ICMS ENERGIA ELETRICA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210305' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210305', '(-) CREDITO PIS ENERGIA ELETRICA-PROD.', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210306' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210306', '(-) CREDITO COFINS ENERGIA ELETRICA-PROD', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210401' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210401', 'MEIO AMBIENTE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210402' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210402', 'RESIDUOS - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210403' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210403', 'VIAGENS E ESTADIAS - APOIO PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210404' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210404', 'FRETES - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210405' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210405', 'SERV. MANUTENCAO E LIMPEZA / PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210406' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210406', 'CONSULTORIAS - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210407' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210407', 'PERIFERICOS DE INFORMATICA - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210408' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210408', 'BENS DE PEQUENO VALOR - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210409' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210409', 'CONFRATERNIZACOES - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210410' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210410', 'REFEIÇÕES E LANCHES - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210411' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210411', 'CONDUCAO - DESLOCAMENTO-PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210412' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210412', 'ESTACIONAMENTOS - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210413' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210413', 'LICENCAS E SOFTWARE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210414' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210414', 'DEMAIS SERVICOS - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210415' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210415', 'FRETE TRANSFERÊNCIA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210416' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210416', 'SEGURANÇA PATRIMONIAL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210417' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210417', 'SEGUROS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210418' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210418', 'SERVIÇOS DE TERCEIROS - PJ', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102105' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210501' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210501', 'CONSULTORIA - SEGURANCA DO TRABALHO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102105' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210502' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210502', 'PLACAS DE SINALIZACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102105' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210503' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210503', 'TREINAMENTOS - SEGURANCA DO TRABALHO / S', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102105' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110210504' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110210504', 'LAUDOS TECNICOS / SEGURANCA DO TRABALHO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110220301' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110220301', 'MANUTENCAO E CONSERVACAO DE BENS - PROD.', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110220302' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110220302', 'LIMPEZA/HIGIENE/CAFE - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110220303' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110220303', 'FERRAMENTAS - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110220304' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110220304', 'CALIBRACAO INSTRUMENTOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110220305' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110220305', 'MATERIAL DE EXPEDIENTE - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110220306' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110220306', 'CUSTO DE RETRABALHO - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110220307' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110220307', 'MULTA DE TRÂNSITO - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110220401' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110220401', 'MANUTENCAO DE VEICULOS - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102205' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110220501' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110220501', 'ALUGUEL MAQUINAS E EQUIPAMENTOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102205' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110220502' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110220502', 'ALUGUEL PRÉDIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102206' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110220601' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110220601', 'DEPRECIACAO - PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41102206' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110220602' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110220602', 'AMORTIZACAO PRODUCAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41103' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001', 'MOD_MAO DE OBRA DIRETA - PRODUCAO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41103' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002', 'MOI_MAO DE OBRA INDIRETA - PRODUCAO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41103' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003', 'MAO DE OBRA - DIRETA ALMOXARIFADO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41103' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004', 'MAO DE OBRA - DIRETA LIDERANCA PRODUCAO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41103' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300008', 'MAO DE OBRA - DIRETA LIDERANCA COMPRAS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001', 'RH ADMINISTRATIVAS', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002', 'RH - LIDERANCA ADMINISTRATIVO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003', 'RH - COMERCIAL', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004', 'RH - LIDERANCA COMERCIAL', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100005', 'RH - DIRETORIA', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100' limit 1;
  v_account_id := null;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100006', 'RH - CONSELHO', 'Sintetica', 1, 'estrutura') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42203' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220300010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220300010', 'BENS DE PEQUENO VALOR - ADM.', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400001', 'SEGURANCA PATRIMONIAL', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400002', 'ASSESSORIA CONTABIL E TRIBUTARIA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400003', 'AUDITORIA CONTABIL E TRIBUTARIA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400004', 'FRETES S/ MOTOBOY', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400005', 'ASSESSORIA JURIDICA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400006', 'DESPESAS POSTAIS CORREIOS E CARTORIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400008', 'SERASA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400009', 'AUDITORIA TRIBUTARIA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400012', 'CONSULTORIAS - ADMIN', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400013' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400013', 'PESQUISA E DESENVOLVIMENTO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400015' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400015', 'ESTACIONAMENTO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400016' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400016', 'COMBUSTIVEIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400017' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400017', 'PASSAGENS AEREAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400018' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400018', 'MEIO AMBIENTE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400019' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400019', 'DOACOES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400020' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400020', 'CONDUCAO - DESLOCAMENTO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400021' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400021', 'DESP.ALIMENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400022' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400022', 'HOSPEDAGEM DE HOTEIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400023' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400023', 'PEDAGIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400024' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400024', 'LOCACAO DE VEICULOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400025' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400025', 'COMBUSTIVEIS - ADM', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42204' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220400027' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220400027', 'ALUGUEL - ADM', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4221020026' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4221020026', 'P&D_PREMIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210100' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210100001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210100001', 'P&D_OUTRAS DESPESAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210100' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210100002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210100002', 'P&D_DESENVOLVIMENTO DE MANUAIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210100' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210100003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210100003', 'P&D_ TAXAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200001', 'P&D_SALARIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200002', 'P&D_HORAS EXTRAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200003', 'P&D_PREMIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200004', 'P&D_SERVICOS PROFISSIONAIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200005', 'P&D_FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200006', 'P&D_13 SALARIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200007', 'P&D_QUINQUENIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200008', 'P&D_ADICIONAL DE INSALUBRIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200009', 'P&D_ADICIONAL DE PERICULOSIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200010', 'P&D_FGTS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200011', 'P&D_INSS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200012', 'P&D_SINDICATO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200014' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200014', 'P&D_PLANO DE SAUDE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200015' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200015', 'P&D_VALE TRANSPORTE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200016' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200016', 'P&D_TRANSPORTES E VEICULOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200017' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200017', 'P&D_ALIMENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200018' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200018', 'P&D_(-) RECUPERACAO DE DESPESAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200019' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200019', 'P&D_PROVISAO DE 13', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200020' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200020', 'P&D_PROVISAO DE FGTS S/13', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200022' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200022', 'P&D_AUXILIO EDUCACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200023' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200023', 'P&D_INDENIZACOES E AVISOS PREVIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200024' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200024', 'P&D_ADICIONAL NOTURNO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200025' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200025', 'P&D_BOLSA ESTAGIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200026' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200026', 'P&D_PREMIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200027' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200027', 'P&D_BENEFICIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200031' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200031', 'P&D_PROVISAO DE FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200032' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200032', 'P&D_PROVISAO INSS S/13', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200033' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200033', 'P&D_PROVISAO FGTS S/FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42210200034' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42210200034', 'P&D_PROVISAO INSS S/FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '411030002028' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '411030002028', 'MOI_BENEFICIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41103' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '411030002029' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '411030002029', 'MOI_PREMIO EXCELENCIA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '422102000210' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '422102000210', 'P&D_INSALUBRIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '422102000211' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '422102000211', 'P&D_QUINQUENIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '42210200' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '422102000212' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '422102000212', 'P&D_ADICIONAL NOTURNO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001001', 'MOD_SALARIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001002', 'MOD_HORAS EXTRAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001003', 'MOD_PREMIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001004', 'MOD_SERVICOS PROFISSIONAIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001005', 'MOD_FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001006', 'MOD_13 SALARIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001007', 'MOD_QUINQUENIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001008', 'MOD_ADICIONAL DE INSALUBRIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001009', 'MOD_ADICIONAL DE PERICULOSIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001010', 'MOD_FGTS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001011', 'MOD_INSS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001012', 'MOD_SINDICATO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001013' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001013', 'UNIFORME', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001014' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001014', 'MOD_PLANO DE SAUDE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001015' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001015', 'MOD_VALE TRANSPORTE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001016' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001016', 'MOD_TRANSPORTES E VEICULOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001017' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001017', 'MOD_ALIMENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001018' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001018', 'MOD_(-) RECUPERACAO DE DESPESAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001019' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001019', 'MOD_PROVISAO DE 13', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001020' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001020', 'MOD_PROVISAO DE FGTS S/13', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001021' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001021', 'EPIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001022' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001022', 'MOD_AUXILIO EDUCACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001023' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001023', 'MOD_INDENIZACOES E AVISOS PREVIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001024' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001024', 'MOD_ADICIONAL NOTURNO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001025' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001025', 'MOD_BOLSA ESTAGIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001026' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001026', 'MOD_BENEFICIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001027' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001027', 'MOD_PREMIO EXCELENCIA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001028' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001028', 'MOD_PROVISAO DE FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001029' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001029', 'MOD_PROVISAO FGTS S/FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001030' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001030', 'MOD_PROVISAO DE INSS S/13', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300001031' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300001031', 'MOD_PROVISAO INSS S/FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002001', 'MOI_SALARIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002002', 'MOI_HORAS EXTRAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002003', 'MOI_PREMIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002004', 'MOI_SERVICOS PROFISSIONAIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002005', 'MOI_FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002006', 'MOI_13 SALARIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002007', 'MOI_QUINQUENIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002008', 'MOI_ADICIONAL DE INSALUBRIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002009', 'MOI_ADICIONAL DE PERICULOSIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002010', 'MOI_FGTS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002011', 'MOI_INSS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002012', 'MOI_SINDICATO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002013' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002013', 'MATERIAL DE SEGURANCA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002014' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002014', 'UNIFORME', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002015' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002015', 'EPIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002016' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002016', 'MOI_PLANO DE SAUDE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002017' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002017', 'MOI_VALE TRANSPORTE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002018' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002018', 'MOI_TRANSPORTES E VEICULOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002019' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002019', 'MOI_ALIMENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002020' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002020', 'MOI_(-) RECUPERACAO DE DESPESAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002021' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002021', 'MOI_PROVISAO DE 13', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002022' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002022', 'MOI_PROVISAO DE FGTS S/13', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002023' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002023', 'MOI_ADICIONAL NOTURNO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002024' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002024', 'MOI_AUXILIO EDUCACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002025' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002025', 'MOI_BOLSA ESTAGIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002026' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002026', 'MOI_INDENIZACOES E AVISOS PREVIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002027' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002027', 'INDENIZACAO E AVISO PREVIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002028' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002028', 'MOI_BENEFICIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002029' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002029', 'MOI_PREMIO EXCELENCIA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002030' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002030', 'MOI_PROVISAO DE FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002031' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002031', 'MOI_PROVISAO INSS S/13', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002032' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002032', 'MOI_PROVISAO FGTS S/FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300002033' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300002033', 'MOI_PROVISAO INSS S/FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003001', 'SALARIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003002', 'HORAS EXTRAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003003', 'PREMIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003004', 'SERVICOS PROFISSIONAIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003005', 'FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003006', '13 SALARIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003007', 'QUINQUENIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003008', 'ADICIONAL DE INSALUBRIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003009', 'ADICIONAL DE PERICULOSIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003010', 'FGTS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003011', 'INSS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003012', 'SINDICATO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003013' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003013', 'MATERIAL DE SEGURANCA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003014' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003014', 'UNIFORME', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003015' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003015', 'EPIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003016' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003016', 'PLANO DE SAUDE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003017' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003017', 'VALE TRANSPORTE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003018' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003018', 'TRANSPORTE E VEICULOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003019' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003019', 'ALIMENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003020' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003020', '(-)RECUPERACAO DE DESPESAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003021' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003021', 'PROVISAO DE 13 / FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003022' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003022', 'PROVISAO DE ENCARGOS S/ 13 / FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003023' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003023', 'ADICIONAL NOTURNO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300003024' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300003024', 'INDENIZACOES E AVISO PREVIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004001', 'SALARIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004002', 'HORAS EXTRAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004003', 'PREMIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004004', 'SERVICOS PROFISSIONAIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004005', 'FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004006', '13 SALARIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004007', 'QUINQUENIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004008', 'ADICIONAL DE INSALUBRIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004009', 'ADICIONAL DE PERICULOSIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004010', 'FGTS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004011', 'INSS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004012', 'SINDICATO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004013' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004013', 'MATERIAL DE SEGURANCA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004014' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004014', 'UNIFORME', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004015' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004015', 'EPIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004016' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004016', 'PLANO DE SAUDE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004017' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004017', 'VALE TRANSPORTE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004018' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004018', 'TRANSPORTE E VEICULOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004019' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004019', 'ALIMENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004020' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004020', '(-) RECUPERACAO DE DESPESAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004021' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004021', 'PROVISAO DE 13 SALARIO / FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4110300004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110300004022' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110300004022', 'PROVISAO DE ENCARGOS S/ 13 E FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '41104' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4110400001001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4110400001001', 'GGF - TRANSITORIA (-)', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001001', 'SALARIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001002', 'HORAS EXTRAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001003', 'PREMIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001004', 'SERVICOS PROFISSIONAIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001005', 'FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001006', '13 SALARIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001007', 'QUINQUENIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001008', 'ADICIONAL DE INSALUBRIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001009', 'ADICIONAL DE PERICULOSIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001010', 'FGTS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001011', 'INSS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001012', 'SINDICATO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001013' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001013', 'ADICIONAL NOTURNO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001014' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001014', 'COMISSOES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001015' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001015', 'PRO-LABORE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001016' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001016', 'PLANO DE SAUDE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001017' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001017', 'VALE TRANSPORTE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001018' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001018', 'TRANSPORTE E VEICULOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001019' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001019', 'ALIMENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001020' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001020', '(-) RECUPERACAO DE DESPESAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001021' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001021', 'PROVISAO DE 13', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001022' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001022', 'ADM_PROVISAO FGTS S/13º', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001023' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001023', 'INDENIZACOES E AVISOS PREVIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001024' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001024', 'AUXILIO EDUCACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001025' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001025', 'VERBA DE REPRESENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001026' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001026', 'PARTICIPACAO S/ RESULTADOS DIRETORIA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001027' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001027', 'ABONO FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001028' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001028', 'INSALUBRIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001029' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001029', 'QUINQUENIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001030' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001030', 'ADICIONAL NOTURNO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001031' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001031', 'BENEFICIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001032' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001032', 'AJUDA DE CUSTO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001033' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001033', 'PROVISAO DE FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001034' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001034', 'PROVISAO FGTS S/FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001035' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001035', 'PROVISAO INSS S/13', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100001' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100001036' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100001036', 'PROVISAO INSS S/FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002001', 'SALARIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002002', 'HORAS EXTRAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002003', 'PREMIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002004', 'SERVICOS PROFISSIONAIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002005', 'FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002006', 'QUINQUENIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002007', 'ADICIONAL DE INSALUBRIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002008', 'ADICIONAL DE PERICULOSIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002009', 'FGTS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002010', 'INSS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002011', 'SINDICATO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002012', 'MATERIAL DE SEGURANCA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002013' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002013', 'UNIFORME', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002014' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002014', 'EPIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002015' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002015', 'PLANO DE SAUDE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002016' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002016', 'VALE TRANSPORTE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002017' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002017', 'TRANSPORTE E VEICULOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002018' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002018', 'ALIMENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002019' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002019', '(-) RECUPERACAO DE DESPESAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002020' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002020', 'PROVISAO DE 13 / FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002021' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002021', 'PROVISAO DE ENCARGOS S/ 13 / FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100002' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100002022' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100002022', '13 SALARIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003001', 'SALARIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003002', 'HORAS EXTRAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003003', 'PREMIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003004', 'AJUDA DE CUSTO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003005', 'FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003006', '13 SALARIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003007', 'QUINQUENIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003008', 'ADICIONAL DE INSALUBRIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003009', 'ADICIONAL DE PERICULOSIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003010', 'FGTS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003011', 'INSS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003012', 'SINDICATO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003013' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003013', 'MATERIAL DE SEGURANCA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003014' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003014', 'UNIFORME', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003015' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003015', 'EPIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003016' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003016', 'PLANO DE SAUDE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003017' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003017', 'VALE TRANSPORTE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003018' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003018', 'TRANSPORTE E VEICULOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003019' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003019', 'ALIMENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003020' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003020', '(-) RECUPERACAO DE DESPESAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003021' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003021', 'PROVISAO DE 13', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003022' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003022', 'COM_PROVISAO FGTS S/FÉRIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003023' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003023', 'COMISSOES', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003024' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003024', 'ADICIONAL NOTURNO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003025' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003025', 'INDENIZACOES E AVISOS PREVIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003026' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003026', 'COM_AUXILIO EDUCACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003028' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003028', 'PROVISAO DE FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003029' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003029', 'PROVISAO INSS S/FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003030' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003030', 'PROVISAO FGTS S/13', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003031' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003031', 'PROVISAO INSS S/13', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100003' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100003032' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100003032', 'BENEFICIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004001', 'SALARIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004002', 'HORAS EXTRAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004003', 'PREMIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004004', 'SERVICOS PROFISSIONAIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004005', 'FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004006', '13 SALARIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004007', 'QUINQUENIO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004008', 'ADICIONAL DE INSALUBRIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004009', 'ADICIONAL DE PERICULOSIDADE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004010', 'FGTS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004011', 'INSS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004012', 'SINDICATO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004013' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004013', 'MATERIAL DE SEGURANCA', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004014' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004014', 'UNIFORME', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004015' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004015', 'EPIS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004016' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004016', 'PLANO DE SAUDE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004017' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004017', 'VALE TRANSPORTE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004018' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004018', 'TRANSPORTE E VEICULOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004019' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004019', '(-) RECUPERACAO DE DESPESAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004020' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004020', 'PROVISAO DE 13 / FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004021' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004021', 'PROVISAO DE ENCARGOS S/ 13 / FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100004' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100004022' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100004022', 'ALIMENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100005' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100005001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100005001', 'SALARIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100005' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100005002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100005002', 'PRO-LABORE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100005' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100005003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100005003', 'VERBA DE REPRESENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100005' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100005004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100005004', 'FGTS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100005' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100005005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100005005', 'INSS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100005' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100005006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100005006', 'PLANO DE SAUDE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100005' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100005007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100005007', 'ALIMENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100005' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100005008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100005008', '(-) RECUPERACAO DE DESPESAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100005' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100005009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100005009', 'PROVISAO DE 13/FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100005' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100005010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100005010', 'PROVISAO DE ENCARGOS S/ 13/ FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100005' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100005011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100005011', 'RECLAMATORIAS TRABALHISTAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100005' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100005012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100005012', 'TREINAMENTOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100006' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100006001' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100006001', 'SALARIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100006' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100006002' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100006002', 'PRO LABORE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100006' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100006003' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100006003', 'VERBA DE REPRESENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100006' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100006004' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100006004', 'FGTS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100006' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100006005' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100006005', 'INSS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100006' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100006006' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100006006', 'PLANO DE SAUDE', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100006' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100006007' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100006007', 'ALIMENTACAO', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100006' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100006008' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100006008', '(-) RECUPERACAO DE DESPESAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100006' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100006009' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100006009', 'PROVISAO DE 13 / FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100006' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100006010' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100006010', 'PROVISAO DE ENCARGOS S/ 13 / FERIAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100006' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100006011' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100006011', 'RECLAMATORIAS TRABALHISTAS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100006' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '4220100006012' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '4220100006012', 'TREINAMENTOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

  select id into v_parent_id from public.dre_plan_nodes where organization_id = v_org_id and node_code = '4220100' limit 1;
  select id into v_account_id from public.accounts where organization_id = v_org_id and account_number = '42201000001031' limit 1;
  insert into public.dre_plan_nodes (organization_id, account_id, parent_node_id, node_code, node_name, node_class, sort_order, origin) values (v_org_id, v_account_id, v_parent_id, '42201000001031', 'BENEFICIOS', 'Analitica', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set account_id = excluded.account_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, origin = excluded.origin;

end $$;

commit;
