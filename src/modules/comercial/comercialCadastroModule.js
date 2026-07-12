(function attachVectonComercialCadastroModule(window) {
  // Factory generico de cadastro (tabela + modal), usado pelos catalogos planos
  // do modulo Comercial: Tipo, Cultura, Territorio, Coordenacao, Produtos, Clientes.
  // Cada tela e' so uma instancia desta factory com um config diferente.
  function createCadastroModule(config, deps) {
    const {
      table,
      idPrefix,
      titleSingular,
      titlePlural,
      subtitle,
      conflictKeys,
      fields,
      searchable,
      newLabel,
      noConflictOnCreate
    } = config;

    const {
      escapeHtml,
      resolveOrganizationId,
      fetchAllSupabaseRows,
      upsertSupabaseRows,
      insertSupabaseRows,
      deleteSupabaseRows,
      appAlert,
      appConfirm
    } = deps;

    let rows = [];
    let searchTerm = "";
    let sortKey = fields[0].key;
    let sortDir = 1;

    function fieldOptions(field) {
      return typeof field.options === "function" ? (field.options() || []) : (field.options || []);
    }

    function displayValue(field, row) {
      const raw = row[field.key];
      if (field.type === "select") {
        const opt = fieldOptions(field).find((o) => String(o.value) === String(raw));
        return opt ? opt.label : (raw ? String(raw) : "—");
      }
      return raw || raw === 0 ? String(raw) : "—";
    }

    function matchesSearch(row) {
      if (!searchable || !searchTerm) return true;
      const haystack = fields.map((f) => displayValue(f, row)).join(" ").toLowerCase();
      return haystack.includes(searchTerm.toLowerCase());
    }

    function sortRows(list) {
      const field = fields.find((f) => f.key === sortKey) || fields[0];
      return [...list].sort((a, b) =>
        displayValue(field, a).localeCompare(displayValue(field, b), "pt-BR", { numeric: true }) * sortDir
      );
    }

    function bindSortableHeaders() {
      const tbody = document.querySelector(`#${idPrefix}-table-body`);
      const headerRow = tbody?.closest("table")?.querySelector("thead tr");
      if (!headerRow || headerRow.dataset.sortBound) return;
      headerRow.dataset.sortBound = "1";

      const ths = Array.from(headerRow.children);
      fields.forEach((f, i) => {
        const th = ths[i];
        if (!th) return;
        th.style.cursor = "pointer";
        th.style.userSelect = "none";
        th.innerHTML = `<span class="cadastro-th-label">${escapeHtml(th.textContent)}</span><span class="cadastro-th-arrow"></span>`;
        th.addEventListener("click", () => {
          sortDir = sortKey === f.key ? -sortDir : 1;
          sortKey = f.key;
          updateHeaderArrows(ths);
          if (tbody) renderTable(tbody);
        });
      });
      updateHeaderArrows(ths);
    }

    function updateHeaderArrows(ths) {
      fields.forEach((f, i) => {
        const th = ths[i];
        if (!th) return;
        const active = sortKey === f.key;
        th.style.color = active ? "var(--blue)" : "";
        const arrow = th.querySelector(".cadastro-th-arrow");
        if (arrow) arrow.textContent = active ? (sortDir === 1 ? " ↑" : " ↓") : "";
      });
    }

    async function loadAndRender() {
      const tbody = document.querySelector(`#${idPrefix}-table-body`);
      if (!tbody) return;
      const colspan = fields.length + 1;
      const hadSnapshot = rows.length > 0;
      if (hadSnapshot) {
        renderTable(tbody);
      } else {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="users-empty">Carregando...</td></tr>`;
      }

      try {
        const orgId = await resolveOrganizationId();
        const selectCols = ["id", ...fields.map((f) => f.key)].join(",");
        // fetchAllSupabaseRows pagina por id (keyset) e ignora `orderBy` na busca —
        // a ordenação exibida vem do sort client-side (sortKey/sortDir), não da query.
        const fetched = await fetchAllSupabaseRows(table, `organization_id=eq.${orgId}&select=${selectCols}`);
        rows = fetched || [];
        if (!rows.length) {
          tbody.innerHTML = `<tr><td colspan="${colspan}" class="users-empty">Nenhum ${titleSingular.toLowerCase()} cadastrado.</td></tr>`;
          return;
        }
        renderTable(tbody);
      } catch (err) {
        console.error(err);
        if (!hadSnapshot) {
          tbody.innerHTML = `<tr><td colspan="${colspan}" class="users-empty">Erro ao carregar ${titlePlural.toLowerCase()}.</td></tr>`;
        }
      }
    }

    function renderTable(tbody) {
      const colspan = fields.length + 1;
      const visible = sortRows(rows.filter(matchesSearch));
      if (!visible.length) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="users-empty">Nenhum resultado encontrado.</td></tr>`;
        return;
      }
      tbody.innerHTML = visible.map((row) => `
        <tr data-id="${escapeHtml(row.id)}">
          ${fields.map((f) => `<td>${escapeHtml(displayValue(f, row))}</td>`).join("")}
          <td>
            <div class="users-actions">
              <button class="users-action-btn" type="button" data-action="edit" data-id="${escapeHtml(row.id)}" title="Editar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="users-action-btn users-action-delete" type="button" data-action="delete" data-id="${escapeHtml(row.id)}" title="Excluir">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
          </td>
        </tr>`).join("");

      tbody.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = rows.find((r) => String(r.id) === btn.dataset.id);
          if (!row) return;
          if (btn.dataset.action === "edit") openFormModal(row);
          if (btn.dataset.action === "delete") handleDelete(row);
        });
      });
    }

    function bindSearch() {
      if (!searchable) return;
      const input = document.querySelector(`#${idPrefix}-search`);
      if (!input || input.dataset.bound) return;
      input.dataset.bound = "1";
      input.addEventListener("input", () => {
        searchTerm = input.value.trim();
        const tbody = document.querySelector(`#${idPrefix}-table-body`);
        if (tbody) renderTable(tbody);
      });
    }

    function fieldInputHtml(field, row) {
      const value = row ? (row[field.key] ?? "") : "";
      const locked = field.lockOnEdit && row;
      if (field.type === "select") {
        const opts = fieldOptions(field);
        const placeholder = field.required
          ? `<option value="">— selecione —</option>`
          : `<option value="">— nenhuma —</option>`;
        const optionsHtml = opts.map((o) =>
          `<option value="${escapeHtml(o.value)}" ${String(value) === String(o.value) ? "selected" : ""}>${escapeHtml(o.label)}</option>`
        ).join("");
        return `<select id="${idPrefix}-f-${field.key}">${placeholder}${optionsHtml}</select>`;
      }
      if (field.type === "date") {
        return `<input id="${idPrefix}-f-${field.key}" type="date" value="${escapeHtml(String(value))}" ${locked ? "disabled" : ""}>`;
      }
      return `<input id="${idPrefix}-f-${field.key}" type="text" value="${escapeHtml(String(value))}" ${locked ? "disabled" : ""} maxlength="120">`;
    }

    function getOrCreateOverlay() {
      let overlay = document.querySelector(`#${idPrefix}-overlay`);
      if (overlay) return overlay;
      overlay = document.createElement("div");
      overlay.id = `${idPrefix}-overlay`;
      overlay.className = "users-invite-overlay";
      document.body.appendChild(overlay);
      return overlay;
    }

    function openFormModal(row) {
      const overlay = getOrCreateOverlay();
      const isEdit = Boolean(row);

      overlay.innerHTML = `
        <div class="users-invite-modal">
          <div class="users-invite-header">
            <div>
              <p class="users-invite-kicker">${isEdit ? "EDITAR" : "NOVO"} ${escapeHtml(titleSingular.toUpperCase())}</p>
              <h3 class="users-invite-title">${isEdit ? escapeHtml(displayValue(fields[0], row)) : escapeHtml(newLabel || `Novo ${titleSingular.toLowerCase()}`)}</h3>
            </div>
            <button type="button" class="users-invite-close" aria-label="Fechar">✕</button>
          </div>
          <div class="users-invite-body">
            ${fields.map((f) => `
              <label class="ui-field">${escapeHtml(f.label)} ${f.required ? `<span style="color:var(--red)">*</span>` : ""}
                ${fieldInputHtml(f, row)}
              </label>`).join("")}
            <p id="${idPrefix}-feedback" class="users-invite-feedback"></p>
          </div>
          <div class="users-invite-actions">
            <button type="button" class="ghost-button" id="${idPrefix}-cancel">Cancelar</button>
            <button type="button" class="primary-button" id="${idPrefix}-save">Salvar</button>
          </div>
        </div>`;

      const feedback = overlay.querySelector(`#${idPrefix}-feedback`);
      const saveBtn = overlay.querySelector(`#${idPrefix}-save`);
      const close = () => overlay.remove();

      overlay.querySelector(".users-invite-close").addEventListener("click", close);
      overlay.querySelector(`#${idPrefix}-cancel`).addEventListener("click", close);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

      saveBtn.addEventListener("click", () => saveForm(row, overlay, feedback, saveBtn));

      const firstInput = overlay.querySelector(".users-invite-body input, .users-invite-body select");
      if (firstInput) firstInput.focus();
    }

    async function saveForm(row, overlay, feedback, saveBtn) {
      const values = {};
      for (const f of fields) {
        const el = overlay.querySelector(`#${idPrefix}-f-${f.key}`);
        const raw = el ? el.value.trim() : "";
        if (f.required && !raw) {
          feedback.textContent = `Preencha o campo "${f.label}".`;
          feedback.className = "users-invite-feedback is-error";
          return;
        }
        values[f.key] = raw || null;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = "Salvando...";
      feedback.textContent = "";
      feedback.className = "users-invite-feedback";

      try {
        const orgId = await resolveOrganizationId();
        const payload = { organization_id: orgId, ...values };
        if (row) {
          payload.id = row.id;
          await upsertSupabaseRows(table, [payload], ["id"]);
        } else if (noConflictOnCreate) {
          await insertSupabaseRows(table, [payload]);
        } else {
          await upsertSupabaseRows(table, [payload], conflictKeys);
        }
        overlay.remove();
        await loadAndRender();
      } catch (err) {
        console.error(err);
        const message = String(err?.message || "");
        feedback.textContent = message.includes("violates exclusion constraint")
          ? "Já existe uma atribuição vigente para esse território e linha de negócio nesse período."
          : message.includes("duplicate key")
            ? "Já existe um registro com essa chave."
            : "Erro ao salvar. Tente novamente.";
        feedback.className = "users-invite-feedback is-error";
        saveBtn.disabled = false;
        saveBtn.textContent = "Salvar";
      }
    }

    async function handleDelete(row) {
      const ok = await appConfirm(`Excluir "${displayValue(fields[0], row)}"? Esta ação não pode ser desfeita.`, "danger");
      if (!ok) return;
      try {
        const orgId = await resolveOrganizationId();
        await deleteSupabaseRows(table, `id=eq.${row.id}&organization_id=eq.${orgId}`);
        await loadAndRender();
      } catch (err) {
        console.error(err);
        const message = String(err?.message || "");
        await appAlert(
          message.includes("violates foreign key")
            ? "Não é possível excluir: existem registros que dependem deste item."
            : "Erro ao excluir. Tente novamente."
        );
      }
    }

    function bindAddButton() {
      const btn = document.querySelector(`#${idPrefix}-add-btn`);
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = "1";
        btn.addEventListener("click", () => openFormModal(null));
      }
      bindSearch();
      bindSortableHeaders();
    }

    return { loadAndRender, bindAddButton, getRows: () => rows };
  }

  window.VECTON_COMERCIAL_CADASTRO_MODULE = { createCadastroModule };
})(window);
