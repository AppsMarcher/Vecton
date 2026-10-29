# FAT, projeção de vendas no Planejamento — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o formulário FAT (tipo `fat`) no Planejamento participativo: volume digitado por região, FAT/impostos/RL/MP calculados, integração no DRE somada ao formulário 08, e meta por modelo gravada no cenário.

**Architecture:** Dados e cálculo autoritativo em SQL (migrations 316 a 319, funções `security definer`, mesmo padrão do CAPEX: `planning_capex_*`, `planning_context` encadeado por renomear-e-envolver). O front ganha três arquivos novos (`planningFatCore.js`, `planningFatViews.js`, `planningFatModule.js`) que se ligam a `planningViews.js` e `planningModule.js` nos mesmos pontos em que o CPX se liga. O cálculo existe em SQL (integração) e em JS (prévia na tela) e os dois são testados com os mesmos números.

**Tech Stack:** PostgreSQL/Supabase (testes em PGlite), JavaScript sem build (globais `VECTON_*`), testes Node (`node tests/x.test.js`) e navegador (Playwright com Edge).

**Spec:** `docs/superpowers/specs/2026-10-28-fat-projecao-vendas-design.md` · Mockup: `artifacts/mockups/vecton-planejamento-fat.html`

## Global Constraints

- **Não commitar nem dar push.** O Ricardo só autoriza commit quando pede. Toda tarefa termina com os testes verdes, sem commit. Migrations **não** são aplicadas pelo app nem por este plano em produção.
- Textos de tela em português, **sem subtítulos, notas de rodapé ou textos de ajuda**; tooltip só via `.cockpit-tip` (`tipAttr`), nunca `title`.
- Migrations: números **316, 317, 318, 319** (o último existente é 315; 307 e 314 já têm duplicata). Cada arquivo começa com `begin;` e termina com `commit;`.
- Novo `form_type = 'fat'`, código **`FAT`**, nome **"Vendas · Projeção de volumes"**; `planning_forms_form_type_check` passa a aceitar `opex`, `capex`, `fat`.
- Percentuais padrão do FAT (% do FAT): **Máquinas e Transgrain** IPI 0, ICMS 4,10, PIS 1,00, COFINS 4,80; **Peças** IPI 1,92, ICMS 5,64, PIS 1,62, COFINS 7,46. Linhas de configuração: `maq`, `tra`, `pec`. **Sem CBS.**
- Premissa: média ponderada pelo volume dos **2 últimos meses fechados com venda** do modelo no **território** (recua mês a mês); sem venda no território, **média Marcher**; congelada ao liberar; o ajuste do admin sobrevive a "Atualizar premissas". Peças: premissa de MP é a razão **MP ÷ FAT**.
- Cálculo: `FAT = VOL × FAT/un`; `imposto_x = FAT × %_x`; `RL = FAT − Σimposto`; `MP = VOL × MP/un`; `MC1% = (RL − MP) ÷ RL`. Peças: `VOL = 1`, `FAT` digitado (bruto com IPI), `MP = FAT × MP/FAT`.
- Exportação: sem impostos (`RL = FAT`), tudo na conta **31101002**.
- Ledger: **sem centro de custo**, chave **conta × mês**, arredondar a 2 casas **depois** de agrupar, não gravar zero, histórico `FAT: FAT`. Sinais: receita **negativa** (31101001, 31101002, 31101006, 31101007); IPI 31203001, ICMS 31203002, COFINS 31203004, PIS 31203005 e MP 412010901 **positivos**.
- Só meses com `planning_scenario_months.source_type = 'forms'` entram na integração. A integração do FAT apaga e regrava **só** as linhas com `planning_form_id` do FAT; a do OPEX e a do CPX já preservam o que não é delas.
- O 08 nunca é lido para escrita nem alterado pelo FAT. Aviso de sobreposição **só ao Integrar**, sem bloquear.
- Formato visual igual ao Evolutivo de Margens: números inteiros com ponto de milhar, fontes 11,5 px (valores) e 10,5 px (cabeçalhos e grupos), linhas de 34 px, cinza `var(--panel-alt)` nos destaques, campos de digitação sem borda, **sem setas de variação**.

