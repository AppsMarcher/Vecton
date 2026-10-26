# Robô de cargas automáticas (Protheus → Vecton)

Roda no servidor, lê o Protheus (SQL Server `MARCHER-BD`) e carrega no Vecton pelo mesmo caminho da tela de carga
(lote `complete` do mês + `apply_comercial_realizado_import_batch`). Cargas: **vendas** (FAT + CART) e **DRE** (razão contábil, CT2) do **mês corrente**.

## Status (16/10/2026)

**Implantado e validado em produção.** No servidor (`C:\robo-cargas`): login no Vecton, leitura do Protheus com o login SQL `usr_robo_vecton`, simulação (`--dry-run`), **carga real** do mês corrente, tarefa agendada a cada 5 min (ciclo programado e pedidos do botão atendidos).
Banco do Vecton com as migrations 259–264 aplicadas. Carga de **vendas** ligada (`12:00` e `23:30`). Carga do **DRE** ligada, com horários próprios (`10:00`, `15:00` e `19:00`; cada carga tem a sua linha em `carga_automatica_config`): simulação conferida contra o Excel (596 lançamentos, saldo 465.317,39) e carga real aplicada (596 lançamentos no razão; DRE/OPEX do mês conferidos no Vecton).
Versão atual do robô (com conferência do razão): `runner.js`, `supabase.js`, `jobs/vendas.js` e `jobs/dre.js` precisam ir **juntos** para o servidor.
Botão **Carregar agora** e seção Automatizadas na tela: validados (pedido atendido em até 5 min, card atualizado sozinho, aviso no sino e por e-mail).
Ainda não exercitado: o e-mail "Carga automática com erro", que só dispara numa falha real.

## Como funciona

1. O Agendador de Tarefas do Windows chama `node src/index.js run` a cada **5 minutos** (`-IntervaloMin` do `instalar-tarefa.ps1`; o padrão antigo era 15).
2. O robô entra no Vecton com o usuário de serviço e lê `carga_automatica_config` (ligada?, horários, janela de meses, parâmetros).
3. Se um horário programado venceu e ainda não houve tentativa naquele horário, ele executa a carga. **Mudar horário/janela é um UPDATE na tabela, sem mexer no servidor.**
4. Por mês da janela (a carga é **sempre completa**: apaga o mês no Vecton e regrava tudo, mesmo sem mudança): roda o SQL do Protheus (o mesmo do `Painel_Vecton.xlsm`, em `sql/vendas_mes.sql`), resolve o território
   (tabela `comercial_regioes_municipio`, mantida na tela **Parâmetros → Comercial → Municípios**; substitui a aba `Regioes`), cria o lote `complete`, valida e aplica.
5. Grava o resultado em `carga_automatica_log` e uma cópia `Vendas_AAAA-MM.csv` na pasta `params.diretorio_saida` (no servidor: `C:\robo-cargas\logs`), sobrescrita a cada execução. Se a gravação do CSV falhar (ex.: unidade `O:` inexistente para a conta da tarefa), a carga **não falha**: o aviso fica na mensagem do log.
   A simulação (`--dry-run`) grava o CSV de conferência na pasta `logs/` do robô, com o mesmo nome do arquivo da carga real.

## Carteira de pedidos (CART) — carteira vigente (desde 26/10/2026)

A carteira é um **estoque** (pedidos em aberto hoje), não um fluxo mensal. Por isso:

