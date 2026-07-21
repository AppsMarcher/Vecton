(function attachVectonComercialBateuLevou(window) {
  // Relatorio "Bateu, Levou" -- campanha mensal de atingimento de meta (real
  // Faturado x Meta do cenario), restrita aos RCs, 2 rankings separados
  // (Grao/Pecuaria). Consome a RPC comercial_bateu_levou (agregacao server-side
  // por responsavel+linha, ja SEM agrupamento territorial/geografico). Classes
  // prefixadas cbl- pra nao colidir com o resto do app.
  function createComercialBateuLevouModule(deps) {
    const {
      escapeHtml,
      state,
      resolveOrganizationId,
      fetchSupabaseRowsSafe,
      callSupabaseRpc,
      isSupabaseConfigured
    } = deps;

    const REPORT_ID = "comercialBateuLevou";
    const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

    let year = Number(state.currentPeriod?.year || 2026);
    let month = Number(state.currentPeriod?.month || 6);
    let scenarioId = null;
    let scenarios = [];
    let scenariosYear = null;
    let grao = [];
    let pecuaria = [];
    let loadedKey = null;
    let loading = false;

    // Sem seletor proprio de periodo -- segue sempre o toggle master do topo
    // do site (state.currentPeriod), igual OPEX/Headcount.
    function syncFromHeader() {
      year = Number(state.currentPeriod?.year || year);
      month = Number(state.currentPeriod?.month || month);
    }

    // ---------------------------------------------------------------- CSS

    function ensureStyle() {
      if (document.getElementById("cbl-style")) return;
      const s = document.createElement("style");
      s.id = "cbl-style";
      s.textContent = `
        .cbl { --cbl-bg:#09090a; --cbl-bg-soft:#0e0e10; --cbl-panel:#121317; --cbl-panel-hover:#191b20; --cbl-line:#2a2d34; --cbl-text:#fff; --cbl-soft:#a1a7b3; --cbl-faint:#6b7280; --cbl-pos:#22c55e; --cbl-neg:#f87171; color:var(--cbl-text); }
        .cbl * { box-sizing:border-box; }
        .cbl-header { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; flex-wrap:wrap; margin-bottom:18px; }
        .cbl-h1 { font-size:20px; font-weight:600; margin:0; }
        .cbl-kicker { font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--cbl-faint); margin:0 0 4px; }
        .cbl-controls { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .cbl-period { display:flex; align-items:center; gap:8px; background:var(--cbl-panel); border:1px solid var(--cbl-line); border-radius:12px; padding:6px 10px; }
        .cbl-period select { background:transparent; border:none; color:var(--cbl-text); font-size:13px; font-family:inherit; padding:6px 4px; outline:none; }
        .cbl-period .lbl { font-size:11px; color:var(--cbl-faint); text-transform:uppercase; letter-spacing:.04em; }
        .cbl-hero { display:flex; gap:14px; background:var(--cbl-panel); border:1px solid var(--cbl-line); border-radius:16px; padding:18px 22px; margin-bottom:24px; flex-wrap:wrap; }
        .cbl-hero-stat { min-width:120px; }
        .cbl-hero-label { font-size:11px; color:var(--cbl-faint); text-transform:uppercase; letter-spacing:.05em; margin:0 0 4px; }
        .cbl-hero-val { font-size:26px; font-weight:600; font-variant-numeric:tabular-nums; margin:0; }
        .cbl-hero-val.pos { color:var(--cbl-pos); }
        .cbl-hero-sep { width:1px; align-self:stretch; background:var(--cbl-line); }
        .cbl-section { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--cbl-faint); margin:22px 0 10px; }
        .cbl-boards { display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }
        .cbl-board { background:var(--cbl-panel); border:1px solid var(--cbl-line); border-radius:16px; overflow:hidden; }
        .cbl-board-head { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:14px 18px; border-bottom:1px solid var(--cbl-line); font-size:14px; font-weight:600; text-transform:uppercase; letter-spacing:.03em; }
        .cbl-board-head-left { display:flex; align-items:center; gap:8px; }
        .cbl-dot { width:8px; height:8px; border-radius:50%; }
        .cbl-extrato-btn { border:1px solid var(--cbl-line); background:transparent; color:var(--cbl-soft); font-size:11px; font-weight:600; letter-spacing:.03em; text-transform:uppercase; padding:6px 12px; border-radius:8px; cursor:pointer; font-family:inherit; }
        .cbl-extrato-btn:hover { color:var(--cbl-text); border-color:#4f7cff; }
        .cbl-pop-backdrop { position:fixed; inset:0; z-index:9800; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; padding:32px; }
        .cbl-pop { background:#121317; border:1px solid #2a2d34; border-radius:14px; box-shadow:0 30px 80px rgba(0,0,0,.65); color:#fff; width:90vw; height:90vh; display:flex; flex-direction:column; overflow:hidden; }
        .cbl-pop-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 18px; border-bottom:1px solid #2a2d34; font-size:11px; font-weight:600; color:#a1a7b3; text-transform:uppercase; letter-spacing:.05em; }
        .cbl-pop-x { background:none; border:none; color:#6b7280; font-size:16px; cursor:pointer; line-height:1; padding:0 2px; }
        .cbl-pop-x:hover { color:#fff; }
        .cbl-pop-body { overflow:auto; }
        .cbl-pop-tbl { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
        .cbl-pop-tbl th, .cbl-pop-tbl td { padding:6px 12px; font-size:11px; text-align:left; white-space:nowrap; }
        .cbl-pop-tbl th { position:sticky; top:0; background:#121317; color:#6b7280; font-weight:500; font-size:9px; text-transform:uppercase; letter-spacing:.03em; border-bottom:1px solid #2a2d34; z-index:1; cursor:pointer; user-select:none; }
        .cbl-pop-tbl th:hover { color:#a1a7b3; }
        .cbl-pop-tbl .num { text-align:right; }
        .cbl-pop-tbl td.mut { color:#a1a7b3; }
        .cbl-pop-tbl tbody tr:not(:last-child) td { border-bottom:1px solid rgba(255,255,255,.05); }
        .cbl-pop-tbl tfoot td { border-top:1px solid #2a2d34; font-weight:600; color:#fff; position:sticky; bottom:0; background:#121317; }
        .cbl-tbl-wrap { overflow-x:auto; }
        .cbl-tbl { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
        .cbl-tbl th, .cbl-tbl td { padding:9px 12px; font-size:12px; text-align:right; white-space:nowrap; }
        .cbl-tbl th:nth-child(1), .cbl-tbl td:nth-child(1) { text-align:center; width:32px; }
        .cbl-tbl th:nth-child(2), .cbl-tbl td:nth-child(2) { text-align:left; }
        .cbl-tbl th:nth-child(3), .cbl-tbl td:nth-child(3) { text-align:left; color:var(--cbl-faint); font-size:11px; white-space:normal; }
        .cbl-tbl th { color:var(--cbl-faint); font-weight:500; font-size:10px; text-transform:uppercase; letter-spacing:.03em; border-bottom:1px solid var(--cbl-line); }
        .cbl-tbl tbody tr:not(:last-child) td { border-bottom:1px solid rgba(255,255,255,.05); }
        .cbl-pos-num { color:var(--cbl-faint); font-weight:600; }
        .cbl-name { font-weight:600; }
        .cbl-row.bateu { background:rgba(34,197,94,0.08); }
        .cbl-row.bateu .cbl-pos-num { color:var(--cbl-pos); }
        .cbl-trophy { margin-right:4px; }
        .cbl-pct { font-weight:700; }
        .cbl-pct.pos { color:var(--cbl-pos); }
        .cbl-pct.neg { color:var(--cbl-neg); }
        .cbl-bar-wrap { width:64px; height:6px; border-radius:99px; background:var(--cbl-bg-soft); overflow:hidden; display:inline-block; vertical-align:middle; margin-right:8px; }
        .cbl-bar-fill { height:100%; border-radius:99px; }
        .cbl-empty { padding:40px; text-align:center; color:var(--cbl-faint); }
        .cbl-rules { margin-top:20px; background:var(--cbl-bg-soft); border:1px solid var(--cbl-line); border-radius:16px; padding:16px 20px; }
        .cbl-rules-title { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--cbl-faint); margin:0 0 10px; }
        .cbl-rules-title::before { content:"§"; color:var(--cbl-soft); font-weight:700; }
        .cbl-rules ol { margin:0; padding-left:18px; display:grid; gap:6px; }
        .cbl-rules li { font-size:12px; line-height:1.5; color:var(--cbl-soft); }
        .cbl-rules li b { color:var(--cbl-text); font-weight:600; }
        @media (max-width:900px){ .cbl-boards{ grid-template-columns:1fr; } }
      `;
      document.head.appendChild(s);
    }

    // ---------------------------------------------------------------- data

    function paramsKey() { return `${year}|${month}|${scenarioId || "budget"}`; }

    async function loadScenarios() {
      if (scenariosYear === year) return;
      scenarios = [];
      if (isSupabaseConfigured()) {
        try {
          const org = await resolveOrganizationId();
          const rows = await fetchSupabaseRowsSafe("forecast_scenarios", `organization_id=eq.${org}&reference_year=eq.${year}&order=created_at.asc&select=id,name`);
          scenarios = rows || [];
        } catch (e) { console.warn("cenarios:", e); scenarios = []; }
      }
      scenariosYear = year;
      if (!scenarioId || !scenarios.some((s) => s.id === scenarioId)) {
        const fcst = scenarios.find((s) => /fcst|5\s*\+\s*7/i.test(s.name));
        scenarioId = (fcst || scenarios[0])?.id || null;
      }
    }

    async function loadData() {
      loading = true;
      await loadScenarios();
      let rows = [];
      if (isSupabaseConfigured()) {
        const org = await resolveOrganizationId();
        rows = await callSupabaseRpc("comercial_bateu_levou", { p_org: org, p_year: year, p_month: month, p_scenario_id: scenarioId });
      }
      const tr = transform(rows || []);
      grao = tr.grao;
      pecuaria = tr.pecuaria;
      loadedKey = paramsKey();
      loading = false;
    }

    // pct=null quando meta=0 E real=0 (sem dado nenhum no periodo). meta=0 com
    // real>0 conta como bateu (100%), por decisao do usuario -- nao ha meta
    // cadastrada pra "nao bater". "Bateu" exige alem do %: pelo menos 2
    // maquinas vendidas no periodo (vender só 1 nao ganha a campanha, mesmo
    // que baixe a meta de 1 unidade).
    const MIN_QTD_BATEU = 2;
    function computeRow(r) {
      const realQtd = Number(r.real_qtd) || 0;
      const metaQtd = Number(r.meta_qtd) || 0;
      let pct = null;
      if (metaQtd > 0) pct = (realQtd / metaQtd) * 100;
      else if (realQtd > 0) pct = 100;
      const bateu = pct !== null && pct >= 100 && realQtd >= MIN_QTD_BATEU;
      return { responsavel: r.responsavel, territorios: r.territorios || "", realQtd, metaQtd, pct, bateu };
    }

    function transform(rows) {
      const byLinha = { "Grão": [], "Pecuária": [] };
      rows.forEach((r) => { if (byLinha[r.linha]) byLinha[r.linha].push(computeRow(r)); });
      const sortFn = (a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.realQtd - a.realQtd;
      return { grao: byLinha["Grão"].sort(sortFn), pecuaria: byLinha["Pecuária"].sort(sortFn) };
    }

    // ---------------------------------------------------------------- helpers

    function nf(v) { return Math.round(v || 0).toLocaleString("pt-BR"); }

    // ---------------------------------------------------------------- render

    function render(container) {
      ensureStyle();
      closeExtratoPopover();
      // "Budget" e' sentinela (scenario_id null) -- tem que aparecer sempre no
      // dropdown, nao so quando `scenarios` vem vazio, senao fica impossivel
      // selecionar Budget assim que existir pelo menos 1 cenario de forecast.
      const scenOpts = `<option value=""${!scenarioId ? " selected" : ""}>Budget</option>` +
        scenarios.map((s) => `<option value="${escapeHtml(s.id)}"${s.id === scenarioId ? " selected" : ""}>${escapeHtml(s.name)}</option>`).join("");
      container.innerHTML = `
        <div class="cbl">
          <div class="cbl-header">
            <div>
              <p class="cbl-kicker">Comercial · Campanha RCs</p>
              <h1 class="cbl-h1">Bateu, Levou — ${escapeHtml(MONTHS[month - 1])}/${year}</h1>
            </div>
            <div class="cbl-controls">
              <div class="cbl-period">
                <span class="lbl">Cenário</span>
                <select id="cbl-scenario">${scenOpts}</select>
              </div>
            </div>
          </div>
          <div id="cbl-hero"></div>
          <div id="cbl-boards-wrap"></div>
          ${rulesHtml()}
        </div>
      `;
      bind(container);
      if (loading) {
        container.querySelector("#cbl-hero").innerHTML = `<div class="cbl-empty">Carregando…</div>`;
        return;
      }
      if (!grao.length && !pecuaria.length) {
        container.querySelector("#cbl-hero").innerHTML = `<div class="cbl-empty">Sem dados de vendas/meta para o período.</div>`;
        return;
      }
      renderHero(container);
      renderBoards(container);
    }

    function bind(container) {
      container.querySelector("#cbl-scenario")?.addEventListener("change", (e) => { scenarioId = e.target.value || null; reload(container); });
    }

    async function reload(container) {
      loading = true; render(container);
      try { await loadData(); } catch (e) { console.error(e); }
      render(container);
    }

    function renderHero(container) {
      const all = grao.concat(pecuaria);
      const total = all.length;
      const bateram = all.filter((r) => r.bateu).length;
      const withPct = all.filter((r) => r.pct !== null);
      const media = withPct.length ? withPct.reduce((s, r) => s + r.pct, 0) / withPct.length : 0;
      const heroEl = container.querySelector("#cbl-hero");
      heroEl.innerHTML = `
        <div class="cbl-hero">
          <div class="cbl-hero-stat"><p class="cbl-hero-label">RCs na campanha</p><p class="cbl-hero-val">${total}</p></div>
          <div class="cbl-hero-sep"></div>
          <div class="cbl-hero-stat"><p class="cbl-hero-label">Bateram a meta</p><p class="cbl-hero-val pos">${bateram} <span style="font-size:14px;color:var(--cbl-faint)">de ${total}</span></p></div>
          <div class="cbl-hero-sep"></div>
          <div class="cbl-hero-stat"><p class="cbl-hero-label">Não bateram</p><p class="cbl-hero-val">${total - bateram}</p></div>
          <div class="cbl-hero-sep"></div>
          <div class="cbl-hero-stat"><p class="cbl-hero-label">Atingimento médio</p><p class="cbl-hero-val">${media.toFixed(0)}%</p></div>
        </div>
      `;
    }

    function boardHtml(title, dotColor, rows, linha) {
      const head = (inner) => `<div class="cbl-board-head">
        <div class="cbl-board-head-left"><span class="cbl-dot" style="background:${dotColor}"></span>${inner}</div>
        <button type="button" class="cbl-extrato-btn" data-extrato="${escapeHtml(linha)}">Extrato</button>
      </div>`;
      if (!rows.length) {
        return `<div class="cbl-board">
          ${head(escapeHtml(title))}
          <div class="cbl-empty">Sem RCs nessa linha no período.</div>
        </div>`;
      }
      const body = rows.map((r, i) => {
        const pos = i + 1;
        const pctLabel = r.pct === null ? "—" : `${r.pct.toFixed(0)}%`;
        const pctCls = r.pct === null ? "" : r.bateu ? "pos" : r.pct >= 80 ? "" : "neg";
        const barColor = r.pct === null ? "#6b7280" : r.bateu ? "#22c55e" : r.pct >= 80 ? "#f59e0b" : "#ef4444";
        const barPct = r.pct === null ? 0 : Math.min(r.pct, 100);
        const trophy = r.bateu ? `<span class="cbl-trophy">🏆</span>` : "";
        return `<tr class="cbl-row${r.bateu ? " bateu" : ""}">
          <td class="cbl-pos-num">${pos}</td>
          <td class="cbl-name">${trophy}${escapeHtml(r.responsavel)}</td>
          <td>${escapeHtml(r.territorios)}</td>
          <td>${nf(r.realQtd)}</td>
          <td>${nf(r.metaQtd)}</td>
          <td><span class="cbl-bar-wrap"><span class="cbl-bar-fill" style="width:${barPct}%;background:${barColor}"></span></span><span class="cbl-pct ${pctCls}">${pctLabel}</span></td>
        </tr>`;
      }).join("");
      return `<div class="cbl-board">
        ${head(`${escapeHtml(title)} <span style="font-weight:400;color:var(--cbl-faint);font-size:11px;margin-left:6px">${rows.length} RCs</span>`)}
        <div class="cbl-tbl-wrap"><table class="cbl-tbl">
          <thead><tr><th>#</th><th>RC</th><th>Território</th><th>Real (un)</th><th>Meta (un)</th><th>Atingimento</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>
      </div>`;
    }

    // Disclaimer com o regulamento da campanha, sempre visivel abaixo dos 2
    // boards (independe de estar carregando ou sem dados no periodo).
    function rulesHtml() {
      return `
        <div class="cbl-rules">
          <p class="cbl-rules-title">Regulamento da campanha</p>
          <ol>
            <li>Campanha <b>mensal</b> de atingimento de meta de <b>volume em máquinas</b> (quantidade, não R$), restrita aos <b>RCs</b> (responsáveis de território).</li>
            <li>Disputa separada em <b>2 categorias independentes: Grão e Pecuária</b> — cada RC concorre na(s) linha(s) de que é responsável.</li>
            <li><b>Real</b> = Faturado (NF emitida no mês). Carteira/pedido ainda não faturado não conta.</li>
            <li><b>Meta</b> = a do cenário selecionado no topo do card (padrão Fcst 5+7, pode ser trocado).</li>
            <li>Só é considerado <b>"bateu"</b> quem atinge <b>100% ou mais da meta</b> <b>e</b> vende <b>pelo menos 2 máquinas</b> no mês — vender só 1 não vale, mesmo com meta baixa.</li>
            <li>RC sem meta cadastrada no período, mas com venda real, conta como <b>"bateu" automaticamente</b> (não há meta pra "não bater").</li>
            <li><b>Não disputam</b>: gerente geral, coordenadores de cada regional e vendedores internos — mesmo quando aparecem cadastrados como responsáveis de algum território.</li>
            <li>Territórios sem RC nomeado ("A definir") <b>não entram</b> no ranking.</li>
            <li>Ranking ordenado por <b>% de atingimento</b> (desempate por volume real vendido).</li>
            <li>Período = o mês/ano selecionado no topo do site.</li>
          </ol>
        </div>
      `;
    }

    function renderBoards(container) {
      const wrap = container.querySelector("#cbl-boards-wrap");
      wrap.innerHTML = `
        <p class="cbl-section">Rankings</p>
        <div class="cbl-boards">
          ${boardHtml("Grão", "#4f7cff", grao, "Grão")}
          ${boardHtml("Pecuária", "#f59e0b", pecuaria, "Pecuária")}
        </div>
      `;
      wrap.querySelectorAll(".cbl-extrato-btn").forEach((btn) => btn.addEventListener("click", () => openExtratoPopover(btn.dataset.extrato)));
    }

    // ---------------------------------------------------------------- extrato popover
    // Botao EXTRATO de cada board: lista as transacoes (Faturado) de TODOS os
    // RCs elegiveis daquela linha no periodo -- mesma estrutura do popover do
    // Painel de Vendas, trocando Tipo por RC e sem a coluna Cultura (lista ja
    // e especifica de 1 linha so).

    let popEl = null;
    let popRows = [];
    let popSort = { key: null, dir: 1 };

    function fmtFullR$(v) { return "R$ " + nf(v || 0); }

    function closeExtratoPopover() {
      if (!popEl) return;
      popEl.remove(); popEl = null;
      document.removeEventListener("keydown", onPopKey);
    }
    function onPopKey(e) { if (e.key === "Escape") closeExtratoPopover(); }

    function renderPopTable(rows) {
      if (!rows.length) return `<div class="cbl-empty" style="padding:22px">Sem transações no período.</div>`;
      const NUM = ["quantidade", "valor"];
      const items = rows.slice();
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
          <td class="num">${fmtFullR$(r.valor)}</td>
        </tr>`;
      }).join("");
      return `<table class="cbl-pop-tbl">
        <thead><tr>${sortTh("responsavel", "RC")}${sortTh("territorio", "Território")}${sortTh("cod_cliente", "Cód. Cli.")}${sortTh("cliente", "Cliente")}${sortTh("cidade", "Cidade/UF")}${sortTh("cod_produto", "Cód. Prod.")}${sortTh("produto", "Produto")}${sortTh("quantidade", "Qtd", "num")}${sortTh("valor", "Valor", "num")}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td colspan="7">Total · ${items.length} ${items.length === 1 ? "linha" : "linhas"}</td><td class="num">${nf(totQ)}</td><td class="num">${fmtFullR$(totV)}</td></tr></tfoot>
      </table>`;
    }

    function paintPopTable() {
      if (!popEl) return;
      const body = popEl.querySelector(".cbl-pop-body");
      if (!body) return;
      body.innerHTML = renderPopTable(popRows);
      body.querySelectorAll(".cbl-pop-tbl th[data-sort]").forEach((th) => th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (popSort.key === key) popSort.dir *= -1; else { popSort.key = key; popSort.dir = 1; }
        paintPopTable();
      }));
    }

    async function openExtratoPopover(linha) {
      closeExtratoPopover();
      const backdrop = document.createElement("div");
      backdrop.className = "cbl-pop-backdrop";
      backdrop.innerHTML = `<div class="cbl-pop">
          <div class="cbl-pop-head"><span>Extrato · ${escapeHtml(linha)} · ${escapeHtml(MONTHS[month - 1])}/${year}</span><button class="cbl-pop-x" type="button" aria-label="Fechar">✕</button></div>
          <div class="cbl-pop-body"><div class="cbl-empty" style="padding:22px">Carregando…</div></div>
        </div>`;
      document.body.appendChild(backdrop);
      popEl = backdrop;
      backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeExtratoPopover(); });
      backdrop.querySelector(".cbl-pop-x").addEventListener("click", closeExtratoPopover);
      setTimeout(() => document.addEventListener("keydown", onPopKey), 0);

      let rows = [];
      try {
        if (isSupabaseConfigured()) {
          const org = await resolveOrganizationId();
          rows = await callSupabaseRpc("comercial_bateu_levou_extrato", { p_org: org, p_year: year, p_month: month, p_linha: linha });
        }
      } catch (e) { console.error("extrato:", e); }
      if (popEl !== backdrop) return;
      popRows = rows || [];
      popSort = { key: null, dir: 1 };
      paintPopTable();
    }

    // ---------------------------------------------------------------- entry

    function renderSelectedBateuLevou(container, reportId) {
      if (reportId !== REPORT_ID) return false;
      const prevYear = year;
      syncFromHeader();
      if (year !== prevYear) scenariosYear = null;
      if (loadedKey === paramsKey() && (grao.length || pecuaria.length)) {
        render(container);
        loadData().then(() => render(container)).catch((e) => console.error(e));
      } else {
        loading = true; render(container);
        loadData().then(() => render(container)).catch((e) => { console.error(e); loading = false; render(container); });
      }
      return true;
    }

    return { renderSelectedBateuLevou, REPORT_ID };
  }

  window.VECTON_COMERCIAL_BATEU_LEVOU = { createComercialBateuLevouModule };
})(window);
