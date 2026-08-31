(function attachVectonComercialPainelData(window) {
  // Modelo de dados do Painel de Vendas, independente de renderização.
  // Extraído de reportsComercialPainelModule.js (desktop) pra ser
  // reaproveitado sem alteração pela versão mobile — nenhuma das duas
  // telas pode ter sua própria soma/regra de consolidação; as duas têm
  // que nascer exatamente das mesmas funções, senão os totais divergem
  // entre desktop e mobile com o tempo. Puro: sem DOM, sem RPC, sem
  // estado de UI — só transforma o retorno da RPC comercial_painel_vendas
  // no formato que os dois renderizadores (desktop e mobile) consomem.

  const COORD_STYLE = {
    "Sul":        { accent: "#4f7cff", soft: "rgba(79,124,255,0.16)" },
    "Norte":      { accent: "#14b8a6", soft: "rgba(20,184,166,0.16)" },
    "Oeste":      { accent: "#8b5cf6", soft: "rgba(139,92,246,0.16)" },
    "Pecuária":   { accent: "#f59e0b", soft: "rgba(245,158,11,0.16)" },
    "Exportação": { accent: "#22c55e", soft: "rgba(34,197,94,0.16)" },
    "Peças":      { accent: "#ef4444", soft: "rgba(239,68,68,0.16)" }
  };
  const COORD_ORDER = ["Sul", "Norte", "Oeste", "Pecuária", "Exportação", "Peças"];
  const METRICS = ["fat", "cart", "meta", "y1", "y2", "y3"];

  function metricObj(r) {
    return {
      fat:  { q: Number(r.fat_qtd) || 0,  v: Number(r.fat_val) || 0 },
      cart: { q: Number(r.cart_qtd) || 0, v: Number(r.cart_val) || 0 },
      meta: { q: Number(r.meta_qtd) || 0, v: Number(r.meta_val) || 0 },
      y1:   { q: Number(r.y1_qtd) || 0,   v: Number(r.y1_val) || 0 },
      y2:   { q: Number(r.y2_qtd) || 0,   v: Number(r.y2_val) || 0 },
      y3:   { q: Number(r.y3_qtd) || 0,   v: Number(r.y3_val) || 0 },
      resp: r.responsavel || "",
      coord: r.coordenacao || "",  // coord de ROTEAMENTO (quem soma de fato a linha)
      gestor: r.gestor || "",
      orfao: !!r.orfao            // responsavel == gestor da coord de roteamento -> nao vira card
    };
  }

  // Monta 2 agrupamentos: por coordenacao de ROTEAMENTO (totais/rollup) e por
  // CASA geografica (regiao = coord do Grao), pro detalhe matricial.
  function transform(rows) {
    const byCoord = {};
    const byReg = {};
    const put = (bucket, key, gestor, r) => {
      if (!key) return;
      if (!bucket[key]) bucket[key] = { nome: key, gestor: gestor || "", terrs: {} };
      const tKey = r.territorio || "Nacional";
      if (!bucket[key].terrs[tKey]) bucket[key].terrs[tKey] = { grao: null, pecuaria: null, pecas: null };
      const lk = r.linha === "Grão" ? "grao" : r.linha === "Pecuária" ? "pecuaria" : "pecas";
      bucket[key].terrs[tKey][lk] = metricObj(r);
    };
    rows.forEach((r) => {
      put(byCoord, r.coordenacao, r.gestor, r);       // roteamento
      put(byReg, r.regiao, null, r);                  // casa geografica
    });
    const order = (b) => COORD_ORDER.filter((n) => b[n]).map((n) => b[n])
      .concat(Object.values(b).filter((c) => !COORD_ORDER.includes(c.nome)));
    return { coords: order(byCoord), regioes: order(byReg) };
  }

  function round(v) { return Math.round(v || 0); }
  function nf(v) { return round(v).toLocaleString("pt-BR"); }
  function fmtR$(v) { return "R$ " + nf((v || 0) / 1000) + " mil"; }
  function fmtFullR$(v) { return "R$ " + nf(v || 0); }

  // Total de uma coordenacao (qtd Grao/Pecuaria + valor). Cards mostram o
  // FATURADO (real); a comparacao das 3 metricas fica no hero e no detalhe.
  function coordTotals(c) {
    let grao = 0, pec = 0, val = 0, hasGrao = false, hasPec = false;
    Object.values(c.terrs).forEach((t) => {
      if (t.grao) { grao += t.grao.fat.q; val += t.grao.fat.v; hasGrao = true; }
      if (t.pecuaria) { pec += t.pecuaria.fat.q; val += t.pecuaria.fat.v; hasPec = true; }
      if (t.pecas) { val += t.pecas.fat.v; }
    });
    // hasGrao/hasPec = a coordenacao consolida aquela linha (mesmo criterio do
    // sumLine do detalhe). Sul/Norte nao consolidam Pecuaria (roteia pro Paulo),
    // entao o card omite o rotulo em vez de mostrar um zero que nao significa nada.
    return { grao, pec, val, hasGrao, hasPec, isPecas: c.nome === "Peças" };
  }

  // Soma uma linha (grao/pecuaria/pecas) por metrica ao longo dos territorios
  // de uma coordenacao/regiao. null quando a linha nao existe em nenhum terr.
  function sumTerrLine(c, lk) {
    if (!c) return null;
    const acc = {}; METRICS.forEach((m) => { acc[m] = { q: 0, v: 0 }; });
    let has = false;
    Object.values(c.terrs).forEach((t) => {
      const l = t[lk]; if (!l) return;
      has = true;
      METRICS.forEach((m) => { acc[m].q += l[m].q; acc[m].v += l[m].v; });
    });
    return has ? acc : null;
  }

  // Quem de fato consolida a Pecuaria da casa (rotulo do rodape do memo).
  // Le a coord de ROTEAMENTO gravada em cada linha — sem hardcode de Paulo.
  function memoOwner(terrs) {
    const seen = [];
    Object.values(terrs).forEach((t) => {
      const p = t.pecuaria;
      if (!p || !p.coord) return;
      const label = p.gestor ? `${p.coord} (${p.gestor})` : p.coord;
      if (!seen.includes(label)) seen.push(label);
    });
    return seen.join(" / ") || "outra coordenação";
  }

  // Consolidado da empresa: qtd Grao/Pecuaria + Faturado total (inclui Pecas
  // via coords e Transgrain/Acessorios via tipos — Pecas nao dobra). Usado
  // pelo hero (Matriz Brasil) tanto no desktop quanto no mobile.
  function companyTotals(coordsArr, tiposArr) {
    const blank = () => ({ fat: 0, cart: 0, meta: 0, y1: 0, y2: 0, y3: 0 });
    const grao = blank(), pec = blank(), fatv = blank();
    // graoVal/pecVal = faturamento so de maquinas (Grao/Pecuaria), separado do
    // fatv combinado (que tambem inclui pecas/transgrain/acessorios) — usado
    // pelo hero para as linhas "Faturamento Grão"/"Faturamento Pecuária".
    const graoVal = blank(), pecVal = blank();
    coordsArr.forEach((c) => Object.values(c.terrs).forEach((t) => {
      ["grao", "pecuaria", "pecas"].forEach((lk) => {
        const line = t[lk]; if (!line) return;
        METRICS.forEach((m) => { fatv[m] += line[m].v; });
        if (lk === "grao") METRICS.forEach((m) => { grao[m] += line[m].q; graoVal[m] += line[m].v; });
        if (lk === "pecuaria") METRICS.forEach((m) => { pec[m] += line[m].q; pecVal[m] += line[m].v; });
      });
    }));
    tiposArr.forEach((r) => {
      if (r.tipo !== "Transgrain" && r.tipo !== "Acessórios") return;
      METRICS.forEach((m) => { fatv[m] += Number(r[`${m}_val`]) || 0; });
    });
    return { grao, pec, fatv, graoVal, pecVal };
  }

  // Coordenações "geográficas" — o detalhe por território delas vem da CASA
  // geográfica (regioes), não do roteamento, pra trazer a Pecuária da casa
  // mesmo quando ela consolida em outra coordenação (Sul/Norte -> Pecuária).
  const GEO_COORDS = ["Sul", "Norte", "Oeste", "Exportação"];

  // Modelo do detalhe de 1 coordenação: consolidado (rollup de roteamento,
  // igual ao card do topo) + lista de territórios. Espelha renderDetail do
  // desktop, com 1 simplificação deliberada: não funde territórios com o
  // MESMO responsável em coordenações diferentes na mesma linha (ex.: MA+PI
  // do Claudemir viram 2 linhas em vez de 1 "MA_PI") — isso é só agrupamento
  // visual, nenhuma soma/total muda; se fizer falta no mobile, portar
  // mergeSameRespCards (reportsComercialPainelModule.js) pra cá.
  function buildCoordDetail(coordName, coords, regioes) {
    const c = coords.find((x) => x.nome === coordName);
    if (!c) return null;
    const isPecas = c.nome === "Peças";
    const src = GEO_COORDS.includes(c.nome) ? (regioes.find((x) => x.nome === c.nome) || c) : c;
    const eff = (line) => (line && !line.orfao) ? line : null; // orfao nao vira card

    if (isPecas) {
      const pecasSum = sumTerrLine(c, "pecas");
      const territorios = [];
      Object.entries(src.terrs).forEach(([terr, t]) => {
        if (t.pecas) territorios.push({ terr, resp: t.pecas.resp || "", grao: null, pec: null, pecas: t.pecas, linhas: ["Peças"] });
      });
      return { coord: c, isPecas: true, consolidado: { grao: null, pec: null, pecas: pecasSum, memo: null }, territorios };
    }

    const graoSum = sumTerrLine(c, "grao");
    const pecSum = sumTerrLine(c, "pecuaria");
    // Coordenacao geografica que nao consolida Pecuaria (Sul/Norte -> roteia
    // pro Paulo): mostra a Pecuaria da CASA como linha memo, so ilustrativa.
    const memoLine = (!pecSum && src !== c) ? sumTerrLine(src, "pecuaria") : null;
    const memo = memoLine ? { line: memoLine, owner: memoOwner(src.terrs) } : null;

    const territorios = [];
    Object.entries(src.terrs).forEach(([terr, t]) => {
      const g = eff(t.grao), p = eff(t.pecuaria);
      if (!g && !p) return;
      const sameResp = g && p && g.resp === p.resp;
      if (sameResp || (g && !p) || (!g && p)) {
        const linhas = [g && "Grão", p && "Pecuária"].filter(Boolean);
        territorios.push({ terr, resp: (g || p).resp || "", grao: g, pec: p, pecas: null, linhas });
      } else {
        territorios.push({ terr, resp: g.resp || "", grao: g, pec: null, pecas: null, linhas: ["Grão"] });
        territorios.push({ terr, resp: p.resp || "", grao: null, pec: p, pecas: null, linhas: ["Pecuária"] });
      }
    });

    return { coord: c, isPecas: false, consolidado: { grao: graoSum, pec: pecSum, pecas: null, memo }, territorios };
  }

  // Delta do card de coordenação: Faturado vs Meta do período/cenário atual
  // -- (Fat-Meta)/Meta, positivo = bateu/passou a meta. Usado pelo card do
  // desktop (renderCards) e pelo card mobile (coordCardHtml); é DELTA (gap),
  // não a razão Fat.+Cart./Meta que a pílula "vs meta" das mini-matrizes usa
  // -- os dois indicadores coexistem no painel real, não são a mesma conta.
  function coordCardDelta(c) {
    let cur = 0, prev = 0;
    Object.values(c.terrs).forEach((tt) => ["grao", "pecuaria", "pecas"].forEach((lk) => { if (tt[lk]) { cur += tt[lk].fat.v; prev += tt[lk].meta.v; } }));
    return prev > 0 ? ((cur - prev) / prev) * 100 : 0;
  }

  window.VECTON_COMERCIAL_PAINEL_DATA = {
    COORD_STYLE, COORD_ORDER, METRICS, GEO_COORDS,
    metricObj, transform, coordTotals, sumTerrLine, memoOwner, companyTotals, buildCoordDetail, coordCardDelta,
    round, nf, fmtR$, fmtFullR$
  };
})(window);
