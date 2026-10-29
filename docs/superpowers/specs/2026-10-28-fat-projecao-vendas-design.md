# FAT, projeção de vendas no Planejamento — Especificação de desenho

Data: 2026-10-28 · Status: rascunho para revisão · Escopo: módulo Planejamento (cenários participativos), Budget 2027
Mockup de referência: `artifacts/mockups/vecton-planejamento-fat.html`

## 1. Objetivo

Reunir a projeção de vendas por quem vende, digitando só o **volume**, e derivar FAT, impostos, RL, MP e MC1%. O resultado:

1. aparece no formato do Evolutivo de Margens, por região, coordenação e Marcher;
2. soma no DRE do cenário com o que já vem do formulário 08;
3. fica gravado como meta do cenário para o Painel de Vendas comparar com o realizado.

Fora do escopo desta versão:

- Serviços prestados, ISS e Custeio absorção (sem projeção; o 08 continua cobrindo);
- Acessórios;
- saldo e continuidade entre exercícios;
- alteração da exigência de centro de custo na carga do DRE (ideia à parte, §14).

## 2. Base de partida

- Cenário participativo (`planning_version = 1`), 12 meses, cada um com fonte formulário, Real ou outro cenário. Só meses com fonte **formulário** recebem digitação e entram na integração.
- Formulários existentes: OPEX numerados (`form_type = 'opex'`) e CPX (`'capex'`). O CAPEX é o precedente: formulário de tipo próprio, grade própria, integração que apaga e regrava só as suas linhas.
- O formulário 08 (OPEX), "Faturamento | Impostos | Matéria-prima", já existe no Budget 2027 com 15 linhas e valores digitados nas contas de receita, imposto e MP.
- Migration necessária: `planning_forms_form_type_check` aceita hoje só `opex` e `capex`; passa a aceitar `fat`.

## 3. Decisões

1. O FAT é um **tipo de formulário** (`form_type = 'fat'`, código `FAT`). Na lista do cenário fica em bloco próprio **abaixo dos OPEX e do CPX**, sem numeração. Reaproveita liberação, bloqueio, acessos, salvamento com versão por célula e auditoria.
2. Digita-se **só o volume**. Todo o resto é calculado.
3. O DRE recebe a **soma** do FAT com o 08, por conta. Não há centro de custo.
4. O aviso de sobreposição com o 08 aparece **só ao Integrar**, sem bloquear.

## 4. Estrutura da tela

Abas: **Preenchimento**, **Configuração**, **Acessos**.

### 4.1 Visões

Toggle `Marcher | Coordenação | Região`:

- **Região** é o único modo editável e é o **território** (UF) do cadastro de **Atribuições** (Parâmetros → Comercial, tabela `comercial_atribuicao_responsavel`), por exemplo `BA`. Ao filtrar uma região, a tela mostra o **formulário inteiro**: máquinas (Grãos e Pecuária), Cargograin e Transgrain. **Peças** é uma região própria (sem território) e **coincide com a coordenação Peças**. **EX** é a região da coordenação **Exportação**. A coordenação de cada modelo numa região vem da atribuição vigente (território × linha do modelo). Ao filtrar a região, a tela mostra o **responsável** vigente do Time Comercial (por exemplo `Responsável · PENINHA`); quando o responsável da linha Pecuária é outro, mostra os dois com a linha entre parênteses (`Responsável · Danilo (Grãos) · André (Pecuária)`).
- **Coordenação** e **Marcher** são somente leitura e somam as regiões. Coordenações cadastradas hoje: Comercial Administrativo, Exportação, Norte, Oeste, Peças, Pecuária e Sul.
- O totalizador no topo da grade se chama `Total <visão>` (por exemplo `Total BA - Peninha - Grãos`, `Total Sul`, `Total Marcher`).

### 4.2 Grade

