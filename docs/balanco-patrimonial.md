# Plano de Contas BP

Configuração fornecida pelo usuário em `Plano de Contas BP.xlsx`: `CONTA`, `NOME DA CONTA`, `TIPO_CONTA` e `CHAVE-AGRUPADORA`. Não há saldo neste cadastro.

São 173 contas: 59 sintéticas e 114 analíticas, com 26 chaves agrupadoras. Códigos são texto, preservando zeros e níveis. A conta pai é o ancestral cadastrado mais próximo do código contábil.

Somente analíticas têm chave agrupadora e compõem as linhas do relatório. As sintéticas organizam a hierarquia e não duplicam os saldos. Os textos das chaves são preservados literalmente, sem reclassificações ou correções presumidas.

## Tela

Parâmetros → Plano de Contas BP: árvore à esquerda, editor à direita, busca por código/nome/chave e filtro por tipo. O editor contém código, nome, tipo, conta pai, chave, situação, ordem e observação. A chave fica desabilitada nas sintéticas; nas analíticas, o campo sugere as chaves cadastradas.

## Instalação e importação

1. `supabase/301_bp_account_plan.sql`: instala somente o cadastro, validações e permissões.
2. `supabase/302_seed_bp_plan_marcher.sql`: importa o arquivo na organização Marcher Brasil (`0070482f-c2d5-4766-b20a-0549a7984e94`).

A importação não altera DRE/FC nem carrega saldos Real ou Planejado. Reexecuções atualizam por organização/código sem duplicar contas. Contas adicionais cadastradas depois não são removidas.

**Não aplicar `300_balance_sheet.sql`:** é o rascunho anterior às definições do usuário. Para cargas em uma base que já tem o plano (301–302), executar os SQLs 303, 304 e 305, nessa ordem.

Admin e Super Admin, inclusive por papel adicional, mantêm o cadastro. Membros ativos da organização podem ler o plano. RLS e trigger validam organização, papel, hierarquia e chaves exclusivamente analíticas.

## Validação local

```powershell
node tests/bpPlanConfig.sql.test.js
node tests/bpPlanConfig.browser.test.js
```

O teste SQL usa PostgreSQL isolado via PGlite: confere a instalação/importação idempotente, todas as contas contra a extração do arquivo quando disponível, hierarquia e permissões. O teste de navegador usa Edge isolado e as contas reais do arquivo, sem gravações em produção.

Dependências, se necessárias:

```powershell
npm install --prefix artifacts/bp-test-deps --no-save --ignore-scripts --no-audit --no-fund @electric-sql/pglite xlsx
```

Extração local: `artifacts/bp/source-plan.json`. Captura: `artifacts/bp/plan-config-desktop.png`.

## Balanço Patrimonial Real

O demonstrativo apresenta Ativo à esquerda e Passivo/Patrimônio Líquido à direita. As linhas e sua ordem seguem a imagem fornecida pelo usuário: Circulante, Não Circulante, Patrimônio Líquido, subtotais e totais dos dois lados alinhados no rodapé. Não há filtro de filial; todas as posições carregadas da organização Marcher são consolidadas.

O seletor de competência do cabeçalho é o único controle de data. A primeira coluna é o saldo acumulado no fechamento do mês selecionado. A segunda é sempre o fechamento de 31/12 do ano anterior. Outubro/2026, por exemplo, compara 31/10/2026 com 31/12/2025. Saldos de fechamento do BP não são somados entre meses.

Somente os saldos das analíticas são agrupados pela chave do plano, evitando a duplicação das sintéticas. As chaves originais não são alteradas. A apresentação mantém os títulos da imagem, incluindo as equivalências entre `Obrigaçãoes Trabalhistas` e `Obrigações Trabalhistas`, e entre `Empréstimos NC` e a linha `Empréstimos` do Não Circulante. Empréstimos de Acionistas aparece no Passivo Não Circulante, conforme o modelo aprovado. Impostos a Recuperar é separado entre Circulante e Não Circulante pela hierarquia contábil. Chaves adicionais são incluídas no respectivo grupo para não omitir saldos.

### Exceção: Reserva de Lucros

