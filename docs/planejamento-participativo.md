# Planejamento participativo

Implementação local do fluxo validado em 19/10/2026. A migration não é aplicada automaticamente pelo aplicativo. O código não publica nem migra produção.

## Regras implementadas

- `+ Novo cenário` inicia um wizard com identidade, base, fontes mensais, formulários, valores iniciais, pessoas, liberação e revisão. A mesma criação atende Budget e Forecast, sem desenho fixo 5+7.
- Cada um dos 12 meses recebe inputs de formulários ou um snapshot do mesmo mês de Real/cenário de outro ano. O snapshot é gravado no ano de destino. Fontes ficam imutáveis.
- Formulários são livres, sem modelo padrão. O administrador cria linhas Digitado, Fórmula e Linha normal, vincula contas DRE analíticas, define referências estáveis, agrupamento e destaque.
- Acessos por pessoa e formulário: `read` ou `write`. O perfil define os centros de custo autorizados. Sem gestão/concessão não há escopo. Administradores configuram todos os formulários.
- Um centro permite digitar; vários centros mostram soma em leitura. Só meses `forms` recebem inputs. Salvar é explícito. A exportação usa valores salvos.
- Colagem tabular, repetir até dezembro, distribuir total em centavos, copiar de outro centro autorizado e navegação por teclado usam o mesmo salvamento.
- Qualquer usuário com `write` num formulário liberado pode integrar o cenário inteiro. Usuários `read` não integram. Inputs não salvos não participam. Fórmulas não geram ledger.
- Despesa positiva e receita negativa seguem o sinal existente do ledger. A apresentação de sinais continua a cargo do DRE existente.
- Depois de haver valores salvos no formulário, remover linhas ou mudar sequência/origem/conta/nome de referência/fórmula é recusado. Descrição, agrupamento, formatação e novas linhas continuam editáveis.
- O bloqueio manual ou agendado vence todos os papéis, inclusive admin. Para desbloquear, o admin usa a operação própria.
- A estrela permanece global por organização e os leitores existentes continuam usando `scenario:<id>`.

## Banco e segurança

`278_planning_participativo.sql` acrescenta `planning_version`, `kind`, `status` e `lock_at` ao cabeçalho, `planning_form_id` ao ledger e oito tabelas: meses, formulários, linhas, acessos, inputs, execuções e duas auditorias.

As novas tabelas só concedem SELECT ao cliente, com RLS. `planning_context` retorna metadados autorizados; `planning_read_form` lê entradas por centros autorizados. `planning_write` valida ator, organização e relações antes de alterar qualquer estado. As funções internas de cópia/validação não concedem EXECUTE ao cliente.

Todas as mutações de um cenário obtêm `FOR UPDATE` no mesmo cabeçalho. Isso serializa salvamento, configuração, bloqueio e publicação. `save_entries` recebe no máximo 5.000 células, a versão de cada uma e a revisão da estrutura vista pela tela. Mudanças de estrutura/acessos exigem reabrir o formulário. Qualquer conflito retorna o lote sem salvar nada. A versão de célula ausente é zero. Apagar valores mantém células zeradas com versões incrementadas para não reintroduzir a corrida de apagar/recriar.

A publicação substitui apenas linhas com `planning_form_id`, preservando os snapshots. É uma soma por formulário/conta/CC/mês. Uma subtransação reverte toda a substituição em caso de falha; o registro de execução com erro sobrevive na transação externa. O cliente recebe `{ok:false,error:...}` e não interpreta isso como sucesso.

Triggers bloqueiam gravação pelos caminhos legados nos cenários gerenciados, inclusive nos totais mensais. Cargas por arquivo deixam de oferecer esses destinos. Cenários antigos permanecem no fluxo atual. A leitura do resultado projetado mantém a opção A previamente aceita; isso não relaxa o isolamento de organização ou os inputs.

A proteção dos campos administrativos de `user_profiles` (impedir auto-promoção pela policy antiga de escrita do próprio perfil) saiu da 278 e está na `281_guard_user_profiles.sql`, independente do Planejamento. Detalhes na seção da 281, abaixo.

## Frontend

`src/modules/planning/planningCore.js` implementa parser aritmético sem `eval`/`new Function`, dependências/ciclos, validação numérica e distribuição em centavos.

