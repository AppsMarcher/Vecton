# Versionamento de cenários por ano — Plano de implementação

> **Para quem executar:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Objetivo:** todo cenário de planejamento (inclusive o Budget) vive em um repositório único (`forecast_scenarios` + `forecast_ledger_entries`), com o ano no nome, e o "Comparar com"/"Fonte" lista versões de qualquer ano, independente do toggle do cabeçalho (que passa a controlar só o Real).

**Arquitetura:** o Budget é copiado do ledger antigo para cenários "Budget {ano}"; uma camada pura (`src/core/scenarioSources.js`) monta rótulos, opções e a fonte padrão; DRE, Opex, Dashboard, Cockpit e a tela de carga passam a consumir essa camada. O Real segue em `actuals_*`, exposto como `real:{ano}`.

**Stack:** JS puro no navegador (scripts em `index.html`, sem bundler), Supabase/PostgREST, migrations SQL em `supabase/`. Testes: scripts `node tests/<x>.test.js` com `assert` + `vm` (sem framework).

**Spec:** `docs/superpowers/specs/2026-10-19-versionamento-cenarios-por-ano-design.md`

## Global Constraints

- O toggle do cabeçalho controla **só o Real**; fontes de planejamento nunca são filtradas por ele.
- Nome de cenário: ano no fim, **único por organização** (`unique (organization_id, name)`); formato `"{nome} {reference_year}"`, sem duplicar o ano se já digitado.
- Valores de fonte: `real:{ano}` e `scenario:{id}`. O valor legado `"budget"` mapeia para o cenário `"Budget {ano do toggle}"`.
- Estrela (`is_default`): **uma por organização**. Sem estrela, o padrão do "Comparar com" é `"Budget {ano do toggle}"`, se existir.
- "Real {ano}" só para anos com dados em `actuals_monthly_account_totals`.
- Comparação mês a mês, ano completo da fonte comparada, mesmo sem dados.
- Carga em cenário com dados no(s) mês(es): pede confirmação e **sobrescreve**; nunca cria duplicado. Modos "completo"/"adicional" como hoje.
- Histórico de cargas: 1 linha por carga (cenário, mês, arquivo, usuário, data, nº de linhas); sem "desfazer lote".
- **Fora de escopo, não tocar:** Headcount, Comercial, Fluxo de Caixa (incluindo o bloco `kind === "budget"` do Headcount em `app.js` ~3147–3230).
- Tabelas antigas de Budget (`budget_*`) ficam intactas e somente leitura; só são desligadas na Tarefa 7, a pedido do usuário.
- **Não commitar, não fazer push e não aplicar migration em produção sem pedido explícito do usuário.** Cada tarefa termina mostrando o diff e aguardando.
- Textos de UI/comentários em português. Tooltips seguem `.cockpit-tip` (`tipAttr`), nunca `title` nativo.
- Numeração de migrations: próxima livre é `271`.

## Review Focus

- Dois cenários que, após receber o sufixo de ano, ficariam com o mesmo nome → migration deve abortar com mensagem clara, sem renomear parcialmente.
- Cenário de ano diferente do toggle (ex.: estrela em "Fcst 5+7 2026" com toggle 2027) → relatórios devem ler os dados **do ano do cenário**, não do toggle.
- Valor legado `"budget"` (preferência/relatório salvo) → vira "Budget {ano do toggle}"; se o cenário não existir, cai no Real do ano, sem erro.
- Cópia do Budget re-executada → idempotente (não duplica lançamentos nem cenários).
- Carga com nome de destino já existente em mês com dados → exige confirmação; cancelar não altera nada.

---

### Tarefa 1: Banco — nomes com ano, nome único, estrela global

**Arquivos:**
- Criar: `supabase/271_cenarios_nome_com_ano_estrela_global.sql`
- Teste: `supabase/tests/271_cenarios_nome_com_ano.sql` (consultas de verificação; padrão da pasta `supabase/tests/`)

**Interfaces:**
- Produz: `forecast_scenarios.name` terminando em `reference_year`; `unique (organization_id, name)`; índice único `uq_forecast_scenarios_default_per_org` (`where is_default`); RPC `set_default_forecast_scenario(target_organization_id uuid, target_reference_year integer, target_scenario_id uuid)` mantida com a mesma assinatura (ignora o ano) para não quebrar o front atual.

