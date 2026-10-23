(function (window) {
  "use strict";
  function validateNode(nodes, node) {
    const code = String(node.account_code || "").trim();
    if (!/^\d+(?:\.\d+)*$/.test(code)) throw new Error("Informe o código contábil da conta.");
    if (!String(node.name || "").trim()) throw new Error("Informe o nome da conta.");
    if (!["Analitica", "Sintetica"].includes(node.node_class)) throw new Error("Selecione o tipo da conta.");
    if (!Number.isInteger(node.sort_order) || node.sort_order < 0) throw new Error("Informe uma ordem válida.");
    if (nodes.some(n => n.id !== node.id && n.account_code === code)) throw new Error("Este código contábil já está cadastrado.");
    if (node.node_class === "Sintetica" && node.group_key) throw new Error("Somente contas analíticas têm chave agrupadora.");
    if (node.node_class === "Analitica" && !String(node.group_key || "").trim()) throw new Error("Informe a chave agrupadora.");
    if (node.node_class === "Analitica" && !node.parent_id) throw new Error("Vincule a conta analítica a uma conta sintética.");
    const children = nodes.filter(n => n.parent_id === node.id);
    if (node.node_class === "Analitica" && children.length) throw new Error("Uma conta com filhas deve permanecer sintética.");
    if (!node.active && children.some(n => n.active)) throw new Error("Inative as contas filhas antes da conta pai.");
    if (children.some(n => !n.account_code.startsWith(code + "."))) throw new Error("O código deve preservar a hierarquia das contas filhas.");
    const visited = new Set([node.id]);
    let parentId = node.parent_id;
    while (parentId) {
      if (visited.has(parentId)) throw new Error("Este vínculo criaria um ciclo.");
      visited.add(parentId);
      const parent = nodes.find(n => n.id === parentId);
      if (!parent || parent.node_class !== "Sintetica") throw new Error("A conta pai deve ser sintética.");
      if (node.active && !parent.active) throw new Error("A conta pai deve estar ativa.");
      if (!code.startsWith(parent.account_code + ".")) throw new Error("O código deve pertencer à hierarquia da conta pai.");
      parentId = parent.parent_id;
    }
    return node;
  }
  function createBpPlanModule(d) {
    const root = d.root, esc = d.escapeHtml;
    let nodes = [], selected = null, draft = null, user = null, org = null, loaded = false, pending = false, busy = false, mounted = false, request = 0;
    const collapsed = new Set();
    const el = q => root.querySelector(q);
    const allowed = () => d.isAdmin() && Boolean(d.getCurrentUserId());
    const current = key => key === request && user === d.getCurrentUserId() && allowed();
    function status(text, error = false) { if (!mounted) return; el('[data-status]').textContent = text; el('[data-status]').setAttribute('role', error ? 'alert' : 'status'); }
    function controls() { root.querySelectorAll('input,select,textarea,button').forEach(n => { n.disabled = busy || !loaded; }); root.querySelectorAll('.tree-toggle.empty').forEach(n => { n.disabled = true; }); if (mounted) { el('[data-refresh]').disabled = busy || pending; hint(); } }
    function hint() {
      const form = el('form'); if (!form) return;
      const analytic = form.elements.node_class.value === 'Analitica';
      form.elements.group_key.disabled = !analytic || busy || !loaded;
      form.elements.group_key.required = analytic;
      el('[data-key-hint]').textContent = analytic ? 'Contas com a mesma chave agrupadora compõem a mesma linha do relatório. O saldo entra uma única vez.' : 'Conta sintética: organiza a hierarquia contábil e não recebe chave agrupadora.';
      el('[data-delete]').disabled = busy || !loaded || Boolean(draft) || !selected;
    }
    function mount() {
      if (mounted) return;
      mounted = true;
      root.innerHTML = `

        <div class="dre-workspace account-plan-workspace bp-plan-workspace">
          <div class="content-card tree-panel"><div class="card-toolbar"><button class="primary-button compact-button" data-add>Adicionar</button><button class="ghost-button" data-refresh>Atualizar</button></div>
          <label class="account-plan-search bp-plan-search">Buscar conta<input data-search type="search" placeholder="Buscar conta…"></label>
          <label class="account-plan-search bp-plan-search">Tipo<select data-filter><option value="">Todas as contas</option><option value="Analitica">Analíticas</option><option value="Sintetica">Sintéticas</option></select></label><p class="toolbar-note account-plan-hint">Somente contas analíticas têm chave agrupadora para compor o relatório.</p><p class="account-plan-status" data-status role="status" aria-live="polite"></p><div class="dre-tree" data-tree></div></div>
          <div class="dre-resizer" data-resizer role="separator" aria-label="Largura da árvore" aria-orientation="vertical" tabindex="0"></div>
          <div class="content-card editor-panel"><div class="editor-header"><p class="section-kicker">Editor</p><h4 data-title>Selecione uma conta</h4></div>
          <form id="bp-plan-form" class="form-grid">
            <label>Código da conta<input name="account_code" required maxlength="120" placeholder="1.1.1.02.002"></label>
            <label>Tipo<select name="node_class"><option value="Analitica">Analítica</option><option value="Sintetica">Sintética</option></select></label>
            <label class="full-span">Nome da conta<input name="name" required maxlength="200"></label>
            <label class="full-span">Conta pai<select name="parent_id"></select></label>
            <label class="full-span">Chave agrupadora<input name="group_key" list="bp-group-keys" maxlength="200"><datalist id="bp-group-keys"></datalist><span class="toolbar-note" data-key-hint></span></label>
            <label>Situação<select name="active"><option value="true">Ativa</option><option value="false">Inativa</option></select></label>
            <label>Ordem de exibição<input name="sort_order" type="number" min="0" step="1" required></label>
            <label class="full-span">Observação<textarea name="note" maxlength="2000" rows="3"></textarea></label>
            <div class="editor-actions full-span"><button class="primary-button" type="submit">Salvar</button><button class="delete-button secondary-danger" data-delete type="button">Remover</button></div>
          </form></div></div>`;
      el('[data-search]').oninput = drawTree;
      el('[data-filter]').onchange = drawTree;
      el('[data-refresh]').onclick = () => { if (!busy) { loaded = false; void render(); } };
      el('[data-add]').onclick = () => {
        const parent = nodes.find(n => n.id === selected);
        draft = { id: crypto.randomUUID(), account_code: '', name: '', node_class: 'Analitica', group_key: '', parent_id: parent?.node_class === 'Sintetica' ? parent.id : parent?.parent_id || null, active: true, sort_order: nodes.length + 1, note: '' };
        selected = null; drawTree(); drawEditor(); el('[name="account_code"]').focus();
      };
      el('[name="node_class"]').onchange = () => { if (el('[name="node_class"]').value === 'Sintetica') el('[name="group_key"]').value = ''; hint(); };
      el('form').onsubmit = async event => {
        event.preventDefault(); if (busy || !allowed()) return;
        const original = draft || nodes.find(n => n.id === selected); if (!original) return;
        const data = new FormData(event.currentTarget), node = { ...original, account_code: data.get('account_code').trim(), name: data.get('name').trim(), node_class: data.get('node_class'), parent_id: data.get('parent_id') || null, group_key: data.get('node_class') === 'Analitica' ? data.get('group_key')?.trim() || null : null, active: data.get('active') === 'true', sort_order: Number(data.get('sort_order')), note: data.get('note').trim() };
        try { validateNode(nodes,node); } catch (error) { status(error.message,true); return; }
        const key = request;
        if (!await d.confirm(`Salvar a conta ${node.account_code} — ${node.name}?`)) return;
        if (!current(key) || busy) return;
        busy = true; controls();
        try {
          const fields = { account_code: node.account_code, name: node.name, node_class: node.node_class, parent_id: node.parent_id, group_key: node.group_key, source_name: node.node_class === 'Analitica' ? node.account_code : null, active: node.active, sort_order: node.sort_order, note: node.note };
          const result = nodes.some(n => n.id === node.id) ? await d.update(org,node.id,fields) : await d.insert({ ...fields, id: node.id, organization_id: org });
          if (!current(key)) return;
          if (result.length !== 1) throw new Error('A conta não foi gravada. Atualize o plano.');
          nodes = [...nodes.filter(n => n.id !== node.id),result[0]]; selected = node.id; draft = null;
          status('Conta salva.'); drawTree(); drawEditor();
        } catch (error) { if (current(key)) status(error.message,true); }
        finally { busy = false; if (current(key)) controls(); }
      };
      el('[data-delete]').onclick = async () => {
        const node = nodes.find(n => n.id === selected), key = request;
        if (!node || busy || !allowed()) return;
        if (nodes.some(n => n.parent_id === node.id)) { status('Remova ou realoque as contas filhas antes de remover esta conta.',true); return; }
        if (!await d.confirm(`Remover a conta ${node.account_code} — ${node.name}?`)) return;
        if (!current(key) || busy) return;
        busy = true; controls();
        try { await d.remove(org,node.id); if (!current(key)) return; nodes = nodes.filter(n => n.id !== node.id); selected = null; drawTree(); drawEditor(); status('Conta removida.'); }
        catch (error) { if (current(key)) status(error.message,true); }
        finally { busy = false; if (current(key)) controls(); }
      };
      const separator = el('[data-resizer]'), workspace = el('.bp-plan-workspace');
      const resize = width => workspace.style.setProperty('--dre-left-width',`${Math.max(30,Math.min(65,width))}%`);
      separator.onpointerdown = event => separator.setPointerCapture(event.pointerId);
      separator.onpointermove = event => { if (separator.hasPointerCapture(event.pointerId)) { const r=workspace.getBoundingClientRect(); resize((event.clientX-r.left)/r.width*100); } };
      separator.onkeydown = event => { if (['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); resize((Number.parseFloat(workspace.style.getPropertyValue('--dre-left-width'))||45)+(event.key==='ArrowRight'?2:-2)); } };
    }
    function drawTree() {
      const query = el('[data-search]').value.trim().toLocaleLowerCase('pt-BR'), filter = el('[data-filter]').value, visible = new Set(), byId = new Map(nodes.map(n => [n.id,n]));
      for (const node of nodes) if ((!filter || node.node_class === filter) && (!query || `${node.account_code} ${node.name} ${node.group_key || ''}`.toLocaleLowerCase('pt-BR').includes(query))) {
        let n=node; while(n && !visible.has(n.id)) { visible.add(n.id); n=byId.get(n.parent_id); }
      }
      const tree = el('[data-tree]'); tree.innerHTML = '';
      function append(parent, target) {
        nodes.filter(n => n.parent_id === parent && visible.has(n.id)).sort((a,b) => a.sort_order-b.sort_order || a.account_code.localeCompare(b.account_code,'pt-BR',{ numeric:true })).forEach(node => {
          const wrap = document.createElement('div'); wrap.className = 'tree-node';
          const row = document.createElement('div'); row.className = `tree-row${node.id === selected ? ' selected' : ''}`;
          const children = nodes.some(n => n.parent_id === node.id), open = query || filter || !collapsed.has(node.id);
          row.innerHTML = `<button type="button" class="tree-toggle ${children?'':'empty'}" ${children?`aria-expanded="${Boolean(open)}"`:'disabled'} aria-label="Expandir ou recolher ${esc(node.account_code)}">${children ? open?'−':'+' : '·'}</button><span class="tree-bullet ${node.node_class==='Sintetica'?'synthetic':'analytic'}"></span><button type="button" class="tree-label bp-plan-select"><strong>${esc(node.account_code)} · ${esc(node.name)}</strong><span>${node.node_class==='Sintetica'?'Sintética':esc(node.group_key || 'Sem chave agrupadora')}${node.active?'':' · Inativa'}</span></button>`;
          row.querySelector('.tree-toggle').onclick = () => { collapsed.has(node.id)?collapsed.delete(node.id):collapsed.add(node.id); drawTree(); };
          row.querySelector('.bp-plan-select').onclick = () => { if (!busy) { selected=node.id; draft=null; drawTree(); drawEditor(); } };
          wrap.append(row); target.append(wrap);
          if (children && open) { const sub=document.createElement('div'); sub.className='tree-children'; wrap.append(sub); append(node.id,sub); }
        });
      }
      append(null,tree); if (!tree.children.length) tree.textContent = 'Nenhuma conta encontrada.';
    }
    function drawEditor() {
      const node=draft || nodes.find(n => n.id === selected), form=el('form'); form.hidden=!node; form.style.display=node?'':'none';
      el('[data-title]').textContent=draft?'Nova conta':node?`${node.account_code} · ${node.name}`:'Selecione uma conta'; if (!node) return;
      const descendants=new Set([node.id]); for(let changed=true;changed;) { changed=false; for(const n of nodes) if(descendants.has(n.parent_id)&&!descendants.has(n.id)) { descendants.add(n.id); changed=true; } }
      form.elements.parent_id.innerHTML='<option value="">Raiz do plano</option>'+nodes.filter(n=>n.node_class==='Sintetica'&&!descendants.has(n.id)).map(n=>`<option value="${esc(n.id)}">${esc(n.account_code)} · ${esc(n.name)}</option>`).join('');
      for(const key of ['account_code','name','node_class','parent_id','group_key','active','sort_order','note']) form.elements[key].value=node[key]??'';
      el('#bp-group-keys').innerHTML=[...new Set(nodes.filter(n=>n.node_class==='Analitica'&&n.group_key).map(n=>n.group_key))].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(key=>`<option value="${esc(key)}"></option>`).join('');
      hint();
    }
    async function render() {
      if (user && (user !== d.getCurrentUserId() || !allowed())) { request++; nodes=[]; selected=null; draft=null; user=null; org=null; loaded=false; mounted=false; root.innerHTML=''; }
      if (d.getActiveView() !== 'bpPlan') return;
      if (!allowed()) { root.textContent='Acesso restrito aos administradores.'; return; }
      mount(); if (pending || loaded) return;
      pending=true; user=d.getCurrentUserId(); const key=++request; status('Carregando Plano de Contas BP…'); drawTree(); drawEditor(); controls();
      try {
        const organization=await d.resolveOrganizationId(), result=await d.fetch(organization);
        if (!current(key)) return;
        org=organization; nodes=result; loaded=true;
        status(`${nodes.length} contas · ${nodes.filter(n=>n.node_class==='Sintetica').length} sintéticas · ${nodes.filter(n=>n.node_class==='Analitica').length} analíticas · ${new Set(nodes.filter(n=>n.node_class==='Analitica'&&n.group_key).map(n=>n.group_key)).size} chaves agrupadoras`);
        drawTree(); drawEditor();
      } catch(error) { if(current(key)) status(`Não foi possível carregar o plano BP: ${error.message}`,true); }
      finally { pending=false; if(current(key)) controls(); }
    }
    return { render };
  }
  window.VECTON_BP_PLAN = { createBpPlanModule, validateNode };
})(window);
