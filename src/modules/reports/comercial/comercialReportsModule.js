(function attachVectonComercialReports(window) {
  "use strict";

  function createComercialReportsModule(deps) {
    const {
      escapeHtml,
      state,
      resolveOrganizationId,
      fetchSupabaseRowsSafe,
      callSupabaseRpc,
      isSupabaseConfigured,
      getAccessRole,
      setSelectedReportId,
      renderReportsView,
      getReportTitles,
      onCatalogChanged,
    } = deps;

    const CARD_PREFIX = "comercialRelatorio_";
    const CARGOS = [
      "Gerente Comercial", "Coordenador Sul", "Coordenador Norte",
      "Coordenador Oeste", "Coordenador Pecuária", "Especialista Exportação",
      "Representante Comercial", "Vendedor",
    ];

    let definitions = [];
    let activeOverlay = null;
    let runtimeToken = 0;
    const rankingSorts = new Map();

    function isAdmin() {
      return ["admin", "super_admin"].includes(getAccessRole());
    }

    function cardId(id) { return `${CARD_PREFIX}${id}`; }
    function reportIdFromCard(id) {
      return String(id || "").startsWith(CARD_PREFIX) ? String(id).slice(CARD_PREFIX.length) : null;
    }

    function ensureStyles() {
      if (document.querySelector("#vcr-style")) return;
      const style = document.createElement("style");
      style.id = "vcr-style";
      style.textContent = `
        .vcr-create-card{min-height:132px;border-style:dashed!important;display:flex!important;align-items:center;justify-content:center;gap:8px;color:var(--blue)!important;font-weight:600}
        .vcr-card-status{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-faint)}
        .vcr-edit-btn{position:absolute;bottom:10px;right:10px;width:26px;height:26px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;color:var(--text-faint);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);cursor:pointer;z-index:2}.vcr-edit-btn svg{width:13px;height:13px;pointer-events:none}.vcr-edit-btn:hover{color:var(--text);background:rgba(255,255,255,.12)}
        .vcr-overlay{position:fixed;inset:0;z-index:9900;background:rgba(0,0,0,.64);display:flex;align-items:center;justify-content:center;padding:24px}
        .vcr-modal{width:min(1080px,96vw);max-height:94vh;overflow:hidden;background:var(--panel);border:1px solid var(--line);border-radius:18px;display:flex;flex-direction:column;box-shadow:0 30px 90px rgba(0,0,0,.58)}
        .vcr-modal-head{padding:18px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:16px}
        .vcr-modal-head h3{margin:0;font-size:18px}.vcr-close{border:0;background:none;color:var(--text-faint);font-size:22px;cursor:pointer}
        .vcr-modal-body{padding:20px 22px;overflow:auto;display:grid;gap:18px}.vcr-section{border:1px solid var(--line-soft);border-radius:14px;padding:15px;display:grid;gap:12px}
        .vcr-section h4{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-faint)}
        .vcr-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.vcr-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
        .vcr-field{display:grid;gap:6px;font-size:11px;color:var(--text-soft)}.vcr-field input,.vcr-field select,.vcr-field textarea{width:100%;border:1px solid var(--line);background:var(--panel-strong);color:var(--text);border-radius:9px;padding:9px;font:inherit}.vcr-field textarea{min-height:72px;resize:vertical}
        .vcr-checks{display:flex;flex-wrap:wrap;gap:8px}.vcr-check{display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid var(--line);border-radius:9px;font-size:11px;color:var(--text-soft)}
        .vcr-team-tools{display:flex;gap:8px;flex-wrap:wrap}.vcr-team-tools input,.vcr-team-tools select{border:1px solid var(--line);background:var(--panel-strong);color:var(--text);border-radius:8px;padding:8px}
        .vcr-team-list{max-height:190px;overflow:auto;border:1px solid var(--line-soft);border-radius:10px}.vcr-team-row{display:grid;grid-template-columns:28px 84px 1fr 180px 80px 150px;gap:8px;align-items:center;padding:8px 10px;font-size:11px;border-bottom:1px solid var(--line-soft)}.vcr-team-row:last-child{border:0}.vcr-team-row.invalid{opacity:.62}
        .vcr-modal-actions{padding:14px 22px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:9px}.vcr-feedback{margin-right:auto;color:var(--neg);font-size:12px;align-self:center}
        .vcr-report{display:grid;gap:18px}.vcr-report-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap}.vcr-report-head h1{font-size:21px;margin:3px 0}.vcr-kicker{margin:0;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-faint)}
        .vcr-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}.vcr-stat{border:1px solid var(--line);border-radius:13px;padding:13px;background:var(--panel)}.vcr-stat span{display:block;font-size:10px;color:var(--text-faint);text-transform:uppercase}.vcr-stat strong{display:block;font-size:21px;margin-top:5px}
        .vcr-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px}.vcr-table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}.vcr-table th,.vcr-table td{padding:9px 11px;border-bottom:1px solid var(--line-soft);font-size:11px;white-space:nowrap;text-align:left}.vcr-table th{color:var(--text-faint);font-size:9px;text-transform:uppercase;background:var(--panel);position:sticky;top:0}.vcr-table td.num,.vcr-table th.num{text-align:right}.vcr-pill{display:inline-flex;padding:3px 7px;border-radius:99px;background:var(--panel-hover)}.vcr-pill.ok{color:var(--pos);background:rgba(34,197,94,.1)}.vcr-pill.no{color:var(--neg);background:rgba(248,113,113,.1)}
        .vcr-table tbody tr[data-vcr-code]{cursor:pointer}.vcr-table tbody tr[data-vcr-code]:hover{background:var(--panel-hover)}.vcr-movements{width:min(1400px,97vw)}.vcr-movement-table{min-width:1180px}
        .vcr-ranking-stack{display:grid;gap:18px}.vcr-ranking-board{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--panel)}.vcr-ranking-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;border-bottom:1px solid var(--line);flex-wrap:wrap}.vcr-ranking-title{display:flex;align-items:center;gap:9px}.vcr-ranking-title h3{margin:0;font-size:13px}.vcr-ranking-title span{font-size:10px;color:var(--text-faint)}.vcr-ranking-dot{width:8px;height:8px;border-radius:50%;background:var(--blue)}.vcr-ranking-board.pecuaria .vcr-ranking-dot{background:#f59e0b}.vcr-ranking-board th[data-vcr-sort]{cursor:pointer;user-select:none}.vcr-ranking-board th[data-vcr-sort]:hover{color:var(--text-soft)}.vcr-ranking-board th[data-vcr-sort].active{color:#7aa2ff}
        .vcr-charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.vcr-chart{border:1px solid var(--line);border-radius:14px;padding:14px;background:var(--panel)}.vcr-chart h3{font-size:12px;margin:0 0 12px}.vcr-bar-row{display:grid;grid-template-columns:minmax(90px,1fr) 3fr 70px;gap:8px;align-items:center;font-size:10px;margin:7px 0}.vcr-bar-track{height:7px;background:var(--panel-hover);border-radius:99px;overflow:hidden}.vcr-bar-fill{height:100%;background:var(--blue);border-radius:99px}
        .vcr-pair{display:grid;gap:3px}.vcr-bar-fill.target{background:var(--text-faint)}.vcr-line-chart{width:100%;height:190px}.vcr-line-chart polyline{fill:none;stroke-width:2}.vcr-line-labels{display:flex;justify-content:space-between;color:var(--text-faint);font-size:9px}.vcr-legend{display:flex;gap:14px;font-size:10px;color:var(--text-soft);margin-bottom:8px}.vcr-legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px}
        .vcr-compliance{border:1px solid var(--line);border-radius:14px;padding:0 14px;background:var(--panel)}.vcr-compliance summary{cursor:pointer;padding:13px 0;font-size:11px;font-weight:600}.vcr-compliance ul{margin:0 0 14px;padding-left:18px;color:var(--text-soft);font-size:11px;display:grid;gap:5px}
        .vcr-loading,.vcr-empty{padding:50px;text-align:center;color:var(--text-faint)}
        @media(max-width:780px){.vcr-grid,.vcr-grid.two{grid-template-columns:1fr}.vcr-team-row{grid-template-columns:28px 70px 1fr}.vcr-team-row span:nth-last-child(-n+2){display:none}}
      `;
      document.head.appendChild(style);
    }

    async function loadDefinitions() {
      definitions = [];
      if (!isSupabaseConfigured()) return definitions;
      const org = await resolveOrganizationId();
      definitions = await fetchSupabaseRowsSafe(
        "comercial_report_definitions",
        `organization_id=eq.${org}&order=display_order.asc,nome.asc&select=id,slug,nome,descricao,status,report_kind,modalidade,data_inicio,data_fim,display_order,current_version`
      ) || [];
      return definitions;
    }

    function injectCatalogCards() {
      ensureStyles();
      const root = document.querySelector("#reports-card-grid");
      if (!root) return;
      root.querySelectorAll("[data-comercial-dynamic-report]").forEach((el) => el.remove());
      definitions.forEach((report) => {
        if (report.status === "draft" && !isAdmin()) return;
        const id = cardId(report.id);
        getReportTitles()[id] = report.nome;
        const card = document.createElement("button");
        card.type = "button";
        card.className = "reports-report-card";
        card.dataset.reportId = id;
        card.dataset.comercialDynamicReport = "true";
        card.innerHTML = `
          <div class="rrc-top">
            <span class="rrc-icon-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#vp-icon-target"></use></svg></span>
            <span class="vcr-card-status">${escapeHtml(report.status)}</span>
          </div>
          <strong class="rrc-label">${escapeHtml(report.nome)}</strong>
          <span class="rrc-subtitle">${escapeHtml(report.modalidade === "monthly" ? "Comercial · mensal" : "Comercial · YTD")}</span>
          ${isAdmin() ? `<span class="vcr-edit-btn" role="button" data-vcr-edit="${escapeHtml(report.id)}" aria-label="Editar" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>` : ""}
        `;
        card.addEventListener("click", (event) => {
          if (event.target.closest("[data-vcr-edit]")) return;
          setSelectedReportId(id);
          renderReportsView();
        });
        card.querySelector("[data-vcr-edit]")?.addEventListener("click", async (event) => {
          event.preventDefault(); event.stopPropagation();
          await openCreator(report);
        });
        root.appendChild(card);
      });
    }

    function mountCreateButton() {
      document.querySelectorAll("[data-vcr-create-card]").forEach((el) => el.remove());
      if (!isAdmin()) return;
      const section = [...document.querySelectorAll("#reports-card-grid .reports-section")]
        .find((el) => el.querySelector(".reports-section-title")?.textContent.trim().toLowerCase() === "comercial");
      const body = section?.querySelector(".reports-section-body");
      if (!body) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reports-report-card vcr-create-card";
      button.dataset.vcrCreateCard = "true";
      button.innerHTML = `<span style="font-size:20px">+</span><span>Criar relatório</span>`;
      button.addEventListener("click", () => openCreator(null));
      body.appendChild(button);
    }

    async function loadConfig(report) {
      if (!report) return null;
      const rows = await fetchSupabaseRowsSafe(
        "comercial_report_versions",
        `report_id=eq.${report.id}&version_number=eq.${report.current_version}&select=id,config,version_number&limit=1`
      );
      return rows?.[0]?.config || null;
    }

    function blankConfig() {
      return {
        schema_version: 1,
        origins: ["FAT"],
        cargos: ["Representante Comercial"],
        active_only: true,
        include_historical: true,
        selection_type: "general",
        selected_codes: [],
        participant_list_version: 1,
        product_types: [],
        cultures: [],
        product_type_ids: [],
        culture_ids: [],
        primary_metric: "quantity",
        complementary_metrics: [],
        evaluation: "target_reached",
        conditions: { minimum_quantity: 0, minimum_attainment_pct: 100, requires_target: true, zero_target_policy: "null" },
        ranking: { enabled: true, metric: "attainment_pct", direction: "desc", tie_breaker: "quantity" },
        award: { enabled: false, rule: "conditions_met" },
        groupings: [],
        scenario_mode: "runtime",
        charts: [],
      };
    }

    function checkGroup(name, options, selected) {
      const labels = { quantity: "Quantidade", revenue: "Faturamento" };
      return `<div class="vcr-checks">${options.map((option) => { const value = typeof option === "object" ? option.value : option; const label = typeof option === "object" ? option.label : labels[value] || value; return `<label class="vcr-check"><input type="checkbox" name="${name}" value="${escapeHtml(value)}" ${selected.includes(value) ? "checked" : ""}>${escapeHtml(label)}</label>`; }).join("")}</div>`;
    }

    async function openCreator(report) {
      ensureStyles();
      closeOverlay();
      const org = await resolveOrganizationId();
      const year = Number(state.currentPeriod?.year || 2026);
      const month = Number(state.currentPeriod?.month || 1);
      const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      const [config, centralTeam, periodRows, productTypes, cultures] = await Promise.all([
        loadConfig(report).then((value) => value || blankConfig()),
        fetchSupabaseRowsSafe("comercial_vendedores", `organization_id=eq.${org}&order=nome.asc&select=codigo,nome,cargo,situacao`),
        fetchSupabaseRowsSafe("comercial_vendedor_vigencias", `organization_id=eq.${org}&data_inicio=lte.${periodEnd}&or=(data_fim.is.null,data_fim.gte.${periodStart})&order=data_inicio.desc&select=cod_vendedor,nome,cargo,situacao,data_inicio,data_fim`),
        fetchSupabaseRowsSafe("comercial_tipos", `organization_id=eq.${org}&order=nome.asc&select=id,nome`),
        fetchSupabaseRowsSafe("comercial_culturas", `organization_id=eq.${org}&order=nome.asc&select=id,nome`),
      ]);
      const currentByCode = new Map();
      (periodRows || []).forEach((person) => { if (!currentByCode.has(person.cod_vendedor)) currentByCode.set(person.cod_vendedor, { ...person, codigo: person.cod_vendedor, vigente: true }); });
      const centralByCode = new Map((centralTeam || []).map((person) => [person.codigo, person]));
      (config.selected_codes || []).forEach((code) => {
        if (!currentByCode.has(code)) {
          const person = centralByCode.get(code) || { codigo: code, nome: `Código ${code}`, cargo: "", situacao: "historico" };
          currentByCode.set(code, { ...person, vigente: false });
        }
      });
      const team = [...currentByCode.values()].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
      const overlay = document.createElement("div");
      overlay.className = "vcr-overlay";
      overlay.innerHTML = `
        <div class="vcr-modal" role="dialog" aria-modal="true">
          <div class="vcr-modal-head"><div><p class="vcr-kicker">Criador de Relatórios Comerciais</p><h3>${report ? "Editar relatório" : "Novo relatório"}</h3></div><button class="vcr-close" type="button">×</button></div>
          <div class="vcr-modal-body">
            <section class="vcr-section"><h4>Identificação</h4><div class="vcr-grid">
              <label class="vcr-field">Nome<input id="vcr-name" value="${escapeHtml(report?.nome || "")}" maxlength="80"></label>
              <label class="vcr-field">Status<select id="vcr-status"><option value="draft" ${report?.status === "draft" || !report ? "selected" : ""}>Rascunho</option><option value="active" ${report?.status === "active" ? "selected" : ""}>Ativo</option><option value="closed" ${report?.status === "closed" ? "selected" : ""}>Encerrado</option></select></label>
              <label class="vcr-field">Modalidade<select id="vcr-mode"><option value="monthly" ${report?.modalidade === "monthly" || !report ? "selected" : ""}>Mensal não cumulativa</option><option value="annual_ytd" ${report?.modalidade === "annual_ytd" ? "selected" : ""}>Anual cumulativa YTD</option></select></label>
              <label class="vcr-field">Data inicial<input id="vcr-start" type="date" value="${escapeHtml(report?.data_inicio || "")}"></label>
              <label class="vcr-field">Data final<input id="vcr-end" type="date" value="${escapeHtml(report?.data_fim || "")}"></label>
              <label class="vcr-field">Ordem do card<input id="vcr-order" type="number" min="0" value="${Number(report?.display_order || 0)}"></label>
            </div><label class="vcr-field">Descrição<textarea id="vcr-description">${escapeHtml(report?.descricao || "")}</textarea></label></section>

            <section class="vcr-section"><h4>Participantes</h4>${checkGroup("vcr-cargo", CARGOS, config.cargos || [])}
              <div class="vcr-team-tools"><input id="vcr-team-search" placeholder="Pesquisar nome ou código"><select id="vcr-team-cargo"><option value="">Todos os cargos</option>${CARGOS.map((c) => `<option>${escapeHtml(c)}</option>`).join("")}</select><select id="vcr-team-status"><option value="">Todos os status</option><option value="ativo">Ativo</option><option value="historico">Histórico</option></select><button type="button" class="ghost-button" id="vcr-team-select-all">Selecionar todos</button><button type="button" class="ghost-button" id="vcr-team-all">Selecionar filtrados</button><button type="button" class="ghost-button" id="vcr-team-none">Desmarcar todos</button></div>
              <div class="vcr-team-list">${(team || []).map((person) => `<label class="vcr-team-row ${person.vigente === false ? "invalid" : ""}" data-name="${escapeHtml(`${person.codigo} ${person.nome}`.toLowerCase())}" data-cargo="${escapeHtml(person.cargo || "")}" data-status="${escapeHtml(person.situacao || "")}"><input type="checkbox" name="vcr-person" value="${escapeHtml(person.codigo)}" ${(config.selected_codes || []).includes(person.codigo) ? "checked" : ""}><strong>${escapeHtml(person.codigo)}</strong><span>${escapeHtml(person.nome)}</span><span>${escapeHtml(person.cargo || "—")}</span><span>${escapeHtml(person.situacao)}</span><span>${person.vigente === false ? "Fora da vigência" : `${escapeHtml(person.data_inicio || "")} — ${escapeHtml(person.data_fim || "aberta")}`}</span></label>`).join("")}</div>
              <label class="vcr-check"><input type="checkbox" id="vcr-active" ${config.active_only !== false ? "checked" : ""}>Somente situação ativa na data do movimento</label>
              <label class="vcr-check"><input type="checkbox" id="vcr-historical" ${config.include_historical !== false ? "checked" : ""}>Incluir integrantes históricos quando vigentes no período</label>
            </section>

            <section class="vcr-section"><h4>Dados e segmentação</h4><div><span class="vcr-kicker">Origem</span>${checkGroup("vcr-origin", ["FAT", "CART"], config.origins || [])}</div><div><span class="vcr-kicker">Produtos</span>${checkGroup("vcr-product", (productTypes || []).map((item) => ({ value: item.id, label: item.nome })), config.product_type_ids || [])}</div><div><span class="vcr-kicker">Culturas</span>${checkGroup("vcr-culture", (cultures || []).map((item) => ({ value: item.id, label: item.nome })), config.culture_ids || [])}</div><label class="vcr-check"><input type="checkbox" id="vcr-group-culture" ${(config.groupings || []).includes("culture") ? "checked" : ""}>Separar resultado por cultura</label></section>

            <section class="vcr-section"><h4>Métricas e avaliação</h4><div class="vcr-grid">
              <label class="vcr-field">Métrica principal<select id="vcr-primary"><option value="quantity" ${config.primary_metric === "quantity" ? "selected" : ""}>Quantidade</option><option value="revenue" ${config.primary_metric === "revenue" ? "selected" : ""}>Faturamento</option></select></label>
              <label class="vcr-field">Critério<select id="vcr-evaluation"><option value="target_reached" ${config.evaluation === "target_reached" ? "selected" : ""}>Atingiu a meta</option><option value="highest_attainment" ${config.evaluation === "highest_attainment" ? "selected" : ""}>Maior atingimento</option><option value="highest_overachievement" ${config.evaluation === "highest_overachievement" ? "selected" : ""}>Maior superação</option><option value="rank_quantity" ${config.evaluation === "rank_quantity" ? "selected" : ""}>Ranking por quantidade</option><option value="rank_revenue" ${config.evaluation === "rank_revenue" ? "selected" : ""}>Ranking por faturamento</option></select></label>
              <label class="vcr-field">Quantidade mínima<input id="vcr-min-qtd" type="number" step="0.01" value="${Number(config.conditions?.minimum_quantity || 0)}"></label>
              <label class="vcr-field">Atingimento mínimo (%)<input id="vcr-min-pct" type="number" step="0.01" value="${Number(config.conditions?.minimum_attainment_pct || 0)}"></label>
              <label class="vcr-check"><input type="checkbox" id="vcr-requires-target" ${config.conditions?.requires_target ? "checked" : ""}>Exigir meta válida</label>
              <label class="vcr-check"><input type="checkbox" id="vcr-ranking" ${config.ranking?.enabled !== false ? "checked" : ""}>Exibir ranking</label>
              <label class="vcr-check"><input type="checkbox" id="vcr-award" ${config.award?.enabled ? "checked" : ""}>Exibir premiação</label>
            </div><div><span class="vcr-kicker">Métricas complementares</span>${checkGroup("vcr-complement", ["quantity", "revenue"], config.complementary_metrics || [])}</div></section>

            <section class="vcr-section"><h4>Visualizações</h4>${checkGroup("vcr-chart", ["ranking_bar", "target_vs_actual", "time_line", "product_distribution", "culture_distribution", "eligibility"], (config.charts || []).map((c) => c.type))}<label class="vcr-field" style="max-width:180px">Top N<input id="vcr-chart-top" type="number" min="1" max="50" value="${Number(config.charts?.[0]?.top_n || 10)}"></label><p style="margin:0;color:var(--text-faint);font-size:11px">Nenhum gráfico é habilitado automaticamente.</p></section>
          </div>
          <div class="vcr-modal-actions"><span class="vcr-feedback"></span>${report ? `<button type="button" class="ghost-button vcr-duplicate">Duplicar</button>` : ""}${report?.status === "draft" ? `<button type="button" class="delete-button vcr-delete">Excluir rascunho</button>` : ""}<button type="button" class="ghost-button vcr-cancel">Cancelar</button><button type="button" class="primary-button vcr-save">Salvar nova versão</button></div>
        </div>`;
      document.body.appendChild(overlay);
      activeOverlay = overlay;
      overlay.querySelector(".vcr-close").addEventListener("click", closeOverlay);
      overlay.querySelector(".vcr-cancel").addEventListener("click", closeOverlay);
      overlay.addEventListener("click", (event) => { if (event.target === overlay) closeOverlay(); });
      bindTeamFilters(overlay);
      overlay.querySelector(".vcr-save").addEventListener("click", () => saveCreator(overlay, report, config, org));
      overlay.querySelector(".vcr-duplicate")?.addEventListener("click", () => duplicateReport(report, config, org, overlay));
      overlay.querySelector(".vcr-delete")?.addEventListener("click", () => deleteDraft(report, overlay));
    }

    function closeOverlay() {
      activeOverlay?.remove();
      activeOverlay = null;
    }

    function bindTeamFilters(overlay) {
      const paint = () => {
        const term = overlay.querySelector("#vcr-team-search").value.trim().toLowerCase();
        const cargo = overlay.querySelector("#vcr-team-cargo").value;
        const status = overlay.querySelector("#vcr-team-status").value;
        overlay.querySelectorAll(".vcr-team-row").forEach((row) => {
          row.hidden = Boolean((term && !row.dataset.name.includes(term)) || (cargo && row.dataset.cargo !== cargo) || (status && row.dataset.status !== status));
        });
      };
      overlay.querySelector("#vcr-team-search").addEventListener("input", paint);
      overlay.querySelector("#vcr-team-cargo").addEventListener("change", paint);
      overlay.querySelector("#vcr-team-status").addEventListener("change", paint);
      overlay.querySelector("#vcr-team-select-all").addEventListener("click", () => overlay.querySelectorAll('.vcr-team-row input').forEach((input) => { input.checked = true; }));
      overlay.querySelector("#vcr-team-all").addEventListener("click", () => overlay.querySelectorAll(".vcr-team-row:not([hidden]) input").forEach((input) => { input.checked = true; }));
      overlay.querySelector("#vcr-team-none").addEventListener("click", () => overlay.querySelectorAll('[name="vcr-person"]').forEach((input) => { input.checked = false; }));
    }

    function checkedValues(overlay, name) {
      return [...overlay.querySelectorAll(`[name="${name}"]:checked`)].map((input) => input.value);
    }

    async function refreshCatalog() {
      await loadDefinitions();
      injectCatalogCards();
      await onCatalogChanged?.();
    }

    async function duplicateReport(report, config, org, overlay) {
      const feedback = overlay.querySelector(".vcr-feedback");
      feedback.textContent = "Duplicando...";
      try {
        await callSupabaseRpc("comercial_report_save", {
          p_report_id: null,
          p_definition: {
            organization_id: org,
            slug: `custom-${crypto.randomUUID()}`,
            nome: `${report.nome} (cópia)`,
            descricao: report.descricao || "",
            status: "draft",
            report_kind: "custom",
            modalidade: report.modalidade,
            data_inicio: report.data_inicio || null,
            data_fim: report.data_fim || null,
            display_order: Number(report.display_order || 0) + 1,
          },
          p_config: { ...config, selected_codes: [...(config.selected_codes || [])] },
          p_change_reason: `Duplicado de ${report.nome}`,
        });
        closeOverlay();
        await refreshCatalog();
      } catch (error) {
        feedback.textContent = String(error?.message || "Erro ao duplicar.");
      }
    }

    async function deleteDraft(report, overlay) {
      if (!window.confirm(`Excluir o rascunho "${report.nome}"?`)) return;
      const feedback = overlay.querySelector(".vcr-feedback");
      feedback.textContent = "Excluindo...";
      try {
        await callSupabaseRpc("comercial_report_delete_draft", { p_report_id: report.id });
        closeOverlay();
        await refreshCatalog();
      } catch (error) {
        feedback.textContent = String(error?.message || "Erro ao excluir.");
      }
    }

    async function saveCreator(overlay, report, previousConfig, org) {
      const feedback = overlay.querySelector(".vcr-feedback");
      const save = overlay.querySelector(".vcr-save");
      const nome = overlay.querySelector("#vcr-name").value.trim();
      const cargos = checkedValues(overlay, "vcr-cargo");
      const origins = checkedValues(overlay, "vcr-origin");
      if (!nome || !cargos.length || !origins.length) {
        feedback.textContent = "Preencha o nome e selecione pelo menos um cargo e uma origem.";
        return;
      }
      const selectedCodes = checkedValues(overlay, "vcr-person");
      const primary = overlay.querySelector("#vcr-primary").value;
      const evaluation = overlay.querySelector("#vcr-evaluation").value;
      const charts = checkedValues(overlay, "vcr-chart").map((type) => ({
        type,
        metric: type === "target_vs_actual" ? primary : evaluation === "highest_overachievement" ? "overachievement_pct" : primary,
        grouping: type === "time_line" ? "month" : "seller",
        ordering: "desc",
        top_n: Number(overlay.querySelector("#vcr-chart-top").value || 10),
        series: type === "time_line" ? "ytd" : "absolute",
      }));
      const config = {
        ...previousConfig,
        schema_version: 1,
        origins,
        cargos,
        active_only: overlay.querySelector("#vcr-active").checked,
        include_historical: overlay.querySelector("#vcr-historical").checked,
        selection_type: selectedCodes.length === 0 ? "general" : selectedCodes.length === 1 ? "individual" : "partial",
        selected_codes: selectedCodes,
        participant_list_version: Number(previousConfig.participant_list_version || 0) + 1,
        product_type_ids: checkedValues(overlay, "vcr-product"),
        culture_ids: checkedValues(overlay, "vcr-culture"),
        product_types: [],
        cultures: [],
        primary_metric: primary,
        complementary_metrics: checkedValues(overlay, "vcr-complement").filter((metric) => metric !== primary),
        evaluation,
        conditions: {
          ...previousConfig.conditions,
          minimum_quantity: Number(overlay.querySelector("#vcr-min-qtd").value || 0),
          minimum_attainment_pct: Number(overlay.querySelector("#vcr-min-pct").value || 0),
          requires_target: overlay.querySelector("#vcr-requires-target").checked,
          zero_target_policy: overlay.querySelector("#vcr-requires-target").checked ? "null" : "real_is_100",
        },
        ranking: { enabled: overlay.querySelector("#vcr-ranking").checked, metric: evaluation, direction: "desc", tie_breaker: primary },
        award: { ...previousConfig.award, enabled: overlay.querySelector("#vcr-award").checked, rule: previousConfig.award?.rule || "conditions_met" },
        groupings: overlay.querySelector("#vcr-group-culture").checked ? ["culture"] : [],
        scenario_mode: "runtime",
        charts,
      };
      const definition = {
        organization_id: org,
        slug: report?.slug || `custom-${crypto.randomUUID()}`,
        nome,
        descricao: overlay.querySelector("#vcr-description").value.trim(),
        status: overlay.querySelector("#vcr-status").value,
        report_kind: report?.report_kind || "custom",
        modalidade: overlay.querySelector("#vcr-mode").value,
        data_inicio: overlay.querySelector("#vcr-start").value || null,
        data_fim: overlay.querySelector("#vcr-end").value || null,
        display_order: Number(overlay.querySelector("#vcr-order").value || 0),
      };
      save.disabled = true; save.textContent = "Salvando..."; feedback.textContent = "";
      try {
        await callSupabaseRpc("comercial_report_save", {
          p_report_id: report?.id || null,
          p_definition: definition,
          p_config: config,
          p_change_reason: report ? "Edição pelo Criador de Relatórios" : "Criação pelo Criador de Relatórios",
        });
        closeOverlay();
        await refreshCatalog();
      } catch (error) {
        console.error(error);
        feedback.textContent = String(error?.message || "Erro ao salvar o relatório.");
        save.disabled = false; save.textContent = "Salvar nova versão";
      }
    }

    function formatValue(value, column) {
      if (value === null || value === undefined || value === "") return "—";
      if (column.type === "currency") return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      if (column.type === "percentage") return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
      if (column.type === "number" || column.type === "integer") return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
      if (column.type === "boolean") return value ? "Sim" : "Não";
      return String(value);
    }

    function tableRowsHtml(columns, rows) {
      return rows.map((row) => `<tr data-vcr-code="${escapeHtml(row.cod_vendedor || "")}">${columns.map((column) => {
        const value = row[column.key];
        const numeric = ["currency", "percentage", "number", "integer"].includes(column.type);
        const pill = ["boolean", "status"].includes(column.type);
        return `<td class="${numeric ? "num" : ""}">${pill ? `<span class="vcr-pill ${value === true || value === "Vencedor" || value === "Atingiu" ? "ok" : value === false || value === "Inelegível" || value === "Não atingiu" ? "no" : ""}">${escapeHtml(formatValue(value, column))}</span>` : escapeHtml(formatValue(value, column))}</td>`;
      }).join("")}</tr>`).join("");
    }

    function tableMarkup(columns, rows, options = {}) {
      const body = rows.length
        ? tableRowsHtml(columns, rows)
        : `<tr><td colspan="${columns.length}" class="vcr-empty">${escapeHtml(options.empty || "Sem resultados para o período.")}</td></tr>`;
      return `<div class="vcr-table-wrap"${options.embedded ? ' style="border:0;border-radius:0"' : ""}><table class="vcr-table"><thead><tr>${columns.map((column) => {
        const active = options.sortState?.key === column.key;
        const arrow = active ? (options.sortState.dir === 1 ? " ↑" : " ↓") : "";
        return `<th class="${["currency", "percentage", "number", "integer"].includes(column.type) ? "num " : ""}${active ? "active" : ""}"${options.sortable ? ` data-vcr-sort="${escapeHtml(column.key)}"` : ""}>${escapeHtml(column.label)}${arrow}</th>`;
      }).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    function sortRankingRows(rows, columns, sortState) {
      if (!sortState?.key) return rows;
      const column = columns.find((item) => item.key === sortState.key);
      const numeric = ["currency", "percentage", "number", "integer", "boolean"].includes(column?.type);
      return rows.slice().sort((a, b) => {
        const av = a[sortState.key];
        const bv = b[sortState.key];
        if (numeric) return sortState.dir * ((Number(av) || 0) - (Number(bv) || 0));
        return sortState.dir * String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR", { numeric: true });
      });
    }

    function renderBateuRankings(columns, rows, reportId) {
      const rankColumns = columns.filter((column) => column.key !== "segment");
      const definitionsBySegment = [
        { key: "graos", title: "Grãos", className: "graos", matches: (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().startsWith("gra") },
        { key: "pecuaria", title: "Pecuária", className: "pecuaria", matches: (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().startsWith("pec") },
      ];
      return `<div class="vcr-ranking-stack">${definitionsBySegment.map((segment) => {
        const sortKey = `${reportId}:${segment.key}`;
        const sortState = rankingSorts.get(sortKey) || null;
        const segmentRows = sortRankingRows(rows.filter((row) => segment.matches(row.segment)), rankColumns, sortState);
        return `<section class="vcr-ranking-board ${segment.className}" data-vcr-ranking-board data-sort-key="${escapeHtml(sortKey)}">
          <header class="vcr-ranking-head"><div class="vcr-ranking-title"><i class="vcr-ranking-dot"></i><h3>Ranking ${escapeHtml(segment.title)}</h3><span>${segmentRows.length} integrante(s)</span></div></header>
          ${tableMarkup(rankColumns, segmentRows, { embedded: true, sortable: true, sortState, empty: `Sem integrantes no ranking de ${segment.title}.` })}
        </section>`;
      }).join("")}</div>`;
    }

    function bindRankingSorts(container, payload, scenarios, scenarioId) {
      container.querySelectorAll("[data-vcr-ranking-board] th[data-vcr-sort]").forEach((header) => {
        header.addEventListener("click", () => {
          const board = header.closest("[data-vcr-ranking-board]");
          const stateKey = board.dataset.sortKey;
          const columnKey = header.dataset.vcrSort;
          const current = rankingSorts.get(stateKey);
          rankingSorts.set(stateKey, current?.key === columnKey
            ? { key: columnKey, dir: current.dir * -1 }
            : { key: columnKey, dir: 1 });
          renderPayload(container, payload, scenarios, scenarioId);
        });
      });
    }

    function safeFileName(value) {
      return String(value || "relatorio-comercial")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "")
        .toLowerCase();
    }

    function exportWorkbook(payload) {
      if (!window.XLSX) throw new Error("Gerador de planilha não carregado.");
      const columns = (payload.columns || []).filter((column) => column.visible !== false).sort((a, b) => a.order - b.order);
      const reportRows = (payload.rows || []).map((row) => Object.fromEntries(columns.map((column) => [column.label, row[column.key] ?? ""])));
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(reportRows), "Resultado");
      if ((payload.charts || []).length) {
        const chartRows = (payload.charts || []).flatMap((chart) => (chart.data || []).slice(0, chart.type === "time_line" ? undefined : Number(chart.top_n || 10)).map((row) => ({
          Grafico: chart.type,
          Metrica: chart.metric,
          Agrupamento: chart.grouping,
          Codigo: row.cod_vendedor,
          Nome: row.nome,
          Categoria: row.label || "",
          Segmento: row.segment || "",
          Valor: row[chart.metric] ?? row.realized ?? "",
        })));
        window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(chartRows), "Dados dos Graficos");
      }
      const complianceRows = [
        ["Relatorio", payload.report?.name || ""],
        ["Versao", payload.report?.version || ""],
        ["Periodo", `${payload.period?.effective_start || ""} a ${payload.period?.effective_end || ""}`],
        ...((payload.compliance?.rules || []).map((rule, index) => [`Regra ${index + 1}`, rule])),
      ];
      window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.aoa_to_sheet(complianceRows), "Compliance");
      window.XLSX.writeFile(workbook, `${safeFileName(payload.report?.name)}-${payload.period?.year}-${String(payload.period?.month || "").padStart(2, "0")}.xlsx`);
    }

    function printPayload(payload) {
      const columns = (payload.columns || []).filter((column) => column.visible !== false).sort((a, b) => a.order - b.order);
      const rows = payload.rows || [];
      const summaryHtml = (payload.summary || []).map((item) => `<div class="stat"><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(formatValue(item.value, { type: item.key?.includes("total") && payload.config?.primary_metric === "revenue" ? "currency" : "number" }))}</strong></div>`).join("");
      const tableHtml = `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(formatValue(row[column.key], column))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      const chartsHtml = (payload.charts || []).map((chart) => {
        const chartRows = (chart.data || rows).slice(0, chart.type === "time_line" ? undefined : Number(chart.top_n || 10));
        const metric = chart.metric === "quantity" ? "quantity" : chart.metric === "revenue" ? "revenue" : chart.metric || "realized";
        const max = Math.max(1, ...chartRows.map((row) => Math.abs(Number(row[metric] ?? row.realized) || 0)));
        return `<section class="chart"><h2>${escapeHtml(String(chart.type || "grafico").replaceAll("_", " "))}</h2>${chartRows.slice(0, 12).map((row) => { const value = Number(row[metric] ?? row.realized) || 0; return `<div class="bar"><span>${escapeHtml(row.nome || row.label || row.cod_vendedor)}</span><i><b style="width:${Math.min(100, Math.abs(value) / max * 100)}%"></b></i><strong>${escapeHtml(value.toLocaleString("pt-BR", { maximumFractionDigits: 1 }))}</strong></div>`; }).join("")}</section>`;
      }).join("");
      const complianceHtml = (payload.compliance?.rules || []).map((rule) => `<li>${escapeHtml(rule)}</li>`).join("");
      const popup = window.open("", "_blank");
      if (!popup) throw new Error("O navegador bloqueou a janela de impressão.");
      popup.opener = null;
      popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(payload.report?.name || "Relatório")}</title><style>@page{size:landscape;margin:12mm}body{font:12px Arial;color:#172033}h1{margin:0 0 4px}.period{color:#667085}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:18px 0}.stat{border:1px solid #d8dee9;border-radius:8px;padding:9px}.stat small,.stat strong{display:block}.stat strong{font-size:17px;margin-top:4px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #d8dee9;padding:6px;text-align:left;font-size:9px}.chart{break-inside:avoid;margin:18px 0}.chart h2{font-size:13px;text-transform:capitalize}.bar{display:grid;grid-template-columns:180px 1fr 80px;gap:8px;margin:5px 0;align-items:center}.bar i{height:7px;background:#e7ebf2}.bar b{display:block;height:100%;background:#3267e3}footer{break-before:auto;margin-top:20px;border-top:1px solid #d8dee9}li{margin:4px 0}</style></head><body><h1>${escapeHtml(payload.report?.name || "Relatório")}</h1><div class="period">${escapeHtml(payload.period?.effective_start || "")} — ${escapeHtml(payload.period?.effective_end || "")} · versão ${Number(payload.report?.version || 0)}</div><div class="summary">${summaryHtml}</div>${tableHtml}${chartsHtml}<footer><h2>Critérios e regras aplicadas</h2><ul>${complianceHtml}</ul></footer><script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));<\/script></body></html>`);
      popup.document.close();
    }

    function renderPayload(container, payload, scenarios, scenarioId) {
      const columns = (payload.columns || []).filter((column) => column.visible !== false).sort((a, b) => a.order - b.order);
      const summary = payload.summary || [];
      const rows = payload.rows || [];
      const isBateuLevou = payload.report?.kind === "bateu_levou";
      const scenarioOptions = `<option value="" ${!scenarioId ? "selected" : ""}>Budget</option>` + scenarios.map((scenario) => `<option value="${escapeHtml(scenario.id)}" ${scenario.id === scenarioId ? "selected" : ""}>${escapeHtml(scenario.name)}</option>`).join("");
      container.innerHTML = `<div class="vcr-report">
        <header class="vcr-report-head"><div><p class="vcr-kicker">Comercial · configuração v${Number(payload.report?.version || 0)}</p><h1>${escapeHtml(payload.report?.name || "Relatório")}</h1><span style="color:var(--text-faint);font-size:11px">${escapeHtml(payload.period?.effective_start || "")} — ${escapeHtml(payload.period?.effective_end || "")}</span></div><div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap"><label class="vcr-field" style="min-width:190px">Cenário<select id="vcr-runtime-scenario">${scenarioOptions}</select></label>${isAdmin() ? '<button type="button" class="ghost-button" id="vcr-officialize">Oficializar</button>' : ""}<button type="button" class="ghost-button" id="vcr-export-xlsx">Planilha</button><button type="button" class="ghost-button" id="vcr-export-pdf">PDF / Imprimir</button></div></header>
        <div class="vcr-summary">${summary.map((item) => `<div class="vcr-stat"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(formatValue(item.value, { type: item.key?.includes("total") && payload.config?.primary_metric === "revenue" ? "currency" : "number" }))}</strong></div>`).join("")}</div>
        ${isBateuLevou ? renderBateuRankings(columns, rows, payload.report.id) : tableMarkup(columns, rows)}
        ${renderCharts(payload.charts || [], rows)}
        <details class="vcr-compliance" open><summary>Critérios e regras aplicadas · versão ${Number(payload.report?.version || 0)}</summary><ul>${(payload.compliance?.rules || []).map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul></details>
      </div>`;
      container.querySelector("#vcr-runtime-scenario")?.addEventListener("change", (event) => loadAndRenderRuntime(container, payload.report.id, event.target.value || null));
      if (isBateuLevou) bindRankingSorts(container, payload, scenarios, scenarioId);
      container.querySelector("#vcr-officialize")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true; button.textContent = "Oficializando...";
        try {
          await callSupabaseRpc("comercial_report_execute", {
            p_report_id: payload.report.id,
            p_year: Number(payload.period?.year),
            p_month: Number(payload.period?.month),
            p_scenario_id: scenarioId,
            p_persist: true,
          });
          button.textContent = "Oficializado";
        } catch (error) {
          button.disabled = false; button.textContent = "Oficializar";
          window.alert(String(error?.message || error));
        }
      });
      container.querySelector("#vcr-export-xlsx")?.addEventListener("click", () => { try { exportWorkbook(payload); } catch (error) { window.alert(String(error?.message || error)); } });
      container.querySelector("#vcr-export-pdf")?.addEventListener("click", () => { try { printPayload(payload); } catch (error) { window.alert(String(error?.message || error)); } });
      container.querySelectorAll("tr[data-vcr-code]").forEach((row) => row.addEventListener("click", () => openMovements(payload.report.id, row.dataset.vcrCode, scenarioId, payload.report.name)));
    }

    async function openMovements(reportId, codVendedor, scenarioId, reportName) {
      closeOverlay();
      const overlay = document.createElement("div");
      overlay.className = "vcr-overlay";
      overlay.innerHTML = `<div class="vcr-modal vcr-movements"><div class="vcr-modal-head"><div><p class="vcr-kicker">Detalhamento dos movimentos</p><h3>${escapeHtml(reportName)} · ${escapeHtml(codVendedor)}</h3></div><button class="vcr-close" type="button">×</button></div><div class="vcr-modal-body"><div class="vcr-loading">Carregando movimentos...</div></div></div>`;
      document.body.appendChild(overlay);
      activeOverlay = overlay;
      overlay.querySelector(".vcr-close").addEventListener("click", closeOverlay);
      overlay.addEventListener("click", (event) => { if (event.target === overlay) closeOverlay(); });
      try {
        const movements = await callSupabaseRpc("comercial_report_movements", {
          p_report_id: reportId,
          p_year: Number(state.currentPeriod?.year || 2026),
          p_month: Number(state.currentPeriod?.month || 1),
          p_scenario_id: scenarioId,
          p_cod_vendedor: codVendedor,
        });
        if (activeOverlay !== overlay) return;
        const columns = [
          ["data", "Data"], ["origem", "Origem"], ["tipo_movimento", "Movimento"],
          ["nome", "Nome"], ["cargo", "Cargo"], ["cod_cliente", "Cód. cliente"],
          ["cliente", "Cliente"], ["cod_produto", "Cód. produto"], ["produto", "Produto"],
          ["grupo_produto", "Grupo"], ["cultura", "Cultura"], ["quantidade", "Quantidade"],
          ["faturamento", "Faturamento"], ["margem_percentual", "% MB"],
          ["territorio", "Território"], ["regional", "Regional"],
          ["movimento_considerado", "Considerado"], ["motivo_exclusao", "Motivo da exclusão"],
        ];
        const body = (movements || []).map((movement) => `<tr>${columns.map(([key]) => {
          let value = movement[key];
          if (key === "faturamento") value = Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          else if (key === "margem_percentual" && value !== null) value = `${(Number(value) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
          else if (typeof value === "boolean") value = value ? "Sim" : "Não";
          return `<td>${escapeHtml(value ?? "—")}</td>`;
        }).join("")}</tr>`).join("");
        overlay.querySelector(".vcr-modal-body").innerHTML = `<div class="vcr-table-wrap"><table class="vcr-table vcr-movement-table"><thead><tr>${columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}" class="vcr-empty">Nenhum movimento encontrado.</td></tr>`}</tbody></table></div>`;
      } catch (error) {
        if (activeOverlay === overlay) overlay.querySelector(".vcr-modal-body").innerHTML = `<div class="vcr-empty">Erro ao carregar movimentos: ${escapeHtml(String(error?.message || error))}</div>`;
      }
    }

    function renderCharts(charts, rows) {
      if (!charts.length || !rows.length) return "";
      return `<div class="vcr-charts">${charts.map((chart) => {
        const data = chart.data || rows;
        if (chart.type === "time_line") {
          const values = data.flatMap((row) => [Number(row.realized) || 0, Number(row.target) || 0]);
          const max = Math.max(1, ...values.map(Math.abs));
          const points = (key) => data.map((row, index) => `${data.length === 1 ? 50 : index / (data.length - 1) * 100},${95 - (Number(row[key]) || 0) / max * 85}`).join(" ");
          return `<section class="vcr-chart"><h3>Evolução temporal</h3><div class="vcr-legend"><span><i style="background:var(--blue)"></i>Realizado</span><span><i style="background:var(--text-faint)"></i>Meta</span></div><svg class="vcr-line-chart" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${points("target")}" stroke="var(--text-faint)"></polyline><polyline points="${points("realized")}" stroke="var(--blue)"></polyline></svg><div class="vcr-line-labels">${data.map((row) => `<span>${escapeHtml(row.label || row.month || "")}</span>`).join("")}</div></section>`;
        }
        if (chart.type === "target_vs_actual") {
          const max = Math.max(1, ...data.flatMap((row) => [Math.abs(Number(row.realized) || 0), Math.abs(Number(row.target) || 0)]));
          return `<section class="vcr-chart"><h3>Meta versus realizado</h3><div class="vcr-legend"><span><i style="background:var(--blue)"></i>Realizado</span><span><i style="background:var(--text-faint)"></i>Meta</span></div>${data.slice(0, Number(chart.top_n || 10)).map((row) => `<div class="vcr-bar-row"><span>${escapeHtml(row.nome || row.cod_vendedor)}</span><span class="vcr-pair"><span class="vcr-bar-track"><span class="vcr-bar-fill" style="width:${Math.min(100, Math.abs(Number(row.realized) || 0) / max * 100)}%"></span></span><span class="vcr-bar-track"><span class="vcr-bar-fill target" style="width:${Math.min(100, Math.abs(Number(row.target) || 0) / max * 100)}%"></span></span></span><strong>${escapeHtml((Number(row.realized) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 }))}</strong></div>`).join("")}</section>`;
        }
        const metric = chart.metric === "quantity" ? "quantity" : chart.metric === "revenue" ? "revenue" : chart.metric || "realized";
        const max = Math.max(1, ...data.map((row) => Math.abs(Number(row[metric] ?? row.realized) || 0)));
        return `<section class="vcr-chart"><h3>${escapeHtml(chart.type.replaceAll("_", " "))}</h3>${data.slice(0, Number(chart.top_n || 10)).map((row) => { const value = Number(row[metric] ?? row.realized) || 0; return `<div class="vcr-bar-row"><span>${escapeHtml(row.nome || row.label || row.cod_vendedor)}</span><span class="vcr-bar-track"><span class="vcr-bar-fill" style="width:${Math.min(100, Math.abs(value) / max * 100)}%"></span></span><strong>${escapeHtml(value.toLocaleString("pt-BR", { maximumFractionDigits: 1 }))}</strong></div>`; }).join("")}</section>`;
      }).join("")}</div>`;
    }

    async function loadAndRenderRuntime(container, reportId, scenarioId) {
      const token = ++runtimeToken;
      container.innerHTML = `<div class="vcr-loading">Carregando relatório comercial...</div>`;
      try {
        const year = Number(state.currentPeriod?.year || 2026);
        const month = Number(state.currentPeriod?.month || 1);
        const org = await resolveOrganizationId();
        const [payload, scenarios] = await Promise.all([
          callSupabaseRpc("comercial_report_execute", { p_report_id: reportId, p_year: year, p_month: month, p_scenario_id: scenarioId, p_persist: false }),
          fetchSupabaseRowsSafe("forecast_scenarios", `organization_id=eq.${org}&reference_year=eq.${year}&order=created_at.asc&select=id,name`),
        ]);
        if (token !== runtimeToken) return;
        renderPayload(container, payload, scenarios || [], scenarioId);
      } catch (error) {
        console.error(error);
        if (token === runtimeToken) container.innerHTML = `<div class="vcr-empty">Erro ao gerar o relatório: ${escapeHtml(String(error?.message || error))}</div>`;
      }
    }

    function renderSelectedReport(container, selectedId) {
      const id = reportIdFromCard(selectedId);
      if (!id) return false;
      const report = definitions.find((item) => item.id === id);
      if (!report) return false;
      loadAndRenderRuntime(container, id, null);
      return true;
    }

    return { loadDefinitions, injectCatalogCards, mountCreateButton, renderSelectedReport };
  }

  window.VECTON_COMERCIAL_REPORTS = { createComercialReportsModule };
})(window);