- **No mês corrente**, a carga traz **toda a carteira aberta**, qualquer que seja a data de entrega (atrasada, do mês ou futura), cada linha com a sua data de entrega prevista. **Em mês fechado**, a carga traz só o faturamento: a carteira completa nunca é gravada dentro de um mês passado.
- O painel lê a carteira **somente da foto vigente** (lote de carteira mais recente que não seja posterior ao mês corrente do calendário) e a distribui pelo **mês da data de entrega**: Mês = entregas do mês; YTD = de janeiro até o mês; Ano = ano inteiro (inclui meses futuros). Carteira de ano anterior fica no ano de origem. A carteira não é comparada com o período anterior. O faturamento continua lido por lote de mês, sem mudança.
- Itens de carteira **sem data de entrega** ficam fora da carga e são contados (`cartSemData` no resumo/simulação). O resumo traz também `cartMaisAntiga` (entrega mais antiga da carteira).
- **Cadastro:** pedido de Máquinas/Acessórios/Transgrain para cliente ou produto ainda não cadastrado reprova o lote **inteiro** (nada é aplicado e chega o aviso de erro). Cadastre em Parâmetros → Comercial e use **Carregar agora**. Peças usa cliente/produto genéricos e não trava. O aviso (sino e e-mail) agrupa por **cliente/produto a cadastrar**, com documentos e valor afetados e onde cadastrar (Máquinas: informar a cultura no produto); o detalhe técnico por linha fica em `carga_automatica_log.detalhes.linhas_reprovadas`.
- `meses_atras` e `meses_frente` da carga de vendas devem ficar em **0** (só o mês corrente).

### Fechamento do mês (procedimento)

O mês corrente é **sempre do robô**. A carga manual (`Painel_Vecton.xlsm`) fica só para meses já fechados. No fechamento (ex.: 1º de novembro, para subir outubro com os ajustes gerenciais):

1. Espere o robô fazer a **primeira carga do mês novo** (novembro vira a foto vigente da carteira). Se preciso, use **Carregar agora** no mês novo.
2. **Só então** suba a planilha do mês fechado (outubro). Subir antes regravaria a carteira de outubro no critério antigo (só entregas do mês) enquanto outubro ainda é a foto vigente, e o painel ficaria com a carteira incompleta até a próxima carga.

Nunca carregue carteira completa à mão em mês fechado. Entre o dia 1 e a primeira carga do mês novo, o painel mostra a carteira do último dia do mês anterior (no máximo um dia).

## Botão "Carregar agora" (tela Carga de Realizado - Automatizadas)

Em **Parâmetros → Carga de Realizado**, a seção **Automatizadas** tem um card por carga (hoje: Volumes de Vendas) com ligada/pausada, horários, última execução e o botão **Carregar agora**.
O navegador não executa o robô: o botão grava um pedido em `carga_automatica_pedido` (migration 263; só editor/admin, um pedido em aberto por carga) e o robô o atende na próxima rodada da tarefa agendada (até 5 min), mesmo fora do horário e com a carga pausada.
O resultado volta no próprio pedido (`concluido`/`erro` + texto), a tela atualiza sozinha e mostra um aviso. Valem as mesmas proteções e avisos da carga programada. Pedido `executando` há mais de 30 min é marcado como `erro` (robô interrompido).
**Para o botão responder em até 5 min, a tarefa precisa rodar a cada 5 min**: recrie-a com `.\instalar-tarefa.ps1 -Conta ... -Escopo Machine` (padrão 5) ou ajuste o gatilho no Agendador.

## Proteções

| Situação | Comportamento |
|---|---|
| Extração vazia | Não aplica (não apaga o mês). Log `bloqueada` |
| Queda de linhas > `queda_max_pct` (30%) vs. última carga do mês | Não aplica. Log `bloqueada`. `--force` libera |
| Linha reprovada na validação (ex.: território não cadastrado) | Não aplica nada; o lote fica na tela de carga para análise. Log `erro` e código de saída 1 |
| Lote com linhas não validadas (`valid_rows` ≠ extraídas) | Não aplica. Log `erro` |
| Aplicado, mas o razão do Vecton não tem todos os lançamentos do lote | Log `erro` (o robô só diz "aplicada" depois de contar o razão) |
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

