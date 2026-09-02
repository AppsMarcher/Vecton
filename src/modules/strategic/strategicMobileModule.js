(function attachVectonStrategicMobile(window) {
  // A3 Estratégicos — versão mobile, v1 SOMENTE LEITURA (decisão do usuário,
  // 2026-09-02): Visão Executiva (Norte Verdadeiro + áreas com status) e
  // Detalhe de A3 (KPIs real×meta + status + plano de ação, tudo leitura).
  // Lançamento mensal, causas/contramedidas e anexos ficam de fora desta
  // leva — só no desktop. Mesmas RPCs do desktop (strategic_get_overview/
  // strategic_get_a3_detail) e a mesma tabela strategic_actions (mesmo
  // filtro de loadActionsForA3) — nenhuma regra de negócio nova aqui, só
  // apresentação resumida (mesmo espírito do Painel de Vendas mobile:
  // "os mesmos números, só um jeito resumido de mostrar"). Formatação/
  // status compartilhados com o desktop via strategicDataModule.js.
  function createStrategicMobileModule(deps) {
    const {
      resolveOrganizationId,
      callSupabaseRpc,
      authenticatedFetch,
      supabaseApiUrl,
      escapeHtml
    } = deps;
    const DATA = window.VECTON_STRATEGIC_DATA;
    const { STATUS_META, ACTION_STATUS_OPTIONS, ACTION_STATUS_TONE, formatByUnit, formatTargetVariation } = DATA;

    const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    // Mesmo mapeamento de tom -> cor do desktop (.sa3-pill em strategicModule.js)
    // usando os tokens --vmob-* já definidos em styles.css; "pause" (ação
    // pausada) não tem token vmob equivalente -- usa o próprio acento roxo
    // do módulo A3 no Menu mobile (mobileShellModule.js: accent "#8b5cf6"),
    // consistência de marca do módulo, não uma cor nova inventada.
    const TONE_COLOR = {
      pos: "var(--vmob-positive)", neg: "var(--vmob-negative)", warn: "var(--vmob-warning)",
      pause: "#8b5cf6", cancel: "var(--vmob-faint)", muted: "var(--vmob-faint)"
    };

    let containerEl = null;
    let entered = false;
    let orgId = null;
    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;
    let screen = "overview"; // "overview" | "detail"
    let overview = null;     // { northGoals, areas }
    let a3RootId = null, a3Children = [], activeA3Id = null;
    let a3Detail = null;     // { a3, children, kpis, canEdit }
    let actions = [];
    let orgUsers = null;
    let loading = false;
    let error = "";
    let loadedOverviewKey = null;
    let loadedDetailKey = null;
    // Seletor de período: MESMO componente do Painel de Vendas mobile
    // (reportsComercialPainelMobileModule.js) — trigger + modal centralizado
    // com grade de meses, classes .vmob-period-modal*/.vmob-cenario-trigger
    // agora compartilhadas em styles.css (pedido do usuário, 2026-09-02:
    // "o seletor de período deve ser igual ao módulo mobile do Painel de
    // Vendas"). pickerYear é o ano que a GRADE está mostrando (navegação
    // livre com ‹ ›); só vira o "year" de verdade quando um mês é clicado.
    let periodListOpen = false;
    let pickerYear = null;

    // ---------------------------------------------------------------- CSS

    function ensureStyle() {
      if (document.getElementById("vmob-sa3-style")) return;
      const s = document.createElement("style");
      s.id = "vmob-sa3-style";
      s.textContent = `
        /* .vmob-crumbbar/.vmob-level-title/.vmob-section*/.vmob-card/.vmob-chev/
           .vmob-empty/.vmob-loading*/.vmob-filter-row/.vmob-cenario-trigger/
           .vmob-period-modal* base ficam em styles.css -- compartilhados com
           o Menu e o Painel de Vendas mobile. Só o que é específico do A3
           Estratégico fica aqui (mesmo padrão do reportsComercialPainelMobileModule.js). */

        .sa3mob-period-row { display:flex; justify-content:flex-end; margin-top:12px; }

        /* Label em cima, valor embaixo (mesmo padrão empilhado de
           .sa3mob-metric-lbl/.sa3mob-metric-val no card de KPI) -- lado a
           lado com "justify-content:space-between" só funcionava pra valor
           numérico curto ("R$ 120 mi"); meta com texto corrido (ex.: "Trilha
           de Carreira") estourava a linha com white-space:nowrap. Pedido do
           usuário, 2026-09-02: quebrar em quantas linhas forem necessárias,
           justificado. */
        /* Card do Norte Verdadeiro em destaque, borda azul do projeto -- mesmo
           tratamento do desktop (.sa3-card-north { border-color:var(--sa3-blue) }),
           pedido do usuário 2026-09-02. */
        .sa3mob-card-north { border-color:var(--vmob-accent); }
        .sa3mob-north-grid { display:flex; flex-direction:column; gap:10px; }
        .sa3mob-north-row { padding:9px 0; border-top:1px solid var(--vmob-line); }
        .sa3mob-north-row:first-child { border-top:none; padding-top:0; }
        .sa3mob-north-title { display:block; font-size:11px; font-weight:700; letter-spacing:0.02em; color:var(--vmob-faint); text-transform:uppercase; margin-bottom:3px; }
        .sa3mob-north-value { display:block; font-size:13px; font-weight:600; color:var(--vmob-text); line-height:1.55; white-space:normal; text-align:justify; text-justify:inter-word; }

        .sa3mob-area-list { display:flex; flex-direction:column; gap:8px; }
        .sa3mob-area-row { all:unset; box-sizing:border-box; display:flex; align-items:center; gap:10px; width:100%; background:var(--vmob-panel); border:1px solid var(--vmob-line); border-left:3px solid var(--vmob-card-accent, var(--vmob-accent)); border-radius:14px; padding:11px 12px; cursor:pointer; }
        .sa3mob-area-row:active { background:var(--vmob-panel-elevated); }
        .sa3mob-area-icon { width:30px; height:30px; border-radius:9px; flex-shrink:0; display:grid; place-items:center; font-size:12.5px; font-weight:800; color:#fff; background:var(--vmob-card-accent, var(--vmob-accent)); }
        .sa3mob-area-id { flex:1 1 auto; min-width:0; }
        /* Nome da área quebra em quantas linhas forem necessárias (não trunca
           mais com "…") -- pedido do usuário, 2026-09-02, pra nomes longos
           (ex.: "Trilha de Carreira", "Capa Fabril") não ficarem cortados. */
        .sa3mob-area-name { display:block; font-size:13px; font-weight:800; color:var(--vmob-text); white-space:normal; text-align:justify; text-justify:inter-word; }
        .sa3mob-area-sub { display:block; font-size:10.5px; color:var(--vmob-faint); margin-top:1px; }

        .sa3mob-pill { display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:999px; font-size:10.5px; font-weight:700; white-space:nowrap; flex-shrink:0; }

        .sa3mob-crumb { display:flex; align-items:center; font-size:13px; font-weight:600; flex-wrap:wrap; margin-bottom:6px; }
        .sa3mob-crumb button { all:unset; color:var(--vmob-faint); cursor:pointer; padding:2px 1px; }
        .sa3mob-crumb .sa3mob-crumb-current { color:var(--vmob-text); }
        .sa3mob-crumb-sep { margin:0 6px; color:var(--vmob-faint); }

        .sa3mob-tabs { display:flex; gap:6px; overflow-x:auto; padding-bottom:2px; margin-top:12px; }
        .sa3mob-tab { all:unset; box-sizing:border-box; flex-shrink:0; padding:7px 13px; font-size:12px; font-weight:700; border-radius:999px; background:var(--vmob-panel); border:1px solid var(--vmob-line); color:var(--vmob-soft); cursor:pointer; }
        .sa3mob-tab.is-active { background:var(--vmob-accent); border-color:var(--vmob-accent); color:#fff; }

        /* Objetivo Estratégico: envolto por borda da MESMA cor do card da
           área na tela anterior (a3.color, aplicado inline via
           --sa3mob-objective-accent) -- pedido do usuário, 2026-09-02, pra
           dar continuidade visual Overview -> Detalhe. Texto justificado. */
        .sa3mob-objective-box { margin-top:10px; border:1.5px solid var(--sa3mob-objective-accent, var(--vmob-accent)); border-radius:14px; padding:11px 13px; }
        /* line-height/white-space replicam o texto explicativo do desktop
           (.sa3-objective-text em strategicModule.js: line-height:1.5,
           white-space:pre-wrap) -- pedido do usuário 2026-09-02, mantendo
           o justificado (só do mobile, o desktop não justifica). */
        .sa3mob-objective { font-size:12px; color:var(--vmob-soft); line-height:1.5; white-space:pre-wrap; margin:0; text-align:justify; text-justify:inter-word; }

        .sa3mob-kpi-list { display:flex; flex-direction:column; gap:10px; }
        .sa3mob-kpi-card { border-left:3px solid var(--vmob-line); }
        .sa3mob-kpi-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:10px; }
        .sa3mob-kpi-name { font-size:13px; font-weight:800; color:var(--vmob-text); }
        .sa3mob-kpi-metrics { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
        .sa3mob-metric-lbl { display:block; font-size:9.5px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:var(--vmob-faint); }
        /* Mesmo tamanho do texto explicativo (.sa3mob-objective, 12px) --
           pedido do usuário 2026-09-02, era 13px (maior que o objetivo). */
        .sa3mob-metric-val { display:block; font-size:12px; font-weight:800; color:var(--vmob-text); margin-top:2px; }
        .sa3mob-kpi-acc { margin-top:10px; padding-top:9px; border-top:1px solid var(--vmob-line); font-size:11px; color:var(--vmob-faint); display:flex; justify-content:space-between; gap:8px; }
        .sa3mob-kpi-acc b { color:var(--vmob-soft); font-weight:700; }

        /* Gráfico combo (Real em barras + Meta em linha/banda) -- mesmo
           cálculo do desktop (buildKpiChartSeries, strategicDataModule.js),
           só a marcação/tamanho é próprio do mobile (pedido do usuário,
           2026-09-02: "cada indicador deve trazer seu gráfico"). */
        .sa3mob-chart { margin-top:11px; padding-top:10px; border-top:1px solid var(--vmob-line); }
        .sa3mob-chart-plot { position:relative; height:84px; }
        .sa3mob-chart-bars { position:absolute; inset:0; display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:3px; z-index:1; }
        /* Coluna inteira (não só a barrinha) é a área de toque -- alvo de
           toque maior que os ~13px da barra, mais fácil de acertar com o
           dedo. */
        .sa3mob-chart-col { position:relative; height:100%; min-width:0; }
        .sa3mob-chart-col[data-chart-has-real="true"] { cursor:pointer; }
        .sa3mob-chart-bar { position:absolute; left:50%; transform:translateX(-50%); width:min(13px,82%); border-radius:3px 3px 1px 1px; background:linear-gradient(180deg,#b6c2d2 0%,#78889d 24%,#374151 100%); transition:filter 120ms ease; }
        /* Coluna tocada (pedido do usuário, 2026-09-02: "ao colocar o dedo
           sobre a coluna, mostrar a legenda") -- realce visual + a legenda
           abaixo troca pro valor do mês (chartLegendTapHtml). */
        .sa3mob-chart-col.is-active .sa3mob-chart-bar { filter:brightness(1.35); }
        .sa3mob-chart-col.is-active::after { content:""; position:absolute; inset:0; background:rgba(255,255,255,.05); border-radius:3px; }
        .sa3mob-chart-bar.pos { background:linear-gradient(180deg,#74e89b 0%,#2dcc6b 24%,#0d6b38 100%); }
        .sa3mob-chart-bar.neg { background:linear-gradient(180deg,#f58a8a 0%,#ef5050 24%,#8b202b 100%); }
        .sa3mob-chart-zero { position:absolute; left:0; right:0; height:1px; background:rgba(255,255,255,.08); z-index:0; }
        .sa3mob-chart-svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:2; }
        .sa3mob-chart-line { fill:none; stroke:#4f7cff; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; vector-effect:non-scaling-stroke; }
        .sa3mob-chart-point { fill:#4f7cff; stroke:#121317; stroke-width:1.3; vector-effect:non-scaling-stroke; }
        .sa3mob-chart-line.band { stroke-width:1.4; stroke-dasharray:4 3; opacity:.62; }
        .sa3mob-chart-point.band { opacity:.62; }
        .sa3mob-chart-months { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:3px; padding-top:5px; text-align:center; }
        .sa3mob-chart-month { font-size:7.4px; font-weight:600; color:var(--vmob-faint); text-transform:uppercase; }
        .sa3mob-chart-legend { display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:baseline; column-gap:10px; row-gap:3px; margin-top:6px; font-size:9.5px; color:var(--vmob-faint); min-height:12px; }
        .sa3mob-chart-legend span { display:inline-flex; align-items:center; gap:4px; }
        .sa3mob-chart-legend-bar { width:8px; height:8px; border-radius:2px 2px 0 0; background:linear-gradient(90deg,#22c55e 0 50%,#ef4444 50% 100%); }
        .sa3mob-chart-legend-line { width:12px; height:0; border-top:2px solid #4f7cff; }
        /* Estado "tocando uma coluna": mês em destaque + real/meta/var --
           mesmos 3 valores do tooltip de hover do desktop, só que fixo na
           legenda em vez de popover flutuante (que tamparia o gráfico
           embaixo do dedo no touch). */
        .sa3mob-chart-legend-month { font-size:10px; font-weight:800; color:var(--vmob-text); text-transform:uppercase; }
        .sa3mob-chart-legend-stat b { color:var(--vmob-text); font-weight:700; margin-left:2px; }

        .sa3mob-plan { margin-top:12px; padding-top:11px; border-top:1px solid var(--vmob-line); }
        .sa3mob-plan-title { font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--vmob-faint); margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; }
        .sa3mob-action-row { padding:9px 0; border-top:1px solid var(--vmob-line); }
        .sa3mob-action-row:first-child { border-top:none; padding-top:0; }
        .sa3mob-action-title { font-size:12px; font-weight:700; color:var(--vmob-text); }
        .sa3mob-action-meta { font-size:10.5px; color:var(--vmob-faint); margin-top:3px; }
        .sa3mob-action-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:6px; }
      `;
      document.head.appendChild(s);
    }

    // ---------------------------------------------------------------- data

    async function ensureOrg() {
      if (!orgId) orgId = await resolveOrganizationId();
      return orgId;
    }

    async function fetchRest(table, query) {
      const response = await authenticatedFetch(`${supabaseApiUrl}/rest/v1/${table}?${query}`);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    }

    function friendlyError(err) {
      const msg = String(err?.message || err || "Erro desconhecido");
      try {
        const parsed = JSON.parse(msg);
        return parsed.message || parsed.error || msg;
      } catch (_) {
        return msg;
      }
    }

    function periodKey() { return `${year}-${month}`; }

    async function loadOverview() {
      loading = true; error = ""; render();
      try {
        await ensureOrg();
        overview = await callSupabaseRpc("strategic_get_overview", {
          p_organization_id: orgId, p_year: year, p_month: month
        });
        loadedOverviewKey = periodKey();
      } catch (err) {
        error = friendlyError(err);
      } finally {
        loading = false; render();
      }
    }

    // isRoot=true: veio da lista de áreas (sempre uma A3-mãe) -- reseta abas.
    // isRoot=false: clique numa aba (Consolidado/filho) dentro do próprio
    // Detalhe, mantendo a3RootId/a3Children já carregados.
    async function loadDetail(a3Id, isRoot) {
      loading = true; error = ""; screen = "detail"; activeA3Id = a3Id;
      if (isRoot) { a3RootId = a3Id; a3Children = []; }
      if (a3Detail?.a3?.id !== a3Id) a3Detail = null;
      render();
      try {
        await ensureOrg();
        a3Detail = await callSupabaseRpc("strategic_get_a3_detail", {
          p_organization_id: orgId, p_a3_id: a3Id, p_year: year, p_month: month
        });
        if (isRoot) a3Children = a3Detail?.children || [];
        loadedDetailKey = periodKey();
        await loadActions(a3Id);
        await ensureOrgUsers();
      } catch (err) {
        error = friendlyError(err);
      } finally {
        loading = false; render();
      }
    }

    // Mesma consulta/filtro de loadActionsForA3 (strategicModule.js) -- ação
    // vinculada ao A3 direto (strategic_action_a3) OU a algum KPI dele
    // (strategic_action_kpis). O agrupamento por KPI (Plano de ação de CADA
    // indicador) usa só o vínculo por KPI, igual renderKpiBlock do desktop.
    async function loadActions(a3Id) {
      const kpiIds = (a3Detail?.kpis || []).map((k) => k.id);
      if (!kpiIds.length) { actions = []; return; }
      const rows = await fetchRest(
        "strategic_actions",
        `organization_id=eq.${orgId}&select=*,strategic_action_kpis(kpi_id),strategic_action_a3(a3_id),strategic_action_owners(user_id)&order=due_date.asc.nullslast`
      );
      actions = (rows || []).filter((a) =>
        (a.strategic_action_a3 || []).some((l) => l.a3_id === a3Id) ||
        (a.strategic_action_kpis || []).some((l) => kpiIds.includes(l.kpi_id))
      );
    }

    async function ensureOrgUsers() {
      if (orgUsers) return;
      try {
        orgUsers = await fetchRest(
          "user_profiles",
          `organization_id=eq.${orgId}&is_active=eq.true&select=user_id,full_name,email&order=full_name.asc`
        );
      } catch (_) {
        orgUsers = [];
      }
    }

    function ownerNameById(userId) {
      const u = (orgUsers || []).find((x) => x.user_id === userId);
      return u ? (u.full_name || u.email || "Usuário") : null;
    }

    function actionsForKpi(kpiId) {
      // Mesmo corte "viajar no tempo" do desktop (renderKpiBlock): ação
      // criada DEPOIS do mês em foco ainda não existia naquele ponto do
      // tempo, não aparece revisando um mês passado.
      const cutoff = new Date(year, month, 1);
      return actions.filter((a) =>
        (a.strategic_action_kpis || []).some((l) => l.kpi_id === kpiId) &&
        (!a.created_at || new Date(a.created_at) < cutoff)
      );
    }

    // ---------------------------------------------------------------- helpers de apresentação

    function monthAbbrev(m) { return MONTH_ABBR[m - 1] || ""; }

    // Seletor de período: MESMO trigger + modal do Painel de Vendas mobile
    // (reportsComercialPainelMobileModule.js::periodPickerHtml), reaproveitando
    // as classes agora compartilhadas em styles.css. A3 não tem "Modo"/
    // "Cenário" (o cenário vigente é resolvido sozinho pela RPC) — por isso
    // não entra no acordeão "Filtros" do Painel, é só o trigger direto.
    function periodTriggerHtml() {
      const gridYear = pickerYear || year;
      const monthItems = Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
        const selected = m === month && gridYear === year;
        return '<button type="button" class="vmob-month-item' + (selected ? " is-selected" : "") + '" data-action="select-month" data-m="' + m + '">' + monthAbbrev(m) + "</button>";
      }).join("");
      return '<div class="sa3mob-period-row">' +
        '<button type="button" class="vmob-cenario-trigger" aria-haspopup="true" aria-expanded="' + periodListOpen + '" data-action="toggle-period-list">' +
        "<span>" + monthAbbrev(month) + "/" + year + "</span>" +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" class="vmob-cenario-chev"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        "</button></div>" +
        '<div class="vmob-period-modal-backdrop' + (periodListOpen ? " is-open" : "") + '" data-action="close-period-list"></div>' +
        '<div class="vmob-period-modal' + (periodListOpen ? " is-open" : "") + '" role="dialog" aria-modal="true" aria-label="Selecionar período">' +
        '<div class="vmob-period-modal-card">' +
        '<div class="vmob-period-modal-head">' +
        '<button type="button" data-action="period-year" data-dir="-1" aria-label="Ano anterior">&lsaquo;</button>' +
        '<span class="vmob-period-modal-year">' + gridYear + "</span>" +
        '<button type="button" data-action="period-year" data-dir="1" aria-label="Próximo ano">&rsaquo;</button>' +
        "</div>" +
        '<p class="vmob-period-modal-sub">Selecione o ano base do relatório e o mês em foco da análise.</p>' +
        '<div class="vmob-month-grid">' + monthItems + "</div>" +
        "</div></div>";
    }

    // Gráfico combo de 1 KPI (Real em barras + Meta em linha/banda) —
    // consome buildKpiChartSeries (strategicDataModule.js, mesmo cálculo do
    // desktop) e desenha com as classes .sa3mob-chart-*.
    // Legenda padrão (swatches Realizado/Meta) — também usada pra "desfazer"
    // o toque num mês (chartLegendTapHtml abaixo).
    function chartLegendDefaultHtml() {
      return '<span><i class="sa3mob-chart-legend-bar"></i>Realizado</span><span><i class="sa3mob-chart-legend-line"></i>Meta mensal</span>';
    }

    // Ao tocar numa coluna, a legenda troca pra mostrar mês/real/meta/var
    // daquele mês (pedido do usuário, 2026-09-02: "ao colocar o dedo sobre
    // a coluna, mostrar a legenda") — mesmos 3 valores do tooltip de hover
    // do desktop (bindKpiChartTooltips), só que fixo na legenda (sem
    // popover flutuante, que tampa o gráfico embaixo do dedo no touch).
    function chartLegendTapHtml(col) {
      return '<span class="sa3mob-chart-legend-month">' + escapeHtml(col.dataset.chartMonth) + "</span>" +
        '<span class="sa3mob-chart-legend-stat">Real <b>' + escapeHtml(col.dataset.chartReal) + "</b></span>" +
        '<span class="sa3mob-chart-legend-stat">Meta <b>' + escapeHtml(col.dataset.chartMeta) + "</b></span>" +
        '<span class="sa3mob-chart-legend-stat">Var <b>' + escapeHtml(col.dataset.chartVariation) + "</b></span>";
    }

    function kpiChartHtml(k, cutoffMonth) {
      const { zeroY, bars, targetLine } = DATA.buildKpiChartSeries(k, cutoffMonth);
      const isRange = k.comparisonMode === "range";
      const metaLabel = (bar) => isRange
        ? formatByUnit(bar.targetMin, k.unit, k.decimalPlaces) + "–" + formatByUnit(bar.targetMax, k.unit, k.decimalPlaces)
        : formatByUnit(bar.targetValue, k.unit, k.decimalPlaces);
      const barsHtml = bars.map((bar) => (
        '<div class="sa3mob-chart-col" data-chart-has-real="' + bar.hasReal + '" data-chart-month="' + bar.label + '" data-chart-real="' + escapeHtml(formatByUnit(bar.value, k.unit, k.decimalPlaces)) + '" data-chart-meta="' + escapeHtml(metaLabel(bar)) + '" data-chart-variation="' + escapeHtml(bar.variation) + '">' +
        (bar.hasReal ? '<div class="sa3mob-chart-bar ' + bar.tone + '" style="top:' + bar.top + '%;height:' + bar.height + '%"></div>' : "") +
        "</div>"
      )).join("");
      const segmentsHtml = (segments, extraClass) => {
        const cls = extraClass || "";
        const paths = segments.paths.map((d) => '<path class="sa3mob-chart-line ' + cls + '" d="' + d + '"></path>').join("");
        const dots = segments.points.map((p) => '<circle class="sa3mob-chart-point ' + cls + '" cx="' + p.x + '" cy="' + p.y + '" r="2.6"></circle>').join("");
        return paths + dots;
      };
      const lineHtml = isRange
        ? segmentsHtml(targetLine.min, "band") + segmentsHtml(targetLine.max, "band")
        : segmentsHtml(targetLine.main);
      const monthsHtml = MONTH_ABBR.map((label) => '<span class="sa3mob-chart-month">' + label + "</span>").join("");
      return '<div class="sa3mob-chart" role="img" aria-label="Gráfico de realizado mensal em colunas e meta mensal em linha. Toque numa coluna pra ver o valor do mês.">' +
        '<div class="sa3mob-chart-plot"><div class="sa3mob-chart-zero" style="top:' + zeroY + '%"></div>' +
        '<div class="sa3mob-chart-bars">' + barsHtml + "</div>" +
        '<svg class="sa3mob-chart-svg" viewBox="0 0 1200 100" preserveAspectRatio="none" aria-hidden="true">' + lineHtml + "</svg></div>" +
        '<div class="sa3mob-chart-months">' + monthsHtml + "</div>" +
        '<div class="sa3mob-chart-legend" data-chart-legend aria-live="polite">' + chartLegendDefaultHtml() + "</div>" +
        "</div>";
    }

    function statusPillHtml(status) {
      const meta = STATUS_META[status] || STATUS_META.not_available;
      const color = TONE_COLOR[meta.tone] || "var(--vmob-faint)";
      return '<span class="sa3mob-pill" style="background:color-mix(in srgb, ' + color + ' 16%, transparent); color:' + color + '">' + escapeHtml(meta.label) + "</span>";
    }

    function actionPillHtml(status) {
      const label = (ACTION_STATUS_OPTIONS.find((o) => o.value === status) || {}).label || status;
      const tone = ACTION_STATUS_TONE[status] || "muted";
      const color = TONE_COLOR[tone] || "var(--vmob-faint)";
      const strike = tone === "cancel" ? "text-decoration:line-through;" : "";
      return '<span class="sa3mob-pill" style="' + strike + 'background:color-mix(in srgb, ' + color + ' 16%, transparent); color:' + color + '">' + escapeHtml(label) + "</span>";
    }

    // ---------------------------------------------------------------- telas

    function screenOverview() {
      const north = overview?.northGoals || [];
      const areas = overview?.areas || [];
      const northRows = north.map((g) => (
        '<div class="sa3mob-north-row"><span class="sa3mob-north-title">' + escapeHtml(g.title) + '</span><span class="sa3mob-north-value">' + escapeHtml(g.targetLabel || "—") + "</span></div>"
      )).join("");

      const areaRows = areas.map((a) => {
        const total = a.totalKpis || 0;
        const onTarget = a.onTargetCount || 0;
        // "Sem dado" (not_available) sai do denominador -- mesma regra do
        // desktop (renderOverviewScreen).
        const withData = total - (a.notAvailableCount || 0);
        const ratio = withData ? onTarget / withData : null;
        const tone = ratio === null ? "muted" : ratio === 1 ? "pos" : "neg";
        const color = TONE_COLOR[tone] || "var(--vmob-faint)";
        const sub = total + " indicador" + (total === 1 ? "" : "es") +
          (a.childrenCount ? (" &middot; " + a.childrenCount + " A3 filho" + (a.childrenCount === 1 ? "" : "s")) : "");
        const pillLabel = ratio === null ? "Sem dado" : (onTarget + "/" + withData + " dentro da meta");
        return '<button type="button" class="sa3mob-area-row" style="--vmob-card-accent:' + escapeHtml(a.color || "#4f7cff") + '" data-action="open-detail" data-a3-id="' + escapeHtml(a.id) + '">' +
          '<span class="sa3mob-area-icon">' + escapeHtml((a.name || "?").slice(0, 1)) + "</span>" +
          '<span class="sa3mob-area-id"><span class="sa3mob-area-name">A3 ' + escapeHtml(a.name) + '</span><span class="sa3mob-area-sub">' + sub + "</span></span>" +
          '<span class="sa3mob-pill" style="background:color-mix(in srgb, ' + color + ' 16%, transparent); color:' + color + '">' + pillLabel + "</span>" +
          '<svg class="vmob-chev" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          "</button>";
      }).join("");

      return '<div class="vmob-crumbbar">' +
        '<h2 class="vmob-level-title vmob-level-title-center" tabindex="-1">A3 Estratégicos</h2>' +
        periodTriggerHtml() + "</div>" +
        '<div class="vmob-section"><div class="vmob-card sa3mob-card-north"><div class="vmob-section-head"><span class="vmob-section-title">Norte Verdadeiro</span></div>' +
        '<div class="sa3mob-north-grid">' + (northRows || '<p class="vmob-empty" style="padding:8px 0">Nenhuma meta cadastrada.</p>') + "</div></div></div>" +
        '<div class="vmob-section"><div class="vmob-section-head"><span class="vmob-section-title">Áreas</span><span class="vmob-section-count">' + areas.length + "</span></div>" +
        '<div class="sa3mob-area-list">' + (areaRows || '<p class="vmob-empty">Nenhuma área cadastrada pra este ciclo.</p>') + "</div></div>";
    }

    function crumbHtml() {
      const parts = [{ label: "A3 Estratégicos", action: "back-overview" }];
      if (a3Detail?.a3) parts.push({ label: a3Detail.a3.name, action: null });
      const html = parts.map((p, i) => {
        const isLast = i === parts.length - 1;
        if (isLast) return '<span class="sa3mob-crumb-current" aria-current="page" tabindex="-1">' + escapeHtml(p.label) + "</span>";
        return '<button type="button" data-action="' + p.action + '">' + escapeHtml(p.label) + '</button><span class="sa3mob-crumb-sep">&rsaquo;</span>';
      }).join("");
      return '<nav class="sa3mob-crumb" aria-label="Caminho de navegação">' + html + "</nav>";
    }

    function tabsHtml() {
      if (!a3Children.length) return "";
      const rootName = (a3Detail?.a3?.id === a3RootId ? a3Detail.a3.name : null) || "Consolidado";
      const rootLabel = a3Detail?.children?.length ? "Consolidado" : rootName;
      const tabs = [{ id: a3RootId, name: rootLabel }].concat(a3Children.map((c) => ({ id: c.id, name: c.name })));
      return '<div class="sa3mob-tabs">' + tabs.map((t) => (
        '<button type="button" class="sa3mob-tab' + (t.id === activeA3Id ? " is-active" : "") + '" data-action="switch-tab" data-a3-id="' + escapeHtml(t.id) + '">' + escapeHtml(t.name) + "</button>"
      )).join("") + "</div>";
    }

    function kpiCardHtml(k) {
      const target = k.currentTarget || {};
      const opts = { unit: k.unit, comparisonMode: k.comparisonMode };
      const kpiActions = actionsForKpi(k.id);
      const actionsHtml = kpiActions.length
        ? kpiActions.map((a) => {
            const ownerNames = (a.strategic_action_owners || []).map((o) => ownerNameById(o.user_id)).filter(Boolean);
            const metaParts = [];
            if (a.due_date) metaParts.push(escapeHtml(a.due_date));
            if (a.priority) metaParts.push(escapeHtml(a.priority));
            if (a.progress !== null && a.progress !== undefined) metaParts.push(a.progress + "%");
            if (ownerNames.length) metaParts.push(escapeHtml(ownerNames.join(", ")));
            return '<div class="sa3mob-action-row"><div class="sa3mob-action-title">' + escapeHtml(a.title) + "</div>" +
              (metaParts.length ? ('<div class="sa3mob-action-meta">' + metaParts.join(" &middot; ") + "</div>") : "") +
              '<div class="sa3mob-action-foot">' + actionPillHtml(a.status) + "</div></div>";
          }).join("")
        : '<p class="vmob-empty" style="padding:6px 0">Nenhuma ação registrada.</p>';

      return '<div class="vmob-card sa3mob-kpi-card">' +
        '<div class="sa3mob-kpi-head"><span class="sa3mob-kpi-name">' + escapeHtml(k.name) + "</span>" + statusPillHtml(k.status) + "</div>" +
        '<div class="sa3mob-kpi-metrics">' +
        '<div><span class="sa3mob-metric-lbl">Real do mês</span><span class="sa3mob-metric-val">' + formatByUnit(k.currentResult, k.unit, k.decimalPlaces) + "</span></div>" +
        '<div><span class="sa3mob-metric-lbl">Meta do mês</span><span class="sa3mob-metric-val">' + formatByUnit(target.value, k.unit, k.decimalPlaces) + "</span></div>" +
        '<div><span class="sa3mob-metric-lbl">Variação</span><span class="sa3mob-metric-val">' + formatTargetVariation(k.currentResult, target.value, opts) + "</span></div>" +
        "</div>" +
        kpiChartHtml(k, month) +
        '<div class="sa3mob-kpi-acc"><span>Acumulado no ano</span><span><b>' + formatByUnit(k.accumulatedResult, k.unit, k.decimalPlaces) + '</b> / meta ' + formatByUnit(k.accumulatedTarget, k.unit, k.decimalPlaces) + "</span></div>" +
        '<div class="sa3mob-plan"><div class="sa3mob-plan-title"><span>Plano de ação</span><span>' + kpiActions.length + "</span></div>" + actionsHtml + "</div>" +
        "</div>";
    }

    function screenDetail() {
      const a3 = a3Detail?.a3;
      if (!a3) return screenEmpty();
      const kpis = a3Detail?.kpis || [];
      const kpisHtml = kpis.length
        ? kpis.map((k) => kpiCardHtml(k)).join("")
        : '<p class="vmob-empty">Nenhum indicador cadastrado nesta A3.</p>';
      return '<div class="vmob-crumbbar">' + crumbHtml() +
        '<h2 class="vmob-level-title vmob-level-title-center" tabindex="-1">A3 ' + escapeHtml(a3.name) + "</h2>" +
        periodTriggerHtml() + tabsHtml() +
        (a3.objective ? ('<div class="sa3mob-objective-box" style="--sa3mob-objective-accent:' + escapeHtml(a3.color || "#4f7cff") + '"><p class="sa3mob-objective">' + escapeHtml(a3.objective) + "</p></div>") : "") +
        "</div>" +
        '<div class="vmob-section"><div class="vmob-section-head"><span class="vmob-section-title">Indicadores</span><span class="vmob-section-count">' + kpis.length + "</span></div>" +
        '<div class="sa3mob-kpi-list">' + kpisHtml + "</div></div>";
    }

    function screenEmpty() {
      return '<div class="vmob-crumbbar">' + crumbHtml() + "</div>" +
        '<p class="vmob-empty">A3 não encontrada ou sem acesso.</p>';
    }

    function screenLoading() {
      return '<div class="vmob-loading"><div class="vmob-loading-spinner"></div><span>Carregando seus dados...</span></div>';
    }

    function screenError() {
      return '<div class="vmob-crumbbar">' + (screen === "detail" ? crumbHtml() : "") + "</div>" +
        '<p class="vmob-empty">' + escapeHtml(error) + "</p>" +
        '<div style="text-align:center"><button type="button" class="vmob-state-btn" data-action="retry">Tentar de novo</button></div>';
    }

    // ---------------------------------------------------------------- render raiz + eventos

    function render() {
      if (!containerEl) return;
      ensureStyle();
      let html;
      if (loading && !((screen === "overview" && overview) || (screen === "detail" && a3Detail))) html = screenLoading();
      else if (error) html = screenError();
      else if (screen === "detail") html = screenDetail();
      else html = screenOverview();
      containerEl.innerHTML = '<div class="sa3mob">' + html + "</div>";
    }

    function afterNav() {
      render();
      const title = containerEl && containerEl.querySelector(".vmob-level-title, .sa3mob-crumb-current");
      if (title) title.focus();
    }

    function reloadCurrentScreen() {
      if (screen === "detail" && activeA3Id) loadDetail(activeA3Id, activeA3Id === a3RootId);
      else loadOverview();
    }

    // Toque numa coluna do gráfico (tap = click num browser mobile, sem
    // precisar de pointer/touch events dedicados) -- mostra mês/real/meta/
    // var na legenda do próprio gráfico; tocar de novo na mesma coluna (ou
    // numa sem dado) devolve a legenda padrão (swatches Realizado/Meta).
    function handleChartColTap(col) {
      if (!containerEl || !containerEl.contains(col)) return;
      const chart = col.closest(".sa3mob-chart");
      const legend = chart?.querySelector("[data-chart-legend]");
      if (!legend) return;
      const wasActive = col.classList.contains("is-active");
      chart.querySelectorAll(".sa3mob-chart-col.is-active").forEach((c) => c.classList.remove("is-active"));
      if (wasActive || col.dataset.chartHasReal !== "true") {
        legend.innerHTML = chartLegendDefaultHtml();
        return;
      }
      col.classList.add("is-active");
      legend.innerHTML = chartLegendTapHtml(col);
    }

    function handleClick(event) {
      const chartCol = event.target.closest(".sa3mob-chart-col");
      if (chartCol) { handleChartColTap(chartCol); return; }
      const el = event.target.closest("[data-action]");
      if (!el || !containerEl || !containerEl.contains(el)) return;
      const action = el.dataset.action;
      if (action === "open-detail") { loadDetail(el.dataset.a3Id, true); }
      else if (action === "back-overview") { screen = "overview"; a3Detail = null; a3RootId = null; a3Children = []; activeA3Id = null; afterNav(); if (loadedOverviewKey !== periodKey()) loadOverview(); }
      else if (action === "switch-tab") { if (el.dataset.a3Id !== activeA3Id) loadDetail(el.dataset.a3Id, false); }
      else if (action === "toggle-period-list") {
        periodListOpen = !periodListOpen;
        if (periodListOpen) pickerYear = year; // reabre sempre a partir do ano atual
        render();
      }
      else if (action === "close-period-list") { periodListOpen = false; render(); }
      else if (action === "period-year") { pickerYear = (pickerYear || year) + Number(el.dataset.dir); render(); }
      else if (action === "select-month") {
        const newYear = pickerYear || year;
        const newMonth = Number(el.dataset.m);
        periodListOpen = false;
        if (newYear === year && newMonth === month) { render(); return; } // nada mudou, evita refetch à toa
        year = newYear; month = newMonth;
        reloadCurrentScreen();
      }
      else if (action === "retry") { error = ""; reloadCurrentScreen(); }
    }

    // ---------------------------------------------------------------- public

    function mount(container) {
      containerEl = container;
      if (!entered) {
        const today = new Date();
        year = today.getFullYear();
        month = today.getMonth() + 1;
        screen = "overview";
        overview = null; a3Detail = null; a3RootId = null; a3Children = []; activeA3Id = null;
        actions = []; orgUsers = null; error = "";
        periodListOpen = false; pickerYear = null;
        entered = true;
      }
      containerEl.removeEventListener("click", handleClick);
      containerEl.addEventListener("click", handleClick);
      if (screen === "detail" && activeA3Id) {
        if (loadedDetailKey === periodKey() && a3Detail) render();
        else loadDetail(activeA3Id, activeA3Id === a3RootId);
      } else if (loadedOverviewKey === periodKey() && overview) {
        render();
      } else {
        loadOverview();
      }
    }

    function unmount() {
      if (containerEl) containerEl.removeEventListener("click", handleClick);
      containerEl = null;
      entered = false;
    }

    return { mount, unmount };
  }

  window.VECTON_STRATEGIC_MOBILE = { createStrategicMobileModule };
})(window);
