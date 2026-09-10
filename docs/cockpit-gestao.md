# Cockpit Gestão

Módulo integrado abaixo de Dashboard, com a chave de navegação `cockpit` (o Vecton usa views, não um roteador de URLs). O menu mobile também oferece o módulo. O acesso acompanha `canAccessDashboard`.

## Implementação

- `src/modules/cockpit/cockpitModule.js`: ciclo de vida, estado único de gestão/período, carregamento, erro/retry, empty state e proteção contra respostas fora de ordem. Usa o seletor de competência existente no header. No mobile, move e restaura os mesmos elementos; não duplica filtros.
- `cockpitData.js`: configuração das 11 gestões, fixture de 2026, agregação pura e serviço substituível com deduplicação de chamadas simultâneas.
- `cockpitWidgets.js`: cards, SVGs, tabelas, ranking e indicadores configuráveis, sem consultas.
- `cockpitFormat.js`: moeda, moeda compacta, percentual, inteiro, delta e semântica de despesas em pt-BR.

Reutiliza `content-card`, `dashboard-panel`, `panel-header`, `kpi-card`, `vp-source-sel`, `period-month-button`, `data-table`, `reports-ger-table`, `ger-row-subtotal`, o sprite de ícones e os tokens do CSS. Os gráficos seguem a implementação SVG dos módulos de Dashboard; não há dependências novas. O select nativo preserva interação por teclado, seleção, fechamento externo/Esc e popup sem deslocar o layout. O chevron utiliza `:open` nos navegadores compatíveis; nos demais permanece para baixo.

## Fonte atual e cálculos

Esta entrega usa **somente dados de demonstração**, explicitamente identificados na tela. Não consulta o banco nem mistura fixtures com dados de produção. Há dados de exemplo para todas as gestões em 2026; outro ano retorna ausência de dados, não zeros. Um loader real pode ser injetado em `createService(loader)` sem modificar os widgets.

- Mês: Real e Budget da competência.
- YTD: soma de janeiro até a competência.
- Ano: Real até a competência e Budget anual. A tela identifica essa diferença de cobertura; os desvios anuais devem ser interpretados nesse contexto.
- Forecast anual: Real até a competência + previsão dos meses seguintes, separado do Real.
- OPEX/HC: OPEX acumulado no período dividido pelo HC médio; portanto, no exemplo YTD, R$ 3,25 mi / 18 = aproximadamente R$ 181 mil, não R$ 20 mil. A fixture mantém HC mensal constante; o adaptador real deverá calcular a média dos snapshots mensais.
- HC atual e Budget são snapshots na competência, com deltas neutros. As áreas somam 18/19, corrigindo a divergência 18/20 das linhas ilustrativas do pedido.
- Composição, totais e variações são derivados das mesmas bases. O ranking ordena o valor absoluto dos desvios e reconcilia as demais contas com os grupos. Aderência ao Budget = Real/Budget.

## Mapeamento existente para integração real

Inspeção feita nos arquivos do repositório; não representa auditoria do schema remoto em execução.

| Dimensão | Fonte encontrada | Referência |
| --- | --- | --- |
| Real com centro de custo | `actuals_ledger_entries` | `supabase/011_create_actuals_imports.sql`, `024_dash_opex_by_management.sql` |
| Budget com centro de custo | `budget_ledger_entries` | `supabase/016_create_budget_imports.sql` |
| Forecast | `forecast_scenarios`, `forecast_ledger_entries` | `supabase/026_create_forecast_scenarios.sql` |
| Gestão e centro de custo | `cost_centers.cost_center_management`, cadastro de gestões | `017_add_cost_center_management.sql`, `021_create_managements.sql`, `088_cost_center_management_free_text.sql` |
| Headcount | `headcount_entries`, `reference_month`, `cost_center_number`, `matricula`, `load_type` | funções `fetchHeadcountRealForYear` e `fetchHeadcountBudgetForYear` em `app.js` |
| Agregação OPEX existente | RPC `dash_opex_by_management` | retorna apenas gestão/total; insuficiente para série, grupos, HC e contas |
| Regras de escopo | `resolveManagementFilter`, `buildOpexCostCenterFilter`, `hcCostSource` | `app.js`, relatórios OPEX/HC |

Antes de ativar o loader real: reutilizar o catálogo vigente de contas OPEX e seus grupos, definir o conceito de área em relação aos centros de custo, selecionar o cenário Forecast correto e estabelecer a receita usada em OPEX/Receita. Aplicar o escopo da organização, gestões extras e centros avulsos no servidor, incluindo acesso parcial. Não interpretar Marcher como gestão individual quando representar o consolidado. Não assumir que a lista demonstrativa de áreas existe no banco. Preservar `null` quando uma fonte não estiver disponível.

Preferir uma chamada agregadora autorizada que devolva todas as dimensões por gestão/ano/competência, com cobertura de dados explícita; a RPC existente de OPEX não substitui esse contrato. Nenhuma migration ou publicação foi executada nesta entrega.

## Validação

`node tests/cockpit.test.js` valida somas e fórmulas para 11 gestões × 3 períodos, ausência de dados, deduplicação, mudanças concorrentes, tooltip por foco, retry e ciclo de montagem mobile. Usa Playwright e o Edge instalado; `COCKPIT_BROWSER_CHANNEL` permite selecionar outro canal instalado. O teste carrega o shell e os módulos locais com fonte controlada; não autentica nem testa consultas reais ao Supabase.

Também executados: `node tests/mobileAvatarLifecycle.test.js`, `node tests/authViewport.test.js`, verificações de sintaxe e `git diff --check`.
