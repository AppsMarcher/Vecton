# Análises e planos de ação de OPEX — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar, em bloco único, o acompanhamento orçamentário de OPEX (sinaleira, análise da variação, planos de ação com ciência/validação, anexos privados, sino + e-mail, Minhas ações, consolidado e popover de entrada) a partir do card "OPEX por Grupo de Despesa" do Cockpit.

**Architecture:** Módulo novo `src/modules/opexReview/` (regras puras, service de RPCs, views, coordenação) plugado em `cockpitWidgets`/`cockpitModule` só nas colunas novas e no clique da linha. Backend Supabase com tabelas `opex_*`, RPCs `SECURITY DEFINER` (DTO financeiro × DTO operacional separados), bucket privado, eventos transacionais para `notifications` + `notification_email_outbox`, claim real da outbox e job diário de lembretes.

**Tech Stack:** HTML/CSS/JS sem bundler (IIFEs em `window`), Supabase/PostgreSQL, Edge Function Deno (`send-notification-emails`), testes `node` + PGlite (`tests/*.sql.test.js`) + Playwright (`tests/*.browser.test.js`).

**Spec:** `artifacts/mockups/Vecton-Especificacao-Acompanhamento-OPEX-Codex.md` (mockup v8: `artifacts/mockups/vecton-cockpit-acompanhamento.html`). Em conflito, vale o bloco "Decisões fechadas" abaixo, depois a spec, nunca o HTML.

## Decisões fechadas (prevalecem sobre a spec)

| # | Decisão |
|---|---|
| D1 | Modelo próprio `opex_*`; não tocar no A3/Strategic |
| D2 | Entrega em bloco único |
| D3 | Consolidado = tela própria no menu, nome **"Análises e planos de ação"**; botão no card só navega até ela |
| D4 | Sinaleira do grupo = só cor da variação agregada, sem contador de contas vermelhas |
| D5 | Virada de mês em "Ano atual": análise do corte anterior permanece, com selo "base mudou"; reavaliar cria registro do novo corte |
| D6 | "Base mudou" = comparar revisão de carga (batch/revisão) guardada no snapshot, não hash de conteúdo |
| D7 | Snapshot calculado por RPC no servidor; o cliente nunca envia valores |
| D8 | Escrita: gestor/admin ativo com escopo no CC; **sem papel novo** |
| D9 | Dono perde acesso/é desativado → posse passa ao autor da análise (se ainda com escopo), senão gestor principal do CC, senão admin; evento + aviso ao executor e ao novo dono |
| D10 | Compartilhar anexo da análise com executor sem CC exige aviso + confirmação, registrado em evento |
| D11 | Lembretes: 08:00 America/Sao_Paulo, só dias úteis (seg–sex), 3 dias antes + vencida |
| D12 | Entrada: popover de pendências abre **antes** das Novidades; nunca dois overlays juntos |
| D13 | Impacto financeiro esperado: **um por análise**, coluna em `opex_variance_analyses`, nunca no DTO operacional |
| D14 | Análise: `analysis_state` (`in_analysis`\|`analyzed`) + `monitor boolean` |
| D15 | Corrigir claim da outbox (`FOR UPDATE SKIP LOCKED`) para **todos** os tipos de e-mail |
| D16 | Layout: coluna da sinaleira `position: sticky; right: 0` no drilldown; aba "Plano de ação · N" com contador |

## Global Constraints

