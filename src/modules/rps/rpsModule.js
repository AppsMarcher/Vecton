(function attachVectonRpsModule(window) {
  const WEEKS = ["S1", "S2", "S3", "S4", "S5"];
  const UNIT_OPTIONS = ["R$", "un", "%", "hrs", "dias"];
  const MONTH_MODE_OPTIONS = [
    { value: "soma", icon: "Σ", label: "Soma das semanas" },
    { value: "media", icon: "x̄", label: "Média das semanas" },
    { value: "ultima", icon: "→│", label: "Última semana preenchida" }
  ];
  const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const TABLE = "rps_snapshots";
  const DRAFT_PREFIX = "vecton-rps-draft-v1";
  const ATTACHMENT_BUCKET = "rps-attachments";
  const BACKUP_MANAGER_FUNCTION = "rps-backup-manager";
  const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

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
  const attachmentPrefix = (areaId, indicatorId, column) => `anx:${areaId}|${indicatorId}|${column}|`;

  function defaultPayload() {
    return {
      version: 4,
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
      modoMeta: {},
      configuracoes: { semanaFoco: "S5" }
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
      version: Math.max(Number(source.version) || 4, 4),
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
      modoMeta: clone(source.modoMeta || {}),
      configuracoes: { ...clone(fallback.configuracoes), ...clone(source.configuracoes || {}) }
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
    const result = { version: 4, areas, indicadores };
    ["unidades", "dados", "cellStyles", "comentarios", "dadosMes", "dadosMeta", "anexos", "modoMes", "modoMeta", "configuracoes"].forEach((section) => {
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
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
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

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1).replace(".0", "")} KB`;
    return `${(size / (1024 * 1024)).toFixed(1).replace(".0", "")} MB`;
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
      appConfirm,
      appPrompt,
      uploadToStorage,
      createStorageSignedUrl,
      deleteFromStorage,
      callEdgeFunction,
      initAllReportTableResizers,
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
      presentation: false,
      presentationZoom: 0,
      backupManager: {
        open: false,
        loading: false,
        working: false,
        backups: [],
        restores: [],
        selectedId: "",
        lock: null,
        error: ""
      }
    };

    let saveTimer = null;
    let maxSaveTimer = null;
    let saveInFlight = null;
    let saveRequested = false;
    let eventsBound = false;

    // canFillValues: quem pode digitar semanas/meta, comentar e anexar arquivo.
    // canEditStructure: quem além disso pode renomear indicador, trocar
    // unidade, mudar o modo de cálculo do Mês e adicionar indicador — o
    // perfil "RPS Gestão" preenche dados mas não mexe na estrutura.
    const canFillValues = () => ["super_admin", "admin", "manager", "rps_gestao"].includes(String(getAccessRole?.() || ""));
    const canEditStructure = () => ["super_admin", "admin", "manager"].includes(String(getAccessRole?.() || ""));
    const canManageBackups = () => ["super_admin", "admin"].includes(String(getAccessRole?.() || ""));
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

    function formatBackupBytes(value) {
      const bytes = Number(value || 0);
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function formatBackupDate(value) {
      if (!value) return "—";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
      });
    }

    function backupKindLabel(kind) {
      if (kind === "scheduled") return "Semanal";
      if (kind === "pre_restore") return "Segurança pré-restauração";
      return "Manual";
    }

    async function callBackupManager(action, extra = {}) {
      if (!callEdgeFunction) throw new Error("Função de backup indisponível nesta versão do aplicativo.");
      const { year, month } = currentPeriod();
      state.organizationId = state.organizationId || await resolveOrganizationId();
      return callEdgeFunction(BACKUP_MANAGER_FUNCTION, {
        action,
        organization_id: state.organizationId,
        year,
        month,
        ...extra
      });
    }

    async function loadBackupManager() {
      if (!canManageBackups()) return;
      state.backupManager.loading = true;
      state.backupManager.error = "";
      renderShell();
      try {
        const data = await callBackupManager("list");
        state.backupManager.backups = Array.isArray(data?.backups) ? data.backups : [];
        state.backupManager.restores = Array.isArray(data?.restores) ? data.restores : [];
        state.backupManager.lock = data?.lock || null;
        if (!state.backupManager.backups.some((item) => item.id === state.backupManager.selectedId)) {
          state.backupManager.selectedId = state.backupManager.backups[0]?.id || "";
        }
      } catch (error) {
        state.backupManager.error = error?.message || "Não foi possível carregar os backups.";
      } finally {
        state.backupManager.loading = false;
        renderShell();
      }
    }

    function openBackupManager() {
      if (!canManageBackups()) return;
      state.backupManager.open = true;
      state.backupManager.error = "";
      renderShell();
      void loadBackupManager();
    }

    async function createManualBackup() {
      if (!canManageBackups() || state.backupManager.working) return;
      if (state.dirty && !await requestSave()) {
        await appAlert("Salve as alterações pendentes antes de criar o backup.", "warn");
        return;
      }
      state.backupManager.working = true;
      state.backupManager.error = "";
      renderShell();
      try {
        await callBackupManager("backup_now");
        await loadBackupManager();
        await appAlert("Backup verificado do mês criado com sucesso.", "info");
      } catch (error) {
        state.backupManager.error = error?.message || "Falha ao criar backup.";
      } finally {
        state.backupManager.working = false;
        renderShell();
      }
    }

    async function restoreSelectedBackup() {
      if (!canManageBackups() || state.backupManager.working) return;
      const selected = state.backupManager.backups.find((item) => item.id === state.backupManager.selectedId);
      if (!selected) return;
      if (state.dirty && !await requestSave()) {
        await appAlert("Não foi possível salvar as alterações atuais. A restauração foi cancelada.", "error");
        return;
      }
      const { year, month } = currentPeriod();
      const confirmed = await appConfirm(
        `Restaurar ${MONTHS[month - 1]} de ${year} para o backup de ${formatBackupDate(selected.captured_at)}?\n\nAntes de substituir o mês, o sistema criará um backup de segurança e bloqueará gravações até concluir ou desfazer a operação.`,
        "danger"
      );
      if (!confirmed) return;

      state.backupManager.working = true;
      state.backupManager.error = "";
      renderShell();
      try {
        const result = await callBackupManager("restore", { backup_run_id: selected.id });
        clearDraft();
        state.dirty = false;
        state.backupManager.open = false;
        await loadPeriod(true);
        await appAlert(`Restauração concluída. ${Number(result?.filesRestored || 0)} anexo(s) verificado(s) e restaurado(s).`, "info");
      } catch (error) {
        const restoreMessage = error?.message || "Falha ao restaurar backup.";
        await loadBackupManager();
        state.backupManager.error = restoreMessage;
      } finally {
        state.backupManager.working = false;
        renderShell();
      }
    }

    function renderBackupManagerDialog() {
      if (!state.backupManager.open || !canManageBackups()) return "";
      const manager = state.backupManager;
      const selected = manager.backups.find((item) => item.id === manager.selectedId) || null;
      const backups = manager.backups.length
        ? manager.backups.map((item) => `<button type="button" class="rps-backup-item ${item.id === manager.selectedId ? "is-selected" : ""}" data-rps-backup-select="${escapeHtml(item.id)}">
            <span class="rps-backup-kind">${escapeHtml(backupKindLabel(item.kind))}</span>
            <strong>${escapeHtml(formatBackupDate(item.captured_at))}</strong>
            <small>${Number(item.verified_file_count || 0)} arquivo(s) · ${escapeHtml(formatBackupBytes(item.verified_bytes))}</small>
          </button>`).join("")
        : `<div class="rps-backup-empty">Nenhum backup íntegro disponível para este mês.</div>`;
      const restores = manager.restores.length
        ? manager.restores.slice(0, 6).map((item) => `<div class="rps-restore-history-row" data-status="${escapeHtml(item.status)}">
            <span>${escapeHtml(formatBackupDate(item.started_at))}</span><strong>${escapeHtml(item.status)}</strong><small>${escapeHtml(item.phase || "—")}</small>
          </div>`).join("")
        : `<div class="rps-backup-empty is-compact">Nenhuma restauração registrada neste mês.</div>`;
      return `<div class="rps-backup-overlay" role="presentation">
        <section class="rps-backup-dialog" role="dialog" aria-modal="true" aria-labelledby="rps-backup-title">
          <header class="rps-backup-dialog-head">
            <div><p class="section-kicker">PROTEÇÃO E RECUPERAÇÃO</p><h3 id="rps-backup-title">Backup da RPS · ${escapeHtml(state.periodKey)}</h3><span>Backups semanais às segundas, 18:45 · retenção de seis meses</span></div>
            <button type="button" class="rps-action" data-rps-backup-action="close" ${manager.working ? "disabled" : ""}>× <span>Fechar</span></button>
          </header>
          ${manager.lock ? `<div class="rps-backup-lock">Uma restauração está em andamento. O mês permanece bloqueado até a conclusão.</div>` : ""}
          ${manager.error ? `<div class="rps-backup-error">${escapeHtml(manager.error)}</div>` : ""}
          <div class="rps-backup-tools">
            <button type="button" class="rps-action" data-rps-backup-action="refresh" ${manager.working ? "disabled" : ""}>↻ <span>Atualizar lista</span></button>
            <button type="button" class="rps-action rps-action-primary" data-rps-backup-action="create" ${manager.working || manager.lock ? "disabled" : ""}>＋ <span>Criar backup agora</span></button>
          </div>
          <div class="rps-backup-layout">
            <div class="rps-backup-list"><h4>Backups íntegros</h4>${manager.loading ? `<div class="rps-backup-empty">Carregando backups...</div>` : backups}</div>
            <div class="rps-backup-detail">
              <h4>Backup selecionado</h4>
              ${selected ? `<dl><div><dt>Capturado em</dt><dd>${escapeHtml(formatBackupDate(selected.captured_at))}</dd></div><div><dt>Origem</dt><dd>${escapeHtml(backupKindLabel(selected.kind))}</dd></div><div><dt>Versão</dt><dd>${Number(selected.source_version || 0)}</dd></div><div><dt>Anexos verificados</dt><dd>${Number(selected.verified_file_count || 0)} · ${escapeHtml(formatBackupBytes(selected.verified_bytes))}</dd></div><div><dt>Retido até</dt><dd>${escapeHtml(formatBackupDate(selected.retention_until))}</dd></div><div><dt>Hash do snapshot</dt><dd class="is-hash">${escapeHtml(selected.snapshot_hash || "—")}</dd></div></dl>` : `<div class="rps-backup-empty">Selecione um backup para ver os detalhes.</div>`}
              <button type="button" class="rps-backup-restore" data-rps-backup-action="restore" ${!selected || manager.working || manager.lock ? "disabled" : ""}>↶ Restaurar somente ${escapeHtml(state.periodKey)}</button>
              <p>A restauração cria um ponto de segurança, valida os anexos em staging e desfaz a operação automaticamente se alguma etapa falhar.</p>
            </div>
          </div>
          <div class="rps-restore-history"><h4>Auditoria de restaurações</h4>${restores}</div>
          ${manager.working ? `<div class="rps-backup-working"><span></span><strong>Processando e verificando integridade...</strong><small>Não feche esta tela.</small></div>` : ""}
        </section>
      </div>`;
    }

    function getIndicators(areaId) {
      return Array.isArray(state.payload.indicadores?.[areaId]) ? state.payload.indicadores[areaId] : [];
    }

    function focusedWeek() {
      const week = String(state.payload.configuracoes?.semanaFoco || "S5");
      return WEEKS.includes(week) ? week : "S5";
    }

    function getUnit(areaId, indicatorId, indicator, column = "S1") {
      return normalizeUnit(state.payload.unidades[valueKey(areaId, indicatorId, column)]
        || state.payload.unidades[`${areaId}|${indicatorId}`]
        || indicator?.unit
        || "");
    }

    function renderUnitCycle(key, selectedUnit, accessibleLabel) {
      const unit = normalizeUnit(selectedUnit);
      return `<button type="button" class="rps-unit-cycle" data-rps-unit-cycle="${escapeHtml(key)}" data-current-unit="${escapeHtml(unit)}" title="Alterar unidade · ${escapeHtml(unit || "sem unidade")}" aria-label="${escapeHtml(accessibleLabel)}">${escapeHtml(unit || "—")}</button>`;
    }

    function monthModeConfig(mode) {
      if (mode === "ultima") {
        const week = focusedWeek();
        return { value: "ultima", icon: "→│", label: `Última semana preenchida até ${week}` };
      }
      return MONTH_MODE_OPTIONS.find((item) => item.value === mode) || MONTH_MODE_OPTIONS[0];
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
      if (mode === "ultima") {
        const focusIndex = WEEKS.indexOf(focusedWeek());
        for (let index = focusIndex; index >= 0; index -= 1) {
          const value = getWeekValue(areaId, indicator, WEEKS[index]);
          if (value !== null) return value;
        }
        return manual;
      }
      const values = WEEKS.map((week) => getWeekValue(areaId, indicator, week)).filter((value) => value !== null);
      if (!values.length) return manual;
      if (mode === "media") return values.reduce((sum, value) => sum + value, 0) / values.length;
      return values.reduce((sum, value) => sum + value, 0);
    }

    function getTargetValue(areaId, indicatorId) {
      return parseNumber(state.payload.dadosMeta[targetValueKey(areaId, indicatorId)]);
    }

    function getCellAttachments(areaId, indicatorId, column) {
      const prefix = attachmentPrefix(areaId, indicatorId, column);
      return Object.entries(state.payload.anexos || {})
        .filter(([key, attachment]) => key.startsWith(prefix) && attachment?.path)
        .map(([key, attachment]) => ({ ...attachment, key }))
        .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
    }

    function safeFileName(name) {
      return String(name || "arquivo")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(-100) || "arquivo";
    }

    function attachmentPath(areaId, indicatorId, column, attachmentId, fileName) {
      const { year, month } = currentPeriod();
      const period = `${year}-${String(month).padStart(2, "0")}`;
      return `${state.organizationId}/${period}/${slugify(areaId)}/${slugify(indicatorId)}/${column}/${attachmentId}_${safeFileName(fileName)}`;
    }

    function closeAttachmentModal() {
      document.querySelector(".rps-attachment-backdrop")?.remove();
    }

    function closeAttachmentCarousel() {
      document.querySelector(".rps-attachment-carousel")?.remove();
      document.body.classList.remove("rps-carousel-open");
    }

    function ensureLaserPointer() {
      let laser = document.querySelector(".rps-laser-pointer");
      if (!laser) {
        laser = document.createElement("div");
        laser.className = "rps-laser-pointer";
        laser.setAttribute("aria-hidden", "true");
        document.body.appendChild(laser);
      }
      return laser;
    }

    function moveLaserPointer(event) {
      const laser = document.querySelector(".rps-laser-pointer");
      if (!state.presentation || event.pointerType === "touch") {
        laser?.classList.remove("is-visible");
        return;
      }
      const pointer = laser || ensureLaserPointer();
      pointer.style.left = `${event.clientX}px`;
      pointer.style.top = `${event.clientY}px`;
      pointer.classList.add("is-visible");
    }

    function hideLaserPointer() {
      document.querySelector(".rps-laser-pointer")?.classList.remove("is-visible");
    }

    function removeLaserPointer() {
      document.querySelector(".rps-laser-pointer")?.remove();
    }

    function attachmentMediaKind(attachment) {
      const type = String(attachment?.type || "").toLowerCase();
      const name = String(attachment?.name || "").toLowerCase();
      if (type.startsWith("image/") || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(name)) return "image";
      if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
      if (type.startsWith("video/") || /\.(m4v|mov|mp4|webm)$/.test(name)) return "video";
      if (type.startsWith("audio/") || /\.(aac|m4a|mp3|ogg|wav)$/.test(name)) return "audio";
      return "file";
    }

    function openAttachmentCarousel(area, indicator, column) {
      closeAttachmentModal();
      closeAttachmentCarousel();
      const attachments = getCellAttachments(area.id, indicator.id, column);
      if (!attachments.length) {
        void appAlert("Esta célula ainda não possui arquivos para apresentar.", "info");
        return;
      }

      let activeIndex = 0;
      let renderGeneration = 0;
      const signedUrls = new Map();
      const carousel = document.createElement("div");
      carousel.className = "rps-attachment-carousel";
      carousel.tabIndex = -1;
      carousel.innerHTML = `
        <section class="rps-carousel-stage" role="dialog" aria-modal="true" aria-labelledby="rps-carousel-title">
          <header class="rps-carousel-header">
            <div class="rps-carousel-heading">
              <span>${escapeHtml(area.nome)} · ${escapeHtml(column)}</span>
              <h3 id="rps-carousel-title">${indicator.type === "calculated" ? "( = ) " : ""}${escapeHtml(indicator.label)}</h3>
            </div>
            <div class="rps-carousel-actions">
              <span class="rps-carousel-counter" data-rps-carousel-counter></span>
              <a class="rps-carousel-external" data-rps-carousel-external target="_blank" rel="noopener noreferrer">Abrir arquivo ↗</a>
              <button type="button" class="rps-carousel-close" data-rps-carousel-close aria-label="Fechar apresentação">×</button>
            </div>
          </header>
          <main class="rps-carousel-viewport" data-rps-carousel-viewport aria-live="polite"></main>
          ${attachments.length > 1 ? `<button type="button" class="rps-carousel-arrow is-previous" data-rps-carousel-previous aria-label="Anexo anterior">‹</button>
          <button type="button" class="rps-carousel-arrow is-next" data-rps-carousel-next aria-label="Próximo anexo">›</button>` : ""}
          <footer class="rps-carousel-footer">
            <div class="rps-carousel-caption"><strong data-rps-carousel-name></strong><span data-rps-carousel-meta></span></div>
            <nav class="rps-carousel-strip" aria-label="Arquivos anexados">${attachments.map((attachment, index) => `<button type="button" data-rps-carousel-index="${index}" title="${escapeHtml(attachment.name || `Arquivo ${index + 1}`)}"><span>${index + 1}</span><small>${escapeHtml(attachment.name || "Arquivo")}</small></button>`).join("")}</nav>
          </footer>
        </section>`;
      document.body.appendChild(carousel);
      document.body.classList.add("rps-carousel-open");

      const viewport = carousel.querySelector("[data-rps-carousel-viewport]");
      const counter = carousel.querySelector("[data-rps-carousel-counter]");
      const name = carousel.querySelector("[data-rps-carousel-name]");
      const meta = carousel.querySelector("[data-rps-carousel-meta]");
      const external = carousel.querySelector("[data-rps-carousel-external]");

      const mediaMarkup = (attachment, url) => {
        const safeUrl = escapeHtml(url);
        const safeName = escapeHtml(attachment.name || "Arquivo");
        const kind = attachmentMediaKind(attachment);
        if (kind === "image") return `<img class="rps-carousel-image" src="${safeUrl}" alt="${safeName}">`;
        if (kind === "pdf") return `<iframe class="rps-carousel-pdf" src="${safeUrl}#view=FitH" title="${safeName}"></iframe>`;
        if (kind === "video") return `<video class="rps-carousel-video" src="${safeUrl}" controls playsinline></video>`;
        if (kind === "audio") return `<div class="rps-carousel-file-card"><span class="rps-carousel-file-symbol">♫</span><strong>${safeName}</strong><audio src="${safeUrl}" controls></audio></div>`;
        return `<div class="rps-carousel-file-card"><span class="rps-carousel-file-symbol">▧</span><strong>${safeName}</strong><p>Este tipo de arquivo não possui pré-visualização no navegador.</p><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Abrir arquivo</a></div>`;
      };

      const renderActive = async () => {
        const generation = ++renderGeneration;
        const attachment = attachments[activeIndex];
        counter.textContent = `${activeIndex + 1} / ${attachments.length}`;
        name.textContent = attachment.name || "Arquivo";
        meta.textContent = `${formatFileSize(attachment.size)}${attachment.createdAt ? ` · ${new Date(attachment.createdAt).toLocaleString("pt-BR")}` : ""}`;
        external.removeAttribute("href");
        external.classList.add("is-loading");
        carousel.querySelectorAll("[data-rps-carousel-index]").forEach((button, index) => button.classList.toggle("is-active", index === activeIndex));
        viewport.innerHTML = `<div class="rps-carousel-loading"><span></span><p>Preparando visualização...</p></div>`;
        try {
          let url = signedUrls.get(attachment.key);
          if (!url) {
            url = await createStorageSignedUrl(ATTACHMENT_BUCKET, attachment.path, 3600);
            signedUrls.set(attachment.key, url);
          }
          if (generation !== renderGeneration || !carousel.isConnected) return;
          external.href = url;
          external.classList.remove("is-loading");
          viewport.innerHTML = mediaMarkup(attachment, url);
        } catch (error) {
          if (generation !== renderGeneration || !carousel.isConnected) return;
          console.error("Falha ao apresentar anexo da RPS", error);
          external.classList.remove("is-loading");
          viewport.innerHTML = `<div class="rps-carousel-error"><strong>Não foi possível carregar este arquivo.</strong><span>Tente novamente ou feche a apresentação.</span><button type="button" data-rps-carousel-retry>Tentar novamente</button></div>`;
        }
      };

      const show = (index) => {
        activeIndex = (index + attachments.length) % attachments.length;
        void renderActive();
      };
      const close = () => closeAttachmentCarousel();
      carousel.addEventListener("click", (event) => {
        if (event.target === carousel || event.target.closest("[data-rps-carousel-close]")) return close();
        if (event.target.closest("[data-rps-carousel-previous]")) return show(activeIndex - 1);
        if (event.target.closest("[data-rps-carousel-next]")) return show(activeIndex + 1);
        if (event.target.closest("[data-rps-carousel-retry]")) {
          signedUrls.delete(attachments[activeIndex].key);
          return void renderActive();
        }
        const indexed = event.target.closest("[data-rps-carousel-index]");
        if (indexed) show(Number(indexed.dataset.rpsCarouselIndex));
      });
      carousel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") close();
        else if (event.key === "ArrowLeft") show(activeIndex - 1);
        else if (event.key === "ArrowRight") show(activeIndex + 1);
        else if (event.key === "Home") show(0);
        else if (event.key === "End") show(attachments.length - 1);
      });
      carousel.addEventListener("pointermove", moveLaserPointer);
      carousel.addEventListener("pointerleave", hideLaserPointer);
      carousel.focus();
      void renderActive();
    }

    function openAttachmentModal(area, indicator, column) {
      closeAttachmentModal();
      const editable = canFillValues();
      const backdrop = document.createElement("div");
      backdrop.className = "rps-attachment-backdrop";
      backdrop.innerHTML = `
        <section class="rps-attachment-modal" role="dialog" aria-modal="true" aria-labelledby="rps-attachment-title">
          <header class="rps-attachment-header">
            <div>
              <h3 id="rps-attachment-title">${indicator.type === "calculated" ? "( = ) " : ""}${escapeHtml(indicator.label)} · ${escapeHtml(column)}</h3>
              <p>Envie arquivos e remova anexos desta célula.</p>
            </div>
            <button type="button" class="rps-attachment-close" data-rps-attachment-close>× <span>Fechar</span></button>
          </header>
          ${editable ? `<div class="rps-attachment-upload">
            <div class="rps-attachment-picker"><input type="file" multiple data-rps-attachment-input><small>Selecione um ou mais arquivos, até 20 MB cada.</small></div>
            <button type="button" class="rps-attachment-send" data-rps-attachment-send>↥ <span>Enviar arquivos</span></button>
          </div>` : ""}
          <div class="rps-attachment-section-title">Arquivos carregados</div>
          <div class="rps-attachment-list" data-rps-attachment-list></div>
        </section>`;
      document.body.appendChild(backdrop);

      const list = backdrop.querySelector("[data-rps-attachment-list]");
      const renderList = () => {
        const attachments = getCellAttachments(area.id, indicator.id, column);
        list.innerHTML = attachments.length ? attachments.map((attachment) => `
          <article class="rps-attachment-item">
            <span class="rps-attachment-file-icon" aria-hidden="true">▧</span>
            <div class="rps-attachment-file-info"><strong>${escapeHtml(attachment.name || "Arquivo")}</strong><small>${escapeHtml(formatFileSize(attachment.size))}${attachment.createdAt ? ` · ${escapeHtml(new Date(attachment.createdAt).toLocaleString("pt-BR"))}` : ""}</small></div>
            <button type="button" class="rps-attachment-open" data-rps-attachment-open="${escapeHtml(attachment.key)}">Abrir</button>
            ${editable ? `<button type="button" class="rps-attachment-delete" data-rps-attachment-delete="${escapeHtml(attachment.key)}">Remover</button>` : ""}
          </article>`).join("") : `<p class="rps-attachment-empty">Nenhum arquivo anexado nesta célula.</p>`;
      };
      renderList();

      const close = () => closeAttachmentModal();
      backdrop.querySelector("[data-rps-attachment-close]")?.addEventListener("click", close);
      backdrop.addEventListener("click", async (event) => {
        if (event.target === backdrop) {
          close();
          return;
        }
        const openButton = event.target.closest("[data-rps-attachment-open]");
        if (openButton) {
          const attachment = state.payload.anexos?.[openButton.dataset.rpsAttachmentOpen];
          if (!attachment?.path) return;
          const fileWindow = window.open("about:blank", "_blank");
          if (fileWindow) fileWindow.opener = null;
          openButton.disabled = true;
          try {
            const url = await createStorageSignedUrl(ATTACHMENT_BUCKET, attachment.path, 300);
            if (fileWindow) fileWindow.location.replace(url);
            else window.location.href = url;
          } catch (error) {
            fileWindow?.close();
            console.error("Falha ao abrir anexo da RPS", error);
            await appAlert("Não foi possível abrir este arquivo.", "error");
          } finally {
            openButton.disabled = false;
          }
          return;
        }
        const deleteButton = event.target.closest("[data-rps-attachment-delete]");
        if (deleteButton) {
          const key = deleteButton.dataset.rpsAttachmentDelete;
          const attachment = state.payload.anexos?.[key];
          if (!attachment?.path || !await appConfirm(`Remover o arquivo “${attachment.name || "Arquivo"}” desta célula?`, "danger")) return;
          deleteButton.disabled = true;
          try {
            await deleteFromStorage(ATTACHMENT_BUCKET, attachment.path);
            delete state.payload.anexos[key];
            markDirty();
            await requestSave();
            renderList();
            renderShell();
          } catch (error) {
            console.error("Falha ao remover anexo da RPS", error);
            await appAlert("Não foi possível remover este arquivo.", "error");
            deleteButton.disabled = false;
          }
        }
      });

      const sendButton = backdrop.querySelector("[data-rps-attachment-send]");
      sendButton?.addEventListener("click", async () => {
        const input = backdrop.querySelector("[data-rps-attachment-input]");
        const files = Array.from(input?.files || []);
        if (!files.length) {
          await appAlert("Selecione pelo menos um arquivo para enviar.", "warn");
          return;
        }
        const invalid = files.find((file) => file.size > MAX_ATTACHMENT_BYTES);
        if (invalid) {
          await appAlert(`O arquivo “${invalid.name}” ultrapassa o limite de 20 MB.`, "warn");
          return;
        }
        sendButton.disabled = true;
        sendButton.classList.add("is-loading");
        let uploaded = 0;
        try {
          state.payload.anexos = state.payload.anexos || {};
          for (const file of files) {
            const id = crypto.randomUUID();
            const path = attachmentPath(area.id, indicator.id, column, id, file.name);
            await uploadToStorage(ATTACHMENT_BUCKET, path, file);
            state.payload.anexos[`${attachmentPrefix(area.id, indicator.id, column)}${id}`] = {
              id,
              path,
              name: file.name || safeFileName(file.name),
              type: file.type || "application/octet-stream",
              size: file.size || 0,
              createdAt: new Date().toISOString(),
              createdBy: getCurrentUser?.()?.id || null
            };
            uploaded += 1;
          }
          markDirty();
          await requestSave();
          input.value = "";
          renderList();
          renderShell();
        } catch (error) {
          if (uploaded) {
            markDirty();
            await requestSave();
            renderList();
            renderShell();
          }
          console.error("Falha ao anexar arquivos na RPS", error);
          await appAlert("Não foi possível concluir o envio dos arquivos.", "error");
        } finally {
          sendButton.disabled = false;
          sendButton.classList.remove("is-loading");
        }
      });

      backdrop.tabIndex = -1;
      backdrop.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
      (backdrop.querySelector("[data-rps-attachment-input]") || backdrop.querySelector("[data-rps-attachment-close]"))?.focus();
    }

    function renderRows() {
      const fillable = canFillValues() && !state.presentation;
      const structural = canEditStructure() && !state.presentation;
      const focusWeek = focusedWeek();
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
          const monthModeInfo = monthModeConfig(monthMode);
          const weekCells = WEEKS.map((week) => {
            const key = valueKey(area.id, indicator.id, week);
            const weekUnit = getUnit(area.id, indicator.id, indicator, week);
            const attachmentCount = getCellAttachments(area.id, indicator.id, week).length;
            const attachmentButton = `<button type="button" class="rps-attachment-button ${attachmentCount ? "has-attachments" : ""}" data-rps-attachment-area="${escapeHtml(area.id)}" data-rps-attachment-indicator="${escapeHtml(indicator.id)}" data-rps-attachment-column="${escapeHtml(week)}" title="${attachmentCount ? `${attachmentCount} arquivo(s) anexado(s)` : "Anexar arquivos"}" aria-label="Anexos de ${escapeHtml(`${indicator.label} ${week}`)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 11.6 12 21a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5"></path></svg>${attachmentCount ? `<span>${attachmentCount}</span>` : ""}</button>`;
            if (calculatedRow) {
              const calculatedValue = getWeekValue(area.id, indicator, week);
              return `<td class="rps-calculated-cell rps-formula-cell ${week === focusWeek ? "is-focused" : ""}" title="${escapeHtml(indicator.formula || "Linha calculada")}">
                <strong>${escapeHtml(formatValueForUnit(calculatedValue, weekUnit, "—"))}</strong>
                ${structural
                  ? renderUnitCycle(key, weekUnit, `Unidade de ${indicator.label} ${week}`)
                  : `<small>${escapeHtml(weekUnit)}</small>`}
                ${attachmentButton}
              </td>`;
            }
            const comment = state.payload.comentarios[commentKey(area.id, indicator.id, week)];
            return `<td class="rps-value-cell ${week === focusWeek ? "is-focused" : ""}">
              <div class="rps-week-entry">
                <input class="rps-cell-input" data-rps-value-key="${escapeHtml(key)}" value="${escapeHtml(formatValueForUnit(state.payload.dados[key], weekUnit))}" inputmode="decimal" ${fillable ? "" : "disabled"} aria-label="${escapeHtml(`${indicator.label} ${week}`)}">
                ${structural
                  ? renderUnitCycle(key, weekUnit, `Unidade de ${indicator.label} ${week}`)
                  : `<span class="rps-unit-readonly">${escapeHtml(weekUnit)}</span>`}
              </div>
              ${state.presentation ? "" : `<button class="rps-comment-button ${comment ? "has-comment" : ""}" type="button" data-rps-comment="${escapeHtml(commentKey(area.id, indicator.id, week))}" title="Comentário">●</button>`}
              ${attachmentButton}
            </td>`;
          }).join("");
          const targetKey = targetValueKey(area.id, indicator.id);
          return `<tr class="rps-indicator-row ${calculatedRow ? "is-calculated" : ""}" data-area-id="${escapeHtml(area.id)}" data-indicator-id="${escapeHtml(indicator.id)}">
            <th scope="row">
              <div class="rps-indicator-name">${calculatedRow ? `<b class="rps-formula-badge" title="Linha calculada">=</b>` : ""}${structural
                ? `<input class="rps-label-input" data-rps-label-area="${escapeHtml(area.id)}" data-rps-label-id="${escapeHtml(indicator.id)}" value="${escapeHtml(indicator.label)}" aria-label="Nome do indicador">`
                : `<span>${escapeHtml(indicator.label)}</span>`}</div>
            </th>
            ${weekCells}
            <td class="rps-calculated-cell rps-month-cell">
              <strong>${escapeHtml(formatValueForUnit(month, monthUnit, "—"))}</strong>
              ${structural ? `<button type="button" class="rps-month-mode-cycle" data-rps-month-mode-cycle="${escapeHtml(monthModeKey)}" data-current-mode="${escapeHtml(monthMode)}" title="${escapeHtml(monthModeInfo.label)}" aria-label="${escapeHtml(`${monthModeInfo.label} de ${indicator.label}`)}"><span>${escapeHtml(monthModeInfo.icon)}</span></button>` : ""}
            </td>
            <td class="rps-value-cell rps-target-cell">
              <input class="rps-cell-input" data-rps-target-key="${escapeHtml(targetKey)}" value="${escapeHtml(formatValueForUnit(state.payload.dadosMeta[targetKey], monthUnit))}" inputmode="decimal" ${fillable ? "" : "disabled"} aria-label="Meta de ${escapeHtml(indicator.label)}">
              ${state.presentation ? "" : `<button class="rps-comment-button ${state.payload.comentarios[commentKey(area.id, indicator.id, "meta")] ? "has-comment" : ""}" type="button" data-rps-comment="${escapeHtml(commentKey(area.id, indicator.id, "meta"))}" title="Comentário">●</button>`}
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
      const fillable = canFillValues() && !state.presentation;
      const structural = canEditStructure() && !state.presentation;
      const focusWeek = focusedWeek();
      const columnResizer = fillable ? '<span class="col-resizer" aria-hidden="true"></span>' : "";
      root.innerHTML = `
        <div class="rps-page ${state.presentation ? "is-presenting" : ""}">
          <div class="rps-hero">
            <div class="rps-hero-copy">
              <p class="section-kicker">GESTÃO DE PERFORMANCE</p>
              <div class="rps-title-line">
                <h2>Reunião de Performance Semanal</h2>
                <span class="rps-period-chip">${MONTHS[month - 1]} · ${year}</span>
              </div>
            </div>
            <div class="rps-toolbar">
              ${canManageBackups() && !state.presentation ? `<button type="button" class="rps-action rps-action-backup" data-rps-action="backups" title="Backups verificados e recuperação deste mês">⟲ <span>Backup</span></button>` : ""}
              <button type="button" class="rps-action" data-rps-action="refresh" title="Recarregar dados">↻ <span>Atualizar</span></button>
              ${structural ? `<button type="button" class="rps-action" data-rps-action="add">＋ <span>Indicador</span></button>` : ""}
              ${state.presentation ? `<button type="button" class="rps-action" data-rps-action="zoom-in" title="Aumentar os textos em 2 pixels">＋ <span>Zoom</span></button>
              <button type="button" class="rps-action" data-rps-action="zoom-out" title="Diminuir os textos em 2 pixels" ${state.presentationZoom <= 0 ? "disabled" : ""}>− <span>Zoom</span></button>` : ""}
              <button type="button" class="rps-action rps-action-primary" data-rps-action="present">▣ <span>${state.presentation ? "Sair" : "Apresentar"}</span></button>
            </div>
          </div>

          <section class="content-card rps-table-card">
            <div class="rps-table-scroll ${state.loading ? "is-loading" : ""}">
              <table class="rps-table" ${fillable ? "data-resizable-cols" : ""}>
                <thead><tr><th>Área / indicador${columnResizer}</th>${WEEKS.map((week) => `<th class="${week === focusWeek ? "is-focused" : ""}"><button type="button" class="rps-week-focus" data-rps-focus-week="${week}" aria-pressed="${week === focusWeek}" title="Destacar ${week}">${week}</button>${columnResizer}</th>`).join("")}<th>Mês${columnResizer}</th><th>Meta${columnResizer}</th><th>Var.${columnResizer}</th><th>Var. %${columnResizer}</th></tr></thead>
                <tbody>${renderRows()}</tbody>
              </table>
              ${state.loading ? `<div class="rps-loading"><span></span><p>Carregando o período...</p></div>` : ""}
            </div>
          </section>
        </div>
        ${renderBackupManagerDialog()}`;
      document.body.classList.toggle("rps-presentation-mode", state.presentation);
      document.body.classList.toggle("rps-laser-mode", state.presentation);
      document.body.style.setProperty("--rps-presentation-zoom", `${state.presentationZoom}px`);
      if (fillable) initAllReportTableResizers?.();
      if (state.presentation) ensureLaserPointer();
      else removeLaserPointer();
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
          const recover = await appConfirm("Há alterações locais da RPS que ainda não chegaram à nuvem. Deseja recuperá-las?", "warn");
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
      if (!canFillValues()) return;
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
      if (!state.dirty || !state.backendAvailable || !canFillValues()) return true;
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
        const locked = String(error?.message || error || "").includes("RPS_LOCKED_FOR_RESTORE");
        setStatus(locked ? "dirty" : "error", locked
          ? "Mês temporariamente bloqueado para backup ou restauração; rascunho preservado"
          : "Falha ao salvar; rascunho preservado");
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

    async function addIndicator() {
      if (!canEditStructure()) return;
      const values = await appPrompt({
        icon: "＋",
        eyebrow: "RPS · VISÃO ADM",
        title: "Adicionar indicador",
        message: "Escolha a área e informe o nome da nova linha.",
        confirmLabel: "Adicionar",
        fields: [
          {
            name: "areaId",
            label: "Área",
            type: "select",
            value: state.payload.areas[0]?.id || "",
            options: state.payload.areas.map((area) => ({ value: area.id, label: area.nome }))
          },
          {
            name: "label",
            label: "Nome do indicador",
            type: "text",
            value: "",
            placeholder: "Digite o nome da linha",
            required: true
          }
        ]
      });
      if (!values) return;
      const area = state.payload.areas.find((item) => item.id === values.areaId);
      if (!area) return;
      const label = String(values.label || "").trim();
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
        if (state.presentation) return;
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
        if (state.presentation) return;
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

      root.addEventListener("pointermove", moveLaserPointer);
      root.addEventListener("pointerleave", hideLaserPointer);
      document.addEventListener("pointermove", moveLaserPointer);
      document.addEventListener("pointerout", (event) => { if (!event.relatedTarget) hideLaserPointer(); });

      root.addEventListener("click", async (event) => {
        const backupSelection = event.target.closest("[data-rps-backup-select]");
        if (backupSelection && canManageBackups()) {
          state.backupManager.selectedId = backupSelection.dataset.rpsBackupSelect;
          renderShell();
          return;
        }
        const backupAction = event.target.closest("[data-rps-backup-action]")?.dataset.rpsBackupAction;
        if (backupAction && canManageBackups()) {
          if (backupAction === "close" && !state.backupManager.working) {
            state.backupManager.open = false;
            renderShell();
          } else if (backupAction === "refresh") {
            await loadBackupManager();
          } else if (backupAction === "create") {
            await createManualBackup();
          } else if (backupAction === "restore") {
            await restoreSelectedBackup();
          }
          return;
        }
        const weekFocus = event.target.closest("[data-rps-focus-week]");
        if (weekFocus) {
          const week = weekFocus.dataset.rpsFocusWeek;
          if (!WEEKS.includes(week) || week === focusedWeek()) return;
          state.payload.configuracoes = state.payload.configuracoes || {};
          state.payload.configuracoes.semanaFoco = week;
          if (canFillValues()) markDirty();
          renderShell();
          return;
        }
        const unitCycle = event.target.closest("[data-rps-unit-cycle]");
        if (unitCycle) {
          const key = unitCycle.dataset.rpsUnitCycle;
          const currentUnit = normalizeUnit(unitCycle.dataset.currentUnit);
          const currentIndex = UNIT_OPTIONS.indexOf(currentUnit);
          state.payload.unidades[key] = UNIT_OPTIONS[(currentIndex + 1) % UNIT_OPTIONS.length];
          markDirty();
          renderShell();
          return;
        }
        const monthModeCycle = event.target.closest("[data-rps-month-mode-cycle]");
        if (monthModeCycle) {
          const key = monthModeCycle.dataset.rpsMonthModeCycle;
          const currentIndex = MONTH_MODE_OPTIONS.findIndex((item) => item.value === monthModeCycle.dataset.currentMode);
          state.payload.modoMes[key] = MONTH_MODE_OPTIONS[(currentIndex + 1) % MONTH_MODE_OPTIONS.length].value;
          markDirty();
          renderShell();
          return;
        }
        const areaToggle = event.target.closest("[data-rps-toggle-area]");
        if (areaToggle) {
          const areaId = areaToggle.dataset.rpsToggleArea;
          if (state.collapsed.has(areaId)) state.collapsed.delete(areaId);
          else state.collapsed.add(areaId);
          renderShell();
          return;
        }
        const attachmentButton = event.target.closest("[data-rps-attachment-column]");
        if (attachmentButton) {
          const area = state.payload.areas.find((item) => item.id === attachmentButton.dataset.rpsAttachmentArea);
          const indicator = area ? getIndicators(area.id).find((item) => item.id === attachmentButton.dataset.rpsAttachmentIndicator) : null;
          if (area && indicator) {
            if (state.presentation) openAttachmentCarousel(area, indicator, attachmentButton.dataset.rpsAttachmentColumn);
            else openAttachmentModal(area, indicator, attachmentButton.dataset.rpsAttachmentColumn);
          }
          return;
        }
        const commentButton = event.target.closest("[data-rps-comment]");
        if (commentButton) {
          const key = commentButton.dataset.rpsComment;
          const previous = state.payload.comentarios[key] || "";
          const values = await appPrompt({
            icon: "●",
            eyebrow: "RPS · COMENTÁRIO",
            title: "Comentário da célula",
            message: "Registre uma observação para contextualizar este valor.",
            confirmLabel: "Salvar",
            fields: [{ name: "comment", label: "Comentário", type: "textarea", value: previous, rows: 5, placeholder: "Escreva o comentário" }]
          });
          if (!values) return;
          const next = String(values.comment || "");
          if (next.trim()) state.payload.comentarios[key] = next.trim();
          else delete state.payload.comentarios[key];
          markDirty();
          renderShell();
          return;
        }
        const action = event.target.closest("[data-rps-action]")?.dataset.rpsAction;
        if (!action) return;
        if (action === "backups") {
          openBackupManager();
        } else if (action === "refresh") {
          if (state.dirty && !await appConfirm("Descartar alterações locais e recarregar a RPS?", "warn")) return;
          state.dirty = false;
          await loadPeriod(true);
        } else if (action === "export") {
          exportTable();
        } else if (action === "add") {
          await addIndicator();
        } else if (action === "zoom-in") {
          state.presentationZoom += 2;
          renderShell();
        } else if (action === "zoom-out") {
          state.presentationZoom = Math.max(0, state.presentationZoom - 2);
          renderShell();
        } else if (action === "present") {
          state.presentation = !state.presentation;
          state.presentationZoom = 0;
          if (!state.presentation) {
            closeAttachmentCarousel();
            hideLaserPointer();
          }
          renderShell();
        }
      });
    }

    function render() {
      if (!root) return;
      bindEvents();
      const nextPeriodKey = currentPeriodKey();
      if (nextPeriodKey !== state.periodKey) {
        closeAttachmentModal();
        closeAttachmentCarousel();
        state.backupManager.open = false;
        state.backupManager.selectedId = "";
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
      closeAttachmentModal();
      closeAttachmentCarousel();
      removeLaserPointer();
      state.backupManager.open = false;
      state.presentation = false;
      state.presentationZoom = 0;
      state.loadGeneration += 1;
      document.body.classList.remove("rps-presentation-mode");
      document.body.classList.remove("rps-laser-mode");
      document.body.style.removeProperty("--rps-presentation-zoom");
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