O front se divide em três arquivos carregados nesta ordem: `planningCore.js` (fórmulas, valores, centavos), `planningViews.js` (telas do wizard, cenário, estrutura, acessos e grade; só montam HTML a partir do estado recebido) e `planningModule.js` (estado, chamadas ao servidor, eventos e diálogos), sem dados demonstrativos. `planning.css` usa os tokens do Vecton nos dois temas. `forecastModule.js` integra o novo fluxo preservando os relatórios e cenários antigos. A ausência de `planning_context` mantém a criação antiga disponível até aplicar a migration.

O rascunho local é identificado por organização, usuário, cenário, formulário e centros. Falha de localStorage não impede o preenchimento. A recuperação depende da mesma revisão de estrutura e o save sempre revalida as versões no servidor. Não há edição offline ou publicação automática.

## Validação e entrada em homologação

1. Aplicar a migration em uma cópia de homologação com o schema atual (até 277), nunca apenas um schema parcial.
2. Homologar Admin, gestor com `write`, pessoa com `read`, pessoa sem concessão, usuário sem escopo e usuário desativado.
3. Criar cenário zerado e cenário misto; montar formulários; conferir sinais, somas de contas repetidas entre formulários, snapshots e relatórios existentes.
4. Testar conflito com dois navegadores, conexão interrompida, recuperação de rascunho e bloqueio durante o preenchimento.
5. Medir grade, lote de 5.000 células e projeção com mais de 100 mil valores; conferir limites/timeout do Supabase real e custo da auditoria/triggers. O PostgreSQL isolado não substitui esse benchmark.
6. Homologar importações existentes, favoritos, perfis, DRE/OPEX/Cockpit, exportação e os dois temas. Só depois publicar assets e confirmar a atualização de cache.

Testes locais:

```powershell
node tests/planningCore.test.js
# Biblioteca PGlite instalada separadamente, sem incluir dependência no app web:
$env:PLANNING_PGLITE_TEST_LIB = 'caminho/para/@electric-sql/pglite'
node tests/planning.sql.test.js
node tests/planning.browser.test.js
node tests/planningCapex.browser.test.js
node tests/scenarioSources.test.js
node tests/budgetScenarioTarget.test.js
node tests/reportsSources.test.js
node tests/comercialScenarioSource.test.js
```

O teste de navegador abre um perfil isolado do Edge, carrega os módulos reais e usa RPCs simuladas em memória; ele não acessa o Supabase. O teste SQL usa PostgreSQL WASM real e verifica as funções/policies da migration.

### CAPEX (migration 290)

Aplicar `290_planning_capex.sql` antes de publicar os assets do CAPEX. A migration cria um formulário **CPX**, em construção e sem acessos atribuídos, em cada cenário participativo existente. Novos cenários também recebem o CPX; os demais formulários continuam a numeração independente. Se já existir um formulário OPEX com código CPX, renomeá-lo antes da migration.

No modo gerenciar, o administrador cadastra tipos e taxas em **Parâmetros CAPEX**, libera o CPX em **Configuração** e atribui a matriz de **Acessos**. O cartão Capex é apenas visual; o relatório consolidado ainda não foi criado. O formulário é aberto pela lista e não exibe a faixa de alterações não integradas, conforme o mockup aprovado.

Os investimentos pertencem ao CC. Um único CC permite edição; vários mostram os itens em leitura. Nome e tipo são salvos ao alterar; os valores mensais usam **Salvar valores**, com rascunho local e controle de versão por célula. Zero limpa o valor; negativos são recusados. Duplicação e exclusão são independentes da estrutura OPEX. Tipos desativados continuam nos itens existentes e no cálculo, mas impedem novas gravações nesses itens até escolher um tipo ativo.

O rodapé é calculado no servidor, inclusive para prévias de valores ainda não salvos. A exportação considera os valores salvos e os CCs selecionados. Nenhuma taxa é devolvida a usuários que não sejam administradores, nem há acesso direto às tabelas CAPEX via Data API. Auditoria de tipos, itens e valores fica no histórico administrativo.

A depreciação começa no mês seguinte, considera apenas lançamentos e destinos com fonte formulário e é arredondada após agrupar por CC, conta e mês. A integração do CAPEX processa todos os CCs e preserva o OPEX; a integração do OPEX preserva o CAPEX. Erros na publicação mantêm o ledger anterior e registram a tentativa em `planning_runs`. Itens incompletos ignorados são informados no retorno e no histórico. O investimento em si não é publicado no DRE nem no fluxo de caixa.

Parâmetros são copiados da base explícita ou do cenário participativo anterior; o primeiro começa vazio. A cópia do CPX remapeia os tipos, copia itens e acessos e respeita a escolha de copiar valores. Nenhum saldo de depreciação é transportado entre exercícios nesta versão.

