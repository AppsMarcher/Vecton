(function (global) {
  'use strict';
  function createPlanningModule(deps) {
    const { escapeHtml: esc, callSupabaseRpc: rpc, resolveOrganizationId, openScenarioDreReport, invalidateScenarioCachesFor, onDefaultScenarioChanged } = deps;
    const core = global.VECTON_PLANNING_CORE, months = deps.MONTH_LABELS;
    const views = global.VECTON_PLANNING_VIEWS.createPlanningViews({ escapeHtml: esc, months });
    const { fmt, button, field, textInput, steps } = views;
    let org, available, context, container, root, wizard, scenario, formId, tab = 'forms', formTab = 'input', selectedCC = [], entries = [], copied = [], entryIndex = new Map(), copiedIndex = new Map(), accountNumbers = new Map(), changes = new Map(), revision = 0, generation = 0, busy = false, dialogAction, back, active = false;
    const form = () => context?.forms.find(f => f.id === formId);
    const lines = () => (context?.lines || []).filter(l => l.form_id === formId);
    const locked = () => scenario.status === 'locked' || (scenario.lock_at && Date.parse(scenario.lock_at) <= Date.now());
    const admin = () => context?.is_admin;
    const inputMonths = () => context.months.filter(m => m.source_type === 'forms').map(m => m.reference_month);
    // Estado entregue às telas (planningViews.js); getters leem as variáveis atuais do módulo.
    const st = {
      get wizard() { return wizard; }, get context() { return context; }, get scenario() { return scenario; }, get formId() { return formId; },
      get tab() { return tab; }, get formTab() { return formTab; }, get selectedCC() { return selectedCC; }, get changes() { return changes; },
      get accountNumbers() { return accountNumbers; },
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
    async function open(target, s, onBack) { mount(target, onBack); scenario = s; wizard = null; formId = null; changes.clear(); tab = 'forms'; await refresh(s.id); render(); }
    function render() {
      if (!active) return;
      const body = wizard ? views.wizard(st) : views.scenario(st);
      container.innerHTML = `<section class="pl-app"><div class="pl-error" role="alert" hidden></div>${body}<dialog class="pl-dialog"></dialog></section>`;
      root = container.querySelector('.pl-app'); root.onclick = e => { const el = e.target.closest('[data-pl]'); if (el && !el.disabled) void run(() => action(el.dataset.pl, el)); };
      root.onchange = e => void run(() => change(e.target));
      root.oninput = e => {
        if (!e.target.dataset.cell || e.target.disabled) return;
        try { setChange(e.target.dataset.cell, core.parseAmount(e.target.value)); updateGrid(); }
        catch (_) { /* Partial input is validated on blur. */ }
      };
      root.onpaste = paste;
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
    function modal(title, body, callback) {
      const dialog = root.querySelector('dialog'); dialogAction = callback;
      dialog.innerHTML = `<h2>${esc(title)}</h2>${body}<div class="pl-actions">${button('Cancelar', 'dismiss')}${button('Confirmar', 'confirm', '', true)}</div><div class="pl-modal-error" role="alert"></div>`;
      dialog.showModal();
    }
    function close() { root.querySelector('dialog')?.close(); dialogAction = null; }
    async function leave(fn) {
      if (changes.size) { modal('Alterações não salvas', '<p>Salve os valores antes de sair ou confirme para descartar as alterações locais.</p>', async () => { storage('removeItem', draftKey()); changes.clear(); close(); await fn(); }); }
      else await fn();
    }
    function exit() { active = false; generation++; changes.clear(); back?.(); }
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
    function computed(savedOnly = false) { const calc = core.compile(lines()); return months.map((_, i) => { try { return calc(l => cellValue(l, i + 1, savedOnly)); } catch (err) { return Object.fromEntries(lines().map(l => [l.id, l.origin === 'input' ? cellValue(l, i + 1, savedOnly) : l.origin === 'formula' ? err.message : null])); } }); }
    async function readForm(id = formId) {
      const request = ++generation;
      const data = await rpc('planning_read_form', { p_org: org, p_form: id, p_cc_ids: selectedCC });
      if (request !== generation) return; entries = data.entries; copied = data.copied; indexForm(); revision = form().revision;
    }
    async function loadForm(id, targetTab = 'input') {
      formId = id; formTab = targetTab; selectedCC = context.cost_centers.length ? [context.cost_centers[0].id] : []; changes.clear();
      await readForm(); render();
      const draft = storage('getItem', draftKey());
      if (draft && targetTab === 'input') { try { const data = JSON.parse(draft); if (data.revision === revision && Array.isArray(data.cells)) modal('Recuperar rascunho local?', '<p>Há alterações não salvas neste navegador. A gravação verificará eventuais conflitos.</p>', () => { changes = new Map(data.cells.map(c => [key(c.line_id, c.cost_center_id, c.month), c])); close(); render(); }); } catch (_) { /* Ignore corrupt browser data. */ } }
    }
    function setChange(k, amount) { const [line_id, cost_center_id, m] = k.split('|'); const base = entry(k); changes.set(k, { line_id, cost_center_id, month: Number(m), amount, version: Number(base?.row_version || 0) }); storage('setItem', draftKey(), JSON.stringify({ revision, cells: [...changes.values()] })); }
    function updateGrid() {
      const values = computed();
      root.querySelectorAll('[data-value]').forEach(e => { const [id, m] = e.dataset.value.split('|'); e.textContent = typeof values[m][id] === 'number' ? fmt(values[m][id]) : values[m][id]; });
      root.querySelectorAll('[data-total]').forEach(e => e.textContent = values.every(v => typeof v[e.dataset.total] === 'number') ? fmt(values.reduce((n, v) => n + v[e.dataset.total], 0)) : '');
      root.querySelector('#pl-save-state').textContent = `${changes.size} alterações não salvas`;
      root.querySelector('[data-pl="save"]').disabled = !changes.size;
      root.querySelector('[data-pl="discard"]').disabled = !changes.size;
    }
    async function save() {
      if (!changes.size) return;
      const snapshot = [...changes.values()];
      const result = await write('save_entries', { form_id: formId, form_revision: revision, cells: snapshot });
      if (!result.ok) { modal('Outra pessoa alterou os valores', `<p>Nenhuma célula deste lote foi salva. Os valores na grade serão preservados para revisão.</p><ul>${result.conflicts.map(c => `<li>${esc(lines().find(l => l.id === c.line_id)?.description || '')} · ${months[c.month - 1]}: atual ${fmt(c.current_amount)}, seu valor ${fmt(c.amount)}</li>`).join('')}</ul><p>Confirme para atualizar as versões mantendo sua digitação. Revise e salve novamente para substituir os valores atuais.</p>`, async () => { await readForm(); changes.forEach((c, k) => { c.version = Number(entry(k)?.row_version || 0); }); close(); render(); }); return; }
      snapshot.forEach(c => { const k = key(c.line_id, c.cost_center_id, c.month); if (changes.get(k)?.amount === c.amount) changes.delete(k); });
      if (!changes.size) storage('removeItem', draftKey()); await readForm(); render();
    }
    async function openFormDialog(f = null) {
      modal(f ? 'Identificação do formulário' : 'Novo formulário', `<div class="pl-columns">${field('Código', textInput('pl-form-code', f?.code))}${field('Nome', textInput('pl-form-title', f?.name))}</div>`, async () => { const result = await write('save_form', { ...(f ? { id: f.id, status: f.status } : {}), code: root.querySelector('#pl-form-code').value, name: root.querySelector('#pl-form-title').value }); close(); await refresh(); if (!f) await loadForm(result.id, 'structure'); else render(); });
    }
    function lineDialog(line = null) {
      const l = line || { seq: Math.max(0, ...lines().map(l => l.seq)) + 1, origin: 'input', style: {} };
      modal(line ? 'Editar linha' : 'Adicionar linha', `<div class="pl-columns">${field('Sequência', textInput('pl-line-seq', l.seq, 'type="number" min="1"'))}${field('Origem', `<select class="pl-input" id="pl-line-origin">${[['input', 'Digitado'], ['formula', 'Fórmula'], ['label', 'Linha normal']].map(([v, n]) => `<option value="${v}" ${l.origin === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`)}</div>${field('Conta DRE analítica', `<select id="pl-line-account" class="pl-input"><option value="">Sem conta</option>${context.accounts.map(a => `<option value="${a.id}" ${a.id === l.account_id ? 'selected' : ''}>${esc(a.account_number)} · ${esc(a.account_name)}</option>`).join('')}</select>`)}${field('Descrição', textInput('pl-line-name', l.description))}${field('Expressão (Fórmula)', textInput('pl-line-expression', l.formula_text) + '<small>Use a sequência entre sinais: &lt;1&gt; + &lt;2&gt;. Apenas linhas Digitado ou Fórmula podem ser usadas.</small>')}${field('Agrupamento visual', textInput('pl-line-group', l.group_name))}<label class="pl-choice"><input type="checkbox" id="pl-line-bold" ${l.style?.bold ? 'checked' : ''}>Negrito</label>${line ? button('Excluir linha', 'delete-line', `data-id="${line.id}"`) : ''}<p class="pl-note">Após salvar valores, sequência, conta, origem, fórmula e exclusão ficam protegidas no banco.</p>`, async () => {
        const origin = root.querySelector('#pl-line-origin').value;
        const payload = { form_id: formId, ...(line ? { id: line.id } : {}), seq: Number(root.querySelector('#pl-line-seq').value), description: root.querySelector('#pl-line-name').value, origin,
          formula_name: origin === 'label' ? null : String(Number(root.querySelector('#pl-line-seq').value)), formula_text: origin === 'formula' ? root.querySelector('#pl-line-expression').value : null,
          account_id: origin === 'input' ? root.querySelector('#pl-line-account').value : null, group_name: root.querySelector('#pl-line-group').value,
          style: { ...l.style, bold: root.querySelector('#pl-line-bold').checked } };
        core.compile([...lines().filter(x => x.id !== line?.id), { ...payload, id: line?.id || 'new' }]);
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
          const forms = selectedForms().map(f => ({ code: f.code, name: f.name, source_form_id: f.id, copy_values: wizard.values, status: wizard.release ? 'released' : 'draft' }));
          const result = await write('create', { name: wizard.name, year: wizard.year, color: wizard.color, icon: wizard.icon, months: wizard.months, forms });
          wizard = null; await refresh(result.id); scenario = context.scenarios.find(s => s.id === result.id); render(); return;
        }
        case 'zero-months': wizard.months = Array.from({ length: 12 }, () => ({ type: 'forms' })); return render();
        case 'mixed-months': wizard.months = months.map((_, i) => i < 5 ? { type: 'real', year: wizard.year } : { type: 'forms' }); return render();
        case 'copy-scenario': return leave(() => startWizard(container, back, scenario));
        case 'lock': return modal(locked() ? 'Desbloquear cenário?' : 'Bloquear cenário', locked() ? '<p>O cenário voltará a aceitar alterações autorizadas.</p>' : `<p>Deixe a data vazia para bloquear imediatamente ou programe o bloqueio.</p>${field('Data e hora do bloqueio', textInput('pl-lock-at', '', 'type="datetime-local"'))}`, async () => { const date = root.querySelector('#pl-lock-at')?.value; await write('lock', { locked: locked() ? false : !date, lock_at: date ? new Date(date).toISOString() : null }); close(); await refresh(); render(); });
        case 'tab': tab = d.tab; return render();
        case 'dre': return leave(() => { active = false; openScenarioDreReport(scenario.id); });
        case 'new-form': return openFormDialog();
        case 'edit-form': return openFormDialog(form());
        case 'open-form': return loadForm(d.id);
        case 'configure': return loadForm(d.id, 'structure');
        case 'index': return leave(() => { formId = null; render(); });
        case 'form-tab': return leave(async () => { changes.clear(); formTab = d.tab; await readForm(); render(); });
        case 'new-line': return lineDialog();
        case 'edit-line': return lineDialog(lines().find(l => l.id === d.id));
        case 'delete-line': return modal('Excluir linha?', '<p>A operação será recusada se houver valores ou fórmulas dependentes.</p>', async () => { await write('delete_line', { form_id: formId, id: d.id }); close(); await refresh(); render(); });
        case 'release': await write('save_form', { ...form(), status: form().status === 'draft' ? 'released' : 'draft' }); await refresh(); return render();
        case 'save-access': { const access = [...root.querySelectorAll('[data-access]')].filter(e => e.value !== 'none').map(e => ({ user_id: e.dataset.access, access_mode: e.value })); await write('save_access', { form_id: formId, access }); await refresh(); return render(); }
        case 'save': return save();
        case 'discard': storage('removeItem', draftKey()); changes.clear(); return render();
        case 'project': return modal('Integrar todos os formulários no DRE?', `<p>Esta operação substitui a consolidação anterior do cenário inteiro, usando somente valores salvos. Formulários em construção não são integrados.</p>${changes.size ? '<p class="pl-note">Sua digitação não salva não será incluída.</p>' : ''}`, async () => {
          const result = await write('project', { form_id: formId }); if (!result.ok) throw Error(result.error || 'Falha na integração');
          invalidateScenarioCachesFor?.(scenario.id, scenario.reference_year); close(); await refresh(); render();
        });
        case 'clear': return modal('Apagar os valores deste formulário?', '<p>Todos os centros serão zerados. O DRE só será atualizado após uma nova integração.</p>', async () => { await write('clear_entries', { form_id: formId, confirmation: 'APAGAR' }); storage('removeItem', draftKey()); changes.clear(); close(); await readForm(); render(); });
        case 'copy-form': { const all = await rpc('planning_context', { p_org: org }); return modal('Copiar estrutura', `${field('Origem', `<select id="pl-copy-form" class="pl-input">${all.forms.filter(f => f.id !== formId).map(f => `<option value="${f.id}">${esc(all.scenarios.find(s => s.id === f.scenario_id)?.name || '')} / ${esc(f.code)} · ${esc(f.name)}</option>`).join('')}</select>`)}${field('Código no destino', textInput('pl-copy-code'))}${field('Nome', textInput('pl-copy-name'))}<p>Valores e acessos não são copiados.</p>`, async () => { await write('copy_form', { source_form_id: root.querySelector('#pl-copy-form').value, code: root.querySelector('#pl-copy-code').value, name: root.querySelector('#pl-copy-name').value }); close(); await refresh(); formId = null; render(); }); }
        case 'import': return modal('Importar contas DRE', `<p>Selecione contas analíticas para criar linhas digitadas.</p>${context.accounts.filter(a => !lines().some(l => l.account_id === a.id)).map(a => `<label class="pl-choice"><input type="checkbox" data-import="${a.id}">${esc(a.account_number)} · ${esc(a.account_name)}</label>`).join('')}`, async () => {
          // One server transaction for the entire selection.
          await write('import_accounts', { form_id: formId, account_ids: [...root.querySelectorAll('[data-import]:checked')].map(e => e.dataset.import) }); close(); await refresh(); await readForm(); render();
        });
        case 'shortcuts': return shortcuts(d.line, Number(d.month));
        case 'export': return exportExcel();
      }
    }
    async function change(el) {
      if (el.id === 'pl-base') { await useBase(el.value); render(); }
      else if (el.name === 'pl-base') { await useBase(''); render(); }
      else if (el.dataset.month !== undefined) wizard.months[Number(el.dataset.month)] = core.sourcePayload(el.value);
      else if (el.name === 'pl-values') wizard.values = el.value === 'copy';
      else if (el.name === 'pl-release') wizard.release = el.value === 'released';
      else if (el.dataset.cc) { const next = el.checked ? [...selectedCC, el.dataset.cc] : selectedCC.filter(id => id !== el.dataset.cc); await leave(async () => { changes.clear(); selectedCC = next; await readForm(); render(); }); }
      else if (el.dataset.cell && !el.disabled) {
        try { setChange(el.dataset.cell, core.parseAmount(el.value)); } catch (err) { el.value = fmt(changes.get(el.dataset.cell)?.amount ?? entry(el.dataset.cell)?.amount ?? 0); throw err; }
        el.value = fmt(changes.get(el.dataset.cell).amount); updateGrid();
      }
    }
    function shortcuts(lineId, month) {
      modal('Atalhos de preenchimento', `${field('Ação', '<select id="pl-shortcut" class="pl-input"><option value="repeat">Repetir até dezembro</option><option value="distribute">Distribuir total entre meses editáveis</option><option value="copy">Copiar outro centro de custo</option></select>')}${field('Total a distribuir', textInput('pl-total', '0,00'))}${field('Centro de origem', `<select id="pl-origin-cc" class="pl-input">${context.cost_centers.filter(c => !selectedCC.includes(c.id)).map(c => `<option value="${c.id}">${esc(c.cost_center_name)}</option>`).join('')}</select>`)}<p class="pl-note">Substitui valores na grade; clique em Salvar para gravar. Cole blocos do Excel diretamente nas células.</p>`, async () => {
        const kind = root.querySelector('#pl-shortcut').value;
        if (kind === 'repeat') { const k = key(lineId, selectedCC[0], month); const amount = changes.get(k)?.amount ?? entry(k)?.amount ?? 0; inputMonths().filter(m => m > month).forEach(m => setChange(key(lineId, selectedCC[0], m), amount)); }
        else if (kind === 'distribute') { const values = core.distribute(core.parseAmount(root.querySelector('#pl-total').value), inputMonths().length); inputMonths().forEach((m, i) => setChange(key(lineId, selectedCC[0], m), values[i])); }
        else { const cc = root.querySelector('#pl-origin-cc').value; if (!cc) throw Error('Selecione o centro de origem'); const data = await rpc('planning_read_form', { p_org: org, p_form: formId, p_cc_ids: [cc] }); lines().filter(l => l.origin === 'input').forEach(l => inputMonths().forEach(m => setChange(key(l.id, selectedCC[0], m), Number(data.entries.find(e => e.line_id === l.id && e.reference_month === m)?.amount || 0)))); }
        close(); render();
      });
    }
    function paste(e) {
      if (!e.target.dataset.cell || e.target.disabled) return; const raw = e.clipboardData.getData('text'); if (!/[\t\n]/.test(raw)) return;
      e.preventDefault(); const [lineId, , month] = e.target.dataset.cell.split('|'), start = lines().findIndex(l => l.id === lineId), batch = [];
      try { raw.replace(/\r/g, '').split('\n').forEach((row, r) => row.split('\t').forEach((v, c) => { const l = lines()[start + r], m = Number(month) + c; if (l?.origin === 'input' && inputMonths().includes(m) && v.trim()) batch.push([key(l.id, selectedCC[0], m), core.parseAmount(v)]); })); batch.forEach(([k, amount]) => setChange(k, amount)); render(); }
      catch (err) { const el = root.querySelector('.pl-error'); el.textContent = 'Bloco recusado: ' + err.message; el.hidden = false; }
    }
    async function exportExcel() {
      if (!global.ExcelJS) throw Error('Biblioteca de exportação indisponível');
      const workbook = new global.ExcelJS.Workbook(), sheet = workbook.addWorksheet('Planejamento'), values = computed(true);
      sheet.addRow([scenario.name, form().name]); sheet.addRow(['Centros', ...context.cost_centers.filter(c => selectedCC.includes(c.id)).map(c => c.cost_center_name)]); sheet.addRow(['Linha', ...months, 'Total']);
      lines().forEach(l => { const row = months.map((_, i) => values[i][l.id]); sheet.addRow([l.description, ...row, row.reduce((n, v) => n + (typeof v === 'number' ? v : 0), 0)]); }); sheet.getColumn(1).width = 40;
      const blob = new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `${scenario.name}-${form().code}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    global.addEventListener('beforeunload', e => { if (active && changes.size) { e.preventDefault(); e.returnValue = ''; } });
    return { ensure, getContext: () => context, startWizard, open, isActive: () => active, render, reset() { active = false; available = undefined; context = null; changes.clear(); generation++; }, async remove(s) { await rpc('planning_write', { p_org: org, p_action: 'delete_scenario', p_scenario: s.id, p_payload: { confirmation: 'REMOVER' } }); }, async favorite(id, enabled) { await rpc('planning_write', { p_org: org, p_action: 'favorite', p_scenario: id, p_payload: { enabled } }); onDefaultScenarioChanged?.(); } };
  }
  global.VECTON_PLANNING = { createPlanningModule };
})(window);
