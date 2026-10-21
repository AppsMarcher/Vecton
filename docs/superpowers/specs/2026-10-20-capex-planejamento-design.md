# CAPEX no Planejamento — Especificação de desenho

Data: 2026-10-20 · Status: rascunho para revisão · Escopo: módulo Planejamento (cenários participativos)

## 1. Objetivo

Reunir o CAPEX planejado por cada gestor, para dimensionar o investimento, e calcular a
depreciação e a amortização **incrementais** decorrentes dele, integrando esse cálculo ao DRE do
cenário.

Fora do escopo desta versão:

- fluxo de caixa (o CAPEX não alimenta a linha de Investimentos);
- saldo inicial de depreciação (será ligado depois, por outro caminho);
- comparação entre CAPEX projetado e realizado (a grade foi pensada para isso, mas o realizado fica para depois);
- obra em andamento (bem que só deprecia ao entrar em operação).

## 2. Como o Planejamento funciona hoje (base de partida)

- O cenário (`forecast_scenarios`, `planning_version = 1`) tem 12 meses, cada um com uma fonte: formulário, Real ou outro cenário (`planning_scenario_months`).
- Cada formulário (`planning_forms`) tem linhas por conta DRE (`planning_form_lines`) e valores por linha × centro de custo × mês (`planning_entries`).
- O acesso é a combinação de `planning_cc_scope` (gerência, CCs extras do perfil) e `planning_form_access` (leitura ou escrita por usuário). O administrador tem acesso total.
- **Integrar no DRE** (`planning_write`, ação `project`) apaga do ledger do cenário as linhas originadas de formulários e as regrava, apenas de formulários liberados. O DRE lê o ledger por conta.
- A depreciação e a amortização do DRE estão nas contas `4110220601`, `4110220602` (produção) e `42301001`, `42301002` (administrativas). Hoje são digitadas no formulário 04.

## 3. Decisões

1. O CAPEX é um **tipo de formulário** do cenário. Reaproveita liberação, acessos, bloqueio, revisão, auditoria e controle de conflito.
2. O CAPEX é **autônomo**: não depende do formulário 04 e não escreve nele. O total de depreciação e amortização do cenário é o formulário 04 (manual) somado ao rodapé do CAPEX, e o DRE já soma os dois por serem as mesmas contas.
3. Os **parâmetros** (tipos de imobilizado e taxas) são **por cenário**.
4. A depreciação começa sempre no **mês seguinte** ao do lançamento.
5. O destino da depreciação vem do **tipo do centro de custo** (`cost_centers.cost_center_type`), sem escolha do usuário.
6. Quem tem escrita no formulário (matriz de acessos) pode integrar, seja gestor, analista ou administrador.
7. O rodapé de depreciação é visível a todos que abrem o formulário e é somente leitura para todos.

## 4. Parâmetros CAPEX (por cenário)

Nova aba **Parâmetros CAPEX**, ao lado de "Ver DRE", visível só para administrador.

Cadastro de **tipos de imobilizado**:

| Campo | Regra |
|---|---|
| Nome | Obrigatório, único dentro do cenário (ex.: Móveis e utensílios, Veículos, Prédios) |
| Taxa anual (%) | Obrigatória, maior que 0 e até 100 |
| Vida útil | Calculada (100 ÷ taxa), só leitura |
| Natureza | Depreciação ou Amortização (define a conta de destino) |
| Ativo | Tipo desativado não aparece no formulário, mas continua nos itens já lançados |

Regras:

- Cenário novo ou copiado herda os tipos do cenário anterior (ou do cenário-fonte escolhido). O primeiro cenário começa **vazio**; a contabilidade cadastra os tipos e as taxas. Nenhuma taxa é carregada por padrão.
- Tipo em uso por algum item só pode ser desativado, nunca apagado.
- A taxa só pode ser alterada enquanto o cenário estiver aberto; o cenário bloqueado trava os parâmetros.
- A taxa **nunca** é enviada ao navegador de quem não é administrador. O formulário recebe apenas o id e o nome do tipo.
- A aba exibe, em leitura, o quadro de destino das contas (item 6).

