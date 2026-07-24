# Criador de Relatórios Comerciais — diagnóstico e proposta técnica

Data do diagnóstico: 22/07/2026

## 1. Decisão de arquitetura

O Criador de Relatórios Comerciais deve ser um domínio próprio. Ele pode reutilizar
infraestrutura visual do catálogo e utilitários de acesso ao Supabase, mas não deve
ser incorporado ao `reportsBuilderModule.js`, que foi projetado para relatórios
financeiros por linhas, colunas, contas e centros de custo.

Identificadores dos novos cards devem usar o prefixo `comercialRelatorio_`. Isso
evita colisão com os relatórios financeiros `custom_` e permite aplicar permissões
específicas.

O Painel de Vendas e o Mapa de Vendas não serão modificados. O novo motor deve ler
diretamente os ledgers comerciais e dimensões existentes por funções SQL com nomes
novos. Nenhuma RPC, view, classe CSS ou estado interno desses dois módulos será
reutilizado de forma mutável.

## 2. Mapa do código atual

### Catálogo e roteamento

- `index.html`: contém os quatro cards comerciais estáticos.
- `reportsSectionsModule.js`: organiza cards por seção e persiste a ordem em
  `report_section_items`.
- `app.js`: mantém `REPORT_TITLES`, controla acesso por papel e encaminha cada card
  para seu módulo em `renderReportsView()`.
- `reportsBuilderModule.js`: injeta relatórios financeiros personalizados com o
  prefixo `custom_`; não possui versionamento, compliance ou motor comercial.

### Campanhas atuais

- `reportsComercialBateuLevouModule.js`: apresentação, cálculo final de atingimento,
  ranking, regulamento e extrato do Bateu, Levou.
- `reportsComercialFinalDeAnoModule.js`: apresentação, cálculo final de atingimento,
  ranking, regulamento e extrato da campanha anual.
- `060_comercial_bateu_levou.sql` e `063_comercial_final_de_ano.sql`: versões
  originais das RPCs.
- `065_comercial_campanhas_por_vendedor.sql`: substitui as RPCs agregadas das duas
  campanhas e é a regra efetiva mais recente.
- `061_comercial_bateu_levou_extrato.sql` e o extrato criado em `063`: continuam
  baseados nas regras antigas. Portanto, agregado e extrato já podem divergir.

### Calendário principal

O seletor principal grava `{ year, month }` em `state.currentPeriod`. As campanhas
sincronizam esse estado ao abrir ou renderizar o relatório. O Bateu, Levou usa o mês
isolado; Final de Ano usa `reference_month <= mês selecionado`. Não há seletor de
mês próprio dentro dessas campanhas. O seletor de cenário Budget/Forecast é local
ao card e deve continuar separado do calendário.

## 3. Regras atuais — Bateu, Levou

Regra efetiva após a migration 065:

1. Realizado vem de `comercial_realizado_ledger_entries`.
2. Somente linhas `origem = 'FAT'` e `campanha_status = 'valida'` entram.
3. O período é exatamente o ano e o mês selecionados no calendário principal.
4. A chave de pessoa é `cod_vendedor`.
5. Os rankings são separados por linha de negócio: Grão e Pecuária.
6. A meta vem de `comercial_planejado`, no mesmo mês, e do cenário escolhido.
7. A meta é atribuída ao vendedor pela atribuição território + linha vigente no
   primeiro dia do mês planejado.
8. A elegibilidade ainda depende de `atribuicao.elegivel_campanha`; não depende do
   cargo cadastrado no Time Comercial.
9. O frontend calcula o percentual: `real / meta * 100`.
10. Quando meta é zero e realizado é positivo, o frontend força 100%.
11. “Bateu” exige percentual maior ou igual a 100% e pelo menos 2 unidades.
12. O ranking ordena por percentual e desempata pela quantidade realizada.
13. Quantidades e valores negativos são somados normalmente; logo, devoluções
    reduzem o mês em que foram lançadas.
14. O extrato atual não usa o mesmo contrato da RPC agregada e ainda cruza
    elegibilidade por responsável/nome. Ele precisa ser substituído, não adaptado.

Divergência com o prompt: a campanha atual separa Grão e Pecuária e filtra essas
linhas, equivalentes hoje a Máquinas classificadas por cultura. O novo modelo deve
gravar explicitamente `produto = Máquinas` e `cultura = Grão/Pecuária`, mantendo os
dois rankings como agrupamento configurado.

## 4. Regras atuais — Meta de Final de Ano

Regra efetiva após a migration 065:

