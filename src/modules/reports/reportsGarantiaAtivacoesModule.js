(function attachVectonReportsGarantiaAtivacoes(window) {
  // Relatorio "Ativacoes de Garantia" — fonte: tabela garantia_ativacoes
  // (carga em garantiaAtivacoesCargaModule.js, planilha AltForce). Tres
  // cruzamentos pedidos pelo usuario: mapa de calor por UF (clique no estado
  // abre popover com cidades x maquinas), preco medio por modelo x estado e
  // estoque estimado de revenda (vendas Marcher via comercial_faturado menos
  // ativacoes de garantia, por revenda x modelo).
  function createReportsGarantiaAtivacoesModule(deps) {
    const { escapeHtml, resolveOrganizationId, fetchAllSupabaseRows, fetchSupabaseRows, isSupabaseConfigured } = deps;

    const REPORT_ID = "garantiaAtivacoes";

    const BR = window.VECTON_BR_GEO || { bbox: [-74, -34, -32, 6], states: [] };
    const [minx, miny, maxx, maxy] = BR.bbox;
    const midlat = (miny + maxy) / 2, kx = Math.cos(midlat * Math.PI / 180);
    const gW = (maxx - minx) * kx, gH = (maxy - miny);
    const VW = 640, VH = Math.round(VW * gH / gW);
    const proj = (lo, la) => [(lo - minx) * kx / gW * VW, (maxy - la) / gH * VH];

    function statePath(rings) {
      return rings.map((r) => "M" + r.map(([lo, la]) => { const [x, y] = proj(lo, la); return x.toFixed(1) + "," + y.toFixed(1); }).join("L") + "Z").join(" ");
    }
    function fmtMoney(v) {
      return v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    }

    let loading = false;
    let lastError = null;
    let dataLoaded = false;
    let ativacoes = [];
    let produtosById = new Map();
    let clientesById = new Map();
    let vendasPorClienteModelo = new Map(); // "clienteId|nomeReduzido" -> quantidade (no periodo escolhido)
    let faturadoRows = []; // linhas cruas de comercial_faturado das revendas com ativacao
    // Vendas do estoque estimado acumulam do 1o dia do mes escolhido ate hoje.
    // Padrao jun/2025: mes da NF mais antiga das ativacoes do AltForce; comparar
    // com vendas desde 2023 infla o estoque.
    const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    let estoqueDesde = { year: 2025, month: 6 }; // month 1-12
    let estoqueCleanup = null;
    let popoverCleanup = null;
    let ufSelecionada = null;
    let mapView = null; // viewBox atual do mapa ({x,y,w,h}); null = Brasil inteiro
    const geoByKey = new Map(); // "UF|cidadenormalizada" -> {lat, lng} (comercial_municipios_geo)
    const geoUfsCarregadas = new Set();
    let revendaInfo = new Map(); // cliente_id -> { lat, lng, cidade, uf } (cadastro da revenda + comercial_municipios_geo)
    let estoqueRevendas = [];
    let estoqueFiltro = "all";
    let estoqueBusca = "";
    let hostContainer = null;

    // -------------------------------------------------------------- dados

    // Promise compartilhada: cada abertura do relatorio (novo container) espera a
    // mesma carga em andamento, em vez de ficar presa em "Carregando...".
    let loadPromise = null;
    function loadData() {
      if (!loadPromise) loadPromise = doLoadData().finally(() => { loadPromise = null; });
      return loadPromise;
    }

    async function doLoadData() {
      loading = true;
      lastError = null;
      try {
        if (!isSupabaseConfigured()) { ativacoes = []; dataLoaded = true; return; }
        const org = await resolveOrganizationId();

        const [ativacoesRows, produtos, clientes] = await Promise.all([
          fetchAllSupabaseRows(
            "garantia_ativacoes",
            `organization_id=eq.${org}&select=id,numero,status,produto_raw,modelo_normalizado,produto_id,revenda_raw,cliente_id,cliente_final,vendedor_revenda,uf,cidade,nf_valor_unitario,nf_valor_total,nf_emissao,cadastrado_em`
          ),
          fetchAllSupabaseRows("comercial_produtos", `organization_id=eq.${org}&select=id,nome_reduzido`),
          fetchAllSupabaseRows("comercial_clientes", `organization_id=eq.${org}&select=id,descricao,uf,codigo_ibge`)
        ]);

        ativacoes = ativacoesRows || [];
        produtosById = new Map((produtos || []).map((p) => [p.id, p.nome_reduzido || ""]));
        clientesById = new Map((clientes || []).map((c) => [c.id, c.descricao || ""]));

        const clienteIds = [...new Set(ativacoes.map((r) => r.cliente_id).filter(Boolean))];
        await carregarGeoMunicipios();
        await carregarGeoRevendas(clientes || []);
        faturadoRows = [];
        if (clienteIds.length) {
          faturadoRows = (await fetchAllSupabaseRows(
            "comercial_faturado",
            `organization_id=eq.${org}&cliente_id=in.(${clienteIds.join(",")})&select=id,cliente_id,produto_id,quantidade,entry_date`
          )) || [];
        }
        recalcularVendas();
        dataLoaded = true;
      } catch (error) {
        console.error(error);
        lastError = window.vpFriendlyError ? window.vpFriendlyError(error, "Falha ao carregar ativações de garantia.") : String(error?.message || error);
      } finally {
        loading = false;
      }
    }

    // Coordenadas so das UFs que aparecem nas ativacoes (<= 853 municipios por UF,
    // abaixo do limite de 1000 linhas do PostgREST). Falha aqui nao derruba o relatorio.
    async function carregarGeoMunicipios() {
      if (typeof fetchSupabaseRows !== "function") return;
      const ufs = [...new Set(ativacoes.map((r) => r.uf).filter((uf) => uf && uf !== "EX"))]
        .filter((uf) => !geoUfsCarregadas.has(uf));
      await Promise.all(ufs.map(async (uf) => {
        try {
          const rows = await fetchSupabaseRows("comercial_municipios_geo", `uf=eq.${uf}&select=municipio,uf,lat,lng&limit=1000`);
          (rows || []).forEach((m) => {
            if (m.lat == null || m.lng == null) return;
            geoByKey.set(geoKey(m.uf, m.municipio), { lat: Number(m.lat), lng: Number(m.lng) });
          });
          geoUfsCarregadas.add(uf);
        } catch (error) {
          console.error("Falha ao carregar coordenadas dos municípios", uf, error);
        }
      }));
    }

    // Localizacao das revendas: comercial_clientes.codigo_ibge -> comercial_municipios_geo.
    async function carregarGeoRevendas(clientes) {
      revendaInfo = new Map();
      if (typeof fetchSupabaseRows !== "function") return;
      const ids = new Set(ativacoes.map((r) => r.cliente_id).filter(Boolean));
      const porIbge = new Map(); // codigo_ibge -> [cliente_id]
      clientes.forEach((c) => {
        if (!ids.has(c.id) || !c.codigo_ibge) return;
        if (!porIbge.has(c.codigo_ibge)) porIbge.set(c.codigo_ibge, []);
        porIbge.get(c.codigo_ibge).push(c.id);
      });
      if (!porIbge.size) return;
      try {
        const rows = await fetchSupabaseRows(
          "comercial_municipios_geo",
          `codigo_ibge=in.(${[...porIbge.keys()].join(",")})&select=codigo_ibge,municipio,uf,lat,lng`
        );
        (rows || []).forEach((m) => {
          if (m.lat == null || m.lng == null) return;
          (porIbge.get(m.codigo_ibge) || []).forEach((id) => {
            revendaInfo.set(id, { lat: Number(m.lat), lng: Number(m.lng), cidade: m.municipio, uf: m.uf });
          });
        });
      } catch (error) {
        console.error("Falha ao carregar localização das revendas", error);
      }
    }

    function recalcularVendas() {
      vendasPorClienteModelo = new Map();
      const desde = `${estoqueDesde.year}-${String(estoqueDesde.month).padStart(2, "0")}-01`;
      faturadoRows.forEach((row) => {
        if (String(row.entry_date || "") < desde) return;
        const nomeReduzido = produtosById.get(row.produto_id);
        if (!nomeReduzido) return;
        const key = `${row.cliente_id}|${nomeReduzido.toUpperCase()}`;
        vendasPorClienteModelo.set(key, (vendasPorClienteModelo.get(key) || 0) + Number(row.quantidade || 0));
      });
    }

    // -------------------------------------------------------------- shell

    function renderSelectedGarantiaAtivacoes(container, reportId) {
      if (reportId !== REPORT_ID) return false;
      hostContainer = container;
      container.innerHTML = `<div id="gar-root" class="gar-root"></div>`;
      const root = container.querySelector("#gar-root");
      render(root);
      // Sempre recarrega ao abrir (a carga pode ter mudado os dados); enquanto
      // isso mostra o que ja estava em memoria.
      void loadData().then(() => { if (root.isConnected !== false) render(root); });
      return true;
    }

    function render(root) {
      if (!root) return;
      if (loading && !dataLoaded) {
        root.innerHTML = `<div class="actuals-empty">Carregando ativações de garantia...</div>`;
        return;
      }
      if (lastError) {
        root.innerHTML = `<div class="actuals-empty">${escapeHtml(lastError)}</div>`;
        return;
      }
      if (!ativacoes.length) {
        root.innerHTML = `<div class="actuals-empty">Nenhuma ativação de garantia carregada. Suba a planilha na tela "Carga de Ativações de Garantia" (dentro de Carga de Realizado).</div>`;
        return;
      }

      root.innerHTML = `
        <div class="gar-summary-bar">
          <span><strong>${ativacoes.length}</strong> ativações carregadas</span>
          <span><strong>${new Set(ativacoes.map((r) => r.revenda_raw).filter(Boolean)).size}</strong> revendas distintas</span>
          <span><strong>${new Set(ativacoes.map((r) => r.uf).filter(Boolean)).size}</strong> estados</span>
        </div>
        <div class="gar-grid">
          <div class="content-card gar-card gar-card-wide">
            <div class="card-toolbar">
              <div><p class="section-kicker">Distribuição geográfica</p><h4 class="inline-card-title">Mapa de calor de ativações por UF</h4></div>
            </div>
            <div class="gar-heatmap-body">
              ${renderUfMap()}
            </div>
          </div>

          <div class="content-card gar-card gar-card-wide">
            <p class="section-kicker">Cruzamento com vendas</p>
            <h4 class="inline-card-title">Estoque estimado por revenda</h4>
            <p class="gar-hint">Estoque estimado = unidades vendidas pela Marcher à revenda (faturado, acumulado a partir do mês escolhido) − unidades com garantia já ativada por ela, por modelo.</p>
            ${renderEstoqueEstimado()}
          </div>
        </div>
      `;

      bindUfExplorer(root);
      bindEstoque(root);
    }

    // -------------------------------------------------------------- seção A: heatmap

    function fullView() {
      return { x: 0, y: 0, w: VW, h: VH };
    }

    function viewBoxAttr(v) {
      return `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`;
    }

    function renderUfMap() {
      const counts = new Map();
      ativacoes.forEach((r) => { if (r.uf) counts.set(r.uf, (counts.get(r.uf) || 0) + 1); });
      const values = [...counts.values()];
      const max = values.length ? Math.max(...values) : 0;
      const cidadesPorUf = new Map();
      ativacoes.forEach((r) => {
        if (!r.uf) return;
        if (!cidadesPorUf.has(r.uf)) cidadesPorUf.set(r.uf, new Set());
        cidadesPorUf.get(r.uf).add(cidadeKey(r));
      });

      const paths = (BR.states || []).map((st) => {
        if (!st.rings || !st.rings.length) return "";
        const count = counts.get(st.uf) || 0;
        const fill = window.VECTON_MAP_APPEARANCE.heat(count, max);
        return `<path class="gar-map-state${st.uf === ufSelecionada ? " is-selected" : ""}" data-uf="${escapeHtml(st.uf)}" data-nome="${escapeHtml(st.nome)}" data-count="${count}" data-cidades="${cidadesPorUf.get(st.uf)?.size || 0}" d="${statePath(st.rings)}" fill="${fill}" stroke="var(--theme-border, rgba(255,255,255,0.55))" stroke-width="0.9" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>`;
      }).join("");

      const legend = max > 0 ? `
        <div class="gar-ufmap-legend">
          <span>0</span>
          <div class="gar-ufmap-legend-bar">
            <span style="background:${window.VECTON_MAP_APPEARANCE.heat(0, max)}"></span>
            <span style="background:${window.VECTON_MAP_APPEARANCE.heat(max * 0.33, max)}"></span>
            <span style="background:${window.VECTON_MAP_APPEARANCE.heat(max * 0.66, max)}"></span>
            <span style="background:${window.VECTON_MAP_APPEARANCE.heat(max, max)}"></span>
          </div>
          <span>${max}</span>
          <span class="gar-ufmap-legend-caption">ativações por estado</span>
        </div>
      ` : "";

      const view = mapView || fullView();
      return `
        <div class="gar-uf-layout">
          <div class="gar-ufmap-wrap">
            <div class="gar-zoom">
              <button type="button" data-z="in" title="Aproximar">+</button>
              <button type="button" data-z="reset" title="Início">⟳</button>
              <button type="button" data-z="out" title="Afastar">−</button>
            </div>
            <svg viewBox="${viewBoxAttr(view)}" class="gar-ufmap${ufSelecionada ? " is-zoomed" : ""}">${paths}<g class="gar-links"></g><g class="gar-revs"></g><g class="gar-dots"></g></svg>
            ${legend}
          </div>
          <aside class="gar-uf-side" id="gar-uf-side">${renderUfSide()}</aside>
        </div>
      `;
    }

    function fmtDate(value) {
      const iso = String(value || "").slice(0, 10);
      const [y, m, d] = iso.split("-");
      return y && m && d ? `${d}/${m}/${y}` : "—";
    }

    function cidadeKey(row) {
      return (row.cidade || "").trim() || "—";
    }

    function geoKey(uf, cidade) {
      const nome = String(cidade || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
        .replace(/sant ana/g, "santana").replace(/[^a-z0-9]+/g, "");
      return `${uf}|${nome}`;
    }

    // Painel ao lado do mapa: cidades do estado clicado e quantidade de maquinas.
    function renderUfSide() {
      if (!ufSelecionada) {
        return `<div class="gar-uf-empty">Clique em um estado do mapa para aproximar e ver as cidades e a quantidade de máquinas.</div>`;
      }
      const nome = (BR.states || []).find((st) => st.uf === ufSelecionada)?.nome || ufSelecionada;
      const cidades = new Map();
      ativacoes.forEach((r) => {
        if (r.uf !== ufSelecionada) return;
        const key = cidadeKey(r);
        cidades.set(key, (cidades.get(key) || 0) + 1);
      });
      const lista = [...cidades.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
      const total = lista.reduce((acc, [, n]) => acc + n, 0);
      return `
        <div class="gar-uf-side-head">
          <strong>${escapeHtml(nome)}</strong>
          <span>${total} máquina(s)</span>
        </div>
        ${lista.length ? `
          <div class="gar-uf-side-list">
            ${lista.map(([cidade, n]) => `
              <button type="button" class="gar-uf-city" data-city="${escapeHtml(cidade)}">
                <span>${escapeHtml(cidade)}</span><strong>${n}</strong>
              </button>`).join("")}
          </div>` : `<div class="gar-uf-empty">Nenhuma máquina ativada neste estado.</div>`}
      `;
    }

    // Janela (viewBox) que enquadra o estado com folga, mantendo a proporcao do mapa.
    function viewParaEstado(uf) {
      const st = (BR.states || []).find((s) => s.uf === uf);
      if (!st || !st.rings || !st.rings.length) return fullView();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      st.rings.forEach((ring) => ring.forEach(([lo, la]) => {
        const [x, y] = proj(lo, la);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }));
      const ratio = VW / VH;
      let w = Math.max((x1 - x0) * 1.35, (y1 - y0) * 1.35 * ratio, VW * 0.14);
      w = Math.min(w, VW);
      const h = w / ratio;
      return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
    }

    function getMapTip() {
      let el = document.getElementById("gar-map-tip");
      if (!el) {
        el = document.createElement("div");
        el.id = "gar-map-tip";
        el.style.cssText = "position:fixed;z-index:9999;display:none;pointer-events:none;" +
          "background:var(--theme-surface, #13161c);border:1px solid var(--blue, #3b5bdb);box-shadow:inset 0 0 0 1px var(--blue, #3b5bdb);border-radius:var(--radius, 8px);padding:6px 10px;line-height:1.5;white-space:nowrap";
        document.body.appendChild(el);
      }
      return el;
    }

    function bindUfExplorer(root) {
      if (popoverCleanup) { popoverCleanup(); popoverCleanup = null; }
      const layout = root.querySelector(".gar-uf-layout");
      const side = root.querySelector("#gar-uf-side");
      const svg = layout?.querySelector(".gar-ufmap");
      const dotsG = svg?.querySelector(".gar-dots");
      const revsG = svg?.querySelector(".gar-revs");
      const linksG = svg?.querySelector(".gar-links");
      if (!layout || !side || !svg || !dotsG || !revsG || !linksG) return;

      let pop = null;
      let anim = 0;
      let dragMoved = false;

      const closePop = () => {
        pop?.remove();
        pop = null;
        layout.querySelectorAll(".gar-uf-city.is-open, .gar-dot.is-open").forEach((el) => el.classList.remove("is-open"));
      };

      // cidade -> Map(cliente_id -> {nome, n}); cliente_id -> Map(cidade -> n)
      let cityRevs = new Map();
      let revCities = new Map();
      let revNomes = new Map();

      const drawDots = () => {
        dotsG.innerHTML = "";
        revsG.innerHTML = "";
        linksG.innerHTML = "";
        if (!ufSelecionada) return;
        const view = mapView || fullView();
        const scale = svg.getBoundingClientRect().width / view.w || 1;
        const porCidade = new Map();
        cityRevs = new Map();
        revCities = new Map();
        ativacoes.forEach((r) => {
          if (r.uf !== ufSelecionada) return;
          const key = cidadeKey(r);
          porCidade.set(key, (porCidade.get(key) || 0) + 1);
          if (!r.cliente_id) return;
          if (!cityRevs.has(key)) cityRevs.set(key, new Map());
          const cr = cityRevs.get(key);
          const cur = cr.get(r.cliente_id) || { nome: r.revenda_raw || "", n: 0 };
          cur.n += 1;
          cr.set(r.cliente_id, cur);
          if (!revCities.has(r.cliente_id)) revCities.set(r.cliente_id, new Map());
          const rc = revCities.get(r.cliente_id);
          rc.set(key, (rc.get(key) || 0) + 1);
          if (!revNomes.has(r.cliente_id)) revNomes.set(r.cliente_id, r.revenda_raw || "");
        });

        const circles = [];
        [...porCidade.entries()].sort((a, b) => b[1] - a[1]).forEach(([cidade, n]) => {
          const geo = geoByKey.get(geoKey(ufSelecionada, cidade));
          if (!geo) return;
          const [cx, cy] = proj(geo.lng, geo.lat);
          const r = (5 + 3.2 * Math.sqrt(n)) / scale;
          circles.push(`<circle class="gar-dot" data-city="${escapeHtml(cidade)}" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" data-count="${n}" stroke-width="${(1.5 / scale).toFixed(3)}"></circle>`);
        });
        dotsG.innerHTML = circles.join("");

        // Marcador (losango) das revendas que venderam para clientes deste estado.
        const losangos = [];
        revCities.forEach((cidades, clienteId) => {
          const info = revendaInfo.get(clienteId);
          if (!info) return;
          const [rx, ry] = proj(info.lng, info.lat);
          const d = 8 / scale;
          losangos.push(`<path class="gar-rev" data-rev="${escapeHtml(clienteId)}" d="M${rx.toFixed(2)} ${(ry - d).toFixed(2)} L${(rx + d).toFixed(2)} ${ry.toFixed(2)} L${rx.toFixed(2)} ${(ry + d).toFixed(2)} L${(rx - d).toFixed(2)} ${ry.toFixed(2)} Z" stroke-width="${(1.5 / scale).toFixed(3)}"></path>`);
        });
        revsG.innerHTML = losangos.join("");
        requestAnimationFrame(() => { dotsG.classList.add("is-in"); revsG.classList.add("is-in"); });
      };

      // Linhas tracejadas revenda -> cidades do cliente final (so em foco).
      const limparLinks = () => {
        linksG.innerHTML = "";
        revsG.querySelectorAll(".gar-rev.is-hot").forEach((el) => el.classList.remove("is-hot"));
        dotsG.querySelectorAll(".gar-dot.is-linked").forEach((el) => el.classList.remove("is-linked"));
      };
      const desenharLinks = (clienteIds, cidadesAlvo) => {
        limparLinks();
        const linhas = [];
        clienteIds.forEach((clienteId) => {
          const info = revendaInfo.get(clienteId);
          if (!info) return;
          const [rx, ry] = proj(info.lng, info.lat);
          revsG.querySelector(`.gar-rev[data-rev="${CSS.escape(clienteId)}"]`)?.classList.add("is-hot");
          const alvos = cidadesAlvo || [...(revCities.get(clienteId)?.keys() || [])];
          alvos.forEach((cidade) => {
            const dot = [...dotsG.querySelectorAll(".gar-dot")].find((el) => el.dataset.city === cidade);
            if (!dot) return;
            dot.classList.add("is-linked");
            linhas.push(`<line class="gar-link" x1="${rx.toFixed(2)}" y1="${ry.toFixed(2)}" x2="${dot.getAttribute("cx")}" y2="${dot.getAttribute("cy")}"></line>`);
          });
        });
        linksG.innerHTML = linhas.join("");
      };

      const animateTo = (target, onDone) => {
        cancelAnimationFrame(anim);
        const from = mapView || fullView();
        const t0 = performance.now();
        const dur = 420;
        const step = (now) => {
          const p = Math.min(1, (now - t0) / dur);
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          const v = {
            x: from.x + (target.x - from.x) * e,
            y: from.y + (target.y - from.y) * e,
            w: from.w + (target.w - from.w) * e,
            h: from.h + (target.h - from.h) * e
          };
          svg.setAttribute("viewBox", viewBoxAttr(v));
          if (p < 1) anim = requestAnimationFrame(step);
          else { mapView = target; onDone?.(); }
        };
        anim = requestAnimationFrame(step);
      };

      const selecionarUf = (uf) => {
        ufSelecionada = uf;
        closePop();
        dotsG.classList.remove("is-in");
        revsG.classList.remove("is-in");
        dotsG.innerHTML = "";
        revsG.innerHTML = "";
        linksG.innerHTML = "";
        svg.classList.add("is-zoomed");
        layout.querySelectorAll(".gar-map-state").forEach((el) => el.classList.toggle("is-selected", el.dataset.uf === uf));
        side.innerHTML = renderUfSide();
        animateTo(viewParaEstado(uf), drawDots);
      };

      const resetar = () => {
        ufSelecionada = null;
        closePop();
        dotsG.classList.remove("is-in");
        revsG.classList.remove("is-in");
        dotsG.innerHTML = "";
        revsG.innerHTML = "";
        linksG.innerHTML = "";
        svg.classList.remove("is-zoomed");
        layout.querySelectorAll(".gar-map-state").forEach((el) => el.classList.remove("is-selected"));
        side.innerHTML = renderUfSide();
        animateTo(fullView(), () => { mapView = null; });
      };

      const zoomManual = (fator) => {
        const v = mapView || fullView();
        const w = Math.min(VW, Math.max(VW * 0.05, v.w * fator));
        const h = w * VH / VW;
        const alvo = { x: v.x + v.w / 2 - w / 2, y: v.y + v.h / 2 - h / 2, w, h };
        closePop();
        dotsG.classList.remove("is-in");
        revsG.classList.remove("is-in");
        animateTo(alvo, drawDots);
      };

      const abrirCidade = (cidade, anchor) => {
        const itens = ativacoes
          .filter((r) => r.uf === ufSelecionada && cidadeKey(r) === cidade)
          .sort((a, b) => String(b.cadastrado_em || "").localeCompare(String(a.cadastrado_em || "")));

        closePop();
        anchor.classList.add("is-open");
        side.querySelectorAll(".gar-uf-city").forEach((el) => el.classList.toggle("is-open", el.dataset.city === cidade));
        pop = document.createElement("div");
        pop.className = "gar-city-pop";
        pop.innerHTML = `
          <div class="gar-popover-head">
            <strong>${escapeHtml(cidade)}</strong>
            <span>${ufSelecionada} · ${itens.length} máquina(s)</span>
            <button type="button" class="gar-popover-close" aria-label="Fechar">×</button>
          </div>
          <div class="gar-city-table-wrap">
            <table class="data-table gar-city-table">
              <thead><tr><th>Modelo</th><th>Revenda</th><th>Ativação</th><th>NF</th><th>Cliente final</th><th>Valor</th></tr></thead>
              <tbody>
                ${itens.map((r) => `
                  <tr>
                    <td>${escapeHtml(r.modelo_normalizado || r.produto_raw || "—")}</td>
                    <td>${escapeHtml(r.revenda_raw || "—")}${revendaInfo.get(r.cliente_id) ? ` <small class="gar-city-sub">${escapeHtml(revendaInfo.get(r.cliente_id).cidade)}/${escapeHtml(revendaInfo.get(r.cliente_id).uf)}</small>` : ""}</td>
                    <td>${fmtDate(r.cadastrado_em)}</td>
                    <td>${fmtDate(r.nf_emissao)}</td>
                    <td>${escapeHtml(r.cliente_final || "—")}</td>
                    <td class="gar-city-valor">${fmtMoney(r.nf_valor_unitario)}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        `;
        pop.querySelector(".gar-popover-close").addEventListener("click", closePop);
        layout.append(pop);

        const box = layout.getBoundingClientRect();
        const width = Math.min(pop.offsetWidth, box.width);
        // Canto inferior direito da area do mapa.
        const left = Math.max(0, box.width - width);
        const top = Math.max(0, box.height - pop.offsetHeight);
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
      };

      // Tooltip no padrao visual do app (cartao com linhas rotulo/valor), no lugar do title nativo.
      const tipEl = getMapTip();
      const hideTip = () => { tipEl.style.display = "none"; };
      const linhaTip = (label, value, strong) => `<span style="display:flex;justify-content:space-between;gap:16px"><span style="font-size:0.62rem;color:var(--theme-ink-secondary, #a1a7b3)">${escapeHtml(label)}</span><span style="font-size:0.72rem;font-weight:${strong ? 700 : 600};color:${strong ? "var(--theme-ink, #fff)" : "var(--theme-ink-secondary, #a1a7b3)"}">${escapeHtml(value)}</span></span>`;
      // Posicao fixa: logo abaixo do painel de cidades (ao lado do mapa), fora da area do mapa.
      const posicionarTip = () => {
        const painel = side.getBoundingClientRect();
        const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
        const vw = window.innerWidth, vh = window.innerHeight;
        tipEl.style.minWidth = `${Math.round(painel.width)}px`;
        const x = Math.min(Math.max(8, painel.left), Math.max(8, vw - w - 8));
        const y = Math.min(painel.bottom + 10, vh - h - 8);
        tipEl.style.left = x + "px";
        tipEl.style.top = Math.max(8, y) + "px";
      };
      let hoverKey = "";
      svg.addEventListener("mousemove", (event) => {
        const dot = event.target.closest(".gar-dot");
        const rev = dot ? null : event.target.closest(".gar-rev");
        const path = dot || rev ? null : event.target.closest(".gar-map-state");
        if (!dot && !rev && !path) { hideTip(); if (hoverKey) { limparLinks(); hoverKey = ""; } return; }

        const key = dot ? `d:${dot.dataset.city}` : rev ? `r:${rev.dataset.rev}` : "";
        if (key !== hoverKey) {
          hoverKey = key;
          if (dot) desenharLinks([...(cityRevs.get(dot.dataset.city)?.keys() || [])], [dot.dataset.city]);
          else if (rev) desenharLinks([rev.dataset.rev]);
          else limparLinks();
        }

        let html;
        if (dot) {
          html = linhaTip("Cidade", dot.dataset.city, true) + linhaTip("Máquinas", dot.dataset.count);
          [...(cityRevs.get(dot.dataset.city)?.entries() || [])].slice(0, 3).forEach(([id, v]) => {
            const info = revendaInfo.get(id);
            html += linhaTip("Revenda", `${v.nome || revNomes.get(id) || "—"}${info ? ` · ${info.cidade}/${info.uf}` : ""}`);
          });
        } else if (rev) {
          const id = rev.dataset.rev;
          const info = revendaInfo.get(id);
          const total = [...(revCities.get(id)?.values() || [])].reduce((a, b) => a + b, 0);
          html = linhaTip("Revenda", revNomes.get(id) || "—", true) + linhaTip("Local", info ? `${info.cidade}/${info.uf}` : "—") + linhaTip("Máquinas no estado", String(total));
        } else {
          html = linhaTip("Estado", path.dataset.nome, true) + linhaTip("Máquinas", path.dataset.count) + linhaTip("Cidades", path.dataset.cidades);
        }
        tipEl.innerHTML = html;
        tipEl.style.display = "block";
        posicionarTip(event);
      });
      svg.addEventListener("mouseleave", () => { hideTip(); limparLinks(); hoverKey = ""; });

      const onDocPointer = (event) => {
        if (pop && !pop.contains(event.target) && !event.target.closest(".gar-uf-city, .gar-dot")) closePop();
      };
      const onKey = (event) => { if (event.key === "Escape") closePop(); };
      document.addEventListener("pointerdown", onDocPointer);
      document.addEventListener("keydown", onKey);
      popoverCleanup = () => {
        hideTip();
        cancelAnimationFrame(anim);
        closePop();
        document.removeEventListener("pointerdown", onDocPointer);
        document.removeEventListener("keydown", onKey);
      };

      svg.addEventListener("click", (event) => {
        if (dragMoved) { dragMoved = false; return; }
        const dot = event.target.closest(".gar-dot");
        if (dot) { abrirCidade(dot.dataset.city, dot); return; }
        const path = event.target.closest(".gar-map-state");
        if (path && path.dataset.uf !== ufSelecionada) selecionarUf(path.dataset.uf);
      });
      layout.querySelector(".gar-zoom")?.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-z]");
        if (!btn) return;
        if (btn.dataset.z === "in") zoomManual(0.8);
        else if (btn.dataset.z === "out") zoomManual(1.25);
        else resetar();
      });
      side.addEventListener("click", (event) => {
        const btn = event.target.closest(".gar-uf-city");
        if (btn) abrirCidade(btn.dataset.city, btn);
      });

      // Arrastar para mover o mapa quando aproximado.
      svg.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || !mapView || mapView.w >= VW - 0.5) return;
        const start = { x: event.clientX, y: event.clientY, view: { ...mapView } };
        const pxW = svg.getBoundingClientRect().width || 1;
        const move = (ev) => {
          const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) dragMoved = true;
          if (!dragMoved) return;
          const k = start.view.w / pxW;
          mapView = { ...start.view, x: start.view.x - dx * k, y: start.view.y - dy * k };
          svg.setAttribute("viewBox", viewBoxAttr(mapView));
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          setTimeout(() => { dragMoved = false; }, 0);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      });

      if (ufSelecionada) { dotsG.classList.add("is-in"); revsG.classList.add("is-in"); drawDots(); }
    }

    // -------------------------------------------------------------- seção B: preço x modelo x estado

    // Card removido do relatorio por enquanto; mantido para reativar depois.
    function renderPrecoPorModeloEstado() {
      const map = new Map(); // modelo -> Map(uf -> {soma, qtd})
      ativacoes.forEach((r) => {
        if (r.nf_valor_unitario == null) return;
        const modelo = r.modelo_normalizado || (r.produto_raw ? r.produto_raw.trim() : "—") || "—";
        const uf = r.uf || "—";
        if (!map.has(modelo)) map.set(modelo, new Map());
        const inner = map.get(modelo);
        const cur = inner.get(uf) || { soma: 0, qtd: 0 };
        cur.soma += Number(r.nf_valor_unitario);
        cur.qtd += 1;
        inner.set(uf, cur);
      });

      const modelos = [...map.entries()]
        .map(([modelo, inner]) => ({ modelo, inner, total: [...inner.values()].reduce((a, b) => a + b.qtd, 0) }))
        .sort((a, b) => b.total - a.total);
      const ufs = [...new Set(modelos.flatMap((m) => [...m.inner.keys()]))].sort();

      if (!modelos.length) {
        return `<div class="actuals-empty">Nenhuma ativação com valor de nota fiscal preenchido.</div>`;
      }

      const header = `<th>Modelo</th>${ufs.map((uf) => `<th>${escapeHtml(uf)}</th>`).join("")}<th>Média geral</th>`;
      const body = modelos.map((m) => {
        let somaGeral = 0, qtdGeral = 0;
        const cells = ufs.map((uf) => {
          const cell = m.inner.get(uf);
          if (!cell) return `<td style="text-align:center">—</td>`;
          somaGeral += cell.soma; qtdGeral += cell.qtd;
          return `<td style="text-align:center" title="${cell.qtd} ativação(ões)">${fmtMoney(cell.soma / cell.qtd)}</td>`;
        }).join("");
        return `<tr><td>${escapeHtml(m.modelo)}</td>${cells}<td style="text-align:center"><strong>${fmtMoney(qtdGeral ? somaGeral / qtdGeral : null)}</strong></td></tr>`;
      }).join("");

      return `
        <div class="table-shell gar-heat-table-shell">
          <table class="data-table gar-heat-table">
            <thead><tr>${header}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      `;
    }

    // -------------------------------------------------------------- seção D: estoque estimado

    function renderEstoqueLista() {
      const termo = estoqueBusca.trim().toLowerCase();
      const lista = estoqueRevendas.filter((r) => {
        if (estoqueFiltro === "positivo" && r.estoque <= 0) return false;
        if (estoqueFiltro === "negativo" && r.estoque >= 0) return false;
        if (!termo) return true;
        return r.revenda.toLowerCase().includes(termo) || r.modelos.some((m) => m.modelo.toLowerCase().includes(termo));
      });
      if (!lista.length) return `<div class="actuals-empty">Nenhuma revenda para este filtro.</div>`;
      return lista.map((r, idx) => {
        const pct = r.vendido > 0 ? Math.min(100, Math.round((r.ativado / r.vendido) * 100)) : (r.ativado ? 100 : 0);
        const cls = r.estoque < 0 ? "is-neg" : r.estoque === 0 ? "is-zero" : "";
        return `
          <div class="gar-est-item">
            <button type="button" class="gar-est-row" data-est-toggle="${idx}" aria-expanded="false">
              <span class="gar-est-name" title="${escapeHtml(r.revenda)}">${escapeHtml(r.revenda)}</span>
              <span class="gar-est-num"><small>Vendido</small>${r.vendido}</span>
              <span class="gar-est-num"><small>Ativado</small>${r.ativado}</span>
              <span class="gar-est-bar" title="${pct}% das máquinas vendidas já ativadas"><i style="width:${pct}%"></i></span>
              <span class="gar-est-num gar-est-stock ${cls}"><small>Estoque</small>${r.estoque}</span>
            </button>
            <div class="gar-est-detail" hidden>
              ${r.modelos.map((m) => `
                <div class="gar-est-model">
                  <span>${escapeHtml(m.modelo)}</span>
                  <span>vendido ${m.vendido}</span>
                  <span>ativado ${m.ativado}</span>
                  <strong class="${m.estoque < 0 ? "is-neg" : ""}">${m.estoque}</strong>
                </div>`).join("")}
            </div>
          </div>`;
      }).join("");
    }

    function bindEstoquePeriodo(root) {
      if (estoqueCleanup) { estoqueCleanup(); estoqueCleanup = null; }
      const trigger = root.querySelector("#gar-est-period-trigger");
      const pop = root.querySelector("#gar-est-period-popover");
      if (!trigger || !pop) return;
      const yearLabel = pop.querySelector("[data-year-label]");
      const grid = pop.querySelector("[data-month-grid]");
      let viewYear = estoqueDesde.year;

      const close = () => { pop.hidden = true; trigger.setAttribute("aria-expanded", "false"); };
      const drawMonths = () => {
        yearLabel.textContent = String(viewYear);
        grid.innerHTML = MESES_ABREV.map((nome, idx) => {
          const active = viewYear === estoqueDesde.year && idx + 1 === estoqueDesde.month;
          return `<button type="button" class="period-month-button${active ? " active" : ""}" data-month="${idx + 1}">${nome}</button>`;
        }).join("");
      };
      drawMonths();

      trigger.addEventListener("click", () => {
        const opening = pop.hidden;
        pop.hidden = !opening;
        trigger.setAttribute("aria-expanded", String(opening));
        if (opening) { viewYear = estoqueDesde.year; drawMonths(); }
      });
      pop.addEventListener("click", (event) => {
        const nav = event.target.closest("[data-year-nav]");
        if (nav) { viewYear += Number(nav.dataset.yearNav); drawMonths(); return; }
        const btn = event.target.closest("[data-month]");
        if (!btn) return;
        estoqueDesde = { year: viewYear, month: Number(btn.dataset.month) };
        recalcularVendas();
        render(root);
      });

      const onDocPointer = (event) => { if (!pop.hidden && !event.target.closest(".gar-est-period")) close(); };
      const onKey = (event) => { if (event.key === "Escape") close(); };
      document.addEventListener("pointerdown", onDocPointer);
      document.addEventListener("keydown", onKey);
      estoqueCleanup = () => {
        document.removeEventListener("pointerdown", onDocPointer);
        document.removeEventListener("keydown", onKey);
      };
    }

    function bindEstoque(root) {
      const listEl = root.querySelector("#gar-est-list");
      if (!listEl) return;
      const refresh = () => { listEl.innerHTML = renderEstoqueLista(); };
      listEl.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-est-toggle]");
        if (!btn) return;
        const detail = btn.nextElementSibling;
        const open = btn.getAttribute("aria-expanded") !== "true";
        btn.setAttribute("aria-expanded", String(open));
        if (detail) detail.hidden = !open;
      });
      bindEstoquePeriodo(root);
      root.querySelector("#gar-est-search")?.addEventListener("input", (event) => {
        estoqueBusca = event.target.value;
        refresh();
      });
      root.querySelector("#gar-est-filters")?.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-filter]");
        if (!btn) return;
        estoqueFiltro = btn.dataset.filter;
        root.querySelectorAll("#gar-est-filters button").forEach((b) => b.classList.toggle("active", b === btn));
        refresh();
      });
    }

    function renderEstoqueEstimado() {
      const ativadoPorChave = new Map(); // "clienteId|modelo" -> count
      const semRevenda = [];
      const semProduto = [];

      ativacoes.forEach((r) => {
        if (r.revenda_raw && !r.cliente_id) semRevenda.push(r);
        if (r.produto_raw && !r.modelo_normalizado) semProduto.push(r);
        if (!r.cliente_id || !r.modelo_normalizado) return;
        const key = `${r.cliente_id}|${r.modelo_normalizado.toUpperCase()}`;
        ativadoPorChave.set(key, (ativadoPorChave.get(key) || 0) + 1);
      });

      const chaves = new Set([...ativadoPorChave.keys(), ...vendasPorClienteModelo.keys()]);
      const porRevenda = new Map(); // clienteId -> { revenda, vendido, ativado, modelos[] }
      chaves.forEach((key) => {
        const [clienteId, modelo] = key.split("|");
        const vendido = vendasPorClienteModelo.get(key) || 0;
        const ativado = ativadoPorChave.get(key) || 0;
        if (!porRevenda.has(clienteId)) {
          porRevenda.set(clienteId, { revenda: clientesById.get(clienteId) || clienteId, vendido: 0, ativado: 0, modelos: [] });
        }
        const rev = porRevenda.get(clienteId);
        rev.vendido += vendido;
        rev.ativado += ativado;
        rev.modelos.push({ modelo, vendido, ativado, estoque: vendido - ativado });
      });
      estoqueRevendas = [...porRevenda.values()].map((rev) => ({
        ...rev,
        estoque: rev.vendido - rev.ativado,
        modelos: rev.modelos.sort((a, b) => b.estoque - a.estoque || a.modelo.localeCompare(b.modelo, "pt-BR"))
      })).sort((a, b) => b.estoque - a.estoque || a.revenda.localeCompare(b.revenda, "pt-BR"));

      const tot = estoqueRevendas.reduce((acc, r) => {
        acc.vendido += r.vendido; acc.ativado += r.ativado; acc.estoque += r.estoque;
        if (r.estoque < 0) acc.negativas += 1;
        return acc;
      }, { vendido: 0, ativado: 0, estoque: 0, negativas: 0 });

      const tabela = !estoqueRevendas.length
        ? `<div class="actuals-empty">Sem revendas com cadastro casado a vendas Marcher.</div>`
        : `
          <div class="gar-est-kpis">
            <div><span>Vendido (Marcher)</span><strong>${tot.vendido}</strong></div>
            <div><span>Ativado (garantia)</span><strong>${tot.ativado}</strong></div>
            <div><span>Estoque estimado</span><strong>${tot.estoque}</strong></div>
            <div class="${tot.negativas ? "is-warn" : ""}"><span>Revendas com estoque negativo</span><strong>${tot.negativas}</strong></div>
          </div>
          <div class="gar-est-tools">
            <div class="gar-est-period">
              <span>Vendas a partir de</span>
              <div class="period-picker">
                <button id="gar-est-period-trigger" class="header-select header-select-small period-trigger" type="button" aria-haspopup="dialog" aria-expanded="false">
                  <strong class="period-trigger-combined">${MESES_ABREV[estoqueDesde.month - 1]}/${estoqueDesde.year}</strong>
                </button>
                <div id="gar-est-period-popover" class="period-popover gar-est-period-popover" hidden>
                  <div class="period-popover-header">
                    <button data-year-nav="-1" class="period-nav-button" type="button" aria-label="Ano anterior">‹</button>
                    <strong data-year-label>${estoqueDesde.year}</strong>
                    <button data-year-nav="1" class="period-nav-button" type="button" aria-label="Próximo ano">›</button>
                  </div>
                  <p class="period-popover-caption">As vendas são acumuladas do início do mês escolhido até hoje.</p>
                  <div class="period-month-grid" data-month-grid></div>
                </div>
              </div>
            </div>
            <input id="gar-est-search" type="search" placeholder="Buscar revenda ou modelo..." value="${escapeHtml(estoqueBusca)}">
            <div class="gar-est-filters" id="gar-est-filters">
              <button type="button" data-filter="all"${estoqueFiltro === "all" ? ' class="active"' : ""}>Todas</button>
              <button type="button" data-filter="positivo"${estoqueFiltro === "positivo" ? ' class="active"' : ""}>Com estoque</button>
              <button type="button" data-filter="negativo"${estoqueFiltro === "negativo" ? ' class="active"' : ""}>Estoque negativo</button>
            </div>
          </div>
          <div class="gar-est-list" id="gar-est-list">${renderEstoqueLista()}</div>
        `;

      const unresolved = (semRevenda.length || semProduto.length)
        ? `
          <div class="gar-unresolved">
            <strong>Sem correspondência de cadastro (revise revenda/produto na carga):</strong>
            <ul>
              ${semRevenda.length ? `<li>${semRevenda.length} ativação(ões) com revenda sem correspondência em Clientes: ${[...new Set(semRevenda.map((r) => r.revenda_raw))].slice(0, 8).map(escapeHtml).join(", ")}${semRevenda.length > 8 ? "…" : ""}</li>` : ""}
              ${semProduto.length ? `<li>${semProduto.length} ativação(ões) com produto sem modelo reconhecido: ${[...new Set(semProduto.map((r) => r.produto_raw))].slice(0, 8).map(escapeHtml).join(", ")}${semProduto.length > 8 ? "…" : ""}</li>` : ""}
            </ul>
          </div>
        `
        : "";

      return tabela + unresolved;
    }

    return {
      renderSelectedGarantiaAtivacoes,
      loadData
    };
  }

  window.VECTON_REPORTS_GARANTIA_ATIVACOES = { createReportsGarantiaAtivacoesModule };
})(window);
