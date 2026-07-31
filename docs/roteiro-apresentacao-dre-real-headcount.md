# Roteiro da apresentação — DRE Real e Headcount no VectonPlan

**Objetivo:** transferir a administração dos módulos de **Carga de Realizado (DRE)** e **Headcount** para
outra pessoa, explicando não só o "clique aqui", mas **por que a sistemática de agregação funciona assim** —
para que quem assumir saiba diagnosticar problemas novos, e não apenas repetir o roteiro.

**Público:** quem vai operar/administrar mensalmente (perfil admin no app).
**Duração alvo:** 45–55 min + perguntas.
**Formato sugerido:** 34 slides em 8 blocos.

---

## Estrutura macro

| Bloco | Slides | Pergunta que o bloco responde |
|---|---|---|
| 0. Abertura | 1–2 | O que eu vou administrar? |
| 1. Modelo mental | 3–6 | Como o dado vira relatório? |
| 2. Cadastros (as chaves) | 7–11 | O que precisa existir antes de qualquer carga? |
| 3. Carga do DRE Realizado | 12–18 | Como faço a carga do mês? |
| 4. Erros e correção | 19–22 | O lote deu erro. E agora? |
| 5. Carga de Headcount | 23–26 | Como faço a carga de pessoas? |
| 6. Agregação do Headcount | 27–30 | De onde saem os números do relatório? |
| 7. CC ↔ Gestão | 31–33 | Por que esse campo é o mais importante do sistema? |
| 8. Runbook e riscos | 34–37 | O que faço todo mês e o que nunca posso fazer? |

---

# BLOCO 0 — ABERTURA

### Slide 1 — Capa
- **Título:** DRE Real e Headcount — sistemática de carga e agregação
- **Subtítulo:** VectonPlan · Marcher Brasil · handover de administração
- **Visual:** logo Vecton + data.
- **Nota do apresentador:** enquadrar que a apresentação é um manual de operação, não uma demo de produto.

### Slide 2 — O que está sendo entregue
- **Mensagem-chave:** são 2 rotinas de carga que alimentam 5 relatórios e o Dashboard.
- **Conteúdo:**
  - Carga de Realizado → **DRE Societário**, **DRE Gerencial**, **DRE DFs**, **OPEX Real**, cards do Dashboard.
  - Carga de Headcount → **relatório de Headcount** (quadro e custo/colaborador) e card de pessoas do Dashboard.
  - Ambas dependem de 4 cadastros: **Empresas, Plano de Contas, Centros de Custo, Gestões**.
- **Visual:** diagrama simples de 3 colunas: Cadastros → Cargas → Relatórios.
- **Nota:** deixar claro desde já que erro de carga quase sempre é erro de cadastro.

---

# BLOCO 1 — MODELO MENTAL

### Slide 3 — A espinha dorsal (slide mais importante do deck)
- **Mensagem-chave:** o número do relatório é montado em 6 etapas; saber em qual etapa o problema está resolve 90% dos casos.
- **Conteúdo — a esteira:**
  1. **Cadastro** — define as chaves válidas (conta, CC, empresa).
  2. **Arquivo/Lote** — o extrato do ERP entra como *rascunho*, ainda não é oficial.
  3. **Validação** — o banco confere cada linha e **amarra a chave do arquivo ao ID do cadastro**.
  4. **Ledger** — só linhas válidas viram lançamento oficial (`actuals_ledger_entries`).
  5. **Resumo** — o banco pré-agrega conta × mês (`actuals_monthly_account_totals`).
  6. **Estrutura** — a árvore do Plano de Contas (e os mapas de OPEX/Gerencial) transformam contas em linhas de relatório **na hora da leitura**.
- **Visual:** esteira horizontal com 6 caixas numeradas, cores por etapa. Reaproveitar esse mesmo gráfico com destaque nos slides seguintes.

### Slide 4 — Conceito 1: o lote é um rascunho
- **Mensagem-chave:** importar ≠ publicar.
- **Conteúdo:**
  - Um arquivo vira um **lote** com status: `draft` → `error` / `ready` → `applied`.
  - Enquanto não estiver `applied`, **nada aparece em relatório nenhum**.
  - O app tenta aplicar automaticamente logo após a importação; se houver erro, o lote fica parado em `error`.
  - Lote aplicado pode ser desfeito: excluir um lote aplicado remove os lançamentos que ele gerou.
