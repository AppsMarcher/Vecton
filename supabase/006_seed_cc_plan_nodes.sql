-- Estrutura inicial do Plano de CCs extraida da planilha CCs.xlsx
begin;

do $$
declare
  v_org_id uuid;
  v_parent_id uuid;
  v_cost_center_id uuid;
begin
  select id into v_org_id from public.organizations where name = 'Marcher Brasil' limit 1;
  if v_org_id is null then
    raise exception 'Organizacao Marcher Brasil nao encontrada';
  end if;

  v_parent_id := null;
  v_cost_center_id := null;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, 'ADM', 'ADMINISTRATIVO', 'Sintetica', 'ADM', 1, 'structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  v_parent_id := null;
  v_cost_center_id := null;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, 'COM', 'COMERCIAL', 'Sintetica', 'COM', 1, 'structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  v_parent_id := null;
  v_cost_center_id := null;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, 'MOD', 'MAO DE OBRA DIRETA', 'Sintetica', 'MOD', 1, 'structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  v_parent_id := null;
  v_cost_center_id := null;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, 'MOI', 'MAO DE OBRA INDIRETA', 'Sintetica', 'MOI', 1, 'structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10001' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10001', 'DIRETORIA', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10002' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10002', 'CONSELHO', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10003' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10003', 'TECNOLOGIA DA INFORMACAO', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10004' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10004', 'CONTABILIDADE', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10005' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10005', 'ADM FINANCEIRO', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10006' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10006', 'RECURSOS HUMANOS', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10007' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10007', 'LIDERANCA ADMINISTRATIVA', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10008' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10008', 'CONTROLADORIA', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10009' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10009', 'SEGURANCA DO TRABALHO  - SST', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10010' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10010', 'MANUTENCAO PREDIAL - 5S', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10011' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10011', 'ADMINISTRATIVO - PROJETO FENIX', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10110' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10110', 'ENGENHARIA-PESQUISA E DESENVOLVIMENTO', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10113' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10113', 'LIDERANCA-P&D', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10114' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10114', 'IN900 AUTOPROPELIDA', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10115' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10115', 'EXTRATORA DE SILAGEM', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10116' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10116', 'EXTRATORA DE GRAOS DE BAIXO CUSTO', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10117' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10117', 'TECHPACK – FREIO AUTOMATICO', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10118' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10118', 'TECHPACK – MONITORAMENTO DE VAZAO', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10119' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10119', 'INOVACAO 3 – TBD', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10120' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10120', 'NACIONALIZACAO QUEBRADORES IN90/IN65', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10121' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10121', 'CHUPIM ABASTECIMENTO IN90', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10122' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10122', 'MELHORIAS IN90 – REIDRATACAO/INOCULACAO', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10123' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10123', 'NOVA MOEGA IN90', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10124' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10124', 'CARRETA GRANELEIRA – FASE 1', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10125' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10125', 'REMODELACAO ESTEIRA LATERAL IN60', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10126' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10126', 'TRANSGRAIN OUT220', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10127' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10127', 'LAYOUT/IN110+IN100', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10128' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10128', 'CJ MONT INGRAIN 60', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10129' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10129', 'CJ MONT OUTGRAIN 215 VERSAO 2019', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10130' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10130', 'CJ MONT INGRAIN160 VERSAO 2019', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10131' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10131', 'MOEDOR DE GRAOS IN90', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10132' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10132', 'CARRETA GRANELEIRA 11MIL LITROS', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10133' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10133', 'SISTEMA PRÉ LIMPEZA', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10134' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10134', 'REDUCAO CUSTO IN160', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10135' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10135', 'NOVA OUTGRAIN220 Fase I', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10136' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10136', 'NOVA OUT 215', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10137' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10137', 'MELHORIAS IN100 FASE I e II', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10138' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10138', 'INGRAIN 180 MOTORIZADA', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10139' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10139', 'EQUIPAMENTOS PEQUENAS PROPRIEDADES', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10140' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10140', 'MANFED PROTEÇÃO BOLSAS', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10141' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10141', 'PEQUENAS PROPRIEDADES PECUÁRIA', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10142' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10142', 'IN180 URUGUAI', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10500' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10500', 'GESTAO DE PRODUTO', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10501' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10501', 'PROJETO UFLA', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'ADM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '10502' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '10502', 'PROJETO TX', 'Analitica', 'ADM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20001' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20001', 'COMERCIAL', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20002' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20002', 'POS VENDA', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20003' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20003', 'GARANTIA GRAOS', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20004' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20004', 'ENTREGA TECNICA GRAOS', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20005' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20005', 'ASSISTENCIA TECNICA GRAOS', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20006' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20006', 'EXPORTACAO', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20007' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20007', 'LIDERANCA COMERCIAL', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20008' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20008', 'MARKETING', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20009' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20009', 'MKT - ROTA PECUARIA', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20010' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20010', 'TREINAMENTO IN HOUSE', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20011' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20011', 'COMERCIAL PECAS', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20012' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20012', 'MKT - ROTA DO LEITE', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20013' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20013', 'MKT - CONVENCAO COMERCIAL', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20014' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20014', 'COMERCIAL REGIAO NORTE', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20015' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20015', 'COMERCIAL REGIAO SUL', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20016' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20016', 'MKT - EVENTO CONFINAR', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20017' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20017', 'COMERCIAL REGIAO MT / RO', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20018' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20018', 'GARANTIA PECUARIA', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20019' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20019', 'ENTREGAS TECNICA PECUARIA', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20020' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20020', 'ASSISTENCIA TECNICA PECUARIA', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20100' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20100', 'FEIRAS NACIONAIS', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20101' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20101', 'FEIRA-SHOW RURAL COOPAVEL / CASCAVEL', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20102' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20102', 'FEIRA-EXPODIRETO / NAO ME TOQUE', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20103' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20103', 'FEIRA-TECNOSHOW / RIO VERDE', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20104' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20104', 'FEIRA-AGRISHOW / RIBEIRAO PRETO', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20105' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20105', 'FEIRA-AGROBRASILIA', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20106' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20106', 'FEIRA-AGROLEITE / CASTRO', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20107' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20107', 'FEIRA-EXPOINTER / ESTEIO', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20108' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20108', 'FEIRA-SHOW SAFRA / LUCAS DO RIO VERDE', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20109' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20109', 'FEIRA-EXPOZEBU / UBERABA', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20110' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20110', 'FEIRA-SHOWTEC / MARACAJU', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20111' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20111', 'FEMEC', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20200' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20200', 'FEIRAS INTERNACIONAIS', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20201' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20201', 'FEIRA-EXPO AGRO / SAN NICOLAS', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20202' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20202', 'FEIRA-AGRO ACTIVA / ARMSTRONG', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20203' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20203', 'FEIRA-EXPO PRADO / MONTEVIDEO', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20204' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20204', 'FEIRA-FARM PROGRESS / DECATUR IL USA', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20205' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20205', 'FEIRA-AGRITECHNICA / HANNOVER GERMANY', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20206' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20206', 'EVENTO SIMPEC', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20207' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20207', 'EVENTO FEEDLOT SUMMIT', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20208' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20208', 'FEIRA – ABERTURA DA COLHEITA DO ARROZ', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20300' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20300', 'DIA DE CAMPO', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20301' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20301', 'DIA DE CAMPO IN900 / CARANDAI-MG', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20302' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20302', 'CONFIGEM / SAO JOSE DO RIO PRETO', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20303' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20303', 'ENCONTRO DE CONFINAMENTO/ RIBEIRAO PRETO', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20304' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20304', 'DIA DE CAMPO / PORANGABA - SP', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20305' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20305', 'ROTA CONFINA BRASIL', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20306' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20306', 'DIA DE CAMPO – NORTE', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20307' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20307', 'DIA DE CAMPO – SUL', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20308' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20308', 'CONVENCAO NUTRICIONISTAS', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20309' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20309', 'VISITAS REVENDAS', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20310' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20310', 'BAHIA FARM SHOW', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20311' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20311', 'PROJETO ACIA - FASE 1 (TEG)', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20312' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20312', 'PROJETO ACIA - FASE 2 (WM)', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20313' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20313', 'PROJETO MANFED - FASE 1', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20314' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20314', 'PROJETO MANFED - FASE 2', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20315' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20315', 'COMERCIAL PECUÁRIA', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20316' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20316', 'DIAS DE CAMPO PECUÁRIA', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20400' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20400', 'PROJETO LEAN - A3 -', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20401' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20401', 'PROJETOS LEAN - PRODUTO', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20402' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20402', 'PROJETOS LEAN - COMERCIAL', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'COM' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '20404' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '20404', 'PROJETOS LEAN - ENGENHARIA', 'Analitica', 'COM', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40100' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40100', 'CUSTEIO ABSORCAO-INDIRETOS', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40101' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40101', 'APOIO A PRODUCAO', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40102' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40102', 'PCP', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40103' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40103', 'ENGENHARIA DE PROCESSOS', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40104' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40104', 'EXPEDICAO', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40105' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40105', 'COMPRAS', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40106' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40106', 'QUALIDADE INDUSTRIAL', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40107' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40107', 'ALMOXARIFADO', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40108' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40108', 'LOGISTICA INTERNA', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40109' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40109', 'AMBIENTAL', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40112' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40112', 'LIDERANCA-PRODUCAO', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40115' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40115', 'MANUTENCAO  INDUSTRIAL', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40116' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40116', 'MANUTENCAO PREDIAL', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40117' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40117', 'SEGURANCA DO TRABALHO  - SST', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOI' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40118' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40118', 'OPERAÇÃO MT', 'Analitica', 'MOI', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOD' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40201' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40201', 'SERRA', 'Analitica', 'MOD', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOD' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40202' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40202', 'SOLDAS MANUAL', 'Analitica', 'MOD', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOD' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40203' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40203', 'SOLDAS ROBO', 'Analitica', 'MOD', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOD' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40206' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40206', 'PINTURA', 'Analitica', 'MOD', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

  select id into v_parent_id from public.cc_plan_nodes where organization_id = v_org_id and node_code = 'MOD' limit 1;
  select id into v_cost_center_id from public.cost_centers where organization_id = v_org_id and cost_center_number = '40208' limit 1;
  insert into public.cc_plan_nodes (organization_id, cost_center_id, parent_node_id, node_code, node_name, node_class, node_type, sort_order, origin) values (v_org_id, v_cost_center_id, v_parent_id, '40208', 'MONTAGEM', 'Analitica', 'MOD', 1, 'actuals+structure') on conflict (organization_id, node_code) do update set cost_center_id = excluded.cost_center_id, parent_node_id = excluded.parent_node_id, node_name = excluded.node_name, node_class = excluded.node_class, node_type = excluded.node_type, origin = excluded.origin;

end $$;

commit;