## Decisões do Ricardo sobre região (28/10/2026)

1. **Região = território (UF)** do cadastro `comercial_atribuicao_responsavel` (vigente). Filtrar uma região mostra o **formulário inteiro**: máquinas (Grãos e Pecuária), Cargograin e Transgrain, não só a linha. A chave é `region_key = territorio_id::text`; o rótulo é o nome do território (por exemplo `BA`).
2. **Peças é uma região própria** (atribuição sem território, responsável JENIFER VIANA, linha `Peças`), com `region_key = 'PECAS'`, e **coincide com a coordenação Peças**: abrir uma ou outra mostra a mesma tela.
3. **EX é a região da coordenação Exportação** (território `EX`, com as linhas Grão, Outros e Pecuária), com as regras da §8 da spec.
4. **Coordenação de cada modelo numa região:** vem da atribuição vigente de (território × linha do modelo). Linha do modelo: Grãos e Cargograin → `Grão`; Pecuária → `Pecuária`; Transgrain → `Outros`; Peças → `Peças`. Por isso um território pode ter modelos em coordenações diferentes (por exemplo, BA tem Grão e Outros na Norte e Pecuária na coordenação Pecuária), e a visão Coordenação soma cada modelo na coordenação da sua linha.
5. **Acesso** é por região (território), então quem tem acesso a `BA` vê e digita todos os grupos de `BA`.

## Review Focus

1. Modelo sem venda no local **e** sem venda na Marcher: linha pendente, não integra, retorno informa quantas ficaram de fora (Task 2 e 5).
2. Volume salvo em mês cuja fonte deixou de ser "formulário": sai da integração (Task 3 e 5).
3. Reintegrar duas vezes seguidas: não duplica e não toca OPEX, CPX nem 08 (Task 5).
4. Pessoa com acesso a uma região só: Coordenação e Marcher somam apenas o que ela pode ver (Task 4).
5. Volume negativo, vazio ou não numérico, e lote com célula repetida: recusados sem salvar nada (Task 4).

## Estrutura de arquivos

Criar:
- `supabase/316_planning_fat_schema.sql` — tipo `fat`, tabelas, auditoria, regiões, modelos.
- `supabase/317_planning_fat_premises.sql` — cálculo das premissas.
- `supabase/318_planning_fat_engine.sql` — cálculo (`planning_fat_calculate`), leitura e escrita, sobreposição, meta.
- `supabase/319_planning_fat_integration.sql` — `planning_integrate_all`, `planning_context`, clone e criação do formulário.
- `src/modules/planning/planningFatCore.js` — cálculo e agregação puros.
- `src/modules/planning/planningFatViews.js` — telas (HTML a partir do estado).
- `src/modules/planning/planningFatModule.js` — estado, RPCs e eventos do FAT.
- `tests/helpers/planningFatDb.js`, `tests/planningFat.sql.test.js`, `tests/planningFatCore.test.js`, `tests/planningFat.browser.test.js`.

Modificar: `src/modules/planning/planningViews.js` (bloco FAT na lista), `src/modules/planning/planningModule.js` (abrir o FAT, Integrar), `src/modules/planning/planning.css`, `index.html` (scripts e `?v=`), `docs/planejamento-participativo.md`, `README.md`, `supabase/_referencia/planning_write_atual.sql` (comentário apontando o envoltório).

---

### Task 1: Esquema, regiões e modelos (migration 316)

**Files:**
- Create: `supabase/316_planning_fat_schema.sql`, `tests/helpers/planningFatDb.js`, `tests/planningFat.sql.test.js`

