# Carteira vigente — plano de implementação

> **Para quem executar:** usar superpowers:subagent-driven-development ou superpowers:executing-plans, tarefa por tarefa. Os passos usam checkbox (`- [ ]`). **Este plano não contém código**: só arquivos, assinaturas, nomes de testes e valores decididos. O código é escrito na execução.

**Objetivo:** o Vecton passa a mostrar a carteira real e atual de pedidos em aberto (todos os tipos), distribuída pelo mês da data de entrega prevista, sem carga retroativa e sem tocar no faturamento.

**Arquitetura:** o robô grava a carteira completa (aberta, qualquer data de entrega) só no lote do mês corrente. O banco passa a ler a carteira somente da "foto vigente" (lote mais recente com carteira) e a filtrar o período pela data de entrega, enquanto o faturamento continua lido por lote de mês. A lógica nova fica em duas funções SQL pequenas e testáveis, usadas pelas funções do painel.

**Tecnologias:** Node 18+ (robô, `node --test`), SQL Server/Protheus (consulta), Postgres/Supabase (migrations, funções), PGlite (testes SQL), JavaScript do front (textos).

**Spec:** `docs/superpowers/specs/2026-10-23-carteira-vigente-design.md`

## Restrições globais

- Faturamento (`FAT`: saídas e devoluções) **não muda** em consulta, lotes ou relatórios.
- Nada escreve em meses passados. A carteira completa só é gravada no **mês corrente**.
- Foto vigente = mês de lote mais recente (ano, mês) que tem `origem = 'CART'` **e não é posterior ao mês corrente do calendário** (corrigido após a Tarefa 1: já existe lote manual de novembro com carteira; ver Resultado da Tarefa 1, item 5 — a confirmar com o Ricardo). `meses_frente = 0` e `meses_atras = 0` já estão na configuração do robô.
- Janelas pela data de entrega (`entry_date`): Mês = o mês escolhido; YTD = 1º de janeiro do ano até o último dia do mês escolhido; Ano = 1º de janeiro a 31 de dezembro. Atrasados de meses anteriores **não** entram no toggle Mês.
- Virada de mês: até a primeira carga do mês novo, a foto vigente é a do mês anterior (aceito).
- Mês corrente é sempre do robô. Carga manual (`Painel_Vecton.xlsm`) só para meses fechados; no fechamento, o robô carrega o mês novo antes de a planilha do mês fechado subir.
- Limpeza das fotos antigas de carteira é etapa **separada**, depois da validação, com backup. Não faz parte deste plano.
- **Não commitar nem dar push sem o Ricardo pedir.** Os passos "Commit" abaixo só valem quando ele autorizar; o commit na `main` publica.
- Ricardo é leigo em PowerShell e servidor: etapas de operação (rodar o robô, aplicar SQL, copiar arquivo no servidor) vão **uma por vez**, dizendo onde rodar e pedindo a saída antes de seguir.
- Tooltips e textos de ajuda seguem o padrão do app (`.cockpit-tip`), nunca `title` nativo.

## Foco de revisão

Casos que o spec implica e nenhuma tarefa exercita sozinha; cada linha tem teste na tarefa dona.

1. **Carteira atrasada de ano anterior** (ex.: entrega em dez/2026 ainda aberta em jan/2027): **decidido em 26/10/2026** — fica só no ano de origem. Aparece ao navegar para o ano em que estava prevista e **não** entra no YTD nem no Ano do ano seguinte. Hoje o valor é zero; só importa na virada. Teste na Tarefa 3.
2. **Variação da carteira vs período anterior e vs ano anterior** em Peças Geo: a foto antiga deixa de servir como comparação. **Decidido em 26/10/2026:** mostrar "—" na variação da carteira, mantendo a comparação de faturamento. Teste na Tarefa 4.
3. **Linha de carteira sem data de entrega** (`C6_ENTREG` vazio ou inválido): a consulta atual as exclui. Esperado: continuam fora, mas o resumo da carga informa quantas ficaram de fora. Teste na Tarefa 2.
4. **Carga repetida no mesmo dia e carga em mês fechado**: repetir não duplica; mês fechado não recebe carteira. Teste na Tarefa 2.
5. **Sem nenhuma carteira no ledger** (organização nova ou lote vazio): o painel mostra zero na carteira, sem erro. Teste na Tarefa 3.

