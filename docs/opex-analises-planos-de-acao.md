# Análises e planos de ação de OPEX — implantação

Regras funcionais: `docs/cockpit-gestao.md` (seção "Acompanhamento de OPEX"). Especificação de origem: `artifacts/mockups/Vecton-Especificacao-Acompanhamento-OPEX-Codex.md`; plano: `docs/superpowers/plans/2026-11-17-analises-planos-de-acao-opex.md`.

> **Estado desta entrega: código e migrations PREPARADOS no repositório.** Nada foi aplicado em produção, nenhuma Edge Function foi implantada e nenhum e-mail real foi enviado. A presença de um arquivo `.sql` no repositório não significa migration aplicada no ambiente.

## O que implantar, na ordem

| # | Item | Observação |
|---|---|---|
| 1 | `supabase/346_opex_review_schema.sql` | Tabelas, índices, RLS (só SELECT ao cliente), helpers de escopo (`opex_can_read_cc`/`opex_can_write_cc`). Exige `forecast_read_scope()` (migration 285). |
| 2 | `supabase/347_opex_review_analysis_rpcs.sql` | Snapshot no servidor, ler/salvar análise, existência em lote, parâmetros da sinaleira. |
| 3 | `supabase/348_opex_review_actions_rpcs.sql` | Ações, estados, DTO operacional, Minhas ações, pendências de entrada, consolidado, posse automática (cria o gatilho `opex_profile_reconcile_owners` em `user_profiles`). |
| 4 | `supabase/349_opex_review_attachments.sql` | Bucket privado `opex-review-attachments`, policies de Storage, RPCs de upload/URL/compartilhamento. |
| 5 | `supabase/350_opex_review_notifications.sql` | Nove tipos `opex_action_*` (sino **e** e-mail ligados), `notifications.ref_action_id`, **troca o tipo de retorno de `notifications_feed`** (drop + create + grants), `opex_emit`. |
| 6 | `supabase/351_notification_email_claim.sql` | Claim real (`FOR UPDATE SKIP LOCKED`, token e lease) da `notification_email_outbox`; status `suppressed`; revalidação `opex_email_check`. **Vale para todos os tipos de e-mail.** |
| 7 | Edge Function `send-notification-emails` | `supabase functions deploy send-notification-emails --no-verify-jwt`. **Só depois da 351** (a função passa a chamar `notification_email_claim`/`notification_email_finish`). Sem mudança de secrets. |
| 8 | `supabase/352_opex_review_reminders.sql` | `opex_run_reminders()` + job pg_cron `vecton-opex-action-reminders` (`0 11 * * 1-5` UTC = 08:00 America/Sao_Paulo, dias úteis). Requer `pg_cron` (já usado nas migrations 105/110/157). |
| 8b | `supabase/353_opex_review_threshold_direction.sql` | Coluna `direction` (`over` = só sinaliza real acima da meta, padrão; `both` = acima e abaixo) em `opex_variance_thresholds`; recria `opex_get_thresholds`/`opex_save_thresholds`. Aplicar antes do frontend. |
| 8c | `supabase/354_opex_review_threshold_under.sql` | Direção `under` (só abaixo da meta) da sinaleira; amplia a constraint e recria `opex_save_thresholds`. Depois da 353. |
| 8d | `supabase/355_opex_review_report_cards.sql` | Inclui os cards "Análises e planos de ação" e "Minhas ações" na seção OPEX da Central de Relatórios das organizações com seções salvas (sem isso caem em "Sem seção"). |
| 8e | `supabase/356_opex_review_report_cards_order.sql` | Garante "Minhas ações" na seção OPEX, logo depois de "Análises e planos de ação" (corrige o card que ficou em "Sem seção"). Depois da 355. |
| 8f | `supabase/357_opex_review_cancel_delete.sql` | Situação "Cancelado" da análise (ícone com borda vermelha quando todas as análises do registro estão canceladas), filtro "Cancelado" no consolidado e `opex_delete_record` (exclusão lógica, só administrador/super administrador; excluir a análise oculta as ações dela; `deleted_at`/`deleted_by` ficam gravados). Redefine `opex_save_analysis` e `opex_record_presence`. |
| 8g | `supabase/358_opex_review_list_management.sql` | Consolidado: nome da gestão do CC em cada registro (coluna Gestão) e correção do filtro "Cancelado" para análises. Redefine `opex_list_records`. Depois da 357. |
| 9 | Frontend | Publicar os arquivos (novos `src/modules/opexReview/*`, `src/core/overlayQueue.js`, alterações em `app.js`, `index.html`, `styles.css`, `cockpitWidgets/Module/Aggregate/Service`, `notificationsModule`, `navigationModule`, `constants`). |