## 5. Formulário CAPEX

### 5.1 Cabeçalho

Igual ao do OPEX: título do cenário, selo Aberto/Bloqueado, **Integrar no DRE**, **Exportar Excel**, número e nome do formulário, selo Liberado e a caixa de seleção de centros de custo.

- Para digitar, exatamente **um** CC marcado. Com vários marcados, a grade mostra a união dos itens e a soma dos valores, em leitura (mesma regra do OPEX).
- Faixa de aviso **"Há alterações não integradas"** quando houver alteração nas entradas ou regras do CAPEX desde a última integração bem-sucedida: criação, duplicação, edição ou exclusão de itens e valores; troca do tipo de imobilizado; alteração de taxa, natureza ou ativação dos tipos utilizados; mudança das fontes dos meses; ou mudança do tipo de um CC com itens. A verificação abrange todos os CCs do formulário, como a integração, sem expor dados fora do escopo do usuário.
- O controle compara a revisão das entradas e dependências atuais com a revisão efetivamente processada pela última integração bem-sucedida. Exclusões também avançam a revisão. Uma integração com erro não limpa o aviso; alterações salvas durante uma integração permanecem pendentes se não fizerem parte da revisão processada. Antes da primeira integração, havendo itens salvos, o aviso também aparece.

### 5.2 Grade de itens

| Coluna | Comportamento |
|---|---|
| Investimento | Texto livre obrigatório. Largura igual à coluna de descrição das contas no OPEX |
| Tipo de imobilizado | Seletor por linha, com os tipos ativos do cenário. Obrigatório |
| Jan a Dez | Valor em R$, livre: tudo num mês, ou distribuído |
| Total | Soma dos 12 meses, só leitura |

- O item pertence ao centro de custo marcado no momento em que é criado. Um investimento dividido entre dois CCs vira dois itens.
- Só aceitam digitação os meses cuja fonte é **formulário**. Os demais aparecem bloqueados.
- Valores positivos, até duas casas decimais. Sem estorno.
- Ações por linha: duplicar e excluir (com confirmação). Diferente do OPEX, a estrutura não trava quando há valores.
- Colar do Excel, repetir até dezembro e distribuir entre os meses reaproveitam o comportamento do OPEX.
- Gravação em lote com controle de versão por célula e por revisão do formulário. Conflito pede reabrir o formulário.
- Cenário bloqueado (ou `lock_at` vencido) impede qualquer edição.
- Colunas de texto ordenáveis, no padrão do app.
- Não há coluna de taxa, de descrição ou de depreciação na grade.

### 5.3 Rodapé fixo (somente leitura, visível a todos)

Calculado a partir dos itens do(s) CC(s) marcado(s), com 12 meses e total:

- **Produção:** Depreciação (`4110220601`), Amortização (`4110220602`), Subtotal produção.
- **Administrativo:** Depreciação (`42301001`), Amortização (`42301002`), Subtotal administrativo.
- **Total depreciação e amortização do CAPEX.**

### 5.4 Exportar Excel

Leva a grade de itens e o rodapé, para os CCs marcados.

## 6. Regra de cálculo

Para cada item, com taxa anual `t` do tipo e valor `v(k)` lançado no mês `k`:

`dep(item, mês m) = ( Σ v(k) para k < m ) × t ÷ 12`