---

## Tarefa 1: Verificações e decisões pendentes (sem alterar nada)

**Arquivos:** nenhum alterado, exceto anexar as conclusões à seção 8 do spec.

**Produz:** respostas que as tarefas 2 a 4 consomem.

- [ ] **Passo 1: Validação do lote.** Ler no banco (consulta de leitura) a função de validação/aplicação do lote de vendas e confirmar se uma linha com `entry_date` fora do mês do lote é aceita. Resultado esperado: aceita, ou a lista exata de checagens que a rejeitam.
- [ ] **Passo 2: Configuração do robô.** Ler `carga_automatica_config` do job `vendas` e registrar `meses_atras`, `meses_frente`, `queda_max_pct`. Esperado: `meses_atras = 0` e `meses_frente = 0`; se não for, anotar o ajuste necessário (a alteração é feita na Tarefa 5, com autorização).
- [ ] **Passo 3: Mapa de leitura de CART.** Obter a definição **viva** (não a do repositório, que foi alterada por substituição de texto na migration 254) das funções: `comercial_painel_vendas`, `comercial_painel_tipos`, `comercial_painel_pecas_vendedor`, `comercial_painel_detalhe`, `comercial_pecas_geo_performance`, `comercial_pecas_geo_evolucao_mensal`, e verificar se `comercial_report_*` (motor de relatórios), as margens (`255`–`258`), o mapa e os e-mails leem CART. Resultado: lista de funções a alterar e de funções que ficam como estão, com o motivo.
- [ ] **Passo 4: Decisões com o Ricardo** (uma por vez): (a) ~~carteira atrasada de ano anterior~~ — decidido: só no ano de origem (Foco 1); (b) ~~variações de carteira~~ — decidido em 26/10/2026: mostrar "—" nas variações de carteira em Peças Geo (vs período anterior e vs ano anterior); a comparação de faturamento continua.
- [ ] **Passo 5: Anexar as conclusões ao spec** e dizer o que mudou no plano, se algo mudou.

### Estado final (26/10/2026)

Tarefas 1 a 6 concluídas e conferidas em produção. Robô: 53/53 testes. Banco: migrations 311 (visão + painel) e 312 (validação) aplicadas pelo Ricardo no SQL Editor; testes `tests/carteiraVigente.sql.test.js`, `carteiraVigentePainel.sql.test.js`, `carteiraValidacao.sql.test.js` e `comercialPecasGeoCarteiraTexto.test.js` passando. A 311 foi reescrita depois de aplicada, para o arquivo poder ser reaplicado sem erro (a versão com tabela temporária falhava no SQL Editor); o banco já estava correto e a nova versão é equivalente. Glossário da Peças Geo atualizado; README do robô com a seção de carteira vigente e o procedimento de fechamento. Primeira carga real: 322 linhas (106 FAT, 216 CART); as 5 reprovações iniciais eram cadastro (clientes 007821 e 007783, produto 210222) e foram resolvidas pelo Ricardo. **Sem commit** (aguarda o Ricardo). `docs/robo-cargas-instrucao-ti-simulacao-carteira.md` ficou obsoleto: a simulação em cópia não foi usada, os arquivos foram direto à pasta de produção. **Pendentes:** decisão sobre o robô deixar de fora só a carteira com cadastro faltando (hoje ela trava o lote inteiro); limpeza das fotos antigas de carteira com backup.

### Complementos (26/10/2026, depois do estado final)