1. **Banco** (SQL Editor do Supabase), nesta ordem: `supabase/259_carga_automatica.sql`, `supabase/260_seed_comercial_regioes_municipio.sql` e `supabase/261_carga_automatica_aviso_erro.sql` e `supabase/262_carga_automatica_avisa_sucesso.sql`, `supabase/263_carga_automatica_pedido.sql`, `supabase/264_carga_automatica_dre.sql` e `supabase/265_envio_semanal_painel_vendas.sql`. Antes da 260, confira que os territórios usados nas regiões existem em Parâmetros → Comercial → Território (a 260 aborta e lista os que faltam).
2. **Usuário no Vecton:** `robo.vecton@marcher.com.br` com perfil **Administrador** (a função `is_org_editor` aceita admin; um perfil menor exigiria `role = 'editor'` em `organization_users`). A senha deve ser forte e guardada fora do repositório.
3. **Servidor:** instalar Node 20+ (o *ODBC Driver 17/18 for SQL Server* só é necessário com autenticação Windows). Copiar a pasta `robo-cargas` para um disco **local** (não rodar de unidade de rede) e rodar `npm install`.
4. Copiar `config.example.json` para `config.json`. Autenticação do Protheus: `"windows"` (a conta que roda a tarefa precisa de leitura em `protheus_producao`) ou `"sql"` (usuário/senha via variável de ambiente).
5. Senhas só em variáveis de ambiente, nunca no `config.json`: `VECTON_ROBO_SENHA` (usuário do Vecton) e `PROTHEUS_SENHA` (login SQL). No PowerShell use **aspas simples**: `$env:VECTON_ROBO_SENHA = 'senha'`.
6. **Simular:** `node src/index.js vendas --dry-run`. Extrai do Protheus, mostra resumo e gera um CSV de conferência em `logs/`. Não grava no Vecton. Compare com o Excel.
7. Ligar a carga: `update carga_automatica_config set enabled = true where job = 'vendas';`
8. Agendar, em PowerShell **como administrador**: `.\instalar-tarefa.ps1 -Conta "marcher.local\ti.marcher" -Escopo Machine`.
   `-Conta` é a conta do **Windows** que executa a tarefa (não o usuário do Vecton); `-Escopo Machine` grava as senhas como variáveis do servidor, dispensando logar como essa conta. A tarefa criada se chama **`Vecton - Robo de Cargas`**. Se aparecer `not digitally signed`: `Unblock-File .\instalar-tarefa.ps1` e/ou `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`.

## Operação

```
node src/index.js vendas --dry-run        # simula
node src/index.js vendas --force          # carrega agora, ignorando a proteção de queda anormal
node src/index.js vendas --mes=2026-10    # mês específico (manual)
```

Acompanhar: `select started_at, status, reference_month, total_rows, mensagem from carga_automatica_log where job='vendas' order by started_at desc;`

Configuração (tabela `carga_automatica_config`): `enabled`, `meses_atras`, `meses_frente` (0/0 = só o mês corrente), `horarios` (ex.: `{12:00,23:30}`),
`params` (`cfops_saida`, `cfops_devol`, `queda_max_pct`, `diretorio_saida`).

## Ajustar territórios

Tela **Parâmetros → Comercial → Municípios**: busque o município, edite o território (lista dos territórios cadastrados) ou inclua município novo.
A mudança vale na próxima execução do robô e só para o mês corrente; meses fechados não são recarregados.
A regra fixa dos vendedores 000274 (GO_MG NORTE) e 000590 (GO_MG SUL) está em `src/territorio.js`.

## Relatórios e cache do navegador

Os relatórios de DRE/OPEX guardam o ano em memória no navegador e só descartavam o cache quando a carga era aplicada **por aquela tela**: uma carga do robô deixava o DRE mostrando a versão anterior até recarregar a página (Ctrl+F5).
Corrigido no front: o cache dos relatórios (ano do período e ano corrente) é descartado quando **chega aviso novo** (o sino consulta a cada 60 s) e quando um pedido **Carregar agora** termina. Quem já estava com a página aberta antes dessa versão precisa recarregar uma vez.

## Envio semanal do Painel de Vendas (e-mail com PDF)

