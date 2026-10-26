# Carteira vigente (estoque de pedidos em aberto) — desenho técnico

Data: 23/10/2026 · Status: **pontos em aberto decididos em 26/10/2026 — aguardando aprovação final; nenhum código foi escrito**

> **Atualização de 26/10/2026 — implantado.** Migrations 311 e 312 aplicadas, robô atualizado e primeira carga real conferida (322 linhas: 106 FAT e 216 CART, R$ 4,68 mi de carteira; o faturamento de outubro ficou intacto; o Ricardo confirmou que os números do painel batem com a conta manual). Diferenças em relação ao desenho original: (1) a foto vigente é o lote de carteira mais recente **não posterior ao mês corrente do calendário** (já existia um lote manual de novembro com carteira, apagado por ser teste); (2) em vez de funções auxiliares, uma **visão** `comercial_realizado_ledger_vigente` entrega a carteira vigente com ano/mês reclassificados pela data de entrega, e as 6 funções do painel só trocaram a origem dos dados; (3) a validação do lote passou a aceitar data fora do mês **só para CART** (migration 312). Pendentes: saída para o robô não travar a carga inteira por cadastro faltando em pedido futuro (decisão do Ricardo), e a limpeza das fotos antigas de carteira (etapa separada, com backup). Detalhes em `docs/superpowers/plans/2026-10-26-carteira-vigente.md`.

## 1. Contexto e problema

A carteira (origem `CART`) hoje é tratada como fluxo mensal, igual ao faturamento:

- A carga do robô (`robo-cargas/sql/vendas_mes.sql`) traz como carteira apenas os pedidos **sem nota** cuja data de entrega (`C6_ENTREG`) cai **dentro do mês carregado**.
- Cada mês fica com uma "foto estanque" do que estava aberto no dia da carga. Não há carga retroativa (decisão do negócio: os meses fechados recebem ajustes gerenciais e não podem ser sobrescritos).
- A migration 254 evitou a contagem dupla no YTD/Ano ao ler a carteira de **um único mês** (o mês de referência). Isso resolve o total, mas não mostra a carteira real:
  - Pedido de março ainda aberto em outubro (entrega atrasada ou adiada) **some da carga** assim que março passa.
  - O YTD/Ano não representa o estoque real de carteira, porque as fotos antigas contam pedidos que já viraram faturamento.
- Pedido da área comercial: monitorar a carteira de **Peças**. Decisão: a regra vale para **toda a carteira** (Peças, Máquinas, Acessórios, Transgrain), porque as datas dos demais tipos já são mantidas à mão no Protheus.

## 2. Objetivo e critério de sucesso

Em qualquer dia, o Vecton mostra a carteira **real e atual**, distribuída pelo mês da **data de entrega prevista**:

- Mês escolhido = o que está aberto hoje e previsto para aquele mês (março mostra os atrasados; novembro mostra a carteira futura).
- YTD = soma do que está aberto com entrega prevista de janeiro até o mês escolhido.
- Ano = soma de tudo que está aberto com entrega prevista no ano.
- O total bate com o cálculo manual feito pelo Ricardo em 23/10/2026 (itens de março ainda não entregues e de setembro em diante, mais a carteira futura).

## 3. Fora de escopo

- O **faturamento (FAT)**: nenhuma alteração na consulta, nos lotes nem nos relatórios. O que o time chama de MATR550 permanece idêntico.
- Carga retroativa de qualquer mês. Meses fechados não são reescritos.
- Reconstruir a carteira histórica ("como era em março, vista em março").
- Histórico de carteira para tendência (foto por dia/semana). Pode virar uma segunda etapa, ver seção 9.
- Margem da carteira: o MP da carteira continua sendo a estimativa atual (quantidade × MP unitário da última venda). Não será revisado aqui.

## 4. Decisões já tomadas com o Ricardo

1. A visão desejada é "o que está aberto **hoje**, por mês de entrega prevista" (não a foto histórica de cada mês).
2. A carga **não retroage**: só escreve no lote do mês corrente.
3. O ajuste vale para **todos os tipos** de produto.
4. O faturamento continua preso ao lote do mês dele; a carteira passa a ter outra regra de leitura.
5. Por padrão, as fotos antigas de carteira (jan–set/2026 e anteriores) **permanecem** no banco, ignoradas pelo painel. A limpeza é uma decisão posterior.
6. (26/10/2026) **Atrasados aparecem só nos meses deles.** O toggle Mês mostra apenas a carteira com entrega prevista naquele mês; os atrasados (previstos para meses anteriores e ainda abertos) aparecem no YTD, no Ano e no mês da própria data prevista. O Ano inclui também novembro e dezembro: ele passa a ser faturado do ano + toda a carteira aberta prevista para o ano.

