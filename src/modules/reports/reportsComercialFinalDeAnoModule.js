(function attachVectonComercialFinalDeAno(window) {
  // Relatorio "Final de Ano" -- campanha ANUAL de atingimento de meta de
  // FATURAMENTO (R$), YTD (jan ate o mes do cabecalho), aberta a
  // Representantes Comerciais E vendedores internos -- ranking UNICO por
  // pessoa (sem separar Grao/Pecuaria). Consome a RPC
  // comercial_final_de_ano (agregacao server-side por responsavel, YTD).
  // Classes prefixadas cfa- pra nao colidir com o resto do app.
  function createComercialFinalDeAnoModule(deps) {
    const {
      escapeHtml,
      state,
      resolveOrganizationId,
      callSupabaseRpc,
      isSupabaseConfigured
    } = deps;

    const REPORT_ID = "comercialFinalDeAno";
    const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

    let year = Number(state.currentPeriod?.year || 2026);
    let month = Number(state.currentPeriod?.month || 6);
    let scenarioId = null;
    let scenarios = [];
    let scenarioUserSet = false;
    let rows = [];
    let loadedKey = null;
    let loading = false;

    // Sem seletor proprio de periodo -- segue sempre o toggle master do topo
    // do site (state.currentPeriod), igual Bateu,Levou. Mes = ate onde o
    // acumulado YTD vai (jan..mes sempre, nao so o mes isolado).
    function syncFromHeader() {
      year = Number(state.currentPeriod?.year || year);
      month = Number(state.currentPeriod?.month || month);
    }

    // ---------------------------------------------------------------- CSS

    function ensureStyle() {
      if (document.getElementById("cfa-style")) return;
      const s = document.createElement("style");
      s.id = "cfa-style";
      s.textContent = `
        .cfa { --cfa-bg:#09090a; --cfa-bg-soft:#0e0e10; --cfa-panel:#121317; --cfa-panel-hover:#191b20; --cfa-line:#2a2d34; --cfa-text:#fff; --cfa-soft:#a1a7b3; --cfa-faint:#6b7280; --cfa-pos:#22c55e; --cfa-neg:#f87171; --cfa-gold:#f5c518; color:var(--cfa-text); }
        .cfa * { box-sizing:border-box; }
        .cfa-header { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; flex-wrap:wrap; margin-bottom:18px; }
        .cfa-h1 { font-size:20px; font-weight:600; margin:0; }
        .cfa-kicker { font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--cfa-faint); margin:0 0 4px; }
        .cfa-controls { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .cfa-period { display:flex; align-items:center; gap:8px; background:var(--cfa-panel); border:1px solid var(--cfa-line); border-radius:12px; padding:6px 10px; }
        .cfa-period select { background:transparent; border:none; color:var(--cfa-text); font-size:13px; font-family:inherit; padding:6px 4px; outline:none; }
        .cfa-period .lbl { font-size:11px; color:var(--cfa-faint); text-transform:uppercase; letter-spacing:.04em; }
        .cfa-extrato-btn { border:1px solid var(--cfa-line); background:transparent; color:var(--cfa-soft); font-size:11px; font-weight:600; letter-spacing:.03em; text-transform:uppercase; padding:6px 12px; border-radius:8px; cursor:pointer; font-family:inherit; }
        .cfa-extrato-btn:hover { color:var(--cfa-text); border-color:#4f7cff; }
        .cfa-hero { display:flex; gap:14px; background:var(--cfa-panel); border:1px solid var(--cfa-line); border-radius:16px; padding:18px 22px; margin-bottom:24px; flex-wrap:wrap; }
        .cfa-hero-stat { min-width:120px; }
        .cfa-hero-label { font-size:11px; color:var(--cfa-faint); text-transform:uppercase; letter-spacing:.05em; margin:0 0 4px; }
        .cfa-hero-val { font-size:26px; font-weight:600; font-variant-numeric:tabular-nums; margin:0; }
        .cfa-hero-val.pos { color:var(--cfa-pos); }
        .cfa-hero-sep { width:1px; align-self:stretch; background:var(--cfa-line); }
        .cfa-section { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:22px 0 10px; }
        .cfa-section-title { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--cfa-faint); margin:0; }
        .cfa-board { background:var(--cfa-panel); border:1px solid var(--cfa-line); border-radius:16px; overflow:hidden; }
        .cfa-tbl-wrap { overflow-x:auto; }
        .cfa-tbl { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
        .cfa-tbl th, .cfa-tbl td { padding:9px 12px; font-size:12px; text-align:right; white-space:nowrap; }
        .cfa-tbl th:nth-child(1), .cfa-tbl td:nth-child(1) { text-align:center; width:32px; }
        .cfa-tbl th:nth-child(2), .cfa-tbl td:nth-child(2) { text-align:left; }
        .cfa-tbl th:nth-child(3), .cfa-tbl td:nth-child(3) { text-align:left; color:var(--cfa-faint); font-size:11px; white-space:normal; }
        .cfa-tbl th { color:var(--cfa-faint); font-weight:500; font-size:10px; text-transform:uppercase; letter-spacing:.03em; border-bottom:1px solid var(--cfa-line); }
        .cfa-tbl tbody tr:not(:last-child) td { border-bottom:1px solid rgba(255,255,255,.05); }
        .cfa-pos-num { color:var(--cfa-faint); font-weight:600; }
        .cfa-name { font-weight:600; }
        .cfa-row.lider { background:rgba(245,197,24,0.08); }
        .cfa-row.lider .cfa-pos-num { color:var(--cfa-gold); }
        .cfa-trophy { margin-right:4px; }
        .cfa-pct { font-weight:700; }
        .cfa-pct.pos { color:var(--cfa-pos); }
        .cfa-pct.neg { color:var(--cfa-neg); }
        .cfa-bar-wrap { width:64px; height:6px; border-radius:99px; background:var(--cfa-bg-soft); overflow:hidden; display:inline-block; vertical-align:middle; margin-right:8px; }
        .cfa-bar-fill { height:100%; border-radius:99px; }
        .cfa-empty { padding:40px; text-align:center; color:var(--cfa-faint); }
        .cfa-rules { margin-top:20px; background:var(--cfa-bg-soft); border:1px solid var(--cfa-line); border-radius:16px; padding:16px 20px; }
        .cfa-rules-title { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--cfa-faint); margin:0 0 10px; }
        .cfa-rules-title::before { content:"§"; color:var(--cfa-soft); font-weight:700; }
        .cfa-rules ol { margin:0; padding-left:18px; display:grid; gap:6px; }
        .cfa-rules li { font-size:12px; line-height:1.5; color:var(--cfa-soft); }
        .cfa-rules li b { color:var(--cfa-text); font-weight:600; }
        .cfa-pop-backdrop { position:fixed; inset:0; z-index:9800; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; padding:32px; }
        .cfa-pop { background:#121317; border:1px solid #2a2d34; border-radius:14px; box-shadow:0 30px 80px rgba(0,0,0,.65); color:#fff; width:90vw; height:90vh; display:flex; flex-direction:column; overflow:hidden; }
        .cfa-pop-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 18px; border-bottom:1px solid #2a2d34; font-size:11px; font-weight:600; color:#a1a7b3; text-transform:uppercase; letter-spacing:.05em; }
        .cfa-pop-x { background:none; border:none; color:#6b7280; font-size:16px; cursor:pointer; line-height:1; padding:0 2px; }
        .cfa-pop-x:hover { color:#fff; }
        .cfa-pop-body { overflow:auto; }
        .cfa-pop-tbl { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
        .cfa-pop-tbl th, .cfa-pop-tbl td { padding:6px 12px; font-size:11px; text-align:left; white-space:nowrap; }
        .cfa-pop-tbl th { position:sticky; top:0; background:#121317; color:#6b7280; font-weight:500; font-size:9px; text-transform:uppercase; letter-spacing:.03em; border-bottom:1px solid #2a2d34; z-index:1; cursor:pointer; user-select:none; }
        .cfa-pop-tbl th:hover { color:#a1a7b3; }
        .cfa-pop-tbl .num { text-align:right; }
        .cfa-pop-tbl td.mut { color:#a1a7b3; }
        .cfa-pop-tbl tbody tr:not(:last-child) td { border-bottom:1px solid rgba(255,255,255,.05); }
        .cfa-pop-tbl tfoot td { border-top:1px solid #2a2d34; font-weight:600; color:#fff; position:sticky; bottom:0; background:#121317; }
      `;
      document.head.appendChild(s);
    }

    // ---------------------------------------------------------------- data

    function paramsKey() { return `${year}|${month}|${scenarioId || "budget"}`; }

    // Sempre busca ao vivo (sem cache por ano) -- senao um cenario criado
    // durante a mesma sessao/ano nunca aparece sem recarregar a pagina.
    // Enquanto o usuario nao mexeu manualmente no seletor (`scenarioUserSet`
    // false), re-resolve o default (Fcst 5+7 ou 1o cenario) TODA vez -- isso
    // e' necessario pra auto-curar o caso em que o 1o fetch (ex: org ainda
    // resolvendo a sessao) veio vazio e travou em "Budget" pra sempre (bug
    // encontrado pelo usuario: dropdown so mostrava Budget mesmo com Fcst 5+7
    // cadastrado). Depois que o usuario escolhe manualmente (mesmo Budget),
    // a escolha fica travada e so e' recalculada se o cenario escolhido
    // deixar de existir na lista.
    async function loadScenarios() {
      scenarios = [];
      if (isSupabaseConfigured()) {
        try {
          const org = await resolveOrganizationId();
          const { fetchSupabaseRowsSafe } = deps;
          const rowsRes = await fetchSupabaseRowsSafe("forecast_scenarios", `organization_id=eq.${org}&reference_year=eq.${year}&order=created_at.asc&select=id,name`);
          scenarios = rowsRes || [];
        } catch (e) { console.warn("cenarios:", e); scenarios = []; }
      }
      const stillExists = scenarioId && scenarios.some((s) => s.id === scenarioId);
      if ((!scenarioUserSet && !scenarioId) || (scenarioId && !stillExists)) {
        const fcst = scenarios.find((s) => /fcst|5\s*\+\s*7/i.test(s.name));
        scenarioId = (fcst || scenarios[0])?.id || null;
      }
    }

    async function loadData() {
      loading = true;
      await loadScenarios();
      let raw = [];
      if (isSupabaseConfigured()) {
        const org = await resolveOrganizationId();
        raw = await callSupabaseRpc("comercial_final_de_ano", { p_org: org, p_year: year, p_month: month, p_scenario_id: scenarioId });
      }
      rows = transform(raw || []);
      loadedKey = paramsKey();
      loading = false;
    }

    // pct=null quando meta=0 E real=0 (sem dado nenhum no periodo). meta=0 com
    // real>0 conta como 100% (sem meta cadastrada pra medir contra).
    function computeRow(r) {
      const realVal = Number(r.real_val) || 0;
      const metaVal = Number(r.meta_val) || 0;
      let pct = null;
      if (metaVal > 0) pct = (realVal / metaVal) * 100;
      else if (realVal > 0) pct = 100;
      return { responsavel: r.responsavel, territorios: r.territorios || "", realVal, metaVal, pct };
    }

    function transform(raw) {
      const sortFn = (a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.realVal - a.realVal;
      return raw.map(computeRow).sort(sortFn);
    }

    // ---------------------------------------------------------------- helpers

    function nf(v) { return Math.round(v || 0).toLocaleString("pt-BR"); }
    function fmtR$(v) { return "R$ " + nf(v); }

    // ---------------------------------------------------------------- render

    function render(container) {
      ensureStyle();
      closeExtratoPopover();
      // "Budget" e' sentinela (scenario_id null) -- tem que aparecer sempre no
      // dropdown, nao so quando `scenarios` vem vazio, senao fica impossivel
      // selecionar Budget assim que existir pelo menos 1 cenario de forecast
      // (bug encontrado pelo usuario: carga de Budget comercial funcionou,
      // mas nenhum relatorio comercial deixava escolher Budget no Cenario).
      const scenOpts = `<option value=""${!scenarioId ? " selected" : ""}>Budget</option>` +
        scenarios.map((s) => `<option value="${escapeHtml(s.id)}"${s.id === scenarioId ? " selected" : ""}>${escapeHtml(s.name)}</option>`).join("");
      container.innerHTML = `
        <div class="cfa">
          <div class="cfa-header">
            <div>
              <p class="cfa-kicker">Comercial · Campanha anual</p>
              <h1 class="cfa-h1">Final de Ano — YTD até ${escapeHtml(MONTHS[month - 1])}/${year}</h1>
            </div>
            <div class="cfa-controls">
              <div class="cfa-period">
                <span class="lbl">Cenário</span>
                <select id="cfa-scenario">${scenOpts}</select>
              </div>
            </div>
          </div>
          <div id="cfa-hero"></div>
          <div id="cfa-board-wrap"></div>
          ${rulesHtml()}
        </div>
      `;
      bind(container);
      if (loading) {
        container.querySelector("#cfa-hero").innerHTML = `<div class="cfa-empty">Carregando…</div>`;
        return;
      }
      if (!rows.length) {
        container.querySelector("#cfa-hero").innerHTML = `<div class="cfa-empty">Sem dados de vendas/meta para o período.</div>`;
        return;
      }
      renderHero(container);
      renderBoard(container);
    }

    function bind(container) {
      container.querySelector("#cfa-scenario")?.addEventListener("change", (e) => { scenarioId = e.target.value || null; scenarioUserSet = true; reload(container); });
    }

    async function reload(container) {
      loading = true; render(container);
      try { await loadData(); } catch (e) { console.error(e); }
      render(container);
    }

    function renderHero(container) {
      const total = rows.length;
      const superaram = rows.filter((r) => r.pct !== null && r.pct >= 100).length;
      const withPct = rows.filter((r) => r.pct !== null);
      const media = withPct.length ? withPct.reduce((s, r) => s + r.pct, 0) / withPct.length : 0;
      const lider = rows[0];
      const heroEl = container.querySelector("#cfa-hero");
      heroEl.innerHTML = `
        <div class="cfa-hero">
          <div class="cfa-hero-stat"><p class="cfa-hero-label">Na campanha</p><p class="cfa-hero-val">${total}</p></div>
          <div class="cfa-hero-sep"></div>
          <div class="cfa-hero-stat"><p class="cfa-hero-label">Superaram a meta</p><p class="cfa-hero-val pos">${superaram} <span style="font-size:14px;color:var(--cfa-faint)">de ${total}</span></p></div>
          <div class="cfa-hero-sep"></div>
          <div class="cfa-hero-stat"><p class="cfa-hero-label">Atingimento médio</p><p class="cfa-hero-val">${media.toFixed(0)}%</p></div>
          <div class="cfa-hero-sep"></div>
          <div class="cfa-hero-stat"><p class="cfa-hero-label">Líder do ano</p><p class="cfa-hero-val" style="font-size:18px">🏆 ${escapeHtml(lider?.responsavel || "—")}</p></div>
        </div>
      `;
    }

    function renderBoard(container) {
      const wrap = container.querySelector("#cfa-board-wrap");
      const body = rows.map((r, i) => {
        const pos = i + 1;
        const pctLabel = r.pct === null ? "—" : `${r.pct.toFixed(0)}%`;
        const pctCls = r.pct === null ? "" : r.pct >= 100 ? "pos" : r.pct >= 80 ? "" : "neg";
        const barColor = r.pct === null ? "#6b7280" : r.pct >= 100 ? "#22c55e" : r.pct >= 80 ? "#f59e0b" : "#ef4444";
        const barPct = r.pct === null ? 0 : Math.min(r.pct, 100);
        const trophy = pos === 1 ? `<span class="cfa-trophy">🏆</span>` : "";
        return `<tr class="cfa-row${pos === 1 ? " lider" : ""}">
          <td class="cfa-pos-num">${pos}</td>
          <td class="cfa-name">${trophy}${escapeHtml(r.responsavel)}</td>
          <td>${escapeHtml(r.territorios)}</td>
          <td>${fmtR$(r.realVal)}</td>
          <td>${fmtR$(r.metaVal)}</td>
          <td><span class="cfa-bar-wrap"><span class="cfa-bar-fill" style="width:${barPct}%;background:${barColor}"></span></span><span class="cfa-pct ${pctCls}">${pctLabel}</span></td>
        </tr>`;
      }).join("");
      wrap.innerHTML = `
        <div class="cfa-section">
          <p class="cfa-section-title">Ranking · ${rows.length} ${rows.length === 1 ? "pessoa" : "pessoas"}</p>
          <button type="button" class="cfa-extrato-btn" id="cfa-extrato-btn">Extrato</button>
        </div>
        <div class="cfa-board">
          <div class="cfa-tbl-wrap"><table class="cfa-tbl">
            <thead><tr><th>#</th><th>Nome</th><th>Território</th><th>Real YTD (R$)</th><th>Meta YTD (R$)</th><th>Atingimento</th></tr></thead>
            <tbody>${body}</tbody>
          </table></div>
        </div>
      `;
      wrap.querySelector("#cfa-extrato-btn")?.addEventListener("click", openExtratoPopover);
    }

    // Disclaimer com o regulamento da campanha, sempre visivel abaixo do board
    // (independe de estar carregando ou sem dados no periodo).
    function rulesHtml() {
      return `
        <div class="cfa-rules">
          <p class="cfa-rules-title">Regulamento da campanha</p>
          <ol>
            <li>Campanha <b>anual</b> (janeiro a dezembro/2026) de atingimento de meta de <b>faturamento (R$)</b>, aberta a <b>Representantes Comerciais e vendedores</b>.</li>
            <li>Cada pessoa concorre <b>contra a própria meta</b>: o ranking é por <b>% de atingimento</b> (realizado ÷ meta), não por faturamento absoluto — quem performa melhor sobre a própria meta vence, mesmo cobrindo um território menor.</li>
            <li>Acompanhamento <b>ao vivo, acumulado (YTD)</b>: soma janeiro até o mês selecionado no topo do site, atualizando mês a mês ao longo do ano.</li>
            <li><b>Real</b> = Faturado (NF emitida). Carteira/pedido ainda não faturado não conta.</li>
            <li><b>Meta</b> = a do cenário selecionado no topo do card (padrão Fcst 5+7, pode ser trocado).</li>
            <li>Ranking <b>único</b>: soma Grão + Pecuária por pessoa (não separa por linha).</li>
            <li><b>Não disputam</b>: gerente geral e coordenadores de cada regional, mesmo quando aparecem cadastrados como responsáveis de algum território.</li>
            <li>Territórios sem responsável nomeado ("A definir") <b>não entram</b> no agregado de ninguém.</li>
            <li><b>Desempate</b>: maior faturamento absoluto.</li>
            <li>Período = acumulado do ano até o mês selecionado no topo do site.</li>
          </ol>
        </div>
      `;
    }

    // ---------------------------------------------------------------- extrato popover
    // Botao EXTRATO: lista as transacoes (Faturado) de TODAS as pessoas
    // elegiveis no acumulado YTD -- mesma estrutura do popover do
    // Bateu,Levou, sem filtro de linha (o ranking e unico).

    let popEl = null;
    let popRows = [];
    let popSort = { key: null, dir: 1 };

    function closeExtratoPopover() {
      if (!popEl) return;
      popEl.remove(); popEl = null;
      document.removeEventListener("keydown", onPopKey);
    }
    function onPopKey(e) { if (e.key === "Escape") closeExtratoPopover(); }

    function renderPopTable(items0) {
      if (!items0.length) return `<div class="cfa-empty" style="padding:22px">Sem transações no período.</div>`;
      const NUM = ["quantidade", "valor"];
      const items = items0.slice();
      if (popSort.key) {
        const k = popSort.key, d = popSort.dir, isNum = NUM.includes(k);
        items.sort((a, b) => isNum
          ? d * ((Number(a[k]) || 0) - (Number(b[k]) || 0))
          : d * String(a[k] || "").localeCompare(String(b[k] || ""), "pt-BR"));
      }
      const sortTh = (key, label, cls) => {
        const active = popSort.key === key;
        const arrow = active ? (popSort.dir === 1 ? " ↑" : " ↓") : "";
        return `<th data-sort="${key}"${cls ? ` class="${cls}"` : ""}${active ? ' style="color:#7aa2ff"' : ""}>${label}${arrow}</th>`;
      };
      let totQ = 0, totV = 0;
      const body = items.map((r) => {
        totQ += Number(r.quantidade) || 0; totV += Number(r.valor) || 0;
        const cidadeUf = [r.cidade, r.uf].filter(Boolean).join("/");
        return `<tr>
          <td>${escapeHtml(r.responsavel || "")}</td>
          <td>${escapeHtml(r.territorio || "")}</td>
          <td class="mut">${escapeHtml(r.cod_cliente || "")}</td>
          <td>${escapeHtml(r.cliente || "")}</td>
          <td class="mut">${escapeHtml(cidadeUf)}</td>
          <td class="mut">${escapeHtml(r.cod_produto || "")}</td>
          <td>${escapeHtml(r.produto || "")}</td>
          <td class="num">${nf(r.quantidade)}</td>
          <td class="num">${fmtR$(r.valor)}</td>
        </tr>`;
      }).join("");
      return `<table class="cfa-pop-tbl">
        <thead><tr>${sortTh("responsavel", "Nome")}${sortTh("territorio", "Território")}${sortTh("cod_cliente", "Cód. Cli.")}${sortTh("cliente", "Cliente")}${sortTh("cidade", "Cidade/UF")}${sortTh("cod_produto", "Cód. Prod.")}${sortTh("produto", "Produto")}${sortTh("quantidade", "Qtd", "num")}${sortTh("valor", "Valor", "num")}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td colspan="7">Total · ${items.length} ${items.length === 1 ? "linha" : "linhas"}</td><td class="num">${nf(totQ)}</td><td class="num">${fmtR$(totV)}</td></tr></tfoot>
      </table>`;
    }

    function paintPopTable() {
      if (!popEl) return;
      const body = popEl.querySelector(".cfa-pop-body");
      if (!body) return;
      body.innerHTML = renderPopTable(popRows);
      body.querySelectorAll(".cfa-pop-tbl th[data-sort]").forEach((th) => th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (popSort.key === key) popSort.dir *= -1; else { popSort.key = key; popSort.dir = 1; }
        paintPopTable();
      }));
    }

    async function openExtratoPopover() {
      closeExtratoPopover();
      const backdrop = document.createElement("div");
      backdrop.className = "cfa-pop-backdrop";
      backdrop.innerHTML = `<div class="cfa-pop">
          <div class="cfa-pop-head"><span>Extrato · YTD até ${escapeHtml(MONTHS[month - 1])}/${year}</span><button class="cfa-pop-x" type="button" aria-label="Fechar">✕</button></div>
          <div class="cfa-pop-body"><div class="cfa-empty" style="padding:22px">Carregando…</div></div>
        </div>`;
      document.body.appendChild(backdrop);
      popEl = backdrop;
      backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeExtratoPopover(); });
      backdrop.querySelector(".cfa-pop-x").addEventListener("click", closeExtratoPopover);
      setTimeout(() => document.addEventListener("keydown", onPopKey), 0);

      let extratoRows = [];
      try {
        if (isSupabaseConfigured()) {
          const org = await resolveOrganizationId();
          extratoRows = await callSupabaseRpc("comercial_final_de_ano_extrato", { p_org: org, p_year: year, p_month: month });
        }
      } catch (e) { console.error("extrato:", e); }
      if (popEl !== backdrop) return;
      popRows = extratoRows || [];
      popSort = { key: null, dir: 1 };
      paintPopTable();
    }

    // ---------------------------------------------------------------- entry

    function renderSelectedFinalDeAno(container, reportId) {
      if (reportId !== REPORT_ID) return false;
      const prevYear = year;
      syncFromHeader();
      if (year !== prevYear) scenarioUserSet = false;
      if (loadedKey === paramsKey() && rows.length) {
        render(container);
        loadData().then(() => render(container)).catch((e) => console.error(e));
      } else {
        loading = true; render(container);
        loadData().then(() => render(container)).catch((e) => { console.error(e); loading = false; render(container); });
      }
      return true;
    }

    return { renderSelectedFinalDeAno, REPORT_ID };
  }

  window.VECTON_COMERCIAL_FINAL_DE_ANO = { createComercialFinalDeAnoModule };
})(window);