O mesmo PDF do botão **Enviar por e-mail** do Painel de Vendas (mês + acumulado YTD) sai sozinho toda semana para um grupo. Configuração na tela **Parâmetros → Notificações → "Envio semanal do Painel de Vendas"** (migration 265): **ativo**, **dia da semana**, **horário**, **E-mail** marcado e os **destinatários** (usuários do Vecton). Nasce desligado (segunda 08:00, sem destinatários).
Como funciona: a cada rodada da tarefa (`node src/index.js run`) o robô lê essa configuração; se for o dia, passou do horário e ainda não enviou hoje, abre o Vecton num **navegador sem tela** (Edge/Chrome do servidor, via `playwright-core`) com a sessão do usuário do robô, abre o Painel por link direto e pede ao módulo (`window.VECTON_REPORT_AUTOMATION.comercialPainel`) o mesmo HTML/assunto/arquivo do botão. Em seguida chama a Edge Function `send-report-email` (que gera o PDF e envia) e carimba `schedule_last_fired_on`. Resultado em `carga_automatica_log` (job `relatorio_painel_vendas`); falha gera o e-mail "Carga automática com erro" e uma nova tentativa só depois de 1 hora.
- **Período:** o Painel abre no **mês corrente** (comportamento da tela ao entrar no relatório) e o **cenário** é o padrão da tela (`Fcst 5+7`, senão o primeiro cenário do ano), não o "favorito".
- **Servidor:** precisa de Edge ou Chrome instalado (`relatorios.canal` = `msedge`/`chrome`, ou `relatorios.executavel` com o caminho) e de `npm install` (novo pacote `playwright-core`, sem baixar navegador). Bloco opcional `relatorios` no `config.json` (`appUrl`, `canal`, `executavel`, `timeoutSegundos`, `assinatura`); sem ele valem os padrões do `config.example.json`.
- **Testar:** `node src/index.js relatorio --dry-run` monta o Painel e salva o HTML em `logs/Painel-Vendas_AAAA-MM.html` (abra no navegador para conferir), **sem enviar**. `node src/index.js relatorio --force` envia agora, ignorando dia/horário/ativo (exige destinatários). Para ligar: marcar **Ativo** e **E-mail**, escolher dia, horário e destinatários na tela.
- A função pg_cron dos lembretes agendados ignora este tipo (kind `relatorio*`), para não sair também um e-mail de texto no mesmo horário.
- O PDF é gerado pelo Browserless (secret `BROWSERLESS_API_TOKEN` da Edge Function), como no botão: um envio por semana consome pouco da cota.

## Carga do DRE

Mesma consulta e regras da carga manual (`Razao_Contabil [carga dados].xlsm` + tela Carga de Realizado - Manuais - DRE): lançamentos de `CT2010` (débito e crédito, moeda `01`, saldo tipo `1`) do mês corrente, contas na faixa `params.conta_de`…`params.conta_ate` (padrão `3` a `4zzzzzzzzzzzzzzzz`).
Cada lançamento vira uma linha de `actuals_import_rows` (conta/CC só dígitos, filial com 2 posições, valor com 2 casas) e o lote `complete` do mês é aplicado por `apply_actuals_import_batch`; o aviso é "Carga de Realizado aplicada" (migration 264 cadastra a carga, **desligada**).
O Vecton valida cada linha: conta no Plano de Contas DRE, centro de custos e empresa cadastrados; uma linha reprovada bloqueia a carga (como na tela manual) e o e-mail de erro lista os motivos **agrupados** (ex.: "conta 31101099 · CC - · filial 01 (40 linhas) — Conta nao cadastrada").
Ligar: simular com `node src/index.js dre --dry-run`, conferir o saldo/linhas com o Excel e então `update carga_automatica_config set enabled = true where job = 'dre';`. A tarefa agendada atende as duas cargas (`node src/index.js run`). O login SQL do robô precisa ler `CT2010` (no ambiente atual ele lê todas as tabelas).

## Carga do Balanço Patrimonial (semi-automática)