## 5. Conceito central

Cada linha de carteira carrega duas datas que não se confundem:

- **Mês do lote** (`reference_year`/`reference_month`): onde a linha fica guardada. Com este desenho, toda a carteira aberta fica no lote do **mês corrente**.
- **Data de entrega prevista** (`entry_date`): o que o Protheus diz. É por ela que o painel distribui a carteira nos meses.

Regra de leitura nova:

| Dado | De onde o painel lê | Como filtra o período |
|---|---|---|
| Faturamento (FAT) | Lotes de cada mês, como hoje | Mês, YTD ou Ano escolhido |
| Carteira (CART) | Somente a **foto vigente** (a carga de carteira mais recente) | Pela data de entrega prevista dentro do mês, YTD ou Ano escolhido |

Como a carteira vem de uma única foto, não há contagem dupla e não existe mais "soma de fotos".

## 6. Mudanças propostas

### 6.1 Robô (`robo-cargas`)

1. **Consulta de vendas** — bloco da carteira apenas:
   - Remover o corte por data de entrega (início e fim do mês). Passa a trazer todo item aberto: pedido sem nota, não eliminado por resíduo, TES/CFOP de saída, exclusões atuais mantidas (produto 102326, contabilização 005, filtros de tipo/orçamento do pedido).
   - Mantido: cálculo de RL (impostos estimados), MP (histórico unitário), vendedor, produto, cliente, tipo.
   - O bloco de faturamento (saídas e devoluções) **não muda**.
2. **Trava no job de vendas**: a carteira completa só é incluída quando o mês carregado é o **mês corrente**. Em mês fechado (ex.: "Carregar agora" escolhendo março), a carga traz só o faturamento. Evita gravar a carteira de hoje dentro de um mês já fechado.
3. **Configuração da carga** (`carga_automatica_config`): conferir `meses_atras` e `meses_frente`. O valor esperado é só o mês corrente. `meses_atras > 0` já seria carga retroativa; `meses_frente > 0` gravaria a carteira completa em duplicidade nos meses futuros.
4. O `runner.js` **não muda**: já apaga o mês e regrava, confere o razão e bloqueia queda anormal.

### 6.2 Banco (Supabase)

1. **Definição de foto vigente**: a carga de carteira mais recente do ledger (`origem = 'CART'`). Precisa ficar bem definida (ver pontos em aberto, seção 8).
2. **Substituir a regra da migration 254** nas funções que hoje filtram a carteira por mês de referência:
   - `comercial_painel_vendas`
   - `comercial_painel_tipos`
   - `comercial_painel_pecas_vendedor`
   - `comercial_painel_detalhe` (drill-down)
   - `comercial_pecas_geo_performance`
   - `comercial_pecas_geo_evolucao_mensal` (hoje cada mês usa o próprio CART; passa a distribuir a foto vigente pela data de entrega)
   - `comercial_cart_ref_month` deixa de ser a referência ou é reaproveitada para identificar a foto vigente.
3. Nas mesmas funções, a janela da carteira passa a ser feita pela **data de entrega**, não pelo mês do lote.
4. Sem nova tabela e sem mudança de estrutura: reaproveita o ledger atual.
5. O motor dos relatórios configuráveis (`comercial_report_*`), que deixa o usuário escolher origens, precisa ser verificado: se ele lê CART por mês, deve seguir a mesma regra.

### 6.3 Interface

- Peças Geo e Painel de Vendas: nenhum controle novo é obrigatório. Os filtros Mês/YTD/Ano passam a funcionar com a regra nova.
- Separação da carteira por **prazo** (atrasada / mês corrente / futura) em Peças: **fora desta entrega** (decidido em 26/10). Fica como evolução futura.
- O texto do glossário e das ajudas de "Valor de Peças" e de carteira precisa ser atualizado (hoje diz que a carteira considera o mês de referência).

