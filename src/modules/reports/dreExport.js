(function (window) {
  "use strict";
  const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const icon = type => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${{
    print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    email: '<path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/>',
    excel: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'
  }[type]}</svg>`;
  const menu = () => `<div class="fc-export dre-export"><button type="button" class="ghost-button" data-dre-exp-toggle aria-haspopup="true" aria-expanded="false">${icon("print")}Exportar</button><div class="fc-export-menu" hidden>${[["print", "Imprimir"], ["email", "Enviar por e-mail"], ["excel", "Baixar Excel"]].map(([key, label]) => `<button type="button" data-dre-exp="${key}">${icon(key)}${label}</button>`).join("")}</div></div>`;

  const finite = value => Number.isFinite(Number(value));
  const plainName = snapshot => `${snapshot.title.replace(/\s+/g, "-")}-${snapshot.year}${snapshot.month ? "-" + String(snapshot.month).padStart(2, "0") : ""}`;
  const periodText = snapshot => snapshot.month ? `${MONTHS[snapshot.month - 1].replace(/^./, c => c.toUpperCase())}/${snapshot.year}` : `${snapshot.year} · ${snapshot.sourceLabel}`;
  const subtotalLike = kind => ["subtotal", "result", "result-final"].includes(kind);
  const isGer = snapshot => snapshot.profile === "ger";
  // Faixa cinza do modelo: DFs nos subtotais; Gerencial nos subtotais e no percentual logo abaixo deles.
  const hasFill = (snapshot, line, previous) => isGer(snapshot)
    ? subtotalLike(line.kind) || (line.kind === "percent" && Boolean(previous) && subtotalLike(previous.kind))
    : line.kind === "subtotal" || line.id === "resultadoExerc";
  // Linhas em branco entre blocos, como nos modelos anexos.
  const spacerBefore = (snapshot, previous, line) => {
    if (!previous) return false;
    if (isGer(snapshot)) return !["percent", "detail"].includes(line.kind) && (subtotalLike(line.kind) || previous.kind !== "deduction");
    return line.kind !== "percent" && (["section", "subtotal", "result"].includes(line.kind) || previous.kind === "subtotal");
  };
  // Estilo de cada tipo de linha, conforme "DRE DFs.xlsx" e "DRE Gerencial.xlsx".
  function lineStyle(snapshot, line, previous) {
    const percent = line.kind === "percent", section = line.kind === "section";
    if (isGer(snapshot)) {
      const filled = hasFill(snapshot, line, previous);
      if (percent) return { bold: filled, italic: true, labelSize: 9, valueSize: 9, indent: 0, filled };
      if (line.kind === "detail") return { bold: false, italic: false, labelSize: 9, valueSize: 9, indent: 1, filled };
      return { bold: subtotalLike(line.kind), italic: false, labelSize: 10, valueSize: 10, indent: 0, filled };
    }
    return { bold: ["value", "subtotal", "result"].includes(line.kind), italic: percent, labelSize: percent ? 9 : 10, valueSize: 9, indent: section ? 0 : 1, filled: hasFill(snapshot, line, previous) };
  }

  // Planilha no formato dos modelos "DRE DFs.xlsx" e "DRE Gerencial.xlsx": meses em C:N, total em O,
  // Aptos Display, faixa cinza nos subtotais; os blocos de comparação (Mês e Acumulado) seguem à direita.
  function buildWorkbook(ExcelJS, snapshot) {
    const ger = isGer(snapshot);
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet(snapshot.sheetName || "DRE DFs", {
      properties: { tabColor: { argb: "FF0070C0" }, defaultRowHeight: 12.75 },
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.51, right: 0.51, top: 0.79, bottom: 0.79, header: 0.31, footer: 0.31 } }
    });
    const compare = snapshot.lines.some(line => line.compare);
    const lastColumn = compare ? 25 : 15;
    const widths = ger ? { 1: 3.3, 2: 33.4, 15: 12.4, 16: 2.5, 21: 2.5 } : { 1: 9.14, 2: 34.4, 15: 12, 16: 2.5, 21: 2.5 };
    for (let column = 1; column <= lastColumn; column++) sheet.getColumn(column).width = widths[column] || (ger ? 11.4 : 11.5);
    const font = (size, bold, italic, color) => ({ name: "Aptos Display", size, bold, italic, ...(color ? { color: { argb: color } } : {}) });
    const gray = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    const blocks = compare ? [[17, 20], [22, 25]] : [];
    const set = (row, column, value, style = {}) => {
      const cell = sheet.getCell(row, column);
      if (value !== null && value !== undefined && !(typeof value === "number" && !Number.isFinite(value))) cell.value = value;
      cell.font = font(style.size || 10, style.bold, style.italic, style.color);
      cell.alignment = { vertical: "middle", horizontal: style.align || (typeof value === "number" ? "right" : "left"), indent: style.indent || 0 };
      if (style.format) cell.numFmt = style.format;
      if (style.fill) cell.fill = gray;
    };
    const subSize = ger ? 8 : 10;
    if (!ger) { sheet.getRow(1).height = 19.5; sheet.getRow(2).height = 17.85; sheet.getRow(3).height = 7.5; }
    MONTHS.forEach((month, index) => {
      set(1, 3 + index, month, { bold: true, align: "center" });
      set(2, 3 + index, snapshot.sourceLabel, { italic: true, color: "FF0070C0", align: "center", size: subSize });
    });
    set(1, 15, snapshot.year, { bold: true, align: "center", format: "0" });
    set(2, 15, snapshot.sourceLabel, { italic: true, color: "FF0070C0", align: "center", size: subSize });
    if (compare) {
      for (const [first, title] of [[17, "Mês"], [22, "Acumulado"]]) {
        set(1, first, title, { bold: true, align: "center" }); sheet.mergeCells(1, first, 1, first + 3);
        ["Real", snapshot.compareLabel || "Cenário", "Var R$", "Var %"].forEach((text, index) => set(2, first + index, text, { italic: true, color: "FF0070C0", align: "center", size: subSize }));
      }
    }
    let row = ger ? 3 : 4, previous = null;
    for (const line of snapshot.lines) {
      if (spacerBefore(snapshot, previous, line)) { if (!ger) sheet.getRow(row).height = 7.5; row++; }
      if (!ger) sheet.getRow(row).height = 15.75;
      const look = lineStyle(snapshot, line, previous), filled = look.filled, percent = line.kind === "percent", section = line.kind === "section";
      const { bold, italic } = look;
      set(row, 2, String(line.label).trim(), { bold, italic, size: look.labelSize, indent: look.indent, fill: filled });
      if (!section) {
        const style = { bold, italic, size: look.valueSize, align: "right", format: percent ? "0.0%" : "#,##0", fill: filled };
        for (let index = 0; index < 12; index++) set(row, 3 + index, line.months[index] ?? 0, style);
        set(row, 15, line.total ?? 0, style);
        const cell = line.compare;
        if (compare && cell) {
          const money = { ...style, format: "#,##0" }, ratio = { ...style, format: "0.0%" };
          const values = prefix => cell.isPercent
            ? [[cell[`real${prefix}`], ratio], [cell[`compare${prefix}`], ratio], [cell[`var${prefix}`] * 100, { ...style, format: '0.0" p.p."' }], [null, ratio]]
            : [[cell[`real${prefix}`], money], [cell[`compare${prefix}`], money], [cell[`var${prefix}`], money], [cell[`varPct${prefix}`], ratio]];
          blocks.forEach(([first], block) => values(block ? "Ytd" : "Month").forEach(([value, valueStyle], index) => set(row, first + index, value, valueStyle)));
        } else if (compare && filled) blocks.forEach(([first]) => { for (let index = 0; index < 4; index++) set(row, first + index, null, { fill: true }); });
      } else if (filled) for (let column = 3; column <= 15; column++) set(row, column, null, { fill: true });
      row++; previous = line;
    }
    return book;
  }

  const money = value => !finite(value) || Math.abs(Number(value)) < 0.5 ? "-" : Math.round(Number(value)).toLocaleString("pt-BR");
  const percent = value => !finite(value) || Math.abs(Number(value)) < 0.00001 ? "-" : (Number(value) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  const points = value => !finite(value) || Math.abs(Number(value)) < 0.00001 ? "-" : (Number(value) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " p.p.";

  // Mesma visão da tela, em uma página A4 paisagem, centralizada.
  function printHtml(snapshot, esc) {
    const compare = snapshot.lines.some(line => line.compare);
    const units = [150, ...Array(13).fill(52), ...(compare ? [8, 52, 52, 52, 52, 8, 52, 52, 52, 52] : [])];
    const sum = units.reduce((a, b) => a + b, 0);
    const font = compare ? 6.8 : 8.5;
    const label = esc(snapshot.compareLabel || "Cenário");
    const cells = line => {
      if (line.kind === "section") return `<td colspan="13"></td>${compare ? '<td class="gap"></td><td colspan="4"></td><td class="gap"></td><td colspan="4"></td>' : ""}`;
      const isPercent = line.kind === "percent", fmt = isPercent ? percent : money;
      let html = [...Array(12).keys()].map(index => `<td>${fmt(line.months[index])}</td>`).join("") + `<td class="total">${fmt(line.total)}</td>`;
      if (compare) {
        const c = line.compare, blank = '<td></td><td></td><td></td><td></td>';
        const block = prefix => !c ? blank : c.isPercent
          ? `<td>${percent(c["real" + prefix])}</td><td>${percent(c["compare" + prefix])}</td><td>${points(c["var" + prefix])}</td><td>-</td>`
          : `<td>${money(c["real" + prefix])}</td><td>${money(c["compare" + prefix])}</td><td>${money(c["var" + prefix])}</td><td>${percent(c["varPct" + prefix])}</td>`;
        html += `<td class="gap"></td>${block("Month")}<td class="gap"></td>${block("Ytd")}`;
      }
      return html;
    };
    const rowClass = line => line.kind === "section" ? "section" : subtotalLike(line.kind) ? "subtotal" : line.kind === "percent" ? "percent" : line.kind === "detail" ? "detail" : "";
    const pad = snapshot.lines.length > 26 ? 2.6 : 4.5;
    const body = snapshot.lines.map(line => `<tr class="${rowClass(line)}"><th>${esc(String(line.label).trim())}</th>${cells(line)}</tr>`).join("");
    const title = `${snapshot.title} — ${periodText(snapshot)}`;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:A4 landscape;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font:${font}px Arial,sans-serif;color:#172033;display:flex;justify-content:center;padding-top:10mm}
.sheet{width:100%;max-width:277mm;margin:0 auto;break-inside:avoid;page-break-inside:avoid}
.intro{text-align:center;margin-bottom:10px;line-height:1.5}.intro p{margin:0;font-weight:700;font-size:${font + 2}px}.intro small{color:#475569;font-size:${font + .5}px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
col.gap{width:${(8 / sum * 100).toFixed(2)}%}
thead th{padding:4px 2px;text-align:center;font-weight:700;color:#334155;border-bottom:1px solid #cbd5e1;background:#fff}
thead .group{border-bottom:1px solid #cbd5e1;text-transform:none}thead .sub th,thead .sub{font-size:${font - .3}px}
th.line{text-align:left;padding-left:6px;vertical-align:middle}
tbody th{text-align:left;font-weight:400;padding:${pad}px 2px ${pad}px 6px;white-space:nowrap;overflow:hidden;border-bottom:1px solid #e5e7eb}
tbody td{text-align:right;padding:${pad}px 3px;white-space:nowrap;border-bottom:1px solid #e5e7eb}
td.gap,th.gap{background:#fff!important;border:0!important}
tr.section th,tr.section td{background:#eef1f5;font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:${font - .4}px}
tr.detail th{padding-left:14px}
tr.subtotal th,tr.subtotal td{background:#eaf0ff;font-weight:700;border-top:1px solid #c9d8f5;border-bottom:1px solid #c9d8f5}
tr.percent th,tr.percent td{font-style:italic;color:#475569}
td.total{font-weight:700}
.signature{position:fixed;left:0;right:0;bottom:15mm;text-align:center;font-size:${font + 2}px;font-weight:700;line-height:1.45}
</style></head><body><div class="sheet"><div class="intro"><p>MARCHER BRASIL AGROINDUSTRIAL S.A.</p><p>${esc(title)}</p></div>
<table><colgroup>${units.map(unit => unit === 8 ? '<col class="gap">' : `<col style="width:${(unit / sum * 100).toFixed(2)}%">`).join("")}</colgroup>
<thead><tr><th class="line" rowspan="2">${esc(isGer(snapshot) ? "Linha Gerencial" : "Linha DFs")}</th><th class="group" colspan="13">${esc(snapshot.month ? "Realizado" : snapshot.sourceLabel)}</th>${compare ? `<th class="gap" rowspan="2"></th><th class="group" colspan="4">Mês</th><th class="gap" rowspan="2"></th><th class="group" colspan="4">Acumulado</th>` : ""}</tr>
<tr class="sub">${MONTHS.map(month => `<th>${month.toUpperCase()}</th>`).join("")}<th>TOTAL</th>${compare ? `<th>Real</th><th>${label}</th><th>Var R$</th><th>Var %</th><th>Real</th><th>${label}</th><th>Var R$</th><th>Var %</th>` : ""}</tr></thead>
<tbody>${body}</tbody></table><div class="signature">__________________________<br>Ricardo Guimarães Filho<br>Contador</div></div></body></html>`;
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
    function bind(root, getSnapshot) {
      const toggle = root.querySelector("[data-dre-exp-toggle]"), popup = root.querySelector(".dre-export .fc-export-menu");
      if (!toggle || !popup) return;
      const close = () => { popup.hidden = true; toggle.setAttribute("aria-expanded", "false"); };
      toggle.onclick = () => { popup.hidden = !popup.hidden; toggle.setAttribute("aria-expanded", String(!popup.hidden)); };
      root.addEventListener("click", event => { if (!event.target.closest(".dre-export")) close(); });
      root.addEventListener("keydown", event => { if (event.key === "Escape") { close(); toggle.focus(); } });
      root.querySelectorAll("[data-dre-exp]").forEach(button => button.onclick = async () => {
        close();
        try {
          const snapshot = getSnapshot();
          if (!snapshot) throw new Error("Aguarde o relatório terminar de carregar para exportar.");
          const kind = button.dataset.dreExp, title = `${snapshot.title} — ${periodText(snapshot)}`, filename = plainName(snapshot);
          if (kind === "excel") {
            if (!window.ExcelJS) throw new Error("O gerador de Excel não está disponível. Atualize a página.");
            const buffer = await buildWorkbook(window.ExcelJS, snapshot).xlsx.writeBuffer();
            const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
            const link = document.createElement("a"); link.href = url; link.download = filename + ".xlsx";
            document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          } else if (kind === "print") {
            const page = window.open("", "_blank"); if (!page) throw new Error("Libere pop-ups para imprimir o relatório.");
            page.document.write(printHtml(snapshot, d.escapeHtml)); page.document.close(); page.focus(); setTimeout(() => page.print(), 400);
          } else email({ html: printHtml(snapshot, d.escapeHtml), title, filename: filename + ".pdf" });
        } catch (error) { if (d.alert) await d.alert(error.message); else window.alert(error.message); }
      });
    }
    return { menu, bind };
  }
  window.VECTON_DRE_EXPORT = { create, buildWorkbook, printHtml };
})(window);
