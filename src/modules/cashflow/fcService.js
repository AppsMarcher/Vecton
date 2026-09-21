(function(window) {
  "use strict";
  const M = window.VECTON_FC_MODEL;
  function structureFromPlan(plan) {
    const keys = new Map(plan.map(n => [n.id, n.seed_key || n.id]));
    return plan.map(n => ({ ...n, seed_key: keys.get(n.id), parent_key: keys.get(n.parent_id) || null }));
  }
  function parseWorkbook(workbook, year, plan, today, XLSX = window.XLSX) {
    const structure = structureFromPlan(plan), found = [];
    const currentDate = today ? new Date(`${today}T12:00:00`) : new Date();
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
      const header = M.findHeader(matrix, year);
      if (!header) continue;
      const columns = new Set(header.columns.map(v => v.col));
      for (const [address, cell] of Object.entries(sheet)) {
        if (address.startsWith("!")) continue;
        if (columns.has(XLSX.utils.decode_cell(address).c) && cell.f && cell.v == null) throw new Error(`Recalcule e salve o Excel: ${name}!${address} não tem resultado salvo.`);
      }
      const report = M.parseMatrix(matrix, year, currentDate, structure);
      if (report) found.push(report);
    }
    if (found.length !== 1) throw new Error(found.length ? `Há mais de uma estrutura para ${year}. Mantenha apenas uma por ano.` : `Não foram encontrados os 12 meses de ${year}. Confira o ano no cabeçalho.`);
    const report = found[0];
    if (report.quantities.some(v => v < 0 || !Number.isInteger(v))) throw new Error("A quantidade de máquinas deve ser inteira e não negativa.");
    return report;
  }
  function template(plan, year, today, XLSX = window.XLSX) {
    if (!XLSX) throw new Error("O leitor de Excel não carregou. Atualize a página.");
    const structure = structureFromPlan(plan), current = new Date(`${today}T12:00:00`);
    const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const zero = label => [label, ...Array(12).fill(0)];
    const rows = [[`FLUXO DE CAIXA ${year}`, ...months], ["Cenário", ...months.map((_,i) => year < current.getFullYear() || year === current.getFullYear() && i < current.getMonth()+1 ? "Real" : "Fcst")], zero("Maquinas Vendidas"), zero("Saldo inicial"), zero("SALDOS BANCÁRIOS")];
    const labels = { entradas:"Entradas Operacionais", saidas:"Saídas Operacionais", operacional:"Fluxo de Caixa Operacional", investimentos:"Fluxo de Caixa de Investimentos", financeiro:"Fluxo de Caixa Financeiro" };
    function visit(node) {
      const closing = M.PILLARS.includes(node.seed_key);
      const row = zero(node.node_class === "Analitica" ? node.source_name : labels[node.seed_key] || node.name);
      if (!closing) rows.push(row);
      structure.filter(n=>n.parent_key===node.seed_key).sort((a,b)=>a.sort_order-b.sort_order || a.name.localeCompare(b.name,"pt-BR")).forEach(visit);
      if (closing) rows.push(row);
    }
    for (const key of M.PILLARS) {
      const node=structure.find(n=>n.seed_key===key);
      if (!node) throw new Error("O Plano de Contas FC está incompleto.");
      visit(node);
    }
    rows.push(zero("Fluxo de Caixa Líquido"));
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [{wch:48}, ...months.map(()=>({wch:16}))];
    for (let r=2;r<rows.length;r++) for(let c=1;c<=12;c++) sheet[XLSX.utils.encode_cell({r,c})].z = '#,##0.00';
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,sheet,`FC ${year}`);
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
      ["Preenchimento"], ["Preencha as contas analíticas em R$, com entradas positivas e saídas negativas conforme a natureza do movimento."],
      ["Informe o saldo inicial de janeiro. Saldos bancários e subtotais são recalculados na carga."],
      ["Revise Real/Fcst/Bud em cada mês. Competências futuras não podem ser Real."],
      ["Mantenha os 12 meses, os grupos e as descrições das contas. Vazios e contas ausentes valem zero."],
      ["Máquinas vendidas: quantidades inteiras. A carga substitui todo o ano da empresa."],
      ["Valores zerados são espaços para preenchimento; nenhuma informação financeira real está incluída."]
    ]),"Instruções");
    return book;
  }
  function createService(deps) {
    async function history() {
      const { org, user } = await scope();
      const rows = await deps.fetchRows("fc_import_batches", `organization_id=eq.${org}&select=id,reference_year,file_name,applied_at&order=reference_year.desc&limit=200`);
      if (user !== deps.getUserId()) throw new Error("A sessão mudou.");
      return rows;
    }
    async function scope() {
      const user = deps.getUserId();
      if (!user) throw new Error("Sua sessão expirou.");
      const org = await deps.resolveOrganizationId();
      if (user !== deps.getUserId()) throw new Error("A sessão mudou. Atualize a página.");
      return { org, user };
    }
    async function context(year) {
      const { org, user } = await scope();
      const result = await deps.rpc("fc_import_context", { target_org: org, target_year: year });
      if (user !== deps.getUserId()) throw new Error("A sessão mudou.");
      return { ...result, org, user };
    }
    async function load(year) {
      const { org, user } = await scope();
      const batches = await deps.fetchRows("fc_import_batches", `organization_id=eq.${org}&reference_year=eq.${year}&select=*&limit=1`);
      if (!batches.length) return null;
      const batch = batches[0], entries = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await deps.fetchRows("fc_import_values", `organization_id=eq.${org}&batch_id=eq.${batch.id}&select=account_id,amounts&order=account_id.asc&limit=1000&offset=${offset}`);
        entries.push(...page); if (page.length < 1000) break;
      }
      if (user !== deps.getUserId()) throw new Error("A sessão mudou.");
      const structure = structureFromPlan(batch.plan_snapshot), movements = {};
      if (entries.length !== structure.filter(n => n.node_class === "Analitica").length) throw new Error("A carga mudou durante a leitura. Atualize o relatório.");
      for (const row of entries) {
        const node = structure.find(n => n.id === row.account_id);
        if (!node) throw new Error("A carga contém uma conta sem vínculo no plano.");
        movements[node.seed_key] = row.amounts.map(Number);
      }
      const report = M.calculate({ year, opening: Number(batch.opening_balance), kinds: batch.scenarios, quantities: batch.quantities.map(Number), movements }, structure);
      return { report, batch };
    }
    async function prepare(file, year, ctx) {
      if (ctx.user !== deps.getUserId()) throw new Error("A sessão mudou.");
      if (!/\.xlsx?$/i.test(file.name) || file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error("Selecione um Excel .xls ou .xlsx de até 20 MB.");
      if (!window.XLSX) throw new Error("O leitor de Excel não carregou. Atualize a página.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const book = window.XLSX.read(bytes, { type: "array", cellDates: false, cellFormula: true });
      if (book.Workbook?.WBProps?.date1904) throw new Error("Salve o arquivo no sistema de datas padrão de 1900 antes da carga.");
      const report = parseWorkbook(book, year, ctx.plan, ctx.today);
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      const payload = {
        id: crypto.randomUUID(), year, expected_batch_id: ctx.batch?.id || null, plan_version: ctx.plan_version,
        file_name: file.name, file_size: bytes.length, file_base64: btoa(binary),
        scenarios: report.kinds, quantities: report.quantities, opening_mode: report.openingMode, opening_value: report.openingValue,
        entries: report.structure.filter(n => n.node_class === "Analitica").map(n => ({ account_id: n.id, amounts: report.movements[n.seed_key] }))
      };
      return { ctx, report, payload };
    }
    async function apply(draft) {
      const { org, user } = await scope();
      if (user !== draft.ctx.user || org !== draft.ctx.org) throw new Error("A sessão ou empresa mudou. Valide novamente.");
      return deps.rpc("apply_fc_annual_import", { target_org: org, payload: draft.payload });
    }
    async function scenarios(year) {
      const {org,user}=await scope();
      const rows=await deps.fetchRows("fc_scenarios",`organization_id=eq.${org}&reference_year=eq.${year}&select=id,name,created_at,base_file_name,is_shared&order=created_at.desc&limit=1000`);
      if(user!==deps.getUserId()) throw new Error("A sessão mudou.");
      return rows;
    }
    async function scenario(id) {
      const {org,user}=await scope();
      const rows=await deps.fetchRows("fc_scenarios",`organization_id=eq.${org}&id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
      if(user!==deps.getUserId()) throw new Error("A sessão mudou.");
      if(!rows.length) throw new Error("Cenário não encontrado.");
      const saved=rows[0], data=saved.report_data, structure=structureFromPlan(data.plan), movements={};
      structure.filter(n=>n.node_class==='Analitica').forEach(n=>{movements[n.seed_key]=data.movements[n.id].map(Number);});
      return {report:M.calculate({year:data.year,opening:Number(data.opening),kinds:data.kinds,quantities:data.quantities.map(Number),movements},structure),scenario:saved,batch:{file_name:saved.base_file_name,applied_at:saved.created_at}};
    }
    async function saveScenario(base,report,name) {
      const {org}=await scope(), movements={};
      report.structure.filter(n=>n.node_class==='Analitica').forEach(n=>{movements[n.id]=report.movements[n.seed_key];});
      return deps.rpc("save_fc_scenario",{target_org:org,payload:{name,base_batch_id:base.scenario?null:base.batch.id,source_scenario_id:base.scenario?.id||null,movements,quantities:report.quantities}});
    }
    async function deleteScenario(id) {
      const {org}=await scope();
      return deps.rpc("delete_fc_scenario",{target_org:org,target_id:id});
    }
    return { context, load, prepare, apply, history, scenarios, scenario, saveScenario, deleteScenario };
  }
  window.VECTON_FC_SERVICE = { createService, structureFromPlan, parseWorkbook, template };
})(window);
