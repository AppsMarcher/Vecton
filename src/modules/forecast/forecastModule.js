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
      invalidateScenarioCachesFor,
      callSupabaseRpc,
      onDefaultScenarioChanged,
    } = deps;

    // ── local state ──────────────────────────────────────────────────────────
    let scenarios    = null;   // null = not yet loaded
    let selectedId   = null;
    let isCreating   = false;
    const planning = window.VECTON_PLANNING?.createPlanningModule(deps);
    const planningBack = container => () => {
      selectedId = null; isCreating = false; scenarios = null;
      void renderGrid(container);
    };

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
        `organization_id=eq.${orgId}&order=reference_year.desc,sort_order.asc,created_at.asc&select=id,name,color,icon,reference_year,cutoff_month,is_default,created_at`
      );
      scenarios = rows;
      if (planning && await planning.ensure()) {
        const data = await callSupabaseRpc('planning_context', { p_org: orgId });
        scenarios = data.scenarios;
      }
      return scenarios;
    }

    async function createScenario({ name, color, icon, referenceYear, cutoffMonth }) {
      const orgId = await resolveOrganizationId();
      const id = crypto.randomUUID();
      const { withYearSuffix } = window.VECTON_SCENARIO_SOURCES;
      await upsertSupabaseRows("forecast_scenarios", [{
        id,
        organization_id: orgId,
        name: withYearSuffix(name, referenceYear),
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
      if (planning?.isActive()) { planning.render(); return; }
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
      // sendo admin-only hoje. A estrela (favorito da org) também é admin-only.
      const canEdit = isAdmin();

      // Favorito = comparativo padrão da organização (DREs Real e Dashboard): uma estrela global.
      const starSvg = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" width="15" height="15"><path d="M12 2.6l2.87 5.82 6.42.93-4.65 4.53 1.1 6.4L12 17.26l-5.74 3.02 1.1-6.4-4.65-4.53 6.42-.93z"/></svg>`;
      const starBtn = (key, isFav) => `
        <span class="fc-star-btn${isFav ? " is-fav" : ""}${canEdit ? " fc-star-editable" : ""}"
          ${canEdit ? `role="button" tabindex="-1"` : ""} data-fc-star="${escapeHtml(key)}"
          title="${isFav ? "Comparativo padrão da organização" : (canEdit ? "Definir como comparativo padrão" : "")}">${starSvg}</span>`;

      // Cenário bloqueado some para quem não é Admin/Super Admin.
      const cards = (scenarios || []).filter(s => canEdit || !isScenarioLocked(s)).map(s => {
        const color = s.color || "#6366f1";
        return `
        <button class="reports-report-card fc-scenario-card" type="button"
          data-scenario-id="${escapeHtml(s.id)}"
          style="border-top-color:${escapeHtml(color)};--fc-accent:${escapeHtml(color)}">
          <div class="rrc-top">
            <span class="rrc-icon-wrap" style="background:${hexToRgba(color, 0.12)};border-color:${hexToRgba(color, 0.25)};color:${escapeHtml(color)}">
              ${iconSvg(s.icon)}
            </span>
            ${starBtn(s.id, !!s.is_default)}
            ${canEdit ? `<span class="fc-card-menu-btn" role="button" data-fc-menu="${escapeHtml(s.id)}" aria-label="Opções" tabindex="-1">${gearSvg}</span>` : ""}
          </div>
          <strong>${escapeHtml(s.name)}</strong>
          <span class="rrc-subtitle">${s.planning_version ? `Formulários · ${s.status === 'locked' ? 'Bloqueado' : 'Aberto'} · ${s.reference_year}` : `Corte: ${escapeHtml(MONTH_LABELS[(s.cutoff_month || 1) - 1])} · ${s.reference_year}`}</span>
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
              ${cards}
            </div>
          </div>
        </div>`;

      container.querySelector("#fc-new-btn")?.addEventListener("click", async () => {
        if (planning && await planning.ensure()) { await planning.startWizard(container, planningBack(container)); return; }
        isCreating = true;
        renderNewForm(container);
      });

      container.querySelector(".reports-card-grid")?.addEventListener("click", e => {
        const starEl = e.target.closest("[data-fc-star]");
        if (starEl) {
          e.stopPropagation();
          e.preventDefault();
          if (!canEdit) return;
          const key = starEl.dataset.fcStar; // id do cenário
          const isFav = (scenarios || []).some(s => s.id === key && s.is_default);
          void setDefaultScenario(isFav ? null : key, container);
          return;
        }
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
        const id = card.dataset.scenarioId;
        const targetScenario = (scenarios || []).find(s => s.id === id);
        if (targetScenario?.planning_version && planning) {
          void planning.open(container, targetScenario, planningBack(container)); return;
        }
        selectedId = id;
        renderDetail(container, (scenarios || []).find(s => s.id === selectedId));
      });
    }

    // Define o cenário favorito da org (estrela global; null = sem favorito).
    // RPC valida admin no BD.
    async function setDefaultScenario(scenarioId, container) {
      try {
        if (planning && await planning.ensure()) {
          const target = scenarioId || (scenarios || []).find(s => s.is_default)?.id;
          if (target) await planning.favorite(target, !!scenarioId);
          scenarios = null; await renderGrid(container); return;
        }
        const orgId = await resolveOrganizationId();
        const year = Number((scenarios || []).find(s => s.id === scenarioId)?.reference_year
          || state.currentPeriod?.year || 2026);
        await callSupabaseRpc("set_default_forecast_scenario", {
          target_organization_id: orgId,
          target_reference_year: year,
          target_scenario_id: scenarioId,
        });
        (scenarios || []).forEach(s => { s.is_default = s.id === scenarioId; });
        onDefaultScenarioChanged?.();
        renderGrid(container);
      } catch (err) {
        console.error("Erro ao definir comparativo padrão:", err);
      }
    }

    function renderNewForm(container) {
      const year = Number(state.currentPeriod?.year || 2026);
      const existing = (scenarios || []).filter(s => Number(s.reference_year) === year);

      function sourceOptions() {
        return [
          `<option value="real">Real</option>`,
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
          invalidateScenarioCachesFor?.(scenarioId, year);

          scenarios  = null;
          isCreating = false;
          await loadScenarios(year);
          renderGrid(container);
        } catch (err) {
          console.error("Erro ao criar cenário:", err);
          saveBtn.disabled = false;
          saveBtn.textContent = "Criar cenário";
          const duplicate = /uq_forecast_scenarios_org_name|23505|duplicate key/i.test(String(err?.message || err));
          let errEl = container.querySelector("#fc-form-error");
          if (!errEl) {
            errEl = document.createElement("p");
            errEl.id = "fc-form-error";
            errEl.className = "fc-flabel";
            errEl.style.color = "var(--red, #ef4444)";
            container.querySelector(".fc-form-actions")?.before(errEl);
          }
          errEl.textContent = duplicate
            ? "Já existe um cenário com este nome. Escolha outro nome."
            : "Não foi possível criar o cenário. Tente novamente.";
        }
      });
    }

    function closeScenarioMenu() {
      document.querySelector(".fc-action-menu")?.remove();
    }

    // Ícones do menu do cenário (traço 1.7, 15px), alinhados à direita de cada item.
    const menuSvg = inner => `<svg class="fc-action-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">${inner}</svg>`;
    const MENU_ICONS = {
      edit: menuSvg(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`),
      color: menuSvg('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.5-1.9-.3-1 .4-2.1 1.5-2.1H17a4 4 0 0 0 4-4c0-5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="16" cy="8.5" r="1"/>'),
      copy: menuSvg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
      lock: menuSvg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
      unlock: menuSvg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
      remove: menuSvg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>')
    };
    const hexToHsv = hex => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); let h = 0; if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, mx ? d / mx : 0, mx]; };
    const hsvToHex = (h, sat, v) => { const f = n => { const k = (n + h / 60) % 6; return v - v * sat * Math.max(0, Math.min(k, 4 - k, 1)); }; return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };

    // Cenário de planejamento bloqueado (status ou data de bloqueio já vencida).
    const isScenarioLocked = s => !!s.planning_version && (s.status === 'locked' || (s.lock_at && new Date(s.lock_at) <= new Date()));

    function openScenarioMenu(anchor, scenario, container) {
      closeScenarioMenu();
      const managed = !!(scenario.planning_version && planning);
      const locked = isScenarioLocked(scenario);
      const pop = document.createElement("div");
      pop.className = "fc-action-menu";
      pop.innerHTML = `
        <button class="fc-action-menu-item" type="button" data-fc-action="edit"><span>Editar</span>${MENU_ICONS.edit}</button>
        <button class="fc-action-menu-item" type="button" data-fc-action="color"><span>Cor</span>${MENU_ICONS.color}</button>
        <button class="fc-action-menu-item" type="button" data-fc-action="copy"><span>Copiar</span>${MENU_ICONS.copy}</button>
        ${managed ? `<button class="fc-action-menu-item" type="button" data-fc-action="lock"><span>${locked ? "Desbloquear" : "Bloquear"}</span>${locked ? MENU_ICONS.unlock : MENU_ICONS.lock}</button>` : ""}
        <button class="fc-action-menu-item fc-action-menu-item--danger" type="button" data-fc-action="remove"><span>Remover</span>${MENU_ICONS.remove}</button>
      `;
      document.body.appendChild(pop);

      const rect = anchor.getBoundingClientRect();
      pop.style.top  = `${rect.bottom + 6}px`;
      const left = Math.min(rect.left, window.innerWidth - 160);
      pop.style.left = `${left}px`;

      pop.querySelector("[data-fc-action='edit']").addEventListener("click", e => { e.stopPropagation(); closeScenarioMenu(); if (scenario.planning_version && planning) { void planning.open(container, scenario, planningBack(container), { manage: true }); } else { renderEditForm(container, scenario); } });
      pop.querySelector("[data-fc-action='copy']").addEventListener("click", e => { e.stopPropagation(); closeScenarioMenu(); handleCopyScenario(container, scenario); });
      pop.querySelector("[data-fc-action='remove']").addEventListener("click", e => { e.stopPropagation(); closeScenarioMenu(); handleRemoveScenario(container, scenario); });
      pop.querySelector("[data-fc-action='lock']")?.addEventListener("click", async e => {
        e.stopPropagation(); closeScenarioMenu();
        try { await planning.lock(scenario, !locked); scenarios = null; await renderGrid(container); }
        catch (err) { console.error("Erro ao bloquear cenário:", err); window.VECTON_DIALOGS?.showToast?.(err.message || "Não foi possível alterar o bloqueio", "error"); }
      });
      // Cor: troca o conteúdo do próprio menu por cores prontas + um seletor livre (multicolor), que só abre ao clicar nele.
      pop.querySelector("[data-fc-action='color']").addEventListener("click", e => {
        e.stopPropagation();
        const active = (scenario.color || "").toLowerCase();
        const applyColor = async color => {
          closeScenarioMenu();
          try {
            if (managed) await planning.setColor(scenario, color);
            else await upsertSupabaseRows("forecast_scenarios", [{ id: scenario.id, organization_id: await resolveOrganizationId(), name: scenario.name, color, icon: scenario.icon, reference_year: scenario.reference_year, cutoff_month: scenario.cutoff_month }], ["id"]);
            scenarios = null; await renderGrid(container);
          } catch (err) { console.error("Erro ao trocar a cor:", err); window.VECTON_DIALOGS?.showToast?.(err.message || "Não foi possível trocar a cor", "error"); }
        };
        pop.innerHTML = `<div class="fc-action-menu-swatches">${PRESET_COLORS.map(c => `<button type="button" class="fc-swatch${c.toLowerCase() === active ? " fc-active" : ""}" data-color="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join("")}<button type="button" class="fc-swatch fc-swatch--multi" data-fc-custom aria-label="Outra cor"></button></div><div class="fc-color-picker" hidden></div>`;
        pop.querySelectorAll("[data-color]").forEach(btn => btn.addEventListener("click", ev => { ev.stopPropagation(); void applyColor(btn.dataset.color); }));
        pop.querySelector("[data-fc-custom]").addEventListener("click", ev => {
          ev.stopPropagation();
          const box = pop.querySelector(".fc-color-picker");
          if (!box.hidden) { box.hidden = true; return; }
          let [h, sat, v] = hexToHsv(/^#[0-9a-f]{6}$/i.test(active) ? active : PRESET_COLORS[0]);
          box.innerHTML = `<label class="fc-cp-hex"><span>#</span><input type="text" maxlength="6" spellcheck="false"></label><div class="fc-cp-sv"><i></i></div><input class="fc-cp-hue" type="range" min="0" max="360" step="1"><button type="button" class="fc-cp-apply">Aplicar</button>`;
          box.hidden = false;
          const hex = box.querySelector(".fc-cp-hex input"), svEl = box.querySelector(".fc-cp-sv"), dot = svEl.firstElementChild, hue = box.querySelector(".fc-cp-hue");
          const paint = () => {
            const cur = hsvToHex(h, sat, v);
            svEl.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(h, 1, 1)})`;
            dot.style.left = `${sat * 100}%`; dot.style.top = `${(1 - v) * 100}%`; dot.style.background = cur;
            hue.value = h; hex.value = cur.slice(1).toUpperCase();
          };
          const pick = ev2 => { const r = svEl.getBoundingClientRect(); sat = Math.min(1, Math.max(0, (ev2.clientX - r.left) / r.width)); v = 1 - Math.min(1, Math.max(0, (ev2.clientY - r.top) / r.height)); paint(); };
          svEl.addEventListener("pointerdown", ev2 => { svEl.setPointerCapture(ev2.pointerId); pick(ev2); svEl.onpointermove = pick; });
          svEl.addEventListener("pointerup", () => { svEl.onpointermove = null; });
          hue.addEventListener("input", () => { h = Number(hue.value); paint(); });
          hex.addEventListener("input", () => { if (/^[0-9a-f]{6}$/i.test(hex.value)) { [h, sat, v] = hexToHsv("#" + hex.value); const keep = hex.value; paint(); hex.value = keep.toUpperCase(); } });
          hex.addEventListener("keydown", ev2 => { if (ev2.key === "Enter") box.querySelector(".fc-cp-apply").click(); });
          box.querySelector(".fc-cp-apply").addEventListener("click", ev2 => { ev2.stopPropagation(); void applyColor(hsvToHex(h, sat, v)); });
          paint();
        });
      });

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
      if (planning && await planning.ensure()) { await planning.startWizard(container, planningBack(container), scenario); return; }
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

    async function handleRemoveScenario(container, scenario) {
      const confirmed = await window.VECTON_DIALOGS.appConfirm(`Remover o cenário "${scenario.name}"? Esta ação remove seus formulários, valores e projeções.`, 'danger');
      if (!confirmed) return;
      try {
        const orgId = await resolveOrganizationId();
        if (scenario.planning_version && planning) await planning.remove(scenario);
        else await deleteSupabaseRows("forecast_scenarios", `id=eq.${scenario.id}&organization_id=eq.${orgId}`);
        invalidateScenarioCachesFor?.(scenario.id);
        scenarios = null;
        await loadScenarios(Number(state.currentPeriod?.year || 2026));
        renderGrid(container);
      } catch (err) {
        await window.VECTON_DIALOGS.appAlert(err.message || 'Não foi possível remover o cenário.', 'error');
      }
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
                <div class="rrc-top"><span class="rrc-icon-wrap" style="background:rgba(79,124,255,0.12);border-color:rgba(79,124,255,0.22);color:var(--theme-ink-blue, #4f7cff)"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#vp-icon-cost"></use></svg></span></div>
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
      planning?.reset();
      selectedId  = null;
      isCreating  = false;
      scenarios   = null;
    }

    // Antes de sair do Planejamento pela sidebar: com valores não salvos, pede confirmação e, ao confirmar, apaga o rascunho.
    async function confirmLeavePlanning() {
      if (!planning?.hasUnsaved?.()) return true;
      const ok = await window.VECTON_DIALOGS.appConfirm("Há valores não salvos no Planejamento. Sair agora descarta essas alterações.", "warn");
      if (ok) planning.discardDraft();
      return !!ok;
    }

    return { renderPlanningView, resetPlanningState: resetState, confirmLeavePlanning };
  }

  window.VECTON_FORECAST = { createForecastModule };
})(window);
