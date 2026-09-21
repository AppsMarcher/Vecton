(function (window) {
  "use strict";
  const norm = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const scenario = value => ({ act: "Real", real: "Real", realizado: "Real", fcst: "Fcst", forecast: "Fcst", bud: "Bud", budget: "Bud", orcado: "Bud" })[norm(value)];
  function competence(value) {
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return { year: value.getFullYear(), month: value.getMonth() + 1 };
    if (typeof value === "number" && value > 36525 && value < 73416) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
    }
    const text = norm(value), match = text.match(/^(\d{1,2}|[a-z]{3,})[\s/.-]+(\d{2}|\d{4})$/);
    if (!match) return null;
    const month = /^\d+$/.test(match[1]) ? Number(match[1]) : months.indexOf(match[1].slice(0, 3)) + 1;
    const year = Number(match[2]) + (match[2].length === 2 ? 2000 : 0);
    return month >= 1 && month <= 12 && year >= 2000 && year <= 2100 ? { year, month } : null;
  }
  function findHeader(matrix, year) {
    for (let r = 0; r < Math.min(10, matrix.length); r++) {
      const row = matrix[r] || [];
      const declaredYears = row.flatMap(v => {
        const match = norm(v).match(/^(?:fluxo de caixa\s+)?(20\d{2}|2100)$/);
        return match ? [Number(match[1])] : [];
      });
      const namedYear = declaredYears.length && declaredYears.every(y => y === year);
      const found = row.map((v, col) => {
        let period = competence(v);
        if (!period && namedYear) {
          const name = norm(v);
          const full = ["janeiro","fevereiro","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
          const index = full.indexOf(name) >= 0 ? full.indexOf(name) : months.indexOf(name);
          if (index >= 0) period = { year, month: index + 1 };
        }
        return { ...period, col };
      }).filter(v => v.year === year);
      if (found.length) {
        if (found.length !== 12 || new Set(found.map(v => v.month)).size !== 12) throw new Error(`A carga exige os 12 meses de ${year}, sem competências duplicadas.`);
        return { columns: found.sort((a,b) => a.month-b.month), headerRow: r };
      }
    }
    return null;
  }
  function number(value, label) {
    if (value == null || value === "") return 0;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = String(value).trim().replace(/^R\$\s*/, "");
    const result = Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
    if (!Number.isFinite(result)) throw new Error(`Valor inválido em ${label}. Verifique as fórmulas e salve o Excel novamente.`);
    return result;
  }
  function calculate(input, structure = window.VECTON_FC_STRUCTURE) {
    const values = {}, visiting = new Set();
    function compute(key) {
      if (values[key]) return values[key];
      if (visiting.has(key)) throw new Error("Ciclo na estrutura do FC.");
      visiting.add(key);
      const node = structure.find(n => n.seed_key === key);
      if (!node) throw new Error(`Conta não encontrada: ${key}`);
      const result = node.node_class === "Analitica"
        ? Array.from({ length: 12 }, (_, i) => number(input.movements?.[key]?.[i], node.name))
        : structure.filter(n => n.parent_key === key).reduce((totals, n) => compute(n.seed_key).map((v, i) => totals[i] + v), Array(12).fill(0));
      visiting.delete(key); values[key] = result; return result;
    }
    structure.forEach(n => compute(n.seed_key));
    values.net = values.operacional.map((v, i) => v + values.investimentos[i] + values.financeiro[i]);
    let balance = number(input.opening, "saldo inicial");
    values.balance = values.net.map(v => (balance += v));
    return { ...input, opening: number(input.opening, "saldo inicial"), values, structure };
  }
  function parseMatrix(matrix, year, now = new Date(), structure = window.VECTON_FC_STRUCTURE) {
    const header = findHeader(matrix, year);
    if (!header) return null;
    const { columns, headerRow } = header;
    const kinds = columns.map(({ col, month }) => {
      const kind = scenario(matrix[headerRow + 1]?.[col]);
      if (!kind) throw new Error(`Classificação inválida em ${month}/${year}. Use Real/ACT, Fcst/FCST ou Bud/BUD.`);
      if (kind === "Real" && (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1))) throw new Error(`${month}/${year} está no futuro e não pode ser Real.`);
      return kind;
    });
    const rows = new Map();
    matrix.forEach((row, i) => { const key = norm(row[0]); if (key) { if (!rows.has(key)) rows.set(key, []); rows.get(key).push(i); } });
    for (const label of ["Entradas Operacionais", "Saídas Operacionais", "Fluxo de Caixa Operacional", "Fluxo de Caixa de Investimentos", "Fluxo de Caixa Financeiro", "SALDOS BANCÁRIOS"]) {
      if (!rows.has(norm(label))) throw new Error(`Estrutura do FC não reconhecida: falta “${label}”.`);
    }
    const first = rows.get(norm("Entradas Operacionais"))[0], last = rows.get(norm("Fluxo de Caixa Financeiro"))[0];
    const opEnd = rows.get(norm("Fluxo de Caixa Operacional"))[0], investEnd = rows.get(norm("Fluxo de Caixa de Investimentos"))[0];
    const outputStart = rows.get(norm("Saídas Operacionais"))[0];
    const bounds = { entradas: [first, outputStart], saidas: [outputStart, opEnd], operacional: [first, opEnd], investimentos: [opEnd, investEnd], financeiro: [investEnd, last] };
    const aliases = n => [n.name, window.VECTON_FC_STRUCTURE.find(t => t.seed_key === n.seed_key)?.name].filter(Boolean).map(norm);
    const marker = n => aliases(n).flatMap(name => rows.get(name) || []).sort((a,b) => a-b)[0];
    function scope(node) {
      if (bounds[node.seed_key]) return bounds[node.seed_key];
      const parent = structure.find(n => n.seed_key === node.parent_key);
      if (!parent) return [first, last];
      const base = scope(parent);
      if (node.node_class !== "Sintetica") return base;
      const start = marker(node);
      if (start == null || start < base[0] || start >= base[1]) return base;
      const next = structure.filter(n => n.node_class === "Sintetica" && n.parent_key === node.parent_key && n.seed_key !== node.seed_key)
        .map(marker).filter(r => r > start && r < base[1]);
      return [start, Math.min(base[1], ...next)];
    }
    const movements = {}, matchedRows = new Set();
    for (const node of structure.filter(n => n.node_class === "Analitica")) {
      const [start, end] = scope(node);
      let matches = (rows.get(norm(node.source_name)) || []).filter(r => r > start && r < end);
      const syntheticMarkers = structure.filter(n => n.node_class === "Sintetica" && aliases(n).includes(norm(node.source_name))).map(marker);
      matches = matches.filter(r => !syntheticMarkers.includes(r));
      if (matches.length > 1) throw new Error(`Conta repetida no grupo de ${node.source_name}.`);
      if (matches.length && matchedRows.has(matches[0])) throw new Error(`Vínculo ambíguo para ${node.source_name}. Confira a conta pai no cadastro.`);
      if (matches.length) matchedRows.add(matches[0]);
      movements[node.seed_key] = columns.map(({ col }) => number(matrix[matches[0]]?.[col], node.source_name));
      if (node.active === false && movements[node.seed_key].some(v => v !== 0)) throw new Error(`Conta inativa com valores: ${node.source_name}.`);
    }
    const syntheticNames = new Set(structure.filter(n => n.node_class === "Sintetica").flatMap(aliases));
    for (let r = first; r <= last; r++) {
      const label = norm(matrix[r]?.[0]);
      if (label && !syntheticNames.has(label) && !matchedRows.has(r)) throw new Error(`Conta não reconhecida no grupo: ${matrix[r][0]}. Confira o Plano de Contas FC.`);
    }
    const net = calculate({ movements, opening: 0 }, structure).values.net;
    const closingRow = rows.get(norm("SALDOS BANCÁRIOS"))[0];
    const closing = number(matrix[closingRow]?.[columns[0].col], "saldo de janeiro");
    const initialRow = rows.get(norm("Saldo inicial"))?.[0];
    const opening = initialRow == null ? closing - net[0] : number(matrix[initialRow]?.[columns[0].col], "saldo inicial");
    const quantityRow = rows.get(norm("Maquinas Vendidas"))?.[0];
    return calculate({ year, kinds, movements, opening, openingMode: initialRow == null ? "closing_january" : "explicit", openingValue: initialRow == null ? closing : opening, quantities: columns.map(({ col }) => number(matrix[quantityRow]?.[col], "máquinas vendidas")) }, structure);
  }
  function select(report, periodType, month) {
    const start = periodType === "month" ? month - 1 : 0, end = periodType === "year" ? 12 : month;
    const sum = key => (report.values[key] || Array(12).fill(0)).slice(start, end).reduce((a, b) => a + b, 0);
    return { start, end, sum, opening: start ? report.values.balance[start - 1] : report.opening, closing: report.values.balance[end - 1], minimum: Math.min(...report.values.balance.slice(start, end)) };
  }
  window.VECTON_FC_MODEL = { competence, findHeader, parseMatrix, calculate, select };
})(window);