- Cockpit preservado: 4 KPIs e 4 cards nas posições atuais; só entram botões compactos **Parâmetros** e **Análises e planos de ação** no cabeçalho do card de grupos.
- Colunas do grupo: ícone | Grupo | Real | Meta/comparativo | Var R$ | Var % | Sinaleira. Drilldown: ícone | Código conta | Conta | Código CC | CC | Real | Meta | Var R$ | Var % | Sinaleira. **Sinaleira é sempre a última coluna.**
- Sem textos de contagem sob nomes; célula do ícone vazia quando não há registro; linha de total sem ícone nem sinaleira.
- Sem subtítulos/notas/ajuda no app; tooltips só com `.cockpit-tip` (`tipAttr`), nunca `title`; tabelas com `th data-sort` e ↑↓, cor `var(--blue)` quando ativo.
- Sinaleira (defaults, configuráveis): vermelho `|Δ| ≥ 20000 OU |Δ%| ≥ 10`; amarelo (não vermelho) `|Δ| ≥ 10000 OU |Δ%| ≥ 5`; verde caso contrário. `Δ% = |real−comp| / |comp| × 100`. Base ausente → "—"; `comp=0 e real=0` → verde; `comp=0 e real≠0` → vermelho, "Sem base". Mesmos limites para mês/YTD/ano.
- Estados da ação: `awaiting_ack`, `in_progress`, `awaiting_validation`, `adjustments_requested`, `completed`. Atraso derivado: `due_date < hoje(America/Sao_Paulo)` e estado em (`awaiting_ack`,`in_progress`,`adjustments_requested`); vence no fim do dia.
- Atribuir não concede acesso ao CC. Executor sem CC só recebe DTO operacional (sem valores, justificativa, ledger, impacto, anexos não compartilhados).
- Aviso na atribuição a quem não tem CC, texto exato: **"Este responsável não possui acesso ao centro de custo. Ele visualizará somente a ação e os conteúdos compartilhados."**
- Tipos de notificação: `opex_action_assigned`, `_unassigned`, `_changed`, `_acknowledged`, `_due_soon`, `_overdue`, `_submitted`, `_validated`, `_returned`; todos nascem com sino **e** e-mail habilitados; destinatário individual via `target_user_id`.
- Anexos: bucket privado `opex-review-attachments`, 20 MiB/arquivo, URL assinada curta, sem HTML/SVG executável.
- Datas `date` + instantes `timestamptz`; exibição DD/MM/AAAA; códigos de conta como texto.
- Migrations em `supabase/NNN_*.sql` (próxima livre: **346**); conferir numeração antes de criar. Nada é aplicado em produção por este plano; testes não enviam e-mail real.
- Git: editar só os arquivos da tarefa; **commit/push somente quando o usuário pedir** (cada "Commit" abaixo é ponto de parada para pedir autorização). Entrar em produção na main não usa branch/PR por padrão.

## Review Focus

