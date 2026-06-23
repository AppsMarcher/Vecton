(function attachVectonUsersModule(window) {
  function createUsersModule(deps) {
    const {
      escapeHtml,
      state,
      resolveOrganizationId,
      fetchSupabaseRowsSafe,
      upsertSupabaseRows,
      deleteSupabaseRows,
      fetchSupabaseRpc,
      callEdgeFunction,
      isSuperAdmin,
      isAdmin,
      getUserManagement,
      getReportTitles
    } = deps;

    const ROLE_LABELS = {
      super_admin: "Super Admin",
      admin:       "Admin",
      manager:     "Gestor",
      analyst:     "Analista"
    };

    const ROLE_COLORS = {
      super_admin: "#f59e0b",
      admin:       "#4f7cff",
      manager:     "#22c55e",
      analyst:     "#8b5cf6"
    };

    let allUsers = [];
    let editingUserId = null;

    // ── Painel de edição (slide-in lateral) ──────────────────────────────────
    function getOrCreatePanel() {
      let panel = document.querySelector("#users-edit-panel");
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "users-edit-panel";
        panel.className = "ue-panel";
        panel.innerHTML = `
          <div class="ue-panel-inner">
            <div class="ue-panel-header">
              <span class="ue-panel-title" id="ue-panel-title">Editar usuário</span>
              <button class="ue-close-btn" id="ue-close-btn" type="button" aria-label="Fechar">✕</button>
            </div>
            <div class="ue-panel-body" id="ue-panel-body"></div>
            <div class="ue-panel-footer">
              <button class="ghost-button" id="ue-cancel-btn" type="button">Cancelar</button>
              <button class="primary-button" id="ue-save-btn" type="button">Salvar</button>
            </div>
          </div>
        `;
        document.body.appendChild(panel);

        const close = () => {
          panel.classList.remove("open");
          editingUserId = null;
        };
        panel.querySelector("#ue-close-btn").addEventListener("click", close);
        panel.querySelector("#ue-cancel-btn").addEventListener("click", close);
        panel.addEventListener("click", (e) => { if (e.target === panel) close(); });
        panel.querySelector("#ue-save-btn").addEventListener("click", saveEdit);
      }
      return panel;
    }

    // ── Renderiza corpo do painel para um usuário ─────────────────────────────
    function openEditPanel(user) {
      editingUserId = user.id;
      const panel = getOrCreatePanel();
      panel.querySelector("#ue-panel-title").textContent = user.full_name || user.email || "Editar usuário";

      const managements = [...new Set(
        state.costCenters.map((cc) => (cc.management || "").trim()).filter(Boolean)
      )].sort();

      const roleOptions = Object.entries(ROLE_LABELS).map(([val, label]) => {
        const disabled = val === "super_admin" && !isSuperAdmin() ? "disabled" : "";
        return `<option value="${val}" ${user.access_role === val ? "selected" : ""} ${disabled}>${label}</option>`;
      }).join("");

      const mgmtOptions = [`<option value="">— nenhuma —</option>`,
        ...managements.map((m) => `<option value="${escapeHtml(m)}" ${user.management === m ? "selected" : ""}>${escapeHtml(m)}</option>`)
      ].join("");

      panel.querySelector("#ue-panel-body").innerHTML = `
        <div class="ue-section">
          <label class="ue-label">Nome de exibição</label>
          <input class="ue-input" id="ue-name" type="text" value="${escapeHtml(user.full_name || "")}" placeholder="Nome completo">
        </div>
        <div class="ue-section">
          <label class="ue-label">Departamento</label>
          <input class="ue-input" id="ue-dept" type="text" value="${escapeHtml(user.department || "")}" placeholder="Departamento">
        </div>
        <div class="ue-section">
          <label class="ue-label">Perfil de acesso</label>
          <select class="ue-select" id="ue-role">${roleOptions}</select>
        </div>
        <div class="ue-section" id="ue-mgmt-section">
          <label class="ue-label">Gestão <span class="ue-label-hint">(Gestor / Analista)</span></label>
          <select class="ue-select" id="ue-mgmt">${mgmtOptions}</select>
        </div>

        <div class="ue-divider"></div>

        <div class="ue-section">
          <div class="ue-tree-header">
            <span class="ue-tree-title">Acessos adicionais</span>
            <span class="ue-tree-hint">Marcações extras além do padrão da gestão</span>
          </div>
        </div>
      `;

      // mostra/oculta campo gestão conforme role
      const roleSelect = panel.querySelector("#ue-role");
      const mgmtSection = panel.querySelector("#ue-mgmt-section");
      const updateMgmtVisibility = () => {
        const role = roleSelect.value;
        mgmtSection.style.display = ["manager", "analyst"].includes(role) ? "" : "none";
        rebuildTrees(panel, user, roleSelect.value, panel.querySelector("#ue-mgmt").value);
      };
      roleSelect.addEventListener("change", updateMgmtVisibility);
      panel.querySelector("#ue-mgmt").addEventListener("change", () => {
        rebuildTrees(panel, user, roleSelect.value, panel.querySelector("#ue-mgmt").value);
      });
      // append árvores como DOM
      const treeSection = panel.querySelector(".ue-section:last-child");
      treeSection.append(renderAccessTrees(user));

      updateMgmtVisibility();
      panel.classList.add("open");
    }

    // ── Constrói as 4 árvores de acesso ──────────────────────────────────────
    function renderAccessTrees(user) {
      const wrap = document.createElement("div");
      wrap.className = "ue-trees";
      wrap.append(renderManagementTree(user), renderBranchTree(user), renderAccountTree(user), renderCcTree(user), renderReportTree(user));
      return wrap;
    }

    function rebuildTrees(panel, user, role, mgmt) {
      const mgmtChanged = mgmt !== (user.management || "");
      const fakeUser = {
        ...user,
        access_role: role,
        management: mgmt,
        extra_cc_ids: mgmtChanged ? [] : user.extra_cc_ids,
        extra_managements: mgmtChanged ? [] : user.extra_managements
      };
      const old = panel.querySelector(".ue-trees");
      if (old) old.replaceWith(renderAccessTrees(fakeUser));
    }

    function isDefaultBranch() { return true; } // branches: todos são padrão por default

    function isDefaultCc(cc, management) {
      if (!management) return false;
      return (cc.management || "").trim() === management.trim();
    }

    function isExtraBranch(user, branchId) {
      return (user.extra_branch_ids || []).includes(branchId);
    }

    function isExtraCc(user, ccId) {
      return (user.extra_cc_ids || []).some((id) => String(id) === String(ccId));
    }

    function isExtraReport(user, reportId) {
      return (user.extra_report_ids || []).includes(reportId);
    }

    function isExtraAccount(user, accountCode) {
      return (user.extra_account_codes || []).includes(accountCode);
    }

    function isExtraManagement(user, mgmtName) {
      return (user.extra_managements || []).includes(mgmtName);
    }

    function buildAccessRow(id, label, checked, isDefault) {
      const row = document.createElement("div");
      row.className = "access-row" + (isDefault ? " access-row-all" : "");

      const cb = document.createElement("span");
      cb.className = "access-checkbox" + (checked ? " access-checkbox-on" : "");
      cb.innerHTML = checked
        ? `<svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 5 9 10 3"/></svg>`
        : "";
      // guarda metadados para o saveEdit colher
      cb.dataset.checked = checked ? "1" : "0";
      cb.dataset.isDefault = isDefault ? "1" : "0";
      if (!isDefault) {
        cb.style.cursor = "pointer";
        cb.addEventListener("click", () => {
          const on = cb.dataset.checked !== "1";
          cb.dataset.checked = on ? "1" : "0";
          cb.className = "access-checkbox" + (on ? " access-checkbox-on" : "");
          cb.innerHTML = on
            ? `<svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 5 9 10 3"/></svg>`
            : "";
        });
      }

      const lbl = document.createElement("span");
      lbl.className = "access-row-label";
      lbl.textContent = label;
      if (!isDefault && checked) {
        const tag = document.createElement("span");
        tag.className = "ue-extra-tag";
        tag.textContent = "extra";
        lbl.after(tag);
        row.append(cb, lbl, tag);
      } else {
        row.append(cb, lbl);
      }
      row.dataset.rowId = id;
      return row;
    }

    function makeTree(treeKey, icon, label, buildRows) {
      const section = document.createElement("div");
      section.className = "access-tree";
      section.dataset.treeKey = treeKey;

      const rows = buildRows();
      const count = rows.length;

      const header = document.createElement("button");
      header.type = "button";
      header.className = "access-tree-header";
      header.innerHTML = `
        <span class="access-tree-label">
          <span class="access-tree-icon">${icon}</span>
          ${label}
          <span class="access-tree-count">${count}</span>
        </span>
        <svg class="access-tree-caret" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      `;

      const body = document.createElement("div");
      body.className = "access-tree-body";
      rows.forEach(r => body.append(r));

      header.addEventListener("click", () => {
        const isOpen = section.classList.toggle("open");
        header.querySelector(".access-tree-caret").style.transform = isOpen ? "rotate(180deg)" : "";
      });

      section.append(header, body);
      return section;
    }

    function renderManagementTree(user) {
      const ownMgmt = user.management || "";
      const isRestricted = ["manager", "analyst"].includes(user.access_role);
      const icon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><rect x="1" y="16" width="6" height="4" rx="1"/><rect x="9" y="16" width="6" height="4" rx="1"/><rect x="17" y="16" width="6" height="4" rx="1"/><path d="M4 16v-4h16v4M12 6v6"/></svg>`;
      const allMgmts = [...new Set(
        (state.costCenters || []).map(cc => (cc.management || "").trim()).filter(Boolean)
      )].sort();
      return makeTree("management", icon, "Gestões", () =>
        allMgmts.map((name) => {
          const isDefault = isRestricted ? name === ownMgmt : true;
          const isExtra = isExtraManagement(user, name);
          const row = buildAccessRow(name, name, isDefault || isExtra, isDefault);
          row.dataset.tree = "management";
          return row;
        })
      );
    }

    function renderBranchTree(user) {
      const isRestricted = ["manager", "analyst"].includes(user.access_role);
      const icon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
      return makeTree("branch", icon, "Empresas", () =>
        (state.branches || []).map((b) => {
          const isDefault = !isRestricted;
          const isExtra = isExtraBranch(user, b.id);
          const row = buildAccessRow(String(b.id), b.name || b.branch_name || b.branch_code, isDefault || isExtra, isDefault);
          row.dataset.tree = "branch";
          return row;
        })
      );
    }

    function renderCcTree(user) {
      const mgmt = user.management || "";
      const isRestricted = ["manager", "analyst"].includes(user.access_role);
      const icon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>`;
      return makeTree("cc", icon, "Centros de Custo", () => {
        const rows = [];
        const grouped = {};
        (state.costCenters || []).forEach((cc) => {
          const g = (cc.management || "Sem gestão").trim();
          if (!grouped[g]) grouped[g] = [];
          grouped[g].push(cc);
        });
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).forEach(([group, ccs]) => {
          const hdr = document.createElement("div");
          hdr.className = "ue-tree-subgroup-title";
          hdr.textContent = group;
          rows.push(hdr);
          ccs.forEach((cc) => {
            const isDefault = isRestricted ? isDefaultCc(cc, mgmt) : true;
            const isExtra = isExtraCc(user, cc.id);
            const row = buildAccessRow(String(cc.id), `${cc.number || ""} ${cc.name || ""}`.trim(), isDefault || isExtra, isDefault);
            row.dataset.tree = "cc";
            row.style.paddingLeft = "20px";
            rows.push(row);
          });
        });
        return rows;
      });
    }

    function renderAccountTree(user) {
      const isRestricted = ["manager", "analyst"].includes(user.access_role);
      const icon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
      return makeTree("account", icon, "Contas", () =>
        (state.accounts || []).map((a) => {
          const isDefault = !isRestricted;
          const isExtra = isExtraAccount(user, a.number);
          const row = buildAccessRow(a.number, `${a.number} — ${a.name}`, isDefault || isExtra, isDefault);
          row.dataset.tree = "account";
          return row;
        })
      );
    }

    function renderReportTree(user) {
      const isRestricted = ["manager", "analyst"].includes(user.access_role);
      const icon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
      return makeTree("report", icon, "Relatórios", () =>
        Object.entries(getReportTitles()).map(([id, label]) => {
          const isDefault = !isRestricted;
          const isExtra = isExtraReport(user, id);
          const row = buildAccessRow(id, label, isDefault || isExtra, isDefault);
          row.dataset.tree = "report";
          return row;
        })
      );
    }

    // ── Salvar edição ─────────────────────────────────────────────────────────
    async function saveEdit() {
      const panel = document.querySelector("#users-edit-panel");
      if (!panel || !editingUserId) return;

      const saveBtn = panel.querySelector("#ue-save-btn");
      saveBtn.disabled = true;
      saveBtn.textContent = "Salvando...";

      try {
        const name     = panel.querySelector("#ue-name")?.value.trim() || "";
        const dept     = panel.querySelector("#ue-dept")?.value.trim() || "";
        const role     = panel.querySelector("#ue-role")?.value || "analyst";
        const mgmt     = panel.querySelector("#ue-mgmt")?.value || null;

        // coleta extras (linhas clicáveis marcadas, não padrão)
        const getExtras = (tree) => [...panel.querySelectorAll(`.access-row[data-tree="${tree}"]`)]
          .filter(r => {
            const cb = r.querySelector(".access-checkbox");
            return cb?.dataset.isDefault !== "1" && cb?.dataset.checked === "1";
          })
          .map(r => r.dataset.rowId);

        const extraManagements  = getExtras("management");
        const extraBranchIds    = getExtras("branch");
        const extraCcIds        = getExtras("cc");
        const extraAccountCodes = getExtras("account");
        const extraReportIds    = getExtras("report");

        const user = allUsers.find((u) => u.id === editingUserId);
        const orgId = await resolveOrganizationId();

        await upsertSupabaseRows("user_profiles", [{
          organization_id:    orgId,
          user_id:            user.user_id,
          full_name:          name,
          department:         dept,
          access_role:        role,
          management:         mgmt || null,
          extra_managements:  extraManagements,
          extra_branch_ids:   extraBranchIds,
          extra_cc_ids:       extraCcIds,
          extra_account_codes: extraAccountCodes,
          extra_report_ids:   extraReportIds
        }], ["organization_id", "user_id"]);

        panel.classList.remove("open");
        editingUserId = null;
        await loadAndRenderUsers();
      } catch (err) {
        console.error(err);
        saveBtn.textContent = "Erro — tentar novamente";
      } finally {
        saveBtn.disabled = false;
        if (saveBtn.textContent === "Salvando...") saveBtn.textContent = "Salvar";
      }
    }

    // ── Carrega usuários do Supabase e renderiza tabela ───────────────────────
    // Mantém um snapshot (allUsers) entre entradas: ao reabrir a tela, mostra a
    // lista na hora e atualiza em segundo plano — sem o flash de "Carregando".
    async function loadAndRenderUsers() {
      const tbody = document.querySelector("#users-table-body");
      if (!tbody) return;

      const hadSnapshot = allUsers.length > 0;
      if (hadSnapshot) {
        renderUsersTable(tbody, allUsers);   // pinta o snapshot imediatamente
      } else {
        tbody.innerHTML = `<tr><td colspan="6" class="users-empty">Carregando...</td></tr>`;
      }

      try {
        const orgId = await resolveOrganizationId();
        const rows = await fetchSupabaseRowsSafe(
          "user_profiles",
          `organization_id=eq.${orgId}&select=id,user_id,full_name,email,department,access_role,management,extra_managements,extra_branch_ids,extra_cc_ids,extra_account_codes,extra_report_ids,photo_kind,photo_value&order=full_name.asc`
        );

        allUsers = rows || [];

        if (allUsers.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" class="users-empty">Nenhum usuário encontrado.</td></tr>`;
          return;
        }

        renderUsersTable(tbody, allUsers);
      } catch (err) {
        console.error(err);
        if (!hadSnapshot) {
          tbody.innerHTML = `<tr><td colspan="6" class="users-empty">Erro ao carregar usuários.</td></tr>`;
        }
      }
    }

    // ── Monta a tabela a partir de uma lista de usuários ──────────────────────
    function renderUsersTable(tbody, users) {
        tbody.innerHTML = users.map((user) => {
          const role     = user.access_role || "analyst";
          const label    = ROLE_LABELS[role] || role;
          const color    = ROLE_COLORS[role] || "#6b7280";
          const initials = (user.full_name || user.email || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
          const mgmt     = user.management ? `<br><span style="font-size:0.68rem;color:var(--text-faint)">${escapeHtml(user.management)}</span>` : "";
          const canEdit  = isSuperAdmin() || (isAdmin() && role !== "super_admin");

          return `<tr data-user-id="${escapeHtml(user.id)}">
            <td>
              <div class="users-name-cell">
                <span class="users-avatar">${escapeHtml(initials)}</span>
                <span class="users-name-text">${escapeHtml(user.full_name || "—")}${mgmt}</span>
              </div>
            </td>
            <td><span class="users-email-text">${escapeHtml(user.email || "—")}</span></td>
            <td><span class="users-email-text">${escapeHtml(user.department || "—")}</span></td>
            <td><span class="users-badge" style="background:${color}22;color:${color}">${escapeHtml(label)}</span></td>
            <td><span class="users-status-active">● Ativo</span></td>
            <td>
              <div class="users-actions">
                <button class="users-action-btn users-action-resend" type="button" title="Reenviar senha" data-action="resend" data-uid="${escapeHtml(user.id)}">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4v5h5"/><path d="M20 20v-5h-5"/><path d="M4.6 9A9 9 0 1 1 4 15"/></svg>
                </button>
                ${canEdit ? `<button class="users-action-btn" type="button" title="Editar usuário" data-action="edit" data-uid="${escapeHtml(user.id)}">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="users-action-btn users-action-delete" type="button" title="Excluir usuário" data-action="delete" data-uid="${escapeHtml(user.id)}">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>` : ""}
              </div>
            </td>
          </tr>`;
        }).join("");

        // bind actions
        tbody.querySelectorAll("[data-action]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const uid  = btn.dataset.uid;
            const user = allUsers.find((u) => u.id === uid);
            if (!user) return;
            if (btn.dataset.action === "edit")   openEditPanel(user);
            if (btn.dataset.action === "resend") handleResend(user);
            if (btn.dataset.action === "delete") handleDelete(user);
          });
        });
    }

    async function handleResend(user) {
      if (!user.email) return;
      try {
        await fetchSupabaseRpc("resend_invite", { target_email: user.email });
        alert(`Convite reenviado para ${user.email}`);
      } catch {
        alert("Não foi possível reenviar. Tente pelo painel do Supabase.");
      }
    }

    async function handleDelete(user) {
      if (!confirm(`Excluir ${user.full_name || user.email}? Esta ação não pode ser desfeita.`)) return;
      try {
        const orgId = await resolveOrganizationId();
        await deleteSupabaseRows(
          "user_profiles",
          `organization_id=eq.${orgId}&user_id=eq.${user.user_id}`
        );
        await loadAndRenderUsers();
      } catch (err) {
        console.error(err);
        alert("Erro ao excluir usuário.");
      }
    }

    // ── Convidar usuário (modal + Edge Function) ──────────────────────────────
    function openInvitePanel() {
      document.querySelector("#users-invite-overlay")?.remove();

      const managements = (state.managements || []).map((m) => m.name).filter(Boolean);
      const roleOpts = [
        ["analyst", "Analista"],
        ["manager", "Gestor"],
        ...(isSuperAdmin() ? [["admin", "Administrador"], ["super_admin", "Super Admin"]] : isAdmin() ? [["admin", "Administrador"]] : [])
      ];

      const overlay = document.createElement("div");
      overlay.id = "users-invite-overlay";
      overlay.className = "users-invite-overlay";
      overlay.innerHTML = `
        <div class="users-invite-modal">
          <div class="users-invite-header">
            <div>
              <p class="users-invite-kicker">CONVIDAR USUÁRIO</p>
              <h3 class="users-invite-title">Novo acesso</h3>
            </div>
            <button type="button" class="users-invite-close" aria-label="Fechar">✕</button>
          </div>
          <div class="users-invite-body">
            <label class="ui-field">E-mail <span style="color:var(--red)">*</span>
              <input id="inv-email" type="email" placeholder="pessoa@empresa.com" autocomplete="off">
            </label>
            <label class="ui-field">Nome completo
              <input id="inv-name" type="text" placeholder="Nome da pessoa">
            </label>
            <label class="ui-field">Departamento
              <input id="inv-dept" type="text" placeholder="Opcional">
            </label>
            <label class="ui-field">Perfil de acesso
              <select id="inv-role">${roleOpts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
            </label>
            <label class="ui-field" id="inv-mgmt-field">Gestão <span class="ui-hint">(Gestor / Analista)</span>
              <select id="inv-mgmt">
                <option value="">— selecione —</option>
                ${managements.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")}
              </select>
            </label>
            <p class="users-invite-note">Um email de convite será enviado para a pessoa definir a própria senha.</p>
            <p id="inv-feedback" class="users-invite-feedback"></p>
          </div>
          <div class="users-invite-actions">
            <button type="button" class="ghost-button" id="inv-cancel">Cancelar</button>
            <button type="button" class="primary-button" id="inv-send">Enviar convite</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const roleSel = overlay.querySelector("#inv-role");
      const mgmtField = overlay.querySelector("#inv-mgmt-field");
      const feedback = overlay.querySelector("#inv-feedback");
      const sendBtn = overlay.querySelector("#inv-send");
      const close = () => overlay.remove();

      const syncMgmtVisibility = () => {
        mgmtField.style.display = ["manager", "analyst"].includes(roleSel.value) ? "" : "none";
      };
      roleSel.addEventListener("change", syncMgmtVisibility);
      syncMgmtVisibility();

      overlay.querySelector(".users-invite-close").addEventListener("click", close);
      overlay.querySelector("#inv-cancel").addEventListener("click", close);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

      sendBtn.addEventListener("click", async () => {
        const email = overlay.querySelector("#inv-email").value.trim();
        const role  = roleSel.value;
        const mgmt  = overlay.querySelector("#inv-mgmt").value.trim();
        if (!email) { feedback.textContent = "Informe o e-mail."; feedback.className = "users-invite-feedback is-error"; return; }
        if (["manager", "analyst"].includes(role) && !mgmt) {
          feedback.textContent = "Selecione a gestão para Gestor/Analista."; feedback.className = "users-invite-feedback is-error"; return;
        }
        sendBtn.disabled = true;
        sendBtn.textContent = "Enviando...";
        feedback.textContent = ""; feedback.className = "users-invite-feedback";
        try {
          await callEdgeFunction("invite-user", {
            email,
            full_name: overlay.querySelector("#inv-name").value.trim(),
            department: overlay.querySelector("#inv-dept").value.trim(),
            access_role: role,
            management: ["manager", "analyst"].includes(role) ? mgmt : null
          });
          close();
          allUsers = []; // força refetch fresco
          await loadAndRenderUsers();
        } catch (err) {
          console.error(err);
          feedback.textContent = String(err?.message || "Erro ao enviar o convite.");
          feedback.className = "users-invite-feedback is-error";
          sendBtn.disabled = false;
          sendBtn.textContent = "Enviar convite";
        }
      });

      overlay.querySelector("#inv-email").focus();
    }

    function bindInviteButton() {
      const btn = document.querySelector("#users-invite-btn");
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = "1";
        btn.addEventListener("click", openInvitePanel);
      }
    }

    return { loadAndRenderUsers, bindUsersInviteButton: bindInviteButton };
  }

  window.VECTON_USERS_MODULE = { createUsersModule };
})(window);
