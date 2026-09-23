# Vecton — mesmas telas, tema Clear

Esta versão substitui a primeira proposta. **Não redesenha dashboards ou relatórios.**

## Abrir

Com o servidor da raiz aberto (`python -m http.server 8093 --bind 127.0.0.1`), acesse:

[Mockup fiel ao Vecton](http://127.0.0.1:8093/mockup-fiel/)

A faixa superior pertence à avaliação e não ao produto. Permite abrir diretamente as telas e alternar entre **Clear** e **Dark original**. A navegação interna continua sendo a original.

## O que foi preservado

- HTML do shell original: menu, header, filtros, árvores, catálogos e diálogos.
- Os próprios scripts de renderização em `src/modules/` e `app.js`.
- Cinco KPIs do Dashboard: Receita Líquida, % Material, EBITDA, Margem EBITDA e Lucro Líquido.
- Demonstrativo em barras, três velocímetros, gráficos combinados, donut de OPEX e Headcount.
- Cockpit Gestão com seus KPIs, OPEX Mensal, Raio-X por Área, grupos de despesas e atingimento.
- Painel comercial com suas matrizes, coordenações, territórios, histórico e barras de atingimento.
- Mapas e performance geográfica de peças nos tipos e formatos existentes.
- Fluxo de Caixa com curva, barras de máquinas, ranking, ponte e tabela anual com 76 contas analíticas.
- DREs, OPEX, Headcount, cenários, cadastros, cargas, A3, RPS Gestão e RPS Comercial renderizados pelos módulos atuais.
- Formatos, cálculos dos renderizadores, hierarquia, colunas, disposição e comportamento responsivo existentes.

## O que mudou

Somente a camada visual do tema Clear: superfícies brancas, bordas discretas, contraste de texto, cores compatíveis com fundo claro, sombras reduzidas e pesos tipográficos mais equilibrados. Os tamanhos, grids, espaçamentos e tipos de gráficos não foram substituídos.

`clear.css` define tokens claros sobre os nomes existentes. `preview.js` adapta as cores literais dos estilos e SVGs que ainda não usam tokens. Essa adaptação altera propriedades de aparência, sem gerar componentes ou reconstruir gráficos. Ao escolher Dark, as regras claras deixam de se aplicar.

## Dados e isolamento

Os **valores são demonstrativos**. As respostas de dados usam os contratos dos módulos existentes para permitir ver gráficos e tabelas preenchidos sem sessão de produção. Os indicadores estratégicos vêm do catálogo versionado do repositório; não foi consultado o catálogo eventualmente alterado no banco da empresa.

`guard.js` bloqueia o backend e substitui o armazenamento do produto por memória de sessão. `bridge.js` injeta a sessão demonstrativa e fontes locais na fronteira de dados. Não troca os renderizadores. O cálculo de FC usa o modelo original com a fixture já existente nos testes. O Cockpit Gestão usa o agregador e os widgets originais.

Não autentica usuários reais, não envia mensagens/e-mails, não aplica cargas e não publica alterações. Bibliotecas de rede e PWA não são inicializadas. A versão original do Lucide foi copiada para `vendor/` para manter a iconografia sem depender de CDN.

## Arquivos

- `index.html`: faixa de comparação e iframe.
- `app.html`: shell gerado diretamente do `index.html` original.
- `build.cjs`: reprodução do shell, mantendo as referências aos módulos atuais.
- `clear.css` e `preview.js`: tema e controles externos de avaliação.
- `fixtures.js`, `bridge.js`, `guard.js`: dados locais e isolamento.
- `verify.cjs`: verificação em Edge/Playwright.
- `verification.json` e `previews/`: evidências da conferência.

Os arquivos de produção permanecem intactos. Para regenerar a cópia do shell após mudanças na aplicação:

```powershell
node mockup-fiel/build.cjs
node mockup-fiel/verify.cjs
```

## Conferência de fidelidade

A verificação percorre as 30 views e os 15 relatórios estáticos. Compara, entre Clear e Dark, os títulos, cabeçalhos de tabelas, quantidade de tabelas/SVGs e os caminhos geométricos dos gráficos. Verifica ainda erros JavaScript, ausência de requisições externas e as 76 contas analíticas do FC detalhado. As capturas dos dois temas permitem a comparação visual.

O escopo é uma prévia de aparência: edição e integração completas com dados reais continuam pertencendo ao aplicativo original. O menu mobile preserva o catálogo mobile atual, sem inventar novas telas para esse ambiente.