1. Executor que também é gestor de **outro** CC: DTO decidido por relação com *aquele* CC, não pelo usuário (Task 7, 9).
2. Dono desativado ou sem escopo + reatribuição concorrente com ciência (Task 8).
3. Mesma conta em vários CCs/grupo renomeado: ícone e análise não vazam entre linhas (Task 3, 5).
4. Troca de CC/mês/YTD/ano/fonte/organização com resposta em voo da sessão anterior (Task 5, 10).
5. Dono = executor: um evento por destinatário/canal, validação em passo explícito (Task 8, 11).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/346_opex_review_schema.sql` | Tabelas, índices, RLS, thresholds, helper de escopo |
| `supabase/347_opex_review_analysis_rpcs.sql` | Snapshot no servidor, ler/salvar análise, existência em lote |
| `supabase/348_opex_review_actions_rpcs.sql` | Ações, máquina de estados, DTO operacional, posse |
| `supabase/349_opex_review_attachments.sql` | Bucket, policies Storage, upload/URL/compartilhamento |
| `supabase/350_opex_review_notifications.sql` | Tipos de evento, `target_user_id`, feed, eventos transacionais |
| `supabase/351_notification_email_claim.sql` | RPC de claim da outbox |
| `supabase/352_opex_review_reminders.sql` | Job diário de lembretes (pg_cron) |
| `supabase/functions/send-notification-emails/index.ts` | Usar claim real; conteúdo dos tipos OPEX |
| `src/modules/opexReview/opexReviewCore.js` | Sinaleira, estados, atraso, chave de contexto (puro) |
| `src/modules/opexReview/opexReviewService.js` | RPCs, cache por org/usuário/contexto |
| `src/modules/opexReview/opexReviewViews.js` | Templates: análise, plano, lançamentos, parâmetros, consolidado, Minhas ações, popover |
| `src/modules/opexReview/opexReviewModule.js` | Coordenação, rascunhos, deep link, fila de overlays |
| Modificar: `cockpitWidgets.js`, `cockpitModule.js`, `app.js`, `index.html`, `styles.css`, `notificationsModule.js`, `announcementsDisplayModule.js`, `docs/cockpit-gestao.md` | Integrações |
| `tests/opexReviewCore.test.js`, `tests/opexReview*.sql.test.js`, `tests/opexReview.browser.test.js` | Testes |

Os módulos JS seguem o padrão IIFE existente (`window.VECTON_OPEX_REVIEW_*`).

---

### Task 1: Regras puras (sinaleira, estados, atraso, contexto)

**Files:**
- Create: `src/modules/opexReview/opexReviewCore.js`
- Test: `tests/opexReviewCore.test.js`

**Interfaces:**
- Produces:
  - `classifyVariance({actual, comparison}, thresholds) -> {level:'red'|'yellow'|'green'|null, delta, pct, noBase:boolean}`
  - `DEFAULT_THRESHOLDS = {yellowMoney:10000, yellowPct:5, redMoney:20000, redPct:10}`; `validateThresholds(t) -> {ok, error}`
  - `isOverdue(action, todayIso) -> boolean`; `actionStatusLabel(action, todayIso) -> string`
  - `contextKey(ctx) -> string` (org, cc_id, conta texto, ano, tipo de período, mês, fonte, ano da fonte, escopo)
  - `canTransition(from, op) -> boolean` para `ack|submit|validate|return|reassign`

- [ ] **Step 1: Write the failing tests** — `classifyVariance`: limites exatos (20000,00 e 19999,99; 10,00% e 9,99%), vermelho antes de amarelo com `OU`, variação negativa, denominador negativo (`comp=-1000`), `0/0 → green`, `comp=0, real≠0 → red + noBase`, `null` em qualquer base → `level:null`. `isOverdue`: `due=hoje` → false, `due=ontem` → true, estados `awaiting_validation`/`completed` → false. `validateThresholds`: vermelho < amarelo rejeita; zero/negativo/NaN/Infinity rejeitam. `contextKey`: zeros à esquerda da conta preservados; mesma conta em CCs diferentes → chaves diferentes; renomear grupo não altera a chave.
- [ ] **Step 2: Run** `node tests/opexReviewCore.test.js` — Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implement** o módulo como IIFE exportando em `window.VECTON_OPEX_REVIEW_CORE` e `module.exports` quando existir `module` (mesmo padrão de `cockpitAggregate.js`). Comparar centavos via `Math.round(x*100)` para evitar erro de ponto flutuante nos limites.
- [ ] **Step 4: Run** o mesmo comando — Expected: PASS.
- [ ] **Step 5: Commit** (aguardar autorização) — `feat(opex): regras puras de sinaleira e estados`.

---

### Task 2: Schema, RLS e parâmetros da sinaleira

**Files:**
- Create: `supabase/346_opex_review_schema.sql`
- Test: `tests/opexReviewSchema.sql.test.js` (PGlite, mesmo bootstrap de `tests/bp.sql.test.js`)

**Interfaces:**
- Produces (tabelas, todas com `organization_id`): `opex_variance_analyses` (chave lógica única corrente: org, `cost_center_id`, `account_number`, `reference_year`, `period_type`, `reference_month`, `comparison_source_key`, `comparison_source_year`, `scope_key`; campos `analysis_state`, `monitor`, `nature`, `cause`, `future_effect`, `expected_financial_impact numeric`, snapshots `actual/comparison/variance/variance_pct numeric`, `source_revision text`, `version int`, `deleted_at`); `opex_analysis_revisions`; `opex_action_plans`; `opex_action_events` (imutável: trigger bloqueia UPDATE/DELETE); `opex_variance_thresholds` (versão + auditoria); `opex_review_settings` se necessário.
- Produces helper `opex_can_write_cc(p_org uuid, p_cc uuid) -> boolean` (admin/gestor ativo com escopo no CC, reutilizando a lógica de escopo das migrations 285/299) e `opex_can_read_cc(...)`.

- [ ] **Step 1: Write the failing test** — fixtures: org A/B, admin, gestor com escopo no CC1, gestor sem escopo, analista. Asserts: gestor com escopo insere análise; sem escopo é negado; outra org é negada por SELECT direto; `anon` sem grant; segunda linha com a mesma chave lógica viola unicidade, mas permite se a anterior tem `deleted_at`; `UPDATE`/`DELETE` em `opex_action_events` lança erro; thresholds: vermelho < amarelo rejeitado por CHECK.
- [ ] **Step 2: Run** `node tests/opexReviewSchema.sql.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** o SQL (RLS `enable`+`force`, grants mínimos, `revoke all from public/anon`, `SECURITY DEFINER` com `set search_path`). Executor **não** ganha SELECT em `opex_variance_analyses`/`opex_action_plans` direto: a leitura operacional vem só de RPC (Task 7). Thresholds: leitura por membro da org; escrita só admin (D8 exceção: parâmetros são administrativos); cada gravação incrementa `version` e guarda `updated_by/at`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (aguardar autorização).

---

### Task 3: Snapshot no servidor e RPCs de análise

**Files:**
- Create: `supabase/347_opex_review_analysis_rpcs.sql`
- Test: `tests/opexReviewAnalysis.sql.test.js`