- **Decisão do Ricardo:** cadastro faltando em pedido de carteira **continua reprovando o lote** (não se descarta carteira em silêncio); o que muda é a clareza do aviso. Implementado: `mensagemErros` em `robo-cargas/src/jobs/vendas.js` (agrupa por cliente/produto a cadastrar, com documentos, valor e onde cadastrar; primeira frase cabe nos 160 caracteres do card) e gancho `job.mensagemErros` em `robo-cargas/src/runner.js` (detalhe técnico passa a `detalhes.linhas_reprovadas`; `primeiros_erros` fica vazio quando há texto pronto, para o aviso do banco não repetir a lista técnica). Testes: robô 58/58. O trecho do runner só é exercitado numa falha real de cadastro (não há teste de integração com o Supabase). **A implantar no servidor:** `robo-cargas/src/jobs/vendas.js` e `robo-cargas/src/runner.js`.
- **Limpeza das fotos antigas (autorizada pelo Ricardo):** `supabase/limpeza_fotos_antigas_carteira_20261026.sql` (backup + trava de contagem + um bloco atômico; teste `tests/carteiraLimpezaFotos.sql.test.js`). Conferido em leitura: foto vigente 202610 (216 linhas, preservadas), 29 linhas a apagar (ago 20 + set 9), sem backup prévio. **Ainda não executada** (a conexão é somente leitura; o Ricardo roda no SQL Editor).
- 311 reescrita foi reaplicada pelo Ricardo: 6 funções e visão corretas.

### Resultado da Tarefa 1 (executada em 26/10/2026, só leitura, projeto `jwjnvxshtdekzcprmsyl`)

1. **Validação do lote REJEITA data fora do mês do lote** (`validate_comercial_realizado_import_row`: "Data fora da competencia do lote"). O plano original falharia. **Ajuste:** a Tarefa 3 ganha uma migration que dispensa essa checagem **somente para `origem = 'CART'`** (FAT continua exigindo a data dentro do mês). Demais regras da validação seguem iguais. Efeito colateral aceito: a carga manual de CART também deixa de exigir a data dentro do mês.
2. **Atribuição vigente:** 88 atribuições, todas desde 2023-01-01 e sem `data_fim`. Datas de entrega a partir de 2023 passam. Entrega **anterior a 2023-01-01** reprovaria o lote inteiro; a simulação (Tarefa 2) deve conferir a menor data.
3. **Configuração do robô (vendas):** `meses_atras = 0`, `meses_frente = 0`, horários 12:00 e 23:30, `queda_max_pct = 30`. Nada a ajustar; o passo 5 da Tarefa 5 sobre configuração **não é necessário**.
4. **Leitores de CART:** alterar `comercial_painel_vendas`, `comercial_painel_tipos`, `comercial_painel_pecas_vendedor`, `comercial_painel_detalhe`, `comercial_pecas_geo_performance`, `comercial_pecas_geo_evolucao_mensal`. **Ficam como estão:** mapa (`comercial_mapa_*`) e margens (`comercial_margens_*`) leem só FAT; o motor de relatórios (`comercial_report_*`) aceita origem escolhida, mas nenhum dos 2 relatórios (10 versões) salvos usa CART. Nota: um relatório futuro configurado com CART usaria o mês do lote, não a data de entrega.
5. **Achado novo: já existe carteira de novembro no ledger** — lote manual `11.2026.xlsx` (criado em 09/10), 24 linhas, R$ 1,30 mi (Máquinas 6 linhas / R$ 1,27 mi; Peças 17 / R$ 17,8 mil; Acessórios 1 / R$ 10,8 mil). Com a regra "foto vigente = lote mais recente com carteira", **novembro venceria outubro** (outubro, do robô, tem 82 linhas de carteira) e o painel mostraria só a carteira manual de novembro. **Regra corrigida (proposta, a confirmar):** foto vigente = lote mais recente com carteira **cujo mês não seja posterior ao mês corrente do calendário**. Lotes futuros ficam ignorados até o mês chegar; no 1º dia do mês novo, sem lote do mês, vale o mais recente anterior.
6. **Pergunta aberta ao Ricardo:** os 24 itens do lote manual de novembro (principalmente Máquinas, R$ 1,27 mi) existem como pedidos em aberto no Protheus com entrega em novembro? Se forem previsões manuais fora do Protheus, a regra nova os deixa de fora. Conferir na simulação da Tarefa 2.
6b. **Resolvido em 26/10/2026:** o Ricardo disse que o lote de novembro era um teste sem importância e o apagou pelo SQL Editor (a conexão de leitura não permite DELETE). Conferido: `lotes_nov = 0`, `ledger_nov = 0`, `cart_total = 111`. **Ruling:** a regra "não posterior ao mês corrente" é mantida mesmo assim, como proteção contra carga manual antecipada de outro mês — custo se estiver errada: uma condição a mais na função da foto vigente.
7. Lotes recentes: outubro/2026 do robô ("Protheus vendas 2026-10 12:00", 185 linhas, 82 de carteira); setembro/2026 manual (`09.2026.xlsx`, carregado em 26/10).