- Linhas: modelos consolidados (`nome_reduzido` do produto), nos grupos **Grãos, Pecuária, Cargograin e Transgrain**, com subtotal por grupo. Cada modelo tem uma bolinha de origem da premissa: verde (histórico do local), âmbar (média Marcher), roxa (ajustada pelo admin).
- Colunas: modelo, **2025** (total do ano), **2026** (total até o último mês fechado), Jan a Dez de 2027 e **2027** (total). Linha vertical entre 2025 e 2026.
- Toggle de métrica `VOL | FAT | RL | MP | MC1%`. Só em **VOL** se digita. FAT, RL e MP mostram o valor **unitário** (total ÷ volume); sem volume aparece "–". MC1% = (RL − MP) ÷ RL.
- Totais e subtotais: valor unitário médio ponderado pelo volume. MC1% sempre calculada sobre os totais, nunca a média das MC1% das linhas.
- Formato visual igual ao Evolutivo de Margens (números inteiros com ponto de milhar, fontes de 11,5 px e 10,5 px, linhas de 34 px, cinza claro nos destaques). Sem setas de variação. Campos de digitação sem borda.
- Salvamento explícito (**Salvar valores** e **Descartar**), versão por célula, rascunho local, colar e repetir, como nos demais formulários.

### 4.3 Premissas do local

Bloco recolhível (abre recolhido) com FAT/un, RL/un, MP/un, MC1%, origem e janela de cada modelo. Visível a quem tem acesso; só o admin edita. Nas visões consolidadas as premissas aparecem em leitura como média dos locais.

### 4.4 Terceiro bloco: Faturamento | Impostos | Matéria-prima

Recolhível, somente leitura, mesmo desenho do formulário 08. Segue o toggle de visão. Colunas Jan a Dez e 2027. Ordem das linhas:

1. **FATURAMENTO**: 31101001 Máquinas nacional, 31101002 Máquinas Expo, 31101006 Peças e Acessórios, 31101007 Transgrain, 31102001 Serviços (sem projeção).
2. **IMPOSTOS SOBRE VENDAS**: 31203001 IPI, 31203002 ICMS, 31203004 COFINS, 31203005 PIS, 31203003 ISS (sem projeção).
3. **RECEITA LÍQUIDA**.
4. Linha em branco.
5. **MATÉRIA-PRIMA**: 412010901 Matéria-prima, 4110400001001 Custeio absorção (sem projeção).
6. **% MP / RL** (MP ÷ RL, mês a mês e no ano).

Valores positivos, como no OPEX. O bloco sempre fecha com a grade de cima.

### 4.5 Aba Configuração (admin)

- **Impostos de referência**: tabela com uma linha por **Máquinas**, **Transgrain** e **Peças** e quatro campos: IPI, ICMS, PIS e COFINS, em % do FAT. Sem borda nos campos, sem subtítulo.
- Padrões: Máquinas e Transgrain IPI 0, ICMS 4,10, PIS 1,00, COFINS 4,80 (nota real de máquina, que fecha em 9,9%). Peças IPI 1,92, ICMS 5,64, PIS 1,62, COFINS 7,46 (16,64%, derivado do razão real).
- Lista de modelos e grupos, regiões e regra do histórico (2 meses), conforme necessário na construção.

### 4.6 Aba Acessos

Matriz de leitura e escrita por pessoa e por **região**, como no OPEX e no CPX. Administrador vê e configura tudo.

## 5. Premissas (FAT/un e MP/un)

Para cada **região (território) × modelo**:

- **FAT/un** e **MP/un** = média ponderada pelo volume dos **2 últimos meses fechados com venda do modelo naquele território**. Se um dos meses não tiver venda, recua mês a mês até achar 2.
- Sem nenhuma venda do modelo no território: usa a **média Marcher** do modelo, calculada pela mesma regra.
- A premissa é do **território**, não da pessoa: trocar o responsável não a altera.
- **Congelada**: calculada e gravada no cenário quando o formulário é liberado. O admin pode clicar em **Atualizar premissas**, que registra quem, quando e quais meses foram usados.
- O admin pode **sobrescrever qualquer premissa**. A sobrescrita é marcada, guarda o valor original do histórico ao lado e **sobrevive** a "Atualizar premissas"; só deixa de valer se o admin a desfizer.
- A faixa "Premissas defasadas · base set/26 e ago/26" com o botão **Atualizar premissas** aparece **somente** quando já fechou um mês posterior aos usados na base. Fora disso não aparece nada.

