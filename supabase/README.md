# Base inicial Supabase

Este diretorio guarda a configuracao inicial do banco para os cadastros base do app.

## Escopo desta versao

Nesta etapa o banco comeca com:

- organizacoes e usuarios
- empresas e filiais
- plano de contas
- centros de custos
- periodos de reporte

O objetivo e preparar a fundacao para:

- carga do realizado
- estruturacao do DRE Soc Real
- visao derivada do DRE Ger Real
- suporte a multiplos anos no futuro

## Arquivo principal

- `001_initial_schema.sql`
- `002_seed_accounts_from_dre.sql`
- `003_seed_cost_centers.sql`
- `004_plan_node_tables.sql`
- `005_seed_dre_plan_nodes.sql`
- `006_seed_cc_plan_nodes.sql`
- `008_create_branches.sql`
- `009_seed_branches.sql`
- `010_create_user_profiles.sql`
- `011_create_actuals_imports.sql`
- `012_relax_actuals_import_rows.sql`
- `013_create_actuals_monthly_account_totals.sql`
- `014_fix_actuals_monthly_totals_sync.sql`
- `015_extend_actuals_apply_timeout.sql`
- `016_create_budget_imports.sql`
- `017_add_cost_center_management.sql`
- `007_fix_rls_recursion.sql` (patch corretivo para bases antigas)

## Como aplicar no Supabase

1. Abra o projeto no Supabase.
2. Va em `SQL Editor`.
3. Execute nesta ordem:

```sql
-- 1
001_initial_schema.sql

-- 2
002_seed_accounts_from_dre.sql

-- 3
003_seed_cost_centers.sql

-- 4
004_plan_node_tables.sql

-- 5
005_seed_dre_plan_nodes.sql

-- 6
006_seed_cc_plan_nodes.sql

-- 7
008_create_branches.sql

-- 8
009_seed_branches.sql

-- 9
010_create_user_profiles.sql

-- 10
011_create_actuals_imports.sql

-- 11
012_relax_actuals_import_rows.sql

-- 12
013_create_actuals_monthly_account_totals.sql

-- 13
014_fix_actuals_monthly_totals_sync.sql

-- 14
015_extend_actuals_apply_timeout.sql

-- 15
016_create_budget_imports.sql

-- 16
017_add_cost_center_management.sql
```

4. Para login e gravacao direta pelo front, configure [supabase-config.js](C:/Users/rguimaraes/OneDrive%20-%20MARCHER%20BRASIL%20AGROINDUSTRIAL%20SA/%C3%81rea%20de%20Trabalho/ForecastApp/supabase-config.js) com:

```js
window.FORECASTAPP_SUPABASE = {
  projectUrl: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA_ANON_KEY",
  organizationName: "Marcher Brasil"
};
```

5. O `accessToken` deixa de ser manual. A tela de login do app autentica no Supabase Auth e passa a usar a sessao do proprio usuario.

6. A politica atual de `RLS` exige usuario autenticado e vinculado a `Marcher Brasil`. So `anonKey` nao basta.

7. Se precisar criar a organizacao manualmente antes:

```sql
select public.create_organization_with_owner('Marcher Brasil');
```

## O que o script cria

- tabela `organizations`
- tabela `organization_users`
- tabela `accounts`
- tabela `cost_centers`
- tabela `branches`
- tabela `user_profiles`
- tabela `reporting_periods`
- tabela `actuals_import_batches`
- tabela `actuals_import_rows`
- tabela `actuals_ledger_entries`
- tabela `actuals_import_batch_audit`
- tabela `actuals_import_row_audit`
- tabela `actuals_ledger_audit`
- tabela `dre_plan_nodes`
- tabela `cc_plan_nodes`
- indices
- `RLS` por organizacao
- triggers de `updated_at`

## Realizado importado

O arquivo `011_create_actuals_imports.sql` prepara a base para:

