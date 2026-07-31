(function attachVectonEditorEventsModule(window) {
  function createEditorEventsModule(deps) {
    const {
      dreNodeForm,
      ccNodeForm,
      branchNodeForm,
      appAlert,
      normalizeBranchCode,
      normalizeCostCenterManagement,
      generateBranchDraftCode,
      generateDraftCode,
      generateCcDraftCode,
      getCcTypeNodeCode,
      findDreNode,
      findCcNode,
      findBranch,
      collectChildCodes,
      persistAndRender,
      syncBranch,
      syncDeleteBranch,
      syncDreNodeAndAccount,
      syncDeleteDreNode,
      syncCcNodeAndCostCenter,
      syncDeleteCcNode,
      getState,
      getSelectedBranchCode,
      setSelectedBranchCode,
      getSelectedDreCode,
      setSelectedDreCode,
      addExpandedDreCode,
      removeExpandedDreCode,
      hasExpandedDreCode,
      getSelectedCcCode,
      setSelectedCcCode,
      addExpandedCcCode,
      removeExpandedCcCode,
      hasExpandedCcCode
    } = deps;

    function bindEditorEvents() {
      document.querySelector("#branch-add-node").addEventListener("click", async () => {
        const state = getState();
        const newCode = generateBranchDraftCode();
        const draftBranch = {
          id: crypto.randomUUID(),
          code: newCode,
          name: "NOVA FILIAL",
          origin: "manual",
          note: ""
        };

        state.branches.push(draftBranch);
        setSelectedBranchCode(newCode);
        persistAndRender();
        await syncBranch(newCode);
      });

      document.querySelector("#dre-add-node").addEventListener("click", async () => {
        const state = getState();
        const selectedNode = findDreNode(getSelectedDreCode());
        const parentCode = selectedNode && selectedNode.class === "Sintetica"
          ? selectedNode.code
          : selectedNode?.parentCode || null;

        const newCode = generateDraftCode();
        const draftNode = {
          id: crypto.randomUUID(),
          code: newCode,
          name: "NOVA CONTA",
          class: "Analitica",
          parentCode,
          origin: "manual",
          note: ""
        };

        state.dreNodes.push(draftNode);
        setSelectedDreCode(newCode);
        addExpandedDreCode(parentCode);
        persistAndRender();
        await syncDreNodeAndAccount(newCode);
      });

      document.querySelector("#cc-add-node").addEventListener("click", async () => {
        const state = getState();
        const selectedNode = findCcNode(getSelectedCcCode());
        const parentCode = selectedNode && selectedNode.class === "Sintetica"
          ? selectedNode.code
          : selectedNode?.parentCode || getCcTypeNodeCode(selectedNode?.type) || null;

        const type = selectedNode?.type && selectedNode.type !== "ROOT" ? selectedNode.type : "ADM";
        const newCode = generateCcDraftCode();
        const draftNode = {
          id: crypto.randomUUID(),
          code: newCode,
          name: "NOVO CENTRO DE CUSTOS",
          class: "Analitica",
          parentCode,
          type,
          origin: "manual",
          note: ""
        };

        state.ccNodes.push(draftNode);
        state.costCenters.unshift({ id: crypto.randomUUID(), number: newCode, name: draftNode.name, type, management: "" });
        setSelectedCcCode(newCode);
        addExpandedCcCode(parentCode);
        persistAndRender();
        await syncCcNodeAndCostCenter(newCode);
      });

      dreNodeForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const state = getState();
        const selectedNode = findDreNode(getSelectedDreCode());
        if (!selectedNode) {
          return;
        }

        const formData = new FormData(dreNodeForm);
        const newCode = String(formData.get("code") || "").trim();
        const newName = String(formData.get("name") || "").trim();
        const newClass = String(formData.get("class") || "Analitica").trim();
        const newNote = document.querySelector("#dre-node-note").value.trim();

        if (!newCode || !newName) {
          return;
        }

        if (newCode !== selectedNode.code && findDreNode(newCode)) {
          appAlert("Ja existe uma conta com este codigo na estrutura.", "error");
          return;
        }

        state.dreNodes = state.dreNodes.map((node) => {
          if (node.code === selectedNode.code) {
            return { ...node, code: newCode, name: newName, class: newClass, parentCode: node.parentCode, note: newNote };
          }
          if (node.parentCode === selectedNode.code) {
            return { ...node, parentCode: newCode };
          }
          return node;
        });

        if (hasExpandedDreCode(selectedNode.code)) {
          removeExpandedDreCode(selectedNode.code);
          addExpandedDreCode(newCode);
        }

        setSelectedDreCode(newCode);
        persistAndRender();
        await syncDreNodeAndAccount(newCode);
      });

      document.querySelector("#dre-delete-node").addEventListener("click", async () => {
        const state = getState();
        const selectedNode = findDreNode(getSelectedDreCode());
        if (!selectedNode) {
          return;
        }

        const deletedCode = selectedNode.code;
        const childCodes = collectChildCodes(selectedNode.code);
        state.dreNodes = state.dreNodes.filter((node) => node.code !== selectedNode.code && !childCodes.has(node.code));
        state.accounts = state.accounts.filter((account) => account.number !== deletedCode && !childCodes.has(account.number));
        removeExpandedDreCode(selectedNode.code);
        setSelectedDreCode(state.dreNodes[0]?.code || null);
        persistAndRender();
        await syncDeleteDreNode(deletedCode);
      });

      ccNodeForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const state = getState();
        const selectedNode = findCcNode(getSelectedCcCode());
        if (!selectedNode) {
          return;
        }

        const formData = new FormData(ccNodeForm);
        const newCode = String(formData.get("code") || "").trim();
        const newName = String(formData.get("name") || "").trim();
        const newType = String(formData.get("type") || "ADM").trim();
        // A gestao atual do CC entra na lista aceita: se ela saiu do cadastro
        // (renomeada/excluida), salvar outro campo do CC nao pode zerar a
        // gestao em silencio. O dropdown ja oferece so valores cadastrados +
        // esse valor legado, entao nada novo passa por aqui.
        const currentManagement = (getState().costCenters || [])
          .find((cc) => cc.number === selectedNode.code)?.management || "";
        const acceptedManagements = [
          ...(getState().managements || []).map((m) => m.name),
          currentManagement
        ].filter(Boolean);
        const newManagement = normalizeCostCenterManagement(formData.get("management"), acceptedManagements);
        const newNote = document.querySelector("#cc-node-note").value.trim();

        if (!newCode || !newName) {
          return;
        }

        if (newCode !== selectedNode.code && findCcNode(newCode)) {
          appAlert("Ja existe um centro de custos com este codigo na estrutura.", "error");
          return;
        }

        const parentCode = selectedNode.class === "Sintetica"
          ? selectedNode.parentCode
          : getCcTypeNodeCode(newType) || selectedNode.parentCode;

        state.ccNodes = state.ccNodes.map((node) => {
          if (node.code === selectedNode.code) {
            return { ...node, code: newCode, name: newName, type: newType, parentCode, note: newNote };
          }
          if (node.parentCode === selectedNode.code) {
            return { ...node, parentCode: newCode };
          }
          return node;
        });

        state.costCenters = state.costCenters.map((cc) => (
          cc.number === selectedNode.code ? { ...cc, number: newCode, name: newName, type: newType, management: newManagement } : cc
        ));

        if (hasExpandedCcCode(selectedNode.code)) {
          removeExpandedCcCode(selectedNode.code);
          addExpandedCcCode(newCode);
        }

        setSelectedCcCode(newCode);
        persistAndRender();
        await syncCcNodeAndCostCenter(newCode);
      });

      document.querySelector("#cc-delete-node").addEventListener("click", async () => {
        const state = getState();
        const selectedNode = findCcNode(getSelectedCcCode());
        if (!selectedNode || selectedNode.class === "Sintetica") {
          return;
        }

        const deletedCode = selectedNode.code;
        state.ccNodes = state.ccNodes.filter((node) => node.code !== selectedNode.code);
        state.costCenters = state.costCenters.filter((cc) => cc.number !== selectedNode.code);
        setSelectedCcCode(state.ccNodes.find((node) => node.class === "Analitica")?.code || null);
        persistAndRender();
        await syncDeleteCcNode(deletedCode);
      });

      branchNodeForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const state = getState();
        const selectedBranch = findBranch(getSelectedBranchCode());
        if (!selectedBranch) {
          return;
        }

        const formData = new FormData(branchNodeForm);
        const newCode = normalizeBranchCode(String(formData.get("code") || ""));
        const newName = String(formData.get("name") || "").trim();
        const newNote = document.querySelector("#branch-node-note").value.trim();

        if (!/^\d{2}$/.test(newCode) || !newName) {
          appAlert("Informe um codigo com 2 digitos e um nome para a empresa/filial.", "warn");
          return;
        }

        if (newCode !== selectedBranch.code && findBranch(newCode)) {
          appAlert("Ja existe uma empresa/filial com este codigo.", "error");
          return;
        }

        state.branches = state.branches.map((branch) => (
          branch.code === selectedBranch.code
            ? { ...branch, code: newCode, name: newName, note: newNote }
            : branch
        ));

        setSelectedBranchCode(newCode);
        persistAndRender();
        await syncBranch(newCode);
      });

      document.querySelector("#branch-delete-node").addEventListener("click", async () => {
        const state = getState();
        const selectedBranch = findBranch(getSelectedBranchCode());
        if (!selectedBranch) {
          return;
        }

        const deletedCode = selectedBranch.code;
        state.branches = state.branches.filter((branch) => branch.code !== deletedCode);
        setSelectedBranchCode(state.branches[0]?.code || null);
        persistAndRender();
        await syncDeleteBranch(deletedCode);
      });
    }

    return {
      bindEditorEvents
    };
  }

  window.VECTON_EDITOR_EVENTS = {
    createEditorEventsModule
  };
})(window);