## 7. Impactos e riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Validação do lote rejeitar data de entrega fora do mês do lote | A carga de outubro falharia com pedidos de março | Verificar a validação da importação antes de implementar; é o primeiro ponto a testar |
| Carga manual do mês corrente (planilha) sobrepõe o lote do robô | O lote é substituído por completo; a carteira manual traz só o critério antigo e a visão fica incompleta | Definir o procedimento: a carga manual do mês corrente também precisa trazer a carteira completa, ou o robô roda por último |
| `meses_frente > 0` | Carteira completa duplicada em meses futuros e dúvida sobre qual é a foto vigente | Ajustar a configuração e/ou definir a foto vigente pelo horário da carga, não pelo mês |
| Mudança de regra na transição | Entre aplicar o painel e a primeira carga nova, o painel mostra só a carteira de outubro como era antes | Aplicar a regra e rodar a carga no mesmo dia; reverter é simples (função anterior e consulta anterior) |
| MP estimado da carteira | Margem da carteira indicativa, principalmente em peças | Fora de escopo; manter o aviso já existente |
| Queda anormal | A trava de 30% pode bloquear a primeira carga se o total mudar muito | O total só aumenta; confirmar na primeira execução (usar simulação antes) |
| Relatórios fora da lista que também leem CART (margens, mapa, e-mails) | Números divergentes entre telas | Levantar todos os pontos de leitura de CART antes de codar |

## 8. Pontos em aberto (decidir antes do código)

1. ~~Como identificar a foto vigente~~ — **Decidido em 26/10/2026:** a foto vigente é o **mês de lote mais recente que tem carteira** (a de outubro vale até existir uma de novembro). Isso exige `meses_frente = 0` e a trava de mês fechado no robô, para nenhum lote futuro ou passado receber carteira completa.
2. ~~Virada de mês~~ — **Decidido em 26/10/2026:** aceitar. Entre o dia 1 e a primeira carga do novo mês, a foto vigente é a do mês anterior (no máximo um dia). Sem aviso nem carga extra.
3. ~~Carga manual~~ — **Decidido em 26/10/2026:** o mês corrente é sempre do robô; a carga manual (`Painel_Vecton.xlsm`) fica só para meses fechados. Consequência: o ajuste gerencial do faturamento de um mês só acontece depois que ele fecha. **Ressalva a resolver:** no fechamento (ex.: 1º de novembro, carregando outubro à mão) outubro ainda é a foto vigente até a primeira carga de novembro; o arquivo manual de outubro regravaria o lote com a carteira no critério antigo e deixaria a carteira incompleta nesse intervalo. **Procedimento de fechamento decidido:** primeiro roda a carga do robô do mês novo (novembro vira a foto vigente) e só depois se sobe a planilha do mês fechado (outubro). É regra de ordem de operação, sem mudança de ferramenta.
4. ~~Limpeza das fotos antigas~~ — **Decidido em 26/10/2026:** apagar, em **etapa separada**, só depois de a carteira nova estar funcionando e conferida. Com backup prévio e conferência, no estilo da carga 2023–2026 (backup, apaga só as linhas `CART` de meses anteriores ao mês vigente, confere). Até lá, as fotos antigas ficam no banco, ignoradas pelo painel. Nunca apagar o faturamento nem a foto vigente.
5. ~~Exibição por prazo em Peças~~ — **Decidido em 26/10/2026:** nada novo agora. Só a regra por mês (o Mês não soma atrasados; YTD e Ano somam). Quem quiser ver atrasados navega pelos meses anteriores. Um bloco de faixas de prazo (atrasada / mês corrente / futura) fica como evolução futura.

## 9. Fases sugeridas

1. **Verificações (sem alterar nada)**: validação do lote com data fora do mês, configuração `meses_atras`/`meses_frente`, levantamento de todos os pontos que leem CART.
2. **Simulação da nova consulta de carteira** (modo simulação do robô, que só gera CSV): comparar com o cálculo manual do Ricardo de 23/10.
3. **Robô + trava + migration do painel** no mesmo dia, com a primeira carga conferida.
4. **Peças**: separação por prazo e ajustes de glossário.
5. **Limpeza das fotos antigas de carteira** (decidida): etapa separada, com backup, só depois de a carteira nova estar conferida.
6. **Opcional, depois**: foto periódica de carteira para tendência.

## 10. Como validar

- Total da carteira nova em 23/10 = cálculo manual do Ricardo (por mês de entrega e por tipo).
- FAT de todos os meses idêntico antes e depois (linha a linha ou soma por mês).
- Painel em março mostra o faturamento do lote de março e a carteira de março prevista da foto vigente.
- YTD/Ano da carteira = soma dos meses individuais, sem contagem dupla.
- Em mês fechado, "Carregar agora" não grava carteira.
- Queda e bloqueios do runner continuam funcionando.

## 11. Reversão

- Robô: voltar a consulta e a trava anteriores; a carga seguinte regrava o mês corrente.
- Banco: voltar as definições anteriores das funções do painel (as versões da migration 254 estão no repositório).
- Dados: nada de passado é alterado, então não há restauração de dados a fazer.
