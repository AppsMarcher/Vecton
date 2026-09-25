# VectonPlan

SPA de planejamento financeiro, acompanhamento gerencial e gestão comercial da Marcher Brasil.

- Produção: https://vecton.marcher.com.br
- Frontend: HTML, CSS e JavaScript puro, sem framework ou bundler
- Backend: Supabase (PostgreSQL, Auth, REST, RPC, RLS e Edge Functions)
- Modelo de dados: multitenant por `organization_id`

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
   - criação e manutenção de cenários de forecast;
   - combinação de realizado, budget e meses replanejados;
   - consultas de DRE, OPEX e Headcount por cenário.

4. **Fluxo de Caixa**
   - plano de contas próprio (FC), independente do plano de contas do DRE;
   - carga anual via Excel, cenários editáveis (Forecast/Budget) e ponte com o DRE;
   - dashboard dedicado (Relatórios Gerenciais → Fluxo de Caixa) com visões Mês/YTD/Ano e detalhamento mensal por conta;
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
   - **Notificações**: central (sino no header) alimentada por triggers do banco — lotes de carga, lembretes de RPS, KPIs fora da meta, ações estratégicas etc.

8. **Central de relatórios**
   - DRE Societário, Gerencial e DFs;
   - realizado, budget e cenários;
   - OPEX e Headcount;
   - Report Builder com relatórios personalizados;
   - Painel de Vendas, Mapa de Vendas e Vendas – Distribuição Geográfica (mapa por UF, donut/heatmap, ranking de estados);
   - Ativações de Garantia (heatmap cidade×estado/revenda, preço médio por modelo, ranking de vendedores, estoque estimado de revenda).

9. **Parâmetros e cargas financeiras**
   - empresas e filiais;
   - plano de contas;
   - gestões e centros de custos;
   - carga de realizado, planejado e headcount;
   - usuários e perfis de acesso;
   - Novidades: pop-up de lançamentos/campanhas exibido na abertura do app (carrossel de slides, imagem cheia ou cabeçalho+texto+imagem), com registro de quem já viu/dispensou cada anúncio;
   - Empresas, Plano de Contas DRE, Plano de Contas FC, Centros de Custos e Gestões pedem confirmação antes de efetivar Salvar/Remover, para evitar ajustes acidentais.

10. **Comercial**
    - cadastros de produtos, clientes, territórios, coordenações, tipos, culturas e linhas de negócio;
    - atribuição de responsáveis por território;
    - cargas de vendas realizadas e planejadas;
    - carga recorrente/aditiva de Ativações de Garantia (upsert, fonte AltForce);
    - relatórios comerciais agregados no servidor.

### Aparência (tema Claro/Dark)

Preferência de tema por usuário (padrão Dark), salva em `localStorage` por ID de usuário, aplicada via atributo `data-vecton-theme` no `<html>`. Cobre shell, perfil, dashboards, relatórios, A3, RPS, Mensagens e mapas. Ver [docs/tema-claro.md](docs/tema-claro.md).

Cards (`.content-card`, `.kpi-card` e afins) não têm mais sombra projetada nem realce cinza no hover — o hover marca o card com um contorno azul (`var(--blue)`), consistente nos dois temas.

## Como o frontend funciona

O projeto é uma SPA estática. Não existe etapa de compilação.

- `index.html` é o shell da aplicação e define a ordem de carregamento dos scripts.
- `app.js` é o orquestrador central: mantém o estado da sessão, instancia os módulos, injeta dependências e contém parte relevante dos relatórios e integrações Supabase.
- `styles.css` contém os tokens e estilos globais.
- `supabase-config.js` fornece URL, anon key e nome da organização.
- `seed-data.js`, `dre-structure.js` e `cc-structure.js` oferecem estruturas iniciais e fallback local.
- `src/core/` contém constantes, armazenamento local e utilitários compartilhados.
- `src/modules/` contém módulos IIFE publicados em namespaces `window.VECTON_*`.

A ordem dos `<script>` em `index.html` é obrigatória: todos os módulos precisam estar carregados antes de `app.js`.

### Estrutura dos módulos

