/* Injeta dados apenas nas fronteiras de serviço. Não troca nenhum renderizador. */
(() => {
  const F=window.PREVIEW_FIXTURES;
  window.VECTON_CORE_STORAGE.loadState=()=>{
    const s=window.VECTON_CORE_STORAGE.createDemoState();
    s.profile={...s.profile,name:'Avaliação visual',email:'avaliacao@example.test',accessRole:'super_admin',additionalAccessRoles:['comercial','gestao_estrategica','rps_gestao'],role:'Super Admin'};
    s.currentPeriod={year:2026,month:8};
    s.costCenters=s.costCenters.map((c,i)=>({...c,management:F.areas[i%F.areas.length]}));
    return s;
  };
  const createAuth=window.VECTON_AUTH.createAuthModule;
  window.VECTON_AUTH.createAuthModule=deps=>{
    const module=createAuth(deps);
    return {...module,initializeAuth:async()=>{
      [F.catalog,F.fc]=await Promise.all([fetch('tools/strategic-a3-catalog-2026.json').then(r=>r.json()),fetch('mockup-fiel/fc-fixture.json').then(r=>r.json())]);
      const user={id:window.PREVIEW_USER,email:'avaliacao@example.test'};
      deps.setCurrentUser(user);deps.setCurrentSession({user,access_token:'mockup-only',expires_at:Date.now()/1000+86400});
      document.body.classList.remove('auth-only');deps.authShell.classList.remove('active');
      deps.setSyncStatus('Prévia · dados de exemplo','ok');
    },handleLogout:()=>{document.body.classList.add('auth-only');deps.authShell.classList.add('active');}};
  };
  const originalFc=window.VECTON_FC_SERVICE.createService;
  window.VECTON_FC_SERVICE.createService=deps=>{
    const service=originalFc(deps);
    return {...service,load:async()=>({report:window.VECTON_FC_MODEL.parseMatrix(F.fc,2026,new Date(2026,8,23)),batch:{id:'fc-preview',file_name:'FC demonstrativo 2026.xlsx',reference_year:2026,applied_at:'2026-09-23T12:00:00Z'}}),history:async()=>[],scenarios:async()=>[]};
  };
  window.VECTON_COCKPIT_SERVICE.createCockpitService=()=>({
    invalidate(){},
    async load(filters){
      const groups=[{name:'Pessoal e encargos',accounts:['101']},{name:'Serviços de terceiros',accounts:['102']},{name:'Viagens e representação',accounts:['103']},{name:'Despesas gerais',accounts:['104']}];
      const source={actualRows:[],comparisonRows:[],headcountRows:[],comparisonHeadcountRows:[],groups,costCenters:F.areas.map((management,i)=>({id:'cc'+i,number:String(100+i),name:management,management})),accountNames:groups.map((g,i)=>({code:String(101+i),name:g.name})),personnelAccounts:['101'],comparisonLabel:'Budget',hasForecast:true,revenueActual:Array(12).fill(21400000),revenueComparison:Array(12).fill(22100000)};
      for(let month=1;month<=12;month++)for(let i=0;i<10;i++){
        if(filters.management!=='Marcher'&&filters.management!==F.areas[i])continue;
        for(let g=0;g<4;g++){
          const r={reference_month:month,account_number:String(101+g),cost_center_number:String(100+i),amount:(125000+month*3400+i*2800)/(g+1)};
          source.actualRows.push(r);source.comparisonRows.push({...r,amount:r.amount*(i%3===0?.93:1.06)});
        }
        for(let h=0;h<12+i;h++){source.headcountRows.push({reference_month:month,cost_center_number:String(100+i)});source.comparisonHeadcountRows.push({reference_month:month,cost_center_number:String(100+i)});}
      }
      return window.VECTON_COCKPIT_DATA.aggregate(filters,source);
    },async loadHeadcountDetail(){return {total:0,byArea:[]};}
  });
})();
