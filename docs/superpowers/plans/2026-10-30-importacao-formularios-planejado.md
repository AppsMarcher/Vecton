# Importação de Planejado nos formulários — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar lançamentos por Excel nos formulários 01–09 e no FAT do cenário (só administrador), com lançamento sem centro de custo, prevalência do FAT/CPX sobre o 08/04, e ajustar a carga de planejado vendas.

**Architecture:** Migration `332` torna `planning_entries.cost_center_id` opcional e cria RPCs novas (`planning_import_entries`, `planning_key_conflicts`, `planning_ledger_resolve_overlaps`, `planning_fat_import`) sem reescrever o corpo de `planning_write`; o que precisa mudar dentro dele entra por *wrapper* (padrão da migration `319`). O front estende `planningImportModule.js` (leitura do Excel, painel de status) e o seletor de centros de custo da grade.

**Tech Stack:** PostgreSQL/Supabase (migrations numeradas em `supabase/`), JS puro no navegador, ExcelJS, testes `node tests/*.test.js` (PGlite para SQL, Edge/Playwright para navegador).

**Spec:** `docs/superpowers/specs/2026-10-30-importacao-formularios-planejado-design.md`

## Global Constraints

- Nunca commitar nem dar push sem o Ricardo pedir; os passos "Commit" abaixo só valem quando ele pedir. Commit = publicar na `main`.
- Migrations não são aplicadas pelo app: gerar o arquivo e avisar; quem aplica é o Ricardo (guiar passo a passo, ele é leigo em servidor).
- Textos de tela sem subtítulo ou ajuda; tooltip com `.cockpit-tip`; mensagens de erro amigáveis, em português, com linha do arquivo.
- Template dos formulários 01–09: colunas `Conta | Mês | Valor | Centro de custo`; Mês é número de 1 a 12; centro de custo opcional; ano é o do cenário.
- Chave do lançamento: conta + centro de custo + mês (centro de custo vazio vale como chave própria). Importação sempre substitui, sem checar versão, e sobe `row_version`.
- Qualquer erro bloqueia o arquivo inteiro. Número no formato de `parseLocalizedAmount` (`src/core/utils.js`).
- Só administrador importa e só administrador vê/edita lançamento sem centro de custo; o servidor valida, não só o botão.
- Sinal sem conversão (faturamento negativo; impostos e matéria-prima positivos).
- FAT prevalece sobre o 08; CPX prevalece sobre o 04. Valor sem centro de custo vai ao razão sem centro de custo.
- CPX: botão Importar visível e sem ação. Painel de Vendas continua só do FAT.

## Review Focus

1. Arquivo com a mesma chave (conta + centro de custo + mês) em duas linhas: erro, nenhuma linha gravada.
2. Cabeçalho com acento/caixa diferente (`mes`, `MÊS`, ` Conta `) e linhas em branco no fim: aceito/ignorado, sem erro falso.
3. Mês que não recebe lançamento de formulário (copiado do Real/outro cenário) ou cenário bloqueado: erro claro.
4. Chamada direta da RPC por quem não é administrador: recusada.
5. Arquivo acima de 5.000 linhas (limite do lote do `save_entries`): erro de tamanho, não timeout.

---

## File Structure

- Create `supabase/332_planning_importacao.sql`: schema + RPCs + wrappers (uma migration, em `begin; … commit;`).
- Create `tests/planningImport.sql.test.js`: testes SQL (PGlite) das tarefas 1–5.
- Modify `src/modules/planning/planningImportModule.js`: leitura do Excel, validação de cabeçalho, chamada da RPC, painel de status.
- Modify `src/modules/planning/planningModule.js`, `planningViews.js`: seletor "sem centro de custo", alertas, CPX sem ação.
- Modify `src/modules/planning/planningFatModule.js`: importação do FAT.
- Modify `src/modules/comercial/comercialPlanejadoCargaModule.js` e `templates/`: filtro de cenários, obrigatoriedade, template.
- Modify `README.md` e `docs/planejamento-participativo.md`.

---