**Interfaces:**
- Produces (SQL): tabelas `planning_fat_models`, `planning_fat_volumes`, `planning_fat_premises`, `planning_fat_taxes`, `planning_fat_access`, `planning_fat_premise_runs`, `planning_fat_meta`; funções `planning_fat_regions(p_org uuid) returns table(region_key text, territory_id uuid, label text, responsibles text[])` e `planning_fat_model_coordination(p_org uuid, p_region_key text, p_model_key text) returns table(coordination_id uuid, coordination_name text)` e `planning_fat_seed_models(p_org uuid, p_scenario uuid) returns integer`.
- Produces (teste): `createDb() -> { db, ids }` em `tests/helpers/planningFatDb.js`, que carrega a lista de migrations de `tests/planning.sql.test.js` (linha 28 em diante, até a 295) mais as migrations FAT já existentes, e cria as tabelas mínimas `comercial_territorios`, `comercial_linhas_negocio`, `comercial_coordenacoes`, `comercial_atribuicao_responsavel`, `comercial_tipos`, `comercial_produtos`, `comercial_realizado_ledger_entries` (colunas reais: `produto_id, territorio_id, linha_negocio_id, coordenacao_id, origem, quantidade, valor, rl, mp, reference_year, reference_month`).

- [ ] **Step 1: Write the failing tests** em `tests/planningFat.sql.test.js`: `form_type 'fat' é aceito e 'xyz' é recusado`; `planning_fat_regions devolve uma região 'BA' com os responsáveis PENINHA e os de Pecuária`; `a região de Peças tem territory_id nulo, region_key 'PECAS' e label 'Peças'`; `a região EX existe`; `o modelo INGRAIN100 em BA pertence à coordenação Norte, o INGRAIN90 em BA à coordenação Pecuária e o Transgrain em BA à Norte (atribuição de Outros)`; `planning_fat_seed_models cria TRANSGRAIN 170 (04003306), TRANSGRAIN 215 (08203065), TRANSGRAIN IN-65 (09003310) e TRANSGRAIN IN-90 (09103075 e 09103100)`; `cria um modelo por nome_reduzido de Máquinas, com grupo Cargograin quando nome_reduzido começa por CARGOGRAIN e, senão, o nome da cultura (Grãos ou Pecuária)`; `cria o modelo PECAS com todos os produtos de tipo Peças`.
- [ ] **Step 2: Run** `node tests/planningFat.sql.test.js` (com `PLANNING_PGLITE_TEST_LIB` apontando para o `@electric-sql/pglite`). Expected: FAIL ("function planning_fat_regions does not exist").
- [ ] **Step 3: Implement** `supabase/316_planning_fat_schema.sql`. Chaves: `planning_fat_volumes` PK `(form_id, region_key, model_key, reference_month)`, `amount numeric(18,4) check (amount >= 0)`, `row_version int default 1`; `planning_fat_premises` única por `(scenario_id, region_key, model_key)` com `region_key = 'marcher'` para a média Marcher, colunas `fat_unit, mp_unit, origin ('local'|'marcher'), window_months int[]` (yyyymm), `adj_fat`, `adj_mp` nulos, `calculated_at`; `planning_fat_taxes` PK `(scenario_id, line)` com `line in ('maq','tra','pec')`, quatro colunas `numeric(7,4) >= 0`; `planning_fat_access` PK `(form_id, user_id, region_key)` com `mode in ('read','write')`; `planning_fat_models` com `group_name in ('Grãos','Pecuária','Cargograin','Transgrain','Linhas complementares')`, `fat_driven boolean` (verdadeiro só no PECAS) e `product_ids uuid[]`. RLS ligado e `revoke all ... from public, anon, authenticated` em todas, como `290_planning_capex.sql:44-82`; gatilho de auditoria `planning_fat_audit()` no molde de `planning_capex_audit()` (`290:66`). `planning_fat_regions` lê atribuições vigentes (`data_inicio <= current_date and (data_fim is null or data_fim >= current_date)`).
- [ ] **Step 4: Run** o teste. Expected: PASS.

