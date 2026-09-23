# Vecton UI — DNA visual e padrões de produto

## 1. Identidade do produto

O Vecton é uma plataforma de gestão, planejamento e analytics empresarial.

A interface deve priorizar:
- visão executiva;
- clareza de decisão;
- leitura rápida;
- densidade informacional;
- consistência;
- operação sem atrito.

O produto deve parecer uma única plataforma integrada, mesmo quando reúne módulos diferentes.

## 2. Estrutura principal

Padrão preferencial:
- Sidebar
- Header
- Main Content
- Page Header
- Toolbar / Filter Bar
- Content Area
- Contextual Actions

### Sidebar

Deve:
- ser compacta;
- ser visualmente limpa;
- usar ícones consistentes;
- destacar seção ativa;
- permitir colapso quando apropriado.

Faixa sugerida:
- expandida: 220–260px
- recolhida: 56–72px

### Header

Manter limpo.

Pode conter:
- breadcrumb;
- busca;
- ações globais;
- notificações;
- usuário;
- command palette.

Não usar o header como depósito de ações.

## 3. Page Header

Toda tela deve deixar claro:
1. onde o usuário está;
2. o que está analisando;
3. quais ações pode executar.

Estrutura:
- título;
- subtítulo opcional;
- ações principais à direita;
- filtros/contexto abaixo quando necessário.

## 4. Telas analíticas

Priorizar:
- KPIs compactos;
- gráficos úteis;
- tabelas densas;
- filtros consistentes;
- drill-down;
- leitura executiva rápida.

Evite dashboards decorativos.

## 5. Relatórios

Padrão esperado:
- título claro;
- contexto temporal;
- filtros padronizados;
- resumo executivo;
- tabela ou gráfico principal;
- drill-down;
- exportação quando aplicável.

## 6. Período

Quando a lógica do relatório permitir, utilizar o padrão do Vecton:
- Mês
- YTD
- Ano

Evitar seleção livre de data inicial/final quando a regra funcional do módulo definir períodos padronizados.

## 7. Filtros comuns

Quando aplicável:
- período;
- vendedor;
- representante;
- coordenador;
- gerente;
- produto;
- SKU;
- família;
- cultura;
- território;
- UF;
- cliente;
- linha;
- status.

Filtros devem manter a mesma linguagem visual entre telas.

## 8. KPIs corporativos

Exemplos:
- volume;
- faturamento;
- ticket médio;
- margem;
- EBITDA;
- caixa;
- despesas;
- atingimento;
- superação;
- comissão;
- inadimplência;
- estoque;
- carteira.

Usar formatação brasileira quando aplicável:
- R$;
- separador de milhares;
- casas decimais coerentes;
- percentuais;
- abreviações executivas como mil/mi quando melhorarem leitura.

## 9. Status

Usar badges ou indicadores discretos.

Exemplos:
- Ativo
- Inativo
- Elegível
- Não elegível
- No prazo
- Atrasado
- Pago
- Em aberto
- Realizado
- Orçado
- Forecast

Não depender apenas de cor.

## 10. Navegação entre níveis

Relatórios devem permitir aprofundamento progressivo quando fizer sentido.

Exemplo:
Brasil → UF → Vendedor → Cliente → SKU

Ou:
Resultado → Conta → Centro de Custo → Lançamento

Evitar jogar todos os níveis simultaneamente na tela.

## 11. Mapas

Quando houver visual geográfico:
- preservar legibilidade;
- evitar excesso de cores;
- usar tooltips;
- fornecer ranking complementar;
- permitir drill-down quando apropriado;
- garantir coerência entre mapa, tabela e KPIs.

## 12. Rankings

Rankings devem:
- exibir posição;
- nome;
- valor;
- contexto;
- comparação quando útil.

Evitar estilos excessivamente gamificados em relatórios empresariais.

## 13. Tabelas do Vecton

Preferir tabelas compactas e profissionais.

Suportar, quando necessário:
- sticky header;
- sorting;
- filtros;
- paginação;
- busca;
- exportação;
- congelamento de colunas;
- totalizadores;
- subtotais;
- agrupamentos;
- drill-down.

## 14. Responsividade

Desktop é prioritário, mas notebook deve ser tratado como primeiro cenário real de uso.

Tablet deve permanecer funcional.

Mobile:
- preservar ações essenciais;
- substituir tabelas muito largas por estratégias adequadas;
- não apenas reduzir o desktop.

## 15. Visual de produto empresarial

Evitar:
- gradients desnecessários;
- glassmorphism gratuito;
- neon;
- excesso de animação;
- cards gigantes;
- ilustrações decorativas;
- cores infantis;
- iconografia inconsistente.

## 16. Regras de refinamento

Antes de concluir:
- eliminar redundâncias;
- alinhar títulos e controles;
- revisar paddings;
- revisar densidade;
- reduzir bordas desnecessárias;
- verificar consistência dos ícones;
- revisar números e casas decimais;
- garantir que filtros não dominem a tela.

## 17. Imagens e mockups de referência

Quando o usuário fornecer screenshot, mockup ou imagem:
- tratá-la como referência visual de alta prioridade;
- reproduzir intenção, proporções, espaçamentos, grid, tipografia e hierarquia;
- não substituir elementos por componentes genéricos sem necessidade;
- respeitar a identidade já aprovada.
