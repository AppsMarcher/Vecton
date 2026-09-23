# Arquitetura inspecionada e correspondência do mockup

## Fonte de verdade

A inspeção partiu do shell, metadados de views, navegação, orquestração, renderização e módulos atuais; complementada pelos documentos de domínio e migrations. O README principal está parcialmente desatualizado: descreve menos módulos, encerra a lista de migrations em 070 e diz que não há testes. O checkout contém módulos posteriores, migrations até 236 e uma pasta de testes. Para cobertura visual, prevaleceram as entradas presentes no código.

## Organização atual

```text
index.html — shell, sprite, catálogos e carregamento ordenado dos scripts
  ├─ src/core — constantes, armazenamento, utilitários e PWA
  ├─ src/modules — fábricas IIFE em namespaces window.VECTON_*
  └─ app.js — estado, composição de dependências, regras e integrações restantes
       ├─ Auth / sessão / perfil / organização
       ├─ Navegação → renderização das views e relatórios
       └─ Serviços autenticados → Supabase REST/RPC/Storage/Realtime

Supabase
  ├─ PostgreSQL — organization_id, cadastros, staging, ledgers e agregados
  ├─ RLS / funções — permissões e validações por módulo
  ├─ Storage — anexos, evidências e backups
  └─ Edge Functions — convites, senhas, notificações, relatórios e backups
```

Não há framework, bundler ou roteador de aplicação. A ordem dos scripts faz parte do contrato de inicialização. O CSS global e estilos de módulos contêm tokens, seletores e cores específicas de domínio. A migração de tema deve ser incremental para evitar inconsistências entre módulos.

## Módulos e telas propostas

| Camada / módulo existente | Arquivos de referência | Mockup |
|---|---|---|
| Shell e navegação | `index.html`, `app.js`, `src/core/constants.js`, `navigationModule.js`, `renderModule.js`, `shellEventsModule.js`, `headerModule.js` | Sidebar, header, busca, filtros, todas as views com IDs preservados |
| Dashboard executivo | `dashboardModule.js`, `dashboardCards.js`, `dashboardVisuals.js`, `marketTicker.js` | Cockpit Executivo; valores e gráficos ilustrativos |
| Cockpit Gestão | `cockpitModule.js`, `cockpitService.js`, `cockpitAggregate.js`, `cockpitWidgets.js`, `cockpitFormat.js` | OPEX, HC, OPEX/pessoa, composição e detalhe |
| Financeiro | `reportsDreModule.js`, `reportsOpexModule.js`, `reportsHeadcountModule.js`, helpers e trechos do `app.js` | DRE Societário/Gerencial/DFs Real/Planejado; OPEX e HC |
| Central de relatórios | `reportsSectionsModule.js`, `reportsBuilderModule.js` | Catálogo por domínio e builder financeiro |
| Comercial | `comercialPainelDataModule.js`, `reportsComercialPainelModule.js`, mapas e peças | Painel, matriz, mapa de máquinas, performance geográfica de peças |
| Relatórios comerciais | `comercialReportsModule.js` | Templates, configuração e campanha ilustrativa |
| Forecast | `forecastModule.js` | Cenários, favorito, editor e comparação |
| Fluxo de Caixa | `fcStructure.js`, `fcModel.js`, `fcService.js`, `fcLoadModule.js`, `fcDashboard.js`, `fcExport.js`, `fcPlanModule.js` | Carga, plano, dashboard, demonstrativo anual e cenários |
| RPS Gestão | `rpsModule.js`, migrations e funções de backup | Grade semanal, comentário/anexo, apresentação e histórico |
| RPS Comercial | `rpsComercialModule.js`, migrations 233–236 | Seis áreas fixas, três blocos textuais, evidências e apresentação |
| Estratégia | `strategicModule.js`, `strategicDataModule.js`, `strategicMobileModule.js` | Norte Verdadeiro, A3, indicadores, lançamento, ações, arquivo e fechamento |
| Cadastros | Árvores DRE/CC/filial, `managementsModule.js`, `comercialCadastroModule.js` | Estruturas hierárquicas, gestões, nove cadastros comerciais |
| Cargas | `actualsModule.js`, `budgetModule.js`, `headcountRenderModule.js`, cargas comerciais | Arquivo, validação, prévia, aplicação e histórico |
| Usuários e Auth | `authSession.js`, `usersModule.js`, `profileDialogModule.js` | Acesso, recuperação, convite, perfil, usuários e concessões |
| Colaboração | `messagesModule.js`, `notificationsModule.js` | Messenger, central e gestão de notificações |
| Mobile / PWA | `mobileShellModule.js`, módulos mobile, `pwa.js`, `sw.js`, manifest | Proposta responsiva de todo o catálogo; sem registrar PWA |

## Regras que afetam o desenho

- Mês / YTD / Ano e competência consistente; formatos brasileiros e unidade explícita.
- DRE: margem é uma razão sobre receita líquida do mesmo período. O total não soma percentuais mensais.
- Cockpit: despesa menor é favorável; HC não deve receber julgamento favorável/desfavorável automático. HC acumulado é média de snapshots.
- Realizado, Budget e Forecast são fontes distintas; o favorito é uma referência de comparação.
- Fluxo de Caixa: saldo é posição, fluxo é movimento. Meses Real são protegidos; quantidades de máquinas não geram receita automaticamente. Cenários são cópias; o plano FC é independente do DRE.
- Geografia comercial: Brasil e Exterior/EX precisam compor o mesmo total; peças e máquinas têm métricas próprias.
- RPS Gestão: números, metas e backups; RPS Comercial: ata em seis áreas, sem herdar o mecanismo de backup/lock da RPS Gestão.
- A3: sem dado difere de zero, direção do indicador importa, fechamento é específico da competência do A3.
- Campanhas: elegibilidade, vigência, cargo, meta e situação da premiação devem ser explícitos.
- Concessões por organização/gestão/CC/conta/filial/relatório são mantidas pelo produto; exibir todos os menus no mockup não propõe alterar permissões.

## Estratégia para desenvolvimento após avaliação

1. Aprovar tokens Clear/Dark e componentes básicos nas telas de avaliação.
2. Introduzir atributo de tema no shell real e persistência de preferência em chave apropriada, antes do primeiro paint.
3. Mapear variáveis legadas (`--text`, `--text-soft`, `--line`, `--panel-hover`, etc.) para tokens semânticos.
4. Migrar gradualmente fundos e cores fixas no CSS global, FC, A3, RPS, mapas e estilos gerados nos módulos.
5. Reaproveitar renderizadores e serviços atuais. O código de dados demonstrativos deste mockup não deve substituir motores de cálculo.
6. Validar desktop, notebook, mobile, diálogos, gráficos, exportações e cada perfil de acesso.

Nenhuma mudança de API, banco, migração, publicação ou contrato de dados integra esta entrega.

## Revisão visual

A pergunta do AGENTS.md foi aplicada: “Esta tela parece parte de um produto SaaS empresarial premium desenvolvido em 2026 ou parece um sistema interno montado rapidamente?”

A proposta prioriza hierarquia, respiro controlado, tabelas, contraste e componentes comuns. Não usa cards decorativos, gradientes, emojis como ícones, inversão automática de cores ou sombras em cada bloco.

As imagens principais de dashboard, vendas, caixa, A3, ata comercial, DRE e acesso foram renderizadas para comparação entre os dois temas. A cobertura funcional da prévia está registrada em `review-results.json`; fluxos integrados e cálculos completos de produção permanecem fora do escopo do mockup.
