begin;

-- ============================================================================
-- Objetivo estratégico de cada A3 (mãe e filho), copiado literalmente das
-- caixas de texto "OBJETIVOS DO A3 ..." da planilha original
-- "#INDICADORES# 2026.xlsx" (uma por aba — não são valores de célula, são
-- shapes/textboxes do desenho de cada aba, por isso a análise anterior desta
-- planilha não tinha achado esse texto).
--
-- 13 dos 14 A3 têm o texto completo. 'estoques' só tinha o título
-- "OBJETIVOS DO A3 DE ESTOQUES 2026:" na planilha, sem o corpo — fica null
-- mesmo, pra o dono da área preencher pelo botão Editar da tela.
--
-- update simples (não é seed condicional) — sobrescreve o que estiver
-- gravado em objective toda vez que rodar. Não rodar de novo depois que
-- alguém já tiver editado o texto pela tela.
-- ============================================================================

update public.strategic_a3 set objective = $obj$Retomar o patamar histórico de EBITDA em torno de 20% sobre a Receita Líquida nos próximos anos, tendo como referência o desempenho obtido em 2021, 2022 e 2023.

Médio prazo:
2026: promover ajustes operacionais e de custos que permitam elevar a margem para níveis acima de 10%.
2027: promover ajustes operacionais e de custos que permitam elevar a margem para níveis acima de 15%.

Longo prazo:
2028 em diante: consolidar um modelo sustentável que garanta margens superiores a 20% de EBITDA, com estabilidade de volumes e maior eficiência no uso de matérias-primas e despesas operacionais.$obj$
where code = 'ebitda';

update public.strategic_a3 set objective = $obj$1 - Faturamento:
91 milhões – 2026
150 milhões – 2027
200 milhões – 2028$obj$
where code = 'comercial';

update public.strategic_a3 set objective = $obj$Redução custo produto:
1- Redução do CPV para ≤ 50% (2.400 mil) – 2,8% da RL (88M)

Ciclo Operacional:
2- Giro de estoque - 4
3- Prazo médio pagamento - elevar de 25 para 35 dias.

Disponibilidade Produção:
4- Reduzir em 70% o tempo de paradas por falta de material.$obj$
where code = 'supply_chain';

update public.strategic_a3 set objective = $obj$1. Produtividade:
Aumentar o OEE Geral de 67% para 72%.

2. GGF:
Diminuir o GGF de 15,22% para 14,3% (meta alterada para 17,84%).

3. 5'S:
Aumentar a nota de 4,2 para 4,5.$obj$
where code = 'fabril';

update public.strategic_a3 set objective = $obj$Objetivo: Melhorar a eficácia das áreas técnicas.

Metas:
Diminuir o índice de garantias Geral em 25% (de 16,34% para 12,2%).
Diminuir o índice de garantias de máquinas novas em 25% (de 40% para 30%).
Reduzir tempo de parada por causa "áreas técnicas" por máquina montada em 25% (de 3,35h por máquina para 2,5h).

*Dados Setembro 2025$obj$
where code = 'areas_tecnicas';

update public.strategic_a3 set objective = $obj$Estratégia de Defesa de Mercado:
Dificultar a expansão da concorrência através de redução de custos em alguns modelos; e também a permanência dos atuais clientes, oferecendo novos diferenciais ou novas funcionalidades.

Expansão e Inovação:
Desenvolver novos produtos que possam entregar soluções inteligentes e inovadoras nos sistemas de armazenagem para as linhas de grãos e pecuária; entendendo as necessidades dos clientes.

Metas 2026:
1- Reduzir a concentração de faturamento nos quatro produtos líderes de 91,92% para 87,6%.
2- Elevar a participação de produtos novos para 10% do faturamento.
3- Alcançar NPS acima de 50 para produtos novos (fase 6).$obj$
where code = 'produto';