- [ ] **Passo 1:** escrever a consulta de pré-checagem do teste: nomes duplicados após sufixo (`select organization_id, name||' '||reference_year, count(*) ... having count(*)>1`) e estrelas por organização (`count(*) filter (where is_default) > 1`). Rodar contra o banco e registrar a saída; se houver duplicata, parar e avisar o usuário.
- [ ] **Passo 2:** na migration, `update forecast_scenarios set name = name || ' ' || reference_year where name !~ (reference_year::text || '$')`.
- [ ] **Passo 3:** criar `unique (organization_id, name)`; dropar `uq_forecast_scenarios_default_per_year` e criar o índice único por organização.
- [ ] **Passo 4:** reescrever `set_default_forecast_scenario` (admin/super_admin, `security definer`, como em 057): desmarca todos os `is_default` da organização e marca o `target_scenario_id` (null = só limpa).
- [ ] **Passo 5:** verificação: rodar o SQL de teste; esperado: 0 nomes sem ano, 0 duplicados, ≤ 1 estrela por organização. Mostrar o diff e aguardar o usuário aplicar a migration.

### Tarefa 2: Banco — copiar o Budget para cenários

**Arquivos:**
- Criar: `supabase/272_copia_budget_para_cenarios.sql`
- Teste: `supabase/tests/272_copia_budget_totais.sql`

**Interfaces:**
- Consome: Tarefa 1 (nome único).
- Produz: um cenário `"Budget {ano}"` (`cutoff_month = 0`) por organização/ano com dados em `budget_ledger_entries`, com lançamentos em `forecast_ledger_entries` (totais populados pelo trigger de statement da 056).

- [ ] **Passo 1:** escrever o teste: para cada organização/ano/mês/conta, `sum(amount)` de `budget_ledger_entries` = `total_amount` de `forecast_monthly_account_totals` do cenário "Budget {ano}"; esperado: zero diferenças.
- [ ] **Passo 2:** migration: bloco `do $$` por (organização, ano), idempotente (`if exists` cenário `Budget {ano}` com lançamentos → pular). Copiar colunas: `account_number`, `cost_center_id`, `cost_center_number`, `amount`, `history`, `reference_year`, `reference_month` (conferir na 016 se `entry_date` existe; se não, `null`). Inserir em lotes por mês e `set local statement_timeout = 0` (precedente: migration 015).
- [ ] **Passo 3:** rodar o teste de totais e o de idempotência (executar a migration 2 vezes; contagem de linhas igual). Mostrar o diff e aguardar o usuário aplicar.

### Tarefa 3: Camada comum de fontes

**Arquivos:**
- Criar: `src/core/scenarioSources.js` (IIFE anexando `window.VECTON_SCENARIO_SOURCES`, padrão de `storage.js`)
- Criar: `tests/scenarioSources.test.js`
- Criar: `supabase/273_rpc_anos_com_real.sql` (RPC `list_actuals_reference_years(target_organization_id uuid) returns setof integer`, `security definer`, valida `is_org_member`)
- Modificar: `index.html` (tag `<script>` após `utils.js`); `app.js` (fetchers abaixo, perto de `fetchScenariosForYear` ~8340)

**Interfaces:**
- Produz (puro, sem DOM/rede):
  - `withYearSuffix(name: string, year: number): string`
  - `buildSourceOptions({ scenarios: {id,name,reference_year,is_default}[], realYears: number[] }): {value: string, label: string, year: number, kind: 'real'|'scenario'}[]` — Real primeiro (ano decrescente), depois cenários (ano decrescente, nome).
  - `parseSource(value: string): {kind:'real',year:number}|{kind:'scenario',id:string}|{kind:'legacyBudget'}`
  - `resolveDefaultSource({ scenarios, realYears, toggleYear }): string` — estrela; senão `scenario:` do cenário `"Budget {toggleYear}"`; senão `real:{toggleYear}`.
  - `resolveLegacyBudget(scenarios, toggleYear): string`
- Em `app.js`: `fetchAllScenarios(): Promise<scenario[]>` (todos os anos, inclui `reference_year`, `is_default`) e `fetchRealYears(): Promise<number[]>` (via RPC).