### Task 2: Premissas (migration 317)

**Files:**
- Create: `supabase/317_planning_fat_premises.sql`
- Modify: `tests/planningFat.sql.test.js`

**Interfaces:**
- Consumes: Task 1 (tabelas e `planning_fat_regions`).
- Produces: `planning_fat_calc_premises(p_org uuid, p_scenario uuid, p_asof date default current_date) returns jsonb` → `{rows int, pending int, window_months int[]}`; grava `planning_fat_premises` preservando `adj_fat`/`adj_mp` e insere uma linha em `planning_fat_premise_runs (scenario_id, user_id, run_at, window_months, rows)`.

- [ ] **Step 1: Write the failing tests:** `premissa do território usa os 2 últimos meses fechados com venda (Set e Ago): FAT/un 53000 e MP/un 25400` (Set: qtd 2, valor 106000, mp 50800; Ago: qtd 1, valor 53000, mp 25400); `recua quando Set não tem venda: janela [202608, 202607]`; `sem venda no território usa a média Marcher e origin 'marcher'`; `sem venda em lugar nenhum fica pendente e conta em pending`; `Atualizar premissas não apaga adj_fat nem adj_mp`; `Peças grava MP/FAT = 0.364 quando MP 36400 e FAT 100000`; `mês corrente não conta como fechado`.
- [ ] **Step 2: Run** o teste. Expected: FAIL.
- [ ] **Step 3: Implement** a função. Fonte: `comercial_realizado_ledger_entries` com `origem = 'FAT'`, filtrando `territorio_id` da região e `produto_id = any(product_ids)` do modelo; `fat_unit = sum(valor)/sum(quantidade)`, `mp_unit = sum(mp)/sum(quantidade)`; olhar até 24 meses para trás. Marcher: mesma conta sobre todos os territórios. Peças: `mp_unit = sum(mp)/sum(valor)` e `fat_unit = 1`.
- [ ] **Step 4: Run** o teste. Expected: PASS.

### Task 3: Cálculo para o ledger (migration 318, parte 1)

**Files:**
- Create: `supabase/318_planning_fat_engine.sql`
- Modify: `tests/planningFat.sql.test.js`

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces: `planning_fat_calculate(p_form uuid, p_cells jsonb default '[]') returns table(account_number text, reference_month integer, amount numeric)` (`p_cells` = rascunho `[{region_key, model_key, month, amount}]`, como em `planning_capex_calculate`).

- [ ] **Step 1: Write the failing tests** (premissa FAT/un 53000 e MP/un 25400, volume 8, impostos `maq` padrão): `31101001 = -424000`, `31203002 = 17384`, `31203005 = 4240`, `31203004 = 20352`, `412010901 = 203200`; `Exportação: tudo em 31101002 = -424000 e nenhum imposto`; `Transgrain vai para 31101007 usando a linha tra`; `Peças com FAT 330000: 31101006 = -330000, 31203001 = 6336, 31203002 = 18612, 31203005 = 5346, 31203004 = 24618, 412010901 = 120120`; `mês sem fonte forms não gera linha`; `valor zero não gera linha`; `modelo sem premissa é ignorado`; `soma de duas regiões é arredondada depois de agrupar (duas linhas de 0,004 viram 0,01, não 0,00)`.
- [ ] **Step 2: Run** o teste. Expected: FAIL.
- [ ] **Step 3: Implement** a função. Premissa efetiva = `coalesce(adj, calculada)` da região, senão a de `region_key = 'marcher'`. Classe do modelo: `Transgrain` → `tra`, `Linhas complementares` → `pec`, demais → `maq`. Coordenação Exportação = `coordination_name = 'Exportação'`.
- [ ] **Step 4: Run** o teste. Expected: PASS.

### Task 4: Leitura e escrita (migration 318, parte 2)

