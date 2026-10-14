(function attachVectonComercialMargensExport(window) {
  // Exportação do "Evolutivo de Margens · Marcher" (somente a tabela corrida): Imprimir,
  // Enviar por e-mail (PDF gerado no servidor a partir do MESMO html da impressão) e
  // Baixar Excel (ExcelJS, no navegador). Os três partem de uma "foto" da tabela
  // (exportSnapshot, em reportsComercialMargensModule.js): métrica, filtro de equipe e
  // linhas abertas exatamente como estão na tela.
  function createMargensExport(deps) {
    const { escapeHtml, state, callEdgeFunction, appAlert } = deps;

    let docMenuClickHandler = null;
    // Tela de envio por e-mail única dos relatórios (reportEmailModal.js, padrão do Painel de Vendas).
    const emailModal = window.VECTON_REPORT_EMAIL.create({ escapeHtml, callEdgeFunction });

    // ── formatação (mesmas regras da tela) ──────────────────────────────
    const fmt = (v, d = 0) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v) || 0);
    function showVal(v, k) {
      if (v == null) return "–";
      if (k === "mb") return `${fmt(v * 100, 1)}%`;
      if (k === "vol") return Number.isInteger(Math.round(v * 100) / 100) || Math.abs(v) >= 100 ? fmt(v, 0) : fmt(v, 1);
      return fmt(v, Math.abs(v) < 100 ? 2 : 0);
    }
    const deltaTxt = (x, k) => `${x.d >= 0 ? "▲" : "▼"} ${fmt(Math.abs(x.d), k === "vol" ? 0 : 1)}${k === "mb" ? " pp" : "%"}`;
    const slug = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    function baseName(snap) {
      const eq = snap.equipe && snap.equipe !== "Todas" ? `-${slug(snap.equipe)}` : "";
      return `evolutivo-margens-jan-${slug(snap.months[snap.nMonths - 1])}-${snap.year}${eq}`;
    }
    function metaLines(snap) {
      return [
        `Comercial · ${snap.periodTxt} · líquido de devoluções · MC1% = (RL − MP) ÷ RL`,
        `Equipe Comercial: ${snap.equipe}`
      ];
    }
    const LEGEND = [
      "▲▼ verde = favorável · vermelho = desfavorável (em MP, queda é favorável) · – = mês sem volume líquido",
      "Coluna do ano anterior = média ponderada do 4º trimestre (VOL = média mensal) · coluna do ano atual = acumulado até o mês do filtro",
      "A variação de cada mês compara com o mês anterior; na coluna do ano, com os 3 últimos meses do mesmo ano (não se aplica ao VOL)"
    ];

    // ── CSS (menu Exportar + modal de e-mail) ───────────────────────────
    function ensureStyle() {
      if (document.getElementById("cmx-style")) return;
      const s = document.createElement("style");
      s.id = "cmx-style";
      s.textContent = `
      .cmx-wrap{position:relative}
      .cmx-btn{display:flex;align-items:center;gap:6px;box-sizing:border-box;height:34px;padding:0 14px;background:var(--cmm-panel,var(--theme-surface,#121317));border:1px solid var(--cmm-line,var(--theme-border,#2a2d34));border-radius:12px;color:var(--cmm-muted,var(--theme-ink-secondary,#a1a7b3));font-size:12.5px;font-family:inherit;font-weight:500;cursor:pointer}
      .cmx-btn:hover{color:var(--cmm-text,var(--theme-ink,#fff));border-color:#4f7cff}.cmx-btn:disabled{opacity:.55;cursor:default}.cmx-btn svg{width:14px;height:14px}
      .cmx-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:120;background:var(--cmm-panel2,var(--theme-surface-raised,#191b20));border:1px solid var(--cmm-line,var(--theme-border,#2a2d34));border-radius:12px;box-shadow:0 12px 32px var(--theme-shadow-color,rgba(0,0,0,.45));min-width:180px;padding:6px;display:none;flex-direction:column;gap:2px}
      .cmx-menu.open{display:flex}
      .cmx-menu button{display:flex;align-items:center;gap:8px;background:transparent;border:none;color:var(--cmm-muted,var(--theme-ink-secondary,#a1a7b3));font-size:12.5px;font-family:inherit;font-weight:500;padding:8px 10px;border-radius:8px;cursor:pointer;text-align:left;width:100%}
      .cmx-menu button:hover{background:var(--theme-surface-tint,rgba(255,255,255,.06));color:var(--cmm-text,var(--theme-ink,#fff))}.cmx-menu svg{width:14px;height:14px;flex:none}
      `;
      document.head.appendChild(s);
    }

    // ── menu ─────────────────────────────────────────────────────────────
    const ICONS = {
      print: '<polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect>',
      email: '<path d="M4 4h16v16H4z"></path><path d="m22 6-10 7L2 6"></path>',
      excel: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>'
    };
    const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`;
    function menuHtml(disabled) {
      return `<div class="cmx-wrap">
        <button type="button" class="cmx-btn" id="cmx-toggle" title="Exportar o Evolutivo de Margens" aria-haspopup="true" aria-expanded="false"${disabled ? " disabled" : ""}>${svg("print")}Exportar</button>
        <div class="cmx-menu" id="cmx-menu">
          <button type="button" data-cmx="print">${svg("print")}Imprimir</button>
          <button type="button" data-cmx="email">${svg("email")}Enviar por e-mail</button>
          <button type="button" data-cmx="excel">${svg("excel")}Baixar Excel</button>
        </div>
      </div>`;
    }
    function bind(container, getSnapshot) {
      const toggle = container.querySelector("#cmx-toggle");
      const menu = container.querySelector("#cmx-menu");
      if (!toggle || !menu) return;
      const close = () => { menu.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); };
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = !menu.classList.contains("open");
        menu.classList.toggle("open", open);
        toggle.setAttribute("aria-expanded", String(open));
      });
      menu.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-cmx]");
        if (!b) return;
        close();
        const snap = getSnapshot();
        if (!snap) return;
        if (b.dataset.cmx === "print") openPrint(snap);
        else if (b.dataset.cmx === "email") openEmailModal(snap);
        else downloadExcel(snap, toggle);
      });
      // O container é reconstruído a cada render: mantém um único listener global.
      if (docMenuClickHandler) document.removeEventListener("click", docMenuClickHandler);
      docMenuClickHandler = close;
      document.addEventListener("click", docMenuClickHandler);
    }

    // ── impressão / PDF ──────────────────────────────────────────────────
    // PDF: A4 retrato, uma página por métrica (VOL, FAT, RL, MP, MC1%), todas as colunas da tela
    // (2025, JAN–DEZ, 2026; meses depois do filtro vazios) e só os nomes reduzidos (sem itens por código).
    function buildPrintDoc(snap, autoPrint) {
      const cols = 15;
      const rows = snap.rows.filter((r) => r.kind !== "prod");
      // Corpo útil da página retrato ≈ 930px (folha ~1062px menos título e legenda). Cada célula tem
      // 2 linhas (valor e variação), então fonte e espaçamento encolhem conforme o número de linhas.
      const rowH = Math.min(24, 930 / (rows.length + 1));
      const fs = Math.max(4.6, Math.min(7.4, rowH / 2.5));
      const padV = Math.max(0, (rowH - fs * 2.3) / 2 - 0.3);
      const page = (mt, idx) => {
        const k = mt.key;
        const cell = (x, cls) => {
          if (!x) return `<td class="${cls || ""}"></td>`;
          if (x.v == null) return `<td class="${cls || ""}">–</td>`;
          const dl = x.d == null ? "" : `<span class="dl ${x.good ? "pos" : "neg"}">${deltaTxt(x, k).replace(/ /, "")}</span>`;
          return `<td class="${cls || ""}">${showVal(x.v, k)}${dl}</td>`;
        };
        const body = rows.map((r) => {
          if (r.kind === "grp") return `<tr class="grp"><td colspan="${cols}">${escapeHtml(r.label)}</td></tr>`;
          if (r.kind === "empty") return `<tr><td colspan="${cols}" class="empty">Sem vendas para ${escapeHtml(snap.equipe)} no período.</td></tr>`;
          const d = r.m[k];
          return `<tr class="${r.kind}"><td class="nm">${escapeHtml(r.label)}</td>${cell(d.q4, "q4")}${d.months.map((m) => cell(m)).join("")}${cell(d.ano, "ano")}</tr>`;
        }).join("");
        const head = `<tr><th></th><th class="q4">${snap.year - 1}</th>${snap.months.map((m) => `<th>${m}</th>`).join("")}<th class="ano">${snap.year}</th></tr>`;
        return `<section class="pg${idx ? " brk" : ""}">
<h1>${escapeHtml(snap.title)} — ${escapeHtml(mt.label)}</h1>
<p class="meta">${escapeHtml(`${mt.unit} · Comercial · ${snap.periodTxt} · líquido de devoluções · Equipe Comercial: ${snap.equipe}`)}</p>
<p class="gen">Gerado em ${new Date().toLocaleString("pt-BR")} · página ${idx + 1} de ${snap.metrics.length}</p>
<table><thead>${head}</thead><tbody>${body}</tbody></table>
<div class="leg">${LEGEND.map((t) => `<div>${escapeHtml(t)}</div>`).join("")}</div>
</section>`;
      };
      return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(snap.title)}</title>
<style>
@page{size:A4 portrait;margin:8mm}
*{box-sizing:border-box}body{margin:0;font:${fs.toFixed(2)}px/1.15 Arial,Helvetica,sans-serif;color:#172033;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.brk{page-break-before:always;break-before:page}.pg{page-break-inside:avoid;break-inside:avoid}
h1{font-size:14px;margin:0 0 2px}.meta{font-size:8.5px;color:#556070;margin:0 0 1px}.gen{font-size:7.5px;color:#7a8494;margin:1px 0 5px}
table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{page-break-inside:avoid}
th{font-size:${Math.min(7.5, fs + 0.4).toFixed(2)}px;text-transform:uppercase;letter-spacing:.01em;color:#556070;text-align:right;padding:2px 1px;border-bottom:1.5px solid #8b95a5;background:#f1f3f7}
th:first-child{text-align:left;width:15%}
td{padding:${padV.toFixed(2)}px 1px;text-align:right;border-bottom:.5px solid #e1e5ec;vertical-align:top;white-space:nowrap;font-variant-numeric:tabular-nums}
td.nm{text-align:left;white-space:normal;overflow:hidden;text-overflow:ellipsis}
.q4,.ano{background:#eef2fb}tr.tot td{font-weight:700;background:#dde5f5;border-bottom:1px solid #8b95a5}
tr.grp td{font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:#334055;background:#f1f3f7;text-align:left}
tr.sub td{font-weight:700;border-top:1px solid #8b95a5}tr.mq td.nm{font-weight:600}
.dl{display:block;font-size:.85em;font-weight:600}.pos{color:#15803d}.neg{color:#b91c1c}.empty{text-align:center!important;padding:14px;color:#7a8494}
.leg{margin-top:5px;font-size:6.5px;color:#7a8494}.leg div{margin-bottom:1px}
</style></head><body>
${snap.metrics.map(page).join("\n")}
${autoPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},400);});<\/script>' : ""}
</body></html>`;
    }
    async function openPrint(snap) {
      // window.open precisa ser síncrono no clique, senão o popup blocker segura.
      const w = window.open("", "_blank");
      if (!w) { await appAlert("O navegador bloqueou a janela do relatório. Libere pop-ups para este site e tente novamente.", "warn"); return; }
      try {
        w.document.open();
        w.document.write(buildPrintDoc(snap, true));
        w.document.close();
      } catch (e) {
        console.error("imprimir margens:", e);
        try { w.close(); } catch (_) { /* já fechada */ }
        await appAlert("Falha ao gerar a impressão do Evolutivo de Margens.", "error");
      }
    }

    // ── Excel ────────────────────────────────────────────────────────────
    const BORDER = { style: "thin", color: { argb: "FFE1E5EC" } };
    const BORDER_ALL = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
    const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
    function colLetter(n) { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
    function valueFmt(v, k) {
      if (k === "mb") return "0.0%";
      if (k === "vol") return Number.isInteger(Math.round(v * 100) / 100) ? "#,##0" : "#,##0.0";
      return Math.abs(v) < 100 ? "#,##0.00" : "#,##0";
    }
    function writeValue(cell, x, k, rowFill) {
      cell.border = BORDER_ALL;
      cell.alignment = { horizontal: "right", vertical: "middle" };
      if (rowFill) cell.fill = rowFill;
      if (x.v == null || !Number.isFinite(x.v)) { cell.value = "–"; return false; }
      cell.value = k === "mb" ? x.v : Math.round(x.v * 1e6) / 1e6;
      cell.numFmt = valueFmt(x.v, k);
      return true;
    }
    // Excel: a tabela se repete lado a lado (VOL | FAT | RL | MP | MC1%), cada bloco com o 4º tri do ano
    // anterior, os meses e o total do ano, só valores. Todas as máquinas detalhadas por código.
    function buildWorkbook(snap) {
      const n = snap.nMonths;
      const blockW = 14; // 2025 + 12 meses (os posteriores ao filtro ficam vazios, como na tela) + 2026
      const wb = new window.ExcelJS.Workbook();
      wb.creator = "VectonPlan";
      wb.created = new Date();
      const ws = wb.addWorksheet("Evolutivo de Margens", {
        views: [{ state: "frozen", xSplit: 2, ySplit: 6, showGridLines: false }],
        pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .3, right: .3, top: .4, bottom: .4, header: .2, footer: .2 } }
      });
      const lastCol = 2 + snap.metrics.length * blockW;
      ws.getColumn(1).width = 11;
      ws.getColumn(2).width = 44;
      for (let c = 3; c <= lastCol; c++) ws.getColumn(c).width = 10.5;

      ws.getCell("A1").value = snap.title;
      ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF172033" } };
      metaLines(snap).forEach((t, i) => { const c = ws.getCell(`A${2 + i}`); c.value = t; c.font = { size: 10, color: { argb: "FF556070" } }; });
      const gen = ws.getCell("A4");
      gen.value = `Gerado em ${new Date().toLocaleString("pt-BR")}`;
      gen.font = { size: 9, italic: true, color: { argb: "FF7A8494" } };

      // Cabeçalho em duas linhas: título do bloco (mesclado) e 4º tri / meses / ano
      const headFill = solid("FFF1F3F7");
      const hd = (cell, text, align = "center") => { cell.value = text; cell.font = { bold: true, size: 9.5, color: { argb: "FF334055" } }; cell.fill = headFill; cell.border = BORDER_ALL; cell.alignment = { horizontal: align, vertical: "middle", wrapText: true }; };
      ws.mergeCells("A5:A6"); hd(ws.getCell("A5"), "Código", "left");
      ws.mergeCells("B5:B6"); hd(ws.getCell("B5"), "Nome", "left");
      snap.metrics.forEach((mt, b) => {
        const c0 = 3 + b * blockW;
        ws.mergeCells(5, c0, 5, c0 + blockW - 1);
        hd(ws.getCell(5, c0), `${mt.label} · ${mt.unit}`);
        for (let c = c0 + 1; c < c0 + blockW; c++) { ws.getCell(5, c).fill = headFill; ws.getCell(5, c).border = BORDER_ALL; } // células escravas da mesclagem: só o estilo
        hd(ws.getCell(6, c0), String(snap.year - 1));
        for (let i = 0; i < 12; i++) hd(ws.getCell(6, c0 + 1 + i), snap.months[i].toUpperCase());
        hd(ws.getCell(6, c0 + blockW - 1), String(snap.year));
      });
      ws.getRow(5).height = 18; ws.getRow(6).height = 18;

      let r = 7;
      snap.rows.forEach((row) => {
        if (row.kind === "empty") {
          ws.mergeCells(r, 1, r, lastCol);
          const c = ws.getCell(r, 1);
          c.value = `Sem vendas para ${snap.equipe} no período.`;
          c.alignment = { horizontal: "center" }; c.font = { italic: true, color: { argb: "FF7A8494" } };
          r++; return;
        }
        if (row.kind === "grp") {
          const fill = solid("FFE9EDF5");
          for (let c = 1; c <= lastCol; c++) { const cell = ws.getCell(r, c); cell.fill = fill; cell.border = BORDER_ALL; }
          const c1 = ws.getCell(r, 1);
          c1.value = row.label.toUpperCase();
          c1.font = { bold: true, size: 10, color: { argb: "FF334055" } };
          r++; return;
        }
        const fill = row.kind === "tot" ? solid("FFDDE5F5") : row.kind === "sub" ? solid("FFF6F8FB") : null;
        const bold = row.kind === "tot" || row.kind === "sub" || row.kind === "mq";
        const prod = row.kind === "prod";
        const ink = prod ? "FF4A5568" : "FF172033";
        // Itens: código na coluna A e nome na B. Demais linhas (nome reduzido, totais): rótulo na A, que
        // transborda para a B (vazia), como na tela, onde o código vem antes do nome.
        const nameCell = ws.getCell(r, 2);
        const codCell = ws.getCell(r, 1);
        nameCell.border = BORDER_ALL;
        codCell.border = BORDER_ALL;
        if (prod) {
          codCell.value = row.cod || null;
          codCell.font = { size: 9, color: { argb: "FF7A8494" } };
          codCell.alignment = { horizontal: "left", vertical: "middle" };
          nameCell.value = row.label;
          nameCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
          nameCell.font = { bold, size: 10, color: { argb: ink } };
        } else {
          codCell.value = row.label;
          // sem a divisória entre A e B, para o rótulo transbordar sem uma linha cortando o texto
          codCell.border = { top: BORDER, left: BORDER, bottom: BORDER };
          nameCell.border = { top: BORDER, right: BORDER, bottom: BORDER };
          codCell.font = { bold, size: 10, color: { argb: ink } };
          codCell.alignment = { horizontal: "left", vertical: "middle" };
        }
        if (fill) { nameCell.fill = fill; codCell.fill = fill; }
        snap.metrics.forEach((mt, b) => {
          const c0 = 3 + b * blockW;
          const d = row.m[mt.key];
          const cells = [d.q4].concat(d.months, [d.ano]);
          cells.forEach((x, i) => {
            const cell = ws.getCell(r, c0 + i);
            const rf = fill || (i === 0 || i === blockW - 1 ? solid("FFEEF2FB") : null);
            if (!x) { cell.border = BORDER_ALL; if (rf) cell.fill = rf; return; } // mês depois do filtro: coluna vazia
            const ok = writeValue(cell, x, mt.key, rf);
            cell.font = { bold, size: 10, color: { argb: ok ? ink : "FF9AA3B2" } };
          });
        });
        r++;
      });

      r += 1;
      [
        "Valores unitários (R$ ÷ volume) em FAT, RL, MP e MC1%; VOL em unidades · – = mês sem volume líquido",
        "Coluna do ano anterior = média ponderada do 4º trimestre (VOL = média mensal) · coluna do ano atual = acumulado até o mês do filtro"
      ].forEach((t) => { const c = ws.getCell(r++, 1); c.value = t; c.font = { size: 9, italic: true, color: { argb: "FF7A8494" } }; });
      return wb;
    }
    async function downloadExcel(snap, btn) {
      if (btn) btn.disabled = true;
      try {
        if (!window.ExcelJS) throw new Error("Biblioteca de Excel não carregou. Recarregue a página e tente de novo.");
        const buffer = await buildWorkbook(snap).xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${baseName(snap)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) {
        console.error("baixar excel (margens):", e);
        await appAlert(e?.message || "Falha ao gerar o Excel. Tente novamente.", "error");
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    // ── e-mail ───────────────────────────────────────────────────────────
    function openEmailModal(snap) {
      const signature = state.profile?.name || "";
      emailModal.open({
        subtitle: `Evolutivo de Margens — ${snap.periodTxt}`,
        subject: `Evolutivo de Margens — ${snap.periodTxt}`,
        bodyText: `Olá,\n\nSegue em anexo o Evolutivo de Margens de ${snap.periodTxt} (VOL, FAT, RL, MP e MC1%${snap.equipe !== "Todas" ? ` · ${snap.equipe}` : ""}).\n\nAtenciosamente,\n${signature}`,
        filename: `${baseName(snap)}.pdf`,
        buildHtml: () => buildPrintDoc(snap, false)
      });
    }

    return { ensureStyle, menuHtml, bind };
  }
  window.VECTON_COMERCIAL_MARGENS_EXPORT = { createMargensExport };
})(window);
