# Regras funcionais — Vecton

Este documento consolida premissas funcionais recorrentes do Vecton.

## 1. Objetivo

O Vecton integra relatórios e análises empresariais envolvendo:
- vendas;
- despesas;
- pessoas;
- EBITDA;
- caixa;
- comissões;
- contas a pagar;
- contas a receber;
- estoque;
- planejamento;
- forecast;
- campanhas;
- integração com bases internas.

## 2. ERP e dados

O ambiente empresarial utiliza Protheus/TOTVS como fonte relevante de dados.

Tabelas recorrentes:
- SE1
- SE2
- SD1
- SD2
- SF2
- SA1
- SA2
- SB1
- SG1
- CT2

Toda alteração em consultas deve:
- preservar rastreabilidade;
- evitar duplicidade;
- respeitar filtros de filial;
- respeitar exclusões lógicas quando aplicável;
- preservar coerência entre relatório e fonte;
- considerar impacto em integrações existentes.

## 3. Relatórios de vendas

Filtros e dimensões podem incluir:
- vendedor;
- representante;
- coordenador;
- gerente;
- produto;
- SKU;
- família;
- cultura;
- território;
- UF;
- cliente;
- período.

Períodos padrão:
- Mês
- YTD
- Ano

Indicadores comuns:
- volume;
- faturamento;
- ticket médio;
- atingimento;
- superação;
- carteira;
- estoque.

## 4. Campanhas

Campanhas podem considerar:
- cargo;
- elegibilidade;
- meta;
- atingimento;
- superação;
- volume;
- faturamento.

Possíveis cargos:
- vendedor;
- representante;
- coordenador;
- gerente.

Flag recorrente:
- Elegível

## 5. Mapas de vendas

Casos recorrentes:
- ranking geográfico por UF;
- vendas por vendedor;
- vendas por cliente;
- vendas por SKU;
- máquinas por UF;
- peças por UF.

Ao criar mapas:
- conciliar total com painel principal;
- manter filtros corporativos;
- incluir Exterior/EX quando aplicável;
- não criar totalizações inconsistentes.

## 6. Comissão

Relatórios podem trabalhar com:
- período;
- provisão;
- pagamento;
- NF;
- cliente;
- UF;
- valor;
- percentual;
- comissão;
- data.

Sempre deixar explícito se o dado é:
- provisionado;
- realizado;
- pago.

## 7. Contas a pagar

Base recorrente:
- SE2

Indicadores e classificações possíveis:
- em aberto;
- realizado;
- no prazo;
- atrasado;
- classe;
- adiantamentos.

Campo relevante em conciliação:
- E5_RECONC

## 8. Contas a receber

Indicadores possíveis:
- títulos emitidos;
- liquidação;
- mix de recebimentos;
- aging;
- D0;
- D+30;
- D+60;
- D+90;
- status;
- modalidade de recebimento.

Objetivo recorrente:
- conciliar relatórios com base financeira;
- manter capacidade de atualização pela conexão de dados.

## 9. Contabilidade

Tabela recorrente:
- CT2

Campos frequentes:
- CT2_DEBITO
- CT2_CREDIT
- CT2_VALOR
- CT2_DATA
- CT2_LOTE
- CT2_SBLOTE
- CT2_TPSALD

Atenção especial:
- saldo anterior;
- débito;
- crédito;
- saldo final;
- filial;
- natureza da conta;
- viés de composição de resultado;
- conciliação entre Protheus e Excel.

## 10. BOM / Estrutura de produto

Possíveis unidades:
- MT
- CM
- KG
- G

Regras podem incluir:
- classificação C/P;
- uso de SB1;
- pareto;
- componentes comuns;
- componentes específicos.

## 11. Painel de vendas

Fonte histórica:
`Painel_Vecton.xlsm`

Fluxos podem envolver:
- carga;
- validação;
- pré-visualização;
- importação;
- logs;
- data;
- mês de trabalho;
- território.

A lógica de território pode depender de composição de colunas e tabela de correspondência.

Ao evoluir esse processo:
- preservar compatibilidade;
- reduzir dependência manual;
- centralizar regra;
- evitar lógica escondida em fórmulas de planilha.

## 12. Padrão para números

Moeda:
- R$ 1.234.567,89

Percentual:
- 12,3%

Executivo:
- R$ 7,2 mi
- R$ 450 mil

Quantidades inteiras:
- sem casas decimais, salvo necessidade.

## 13. Comparações

Quando houver comparação:
- Real x Orçado
- Real x Meta
- Real x Forecast
- Mês atual x mês anterior
- Atual x período comparável

Sempre indicar claramente:
- base de comparação;
- unidade;
- variação absoluta;
- variação percentual quando útil.

## 14. Integridade

Nunca alterar a lógica de um indicador apenas para fazer o visual “bater”.

Se houver divergência:
1. rastrear a origem;
2. identificar regra;
3. validar filtros;
4. validar duplicidades;
5. validar período;
6. validar filial;
7. validar status;
8. documentar o ajuste.

## 15. Regra de implementação

Ao desenvolver funcionalidade nova:
- separar regra de negócio da camada visual;
- centralizar cálculos reutilizáveis;
- tipar dados;
- evitar lógica duplicada;
- documentar decisões relevantes;
- preservar atualização futura da base.
