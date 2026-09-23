/* Isolamento da prévia: nenhum acesso ao backend ou armazenamento do produto. */
(() => {
  const memory=new Map();
  Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i],get length(){return memory.size;}}});
  window.FORECASTAPP_SUPABASE={projectUrl:location.origin+'/mock-api',anonKey:'preview-only',organizationName:'Marcher Brasil'};
  const nativeFetch=window.fetch.bind(window);
  window.PREVIEW_REQUESTS=[];
  window.fetch=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.pathname.startsWith('/mock-api')||url.hostname!==location.hostname){
      window.PREVIEW_REQUESTS.push(url.pathname);
      let payload={};try{payload=JSON.parse(init.body||'{}');}catch{}
      const data=window.PREVIEW_FIXTURES?.response(url,payload,init.method||'GET')??[];
      return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
    }
    return nativeFetch(input,init);
  };
  // As bibliotecas de rede não são inicializadas no mockup.
  window.PREVIEW_ORG='10000000-0000-4000-8000-000000000001';
  window.PREVIEW_USER='20000000-0000-4000-8000-000000000001';
})();