- **Visual:** máquina de estados com os 4 status.

### Slide 5 — Conceito 2: a estrutura não é gravada, é aplicada na leitura
- **Mensagem-chave:** o ledger guarda **conta + CC + valor + data**. Ele **não** guarda "linha do DRE" nem "gestão".
- **Conteúdo:**
  - O DRE Societário é a **árvore do Plano de Contas** aplicada sobre os totais.
  - A gestão do Headcount/OPEX vem do **campo Gestão do CC**, resolvido na hora de montar a tela.
  - **Consequência boa:** reorganizar a árvore ou trocar a gestão de um CC reclassifica todo o histórico sem recarregar nada.
  - **Consequência perigosa:** essa mudança é **retroativa** — meses fechados mudam de aparência.
- **Visual:** duas telas lado a lado do mesmo mês, antes/depois de trocar a gestão de um CC.
- **Nota:** este é o ponto que mais gera "o relatório mudou sozinho". Enfatizar.

### Slide 6 — Conceito 3: quem valida é o banco, não a tela
- **Mensagem-chave:** a tela mostra o erro, mas quem decide é o servidor.
- **Conteúdo:**
  - Ao gravar cada linha, um gatilho no banco (`validate_actuals_import_row`) faz a checagem e resolve os IDs.
  - Por isso **"Revalidar lote" funciona**: ele regrava as linhas e força o banco a conferir de novo, agora com o cadastro corrigido.
  - Por isso também **não adianta "forçar"** pela tela: o banco recusa aplicar lote com qualquer linha em erro.
- **Visual:** ícone de escudo entre navegador e banco.

---

# BLOCO 2 — CADASTROS: AS CHAVES

### Slide 7 — Onde ficam os cadastros
- **Mensagem-chave:** tudo em **Parâmetros**, visível só para admin.
- **Conteúdo:** menu Parâmetros → Empresas · Plano de Contas · Gestões · Centro de Custos (+ Carga de Realizado e Carga de Planejado).
- **Visual:** print do menu lateral expandido com as 4 entradas destacadas.

### Slide 8 — Empresas (filiais)
- **Mensagem-chave:** o código da empresa tem que ter exatamente 2 dígitos.
- **Conteúdo:**
  - Campos: código (2 dígitos), nome, observação.
  - É a coluna **Empresa** do arquivo de carga — obrigatória.
  - Empresa não cadastrada = linha em erro.
- **Visual:** print da tela de Empresas.

### Slide 9 — Plano de Contas: árvore + cadastro de conta são a mesma ação
- **Mensagem-chave:** criar um nó **Analítico** na árvore é o que cria a conta contábil.
- **Conteúdo:**
  - A árvore tem nós **Sintéticos** (totalizadores, não recebem lançamento) e **Analíticos** (folhas, recebem lançamento).
  - Ao salvar um nó Analítico, o app grava **duas coisas**: a conta no cadastro de contas e o nó na árvore, já vinculados.
  - Há uma trava no banco: **nó analítico ativo sem conta vinculada, ou com número diferente do código do nó, é recusado**. (Trava criada depois de um incidente real: ~90 contas existiam na árvore e nunca tinham sido criadas no cadastro.)
  - Excluir um nó exclui também a conta correspondente.
- **Visual:** print da árvore com um nó analítico selecionado + o editor à direita.
- **Nota:** explicar que o "código" do nó **é** o número da conta — não são campos independentes.

### Slide 10 — Centro de Custos: estrutura por Tipo, atributo de Gestão
- **Mensagem-chave:** o CC vive na árvore por **Tipo**; a **Gestão** é um atributo dele.
- **Conteúdo:**
  - Tipos: **MOD, MOI, ADM, COM, ENG** — definem onde o CC fica na árvore.
  - **Gestão** (Diretoria, Controladoria, RH, Supply Chain, Industrial, Engenharia, Marketing, Produto, Qualidade, Comercial) — campo editável **somente em nó Analítico**.
  - Salvar grava o CC no cadastro com número, nome, tipo e gestão.
