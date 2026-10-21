(function (global) {
  'use strict';
  function createPlanningModule(deps) {
    const { escapeHtml: esc, callSupabaseRpc: rpc, resolveOrganizationId, openScenarioDreReport, invalidateScenarioCachesFor, onDefaultScenarioChanged } = deps;
    const core = global.VECTON_PLANNING_CORE, months = deps.MONTH_LABELS;
    const views = global.VECTON_PLANNING_VIEWS.createPlanningViews({ escapeHtml: esc, months, canSeeReport: deps.canSeeReport });
    const { fmt, button, field, textInput, steps } = views;
    let org, available, context, container, root, wizard, scenario, formId, tab = 'forms', formTab = 'input', selectedCC = [], entries = [], copied = [], entryIndex = new Map(), copiedIndex = new Map(), accountNumbers = new Map(), changes = new Map(), revision = 0, generation = 0, busy = false, dialogAction, back, active = false;
    const form = () => context?.forms.find(f => f.id === formId);
    const isCapex = () => form()?.form_type === 'capex';
    let capexDepOpen = false, capexItems = [], capexDepreciation = [], capexSort = { field: 'description', direction: 1 }, previewTimer, previewRequest = 0;
    const costCenters = () => isCapex() ? context.capex_cost_centers || context.cost_centers : context.cost_centers;
    const sortedCapexItems = () => capexItems.slice().sort((a,b) => {
      const value = item => capexSort.field === 'type' ? context.capex_types.find(t => t.id === item.type_id)?.name || '' : item.description;
      return capexSort.direction * value(a).localeCompare(value(b), 'pt-BR') || a.id.localeCompare(b.id);
    });
    const lines = () => isCapex() ? sortedCapexItems().map(i => ({ ...i, origin: 'input' })) : (context?.lines || []).filter(l => l.form_id === formId);
    const locked = () => scenario.status === 'locked' || (scenario.lock_at && Date.parse(scenario.lock_at) <= Date.now());
    // Controles de edição (cenário/formulário) só no modo gerenciar, aberto pela engrenagem do cenário.
    let manage = false;
    const admin = () => !!context?.is_admin && manage;
    const inputMonths = () => context.months.filter(m => m.source_type === 'forms').map(m => m.reference_month);
    // Estado entregue às telas (planningViews.js); getters leem as variáveis atuais do módulo.
    const st = {
      get wizard() { return wizard; }, get context() { return context; }, get scenario() { return scenario; }, get formId() { return formId; },
      get tab() { return tab; }, get formTab() { return formTab; }, get selectedCC() { return selectedCC; }, get changes() { return changes; },
      get accountNumbers() { return accountNumbers; },
      get costCenters() { return costCenters(); }, get capexItems() { return sortedCapexItems(); }, get capexDepreciation() { return capexDepreciation; }, get capexDepOpen() { return capexDepOpen; },
      locked, admin, form, lines, inputMonths, key: (l, cc, m) => key(l, cc, m), computed: savedOnly => computed(savedOnly), selectedForms: () => selectedForms()
    };
    const draftKey = () => `vecton-planning:${org}:${context.user_id}:${scenario.id}:${formId}:${selectedCC.join(',')}`;
    function storage(action, key, value) { try { return localStorage[action](key, value); } catch (_) { return null; } }
    async function ensure() {
      if (available !== undefined) return available;
      org = await resolveOrganizationId();
      try { context = await rpc('planning_context', { p_org: org }); available = context?.version === 1; }
      catch (err) { if (/PGRST202|planning_context.*(not find|does not exist)|Could not find the function/i.test(err.message)) available = false; else throw err; }
      return available;
    }
    async function write(action, payload = {}) { return rpc('planning_write', { p_org: org, p_action: action, p_scenario: scenario?.id || null, p_payload: payload }); }
    async function capexWrite(action, payload = {}) { return rpc('planning_capex_write', { p_org: org, p_action: action, p_scenario: scenario.id, p_payload: { form_id: formId, form_revision: revision, ...payload } }); }
    async function refresh(id = scenario?.id) {
      context = await rpc('planning_context', { p_org: org, p_scenario: id || null });
      if (id) scenario = context.scenarios.find(s => s.id === id);
    }
    function mount(target, onBack) { container = target; back = onBack; active = true; }
    async function startWizard(target, onBack, base = null) {
      mount(target, onBack);
      if (!await ensure()) { active = false; container.innerHTML = '<div class="pl-app"><h2>Planejamento participativo</h2><p>A nova criação guiada fica disponível após aplicar a migration 278 em homologação.</p><button class="pl-button" id="pl-unavailable-back">← Cenários</button></div>'; container.querySelector('#pl-unavailable-back').onclick = onBack; return; }
      await refresh(null); scenario = null; formId = null; changes.clear();
      wizard = { step: 0, name: base ? `Cópia de ${base.name}` : '', year: base?.reference_year || deps.state.currentPeriod.year,
        icon: base?.icon || 'vp-icon-cost', color: base?.color || '#4f7cff', base: base?.id || '', months: Array.from({ length: 12 }, () => ({ type: 'forms' })),
        mode: base ? 'copy' : 'new', forms: [], values: false, release: false };
      if (base) await useBase(base.id);
      render();
    }
    async function open(target, s, onBack, opts = {}) { mount(target, onBack); manage = !!opts.manage; scenario = s; wizard = null; formId = null; changes.clear(); tab = 'forms'; await refresh(s.id); render(); }
    // A grade rola dentro da tela: a altura vai até o rodapé da janela, então a barra horizontal fica sempre visível.
    function fitGrid() {
      const box = active && root && root.querySelector('.pl-grid-scroll'); if (!box) return;
      box.style.maxHeight = Math.max(260, innerHeight - box.getBoundingClientRect().top - 12) + 'px';
    }
    function render() {
      if (!active) return;
      const body = wizard ? views.wizard(st) : views.scenario(st);
      container.innerHTML = `<section class="pl-app"><div class="pl-error" role="alert" hidden></div>${body}<dialog class="pl-dialog"></dialog></section>`;
      root = container.querySelector('.pl-app'); fitGrid(); root.onclick = e => { hideTip(); const el = e.target.closest('[data-pl]'); if (el && !el.disabled) void run(() => action(el.dataset.pl, el)); };
      root.onchange = e => void run(() => change(e.target));
      root.oninput = e => {
        if (!e.target.dataset.cell || e.target.disabled) return;
        try { setChange(e.target.dataset.cell, core.parseAmount(e.target.value)); updateGrid(); }
        catch (_) { /* Partial input is validated on blur. */ }
      };
      root.onpaste = paste;
      // Reordenar linhas da Estrutura arrastando a linha inteira; ao soltar, a sequência é renumerada no banco.
      const clearDrop = () => root.querySelectorAll('.pl-drop-before,.pl-drop-after,.pl-row-drag').forEach(n => n.classList.remove('pl-drop-before', 'pl-drop-after', 'pl-row-drag'));
      root.ondragstart = e => {
        const tr = e.target.closest?.('tr[data-line-row]'); if (!tr || tr.draggable === false) return;
        dragLine = tr.dataset.lineRow; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragLine); tr.classList.add('pl-row-drag');
      };
      root.ondragover = e => {
        const tr = e.target.closest?.('tr[data-line-row]'); if (!dragLine || !tr) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        root.querySelectorAll('.pl-drop-before,.pl-drop-after').forEach(n => n.classList.remove('pl-drop-before', 'pl-drop-after'));
        const r = tr.getBoundingClientRect(); tr.classList.add(e.clientY > r.top + r.height / 2 ? 'pl-drop-after' : 'pl-drop-before');
      };
      root.ondrop = e => {
        const tr = e.target.closest?.('tr[data-line-row]'); if (!dragLine || !tr) return;
        e.preventDefault();
        const after = tr.classList.contains('pl-drop-after'), from = dragLine, target = tr.dataset.lineRow; dragLine = null; clearDrop();
        const ids = lines().slice().sort((a, b) => a.seq - b.seq).map(l => l.id).filter(id => id !== from);
        const at = ids.indexOf(target) + (after ? 1 : 0); ids.splice(at, 0, from);
        if (ids.every((id, i) => id === lines().slice().sort((a, b) => a.seq - b.seq)[i].id)) return;
        void run(async () => { await rpc('planning_reorder_lines', { p_org: org, p_scenario: scenario.id, p_form: formId, p_order: ids }); await refresh(); await readForm(); render(); });
      };
      root.ondragend = () => { dragLine = null; clearDrop(); };
      // Tooltip padrão do app (.cockpit-tip), nunca o title nativo.
      root.onpointerover = e => { const n = e.target.closest?.('[data-tip-text]'); if (n) showTip(n.dataset.tipText, e); };
      root.onpointermove = e => { if (e.target.closest?.('[data-tip-text]')) moveTip(e); };
      root.onpointerout = e => { if (e.target.closest?.('[data-tip-text]') && !e.relatedTarget?.closest?.('[data-tip-text]')) hideTip(); };
      root.oncontextmenu = e => {
        const cell = e.target.closest?.('[data-cell]');
        if (!cell || cell.disabled) return;
        e.preventDefault(); void run(() => cellMenu(e, cell));
      };
      root.onfocusin = e => {
        if (e.target.dataset.cell) {
          e.target.dataset.beforeEdit = String(changes.get(e.target.dataset.cell)?.amount ?? entry(e.target.dataset.cell)?.amount ?? 0);
          e.target.dataset.wasDirty = changes.has(e.target.dataset.cell) ? 'yes' : 'no';
        }
      };
      root.onkeydown = e => {
        if (!e.target.dataset.cell) return;
        const fields = [...root.querySelectorAll('[data-cell]:not(:disabled)')], index = fields.indexOf(e.target);
        if (e.key === 'Escape') {
          const value = Number(e.target.dataset.beforeEdit || 0);
          if (e.target.dataset.wasDirty === 'yes') setChange(e.target.dataset.cell, value); else changes.delete(e.target.dataset.cell);
          if (changes.size) storage('setItem', draftKey(), JSON.stringify({ revision, cells: [...changes.values()] })); else storage('removeItem', draftKey());
          e.target.value = fmt(value); updateGrid(); return;
        }
        if (e.key === 'Tab' || (e.key === 'ArrowLeft' && e.target.selectionStart === 0) || (e.key === 'ArrowRight' && e.target.selectionEnd === e.target.value.length)) {
          const direction = e.shiftKey || e.key === 'ArrowLeft' ? -1 : 1;
          if (fields[index + direction]) { e.preventDefault(); fields[index + direction].focus(); }
          return;
        }
        if (['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); const offset = e.key === 'ArrowUp' ? -inputMonths().length : inputMonths().length; fields[index + offset]?.focus(); }
      };
    }
    async function run(fn) {
      if (busy) return; busy = true;
      try { await fn(); } catch (err) { const el = root?.querySelector('.pl-error'); if (el) { el.textContent = friendly(err); el.hidden = false; } }
      finally { busy = false; }
    }
    function friendly(error) { try { return JSON.parse(error.message).message || error.message; } catch (_) { return error.message || String(error); } }
    function modal(title, body, callback, info = false) {
      const dialog = root.querySelector('dialog'); dialogAction = callback;
      dialog.innerHTML = `<div class="pl-dialog-head"><h2>${esc(title)}</h2><button type="button" class="pl-dialog-x" data-pl="dismiss" aria-label="Fechar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>${body}<div class="pl-actions">${info ? button('Entendi', 'dismiss', '', true) : `${button('Cancelar', 'dismiss')}${button('Confirmar', 'confirm', '', true)}`}</div><div class="pl-modal-error" role="alert"></div>`;
      dialog.showModal();
    }
    function close() { root.querySelector('dialog')?.close(); dialogAction = null; }
    async function leave(fn) {
      if (changes.size) { modal('Alterações não salvas', '<p>Salve os valores antes de sair ou confirme para descartar as alterações locais.</p>', async () => { storage('removeItem', draftKey()); changes.clear(); close(); await fn(); }); }
      else await fn();
    }
    function exit() { active = false; generation++; previewRequest++; clearTimeout(previewTimer); changes.clear(); back?.(); }
    function selectedForms() { return context.forms.filter(f => wizard.forms.includes(f.id)); }
    function captureWizard() { if (wizard?.step === 0) { wizard.name = root.querySelector('#pl-name').value.trim(); wizard.year = Number(root.querySelector('#pl-year').value); wizard.color = root.querySelector('#pl-color').value; } }
    async function useBase(id) {
      wizard.base = id; wizard.forms = []; wizard.mode = 'new'; wizard.values = false; wizard.release = false; wizard.months = Array.from({ length: 12 }, () => ({ type: 'forms' }));
      if (id) { const data = await rpc('planning_context', { p_org: org, p_scenario: id }); wizard.months = data.months.length === 12 ? data.months.map(m => ({ type: m.source_type, ...(m.source_type === 'real' ? { year: m.source_year } : m.source_type === 'scenario' ? { scenario_id: m.source_scenario_id } : {}) })) : wizard.months; wizard.forms = data.forms.map(f => f.id); wizard.mode = data.forms.length ? 'copy' : 'new'; }
    }
    function key(l, cc, m) { return [l, cc, m].join('|'); }
    function entry(k) { return entryIndex.get(k); }
    function indexForm() {
      entryIndex = new Map(entries.map(e => [key(e.line_id, e.cost_center_id, e.reference_month), e]));
      copiedIndex = new Map();
      copied.forEach(c => { const k = c.account_number + '|' + c.reference_month; copiedIndex.set(k, (copiedIndex.get(k) || 0) + Number(c.amount)); });
      accountNumbers = new Map((context?.accounts || []).map(a => [a.id, a.account_number]));
    }
    function cellValue(l, m, savedOnly = false) {
      if (!inputMonths().includes(m)) return copiedIndex.get(accountNumbers.get(l.account_id) + '|' + m) || 0;
      return selectedCC.reduce((n, cc) => { const k = key(l.id, cc, m); return n + Number((savedOnly ? null : changes.get(k))?.amount ?? entry(k)?.amount ?? 0); }, 0);
    }
    function computed(savedOnly = false) {
      if (isCapex()) return months.map((_, i) => Object.fromEntries(capexItems.map(item => {
        const k = key(item.id,item.cost_center_id,i+1);
        return [item.id,inputMonths().includes(i+1) ? Number((savedOnly ? null : changes.get(k))?.amount ?? entry(k)?.amount ?? 0) : 0];
      })));
      const calc = core.compile(lines()); return months.map((_, i) => { try { return calc(l => cellValue(l, i + 1, savedOnly)); } catch (err) { return Object.fromEntries(lines().map(l => [l.id, l.origin === 'input' ? cellValue(l, i + 1, savedOnly) : l.origin === 'formula' ? err.message : null])); } });
    }
    async function readForm(id = formId) {
      const request = ++generation;
      clearTimeout(previewTimer); previewRequest++;
      const capex = context.forms.find(f => f.id === id)?.form_type === 'capex';
      const data = await rpc(capex ? 'planning_capex_read' : 'planning_read_form', { p_org: org, p_form: id, p_cc_ids: selectedCC });
      if (request !== generation) return; entries = data.entries; copied = data.copied || [];
      if (capex) { capexItems = data.items; capexDepreciation = data.depreciation; }
      indexForm(); revision = data.revision ?? form().revision;
    }
    async function loadForm(id, targetTab = 'input') {
      formId = id; formTab = targetTab; selectedCC = costCenters().length ? [costCenters()[0].id] : []; changes.clear();
      await readForm(); render();
      const draft = storage('getItem', draftKey());
      if (draft && targetTab === 'input') { try { const data = JSON.parse(draft); if (data.revision === revision && Array.isArray(data.cells)) modal('Recuperar rascunho local?', '<p>Há alterações não salvas neste navegador. A gravação verificará eventuais conflitos.</p>', () => { changes = new Map(data.cells.map(c => [key(c.line_id, c.cost_center_id, c.month), c])); close(); render(); if(isCapex())scheduleCapexPreview(); }); } catch (_) { /* Ignore corrupt browser data. */ } }
    }
    function setChange(k, amount) { if (isCapex() && amount < 0) throw Error('CAPEX aceita apenas valores positivos ou zero para limpar a célula'); const [line_id, cost_center_id, m] = k.split('|'); const base = entry(k); changes.set(k, { line_id, cost_center_id, month: Number(m), amount, version: Number(base?.row_version || 0) }); storage('setItem', draftKey(), JSON.stringify({ revision, cells: [...changes.values()] })); if (isCapex()) scheduleCapexPreview(); }
    function scheduleCapexPreview() {
      clearTimeout(previewTimer); const request = ++previewRequest, id = formId, centers = [...selectedCC];
      const status = root?.querySelector('#pl-capex-preview-state'); if (status) status.textContent = 'Atualizando cálculo…';
      previewTimer = setTimeout(async () => {
        try {
          const data = await rpc('planning_capex_read', { p_org: org, p_form: id, p_cc_ids: centers, p_cells: [...changes.values()] });
          if (!active || id !== formId || request !== previewRequest) return;
          capexDepreciation = data.depreciation;
          const body = root.querySelector('#pl-capex-depreciation'); if (body) body.innerHTML = views.capexFooter(st);
          const label = root.querySelector('#pl-capex-preview-state'); if (label) label.textContent = 'Somente leitura · R$';
        } catch (error) { if (request === previewRequest) { const label = root?.querySelector('#pl-capex-preview-state'); if (label) label.textContent = 'Não foi possível atualizar o cálculo. Salve ou tente novamente.'; } }
      }, 250);
    }
    function updateGrid() {
      const values = computed();
      root.querySelectorAll('[data-value]').forEach(e => { const [id, m] = e.dataset.value.split('|'); e.textContent = typeof values[m][id] === 'number' ? fmt(values[m][id]) : values[m][id]; });
      root.querySelectorAll('[data-total]').forEach(e => e.textContent = values.every(v => typeof v[e.dataset.total] === 'number') ? fmt(values.reduce((n, v) => n + v[e.dataset.total], 0)) : '');
      if (isCapex()) {
        const sums = months.map((_,i) => capexItems.reduce((n,item)=>n+values[i][item.id],0));
        root.querySelectorAll('[data-capex-sum]').forEach(e => e.textContent = fmt(sums[Number(e.dataset.capexSum)]));
        root.querySelector('[data-capex-grand]').textContent = fmt(sums.reduce((a,b)=>a+b,0));
      }
      root.querySelector('#pl-save-state').textContent = `${changes.size} alterações não salvas`;
      root.querySelector('[data-pl="save"]').disabled = !changes.size;
      root.querySelector('[data-pl="discard"]').disabled = !changes.size;
    }
    async function save() {
      if (!changes.size) return;
      const snapshot = [...changes.values()];
      const result = isCapex() ? await capexWrite('save_values', { cells: snapshot }) : await write('save_entries', { form_id: formId, form_revision: revision, cells: snapshot });
      if (isCapex() && !result.ok) { modal('Outra pessoa alterou os valores', '<p>Nenhuma célula deste lote foi salva. Reabra o formulário para atualizar as versões antes de tentar novamente.</p>', async () => { storage('removeItem',draftKey());changes.clear();close();await refresh();await readForm();render(); }); return; }
      if (!result.ok) { modal('Outra pessoa alterou os valores', `<p>Nenhuma célula deste lote foi salva. Os valores na grade serão preservados para revisão.</p><ul>${result.conflicts.map(c => `<li>${esc(lines().find(l => l.id === c.line_id)?.description || '')} · ${months[c.month - 1]}: atual ${fmt(c.current_amount)}, seu valor ${fmt(c.amount)}</li>`).join('')}</ul><p>Confirme para atualizar as versões mantendo sua digitação. Revise e salve novamente para substituir os valores atuais.</p>`, async () => { await readForm(); changes.forEach((c, k) => { c.version = Number(entry(k)?.row_version || 0); }); close(); render(); }); return; }
      snapshot.forEach(c => { const k = key(c.line_id, c.cost_center_id, c.month); if (changes.get(k)?.amount === c.amount) changes.delete(k); });
      if (!changes.size) storage('removeItem', draftKey()); await readForm(); render();
      modal('Valores salvos', '<p>O conteúdo foi salvo, mas ainda não chegou ao DRE nem ao OPEX.</p><p>Para atualizar o DRE e o OPEX, clique em <strong>Integrar no DRE e OPEX</strong>.</p>', null, true);
    }
    async function openFormDialog(f = null) {
      const next = String(Math.max(0,...context.forms.filter(x=>x.form_type!=='capex' && /^\d+$/.test(x.code)).map(x=>Number(x.code)))+1).padStart(2,'0');
      modal(f ? 'Identificação do formulário' : 'Novo formulário', `<div class="pl-columns">${field('Código', textInput('pl-form-code', f?.code || next, f?.form_type === 'capex' ? 'readonly' : ''))}${field('Nome', textInput('pl-form-title', f?.name))}</div>`, async () => { const result = await write('save_form', { ...(f ? { id: f.id, status: f.status } : {}), code: root.querySelector('#pl-form-code').value, name: root.querySelector('#pl-form-title').value }); close(); await refresh(); if (!f) await loadForm(result.id, 'structure'); else render(); });
    }
    function lineDialog(line = null) {
      const l = line || { seq: Math.max(0, ...lines().map(l => l.seq)) + 1, origin: 'input', style: {} };
      modal(line ? 'Editar linha' : 'Adicionar linha', `<div class="pl-columns">${field('Sequência', textInput('pl-line-seq', l.seq, 'type="number" min="1"'))}${field('Origem', `<select class="pl-input" id="pl-line-origin">${[['input', 'Digitado'], ['formula', 'Fórmula'], ['label', 'Linha normal']].map(([v, n]) => `<option value="${v}" ${l.origin === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`)}</div>${field('Conta DRE analítica', `<select id="pl-line-account" class="pl-input"><option value="">Sem conta</option>${context.accounts.map(a => `<option value="${a.id}" ${a.id === l.account_id ? 'selected' : ''}>${esc(a.account_number)} · ${esc(a.account_name)}</option>`).join('')}</select>`)}${field('Descrição', textInput('pl-line-name', l.description))}${field('Expressão (Fórmula)', textInput('pl-line-expression', l.formula_text) + '<small>Use a sequência entre sinais: &lt;1&gt; + &lt;2&gt;. Apenas linhas Digitado ou Fórmula podem ser usadas.</small>')}<label class="pl-choice"><input type="checkbox" id="pl-line-bold" ${l.style?.bold ? 'checked' : ''}>Negrito</label>${line ? button('Excluir linha', 'delete-line', `data-id="${line.id}"`) : ''}<p class="pl-note">Ao mudar a sequência, as fórmulas que usam a sequência anterior são renumeradas automaticamente; a nova sequência precisa estar livre. Após salvar valores, sequência, conta, origem, fórmula e exclusão ficam protegidas no banco.</p>`, async () => {
        const origin = root.querySelector('#pl-line-origin').value;
        const payload = { form_id: formId, ...(line ? { id: line.id } : {}), seq: Number(root.querySelector('#pl-line-seq').value), description: root.querySelector('#pl-line-name').value, origin,
          formula_name: origin === 'label' ? null : String(Number(root.querySelector('#pl-line-seq').value)), formula_text: origin === 'formula' ? root.querySelector('#pl-line-expression').value : null,
          account_id: origin === 'input' ? root.querySelector('#pl-line-account').value : null, group_name: l.group_name || '',
          style: { ...l.style, bold: root.querySelector('#pl-line-bold').checked } };
        // Mudar a sequência renumera as fórmulas das outras linhas (o servidor faz o mesmo).
        const renumber = line && line.origin !== 'label' && line.seq !== payload.seq;
        const others = lines().filter(x => x.id !== line?.id).map(x => (renumber && x.origin === 'formula' ? { ...x, formula_text: core.renumberReferences(x.formula_text, line.seq, payload.seq) } : x));
        core.compile([...others, { ...payload, id: line?.id || 'new' }]);
        await write('save_line', payload); close(); await refresh(); await readForm(); render();
      });
      const accountSelect = root.querySelector('#pl-line-account');
      const descriptionInput = root.querySelector('#pl-line-name');
      const accountName = () => context.accounts.find(a => a.id === accountSelect.value)?.account_name || '';
      let suggestedDescription = accountName();
      accountSelect.addEventListener('change', () => {
        const nextName = accountName();
        if (!descriptionInput.value.trim() || descriptionInput.value === suggestedDescription) descriptionInput.value = nextName;
        suggestedDescription = nextName;
      });
      const originSelect = root.querySelector('#pl-line-origin');
      const updateFields = () => {
        const origin = originSelect.value;
        root.querySelector('#pl-line-account').closest('label').style.display = origin !== 'input' ? 'none' : '';
        root.querySelector('#pl-line-expression').closest('label').style.display = origin !== 'formula' ? 'none' : '';
      };
      originSelect.addEventListener('change', updateFields);
      updateFields();
    }
    function capexTypeDialog(id) {
      const t = context.capex_types.find(x=>x.id===id);
      modal(t ? 'Editar tipo de imobilizado' : 'Novo tipo de imobilizado', `${field('Nome',textInput('pl-type-name',t?.name,'maxlength="150"'))}<div class="pl-columns">${field('Taxa anual (%)',textInput('pl-type-rate',t?.annual_rate ?? '', 'inputmode="decimal"'))}${field('Vida útil (anos)',textInput('pl-type-life',t ? fmt(100/Number(t.annual_rate)) : '', 'readonly'))}</div>${field('Natureza',`<select class="pl-input" id="pl-type-nature"><option value="depreciation">Depreciação</option><option value="amortization" ${t?.nature==='amortization'?'selected':''}>Amortização</option></select>`)}<label class="pl-choice"><input type="checkbox" id="pl-type-active" ${t?.active!==false?'checked':''}>Ativo</label>`, async()=>{
        const rate = core.parseAmount(root.querySelector('#pl-type-rate').value);
        if (rate<=0 || rate>100) throw Error('Informe uma taxa maior que zero e até 100%');
        await capexWrite('save_type',{...(t?{id:t.id,version:t.row_version}:{}),name:root.querySelector('#pl-type-name').value,annual_rate:rate,nature:root.querySelector('#pl-type-nature').value,active:root.querySelector('#pl-type-active').checked});
        close();await refresh();render();
      });
      root.querySelector('#pl-type-rate').oninput=()=>{try{const rate=core.parseAmount(root.querySelector('#pl-type-rate').value);root.querySelector('#pl-type-life').value=rate>0?fmt(100/rate):'';}catch(_){root.querySelector('#pl-type-life').value='';}};
    }
    // Árvore do plano DRE: só contas analíticas são selecionáveis, com o nome ao lado.
    function accountTree(name, selected) {
      const nodes = context.capex_account_tree || [], byParent = new Map();
      nodes.forEach(n => { const k = nodes.some(p => p.id === n.parent) ? n.parent : ''; byParent.set(k, [...(byParent.get(k) || []), n]); });
      const build = n => {
        const kids = (byParent.get(n.id) || []).map(build).filter(Boolean);
        if (n.class === 'Analitica' && n.account_number) return { html: `<label class="pl-tree-leaf" data-text="${esc((n.account_number + ' ' + n.name).toLowerCase())}"><input type="radio" name="${name}" value="${esc(n.account_number)}" ${n.account_number === selected ? 'checked' : ''}><span>${esc(n.account_number)} · ${esc(n.name)}</span></label>`, has: n.account_number === selected };
        if (!kids.length) return null;
        const has = kids.some(k => k.has);
        return { html: `<details ${has ? 'open' : ''}><summary>${esc(n.code)} · ${esc(n.name)}</summary><div class="pl-tree-kids">${kids.map(k => k.html).join('')}</div></details>`, has };
      };
      return `<div class="pl-tree">${(byParent.get('') || []).map(build).filter(Boolean).map(k => k.html).join('') || '<p class="pl-note">Plano de contas DRE indisponível.</p>'}</div>`;
    }
    function capexDestinationDialog(type) {
      const d = views.capexGroups(st).flatMap(g => g.rows).find(x => x.cc_type === type);
      const pick = (id, label, name, value) => `<div class="pl-field"><span>${label}</span>${textInput(id + '-search', '', 'placeholder="Buscar por número ou nome" autocomplete="off"')}${accountTree(name, value)}</div>`;
      modal(`Contas de destino · ${type}`, `${pick('pl-dest-dep', 'Conta de depreciação', 'pl-dest-dep', d.depreciation_account)}${pick('pl-dest-amo', 'Conta de amortização', 'pl-dest-amo', d.amortization_account)}<p class="pl-note">Só contas analíticas e ativas do plano DRE. O próximo Integrar do Capex regrava a depreciação nas novas contas.</p>`, async()=>{
        const chosen = n => root.querySelector(`input[name="${n}"]:checked`)?.value;
        const dep = chosen('pl-dest-dep'), amo = chosen('pl-dest-amo');
        if (!dep || !amo) throw Error('Escolha as contas de depreciação e amortização na árvore');
        await rpc('planning_capex_destination_save',{p_org:org,p_scenario:scenario.id,p_payload:{cc_type:type,version:d.row_version,depreciation_account:dep,amortization_account:amo}});
        close();await refresh();render();
      });
      ['pl-dest-dep','pl-dest-amo'].forEach(id => {
        const box = root.querySelector('#' + id + '-search'), tree = box.parentElement.querySelector('.pl-tree');
        box.oninput = () => {
          const q = box.value.trim().toLowerCase();
          tree.querySelectorAll('.pl-tree-leaf').forEach(l => { l.hidden = !!q && !l.dataset.text.includes(q); });
          tree.querySelectorAll('details').forEach(x => { const any = !!x.querySelector('.pl-tree-leaf:not([hidden])'); x.hidden = !any; if (q) x.open = any; });
        };
      });
    }
    function capexItemDialog() {
      const types = context.capex_types.filter(t=>t.active);
      modal('Adicionar investimento',`${field('Investimento',textInput('pl-item-name','','maxlength="250"'))}${field('Tipo de imobilizado',`<select class="pl-input" id="pl-item-type">${types.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>`)}`,async()=>{
        await capexWrite('save_item',{description:root.querySelector('#pl-item-name').value,type_id:root.querySelector('#pl-item-type').value,cost_center_id:selectedCC[0]});
        close();await refresh();await readForm();render();
      });
    }
    async function action(name, el) {
      const d = el.dataset;
      switch (name) {
        case 'exit': return leave(exit);
        case 'dismiss': return close();
        case 'confirm': try { return await dialogAction?.(); } catch (err) { root.querySelector('.pl-modal-error').textContent = friendly(err); return; }
        case 'wizard-icon': captureWizard(); wizard.icon = d.icon; return render();
        case 'step': captureWizard(); wizard.step = Number(d.index); return render();
        case 'prev': captureWizard(); wizard.step--; return render();
        case 'next': {
          captureWizard(); if (!wizard.name || !Number.isInteger(wizard.year) || wizard.year < 2000 || wizard.year > 2200) throw Error('Informe nome e ano válidos');
          if (wizard.step < steps.length - 1) { wizard.step++; return render(); }
          const forms = selectedForms().map(f => ({ code: f.code, name: f.name, source_form_id: f.id, copy_values: wizard.values, copy_access: true, status: wizard.release ? 'released' : 'draft' }));
          const result = await write('create', { name: wizard.name, year: wizard.year, color: wizard.color, icon: wizard.icon, months: wizard.months, forms, base_scenario_id: wizard.base || null });
          wizard = null; await refresh(result.id); scenario = context.scenarios.find(s => s.id === result.id); render(); return;
        }
        case 'zero-months': wizard.months = Array.from({ length: 12 }, () => ({ type: 'forms' })); return render();
        case 'mixed-months': wizard.months = months.map((_, i) => i < 5 ? { type: 'real', year: wizard.year } : { type: 'forms' }); return render();
        case 'copy-scenario': return leave(() => startWizard(container, back, scenario));
        case 'lock': return modal(locked() ? 'Desbloquear cenário?' : 'Bloquear cenário', locked() ? '<p>O cenário voltará a aceitar alterações autorizadas.</p>' : `<p>Deixe a data vazia para bloquear imediatamente ou programe o bloqueio.</p>${field('Data e hora do bloqueio', textInput('pl-lock-at', '', 'type="datetime-local"'))}`, async () => { const date = root.querySelector('#pl-lock-at')?.value; await write('lock', { locked: locked() ? false : !date, lock_at: date ? new Date(date).toISOString() : null }); close(); await refresh(); render(); });
        case 'tab': tab = d.tab; return render();
        case 'report': return leave(() => { active = false; deps.openScenarioReport(scenario.id, d.report); });
        case 'dre': return leave(() => { active = false; openScenarioDreReport(scenario.id); });
        case 'new-form': return openFormDialog();
        case 'capex-type': return capexTypeDialog(d.id);
        case 'capex-destination': return capexDestinationDialog(d.id);
        case 'capex-delete-type': return modal('Excluir tipo de imobilizado?','<p>Tipos em uso só podem ser desativados.</p>',async()=>{const t=context.capex_types.find(x=>x.id===d.id);await capexWrite('delete_type',{id:t.id,version:t.row_version});close();await refresh();render();});
        case 'capex-add': return leave(capexItemDialog);
        case 'capex-duplicate': return leave(async()=>{const item=capexItems.find(i=>i.id===d.id);await capexWrite('duplicate_item',{id:item.id,version:item.row_version});await refresh();await readForm();render();});
        case 'capex-delete': return leave(()=>modal('Excluir investimento?','<p>O investimento e seus valores serão excluídos. Integre novamente para atualizar o DRE.</p>',async()=>{const item=capexItems.find(i=>i.id===d.id);await capexWrite('delete_item',{id:item.id,version:item.row_version});close();await refresh();await readForm();render();}));
        case 'capex-sort': capexSort={field:d.sort,direction:capexSort.field===d.sort?-capexSort.direction:1};return render();
        case 'edit-form': return openFormDialog(form());
        case 'capex-toggle-dep': capexDepOpen = !capexDepOpen; return render();
        case 'open-form': capexDepOpen = false; return loadForm(d.id);
        case 'configure': return loadForm(d.id, 'structure');
        case 'index': return leave(() => { formId = null; render(); });
        case 'form-tab': return leave(async () => { changes.clear(); formTab = d.tab; await readForm(); render(); });
        case 'new-line': return lineDialog();
        case 'edit-line': return lineDialog(lines().find(l => l.id === d.id));
        case 'delete-line': return modal('Excluir linha?', '<p>A operação será recusada se houver valores ou fórmulas dependentes.</p>', async () => { await write('delete_line', { form_id: formId, id: d.id }); close(); await refresh(); render(); });
        case 'release': await write('save_form', { ...form(), status: form().status === 'draft' ? 'released' : 'draft' }); await refresh(); return render();
        case 'save': return save();
        case 'discard': storage('removeItem', draftKey()); changes.clear(); if(isCapex()){await readForm();} return render();
        case 'project': return modal(`Integrar ao DRE e OPEX do "${scenario.name}"?`, `<p>Integra os valores projetados nos formulários de OPEX e CAPEX ao DRE e demais relatórios derivados.</p>${changes.size ? '<p class="pl-note">Sua digitação não salva não será incluída.</p>' : ''}`, async () => {
          const result = await rpc('planning_integrate_all', { p_org: org, p_scenario: scenario.id, p_form: formId });
          invalidateScenarioCachesFor?.(scenario.id, scenario.reference_year);
          if (!result.ok) { await refresh(); throw Error(result.error || 'Falha na integração'); }
          close(); await refresh(); render();
          const notes = result.notes || [], skipped = result.capex?.skipped_items || 0;
          global.VECTON_DIALOGS?.showToast?.(`Integração concluída · ${result.rows_written} linhas${skipped ? ` · ${skipped} itens do CAPEX incompletos ignorados` : ''}${notes.length ? ` · ${notes.join('; ')}` : ''}`, skipped || notes.length ? 'warning' : 'success');
        });
        case 'clear': return modal('Apagar os valores deste formulário?', '<p>Todos os centros serão zerados. O DRE só será atualizado após uma nova integração.</p>', async () => { await write('clear_entries', { form_id: formId, confirmation: 'APAGAR' }); storage('removeItem', draftKey()); changes.clear(); close(); await readForm(); render(); });
        case 'copy-form': { const all = await rpc('planning_context', { p_org: org }); return modal('Copiar estrutura', `${field('Origem', `<select id="pl-copy-form" class="pl-input">${all.forms.filter(f => f.id !== formId && f.form_type !== 'capex').map(f => `<option value="${f.id}">${esc(all.scenarios.find(s => s.id === f.scenario_id)?.name || '')} / ${esc(f.code)} · ${esc(f.name)}</option>`).join('')}</select>`)}${field('Código no destino', textInput('pl-copy-code'))}${field('Nome', textInput('pl-copy-name'))}<p>Valores e acessos não são copiados.</p>`, async () => { await write('copy_form', { source_form_id: root.querySelector('#pl-copy-form').value, code: root.querySelector('#pl-copy-code').value, name: root.querySelector('#pl-copy-name').value }); close(); await refresh(); formId = null; render(); }); }
        case 'import': return modal('Importar contas DRE', `<p>Selecione contas analíticas para criar linhas digitadas.</p>${context.accounts.filter(a => !lines().some(l => l.account_id === a.id)).map(a => `<label class="pl-choice"><input type="checkbox" data-import="${a.id}">${esc(a.account_number)} · ${esc(a.account_name)}</label>`).join('')}`, async () => {
          // One server transaction for the entire selection.
          await write('import_accounts', { form_id: formId, account_ids: [...root.querySelectorAll('[data-import]:checked')].map(e => e.dataset.import) }); close(); await refresh(); await readForm(); render();
        });
        case 'export': return exportExcel();
      }
    }
    async function change(el) {
      if (el.dataset.capexItem && !el.disabled) {
        const item=capexItems.find(i=>i.id===el.dataset.capexItem);
        try {
          await capexWrite('save_item',{id:item.id,version:item.row_version,cost_center_id:item.cost_center_id,type_id:el.dataset.capexField==='type_id'?el.value:item.type_id,description:el.dataset.capexField==='description'?el.value:item.description});
          await refresh();await readForm();
          if(changes.size){storage('setItem',draftKey(),JSON.stringify({revision,cells:[...changes.values()]}));scheduleCapexPreview();}
          render();
        } catch(error){render();throw error;}
      }
      else if (el.id === 'pl-base') { await useBase(el.value); render(); }
      else if (el.name === 'pl-base') { await useBase(''); render(); }
      else if (el.dataset.month !== undefined) wizard.months[Number(el.dataset.month)] = core.sourcePayload(el.value);
      else if (el.name === 'pl-values') wizard.values = el.value === 'copy';
      else if (el.name === 'pl-release') wizard.release = el.value === 'released';
      else if (el.dataset.access !== undefined) {
        // Acessos salvam ao alterar, sem botão: grava o conjunto e avisa com um toast rápido.
        const access = [...root.querySelectorAll('[data-access]')].filter(e => e.value !== 'none').map(e => ({ user_id: e.dataset.access, access_mode: e.value }));
        try { await write('save_access', { form_id: formId, access }); global.VECTON_DIALOGS?.showToast?.('Acesso atualizado', 'success', { duration: 2200 }); await refresh(); }
        catch (err) { await refresh(); render(); throw err; }
      }
      else if (el.dataset.cc) { const next = el.checked ? [...selectedCC, el.dataset.cc] : selectedCC.filter(id => id !== el.dataset.cc); await leave(async () => { changes.clear(); selectedCC = next; await readForm(); render(); }); }
      else if (el.dataset.cell && !el.disabled) {
        try { setChange(el.dataset.cell, core.parseAmount(el.value)); } catch (err) { el.value = fmt(changes.get(el.dataset.cell)?.amount ?? entry(el.dataset.cell)?.amount ?? 0); throw err; }
        el.value = fmt(changes.get(el.dataset.cell).amount); updateGrid();
      }
    }
    let tipEl = null, dragLine = null;
    function showTip(text, e) {
      if (!tipEl || !document.body.contains(tipEl)) { tipEl = document.createElement('div'); tipEl.className = 'cockpit-tip'; document.body.appendChild(tipEl); }
      tipEl.innerHTML = `<div class="cockpit-tip-row"><strong>${esc(text)}</strong></div>`; tipEl.hidden = false; moveTip(e);
    }
    function moveTip(e) { if (!tipEl) return; tipEl.style.left = `${Math.min(e.clientX + 14, innerWidth - (tipEl.offsetWidth || 120) - 8)}px`; tipEl.style.top = `${Math.max(e.clientY - 44, 8)}px`; }
    function hideTip() { if (tipEl) tipEl.hidden = true; }
    // Menu de clique direito da célula: repetir até dezembro, distribuir e colar valor.
    function closeCellMenu() { document.querySelector('.pl-ctx')?.remove(); }
    async function clipboardAmount() {
      try {
        const raw = (await navigator.clipboard.readText()).trim();
        return raw && !/[\t\n]/.test(raw) ? core.parseAmount(raw) : null;
      } catch (_) { return null; }
    }
    async function cellMenu(e, cell) {
      closeCellMenu();
      const [lineId, , month] = cell.dataset.cell.split('|'), k = cell.dataset.cell, m = Number(month);
      const current = () => changes.get(k)?.amount ?? entry(k)?.amount ?? 0;
      const following = inputMonths().filter(x => x >= m), pasted = await clipboardAmount();
      const items = [
        ['Repetir até dezembro', true, () => inputMonths().filter(x => x > m).forEach(x => setChange(key(lineId, selectedCC[0], x), current()))],
        ['Distribuir entre os meses', true, () => core.distribute(current(), following.length).forEach((v, i) => setChange(key(lineId, selectedCC[0], following[i]), v))],
        ['Colar valor' + (pasted === null ? '' : ` (${fmt(pasted)})`), pasted !== null, () => setChange(k, pasted)]
      ];
      const menu = document.createElement('div'); menu.className = 'pl-ctx'; menu.setAttribute('role', 'menu');
      items.forEach(([label, enabled, apply]) => {
        const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = label; b.disabled = !enabled;
        b.onclick = () => { closeCellMenu(); void run(async () => { apply(); render(); }); };
        menu.appendChild(b);
      });
      document.body.appendChild(menu);
      // Canto inferior esquerdo do menu no canto superior direito da célula (na diagonal).
      const r = cell.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(r.right, innerWidth - menu.offsetWidth - 8)) + 'px'; menu.style.top = Math.max(8, Math.min(r.top - menu.offsetHeight, innerHeight - menu.offsetHeight - 8)) + 'px';
      const off = ev => { if (ev.type === 'keydown' && ev.key !== 'Escape') return; if (ev.target.closest?.('.pl-ctx')) return; closeCellMenu(); ['pointerdown', 'keydown', 'scroll', 'resize'].forEach(t => removeEventListener(t, off, true)); };
      ['pointerdown', 'keydown', 'scroll', 'resize'].forEach(t => addEventListener(t, off, true));
    }
    function paste(e) {
      if (!e.target.dataset.cell || e.target.disabled) return; const raw = e.clipboardData.getData('text'); if (!/[\t\n]/.test(raw)) return;
      e.preventDefault(); const [lineId, , month] = e.target.dataset.cell.split('|'), start = lines().findIndex(l => l.id === lineId), batch = [];
      try { raw.replace(/\r/g, '').split('\n').forEach((row, r) => row.split('\t').forEach((v, c) => { const l = lines()[start + r], m = Number(month) + c; if (l?.origin === 'input' && inputMonths().includes(m) && v.trim()) batch.push([key(l.id, selectedCC[0], m), core.parseAmount(v)]); })); if(isCapex() && batch.some(([,amount])=>amount<0)) throw Error('CAPEX não aceita valores negativos'); batch.forEach(([k, amount]) => setChange(k, amount)); render(); }
      catch (err) { const el = root.querySelector('.pl-error'); el.textContent = 'Bloco recusado: ' + err.message; el.hidden = false; }
    }
    async function exportExcel() {
      if (!global.ExcelJS) throw Error('Biblioteca de exportação indisponível');
      if (isCapex()) return exportCapexExcel();
      const workbook = new global.ExcelJS.Workbook(), sheet = workbook.addWorksheet('Planejamento'), values = computed(true);
      sheet.addRow([scenario.name, form().name]); sheet.addRow(['Centros', ...context.cost_centers.filter(c => selectedCC.includes(c.id)).map(c => c.cost_center_name)]); sheet.addRow(['Linha', ...months, 'Total']);
      lines().forEach(l => { const row = months.map((_, i) => values[i][l.id]); sheet.addRow([l.description, ...row, row.reduce((n, v) => n + (typeof v === 'number' ? v : 0), 0)]); }); sheet.getColumn(1).width = 40;
      const blob = new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `${scenario.name}-${form().code}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    async function exportCapexExcel() {
      const data=await rpc('planning_capex_read',{p_org:org,p_form:formId,p_cc_ids:selectedCC});
      const workbook=new global.ExcelJS.Workbook(),sheet=workbook.addWorksheet('CAPEX');
      sheet.addRow([scenario.name,form().name]);sheet.addRow(['Investimento','Centro de custo','Tipo de imobilizado',...months,'Total']);
      const sums=Array(12).fill(0);
      data.items.forEach(item=>{
        const cc=costCenters().find(c=>c.id===item.cost_center_id),type=context.capex_types.find(t=>t.id===item.type_id);
        const vals=months.map((_,i)=>inputMonths().includes(i+1)?data.entries.filter(e=>e.line_id===item.id&&e.reference_month===i+1).reduce((n,e)=>n+Number(e.amount),0):0);
        vals.forEach((v,i)=>sums[i]+=v);sheet.addRow([item.description,`${cc?.cost_center_number || ''} · ${cc?.cost_center_name || ''}`,type?.name || '',...vals,vals.reduce((a,b)=>a+b,0)]);
      });
      sheet.addRow(['Total de investimentos','','',...sums,sums.reduce((a,b)=>a+b,0)]);sheet.addRow([]);sheet.addRow(['Depreciação e amortização incremental']);sheet.addRow(['Conta / descrição','','',...months,'Total']);
      const grand=Array(12).fill(0);
      for(const g of views.capexGroups(st)){
        sheet.addRow([g.name]);const sub=Array(12).fill(0);
        [['depreciation_account','Depreciação'],['amortization_account','Amortização']].forEach(([field,label])=>{const accounts=[...new Set(g.rows.map(d=>d[field]))];const vals=months.map((_,i)=>data.depreciation.filter(d=>accounts.includes(d.account_number)&&d.reference_month===i+1).reduce((n,d)=>n+Number(d.amount),0));vals.forEach((v,i)=>{sub[i]+=v;grand[i]+=v;});sheet.addRow([`${accounts.join(' / ')} · ${label}`,'','',...vals,vals.reduce((a,b)=>a+b,0)]);});
        sheet.addRow([`Subtotal ${g.name.toLowerCase()}`,'','',...sub,sub.reduce((a,b)=>a+b,0)]);
      }
      sheet.addRow(['Total depreciação e amortização do CAPEX','','',...grand,grand.reduce((a,b)=>a+b,0)]);
      sheet.getColumn(1).width=44;sheet.getColumn(2).width=30;sheet.getColumn(3).width=30;
      for(let i=4;i<=16;i++){sheet.getColumn(i).width=16;sheet.getColumn(i).numFmt='#,##0.00';}
      const blob=new Blob([await workbook.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${scenario.name}-CPX.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    ['scroll', 'resize'].forEach(t => global.addEventListener(t, fitGrid, { passive: true }));
    global.addEventListener('beforeunload', e => { if (active && changes.size) { e.preventDefault(); e.returnValue = ''; } });
    return { ensure, getContext: () => context, hasUnsaved: () => active && changes.size > 0, discardDraft() { if (context && scenario && formId) storage('removeItem', draftKey()); changes.clear(); }, startWizard, open, isActive: () => active, render, reset() { active = false; manage = false; available = undefined; context = null; changes.clear(); generation++; }, async remove(s) { await rpc('planning_write', { p_org: org, p_action: 'delete_scenario', p_scenario: s.id, p_payload: { confirmation: 'REMOVER' } }); }, async lock(s, locked) { await rpc('planning_write', { p_org: org, p_action: 'lock', p_scenario: s.id, p_payload: { locked, lock_at: null } }); }, async setColor(s, color) { await rpc('planning_set_scenario_color', { p_org: org, p_scenario: s.id, p_color: color }); }, async favorite(id, enabled) { await rpc('planning_write', { p_org: org, p_action: 'favorite', p_scenario: id, p_payload: { enabled } }); onDefaultScenarioChanged?.(); } };
  }
  global.VECTON_PLANNING = { createPlanningModule };
})(window);