**Interfaces:**
- Consumes: tabelas e `opex_can_*` da Task 2; `actuals_ledger` e fontes de cenário.
- Produces RPCs (todas com `auth.uid()` como ator):
  - `opex_compute_snapshot(p_ctx jsonb) -> jsonb` (real, comparativo, variação, % , cobertura, `source_revision` = última revisão/batch da carga + revisão do cenário — D6). Interna, sem grant a `authenticated`.
  - `opex_get_analysis(p_ctx jsonb) -> jsonb` (DTO financeiro; inclui `data_changed_since_review` = `source_revision` atual ≠ gravada)
  - `opex_save_analysis(p_ctx jsonb, p_fields jsonb, p_expected_version int, p_idem_key text) -> jsonb` (cria/atualiza, grava revisão, snapshot vem de `opex_compute_snapshot`)
  - `opex_record_presence(p_ctx jsonb, p_rows jsonb) -> jsonb` (contagens por `account_number`+`cost_center_id` só dos CCs autorizados; sem causa/anexo)
  - `opex_get_thresholds() -> jsonb`, `opex_save_thresholds(p_values jsonb, p_expected_version int) -> jsonb`

- [ ] **Step 1: Write the failing test** — salvar sem causa com `analysis_state='analyzed'` falha; com causa grava e retorna `version=1`; reenvio com mesma `idem_key` retorna o original sem nova revisão; `expected_version` antigo → erro de conflito com código distinto de validação/acesso; valores enviados no payload para real/comparativo são ignorados (snapshot vem do ledger fixture, reconcilia ao centavo); inserir carga nova no fixture → `data_changed_since_review=true` e a versão antiga continua em `opex_analysis_revisions`; `opex_record_presence` não devolve linha de CC sem escopo (nem contagem); rascunho (`in_analysis` sem ação) conta como "registro"? **Não** — presença exige análise salva ou ao menos uma ação; teste cobre ambos.
- [ ] **Step 2: Run** `node tests/opexReviewAnalysis.sql.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** as funções; conflito via `RAISE EXCEPTION ... USING ERRCODE='40001'`; validação `22023`; acesso `42501`. Limitar tamanho de `cause`/`future_effect`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (aguardar autorização).

---

### Task 4: Colunas do card e do drilldown (UI de existência e sinaleira)

**Files:**
- Modify: `src/modules/cockpit/cockpitWidgets.js` (tabela de grupos), `src/modules/cockpit/cockpitModule.js:136-` (`openGroupDrilldown`), `styles.css`
- Create: `src/modules/opexReview/opexReviewService.js` (parte de leitura: thresholds + presença), parte de `opexReviewViews.js` (`recordIcon(ctxRow)`, `signalDot(level, tip)`)
- Test: `tests/opexReview.browser.test.js` (Playwright, padrão de `tests/cockpit.test.js`) e regressão em `tests/cockpit.test.js`

**Interfaces:**
- Consumes: `classifyVariance` (Task 1), `opex_get_thresholds`, `opex_record_presence` (Task 3).
- Produces: `OpexReviewService.loadPresence(rows) -> Promise<Map<rowKey,{analyses:number, actions:number, open:number}>>` (uma chamada em lote por abertura, sem N+1); `rowKey` = `cost_center_id|account_number` (nunca índice visual).

- [ ] **Step 1: Write the failing test** — fixture do Cockpit: primeira coluna do grupo e da conta é o ícone; última é a sinaleira; linha de total sem ícone/sinaleira e totais continuam alinhados; sem texto "Análise registrada"; ícone ausente quando não há registro e presente com ação concluída; ordenar por Real mantém ícone na linha certa (identidade por `rowKey`); sticky da sinaleira em largura 375px sem overflow global; 4 KPIs e 4 cards na mesma ordem (regressão); Claro e Dark.
- [ ] **Step 2: Run** `node tests/opexReview.browser.test.js` e `node tests/cockpit.test.js` — Expected: FAIL no novo, PASS no antigo.
- [ ] **Step 3: Implement**: acrescentar as duas colunas via `colgroup`/larguras (recalcular `colspan`, `nth-child`, sticky); tooltip `.cockpit-tip` com contagem apenas para linhas autorizadas; grupo classifica a variação agregada (D4); sinaleira com `aria-label`. Falha de leitura de presença não pode virar "sem registro": mostrar estado de erro discreto com retry.
- [ ] **Step 4: Run** os dois — Expected: PASS.
- [ ] **Step 5: Commit** (aguardar autorização).

---

### Task 5: Fluxo conta → Analisar variação (abas, rascunho, lançamentos)

**Files:**
- Modify: `cockpitModule.js` (clique da linha abre o módulo), `opexReviewViews.js`, `opexReviewModule.js` (novo), `app.js`, `index.html` (ordem dos scripts, `?v=` novo), `sw.js` (cache)
- Test: `tests/opexReview.browser.test.js`

**Interfaces:**
- Consumes: `opex_get_analysis`, `opex_save_analysis` (Task 3); contexto do Cockpit (fonte, ano, mês, tipo de período).
- Produces: `OpexReviewModule.openAnalysis(ctx, {returnTo}) -> void`; abas na ordem **Analisar variação · Plano de ação · N · Ver lançamentos**; rascunho em memória por `contextKey`.

- [ ] **Step 1: Write the failing test** — clicar na conta abre a aba de causa (não lançamentos); cabeçalho mostra conta, grupo, CC, competência e a fonte real do seletor; digitar causa, trocar de aba e voltar preserva o texto; fechar com rascunho usa o diálogo de descarte existente; salvar e recarregar a página reabre com causa/natureza/estado/monitor; conflito de versão mostra opção de recarregar mantendo o rascunho; duplo clique em Salvar grava uma vez; Voltar retorna ao drilldown do mesmo grupo e ordenação; aba Lançamentos em visão anual mostra só realizado até o corte.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**: campos conforme D14 e D13 (impacto na análise; visível só no DTO financeiro). Lançamentos carregados sob demanda reutilizando o drill do ledger existente (não criar nova consulta de ledger). Troca de contexto/organização descarta respostas em voo (token de geração no service).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (aguardar autorização).

---

### Task 6: Parâmetros da sinaleira (UI administrativa)

**Files:**
- Modify: `cockpitModule.js` (botão **Parâmetros** no cabeçalho do card), `opexReviewViews.js`, `opexReviewService.js`
- Test: `tests/opexReview.browser.test.js`, `tests/opexReviewAnalysis.sql.test.js`

- [ ] **Step 1: Write the failing test** — admin vê campos editáveis e salva quatro limites; gestor vê somente leitura; valores inválidos (vermelho < amarelo, ≤ 0) bloqueiam salvar com erro visível; alteração reflete imediatamente no card e no drilldown; versão e autor registrados; conflito de versão tratado.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** popover compacto (sem texto de ajuda; regra fica em `docs/cockpit-gestao.md`), invalidando cache de thresholds ao salvar.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (aguardar autorização).

---

### Task 7: Ações, máquina de estados e DTO operacional

**Files:**
- Create: `supabase/348_opex_review_actions_rpcs.sql`
- Test: `tests/opexReviewActions.sql.test.js`

**Interfaces:**
- Produces RPCs (ator = `auth.uid()`; todas exigem `expected_version` e `idem_key` quando mutam):
  - `opex_create_action(p_ctx jsonb, p_fields jsonb, p_shared_attachment_ids uuid[]) -> jsonb` (garante análise rascunho `in_analysis` sem fingir causa; estado `awaiting_ack`; `assignment_cycle=1`)
  - `opex_get_action(p_action_id uuid) -> jsonb` — **DTO operacional**: id, descrição, resultado esperado, atribuidor, executor, prazo, estado, ciência do ciclo, comentários/eventos operacionais, anexos compartilhados/da ação. Sem snapshot, causa, impacto, ledger nem nomes vindos do ledger.
  - `opex_ack_action(p_action_id, p_cycle, p_expected_version, p_idem_key)`; `opex_comment_action`; `opex_submit_action` (exige texto da entrega); `opex_validate_action`; `opex_return_action` (exige justificativa); `opex_reassign_action`; `opex_update_action_terms` (prazo/resultado, grava antes/depois)
  - `opex_list_actions(p_filters jsonb, p_cursor jsonb) -> jsonb` (consolidado, DTO financeiro, só CCs autorizados, paginação no servidor)
  - `opex_my_actions(p_filters jsonb, p_cursor jsonb) -> jsonb` (executor + validações do dono, DTO operacional)

- [ ] **Step 1: Write the failing test** — fluxo feliz criar→ciente→entregar→validar; ciência de ciclo antigo após reatribuição recusada; submissão/validação com versão antiga recusada; executor não valida, não reatribui, não edita prazo; dono=executor valida em passo explícito com dois eventos; executor sem CC: `opex_get_action` retorna JSON **sem** nenhuma chave financeira (assert por varredura do JSON), e `select` direto em `opex_variance_analyses`, `opex_action_plans` e RPC da análise são negados; executor que é gestor de **outro** CC continua sem ver este CC; usuário inativo não recebe atribuição; outra org nega tudo; após remover escopo do dono, leitura financeira nega mesmo sendo dono; `opex_my_actions` inclui entregas aguardando validação do dono e não cobra o executor após entregar; ação aguardando ciência atrasada aparece como "Aguardando ciência · atrasada".
- [ ] **Step 2: Run** `node tests/opexReviewActions.sql.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** com `SELECT ... FOR UPDATE` na linha da ação em toda mutação (protege reatribuição × ciência e conclusão × revisão de prazo); eventos gravados na mesma transação; atraso derivado em função SQL `opex_is_overdue(due date, status text) -> boolean` usando `now() at time zone 'America/Sao_Paulo'`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (aguardar autorização).

