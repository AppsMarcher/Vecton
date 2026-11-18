# Cockpit Gestão — fontes reais

O módulo `cockpit` usa as consultas autenticadas do Vecton. Não carrega mais dados de demonstração. Os registros sintéticos ficam exclusivamente em `tests/fixtures`.

## Regras confirmadas

- Contas e grupos: catálogo `OPEX_STRUCTURE` dos relatórios OPEX, incluindo atribuições adicionais cadastradas no app. Valores preservam o sinal do ledger; créditos não são convertidos em despesas positivas.
- Gestão: vínculo do centro de custo. Marcher consolida todas as gestões quando o usuário tem esse acesso. Seleção e consultas respeitam as gestões permitidas e concessões parciais por CC.
- Headcount por Área: detalha os CCs da gestão selecionada e totaliza a gestão. Marcher agrupa esses CCs por gestão. Conta toda a base de pessoas, sem exclusões novas de cargo/status.
- Popover de Headcount: clicar numa área do Raio-X (ou na linha Total/no card "Headcount" do topo) abre a lista nominal de quem compõe aquele número — matrícula, colaborador e cargo, mesmo padrão do card de Headcount do Dashboard. Clique numa área específica já abre a lista direto; clique no totalizador mostra antes o resumo por área, como passo intermediário. Busca sob demanda, só a competência selecionada (não os 12 meses usados pela tendência).
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

`cockpitService.js` faz consultas por organização/ano/contas/CCs e usa paginação por chave nos ledgers. A consulta anual usada pela tendência (`load`) só conta pessoas: nomes, matrículas e cargos não são transferidos nela. O popover de Headcount usa uma segunda consulta, à parte e sob demanda (`loadHeadcountDetail`), que transfere matrícula/colaborador/cargo só da competência selecionada — o mesmo dado que o card de Headcount do Dashboard já expõe. A receita usa os totais da empresa por conta/mês, sem dimensão de pessoas ou CC.

As fontes anuais são compartilhadas pelos widgets e filtros com cache de 30 segundos, segmentado por organização, usuário, gestão/CCs e favorito. Há invalidação ao trocar a estrela, alterar cenário e encerrar sessão. O botão Atualizar dados ignora o cache. Não há polling.

`cockpitAggregate.js` transforma essas fontes no contrato único de apresentação. `cockpitModule.js` coordena o estado e descarta respostas atrasadas. `cockpitWidgets.js` não consulta o banco; os nomes das fontes, grupos e áreas vêm dos dados.

Uma competência sem registros de uma fonte é tratada conservadoramente como indisponível. Não reduzimos a quantidade de meses para fazer a média parecer completa. Grupos sem movimento (Real e comparativo ambos zero/indisponíveis na competência) não aparecem na tabela "OPEX por Grupo de Despesa" — evita linhas de R$ 0 sem informação útil; o total exibido continua batendo com `opex.actual`/`opex.budget`, que somam todos os grupos, inclusive os ocultos. Se uma fonte de HC não existe, os números de pessoas ficam indisponíveis e os financeiros continuam utilizáveis; erros de acesso ou consulta acionam retry. Totais parciais não são apresentados como completos. "Composição do OPEX" é um ranking de barras (não um donut) justamente para lidar com grupos negativos (crédito/estorno) sem precisar esconder o gráfico inteiro: cada grupo vira uma linha, com barra proporcional ao valor absoluto; um grupo negativo aparece com barra tracejada e a etiqueta "crédito" em vez de percentual. Só fica indisponível quando `opex.actual` é nulo ou não há nenhum grupo no período.

O cabeçalho mostra só uma linha de contexto (fonte do comparativo); o resumo de gestão/período/mês não se repete ali porque já está nos controles (seletor de Gestão, botões Mês/YTD/Ano, picker de período). Avisos de cobertura (ex.: sem Forecast favorito no Planejamento, HC médio indisponível) não ficam mais fixos na tela — aparecem no título (hover) do indicador ● ao lado da linha de contexto e são anunciados uma vez para leitor de tela.

## Acompanhamento de OPEX (análises e planos de ação)

O card **OPEX por Grupo de Despesa** ganhou duas colunas e dois botões compactos; os quatro KPIs, a ordem dos quatro cards, filtros, temas e os demais cards não mudaram. Detalhes de implantação: `docs/opex-analises-planos-de-acao.md`.

