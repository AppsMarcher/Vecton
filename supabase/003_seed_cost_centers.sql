-- Centros de custos extraidos de CCs.xlsx
-- Cria a organizacao Marcher Brasil, se necessario, e carrega os CCs.
begin;

insert into public.organizations (name)
select 'Marcher Brasil'
where not exists (
  select 1 from public.organizations where name = 'Marcher Brasil'
);

insert into public.organization_users (organization_id, user_id, role)
select o.id, auth.uid(), 'owner'
from public.organizations o
where o.name = 'Marcher Brasil'
  and auth.uid() is not null
  and not exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = o.id
      and ou.user_id = auth.uid()
  );

with target_org as (
  select id
  from public.organizations
  where name = 'Marcher Brasil'
  limit 1
),
seed_rows (cost_center_number, cost_center_name, cost_center_type, cost_center_management) as (
  values
    ('10001', 'DIRETORIA', 'ADM', 'Diretoria'),
    ('10002', 'CONSELHO', 'ADM', 'Diretoria'),
    ('10003', 'TECNOLOGIA DA INFORMACAO', 'ADM', 'Controladoria'),
    ('10004', 'CONTABILIDADE', 'ADM', 'Controladoria'),
    ('10005', 'ADM FINANCEIRO', 'ADM', 'Controladoria'),
    ('10006', 'RECURSOS HUMANOS', 'ADM', 'Recursos Humanos'),
    ('10007', 'LIDERANCA ADMINISTRATIVA', 'ADM', 'Controladoria'),
    ('10008', 'CONTROLADORIA', 'ADM', 'Controladoria'),
    ('10009', 'SEGURANCA DO TRABALHO  - SST', 'ADM', 'Recursos Humanos'),
    ('10010', 'MANUTENCAO PREDIAL - 5S', 'ADM', 'Recursos Humanos'),
    ('10011', 'ADMINISTRATIVO - PROJETO FENIX', 'ADM', 'Controladoria'),
    ('10110', 'ENGENHARIA-PESQUISA E DESENVOLVIMENTO', 'ADM', 'Engenharia'),
    ('10113', 'LIDERANCA-P&D', 'ADM', 'Engenharia'),
    ('10114', 'IN900 AUTOPROPELIDA', 'ADM', 'Engenharia'),
    ('10115', 'EXTRATORA DE SILAGEM', 'ADM', 'Engenharia'),
    ('10116', 'EXTRATORA DE GRAOS DE BAIXO CUSTO', 'ADM', 'Engenharia'),
    ('10117', 'TECHPACK – FREIO AUTOMATICO', 'ADM', 'Engenharia'),
    ('10118', 'TECHPACK – MONITORAMENTO DE VAZAO', 'ADM', 'Engenharia'),
    ('10119', 'INOVACAO 3 – TBD', 'ADM', 'Engenharia'),
    ('10120', 'NACIONALIZACAO QUEBRADORES IN90/IN65', 'ADM', 'Engenharia'),
    ('10121', 'CHUPIM ABASTECIMENTO IN90', 'ADM', 'Engenharia'),
    ('10122', 'MELHORIAS IN90 – REIDRATACAO/INOCULACAO', 'ADM', 'Engenharia'),
    ('10123', 'NOVA MOEGA IN90', 'ADM', 'Engenharia'),
    ('10124', 'CARRETA GRANELEIRA – FASE 1', 'ADM', 'Engenharia'),
    ('10125', 'REMODELACAO ESTEIRA LATERAL IN60', 'ADM', 'Engenharia'),
    ('10126', 'TRANSGRAIN OUT220', 'ADM', 'Engenharia'),
    ('10127', 'LAYOUT/IN110+IN100', 'ADM', 'Engenharia'),
    ('10128', 'CJ MONT INGRAIN 60', 'ADM', 'Engenharia'),
    ('10129', 'CJ MONT OUTGRAIN 215 VERSAO 2019', 'ADM', 'Engenharia'),
    ('10130', 'CJ MONT INGRAIN160 VERSAO 2019', 'ADM', 'Engenharia'),
    ('10131', 'MOEDOR DE GRAOS IN90', 'ADM', 'Engenharia'),
    ('10132', 'CARRETA GRANELEIRA 11MIL LITROS', 'ADM', 'Engenharia'),
    ('10133', 'SISTEMA PRÉ LIMPEZA', 'ADM', 'Supply Chain'),
    ('10134', 'REDUCAO CUSTO IN160', 'ADM', 'Engenharia'),
    ('10135', 'NOVA OUTGRAIN220 Fase I', 'ADM', 'Engenharia'),
    ('10136', 'NOVA OUT 215', 'ADM', 'Engenharia'),
    ('10137', 'MELHORIAS IN100 FASE I e II', 'ADM', 'Engenharia'),
    ('10138', 'INGRAIN 180 MOTORIZADA', 'ADM', 'Produto'),
    ('10139', 'PEQUENAS PROPRIEDADES GRÃOS', 'ADM', 'Qualidade'),
    ('10140', 'MANFED PROTEÇÃO BOLSAS', 'ADM', 'Engenharia'),
    ('10141', 'PEQUENAS PROPRIEDADES PECUÁRIA', 'ADM', 'Produto'),
    ('10142', 'IN180 URUGUAI', 'ADM', 'Engenharia'),
    ('10500', 'GESTAO DE PRODUTO', 'ADM', 'Produto'),
    ('10501', 'PROJETO UFLA', 'ADM', 'Produto'),
    ('10502', 'PROJETO TX', 'ADM', 'Produto'),
    ('20001', 'COMERCIAL', 'COM', 'Comercial'),
    ('20002', 'POS VENDA', 'COM', 'Qualidade'),
    ('20003', 'GARANTIA GRAOS', 'COM', 'Qualidade'),
    ('20004', 'ENTREGA TECNICA GRAOS', 'COM', 'Qualidade'),
    ('20005', 'ASSISTENCIA TECNICA GRAOS', 'COM', 'Qualidade'),
    ('20006', 'EXPORTACAO', 'COM', 'Comercial'),
    ('20007', 'LIDERANCA COMERCIAL', 'COM', 'Comercial'),
    ('20008', 'MARKETING', 'COM', 'Marketing'),
    ('20009', 'MKT - ROTA PECUARIA', 'COM', 'Marketing'),
    ('20010', 'TREINAMENTO IN HOUSE', 'COM', 'Marketing'),
    ('20011', 'COMERCIAL PECAS', 'COM', 'Comercial'),
    ('20012', 'MKT - ROTA DO LEITE', 'COM', 'Marketing'),
    ('20013', 'MKT - CONVENCAO COMERCIAL', 'COM', 'Marketing'),
    ('20014', 'COMERCIAL REGIAO NORTE', 'COM', 'Comercial'),
    ('20015', 'COMERCIAL REGIAO SUL', 'COM', 'Comercial'),
    ('20016', 'MKT - EVENTO CONFINAR', 'COM', 'Marketing'),
    ('20017', 'COMERCIAL REGIAO MT / RO', 'COM', 'Comercial'),
    ('20018', 'GARANTIA PECUARIA', 'COM', 'Qualidade'),
    ('20019', 'ENTREGAS TECNICA PECUARIA', 'COM', 'Qualidade'),
    ('20020', 'ASSISTENCIA TECNICA PECUARIA', 'COM', 'Qualidade'),
    ('20100', 'FEIRAS NACIONAIS', 'COM', 'Marketing'),
    ('20101', 'FEIRA-SHOW RURAL COOPAVEL / CASCAVEL', 'COM', 'Marketing'),
    ('20102', 'FEIRA-EXPODIRETO / NAO ME TOQUE', 'COM', 'Marketing'),
    ('20103', 'FEIRA-TECNOSHOW / RIO VERDE', 'COM', 'Marketing'),
    ('20104', 'FEIRA-AGRISHOW / RIBEIRAO PRETO', 'COM', 'Marketing'),
    ('20105', 'FEIRA-AGROBRASILIA', 'COM', 'Marketing'),
    ('20106', 'FEIRA-AGROLEITE / CASTRO', 'COM', 'Marketing'),
    ('20107', 'FEIRA-EXPOINTER / ESTEIO', 'COM', 'Marketing'),
    ('20108', 'FEIRA-SHOW SAFRA / LUCAS DO RIO VERDE', 'COM', 'Marketing'),
    ('20109', 'FEIRA-EXPOZEBU / UBERABA', 'COM', 'Marketing'),
    ('20110', 'FEIRA-SHOWTEC / MARACAJU', 'COM', 'Marketing'),
    ('20111', 'FEMEC', 'COM', 'Marketing'),
    ('20200', 'FEIRAS INTERNACIONAIS', 'COM', 'Marketing'),
    ('20201', 'FEIRA-EXPO AGRO / SAN NICOLAS', 'COM', 'Comercial'),
    ('20202', 'FEIRA-AGRO ACTIVA / ARMSTRONG', 'COM', 'Comercial'),
    ('20203', 'FEIRA-EXPO PRADO / MONTEVIDEO', 'COM', 'Comercial'),
    ('20204', 'FEIRA-FARM PROGRESS / DECATUR IL USA', 'COM', 'Comercial'),
    ('20205', 'FEIRA-AGRITECHNICA / HANNOVER GERMANY', 'COM', 'Comercial'),
    ('20206', 'EVENTO SIMPEC', 'COM', 'Marketing'),
    ('20207', 'EVENTO FEEDLOT SUMMIT', 'COM', 'Marketing'),
    ('20208', 'FEIRA – ABERTURA DA COLHEITA DO ARROZ', 'COM', 'Marketing'),
    ('20300', 'DIA DE CAMPO', 'COM', 'Marketing'),
    ('20301', 'DIA DE CAMPO IN900 / CARANDAI-MG', 'COM', 'Marketing'),
    ('20302', 'CONFIGEM / SAO JOSE DO RIO PRETO', 'COM', 'Marketing'),
    ('20303', 'ENCONTRO DE CONFINAMENTO/ RIBEIRAO PRETO', 'COM', 'Marketing'),
    ('20304', 'DIA DE CAMPO / PORANGABA - SP', 'COM', 'Marketing'),
    ('20305', 'ROTA CONFINA BRASIL', 'COM', 'Marketing'),
    ('20306', 'DIA DE CAMPO – NORTE', 'COM', 'Comercial'),
    ('20307', 'DIA DE CAMPO – SUL', 'COM', 'Comercial'),
    ('20308', 'CONVENCAO NUTRICIONISTAS', 'COM', 'Marketing'),
    ('20309', 'VISITAS REVENDAS', 'COM', 'Marketing'),
    ('20310', 'BAHIA FARM SHOW', 'COM', 'Marketing'),
    ('20311', 'PROJETO ACIA - FASE 1 (TEG)', 'COM', 'Marketing'),
    ('20312', 'PROJETO ACIA - FASE 2 (WM)', 'COM', 'Marketing'),
    ('20313', 'PROJETO MANFED - FASE 1', 'COM', 'Marketing'),
    ('20314', 'PROJETO MANFED - FASE 2', 'COM', 'Marketing'),
    ('20315', 'COMERCIAL PECUÁRIA', 'COM', 'Comercial'),
    ('20316', 'DIAS DE CAMPO PECUÁRIA', 'COM', 'Comercial'),
    ('20400', 'PROJETO LEAN - A3 -', 'COM', 'Qualidade'),
    ('20401', 'PROJETOS LEAN - PRODUTO', 'COM', 'Qualidade'),
    ('20402', 'PROJETOS LEAN - COMERCIAL', 'COM', 'Qualidade'),
    ('20404', 'PROJETOS LEAN - ENGENHARIA', 'COM', 'Qualidade'),
    ('40100', 'CUSTEIO ABSORCAO-INDIRETOS', 'MOI', 'Supply Chain'),
    ('40101', 'APOIO A PRODUCAO', 'MOI', 'Industrial'),
    ('40102', 'PCP', 'MOI', 'Supply Chain'),
    ('40103', 'ENGENHARIA DE PROCESSOS', 'MOI', 'Industrial'),
    ('40104', 'EXPEDICAO', 'MOI', 'Supply Chain'),
    ('40105', 'COMPRAS', 'MOI', 'Supply Chain'),
    ('40106', 'QUALIDADE INDUSTRIAL', 'MOI', 'Qualidade'),
    ('40107', 'ALMOXARIFADO', 'MOI', 'Supply Chain'),
    ('40108', 'LOGISTICA INTERNA', 'MOI', 'Supply Chain'),
    ('40109', 'AMBIENTAL', 'MOI', 'Recursos Humanos'),
    ('40112', 'LIDERANCA-PRODUCAO', 'MOI', 'Industrial'),
    ('40115', 'MANUTENCAO  INDUSTRIAL', 'MOI', 'Industrial'),
    ('40116', 'MANUTENCAO PREDIAL', 'MOI', 'Recursos Humanos'),
    ('40117', 'SEGURANCA DO TRABALHO  - SST', 'MOI', 'Recursos Humanos'),
    ('40118', 'OPERAÇÃO MT', 'MOI', 'Supply Chain'),
    ('40201', 'SERRA', 'MOD', 'Industrial'),
    ('40202', 'SOLDAS MANUAL', 'MOD', 'Industrial'),
    ('40203', 'SOLDAS ROBO', 'MOD', 'Industrial'),
    ('40206', 'PINTURA', 'MOD', 'Industrial'),
    ('40208', 'MONTAGEM', 'MOD', 'Industrial')
)
insert into public.cost_centers (organization_id, cost_center_number, cost_center_name, cost_center_type, cost_center_management)
select target_org.id, seed_rows.cost_center_number, seed_rows.cost_center_name, seed_rows.cost_center_type, seed_rows.cost_center_management
from seed_rows
cross join target_org
on conflict (organization_id, cost_center_number) do update
set cost_center_name = excluded.cost_center_name,
    cost_center_type = excluded.cost_center_type,
    cost_center_management = excluded.cost_center_management;

commit;