## FAT: projeção de vendas (migrations 316 a 319)

Formulário `FAT` (`form_type = 'fat'`), um por cenário participativo, no bloco abaixo dos OPEX e do CPX. Spec: `docs/superpowers/specs/2026-10-28-fat-projecao-vendas-design.md`.

**Ordem de aplicação (antes de publicar os assets):** `316` (tipo, tabelas privadas, regiões, modelos), `317` (premissas), `318` (cálculo, leitura/escrita, sobreposição, integração, meta) e `319` (botão único de integração, contexto, clonagem e criação). Cenários existentes ganham o FAT em rascunho, sem acessos. A migration não é aplicada pelo aplicativo.

- **Lançamento:** só o volume, por região (território da tabela de Atribuições; Peças é a região sem território). Filtrar uma região mostra o formulário inteiro. Peças digita o FAT (bruto, com IPI), com VOL = 1; Exportação não tem imposto (FAT = RL, conta 31101002).
- **Premissas:** FAT/un e MP/un da média ponderada dos 2 últimos meses fechados com venda do modelo no território (recua até achar 2; sem venda, média Marcher). Congeladas ao liberar; **Atualizar premissas** e os ajustes do admin ficam registrados, e o ajuste sobrevive à atualização.
- **Cálculo:** `FAT = VOL × FAT/un`, impostos = FAT × percentual (IPI, ICMS, PIS e COFINS por linha Máquinas, Transgrain e Peças, na aba Configuração), `RL = FAT − impostos`, `MP = VOL × MP/un`. Sem CBS.
- **Integração:** conta × mês, sem centro de custo, receita negativa e impostos e MP positivos, histórico `FAT: FAT`. Apaga e regrava só as linhas do FAT; o OPEX e o CPX preservam as suas. O DRE soma FAT + formulário 08 (e demais OPEX) por conta. Ao **Integrar**, se o FAT e um OPEX liberado têm valor na mesma conta e mês, abre uma confirmação (não bloqueia). `planning_integrate_all` integra OPEX, CAPEX e FAT.
- **Meta comercial:** a integração grava `planning_fat_meta` (modelo × território × coordenação × mês). A leitura pelo Painel de Vendas é um plano à parte.
- **Segurança:** as tabelas `planning_fat_*` não têm acesso direto (RLS e `revoke`); tudo passa por `planning_fat_read`, `planning_fat_write`, `planning_fat_overlap` e `planning_integrate_all`. `planning_write` passou a ser um envoltório (ver a referência) e recusa operações estruturais sobre o FAT.
- **Testes:** `node tests/planningFatCore.test.js`; `node tests/planningFat.sql.test.js` (PGlite, como os demais testes SQL); `node tests/planningFat.browser.test.js`.

## Limites desta entrega

Sem alterações de RH por posição, Comercial, Fluxo de Caixa, aprovações, variáveis ou novas funções de fórmula. A atualização entre colegas aparece ao reler/salvar; o Realtime não foi acrescentado. Alertas por notificação/e-mail não foram ligados à integração. O desempenho no Supabase e o piloto OPEX dependem de homologação.

Nos meses copiados, a referência exibida nas linhas é o saldo contábil da conta/CC; não é um rateio por formulário. Não somar referências de formulários distintos como se fossem contribuições independentes. A projeção não usa essas referências, preservando a base copiada uma única vez.

## Fórmulas por sequência — migration 279

Aplicar `279_planning_formula_sequencia.sql` antes de publicar o frontend correspondente. O cadastro deixa de pedir referência: fórmulas usam `<1> + <2>` com a sequência de linhas Digitado/Fórmula. A migration converte expressões antigas em uma única passagem, sincroniza a referência interna com a sequência e incrementa revisões para invalidar grades/rascunhos anteriores. A coluna interna permanece por compatibilidade com as RPCs da 278. A sequência continua protegida após salvar valores.

A conta DRE aparece antes da descrição; sua seleção sugere o nome da conta sem sobrescrever uma descrição personalizada.

## Simplificação do wizard e ícone — migration 280

O wizard passa a seis etapas: Identidade, Ponto de partida, Fontes dos meses, Valores iniciais, Liberação e Revisão. Formulários e acessos são configurados dentro do cenário. Uma base copia suas estruturas, com escolha de copiar/zerar valores e liberar/manter em construção; não copia acessos automaticamente. A revisão explicita os formulários copiados. Sem base, o cenário começa sem formulários.