## 6. Cálculo

Para cada modelo, região e mês de 2027:

```
FAT   = VOL × FAT/un
IMP_x = FAT × %_x                 (x = IPI, ICMS, PIS, COFINS; % da linha do modelo)
RL    = FAT − ΣIMP_x              (RL/un = FAT/un × (1 − Σ%))
MP    = VOL × MP/un
MC1%  = (RL − MP) ÷ RL
```

- Os percentuais são aplicados **direto** sobre o FAT, sem regra de 3 sobre a diferença FAT − RL. O RL do histórico **não** é usado; só FAT/un e MP/un vêm do histórico.
- Transgrain usa a sua linha de percentuais. Valor de exemplo igual ao de Máquinas, a confirmar (§14).
- Coordenação e Marcher somam as regiões. Com a coordenação Exportação (§8), a Marcher soma também a parte de Exportação.

## 7. Exceção: coordenação Peças

- Ao selecionar a coordenação **Peças**, a tela muda para uma linha só, **Peças** (grupo Linhas complementares), com campos de digitação em **FAT (R$)** mensal. O FAT é o **bruto da nota, com IPI** (igual ao `D2_VALBRUT` e ao Painel).
- **VOL = 1** em todo mês (total do ano 12). FAT, RL e MP unitários são o próprio valor do mês.
- **RL** = FAT − impostos pelos percentuais de Peças (§4.5). **MP** = FAT × MP/FAT do histórico dos 2 últimos meses fechados (hoje 36,40%).
- Referência real (razão, ago+set/26): RL/FAT 83,37%, MP/FAT 36,40%, MC1% 56,34%, FAT de Peças de R$ 300 a 370 mil por mês.
- O "1" de Peças **não entra** no volume de unidades da Marcher; só os valores em R$ somam.
- Peças é uma região própria (sem território) e coincide com a coordenação Peças: a digitação é feita nela, tanto pelo toggle Região quanto pela Coordenação.

## 8. Exceção: coordenação Exportação

- Sem impostos: **FAT = RL**. A região **EX** é a da coordenação Exportação. Toda a coordenação, inclusive o Transgrain vendido por ela, vai para a conta **31101002**.
- Na Marcher, a parte de Exportação soma separada da nacional, em conta própria e sem impostos.
- Aviso na tela: "Somente leitura · FAT = RL".

## 9. Regra fiscal de referência (como o RL se compõe)

- **Peças**: FAT (bruto, IPI por fora) − IPI − ICMS − PIS/COFINS = RL, depois − MP.
- **Demais linhas**: a mesma regra, **sem a linha de IPI**.
- Na carga real, `FAT = D2_VALBRUT`, `RL = FAT − D2_VALIPI − D2_VALICM − D2_VALIMP6 − D2_VALIMP5` e `MP = D2_CP0101 + D2_CP0401`. O razão do Vecton guarda só o total FAT − RL, sem separar os impostos.
- A carteira de pedidos é simulação e não entra na projeção.
- CBS **não** entra no formulário nem no cálculo.

## 10. Integração no DRE

Botão **Integrar no cenário** (a quem tem escrita no FAT; só com o formulário liberado):

1. Grava no ledger do cenário, **por conta × mês, sem centro de custo**, uma linha por combinação, somando todas as regiões. O histórico da linha é `FAT: FAT` e a origem é o formulário FAT. Linhas de valor zero não são gravadas.
2. Contas e sinais, como no ledger existente: receita **negativa** (31101001, 31101002, 31101006, 31101007); IPI, ICMS, COFINS e PIS **positivos** (31203001, 31203002, 31203004, 31203005); MP **positiva** (412010901).
3. **Apaga e regrava só as linhas do FAT.** A integração do OPEX já preserva linhas que não são de formulário OPEX; a do FAT preserva as do OPEX e as do CPX.
4. Só meses com fonte formulário. Mês que deixa de ser formulário sai da integração.
5. Registra a execução em `planning_runs` e em `planning_audit_log`, com sucesso ou erro e a quantidade de linhas, como no CAPEX.
6. Resultado no DRE: **08 + FAT**, somados por conta. O 08 não é lido nem alterado pelo FAT.

