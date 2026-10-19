# Versionamento de cenários por ano (DRE / Opex)

Data: 2026-10-19 · Status: aguardando revisão

## Objetivo
Desvincular as cargas de planejamento (Budget, Fcst etc.) do toggle de ano do cabeçalho. Cada versão passa a ter o **ano no nome** (banco e frontend), e o "Comparar com" lista versões de qualquer ano, inclusive Real × Real.

## Decisões acordadas
- O toggle do cabeçalho controla **só o Real** exibido.
- Todo cenário tem o ano no nome: "Budget 2026", "Fcst 5+7 2026". Vale no banco e no frontend.
- **Repositório único de cenários**: o Budget deixa de ser fonte especial (`budget_ledger_entries`) e vira cenário em `forecast_scenarios` / `forecast_ledger_entries`. Nunca existem dois cenários com o mesmo nome.
- Carga para cenário já com dados: avisa e **sobrescreve** (modos "completo" e "adicional" como hoje); nunca cria duplicado.
- **Estrela global**: um único favorito por organização. Sem estrela, o padrão é o cenário "Budget {ano do toggle}", se existir.
- Real continua em `actuals_*`; aparece como "Real {ano}", **só para anos com Real carregado**. Comparação Real × Real e cenário × Real é mês a mês, ano completo da fonte.
- Histórico de cargas **simplificado**: uma linha por carga (cenário, meses, arquivo, usuário, data, nº de linhas). Sem linhas do arquivo e sem "desfazer lote".
- Fora de escopo (ficam como estão): Headcount, Comercial, Fluxo de Caixa.
- Relatórios afetados: DRE (Real e Budget/Planejado), Opex, Dashboard, Cockpit.
- Sem relatórios personalizados de terceiros: manter o padrão e criar migration se necessário.

## Modelo de dados
- Nome único: `unique (organization_id, name)` em `forecast_scenarios`. Migration acrescenta o ano aos nomes existentes que não o têm; criação de novos cenários acrescenta o ano de `reference_year` automaticamente (sem duplicar se já digitado).
- Estrela: troca o índice único por ano (057) por único por organização (`where is_default`); a RPC `set_default_forecast_scenario` passa a ignorar o ano.
- Migração do Budget: para cada ano com dados em `budget_ledger_entries`, criar o cenário "Budget {ano}" (`cutoff_month = 0`) e copiar os lançamentos. Tabelas antigas permanecem intactas, somente leitura, como fallback. Conferência: totais conta × mês antes e depois da cópia devem coincidir.
- Nova tabela de histórico de cargas por cenário (enxuta).
- Índices de drilldown (centro de custo, conta) no ledger de cenário, equivalentes aos de 022/023.

## Camada comum de fontes
Uma função única monta a lista de fontes de qualquer seletor: cenários (todos os anos) + "Real {ano}" para anos com dados. Ordem: Real, depois cenários, ano decrescente. Valor da fonte: `real:{ano}` ou `scenario:{id}`; o valor legado `budget` é mapeado para "Budget {ano do toggle}".

## Carga
Destino sempre um cenário escolhido no Repositório; confirmação de sobrescrita quando há dados nos meses do arquivo.

## Etapas (cada uma independente e testável)
1. Banco: nomes com ano, nome único, estrela global, tabela de histórico, índices.
2. Cópia do Budget para cenários, com conferência de totais, sem apagar nada.
3. Camada comum de fontes e rótulos.
4. Carga: destino por cenário, confirmação de sobrescrita, histórico simplificado.
5. DRE e Opex lendo da camada comum.
6. Dashboard e Cockpit.
7. Desligar tabelas antigas de Budget (opcional, após validação).

## Riscos a conferir na etapa 1
- O ledger do Budget tem `branch_id`, `account_id` e `lot_code`; o de cenário só tem conta e centro de custo. Verificar se algum relatório de DRE/Opex depende de filial; se sim, adicionar a coluna ao ledger de cenário.
- Sem os índices de drilldown no ledger de cenário, o detalhamento ficaria lento.
- Nada é commitado nem aplicado em produção sem pedido explícito.
