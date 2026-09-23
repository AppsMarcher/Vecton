/* Catálogo do protótipo: IDs das views e relatórios preservados do Vecton.
   Dados abaixo são inteiramente demonstrativos. Nenhuma conexão ao backend. */
window.MOCKUP_CATALOG = (() => {
  const screens = [];
  const add = (id, title, group, kind, description, extra = {}) => screens.push({id,title,group,kind,description,...extra});
  add('dashboard','Cockpit Executivo','Visão geral','dashboard','Resultado, eficiência e perspectivas em uma visão integrada.');
  add('cockpit','Cockpit Gestão','Visão geral','cockpit','Desempenho, custos e pessoas por gestão.');
  add('reports','Central de relatórios','Relatórios','catalog','As análises da empresa, organizadas em um só lugar.');
  add('rps','Reunião de Performance Semanal','Gestão','rps','Indicadores, metas e evolução semanal por área.');
  add('rpsComercial','RPS Comercial','Gestão','rpsCommercial','O que aconteceu. O que vem a seguir.');
  add('strategic','A3 Estratégicos','Gestão','strategic','Conecte o Norte Verdadeiro à execução de cada área.');
  add('planning','Repositório de Cenários','Planejamento','planning','Compare possibilidades e construa o próximo resultado.');
  const reports = [
    ['comercialPainel','Painel de Vendas','Comercial','sales','Volume, faturamento e atingimento por coordenação.'],
    ['comercialMapa','Mapa de Vendas','Comercial','salesMatrix','Territórios, responsáveis e resultados comerciais.'],
    ['comercialMapaGeografico','Mapa Geográfico · Máquinas','Comercial','map','Distribuição das vendas por UF, cliente e produto.'],
    ['comercialPecasGeo','Performance Geográfica · Peças','Comercial','parts','Faturamento e cobertura da carteira por vendedor.'],
    ['cashFlow','Fluxo de Caixa','Fluxo de Caixa','cashflow','Geração, saídas e posição de caixa no período.'],
    ...[['Soc','Societário'],['Ger','Gerencial'],['Dfs','DFs']].flatMap(([key,title]) => [
      [`dre${key}Real`,`DRE ${title} · Realizado`,'DRE','dre',`Resultado ${title.toLowerCase()} realizado, por competência.`],
      [`dre${key}Budget`,`DRE ${title} · Planejado`,'DRE','dre',`Budget e cenários de forecast na visão ${title.toLowerCase()}.`]
    ]),
    ['opexReal','OPEX · Realizado','OPEX','opex','Despesas por gestão, conta e centro de custo.'],
    ['opexBudget','OPEX · Planejado','OPEX','opex','Despesas orçadas e cenários de forecast.'],
    ['headcountReal','Headcount · Realizado','Headcount','headcount','Quadro de pessoas por gestão e centro de custo.'],
    ['headcountBudget','Headcount · Planejado','Headcount','headcount','Planejamento de pessoas e evolução mensal.'],
    ['customReport','Resultado por gestão','Personalizados','customReport','Exemplo de relatório financeiro personalizado.'],
    ['campaign','Campanha comercial','Personalizados','campaign','Elegibilidade, atingimento e premiação por vendedor.']
  ];
  reports.forEach(([id,title,section,kind,description])=>add(id,title,'Relatórios',kind,description,{section}));
  add('reportBuilder','Report Builder','Relatórios','builder','Configure linhas, fontes, fórmulas e apresentação.');
  add('commercialBuilder','Criador de relatórios comerciais','Relatórios','commercialBuilder','Do desempenho individual às campanhas do time.');
  const registry = {
    branchPlan:['Código','Empresa / filial','UF','Status'],
    drePlan:['Código','Descrição','Classe','Conta vinculada'],
    fcPlan:['Código','Descrição','Classe','Natureza'],
    managements:['Código','Gestão','Responsável','Status'],
    ccPlan:['Código','Centro de custo','Gestão','Classe'],
    comProdutos:['SKU','Produto','Linha de negócio','Cultura'],
    comClientes:['Código','Cliente','Cidade / UF','Status'],
    comTerritorios:['Código','Território','Coordenação','Status'],
    comCoordenacoes:['Código','Coordenação','Gestor','Status'],
    comTipos:['Código','Tipo','Modalidade','Status'],
    comCulturas:['Código','Cultura','Descrição','Status'],
    comLinhasNegocio:['Código','Linha de negócio','Descrição','Status'],
    comVendedores:['Código','Nome','Cargo','Vigência'],
    comAtribuicao:['Território','Responsável','Coordenação','Vigência']
  };
  Object.entries(window.VECTON_CORE_CONSTANTS.VIEW_HEADER_METADATA).forEach(([id,meta])=>{
    if(screens.some(s=>s.id===id))return;
    const kind = ['drePlan','fcPlan','ccPlan','branchPlan'].includes(id)?'tree':registry[id]?'registry':/Load|comercialVendas|comercialPlanejado/.test(id)?'import':id;
    add(id,meta.title,/^com/.test(id)?'Cadastros comerciais':'Parâmetros',kind,
      kind==='import'?'Carregue, valide e acompanhe a aplicação dos dados.':kind==='tree'?'Estrutura hierárquica e vínculos utilizados nas análises.':kind==='registry'?'Mantenha os dados de referência da operação.':'Administração e preferências da plataforma.',{columns:registry[id]});
  });
  [
    ['scenarioEdit','Editar cenário','Planejamento','scenario','Realizado preservado. Próximos meses replanejados.'],
    ['scenarioCompare','Comparar cenários','Planejamento','compare','Avalie o impacto de cada cenário no resultado anual.'],
    ['fcDetail','Fluxo de Caixa · Detalhado','Fluxo de Caixa','fcDetail','Real protegido; meses Fcst/Bud disponíveis para simulação.'],
    ['fcScenarios','Cenários de Caixa','Fluxo de Caixa','fcScenarios','Cenários pessoais e compartilhados da organização.'],
    ['a3Detail','A3 · Industrial','Gestão estratégica','a3Detail','Eficiência operacional, qualidade e entrega.'],
    ['a3Entry','A3 · Lançamento mensal','Gestão estratégica','a3Entry','Registre o realizado e as evidências de cada indicador.'],
    ['a3Actions','A3 · Plano de ação','Gestão estratégica','actions','Responsáveis, prazos e contramedidas para os desvios.'],
    ['a3Archived','A3 · Itens arquivados','Gestão estratégica','archived','Histórico de áreas e indicadores arquivados.'],
    ['rpsHistory','RPS · Histórico e backups','Gestão','history','Versões recuperáveis e registros de alteração.'],
    ['rpsPresentation','RPS · Apresentação','Gestão','presentation','Leitura focada para conduzir a reunião semanal.'],
    ['rpsCommercialPresentation','RPS Comercial · Apresentação','Gestão','commercialPresentation','Agenda comercial por região e semana.'],
    ['importReview','Validação da carga','Cargas','importReview','Revise as inconsistências antes de aplicar o lote.'],
    ['messages','Vecton Messenger','Colaboração','messages','Conversas e alinhamentos da equipe.'],
    ['inbox','Central de notificações','Colaboração','inbox','Atualizações de cargas, relatórios e planos de ação.'],
    ['profile','Meu perfil e aparência','Conta','profile','Escolha como você quer trabalhar no Vecton.'],
    ['login','Acesse sua conta','Acesso','auth','Entre para continuar.'],
    ['forgotPassword','Recuperar acesso','Acesso','auth','Receba as instruções para redefinir sua senha.'],
    ['resetPassword','Definir nova senha','Acesso','auth','Crie uma senha para voltar à sua conta.'],
    ['invite','Ativar conta','Acesso','auth','Seu espaço de trabalho está pronto.'],
    ['designSystem','Design system','Avaliação','designSystem','Tokens semânticos e componentes compartilhados entre Clear e Dark.'],
    ['screenIndex','Todas as telas','Avaliação','screenIndex','Inventário navegável da arquitetura atual e dos fluxos do protótipo.']
  ].forEach(x=>add(...x));
  return screens;
})();