### 10.1 Aviso de sobreposição (opção B)

Ao clicar em **Integrar**, o sistema compara o que o FAT vai gravar com o que o 08 já tem salvo, por conta e mês. Se houver valor nos dois, abre a confirmação **"Valores também no formulário 08"**, listando as contas e os meses, com **Cancelar** e **Integrar mesmo assim**. Não bloqueia. **Salvar valores** não mostra aviso. Hoje, entre CPX e 04, só existe a soma.

## 11. Meta comercial e Painel de Vendas

Depois de integrado, o FAT também grava o planejado comercial do cenário, **no nível do modelo**, por modelo × território × coordenação × mês, com volume, FAT, RL, MP e MC1%. Não há meta por código de produto.

- O Painel de Vendas seleciona o cenário Budget 2027 no seletor de cenário e compara com o realizado, como lê hoje o planejado de carga de arquivo.
- A gravação substitui só o que veio do FAT; as metas carregadas por arquivo ficam como estão.
- Cenário sem FAT integrado continua mostrando o planejado de arquivo.
- `comercial_planejado_ledger_entries` guarda hoje por `produto_id`; o nível de modelo exige coluna ou tabela própria (§14).

## 12. Permissões

| Ação | Quem |
|---|---|
| Abrir e ver a grade, o terceiro bloco e as premissas | Quem tem acesso (leitura ou escrita) à região |
| Digitar volume (e FAT de Peças) | Escrita na região |
| Integrar no cenário | Escrita no formulário FAT |
| Configuração, ajuste de premissas, "Atualizar premissas" | Administrador |
| Bloquear o cenário | Vale a regra do Planejamento: o bloqueio vence todos os papéis, inclusive admin |

Quem tem acesso a várias regiões vê a soma delas em leitura.

## 13. Casos de borda

- **Modelo sem premissa** (nunca vendido na Marcher): a linha aparece, aceita volume e mostra valor pendente; a integração a ignora e informa quantas linhas ficaram de fora.
- **Território sem atribuição vigente**: não aparece para digitação; o admin vê o aviso.
- **Responsável sai ou muda**: o volume digitado permanece; o acesso é revogado pelo admin.
- **Mês deixa de ser "formulário"**: o volume desse mês sai da integração.
- **Conflito de edição**: o lote volta sem salvar, como nos demais formulários.
- **Copiar cenário**: copia estrutura, premissas, percentuais e acessos conforme a opção do assistente; os volumes seguem a opção de copiar valores.
- **Excluir cenário**: remove volumes, premissas, percentuais e as linhas do FAT no ledger.

## 14. Pendências

1. **Transgrain**: confirmar a regra de impostos. O mockup usa a mesma de Máquinas, com linha própria na Configuração.
2. **Cadastro de integrantes (Time Comercial)**: o responsável da Atribuição é texto livre e não tem vínculo com o cadastro de integrantes. A amarração fina entre os dois fica para depois.
3. **Nível de modelo no planejado comercial**: definir coluna ou tabela para guardar modelo no lugar de `produto_id`.
4. **Acessórios** e demais linhas complementares: ainda sem regra.
5. **Possível inconsistência na carteira de Peças** (fora da projeção): `valor = C6_VALOR` (sem IPI) e IPI subtraído no RL. Verificar com quem mantém a query.
6. **Exigência de centro de custo só nas contas do OPEX** na carga do DRE: ideia à parte (campo "exige centro de custo" no Plano de Contas DRE), hoje a carga aceita centro em branco em qualquer conta.
7. **Cenário de 2027**: se a CBS passar a existir no resultado, entra como nova coluna de percentual e nova conta; fora desta versão.
