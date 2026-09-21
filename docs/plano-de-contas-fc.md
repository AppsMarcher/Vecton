# Plano de Contas FC

Em Parâmetros, o cadastro anterior passa a se chamar **Plano de Contas DRE**.
O **Plano de Contas FC** é independente e usa a mesma estrutura visual de árvore
e editor, com seleção da conta pai e realocação por arrastar e soltar.

## Estrutura inicial

Fonte: `FC.xlsx`, aba `FC 2026`. São **76 contas analíticas e 8 sintéticas**:

- Fluxo de Caixa Operacional
  - Entradas Operacionais
  - Saídas Operacionais, incluindo Comissões, Serviços de Terceiros e Impostos / Taxas
- Fluxo de Caixa de Investimentos
- Fluxo de Caixa Financeiro

Os vínculos seguem as fórmulas da planilha, inclusive Retenção 4,65% diretamente
em Saídas Operacionais. A linha 54, Serviços de Terceiros, é uma analítica dentro
do grupo de mesmo nome: está vazia em 2026, mas tem valores em anos anteriores.
As contas zeradas permanecem cadastradas. Máquinas vendidas, saldos bancários e
geração líquida não são contas analíticas de movimento.

Os oito grupos foram reconciliados com os valores previamente extraídos do Excel
nos 12 meses de 2026 (96 totais), sem diferenças acima de R$ 0,001.

## Cadastro

- Identificador interno UUID, sem exigir código na planilha.
- Nome de apresentação separado da descrição no arquivo de carga.
- Descrição de carga única entre as analíticas do mesmo pai, ignorando caixa e
  espaços repetidos. O caminho do grupo diferencia descrições iguais.
- Classe analítica ou sintética, conta pai, ordem, situação e observação.
- Origem e linha do Excel preservadas para rastrear o cadastro inicial.
- Analíticas recebem movimentos; sintéticas são agrupamentos calculados.
- Conta analítica não pode ter filhas nem ficar na raiz.
- Não é permitido criar ciclos ou vincular contas de empresas diferentes.
- Uma conta ativa não pode ficar sob um pai inativo.
- Para remover uma conta pai, suas filhas precisam ser removidas ou realocadas.
- Para inativar uma conta pai, suas filhas precisam estar inativas.

O cadastro pertence à empresa, sem filial, ano ou cenário. Real/Fcst/Bud e as
competências serão atributos dos movimentos na futura carga anual, não do plano.
Este incremento não implementa a carga nem os cálculos do dashboard.

## Persistência e acesso

Tabela `public.fc_plan_nodes`, separada de `dre_nodes` e `accounts`. Escrita
permitida apenas a membros ativos com perfil `admin` ou `super_admin`, primário
ou adicional. Leitura por membros ativos segue o padrão dos cadastros do Vecton.
A tela de Parâmetros permanece restrita aos administradores. RLS e validações
de hierarquia também são aplicadas no banco.

A migração `supabase/219_fc_chart_of_accounts.sql` cria o cadastro e insere a
estrutura em todas as organizações existentes. Um gatilho inicializa o plano
para novas organizações. O seed não é uma ação disponível ao navegador.

**Aplicar a migração 219 antes de publicar o frontend.** Ela está preparada neste
checkout, mas não foi executada no Supabase nesta implementação. Sem a tabela,
a tela apresenta erro de carregamento e permite tentar novamente; não simula
gravações nem usa localStorage como banco.

## Verificação

```powershell
node tests/fcPlan.test.js
node tests/fcPlan.browser.test.js
```

O teste de navegador usa Edge/Playwright com serviço de dados simulado: cobre
CRUD, busca com ancestrais, realocação, falha de gravação sem perda do formulário,
releitura, restrição de acesso e largura em tela pequena. Não substitui a
validação da migração e das políticas em um ambiente Supabase.