- Mês seguinte: um item lançado em março deprecia de abril a dezembro; um item lançado em dezembro não gera nada no exercício.
- A projeção se aplica aos meses de planejamento de Budget ou Forecast cuja fonte é **formulário**, tanto para os lançamentos considerados quanto para os meses de destino da depreciação. Nunca acrescenta projeção sobre meses com histórico de realizados ou valores provenientes de outro cenário. Rodapé e integração no DRE seguem esse mesmo recorte; os valores já integrados pelo próprio CAPEX são substituídos na reintegração.
- A natureza do tipo decide entre depreciação e amortização. O tipo do centro de custo decide entre produção (MOD, MOI) e administrativa (ADM, COM, ENG).
- Resultado agrupado por centro de custo, conta e mês, arredondado a duas casas.
- O cálculo considera o cenário de um único exercício. Não há continuidade para o ano seguinte nesta versão.

## 7. Integrar no DRE (CAPEX)

1. Disponível a quem tem escrita no formulário (`planning_form_mode = 'write'`), e só com o formulário **liberado**.
2. Calcula a depreciação e a amortização de **todos** os itens salvos do formulário, de todos os CCs, não só dos do usuário que clicou (mesmo alcance do Integrar do OPEX).
3. Apaga do ledger do cenário **apenas as linhas originadas pelo CAPEX** e regrava as novas, com a conta, o centro de custo, o mês e a marca de origem do CAPEX. O valor do investimento em si não vai ao DRE.
4. Registra a execução em `planning_runs`. Para o usuário, o retorno mostra "ok" ou "erro" e a quantidade de linhas; o histórico fica em "Integrações no DRE".
5. **Isolamento:** o Integrar do OPEX passa a apagar e regravar apenas as linhas de formulários de OPEX. Hoje ele apaga todas as linhas do cenário originadas de formulários, o que removeria a depreciação do CAPEX. Corrigir isso é requisito da implementação.
6. O formulário 04 não é lido nem escrito pelo CAPEX.

## 8. Permissões

| Ação | Quem |
|---|---|
| Ver e editar os parâmetros | Administrador |
| Abrir o formulário e ver o rodapé | Quem tem acesso (leitura ou escrita) ao formulário, pelos CCs do perfil |
| Lançar itens | Escrita no formulário, no CC marcado e dentro do escopo do perfil |
| Integrar no DRE | Escrita no formulário |
| Taxas | Nunca vão para o navegador de quem não é administrador |

O acesso por CC reutiliza o `planning_cc_scope`: o gestor só vê e lança nos centros de custo do seu perfil. Os itens pertencem ao centro de custo, não ao usuário, para não ficarem órfãos.

## 9. Casos de borda

- **CC muda de tipo** no cadastro: vale o tipo vigente na hora da integração. Cenário bloqueado não é reintegrado.
- **Tipo desativado ou taxa alterada** com itens lançados: permitido com o cenário aberto; o próximo Integrar recalcula.
- **Item sem tipo, sem CC ou com tipo inativo:** não grava e aponta o item. O Integrar ignora itens incompletos e avisa.
- **Mês deixa de ser "formulário"** na aba Fontes dos meses: valores desse mês saem do cálculo, e o aviso de alterações não integradas indica a divergência.
- **CC inativo:** itens existentes continuam; não é possível criar novos nele.
- **Copiar cenário:** copia os parâmetros e, conforme o assistente já oferece, os formulários e acessos; os valores seguem a opção de copiar valores.
- **Excluir cenário:** remove itens, parâmetros e linhas do ledger do CAPEX.

## 10. Auditoria

Alterações de itens, valores e parâmetros registradas como nas demais tabelas do Planejamento (autor, data, valor antigo e novo). O Integrar registra execução em `planning_runs` e em `planning_audit_log`.

## 11. Pendências para a fase de planejamento

- Confirmar quais relatórios por centro de custo podem exibir ao gestor a linha de depreciação gravada com o CC do CAPEX, e se isso é aceitável.
- Cadastrar os tipos e taxas do Budget 2027 (responsabilidade da contabilidade).
- Definir, junto com a ligação do saldo inicial, como será feita a continuidade entre exercícios.
- Planejar a comparação CAPEX projetado × realizado.