```text
src/
├── core/
│   ├── appearance.js  tema Claro/Dark
│   ├── constants.js
│   ├── pwa.js
│   ├── storage.js
│   └── utils.js
└── modules/
    ├── actuals/       carga de realizado
    ├── announcements/ Novidades — pop-up de lançamentos/campanhas e admin de anúncios
    ├── auth/          login, sessão, convite e recuperação
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
    ├── notifications/  central de notificações (triggers do banco)
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
| `manager` | dashboard e relatórios; OPEX/Headcount filtrados por gestão e concessões |
| `analyst` | sem dashboard e DRE consolidado; acesso restrito a relatórios por CC |
| `comercial` | entrada em Relatórios; apenas Painel e Mapa de Vendas na interface |

Concessões adicionais disponíveis no perfil:

| Campo | Uso |
|---|---|
| `management` | gestão principal |
| `extra_managements` | gestões adicionais com acesso pleno |
| `extra_cc_ids` | centros de custos avulsos |
| `extra_report_ids` | relatórios adicionais |
| `extra_account_codes` | contas contábeis adicionais |
| `extra_branch_ids` | empresas/filiais adicionais |

Os principais helpers ficam em `app.js`: `getAllowedManagements()`, `getPartialManagements()`, `getAllowedCcNumbers()`, `canSeeReport()` e `canSeeAccount()`.

### Atenção de segurança

As restrições por gestão, CC e catálogo de relatórios são aplicadas principalmente no frontend. As migrations atuais permitem que membros da organização leiam vários ledgers completos. Portanto, ocultar um menu ou filtrar uma tabela no JavaScript não deve ser tratado como isolamento de dados no banco.

A policy atual de `user_profiles` também permite escrita do próprio perfil sem restrição de colunas. Ela precisa ser endurecida para impedir alteração direta de `access_role` e demais campos administrativos pelo próprio usuário.

Antes de considerar Gestor, Analista e Comercial fronteiras de segurança completas, as policies/RPCs devem reproduzir essas regras no PostgreSQL.

## Relatórios financeiros

### DRE

- DRE Societário: estrutura baseada no plano de contas.
- DRE Gerencial: linhas gerenciais calculadas por grupos de contas.
- DRE DFs: apresentação baseada no modelo de demonstrações financeiras.
- As versões Budget podem usar o budget oficial ou um cenário de forecast.

Percentuais mensais são calculados contra a Receita Líquida do próprio mês. Na coluna `TOTAL`, o cálculo correto é ponderado:

```text
soma do numerador no período / soma da Receita Líquida no período
```

Essa regra é usada nos percentuais do DRE Gerencial e nas linhas `%RL` do DRE DFs.

### OPEX e Headcount

- Perfis restritos recebem filtros por gestão e centros de custos.
- O drill-down deve usar o mesmo recorte da tabela principal.
- O dashboard pode mostrar visão consolidada, mas o drill-down respeita as concessões do usuário.
- Budget e Forecast usam seletores de fonte nos relatórios aplicáveis.

### Report Builder

`src/modules/reports/reportsBuilderModule.js` permite criar relatórios personalizados com:

- linhas e colunas configuráveis;
- filtros por conta, CC e gestão;
- fontes de realizado e planejado;
- fórmulas e formatos numéricos;
- persistência em `custom_reports`.

## Comercial

Os oito cadastros comerciais compartilham `createCadastroModule()` em `comercialCadastroModule.js`. As configurações e dependências são fornecidas pelo `app.js`.

As cargas comerciais seguem o padrão:

```text
arquivo → batch → staging rows → validação → RPC de aplicação → ledger → auditoria
```

Principais tabelas:

- `comercial_realizado_import_batches`, `comercial_realizado_import_rows` e `comercial_realizado_ledger_entries`;
- `comercial_planejado_import_batches`, `comercial_planejado_import_rows` e `comercial_planejado_ledger_entries`;
- tabelas de auditoria correspondentes;
- `comercial_municipios_geo` para o mapa;
- `garantia_ativacoes` para a carga recorrente/aditiva (upsert) das ativações exportadas do AltForce.

Principais RPCs:

- `comercial_painel_vendas`
- `comercial_painel_tipos`
- `comercial_painel_detalhe`
- `comercial_mapa_vendas`
- `comercial_mapa_geografico_vendas`

## Supabase e migrations

As migrations estão em `supabase/` e devem ser aplicadas em ordem. O checkout atual vai de `001` até `242` (245 arquivos numerados + 10 scripts `_diag_*`/utilitários avulsos).

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

### Divergências conhecidas do schema

- Numeração duplicada: `025` (`025_create_custom_reports.sql` e `025_extra_managements.sql`), `074` (`074_comercial_report_movements_segment.sql` e `074_remove_legacy_bateu_levou_catalog.sql`) e `219` (`219_fc_chart_of_accounts.sql` e `219_rps_capture_backup_purge_expired_locks.sql`). A ordem entre pares com o mesmo número precisa ser controlada manualmente (checar `created_at`/histórico do Supabase, não o nome do arquivo).
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
| `send-report-email` | gera PDF de relatório (Browserless) e envia por e-mail via Resend |

As funções usam `service_role` somente no servidor e validam manualmente o token do chamador.

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

- `styles.css?v=20260925toggle1`
- `app.js?v=20260925a`

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

`tests/` tem 21 arquivos, cada um executável isoladamente com `node tests/<arquivo>.test.js` (sem framework — usam `assert` puro e `vm.runInNewContext` para carregar o módulo sob teste isolado do resto do app; massa de dados em `tests/fixtures/`). Os arquivos `*.browser.test.js` sobem uma página real via Playwright (precisa de `npx playwright install` uma vez). Cobrem principalmente: Cockpit (`cockpit.test.js`, `cockpitService.test.js`), Fluxo de Caixa (`fcDashboard.*.test.js`, `fcPlan.*.test.js`, `fcImport.sql.test.js`), tema Claro/Dark (`appearance*.test.js`), RPS (`rpsConcurrency.test.js`, `rpsLayout.test.js`), Mensagens (`messagesAppearance.test.js`, `messagesPresencePicker.test.js`) e mapas (`mapAppearance.test.js`, `floatingScrollbar.browser.test.js`). Ainda não há um runner único nem integração com CI — rode os arquivos relevantes à mudança manualmente.

Também confira:

- se todos os scripts de `index.html` existem;
- se a ordem de carregamento foi preservada;
- se o cache-busting foi atualizado;
- se o fluxo funciona para Admin e para pelo menos um perfil restrito;
- se tabela principal e drill-down usam o mesmo recorte de acesso;
- se mudanças de relatório mantêm Realizado, Budget e Forecast coerentes.

## Limitações e dívida técnica

- `app.js` ainda concentra grande parte da aplicação e deve ser alterado em etapas pequenas.
- A arquitetura depende de globais `window.VECTON_*` e da ordem manual dos scripts.
- Não há package manager (`package.json`), bundler ou linter configurados. Há uma suíte de testes (`tests/`, 21 arquivos), mas sem runner único nem CI — ver [Testes](#testes).
- Parte do schema de Headcount não está versionada nas migrations deste checkout.
- A tela "Perfis de Acesso" é principalmente descritiva; contadores e botões "Ver usuários" ainda não possuem integração própria.
- O XLSX é carregado por CDN externa.
- As regras de leitura por perfil ainda precisam ser reforçadas no banco (ver [Atenção de segurança](#atenção-de-segurança)).
- Há lançamentos de Realizado/Forecast em contas de OPEX sem centro de custo vinculado (import de origem incompleto) — caem em "Sem gestão cadastrada" no Cockpit; ver [docs/cockpit-gestao.md](docs/cockpit-gestao.md).
- Há três blocos de migrations numerados em duplicidade (`025`, `074`, `219`) — a ordem de aplicação entre o par não é dada pelo nome do arquivo.

## Pontos de entrada para manutenção

| Tipo de ajuste | Arquivos principais |
|---|---|
| navegação e menus | `navigationModule.js`, `shellEventsModule.js`, `app.js` |
| autenticação | `authSession.js`, Edge Functions e templates de e-mail |
| usuários/RBAC | `usersModule.js`, helpers do `app.js`, migrations `018–020`, `027` e `054` |
| realizado | `actualsModule.js` e migrations `011–015`, `028–029` |
| budget | `budgetModule.js` e migrations `016`, `022`, `028`, `030` |
| forecast | `forecastModule.js`, `reportsDreModule.js` e migration `026` |
| DRE/OPEX/HC | `app.js` e `src/modules/reports/` |
| dashboard | `src/modules/dashboard/` e migration `024` |
| Cockpit de Gestão | `src/modules/cockpit/` (`cockpitAggregate.js`, `cockpitService.js`, `cockpitModule.js`, `cockpitWidgets.js`), migration `088` |
| Fluxo de Caixa | `src/modules/cashflow/`, `src/modules/params/fcPlanModule.js`, migrations `219–230` |
| Gestão Estratégica (A3) | `src/modules/strategic/`, migrations `127–177`, `184–187` |
| RPS | `src/modules/rps/rpsModule.js`, migrations `102–108`, `179–180` |
| RPS Comercial | `src/modules/rpsComercial/rpsComercialModule.js`, migrations `233–236`, `242` |
| Mensagens/Notificações | `src/modules/messages/`, `src/modules/notifications/`, migrations `092–101`, `178` |
| Novidades (pop-up + admin) | `src/modules/announcements/`, migrations `238–239` |
| tema Claro/Dark | `src/core/appearance.js`, `styles.css`, [docs/tema-claro.md](docs/tema-claro.md) |
| cadastros comerciais | `comercialCadastroModule.js`, configurações em `app.js`, migrations `032–037` |
| cargas comerciais | `comercialVendasCargaModule.js`, `comercialPlanejadoCargaModule.js`, migrations `038–042` |
| Ativações de Garantia | `garantiaAtivacoesCargaModule.js`, `reportsGarantiaAtivacoesModule.js`, migration `237` |
| painel/mapa comercial | `reportsComercialPainelModule.js`, `reportsComercialMapaModule.js`, `reportsComercialMapaGeograficoModule.js`, migrations `043–055`, `112–126`, `240–241` |
| campanhas e criador de relatórios comerciais | `src/modules/reports/comercialReportsModule.js`, migrations `064–069` |
