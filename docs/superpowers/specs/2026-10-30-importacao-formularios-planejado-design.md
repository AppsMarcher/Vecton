# Importação de Planejado nos formulários (01 a 09)

Status: rascunho para análise. Nada desta spec foi implementado além da interface do botão Importar (commit `74a512b`) e do template.

## Objetivo

Preencher os formulários de lançamento (01 a 09) de um cenário a partir de um Excel, em vez de digitar na grade. O formato e as regras seguem a carga do DRE realizado.

## Interface (já existe)

- Botão **Importar** em cada formulário da lista do cenário, visível só no modo de edição do cenário.
- O clique abre um popover centralizado com: Baixar template, Selecionar arquivo, Enviar arquivo e um painel de status.
- Hoje o envio só lê o arquivo e confere o cabeçalho. Não valida nem grava.

## Quem importa

Só o **administrador** importa em lote. O botão Importar já aparece apenas no modo de edição do cenário (o mesmo do Configurar), que só o administrador tem. O servidor deve validar a mesma regra, sem depender do botão.

O lançamento **sem centro de custo** também é visto e editado só pelo administrador. Os demais perfis continuam vendo apenas os centros de custo do seu escopo.

**Grade:** para o administrador, desmarcar todos os centros de custo no seletor (toggle) mostra e edita o lançamento sem centro de custo.

**Integração com o DRE:** os valores sem centro de custo são gravados no razão sem centro de custo, como o FAT já faz.

**Controle de versão:** a importação do administrador **sempre substitui**, sem checar a versão da célula; cada valor importado sobe a versão. Quem estava com a grade aberta e salva depois recebe o aviso de conflito do padrão atual. A digitação na grade segue o padrão (conflito rejeita o lote). A chave com centro de custo vazio entra nesse mesmo controle.

## Template (formulários 01 a 09)

Uma linha por lançamento.

| Coluna | Obrigatória | Observação |
|---|---|---|
| Conta | sim | número da conta |
| Mês | sim | número de 1 a 12 |
| Valor | sim | |
| Centro de custo | **não** | número do centro de custo |

O ano não entra no arquivo: é sempre o do cenário. O formulário é o da linha em que se clicou em Importar.

## Regras de carga

1. **Chave do lançamento:** conta + centro de custo + mês. Com o centro de custo vazio, a chave é conta + mês.
2. **Chave já existente:** o valor do arquivo substitui o valor digitado.
3. **Chave nova:** o valor é incluído (a carga complementa).
4. **O que o arquivo não cita** permanece como está. A carga nunca apaga.

## Centro de custo opcional (decisão)

A carga do DRE realizado já não obriga centro de custo (só valida o cadastro quando ele vem preenchido). O sistema não deve obrigá-lo no planejamento.

A única trava hoje é `planning_entries.cost_center_id`, obrigatório e parte da chave primária (migration `278`, linha 66). A mudança prevista:

- `cost_center_id` passa a aceitar vazio.
- A chave passa a ser linha + centro de custo (ou vazio) + mês.
- O formulário aceita lançamento sem centro de custo, e a carga e a digitação usam a mesma chave.

## Formulário 08 (Faturamento | Impostos | Matéria-prima) e o FAT

Hoje o FAT não grava no formulário 08: ele escreve direto no razão do DRE, sem centro de custo, nas contas de faturamento (31101001/002/006/007), impostos (31203001/002/004/005) e matéria-prima (412010901). O 08 tem linhas digitáveis nessas mesmas contas e, hoje, os dois valores **se somam** no DRE.

Decisões:

1. **Sinal sem conversão.** O valor é lançado como o razão guarda, na grade e no arquivo: faturamento negativo; impostos e matéria-prima positivos. Nenhum sinal é invertido na carga ou na digitação.
2. **Mesma regra dos demais formulários.** Vale um valor só por chave (conta + centro de custo + mês); não há soma. O FAT grava sem centro de custo, então o conflito ocorre quando o template do 08 também vem sem centro de custo na mesma conta e mês. Com centro de custo, as linhas coexistem. Isso substitui o comportamento atual de somar.
3. **O FAT prevalece.** Na chave coincidente, vale o valor do FAT. O usuário é avisado por um popover de alerta.

## Formulário 04 (Depreciação | Amortização) e o CPX

Mesma situação do 08 com o FAT. O CPX (CAPEX) não grava no formulário 04: ele escreve direto no razão do DRE as contas de depreciação e amortização definidas nos tipos de imobilizado, e o 04 tem linhas digitáveis nessas contas. Hoje os valores se somam.

Diferença para o FAT: o CPX grava **com centro de custo** (o do investimento, só dos tipos MOD, MOI, ADM, COM e ENG). O conflito acontece quando o 04 tem valor na mesma conta, no mesmo centro de custo e no mesmo mês. Lançamento do 04 sem centro de custo nunca conflita com o CPX.