### Task 1: Lançamento sem centro de custo no banco

**Files:**
- Create: `supabase/332_planning_importacao.sql`
- Test: `tests/planningImport.sql.test.js` (seguir o arranque de `tests/planning.sql.test.js`)

**Interfaces:**
- Produces: `planning_entries.cost_center_id` aceita `null`; índice único `planning_entries_key` sobre `(line_id, cost_center_id, reference_month) nulls not distinct` no lugar da chave primária; leitura por RLS: `cost_center_id is null` só para administrador.

- [ ] **Step 1: Teste `entradas sem centro de custo`:** insere duas linhas com o mesmo `line_id`/mês e `cost_center_id null`; a segunda via `insert … on conflict(line_id,cost_center_id,reference_month) do update` atualiza em vez de duplicar (1 linha, `row_version = 2`).
- [ ] **Step 2: Rodar e ver falhar** (`node tests/planningImport.sql.test.js`; falha por `not null`).
- [ ] **Step 3: Migration:** `alter column cost_center_id drop not null`; `drop constraint planning_entries_pkey`; criar o índice único acima. Ajustar a policy `planning_entries_read` para `cost_center_id is null and <é admin>` (usar o helper de admin já usado nas outras policies). Conferir triggers e tabela `planning_entry_audit` (migration 278) por `not null` em `cost_center_id` e relaxar o necessário.
- [ ] **Step 4: Rodar o teste novo e `node tests/planning.sql.test.js`; ambos passam.**
- [ ] **Step 5: Commit** (só se o Ricardo pedir).

### Task 2: Salvar, ler e integrar sem centro de custo

**Files:**
- Modify: `supabase/332_planning_importacao.sql`
- Test: `tests/planningImport.sql.test.js`

**Interfaces:**
- Consumes: `planning_write(p_org, p_action, p_scenario, p_payload)` atual (wrapper da `319` sobre a base da `290`); `planning_read_form(p_org,p_form,p_cc_ids)`.
- Produces: `save_entries` aceita `cost_center_id: null` em células **só para administrador**; `planning_read_form` com `p_cc_ids = '{}'` devolve as entradas sem centro de custo (só administrador); `project` grava no razão linhas com `cost_center_id` e `cost_center_number` nulos.

- [ ] **Step 1: Testes:** (a) administrador salva célula `cost_center_id null` e `planning_read_form(…,'{}')` a devolve; (b) usuário comum recebe erro `Célula inválida ou fora do escopo`; (c) após `project`, existe uma linha no `forecast_ledger_entries` do formulário com `cost_center_id is null` e o valor salvo.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar por wrapper** (renomear `planning_write` para `planning_write_before_import`, revogar grants, criar o novo com o mesmo padrão da `319`): para `save_entries`, separar as células com centro de custo nulo (exige `is_admin`), gravá-las com o mesmo `insert … on conflict … row_version+1` e conflito por versão da `290`, e repassar as demais ao interno. Para `project` de formulário `opex`, chamar o interno e depois inserir no razão os lançamentos com centro de custo nulo (`history 'Planejamento: '||code`, `planning_form_id`). Em `planning_read_form`, tratar `p_cc_ids` vazio para administrador.
- [ ] **Step 4: Rodar os testes (novo e `planning.sql.test.js`); passam.**
- [ ] **Step 5: Commit** (só se o Ricardo pedir).

### Task 3: Prevalência do FAT e do CPX no razão

**Files:**
- Modify: `supabase/332_planning_importacao.sql`
- Test: `tests/planningImport.sql.test.js`

**Interfaces:**
- Produces: `planning_ledger_resolve_overlaps(p_scenario uuid) returns integer` (apaga do razão as linhas de formulário `opex` cuja chave `(account_number, cost_center_id is not distinct from, reference_month)` coincide com linha de formulário `fat` ou `capex`; devolve quantas apagou); chamada ao final de `planning_integrate_all` e dos `project` do FAT e do CPX.

