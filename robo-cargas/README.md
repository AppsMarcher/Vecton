# Robô de cargas automáticas (Protheus → Vecton)

Roda no servidor, lê o Protheus (SQL Server `MARCHER-BD`) e carrega no Vecton pelo mesmo caminho da tela de carga
(lote `complete` do mês + `apply_comercial_realizado_import_batch`). Hoje: **vendas** (FAT + CART) do **mês corrente**.

## Como funciona

1. O Agendador de Tarefas do Windows chama `node src/index.js run` a cada 15 minutos.
2. O robô entra no Vecton com o usuário de serviço e lê `carga_automatica_config` (ligada?, horários, janela de meses, parâmetros).
3. Se um horário programado venceu e ainda não houve tentativa naquele horário, ele executa a carga. **Mudar horário/janela é um UPDATE na tabela, sem mexer no servidor.**
4. Por mês da janela (a carga é **sempre completa**: apaga o mês no Vecton e regrava tudo, mesmo sem mudança): roda o SQL do Protheus (o mesmo do `Painel_Vecton.xlsm`, em `sql/vendas_mes.sql`), resolve o território
   (tabela `comercial_regioes_municipio`, mantida na tela **Parâmetros → Comercial → Municípios**; substitui a aba `Regioes`), cria o lote `complete`, valida e aplica.
5. Grava o resultado em `carga_automatica_log` e uma cópia `Vendas_AAAA-MM.csv` em `3 - CARGAS ENVIADAS` (sobrescrita a cada execução).

## Proteções

| Situação | Comportamento |
|---|---|
| Extração vazia | Não aplica (não apaga o mês). Log `bloqueada` |
| Queda de linhas > `queda_max_pct` (30%) vs. última carga do mês | Não aplica. Log `bloqueada`. `--force` libera |
| Linha reprovada na validação (ex.: território não cadastrado) | Não aplica nada; o lote fica na tela de carga para análise. Log `erro` e código de saída 1 |
| Falha no Protheus/Vecton | Log `erro`, código de saída 1 (a tarefa aparece como falha no Agendador) |

Lotes automáticos têm `notes` iniciando em `[auto]`. Cada carga bem-sucedida gera o aviso "Carga de Vendas (realizado) aplicada" (sininho + e-mail, mesmos destinatários da carga manual; texto com "· carga automática" — migration 262). Lotes pendentes de execuções anteriores são removidos antes de criar o novo.
Lotes antigos já aplicados e totalmente substituídos são removidos pelo próprio banco (migration 204).

## Quando a carga dá erro

O robô não aplica nada (o mês continua como estava), grava o erro em `carga_automatica_log` e a migration 261 envia **e-mail e sininho**
com as linhas reprovadas (destinatários e liga/desliga em **Parâmetros → Notificações → Carga automática com erro**).

Causas comuns e correção:
- **Cliente/produto não cadastrado:** cadastre em Parâmetros → Comercial. A próxima execução (ou `node src/index.js vendas`) carrega sozinha.
  Atalho sem esperar: na tela de carga de vendas, abra o lote `[auto]` mantido, **Revalidar lote** e **Aplicar lote**.
- **Território não cadastrado ou município sem território:** ajuste em Parâmetros → Comercial → Municípios / Território.
- **Sem atribuição de responsável para o território na data:** cadastre em Parâmetros → Comercial → Atribuição.

## Instalação (uma vez)

1. **Banco** (SQL Editor do Supabase), nesta ordem: `supabase/259_carga_automatica.sql`, `supabase/260_seed_comercial_regioes_municipio.sql` e `supabase/261_carga_automatica_aviso_erro.sql` e `supabase/262_carga_automatica_avisa_sucesso.sql`. Antes da 260, confira que os territórios usados nas regiões existem em Parâmetros → Comercial → Território (a 260 aborta e lista os que faltam).
2. **Usuário no Vecton:** convidar `robo.vecton@marcher.com.br` com papel **editor** na organização e acesso ao Comercial.
3. **Servidor:** instalar Node 20+ e o *ODBC Driver 17/18 for SQL Server*. Copiar a pasta `robo-cargas`, rodar `npm install`.
4. Copiar `config.example.json` para `config.json`. Autenticação do Protheus: `"windows"` (a conta que roda a tarefa precisa de leitura em `protheus_producao`) ou `"sql"` (usuário/senha via variável de ambiente).
5. Definir a variável de ambiente `VECTON_ROBO_SENHA` (senha do usuário do Vecton). Nunca no `config.json`.
6. **Simular:** `node src/index.js vendas --dry-run`. Extrai do Protheus, mostra resumo e gera um CSV de conferência em `logs/`. Não grava no Vecton. Compare com o Excel.
7. Ligar a carga: `update carga_automatica_config set enabled = true where job = 'vendas';`
8. Agendar: `.\instalar-tarefa.ps1 -Conta "DOMINIO\robo.vecton"`.

## Operação

```
node src/index.js vendas --dry-run        # simula
node src/index.js vendas --force          # carrega agora, ignorando a proteção de queda anormal
node src/index.js vendas --mes=2026-10    # mês específico (manual)
```

Acompanhar: `select started_at, status, reference_month, total_rows, mensagem from carga_automatica_log where job='vendas' order by started_at desc;`

Configuração (tabela `carga_automatica_config`): `enabled`, `meses_atras`, `meses_frente` (0/0 = só o mês corrente), `horarios` (ex.: `{08:00,14:00}`),
`params` (`cfops_saida`, `cfops_devol`, `queda_max_pct`, `diretorio_saida`).

## Ajustar territórios

Tela **Parâmetros → Comercial → Municípios**: busque o município, edite o território (lista dos territórios cadastrados) ou inclua município novo.
A mudança vale na próxima execução do robô e só para o mês corrente; meses fechados não são recarregados.
A regra fixa dos vendedores 000274 (GO_MG NORTE) e 000590 (GO_MG SUL) está em `src/territorio.js`.

## Nova carga

Criar `src/jobs/<nome>.js` com `nome`, `extrairMes`, `paraLinhaImport`, `gravarCsv`, registrar em `JOBS` (`src/runner.js`) e inserir a linha em `carga_automatica_config`.
(O `runner.js` hoje grava nas tabelas de lote do realizado comercial; outras cargas pedirão generalizar essa parte.)

## Testes

`npm test` (lógica de território, janela de meses, SQL, hash e MB; não precisa de banco).
