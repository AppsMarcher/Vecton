# Cockpit Gestão — fontes reais

O módulo `cockpit` usa as consultas autenticadas do Vecton. Não carrega mais dados de demonstração. Os registros sintéticos ficam exclusivamente em `tests/fixtures`.

## Regras confirmadas

- Contas e grupos: catálogo `OPEX_STRUCTURE` dos relatórios OPEX, incluindo atribuições adicionais cadastradas no app. Valores preservam o sinal do ledger; créditos não são convertidos em despesas positivas.
- Gestão: vínculo do centro de custo. Marcher consolida todas as gestões quando o usuário tem esse acesso. Seleção e consultas respeitam as gestões permitidas e concessões parciais por CC.
- Headcount por Área: detalha os CCs da gestão selecionada e totaliza a gestão. Marcher agrupa esses CCs por gestão. Conta toda a base de pessoas, sem exclusões novas de cargo/status.
- Comparativo financeiro e HC: cenário com estrela no Planejamento. Sem cenário `is_default`, o favorito é Budget, como no módulo atual. As colunas exibem o nome real da fonte.
- Forecast anual: Real até a competência selecionada + valores do cenário favorito nos meses seguintes. Sem Forecast favorito, não usa Budget como previsão silenciosamente. Em dezembro, o Forecast coincide com o ano realizado.
- Mês: valores da competência. YTD: janeiro até a competência. Ano: Forecast anual versus favorito anual; Real até a competência permanece identificado separadamente.
- OPEX/HC: `(OPEX do período / quantidade de meses) / HC médio`. HC médio é a média dos snapshots de todos os meses do período; Ano combina HC Real até a competência e HC do cenário nos meses futuros.
- Receita: receita líquida total Marcher, com as mesmas contas e inversão de sinal de `buildDreGerRealReport`. O denominador acompanha a cobertura temporal do numerador.
- Aderência: OPEX / comparativo. Despesa menor é favorável; deltas de HC são neutros.
- Competência: reutiliza o seletor global; permite mês aberto. O app não oferece um fechamento financeiro global nas fontes inspecionadas (o fechamento A3 é específico de A3). Por isso, preserva a competência do header e não declara um mês carregado como contabilmente fechado.

## Fontes e implementação

| Informação | Fonte |
| --- | --- |
| Real com CC | `actuals_ledger_entries` |
| Budget oficial | `budget_ledger_entries` |
| Favorito | `forecast_scenarios.is_default`, por organização e ano |
| Valores do cenário | `forecast_ledger_entries` |
| Pessoas Real/Budget | `headcount_entries`, `load_type=realizado/orcado` |
| Pessoas do cenário | `forecast_headcount_entries`, mesmo uso do módulo Planejamento |
| Receita líquida | Totais por conta/mês de Real e comparativo, com fallback ao ledger usado pelos DREs |
| Cadastros e escopo | Estado hidratado de `cost_centers`, `managements`, plano DRE e perfil de acesso |

`cockpitService.js` faz consultas por organização/ano/contas/CCs e usa paginação por chave nos ledgers. Apenas contagens de pessoas são necessárias: nomes, matrículas e cargos não são transferidos. A receita usa os totais da empresa por conta/mês, sem dimensão de pessoas ou CC.

As fontes anuais são compartilhadas pelos widgets e filtros com cache de 30 segundos, segmentado por organização, usuário, gestão/CCs e favorito. Há invalidação ao trocar a estrela, alterar cenário e encerrar sessão. O botão Atualizar dados ignora o cache. Não há polling.

`cockpitAggregate.js` transforma essas fontes no contrato único de apresentação. `cockpitModule.js` coordena o estado e descarta respostas atrasadas. `cockpitWidgets.js` não consulta o banco; os nomes das fontes, grupos e áreas vêm dos dados.

Uma competência sem registros de uma fonte é tratada conservadoramente como indisponível. Não reduzimos a quantidade de meses para fazer a média parecer completa. Grupos sem movimento (Real e comparativo ambos zero/indisponíveis na competência) não aparecem na tabela "OPEX por Grupo de Despesa" — evita linhas de R$ 0 sem informação útil; o total exibido continua batendo com `opex.actual`/`opex.budget`, que somam todos os grupos, inclusive os ocultos. Se uma fonte de HC não existe, os números de pessoas ficam indisponíveis e os financeiros continuam utilizáveis; erros de acesso ou consulta acionam retry. Totais parciais não são apresentados como completos. "Composição do OPEX" é um ranking de barras (não um donut) justamente para lidar com grupos negativos (crédito/estorno) sem precisar esconder o gráfico inteiro: cada grupo vira uma linha, com barra proporcional ao valor absoluto; um grupo negativo aparece com barra tracejada e a etiqueta "crédito" em vez de percentual. Só fica indisponível quando `opex.actual` é nulo ou não há nenhum grupo no período.

O cabeçalho mostra só uma linha de contexto (fonte do comparativo); o resumo de gestão/período/mês não se repete ali porque já está nos controles (seletor de Gestão, botões Mês/YTD/Ano, picker de período). Avisos de cobertura (ex.: sem Forecast favorito no Planejamento, HC médio indisponível) não ficam mais fixos na tela — aparecem no título (hover) do indicador ● ao lado da linha de contexto e são anunciados uma vez para leitor de tela.

## Validação e limites

- `node tests/cockpit.test.js`: reconciliação de grupos/CCs, média mensal e HC médio variável, receita, Ano, ausência de competência, resposta fora de ordem, teclado, vazio, retry e mobile, usando registros sintéticos com o formato das fontes reais.
- `node tests/cockpitService.test.js`: consultas por organização/CC, acesso parcial, ausência de PII, mudança de favorito, Budget como favorito, cache por período/sessão, fonte opcional ausente, receita e propagação de erros.
- Verificações de sintaxe, regressões do shell e `git diff --check`.

A integração usa tabelas e campos já referenciados pelo aplicativo; não cria migrations nem altera registros. A validação automatizada usa fontes controladas. A conferência numérica com o banco de produção exige uma sessão autenticada do Vecton e ainda não foi realizada nesta tarefa. As capturas dos testes mostram dados sintéticos, não valores financeiros de produção.