A identidade oferece os 12 ícones já usados pelo Vecton. Aplicar `280_planning_scenario_icon.sql` para persistir o ícone escolhido na criação. A exclusão de cenário usa `VECTON_DIALOGS.appConfirm` com o tipo `danger` e exibe falhas pelo diálogo padrão.

## Proteção de perfis — migration 281

`281_guard_user_profiles.sql` cria o trigger `planning_guard_profile` (antes parte da 278). Pessoa comum só altera, na própria linha, `full_name`, `email`, `phone`, `department`, `profile_label`, `photo_kind`, `photo_value`, `appearance` e `updated_at`. Admin, super_admin e chamadas sem usuário (service role) não são afetados.

O upsert do diálogo de perfil (`syncUserProfile`) dispara o BEFORE INSERT mesmo quando a linha já existe; por isso o INSERT só é liberado para a própria linha já existente (vira UPDATE e é conferido). Criar perfil novo segue exclusivo do administrador. Antes do ajuste, `email` e `profile_label` estavam fora da lista e o upsert falharia para não-admins.

Homologar com usuário não-admin: salvar o perfil, trocar aparência, e o fluxo de cadastro/convite (se o primeiro acesso criar o perfil pelo cliente, e não por admin ou edge function, será recusado). A 281 pode ser aplicada antes ou depois da 278.

## Regras da integração e da estrela — migration 282

`282_planning_regras_integracao_estrela.sql` redefine `planning_write` a partir da versão da 280 (requer 278, 279 e 280):

- A integração no DRE publica apenas formulários **liberados**. Formulário em construção não entra, e ao voltar para construção seus valores saem do DRE na próxima integração.
- A estrela (favorito) pode ser marcada também em cenário **bloqueado**, pois é global e não altera o conteúdo.

Na tela de estrutura do formulário, contas que também aparecem em outros formulários do mesmo cenário geram um aviso (os valores se somam no DRE). O aviso não bloqueia.

## Salvamento em lote — migration 283

`283_planning_save_entries_em_lote.sql` redefine `planning_write` (requer 278 a 282) trocando o laço de `save_entries`, que fazia várias consultas por célula, por validação, detecção de conflito e gravação em comandos únicos. Contrato, mensagens e regras de conflito/escopo não mudam. No PostgreSQL isolado (PGlite), 1.200 células caíram de 303 ms para 123 ms na inclusão e de 355 ms para 66 ms na atualização. O benchmark em Supabase real continua necessário. O trigger de auditoria por linha permanece.

Medição opcional: `PLANNING_BENCH=1 node tests/planning.sql.test.js` (e `PLANNING_SKIP_283=1` para comparar com a versão anterior).

## Renumeração de fórmulas — migration 284

`284_planning_renumera_formulas.sql` redefine `planning_write` (requer 278 a 283). Ao mudar a sequência de uma linha (possível apenas enquanto o formulário não tem valores salvos), as fórmulas das outras linhas que referenciam a sequência anterior (`<1>` etc.) são reescritas para a nova, na mesma transação. A sequência nova precisa estar livre; para trocar duas linhas, passe por um número livre. Sequência já usada devolve "A sequência N já está em uso por outra linha". O diálogo da linha aplica a mesma renumeração antes de validar, e `planningCore.renumberReferences` espelha a regra do banco.

## Referência da `planning_write`

A função `planning_write` é recriada nas migrations 278, 280, 282, 283 e 284; só a última vale no banco. A versão vigente fica em `supabase/_referencia/planning_write_atual.sql` (não é migration e não deve ser executada como tal). Para alterá-la, parta desse arquivo, crie uma migration nova com o resultado e atualize a referência junto.

### Importação de formulários (migration 332)

Aplicar `332_planning_importacao.sql` antes de publicar os arquivos do front (depende das migrations 278–331). A migration renomeia e reembrulha `planning_write`, `planning_integrate_all`, `planning_fat_write` e `planning_capex_write` (padrão da `319`); não aplicar em partes.

O administrador importa um Excel por formulário pelo botão **Importar** da lista (modo de edição). Detalhes de regra, chave, prevalência do FAT/CPX, alertas e validação: README, seção "Importação de formulários do cenário", e `docs/superpowers/specs/2026-10-30-importacao-formularios-planejado-design.md`.

Testes: `node tests/planningImport.sql.test.js` (PGlite), `node tests/planning.browser.test.js` e `node tests/planningImport.browser.test.js` (Edge; com `PLANNING_EXCELJS_LIB` apontando para o ExcelJS, os testes também leem planilhas reais).