**Files:**
- Modify: `supabase/318_planning_fat_engine.sql`, `tests/planningFat.sql.test.js`

**Interfaces:**
- Consumes: Tasks 1 a 3.
- Produces: `planning_fat_read(p_org uuid, p_form uuid, p_cells jsonb default '[]') returns jsonb` → `{regions, models, volumes, premises, taxes, stale, window_months, revision}` (só regiões autorizadas); `planning_fat_write(p_org uuid, p_action text, p_scenario uuid, p_payload jsonb default '{}') returns jsonb` com as ações `save_volumes` (≤ 5.000 células, versão por célula e `form_revision`), `save_taxes`, `refresh_premises`, `adjust_premise`, `clear_adjust`, `set_status`, `save_access`; envoltório `planning_write` que recusa ações estruturais em formulário `fat` ("Use as operações autorizadas do FAT") como `planning_write` faz com o CAPEX (`_referencia/planning_write_atual.sql:105`).

- [ ] **Step 1: Write the failing tests:** `escrita numa região sem acesso é recusada`; `leitor não grava`; `Marcher e Coordenação somam só as regiões autorizadas` (pessoa com uma região); `conflito de versão devolve o lote sem salvar nada`; `volume negativo, vazio e texto são recusados e nada é salvo`; `célula repetida no lote é recusada`; `só admin chama save_taxes, refresh_premises, adjust_premise`; `stale é verdadeiro só quando existe mês fechado depois da janela da última atualização`; `cenário bloqueado recusa tudo, inclusive admin`; `refresh_premises registra quem, quando e a janela em planning_fat_premise_runs`.
- [ ] **Step 2: Run** o teste. Expected: FAIL.
- [ ] **Step 3: Implement** as funções, reutilizando `planning_is_admin`, `planning_form_mode` e o controle de `lock` de `290_planning_capex.sql:126-215`. Acesso: `planning_fat_access`; admin vê tudo. Adicionar um comentário em `_referencia/planning_write_atual.sql` apontando o envoltório.
- [ ] **Step 4: Run** o teste. Expected: PASS.

### Task 5: Integração, sobreposição e meta (migration 318, parte 3, e 319)

**Files:**
- Modify: `supabase/318_planning_fat_engine.sql`, `tests/planningFat.sql.test.js`
- Create: `supabase/319_planning_fat_integration.sql`

**Interfaces:**
- Consumes: Task 3 (`planning_fat_calculate`).
- Produces: ação `project` em `planning_fat_write` → `{ok, rows_written, pending, skipped}`; `planning_fat_overlap(p_org uuid, p_form uuid) returns table(account_number text, months int[])` (contas e meses em que o FAT vai gravar **e** o 08 tem valor salvo); `planning_fat_meta_rows(p_form uuid)` e gravação em `planning_fat_meta (scenario_id, model_key, territory_id, coordination_id, reference_month, volume, fat, rl, mp)`; `planning_integrate_all` (substitui a de `295_planning_integrate_all.sql`) integra OPEX, CAPEX **e FAT** e devolve também a chave `fat`.

- [ ] **Step 1: Write the failing tests:** `project só roda com o formulário liberado`; `apaga e regrava só as linhas do FAT: linhas do 08 e do CPX permanecem iguais`; `reintegrar duas vezes dá o mesmo ledger (sem duplicar)`; `registra planning_runs e planning_audit_log`; `mês que deixou de ser forms sai`; `pending informa quantas linhas ficaram sem premissa`; `planning_fat_overlap lista 31101001 em jan a mar quando o 08 tem valor nesses meses e o FAT também`; `planning_fat_overlap vazio quando o 08 não tem valor`; `a meta é gravada por modelo × território × coordenação × mês e a reintegração a substitui sem tocar planejado de arquivo`; `planning_integrate_all roda as três integrações e mantém o resultado de cada uma`.
- [ ] **Step 2: Run** o teste. Expected: FAIL.
- [ ] **Step 3: Implement.** `project` segue `290_planning_capex.sql:196-215` (apaga `forecast_ledger_entries` do cenário com `planning_form_id` de formulário `fat`, insere o resultado de `planning_fat_calculate(fid)` onde `amount <> 0`, `history = 'FAT: FAT'`, sem centro de custo). O envoltório de `planning_integrate_all` chama `planning_fat_write(..., 'project', ...)` quando o FAT existe, está liberado e a pessoa tem escrita.
- [ ] **Step 4: Run** o teste. Expected: PASS.

