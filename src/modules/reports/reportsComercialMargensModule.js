(function attachVectonComercialMargens(window) {
  // Relatório "Evolutivo de Margens" (Comercial). Dados: RPC comercial_margens_itens
  // (migration 255), que devolve o FAT realizado por produto e mês, líquido de
  // devolução, para o ano do período e o anterior. Tudo o mais (KPIs, mapa do
  // portfólio, ponte, tabela e pop-over) é calculado aqui, sem novas idas ao banco.
  //
  // Definições: MP = custo de matéria-prima; MC1% = (RL − MP) ÷ RL. Na tabela os
  // valores são UNITÁRIOS (÷ volume); linhas-pai = total ÷ volume total (média
  // ponderada pelo volume), nunca média de unitários.
  // Ponte da MC1 (R$ = RL − MP) das MÁQUINAS entre dois meses, em unidades. Cada linha
  // traz a (mês anterior) e b (mês atual):
  //  • Volume = Δun × margem/un média anterior das máquinas com base;
  //  • Mix = Δun × (margem/un da máquina − média), a mudança de composição, somada a
  //    máquinas novas (sem venda anterior) e ajustes sem base, que entram inteiros;
  //  • RL (RL/un) e MP (MP/un) por máquina.
  function calculateMarginBridge(rows) {
    const base = rows.filter((r) => r.a.q > 0);
    const q0 = base.reduce((t, r) => t + r.a.q, 0);
    const avgUnit = q0 > 0 ? base.reduce((t, r) => t + r.a.rl - r.a.mp, 0) / q0 : 0;
    return rows.map((r) => {
      const { a, b } = r;
      const M0 = a.rl - a.mp, M1 = b.rl - b.mp;
      const volumeUnits = a.q > 0 ? b.q - a.q : 0;
      const vol = volumeUnits * avgUnit;
      const both = a.q > 0 && b.q > 0;
      const pr = both ? b.rl - b.q * a.rl / a.q : 0;
      const co = both ? -(b.mp - b.q * a.mp / a.q) : 0;
      const dM = M1 - M0;
      const mix = dM - vol - pr - co;
      return { ...r, M0, M1, dM, vol, mix, pr, co, volumeUnits, mu: avgUnit };
    });
  }
  function createComercialMargensModule(deps) {
    const { escapeHtml, state, resolveOrganizationId, callSupabaseRpc, isSupabaseConfigured, syncHeaderPeriod, fetchAllSupabaseRows, callEdgeFunction, appAlert } = deps;
    // Exportar (Imprimir / E-mail / Excel) da tabela Evolutivo de Margens; só existe se o módulo de exportação carregou.
    const exporter = window.VECTON_COMERCIAL_MARGENS_EXPORT?.createMargensExport({ escapeHtml, state, callEdgeFunction, appAlert });
    const REPORT_ID = "comercialMargens";
    const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const GROUP_ORDER = ["Grãos", "Pecuária", "Cargograin"];
    const COMP_GROUP = "Linhas complementares";
    const TOP_ITEMS = 30; // linhas abertas listam os maiores itens; o resto vira "Demais itens"
    const COMP_ORDER = ["Peças", "Transgrain", "Acessórios"];
    const METRICS = [["vol", "VOL"], ["fat", "FAT"], ["rl", "RL"], ["mp", "MP"], ["mb", "MC1%"]];
    const EFFECTS = {
      vol: { name: "Volume", sub: "Δ unidades × margem/un média anterior das máquinas" },
      pr: { name: "RL", sub: "RL por unidade" },
      co: { name: "MP", sub: "MP por unidade" },
      mix: { name: "Mix", sub: "Composição (Δ un × margem/un acima ou abaixo da média) + máquinas novas e ajustes sem base" }
    };

    let host = null;
    let year = Number(state.currentPeriod?.year || new Date().getFullYear());
    let month = Number(state.currentPeriod?.month || 1);
    let model = null;
    let loadedYear = null;
    let loading = false;
    let error = "";
    let period = "mes"; // mes | ytd | fy (pré-set de abertura: Mês)
    let entered = false; // reseta toda vez que o usuário SAI do relatório
    let metric = "vol";
    let bubbleX = "vol"; // eixo X do mapa: vol | rl
    let openRows = new Set();
    // Filtro "Equipe Comercial": vale só para a tabela Evolutivo de Margens (os demais blocos seguem sem filtro)
    let equipe = { tipo: "", valor: "" }; // tipo: territorio | coordenacao | vendedor
    let openEq = false;
    let tmodel = null; // modelo filtrado da tabela
    let tKey = "";
    let tLoading = false;
    let eqLoaded = false;
    let TERRITORIOS = [];
    let COORDENACOES = [];
    let VENDEDORES = []; // {codigo, nome}
    let eqCloseBound = false;
    let resizeBound = false;
    let pop = null; // { eff, open:Set }
    let det = null; // detalhe por NF de uma célula: { title, month, cods, loading, rows, error }
    let tipEl = null;
    let keyBound = false;

    // ── Células e formatação ────────────────────────────────────────────
    const zero = () => ({ q: 0, fat: 0, rl: 0, mp: 0 });
    const add = (a, b) => { a.q += b.q; a.fat += b.fat; a.rl += b.rl; a.mp += b.mp; return a; };
    const ZERO12 = Array.from({ length: 12 }, zero);
    const cellsOf = (obj, y) => obj.cells[y] || ZERO12;
    const fmt = (v, d = 0) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v) || 0);
    const fmtQty = (v) => (Number.isInteger(Math.round(v * 100) / 100) || Math.abs(v) >= 100 ? fmt(v, 0) : fmt(v, 1));
    const fmtUnit = (v) => fmt(v, Math.abs(v) < 100 ? 2 : 0);
    const brl = (v) => {
      const a = Math.abs(v);
      return a >= 1e6 ? `R$ ${fmt(v / 1e6, 2)} mi` : a >= 1e3 ? `R$ ${fmt(v / 1e3, 0)} mil` : `R$ ${fmt(v, 0)}`;
    };
    const sgn = (v) => (v >= 0 ? "+" : "−");
    const mbOf = (c) => (c.rl ? (c.rl - c.mp) / c.rl : null);
    function sumRange(obj, y, lo, hi) {
      const o = zero();
      const arr = cellsOf(obj, y);
      for (let m = lo - 1; m < hi; m++) add(o, arr[m]);
      return o;
    }
    function val(c, k) {
      if (k === "vol") return c.q;
      if (k === "mb") return mbOf(c);
      if (c.q <= 0) return null;
      return (k === "fat" ? c.fat : k === "rl" ? c.rl : c.mp) / c.q;
    }
    function showVal(v, k) {
      if (v == null) return "–";
      return k === "mb" ? `${fmt(v * 100, 1)}%` : k === "vol" ? fmtQty(v) : fmtUnit(v);
    }

    // ── Modelo a partir das linhas do RPC ───────────────────────────────
    function buildModel(rows) {
      const items = new Map();
      rows.forEach((r) => {
        const [y, m, cod, desc, nr, tipo, cult, q, fat, rl, mp] = r;
        let it = items.get(cod);
        if (!it) { it = { cod, desc: desc || cod, nr, tipo, cult, cells: {} }; items.set(cod, it); }
        const arr = it.cells[y] || (it.cells[y] = Array.from({ length: 12 }, zero));
        const c = arr[Number(m) - 1];
        c.q += Number(q) || 0; c.fat += Number(fat) || 0; c.rl += Number(rl) || 0; c.mp += Number(mp) || 0;
      });
      const parents = new Map();
      let semNome = 0;
      let semCultura = 0;
      items.forEach((it) => {
        const mach = it.tipo === "Máquinas";
        if (mach && !it.nr) semNome += 1;
        if (mach && !it.cult) semCultura += 1;
        const label = mach ? it.nr || "(sem nome reduzido)" : it.tipo;
        const group = mach ? (/^CARGOGRAIN/i.test(it.nr || "") ? "Cargograin" : it.cult || "(sem cultura)") : COMP_GROUP;
        const key = `${mach ? "M" : "C"}|${group}|${label}`;
        let p = parents.get(key);
        if (!p) { p = { key, label, kind: mach ? "M" : "C", group, fam: mach ? "M" : it.tipo, items: [], cells: {} }; parents.set(key, p); }
        p.items.push(it);
        it.parent = p;
        Object.keys(it.cells).forEach((y) => {
          const pa = p.cells[y] || (p.cells[y] = Array.from({ length: 12 }, zero));
          it.cells[y].forEach((c, i) => add(pa[i], c));
        });
      });
      const list = [...parents.values()];
      list.forEach((p) => p.items.sort((a, b) => String(a.cod).localeCompare(String(b.cod))));
      return { items: [...items.values()], parents: list, semNome, semCultura };
    }
    // Ordem das máquinas: família (INGRAIN, OUTGRAIN, demais) e depois o número crescente
    // dentro do nome (INGRAIN85 < INGRAIN100 < INGRAIN100+ < INGRAIN101).
    const familyRank = (label) => (/^IN/i.test(label) ? 0 : /^OUT/i.test(label) ? 1 : 2);
    const byMachineName = (a, b) => familyRank(a.label) - familyRank(b.label) || a.label.localeCompare(b.label, "pt-BR", { numeric: true });
    const machines = () => model.parents.filter((p) => p.kind === "M");
    const groupRank = (g) => { const i = GROUP_ORDER.indexOf(g); return i >= 0 ? i : g === "(sem cultura)" ? 99 : 50; };

    // ── Carga ───────────────────────────────────────────────────────────
    function syncPeriod() {
      if (!entered) {
        // Toda vez que ENTRA no relatório (não a cada re-render): filtro Mês e
        // mês calendário anterior, empurrado pro seletor do cabeçalho (mesmo
        // padrão do Cockpit). O relatório mostra o mês do seletor, sem deslocar.
        entered = true;
        period = "mes";
        const lastMonth = new Date();
        lastMonth.setDate(1); // evita estourar o mês ao cair num dia 29-31 que não existe no mês anterior
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        syncHeaderPeriod?.(lastMonth.getFullYear(), lastMonth.getMonth() + 1);
      }
      year = Number(state.currentPeriod?.year || year);
      month = Number(state.currentPeriod?.month || month);
    }
    async function load(force = false) {
      if (!force && model && loadedYear === year) return;
      loading = true; error = "";
      render(host);
      try {
        const org = await resolveOrganizationId();
        const res = await callSupabaseRpc("comercial_margens_itens", { p_org: org, p_year: year });
        model = buildModel(res?.rows || []);
        loadedYear = year;
        tmodel = null; tKey = "";
      } catch (e) {
        console.error(e);
        error = /permiss/i.test(String(e?.message || e)) ? "Você não tem permissão para ver este relatório." : "Não foi possível carregar as margens.";
        model = null;
      } finally {
        loading = false;
        render(host);
      }
      if (model && equipe.tipo) await loadTable();
    }

    // ── Equipe Comercial (só a tabela) ──────────────────────────────────
    const tableModel = () => (equipe.tipo && tmodel ? tmodel : model);
    const equipeKey = () => `${year}|${equipe.tipo}|${equipe.valor}`;
    function equipeLabel() {
      if (!equipe.tipo || !equipe.valor) return "Todas";
      const pref = equipe.tipo === "territorio" ? "Território" : equipe.tipo === "coordenacao" ? "Coordenação" : "Vendedor";
      const nome = equipe.tipo === "vendedor" ? (VENDEDORES.find((v) => v.codigo === equipe.valor)?.nome || equipe.valor) : equipe.valor;
      return `${pref}: ${nome}`;
    }
    async function loadEqOptions() {
      if (eqLoaded || !fetchAllSupabaseRows) return;
      const org = await resolveOrganizationId();
      const [territorios, coordenacoes, vendedores] = await Promise.all([
        fetchAllSupabaseRows("comercial_territorios", `select=nome&organization_id=eq.${org}&order=nome.asc`),
        fetchAllSupabaseRows("comercial_coordenacoes", `select=nome&organization_id=eq.${org}&order=nome.asc`),
        fetchAllSupabaseRows("comercial_vendedores", `select=codigo,nome&organization_id=eq.${org}&order=nome.asc`)
      ]);
      TERRITORIOS = (territorios || []).map((t) => t.nome);
      COORDENACOES = (coordenacoes || []).map((c) => c.nome);
      VENDEDORES = (vendedores || []).map((v) => ({ codigo: v.codigo, nome: v.nome }));
      eqLoaded = true;
    }
    async function loadTable() {
      if (!equipe.tipo) { tmodel = null; tKey = ""; render(host); return; }
      if (tmodel && tKey === equipeKey()) { render(host); return; }
      tLoading = true;
      render(host);
      try {
        const org = await resolveOrganizationId();
        const res = await callSupabaseRpc("comercial_margens_itens", {
          p_org: org, p_year: year,
          p_territorio: equipe.tipo === "territorio" ? [equipe.valor] : null,
          p_coordenacao: equipe.tipo === "coordenacao" ? [equipe.valor] : null,
          p_vendedor: equipe.tipo === "vendedor" ? [equipe.valor] : null
        });
        tmodel = buildModel(res?.rows || []);
        tKey = equipeKey();
      } catch (e) {
        console.error(e);
        equipe = { tipo: "", valor: "" }; tmodel = null; tKey = "";
        error = "";
      } finally {
        tLoading = false;
        render(host);
      }
    }
    function equipePopoverHtml() {
      const radio = (tipo, valor, label) => `<label><input type="radio" name="cmm-equipe" value="${tipo}|${escapeHtml(valor)}" ${equipe.tipo === tipo && equipe.valor === valor ? "checked" : ""}>${escapeHtml(label)}</label>`;
      return `<div class="cmm-eqpop" role="dialog" aria-label="Filtrar por equipe comercial">
        <div class="cmm-eqpop-list"><label><input type="radio" name="cmm-equipe" value="|" ${!equipe.tipo ? "checked" : ""}>Todas</label></div>
        <div class="grp"><h4>Território</h4><div class="cmm-eqpop-list">${TERRITORIOS.map((t) => radio("territorio", t, t)).join("")}</div></div>
        <div class="grp"><h4>Coordenação</h4><div class="cmm-eqpop-list">${COORDENACOES.map((c) => radio("coordenacao", c, c)).join("")}</div></div>
        <div class="grp"><h4>Vendedor</h4><div class="cmm-eqpop-list">${VENDEDORES.map((v) => radio("vendedor", v.codigo, v.nome)).join("")}</div></div>
      </div>`;
    }
    function equipeControlHtml() {
      return `<div class="cmm-eqwrap" id="cmm-eq">
        <button type="button" class="cmm-eqbtn${openEq ? " is-open" : ""}${equipe.tipo ? " is-filtered" : ""}" id="cmm-eq-btn" aria-haspopup="dialog" aria-expanded="${openEq ? "true" : "false"}">
          <span class="ico"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="18" cy="8.5" r="2.6"/><path d="M15.7 14.3c2.9.3 5 2.4 5.8 5.7"/></svg></span>
          <span class="lbl">Equipe Comercial</span>
          <span class="val"><span class="val-text">${escapeHtml(equipeLabel())}</span></span>
        </button>
        ${openEq ? equipePopoverHtml() : ""}
      </div>`;
    }

    // ── Período ─────────────────────────────────────────────────────────
    const nMonths = () => (period === "fy" ? 12 : month);
    const range = () => (period === "mes" ? [month, month] : period === "ytd" ? [1, month] : [1, 12]);
    function lastDataMonth() {
      let last = 0;
      machines().forEach((p) => cellsOf(p, year).forEach((c, i) => { if (c.q || c.fat) last = Math.max(last, i + 1); }));
      return last;
    }

    // ── Indicadores ─────────────────────────────────────────────────────
    function delta(a, b, inv, pp, base) {
      if (b == null || a == null || (!pp && !b)) return `<div class="cmm-d cmm-muted">sem base em ${escapeHtml(base)}</div>`;
      const d = pp ? (a - b) * 100 : (a / b - 1) * 100;
      const good = inv ? d < 0 : d > 0;
      return `<div class="cmm-d ${good ? "pos" : "neg"}">${d >= 0 ? "▲" : "▼"} ${fmt(Math.abs(d), 1)}${pp ? " p.p." : "%"}<span>vs ${escapeHtml(base)}</span></div>`;
    }
    // Indicadores comparam com o mês anterior: Mês → mês anterior; YTD/Ano → acumulado
    // até o mês anterior (Ano usa o último mês com dado como referência).
    function kpisHtml() {
      const [lo, hi] = range();
      const ref = period === "fy" ? lastDataMonth() || 12 : month;
      const yy = (y) => String(y).slice(2);
      let pLo = 0, pHi = 0, pYear = year, base = "";
      if (period === "mes") {
        pYear = month === 1 ? year - 1 : year;
        pLo = pHi = month === 1 ? 12 : month - 1;
        base = `${MESES[pLo - 1]}/${yy(pYear)}`;
      } else {
        pLo = 1; pHi = ref - 1;
        base = pHi >= 1 ? `acum. até ${MESES[pHi - 1]}/${yy(year)}` : `${MESES[0]}/${yy(year - 1)}`;
      }
      // Volume = só máquinas; Faturamento, RL, MP e MC1% = total da empresa (fecha com o DRE)
      const cur = zero(); const prev = zero();
      const curM = zero(); const prevM = zero();
      model.parents.forEach((p) => {
        add(cur, sumRange(p, year, lo, hi));
        if (pHi >= pLo) add(prev, sumRange(p, pYear, pLo, pHi));
        if (p.kind === "M") {
          add(curM, sumRange(p, year, lo, hi));
          if (pHi >= pLo) add(prevM, sumRange(p, pYear, pLo, pHi));
        }
      });
      const cards = [
        ["Volume de máquinas", fmtQty(curM.q), "<small>un</small>", delta(curM.q, prevM.q, false, false, base)],
        ["Faturamento", brl(cur.fat), "", delta(cur.fat, prev.fat, false, false, base)],
        ["Receita líquida", brl(cur.rl), "", delta(cur.rl, prev.rl, false, false, base)],
        ["MP", brl(cur.mp), "", delta(cur.mp, prev.mp, true, false, base)],
        ["MC1%", mbOf(cur) == null ? "–" : `${fmt(mbOf(cur) * 100, 1)}%`, "", delta(mbOf(cur), mbOf(prev), false, true, base)]
      ];
      return `<div class="cmm-kpis">${cards.map((c) => `<div class="cmm-kpi"><div class="cmm-kl">${c[0]}</div><div class="cmm-kv">${c[1]}${c[2]}</div>${c[3]}</div>`).join("")}</div>`;
    }

    // ── Tooltip padrão do Cockpit (.cockpit-tip) ────────────────────────
    const tipAttr = (rows) => `data-tip data-tip-rows="${escapeHtml(JSON.stringify(rows))}"`;
    function ensureTip() {
      if (tipEl && document.body.contains(tipEl)) return tipEl;
      tipEl = document.createElement("div");
      tipEl.className = "cockpit-tip";
      tipEl.hidden = true;
      document.body.appendChild(tipEl);
      return tipEl;
    }
    function fillTip(node) {
      let rows = [];
      try { rows = JSON.parse(node.dataset.tipRows || "[]"); } catch { rows = []; }
      const tip = ensureTip();
      tip.innerHTML = rows.map((r) => `<div class="cockpit-tip-row"><span>${escapeHtml(r.label)}</span><strong${r.tone ? ` class="kpi-trend ${escapeHtml(r.tone)}"` : ""}>${escapeHtml(r.value)}</strong></div>`).join("");
      tip.hidden = false;
    }
    function moveTip(e) {
      const tip = ensureTip();
      const w = tip.offsetWidth || 120;
      tip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - w - 8)}px`;
      tip.style.top = `${Math.max(e.clientY - 64, 8)}px`;
    }
    const hideTip = () => { if (tipEl) tipEl.hidden = true; };

    // ── Mapa do portfólio (bolhas) ──────────────────────────────────────
    function bubblesHtml() {
      const [lo, hi] = range();
      const W = 640, H = 330, L = 52, R = 18, T = 16, B = 38;
      const xKey = bubbleX; // "vol" | "rl"
      const pts = machines().map((p) => {
        const c = sumRange(p, year, lo, hi);
        return { n: p.label, g: p.group, q: c.q, rl: c.rl, x: xKey === "rl" ? c.rl : c.q, mb: mbOf(c), m: c.rl - c.mp };
      }).filter((p) => p.q > 0 && p.mb != null && p.x > 0);
      if (!pts.length) return `<div class="cmm-empty">Sem vendas de máquinas no período.</div>`;
      const tot = zero();
      machines().forEach((p) => add(tot, sumRange(p, year, lo, hi)));
      const avgMb = mbOf(tot);
      const avgX = (xKey === "rl" ? tot.rl : tot.q) / pts.length;
      const xmax = Math.max(...pts.map((p) => p.x)) * 1.1;
      const ymin = Math.min(0.1, ...pts.map((p) => p.mb)) - 0.03;
      const ymax = Math.max(...pts.map((p) => p.mb)) + 0.05;
      const X = (v) => L + (v / xmax) * (W - L - R);
      const Y = (v) => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
      const mx = Math.max(...pts.map((p) => Math.abs(p.m)), 1);
      const rad = (p) => 4 + Math.sqrt(Math.abs(p.m) / mx) * 13;
      const xFmt = (v) => (xKey === "rl" ? brl(v) : fmt(v));
      let s = "";
      for (let i = 0; i <= 4; i++) { const v = ymin + ((ymax - ymin) * i) / 4; s += `<line class="cmm-grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${fmt(v * 100, 0)}%</text>`; }
      for (let i = 0; i <= 5; i++) { const v = (xmax * i) / 5; s += `<text x="${X(v)}" y="${H - 20}" text-anchor="middle">${xFmt(v)}</text>`; }
      s += `<line class="cmm-axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><line class="cmm-axis" x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/>`;
      s += `<line class="cmm-ref" x1="${X(avgX)}" x2="${X(avgX)}" y1="${T}" y2="${H - B}"/><line class="cmm-ref" x1="${L}" x2="${W - R}" y1="${Y(avgMb)}" y2="${Y(avgMb)}"/>`;
      s += `<text class="cmm-quad" x="${W - R - 4}" y="${T + 10}" text-anchor="end">ESTRELAS</text><text class="cmm-quad" x="${L + 6}" y="${T + 10}">NICHOS</text><text class="cmm-quad" x="${W - R - 4}" y="${H - B - 6}" text-anchor="end">VOLUME, POUCA MARGEM</text><text class="cmm-quad" x="${L + 6}" y="${H - B - 6}">A REVISAR</text>`;
      // maiores primeiro: as menores desenham por cima e não ficam escondidas
      const ordered = pts.slice().sort((a, b) => Math.abs(b.m) - Math.abs(a.m));
      let bubbles = "";
      ordered.forEach((p) => {
        const col = p.g === "Grãos" ? "var(--cmm-cyan)" : p.g === "Pecuária" ? "var(--cmm-violet)" : "var(--cmm-amber)";
        bubbles += `<circle ${tipAttr([{ label: "Máquina", value: p.n }, { label: "VOL", value: `${fmtQty(p.q)} un` }, { label: "RL", value: brl(p.rl) }, { label: "MC1%", value: `${fmt(p.mb * 100, 1)}%` }, { label: "Margem", value: brl(p.m) }])} cx="${X(p.x)}" cy="${Y(p.mb)}" r="${rad(p)}" fill="${col}" fill-opacity=".32" stroke="${col}" stroke-width="1.4"/>`;
      });
      // rótulos: só as 8 maiores; cada um tenta acima, abaixo, direita e esquerda sem encostar em outro rótulo
      const boxes = [];
      const hit = (b) => boxes.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
      let labels = "";
      ordered.slice(0, 8).forEach((p) => {
        const cx = X(p.x), cy = Y(p.mb), r = rad(p), w = p.n.length * 6.1 + 6, h = 13;
        const cands = [
          { x: cx - w / 2, y: cy - r - h - 1, a: "middle", tx: cx },
          { x: cx - w / 2, y: cy + r + 2, a: "middle", tx: cx },
          { x: cx + r + 3, y: cy - h / 2, a: "start", tx: cx + r + 6 },
          { x: cx - r - 3 - w, y: cy - h / 2, a: "end", tx: cx - r - 6 }
        ];
        const pick = cands.find((b) => b.x >= L && b.x + w <= W - R && b.y >= T - 4 && b.y + h <= H - B + 14 && !hit({ x: b.x, y: b.y, w, h }));
        if (!pick) return;
        boxes.push({ x: pick.x, y: pick.y, w, h });
        labels += `<text class="cmm-bl" x="${pick.tx}" y="${pick.y + h - 3}" text-anchor="${pick.a}">${escapeHtml(p.n)}</text>`;
      });
      s += `<g class="cmm-bubs">${bubbles}</g>${labels}`;
      s += `<text x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">${xKey === "rl" ? "Receita líquida (R$)" : "Volume (un)"}</text>`;
      return `<svg class="cmm-svg" viewBox="0 0 ${W} ${H}" width="100%">${s}</svg>
        <div class="cmm-legend"><span><i style="background:var(--cmm-cyan)"></i>Grãos</span><span><i style="background:var(--cmm-violet)"></i>Pecuária</span><span><i style="background:var(--cmm-amber)"></i>Cargograin</span><span>Linhas tracejadas = média do portfólio</span><span>Nome só nas 8 maiores · passe o mouse para ver as demais</span></div>`;
    }

    // ── Ponte da margem (mês do filtro vs mês anterior; toda a empresa) ──
    function bridgeData() {
      const cm = nMonths();
      const py = cm === 1 ? year - 1 : year;
      const pm = cm === 1 ? 12 : cm - 1;
      const byItem = (list) => calculateMarginBridge(list.map((it) => ({ it, parent: it.parent, a: cellsOf(it, py)[pm - 1], b: cellsOf(it, year)[cm - 1] })));
      // Fecha com o DRE: máquinas e Transgrain (poucos códigos) entram item a item, cada
      // grupo com a sua própria margem média. Peças, Acessórios e demais complementares
      // entram em bloco, com volume 1 nos dois meses: sem efeito Volume nem Mix, e a
      // variação do RL e da MP do bloco cai inteira em RL e MP.
      const blocks = model.parents.filter((p) => p.kind === "C" && p.fam !== "Transgrain").map((p) => {
        const mk = (c) => ({ ...c, q: 1 });
        const it = { cod: "", desc: p.label, nr: "", tipo: p.label, parent: p };
        return { ...calculateMarginBridge([{ it, parent: p, a: mk(cellsOf(p, py)[pm - 1]), b: mk(cellsOf(p, year)[cm - 1]) }])[0], block: true };
      });
      const rows = [...byItem(model.items.filter((it) => it.parent.kind === "M")), ...byItem(model.items.filter((it) => it.parent.fam === "Transgrain")), ...blocks];
      const sum = (k) => rows.reduce((t, r) => t + r[k], 0);
      return { rows, py, pm, cm, lab0: `${MESES[pm - 1]}/${String(py).slice(2)}`, lab1: `${MESES[cm - 1]}/${String(year).slice(2)}`, M0: sum("M0"), M1: sum("M1"), rl0: rows.reduce((t, r) => t + r.a.rl, 0), rl1: rows.reduce((t, r) => t + r.b.rl, 0), vol: sum("vol"), pr: sum("pr"), co: sum("co"), mix: sum("mix") };
    }
    function bridgeHtml() {
      const B = bridgeData();
      const steps = [[`MC1 ${B.lab0}`, B.M0, true], ["Volume", B.vol, false, "vol"], ["RL", B.pr, false, "pr"], ["MP", B.co, false, "co"], ["Mix", B.mix, false, "mix"], [`MC1 ${B.lab1}`, B.M1, true]];
      const W = 640, H = 330, L = 12, T = 30, Bt = 52, n = steps.length, bw = 56, gap = (W - L * 2 - bw * n) / (n - 1);
      let run = 0;
      const pos = steps.map((s) => { if (s[2]) { run = s[1]; return [0, s[1]]; } const r = [run, run + s[1]]; run += s[1]; return r; });
      const all = pos.flat();
      const mx = Math.max(...all, 1) * 1.08;
      const mn = Math.min(0, ...all);
      const Y = (v) => T + (1 - (v - mn) / (mx - mn)) * (H - T - Bt);
      const gid = (c) => `cmm-br-${c}`;
      let s = `<defs>${[["blue", "--cmm-blue"], ["pos", "--cmm-pos"], ["neg", "--cmm-neg"]].map(([k, v]) => `<linearGradient id="${gid(k)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="color-mix(in srgb, var(${v}) 78%, #fff)"/><stop offset="22%" stop-color="var(${v})"/><stop offset="100%" stop-color="color-mix(in srgb, var(${v}) 72%, #000)"/></linearGradient>`).join("")}</defs><line class="cmm-axis" x1="${L}" x2="${W - L}" y1="${Y(0)}" y2="${Y(0)}"/>`;
      steps.forEach((st, i) => {
        const x = L + i * (bw + gap);
        const [a, b] = pos[i];
        const top = Y(Math.max(a, b));
        const h = Math.max(2, Math.abs(Y(a) - Y(b)));
        const col = `url(#${gid(st[2] ? "blue" : st[1] >= 0 ? "pos" : "neg")})`;
        const name = st[0].split(" (")[0];
        const tone = st[1] >= 0 ? "positive" : "negative";
        const tip = st[2] ? [{ label: name, value: brl(st[1]) }]
          : [{ label: "Efeito", value: name }, { label: "Valor", value: `${sgn(st[1])}${brl(Math.abs(st[1]))}`, tone }, { label: "% da margem anterior", value: B.M0 ? `${sgn(st[1])}${fmt(Math.abs(st[1] / B.M0) * 100, 1)}%` : "–", tone }, { label: "", value: "clique para detalhar" }];
        s += `<rect ${tipAttr(tip)} ${st[3] ? `data-eff="${st[3]}" style="cursor:pointer"` : ""} x="${x}" y="${top}" width="${bw}" height="${h}" rx="4" fill="${col}"/>`;
        if (st[2]) {
          const rl = i === 0 ? B.rl0 : B.rl1;
          s += `<text x="${x + bw / 2}" y="${top + h / 2 + 4}" text-anchor="middle" style="fill:#fff;font-weight:700;font-size:12px;pointer-events:none">${rl ? fmt((st[1] / rl) * 100, 1) + "%" : "–"}</text>`;
        }
        s += `<text class="cmm-bl" x="${x + bw / 2}" y="${top - 6}" text-anchor="middle">${st[2] ? brl(st[1]) : sgn(st[1]) + brl(Math.abs(st[1]))}</text>`;
        s += `<text x="${x + bw / 2}" y="${H - 30}" text-anchor="middle">${escapeHtml(name)}</text>`;
        if (st[0].includes("(")) s += `<text x="${x + bw / 2}" y="${H - 18}" text-anchor="middle" style="font-size:9.5px">(${escapeHtml(st[0].split(" (")[1])}</text>`;
        if (i < n - 1) s += `<line class="cmm-ref" x1="${x + bw}" x2="${L + (i + 1) * (bw + gap)}" y1="${Y(pos[i][1])}" y2="${Y(pos[i][1])}"/>`;
      });
      return { svg: `<svg class="cmm-svg" viewBox="0 0 ${W} ${H}" width="100%">${s}</svg>`, sub: `MC1 R$ (RL − MP) · ${B.lab1} vs mês anterior (${B.lab0})` };
    }

    // ── Pop-over de detalhamento da ponte ───────────────────────────────
    const dlt = (v, d, posGood, suf = "") => {
      const good = posGood ? v >= 0 : v <= 0;
      return `<span class="${Math.abs(v) < 0.05 ? "" : good ? "pos" : "neg"}">${v >= 0 ? "+" : "−"}${fmt(Math.abs(v), d)}${suf}</span>`;
    };
    function popCols(k, ag) {
      const a = ag.a, b = ag.b;
      if (k === "vol") {
        const d = ag.volumeUnits;
        const pu = ag.mu || null;
        return [fmtQty(a.q), fmtQty(b.q), dlt(d, 1, true), pu == null ? "–" : fmt(pu, 0)];
      }
      if (k === "mix") {
        const sg2 = (v) => `<span class="${Math.abs(v) < 0.5 ? "" : v >= 0 ? "pos" : "neg"}">${sgn(v)}${brl(Math.abs(v))}</span>`;
        return [sg2(ag.dM), sg2(-ag.vol), sg2(-ag.pr), sg2(-ag.co)];
      }
      const f = k === "pr" ? "rl" : "mp";
      const ua = a.q ? a[f] / a.q : null;
      const ub = b.q ? b[f] / b.q : null;
      return [ua == null ? "–" : fmt(ua, 0), ub == null ? "–" : fmt(ub, 0), ua == null || ub == null ? "–" : dlt(ub - ua, 0, k === "pr"), fmtQty(b.q)];
    }
    function popHtml() {
      const B = bridgeData();
      const k = pop.eff;
      const heads = {
        vol: [`Qtd ${B.lab0}`, `Qtd ${B.lab1}`, "Δ un", `× Margem/un média ${B.lab0}`],
        pr: [`RL/un ${B.lab0}`, `RL/un ${B.lab1}`, "Δ R$/un", `× Qtd ${B.lab1}`],
        co: [`MP/un ${B.lab0}`, `MP/un ${B.lab1}`, "Δ R$/un", `× Qtd ${B.lab1}`],
        mix: [`Δ MC1 ${B.lab1} vs ${B.lab0}`, "− Volume", "− RL", "− MP"]
      }[k];
      const agg = (rs) => {
        const a = zero(), b = zero();
        let e = 0, dM = 0, vol = 0, pr = 0, co = 0, volumeUnits = 0, mu = 0;
        rs.forEach((r) => { add(a, r.a); add(b, r.b); e += r[k]; dM += r.dM; vol += r.vol; pr += r.pr; co += r.co; volumeUnits += r.volumeUnits; mu = r.mu; });
        return { a, b, e, dM, vol, pr, co, volumeUnits, mu };
      };
      const eff = (e) => (Math.abs(e) < 0.5 ? `<strong>–</strong>` : `<strong class="${e >= 0 ? "pos" : "neg"}">${sgn(e)}${brl(Math.abs(e))}</strong>`);
      const line = (label, ag, cls, att, cod, full) => `<tr class="${cls}" ${att || ""}><td ${full ? tipAttr(cod ? [{ label: "Código", value: cod }, { label: "Nome", value: full }] : [{ label: "Nome", value: full }]) : ""}>${cod ? `<span class="cmm-cd">${escapeHtml(cod)}</span>` : ""}${label}</td>${popCols(k, ag).map((v) => `<td>${v}</td>`).join("")}<td class="cmm-ano">${eff(ag.e)}</td></tr>`;
      const tot = agg(B.rows);
      let h = `<table class="cmm-tbl cmm-pt"><thead><tr><th>Nome</th>${heads.map((t) => `<th>${escapeHtml(t)}</th>`).join("")}<th class="cmm-ano">Efeito em R$</th></tr></thead><tbody>`;
      h += `<tr class="cmm-tot"><td>Total</td>${heads.map(() => "<td></td>").join("")}<td class="cmm-ano">${eff(tot.e)}</td></tr>`;
      const groups = [...new Set(model.parents.map((p) => p.group))].sort((x, y) => groupRank(x) - groupRank(y) || x.localeCompare(y, "pt-BR"));
      groups.forEach((g) => {
        const gr = B.rows.filter((r) => r.parent.group === g);
        if (!gr.length) return;
        h += `<tr class="cmm-grp"><td colspan="${heads.length + 2}">${escapeHtml(g)}</td></tr>`;
        const byParent = new Map();
        gr.forEach((r) => { if (!byParent.has(r.parent)) byParent.set(r.parent, []); byParent.get(r.parent).push(r); });
        [...byParent.entries()].map(([p, rs]) => [p, rs, agg(rs)]).filter(([, , ag]) => ag.a.q || ag.b.q || ag.e).sort((x, y) => Math.abs(y[2].e) - Math.abs(x[2].e)).forEach(([p, rs, ag]) => {
          if (rs[0].block) { h += line(escapeHtml(p.label), ag, "cmm-mq", "", "", p.label); return; } // bloco: sem abertura por código
          const open = pop.open.has(p.key);
          h += line(`<span class="cmm-car">${open ? "▾" : "▸"}</span>${escapeHtml(p.label)}`, ag, "cmm-mq", `data-pp="${escapeHtml(p.key)}"`, "", p.label);
          if (!open) return;
          const act = rs.filter((r) => r.a.q || r.b.q || r[k]).sort((x, y) => Math.abs(y[k]) - Math.abs(x[k]));
          act.slice(0, TOP_ITEMS).forEach((r) => { h += line(escapeHtml(r.it.desc), agg([r]), "cmm-prod", "", r.it.cod, r.it.desc); });
          if (act.length > TOP_ITEMS) h += line(`Demais itens (${act.length - TOP_ITEMS})`, agg(act.slice(TOP_ITEMS)), "cmm-prod");
        });
      });
      h += "</tbody></table>";
      const e = EFFECTS[k];
      return `<div class="cmm-ov" data-ov><div class="cmm-pop"><div class="cmm-pop-h"><div><div class="cmm-pop-t">${e.name} <span>· ${e.sub} · ${B.lab1} vs ${B.lab0}</span></div><div class="cmm-pop-s">${eff(tot.e)} <span>soma dos itens = valor da barra</span></div></div><button class="cmm-btn" data-pop-close>✕ Fechar</button></div><div class="cmm-pop-b">${h}</div></div></div>`;
    }

    // ── Tabela corrida ──────────────────────────────────────────────────
    // Valor + variação (▲/▼) de uma célula contra a coluna anterior. d = Δ% (ou Δ p.p. no MC1%);
    // good = favorável (em MP, queda é favorável). Usado pela tela e pela exportação.
    function cellDelta(c, prev, k) {
      const v = val(c, k);
      if (v == null) return { v: null, d: null, good: null };
      let d = null, good = null;
      if (prev) {
        const p = val(prev, k);
        if (p != null && p !== 0) {
          d = k === "mb" ? (v - p) * 100 : (v / p - 1) * 100;
          good = k === "mp" ? d < 0 : d > 0;
        }
      }
      return { v, d, good };
    }
    function mcell(c, prev, k) {
      const SLOT = `<span class="cmm-dl" style="visibility:hidden">&nbsp;</span>`;
      const x = cellDelta(c, prev, k);
      if (x.v == null) return `–${SLOT}`;
      const t = showVal(x.v, k);
      if (x.d == null) return t + SLOT;
      return `${t}<span class="cmm-dl ${x.good ? "pos" : "neg"}">${x.d >= 0 ? "▲" : "▼"} ${fmt(Math.abs(x.d), k === "vol" ? 0 : 1)}${k === "mb" ? " pp" : "%"}</span>`;
    }
    // Média do 4º trimestre do ano anterior (coluna "2025").
    function q4Of(obj) {
      const o = zero();
      for (let m = 10; m <= 12; m++) add(o, cellsOf(obj, year - 1)[m - 1]);
      ["q", "fat", "rl", "mp"].forEach((f) => { o[f] /= 3; });
      return o;
    }
    // Colunas de uma linha: 4º tri anterior, 12 meses (null = depois do filtro) e total do ano.
    // Cada coluna traz a célula e a anterior contra a qual se compara.
    function columnsOf(obj, n, k) {
      const q4 = q4Of(obj);
      const months = [];
      for (let m = 0; m < 12; m++) months.push(m >= n ? null : { c: cellsOf(obj, year)[m], prev: m > 0 ? cellsOf(obj, year)[m - 1] : q4 });
      let tri = null;
      if (n > 3 && k !== "vol") { tri = zero(); for (let m = n - 3; m < n; m++) add(tri, cellsOf(obj, year)[m]); ["q", "fat", "rl", "mp"].forEach((f) => { tri[f] *= n / 3; }); }
      return { q4, months, ano: { c: sumRange(obj, year, 1, n), prev: tri } };
    }
    const nz = (c) => Math.abs(c.q) > 1e-9 || Math.abs(c.fat) > 0.005 || Math.abs(c.rl) > 0.005 || Math.abs(c.mp) > 0.005;
    const wrapObj = (list) => { const cells = {}; [year - 1, year].forEach((y) => { cells[y] = Array.from({ length: 12 }, zero); list.forEach((p) => cellsOf(p, y).forEach((c, i) => add(cells[y][i], c))); }); return { cells }; };
    // Linhas visíveis da tabela, na ordem da tela (respeita linhas abertas e filtro de equipe).
    // kind: row | grp | empty. Para row: cls (cmm-tot/-mq/-prod/-sub), label (texto puro),
    // open (null = sem seta), key (linhas-pai), cod/full (itens) e obj (dados).
    // full = exportação: todas as linhas-pai abertas e TODOS os itens por código (sem "Demais itens").
    function tableRows(full = false) {
      const n = nMonths();
      // Linha 100% zerada (ano do filtro até o mês exibido e 4º tri do ano anterior) não aparece.
      const active = (obj) => cellsOf(obj, year).slice(0, n).some(nz) || nz(q4Of(obj));
      const out = [];
      const tm = tableModel();
      const mach = tm.parents.filter((p) => p.kind === "M");
      let shown = 0;
      out.push({ kind: "row", cls: "cmm-tot", label: "Total Máquinas", obj: wrapObj(mach) });
      const groups = [...new Set(mach.map((p) => p.group))].sort((a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b, "pt-BR"));
      const addParent = (p) => {
        const open = full || openRows.has(p.key);
        out.push({ kind: "row", cls: "cmm-mq", label: p.label, open, key: p.key, full: p.label, obj: p });
        if (!open) return;
        const act = p.items.filter(active);
        act.sort((a, b) => Math.abs(sumRange(b, year, 1, n).rl) - Math.abs(sumRange(a, year, 1, n).rl));
        (full ? act : act.slice(0, TOP_ITEMS)).forEach((it) => out.push({ kind: "row", cls: "cmm-prod", label: it.desc, cod: it.cod, full: it.desc, obj: it }));
        if (!full && act.length > TOP_ITEMS) out.push({ kind: "row", cls: "cmm-prod", label: `Demais itens (${act.length - TOP_ITEMS})`, obj: wrapObj(act.slice(TOP_ITEMS)) });
      };
      groups.forEach((g) => {
        const list = mach.filter((p) => p.group === g && active(p)).sort(byMachineName);
        if (!list.length) return;
        shown += list.length;
        out.push({ kind: "grp", label: g });
        list.forEach(addParent);
        out.push({ kind: "row", cls: "cmm-sub", label: `Total ${g}`, obj: wrapObj(list) });
      });
      const comp = tm.parents.filter((p) => p.kind === "C" && active(p)).sort((a, b) => (COMP_ORDER.indexOf(a.label) + 1 || 99) - (COMP_ORDER.indexOf(b.label) + 1 || 99) || a.label.localeCompare(b.label, "pt-BR"));
      if (comp.length) {
        shown += comp.length;
        out.push({ kind: "grp", label: COMP_GROUP });
        comp.forEach(addParent);
      }
      if (!shown) out.push({ kind: "empty" });
      return out;
    }
    function tableHtml() {
      const k = metric;
      const n = nMonths();
      const row = (d) => {
        const cols = columnsOf(d.obj, n, k);
        const att = d.key ? `data-row="${escapeHtml(d.key)}"` : "";
        const tip = d.full ? tipAttr(d.cod ? [{ label: "Código", value: d.cod }, { label: "Nome", value: d.full }] : [{ label: "Nome", value: d.full }]) : "";
        const caret = d.open == null ? "" : `<span class="cmm-car">${d.open ? "▾" : "▸"}</span>`;
        let r = `<tr class="${d.cls}" ${att}><td ${tip}>${d.cod ? `<span class="cmm-cd">${escapeHtml(d.cod)}</span>` : ""}${caret}${escapeHtml(d.label)}</td><td class="cmm-q4">${k === "vol" ? fmt(cols.q4.q, 1) : showVal(val(cols.q4, k), k)}</td>`;
        // Máquinas (linha-pai ou item): clicar no valor do mês abre as NFs da célula, em qualquer métrica
        const cods = d.cod ? (d.obj.tipo === "Máquinas" ? [d.cod] : null) : d.key && d.obj.kind === "M" ? d.obj.items.map((i) => i.cod) : null;
        cols.months.forEach((m, i) => {
          if (!m) { r += `<td class="cmm-future"></td>`; return; }
          const link = cods && nz(m.c) ? ` class="cmm-det" data-det="${i + 1}" data-cods="${escapeHtml(cods.join("|"))}" data-dt="${escapeHtml(d.full || d.label)}" ${tipAttr([{ label: "Notas fiscais", value: "Clique para ver" }])}` : "";
          r += `<td${link}>${mcell(m.c, m.prev, k)}</td>`;
        });
        return `${r}<td class="cmm-ano">${mcell(cols.ano.c, cols.ano.prev, k)}</td></tr>`;
      };
      let h = `<thead><tr><th></th><th class="cmm-q4" title="Média ponderada do 4º trimestre de ${year - 1}">${year - 1}</th>${MESES.map((m) => `<th>${m}</th>`).join("")}<th class="cmm-ano">${year}</th></tr></thead><tbody>`;
      tableRows().forEach((d) => {
        if (d.kind === "grp") h += `<tr class="cmm-grp"><td colspan="15">${escapeHtml(d.label)}</td></tr>`;
        else if (d.kind === "empty") h += `<tr><td colspan="15" style="text-align:center;padding:18px;color:var(--cmm-muted)">Sem vendas para ${escapeHtml(equipeLabel())} no período.</td></tr>`;
        else h += row(d);
      });
      return `<div class="cmm-tw"><table class="cmm-tbl">${h}</tbody></table></div>`;
    }
    // ── Detalhe por NF (clique no valor do mês) ─────────────────────────
    async function openDetail(title, mes, cods) {
      det = { title, month: mes, cods, loading: true, rows: [], error: "" };
      hideTip();
      render(host);
      const mine = det;
      try {
        const org = await resolveOrganizationId();
        const res = await callSupabaseRpc("comercial_margens_detalhe", {
          p_org: org, p_year: year, p_month: mes, p_cods: cods,
          p_territorio: equipe.tipo === "territorio" ? [equipe.valor] : null,
          p_coordenacao: equipe.tipo === "coordenacao" ? [equipe.valor] : null,
          p_vendedor: equipe.tipo === "vendedor" ? [equipe.valor] : null
        });
        mine.rows = Array.isArray(res) ? res : res?.rows || [];
      } catch (e) {
        console.error(e);
        mine.error = "Não foi possível carregar as notas fiscais.";
      } finally {
        mine.loading = false;
        if (det === mine) render(host);
      }
    }
    function detHtml() {
      const fmtDate = (s) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "–");
      const money = (v) => fmt(v, 2);
      const tot = zero();
      det.rows.forEach((r) => add(tot, { q: Number(r.quantidade) || 0, fat: Number(r.fat) || 0, rl: Number(r.rl) || 0, mp: Number(r.mp) || 0 }));
      const mc = (c) => { const v = mbOf(c); return v == null ? "–" : `${fmt(v * 100, 1)}%`; };
      const nf = (r) => escapeHtml([r.documento, r.serie_documento].filter(Boolean).join("-") || "–");
      let body;
      if (det.loading) body = `<div class="cmm-empty">Carregando notas fiscais…</div>`;
      else if (det.error) body = `<div class="cmm-empty">${escapeHtml(det.error)}</div>`;
      else if (!det.rows.length) body = `<div class="cmm-empty">Nenhuma nota fiscal encontrada.</div>`;
      else {
        const line = (r) => {
          const c = { q: Number(r.quantidade) || 0, fat: Number(r.fat) || 0, rl: Number(r.rl) || 0, mp: Number(r.mp) || 0 };
          return `<tr><td>${fmtDate(r.entry_date)}</td><td>${nf(r)}</td><td>${escapeHtml(r.cod_produto || "–")}</td><td class="l cmm-dw" ${tipAttr([{ label: "Produto", value: r.produto || "–" }])}>${escapeHtml(r.produto || "–")}</td><td class="l cmm-dw" ${tipAttr([{ label: "Cliente", value: r.cliente || "–" }])}>${escapeHtml(r.cliente || "–")}</td><td class="l">${escapeHtml(r.cidade || "–")}</td><td>${escapeHtml(r.uf || "–")}</td><td class="l">${escapeHtml(r.regional || "–")}</td><td>${fmtQty(c.q)}</td><td>${money(c.fat)}</td><td>${money(c.rl)}</td><td>${money(c.mp)}</td><td>${mc(c)}</td></tr>`;
        };
        body = `<table class="cmm-dtbl"><thead><tr><th>Data</th><th>NF</th><th>Cód. Prod.</th><th class="l">Descr. Produto</th><th class="l">Cliente</th><th class="l">Cidade</th><th>UF</th><th class="l">Regional</th><th>VOL</th><th>FAT</th><th>RL</th><th>MP</th><th>MC1%</th></tr></thead><tbody>${det.rows.map(line).join("")}</tbody><tfoot><tr><td colspan="8" class="l">Total · ${det.rows.length} ${det.rows.length === 1 ? "linha" : "linhas"}</td><td>${fmtQty(tot.q)}</td><td>${money(tot.fat)}</td><td>${money(tot.rl)}</td><td>${money(tot.mp)}</td><td>${mc(tot)}</td></tr></tfoot></table>`;
      }
      // Mesmo visual do popover de detalhe do Painel de Vendas (cabeçalho, ✕ e fontes da tabela)
      return `<div class="cmm-dov" data-dov><div class="cmm-dpop" role="dialog" aria-label="Notas fiscais"><div class="cmm-dhead"><span>${escapeHtml(det.title)} · ${MESES[det.month - 1]}/${year}</span><button class="cmm-dx" type="button" aria-label="Fechar" data-det-close>✕</button></div><div class="cmm-dbody">${body}</div></div></div>`;
    }
    // Foto da tabela para exportar: as 5 métricas (VOL, FAT, RL, MP, MC1%), cada linha com todos os
    // itens por código, respeitando o filtro de equipe (mas não a métrica/linhas abertas da tela).
    function exportSnapshot() {
      const n = nMonths();
      const unit = (k) => (k === "vol" ? "Volume (un)" : k === "mb" ? "MC1% = (RL − MP) ÷ RL" : "Valores unitários (R$ ÷ volume)");
      return {
        title: "Evolutivo de Margens · Marcher",
        year, nMonths: n, months: MESES,
        periodTxt: `Jan–${MESES[n - 1]}/${year}`,
        equipe: equipeLabel(),
        metrics: METRICS.map(([key, label]) => ({ key, label, unit: unit(key) })),
        rows: tableRows(true).map((d) => {
          if (d.kind !== "row") return d.kind === "grp" ? { kind: "grp", label: d.label } : { kind: "empty" };
          const m = {};
          METRICS.forEach(([k]) => {
            const cols = columnsOf(d.obj, n, k);
            m[k] = {
              q4: { v: k === "vol" ? cols.q4.q : val(cols.q4, k), d: null, good: null },
              months: cols.months.map((x) => (x ? cellDelta(x.c, x.prev, k) : null)),
              ano: cellDelta(cols.ano.c, cols.ano.prev, k)
            };
          });
          return { kind: d.cls.replace("cmm-", ""), label: d.label, cod: d.cod || "", m };
        })
      };
    }

    // ── Página ──────────────────────────────────────────────────────────
    function render(container) {
      if (!container) return;
      ensureStyle();
      exporter?.ensureStyle();
      host = container;
      if (!isSupabaseConfigured()) { container.innerHTML = `<div class="cmm-empty">Configuração do Supabase ausente.</div>`; return; }
      if (error && !model) { container.innerHTML = `<div class="cmm-empty">${escapeHtml(error)}<br><button class="cmm-btn" data-retry>Tentar novamente</button></div>`; return; }
      if (!model) { container.innerHTML = `<div class="cmm-empty">Carregando margens…</div>`; return; }
      const last = lastDataMonth();
      const notes = [];
      if (period === "fy" && last && last < 12) notes.push(`ANO ${year} · dados realizados até ${MESES[last - 1].toLowerCase()} (parcial)`);
      if (model.semNome) notes.push(`${model.semNome} máquina(s) sem nome reduzido no cadastro de Produtos`);
      if (model.semCultura) notes.push(`${model.semCultura} máquina(s) sem cultura no cadastro de Produtos`);
      const br = bridgeHtml();
      const periodTxt = period === "mes" ? MESES[month - 1] : period === "ytd" ? `Jan–${MESES[month - 1]}` : "Jan–Dez";
      container.innerHTML = `<div class="cmm ${loading ? "cmm-loading" : ""}">
        <div class="cmm-header"><div><h1>EVOLUTIVO DE MARGENS</h1><p>Comercial · ${periodTxt}/${year} · líquido de devoluções · MC1% = (RL − MP) ÷ RL</p></div>
          <div class="cmm-hr"><div class="cmm-period">${[["mes", "Mês"], ["ytd", "YTD"], ["fy", "Ano"]].map(([v, l]) => `<button data-period="${v}" class="${period === v ? "active" : ""}">${l}</button>`).join("")}</div>${exporter ? exporter.menuHtml(false) : ""}</div></div>
        ${notes.length ? `<div class="cmm-note">${notes.map(escapeHtml).join(" · ")}</div>` : ""}
        ${kpisHtml()}
        <div class="cmm-two">
          <div class="cmm-card"><div class="cmm-hd"><div><h2>Posicionamento de Portfólio · Máquinas</h2><p>${bubbleX === "rl" ? "Receita líquida" : "Volume"} × MC1% · tamanho = margem em R$ (RL − MP)</p></div><div class="cmm-tabs" title="Eixo X do mapa">${[["vol", "VOL"], ["rl", "RL"]].map(([v, l]) => `<button data-bx="${v}" class="${bubbleX === v ? "active" : ""}">${l}</button>`).join("")}</div></div>${bubblesHtml()}</div>
          <div class="cmm-card"><div class="cmm-hd"><h2>Ponte da MC1 · Marcher</h2><p>${escapeHtml(br.sub)}</p></div>${br.svg}</div>
        </div>
        <div class="cmm-card"><div class="cmm-hd cmm-hd-stk"><div><h2>Evolutivo de Margens · Marcher</h2><p>Valores unitários (÷ volume)</p></div>
          <div class="cmm-ctrls"><div class="cmm-tabs">${METRICS.map(([v, l]) => `<button data-metric="${v}" class="${metric === v ? "active" : ""}">${l}</button>`).join("")}</div>${equipeControlHtml()}</div></div>
          <div class="${tLoading ? "cmm-tdim" : ""}">${tableHtml()}</div>
          <div class="cmm-legend"><span>▲▼ verde = favorável · vermelho = desfavorável (em MP, queda é favorável)</span><span>– = mês sem volume líquido</span><span>Meses após o filtro ficam vazios</span><span>Coluna do ano anterior = média ponderada do 4º trimestre (VOL = média mensal)</span><span>Coluna do ano atual = acumulado até o mês do filtro · a seta compara com os 3 últimos meses do mesmo ano (não se aplica ao VOL)</span></div></div>
        ${pop ? popHtml() : ""}${det ? detHtml() : ""}</div>`;
      bind(container);
      exporter?.bind(container, exportSnapshot);
      syncStickyOffset(container);
    }

    // O bloco fixo do card (título, subtítulo e filtros) tem altura variável: o cabeçalho da
    // tabela congela logo abaixo dele.
    function syncStickyOffset(container) {
      const hd = container.querySelector(".cmm-hd-stk");
      const tw = container.querySelector(".cmm-tw");
      if (!hd || !tw) return;
      // O contêiner que rola (.main-panel) tem espaçamento no topo; o bloco fixo sobe sobre
      // essa faixa para as linhas não aparecerem atrás do título.
      let pad = 0;
      for (let e = container.parentElement; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (/(auto|scroll)/.test(cs.overflowY)) { pad = parseFloat(cs.paddingTop) || 0; break; }
      }
      const root = container.querySelector(".cmm");
      if (root) root.style.setProperty("--cmm-pad", `${pad}px`);
      tw.style.setProperty("--cmm-hd-h", `${Math.max(0, hd.offsetHeight - pad)}px`);
    }

    function bind(container) {
      container.querySelector("[data-retry]")?.addEventListener("click", () => load(true));
      container.querySelectorAll("[data-period]").forEach((b) => b.addEventListener("click", () => { period = b.dataset.period; pop = null; render(container); }));
      container.querySelectorAll("[data-bx]").forEach((b) => b.addEventListener("click", () => { bubbleX = b.dataset.bx; render(container); }));
      container.querySelector("#cmm-eq-btn")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        openEq = !openEq;
        if (openEq && !eqLoaded) { try { await loadEqOptions(); } catch (err) { console.error(err); } }
        render(container);
        container.querySelector("#cmm-eq-btn")?.focus();
      });
      container.querySelector(".cmm-eqpop")?.addEventListener("click", (e) => e.stopPropagation());
      container.querySelectorAll('input[name="cmm-equipe"]').forEach((r) => r.addEventListener("change", () => {
        const [tipo, valor] = r.value.split("|");
        equipe = tipo ? { tipo, valor } : { tipo: "", valor: "" };
        openEq = false;
        loadTable();
      }));
      if (!resizeBound) {
        resizeBound = true;
        window.addEventListener("resize", () => { if (host?.isConnected) syncStickyOffset(host); });
      }
      if (!eqCloseBound) {
        eqCloseBound = true;
        document.addEventListener("click", (e) => { if (!openEq || !host?.isConnected || e.target.closest("#cmm-eq")) return; openEq = false; render(host); });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openEq && host?.isConnected) { openEq = false; render(host); } });
      }
      container.querySelectorAll("[data-metric]").forEach((b) => b.addEventListener("click", () => { metric = b.dataset.metric; render(container); }));
      container.querySelectorAll("tr[data-row]").forEach((tr) => tr.addEventListener("click", () => { const k = tr.dataset.row; if (openRows.has(k)) openRows.delete(k); else openRows.add(k); render(container); }));
      container.querySelectorAll("td[data-det]").forEach((td) => td.addEventListener("click", (e) => { e.stopPropagation(); openDetail(td.dataset.dt, Number(td.dataset.det), td.dataset.cods.split("|")); }));
      container.querySelector("[data-det-close]")?.addEventListener("click", () => { det = null; render(container); });
      container.querySelector("[data-dov]")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) { det = null; render(container); } });
      container.querySelectorAll("[data-eff]").forEach((el) => el.addEventListener("click", () => { hideTip(); pop = { eff: el.dataset.eff, open: new Set() }; render(container); }));
      container.querySelectorAll("tr[data-pp]").forEach((tr) => tr.addEventListener("click", () => { const k = tr.dataset.pp; if (pop.open.has(k)) pop.open.delete(k); else pop.open.add(k); render(container); }));
      container.querySelector("[data-pop-close]")?.addEventListener("click", () => { pop = null; render(container); });
      container.querySelector("[data-ov]")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) { pop = null; render(container); } });
      container.querySelectorAll("[data-tip]").forEach((el) => {
        el.addEventListener("pointerenter", () => fillTip(el));
        el.addEventListener("pointermove", moveTip);
        el.addEventListener("pointerleave", hideTip);
      });
      if (!keyBound) {
        keyBound = true;
        document.addEventListener("keydown", (e) => {
          if (e.key !== "Escape" || !host?.isConnected) return;
          if (det) { det = null; render(host); } else if (pop) { pop = null; render(host); }
        });
      }
    }

    function ensureStyle() {
      if (document.getElementById("cmm-style")) return;
      const s = document.createElement("style");
      s.id = "cmm-style";
      s.textContent = `
      .cmm{--cmm-panel:var(--theme-surface,#121826);--cmm-panel2:var(--theme-surface-raised,var(--theme-surface,#171f30));--cmm-line:var(--theme-border,#232c40);--cmm-text:var(--theme-ink,#eef1f6);--cmm-muted:var(--theme-ink-secondary,#9aa4b8);--cmm-faint:var(--theme-ink-muted,#6b7280);--cmm-blue:#4f7cff;--cmm-pos:var(--theme-ink-green,#3fd49a);--cmm-neg:var(--theme-ink-red,#ff6b7a);--cmm-cyan:var(--theme-ink-teal,#14b8a6);--cmm-violet:var(--theme-ink-violet,#8b5cf6);--cmm-amber:var(--theme-ink-amber,#f59e0b);color:var(--cmm-text);font-size:12px;min-width:0}
      .cmm *{box-sizing:border-box}.cmm button{font:inherit}
      .cmm-header{display:flex;gap:20px;align-items:flex-start;justify-content:space-between;padding:2px 6px 14px;flex-wrap:wrap}.cmm-header h1{font-size:18px;letter-spacing:.01em;margin:0 0 4px}.cmm-header p{margin:0;color:var(--cmm-muted)}
      .cmm-hr{display:flex;align-items:center;gap:8px}.cmm-period{box-sizing:border-box;height:34px}
      .cmm-period,.cmm-tabs{display:inline-flex;align-items:center;gap:2px;background:var(--cmm-panel2);border:1px solid var(--cmm-line);border-radius:8px;padding:2px}.cmm-period button,.cmm-tabs button{border:0;background:transparent;color:var(--cmm-muted);font-size:12px;font-weight:500;padding:6px 12px;border-radius:6px;cursor:pointer}.cmm-period button.active,.cmm-tabs button.active{background:#4f7cff;color:#fff}
      .cmm-btn{border:1px solid var(--cmm-line);border-radius:8px;background:var(--cmm-panel);color:var(--cmm-text);padding:7px 12px;cursor:pointer}
      .cmm-note{margin:0 6px 12px;padding:7px 10px;border:1px dashed var(--cmm-amber);border-radius:8px;color:var(--cmm-amber);font-size:11px}
      .cmm-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:0 0 10px}.cmm-kpi{min-width:0;border:1px solid var(--cmm-line);border-radius:12px;background:var(--cmm-panel2);padding:12px 14px}.cmm-kl{font-size:10px;color:var(--cmm-muted);text-transform:uppercase;letter-spacing:.04em}.cmm-kv{font-size:20px;font-weight:700;margin:6px 0 3px;white-space:nowrap;font-variant-numeric:tabular-nums}.cmm-kv small{font-size:11px;color:var(--cmm-muted);font-weight:500;margin-left:4px}.cmm-d{font-size:10.5px;font-weight:600}.cmm-d span{color:var(--cmm-faint);font-weight:500;margin-left:4px}.cmm-muted{color:var(--cmm-faint)!important;font-weight:500}
      .cmm .pos{color:var(--cmm-pos)}.cmm .neg{color:var(--cmm-neg)}
      .cmm-two{display:grid;grid-template-columns:1.15fr 1fr;gap:10px;margin-bottom:10px}.cmm-card{border:1px solid var(--cmm-line);border-radius:12px;background:var(--cmm-panel2);padding:14px 16px;min-width:0}.cmm-two .cmm-card{margin-bottom:0}.cmm>.cmm-card{margin-bottom:10px}
      .cmm-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:10px}.cmm-hd h2{margin:0;font-size:13px;font-weight:650}.cmm-hd p{margin:2px 0 0;color:var(--cmm-muted);font-size:11px}
      .cmm-svg text{fill:var(--cmm-muted);font-family:inherit;font-size:10.5px}.cmm-svg .cmm-bl{fill:var(--cmm-text);font-weight:600}.cmm-svg .cmm-quad{font-weight:700}.cmm-grid{stroke:var(--theme-border-subtle,#ffffff10)}.cmm-axis{stroke:var(--cmm-line)}.cmm-ref{stroke:var(--cmm-faint);stroke-dasharray:4 4}
      .cmm-bubs circle{transition:fill-opacity .12s,stroke-opacity .12s}.cmm-bubs:hover circle{fill-opacity:.12;stroke-opacity:.3}.cmm-bubs circle:hover{fill-opacity:.65;stroke-opacity:1}
      .cmm-hd-stk{position:sticky;top:calc(-1 * var(--cmm-pad,0px));z-index:6;background:var(--cmm-panel2);margin:calc(-1 * var(--cmm-pad,0px)) 0 0;padding:var(--cmm-pad,0px) 0 10px}.cmm-ctrls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.cmm-tdim{opacity:.45;pointer-events:none;transition:opacity .15s}
      .cmm-eqwrap{position:relative}.cmm-eqbtn{min-height:35px;display:flex;align-items:center;background:var(--cmm-panel2);border:1px solid var(--cmm-line);border-radius:10px;padding:3px;font:inherit;font-size:12.5px;color:var(--cmm-text);cursor:pointer;transition:border-color .14s,box-shadow .14s,background .14s}
      .cmm-eqbtn:hover{background:var(--theme-surface-raised,var(--cmm-panel2))}.cmm-eqbtn.is-open{border-color:#4f7cff;box-shadow:0 0 0 2px rgba(79,124,255,.16)}.cmm-eqbtn:focus-visible{outline:2px solid #4f7cff;outline-offset:2px}
      .cmm-eqbtn .ico{color:var(--cmm-faint);display:flex;padding:0 6px 0 7px}.cmm-eqbtn .lbl{color:var(--cmm-muted);white-space:nowrap;padding-right:8px}
      .cmm-eqbtn .val{min-height:27px;display:flex;align-items:center;gap:8px;color:var(--cmm-text);background:var(--theme-surface-raised,var(--cmm-panel2));border-radius:7px;padding:5px 10px;font-weight:600;white-space:nowrap;max-width:200px}
      .cmm-eqbtn .val-text{min-width:0;overflow:hidden;text-overflow:ellipsis}.cmm-eqbtn .val::after{content:"";width:6px;height:6px;flex:none;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-2px) rotate(45deg);opacity:.65;transition:transform .14s}
      .cmm-eqbtn.is-open .val::after{transform:translateY(2px) rotate(225deg)}.cmm-eqbtn.is-filtered .val{background:rgba(79,124,255,.22);color:var(--theme-ink-blue,#cbd8ff)}
      .cmm-eqpop{position:absolute;top:calc(100% + 6px);right:0;z-index:30;background:var(--theme-surface,#171f30);border:1px solid var(--cmm-line);border-radius:12px;padding:12px;min-width:240px;max-width:300px;box-shadow:0 20px 44px var(--theme-shadow-color,rgba(0,0,0,.5))}
      .cmm-eqpop h4{margin:0 0 8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--cmm-faint);font-weight:600}.cmm-eqpop .grp+.grp{margin-top:10px;padding-top:10px;border-top:1px solid var(--cmm-line)}
      .cmm-eqpop-list{max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:2px}.cmm-eqpop label{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:5px 6px;border-radius:7px;cursor:pointer}
      .cmm-eqpop label:hover{background:var(--theme-surface-raised,rgba(255,255,255,.05))}.cmm-eqpop input[type=radio]{width:auto;min-width:0;flex:none;accent-color:#4f7cff;margin:0}
      .cmm-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:10.5px;color:var(--cmm-muted);margin-top:8px}.cmm-legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
      .cmm-empty{padding:40px 15px;text-align:center;color:var(--cmm-muted);border:1px dashed var(--cmm-line);border-radius:12px}
      .cmm-tw{border:1px solid var(--cmm-line);border-radius:10px}
      .cmm-tbl{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed;font-variant-numeric:tabular-nums}.cmm-tbl th,.cmm-tbl td{padding:4px 6px;vertical-align:middle;text-align:right;white-space:nowrap;border-bottom:1px solid var(--theme-border-subtle,#ffffff0d);font-size:11.5px}
      .cmm-tbl th{position:sticky;top:var(--cmm-hd-h,0px);z-index:2;background:var(--cmm-panel);color:var(--cmm-muted);font-weight:650;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}
      .cmm-tbl th:first-child,.cmm-tbl td:first-child{text-align:left;position:sticky;left:0;z-index:1;background:var(--cmm-panel);width:230px;max-width:230px;overflow:hidden;text-overflow:ellipsis;border-right:1px solid var(--cmm-line)}.cmm-tbl th:first-child{z-index:3}.cmm-tbl th:nth-child(2),.cmm-tbl td:nth-child(2){width:60px}.cmm-tbl th.cmm-ano,.cmm-tbl td.cmm-ano{width:78px}
      .cmm-pt{table-layout:auto}.cmm-pt th:first-child,.cmm-pt td:first-child{width:320px;max-width:320px}.cmm-pt th:nth-child(2),.cmm-pt td:nth-child(2),.cmm-pt th.cmm-ano,.cmm-pt td.cmm-ano{width:auto}
      .cmm-q4{border-right:1px solid var(--cmm-line)}th.cmm-q4,td.cmm-q4,th.cmm-ano,td.cmm-ano{background:linear-gradient(rgba(79,124,255,.12),rgba(79,124,255,.12)),var(--cmm-panel);font-weight:700;border-left:1px solid var(--cmm-line)}
      .cmm-grp td{background:var(--cmm-panel);font-weight:700;text-transform:uppercase;letter-spacing:.03em;font-size:10.5px!important;text-align:left!important}
      .cmm-sub td,.cmm-sub td:first-child{background:linear-gradient(var(--theme-surface-tint,rgba(255,255,255,.04)),var(--theme-surface-tint,rgba(255,255,255,.04))),var(--cmm-panel);font-weight:700}.cmm-tot td,.cmm-tot td:first-child{background:linear-gradient(var(--theme-surface-muted,rgba(255,255,255,.07)),var(--theme-surface-muted,rgba(255,255,255,.07))),var(--cmm-panel);font-weight:750}.cmm-tot td.cmm-ano,.cmm-sub td.cmm-ano{background:linear-gradient(rgba(79,124,255,.12),rgba(79,124,255,.12)),var(--cmm-panel)}
      .cmm-mq{cursor:pointer}.cmm-mq:hover td{background:var(--theme-surface-tint,rgba(255,255,255,.05))}.cmm-mq:hover td:first-child{background:var(--cmm-panel)}.cmm-car{display:inline-block;width:14px;color:var(--cmm-faint);font-size:10px}
      .cmm-prod td,.cmm-prod td:first-child{color:var(--cmm-muted);font-size:11.5px}.cmm-prod td:first-child{padding-left:24px}.cmm-cd{display:inline-block;min-width:7ch;color:var(--cmm-faint);margin-right:6px;font-variant-numeric:tabular-nums}
      .cmm-future{color:var(--cmm-faint)}.cmm-dl{display:block;font-size:9.5px;font-weight:600;line-height:1;margin-top:2px}.cmm-dl.pos,.cmm-dl.neg{opacity:.95}
      .cmm-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;align-items:center;justify-content:center}.cmm-pop{width:85vw;height:85vh;background:var(--cmm-panel);border:1px solid var(--cmm-line);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden;color:var(--cmm-text)}
      .cmm-pop-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:14px 18px;border-bottom:1px solid var(--cmm-line)}.cmm-pop-t{font-size:15px;font-weight:700}.cmm-pop-t span{color:var(--cmm-muted);font-weight:500;font-size:12px}.cmm-pop-s{margin-top:4px}.cmm-pop-s span{color:var(--cmm-faint);font-size:11px;margin-left:6px}.cmm-pop-b{overflow:auto;flex:1;padding:0 18px 14px}
      /* Janelas estreitas (ex.: zoom 125%): modo compacto, sem rolagem horizontal no card; com overflow no contêiner o cabeçalho deixaria de congelar */
      @media(max-width:1180px){.cmm-tbl th,.cmm-tbl td{padding:3px 4px;font-size:10.5px}.cmm-tbl th:first-child,.cmm-tbl td:first-child{width:170px;max-width:170px}.cmm-tbl th:nth-child(2),.cmm-tbl td:nth-child(2){width:56px}.cmm-tbl th.cmm-ano,.cmm-tbl td.cmm-ano{width:68px}}
      @media(max-width:760px){.cmm-tw{overflow-x:auto}.cmm-tbl{min-width:900px}.cmm-pt{min-width:0}}
      @media(max-width:1150px){.cmm-kpis{grid-template-columns:repeat(3,1fr)}.cmm-two{grid-template-columns:1fr}}
      .cmm-tbl td.cmm-det{cursor:pointer}.cmm-tbl td.cmm-det:hover{background:var(--cmm-panel2);box-shadow:inset 0 0 0 1px var(--cmm-blue)}
      .cmm-dov{position:fixed;inset:0;z-index:9800;background:var(--theme-overlay,rgba(0,0,0,.55));display:flex;align-items:center;justify-content:center;padding:32px}
      .cmm-dpop{background:var(--theme-surface,#121317);border:1px solid var(--theme-border,#2a2d34);border-radius:14px;box-shadow:0 30px 80px var(--theme-shadow-color,rgba(0,0,0,.65));color:var(--theme-ink,#fff);width:94vw;max-height:94vh;display:flex;flex-direction:column;overflow:hidden}
      .cmm-dhead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 18px;border-bottom:1px solid var(--theme-border,#2a2d34);font-size:11px;font-weight:600;color:var(--theme-ink-secondary,#a1a7b3);text-transform:uppercase;letter-spacing:.05em}
      .cmm-dx{background:none;border:none;color:var(--theme-ink-muted,#6b7280);font-size:16px;cursor:pointer;line-height:1;padding:0 2px}.cmm-dx:hover{color:var(--theme-ink,#fff)}
      .cmm-dbody{overflow:auto}
      .cmm-dtbl{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}.cmm-dtbl th,.cmm-dtbl td{padding:6px 12px;font-size:10px;text-align:right;white-space:nowrap}.cmm-dtbl .l{text-align:left}.cmm-dtbl td.l{max-width:260px;overflow:hidden;text-overflow:ellipsis}.cmm-dtbl td.cmm-dw{max-width:220px}
      .cmm-dtbl th{position:sticky;top:0;background:var(--theme-surface,#121317);color:var(--theme-ink-muted,#6b7280);font-weight:500;font-size:8px;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid var(--theme-border,#2a2d34);z-index:1}
      .cmm-dtbl tbody tr:not(:last-child) td{border-bottom:1px solid var(--theme-border-subtle,rgba(255,255,255,.05))}
      .cmm-dtbl tfoot td{border-top:1px solid var(--theme-border,#2a2d34);font-weight:600;color:var(--theme-ink,#fff);position:sticky;bottom:0;background:var(--theme-surface,#121317)}
      @media(max-width:768px){.cmm-kpis{grid-template-columns:repeat(2,1fr)}.cmm-pop{width:100vw;height:100vh;border-radius:0}}
      `;
      document.head.appendChild(s);
    }

    function renderSelectedMargens(container, reportId) {
      if (reportId !== REPORT_ID) { entered = false; equipe = { tipo: "", valor: "" }; openEq = false; tmodel = null; tKey = ""; return false; }
      syncPeriod();
      host = container;
      if (model && loadedYear === year) render(container);
      else load();
      return true;
    }
    return { renderSelectedMargens, REPORT_ID };
  }
  window.VECTON_COMERCIAL_MARGENS = { createComercialMargensModule, calculateMarginBridge };
})(window);