---

### Task 8: Posse automática (dono sem acesso)

**Files:**
- Modify: `supabase/348_opex_review_actions_rpcs.sql`
- Test: `tests/opexReviewOwnership.sql.test.js`

**Interfaces:**
- Produces: `opex_resolve_owner(p_action_id uuid) -> uuid` (D9: autor da análise com escopo → gestor principal do CC → admin) e `opex_reconcile_owners() -> int` (executada pelo job diário e disparada por trigger em `user_profiles` quando `is_active`/escopo mudam). Cada troca grava evento `owner_changed` e gera notificações (Task 10).

- [ ] **Step 1: Write the failing test** — dono desativado → posse vai ao autor da análise; autor também sem escopo → gestor principal; nenhum → admin; reatribuição concorrente com ciência não corrompe ciclo; executor não é trocado; idempotente (rodar duas vezes não gera dois eventos).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** funções e trigger.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (aguardar autorização).

---

### Task 9: Anexos privados e compartilhamento

**Files:**
- Create: `supabase/349_opex_review_attachments.sql`
- Test: `tests/opexReviewAttachments.sql.test.js`; UI em `opexReviewViews.js`/`opexReviewService.js`

**Interfaces:**
- Produces: tabelas `opex_attachments`, `opex_action_attachment_shares`; RPCs `opex_prepare_upload(p_entity jsonb, p_meta jsonb) -> jsonb` (path gerado no servidor: `org/entidade/uuid`, estado `pending`), `opex_finalize_upload(p_attachment_id uuid)`, `opex_attachment_url(p_attachment_id uuid, p_action_id uuid null) -> text` (URL assinada curta após reautorizar), `opex_share_attachment(p_action_id, p_attachment_id, p_confirm_restricted boolean)`, `opex_revoke_share(...)`; policies de Storage verificando entidade + compartilhamento, não só o prefixo da organização.