### Task 6: Contexto, clonagem e criação do formulário (migration 319)

**Files:**
- Modify: `supabase/319_planning_fat_integration.sql`, `tests/planningFat.sql.test.js`

**Interfaces:**
- Produces: `planning_context` devolve `fat_enabled: true` e os dados do FAT (modelos, taxas, regiões autorizadas) por envoltório (`planning_context_before_fat`); `planning_clone_form` copia taxas, modelos e acessos do FAT e as premissas conforme `p_options->>'copy_values'`; novo cenário participativo ganha o formulário FAT em construção com `maq`, `tra` e `pec` nos percentuais padrão e os modelos semeados.

- [ ] **Step 1: Write the failing tests:** `cenário novo nasce com formulário FAT em draft`; `taxas padrão: maq e tra 0/4.10/1.00/4.80, pec 1.92/5.64/1.62/7.46`; `planning_context lista o FAT para quem tem acesso e não lista dados de regiões sem acesso`; `copiar cenário copia taxas e acessos e, com copy_values, premissas; sem copy_values não copia volumes`; `excluir o cenário remove tudo do FAT`; `código FAT é reservado ao tipo fat`.
- [ ] **Step 2: Run** o teste. Expected: FAIL.
- [ ] **Step 3: Implement** seguindo o padrão do CAPEX (`290_planning_capex.sql:216-262`).
- [ ] **Step 4: Run** `node tests/planningFat.sql.test.js` **e** `node tests/planning.sql.test.js`. Expected: PASS nos dois (nada do OPEX e do CPX regride).

### Task 7: Núcleo de cálculo no front

**Files:**
- Create: `src/modules/planning/planningFatCore.js`, `tests/planningFatCore.test.js`

**Interfaces:**
- Produces: `window.VECTON_PLANNING_FAT_CORE = { taxSum, resolvePremise, cell, add, metric, mc1, dreLines }` com
  `taxSum(tax: {ipi,icms,pis,cofins}): number` (soma em %);
  `resolvePremise(local: P|null, marcher: P|null): {fat_unit, mp_unit, origin: 'local'|'marcher'|'adjusted'|null}` (ajuste do admin vence; sem local usa Marcher; nenhum devolve `origin: null`);
  `cell(premise, tax, volume: number, opts?: {exportation?: boolean, fatDriven?: boolean}): {q, fat, rl, mp}`;
  `add(a, b): cell`; `metric(cell, key: 'vol'|'fat'|'rl'|'mp'|'mb'): number|null` (valor unitário, `null` sem volume);
  `dreLines(parts: {maq, tra, exp, pec}, taxes): {accounts: Record<string, number[12]>, rl: number[12], mp: number[12], mpPct: (number|null)[12]}` com as contas e sinais positivos de exibição.

