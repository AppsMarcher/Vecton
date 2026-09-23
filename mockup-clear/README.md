# Vecton — mockup Clear / Dark

Protótipo navegável para avaliar a evolução visual do Vecton. A abertura padrão usa **Clear**, com fundo branco. O seletor da barra lateral e a tela **Meu perfil e aparência** alternam todas as telas para **Dark**. A preferência fica no navegador, numa chave exclusiva deste mockup.

## Abrir

Na raiz do repositório:

```powershell
python -m http.server 8093 --bind 127.0.0.1
```

Acesse [o mockup](http://127.0.0.1:8093/mockup-clear/) ou [o inventário navegável](http://127.0.0.1:8093/mockup-clear/#screenIndex). O servidor precisa permanecer aberto. Não há instalação, build ou autenticação.

## Cobertura

72 telas e variações de fluxo, com os IDs de todas as views de `VIEW_HEADER_METADATA` e todos os relatórios estáticos declarados em `index.html`:

- Cockpit Executivo e Cockpit Gestão.
- Central de relatórios; seis DREs; OPEX e Headcount realizado/planejado.
- Painel de Vendas, matriz territorial, mapa geográfico de máquinas e performance de peças.
- Fluxo de Caixa, demonstrativo anual editável nos meses projetados e biblioteca de cenários.
- Forecast: repositório, editor e comparação de cenários.
- A3: visão geral, detalhe, lançamento, plano de ação e arquivados.
- RPS Gestão: indicadores, apresentação e histórico/backups.
- RPS Comercial: seis áreas, três blocos por semana, anexos/comentários e apresentação.
- Empresa/filial, contas DRE, contas FC, gestões e centros de custo.
- Nove cadastros comerciais e cargas financeiras/comerciais/Headcount/FC.
- Report Builder financeiro, criador comercial e exemplo de campanha.
- Usuários, perfis, notificações, Messenger e perfil pessoal.
- Login, recuperação de acesso, nova senha e ativação por convite.
- Design system, inventário e estados compartilhados de interface.

Os formulários de criação/edição, permissões, evidências, exportação e detalhamento abrem em diálogos ou painéis laterais; não entram separadamente na contagem.

## O que experimentar

1. Alterne Clear/Dark e visite o inventário **Todas as telas**.
2. Use a busca global (`Ctrl+K`), os filtros e a busca nas tabelas.
3. Selecione indicadores/linhas para abrir um detalhamento ilustrativo.
4. Cadastre ou edite um produto; o registro permanece durante a sessão.
5. No FC detalhado, edite uma entrada projetada, confira os saldos, salve e reabra uma cópia. Os meses Real ficam protegidos. Fluxos anuais são somados; saldos são posições.
6. Abra o exemplo de validação de carga: erro → correção simulada → aplicação demonstrativa.
7. Avalie os estados Sucesso, Carregando, Vazio, Sem resultados e Erro pelo rodapé.
8. Reduza a janela: a navegação vira menu; KPIs, formulários e painéis se reorganizam; tabelas largas têm rolagem própria.

## Limites intencionais

Este é um **mockup para avaliação visual**, não uma implementação integrada das funções do produto. Nenhuma credencial, dado financeiro, mensagem, arquivo ou e-mail é enviado. Não carrega a configuração Supabase, `app.js`, autenticação ou service worker.

Os valores, pessoas, clientes e registros são exemplos. Detalhamentos usam amostras ilustrativas, não um ledger conciliado. Os controles de período/gestão demonstram os estados de apresentação; o motor financeiro de produção, suas permissões e suas regras completas não foram reproduzidos. Formulários como usuários, A3, notificações e forecast apresentam confirmação simulada. Cadastros comerciais, mensagens, blocos da ata e cenários de caixa têm estado local de demonstração; esse estado é perdido ao recarregar. Somente a preferência de tema persiste no navegador.

O protótipo expõe o catálogo completo no papel de avaliador. Não implementa RBAC. A cobertura mobile de todas as áreas é uma proposta visual: o shell mobile atual do produto tem catálogo mais restrito.

## Design e implementação

Diretrizes utilizadas: `Vecton-Codex-Agent/AGENTS.md`, `docs/design-system.md`, `docs/vecton-ui.md` e `docs/business-rules.md` dentro desse pacote.

- Tokens semânticos separados por tema: superfícies, texto, bordas, interação, estados e gráficos.
- Fundo Clear branco; azul para interação; estados com texto e cor; sombras reservadas a diálogos.
- Sidebar de 236 px; títulos de 28 px; tabelas de 12 px; espaçamento em múltiplos de 4 px.
- Fonte Inter quando disponível, com fallback local Segoe UI. Nenhuma fonte externa é necessária.
- Componentes compartilhados: shell, ações, filtros, KPIs, painéis, tabelas, gráficos, formulários, badges e diálogos.
- Ícones do sprite original, complementados no mesmo traço; geometria do Brasil reaproveitada do módulo existente.
- HTML semântico, foco visível, labels, diálogo nativo, Escape, busca por teclado e respeito a movimento reduzido.

Arquivos de produção e alterações preexistentes do usuário foram preservados. O protótipo depende de três recursos locais da raiz: favicon, constantes e geometria do Brasil. Para compartilhar, mantenha esses caminhos ou copie os recursos e ajuste as referências.

## Verificação

```powershell
node --check mockup-clear/mockup.js
node --check mockup-clear/catalog.js
node --check mockup-clear/cash-fixture.js
node mockup-clear/review.cjs
```

O último comando requer Playwright e Edge, além do servidor acima. Verifica todas as rotas em Clear/Dark e em desktop/mobile, erros JavaScript, requisições externas, overflow de página e interações representativas. Resultados em `review-results.json`; capturas em `previews/`.

As capturas foram inspecionadas visualmente. A revisão funcional é limitada ao protótipo e não substitui a integração ou homologação com dados reais.
