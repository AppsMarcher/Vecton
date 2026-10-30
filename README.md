# VectonPlan

SPA de planejamento financeiro, acompanhamento gerencial e gestão comercial da Marcher Brasil.

- Produção: https://vecton.marcher.com.br
- Frontend: HTML, CSS e JavaScript puro, sem framework ou bundler
- Backend: Supabase (PostgreSQL, Auth, REST, RPC, RLS e Edge Functions)
- Modelo de dados: multitenant por `organization_id`

## Estado da revisão — 30/10/2026

Documentação conferida com o código, histórico Git, módulos, migrations e testes deste checkout. A presença de um SQL ou de uma implementação no repositório não comprova sua aplicação no Supabase ou sua instalação no servidor do robô.

Principais evoluções recentes: planejamento com wizard de quatro etapas e CAPEX; escopo de leitura dos ledgers no banco; Balanço Patrimonial com cargas, drill-down e exportações; carteira vigente por entrega; exportador dos DREs; cadastro de cliente com IBGE; padronização de seletores, temas e tabelas. Detalhes nas seções abaixo.

## Visão geral

O VectonPlan cresceu de um app de planejamento financeiro para uma suíte de gestão. As principais áreas hoje:

1. **Dashboard executivo**
   - indicadores financeiros e de headcount;
   - gráficos e drill-downs;
   - ticker de mercado com câmbio, índices, juros, inflação e commodities.

2. **Cockpit de Gestão**
   - visão executiva por gestão/competência (Mês, YTD, Ano) com OPEX, Headcount e aderência ao comparativo favorito;
   - "Raio-X por Área": abre HC, Gasto com Pessoal e Demais OPEX por gestão/CC, com popover de detalhamento nominal de headcount;
   - dados 100% de fontes reais do Supabase (sem massa de demonstração); ver [docs/cockpit-gestao.md](docs/cockpit-gestao.md).

