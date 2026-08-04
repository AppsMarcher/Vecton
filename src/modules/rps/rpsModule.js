(function attachVectonRpsModule(window) {
  const WEEKS = ["S1", "S2", "S3", "S4", "S5"];
  const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const TABLE = "rps_snapshots";
  const DRAFT_PREFIX = "vecton-rps-draft-v1";

  const DEFAULT_AREAS = [
    { id: "comercial", nome: "COMERCIAL", cor: "#4f7cff" },
    { id: "industrial", nome: "INDUSTRIAL", cor: "#22c55e" },
    { id: "supply", nome: "SUPPLY", cor: "#f59e0b" },
    { id: "rh", nome: "RECURSOS HUMANOS", cor: "#ec4899" },
    { id: "financeiro", nome: "FINANCEIRO", cor: "#8b5cf6" },
    { id: "sac", nome: "SAC · GARANTIAS", cor: "#38bdf8" },
    { id: "engenharia", nome: "ENGENHARIA", cor: "#14b8a6" }
  ];

  const DEFAULT_INDICATORS = {
    comercial: ["Faturamento", "Nacional", "Exportação", "Graneleiro", "Pedidos em carteira", "Novos clientes", "Meta atingida"],
    industrial: ["Produção total", "Eficiência OEE", "Retrabalho", "Paradas planejadas"],
    supply: ["Nível de estoque", "OTIF", "Lead time médio", "Custo de frete"],
    rh: ["Headcount ativo", "Absenteísmo", "Horas extras", "Treinamentos"],
    financeiro: ["Receita líquida", "DRE - EBITDA", "Inadimplência", "Fluxo de caixa"],
    sac: ["Chamados abertos", "Tempo médio resposta", "NPS", "Garantias acionadas"],
    engenharia: ["Projetos em andamento", "Horas de projeto", "Homologações", "Desvios técnicos"]
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const slugify = (value) => String(value || "indicador")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "indicador";
  const valueKey = (areaId, indicatorId, column) => `${areaId}|${indicatorId}|${column}`;
  const monthValueKey = (areaId, indicatorId) => `vmes:${areaId}|${indicatorId}`;
  const targetValueKey = (areaId, indicatorId) => `vmeta:${areaId}|${indicatorId}`;
  const commentKey = (areaId, indicatorId, column) => `cmt:${areaId}|${indicatorId}|${column}`;

  function defaultPayload() {
    return {
      version: 2,
      areas: clone(DEFAULT_AREAS),
      indicadores: Object.fromEntries(Object.entries(DEFAULT_INDICATORS).map(([areaId, labels]) => [
        areaId,
        labels.map((label, index) => ({
          id: `${slugify(label)}_${index}`,
          label,
          type: "item",
          parentId: null,
          aggregate: null,
          editableFields: { label: true, semanas: true, mes: false, meta: true }
        }))
      ])),
      unidades: {},
      dados: {},
      cellStyles: {},
      comentarios: {},
      dadosMes: {},
      dadosMeta: {},
      anexos: {},
      modoMes: {},
      modoMeta: {}
    };
  }

  function normalizeIndicator(item, index) {
    if (typeof item === "string") {
      return { id: `${slugify(item)}_${index}`, label: item, type: "item", editableFields: { semanas: true, meta: true } };
    }
    return {
      id: item?.id || `${slugify(item?.label)}_${index}`,
      label: item?.label || "Indicador",
      type: item?.type || "item",
      parentId: item?.parentId || null,
      aggregate: item?.aggregate || null,
      editableFields: { semanas: true, meta: true, ...(item?.editableFields || {}) }
    };
  }

  function normalizePayload(raw) {
    const fallback = defaultPayload();
    const source = raw && typeof raw === "object" ? raw : {};
    const areas = Array.isArray(source.areas) && source.areas.length ? clone(source.areas) : fallback.areas;
    const indicadores = {};
    areas.forEach((area) => {
      const list = Array.isArray(source.indicadores?.[area.id])
        ? source.indicadores[area.id]
        : fallback.indicadores[area.id] || [];
      indicadores[area.id] = list.map(normalizeIndicator);
    });
    return {
      version: Math.max(Number(source.version) || 2, 2),
      areas,
      indicadores,
      unidades: clone(source.unidades || {}),
      dados: clone(source.dados || {}),
      cellStyles: clone(source.cellStyles || {}),
      comentarios: clone(source.comentarios || {}),
      dadosMes: clone(source.dadosMes || {}),
      dadosMeta: clone(source.dadosMeta || {}),
      anexos: clone(source.anexos || {}),
      modoMes: clone(source.modoMes || {}),
      modoMeta: clone(source.modoMeta || {})
    };
  }

  function entry(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key)
      ? { exists: true, value: object[key] }
      : { exists: false, value: undefined };
  }

  function sameEntry(left, right) {
    return left.exists === right.exists && equal(left.value, right.value);
  }

  function mergeMap(base, remote, local, metadata) {
    const result = {};
    const keys = new Set([...Object.keys(base || {}), ...Object.keys(remote || {}), ...Object.keys(local || {})]);
    keys.forEach((key) => {
      const b = entry(base, key);
      const r = entry(remote, key);
      const l = entry(local, key);
      const localChanged = !sameEntry(l, b);
      const remoteChanged = !sameEntry(r, b);
      let chosen;
      if (localChanged && !remoteChanged) chosen = l;
      else if (!localChanged && remoteChanged) chosen = r;
      else if (!localChanged && !remoteChanged) chosen = r;
      else if (sameEntry(l, r)) chosen = l;
      else {
        chosen = l;
        metadata.conflicts += 1;
      }
      if (chosen.exists) result[key] = clone(chosen.value);
    });
    return result;
  }

  function mergeEntities(baseList, remoteList, localList, metadata) {
    const toMap = (list) => Object.fromEntries((Array.isArray(list) ? list : []).map((item) => [String(item?.id || ""), item]).filter(([id]) => id));
    const merged = mergeMap(toMap(baseList), toMap(remoteList), toMap(localList), metadata);
    const order = [];
    const seen = new Set();
    [localList, remoteList, baseList].forEach((list) => (Array.isArray(list) ? list : []).forEach((item) => {
      const id = String(item?.id || "");
      if (id && merged[id] && !seen.has(id)) {
        seen.add(id);
        order.push(clone(merged[id]));
      }
    }));
    return order;
  }

  function mergePayloads(baseRaw, remoteRaw, localRaw) {
    const base = normalizePayload(baseRaw);
    const remote = normalizePayload(remoteRaw);
    const local = normalizePayload(localRaw);
    const metadata = { conflicts: 0 };
    const areas = mergeEntities(base.areas, remote.areas, local.areas, metadata);
    const indicadores = {};
    const areaIds = new Set([...Object.keys(base.indicadores), ...Object.keys(remote.indicadores), ...Object.keys(local.indicadores)]);
    areaIds.forEach((areaId) => {
      indicadores[areaId] = mergeEntities(base.indicadores[areaId], remote.indicadores[areaId], local.indicadores[areaId], metadata);
    });
    const result = { version: 2, areas, indicadores };
    ["unidades", "dados", "cellStyles", "comentarios", "dadosMes", "dadosMeta", "anexos", "modoMes", "modoMeta"].forEach((section) => {
      result[section] = mergeMap(base[section], remote[section], local[section], metadata);
    });
    return { payload: result, conflicts: metadata.conflicts };
  }

  function parseNumber(raw) {
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    const text = String(raw ?? "").trim();
    if (!text) return null;
    const normalized = text.includes(",")
      ? text.replace(/\./g, "").replace(",", ".")
      : text;
    const value = Number(normalized.replace(/[^0-9+\-.]/g, ""));
    return Number.isFinite(value) ? value : null;
  }

  function formatNumber(value) {
    if (value === null || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
  }

  function createRpsModule(deps) {
    const {
      root,
      getPeriod,
      resolveOrganizationId,
      authenticatedFetch,
      supabaseApiUrl,
      getCurrentUser,
      getAccessRole,
      appAlert,
      escapeHtml
    } = deps;

    const state = {
      periodKey: "",
      organizationId: null,
      payload: defaultPayload(),
      basePayload: null,
      remoteVersion: 0,
      loading: false,
      dirty: false,
      status: "idle",
      message: "",
      lastSavedAt: "",
      collapsed: new Set(),
      backendAvailable: true,
      loadGeneration: 0,
      presentation: false
    };

    let saveTimer = null;
    let maxSaveTimer = null;
    let saveInFlight = null;
    let saveRequested = false;
    let eventsBound = false;

    const canEdit = () => ["super_admin", "admin", "manager"].includes(String(getAccessRole?.() || ""));
    const currentPeriod = () => {
      const period = getPeriod();
      return { year: Number(period.year), month: Number(period.month) };
    };
    const currentPeriodKey = () => {
      const { year, month } = currentPeriod();
      return `${year}-${String(month).padStart(2, "0")}`;
    };
    const draftKey = () => `${DRAFT_PREFIX}:${getCurrentUser?.()?.id || "anonymous"}:${state.organizationId || "org"}:${state.periodKey}`;

    function persistDraft() {
      try {
        localStorage.setItem(draftKey(), JSON.stringify({ savedAt: new Date().toISOString(), payload: state.payload }));
      } catch (_) { /* best effort */ }
    }

    function clearDraft() {
      try { localStorage.removeItem(draftKey()); } catch (_) { /* best effort */ }
    }

    function readDraft() {
      try {
        const parsed = JSON.parse(localStorage.getItem(draftKey()) || "null");
        return parsed?.payload ? parsed : null;
      } catch (_) {
        return null;
      }
    }

    function setStatus(status, message) {
      state.status = status;
      state.message = message;
      updateStatusElements();
    }

    function updateStatusElements() {
      const pill = root?.querySelector("[data-rps-status]");
      const text = root?.querySelector("[data-rps-status-text]");
      if (pill) pill.dataset.state = state.status;
      if (text) text.textContent = state.message || statusLabel();
    }

    function statusLabel() {
      if (state.loading) return "Carregando dados...";
      if (state.status === "saving") return "Salvando alterações...";
      if (state.status === "error") return state.message || "Falha na sincronização";
      if (state.dirty) return "Alterações pendentes";
      if (state.lastSavedAt) return `Salvo às ${state.lastSavedAt}`;
      return "Sincronizado";
    }

    function getIndicators(areaId) {
      return Array.isArray(state.payload.indicadores?.[areaId]) ? state.payload.indicadores[areaId] : [];
    }

    function getUnit(areaId, indicatorId) {
      return state.payload.unidades[valueKey(areaId, indicatorId, "S1")]
        || state.payload.unidades[`${areaId}|${indicatorId}`]
        || "";
    }

    function getMonthValue(areaId, indicatorId) {
      const manual = parseNumber(state.payload.dadosMes[monthValueKey(areaId, indicatorId)]);
      if (state.payload.modoMes[`mes:${areaId}|${indicatorId}`] === "manual" && manual !== null) return manual;
      const values = WEEKS.map((week) => parseNumber(state.payload.dados[valueKey(areaId, indicatorId, week)])).filter((value) => value !== null);
      if (!values.length) return manual;
      const mode = state.payload.modoMes[`mes:${areaId}|${indicatorId}`] || "soma";
      if (mode === "media") return values.reduce((sum, value) => sum + value, 0) / values.length;
      if (mode === "ultima") return values[values.length - 1];
      return values.reduce((sum, value) => sum + value, 0);
    }

    function getTargetValue(areaId, indicatorId) {
      return parseNumber(state.payload.dadosMeta[targetValueKey(areaId, indicatorId)]);
    }

    function completionSummary() {
      let total = 0;
      let filled = 0;
      state.payload.areas.forEach((area) => getIndicators(area.id).forEach((indicator) => {
        WEEKS.forEach((week) => {
          total += 1;
          if (String(state.payload.dados[valueKey(area.id, indicator.id, week)] || "").trim()) filled += 1;
        });
      }));
      return { total, filled, percent: total ? Math.round((filled / total) * 100) : 0 };
    }

    function renderRows() {
      const editable = canEdit();
      return state.payload.areas.map((area) => {
        const indicators = getIndicators(area.id);
        const collapsed = state.collapsed.has(area.id);
        const areaHeader = `
          <tr class="rps-area-row" style="--rps-area-color:${escapeHtml(area.cor || "#4f7cff")}">
            <th colspan="10">
              <button type="button" class="rps-area-toggle" data-rps-toggle-area="${escapeHtml(area.id)}" aria-expanded="${!collapsed}">
                <span class="rps-area-dot"></span>
                <span>${escapeHtml(area.nome || area.id)}</span>
                <small>${indicators.length} indicadores</small>
                <span class="rps-area-chevron">${collapsed ? "›" : "⌄"}</span>
              </button>
            </th>
          </tr>`;
        if (collapsed) return areaHeader;
        const rows = indicators.map((indicator) => {
          const month = getMonthValue(area.id, indicator.id);
          const target = getTargetValue(area.id, indicator.id);
          const variation = month !== null && target !== null ? month - target : null;
          const percent = variation !== null && target ? (variation / Math.abs(target)) * 100 : null;
          const trendClass = variation === null ? "neutral" : variation >= 0 ? "positive" : "negative";
          const unit = getUnit(area.id, indicator.id);
          const weekCells = WEEKS.map((week) => {
            const key = valueKey(area.id, indicator.id, week);
            const comment = state.payload.comentarios[commentKey(area.id, indicator.id, week)];
            return `<td class="rps-value-cell">
              <input class="rps-cell-input" data-rps-value-key="${escapeHtml(key)}" value="${escapeHtml(state.payload.dados[key] || "")}" inputmode="decimal" ${editable ? "" : "disabled"} aria-label="${escapeHtml(`${indicator.label} ${week}`)}">
              <button class="rps-comment-button ${comment ? "has-comment" : ""}" type="button" data-rps-comment="${escapeHtml(commentKey(area.id, indicator.id, week))}" title="Comentário">●</button>
            </td>`;
          }).join("");
          const targetKey = targetValueKey(area.id, indicator.id);
          return `<tr class="rps-indicator-row" data-area-id="${escapeHtml(area.id)}" data-indicator-id="${escapeHtml(indicator.id)}">
            <th scope="row">
              <div class="rps-indicator-name"><span>${escapeHtml(indicator.label)}</span>${unit ? `<em>${escapeHtml(unit)}</em>` : ""}</div>
            </th>
            ${weekCells}
            <td class="rps-calculated-cell"><strong>${formatNumber(month)}</strong></td>
            <td class="rps-value-cell rps-target-cell">
              <input class="rps-cell-input" data-rps-target-key="${escapeHtml(targetKey)}" value="${escapeHtml(state.payload.dadosMeta[targetKey] || "")}" inputmode="decimal" ${editable ? "" : "disabled"} aria-label="Meta de ${escapeHtml(indicator.label)}">
              <button class="rps-comment-button ${state.payload.comentarios[commentKey(area.id, indicator.id, "meta")] ? "has-comment" : ""}" type="button" data-rps-comment="${escapeHtml(commentKey(area.id, indicator.id, "meta"))}" title="Comentário">●</button>
            </td>
            <td class="rps-variation ${trendClass}">${variation === null ? "—" : `${variation > 0 ? "+" : ""}${formatNumber(variation)}`}</td>
            <td class="rps-variation ${trendClass}">${percent === null ? "—" : `${percent > 0 ? "+" : ""}${formatNumber(percent)}%`}</td>
          </tr>`;
        }).join("");
        return areaHeader + rows;
      }).join("");
    }

    function renderShell() {
      if (!root) return;
      const { year, month } = currentPeriod();
      const completion = completionSummary();
      const indicatorCount = state.payload.areas.reduce((sum, area) => sum + getIndicators(area.id).length, 0);
      const editable = canEdit();
      root.innerHTML = `
        <div class="rps-page ${state.presentation ? "is-presenting" : ""}">
          <div class="rps-hero">
            <div class="rps-hero-copy">
              <p class="section-kicker">GESTÃO DE PERFORMANCE</p>
              <div class="rps-title-line">
                <h2>Reunião de Performance Semanal</h2>
                <span class="rps-period-chip">${MONTHS[month - 1]} · ${year}</span>
              </div>
              <p>Acompanhe indicadores, metas e desvios de todas as áreas em uma única visão executiva.</p>
            </div>
            <div class="rps-toolbar">
              <button type="button" class="rps-action" data-rps-action="refresh" title="Recarregar dados">↻ <span>Atualizar</span></button>
              <button type="button" class="rps-action" data-rps-action="export" title="Exportar planilha">⇩ <span>Exportar</span></button>
              ${editable ? `<button type="button" class="rps-action" data-rps-action="add">＋ <span>Indicador</span></button>` : ""}
              <button type="button" class="rps-action rps-action-primary" data-rps-action="present">▣ <span>${state.presentation ? "Sair" : "Apresentar"}</span></button>
            </div>
          </div>

          <div class="rps-summary-grid">
            <article class="rps-summary-card"><span>Preenchimento</span><strong>${completion.percent}%</strong><div class="rps-progress"><i style="width:${completion.percent}%"></i></div><small>${completion.filled} de ${completion.total} células</small></article>
            <article class="rps-summary-card"><span>Áreas acompanhadas</span><strong>${state.payload.areas.length}</strong><small>Visão consolidada do período</small></article>
            <article class="rps-summary-card"><span>Indicadores ativos</span><strong>${indicatorCount}</strong><small>Semanais e metas mensais</small></article>
            <article class="rps-summary-card rps-sync-card"><span>Status da base</span><strong class="rps-status-pill" data-rps-status data-state="${state.status}"><i></i><span>${state.backendAvailable ? "Nuvem" : "Local"}</span></strong><small data-rps-status-text>${escapeHtml(statusLabel())}</small></article>
          </div>

          <section class="content-card rps-table-card">
            <div class="rps-table-heading">
              <div><h3>Painel de indicadores</h3><p>Valores semanais, consolidado do mês e comparação com a meta.</p></div>
              <div class="rps-legend"><span><i class="positive"></i> Acima da meta</span><span><i class="negative"></i> Abaixo da meta</span></div>
            </div>
            <div class="rps-table-scroll ${state.loading ? "is-loading" : ""}">
              <table class="rps-table">
                <thead><tr><th>Área / indicador</th>${WEEKS.map((week) => `<th>${week}</th>`).join("")}<th>Mês</th><th>Meta</th><th>Var.</th><th>Var. %</th></tr></thead>
                <tbody>${renderRows()}</tbody>
              </table>
              ${state.loading ? `<div class="rps-loading"><span></span><p>Carregando o período...</p></div>` : ""}
            </div>
          </section>
        </div>`;
      document.body.classList.toggle("rps-presentation-mode", state.presentation);
      updateStatusElements();
    }

    async function readRemote() {
      const { year, month } = currentPeriod();
      const query = `organization_id=eq.${encodeURIComponent(state.organizationId)}&ano=eq.${year}&mes=eq.${month}&select=payload,version,updated_at&limit=1`;
      const response = await authenticatedFetch(`${supabaseApiUrl}/rest/v1/${TABLE}?${query}`);
      if (!response.ok) throw new Error(await response.text());
      const rows = await response.json();
      return rows[0] || null;
    }

    function isMissingTable(error) {
      const message = String(error?.message || error || "");
      return message.includes("PGRST205") || message.includes(`public.${TABLE}`) || message.includes("schema cache");
    }

    async function loadPeriod(force = false) {
      const generation = ++state.loadGeneration;
      state.loading = true;
      state.status = "loading";
      if (force) renderShell();
      try {
        state.organizationId = state.organizationId || await resolveOrganizationId();
        const remote = await readRemote();
        if (generation !== state.loadGeneration) return;
        state.backendAvailable = true;
        state.remoteVersion = Number(remote?.version || 0);
        state.basePayload = remote?.payload ? normalizePayload(remote.payload) : null;
        state.payload = remote?.payload ? normalizePayload(remote.payload) : defaultPayload();
        state.lastSavedAt = remote?.updated_at ? new Date(remote.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
        const draft = readDraft();
        if (draft?.payload && !equal(normalizePayload(draft.payload), state.payload)) {
          const recover = window.confirm("Há alterações locais da RPS que ainda não chegaram à nuvem. Deseja recuperá-las?");
          if (recover) {
            state.payload = normalizePayload(draft.payload);
            state.dirty = true;
            scheduleSave(500);
          } else {
            clearDraft();
          }
        } else if (draft) {
          clearDraft();
        }
        setStatus(state.dirty ? "dirty" : "ready", state.dirty ? "Rascunho recuperado" : statusLabel());
      } catch (error) {
        if (generation !== state.loadGeneration) return;
        if (isMissingTable(error)) {
          state.backendAvailable = false;
          const draft = readDraft();
          state.payload = draft?.payload ? normalizePayload(draft.payload) : defaultPayload();
          state.basePayload = null;
          setStatus("local", "Aguardando aplicação da migration 102");
        } else {
          setStatus("error", "Não foi possível carregar a RPS");
          console.error("Falha ao carregar RPS", error);
        }
      } finally {
        if (generation === state.loadGeneration) {
          state.loading = false;
          renderShell();
        }
      }
    }

    function markDirty() {
      if (!canEdit()) return;
      state.dirty = true;
      persistDraft();
      setStatus(state.backendAvailable ? "dirty" : "local", state.backendAvailable ? "Alterações pendentes" : "Salvo somente neste navegador");
      scheduleSave(900);
      if (!maxSaveTimer) {
        maxSaveTimer = setTimeout(() => {
          maxSaveTimer = null;
          requestSave();
        }, 15000);
      }
    }

    function scheduleSave(delay) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => requestSave(), delay);
    }

    async function insertSnapshot(payload) {
      const { year, month } = currentPeriod();
      const response = await authenticatedFetch(`${supabaseApiUrl}/rest/v1/${TABLE}`, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          organization_id: state.organizationId,
          ano: year,
          mes: month,
          payload,
          version: 1,
          updated_by: getCurrentUser?.()?.id || null
        })
      });
      if (response.status === 409) return null;
      if (!response.ok) throw new Error(await response.text());
      const rows = await response.json();
      return rows[0] || { payload, version: 1 };
    }

    async function updateSnapshot(payload, version) {
      const { year, month } = currentPeriod();
      const query = `organization_id=eq.${encodeURIComponent(state.organizationId)}&ano=eq.${year}&mes=eq.${month}&version=eq.${version}`;
      const response = await authenticatedFetch(`${supabaseApiUrl}/rest/v1/${TABLE}?${query}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ payload, version: version + 1, updated_by: getCurrentUser?.()?.id || null })
      });
      if (!response.ok) throw new Error(await response.text());
      const rows = await response.json();
      return rows[0] || null;
    }

    async function writeWithRetry(localPayload) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const remote = await readRemote();
        const merged = mergePayloads(state.basePayload, remote?.payload, localPayload);
        if (!remote) {
          const inserted = await insertSnapshot(merged.payload);
          if (inserted) return { row: inserted, merged };
          continue;
        }
        const version = Number(remote.version || 0);
        const updated = await updateSnapshot(merged.payload, version);
        if (updated) return { row: updated, merged };
      }
      throw new Error("Não foi possível concluir a gravação concorrente após seis tentativas.");
    }

    async function doSave() {
      if (!state.dirty || !state.backendAvailable || !canEdit()) return true;
      clearTimeout(saveTimer);
      const captured = normalizePayload(state.payload);
      persistDraft();
      setStatus("saving", "Salvando alterações...");
      try {
        const result = await writeWithRetry(captured);
        const live = normalizePayload(state.payload);
        state.remoteVersion = Number(result.row.version || state.remoteVersion + 1);
        state.basePayload = normalizePayload(result.merged.payload);
        state.lastSavedAt = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        if (!equal(live, captured)) {
          state.payload = mergePayloads(captured, result.merged.payload, live).payload;
          state.dirty = true;
          persistDraft();
          scheduleSave(350);
        } else {
          state.payload = normalizePayload(result.merged.payload);
          state.dirty = false;
          clearDraft();
          clearTimeout(maxSaveTimer);
          maxSaveTimer = null;
        }
        const conflictText = result.merged.conflicts
          ? `${result.merged.conflicts} conflito(s) conciliado(s); o valor local prevaleceu`
          : statusLabel();
        setStatus(state.dirty ? "dirty" : "ready", conflictText);
        renderShell();
        return true;
      } catch (error) {
        state.dirty = true;
        persistDraft();
        setStatus("error", "Falha ao salvar; rascunho preservado");
        console.error("Falha ao salvar RPS", error);
        return false;
      }
    }

    function requestSave() {
      if (saveInFlight) {
        saveRequested = true;
        return saveInFlight;
      }
      saveInFlight = doSave().finally(() => {
        saveInFlight = null;
        if (saveRequested) {
          saveRequested = false;
          requestSave();
        }
      });
      return saveInFlight;
    }

    function exportTable() {
      const { year, month } = currentPeriod();
      const lines = [["Área", "Indicador", ...WEEKS, "Mês", "Meta", "Variação", "Variação %"]];
      state.payload.areas.forEach((area) => getIndicators(area.id).forEach((indicator) => {
        const monthValue = getMonthValue(area.id, indicator.id);
        const target = getTargetValue(area.id, indicator.id);
        const variation = monthValue !== null && target !== null ? monthValue - target : null;
        const percent = variation !== null && target ? (variation / Math.abs(target)) * 100 : null;
        lines.push([
          area.nome,
          indicator.label,
          ...WEEKS.map((week) => state.payload.dados[valueKey(area.id, indicator.id, week)] || ""),
          monthValue ?? "",
          target ?? "",
          variation ?? "",
          percent ?? ""
        ]);
      }));
      const blob = new Blob(["\uFEFF" + lines.map((row) => row.join("\t")).join("\n")], { type: "text/tab-separated-values;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `RPS_${year}_${String(month).padStart(2, "0")}.tsv`;
      anchor.click();
      URL.revokeObjectURL(url);
    }

    function addIndicator() {
      if (!canEdit()) return;
      const areaOptions = state.payload.areas.map((area, index) => `${index + 1}. ${area.nome}`).join("\n");
      const areaChoice = Number(window.prompt(`Em qual área?\n\n${areaOptions}`, "1"));
      const area = state.payload.areas[areaChoice - 1];
      if (!area) return;
      const label = String(window.prompt("Nome do novo indicador:", "Novo indicador") || "").trim();
      if (!label) return;
      const list = getIndicators(area.id);
      list.push({ id: `${slugify(label)}_${Date.now()}`, label, type: "item", editableFields: { semanas: true, meta: true } });
      state.payload.indicadores[area.id] = list;
      markDirty();
      renderShell();
    }

    function bindEvents() {
      if (!root || eventsBound) return;
      eventsBound = true;
      root.addEventListener("input", (event) => {
        const valueInput = event.target.closest("[data-rps-value-key]");
        if (valueInput) {
          const key = valueInput.dataset.rpsValueKey;
          const value = valueInput.value.trim();
          if (value) state.payload.dados[key] = value;
          else delete state.payload.dados[key];
          markDirty();
          return;
        }
        const targetInput = event.target.closest("[data-rps-target-key]");
        if (targetInput) {
          const key = targetInput.dataset.rpsTargetKey;
          const value = targetInput.value.trim();
          if (value) state.payload.dadosMeta[key] = value;
          else delete state.payload.dadosMeta[key];
          markDirty();
        }
      });

      root.addEventListener("change", (event) => {
        const valueInput = event.target.closest("[data-rps-value-key]");
        if (valueInput) {
          renderShell();
          return;
        }
        const targetInput = event.target.closest("[data-rps-target-key]");
        if (targetInput) {
          renderShell();
        }
      });

      root.addEventListener("focusout", (event) => {
        if (event.target.closest("[data-rps-value-key], [data-rps-target-key]")) {
          renderShell();
        }
      });

      root.addEventListener("click", async (event) => {
        const areaToggle = event.target.closest("[data-rps-toggle-area]");
        if (areaToggle) {
          const areaId = areaToggle.dataset.rpsToggleArea;
          if (state.collapsed.has(areaId)) state.collapsed.delete(areaId);
          else state.collapsed.add(areaId);
          renderShell();
          return;
        }
        const commentButton = event.target.closest("[data-rps-comment]");
        if (commentButton) {
          const key = commentButton.dataset.rpsComment;
          const previous = state.payload.comentarios[key] || "";
          const next = window.prompt("Comentário da célula:", previous);
          if (next === null) return;
          if (next.trim()) state.payload.comentarios[key] = next.trim();
          else delete state.payload.comentarios[key];
          markDirty();
          renderShell();
          return;
        }
        const action = event.target.closest("[data-rps-action]")?.dataset.rpsAction;
        if (!action) return;
        if (action === "refresh") {
          if (state.dirty && !window.confirm("Descartar alterações locais e recarregar a RPS?")) return;
          state.dirty = false;
          await loadPeriod(true);
        } else if (action === "export") {
          exportTable();
        } else if (action === "add") {
          addIndicator();
        } else if (action === "present") {
          state.presentation = !state.presentation;
          renderShell();
        }
      });
    }

    function render() {
      if (!root) return;
      bindEvents();
      const nextPeriodKey = currentPeriodKey();
      if (nextPeriodKey !== state.periodKey) {
        state.periodKey = nextPeriodKey;
        state.payload = defaultPayload();
        state.basePayload = null;
        state.remoteVersion = 0;
        state.dirty = false;
        state.loading = true;
        renderShell();
        void loadPeriod();
        return;
      }
      renderShell();
    }

    function destroy() {
      clearTimeout(saveTimer);
      clearTimeout(maxSaveTimer);
      state.loadGeneration += 1;
      document.body.classList.remove("rps-presentation-mode");
    }

    window.addEventListener("pagehide", () => {
      if (state.dirty) {
        persistDraft();
        requestSave();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && state.dirty) {
        persistDraft();
        requestSave();
      }
    });

    return { render, destroy };
  }

  window.VECTON_RPS = { createRpsModule };
})(window);