- [ ] **Step 1: Write the failing test** — path vem do servidor (path do cliente ignorado); tipo bloqueado (HTML/SVG) e > 20 MiB recusados; executor lê só anexo compartilhado ou da própria ação; compartilhar para executor sem CC sem `p_confirm_restricted=true` é recusado e registra evento quando confirmado (D10); revogar bloqueia nova URL; adivinhar UUID/path de outra entidade/org é negado; remover arquivo com compartilhamento ativo exige revogar antes; upload `pending` sem finalizar não aparece em listas; falha de upload não apaga análise/ações.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** bucket `opex-review-attachments` privado e UI (seleção múltipla, retry por arquivo, lista com abrir/baixar/remover, áreas "Anexos da análise" e "Arquivos compartilhados e evidências"); prévia só para imagem/PDF, demais por download.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (aguardar autorização).

---

### Task 10: Notificações transacionais (sino) e e-mail na outbox

**Files:**
- Create: `supabase/350_opex_review_notifications.sql`
- Modify: `src/modules/notifications/notificationsModule.js`
- Test: `tests/opexReviewNotifications.sql.test.js`

**Interfaces:**
- Consumes: migrations 092/093/110/157/178 e a versão mais recente de `notifications_feed`/`inbox_counts` (identificar antes; se mudar tipo de retorno, `drop`+`create` com grants).
- Produces: nove tipos `opex_action_*` em `notification_event_types`/`notification_settings` com sino e e-mail ligados; função interna `opex_emit(p_action_id uuid, p_kind text, p_recipient uuid, p_cycle int, p_version int)` chamada **dentro** das RPCs da Task 7/8, com chave de idempotência (ação, ciclo, versão, tipo, destinatário, canal) e `UNIQUE`; feed com referência segura `opex_action_id`.

- [ ] **Step 1: Write the failing test** — criar ação gera 1 notificação (`target_user_id`=executor) e 1 linha na outbox; repetir a RPC com a mesma `idem_key` não duplica; rollback da transação não deixa evento; reatribuição avisa anterior (`unassigned`) e novo (`assigned`); mudar prazo/resultado avisa executor; ciência avisa dono; dono=executor gera um evento por canal; payload/título/corpo do executor sem CC não contém valores, causa ou impacto (varredura); marcar notificação como lida não altera `acknowledged_at`; usuário sem e-mail corporativo: sino criado, outbox marcada "sem destinatário" visível; outros tipos de notificação do feed continuam retornando como antes (regressão).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** SQL e ícone/destino no `notificationsModule.js`: clicar abre `#minhas-acoes/<action_id>` (deep link, sem dado financeiro na URL).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (aguardar autorização).

