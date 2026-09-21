# Carga anual do Fluxo de Caixa

Entrada: **Parâmetros → Carga de Realizado → Fluxo de Caixa**.
O ano é o do cabeçalho principal. A carga sempre compreende janeiro a dezembro,
para a empresa inteira, independentemente do mês selecionado.

## Ativação

Aplicar `supabase/221_fc_annual_import.sql` após a migração 219 do Plano de Contas FC.
A migração 221 foi validada em PostgreSQL local de teste; sua execução no banco
do ambiente é uma etapa de implantação separada. Atualizar os assets da aplicação.

## Utilização e regras

1. Selecionar o ano e um Excel `.xls` ou `.xlsx` de até 20 MB. O nome é livre;
   a estrutura de contas, competências e classificações deve seguir o modelo FC.
2. Clicar em Importar arquivo. O sistema valida os 12 meses e as contas analíticas.
3. Sem erros, a aplicação é automática, inclusive a substituição do lote vigente
   do mesmo ano. Com erro de validação, nada é aplicado. Falha de aplicação permite
   tentar novamente com a mesma solicitação, sem duplicar dados.

- Os vínculos usam a descrição de origem e a hierarquia do Plano de Contas FC;
  não exigem códigos no Excel. Contas novas devem ser cadastradas antes da carga.
- Conta ausente ou célula vazia vale zero. Conta desconhecida, vínculo ambíguo,
  duplicidade, número inválido, conta inativa com movimento e fórmula sem resultado
  salvo bloqueiam a aplicação.
- Real/ACT, Fcst/FCST e Bud/BUD vêm do arquivo. Competência futura não pode ser
  Real, considerando a data do banco no fuso America/Sao_Paulo.
- Subtotais são calculados das analíticas. Saldo inicial explícito é usado quando
  presente; no modelo original, deriva do saldo de janeiro menos a geração de
  janeiro. Os demais fechamentos são calculados. Sinais do arquivo são preservados.
- Máquinas vendidas são quantidades inteiras não negativas.
- A substituição é por empresa/ano: exclui o lote anterior, seus movimentos,
  arquivo e auditoria na mesma transação. Outros anos são preservados. Erros
  revertem toda a operação. O arquivo local do usuário não é apagado.
- Mudança no plano ou na carga vigente durante a conferência exige nova validação.
  Repetir a mesma solicitação após falha de conexão não duplica dados.
- Carga permitida aos administradores e superadministradores, inclusive perfis
  adicionais, seguindo o cadastro do Vecton. Leitura segue a permissão do relatório.
- O dashboard lê a carga persistida e o retrato da hierarquia usado na aplicação.
  Mês/YTD incluem projeções; Ano e detalhe apresentam os 12 meses. Sem comparativo/Δ.

## Dados e verificação

`fc_import_batches` mantém uma carga vigente por empresa/ano. `fc_import_values`
guarda as analíticas. `fc_import_files` guarda o original privadamente, sem leitura
direta pelo cliente. `fc_import_events` registra a aplicação vigente.
Escritas somente pela RPC autorizada, com RLS nas tabelas.

Testes: `fcDashboard.test.js`, `fcDashboard.browser.test.js`,
`fcDashboard.integration.test.js` e `fcImport.sql.test.js`, na pasta `tests`.
Os dois últimos usam PGlite temporário (variável `FC_PGLITE_TEST_LIB` ou pacote
`@electric-sql/pglite`); os testes de navegador usam SheetJS (`FC_XLSX_TEST_LIB`
ou pacote `xlsx`) e Playwright/Edge. Somente dados sintéticos, sem backend real.

## Organização da tela

- Arquivo: seleção, validação e botão Modelo. O modelo XLSX usa o ano do cabeçalho
  e as contas do cadastro FC, sem dados reais. Revise as classificações sugeridas
  e preencha as analíticas e o saldo inicial; subtotais serão recalculados.
- Histórico: lotes vigentes de todos os anos, com arquivo e data de aplicação.
  A substituição mantém a regra de excluir o lote anterior do mesmo ano.
- Detalhe: conferência do arquivo validado e aplicação, ou consulta das contas,
  classificações e valores mensais do lote selecionado no histórico.

Esta organização reutiliza a migração 221; não requer nova migração.

## Notificações

Aplicar `226_fc_load_notifications.sql` para adicionar Carga de Fluxo de Caixa
aplicada em Parâmetros → Notificações. Segue os canais Sininho, E-mail e
Messenger e o controle Ativo. Padrão: sininho ligado, outros canais desligados.
O evento nasce no banco ao concluir a carga anual ou sua substituição, na mesma
transação. Retry idempotente não duplica avisos e rollback não publica eventos.
A mensagem informa ano, 12 meses, contas, arquivo e autor; o link abre cashFlow
no ano da carga, referência dezembro. E-mail usa a fila e o worker existentes.