- **Visual:** print do editor de CC com o campo Gestão destacado.

### Slide 11 — Gestões: cadastro do nome, não da vinculação
- **Mensagem-chave:** a tela de Gestões **não** vincula CC. Ela só nomeia e mostra.
- **Conteúdo:**
  - Criar / renomear / excluir gestão; expandir mostra os CCs vinculados (**somente leitura** — o próprio app avisa isso na tela).
  - Renomear faz cascata nos CCs que usavam o nome antigo.
  - Excluir **não** apaga CC: os CCs vinculados ficam sem gestão (e caem em "Sem área" nos relatórios).
  - ⚠️ **Ponto de atenção a validar antes de apresentar:** a lista de gestões do editor de CC é fixa no código (as 10 acima) e não lê da tela de Gestões. Criar uma gestão nova ali **pode não** ficar selecionável no CC. Verificar no ambiente antes de ensinar "crie uma gestão nova".
- **Visual:** print da tela de Gestões com o aviso "a vinculação é definida no cadastro de Centros de Custo" em destaque.

---

# BLOCO 3 — CARGA DO DRE REALIZADO

### Slide 12 — Onde e o que
- **Mensagem-chave:** Parâmetros → Carga de Realizado → card **DRE**.
- **Conteúdo:** o catálogo tem 5 cards — DRE (ativo), Balanço Patrimonial e Fluxo de Caixa (em breve), Volumes de Vendas (leva ao módulo Comercial) e Headcount (leva ao módulo de HC).
- **Visual:** print do catálogo com o card DRE destacado.

### Slide 13 — Antes de importar: 2 decisões
- **Mensagem-chave:** período e modo de carga são decididos **antes** do arquivo.
- **Conteúdo:**
  - **Período** — vem do seletor de período do app; o lote nasce carimbado com esse mês/ano. Toda linha do arquivo precisa ter data **dentro** dessa competência.
  - **Modo:**
    - **Carga completa** → apaga o realizado inteiro daquela competência e substitui pelo lote. Pede confirmação.
    - **Carga adicional** → convive com o que já existe; só substitui as linhas do próprio lote.
- **Visual:** dois blocos comparativos com ícone de "substituir" vs "somar".
- **Nota:** regra prática — fechamento do mês = completa; ajuste pontual = adicional.

### Slide 14 — O arquivo
- **Mensagem-chave:** use o botão **Modelo**; o leitor aceita variações de nome de coluna, mas não colunas faltando.
- **Conteúdo:**
  - Formatos: `.xlsx`, `.xls`, `.csv`, `.txt` (CSV aceita `;` ou `,`). Limites de leitura no navegador: ~50 MB para Excel, ~80 MB para texto.
  - **Colunas obrigatórias:** Data · Conta · Empresa · Valor.
  - **Opcionais:** Centro de Custos · Histórico · Lote.
  - Nomes de coluna são normalizados (sem acento, sem espaço, minúsculo) e aceitam sinônimos — ex.: *Centro de Custo, C. Custo, CC*.
  - Só a **primeira aba** da planilha é lida.
- **Visual:** tabela de mapeamento coluna do arquivo → campo do sistema.

### Slide 15 — O que acontece ao clicar em Importar
- **Mensagem-chave:** importar já tenta aplicar. Um clique faz o caminho todo, se estiver tudo certo.
- **Conteúdo (sequência):**
  1. Lê o arquivo no navegador.
  2. Cria o lote (status rascunho).
  3. Normaliza cada linha — conta/CC/empresa viram **só dígitos**; valor aceita formato brasileiro.
  4. Grava as linhas em blocos de 200; **cada bloco é validado pelo banco na gravação**.
  5. O banco recalcula os contadores do lote e define o status.
  6. Se não houver erro → **aplica automaticamente**.
- **Visual:** a esteira do slide 3, com os passos 2–4 acesos.

