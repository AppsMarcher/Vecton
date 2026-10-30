(function (global) {
  'use strict';
  // Popover de importação de um formulário: baixar template, selecionar Excel, enviar e acompanhar o status.
  // Só lê o arquivo e confere o cabeçalho; a gravação nos formulários depende das regras de carga (ainda não definidas).
  const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  function createImportPopover({ esc, scenarioName, formInfo }) {
    let pop, anchor, file, running = false, steps = [];

    const cellText = v => v == null ? '' : typeof v === 'object' ? String(v.text ?? v.result ?? '') : String(v);
    function status(list) { steps = list; const box = pop?.querySelector('[data-imp="status"]'); if (box) box.innerHTML = statusHtml(); }
    function statusHtml() {
      if (!steps.length) return '<p class="pl-imp-idle">Baixe o template, selecione o Excel preenchido e envie o arquivo.</p>';
      const mark = { ok: '✓', err: '✕', run: '…', wait: '•' };
      return `<ol class="pl-imp-steps">${steps.map(s => `<li class="pl-imp-${s.state}"><span aria-hidden="true">${mark[s.state]}</span><div><strong>${esc(s.text)}</strong>${s.detail ? `<small>${esc(s.detail)}</small>` : ''}</div></li>`).join('')}</ol>`;
    }
    function html(info) {
      return `<div class="pl-imp-head"><strong>Importar · ${esc(info.name)}</strong><button type="button" class="pl-dialog-x" data-imp="close" aria-label="Fechar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
        <div class="pl-imp-actions"><button type="button" class="pl-button" data-imp="template">Baixar template</button><button type="button" class="pl-button" data-imp="pick">Selecionar arquivo</button><button type="button" class="pl-button pl-primary" data-imp="upload" disabled>Enviar arquivo</button></div>
        <input type="file" data-imp="file" accept=".xlsx" hidden>
        <div class="pl-imp-file" data-imp="file-name">Nenhum arquivo selecionado</div>
        <div class="pl-imp-status" data-imp="status" role="status" aria-live="polite">${statusHtml()}</div>`;
    }
    function close() {
      pop?.remove(); pop = null; file = null; steps = [];
      document.removeEventListener('mousedown', onOutside, true); document.removeEventListener('keydown', onKey, true);
    }
    const onOutside = e => { if (pop && !pop.contains(e.target) && !anchor?.contains(e.target)) close(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };

    function open(button, info) {
      const same = pop && anchor === button; close(); if (same) return;
      anchor = button; file = null; steps = [];
      pop = document.createElement('div'); pop.className = 'pl-import-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Importar formulário');
      pop.innerHTML = html(info); document.body.appendChild(pop);
      pop.addEventListener('click', e => { const b = e.target.closest('[data-imp]'); if (b && b.dataset.imp !== 'file') action(b.dataset.imp, info); });
      pop.querySelector('[data-imp="file"]').addEventListener('change', e => picked(e.target.files[0]));
      document.addEventListener('mousedown', onOutside, true); document.addEventListener('keydown', onKey, true);
    }
    function picked(f) {
      file = f || null;
      pop.querySelector('[data-imp="file-name"]').textContent = f ? `${f.name} · ${(f.size / 1024).toFixed(1)} KB` : 'Nenhum arquivo selecionado';
      pop.querySelector('[data-imp="upload"]').disabled = !f || running;
      status(f ? [{ state: 'ok', text: 'Arquivo selecionado', detail: 'Clique em Enviar arquivo para iniciar.' }] : []);
    }

    async function download(info) {
      if (!global.ExcelJS) { status([{ state: 'err', text: 'Biblioteca de Excel indisponível' }]); return; }
      const wb = new global.ExcelJS.Workbook(), ws = wb.addWorksheet('Importação'), spec = info.template();
      ws.addRow(spec.header); ws.getRow(1).font = { bold: true }; spec.rows.forEach(r => ws.addRow(r));
      ws.views = [{ state: 'frozen', xSplit: spec.fixed, ySplit: 1 }];
      spec.header.forEach((_, i) => { ws.getColumn(i + 1).width = i < spec.fixed ? 34 : 14; });
      const blob = new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE }), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `template-${spec.slug}-${scenarioName()}.xlsx`.replace(/\s+/g, '-'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      status([{ state: 'ok', text: 'Template baixado', detail: `${spec.rows.length} linha(s) de exemplo · preencha os meses e salve.` }]);
    }

    async function upload(info) {
      if (!file || running) return;
      running = true; pop.querySelector('[data-imp="upload"]').disabled = true;
      const log = [{ state: 'ok', text: 'Arquivo selecionado', detail: file.name }, { state: 'run', text: 'Lendo o arquivo' }];
      status(log);
      try {
        if (!global.ExcelJS) throw Error('Biblioteca de Excel indisponível');
        const wb = new global.ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.getWorksheet('Importação') || wb.worksheets[0];
        if (!ws) throw Error('O arquivo não tem nenhuma planilha.');
        log[1] = { state: 'ok', text: 'Arquivo lido', detail: `Planilha “${ws.name}” · ${Math.max(ws.rowCount - 1, 0)} linha(s) de dados` };
        const spec = info.template(), found = spec.header.map((_, i) => cellText(ws.getRow(1).getCell(i + 1).value).trim());
        const bad = spec.header.filter((h, i) => found[i].toLowerCase() !== h.toLowerCase());
        if (bad.length) { log.push({ state: 'err', text: 'Cabeçalho diferente do template', detail: `Colunas esperadas: ${bad.join(', ')}. Baixe o template e use-o como base.` }); return status(log); }
        let filled = 0; ws.eachRow((row, n) => { if (n > 1 && row.values.some(v => cellText(v).trim() !== '')) filled++; });
        log.push({ state: 'ok', text: 'Cabeçalho conferido', detail: `${filled} linha(s) preenchida(s).` });
        log.push({ state: 'wait', text: 'Validação e gravação no formulário', detail: 'Aguardando a definição das regras de carga. Nada foi gravado.' });
        status(log);
      } catch (err) {
        log[log.length - 1] = { state: 'err', text: 'Não foi possível ler o arquivo', detail: err.message || String(err) }; status(log);
      } finally { running = false; const b = pop?.querySelector('[data-imp="upload"]'); if (b) b.disabled = !file; }
    }

    function action(name, info) {
      if (name === 'close') return close();
      if (name === 'template') return download(info);
      if (name === 'pick') return pop.querySelector('[data-imp="file"]').click();
      if (name === 'upload') return upload(info);
    }
    return { open, close, MONTHS };
  }
  global.VECTON_PLANNING_IMPORT = { createImportPopover, MONTHS };
})(window);