1. Realizado vem de `comercial_realizado_ledger_entries`.
2. Somente `FAT`, com `campanha_status = 'valida'`, entra.
3. O período é YTD: janeiro até o mês selecionado, inclusive.
4. A chave e o agrupamento são `cod_vendedor`.
5. A métrica principal é faturamento em valor.
6. A meta vem de `comercial_planejado`, acumulada no mesmo intervalo e cenário.
7. A meta usa a atribuição território + linha vigente em cada competência.
8. A RPC atual exclui explicitamente apenas o código `000633`.
9. Não existe filtro efetivo por cargo ou status do Time Comercial.
10. O frontend calcula percentual, ordena por percentual e desempata por
    faturamento realizado.
11. Meta zero com realizado positivo é apresentada como 100%.
12. O primeiro colocado recebe destaque visual, mas não existe uma regra de
    premiação persistida.
13. Não há projeção implementada no backend atual.
14. Devoluções negativas reduzem o acumulado YTD.
15. O extrato atual usa exclusões por nome e não reproduz a RPC mais recente.

## 5. Produtos, culturas, margem e movimentos

- Produto é uma dimensão estruturada em `comercial_produtos`.
- Grupo/tipo está em `comercial_tipos` por `produto.tipo_id`.
- Cultura está em `comercial_culturas` por `produto.cultura_id`.
- A carga deriva a linha de negócio de tipo + cultura. Não é necessário inferir
  cultura pelo texto do produto.
- O ledger guarda `produto_id`, `linha_negocio_id`, quantidade, valor e `mb_pct`.
- Margem em valor ainda não é persistida. A regra sugerida é
  `valor * mb_pct`, preservando o sinal da devolução, somente quando `mb_pct` não
  for nulo. Essa regra precisa ser aprovada e centralizada no backend.
- O ledger não possui número de documento/NF. Esse campo não pode aparecer de
  forma confiável no detalhamento até ser incluído na carga e no ledger.
- Tipo e cultura são consultados na dimensão atual. Para relatórios encerrados não
  mudarem após reclassificação do produto, o resultado encerrado deve ser
  congelado ou as classificações precisam de histórico.

## 6. Lacunas encontradas nas premissas

1. `comercial_vendedores` possui código, nome, cargo e situação, mas não possui
   `data_inicio` e `data_fim`.
2. A vigência existente pertence à atribuição território + linha, não ao cadastro
   central da pessoa.
3. Cargo e situação são valores atuais, sem histórico. Assim, hoje não é possível
   cumprir “não reclassificar histórico pelo cargo atual”.
4. O cargo cadastrado é `Representando Comercial`, enquanto o prompt usa
   `Representante`/`Representante Comercial`. Sem normalização, os filtros não
   encontrarão participantes.
5. `elegivel_campanha` é uma flag genérica na atribuição, justamente o mecanismo
   que o novo prompt proíbe para relatórios futuros.
6. Os relatórios atuais retornam colunas fixas e calculam parte das regras no
   frontend.
7. Compliance atual é texto fixo do frontend.
8. Não há versionamento nem auditoria de configuração comercial.
9. Não há suíte automatizada configurada no repositório.
10. Agregados e extratos atuais usam regras diferentes.

Essas lacunas são pré-requisitos técnicos do novo motor e não podem ser ignoradas
sem produzir resultados não auditáveis.

## 7. Modelo de dados proposto

### `comercial_vendedor_vigencias`

Histórico SCD2 de atributos da pessoa:

- organização;
- `cod_vendedor` textual;
- nome de exibição;
- cargo;
- situação;
- `data_inicio` e `data_fim`;
- autor e timestamps;
- restrição contra períodos sobrepostos por organização + código.

O cadastro atual pode continuar como projeção do registro vigente, mas o motor de
relatórios deve resolver cargo/status pela data do movimento.

### `comercial_report_definitions`

Identidade estável do relatório:

- organização, nome, descrição e status;
- modalidade;
- datas de validade da campanha;
- ordem do card;
- versão corrente;
- autor e timestamps;
- tipo `custom`, `bateu_levou` ou `final_ano`.

### `comercial_report_versions`

Versões imutáveis:

- relatório e número da versão;
- configuração JSONB validada;
- autor, data e motivo da alteração;
- hash da configuração;
- indicador de versão publicada.

O JSONB contém apenas opções fechadas: participantes, origens, tipos de produto,
culturas, métricas, condições, ranking, gráficos e apresentação. Não haverá fórmula
livre nem SQL configurável.

### `comercial_report_version_participants`

Lista opcional de códigos selecionados para uma versão, com tipo de seleção
`geral`, `parcial` ou `individual` e versão da lista de pessoas.

### `comercial_report_audit`

Auditoria por alteração, guardando usuário, campo, valor anterior, valor novo,
versões anterior/nova e timestamp.

### `comercial_report_runs`

Execuções auditáveis:

- relatório + versão;
- período efetivo e cenário;
- parâmetros processados;
- compliance gerado;
- hash do resultado;
- status auditável/não auditável;
- resultado JSONB congelado quando a campanha for encerrada ou quando houver
  exportação oficial.