Reaproveitado sem mudança: cron/segredos do envio de e-mail (`RESEND_API_KEY`, `RESEND_FROM`, `CRON_SECRET`/service role) e o job de 5 min que aciona `send-notification-emails`. Link dos e-mails: `https://vecton.marcher.com.br/?acao=<uuid>` (URL base fixa na função, como nos demais e-mails). Não há URL de ambiente nova a configurar.

Ordem de rollback: frontend → 352 (`select cron.unschedule('vecton-opex-action-reminders')`) → Edge Function anterior → demais migrations não têm rollback automático (apenas adicionam objetos; `350` e `351` alteram objetos existentes — ver riscos).

## Onde as telas ficam

Sem itens no menu lateral: **Central de Relatórios → seção OPEX** (cards "Análises e planos de ação", para quem vê relatórios de OPEX, e "Minhas ações", só para quem tem tarefa ou entrega a validar). O botão do card OPEX do Cockpit, o popover de pendências, o sino e o link do e-mail também abrem essas telas.

## Riscos e pontos de atenção

- **351 + Edge Function são acopladas:** aplicar a função nova sem a 351 faz o envio parar (RPC inexistente); aplicar a 351 sem a função nova mantém a função antiga funcionando (continua com o claim antigo, sem exclusividade). Aplique na ordem da tabela.
- **`notifications_feed` muda o tipo de retorno** (coluna `ref_action_id` ao final). Os campos antigos são preservados; consumidores que usam `select *` devem tolerar a coluna extra.
- **Trigger em `user_profiles`** (`opex_profile_reconcile_owners`): dispara apenas quando mudam `is_active`, gestão, centros/gestões extras e papéis; só reatribui a posse de ações abertas.
- A fila de e-mail agora conta a tentativa na reserva: item que derruba a função repetidamente chega a `failed` em vez de girar para sempre. `sent` significa aceite do provedor (não entrega nem leitura). Chave `Idempotency-Key` do Resend derivada da outbox.
- O consolidado usa paginação por offset no servidor; o selo "base mudou" é mostrado ao abrir a análise (não por linha, por custo).
- A assinatura de "base mudou" do cenário usa contagem + soma do recorte conta × CC (a tabela de cenários não tem coluna de revisão).

## Permissões (resumo)

- Escrever análise / criar ação: administrador ou gestor ativo **com escopo no CC** (`forecast_read_scope`). Sem papel novo. Parâmetros da sinaleira: somente administrador/super administrador, em **Parâmetros → Sinaleira OPEX** (item de menu visível só para quem edita; vale para todos os usuários da organização).
- Atribuir uma tarefa **não** dá acesso ao CC. O executor lê só `opex_get_action`/`opex_my_actions`/`opex_entry_pending` (DTO operacional). Não há SELECT direto às tabelas `opex_*` para quem não lê o CC.
- Anexos da análise só chegam ao executor por compartilhamento explícito (ação + arquivo), com aviso/confirmação quando ele não tem acesso ao CC; revogar bloqueia novas URLs (URLs já emitidas expiram em ≤ 60 s).

## Testes

```bash
node tests/opexReviewCore.test.js
node tests/opexReviewSchema.sql.test.js
node tests/opexReviewAnalysis.sql.test.js
node tests/opexReviewActions.sql.test.js
node tests/opexReviewOwnership.sql.test.js
node tests/opexReviewAttachments.sql.test.js
node tests/opexReviewNotifications.sql.test.js
node tests/notificationEmailClaim.sql.test.js
node tests/opexReviewReminders.sql.test.js
node tests/opexReviewHub.sql.test.js
node tests/opexReview.browser.test.js
node tests/opexReviewAnalysis.browser.test.js
node tests/opexReviewParams.browser.test.js
node tests/opexReviewPlan.browser.test.js
node tests/opexReviewScreens.browser.test.js
node tests/cockpit.test.js
node tests/cockpitService.test.js
```

Os testes SQL usam PGlite (`artifacts/bp-test-deps`, mesma dependência do BP) com tabelas mínimas simuladas e executam as migrations reais; os de navegador montam o Cockpit real (Playwright/Edge) com RPC simulado. Capturas em `artifacts/opex/` (dados sintéticos).

## O que foi comprovado localmente e o que depende de homologação

Comprovado localmente: regras puras; RLS/DTOs, concorrência e idempotência (SQL real em PGlite); mensagens de notificação sem dado financeiro; claim/lease/retry da outbox (sequencial — PGlite é uma conexão só, a exclusividade entre processos vem de `FOR UPDATE SKIP LOCKED`); UI do Cockpit, análise, plano, anexos, Minhas ações, consolidado, popover e fila de overlays.

**Ainda depende de ambiente autenticado (não realizado):** aplicação das migrations e reconciliação numérica do snapshot com o ledger real; Storage real (assinatura de URL, policies); envio real de e-mail (Resend) e `deno check` da Edge Function (Deno não está instalado nesta máquina — a sintaxe TypeScript foi apenas parseada); agendamento pg_cron; deep link com login real; teste com usuário executor sem acesso ao CC em produção.
