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

A migration protege também campos administrativos de `user_profiles`: um usuário não pode promover a si próprio nem ampliar suas concessões usando a policy antiga de escrita do próprio perfil. Preferências de aparência, foto e dados pessoais permitidos continuam editáveis. Homologar o fluxo de cadastro/convite junto dessa proteção.

## Frontend

`src/modules/planning/planningCore.js` implementa parser aritmético sem `eval`/`new Function`, dependências/ciclos, validação numérica e distribuição em centavos.

`planningModule.js` contém o wizard e o workspace, sem dados demonstrativos. `planning.css` usa os tokens do Vecton nos dois temas. `forecastModule.js` integra o novo fluxo preservando os relatórios e cenários antigos. A ausência de `planning_context` mantém a criação antiga disponível até aplicar a migration.

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
node tests/scenarioSources.test.js
node tests/budgetScenarioTarget.test.js
node tests/reportsSources.test.js
node tests/comercialScenarioSource.test.js
```

O teste de navegador abre um perfil isolado do Edge, carrega os módulos reais e usa RPCs simuladas em memória; ele não acessa o Supabase. O teste SQL usa PostgreSQL WASM real e verifica as funções/policies da migration.

## Limites desta entrega

Sem alterações de RH por posição, Comercial, Fluxo de Caixa, aprovações, variáveis ou novas funções de fórmula. A atualização entre colegas aparece ao reler/salvar; o Realtime não foi acrescentado. Alertas por notificação/e-mail não foram ligados à integração. O desempenho no Supabase e o piloto OPEX dependem de homologação.

Nos meses copiados, a referência exibida nas linhas é o saldo contábil da conta/CC; não é um rateio por formulário. Não somar referências de formulários distintos como se fossem contribuições independentes. A projeção não usa essas referências, preservando a base copiada uma única vez.

## Fórmulas por sequência — migration 279

Aplicar `279_planning_formula_sequencia.sql` antes de publicar o frontend correspondente. O cadastro deixa de pedir referência: fórmulas usam `<1> + <2>` com a sequência de linhas Digitado/Fórmula. A migration converte expressões antigas em uma única passagem, sincroniza a referência interna com a sequência e incrementa revisões para invalidar grades/rascunhos anteriores. A coluna interna permanece por compatibilidade com as RPCs da 278. A sequência continua protegida após salvar valores.

A conta DRE aparece antes da descrição; sua seleção sugere o nome da conta sem sobrescrever uma descrição personalizada.

## Simplificação do wizard e ícone — migration 280

O wizard passa a seis etapas: Identidade, Ponto de partida, Fontes dos meses, Valores iniciais, Liberação e Revisão. Formulários e acessos são configurados dentro do cenário. Uma base copia suas estruturas, com escolha de copiar/zerar valores e liberar/manter em construção; não copia acessos automaticamente. A revisão explicita os formulários copiados. Sem base, o cenário começa sem formulários.

A identidade oferece os 12 ícones já usados pelo Vecton. Aplicar `280_planning_scenario_icon.sql` para persistir o ícone escolhido na criação. A exclusão de cenário usa `VECTON_DIALOGS.appConfirm` com o tipo `danger` e exibe falhas pelo diálogo padrão.