- [ ] **Step 1: Testes:** (a) 08 sem centro de custo e FAT na mesma conta e mês: após integrar, só a linha do FAT; (b) 04 com centro de custo igual ao do CPX: só a do CPX; (c) 08 com centro de custo diferente do FAT (FAT é sem centro de custo): as duas permanecem; (d) a função devolve o número apagado.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar a função** e os wrappers de `planning_integrate_all` (renomear + embrulhar como na `319`), de `planning_fat_write` e de `planning_capex_write` para `project`.
- [ ] **Step 4: Rodar; passam, e `planningFat.sql.test.js` continua passando.**
- [ ] **Step 5: Commit** (só se o Ricardo pedir).

### Task 4: RPC de importação dos formulários

**Files:**
- Modify: `supabase/332_planning_importacao.sql`
- Test: `tests/planningImport.sql.test.js`

**Interfaces:**
- Produces: `planning_import_entries(p_org uuid, p_form uuid, p_rows jsonb) returns jsonb`. `p_rows` = `[{row:int, account:text, month:int, amount:text, cost_center:text|null}]` (amount já normalizado, ex. `"1234.56"`). Retorno: `{ok:true, replaced:int, inserted:int}` ou `{ok:false, errors:[{row:int, message:text}]}` — nada é gravado se houver erro.

- [ ] **Step 1: Testes** (um por caso, mensagens exatas em português):
  - não administrador → exceção `Somente o administrador importa`;
  - conta não cadastrada → erro `Linha 3: conta 123 não cadastrada`;
  - conta que não é linha digitável do formulário → `Linha 3: a conta 123 não é uma linha digitável deste formulário`;
  - centro de custo informado e não cadastrado → `Linha 3: centro de custo 9 não cadastrado`;
  - mês fora de 1–12 ou sem lançamento de formulário → `Linha 3: o mês 5 não recebe lançamento deste formulário`;
  - valor inválido → `Linha 3: valor inválido`;
  - chave repetida no arquivo → erro nas duas linhas;
  - linha em conflito com FAT (08) ou CPX (04) → `Linha 3: o FAT prevalece sobre esta chave` / `o CPX prevalece …`;
  - arquivo com mais de 5.000 linhas → `O arquivo passa do limite de 5.000 linhas`;
  - sucesso: chave existente é substituída (`row_version` sobe) e chave nova é incluída; linhas do formulário não citadas ficam intactas.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** a função (`security definer`, `set search_path=public`): checar admin, cenário não bloqueado (`planning_scenario_locked` equivalente já usado na `320`), coletar **todos** os erros antes de gravar, gravar em comando único com `on conflict … do update`.
- [ ] **Step 4: Rodar; passam.**
- [ ] **Step 5: Commit** (só se o Ricardo pedir).

### Task 5: Alertas de conflito (integrar e digitar)

**Files:**
- Modify: `supabase/332_planning_importacao.sql`, `src/modules/planning/planningModule.js`, `src/modules/planning/planningFatModule.js`
- Test: `tests/planningImport.sql.test.js`, `tests/planning.browser.test.js`

**Interfaces:**
- Produces: `planning_key_conflicts(p_org uuid, p_form uuid, p_cells jsonb) returns jsonb` → `[{account_number, month, cost_center_number|null, source:'FAT'|'CPX'}]` para chaves (conta + centro de custo + mês) de um formulário `opex` que já existem no FAT/CPX do cenário; `planning_capex_overlap(p_org uuid, p_form uuid)` com o mesmo retorno de `planning_fat_overlap`; `planning_fat_overlap` passa a considerar só entradas sem centro de custo.
- Consumes: `deps.modal(title, html, run, info, confirmLabel)` do módulo de planejamento; `views.overlapModal(rows)`.

