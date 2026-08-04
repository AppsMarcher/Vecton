(function attachVectonRpsModule(window) {
  const WEEKS = ["S1", "S2", "S3", "S4", "S5"];
  const UNIT_OPTIONS = ["R$", "un", "%", "hrs", "dias"];
  const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const TABLE = "rps_snapshots";
  const DRAFT_PREFIX = "vecton-rps-draft-v1";

  const DEFAULT_AREAS = [
    { id: "comercial", nome: "COMERCIAL", cor: "#4f7cff" },
    { id: "industrial", nome: "INDUSTRIAL", cor: "#22c55e" },
    { id: "supply", nome: "SUPPLY", cor: "#f59e0b" },
    { id: "rh", nome: "RECURSOS HUMANOS", cor: "#ec4899" },
    { id: "financeiro", nome: "FINANCEIRO", cor: "#8b5cf6" },
    { id: "sac", nome: "SAC . GARANTIAS", cor: "#38bdf8" },
    { id: "engenharia", nome: "ENGENHARIA", cor: "#14b8a6" }
  ];

  const item = (label, unit) => ({ label, unit, type: "item" });
  const calculated = (label, unit, formula) => ({ label, unit, formula, type: "calculated" });
  const spacer = () => ({ label: "", unit: "", type: "spacer" });

  // Estrutura original do RPS, capturada da aplicação de origem em 04/08/2026.
  const DEFAULT_INDICATORS = {
    comercial: [
      item("Nacional (qtd)", "un"), item("Exportação (qtd)", "un"), item("Graneleiro (qtd)", "un"),
      calculated("Total Volume Máquinas", "un", "={Nacional (qtd)}+{Exportação (qtd)}+{Graneleiro (qtd)}"), spacer(),
      item("Nacional", "R$"), item("Exportação", "R$"), item("Graneleiro", "R$"), item("Peças", "R$"), item("Transgrain", "R$"),
      calculated("Total Faturamento Bruto", "R$", "=(Nacional+Exportação+Graneleiro+Peças+Transgrain)"), spacer(),
      calculated("Ticket Médio Máquinas", "R$", "=(Nacional+Exportação+Graneleiro)/{Total Volume Máquinas}"), spacer()
    ],
    industrial: [
      calculated("Estoque PA", "un", "={Estoque Embolsadoras}+{Estoque Extratoras}+{Estoque Acessórios}"),
      item("Estoque Embolsadoras", "un"), item("Estoque Extratoras", "un"), item("Estoque Acessórios", "un"), spacer(),
      calculated("Produção Máquinas", "un", "={Produção Embolsadoras}+{Produção Extratoras}+{Produção Acessórios}"),
      item("Produção Embolsadoras", "un"), item("Produção Extratoras", "un"), item("Produção Acessórios", "un"), spacer(),
      item("Entrega da Produção", "%"), item("OEE (performance x disp x 100)", "%"),
      item("Performance (hr realizado / hr planj)", "%"), item("Disponibilidade (hr disp - interrupções)", "%"),
      item("Operação Robô", "%"), spacer()
    ],
    supply: [
      item("Compras MP (entrada) (SD1)", "R$"), item("Compras a Receber (MP)", "R$"), item("Compras a Receber (outros)", "R$"), spacer(),
      calculated("Estoque Marcher", "R$", "={Produto Acabado - Matriz}+{Produto Acabado - Filial}+{Produto Intermediário}+{Matéria-prima}+{Material de Consumo + MANUTENÇÃO}+{Peças}+{Sucatas}+{Engenharia}+{Mão-de-obra estocada}+{Qualidade}+{Estoque - DE TERCEIROS}+{Estoque - EM TERCEIROS}"),
      item("Produto Acabado - Matriz", "R$"), item("Produto Acabado - Filial", "R$"), item("Produto Intermediário", "R$"), item("Matéria-prima", "R$"),
      item("Material de Consumo + MANUTENÇÃO", "R$"), item("Peças", "R$"), item("Sucatas", "R$"), item("Engenharia", "R$"),
      item("Mão-de-obra estocada", "R$"), item("Qualidade", "R$"), item("Estoque - DE TERCEIROS", "R$"), item("Estoque - EM TERCEIROS", "R$"), spacer(),
      item("Total SKUs", "un"), spacer(), item("PMP (prazo médio de pgto) - MP", "dias"), item("Dias de estoque", "dias"), spacer(),
      item("Máquinas expedidas faturadas", "un"), item("Acessórios expedidos", "un"), item("Transferências para filial", "un"), spacer(),
      item("Máquinas apontadas", "un"), item("OPs de Solda", "un"), spacer(), item("Inventário Cíclico - itens contados", "un"),
      item("Ajustes identificados", "R$"), item("Ajustes acumulados", "R$"), spacer()
    ],
    rh: [
      item("Horas-extras (quantidade)", "hrs"), item("Horas-extras (valor)", "R$"), item("Absenteísmo", "%"),
      item("Turnover", "%"), item("Acidentes com afastamento", "un"), item("Horas de treinamento", "hrs")
    ],
    financeiro: [item("Clientes em atraso", "R$"), item("Saldo de caixa", "R$"), spacer()],
    sac: [
      item("Garantias procedentes", "un"), item("Garantias improcedentes", "un"), item("Bonificações", "un"),
      item("Atendimentos em aberto", "un"), item("Realização de entregas técnicas", "un"),
      item("Realização de assistências técnicas", "un"), item("Feiras e Dias de campo", "un"),
      item("Prazo médio retorno", "dias"), item("Prazo médio resolução", "dias"), spacer()
    ],
    engenharia: [item("CAEs em processo", "un"), item("Tempo médio CAE's em processo", "dias"), spacer()]
  };

  const LEGACY_DEFAULT_LABELS = {
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
      version: 3,
      areas: clone(DEFAULT_AREAS),
      indicadores: Object.fromEntries(Object.entries(DEFAULT_INDICATORS).map(([areaId, definitions]) => [
        areaId,
        definitions.map((definition, index) => ({
          id: `${slugify(definition.label || "espaco")}_${index}`,
          label: definition.label,
          unit: definition.unit || "",
          formula: definition.formula || null,
          type: definition.type,
          parentId: null,
          aggregate: null,
          editableFields: { label: definition.type !== "spacer", semanas: definition.type === "item", mes: false, meta: definition.type !== "spacer" }
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
    const type = item?.type || "item";
    return {
      id: item?.id || `${slugify(item?.label)}_${index}`,
      label: type === "spacer" ? "" : item?.label || "Indicador",
      type,
      unit: item?.unit || "",
      formula: item?.formula || null,
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
      const sourceList = Array.isArray(source.indicadores?.[area.id]) ? source.indicadores[area.id] : null;
      const legacyLabels = LEGACY_DEFAULT_LABELS[area.id] || [];
      const sourceLabels = (sourceList || []).map((item) => typeof item === "string" ? item : item?.label);
      const isLegacySeed = Number(source.version || 0) < 3
        && legacyLabels.length === sourceLabels.length
        && legacyLabels.every((label, index) => label === sourceLabels[index]);
      const list = !sourceList || isLegacySeed ? fallback.indicadores[area.id] || [] : sourceList;
      indicadores[area.id] = list.map(normalizeIndicator);
    });
    return {
      version: Math.max(Number(source.version) || 3, 3),
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
    const result = { version: 3, areas, indicadores };
    ["unidades", "dados", "cellStyles", "comentarios", "dadosMes", "dadosMeta", "anexos", "modoMes", "modoMeta"].forEach((section) => {
      result[section] = mergeMap(base[section], remote[section], local[section], metadata);
    });
    return { payload: result, conflicts: metadata.conflicts };
  }

  function parseNumber(raw) {
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    const text = String(raw ?? "").trim();
    if (!text) return null;
    const numericText = text.replace(/[^0-9+,\-.]/g, "");
    const normalized = numericText.includes(",")
      ? numericText.replace(/\./g, "").replace(",", ".")
      : /^[+-]?\d{1,3}(?:\.\d{3})+$/.test(numericText)
        ? numericText.replace(/\./g, "")
        : numericText;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  function formatNumber(value) {
    if (value === null || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
  }

  function normalizeUnit(unit) {
    return String(unit || "").trim().toLowerCase() === "h" ? "hrs" : String(unit || "").trim();
  }

  function formatValueForUnit(raw, unit, emptyValue = "") {
    const value = parseNumber(raw);
    if (value === null) return emptyValue;
    const normalizedUnit = normalizeUnit(unit);
    if (normalizedUnit === "R$") {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    }
    if (normalizedUnit === "un") {
      return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
    }
    if (normalizedUnit === "%") {
      return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;
    }
    if (normalizedUnit === "hrs") {
      return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)} hrs`;
    }
    if (normalizedUnit === "dias") {
      return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)} dias`;
    }
    return formatNumber(value);
  }

  function calculateArithmetic(expression) {
    const compact = String(expression || "").replace(/\s+/g, "");
    const tokens = compact.match(/\d+(?:\.\d+)?|[()+\-*/]/g) || [];
    if (!compact || tokens.join("") !== compact) return null;
    let cursor = 0;
    const parsePrimary = () => {
      const token = tokens[cursor];
      if (token === "+" || token === "-") {
        cursor += 1;
        const value = parsePrimary();
        return value === null ? null : token === "-" ? -value : value;
      }
      if (token === "(") {
        cursor += 1;
        const value = parseExpression();
        if (tokens[cursor] !== ")") return null;
        cursor += 1;
        return value;
      }
      if (!/^\d+(?:\.\d+)?$/.test(token || "")) return null;
      cursor += 1;
      return Number(token);
    };
    const parseTerm = () => {
      let value = parsePrimary();
      while (value !== null && (tokens[cursor] === "*" || tokens[cursor] === "/")) {
        const operator = tokens[cursor++];
        const right = parsePrimary();
        if (right === null || (operator === "/" && right === 0)) return null;
        value = operator === "*" ? value * right : value / right;
      }
      return value;
    };
    const parseExpression = () => {
      let value = parseTerm();
      while (value !== null && (tokens[cursor] === "+" || tokens[cursor] === "-")) {
        const operator = tokens[cursor++];
        const right = parseTerm();
        if (right === null) return null;
        value = operator === "+" ? value + right : value - right;
      }
      return value;
    };
    const value = parseExpression();
    return value !== null && cursor === tokens.length && Number.isFinite(value) ? value : null;
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

    function getUnit(areaId, indicatorId, indicator, column = "S1") {
      return normalizeUnit(state.payload.unidades[valueKey(areaId, indicatorId, column)]
        || state.payload.unidades[`${areaId}|${indicatorId}`]
        || indicator?.unit
        || "");
    }

    function renderUnitOptions(selectedUnit) {
      const normalizedSelected = normalizeUnit(selectedUnit);
      return [`<option value="">—</option>`, ...UNIT_OPTIONS.map((unit) => (
        `<option value="${escapeHtml(unit)}" ${unit === normalizedSelected ? "selected" : ""}>${escapeHtml(unit)}</option>`
      ))].join("");
    }

    function getWeekValue(areaId, indicator, week, stack = new Set()) {
      if (indicator.type !== "calculated" || !indicator.formula) {
        return parseNumber(state.payload.dados[valueKey(areaId, indicator.id, week)]);
      }
      const stackKey = `${areaId}|${indicator.id}|${week}`;
      if (stack.has(stackKey)) return null;
      const nextStack = new Set(stack).add(stackKey);
      const indicators = getIndicators(areaId).filter((item) => item.type !== "spacer");
      const findIndicator = (label) => indicators.find((item) => slugify(item.label) === slugify(label));
      let hasReferencedValue = false;
      const resolveLabel = (label) => {
        const referenced = findIndicator(label);
        const value = referenced ? getWeekValue(areaId, referenced, week, nextStack) : null;
        if (value !== null) hasReferencedValue = true;
        return value === null ? "0" : String(value);
      };
      let expression = String(indicator.formula).replace(/^=/, "");
      expression = expression.replace(/\{([^}]+)\}/g, (_, label) => resolveLabel(label));
      indicators
        .filter((item) => item.id !== indicator.id && item.label)
        .sort((left, right) => right.label.length - left.label.length)
        .forEach((item) => { expression = expression.split(item.label).join(resolveLabel(item.label)); });
      return hasReferencedValue ? calculateArithmetic(expression) : null;
    }

    function getMonthValue(areaId, indicator) {
      const manual = parseNumber(state.payload.dadosMes[monthValueKey(areaId, indicator.id)]);
      if (state.payload.modoMes[`mes:${areaId}|${indicator.id}`] === "manual" && manual !== null) return manual;
      const mode = state.payload.modoMes[`mes:${areaId}|${indicator.id}`] || "soma";
      if (mode === "ultima") return getWeekValue(areaId, indicator, WEEKS[WEEKS.length - 1]) ?? manual;
      const values = WEEKS.map((week) => getWeekValue(areaId, indicator, week)).filter((value) => value !== null);
      if (!values.length) return manual;
      if (mode === "media") return values.reduce((sum, value) => sum + value, 0) / values.length;
      return values.reduce((sum, value) => sum + value, 0);
    }

    function getTargetValue(areaId, indicatorId) {
      return parseNumber(state.payload.dadosMeta[targetValueKey(areaId, indicatorId)]);
    }

    function renderRows() {
      const editable = canEdit();
      return state.payload.areas.map((area) => {
        const indicators = getIndicators(area.id);
        const indicatorCount = indicators.filter((indicator) => indicator.type !== "spacer").length;
        const collapsed = state.collapsed.has(area.id);
        const areaHeader = `
          <tr class="rps-area-row" style="--rps-area-color:${escapeHtml(area.cor || "#4f7cff")}">
            <th colspan="10">
              <button type="button" class="rps-area-toggle" data-rps-toggle-area="${escapeHtml(area.id)}" aria-expanded="${!collapsed}">
                <span class="rps-area-dot"></span>
                <span>${escapeHtml(area.nome || area.id)}</span>
                <small>${indicatorCount} indicadores</small>
                <span class="rps-area-chevron">${collapsed ? "›" : "⌄"}</span>
              </button>
            </th>
          </tr>`;
        if (collapsed) return areaHeader;
        const rows = indicators.map((indicator) => {
          if (indicator.type === "spacer") {
            return `<tr class="rps-spacer-row" aria-hidden="true"><td colspan="10"></td></tr>`;
          }
          const calculatedRow = indicator.type === "calculated";
          const month = getMonthValue(area.id, indicator);
          const target = getTargetValue(area.id, indicator.id);
          const variation = month !== null && target !== null ? month - target : null;
          const percent = variation !== null && target ? (variation / Math.abs(target)) * 100 : null;
          const trendClass = variation === null ? "neutral" : variation >= 0 ? "positive" : "negative";
          const monthUnit = getUnit(area.id, indicator.id, indicator, "S1");
          const monthModeKey = `mes:${area.id}|${indicator.id}`;
          const monthMode = state.payload.modoMes[monthModeKey] || "soma";
          const weekCells = WEEKS.map((week) => {
            const key = valueKey(area.id, indicator.id, week);
            const weekUnit = getUnit(area.id, indicator.id, indicator, week);
            if (calculatedRow) {
              const calculatedValue = getWeekValue(area.id, indicator, week);
              return `<td class="rps-calculated-cell rps-formula-cell" title="${escapeHtml(indicator.formula || "Linha calculada")}">
                <strong>${escapeHtml(formatValueForUnit(calculatedValue, weekUnit, "—"))}</strong>
                ${editable
                  ? `<select class="rps-unit-select" data-rps-unit-key="${escapeHtml(key)}" aria-label="Unidade de ${escapeHtml(`${indicator.label} ${week}`)}">${renderUnitOptions(weekUnit)}</select>`
                  : `<small>${escapeHtml(weekUnit)}</small>`}
              </td>`;
            }
            const comment = state.payload.comentarios[commentKey(area.id, indicator.id, week)];
            return `<td class="rps-value-cell">
              <div class="rps-week-entry">
                <input class="rps-cell-input" data-rps-value-key="${escapeHtml(key)}" value="${escapeHtml(formatValueForUnit(state.payload.dados[key], weekUnit))}" inputmode="decimal" ${editable ? "" : "disabled"} aria-label="${escapeHtml(`${indicator.label} ${week}`)}">
                ${editable
                  ? `<select class="rps-unit-select" data-rps-unit-key="${escapeHtml(key)}" aria-label="Unidade de ${escapeHtml(`${indicator.label} ${week}`)}">${renderUnitOptions(weekUnit)}</select>`
                  : `<span class="rps-unit-readonly">${escapeHtml(weekUnit)}</span>`}
              </div>
              <button class="rps-comment-button ${comment ? "has-comment" : ""}" type="button" data-rps-comment="${escapeHtml(commentKey(area.id, indicator.id, week))}" title="Comentário">●</button>
            </td>`;
          }).join("");
          const targetKey = targetValueKey(area.id, indicator.id);
          return `<tr class="rps-indicator-row ${calculatedRow ? "is-calculated" : ""}" data-area-id="${escapeHtml(area.id)}" data-indicator-id="${escapeHtml(indicator.id)}">
            <th scope="row">
              <div class="rps-indicator-name">${calculatedRow ? `<b class="rps-formula-badge" title="Linha calculada">=</b>` : ""}${editable
                ? `<input class="rps-label-input" data-rps-label-area="${escapeHtml(area.id)}" data-rps-label-id="${escapeHtml(indicator.id)}" value="${escapeHtml(indicator.label)}" aria-label="Nome do indicador">`
                : `<span>${escapeHtml(indicator.label)}</span>`}</div>
            </th>
            ${weekCells}
            <td class="rps-calculated-cell rps-month-cell">
              <strong>${escapeHtml(formatValueForUnit(month, monthUnit, "—"))}</strong>
              ${editable ? `<select class="rps-month-mode" data-rps-month-mode="${escapeHtml(monthModeKey)}" aria-label="Consolidação mensal de ${escapeHtml(indicator.label)}">
                <option value="soma" ${monthMode === "soma" ? "selected" : ""}>Soma</option>
                <option value="media" ${monthMode === "media" ? "selected" : ""}>Média</option>
                <option value="ultima" ${monthMode === "ultima" ? "selected" : ""}>Última</option>
              </select>` : ""}
            </td>
            <td class="rps-value-cell rps-target-cell">
              <input class="rps-cell-input" data-rps-target-key="${escapeHtml(targetKey)}" value="${escapeHtml(formatValueForUnit(state.payload.dadosMeta[targetKey], monthUnit))}" inputmode="decimal" ${editable ? "" : "disabled"} aria-label="Meta de ${escapeHtml(indicator.label)}">
              <button class="rps-comment-button ${state.payload.comentarios[commentKey(area.id, indicator.id, "meta")] ? "has-comment" : ""}" type="button" data-rps-comment="${escapeHtml(commentKey(area.id, indicator.id, "meta"))}" title="Comentário">●</button>
            </td>
            <td class="rps-variation ${trendClass}">${variation === null ? "—" : `${variation > 0 ? "+" : ""}${escapeHtml(formatValueForUnit(variation, monthUnit))}`}</td>
            <td class="rps-variation ${trendClass}">${percent === null ? "—" : `${percent > 0 ? "+" : ""}${formatNumber(percent)}%`}</td>
          </tr>`;
        }).join("");
        return areaHeader + rows;
      }).join("");
    }

    function renderShell() {
      if (!root) return;
      const { year, month } = currentPeriod();
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

          <section class="content-card rps-table-card">
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
      state.payload.areas.forEach((area) => getIndicators(area.id).filter((indicator) => indicator.type !== "spacer").forEach((indicator) => {
        const monthValue = getMonthValue(area.id, indicator);
        const target = getTargetValue(area.id, indicator.id);
        const variation = monthValue !== null && target !== null ? monthValue - target : null;
        const percent = variation !== null && target ? (variation / Math.abs(target)) * 100 : null;
        lines.push([
          area.nome,
          indicator.label,
          ...WEEKS.map((week) => getWeekValue(area.id, indicator, week) ?? ""),
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

    function renameIndicator(areaId, indicatorId, nextLabel) {
      const indicators = getIndicators(areaId);
      const indicator = indicators.find((item) => item.id === indicatorId);
      const cleanLabel = String(nextLabel || "").trim();
      if (!indicator || !cleanLabel || cleanLabel === indicator.label) return false;
      const previousLabel = indicator.label;
      indicators.forEach((item) => {
        if (!item.formula) return;
        item.formula = String(item.formula)
          .split(/(\{[^}]+\})/g)
          .map((part) => {
            if (part.startsWith("{") && part.endsWith("}")) {
              const referencedLabel = part.slice(1, -1);
              return slugify(referencedLabel) === slugify(previousLabel) ? `{${cleanLabel}}` : part;
            }
            return part.split(previousLabel).join(cleanLabel);
          })
          .join("");
      });
      indicator.label = cleanLabel;
      markDirty();
      return true;
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
        const unitSelect = event.target.closest("[data-rps-unit-key]");
        if (unitSelect) {
          const key = unitSelect.dataset.rpsUnitKey;
          const unit = normalizeUnit(unitSelect.value);
          if (unit) state.payload.unidades[key] = unit;
          else delete state.payload.unidades[key];
          markDirty();
          renderShell();
          return;
        }
        const monthModeSelect = event.target.closest("[data-rps-month-mode]");
        if (monthModeSelect) {
          state.payload.modoMes[monthModeSelect.dataset.rpsMonthMode] = monthModeSelect.value;
          markDirty();
          renderShell();
          return;
        }
        const labelInput = event.target.closest("[data-rps-label-id]");
        if (labelInput) {
          renameIndicator(labelInput.dataset.rpsLabelArea, labelInput.dataset.rpsLabelId, labelInput.value);
          renderShell();
          return;
        }
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