## Tarefa 2: Robô — carteira completa só no mês corrente

**Arquivos:**
- Modificar: `robo-cargas/sql/vendas_mes.sql` (somente o bloco `CART_BASE`)
- Modificar: `robo-cargas/src/jobs/vendas.js`
- Testar: `robo-cargas/test/robo.test.js`

**Interfaces:**
- Produz: `montarSql(params, { ini, fim, incluiCarteira })` — com `incluiCarteira` falso, o SQL gerado não traz linhas `CART`; com verdadeiro, traz toda a carteira aberta sem corte de data de entrega.
- Produz: `deveIncluirCarteira(mes: {ano, mes}, hoje: {ano, mes}) -> boolean` em `vendas.js` — verdadeiro só quando o mês é o mês corrente.
- Produz: o objeto `resumo` de `resumir()` ganha `cartSemData` (número de itens abertos excluídos por falta de data de entrega).
- Consome: `agora(tz)` de `robo-cargas/src/util.js` para saber o mês corrente.

- [ ] **Passo 1: Escrever os testes que falham** (em `robo.test.js`, mesmo estilo dos existentes):
  - `montarSql sem carteira nao inclui linhas CART` — com `incluiCarteira: false`, o texto não contém o bloco da carteira.
  - `montarSql com carteira nao corta por data de entrega` — com `incluiCarteira: true`, o SQL não contém comparação de `C6_ENTREG` com `{{DATA_INI}}`/`{{DATA_FIM}}`.
  - `deveIncluirCarteira so no mes corrente` — outubro/2026 em outubro/2026 verdadeiro; setembro/2026 e novembro/2026 falsos; virada de ano (dezembro/2025 em janeiro/2026) falso.
  - `resumir informa itens de carteira sem data` — `cartSemData` reflete a contagem informada.
  - `montarSql substitui todos os placeholders` e `montarSql exige CFOPs configurados` continuam passando.
- [ ] **Passo 2: Rodar e ver falhar:** `npm test` dentro de `robo-cargas`. Esperado: os novos testes falham por função/parâmetro inexistente.
- [ ] **Passo 3: Alterar `vendas_mes.sql`:** no bloco `CART_BASE`, remover o corte de `C6_ENTREG` por início/fim do mês, mantendo a exigência de data de 8 dígitos válida, e demais filtros (pedido sem nota, `C5_ORCAMEN = 'P'`, `C5_TIPO = 'N'`, TES/CFOP de saída, exclusão do produto `102326` e da contabilização `005`). Tornar o bloco de carteira condicional a `incluiCarteira` via marcador no template, no mesmo estilo dos placeholders atuais. O bloco `FAT` não pode ter nenhuma diferença (conferir por diff).
- [ ] **Passo 4: Alterar `vendas.js`:** `montarSql` aceita `incluiCarteira`; `extrairMes` calcula `deveIncluirCarteira(mes, hoje)` e repassa; `resumir` conta `cartSemData`; `textoResumo`/`textoSimulacao` informam o número. A contagem de itens sem data exige uma segunda leitura leve ou uma coluna de apoio na consulta — escolher a mais simples e registrar.
- [ ] **Passo 5: Rodar os testes:** `npm test` em `robo-cargas`. Esperado: todos passam (incluindo `dre`, `relatorios`, `bp`).
- [ ] **Passo 6: Simulação com dados reais** (guiada, no servidor do robô, uma etapa por vez): `npm run vendas:simular`. Esperado: nada gravado, CSV de conferência em `logs`, com linhas `CART` de meses anteriores e futuros. Comparar com o cálculo manual do Ricardo de 23/10 (por mês de entrega e por tipo). Divergência: parar e investigar antes da Tarefa 3.
- [ ] **Passo 7: Commit** (só se o Ricardo autorizar): `robo-cargas/sql/vendas_mes.sql`, `robo-cargas/src/jobs/vendas.js`, `robo-cargas/test/robo.test.js`.