- [ ] **Step 1: Testes SQL** das três funções (chave igual → retorna; centro de custo diferente → não retorna). **Teste de navegador:** ao salvar uma célula do 08 cuja chave coincide, aparece o modal informativo "Valores também no FAT" (só "Entendi") e a célula não é salva; ao integrar com conflito do CPX aparece o modal de integração.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** as funções e ligar os modais: antes de `save` do formulário `opex` chamar `planning_key_conflicts` e, havendo conflito, mostrar o modal e **não salvar**; no wrapper de `planning_write` (Task 2) recusar no servidor `save_entries` de formulário `opex` com chave em conflito (`Valor já alimentado pelo FAT/CPX`); antes de integrar, chamar `planning_fat_overlap` e `planning_capex_overlap`.
- [ ] **Step 4: Rodar os testes; passam.**
- [ ] **Step 5: Commit** (só se o Ricardo pedir).

### Task 6: Grade com "sem centro de custo"

**Files:**
- Modify: `src/modules/planning/planningModule.js`, `src/modules/planning/planningViews.js`
- Test: `tests/planning.browser.test.js`

**Interfaces:**
- Consumes: `planning_read_form` com `p_cc_ids = []` e `save_entries` com `cost_center_id: null` (Task 2); `key(l, cc, m)` do módulo.
- Produces: para administrador em modo de edição, desmarcar todos os centros de custo seleciona o modo "sem centro de custo" (`selectedCC = []`), que lê e edita as células sem centro de custo; para os demais perfis, desmarcar todos continua não permitido.

- [ ] **Step 1: Teste de navegador:** como administrador, desmarcar todos os centros de custo mostra a grade editável; digitar e salvar chama `planning_write` com `cost_center_id: null`; como usuário comum o seletor não deixa ficar vazio.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** a regra de seleção vazia no seletor de centros e no `key()`, usando `'null'` como parte da chave de célula.
- [ ] **Step 4: Rodar `node tests/planning.browser.test.js`; passa.**
- [ ] **Step 5: Commit** (só se o Ricardo pedir).

### Task 7: Importar nos formulários 01–09 (popover) e CPX sem ação

**Files:**
- Modify: `src/modules/planning/planningImportModule.js`, `src/modules/planning/planningModule.js`
- Test: `tests/planning.browser.test.js`

**Interfaces:**
- Consumes: `planning_import_entries` (Task 4); `parseLocalizedAmount` (`src/core/utils.js`).
- Produces: `createImportPopover({ esc, scenarioName, formInfo, importRows })` onde `importRows(rows) → Promise<{ok, errors?, replaced?, inserted?}>`; o painel de status lista cada erro como `Linha N: mensagem` (padrão de aviso amigável) e, no sucesso, mostra substituídos e incluídos.

- [ ] **Step 1: Testes de navegador:** (a) template com cabeçalho `Conta | Mês | Valor | Centro de custo`; (b) arquivo com erro (RPC simulada devolve `errors`) → painel lista as linhas e nada é aplicado; (c) arquivo válido → painel mostra "N linhas importadas"; (d) cabeçalho `mes`/`MÊS` aceito, linhas finais em branco ignoradas; (e) no CPX o botão existe e o clique não abre popover.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** a leitura (ExcelJS), a normalização do cabeçalho (sem acento, minúsculas), a montagem de `p_rows` e a chamada; trocar o placeholder atual de `upload` (que só confere o cabeçalho). Remover o template provisório do CPX e deixar a ação `import-form` sem efeito para `form_type === 'capex'`.
- [ ] **Step 4: Rodar; passa.**
- [ ] **Step 5: Commit** (só se o Ricardo pedir).

### Task 8: Importar no FAT

**Files:**
- Modify: `supabase/332_planning_importacao.sql`, `src/modules/planning/planningFatModule.js`, `src/modules/planning/planningModule.js`
- Create: `templates/modelo-importacao-fat.xlsx` (cópia de `templates/modelo-carga-vendas-planejado.xlsx` com os mesmos campos: `cod_produto, mes, territorio, quantidade, valor, MC1%`)
- Test: `tests/planningFat.sql.test.js`, `tests/planningFat.browser.test.js`