Rascunhos podem ser excluídos somente se não possuírem runs. Relatórios com runs
devem ser encerrados ou duplicados.

## 8. Serviço e endpoints

Usar RPCs novas e isoladas:

- `comercial_report_participants(report_id, year, month)`;
- `comercial_report_execute(report_id, year, month, scenario_id)`;
- `comercial_report_movements(run_or_report_id, year, month, cod_vendedor)`;
- `comercial_report_publish(report_id)`;
- `comercial_report_close(report_id, year, month, scenario_id)`.

O motor SQL deve aplicar a configuração por `CASE` e filtros parametrizados. Não
deve montar SQL livre a partir do JSONB. A mesma execução alimentará resumo,
tabela, gráficos, detalhamento e compliance.

## 9. Contrato dinâmico de saída

```json
{
  "report": {
    "id": "uuid",
    "name": "Bateu, Levou",
    "version": 1,
    "status": "active",
    "mode": "monthly"
  },
  "period": {
    "year": 2026,
    "month": 7,
    "effective_start": "2026-07-01",
    "effective_end": "2026-07-31"
  },
  "columns": [
    {
      "key": "cod_vendedor",
      "label": "Código",
      "type": "text",
      "format": null,
      "visible": true,
      "order": 1,
      "primary_metric": false
    }
  ],
  "summary": [],
  "rows": [],
  "charts": [],
  "compliance": {
    "auditable": true,
    "rules": [],
    "generated_at": "timestamp",
    "config_hash": "sha256"
  },
  "config": {}
}
```

O frontend renderiza somente as chaves descritas em `columns`, `summary` e
`charts`. Nenhuma coluna comercial será presumida no HTML.

## 10. Organização do frontend

Criar módulos pequenos, sem aumentar a responsabilidade do `app.js`:

```text
src/modules/reports/comercial/
  comercialReportsCatalogModule.js
  comercialReportCreatorModule.js
  comercialReportRuntimeModule.js
  comercialReportTableModule.js
  comercialReportChartsModule.js
  comercialReportComplianceModule.js
  comercialReportExportModule.js
  comercialReportConfig.js
```

- Catálogo: carrega definições e injeta cards `comercialRelatorio_<uuid>` na seção
  Comercial, antes de o `reportsSectionsModule` reorganizar o DOM.
- Creator: modal por etapas, com validação de domínio antes do salvamento.
- Runtime: única chamada de execução e distribuição do mesmo payload para todos os
  componentes.
- Table: colunas dinâmicas e clique por integrante.
- Charts: somente configurações confirmadas, sempre usando `payload.charts`.
- Compliance: renderiza exclusivamente regras devolvidas pelo backend.
- Export: usa o mesmo run/hash mostrado na tela.

O botão deve se chamar `+ Criar relatório` e ficar na extremidade direita da seção
Comercial. O botão financeiro `+ Novo relatório` permanece independente.

## 11. Migração das campanhas

1. Criar o modelo comum e o motor sem alterar os cards antigos.
2. Semear Bateu, Levou e Final de Ano como definições/versionamentos do novo motor.
3. Manter cards novos e antigos lado a lado sob uma flag de validação.
4. Comparar agregado, participantes e movimentos por período.
5. Corrigir divergências no novo motor ou documentar erro conhecido do legado.
6. Somente após equivalência aprovada, apontar os cards oficiais para o novo motor.
7. Manter as RPCs antigas durante uma janela de rollback.
8. Não tocar nas RPCs nem nos módulos do Painel e do Mapa.

## 12. Estratégia de comparação

Para Bateu, Levou, comparar cada mês por código + cultura/linha:

- quantidade real;
- meta;
- percentual;
- posição;
- elegibilidade e premiação;
- conjunto de movimentos e soma do extrato.

Para Final de Ano, comparar cada fechamento YTD por código:

- faturamento real acumulado;
- meta acumulada;
- percentual;
- posição;
- conjunto de movimentos.

Cada diferença deve produzir registro com código, período, métrica, valor legado,
valor novo e explicação. A comparação por nome não é aceita.

## 13. Testes propostos

- Testes SQL transacionais com fixtures mínimas para filtros, vigência, devoluções,
  código textual, cenário, mensal e YTD.
- Testes de unidade com `node:test` para contrato de colunas, configuração,
  formatação, visibilidade e compliance.
- Testes de integração do catálogo, criação, edição, duplicação e encerramento.
- Matriz de regressão com snapshots das RPCs do Painel e do Mapa antes/depois.
- Testes de exportação comparando hash, colunas e totais com o run exibido.

## 14. Permissões propostas

- Leitura: membros da organização; o papel Comercial enxerga relatórios comerciais
  ativos e encerrados autorizados.
