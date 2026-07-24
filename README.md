# VectonPlan

SPA de planejamento financeiro, acompanhamento gerencial e gestão comercial da Marcher Brasil.

- Produção: https://vecton.marcher.com.br
- Frontend: HTML, CSS e JavaScript puro, sem framework ou bundler
- Backend: Supabase (PostgreSQL, Auth, REST, RPC, RLS e Edge Functions)
- Modelo de dados: multitenant por `organization_id`

## Visão geral

O VectonPlan reúne cinco áreas principais:

1. **Dashboard executivo**
   - indicadores financeiros e de headcount;
   - gráficos e drill-downs;
   - ticker de mercado com câmbio, índices, juros, inflação e commodities.

2. **Planejamento**
   - criação e manutenção de cenários de forecast;
   - combinação de realizado, budget e meses replanejados;
   - consultas de DRE, OPEX e Headcount por cenário.

3. **Central de relatórios**
   - DRE Societário, Gerencial e DFs;
   - realizado, budget e cenários;
   - OPEX e Headcount;
   - Report Builder com relatórios personalizados;
   - Painel de Vendas e Mapa de Vendas.

4. **Parâmetros e cargas financeiras**
   - empresas e filiais;
   - plano de contas;
   - gestões e centros de custos;
   - carga de realizado, planejado e headcount;
   - usuários e perfis de acesso.

5. **Comercial**
   - cadastros de produtos, clientes, territórios, coordenações, tipos, culturas e linhas de negócio;
   - atribuição de responsáveis por território;
   - cargas de vendas realizadas e planejadas;
   - relatórios comerciais agregados no servidor.

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
│   ├── constants.js
│   ├── storage.js
│   └── utils.js
└── modules/
    ├── actuals/       carga de realizado
    ├── auth/          login, sessão, convite e recuperação
    ├── budget/        carga de planejado
    ├── comercial/     cadastros e cargas comerciais
    ├── dashboard/     cockpit, cards, gráficos e ticker
    ├── forecast/      cenários de planejamento
    ├── headcount/     renderização de headcount
    ├── navigation/    navegação e visibilidade dos menus
    ├── params/        parâmetros administrativos
    ├── reports/       relatórios financeiros, comerciais e builder
    ├── ui/            árvores, diálogos, header e eventos
    └── users/         usuários e concessões adicionais
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
- `comercial_municipios_geo` para o mapa.

Principais RPCs:

- `comercial_painel_vendas`
- `comercial_painel_tipos`
- `comercial_painel_detalhe`
- `comercial_mapa_vendas`

## Supabase e migrations

As migrations estão em `supabase/` e devem ser aplicadas em ordem. O checkout atual vai de `001` até `070`.

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
| `050–053` | geodados e Mapa de Vendas |
| `054–055` | perfil Comercial e cidade/UF no detalhe do painel |

### Divergências conhecidas do schema

- Existem dois arquivos numerados como `025`: `025_create_custom_reports.sql` e `025_extra_managements.sql`. A ordem precisa ser controlada manualmente.
- O frontend usa `headcount_import_batches`, `headcount_import_rows`, `headcount_entries` e `forecast_headcount_entries`, mas as migrations de criação dessas tabelas não estão neste checkout.
- `supabase/README.md` ainda documenta somente a base inicial e não é a fonte completa do schema atual.
- `_diag_mapa_sem_localizacao.sql` é diagnóstico, não migration de produção.

Antes de alterar contratos de Headcount, valide o schema real do projeto Supabase e traga a definição correspondente para o repositório.

## Edge Functions

Funções disponíveis:

- `invite-user`: cria o usuário no Auth, membership e perfil;
- `resend-invite`: reenvia o convite original;
- `set-user-password`: permite que administradores definam a senha de outro usuário conforme a hierarquia.

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

Versões relevantes neste checkout:

- `styles.css?v=20260713j`
- `app.js?v=20260714b`

Ao publicar uma alteração:

1. valide a sintaxe dos arquivos modificados;
2. atualize o `?v=` somente dos assets alterados;
3. publique os arquivos estáticos;
4. confirme o carregamento da nova versão no navegador;
5. para mudanças de banco, aplique a migration antes de liberar o frontend dependente dela.

## Validação rápida

Não existe suíte automatizada de testes neste checkout. Antes de entregar uma alteração, execute ao menos:

```powershell
node --check .\app.js
```

Para validar todos os módulos JavaScript:

```powershell
Get-ChildItem .\src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

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
- Não há package manager, bundler, linter ou testes automatizados configurados.
- O checkout não possui histórico Git utilizável.
- Parte do schema de Headcount não está versionada.
- A tela “Perfis de Acesso” é principalmente descritiva; contadores e botões “Ver usuários” ainda não possuem integração própria.
- O XLSX é carregado por CDN externa.
- As regras de leitura por perfil ainda precisam ser reforçadas no banco.

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
| cadastros comerciais | `comercialCadastroModule.js`, configurações em `app.js`, migrations `032–037` |
| cargas comerciais | `comercialVendasCargaModule.js`, `comercialPlanejadoCargaModule.js`, migrations `038–042` |
| painel/mapa comercial | `reportsComercialPainelModule.js`, `reportsComercialMapaModule.js`, migrations `043–055` |
| campanhas e criador de relatórios comerciais | `src/modules/reports/comercialReportsModule.js`, migrations `064–069` |