### Execução da Tarefa 2 (26/10/2026)

- Passos 1 a 5 feitos: testes escritos e vistos falhar (import inexistente), implementação, suíte do robô **53/53 passando** (`npm test` em `robo-cargas`). Diff do SQL: só o bloco da carteira mudou; o FAT está idêntico.
- **Ruling (implementação):** a carteira é desligada nos meses fechados por um marcador no WHERE da carteira (vazio = completa; condição falsa = sem carteira), em vez de remover o bloco do template. Custo se estiver errado: nenhum comportamento muda; é só estilo. Itens de carteira sem data de entrega agora vêm do SQL com data nula e o robô os separa e conta (`cartSemData`); o resumo também informa `cartMaisAntiga`, para a simulação conferir entregas anteriores a 01/01/2023.
- Passo 6 (simulação com dados reais) **pendente**: a senha do Protheus (`PROTHEUS_SENHA`) não está definida nesta máquina, então a simulação precisa rodar onde o robô roda, com o Ricardo. Passo 7 (commit) só com autorização.

### Ruling de desenho das Tarefas 3 e 4 (26/10/2026, antes de implementar)

Em vez das funções `comercial_cart_vigente` e `comercial_cart_janela`, **uma visão** `comercial_realizado_ledger_vigente` (security_invoker): devolve todo o FAT como está e, da carteira, só o lote vigente, **com `reference_year`/`reference_month` reescritos para o ano/mês da data de entrega**. As funções do painel só trocam a origem dos dados (`comercial_realizado_ledger_entries`/`comercial_fat_cart` → a visão) e perdem os filtros de "mês de referência da carteira"; os filtros de Mês/YTD/Ano que já existem passam a valer pela data de entrega sem outra mudança. Carteira de ano anterior fica só no ano de origem e a comparação de carteira em Peças Geo some (vira "—"), ambos por consequência direta. Custo se estiver errado: reverter a migration (as definições anteriores estão na 254). A hora corrente vem de uma função auxiliar (`comercial_cart_ym_corrente`) para os testes poderem fixar a data. Ordem de implantação: **311 (visão + painel) → 312 (validação aceita data fora do mês só para CART) → carga do robô**.

### Execução das Tarefas 3 e 4 (26/10/2026) — arquivos prontos, ainda NÃO aplicados no banco

- `supabase/311_carteira_vigente.sql` (visão + 6 funções do painel) e `supabase/312_carteira_validacao_data.sql` (validação). Testes PGlite: `tests/carteiraVigente.sql.test.js` (7 grupos) e `tests/carteiraValidacao.sql.test.js`, ambos passando. A suíte do robô segue 53/53.
- Verificado **em leitura** contra o banco vivo: todos os 9 trechos da 311 casam exatamente uma vez; a regex da Peças Geo não deixa referência antiga; o trecho da 312 casa; nenhuma outra função/constraint/trigger do fluxo de vendas valida a data. Total FAT + carteira pela regra antiga = regra nova nos três períodos (Mês R$ 1.761.471; YTD e Ano R$ 73.527.685), então a 311 não muda número algum hoje.
- **Ruling:** a tela de Peças Geo já mostra "sem base comparável" quando o período anterior vem zerado, então a decisão de "—" na variação da carteira não exige mudança no front. A migration não pode ser testada ao vivo (conexão somente leitura): o SQL Editor roda cada arquivo numa transação, e qualquer divergência faz rollback total.

## Tarefa 3: Banco — foto vigente e janela por data de entrega

**Arquivos:**
- Criar: `supabase/311_carteira_vigente_helpers.sql`
- Criar: `tests/carteiraVigente.sql.test.js` (PGlite, mesmo padrão de `tests/bp.sql.test.js`)