Por definição explícita do usuário, a chave `Resultado do Exercício` é apresentada na linha **Reserva de Lucros**, mas seu valor é substituído pelo resultado da conta **51401001 do DRE Societário Realizado**. O valor lançado no próprio BP nessa chave não é somado à linha.

O relatório reutiliza `buildDreSocRealReport` do app, porque a conta 51401001 é calculada no DRE, não uma leitura direta de lançamentos com esse código. Soma seus resultados mensais de janeiro até o mês selecionado somente no ano atual. No ano anterior, a linha Reserva de Lucros é sempre zero, sem consultar o resultado do DRE desse ano. Mantém o sinal do DRE e não força ajustes para zerar eventuais diferenças patrimoniais.

### Dados e estados

A leitura utiliza o plano instalado e os fechamentos BP realizados vigentes, quando disponíveis, apenas para as duas competências exatas. Não há fallback para meses anteriores e não há leitura de Budget ou Forecast. Fechamentos sobrepostos para a mesma filial ou uma posição consolidada misturada com filiais produzem erro, evitando dupla contagem.

Uma competência sem saldo carregado aparece como “—”, não como zero. Sem o resultado necessário do DRE, a Reserva de Lucros, o subtotal do PL e o total do Passivo do ano atual ficam indisponíveis; a coluna anterior continua calculada com Reserva de Lucros igual a zero. Erros de acesso ou conexão são exibidos com opção de tentar novamente. Nenhum valor de demonstração é incluído no produto; os exemplos visuais de testes ficam somente em `artifacts/bp/`.

Módulos: `bpReportModel.js` e `bpReportModule.js`, integrados ao card `balanceSheetReal`. A leitura utiliza os fechamentos `bp_import_batches`, instalados pela migration 303. Sem saldos carregados, o demonstrativo permanece disponível com valores ausentes.

Validação do relatório:

```powershell
node tests/bpReport.test.js
node tests/bpReport.browser.test.js
node tests/bp.browser.test.js
```

Os testes cobrem as datas, consolidação, agrupamento, exclusão de sintéticas, exceção do DRE real, acumulado janeiro–mês, Reserva de Lucros anterior zerada sem consultar o DRE anterior, dados ausentes, acesso, mudança de competência e requisições antigas. As capturas `report-final-clear.png`, `report-final-dark.png` e `report-final-mobile.png` usam valores de teste para verificar a disposição visual.


## Cargas consolidadas: SQL 303

A migration `303_bp_imports.sql` foi instalada no Supabase em 22/10/2026. O cadastro existente de 173 contas foi conferido por assinatura antes/depois, sem alterações. Nenhum saldo de teste foi inserido em produção.

O SQL cria apenas o repositório de lotes, suas regras de acesso e a RPC `bp_apply_import`. Pode ser reexecutado e não recria nem alimenta `bp_plan_nodes`. A migration 304 substitui esse comportamento: uma recarga exclui fisicamente o lote anterior e troca apenas a competência/fonte/cenário correspondente, em transação. Alterações do plano após a validação impedem a aplicação até nova conferência. Realizado e cenários planejados não se substituem entre si.

A tela de carga é consolidada Marcher, sem seletor de filial. No Planejado, o cenário de destino é obrigatório e deve pertencer ao ano da carga. A importação não alimenta DRE ou FC e não executa a exceção da Reserva de Lucros: essa substituição continua exclusiva do relatório.

### Arquivo

Use o balancete Excel com CONTA, NOME DA CONTA, SALDO e TIPO_CONTA. A coluna CHAVE-AGRUPADORA é opcional; quando preenchida, deve corresponder ao cadastro. A identificação é pelo código contábil, preservado como texto. O vínculo de relatório vem sempre do Plano BP.

A aba pode ter qualquer nome. O leitor procura CONTA e SALDO nas primeiras 30 linhas e exige uma única aba de balancete. O botão Baixar modelo BP gera o formato com as contas cadastradas, tipos e chaves. Sintéticas podem constar no arquivo, inclusive com saldo, mas são ignoradas na gravação. Somente as analíticas ativas presentes no arquivo são gravadas, uma vez cada. Não é obrigatório incluir todas as contas do plano. Contas omitidas não herdam saldos do lote anterior. Contas desconhecidas, duplicadas, inativas ou com tipo/chave divergente bloqueiam a carga.