- [ ] **Step 1: Write the failing tests** com os mesmos números da Task 3: `cell com volume 8, FAT/un 53000, MP/un 25400 e maq dá fat 424000, rl 382024, mp 203200`; `taxSum(maq) = 9.9 e taxSum(pec) = 16.64`; `Peças com FAT 330000 dá rl 275088 e mp 120120 com vol 1`; `Exportação dá rl = fat`; `metric(vol 0) = null`; `mc1 do total usa a soma de RL e MP, não a média das MC1`; `resolvePremise prefere ajuste, depois local, depois Marcher`; `dreLines soma Transgrain em 31101007 e Exportação em 31101002 e fecha rl = Σfat − Σimpostos`.
- [ ] **Step 2: Run** `node tests/planningFatCore.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** o módulo no padrão de `planningCore.js` (IIFE que pendura em `window`; `module.exports` não é usado).
- [ ] **Step 4: Run** o teste. Expected: PASS.

### Task 8: Telas do FAT

**Files:**
- Create: `src/modules/planning/planningFatViews.js`
- Modify: `src/modules/planning/planning.css`

**Interfaces:**
- Consumes: `VECTON_PLANNING_FAT_CORE` (Task 7).
- Produces: `window.VECTON_PLANNING_FAT_VIEWS = { form, grid, premises, dreBlock, config, access, overlapModal, listBlock }`, todas **puras** (recebem o estado, devolvem HTML): `form(state)` com abas Preenchimento, Configuração e Acessos; `grid(state)` com toggle `Marcher | Coordenação | Região`, seletor da região ou coordenação, toggle `VOL | FAT | RL | MP | MC1%`, colunas 2025, 2026 e Jan a Dez e 2027, totalizador `Total <visão>`, subtotais por grupo, bolinhas de origem; `premises(state)` recolhível (abre recolhido); `dreBlock(state)` recolhível com a ordem **Faturamento, Impostos, Receita líquida, linha em branco, Matéria-prima, % MP / RL**; `config(state)` com a tabela de percentuais (Máquinas, Transgrain, Peças × IPI, ICMS, PIS, COFINS); `overlapModal(rows)` com "Cancelar" e "Integrar mesmo assim"; `listBlock(form)` para o bloco FAT abaixo do CPX.

- [ ] **Step 1: Write the failing test** em `tests/planningFat.browser.test.js` (molde de `tests/planningCapex.browser.test.js`: `setContent`, `addScriptTag` de `planningCore`, `planningFatCore`, `planningViews`, `planningFatViews`, `planningModule`, RPCs simuladas): `a grade tem 15 colunas e a largura das colunas é a mesma em VOL, FAT, RL, MP e MC1%`; `os números têm 11,5 px e os cabeçalhos 10,5 px`; `o totalizador se chama "Total Marcher", "Total Peças" e "Total <território>"`; `em Peças aparece só a linha Peças com campos em FAT e VOL = 1`; `em Exportação o RL é igual ao FAT`; `filtrar a região BA mostra os 4 grupos (Grãos, Pecuária, Cargograin e Transgrain)`; `a região Peças e a coordenação Peças abrem a mesma tela`; `a região EX e a coordenação Exportação seguem a regra de exportação`; `não existe subtítulo, nota nem texto de ajuda na tela`; `a ordem do terceiro bloco é Faturamento, Impostos, Receita líquida, linha em branco, Matéria-prima, % MP / RL`; `a faixa de premissas só aparece com stale = true`; `nenhum elemento usa o atributo title`.
- [ ] **Step 2: Run** `node tests/planningFat.browser.test.js` (com `PLANNING_PLAYWRIGHT_LIB`). Expected: FAIL.
- [ ] **Step 3: Implement** as telas copiando a estrutura e o CSS do mockup `artifacts/mockups/vecton-planejamento-fat.html` para `planning.css` (prefixo `fat-`, usando os tokens do Vecton nos dois temas).
- [ ] **Step 4: Run** o teste. Expected: PASS.

### Task 9: Módulo do FAT e ligação ao Planejamento

**Files:**
- Create: `src/modules/planning/planningFatModule.js`
- Modify: `src/modules/planning/planningViews.js` (`formsList`: bloco FAT abaixo do CPX, sem numeração), `src/modules/planning/planningModule.js` (abrir o FAT; botão **Integrar** passa a chamar `planning_integrate_all` com o aviso), `index.html` (três `<script>` novos entre `planningCore.js` e `planningViews.js`, e `?v=` novos nos quatro arquivos alterados)
- Modify: `tests/planningFat.browser.test.js`

**Interfaces:**
- Consumes: Tasks 4 a 6 (RPCs) e 8 (telas).
- Produces: `VECTON_PLANNING_FAT.createFatController(deps) -> { open(formId), integrate(), render() }`. Fluxo: `open` chama `planning_fat_read` (com `p_cells` do rascunho para a prévia); salvar chama `planning_fat_write('save_volumes', ...)` com versão por célula; **Integrar** chama `planning_fat_overlap` primeiro, abre `overlapModal` se houver linhas e, só depois de "Integrar mesmo assim" (ou se não houver sobreposição), chama `planning_integrate_all`.

- [ ] **Step 1: Write the failing tests** (navegador, RPCs simuladas): `Integrar sem sobreposição chama planning_integrate_all direto`; `Integrar com sobreposição abre a confirmação e não chama nada até confirmar`; `Cancelar não chama planning_integrate_all`; `Salvar valores não consulta a sobreposição`; `rascunho local sobrevive a recarregar e é descartado se a revisão mudou`; `conflito de versão mostra o aviso e não perde o rascunho`; `ao escolher a coordenação Peças a métrica abre em FAT`; `alterar um percentual na Configuração recalcula grade, premissas e terceiro bloco`; `o botão Atualizar premissas só existe para admin`; `usuário sem escrita vê campos somente leitura`.
- [ ] **Step 2: Run** `node tests/planningFat.browser.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** o controlador e as ligações. Seguir os pontos em que o CPX é tratado em `planningModule.js` (`capexWrite`, `rpc('planning_capex_read', ...)`, `case 'capex-...'`) e em `planningViews.js` (`formsList`, `capexForm`).
- [ ] **Step 4: Run** `node tests/planningFat.browser.test.js`, `node tests/planning.browser.test.js` e `node tests/planningCapex.browser.test.js`. Expected: PASS nos três.

