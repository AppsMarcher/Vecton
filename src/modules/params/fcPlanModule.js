(function attachFcPlan(window) {
  "use strict";
  const normalize = value => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

  function validateNode(nodes, node) {
    if (!node.name?.trim()) throw new Error("Informe o nome da conta.");
    if (!["Analitica", "Sintetica"].includes(node.node_class)) throw new Error("Selecione a classe da conta.");
    if (!Number.isInteger(node.sort_order) || node.sort_order < 0) throw new Error("A ordem deve ser um inteiro positivo ou zero.");
    const children = nodes.filter(item => item.parent_id === node.id);
    if (node.node_class === "Analitica" && children.length) throw new Error("Uma conta com filhas deve permanecer sintética.");
    if (!node.active && children.some(item => item.active)) throw new Error("Inative as contas filhas antes da conta pai.");
    if (node.node_class === "Analitica" && !node.source_name?.trim()) throw new Error("Informe a descrição da conta no arquivo de carga.");
    if (node.node_class === "Analitica" && !node.parent_id) throw new Error("Vincule a conta analítica a uma conta pai.");
    const visited = new Set([node.id]);
    let parentId = node.parent_id;
    while (parentId) {
      if (visited.has(parentId)) throw new Error("Este vínculo criaria um ciclo na hierarquia.");
      visited.add(parentId);
      const parent = nodes.find(item => item.id === parentId);
      if (!parent || parent.node_class !== "Sintetica") throw new Error("A conta pai deve ser uma conta sintética existente.");
      if (node.active && !parent.active) throw new Error("Uma conta ativa precisa de uma conta pai ativa.");
      parentId = parent.parent_id;
    }
    if (node.node_class === "Analitica" && nodes.some(item => item.id !== node.id && item.node_class === "Analitica" && item.parent_id === node.parent_id && normalize(item.source_name) === normalize(node.source_name))) {
      throw new Error("Já existe uma conta com essa descrição de carga neste grupo.");
    }
    return node;
  }

  function createFcPlanModule(deps) {
    const root = deps.root;
    let nodes = [], selectedId = null, draft = null, context = null, loaded = false, pending = false, busy = false;
    let collapsed = new Set(), dragging = null, mounted = false;
    const esc = deps.escapeHtml;
    const el = selector => root.querySelector(selector);
    const allowed = () => deps.isAdmin() && Boolean(deps.getCurrentUserId());
    const sessionKey = () => deps.getCurrentUserId();

    function mount() {
      if (mounted) return;
      mounted = true;
      root.innerHTML = `
        <p class="toolbar-note">Contas do fluxo de caixa por empresa. Sintéticas agrupam e calculam; analíticas recebem os movimentos da carga.</p>
        <p id="fc-plan-status" role="status" aria-live="polite"></p>
        <div class="dre-workspace fc-plan-workspace">
          <div class="content-card tree-panel">
            <div class="card-toolbar"><button type="button" id="fc-plan-add" class="primary-button compact-button">Adicionar</button><button type="button" id="fc-plan-refresh" class="ghost-button">Atualizar</button></div>
            <label class="fc-plan-search">Buscar conta<input type="search" id="fc-plan-search" placeholder="Nome ou descrição no arquivo"></label>
            <p class="toolbar-note">Arraste para uma conta sintética ou altere a conta pai no editor.</p>
            <div id="fc-plan-tree" class="dre-tree"></div>
          </div>
          <div class="dre-resizer" id="fc-plan-resizer" role="separator" aria-label="Largura da árvore" aria-orientation="vertical" tabindex="0"></div>
          <div class="content-card editor-panel">
            <div class="editor-header"><p class="section-kicker">Editor</p><h4 id="fc-plan-title">Selecione uma conta</h4></div>
            <form id="fc-plan-form" class="form-grid">
              <label class="full-span">Nome da conta<input name="name" required maxlength="200"></label>
              <label>Classe<select name="node_class"><option value="Analitica">Analítica</option><option value="Sintetica">Sintética</option></select></label>
              <label>Situação<select name="active"><option value="true">Ativa</option><option value="false">Inativa</option></select></label>
              <label class="full-span">Conta pai<select name="parent_id"></select></label>
              <label class="full-span">Descrição no arquivo de carga<input name="source_name" maxlength="200"><span class="toolbar-note">Identificação pela descrição dentro do grupo, sem código obrigatório.</span></label>
              <label>Ordem de exibição<input name="sort_order" type="number" min="0" max="2147483647" step="1" required></label>
              <label>Origem<input name="origin" disabled></label>
              <label class="full-span">Observação<textarea name="note" rows="3" maxlength="2000"></textarea></label>
              <p class="toolbar-note full-span" id="fc-plan-class-hint"></p>
              <div class="editor-actions full-span"><button class="primary-button" type="submit">Salvar</button><button class="delete-button secondary-danger" id="fc-plan-delete" type="button">Remover</button></div>
            </form>
          </div>
        </div>`;
      el("#fc-plan-add").onclick = () => {
        if (!loaded || busy) return;
        const selected = nodes.find(item => item.id === selectedId);
        selectedId = null;
        draft = { id: crypto.randomUUID(), name: "", node_class: "Analitica", parent_id: selected?.node_class === "Sintetica" ? selected.id : selected?.parent_id || null, source_name: "", active: true, sort_order: 100, note: "" };
        drawTree(); drawEditor(); el('[name="name"]').focus();
      };
      el("#fc-plan-refresh").onclick = () => { if (!busy) { loaded = false; void render(); } };
      el("#fc-plan-search").oninput = drawTree;
      el("#fc-plan-form").onsubmit = event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const original = draft || nodes.find(item => item.id === selectedId);
        if (!original) return;
        const node = { ...original, name: data.get("name").trim(), node_class: data.get("node_class"), active: data.get("active") === "true", parent_id: data.get("parent_id") || null, source_name: data.get("source_name")?.trim() || null, sort_order: Number(data.get("sort_order")), note: data.get("note").trim() };
        if (node.node_class === "Sintetica") node.source_name = null;
        void save(node);
      };
      el('[name="node_class"]').onchange = classHint;
      el("#fc-plan-delete").onclick = remove;
      const separator = el("#fc-plan-resizer"), workspace = el(".fc-plan-workspace");
      const resize = width => workspace.style.setProperty("--dre-left-width", `${Math.max(30, Math.min(65, width))}%`);
      separator.onpointerdown = event => { separator.setPointerCapture(event.pointerId); };
      separator.onpointermove = event => {
        if (!separator.hasPointerCapture(event.pointerId)) return;
        const rect = workspace.getBoundingClientRect();
        resize((event.clientX - rect.left) / rect.width * 100);
      };
      separator.onkeydown = event => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        resize((parseFloat(workspace.style.getPropertyValue("--dre-left-width")) || 38) + (event.key === "ArrowLeft" ? -2 : 2));
      };
    }

    function status(message, error = false) {
      if (!mounted) return;
      el("#fc-plan-status").textContent = message;
      el("#fc-plan-status").setAttribute("role", error ? "alert" : "status");
    }
    function controls() {
      if (!mounted) return;
      root.querySelectorAll("button, input, select, textarea").forEach(node => { node.disabled = busy || !loaded; });
      root.querySelectorAll(".tree-row").forEach(node => { node.draggable = loaded && !busy; });
      root.querySelectorAll(".tree-toggle.empty").forEach(node => { node.disabled = true; });
      el("#fc-plan-refresh").disabled = busy || pending;
      el('[name="origin"]').disabled = true;
      el("#fc-plan-delete").disabled = busy || !loaded || Boolean(draft) || !selectedId;
      if (loaded && !busy) classHint();
    }
    function drawTree() {
      const tree = el("#fc-plan-tree"); tree.innerHTML = "";
      const query = normalize(el("#fc-plan-search").value);
      const visible = new Set();
      for (const node of nodes) {
        if (!query || normalize(`${node.name} ${node.source_name || ""}`).includes(query)) {
          let item = node;
          while (item && !visible.has(item.id)) { visible.add(item.id); item = nodes.find(n => n.id === item.parent_id); }
        }
      }
      function append(parentId, depth, container = tree) {
        nodes.filter(n => n.parent_id === parentId && visible.has(n.id)).sort((a,b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR")).forEach(node => {
          const wrapper = document.createElement("div"); wrapper.className = "tree-node"; wrapper.style.setProperty("--depth", depth);
          const row = document.createElement("div"); row.className = `tree-row${node.id === selectedId ? " selected" : ""}`;
          const children = nodes.some(n => n.parent_id === node.id);
          row.innerHTML = `<button type="button" class="tree-toggle ${children ? "" : "empty"}" aria-label="${collapsed.has(node.id) ? "Expandir" : "Recolher"} ${esc(node.name)}" ${children ? `aria-expanded="${!collapsed.has(node.id) || Boolean(query)}"` : "disabled"}>${children ? collapsed.has(node.id) && !query ? "+" : "−" : "·"}</button><span class="tree-bullet ${node.node_class === "Sintetica" ? "synthetic" : "analytic"}"></span><button type="button" class="tree-label fc-plan-select"><strong>${esc(node.name)}</strong><span>${node.node_class === "Sintetica" ? "Sintética · calculada" : "Analítica"}${node.active ? "" : " · Inativa"}</span></button>`;
          row.querySelector(".tree-toggle").onclick = () => { collapsed.has(node.id) ? collapsed.delete(node.id) : collapsed.add(node.id); drawTree(); };
          row.querySelector(".fc-plan-select").onclick = () => { if (busy) return; selectedId = node.id; draft = null; drawTree(); drawEditor(); };
          row.draggable = !busy;
          row.ondragstart = event => { dragging = node.id; event.dataTransfer.setData("text/plain", node.id); event.dataTransfer.effectAllowed = "move"; };
          row.ondragend = () => { dragging = null; root.querySelectorAll(".drop-target").forEach(n => n.classList.remove("drop-target")); };
          row.ondragover = event => { if (!busy && dragging && node.node_class === "Sintetica") { event.preventDefault(); row.classList.add("drop-target"); } };
          row.ondragleave = () => row.classList.remove("drop-target");
          row.ondrop = event => { event.preventDefault(); row.classList.remove("drop-target"); const moving = nodes.find(n => n.id === dragging); dragging = null; if (moving && !busy) void save({ ...moving, parent_id: node.id }); };
          wrapper.append(row); container.append(wrapper);
          if (children && (query || !collapsed.has(node.id))) {
            const childContainer = document.createElement("div"); childContainer.className = "tree-children";
            wrapper.append(childContainer); append(node.id, depth + 1, childContainer);
          }
        });
      }
      append(null, 0);
      if (!tree.children.length) tree.textContent = query ? "Nenhuma conta encontrada." : "Nenhuma conta cadastrada.";
    }
    function classHint() {
      const synthetic = el('[name="node_class"]').value === "Sintetica";
      el('[name="source_name"]').disabled = synthetic || busy;
      el('[name="source_name"]').required = !synthetic;
      el("#fc-plan-class-hint").textContent = synthetic ? "O valor desta conta será calculado a partir das contas filhas." : "Esta conta receberá os valores mensais do arquivo de fluxo de caixa.";
    }
    function drawEditor() {
      const node = draft || nodes.find(n => n.id === selectedId), form = el("#fc-plan-form");
      form.style.display = node ? "" : "none";
      el("#fc-plan-title").textContent = draft ? "Nova conta" : node?.name || "Selecione uma conta";
      if (!node) return;
      const excluded = new Set([node.id]);
      for (let changed = true; changed;) { changed = false; nodes.forEach(n => { if (excluded.has(n.parent_id) && !excluded.has(n.id)) { excluded.add(n.id); changed = true; } }); }
      const path = n => { const parts = [n.name]; let p = nodes.find(item => item.id === n.parent_id); while (p) { parts.unshift(p.name); p = nodes.find(item => item.id === p.parent_id); } return parts.join(" › "); };
      form.elements.parent_id.innerHTML = '<option value="">Raiz do plano</option>' + nodes.filter(n => n.node_class === "Sintetica" && !excluded.has(n.id)).map(n => `<option value="${esc(n.id)}">${esc(path(n))}</option>`).join("");
      for (const key of ["name", "node_class", "active", "parent_id", "source_name", "sort_order", "note"]) form.elements[key].value = node[key] ?? "";
      form.elements.origin.value = node.source_row ? `Excel · linha ${node.source_row}` : "Cadastro manual";
      form.elements.origin.disabled = true;
      el("#fc-plan-delete").disabled = busy || Boolean(draft);
      classHint();
    }
    async function save(node) {
      if (busy || !loaded || !allowed()) return;
      try { validateNode(nodes, node); } catch (error) { status(error.message, true); return; }
      const key = context;
      busy = true; controls();
      try {
        const fields = { name: node.name, node_class: node.node_class, source_name: node.source_name, parent_id: node.parent_id, active: node.active, sort_order: node.sort_order, note: node.note || "" };
        const existing = nodes.some(n => n.id === node.id);
        const saved = existing ? await deps.update(key.org, node.id, fields) : await deps.insert({ ...fields, id: node.id, organization_id: key.org });
        if (key !== context || key.user !== sessionKey()) return;
        if (saved.length !== 1) throw new Error("A conta não foi gravada. Atualize o plano e confira suas permissões.");
        nodes = [...nodes.filter(n => n.id !== node.id), saved[0]];
        selectedId = node.id; draft = null; collapsed.delete(node.parent_id);
        status("Conta salva."); drawTree(); drawEditor();
      } catch (error) { if (key === context) status(`Não foi possível salvar: ${error.message}`, true); }
      finally { busy = false; if (key === context) controls(); }
    }
    async function remove() {
      if (busy || !loaded || !allowed()) return;
      const node = nodes.find(n => n.id === selectedId), key = context;
      if (!node) return;
      if (nodes.some(n => n.parent_id === node.id)) { status("Remova ou realoque as contas filhas antes de remover esta conta.", true); return; }
      if (!await deps.confirm(`Remover a conta “${node.name}”?`)) return;
      if (key !== context || key.user !== sessionKey() || !allowed() || busy) return;
      busy = true; controls();
      try {
        await deps.remove(key.org, node.id);
        if (key !== context || key.user !== sessionKey()) return;
        nodes = nodes.filter(n => n.id !== node.id); selectedId = null;
        status("Conta removida."); drawTree(); drawEditor();
      } catch (error) { if (key === context) status(`Não foi possível remover: ${error.message}`, true); }
      finally { busy = false; if (key === context) controls(); }
    }
    async function render() {
      if (context && (context.user !== sessionKey() || !allowed())) {
        context = null; nodes = []; loaded = false; selectedId = null; draft = null; mounted = false; root.innerHTML = "";
      }
      if (deps.getActiveView() !== "fcPlan") return;
      if (!allowed()) { root.textContent = "Acesso restrito aos administradores, conforme o perfil do Vecton."; mounted = false; loaded = false; context = null; nodes = []; return; }
      mount();
      if (context?.user !== sessionKey()) { loaded = false; nodes = []; selectedId = null; draft = null; }
      if (pending || loaded) return;
      pending = true; drawTree(); drawEditor(); controls(); status("Carregando plano de contas FC…");
      const user = sessionKey();
      try {
        const org = await deps.resolveOrganizationId();
        const result = await deps.fetch(org);
        if (user !== sessionKey() || !allowed()) return;
        context = { user, org }; nodes = result; loaded = true;
        status(`${nodes.filter(n => n.node_class === "Analitica").length} contas analíticas · ${nodes.filter(n => n.node_class === "Sintetica").length} contas sintéticas`);
        drawTree(); drawEditor();
      } catch (error) { status(`Não foi possível carregar o plano FC. Confira a conexão e a instalação do módulo no banco. ${error.message}`, true); }
      finally { pending = false; controls(); }
    }
    return { render };
  }
  window.VECTON_FC_PLAN = { createFcPlanModule, validateNode };
})(window);