Carga **mensal e sob demanda** do BP Real, sem horário programado: na semana seguinte à virada do mês, em **Parâmetros → Carga de Realizado → Automatizadas**, o card **Balanço Patrimonial** traz o seletor **Mês da carga** (padrão: mês anterior; só meses fechados, últimos 18) e o botão **Carregar agora**. O pedido leva o mês escolhido (`carga_automatica_pedido.reference_year/reference_month`, migration 308) e o robô o atende na próxima rodada (até 5 min).
- **Consulta:** a mesma do `Base Carga BP.xlsm` (`sql/bp_mes.sql`): saldo acumulado no fim do mês = CQ0 até o fim do mês anterior + movimento da CT2 do mês (moeda `01`, saldo tipo `1`), contas `params.conta_de`…`params.conta_ate` (padrão `1` a `2zzzzzzzzzzzzzzzz`), só contas com saldo diferente de zero.
- **Regras da carga manual** (tela Carga de Realizado - Balanço Patrimonial): consolidada Marcher, carga completa da competência (o fechamento anterior do mês é substituído), grava só contas **analíticas** presentes na extração (as sintéticas são conferência; contas omitidas não herdam saldo). Conta inexistente no Plano BP, tipo divergente, duplicada, inativa ou sem chave agrupadora **bloqueia** a carga (log `erro` + e-mail de erro agrupado por conta), igual à importação do Excel.
- **Como grava:** `bp_save_draft` + `bp_apply_draft` (as mesmas funções da tela), depois confere o fechamento gravado (nº de contas e soma). O usuário do robô precisa ser **Administrador** (`can_manage_bp_plan`). Rascunhos `Protheus BP …` de tentativas anteriores do mesmo mês são removidos antes.
- **Proteções:** mês corrente/futuro é recusado (`--force`/`--dry-run` liberam); extração vazia e queda > `queda_max_pct` (30%) vs. a última carga `ok` do mesmo mês bloqueiam.
- **Linha de comando:** `node src/index.js bp --mes=2026-09 --dry-run` simula (CSV em `logs/BP_2026-09.csv`); sem `--dry-run` carrega. O `--mes` é obrigatório.
- Não gera aviso de "carga aplicada" (a tela manual do BP também não); só o e-mail/sino de erro.

## Nova carga

Criar `src/jobs/<nome>.js` exportando: `nome`, `precisaRegioes`, `alvo` (tabelas e funções do Vecton: `batches`, `rows`, `apply`, `remove`, `errorSelect`), `extrairMes`, `paraLinhaImport`, `descreverErro`, `textoResumo`, `textoSimulacao` e `gravarCsv`; copiar a query para `sql/<nome>_mes.sql` com placeholders; registrar em `JOBS` (`src/runner.js`), inserir a linha em `carga_automatica_config` e o card em `JOBS` de `src/modules/actuals/cargasAutomatizadasModule.js`. O runner é genérico (lote `complete`, validação, proteções, log, avisos, pedidos).

## Dicas de operação

- **Carregar agora:** `node src/index.js vendas` (não depende do horário; regrava o mês corrente e dispara o aviso de carga aplicada).
- **Horários (por carga):** `update carga_automatica_config set horarios = array['12:00','23:30'] where job = 'vendas';` e `... array['10:00','15:00','19:00'] where job = 'dre';`. Evite `00:00`: nesse horário o "mês corrente" já virou, e as vendas do fim do último dia do mês ficariam fora da carga automática.
- **Pausar:** `update carga_automatica_config set enabled = false where job = 'vendas';`
- **Pasta do CSV:** `update carga_automatica_config set params = jsonb_set(params, '{diretorio_saida}', '"C:\\robo-cargas\\logs"') where job = 'vendas';`
- A tarefa agendada roda a cada 15 min; execuções sem horário devido não geram log. Falha de login no Vecton não grava log no banco (só no Agendador).

## Testes

`npm test` (lógica de território, janela de meses, SQL, hash e MB; não precisa de banco).