### Slide 16 — O que a validação confere (as 5 regras)
- **Mensagem-chave:** decorar essas 5 regras é decorar o troubleshooting inteiro.
- **Conteúdo:**
  | Erro | Significa |
  |---|---|
  | Data obrigatória | célula vazia ou ilegível |
  | Data fora da competência do lote | mês/ano da linha ≠ período do lote |
  | Empresa obrigatória / não cadastrada | falta a empresa, ou o código não existe em Empresas |
  | Conta obrigatória / não cadastrada | falta a conta, ou não existe no Plano de Contas |
  | Centro de custos não cadastrado | CC preenchido mas inexistente (CC **vazio é aceito**) |
  | Valor obrigatório | valor não numérico |
- **Visual:** tabela + print do popover de diagnóstico de uma linha.
- **Nota:** destacar que CC em branco passa — e que isso tem efeito no OPEX/Headcount (o gasto fica sem gestão).

### Slide 17 — O que a aplicação faz no banco
- **Mensagem-chave:** aplicar é uma operação única, transacional e com permissão checada.
- **Conteúdo:**
  - Confere se o usuário pode editar a organização.
  - Recusa lote vazio ou com qualquer linha em erro.
  - Apaga o alvo (competência inteira, se completa; só o lote, se adicional).
  - Insere os lançamentos oficiais.
  - **Recalcula a tabela-resumo conta × mês** daquele mês.
  - Marca o lote como aplicado, com autor e horário.
- **Visual:** os 6 passos como checklist.

### Slide 18 — Por que o relatório abre rápido
- **Mensagem-chave:** o relatório não lê lançamento a lançamento.
- **Conteúdo:**
  - Os DREs leem a tabela-resumo **conta × mês** (uma linha por conta/mês), não o ledger.
  - O ledger detalhado só é lido no **drilldown** (quando você clica na célula) e no OPEX/Headcount, que precisam do CC.
  - Após aplicar um lote, o cache do ano é limpo — por isso o relatório já abre atualizado.
- **Visual:** comparação "milhares de linhas" vs "centenas de linhas".

---

# BLOCO 4 — ERROS E CORREÇÃO

### Slide 19 — Como o erro aparece
- **Mensagem-chave:** o app não esconde erro — ele **bloqueia** a aplicação.
- **Conteúdo:**
  - Cabeçalho do lote mostra Linhas / Válidas / **Erros** / Status.
  - Botão **Aplicar lote** fica desabilitado enquanto houver erro.
  - Cada linha em erro tem badge vermelho clicável → popover com o diagnóstico.
  - Botão **Revalidar lote** aparece só quando existe erro.
  - Busca por conta / CC / histórico / lote para achar as linhas problemáticas.
- **Visual:** print do detalhe do lote em estado de erro, com 3 setas apontando: contador, badge, botão revalidar.

### Slide 20 — O ciclo de correção (fluxo padrão)
- **Mensagem-chave:** corrigir cadastro → revalidar → aplicar. Nunca apagar o lote e recomeçar.
- **Conteúdo — passo a passo:**
  1. Abrir o lote e clicar no badge de erro para ler o diagnóstico.
  2. Ir ao cadastro correspondente e criar/corrigir a chave.
  3. Voltar em Carga de Realizado e clicar em **Revalidar lote**.
  4. Conferir que Erros = 0 e status = pronto.
  5. **Aplicar lote**.
- **Visual:** ciclo circular de 5 passos.
- **Nota:** existe também o ↻ por linha, para corrigir uma linha isolada sem revalidar o lote todo.

### Slide 21 — Receita por tipo de erro
- **Mensagem-chave:** cada mensagem tem um destino de cadastro.
- **Conteúdo:**
  | Mensagem | Para onde ir | O que fazer |
  |---|---|---|
  | Conta não cadastrada | Plano de Contas | criar nó **Analítico** com o código **idêntico** ao do arquivo, no pai correto |
  | Centro de custos não cadastrado | Centro de Custos | criar nó Analítico sob o **Tipo** certo e **escolher a Gestão** |
  | Empresa não cadastrada | Empresas | criar a filial com código de 2 dígitos |
  | Data fora da competência | — | ou o período do lote está errado, ou o extrato veio com datas de outro mês |
  | Valor obrigatório | arquivo | célula texto/vazia; corrigir na grade ou no arquivo |
- **Visual:** tabela com ícone do menu de destino em cada linha.
- **Nota:** ao criar conta nova, lembrar do slide 33 (nova conta **não** entra sozinha no Gerencial/OPEX/Headcount).

