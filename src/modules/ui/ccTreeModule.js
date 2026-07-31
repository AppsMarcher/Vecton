(function attachVectonCcTreeModule(window) {
  const { COST_CENTER_MANAGEMENT_OPTIONS } = window.VECTON_CORE_CONSTANTS;

  function createCcTreeModule(deps) {
    const {
      ccTree,
      ccNodeForm,
      ROOT_CC_NODE,
      escapeHtml,
      getCcChildren,
      findCcNode,
      describeCcParent,
      getSelectedCcCode,
      setSelectedCcCode,
      getExpandedCcCodes,
      setDragPayload,
      getDragPayload,
      handleCcDrop,
      getLinkedCostCenter,
      getManagements
    } = deps;

    function renderCcTree() {
      if (!ccTree) {
        return;
      }

      ccTree.innerHTML = "";
      ccTree.append(renderCcNode({ ...ROOT_CC_NODE }, 0));
    }

    function renderCcNode(node, depth) {
      const wrapper = document.createElement("div");
      wrapper.className = "tree-node";
      wrapper.style.setProperty("--depth", String(depth));

      const row = document.createElement("div");
      row.className = "tree-row";
      if (node.code === getSelectedCcCode()) {
        row.classList.add("selected");
      }

      if (node.code !== ROOT_CC_NODE.code) {
        row.draggable = true;
        row.addEventListener("dragstart", (event) => {
          setDragPayload({ source: "cc", code: node.code });
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
        if (node.code !== ROOT_CC_NODE.code) {
          setSelectedCcCode(node.code);
          renderCcTree();
          renderCcEditor();
        }
      });

      row.addEventListener("dragover", (event) => {
        const dragPayload = getDragPayload();
        if (!dragPayload || dragPayload.source !== "cc" || dragPayload.code === node.code) {
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
        if (!dragPayload || dragPayload.source !== "cc" || dragPayload.code === node.code) {
          return;
        }
        handleCcDrop(dragPayload.code, node.code);
      });

      const children = getCcChildren(node.code);
      const canExpand = children.length > 0;
      const expandedCcCodes = getExpandedCcCodes();

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = `tree-toggle ${canExpand ? "" : "empty"}`.trim();
      toggle.textContent = canExpand ? (expandedCcCodes.has(node.code) ? "-" : "+") : ".";
      toggle.disabled = !canExpand;
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!canExpand) {
          return;
        }
        if (expandedCcCodes.has(node.code)) {
          expandedCcCodes.delete(node.code);
        } else {
          expandedCcCodes.add(node.code);
        }
        renderCcTree();
      });

      const bullet = document.createElement("span");
      bullet.className = `tree-bullet ${node.class === "Sintetica" || node.code === ROOT_CC_NODE.code ? "synthetic" : "actual"}`;

      const label = document.createElement("div");
      label.className = "tree-label";
      if (node.code === ROOT_CC_NODE.code) {
        label.innerHTML = `<strong>${escapeHtml(node.name)}</strong>`;
      } else {
        label.innerHTML = `
          <strong>${escapeHtml(node.code)} - ${escapeHtml(node.name)}</strong>
          <span>${escapeHtml(node.class)} | ${escapeHtml(node.type || "")}</span>
        `;
      }

      row.append(toggle, bullet, label);
      wrapper.append(row);

      if (canExpand && expandedCcCodes.has(node.code)) {
        const childrenWrap = document.createElement("div");
        childrenWrap.className = "tree-children";
        children.forEach((child) => childrenWrap.append(renderCcNode(child, depth + 1)));
        wrapper.append(childrenWrap);
      }

      return wrapper;
    }

    // O dropdown de Gestao e montado a partir do cadastro (tabela managements,
    // tela Parametros > Gestoes) — criar uma gestao la a torna selecionavel aqui
    // sem mexer no HTML. Fallback para a lista fixa so quando o cadastro ainda
    // nao carregou, para nao deixar o campo vazio (um save nesse estado zeraria
    // a gestao do CC). currentValue fora do cadastro (gestao renomeada/excluida
    // com CCs ainda apontando pra ela) entra como opcao marcada, para o editor
    // mostrar a verdade em vez de campo em branco.
    function syncManagementOptions(select, currentValue) {
      if (!select) {
        return;
      }

      const registered = (getManagements?.() || [])
        .map((item) => String(item?.name ?? item ?? "").trim())
        .filter(Boolean);
      const names = registered.length ? registered : COST_CENTER_MANAGEMENT_OPTIONS.slice();

      const current = String(currentValue || "").trim();
      const orphan = current && !names.includes(current);

      select.innerHTML = [
        `<option value="">Selecione</option>`,
        ...names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`),
        orphan ? `<option value="${escapeHtml(current)}">${escapeHtml(current)} (fora do cadastro)</option>` : ""
      ].join("");
    }

    function renderCcEditor() {
      const node = findCcNode(getSelectedCcCode());
      const title = document.querySelector("#cc-editor-title");
      if (!title) {
        return;
      }

      const managementSelect = document.querySelector("#cc-node-management");

      if (!node) {
        title.textContent = "Selecione um centro de custos";
        ccNodeForm.reset();
        document.querySelector("#cc-node-class").value = "";
        document.querySelector("#cc-node-parent").value = "";
        syncManagementOptions(managementSelect, "");
        managementSelect.value = "";
        managementSelect.disabled = true;
        return;
      }

      const linkedCostCenter = getLinkedCostCenter(node.code);
      const management = linkedCostCenter?.management || "";
      title.textContent = `[ ${node.code} - ${node.name} ]`;
      document.querySelector("#cc-node-code").value = node.code;
      document.querySelector("#cc-node-type").value = node.type || "ADM";
      document.querySelector("#cc-node-name").value = node.name;
      syncManagementOptions(managementSelect, management);
      managementSelect.value = management;
      managementSelect.disabled = node.class !== "Analitica";
      document.querySelector("#cc-node-class").value = node.class;
      document.querySelector("#cc-node-parent").value = describeCcParent(node.parentCode);
      document.querySelector("#cc-node-note").value = node.note || "";
    }

    return {
      renderCcTree,
      renderCcEditor
    };
  }

  window.VECTON_CC_TREE = {
    createCcTreeModule
  };
})(window);
