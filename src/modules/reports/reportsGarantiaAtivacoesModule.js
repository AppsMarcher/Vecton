(function attachVectonReportsGarantiaAtivacoes(window) {
  // Relatorio "Ativacoes de Garantia" — fonte: tabela garantia_ativacoes
  // (carga em garantiaAtivacoesCargaModule.js, planilha AltForce). Quatro
  // cruzamentos pedidos pelo usuario: heatmap cidade x estado/revenda, preco
  // medio por modelo x estado, ranking de vendedores de revenda (top 10) e
  // estoque estimado de revenda (vendas Marcher via comercial_faturado menos
  // ativacoes de garantia, por revenda x modelo).
  function createReportsGarantiaAtivacoesModule(deps) {
    const { escapeHtml, resolveOrganizationId, fetchAllSupabaseRows, isSupabaseConfigured } = deps;

    const REPORT_ID = "garantiaAtivacoes";
    const HEAT_STOPS = ["#131a28", "#183480", "#1d4ed8"];
    const TOP_VENDEDORES_N = 10;

    const BR = window.VECTON_BR_GEO || { bbox: [-74, -34, -32, 6], states: [] };
    const [minx, miny, maxx, maxy] = BR.bbox;
    const midlat = (miny + maxy) / 2, kx = Math.cos(midlat * Math.PI / 180);
    const gW = (maxx - minx) * kx, gH = (maxy - miny);
    const VW = 640, VH = Math.round(VW * gH / gW);
    const proj = (lo, la) => [(lo - minx) * kx / gW * VW, (maxy - la) / gH * VH];

    function statePath(rings) {
      return rings.map((r) => "M" + r.map(([lo, la]) => { const [x, y] = proj(lo, la); return x.toFixed(1) + "," + y.toFixed(1); }).join("L") + "Z").join(" ");
    }
    function lerp(a, b, t) {
      const ah = a.match(/\w\w/g).map((h) => parseInt(h, 16));
      const bh = b.match(/\w\w/g).map((h) => parseInt(h, 16));
      return "#" + ah.map((v, i) => Math.round(v + (bh[i] - v) * t).toString(16).padStart(2, "0")).join("");
    }
    function heat(v, min, max) {
      if (v == null || max <= min) return "#141922";
      const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
      const s = t * (HEAT_STOPS.length - 1), i = Math.min(HEAT_STOPS.length - 2, Math.floor(s));
      return lerp(HEAT_STOPS[i], HEAT_STOPS[i + 1], s - i);
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
    let vendasPorClienteModelo = new Map(); // "clienteId|nomeReduzido" -> quantidade
    let cidadeGroupBy = "uf"; // uf | revenda
    let hostContainer = null;

    // -------------------------------------------------------------- dados

    async function loadData() {
      if (loading) return;
      loading = true;
      lastError = null;
      try {
        if (!isSupabaseConfigured()) { ativacoes = []; dataLoaded = true; return; }
        const org = await resolveOrganizationId();

        const [ativacoesRows, produtos, clientes] = await Promise.all([
          fetchAllSupabaseRows(
            "garantia_ativacoes",
            `organization_id=eq.${org}&select=id,numero,status,produto_raw,modelo_normalizado,produto_id,revenda_raw,cliente_id,cliente_final,vendedor_revenda,uf,cidade,nf_valor_unitario,nf_valor_total,cadastrado_em`
          ),
          fetchAllSupabaseRows("comercial_produtos", `organization_id=eq.${org}&select=id,nome_reduzido`),
          fetchAllSupabaseRows("comercial_clientes", `organization_id=eq.${org}&select=id,descricao,uf`)
        ]);

        ativacoes = ativacoesRows || [];
        produtosById = new Map((produtos || []).map((p) => [p.id, p.nome_reduzido || ""]));
        clientesById = new Map((clientes || []).map((c) => [c.id, c.descricao || ""]));

        const clienteIds = [...new Set(ativacoes.map((r) => r.cliente_id).filter(Boolean))];
        vendasPorClienteModelo = new Map();
        if (clienteIds.length) {
          const ledgerRows = await fetchAllSupabaseRows(
            "comercial_faturado",
            `organization_id=eq.${org}&cliente_id=in.(${clienteIds.join(",")})&select=id,cliente_id,produto_id,quantidade`
          );
          (ledgerRows || []).forEach((row) => {
            const nomeReduzido = produtosById.get(row.produto_id);
            if (!nomeReduzido) return;
            const key = `${row.cliente_id}|${nomeReduzido.toUpperCase()}`;
            vendasPorClienteModelo.set(key, (vendasPorClienteModelo.get(key) || 0) + Number(row.quantidade || 0));
          });
        }
        dataLoaded = true;
      } catch (error) {
        console.error(error);
        lastError = window.vpFriendlyError ? window.vpFriendlyError(error, "Falha ao carregar ativações de garantia.") : String(error?.message || error);
      } finally {
        loading = false;
      }
    }

    // -------------------------------------------------------------- shell

    function renderSelectedGarantiaAtivacoes(container, reportId) {
      if (reportId !== REPORT_ID) return false;
      hostContainer = container;
      container.innerHTML = `<div id="gar-root" class="gar-root"></div>`;
      const root = container.querySelector("#gar-root");
      render(root);
      if (!dataLoaded && !loading) {
        void loadData().then(() => render(root));
      }
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
              <div class="gar-toggle" id="gar-heatmap-toggle">
                <button type="button" data-group="uf" class="${cidadeGroupBy === "uf" ? "active" : ""}">Por estado</button>
                <button type="button" data-group="revenda" class="${cidadeGroupBy === "revenda" ? "active" : ""}">Por revenda</button>
              </div>
            </div>
            <div class="gar-heatmap-body">
              ${renderUfMap()}
              ${renderCidadeHeatTable()}
            </div>
          </div>

          <div class="content-card gar-card">
            <p class="section-kicker">Ranking</p>
            <h4 class="inline-card-title">Top ${TOP_VENDEDORES_N} vendedores de revenda</h4>
            ${renderRankingVendedores()}
          </div>

          <div class="content-card gar-card gar-card-wide">
            <p class="section-kicker">Preço</p>
            <h4 class="inline-card-title">Preço médio por modelo × estado</h4>
            ${renderPrecoPorModeloEstado()}
          </div>

          <div class="content-card gar-card gar-card-wide">
            <p class="section-kicker">Cruzamento com vendas</p>
            <h4 class="inline-card-title">Estoque estimado por revenda</h4>
            <p class="gar-hint">Estoque estimado = unidades vendidas pela Marcher à revenda (faturado) − unidades com garantia já ativada por ela, por modelo.</p>
            ${renderEstoqueEstimado()}
          </div>
        </div>
      `;

      root.querySelector("#gar-heatmap-toggle")?.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-group]");
        if (!btn) return;
        cidadeGroupBy = btn.dataset.group;
        render(root);
      });
    }

    // -------------------------------------------------------------- seção A: heatmap

    function renderUfMap() {
      const counts = new Map();
      ativacoes.forEach((r) => { if (r.uf) counts.set(r.uf, (counts.get(r.uf) || 0) + 1); });
      const values = [...counts.values()];
      const max = values.length ? Math.max(...values) : 0;

      const paths = (BR.states || []).map((st) => {
        if (!st.rings || !st.rings.length) return "";
        const count = counts.get(st.uf) || 0;
        const fill = heat(count, 0, max);
        return `<path d="${statePath(st.rings)}" fill="${fill}" stroke="#0b0f16" stroke-width="0.6"><title>${escapeHtml(st.nome)}: ${count} ativação(ões)</title></path>`;
      }).join("");

      return `
        <div class="gar-ufmap-wrap">
          <svg viewBox="0 0 ${VW} ${VH}" class="gar-ufmap">${paths}</svg>
        </div>
      `;
    }

    function renderCidadeHeatTable() {
      const secondKey = (r) => cidadeGroupBy === "uf" ? (r.uf || "—") : (r.revenda_raw || "—");
      const map = new Map(); // cidade -> Map(secondKey -> count)
      ativacoes.forEach((r) => {
        const cidade = r.cidade || "—";
        const key = secondKey(r);
        if (!map.has(cidade)) map.set(cidade, new Map());
        const inner = map.get(cidade);
        inner.set(key, (inner.get(key) || 0) + 1);
      });

      const cidades = [...map.entries()]
        .map(([cidade, inner]) => ({ cidade, total: [...inner.values()].reduce((a, b) => a + b, 0), inner }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 30);

      const cols = [...new Set(cidades.flatMap((c) => [...c.inner.keys()]))].sort();
      const max = Math.max(1, ...cidades.flatMap((c) => [...c.inner.values()]));

      const header = `<th>Cidade</th>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}<th>Total</th>`;
      const body = cidades.map((c) => `
        <tr>
          <td>${escapeHtml(c.cidade)}</td>
          ${cols.map((col) => {
            const v = c.inner.get(col) || 0;
            const bg = v ? heat(v, 0, max) : "transparent";
            const fg = v ? "#fff" : "var(--text-faint)";
            return `<td style="background:${bg};color:${fg};text-align:center">${v || "—"}</td>`;
          }).join("")}
          <td style="text-align:center"><strong>${c.total}</strong></td>
        </tr>
      `).join("");

      return `
        <div class="table-shell gar-heat-table-shell">
          <table class="data-table gar-heat-table">
            <thead><tr>${header}</tr></thead>
            <tbody>${body || `<tr><td colspan="${cols.length + 2}" class="users-empty">Sem dados de cidade.</td></tr>`}</tbody>
          </table>
        </div>
      `;
    }

    // -------------------------------------------------------------- seção B: preço x modelo x estado

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

    // -------------------------------------------------------------- seção C: ranking vendedores

    function renderRankingVendedores() {
      const map = new Map();
      ativacoes.forEach((r) => {
        const nome = (r.vendedor_revenda || "").trim();
        if (!nome) return;
        const cur = map.get(nome) || { count: 0, valor: 0 };
        cur.count += 1;
        cur.valor += Number(r.nf_valor_total || 0);
        map.set(nome, cur);
      });
      const ranking = [...map.entries()]
        .map(([nome, v]) => ({ nome, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_VENDEDORES_N);

      if (!ranking.length) return `<div class="actuals-empty">Nenhum vendedor de revenda identificado.</div>`;
      const max = ranking[0].count || 1;

      return `
        <div class="gar-ranking">
          ${ranking.map((v, i) => `
            <div class="gar-ranking-row">
              <span class="gar-ranking-pos">${i + 1}</span>
              <span class="gar-ranking-name" title="${escapeHtml(v.nome)}">${escapeHtml(v.nome)}</span>
              <div class="gar-ranking-bar-wrap">
                <div class="gar-ranking-bar" style="width:${Math.max(4, (v.count / max) * 100)}%"></div>
              </div>
              <span class="gar-ranking-count">${v.count}</span>
            </div>
          `).join("")}
        </div>
      `;
    }

    // -------------------------------------------------------------- seção D: estoque estimado

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
      const linhas = [...chaves].map((key) => {
        const [clienteId, modelo] = key.split("|");
        const vendido = vendasPorClienteModelo.get(key) || 0;
        const ativado = ativadoPorChave.get(key) || 0;
        return {
          revenda: clientesById.get(clienteId) || clienteId,
          modelo,
          vendido,
          ativado,
          estoque: vendido - ativado
        };
      }).sort((a, b) => a.revenda.localeCompare(b.revenda, "pt-BR") || a.modelo.localeCompare(b.modelo, "pt-BR"));

      const tabela = !linhas.length
        ? `<div class="actuals-empty">Sem revendas com cadastro casado a vendas Marcher.</div>`
        : `
          <div class="table-shell gar-heat-table-shell">
            <table class="data-table gar-heat-table">
              <thead><tr><th>Revenda</th><th>Modelo</th><th>Vendido (Marcher)</th><th>Ativado (garantia)</th><th>Estoque estimado</th></tr></thead>
              <tbody>
                ${linhas.map((l) => `
                  <tr>
                    <td>${escapeHtml(l.revenda)}</td>
                    <td>${escapeHtml(l.modelo)}</td>
                    <td style="text-align:center">${l.vendido}</td>
                    <td style="text-align:center">${l.ativado}</td>
                    <td style="text-align:center;${l.estoque < 0 ? "color:var(--red,#ef4444);font-weight:600" : ""}">${l.estoque}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
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
