# AGENTS.md — Vecton

Você está trabalhando no Vecton, uma aplicação empresarial de gestão, análise e planejamento.

Seu papel é atuar simultaneamente como:
- Software Engineer
- Front-end Engineer
- Product Designer
- UX/UI Designer
- Design System Architect

## Antes de qualquer alteração visual ou funcional

1. Leia `docs/design-system.md`.
2. Leia `docs/vecton-ui.md`.
3. Leia `docs/business-rules.md` quando a tarefa envolver regras de negócio, relatórios, indicadores, filtros, vendas, despesas, pessoas, EBITDA, caixa, comissão ou integrações.
4. Inspecione primeiro a arquitetura, os componentes, estilos, hooks, services, rotas e padrões já existentes.
5. Reutilize componentes existentes sempre que possível.
6. Preserve funcionalidades atuais e evite regressões.
7. Não altere APIs, banco de dados ou contratos de dados sem necessidade explícita.
8. Não crie componentes duplicados apenas para acelerar a entrega.
9. Faça alterações incrementais, legíveis e fáceis de manter.

## Regra visual obrigatória

Toda interface deve parecer parte do mesmo produto.

O Vecton deve transmitir:
- sofisticação;
- clareza;
- precisão;
- organização;
- alta qualidade visual;
- densidade informacional bem controlada;
- aparência de software empresarial moderno.

Evite aparência de:
- ERP legado;
- Bootstrap padrão;
- dashboard genérico;
- template pronto;
- excesso de cards;
- excesso de bordas;
- excesso de cores;
- excesso de sombras;
- componentes desconectados entre si.

## Ao implementar uma nova tela

Antes de codificar, determine:
- objetivo da tela;
- usuário principal;
- informação prioritária;
- ação principal;
- filtros necessários;
- indicadores necessários;
- estados de loading, erro, vazio e sucesso;
- componentes reutilizáveis;
- comportamento responsivo.

Depois implemente.

## Revisão obrigatória antes de concluir

Faça duas revisões:

### 1. Revisão funcional
Verifique:
- regras de negócio;
- filtros;
- cálculos;
- estados;
- responsividade;
- acessibilidade;
- ausência de regressões.

### 2. Revisão visual
Verifique:
- alinhamento;
- espaçamento;
- tipografia;
- hierarquia;
- tamanhos;
- iconografia;
- cores;
- densidade;
- consistência com o restante do Vecton.

Pergunta final obrigatória:

> Esta tela parece parte de um produto SaaS empresarial premium desenvolvido em 2026 ou parece um sistema interno montado rapidamente?

Se parecer genérica, refine antes de concluir.
