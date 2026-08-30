(function attachVectonStrategicModule(window) {
  // ==========================================================================
  // A3 - Gestão Estratégica — módulo frontend (Etapa 3, parte 3).
  //
  // Segue o mesmo padrão de rpsModule.js: renderiza direto num root próprio
  // (#strategic-root), com estado interno e injeção de CSS 1x (mesmo padrão
  // de reportsComercialPainelModule.js — variáveis --sa3-* escopadas, não
  // depende dos tokens globais do app pra não quebrar se algo mudar lá).
  //
  // Escopo desta leva (documentado, não escondido):
  //   - Tela 1 (Visão Executiva), Tela 2 (Detalhe do A3 + plano de ação),
  //     Tela 3 (Preenchimento Mensal) — dados 100% reais via RPC.
  //   - SEM pré-visualização de cálculo no frontend — o motor é 100%
  //     autoritativo no banco (migrations 129/130); a tela manda salvar e
  //     mostra o que a RPC devolve.
  //   - SEM editor de composição (entry_mode='breakdown') nesta leva — KPI
  //     desse tipo aparece como somente-leitura com uma nota.
  //   - Anexos: implementado pra ação e item de causas/contramedidas (chip
  //     list + upload direto pro bucket strategic-a3-attachments, migration
  //     133). Anexo em cima do registro mensal do KPI (kpi_record_id) fica
  //     pra uma leva futura — exige garantir que o registro do mês já
  //     existe antes de anexar.
  // ==========================================================================

  const MONTH_LABELS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const STATUS_META = {
    on_target:     { label: "Dentro da meta", tone: "pos" },
    attention:     { label: "Atenção",        tone: "warn" },
    off_target:    { label: "Fora da meta",   tone: "neg" },
    not_available: { label: "Sem dado",       tone: "muted" }
  };

  const ACTION_STATUS_OPTIONS = [
    { value: "not_started", label: "Não iniciada" },
    { value: "in_progress", label: "Em andamento" },
    { value: "on_hold",     label: "Pausada" },
    { value: "done",        label: "Concluída" },
    { value: "cancelled",   label: "Cancelada" }
  ];
  const ACTION_STATUS_TONE = {
    not_started: "muted", in_progress: "warn", on_hold: "pause", done: "pos", cancelled: "cancel"
  };
  // Ação "encerrada" (pedido do usuário, 2026-08-29): concluída ou cancelada
  // trava a inclusão (e remoção) de anexos — só lista o que já existe.
  const ACTION_CLOSED_STATUSES = ["done", "cancelled"];

  // priority é coluna livre (sem CHECK no banco, migration 128) — armazena o
  // rótulo em pt-BR direto, sem tabela de tradução (diferente de status, que
  // TEM CHECK e por isso precisa do código em inglês).
  const ACTION_PRIORITY_OPTIONS = ["Baixa", "Média", "Alta"];

  // Opções do fluxo de criação de A3/indicador (pedido do usuário,
  // 2026-08-29 — ver migration 155_strategic_create_a3_and_kpi.sql).
  // Enum idêntico ao check constraint de strategic_a3.management
  // (migration 142) — mesma lista que cost_centers.cost_center_management.
  const MANAGEMENT_OPTIONS = [
    "Diretoria", "Controladoria", "Recursos Humanos", "Supply Chain",
    "Industrial", "Engenharia", "Marketing", "Produto", "Qualidade", "Comercial"
  ];
  // Unidades já em uso no catálogo real (todas as migrations de seed/ajuste
  // de KPI) — "Outra…" cobre qualquer unidade fora dessa lista sem travar
  // a criação.
  const UNIT_OPTIONS = [
    { value: "BRL",     label: "R$ (Reais)" },
    { value: "percent", label: "% (Percentual)" },
    { value: "un",      label: "un. (Unidades)" },
    { value: "h",       label: "h (Horas)" },
    { value: "dias",    label: "dias" },
    { value: "x",       label: "x (múltiplo)" },
    { value: "pts",     label: "pts (Pontos)" },
    { value: "nps",     label: "NPS" }
  ];
  // Mesmo enum de strategic_kpis.comparison_mode (migration 128).
  const COMPARISON_MODE_OPTIONS = [
    { value: "higher",                label: "Maior é melhor" },
    { value: "lower",                 label: "Menor é melhor" },
    { value: "range",                 label: "Dentro de uma faixa (mín/máx)" },
    { value: "exact",                 label: "Exato (bate com a meta)" },
    { value: "exact_with_tolerance",  label: "Exato, com tolerância" }
  ];
  // Subconjunto de strategic_kpis.accumulation_method (migration 128) —
  // 'ratio_of_sums'/'weighted_average' só fazem sentido pra KPI calculado
  // (entry_mode='drivers'/'computed'), fora do escopo desta criação manual.
  const ACCUMULATION_METHOD_OPTIONS = [
    { value: "sum",         label: "Soma" },
    { value: "average",     label: "Média" },
    { value: "last_closed", label: "Último mês fechado" },
    { value: "none",        label: "Não acumula" }
  ];

  const ATTACHMENT_BUCKET = "strategic-a3-attachments";
  const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // mesmo limite do bucket (migration 133)

  function formatByUnit(value, unit, decimalPlaces) {
    if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return "—";
    const n = Number(value);
    const dp = Number.isFinite(decimalPlaces) ? decimalPlaces : (unit === "percent" ? 1 : 0);
    if (unit === "percent") {
      return `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: dp, maximumFractionDigits: dp })}%`;
    }
    if (unit === "BRL") {
      return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    const suffix = unit && unit !== "un" ? ` ${unit}` : "";
    return `${n.toLocaleString("pt-BR", { minimumFractionDigits: dp, maximumFractionDigits: dp })}${suffix}`;
  }

  // Formatação dos campos EDITÁVEIS de Meta/Real (pedido do usuário,
  // 2026-08-29) — mesma lógica de unidade do formatByUnit acima, só que
  // com dois estados: "blurred" (o campo mostra R$/%/separador de milhar,
  // bonito de ler) e "focused" (mostra só o número puro, vírgula decimal,
  // sem milhar/prefixo/sufixo — ninguém digita "R$ 1.234,50" com o cursor
  // no meio de um separador). unit='percent' guarda FRAÇÃO no banco
  // (0.025 = 2,5%) mas a pessoa digita/vê sempre a escala percentual
  // (2,5) — a conversão ×100 / ÷100 mora só aqui (format) e no parse
  // abaixo, o resto do módulo continua tratando tudo em fração.
  function formatEditableValue(value, unit, decimalPlaces, focused) {
    if (value === null || value === undefined || value === "") return "";
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    const dp = unit === "BRL" ? 0 : (Number.isFinite(decimalPlaces) ? decimalPlaces : (unit === "percent" ? 1 : 0));
    const displayNumber = unit === "percent" ? n * 100 : n;
    const s = displayNumber.toLocaleString("pt-BR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
    if (focused) return s.replace(/\./g, "");
    if (unit === "percent") return `${s}%`;
    if (unit === "BRL") return `R$ ${s}`;
    const suffix = unit && unit !== "un" ? ` ${unit}` : "";
    return `${s}${suffix}`;
  }

  // Caminho inverso: texto do input (formatado ou não — na dúvida aceita
  // os dois, já que o valor pode chegar recém-focado/limpo ou ainda
  // formatado de um blur anterior) -> número cru pro banco. Tira tudo que
  // não é dígito/vírgula/ponto/sinal (R$, %, sufixo de unidade, espaço),
  // remove ponto de milhar, troca vírgula decimal por ponto — só então
  // faz Number(). percent divide por 100 (volta pra fração).
  function parseEditableValue(text, unit) {
    if (text === null || text === undefined) return null;
    const raw = String(text).trim();
    if (raw === "") return null;
    const cleaned = raw.replace(/[^\d,.\-]/g, "").replace(/\./g, "").replace(",", ".");
    if (cleaned === "" || cleaned === "-") return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return unit === "percent" ? n / 100 : n;
  }

  // achado (melhoria #2 do review): Number(null) === 0 é finito, então
  // "sem realizado" (null) com meta preenchida passava pelo guard de
  // Number.isFinite e calculava uma variação de -100% inventada, em vez de
  // "—". Guard explícito de null/undefined/"" ANTES de converter pra number.
  //
  // achado (melhoria #3): KPI unit='percent' mostrava variação RELATIVA
  // (ex.: real 12% vs meta 10% virava "+20,0%", quando o que interessa pro
  // negócio é a diferença em PONTOS PERCENTUAIS, "+2,0 p.p."). Também
  // sinaliza o sentido favorável (▲ bom / ▼ ruim) conforme comparisonMode
  // do KPI — 'lower' inverte quem é favorável (menor é melhor), sem mudar
  // o número (mantém sinal aritmético honesto: sempre real - meta).
  function formatTargetVariation(actual, target, { unit = null, comparisonMode = null } = {}) {
    if (actual === null || actual === undefined || actual === "" ||
        target === null || target === undefined || target === "") return "—";
    const actualValue = Number(actual);
    const targetValue = Number(target);
    if (!Number.isFinite(actualValue) || !Number.isFinite(targetValue)) return "—";

    let variation;
    let suffix;
    if (unit === "percent") {
      variation = (actualValue - targetValue) * 100; // valores já vêm em fração (0.12 = 12%)
      suffix = " p.p.";
    } else {
      if (targetValue === 0) return actualValue === 0 ? "0,0%" : "—";
      variation = ((actualValue - targetValue) / Math.abs(targetValue)) * 100;
      suffix = "%";
    }

    const favorable = comparisonMode === "lower" ? -variation : variation;
    const arrow = favorable > 0 ? " ▲" : favorable < 0 ? " ▼" : "";
    const sign = variation > 0 ? "+" : "";
    return `${sign}${variation.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suffix}${arrow}`;
  }

  function createStrategicModule(deps) {
    const {
      root,
      getPeriod,
      resolveOrganizationId,
      callSupabaseRpc,
      authenticatedFetch,
      supabaseApiUrl,
      getAllAccessRoles,
      appAlert,
      appConfirm,
      uploadToStorage,
      createStorageSignedUrl,
      deleteFromStorage,
      escapeHtml
    } = deps;

    const state = {
      loading: false,
      error: "",
      screen: "overview",      // "overview" | "detail" | "entry"
      organizationId: null,
      cycleId: null,
      scenarioId: null,
      contextYear: null,      // ano pro qual cycleId/scenarioId foram resolvidos — ver ensureContext()
                                // (achado #5 do review: trocar o ano no seletor do topo mantinha o
                                // ciclo/cenário do ano anterior, podia salvar meta/ação no ciclo errado).
      loadedPeriod: null,      // { year, month } do período já carregado na tela atual — usado
                                // pra detectar troca de período no seletor do topo e recarregar
                                // (achado #1 do review: render() não recarregava ao trocar mês/ano).
      overview: null,          // { northGoals, areas }
      a3RootId: null,          // A3 clicado na Tela 1 (sempre uma mãe, filhos não aparecem lá)
      a3Children: [],          // filhos do a3RootId — vira aba "Consolidado + filhos"
      a3Id: null,              // aba ativa da Tela 2 (pode ser o próprio a3RootId ou um filho)
      a3Detail: null,          // { a3, children, kpis } — dados da aba ativa
      monthlyEntry: null,      // { a3, period, kpis }
      actions: [],             // ações do A3 atual (todas, filtro é feito na leitura)
      periodAnalysis: null,    // { id, summary, strategic_analysis_items: [...] } do A3+mês ativo, ou null se nunca salvo
      dirtyDrafts: {},         // { [kpiId]: { resultValue, drivers: {code: value} } } — edição em andamento, não salva
      justSavedKpiId: null,    // pedido do usuário (2026-08-29): KPI cujo Salvar acabou de ter
                                // sucesso — bindEntryRow lê isso 1x logo após o reload pós-save
                                // pra disparar o flash "✓ Salvo" (CSS anima e some sozinho), e já
                                // limpa o campo na hora — não é estado persistente, é só o sinal
                                // "acabei de salvar ESTE" atravessando o loadMonthlyEntry().
      attachments: { action: {}, analysis_item: {}, kpi: {} }, // { [ownerType]: { [ownerId]: strategic_attachments[] } } —
                                // 'kpi' é anexo de suporte do indicador (2026-08-29), independente
                                // de mês/período — ver renderKpiBlock e migration 172.
      orgUsers: null,          // usuários da org (picker de Responsáveis do plano de ação) — carregado 1x, cacheado
      archivedA3: null,        // A3 desativadas (is_active=false) — carregado só ao abrir a tela "Itens arquivados"
      archivedKpis: null,      // KPIs desativados — idem
      editingAction: null      // { kpiId, actionId, stagedFiles } — form de ação atualmente aberto.
                                // actionId null = criando (ainda sem id pra anexar de verdade — stagedFiles
                                // guarda os File[] escolhidos localmente, sobem todos juntos no Salvar).
                                // actionId preenchido = editando (anexo já sobe na hora, reusa
                                // renderAttachmentsStrip). Upload dispara renderShell(), que reconstrói a
                                // tela inteira — sem isso o form fechava sozinho a cada anexo adicionado;
                                // bindActionForm reabre + repreenche usando isto a cada render.
    };

    // RBAC granular por A3 (2026-08-29, migrations 142-145): não dá mais
    // pra decidir "pode editar" só olhando o papel da pessoa — depende de
    // QUAL A3 está em tela (Gestor edita só a Gestão dele; A3 Estratégicos
    // só o que foi concedido). O banco já resolve isso corretamente
    // (strategic_can_edit_a3) e devolve o resultado pronto em "canEdit" nas
    // RPCs strategic_get_a3_detail/strategic_get_monthly_entry — canManage()
    // só lê esse campo do estado já carregado da tela ativa, sem duplicar a
    // regra em JS.
    const canManage = () => !!(state.screen === "entry" ? state.monthlyEntry?.canEdit : state.a3Detail?.canEdit);

    // Rascunho não salvo (melhoria #5 do review): state.dirtyDrafts existia
    // declarado desde sempre mas nunca era escrito — Tela 3 deixava trocar
    // de linha, sair ou recarregar a tela sem avisar que a edição em
    // andamento ia se perder. markDirty só marca a linha (não guarda o
    // valor em si — o DOM já é a fonte de verdade enquanto a tela não
    // recarrega) e liga a classe visual; hasDirtyDrafts/clearDirtyDrafts dão
    // os pontos de checagem usados nos guards de navegação abaixo.
    const markDirty = (kpiId) => {
      state.dirtyDrafts[kpiId] = true;
      root.querySelector(`[data-kpi-row="${cssEscape(kpiId)}"]`)?.classList.add("dirty");
    };
    const hasDirtyDrafts = (exceptKpiId = null) =>
      Object.keys(state.dirtyDrafts).some((id) => id !== exceptKpiId);
    const clearDirtyDrafts = () => { state.dirtyDrafts = {}; };

    // Fechar a aba/recarregar com rascunho pendente também avisa — só entra
    // em jogo com a Tela 3 aberta e algo dirty (removido em destroy()).
    const handleBeforeUnload = (e) => {
      if (state.screen === "entry" && hasDirtyDrafts()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Edição de CATÁLOGO (nome/subtítulo do indicador) é diferente de
    // editar o A3 em si — pedido do usuário (2026-08-29): só super_admin/
    // admin, nunca Gestor nem A3 Estratégicos, mesmo que eles tenham
    // canManage()=true pra esse A3. Checagem de papel direto (não depende
    // de qual A3 está em tela).
    const isSuperAdminOrAdmin = () => {
      const roles = getAllAccessRoles ? getAllAccessRoles() : [];
      return roles.includes("super_admin") || roles.includes("admin");
    };

    const currentPeriod = () => {
      const p = getPeriod ? getPeriod() : { year: 2026, month: 1 };
      return { year: Number(p.year) || 2026, month: Number(p.month) || 1 };
    };

    // ---------------------------------------------------------------- CSS
    function ensureStyle() {
      if (document.getElementById("sa3-style")) return;
      const s = document.createElement("style");
      s.id = "sa3-style";
      s.textContent = `
        .sa3 {
          --sa3-bg:#09090a; --sa3-bg-soft:#0e0e10; --sa3-panel:#121317; --sa3-panel-alt:#0f1013; --sa3-panel-hover:#191b20;
          --sa3-line:#2a2d34; --sa3-line-soft:rgba(255,255,255,.06);
          --sa3-text:#ffffff; --sa3-soft:#a1a7b3; --sa3-faint:#6b7280;
          --sa3-blue:#4f7cff; --sa3-pos:#4ade80; --sa3-neg:#f87171; --sa3-amber:#f59e0b; --sa3-violet:#8b5cf6;
          color:var(--sa3-text); font-family:inherit;
        }
        .sa3 * { box-sizing:border-box; }
        .sa3 button { font-family:inherit; }
        .sa3-card { background:rgba(12,14,18,.9); border:1px solid var(--sa3-line); border-radius:16px; box-shadow:0 18px 48px rgba(0,0,0,.32); padding:18px 20px; margin-bottom:14px; }
        .sa3-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:14px; flex-wrap:wrap; }
        .sa3-head h2, .sa3-head h3 { margin:0; font-size:1rem; font-weight:700; letter-spacing:-.01em; }
        .sa3-head p { margin:4px 0 0; font-size:.78rem; color:var(--sa3-soft); max-width:520px; line-height:1.45; }
        .sa3-btn { border-radius:10px; padding:8px 14px; font-size:.78rem; font-weight:600; cursor:pointer; border:1px solid var(--sa3-line); background:transparent; color:var(--sa3-soft); }
        .sa3-btn:hover { background:rgba(255,255,255,.05); color:var(--sa3-text); }
        .sa3-btn.primary { background:var(--sa3-blue); border-color:var(--sa3-blue); color:#fff; }
        .sa3-btn.primary:hover { background:#3f68e6; }
        .sa3-btn:disabled { opacity:.45; cursor:not-allowed; }
        .sa3-back { display:inline-flex; align-items:center; gap:6px; color:var(--sa3-soft); background:none; border:none; cursor:pointer; font-size:.78rem; margin-bottom:12px; padding:0; }
        .sa3-back:hover { color:var(--sa3-text); }
        .sa3-north-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); gap:10px; }
        .sa3-north-card { padding:12px 13px; border-radius:12px; background:var(--sa3-panel-alt); border:1px solid var(--sa3-line-soft); min-height:70px; }
        .sa3-north-card .l { font-size:.66rem; color:var(--sa3-faint); }
        .sa3-north-card .v { font-size:.84rem; font-weight:800; margin-top:4px; }
        .sa3-area-list { display:flex; flex-direction:column; gap:8px; }
        .sa3-area-row {
          display:grid; grid-template-columns:38px 1fr auto 16px; align-items:center; gap:14px;
          padding:12px 15px; border-radius:12px; background:var(--sa3-panel); border:1px solid var(--sa3-line-soft);
          border-left:3px solid var(--row-accent, var(--sa3-line)); cursor:pointer; width:100%; text-align:left; color:var(--sa3-text);
        }
        .sa3-area-row:hover { background:var(--sa3-panel-hover); }
        .sa3-area-icon { width:32px; height:32px; border-radius:9px; display:grid; place-items:center; font-weight:700; font-size:.72rem; background:rgba(255,255,255,.05); }
        .sa3-area-name { font-size:.82rem; font-weight:700; }
        .sa3-area-sub { font-size:.68rem; color:var(--sa3-faint); margin-top:1px; }
        /* Tela "Itens arquivados" (melhoria #8 do review) — mesmo padrão
           visual de sa3-area-row, sem o ícone/chevron (não navega). */
        .sa3-archived-list { display:flex; flex-direction:column; gap:8px; }
        .sa3-archived-row { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:12px 15px; border-radius:12px; background:var(--sa3-panel); border:1px solid var(--sa3-line-soft); }
        .sa3-archived-name { font-size:.82rem; font-weight:700; }
        .sa3-archived-meta { font-size:.68rem; color:var(--sa3-faint); margin-top:1px; }
        .sa3-archived-tag { font-size:.6rem; font-weight:700; text-transform:uppercase; color:var(--sa3-faint); border:1px solid var(--sa3-line); border-radius:999px; padding:1px 6px; margin-left:4px; vertical-align:middle; }
        .sa3-subtabs { display:flex; gap:6px; flex-wrap:wrap; margin-top:12px; }
        .sa3-subtab { border:1px solid var(--sa3-line); background:rgba(255,255,255,.02); color:var(--sa3-soft); padding:6px 12px; border-radius:9px; font-size:.74rem; font-weight:600; cursor:pointer; }
        .sa3-subtab.active { background:rgba(79,124,255,.14); border-color:rgba(79,124,255,.4); color:#8fb0ff; }
        .sa3-objective-text { white-space:pre-wrap; font-size:.82rem; line-height:1.5; color:var(--sa3-text); }
        .sa3-objective-text.hidden { display:none; }
        .sa3-objective-editor.hidden { display:none; }
        .sa3-objective-textarea { width:100%; min-height:220px; resize:vertical; background:rgba(255,255,255,.03); border:1px solid var(--sa3-line); border-radius:10px; color:var(--sa3-text); font:inherit; font-size:.82rem; line-height:1.5; padding:12px 14px; margin-bottom:10px; }
        .sa3-objective-textarea:focus { border-color:rgba(79,124,255,.6); outline:none; }
        .sa3-analysis-list { display:flex; flex-direction:column; gap:8px; margin-bottom:6px; }
        .sa3-analysis-item { padding:10px 12px; border-radius:9px; background:var(--sa3-panel-alt); border:1px solid var(--sa3-line-soft); font-size:.78rem; }
        .sa3-analysis-item-row { display:grid; grid-template-columns:auto 1fr auto; gap:10px; align-items:start; }
        .sa3-analysis-item-row.hidden { display:none; }
        .sa3-analysis-tag { padding:3px 9px; border-radius:999px; font-size:.64rem; font-weight:700; white-space:nowrap; }
        .sa3-analysis-tag.cause { background:rgba(245,158,11,.12); color:var(--sa3-amber); }
        .sa3-analysis-tag.countermeasure { background:rgba(74,222,128,.12); color:var(--sa3-pos); }
        .sa3-analysis-kpis { margin-top:5px; display:flex; gap:5px; flex-wrap:wrap; }
        .sa3-analysis-kpi-chip { font-size:.62rem; color:var(--sa3-faint); background:rgba(255,255,255,.04); border-radius:999px; padding:2px 7px; }
        .sa3-item-actions { display:flex; gap:4px; }
        .sa3-icon-btn { background:none; border:none; color:var(--sa3-faint); cursor:pointer; padding:2px; }
        .sa3-icon-btn:hover { color:var(--sa3-text); }
        .sa3-attachments { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:8px; }
        .sa3-attachment-chip, .sa3-attachments .sa3-attachment-add {
          display:inline-flex; align-items:center; height:24px; box-sizing:border-box;
          font-size:.68rem; line-height:1; border-radius:999px; cursor:pointer;
          text-transform:none; font-weight:600; margin-bottom:0;
        }
        .sa3-attachment-chip { gap:5px; padding:0 6px 0 8px; background:rgba(255,255,255,.04); border:1px solid var(--sa3-line-soft); color:var(--sa3-soft); max-width:220px; }
        .sa3-attachment-chip:hover { border-color:rgba(79,124,255,.4); }
        .sa3-attachment-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .sa3-attachment-remove { background:none; border:none; color:var(--sa3-faint); cursor:pointer; font-size:.9rem; line-height:1; padding:0 0 0 2px; }
        .sa3-attachment-remove:hover { color:var(--sa3-neg); }
        /* .sa3-attachments .sa3-attachment-add (2 classes) — precisa vencer
           .sa3-form label (1 classe + elemento) quando a faixa de anexos é
           renderizada dentro do form, senão "+Anexar" vira um <label>
           genérico (uppercase, display:block), desalinhado dos chips do lado. */
        .sa3-attachments .sa3-attachment-add { gap:4px; padding:0 10px; border:1px dashed var(--sa3-line); color:var(--sa3-faint); }
        .sa3-attachments .sa3-attachment-add:hover { border-color:rgba(79,124,255,.4); color:#8fb0ff; }
        /* Picker de Responsáveis — fechado por padrão (só um botão-flag com
           a contagem); clicar abre a lista em popover ancorado embaixo do
           botão, largura travada na soma de Prioridade+Progresso (150+150+
           gap 10 = 310px) — não é pra esticar até a borda do formulário. */
        .sa3-owner-picker { position:relative; max-width:310px; }
        .sa3-owner-toggle { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; height:36px; }
        .sa3-owner-toggle .sa3-chevron { flex-shrink:0; transition:transform 150ms; }
        .sa3-owner-toggle[aria-expanded="true"] .sa3-chevron { transform:rotate(180deg); }
        .sa3-owner-list {
          display:flex; flex-direction:column; max-height:160px; overflow-y:auto;
          position:absolute; top:calc(100% + 4px); left:0; width:100%; z-index:6;
          border:1px solid var(--sa3-line); border-radius:8px; padding:4px 6px;
          background:var(--sa3-panel); box-shadow:0 14px 32px rgba(0,0,0,.4);
        }
        .sa3-owner-list.hidden { display:none; }
        /* .sa3-owner-row é um <label> — precisa de 2 classes na especificidade
           pra vencer a regra genérica ".sa3-form label" (uppercase/bold/
           display:block), senão a linha quebra o layout em flex. */
        .sa3-owner-list .sa3-owner-row {
          display:flex; align-items:center; gap:8px; padding:4px 6px; border-radius:6px;
          font-size:.76rem; font-weight:400; text-transform:none; color:var(--sa3-soft);
          cursor:pointer; user-select:none; margin-bottom:0;
        }
        .sa3-owner-list .sa3-owner-row:hover { background:rgba(255,255,255,.04); }
        .sa3-owner-row input[type="checkbox"] {
          appearance:none; -webkit-appearance:none; margin:0; flex-shrink:0; cursor:pointer;
          width:14px; height:14px; border-radius:4px; border:1px solid var(--sa3-line);
          background:rgba(255,255,255,.03); display:grid; place-items:center;
        }
        .sa3-owner-row input[type="checkbox"]::after {
          content:""; width:7px; height:4px; opacity:0;
          border-left:1.6px solid #7fa4ff; border-bottom:1.6px solid #7fa4ff;
          transform:rotate(-45deg) translateY(-1px);
        }
        .sa3-owner-row input[type="checkbox"]:checked { background:rgba(79,124,255,.18); border-color:rgba(79,124,255,.55); }
        .sa3-owner-row input[type="checkbox"]:checked::after { opacity:1; }
        /* Editar/excluir indicador (catálogo) — só super_admin/admin, ver
           isSuperAdminOrAdmin(). Ícones no canto do card, edição troca o
           título/subtítulo por 2 inputs no lugar (mesmo padrão do Objetivo
           Estratégico). */
        .sa3-kpi-head-actions { display:flex; align-items:center; gap:2px; flex-shrink:0; }
        /* Anexos de suporte do indicador (pedido do usuário, 2026-08-29) —
           ícone de clipe no cabeçalho do card, com contador quando já tem
           anexo; clicar abre/fecha o painel .sa3-kpi-attachments logo
           abaixo do header (mesmo renderAttachmentsStrip de Causas/Plano
           de Ação — chips + carrossel já prontos, só reaproveitados). */
        .sa3-kpi-head-actions [data-action="toggle-kpi-attachments"] { position:relative; }
        .sa3-attachment-count {
          position:absolute; top:-4px; right:-6px; min-width:14px; height:14px; padding:0 3px;
          border-radius:999px; background:var(--sa3-blue); color:#fff; font-size:.56rem; font-weight:800;
          line-height:14px; text-align:center;
        }
        .sa3-kpi-attachments { margin:-2px 0 12px; }
        .sa3-kpi-attachments.hidden { display:none; }
        .sa3-kpi-title-edit.hidden { display:none; }
        .sa3-kpi-title-edit input { width:100%; background:rgba(255,255,255,.03); border:1px solid var(--sa3-line); border-radius:8px; color:var(--sa3-text); font:inherit; font-size:.82rem; padding:8px 10px; margin-bottom:6px; }
        .sa3-kpi-title-edit input:last-of-type { margin-bottom:10px; }
        .sa3-pill { display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:999px; font-size:.66rem; font-weight:700; white-space:nowrap; }
        .sa3-pill.pos { background:rgba(74,222,128,.12); color:var(--sa3-pos); }
        .sa3-pill.neg { background:rgba(248,113,113,.12); color:var(--sa3-neg); }
        .sa3-pill.warn { background:rgba(245,158,11,.12); color:var(--sa3-amber); }
        .sa3-pill.pause { background:rgba(139,92,246,.12); color:var(--sa3-violet); }
        .sa3-pill.cancel { background:rgba(255,255,255,.05); color:var(--sa3-faint); text-decoration:line-through; }
        .sa3-pill.muted { background:rgba(255,255,255,.05); color:var(--sa3-faint); }
        .sa3-chevron { color:var(--sa3-faint); }
        .sa3-kpi-block-head { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:12px; }
        .sa3-kpi-title { font-size:.9rem; font-weight:700; }
        .sa3-kpi-sub { font-size:.72rem; color:var(--sa3-faint); margin-top:2px; }
        .sa3-combo-chart { margin-top:8px; }
        .sa3-chart-plot { position:relative; height:116px; }
        .sa3-bars { position:absolute; inset:0; display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:6px; padding:0 2px; z-index:1; }
        .sa3-bar-col { position:relative; height:100%; min-width:0; }
        .sa3-bar-real { position:absolute; left:50%; transform:translateX(-50%); width:min(27px,86%); border-radius:5px 5px 1px 1px; background:linear-gradient(180deg,#b6c2d2 0%,#78889d 24%,#374151 100%); box-shadow:0 8px 12px rgba(15,23,42,.24); overflow:hidden; }
        .sa3-bar-real::after { content:""; position:absolute; top:1px; left:1px; right:1px; height:28%; min-height:2px; border-radius:4px 4px 2px 2px; background:linear-gradient(180deg,rgba(255,255,255,.24),rgba(255,255,255,.06)); pointer-events:none; }
        .sa3-bar-real.pos { background:linear-gradient(180deg,#74e89b 0%,#2dcc6b 24%,#0d6b38 100%); box-shadow:0 8px 12px rgba(34,197,94,.20); }
        .sa3-bar-real.neg { background:linear-gradient(180deg,#f58a8a 0%,#ef5050 24%,#8b202b 100%); box-shadow:0 8px 12px rgba(239,68,68,.20); }
        .sa3-bar-real.warn { background:linear-gradient(180deg,#ffd479 0%,#f5a623 24%,#8a5a0d 100%); box-shadow:0 8px 12px rgba(245,158,11,.20); }
        .sa3-chart-zero { position:absolute; left:2px; right:2px; height:1px; background:rgba(255,255,255,.08); z-index:0; }
        .sa3-target-svg { position:absolute; inset:0 2px; width:calc(100% - 4px); height:100%; overflow:visible; pointer-events:none; z-index:2; }
        .sa3-target-line { fill:none; stroke:#4f7cff; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; vector-effect:non-scaling-stroke; filter:drop-shadow(0 2px 4px rgba(79,124,255,.34)); }
        .sa3-target-point { fill:#4f7cff; stroke:#111318; stroke-width:1.5; vector-effect:non-scaling-stroke; }
        /* KPI comparisonMode='range' não tem 1 meta só — desenha mín/máx como
           2 linhas pontilhadas mais discretas em vez de 1 linha cheia. */
        .sa3-target-line.band { stroke-width:1.6; stroke-dasharray:5 4; opacity:.62; filter:none; }
        .sa3-target-point.band { opacity:.62; }
        .sa3-chart-months { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:6px; padding:6px 2px 0; text-align:center; }
        .sa3-bar-month { font-size:.58rem; color:var(--sa3-faint); text-transform:uppercase; }
        .sa3-chart-legend { display:flex; justify-content:flex-end; align-items:center; gap:12px; margin-top:7px; color:var(--sa3-faint); font-size:.62rem; }
        .sa3-chart-legend span { display:inline-flex; align-items:center; gap:5px; }
        .sa3-legend-bar { width:10px; height:10px; border-radius:2px 2px 0 0; background:linear-gradient(90deg,#22c55e 0 50%,#ef4444 50% 100%); }
        .sa3-legend-line { width:16px; height:0; border-top:2px solid #4f7cff; }
        .sa3-chart-tooltip { position:fixed; z-index:9999; display:none; min-width:138px; padding:9px 11px; border-radius:8px; background:#0c0e12; border:1px solid var(--sa3-line); box-shadow:0 12px 30px rgba(0,0,0,.42); pointer-events:none; }
        .sa3-chart-tooltip-month { padding-bottom:6px; margin-bottom:5px; border-bottom:1px solid var(--sa3-line-soft); color:var(--sa3-text); font-size:.68rem; font-weight:800; text-transform:lowercase; }
        .sa3-chart-tooltip-row { display:flex; align-items:center; justify-content:space-between; gap:14px; color:var(--sa3-soft); font-size:.68rem; line-height:1.55; }
        .sa3-chart-tooltip-row strong { color:var(--sa3-text); font-weight:700; text-align:right; white-space:nowrap; }
        .sa3-action-plan { margin-top:14px; padding-top:12px; border-top:1px solid var(--sa3-line-soft); }
        .sa3-action-item { display:grid; grid-template-columns:1fr 130px 90px 110px 56px; gap:10px; align-items:center; padding:9px 12px; border-radius:9px; background:var(--sa3-panel-alt); border:1px solid var(--sa3-line-soft); font-size:.75rem; margin-bottom:6px; }
        .sa3-action-desc { color:var(--sa3-text); }
        .sa3-action-meta { color:var(--sa3-faint); font-size:.68rem; }
        .sa3-empty { display:flex; align-items:center; gap:8px; padding:12px; border-radius:10px; border:1px dashed var(--sa3-line-soft); color:var(--sa3-faint); font-size:.76rem; }
        .sa3-form { display:flex; flex-direction:column; gap:10px; margin-top:10px; padding:14px; border-radius:12px; border:1px dashed rgba(79,124,255,.35); background:rgba(79,124,255,.035); }
        .sa3-form.hidden { display:none; }
        .sa3-form label { display:block; font-size:.64rem; font-weight:700; text-transform:uppercase; color:var(--sa3-faint); margin-bottom:4px; }
        .sa3-form input, .sa3-form select, .sa3-form textarea { width:100%; background:rgba(255,255,255,.03); border:1px solid var(--sa3-line); border-radius:8px; color:var(--sa3-text); font:inherit; font-size:.78rem; padding:8px 10px; }
        /* input e select têm altura intrínseca diferente por padrão do
           navegador (select "cresce" mais) — trava os dois na mesma altura
           pra Prioridade/Progresso ficarem visualmente idênticos. */
        .sa3-form input:not([type="checkbox"]), .sa3-form select { height:36px; }
        /* Select nativo: remove o chrome do navegador (senão a lista de
           opções abre com fundo branco do SO, ilegível no tema escuro) e
           desenha a setinha própria; color-scheme:dark força o popup nativo
           pro tema escuro nos browsers que respeitam isso no elemento. */
        .sa3-form select {
          color-scheme:dark; appearance:none; -webkit-appearance:none; -moz-appearance:none;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 10px center; background-size:13px; padding-right:28px;
        }
        .sa3-form select option { background:#121317; color:#ffffff; }
        .sa3-form-grid { display:grid; grid-template-columns:1fr 130px 150px; gap:10px; }
        .sa3-form-foot { display:flex; justify-content:flex-end; gap:8px; }
        /* Tela 3 (lançamento mensal) — layout ÚNICO pra 100% dos indicadores,
           qualquer entry_mode: Nome | Meta | Real | 1 botão Salvar, sempre
           nas mesmas 4 colunas, botões sempre alinhados na mesma borda. */
        /* Pedido do usuário (2026-08-29): a coluna do nome era 1fr — em
           painéis largos isso empurrava Meta/Real/Salvar lá pra direita,
           com um vão enorme de espaço vazio no meio da linha. Trocado por
           minmax(200px,320px): cresce só até o necessário pro nome mais
           comprido do catálogo, sem "puxar" a largura toda como 1fr
           fazia — o resto das colunas fica coladas mais à esquerda.
           Coluna do Salvar também foi de 100px pra 160px (ver
           .sa3-dirty-badge abaixo — 100px forçava "Não salvo" a quebrar
           em 2 linhas). */
        .sa3-entry-row { position:relative; display:grid; grid-template-columns:minmax(200px,320px) 190px 190px 160px; align-items:start; gap:14px; padding:14px; border-radius:10px; background:var(--sa3-panel); border:1px solid var(--sa3-line-soft); margin-bottom:8px; }
        .sa3-entry-name { font-size:.82rem; font-weight:700; padding-top:22px; }
        .sa3-entry-target { font-size:.68rem; color:var(--sa3-faint); margin-top:2px; }
        .sa3-entry-meta, .sa3-entry-real, .sa3-entry-save { display:flex; flex-direction:column; gap:4px; }
        .sa3-entry-meta .k, .sa3-entry-real .k, .sa3-entry-save .k { font-size:.6rem; text-transform:uppercase; letter-spacing:.04em; color:var(--sa3-faint); font-weight:700; }
        .sa3-entry-meta-row { display:flex; gap:4px; }
        .sa3-entry-meta-row input, .sa3-entry-real > input { width:100%; background:rgba(255,255,255,.03); border:1px solid var(--sa3-line); border-radius:8px; color:var(--sa3-text); font:inherit; font-size:.82rem; padding:8px 10px; text-align:right; }
        .sa3-entry-meta-row input:disabled, .sa3-entry-real > input:disabled { opacity:.55; }
        /* Remoção do seletor nativo (setinhas) de input number agora é
           regra global em styles.css — não precisa repetir aqui. */
        .sa3-entry-real .sa3-entry-target { margin-top:0; padding-top:8px; }
        .sa3-entry-driver-row { display:flex; align-items:center; gap:6px; margin-top:2px; }
        .sa3-entry-driver-row label { font-size:.62rem; color:var(--sa3-faint); flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .sa3-entry-driver-row input { width:76px; background:rgba(255,255,255,.03); border:1px solid var(--sa3-line); border-radius:6px; color:var(--sa3-text); font:inherit; font-size:.74rem; padding:5px 6px; text-align:right; }
        /* Pedido do usuário (2026-08-29): 1ª tentativa foi align-self:
           stretch + centralizar por dentro, mas na tela real o botão saía
           mais baixo que o rótulo "META"/"REAL" — a suposição de que a
           altura esticada bate exatamente com a coluna mais alta não se
           confirmou. Troca de abordagem: em vez de tentar adivinhar/
           centralizar relativo à altura da linha, replica a MESMA
           estrutura de Meta/Real (rótulo + gap:4px + conteúdo) — um
           rótulo ".k" invisível (mesma fonte/altura, só sem texto
           visível) posiciona o botão exatamente na mesma régua vertical
           do input, não interessa a altura final da linha. */
        .sa3-entry-save .k { visibility:hidden; }
        .sa3-entry-save-row { display:flex; align-items:center; justify-content:flex-end; gap:8px; }
        /* Aviso de rascunho não salvo (melhoria #5 do review) — some por
           padrão, .sa3-entry-row.dirty é quem revela (JS toggla a classe no
           1º input tocado, sem re-renderizar a linha inteira). Pedido do
           usuário (2026-08-29): testou como ponto pulsante e não gostou —
           texto "Não salvo" de volta, mas com white-space:nowrap (a coluna
           do Salvar tinha só 100px, forçava quebra em 2 linhas — agora tem
           160px) e uma cor mais viva (rosa) que o âmbar original. */
        .sa3-dirty-badge { display:none; font-size:.68rem; font-weight:700; white-space:nowrap; color:#f472b6; }
        .sa3-entry-row.dirty .sa3-dirty-badge { display:inline; animation:sa3-dirty-pulse 1.6s ease-in-out infinite; }
        @keyframes sa3-dirty-pulse { 0%, 100% { opacity:1; } 50% { opacity:.4; } }
        /* Flash de confirmação (pedido do usuário 2026-08-29): depois do
           Salvar dar certo, some o "Não salvo" (a linha já recarrega sem
           a classe .dirty) e pisca um "✓ Salvo" à direita do botão, no
           espaço vazio que já sobrava ali — position:absolute ancorado no
           canto direito da LINHA (não da coluna do Salvar, que é largura
           fixa) pra não brigar com o grid. .show é quem a JS liga depois
           do reload pós-save (ver bindEntryRow); a animação "forwards"
           termina em opacity:0 e para sozinha, sem precisar remover a
           classe — o próximo Salvar recria a linha do zero de qualquer
           jeito (loadMonthlyEntry re-renderiza tudo). */
        .sa3-saved-flag { position:absolute; right:14px; top:50%; transform:translateY(-50%); font-size:.72rem; font-weight:700; color:var(--sa3-pos); opacity:0; pointer-events:none; }
        .sa3-saved-flag.show { animation:sa3-saved-blink 1.4s ease-in-out forwards; }
        @keyframes sa3-saved-blink { 0% { opacity:0; } 20% { opacity:1; } 75% { opacity:1; } 100% { opacity:0; } }
        /* Painel de composição (entry_mode='breakdown') — full-width, logo
           abaixo da linha compacta (não cabe nos 190px da coluna Real). */
        .sa3-breakdown-panel { padding:10px 14px 14px; margin:-2px 0 8px; border-radius:0 0 10px 10px; background:var(--sa3-panel-alt); border:1px solid var(--sa3-line-soft); border-top:none; }
        .sa3-breakdown-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .sa3-breakdown-head .k { font-size:.6rem; text-transform:uppercase; letter-spacing:.04em; color:var(--sa3-faint); font-weight:700; }
        .sa3-breakdown-rows { display:flex; flex-direction:column; gap:6px; }
        .sa3-breakdown-row { display:grid; grid-template-columns:1fr 120px 120px 100px 26px; gap:8px; align-items:center; }
        .sa3-breakdown-row.no-weight { grid-template-columns:1fr 120px 120px 26px; }
        .sa3-breakdown-row input { width:100%; background:rgba(255,255,255,.03); border:1px solid var(--sa3-line); border-radius:6px; color:var(--sa3-text); font:inherit; font-size:.76rem; padding:6px 8px; }
        .sa3-breakdown-row input[type="number"] { text-align:right; }
        .sa3-badge-auto { display:inline-flex; align-items:center; gap:4px; margin-left:8px; padding:2px 8px; border-radius:999px; background:rgba(79,124,255,.12); color:#8fb0ff; border:1px solid rgba(79,124,255,.28); font-size:.62rem; font-weight:700; vertical-align:middle; }
        .sa3-period-status { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
        .sa3-loading, .sa3-error { padding:40px 20px; text-align:center; color:var(--sa3-faint); font-size:.84rem; }
        .sa3-error { color:var(--sa3-neg); }
        /* Modais de criação (A3 nova / indicador novo) — só super_admin/
           admin, ver isSuperAdminOrAdmin(). Overlay simples, sem depender
           de nenhuma classe global do app (módulo autocontido). */
        .sa3-modal-overlay { position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; padding:20px; }
        .sa3-modal-card { background:var(--sa3-panel); border:1px solid var(--sa3-line); border-radius:16px; box-shadow:0 24px 60px rgba(0,0,0,.5); padding:22px 24px; width:100%; max-width:420px; max-height:90vh; overflow-y:auto; }
        .sa3-modal-title { font-size:1rem; font-weight:700; margin:0 0 4px; }
        .sa3-modal-subtitle { font-size:.76rem; color:var(--sa3-soft); margin:0 0 16px; }
        .sa3-modal-field { margin-bottom:12px; }
        .sa3-modal-field label { display:block; font-size:.64rem; font-weight:700; text-transform:uppercase; color:var(--sa3-faint); margin-bottom:4px; }
        .sa3-modal-field input, .sa3-modal-field select {
          width:100%; height:38px; box-sizing:border-box; background:rgba(255,255,255,.03);
          border:1px solid var(--sa3-line); border-radius:8px; color:var(--sa3-text); font:inherit; font-size:.82rem; padding:0 10px;
        }
        .sa3-modal-field select {
          color-scheme:dark; appearance:none; -webkit-appearance:none; -moz-appearance:none;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 10px center; background-size:13px; padding-right:28px;
        }
        .sa3-modal-field select option { background:#121317; color:#fff; }
        .sa3-modal-hint { font-size:.68rem; color:var(--sa3-faint); margin-top:4px; }
        .sa3-modal-foot { display:flex; justify-content:flex-end; gap:8px; margin-top:18px; }
        .sa3-modal-radio-group { display:flex; gap:8px; }
        .sa3-modal-radio { flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; border:1px solid var(--sa3-line); border-radius:8px; cursor:pointer; font-size:.78rem; color:var(--sa3-soft); text-align:center; }
        .sa3-modal-radio.active { border-color:rgba(79,124,255,.55); background:rgba(79,124,255,.1); color:#8fb0ff; }
        .sa3-modal-hidden { display:none; }
      `;
      document.head.append(s);
    }

    // ---------------------------------------------------------------- API
    async function ensureContext() {
      if (!state.organizationId) {
        state.organizationId = await resolveOrganizationId();
      }
      const { year } = currentPeriod();
      // Ciclo/cenário são resolvidos POR ANO — trocar o ano no seletor do
      // topo (ex.: 2026 -> 2027) tinha que limpar cycleId/scenarioId do ano
      // anterior antes de decidir se precisa buscar de novo, senão a tela
      // continuava salvando meta/ação no ciclo velho (achado #5 do review).
      if (state.contextYear !== year) {
        state.cycleId = null;
        state.scenarioId = null;
        state.contextYear = year;
      }
      if (!state.cycleId) {
        const rows = await fetchRest(
          "strategic_cycles",
          `organization_id=eq.${state.organizationId}&year=eq.${year}&select=id&limit=1`
        );
        state.cycleId = rows[0]?.id || null;
      }
      if (!state.scenarioId && state.cycleId) {
        const rows = await fetchRest(
          "strategic_scenarios",
          `cycle_id=eq.${state.cycleId}&is_current=eq.true&select=id&limit=1`
        );
        state.scenarioId = rows[0]?.id || null;
      }
    }

    async function fetchRest(table, query) {
      const response = await authenticatedFetch(`${supabaseApiUrl}/rest/v1/${table}?${query}`);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    }

    async function loadOverview() {
      state.loading = true; state.error = ""; renderShell();
      try {
        await ensureContext();
        const period = currentPeriod();
        state.loadedPeriod = period;
        state.overview = await callSupabaseRpc("strategic_get_overview", {
          p_organization_id: state.organizationId, p_year: period.year, p_month: period.month
        });
      } catch (err) {
        state.error = friendlyError(err);
      } finally {
        state.loading = false; renderShell();
      }
    }

    // Melhoria #8 do review: tela de itens arquivados (A3 + KPI
    // is_active=false), só super_admin/admin (mesmo gate das RPCs de
    // catálogo). Não depende do período do topo — sem reload em
    // periodChanged, diferente de overview/detail/entry.
    async function loadArchived() {
      state.loading = true; state.error = ""; state.screen = "archived"; renderShell();
      try {
        await ensureContext();
        const [a3s, kpis] = await Promise.all([
          callSupabaseRpc("strategic_list_archived_a3", { p_organization_id: state.organizationId }),
          callSupabaseRpc("strategic_list_archived_kpi", { p_organization_id: state.organizationId })
        ]);
        state.archivedA3 = a3s || [];
        state.archivedKpis = kpis || [];
      } catch (err) {
        state.error = friendlyError(err);
      } finally {
        state.loading = false; renderShell();
      }
    }

    // isRoot=true quando vem da Tela 1 (sempre uma A3 mãe) — reseta as abas.
    // isRoot=false é clique numa aba (Consolidado/filho) dentro da própria
    // Tela 2, OU recarga por troca de período mantendo a aba ativa — mantém
    // as abas já carregadas, só troca o KPI exibido.
    async function loadA3Detail(a3Id, isRoot = true) {
      state.loading = true; state.error = ""; state.a3Id = a3Id; state.screen = "detail";
      if (isRoot) { state.a3RootId = a3Id; state.a3Children = []; }
      // Só zera se for OUTRA A3 (não a mesma recarregando por troca de
      // período) — mantém a tela suave nesse caso, sem flash de loading.
      if (state.a3Detail?.a3?.id !== a3Id) state.a3Detail = null;
      renderShell();
      try {
        await ensureContext();
        const period = currentPeriod();
        state.loadedPeriod = period;
        state.a3Detail = await callSupabaseRpc("strategic_get_a3_detail", {
          p_organization_id: state.organizationId, p_a3_id: a3Id, p_year: period.year, p_month: period.month
        });
        if (isRoot) state.a3Children = state.a3Detail?.children || [];
        await loadActionsForA3(a3Id);
        await loadPeriodAnalysis(a3Id, period.year, period.month);
        await loadAttachments();
        await ensureOrgUsers();
      } catch (err) {
        state.error = friendlyError(err);
      } finally {
        state.loading = false; renderShell();
      }
    }

    async function loadMonthlyEntry(a3Id) {
      state.loading = true; state.error = ""; state.a3Id = a3Id; state.screen = "entry";
      if (state.monthlyEntry?.a3?.id !== a3Id) state.monthlyEntry = null;
      renderShell();
      try {
        await ensureContext();
        const period = currentPeriod();
        state.loadedPeriod = period;
        state.monthlyEntry = await callSupabaseRpc("strategic_get_monthly_entry", {
          p_organization_id: state.organizationId, p_a3_id: a3Id, p_year: period.year, p_month: period.month
        });
        state.dirtyDrafts = {};
      } catch (err) {
        state.error = friendlyError(err);
      } finally {
        state.loading = false; renderShell();
      }
    }

    async function loadActionsForA3(a3Id) {
      const kpiIds = (state.a3Detail?.kpis || []).map((k) => k.id);
      if (!kpiIds.length) { state.actions = []; return; }
      const rows = await fetchRest(
        "strategic_actions",
        `organization_id=eq.${state.organizationId}&select=*,strategic_action_kpis(kpi_id),strategic_action_a3(a3_id),strategic_action_owners(user_id)&order=due_date.asc.nullslast`
      );
      state.actions = (rows || []).filter((a) =>
        (a.strategic_action_a3 || []).some((l) => l.a3_id === a3Id) ||
        (a.strategic_action_kpis || []).some((l) => kpiIds.includes(l.kpi_id))
      );
    }

    // Lista de usuários da org pro picker de Responsáveis do plano de ação.
    // Carregada uma vez só (RLS de user_profiles já libera SELECT pra
    // qualquer membro da org, não só admin — 117_user_profiles_is_active.sql)
    // e cacheada em state.orgUsers pro resto da sessão do módulo.
    async function ensureOrgUsers() {
      if (state.orgUsers) return;
      try {
        state.orgUsers = await fetchRest(
          "user_profiles",
          `organization_id=eq.${state.organizationId}&is_active=eq.true&select=user_id,full_name,email&order=full_name.asc`
        );
      } catch (_) {
        state.orgUsers = []; // não trava o módulo — Responsáveis só fica sem opções
      }
    }

    function ownerNameById(userId) {
      const u = (state.orgUsers || []).find((x) => x.user_id === userId);
      return u ? (u.full_name || u.email || "Usuário") : null;
    }

    // Anexos de todas as ações + itens de análise + KPIs já carregados na
    // tela, numa tacada só por dono (3 requests no total, não 1 por
    // item/ação/kpi). kpi_id (2026-08-29) é o anexo de SUPORTE do
    // indicador — independente de mês/período, por isso usa a lista de
    // KPIs do a3Detail inteiro, não algo do mês corrente.
    async function loadAttachments() {
      const actionIds = (state.actions || []).map((a) => a.id);
      const itemIds = (state.periodAnalysis?.strategic_analysis_items || []).map((it) => it.id);
      const kpiIds = (state.a3Detail?.kpis || []).map((k) => k.id);
      const byAction = {};
      const byItem = {};
      const byKpi = {};
      if (actionIds.length) {
        const rows = await fetchRest(
          "strategic_attachments",
          `action_id=in.(${actionIds.join(",")})&select=*&order=created_at.asc`
        );
        (rows || []).forEach((r) => { (byAction[r.action_id] ||= []).push(r); });
      }
      if (itemIds.length) {
        const rows = await fetchRest(
          "strategic_attachments",
          `analysis_item_id=in.(${itemIds.join(",")})&select=*&order=created_at.asc`
        );
        (rows || []).forEach((r) => { (byItem[r.analysis_item_id] ||= []).push(r); });
      }
      if (kpiIds.length) {
        const rows = await fetchRest(
          "strategic_attachments",
          `kpi_id=in.(${kpiIds.join(",")})&select=*&order=created_at.asc`
        );
        (rows || []).forEach((r) => { (byKpi[r.kpi_id] ||= []).push(r); });
      }
      state.attachments = { action: byAction, analysis_item: byItem, kpi: byKpi };
    }

    // Leitura simples (SELECT direto, RLS já protege) — mesma decisão de
    // não criar RPC só pra listar. Embed do PostgREST traz os itens e os
    // KPIs vinculados de cada item numa chamada só.
    async function loadPeriodAnalysis(a3Id, year, month) {
      const rows = await fetchRest(
        "strategic_period_analyses",
        `a3_id=eq.${a3Id}&year=eq.${year}&month=eq.${month}&select=id,summary,strategic_analysis_items(id,item_type,description,impact_level,display_order,strategic_analysis_item_kpis(kpi_id))`
      );
      state.periodAnalysis = rows?.[0] || null;
    }

    // Reenvia a lista INTEIRA de itens (contrato de strategic_save_period_analysis
    // é "lista completa da tela" — item que não vier é removido). patch()
    // recebe a lista atual e devolve a lista já com a alteração aplicada.
    async function saveAnalysis(a3Id, summary, patch) {
      const currentItems = (state.periodAnalysis?.strategic_analysis_items || []).map((it) => ({
        id: it.id,
        item_type: it.item_type,
        description: it.description,
        impact_level: it.impact_level,
        display_order: it.display_order,
        kpi_ids: (it.strategic_analysis_item_kpis || []).map((l) => l.kpi_id)
      }));
      const items = patch(currentItems);
      const { year, month } = currentPeriod();
      await callSupabaseRpc("strategic_save_period_analysis", {
        p_a3_id: a3Id, p_year: year, p_month: month,
        p_summary: summary !== undefined ? summary : (state.periodAnalysis?.summary ?? null),
        p_items: items
      });
      await loadPeriodAnalysis(a3Id, year, month);
    }

    function friendlyError(err) {
      const msg = String(err?.message || err || "Erro desconhecido");
      try {
        const parsed = JSON.parse(msg);
        return parsed.message || parsed.error || msg;
      } catch (_) {
        return msg;
      }
    }

    // ---------------------------------------------------------------- render: shell
    function renderShell() {
      if (!root) return;
      ensureStyle();
      root.className = "sa3";

      // Achado do usuário (2026-08-29): clicar num A3 pela 1ª vez (ou
      // trocar de A3) mostrava "Área não encontrada" por um instante antes
      // de carregar — renderDetailScreen/renderEntryScreen rodavam com
      // state.a3Detail/monthlyEntry ainda nulo (ou da A3 anterior) enquanto
      // a RPC ainda estava em voo, porque esse guard só cobria a tela
      // "overview". Mensagem de erro falsa, sem erro nenhum de verdade
      // rolando — só a RPC não tinha voltado ainda. Corrigido cobrindo as
      // 3 telas; troca de período (mesma A3 já carregada) continua sem
      // flash, porque loadA3Detail/loadMonthlyEntry só zeram o dado quando
      // a A3 alvo é DIFERENTE da que já estava carregada.
      if (state.loading) {
        if (state.screen === "overview" && !state.overview) {
          root.innerHTML = `<div class="sa3-loading">Carregando…</div>`;
          return;
        }
        if (state.screen === "detail" && !state.a3Detail) {
          root.innerHTML = `<div class="sa3-loading">Carregando…</div>`;
          return;
        }
        if (state.screen === "entry" && !state.monthlyEntry) {
          root.innerHTML = `<div class="sa3-loading">Carregando…</div>`;
          return;
        }
        if (state.screen === "archived" && !state.archivedA3) {
          root.innerHTML = `<div class="sa3-loading">Carregando…</div>`;
          return;
        }
      }
      if (state.error) {
        root.innerHTML = `<div class="sa3-error">${escapeHtml(state.error)}</div><button class="sa3-btn" data-action="retry">Tentar de novo</button>`;
        bindGlobal();
        return;
      }

      if (state.screen === "overview") renderOverviewScreen();
      else if (state.screen === "detail") renderDetailScreen();
      else if (state.screen === "entry") renderEntryScreen();
      else if (state.screen === "archived") renderArchivedScreen();
    }

    function bindGlobal() {
      root.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
        state.error = "";
        if (state.screen === "overview") loadOverview();
        else if (state.screen === "detail") loadA3Detail(state.a3Id);
        else loadMonthlyEntry(state.a3Id);
      });
    }

    // ---------------------------------------------------------------- render: Tela 1
    function renderOverviewScreen() {
      const north = state.overview?.northGoals || [];
      const areas = state.overview?.areas || [];

      const northHtml = north.map((g) => `
        <div class="sa3-north-card">
          <div class="l">${escapeHtml(g.title)}</div>
          <div class="v">${escapeHtml(g.targetLabel || "—")}</div>
        </div>
      `).join("");

      const areaRows = areas.map((a) => {
        const total = a.totalKpis || 0;
        const onTarget = a.onTargetCount || 0;
        // "Sem dado" (not_available) não conta como fora da meta — sai do
        // denominador (melhoria #1 do review: painel misturava "off_target
        // de verdade" com "indicador sem realizado/meta lançados ainda").
        const withData = total - (a.notAvailableCount || 0);
        const ratio = withData ? onTarget / withData : null;
        const pillTone = ratio === null ? "muted" : ratio === 1 ? "pos" : "neg";
        return `
          <button class="sa3-area-row" style="--row-accent:${escapeHtml(a.color || "#4f7cff")}" data-action="open-detail" data-a3-id="${escapeHtml(a.id)}">
            <div class="sa3-area-icon" style="color:${escapeHtml(a.color || "#4f7cff")}">${escapeHtml((a.name || "?").slice(0, 1))}</div>
            <div>
              <div class="sa3-area-name">A3 ${escapeHtml(a.name)}</div>
              <div class="sa3-area-sub">${total} indicador${total === 1 ? "" : "es"}${a.childrenCount ? ` &middot; ${a.childrenCount} A3 filho${a.childrenCount === 1 ? "" : "s"}` : ""}</div>
            </div>
            <span class="sa3-pill ${pillTone}">${ratio === null ? "Sem dado" : `${onTarget}/${withData} dentro da meta`}</span>
            <svg class="sa3-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 6l6 6-6 6"/></svg>
          </button>
        `;
      }).join("");

      root.innerHTML = `
        <div class="sa3-card">
          <div class="sa3-head"><div><h2>Norte Verdadeiro</h2><p>Metas anuais do ciclo — o tracking mensal fica dentro de cada área.</p></div></div>
          <div class="sa3-north-grid">${northHtml || '<div class="sa3-empty">Nenhuma meta cadastrada.</div>'}</div>
        </div>
        <div class="sa3-card">
          <div class="sa3-head">
            <div><h3>Áreas</h3><p>Abrir uma área leva ao A3 digital dela: metas x realizado, acumulado e plano de&nbsp;ação.</p></div>
            ${isSuperAdminOrAdmin() ? `
              <div style="display:flex;gap:8px">
                <button type="button" class="sa3-btn" data-action="open-archived">Itens arquivados</button>
                <button type="button" class="sa3-btn" data-action="open-create-a3">+ Criar A3</button>
              </div>
            ` : ""}
          </div>
          <div class="sa3-area-list">${areaRows || '<div class="sa3-empty">Nenhuma área cadastrada pra este ciclo.</div>'}</div>
        </div>
      `;

      root.querySelectorAll('[data-action="open-detail"]').forEach((btn) => {
        btn.addEventListener("click", () => loadA3Detail(btn.dataset.a3Id));
      });
      root.querySelector('[data-action="open-create-a3"]')?.addEventListener("click", () => openCreateA3Modal());
      root.querySelector('[data-action="open-archived"]')?.addEventListener("click", () => loadArchived());
    }

    // -------------------------------------------------------- render: Itens arquivados
    // Melhoria #8 do review: só listar não bastava — sem esta tela, restaurar
    // um A3/KPI desativado exigia editar o banco na mão.
    function renderArchivedScreen() {
      const a3s = state.archivedA3 || [];
      const kpis = state.archivedKpis || [];

      const fmtDate = (d) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

      const a3Rows = a3s.length ? a3s.map((a) => `
        <div class="sa3-archived-row">
          <div>
            <div class="sa3-archived-name">${escapeHtml(a.name)}${a.parent_id ? ' <span class="sa3-archived-tag">A3-filha</span>' : ""}</div>
            <div class="sa3-archived-meta">${escapeHtml(a.management || "Sem gestão")} · desativada em ${fmtDate(a.updated_at)}</div>
          </div>
          <button type="button" class="sa3-btn primary" data-action="restore-a3" data-a3-id="${escapeHtml(a.id)}">Restaurar</button>
        </div>
      `).join("") : `<div class="sa3-empty">Nenhuma A3 arquivada.</div>`;

      const kpiRows = kpis.length ? kpis.map((k) => `
        <div class="sa3-archived-row">
          <div>
            <div class="sa3-archived-name">${escapeHtml(k.name)}</div>
            <div class="sa3-archived-meta">${escapeHtml(k.code)} · desativado em ${fmtDate(k.updated_at)}</div>
          </div>
          <button type="button" class="sa3-btn primary" data-action="restore-kpi" data-kpi-id="${escapeHtml(k.id)}">Restaurar</button>
        </div>
      `).join("") : `<div class="sa3-empty">Nenhum indicador arquivado.</div>`;

      root.innerHTML = `
        <button class="sa3-back" data-action="back-overview-archived"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 6l-6 6 6 6"/></svg>Voltar</button>
        <div class="sa3-card">
          <div class="sa3-head"><div><h2>A3 arquivadas</h2><p>Restaurar volta a A3 pra Tela 1. Se ela for filha, a A3-mãe precisa estar ativa antes.</p></div></div>
          <div class="sa3-archived-list">${a3Rows}</div>
        </div>
        <div class="sa3-card">
          <div class="sa3-head"><div><h2>Indicadores arquivados</h2><p>Restaurar volta o indicador pra A3 dona dele.</p></div></div>
          <div class="sa3-archived-list">${kpiRows}</div>
        </div>
      `;

      root.querySelector('[data-action="back-overview-archived"]')?.addEventListener("click", () => {
        state.screen = "overview"; renderShell();
      });
      root.querySelectorAll('[data-action="restore-a3"]').forEach((btn) => {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            await callSupabaseRpc("strategic_restore_a3", { p_a3_id: btn.dataset.a3Id });
            await loadArchived();
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
            btn.disabled = false;
          }
        });
      });
      root.querySelectorAll('[data-action="restore-kpi"]').forEach((btn) => {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            await callSupabaseRpc("strategic_restore_kpi", { p_kpi_id: btn.dataset.kpiId });
            await loadArchived();
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
            btn.disabled = false;
          }
        });
      });
    }

    // ---------------------------------------------------------------- render: Tela 2
    function renderDetailScreen() {
      const a3 = state.a3Detail?.a3;
      const kpis = state.a3Detail?.kpis || [];
      if (!a3) { root.innerHTML = `<div class="sa3-error">Área não encontrada.</div>`; return; }

      const kpiBlocks = kpis.map((k) => renderKpiBlock(k)).join("");

      const hasChildren = state.a3Children.length > 0;
      const tabsHtml = hasChildren ? `
        <div class="sa3-subtabs">
          <button class="sa3-subtab ${state.a3Id === state.a3RootId ? "active" : ""}" data-action="switch-tab" data-a3-id="${escapeHtml(state.a3RootId)}">Consolidado</button>
          ${state.a3Children.map((c) => `
            <button class="sa3-subtab ${state.a3Id === c.id ? "active" : ""}" data-action="switch-tab" data-a3-id="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>
          `).join("")}
        </div>
      ` : "";

      const hasObjective = !!(a3.objective && a3.objective.trim());

      root.innerHTML = `
        <button class="sa3-back" data-action="back-overview"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 6l-6 6 6 6"/></svg>Voltar</button>
        <div class="sa3-card">
          <div class="sa3-head">
            <div>
              <div style="display:flex;align-items:center;gap:6px">
                <h2 style="color:${escapeHtml(a3.color || "#4f7cff")}">${escapeHtml(a3.name)}</h2>
                ${isSuperAdminOrAdmin() ? `<button type="button" class="sa3-icon-btn" data-action="delete-a3" title="Excluir A3">${ICON_TRASH}</button>` : ""}
              </div>
              <p>${kpis.length} indicador${kpis.length === 1 ? "" : "es"}</p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${isSuperAdminOrAdmin() ? '<button type="button" class="sa3-btn" data-action="open-create-kpi">+ Criar indicador</button>' : ""}
              <button class="sa3-btn primary" data-action="open-entry">Preenchimento mensal</button>
            </div>
          </div>
          ${tabsHtml}
          <div style="margin-top:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <label style="font-size:.64rem;font-weight:700;text-transform:uppercase;color:var(--sa3-faint)">Objetivo estratégico</label>
              ${canManage() ? `<button type="button" class="sa3-icon-btn" data-action="toggle-objective-edit" title="Editar">${ICON_EDIT}</button>` : ""}
            </div>
            <p class="sa3-objective-text" data-objective-display>${hasObjective ? escapeHtml(a3.objective) : '<span style="color:var(--sa3-faint)">Objetivo estratégico ainda não cadastrado.</span>'}</p>
            <div class="sa3-objective-editor hidden" data-objective-form>
              <textarea class="sa3-objective-textarea" data-field="objective-text" placeholder="Objetivo estratégico deste A3...">${escapeHtml(a3.objective || "")}</textarea>
              <div class="sa3-form-foot">
                <button class="sa3-btn" data-action="cancel-objective-edit">Cancelar</button>
                <button class="sa3-btn primary" data-action="save-objective">Salvar objetivo</button>
              </div>
            </div>
          </div>
        </div>
        ${kpiBlocks}
      `;

      root.querySelector('[data-action="back-overview"]')?.addEventListener("click", () => {
        state.screen = "overview"; renderShell();
      });
      root.querySelector('[data-action="open-entry"]')?.addEventListener("click", () => loadMonthlyEntry(state.a3Id));
      root.querySelector('[data-action="open-create-kpi"]')?.addEventListener("click", () => openCreateKpiModal(state.a3Id));
      root.querySelector('[data-action="delete-a3"]')?.addEventListener("click", async (event) => {
        const btn = event.currentTarget;
        const isRootA3 = state.a3Id === state.a3RootId;
        const ok = await appConfirm?.(
          `Excluir a A3 "${a3.name}"? Ela deixa de aparecer em qualquer tela do módulo, mas o histórico já lançado é mantido no banco. Só é possível excluir se ela não tiver A3-filha nem indicador ativos — exclua-os antes, se houver.`,
          "danger"
        );
        if (!ok) return;
        btn.disabled = true;
        try {
          await callSupabaseRpc("strategic_deactivate_a3", { p_a3_id: state.a3Id });
          if (isRootA3) {
            state.screen = "overview"; state.a3Id = null; state.a3RootId = null; state.a3Detail = null;
            await loadOverview();
          } else {
            await loadA3Detail(state.a3RootId, true);
          }
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          btn.disabled = false;
        }
      });
      root.querySelectorAll('[data-action="switch-tab"]').forEach((btn) => {
        btn.addEventListener("click", () => loadA3Detail(btn.dataset.a3Id, false));
      });

      // Edição in-place: o texto SOME e vira o textarea no lugar dele (nunca
      // os dois juntos). Ícone de editar igual ao de causas/contramedidas e
      // plano de ação (padrão único no módulo); Cancelar/Salvar ficam no
      // rodapé do editor, mesmo formato das outras mini-formas do módulo.
      const objectiveDisplay = root.querySelector('[data-objective-display]');
      const objectiveForm = root.querySelector('[data-objective-form]');
      const objectiveTextarea = root.querySelector('[data-field="objective-text"]');

      const setObjectiveEditing = (editing) => {
        objectiveDisplay?.classList.toggle("hidden", editing);
        objectiveForm?.classList.toggle("hidden", !editing);
        if (editing) {
          objectiveTextarea.value = a3.objective || "";
          objectiveTextarea.focus();
          objectiveTextarea.setSelectionRange(objectiveTextarea.value.length, objectiveTextarea.value.length);
        }
      };
      root.querySelector('[data-action="toggle-objective-edit"]')?.addEventListener("click", () => setObjectiveEditing(true));
      root.querySelector('[data-action="cancel-objective-edit"]')?.addEventListener("click", () => setObjectiveEditing(false));
      root.querySelector('[data-action="save-objective"]')?.addEventListener("click", async (e) => {
        if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
        const btn = e.currentTarget;
        const value = objectiveTextarea.value.trim();
        btn.disabled = true;
        try {
          const response = await authenticatedFetch(`${supabaseApiUrl}/rest/v1/strategic_a3?id=eq.${state.a3Id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "Prefer": "return=minimal" },
            body: JSON.stringify({ objective: value || null })
          });
          if (!response.ok) throw new Error(await response.text());
          if (state.a3Detail?.a3) state.a3Detail.a3.objective = value || null;
          renderShell();
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          btn.disabled = false;
        }
      });

      kpis.forEach((k) => { bindActionForm(k.id); bindKpiAnalysisForm(k.id); bindKpiCatalogActions(k.id); bindKpiAttachmentsToggle(k.id); });
      bindKpiChartTooltips();
      bindAnalysisRemoveButtons();
      bindActionItemButtons();
      bindAttachmentWidgets();
    }

    // -------------------------------------------------------- Causas/contramedidas por KPI
    // Fica logo abaixo do gráfico de CADA indicador (não num card único no
    // topo da página) — usuário pediu explicitamente pra ficar junto do
    // gráfico a que se refere. O dado continua no mesmo lugar do banco
    // (strategic_analysis_items ligado ao A3+mês via strategic_period_
    // analyses), só a exibição é agrupada por KPI usando o vínculo N:N
    // (strategic_analysis_item_kpis) — um item pode em tese aparecer sob
    // mais de 1 KPI se for linkado a vários, mas o formulário daqui só
    // cria vínculo com o KPI de onde foi aberto.
    // Ícones compactos reaproveitados em causas/contramedidas e plano de ação.
    const ICON_EDIT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
    const ICON_TRASH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>`;
    // Pedido do usuário (2026-08-29): "clipe" pra anexos de suporte do
    // indicador (chamou de "eclipse" na hora, mas o pedido — anexar
    // documentos, abrir carrossel — é claramente o ícone de clipe padrão).
    const ICON_CLIP = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`;

    // Cada item tem sua própria mini-forma de edição escondida (não reaproveita
    // a forma de "novo item" — evita ter que rastrear "criando vs editando"
    // no mesmo form compartilhado por todos os itens do KPI).
    function renderAnalysisItem(it) {
      return `
        <div class="sa3-analysis-item" data-analysis-item-id="${escapeHtml(it.id)}">
          <div class="sa3-analysis-item-row" data-item-view>
            <span class="sa3-analysis-tag ${it.item_type}">${it.item_type === "cause" ? "Causa" : "Contramedida"}</span>
            <div>${escapeHtml(it.description)}</div>
            <div class="sa3-item-actions">
              ${canManage() ? `
                <button type="button" class="sa3-icon-btn" data-action="edit-analysis-item" data-item-id="${escapeHtml(it.id)}" title="Editar">${ICON_EDIT}</button>
                <button type="button" class="sa3-icon-btn" data-action="remove-analysis-item" data-item-id="${escapeHtml(it.id)}" title="Excluir">${ICON_TRASH}</button>
              ` : ""}
            </div>
            <div style="grid-column:1/-1">${renderAttachmentsStrip("analysis_item", it.id, it.description, { canAdd: canManage(), canRemove: canManage() })}</div>
          </div>
          <div class="sa3-form hidden" data-item-edit-form="${escapeHtml(it.id)}">
            <div class="sa3-form-grid" style="grid-template-columns:150px 1fr">
              <div><label>Tipo</label><select data-field="item_type">
                <option value="cause" ${it.item_type === "cause" ? "selected" : ""}>Causa</option>
                <option value="countermeasure" ${it.item_type === "countermeasure" ? "selected" : ""}>Contramedida</option>
              </select></div>
              <div><label>Descrição</label><input type="text" data-field="description" value="${escapeHtml(it.description)}"></div>
            </div>
            <div class="sa3-form-foot">
              <button class="sa3-btn" data-action="cancel-item-edit" data-item-id="${escapeHtml(it.id)}">Cancelar</button>
              <button class="sa3-btn primary" data-action="save-item-edit" data-item-id="${escapeHtml(it.id)}">Salvar</button>
            </div>
          </div>
        </div>
      `;
    }

    function renderKpiAnalysisSection(k) {
      const items = (state.periodAnalysis?.strategic_analysis_items || [])
        .filter((it) => (it.strategic_analysis_item_kpis || []).some((l) => l.kpi_id === k.id))
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

      const itemsHtml = items.length ? items.map((it) => renderAnalysisItem(it)).join("") : `<div class="sa3-empty">Nenhuma causa ou contramedida registrada.</div>`;

      return `
        <div class="sa3-action-plan">
          <div class="sa3-head" style="margin-bottom:8px">
            <h3 style="font-size:.76rem;text-transform:uppercase;color:var(--sa3-soft)">Causas e contramedidas</h3>
            ${canManage() ? `<button class="sa3-btn" data-action="toggle-analysis-form" data-kpi-id="${escapeHtml(k.id)}">+ Novo item</button>` : ""}
          </div>
          ${itemsHtml}
          <div class="sa3-form hidden" data-analysis-form="${escapeHtml(k.id)}">
            <div class="sa3-form-grid" style="grid-template-columns:150px 1fr">
              <div><label>Tipo</label><select data-field="item_type"><option value="cause">Causa</option><option value="countermeasure">Contramedida</option></select></div>
              <div><label>Descrição</label><input type="text" data-field="description" placeholder="O que aconteceu / o que fazer?"></div>
            </div>
            <div>
              <label>Anexo (opcional)</label>
              <div class="vecton-file-field">
                <span class="vecton-file-trigger">
                  <span class="vecton-file-btn">Selecionar arquivo</span>
                  <span class="vecton-file-name" data-file-name>Nenhum arquivo selecionado</span>
                </span>
                <input type="file" data-field="attachment" class="vecton-file-native">
              </div>
            </div>
            <div class="sa3-form-foot">
              <button class="sa3-btn" data-action="cancel-analysis-form" data-kpi-id="${escapeHtml(k.id)}">Cancelar</button>
              <button class="sa3-btn primary" data-action="add-analysis-item" data-kpi-id="${escapeHtml(k.id)}">Adicionar</button>
            </div>
          </div>
        </div>
      `;
    }

    function bindKpiAnalysisForm(kpiId) {
      const toggleBtn = root.querySelector(`[data-action="toggle-analysis-form"][data-kpi-id="${cssEscape(kpiId)}"]`);
      const form = root.querySelector(`[data-analysis-form="${cssEscape(kpiId)}"]`);
      const cancelBtn = root.querySelector(`[data-action="cancel-analysis-form"][data-kpi-id="${cssEscape(kpiId)}"]`);
      const addBtn = root.querySelector(`[data-action="add-analysis-item"][data-kpi-id="${cssEscape(kpiId)}"]`);

      toggleBtn?.addEventListener("click", () => form?.classList.toggle("hidden"));
      cancelBtn?.addEventListener("click", () => form?.classList.add("hidden"));
      bindFileNameDisplay(form);
      addBtn?.addEventListener("click", async () => {
        if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
        const itemType = form.querySelector('[data-field="item_type"]').value;
        const description = form.querySelector('[data-field="description"]').value.trim();
        if (!description) { appAlert?.("Descreva a causa ou contramedida antes de salvar.", "warn"); return; }
        const file = form.querySelector('[data-field="attachment"]')?.files?.[0] || null;
        if (file && file.size > MAX_ATTACHMENT_BYTES) { appAlert?.(`O arquivo "${file.name}" ultrapassa o limite de 20 MB.`, "warn"); return; }
        addBtn.disabled = true;
        try {
          await saveAnalysis(state.a3Id, undefined, (items) => [
            ...items,
            { item_type: itemType, description, display_order: items.length, kpi_ids: [kpiId] }
          ]);
          if (file) {
            // Novo item é sempre o de maior display_order (acabou de ser
            // anexado no fim da lista) — não tem outro jeito de saber o id
            // dele, a RPC de análise devolve só a linha-pai (período).
            const newItem = (state.periodAnalysis?.strategic_analysis_items || [])
              .slice()
              .sort((a, b) => (b.display_order || 0) - (a.display_order || 0))[0];
            if (newItem?.id) {
              await uploadAttachment("analysis_item", newItem.id, file);
              await loadAttachments();
            }
          }
          renderShell();
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          addBtn.disabled = false;
        }
      });
    }

    function bindAnalysisRemoveButtons() {
      root.querySelectorAll('[data-action="remove-analysis-item"]').forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
          const ok = await appConfirm?.("Remover este item da análise? Os anexos dele também são removidos.", "warn");
          if (!ok) return;
          const itemId = btn.dataset.itemId;
          // Guarda a lista ANTES de mandar a RPC — depois do save, o item já
          // some de state.periodAnalysis e o anexo dele fica inalcançável
          // (achado #6 do review: exclusão em cascata apagava só o metadado
          // no banco, o arquivo físico ficava órfão no bucket pra sempre).
          const orphanedAttachments = state.attachments?.analysis_item?.[itemId] || [];
          try {
            await saveAnalysis(state.a3Id, undefined, (items) => items.filter((it) => it.id !== itemId));
            await Promise.all(orphanedAttachments.map((att) =>
              deleteFromStorage(ATTACHMENT_BUCKET, att.storage_path).catch(() => {})
            ));
            renderShell();
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
          }
        });
      });

      root.querySelectorAll('[data-action="edit-analysis-item"]').forEach((btn) => {
        btn.addEventListener("click", () => {
          const wrap = root.querySelector(`[data-analysis-item-id="${cssEscape(btn.dataset.itemId)}"]`);
          wrap?.querySelector("[data-item-view]")?.classList.add("hidden");
          wrap?.querySelector(`[data-item-edit-form="${cssEscape(btn.dataset.itemId)}"]`)?.classList.remove("hidden");
        });
      });

      root.querySelectorAll('[data-action="cancel-item-edit"]').forEach((btn) => {
        btn.addEventListener("click", () => {
          const wrap = root.querySelector(`[data-analysis-item-id="${cssEscape(btn.dataset.itemId)}"]`);
          wrap?.querySelector(`[data-item-edit-form="${cssEscape(btn.dataset.itemId)}"]`)?.classList.add("hidden");
          wrap?.querySelector("[data-item-view]")?.classList.remove("hidden");
        });
      });

      root.querySelectorAll('[data-action="save-item-edit"]').forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
          const itemId = btn.dataset.itemId;
          const form = root.querySelector(`[data-item-edit-form="${cssEscape(itemId)}"]`);
          const itemType = form.querySelector('[data-field="item_type"]').value;
          const description = form.querySelector('[data-field="description"]').value.trim();
          if (!description) { appAlert?.("Descreva a causa ou contramedida antes de salvar.", "warn"); return; }
          btn.disabled = true;
          try {
            await saveAnalysis(state.a3Id, undefined, (items) => items.map((it) =>
              it.id === itemId ? { ...it, item_type: itemType, description } : it
            ));
            renderShell();
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
            btn.disabled = false;
          }
        });
      });
    }

    function renderKpiBlock(k) {
      const monthly = k.monthlyValues || [];
      const targets = k.monthlyTargets || [];
      const isRange = k.comparisonMode === "range";
      // status já vem calculado do banco (strategic_kpi_status, snapshot-aware
      // pra período fechado) — o frontend só mapeia pra cor, nunca reimplementa
      // a regra (achado do usuário, 2026-08-29: 'range'/'exact'/
      // 'exact_with_tolerance' ficavam com cor errada porque o JS só sabia
      // tratar 'higher'/'lower').
      const STATUS_TONE = { on_target: "pos", attention: "warn", off_target: "neg" };
      const values = [
        ...monthly.map((m) => m?.value),
        ...targets.flatMap((t) => [t?.value, t?.min, t?.max])
      ].filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number);
      const rawMin = Math.min(0, ...values);
      const rawMax = Math.max(0, ...values);
      const rawSpan = rawMax - rawMin || Math.max(Math.abs(rawMax), Math.abs(rawMin), 1);
      const chartMin = rawMin < 0 ? rawMin - rawSpan * 0.08 : 0;
      const chartMax = rawMax > 0 ? rawMax + rawSpan * 0.08 : rawSpan;
      const chartSpan = chartMax - chartMin || 1;
      const yPct = (value) => ((chartMax - Number(value)) / chartSpan) * 100;
      const zeroY = yPct(0);

      const metaLabel = (t) => isRange
        ? `${formatByUnit(t?.min, k.unit, k.decimalPlaces)}–${formatByUnit(t?.max, k.unit, k.decimalPlaces)}`
        : formatByUnit(t?.value, k.unit, k.decimalPlaces);

      const bars = Array.from({ length: 12 }, (_, i) => {
        const m = monthly[i] || {};
        const t = targets[i] || {};
        const hasReal = m.value !== null && m.value !== undefined && Number.isFinite(Number(m.value));
        const realY = hasReal ? yPct(m.value) : zeroY;
        let realTop = Math.min(realY, zeroY);
        let realH = Math.abs(realY - zeroY);
        if (hasReal && realH < 1.7) {
          realH = 1.7;
          realTop = Number(m.value) < 0 ? Math.min(98.3, zeroY) : Math.max(0, zeroY - realH);
        }
        const tone = STATUS_TONE[m.status] || "";
        const variation = isRange ? "—" : formatTargetVariation(m.value, t.value, { unit: k.unit, comparisonMode: k.comparisonMode });
        const tooltip = `${MONTH_LABELS_SHORT[i]} — Realizado: ${formatByUnit(m.value, k.unit, k.decimalPlaces)} · Meta: ${metaLabel(t)} · Var: ${variation}`;
        return `
          <div class="sa3-bar-col" data-chart-has-real="${hasReal}" data-chart-month="${MONTH_LABELS_SHORT[i].toLowerCase()}" data-chart-real="${escapeHtml(formatByUnit(m.value, k.unit, k.decimalPlaces))}" data-chart-meta="${escapeHtml(metaLabel(t))}" data-chart-variation="${escapeHtml(variation)}">
            ${hasReal ? `<div class="sa3-bar-real ${tone}" style="top:${realTop}%;height:${realH}%" aria-label="${escapeHtml(tooltip)}"></div>` : ""}
          </div>
        `;
      }).join("");

      const smoothPath = (points) => {
        if (points.length < 2) return "";
        let path = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i += 1) {
          const previous = points[i - 1];
          const current = points[i];
          const controlX = (previous.x + current.x) / 2;
          path += ` C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
        }
        return path;
      };
      // getValue(i) devolve o valor da meta no mês i (target_value, ou
      // target_min/target_max quando comparisonMode='range' — sem essa
      // separação, 'range' nunca desenhava linha nenhuma, sempre null).
      // extraClass diferencia visualmente a banda (2 linhas pontilhadas) do
      // caso normal (1 linha cheia).
      const buildTargetLine = (getValue, extraClass = "") => {
        const lineSegments = [];
        let currentSegment = [];
        const dots = [];
        for (let i = 0; i < 12; i += 1) {
          const targetValue = getValue(i);
          const actualValue = monthly[i]?.value;
          const hasActual = actualValue !== null && actualValue !== undefined && Number.isFinite(Number(actualValue));
          if (!hasActual || targetValue === null || targetValue === undefined || !Number.isFinite(Number(targetValue))) {
            if (currentSegment.length) lineSegments.push(currentSegment);
            currentSegment = [];
            continue;
          }
          const point = { x: ((i + 0.5) / 12) * 1200, y: yPct(targetValue) };
          currentSegment.push(point);
          dots.push(`<circle class="sa3-target-point ${extraClass}" cx="${point.x}" cy="${point.y}" r="3"></circle>`);
        }
        if (currentSegment.length) lineSegments.push(currentSegment);
        const path = lineSegments.map((points) => {
          const d = smoothPath(points);
          return d ? `<path class="sa3-target-line ${extraClass}" d="${d}"></path>` : "";
        }).join("");
        return path + dots.join("");
      };
      // buildTargetLine já devolve linha+pontos concatenados — nada mais pra
      // juntar depois (diferente da versão antiga, que tinha targetLine e
      // targetDots separados).
      const targetLine = isRange
        ? buildTargetLine((i) => targets[i]?.min, "band") + buildTargetLine((i) => targets[i]?.max, "band")
        : buildTargetLine((i) => targets[i]?.value);
      const months = MONTH_LABELS_SHORT.map((label) => `<span class="sa3-bar-month">${label}</span>`).join("");

      const kpiActions = state.actions.filter((a) => (a.strategic_action_kpis || []).some((l) => l.kpi_id === k.id));
      const actionsHtml = kpiActions.length
        ? kpiActions.map((a) => renderActionItem(a)).join("")
        : `<div class="sa3-empty">Nenhuma ação registrada.</div>`;

      const isAuto = k.entryMode === "computed";

      const canEditCatalog = isSuperAdminOrAdmin();
      // Anexos de SUPORTE do indicador (pedido do usuário, 2026-08-29) —
      // independente de mês/meta batida/plano de ação, ficam no cabeçalho
      // do card, atrás de um ícone de clipe (não uma seção sempre aberta
      // feita nem Causas/Plano de Ação). O ícone só aparece pra quem pode
      // adicionar (canManage) OU quando já existe algo pra ver (viewer
      // sem permissão de edição ainda consegue abrir o carrossel).
      const kpiAttachments = state.attachments?.kpi?.[k.id] || [];
      const showAttachmentIcon = canManage() || kpiAttachments.length > 0;
      return `
        <div class="sa3-card">
          <div class="sa3-kpi-block-head">
            <div style="flex:1 1 auto; min-width:0;">
              <div data-kpi-title-display="${escapeHtml(k.id)}">
                <div class="sa3-kpi-title">${escapeHtml(k.name)}${isAuto ? '<span class="sa3-badge-auto">Auto</span>' : ""}</div>
                <div class="sa3-kpi-sub">${escapeHtml(k.description || "Realizado vs. meta mensal")}</div>
              </div>
              ${canEditCatalog ? `
                <div class="sa3-kpi-title-edit hidden" data-kpi-title-edit="${escapeHtml(k.id)}">
                  <input type="text" data-field="kpi-name" value="${escapeHtml(k.name)}" placeholder="Nome do indicador">
                  <input type="text" data-field="kpi-description" value="${escapeHtml(k.description || "")}" placeholder="Subtítulo (opcional)">
                  <div class="sa3-form-foot">
                    <button class="sa3-btn" data-action="cancel-kpi-edit" data-kpi-id="${escapeHtml(k.id)}">Cancelar</button>
                    <button class="sa3-btn primary" data-action="save-kpi-edit" data-kpi-id="${escapeHtml(k.id)}">Salvar</button>
                  </div>
                </div>
              ` : ""}
            </div>
            ${(canEditCatalog || showAttachmentIcon) ? `
              <div class="sa3-kpi-head-actions">
                ${showAttachmentIcon ? `
                  <button type="button" class="sa3-icon-btn" data-action="toggle-kpi-attachments" data-kpi-id="${escapeHtml(k.id)}" title="Anexos do indicador">
                    ${ICON_CLIP}${kpiAttachments.length ? `<span class="sa3-attachment-count">${kpiAttachments.length}</span>` : ""}
                  </button>
                ` : ""}
                ${canEditCatalog ? `
                  <button type="button" class="sa3-icon-btn" data-action="toggle-kpi-edit" data-kpi-id="${escapeHtml(k.id)}" title="Editar indicador">${ICON_EDIT}</button>
                  <button type="button" class="sa3-icon-btn" data-action="delete-kpi" data-kpi-id="${escapeHtml(k.id)}" data-kpi-name="${escapeHtml(k.name)}" title="Excluir indicador">${ICON_TRASH}</button>
                ` : ""}
              </div>
            ` : ""}
          </div>
          ${showAttachmentIcon ? `
            <div class="sa3-kpi-attachments hidden" data-kpi-attachments="${escapeHtml(k.id)}">
              ${renderAttachmentsStrip("kpi", k.id, k.name, { canAdd: canManage(), canRemove: canManage() })}
            </div>
          ` : ""}
          <div class="sa3-combo-chart" role="img" aria-label="Gráfico combinado de realizado mensal em colunas e meta mensal em linha">
            <div class="sa3-chart-plot">
              <div class="sa3-chart-zero" style="top:${zeroY}%"></div>
              <div class="sa3-bars">${bars}</div>
              <svg class="sa3-target-svg" viewBox="0 0 1200 100" preserveAspectRatio="none" aria-hidden="true">
                ${targetLine}
              </svg>
            </div>
            <div class="sa3-chart-months">${months}</div>
            <div class="sa3-chart-legend" aria-hidden="true">
              <span><i class="sa3-legend-bar"></i>Realizado</span>
              <span><i class="sa3-legend-line"></i>Meta mensal</span>
            </div>
          </div>
          ${renderKpiAnalysisSection(k)}
          <div class="sa3-action-plan">
            <div class="sa3-head" style="margin-bottom:8px">
              <h3 style="font-size:.76rem;text-transform:uppercase;color:var(--sa3-soft)">Plano de ação</h3>
              ${canManage() ? `<button class="sa3-btn" data-action="toggle-action-form" data-kpi-id="${escapeHtml(k.id)}">+ Nova ação</button>` : ""}
            </div>
            ${actionsHtml}
            ${renderActionForm(k.id)}
          </div>
        </div>
      `;
    }

    // Editar nome/subtítulo (achado #catálogo, 2026-08-29) e excluir
    // (soft-delete, is_active=false) — só renderizado quando
    // isSuperAdminOrAdmin(), mas o próprio backend (strategic_rename_kpi/
    // strategic_deactivate_kpi) já rejeita qualquer outro papel de
    // qualquer forma, então esse early-return aqui é só pra não ligar
    // listener em botão que nem existe no DOM.
    function bindKpiCatalogActions(kpiId) {
      if (!isSuperAdminOrAdmin()) return;
      const displayEl = root.querySelector(`[data-kpi-title-display="${cssEscape(kpiId)}"]`);
      const editEl = root.querySelector(`[data-kpi-title-edit="${cssEscape(kpiId)}"]`);
      const toggleBtn = root.querySelector(`[data-action="toggle-kpi-edit"][data-kpi-id="${cssEscape(kpiId)}"]`);
      const cancelBtn = root.querySelector(`[data-action="cancel-kpi-edit"][data-kpi-id="${cssEscape(kpiId)}"]`);
      const saveBtn = root.querySelector(`[data-action="save-kpi-edit"][data-kpi-id="${cssEscape(kpiId)}"]`);
      const deleteBtn = root.querySelector(`[data-action="delete-kpi"][data-kpi-id="${cssEscape(kpiId)}"]`);
      if (!displayEl || !editEl) return;

      const setEditing = (editing) => {
        displayEl.classList.toggle("hidden", editing);
        editEl.classList.toggle("hidden", !editing);
      };
      toggleBtn?.addEventListener("click", () => setEditing(true));
      cancelBtn?.addEventListener("click", () => setEditing(false));
      saveBtn?.addEventListener("click", async () => {
        const name = editEl.querySelector('[data-field="kpi-name"]').value.trim();
        if (!name) { appAlert?.("Nome do indicador é obrigatório.", "warn"); return; }
        const description = editEl.querySelector('[data-field="kpi-description"]').value.trim();
        saveBtn.disabled = true;
        try {
          await callSupabaseRpc("strategic_rename_kpi", {
            p_kpi_id: kpiId, p_name: name, p_description: description || null
          });
          await loadA3Detail(state.a3Id, state.a3Id === state.a3RootId);
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          saveBtn.disabled = false;
        }
      });
      deleteBtn?.addEventListener("click", async () => {
        const name = deleteBtn.dataset.kpiName || "este indicador";
        const ok = await appConfirm?.(
          `Excluir "${name}"? Ele deixa de aparecer em qualquer tela do módulo, mas o histórico já lançado (metas e realizados) é mantido no banco.`,
          "danger"
        );
        if (!ok) return;
        deleteBtn.disabled = true;
        try {
          await callSupabaseRpc("strategic_deactivate_kpi", { p_kpi_id: kpiId });
          await loadA3Detail(state.a3Id, state.a3Id === state.a3RootId);
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          deleteBtn.disabled = false;
        }
      });
    }

    // Toggle do painel de anexos do indicador (pedido do usuário,
    // 2026-08-29) — só mostra/esconde (a lista em si já veio renderizada
    // por renderAttachmentsStrip; upload/remoção/carrossel são
    // bindAttachmentWidgets(), genérico, chamado 1x pra tela toda). Sem
    // gate de canEditCatalog: qualquer um que enxergue o ícone (canManage
    // OU já tem anexo pra ver) consegue abrir/fechar.
    function bindKpiAttachmentsToggle(kpiId) {
      const btn = root.querySelector(`[data-action="toggle-kpi-attachments"][data-kpi-id="${cssEscape(kpiId)}"]`);
      const panel = root.querySelector(`[data-kpi-attachments="${cssEscape(kpiId)}"]`);
      btn?.addEventListener("click", () => panel?.classList.toggle("hidden"));
    }

    // -------------------------------------------------------- Criar A3 / criar indicador
    // Fluxo pedido pelo usuário (2026-08-29): botão "+ Criar A3" na Tela 1
    // e "+ Criar indicador" na Tela 2, só super_admin/admin (mesma checagem
    // de bindKpiCatalogActions — edição de CATÁLOGO, não do A3 em si).
    // Modal solto, anexado direto em document.body (mesmo padrão de
    // openAttachmentCarousel) — sobrevive a qualquer renderShell() disparado
    // enquanto está aberto.
    function closeSa3Modal() {
      document.querySelector(".sa3-modal-overlay")?.remove();
    }

    function openSa3Modal(innerHtml) {
      closeSa3Modal();
      const overlay = document.createElement("div");
      overlay.className = "sa3-modal-overlay";
      overlay.innerHTML = `<div class="sa3-modal-card" role="dialog" aria-modal="true">${innerHtml}</div>`;
      overlay.addEventListener("click", (event) => { if (event.target === overlay) closeSa3Modal(); });
      overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSa3Modal(); });
      document.body.appendChild(overlay);
      overlay.tabIndex = -1;
      overlay.focus();
      return overlay;
    }

    // Tipo Pai/Filha (pedido do usuário: "na parte 1, tem que perguntar se
    // ele é Pai (novo) ou filho, se filho, de qual A3 Pai"). Filha herda
    // Gestão e cor do pai automaticamente (resolvido no banco, strategic_
    // create_a3) — por isso não pergunta Gestão nem cor quando é filha.
    function openCreateA3Modal() {
      const areas = state.overview?.areas || [];
      const managementOptions = MANAGEMENT_OPTIONS.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
      const parentOptions = areas.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join("");

      const overlay = openSa3Modal(`
        <h3 class="sa3-modal-title">Criar A3</h3>
        <p class="sa3-modal-subtitle">Cria uma nova área estratégica no catálogo. Indicadores são adicionados depois, de dentro da área.</p>
        <div class="sa3-modal-field">
          <label>Tipo</label>
          <div class="sa3-modal-radio-group">
            <button type="button" class="sa3-modal-radio active" data-a3-type="parent">A3-mãe<br>(nova área)</button>
            <button type="button" class="sa3-modal-radio" data-a3-type="child">A3-filha<br>(dentro de uma área)</button>
          </div>
        </div>
        <div class="sa3-modal-field" data-field-group="parent-management">
          <label>Gestão responsável</label>
          <select data-field="a3-management">
            <option value="">— nenhuma —</option>
            ${managementOptions}
          </select>
          <div class="sa3-modal-hint">Define quem (Gestor) edita esta A3. Deixe em branco pra métrica consolidada sem Gestor único (ex.: EBITDA).</div>
        </div>
        <div class="sa3-modal-field sa3-modal-hidden" data-field-group="child-parent">
          <label>A3-mãe</label>
          <select data-field="a3-parent-id">
            ${areas.length ? parentOptions : '<option value="">Nenhuma A3-mãe cadastrada</option>'}
          </select>
          <div class="sa3-modal-hint">A A3-filha herda automaticamente a Gestão e a cor da A3-mãe.</div>
        </div>
        <div class="sa3-modal-field">
          <label>Nome</label>
          <input type="text" data-field="a3-name" placeholder="Ex.: Logística" maxlength="120">
        </div>
        <div class="sa3-modal-foot">
          <button type="button" class="sa3-btn" data-action="close-modal">Cancelar</button>
          <button type="button" class="sa3-btn primary" data-action="save-create-a3">Criar A3</button>
        </div>
      `);

      let a3Type = "parent";
      const typeButtons = overlay.querySelectorAll("[data-a3-type]");
      const parentGroup = overlay.querySelector('[data-field-group="parent-management"]');
      const childGroup = overlay.querySelector('[data-field-group="child-parent"]');
      typeButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          a3Type = btn.dataset.a3Type;
          typeButtons.forEach((b) => b.classList.toggle("active", b === btn));
          parentGroup.classList.toggle("sa3-modal-hidden", a3Type !== "parent");
          childGroup.classList.toggle("sa3-modal-hidden", a3Type !== "child");
        });
      });

      overlay.querySelector('[data-action="close-modal"]').addEventListener("click", closeSa3Modal);
      const saveBtn = overlay.querySelector('[data-action="save-create-a3"]');
      saveBtn.addEventListener("click", async () => {
        const name = overlay.querySelector('[data-field="a3-name"]').value.trim();
        if (!name) { appAlert?.("Nome da A3 é obrigatório.", "warn"); return; }
        if (a3Type === "child" && !areas.length) { appAlert?.("Crie uma A3-mãe antes de criar uma A3-filha.", "warn"); return; }
        const parentId = a3Type === "child" ? (overlay.querySelector('[data-field="a3-parent-id"]').value || null) : null;
        const management = a3Type === "parent" ? (overlay.querySelector('[data-field="a3-management"]').value || null) : null;
        saveBtn.disabled = true;
        try {
          await callSupabaseRpc("strategic_create_a3", {
            p_organization_id: state.organizationId,
            p_year: currentPeriod().year,
            p_name: name,
            p_parent_id: parentId,
            p_management: management
          });
          closeSa3Modal();
          await loadOverview();
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          saveBtn.disabled = false;
        }
      });
    }

    // Indicador criado por aqui é sempre entry_mode='direct' — meta e
    // realizado sempre digitados manualmente, sem exceção (pedido explícito
    // do usuário) — só pergunta unidade/casas decimais/direção da
    // meta/acumulado, o resto (formula_config etc.) fica com o default da
    // RPC strategic_create_kpi.
    function openCreateKpiModal(a3Id) {
      const unitOptions = UNIT_OPTIONS.map((u) => `<option value="${escapeHtml(u.value)}">${escapeHtml(u.label)}</option>`).join("");
      const comparisonOptions = COMPARISON_MODE_OPTIONS.map((c) => `<option value="${escapeHtml(c.value)}" ${c.value === "higher" ? "selected" : ""}>${escapeHtml(c.label)}</option>`).join("");
      const accumulationOptions = ACCUMULATION_METHOD_OPTIONS.map((c) => `<option value="${escapeHtml(c.value)}" ${c.value === "sum" ? "selected" : ""}>${escapeHtml(c.label)}</option>`).join("");

      const overlay = openSa3Modal(`
        <h3 class="sa3-modal-title">Criar indicador</h3>
        <p class="sa3-modal-subtitle">Meta e realizado deste indicador são sempre digitados manualmente, mês a mês.</p>
        <div class="sa3-modal-field">
          <label>Nome</label>
          <input type="text" data-field="kpi-name" placeholder="Ex.: Custo por tonelada" maxlength="160">
        </div>
        <div class="sa3-modal-field">
          <label>Subtítulo (opcional)</label>
          <input type="text" data-field="kpi-description" placeholder="Ex.: Realizado vs. meta mensal" maxlength="200">
        </div>
        <div class="sa3-modal-field">
          <label>Unidade de medida</label>
          <select data-field="kpi-unit">${unitOptions}<option value="__other__">Outra…</option></select>
        </div>
        <div class="sa3-modal-field sa3-modal-hidden" data-field-group="unit-other">
          <label>Qual?</label>
          <input type="text" data-field="kpi-unit-other" placeholder="Ex.: kg" maxlength="20">
        </div>
        <div class="sa3-modal-field">
          <label>Casas decimais</label>
          <input type="number" data-field="kpi-decimal-places" value="0" min="0" max="4" step="1">
        </div>
        <div class="sa3-modal-field">
          <label>Direção da meta</label>
          <select data-field="kpi-comparison-mode">${comparisonOptions}</select>
        </div>
        <div class="sa3-modal-field">
          <label>Acumulado no ano</label>
          <select data-field="kpi-accumulation-method">${accumulationOptions}</select>
        </div>
        <div class="sa3-modal-foot">
          <button type="button" class="sa3-btn" data-action="close-modal">Cancelar</button>
          <button type="button" class="sa3-btn primary" data-action="save-create-kpi">Criar indicador</button>
        </div>
      `);

      const unitSelect = overlay.querySelector('[data-field="kpi-unit"]');
      const unitOtherGroup = overlay.querySelector('[data-field-group="unit-other"]');
      unitSelect.addEventListener("change", () => {
        unitOtherGroup.classList.toggle("sa3-modal-hidden", unitSelect.value !== "__other__");
      });

      overlay.querySelector('[data-action="close-modal"]').addEventListener("click", closeSa3Modal);
      const saveBtn = overlay.querySelector('[data-action="save-create-kpi"]');
      saveBtn.addEventListener("click", async () => {
        const name = overlay.querySelector('[data-field="kpi-name"]').value.trim();
        if (!name) { appAlert?.("Nome do indicador é obrigatório.", "warn"); return; }
        const description = overlay.querySelector('[data-field="kpi-description"]').value.trim();
        const unitRaw = unitSelect.value;
        const unit = unitRaw === "__other__" ? overlay.querySelector('[data-field="kpi-unit-other"]').value.trim() : unitRaw;
        const decimalPlaces = Number(overlay.querySelector('[data-field="kpi-decimal-places"]').value) || 0;
        const comparisonMode = overlay.querySelector('[data-field="kpi-comparison-mode"]').value;
        const accumulationMethod = overlay.querySelector('[data-field="kpi-accumulation-method"]').value;
        saveBtn.disabled = true;
        try {
          await callSupabaseRpc("strategic_create_kpi", {
            p_organization_id: state.organizationId,
            p_a3_id: a3Id,
            p_name: name,
            p_description: description || null,
            p_unit: unit || null,
            p_decimal_places: decimalPlaces,
            p_comparison_mode: comparisonMode,
            p_accumulation_method: accumulationMethod
          });
          closeSa3Modal();
          await loadA3Detail(state.a3Id, state.a3Id === state.a3RootId);
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          saveBtn.disabled = false;
        }
      });
    }

    function bindKpiChartTooltips() {
      const columns = root.querySelectorAll('.sa3-bar-col[data-chart-has-real="true"]');
      if (!columns.length) return;

      const tooltip = document.createElement("div");
      tooltip.className = "sa3-chart-tooltip";
      root.appendChild(tooltip);

      const positionTooltip = (event) => {
        const gap = 12;
        let left = event.clientX + gap;
        let top = event.clientY - tooltip.offsetHeight - gap;
        if (left + tooltip.offsetWidth > window.innerWidth - 8) left = event.clientX - tooltip.offsetWidth - gap;
        if (top < 8) top = event.clientY + gap;
        tooltip.style.left = `${Math.max(8, left)}px`;
        tooltip.style.top = `${Math.max(8, top)}px`;
      };

      columns.forEach((column) => {
        column.addEventListener("mouseenter", (event) => {
          tooltip.innerHTML = `
            <div class="sa3-chart-tooltip-month">${escapeHtml(column.dataset.chartMonth)}</div>
            <div class="sa3-chart-tooltip-row"><span>real</span><strong>${escapeHtml(column.dataset.chartReal)}</strong></div>
            <div class="sa3-chart-tooltip-row"><span>meta</span><strong>${escapeHtml(column.dataset.chartMeta)}</strong></div>
            <div class="sa3-chart-tooltip-row"><span>var</span><strong>${escapeHtml(column.dataset.chartVariation)}</strong></div>
          `;
          tooltip.style.display = "block";
          positionTooltip(event);
        });
        column.addEventListener("mousemove", positionTooltip);
        column.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
      });
    }

    // -------------------------------------------------------- Anexos
    // Mesmo widget pra ação, item de análise e KPI (strategic_attachments
    // aceita exatamente 1 dono — ver constraint strategic_attachments_
    // single_owner, migration 172 adicionou kpi_id como 4ª opção).
    // Upload dispara na hora, sem botão "enviar" separado (1 arquivo por
    // vez). kpi_record_id (anexo por MÊS específico) segue sem uso.
    const ATTACHMENT_OWNER_COLUMN = { action: "action_id", analysis_item: "analysis_item_id", kpi: "kpi_id" };
    function truncateFileName(name, max = 22) {
      const s = String(name || "arquivo");
      return s.length > max ? `${s.slice(0, max - 1)}…` : s;
    }

    // Atualiza o nome exibido no campo de anexo dos formulários de criação
    // (o input nativo fica invisível — ver .vecton-file-native no styles.css).
    function bindFileNameDisplay(formEl) {
      const input = formEl?.querySelector('[data-field="attachment"]');
      input?.addEventListener("change", () => {
        const nameEl = input.closest(".vecton-file-field")?.querySelector("[data-file-name]");
        if (nameEl) nameEl.textContent = input.files?.[0]?.name || "Nenhum arquivo selecionado";
      });
    }

    // Sobe o arquivo pro storage + grava a linha em strategic_attachments.
    // Usado tanto pelo widget de anexo de item já salvo quanto pelos
    // formulários de criação (anexa junto com o "Salvar", sem passo extra).
    async function uploadAttachment(ownerType, ownerId, file) {
      const { year, month } = currentPeriod();
      const fileId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const safeName = String(file.name || "arquivo").replace(/[^\w.\-]+/g, "_");
      const path = `${state.organizationId}/${year}/${month}/${ownerType}/${ownerId}/${fileId}_${safeName}`;
      await uploadToStorage(ATTACHMENT_BUCKET, path, file);
      const body = {
        organization_id: state.organizationId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        file_size: file.size || null,
        [ATTACHMENT_OWNER_COLUMN[ownerType]]: ownerId
      };
      try {
        const response = await authenticatedFetch(`${supabaseApiUrl}/rest/v1/strategic_attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Prefer": "return=minimal" },
          body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(await response.text());
      } catch (err) {
        // Compensação (melhoria #6 do review): o arquivo já subiu pro
        // Storage acima — se o metadado não gravar, não deixa órfão pra
        // trás. Best-effort: se a exclusão também falhar, segue o erro
        // original mesmo assim (usuário já vê a falha do upload).
        await deleteFromStorage(ATTACHMENT_BUCKET, path).catch(() => {});
        throw err;
      }
    }

    // canAdd/canRemove são independentes — achado do usuário (2026-08-29):
    // "Anexar" só pode existir DENTRO do form aberto (canAdd:false no card,
    // sempre, mesmo com a ação aberta/ativa); remover continua liberado no
    // card também. Ação "encerrada" (done/cancelled, ACTION_CLOSED_STATUSES)
    // trava os dois em qualquer lugar (card ou form).
    function renderAttachmentsStrip(ownerType, ownerId, title, { canAdd = true, canRemove = true } = {}) {
      const list = (state.attachments?.[ownerType]?.[ownerId]) || [];
      const chips = list.map((att, index) => `
        <span class="sa3-attachment-chip" data-attachment-open data-owner-type="${ownerType}" data-owner-id="${escapeHtml(ownerId)}" data-index="${index}" data-title="${escapeHtml(title || "")}" title="${escapeHtml(att.file_name)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v2"/></svg>
          <span class="sa3-attachment-name">${escapeHtml(truncateFileName(att.file_name))}</span>
          ${canRemove ? `<button type="button" class="sa3-attachment-remove" data-action="remove-attachment" data-attachment-id="${escapeHtml(att.id)}" data-attachment-path="${escapeHtml(att.storage_path)}" title="Remover anexo">&times;</button>` : ""}
        </span>
      `).join("");
      const addControl = canAdd ? `
        <label class="sa3-attachment-add">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
          Anexar
          <input type="file" data-action="upload-attachment" data-owner-type="${ownerType}" data-owner-id="${escapeHtml(ownerId)}" hidden>
        </label>
      ` : "";
      if (!list.length && !canAdd) return `<div class="sa3-empty">Nenhum anexo.</div>`;
      return `<div class="sa3-attachments">${chips}${addControl}</div>`;
    }

    // -------------------------------------------------------- Carrossel de anexos
    // Mesmo padrão visual do módulo RPS (mesmas classes .rps-carousel-* já
    // definidas no styles.css global — não duplica CSS): imagem/PDF/vídeo/
    // áudio com pré-visualização, setas/miniaturas quando tem mais de 1
    // arquivo. Reaproveita ATTACHMENT_BUCKET + createStorageSignedUrl.
    function attachmentMediaKind(att) {
      const type = String(att?.mime_type || "").toLowerCase();
      const name = String(att?.file_name || "").toLowerCase();
      if (type.startsWith("image/") || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(name)) return "image";
      if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
      if (type.startsWith("video/") || /\.(m4v|mov|mp4|webm)$/.test(name)) return "video";
      if (type.startsWith("audio/") || /\.(aac|m4a|mp3|ogg|wav)$/.test(name)) return "audio";
      return "file";
    }

    function formatAttachmentSize(bytes) {
      const size = Number(bytes || 0);
      if (size < 1024) return `${size} B`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1).replace(".0", "")} KB`;
      return `${(size / (1024 * 1024)).toFixed(1).replace(".0", "")} MB`;
    }

    function closeAttachmentCarousel() {
      document.querySelector(".rps-attachment-carousel")?.remove();
      document.body.classList.remove("rps-carousel-open");
    }

    function openAttachmentCarousel(ownerType, ownerId, startIndex, title) {
      closeAttachmentCarousel();
      const attachments = (state.attachments?.[ownerType]?.[ownerId]) || [];
      if (!attachments.length) return;

      let activeIndex = startIndex || 0;
      let renderGeneration = 0;
      const signedUrls = new Map();
      const carousel = document.createElement("div");
      carousel.className = "rps-attachment-carousel";
      carousel.tabIndex = -1;
      carousel.innerHTML = `
        <section class="rps-carousel-stage" role="dialog" aria-modal="true" aria-labelledby="sa3-carousel-title">
          <header class="rps-carousel-header">
            <div class="rps-carousel-heading">
              <span>Anexos</span>
              <h3 id="sa3-carousel-title">${escapeHtml(title || "")}</h3>
            </div>
            <div class="rps-carousel-actions">
              <span class="rps-carousel-counter" data-carousel-counter></span>
              <a class="rps-carousel-external" data-carousel-external target="_blank" rel="noopener noreferrer">Abrir arquivo ↗</a>
              <button type="button" class="rps-carousel-close" data-carousel-close aria-label="Fechar apresentação">×</button>
            </div>
          </header>
          <main class="rps-carousel-viewport" data-carousel-viewport aria-live="polite"></main>
          ${attachments.length > 1 ? `<button type="button" class="rps-carousel-arrow is-previous" data-carousel-previous aria-label="Anexo anterior">‹</button>
          <button type="button" class="rps-carousel-arrow is-next" data-carousel-next aria-label="Próximo anexo">›</button>` : ""}
          <footer class="rps-carousel-footer">
            <div class="rps-carousel-caption"><strong data-carousel-name></strong><span data-carousel-meta></span></div>
            <nav class="rps-carousel-strip" aria-label="Arquivos anexados">${attachments.map((att, index) => `<button type="button" data-carousel-index="${index}" title="${escapeHtml(att.file_name || `Arquivo ${index + 1}`)}"><span>${index + 1}</span><small>${escapeHtml(att.file_name || "Arquivo")}</small></button>`).join("")}</nav>
          </footer>
        </section>`;
      document.body.appendChild(carousel);
      document.body.classList.add("rps-carousel-open");

      const viewport = carousel.querySelector("[data-carousel-viewport]");
      const counter = carousel.querySelector("[data-carousel-counter]");
      const nameEl = carousel.querySelector("[data-carousel-name]");
      const metaEl = carousel.querySelector("[data-carousel-meta]");
      const external = carousel.querySelector("[data-carousel-external]");

      const mediaMarkup = (att, url) => {
        const safeUrl = escapeHtml(url);
        const safeName = escapeHtml(att.file_name || "Arquivo");
        const kind = attachmentMediaKind(att);
        if (kind === "image") return `<img class="rps-carousel-image" src="${safeUrl}" alt="${safeName}">`;
        if (kind === "pdf") return `<iframe class="rps-carousel-pdf" src="${safeUrl}#view=FitH" title="${safeName}"></iframe>`;
        if (kind === "video") return `<video class="rps-carousel-video" src="${safeUrl}" controls playsinline></video>`;
        if (kind === "audio") return `<div class="rps-carousel-file-card"><span class="rps-carousel-file-symbol">♫</span><strong>${safeName}</strong><audio src="${safeUrl}" controls></audio></div>`;
        return `<div class="rps-carousel-file-card"><span class="rps-carousel-file-symbol">▧</span><strong>${safeName}</strong><p>Este tipo de arquivo não possui pré-visualização no navegador.</p><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Abrir arquivo</a></div>`;
      };

      const renderActive = async () => {
        const generation = ++renderGeneration;
        const att = attachments[activeIndex];
        counter.textContent = `${activeIndex + 1} / ${attachments.length}`;
        nameEl.textContent = att.file_name || "Arquivo";
        metaEl.textContent = `${formatAttachmentSize(att.file_size)}${att.created_at ? ` · ${new Date(att.created_at).toLocaleString("pt-BR")}` : ""}`;
        external.removeAttribute("href");
        external.classList.add("is-loading");
        carousel.querySelectorAll("[data-carousel-index]").forEach((button, index) => button.classList.toggle("is-active", index === activeIndex));
        viewport.innerHTML = `<div class="rps-carousel-loading"><span></span><p>Preparando visualização...</p></div>`;
        try {
          let url = signedUrls.get(att.id);
          if (!url) {
            url = await createStorageSignedUrl(ATTACHMENT_BUCKET, att.storage_path, 3600);
            signedUrls.set(att.id, url);
          }
          if (generation !== renderGeneration || !carousel.isConnected) return;
          external.href = url;
          external.classList.remove("is-loading");
          viewport.innerHTML = mediaMarkup(att, url);
        } catch (err) {
          if (generation !== renderGeneration || !carousel.isConnected) return;
          external.classList.remove("is-loading");
          viewport.innerHTML = `<div class="rps-carousel-error"><strong>Não foi possível carregar este arquivo.</strong><span>Tente novamente ou feche a apresentação.</span><button type="button" data-carousel-retry>Tentar novamente</button></div>`;
        }
      };

      const show = (index) => { activeIndex = (index + attachments.length) % attachments.length; void renderActive(); };
      const close = () => closeAttachmentCarousel();
      carousel.addEventListener("click", (event) => {
        if (event.target === carousel || event.target.closest("[data-carousel-close]")) return close();
        if (event.target.closest("[data-carousel-previous]")) return show(activeIndex - 1);
        if (event.target.closest("[data-carousel-next]")) return show(activeIndex + 1);
        if (event.target.closest("[data-carousel-retry]")) { signedUrls.delete(attachments[activeIndex].id); return void renderActive(); }
        const indexed = event.target.closest("[data-carousel-index]");
        if (indexed) show(Number(indexed.dataset.carouselIndex));
      });
      carousel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") close();
        else if (event.key === "ArrowLeft") show(activeIndex - 1);
        else if (event.key === "ArrowRight") show(activeIndex + 1);
      });
      carousel.focus();
      void renderActive();
    }

    function bindAttachmentWidgets() {
      root.querySelectorAll('[data-action="upload-attachment"]').forEach((input) => {
        input.addEventListener("change", async () => {
          const file = input.files?.[0];
          if (!file) return;
          if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); input.value = ""; return; }
          if (file.size > MAX_ATTACHMENT_BYTES) { appAlert?.(`O arquivo "${file.name}" ultrapassa o limite de 20 MB.`, "warn"); input.value = ""; return; }
          const ownerType = input.dataset.ownerType;
          const ownerId = input.dataset.ownerId;
          input.disabled = true;
          try {
            await uploadAttachment(ownerType, ownerId, file);
            await loadAttachments();
            renderShell();
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
            input.disabled = false;
          }
        });
      });

      root.querySelectorAll("[data-attachment-open]").forEach((chip) => {
        chip.addEventListener("click", (e) => {
          if (e.target.closest('[data-action="remove-attachment"]')) return;
          openAttachmentCarousel(chip.dataset.ownerType, chip.dataset.ownerId, Number(chip.dataset.index || 0), chip.dataset.title);
        });
      });

      root.querySelectorAll('[data-action="remove-attachment"]').forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
          const ok = await appConfirm?.("Remover este anexo?", "warn");
          if (!ok) return;
          btn.disabled = true;
          try {
            const response = await authenticatedFetch(
              `${supabaseApiUrl}/rest/v1/strategic_attachments?id=eq.${btn.dataset.attachmentId}`,
              { method: "DELETE" }
            );
            if (!response.ok) throw new Error(await response.text());
            await deleteFromStorage(ATTACHMENT_BUCKET, btn.dataset.attachmentPath);
            await loadAttachments();
            renderShell();
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
            btn.disabled = false;
          }
        });
      });
    }

    function renderActionItem(a) {
      const tone = ACTION_STATUS_TONE[a.status] || "muted";
      const label = (ACTION_STATUS_OPTIONS.find((o) => o.value === a.status) || {}).label || a.status;
      const ownerNames = (a.strategic_action_owners || []).map((o) => ownerNameById(o.user_id)).filter(Boolean);
      const extraMeta = [];
      if (ownerNames.length) extraMeta.push(`Responsável: ${ownerNames.join(", ")}`);
      if (a.progress !== null && a.progress !== undefined) extraMeta.push(`Progresso: ${a.progress}%`);
      const extraMetaHtml = extraMeta.length ? `<div class="sa3-action-meta">${escapeHtml(extraMeta.join(" · "))}</div>` : "";
      return `
        <div class="sa3-action-item">
          <div class="sa3-action-desc">${escapeHtml(a.title)}${a.description ? `<div class="sa3-action-meta">${escapeHtml(a.description)}</div>` : ""}${extraMetaHtml}</div>
          <div class="sa3-action-meta">${a.priority ? escapeHtml(a.priority) : "—"}</div>
          <div class="sa3-action-meta">${a.due_date ? escapeHtml(a.due_date) : "—"}</div>
          <span class="sa3-pill ${tone}">${escapeHtml(label)}</span>
          <div class="sa3-item-actions">
            ${canManage() ? `
              <button type="button" class="sa3-icon-btn" data-action="edit-action-item" data-action-id="${escapeHtml(a.id)}" title="Editar">${ICON_EDIT}</button>
              <button type="button" class="sa3-icon-btn" data-action="delete-action-item" data-action-id="${escapeHtml(a.id)}" title="Excluir">${ICON_TRASH}</button>
            ` : ""}
          </div>
          <div style="grid-column:1/-1">${renderAttachmentsStrip("action", a.id, a.title, { canAdd: false, canRemove: canManage() && !ACTION_CLOSED_STATUSES.includes(a.status) })}</div>
        </div>
      `;
    }

    function renderActionForm(kpiId) {
      const statusOptions = ACTION_STATUS_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
      const priorityOptions = ACTION_PRIORITY_OPTIONS.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
      const ownersHtml = (state.orgUsers || []).length
        ? state.orgUsers.map((u) => `
            <label class="sa3-owner-row"><input type="checkbox" data-field="owner" value="${escapeHtml(u.user_id)}"><span>${escapeHtml(u.full_name || u.email || "Usuário")}</span></label>
          `).join("")
        : `<div class="sa3-empty">Nenhum usuário encontrado.</div>`;
      return `
        <div class="sa3-form hidden" data-action-form="${escapeHtml(kpiId)}" data-editing-id="">
          <div><label>Descrição da ação</label><textarea rows="2" data-field="title" placeholder="O que precisa ser feito?"></textarea></div>
          <div class="sa3-form-grid">
            <div><label>Detalhe (opcional)</label><input type="text" data-field="description"></div>
            <div><label>Prazo</label><input type="date" data-field="due_date"></div>
            <div><label>Status</label><select data-field="status">${statusOptions}</select></div>
          </div>
          <div class="sa3-form-grid" style="grid-template-columns:150px 150px">
            <div><label>Prioridade</label><select data-field="priority"><option value="">—</option>${priorityOptions}</select></div>
            <div><label>Progresso</label><input type="number" step="1" min="0" max="100" data-field="progress" placeholder="%"></div>
          </div>
          <div class="sa3-owner-picker">
            <label>Responsáveis (opcional)</label>
            <button type="button" class="sa3-btn sa3-owner-toggle" data-action="toggle-owners" aria-expanded="false">
              <span data-owner-summary>Nenhum selecionado</span>
              <svg class="sa3-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="sa3-owner-list hidden" data-owner-list>${ownersHtml}</div>
          </div>
          <div>
            <label>Anexos (opcional)</label>
            <div data-action-attachments></div>
          </div>
          <div class="sa3-form-foot">
            <button class="sa3-btn" data-action="cancel-action-form" data-kpi-id="${escapeHtml(kpiId)}">Cancelar</button>
            <button class="sa3-btn primary" data-action="save-action" data-kpi-id="${escapeHtml(kpiId)}">Salvar ação</button>
          </div>
        </div>
      `;
    }

    // Botão-flag dos Responsáveis mostra só a contagem ("2 selecionados"),
    // nunca a lista de nomes — a lista só aparece dentro do popover, ao
    // abrir. Chamado tanto ao preencher o form (fillActionForm) quanto a
    // cada clique num checkbox (bindActionForm) pra manter o resumo em dia.
    function updateOwnerSummary(form) {
      const summaryEl = form?.querySelector("[data-owner-summary]");
      if (!summaryEl) return;
      const checked = form.querySelectorAll('[data-field="owner"]:checked');
      summaryEl.textContent = checked.length
        ? `${checked.length} selecionado${checked.length === 1 ? "" : "s"}`
        : "Nenhum selecionado";
    }

    // Anexo de ação NOVA (sem id ainda pra gravar em strategic_attachments):
    // fica staged localmente (File[] em state.editingAction.stagedFiles) até
    // o Salvar, que sobe todos de uma vez — só assim dá pra anexar VÁRIOS
    // ainda durante a criação, não só depois do 1º save (pedido explícito
    // do usuário, 2026-08-29: a leva anterior só liberava anexo depois de
    // salvar a ação, e não era isso que foi pedido).
    function renderStagedAttachments(files) {
      const chips = (files || []).map((file, index) => `
        <span class="sa3-attachment-chip" title="${escapeHtml(file.name)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v2"/></svg>
          <span class="sa3-attachment-name">${escapeHtml(truncateFileName(file.name))}</span>
          <button type="button" class="sa3-attachment-remove" data-action="unstage-attachment" data-index="${index}" title="Remover">&times;</button>
        </span>
      `).join("");
      return `
        <div class="sa3-attachments">
          ${chips}
          <label class="sa3-attachment-add">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
            Anexar
            <input type="file" data-action="stage-attachment" hidden>
          </label>
        </div>
      `;
    }

    // Liga add/remove do staging — precisa ser rechamada toda vez que o
    // innerHTML do container é reescrito (troca de innerHTML mata os
    // listeners antigos).
    function bindStagedAttachments(form) {
      const container = form?.querySelector("[data-action-attachments]");
      if (!container) return;
      container.querySelector('[data-action="stage-attachment"]')?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file || !state.editingAction) return;
        if (file.size > MAX_ATTACHMENT_BYTES) { appAlert?.(`O arquivo "${file.name}" ultrapassa o limite de 20 MB.`, "warn"); return; }
        state.editingAction.stagedFiles = [...(state.editingAction.stagedFiles || []), file];
        container.innerHTML = renderStagedAttachments(state.editingAction.stagedFiles);
        bindStagedAttachments(form);
      });
      container.querySelectorAll('[data-action="unstage-attachment"]').forEach((btn) => {
        btn.addEventListener("click", () => {
          if (!state.editingAction) return;
          const idx = Number(btn.dataset.index);
          state.editingAction.stagedFiles = (state.editingAction.stagedFiles || []).filter((_, i) => i !== idx);
          container.innerHTML = renderStagedAttachments(state.editingAction.stagedFiles);
          bindStagedAttachments(form);
        });
      });
    }

    // Reaproveita o mesmo form pra criar E editar — action=null limpa
    // (modo criação), action preenchido carrega os valores (modo edição).
    // Responsável/prioridade/progresso: campos recomendados, não obrigatórios
    // (decisão #24 da especificação) — banco e RPC já aceitavam, só faltava
    // o formulário expor.
    function fillActionForm(form, action) {
      if (!form) return;
      form.querySelector('[data-field="title"]').value = action?.title || "";
      form.querySelector('[data-field="description"]').value = action?.description || "";
      form.querySelector('[data-field="due_date"]').value = action?.due_date || "";
      form.querySelector('[data-field="status"]').value = action?.status || "not_started";
      form.querySelector('[data-field="priority"]').value = action?.priority || "";
      form.querySelector('[data-field="progress"]').value = action?.progress ?? "";
      const ownerIds = new Set((action?.strategic_action_owners || []).map((o) => o.user_id));
      form.querySelectorAll('[data-field="owner"]').forEach((cb) => { cb.checked = ownerIds.has(cb.value); });
      updateOwnerSummary(form);
      form.querySelector("[data-owner-list]")?.classList.add("hidden");
      form.querySelector('[data-action="toggle-owners"]')?.setAttribute("aria-expanded", "false");
      // Anexos: ação já salva (tem id) usa o widget de upload direto (mesmo
      // do card, trava quando "encerrada" — done/cancelled); ação nova usa
      // o staging local (renderStagedAttachments), sempre disponível durante
      // a edição, mesmo antes do 1º save.
      const attachEl = form.querySelector("[data-action-attachments]");
      if (attachEl) {
        if (action?.id) {
          attachEl.innerHTML = renderAttachmentsStrip("action", action.id, action.title, {
            canAdd: canManage() && !ACTION_CLOSED_STATUSES.includes(action.status),
            canRemove: canManage() && !ACTION_CLOSED_STATUSES.includes(action.status)
          });
        } else {
          attachEl.innerHTML = renderStagedAttachments(state.editingAction?.stagedFiles || []);
          bindStagedAttachments(form);
        }
      }
      form.dataset.editingId = action?.id || "";
      const saveBtn = form.querySelector('[data-action="save-action"]');
      if (saveBtn) saveBtn.textContent = action ? "Salvar alterações" : "Salvar ação";
    }

    function bindActionForm(kpiId) {
      const toggleBtn = root.querySelector(`[data-action="toggle-action-form"][data-kpi-id="${cssEscape(kpiId)}"]`);
      const form = root.querySelector(`[data-action-form="${cssEscape(kpiId)}"]`);
      const cancelBtn = root.querySelector(`[data-action="cancel-action-form"][data-kpi-id="${cssEscape(kpiId)}"]`);
      const saveBtn = root.querySelector(`[data-action="save-action"][data-kpi-id="${cssEscape(kpiId)}"]`);

      toggleBtn?.addEventListener("click", () => {
        const opening = form?.classList.contains("hidden");
        if (opening) {
          // Seta editingAction (com stagedFiles zerado) ANTES de preencher —
          // fillActionForm lê state.editingAction.stagedFiles pro widget de
          // anexo staged, precisa existir antes de renderizar.
          state.editingAction = { kpiId, actionId: null, stagedFiles: [] };
          fillActionForm(form, null);
        } else {
          state.editingAction = null;
        }
        form?.classList.toggle("hidden");
      });
      cancelBtn?.addEventListener("click", () => {
        form?.classList.add("hidden");
        state.editingAction = null;
      });

      // Popover de Responsáveis: fechado por padrão, só abre no clique do
      // botão-flag; qualquer marcação/desmarcação atualiza o resumo na hora.
      const ownerToggleBtn = form?.querySelector('[data-action="toggle-owners"]');
      const ownerListEl = form?.querySelector("[data-owner-list]");
      ownerToggleBtn?.addEventListener("click", () => {
        const willOpen = ownerListEl?.classList.contains("hidden");
        ownerListEl?.classList.toggle("hidden", !willOpen);
        ownerToggleBtn.setAttribute("aria-expanded", String(!!willOpen));
      });
      ownerListEl?.addEventListener("change", () => updateOwnerSummary(form));
      saveBtn?.addEventListener("click", async () => {
        if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
        const title = form.querySelector('[data-field="title"]').value.trim();
        if (!title) { appAlert?.("Descreva a ação antes de salvar.", "warn"); return; }
        const description = form.querySelector('[data-field="description"]').value.trim();
        const dueDate = form.querySelector('[data-field="due_date"]').value || null;
        const status = form.querySelector('[data-field="status"]').value;
        const priority = form.querySelector('[data-field="priority"]').value || null;
        const progressRaw = form.querySelector('[data-field="progress"]').value;
        const progress = progressRaw === "" ? null : Number(progressRaw);
        if (progress !== null && (Number.isNaN(progress) || progress < 0 || progress > 100)) {
          appAlert?.("Progresso precisa ser um número entre 0 e 100.", "warn");
          return;
        }
        const ownerIds = Array.from(form.querySelectorAll('[data-field="owner"]:checked')).map((cb) => cb.value);
        const editingId = form.dataset.editingId || null;
        saveBtn.disabled = true;
        // strategic_save_action substitui a lista INTEIRA de vínculos a cada
        // chamada (mesmo contrato de strategic_save_period_analysis). Editar
        // a partir de um card específico só dá o a3/kpi DESSE card — se a
        // ação já estava ligada a outros, mandar só esse par apagava os
        // demais em silêncio (achado #4 do review). Fix: ao editar, parte
        // dos vínculos que a ação já tem (já carregados em state.actions via
        // o embed de loadActionsForA3) e garante que o card atual entra no
        // conjunto, em vez de truncar pra 1 A3 + 1 KPI.
        const existingAction = editingId ? state.actions.find((a) => a.id === editingId) : null;
        const a3Ids = existingAction
          ? Array.from(new Set([...(existingAction.strategic_action_a3 || []).map((l) => l.a3_id), state.a3Id]))
          : [state.a3Id];
        const kpiIds = existingAction
          ? Array.from(new Set([...(existingAction.strategic_action_kpis || []).map((l) => l.kpi_id), kpiId]))
          : [kpiId];
        try {
          const action = await callSupabaseRpc("strategic_save_action", {
            p_organization_id: state.organizationId,
            p_cycle_id: state.cycleId,
            p_id: editingId,
            p_title: title,
            p_description: description || null,
            p_status: status,
            p_priority: priority,
            p_due_date: dueDate,
            p_progress: progress,
            p_a3_ids: a3Ids,
            p_kpi_ids: kpiIds,
            p_owner_user_ids: ownerIds
          });
          // Trava o id assim que a ação existe — se o upload de algum anexo
          // staged falhar logo abaixo, um retry do Salvar cai no caminho de
          // EDIÇÃO (evita criar uma ação duplicada tentando de novo com
          // p_id null).
          form.dataset.editingId = action.id;
          // Consome a fila por POP progressivo — se o upload de 1 arquivo
          // falhar, os que já subiram já saíram de stagedFiles, então um
          // retry do Salvar (cai no caminho de edição, action.id já travado
          // acima) só tenta de novo os que faltaram, nunca duplica os que
          // já subiram (melhoria #6 do review).
          while (state.editingAction?.stagedFiles?.length) {
            const file = state.editingAction.stagedFiles[0];
            await uploadAttachment("action", action.id, file);
            state.editingAction.stagedFiles = state.editingAction.stagedFiles.slice(1);
          }
          state.editingAction = null; // Salvar fecha o form de vez (diferente de anexar, que mantém aberto)
          await loadA3Detail(state.a3Id);
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          saveBtn.disabled = false;
        }
      });

      // Restaura o form aberto+preenchido depois de QUALQUER re-render da
      // tela (loadA3Detail roda de novo a cada anexo incluído/removido no
      // form, achado do usuário 2026-08-29: sem isso o form fechava sozinho
      // a cada anexo, "os anexos somem" ao reabrir editar era o mesmo
      // sintoma — a lista de anexos existentes nunca aparecia dentro do
      // form, só no card por trás dele).
      if (state.editingAction && state.editingAction.kpiId === kpiId) {
        const restoredAction = state.editingAction.actionId
          ? state.actions.find((a) => a.id === state.editingAction.actionId)
          : null;
        fillActionForm(form, restoredAction);
        form?.classList.remove("hidden");
      }
    }

    // Editar/excluir ação — ligado uma vez só (não por KPI, como as ações
    // já vêm listadas dentro de cada bloco/card do KPI dono, achar o form
    // certo é só subir até o .sa3-card mais próximo).
    function bindActionItemButtons() {
      root.querySelectorAll('[data-action="edit-action-item"]').forEach((btn) => {
        btn.addEventListener("click", () => {
          const action = state.actions.find((a) => a.id === btn.dataset.actionId);
          const form = btn.closest(".sa3-card")?.querySelector("[data-action-form]");
          if (!action || !form) return;
          fillActionForm(form, action);
          form.classList.remove("hidden");
          state.editingAction = { kpiId: form.dataset.actionForm, actionId: action.id };
          form.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      });

      root.querySelectorAll('[data-action="delete-action-item"]').forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
          const ok = await appConfirm?.("Excluir esta ação? Os anexos dela também são removidos.", "danger");
          if (!ok) return;
          const actionId = btn.dataset.actionId;
          // Idem ao remove-analysis-item: a confirmação já promete "os anexos
          // também são removidos", mas até aqui isso só apagava o metadado
          // via cascata no banco — o arquivo físico ficava órfão no bucket
          // (achado #6 do review). Guarda a lista antes do DELETE.
          const orphanedAttachments = state.attachments?.action?.[actionId] || [];
          btn.disabled = true;
          try {
            const response = await authenticatedFetch(
              `${supabaseApiUrl}/rest/v1/strategic_actions?id=eq.${actionId}`,
              { method: "DELETE" }
            );
            if (!response.ok) throw new Error(await response.text());
            await Promise.all(orphanedAttachments.map((att) =>
              deleteFromStorage(ATTACHMENT_BUCKET, att.storage_path).catch(() => {})
            ));
            await loadA3Detail(state.a3Id);
          } catch (err) {
            appAlert?.(friendlyError(err), "error");
            btn.disabled = false;
          }
        });
      });
    }

    function cssEscape(value) {
      return String(value).replace(/["\\]/g, "\\$&");
    }

    // ---------------------------------------------------------------- render: Tela 3
    function renderEntryScreen() {
      const a3 = state.monthlyEntry?.a3;
      const period = state.monthlyEntry?.period;
      const kpis = state.monthlyEntry?.kpis || [];
      if (!a3) { root.innerHTML = `<div class="sa3-error">Área não encontrada.</div>`; return; }

      const isClosed = period?.status === "closed";
      // Controles de edição só aparecem pra quem pode editar ESTE A3 — antes
      // apareciam sempre (mesmo pra perfil só-leitura) e a negativa só vinha
      // no clique de Salvar (melhoria #4 do review: "não exibir controles de
      // edição pra usuário somente leitura").
      const readOnly = isClosed || !canManage();
      const rows = kpis.map((k) => renderEntryRow(k, readOnly)).join("");

      root.innerHTML = `
        <button class="sa3-back" data-action="back-detail"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 6l-6 6 6 6"/></svg>Voltar</button>
        <div class="sa3-card">
          <div class="sa3-head">
            <div><h2 style="color:${escapeHtml(a3.color || "#4f7cff")}">${escapeHtml(a3.name)} — lançamento mensal</h2><p>${MONTH_LABELS_SHORT[(period.month || 1) - 1]}/${period.year}</p></div>
            <div style="display:flex;gap:8px;">
              <button class="sa3-btn" data-action="sync-computed" ${canManage() ? "" : "disabled"}>Sincronizar automáticos</button>
              ${isClosed
                ? `<button class="sa3-btn" data-action="reopen-period" ${canManage() ? "" : "disabled"}>Reabrir período</button>`
                : `<button class="sa3-btn primary" data-action="close-period" ${canManage() ? "" : "disabled"}>Fechar período</button>`}
            </div>
          </div>
          <div class="sa3-period-status">
            <span class="sa3-pill ${isClosed ? "neg" : "pos"}">${isClosed ? "Período fechado" : "Período aberto"}</span>
          </div>
          ${rows}
        </div>
      `;

      root.querySelector('[data-action="back-detail"]')?.addEventListener("click", async () => {
        if (hasDirtyDrafts()) {
          const ok = await appConfirm?.("Você tem alterações não salvas nesta tela. Sair mesmo assim?", "warn");
          if (!ok) return;
          clearDirtyDrafts();
        }
        loadA3Detail(state.a3Id, false);
      });
      root.querySelector('[data-action="sync-computed"]')?.addEventListener("click", async () => {
        if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
        try {
          await callSupabaseRpc("strategic_sync_computed_kpi_records", {
            p_organization_id: state.organizationId, p_year: period.year, p_month: period.month, p_a3_id: state.a3Id
          });
          await loadMonthlyEntry(state.a3Id);
        } catch (err) { appAlert?.(friendlyError(err), "error"); }
      });
      root.querySelector('[data-action="close-period"]')?.addEventListener("click", async () => {
        const ok = await appConfirm?.("Fechar este período? Os registros deixam de poder ser editados até reabrir.", "warn");
        if (!ok) return;
        try {
          await callSupabaseRpc("strategic_close_a3_period", { p_a3_id: state.a3Id, p_year: period.year, p_month: period.month });
          await loadMonthlyEntry(state.a3Id);
        } catch (err) { appAlert?.(friendlyError(err), "error"); }
      });
      root.querySelector('[data-action="reopen-period"]')?.addEventListener("click", async () => {
        const ok = await appConfirm?.("Reabrir este período pra edição?", "warn");
        if (!ok) return;
        try {
          await callSupabaseRpc("strategic_reopen_a3_period", { p_a3_id: state.a3Id, p_year: period.year, p_month: period.month });
          await loadMonthlyEntry(state.a3Id);
        } catch (err) { appAlert?.(friendlyError(err), "error"); }
      });

      kpis.forEach((k) => bindEntryRow(k, readOnly));
    }

    // Meta editável em TODO entry_mode (inclusive 'computed' e 'breakdown' —
    // sem meta, nenhum KPI classifica status). Campos variam por
    // comparisonMode: higher/lower/exact usam target_value só; range usa
    // min+max; exact_with_tolerance usa value+tolerance.
    function renderTargetInputs(k, isClosed) {
      const t = k.target || {};
      const dis = isClosed ? "disabled" : "";
      const fmt = (v) => formatEditableValue(v, k.unit, k.decimalPlaces, false);
      if (k.comparisonMode === "range") {
        return `
          <div class="sa3-entry-meta">
            <span class="k">Meta (mín–máx)</span>
            <div class="sa3-entry-meta-row">
              <input type="text" inputmode="decimal" data-target-field="target_min" value="${fmt(t.min)}" placeholder="mín" ${dis}>
              <input type="text" inputmode="decimal" data-target-field="target_max" value="${fmt(t.max)}" placeholder="máx" ${dis}>
            </div>
          </div>
        `;
      }
      if (k.comparisonMode === "exact_with_tolerance") {
        return `
          <div class="sa3-entry-meta">
            <span class="k">Meta &plusmn; tolerância</span>
            <div class="sa3-entry-meta-row">
              <input type="text" inputmode="decimal" data-target-field="target_value" value="${fmt(t.value)}" ${dis}>
              <input type="text" inputmode="decimal" data-target-field="tolerance" value="${fmt(t.tolerance)}" placeholder="±" ${dis}>
            </div>
          </div>
        `;
      }
      return `
        <div class="sa3-entry-meta">
          <span class="k">Meta</span>
          <div class="sa3-entry-meta-row">
            <input type="text" inputmode="decimal" data-target-field="target_value" value="${fmt(t.value)}" ${dis}>
          </div>
        </div>
      `;
    }

    function readTargetPayload(rowEl, unit) {
      const val = (sel) => {
        const el = rowEl.querySelector(sel);
        return el ? parseEditableValue(el.value, unit) : null;
      };
      return {
        target_value: val('[data-target-field="target_value"]'),
        target_min: val('[data-target-field="target_min"]'),
        target_max: val('[data-target-field="target_max"]'),
        tolerance: val('[data-target-field="tolerance"]')
      };
    }

    // Layout ÚNICO pra 100% dos indicadores, qualquer entry_mode: Nome | Meta
    // | Real | 1 botão Salvar. O que muda de um modo pro outro é só o
    // CONTEÚDO da célula "Real":
    //  - direct / computed: um input numérico editável. Em 'computed' ele
    //    vem preenchido com o valor calculado (sugestão), mas continua
    //    editável — "Sincronizar automáticos" só ATUALIZA essa sugestão,
    //    quem trava o valor é o botão Salvar da linha.
    //  - drivers: os direcionadores (ex.: admissões/desligamentos/quadro),
    //    compactos, empilhados na mesma célula.
    //  - breakdown: célula "Real" só resume a contagem de linhas; o editor
    //    de composição em si fica num painel full-width logo abaixo da
    //    linha (não cabe nos 190px da coluna) — ver renderBreakdownPanel.
    //    O botão Salvar único da linha manda meta + composição juntos
    //    (achado #2 do review: 8 KPIs breakdown ativos não aceitavam
    //    realizado nenhum — RPC já suportava p_breakdown_rows, só faltava
    //    o editor no frontend).
    function renderEntryRow(k, isClosed) {
      const targetInputs = renderTargetInputs(k, isClosed);
      const saveBtn = !isClosed
        ? `<button class="sa3-btn primary" data-action="save-row" data-kpi-id="${escapeHtml(k.id)}">Salvar</button>`
        : "";
      const nameNote = k.entryMode === "drivers"
        ? `<div class="sa3-entry-target">Resultado atual: ${formatByUnit(k.resultValue, k.unit, k.decimalPlaces)}</div>`
        : "";

      let realCell;
      let breakdownPanel = "";
      if (k.entryMode === "drivers") {
        const driverRows = (k.drivers || []).map((d) => `
          <div class="sa3-entry-driver-row">
            <label title="${escapeHtml(d.name)} (${escapeHtml(d.role)})">${escapeHtml(d.name)}</label>
            <input type="number" step="any" data-driver-code="${escapeHtml(d.code)}" value="${d.value ?? ""}" ${isClosed ? "disabled" : ""}>
          </div>
        `).join("");
        realCell = `<div class="sa3-entry-real"><span class="k">Real</span>${driverRows}</div>`;
      } else if (k.entryMode === "breakdown") {
        const rowCount = (k.breakdownRows || []).length;
        realCell = `<div class="sa3-entry-real"><span class="k">Real (composição)</span><div class="sa3-entry-target">${rowCount} linha${rowCount === 1 ? "" : "s"} — editar abaixo</div></div>`;
        breakdownPanel = renderBreakdownPanel(k, isClosed);
      } else {
        // direct ou computed
        realCell = `
          <div class="sa3-entry-real">
            <span class="k">Real</span>
            <input type="text" inputmode="decimal" data-field="result" value="${formatEditableValue(k.resultValue, k.unit, k.decimalPlaces, false)}" ${isClosed ? "disabled" : ""}>
          </div>
        `;
      }

      return `
        <div class="sa3-entry-row" data-kpi-row="${escapeHtml(k.id)}" data-entry-mode="${escapeHtml(k.entryMode)}" data-version="${k.version ?? ""}" data-target-version="${k.target?.version ?? ""}">
          <div>
            <div class="sa3-entry-name">${escapeHtml(k.name)}${k.entryMode === "computed" ? '<span class="sa3-badge-auto">Auto</span>' : ""}</div>
            ${nameNote}
          </div>
          ${targetInputs}
          ${realCell}
          <div class="sa3-entry-save">
            <span class="k" aria-hidden="true">&nbsp;</span>
            <div class="sa3-entry-save-row">
              <span class="sa3-dirty-badge">Não salvo</span>${saveBtn}
            </div>
          </div>
          <span class="sa3-saved-flag" data-saved-flag="${escapeHtml(k.id)}" aria-live="polite">&check; Salvo</span>
        </div>
        ${breakdownPanel}
      `;
    }

    // Painel full-width (não cabe na coluna "Real" de 190px) com as linhas de
    // composição do KPI breakdown: descrição livre + planejado + real (+ peso,
    // só quando monthly_calculation='weighted_average' — 'ratio' soma
    // actual/planned direto, sem peso). dimension_key é só um slug de
    // identificação da linha (a RPC substitui a lista inteira a cada save,
    // igual strategic_save_period_analysis — não há FK externa nele).
    function renderBreakdownPanel(k, isClosed) {
      const rows = k.breakdownRows || [];
      const showWeight = k.monthlyCalculation === "weighted_average";
      const rowsHtml = rows.length
        ? rows.map((r, i) => renderBreakdownRow(r, i, showWeight, isClosed)).join("")
        : `<div class="sa3-empty">Nenhuma linha cadastrada.</div>`;
      return `
        <div class="sa3-breakdown-panel" data-breakdown-panel="${escapeHtml(k.id)}">
          <div class="sa3-breakdown-head">
            <span class="k">Composição por linha</span>
            ${!isClosed ? `<button type="button" class="sa3-btn" data-action="add-breakdown-row">+ Linha</button>` : ""}
          </div>
          <div class="sa3-breakdown-rows" data-breakdown-rows="${escapeHtml(k.id)}">${rowsHtml}</div>
        </div>
      `;
    }

    function renderBreakdownRow(r, index, showWeight, isClosed) {
      const dis = isClosed ? "disabled" : "";
      return `
        <div class="sa3-breakdown-row${showWeight ? "" : " no-weight"}" data-breakdown-row data-dimension-key="${escapeHtml(r.dimensionKey || "")}">
          <input type="text" data-field="dimension_label" value="${escapeHtml(r.dimensionLabel || "")}" placeholder="Descrição da linha" ${dis}>
          <input type="number" step="any" data-field="planned_value" value="${r.plannedValue ?? ""}" placeholder="Planejado" ${dis}>
          <input type="number" step="any" data-field="actual_value" value="${r.actualValue ?? ""}" placeholder="Real" ${dis}>
          ${showWeight ? `<input type="number" step="any" data-field="weight_value" value="${r.weightValue ?? ""}" placeholder="Peso" ${dis}>` : ""}
          <button type="button" class="sa3-icon-btn" data-action="remove-breakdown-row" title="Remover"${isClosed ? ' style="visibility:hidden"' : ""}>${ICON_TRASH}</button>
        </div>
      `;
    }

    // Slug de exibição só — sem função de chave estrangeira em outra tabela,
    // então não precisa de estabilidade rígida entre saves, só evitar campo
    // vazio (a RPC recebe dimension_key como texto livre).
    function slugifyDimensionKey(label, index) {
      const base = String(label || "")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      return base || `linha_${index + 1}`;
    }

    // Add/remove de linha do painel de composição — client-side até o
    // Salvar da linha, mas agora marca dirty (melhoria #5 do review: antes
    // era "sem draft em state" de propósito, só que isso incluía não
    // avisar quando a pessoa tinha composição inteira montada e saía sem
    // salvar).
    function bindBreakdownPanel(k) {
      const panel = root.querySelector(`[data-breakdown-panel="${cssEscape(k.id)}"]`);
      if (!panel) return;
      const showWeight = k.monthlyCalculation === "weighted_average";
      const rowsWrap = panel.querySelector(`[data-breakdown-rows="${cssEscape(k.id)}"]`);

      const bindRow = (rowEl) => {
        rowEl.querySelectorAll("input").forEach((inp) => {
          inp.addEventListener("input", () => markDirty(k.id));
        });
        rowEl.querySelector('[data-action="remove-breakdown-row"]')?.addEventListener("click", () => {
          rowEl.remove();
          markDirty(k.id);
        });
      };
      rowsWrap?.querySelectorAll("[data-breakdown-row]").forEach(bindRow);

      panel.querySelector('[data-action="add-breakdown-row"]')?.addEventListener("click", () => {
        rowsWrap.querySelector(".sa3-empty")?.remove();
        const wrap = document.createElement("div");
        wrap.innerHTML = renderBreakdownRow({}, rowsWrap.children.length, showWeight, false).trim();
        const rowEl = wrap.firstElementChild;
        rowsWrap.appendChild(rowEl);
        bindRow(rowEl);
        markDirty(k.id);
      });
    }

    // Um Salvar só: manda a meta e o realizado (conforme o modo) NUMA ÚNICA
    // chamada de RPC transacional — strategic_save_kpi_record ganhou os
    // parâmetros de meta na migration 163 (achado #7 do review: antes eram
    // 2 gravações separadas, se o realizado falhasse a meta já tinha ido).
    // Em 'computed', salvar aqui é a sobrescrita manual da sugestão
    // automática — strategic_save_kpi_record já aceita isso.
    function bindEntryRow(k, isClosed) {
      if (isClosed) return;
      const rowEl = root.querySelector(`[data-kpi-row="${cssEscape(k.id)}"]`);
      const btn = root.querySelector(`[data-action="save-row"][data-kpi-id="${cssEscape(k.id)}"]`);

      // Flash "✓ Salvo" (pedido do usuário 2026-08-29): bindEntryRow roda
      // de novo em TODO render, inclusive o reload logo depois de um save
      // — é aqui, não no handler de clique, que a linha recém-recriada já
      // existe no DOM pra receber a classe que dispara a animação. Só o
      // KPI que acabou de salvar recebe o flash (state.justSavedKpiId),
      // e o campo se limpa na hora — não sobrevive a um 2º render.
      if (state.justSavedKpiId === k.id) {
        state.justSavedKpiId = null;
        rowEl?.querySelector('[data-saved-flag]')?.classList.add("show");
      }

      // Rascunho não salvo: qualquer input tocado nesta linha (meta, real,
      // direcionador) marca dirty — mesmo listener serve pra qualquer
      // entry_mode, já cobre tudo que está DENTRO de rowEl (breakdown fica
      // num painel separado, bindBreakdownPanel cuida da parte dele).
      rowEl?.querySelectorAll("input").forEach((inp) => {
        inp.addEventListener("input", () => markDirty(k.id));
      });

      // Formatação por unidade (pedido do usuário 2026-08-29): Meta e Real
      // mostram R$/%/separador de milhar quando não estão em foco; ao
      // focar, viram número puro (sem prefixo/sufixo/milhar) pra digitar
      // sem atrito, e ao desfocar reformatam de novo. O valor CRU nunca
      // fica só no texto formatado — parseEditableValue (no Salvar) sabe
      // ler os dois estados, então não precisa guardar em data-attribute.
      rowEl?.querySelectorAll('[data-target-field], [data-field="result"]').forEach((inp) => {
        inp.addEventListener("focus", () => {
          const raw = parseEditableValue(inp.value, k.unit);
          inp.value = formatEditableValue(raw, k.unit, k.decimalPlaces, true);
        });
        inp.addEventListener("blur", () => {
          const raw = parseEditableValue(inp.value, k.unit);
          inp.value = formatEditableValue(raw, k.unit, k.decimalPlaces, false);
        });
      });

      if (k.entryMode === "breakdown") bindBreakdownPanel(k);

      btn?.addEventListener("click", async () => {
        if (!canManage()) { appAlert?.("Você não tem permissão para editar este módulo.", "warn"); return; }
        if (hasDirtyDrafts(k.id)) {
          const ok = await appConfirm?.(
            "Você tem alterações não salvas em outro(s) indicador(es) desta tela — elas serão perdidas ao salvar este. Continuar?",
            "warn"
          );
          if (!ok) return;
        }
        btn.disabled = true;
        try {
          const { year, month } = currentPeriod();
          const targetPayload = readTargetPayload(rowEl, k.unit);
          const version = rowEl.dataset.version ? Number(rowEl.dataset.version) : null;
          const targetVersion = rowEl.dataset.targetVersion ? Number(rowEl.dataset.targetVersion) : null;
          const targetParams = {
            p_target_value: targetPayload.target_value,
            p_target_min: targetPayload.target_min,
            p_target_max: targetPayload.target_max,
            p_tolerance: targetPayload.tolerance,
            p_expected_target_version: targetVersion
          };

          if (k.entryMode === "drivers") {
            const inputs = rowEl.querySelectorAll("[data-driver-code]");
            const driverInputs = Array.from(inputs).map((inp) => ({
              driver_code: inp.dataset.driverCode,
              numeric_value: inp.value === "" ? null : Number(inp.value)
            }));
            await callSupabaseRpc("strategic_save_kpi_record", {
              p_kpi_id: k.id, p_year: year, p_month: month, p_expected_version: version, p_driver_inputs: driverInputs,
              ...targetParams
            });
          } else if (k.entryMode === "breakdown") {
            const panelEl = root.querySelector(`[data-breakdown-panel="${cssEscape(k.id)}"]`);
            const rowEls = panelEl ? panelEl.querySelectorAll("[data-breakdown-row]") : [];
            const numVal = (el, sel) => {
              const inp = el.querySelector(sel);
              if (!inp) return null;
              return inp.value === "" ? null : Number(inp.value);
            };
            const breakdownRows = Array.from(rowEls)
              .map((el, i) => {
                const label = el.querySelector('[data-field="dimension_label"]').value.trim();
                return {
                  dimension_key: el.dataset.dimensionKey || slugifyDimensionKey(label, i),
                  dimension_label: label,
                  planned_value: numVal(el, '[data-field="planned_value"]'),
                  actual_value: numVal(el, '[data-field="actual_value"]'),
                  weight_value: numVal(el, '[data-field="weight_value"]'),
                  display_order: i
                };
              })
              .filter((r) => r.dimension_label); // ignora linha em branco adicionada e não preenchida
            await callSupabaseRpc("strategic_save_kpi_record", {
              p_kpi_id: k.id, p_year: year, p_month: month, p_expected_version: version, p_breakdown_rows: breakdownRows,
              ...targetParams
            });
          } else {
            // direct, ou sobrescrita manual de 'computed'
            const input = rowEl.querySelector('[data-field="result"]');
            const value = input ? parseEditableValue(input.value, k.unit) : null;
            await callSupabaseRpc("strategic_save_kpi_record", {
              p_kpi_id: k.id, p_year: year, p_month: month, p_result_value: value, p_expected_version: version,
              ...targetParams
            });
          }
          state.justSavedKpiId = k.id;
          await loadMonthlyEntry(state.a3Id);
        } catch (err) {
          appAlert?.(friendlyError(err), "error");
          btn.disabled = false;
        }
      });
    }

    // ---------------------------------------------------------------- public API
    // Chamado pelo app.js tanto na entrada do módulo quanto a cada troca do
    // período do topo (mesmo padrão de renderComercialVendasView) — por
    // isso precisa comparar contra loadedPeriod, não só checar se já existe
    // dado carregado (achado #1 do review: trocar o mês/ano não recarregava
    // a tela, e Salvar acabava gravando o período novo com os campos ainda
    // do período antigo na tela).
    function render() {
      if (!root) return;
      if (state.loading) { renderShell(); return; }

      const period = currentPeriod();
      const periodChanged = !!state.loadedPeriod &&
        (state.loadedPeriod.year !== period.year || state.loadedPeriod.month !== period.month);

      if (state.screen === "overview") {
        if (!state.overview || periodChanged) { loadOverview(); return; }
      } else if (state.screen === "detail") {
        if (!state.a3Detail || periodChanged) {
          loadA3Detail(state.a3Id, state.a3Id === state.a3RootId);
          return;
        }
      } else if (state.screen === "entry") {
        if (!state.monthlyEntry || periodChanged) { loadMonthlyEntry(state.a3Id); return; }
      }
      renderShell();
    }

    function destroy() {
      state.overview = null;
      state.a3Detail = null;
      state.monthlyEntry = null;
      state.loadedPeriod = null;
      state.screen = "overview";
      // Ciclo/cenário também zeram ao sair do módulo — ensureContext() já
      // se resolve sozinho por ano (ver achado #5 do review), mas isso
      // evita reentrar num ano diferente do que a pessoa deixou e herdar
      // cycleId/scenarioId de sessão anterior por 1 render antes do fetch.
      state.cycleId = null;
      state.scenarioId = null;
      state.contextYear = null;
      state.dirtyDrafts = {};
      state.archivedA3 = null;
      state.archivedKpis = null;
      window.removeEventListener("beforeunload", handleBeforeUnload);
    }

    // Clicar no item "A3 Estratégicos" do menu lateral enquanto já está
    // dentro de um A3 (Tela 2/3) não fazia nada — render() só olha se o
    // período mudou, não se o usuário quis voltar pra lista. Achado do
    // usuário (2026-08-29): esse clique tem que se comportar igual o botão
    // "Voltar". app.js chama isto ANTES de render() quando o clique vem do
    // menu lateral (não de dentro do próprio módulo).
    function resetToOverview() {
      state.screen = "overview";
      state.a3Id = null;
    }

    return { render, destroy, resetToOverview };
  }

  window.VECTON_STRATEGIC = { createStrategicModule };
})(window);