### Slide 22 — Edição e exclusão
- **Mensagem-chave:** dá para corrigir na grade, e dá para desfazer.
- **Conteúdo:**
  - **Editar na grade** — qualquer célula do lote é editável; ao sair do campo, salva e revalida sozinha (feedback visual de salvo/erro).
  - **Adicionar lançamento** / **Novo lote manual** — para ajustes sem arquivo.
  - **Excluir lote** — se já aplicado, o sistema **desfaz a aplicação** (remove os lançamentos e recalcula o resumo) antes de excluir, tudo numa transação.
  - Tudo é auditado no banco (lote, linha e lançamento) com autor e horário.
- **Visual:** print da grade com uma linha em estado "salvo".

---

# BLOCO 5 — CARGA DE HEADCOUNT

### Slide 23 — Onde e quais são os 3 destinos
- **Mensagem-chave:** headcount tem 3 destinos distintos e é fácil errar o destino.
- **Conteúdo:**
  - Entradas: Carga de **Realizado** → card Headcount, ou Carga de **Planejado** → Headcount.
  - Catálogo: **Realizado** · **Orçado** · **Cenário** (escolher o cenário de forecast no dropdown e clicar em Abrir).
  - O destino escolhido fica carimbado no lote — é o que separa o quadro realizado do orçado nos relatórios.
- **Visual:** print do catálogo com os 3 cards.
- **Nota:** o rótulo do destino aparece no topo da tela de carga; ensinar a conferir antes de importar.

### Slide 24 — O arquivo de Headcount
- **Mensagem-chave:** headcount não tem valor — **cada linha é uma pessoa**.
- **Conteúdo:**
  - Colunas: Empresa · **CC** · **Matrícula** · **Colaborador** · Cargo. (Botão **Modelo** disponível.)
  - Não existe coluna de valor: o número de pessoas do relatório é a **contagem de linhas** por CC e mês.
  - Mesma lógica de período e de modo (completa × adicional) da carga de DRE.
- **Visual:** amostra da planilha modelo.

### Slide 25 — Validação do Headcount: mais frouxa (atenção)
- **Mensagem-chave:** aqui o sistema confere **muito menos** — a responsabilidade é do operador.
- **Conteúdo:**
  - Só 3 checagens: **CC preenchido**, **matrícula preenchida**, **nome preenchido**.
  - **Não confere se o CC existe** no cadastro. CC digitado errado **entra** e vai parar em "Sem área" no relatório.
  - Não há gatilho de banco nem tabela de auditoria como no DRE — a validação é toda no navegador.
- **Visual:** comparativo lado a lado "DRE Real: 6 checagens no banco" × "Headcount: 3 checagens na tela".
- **Nota:** recomendar conferência visual do relatório logo após a carga, procurando a seção "Sem área".

### Slide 26 — Regra da matrícula (a mais importante da carga de HC)
- **Mensagem-chave:** **1 matrícula = 1 pessoa por competência**. Duplicata não soma: sobrescreve.
- **Conteúdo:**
  - Antes de gravar, o sistema deduplica por (ano, mês, destino, **matrícula**) — se a matrícula aparecer 2× no arquivo, **a última linha vence** e a primeira é descartada silenciosamente.
  - Efeito prático: pessoa que trocou de CC no meio do mês conta **uma vez só**, no CC da última linha.
  - Linhas sem matrícula são **ignoradas** na aplicação.
  - Gravação em blocos de 500; em carga completa, o período/destino é limpo antes.
- **Visual:** exemplo com 3 linhas de arquivo → 2 pessoas no relatório, com a linha descartada em cinza.
- **Nota:** este é o item nº 1 de "por que o número não bate com o RH".

---

# BLOCO 6 — AGREGAÇÃO DO HEADCOUNT

### Slide 27 — O relatório cruza DUAS fontes independentes
- **Mensagem-chave:** quadro e custo vêm de lugares diferentes e podem divergir.
- **Conteúdo:**
  - **Quadro (pessoas):** contagem de linhas do headcount por **CC × mês**.
  - **Custo:** soma do **ledger do realizado** por CC × mês, filtrado por uma lista de contas de pessoal.
  - As duas fontes se encontram **pela chave do CC** — nada mais as liga.
  - Se a carga de HC e a carga do DRE não estiverem no mesmo mês, o custo/colaborador sai distorcido.