- upload de realizado por arquivo
- lancamentos manuais sem arquivo
- competencia obrigatoria por `mes/ano`
- `carga completa` e `carga adicional`
- validacao por codigo de `empresa`, `conta` e `centro de custos`
- bloqueio integral da importacao quando houver erro
- edicao posterior do lote ja aplicado
- atualizacao online do realizado oficial
- trilha de auditoria para lote, linha e realizado aplicado

### Patch de staging

- `012_relax_actuals_import_rows.sql`

Use este patch se a base do realizado ja foi criada e voce precisa permitir que linhas com erro sejam armazenadas no staging para correcao posterior. Ele remove a obrigatoriedade imediata de `data`, `empresa`, `conta` e `valor` dentro de `actuals_import_rows`, mantendo a validacao na regra de negocio e na aplicacao final do lote.

### Estrutura resumida

- `actuals_import_batches`
  Guarda o cabecalho do lote, competencia, tipo de carga, origem e status.

- `actuals_import_rows`
  Guarda cada linha do lote, inclusive as linhas com erro para correcao manual.

- `actuals_ledger_entries`
  Guarda o realizado oficial ja aplicado e consumido pelos relatorios.

- `actuals_monthly_account_totals`
  Guarda o resumo mensal por conta para o app montar relatorios sem reler todo o razao bruto.

- `actuals_import_batch_audit`
- `actuals_import_row_audit`
- `actuals_ledger_audit`
  Guardam o historico de alteracoes para rastreabilidade.

## Patch corretivo

- `007_fix_rls_recursion.sql`

Use este arquivo apenas se a sua base foi criada antes da correcao de `RLS` e apresentou erro de recursao em policies.

- `014_fix_actuals_monthly_totals_sync.sql`

Use este arquivo se a base ja esta com a agregacao mensal otimizada e voce precisa recompor os totais do DRE a partir do ledger existente, alem de manter essa agregacao sincronizada quando um lote aplicado for editado depois.

- `015_extend_actuals_apply_timeout.sql`

Use este arquivo quando a aplicacao do lote estiver estourando tempo limite no RPC do realizado. Ele recria a funcao `apply_actuals_import_batch` sem timeout de instrucao e adiciona indice por `batch_id` no ledger para ajudar cargas adicionais.

- `016_create_budget_imports.sql`

Use este arquivo para habilitar a carga de planejado no Supabase. Ele cria o staging, o ledger oficial, a agregacao mensal por conta, a RPC `apply_budget_import_batch`, auditoria, policies e triggers no mesmo padrao da carga de realizado.

- `017_add_cost_center_management.sql`

Use este arquivo para adicionar o campo `Gestao` ao cadastro de centros de custos nas bases ja existentes.
Depois rode novamente `003_seed_cost_centers.sql` para preencher `cost_center_management` nos CCs ja carregados, usando a base atualizada da planilha `CCs.xlsx`.

## Decisoes desta modelagem

- `registration_control` fica livre em `accounts`, porque o seu controle de cadastro
  ainda pode evoluir.
- `cost_center_type` fica restrito a `MOD`, `MOI`, `ADM`, `COM` e `ENG`.
- `branches.branch_code` fica restrito a 2 digitos.
- `reporting_periods` ja existe para suportar multiplos anos depois, mesmo antes da
  carga do realizado.
- `MÊS`, `desc conta` e `COD CL VAL` nao entram nesta versao inicial do banco.

## Backup e recuperacao da RPS

- `104_rps_resilient_backups.sql` cria os runs, snapshots historicos, manifesto SHA-256 dos anexos, auditoria, locks e RPCs transacionais de restore/rollback.
- `105_rps_weekly_backup_schedule.sql` agenda a Edge Function de backup para segunda-feira, 18:45 (America/Sao_Paulo), usando secrets do Vault.
- As Edge Functions `rps-backup-worker` e `rps-backup-manager` ficam em `supabase/functions`.
- O procedimento completo de instalacao e validacao esta em `docs/rps-backup-recuperacao.md`.
