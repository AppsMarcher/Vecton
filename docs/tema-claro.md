# Implementação paralela do tema Claro

Branch: `codex/tema-claro`. Worktree separado; `main` continua entregando Dark.

## Implementado
- Serviço de aparência independente, Dark como padrão.
- Chave no perfil com prévia, Salvar, Cancelar e restauração ao fechar.
- Preferência local por ID do usuário; logout retorna ao Dark.
- Logo fornecido para o Claro, mantendo o branco no Dark.
- Tokens explícitos no shell, perfil, dashboards, relatórios, tooltips e mapas.
- Trilhos dos gauges, fundos e estados sem dados dos mapas adaptados ao Claro.
- Séries, gradientes quantitativos e cores de categorias preservados.
- Nenhuma alteração de API, filtros, agregação, indicadores ou geometria dos gráficos.
- Versões de assets e cache PWA preparadas; sem publicação.

## Convenção para novas alterações
Os componentes e renderizadores são compartilhados. Usar os tokens existentes (`--panel`, `--text`, `--line`, etc.). Na migração de cores legadas, `var(--theme-surface, #cor-original)` aplica o papel semântico no Claro e mantém o valor exato do Dark como fallback. Não usar conversores de cor em runtime nem duplicar telas por tema.

Cores de categoria, gradientes de séries e cores escolhidas pelo usuário no construtor de relatórios não devem ser remapeadas automaticamente. Texto branco sobre botões preenchidos e contornos de rótulos sobre mapas possuem contraste próprio.

## Validação desta etapa
- `node tests/appearance.test.js`: preferência, isolamento por usuário, cancelamento, logout e falhas de armazenamento.
- `node tests/appearanceMigration.test.js`: resolver os fallbacks recupera exatamente os 13 arquivos originais da base `ee85c65`, incluindo código, markup, cores e cálculos.
- `node tests/appearance.browser.test.js`: 18 telas + 6 cenários adicionais nos dois temas, sem conversor do mockup e sem acesso ao backend. Compara textos, tabelas e geometria de SVGs. Inclui modos do mapa, YTD, 76 contas analíticas do caixa e notebook.
- Testes existentes de Cockpit, serviço de Cockpit, modelo de caixa, OPEX e avatar aprovados.
- Teste adicional `fcDashboard.integration.test.js` não executado: dependência `xlsx` ausente no ambiente. Não houve alteração de importação/exportação.
- Capturas e resultado da comparação ficam em `artifacts/theme/` (dados demonstrativos).

O teste de navegador requer Playwright e Edge; `NODE_PATH` ou `PLAYWRIGHT_MODULE` permite reutilizar a instalação local. A verificação da base Dark é um snapshot desta migração: ao incorporar futuras mudanças funcionais de main, atualizar deliberadamente os hashes após revisar as diferenças. Não atualizar para ocultar uma regressão.

## Antes da liberação geral
- Homologar com dados reais, permissões e estados de erro/vazio de cada módulo.
- Concluir a revisão visual de A3, RPS, Planejamento e telas administrativas (fora desta etapa de dashboards e relatórios).
- Validar impressão, exportação e atualização PWA em homologação.
- Definir sincronização entre dispositivos caso desejada; atualmente a escolha é por navegador.

## Trabalho em paralelo
Manter commits pequenos por módulo e incorporar main frequentemente nesta branch, resolvendo conflitos aqui. Cada nova funcionalidade usa os mesmos renderizadores e tokens para ambos os temas. Validar os dois temas antes de integrar. A branch principal e a produção não foram alteradas.
