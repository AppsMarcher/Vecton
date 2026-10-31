(function (global) {
  'use strict';
  // Telas do FAT: só montam HTML a partir do estado preparado por planningFatModule.js (sem DOM nem servidor).
  function createFatViews({ escapeHtml: esc, months }) {
    const core = global.VECTON_PLANNING_FAT_CORE;
    const nf = (v, d = 0) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
    const fmt = (v, metric) => (v == null ? '–' : metric === 'mb' ? `${nf(v * 100, 1)}%` : nf(v));
    const btn = (text, action, attrs = '', primary = false) => `<button type="button" class="pl-button ${primary ? 'pl-primary' : ''}" data-pl="${action}" ${attrs}>${text}</button>`;
    const seg = (items, action, current, attr) => `<div class="fat-seg">${items.map(([id, label]) => `<button type="button" data-pl="${action}" data-${attr}="${esc(id)}" class="${current === id ? 'on' : ''}">${esc(label)}</button>`).join('')}</div>`;
    const exportButton = '<button type="button" class="vp-export-btn pl-export" data-pl="fat-export" aria-label="Exportar Excel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 19h14"/></svg><span>Excel</span></button>';
    const select = (kind, options, current, cls = '') => `<select class="fat-select${cls}" data-fat="${kind}">${options.map(o => `<option value="${esc(o.key)}" ${o.key === current ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    const cellTd = (c, metric, cls = '') => { const v = core.metric(c, metric); return `<td class="${cls}${v == null ? ' mut' : ''}"><div class="v">${fmt(v, metric)}</div></td>`; };

    // ── Grade (formato do Evolutivo de Margens) ────────────────────────────
    function inputCell(input) {
      return `<td><div class="v"><input data-fat="vol" data-model="${esc(input.model)}" data-month="${input.month}" inputmode="numeric" value="${esc(input.display)}" class="${input.dirty ? 'dirty' : ''}" ${input.disabled ? 'disabled' : ''}></div></td>`;
    }
    function gridRow(row, metric) {
      if (row.kind === 'grp') return `<tr class="grp"><td colspan="16">${esc(row.name)}</td></tr>`;
      const first = row.kind === 'model'
        ? `<span class="fat-mname"><span class="fat-dot ${row.dot || ''}" ${row.dot ? '' : 'style="visibility:hidden"'}></span>${esc(row.name)}</span>` : esc(row.name);
      const cells = row.months.map((c, j) => (row.inputs ? inputCell(row.inputs[j]) : cellTd(c, metric))).join('');
      return `<tr class="${row.kind === 'model' ? '' : row.kind}"><td>${first}</td>${cellTd(row.r25, metric, 'ref')}${cellTd(row.r26, metric, 'ref last')}${cells}${cellTd(row.year, metric, 'tot')}</tr>`;
    }
    function grid(vm) {
      const head = `<colgroup><col style="width:190px"><col style="width:91px"><col style="width:91px">${months.map(() => '<col>').join('')}<col style="width:91px"></colgroup><thead><tr><th></th><th class="ref">${vm.refYears[0]}</th><th class="ref last">${vm.refYears[1]}</th>${months.map(m => `<th>${esc(m)}</th>`).join('')}<th class="tot">${vm.year}</th></tr></thead>`;
      const selectors = vm.view === 'vend' ? select('region', vm.regions, vm.regionKey, ' fat-select--xs') : vm.view === 'coord' ? select('coord', vm.coords.map(c => ({ key: c, label: c })), vm.coordName, ' fat-select--sm') : '';
      const chips = [vm.view === 'vend' && vm.responsible ? `Responsável · ${vm.responsible}` : '', vm.tag].filter(Boolean).map(t => `<span class="fat-chip">${esc(t)}</span>`).join('');
      const tabs = seg([['mar', 'Marcher'], ['coord', 'Coordenação'], ['vend', 'Região']], 'fat-view', vm.view, 'v');
      const metrics = seg([['vol', 'VOL'], ['fat', 'FAT'], ['rl', 'RL'], ['mp', 'MP'], ['mb', 'MC1%']], 'fat-metric', vm.metric, 'm');
      return `<div class="fat-card"><div class="fat-card-h fat-card-h--one"><div class="fat-ctl">${tabs}${selectors}${chips}</div>${metrics}</div><div class="fat-scroll"><table class="fat-grid" id="fat-grid">${head}<tbody>${vm.rows.map(r => gridRow(r, vm.metric)).join('')}</tbody></table></div></div>`;
    }

    // ── Blocos recolhíveis ─────────────────────────────────────────────────
    const section = (id, title, open, body, extra = '') => `<div class="fat-sect"><button type="button" class="fat-sect-h" data-pl="fat-toggle" data-id="${id}"><span class="fat-arrow">${open ? '▾' : '▸'}</span>${esc(title)}${extra}</button>${open ? body : ''}</div>`;
    function premises(vm) {
      const p = vm.prem; const consolidated = vm.view !== 'vend';
      const val = v => (v == null ? '–' : vm.pecas ? `${nf(v * 100, 1)}%` : nf(v));
      const rows = p.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${val(r.fat)}</td><td>${val(r.rl)}</td><td>${val(r.mp)}</td><td>${r.mb == null ? '' : nf(r.mb * 100, 1) + '%'}</td><td class="l"><span class="fat-badge ${esc(r.origin)}">${esc(r.originLabel)}</span></td><td class="l mut">${esc(r.window)}</td><td>${vm.admin && !consolidated && r.adjustable ? btn('Ajustar', 'fat-adjust', `data-region="${esc(r.region)}" data-model="${esc(r.key)}"`) : ''}</td></tr>`).join('');
      const total = `<tr class="top"><td>Total ${esc(vm.label)}</td><td>${nf(p.total.fat)}</td><td>${nf(p.total.rl)}</td><td>${nf(p.total.mp)}</td><td>${p.total.mb == null ? '–' : nf(p.total.mb * 100, 1) + '%'}</td><td colspan="3" class="l mut">${nf(p.total.q)} un</td></tr>`;
      const body = `<div class="fat-scroll"><table class="fat-grid fat-small"><thead><tr><th>${vm.pecas ? 'Linha' : 'Modelo'}</th><th>${vm.pecas ? 'RL / FAT' : 'FAT/un'}</th><th>${vm.pecas ? 'MP / FAT' : 'RL/un'}</th><th>${vm.pecas ? 'MC1%' : 'MP/un'}</th><th>${vm.pecas ? '' : 'MC1%'}</th><th class="l">Origem</th><th class="l">Janela</th><th></th></tr></thead><tbody>${rows}${vm.pecas ? '' : total}</tbody></table></div>`;
      return section('prem', 'Premissas do local', vm.premOpen, body);
    }
    function dreBlock(vm) {
      const d = vm.dre, f = v => (Math.abs(v) < 0.5 ? '–' : nf(v));
      const sum = a => a.reduce((x, y) => x + y, 0);
      const row = (cls, name, arr, code) => `<tr class="${cls}"><td class="${code ? 'cod' : ''}">${code ? `<span class="c">${code}</span>` : ''}${esc(name)}</td>${arr.map(v => `<td><div class="v">${f(v)}</div></td>`).join('')}<td class="tot"><div class="v">${f(sum(arr))}</div></td></tr>`;
      const a = d.accounts, z = Array(12).fill(0), pct = (m, r) => (r ? `${nf(100 * m / r, 1)}%` : '–');
      const body = `<div class="fat-scroll"><table class="fat-grid" id="fat-dre"><colgroup><col style="width:300px">${months.map(() => '<col>').join('')}<col style="width:91px"></colgroup><thead><tr><th>Conta</th>${months.map(m => `<th>${esc(m)}</th>`).join('')}<th class="tot">${vm.year}</th></tr></thead><tbody>
        ${row('sub', 'FATURAMENTO', d.fat)}${row('acc', 'VENDA DE MAQUINAS - NACIONAL', a['31101001'], '31101001')}${row('acc', 'VENDA DE MAQUINAS - EXPO', a['31101002'], '31101002')}${row('acc', 'VENDA DE PEÇAS E ACESSÓRIOS', a['31101006'], '31101006')}${row('acc', 'VENDA DE TRANSGRAIN', a['31101007'], '31101007')}${row('acc', 'SERVICOS PRESTADOS', z, '31102001')}
        ${row('sub', 'IMPOSTOS SOBRE VENDAS', d.imposto)}${row('acc', '(-) IPI', a['31203001'], '31203001')}${row('acc', '(-) ICMS', a['31203002'], '31203002')}${row('acc', '(-) COFINS', a['31203004'], '31203004')}${row('acc', '(-) PIS', a['31203005'], '31203005')}${row('acc', '(-) ISS', z, '31203003')}
        ${row('top', 'RECEITA LÍQUIDA', d.rl)}<tr class="sp"><td colspan="14"></td></tr>
        ${row('sub', 'MATÉRIA-PRIMA', d.mp)}${row('acc', '(-) MATÉRIA-PRIMA', d.mp, '412010901')}${row('acc', '(-) CUSTEIO ABSORÇÃO', z, '4110400001001')}
        <tr class="sub"><td>% MP / RL</td>${d.mp.map((m, j) => `<td><div class="v">${pct(m, d.rl[j])}</div></td>`).join('')}<td class="tot"><div class="v">${pct(sum(d.mp), sum(d.rl))}</div></td></tr></tbody></table></div>`;
      return section('dre', 'Faturamento | Impostos | Matéria-prima', vm.dreOpen, body);
    }

    // ── Configuração e acessos (admin) ─────────────────────────────────────
    function config(vm) {
      const rows = vm.taxes.map(t => `<tr><td>${esc(t.label)}</td>${['ipi', 'icms', 'pis', 'cofins'].map(k => `<td><div class="fat-pct"><input data-fat="tax" data-line="${t.line}" data-key="${k}" inputmode="decimal" value="${nf(t[k], 2)}"><span>%</span></div></td>`).join('')}<td class="mut">${nf(t.sum, 2)}%</td></tr>`).join('');
      return `<div class="fat-card"><div class="fat-card-h"><b>Impostos de referência</b>${btn('Atualizar premissas', 'fat-refresh')}</div><div class="fat-scroll"><table class="fat-grid fat-cfg"><thead><tr><th>Linha</th><th>IPI</th><th>ICMS</th><th>PIS</th><th>COFINS</th><th>Total do FAT</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }
    function access(vm) {
      const a = vm.access;
      const rows = a.coords.map(r => `<tr><td>${esc(r.label)}</td><td><select class="fat-select fat-select--acc" data-fat="access" data-user="${esc(a.userId)}" data-coord="${esc(r.key)}">${[['none', 'Sem acesso'], ['read', 'Visualizar'], ['write', 'Lançar valores']].map(([v, l]) => `<option value="${v}" ${r.mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`).join('');
      return `<div class="fat-card"><div class="fat-card-h"><div class="fat-ctl"><b>Acessos por coordenação</b>${select('access-user', a.users.map(u => ({ key: u.user_id, label: u.full_name || 'Usuário' })), a.userId, ' fat-select--user')}</div>${btn('Salvar acessos', 'fat-access-save', a.dirty ? '' : 'disabled', true)}</div><div class="fat-scroll"><table class="fat-grid fat-small fat-access"><tbody>${rows}</tbody></table></div></div>`;
    }

    // ── Formulário ─────────────────────────────────────────────────────────
    function form(vm) {
      const f = vm.form;
      const tabs = vm.tab === 'pre' ? [['pre', 'Preenchimento']] : vm.admin ? [['cfg', 'Configuração'], ['acc', 'Acessos']] : [];
      const head = `${vm.tab === 'pre' ? `<div class="pl-heading"><div class="pl-actions" style="margin-left:auto">${f.access_mode === 'write' ? btn('Integrar no DRE e OPEX', 'project', vm.locked || f.status !== 'released' ? 'disabled' : '', true) : ''}${exportButton}</div></div>` : ''}<div class="pl-heading"><div><small class="pl-muted">FORMULÁRIO ${esc(f.code)}</small><h2>${esc(f.name)}${vm.admin && vm.tab !== 'pre' ? `<button type="button" class="pl-edit-name" data-pl="edit-form" ${vm.locked ? 'disabled' : ''} data-tip-text="Editar nome e código" aria-label="Editar nome e código"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></button>` : ''}</h2></div><span class="pl-badge${f.status === 'released' ? ' pl-badge--ok' : ''}">${f.status === 'released' ? 'Liberado' : 'Em construção'}</span></div>${tabs.length > 1 ? `<div class="pl-tabrow"><nav class="pl-tabs">${tabs.map(([id, name]) => btn(name, 'fat-tab', `data-tab="${id}" ${vm.tab === id ? 'aria-pressed="true"' : ''}`)).join('')}</nav>${vm.admin && vm.tab !== 'pre' ? `<div class="pl-actions" style="margin-left:auto">${btn(f.status === 'released' ? 'Voltar à construção' : 'Liberar', 'fat-release', vm.locked ? 'disabled' : '')}</div>` : ''}</div>` : ''}`;
      if (vm.tab === 'cfg') return head + config(vm);
      if (vm.tab === 'acc') return head + access(vm);
      const orphans = vm.orphans && vm.admin ? `<div class="fat-stale"><span>${vm.orphans} combinação(ões) de região e modelo sem atribuição vigente não serão integradas</span></div>` : '';
      const stale = vm.stale && vm.admin ? `<div class="fat-stale"><span>Premissas defasadas · base ${esc(vm.windowLabel)}</span>${btn('Atualizar premissas', 'fat-refresh')}</div>` : '';
      const foot = `<div class="fat-foot"><span class="fat-state">${vm.dirty ? 'Alterações não salvas' : ''}</span><div class="pl-actions">${btn('Descartar', 'fat-discard', vm.dirty ? '' : 'disabled')}${btn('Salvar valores', 'fat-save', vm.dirty ? '' : 'disabled', true)}</div></div>`;
      const legend = vm.pecas ? '' : `<div class="fat-legend"><span><i class="fat-dot l"></i>Histórico da região</span><span><i class="fat-dot m"></i>Média Marcher</span><span><i class="fat-dot a"></i>Edit manual</span><span><i class="fat-dot n"></i>Sem premissa</span></div>`;
      return head + stale + orphans + grid(vm) + legend + foot + premises(vm) + dreBlock(vm);
    }

    // Aviso de integração: o valor de outro formulário perde para o FAT/CPX; diz de qual formulário vem, em lista que quebra linha (sem tabela larga).
    // Rodapé do aviso: o administrador zera os valores em conflito e integra; os demais pedem ao administrador.
    const overlapNote = canZero => `<p>${canZero ? 'Ao confirmar, estes valores serão zerados no formulário de origem (fica no histórico de alterações) e a integração segue.' : 'Peça a um administrador para zerar estes valores antes de integrar.'}</p>`;
    function overlapModal(rows, source = 'FAT') {
      const place = r => r.cost_center_number ? `centro de custo ${esc(r.cost_center_number)}` : 'sem centro de custo';
      return `<p>O ${source} prevalece sobre os valores abaixo, lançados em outro formulário, que não entram no DRE:</p><ul class="pl-overlap">${rows.map(r => `<li><strong>${esc(r.form_code)} · ${esc(r.form_name)}</strong><span>Conta ${esc(r.account_number)}${r.account_name ? ' · ' + esc(r.account_name) : ''}</span><span>${place(r)} · ${r.months.map(m => esc(months[m - 1])).join(', ')}</span></li>`).join('')}</ul>`;
    }
    function listRow(f, st) {
      return `<div class="pl-list-row"><span class="pl-code">FAT</span><div class="pl-grow"><strong>${esc(f.name)}</strong><small>${esc(st.locked ? 'Somente leitura' : f.access_mode === 'write' ? 'Lançar volumes' : 'Visualizar')}</small></div><span class="pl-badge${f.status === 'released' ? ' pl-badge--ok' : ''}">${f.status === 'released' ? 'Liberado' : 'Em construção'}</span>${st.admin ? btn('Configurar', 'configure', `data-id="${f.id}"`) : ''}${st.admin ? btn('Importar', 'import-form', `data-id="${f.id}" ${st.locked ? 'disabled' : ''}`) : ''}${btn('Abrir →', 'open-form', `data-id="${f.id}"`)}</div>`;
    }
    return { form, grid, premises, dreBlock, config, access, overlapModal, overlapNote, listRow, fmt };
  }
  global.VECTON_PLANNING_FAT_VIEWS = { createFatViews };
})(window);