### Task 10: Documentação e verificação final

**Files:**
- Modify: `docs/planejamento-participativo.md` (nova seção "FAT (migrations 316 a 319)": regras, ordem de aplicação, homologação), `README.md` (uma linha no módulo Planejamento)

- [ ] **Step 1: Escrever a seção** com: ordem de aplicação (316, 317, 318, 319, antes de publicar os assets), regra de soma 08 + FAT, aviso ao Integrar, premissas, impostos e a nota de que a leitura da meta pelo Painel de Vendas é um plano à parte.
- [ ] **Step 2: Rodar tudo:** `node tests/planningFatCore.test.js`; `node tests/planningFat.sql.test.js`; `node tests/planning.sql.test.js`; `node tests/planningFat.browser.test.js`; `node tests/planning.browser.test.js`; `node tests/planningCapex.browser.test.js`; `node tests/planningCore.test.js`. Expected: todos PASS.
- [ ] **Step 3: Conferir** `git status`: nenhum arquivo foi commitado e nenhuma migration foi aplicada no banco. Deixar os arquivos locais para o Ricardo revisar.

---

## Fora deste plano (plano à parte)

- **Leitura da meta pelo Painel de Vendas:** o seletor de cenário e as RPCs `comercial_painel_*` passarem a ler `planning_fat_meta` (nível de modelo). Este plano grava a meta, mas não altera o Painel.
- **Edição pelo admin da lista de modelos, das regiões e da regra do histórico na aba Configuração:** nesta versão os modelos são semeados do cadastro e a regra de 2 meses é fixa; só os percentuais de impostos, as premissas e os acessos são editáveis.
- Pendências 1, 2, 4, 5 e 6 da spec (regra de impostos do Transgrain, amarração fina do responsável da Atribuição com o cadastro de integrantes (Time Comercial), Acessórios, carteira de Peças, exigência de centro de custo só no OPEX).