Decisão: vale a mesma regra do 08. Um valor só por chave (conta + centro de custo + mês), sem soma; **o CPX prevalece**, com popover de alerta. Sinal sem conversão, como nos demais.

## Alertas de conflito (08 e 04)

Valem para o FAT sobre o 08 e para o CPX sobre o 04. São três alertas:

1. **Ao integrar o FAT ou o CPX:** popover de alerta quando a chave coincide com valor já lançado no 08 ou no 04 (hoje existe só este, como aviso que não bloqueia).
2. **Ao importar o template no 08 ou no 04:** popover de alerta quando uma linha tem a chave do FAT ou do CPX.
3. **Ao digitar na grade do 08 ou do 04:** quando a chave digitada coincide com a do FAT ou do CPX, o alerta **bloqueia o salvamento** dessa célula (o servidor também recusa).

Linha do template em conflito: **é recusada** e fica registrada no log da importação (painel de status) para ser corrigida. Não fica salva.

## Validação do arquivo (padrão da carga do DRE realizado)

- **Qualquer erro bloqueia o arquivo inteiro.** Nada é importado enquanto houver linha com erro, como no DRE realizado. Isso inclui a linha recusada por conflito com o FAT/CPX.
- O painel de status lista os erros com **aviso amigável**: número da linha do arquivo, o que está errado e como corrigir.
- Verificações, nos mesmos termos da carga do realizado: conta obrigatória e cadastrada, valor obrigatório e numérico, centro de custo (se vier) cadastrado. Para o planejamento acrescentam-se: mês de 1 a 12 e conta que seja linha digitável do formulário.
- **Formato do número:** o mesmo da carga do realizado (`parseLocalizedAmount`, `src/core/utils.js`): número do Excel como está; texto com ponto de milhar e vírgula decimal (1.234,56).

## Painel de Vendas

Decisão: o Painel de Vendas (meta por modelo e região) continua alimentado **só pelo FAT**. O template do 08 não traz modelo nem região e serve para ajustes no DRE; faturamento que entra por ele pode divergir do Painel.

## Centros de custo no arquivo

Qualquer centro de custo cadastrado é aceito, em qualquer formulário (01 a 09), como na carga do DRE realizado. Só o administrador importa, então não há restrição por escopo.

## FAT (Vendas · Projeção de Faturamento)

Decisão: o template da carga de planejado vendas (`templates/modelo-carga-vendas-planejado.xlsx`: mês, cod_produto, cod_territorio, quantidade, valor, MC1%) **sai da carga de planejado vendas e passa a ser o do botão Importar do FAT**, no cenário. O arquivo vai para o formulário FAT.

- **Regra da carga:** a mesma de hoje. **Volume é obrigatório**; em **Peças**, o valor em R$ é obrigatório. O restante (valor e MC1% dos demais) é opcional e, quando vazio, assume o que está no formulário FAT (premissas e impostos do cenário).
- **Destino:** volumes do formulário FAT. A meta do Painel de Vendas segue atualizada pela integração do FAT.
- **Validação e acesso:** o padrão desta spec (qualquer erro bloqueia o arquivo inteiro; só o administrador importa).
- **Carga de planejado vendas:** deixa de aceitar cenários com formulários e passa a listar só cenários sem formulário, como a carga do DRE (`!planning_version && kind !== 'built'`). O link do template sai de lá.

## Carga de planejado vendas (cenários sem formulário)

O formato continua sendo o da carga de planejado atual (`templates/modelo-carga-vendas-planejado.xlsx`, aba "Meta Vendas"), sem trazer o formato da carga de realizado vendas.

Nesta carga, **todos os campos são obrigatórios**: `cod_produto`, `territorio`, `mes`, `quantidade` e `valor`. Não há formulário FAT no cenário para preencher o que faltar, então não se assume premissa: o MC1% sai do arquivo. Isso muda as regras de hoje, em que mês, território, valor e MC1% podem ficar em branco.

Exceção: o **território não é obrigatório para Peças** (meta nacional, da coordenação Peças). Para Transgrain e Acessórios o território passa a ser obrigatório.

Já o import do **FAT** no formulário mantém a regra atual do template (volume obrigatório, valor obrigatório só em Peças, o resto assumindo o formulário).

## CPX (CAPEX)

Por enquanto **não há template de importação para o CPX**. O botão Importar continua visível na linha do CPX, **sem nenhuma ação**. O CPX lança investimentos (a depreciação é calculada), então um template de investimentos fica para uma etapa futura. O código atual, que abre o popover com um template provisório no CPX, deve ser ajustado na implementação.

## Em análise (ainda sem decisão)

- Teste, migration e publicação.