- **Colunas.** Card de grupos: ícone de registro | Grupo | Real | Meta | Var. | Var. % | Sinaleira. Drilldown: ícone | Conta | Nome | CC | Nome do CC | Real | Meta | Var. | Var. % | Sinaleira. A **sinaleira é sempre a última coluna** (fixa à direita no drilldown). A linha de total não leva ícone nem sinaleira.
- **Ícone de registro.** Aparece só quando existe análise salva (com causa) ou pelo menos uma ação no contexto da linha; ação concluída continua sendo registro; rascunho não salvo não marca. Sem registro, a célula fica vazia. No grupo, soma apenas contas × CCs autorizados e da seleção atual; um CC não autorizado nunca aparece, nem por contagem. Falha de leitura não vira "sem registro".
- **Sinaleira.** Mede a **relevância da variação**, não o tratamento. `Δ = real − comparativo`; `Δ% = |Δ| / |comparativo|`. Vermelho: `|Δ| ≥ R$ 20.000` **ou** `Δ% ≥ 10%`; amarelo (não vermelho): `|Δ| ≥ R$ 10.000` **ou** `Δ% ≥ 5%`; verde caso contrário. Valem para variações positivas e negativas e para o mesmo limite em Mês, YTD e Ano. Base indisponível → "—"; comparativo 0 e real 0 → verde; comparativo 0 e real ≠ 0 → vermelho ("Sem base"). Os quatro limites são parâmetros da organização (botão **Parâmetros**; só administradores alteram; versão e autor registrados). O grupo classifica a **variação agregada** do próprio grupo (contas que se compensam podem deixá-lo verde).
- **Fluxo.** Grupo → drilldown conta × CC → clique na linha abre **Analisar variação** (nunca os lançamentos primeiro). Abas: Analisar variação · Plano de ação · Ver lançamentos. O rascunho sobrevive à troca de abas e o fechamento com alterações pede confirmação.
- **Identidade da análise.** `organização + CC + conta (texto) + ano + tipo de período + competência + fonte do comparativo + ano da fonte + escopo`. O grupo é só apresentação. Mês, YTD e Ano são análises distintas; trocar a fonte (estrela/seletor) não reaproveita uma análise feita contra outra fonte.
- **Snapshot no servidor.** Real e comparativo são recalculados por RPC (mesmas regras do Cockpit: mês sem carga = indisponível, nunca R$ 0; no Ano, o realizado até o corte + meses seguintes do comparativo quando ele é Forecast). O cliente não envia valores. "Base mudou" = a assinatura de carga (quantidade/última atualização do realizado e quantidade/soma do cenário no recorte conta × CC) difere da gravada; a versão anterior é preservada.
- **Ações.** Dono do plano e responsável pela execução (usuário ativo da organização). Estados: aguardando ciência → em andamento → aguardando validação → concluída (ou ajustes solicitados). Atraso é **derivado** (`prazo < hoje` no fuso America/Sao_Paulo, só enquanto aguarda ciência/está em andamento/ajustes); o prazo vale até o fim do dia. Ciência é explícita (botão Ciente, por ciclo da atribuição); abrir sino/e-mail/ação não confirma. Reatribuir abre novo ciclo de ciência e avisa anterior e novo responsável. O executor não valida a própria entrega por automação.
- **Executor sem acesso ao CC** lê apenas o DTO operacional (título, resultado esperado, prazo, estado, histórico operacional, arquivos compartilhados): sem orçado/realizado/variação, causa, impacto financeiro, ledger nem ID da análise. O impacto financeiro esperado é **um por análise** e fica no registro financeiro.
- **Posse.** Se o dono perde o escopo do CC ou é desativado, a posse passa ao autor da análise (se ainda puder escrever), depois a um gestor da gestão do CC, depois a um administrador; executor e novo dono são avisados.
- **Telas.** "Análises e planos de ação" (consolidado, tela própria no menu, paginação/filtros no servidor), "Minhas ações" (qualquer usuário com tarefa, sem liberar relatórios) e o popover de pendências na entrada (ciência → vencidas → a vencer → entregas para validar; antes das Novidades; nunca dois overlays juntos).

## Validação e limites

- `node tests/cockpit.test.js`: reconciliação de grupos/CCs, média mensal e HC médio variável, receita, Ano, ausência de competência, resposta fora de ordem, teclado, vazio, retry e mobile, usando registros sintéticos com o formato das fontes reais.
- `node tests/cockpitService.test.js`: consultas por organização/CC, acesso parcial, ausência de PII na consulta anual, popover de Headcount (PII só na competência selecionada, guarda de escopo client-side, acesso negado), mudança de favorito, Budget como favorito, cache por período/sessão, fonte opcional ausente, receita e propagação de erros.
- `tests/opexReview*.sql.test.js` (PGlite): RLS/DTOs, snapshot, máquina de estados, concorrência/idempotência, anexos, notificações, lembretes e posse; `tests/notificationEmailClaim.sql.test.js`: claim da outbox.
- `tests/opexReview*.browser.test.js`: colunas, drilldown, análise, plano/anexos, parâmetros, Minhas ações, consolidado, popover de entrada e fila de overlays (Claro/Dark e 390 px).
- Verificações de sintaxe, regressões do shell e `git diff --check`.

A integração usa tabelas e campos já referenciados pelo aplicativo; não cria migrations nem altera registros. A validação automatizada usa fontes controladas. A conferência numérica com o banco de produção exige uma sessão autenticada do Vecton e ainda não foi realizada nesta tarefa. As capturas dos testes mostram dados sintéticos, não valores financeiros de produção.