# Design System — Vecton

## 1. Direção visual

O Vecton deve ter uma linguagem visual empresarial moderna, sofisticada, limpa e funcional.

Referências conceituais:
- Linear
- Vercel
- Stripe
- Notion
- Raycast
- GitHub
- Figma
- produtos fintech modernos
- plataformas contemporâneas de analytics e planejamento

Não copie visualmente nenhum produto. Use apenas princípios de:
- hierarquia;
- clareza;
- densidade;
- tipografia;
- ritmo;
- contraste;
- microinterações;
- consistência.

## 2. Filosofia

Priorize:

**clareza + elegância + simplicidade + densidade informacional + velocidade de uso**

Menos elementos, melhor organizados.

Evite enfeites que não agreguem informação, navegação, contexto ou ação.

## 3. Tipografia

Preferência:
- Inter
- Geist
- Manrope
- DM Sans
- SF Pro quando disponível

Hierarquia sugerida:
- Page title: 24–30px / 600
- Section title: 18–22px / 600
- Card title: 14–16px / 600
- Body: 13–15px / 400–500
- Metadata: 12–13px / 400
- KPI principal: 24–36px / 600
- Tabela: 12–14px / 400–500

Evite bold excessivo.
Use peso 700 apenas quando necessário.

## 4. Espaçamento

Basear o sistema em múltiplos de 4px.

Escala recomendada:
4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64

Nada deve ser espaçado arbitrariamente.

## 5. Cores

Trabalhar com tokens semânticos.

Obrigatórios:
- background
- background-secondary
- surface
- surface-elevated
- border
- border-subtle
- text-primary
- text-secondary
- text-muted
- accent
- success
- warning
- danger
- info

Regras:
- paleta restrita;
- cores fortes apenas para ações, estados, alertas e destaques;
- nunca usar muitas cores simultaneamente em KPIs e gráficos;
- priorizar contraste e legibilidade.

## 6. Bordas

Preferir:
- 1px;
- baixo contraste;
- discretas.

Não contornar tudo.

## 7. Border radius

Padrão sugerido:
- inputs: 8px
- botões: 8px
- cards: 10–12px
- modais/drawers: 12–16px
- badges: 6–999px conforme função

Evite transformar toda interface em cápsulas.

## 8. Sombras

Sombras devem ser mínimas.

Usar principalmente em:
- dropdown;
- popover;
- modal;
- drawer;
- command palette.

Cards comuns devem preferir borda e diferença sutil de surface.

## 9. Botões

Hierarquia:
- Primary
- Secondary
- Ghost
- Danger

Regras:
- uma ação primária dominante por contexto;
- não criar uma parede de botões;
- usar ícone quando ele reduzir esforço cognitivo;
- incluir estados hover, active, focus, disabled e loading.

## 10. Ícones

Usar uma única biblioteca por projeto.

Preferência:
- Lucide

Alternativas:
- Phosphor
- Heroicons

Evitar emojis como ícones de produto.

Manter:
- stroke consistente;
- tamanho consistente;
- alinhamento consistente.

## 11. Cards

Nem toda informação merece um card.

Cards devem representar agrupamentos lógicos.

Evitar:
- dezenas de cards;
- cards dentro de cards;
- sombras fortes;
- títulos redundantes;
- padding exagerado.

## 12. KPIs

Cada KPI pode conter:
- rótulo;
- valor;
- comparação;
- variação;
- microtendência;
- sparkline quando útil.

Evite cards gigantes para números simples.

## 13. Tabelas

Tabelas são componentes centrais do Vecton.

Quando aplicável, suportar:
- ordenação;
- busca;
- filtros;
- seleção;
- paginação;
- header fixo;
- alinhamento numérico;
- exportação;
- ações contextuais;
- colunas configuráveis;
- estados vazios;
- loading skeleton.

Alinhamento:
- texto: esquerda;
- números: direita;
- status: centro ou esquerda;
- ações: direita.

Evite altura excessiva de linhas.

## 14. Gráficos

Priorizar:
- line
- area
- bar
- stacked bar
- horizontal bar
- donut somente quando fizer sentido

Evitar:
- 3D;
- excesso de cores;
- gridlines fortes;
- legendas gigantes;
- efeitos decorativos.

Tooltips devem ser objetivos.

## 15. Filtros

Filtros devem ser poderosos sem dominar a interface.

Preferir:
- select;
- multi-select;
- combobox;
- chips;
- popover;
- seletor de período;
- toggle segmentado quando apropriado.

Filtros avançados podem ficar ocultos.

Sempre deixar filtros ativos claramente visíveis.

## 16. Estados

Todo componente assíncrono deve considerar:
- loading;
- skeleton;
- empty;
- no results;
- error;
- success;
- disabled.

## 17. Microinterações

Animações:
- 120–250ms;
- discretas;
- funcionais.

Usar em:
- hover;
- dropdown;
- tabs;
- sidebar;
- modais;
- expansão;
- seleção.

## 18. Acessibilidade

Garantir:
- contraste adequado;
- semântica HTML;
- foco visível;
- navegação por teclado;
- labels;
- aria quando necessário;
- áreas clicáveis adequadas.

## 19. Dark mode

Se existir, deve ser tratado como design próprio, não como inversão de cores.

Criar tokens específicos para:
- surfaces;
- borders;
- text;
- hover;
- selected;
- charts.