update public.strategic_a3 set objective = $obj$Canal direto com revendas:
1- Estabelecer canal de comunicação direto com as revendas (70% das revendas por região) – até ago/2026.

Inteligência de mercado:
2- Estruturar dados de Inteligência de Mercado para report – até jun/2026.

Funil de vendas:
3- Medir a taxa de conversão de leads, revendas e clientes finais, com processo e canal padronizado – até abr/2026.

Conhecimento do cliente final:
Elevar de 25% para 80% o nível de conhecimento dos dados do cliente final (nome, e-mail, localização, modelo da máquina e data de aquisição) – até dez/2026.$obj$
where code = 'marketing';

update public.strategic_a3 set objective = $obj$Melhorar a eficácia no desenvolvimento de produtos:
1 - Atendimento dos prazos de tarefas críticas do PDP em 90%.
2 - Diminuir as paradas de produção associadas a erros de projetos em 30%.
3 - Atingimento dos valores acordados durante o desenvolvimento com no máximo 10% do desvio de mais.
4 - Nível de garantia dos produtos associadas a erros de projeto máximo em 5%.

Melhoria do custo dos produtos:
1 - Desenvolver soluções de design e processos com foco em custo de fabricação nos modelos 60, 65, 900, 910, 215, 220 em 2026.
2 - 544 itens a serem comunizados ou cancelados em 2026.

Aumento do controle de propriedade industrial:
1 - Aumentar o nível de segurança da informação técnica.
2 - Mapear e apresentar as sugestões de patente dos projetos lançados de 2025 em diante.$obj$
where code = 'engenharia';

update public.strategic_a3 set objective = $obj$1. Turnover:
Diminuir o turnover mensal de 3,5% para 2,5%.

2. Satisfação colaboradores:
Aumentar a taxa de satisfação de 76% para 80%.

3. Segurança do Trabalho:
Acidente zero.$obj$
where code = 'pessoas';

update public.strategic_a3 set objective = $obj$Faturamento final 2026 = R$ 5 milhões
Faturamento anual de R$ 8,5 milhões até final de 2027
Faturamento anual de R$ 10 milhões até final de 2028

Desenvolver ao menos 10 revendas parceiras até 2028.
Atingir a marca de 100 máquinas exportadas no ano de 2028.$obj$
where code = 'exportacao';

update public.strategic_a3 set objective = $obj$Atingir faturamento em pecuária de:
2026 = 25M
2027 = 34M
2028 = 40M

Aumentar vendas da Ingrain 900 | 910 em 2026 para 10 unidades.
Diminuir indicador de garantia de 30,7% para 11% até dez/2026.$obj$
where code = 'pecuaria';

update public.strategic_a3 set objective = $obj$Atingir R$ 4.000 milhões em 2026, R$ 5.500 milhões em 2027, R$ 8.000 milhões em 2028.
Aumentar a participação de peças BR no faturamento de 3,30% para 3,85% em 2026.$obj$
where code = 'pecas';

update public.strategic_a3 set objective = $obj$Reduzir os custos com matérias-primas, fortalecendo parcerias com os fornecedores, melhorando prazos e condições de pagamento e aumentando a eficiência e competitividade do processo de Compras.

Metas:
- Saving (real/financeiro) de 2,4M em MP dentro do ano de 2026 / 2,8% RL.
- Prazo médio de pagamento (real/financeiro) dos fornecedores A: 75 dias.
- Elevar o índice de performance de fornecedores A para 80% até dezembro de 2026.
- Medir e manter a % do valor de compras emergenciais abaixo de 3%.
- Medir e manter o índice de sobrepreço das compras emergenciais abaixo de 10% ((valor pago na urgência - valor cotado regularmente) / preço normal dos itens).$obj$
where code = 'compras';

-- 'estoques' fica sem objective (planilha não tinha o corpo do texto,
-- só o título) — preencher pela tela (botão Editar) quando o dono definir.

commit;