---

### Task 11: Claim real da outbox e envio dos tipos OPEX

**Files:**
- Create: `supabase/351_notification_email_claim.sql`
- Modify: `supabase/functions/send-notification-emails/index.ts` (trecho de claim ~linhas 180–205)
- Test: `tests/notificationEmailClaim.sql.test.js`

**Interfaces:**
- Produces: `notification_email_claim(p_limit int, p_lease_seconds int, p_token uuid) -> setof notification_email_outbox` (`FOR UPDATE SKIP LOCKED`, grava `claimed_token`, `claimed_until`; itens com lease vencido voltam a ser elegíveis); atualização final exige o mesmo token. Funciona para tipos antigos (D15).

- [ ] **Step 1: Write the failing test** — duas chamadas simultâneas (duas conexões) não recebem o mesmo item; item reservado com lease expirado é reassumido; update com token errado não altera; tipos antigos continuam sendo reservados; após falha, item volta a `pending` com `attempts+1` e ao atingir o limite vira `failed` visível; `sent` só quando o provedor aceita.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** a RPC e trocar o bloco de "claim" da função Deno por `rpc('notification_email_claim')`; antes de enviar OPEX, revalidar destinatário ativo e a ação ainda atribuída àquela pessoa (senão marcar `suppressed` com motivo); usar a chave de idempotência da outbox no provedor quando suportado; corpo por tipo (assunto/mensagem distintos; atribuição segue o modelo da spec §15.2, link por URL base do ambiente + UUID, sem anexos nem dados financeiros).
- [ ] **Step 4: Run** `node tests/notificationEmailClaim.sql.test.js` — Expected: PASS. Checagem do TS: `deno check supabase/functions/send-notification-emails/index.ts` se Deno estiver disponível; senão registrar como pendência de ambiente.
- [ ] **Step 5: Commit** (aguardar autorização).

---

### Task 12: Lembretes de prazo (servidor)

**Files:**
- Create: `supabase/352_opex_review_reminders.sql`
- Test: `tests/opexReviewReminders.sql.test.js`

**Interfaces:**
- Produces: `opex_run_reminders(p_now timestamptz default now()) -> int` e agendamento pg_cron (padrão da migration 110/235) às 08:00 America/Sao_Paulo, seg–sex (D11); deduplicação por (ação, ciclo, versão do prazo, tipo).

- [ ] **Step 1: Write the failing test** — ação com prazo em 3 dias gera `due_soon` ao executor; vencida gera `overdue` ao executor e ao dono (um evento só se forem a mesma pessoa); duas execuções no mesmo dia não duplicam; sábado/domingo não executam; prazo mudado reabre a elegibilidade; ação `awaiting_validation`/`completed` não gera cobrança ao executor; prazo no próprio dia não é vencido; roda sem usuário logado.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** a função (chama também `opex_reconcile_owners`, Task 8) e o `cron.schedule`; documentar o fuso em UTC (11:00 UTC) no comentário.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (aguardar autorização).

---

### Task 13: Plano de ação (UI), Minhas ações e deep link

**Files:**
- Modify: `opexReviewViews.js`, `opexReviewModule.js`, `app.js` (rota/menu/visibilidade), `index.html`, `styles.css`
- Test: `tests/opexReview.browser.test.js`

- [ ] **Step 1: Write the failing test** — aba Plano cria ação com executor/prazo/resultado/anexos compartilhados; ao escolher executor sem CC aparece o aviso exato da spec e a seleção de anexos com confirmação (D10); só salvar dispara a atribuição (selecionar não); executor sem CC vê "Minhas ações" sem nenhum menu financeiro e DOM/rede sem valores; **Ciente** muda estado, abrir ação/sino não; entregar exige descrição; dono valida ou devolve com justificativa; deep link `#minhas-acoes/<id>` não autenticado preserva destino e reabre após login revalidando acesso; ação sem permissão mostra indisponibilidade genérica; Claro/Dark e 375px.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** a tela operacional (DTO limitado) e a lista "Minhas ações" (executor + entregas a validar); item de menu visível a qualquer usuário com tarefa, sem liberar relatórios; cache por org/usuário descartado na troca de sessão.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (aguardar autorização).

---

### Task 14: Consolidado "Análises e planos de ação" (tela própria)