3. **Planejamento**
   - módulo participativo em `src/modules/planning/`: wizard, construtor de formulários, acessos por pessoa, digitação por CC e integração do cenário inteiro no DRE; usa as migrations `278–295` — ver [Planejamento participativo](docs/planejamento-participativo.md);
   - **repositório único de cenários** (Budget, Forecast, revisões), com o **ano no nome** ("Budget 2026", "Fcst 5+7 2026"); o Budget é um cenário como os demais — ver [Cenários versionados por ano](#cenários-versionados-por-ano);
   - combinação de realizado e meses replanejados;
   - **estrela global**: um cenário favorito por organização é o comparativo padrão;
   - consultas de DRE, OPEX e Headcount por cenário.

4. **Fluxo de Caixa**
   - plano de contas próprio (FC), independente do plano de contas do DRE;
   - carga anual via Excel, cenários editáveis (Forecast/Budget) e ponte com o DRE;
   - dashboard dedicado (Central de Relatórios → Fluxo de Caixa) com visões Mês/YTD/Ano e detalhamento mensal por conta;
   - ver [docs/carga-fluxo-de-caixa.md](docs/carga-fluxo-de-caixa.md), [docs/cenarios-fluxo-de-caixa.md](docs/cenarios-fluxo-de-caixa.md), [docs/dashboard-fluxo-de-caixa.md](docs/dashboard-fluxo-de-caixa.md) e [docs/plano-de-contas-fc.md](docs/plano-de-contas-fc.md).

5. **Gestão Estratégica (A3)**
   - Visão Executiva, Detalhe do A3 (KPIs real × meta, plano de ação, causas/contramedidas com anexos) e Preenchimento Mensal;
   - motor de cálculo autoritativo no banco (RPC), com versão mobile somente leitura;
   - material de apresentação em `docs/a3-apresentacao/`.

6. **RPS (acompanhamento semanal)**
   - **RPS**: lançamento semanal (S1–S5) de indicadores por área (Comercial, Industrial, Supply, RH, Financeiro, SAC/Garantias, Engenharia), com fórmulas calculadas, anexos e backup automático;
   - **RPS Comercial**: condução e registro da reunião comercial semanal em formato de ata, por região, independente do RPS de Gestão.

7. **Comunicação interna**
   - **Mensagens**: correio interno com presença, janelas de conversa flutuantes e anexos via Supabase Realtime;
   - **Notificações**: central (sino no header) alimentada por triggers do banco — lotes de carga (inclusive as automáticas), erros de carga automática, lembretes de RPS, KPIs fora da meta, ações estratégicas etc. A tela **Parâmetros → Notificações** mostra um cartão por tipo, **reordenável arrastando** (ordem salva por organização), e inclui o tipo agendado "Envio semanal do Painel de Vendas";
   - **Cargas automáticas**: um robô em `robo-cargas/` (Node.js, no servidor) carrega vendas e DRE do Protheus nos horários configurados, com botão "Carregar agora" em **Parâmetros → Carga de Realizado → Automatizadas** e envio semanal do Painel de Vendas por e-mail — ver [Cargas automáticas (robô)](#cargas-automáticas-robô-vendas-dre-e-bp).

8. **Central de relatórios**
   - DRE Societário, Gerencial e DFs;
   - realizado, budget e cenários;
   - OPEX e Headcount;
   - Report Builder com relatórios personalizados;
   - Painel de Vendas, Mapa de Vendas e Vendas – Distribuição Geográfica (mapa por UF, donut/heatmap, ranking de estados);
   - Ativações de Garantia (heatmap cidade×estado/revenda, preço médio por modelo, ranking de vendedores, estoque estimado de revenda);
   - Marcher no Campo (sell-out das revendas ao produtor, lido de `garantia_ativacoes`: vendas por mês, estados e cidades, clientes por CPF/CNPJ, revendas, vendedores, produtos, preços por modelo/região/estado/revenda, parcelas e financiamento; mesma restrição de acesso de Ativações de Garantia);
   - Evolutivo de Margens (MC1%, RL, MP e volume por nome reduzido, com mapa do portfólio, ponte da margem e tabela corrida, exportável em Excel, PDF e e-mail; restrito a Gestor, Admin e Super Admin).

9. **Parâmetros e cargas financeiras**
   - empresas e filiais;
   - plano de contas;
   - Balanço Patrimonial: Plano de Contas BP (códigos e chaves agrupadoras nas analíticas, sem exclusão de conta com saldo); carga consolidada Real e Planejado por Excel ou lote manual, com rascunho, aplicação e substituição por competência; relatório Real com Ativo/Passivo lado a lado, mês selecionado × dezembro anterior, classificação pelo plano vigente na carga e Reserva de Lucros vinda da conta 51401001 do DRE no ano em andamento e do saldo da carga BP em anos encerrados — migrations 301 a 307, ver [Balanço Patrimonial](docs/balanco-patrimonial.md);
   - gestões e centros de custos;
   - carga de realizado, planejado e headcount;
   - usuários e perfis de acesso;
   - Novidades: pop-up de lançamentos/campanhas exibido na abertura do app (carrossel de slides, imagem cheia ou cabeçalho+texto+imagem), com registro de quem já viu/dispensou cada anúncio;
   - Empresas, Plano de Contas DRE, Plano de Contas FC, Centros de Custos e Gestões pedem confirmação antes de efetivar Salvar/Remover, para evitar ajustes acidentais.

10. **Comercial**
    - cadastros de produtos, clientes, territórios, coordenações, tipos, culturas e linhas de negócio;
    - atribuição de responsáveis por território;
    - cargas de vendas realizadas (FAT, RL e MP por linha) e planejadas;
    - carga recorrente/aditiva de Ativações de Garantia (upsert, fonte AltForce; lê também as abas "Itens" e "Parcelas" da NF, ligadas por nº de série + nº da ativação, quando existem);
    - relatórios comerciais agregados no servidor.

O ticker usa PTAX do Banco Central para USD/EUR e Coinbase para BTC, além das fontes próprias dos demais indicadores; código em `src/modules/dashboard/marketTicker.js`.

### Aparência (tema Claro/Dark)

Preferência de tema por usuário (padrão Dark), salva em `localStorage` por ID de usuário, aplicada via atributo `data-vecton-theme` no `<html>`. Cobre shell, perfil, dashboards, relatórios, A3, RPS, Mensagens e mapas. Ver [docs/tema-claro.md](docs/tema-claro.md).

Cards usam aparência sem sombra e estilos de hover próprios de cada tela. RPS e BP dispensam o contorno azul nas tabelas; seletores e toggles usam fundo cinza nos dois temas. O seletor compartilhado de gestão/CC permite múltipla seleção em OPEX, Cockpit, CAPEX, formulários e Headcount do Dashboard.

## Como o frontend funciona

O projeto é uma SPA estática. Não existe etapa de compilação.

- `index.html` é o shell da aplicação e define a ordem de carregamento dos scripts.
- `app.js` é o orquestrador central: mantém o estado da sessão, instancia os módulos, injeta dependências e contém parte relevante dos relatórios e integrações Supabase.
- `styles.css` contém os tokens e estilos globais.
- `supabase-config.js` fornece URL, anon key e nome da organização.
- `seed-data.js`, `dre-structure.js` e `cc-structure.js` oferecem estruturas iniciais e fallback local.
- `src/core/` contém constantes, armazenamento local e utilitários compartilhados.
- `src/modules/` contém módulos IIFE publicados em namespaces `window.VECTON_*`.
- `robo-cargas/` **não faz parte do app web**: é um projeto Node.js à parte (com `package.json` próprio) que roda no servidor da empresa e conversa com o Protheus e o Supabase.

A ordem dos `<script>` em `index.html` é obrigatória: todos os módulos precisam estar carregados antes de `app.js`.

### Estrutura dos módulos

```text
src/
├── core/
│   ├── appearance.js  tema Claro/Dark
│   ├── constants.js
│   ├── pwa.js
│   ├── scenarioSources.js  fontes dos seletores: "Real {ano}" + cenários, nome com ano, fonte padrão
│   ├── storage.js
│   └── utils.js
└── modules/
    ├── actuals/       carga de realizado (seções Manuais e Automatizadas, `cargasAutomatizadasModule.js`)
    ├── announcements/ Novidades — pop-up de lançamentos/campanhas e admin de anúncios
    ├── auth/          login, sessão, convite e recuperação
    ├── balance/       BP: modelo, carga, relatório, drill-down e exportação
    ├── budget/        carga de planejado
    ├── cashflow/       Fluxo de Caixa (FC): plano de contas, carga, cenários, export e dashboard
    ├── cockpit/        Cockpit de Gestão (visão executiva por gestão/competência)
    ├── comercial/      cadastros e cargas comerciais (inclui Ativações de Garantia)
    ├── dashboard/      cards, gráficos e ticker de mercado
    ├── forecast/       cenários de planejamento
    ├── headcount/      renderização de headcount
    ├── messages/       correio interno (presença, anexos, Realtime)
    ├── mobile/         shell responsivo para telas < 767px
    ├── navigation/     navegação e visibilidade dos menus
    ├── notifications/  central de notificações (triggers do banco) e tela de configuração (cartões reordenáveis)
    ├── planning/      cenários participativos, formulários OPEX e CAPEX
    ├── params/         parâmetros administrativos e Plano de Contas FC
    ├── reports/        relatórios financeiros, comerciais, geográficos e builder
    ├── rps/            RPS — acompanhamento semanal por área
    ├── rpsComercial/   RPS Comercial — ata da reunião comercial semanal
    ├── strategic/      Gestão Estratégica (A3): dados, desktop e mobile
    ├── ui/             árvores, diálogos, header e eventos
    └── users/          usuários e concessões adicionais
```

## Execução local

O app deve ser servido como conteúdo estático. Um servidor HTTP local é preferível a abrir o arquivo diretamente, principalmente por causa de autenticação, redirects e chamadas externas.

Exemplo:

```powershell
python -m http.server 8080
```

Depois acesse `http://localhost:8080`.

Antes de executar, confira `supabase-config.js`:

```js
window.FORECASTAPP_SUPABASE = {
  projectUrl: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA_ANON_KEY",
  organizationName: "Marcher Brasil"
};
```

A anon key pode ficar no navegador. A `service_role` nunca deve ser adicionada ao frontend.

## Estado e autenticação

- A sessão Supabase é persistida em `localStorage` na chave `forecastapp-auth-session-v1`.
- O estado local usa `forecastapp-master-data-v2`.
- Quando o Supabase está configurado, linhas volumosas de importação não são persistidas no navegador.
- Tokens expirados são renovados com `refresh_token`; respostas `401` recebem uma tentativa automática após renovação.
- Links de convite, recuperação e confirmação são tratados por `authSession.js`.
- Usuário autenticado sem `user_profiles` é carregado com acesso mínimo de Analista, sem herdar o perfil salvo por outro usuário.

## Perfis de acesso

Papéis em `user_profiles.access_role`:

| Papel | Interface atual |
|---|---|
| `super_admin` | acesso total; pode administrar outros Super Admins |
| `admin` | parâmetros, cargas, usuários, planejamento, dashboard e relatórios |
| `manager` | dashboard e relatórios (inclui Evolutivo de Margens, mas não Ativações de Garantia nem Marcher no Campo, que são do `marketing`); OPEX/Headcount filtrados por gestão e concessões |
| `analyst` | sem dashboard e DRE consolidado; acesso restrito a relatórios por CC |
| `comercial` | entrada em Relatórios; Painel de Vendas, Mapa de Vendas, Ranking Geográfico e Performance de Peças. Não vê Ativações de Garantia, Marcher no Campo nem Evolutivo de Margens |
| `marketing` | entrada em Relatórios; somente Ativações de Garantia e Marcher no Campo (Admin e Super Admin também veem). Sem dashboard, planejamento, parâmetros ou cargas |

Concessões adicionais disponíveis no perfil:

| Campo | Uso |
|---|---|
| `management` | gestão principal |
| `extra_managements` | gestões adicionais com acesso pleno |
| `extra_cc_ids` | centros de custos avulsos |
| `extra_report_ids` | relatórios adicionais (matriz de Acessos adicionais): vale para qualquer relatório, inclusive os comerciais fixos, mesmo sem o perfil que o libera por regra; quem só tem concessão também vê o menu Relatórios |
| `extra_account_codes` | contas contábeis adicionais |
| `extra_branch_ids` | empresas/filiais adicionais |

Escopo de dados (gestões, empresas, contas e centros de custo): só Admin e Super Admin enxergam tudo. Os demais perfis veem a gestão própria e as concessões adicionais. Sem gestão ou CC autorizado, o escopo fica vazio. Na tela de usuários, o padrão do perfil aparece em azul e as exceções marcadas em verde. Relatórios de DRE, OPEX e Headcount concedidos a quem não é Admin/Gestor/Analista só aparecem se houver ao menos uma gestão ou CC marcado.

Os principais helpers ficam em `app.js`: `getAllowedManagements()`, `getPartialManagements()`, `getAllowedCcNumbers()`, `canSeeReport()` e `canSeeAccount()`.

### Atenção de segurança

O banco já reforça parte das restrições: a migration `281` protege os campos administrativos do próprio perfil; a `285` restringe a leitura de `forecast_ledger_entries` por gestão/CC; e a `299` aplica a mesma regra a `actuals_ledger_entries`. Administradores ativos (inclusive por papel adicional) leem tudo; demais usuários ativos leem apenas os CCs autorizados. Linhas sem CC ficam para administradores. As migrations `288–289` ajustam grants e fecham acesso anônimo às views comerciais.

Isso não equivale a isolamento completo de todos os relatórios: totais mensais consolidados e outros RPCs têm contratos próprios; a `299` preserva explicitamente `actuals_monthly_account_totals`. Audite RLS, grants e funções de cada caminho ao mudar acessos. Confira a aplicação dessas migrations no ambiente antes de assumir as proteções.

Exceção já aplicada: o RPC `comercial_margens_itens` (Evolutivo de Margens) valida o papel (`super_admin`, `admin` ou `manager`, inclusive `additional_access_roles`) no próprio banco, além de o card ficar oculto no frontend.

## Relatórios financeiros

### Cenários versionados por ano

Todo dado de planejamento do DRE/OPEX (Budget, Forecast, revisões) vive num **repositório único**: `forecast_scenarios` + `forecast_ledger_entries` (+ `forecast_monthly_account_totals`, mantido por trigger) e `forecast_headcount_entries` para o Headcount planejado. O Real continua em `actuals_*`.

Regras:

- O **ano faz parte do nome** do cenário, no banco e na tela ("Budget 2026", "Fcst 5+7 2026"). O nome é **único por organização**; ao criar um cenário o sistema acrescenta o ano de `reference_year` (sem duplicar se já digitado).
- O **toggle do cabeçalho controla só o Real**. Os seletores "Comparar com" (DRE Real, OPEX Real) e "Fonte" (DRE/OPEX/Headcount "Meta") listam fontes de **qualquer ano** e leem os dados **no ano da própria fonte** (cenário de 2026 continua lendo 2026 com o toggle em 2027). Dá para comparar Real × Real.
- Valores de fonte: `real:{ano}` (só anos com Real carregado, via RPC `list_actuals_reference_years`) e `scenario:{id}`. O valor legado `budget` é lido como o cenário "Budget {ano do toggle}".
- A **estrela** (`is_default`) é única por organização e define o comparativo padrão (DRE, Dashboard, Cockpit). Sem estrela, o padrão é "Budget {ano}".
- **Cargas**: o destino é sempre um cenário do ano da competência ("Budget {ano}" vem pré-selecionado). Carga completa sobre mês com dados pede confirmação e sobrescreve; nunca cria cenário duplicado. Cada carga grava uma linha em `scenario_load_log` (histórico simplificado, sem as linhas do arquivo e sem "desfazer lote").
- O **Comercial** (meta de vendas) usa os mesmos cenários: o Budget comercial também é o cenário "Budget {ano}" (`scenario_id` das tabelas `comercial_planejado_*`).

Pontos de código: `src/core/scenarioSources.js` (funções puras: `withYearSuffix`, `buildSourceOptions`, `parseSource`, `resolveDefaultSource`, `chooseSource`, `loadTargetsForYear`, `pickDefaultLoadTarget`) e, no `app.js`, o bloco `rowsForSource`/`resolveSourceRef`/`ledgerFullFetcherForSource` (entre os marcadores `BEGIN/END rowsForSource`), `fetchAllScenarios` e `fetchRealYears`.

Budget antigo: `budget_ledger_entries` e `budget_monthly_account_totals` foram copiados para o cenário "Budget 2026" (migration `272`) e estão **somente leitura** (trigger da `276`); nenhuma tela lê mais essas tabelas. `budget_import_batches`/`budget_import_rows` seguem como área de staging/validação da carga. Apagar as tabelas antigas é uma decisão à parte. Especificação e plano: `docs/superpowers/specs/2026-10-19-versionamento-cenarios-por-ano-design.md` e `docs/superpowers/plans/2026-10-19-versionamento-cenarios-por-ano.md`.

### Planejamento participativo

O módulo `src/modules/planning/` amplia o repositório de cenários com construção livre de formulários e preenchimento descentralizado. Não depende de modelos fixos. A documentação técnica e o roteiro de homologação estão em [Planejamento participativo](docs/planejamento-participativo.md).

- **Criação e cópia:** `+ Novo cenário` abre quatro etapas: Identidade, Período, Origem e Revisão. A identidade oferece nome, ano (atual, próximo ou +2), cor e ícone. O período define o início dos meses editáveis e o ano do Real de referência para os meses anteriores. A origem permite começar zerado ou copiar uma base. Formulários e acessos são configurados dentro do cenário, que nasce em construção.
- **Composição mensal:** cada um dos 12 meses recebe inputs de formulários ou um snapshot de Real/outro cenário. Budget pode começar com 12 meses zerados; Forecast pode combinar fontes. A fonte mensal fica imutável após a criação. Meses copiados ficam em leitura e mantêm o saldo no ano de destino.
- **Construtor:** linhas Digitado, Fórmula e Linha normal, com sequência, descrição, agrupamento visual e negrito. Para Digitado, a conta DRE analítica aparece antes da descrição; sua escolha sugere o nome da conta, preservando textos personalizados. Fórmulas usam a **sequência**, como `<1> + <2>`; não há campo de referência no cadastro. A migration `279` converte fórmulas antigas e mantém a coluna interna `formula_name` sincronizada apenas por compatibilidade. Há importação de contas e cópia de estruturas dentro do cenário.
- **Participação:** cada formulário tem acessos por pessoa, com Visualizar ou Lançar valores. O escopo de centros de custo é a interseção com as concessões do perfil. Um CC permite editar; vários mostram a soma em leitura. Visualizar não integra. Não há acesso geral por ausência de escopo.
- **Preenchimento:** grade de 12 meses, salvamento explícito, fórmulas locais, colagem tabular, navegação por teclado, repetição, distribuição em centavos, cópia entre centros autorizados e exportação dos valores salvos. Rascunhos locais dependem da revisão da estrutura; conflitos de versão (mesma linha, CC e mês alterados por outra pessoa) rejeitam o lote inteiro para revisão.
- **Integração:** qualquer participante com Lançar valores em formulário liberado pode integrar. Cada clique reconsolida **todos os formulários do cenário**, usando somente inputs salvos de linhas Digitado: antes de integrar, o botão salva a digitação pendente do formulário aberto (e a do FAT, se houver), de modo que a integração sempre reflete o que está na tela. Se o salvamento acusar conflito, a integração não segue. Substitui a projeção anterior sem duplicar valores e preserva snapshots; fórmulas não geram lançamentos. Despesas positivas e receitas negativas seguem a convenção do ledger. A estrela continua global por organização.
- **Proteções:** após haver valores salvos, sequência, origem, conta, fórmula e exclusão de linhas ficam protegidas. Descrição, agrupamento, negrito e novas linhas continuam disponíveis. Bloqueio manual/agendado impede alterações inclusive de administradores. A exclusão do cenário usa o diálogo padrão `VECTON_DIALOGS.appConfirm` e apresenta eventuais erros no app.
- **Banco:** tabelas de meses, formulários, linhas, acessos, inputs, execuções e auditoria; leitura com RLS e escrita por RPC (`planning_context`, `planning_read_form`, `planning_write`). Cenários gerenciados não são destinos de cargas por arquivo nem aceitam escrita pelos caminhos legados. A proteção dos campos administrativos de `user_profiles` está na migration `281`.

**Publicação:** conferir as dependências das migrations `278–295` e aplicar as correspondentes antes do frontend. A integração publica formulários liberados, mantém histórico e registra alterações posteriores à publicação; OPEX e CAPEX têm integração própria, com publicação de todos os CCs autorizada no servidor. As evoluções incluem salvamento em lote, renumeração de referências de fórmulas, cor do cenário e reordenação de linhas. O push não confirma conclusão do deploy nem homologação de perfis, conflitos e volume.

### CAPEX Meta

O planejamento inclui o formulário **CPX**, tipos e taxas, investimentos por CC, valores mensais e depreciação/amortização incremental. Um CC permite editar; vários consolidam em leitura. A integração publica a depreciação no DRE/OPEX, preservando as contribuições dos outros formulários. O investimento não alimenta automaticamente o DRE ou o Fluxo de Caixa.

**Capex Meta** está na seção CAPEX da Central e no cenário: seleção de fonte, agrupamento por gestão/tipo, seleção múltipla de gestões/CCs, drill-down e Excel. O RPC `planning_capex_report` aplica o escopo no banco sem expor taxas aos usuários comuns. Código em `src/modules/reports/reportsCapexModule.js`, migrations `290–298`. A documentação detalhada de planejamento ainda descreve a fase anterior ao relatório; para esse ponto, prevalecem o módulo e as migrations posteriores.

### DRE

- DRE Societário: estrutura baseada no plano de contas.
- DRE Gerencial: linhas gerenciais calculadas por grupos de contas.
- DRE DFs: apresentação baseada no modelo de demonstrações financeiras.
- Os relatórios "Meta" (Budget) escolhem a fonte entre os cenários do repositório (inclusive "Budget {ano}"); os relatórios Real têm o seletor "Comparar com" (Real de outro ano ou cenário). Nos três DREs Meta (Gerencial, Societário e DFs), o seletor fica à direita, na mesma posição dos DREs Real, sem a linha horizontal sob a barra.

Percentuais mensais são calculados contra a Receita Líquida do próprio mês. Na coluna `TOTAL`, o cálculo correto é ponderado:

```text
soma do numerador no período / soma da Receita Líquida no período
```

Essa regra é usada nos percentuais do DRE Gerencial e nas linhas `%RL` do DRE DFs.

### OPEX e Headcount

- Perfis restritos recebem filtros por gestão e centros de custos.
- O drill-down deve usar o mesmo recorte da tabela principal.
- O dashboard pode mostrar visão consolidada, mas o drill-down respeita as concessões do usuário.
- OPEX e Headcount "Meta" usam seletores de fonte com os cenários do repositório; o OPEX Real compara com Real de outro ano ou cenário. O OPEX Meta consolidado (Marcher, sem restrição de CC) lê o resumo conta × mês do cenário; gestão específica, acesso parcial ou perfil restrito leem o ledger por CC.
- O **Headcount planejado** vive no cenário (`forecast_headcount_entries`), no ano do cenário. O tipo "orçado" avulso (`headcount_entries`, `load_type=orcado`) foi descontinuado: as linhas de 2026 eram cópia do realizado e foram removidas (migration `275`). A carga de Headcount planejado também tem sempre um cenário como destino.
- A lista de contas do Headcount (`HC_PESSOAL_ACCOUNTS`, `app.js`) é fixa no código: 105 contas, incluindo `4220100003033` (COM_PRO-LABORE).
- A mesma conta `4220100003033` está no OPEX, grupo "DESPESAS COM PESSOAL - COM", via `report_account_assignments` (banco), sem duplicar. Atribuições feitas em Parâmetros > Plano de Contas são aplicadas por cima das listas fixas (`applyReportAccountAssignments`).

### Report Builder

`src/modules/reports/reportsBuilderModule.js` permite criar relatórios personalizados com:

- linhas e colunas configuráveis;
- filtros por conta, CC e gestão;
- fontes de realizado (`actual`, `hc_real`) e de cenários (`scenario:{id}`, `hcscenario:{id}`); o Budget é o cenário "Budget {ano}" e as fontes salvas com os valores antigos `budget`/`hc_budget` são resolvidas para ele;
- fórmulas e formatos numéricos;
- persistência em `custom_reports`.

## Comercial

Os nove cadastros comerciais (inclui **Municípios**, o mapa município → território da carga automática) compartilham `createCadastroModule()` em `comercialCadastroModule.js`. As configurações e dependências são fornecidas pelo `app.js`.

As cargas comerciais seguem o padrão:

```text
arquivo → batch → staging rows → validação → RPC de aplicação → ledger → auditoria
```

Principais tabelas:

- `comercial_realizado_import_batches`, `comercial_realizado_import_rows` e `comercial_realizado_ledger_entries`;
- `comercial_planejado_import_batches`, `comercial_planejado_import_rows` e `comercial_planejado_ledger_entries`;
- tabelas de auditoria correspondentes;
- a meta (planejado) é sempre de um cenário: `comercial_planejado_import_batches.scenario_id` / `comercial_planejado_ledger_entries.scenario_id` apontam para `forecast_scenarios`; o Budget comercial é o cenário "Budget {ano}" (antes era `scenario_id` nulo; migration `277`). O Painel de Vendas, o mobile, os relatórios comerciais e a carga listam só cenários do ano;
- `comercial_municipios_geo` para o mapa;
- `garantia_ativacoes` para a carga recorrente/aditiva (upsert) das ativações exportadas do AltForce.

Principais RPCs:

- `comercial_painel_vendas`
- `comercial_painel_tipos`
- `comercial_painel_detalhe`
- `comercial_mapa_vendas`
- `comercial_mapa_geografico_vendas`
- `comercial_margens_itens` (Evolutivo de Margens)

### Cargas automáticas (robô): vendas, DRE e BP

Desde 15/10/2026 o **mês corrente** de duas cargas roda sozinho: o robô em `robo-cargas/` (Node.js, no servidor) lê o Protheus (`MARCHER-BD`, somente leitura), cria o lote `complete` do mês e aplica pelo mesmo caminho da tela de carga:

| Carga | Fonte | Destino | Horários (hoje) |
|---|---|---|---|
| **Vendas** (FAT + CART) | `SD2/SD1/SC5/SC6…`; território pelo mapa **Parâmetros → Comercial → Municípios** (`comercial_regioes_municipio`) | `comercial_realizado_*` | `12:00` e `23:30` |
| **DRE** (razão contábil) | `CT2010`, contas `3` a `4zzz…`, moeda `01`, saldo tipo `1` | `actuals_*` | `10:00`, `15:00` e `19:00` |

A carga é sempre completa (apaga e regrava o mês). Os horários, a janela de meses e o liga/desliga de **cada** carga ficam em `carga_automatica_config` (uma linha por carga); a janela efetiva depende da configuração de cada job. Para vendas com carteira vigente, mantenha `meses_atras = 0` e `meses_frente = 0`.

Proteções: extração vazia e queda de mais de 30% nas linhas bloqueiam a carga; linha reprovada na validação não aplica nada; o robô só registra "aplicada" depois de conferir que o lote inteiro está no razão do Vecton. Sucesso gera o aviso "Carga de Vendas/Realizado aplicada" (marca "· carga automática"); erro gera "Carga automática com erro" por e-mail e sininho, com as linhas reprovadas agrupadas por motivo. Histórico em `carga_automatica_log`. Migrations `259`–`265`.

**Envio semanal do Painel de Vendas** (migration `265`): o robô também envia por e-mail, uma vez por semana, o **mesmo PDF** do botão "Enviar por e-mail" do Painel. Dia, horário, ativo e destinatários ficam em **Parâmetros → Notificações → "Envio semanal do Painel de Vendas"** (destinatários são usuários do Vecton). Como o HTML do relatório só existe no navegador, o robô abre o Vecton num **navegador sem tela** (Chrome ou Edge do servidor, via `playwright-core`; `relatorios.canal` no `config.json` — no servidor atual, `chrome`) com a sessão do usuário do robô, e usa dois ganchos do app:
- `window.VECTON_AUTOMATION` (`app.js`): `ready()` (o app terminou de carregar) e `openReport(id)` (abre o relatório e devolve se o usuário tem permissão), sem depender do link direto `?report=`;
- `window.VECTON_REPORT_AUTOMATION.comercialPainel` (`reportsComercialPainelModule.js`): `ready()` e `build()`, que entrega assunto, nome do arquivo e o **mesmo HTML** do botão (a Edge Function `send-report-email` gera o PDF e envia).

O Painel abre no **mês corrente** e escolhe o cenário **pelo nome** ("Fcst" ou "5+7", senão o primeiro do ano), como a tela; **não** segue a estrela de favorito do repositório de cenários. Falha gera o e-mail "Carga automática com erro" e o robô só tenta de novo depois de 1 hora; o resultado fica em `carga_automatica_log` (job `relatorio_painel_vendas`). Teste sem enviar: `node src/index.js relatorio --dry-run`. Detalhes em [`robo-cargas/README.md`](robo-cargas/README.md).

**Como o robô roda:** uma tarefa agendada do Windows (`Vecton - Robo de Cargas`, criada por `robo-cargas/instalar-tarefa.ps1`) chama `node src/index.js run` **a cada 5 minutos**; o próprio robô decide, pela configuração no Vecton, se há carga ou envio devido. Entra no Vecton com o usuário `robo.vecton@marcher.com.br` (perfil Administrador) e lê o Protheus com o login SQL `usr_robo_vecton`; as senhas ficam só em variáveis de ambiente (`VECTON_ROBO_SENHA`, `PROTHEUS_SENHA`), nunca em arquivo.

**Cache dos relatórios:** o DRE/OPEX guardam o ano em memória no navegador. Como uma carga do robô não passa pela tela, o cache é descartado quando chega aviso novo (o sino consulta a cada 60 s) e quando um pedido "Carregar agora" termina (`invalidateReportsAfterExternalLoad` em `app.js`).

Em **Parâmetros → Carga de Realizado** a tela tem duas seções: **Manuais** (cards de arquivo) e **Automatizadas** (um card por carga do robô, com status, horários, última execução e o botão **Carregar agora**, que grava um pedido em `carga_automatica_pedido`; o robô o atende em até 5 min). Código: `src/modules/actuals/cargasAutomatizadasModule.js`.

**Mapa município → território:** a carga de vendas resolve o território de cada cliente por **Parâmetros → Comercial → Municípios** (`comercial_regioes_municipio`, vinculada a `comercial_territorios`; carga inicial na migration `260`).

**Territórios `GO` e `MG` (28/10/2026):** `GO_MG NORTE` e `GO_MG SUL` foram renomeados para `GO` e `MG` pela migration `313`, preservando os IDs; ledger, atribuições e municípios apontam por `territorio_id` e não foram tocados. Os nomes antigos ficam só em arquivos históricos (`033`, `047`, `260` e `carga_vendas_2023_2026/`). As vendas dos vendedores `000274` (Renan Filipe → `GO`) e `000590` (Renan Borba → `MG`) são fixadas por código em `robo-cargas/src/territorio.js`, inclusive fora do território; a exceção em `robo-cargas/sql/vendas_mes.sql` não mudou. O painel (`PRINT_COL_LAYOUT`, em `reportsComercialPainelModule.js`) casa o card pelo nome do território, então app e robô precisam estar na versão nova após a migration. A migration `314` alinha o mapa de municípios à UF (UF GO → `GO`, UF MG → `MG`, Brasília/DF → `GO`): move 183 municípios de MG de `GO` para `MG` e 24 de GO de `MG` para `GO`. Ela só altera `comercial_regioes_municipio` (vale para as próximas cargas) e **não reprocessa** o razão: lançamentos já gravados mantêm o `territorio_id` da época da carga. Confirme a atualização de `territorio.js` no servidor do robô: a carga de vendas falha com "Territorio nao cadastrado" se ele ainda enviar o nome antigo.

Detalhes, instalação e operação: [`robo-cargas/README.md`](robo-cargas/README.md). Resumo para a TI: [`docs/robo-cargas-resumo-ti.pdf`](docs/robo-cargas-resumo-ti.pdf).

### Carteira vigente e cadastro comercial

A carteira (CART) é um estoque de pedidos abertos. A carga do mês corrente passa a trazer todas as entregas datadas, inclusive atrasadas e futuras; cargas de meses fechados trazem FAT. A view `comercial_realizado_ledger_vigente` seleciona a foto mais recente da organização até o mês corrente e redistribui CART pelo mês/ano de entrega: Mês, YTD e Ano respeitam esse calendário, sem somar fotos nem comparar carteira com período anterior. FAT mantém sua competência original.

Aplicar `311_carteira_vigente.sql` e depois `312_carteira_validacao_data.sql` antes de instalar o robô correspondente. A 312 dispensa a exigência de entrega na competência do lote para CART (inclusive manual), mantendo data obrigatória e a regra de competência para FAT. Pedidos sem entrega são excluídos e contados na simulação. Cadastros ausentes podem reprovar o lote inteiro; o erro agrupa clientes/produtos, documentos e valores afetados. A limpeza de fotos antigas e a limpeza de auditoria são scripts operacionais separados, não etapas automáticas do deploy.

Consulte [operação do robô](robo-cargas/README.md), [desenho da carteira](docs/superpowers/specs/2026-10-23-carteira-vigente-design.md) e [simulação para a TI](docs/robo-cargas-instrucao-ti-simulacao-carteira.md). A instrução de simulação registra uma etapa de implantação anterior; confirme o estado do servidor antes de executá-la.

O cadastro de clientes preenche IBGE a partir de cidade/UF e aceita nome truncado do Protheus quando há um único município compatível na UF. Devoluções aparecem com a linha inteira em vermelho nos detalhes do Painel e de Margens.

### BP sob demanda pelo robô

A migration `308` adiciona o job `bp` e competência ao pedido. O card **Carregar agora** permite escolher mês fechado; o job não tem horários automáticos e grava pelas RPCs `bp_save_draft`/`bp_apply_draft`. A extração usa CQ0 + CT2, em `robo-cargas/src/jobs/bp.js`. A `309` adiciona o aviso de carga aplicada. Simulação no servidor: `node src/index.js bp --mes=2026-09 --dry-run`; sem `--dry-run`, aplica dados. Consulte o README do robô antes de operar.

### Evolutivo de Margens

Relatório `comercialMargens` (`src/modules/reports/reportsComercialMargensModule.js`, migration `255`), no grupo Comercial do catálogo, logo após "Meta de Final de Ano". Restrito a Super Admin, Admin e Gestor (`CORE_COMMERCIAL_REPORT_IDS` e `COMERCIAL_EXCLUDED_REPORT_IDS` em `app.js`; também validado no RPC).

Definições:

- **MP** é o custo de matéria-prima da carga (colunas `rl` e `mp` do ledger, migration `253`); **MC1% = (RL − MP) ÷ RL**, recalculada no relatório. A coluna `mb_pct` gravada na carga 2023–2026 contém MP ÷ RL e **não** deve ser usada.
- Só entra faturamento realizado (`origem = 'FAT'`), líquido de devolução. Carteira (CART) fica de fora.
- Máquinas são agrupadas por `nome_reduzido` e por cultura (Grãos, Pecuária e Cargograin, este último como grupo próprio). Peças, Transgrain e Acessórios aparecem como linhas complementares, com desdobramento por código (30 maiores + "Demais itens").
- Na tabela os valores são **unitários** (÷ volume); linhas-pai são total ÷ volume total, nunca média de unitários.

Estrutura da página (três cards após os indicadores):

- **Indicadores** (volume de máquinas, FAT, RL, MP e MC1%), comparados com o mês anterior (YTD e Ano comparam com o acumulado até o mês anterior). O relatório abre em **Mês**, com o seletor do cabeçalho no mês anterior ao atual.
- **Posicionamento de Portfólio · Máquinas**: bolhas por nome reduzido (eixo X VOL ou RL; tamanho = margem em R$; rótulo só nas 8 maiores).
- **Ponte da MC1 · Marcher**: mês do filtro contra o mês anterior, com pop-over por barra (Volume, RL, MP e Mix). Máquinas e Transgrain entram item a item; Peças, Acessórios e demais complementares entram em bloco, com volume 1 nos dois meses (sem efeito de Volume nem de Mix; a variação de RL e de MP do bloco cai inteira em RL e MP), de modo que a ponte fecha com o DRE. **Volume = Δ unidades × margem/un média anterior** do grupo; **Mix** = mudança de composição (Δ un × margem/un da máquina menos a média) somada às máquinas novas e aos ajustes sem base; **RL** e **MP** = variação unitária × quantidade atual.
- **Evolutivo de Margens · Marcher**: tabela corrida com toggle VOL/FAT/RL/MP/MC1% e botão **Equipe Comercial** (Território, Coordenação ou Vendedor; mesmo componente do Mapa de Vendas), que filtra **só a tabela** via os parâmetros `p_territorio`, `p_coordenacao` e `p_vendedor` do RPC (migration `256`). Linhas 100% zeradas não aparecem.

O CSS do relatório usa o prefixo `cmm-` (isolado do Ranking Geográfico, que usa `cmg-`).

**Exportar** (botão ao lado do toggle Mês/YTD/Ano, mesmo padrão e altura do Painel de Vendas; `reportsComercialMargensExport.js`) exporta **somente a tabela Evolutivo de Margens · Marcher**. O módulo do relatório gera uma "foto" (`exportSnapshot`) com as 5 métricas e todos os itens por código, respeitando o filtro **Equipe Comercial**; a métrica e as linhas abertas da tela não influenciam o arquivo. Três formatos:

- **Baixar Excel** (ExcelJS, no navegador): VOL, FAT, RL, MP e MC1% **lado a lado**, cada bloco com `2025`, JAN–DEZ (meses depois do filtro vazios) e `2026`; só valores, sem coluna de variação. Nomes reduzidos, totais e subtotais na coluna do código; itens com o código na coluna A e o nome na B. Painéis congelados e A4 paisagem.
- **Imprimir** e **Enviar por e-mail** (mesmo HTML; no e-mail, o PDF é gerado no servidor): A4 **retrato**, **uma página por métrica**, só nomes reduzidos e totais, com as 14 colunas da tela e a variação ▲▼ abaixo do valor. A fonte e o espaçamento se ajustam ao número de linhas para caber em uma página (por volta de 70 linhas a fonte chega a ~5px).

O RPC devolve um único `jsonb` com as linhas agregadas por produto e mês (ano do filtro e o anterior); todas as visões são calculadas no cliente.

### FAT (projeção de vendas do Budget)

O formulário **FAT** lança volumes por região (território) e modelo, mês a mês; Peças é lançado em R$. Estado em `planning_fat_*`; código em `src/modules/planning/planningFat*.js`; migrations `316–319`, `321–324`, `328` e `330`.

- **Premissas:** FAT/un e MP/un por região e modelo vêm do histórico de vendas (`Atualizar premissas`), com ajuste manual (bolinha roxa) e fallback para a média Marcher. Impostos de referência por linha (`maq`, `tra`, `pec`, `ace`). RL = FAT − IPI − ICMS − PIS/COFINS; em Peças, sem IPI. Volume de modelo sem premissa conta em VOL e é sinalizado com bolinha vermelha piscando.
- **Acesso e visões:** matriz de acesso por coordenação (Visualizar ou Lançar). O formulário abre por perfil: Marcher (quem enxerga o todo), Coordenação ou Região. Há total de Máquinas (só Grãos, Pecuária e Cargograin) e Excel no modelo do Evolutivo de Margens.
- **Integração:** o botão único **Integrar no DRE e OPEX** integra OPEX, CAPEX e FAT na mesma chamada (`planning_integrate_all`), grava o FAT no DRE sem centro de custo e atualiza a meta por modelo. Antes de integrar, qualquer formulário salva a digitação pendente.
- **Painel de Vendas:** a carga de planejado alimenta os volumes do FAT e, no sentido inverso, o volume salvo no FAT ajusta a meta do Painel (`328`). Na carga, valor e MC1% vazios assumem as premissas do cenário (`326–327`); o antigo %MB passou a se chamar MC1%.

## Supabase e migrations

As migrations estão em `supabase/` e devem ser aplicadas em ordem. O checkout atual vai de `001` até `331`, com 337 arquivos SQL numerados na raiz de `supabase/`. Há também diagnósticos, referências, cargas históricas e scripts operacionais; não execute todos indiscriminadamente.

Resumo por fase:

| Faixa | Escopo |
|---|---|
| `001–010` | organização, usuários, empresas, contas, CCs e estruturas DRE/CC |
| `011–017` | carga e ledger de realizado/budget financeiro |
| `018–024` | RBAC, concessões adicionais, gestões, índices e RPC do dashboard |
| `025–031` | relatórios personalizados, forecast e correções de integridade |
| `032–037` | cadastros e seeds comerciais |
| `038–042` | cargas comerciais realizadas e planejadas |
| `043–049` | painel comercial, detalhe e regras de validação |
| `050–055` | geodados, Mapa de Vendas, perfil Comercial e cidade/UF no detalhe do painel |
| `056–057` | totais mensais de forecast e cenário favorito |
| `058–091` | motor de Report Builder comercial (bateu/levou, campanhas, peças por vendedor, eixos de linha/coluna/mês) — a maior parte reescrita ou removida por migrations posteriores dentro da própria faixa (ver `075–077` removendo o catálogo "bateu/levou" antigo) |
| `088` | `cost_center_management_free_text` — CC ganha campo livre de Gestão (base do agrupamento "Marcher" no Cockpit) |
| `092–101` | Notificações e Mensagens internas (Messenger): schema, realtime, anexos, presença |
| `102–108` | RPS: snapshots semanais, anexos e backup resiliente agendado |
| `109–126` | papéis de acesso adicionais, mapas geográficos comerciais (máquinas, peças), `market_commodities`, `password_reset_requests` |
| `127–177` | Gestão Estratégica (A3): schema, motor de cálculo, RPCs, RBAC por gestão, catálogo e KPIs 2026, séries acumuladas |
| `178–187` | canal de notificação do Messenger, concorrência/permissões do RPS, ajustes finos do A3 |
| `188` | `report_account_assignments` — atribuições extras de conta aos grupos do catálogo OPEX (além do `OPEX_STRUCTURE` hardcoded em `app.js`) |
| `189` | ajuste no relatório geográfico de peças |
| `190–204` | limpeza de cargas sobrepostas no ledger (ETL em etapas: staging, índices, delete em lotes, finalização) |
| `205–217` | manutenção de banco (`VACUUM FULL` em etapas) |
| `218` | correção de policies RLS permissivas duplicadas (performance) |
| `219–230` | Fluxo de Caixa (FC): plano de contas, carga anual, cenários (inclusive compartilhados), notificações de carga |
| `219` | também usado por `rps_capture_backup_purge_expired_locks` (numeração duplicada, ver abaixo) |
| `231–232` | rótulos de notificação (DRE, e-mail) |
| `233–236` | RPS Comercial: schema, storage, lembrete agendado, comentários por anexo |
| `237` | `garantia_ativacoes` — base da carga e do relatório de Ativações de Garantia |
| `238–239` | Novidades (`product_announcements`, slides e dismissals) — pop-up de lançamentos e tela de administração |
| `240–241` | evolução mensal de Peças (com meta) na Performance Geográfica comercial |
| `242` | RPS Comercial — área Comercial Pecuária |
| `243` | `comercial_painel_detalhe` passa a devolver `entry_date` — coluna Data no drill-down de transações do Painel de Vendas |
| `244` | `comercial_painel_detalhe` passa a devolver `documento`/`serie_documento` — coluna Documento no mesmo drill-down |
| `245` | `comercial_report_movements` passa a devolver `documento`/`serie_documento` — coluna Documento no popover de movimentos das campanhas Bateu/Levou e Final de Ano |
| `246` | Top Clientes da Performance de Peças passa a trazer o faturamento do mesmo período do ano anterior (variação YoY) |
| `247` | `user_profiles` ganha a preferência de aparência (tema Claro/Dark) |
| `248` | Fluxo de Caixa: retenção em Impostos e Taxas |
| `249–251` | ajustes do Painel de Vendas (slot "A definir" e gestor de Pecuária sem órfão; reaplica o nome atual do vendedor) |
| `251–252` | Ativações de Garantia: UF exterior e quantidade |
| `267` | Ativações de Garantia: CFOP, CPF/CNPJ do destinatário, forma de pagamento, financiamento, preço da máquina (aba Itens) e parcelas |
| `268` | card "Marcher no Campo" na mesma seção de Ativações de Garantia no catálogo de relatórios |
| `269` | perfil de acesso `marketing` (enum `access_profile_role`; rodar sozinho, sem transação) |
| `270` | Evolutivo de Margens aceita quem tem `comercialMargens` em `extra_report_ids` (funções `comercial_margens_itens`/`_detalhe`) |
| `253` | `rl` e `mp` no staging e no ledger de vendas realizadas (novo layout FAT/RL/MP) |
| `254` | carteira (CART) entra só pelo mês de referência no Painel e Peças |
| `255` | RPC `comercial_margens_itens` e posição do card Evolutivo de Margens no catálogo |
| `256` | `comercial_margens_itens` ganha o filtro Equipe Comercial (`p_territorio`, `p_coordenacao`, `p_vendedor`), usado só pela tabela Evolutivo de Margens |
| `257–258` | código do cliente nas Ativações de Garantia; detalhe do Evolutivo de Margens |
| `259–265` | carga automática de vendas e DRE e envio semanal do Painel de Vendas (robô): `carga_automatica_config`/`carga_automatica_log`, mapa `comercial_regioes_municipio` (+ carga inicial), avisos de carga aplicada e de erro, pedidos "Carregar agora" (`carga_automatica_pedido`) |
| `266` | `notification_settings.sort_order` — ordem dos cartões da tela Parâmetros → Notificações (arrastar para reordenar, por organização) |
| `271` | cenários versionados por ano: ano no nome, nome único por organização, estrela global (`set_default_forecast_scenario` ignora o ano) |
| `272` | copia o Budget (`budget_ledger_entries`) para o cenário "Budget {ano}" (idempotente) |
| `273` | RPC `list_actuals_reference_years` (anos com Real carregado, para as opções "Real {ano}") |
| `274` | `scenario_load_log` — histórico simplificado de cargas por cenário |
| `275` | remove o headcount "orçado" de 2026 (cópia do realizado) de `headcount_entries` e seus lotes |
| `276` | trava a escrita em `budget_ledger_entries`/`budget_monthly_account_totals` (somente leitura); aplicar depois do deploy do app |
| `277` | Budget comercial (`scenario_id` nulo) vira o cenário "Budget {ano}"; `comercial_pecas_geo_evolucao_mensal` lê a meta desse cenário |
| `278` | Planejamento participativo: formulários, acessos, inputs, meses, auditoria, RPCs/RLS e proteção dos campos administrativos do perfil |
| `279` | converte fórmulas para referências por sequência (`<1> + <2>`), sincroniza a referência interna e invalida revisões antigas |
| `280` | criação de cenário pela RPC passa a persistir o ícone escolhido no wizard |
| `281–287` | proteção de perfis; integração/favorito; save em lote; referências; escopo do ledger de cenários; cor e ordenação |
| `288–289` | grants da Data API e fechamento do acesso anônimo às views comerciais |
| `290–295` | CAPEX, destinos/contas, marca de integração, autoria e integração completa |
| `296–298` | seção CAPEX, relatório e escopo de leitura |
| `299` | leitura do ledger realizado por gestão/CC |
| `300–307` | BP: catálogo, plano, seed, cargas/rascunhos, contas opcionais/adicionais e proteção de saldos |
| `308–310` | carga BP sob demanda, notificação de carga e sininho do envio semanal de vendas |
| `311–312` | foto vigente da carteira por entrega e validação de datas CART |
| `313` | renomeia os territórios `GO_MG NORTE` → `GO` e `GO_MG SUL` → `MG` (mesmos IDs; aplicada no Supabase do app em 28/10/2026) |
| `314` | mapa de municípios de GO/MG passa a seguir a UF (183 de MG → `MG`, 24 de GO → `GO`); não reprocessa o razão |
| `315` | correção pontual do razão: 5 lançamentos de 2023 (Itumbiara e Mineiros/GO) gravados em `MG` passam para `GO`, conforme o mapa da `314` |
| `316`–`319` | FAT (projeção de vendas do Planejamento): formulário `fat`, regiões por território, premissas do histórico, percentuais de impostos, integração conta × mês somada ao formulário 08 e meta por modelo |
| `320` | o bloqueio do cenário de planejamento não vale para administradores |
| `321` | administrador pode renomear o formulário FAT (o código `FAT` continua reservado) |
| `322` | acesso do FAT por coordenação (`planning_fat_coord_access`) em vez de por região |
| `323` | carga de planejado alimenta os volumes do formulário FAT do cenário |
| `324` | grupo Acessórios no FAT (impostos `ace`, conta `31101006`) |
| `325–326`, `329` | carga de planejado só de volume (Peças continua exigindo valor); valor e MC1% vazios assumem as premissas e os impostos do cenário; a `329` corrige o `valor := 0` herdado da `325` |
| `327` | o razão da carga de planejado é recalculado quando premissas ou impostos do cenário mudam |
| `328` | FAT → Painel: volume salvo ou apagado no FAT ajusta a meta do Painel de Vendas (lote manual "Ajustes do formulário FAT"); FAT e Painel ficam sempre iguais |
| `330` | leitura do FAT informa se a pessoa enxerga o todo (admin, coordenação MARCHER ou todas as coordenações), para abrir em Marcher, Coordenação ou Região |
| `331` | formulários de Planejamento aceitam até 1000 CCs por leitura (antes 100, o que quebrava a seleção "Marcher") |

### Divergências conhecidas do schema

- Numeração duplicada: `025` (`025_create_custom_reports.sql` e `025_extra_managements.sql`), `074` (`074_comercial_report_movements_segment.sql` e `074_remove_legacy_bateu_levou_catalog.sql`), `219` (`219_fc_chart_of_accounts.sql` e `219_rps_capture_backup_purge_expired_locks.sql`), `307` (`307_bp_add_accounts_marcher.sql` e `307_bp_protect_accounts_with_balances.sql`), `314` (`314_municipios_go_mg_territorio_por_uf.sql` e `314_painel_detalhe_ordem_estavel.sql`) e `251` (`251_comercial_painel_pecuaria_gestor_nao_orfao.sql` e `251_garantia_ativacoes_uf_exterior.sql`). A ordem entre pares com o mesmo número precisa ser controlada manualmente (checar `created_at`/histórico do Supabase, não o nome do arquivo).
- O frontend usa `headcount_import_batches`, `headcount_import_rows`, `headcount_entries` e `forecast_headcount_entries`, mas as migrations de criação dessas tabelas continuam fora deste checkout.
- `supabase/README.md` ainda documenta somente a base inicial e não é a fonte completa do schema atual.
- Os arquivos `_diag_*.sql` (9) e `exportar_produtos_csv.sql` são diagnóstico/utilitário avulso, não migrations de produção.

Antes de alterar contratos de Headcount, valide o schema real do projeto Supabase e traga a definição correspondente para o repositório.

## Edge Functions

Funções disponíveis (`supabase/functions/`):

| Função | Uso |
|---|---|
| `invite-user` | cria o usuário no Auth, membership e perfil |
| `resend-invite` | reenvia o convite original |
| `set-user-password` | admin define a senha de outro usuário conforme a hierarquia |
| `set-user-active` | ativa/desativa acesso — além da coluna `is_active`, bane o usuário no GoTrue (`auth.admin ban_duration`) |
| `forgot-password` | "Esqueci minha senha" self-service da tela de login (público, sem sessão) |
| `resend-password` | botão "Reenviar senha" no painel de Usuários (exige sessão de admin/super_admin) |
| `market-commodities-worker` | roda 1x/dia via `pg_cron`, busca soja/milho/boi gordo no GiroRural e grava em `market_commodities` (substitui o scraping por iframe da CEPEA, bloqueado por Cloudflare desde 2026-08) |
| `rps-backup-manager` / `rps-backup-worker` | backup semanal agendado dos dados de RPS — ver [docs/rps-backup-recuperacao.md](docs/rps-backup-recuperacao.md) |
| `send-notification-emails` | drena a fila `notification_email_outbox` (preenchida por trigger) e envia cada item via Resend |
| `send-report-email` | gera PDF de relatório (Browserless) e envia por e-mail via Resend; chamada pelo botão "Enviar por e-mail" e pelo robô (envio semanal do Painel de Vendas) |

As funções usam `service_role` somente no servidor e validam manualmente o token do chamador.

### Layout padrão dos e-mails

Todo e-mail do sistema usa o mesmo layout **claro corporativo**, com a logo Vecton Planning no topo, rótulo azul, título, texto, botão opcional, caixa de destaque opcional, rodapé e o mascote Marcher:

| Origem | Função / arquivo |
|---|---|
| avisos de notificação (cargas aplicadas, erro de carga automática, lembretes de RPS, A3…) | `send-notification-emails` |
| e-mail do relatório com PDF (botão "Enviar por e-mail" e envio semanal do Painel de Vendas) | `send-report-email` (etiqueta "Relatório", rodapé "Relatório em anexo (PDF)") |
| convite, reenvio de convite, esqueci a senha, reenvio de senha | `invite-user`, `resend-invite`, `forgot-password`, `resend-password` |
| e-mails do próprio Supabase Auth (confirmar cadastro, convite, redefinir senha) | modelos HTML em `supabase/email-templates/` (colados no painel do Supabase) |

- **Imagens:** `assets/email/logo-vecton.png` e `assets/email/mascote.png`, servidas pelo GitHub Pages do app (`https://vecton.marcher.com.br/assets/email/`).
- **Código replicado:** cada Edge Function é publicada sozinha (o deploy pelo painel do Supabase não resolve `import` fora da pasta da função), então o bloco `buildEmailLayout` (opções `tag`, `title`, `paragraphs`, `buttonLabel`/`href`, `noteTitle`/`note`, `fallbackLink`, `footer`) existe **copiado nas seis funções** acima e nos modelos HTML. Ao alterar o layout, aplique a mesma mudança em todos, e depois publique cada função (`supabase functions deploy <nome> --no-verify-jwt`): o código na `main` não muda o e-mail enquanto a função não for publicada.
- Texto dos e-mails de notificação: gerado no banco (triggers e `run_scheduled_notifications`), gravado em `notification_email_outbox` e apenas formatado pela função.

### Envio de relatório por e-mail

DREs DFs e Gerencial (Real/Meta) e BP também oferecem exportações por Excel, impressão/PDF e e-mail. O exportador compartilhado fica em `src/modules/reports/dreExport.js`/`dreExport.css`; o BP usa `src/modules/balance/bpExport.js`. Os modelos preservam cabeçalho e assinatura contábil, com BP em A4 retrato.

A tela **Enviar por e-mail** é única (`src/modules/reports/reportEmailModal.js`, `window.VECTON_REPORT_EMAIL`), extraída do Painel de Vendas, e usada pelos relatórios com envio, incluindo **Painel de Vendas**, **Fluxo de Caixa**, **Evolutivo de Margens**, **BP** e os **DREs**. Cada relatório informa só subtítulo, assunto, texto, nome do anexo e como montar o HTML (`buildHtml`); o módulo cuida da validação, do autocomplete dos destinatários lembrados (localStorage, compartilhados entre os relatórios), dos alertas e da chamada à Edge Function `send-report-email`. Um novo relatório com envio deve usar esse módulo, não criar outra tela.

Exemplo de deploy:

```powershell
supabase functions deploy invite-user --no-verify-jwt
supabase functions deploy resend-invite --no-verify-jwt
supabase functions deploy set-user-password --no-verify-jwt
```

## Importações e performance

Padrões adotados:

- paginação keyset por UUID (`id=gt.<ultimo_id>&order=id.asc`);
- chunks de upsert para arquivos grandes;
- agregações server-side quando o volume é elevado;
- índices por organização, período e ID;
- staging separado do ledger oficial;
- auditoria de batches, linhas e lançamentos aplicados.

Regra de manutenção: otimizações e correções do Realizado devem ser avaliadas também no Budget/Planejado equivalente.

## Cache-busting e deploy

Arquivos locais são referenciados em `index.html` com `?v=YYYYMMDD[sufixo]`.

### PWA para desktop

O Vecton é instalável pelo Chrome e Edge como aplicativo de desktop. O botão
de instalação aparece no cabeçalho quando o navegador libera o evento de
instalação. A configuração fica em `manifest.webmanifest`, `sw.js` e
`src/core/pwa.js`.

O service worker armazena somente o shell e os assets estáticos da mesma
origem. Supabase, autenticação e dados financeiros continuam dependentes da
rede e não são persistidos pelo cache do PWA. Ao alterar a lista inicial de
assets, incremente também o sufixo de `CACHE_NAME` em `sw.js`.

Versões relevantes neste checkout:

- `styles.css?v=20261023hc4`
- `app.js?v=20261026bpdrill1`

Cada módulo em `src/` carrega seu próprio `?v=`, atualizado independentemente (ver a lista completa de `<script>` em `index.html`); não é preciso subir a versão de `app.js` para publicar um módulo isolado, só a do(s) arquivo(s) alterado(s).

Ao publicar uma alteração:

1. valide a sintaxe dos arquivos modificados;
2. atualize o `?v=` somente dos assets alterados;
3. publique os arquivos estáticos;
4. confirme o carregamento da nova versão no navegador;
5. para mudanças de banco, aplique a migration antes de liberar o frontend dependente dela.

## Validação rápida

Não há `package.json`/npm scripts. Antes de entregar uma alteração, execute ao menos:

```powershell
node --check .\app.js
```

Para validar todos os módulos JavaScript:

```powershell
Get-ChildItem .\src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

### Testes

A suíte também cobre BP (modelo, Excel, importação, relatório, plano e SQL), CAPEX, carteira vigente/validação/limpezas, exportações DRE, seleção de CC, IBGE de clientes, avatar e viewport do login. Dependências SQL e de navegador variam por arquivo; consulte os caminhos e variáveis declarados no próprio teste.

`tests/` tem 54 arquivos, cada um executável isoladamente com `node tests/<arquivo>.test.js` (sem framework — usam `assert` puro e `vm.runInNewContext` para carregar o módulo sob teste isolado do resto do app; massa de dados em `tests/fixtures/`). Os arquivos `*.browser.test.js` sobem uma página real via Playwright (consulte cada arquivo: há testes que usam Edge/Chrome instalado e dependências locais em `artifacts/`). Cobrem principalmente: Cockpit (`cockpit.test.js`, `cockpitService.test.js`), Fluxo de Caixa (`fcDashboard.*.test.js`, `fcPlan.*.test.js`, `fcImport.sql.test.js`), tema Claro/Dark (`appearance*.test.js`), RPS (`rpsConcurrency.test.js`, `rpsLayout.test.js`), Mensagens (`messagesAppearance.test.js`, `messagesPresencePicker.test.js`), mapas (`mapAppearance.test.js`, `floatingScrollbar.browser.test.js`) e cenários versionados por ano (`scenarioSources.test.js`, `reportsSources.test.js`, `budgetScenarioTarget.test.js`, `comercialScenarioSource.test.js`, `reportsBuilderBudget.test.js`; além de `opexPlannedManagement.test.js` e `cockpitService.test.js`, ajustados). O Planejamento participativo tem `planningCore.test.js` (aritmética, dependências, ciclos e centavos), `planning.sql.test.js` (PostgreSQL isolado/PGlite: migrations de planejamento, permissões, conflitos, integração, conversão de fórmulas e ícones) e `planning.browser.test.js` (Edge isolado com RPCs simuladas: grade, salvamento, fórmulas, acessos e wizard de quatro etapas). Esses testes não gravam em produção; instruções e dependências estão em [Planejamento participativo](docs/planejamento-participativo.md). Os SQL de verificação das migrations ficam em `supabase/tests/` (somente leitura: `271`, `272`, `275`, `277`). Ainda não há um runner único nem integração com CI — rode os arquivos relevantes à mudança manualmente.

**Robô de cargas** (`robo-cargas/`): `npm test` na pasta executa a suíte de vendas, DRE, relatórios e BP (`node --test`): território, janela de meses, montagem do SQL, normalização de DRE/vendas, agrupamento de erros, agenda semanal e um teste com **navegador real** (Edge/Chrome) contra uma página de teste, que prova a injeção da sessão e a leitura do HTML. Não precisam de banco nem de Protheus.

Também confira:

- se todos os scripts de `index.html` existem;
- se a ordem de carregamento foi preservada;
- se o cache-busting foi atualizado;
- se o fluxo funciona para Admin e para pelo menos um perfil restrito;
- se tabela principal e drill-down usam o mesmo recorte de acesso;
- se mudanças de relatório mantêm Realizado, Budget e Forecast coerentes.

### Conferência local desta revisão (28/10/2026)

Sintaxe dos 88 arquivos JavaScript do app/SW/módulos validada; nenhum script local ausente em `index.html`. No robô, `npm test`: 58 testes, 57 aprovados, um teste de navegador ignorado por indisponibilidade do ambiente. Nove testes direcionados de regras e modelos passaram (planejamento, fontes de relatórios, serviço do Cockpit, BP, margens e seletor de CC). Os testes `cockpit.test.js` e `dreExport.test.js` não concluíram a abertura do Edge no sandbox; isso impede confirmar a validação visual nesta execução. Esta revisão não consultou o banco de produção nem confirmou a instalação do robô no servidor.

## Limitações e dívida técnica

- `app.js` ainda concentra grande parte da aplicação e deve ser alterado em etapas pequenas.
- A arquitetura depende de globais `window.VECTON_*` e da ordem manual dos scripts.
- O app web não tem package manager (`package.json`), bundler ou linter (o robô `robo-cargas/` tem o seu `package.json`). Há uma suíte de testes (`tests/`, 54 arquivos), mas sem runner único nem CI — ver [Testes](#testes).
- Parte do schema de Headcount não está versionada nas migrations deste checkout.
- `budget_ledger_entries` e `budget_monthly_account_totals` ficaram congeladas (somente leitura, migration `276`) e sem leitores no app; podem ser apagadas quando o histórico não for mais necessário.
- Opex "Meta" por gestão contra um cenário grande (ex.: Forecast com ~46 mil lançamentos) pagina o ledger inteiro e pode levar alguns segundos.
- A tela "Perfis de Acesso" é principalmente descritiva; contadores e botões "Ver usuários" ainda não possuem integração própria.
- O XLSX é carregado por CDN externa.
- As regras de leitura por perfil ainda precisam ser reforçadas no banco (ver [Atenção de segurança](#atenção-de-segurança)).
- Há lançamentos de Realizado/Forecast em contas de OPEX sem centro de custo vinculado (import de origem incompleto) — caem em "Sem gestão cadastrada" no Cockpit; ver [docs/cockpit-gestao.md](docs/cockpit-gestao.md).
- Há cinco blocos de migrations numerados em duplicidade (`025`, `074`, `219`, `251`, `307`) — a ordem de aplicação entre o par não é dada pelo nome do arquivo.

## Pontos de entrada para manutenção

| Tipo de ajuste | Arquivos principais |
|---|---|
| navegação e menus | `navigationModule.js`, `shellEventsModule.js`, `app.js` |
| autenticação | `authSession.js`, Edge Functions e templates de e-mail |
| usuários/RBAC | `usersModule.js`, helpers do `app.js`, migrations `018–020`, `027` e `054` |
| realizado | `actualsModule.js` e migrations `011–015`, `028–029` |
| budget (carga de planejado) | `budgetModule.js` (destino sempre um cenário; staging em `budget_import_*`), migrations `016`, `022`, `028`, `030`, `274` |
| forecast / cenários | `forecastModule.js` (Repositório de Cenários), `reportsDreModule.js` e migrations `026`, `056`, `057`, `271`, `272` |
| cenários versionados por ano | `src/core/scenarioSources.js`, bloco `rowsForSource` em `app.js`, `reportsDreModule.js`, `reportsOpexModule.js`, `cockpitService.js`, migrations `271–277`, [Cenários versionados por ano](#cenários-versionados-por-ano) |
| DRE/OPEX/HC | `app.js` e `src/modules/reports/` |
| dashboard | `src/modules/dashboard/` e migration `024` |
| Cockpit de Gestão | `src/modules/cockpit/` (`cockpitAggregate.js`, `cockpitService.js`, `cockpitModule.js`, `cockpitWidgets.js`), migration `088` |
| Fluxo de Caixa | `src/modules/cashflow/`, `src/modules/params/fcPlanModule.js`, migrations `219–230` |
| Gestão Estratégica (A3) | `src/modules/strategic/`, migrations `127–177`, `184–187` |
| RPS | `src/modules/rps/rpsModule.js`, migrations `102–108`, `179–180` |
| RPS Comercial | `src/modules/rpsComercial/rpsComercialModule.js`, migrations `233–236`, `242` |
| Mensagens/Notificações | `src/modules/messages/`, `src/modules/notifications/`, migrations `092–101`, `178` |
| layout dos e-mails | `buildEmailLayout` replicado em `supabase/functions/{send-notification-emails,send-report-email,invite-user,resend-invite,forgot-password,resend-password}/index.ts`, modelos em `supabase/email-templates/`, imagens em `assets/email/` — ver [Layout padrão dos e-mails](#layout-padrão-dos-e-mails) |
| tela de configuração das notificações (cartões reordenáveis) | `notificationsModule.js` (`bindReorder`, `saveOrder`), CSS `.notif-cfg-*` em `styles.css`, migration `266` |
| cargas automáticas e envio semanal (robô) | `robo-cargas/` (`src/runner.js`, `src/jobs/`, `src/relatorios/`), `cargasAutomatizadasModule.js`, ganchos `VECTON_AUTOMATION` (`app.js`) e `VECTON_REPORT_AUTOMATION` (`reportsComercialPainelModule.js`), migrations `259–265`, [resumo para a TI](docs/robo-cargas-resumo-ti.pdf) |
| Novidades (pop-up + admin) | `src/modules/announcements/`, migrations `238–239` |
| tema Claro/Dark | `src/core/appearance.js`, `styles.css`, [docs/tema-claro.md](docs/tema-claro.md) |
| cadastros comerciais | `comercialCadastroModule.js`, configurações em `app.js`, migrations `032–037` |
| cargas comerciais | `comercialVendasCargaModule.js`, `comercialPlanejadoCargaModule.js`, migrations `038–042` |
| Ativações de Garantia | `garantiaAtivacoesCargaModule.js`, `reportsGarantiaAtivacoesModule.js`, migration `237` |
| Marcher no Campo | `reportsMarcherCampoModule.js` (lê `garantia_ativacoes`; depende da migration `267`), card posicionado pela `268` |
| painel/mapa comercial | `reportsComercialPainelModule.js`, `reportsComercialMapaModule.js`, `reportsComercialMapaGeograficoModule.js`, migrations `043–055`, `090`, `112–126`, `240–241`, `243–244` |
| Evolutivo de Margens | `reportsComercialMargensModule.js`, `reportsComercialMargensExport.js` (Excel/PDF/e-mail), card e perfis em `index.html`, regras de acesso em `app.js`, migrations `253`, `255` e `256` |
| campanhas e criador de relatórios comerciais | `src/modules/reports/comercialReportsModule.js`, migrations `064–069`, `074–075`, `245` |
| Balanço Patrimonial | `src/modules/balance/`, `src/modules/params/bpPlanModule.js`, migrations `300–309`, [documentação BP](docs/balanco-patrimonial.md) |
| Planejamento e CAPEX | `src/modules/planning/`, `reportsCapexModule.js`, migrations `278–298` |
| Carteira vigente | `comercialPainelDataModule.js`, `reportsComercialPainelModule.js`, `robo-cargas/src/jobs/vendas.js`, migrations `311–312` |
| Exportações dos DREs/BP | `dreExport.js`, `dreExport.css`, `bpExport.js`, `reportEmailModal.js` |
