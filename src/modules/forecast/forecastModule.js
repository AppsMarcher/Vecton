(function attachVectonForecastModule(window) {
  function createForecastModule(deps) {
    const {
      escapeHtml,
      state,
      MONTH_LABELS,
      resolveOrganizationId,
      fetchSupabaseRowsSafe,
      upsertSupabaseRows,
      deleteSupabaseRows,
      isAdmin,
      openScenarioDreReport,
    } = deps;

    // ── local state ──────────────────────────────────────────────────────────
    let scenarios    = null;   // null = not yet loaded
    let selectedId   = null;
    let isCreating   = false;

    const PRESET_COLORS = [
      "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
      "#f97316", "#eab308", "#22c55e", "#14b8a6",
      "#3b82f6", "#64748b",
    ];
    const PRESET_ICONS = [
      "vp-icon-cost", "vp-icon-trend-up", "vp-icon-activity", "vp-icon-dollar",
      "vp-icon-pie", "vp-icon-target", "vp-icon-layers", "vp-icon-sliders",
      "vp-icon-briefcase", "vp-icon-reports", "vp-icon-planning", "vp-icon-dashboard",
    ];

    function iconSvg(key) {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${key || "vp-icon-cost"}"></use></svg>`;
    }

    // ── Supabase ─────────────────────────────────────────────────────────────
    async function loadScenarios(year) {
      const orgId = await resolveOrganizationId();
      const rows = await fetchSupabaseRowsSafe(
        "forecast_scenarios",
        `organization_id=eq.${orgId}&reference_year=eq.${year}&order=sort_order.asc,created_at.asc&select=id,name,color,icon,reference_year,cutoff_month,created_at`
      );
      scenarios = rows;
      return rows;
    }

    async function createScenario({ name, color, icon, referenceYear, cutoffMonth }) {
      const orgId = await resolveOrganizationId();
      const id = crypto.randomUUID();
      await upsertSupabaseRows("forecast_scenarios", [{
        id,
        organization_id: orgId,
        name,
        color,
        icon,
        reference_year: referenceYear,
        cutoff_month:   cutoffMonth,
      }], ["id"]);
      return id;
    }

    async function fetchActualsMonthRows(year, month) {
      const orgId  = await resolveOrganizationId();
      const pgSize = 1000;
      const rows   = [];
      let lastId   = "00000000-0000-0000-0000-000000000000";
      while (true) {
        const page = await fetchSupabaseRowsSafe(
          "actuals_ledger_entries",
          `organization_id=eq.${orgId}&reference_year=eq.${year}&reference_month=eq.${month}` +
          `&id=gt.${lastId}&select=account_number,cost_center_id,cost_center_number,amount,entry_date,history` +
          `&order=id.asc&limit=${pgSize}`
        );
        rows.push(...page);
        if (page.length < pgSize) break;
        lastId = page[page.length - 1].id;
      }
      return rows;
    }

    async function fetchBudgetMonthRows(year, month) {
      const orgId  = await resolveOrganizationId();
      const pgSize = 1000;
      const rows   = [];
      let lastId   = "00000000-0000-0000-0000-000000000000";
      while (true) {
        const page = await fetchSupabaseRowsSafe(
          "budget_ledger_entries",
          `organization_id=eq.${orgId}&reference_year=eq.${year}&reference_month=eq.${month}` +
          `&id=gt.${lastId}&select=account_number,cost_center_id,cost_center_number,amount,entry_date,history` +
          `&order=id.asc&limit=${pgSize}`
        );
        rows.push(...page);
        if (page.length < pgSize) break;
        lastId = page[page.length - 1].id;
      }
      return rows;
    }

    async function fetchScenarioMonthRows(scenarioId, year, month) {
      const orgId  = await resolveOrganizationId();
      const pgSize = 1000;
      const rows   = [];
      let lastId   = "00000000-0000-0000-0000-000000000000";
      while (true) {
        const page = await fetchSupabaseRowsSafe(
          "forecast_ledger_entries",
          `organization_id=eq.${orgId}&scenario_id=eq.${scenarioId}&reference_year=eq.${year}&reference_month=eq.${month}` +
          `&id=gt.${lastId}&select=account_number,cost_center_id,cost_center_number,amount,entry_date,history` +
          `&order=id.asc&limit=${pgSize}`
        );
        rows.push(...page);
        if (page.length < pgSize) break;
        lastId = page[page.length - 1].id;
      }
      return rows;
    }

    async function insertForecastRows(orgId, scenarioId, year, month, sourceRows) {
      if (!sourceRows.length) return;
      const chunkSize = 500;
      const rows = sourceRows.map(r => ({
        id:                  crypto.randomUUID(),
        organization_id:     orgId,
        scenario_id:         scenarioId,
        reference_year:      year,
        reference_month:     month,
        account_number:      r.account_number,
        cost_center_id:      r.cost_center_id   || null,
        cost_center_number:  r.cost_center_number || null,
        amount:              r.amount,
        entry_date:          r.entry_date || null,
        history:             r.history    || null,
      }));
      for (let i = 0; i < rows.length; i += chunkSize) {
        await upsertSupabaseRows("forecast_ledger_entries", rows.slice(i, i + chunkSize), ["id"]);
      }
    }

    // ── Headcount por fonte ───────────────────────────────────────────────────

    async function fetchActualsHcMonthRows(year, month) {
      const orgId  = await resolveOrganizationId();
      const pgSize = 1000;
      const rows   = [];
      let offset   = 0;
      while (true) {
        const page = await fetchSupabaseRowsSafe(
          "headcount_entries",
          `organization_id=eq.${orgId}&reference_year=eq.${year}&reference_month=eq.${month}` +
          `&load_type=eq.realizado&select=branch_code,cost_center_number,matricula,colab,cargo` +
          `&order=matricula.asc&limit=${pgSize}&offset=${offset}`
        );
        rows.push(...page);
        if (page.length < pgSize) break;
        offset += pgSize;
      }
      return rows;
    }

    async function fetchBudgetHcMonthRows(year, month) {
      const orgId  = await resolveOrganizationId();
      const pgSize = 1000;
      const rows   = [];
      let offset   = 0;
      while (true) {
        const page = await fetchSupabaseRowsSafe(
          "headcount_entries",
          `organization_id=eq.${orgId}&reference_year=eq.${year}&reference_month=eq.${month}` +
          `&load_type=eq.orcado&select=branch_code,cost_center_number,matricula,colab,cargo` +
          `&order=matricula.asc&limit=${pgSize}&offset=${offset}`
        );
        rows.push(...page);
        if (page.length < pgSize) break;
        offset += pgSize;
      }
      return rows;
    }

    async function fetchScenarioHcMonthRows(srcScenarioId, year, month) {
      const orgId  = await resolveOrganizationId();
      const pgSize = 1000;
      const rows   = [];
      let lastId   = "00000000-0000-0000-0000-000000000000";
      while (true) {
        const page = await fetchSupabaseRowsSafe(
          "forecast_headcount_entries",
          `organization_id=eq.${orgId}&scenario_id=eq.${srcScenarioId}` +
          `&reference_year=eq.${year}&reference_month=eq.${month}` +
          `&id=gt.${lastId}&select=id,branch_code,cost_center_number,matricula,colab,cargo` +
          `&order=id.asc&limit=${pgSize}`
        );
        rows.push(...page);
        if (page.length < pgSize) break;
        lastId = page[page.length - 1].id;
      }
      return rows;
    }

    async function copyMonthHcData(orgId, scenarioId, year, month, source) {
      let hcRows;
      if (source === "real")        hcRows = await fetchActualsHcMonthRows(year, month);
      else if (source === "budget") hcRows = await fetchBudgetHcMonthRows(year, month);
      else                          hcRows = await fetchScenarioHcMonthRows(source, year, month);

      // Remove headcount existente do mês/cenário antes de inserir
      await deleteSupabaseRows("forecast_headcount_entries",
        `organization_id=eq.${orgId}&scenario_id=eq.${scenarioId}` +
        `&reference_year=eq.${year}&reference_month=eq.${month}`);

      if (!hcRows.length) return;
      const chunkSize = 500;
      const toInsert = hcRows.map(r => ({
        id:                 crypto.randomUUID(),
        organization_id:    orgId,
        scenario_id:        scenarioId,
        reference_year:     year,
        reference_month:    month,
        branch_code:        r.branch_code        || null,
        cost_center_number: r.cost_center_number || null,
        matricula:          r.matricula,
        colab:              r.colab,
        cargo:              r.cargo              || null,
      }));
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        await upsertSupabaseRows("forecast_headcount_entries",
          toInsert.slice(i, i + chunkSize),
          ["organization_id", "reference_year", "reference_month", "scenario_id", "matricula"]);
      }
    }

    async function copyMonthData(orgId, scenarioId, year, month, source) {
      let sourceRows;
      if (source === "real")        sourceRows = await fetchActualsMonthRows(year, month);
      else if (source === "budget") sourceRows = await fetchBudgetMonthRows(year, month);
      else                          sourceRows = await fetchScenarioMonthRows(source, year, month);
      // Copia ledger financeiro e headcount em paralelo
      await Promise.all([
        insertForecastRows(orgId, scenarioId, year, month, sourceRows),
        copyMonthHcData(orgId, scenarioId, year, month, source),
      ]);
    }

    // ── Render ────────────────────────────────────────────────────────────────
    function renderPlanningView(container) {
      if (!container) return;
      if (isCreating) {
        renderNewForm(container);
      } else if (selectedId) {
        const sc = (scenarios || []).find(s => s.id === selectedId);
        renderDetail(container, sc);
      } else {
        renderGrid(container);
      }
    }

    function hexToRgba(hex, alpha) {
      const h = (hex || "#6366f1").replace("#", "");
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }

    async function renderGrid(container) {
      const year = Number(state.currentPeriod?.year || 2026);
      if (!scenarios) {
        container.innerHTML = `<div class="reports-layout"><div class="reports-catalog-card"><div class="fc-loading">Carregando cenários…</div></div></div>`;
        await loadScenarios(year);
      }

      const gearSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

      // Planejamento segue a mesma regra do real: Gestor/Analista só leitura
      // (sem criar/editar/copiar/remover cenário), igual Carga de Realizado
      // sendo admin-only hoje.
      const canEdit = isAdmin();

      const cards = (scenarios || []).map(s => {
        const color = s.color || "#6366f1";
        return `
        <button class="reports-report-card fc-scenario-card" type="button"
          data-scenario-id="${escapeHtml(s.id)}"
          style="border-top-color:${escapeHtml(color)};--fc-accent:${escapeHtml(color)}">
          <div class="rrc-top">
            <span class="rrc-icon-wrap" style="background:${hexToRgba(color, 0.12)};border-color:${hexToRgba(color, 0.25)};color:${escapeHtml(color)}">
              ${iconSvg(s.icon)}
            </span>
            ${canEdit ? `<span class="fc-card-menu-btn" role="button" data-fc-menu="${escapeHtml(s.id)}" aria-label="Opções" tabindex="-1">${gearSvg}</span>` : ""}
          </div>
          <strong>${escapeHtml(s.name)}</strong>
          <span class="rrc-subtitle">Corte: ${escapeHtml(MONTH_LABELS[(s.cutoff_month || 1) - 1])} · ${s.reference_year}</span>
        </button>`;
      }).join("");

      container.innerHTML = `
        <div class="reports-layout">
          <div class="reports-catalog-card">
            <div class="reports-catalog-header">
              <h2 class="reports-catalog-title">Repositório de Cenários</h2>
              ${canEdit ? `<button class="fc-new-btn" type="button" id="fc-new-btn">+ Novo cenário</button>` : ""}
            </div>
            <div class="reports-card-grid">
              ${cards || `<p class="fc-empty">${canEdit ? `Nenhum cenário ainda. Clique em <strong>+ Novo cenário</strong> para começar.` : "Nenhum cenário disponível."}</p>`}
            </div>
          </div>
        </div>`;

      container.querySelector("#fc-new-btn")?.addEventListener("click", () => {
        isCreating = true;
        renderNewForm(container);
      });

      container.querySelector(".reports-card-grid")?.addEventListener("click", e => {
        const menuBtn = e.target.closest("[data-fc-menu]");
        if (menuBtn) {
          e.stopPropagation();
          e.preventDefault();
          const scenario = (scenarios || []).find(s => s.id === menuBtn.dataset.fcMenu);
          if (scenario) openScenarioMenu(menuBtn, scenario, container);
          return;
        }
        const card = e.target.closest("[data-scenario-id]");
        if (!card) return;
        selectedId = card.dataset.scenarioId;
        renderDetail(container, (scenarios || []).find(s => s.id === selectedId));
      });
    }

    function renderNewForm(container) {
      const year = Number(state.currentPeriod?.year || 2026);
      const existing = scenarios || [];

      function sourceOptions() {
        return [
          `<option value="real">Real</option>`,
          `<option value="budget">Budget</option>`,
          ...existing.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`),
        ].join("");
      }

      const monthCols = MONTH_LABELS.map((lbl, i) => `
        <div class="fc-mcol" data-month="${i + 1}">
          <span class="fc-mlabel">${escapeHtml(lbl)}</span>
          <select class="fc-msrc" data-month="${i + 1}">${sourceOptions()}</select>
        </div>`).join("");

      container.innerHTML = `
        <div class="fc-wrap fc-form-wrap">
          <div class="fc-form-header">
            <button class="fc-back-btn" id="fc-back" type="button">← Cenários</button>
            <h2 class="fc-form-title">Novo cenário · ${year}</h2>
          </div>
          <form id="fc-form" class="fc-form" autocomplete="off">

            <div class="fc-field">
              <label class="fc-flabel">Nome</label>
              <input id="fc-name" class="fc-input" type="text" required maxlength="80" placeholder="Ex: Revisão Julho">
            </div>

            <div class="fc-field">
              <label class="fc-flabel">Cor</label>
              <div class="fc-swatches" id="fc-colors">
                ${PRESET_COLORS.map((c, i) => `<button type="button" class="fc-swatch${i === 0 ? " fc-active" : ""}" data-color="${c}" style="background:${c}"></button>`).join("")}
              </div>
              <input id="fc-color" type="hidden" value="${PRESET_COLORS[0]}">
            </div>

            <div class="fc-field">
              <label class="fc-flabel">Ícone</label>
              <div class="fc-swatches" id="fc-icons">
                ${PRESET_ICONS.map((ic, i) => `<button type="button" class="fc-icon-btn${i === 0 ? " fc-active" : ""}" data-icon="${ic}">${iconSvg(ic)}</button>`).join("")}
              </div>
              <input id="fc-icon" type="hidden" value="${PRESET_ICONS[0]}">
            </div>

            <div class="fc-field">
              <label class="fc-flabel">Fonte por mês</label>
              <div class="fc-months-row" id="fc-months-row">${monthCols}</div>
            </div>

            <div class="fc-form-actions">
              <button type="button" class="fc-btn-cancel" id="fc-cancel">Cancelar</button>
              <button type="submit" class="fc-btn-save" id="fc-save">Criar cenário</button>
            </div>
          </form>
        </div>`;

      container.querySelector("#fc-colors").addEventListener("click", e => {
        const btn = e.target.closest("[data-color]");
        if (!btn) return;
        container.querySelectorAll(".fc-swatch").forEach(s => s.classList.remove("fc-active"));
        btn.classList.add("fc-active");
        container.querySelector("#fc-color").value = btn.dataset.color;
      });

      container.querySelector("#fc-icons").addEventListener("click", e => {
        const btn = e.target.closest("[data-icon]");
        if (!btn) return;
        container.querySelectorAll(".fc-icon-btn").forEach(s => s.classList.remove("fc-active"));
        btn.classList.add("fc-active");
        container.querySelector("#fc-icon").value = btn.dataset.icon;
      });

      const goBack = () => { isCreating = false; renderGrid(container); };
      container.querySelector("#fc-back").addEventListener("click", goBack);
      container.querySelector("#fc-cancel").addEventListener("click", goBack);

      container.querySelector("#fc-form").addEventListener("submit", async e => {
        e.preventDefault();
        const name       = container.querySelector("#fc-name").value.trim();
        const color      = container.querySelector("#fc-color").value;
        const icon       = container.querySelector("#fc-icon").value;
        const saveBtn    = container.querySelector("#fc-save");

        const monthSources = {};
        container.querySelectorAll(".fc-msrc").forEach(sel => {
          monthSources[Number(sel.dataset.month)] = sel.value;
        });

        let cutoff = 0;
        for (let m = 1; m <= 12; m++) {
          if (monthSources[m] === "real") cutoff = m; else break;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = "Criando…";

        try {
          const orgId      = await resolveOrganizationId();
          const scenarioId = await createScenario({ name, color, icon, referenceYear: year, cutoffMonth: cutoff });

          for (let m = 1; m <= 12; m++) {
            const src = monthSources[m] || "real";
            saveBtn.textContent = `Copiando ${MONTH_LABELS[m - 1]}…`;
            await copyMonthData(orgId, scenarioId, year, m, src);
          }

          scenarios  = null;
          isCreating = false;
          await loadScenarios(year);
          renderGrid(container);
        } catch (err) {
          console.error("Erro ao criar cenário:", err);
          saveBtn.disabled = false;
          saveBtn.textContent = "Criar cenário";
        }
      });
    }

    function closeScenarioMenu() {
      document.querySelector(".fc-action-menu")?.remove();
    }

    function openScenarioMenu(anchor, scenario, container) {
      closeScenarioMenu();
      const pop = document.createElement("div");
      pop.className = "fc-action-menu";
      pop.innerHTML = `
        <button class="fc-action-menu-item" type="button" data-fc-action="edit">Editar</button>
        <button class="fc-action-menu-item" type="button" data-fc-action="copy">Copiar</button>
        <button class="fc-action-menu-item fc-action-menu-item--danger" type="button" data-fc-action="remove">Remover</button>
      `;
      document.body.appendChild(pop);

      const rect = anchor.getBoundingClientRect();
      pop.style.top  = `${rect.bottom + 6}px`;
      const left = Math.min(rect.left, window.innerWidth - 160);
      pop.style.left = `${left}px`;

      pop.querySelector("[data-fc-action='edit']").addEventListener("click", e => { e.stopPropagation(); closeScenarioMenu(); renderEditForm(container, scenario); });
      pop.querySelector("[data-fc-action='copy']").addEventListener("click", e => { e.stopPropagation(); closeScenarioMenu(); handleCopyScenario(container, scenario); });
      pop.querySelector("[data-fc-action='remove']").addEventListener("click", e => { e.stopPropagation(); closeScenarioMenu(); handleRemoveScenario(container, scenario); });

      setTimeout(() => {
        document.addEventListener("click", (ev) => { if (!pop.contains(ev.target)) closeScenarioMenu(); }, { once: true });
      }, 0);
    }

    function renderEditForm(container, scenario) {
      const year = scenario.reference_year;
      const activeColor = scenario.color || PRESET_COLORS[0];
      const activeIcon  = scenario.icon  || PRESET_ICONS[0];

      container.innerHTML = `
        <div class="fc-wrap fc-form-wrap">
          <div class="fc-form-header">
            <button class="fc-back-btn" id="fc-back" type="button">← Cenários</button>
            <h2 class="fc-form-title">Editar cenário · ${year}</h2>
          </div>
          <form id="fc-form" class="fc-form" autocomplete="off">
            <div class="fc-field">
              <label class="fc-flabel">Nome</label>
              <input id="fc-name" class="fc-input" type="text" required maxlength="80" value="${escapeHtml(scenario.name)}">
            </div>
            <div class="fc-field">
              <label class="fc-flabel">Cor</label>
              <div class="fc-swatches" id="fc-colors">
                ${PRESET_COLORS.map(c => `<button type="button" class="fc-swatch${c === activeColor ? " fc-active" : ""}" data-color="${c}" style="background:${c}"></button>`).join("")}
              </div>
              <input id="fc-color" type="hidden" value="${escapeHtml(activeColor)}">
            </div>
            <div class="fc-field">
              <label class="fc-flabel">Ícone</label>
              <div class="fc-swatches" id="fc-icons">
                ${PRESET_ICONS.map(ic => `<button type="button" class="fc-icon-btn${ic === activeIcon ? " fc-active" : ""}" data-icon="${ic}">${iconSvg(ic)}</button>`).join("")}
              </div>
              <input id="fc-icon" type="hidden" value="${escapeHtml(activeIcon)}">
            </div>
            <div class="fc-field">
              <label class="fc-flabel">Realizado até</label>
              <select id="fc-cutoff" class="fc-input" style="max-width:160px">
                ${MONTH_LABELS.map((l, i) => `<option value="${i + 1}"${(i + 1) === scenario.cutoff_month ? " selected" : ""}>${escapeHtml(l)}</option>`).join("")}
              </select>
              <span class="fc-fhint">Meses até este serão puxados do realizado no relatório.</span>
            </div>
            <div class="fc-form-actions">
              <button type="button" class="fc-btn-cancel" id="fc-cancel">Cancelar</button>
              <button type="submit" class="fc-btn-save" id="fc-save">Salvar alterações</button>
            </div>
          </form>
        </div>`;

      container.querySelector("#fc-colors").addEventListener("click", e => {
        const btn = e.target.closest("[data-color]");
        if (!btn) return;
        container.querySelectorAll(".fc-swatch").forEach(s => s.classList.remove("fc-active"));
        btn.classList.add("fc-active");
        container.querySelector("#fc-color").value = btn.dataset.color;
      });

      container.querySelector("#fc-icons").addEventListener("click", e => {
        const btn = e.target.closest("[data-icon]");
        if (!btn) return;
        container.querySelectorAll(".fc-icon-btn").forEach(s => s.classList.remove("fc-active"));
        btn.classList.add("fc-active");
        container.querySelector("#fc-icon").value = btn.dataset.icon;
      });

      const goBack = () => renderGrid(container);
      container.querySelector("#fc-back").addEventListener("click", goBack);
      container.querySelector("#fc-cancel").addEventListener("click", goBack);

      container.querySelector("#fc-form").addEventListener("submit", async e => {
        e.preventDefault();
        const name    = container.querySelector("#fc-name").value.trim();
        const color   = container.querySelector("#fc-color").value;
        const icon    = container.querySelector("#fc-icon").value;
        const cutoff  = Number(container.querySelector("#fc-cutoff").value);
        const saveBtn = container.querySelector("#fc-save");
        if (!name) return;
        saveBtn.disabled = true;
        saveBtn.textContent = "Salvando…";
        try {
          const orgId = await resolveOrganizationId();
          await upsertSupabaseRows("forecast_scenarios", [{
            id: scenario.id,
            organization_id: orgId,
            name,
            color,
            icon,
            reference_year: year,
            cutoff_month: cutoff,
          }], ["id"]);
          scenarios = null;
          await loadScenarios(year);
          renderGrid(container);
        } catch (err) {
          console.error("Erro ao salvar cenário:", err);
          saveBtn.disabled = false;
          saveBtn.textContent = "Salvar alterações";
        }
      });
    }

    async function handleCopyScenario(container, scenario) {
      const year = Number(state.currentPeriod?.year || 2026);
      try {
        await createScenario({
          name:          `Cópia de ${scenario.name}`,
          color:         scenario.color,
          icon:          scenario.icon,
          referenceYear: scenario.reference_year,
          cutoffMonth:   scenario.cutoff_month,
        });
        scenarios = null;
        await loadScenarios(year);
        renderGrid(container);
      } catch (err) {
        console.error("Erro ao copiar cenário:", err);
      }
    }

    function handleRemoveScenario(container, scenario) {
      document.querySelector(".vp-delete-confirm")?.remove();
      const pop = document.createElement("div");
      pop.className = "vp-delete-confirm";
      pop.innerHTML = `
        <span>Remover <strong>${escapeHtml(scenario.name)}</strong>?</span>
        <button class="vp-delete-confirm-yes" type="button">Remover</button>
        <button class="vp-delete-confirm-no" type="button">Cancelar</button>
      `;
      document.body.appendChild(pop);
      pop.querySelector(".vp-delete-confirm-yes").addEventListener("click", async () => {
        pop.remove();
        try {
          const orgId = await resolveOrganizationId();
          await deleteSupabaseRows("forecast_scenarios", `id=eq.${scenario.id}&organization_id=eq.${orgId}`);
          scenarios = null;
          const year = Number(state.currentPeriod?.year || 2026);
          await loadScenarios(year);
          renderGrid(container);
        } catch (err) {
          console.error("Erro ao remover cenário:", err);
        }
      });
      pop.querySelector(".vp-delete-confirm-no").addEventListener("click", () => pop.remove());
      setTimeout(() => {
        document.addEventListener("click", (ev) => { if (!pop.contains(ev.target)) pop.remove(); }, { once: true });
      }, 0);
    }

    function renderDetail(container, scenario) {
      if (!scenario) { selectedId = null; renderGrid(container); return; }

      container.innerHTML = `
        <div class="reports-layout">
          <div class="reports-catalog-card">
            <div class="fc-detail-header">
              <button class="fc-back-btn" id="fc-detail-back" type="button">← Cenários</button>
              <div class="fc-detail-title-row">
                <span class="fc-detail-icon" style="background:${escapeHtml(scenario.color || "#6366f1")};color:#fff">${iconSvg(scenario.icon)}</span>
                <div>
                  <h2 class="fc-detail-name">${escapeHtml(scenario.name)}</h2>
                  <span class="fc-detail-meta">Realizado até ${escapeHtml(MONTH_LABELS[(scenario.cutoff_month || 1) - 1])} · ${scenario.reference_year}</span>
                </div>
              </div>
            </div>
            <div class="reports-card-grid">
              <button class="reports-report-card fc-scenario-card" type="button" data-fc-report="dreSoc" style="border-top-color:#4f7cff">
                <div class="rrc-top"><span class="rrc-icon-wrap" style="background:rgba(79,124,255,0.12);border-color:rgba(79,124,255,0.22);color:#4f7cff"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#vp-icon-cost"></use></svg></span></div>
                <strong>DRE Societário</strong>
                <span class="rrc-subtitle">${escapeHtml(scenario.name)}</span>
              </button>
              <div class="reports-report-card reports-report-card--soon">
                <div class="rrc-top"><span class="rrc-icon-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#vp-icon-reports"></use></svg></span></div>
                <strong>Balanço Patrimonial</strong>
                <span class="rrc-subtitle">Em breve</span>
              </div>
              <div class="reports-report-card reports-report-card--soon">
                <div class="rrc-top"><span class="rrc-icon-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#vp-icon-trend-up"></use></svg></span></div>
                <strong>Fluxo de Caixa</strong>
                <span class="rrc-subtitle">Em breve</span>
              </div>
            </div>
          </div>
        </div>`;

      container.querySelector("#fc-detail-back").addEventListener("click", () => {
        selectedId = null;
        renderGrid(container);
      });

      container.querySelector('[data-fc-report="dreSoc"]')?.addEventListener("click", () => {
        if (typeof openScenarioDreReport === "function") openScenarioDreReport(scenario.id);
      });
    }

    function resetState() {
      selectedId  = null;
      isCreating  = false;
      scenarios   = null;
    }

    return { renderPlanningView, resetPlanningState: resetState };
  }

  window.VECTON_FORECAST = { createForecastModule };
})(window);
