# Dashboard de Fluxo de Caixa

Entrada no Vecton: **Relatórios Gerenciais → Fluxo de Caixa** (`cashFlow`). O
relatório também aparece na busca global e no catálogo de permissões. Reutiliza
`canSeeReport`: admin e gestor têm acesso; demais perfis precisam da concessão
prevista pelas regras do Vecton. A renderização também verifica o acesso, além
da visibilidade do card. Não há filtro de filial.

## Interface

- Referência comandada pelo seletor do cabeçalho principal, sem calendário paralelo.
- Visões Mês, YTD e Ano. A visão Ano apresenta os 12 meses; Mês e YTD incluem
  competências projetadas. Valores de saldo são posições, não somas de saldos.
- Indicadores de saldo final, geração líquida, caixa operacional e menor saldo.
- Evolução suavizada, roxa, sem rótulos permanentes. Tooltip por mouse ou teclado.
  Real/Fcst/Bud vêm da classificação do arquivo; projeções recebem fundo destacado.
- Saídas operacionais em ordem decrescente, com Demais saídas sempre por último.
- Ponte do FC com degradês para saldos, entradas e saídas.
- Demonstrativo sem Comparativo ou Δ, com R$ milhões no rodapé e acesso ao detalhe.
- FC detalhado com 12 meses, todas as analíticas, subtotais e saldos calculados;
  coluna final identificada pelo número do ano. Máquinas vendidas em unidades.

## Carga persistida

A tela lê a carga anual oficial de **Parâmetros → Carga de Realizado → Fluxo de
Caixa**. Não há importação local no dashboard. O seletor Carga oficial relê os dados do ano. Sem carga aplicada, a tela apresenta indicadores vazios.

A migração 221 cria a persistência anual, a substituição transacional e as
permissões. Consulte [Carga do Fluxo de Caixa](carga-fluxo-de-caixa.md) para
ativação, validações e regras de substituição.

O layout se adapta a telas menores. A inclusão no menu mobile dedicado (que hoje
possui seu próprio catálogo de módulos) é uma integração separada do catálogo
desktop de Relatórios.

## Validação

```powershell
node tests/fcDashboard.test.js
# FC_XLSX_TEST_LIB aponta para a biblioteca xlsx.full.min.js 0.18.5 já usada pelo app.
# Alternativamente, os testes podem resolver o pacote xlsx instalado no ambiente.
$env:FC_XLSX_TEST_LIB = "$env:TEMP/vecton-fc-xlsx-test.js"
node tests/fcDashboard.browser.test.js
# Requer também FC_PGLITE_TEST_LIB ou o pacote @electric-sql/pglite.
node tests/fcDashboard.integration.test.js
```

Fixtures usam valores sintéticos. Os testes cobrem leitura de Excel com outro
nome, cálculo, mudança pelo seletor real do cabeçalho, período projetado, Ano,
detalhamento, tooltip, layout, permissões e isolamento entre sessões. O teste de
integração carrega o index.html completo e bloqueia conexões ao backend real.

## Exportação

O botão Exportar substitui Atualizar e oferece Imprimir, Enviar por e-mail e
Baixar Excel. Usa os valores e o cenário em exibição, identificando alterações
não salvas. No detalhamento, exporta os 12 meses; no dashboard, a faixa Mês/YTD/Ano.
Excel contém valores numéricos, contas, subtotais e saldos; a impressão inclui
os gráficos quando aberta pelo dashboard. Quantidades continuam em unidades.

E-mail solicita Para, Cc, assunto e mensagem antes do envio e usa a mesma Edge
Function `send-report-email` do Painel de Vendas, com PDF gerado a partir do HTML.
Depende da configuração existente desse serviço. Não requer nova migração SQL.
