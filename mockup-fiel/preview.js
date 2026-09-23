/* Tema Clear aplicado à árvore original. Sem reconstrução de telas ou gráficos. */
(() => {
  const prefix='html[data-vecton-theme="clear"]';
  const style=document.createElement('style');style.id='preview-adapted-colors';document.head.append(style);
  const colorPattern=/#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b/gi;
  function parse(s){
    if(s==='white')return [255,255,255,1];if(s==='black')return [0,0,0,1];
    if(s[0]==='#'){let h=s.slice(1);if(h.length===3||h.length===4)h=[...h].map(c=>c+c).join('');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),h.length===8?parseInt(h.slice(6,8),16)/255:1];}
    const v=s.match(/[\d.]+/g)?.map(Number);return v?.length>=3?[...v.slice(0,3),v[3]??1]:null;
  }
  function remap(value,property){return value.replace(colorPattern,color=>{
    const c=parse(color.toLowerCase());if(!c)return color;const [r,g,b,a]=c,l=(r+g+b)/3,spread=Math.max(r,g,b)-Math.min(r,g,b);
    const bg=/background|bg|panel|surface|track|overlay|gradient/.test(property);
    const border=/border|line(?!-height)|shadow|outline|scrollbar/.test(property);
    const text=/color|text|faint|muted|soft|fill|stroke/.test(property)&&!bg&&!border;
    const neutral=spread<35||(l<75&&spread<60);
    if(border&&neutral)return `rgba(53,72,102,${a<1?Math.max(.07,a*.5):.18})`;
    if(bg&&neutral){if(a<.5)return `rgba(40,65,100,${Math.min(a*.6,.12)})`;return l<50?'#ffffff':l<100?'#f3f6fa':'#edf2f8';}
    if(text&&neutral){if(a<.4)return `rgba(65,83,111,${Math.max(a,.15)})`;return l>200?'#263348':l>120?'#596a81':l>70?'#68798e':'#34445e';}
    if(!neutral&&text&&a>.6){const scale=l>170?.66:l>130?.8:1;return `rgba(${Math.round(r*scale)},${Math.round(g*scale)},${Math.round(b*scale)},${a})`;}
    return color;
  });}
  function scoped(selector){return selector.split(/,(?![^()]*\))/).map(s=>{s=s.trim();if(s===':root'||s==='html')return prefix;if(s.startsWith(':root'))return s.replace(':root',prefix);if(s.startsWith('html'))return s.replace(/^html/,prefix);return prefix+' '+s;}).join(',');}
  function declarations(decl){let out='';for(const p of decl){if(!/^(--|color$|background|border.*color$|border$|border-(?:top|bottom|left|right)$|box-shadow$|text-shadow$|fill$|stroke$|outline.*color$|scrollbar-color$)/.test(p))continue;const v=decl.getPropertyValue(p),mapped=remap(v,p);if(mapped!==v)out+=`${p}:${mapped}!important;`;}return out;}
  function rules(list){let out='';for(const r of list){if(r.selectorText){const d=declarations(r.style);if(d)out+=`${scoped(r.selectorText)}{${d}}\n`;}else if(r.cssRules&&r.conditionText)out+=`@media ${r.conditionText}{${rules(r.cssRules)}}`;}return out;}
  let next=0,timer,stylesheetSignature='',sheetOverrides='';
  const inlineIds=new WeakMap();
  function adapt(){
    const sheets=[...document.styleSheets].filter(s=>s.ownerNode!==style&&!s.href?.includes('mockup-fiel/clear.css'));
    const signature=sheets.map(s=>s.href||s.ownerNode?.textContent).join('|');
    if(signature!==stylesheetSignature){stylesheetSignature=signature;sheetOverrides='';for(const s of sheets){try{sheetOverrides+=rules(s.cssRules);}catch{}}}
    let inline='';
    for(const el of document.querySelectorAll('[style],[fill],[stroke],[stop-color]')){
      let d=declarations(el.style);
      for(const p of ['fill','stroke','stop-color']){const val=el.getAttribute(p);if(!val||val==='none'||val==='currentColor'||val.startsWith('url'))continue;const mapped=remap(val,el.tagName.toLowerCase()==='text'?'color':p==='fill'?'background':p==='stop-color'?'background':'border-color');if(mapped!==val)d+=`${p}:${mapped}!important;`;}
      if(!d)continue;
      let id=inlineIds.get(el);if(!id){id=String(++next);inlineIds.set(el,id);el.setAttribute('data-preview-palette',id);}
      inline+=`${prefix} [data-preview-palette="${id}"]{${d}}\n`;
    }
    const css=sheetOverrides+inline+`${prefix}{--shadow:0 2px 12px rgba(30,48,80,.04)!important}${prefix} body :is(.kpi-card,.dash-card,.topbar,.cockpit-panel){box-shadow:0 2px 10px rgba(30,48,80,.035)!important;}`;
    if(style.textContent!==css)style.textContent=css;
  }
  const observer=new MutationObserver(records=>{
    if(records.every(r=>r.target===style||r.target.parentNode===style))return;
    clearTimeout(timer);timer=setTimeout(adapt,80);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['style','fill','stroke','stop-color']});
  function theme(value){document.documentElement.dataset.vectonTheme=value==='dark'?'dark':'clear';parent.postMessage({type:'vecton-preview-theme-current',theme:document.documentElement.dataset.vectonTheme},location.origin);adapt();}
  function navigate(id){
    parent.postMessage({type:'vecton-preview-current',id},location.origin);
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    if(id==='login'){document.body.classList.add('auth-only');document.querySelector('#auth-shell').classList.add('active');return;}
    document.body.classList.remove('auth-only');document.querySelector('#auth-shell').classList.remove('active');
    if(id==='profile'){document.querySelector('#profile-trigger').click();return;}
    if(id==='messages'){const b=document.querySelector('#header-messages-btn,[data-action="messages"],#messages-toggle');if(b)b.click();return;}
    if(id.startsWith('report:')){activeView='reports';selectedReportId=id.slice(7);renderNavigation();renderReportsView();return;}
    const button=document.querySelector(`[data-view="${id}"]`);
    if(button)button.click();else {activeView=id;selectedReportId=null;render();}
    // Views aninhadas sem botão próprio permanecem as mesmas views do produto.
    if(id==='fcLoad'){activeView=id;renderNavigation();void fcLoadModule?.render?.();}
  }
  const screens=[...Object.entries(VECTON_CORE_CONSTANTS.VIEW_HEADER_METADATA).map(([id,m])=>({id,title:m.title})),...Array.from(document.querySelectorAll('[data-report-id]')).map(el=>({id:'report:'+el.dataset.reportId,title:(el.querySelector('h3,strong')?.textContent||el.textContent).trim().replace(/\s+/g,' ').slice(0,90)})),{id:'profile',title:'Meu perfil'},{id:'login',title:'Tela de acesso original'}];
  window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent)return;if(e.data.type==='vecton-preview-theme')theme(e.data.theme);if(e.data.type==='vecton-preview-go')navigate(e.data.id);});
  theme('clear');
  window.VECTON_ORIGINAL_PREVIEW={navigate,theme,adapt,screens};
  const ready=setInterval(()=>{if(!currentUser||!PREVIEW_FIXTURES.catalog)return;clearInterval(ready);organizationIdCache=PREVIEW_ORG;parent.postMessage({type:'vecton-preview-ready',screens},location.origin);parent.postMessage({type:'vecton-preview-current',id:'dashboard'},location.origin);adapt();},50);
})();
