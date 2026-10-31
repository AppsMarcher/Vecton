(function (global) {
  'use strict';
  // Popover de importação de um formulário: baixar template, selecionar o Excel, enviar e acompanhar o status.
  // O popover só lê a planilha e monta as linhas; quem valida e grava é a função `info.send(rows)` (RPC do formulário).
  // Qualquer erro bloqueia o arquivo inteiro e o painel lista cada linha com o aviso.
  const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const MAX_ERRORS_SHOWN = 30;
  const norm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

  // Mesmo critério de `parseLocalizedAmount` (src/core/utils.js): número do Excel como está; texto com ponto de milhar e vírgula decimal.
  function normalizeAmount(value) {
    if (value && typeof value === 'object' && !(value instanceof Date)) value = value.result ?? value.text ?? '';
    if (value === null || value === undefined || String(value).trim() === '') return '';
    const n = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : String(value).trim();
  }

  const cellText = v => v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'object' ? String(v.text ?? v.result ?? (v.richText || []).map(t => t.text).join('')) : String(v);

  function createImportPopover({ esc, scenarioName }) {
    let pop, anchor, file, running = false, steps = [];

    function status(list) { steps = list; const box = pop?.querySelector('[data-imp="status"]'); if (box) box.innerHTML = statusHtml(); }
    function statusHtml() {
      if (!steps.length) return '<p class="pl-imp-idle">Baixe o template, selecione o Excel preenchido e envie o arquivo.</p>';
      const mark = { ok: '✓', err: '✕', run: '…', wait: '•' };
      return `<ol class="pl-imp-steps">${steps.map(s => `<li class="pl-imp-${s.state}"><span aria-hidden="true">${mark[s.state]}</span><div><strong>${esc(s.text)}</strong>${s.detail ? `<small>${esc(s.detail)}</small>` : ''}${(s.items || []).map(i => `<small>${esc(i)}</small>`).join('')}</div></li>`).join('')}</ol>`;
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
      document.querySelectorAll('.pl-import-backdrop').forEach(el => el.remove());
      document.removeEventListener('mousedown', onOutside, true); document.removeEventListener('keydown', onKey, true);
    }
    const onOutside = e => { if (pop && !pop.contains(e.target) && !anchor?.contains(e.target)) close(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };

    function open(button, info) {
      const same = pop && anchor === button; close(); if (same) return;
      anchor = button; file = null; steps = [];
      pop = document.createElement('div'); pop.className = 'pl-import-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Importar formulário');
      const backdrop = document.createElement('div'); backdrop.className = 'pl-import-backdrop'; document.body.appendChild(backdrop);
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

    // info.columns: [{ key, label, required, aliases? }]; info.slug: nome do arquivo; info.sheet: nome da aba.
    async function download(info) {
      if (!global.ExcelJS) { status([{ state: 'err', text: 'Biblioteca de Excel indisponível' }]); return; }
      const wb = new global.ExcelJS.Workbook(), ws = wb.addWorksheet(info.sheet || 'Importação');
      ws.addRow(info.columns.map(c => c.label)); ws.getRow(1).font = { bold: true };
      info.columns.forEach((_, i) => { ws.getColumn(i + 1).width = 22; });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      const blob = new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE }), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `template-${info.slug}-${scenarioName()}.xlsx`.replace(/\s+/g, '-'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      status([{ state: 'ok', text: 'Template baixado', detail: 'Preencha uma linha por lançamento e salve o arquivo.' }]);
    }

    // Lê a planilha: cabeçalho por nome (sem acento e sem diferença de maiúsculas), linhas em branco ignoradas.
    async function readRows(info) {
      if (!global.ExcelJS) throw Error('Biblioteca de Excel indisponível');
      const wb = new global.ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw Error('O arquivo não tem nenhuma planilha.');
      const head = {}; ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => { const k = norm(cellText(cell.value)); if (k && !(k in head)) head[k] = col; });
      const index = Object.fromEntries(info.columns.map(c => [c.key, head[norm(c.label)] ?? (c.aliases || []).map(a => head[norm(a)]).find(Boolean)]));
      const missing = info.columns.filter(c => c.required && !index[c.key]).map(c => c.label);
      if (missing.length) throw Object.assign(Error(`Faltam colunas no cabeçalho: ${missing.join(', ')}. Baixe o template e use-o como base.`), { header: true });
      const rows = [];
      ws.eachRow((row, n) => {
        if (n === 1) return;
        const item = { row: n }; let any = false;
        info.columns.forEach(c => { const raw = index[c.key] ? row.getCell(index[c.key]).value : null; item[c.key] = raw; if (cellText(raw).trim() !== '') any = true; });
        if (any) rows.push(item);
      });
      return { rows, sheet: ws.name };
    }

    async function upload(info) {
      if (!file || running) return;
      running = true; pop.querySelector('[data-imp="upload"]').disabled = true;
      const log = [{ state: 'ok', text: 'Arquivo selecionado', detail: file.name }, { state: 'run', text: 'Lendo o arquivo' }];
      status(log);
      try {
        const { rows, sheet } = await readRows(info);
        log[1] = { state: 'ok', text: 'Arquivo lido', detail: `Planilha “${sheet}” · ${rows.length} linha(s) preenchida(s)` };
        if (!rows.length) { log.push({ state: 'err', text: 'O arquivo não tem linhas de dados', detail: 'Preencha ao menos uma linha abaixo do cabeçalho.' }); return status(log); }
        log.push({ state: 'run', text: 'Validando e importando' }); status(log);
        const result = await info.send(rows);
        if (result.ok) {
          log[2] = { state: 'ok', text: 'Importação concluída', detail: result.summary || `${result.replaced ?? 0} valor(es) substituído(s) e ${result.inserted ?? 0} incluído(s).` };
        } else {
          const errors = result.errors || [], shown = errors.slice(0, MAX_ERRORS_SHOWN).map(e => e.message);
          if (errors.length > shown.length) shown.push(`… e mais ${errors.length - shown.length} erro(s).`);
          log[2] = { state: 'err', text: `O arquivo tem ${errors.length} erro(s) e nada foi importado`, detail: 'Corrija as linhas indicadas no Excel e envie o arquivo de novo.', items: shown };
        }
        status(log);
      } catch (err) {
        log[log.length - 1] = { state: 'err', text: err.header ? 'Cabeçalho diferente do template' : 'Não foi possível importar o arquivo', detail: err.message || String(err) }; status(log);
      } finally { running = false; const b = pop?.querySelector('[data-imp="upload"]'); if (b) b.disabled = !file; }
    }

    function action(name, info) {
      if (name === 'close') return close();
      if (name === 'template') return download(info);
      if (name === 'pick') return pop.querySelector('[data-imp="file"]').click();
      if (name === 'upload') return upload(info);
    }
    return { open, close };
  }
  global.VECTON_PLANNING_IMPORT = { createImportPopover, normalizeAmount, cellText, MONTHS };
})(window);