**Files:**
- Modify: `opexReviewViews.js`, `opexReviewService.js`, `cockpitModule.js` (botão do card navega), `app.js` (rota/menu)
- Test: `tests/opexReview.browser.test.js`, `tests/opexReviewActions.sql.test.js`

- [ ] **Step 1: Write the failing test** — colunas: título/causa, CC/conta, período, responsável, prazo (— para análise sem ação), situação, abrir; filtros tipo/CC autorizado/período/responsável/situação (incl. atrasadas); paginação e ordenação no servidor (não busca tudo); "Todos" = só autorizados; abrir análise restaura fonte/ano/mês salvos, não o filtro atual do Cockpit; selo "base mudou" visível; `th data-sort` com ↑↓ e `var(--blue)`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** usando `opex_list_actions` e uma listagem de análises equivalente com cursor.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (aguardar autorização).

---

### Task 15: Popover de entrada e fila de overlays

**Files:**
- Modify: `opexReviewModule.js`, `opexReviewViews.js`, `src/modules/announcements/announcementsDisplayModule.js`, `app.js`
- Test: `tests/opexReview.browser.test.js`

**Interfaces:**
- Consumes: `opex_my_actions` (limite + totais).
- Produces: `OverlayQueue.enqueue(name, priority, showFn)` mínima em `app.js`, com pendências de OPEX antes de Novidades (D12); chave de sessão `userId+orgId+sessionStartedAt`.

- [ ] **Step 1: Write the failing test** — sem pendências não abre; seções na ordem Aguardando ciência (vencimento mais próximo) → Vencidas (mais atrasada primeiro) → A vencer → Entregas para você validar; ação vencida aguardando ciência só na seção de ciência; fechar/abrir ação não confirma ciência; **Ciente** no popover confirma; abre uma vez por sessão autenticada e não reabre em render/troca de competência/refresh de token; novo login reapresenta; Novidades só abre depois de fechar o popover; não abre sobre formulário com alterações não salvas (enfileira); limite com total e "Ver minhas ações".
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** a fila e adaptar Novidades para usá-la sem mudar seu conteúdo.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (aguardar autorização).

---

### Task 16: Documentação, regressão e verificação final

**Files:**
- Modify: `docs/cockpit-gestao.md`; Create: `docs/opex-analises-planos-de-acao.md` (rollout)

- [ ] **Step 1:** Documentar regras (sinaleira, chave de contexto, "base mudou", estados, permissões, DTOs, lembretes, deep link) e o rollout: ordem das migrations 346–352, deploy da Edge Function, bucket, cron/segredos já existentes reaproveitados, variável da URL base. Declarar explicitamente o que **não** foi aplicado/validado em produção.
- [ ] **Step 2: Run** regressão: `node tests/cockpit.test.js`, `node tests/cockpitService.test.js`, `node tests/opexReviewCore.test.js`, todos `tests/opexReview*.sql.test.js`, `tests/notificationEmailClaim.sql.test.js`, `tests/opexReview.browser.test.js`, mais os testes de notificações/permissões existentes — Expected: todos PASS.
- [ ] **Step 3:** Verificação visual no preview (Claro/Dark, desktop e 375px) do card, drilldown, análise, plano, Minhas ações, consolidado e popover; capturas em `artifacts/opex/`.
- [ ] **Step 4:** Resumo final com arquivos alterados, testes executados e pendências de ambiente (homologação autenticada, envio real de e-mail, aplicação das migrations).
- [ ] **Step 5: Commit** (aguardar autorização).

---

## Self-review

- **Cobertura da spec:** §5 → T4; §6/§7/§9 → T3, T5; §8 → T1, T6; §10/§11 → T7, T8, T13; §12 → T9; §13 → T13, T14; §14 → T15; §15 → T10–T12; §16/§17 → T2, T3, T7; §18 → File Structure; §20 → testes por tarefa; §22 → T16.
- **Itens da spec deliberadamente fora:** vendas/margem/CAPEX, HC novo, e-mail com anexo, executor externo, ajuste de budget/forecast por impacto.
- **Consistência de nomes:** RPCs `opex_*` e tipos `opex_action_*` iguais em todas as tarefas; `contextKey` (T1) é usado em T5; `rowKey` (T4) distinto de `contextKey` de propósito.
- **Risco principal:** `opex_compute_snapshot` (T3) precisa reconciliar com `cockpitAggregate`; o teste de centavos da T3 é a barreira.
- **Dependência a verificar na execução:** versão mais recente de `notifications_feed`/`inbox_counts` (T10) e se `user_profiles` expõe o "gestor principal" do CC (T8); se não expuser, usar o campo de gestão do CC já existente na migration 017.
