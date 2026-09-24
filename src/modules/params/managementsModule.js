(function attachVectonManagementsModule(window) {
  function createManagementsModule(deps) {
    const {
      escapeHtml,
      state,
      resolveOrganizationId,
      fetchSupabaseRowsSafe,
      upsertSupabaseRows,
      deleteSupabaseRows,
      isAdmin,
      appAlert,
      appConfirm
    } = deps;

    async function loadAndRender() {
      const list = document.querySelector("#mgmt-list");
      if (!list) return;
      list.innerHTML = `<span class="mgmt-empty">Carregando...</span>`;

      try {
        const orgId = await resolveOrganizationId();
        const rows = await fetchSupabaseRowsSafe(
          "managements",
          `organization_id=eq.${orgId}&order=sort_order.asc,name.asc`
        );
        state.managements = rows || [];
        render(list, state.managements);
      } catch (err) {
        console.error(err);
        list.innerHTML = `<span class="mgmt-empty">Erro ao carregar gestões.</span>`;
      }
    }

    function render(list, managements) {
      if (!managements.length) {
        list.innerHTML = `<span class="mgmt-empty">Nenhuma gestão cadastrada.</span>`;
        return;
      }
      const ccsFor = (name) => (state.costCenters || [])
        .filter((cc) => (cc.management || "").trim() === (name || "").trim())
        .sort((a, b) => String(a.number ?? "").localeCompare(String(b.number ?? ""), "pt-BR", { numeric: true }));

      list.innerHTML = managements.map((m) => {
        const ccs = ccsFor(m.name);
        const note = `
          <div class="mgmt-ccs-note">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>A vinculação dos centros de custo é definida no cadastro de <strong>Centros de Custo</strong>. Aqui é apenas informativo.</span>
          </div>`;
        const ccItems = note + (ccs.length
          ? ccs.map((cc) => `
              <div class="mgmt-cc-item">
                <span class="mgmt-cc-num">${escapeHtml(String(cc.number ?? ""))}</span>
                <span class="mgmt-cc-name">${escapeHtml(cc.name || "")}</span>
              </div>`).join("")
          : `<div class="mgmt-cc-empty">Nenhum centro de custo vinculado a esta gestão.</div>`);
        return `
        <div class="mgmt-row-wrap" data-id="${escapeHtml(m.id)}">
          <div class="mgmt-row" data-id="${escapeHtml(m.id)}">
            <button class="mgmt-expand" data-action="toggle" data-id="${escapeHtml(m.id)}" title="Ver centros de custo" aria-expanded="false">
              <svg class="mgmt-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <span class="mgmt-name" data-field="name">${escapeHtml(m.name)}</span>
            <span class="mgmt-cc-count">${ccs.length} CC${ccs.length === 1 ? "" : "s"}</span>
            <div class="mgmt-actions">
              ${isAdmin() ? `
                <button class="mgmt-btn mgmt-btn-edit" data-action="edit" data-id="${escapeHtml(m.id)}" title="Renomear">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="mgmt-btn mgmt-btn-delete" data-action="delete" data-id="${escapeHtml(m.id)}" data-name="${escapeHtml(m.name)}" title="Excluir">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              ` : ""}
            </div>
          </div>
          <div class="mgmt-ccs" data-ccs-for="${escapeHtml(m.id)}" hidden>${ccItems}</div>
        </div>
      `; }).join("");

      list.querySelectorAll("[data-action]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const { action, id, name } = btn.dataset;
          if (action === "toggle") toggleCcs(id, btn);
          if (action === "edit")   startEdit(id);
          if (action === "delete") handleDelete(id, name);
        });
      });
      // clicar no nome também expande/recolhe
      list.querySelectorAll(".mgmt-name").forEach(nameEl => {
        nameEl.addEventListener("click", () => {
          const btn = nameEl.closest(".mgmt-row-wrap")?.querySelector(".mgmt-expand");
          if (btn) toggleCcs(btn.dataset.id, btn);
        });
      });
    }

    function toggleCcs(id, btn) {
      const sub = document.querySelector(`.mgmt-ccs[data-ccs-for="${id}"]`);
      if (!sub) return;
      const willOpen = sub.hidden;
      sub.hidden = !willOpen;
      btn.setAttribute("aria-expanded", String(willOpen));
      btn.classList.toggle("open", willOpen);
    }

    function startEdit(id) {
      const row = document.querySelector(`.mgmt-row[data-id="${id}"]`);
      if (!row) return;
      const nameEl = row.querySelector(".mgmt-name");
      const current = nameEl.textContent.trim();

      nameEl.innerHTML = `
        <input class="mgmt-edit-input" type="text" value="${escapeHtml(current)}" maxlength="80">
        <button class="mgmt-btn mgmt-btn-save" type="button" title="Salvar">✓</button>
        <button class="mgmt-btn mgmt-btn-cancel" type="button" title="Cancelar">✕</button>
      `;
      const input = nameEl.querySelector("input");
      input.focus();
      input.select();

      nameEl.querySelector(".mgmt-btn-save").addEventListener("click", () => saveEdit(id, current, input.value.trim()));
      nameEl.querySelector(".mgmt-btn-cancel").addEventListener("click", () => loadAndRender());
      input.addEventListener("keydown", e => {
        if (e.key === "Enter")  saveEdit(id, current, input.value.trim());
        if (e.key === "Escape") loadAndRender();
      });
    }

    async function saveEdit(id, oldName, newName) {
      if (!newName || newName === oldName) { loadAndRender(); return; }
      const ok = await appConfirm(`Salvar a gestão como "${newName}"?`);
      if (!ok) { loadAndRender(); return; }
      try {
        const orgId = await resolveOrganizationId();
        await upsertSupabaseRows("managements", [{ id, organization_id: orgId, name: newName }], ["id"]);
        // cascade: atualiza cost_centers que usavam o nome antigo
        if (oldName) {
          const ccs = await fetchSupabaseRowsSafe(
            "cost_centers",
            `organization_id=eq.${orgId}&cost_center_management=eq.${encodeURIComponent(oldName)}&select=id`
          );
          if (ccs?.length) {
            await upsertSupabaseRows(
              "cost_centers",
              ccs.map(cc => ({ id: cc.id, organization_id: orgId, cost_center_management: newName })),
              ["id"]
            );
          }
        }
        await loadAndRender();
      } catch (err) {
        console.error(err);
        await appAlert("Erro ao salvar. Tente novamente.");
        loadAndRender();
      }
    }

    async function handleDelete(id, name) {
      const ok = await appConfirm(`Excluir a gestão "${name}"?\n\nOs centros de custo vinculados ficarão sem gestão.`);
      if (!ok) return;
      try {
        const orgId = await resolveOrganizationId();
        await deleteSupabaseRows("managements", `id=eq.${id}&organization_id=eq.${orgId}`);
        await loadAndRender();
      } catch (err) {
        console.error(err);
        await appAlert("Erro ao excluir. Tente novamente.");
      }
    }

    async function handleAdd() {
      const name = prompt("Nome da nova gestão:")?.trim();
      if (!name) return;
      const ok = await appConfirm(`Criar a gestão "${name}"?`);
      if (!ok) return;
      try {
        const orgId = await resolveOrganizationId();
        const maxOrder = Math.max(0, ...(state.managements || []).map(m => m.sort_order || 0));
        await upsertSupabaseRows("managements", [{ organization_id: orgId, name, sort_order: maxOrder + 1 }], ["organization_id", "name"]);
        await loadAndRender();
      } catch (err) {
        console.error(err);
        await appAlert("Erro ao criar gestão.");
      }
    }

    function bindAddButton() {
      const btn = document.querySelector("#mgmt-add-btn");
      if (btn) btn.addEventListener("click", handleAdd);
    }

    return { loadAndRenderManagements: loadAndRender, bindManagementsAddButton: bindAddButton };
  }

  window.VECTON_MANAGEMENTS_MODULE = { createManagementsModule };
})(window);