- **Visual:** diagrama em Y — duas caixas de origem convergindo numa tabela pelo CC.

### Slide 28 — Como as linhas são agrupadas
- **Mensagem-chave:** a hierarquia do relatório é **Gestão → Centro de Custo**, e ela vem do cadastro de CC.
- **Conteúdo:**
  - Para cada CC, o sistema busca o CC no cadastro e lê o campo **Gestão**.
  - Sem gestão preenchida, ou CC inexistente no cadastro → cai em **"Sem área"**.
  - Linha de topo: **Marcher (total)**. Seções: gestões, ordenadas por total de pessoas (maior primeiro). Dentro da seção: CCs por número.
  - Clicar na gestão expande/recolhe os CCs.
- **Visual:** print do relatório com as 3 camadas anotadas (total → gestão → CC).

### Slide 29 — Os dois modos de leitura
- **Mensagem-chave:** o mesmo relatório mostra duas grandezas.
- **Conteúdo:**
  - **Quadro** — número de pessoas. Célula vazia = zero pessoas.
  - **Custo/colab** — custo de pessoal do CC no mês ÷ nº de pessoas, arredondado. Mostra "—" quando não há pessoas ou o custo é zero.
  - O custo é usado em **módulo** (sinal ignorado), porque no razão as despesas entram negativas.
- **Visual:** print do toggle Quadro / Custo-colab + a mesma linha nos dois modos.

### Slide 30 — Drilldown e conferência
- **Mensagem-chave:** toda célula de CC com pessoas é clicável — é assim que se audita o número.
- **Conteúdo:**
  - Clique na célula → lista de **matrícula · colaborador · cargo** daquele CC naquele mês.
  - Botão **Excel** exporta a lista.
  - Roteiro de conferência: total do relatório × folha do RH → se divergir, abrir o CC suspeito e comparar nome a nome.
  - Perfis restritos (Gestor/Analista) veem só os CCs da própria gestão; admin vê tudo.
- **Visual:** print do popover de detalhamento.

---

# BLOCO 7 — CC ↔ GESTÃO: O EIXO DO SISTEMA

### Slide 31 — Um campo, cinco consequências
- **Mensagem-chave:** o campo **Gestão do CC** é o cadastro de maior alavancagem do app.
- **Conteúdo — quem depende dele:**
  1. Seções do relatório de **Headcount**.
  2. Filtro por gestão do **OPEX Real e Planejado**.
  3. Donut de OPEX por gestão do **Dashboard**.
  4. **Controle de acesso** — Gestor e Analista ficam travados nos CCs da própria gestão.
  5. Rateio de leitura por área em qualquer relatório personalizado que use CC.
- **Visual:** hub central "Gestão do CC" com 5 raios.

### Slide 32 — Um único ponto de verdade
- **Mensagem-chave:** não existe outro lugar para amarrar CC a gestão.
- **Conteúdo:**
  - A vinculação é **exclusivamente** o campo Gestão do CC analítico, em Centro de Custos.
  - A tela **Gestões** só nomeia e exibe — o próprio app avisa isso.
  - O lançamento **não** guarda a gestão: ela é resolvida toda vez que o relatório é montado.
  - Por isso: mudou a gestão de um CC → **todo o histórico se reorganiza**, sem recarregar nada.
- **Visual:** print do aviso na tela de Gestões + seta para o campo no editor de CC.

### Slide 33 — O que **não** é automático (armadilha do administrador)
- **Mensagem-chave:** criar uma conta nova no Plano de Contas **não** a coloca em todos os relatórios.
- **Conteúdo:**
  - **Entra sozinha em:** DRE Societário (dirigido pela árvore) e no ledger/drilldown.
  - **NÃO entra sozinha em:** DRE Gerencial, DRE DFs, OPEX e no **custo de pessoal do Headcount** — esses usam listas de contas fixas no código.
  - Sintoma típico: conta nova de pessoal → aparece no Societário, mas o **custo/colaborador do Headcount não muda**.
  - Ação: toda conta nova relevante exige **pedido de ajuste no código** (mapa do Gerencial/DFs, estrutura do OPEX, lista de contas de pessoal).