**Interfaces:**
- Produces: `planning_fat_import(p_org uuid, p_form uuid, p_rows jsonb) returns jsonb`, mesmo retorno de `planning_import_entries`; `p_rows` = `[{row, cod_produto, month, territorio, quantidade, valor, mc1}]`. Regra: volume obrigatório; valor obrigatório só para Peças; vazio assume as premissas do formulário. Só administrador; qualquer erro bloqueia tudo. Grava os volumes do formulário FAT (mesma tabela e regras do caminho que a migration `323` usa hoje).
- Consumes: leitura do Excel e painel de status da Task 7.

- [ ] **Step 1: Testes SQL:** volume ausente em máquina → erro; Peças sem valor → erro; Peças com valor e sem volume → aceito; produto/território não cadastrado → erro; sucesso grava volumes. **Navegador:** botão Importar do FAT abre o popover e o template baixado tem o cabeçalho acima.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** a RPC (reaproveitar as validações de produto/território da carga de planejado atual) e o botão do FAT, que passa a chamar `planning_fat_import`.
- [ ] **Step 4: Rodar; passam.**
- [ ] **Step 5: Commit** (só se o Ricardo pedir).

### Task 9: Carga de planejado vendas (cenários sem formulário)

**Files:**
- Modify: `src/modules/comercial/comercialPlanejadoCargaModule.js`, `templates/modelo-carga-vendas-planejado.xlsx`, a função de validação por linha das migrations `323`–`329` (nova `create or replace` na `332`)
- Test: `tests/comercialScenarioSource.test.js` (ver como cobre a lista de cenários), novo caso no teste SQL

**Interfaces:**
- Produces: a lista de destinos da carga só traz cenários com `!planning_version && kind !== 'built'` (mesma regra de `src/core/scenarioSources.js:68`); campos obrigatórios `cod_produto, mes, territorio, quantidade, valor` (território dispensado em Peças); `MC1%` deixa de existir no template; erro bloqueia o arquivo inteiro.

- [ ] **Step 1: Testes:** (a) cenário com `planning_version` não aparece no seletor; (b) linha sem mês, sem território (máquina, Transgrain ou Acessórios), sem valor ou sem quantidade é recusada; (c) Peças sem território é aceita; (d) o link do template antigo some da tela.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** o filtro em `fetchScenarios` (hoje sem filtro, linha ~250), a obrigatoriedade no parse (`parseSheetRows`) e na validação do banco, e atualizar o template (remover `MC1%`, ajustar o texto "COMO PREENCHER").
- [ ] **Step 4: Rodar os testes; passam.**
- [ ] **Step 5: Commit** (só se o Ricardo pedir).

### Task 10: Documentação e fechamento

**Files:**
- Modify: `README.md` (seção Planejamento participativo e Cargas), `docs/planejamento-participativo.md`

- [ ] **Step 1:** Documentar importação por formulário (template, chave, substituição, bloqueio do arquivo, só administrador), lançamento sem centro de custo, prevalência FAT/CPX, alertas, carga de planejado vendas e a migration `332` (pré-requisito antes de publicar os assets).
- [ ] **Step 2:** Rodar `node tests/planning.browser.test.js`, `planningImport.sql.test.js`, `planning.sql.test.js`, `planningFat.sql.test.js`; os de FAT e CAPEX de navegador já falhavam antes (fonte `11.5px` e campo "Centro de usinagem CNC Jan"); registrar o resultado sem esconder.
- [ ] **Step 3:** Guiar o Ricardo passo a passo para aplicar a `332` e conferir na tela. **Commit** só quando ele pedir.

---

## Auto-revisão

- **Cobertura da spec:** template e chave (T4, T7); sem centro de custo (T1, T2, T6); quem importa (T4, T7, T8); 08/FAT e 04/CPX, três alertas, recusa da linha (T3, T4, T5); validação e número (T4, T7); FAT (T8); planejado vendas (T9); CPX sem ação (T7); Painel de Vendas sem mudança.
- **Decidido:** o alerta ao digitar bloqueia o salvamento da célula (cliente e servidor).
- **Risco:** `planning_write` e `planning_integrate_all` são reembrulhados por rename (padrão da `319`); a ordem de aplicação das migrations e o teste de regressão (`planning.sql.test.js`) protegem isso.