window.MOCKUP_DATA = {
  areas:['Diretoria','Controladoria','Recursos Humanos','Supply Chain','Industrial','Engenharia','Marketing','Produto','Qualidade','Comercial'],
  commercialAreas:['Norte','Sul','Oeste','Exportação','Peças','Administrativo'],
  registries:{
    branchPlan:[['01','Matriz Gravataí','RS','Ativo'],['02','Filial Mato Grosso','MT','Ativo']],
    managements:[['01','Industrial','Marina Costa','Ativo'],['02','Comercial','Lucas Martins','Ativo'],['03','Supply Chain','Ana Ferreira','Ativo'],['04','Controladoria','Pedro Alves','Ativo'],['05','Engenharia','Camila Silva','Ativo']],
    comProdutos:[['MAQ-001','Embolsadora de grãos','Máquinas','Grãos'],['MAQ-002','Extratora de grãos','Máquinas','Grãos'],['MAQ-003','Embolsadora de forragem','Máquinas','Pecuária'],['PEC-001','Kit de manutenção','Peças','—'],['ACS-001','Conjunto de acessórios','Acessórios','—']],
    comClientes:[['C0001','Agro Horizonte','Passo Fundo / RS','Ativo'],['C0002','Fazenda Primavera','Sorriso / MT','Ativo'],['C0003','Cooperativa Campo Novo','Cascavel / PR','Ativo'],['C0004','Estância Boa Vista','Rio Verde / GO','Ativo'],['C0005','Agro Sul','Chapecó / SC','Ativo']],
    comTerritorios:[['T01','Rio Grande do Sul','Sul','Ativo'],['T02','Paraná / Santa Catarina','Sul','Ativo'],['T03','Mato Grosso','Norte','Ativo'],['T04','Goiás / Distrito Federal','Oeste','Ativo'],['T05','Mercado externo','Exportação','Ativo']],
    comCoordenacoes:[['01','Norte','Ana Ferreira','Ativo'],['02','Sul','Lucas Martins','Ativo'],['03','Oeste','Marina Costa','Ativo'],['04','Exportação','Pedro Alves','Ativo'],['05','Peças','Camila Silva','Ativo'],['06','Comercial Administrativo','Rafael Lima','Ativo']],
    comTipos:[['01','Máquinas','Volume e valor','Ativo'],['02','Peças','Valor','Ativo'],['03','Acessórios','Valor','Ativo'],['04','Transgrain','Valor','Ativo']],
    comCulturas:[['01','Grãos','Armazenagem de grãos','Ativo'],['02','Pecuária','Forragem e silagem','Ativo']],
    comLinhasNegocio:[['01','Máquinas','Equipamentos agrícolas','Ativo'],['02','Peças','Reposição e manutenção','Ativo'],['03','Acessórios','Complementos de equipamentos','Ativo'],['04','Transgrain','Movimentação de grãos','Ativo']],
    comVendedores:[['V001','Lucas Martins','Vendedor','Jan–Dez/2026'],['V002','Ana Ferreira','Representante Comercial','Jan–Dez/2026'],['V003','Marina Costa','Coordenador Sul','Jan–Dez/2026'],['V004','Pedro Alves','Especialista Exportação','Jan–Dez/2026']],
    comAtribuicao:[['Rio Grande do Sul','Lucas Martins','Sul','Jan–Dez/2026'],['Paraná / Santa Catarina','Marina Costa','Sul','Jan–Dez/2026'],['Mato Grosso','Ana Ferreira','Norte','Jan–Dez/2026'],['Mercado externo','Pedro Alves','Exportação','Jan–Dez/2026']]
  },
  sales:[['Sul',14.4,13.5,48],['Norte',12.0,11.5,40],['Oeste',9.6,10.0,32],['Exportação',6.0,6.5,20]],
  opex:[['Pessoal e encargos',4.8,4.9],['Serviços de terceiros',1.7,1.8],['Logística e viagens',1.2,1.3],['Manutenção',.9,1.0],['Despesas administrativas',1.0,1.1]],
  people:[['Industrial',146,150],['Comercial',36,35],['Supply Chain',28,28],['Engenharia',22,24],['Administrativo',24,25]],
  dre:[['Receita bruta',48,46],['Deduções da receita',-6,-5.75],['Receita líquida',42,40.25],['Custo dos produtos vendidos',-24,-23.25],['Lucro bruto',18,17],['Despesas operacionais',-9.6,-10.1],['EBITDA',8.4,6.9],['Depreciação e amortização',-1.2,-1.1],['Resultado financeiro',-.8,-.7],['Resultado antes dos tributos',6.4,5.1],['IRPJ e CSLL',-2.176,-1.734],['Lucro líquido',4.224,3.366]],
  cash:[['Saldo inicial',12.6],['Recebimentos operacionais',42],['Pagamentos operacionais',-32.4],['Caixa operacional',9.6],['Investimentos',-4.8],['Financiamentos',-1.6],['Geração líquida',3.2],['Saldo final',15.8]],
  kpis:[['Eficiência operacional','%',85,88.2,'Maior melhor'],['Entregas no prazo','%',95,92.4,'Maior melhor'],['Índice de retrabalho','%',2,1.8,'Menor melhor'],['Horas de parada','h',40,46,'Menor melhor']]
};