**Interfaces:**
- Produz: `public.comercial_cart_vigente(p_org uuid) returns table(reference_year integer, reference_month integer)` — o lote mais recente com `origem = 'CART'` na organização; sem linhas se não houver carteira.
- Produz: `public.comercial_cart_janela(p_year integer, p_month integer, p_period text) returns table(data_ini date, data_fim date)` — para `'mes'`, `'ytd'`, `'fy'` conforme as restrições globais.
- Acesso: `grant execute` para `authenticated`, no mesmo padrão da `comercial_cart_ref_month` (migration 254).

- [ ] **Passo 1: Escrever os testes que falham.** Fixture: ledger com FAT em março; CART no lote de setembro (foto antiga); CART no lote de outubro com `entry_date` em março, outubro e novembro; organização B com carteira própria. Testes:
  - `vigente devolve outubro quando outubro e o lote mais recente com carteira`
  - `vigente ignora lote mais recente sem carteira` (lote de novembro só com FAT)
  - `vigente isola organizacoes`
  - `vigente sem carteira devolve zero linhas` (Foco 5)
  - `janela mes devolve primeiro e ultimo dia do mes` (inclui fevereiro bissexto)
  - `janela ytd vai de 1 de janeiro ao fim do mes escolhido`
  - `janela fy cobre o ano inteiro`
  - `carteira de ano anterior fica so no ano de origem` — item aberto com entrega em dez/2026 aparece na janela de 2026 e não aparece em YTD nem em Ano de 2027 (Foco 1)
- [ ] **Passo 2: Rodar e ver falhar:** `node tests/carteiraVigente.sql.test.js`. Esperado: falha por função inexistente.
- [ ] **Passo 3: Escrever a migration 311** só com as duas funções e os `grant`. Transação única, idempotente (`create or replace`), sem alterar nenhuma função existente.
- [ ] **Passo 4: Rodar os testes.** Esperado: passam.
- [ ] **Passo 5: Commit** (só se o Ricardo autorizar): os dois arquivos.

## Tarefa 4: Banco — funções do painel passam a usar a regra nova

**Arquivos:**
- Criar: `supabase/312_carteira_vigente_painel.sql`
- Criar: `tests/carteiraVigentePainel.sql.test.js`
- Consome: lista de funções da Tarefa 1, passo 3.

**Interfaces:**
- Consome: `comercial_cart_vigente` e `comercial_cart_janela` (Tarefa 3).
- Produz: as funções do painel com assinatura **inalterada** (o front não muda): `comercial_painel_vendas`, `comercial_painel_tipos`, `comercial_painel_pecas_vendedor`, `comercial_painel_detalhe`, `comercial_pecas_geo_performance`, `comercial_pecas_geo_evolucao_mensal`, mais as que a Tarefa 1 apontar.

- [ ] **Passo 1: Escrever os testes que falham**, com fixture mínima de ledger e das tabelas de apoio de cada função (mesma estratégia de `tests/bp.sql.test.js`; se a função depende de muitas tabelas, testar o predicado de carteira isolado e deixar a conferência completa para a Tarefa 6):
  - `mes de outubro soma so carteira com entrega em outubro`
  - `ytd soma carteira de janeiro a outubro e nao novembro`
  - `ano soma carteira de janeiro a dezembro` (inclui novembro)
  - `mes de marco mostra os atrasados de marco da foto vigente`
  - `fotos antigas de carteira sao ignoradas` (CART de setembro não soma)
  - `faturamento e identico ao anterior` (mesmo FAT antes e depois)
  - `variacao da carteira em Pecas Geo nao compara com foto antiga` (Foco 2, conforme decisão da Tarefa 1)
- [ ] **Passo 2: Rodar e ver falhar.**
- [ ] **Passo 3: Escrever a migration 312** no padrão da 254: ler a definição **viva** de cada função, substituir só o trecho que hoje filtra CART por mês de referência pelo filtro "lote vigente + data de entrega dentro da janela", falhar com mensagem clara se a estrutura não for a esperada, ser idempotente. `comercial_cart_ref_month` permanece (outras telas podem usá-la) até a Tarefa 1 confirmar que ninguém mais a chama.
- [ ] **Passo 4: Rodar os testes.** Esperado: passam.
- [ ] **Passo 5: Commit** (só se o Ricardo autorizar).