- Criar/editar/publicar/encerrar/duplicar: `admin` e `super_admin` inicialmente.
- Excluir: somente rascunho sem run.
- Mudança de relatório ativo: sempre cria nova versão e auditoria.

Essa política segue o modelo atual de `custom_reports`; qualquer papel adicional
de editor comercial deve ser definido explicitamente antes da migration de RLS.

## 15. Riscos e bloqueios

### Bloqueios de domínio

1. Definir o texto canônico do cargo: manter `Representando Comercial` ou corrigir
   para `Representante Comercial`.
2. Confirmar a regra de margem em valor: `valor * mb_pct`.
3. Definir se o número da NF será incluído na carga ou removido do primeiro escopo.
4. Definir a premiação da Meta de Final de Ano; hoje há ranking, mas não uma regra
   persistida de premiado.
5. Confirmar se Budget/Forecast continua selecionável em cada relatório ou se fará
   parte da configuração publicada.

### Riscos técnicos

- Reclassificação histórica de cargo/produto sem SCD2 ou run congelado.
- Divergência entre extrato legado e agregado legado.
- Configuração ampla demais gerar consultas pesadas; serão necessários índices por
  organização, período, origem, código, produto e status de campanha.
- Prefixos e regras de acesso do catálogo atual ocultarem cards dinâmicos do papel
  Comercial.
- Migration 064 insere vendedores históricos sem `cargo`; após a migration 066, a
  trigger precisa passar cargo ou depender explicitamente do default.

## 16. Ordem segura de implementação

1. Resolver os cinco bloqueios de domínio acima.
2. Criar histórico de vigência/cargo do Time Comercial e corrigir a trigger de
   vendedores históricos.
3. Criar tabelas, RLS, validação de configuração, auditoria e índices.
4. Implementar participantes e motor de execução somente no backend.
5. Criar testes de contrato e fixtures.
6. Implementar catálogo e Criador de Relatórios.
7. Implementar runtime, tabela, detalhamento, gráficos e compliance.
8. Implementar exportações sobre runs.
9. Semear e validar Bateu, Levou.
10. Semear e validar Final de Ano.
11. Trocar os cards oficiais após aprovação das comparações.

## 17. Confirmações do escopo

- Bateu, Levou: mensal e não cumulativo.
- Meta de Final de Ano: anual e YTD até o mês selecionado.
- Calendário principal obrigatório.
- Filtro combinado de cargos e integrantes por `cod_vendedor`.
- Produtos e culturas usando dimensões estruturadas.
- Colunas dinâmicas.
- Margem somente quando configurada.
- Gráficos opcionais e confirmados pelo usuário.
- Compliance gerado pelo backend.
- Painel de Vendas e Mapa de Vendas isolados e inalterados.

## 18. Decisoes aprovadas para a implementacao

Esta secao substitui os bloqueios de dominio listados na secao 15.

1. O texto canonico do cargo e `Representante Comercial`. A migration 067
   converte o valor antigo e recria a constraint com a grafia aprovada.
2. A margem percentual ja chega calculada em `mb_pct`. Ela sera exibida no
   detalhamento dos movimentos, sem recalculo. Como nao existe margem em valor
   persistida e somar percentuais seria incorreto, margem nao sera metrica
   principal agregada nesta primeira versao.
3. O numero da NF fica fora da primeira versao, pois nao existe no ledger atual.
4. A campanha Final de Ano compara realizado com Budget/Forecast e ordena pela
   maior superacao acumulada. O vencedor e definido somente no fechamento de
   dezembro de 2026.
5. Budget e Forecast permanecem selecionaveis na execucao. O cenario usado fica
   registrado no compliance e nos runs oficializados.

## 19. Estrutura implementada

- Migration 067: normalizacao de `Representante Comercial` e historico SCD2 de
  nome, cargo, status e vigencia.
- Migration 068: definicoes, versoes imutaveis, participantes, auditoria, runs,
  RLS, validacao fechada e presets das duas campanhas.
- Migration 069: motor unico para mensal/YTD, Budget/Forecast, filtros combinados,
  ranking, premiacao, colunas dinamicas, graficos, movimentos e compliance.
- Produtos e culturas novos sao persistidos por UUID das dimensoes tecnicas. Os
  campos textuais permanecem apenas como compatibilidade de leitura das versoes
  anteriores.
- O frontend inclui criacao, edicao, ativacao, encerramento, duplicacao, exclusao
  de rascunho, cards dinamicos, filtro de equipe por vigencia, detalhamento,
  oficializacao, planilha e impressao/PDF.
- Runs oficializados guardam payload e hash. Relatorios encerrados reutilizam o
  snapshot oficial do mesmo periodo e cenario quando ele existir.
- Os scripts em `supabase/tests/` validam o contrato de configuracao e comparam
  os presets novos com as RPCs legadas sem remover os cards antigos.
