(function attachVectonComercialPainelMobile(window) {
  // Painel de Vendas — versão mobile. Consome o MESMO modelo de dados do
  // desktop (comercialPainelDataModule.js: transform/coordTotals/companyTotals/
  // buildCoordDetail) e a MESMA RPC comercial_painel_vendas — nenhuma soma
  // nova aqui. O que muda é só a apresentação: Matriz Brasil restrita a
  // Fatur./Fat.+Cart./Meta (sem colunas de ano anterior), cards de coordenação
  // em grid 2 colunas, território como mini-matriz completa, cenário em
  // lista. Ver o protótipo (Artifact "Painel de Vendas Mobile") pro desenho
  // de referência — este módulo é a versão real, ligada à RPC.
  function createComercialPainelMobileModule(deps) {
    const {
      resolveOrganizationId,
      fetchSupabaseRowsSafe,
      callSupabaseRpc,
      isSupabaseConfigured
    } = deps;
    const DATA = window.VECTON_COMERCIAL_PAINEL_DATA;
    const {
      COORD_STYLE, COORD_ORDER,
      transform, coordTotals, companyTotals, buildCoordDetail, coordCardDelta,
      pecasVendLines,
      nf, fmtR$, fmtFullR$
    } = DATA;

    // Formatação de moeda SÓ do mobile: a partir de R$ 1 milhão, "R$ X.XXX
    // mil" (fmtR$ do desktop) estoura a largura das colunas em telas
    // estreitas (iPhone) e sobrepõe FATUR./FAT.+CART./META -- vira "R$ X,XX
    // M". Abaixo de 1 milhão continua igual ao desktop (fmtR$ padrão).
    function fmtR$Mobile(v) {
      const val = v || 0;
      if (Math.abs(val) < 1000000) return fmtR$(val);
      const mi = val / 1000000;
      return "R$ " + mi.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " M";
    }

    const REPORT_ID = "comercialPainel";

    let containerEl = null;
    let enteredPainel = false;
    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;
    let coords = [], regioes = [], tipos = [];
    let pecasVend = []; // [{bucket:'titular'|'demais', cod_vendedor, vendedor, fat_val, cart_val, ...}] (087) -- ver pecasVendLines
    let loading = false, loadedKey = null;
    let scenarios = [], scenarioUserSet = false;

    let ui = {
      level: "brasil", coordKey: null,
      periodMode: "mes", scenarioId: null,
      filtersOpen: false, cenarioListOpen: false, periodListOpen: false, pickerYear: null
    };

    // ---------------------------------------------------------------- CSS

    function ensureStyle() {
      if (document.getElementById("vmob-pv-style")) return;
      const s = document.createElement("style");
      s.id = "vmob-pv-style";
      s.textContent = `
        .vmob-pv { font-variant-numeric: tabular-nums; }
        /* .vmob-crumbbar/.vmob-level-title/.vmob-level-sub/.vmob-section*/
           .vmob-card base ficam em styles.css -- compartilhados com o Menu
           mobile (mobileShellModule.js), que renderiza ANTES deste módulo
           montar (senão a tela de Menu ficaria sem estilo no 1º load). */
        .vmob-crumb { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; flex-wrap:wrap; margin-bottom:6px; }
        .vmob-crumb button { all:unset; color:var(--vmob-faint); cursor:pointer; padding:2px 1px; }
        .vmob-crumb button:hover { color:var(--vmob-soft); }
        .vmob-crumb .vmob-crumb-current { color:var(--vmob-text); }
        .vmob-crumb-sep { color:var(--vmob-faint); }

        .vmob-filters { margin-top:12px; background:var(--vmob-panel); border:1px solid var(--vmob-line); border-radius:14px; overflow:hidden; }
        .vmob-filters-summary { all:unset; box-sizing:border-box; display:flex; align-items:center; justify-content:space-between; width:100%; padding:10px 12px; cursor:pointer; font-size:12.5px; color:var(--vmob-soft); }
        .vmob-filters-summary b { color:var(--vmob-text); font-weight:700; }
        .vmob-filters-summary svg { transition:transform 160ms ease; color:var(--vmob-faint); flex-shrink:0; }
        .vmob-filters.is-open .vmob-filters-summary svg { transform:rotate(180deg); }
        .vmob-filters-body { display:none; padding:0 12px 12px; flex-direction:column; gap:10px; }
        .vmob-filters.is-open .vmob-filters-body { display:flex; }
        .vmob-filter-row { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .vmob-filter-label { font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--vmob-faint); }
        .vmob-segmented { display:flex; background:var(--vmob-bg); border:1px solid var(--vmob-line); border-radius:9px; padding:2px; gap:2px; }
        .vmob-segmented button { all:unset; box-sizing:border-box; padding:6px 11px; font-size:12.5px; font-weight:600; color:var(--vmob-soft); border-radius:7px; cursor:pointer; }
        .vmob-segmented button.is-active { background:var(--vmob-accent); color:#fff; }
        .vmob-cenario-trigger { all:unset; box-sizing:border-box; display:flex; align-items:center; gap:6px; padding:6px 10px; border-radius:9px; border:1px solid var(--vmob-line); background:var(--vmob-bg); color:var(--vmob-text); font-size:12.5px; font-weight:700; cursor:pointer; max-width:65%; }
        .vmob-cenario-trigger span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .vmob-cenario-chev { color:var(--vmob-faint); transition:transform 160ms ease; flex-shrink:0; }
        .vmob-cenario-trigger[aria-expanded="true"] .vmob-cenario-chev { transform:rotate(180deg); }
        .vmob-cenario-list { display:none; flex-direction:column; margin-top:6px; border:1px solid var(--vmob-line); border-radius:10px; overflow:hidden; }
        .vmob-cenario-list.is-open { display:flex; }
        .vmob-cenario-item { all:unset; box-sizing:border-box; display:flex; align-items:center; justify-content:space-between; width:100%; padding:10px 12px; font-size:13px; color:var(--vmob-soft); cursor:pointer; background:var(--vmob-bg); }
        .vmob-cenario-item + .vmob-cenario-item { border-top:1px solid var(--vmob-line); }
        .vmob-cenario-item:active { background:var(--vmob-panel-elevated); }
        .vmob-cenario-item.is-selected { color:var(--vmob-accent); font-weight:700; background:var(--vmob-accent-soft); }

        /* Seletor de período: modal centralizado (mesmo desenho do popover de
           período do desktop), não painel inline -- fica curto/proporcional,
           nunca ocupando quase a tela toda. */
        .vmob-period-modal-backdrop { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:90; }
        .vmob-period-modal-backdrop.is-open { display:block; }
        .vmob-period-modal { display:none; position:fixed; inset:0; z-index:91; align-items:center; justify-content:center; padding:28px; pointer-events:none; }
        .vmob-period-modal.is-open { display:flex; }
        .vmob-period-modal-card { pointer-events:auto; width:100%; max-width:272px; background:var(--vmob-panel-elevated); border:1px solid var(--vmob-line); border-radius:18px; padding:16px 16px 14px; box-shadow:0 24px 60px rgba(0,0,0,0.5); }
        .vmob-period-modal-head { display:flex; align-items:center; justify-content:center; gap:24px; }
        .vmob-period-modal-head button { all:unset; box-sizing:border-box; width:28px; height:28px; display:grid; place-items:center; border-radius:9px; color:var(--vmob-soft); cursor:pointer; font-size:18px; }
        .vmob-period-modal-head button:active { background:var(--vmob-panel); }
        .vmob-period-modal-year { font-size:15px; font-weight:800; color:var(--vmob-text); min-width:46px; text-align:center; }
        .vmob-period-modal-sub { margin:8px 2px 14px; font-size:11.5px; line-height:1.5; color:var(--vmob-accent); text-align:center; }
        .vmob-month-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
        .vmob-month-item { all:unset; box-sizing:border-box; text-align:center; padding:10px 0; font-size:12.5px; font-weight:600; color:var(--vmob-soft); border-radius:10px; cursor:pointer; background:var(--vmob-bg); border:1px solid transparent; }
        .vmob-month-item:active { background:var(--vmob-panel); }
        .vmob-month-item.is-selected { background:var(--vmob-accent); color:#fff; }

        .vmob-matrix { width:100%; border-collapse:collapse; }
        .vmob-matrix th { text-align:right; font-size:10.5px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:var(--vmob-faint); padding:0 0 8px; }
        .vmob-matrix th:first-child { text-align:left; }
        .vmob-matrix td { padding:8px 0; font-size:13px; text-align:right; border-top:1px solid var(--vmob-line); }
        .vmob-matrix td:first-child { text-align:left; color:var(--vmob-soft); font-weight:600; }
        .vmob-matrix tr.vmob-row-total td { font-weight:800; color:var(--vmob-text); border-top:1px solid rgba(255,255,255,0.16); }
        .vmob-matrix tr.vmob-row-sub td { color:var(--vmob-faint); font-weight:400; }
        .vmob-matrix tr.vmob-row-tkt td { color:var(--vmob-faint); }
        .vmob-matrix tr.vmob-row-tkt td:first-child { font-weight:500; }
        .vmob-matrix tr.vmob-row-memo td { font-style:italic; color:var(--vmob-faint); }
        .vmob-matrix .vmob-dash { color:var(--vmob-faint); }
        .vmob-matrix-wrap { overflow-x:auto; }
        .vmob-matrix-note { margin:8px 0 0; font-size:11px; color:var(--vmob-faint); line-height:1.5; }

        .vmob-matrix-card { border-left:3px solid var(--vmob-card-accent, var(--vmob-accent)); }
        .vmob-matrix-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:10px; flex-wrap:wrap; }
        .vmob-matrix-title { font-size:13px; font-weight:800; color:var(--vmob-text); }
        .vmob-matrix-sub { font-weight:500; color:var(--vmob-faint); font-size:11.5px; }
        .vmob-vsmeta { font-size:11px; font-weight:700; color:var(--vmob-soft); white-space:nowrap; display:inline-flex; align-items:center; gap:5px; }
        .vmob-vsmeta::before { content:""; width:7px; height:7px; border-radius:999px; background:var(--dot); box-shadow:0 0 0 3px color-mix(in srgb, var(--dot) 18%, transparent); flex-shrink:0; }

        .vmob-coord-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .vmob-coord-card { all:unset; box-sizing:border-box; display:flex; flex-direction:column; width:100%; min-width:0; background:var(--vmob-panel); border:1px solid var(--vmob-line); border-top:3px solid var(--vmob-card-accent, var(--vmob-accent)); border-radius:14px; padding:12px 11px; cursor:pointer; }
        .vmob-coord-card:active { background:var(--vmob-panel-elevated); }
        .vmob-card-top { display:flex; align-items:center; gap:8px; margin-bottom:9px; min-width:0; }
        .vmob-card-av { width:26px; height:26px; border-radius:8px; background:var(--vmob-card-accent, var(--vmob-accent)); color:#fff; flex-shrink:0; display:grid; place-items:center; font-size:10px; font-weight:800; }
        .vmob-card-id { min-width:0; overflow:hidden; }
        .vmob-card-name { display:block; font-size:12.5px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .vmob-card-gestor { display:block; font-size:10px; color:var(--vmob-faint); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .vmob-card-qty { font-size:17px; font-weight:800; }
        .vmob-card-u { font-size:11px; font-weight:600; color:var(--vmob-faint); }
        .vmob-card-sub { font-size:10px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:var(--vmob-faint); }
        .vmob-card-split { display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-top:6px; font-size:10.5px; color:var(--vmob-soft); }
        .vmob-card-split b { display:block; color:var(--vmob-text); font-size:11.5px; }
        .vmob-card-fat { display:flex; justify-content:space-between; align-items:baseline; margin-top:8px; padding-top:8px; border-top:1px solid var(--vmob-line); font-size:10.5px; color:var(--vmob-faint); }
        .vmob-card-fat span:last-child { font-size:13px; font-weight:800; color:var(--vmob-text); }
        .vmob-card-foot { display:flex; justify-content:space-between; align-items:baseline; margin-top:8px; font-size:10px; }
        .vmob-card-vs { color:var(--vmob-faint); font-weight:600; }
        .vmob-card-delta { font-weight:800; font-size:12px; }

        /* Lista de territórios: SEM borda ao redor (nem por território, nem
           no grupo todo) -- só as mesmas linhas finas de 1px que já separam
           as linhas dentro de cada mini-matriz (.vmob-matrix td), com o
           ajuste de cor: a linha que separa um território do próximo usa a
           cor da coordenação (--vmob-card-accent) em vez do cinza neutro
           (pedido do usuário, 2026-08-31 -- 2ª rodada, a 1ª ainda tinha
           virado uma "caixa" com borda/padding grande demais). */
        .vmob-matrix-flat { padding:12px 0; }
        .vmob-matrix-flat:first-child { padding-top:0; }
        .vmob-matrix-flat + .vmob-matrix-flat { padding-top:20px; border-top:1px solid var(--vmob-card-accent, var(--vmob-accent)); }
        /* .vmob-chev fica em styles.css (usado também pelo Menu mobile) */

        .vmob-empty { padding:40px 20px; text-align:center; color:var(--vmob-faint); font-size:13px; line-height:1.6; }

        /* Carregamento inicial do módulo -- mesmo desenho do overlay de login
           (app-loading-spinner em styles.css: anel girando + texto), só que
           inline no lugar do "Carregando…" em texto puro que tinha antes. */
        .vmob-loading { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; min-height:60vh; padding:20px; color:var(--vmob-faint); font-size:13px; text-align:center; }
        .vmob-loading-spinner { width:34px; height:34px; border-radius:50%; border:3px solid rgba(255,255,255,0.12); border-top-color:var(--vmob-accent); animation:app-loading-spin 0.8s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .vmob-loading-spinner { animation:none; } }
      `;
      document.head.appendChild(s);
    }

    // ---------------------------------------------------------------- data

    function paramsKey() { return `${year}|${month}|${ui.periodMode}|${ui.scenarioId || "budget"}`; }

    async function loadScenarios() {
      scenarios = [];
      if (isSupabaseConfigured()) {
        try {
          const org = await resolveOrganizationId();
          const rows = await fetchSupabaseRowsSafe("forecast_scenarios", `organization_id=eq.${org}&reference_year=eq.${year}&order=created_at.asc&select=id,name`);
          scenarios = rows || [];
        } catch (e) { console.warn("cenarios (mobile):", e); scenarios = []; }
      }
      const stillExists = ui.scenarioId && scenarios.some((s) => s.id === ui.scenarioId);
      if ((!scenarioUserSet && !ui.scenarioId) || (ui.scenarioId && !stillExists)) {
        const fcst = scenarios.find((s) => /fcst|5\s*\+\s*7/i.test(s.name));
        ui.scenarioId = (fcst || scenarios[0])?.id || null;
      }
    }

    async function loadData() {
      loading = true;
      await loadScenarios();
      let rows = [], tiposRows = [], pecasVendRows = [];
      if (isSupabaseConfigured()) {
        const org = await resolveOrganizationId();
        const payload = { p_org: org, p_year: year, p_month: month, p_period: ui.periodMode, p_scenario_id: ui.scenarioId };
        // Quebra de Peças por vendedor (087), mesma RPC do desktop -- sem
        // p_scenario_id: a meta não é quebrada, o detalhe do titular
        // reaproveita a meta consolidada. Tolera 404 (migration ainda não
        // aplicada) -> screenCoord("Peças") cai no formato antigo por
        // território em vez de quebrar o painel inteiro.
        const { p_scenario_id, ...pecasPayload } = payload;
        [rows, tiposRows, pecasVendRows] = await Promise.all([
          callSupabaseRpc("comercial_painel_vendas", payload),
          callSupabaseRpc("comercial_painel_tipos", payload),
          callSupabaseRpc("comercial_painel_pecas_vendedor", pecasPayload)
            .catch((e) => { console.warn("pecas por vendedor indisponivel (mobile):", e); return []; })
        ]);
      }
      const tr = transform(rows || []);
      coords = tr.coords;
      regioes = tr.regioes;
      tipos = tiposRows || [];
      pecasVend = pecasVendRows || [];
      loadedKey = paramsKey();
      loading = false;
      if (ui.level !== "brasil" && (!ui.coordKey || !coords.some((c) => c.nome === ui.coordKey))) {
        ui.level = "brasil"; ui.coordKey = null;
      }
    }

    // ---------------------------------------------------------------- formatação

    function isBlank(v) { return v === null || v === undefined || (typeof v === "number" && isNaN(v)); }
    function cellQty(v) { return isBlank(v) ? '<span class="vmob-dash">—</span>' : nf(v) + " un"; }
    function cellVal(v) { return isBlank(v) ? '<span class="vmob-dash">—</span>' : fmtR$Mobile(v); }
    function tdQty(v) { return "<td>" + cellQty(v) + "</td>"; }
    function tdVal(v) { const t = isBlank(v) ? "" : fmtFullR$(v); return '<td title="' + t + '">' + cellVal(v) + "</td>"; }

    // linha "flat" (companyTotals: grao/pec/fatv/graoVal/pecVal já são {fat,cart,meta,...} escalares)
    function rowFlat(label, obj, tdFn, cls) {
      const v = (m) => obj ? obj[m] : null;
      return "<tr" + (cls ? ' class="' + cls + '"' : "") + "><td>" + label + "</td>" + tdFn(v("fat")) + tdFn(v("cart")) + tdFn(v("meta")) + "</tr>";
    }
    // linha "par" (metricObj: cada metrica é {q,v})
    function rowPairQty(label, obj, cls) {
      const v = (m) => obj ? obj[m].q : null;
      return "<tr" + (cls ? ' class="' + cls + '"' : "") + "><td>" + label + "</td>" + tdQty(v("fat")) + tdQty(v("cart")) + tdQty(v("meta")) + "</tr>";
    }
    function rowSumVal(label, lines, cls) {
      const v = (m) => lines.reduce((s, l) => s + (l ? l[m].v : 0), 0);
      return "<tr" + (cls ? ' class="' + cls + '"' : "") + "><td>" + label + "</td>" + tdVal(v("fat")) + tdVal(v("cart")) + tdVal(v("meta")) + "</tr>";
    }

    function vsMetaPill(cartVal, metaVal) {
      const pct = metaVal > 0 ? (cartVal / metaVal) * 100 : null;
      const color = pct === null ? "var(--vmob-faint)" : pct >= 100 ? "var(--vmob-positive)" : pct >= 80 ? "var(--vmob-warning)" : "var(--vmob-negative)";
      const label = pct === null ? "vs meta —" : "vs meta " + pct.toFixed(1) + "%";
      return '<span class="vmob-vsmeta" style="--dot:' + color + '">' + label + "</span>";
    }

    // ---------------------------------------------------------------- matrizes

    // Matriz Brasil: mesmas 7 linhas do hero desktop, só sem 2025/2024/2023.
    function renderHeroMatrix() {
      const tot = companyTotals(coords, tipos);
      const ticket = {};
      ["fat", "cart", "meta"].forEach((m) => {
        const q = tot.grao[m] + tot.pec[m];
        ticket[m] = q > 0 ? tot.fatv[m] / q : null;
      });
      const rows = rowFlat("Grão", tot.grao, tdQty) +
        rowFlat("Pecuária", tot.pec, tdQty) +
        rowFlat("TTL qtd", { fat: tot.grao.fat + tot.pec.fat, cart: tot.grao.cart + tot.pec.cart, meta: tot.grao.meta + tot.pec.meta }, tdQty, "vmob-row-sub") +
        rowFlat("Fatur. Grão", tot.graoVal, tdVal, "vmob-row-tkt") +
        rowFlat("Fatur. Pecuária", tot.pecVal, tdVal, "vmob-row-tkt") +
        rowFlat("Fatur. Total", tot.fatv, tdVal, "vmob-row-total") +
        rowFlat("Ticket Médio", ticket, tdVal, "vmob-row-tkt");
      const pill = vsMetaPill(tot.fatv.cart, tot.fatv.meta);
      return '<div class="vmob-card vmob-matrix-card"><div class="vmob-matrix-head"><span class="vmob-matrix-title">Marcher Brasil</span>' + pill + '</div>' +
        '<div class="vmob-matrix-wrap"><table class="vmob-matrix"><thead><tr><th></th><th>Fatur.</th><th>Fat.+Cart.</th><th>Meta</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>";
    }

    // Box Peças · Transgrain · Acessórios (mesma RPC comercial_painel_tipos do desktop).
    function renderTiposBox() {
      const order = ["Peças", "Transgrain", "Acessórios"];
      const byName = {};
      tipos.forEach((r) => { byName[r.tipo] = r; });
      const rows = order.map((nome) => {
        const r = byName[nome] || {};
        const line = { fat: Number(r.fat_val) || 0, cart: Number(r.cart_val) || 0, meta: Number(r.meta_val) || 0 };
        return rowFlat(nome, line, tdVal);
      }).join("");
      const tot = order.reduce((acc, nome) => {
        const r = byName[nome] || {};
        acc.fat += Number(r.fat_val) || 0; acc.cart += Number(r.cart_val) || 0; acc.meta += Number(r.meta_val) || 0;
        return acc;
      }, { fat: 0, cart: 0, meta: 0 });
      return '<div class="vmob-card"><div class="vmob-matrix-head"><span class="vmob-matrix-title">Peças &middot; Transgrain &middot; Acessórios</span></div>' +
        '<div class="vmob-matrix-wrap"><table class="vmob-matrix"><thead><tr><th></th><th>Fatur.</th><th>Fat.+Cart.</th><th>Meta</th></tr></thead><tbody>' +
        rows + rowFlat("Total", tot, tdVal, "vmob-row-total") + "</tbody></table></div></div>";
    }

    // Mini-matriz de coordenação/território (dado já vem pronto de buildCoordDetail).
    function renderMiniMatrix(opts) {
      const isPecas = !!opts.pecas;
      const valLines = isPecas ? [opts.pecas] : [opts.grao, opts.pec].filter(Boolean);
      const cartVal = valLines.reduce((s, l) => s + (l ? l.cart.v : 0), 0);
      const metaVal = valLines.reduce((s, l) => s + (l ? l.meta.v : 0), 0);

      let rowsHtml, memoFoot = "";
      if (isPecas) {
        rowsHtml = rowSumVal("Faturado", [opts.pecas], "vmob-row-total");
      } else {
        const memoLine = (!opts.pec && opts.memo) ? opts.memo.line : null;
        rowsHtml = rowPairQty("Grão", opts.grao) +
          rowPairQty(memoLine ? "Pecuária *" : "Pecuária", opts.pec || memoLine, memoLine ? "vmob-row-memo" : null) +
          rowFlat("TTL qtd", {
            fat: (opts.grao ? opts.grao.fat.q : 0) + (opts.pec ? opts.pec.fat.q : 0),
            cart: (opts.grao ? opts.grao.cart.q : 0) + (opts.pec ? opts.pec.cart.q : 0),
            meta: (opts.grao ? opts.grao.meta.q : 0) + (opts.pec ? opts.pec.meta.q : 0)
          }, tdQty, "vmob-row-sub") +
          rowSumVal("Faturado", valLines, "vmob-row-total") +
          rowFlat("Ticket", (() => {
            const t = {};
            ["fat", "cart", "meta"].forEach((m) => {
              const q = (opts.grao ? opts.grao[m].q : 0) + (opts.pec ? opts.pec[m].q : 0);
              const v = valLines.reduce((s, l) => s + (l ? l[m].v : 0), 0);
              t[m] = q > 0 ? v / q : null;
            });
            return t;
          })(), tdVal, "vmob-row-tkt");
        if (memoLine) {
          memoFoot = '<p class="vmob-matrix-note">* Pecuária da região &mdash; ilustrativo, consolidado em ' + (opts.memo.owner || "outra coordenação") + '. Fora do TTL, do Faturado e do vs meta.</p>';
        }
      }

      // "flat" (lista de territórios em screenCoord): sem virar card próprio
      // (sem fundo/borda/raio individuais) -- só o conteúdo, com a cor da
      // coordenação servindo de LINHA divisória entre um território e o
      // próximo (CSS `.vmob-matrix-flat + .vmob-matrix-flat`), nunca como
      // borda lateral de "card" (pedido do usuário, 2026-08-31).
      const cls = opts.flat ? "vmob-matrix-flat" : "vmob-card vmob-matrix-card";
      return '<div class="' + cls + '" style="--vmob-card-accent:' + (opts.accent || "var(--vmob-accent)") + '">' +
        '<div class="vmob-matrix-head"><span class="vmob-matrix-title">' + opts.title + (opts.sub ? (' <span class="vmob-matrix-sub">&middot; ' + opts.sub + "</span>") : "") + "</span>" + vsMetaPill(cartVal, metaVal) + "</div>" +
        '<div class="vmob-matrix-wrap"><table class="vmob-matrix"><thead><tr><th></th><th>Fatur.</th><th>Fat.+Cart.</th><th>Meta</th></tr></thead><tbody>' + rowsHtml + "</tbody></table></div>" +
        memoFoot +
        "</div>";
    }

    function coordCardHtml(nome) {
      const c = coords.find((x) => x.nome === nome);
      const accent = (COORD_STYLE[nome] || {}).accent || "#4f7cff";
      if (!c) {
        return '<div class="vmob-coord-card" style="--vmob-card-accent:' + accent + '"><div class="vmob-card-top"><span class="vmob-card-name">' + nome + '</span></div><div class="vmob-card-sub">Sem dados no período</div></div>';
      }
      const t = coordTotals(c);
      const initials = (c.gestor || c.nome).slice(0, 2).toUpperCase();
      const delta = coordCardDelta(c);
      const dPos = delta >= 0;

      let body;
      if (t.isPecas) {
        body = '<div class="vmob-card-sub">Faturado</div><div class="vmob-card-qty">' + fmtR$Mobile(t.val) + "</div>";
      } else {
        body = '<div class="vmob-card-qty">' + nf(t.grao + t.pec) + ' <span class="vmob-card-u">un</span></div>' +
          '<div class="vmob-card-split">' +
          (t.hasGrao ? ("<span>Grão <b>" + nf(t.grao) + "</b></span>") : "<span></span>") +
          (t.hasPec ? ("<span>Pecuária <b>" + nf(t.pec) + "</b></span>") : "<span></span>") +
          "</div>" +
          '<div class="vmob-card-fat"><span>Faturado</span><span>' + fmtR$Mobile(t.val) + "</span></div>";
      }

      return '<button type="button" class="vmob-coord-card" style="--vmob-card-accent:' + accent + '" data-action="open-coord" data-coord="' + nome + '">' +
        '<div class="vmob-card-top"><span class="vmob-card-av">' + initials + '</span><span class="vmob-card-id"><span class="vmob-card-name">' + nome + '</span><span class="vmob-card-gestor">Gestor ' + (c.gestor || "—") + "</span></span></div>" +
        body +
        '<div class="vmob-card-foot"><span class="vmob-card-vs">vs meta</span><span class="vmob-card-delta" style="color:' + (dPos ? "var(--vmob-positive)" : "var(--vmob-negative)") + '">' + (dPos ? "+" : "") + delta.toFixed(1) + "%</span></div>" +
        "</button>";
    }

    // ---------------------------------------------------------------- navegação/estado

    function crumb() {
      // Só 2 níveis (Painel de Vendas > coordenação) -- mobile não tem mais
      // o 3º nível de detalhe por território (2026-08-31), então o item da
      // coordenação é sempre o último/atual, nunca clicável de verdade.
      const parts = [{ label: "Painel de Vendas", action: "back-brasil" }];
      if (ui.coordKey) parts.push({ label: ui.coordKey, action: null });
      const html = parts.map((p, i) => {
        const isLast = i === parts.length - 1;
        if (isLast) return '<span class="vmob-crumb-current" aria-current="page" tabindex="-1">' + p.label + "</span>";
        return '<button type="button" data-action="' + p.action + '">' + p.label + '</button><span class="vmob-crumb-sep">&rsaquo;</span>';
      }).join("");
      return '<nav class="vmob-crumb" aria-label="Caminho de navegação">' + html + "</nav>";
    }

    function periodLabel() { return ui.periodMode === "ytd" ? "YTD " + year : monthAbbrev(month) + "/" + year; }
    function monthAbbrev(m) {
      return ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][m - 1] || "";
    }
    function cenarioLabel(id) {
      if (!id) return "Budget";
      const found = scenarios.find((s) => s.id === id);
      return found ? found.name : "Budget";
    }

    // Grade de mês/ano -- escolhe A QUE mês/ano o painel se refere (Mês exibe
    // esse mês; YTD acumula até ele). Sem isso não tinha como ver período
    // diferente do calendário de hoje no mobile (achado do usuário).
    function periodPickerHtml() {
      // pickerYear é o ano que a GRADE está mostrando (navegação livre com
      // ‹ ›); só vira o year "de verdade" quando um mês é clicado -- igual
      // ao period-popover do desktop, onde navegar ano não recarrega nada
      // sozinho.
      const gridYear = ui.pickerYear || year;
      const monthItems = Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
        const selected = m === month && gridYear === year;
        return '<button type="button" class="vmob-month-item' + (selected ? " is-selected" : "") + '" data-action="select-month" data-m="' + m + '">' + monthAbbrev(m) + "</button>";
      }).join("");
      return '<div class="vmob-filter-row"><span class="vmob-filter-label">Período</span>' +
        '<button type="button" class="vmob-cenario-trigger" aria-haspopup="true" aria-expanded="' + ui.periodListOpen + '" data-action="toggle-period-list">' +
        "<span>" + monthAbbrev(month) + "/" + year + "</span>" +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" class="vmob-cenario-chev"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        "</button></div>" +
        '<div class="vmob-period-modal-backdrop' + (ui.periodListOpen ? " is-open" : "") + '" data-action="close-period-list"></div>' +
        '<div class="vmob-period-modal' + (ui.periodListOpen ? " is-open" : "") + '" role="dialog" aria-modal="true" aria-label="Selecionar período">' +
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

    function filtersBlock() {
      const summary = periodLabel() + " · " + cenarioLabel(ui.scenarioId);
      const cenarioItems = [{ id: "", label: "Budget" }].concat(scenarios.map((s) => ({ id: s.id, label: s.name })))
        .map((c) => {
          const selected = (c.id || null) === (ui.scenarioId || null);
          return '<button type="button" class="vmob-cenario-item' + (selected ? " is-selected" : "") + '" data-action="select-cenario" data-id="' + c.id + '">' +
            "<span>" + c.label + "</span>" +
            (selected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' : "") +
            "</button>";
        }).join("");
      return '<div class="vmob-filters' + (ui.filtersOpen ? " is-open" : "") + '">' +
        '<button type="button" class="vmob-filters-summary" data-action="toggle-filters"><span>Filtros &middot; <b>' + summary + "</b></span>" +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<div class="vmob-filters-body">' +
        periodPickerHtml() +
        '<div class="vmob-filter-row"><span class="vmob-filter-label">Modo</span><div class="vmob-segmented">' +
        '<button type="button" class="' + (ui.periodMode === "mes" ? "is-active" : "") + '" data-action="set-period" data-mode="mes">Mês</button>' +
        '<button type="button" class="' + (ui.periodMode === "ytd" ? "is-active" : "") + '" data-action="set-period" data-mode="ytd">YTD</button>' +
        "</div></div>" +
        '<div class="vmob-filter-row"><span class="vmob-filter-label">Cenário</span>' +
        '<button type="button" class="vmob-cenario-trigger" aria-haspopup="true" aria-expanded="' + ui.cenarioListOpen + '" data-action="toggle-cenario-list">' +
        "<span>" + cenarioLabel(ui.scenarioId) + "</span>" +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" class="vmob-cenario-chev"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        "</button></div>" +
        // Modal centralizado -- mesmo padrão do seletor de período (backdrop +
        // card fixo no meio da tela), não mais dropdown inline abaixo do botão.
        '<div class="vmob-period-modal-backdrop' + (ui.cenarioListOpen ? " is-open" : "") + '" data-action="close-cenario-list"></div>' +
        '<div class="vmob-period-modal' + (ui.cenarioListOpen ? " is-open" : "") + '" role="dialog" aria-modal="true" aria-label="Selecionar cenário">' +
        '<div class="vmob-period-modal-card">' +
        '<div class="vmob-period-modal-head"><span class="vmob-period-modal-year">Cenário</span></div>' +
        '<p class="vmob-period-modal-sub">Selecione o cenário de referência da análise.</p>' +
        '<div class="vmob-cenario-list is-open" role="listbox">' + cenarioItems + "</div>" +
        "</div></div>" +
        "</div></div>";
    }

    // ---------------------------------------------------------------- telas

    function screenBrasil() {
      const cards = COORD_ORDER.map(coordCardHtml).join("");
      return '<div class="vmob-crumbbar">' +
        '<h2 class="vmob-level-title vmob-level-title-center" tabindex="-1">Painel de Vendas</h2>' +
        filtersBlock() + "</div>" +
        '<div class="vmob-section">' + renderHeroMatrix() + "</div>" +
        '<div class="vmob-section">' + renderTiposBox() + "</div>" +
        '<div class="vmob-section"><div class="vmob-section-head"><span class="vmob-section-title">Coordenações</span><span class="vmob-section-count">' + COORD_ORDER.length + "</span></div>" +
        '<div class="vmob-coord-grid">' + cards + "</div></div>";
    }

    function screenCoord() {
      const det = buildCoordDetail(ui.coordKey, coords, regioes);
      if (!det) return screenEmpty("Coordenação sem dados neste período.");
      const accent = (COORD_STYLE[ui.coordKey] || {}).accent || "#4f7cff";
      const consolidadoHtml = renderMiniMatrix({
        title: ui.coordKey.toUpperCase(), sub: "Gestor " + (det.coord.gestor || "—"), accent,
        grao: det.consolidado.grao, pec: det.consolidado.pec, pecas: det.consolidado.pecas, memo: det.consolidado.memo
      });
      // "Peças" abre por VENDEDOR (titular/Jenifer vs Demais), não por
      // território -- MESMA informação do desktop (renderDetail/isPecas em
      // reportsComercialPainelModule.js), só a aparência muda (2026-08-31).
      // Sem a migration 087 (pecasVendLines devolve []), cai no formato
      // antigo por território, igual ao desktop.
      const vendCards = det.isPecas ? pecasVendLines(det.consolidado.pecas, pecasVend) : [];
      const sectionLabel = vendCards.length ? "Por vendedor" : "Territórios";
      const items = vendCards.length
        ? vendCards.map((vc) => renderMiniMatrix({ title: vc.label, sub: vc.sub, accent, pecas: vc.line, flat: true }))
        : det.territorios.map((t) => renderMiniMatrix({
            title: t.terr, sub: t.resp || "Sem responsável definido", accent,
            grao: t.grao, pec: t.pec, pecas: t.pecas,
            flat: true
          }));
      const itemCount = vendCards.length || det.territorios.length;
      const terrHtml = items.join("") || '<p class="vmob-empty">Nenhum território com dado neste período.</p>';
      // Sem <h2> nem <p> de sub aqui -- ficariam redundantes com o "Sul" que
      // o breadcrumb já mostra e com a contagem no cabeçalho da seção logo
      // abaixo (2026-08-31).
      return '<div class="vmob-crumbbar">' + crumb() +
        filtersBlock() + "</div>" +
        '<div class="vmob-section">' + consolidadoHtml + "</div>" +
        '<div class="vmob-section"><div class="vmob-section-head"><span class="vmob-section-title">' + sectionLabel + '</span><span class="vmob-section-count">' + itemCount + "</span></div>" +
        '<div class="vmob-terr-list">' + terrHtml + "</div></div>";
    }

    function screenEmpty(msg) {
      return '<div class="vmob-crumbbar">' + crumb() + "</div>" +
        '<div class="vmob-empty">' + msg + "</div>";
    }

    function screenLoading() {
      return '<div class="vmob-loading"><div class="vmob-loading-spinner"></div><span>Carregando seus dados...</span></div>';
    }

    function screenNoData() {
      return '<div class="vmob-crumbbar">' + crumb() + '<h2 class="vmob-level-title">Sem dados</h2></div>' +
        '<div class="vmob-empty">Não há dados de vendas para este período e cenário.</div>';
    }

    // ---------------------------------------------------------------- render raiz + eventos

    function render() {
      if (!containerEl) return;
      ensureStyle();
      let html;
      if (loading && !coords.length) html = screenLoading();
      else if (!coords.length) html = screenNoData();
      else if (ui.level === "coord") html = screenCoord();
      else html = screenBrasil();
      containerEl.innerHTML = '<div class="vmob-pv">' + html + "</div>";
    }

    function afterNav() {
      render();
      // screenCoord não tem mais <h2> (redundante com o breadcrumb, 2026-08-31)
      // -- foca o item atual do breadcrumb como alvo de a11y equivalente.
      const title = containerEl && containerEl.querySelector(".vmob-level-title, .vmob-crumb-current");
      if (title) title.focus();
    }

    function handleClick(event) {
      const el = event.target.closest("[data-action]");
      if (!el || !containerEl || !containerEl.contains(el)) return;
      const action = el.dataset.action;
      if (action === "back-brasil") { ui.level = "brasil"; ui.coordKey = null; afterNav(); }
      else if (action === "open-coord") { ui.level = "coord"; ui.coordKey = el.dataset.coord; afterNav(); }
      else if (action === "toggle-filters") { ui.filtersOpen = !ui.filtersOpen; render(); }
      else if (action === "toggle-cenario-list") { ui.cenarioListOpen = !ui.cenarioListOpen; ui.periodListOpen = false; render(); }
      else if (action === "toggle-period-list") {
        ui.periodListOpen = !ui.periodListOpen;
        ui.cenarioListOpen = false;
        if (ui.periodListOpen) ui.pickerYear = year; // reabre sempre a partir do ano atual
        render();
      }
      else if (action === "close-period-list") { ui.periodListOpen = false; render(); }
      else if (action === "close-cenario-list") { ui.cenarioListOpen = false; render(); }
      else if (action === "period-year") { ui.pickerYear = (ui.pickerYear || year) + Number(el.dataset.dir); render(); }
      else if (action === "select-month") {
        const newYear = ui.pickerYear || year;
        const newMonth = Number(el.dataset.m);
        ui.periodListOpen = false;
        if (newYear === year && newMonth === month) { render(); return; } // nada mudou, evita refetch à toa
        if (newYear !== year) scenarioUserSet = false; // cenário "Fcst 5+7" pode não existir no ano novo
        year = newYear; month = newMonth;
        reloadAndRender();
      }
      else if (action === "set-period") { ui.periodMode = el.dataset.mode; reloadAndRender(); }
      else if (action === "select-cenario") {
        ui.scenarioId = el.dataset.id || null;
        ui.cenarioListOpen = false;
        scenarioUserSet = true;
        reloadAndRender();
      }
    }

    async function reloadAndRender() {
      loading = true; render();
      try { await loadData(); } catch (e) { console.error(e); }
      render();
    }

    // ---------------------------------------------------------------- public

    function mount(container) {
      containerEl = container;
      if (!enteredPainel) {
        const today = new Date();
        year = today.getFullYear();
        month = today.getMonth() + 1;
        ui = { level: "brasil", coordKey: null, periodMode: "mes", scenarioId: null, filtersOpen: false, cenarioListOpen: false, periodListOpen: false, pickerYear: null };
        enteredPainel = true;
      }
      containerEl.removeEventListener("click", handleClick);
      containerEl.addEventListener("click", handleClick);
      if (loadedKey === paramsKey() && coords.length) {
        render();
        loadData().then(render).catch((e) => console.error(e));
      } else {
        reloadAndRender();
      }
    }

    function unmount() {
      if (containerEl) containerEl.removeEventListener("click", handleClick);
      containerEl = null;
      enteredPainel = false;
    }

    return { REPORT_ID, mount, unmount };
  }

  window.VECTON_COMERCIAL_PAINEL_MOBILE = { createComercialPainelMobileModule };
})(window);
