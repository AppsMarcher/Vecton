/* Somente dados de demonstração, nos contratos dos renderizadores existentes. */
(() => {
  const org=window.PREVIEW_ORG,user=window.PREVIEW_USER;
  const areas=['Diretoria','Controladoria','Recursos Humanos','Supply Chain','Industrial','Engenharia','Marketing','Produto','Qualidade','Comercial'];
  const profile={user_id:user,organization_id:org,full_name:'Usuário de avaliação',email:'avaliacao@example.test',access_role:'super_admin',additional_access_roles:['comercial','gestao_estrategica','rps_gestao'],is_active:true,management:'',photo_kind:'none'};
  const ccs=(window.FORECASTAPP_CC.costCenters||[]).map((c,i)=>({...c,id:'cc-'+i,cost_center_number:c.number,cost_center_name:c.name,management:areas[i%areas.length]}));
  const totals=[],budget=[],ledger=[],people=[];
  const accounts=window.FORECASTAPP_SEED.accounts;
  for(let m=1;m<=12;m++){
    accounts.forEach((a,i)=>{
      const n=a.number;
      let value=n==='31101001'?-17200000:n==='31101002'?-2400000:n==='31101006'?-1800000:n.startsWith('311')?-150000:n.startsWith('312')?220000:n.startsWith('41')?85000:n.startsWith('42')?18000:3500;
      value*=.78+m*.026+Math.sin(m*.9)*.03;
      const row={id:`r-${m}-${i}`,reference_year:2026,reference_month:m,account_number:n,total_amount:value,amount:value,cost_center_number:ccs[i%Math.max(ccs.length,1)]?.number||'100',branch_code:'01',entry_date:`2026-${String(m).padStart(2,'0')}-15`,description:a.name};
      totals.push(row);budget.push({...row,total_amount:value*1.06,amount:value*1.06});ledger.push(row);
    });
    for(let i=0;i<96;i++)people.push({id:`hc-${m}-${i}`,reference_year:2026,reference_month:m,load_type:'realizado',cost_center_number:ccs[i%Math.max(ccs.length,1)]?.number||'100',matricula:String(1000+i),colab:`Colaborador exemplo ${i+1}`,cargo:i%8?'Analista':'Coordenador',amount:1});
  }
  const territories=['RS','SC','PR','MT','GO','MS','SP','MG','BA','EX'];
  const coords=['Sul','Norte','Oeste','Pecuária','Exportação','Peças'];
  const sales=coords.flatMap((coord,i)=>Array.from({length:3},(_,j)=>({coordenacao:coord,regiao:coord,territorio:territories[(i+j)%territories.length],linha:i===5?'Peças':j===2?'Pecuária':'Grão',gestor:`Gestor ${coord}`,responsavel:`Responsável ${i*3+j+1}`,fat_qtd:12+i+j,cart_qtd:3+j,meta_qtd:18+i, fat_val:(12+i+j)*184000,cart_val:(3+j)*184000,meta_val:(18+i)*184000,y1_qtd:10+i,y1_val:(10+i)*174000,y2_qtd:9+i,y2_val:(9+i)*162000,y3_qtd:8+i,y3_val:(8+i)*153000})));
  const towns=[['4305108','Caxias do Sul','RS',-29.16,-51.18],['4314100','Passo Fundo','RS',-28.26,-52.4],['5107925','Sorriso','MT',-12.54,-55.72],['4104808','Cascavel','PR',-24.95,-53.46],['5218805','Rio Verde','GO',-17.79,-50.92]];
  const geo=towns.map(([ibge,city,uf,lat,lng],i)=>({ibge,ibge_code:ibge,municipio_ibge:ibge,cidade:city,municipio:city,city,uf,state:uf,latitude:lat,longitude:lng,lat,lng,qtd:12+i,total_qtd:12+i,valor:(12+i)*184000,total_val:(12+i)*184000,fat_val:(12+i)*184000,fat_qtd:12+i,revenue:(12+i)*184000,quantity:12+i,customers:8+i}));
  const api={totals,budget,ledger,people,ccs,sales,profile,areas,geo,catalog:null,fc:null};
  function a3Kpis(id){const source=api.catalog?.kpis||[];const a3=api.catalog?.a3.find(a=>a.code===id)||api.catalog?.a3[0];let list=source.filter(k=>(k.primaryA3===a3?.code||k.linkedA3s?.includes(a3?.code))&&!k.pending);if(!list.length)list=source.filter(k=>!k.pending).slice(0,4);return list.map((k,i)=>{const pct=/percent|%/.test(k.unit),base=pct?.2:1200000;return {...k,id:k.code||'kpi-'+i,name:k.name||k.title,unit:k.unit||'currency',entryMode:k.entryMode||'manual',decimalPlaces:1,comparisonMode:k.comparisonMode||'higher',recordId:'record-'+i,monthlyValues:Array.from({length:12},(_,j)=>({month:j+1,value:base*(.75+j*.035+(i%2?.05:0)),status:j%3?'on_target':'off_target'})),monthlyTargets:Array.from({length:12},(_,j)=>({month:j+1,value:base})),actualValue:base*.97,targetValue:base,accumulatedActual:base*7.8,accumulatedTarget:base*8};});}
  function rpc(name,p){
    if(name==='dash_opex_by_management')return areas.map((management,i)=>({management,total:190000+i*68000}));
    if(name==='comercial_painel_vendas')return sales;
    if(name==='comercial_painel_tipos')return ['Máquinas','Peças','Transgrain','Acessórios'].map((tipo,i)=>({tipo,...sales[i],fat_val:4200000/(i+1),cart_val:1500000/(i+1),meta_val:5000000/(i+1)}));
    if(name==='comercial_painel_pecas_vendedor')return sales.slice(-3).map((r,i)=>({...r,vendedor:r.responsavel,nome:r.responsavel,cod_vendedor:String(i+1)}));
    if(name==='comercial_painel_detalhe')return sales.map((r,i)=>({...r,cliente:`Cliente exemplo ${i+1}`,produto:'Equipamento agrícola',sku:'MAQ-'+i,valor:r.fat_val,quantidade:r.fat_qtd,data:'2026-08-15'}));
    if(/comercial_mapa/.test(name))return geo;
    if(name==='comercial_pecas_geo_performance')return {kpis:{revenue:3600000,customers:84,invoices:126,revenuePerCustomer:42857,purchasesPerCustomer:1.5,territories:5,previous:{revenue:3200000,customers:78,invoices:118,revenuePerCustomer:41025,purchasesPerCustomer:1.51,territories:5}},documentsReliable:true,territories:geo.map(g=>({...g,territory:g.uf})),topCities:geo,topCustomers:geo.map((g,i)=>({...g,name:`Cliente exemplo ${i+1}`,code:'C00'+i,purchases:4,lastPurchase:'2026-08-15',daysWithoutPurchase:16})),topSkus:[{sku:'PEC-001',description:'Peças de reposição',revenue:1200000,quantity:140}],municipalities:geo,recurringCustomers:[],revenueDistribution:[],recurrenceDistribution:[],updatedAt:'2026-09-23T12:00:00Z'};
    if(name==='strategic_get_overview')return {northGoals:api.catalog?.northGoals||[],areas:(api.catalog?.a3||[]).filter(a=>!a.parent).map(a=>({...a,id:a.code,totalKpis:a3Kpis(a.code).length,onTargetCount:2,notAvailableCount:0,childrenCount:0}))};
    if(name==='strategic_get_a3_detail'){const id=p.p_a3_id;const a=api.catalog?.a3.find(a=>a.code===id)||api.catalog?.a3[0];return {a3:{...a,id:a?.code,objective:'Acompanhamento dos indicadores estratégicos da área.'},kpis:a3Kpis(a?.code)};}
    if(name==='strategic_get_monthly_entry'){const a=api.catalog?.a3.find(a=>a.code===p.p_a3_id)||api.catalog?.a3[0];return {a3:{...a,id:a?.code},kpis:a3Kpis(a?.code),isClosed:false};}
    if(name==='strategic_get_kpi_accumulated_series')return a3Kpis('ebitda')[0];
    return [];
  }
  api.response=(url,p,method)=>{
    const name=url.pathname.split('/').pop();
    if(url.pathname.includes('/json/last/'))return {USDBRL:{bid:'5.24',pctChange:'0.32',create_date:'2026-09-23'},EURBRL:{bid:'6.01',pctChange:'-0.18',create_date:'2026-09-23'},BTCBRL:{bid:'540000',pctChange:'1.12',create_date:'2026-09-23'}};
    if(url.pathname.includes('/api/quote/'))return {results:[{symbol:'^BVSP',regularMarketPrice:132500,regularMarketChangePercent:.45,regularMarketTime:'2026-09-23'}]};
    if(url.pathname.includes('/dados/serie/'))return [{data:'01/08/2026',valor:url.pathname.includes('432')?'14.50':'4.80'}];
    if(url.pathname.includes('/rpc/'))return rpc(name,p);
    let rows=[];
    if(name==='organizations')rows=[{id:org,name:'Marcher Brasil'}];
    else if(name==='organization_members')rows=[{organization_id:org,user_id:user,role:'admin'}];
    else if(name==='user_profiles')rows=[profile,...areas.slice(1,5).map((a,i)=>({...profile,user_id:'user-'+i,full_name:`Usuário ${a}`,access_role:'manager',management:a}))];
    else if(name.includes('monthly_account_totals'))rows=name.includes('budget')?budget:totals;
    else if(name.includes('ledger_entries'))rows=name.includes('budget')?budget:ledger;
    else if(name==='headcount_entries'||name==='forecast_headcount_entries')rows=people;
    else if(name==='managements')rows=areas.map((name,i)=>({id:'mgmt-'+i,name,sort_order:i}));
    else if(name==='forecast_scenarios')rows=[{id:'forecast1',name:'Forecast 8+4',reference_year:2026,cutoff_month:8,is_default:false,color:'#4f7cff',icon:'trend-up',created_at:'2026-09-01T12:00:00Z'},{id:'forecast2',name:'Cenário conservador',reference_year:2026,cutoff_month:8,is_default:false,color:'#14b8a6',created_at:'2026-09-02T12:00:00Z'}];
    else if(name==='cost_centers')rows=ccs;
    else if(name==='branches')rows=[{id:'branch1',branch_code:'01',branch_name:'Matriz Gravataí'},{id:'branch2',branch_code:'02',branch_name:'Filial MT'}];
    else if(name==='accounts')rows=accounts.map((a,i)=>({id:'acc-'+i,account_number:a.number,account_name:a.name,...a}));
    else if(name==='fc_plan_nodes')rows=window.VECTON_FC_STRUCTURE.map(n=>({...n,id:n.seed_key,parent_id:n.parent_key,active:true}));
    else if(name==='strategic_cycles')rows=[{id:'cycle-2026',year:2026}];
    else if(name==='strategic_scenarios')rows=[{id:'scenario-2026',name:'Base'}];
    else if(name==='strategic_a3')rows=(api.catalog?.a3||[]).map(a=>({...a,id:a.code,parent_a3_id:a.parent,management:a.name,objective:'Objetivo estratégico da área',is_active:true}));
    else if(name==='rps_comercial_entries')rows=['norte','sul','oeste','exportacao','pecas','administrativo'].map(area=>({id:area,area_id:area,organization_id:org,version:1,period:'2026-09-21',semana_anterior_texto:'Acompanhamento das visitas e propostas comerciais da semana.',planejamento_atual_texto:'Alinhar as propostas em aberto e o planejamento de entregas.',comentarios_texto:'Registro demonstrativo para avaliação do tema claro.'}));
    else if(name==='comercial_coordenacoes')rows=coords.map((nome,i)=>({id:'coord-'+i,nome,gestor:`Gestor ${nome}`,ativo:true}));
    else if(name==='comercial_territorios')rows=territories.map((nome,i)=>({id:'terr-'+i,nome,uf:nome,ativo:true}));
    else if(name==='comercial_produtos')rows=['Embolsadora','Extratora','Distribuidor'].map((nome,i)=>({id:'prod-'+i,codigo:'MAQ00'+i,sku:'MAQ00'+i,nome,nome_reduzido:nome,ativo:true,tipo:'Máquinas',cultura:'Grão'}));
    else if(name==='comercial_clientes')rows=geo.map((g,i)=>({id:'client-'+i,codigo:'C00'+i,nome:`Cliente exemplo ${i+1}`,cidade:g.cidade,uf:g.uf,ativo:true}));
    else if(name==='comercial_vendedores')rows=sales.map((r,i)=>({id:'seller-'+i,codigo:String(i+1),nome:r.responsavel,cargo:'Vendedor',ativo:true}));
    else if(name==='comercial_tipos')rows=['Máquinas','Peças','Acessórios','Transgrain'].map((nome,i)=>({id:'tipo-'+i,nome,ativo:true}));
    else if(name==='comercial_culturas'||name==='comercial_linhas_negocio')rows=['Grão','Pecuária'].map((nome,i)=>({id:'linha-'+i,nome,ativo:true}));
    else if(name==='market_quotes'||name==='market_commodities')rows=[];
    if(method!=='GET')return [];
    const month=url.searchParams.get('reference_month');if(month?.startsWith('eq.'))rows=rows.filter(r=>r.reference_month===Number(month.slice(3)));
    const parent=url.searchParams.get('parent_a3_id');if(parent?.startsWith('eq.'))rows=rows.filter(r=>r.parent_a3_id===parent.slice(3));
    const gt=url.searchParams.get('id');if(gt?.startsWith('gt.'))return [];
    const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);
    return rows.slice(offset,offset+limit);
  };
  window.PREVIEW_FIXTURES=api;
})();
