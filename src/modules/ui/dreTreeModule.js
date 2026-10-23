(function attachVectonDreTreeModule(window) {
  function createDreTreeModule(deps) {
    const {
      dreTree,
      dreNodeForm,
      ROOT_DRE_NODE,
      escapeHtml,
      getDreChildren,
      findDreNode,
      getNodeTone,
      describeOrigin,
      describeParent,
      getSelectedDreCode,
      setSelectedDreCode,
      getExpandedDreCodes,
      setDragPayload,
      getDragPayload,
      handleDreDrop
    } = deps;

    const search = document.querySelector('#dre-plan-search');
    const normalizeSearch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const typeFilter = document.querySelector('#dre-plan-filter');
    let query = '', filter = '';
    if (typeFilter) typeFilter.addEventListener('change', () => { filter = typeFilter.value; renderDreTree(); });
    const matches = node => ((!filter || node.class === filter) && normalizeSearch(`${node.code} ${node.name}`).includes(query)) || getDreChildren(node.code).some(matches);
    if (search) search.addEventListener('input', () => { query = normalizeSearch(search.value.trim()); renderDreTree(); });
    const refresh = document.querySelector('#dre-plan-refresh');
    if (refresh) refresh.addEventListener('click', async () => {
      if (refresh.disabled) return;
      refresh.disabled = true;
      const status = document.querySelector('#dre-plan-status');
      try { await deps.refreshPlan(); renderDreTree(); renderDreEditor(); if (status) status.textContent = 'Plano atualizado.'; }
      catch (error) { if (status) { status.textContent = error.message; status.setAttribute('role', 'alert'); } }
      finally { refresh.disabled = false; }
    });

    function renderDreTree() {
      if (!dreTree) {
        return;
      }

      dreTree.innerHTML = "";
      const status = document.querySelector('#dre-plan-status');
      if (status) {
        const accounts = [];
        const collect = code => getDreChildren(code).forEach(node => { accounts.push(node); collect(node.code); });
        collect(ROOT_DRE_NODE.code);
        status.setAttribute('role', 'status');
        status.textContent = `${accounts.length} contas · ${accounts.filter(node => node.class === 'Sintetica').length} sintéticas · ${accounts.filter(node => node.class === 'Analitica').length} analíticas`;
      }
      dreTree.append(renderDreNode({ ...ROOT_DRE_NODE }, 0));
      if ((query || filter) && !getDreChildren(ROOT_DRE_NODE.code).some(matches)) {
        dreTree.textContent = 'Nenhuma conta encontrada.';
      }
    }

    function renderDreNode(node, depth) {
      const wrapper = document.createElement("div");
      wrapper.className = "tree-node";
      wrapper.style.setProperty("--depth", String(depth));

      const row = document.createElement("div");
      row.className = "tree-row";
      if (node.code === getSelectedDreCode()) {
        row.classList.add("selected");
      }

      if (node.code !== ROOT_DRE_NODE.code) {
        row.draggable = true;
        row.addEventListener("dragstart", (event) => {
          setDragPayload({ source: "dre", code: node.code });
          row.classList.add("dragging");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", node.code);
        });
        row.addEventListener("dragend", () => {
          setDragPayload(null);
          row.classList.remove("dragging");
          document.querySelectorAll(".tree-row.drop-target").forEach((item) => item.classList.remove("drop-target"));
        });
      }

      row.addEventListener("click", () => {
        if (node.code !== ROOT_DRE_NODE.code) {
          setSelectedDreCode(node.code);
          renderDreTree();
          renderDreEditor();
        }
      });

      row.addEventListener("dragover", (event) => {
        const dragPayload = getDragPayload();
        if (!dragPayload || dragPayload.source !== "dre" || dragPayload.code === node.code) {
          return;
        }
        event.preventDefault();
        row.classList.add("drop-target");
      });

      row.addEventListener("dragleave", () => {
        row.classList.remove("drop-target");
      });

      row.addEventListener("drop", (event) => {
        event.preventDefault();
        row.classList.remove("drop-target");
        const dragPayload = getDragPayload();
        if (!dragPayload || dragPayload.source !== "dre" || dragPayload.code === node.code) {
          return;
        }
        handleDreDrop(dragPayload.code, node.code);
      });

      const children = getDreChildren(node.code).filter(child => (!query && !filter) || matches(child));
      const canExpand = children.length > 0;
      const expandedDreCodes = getExpandedDreCodes();

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = `tree-toggle ${canExpand ? "" : "empty"}`.trim();
      const expanded = Boolean(query || filter) || expandedDreCodes.has(node.code);
      toggle.textContent = canExpand ? (expanded ? "−" : "+") : "·";
      if (canExpand) toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', `Expandir ou recolher ${node.name}`);
      toggle.disabled = !canExpand;
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!canExpand) {
          return;
        }
        if (expandedDreCodes.has(node.code)) {
          expandedDreCodes.delete(node.code);
        } else {
          expandedDreCodes.add(node.code);
        }
        renderDreTree();
      });

      const bullet = document.createElement("span");
      bullet.className = `tree-bullet ${node.class === 'Analitica' ? 'analytic' : 'synthetic'}`;

      const label = document.createElement("div");
      label.className = "tree-label";
      if (node.code === ROOT_DRE_NODE.code) {
        label.innerHTML = `<strong>${escapeHtml(node.name)}</strong>`;
      } else {
        label.innerHTML = `
          <strong>${escapeHtml(node.code)} - ${escapeHtml(node.name)}</strong>
          <span>${escapeHtml(node.class)}${node.origin === "actuals+structure" ? " | base real + DRE Soc" : node.origin === "estrutura" ? " | DRE Soc" : " | manual"}</span>
        `;
      }

      row.append(toggle, bullet, label);
      wrapper.append(row);

      if (canExpand && expanded) {
        const childrenWrap = document.createElement("div");
        childrenWrap.className = "tree-children";
        children.forEach((child) => {
          childrenWrap.append(renderDreNode(child, depth + 1));
        });
        wrapper.append(childrenWrap);
      }

      return wrapper;
    }

    function renderDreEditor() {
      const node = findDreNode(getSelectedDreCode());
      const title = document.querySelector("#dre-editor-title");
      if (!title) {
        return;
      }

      if (!node) {
        title.textContent = "Selecione uma conta";
        dreNodeForm.reset();
        document.querySelector("#dre-node-origin").value = "";
        document.querySelector("#dre-node-parent").value = "";
        return;
      }

      title.textContent = `[ ${node.code} - ${node.name} ]`;
      document.querySelector("#dre-node-code").value = node.code;
      document.querySelector("#dre-node-class").value = node.class;
      document.querySelector("#dre-node-name").value = node.name;
      document.querySelector("#dre-node-origin").value = describeOrigin(node.origin);
      document.querySelector("#dre-node-parent").value = describeParent(node.parentCode);
      document.querySelector("#dre-node-note").value = node.note || "";
    }

    return {
      renderDreTree,
      renderDreEditor
    };
  }

  window.VECTON_DRE_TREE = {
    createDreTreeModule
  };
})(window);
