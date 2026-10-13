(function attachVectonComercialMargens(window) {
  // Relatório "Margens por Máquinas" (Comercial). Dados: RPC comercial_margens_itens
  // (migration 255), que devolve o FAT realizado por produto e mês, líquido de
  // devolução, para o ano do período e o anterior. Tudo o mais (KPIs, mapa do
  // portfólio, ponte, tabela e pop-over) é calculado aqui, sem novas idas ao banco.
  //
  // Definições: MP = custo de matéria-prima; MB% = (RL − MP) ÷ RL. Na tabela os
  // valores são UNITÁRIOS (÷ volume); linhas-pai = total ÷ volume total (média
  // ponderada pelo volume), nunca média de unitários.
  function createComercialMargensModule(deps) {
    const { escapeHtml, state, resolveOrganizationId, callSupabaseRpc, isSupabaseConfigured } = deps;
    const REPORT_ID = "comercialMargens";
    const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const GROUP_ORDER = ["Grãos", "Pecuária"];
    const COMP_GROUP = "Linhas complementares";
    const TOP_ITEMS = 30; // linhas abertas listam os maiores itens; o resto vira "Demais itens"
    const COMP_ORDER = ["Peças", "Transgrain", "Acessórios"];
    const METRICS = [["vol", "VOL"], ["fat", "FAT"], ["rl", "RL"], ["mp", "MP"], ["mb", "MB%"]];
    const EFFECTS = {
      vol: { name: "Volume", sub: "Variação de quantidade × preço (RL/un) do mês anterior" },
      pr: { name: "Preço", sub: "RL por unidade" },
      co: { name: "Custo", sub: "MP por unidade" },
      mix: { name: "Mix", sub: "O que sobra da variação da margem após volume, preço e custo" }
    };

    let host = null;
    let year = Number(state.currentPeriod?.year || new Date().getFullYear());
    let month = Number(state.currentPeriod?.month || 1);
    let model = null;
    let loadedYear = null;
    let loading = false;
    let error = "";
    let period = "ytd"; // mes | ytd | fy
    let metric = "vol";
    let openRows = new Set();
    let pop = null; // { eff, open:Set }
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
        const group = mach ? it.cult || "(sem cultura)" : COMP_GROUP;
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
    const machines = () => model.parents.filter((p) => p.kind === "M");
    const groupRank = (g) => { const i = GROUP_ORDER.indexOf(g); return i >= 0 ? i : g === "(sem cultura)" ? 99 : 50; };

    // ── Carga ───────────────────────────────────────────────────────────
    function syncPeriod() {
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
      } catch (e) {
        console.error(e);
        error = /permiss/i.test(String(e?.message || e)) ? "Você não tem permissão para ver este relatório." : "Não foi possível carregar as margens.";
        model = null;
      } finally {
        loading = false;
        render(host);
      }
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
    function delta(a, b, inv, pp) {
      if (b == null || a == null || (!pp && !b)) return `<div class="cmg-d cmg-muted">sem base em ${year - 1}</div>`;
      const d = pp ? (a - b) * 100 : (a / b - 1) * 100;
      const good = inv ? d < 0 : d > 0;
      return `<div class="cmg-d ${good ? "pos" : "neg"}">${d >= 0 ? "▲" : "▼"} ${fmt(Math.abs(d), 1)}${pp ? " p.p." : "%"}<span>vs ${year - 1}</span></div>`;
    }
    function kpisHtml() {
      const [lo, hi] = range();
      const cur = zero(); const prev = zero();
      machines().forEach((p) => { add(cur, sumRange(p, year, lo, hi)); add(prev, sumRange(p, year - 1, lo, hi)); });
      const cards = [
        ["Volume de máquinas", fmtQty(cur.q), "<small>un</small>", delta(cur.q, prev.q)],
        ["Faturamento", brl(cur.fat), "", delta(cur.fat, prev.fat)],
        ["Receita líquida", brl(cur.rl), "", delta(cur.rl, prev.rl)],
        ["MP", brl(cur.mp), "", delta(cur.mp, prev.mp, true)],
        ["MB%", mbOf(cur) == null ? "–" : `${fmt(mbOf(cur) * 100, 1)}%`, "", delta(mbOf(cur), mbOf(prev), false, true)]
      ];
      return `<div class="cmg-kpis">${cards.map((c) => `<div class="cmg-kpi"><div class="cmg-kl">${c[0]}</div><div class="cmg-kv">${c[1]}${c[2]}</div>${c[3]}</div>`).join("")}</div>`;
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
      const W = 640, H = 330, L = 48, R = 16, T = 14, B = 38;
      const pts = machines().map((p) => {
        const c = sumRange(p, year, lo, hi);
        return { n: p.label, g: p.group, q: c.q, mb: mbOf(c), m: c.rl - c.mp };
      }).filter((p) => p.q > 0 && p.mb != null);
      if (!pts.length) return `<div class="cmg-empty">Sem vendas de máquinas no período.</div>`;
      const tot = zero();
      machines().forEach((p) => add(tot, sumRange(p, year, lo, hi)));
      const avgMb = mbOf(tot);
      const avgQ = tot.q / pts.length;
      const xmax = Math.max(...pts.map((p) => p.q)) * 1.12;
      const ymin = Math.min(0.1, ...pts.map((p) => p.mb)) - 0.02;
      const ymax = Math.max(...pts.map((p) => p.mb)) + 0.04;
      const X = (v) => L + (v / xmax) * (W - L - R);
      const Y = (v) => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
      const mx = Math.max(...pts.map((p) => Math.abs(p.m)), 1);
      let s = "";
      for (let i = 0; i <= 4; i++) { const v = ymin + ((ymax - ymin) * i) / 4; s += `<line class="cmg-grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${fmt(v * 100, 0)}%</text>`; }
      for (let i = 0; i <= 5; i++) { const v = (xmax * i) / 5; s += `<text x="${X(v)}" y="${H - 20}" text-anchor="middle">${fmt(v)}</text>`; }
      s += `<line class="cmg-axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><line class="cmg-axis" x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/>`;
      s += `<line class="cmg-ref" x1="${X(avgQ)}" x2="${X(avgQ)}" y1="${T}" y2="${H - B}"/><line class="cmg-ref" x1="${L}" x2="${W - R}" y1="${Y(avgMb)}" y2="${Y(avgMb)}"/>`;
      s += `<text class="cmg-quad" x="${W - R - 4}" y="${T + 10}" text-anchor="end">ESTRELAS</text><text class="cmg-quad" x="${L + 6}" y="${T + 10}">NICHOS</text><text class="cmg-quad" x="${W - R - 4}" y="${H - B - 6}" text-anchor="end">VOLUME, POUCA MARGEM</text><text class="cmg-quad" x="${L + 6}" y="${H - B - 6}">A REVISAR</text>`;
      pts.forEach((p) => {
        const r = 7 + Math.sqrt(Math.abs(p.m) / mx) * 20;
        const col = p.g === "Grãos" ? "var(--cmg-cyan)" : p.g === "Pecuária" ? "var(--cmg-violet)" : "var(--cmg-amber)";
        s += `<g><circle ${tipAttr([{ label: "Máquina", value: p.n }, { label: "VOL", value: `${fmtQty(p.q)} un` }, { label: "MB%", value: `${fmt(p.mb * 100, 1)}%` }, { label: "Margem", value: brl(p.m) }])} cx="${X(p.q)}" cy="${Y(p.mb)}" r="${r}" fill="${col}" fill-opacity=".38" stroke="${col}" stroke-width="1.5"/><text class="cmg-bl" x="${X(p.q)}" y="${Y(p.mb) - r - 3}" text-anchor="middle">${escapeHtml(p.n)}</text></g>`;
      });
      s += `<text x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">Volume (un)</text>`;
      return `<svg class="cmg-svg" viewBox="0 0 ${W} ${H}" width="100%">${s}</svg>
        <div class="cmg-legend"><span><i style="background:var(--cmg-cyan)"></i>Grãos</span><span><i style="background:var(--cmg-violet)"></i>Pecuária</span><span>Linhas tracejadas = média do portfólio</span></div>`;
    }

    // ── Ponte da margem (mês do filtro vs mês anterior; toda a empresa) ──
    function bridgeData() {
      const cm = nMonths();
      const py = cm === 1 ? year - 1 : year;
      const pm = cm === 1 ? 12 : cm - 1;
      const rows = model.items.map((it) => ({ it, parent: it.parent, a: cellsOf(it, py)[pm - 1], b: cellsOf(it, year)[cm - 1] }));
      rows.forEach((r) => {
        const { a, b } = r;
        r.M0 = a.rl - a.mp;
        r.M1 = b.rl - b.mp;
        r.dM = r.M1 - r.M0;
        r.vol = a.q > 0 ? (b.q - a.q) * (a.rl / a.q) : 0; // Δ quantidade real × preço (RL/un) do mês anterior
        const both = a.q > 0 && b.q > 0;
        r.pr = both ? b.rl - (b.q * a.rl) / a.q : 0;
        r.co = both ? -(b.mp - (b.q * a.mp) / a.q) : 0;
        r.mix = r.dM - r.vol - r.pr - r.co; // resíduo: o que sobra
      });
      const sum = (k) => rows.reduce((t, r) => t + r[k], 0);
      return { rows, py, pm, cm, lab0: `${MESES[pm - 1]}/${String(py).slice(2)}`, lab1: `${MESES[cm - 1]}/${String(year).slice(2)}`, M0: sum("M0"), M1: sum("M1"), vol: sum("vol"), pr: sum("pr"), co: sum("co"), mix: sum("mix") };
    }
    function bridgeHtml() {
      const B = bridgeData();
      const steps = [[`Margem ${B.lab0}`, B.M0, true], ["Volume", B.vol, false, "vol"], ["Preço (RL/un)", B.pr, false, "pr"], ["Custo (MP/un)", B.co, false, "co"], ["Mix", B.mix, false, "mix"], [`Margem ${B.lab1}`, B.M1, true]];
      const W = 560, H = 330, L = 12, T = 30, Bt = 52, n = steps.length, bw = 56, gap = (W - L * 2 - bw * n) / (n - 1);
      let run = 0;
      const pos = steps.map((s) => { if (s[2]) { run = s[1]; return [0, s[1]]; } const r = [run, run + s[1]]; run += s[1]; return r; });
      const all = pos.flat();
      const mx = Math.max(...all, 1) * 1.08;
      const mn = Math.min(0, ...all);
      const Y = (v) => T + (1 - (v - mn) / (mx - mn)) * (H - T - Bt);
      let s = `<line class="cmg-axis" x1="${L}" x2="${W - L}" y1="${Y(0)}" y2="${Y(0)}"/>`;
      steps.forEach((st, i) => {
        const x = L + i * (bw + gap);
        const [a, b] = pos[i];
        const top = Y(Math.max(a, b));
        const h = Math.max(2, Math.abs(Y(a) - Y(b)));
        const col = st[2] ? "var(--cmg-blue)" : st[1] >= 0 ? "var(--cmg-pos)" : "var(--cmg-neg)";
        const name = st[0].split(" (")[0];
        const tone = st[1] >= 0 ? "positive" : "negative";
        const tip = st[2] ? [{ label: name, value: brl(st[1]) }]
          : [{ label: "Efeito", value: name }, { label: "Valor", value: `${sgn(st[1])}${brl(Math.abs(st[1]))}`, tone }, { label: "% da margem anterior", value: B.M0 ? `${sgn(st[1])}${fmt(Math.abs(st[1] / B.M0) * 100, 1)}%` : "–", tone }, { label: "", value: "clique para detalhar" }];
        s += `<rect ${tipAttr(tip)} ${st[3] ? `data-eff="${st[3]}" style="cursor:pointer"` : ""} x="${x}" y="${top}" width="${bw}" height="${h}" rx="4" fill="${col}" fill-opacity="${st[2] ? 0.9 : 0.75}"/>`;
        s += `<text class="cmg-bl" x="${x + bw / 2}" y="${top - 6}" text-anchor="middle">${st[2] ? brl(st[1]) : sgn(st[1]) + brl(Math.abs(st[1]))}</text>`;
        s += `<text x="${x + bw / 2}" y="${H - 30}" text-anchor="middle">${escapeHtml(name)}</text>`;
        if (st[0].includes("(")) s += `<text x="${x + bw / 2}" y="${H - 18}" text-anchor="middle" style="font-size:9.5px">(${escapeHtml(st[0].split(" (")[1])}</text>`;
        if (i < n - 1) s += `<line class="cmg-ref" x1="${x + bw}" x2="${L + (i + 1) * (bw + gap)}" y1="${Y(pos[i][1])}" y2="${Y(pos[i][1])}"/>`;
      });
      return { svg: `<svg class="cmg-svg" viewBox="0 0 ${W} ${H}" width="100%">${s}</svg>`, sub: `Margem R$ (RL − MP) · ${B.lab1} vs mês anterior (${B.lab0}) · clique nas barras` };
    }

    // ── Pop-over de detalhamento da ponte ───────────────────────────────
    const dlt = (v, d, posGood, suf = "") => {
      const good = posGood ? v >= 0 : v <= 0;
      return `<span class="${Math.abs(v) < 0.05 ? "" : good ? "pos" : "neg"}">${v >= 0 ? "+" : "−"}${fmt(Math.abs(v), d)}${suf}</span>`;
    };
    function popCols(k, ag) {
      const a = ag.a, b = ag.b;
      if (k === "vol") {
        const d = b.q - a.q;
        const pu = d !== 0 ? ag.e / d : a.q ? a.rl / a.q : null;
        return [fmtQty(a.q), fmtQty(b.q), dlt(d, 0, true), pu == null ? "–" : fmt(pu, 0)];
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
        vol: [`Qtd ${B.lab0}`, `Qtd ${B.lab1}`, "Δ un", `× RL/un ${B.lab0}`],
        pr: [`RL/un ${B.lab0}`, `RL/un ${B.lab1}`, "Δ R$/un", `× Qtd ${B.lab1}`],
        co: [`MP/un ${B.lab0}`, `MP/un ${B.lab1}`, "Δ R$/un", `× Qtd ${B.lab1}`],
        mix: [`Δ Margem ${B.lab1} vs ${B.lab0}`, "− Volume", "− Preço", "− Custo"]
      }[k];
      const agg = (rs) => {
        const a = zero(), b = zero();
        let e = 0, dM = 0, vol = 0, pr = 0, co = 0;
        rs.forEach((r) => { add(a, r.a); add(b, r.b); e += r[k]; dM += r.dM; vol += r.vol; pr += r.pr; co += r.co; });
        return { a, b, e, dM, vol, pr, co };
      };
      const eff = (e) => (Math.abs(e) < 0.5 ? `<strong>–</strong>` : `<strong class="${e >= 0 ? "pos" : "neg"}">${sgn(e)}${brl(Math.abs(e))}</strong>`);
      const line = (label, ag, cls, att, cod) => `<tr class="${cls}" ${att || ""}><td>${cod ? `<span class="cmg-cd">${escapeHtml(cod)}</span>` : ""}${label}</td>${popCols(k, ag).map((v) => `<td>${v}</td>`).join("")}<td class="cmg-ano">${eff(ag.e)}</td></tr>`;
      const tot = agg(B.rows);
      let h = `<table class="cmg-tbl cmg-pt"><thead><tr><th>Nome reduzido</th>${heads.map((t) => `<th>${escapeHtml(t)}</th>`).join("")}<th class="cmg-ano">Efeito em R$</th></tr></thead><tbody>`;
      h += `<tr class="cmg-tot"><td>Total</td>${heads.map(() => "<td></td>").join("")}<td class="cmg-ano">${eff(tot.e)}</td></tr>`;
      const groups = [...new Set(model.parents.map((p) => p.group))].sort((x, y) => groupRank(x) - groupRank(y) || x.localeCompare(y, "pt-BR"));
      groups.forEach((g) => {
        const gr = B.rows.filter((r) => r.parent.group === g);
        if (!gr.length) return;
        h += `<tr class="cmg-grp"><td colspan="${heads.length + 2}">${escapeHtml(g)}</td></tr>`;
        const byParent = new Map();
        gr.forEach((r) => { if (!byParent.has(r.parent)) byParent.set(r.parent, []); byParent.get(r.parent).push(r); });
        [...byParent.entries()].map(([p, rs]) => [p, rs, agg(rs)]).filter(([, , ag]) => ag.a.q || ag.b.q || ag.e).sort((x, y) => Math.abs(y[2].e) - Math.abs(x[2].e)).forEach(([p, rs, ag]) => {
          const open = pop.open.has(p.key);
          h += line(`<span class="cmg-car">${open ? "▾" : "▸"}</span>${escapeHtml(p.label)}`, ag, "cmg-mq", `data-pp="${escapeHtml(p.key)}"`);
          if (!open) return;
          const act = rs.filter((r) => r.a.q || r.b.q || r[k]).sort((x, y) => Math.abs(y[k]) - Math.abs(x[k]));
          act.slice(0, TOP_ITEMS).forEach((r) => { h += line(escapeHtml(r.it.desc), agg([r]), "cmg-prod", "", r.it.cod); });
          if (act.length > TOP_ITEMS) h += line(`Demais itens (${act.length - TOP_ITEMS})`, agg(act.slice(TOP_ITEMS)), "cmg-prod");
        });
      });
      h += "</tbody></table>";
      const e = EFFECTS[k];
      return `<div class="cmg-ov" data-ov><div class="cmg-pop"><div class="cmg-pop-h"><div><div class="cmg-pop-t">${e.name} <span>· ${e.sub} · ${B.lab1} vs ${B.lab0}</span></div><div class="cmg-pop-s">${eff(tot.e)} <span>${k === "mix" ? "Δ margem − volume − preço − custo (o que sobra) · soma dos itens = valor da barra" : "soma dos itens = valor da barra"}</span></div></div><button class="cmg-btn" data-pop-close>✕ Fechar</button></div><div class="cmg-pop-b">${h}</div></div></div>`;
    }

    // ── Tabela corrida ──────────────────────────────────────────────────
    function mcell(c, prev, k) {
      const v = val(c, k);
      if (v == null) return "–";
      let t = showVal(v, k);
      if (prev) {
        const p = val(prev, k);
        if (p != null && p !== 0) {
          const d = k === "mb" ? (v - p) * 100 : (v / p - 1) * 100;
          const good = k === "mp" ? d < 0 : d > 0;
          t += `<span class="cmg-dl ${good ? "pos" : "neg"}">${d >= 0 ? "▲" : "▼"} ${fmt(Math.abs(d), k === "vol" ? 0 : 1)}${k === "mb" ? " pp" : "%"}</span>`;
        }
      }
      return t;
    }
    function tableHtml() {
      const k = metric;
      const n = nMonths();
      const unit = k === "vol" ? "un" : k === "mb" ? "%" : "R$ / un";
      const yearTotals = (obj) => sumRange(obj, year, 1, n);
      const q4obj = (obj) => {
        const o = zero();
        for (let m = 10; m <= 12; m++) add(o, cellsOf(obj, year - 1)[m - 1]);
        ["q", "fat", "rl", "mp"].forEach((f) => { o[f] /= 3; });
        return o;
      };
      const row = (label, obj, cls, att, cod) => {
        let r = `<tr class="${cls || ""}" ${att || ""}><td>${cod ? `<span class="cmg-cd">${escapeHtml(cod)}</span>` : ""}${label}</td><td class="cmg-q4">${k === "vol" ? fmt(q4obj(obj).q, 1) : showVal(val(q4obj(obj), k), k)}</td>`;
        for (let m = 0; m < 12; m++) {
          if (m >= n) { r += `<td class="cmg-future"></td>`; continue; }
          const c = cellsOf(obj, year)[m];
          const prev = m > 0 ? cellsOf(obj, year)[m - 1] : q4obj(obj);
          r += `<td>${mcell(c, prev, k)}</td>`;
        }
        let tri = null;
        if (n > 3) { tri = zero(); for (let m = n - 3; m < n; m++) add(tri, cellsOf(obj, year)[m]); ["q", "fat", "rl", "mp"].forEach((f) => { tri[f] *= n / 3; }); }
        return `${r}<td class="cmg-ano">${mcell(yearTotals(obj), tri, k)}</td></tr>`;
      };
      const wrapObj = (list) => { const cells = {}; [year - 1, year].forEach((y) => { cells[y] = Array.from({ length: 12 }, zero); list.forEach((p) => cellsOf(p, y).forEach((c, i) => add(cells[y][i], c))); }); return { cells }; };
      const rank = (p) => -Math.abs(sumRange(p, year, 1, n).rl);
      let h = `<thead><tr><th>Nome reduzido · ${unit}</th><th class="cmg-q4" title="Média ponderada do 4º trimestre de ${year - 1}">${year - 1}</th>${MESES.map((m) => `<th>${m}</th>`).join("")}<th class="cmg-ano">${year}</th></tr></thead><tbody>`;
      const mach = machines();
      h += row("Total Máquinas", wrapObj(mach), "cmg-tot");
      const groups = [...new Set(mach.map((p) => p.group))].sort((a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b, "pt-BR"));
      const addParent = (p) => {
        const open = openRows.has(p.key);
        h += row(`<span class="cmg-car">${open ? "▾" : "▸"}</span>${escapeHtml(p.label)}`, p, "cmg-mq", `data-row="${escapeHtml(p.key)}"`);
        if (!open) return;
        const act = p.items.filter((it) => cellsOf(it, year).some((c) => c.q || c.fat) || cellsOf(it, year - 1).some((c) => c.q || c.fat));
        act.sort((a, b) => Math.abs(sumRange(b, year, 1, n).rl) - Math.abs(sumRange(a, year, 1, n).rl));
        act.slice(0, TOP_ITEMS).forEach((it) => { h += row(escapeHtml(it.desc), it, "cmg-prod", "", it.cod); });
        if (act.length > TOP_ITEMS) h += row(`Demais itens (${act.length - TOP_ITEMS})`, wrapObj(act.slice(TOP_ITEMS)), "cmg-prod");
      };
      groups.forEach((g) => {
        const list = mach.filter((p) => p.group === g).sort((a, b) => rank(a) - rank(b));
        h += `<tr class="cmg-grp"><td colspan="15">${escapeHtml(g)}</td></tr>`;
        list.forEach(addParent);
        h += row(`Total ${escapeHtml(g)}`, wrapObj(list), "cmg-sub");
      });
      const comp = model.parents.filter((p) => p.kind === "C").sort((a, b) => (COMP_ORDER.indexOf(a.label) + 1 || 99) - (COMP_ORDER.indexOf(b.label) + 1 || 99) || a.label.localeCompare(b.label, "pt-BR"));
      if (comp.length) {
        h += `<tr class="cmg-grp"><td colspan="15">${COMP_GROUP}</td></tr>`;
        comp.forEach(addParent);
      }
      return `<div class="cmg-tw"><table class="cmg-tbl">${h}</tbody></table></div>`;
    }

    // ── Página ──────────────────────────────────────────────────────────
    function render(container) {
      if (!container) return;
      ensureStyle();
      host = container;
      if (!isSupabaseConfigured()) { container.innerHTML = `<div class="cmg-empty">Configuração do Supabase ausente.</div>`; return; }
      if (error && !model) { container.innerHTML = `<div class="cmg-empty">${escapeHtml(error)}<br><button class="cmg-btn" data-retry>Tentar novamente</button></div>`; return; }
      if (!model) { container.innerHTML = `<div class="cmg-empty">Carregando margens…</div>`; return; }
      const last = lastDataMonth();
      const notes = [];
      if (period === "fy" && last && last < 12) notes.push(`ANO ${year} · dados realizados até ${MESES[last - 1].toLowerCase()} (parcial)`);
      if (model.semNome) notes.push(`${model.semNome} máquina(s) sem nome reduzido no cadastro de Produtos`);
      if (model.semCultura) notes.push(`${model.semCultura} máquina(s) sem cultura no cadastro de Produtos`);
      const br = bridgeHtml();
      const periodTxt = period === "mes" ? MESES[month - 1] : period === "ytd" ? `Jan–${MESES[month - 1]}` : "Jan–Dez";
      container.innerHTML = `<div class="cmg ${loading ? "cmg-loading" : ""}">
        <div class="cmg-header"><div><h1>MARGENS POR MÁQUINAS</h1><p>Comercial · ${periodTxt}/${year} · líquido de devoluções · MB% = (RL − MP) ÷ RL</p></div>
          <div class="cmg-period">${[["mes", "Mês"], ["ytd", "YTD"], ["fy", "Ano"]].map(([v, l]) => `<button data-period="${v}" class="${period === v ? "active" : ""}">${l}</button>`).join("")}</div></div>
        ${notes.length ? `<div class="cmg-note">${notes.map(escapeHtml).join(" · ")}</div>` : ""}
        ${kpisHtml()}
        <div class="cmg-two">
          <div class="cmg-card"><div class="cmg-hd"><h2>Mapa do portfólio de máquinas</h2><p>Volume × MB% · tamanho = margem em R$ (RL − MP)</p></div>${bubblesHtml()}</div>
          <div class="cmg-card"><div class="cmg-hd"><h2>Ponte da margem</h2><p>${escapeHtml(br.sub)}</p></div>${br.svg}</div>
        </div>
        <div class="cmg-card"><div class="cmg-hd"><div><h2>Margens por máquinas</h2><p>Valores unitários (÷ volume) · setas comparam com o mês anterior · clique no nome reduzido para abrir os códigos</p></div>
          <div class="cmg-tabs">${METRICS.map(([v, l]) => `<button data-metric="${v}" class="${metric === v ? "active" : ""}">${l}</button>`).join("")}</div></div>
          ${tableHtml()}
          <div class="cmg-legend"><span>▲▼ verde = favorável · vermelho = desfavorável (em MP, queda é favorável)</span><span>– = mês sem volume líquido</span><span>Meses após o filtro ficam vazios</span><span>Coluna do ano anterior = média ponderada do 4º trimestre (VOL = média mensal)</span><span>Coluna do ano atual = acumulado até o mês do filtro · a seta compara com os 3 últimos meses do mesmo ano</span></div></div>
        ${pop ? popHtml() : ""}</div>`;
      bind(container);
    }

    function bind(container) {
      container.querySelector("[data-retry]")?.addEventListener("click", () => load(true));
      container.querySelectorAll("[data-period]").forEach((b) => b.addEventListener("click", () => { period = b.dataset.period; pop = null; render(container); }));
      container.querySelectorAll("[data-metric]").forEach((b) => b.addEventListener("click", () => { metric = b.dataset.metric; render(container); }));
      container.querySelectorAll("tr[data-row]").forEach((tr) => tr.addEventListener("click", () => { const k = tr.dataset.row; if (openRows.has(k)) openRows.delete(k); else openRows.add(k); render(container); }));
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
        document.addEventListener("keydown", (e) => { if (e.key === "Escape" && pop && host?.isConnected) { pop = null; render(host); } });
      }
    }

    function ensureStyle() {
      if (document.getElementById("cmg-style")) return;
      const s = document.createElement("style");
      s.id = "cmg-style";
      s.textContent = `
      .cmg{--cmg-panel:var(--theme-surface,#121826);--cmg-panel2:var(--theme-surface-raised,var(--theme-surface,#171f30));--cmg-line:var(--theme-border,#232c40);--cmg-text:var(--theme-ink,#eef1f6);--cmg-muted:var(--theme-ink-secondary,#9aa4b8);--cmg-faint:var(--theme-ink-muted,#6b7280);--cmg-blue:#4f7cff;--cmg-pos:var(--theme-ink-green,#3fd49a);--cmg-neg:var(--theme-ink-red,#ff6b7a);--cmg-cyan:var(--theme-ink-teal,#14b8a6);--cmg-violet:var(--theme-ink-violet,#8b5cf6);--cmg-amber:var(--theme-ink-amber,#f59e0b);color:var(--cmg-text);font-size:12px;min-width:0}
      .cmg *{box-sizing:border-box}.cmg button{font:inherit}
      .cmg-header{display:flex;gap:20px;align-items:flex-start;justify-content:space-between;padding:2px 6px 14px;flex-wrap:wrap}.cmg-header h1{font-size:18px;letter-spacing:.01em;margin:0 0 4px}.cmg-header p{margin:0;color:var(--cmg-muted)}
      .cmg-period,.cmg-tabs{display:inline-flex;align-items:center;gap:2px;background:var(--cmg-panel2);border:1px solid var(--cmg-line);border-radius:8px;padding:2px}.cmg-period button,.cmg-tabs button{border:0;background:transparent;color:var(--cmg-muted);font-size:12px;font-weight:500;padding:6px 12px;border-radius:6px;cursor:pointer}.cmg-period button.active,.cmg-tabs button.active{background:#4f7cff;color:#fff}
      .cmg-btn{border:1px solid var(--cmg-line);border-radius:8px;background:var(--cmg-panel);color:var(--cmg-text);padding:7px 12px;cursor:pointer}
      .cmg-note{margin:0 6px 12px;padding:7px 10px;border:1px dashed var(--cmg-amber);border-radius:8px;color:var(--cmg-amber);font-size:11px}
      .cmg-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:0 0 10px}.cmg-kpi{min-width:0;border:1px solid var(--cmg-line);border-radius:12px;background:var(--cmg-panel2);padding:12px 14px}.cmg-kl{font-size:10px;color:var(--cmg-muted);text-transform:uppercase;letter-spacing:.04em}.cmg-kv{font-size:20px;font-weight:700;margin:6px 0 3px;white-space:nowrap;font-variant-numeric:tabular-nums}.cmg-kv small{font-size:11px;color:var(--cmg-muted);font-weight:500;margin-left:4px}.cmg-d{font-size:10.5px;font-weight:600}.cmg-d span{color:var(--cmg-faint);font-weight:500;margin-left:4px}.cmg-muted{color:var(--cmg-faint)!important;font-weight:500}
      .cmg .pos{color:var(--cmg-pos)}.cmg .neg{color:var(--cmg-neg)}
      .cmg-two{display:grid;grid-template-columns:1.15fr 1fr;gap:10px;margin-bottom:10px}.cmg-card{border:1px solid var(--cmg-line);border-radius:12px;background:var(--cmg-panel2);padding:14px 16px;min-width:0}.cmg-two .cmg-card{margin-bottom:0}.cmg>.cmg-card{margin-bottom:10px}
      .cmg-hd{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:10px}.cmg-hd h2{margin:0;font-size:13px;font-weight:650}.cmg-hd p{margin:2px 0 0;color:var(--cmg-muted);font-size:11px}
      .cmg-svg text{fill:var(--cmg-muted);font-family:inherit;font-size:10.5px}.cmg-svg .cmg-bl{fill:var(--cmg-text);font-weight:600}.cmg-svg .cmg-quad{font-weight:700}.cmg-grid{stroke:var(--theme-border-subtle,#ffffff10)}.cmg-axis{stroke:var(--cmg-line)}.cmg-ref{stroke:var(--cmg-faint);stroke-dasharray:4 4}
      .cmg-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:10.5px;color:var(--cmg-muted);margin-top:8px}.cmg-legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
      .cmg-empty{padding:40px 15px;text-align:center;color:var(--cmg-muted);border:1px dashed var(--cmg-line);border-radius:12px}
      .cmg-tw{overflow:auto;border:1px solid var(--cmg-line);border-radius:10px;max-height:70vh}
      .cmg-tbl{border-collapse:separate;border-spacing:0;width:100%;min-width:1180px;font-variant-numeric:tabular-nums}.cmg-tbl th,.cmg-tbl td{padding:6px 9px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--theme-border-subtle,#ffffff0d);font-size:12px}
      .cmg-tbl th{position:sticky;top:0;z-index:2;background:var(--cmg-panel);color:var(--cmg-muted);font-weight:650;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}
      .cmg-tbl th:first-child,.cmg-tbl td:first-child{text-align:left;position:sticky;left:0;z-index:1;background:var(--cmg-panel);min-width:300px;border-right:1px solid var(--cmg-line)}.cmg-tbl th:first-child{z-index:3}
      .cmg-pt{min-width:0}.cmg-pt th:first-child,.cmg-pt td:first-child{min-width:240px}
      .cmg-q4{background:var(--cmg-panel);color:var(--cmg-muted);border-right:1px solid var(--cmg-line)}th.cmg-ano,td.cmg-ano{background:rgba(79,124,255,.12);font-weight:700;border-left:1px solid var(--cmg-line)}
      .cmg-grp td{background:var(--cmg-panel);font-weight:700;text-transform:uppercase;letter-spacing:.03em;font-size:10.5px!important;text-align:left!important}
      .cmg-sub td,.cmg-sub td:first-child{background:var(--theme-surface-tint,rgba(255,255,255,.04));font-weight:700}.cmg-tot td,.cmg-tot td:first-child{background:var(--theme-surface-muted,rgba(255,255,255,.07));font-weight:750}.cmg-tot td.cmg-ano,.cmg-sub td.cmg-ano{background:rgba(79,124,255,.12)}
      .cmg-mq{cursor:pointer}.cmg-mq:hover td{background:var(--theme-surface-tint,rgba(255,255,255,.05))}.cmg-mq:hover td:first-child{background:var(--cmg-panel)}.cmg-car{display:inline-block;width:14px;color:var(--cmg-faint);font-size:10px}
      .cmg-prod td,.cmg-prod td:first-child{color:var(--cmg-muted);font-size:11.5px}.cmg-prod td:first-child{padding-left:30px;overflow:hidden;text-overflow:ellipsis;max-width:380px}.cmg-cd{display:inline-block;min-width:7ch;color:var(--cmg-faint);margin-right:6px;font-variant-numeric:tabular-nums}
      .cmg-future{color:var(--cmg-faint)}.cmg-dl{display:block;font-size:9.5px;font-weight:600;line-height:1;margin-top:2px}.cmg-dl.pos,.cmg-dl.neg{opacity:.95}
      .cmg-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;align-items:center;justify-content:center}.cmg-pop{width:85vw;height:85vh;background:var(--cmg-panel);border:1px solid var(--cmg-line);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden;color:var(--cmg-text)}
      .cmg-pop-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:14px 18px;border-bottom:1px solid var(--cmg-line)}.cmg-pop-t{font-size:15px;font-weight:700}.cmg-pop-t span{color:var(--cmg-muted);font-weight:500;font-size:12px}.cmg-pop-s{margin-top:4px}.cmg-pop-s span{color:var(--cmg-faint);font-size:11px;margin-left:6px}.cmg-pop-b{overflow:auto;flex:1;padding:0 18px 14px}
      @media(max-width:1150px){.cmg-kpis{grid-template-columns:repeat(3,1fr)}.cmg-two{grid-template-columns:1fr}}
      @media(max-width:768px){.cmg-kpis{grid-template-columns:repeat(2,1fr)}.cmg-pop{width:100vw;height:100vh;border-radius:0}}
      `;
      document.head.appendChild(s);
    }

    function renderSelectedMargens(container, reportId) {
      if (reportId !== REPORT_ID) return false;
      syncPeriod();
      host = container;
      if (model && loadedYear === year) render(container);
      else load();
      return true;
    }
    return { renderSelectedMargens, REPORT_ID };
  }
  window.VECTON_COMERCIAL_MARGENS = { createComercialMargensModule };
})(window);
