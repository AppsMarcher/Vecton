(function attachVectonReportsMarcherCampo(window) {
  // Relatorio "Marcher no Campo" (sell-out das revendas ao produtor) — fonte: tabela
  // garantia_ativacoes (carga em garantiaAtivacoesCargaModule.js, planilha AltForce + abas
  // Itens e Parcelas da NF). Todas as contas sao feitas aqui, no navegador, sobre as linhas
  // carregadas; nada e gravado.
  function createReportsMarcherCampoModule(deps) {
    const { escapeHtml, resolveOrganizationId, fetchAllSupabaseRows, isSupabaseConfigured } = deps;

    const REPORT_ID = "marcherCampo";
    const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const CATS = ["Embolsadora de grãos", "Extratora de grãos", "Embolsadora pecuária", "Carreta graneleira"];
    const CAT_COLORS = ["#4f7cff", "#14b8a6", "#f59e0b", "#a855f7"];
    const REGS = ["Centro-Oeste", "MATOPIBA", "Sudeste", "Sul", "Norte", "Nordeste (outros)"];
    const REG_COLORS = { "Centro-Oeste": "#4f7cff", MATOPIBA: "#14b8a6", Sudeste: "#f59e0b", Sul: "#a855f7", Norte: "#22c55e", "Nordeste (outros)": "#94a3b8" };
    const UF_REGIAO = {
      MT: "Centro-Oeste", MS: "Centro-Oeste", GO: "Centro-Oeste", DF: "Centro-Oeste",
      MA: "MATOPIBA", TO: "MATOPIBA", PI: "MATOPIBA", BA: "MATOPIBA",
      SP: "Sudeste", MG: "Sudeste", RJ: "Sudeste", ES: "Sudeste",
      PR: "Sul", SC: "Sul", RS: "Sul",
      AC: "Norte", AM: "Norte", AP: "Norte", PA: "Norte", RO: "Norte", RR: "Norte",
      AL: "Nordeste (outros)", CE: "Nordeste (outros)", PB: "Nordeste (outros)", PE: "Nordeste (outros)", RN: "Nordeste (outros)", SE: "Nordeste (outros)"
    };
    // Embolsadoras pecuarias (silagem); as demais INGRAIN sao de graos.
    const INGRAIN_PECUARIA = new Set(["60", "65", "90", "91", "910"]);
    const TABS = [
      ["mes", "Por mês"], ["geo", "Cidades e estados"], ["cli", "Clientes"], ["rev", "Revendas"],
      ["vend", "Vendedores"], ["prod", "Produtos"], ["preco", "Preços"], ["pgto", "Pagamento"], ["metodo", "Base e método"]
    ];

    let loading = false;
    let dataLoaded = false;
    let lastError = null;
    let loadPromise = null;
    let rowsRaw = [];
    let M = []; // maquinas validas, ja enriquecidas
    let K = {}; // indicadores gerais
    let tab = "mes";
    let corPorRegiao = true;
    let modeloUF = "";
    let modeloRev = "";
    let tipEl = null;
    const sorts = {}; // id da tabela -> { key, dir }
    const tables = {}; // id da tabela -> { cols, rows }

    // -------------------------------------------------------------- utilidades

    const nf = new Intl.NumberFormat("pt-BR");
    const brl = (v) => (v == null || Number.isNaN(v) ? "–" : `R$ ${nf.format(Math.round(v))}`);
    const mil = (v) => (v == null ? "–" : `R$ ${nf.format(Math.round(v / 1000))} mil`);
    const mi = (v) => `R$ ${(v / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
    const pct = (v, d = 0) => `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
    const sgn = (v) => `${v > 0 ? "+" : ""}${pct(v, 0)}`;
    const esc = (v) => escapeHtml(String(v ?? ""));
    const strip = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
    const norm = (v) => strip(v).toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    const isEmpresa = (nome) => /\b(LTDA|EIRELI|SA|ME|EPP|COMERCIO|COMERCIAL|MAQUINAS|AGRICOLA|DISTRIBUIDORA|COOPERATIVA)\b/.test(norm(nome));

    function titulo(texto) {
      return String(texto || "").toLowerCase().replace(/(^|[\s-])([a-zà-ú])/g, (m, sep, ch) => sep + ch.toUpperCase());
    }
    function quantile(sorted, q) {
      if (!sorted.length) return null;
      const pos = (sorted.length - 1) * q;
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    }
    const mediana = (arr) => quantile([...arr].sort((a, b) => a - b), 0.5);
    const soma = (arr, f) => arr.reduce((acc, x) => acc + f(x), 0);
    function agrupar(lista, keyFn) {
      const map = new Map();
      lista.forEach((x) => { const k = keyFn(x); if (!map.has(k)) map.set(k, []); map.get(k).push(x); });
      return map;
    }
    const un = (arr) => soma(arr, (m) => m.qty);
    const valorDe = (arr) => soma(arr, (m) => m.valor);
    function topPor(arr, keyFn) {
      const grupos = [...agrupar(arr, keyFn).entries()].map(([k, v]) => [k, un(v)]).sort((a, b) => b[1] - a[1]);
      return grupos.length ? grupos[0][0] : "";
    }
    const listaCurta = (arr, keyFn, max = 3) => {
      const grupos = [...agrupar(arr, keyFn).entries()].map(([k, v]) => [k, un(v)]).sort((a, b) => b[1] - a[1]);
      return grupos.slice(0, max).map(([k]) => k).join(", ");
    };

    // -------------------------------------------------------------- dados

    function loadData() {
      if (!loadPromise) loadPromise = doLoadData().finally(() => { loadPromise = null; });
      return loadPromise;
    }

    async function doLoadData() {
      loading = true;
      lastError = null;
      try {
        if (!isSupabaseConfigured()) { rowsRaw = []; M = []; dataLoaded = true; return; }
        const org = await resolveOrganizationId();
        rowsRaw = (await fetchAllSupabaseRows(
          "garantia_ativacoes",
          `organization_id=eq.${org}&select=id,numero,status,produto_raw,modelo_normalizado,revenda_raw,vendedor_revenda,cliente_final,uf,cidade,nf_emissao,cadastrado_em,nf_quantidade,preco_maquina,parcelas_qtd,financiamento,nf_destinatario_doc`
        )) || [];
        montarBase();
        dataLoaded = true;
      } catch (error) {
        console.error(error);
        lastError = window.vpFriendlyError ? window.vpFriendlyError(error, "Falha ao carregar o relatório Marcher no Campo.") : String(error?.message || error);
      } finally {
        loading = false;
      }
    }

    function categoriaDe(modelo) {
      const [familia, numero] = modelo.split(" ");
      if (familia === "OUTGRAIN") return CATS[1];
      if (familia === "CARGOGRAIN") return CATS[3];
      return INGRAIN_PECUARIA.has(String(numero || "").replace(/\D/g, "")) ? CATS[2] : CATS[0];
    }

    // Maquinas validas: ativacao aceita, equipamento (nao o kit/acessorio TRANSGRAIN) e venda no Brasil.
    function montarBase() {
      M = [];
      rowsRaw.forEach((r) => {
        if (norm(r.status) !== "ACEITA") return;
        const bruto = String(r.modelo_normalizado || "").toUpperCase();
        if (!bruto || bruto.startsWith("TRANSGRAIN")) return;
        if (!r.uf || r.uf === "EX") return;
        const modelo = bruto.replace(/^([A-Z]+)\s*(.*)$/, "$1 $2").trim();
        const qty = Number(r.nf_quantidade) > 0 ? Number(r.nf_quantidade) : 1;
        const preco = r.preco_maquina == null ? null : Number(r.preco_maquina);
        const revenda = norm(r.revenda_raw).includes("MARCHER") ? "Marcher (venda direta)" : String(r.revenda_raw || "").trim() || "(sem revenda)";
        const vendedorBruto = String(r.vendedor_revenda || "").trim();
        const doc = String(r.nf_destinatario_doc || "").replace(/\D/g, "");
        const emissao = r.nf_emissao ? String(r.nf_emissao).slice(0, 10) : "";
        const cadastro = r.cadastrado_em ? String(r.cadastrado_em).slice(0, 10) : "";
        const lag = emissao && cadastro ? Math.round((new Date(cadastro) - new Date(emissao)) / 86400000) : null;
        M.push({
          qty, modelo, cat: categoriaDe(modelo), preco, valor: preco == null ? 0 : preco * qty,
          uf: r.uf, regiao: UF_REGIAO[r.uf] || "Nordeste (outros)",
          cidade: titulo(r.cidade), cidadeUf: `${titulo(r.cidade)} (${r.uf})`,
          revenda, revKey: norm(revenda),
          vendedor: vendedorBruto && !isEmpresa(vendedorBruto) ? vendedorBruto : "",
          cliente: String(r.cliente_final || "").trim() || "(sem nome)",
          cliKey: doc || norm(r.cliente_final), pessoa: doc.length === 11 ? "PF" : doc.length === 14 ? "PJ" : "",
          mes: emissao.slice(0, 7), lag: lag != null && lag >= 0 ? lag : null,
          parcelas: r.parcelas_qtd == null ? null : Number(r.parcelas_qtd),
          financ: r.financiamento || "Não identificado"
        });
      });
      const comPreco = M.filter((m) => m.preco != null);
      const datas = M.map((m) => m.mes).filter(Boolean).sort();
      K = {
        maquinas: un(M), valor: valorDe(M), semPreco: M.length - comPreco.length,
        ticket: comPreco.length ? valorDe(comPreco) / un(comPreco) : null,
        clientes: new Set(M.map((m) => m.cliKey)).size,
        revendas: new Set(M.map((m) => m.revKey)).size,
        cidades: new Set(M.map((m) => m.cidadeUf)).size,
        ufs: new Set(M.map((m) => m.uf)).size,
        ini: datas[0] || "", fim: datas[datas.length - 1] || "",
        vendCob: M.length ? un(M.filter((m) => m.vendedor)) / un(M) : 0
      };
      const modelos = precoModelos();
      if (!modelos.includes(modeloUF)) modeloUF = modelos[0] || "";
      if (!modelos.includes(modeloRev)) modeloRev = modelos[0] || "";
    }

    // -------------------------------------------------------------- tabelas ordenaveis

    // Classificador padrao do app: clique no cabecalho alterna ↑/↓, ativo em var(--blue).
    function tabelaHtml(id, cols, rows) {
      tables[id] = { cols, rows };
      return `<div class="mc-tbl" data-mc-table="${id}">${tabelaInner(id)}</div>`;
    }
    function tabelaInner(id) {
      const { cols, rows } = tables[id];
      const s = sorts[id];
      let ordenadas = rows;
      const col = s && cols.find((c) => c.key === s.key);
      if (col) {
        ordenadas = [...rows].sort((a, b) => {
          const va = col.val(a), vb = col.val(b);
          const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va ?? "").localeCompare(String(vb ?? ""), "pt-BR");
          return s.dir * cmp;
        });
      }
      const th = (c) => {
        const ativo = s && s.key === c.key;
        return `<th data-sort="${c.key}" class="${c.right ? "r" : ""}" style="cursor:pointer;user-select:none${ativo ? ";color:var(--blue)" : ""}">${c.label}${ativo ? (s.dir === 1 ? " ↑" : " ↓") : ""}</th>`;
      };
      return `<table class="data-table mc-table"><thead><tr>${cols.map(th).join("")}</tr></thead><tbody>${ordenadas.map((r) => `<tr>${cols.map((c) => `<td class="${c.right ? "r" : ""}">${c.html(r)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    function barra(v, max, label) {
      const w = Math.max(2, Math.round((v / (max || 1)) * 90));
      return `<div class="mc-barcell"><span class="mc-bar" style="width:${w}px"></span><span>${label}</span></div>`;
    }
    function mixBar(arr) {
      const por = new Map();
      arr.forEach((m) => por.set(m.cat, (por.get(m.cat) || 0) + m.qty));
      const rows = CATS.filter((c) => por.get(c)).map((c) => ({ label: c, value: String(por.get(c)) }));
      return `<div class="mc-mix" ${tipAttr(rows)}>${CATS.filter((c) => por.get(c)).map((c) => `<span style="flex:${por.get(c)};background:${CAT_COLORS[CATS.indexOf(c)]}"></span>`).join("")}</div>`;
    }
    const legendaCats = () => `<div class="mc-legend">${CATS.map((c, i) => `<span><i style="background:${CAT_COLORS[i]}"></i>${c}</span>`).join("")}</div>`;
    const panel = (titulo, sub, corpo) => `<div class="content-card mc-panel"><div class="mc-ph"><h4 class="inline-card-title">${titulo}</h4>${sub ? `<small>${sub}</small>` : ""}</div>${corpo}</div>`;
    const diffPill = (d) => `<span class="mc-pill ${d > 0.03 ? "hi" : d < -0.03 ? "lo" : ""}">${sgn(d)}</span>`;

    // -------------------------------------------------------------- tooltip (.cockpit-tip)

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
      tip.innerHTML = rows.map((r) => `<div class="cockpit-tip-row"><span>${esc(r.label)}</span><strong>${esc(r.value)}</strong></div>`).join("");
      tip.hidden = false;
    }
    function moveTip(e) {
      const tip = ensureTip();
      const w = tip.offsetWidth || 120;
      tip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - w - 8)}px`;
      tip.style.top = `${Math.max(e.clientY - 64, 8)}px`;
    }
    const hideTip = () => { if (tipEl) tipEl.hidden = true; };

    // -------------------------------------------------------------- abas

    function secMes() {
      const por = agrupar(M.filter((m) => m.mes), (m) => m.mes);
      const meses = [...por.keys()].sort().map((mes) => ({ mes, un: un(por.get(mes)), valor: valorDe(por.get(mes)) }));
      if (!meses.length) return `<div class="actuals-empty">Sem NFs com data de emissão.</div>`;
      const W = 1100, H = 240, pl = 34, pr = 10, pt = 22, pb = 30;
      const passo = Math.max(5, Math.ceil(Math.max(...meses.map((d) => d.un)) / 4 / 5) * 5);
      const max = Math.ceil(Math.max(...meses.map((d) => d.un)) / passo) * passo;
      const bw = (W - pl - pr) / meses.length;
      const ultimo = meses[meses.length - 1].mes;
      let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Máquinas por mês" class="mc-svg">`;
      for (let t = 0; t <= max; t += passo) {
        const y = pt + (H - pt - pb) * (1 - t / max);
        s += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" class="mc-grid"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end">${t}</text>`;
      }
      meses.forEach((d, i) => {
        const h = (H - pt - pb) * d.un / max, x = pl + i * bw + bw * 0.18, w = bw * 0.64, y = H - pb - h;
        const [yy, mm] = d.mes.split("-");
        const tip = tipAttr([{ label: `${mm}/${yy}`, value: `${d.un} máquinas` }, { label: "Faturamento", value: mi(d.valor) }]);
        s += `<g ${tip}><rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="var(--blue)" fill-opacity="${d.mes === ultimo ? 0.45 : 1}"/>`;
        s += `<text x="${x + w / 2}" y="${y - 6}" text-anchor="middle" class="mc-lbl">${d.un}</text><text x="${x + w / 2}" y="${H - pb + 16}" text-anchor="middle">${MES[+mm - 1]}/${yy.slice(2)}</text></g>`;
      });
      s += `<line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" class="mc-axis"/></svg>`;
      return panel("Máquinas faturadas ao produtor por mês", "pela data de emissão da NF da revenda · o último mês ainda recebe ativações", s);
    }

    function secGeo() {
      const ufs = [...agrupar(M, (m) => m.uf).entries()].map(([uf, arr]) => ({
        uf, arr, un: un(arr), valor: valorDe(arr), regiao: UF_REGIAO[uf] || "", top: topPor(arr, (m) => m.revenda)
      })).sort((a, b) => b.un - a.un);
      const maxUF = Math.max(...ufs.map((r) => r.un), 1);
      const cidades = [...agrupar(M, (m) => m.cidadeUf).entries()].map(([cidadeUf, arr]) => ({
        cidadeUf, arr, un: un(arr), valor: valorDe(arr), clientes: new Set(arr.map((m) => m.cliKey)).size,
        revendas: listaCurta(arr, (m) => m.revenda, 2), modelos: listaCurta(arr, (m) => m.modelo, 3)
      })).filter((c) => c.un >= 3).sort((a, b) => b.un - a.un);
      const maxC = Math.max(...cidades.map((r) => r.un), 1);
      const tUF = tabelaHtml("uf", [
        { key: "uf", label: "UF", val: (r) => r.uf, html: (r) => `<b>${r.uf}</b>` },
        { key: "reg", label: "Região", val: (r) => r.regiao, html: (r) => `<span class="mc-small">${esc(r.regiao)}</span>` },
        { key: "un", label: "Máquinas", val: (r) => r.un, html: (r) => barra(r.un, maxUF, r.un) },
        { key: "val", label: "Faturamento", right: true, val: (r) => r.valor, html: (r) => mi(r.valor) },
        { key: "mix", label: "Mix", val: (r) => r.un, html: (r) => mixBar(r.arr) },
        { key: "top", label: "Revenda líder", val: (r) => r.top, html: (r) => `<span class="mc-small">${esc(r.top)}</span>` }
      ], ufs);
      const tCid = cidades.length ? tabelaHtml("cidades", [
        { key: "cid", label: "Cidade", val: (r) => r.cidadeUf, html: (r) => `<b>${esc(r.cidadeUf)}</b>` },
        { key: "un", label: "Máquinas", val: (r) => r.un, html: (r) => barra(r.un, maxC, r.un) },
        { key: "val", label: "Faturamento", right: true, val: (r) => r.valor, html: (r) => brl(r.valor) },
        { key: "cli", label: "Clientes", right: true, val: (r) => r.clientes, html: (r) => r.clientes },
        { key: "rev", label: "Revendas", val: (r) => r.revendas, html: (r) => `<span class="mc-small">${esc(r.revendas)}</span>` },
        { key: "mod", label: "Modelos", val: (r) => r.modelos, html: (r) => `<span class="mc-small">${esc(r.modelos)}</span>` }
      ], cidades) : `<div class="actuals-empty">Nenhuma cidade com 3 ou mais máquinas.</div>`;
      return `<p class="mc-lede">Local da máquina informado na ativação (fazenda do cliente). MATOPIBA agrupa MA, TO, PI e BA.</p>`
        + panel("Estados que mais ativaram garantia", "mix de categorias e revenda líder", legendaCats() + tUF)
        + panel("Cidades com 3 ou mais máquinas", "por número de máquinas", tCid);
    }

    function secCli() {
      const clientes = [...agrupar(M, (m) => m.cliKey).entries()].map(([k, arr]) => ({
        nome: arr[0].cliente, cidade: arr[0].cidadeUf, un: un(arr), valor: valorDe(arr),
        modelos: listaCurta(arr, (m) => m.modelo, 3), revenda: topPor(arr, (m) => m.revenda)
      }));
      const colsCli = (maxLinhas) => [
        { key: "cli", label: "Cliente", val: (r) => r.nome, html: (r) => `<b>${esc(r.nome)}</b><div class="mc-small">${esc(r.cidade)}</div>` },
        { key: "un", label: "Máq.", right: true, val: (r) => r.un, html: (r) => r.un },
        { key: "val", label: "Valor", right: true, val: (r) => r.valor, html: (r) => brl(r.valor) },
        { key: "mod", label: "Modelos", val: (r) => r.modelos, html: (r) => `<span class="mc-small">${esc(r.modelos)}</span>` },
        { key: "rev", label: "Revenda", val: (r) => r.revenda, html: (r) => `<span class="mc-small">${esc(r.revenda)}</span>` }
      ];
      const top = [...clientes].sort((a, b) => b.valor - a.valor).slice(0, 20);
      const recompra = clientes.filter((c) => c.un > 1).sort((a, b) => b.un - a.un || b.valor - a.valor);
      const pf = un(M.filter((m) => m.pessoa === "PF"));
      const pj = un(M.filter((m) => m.pessoa === "PJ"));
      return `<p class="mc-lede">${K.clientes} clientes finais distintos (agrupados por CPF/CNPJ do destinatário da NF). ${pct(pf / (K.maquinas || 1))} das máquinas foram para pessoa física e ${pct(pj / (K.maquinas || 1))} para empresas.</p>`
        + `<div class="mc-grid2">`
        + panel("Top 20 por valor", "valor unitário das NFs", tabelaHtml("cliVal", colsCli(), top))
        + panel("Clientes com mais de uma máquina", `${recompra.length} clientes`, recompra.length ? tabelaHtml("cliRec", colsCli(), recompra) : `<div class="actuals-empty">Nenhum cliente com mais de uma máquina.</div>`)
        + `</div>`;
    }

    function secRev() {
      const rv = [...agrupar(M, (m) => m.revKey).entries()].map(([, arr]) => {
        const lags = arr.map((m) => m.lag).filter((l) => l != null);
        return {
          nome: arr[0].revenda, arr, un: un(arr), valor: valorDe(arr), ufs: [...new Set(arr.map((m) => m.uf))].sort().join(", "),
          clientes: new Set(arr.map((m) => m.cliKey)).size, vendCob: arr.length ? un(arr.filter((m) => m.vendedor)) / un(arr) : 0,
          lag: lags.length ? mediana(lags) : null,
          ticket: arr.filter((m) => m.preco != null).length ? valorDe(arr) / un(arr.filter((m) => m.preco != null)) : null
        };
      }).sort((a, b) => b.un - a.un);
      const maxRv = Math.max(...rv.map((r) => r.un), 1);
      const tab = tabelaHtml("rev", [
        { key: "n", label: "#", right: true, val: (r) => rv.indexOf(r), html: (r) => rv.indexOf(r) + 1 },
        { key: "rev", label: "Revenda", val: (r) => r.nome, html: (r) => `<b>${esc(r.nome)}</b><div class="mc-small">${esc(r.ufs)}</div>` },
        { key: "un", label: "Máquinas", val: (r) => r.un, html: (r) => barra(r.un, maxRv, `${r.un} <span class="mc-small">${pct(r.un / (K.maquinas || 1), 1)}</span>`) },
        { key: "val", label: "Faturamento", right: true, val: (r) => r.valor, html: (r) => brl(r.valor) },
        { key: "tk", label: "Ticket", right: true, val: (r) => r.ticket ?? -1, html: (r) => mil(r.ticket) },
        { key: "cli", label: "Clientes", right: true, val: (r) => r.clientes, html: (r) => r.clientes },
        { key: "mix", label: "Mix", val: (r) => r.un, html: (r) => mixBar(r.arr) },
        { key: "vc", label: "Vendedor preenchido", right: true, val: (r) => r.vendCob, html: (r) => `<span class="mc-pill ${r.vendCob < 0.5 ? "warn" : ""}">${pct(r.vendCob)}</span>` },
        { key: "lag", label: "NF → ativação", right: true, val: (r) => r.lag ?? -1, html: (r) => (r.lag == null ? "–" : `<span class="mc-pill ${r.lag > 120 ? "warn" : ""}">${Math.round(r.lag)} d</span>`) }
      ], rv);
      return `<p class="mc-lede">Revenda conforme o campo "Revenda" do AltForce. "Marcher (venda direta)" reúne os registros em que a própria Marcher aparece como revenda.</p>`
        + panel("Ranking de revendas", "dias = mediana entre emissão da NF e cadastro da garantia", legendaCats() + tab);
    }

    function secVend() {
      const comVend = M.filter((m) => m.vendedor);
      const vd = [...agrupar(comVend, (m) => `${norm(m.vendedor)}|${m.revKey}`).entries()].map(([, arr]) => ({
        nome: arr[0].vendedor, revenda: arr[0].revenda, ufs: [...new Set(arr.map((m) => m.uf))].sort().join(", "),
        un: un(arr), valor: valorDe(arr), clientes: new Set(arr.map((m) => m.cliKey)).size, modelos: listaCurta(arr, (m) => m.modelo, 3)
      })).sort((a, b) => b.un - a.un || b.valor - a.valor).slice(0, 10);
      const maxV = Math.max(...vd.map((r) => r.un), 1);
      const tab = vd.length ? tabelaHtml("vend", [
        { key: "n", label: "#", right: true, val: (r) => vd.indexOf(r), html: (r) => vd.indexOf(r) + 1 },
        { key: "v", label: "Vendedor", val: (r) => r.nome, html: (r) => `<b>${esc(r.nome)}</b>` },
        { key: "rev", label: "Revenda", val: (r) => r.revenda, html: (r) => `<span class="mc-small">${esc(r.revenda)}</span>` },
        { key: "uf", label: "UF", val: (r) => r.ufs, html: (r) => `<span class="mc-small">${esc(r.ufs)}</span>` },
        { key: "un", label: "Máquinas", val: (r) => r.un, html: (r) => barra(r.un, maxV, r.un) },
        { key: "val", label: "Faturamento", right: true, val: (r) => r.valor, html: (r) => brl(r.valor) },
        { key: "cli", label: "Clientes", right: true, val: (r) => r.clientes, html: (r) => r.clientes },
        { key: "mod", label: "Modelos", val: (r) => r.modelos, html: (r) => `<span class="mc-small">${esc(r.modelos)}</span>` }
      ], vd) : `<div class="actuals-empty">Nenhum vendedor informado nas ativações.</div>`;
      return `<p class="mc-lede">O campo de vendedor está preenchido em ${pct(K.vendCob)} das ativações. Nomes de empresa no lugar do vendedor foram desconsiderados.</p>`
        + panel("Top 10 vendedores", "por máquinas; empate desempatado pelo faturamento", tab);
    }

    function secProd() {
      const cats = CATS.map((c) => ({ cat: c, arr: M.filter((m) => m.cat === c) })).filter((c) => c.arr.length).map((c) => ({ ...c, un: un(c.arr), valor: valorDe(c.arr) }));
      const mods = [...agrupar(M, (m) => m.modelo).entries()].map(([modelo, arr]) => ({ modelo, cat: arr[0].cat, un: un(arr), valor: valorDe(arr) })).sort((a, b) => b.un - a.un);
      const maxCat = Math.max(...cats.map((r) => r.un), 1), maxP = Math.max(...mods.map((r) => r.un), 1);
      return `<p class="mc-lede">Modelo lido do campo de produto da ativação e padronizado (ex.: "OUTGRAIN 220+" e grafias livres caem no mesmo modelo).</p><div class="mc-grid2">`
        + panel("Por categoria", "", tabelaHtml("cat", [
          { key: "c", label: "Categoria", val: (r) => r.cat, html: (r) => `<i class="mc-dot" style="background:${CAT_COLORS[CATS.indexOf(r.cat)]}"></i><b>${r.cat}</b>` },
          { key: "un", label: "Máquinas", val: (r) => r.un, html: (r) => barra(r.un, maxCat, `${r.un} <span class="mc-small">${pct(r.un / (K.maquinas || 1))}</span>`) },
          { key: "val", label: "Faturamento", right: true, val: (r) => r.valor, html: (r) => mi(r.valor) }
        ], cats))
        + panel("Por modelo", "", tabelaHtml("mod", [
          { key: "m", label: "Modelo", val: (r) => r.modelo, html: (r) => `<b>${esc(r.modelo)}</b><div class="mc-small">${r.cat}</div>` },
          { key: "un", label: "Máquinas", val: (r) => r.un, html: (r) => barra(r.un, maxP, r.un) },
          { key: "val", label: "Faturamento", right: true, val: (r) => r.valor, html: (r) => brl(r.valor) }
        ], mods))
        + `</div>`;
    }

    // Modelos com preco: os 8 mais vendidos com pelo menos 3 vendas com preco.
    function precoModelos() {
      return [...agrupar(M.filter((m) => m.preco != null), (m) => m.modelo).entries()]
        .filter(([, arr]) => arr.length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 8).map(([modelo]) => modelo);
    }
    function statsModelo(modelo) {
      const todas = M.filter((m) => m.modelo === modelo);
      const arr = todas.filter((m) => m.preco != null);
      const ord = arr.map((m) => m.preco).sort((a, b) => a - b);
      return { modelo, arr, total: todas.length, n: arr.length, med: quantile(ord, 0.5), p25: quantile(ord, 0.25), p75: quantile(ord, 0.75) };
    }

    function secPreco() {
      const modelos = precoModelos();
      if (!modelos.length) return `<div class="actuals-empty">Sem vendas com preço para montar a distribuição.</div>`;
      const st = modelos.map(statsModelo);
      const todos = st.flatMap((s) => s.arr.map((m) => m.preco)).sort((a, b) => a - b);
      const lo = Math.floor((todos[0] || 0) / 10000) * 10000;
      const hi = Math.min(Math.ceil((quantile(todos, 0.97) || 0) / 50000) * 50000, Math.ceil(todos[todos.length - 1] / 50000) * 50000) || 400000;
      const W = 900, H = 34;
      const X = (v) => 8 + ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * (W - 16);
      let linhas = "";
      st.forEach((s) => {
        let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" style="overflow:visible">`;
        g += `<rect x="${X(s.p25)}" y="7" width="${Math.max(2, X(s.p75) - X(s.p25))}" height="${H - 14}" rx="3" fill="var(--blue)" fill-opacity=".14"/>`;
        g += `<line x1="${X(s.med)}" x2="${X(s.med)}" y1="3" y2="${H - 3}" stroke="var(--text)" stroke-width="2"/>`;
        s.arr.forEach((m, i) => {
          const jit = ((i * 37) % 11 - 5) * 1.6;
          const cor = corPorRegiao ? REG_COLORS[m.regiao] : "var(--text-soft)";
          const tip = tipAttr([{ label: `${s.modelo} · ${brl(m.preco)}`, value: m.revenda }, { label: m.cidadeUf, value: m.cliente }]);
          g += `<circle cx="${X(m.preco)}" cy="${H / 2 + jit}" r="4.5" fill="${cor}" fill-opacity=".85" stroke="var(--panel-alt)" stroke-width="1.5" ${tip}/>`;
        });
        g += "</svg>";
        linhas += `<div class="mc-strip-row"><div class="mc-nm">${esc(s.modelo)}<small>${s.total > s.n ? `n=${s.n} de ${s.total}` : `n=${s.n}`} · med. ${mil(s.med)}</small></div><div>${g}</div></div>`;
      });
      let ax = `<svg viewBox="0 0 ${W} 22" width="100%" height="22" preserveAspectRatio="none" style="overflow:visible" class="mc-svg">`;
      for (let t = Math.ceil(lo / 50000) * 50000; t <= hi; t += 50000) ax += `<line x1="${X(t)}" x2="${X(t)}" y1="0" y2="5" class="mc-axis"/><text x="${X(t)}" y="18" text-anchor="middle">${t / 1000}k</text>`;
      ax += "</svg>";
      linhas += `<div class="mc-strip-row"><div class="mc-small">preço (R$)</div><div>${ax}</div></div>`;
      const seg = `<div class="mc-seg" role="group" aria-label="Colorir por"><button type="button" data-cor="reg" aria-pressed="${corPorRegiao}">Cor por região</button><button type="button" data-cor="none" aria-pressed="${!corPorRegiao}">Sem cor</button></div>`;
      const legenda = corPorRegiao ? `<div class="mc-legend">${REGS.map((r) => `<span><i style="background:${REG_COLORS[r]}"></i>${r}</span>`).join("")}</div>` : "";

      // Mediana por regiao x nacional
      const regCols = REGS.filter((r) => st.some((s) => s.arr.some((m) => m.regiao === r)));
      const heat = `<div class="mc-tbl"><table class="data-table mc-table"><thead><tr><th>Modelo</th><th class="r">Nacional</th>${regCols.map((r) => `<th class="r">${r}</th>`).join("")}</tr></thead><tbody>`
        + st.map((s) => `<tr><td><b>${esc(s.modelo)}</b></td><td class="r">${mil(s.med)}</td>${regCols.map((r) => {
          const pr = s.arr.filter((m) => m.regiao === r).map((m) => m.preco);
          if (!pr.length) return `<td class="r mc-muted">–</td>`;
          const med = mediana(pr), d = med / s.med - 1;
          const a = Math.min(Math.abs(d) / 0.2, 1) * 0.5;
          const cor = d > 0.015 ? "var(--red)" : d < -0.015 ? "var(--blue)" : "transparent";
          return `<td class="r" style="background:color-mix(in srgb,${cor} ${Math.round(a * 100)}%,transparent)">${mil(med)}<span class="mc-sub">${sgn(d)} · n=${pr.length}</span></td>`;
        }).join("")}</tr>`).join("") + `</tbody></table></div>`;

      const segModelo = (attr, atual) => `<div class="mc-seg" role="group" aria-label="Modelo">${modelos.map((m) => `<button type="button" ${attr}="${esc(m)}" aria-pressed="${m === atual}">${esc(m)}</button>`).join("")}</div>`;
      return `<p class="mc-lede">Valor unitário do item da máquina na NF da revenda ao produtor (quando a NF tem vários itens, vale o item da máquina ativada). Cada ponto é uma venda; a faixa marca o intervalo entre o 1º e o 3º quartil e o traço, a mediana. Quando aparece "n=41 de 43", 2 vendas do modelo ficaram fora da conta porque a NF não traz o valor da máquina.</p>`
        + panel("Distribuição de preço por modelo", "", `<div class="mc-toolbar">${seg}</div>${legenda}<div class="mc-strip">${linhas}</div>`)
        + panel("Mediana por região vs. mediana nacional", "n = vendas · azul abaixo, vermelho acima", heat + `<p class="mc-note">Células com n=1 ou 2 são indicativas. Embolsadoras pecuárias variam muito conforme a configuração (rolo, reidratação, inoculador, moega, Transgrain), então a diferença regional ali reflete mais a configuração que a região.</p>`)
        + `<div class="mc-grid2">`
        + panel("Por estado", "n=1 é só indicativo", segModelo("data-mod-uf", modeloUF) + `<div data-mc-preco="uf">${precoPorUF()}</div>`)
        + panel("Por revenda", "mín. 2 vendas do modelo", segModelo("data-mod-rev", modeloRev) + `<div data-mc-preco="rev">${precoPorRevenda()}</div>`)
        + `</div>`;
    }

    function precoPorUF() {
      const s = statsModelo(modeloUF);
      const rows = [...agrupar(s.arr, (m) => m.uf).entries()].map(([uf, arr]) => {
        const med = mediana(arr.map((m) => m.preco));
        return { uf, n: arr.length, med, dif: med / s.med - 1 };
      }).sort((a, b) => b.med - a.med);
      if (!rows.length) return `<div class="actuals-empty">Nenhum estado com vendas deste modelo.</div>`;
      return tabelaHtml("precoUF", [
        { key: "uf", label: "UF", val: (r) => r.uf, html: (r) => `<b>${r.uf}</b>` },
        { key: "n", label: "n", right: true, val: (r) => r.n, html: (r) => r.n },
        { key: "med", label: "Mediana", right: true, val: (r) => r.med, html: (r) => brl(r.med) },
        { key: "dif", label: "vs. nacional", right: true, val: (r) => r.dif, html: (r) => diffPill(r.dif) }
      ], rows) + `<p class="mc-small">Total: ${soma(rows, (r) => r.n)} vendas</p>`;
    }
    function precoPorRevenda() {
      const s = statsModelo(modeloRev);
      const rows = [...agrupar(s.arr, (m) => m.revKey).entries()].filter(([, arr]) => arr.length >= 2).map(([, arr]) => {
        const precos = arr.map((m) => m.preco);
        const med = mediana(precos);
        return { revenda: arr[0].revenda, n: arr.length, med, min: Math.min(...precos), max: Math.max(...precos), dif: med / s.med - 1 };
      }).sort((a, b) => b.med - a.med);
      if (!rows.length) return `<div class="actuals-empty">Nenhuma revenda com 2 vendas ou mais deste modelo.</div>`;
      return tabelaHtml("precoRev", [
        { key: "rev", label: "Revenda", val: (r) => r.revenda, html: (r) => `<b>${esc(r.revenda)}</b>` },
        { key: "n", label: "n", right: true, val: (r) => r.n, html: (r) => r.n },
        { key: "med", label: "Mediana", right: true, val: (r) => r.med, html: (r) => brl(r.med) },
        { key: "fx", label: "Faixa", right: true, val: (r) => r.min, html: (r) => `<span class="mc-small">${mil(r.min)} – ${mil(r.max)}</span>` },
        { key: "dif", label: "vs. nacional", right: true, val: (r) => r.dif, html: (r) => diffPill(r.dif) }
      ], rows);
    }

    function secPgto() {
      const comInfo = M.filter((m) => m.parcelas != null);
      const faixas = [["À vista / 1 parcela", (n) => n <= 1], ["2 a 3 parcelas", (n) => n >= 2 && n <= 3], ["4 a 6 parcelas", (n) => n >= 4 && n <= 6], ["7 a 12 parcelas", (n) => n >= 7 && n <= 12], ["Mais de 12 parcelas", (n) => n > 12]];
      const parc = faixas.map(([label, f]) => ({ label, un: un(comInfo.filter((m) => f(m.parcelas))) })).filter((r) => r.un);
      const semInfo = un(M.filter((m) => m.parcelas == null));
      if (semInfo) parc.push({ label: "Sem parcelas na NF", un: semInfo });
      const fin = [...agrupar(M, (m) => m.financ).entries()].map(([label, arr]) => ({ label, un: un(arr) })).sort((a, b) => b.un - a.un);
      const maxP = Math.max(...parc.map((r) => r.un), 1), maxF = Math.max(...fin.map((r) => r.un), 1);
      const cols = (max, titulo) => [
        { key: "l", label: titulo, val: (r) => r.label, html: (r) => `<b>${esc(r.label)}</b>` },
        { key: "un", label: "Máquinas", val: (r) => r.un, html: (r) => barra(r.un, max, `${r.un} <span class="mc-small">${pct(r.un / (K.maquinas || 1))}</span>`) }
      ];
      return `<p class="mc-lede">As parcelas vêm da aba de parcelamento da NF; a forma de financiamento foi lida no campo de informações adicionais, que muitas revendas não preenchem.</p><div class="mc-grid2">`
        + panel("Nº de parcelas na NF", "", tabelaHtml("parc", cols(maxP, "Parcelas"), parc))
        + panel("Financiamento citado na NF", "", tabelaHtml("fin", cols(maxF, "Condição"), fin))
        + `</div>`;
    }

    function secMetodo() {
      const itens = [
        `Fonte: tabela de Ativações de Garantia, carregada da planilha do AltForce (aba AltForce, com as abas Itens e Parcelas da NF). Entram só ativações com status "Aceita", sem o kit Transgrain (acessório) e sem exportações.`,
        `Preço: para NFs com mais de um item, vale o item cujo nº de série ou modelo bate com a máquina ativada. O "valor total" da NF não é usado. ${K.semPreco} venda(s) ficaram sem preço confiável (item de peça no lugar da máquina, item divergente ou NF ausente) e não entram nas médias.`,
        `Clientes são agrupados por CPF/CNPJ do destinatário da NF. Revendas e cidades seguem a grafia do AltForce. "Marcher (venda direta)" reúne os registros em que a própria Marcher aparece como revenda.`,
        `Local: endereço da máquina informado na ativação. Região MATOPIBA = MA, TO, PI e BA; DF entra no Centro-Oeste.`,
        `Mês: data de emissão da NF da revenda ao produtor. Prazo NF → ativação: dias entre a emissão da NF e o cadastro da garantia.`,
        `Financiamento: identificado por palavras-chave no campo de informações adicionais da NF (BNB, Finame/BNDES, consórcio, alienação fiduciária, reserva de domínio, à vista/PIX). Quando a revenda não escreve nada, fica "Não identificado".`,
        `Vendedor: nomes de empresa no lugar do vendedor são desconsiderados.`
      ];
      return panel("Como a base foi tratada", "", `<ul class="mc-clean">${itens.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`);
    }

    // -------------------------------------------------------------- shell

    function renderSelectedMarcherCampo(container, reportId) {
      if (reportId !== REPORT_ID) return false;
      container.innerHTML = `<div id="mc-root" class="mc-root"></div>`;
      const root = container.querySelector("#mc-root");
      const carga = loadData();
      render(root);
      void carga.then(() => { if (root.isConnected !== false) render(root); });
      return true;
    }

    function render(root) {
      if (!root) return;
      if (loading && !dataLoaded) {
        const skeleton = typeof window.vpSkeletonTable === "function" ? window.vpSkeletonTable(10, 6) : "";
        root.innerHTML = `<div class="content-card mc-panel" aria-busy="true"><div class="reports-table-wrap">${skeleton}</div></div>`;
        return;
      }
      if (lastError) { root.innerHTML = `<div class="actuals-empty">${esc(lastError)}</div>`; return; }
      if (!M.length) {
        root.innerHTML = `<div class="actuals-empty">Nenhuma venda para mostrar. Suba a planilha na tela "Carga de Ativações de Garantia" (dentro de Carga de Realizado).</div>`;
        return;
      }
      const dmy = (ym) => { const [y, m] = ym.split("-"); return `${m}/${y}`; };
      const kpis = [
        [nf.format(K.maquinas), "máquinas vendidas ao produtor"], [mi(K.valor), "faturamento das revendas"], [mil(K.ticket), "ticket médio por máquina"],
        [K.clientes, "clientes finais distintos"], [K.revendas, "revendas com venda"], [K.cidades, `cidades em ${K.ufs} estados`]
      ];
      const secoes = { mes: secMes, geo: secGeo, cli: secCli, rev: secRev, vend: secVend, prod: secProd, preco: secPreco, pgto: secPgto, metodo: secMetodo };
      root.innerHTML = `
        <p class="mc-lede">Base de ${nf.format(K.maquinas)} equipamentos ativados na garantia com NF de venda da revenda ao produtor rural no Brasil${K.ini ? `, emitidas entre ${dmy(K.ini)} e ${dmy(K.fim)}` : ""}. Valores são o preço unitário da máquina na nota, sem frete nem acessórios faturados à parte.</p>
        <div class="mc-kpis">${kpis.map(([b, s]) => `<div class="mc-kpi"><b>${b}</b><span>${s}</span></div>`).join("")}</div>
        <div class="mc-tabs" role="tablist">${TABS.map(([id, label]) => `<button type="button" role="tab" data-mc-tab="${id}" aria-selected="${id === tab}">${label}</button>`).join("")}</div>
        <div class="mc-body">${secoes[tab]()}</div>`;
      bind(root);
    }

    function bind(root) {
      root.querySelectorAll("[data-mc-tab]").forEach((b) => b.addEventListener("click", () => { hideTip(); tab = b.dataset.mcTab; render(root); }));
      root.querySelectorAll("[data-mc-table]").forEach((wrap) => {
        wrap.addEventListener("click", (e) => {
          const th = e.target.closest("th[data-sort]");
          if (!th) return;
          const id = wrap.dataset.mcTable;
          const key = th.dataset.sort;
          const cur = sorts[id];
          sorts[id] = cur && cur.key === key ? { key, dir: -cur.dir } : { key, dir: 1 };
          wrap.innerHTML = tabelaInner(id);
        });
      });
      root.querySelectorAll("[data-cor]").forEach((b) => b.addEventListener("click", () => { corPorRegiao = b.dataset.cor === "reg"; hideTip(); render(root); }));
      root.querySelectorAll("[data-mod-uf]").forEach((b) => b.addEventListener("click", () => { modeloUF = b.dataset.modUf; render(root); }));
      root.querySelectorAll("[data-mod-rev]").forEach((b) => b.addEventListener("click", () => { modeloRev = b.dataset.modRev; render(root); }));
      root.querySelectorAll("[data-tip]").forEach((el) => {
        el.addEventListener("pointerenter", () => fillTip(el));
        el.addEventListener("pointermove", moveTip);
        el.addEventListener("pointerleave", hideTip);
      });
    }

    return { renderSelectedMarcherCampo };
  }

  window.VECTON_REPORTS_MARCHER_CAMPO = { createReportsMarcherCampoModule };
})(window);
