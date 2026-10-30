(function (global) {
  'use strict';
  // Estado, cálculo da tela e ações do FAT. O cálculo autoritativo está no banco (planning_fat_calculate);
  // aqui só a prévia, com os mesmos números (planningFatCore.js).
  function createFatController(deps) {
    const { escapeHtml: esc, rpc, months } = deps;
    const core = global.VECTON_PLANNING_FAT_CORE;
    const views = global.VECTON_PLANNING_FAT_VIEWS.createFatViews({ escapeHtml: esc, months });
    const LINE = { 'Grãos': 'Grão', Cargograin: 'Grão', 'Pecuária': 'Pecuária', Transgrain: 'Outros', 'Acessórios': 'Grão', 'Linhas complementares': 'Peças' };
    const GROUPS = ['Grãos', 'Pecuária', 'Cargograin', 'Transgrain', 'Acessórios'];
    // Total Máquinas: só Grãos + Pecuária + Cargograin (como o Total Máquinas do Evolutivo de Margens); Transgrain, Acessórios e Peças ficam fora.
    const MACHINE_GROUPS = ['Grãos', 'Pecuária', 'Cargograin'];
    const ORIGIN = { local: 'histórico da região', marcher: 'média Marcher', adjusted: 'edit manual' };
    const LOWER = months.map(m => m.toLowerCase());
    let data = null, formId = null, view = 'mar', metric = 'vol', regionKey = null, coordName = 'Norte', tab = 'pre', premOpen = false, dreOpen = false;
    let changes = new Map(), volumes = new Map(), cellModes = new Map(), accessUser = null, accessDraft = null;
    const vkey = (r, m, mo) => `${r}|${m}|${mo}`;
    const nf = (v, d = 0) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
    const draftKey = () => `vecton-planning-fat:${deps.org()}:${deps.context().user_id}:${deps.scenario().id}:${formId}`;
    // Nome exibido do modelo: a chave guardada no banco (TRANSGRAIN IN-65) aparece sem o hífen.
    const modelLabel = key => String(key).replace(/(^|\s)IN-(\d)/g, '$1IN$2');
    const ymLabel = ym => `${LOWER[(ym % 100) - 1]}/${String(Math.floor(ym / 100)).slice(2)}`;

    async function read() { return rpc('planning_fat_read', { p_org: deps.org(), p_form: formId }); }
    async function write(action, payload = {}) { return rpc('planning_fat_write', { p_org: deps.org(), p_action: action, p_scenario: deps.scenario().id, p_payload: { form_id: formId, ...payload } }); }
    function index() { volumes = new Map(data.volumes.map(v => [vkey(v.region_key, v.model_key, v.reference_month), v])); cellModes = new Map((data.cell_modes || []).map(c => [`${c.region_key}|${c.model_key}`, c.mode])); }
    // Acesso por coordenação: o admin lança em tudo; os demais, só nas células (região × modelo) cobertas por uma coordenação com escrita.
    const canCell = (region, model) => data.admin !== false || cellModes.get(`${region}|${model}`) === 'write';
    async function open(id, targetTab = 'pre') {
      formId = id; tab = targetTab; changes = new Map(); data = await read(); index();
      const first = data.regions.find(r => r.region_key !== 'PECAS') || data.regions[0];
      metric = 'vol'; regionKey = first?.region_key || null; coordName = 'Norte';
      // Abertura: quem enxerga o todo (admin, ou com todas as coordenações liberadas) abre em Marcher; quem enxerga uma coordenação, em Coordenação (a primeira em ordem alfabética);
      // quem enxerga uma região só, nela.
      view = 'mar';
      if (!((deps.admin() && data.admin !== false) || data.whole === true)) {
        if (data.regions.length <= 1) { view = 'vend'; regionKey = data.regions[0]?.region_key || null; }
        else {
          const mine = [...new Set((data.cell_modes || []).map(c => { const m = data.models.find(x => x.model_key === c.model_key); return m ? coordOf(c.region_key, m.group) : ''; }).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
          if (mine.length) { view = 'coord'; coordName = mine[0]; } else view = 'vend';
        }
        if (isPecas() && metric === 'vol') metric = 'fat';
      }
      accessUser = deps.context().users?.[0]?.user_id || null; accessDraft = null;
      try {
        const draft = JSON.parse(localStorage.getItem(draftKey()) || 'null');
        if (draft && draft.revision === data.revision && Array.isArray(draft.cells)) draft.cells.forEach(c => changes.set(vkey(c.region_key, c.model_key, c.month), c)); else localStorage.removeItem(draftKey());
      } catch (_) { /* rascunho local é opcional */ }
    }

    // ── Cálculo da prévia ──────────────────────────────────────────────────
    const taxes = () => Object.fromEntries(data.taxes.map(t => [t.line, t]));
    const cls = g => (g === 'Transgrain' ? 'tra' : g === 'Acessórios' ? 'ace' : g === 'Linhas complementares' ? 'pec' : 'maq');
    const modelList = () => data.models.slice().sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.sort - b.sort);
    const premiseOf = (region, model) => core.resolvePremise(data.premises.find(p => p.region_key === region && p.model_key === model) || null, data.premises.find(p => p.region_key === 'marcher' && p.model_key === model) || null);
    const coordOf = (region, group) => data.coordination.find(c => c.region_key === region && c.line === LINE[group])?.coordination || '';
    const amountOf = (region, model, month) => { const k = vkey(region, model, month); return changes.has(k) ? changes.get(k).amount : Number(volumes.get(k)?.amount ?? 0); };
    const isPecas = () => (view === 'vend' && regionKey === 'PECAS') || (view === 'coord' && coordName === 'Peças');
    const regionExport = r => { const l = data.coordination.filter(c => c.region_key === r); return l.length > 0 && l.every(c => c.coordination === 'Exportação'); };
    const isExpo = () => (view === 'vend' && regionExport(regionKey)) || (view === 'coord' && coordName === 'Exportação');
    const regionsIn = () => data.regions.map(r => r.region_key).filter(r => r !== 'PECAS');
    const included = (region, m) => (view === 'vend' ? region === regionKey : view === 'coord' ? coordOf(region, m.group) === coordName : true);
    const cellOf = (region, m, month) => core.cell(premiseOf(region, m.model_key), taxes()[cls(m.group)], amountOf(region, m.model_key, month), { exportation: coordOf(region, m.group) === 'Exportação', fatDriven: m.fat_driven });
    const zero = () => ({ q: 0, fat: 0, rl: 0, mp: 0 });
    function history(region, model, year) {
      const c = zero();
      data.history.filter(h => h.region_key === region && h.model_key === model && h.year === year).forEach(h => { c.q += Number(h.qty); c.fat += Number(h.fat); c.rl += Number(h.rl); c.mp += Number(h.mp); });
      return c;
    }
    const sumCells = list => list.reduce((a, c) => core.add(a, c), zero());
    const forms = () => deps.inputMonths();
    function editable() { const r = data.regions.find(x => x.region_key === regionKey); return view === 'vend' && !deps.locked() && r?.mode === 'write' && (deps.admin() || deps.form().status === 'released'); }

    function modelAgg(m) {
      const cells = Array.from({ length: 12 }, zero); let r25 = zero(), r26 = zero(), anyVol = false, mar = false, adj = false, pend = false;
      regionsIn().forEach(r => {
        if (!included(r, m)) return;
        for (let j = 0; j < 12; j++) { if (amountOf(r, m.model_key, j + 1)) { cells[j] = core.add(cells[j], cellOf(r, m, j + 1)); anyVol = true; const origin = premiseOf(r, m.model_key).origin; if (origin === 'marcher') mar = true; else if (origin === 'adjusted') adj = true; else if (!origin) pend = true; } }
        r25 = core.add(r25, history(r, m.model_key, data.year - 2)); r26 = core.add(r26, history(r, m.model_key, data.year - 1));
      });
      return { cells, r25, r26, year: sumCells(cells), anyVol, mar, adj, pend };
    }
    const labelOf = () => (view === 'mar' ? 'Marcher' : view === 'coord' ? coordName : data.regions.find(r => r.region_key === regionKey)?.label || '');
    function responsible() {
      const rows = data.coordination.filter(c => c.region_key === regionKey), pick = l => rows.find(c => c.line === l)?.responsible;
      const a = pick('Grão') || pick('Outros'), b = pick('Pecuária');
      return a && b && a !== b ? `${a} (Grãos) · ${b} (Pecuária)` : a || b || '';
    }
    const emptyRow = (kind, name) => ({ kind, name, months: Array.from({ length: 12 }, zero), r25: zero(), r26: zero(), year: zero() });
    const lvl = (kind, name, list) => ({ kind, name, months: Array.from({ length: 12 }, (_, j) => sumCells(list.map(i => i.cells[j]))), r25: sumCells(list.map(i => i.r25)), r26: sumCells(list.map(i => i.r26)), year: sumCells(list.map(i => i.year)) });

    function gridRows() {
      const ro = view !== 'vend', can = editable(), total = [], body = [];
      GROUPS.forEach(g => {
        const sub = [], rows = [];
        modelList().filter(m => m.group === g && !m.fat_driven).forEach(m => {
          const a = modelAgg(m); if (ro && !(a.year.q || a.r25.q || a.r26.q)) return;
          sub.push(a); if (MACHINE_GROUPS.includes(g)) total.push(a);
          const row = { kind: 'model', name: modelLabel(m.model_key), months: a.cells, r25: a.r25, r26: a.r26, year: a.year, dot: view === 'vend' ? (premiseOf(regionKey, m.model_key).origin === 'adjusted' ? 'a' : data.premises.some(p => p.region_key === regionKey && p.model_key === m.model_key) ? 'l' : premiseOf(regionKey, m.model_key).origin ? 'm' : (a.year.q ? 'n' : '')) : (a.anyVol ? (a.pend ? 'n' : a.adj ? 'a' : a.mar ? 'm' : 'l') : '') };
          if (metric === 'vol' && can && canCell(regionKey, m.model_key)) row.inputs = Array.from({ length: 12 }, (_, j) => ({ model: m.model_key, month: j + 1, display: plain(amountOf(regionKey, m.model_key, j + 1)), dirty: changes.has(vkey(regionKey, m.model_key, j + 1)), disabled: !forms().includes(j + 1) }));
          rows.push(row);
        });
        if (rows.length) body.push({ kind: 'grp', name: g }, ...rows, lvl('sub', 'Total ' + g, sub));
      });
      const pm = view === 'mar' && data.regions.some(r => r.region_key === 'PECAS') && data.models.find(x => x.fat_driven);
      if (pm) { const pa = pecasAgg(pm); body.push({ kind: 'grp', name: 'Linhas complementares' }, { kind: 'model', name: 'Peças', dot: 'l', months: pa.cells, r25: pa.r25, r26: pa.r26, year: pa.year }); }
      return [lvl('top', 'Total Máquinas · ' + labelOf(), total), ...body];
    }
    function pecasAgg(m) {
      const pr = premiseOf('PECAS', m.model_key), cells = Array.from({ length: 12 }, (_, j) => core.cell(pr, taxes().pec, amountOf('PECAS', m.model_key, j + 1), { fatDriven: true }));
      return { cells, r25: history('PECAS', m.model_key, data.year - 2), r26: history('PECAS', m.model_key, data.year - 1), year: sumCells(cells) };
    }
    function pecasRows() {
      const m = data.models.find(x => x.fat_driven);
      const a = pecasAgg(m);
      const can = editable() || (view === 'coord' && !deps.locked() && data.regions.find(r => r.region_key === 'PECAS')?.mode === 'write');
      const row = { kind: 'model', name: 'Peças', dot: 'l', months: a.cells, r25: a.r25, r26: a.r26, year: a.year };
      if (metric === 'fat' && can && canCell('PECAS', m.model_key)) row.inputs = Array.from({ length: 12 }, (_, j) => ({ model: m.model_key, month: j + 1, display: nf(amountOf('PECAS', m.model_key, j + 1)), dirty: changes.has(vkey('PECAS', m.model_key, j + 1)), disabled: !forms().includes(j + 1) }));
      return [lvl('top', 'Total Peças', [a]), { kind: 'grp', name: 'Linhas complementares' }, row];
    }
    function premRows() {
      const rows = []; const tot = zero();
      if (isPecas()) {
        const pr = data.premises.find(p => p.region_key === 'PECAS'), rl = 1 - core.taxSum(taxes().pec) / 100, mp = pr ? pr.mp_unit : 0;
        return { rows: pr ? [{ name: 'Peças', fat: rl, rl: mp, mp: (rl - mp) / rl, mb: null, origin: pr.adjusted ? 'adjusted' : 'local', originLabel: ORIGIN[pr.adjusted ? 'adjusted' : 'local'], window: [...pr.window_months].map(ymLabel).join(' · '), adjustable: true, region: 'PECAS', key: 'PECAS' }] : [], total: { q: 0, fat: 0, rl: 0, mp: 0, mb: null } };
      }
      modelList().filter(m => !m.fat_driven).forEach(m => {
        const a = modelAgg(m), pq = c => c.qp ?? c.q, rlu = c => (pq(c) ? c.rl / pq(c) : 0);
        if (view === 'vend') {
          const local = data.premises.find(p => p.region_key === regionKey && p.model_key === m.model_key), pr = premiseOf(regionKey, m.model_key);
          if (!(a.year.q || local)) return;
          const fu = Number(pr.fat_unit || 0), mu = Number(pr.mp_unit || 0);
          const rl = coordOf(regionKey, m.group) === 'Exportação' ? fu : fu * (1 - core.taxSum(taxes()[cls(m.group)]) / 100);
          const src = local || data.premises.find(p => p.region_key === 'marcher' && p.model_key === m.model_key);
          rows.push({ name: modelLabel(m.model_key), fat: pr.origin ? fu : null, rl: pr.origin ? rl : null, mp: pr.origin ? mu : null, mb: pr.origin ? (rl ? (rl - mu) / rl : 0) : null, origin: pr.origin || 'none', originLabel: ORIGIN[pr.origin] || 'sem premissa', window: [...(src?.window_months || [])].map(ymLabel).join(' · '), adjustable: true, region: regionKey, key: m.model_key });
        } else if (pq(a.year)) rows.push({ name: modelLabel(m.model_key), fat: a.year.fat / pq(a.year), rl: rlu(a.year), mp: a.year.mp / pq(a.year), mb: core.mc1(a.year), origin: 'marcher', originLabel: 'média dos territórios', window: 'ponderada pelo volume', adjustable: false, region: '', key: m.model_key });
        tot.q += pq(a.year); tot.fat += a.year.fat; tot.rl += a.year.rl; tot.mp += a.year.mp;
      });
      return { rows, total: { q: tot.q, fat: tot.q ? tot.fat / tot.q : 0, rl: tot.q ? tot.rl / tot.q : 0, mp: tot.q ? tot.mp / tot.q : 0, mb: core.mc1(tot) } };
    }
    function dreParts() {
      const parts = { maq: Array.from({ length: 12 }, zero), tra: Array.from({ length: 12 }, zero), ace: Array.from({ length: 12 }, zero), exp: Array.from({ length: 12 }, zero), pec: Array.from({ length: 12 }, zero) };
      if (!isPecas()) modelList().filter(m => !m.fat_driven).forEach(m => regionsIn().forEach(r => {
        if (!included(r, m)) return; const dst = coordOf(r, m.group) === 'Exportação' ? parts.exp : m.group === 'Transgrain' ? parts.tra : m.group === 'Acessórios' ? parts.ace : parts.maq;
        for (let j = 0; j < 12; j++) if (amountOf(r, m.model_key, j + 1)) dst[j] = core.add(dst[j], cellOf(r, m, j + 1));
      }));
      const pm = data.models.find(x => x.fat_driven);
      if (pm && (isPecas() || view === 'mar') && data.regions.some(r => r.region_key === 'PECAS')) for (let j = 0; j < 12; j++) parts.pec[j] = cellOf('PECAS', pm, j + 1);
      return parts;
    }
    function accessModel() {
      if (!accessDraft) accessDraft = new Map(data.access.map(a => [`${a.user_id}|${a.coord_key}`, a.access_mode]));
      const users = deps.context().users || [];
      return { users, userId: accessUser, dirty: accessDraft.__dirty === true, coords: (data.coords || []).filter(c => c.key !== 'MARCHER').map(c => ({ key: c.key, label: c.name, mode: accessDraft.get(`${accessUser}|${c.key}`) || 'none' })) };
    }
    function viewModel(f) {
      const tx = taxes(), pecas = isPecas(), win = (data.window_months || []).map(ymLabel).join(' · ');
      const sumTax = t => core.taxSum(t);
      return { form: f, tab, view, metric, year: data.year, refYears: [data.year - 2, data.year - 1], admin: deps.admin(), locked: deps.locked(), dirty: changes.size > 0, stale: data.stale, orphans: data.orphans || 0, windowLabel: win,
        regions: data.regions.map(r => ({ key: r.region_key, label: r.label })), coords: ['Exportação', 'Norte', 'Oeste', 'Peças', 'Pecuária', 'Sul'], regionKey, coordName, label: labelOf(), responsible: responsible(), pecas,
        tag: pecas ? 'VOL = 1' : view === 'vend' ? (isExpo() ? 'FAT = RL' : '') : isExpo() ? 'Somente leitura · FAT = RL' : 'Somente leitura',
        rows: pecas ? pecasRows() : gridRows(), prem: premRows(), premOpen, dreOpen, dre: core.dreLines(dreParts(), tx),
        taxes: [['maq', 'Máquinas'], ['tra', 'Transgrain'], ['ace', 'Acessórios'], ['pec', 'Peças']].map(([line, label]) => ({ line, label, ...Object.fromEntries(['ipi', 'icms', 'pis', 'cofins'].map(k => [k, Number(tx[line]?.[k] || 0)])), sum: sumTax(tx[line]) })), access: deps.admin() ? accessModel() : null };
    }
    const html = f => views.form(viewModel(f));

    // ── Ações ──────────────────────────────────────────────────────────────
    function persistDraft() { try { if (changes.size) localStorage.setItem(draftKey(), JSON.stringify({ revision: data.revision, cells: [...changes.values()] })); else localStorage.removeItem(draftKey()); } catch (_) { /* opcional */ } }
    // Vírgula é decimal; ponto sozinho com 1 ou 2 casas também; ponto de milhar é ignorado.
    function parseAmount(text) {
      const raw = String(text).trim(); if (!raw) return 0;
      const norm = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : /^\d+\.\d{1,2}$/.test(raw) ? raw : raw.replace(/\./g, '');
      const n = Number(norm);
      if (!/^\d+(\.\d+)?$/.test(norm) || !Number.isFinite(n)) throw Error('valor inválido'); return n;
    }
    const plain = n => String(n).replace('.', ',');
    function input(el) {
      const model = el.dataset.model, month = Number(el.dataset.month), region = isPecas() ? 'PECAS' : regionKey; let amount;
      let typed = el.value; try { amount = parseAmount(typed); } catch (_) { return; }
      if (!isPecas() && !Number.isInteger(amount)) { amount = amountOf(region, model, month); typed = plain(amount); }
      const k = vkey(region, model, month), saved = Number(volumes.get(k)?.amount ?? 0);
      if (amount === saved) changes.delete(k); else changes.set(k, { region_key: region, model_key: model, month, amount, version: volumes.get(k)?.row_version ?? 0 });
      persistDraft(); deps.render(); const next = deps.root().querySelector(`input[data-fat="vol"][data-model="${CSS.escape(model)}"][data-month="${month}"]`); if (next) { next.value = typed; next.focus(); next.setSelectionRange?.(99, 99); }
    }
    async function change(el) {
      switch (el.dataset.fat) {
        case 'region': regionKey = el.value; if (isPecas() && metric === 'vol') metric = 'fat'; return deps.render();
        case 'coord': coordName = el.value; if (isPecas() && metric === 'vol') metric = 'fat'; return deps.render();
        case 'access-user': accessUser = el.value; return deps.render();
        case 'access': { if (!accessDraft) accessModel(); const k = `${el.dataset.user}|${el.dataset.coord}`; if (el.value === 'none') accessDraft.delete(k); else accessDraft.set(k, el.value); accessDraft.__dirty = true; return deps.render(); }
        case 'tax': {
          const t = data.taxes.find(x => x.line === el.dataset.line), next = { line: t.line, ipi: t.ipi, icms: t.icms, pis: t.pis, cofins: t.cofins, version: t.version };
          next[el.dataset.key] = parseAmount(el.value);
          await write('save_taxes', next); data = await read(); index(); return deps.render();
        }
        default: return undefined;
      }
    }
    async function save() {
      const cells = [...changes.values()].map(c => ({ region_key: c.region_key, model_key: c.model_key, month: c.month, amount: String(c.amount), version: c.version }));
      const result = await write('save_volumes', { form_revision: data.revision, cells });
      if (result.ok === false) { data = await read(); index(); changes.forEach((c, k) => { c.version = volumes.get(k)?.row_version ?? 0; }); persistDraft(); deps.render(); throw Error('Outra pessoa alterou valores desta grade. Revise os campos marcados e salve novamente.'); }
      changes = new Map(); persistDraft(); data = await read(); index(); deps.render();
    }
    async function integrate() {
      if (changes.size) await save();
      const rows = await rpc('planning_fat_overlap', { p_org: deps.org(), p_form: formId });
      const run = async () => {
        const result = await rpc('planning_integrate_all', { p_org: deps.org(), p_scenario: deps.scenario().id, p_form: formId });
        deps.invalidate();
        if (!result.ok) { await deps.refresh(); throw Error(result.error || 'Falha na integração'); }
        deps.close(); await deps.refresh(); data = await read(); index(); deps.render();
        const notes = result.notes || [], pending = result.fat?.pending || 0;
        deps.toast(`Integração concluída · ${result.rows_written} linhas${pending ? ` · ${pending} linhas do FAT sem premissa ignoradas` : ''}${notes.length ? ` · ${notes.join('; ')}` : ''}`, pending || notes.length ? 'warning' : 'success');
      };
      if (rows.length) return deps.modal('Valores também em outro formulário', views.overlapModal(rows), run, false, 'Integrar mesmo assim');
      return run();
    }
    function adjust(el) {
      const region = el.dataset.region, model = el.dataset.model, own = data.premises.find(x => x.region_key === region && x.model_key === model);
      const p = own || data.premises.find(x => x.region_key === 'marcher' && x.model_key === model) || { fat_unit: '', mp_unit: '' };
      const pecas = region === 'PECAS', fatInput = pecas ? '' : `<label class="pl-field">FAT/un<input class="pl-input" id="fat-adj-fat" value="${esc(plain(own ? p.adj_fat ?? p.calc_fat_unit ?? p.fat_unit : p.fat_unit))}"></label>`;
      return deps.modal(`Ajustar premissa · ${modelLabel(model)}`, `${fatInput}<label class="pl-field">${pecas ? 'MP/FAT' : 'MP/un'}<input class="pl-input" id="fat-adj-mp" value="${esc(plain(own ? p.adj_mp ?? p.calc_mp_unit ?? p.mp_unit : p.mp_unit))}"></label>${own ? `<p class="pl-note">Valor do histórico: ${nf(p.calc_fat_unit, pecas ? 0 : 2)} · ${nf(p.calc_mp_unit, pecas ? 3 : 2)}</p>` : ''}`, async () => {
        const num = id => { const v = deps.root().querySelector(id)?.value; return v == null || v.trim() === '' ? null : parseAmount(v); };
        await write('adjust_premise', { region_key: region, model_key: model, adj_fat: pecas ? null : num('#fat-adj-fat'), adj_mp: num('#fat-adj-mp'), version: own ? own.version : null });
        deps.close(); data = await read(); index(); deps.render();
      });
    }

    // ── Excel (mesmo modelo do Evolutivo de Margens) ───────────────────────
    // A tabela da tela se repete lado a lado (VOL | FAT | RL | MP | MC1%), cada bloco com os dois anos de
    // referência, os 12 meses e o total do ano; vale a visão e o filtro abertos (Marcher, Coordenação ou Região).
    const XL_METRICS = [['vol', 'VOL', 'unidades'], ['fat', 'FAT', 'R$/un'], ['rl', 'RL', 'R$/un'], ['mp', 'MP', 'R$/un'], ['mb', 'MC1%', '%']];
    const XL_BORDER = { style: 'thin', color: { argb: 'FFE1E5EC' } }, XL_BORDER_ALL = { top: XL_BORDER, left: XL_BORDER, bottom: XL_BORDER, right: XL_BORDER };
    const xlFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const xlFormat = (v, key) => (key === 'mb' ? '0.0%' : key === 'vol' ? (Number.isInteger(Math.round(v * 100) / 100) ? '#,##0' : '#,##0.0') : Math.abs(v) < 100 ? '#,##0.00' : '#,##0');
    const slug = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    function buildWorkbook(vm) {
      const blockW = 15; // ano-2, ano-1, 12 meses e o total do ano
      const wb = new global.ExcelJS.Workbook(); wb.creator = 'VectonPlan'; wb.created = new Date();
      const ws = wb.addWorksheet('Vendas · Projeção de volumes', {
        views: [{ state: 'frozen', xSplit: 1, ySplit: 6, showGridLines: false }],
        pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .3, right: .3, top: .4, bottom: .4, header: .2, footer: .2 } } });
      const lastCol = 1 + XL_METRICS.length * blockW;
      ws.getColumn(1).width = 34; for (let c = 2; c <= lastCol; c++) ws.getColumn(c).width = 10.5;
      ws.getCell('A1').value = `${deps.scenario().name} · ${vm.form.name}`; ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF172033' } };
      const meta = ws.getCell('A2'); meta.value = `${vm.label} · ${vm.tag || 'volume por território'}`; meta.font = { size: 10, color: { argb: 'FF556070' } };
      const gen = ws.getCell('A4'); gen.value = `Gerado em ${new Date().toLocaleString('pt-BR')}`; gen.font = { size: 9, italic: true, color: { argb: 'FF7A8494' } };
      const headFill = xlFill('FFF1F3F7');
      const hd = (cell, text, align = 'center') => { cell.value = text; cell.font = { bold: true, size: 9.5, color: { argb: 'FF334055' } }; cell.fill = headFill; cell.border = XL_BORDER_ALL; cell.alignment = { horizontal: align, vertical: 'middle', wrapText: true }; };
      ws.mergeCells('A5:A6'); hd(ws.getCell('A5'), '', 'left');
      XL_METRICS.forEach(([, label, unit], b) => {
        const c0 = 2 + b * blockW; ws.mergeCells(5, c0, 5, c0 + blockW - 1); hd(ws.getCell(5, c0), `${label} · ${unit}`);
        for (let c = c0 + 1; c < c0 + blockW; c++) { ws.getCell(5, c).fill = headFill; ws.getCell(5, c).border = XL_BORDER_ALL; }
        vm.refYears.forEach((y, i) => hd(ws.getCell(6, c0 + i), String(y))); months.forEach((m, i) => hd(ws.getCell(6, c0 + 2 + i), m.toUpperCase())); hd(ws.getCell(6, c0 + blockW - 1), String(vm.year));
      });
      ws.getRow(5).height = 18; ws.getRow(6).height = 18;
      let r = 7;
      vm.rows.forEach(row => {
        if (row.kind === 'grp') {
          for (let c = 1; c <= lastCol; c++) { const cell = ws.getCell(r, c); cell.fill = xlFill('FFE9EDF5'); cell.border = XL_BORDER_ALL; }
          const c1 = ws.getCell(r, 1); c1.value = row.name.toUpperCase(); c1.font = { bold: true, size: 10, color: { argb: 'FF334055' } }; r++; return;
        }
        const fill = row.kind === 'top' ? xlFill('FFDDE5F5') : row.kind === 'sub' ? xlFill('FFF6F8FB') : null, bold = row.kind !== 'model';
        const name = ws.getCell(r, 1); name.value = row.name; name.border = XL_BORDER_ALL; name.alignment = { horizontal: 'left', vertical: 'middle', indent: row.kind === 'model' ? 1 : 0 }; name.font = { bold, size: 10, color: { argb: 'FF172033' } }; if (fill) name.fill = fill;
        XL_METRICS.forEach(([key], b) => {
          const c0 = 2 + b * blockW;
          [row.r25, ...row.months.slice(0, 12), row.year].forEach((cellData, i) => {
            const cell = ws.getCell(r, c0 + i), v = core.metric(cellData, key), rf = fill || (i === 0 || i === 1 || i === blockW - 1 ? xlFill('FFEEF2FB') : null);
            cell.border = XL_BORDER_ALL; cell.alignment = { horizontal: 'right', vertical: 'middle' }; if (rf) cell.fill = rf;
            if (v == null || !Number.isFinite(v)) { cell.value = '–'; cell.font = { bold, size: 10, color: { argb: 'FF9AA3B2' } }; return; }
            cell.value = key === 'mb' ? v : Math.round(v * 1e6) / 1e6; cell.numFmt = xlFormat(v, key); cell.font = { bold, size: 10, color: { argb: 'FF172033' } };
          });
        });
        r++;
      });
      r += 1;
      ['Valores unitários (R$ ÷ volume) em FAT, RL e MP; VOL em unidades · MC1% = (RL − MP) ÷ RL · – = sem volume',
        `Colunas ${vm.refYears[0]} e ${vm.refYears[1]} = realizado; ${vm.year} = projeção digitada no formulário (mesmos números da tela)`].forEach(t => { const c = ws.getCell(r++, 1); c.value = t; c.font = { size: 9, italic: true, color: { argb: 'FF7A8494' } }; });
      return wb;
    }
    async function exportExcel() {
      if (!global.ExcelJS) throw Error('Biblioteca de exportação indisponível');
      const vm = viewModel(deps.form());
      const buffer = await buildWorkbook(vm).xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = `fat-vendas-${slug(vm.label)}-${vm.year}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    // Atualizar premissas: avisa que está calculando e, ao fim, o que mudou (ou o erro), já que o botão não tem retorno visual próprio.
    async function refreshPremises() {
      const dismiss = deps.toast('Atualizando premissas…', 'info');
      try {
        const result = await write('refresh_premises');
        data = await read(); index(); deps.render();
        if (typeof dismiss === 'function') dismiss();
        const base = (result.window_months || []).map(ymLabel).join(' · '), pending = result.pending || 0;
        deps.toast(`Premissas atualizadas · ${result.rows ?? 0} premissas${base ? ` · base ${base}` : ''}${pending ? ` · ${pending} modelo(s) sem histórico` : ''}`, pending ? 'warning' : 'success');
      } catch (err) {
        if (typeof dismiss === 'function') dismiss();
        deps.toast(`Não foi possível atualizar as premissas: ${err?.message || err}`, 'error');
        throw err;
      }
    }
    async function action(name, el) {
      switch (name) {
        case 'fat-export': return exportExcel();
        case 'fat-view': view = el.dataset.v; if (isPecas() && metric === 'vol') metric = 'fat'; return deps.render();
        case 'fat-metric': metric = el.dataset.m; return deps.render();
        case 'fat-tab': tab = el.dataset.tab; return deps.render();
        case 'fat-toggle': if (el.dataset.id === 'prem') premOpen = !premOpen; else dreOpen = !dreOpen; return deps.render();
        case 'fat-save': return save();
        case 'fat-discard': changes = new Map(); persistDraft(); return deps.render();
        case 'fat-refresh': return refreshPremises();
        case 'fat-adjust': return adjust(el);
        case 'fat-release': { const f = deps.form(); await write('set_status', { status: f.status === 'released' ? 'draft' : 'released' }); await deps.refresh(); data = await read(); index(); return deps.render(); }
        case 'fat-access-save': {
          const access = [...accessDraft.entries()].map(([k, mode]) => { const [user_id, coord_key] = k.split('|'); return { user_id, coord_key, access_mode: mode }; });
          await write('save_access', { access }); await deps.refresh(); data = await read(); index(); accessDraft = null; return deps.render();
        }
        default: return undefined;
      }
    }
    // Importação (popover em planningImportModule.js): template da carga de planejado vendas; a validação e a gravação dos volumes são do servidor.
    function importInfo(f) {
      const { cellText, normalizeAmount } = global.VECTON_PLANNING_IMPORT, text = v => cellText(v).trim(), amt = v => text(v) ? normalizeAmount(v) : null, dec = v => text(v) ? text(v).replace(',', '.') : null;
      return { name: f.name, slug: 'fat', sheet: 'Meta Vendas',
        columns: [{ key: 'cod_produto', label: 'cod_produto', required: true }, { key: 'month', label: 'mes', required: true }, { key: 'territorio', label: 'territorio' },
          { key: 'quantidade', label: 'quantidade' }, { key: 'valor', label: 'valor' }, { key: 'mc1', label: 'MC1%' }],
        send: rows => rpc('planning_fat_import', { p_org: deps.org(), p_form: f.id, p_rows: rows.map(r => ({ row: r.row, cod_produto: text(r.cod_produto), month: text(r.month), territorio: text(r.territorio), quantidade: amt(r.quantidade), valor: amt(r.valor), mc1: dec(r.mc1) })) }) };
    }
    return { open, html, input, change, action, integrate, save, importInfo, dirty: () => changes.size > 0, discard: () => { changes = new Map(); persistDraft(); }, listRow: views.listRow, overlapHtml: views.overlapModal };
  }
  global.VECTON_PLANNING_FAT = { createFatController };
})(window);
