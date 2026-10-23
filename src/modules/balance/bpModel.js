(function (window) {
  "use strict";
  const headers = ["CONTA", "NOME DA CONTA", "SALDO", "TIPO_CONTA", "CHAVE-AGRUPADORA"];
  const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  function amount(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      if (Math.abs(value) >= 1e13) throw new Error("Saldo fora do limite.");
      return Math.round(value * 100) / 100;
    }
    let text = String(value ?? "").trim();
    if (!text) throw new Error("Informe o saldo, inclusive quando for zero.");
    if (text.includes(",")) {
      if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})*),\d{1,2}$/.test(text)) throw new Error(`Saldo inválido: ${text}`);
      text = text.replaceAll(".", "").replace(",", ".");
    } else if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error(`Saldo inválido: ${text}`);
    const result = Number(text);
    if (!Number.isFinite(result) || Math.abs(result) >= 1e13) throw new Error("Saldo fora do limite.");
    return Math.round(result * 100) / 100;
  }
  function findHeader(matrix) {
    for (let index = 0; index < Math.min(30,matrix.length); index++) {
      const row = matrix[index].map(normalize), code = row.findIndex(h => ["CONTA","CONTABP","CODCONTA","CODIGOCONTA"].includes(h)), balance = row.indexOf("SALDO");
      if (code >= 0 && balance >= 0) return { index, code, balance, type: row.indexOf("TIPOCONTA"), key: row.indexOf("CHAVEAGRUPADORA") };
    }
    return null;
  }
  function parse(matrix, plan) {
    const header = findHeader(matrix);
    if (!header) throw new Error("Use o balancete ou modelo BP com as colunas CONTA e SALDO.");
    const accounts = new Map(plan.map(n => [n.account_code || n.source_name, n]));
    const active = plan.filter(n => n.active && n.node_class === "Analitica");
    const seen = new Set();
    const rows = [];
    matrix.slice(header.index + 1).forEach((row,index) => {
      if (!row.some(v => String(v ?? "").trim())) return;
      const code = String(row[header.code] ?? "").trim(), node = accounts.get(code), line = header.index + index + 2;
      if (!node) throw new Error(`Linha ${line}: conta ${code || "sem código"} inexistente no Plano BP.`);
      if (seen.has(node.id)) throw new Error(`Linha ${line}: conta duplicada (${code}).`);
      seen.add(node.id);
      const type = header.type >= 0 ? normalize(row[header.type]) : "";
      if (type && type !== normalize(node.node_class)) throw new Error(`Linha ${line}: o tipo da conta ${code} difere do Plano BP.`);
      const key = header.key >= 0 ? String(row[header.key] ?? "").trim() : "";
      if (node.node_class === "Sintetica") {
        if (key) throw new Error(`Linha ${line}: conta sintética não pode ter chave agrupadora.`);
        return; // O saldo da sintética já está contido nas analíticas.
      }
      if (!node.active) throw new Error(`Linha ${line}: conta ${code} inativa no Plano BP.`);
      if (!node.group_key && node.account_code) throw new Error(`Linha ${line}: conta ${code} sem chave agrupadora no Plano BP.`);
      if (key && normalize(key) !== normalize(node.group_key)) throw new Error(`Linha ${line}: a chave agrupadora da conta ${code} difere do Plano BP.`);
      rows.push({ account_id: node.id, amount: amount(row[header.balance]) });
    });
    if (!rows.length) throw new Error("O arquivo não contém saldos.");
    const missing = active.filter(n => !seen.has(n.id));
    if (missing.length) throw new Error(`A carga completa deve conter todas as contas analíticas ativas. Faltam ${missing.length} conta(s): ${missing.slice(0,5).map(n => n.account_code || n.source_name).join(", ")}. Informe zero quando não houver saldo.`);
    return rows;
  }
  function parseWorkbook(book,plan,XLSX) {
    const sheets = book.SheetNames.map(name => ({ name, matrix: XLSX.utils.sheet_to_json(book.Sheets[name], { header:1, raw:true, defval:null }) })).filter(s => findHeader(s.matrix));
    if (sheets.length !== 1) throw new Error(sheets.length ? "Há mais de uma aba com CONTA e SALDO. Mantenha somente o balancete da competência." : "Nenhuma aba contém as colunas CONTA e SALDO.");
    const {name,matrix} = sheets[0], header = findHeader(matrix);
    const accounts = new Map(plan.map(n => [n.account_code || n.source_name,n]));
    for (const [address,cell] of Object.entries(book.Sheets[name])) {
      if (address.startsWith("!")) continue;
      const location = XLSX.utils.decode_cell(address);
      if (location.c === header.balance && location.r > header.index && cell.f && cell.v == null
        && accounts.get(String(matrix[location.r]?.[header.code] ?? "").trim())?.node_class !== "Sintetica") throw new Error(`Recalcule e salve o Excel: ${name}!${address} não tem resultado salvo.`);
    }
    return parse(matrix,plan);
  }
  function totals(plan, rows) {
    const values = new Map(rows.map(r => [r.account_id, Math.round(Number(r.amount) * 100)]));
    const nodes = new Map(plan.map(n => [n.id, n]));
    for (const row of rows) {
      let parent = nodes.get(row.account_id)?.parent_id;
      const visited = new Set([row.account_id]);
      while (parent) {
        if (visited.has(parent)) throw new Error("Ciclo no plano BP.");
        visited.add(parent);
        values.set(parent, (values.get(parent) || 0) + Math.round(Number(row.amount) * 100));
        parent = nodes.get(parent)?.parent_id;
      }
    }
    return new Map([...values].map(([id, cents]) => [id, cents / 100]));
  }
  window.VECTON_BP_MODEL = { headers, amount, findHeader, parse, parseWorkbook, totals };
})(window);