- [ ] **Passo 1:** escrever `tests/scenarioSources.test.js` com asserts: `withYearSuffix("Fcst 5+7", 2026) === "Fcst 5+7 2026"`; `withYearSuffix("Budget 2026", 2026) === "Budget 2026"`; ordem de `buildSourceOptions`; `parseSource("budget")` → `legacyBudget`; `resolveDefaultSource` com estrela de ano diferente do toggle devolve a estrela; sem estrela devolve "Budget {toggleYear}"; sem ele, `real:{toggleYear}`; `realYears` vazio não gera opções `real:`.
- [ ] **Passo 2:** rodar `node tests/scenarioSources.test.js`; esperado: FAIL (módulo inexistente).
- [ ] **Passo 3:** implementar o módulo conforme as assinaturas; registrar no `index.html`.
- [ ] **Passo 4:** rodar o teste; esperado: PASS.
- [ ] **Passo 5:** adicionar a migration 273 e os dois fetchers em `app.js`. Mostrar o diff e aguardar.

### Tarefa 4: Carga e Repositório de Cenários

**Arquivos:**
- Criar: `supabase/274_historico_cargas_cenario.sql` (tabela `scenario_load_log`: `id`, `organization_id`, `scenario_id`, `reference_month`, `source_file_name`, `load_mode`, `row_count`, `loaded_by`, `loaded_at`; RLS por organização como 026)
- Modificar: `src/modules/budget/budgetModule.js` (`handleBudgetUploadSubmit` ~718, `autoApplyBudgetBatch` ~815, `createBudgetBatch` ~950, `populateScenarioSelect` ~1192, `applyBatchToForecast` ~1204, `selectedScenarioTarget` ~66)
- Modificar: `src/modules/forecast/forecastModule.js` (`createScenario` ~49, `setDefaultScenario` ~374, renderização do nome na lista ~316)
- Teste: `tests/budgetScenarioTarget.test.js`

**Interfaces:**
- Consome: `withYearSuffix`, `fetchAllScenarios` (Tarefa 3).
- Produz: destino da carga é **sempre** um id de cenário (some a opção `"budget"`); o `reference_year` do lote e dos lançamentos vem de `scenario.reference_year`, o mês continua do período do cabeçalho; função `hasScenarioDataForMonth(scenarioId: string, year: number, month: number): Promise<boolean>`.

- [ ] **Passo 1:** escrever `tests/budgetScenarioTarget.test.js` (extração por `vm`, como `opexPlannedManagement.test.js`): sem opção `"budget"` em `populateScenarioSelect`; `createBudgetBatch` usa o ano do cenário; carga em cenário com dados exige `appConfirm` e, recusada, não chama `applyBatchToForecast`.
- [ ] **Passo 2:** rodar; esperado: FAIL.
- [ ] **Passo 3:** `createScenario`: gravar `name: withYearSuffix(name, referenceYear)`; tratar violação de unicidade com mensagem "Já existe um cenário com este nome".
- [ ] **Passo 4:** `populateScenarioSelect`/carga: listar todos os cenários (nome já com ano) e remover o caminho `apply_budget_import_batch`; confirmar sobrescrita via `hasScenarioDataForMonth` quando houver dados e o modo for "completo" (já existe `appConfirm` nesse ponto); gravar uma linha em `scenario_load_log` após aplicar.
- [ ] **Passo 5:** `setDefaultScenario`: chamar o RPC com `target_reference_year` irrelevante (ano do cenário) e atualizar `is_default` de **todos** os cenários em memória (um só marcado).
- [ ] **Passo 6:** rodar o teste; esperado: PASS. Mostrar o diff e aguardar.

### Tarefa 5: DRE e Opex

**Arquivos:**
- Modificar: `src/modules/reports/reportsDreModule.js` (`initBudgetShell`, `populateSourceSel` ~64, `fetchRowsForSource` ~97, `populateCompareSel` ~126, `resetCompareSource`/`resetBudgetSource` ~454)
- Modificar: `src/modules/reports/reportsOpexModule.js` (`_compareSource` ~38, populate ~60–77)
- Modificar: `app.js` (bloco Opex Budget ~4443–4500, `_opexBudgetSource` ~173, `ledgerFullFetcherForSource` ~8482, `fetchScenarioReportRowsForYear` ~8419)
- Teste: ampliar `tests/opexPlannedManagement.test.js` e criar `tests/reportsSources.test.js`

