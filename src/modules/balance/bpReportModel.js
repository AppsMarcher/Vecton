(function (window) {
  "use strict";
  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const line = (id, label, keys = [label]) => ({ id, label, keys });
  const SECTIONS = [
    { id: "assetCurrent", side: "asset", title: "CIRCULANTE", total: "Total do Circulante", lines: [
      line("cash", "Caixa e equivalente de Caixa"), line("receivables", "Contas a Receber - Clientes"),
      line("pcld", "( - ) PCLD", ["( - ) PCLD", "(-) PCLD", "PCLD"]), line("inventory", "Estoques"),
      line("credits", "Outros Créditos"), line("taxCurrent", "Impostos a Recuperar"), line("prepaid", "Despesas a apropriar")
    ] },
    { id: "assetNoncurrent", side: "asset", title: "NÃO CIRCULANTE", total: "Total do Não Circulante", lines: [
      line("judicial", "Depósitos Judiciais"), line("taxNoncurrent", "Impostos a Recuperar"),
      line("fixedAssets", "Imobilizado"), line("intangibles", "Intangível"), line("investmentProperty", "Propriedades p/ Investimento")
    ] },
    { id: "liabilityCurrent", side: "liability", title: "CIRCULANTE", total: "Total do Circulante", lines: [
      line("suppliers", "Contas a Pagar - Fornecedores"), line("loansCurrent", "Empréstimos"), line("taxPayable", "Impostos e Contribuições"),
      line("labor", "Obrigações Trabalhistas", ["Obrigações Trabalhistas", "Obrigaçãoes Trabalhistas"]),
      line("commissions", "Provisões para Comissões"), line("thirdPartyInventory", "Estoques de Terceiros"),
      line("otherPayable", "Outros Contas a Pagar"), line("jscp", "Provisões para JSCP"),
      line("royalties", "Provisões para Royaties", ["Provisões para Royaties", "Provisões para Royalties"])
    ] },
    { id: "liabilityNoncurrent", side: "liability", title: "NÃO CIRCULANTE", total: "Total do Não Circulante", lines: [
      line("loansNoncurrent", "Empréstimos", ["Empréstimos NC", "Empréstimos"]), line("dividends", "Dividendos a Pagar"),
      line("contingencies", "Provisão para Contingências", ["Provisão para Contingências", "Provisões para Contingências"]), line("shareholders", "Empréstimos de Acionistas")
    ] },
    { id: "equity", side: "liability", title: "PATRIMÔNIO LÍQUIDO", total: "Total do Patrimônio Líquido", lines: [
      line("capital", "Capital Subscrito e Realizado"), line("legalReserve", "Reserva Legal"),
      line("profitReserve", "Reserva de Lucros", ["Reserva de Lucros", "Reservas de Lucros", "Resultado do Exercício"]),
      line("retained", "Resultados Acumulados"), line("adjustments", "Ajustes Exercícios Anteriores")
    ] }
  ];
  function period(year, month) {
    year = Number(year); month = Number(month);
    if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error("Competência BP inválida.");
    const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { year, month, date: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}` };
  }
  function periods(selected) {
    const current = period(selected.year, selected.month);
    return { current, previous: period(current.year - 1, 12) };
  }
  function sectionFor(node) {
    const code = String(node.account_code || node.source_name || "");
    const key = normalize(node.group_key);
    if (key === normalize("Empréstimos de Acionistas") || key === normalize("Empréstimos NC")) return "liabilityNoncurrent";
    if (/^1\.1(?:\.|$)/.test(code)) return "assetCurrent";
    if (/^1\.2(?:\.|$)/.test(code)) return "assetNoncurrent";
    if (/^2\.1(?:\.|$)/.test(code)) return "liabilityCurrent";
    if (/^2\.2(?:\.|$)/.test(code)) return "liabilityNoncurrent";
    if (/^2\.3(?:\.|$)/.test(code)) return "equity";
    throw new Error(`A conta ${code || node.name} não pertence a um grupo BP reconhecido.`);
  }
  function aggregate(batches, plan) {
    const values = new Map(), extras = new Map(), scopes = new Set();
    const currentIds = new Map(plan.map(n => [n.id, n])), currentCodes = new Map(plan.map(n => [n.account_code || n.source_name, n]));
    for (const batch of batches) {
      const scope = batch.branch_id || "consolidated";
      if (scopes.has(scope) || (scope === "consolidated" && scopes.size) || scopes.has("consolidated")) throw new Error("Há fechamentos BP sobrepostos para a mesma competência. Revise as cargas antes de consolidar.");
      scopes.add(scope);
      const snapshot = batch.plan_snapshot || [], ids = new Map(snapshot.map(n => [n.id,n]));
      const seen = new Set();
      for (const row of batch.rows || []) {
        const node = currentIds.get(row.account_id) || currentCodes.get(row.account_code) || ids.get(row.account_id);
        if (!node) throw new Error(`Conta BP sem cadastro: ${row.account_code || row.account_id}.`);
        if (node.node_class !== "Analitica") continue;
        if (seen.has(node.id)) throw new Error(`Conta duplicada no fechamento BP: ${node.account_code}.`);
        seen.add(node.id);
        if (!node.group_key?.trim()) throw new Error(`Conta analítica sem chave agrupadora: ${node.account_code}.`);
        const sectionId = sectionFor(node), section = SECTIONS.find(s => s.id === sectionId), key = normalize(node.group_key);
        let target = section.lines.find(l => l.keys.some(k => normalize(k) === key));
        if (key === normalize("Impostos a Recuperar")) target = section.lines.find(l => l.id === (sectionId === "assetNoncurrent" ? "taxNoncurrent" : "taxCurrent"));
        if (!target) {
          const id = `extra:${sectionId}:${key}`;
          target = { id, label: node.group_key, keys: [node.group_key] };
          extras.set(id, { ...target, sectionId });
        }
        // Exceção definida pelo usuário: esta linha vem do DRE, nunca do saldo BP.
        if (target.id === "profitReserve") continue;
        if (row.amount === null || row.amount === undefined || typeof row.amount === "boolean" || String(row.amount).trim() === "") throw new Error(`Saldo ausente na conta ${node.account_code}.`);
        const amount = Number(row.amount), cents = Math.round(amount * 100);
        if (!Number.isFinite(amount) || !Number.isSafeInteger(cents)) throw new Error(`Saldo inválido na conta ${node.account_code}.`);
        const total = (values.get(target.id) || 0) + cents;
        if (!Number.isSafeInteger(total)) throw new Error("O saldo consolidado excede o limite de precisão.");
        values.set(target.id, total);
      }
    }
    return { available: batches.length > 0, values, extras };
  }
  const calendarYear = () => Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date()));
  function build(plan, currentBatches, previousBatches, selected, dreResult = {}, ongoingYear = calendarYear()) {
    const dates = periods(selected), current = aggregate(currentBatches,plan), previous = aggregate(previousBatches,plan);
    const extraLines = new Map([...previous.extras, ...current.extras]);
    const sections = SECTIONS.map(section => {
      const configuredExtras = plan.filter(n => n.node_class === "Analitica" && n.group_key).filter(n => sectionFor(n) === section.id);
      for (const node of configuredExtras) {
        const key = normalize(node.group_key);
        if (!section.lines.some(l => l.keys.some(k => normalize(k) === key))) {
          const id = `extra:${section.id}:${key}`;
          if (!extraLines.has(id)) extraLines.set(id, { id, label: node.group_key, sectionId: section.id });
        }
      }
      const extras = [...extraLines.values()].filter(l => l.sectionId === section.id);
      const result = value => { if (value === null || value === undefined) return 0; const cents = Math.round(Number(value) * 100); if (!Number.isSafeInteger(cents)) throw new Error("Resultado do DRE inválido."); return cents; };
      const lines = [...section.lines, ...extras].map(l => ({ ...l, current: current.available ? l.id === "profitReserve" ? (dates.current.year === ongoingYear ? result(dreResult.current) : 0) : (current.values.get(l.id) || 0) : null, previous: previous.available ? l.id === "profitReserve" ? 0 : (previous.values.get(l.id) || 0) : null }));
      const sum = column => lines.some(l => l[column] === null) ? null : lines.reduce((total,l) => total + l[column],0);
      return { ...section, lines, current: current.available ? sum("current") : null, previous: previous.available ? sum("previous") : null };
    });
    const sideTotal = (side,column,available) => { const groups = sections.filter(s => s.side === side); return !available || groups.some(s => s[column] === null) ? null : groups.reduce((a,s) => a+s[column],0); };
    const total = side => ({ current: sideTotal(side,"current",current.available), previous: sideTotal(side,"previous",previous.available) });
    return { ...dates, sections, asset: total("asset"), liability: total("liability"), hasCurrent: current.available, hasPrevious: previous.available };
  }
  window.VECTON_BP_REPORT_MODEL = { SECTIONS, normalize, periods, aggregate, build, calendarYear };
})(window);