São aceitos arquivos .xlsx/.xls de até 20 MB. Fórmulas de saldo analítico precisam ter resultado salvo no Excel. Os valores são arredondados para centavos e podem ser negativos. O servidor valida novamente conta, organização, perfil, cenário, competência, duplicidades e snapshot do plano; grava somente linhas analíticas canônicas, com usuário, data, arquivo e plano utilizado.

### Testes das cargas

`node tests/bpImport.test.js`: balancete com as 173 contas, descarte das sintéticas, chaves, aba/cabeçalho, duplicidades, ausência de contas e fórmulas.

`node tests/bpImport.sql.test.js`: PostgreSQL isolado, instalação idempotente, plano intacto, 114 saldos, substituição/histórico, cenários, isolamento de organizações, permissões e rejeição de plano desatualizado.

`node tests/bp.browser.test.js`: Excel real no navegador isolado, download do modelo, prévia, nova tentativa após erro, cargas Real/Planejado e leitura pelo relatório.


## Fluxo de carga no padrão DRE: SQL 304

A migration 304 foi instalada no Supabase em 22/10/2026. A conferência anterior encontrou zero lotes BP; não houve remoção de saldos existentes. O plano de 173 contas foi preservado.

Realizado e Planejado compartilham os cards de importação, histórico e detalhe do DRE. O botão de período abre o seletor global. A carga permanece completa, com saldos de fechamento consolidados; não se somam posições BP. O Planejado exige cenário do ano selecionado.

Importar arquivo valida o Excel e salva um rascunho persistente em bp_import_drafts. Novo lote manual inicia sem saldos; não é obrigatório informar todas as analíticas ativas. É necessário ao menos um saldo analítico válido. O detalhe permite buscar contas e adicionar, editar ou excluir lançamentos do rascunho. Editar lote aplicado cria uma cópia em rascunho, preservando o fechamento atual até a nova aplicação.

Aplicar lote revalida a revisão do rascunho, plano, contas, competência e destino no servidor. Na mesma transação, exclui todos os lotes anteriores da mesma organização/ano/mês/fonte/cenário, grava o definitivo e remove os rascunhos daquele destino. Se falhar, o lote vigente permanece intacto. Outros períodos e cenários são preservados. Excluir lote pede confirmação e remove somente o lote selecionado. Alterações de uma revisão antiga são rejeitadas para evitar sobrescrita entre sessões.

O relatório consulta exclusivamente os lotes definitivos, nunca os rascunhos. A limpeza inicial da migration remove somente registros já marcados como substituídos pelo fluxo 303.

Validação: bpImport.sql.test.js cobre instalação repetida, substituição física, isolamento de destinos, rascunhos, revisão concorrente, permissões e preservação do fechamento em falhas. bp.browser.test.js cobre Excel, consulta, busca, edição, reaplicação, lote manual incompleto, exclusão e destinos Real/Planejado em navegador isolado.


## Contas opcionais por competência: SQL 305

A carga completa aceita qualquer conjunto não vazio de analíticas ativas cadastradas. Não é necessário acrescentar contas ausentes com saldo zero. A substituição continua integral para a competência e destino: apenas os saldos enviados permanecem no lote definitivo, sem reaproveitar contas omitidas do lote anterior. A regra vale para Excel, lotes manuais, Realizado e Planejado. Contas novas continuam exigindo cadastro e chave agrupadora.


## Inclusão de contas em 23/10/2026: SQL 306

A migration 306 cadastra as dez analíticas solicitadas pelo usuário, com as chaves Imobilizado, Intangível, Estoques, Estoques de Terceiros e Outros Contas a Pagar. Reutiliza a sintética 2.1.6.02 e cria esse grupo somente se ausente. A conta pai segue o ancestral sintético cadastrado mais próximo. Reordena apenas os irmãos nos grupos afetados, comparando numericamente os segmentos do código e preservando seus zeros. Não modifica cargas nem saldos; pode ser reexecutada sem duplicar contas.
