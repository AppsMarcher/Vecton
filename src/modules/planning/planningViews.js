(function (global) {
  'use strict';
  // Telas do Planejamento: só montam HTML a partir do estado recebido (`st`),
  // sem tocar no DOM nem no servidor. O estado e as ações ficam em planningModule.js.
  function createPlanningViews({ escapeHtml: esc, months }) {
    const fmt = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const button = (text, action, attrs = '', primary = false) => `<button type="button" class="pl-button ${primary ? 'pl-primary' : ''}" data-pl="${action}" ${attrs}>${text}</button>`;
    const field = (label, html) => `<label class="pl-field">${label}${html}</label>`;
    const textInput = (id, value = '', attrs = '') => `<input class="pl-input" id="${id}" value="${esc(value)}" ${attrs}>`;
    const off = locked => (locked ? 'disabled' : '');
    const statusBadge = f => `<span class="pl-badge${f.status === 'released' ? ' pl-badge--ok' : ''}">${f.status === 'released' ? 'Liberado' : 'Em construção'}</span>`;
    const tabButtons = (tabs, action, current) => tabs.map(([id, name]) => button(name, action, `data-tab="${id}" ${current === id ? 'aria-pressed="true"' : ''}`)).join('');

    // ── Criação guiada ─────────────────────────────────────────────────────
    const icons = ['cost', 'trend-up', 'activity', 'dollar', 'pie', 'target', 'layers', 'sliders', 'briefcase', 'reports', 'planning', 'dashboard'].map(k => 'vp-icon-' + k);
    const steps = ['Identidade', 'Ponto de partida', 'Fontes dos meses', 'Valores iniciais', 'Liberação', 'Revisão'];

    const sourceValue = m => (m.type === 'forms' ? 'forms' : m.type === 'real' ? 'real:' + m.year : 'scenario:' + m.scenario_id);
    const option = (value, label, current) => `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`;
    function sourceOptions(st, current) {
      const { wizard, context } = st;
      const years = Array.from({ length: 6 }, (_, i) => Number(wizard.year) - i);
      return option('forms', 'Formulários · preenchimento', current)
        + years.map(y => option('real:' + y, `Real ${y}`, current)).join('')
        + context.scenarios.map(s => option('scenario:' + s.id, esc(s.name), current)).join('');
    }
    const choice = (name, value, checked, label, attrs = '') => `<label class="pl-choice"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''} ${attrs}>${label}</label>`;
    const sourceLabel = (st, m) => (m.type === 'forms' ? 'Formulários' : m.type === 'real' ? 'Real ' + m.year : st.context.scenarios.find(s => s.id === m.scenario_id)?.name || '');

    function iconPicker(w) {
      const buttons = icons.map((ic, i) => `<button type="button" class="fc-icon-btn${w.icon === ic ? ' fc-active' : ''}" data-pl="wizard-icon" data-icon="${ic}" aria-label="Ícone ${i + 1}" aria-pressed="${w.icon === ic}"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${ic}"></use></svg></button>`).join('');
      return `<label class="pl-field">Ícone</label><div class="pl-actions" role="group" aria-label="Ícone do cenário">${buttons}</div>`;
    }
    const stepIdentity = w => `<h2>Qual é a identidade do cenário?</h2>${field('Nome', textInput('pl-name', w.name, 'maxlength="70" placeholder="Budget, Revisão de julho…"'))}<div class="pl-columns">${field('Ano base', textInput('pl-year', w.year, 'type="number" min="2000" max="2200"'))}${field('Cor', textInput('pl-color', w.color, 'type="color"'))}</div>${iconPicker(w)}`;
    const stepBase = (st, w) => `<h2>De onde vamos partir?</h2>${choice('pl-base', '', !w.base, 'Começar do zero')}<label class="pl-field">Usar um cenário como base<select id="pl-base" class="pl-input"><option value="">Escolher uma base</option>${st.context.scenarios.map(s => option(s.id, esc(s.name), w.base)).join('')}</select></label><p class="pl-note">A origem não será alterada. Revise o que deseja aproveitar nas próximas etapas.</p>`;
    const stepMonths = (st, w) => `<h2>Qual é a fonte de cada mês?</h2><div class="pl-actions">${button('Todos para preenchimento', 'zero-months')}${button('Real até maio + formulários', 'mixed-months')}</div><div class="pl-months">${w.months.map((m, i) => field(months[i], `<select class="pl-input" data-month="${i}">${sourceOptions(st, sourceValue(m))}</select>`)).join('')}</div><p class="pl-note">Meses copiados ficam em leitura. As fontes não mudam após criar o cenário.</p>`;
    const stepValues = w => `<h2>Como começam os valores?</h2>${choice('pl-values', 'zero', !w.values, 'Formulários zerados')}${choice('pl-values', 'copy', w.values, 'Copiar valores salvos dos formulários', w.mode !== 'copy' ? 'disabled' : '')}<p class="pl-note">A cópia de inputs afeta apenas meses de formulários; os snapshots dos outros meses são preservados.</p>`;
    const stepRelease = w => `<h2>Quando liberar o preenchimento?</h2>${choice('pl-release', 'draft', !w.release, 'Manter os formulários em construção')}${choice('pl-release', 'released', w.release, 'Liberar formulários copiados com linhas')}<p class="pl-note">Formulários novos começam em construção. O cenário nasce aberto e não altera a estrela global.</p>`;
    function stepReview(st, w) {
      const own = w.months.filter(m => m.type === 'forms').length;
      const monthsGrid = w.months.map((m, i) => `<div><b>${months[i]}</b><small>${esc(sourceLabel(st, m))}</small></div>`).join('');
      return `<h2>Confira antes de criar</h2><div class="pl-review"><div><small>Cenário</small><strong>${esc(w.name)} · ${w.year}</strong></div><div><small>Meses</small>${own} para preenchimento · ${w.months.length - own} copiados</div><div><small>Formulários copiados da base</small>${st.selectedForms().length} · ${w.values ? 'com valores' : 'zerados'}</div><div><small>Liberação</small>${w.release ? 'Liberar copiados' : 'Em construção'}</div></div><div class="pl-months">${monthsGrid}</div><p class="pl-note">Configure formulários e acessos dentro do cenário. Os inputs só compõem o DRE após integrar. Meses copiados compõem a base na criação.</p>`;
    }
    function wizardBody(st) {
      const w = st.wizard;
      switch (w.step) {
        case 0: return stepIdentity(w);
        case 1: return stepBase(st, w);
        case 2: return stepMonths(st, w);
        case 3: return stepValues(w);
        case 4: return stepRelease(w);
        default: return stepReview(st, w);
      }
    }
    function wizard(st) {
      const w = st.wizard, last = w.step === steps.length - 1;
      const nav = steps.map((s, i) => `<button class="pl-step ${i === w.step ? 'selected' : ''}" data-pl="step" data-index="${i}" ${i > w.step ? 'disabled' : ''}><span>${i < w.step ? '✓' : i + 1}</span>${s}</button>`).join('');
      const footer = `<footer class="pl-heading pl-footer">${button(w.step ? 'Voltar' : 'Cancelar', w.step ? 'prev' : 'exit')}${button(last ? 'Criar cenário' : 'Continuar →', 'next', '', true)}</footer>`;
      return `<div class="pl-heading">${button('← Cenários', 'exit')}<span class="pl-badge">Criação guiada</span></div><h1>Novo cenário</h1><p class="pl-muted">Defina a base e os meses. Formulários e acessos serão configurados dentro do cenário.</p><div class="pl-wizard"><nav aria-label="Etapas de criação">${nav}</nav><section class="pl-panel"><small class="pl-muted">ETAPA ${w.step + 1} DE ${steps.length}</small>${wizardBody(st)}${footer}</section></div>`;
    }

    // ── Cenário: formulários, fontes e integrações ─────────────────────────
    function formsList(st) {
      const { context } = st, admin = st.admin(), locked = st.locked();
      // Formulário não liberado só aparece no modo gerenciar (engrenagem do cenário).
      const rows = context.forms.filter(f => admin || f.status === 'released').map(f => `<div class="pl-list-row"><span class="pl-code">${esc(f.code)}</span><div class="pl-grow"><strong>${esc(f.name)}</strong><small>${esc(f.access_mode === 'write' ? 'Lançar valores' : 'Visualizar')}</small></div>${statusBadge(f)}${admin ? button('Configurar', 'configure', `data-id="${f.id}"`) : ''}${button('Abrir →', 'open-form', `data-id="${f.id}"`)}</div>`).join('');
      return `<div class="pl-heading"><h2>Formulários do cenário</h2>${admin ? button('+ Novo formulário', 'new-form', off(locked), true) : ''}</div><div class="pl-list">${rows || '<p class="pl-note">Nenhum formulário disponível. O administrador pode construir um novo formulário.</p>'}</div>`;
    }
    function sourcesList(st) {
      const cards = st.context.months.map(m => {
        const label = m.source_type === 'forms' ? 'Formulários' : m.source_type === 'real' ? 'Real ' + m.source_year : st.context.scenarios.find(s => s.id === m.source_scenario_id)?.name || '';
        return `<div><b>${months[m.reference_month - 1]}</b><small>${esc(label)}</small></div>`;
      }).join('');
      return `<div class="pl-months">${cards}</div>`;
    }
    function runsList(st) {
      const rows = st.context.runs.map(r => `<tr><td>${new Date(r.started_at).toLocaleString('pt-BR')}</td><td>${r.status === 'ok' ? 'Concluída' : 'Erro'}</td><td>${r.rows_written}</td><td>${esc(r.error || '')}</td></tr>`).join('');
      return `<h2>Integrações do cenário</h2><p class="pl-muted">Cada execução atualiza todos os formulários, usando somente valores salvos.</p><div class="pl-table-scroll"><table><thead><tr><th>Início</th><th>Status</th><th>Linhas publicadas</th><th>Detalhes</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    function scenarioHome(st) {
      const tabs = st.admin() ? tabButtons([['forms', 'Formulários'], ['sources', 'Fontes dos meses'], ['runs', 'Integrações no DRE']], 'tab', st.tab) : '';
      const body = !st.admin() || st.tab === 'forms' ? formsList(st) : st.tab === 'sources' ? sourcesList(st) : runsList(st);
      return `${st.admin() ? `<nav class="pl-tabs">${tabs}${button('Ver DRE', 'dre')}</nav>` : ''}${body}`;
    }
    function scenario(st) {
      const f = st.form(), locked = st.locked();
      const adminActions = st.admin() ? button('Copiar cenário', 'copy-scenario') + button(locked ? 'Desbloquear' : 'Bloquear', 'lock') : '';
      const badge = `<span class="pl-badge${locked ? '' : ' pl-badge--ok'}">${locked ? 'Bloqueado' : 'Aberto'}</span>`;
      // No modo gerenciar o selo de status vai junto dos botões, na mesma linha do título.
      const right = adminActions ? `<div class="pl-actions">${adminActions}${badge}</div>` : badge;
      return `<div class="pl-heading"><h1 class="pl-title"><button type="button" class="pl-back" data-pl="exit" data-tip-text="Voltar para os cenários" aria-label="Voltar para os cenários"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M13 8l-4 4 4 4M9 12h7"/></svg></button>${esc(st.scenario.name)}</h1>${right}</div>${locked ? '<p class="pl-note">Cenário bloqueado: somente leitura para todos.</p>' : ''}${f ? formView(st, f) : scenarioHome(st)}`;
    }

    // ── Formulário: preenchimento, estrutura e acessos ─────────────────────
    function formView(st, f) {
      const tabs = [['input', 'Preenchimento'], ...(st.admin() ? [['structure', 'Estrutura'], ['access', 'Acessos']] : [])];
      const body = st.formTab === 'input' ? grid(st) : st.formTab === 'structure' ? structure(st) : access(st);
      return `${st.formTab === 'input' ? `<div class="pl-heading"><div class="pl-actions" style="margin-left:auto">${f.access_mode === 'write' ? button('Integrar no DRE', 'project', off(st.locked()), true) : ''}${button('Exportar Excel', 'export')}</div></div>` : ''}<div class="pl-heading"><div><small class="pl-muted">FORMULÁRIO ${esc(f.code)}</small><h2>${esc(f.name)}</h2></div>${statusBadge(f)}</div><div class="pl-tabrow">${tabs.length > 1 ? `<nav class="pl-tabs">${tabButtons(tabs, 'form-tab', st.formTab)}</nav>` : ''}${st.formTab === 'input' ? gridToolbar(st) : ''}</div>${body}`;
    }
    // Contas digitadas também em outro formulário do cenário: os valores se somam no DRE.
    function sharedAccountsNote(st) {
      const { context, formId, accountNumbers } = st;
      const mine = new Set(st.lines().filter(l => l.origin === 'input' && l.account_id).map(l => l.account_id)), shared = new Map();
      (context.lines || []).filter(l => l.form_id !== formId && l.origin === 'input' && mine.has(l.account_id)).forEach(l => {
        const names = shared.get(l.account_id) || new Set();
        names.add(context.forms.find(f => f.id === l.form_id)?.name || 'outro formulário');
        shared.set(l.account_id, names);
      });
      if (!shared.size) return '';
      const list = [...shared].map(([id, names]) => `${esc(accountNumbers.get(id) || context.accounts.find(a => a.id === id)?.account_number || '')} (${[...names].map(esc).join(', ')})`).join('; ');
      return `<p class="pl-note" role="status">Atenção: ${shared.size === 1 ? 'esta conta também está' : 'estas contas também estão'} em outros formulários deste cenário e os valores serão somados no DRE: ${list}.</p>`;
    }
    function structure(st) {
      const { context } = st, f = st.form(), disabled = off(st.locked());
      const origins = { input: 'Digitado', formula: 'Fórmula', label: 'Linha normal' };
      const rows = st.lines().map(l => `<tr><td>${l.seq}</td><td>${esc(l.description)}</td><td>${origins[l.origin]}</td><td>${esc(l.account_id ? context.accounts.find(a => a.id === l.account_id)?.account_number || '' : l.formula_text || '')}</td><td>${button('Editar', 'edit-line', `data-id="${l.id}" ${disabled}`)}</td></tr>`).join('');
      const header = `<div class="pl-heading"><h3>Construtor de formulário</h3><div class="pl-actions">${button(f.status === 'released' ? 'Voltar à construção' : 'Liberar', 'release', disabled)}${button('Importar contas DRE', 'import', disabled)}${button('Copiar estrutura', 'copy-form', disabled)}${button('+ Adicionar linha', 'new-line', disabled, true)}</div></div>`;
      return `${header}<div class="pl-actions">${button('Editar nome e código', 'edit-form', disabled)}${button('Apagar valores', 'clear', disabled)}</div>${sharedAccountsNote(st)}<div class="pl-table-scroll"><table><thead><tr><th>Seq.</th><th>Descrição</th><th>Origem</th><th>Conta / fórmula</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    const accessOptions = mode => [['none', 'Sem acesso'], ['read', 'Visualizar'], ['write', 'Lançar valores']].map(([id, label]) => option(id, label, mode)).join('');
    function access(st) {
      const { context, formId } = st, disabled = off(st.locked());
      const rows = context.users.map(u => `<label class="pl-list-row"><span class="pl-grow">${esc(u.full_name || 'Usuário')}<small>${esc(u.management || '')}</small></span><select class="pl-input" data-access="${u.user_id}" ${disabled}>${accessOptions(context.access.find(a => a.form_id === formId && a.user_id === u.user_id)?.access_mode || 'none')}</select></label>`).join('');
      return `<h3>Pessoas com acesso a este formulário</h3><p class="pl-muted">Os centros de custo continuam limitados pelo perfil de cada pessoa.</p><div class="pl-list">${rows}</div>`;
    }

    // ── Grade de preenchimento ─────────────────────────────────────────────
    function costCenterPicker(st) {
      const { context, selectedCC } = st;
      const summary = selectedCC.length === 1 ? esc(context.cost_centers.find(c => c.id === selectedCC[0])?.cost_center_name || '') : `${selectedCC.length} centros marcados (soma)`;
      const items = context.cost_centers.map(c => `<label class="pl-choice"><input type="checkbox" data-cc="${c.id}" ${selectedCC.includes(c.id) ? 'checked' : ''}>${esc(c.cost_center_number)} · ${esc(c.cost_center_name)}</label>`).join('');
      return `<details class="pl-cc"><summary>${summary}</summary><div class="pl-cc-list">${items}</div></details>`;
    }
    function gridCell(st, l, i, values, editable) {
      if (l.origin === 'label') return '<td></td>';
      if (l.origin === 'input' && st.inputMonths().includes(i + 1)) {
        const input = `<input class="pl-cell" data-cell="${st.key(l.id, st.selectedCC[0], i + 1)}" aria-label="${esc(l.description)} ${months[i]}" value="${fmt(values[i][l.id])}" ${editable ? '' : 'disabled'}>`;
        return `<td>${input}</td>`;
      }
      const v = values[i][l.id];
      return `<td><span data-value="${l.id}|${i}">${typeof v === 'number' ? fmt(v) : esc(v || '')}</span></td>`;
    }
    function gridRow(st, l, values, editable) {
      const cells = months.map((_, i) => gridCell(st, l, i, values, editable)).join('');
      const total = l.origin === 'label' ? '' : typeof values[0][l.id] === 'number' ? fmt(values.reduce((n, v) => n + (typeof v[l.id] === 'number' ? v[l.id] : 0), 0)) : 'Erro';
      const number = l.account_id ? `<small class="pl-acc-num">${esc(st.accountNumbers.get(l.account_id) || '')}</small>` : '';
      return `<tr class="${l.origin === 'formula' ? 'pl-subtotal' : ''}"><td style="font-weight:${l.style?.bold ? '600' : '400'}">${number}<span class="pl-acc-name">${esc(l.description)}</span></td>${cells}<td data-total="${l.id}">${total}</td></tr>`;
    }
    function gridToolbar(st) {
      const f = st.form(), locked = st.locked();
      return `<div class="pl-actions pl-toolbar">${costCenterPicker(st)}</div>`;
    }
    function grid(st) {
      const { selectedCC, changes } = st, f = st.form(), locked = st.locked();
      const editable = f.access_mode === 'write' && !locked && selectedCC.length === 1;
      const values = st.computed();
      const head = months.map((m, i) => `<th>${m}${st.inputMonths().includes(i + 1) ? '' : '<small>Copiado</small>'}</th>`).join('');
      const rows = st.lines().map(l => gridRow(st, l, values, editable)).join('');
      const footer = `<div class="pl-heading pl-footer"><span id="pl-save-state" class="pl-muted">${changes.size ? `${changes.size} alterações não salvas` : 'Valores salvos'}</span><div class="pl-actions">${button('Descartar', 'discard', !changes.size ? 'disabled' : '')}${button('Salvar valores', 'save', !changes.size || !editable ? 'disabled' : '', true)}</div></div>`;
      return `${selectedCC.length !== 1 ? '<p class="pl-note">Selecione um centro para preencher. Vários centros mostram a soma em leitura.</p>' : ''}<div class="pl-table-scroll"><table class="pl-grid"><thead><tr><th>Linha</th>${head}<th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>${footer}`;
    }

    return { fmt, button, field, textInput, steps, wizard, scenario };
  }
  global.VECTON_PLANNING_VIEWS = { createPlanningViews };
})(window);