- **Visual:** matriz "conta nova × relatório" com ✅ / ⚠️.
- **Nota:** este é o principal débito técnico conhecido do módulo. Registrar como item de backlog junto com o handover.

---

# BLOCO 8 — RUNBOOK E RISCOS

### Slide 34 — Runbook do fechamento mensal
- **Mensagem-chave:** a rotina inteira em 9 passos.
- **Conteúdo:**
  1. Ajustar o **período** para o mês de fechamento.
  2. Extrair o razão do ERP no layout do **Modelo**.
  3. Carga de Realizado → DRE → modo **Carga completa** → importar.
  4. Zero erros? Se não, ciclo de correção (slides 20–21) → revalidar → aplicar.
  5. Conferir o cabeçalho do lote: Linhas / Válidas / Erros / Status **aplicado**.
  6. Extrair o quadro de pessoal do RH no layout do **Modelo** de headcount.
  7. Carga de Realizado → Headcount → **Realizado** → carga completa → importar.
  8. Abrir o relatório de Headcount: conferir o total contra o RH e checar se apareceu **"Sem área"**.
  9. Abrir DRE Societário e OPEX no mês e validar contra o fechamento contábil.
- **Visual:** checklist numerado, formato "imprimível".

### Slide 35 — Checklist de sanidade pós-carga
- **Mensagem-chave:** 5 conferências rápidas que pegam quase todo problema.
- **Conteúdo:**
  - [ ] Lote com status **aplicado** e Erros = 0.
  - [ ] Total do DRE Societário do mês bate com o fechamento.
  - [ ] Nenhuma seção **"Sem área"** inesperada no Headcount.
  - [ ] Total de pessoas bate com a folha do RH.
  - [ ] Custo/colaborador dentro da faixa esperada (valor absurdo = carga de DRE e de HC em meses diferentes, ou CC errado).
- **Visual:** checklist com caixas.

### Slide 36 — O que nunca fazer
- **Mensagem-chave:** cinco ações de alto risco.
- **Conteúdo:**
  - ❌ Rodar **carga completa** com o **período errado** — apaga o realizado de um mês fechado.
  - ❌ Excluir CC ou conta que já tem lançamento — o banco impede, mas a tentativa gera confusão; o caminho é inativar/reclassificar.
  - ❌ Trocar a gestão de um CC no meio do fechamento — muda o histórico de todos os relatórios na hora.
  - ❌ Recarregar headcount com matrículas duplicadas achando que soma — sobrescreve.
  - ❌ Excluir um lote aplicado sem entender que isso **remove** os lançamentos dele.
- **Visual:** cinco cards vermelhos.

### Slide 37 — Encerramento e apoio
- **Mensagem-chave:** o que fica documentado e para onde escalar.
- **Conteúdo:**
  - Onde estão os modelos de carga (botão **Modelo** em cada tela de carga).
  - Perfil necessário: **admin** (Parâmetros só aparece para admin/super admin).
  - Débitos conhecidos a acompanhar: listas de contas fixas no código; lista de gestões fixa no editor de CC; validação de HC mais frouxa que a do DRE.
  - Canal de escalonamento e como reportar (print do erro + nome do lote + mês).
- **Visual:** card de contato + QR/link para este roteiro.

---

## Pendências a confirmar antes de fechar o PPT

1. **Lista de gestões no editor de CC** — confirmar no ambiente se uma gestão criada em Parâmetros → Gestões aparece selecionável no cadastro de CC. Pelo código, a lista do editor é fixa. Isso muda a redação dos slides 11 e 32.
2. **Prints** — precisamos capturar as telas logadas (catálogo de carga, lote com erro, popover de diagnóstico, editor de CC, relatório de Headcount nos 2 modos, popover de drilldown).
3. **Nome/identificação da pessoa que assume** e se o deck deve incluir uma seção de acessos/credenciais.
4. **Duração** — se precisar de versão curta (~20 min), cortar os blocos 1 e 7 para 1 slide cada e manter 3, 4, 5, 6 e 8 na íntegra.
5. **Idioma/identidade visual** — usar o tema escuro do Vecton ou o template corporativo Marcher?
