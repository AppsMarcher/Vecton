(function (window) {
  "use strict";
  const money = cents => cents === null || cents === undefined ? "—" : (cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 }).replace(/^-0$/, "0");
  const icon = type => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${{
    print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    email: '<path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/>',
    excel: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'
  }[type]}</svg>`;
  const menu = () => `<div class="fc-export bp-export"><button type="button" class="ghost-button" data-bp-export-toggle aria-haspopup="true" aria-expanded="false">${icon("print")}Exportar</button><div class="fc-export-menu" hidden>${[["print", "Imprimir"], ["email", "Enviar por e-mail"], ["excel", "Baixar Excel"]].map(([key, label]) => `<button type="button" data-bp-export="${key}">${icon(key)}${label}</button>`).join("")}</div></div>`;

  // Planilha no formato do modelo "BP Excel.xlsx": Ativo à esquerda (B:E), Passivo à direita (G:J),
  // Aptos Display, sem linhas de grade, A4 paisagem ajustada à largura e totais alinhados no rodapé.
  const EXCEL_LABELS = { taxNoncurrent: "Impostos a Recuperar NC", loansNoncurrent: "Empréstimos NC" };
  function buildWorkbook(ExcelJS, model) {
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet("BP", {
      properties: { tabColor: { argb: "FF00B050" }, defaultRowHeight: 13.5 },
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.59, right: 0.59, top: 1.18, bottom: 1.18, header: 0.2, footer: 0.2 } }
    });
    sheet.headerFooter.oddHeader = '&C&"Aptos Display,Negrito"&10MARCHER BRASIL AGROINDUSTRIAL S.A.\nCNPJ: 06.221.454/0001-79\n\nBALANÇO PATRIMONIAL';
    sheet.headerFooter.oddFooter = '&C&"Aptos Display,Negrito"&10__________________________\nRicardo Guimarães Filho\nContador';
    [9.14, 28, 3, 12.5, 12.5, 9.14, 28, 3, 12.5, 12.5].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    const thin = { style: "thin", color: { argb: "FF000000" } };
    const put = (row, col, value, { bold = false, size = 10, indent = 0, number = false, border } = {}) => {
      const cell = sheet.getCell(row, col);
      if (value !== null && value !== undefined) cell.value = value;
      cell.font = { name: "Aptos Display", size, bold };
      cell.alignment = { vertical: "middle", horizontal: number ? "right" : "left", indent };
      if (number) cell.numFmt = "#,##0";
      if (border) cell.border = border;
    };
    const amount = cents => cents === null || cents === undefined ? null : cents / 100;
    const endOf = (row, count) => row + count + 2;
    const sectionOf = id => model.sections.find(s => s.id === id);
    const write = (section, row, label, first) => {
      put(row, label, section.title, { bold: true });
      section.lines.forEach((line, index) => {
        put(row + 1 + index, label, EXCEL_LABELS[line.id] || line.label, { indent: 2 });
        put(row + 1 + index, first, amount(line.current), { size: 9, number: true });
        put(row + 1 + index, first + 1, amount(line.previous), { size: 9, number: true });
      });
      const total = row + section.lines.length + 2;
      put(total, label, section.total, { bold: true, indent: 2 });
      put(total, first, amount(section.current), { bold: true, size: 9, number: true });
      put(total, first + 1, amount(section.previous), { bold: true, size: 9, number: true });
    };
    const assetCurrent = sectionOf("assetCurrent"), assetNoncurrent = sectionOf("assetNoncurrent");
    const liabilityCurrent = sectionOf("liabilityCurrent"), liabilityNoncurrent = sectionOf("liabilityNoncurrent"), equity = sectionOf("equity");
    const noncurrentRow = Math.max(endOf(5, assetCurrent.lines.length), endOf(5, liabilityCurrent.lines.length)) + 3;
    const equityRow = endOf(noncurrentRow, liabilityNoncurrent.lines.length) + 3;
    const grandRow = Math.max(endOf(noncurrentRow, assetNoncurrent.lines.length), endOf(equityRow, equity.lines.length)) + 3;
    for (const [label, first, title] of [[2, 4, "ATIVO"], [7, 9, "PASSIVO"]]) {
      put(3, label, title, { bold: true });
      put(3, first, model.current.year, { bold: true, number: true, border: { bottom: thin } }); sheet.getCell(3, first).numFmt = "0";
      put(3, first + 1, model.previous.year, { bold: true, number: true, border: { bottom: thin } }); sheet.getCell(3, first + 1).numFmt = "0";
    }
    write(assetCurrent, 5, 2, 4); write(assetNoncurrent, noncurrentRow, 2, 4);
    write(liabilityCurrent, 5, 7, 9); write(liabilityNoncurrent, noncurrentRow, 7, 9); write(equity, equityRow, 7, 9);
    for (const [label, first, text, total] of [[2, 4, "TOTAL DO ATIVO", model.asset], [7, 9, "TOTAL DO PASSIVO", model.liability]]) {
      put(grandRow, label, text, { bold: true, indent: 2 });
      put(grandRow, first, amount(total.current), { bold: true, size: 9, number: true, border: { top: thin, bottom: thin } });
      put(grandRow, first + 1, amount(total.previous), { bold: true, size: 9, number: true, border: { top: thin, bottom: thin } });
    }
    return book;
  }

  // Uma única página A4 retrato, conteúdo centralizado na horizontal.
  function printHtml(model, esc) {
    const section = id => {
      const s = model.sections.find(x => x.id === id);
      return `<h3>${esc(s.title)}</h3><table>${s.lines.map(l => `<tr><th>${esc(l.label)}</th><td>${money(l.current)}</td><td>${money(l.previous)}</td></tr>`).join("")}<tr class="total"><th>${esc(s.total)}</th><td>${money(s.current)}</td><td>${money(s.previous)}</td></tr></table>`;
    };
    const head = label => `<table class="head"><tr><th>${label}</th><td>${model.current.year}</td><td>${model.previous.year}</td></tr></table>`;
    const grand = (label, total) => `<table class="grand"><tr><th>${label}</th><td>${money(total.current)}</td><td>${money(total.previous)}</td></tr></table>`;
    const longest = Math.max(...["asset", "liability"].map(side => model.sections.filter(s => s.side === side).reduce((n, s) => n + s.lines.length + 3, 0)));
    const font = longest > 36 ? 7.5 : longest > 30 ? 8 : 8.5;
    const title = `Balanço Patrimonial — ${model.current.date}`;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font:${font}px Arial,sans-serif;color:#172033;display:flex;justify-content:center}
.sheet{width:186mm;max-width:100%;margin:0 auto;break-inside:avoid;page-break-inside:avoid}
.intro{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px}
.intro p{margin:0;font-size:${font - 1.5}px;letter-spacing:.08em;color:#64748b}.intro h1{margin:3px 0 0;font-size:${font + 8}px}
.dates{text-align:right;font-weight:700}.dates span{display:block;font-weight:400;color:#64748b;margin-top:3px}
.grid{display:grid;grid-template-columns:1fr 1fr;column-gap:8mm}
table{width:100%;border-collapse:collapse;table-layout:fixed}th{text-align:left;font-weight:400;padding:1.5px 0 1.5px 10px}
td{text-align:right;white-space:nowrap;padding:1.5px 0 1.5px 8px;width:22%}
col.l{width:56%}h3{margin:12px 0 4px;font-size:${font + .5}px}
.head th{font-weight:700;padding-left:0;border:0}.head td{font-weight:700;border-bottom:1px solid #334155}
.total th,.total td{font-weight:700;padding-top:8px}
.grand th{font-weight:700;padding-top:8px}.grand td{font-weight:700;padding-top:8px;border-top:1px solid #334155;border-bottom:3px double #334155}
.cell{align-self:start}.foot{align-self:end;margin-top:12px}
</style></head><body><div class="sheet"><div class="intro"><div><p>MARCHER</p><h1>Balanço Patrimonial</h1></div><div class="dates">${model.current.date}<span>comparado a ${model.previous.date}</span></div></div>
<div class="grid"><div>${head("ATIVO")}</div><div>${head("PASSIVO")}</div>
<div class="cell">${section("assetCurrent")}</div><div class="cell">${section("liabilityCurrent")}</div>
<div class="cell">${section("assetNoncurrent")}</div><div class="cell">${section("liabilityNoncurrent")}</div>
<div></div><div class="cell">${section("equity")}</div>
<div class="foot">${grand("TOTAL DO ATIVO", model.asset)}</div><div class="foot">${grand("TOTAL DO PASSIVO", model.liability)}</div></div></div></body></html>`;
  }

  function create(d) {
    let emailModal = null;
    function email(report) {
      if (!emailModal) emailModal = window.VECTON_REPORT_EMAIL.create({ escapeHtml: d.escapeHtml, callEdgeFunction: (_name, payload) => d.sendEmail(payload) });
      const session = d.getUserId();
      emailModal.open({
        subtitle: report.title, subject: report.title,
        bodyText: `Olá,\n\nSegue em anexo o ${report.title}.\n\nAtenciosamente,\n${d.getUserName ? d.getUserName() : ""}`,
        filename: report.filename, buildHtml: () => report.html, isSessionValid: () => session === d.getUserId()
      });
    }
    function bind(root, getModel) {
      const toggle = root.querySelector("[data-bp-export-toggle]"), popup = root.querySelector(".bp-export .fc-export-menu");
      if (!toggle || !popup) return;
      const close = () => { popup.hidden = true; toggle.setAttribute("aria-expanded", "false"); };
      toggle.onclick = () => { popup.hidden = !popup.hidden; toggle.setAttribute("aria-expanded", String(!popup.hidden)); };
      root.addEventListener("click", event => { if (!event.target.closest(".bp-export")) close(); });
      root.addEventListener("keydown", event => { if (event.key === "Escape") { close(); toggle.focus(); } });
      root.querySelectorAll("[data-bp-export]").forEach(button => button.onclick = async () => {
        close();
        const model = getModel(); if (!model) return;
        const kind = button.dataset.bpExport, title = `Balanço Patrimonial — ${model.current.date}`, filename = `Balanco-Patrimonial-${model.current.year}-${String(model.current.month).padStart(2, "0")}`;
        try {
          if (kind === "excel") {
            if (!window.ExcelJS) throw new Error("O gerador de Excel não está disponível. Atualize a página.");
            const buffer = await buildWorkbook(window.ExcelJS, model).xlsx.writeBuffer();
            const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
            const link = document.createElement("a"); link.href = url; link.download = filename + ".xlsx";
            document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          } else if (kind === "print") {
            const page = window.open("", "_blank"); if (!page) throw new Error("Libere pop-ups para imprimir o relatório.");
            page.document.write(printHtml(model, d.escapeHtml)); page.document.close(); page.focus(); setTimeout(() => page.print(), 400);
          } else email({ html: printHtml(model, d.escapeHtml), title, filename: filename + ".pdf" });
        } catch (error) { if (d.alert) await d.alert(error.message); else window.alert(error.message); }
      });
    }
    return { menu, bind };
  }
  window.VECTON_BP_EXPORT = { create, printHtml, buildWorkbook };
})(window);
