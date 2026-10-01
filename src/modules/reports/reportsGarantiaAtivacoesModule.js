(function attachVectonReportsGarantiaAtivacoes(window) {
  // Relatorio "Ativacoes de Garantia" — fonte: tabela garantia_ativacoes
  // (carga em garantiaAtivacoesCargaModule.js, planilha AltForce). Tres
  // cruzamentos pedidos pelo usuario: mapa de calor por UF (clique no estado
  // abre popover com cidades x maquinas), preco medio por modelo x estado e
  // estoque estimado de revenda (vendas Marcher via comercial_faturado menos
  // ativacoes de garantia, por revenda x modelo).
  function createReportsGarantiaAtivacoesModule(deps) {
    const { escapeHtml, resolveOrganizationId, fetchAllSupabaseRows, isSupabaseConfigured } = deps;

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
    let vendasPorClienteModelo = new Map(); // "clienteId|nomeReduzido" -> quantidade
    let popoverCleanup = null;
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
            </div>
            <div class="gar-heatmap-body">
              ${renderUfMap()}
            </div>
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

      bindUfPopover(root);
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
        const fill = window.VECTON_MAP_APPEARANCE.heat(count, max);
        return `<path class="gar-map-state" data-uf="${escapeHtml(st.uf)}" data-nome="${escapeHtml(st.nome)}" d="${statePath(st.rings)}" fill="${fill}" stroke="var(--theme-border, rgba(255,255,255,0.55))" stroke-width="0.9" stroke-linejoin="round"><title>${escapeHtml(st.nome)}: ${count} máquina(s) — clique para ver as cidades</title></path>`;
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

      return `
        <div class="gar-ufmap-wrap">
          <svg viewBox="0 0 ${VW} ${VH}" class="gar-ufmap">${paths}</svg>
          ${legend}
        </div>
      `;
    }

    // Popover do mapa: clique no estado lista cidades e quantidade de maquinas.
    function bindUfPopover(root) {
      if (popoverCleanup) { popoverCleanup(); popoverCleanup = null; }
      const wrap = root.querySelector(".gar-ufmap-wrap");
      if (!wrap) return;
      let pop = null;
      const close = () => { pop?.remove(); pop = null; };

      const onDocPointer = (event) => {
        if (pop && !pop.contains(event.target) && !event.target.closest(".gar-map-state")) close();
      };
      const onKey = (event) => { if (event.key === "Escape") close(); };
      document.addEventListener("pointerdown", onDocPointer);
      document.addEventListener("keydown", onKey);
      popoverCleanup = () => {
        close();
        document.removeEventListener("pointerdown", onDocPointer);
        document.removeEventListener("keydown", onKey);
      };

      wrap.addEventListener("click", (event) => {
        const path = event.target.closest(".gar-map-state");
        if (!path) return;
        const uf = path.dataset.uf;
        const cidades = new Map();
        ativacoes.forEach((r) => {
          if (r.uf !== uf) return;
          const cidade = (r.cidade || "").trim() || "—";
          cidades.set(cidade, (cidades.get(cidade) || 0) + 1);
        });
        const lista = [...cidades.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
        const total = lista.reduce((acc, [, n]) => acc + n, 0);

        close();
        pop = document.createElement("div");
        pop.className = "gar-popover";
        pop.innerHTML = `
          <div class="gar-popover-head">
            <strong>${escapeHtml(path.dataset.nome)}</strong>
            <span>${total} máquina(s)</span>
            <button type="button" class="gar-popover-close" aria-label="Fechar">×</button>
          </div>
          ${lista.length ? `
            <div class="gar-popover-list">
              ${lista.map(([cidade, n]) => `<div class="gar-popover-row"><span>${escapeHtml(cidade)}</span><strong>${n}</strong></div>`).join("")}
            </div>` : `<div class="gar-popover-empty">Nenhuma máquina ativada neste estado.</div>`}
        `;
        pop.querySelector(".gar-popover-close").addEventListener("click", close);
        wrap.append(pop);

        const box = wrap.getBoundingClientRect();
        const left = Math.max(0, Math.min(event.clientX - box.left + 12, box.width - pop.offsetWidth));
        const top = Math.max(0, Math.min(event.clientY - box.top + 12, box.height - pop.offsetHeight));
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
      });
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
