(function attachVectonReportSections(window) {
  "use strict";

  function createReportSectionsModule(deps) {
    const {
      escapeHtml, fetchSupabaseRowsSafe, isSupabaseConfigured,
      resolveOrganizationId, getAccessRole, supabaseApiUrl, authenticatedFetch,
    } = deps;

    function isAdmin() { return ["admin", "super_admin"].includes(getAccessRole()); }

    const UNSECTIONED_ID = "__unsectioned__";

    // Usado só quando a org ainda não tem seções no Supabase (migration não rodada
    // ou modo local sem Supabase) — mantém o catálogo organizado mesmo assim.
    const FALLBACK_SECTIONS = [
      { id: "fallback-comercial", name: "Comercial" },
      { id: "fallback-dre", name: "DRE" },
      { id: "fallback-opex", name: "OPEX" },
      { id: "fallback-headcount", name: "Headcount" },
      { id: "fallback-personalizados", name: "Personalizados" },
    ];
    const FALLBACK_ITEMS = [
      { section_id: "fallback-comercial", report_id: "comercialPainel", sort_order: 0 },
      { section_id: "fallback-comercial", report_id: "comercialMapa", sort_order: 1 },
      { section_id: "fallback-comercial", report_id: "comercialBateuLevou", sort_order: 2 },
      { section_id: "fallback-comercial", report_id: "comercialFinalDeAno", sort_order: 3 },
      { section_id: "fallback-dre", report_id: "dreSocReal", sort_order: 0 },
      { section_id: "fallback-dre", report_id: "dreGerReal", sort_order: 1 },
      { section_id: "fallback-dre", report_id: "dreDfsReal", sort_order: 2 },
      { section_id: "fallback-dre", report_id: "dreSocBudget", sort_order: 3 },
      { section_id: "fallback-dre", report_id: "dreGerBudget", sort_order: 4 },
      { section_id: "fallback-dre", report_id: "dreDfsBudget", sort_order: 5 },
      { section_id: "fallback-opex", report_id: "opexReal", sort_order: 0 },
      { section_id: "fallback-opex", report_id: "opexBudget", sort_order: 1 },
      { section_id: "fallback-headcount", report_id: "headcountReal", sort_order: 0 },
      { section_id: "fallback-headcount", report_id: "headcountBudget", sort_order: 1 },
    ];

    let _sections = [];
    let _items = [];
    let _orgId = null;
    let _collapsed = {};
    let _reorderMode = false;
    let _openPopover = null;
    let _dragSrc = null; // compartilhado entre todos os grids — precisa sobreviver ao cruzar de seção

    // ── Persistência do estado colapsado (cosmético, por usuário) ──────────
    function collapsedKey() {
      return `vp_report_sections_collapsed_${_orgId || "anon"}`;
    }
    function loadCollapsed() {
      try { _collapsed = JSON.parse(localStorage.getItem(collapsedKey()) || "{}"); } catch (_) { _collapsed = {}; }
    }
    function saveCollapsed() {
      try { localStorage.setItem(collapsedKey(), JSON.stringify(_collapsed)); } catch (_) {}
    }

    // ── Data fetching ────────────────────────────────────────────────────
    async function loadSections() {
      if (!isSupabaseConfigured()) { _sections = []; _items = []; return; }
      _orgId = await resolveOrganizationId();
      if (!_orgId) { _sections = []; _items = []; return; }
      loadCollapsed();
      const [sections, items] = await Promise.all([
        fetchSupabaseRowsSafe("report_sections", `organization_id=eq.${_orgId}&order=sort_order.asc&select=id,name,sort_order`),
        fetchSupabaseRowsSafe("report_section_items", `organization_id=eq.${_orgId}&order=sort_order.asc&select=id,section_id,report_id,sort_order`),
      ]);
      _sections = sections || [];
      _items = items || [];
    }

    function activeSections() { return _sections.length ? _sections : FALLBACK_SECTIONS; }
    function activeItems() { return _sections.length ? _items : FALLBACK_ITEMS; }
    function usingFallback() { return !_sections.length; }

    // ── DOM: montagem de uma seção ──────────────────────────────────────
    function buildSectionEl(section) {
      const el = document.createElement("div");
      el.className = "reports-section";
      el.dataset.sectionId = section.id;
      el.innerHTML = `
        <button type="button" class="reports-section-header" data-section-toggle>
          <svg class="reports-section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          <span class="reports-section-title">${escapeHtml(section.name)}</span>
        </button>
        <div class="reports-card-grid reports-section-body"></div>
      `;
      const header = el.querySelector(".reports-section-header");
      header.addEventListener("click", () => {
        const open = el.classList.contains("is-collapsed");
        el.classList.toggle("is-collapsed", !open);
        if (open) delete _collapsed[section.id]; else _collapsed[section.id] = true;
        saveCollapsed();
      });
      if (_collapsed[section.id]) el.classList.add("is-collapsed");
      return el;
    }

    // ── DOM: reconstrução completa a partir de _sections/_items ─────────
    function rebuildGrid() {
      const wrap = document.querySelector("#reports-card-grid");
      if (!wrap) return;

      const cards = [...wrap.querySelectorAll(".reports-report-card[data-report-id]")];
      const cardById = new Map(cards.map((c) => [c.dataset.reportId, c]));

      wrap.innerHTML = "";

      const items = activeItems();
      const itemsBySection = new Map();
      items.forEach((item) => {
        if (!cardById.has(item.report_id)) return; // relatório referenciado não existe mais no catálogo
        if (!itemsBySection.has(item.section_id)) itemsBySection.set(item.section_id, []);
        itemsBySection.get(item.section_id).push(item);
      });

      activeSections().forEach((section) => {
        const secItems = (itemsBySection.get(section.id) || []).sort((a, b) => a.sort_order - b.sort_order);
        if (!secItems.length) return; // seção sem relatório atribuído fica escondida
        const sectionEl = buildSectionEl(section);
        const body = sectionEl.querySelector(".reports-section-body");
        secItems.forEach((item) => body.appendChild(cardById.get(item.report_id)));
        wrap.appendChild(sectionEl);
      });

      const assignedIds = new Set(items.map((i) => i.report_id));
      const orphans = cards.filter((c) => !assignedIds.has(c.dataset.reportId));
      if (orphans.length) {
        const sectionEl = buildSectionEl({ id: UNSECTIONED_ID, name: "Sem seção" });
        const body = sectionEl.querySelector(".reports-section-body");
        orphans.forEach((c) => body.appendChild(c));
        wrap.appendChild(sectionEl);
      }

      wireDragDrop(wrap);
    }

    // ── Drag & drop entre seções (admin only) ────────────────────────────
    function wireDragDrop(wrap) {
      const grids = [...wrap.querySelectorAll(".reports-card-grid")];
      grids.forEach((grid) => {
        grid.addEventListener("dragstart", (e) => {
          if (!_reorderMode) return;
          const card = e.target.closest(".reports-report-card");
          if (!card) return;
          _dragSrc = card;
          card.classList.add("rrc-dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", card.dataset.reportId);
        });

        grid.addEventListener("dragend", () => {
          wrap.querySelectorAll(".reports-report-card").forEach((c) => c.classList.remove("rrc-dragging", "rrc-drag-over"));
          wrap.querySelectorAll(".reports-card-grid").forEach((g) => g.classList.remove("rrc-drag-over-empty"));
          _dragSrc = null;
        });

        grid.addEventListener("dragover", (e) => {
          if (!_reorderMode || !_dragSrc) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const card = e.target.closest(".reports-report-card");
          grid.querySelectorAll(".reports-report-card").forEach((c) => c.classList.remove("rrc-drag-over"));
          if (card && card !== _dragSrc) { card.classList.add("rrc-drag-over"); grid.classList.remove("rrc-drag-over-empty"); }
          else if (!card) grid.classList.add("rrc-drag-over-empty");
        });

        grid.addEventListener("dragleave", (e) => {
          e.target.closest(".reports-report-card")?.classList.remove("rrc-drag-over");
          if (e.target === grid) grid.classList.remove("rrc-drag-over-empty");
        });

        grid.addEventListener("drop", async (e) => {
          if (!_reorderMode || !_dragSrc) return;
          e.preventDefault();
          grid.classList.remove("rrc-drag-over-empty");
          const target = e.target.closest(".reports-report-card");
          const srcGrid = _dragSrc.closest(".reports-card-grid");
          if (target && target !== _dragSrc) {
            const cards = [...grid.querySelectorAll(".reports-report-card")];
            if (cards.indexOf(_dragSrc) < cards.indexOf(target)) target.after(_dragSrc);
            else target.before(_dragSrc);
          } else if (!target) {
            grid.appendChild(_dragSrc);
          } else {
            return;
          }
          grid.querySelectorAll(".reports-report-card").forEach((c) => c.classList.remove("rrc-drag-over"));

          const touchedGrids = srcGrid === grid ? [grid] : [srcGrid, grid];
          await Promise.all(touchedGrids.map(persistGridOrder));
          pruneEmptySections();
        });
      });
    }

    function sectionIdOfGrid(grid) {
      return grid.closest(".reports-section")?.dataset.sectionId || null;
    }

    async function persistGridOrder(grid) {
      const sectionId = sectionIdOfGrid(grid);
      if (!sectionId || usingFallback()) return; // sem Supabase real, não há onde persistir
      const reportIds = [...grid.querySelectorAll(".reports-report-card[data-report-id]")].map((c) => c.dataset.reportId);

      if (sectionId === UNSECTIONED_ID) {
        await Promise.all(reportIds.map((reportId) =>
          authenticatedFetch(`${supabaseApiUrl}/rest/v1/report_section_items?organization_id=eq.${_orgId}&report_id=eq.${encodeURIComponent(reportId)}`, { method: "DELETE" })
        ));
        _items = _items.filter((i) => !reportIds.includes(i.report_id));
        return;
      }

      const rows = reportIds.map((reportId, idx) => ({
        organization_id: _orgId, section_id: sectionId, report_id: reportId, sort_order: idx,
      }));
      if (!rows.length) return;
      await authenticatedFetch(`${supabaseApiUrl}/rest/v1/report_section_items?on_conflict=organization_id,report_id`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
      rows.forEach((row) => {
        const existing = _items.find((i) => i.report_id === row.report_id);
        if (existing) { existing.section_id = row.section_id; existing.sort_order = row.sort_order; }
        else _items.push(row);
      });
    }

    // Some do DOM uma seção que ficou vazia depois de um drag (não reconstrói tudo,
    // só remove o wrapper — evita "seção fantasma" sem card nenhum).
    function pruneEmptySections() {
      document.querySelectorAll("#reports-card-grid .reports-section").forEach((el) => {
        const body = el.querySelector(".reports-section-body");
        if (body && !body.children.length) el.remove();
      });
    }

    // ── Modo reorganizar (liga drag em todos os cards) ──────────────────
    function setReorderMode(on, reorderBtn) {
      _reorderMode = on;
      document.querySelectorAll("#reports-card-grid .reports-report-card").forEach((c) => {
        c.draggable = on;
        c.classList.toggle("rrc-reorder-mode", on);
      });
      if (reorderBtn) {
        reorderBtn.classList.toggle("active", on);
        reorderBtn.title = on ? "Concluir reorganização" : "Reorganizar cards";
      }
    }

    // ── Popover "Gerenciar seções" ───────────────────────────────────────
    function closeManagePopover() {
      if (_openPopover) { _openPopover.remove(); _openPopover = null; }
    }

    async function refreshAfterSectionChange() {
      await loadSections();
      rebuildGrid();
    }

    function openManagePopover(anchorBtn) {
      if (_openPopover) { closeManagePopover(); return; }
      if (usingFallback()) return; // precisa da migration rodada pra ter o que gerenciar

      const pop = document.createElement("div");
      pop.className = "rsm-popover";

      function renderList() {
        const sorted = [..._sections].sort((a, b) => a.sort_order - b.sort_order);
        pop.innerHTML = `
          <strong class="rsm-title">Gerenciar seções</strong>
          <div class="rsm-list">
            ${sorted.map((s, idx) => `
              <div class="rsm-row" data-section-id="${s.id}">
                <button type="button" class="rsm-move" data-move="up" ${idx === 0 ? "disabled" : ""} title="Mover para cima">&uarr;</button>
                <button type="button" class="rsm-move" data-move="down" ${idx === sorted.length - 1 ? "disabled" : ""} title="Mover para baixo">&darr;</button>
                <input class="rsm-name" type="text" value="${escapeHtml(s.name)}" maxlength="40">
                <button type="button" class="rsm-delete" title="Excluir seção">&times;</button>
              </div>
            `).join("")}
          </div>
          <div class="rsm-new-row">
            <input class="rsm-new-name" type="text" placeholder="Nova seção">
            <button type="button" class="rsm-add primary">Adicionar</button>
          </div>
          <div class="rsm-popover-actions">
            <button type="button" class="rsm-close">Fechar</button>
          </div>
        `;
        wireList();
      }

      function wireList() {
        pop.querySelectorAll(".rsm-row").forEach((row) => {
          const sectionId = row.dataset.sectionId;
          const nameInput = row.querySelector(".rsm-name");
          nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") nameInput.blur(); });
          nameInput.addEventListener("blur", async () => {
            const newName = nameInput.value.trim();
            const current = _sections.find((s) => s.id === sectionId);
            if (!newName || newName === current?.name) return;
            await authenticatedFetch(`${supabaseApiUrl}/rest/v1/report_sections?id=eq.${sectionId}`, {
              method: "PATCH", headers: { Prefer: "return=minimal" },
              body: JSON.stringify({ name: newName }),
            });
            await refreshAfterSectionChange();
          });

          row.querySelector(".rsm-delete").addEventListener("click", async () => {
            const current = _sections.find((s) => s.id === sectionId);
            const hasItems = _items.some((i) => i.section_id === sectionId);
            const msg = hasItems
              ? `Excluir a seção "${current?.name}"? Os relatórios dela voltam para "Sem seção".`
              : `Excluir a seção "${current?.name}"?`;
            if (!window.confirm(msg)) return;
            await authenticatedFetch(`${supabaseApiUrl}/rest/v1/report_sections?id=eq.${sectionId}`, { method: "DELETE" });
            await refreshAfterSectionChange();
            renderList();
          });

          row.querySelectorAll(".rsm-move").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const sorted = [..._sections].sort((a, b) => a.sort_order - b.sort_order);
              const idx = sorted.findIndex((s) => s.id === sectionId);
              const swapIdx = btn.dataset.move === "up" ? idx - 1 : idx + 1;
              if (swapIdx < 0 || swapIdx >= sorted.length) return;
              const a = sorted[idx], b = sorted[swapIdx];
              await Promise.all([
                authenticatedFetch(`${supabaseApiUrl}/rest/v1/report_sections?id=eq.${a.id}`, {
                  method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ sort_order: b.sort_order }),
                }),
                authenticatedFetch(`${supabaseApiUrl}/rest/v1/report_sections?id=eq.${b.id}`, {
                  method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ sort_order: a.sort_order }),
                }),
              ]);
              await refreshAfterSectionChange();
              renderList();
            });
          });
        });

        pop.querySelector(".rsm-add").addEventListener("click", async () => {
          const input = pop.querySelector(".rsm-new-name");
          const name = input.value.trim();
          if (!name) return;
          const maxOrder = _sections.reduce((m, s) => Math.max(m, s.sort_order), -1);
          await authenticatedFetch(`${supabaseApiUrl}/rest/v1/report_sections`, {
            method: "POST", headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ organization_id: _orgId, name, sort_order: maxOrder + 1 }),
          });
          await refreshAfterSectionChange();
          renderList();
        });

        pop.querySelector(".rsm-close").addEventListener("click", closeManagePopover);
      }

      renderList();
      document.body.appendChild(pop);
      _openPopover = pop;
      const rect = anchorBtn.getBoundingClientRect();
      pop.style.position = "fixed";
      pop.style.top = `${rect.bottom + 8}px`;
      pop.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;

      setTimeout(() => {
        const closeOnOutsideClick = (e) => {
          if (!pop.contains(e.target) && e.target !== anchorBtn) {
            closeManagePopover();
            document.removeEventListener("click", closeOnOutsideClick, true);
          }
        };
        document.addEventListener("click", closeOnOutsideClick, true);
      }, 0);
    }

    // ── Entry point chamado depois do login/hydrate ──────────────────────
    function renderSections() {
      rebuildGrid();

      const reorderBtn = document.querySelector("#reports-reorder-btn");
      const manageBtn = document.querySelector("#reports-manage-sections-btn");

      if (reorderBtn) {
        reorderBtn.style.display = isAdmin() ? "flex" : "none";
        reorderBtn.onclick = () => setReorderMode(!_reorderMode, reorderBtn);
      }
      if (manageBtn) {
        manageBtn.style.display = isAdmin() && !usingFallback() ? "flex" : "none";
        manageBtn.onclick = () => openManagePopover(manageBtn);
      }
    }

    return { loadSections, renderSections };
  }

  window.VECTON_REPORT_SECTIONS = { createReportSectionsModule };
})(window);