**Interfaces:**
- Consome: `buildSourceOptions`, `parseSource`, `resolveDefaultSource`, `resolveLegacyBudget`, `fetchAllScenarios`, `fetchRealYears`.
- Produz: `rowsForSource(source: string, toggleYear: number): Promise<{account_number:string, reference_month:number, amount:number}[]>` em `app.js` — `real:{ano}` → `fetchActualsMonthlyAccountTotalsForYear(ano)`; `scenario:{id}` → `fetchScenarioReportRowsForYear(id, scenario.reference_year)` (**ano do cenário, não do toggle**); `legacyBudget` → resolvido por `resolveLegacyBudget`.

- [ ] **Passo 1:** escrever `tests/reportsSources.test.js`: com toggle 2027 e fonte `scenario:{Fcst 2026}`, `rowsForSource` consulta com `reference_year=eq.2026`; fonte `real:2026` consulta `actuals_monthly_account_totals` do ano 2026; `"budget"` legado vira `Budget 2027`.
- [ ] **Passo 2:** rodar; esperado: FAIL.
- [ ] **Passo 3:** implementar `rowsForSource`; trocar `fetchRowsForSource`, `fetchScenariosForYear` e as opções fixas `<option value="budget">` do DRE (Real e Budget) e do Opex por `buildSourceOptions`; o rótulo exibido é o `label` da opção (já com ano); `ledgerFullFetcherForSource` aceita `real:{ano}` (usa o fetcher do Real daquele ano) e `scenario:{id}`.
- [ ] **Passo 4:** `resetCompareSource`/`resetBudgetSource`/`handleDefaultScenarioChanged` continuam, agora recalculando via `resolveDefaultSource`.
- [ ] **Passo 5:** rodar `node tests/reportsSources.test.js` e `node tests/opexPlannedManagement.test.js`; esperado: PASS. Verificar no navegador (toggle 2026/2027, Real × Budget 2026, trocar fonte) e mostrar prints. Aguardar o usuário.

### Tarefa 6: Dashboard e Cockpit

**Arquivos:**
- Modificar: `app.js` (`resolveDashCompareForYear`/`getDashCompare` ~8349–8372; `fetchScenariosForYear` ~8338)
- Modificar: `src/modules/cockpit/cockpitService.js` (favorito ~80, fontes `budget_*` ~87–92)
- Teste: ajustar `tests/cockpitService.test.js` e `tests/cockpit.test.js`

**Interfaces:**
- Consome: `resolveDefaultSource`.
- Produz: comparativo = estrela global (cenário de qualquer ano) ou "Budget {ano}"; leituras de `forecast_ledger_entries`/`forecast_monthly_account_totals` com `reference_year` **do cenário**; label da comparação com ano.

- [ ] **Passo 1:** ajustar os testes: favorito de ano ≠ período consultado é usado e consulta o ano do cenário; sem favorito usa o cenário "Budget {ano}" (não mais `budget_*`); `comparisonLabel` inclui o ano.
- [ ] **Passo 2:** rodar `node tests/cockpitService.test.js` e `node tests/cockpit.test.js`; esperado: FAIL.
- [ ] **Passo 3:** implementar em `cockpitService.js` (remover ramo `budget_*`) e em `getDashCompare`.
- [ ] **Passo 4:** rodar os dois testes; esperado: PASS. Conferir Dashboard e Cockpit no navegador. Aguardar o usuário.

### Tarefa 7: Desligar o Budget antigo (somente a pedido do usuário)

- [ ] **Passo 1:** só iniciar após o usuário validar os números das Tarefas 1–6 em uso real. Listar o que ainda lê `budget_*` (`grep -n "budget_ledger_entries\|budget_monthly_account_totals\|apply_budget_import_batch" app.js src`) e propor ao usuário remover (ou deixar como histórico). Não executar sem aprovação.

---

## Auto-revisão contra a spec

- Cobertura: nomes com ano/único/estrela global → T1; cópia do Budget → T2; camada de fontes e "Real {ano}" só com dados → T3; carga, sobrescrita e histórico simplificado → T4; DRE/Opex → T5; Dashboard/Cockpit → T6; desligar tabelas antigas → T7; fora de escopo declarado nas restrições globais.
- Risco de filial/lote da spec: o código já tolera ausência de `branch_code`/`lot_code` no cenário (`app.js` ~8480: "campos saem vazios no popover"); portanto não há coluna nova. Índices de drilldown por centro de custo no ledger de cenário **não** foram tratados: se o detalhamento ficar lento na T5, acrescentar uma migration de índices (equivalente às 022/023).