## Tarefa 5: Textos do front e procedimento de fechamento

**Arquivos:**
- Modificar: `src/modules/reports/reportsComercialPecasGeoModule.js` (glossário, linha do "Valor de Peças"), e demais textos de carteira encontrados na Tarefa 1
- Modificar: `robo-cargas/README.md` (procedimento de fechamento do mês)
- Testar: `tests/comercialPecasGeoCarteiraTexto.test.js` (ou teste de texto existente da mesma área)

**Interfaces:** nenhuma assinatura nova.

- [ ] **Passo 1: Teste que falha:** `glossario descreve a carteira vigente por data de entrega` — o texto de "Valor de Peças" não menciona mais "mês de referência" nem "último mês com carga" e menciona foto mais recente e data de entrega prevista.
- [ ] **Passo 2: Rodar e ver falhar.**
- [ ] **Passo 3: Atualizar os textos** (glossário e ajudas) seguindo o padrão do app; incluir no README do robô o procedimento de fechamento: (1) robô carrega o mês novo; (2) só então sobe a planilha do mês fechado; e o aviso de que mês fechado nunca recebe carteira.
- [ ] **Passo 4: Rodar o teste** e a suíte de textos existente. Esperado: passam.
- [ ] **Passo 5: Se a Tarefa 1, passo 2, achou configuração diferente de zero:** ajustar `carga_automatica_config` (`meses_atras = 0`, `meses_frente = 0`) com autorização explícita do Ricardo.
- [ ] **Passo 6: Commit** (só se autorizado).

## Tarefa 6: Implantação e validação em produção (guiada)

**Arquivos:** nenhum novo. Anexar os números conferidos ao spec.

- [ ] **Passo 1: Antes de aplicar:** registrar o FAT por mês e por tipo (2023–2026) e o total de linhas do ledger, para comparação.
- [ ] **Passo 2: Aplicar as migrations 311 e 312** no SQL Editor do Supabase (guiado, uma por vez). Esperado: sem erro.
- [ ] **Passo 3: Copiar o robô atualizado** para o servidor (consulta SQL e `vendas.js`), guiado, uma etapa por vez, e conferir com `npm run vendas:simular` que o CSV continua igual ao da Tarefa 2.
- [ ] **Passo 4: Rodar a carga real do mês corrente** ("Carregar agora" na tela de cargas ou execução manual do robô). Esperado: status concluído; `carga_automatica_log` com total de linhas coerente e `cartSemData` informado.
- [ ] **Passo 5: Conferir:** (a) FAT por mês e por tipo idêntico ao do passo 1, exceto o mês corrente, que o robô sempre regrava; (b) carteira por mês de entrega e por tipo = cálculo manual do Ricardo; (c) Painel de Vendas em Mês, YTD e Ano e Peças Geo em NFs, Carteira e NFs + Carteira com os números esperados (Ano inclui novembro e dezembro); (d) "Carregar agora" escolhendo um mês fechado **não** grava carteira.
- [ ] **Passo 6: Reversão pronta:** guardar as definições anteriores das funções (da 254 e posteriores) e a consulta anterior do robô; descrever em uma linha como voltar.
- [ ] **Passo 7: Registrar no spec** o resultado e a data. Lembrar o Ricardo das etapas separadas pendentes: limpeza das fotos antigas e, mais tarde, faixas de prazo em Peças.

## Autoverificação

- **Cobertura do spec:** seção 6.1 (consulta, trava, config) → Tarefas 1 e 2; 6.2 (foto vigente, funções do painel) → Tarefas 3 e 4; 6.3 (textos) → Tarefa 5; seções 9 a 11 (fases, validação, reversão) → Tarefa 6. Limpeza e faixas de prazo estão fora por decisão e listadas na Tarefa 6, passo 7.
- **Consistência de nomes:** `comercial_cart_vigente`, `comercial_cart_janela`, `deveIncluirCarteira`, `incluiCarteira` e `cartSemData` aparecem com o mesmo nome em todas as tarefas.
- **Proporção:** plano sem corpo de função; cada passo dá uma única escolha razoável a quem executa.
