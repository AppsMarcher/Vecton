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

    // Templates guiam o wizard do Criador. Os 3 simplificados escondem
    // cargos/ranking/meta/premiação/gráficos (não fazem sentido fora de uma
    // campanha) e resolvem sozinhos o eixo de linha da tabela. "Campanha" é o
    // formulário completo original — usado pelo Bateu-Levou/Final de Ano e por
    // qualquer relatório avançado novo.
    const REPORT_TEMPLATES = [
      {
        id: "seller_monthly",
        label: "Desempenho de um vendedor",
        description: "Evolução mês a mês de 1 vendedor: volume, faturamento e margem.",
        rowAxis: "month",
        advanced: false,
      },
      {
        id: "team_comparison",
        label: "Comparativo do time",
        description: "Quem vendeu mais no período — sem meta, sem premiação.",
        rowAxis: "seller",
        advanced: false,
      },
      {
        id: "composition",
        label: "Composição por produto/cultura",
        description: "Quanto cada produto ou cultura representou no período.",
        rowAxis: "product",
        advanced: false,
      },
      {
        id: "campaign",
        label: "Campanha (avançado)",
        description: "Ranking com meta, elegibilidade e premiação — Bateu-Levou/Final de Ano.",
        rowAxis: "seller",
        advanced: true,
      },
    ];

    let definitions = [];
    let activeOverlay = null;
    let runtimeToken = 0;
    const rankingSorts = new Map();
    // reportId -> scenarioId (null = Budget). Ausente = ainda não resolvido;
    // a primeira renderização de cada relatório assume o cenário favorito da
    // organização (is_default em forecast_scenarios), nunca o Budget fixo.
    const scenarioSelections = new Map();

    async function resolveDefaultScenario(year) {
      try {
        const org = await resolveOrganizationId();
        const scenarios = await fetchSupabaseRowsSafe(
          "forecast_scenarios",
          `organization_id=eq.${org}&reference_year=eq.${year}&order=created_at.asc&select=id,is_default`
        );
        const fav = (scenarios || []).find((scenario) => scenario.is_default);
        return fav ? fav.id : null;
      } catch (_) {
        return null;
      }
    }

    function resetScenarioSelections() {
      scenarioSelections.clear();
    }

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
        .vcr-create-card{border-style:dashed!important;align-items:center!important;justify-content:center;gap:6px;text-align:center;color:#14b8a6!important;font-weight:600}.vcr-create-card span:last-child{font-size:11.5px;line-height:1.25}
        .vcr-card-status{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-faint)}
        .vcr-edit-btn{position:absolute;bottom:10px;right:10px;width:26px;height:26px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;color:var(--text-faint);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);cursor:pointer;z-index:2}.vcr-edit-btn svg{width:13px;height:13px;pointer-events:none}.vcr-edit-btn:hover{color:var(--text);background:rgba(255,255,255,.12)}
        .vcr-overlay{position:fixed;inset:0;z-index:9900;background:rgba(0,0,0,.64);display:flex;align-items:center;justify-content:center;padding:24px}
        .vcr-modal{width:min(1080px,96vw);max-height:94vh;overflow:hidden;background:var(--panel);border:1px solid var(--line);border-radius:18px;display:flex;flex-direction:column;box-shadow:0 30px 90px rgba(0,0,0,.58)}
        .vcr-modal-head{padding:18px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:16px}
        .vcr-modal-head h3{margin:0;font-size:18px}.vcr-close{border:0;background:none;color:var(--text-faint);font-size:22px;cursor:pointer}
        .vcr-modal-body{padding:20px 22px;overflow:auto;display:grid;gap:18px}.vcr-section{border:1px solid var(--line-soft);border-radius:14px;padding:15px;display:grid;gap:12px}
        .vcr-section h4{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-faint)}
        .vcr-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.vcr-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.vcr-grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}
        .vcr-field{display:grid;gap:6px;font-size:11px;color:var(--text-soft)}.vcr-field input,.vcr-field select,.vcr-field textarea{width:100%;border:1px solid var(--line);background:var(--panel-strong);color:var(--text);border-radius:9px;padding:9px;font:inherit}.vcr-field textarea{min-height:72px;resize:vertical}
        .vcr-field select option,.vcr-team-tools select option,.vcr-inline-field select option{background:#1a1d26;color:var(--text)}
        .vcr-inline-field{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-soft);white-space:nowrap}.vcr-inline-field select{width:auto;border:1px solid var(--line);background:var(--panel-strong);color:var(--text);border-radius:9px;padding:8px 10px;font:inherit}
        .vcr-checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px}.vcr-checks.compact{display:flex;flex-wrap:wrap}.vcr-checks.compact .vcr-check{flex:0 0 auto}.vcr-check{display:flex;align-items:center;gap:6px;padding:6px 9px;border:1px solid var(--line);border-radius:8px;font-size:10.5px;color:var(--text-soft);line-height:1.25}
        .vcr-chips{display:flex;flex-wrap:wrap;gap:8px}.vcr-chip{display:flex;align-items:center;gap:7px;padding:9px 14px;border:1px solid var(--line);border-radius:99px;font-size:12px;color:var(--text-soft);cursor:pointer;user-select:none}.vcr-chip:has(input:checked){border-color:#14b8a6;color:var(--text);background:rgba(20,184,166,.12)}.vcr-chip input{accent-color:#14b8a6}
        .vcr-team-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between}
        .vcr-team-tools-filters{display:flex;gap:8px;flex:1;min-width:260px}
        .vcr-team-tools-filters input{flex:1;min-width:150px}
        .vcr-team-tools-filters select{width:auto;min-width:150px}
        .vcr-team-tools-actions{display:flex;gap:8px;flex-wrap:wrap}
        .vcr-team-tools input,.vcr-team-tools select{width:auto;border:1px solid var(--line);background:var(--panel-strong);color:var(--text);border-radius:8px;padding:8px 10px;font-size:11px}
        .vcr-team-list{max-height:320px;overflow:auto;border:1px solid var(--line-soft);border-radius:10px}.vcr-team-row{display:grid;grid-template-columns:28px 84px 1fr 180px 80px 150px;gap:8px;align-items:center;padding:7px 10px;font-size:11px;border-bottom:1px solid var(--line-soft)}.vcr-team-row:last-child{border:0}.vcr-team-row.invalid{opacity:.62}
        .vcr-team-list.simple .vcr-team-row{grid-template-columns:28px 84px 1fr 180px}
        .vcr-team-count{font-size:11px;color:var(--text-faint)}
        .vcr-modal-actions{padding:14px 22px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:9px}.vcr-feedback{margin-right:auto;color:var(--neg);font-size:12px;align-self:center}
        .vcr-template-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:22px}
        .vcr-template-card{border:1px solid var(--line);border-radius:16px;padding:18px;text-align:left;background:var(--panel);cursor:pointer;display:grid;gap:6px;transition:border-color .15s,background .15s}
        .vcr-template-card:hover{border-color:#14b8a6;background:rgba(20,184,166,.06)}
        .vcr-template-card strong{font-size:14px}.vcr-template-card span{font-size:11.5px;color:var(--text-faint);line-height:1.35}
        .vcr-template-card.advanced{border-style:dashed}
        @media(max-width:780px){.vcr-template-grid{grid-template-columns:1fr}}
        .vcr-preview-panel{border:1px dashed var(--line);border-radius:14px;padding:15px;display:grid;gap:12px}
        .vcr-preview-panel .vcr-loading,.vcr-preview-panel .vcr-empty{padding:20px;text-align:center;color:var(--text-faint);font-size:11px}
        .vcr-metric-stack{display:grid;gap:18px}
        .vcr-metric-title{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-faint);font-weight:600}
        .vcr-month-layout{display:grid;grid-template-columns:minmax(180px,260px) 1fr;gap:18px;align-items:start}
        .vcr-month-kpis{display:grid;gap:10px;align-content:start}
        .vcr-month-chart{border:1px solid var(--line);border-radius:14px;padding:14px;background:var(--panel);display:grid;gap:8px}
        .vcr-combo-svg{width:100%;height:220px}
        .vcr-combo-label{font-size:9px;fill:var(--text-faint);text-anchor:middle}
        @media(max-width:780px){.vcr-month-layout{grid-template-columns:1fr}}
        .vcr-team-split{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}
        .vcr-rank-title{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-faint);font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:6px}
        .vcr-team-chart{border:1px solid var(--line);border-radius:14px;padding:16px;background:var(--panel)}
        .vcr-rankbar-row{display:grid;grid-template-columns:22px minmax(60px,120px) 1fr auto;gap:10px;align-items:center;margin:10px 0}
        .vcr-rankbar-pos{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff}
        .vcr-rankbar-name{font-size:11.5px;color:var(--text-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .vcr-rankbar-track{height:16px;border-radius:99px;background:var(--panel-hover);overflow:hidden}
        .vcr-rankbar-fill{display:block;height:100%;border-radius:99px}
        .vcr-rankbar-val{font-size:12px;white-space:nowrap;min-width:64px;text-align:right}
        .vcr-rankbar-axis{display:grid;grid-template-columns:22px minmax(60px,120px) 1fr auto;gap:10px;margin-top:6px}
        .vcr-rankbar-axis::before{content:"";grid-column:1/3}
        .vcr-rankbar-axis-ticks{grid-column:3;display:flex;justify-content:space-between;font-size:9px;color:var(--text-faint)}
        @media(max-width:900px){.vcr-team-split{grid-template-columns:1fr}}
        .vcr-report{display:grid;gap:18px}.vcr-report-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap}.vcr-report-head h1{font-size:21px;margin:3px 0}.vcr-kicker{margin:0;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-faint)}
        .vcr-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}.vcr-stat{border:1px solid var(--line);border-radius:13px;padding:13px;background:var(--panel)}.vcr-stat span{display:block;font-size:10px;color:var(--text-faint);text-transform:uppercase}.vcr-stat strong{display:block;font-size:21px;margin-top:5px}
        .vcr-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px}.vcr-table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}.vcr-table th,.vcr-table td{padding:9px 11px;border-bottom:1px solid var(--line-soft);font-size:11px;white-space:nowrap;text-align:left}.vcr-table th{color:var(--text-faint);font-size:9px;text-transform:uppercase;background:var(--panel);position:sticky;top:0}.vcr-table td.num,.vcr-table th.num{text-align:right}.vcr-table th[data-vcr-sort]{cursor:pointer;user-select:none}.vcr-table th[data-vcr-sort]:hover{color:var(--text-soft)}.vcr-table th[data-vcr-sort].active{color:#7aa2ff}.vcr-pill{display:inline-flex;padding:3px 7px;border-radius:99px;background:var(--panel-hover)}.vcr-pill.ok{color:var(--pos);background:rgba(34,197,94,.1)}.vcr-pill.no{color:var(--neg);background:rgba(248,113,113,.1)}
        .vcr-table tbody tr[data-vcr-code]{cursor:pointer}.vcr-table tbody tr[data-vcr-code]:hover{background:var(--panel-hover)}.vcr-movements{width:min(1400px,97vw)}.vcr-movement-table{min-width:1180px}
        .vcr-movement-table th[data-vcr-msort]{cursor:pointer;user-select:none}.vcr-movement-table th[data-vcr-msort]:hover{color:var(--text-soft)}.vcr-movement-table th[data-vcr-msort].active{color:#7aa2ff}
        .vcr-ranking-stack{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}.vcr-ranking-board{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--panel)}.vcr-ranking-board .vcr-table-wrap{border:0;border-radius:0}.vcr-ranking-board .vcr-table th,.vcr-ranking-board .vcr-table td{padding:8px 9px;font-size:10.5px}.vcr-ranking-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;border-bottom:1px solid var(--line);flex-wrap:wrap}.vcr-ranking-title{display:flex;align-items:center;gap:9px}.vcr-ranking-title h3{margin:0;font-size:13px}.vcr-ranking-title span{font-size:10px;color:var(--text-faint)}.vcr-ranking-dot{width:8px;height:8px;border-radius:50%;background:var(--blue)}.vcr-ranking-board.pecuaria .vcr-ranking-dot{background:#f59e0b}.vcr-ranking-board th[data-vcr-sort]{cursor:pointer;user-select:none}.vcr-ranking-board th[data-vcr-sort]:hover{color:var(--text-soft)}.vcr-ranking-board th[data-vcr-sort].active{color:#7aa2ff}
        .vcr-charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.vcr-chart{border:1px solid var(--line);border-radius:14px;padding:14px;background:var(--panel)}.vcr-chart h3{font-size:12px;margin:0 0 12px}.vcr-bar-row{display:grid;grid-template-columns:minmax(90px,1fr) 3fr 70px;gap:8px;align-items:center;font-size:10px;margin:7px 0}.vcr-bar-track{height:7px;background:var(--panel-hover);border-radius:99px;overflow:hidden}.vcr-bar-fill{height:100%;background:var(--blue);border-radius:99px}
        .vcr-pair{display:grid;gap:3px}.vcr-bar-fill.target{background:var(--text-faint)}.vcr-line-chart{width:100%;height:190px}.vcr-line-chart polyline{fill:none;stroke-width:2}.vcr-line-labels{display:flex;justify-content:space-between;color:var(--text-faint);font-size:9px}.vcr-legend{display:flex;gap:14px;font-size:10px;color:var(--text-soft);margin-bottom:8px}.vcr-legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px}
        .vcr-compliance{border:1px solid var(--line);border-radius:14px;padding:0 14px;background:var(--panel)}.vcr-compliance summary{cursor:pointer;padding:13px 0;font-size:11px;font-weight:600}.vcr-compliance ul{margin:0 0 14px;padding-left:18px;color:var(--text-soft);font-size:11px;display:grid;gap:5px}
        .vcr-loading,.vcr-empty{padding:50px;text-align:center;color:var(--text-faint)}
        @media(max-width:780px){.vcr-grid,.vcr-grid.two,.vcr-grid.four{grid-template-columns:1fr}.vcr-team-row{grid-template-columns:28px 70px 1fr}.vcr-team-row span:nth-last-child(-n+2){display:none}.vcr-ranking-stack{grid-template-columns:1fr}.vcr-team-tools-filters,.vcr-team-tools-actions{width:100%}.vcr-team-tools-filters select{flex:1}}
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
      button.innerHTML = `<span style="font-size:20px">+</span><span>Novo relatório Comercial</span>`;
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

    function blankConfig(template) {
      const rowAxis = template?.rowAxis || "seller";
      const nonAdvanced = !template || !template.advanced;
      return {
        schema_version: 1,
        origins: ["FAT"],
        cargos: [],
        active_only: true,
        include_historical: false,
        selection_type: "general",
        selected_codes: [],
        participant_list_version: 1,
        product_types: [],
        cultures: [],
        product_type_ids: [],
        culture_ids: [],
        territory_ids: [],
        row_axis: rowAxis,
        primary_metric: "quantity",
        complementary_metrics: [],
        evaluation: "target_reached",
        conditions: { minimum_quantity: 0, minimum_attainment_pct: 100, requires_target: true, zero_target_policy: "null" },
        ranking: { enabled: !nonAdvanced, metric: "attainment_pct", direction: "desc", tie_breaker: "quantity" },
        award: { enabled: false, rule: "conditions_met" },
        groupings: [],
        scenario_mode: "runtime",
        charts: [],
      };
    }

    function inferTemplateId(report, config) {
      if (report?.report_kind === "bateu_levou" || report?.report_kind === "final_ano") return "campaign";
      const axis = config?.row_axis || "seller";
      if (axis === "month") return "seller_monthly";
      if (axis === "product" || axis === "culture") return "composition";
      if (config?.ranking?.enabled || config?.award?.enabled) return "campaign";
      return "team_comparison";
    }

    function checkGroup(name, options, selected) {
      const labels = {
        quantity: "Quantidade", revenue: "Faturamento", margin: "Margem",
        ranking_bar: "Ranking em barras", target_vs_actual: "Meta vs. realizado",
        time_line: "Evolução no tempo", product_distribution: "Composição por produto",
        culture_distribution: "Composição por cultura", eligibility: "Elegibilidade",
      };
      return `<div class="vcr-checks">${options.map((option) => { const value = typeof option === "object" ? option.value : option; const label = typeof option === "object" ? option.label : labels[value] || value; return `<label class="vcr-check"><input type="checkbox" name="${name}" value="${escapeHtml(value)}" ${selected.includes(value) ? "checked" : ""}>${escapeHtml(label)}</label>`; }).join("")}</div>`;
    }

    function metricChips(name, selected) {
      const options = [
        { value: "quantity", label: "Volume" },
        { value: "revenue", label: "Faturamento" },
        { value: "margin", label: "Margem" },
      ];
      return `<div class="vcr-chips">${options.map((option) => `<label class="vcr-chip"><input type="checkbox" name="${name}" value="${option.value}" ${selected.includes(option.value) ? "checked" : ""}>${escapeHtml(option.label)}</label>`).join("")}</div>`;
    }

    // Passo 0: grade de templates. So aparece pra relatorio novo — editar um
    // relatorio existente pula direto pro modo inferido (inferTemplateId).
    function openTemplatePicker() {
      ensureStyles();
      closeOverlay();
      const overlay = document.createElement("div");
      overlay.className = "vcr-overlay";
      overlay.innerHTML = `
        <div class="vcr-modal" role="dialog" aria-modal="true" style="width:min(760px,96vw)">
          <div class="vcr-modal-head"><div><p class="vcr-kicker">Criador de Relatórios Comerciais</p><h3>O que você quer fazer?</h3></div><button class="vcr-close" type="button">×</button></div>
          <div class="vcr-template-grid">
            ${REPORT_TEMPLATES.map((template) => `
              <button type="button" class="vcr-template-card ${template.advanced ? "advanced" : ""}" data-template="${template.id}">
                <strong>${escapeHtml(template.label)}</strong>
                <span>${escapeHtml(template.description)}</span>
              </button>
            `).join("")}
          </div>
        </div>`;
      document.body.appendChild(overlay);
      activeOverlay = overlay;
      overlay.querySelector(".vcr-close").addEventListener("click", closeOverlay);
      overlay.addEventListener("click", (event) => { if (event.target === overlay) closeOverlay(); });
      overlay.querySelectorAll("[data-template]").forEach((card) => {
        card.addEventListener("click", () => {
          const template = REPORT_TEMPLATES.find((t) => t.id === card.dataset.template);
          openCreatorForm(null, template);
        });
      });
    }

    async function openCreator(report) {
      if (!report) {
        openTemplatePicker();
        return;
      }
      await openCreatorForm(report, null);
    }

    async function openCreatorForm(report, templateArg) {
      ensureStyles();
      closeOverlay();
      const org = await resolveOrganizationId();
      const year = Number(state.currentPeriod?.year || 2026);
      const month = Number(state.currentPeriod?.month || 1);
      const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      const [configLoaded, centralTeam, periodRows, productTypes, cultures] = await Promise.all([
        loadConfig(report),
        fetchSupabaseRowsSafe("comercial_vendedores", `organization_id=eq.${org}&order=nome.asc&select=codigo,nome,cargo,situacao`),
        fetchSupabaseRowsSafe("comercial_vendedor_vigencias", `organization_id=eq.${org}&data_inicio=lte.${periodEnd}&or=(data_fim.is.null,data_fim.gte.${periodStart})&order=data_inicio.desc&select=cod_vendedor,nome,cargo,situacao,data_inicio,data_fim`),
        fetchSupabaseRowsSafe("comercial_tipos", `organization_id=eq.${org}&order=nome.asc&select=id,nome`),
        fetchSupabaseRowsSafe("comercial_culturas", `organization_id=eq.${org}&order=nome.asc&select=id,nome`),
      ]);
      const template = templateArg || REPORT_TEMPLATES.find((t) => t.id === inferTemplateId(report, configLoaded)) || REPORT_TEMPLATES[3];
      const config = configLoaded || blankConfig(template);
      const centralByCode = new Map((centralTeam || []).map((person) => [person.codigo, person]));
      const currentByCode = new Map();
      (periodRows || []).forEach((person) => {
        if (currentByCode.has(person.cod_vendedor)) return;
        const current = centralByCode.get(person.cod_vendedor);
        if (!current || current.situacao !== "ativo") return;
        currentByCode.set(person.cod_vendedor, {
          ...person,
          codigo: person.cod_vendedor,
          nome: current?.nome || person.nome,
          vigente: true,
        });
      });
      (config.selected_codes || []).forEach((code) => {
        if (!currentByCode.has(code)) {
          const person = centralByCode.get(code);
          if (!person || person.situacao !== "ativo") return;
          currentByCode.set(code, { ...person, vigente: false });
        }
      });
      const team = [...currentByCode.values()].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));

      const overlay = document.createElement("div");
      overlay.className = "vcr-overlay";
      overlay.innerHTML = `
        <div class="vcr-modal" role="dialog" aria-modal="true">
          <div class="vcr-modal-head"><div><p class="vcr-kicker">Criador de Relatórios Comerciais · ${escapeHtml(template.label)}</p><h3>${report ? "Editar relatório" : "Novo relatório"}</h3></div><button class="vcr-close" type="button">×</button></div>
          <div class="vcr-modal-body">
            ${template.advanced ? advancedSectionsHtml(report, config, team, productTypes, cultures) : simpleSectionsHtml(report, config, team, template)}
            <div class="vcr-preview-panel" id="vcr-preview-panel" hidden></div>
          </div>
          <div class="vcr-modal-actions">
            <span class="vcr-feedback"></span>
            ${report ? `<button type="button" class="ghost-button vcr-duplicate">Duplicar</button>` : ""}
            ${report?.status === "draft" ? `<button type="button" class="delete-button vcr-delete">Excluir rascunho</button>` : ""}
            <button type="button" class="ghost-button vcr-preview-btn">Pré-visualizar</button>
            <button type="button" class="ghost-button vcr-cancel">Cancelar</button>
            <button type="button" class="primary-button vcr-save">${report ? "Salvar nova versão" : "Criar relatório"}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      activeOverlay = overlay;
      overlay.querySelector(".vcr-close").addEventListener("click", closeOverlay);
      overlay.querySelector(".vcr-cancel").addEventListener("click", closeOverlay);
      overlay.addEventListener("click", (event) => { if (event.target === overlay) closeOverlay(); });
      bindTeamFilters(overlay, template);
      overlay.querySelector(".vcr-save").addEventListener("click", () => saveCreator(overlay, report, config, org, template));
      overlay.querySelector(".vcr-preview-btn").addEventListener("click", () => runPreview(overlay, report, config, org, template, year, month));
      overlay.querySelector(".vcr-duplicate")?.addEventListener("click", () => duplicateReport(report, config, org, overlay));
      overlay.querySelector(".vcr-delete")?.addEventListener("click", () => deleteDraft(report, overlay));
    }

    function advancedSectionsHtml(report, config, team, productTypes, cultures) {
      return `
            <section class="vcr-section"><h4>Identificação</h4>
              <label class="vcr-field">Nome<input id="vcr-name" value="${escapeHtml(report?.nome || "")}" maxlength="80"></label>
              <div class="vcr-grid">
                <label class="vcr-field">Status<select id="vcr-status"><option value="draft" ${report?.status === "draft" || !report ? "selected" : ""}>Rascunho</option><option value="active" ${report?.status === "active" ? "selected" : ""}>Ativo</option><option value="closed" ${report?.status === "closed" ? "selected" : ""}>Encerrado</option></select></label>
                <label class="vcr-field">Modalidade<select id="vcr-mode"><option value="monthly" ${report?.modalidade === "monthly" || !report ? "selected" : ""}>Mensal não cumulativa</option><option value="annual_ytd" ${report?.modalidade === "annual_ytd" ? "selected" : ""}>Anual cumulativa YTD</option></select></label>
                <label class="vcr-field">Ordem do card<input id="vcr-order" type="number" min="0" value="${Number(report?.display_order || 0)}"></label>
              </div>
              <div class="vcr-grid two">
                <label class="vcr-field">Data inicial<input id="vcr-start" type="date" value="${escapeHtml(report?.data_inicio || "")}"></label>
                <label class="vcr-field">Data final<input id="vcr-end" type="date" value="${escapeHtml(report?.data_fim || "")}"></label>
              </div>
              <label class="vcr-field">Descrição<textarea id="vcr-description">${escapeHtml(report?.descricao || "")}</textarea></label>
            </section>

            <section class="vcr-section"><h4>Participantes</h4>
              <div class="vcr-field"><span>Cargos participantes</span>${checkGroup("vcr-cargo", CARGOS, config.cargos || [])}</div>
              <div class="vcr-team-tools">
                <div class="vcr-team-tools-filters">
                  <input id="vcr-team-search" placeholder="Pesquisar nome ou código">
                  <select id="vcr-team-cargo"><option value="">Todos os cargos</option>${CARGOS.map((c) => `<option>${escapeHtml(c)}</option>`).join("")}</select>
                </div>
                <div class="vcr-team-tools-actions">
                  <button type="button" class="ghost-button" id="vcr-team-select-all">Selecionar todos</button>
                  <button type="button" class="ghost-button" id="vcr-team-all">Selecionar filtrados</button>
                  <button type="button" class="ghost-button" id="vcr-team-none">Desmarcar todos</button>
                </div>
              </div>
              <div class="vcr-team-list">${(team || []).map((person) => `<label class="vcr-team-row ${person.vigente === false ? "invalid" : ""}" data-name="${escapeHtml(`${person.codigo} ${person.nome}`.toLowerCase())}" data-cargo="${escapeHtml(person.cargo || "")}" data-status="${escapeHtml(person.situacao || "")}"><input type="checkbox" name="vcr-person" value="${escapeHtml(person.codigo)}" ${(config.selected_codes || []).includes(person.codigo) ? "checked" : ""}><strong>${escapeHtml(person.codigo)}</strong><span>${escapeHtml(person.nome)}</span><span>${escapeHtml(person.cargo || "—")}</span><span>${escapeHtml(person.situacao)}</span><span>${person.vigente === false ? "Fora da vigência" : `${escapeHtml(person.data_inicio || "")} — ${escapeHtml(person.data_fim || "aberta")}`}</span></label>`).join("")}</div>
              <p class="vcr-note">Somente integrantes com status ativo no Time Comercial participam dos relatórios.</p>
            </section>

            <section class="vcr-section"><h4>Dados e segmentação</h4><div><span class="vcr-kicker">Origem</span>${checkGroup("vcr-origin", ["FAT", "CART"], config.origins || [])}</div><div><span class="vcr-kicker">Produtos</span>${checkGroup("vcr-product", (productTypes || []).map((item) => ({ value: item.id, label: item.nome })), config.product_type_ids || [])}</div><div><span class="vcr-kicker">Culturas</span>${checkGroup("vcr-culture", (cultures || []).map((item) => ({ value: item.id, label: item.nome })), config.culture_ids || [])}</div><label class="vcr-check"><input type="checkbox" id="vcr-group-culture" ${(config.groupings || []).includes("culture") ? "checked" : ""}>Separar resultado por cultura</label></section>

            <section class="vcr-section"><h4>Métricas e avaliação</h4>
              <div class="vcr-grid four">
                <label class="vcr-field">Métrica principal<select id="vcr-primary"><option value="quantity" ${config.primary_metric === "quantity" ? "selected" : ""}>Quantidade</option><option value="revenue" ${config.primary_metric === "revenue" ? "selected" : ""}>Faturamento</option></select></label>
                <label class="vcr-field">Critério<select id="vcr-evaluation"><option value="target_reached" ${config.evaluation === "target_reached" ? "selected" : ""}>Atingiu a meta</option><option value="highest_attainment" ${config.evaluation === "highest_attainment" ? "selected" : ""}>Maior atingimento</option><option value="highest_overachievement" ${config.evaluation === "highest_overachievement" ? "selected" : ""}>Maior superação</option><option value="rank_quantity" ${config.evaluation === "rank_quantity" ? "selected" : ""}>Ranking por quantidade</option><option value="rank_revenue" ${config.evaluation === "rank_revenue" ? "selected" : ""}>Ranking por faturamento</option></select></label>
                <label class="vcr-field">Quantidade mínima<input id="vcr-min-qtd" type="number" step="0.01" value="${Number(config.conditions?.minimum_quantity || 0)}"></label>
                <label class="vcr-field">Atingimento mínimo (%)<input id="vcr-min-pct" type="number" step="0.01" value="${Number(config.conditions?.minimum_attainment_pct || 0)}"></label>
              </div>
              <div class="vcr-checks compact">
                <label class="vcr-check"><input type="checkbox" id="vcr-requires-target" ${config.conditions?.requires_target ? "checked" : ""}>Exigir meta válida</label>
                <label class="vcr-check"><input type="checkbox" id="vcr-ranking" ${config.ranking?.enabled !== false ? "checked" : ""}>Exibir ranking</label>
                <label class="vcr-check"><input type="checkbox" id="vcr-award" ${config.award?.enabled ? "checked" : ""}>Exibir premiação</label>
              </div>
              <div><span class="vcr-kicker">Métricas complementares</span>${checkGroup("vcr-complement", ["quantity", "revenue", "margin"], config.complementary_metrics || [])}</div>
            </section>

            <section class="vcr-section"><h4>Visualizações</h4>${checkGroup("vcr-chart", ["ranking_bar", "target_vs_actual", "time_line", "product_distribution", "culture_distribution", "eligibility"], (config.charts || []).map((c) => c.type))}<label class="vcr-field" style="max-width:180px">Top N<input id="vcr-chart-top" type="number" min="1" max="50" value="${Number(config.charts?.[0]?.top_n || 10)}"></label><p style="margin:0;color:var(--text-faint);font-size:11px">Nenhum gráfico é habilitado automaticamente.</p></section>
      `;
    }

    // Templates simplificados: sem cargos, sem ranking/meta/premiação, sem
    // gráficos configuráveis. So nome + escopo (quem) + metricas (o que).
    function simpleSectionsHtml(report, config, team, template) {
      const isSingle = template.id === "seller_monthly";
      const selected = config.selected_codes || [];
      return `
            <section class="vcr-section"><h4>Nome</h4>
              <label class="vcr-field">Nome do relatório<input id="vcr-name" value="${escapeHtml(report?.nome || "")}" maxlength="80"></label>
              <input type="hidden" id="vcr-status" value="${escapeHtml(report?.status || "draft")}">
              <input type="hidden" id="vcr-order" value="${Number(report?.display_order || 0)}">
              <label class="vcr-field">Descrição (opcional)<textarea id="vcr-description">${escapeHtml(report?.descricao || "")}</textarea></label>
            </section>

            <section class="vcr-section"><h4>${isSingle ? "Vendedor" : "Escopo"}</h4>
              <div class="vcr-team-tools">
                <div class="vcr-team-tools-filters">
                  <input id="vcr-team-search" placeholder="Pesquisar nome ou código">
                </div>
                ${isSingle ? "" : `<div class="vcr-team-tools-actions">
                  <button type="button" class="ghost-button" id="vcr-team-all">Selecionar filtrados</button>
                  <button type="button" class="ghost-button" id="vcr-team-none">Desmarcar todos</button>
                </div>`}
              </div>
              <div class="vcr-team-list simple">${(team || []).map((person) => `<label class="vcr-team-row ${person.vigente === false ? "invalid" : ""}" data-name="${escapeHtml(`${person.codigo} ${person.nome}`.toLowerCase())}"><input type="${isSingle ? "radio" : "checkbox"}" name="vcr-person" value="${escapeHtml(person.codigo)}" ${selected.includes(person.codigo) ? "checked" : ""}><strong>${escapeHtml(person.codigo)}</strong><span>${escapeHtml(person.nome)}</span><span>${escapeHtml(person.cargo || "—")}</span></label>`).join("")}</div>
              <p class="vcr-note">${isSingle ? "Escolha 1 vendedor." : "Deixe tudo desmarcado para incluir o time inteiro."}</p>
            </section>

            <section class="vcr-section"><h4>Métricas</h4>
              ${metricChips("vcr-metric", config.primary_metric ? [config.primary_metric, ...(config.complementary_metrics || [])] : ["quantity"])}
              <p class="vcr-note">A primeira métrica marcada vira a coluna principal; as demais aparecem como colunas extras.</p>
            </section>
      `;
    }

    function closeOverlay() {
      activeOverlay?.remove();
      activeOverlay = null;
    }

    function bindTeamFilters(overlay, template) {
      const paint = () => {
        const term = overlay.querySelector("#vcr-team-search")?.value.trim().toLowerCase() || "";
        const cargo = overlay.querySelector("#vcr-team-cargo")?.value || "";
        overlay.querySelectorAll(".vcr-team-row").forEach((row) => {
          row.hidden = Boolean((term && !row.dataset.name.includes(term)) || (cargo && row.dataset.cargo !== cargo));
        });
      };
      overlay.querySelector("#vcr-team-search")?.addEventListener("input", paint);
      overlay.querySelector("#vcr-team-cargo")?.addEventListener("change", paint);
      overlay.querySelector("#vcr-team-select-all")?.addEventListener("click", () => overlay.querySelectorAll('.vcr-team-row input').forEach((input) => { input.checked = true; }));
      overlay.querySelector("#vcr-team-all")?.addEventListener("click", () => overlay.querySelectorAll(".vcr-team-row:not([hidden]) input").forEach((input) => { input.checked = true; }));
      overlay.querySelector("#vcr-team-none")?.addEventListener("click", () => overlay.querySelectorAll('[name="vcr-person"]').forEach((input) => { input.checked = false; }));
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

    // Monta o config a partir do formulario (avancado ou simplificado) sem
    // gravar nada — reaproveitado pelo Salvar e pelo Pre-visualizar.
    function buildConfigFromForm(overlay, previousConfig, template) {
      if (template.advanced) {
        const cargos = checkedValues(overlay, "vcr-cargo");
        const origins = checkedValues(overlay, "vcr-origin");
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
        return {
          config: {
            ...previousConfig,
            schema_version: 1,
            origins, cargos,
            active_only: true,
            include_historical: false,
            selection_type: selectedCodes.length === 0 ? "general" : selectedCodes.length === 1 ? "individual" : "partial",
            selected_codes: selectedCodes,
            participant_list_version: Number(previousConfig.participant_list_version || 0) + 1,
            product_type_ids: checkedValues(overlay, "vcr-product"),
            culture_ids: checkedValues(overlay, "vcr-culture"),
            territory_ids: previousConfig.territory_ids || [],
            row_axis: "seller",
            product_types: [], cultures: [],
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
          },
          error: !cargos.length || !origins.length ? "Selecione pelo menos um cargo e uma origem." : null,
        };
      }

      const metrics = checkedValues(overlay, "vcr-metric");
      const selectedCodes = checkedValues(overlay, "vcr-person");
      const isSingle = template.id === "seller_monthly";
      let error = null;
      if (!metrics.length) error = "Selecione ao menos uma métrica.";
      if (isSingle && selectedCodes.length !== 1) error = "Escolha exatamente 1 vendedor.";
      return {
        config: {
          ...previousConfig,
          schema_version: 1,
          origins: ["FAT"],
          cargos: [],
          active_only: true,
          include_historical: false,
          selection_type: selectedCodes.length === 0 ? "general" : selectedCodes.length === 1 ? "individual" : "partial",
          selected_codes: selectedCodes,
          participant_list_version: Number(previousConfig.participant_list_version || 0) + 1,
          product_type_ids: [], culture_ids: [], territory_ids: previousConfig.territory_ids || [],
          product_types: [], cultures: [],
          row_axis: template.rowAxis,
          primary_metric: metrics[0] || "quantity",
          complementary_metrics: metrics.slice(1),
          evaluation: "rank_quantity",
          conditions: { minimum_quantity: 0, minimum_attainment_pct: 0, requires_target: false, zero_target_policy: "real_is_100" },
          ranking: { enabled: false, metric: "quantity", direction: "desc", tie_breaker: "revenue" },
          award: { enabled: false, rule: "conditions_met" },
          groupings: [],
          scenario_mode: "runtime",
          charts: [],
        },
        error,
      };
    }

    async function runPreview(overlay, report, previousConfig, org, template, year, month) {
      const panel = overlay.querySelector("#vcr-preview-panel");
      const { config, error } = buildConfigFromForm(overlay, previousConfig, template);
      if (error) {
        panel.hidden = false;
        panel.innerHTML = `<div class="vcr-empty">${escapeHtml(error)}</div>`;
        return;
      }
      panel.hidden = false;
      panel.innerHTML = `<div class="vcr-loading">Gerando pré-visualização...</div>`;
      const status = report ? overlay.querySelector("#vcr-status")?.value || report.status : "draft";
      const modalidade = template.advanced ? overlay.querySelector("#vcr-mode")?.value : templateModalidade(template);
      const dataInicio = template.advanced ? (overlay.querySelector("#vcr-start")?.value || null) : (report?.data_inicio || null);
      const dataFim = template.advanced ? (overlay.querySelector("#vcr-end")?.value || null) : (report?.data_fim || null);
      try {
        const payload = await callSupabaseRpc("comercial_report_preview", {
          p_organization_id: org,
          p_report_kind: report?.report_kind || "custom",
          p_modalidade: modalidade,
          p_data_inicio: dataInicio,
          p_data_fim: dataFim,
          p_config: config,
          p_year: year,
          p_month: month,
          p_scenario_id: null,
        });
        if (config.row_axis === "month") {
          panel.innerHTML = renderMonthAxisReport(payload);
        } else {
          const columns = (payload.columns || []).filter((c) => c.visible !== false).sort((a, b) => a.order - b.order);
          panel.innerHTML = `
            <div class="vcr-summary">${(payload.summary || []).map((item) => `<div class="vcr-stat"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(formatValue(item.value, { type: item.key?.includes("total") && config.primary_metric === "revenue" ? "currency" : "number" }))}</strong></div>`).join("")}</div>
            ${tableMarkup(columns, payload.rows || [], { empty: "Sem resultados para o período." })}
          `;
        }
      } catch (err) {
        panel.innerHTML = `<div class="vcr-empty">Erro ao pré-visualizar: ${escapeHtml(String(err?.message || err))}</div>`;
      }
    }

    // "Desempenho de um vendedor" (row_axis=month) grava modalidade YTD pra
    // que o motor resolva sozinho a janela Jan→mês selecionado (acumulado).
    // Os demais templates simplificados seguem mensal, como hoje.
    function templateModalidade(template) {
      return template.id === "seller_monthly" ? "annual_ytd" : "monthly";
    }

    // Layout dedicado do eixo Mês: metade resumo (realizado/meta acumulados
    // no período, variam com o cenário escolhido no topo) + metade gráfico de
    // barras mês a mês (real vs meta), em vez da tabela genérica.
    const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    function hexToRgb(color) {
      const hex = String(color || "").trim().replace("#", "");
      if (hex.length !== 6) return { r: 79, g: 124, b: 255 };
      return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
    }
    function mixColor(color, target, amount) {
      const base = hexToRgb(color), to = hexToRgb(target);
      const t = Math.max(0, Math.min(1, amount));
      return `rgb(${Math.round(base.r + (to.r - base.r) * t)}, ${Math.round(base.g + (to.g - base.g) * t)}, ${Math.round(base.b + (to.b - base.b) * t)})`;
    }
    function rgbaColor(color, alpha) {
      const c = hexToRgb(color);
      return `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.max(0, Math.min(1, alpha))})`;
    }

    // Mesma técnica visual do combo chart do Dashboard (renderDashComboChart em
    // dashboardVisuals.js): barra sólida com gradiente/glow pro mês com
    // realizado, barra tracejada "fantasma" pro mês só com meta/forecast, linha
    // suave conectando o atingimento % mês a mês. Reimplementado aqui (sem
    // tooltip interativo) porque comercialReportsModule.js monta HTML estático
    // via innerHTML, não tem os containerId/eventos do módulo do Dashboard.
    function renderMonthComboChart(rows, metric, hasTargetMetric, zeroTargetPolicy, barColor = "#4f7cff", lineColor = "#a5b4fc") {
      const targetKey = metric === "quantity" ? "target_quantity" : metric === "revenue" ? "target_revenue" : null;
      const byMonth = new Map(rows.map((row) => [Number(row.row_key.slice(5, 7)) - 1, row]));
      const barVals = [], targetVals = [], lineVals = [];
      for (let i = 0; i < 12; i += 1) {
        const row = byMonth.get(i);
        const realized = row ? Number(row[metric]) || 0 : 0;
        const target = hasTargetMetric && targetKey && row ? Number(row[targetKey]) || 0 : 0;
        barVals.push(realized);
        targetVals.push(target);
        let attain = null;
        if (hasTargetMetric) {
          if (target > 0) attain = realized / target;
          else if (realized > 0 && zeroTargetPolicy === "real_is_100") attain = 1;
        }
        lineVals.push(attain);
      }
      const hasTarget = targetVals.some((v) => v !== 0);

      const W = 720, H = 220, PAD_L = 8, PAD_R = 8, PAD_B = 24, PAD_T = 12;
      const chartW = W - PAD_L - PAD_R;
      const chartH = H - PAD_B - PAD_T;
      const groupW = chartW / 12;
      const barW = Math.min(groupW * 0.55, 34);
      const ghostBarW = Math.min(groupW * 0.8, 44);

      const realIdxs = barVals.map((v, i) => ({ v, i })).filter(({ v }) => v !== 0).map(({ i }) => i);
      const targetIdxs = targetVals.map((v, i) => ({ v, i })).filter(({ v }) => v !== 0).map(({ i }) => i);
      const realSet = new Set(realIdxs);
      const targetSet = new Set(targetIdxs);

      const allBarVals = [...realIdxs.map((i) => barVals[i]), ...targetIdxs.map((i) => targetVals[i])];
      const hasNeg = allBarVals.some((v) => v < 0);
      const barMax = Math.max(...allBarVals.map(Math.abs), 1);
      const maxV = Math.max(...allBarVals, 0);
      const minV = Math.min(...allBarVals, 0);
      const zeroY = hasNeg ? PAD_T + chartH * (maxV / (maxV - minV || 1)) : PAD_T + chartH;

      const barRect = (value) => {
        if (!hasNeg) {
          const h = Math.max(1, (value / barMax) * chartH);
          return { y: zeroY - h, h };
        }
        const range = maxV - minV || 1;
        const h = Math.max(1, Math.abs(value) / range * chartH);
        return { y: value >= 0 ? zeroY - h : zeroY, h };
      };

      const activeLineVals = realIdxs.map((i) => lineVals[i]).filter((v) => v !== null && Number.isFinite(v));
      const lineMin = Math.min(...activeLineVals, 0);
      const lineMax = Math.max(...activeLineVals, 0.01);
      const lineRange = lineMax - lineMin || 0.01;
      const lineY = (v) => PAD_T + chartH * (1 - (v - lineMin) / lineRange);

      const topGlow = mixColor(barColor, "#ffffff", 0.22);
      const midTone = mixColor(barColor, "#ffffff", 0.08);
      const deepTone = mixColor(barColor, "#050816", 0.42);
      const gradId = `vcr-combo-grad-${Math.random().toString(36).slice(2, 8)}`;
      const glowId = `vcr-combo-glow-${Math.random().toString(36).slice(2, 8)}`;

      let bars = "", labels = "", linePts = [], dots = "";
      for (let i = 0; i < 12; i += 1) {
        const xCenter = PAD_L + i * groupW + groupW / 2;
        labels += `<text x="${xCenter.toFixed(1)}" y="${H - 6}" class="vcr-combo-label">${escapeHtml(MONTH_ABBR[i])}</text>`;
        if (targetSet.has(i)) {
          const { y, h } = barRect(targetVals[i]);
          const xGhost = xCenter - ghostBarW / 2;
          bars += `<rect x="${xGhost.toFixed(1)}" y="${y.toFixed(1)}" width="${ghostBarW.toFixed(1)}" height="${h.toFixed(1)}" fill="${rgbaColor(barColor, 0.14)}" stroke="${rgbaColor(barColor, 0.45)}" stroke-width="1" stroke-dasharray="3,3" rx="4"><title>${escapeHtml(MONTH_ABBR[i])}: meta ${targetVals[i].toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</title></rect>`;
        }
        if (realSet.has(i)) {
          const value = barVals[i];
          const { y, h } = barRect(value);
          const xBar = xCenter - barW / 2;
          const glossH = Math.max(6, h * 0.28);
          bars += `<g>
            <rect x="${xBar.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="url(#${gradId})" rx="4" filter="url(#${glowId})"><title>${escapeHtml(MONTH_ABBR[i])}: realizado ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</title></rect>
            <rect x="${(xBar + 1.1).toFixed(1)}" y="${(y + 1.2).toFixed(1)}" width="${Math.max(barW - 2.2, 1).toFixed(1)}" height="${Math.max(glossH - 1.2, 1).toFixed(1)}" fill="rgba(255,255,255,0.14)" rx="3"/>
          </g>`;
          if (lineVals[i] !== null) {
            const ly = lineY(lineVals[i]);
            linePts.push({ x: xCenter, y: ly });
            dots += `<circle cx="${xCenter.toFixed(1)}" cy="${ly.toFixed(1)}" r="3" fill="${lineColor}"><title>${escapeHtml(MONTH_ABBR[i])}: ${(lineVals[i] * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% atingimento</title></circle>`;
          }
        }
      }

      let linePath = "";
      if (linePts.length > 1) {
        let d = `M ${linePts[0].x.toFixed(1)} ${linePts[0].y.toFixed(1)}`;
        for (let k = 1; k < linePts.length; k += 1) {
          const prev = linePts[k - 1], curr = linePts[k];
          const cpx = ((prev.x + curr.x) / 2).toFixed(1);
          d += ` C ${cpx} ${prev.y.toFixed(1)}, ${cpx} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
        }
        linePath = `<path d="${d}" fill="none" stroke="${lineColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
      }

      const zeroLine = `<line x1="${PAD_L}" y1="${zeroY.toFixed(1)}" x2="${W - PAD_R}" y2="${zeroY.toFixed(1)}" stroke="var(--line)" stroke-width="1" stroke-dasharray="3,3"/>`;
      const defs = `<defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${topGlow}"/><stop offset="22%" stop-color="${midTone}"/><stop offset="100%" stop-color="${deepTone}"/>
        </linearGradient>
        <filter id="${glowId}" x="-30%" y="-20%" width="160%" height="170%">
          <feDropShadow dx="0" dy="8" stdDeviation="5" flood-color="${rgbaColor(barColor, 0.24)}"/>
        </filter>
      </defs>`;

      return `<div class="vcr-legend"><span><i style="background:${barColor}"></i>Realizado</span>${hasTarget ? `<span><i style="background:transparent;border:1px dashed ${barColor}"></i>Meta</span>` : ""}${linePts.length ? `<span><i style="background:${lineColor}"></i>Atingimento %</span>` : ""}</div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="vcr-combo-svg">
        ${defs}${zeroLine}${bars}${linePath}${dots}${labels}
      </svg>`;
    }

    const METRIC_LABELS = { quantity: "Volume", revenue: "Faturamento", margin: "Margem" };

    // 1 painel (KPIs + gráfico) por métrica selecionada — antes só a métrica
    // principal aparecia, mesmo marcando Volume+Faturamento+Margem juntos.
    function renderMetricPanel(rows, metric, periodCutoff, zeroTargetPolicy) {
      const isCurrency = metric !== "quantity";
      const fmt = (value) => isCurrency
        ? Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
      const hasTargetMetric = metric !== "margin";
      const targetKey = metric === "quantity" ? "target_quantity" : metric === "revenue" ? "target_revenue" : null;
      const accumulated = rows.filter((row) => row.row_key <= periodCutoff);
      const totalRealized = accumulated.reduce((acc, row) => acc + (Number(row[metric]) || 0), 0);
      const totalTarget = hasTargetMetric && targetKey ? accumulated.reduce((acc, row) => acc + (Number(row[targetKey]) || 0), 0) : null;
      const attainment = totalTarget && totalTarget > 0 ? (totalRealized / totalTarget) * 100 : null;
      return `<div class="vcr-month-layout">
        <div class="vcr-month-kpis">
          <span class="vcr-metric-title">${escapeHtml(METRIC_LABELS[metric] || metric)}</span>
          <div class="vcr-stat"><span>Realizado acumulado</span><strong>${escapeHtml(fmt(totalRealized))}</strong></div>
          ${totalTarget !== null ? `<div class="vcr-stat"><span>Meta acumulada</span><strong>${escapeHtml(fmt(totalTarget))}</strong></div>
          <div class="vcr-stat"><span>Atingimento</span><strong>${attainment !== null ? escapeHtml(`${attainment.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`) : "—"}</strong></div>` : ""}
        </div>
        <div class="vcr-month-chart">
          ${renderMonthComboChart(rows, metric, hasTargetMetric, zeroTargetPolicy)}
        </div>
      </div>`;
    }

    function renderMonthAxisReport(payload) {
      const rows = payload.rows || [];
      const config = payload.config || {};
      const metrics = [config.primary_metric, ...(config.complementary_metrics || [])].filter(
        (metric, index, arr) => metric && arr.indexOf(metric) === index
      );
      if (!rows.length) return `<div class="vcr-empty">Sem resultados para o período.</div>`;
      const periodCutoff = String(payload.period?.effective_end || "").slice(0, 7);
      const zeroTargetPolicy = config.conditions?.zero_target_policy || "null";
      return `<div class="vcr-metric-stack">${metrics.map((metric) => renderMetricPanel(rows, metric, periodCutoff, zeroTargetPolicy)).join("")}</div>`;
    }

    async function saveCreator(overlay, report, previousConfig, org, template) {
      const feedback = overlay.querySelector(".vcr-feedback");
      const save = overlay.querySelector(".vcr-save");
      const nome = overlay.querySelector("#vcr-name").value.trim();
      if (!nome) {
        feedback.textContent = "Preencha o nome do relatório.";
        return;
      }
      const { config, error } = buildConfigFromForm(overlay, previousConfig, template);
      if (error) {
        feedback.textContent = error;
        return;
      }
      const definition = template.advanced
        ? {
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
          }
        : {
            organization_id: org,
            slug: report?.slug || `custom-${crypto.randomUUID()}`,
            nome,
            descricao: overlay.querySelector("#vcr-description").value.trim(),
            status: report?.status || "draft",
            report_kind: report?.report_kind || "custom",
            modalidade: templateModalidade(template),
            data_inicio: report?.data_inicio || null,
            data_fim: report?.data_fim || null,
            display_order: Number(report?.display_order || 0),
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
      } catch (error2) {
        console.error(error2);
        feedback.textContent = String(error2?.message || "Erro ao salvar o relatório.");
        save.disabled = false; save.textContent = report ? "Salvar nova versão" : "Criar relatório";
      }
    }

    function formatDateBR(value) {
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
      return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || "");
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
      return rows.map((row) => `<tr ${row.cod_vendedor ? `data-vcr-code="${escapeHtml(row.cod_vendedor)}" data-vcr-segment="${escapeHtml(row.segment || "")}"` : ""}>${columns.map((column) => {
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

    const BATEU_HIDDEN_COLUMNS = new Set(["segment", "cargo", "status", "eligible", "situation", "reason"]);

    function renderBateuRankings(columns, rows, reportId) {
      const rankColumns = columns.filter((column) => !BATEU_HIDDEN_COLUMNS.has(column.key));
      const definitionsBySegment = [
        { key: "graos", title: "Grãos", className: "graos", matches: (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().startsWith("gra") },
        { key: "pecuaria", title: "Pecuária", className: "pecuaria", matches: (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().startsWith("pec") },
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

    const RANK_COLORS = ["#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#eab308", "#22c55e", "#ef4444"];

    // Ranking horizontal colorido (1 cor por posição), estilo "print 2":
    // barra arredondada, comprimento proporcional ao valor, régua de escala
    // embaixo, valor sempre alinhado no fim da faixa (não no fim da barra).
    function renderRankBarChart(rows, metric) {
      const isCurrency = metric !== "quantity";
      const fmtShort = (value) => {
        const abs = Math.abs(value);
        if (isCurrency) {
          if (abs >= 1e6) return `R$ ${(value / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
          if (abs >= 1e3) return `R$ ${(value / 1e3).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k`;
          return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
        }
        return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
      };
      const max = Math.max(1, ...rows.map((row) => Math.abs(Number(row.realized) || 0)));
      const ticks = 4;
      const axis = Array.from({ length: ticks + 1 }, (_, i) => (max * i) / ticks);
      const rowsHtml = rows.length
        ? rows.map((row, index) => {
            const value = Number(row.realized) || 0;
            const color = RANK_COLORS[index % RANK_COLORS.length];
            const width = Math.max(2, Math.abs(value) / max * 100);
            return `<div class="vcr-rankbar-row">
              <span class="vcr-rankbar-pos" style="background:${color}">${index + 1}</span>
              <span class="vcr-rankbar-name">${escapeHtml(row.nome || row.cod_vendedor || "")}</span>
              <span class="vcr-rankbar-track"><span class="vcr-rankbar-fill" style="width:${width}%;background:${color}"></span></span>
              <strong class="vcr-rankbar-val" style="color:${color}">${escapeHtml(fmtShort(value))}</strong>
            </div>`;
          }).join("")
        : `<div class="vcr-empty">Sem resultados para o período.</div>`;
      return `${rowsHtml}
        <div class="vcr-rankbar-axis"><span class="vcr-rankbar-axis-ticks">${axis.map((value) => `<span>${escapeHtml(fmtShort(value))}</span>`).join("")}</span></div>`;
    }

    // Tela dividida do template "Comparativo do time": metade tabela
    // (Nome|Meta|Real|Var%, ordenável pelo cabeçalho — mesmo padrão de
    // classificação já usado no Bateu-Levou) + metade ranking colorido.
    // Constrói uma "visão" das linhas prontas pra 1 métrica específica (Meta e
    // Var% recalculados client-side a partir de target_quantity/target_revenue,
    // já que o motor só devolve os dois brutos, não um "Var%" por métrica).
    // Margem nunca tem meta (planejado não tem margem).
    function buildMetricRows(rows, metric, zeroTargetPolicy) {
      const targetKey = metric === "quantity" ? "target_quantity" : metric === "revenue" ? "target_revenue" : null;
      return rows.map((row) => {
        const realized = Number(row[metric]) || 0;
        const target = targetKey ? Number(row[targetKey]) || 0 : null;
        let varPct = null;
        if (target !== null) {
          if (target > 0) varPct = (realized / target - 1) * 100;
          else if (realized > 0 && zeroTargetPolicy === "real_is_100") varPct = 0;
        }
        return { ...row, realized, target, overachievement_pct: varPct };
      });
    }

    function renderTeamMetricPanel(payload, metric) {
      const rows = payload.rows || [];
      const isCurrency = metric !== "quantity";
      const hasTarget = metric !== "margin";
      const zeroTargetPolicy = payload.config?.conditions?.zero_target_policy || "null";
      const metricRows = buildMetricRows(rows, metric, zeroTargetPolicy);
      const metricLabel = METRIC_LABELS[metric] || metric;
      const columns = [{ key: "nome", label: "Nome", type: "text" }];
      if (hasTarget) columns.push({ key: "target", label: "Meta", type: isCurrency ? "currency" : "number" });
      columns.push({ key: "realized", label: "Real", type: isCurrency ? "currency" : "number" });
      if (hasTarget) columns.push({ key: "overachievement_pct", label: "Var %", type: "percentage" });

      const sortKey = `team:${payload.report?.id}:${metric}`;
      const sortState = rankingSorts.get(sortKey) || { key: "realized", dir: -1 };
      const sortedRows = sortRankingRows(metricRows, columns, sortState);
      const chartRows = metricRows.slice().sort((a, b) => (Number(b.realized) || 0) - (Number(a.realized) || 0));
      return `<div class="vcr-team-split" data-vcr-team-sort-key="${escapeHtml(sortKey)}">
        <div class="vcr-team-table">
          <span class="vcr-metric-title">${escapeHtml(metricLabel)}</span>
          ${tableMarkup(columns, sortedRows, { sortable: true, sortState, empty: "Sem resultados para o período." })}
        </div>
        <div class="vcr-team-chart">
          <div class="vcr-rank-title">Ranking por ${escapeHtml(metricLabel.toLowerCase())} <span title="Ranking por ${escapeHtml(metricLabel.toLowerCase())} no período, do maior pro menor.">ⓘ</span></div>
          ${renderRankBarChart(chartRows, metric)}
        </div>
      </div>`;
    }

    function renderTeamComparisonReport(payload) {
      const config = payload.config || {};
      const metrics = [config.primary_metric, ...(config.complementary_metrics || [])].filter(
        (metric, index, arr) => metric && arr.indexOf(metric) === index
      );
      return `<div class="vcr-metric-stack">${metrics.map((metric) => renderTeamMetricPanel(payload, metric)).join("")}</div>`;
    }

    function renderPayload(container, payload, scenarios, scenarioId) {
      const columns = (payload.columns || []).filter((column) => column.visible !== false).sort((a, b) => a.order - b.order);
      const summary = payload.summary || [];
      const rows = payload.rows || [];
      const isBateuLevou = payload.report?.kind === "bateu_levou";
      const isMonthAxis = payload.config?.row_axis === "month";
      const isTeamComparison = !isMonthAxis && payload.config?.row_axis === "seller"
        && !payload.config?.ranking?.enabled && !payload.config?.award?.enabled;
      const scenarioOptions = `<option value="" ${!scenarioId ? "selected" : ""}>Budget</option>` + scenarios.map((scenario) => `<option value="${escapeHtml(scenario.id)}" ${scenario.id === scenarioId ? "selected" : ""}>${escapeHtml(scenario.name)}</option>`).join("");
      container.innerHTML = `<div class="vcr-report">
        <header class="vcr-report-head"><div><h1>${escapeHtml(payload.report?.name || "Relatório")}</h1><span style="color:var(--text-faint);font-size:11px">${formatDateBR(payload.period?.effective_start)} — ${formatDateBR(payload.period?.effective_end)}</span></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><label class="vcr-inline-field">Cenário<select id="vcr-runtime-scenario">${scenarioOptions}</select></label></div></header>
        ${isMonthAxis ? renderMonthAxisReport(payload) : isTeamComparison ? renderTeamComparisonReport(payload) : `
        <div class="vcr-summary">${summary.map((item) => `<div class="vcr-stat"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(formatValue(item.value, { type: item.key?.includes("total") && payload.config?.primary_metric === "revenue" ? "currency" : "number" }))}</strong></div>`).join("")}</div>
        ${isBateuLevou ? renderBateuRankings(columns, rows, payload.report.id) : tableMarkup(columns, rows)}
        `}
        ${isTeamComparison ? "" : renderCharts(payload.charts || [], rows)}
        <details class="vcr-compliance" open><summary>Critérios e regras aplicadas · versão ${Number(payload.report?.version || 0)}</summary><ul>${(payload.compliance?.rules || []).map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul></details>
      </div>`;
      container.querySelector("#vcr-runtime-scenario")?.addEventListener("change", (event) => {
        const scenarioId = event.target.value || null;
        scenarioSelections.set(payload.report.id, scenarioId);
        loadAndRenderRuntime(container, payload.report.id, scenarioId);
      });
      if (isBateuLevou) bindRankingSorts(container, payload, scenarios, scenarioId);
      if (isTeamComparison) {
        container.querySelectorAll(".vcr-team-table th[data-vcr-sort]").forEach((header) => {
          header.addEventListener("click", () => {
            const stateKey = header.closest("[data-vcr-team-sort-key]")?.dataset.vcrTeamSortKey;
            const columnKey = header.dataset.vcrSort;
            const current = rankingSorts.get(stateKey);
            rankingSorts.set(stateKey, current?.key === columnKey
              ? { key: columnKey, dir: current.dir * -1 }
              : { key: columnKey, dir: 1 });
            renderPayload(container, payload, scenarios, scenarioId);
          });
        });
      }
      container.querySelectorAll("tr[data-vcr-code]").forEach((row) => row.addEventListener("click", () => openMovements(payload.report.id, row.dataset.vcrCode, scenarioId, payload.report.name, row.dataset.vcrSegment || null)));
    }

    async function openMovements(reportId, codVendedor, scenarioId, reportName, segment) {
      closeOverlay();
      const overlay = document.createElement("div");
      overlay.className = "vcr-overlay";
      overlay.innerHTML = `<div class="vcr-modal vcr-movements"><div class="vcr-modal-head"><div><p class="vcr-kicker">Detalhamento dos movimentos</p><h3>${escapeHtml(reportName)} · ${escapeHtml(codVendedor)}${segment ? ` · ${escapeHtml(segment)}` : ""}</h3></div><button class="vcr-close" type="button">×</button></div><div class="vcr-modal-body"><div class="vcr-loading">Carregando movimentos...</div></div></div>`;
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
          p_segment: segment || null,
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
        const numericKeys = new Set(["quantidade", "faturamento", "margem_percentual"]);
        const consideredMovements = (movements || []).filter((movement) => movement.movimento_considerado === true);
        let sortState = null;
        const paintMovements = () => {
          const sorted = sortState ? consideredMovements.slice().sort((a, b) => {
            const av = a[sortState.key];
            const bv = b[sortState.key];
            if (sortState.key === "data") return sortState.dir * (new Date(av || 0) - new Date(bv || 0));
            if (numericKeys.has(sortState.key)) return sortState.dir * ((Number(av) || 0) - (Number(bv) || 0));
            return sortState.dir * String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR", { numeric: true });
          }) : consideredMovements;
          const body = sorted.map((movement) => `<tr>${columns.map(([key]) => {
            let value = movement[key];
            if (key === "faturamento") value = Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            else if (key === "margem_percentual" && value !== null) value = `${(Number(value) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
            else if (typeof value === "boolean") value = value ? "Sim" : "Não";
            return `<td>${escapeHtml(value ?? "—")}</td>`;
          }).join("")}</tr>`).join("");
          overlay.querySelector(".vcr-modal-body").innerHTML = `<div class="vcr-table-wrap"><table class="vcr-table vcr-movement-table"><thead><tr>${columns.map(([key, label]) => {
            const active = sortState?.key === key;
            const arrow = active ? (sortState.dir === 1 ? " ↑" : " ↓") : "";
            return `<th data-vcr-msort="${escapeHtml(key)}" class="${active ? "active" : ""}">${escapeHtml(label)}${arrow}</th>`;
          }).join("")}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}" class="vcr-empty">Nenhum movimento considerado para este realizado.</td></tr>`}</tbody></table></div>`;
          overlay.querySelectorAll("th[data-vcr-msort]").forEach((header) => header.addEventListener("click", () => {
            const key = header.dataset.vcrMsort;
            sortState = sortState?.key === key ? { key, dir: sortState.dir * -1 } : { key, dir: 1 };
            paintMovements();
          }));
        };
        paintMovements();
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
      if (scenarioSelections.has(id)) {
        loadAndRenderRuntime(container, id, scenarioSelections.get(id));
      } else {
        container.innerHTML = `<div class="vcr-loading">Carregando relatório comercial...</div>`;
        const year = Number(state.currentPeriod?.year || new Date().getFullYear());
        resolveDefaultScenario(year).then((scenarioId) => {
          scenarioSelections.set(id, scenarioId);
          loadAndRenderRuntime(container, id, scenarioId);
        });
      }
      return true;
    }

    return {
      loadDefinitions, injectCatalogCards, mountCreateButton, renderSelectedReport,
      resetScenarioSelections,
    };
  }

  window.VECTON_COMERCIAL_REPORTS = { createComercialReportsModule };
})(window);
