(function attachVectonUsersModule(window) {
  function createUsersModule(deps) {
    const {
      escapeHtml,
      state,
      resolveOrganizationId,
      fetchSupabaseRowsSafe,
      upsertSupabaseRows,
      deleteSupabaseRows,
      callEdgeFunction,
      showToast,
      appConfirm,
      isSuperAdmin,
      isAdmin,
      getUserManagement,
      getReportTitles,
      getCurrentUserId
    } = deps;

    const ROLE_LABELS = {
      super_admin: "Super Admin",
      admin:       "Admin",
      manager:     "Gestor",
      analyst:     "Analista",
      comercial:   "Comercial",
      rps_gestao:  "RPS Gestão",
      gestao_estrategica: "A3 Estratégicos"
    };

    const ROLE_COLORS = {
      super_admin: "#f59e0b",
      admin:       "#4f7cff",
      manager:     "#22c55e",
      analyst:     "#8b5cf6",
      comercial:   "#14b8a6",
      rps_gestao:  "#f472b6",
      gestao_estrategica: "#0ea5e9"
    };

    // Perfis de acesso se combinam (ex: Comercial + RPS Gestão numa mesma
    // pessoa). O BD ainda guarda um "primário" em access_role (compat com
    // profile_label, RLS etc.) + o resto em additional_access_roles — a
    // ordem abaixo (mais privilegiado primeiro) decide qual vira o primário
    // quando vários estão marcados. Mesma ordem usada no invite-user Edge
    // Function (ROLE_PRIORITY lá).
    const PROFILE_ROLE_PRIORITY = Object.keys(ROLE_LABELS);

    function pickPrimaryRole(selectedRoles) {
      const set = new Set(selectedRoles);
      return PROFILE_ROLE_PRIORITY.find((role) => set.has(role)) || "analyst";
    }

    function splitRoles(selectedRoles) {
      const primary = pickPrimaryRole(selectedRoles);
      return { primary, additional: selectedRoles.filter((role) => role !== primary) };
    }

    // Só super_admin pode marcar "Super Admin"; só admin/super_admin podem
    // marcar "Admin" — mesma regra que já existia no seletor único.
    function allowedRoleEntries() {
      return Object.entries(ROLE_LABELS).filter(([val]) => {
        if (val === "super_admin") return isSuperAdmin();
        if (val === "admin") return isSuperAdmin() || isAdmin();
        return true;
      });
    }

    function buildRoleRow(id, label, checked, onToggle) {
      const row = document.createElement("div");
      row.className = "access-row";
      const cb = document.createElement("span");
      cb.className = "access-checkbox" + (checked ? " access-checkbox-on" : "");
      cb.innerHTML = checked
        ? `<svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 5 9 10 3"/></svg>`
        : "";
      cb.dataset.checked = checked ? "1" : "0";
      cb.style.cursor = "pointer";
      cb.addEventListener("click", () => {
        const on = cb.dataset.checked !== "1";
        cb.dataset.checked = on ? "1" : "0";
        cb.className = "access-checkbox" + (on ? " access-checkbox-on" : "");
        cb.innerHTML = on
          ? `<svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 5 9 10 3"/></svg>`
          : "";
        onToggle?.();
      });
      const lbl = document.createElement("span");
      lbl.className = "access-row-label";
      lbl.textContent = label;
      row.append(cb, lbl);
      row.dataset.rowId = id;
      row.dataset.tree = "profileRole";
      return row;
    }

    // Mesmo componente visual das árvores de "Acessos adicionais" (Empresas,
    // Gestões etc. — ver makeTree/buildAccessRow abaixo), mas aqui toda linha
    // é clicável (sem conceito de linha "padrão"/travada) e o painel abre já
    // expandido, por ser o campo mais importante do formulário.
    function buildProfileRolePicker(selectedRoles, onToggle) {
      const selected = new Set(selectedRoles);
      const icon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/></svg>`;
      const section = makeTree("profileRole", icon, "Perfil de acesso", () =>
        allowedRoleEntries().map(([val, label]) => buildRoleRow(val, label, selected.has(val), onToggle))
      );
      section.classList.add("open"); // CSS já cuida do corpo/caret via .access-tree.open
      return section;
    }

    function getSelectedRoles(panel) {
      return [...panel.querySelectorAll('.access-row[data-tree="profileRole"]')]
        .filter((row) => row.querySelector(".access-checkbox")?.dataset.checked === "1")
        .map((row) => row.dataset.rowId);
    }

    let allUsers = [];
    let editingUserId = null;
    let sortKey = "full_name";
    let sortDir = 1;

    // A3-mãe + A3-filha do módulo Estratégico, pro picker de "Acessos
    // adicionais" — carregada 1x (poucas dezenas, mudam raramente) e
    // cacheada, mesmo padrão de ensureOrgUsers() do strategicModule.js.
    // openEditPanel() aguarda essa promise antes de montar o corpo do
    // painel. Traz mãe E filha (não só parent_id is null) — dá pra
    // conceder acesso a 1 filha isolada (ex.: só Exportação, não o
    // Comercial inteiro), ver renderStrategicTree.
    let strategicAreasCache = null;
    async function ensureStrategicAreas() {
      if (strategicAreasCache) return strategicAreasCache;
      const orgId = await resolveOrganizationId();
      const rows = await fetchSupabaseRowsSafe(
        "strategic_a3",
        `organization_id=eq.${orgId}&is_active=eq.true&select=id,name,management,parent_id&order=display_order`
      );
      strategicAreasCache = rows || [];
      return strategicAreasCache;
    }

    // ── Tela "Perfis de Acesso" (accessProfiles-view) ─────────────────────────
    // Cards estáticos no index.html (sem lógica própria antes) — aqui só
    // pluga contagem real + "Ver usuários" filtrado, reaproveitando o mesmo
    // allUsers/ROLE_LABELS já usados na tela de Usuários.
    let roleFilter = null; // { role, label } | null — aplicado em renderUsersTable

    function visibleUsers(users) {
      if (!roleFilter) return users;
      return users.filter((u) =>
        [u.access_role, ...(u.additional_access_roles || [])].filter(Boolean).includes(roleFilter.role)
      );
    }

    function updateUsersFilterBanner() {
      const titleWrap = document.querySelector(".users-header > div:first-child");
      if (!titleWrap) return;
      let banner = titleWrap.querySelector("#users-role-filter-banner");
      if (!roleFilter) { banner?.remove(); return; }
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "users-role-filter-banner";
        banner.className = "users-role-filter-banner";
        titleWrap.appendChild(banner);
      }
      banner.innerHTML = `Filtrando por perfil: <strong>${escapeHtml(roleFilter.label)}</strong> <button type="button" id="users-role-filter-clear">✕</button>`;
      banner.querySelector("#users-role-filter-clear")?.addEventListener("click", () => {
        roleFilter = null;
        updateUsersFilterBanner();
        renderUsersTable(document.querySelector("#users-table-body"), allUsers);
      });
    }

    function updateAccessProfileCounts() {
      const counts = {};
      allUsers.forEach((u) => {
        [u.access_role, ...(u.additional_access_roles || [])].filter(Boolean).forEach((r) => {
          counts[r] = (counts[r] || 0) + 1;
        });
      });
      Object.keys(ROLE_LABELS).forEach((role) => {
        const el = document.querySelector(`#ap-count-${role}`);
        if (!el) return;
        const n = counts[role] || 0;
        el.textContent = `${n} usuário${n === 1 ? "" : "s"}`;
      });
    }

    function bindAccessProfilesButtons() {
      document.querySelectorAll(".ap-users-btn[data-profile]").forEach((btn) => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", () => {
          const role = btn.dataset.profile;
          roleFilter = { role, label: ROLE_LABELS[role] || role };
          // Mesmo botão de menu real (.submenu-button[data-view="users"]) já
          // tem o listener completo (setActiveView + renderNavigation +
          // loadAndRenderUsers) ligado em shellEventsModule — reaproveita em
          // vez de duplicar a navegação aqui.
          document.querySelector('.submenu-button[data-view="users"]')?.click();
          updateUsersFilterBanner();
        });
      });
    }

    async function renderAccessProfilesView() {
      await loadAndRenderUsers();
      updateAccessProfileCounts();
      bindAccessProfilesButtons();
    }

    // ── Ordenação da tabela (mesmo padrão de Actuals/Budget: thead com
    // data-sort, seta ↑↓, clique alterna direção) ─────────────────────────────
    function renderUsersThead() {
      function th(key, cls, label) {
        const active = sortKey === key;
        const arrow = active ? (sortDir === 1 ? " ↑" : " ↓") : "";
        return `<th class="${cls}" data-sort="${key}" style="cursor:pointer;user-select:none${active ? ";color:var(--blue)" : ""}">${label}${arrow}</th>`;
      }
      return `
        ${th("full_name", "", "Usuário")}
        ${th("email", "", "E-mail")}
        ${th("department", "", "Departamento")}
        ${th("access_role", "", "Perfil de Acesso")}
        ${th("is_active", "", "Status")}
        <th class="users-col-actions">Demais Parâmetros</th>
      `;
    }

    function sortedUsers(users) {
      const getValue = (user) => {
        if (sortKey === "is_active") return user.is_active !== false ? 1 : 0;
        if (sortKey === "access_role") return (ROLE_LABELS[user.access_role] || user.access_role || "").toLowerCase();
        return String(user[sortKey] || "").toLowerCase();
      };
      return [...users].sort((a, b) => {
        const va = getValue(a);
        const vb = getValue(b);
        if (va < vb) return -sortDir;
        if (va > vb) return sortDir;
        return 0;
      });
    }

    function bindUsersSort() {
      const theadEl = document.querySelector("#users-table-body")?.closest("table")?.querySelector("thead");
      if (theadEl && !theadEl.dataset.bound) {
        theadEl.dataset.bound = "1";
        theadEl.addEventListener("click", (event) => {
          const th = event.target.closest("th[data-sort]");
          if (!th) return;
          const key = th.dataset.sort;
          sortDir = key === sortKey ? -sortDir : 1;
          sortKey = key;
          renderUsersTable(document.querySelector("#users-table-body"), allUsers);
        });
      }
    }

    // ── Ativar/Desativar acesso ───────────────────────────────────────────────
    // Mesmo controle (badge clicável) usado na tabela e dentro do painel de
    // edição — clicar sempre confirma e aplica na hora (não fica pendente de
    // "Salvar"), porque desligar o acesso de alguém é um efeito imediato:
    // chama a Edge Function que bane o usuário no GoTrue (bloqueia login de
    // verdade) e marca is_active=false, que por sua vez derruba o acesso de
    // qualquer sessão já aberta via RLS (ver 117_user_profiles_is_active.sql).
    function canEditUser(user) {
      const allRoles = [user.access_role, ...(user.additional_access_roles || [])].filter(Boolean);
      return isSuperAdmin() || (isAdmin() && !allRoles.includes("super_admin"));
    }

    function statusBadgeHtml(user) {
      const active = user.is_active !== false;
      const cls = active ? "users-status-active" : "users-status-inactive";
      const label = active ? "● Ativo" : "○ Inativo";
      const isSelf = getCurrentUserId?.() && user.user_id === getCurrentUserId();
      if (isSelf) {
        return `<span class="${cls}" title="Você não pode inativar o próprio acesso.">${label}</span>`;
      }
      if (!canEditUser(user)) {
        return `<span class="${cls}">${label}</span>`;
      }
      return `<button type="button" class="users-status-toggle ${cls}" data-action="toggleActive" data-uid="${escapeHtml(user.id)}" title="Clique para ${active ? "inativar" : "ativar"} o acesso">${label}</button>`;
    }

    async function handleToggleActive(user) {
      const nextActive = user.is_active === false;
      const name = user.full_name || user.email || "este usuário";
      const msg = nextActive
        ? `Ativar o acesso de ${escapeHtml(name)}? A pessoa poderá fazer login novamente.`
        : `Inativar o acesso de ${escapeHtml(name)}? A pessoa não conseguirá mais fazer login nem acessar o sistema.`;
      const ok = await appConfirm(msg, nextActive ? "activate" : "deactivate");
      if (!ok) return;
      try {
        await callEdgeFunction("set-user-active", { user_id: user.user_id, is_active: nextActive });
        showToast(nextActive ? `${name} ativado.` : `${name} inativado.`, "success");
        if (editingUserId === user.id) {
          document.querySelector("#users-edit-panel")?.classList.remove("open");
          editingUserId = null;
        }
        allUsers = [];
        await loadAndRenderUsers();
      } catch (err) {
        console.error(err);
        showToast(String(err?.message || "Erro ao atualizar o status do usuário."), "error");
      }
    }

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
    async function openEditPanel(user) {
      editingUserId = user.id;
      await ensureStrategicAreas(); // cacheado após a 1ª vez — as árvores abaixo leem strategicAreasCache direto
      if (editingUserId !== user.id) return; // usuário trocou de painel antes do fetch voltar
      const panel = getOrCreatePanel();
      panel.querySelector("#ue-panel-title").textContent = user.full_name || user.email || "Editar usuário";

      const managements = [...new Set(
        state.costCenters.map((cc) => (cc.management || "").trim()).filter(Boolean)
      )].sort();

      const mgmtOptions = [`<option value="">— nenhuma —</option>`,
        ...managements.map((m) => `<option value="${escapeHtml(m)}" ${user.management === m ? "selected" : ""}>${escapeHtml(m)}</option>`)
      ].join("");

      panel.querySelector("#ue-panel-body").innerHTML = `
        <div class="ue-status-row">
          <div>
            <div class="ue-status-label">Status do acesso</div>
            <div class="ue-status-hint">Usuário inativado não consegue mais fazer login.</div>
          </div>
          ${statusBadgeHtml(user)}
        </div>
        <div class="ue-section">
          <label class="ue-label">Nome de exibição</label>
          <input class="ue-input" id="ue-name" type="text" value="${escapeHtml(user.full_name || "")}" placeholder="Nome completo">
        </div>
        <div class="ue-section">
          <label class="ue-label">Departamento</label>
          <input class="ue-input" id="ue-dept" type="text" value="${escapeHtml(user.department || "")}" placeholder="Departamento">
        </div>
        <div class="ue-section" id="ue-role-section">
          <label class="ue-label">Perfil de acesso <span class="ue-label-hint">(pode marcar mais de um)</span></label>
        </div>
        <div class="ue-section" id="ue-mgmt-section">
          <label class="ue-label">Gestão <span class="ue-label-hint">(Gestor / Analista)</span></label>
          <select class="ue-select" id="ue-mgmt">${mgmtOptions}</select>
        </div>
        <div class="ue-section" id="ue-strategic-mode-section">
          <label class="ue-label">Modo de acesso ao A3 Estratégicos</label>
          <select class="ue-select" id="ue-strategic-mode">
            <option value="write" ${(user.strategic_access_mode || "write") === "write" ? "selected" : ""}>Leitura e gravação</option>
            <option value="read" ${user.strategic_access_mode === "read" ? "selected" : ""}>Somente leitura</option>
          </select>
        </div>

        <div class="ue-divider"></div>

        <div class="ue-section">
          <div class="ue-tree-header">
            <span class="ue-tree-title">Acessos adicionais</span>
            <span class="ue-tree-hint">Marcações extras além do padrão da gestão</span>
          </div>
        </div>
      `;

      panel.querySelector('.ue-status-row [data-action="toggleActive"]')
        ?.addEventListener("click", () => handleToggleActive(user));

      // perfil de acesso: picker de múltipla marcação (checkboxes), não select único
      const currentRoles = [user.access_role, ...(user.additional_access_roles || [])].filter(Boolean);
      const mgmtSection = panel.querySelector("#ue-mgmt-section");
      const strategicModeSection = panel.querySelector("#ue-strategic-mode-section");
      const updateFromRoles = () => {
        const roles = getSelectedRoles(panel);
        mgmtSection.style.display = roles.some((r) => ["manager", "analyst"].includes(r)) ? "" : "none";
        strategicModeSection.style.display = roles.includes("gestao_estrategica") ? "" : "none";
        rebuildTrees(panel, user, pickPrimaryRole(roles), panel.querySelector("#ue-mgmt").value, roles);
      };
      panel.querySelector("#ue-role-section").append(buildProfileRolePicker(currentRoles, updateFromRoles));
      panel.querySelector("#ue-mgmt").addEventListener("change", updateFromRoles);
      // append árvores como DOM
      const treeSection = panel.querySelector(".ue-section:last-child");
      treeSection.append(renderAccessTrees(user, currentRoles));

      updateFromRoles();
      panel.classList.add("open");
    }

    // ── Constrói as 5 árvores de acesso (a de A3 Estratégicos só aparece se
    // o perfil marcado incluir manager ou gestao_estrategica) ────────────────
    function renderAccessTrees(user, roles) {
      const wrap = document.createElement("div");
      wrap.className = "ue-trees";
      wrap.append(renderManagementTree(user), renderBranchTree(user), renderAccountTree(user), renderCcTree(user), renderReportTree(user));
      const strategicTree = renderStrategicTree(user, roles || [], strategicAreasCache);
      if (strategicTree) wrap.append(strategicTree);
      return wrap;
    }

    function rebuildTrees(panel, user, role, mgmt, roles) {
      const mgmtChanged = mgmt !== (user.management || "");
      const fakeUser = {
        ...user,
        access_role: role,
        management: mgmt,
        extra_cc_ids: mgmtChanged ? [] : user.extra_cc_ids,
        extra_managements: mgmtChanged ? [] : user.extra_managements
      };
      const old = panel.querySelector(".ue-trees");
      if (old) old.replaceWith(renderAccessTrees(fakeUser, roles));
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

    function isExtraStrategicA3(user, a3Id) {
      return (user.extra_strategic_a3_ids || []).some((id) => String(id) === String(a3Id));
    }

    // Gestor: a A3-mãe cuja Gestão bate com a dele já vem marcada por
    // padrão (mesma regra do banco, strategic_can_edit_a3). Gestor SEM
    // nenhuma Gestão marcada edita TUDO, igual Admin — mesma paridade que
    // já existe em OPEX/Headcount (getAllowedManagements, app.js) — decisão
    // do usuário (2026-08-29), migration 147. A3 Estratégicos
    // (gestao_estrategica): NADA vem por padrão — é o perfil "escolha
    // quais A3", tudo é opt-in via extra_strategic_a3_ids.
    function isDefaultStrategicA3(user, area) {
      if (user.access_role !== "manager") return false;
      const mgmt = (user.management || "").trim();
      if (!mgmt) return true;
      return !!area.management && area.management === mgmt;
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

    // Só aparece quando o perfil marcado inclui manager ou gestao_estrategica
    // (primário ou adicional) — pros demais papéis o conceito "quais A3" não
    // existe (super_admin/admin já têm tudo; analyst/comercial/rps_gestao
    // nem enxergam o módulo, canAccessStrategic() em app.js). roles = lista
    // COMPLETA (não só primário) — vem de getSelectedRoles(panel).
    //
    // Agrupado por A3-mãe (igual Centros de Custo agrupados por Gestão):
    // marcar a mãe concede a área inteira (cascateia pras filhas
    // automaticamente no banco, strategic_can_edit_a3/view_a3); marcar só
    // 1 filha concede só ela, sem tocar nas irmãs nem no consolidado da
    // mãe — pedido explícito do usuário (2026-08-29), pra gente que só
    // deve enxergar 1 desdobramento (ex.: só Exportação, não o Comercial
    // inteiro).
    function renderStrategicTree(user, roles, areas) {
      if (!roles.includes("manager") && !roles.includes("gestao_estrategica")) return null;
      const icon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`;
      return makeTree("strategic", icon, "A3 Estratégicos", () => {
        const rows = [];
        const roots = (areas || []).filter((a) => !a.parent_id);
        roots.forEach((root) => {
          const children = (areas || []).filter((c) => c.parent_id && String(c.parent_id) === String(root.id));
          const rootIsDefault = isDefaultStrategicA3(user, root);
          const rootIsExtra = isExtraStrategicA3(user, root.id);
          const rootLabelBase = root.management ? `${root.name} (${root.management})` : root.name;
          const rootLabel = children.length ? `${rootLabelBase} — toda a área` : rootLabelBase;
          const rootRow = buildAccessRow(String(root.id), rootLabel, rootIsDefault || rootIsExtra, rootIsDefault);
          rootRow.dataset.tree = "strategic";
          rows.push(rootRow);

          children.forEach((child) => {
            // Filha herda o "default" da mãe (Gestor cuja Gestão bate já
            // enxerga/edita todas as filhas automaticamente, sem precisar
            // marcar cada uma) — marcar só ELA é a concessão granular extra.
            const childIsDefault = rootIsDefault;
            const childIsExtra = isExtraStrategicA3(user, child.id);
            const childRow = buildAccessRow(String(child.id), child.name, childIsDefault || childIsExtra, childIsDefault);
            childRow.dataset.tree = "strategic";
            childRow.style.paddingLeft = "20px";
            rows.push(childRow);
          });
        });
        return rows;
      });
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
        const mgmt     = panel.querySelector("#ue-mgmt")?.value || null;

        const selectedRoles = getSelectedRoles(panel);
        if (!selectedRoles.length) {
          showToast("Marque pelo menos um perfil de acesso.", "error");
          saveBtn.disabled = false;
          saveBtn.textContent = "Salvar";
          return;
        }
        const { primary: role, additional: additionalRoles } = splitRoles(selectedRoles);

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
        const extraStrategicA3Ids = getExtras("strategic");
        const strategicMode = panel.querySelector("#ue-strategic-mode")?.value || "write";

        const user = allUsers.find((u) => u.id === editingUserId);
        const orgId = await resolveOrganizationId();

        await upsertSupabaseRows("user_profiles", [{
          organization_id:    orgId,
          user_id:            user.user_id,
          full_name:          name,
          department:         dept,
          access_role:        role,
          additional_access_roles: additionalRoles,
          management:         mgmt || null,
          extra_managements:  extraManagements,
          extra_branch_ids:   extraBranchIds,
          extra_cc_ids:       extraCcIds,
          extra_account_codes: extraAccountCodes,
          extra_report_ids:   extraReportIds,
          strategic_access_mode: selectedRoles.includes("gestao_estrategica") ? strategicMode : null,
          extra_strategic_a3_ids: extraStrategicA3Ids
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
          `organization_id=eq.${orgId}&select=id,user_id,full_name,email,department,access_role,additional_access_roles,management,extra_managements,extra_branch_ids,extra_cc_ids,extra_account_codes,extra_report_ids,strategic_access_mode,extra_strategic_a3_ids,is_active,photo_kind,photo_value&order=full_name.asc`
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
        const theadRow = tbody.closest("table")?.querySelector("thead tr");
        if (theadRow) theadRow.innerHTML = renderUsersThead();

        const filtered = sortedUsers(visibleUsers(users));
        if (roleFilter && filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" class="users-empty">Nenhum usuário com o perfil "${escapeHtml(roleFilter.label)}".</td></tr>`;
          return;
        }

        tbody.innerHTML = filtered.map((user) => {
          const role     = user.access_role || "analyst";
          const allRoles = [role, ...(user.additional_access_roles || [])].filter(Boolean);
          const badges   = allRoles.map((r) => {
            const label = ROLE_LABELS[r] || r;
            const color = ROLE_COLORS[r] || "#6b7280";
            return `<span class="users-badge" style="background:${color}22;color:${color}">${escapeHtml(label)}</span>`;
          }).join(" ");
          const initials = (user.full_name || user.email || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
          const mgmt     = user.management ? `<br><span style="font-size:0.68rem;color:var(--text-faint)">${escapeHtml(user.management)}</span>` : "";
          const canEdit  = canEditUser(user);

          return `<tr data-user-id="${escapeHtml(user.id)}">
            <td>
              <div class="users-name-cell">
                <span class="users-avatar">${escapeHtml(initials)}</span>
                <span class="users-name-text">${escapeHtml(user.full_name || "—")}${mgmt}</span>
              </div>
            </td>
            <td><span class="users-email-text">${escapeHtml(user.email || "—")}</span></td>
            <td><span class="users-email-text">${escapeHtml(user.department || "—")}</span></td>
            <td><div class="users-role-list">${badges}</div></td>
            <td>${statusBadgeHtml(user)}</td>
            <td>
              <div class="users-actions">
                ${canEdit ? `<button class="users-action-btn users-action-invite" type="button" title="Reenviar convite (usuário ainda não definiu senha)" data-action="resendInvite" data-uid="${escapeHtml(user.id)}">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4v5h5"/><path d="M20 20v-5h-5"/><path d="M4.6 9A9 9 0 1 1 4 15"/></svg>
                </button>` : ""}
                <button class="users-action-btn" type="button" title="Reenviar email de redefinição de senha" data-action="resend" data-uid="${escapeHtml(user.id)}">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.2 8a9 9 0 1 0 .8 4"/><path d="M21 3v5h-5"/></svg>
                </button>
                ${canEdit ? `<button class="users-action-btn" type="button" title="Definir nova senha" data-action="setpassword" data-uid="${escapeHtml(user.id)}">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                </button>
                <button class="users-action-btn" type="button" title="Editar usuário" data-action="edit" data-uid="${escapeHtml(user.id)}">
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
            if (btn.dataset.action === "edit")          openEditPanel(user);
            if (btn.dataset.action === "toggleActive")  handleToggleActive(user);
            if (btn.dataset.action === "resendInvite")  handleResendInvite(user);
            if (btn.dataset.action === "resend")        handleResend(user);
            if (btn.dataset.action === "delete")        handleDelete(user);
            if (btn.dataset.action === "setpassword")   openSetPasswordModal(user);
          });
        });
    }

    // Reenvia o CONVITE original (auth.admin.inviteUserByEmail) — pra usuário
    // que ainda não definiu senha. Exige service_role, por isso Edge Function.
    async function handleResendInvite(user) {
      if (!user.user_id) return;
      try {
        await callEdgeFunction("resend-invite", {
          user_id: user.user_id,
          redirect_to: window.location.origin + window.location.pathname
        });
        showToast(`Convite reenviado para ${user.email}`, "success");
      } catch (err) {
        console.error(err);
        showToast(String(err?.message || "Não foi possível reenviar o convite."), "error");
      }
    }

    // Reenvia o email de REDEFINIÇÃO de senha — pra usuário que já é ativo e
    // esqueceu a senha. Via Edge Function (resend-password): gera o link com
    // service_role e envia pelo Resend, em vez do antigo endpoint público
    // GoTrue /auth/v1/recover (SMTP do painel tem o nome do remetente
    // sobrescrito pelo GAL do Outlook em destinatários @marcher.com.br).
    async function handleResend(user) {
      if (!user.user_id) return;
      try {
        await callEdgeFunction("resend-password", {
          user_id: user.user_id,
          redirect_to: window.location.origin + window.location.pathname
        });
        showToast(`Email de redefinição de senha enviado para ${user.email}`, "success");
      } catch (err) {
        console.error(err);
        showToast(String(err?.message || "Não foi possível enviar o email de redefinição de senha."), "error");
      }
    }

    async function handleDelete(user) {
      const ok = await appConfirm(`Excluir ${escapeHtml(user.full_name || user.email)}? Esta ação não pode ser desfeita.`, "danger");
      if (!ok) return;
      try {
        const orgId = await resolveOrganizationId();
        const response = await deleteSupabaseRows(
          "user_profiles",
          `organization_id=eq.${orgId}&user_id=eq.${user.user_id}`
        );
        // O RLS não estoura erro quando a policy filtra a linha do DELETE —
        // o PostgREST só devolve 0 linhas afetadas (return=representation).
        // Sem checar isso aqui, uma exclusão sem permissão passava batido:
        // nenhum toast, nenhuma mudança, e o usuário achava que "não fez nada".
        const deletedRows = await response.json().catch(() => []);
        if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
          showToast("Você não tem permissão para excluir este usuário.", "error");
          return;
        }
        await loadAndRenderUsers();
      } catch (err) {
        console.error(err);
        showToast("Erro ao excluir usuário.", "error");
      }
    }

    // ── Definir nova senha (modal + Edge Function) ────────────────────────────
    function openSetPasswordModal(user) {
      document.querySelector("#users-setpassword-overlay")?.remove();

      const nome = user.full_name || user.email || "este usuário";
      const overlay = document.createElement("div");
      overlay.id = "users-setpassword-overlay";
      overlay.className = "users-invite-overlay";
      overlay.innerHTML = `
        <div class="users-invite-modal">
          <div class="users-invite-header">
            <div>
              <p class="users-invite-kicker">DEFINIR NOVA SENHA</p>
              <h3 class="users-invite-title">${escapeHtml(nome)}</h3>
            </div>
            <button type="button" class="users-invite-close" aria-label="Fechar">✕</button>
          </div>
          <div class="users-invite-body">
            <p class="users-invite-note">O usuário poderá entrar imediatamente com a nova senha.</p>
            <label class="ui-field">Nova senha <span style="color:var(--red)">*</span>
              <input id="sp-password" type="password" minlength="6" autocomplete="new-password" placeholder="Mínimo de 6 caracteres">
            </label>
            <label class="ui-field">Confirmar senha <span style="color:var(--red)">*</span>
              <input id="sp-password-confirm" type="password" minlength="6" autocomplete="new-password" placeholder="Repita a nova senha">
            </label>
            <p id="sp-feedback" class="users-invite-feedback"></p>
          </div>
          <div class="users-invite-actions">
            <button type="button" class="ghost-button" id="sp-cancel">Cancelar</button>
            <button type="button" class="primary-button" id="sp-save">Salvar nova senha</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const feedback = overlay.querySelector("#sp-feedback");
      const saveBtn = overlay.querySelector("#sp-save");
      const close = () => overlay.remove();

      overlay.querySelector(".users-invite-close").addEventListener("click", close);
      overlay.querySelector("#sp-cancel").addEventListener("click", close);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

      saveBtn.addEventListener("click", async () => {
        const password = overlay.querySelector("#sp-password").value;
        const confirm  = overlay.querySelector("#sp-password-confirm").value;
        if (password.length < 6) {
          feedback.textContent = "A senha deve ter pelo menos 6 caracteres.";
          feedback.className = "users-invite-feedback is-error";
          return;
        }
        if (password !== confirm) {
          feedback.textContent = "A confirmação da senha não confere.";
          feedback.className = "users-invite-feedback is-error";
          return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = "Salvando...";
        feedback.textContent = ""; feedback.className = "users-invite-feedback";
        try {
          await callEdgeFunction("set-user-password", { user_id: user.user_id, new_password: password });
          close();
        } catch (err) {
          console.error(err);
          feedback.textContent = String(err?.message || "Erro ao definir a nova senha.");
          feedback.className = "users-invite-feedback is-error";
          saveBtn.disabled = false;
          saveBtn.textContent = "Salvar nova senha";
        }
      });

      overlay.querySelector("#sp-password").focus();
    }

    // ── Convidar usuário (modal + Edge Function) ──────────────────────────────
    function openInvitePanel() {
      document.querySelector("#users-invite-overlay")?.remove();

      const managements = (state.managements || []).map((m) => m.name).filter(Boolean);

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
            <div class="ui-field" id="inv-role-field">Perfil de acesso <span class="ui-hint">(pode marcar mais de um)</span></div>
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

      const mgmtField = overlay.querySelector("#inv-mgmt-field");
      const feedback = overlay.querySelector("#inv-feedback");
      const sendBtn = overlay.querySelector("#inv-send");
      const close = () => overlay.remove();

      const syncMgmtVisibility = () => {
        const roles = getSelectedRoles(overlay);
        mgmtField.style.display = roles.some((r) => ["manager", "analyst"].includes(r)) ? "" : "none";
      };
      overlay.querySelector("#inv-role-field").append(buildProfileRolePicker([], syncMgmtVisibility));
      syncMgmtVisibility();

      overlay.querySelector(".users-invite-close").addEventListener("click", close);
      overlay.querySelector("#inv-cancel").addEventListener("click", close);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

      sendBtn.addEventListener("click", async () => {
        const email = overlay.querySelector("#inv-email").value.trim();
        const selectedRoles = getSelectedRoles(overlay);
        const mgmt  = overlay.querySelector("#inv-mgmt").value.trim();
        if (!email) { feedback.textContent = "Informe o e-mail."; feedback.className = "users-invite-feedback is-error"; return; }
        if (!selectedRoles.length) {
          feedback.textContent = "Marque pelo menos um perfil de acesso."; feedback.className = "users-invite-feedback is-error"; return;
        }
        if (selectedRoles.some((r) => ["manager", "analyst"].includes(r)) && !mgmt) {
          feedback.textContent = "Selecione a gestão para Gestor/Analista."; feedback.className = "users-invite-feedback is-error"; return;
        }
        const { primary, additional } = splitRoles(selectedRoles);
        sendBtn.disabled = true;
        sendBtn.textContent = "Enviando...";
        feedback.textContent = ""; feedback.className = "users-invite-feedback";
        try {
          await callEdgeFunction("invite-user", {
            email,
            full_name: overlay.querySelector("#inv-name").value.trim(),
            department: overlay.querySelector("#inv-dept").value.trim(),
            access_role: primary,
            additional_access_roles: additional,
            management: selectedRoles.some((r) => ["manager", "analyst"].includes(r)) ? mgmt : null,
            redirect_to: window.location.origin + window.location.pathname
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

    return { loadAndRenderUsers, bindUsersInviteButton: bindInviteButton, bindUsersSort, renderAccessProfilesView };
  }

  window.VECTON_USERS_MODULE = { createUsersModule };
})(window);
