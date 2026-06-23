const {
  ACTUALS_IMPORT_UPSERT_CHUNK_SIZE,
  AUTH_STORAGE_KEY,
  MAX_BROWSER_TEXT_IMPORT_BYTES,
  MAX_BROWSER_XLSX_BYTES,
  MONTH_LABELS,
  ROOT_BRANCH_NODE,
  ROOT_CC_NODE,
  ROOT_DRE_NODE,
  STORAGE_KEY,
  VIEW_HEADER_METADATA,
  branchSeed,
  defaultProfile,
  supabaseConfig
} = window.VECTON_CORE_CONSTANTS;
const {
  buildEmptyRow,
  buildFunAvatars,
  buildPeriodDate,
  chunkArray,
  dateMatchesPeriod,
  escapeHtml,
  formatActualsFieldName,
  formatActualsStatus,
  formatAmountInput,
  formatDisplayDate,
  formatFileSize,
  formatMonthLabel,
  formatPeriodLabel,
  getActualsStatusClass,
  getDefaultExpandedCcCodes,
  getDefaultExpandedCodes,
  isActualsApplyTimeoutError,
  isStatementTimeoutError,
  normalizeBranchCode,
  normalizeCode,
  normalizeCostCenterManagement,
  normalizeDateInput,
  normalizeHeaderName,
  parseLocalizedAmount,
  readFileAsDataUrl
} = window.VECTON_CORE_UTILS;
const { getPersistableState, loadState } = window.VECTON_CORE_STORAGE;
const { createAuthModule } = window.VECTON_AUTH;
const { createActualsModule } = window.VECTON_ACTUALS;
const createBudgetModule = window.VECTON_BUDGET?.createBudgetModule;
const { createNavigationModule } = window.VECTON_NAVIGATION;
const { createHeaderModule } = window.VECTON_HEADER;
const { createBranchTreeModule } = window.VECTON_BRANCH_TREE;
const { createDreTreeModule } = window.VECTON_DRE_TREE;
const { createCcTreeModule } = window.VECTON_CC_TREE;
const { createRenderModule } = window.VECTON_RENDER;
const { createProfileDialogModule } = window.VECTON_PROFILE_DIALOG;
const { createReportsDreModule } = window.VECTON_REPORTS_DRE;
const { createHeadcountRenderModule } = window.VECTON_HEADCOUNT_RENDER;
const { createShellEventsModule } = window.VECTON_SHELL_EVENTS;
const { createEditorEventsModule } = window.VECTON_EDITOR_EVENTS;
const { createUsersModule } = window.VECTON_USERS_MODULE;
const { createManagementsModule } = window.VECTON_MANAGEMENTS_MODULE;
const { createReportsHelpersModule } = window.VECTON_REPORTS_HELPERS;
const { createDashboardCardsModule } = window.VECTON_DASHBOARD_CARDS;
const { createDashboardModule } = window.VECTON_DASHBOARD_MODULE;
const { createDashboardVisualsModule } = window.VECTON_DASHBOARD_VISUALS;
const { appAlert, appConfirm } = window.VECTON_DIALOGS;
const { startMarketTicker } = window.VECTON_MARKET_TICKER;

const FUN_AVATARS = buildFunAvatars();

let state = loadState(STORAGE_KEY, normalizeHcBatch);
let activeView = "dashboard";
let selectedBranchCode = state.branches[0]?.code || null;
let selectedDreCode = state.dreNodes.find((node) => node.code === "31101001")?.code || state.dreNodes[0]?.code || null;
let expandedDreCodes = new Set(getDefaultExpandedCodes(state.dreNodes));
let selectedCcCode = state.ccNodes.find((node) => node.class === "Analitica")?.code || state.ccNodes[0]?.code || null;
let expandedCcCodes = new Set(getDefaultExpandedCcCodes(state.ccNodes));
let dragPayload = null;
let organizationIdCache = null;
let currentSession = null;
let currentUser = null;
let profileDraft = null;
let periodPickerYear = state.currentPeriod?.year || 2026;
// ─── Headcount Realizado (relatório) — estado de módulo ──────────────────
let hcReportExpanded = new Set();
let hcReportLoadingYear = null;
let hcReportErrorMessage = "";
let hcBudgetExpanded = new Set();
let hcBudgetReportLoadingYear = null;
let hcBudgetReportErrorMessage = "";
// Mesmo conjunto de contas de pessoal usado no card de Headcount do dashboard
const HC_PESSOAL_ACCOUNTS = new Set([
    "4110300001001","4110300001002","4110300001007","4110300001008","4110300001009",
    "4110300001010","4110300001011","4110300001028","4110300001029","4110300001031",
    "4110300001019","4110300001020","4110300001030","4110300001026","4110300001014",
    "4110300001015","4110300001016","4110300001017","4110300001022","4110300001027",
    "4110300001003","4110300001023","4110300001025","4110300002001","4110300002002",
    "4110300002023","4110300002007","4110300002008","4110300002009","4110300002010",
    "4110300002011","4110300002030","4110300002032","4110300002033","4110300002021",
    "4110300002022","4110300002031","4110300002028","4110300002016","4110300002017",
    "4110300002018","4110300002019","4110300002024","4110300002029","4110300002003",
    "4110300002026","4110300002025","4220100001001","4220100001015","4220100001029",
    "4220100001010","4220100001011","4220100001033","4220100001034","4220100001036",
    "4220100001021","4220100001022","4220100001035","4220100001031","4220100001016",
    "4220100001017","4220100001018","4220100001019","4220100001003","4220100001023",
    "4220100003001","4220100003002","4220100003023","4220100003024","4220100003007",
    "4220100003008","4220100003010","4220100003011","4220100003028","4220100003022",
    "4220100003029","4220100003021","4220100003030","4220100003031","4220100003016",
    "4220100003017","4220100003018","4220100003019","4220100003026","4220100003003",
    "4220100003025","4220100003004","42210200001","42210200002","422102000212",
    "422102000211","422102000210","42210200010","42210200011","42210200031",
    "42210200033","42210200034","42210200019","42210200020","42210200032",
    "42210200014","42210200016","42210200017","42210200003"
  ]);

const reportsLedgerCache = new Map();
let reportsLoadingYear = null;
let reportsErrorMessage = "";
let reportsLastLoadedYear = null;
let reportsLastLoadedAt = null;
const reportsBudgetCache = new Map();
let budgetReportsLoadingYear = null;
let budgetReportsErrorMessage = "";
let selectedReportId = null;
let selectedHeadcountBatchId = null;
let headcountRowsPage = 1;
const HEADCOUNT_ROWS_PER_PAGE = 200;
let headcountRowsFilter = "";
let activeHcErrorRowId = null;
let selectedHeadcountLoadType = null;
let headcountReturnView = null;
let opexHideZeros = false;
const loadingHeadcountBatchIds = new Set();
const hcDashCache = new Map();
let hcDashLoadingKey = null;

const appLayout = document.querySelector(".app-layout");
const authShell = document.querySelector("#auth-shell");
const loginForm = document.querySelector("#login-form");
const loginFeedback = document.querySelector("#login-feedback");
const logoutButton = document.querySelector("#logout-button");
const profileTrigger = document.querySelector("#profile-trigger");
const userAvatar = document.querySelector("#user-avatar");
const userName = document.querySelector("#user-name");
const sidebar = document.querySelector("#sidebar");
const menuButtons = Array.from(document.querySelectorAll(".menu-button"));
const submenuButtons = Array.from(document.querySelectorAll(".submenu-button"));
const paramsToggle = document.querySelector("#params-toggle");
const paramsSubmenu = document.querySelector("#params-submenu");
const paramsCaret = document.querySelector("#params-caret");
const views = {
  dashboard: document.querySelector("#dashboard-view"),
  reports: document.querySelector("#reports-view"),
  branchPlan: document.querySelector("#branchPlan-view"),
  drePlan: document.querySelector("#drePlan-view"),
  ccPlan: document.querySelector("#ccPlan-view"),
  actualsLoad: document.querySelector("#actualsLoad-view"),
  budgetLoad: document.querySelector("#budgetLoad-view"),
  headcountLoad: document.querySelector("#headcountLoad-view"),
  managements: document.querySelector("#managements-view"),
  users: document.querySelector("#users-view"),
  accessProfiles: document.querySelector("#accessProfiles-view")
};
const profileDialog = document.querySelector("#profile-dialog");

const branchTree = document.querySelector("#branch-tree");
const branchNodeForm = document.querySelector("#branch-node-form");
const branchWorkspace = document.querySelector("#branchPlan-view .branch-workspace");
const branchResizer = document.querySelector("#branch-resizer");
const dreTree = document.querySelector("#dre-tree");
const dreNodeForm = document.querySelector("#dre-node-form");
const dreWorkspace = document.querySelector("#drePlan-view .dre-workspace");
const dreResizer = document.querySelector("#dre-resizer");
const ccTree = document.querySelector("#cc-tree");
const ccNodeForm = document.querySelector("#cc-node-form");
const ccWorkspace = document.querySelector("#ccPlan-view .cc-workspace");
const ccResizer = document.querySelector("#cc-resizer");
const syncStatus = document.querySelector("#sync-status");
const profileForm = document.querySelector("#profile-form");
const profilePhotoFile = document.querySelector("#profile-photo-file");
const profilePhotoTrigger = document.querySelector("#profile-photo-trigger");
const periodTrigger = document.querySelector("#period-trigger");
const periodTriggerLabel = document.querySelector("#period-trigger-label");
const periodPopover = document.querySelector("#period-popover");
const periodYearLabel = document.querySelector("#period-year-label");
const periodMonthGrid = document.querySelector("#period-month-grid");
const reportsCardGrid = document.querySelector("#reports-card-grid");
const reportsCatalogCard = document.querySelector("#reports-view .reports-catalog-card");
const reportsDetailPanel = document.querySelector("#reports-view .reports-table-card");
const viewTitle = document.querySelector("#view-title");
const authModule = createAuthModule({
  AUTH_STORAGE_KEY,
  FUN_AVATARS,
  state,
  loginForm,
  loginFeedback,
  authShell,
  userAvatar,
  userName,
  profileForm,
  setSyncStatus,
  hasSupabaseBaseConfig,
  hydrateFromSupabase,
  buildAuthHeaders,
  supabaseConfig,
  onLogoutCleanup: () => { organizationIdCache = null; },
  getCurrentSession: () => currentSession,
  setCurrentSession: (value) => { currentSession = value; },
  getCurrentUser: () => currentUser,
  setCurrentUser: (value) => { currentUser = value; },
  getProfileDraft: () => profileDraft,
  setProfileDraft: (value) => { profileDraft = value; }
});
const {
  initializeAuth,
  handleLoginSubmit,
  handleLogout,
  refreshSession,
  applySession,
  clearSessionState,
  showAuthShell,
  renderUserProfile,
  getUserDisplayName,
  getResolvedProfile,
  getEditableProfile,
  updateProfileDraftFromForm,
  applyPhotoPreview
} = authModule;
const {
  bindProfileEvents,
  renderProfileEditor,
  openProfileDialog,
  closeProfileDialog
} = createProfileDialogModule({
  state,
  profileDialog,
  profileForm,
  profilePhotoFile,
  profilePhotoTrigger,
  getEditableProfile,
  setProfileDraft: (value) => { profileDraft = value; },
  updateProfileDraftFromForm,
  applyPhotoPreview,
  readFileAsDataUrl,
  persistAndRender,
  syncUserProfile,
  renderAccessTrees
});
const branchTreeModule = createBranchTreeModule({
  branchTree,
  branchNodeForm,
  ROOT_BRANCH_NODE,
  escapeHtml,
  getBranches,
  findBranch,
  describeBranchOrigin,
  getSelectedBranchCode: () => selectedBranchCode,
  setSelectedBranchCode: (value) => { selectedBranchCode = value; },
  renderBranchTreeRef: () => renderBranchTree(),
  renderBranchEditorRef: () => renderBranchEditor()
});
const dreTreeModule = createDreTreeModule({
  dreTree,
  dreNodeForm,
  ROOT_DRE_NODE,
  escapeHtml,
  getDreChildren,
  findDreNode,
  getNodeTone,
  describeOrigin,
  describeParent,
  getSelectedDreCode: () => selectedDreCode,
  setSelectedDreCode: (value) => { selectedDreCode = value; },
  getExpandedDreCodes: () => expandedDreCodes,
  setDragPayload: (value) => { dragPayload = value; },
  getDragPayload: () => dragPayload,
  handleDreDrop
});
const ccTreeModule = createCcTreeModule({
  ccTree,
  ccNodeForm,
  ROOT_CC_NODE,
  escapeHtml,
  getCcChildren,
  findCcNode,
  describeCcParent,
  getSelectedCcCode: () => selectedCcCode,
  setSelectedCcCode: (value) => { selectedCcCode = value; },
  getExpandedCcCodes: () => expandedCcCodes,
  setDragPayload: (value) => { dragPayload = value; },
  getDragPayload: () => dragPayload,
  handleCcDrop,
  getLinkedCostCenter: (code) => state.costCenters.find((cc) => cc.number === code) || null
});
const actualsModule = createActualsModule({
  ACTUALS_IMPORT_UPSERT_CHUNK_SIZE,
  MAX_BROWSER_TEXT_IMPORT_BYTES,
  MAX_BROWSER_XLSX_BYTES,
  state,
  views,
  periodTrigger,
  getActiveView: () => activeView,
  getCurrentUser: () => currentUser,
  buildEmptyRow,
  buildPeriodDate,
  callSupabaseRpc,
  chunkArray,
  dateMatchesPeriod,
  deleteSupabaseRows,
  ensureReportsDataForYear,
  ensureSeedBranchesInSupabase,
  escapeHtml,
  fetchSupabaseRowsSafe,
  formatActualsFieldName,
  formatActualsStatus,
  formatAmountInput,
  formatDisplayDate,
  formatFileSize,
  formatMonthLabel,
  formatSyncError,
  getActualsStatusClass,
  invalidateReportsForYear,
  isActualsApplyTimeoutError,
  isSupabaseConfigured,
  normalizeBranchCode,
  normalizeCode,
  normalizeDateInput,
  normalizeHeaderName,
  openHeadcountFromCatalog,
  parseLocalizedAmount,
  persistAndRender,
  renderNavigation,
  resolveOrganizationId,
  setSyncStatus,
  upsertSupabaseRows,
  appConfirm
});
const {
  ensureViewShell: ensureActualsViewShell,
  renderCatalog: renderActualsCatalog,
  renderView: renderActualsView,
  ensureBatchRowsLoaded: ensureActualsBatchRowsLoaded,
  normalizeActualsBatch,
  getSelectedBatchId: getSelectedActualsBatchId,
  setSelectedBatchId: setSelectedActualsBatchId,
  getSelectedLoadType: getSelectedActualsLoadType,
  setSelectedLoadType: setSelectedActualsLoadType,
  syncBatchSelection: syncActualsBatchSelection
} = actualsModule;

function parseDelimitedText(text) {
  const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const separator = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(separator).map((item) => item.trim());
  return lines.slice(1).map((line) => {
    const parts = line.split(separator);
    return headers.reduce((accumulator, header, index) => {
      accumulator[header] = parts[index] ?? "";
      return accumulator;
    }, {});
  });
}

function createBudgetModuleFallback() {
  let selectedBatchId = null;
  let selectedLoadType = null;
  function ensureViewShell() {
    const view = views.budgetLoad;
    if (!view) return;
    if (view.querySelector("#budget-catalog")) return;

    view.innerHTML = `
      <div id="budget-catalog" class="actuals-catalog">
        <div class="load-catalog-header"><h2 class="load-catalog-title">Carga de Planejado</h2></div>
        <div class="load-catalog-grid">
          <button class="load-catalog-card load-catalog-card--blue load-catalog-card--soon" type="button" disabled>
            <span class="lcc-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v18H3z"/><path d="M3 9h18M9 21V9"/></svg>
            </span>
            <strong>DRE</strong>
          </button>
          <button class="load-catalog-card load-catalog-card--purple load-catalog-card--soon" type="button" disabled>
            <span class="lcc-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            </span>
            <strong>Balanço Patrimonial</strong>
          </button>
          <button class="load-catalog-card load-catalog-card--cyan load-catalog-card--soon" type="button" disabled>
            <span class="lcc-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </span>
            <strong>Fluxo de Caixa</strong>
          </button>
          <button class="load-catalog-card load-catalog-card--amber load-catalog-card--soon" type="button" disabled>
            <span class="lcc-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.4 5.6A1 1 0 0 0 6.6 20H19"/><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/></svg>
            </span>
            <strong>Volumes de Vendas</strong>
          </button>
          <button class="load-catalog-card load-catalog-card--green load-catalog-card--soon" type="button" disabled>
            <span class="lcc-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </span>
            <strong>Headcount</strong>
          </button>
        </div>
      </div>
    `;
  }

  return {
    ensureViewShell,
    renderCatalog() {
      ensureViewShell();
      if (viewTitle && activeView === "budgetLoad") {
        viewTitle.textContent = "Carga de planejado";
      }
    },
    renderView() {},
    async ensureBatchRowsLoaded() {},
    normalizeBudgetBatch(row) {
      return {
        id: row?.id,
        referenceYear: Number(row?.referenceYear ?? row?.reference_year ?? state.currentPeriod.year),
        referenceMonth: Number(row?.referenceMonth ?? row?.reference_month ?? state.currentPeriod.month),
        loadMode: row?.loadMode ?? row?.load_mode ?? "additional",
        sourceType: row?.sourceType ?? row?.source_type ?? "file",
        sourceFileName: row?.sourceFileName ?? row?.source_file_name ?? "",
        status: row?.status || "draft",
        totalRows: Number(row?.totalRows ?? row?.total_rows ?? 0),
        errorRows: Number(row?.errorRows ?? row?.error_rows ?? 0),
        validRows: Number(row?.validRows ?? row?.valid_rows ?? 0),
        uploadedAt: row?.uploadedAt ?? row?.uploaded_at ?? "",
        appliedAt: row?.appliedAt ?? row?.applied_at ?? ""
      };
    },
    getSelectedBatchId() { return selectedBatchId; },
    setSelectedBatchId(value) { selectedBatchId = value || null; },
    getSelectedLoadType() { return selectedLoadType; },
    setSelectedLoadType(value) { selectedLoadType = value || null; },
    syncBatchSelection() {
      if (!selectedBatchId || !state.budgetBatches.some((batch) => batch.id === selectedBatchId)) {
        selectedBatchId = state.budgetBatches[0]?.id || null;
      }
    },
    getCurrentPeriodBatches() {
      state.budgetBatches = Array.isArray(state.budgetBatches) ? state.budgetBatches : [];
      const year = Number(state.currentPeriod?.year || 2026);
      const month = Number(state.currentPeriod?.month || 1);
      return state.budgetBatches.filter((batch) =>
        Number(batch.referenceYear) === year && Number(batch.referenceMonth) === month
      );
    }
  };
}

let budgetModule;
try {
  if (typeof createBudgetModule !== "function") {
    throw new Error("Modulo de budget indisponivel");
  }
  budgetModule = createBudgetModule({
    ACTUALS_IMPORT_UPSERT_CHUNK_SIZE,
    MAX_BROWSER_TEXT_IMPORT_BYTES,
    MAX_BROWSER_XLSX_BYTES,
    state,
    views,
    periodTrigger,
    getActiveView: () => activeView,
    getCurrentUser: () => currentUser,
    buildEmptyRow,
    chunkArray,
    ensureBudgetReportsDataForYear,
    ensureSeedBranchesInSupabase,
    escapeHtml,
    fetchSupabaseRowsSafe,
    formatActualsFieldName,
    formatActualsStatus,
    formatAmountInput,
    formatFileSize,
    formatMonthLabel,
    formatSyncError,
    getActualsStatusClass,
    invalidateBudgetReportsForYear,
    isSupabaseConfigured,
    normalizeBranchCode,
    normalizeCode,
    normalizeHeaderName,
    openHeadcountFromCatalog,
    parseDelimitedText,
    parseLocalizedAmount,
    persistAndRender,
    resolveOrganizationId,
    setSyncStatus,
    upsertSupabaseRows,
    deleteSupabaseRows,
    callSupabaseRpc,
    appConfirm
  });
} catch (error) {
  console.error("Falha ao inicializar modulo de budget", error);
  budgetModule = createBudgetModuleFallback();
}
const {
  ensureViewShell: ensureBudgetViewShell,
  renderCatalog: renderBudgetCatalog,
  renderView: renderBudgetView,
  ensureBatchRowsLoaded: ensureBudgetBatchRowsLoaded,
  normalizeBudgetBatch,
  getSelectedBatchId: getSelectedBudgetBatchId,
  setSelectedBatchId: setSelectedBudgetBatchId,
  getSelectedLoadType: getSelectedBudgetLoadType,
  setSelectedLoadType: setSelectedBudgetLoadType,
  syncBatchSelection: syncBudgetBatchSelection,
  getCurrentPeriodBatches: getCurrentPeriodBudgetBatches
} = budgetModule;
const navigationModule = createNavigationModule({
  VIEW_HEADER_METADATA,
  MONTH_LABELS,
  menuButtons,
  submenuButtons,
  paramsToggle,
  views,
  periodTriggerLabel,
  periodYearLabel,
  periodMonthGrid,
  periodPopover,
  periodTrigger,
  getActiveView: () => activeView,
  getSelectedReportId: () => selectedReportId,
  getState: () => state,
  getPeriodPickerYear: () => periodPickerYear,
  setCurrentPeriod: (value) => { state.currentPeriod = value; },
  ensureReportsDataForYear,
  ensureBudgetReportsDataForYear,
  ensureDashboardData,
  formatMonthLabel,
  persistAndRender,
  getOpexHideZeros: () => opexHideZeros,
  setOpexHideZeros: (value) => { opexHideZeros = value; },
  isAdmin,
  canAccessDashboard,
  canManageUsers
});
const headerModule = createHeaderModule({
  escapeHtml,
  closePeriodPicker,
  formatMonthLabel,
  ensureActualsViewShell,
  renderActualsCatalog,
  ensureActualsBatchRowsLoaded,
  getSelectedActualsBatchId,
  renderActualsView,
  ensureBudgetViewShell,
  renderBudgetCatalog,
  ensureBudgetBatchRowsLoaded,
  getSelectedBudgetBatchId,
  renderBudgetView,
  ensureHeadcountViewShell,
  renderHeadcountCatalog,
  ensureHeadcountBatchRowsLoaded,
  renderHeadcountView,
  renderNavigation,
  getRenderDashboard: () => renderDashboard,
  renderReportsView,
  renderBranchTree,
  renderBranchEditor,
  renderDreTree,
  renderDreEditor,
  renderCcTree,
  renderCcEditor,
  getCurrentPeriodHcBatches,
  getState: () => state,
  getActiveView: () => activeView,
  setActiveView: (value) => { activeView = value; },
  getSelectedReportId: () => selectedReportId,
  setSelectedReportId: (value) => { selectedReportId = value; },
  setSelectedActualsLoadType,
  setSelectedBudgetLoadType,
  setSelectedDreCode: (value) => { selectedDreCode = value; },
  addExpandedDreCode: (value) => { expandedDreCodes.add(value); },
  setSelectedCcCode: (value) => { selectedCcCode = value; },
  addExpandedCcCode: (value) => { expandedCcCodes.add(value); },
  getSelectedHeadcountLoadType: () => selectedHeadcountLoadType,
  setSelectedHeadcountLoadType: (value) => { selectedHeadcountLoadType = value; },
  setHeadcountReturnView: (value) => { headcountReturnView = value; },
  setSelectedHeadcountBatchId: (value) => { selectedHeadcountBatchId = value; }
});
const { loadAndRenderUsers, bindUsersInviteButton } = createUsersModule({
  escapeHtml,
  state,
  resolveOrganizationId,
  fetchSupabaseRowsSafe,
  upsertSupabaseRows,
  deleteSupabaseRows,
  fetchSupabaseRpc: () => Promise.resolve(),
  callEdgeFunction,
  isSuperAdmin,
  isAdmin,
  getUserManagement,
  getReportTitles: () => REPORT_TITLES
});
const { loadAndRenderManagements, bindManagementsAddButton } = createManagementsModule({
  escapeHtml,
  state,
  resolveOrganizationId,
  fetchSupabaseRowsSafe,
  upsertSupabaseRows,
  deleteSupabaseRows,
  isAdmin,
  appAlert,
  appConfirm
});
const shellEventsModule = createShellEventsModule({
  appLayout,
  sidebar,
  profileTrigger,
  paramsToggle,
  paramsSubmenu,
  menuButtons,
  submenuButtons,
  periodTrigger,
  periodPopover,
  closePeriodPicker,
  openProfileDialog,
  renderNavigation,
  renderReportsView,
  renderPeriodPicker,
  ensureActualsViewShell,
  renderActualsCatalog,
  ensureActualsBatchRowsLoaded,
  getSelectedActualsBatchId,
  renderActualsView,
  ensureBudgetViewShell,
  renderBudgetCatalog,
  ensureBudgetBatchRowsLoaded,
  getSelectedBudgetBatchId,
  renderBudgetView,
  ensureHeadcountViewShell,
  renderHeadcountCatalog,
  ensureHeadcountBatchRowsLoaded,
  renderHeadcountView,
  getSelectedHeadcountBatchId: () => selectedHeadcountBatchId,
  getState: () => state,
  getPeriodPickerYear: () => periodPickerYear,
  setPeriodPickerYear: (value) => { periodPickerYear = value; },
  getActiveView: () => activeView,
  setActiveView: (value) => { activeView = value; },
  setSelectedReportId: (value) => { selectedReportId = value; },
  setSelectedBudgetLoadType,
  setSelectedActualsLoadType,
  loadAndRenderUsers,
  loadAndRenderManagements,
  bindManagementsAddButton
});
const editorEventsModule = createEditorEventsModule({
  dreNodeForm,
  ccNodeForm,
  branchNodeForm,
  appAlert,
  normalizeBranchCode,
  normalizeCostCenterManagement,
  generateBranchDraftCode,
  generateDraftCode,
  generateCcDraftCode,
  getCcTypeNodeCode,
  findDreNode,
  findCcNode,
  findBranch,
  collectChildCodes,
  persistAndRender,
  syncBranch,
  syncDeleteBranch,
  syncDreNodeAndAccount,
  syncDeleteDreNode,
  syncCcNodeAndCostCenter,
  syncDeleteCcNode,
  getState: () => state,
  getSelectedBranchCode: () => selectedBranchCode,
  setSelectedBranchCode: (value) => { selectedBranchCode = value; },
  getSelectedDreCode: () => selectedDreCode,
  setSelectedDreCode: (value) => { selectedDreCode = value; },
  addExpandedDreCode: (value) => { if (value) expandedDreCodes.add(value); },
  removeExpandedDreCode: (value) => { expandedDreCodes.delete(value); },
  hasExpandedDreCode: (value) => expandedDreCodes.has(value),
  getSelectedCcCode: () => selectedCcCode,
  setSelectedCcCode: (value) => { selectedCcCode = value; },
  addExpandedCcCode: (value) => { if (value) expandedCcCodes.add(value); },
  removeExpandedCcCode: (value) => { expandedCcCodes.delete(value); },
  hasExpandedCcCode: (value) => expandedCcCodes.has(value)
});
const {
  renderDashComboChart,
  renderDashAlerts
} = createDashboardVisualsModule({
  MONTH_LABELS,
  escapeHtml,
  formatSignedCurrency,
  state
});
const {
  buildReportsSummaryMarkup,
  syncReportFavoriteButtons
} = createReportsHelpersModule({
  escapeHtml,
  formatMonthLabel,
  formatSignedCurrency,
  getCurrentPeriodMonth: () => state.currentPeriod?.month,
  getReportsLastLoadedYear: () => reportsLastLoadedYear,
  getReportsLastLoadedAt: () => reportsLastLoadedAt
});
const reportsDreModule = createReportsDreModule({
  escapeHtml,
  getCurrentYear: () => Number(state.currentPeriod?.year || 2026),
  getReportsLoadingYear: () => reportsLoadingYear,
  getReportsErrorMessage: () => reportsErrorMessage,
  getBudgetReportsLoadingYear: () => budgetReportsLoadingYear,
  getBudgetReportsErrorMessage: () => budgetReportsErrorMessage,
  reportsLedgerCache,
  reportsBudgetCache,
  buildDreGerRealReport,
  buildDreGerRealTableMarkup,
  buildDreSocRealReport,
  buildDreSocRealTableMarkup,
  buildDreDfsRealReport,
  buildDreDfsRealTableMarkup,
  initAllReportTableResizers,
  initDreGerDrilldown,
  initDreSocDrilldown
});
const { createReportsOpexModule } = window.VECTON_REPORTS_OPEX;
const reportsOpexModule = createReportsOpexModule({
  state,
  escapeHtml,
  normalizeCode,
  getSelectedReportId: () => selectedReportId,
  getOpexHideZeros: () => opexHideZeros,
  setOpexHideZeros: (value) => { opexHideZeros = value; },
  reportsLedgerCache,
  getOpexStructure: () => OPEX_STRUCTURE,
  buildOpexCostCenterFilter,
  matchesOpexCostCenterFilter,
  buildOpexRealTableMarkup,
  initOpexDrilldown,
  initAllReportTableResizers,
  fetchActualsLedgerWithCcForYear,
  fetchActualsLedgerForManagementYear,
  renderReportsView,
  renderOpexBudgetReport,
  resolveManagementFilter
});
const { createReportsHeadcountModule } = window.VECTON_REPORTS_HEADCOUNT;
const reportsHeadcountModule = createReportsHeadcountModule({
  renderHcReport
});
const headcountRenderModule = createHeadcountRenderModule({
  escapeHtml,
  formatMonthLabel,
  formatActualsStatus,
  getActualsStatusClass,
  buildEmptyRow,
  HEADCOUNT_ROWS_PER_PAGE,
  getState: () => state,
  getActiveView: () => activeView,
  getSelectedHeadcountLoadType: () => selectedHeadcountLoadType,
  getSelectedHcBatch,
  getSelectedHcRows,
  getLoadingHeadcountBatchIds: () => loadingHeadcountBatchIds,
  getHeadcountRowsFilter: () => headcountRowsFilter,
  getHeadcountRowsPage: () => headcountRowsPage,
  setHeadcountRowsPage: (value) => { headcountRowsPage = value; },
  getActiveHcErrorRowId: () => activeHcErrorRowId,
  renderHcRowsTableRef: () => renderHcRowsTable()
});
const { renderDashOpexCards } = createDashboardCardsModule({
  MONTH_LABELS,
  HC_PESSOAL_ACCOUNTS,
  getOpexStructure: () => OPEX_STRUCTURE,
  escapeHtml,
  normalizeCode,
  state,
  reportsLedgerCache,
  reportsBudgetCache,
  hcDashCache,
  isSupabaseConfigured,
  resolveOrganizationId,
  fetchSupabaseRowsSafe,
  fetchActualsLedgerWithCcForYear,
  fetchActualsLedgerForCcIds,
  getAllowedManagements,
  buildOpexCostCenterFilter,
  matchesOpexCostCenterFilter,
  renderNavigation,
  renderReportsView,
  setActiveView: (value) => { activeView = value; },
  setSelectedReportId: (value) => { selectedReportId = value; },
  callSupabaseRpc
});
const { renderDashboard } = createDashboardModule({
  MONTH_LABELS,
  escapeHtml,
  formatMonthLabel,
  buildDreGerRealReport,
  reportsLedgerCache,
  reportsBudgetCache,
  state,
  getActiveView: () => activeView,
  setActiveView: (value) => { activeView = value; },
  setSelectedReportId: (value) => { selectedReportId = value; },
  renderNavigation,
  ensureReportsDataForYear,
  renderReportsView,
  renderDashComboChart,
  renderDashAlerts,
  renderDashOpexCards
});
const renderModule = createRenderModule({
  getActiveView: () => activeView,
  renderUserProfile,
  renderStats,
  renderNavigation,
  renderPeriodSummary,
  renderProfileEditor,
  renderReportsView,
  renderBranchTree,
  renderBranchEditor,
  renderDreTree,
  renderDreEditor,
  renderCcTree,
  renderCcEditor,
  ensureActualsViewShell,
  renderActualsCatalog,
  renderActualsView,
  ensureBudgetViewShell,
  renderBudgetCatalog,
  renderBudgetView,
  ensureHeadcountViewShell,
  renderHeadcountCatalog,
  renderHeadcountView,
  renderDashboard
});

bootstrap();

async function bootstrap() {
  bindEvents();
  await initializeAuth();
  try {
    configureMainHeader();
    setupHeaderSearch();
    render();
    renderPeriodPicker();
    startMarketTicker();
    setupHeaderSearch();
    void ensureDashboardData();
  } catch (error) {
    console.error("Falha na inicializacao da interface", error);
    setSyncStatus("Interface carregada com restricoes", "warn");
  }
}

function configureMainHeader() {
  return headerModule.configureMainHeader();
}

function setupHeaderSearch() {
  return headerModule.setupHeaderSearch();
}

function bindEvents() {
  loginForm.addEventListener("submit", handleLoginSubmit);
  logoutButton.addEventListener("click", handleLogout);

  // Olhinho: mostrar/ocultar senha no login
  const pwInput = document.querySelector("#login-password");
  const pwToggle = document.querySelector("#login-password-toggle");
  if (pwInput && pwToggle) {
    pwToggle.addEventListener("click", () => {
      const show = pwInput.type === "password";
      pwInput.type = show ? "text" : "password";
      pwToggle.classList.toggle("active", show);
      pwToggle.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
      pwToggle.title = show ? "Ocultar senha" : "Mostrar senha";
      pwInput.focus();
    });
  }

  shellEventsModule.bindShellEvents();
  setupWorkspaceResizer(branchWorkspace, branchResizer, "--branch-left-width");
  setupDreResizer();
  setupWorkspaceResizer(ccWorkspace, ccResizer, "--cc-left-width");
  editorEventsModule.bindEditorEvents();

  bindProfileEvents();
  initReportsDragDrop();
  bindUsersInviteButton();

  // ── handlers do dialog de perfil ──────────────────────────────────
}

// ── Labels customizáveis dos cards de relatório ───────────────────────────
function reportLabelsKey() {
  return `vp_report_labels_${currentUser?.id || "anon"}`;
}

function loadReportLabels() {
  try { return JSON.parse(localStorage.getItem(reportLabelsKey()) || "{}"); } catch { return {}; }
}

function saveReportLabel(id, label, subtitle) {
  const labels = loadReportLabels();
  labels[id] = { label, subtitle };
  try { localStorage.setItem(reportLabelsKey(), JSON.stringify(labels)); } catch {}
}

function applyReportLabels() {
  const labels = loadReportLabels();
  document.querySelectorAll(".reports-report-card[data-report-id]").forEach(card => {
    const id = card.dataset.reportId;
    const data = labels[id];
    const labelEl = card.querySelector(".rrc-label");
    const subtitleEl = card.querySelector(".rrc-subtitle");
    if (data?.label && labelEl) labelEl.textContent = data.label;
    if (subtitleEl) subtitleEl.textContent = data?.subtitle || "";
  });
}

// Esconde os cards de relatório que o perfil do usuário não pode ver.
// Admin/super_admin: canSeeReport sempre true → nada muda.
function applyReportAccess() {
  document.querySelectorAll(".reports-report-card[data-report-id]").forEach((card) => {
    card.style.display = canSeeReport(card.dataset.reportId) ? "" : "none";
  });
}

function initReportCardEdit() {
  if (!isAdmin()) {
    document.querySelectorAll(".rrc-edit-btn").forEach(el => el.remove());
    return;
  }
  document.body.classList.add("can-edit-reports");

  const grid = document.querySelector("#reports-card-grid");
  if (!grid) return;

  let openPopover = null;

  function closePopover() {
    if (openPopover) { openPopover.remove(); openPopover = null; }
  }

  function openEditPopover(editBtn) {
    const card = editBtn.closest(".reports-report-card");
    const id = card?.dataset.reportId;
    if (!id) return;

    if (openPopover) { closePopover(); return; }

    const labels = loadReportLabels();
    const current = labels[id] || {};
    const labelEl = card.querySelector(".rrc-label");
    const currentLabel = labelEl?.textContent || "";
    const currentSub = current.subtitle || "";

    const pop = document.createElement("div");
    pop.className = "rrc-edit-popover";
    pop.innerHTML = `
      <input class="rrc-edit-name" type="text" value="${currentLabel.replace(/"/g,'&quot;')}" placeholder="Nome do relatório" maxlength="60">
      <input class="rrc-edit-sub" type="text" value="${currentSub.replace(/"/g,'&quot;')}" placeholder="Subtítulo (opcional)" maxlength="80">
      <div class="rrc-edit-popover-actions">
        <button type="button" class="cancel">Cancelar</button>
        <button type="button" class="primary">Salvar</button>
      </div>
    `;
    // Append to body with fixed positioning so the grid's overflow:hidden can't clip it
    document.body.appendChild(pop);
    openPopover = pop;
    // Centralizado na tela.
    pop.style.position = "fixed";
    pop.style.top = "50%";
    pop.style.left = "50%";
    pop.style.right = "auto";
    pop.style.bottom = "auto";
    pop.style.transform = "translate(-50%, -50%)";
    pop.querySelector(".rrc-edit-name").focus();

    pop.querySelector(".cancel").addEventListener("click", e => { e.stopPropagation(); closePopover(); });
    pop.querySelector(".primary").addEventListener("click", e => {
      e.stopPropagation();
      const newLabel = pop.querySelector(".rrc-edit-name").value.trim();
      const newSub = pop.querySelector(".rrc-edit-sub").value.trim();
      if (newLabel) {
        if (labelEl) labelEl.textContent = newLabel;
        const subEl = card.querySelector(".rrc-subtitle");
        if (subEl) subEl.textContent = newSub;
        saveReportLabel(id, newLabel, newSub);
      }
      closePopover();
    });
    pop.querySelector(".rrc-edit-name").addEventListener("keydown", e => {
      if (e.key === "Enter") pop.querySelector(".primary").click();
      if (e.key === "Escape") closePopover();
    });
    pop.querySelector(".rrc-edit-sub").addEventListener("keydown", e => {
      if (e.key === "Enter") pop.querySelector(".primary").click();
      if (e.key === "Escape") closePopover();
    });
  }

  // Capture phase — intercepts before parent <button> and stops all other listeners on same click
  document.addEventListener("click", e => {
    const editBtn = e.target.closest(".rrc-edit-btn");
    if (editBtn && grid.contains(editBtn)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      openEditPopover(editBtn);
      return;
    }
    // Close popover when clicking anywhere outside it
    if (openPopover && !openPopover.contains(e.target)) closePopover();
  }, { capture: true });
}

function reportsOrderKey() {
  return `vp_reports_order_${currentUser?.id || "anon"}`;
}

function saveReportsOrder() {
  const grid = document.querySelector("#reports-card-grid");
  if (!grid) return;
  const order = [...grid.querySelectorAll(".reports-report-card[data-report-id]")]
    .map(el => el.dataset.reportId);
  try { localStorage.setItem(reportsOrderKey(), JSON.stringify(order)); } catch (_) {}
}

function restoreReportsOrder() {
  const grid = document.querySelector("#reports-card-grid");
  if (!grid) return;
  let saved;
  try { saved = JSON.parse(localStorage.getItem(reportsOrderKey()) || "null"); } catch (_) {}
  if (!Array.isArray(saved) || !saved.length) return;
  saved.forEach(id => {
    const el = grid.querySelector(`[data-report-id="${id}"]`);
    if (el) grid.appendChild(el);
  });
}

function initReportsDragDrop() {
  const grid = document.querySelector("#reports-card-grid");
  const reorderBtn = document.querySelector("#reports-reorder-btn");
  if (!grid) return;

  if (isAdmin() && reorderBtn) reorderBtn.style.display = "";

  let dragSrc = null;
  let reorderMode = false;

  function setReorderMode(on) {
    reorderMode = on;
    grid.querySelectorAll(".reports-report-card").forEach(c => {
      c.draggable = on;
      c.classList.toggle("rrc-reorder-mode", on);
    });
    if (reorderBtn) {
      reorderBtn.classList.toggle("active", on);
      reorderBtn.title = on ? "Concluir reorganização" : "Reorganizar cards";
    }
  }

  reorderBtn?.addEventListener("click", () => setReorderMode(!reorderMode));

  grid.addEventListener("dragstart", e => {
    if (!reorderMode) return;
    const card = e.target.closest(".reports-report-card");
    if (!card) return;
    dragSrc = card;
    card.classList.add("rrc-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", card.dataset.reportId);
  });

  grid.addEventListener("dragend", () => {
    grid.querySelectorAll(".reports-report-card").forEach(c =>
      c.classList.remove("rrc-dragging", "rrc-drag-over"));
    dragSrc = null;
  });

  grid.addEventListener("dragover", e => {
    if (!reorderMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const card = e.target.closest(".reports-report-card");
    if (!card || card === dragSrc) return;
    grid.querySelectorAll(".reports-report-card").forEach(c => c.classList.remove("rrc-drag-over"));
    card.classList.add("rrc-drag-over");
  });

  grid.addEventListener("dragleave", e => {
    e.target.closest(".reports-report-card")?.classList.remove("rrc-drag-over");
  });

  grid.addEventListener("drop", e => {
    if (!reorderMode) return;
    e.preventDefault();
    const target = e.target.closest(".reports-report-card");
    if (!target || !dragSrc || target === dragSrc) return;
    const cards = [...grid.querySelectorAll(".reports-report-card")];
    if (cards.indexOf(dragSrc) < cards.indexOf(target)) target.after(dragSrc);
    else target.before(dragSrc);
    grid.querySelectorAll(".reports-report-card").forEach(c => c.classList.remove("rrc-drag-over"));
    saveReportsOrder();
  });
}

function render() {
  return renderModule.render();
}

async function hydrateFromSupabase() {
  if (!isSupabaseConfigured()) {
    setSyncStatus("Modo local", "warn");
    return;
  }

  // Todo login/recarga inicia no Dashboard. O período é ajustado para o último
  // mês COM DADOS após carregar os batches (ver abaixo). O flash de perfil do
  // usuário anterior é evitado mantendo a tela de login coberta até o hydrate
  // terminar (ver handleLoginSubmit).
  activeView = "dashboard";
  selectedReportId = null;
  showAppLoading();

  try {
    setSyncStatus("Conectando ao BD...", "warn");
    const organizationId = await resolveOrganizationId();
    await ensureSeedBranchesInSupabase(organizationId);
    const [profileRows, branches, accounts, costCenters, dreNodes, ccNodes, actualsBatches, budgetBatches, hcBatches, managementRows] = await Promise.all([
      fetchSupabaseRowsSafe("user_profiles", `organization_id=eq.${organizationId}&user_id=eq.${currentUser.id}&select=full_name,email,phone,department,profile_label,access_role,management,matrix_accounts,extra_branch_ids,extra_cc_ids,extra_account_codes,extra_report_ids,extra_managements,photo_kind,photo_value&limit=1`),
      fetchSupabaseRowsSafe("branches", `organization_id=eq.${organizationId}&select=id,branch_code,branch_name,note,origin&order=branch_code.asc`),
      fetchSupabaseRows("accounts", `organization_id=eq.${organizationId}&select=id,registration_control,account_number,account_name`),
      fetchSupabaseRows("cost_centers", `organization_id=eq.${organizationId}&select=id,cost_center_number,cost_center_name,cost_center_type,cost_center_management`),
      fetchSupabaseRows("dre_plan_nodes", `organization_id=eq.${organizationId}&select=id,node_code,node_name,node_class,parent_node_id,sort_order,origin,note,account_id&order=sort_order.asc,node_code.asc`),
      fetchSupabaseRows("cc_plan_nodes", `organization_id=eq.${organizationId}&select=id,node_code,node_name,node_class,node_type,parent_node_id,sort_order,origin,note,cost_center_id&order=sort_order.asc,node_code.asc`),
      fetchSupabaseRowsSafe("actuals_import_batches", `organization_id=eq.${organizationId}&select=id,reference_year,reference_month,load_mode,source_type,source_file_name,status,total_rows,error_rows,valid_rows,uploaded_at,applied_at&order=uploaded_at.desc`),
      fetchSupabaseRowsSafe("budget_import_batches", `organization_id=eq.${organizationId}&select=id,reference_year,reference_month,load_mode,source_type,source_file_name,status,total_rows,error_rows,valid_rows,uploaded_at,applied_at&order=uploaded_at.desc`),
      fetchSupabaseRowsSafe("headcount_import_batches", `organization_id=eq.${organizationId}&select=id,reference_year,reference_month,load_mode,load_type,source_type,source_file_name,status,total_rows,error_rows,valid_rows,uploaded_at,applied_at&order=uploaded_at.desc`),
      fetchSupabaseRowsSafe("managements", `organization_id=eq.${organizationId}&order=sort_order.asc,name.asc`)
    ]);
    state.managements = managementRows || [];

    if (profileRows.length) {
      const profile = profileRows[0];
      state.profile = {
        ...state.profile,
        name: profile.full_name || state.profile.name || getUserDisplayName(),
        email: profile.email || state.profile.email || currentUser?.email || "",
        phone: profile.phone || "",
        department: profile.department || "",
        role: profile.profile_label || "Administrador",
        accessRole: profile.access_role || "admin",
        management: profile.management || null,
        matrixAccounts: profile.matrix_accounts || [],
        extraBranchIds: profile.extra_branch_ids || [],
        extraCcIds: profile.extra_cc_ids || [],
        extraAccountCodes: profile.extra_account_codes || [],
        extraReportIds: profile.extra_report_ids || [],
        extraManagements: profile.extra_managements || [],
        photoKind: profile.photo_kind || "none",
        photoValue: profile.photo_value || ""
      };
      profileDraft = { ...state.profile };
    } else {
      // Sem perfil no BD para o usuário autenticado: NÃO herdar o perfil em cache
      // de outro usuário (evita mostrar nome/email/acesso de quem logou antes).
      // Reseta para a identidade do usuário atual com acesso mínimo (analyst).
      state.profile = {
        ...state.profile,
        name: getUserDisplayName(),
        email: currentUser?.email || "",
        phone: "",
        department: "",
        role: "—",
        accessRole: "analyst",
        management: null,
        matrixAccounts: [],
        extraBranchIds: [],
        extraCcIds: [],
        extraAccountCodes: [],
        extraReportIds: [],
        photoKind: "none",
        photoValue: ""
      };
      profileDraft = { ...state.profile };
    }

    if (branches.length) {
      state.branches = branches.map((row) => ({
        id: row.id || crypto.randomUUID(),
        code: row.branch_code,
        name: row.branch_name,
        origin: row.origin || "manual",
        note: row.note || ""
      }));
      selectedBranchCode = state.branches[0]?.code || null;
    }

    if (accounts.length) {
      state.accounts = accounts.map((row) => ({
        id: row.id || crypto.randomUUID(),
        control: row.registration_control || "",
        number: row.account_number,
        name: row.account_name
      }));
    }

    if (costCenters.length) {
      state.costCenters = costCenters.map((row) => ({
        id: row.id || crypto.randomUUID(),
        number: row.cost_center_number,
        name: row.cost_center_name,
        type: row.cost_center_type,
        management: normalizeCostCenterManagement(row.cost_center_management, (state.managements || []).map(m => m.name))
      }));
    }

    if (dreNodes.length) {
      const dreParentMap = new Map(dreNodes.map((row) => [row.id, row.node_code]));
      state.dreNodes = dreNodes.map((row) => ({
        id: row.id || crypto.randomUUID(),
        code: row.node_code,
        name: row.node_name,
        class: row.node_class,
        parentCode: row.parent_node_id ? dreParentMap.get(row.parent_node_id) || null : null,
        origin: row.origin || "estrutura",
        note: row.note || ""
      }));
      expandedDreCodes = new Set(getDefaultExpandedCodes(state.dreNodes));
      selectedDreCode = state.dreNodes.find((node) => node.class === "Analitica")?.code || state.dreNodes[0]?.code || null;
    }

    if (ccNodes.length) {
      const ccParentMap = new Map(ccNodes.map((row) => [row.id, row.node_code]));
      state.ccNodes = ccNodes.map((row) => ({
        id: row.id || crypto.randomUUID(),
        code: row.node_code,
        name: row.node_name,
        class: row.node_class,
        parentCode: row.parent_node_id ? ccParentMap.get(row.parent_node_id) || null : null,
        type: row.node_type,
        origin: row.origin || "estrutura",
        note: row.note || ""
      }));
      expandedCcCodes = new Set(getDefaultExpandedCcCodes(state.ccNodes));
      selectedCcCode = state.ccNodes.find((node) => node.class === "Analitica")?.code || state.ccNodes[0]?.code || null;
    }

    state.actualsBatches = actualsBatches.map(normalizeActualsBatch);
    syncActualsBatchSelection();

    // Dashboard inicia no último mês COM DADOS (batch de realizado aplicado mais
    // recente). Sem dados aplicados → cai no mês de calendário atual.
    const appliedBatches = (state.actualsBatches || []).filter((b) => b.appliedAt);
    if (appliedBatches.length) {
      const latest = appliedBatches.reduce((a, b) => {
        const aKey = Number(a.referenceYear) * 100 + Number(a.referenceMonth);
        const bKey = Number(b.referenceYear) * 100 + Number(b.referenceMonth);
        return bKey > aKey ? b : a;
      });
      state.currentPeriod = { year: Number(latest.referenceYear), month: Number(latest.referenceMonth) };
    } else {
      const _now = new Date();
      state.currentPeriod = { year: _now.getFullYear(), month: _now.getMonth() + 1 };
    }
    state.actualsRowsByBatch = isSupabaseConfigured() ? {} : state.actualsRowsByBatch;
    state.budgetBatches = budgetBatches.map(normalizeBudgetBatch);
    syncBudgetBatchSelection();

    state.headcountBatches = hcBatches.map(normalizeHcBatch);
    if (!selectedHeadcountBatchId || !state.headcountBatches.some(b => b.id === selectedHeadcountBatchId)) {
      selectedHeadcountBatchId = state.headcountBatches[0]?.id || null;
    }
    state.budgetRowsByBatch = isSupabaseConfigured() ? {} : state.budgetRowsByBatch;

    hcDashCache.clear();
    reportsLedgerCache.clear();
    reportsErrorMessage = "";
    reportsLastLoadedYear = null;
    reportsLastLoadedAt = null;
    reportsBudgetCache.clear();
    budgetReportsErrorMessage = "";

    persistAndRender();
    restoreReportsOrder();
    applyReportLabels();
    applyReportAccess();
    initReportCardEdit();
    setSyncStatus("Banco de Dados Online", "ok");
    if (canManageUsers()) void loadAndRenderUsers();
  } catch (error) {
    console.error(error);
    if (String(error?.message || "").includes("Sessao")) {
      clearSessionState();
      showAuthShell("Sua sessao expirou. Entre novamente.", "error");
    }
    setSyncStatus(`Falha: ${formatSyncError(error)}`, "error");
  } finally {
    hideAppLoading();
  }
}

// Overlay de carregamento do app (blur + spinner). Cobre os dados enquanto o BD
// responde — usado na transição de login e em recargas, sem expor dados do
// usuário anterior nem deixar a tela parada parecendo travada.
function showAppLoading() {
  let el = document.querySelector("#app-loading-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "app-loading-overlay";
    el.innerHTML = `<div class="app-loading-box"><div class="app-loading-spinner"></div><span>Carregando seus dados...</span></div>`;
    document.body.appendChild(el);
  }
  el.classList.add("visible");
}

function hideAppLoading() {
  document.querySelector("#app-loading-overlay")?.classList.remove("visible");
}

function setupDreResizer() {
  setupWorkspaceResizer(dreWorkspace, dreResizer, "--dre-left-width");
}

function setupWorkspaceResizer(workspace, resizer, cssVarName) {
  if (!resizer || !workspace) {
    return;
  }

  resizer.addEventListener("mousedown", (event) => {
    if (window.innerWidth <= 1120) {
      return;
    }

    event.preventDefault();
    resizer.classList.add("is-dragging");

    const workspaceRect = workspace.getBoundingClientRect();
    const minLeft = 300;
    const minRight = 320;

    const onMove = (moveEvent) => {
      const rawLeft = moveEvent.clientX - workspaceRect.left;
      const clampedLeft = Math.max(minLeft, Math.min(rawLeft, workspaceRect.width - minRight - 10));
      workspace.style.setProperty(cssVarName, `${clampedLeft}px`);
      workspace.style.gridTemplateColumns = `${clampedLeft}px 10px minmax(${minRight}px, 1fr)`;
    };

    const onUp = () => {
      resizer.classList.remove("is-dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

function renderStats() {
  const accountsStat = document.querySelector("#stat-accounts");
  const costCentersStat = document.querySelector("#stat-cost-centers");
  if (accountsStat) {
    accountsStat.textContent = String(state.accounts.length);
  }
  if (costCentersStat) {
    costCentersStat.textContent = String(state.costCenters.length);
  }
}

// ── Helpers de permissão ──────────────────────────────────────────────────────
function getAccessRole() { return state.profile?.accessRole || "admin"; }
function isSuperAdmin()  { return getAccessRole() === "super_admin"; }
function isAdmin()       { return ["super_admin", "admin"].includes(getAccessRole()); }
function isManager()     { return getAccessRole() === "manager"; }
function isAnalyst()     { return getAccessRole() === "analyst"; }
function canAccessDashboard() { return !isAnalyst(); }
function canAccessParams()    { return isAdmin(); }
function canManageUsers()     { return isAdmin(); }
function getUserManagement()  { return state.profile?.management || null; }
function getMatrixAccounts()  { return state.profile?.matrixAccounts || []; }

// ── Controle de acesso por perfil (extra_* dos user_profiles) ───────────────
// Apenas Gestor/Analista são restritos; admin/super_admin enxergam tudo.
function isAccessRestricted()   { return ["manager", "analyst"].includes(getAccessRole()); }
function getExtraReportIds()    { return state.profile?.extraReportIds    || []; }
function getExtraCcIds()        { return state.profile?.extraCcIds         || []; }
function getExtraAccountCodes() { return state.profile?.extraAccountCodes  || []; }
function getExtraManagements()  { return state.profile?.extraManagements   || []; }
function getAllowedManagements() {
  if (!isAccessRestricted()) return null;
  return [getUserManagement(), ...getExtraManagements()].filter(Boolean);
}

// Relatórios "consolidados" da empresa (DREs). Analista NÃO vê; Gestor vê.
// Demais (OPEX, Headcount) são por área/CC e ficam limitados pela gestão no drill-down.
function isConsolidatedReport(reportId) {
  return String(reportId).startsWith("dre");
}

// Visibilidade do card no catálogo — modelo POR PAPEL (conforme tela Perfis de Acesso):
//  • admin/super_admin: tudo
//  • manager (Gestor): tudo (cockpit + DRE consolidado + drill-down da sua gestão)
//  • analyst (Analista): só os relatórios por CC (não vê DRE consolidado)
//  • extra_report_ids: concessão ADICIONAL (libera um relatório específico como exceção)
function canSeeReport(reportId) {
  const role = getAccessRole();
  if (role === "super_admin" || role === "admin") return true;
  if (getExtraReportIds().includes(reportId)) return true;
  if (role === "manager") return true;
  if (role === "analyst") return !isConsolidatedReport(reportId);
  return false;
}

// Pode ver a conta contábil? Restrito → só as marcadas em extra_account_codes.
function canSeeAccount(code) {
  if (!isAccessRestricted()) return true;
  return getExtraAccountCodes().includes(String(code));
}

// Conjunto de NÚMEROS de CC que o usuário pode ver, ou null = sem restrição.
// Base: CCs da própria gestão. Extras: extra_cc_ids (UUIDs) mapeados p/ número.
function getAllowedCcNumbers() {
  if (!isAccessRestricted()) return null;
  const mgmt = (getUserManagement() || "").trim();
  const extraMgmts = new Set(getExtraManagements().map(m => m.trim()));
  const extraIds = new Set((getExtraCcIds() || []).map(String));
  const allowed = new Set();
  (state.costCenters || []).forEach((cc) => {
    const ccMgmt = (cc.management || "").trim();
    const byMgmt = mgmt && ccMgmt === mgmt;
    const byExtraMgmt = extraMgmts.size > 0 && extraMgmts.has(ccMgmt);
    const byExtra = extraIds.has(String(cc.id));
    if (byMgmt || byExtraMgmt || byExtra) allowed.add(String(cc.number).trim());
  });
  return allowed;
}

// Retorna { selectedMgmt, locked, allowedMgmts } para uso nos filtros de gestão.
// allowedMgmts: array de gestões visíveis no dropdown quando o usuário tem extras;
// null significa sem restrição (admin) ou restrição total via locked.
function resolveManagementFilter(prevMgmt, mgmtOptions, allOption) {
  const userMgmt = getUserManagement();
  if (isManager() || isAnalyst()) {
    const extraMgmts = getExtraManagements();
    if (extraMgmts.length > 0 && userMgmt) {
      // Gestor com gestões extras: pode alternar entre as suas gestões no dropdown.
      const allowedMgmts = [userMgmt, ...extraMgmts];
      const selected = allowedMgmts.includes(prevMgmt) ? prevMgmt : userMgmt;
      return { selectedMgmt: selected, locked: false, allowedMgmts };
    }
    // Fail-closed: travado na própria gestão. Sentinela "__no_cc__" garante
    // que um perfil sem gestão não case com nenhum CC.
    return { selectedMgmt: userMgmt || "__no_cc__", locked: true, allowedMgmts: null };
  }
  const selectedMgmt = mgmtOptions.includes(prevMgmt) ? prevMgmt : allOption;
  return { selectedMgmt, locked: false, allowedMgmts: null };
}

// Gera as <option> do select de gestão, aplicando disabled quando locked
function buildMgmtSelectOptions(mgmtOptions, selectedMgmt, locked) {
  return mgmtOptions.map((m) => {
    const sel = m === selectedMgmt ? "selected" : "";
    const dis = locked && m !== selectedMgmt ? "disabled" : "";
    return `<option value="${escapeHtml(m)}" ${sel} ${dis}>${escapeHtml(m)}</option>`;
  }).join("");
}

// ── Dashboard dinâmico ────────────────────────────────────────────────────────

async function ensureDashboardData() {
  const year = Number(state.currentPeriod?.year || 2026);
  const needsReal = !reportsLedgerCache.has(year) && reportsLoadingYear !== year;
  const needsBudget = !reportsBudgetCache.has(year) && budgetReportsLoadingYear !== year;
  if (needsReal) void ensureReportsDataForYear(year).then(() => renderDashboard());
  if (needsBudget) void ensureBudgetReportsDataForYear(year).then(() => renderDashboard());
  renderDashboard();
}

function renderNavigation() {
  return navigationModule.renderNavigation();
}

function renderPeriodSummary() {
  return navigationModule.renderPeriodSummary();
}

function renderPeriodPicker() {
  return navigationModule.renderPeriodPicker();
}

function closePeriodPicker() {
  return navigationModule.closePeriodPicker();
}

function renderBranchTree() {
  return branchTreeModule.renderBranchTree();
}


// ── ÁRVORES DE ACESSO (somente leitura) ──────────────────────────────────────

function renderAccessTrees() {
  const container = document.querySelector("#profile-access-trees");
  if (!container) return;

  // ADM tem acesso total — no futuro, virá de tabela de permissões
  const isAdmin = (getResolvedProfile().role || "").toLowerCase().includes("admin");
  const accessReports = Object.entries(REPORT_TITLES).map(([id, name]) => ({ id, name }));

  const trees = [
    {
      id: "access-tree-branches",
      label: "Empresas",
      icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
      items: state.branches.map(b => ({ id: b.code, name: `${b.code} - ${b.name}` }))
    },
    {
      id: "access-tree-accounts",
      label: "Contas",
      icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
      items: state.accounts.map(a => ({ id: a.number, name: `${a.number} - ${a.name}` }))
    },
    {
      id: "access-tree-cc",
      label: "Centros de Custo",
      icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>`,
      items: state.costCenters.map(c => ({ id: c.number, name: `${c.number} - ${c.name}` }))
    },
    {
      id: "access-tree-reports",
      label: "Relatórios",
      icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
      items: accessReports.map(r => ({ id: r.id, name: r.name }))
    }
  ];

  container.innerHTML = "";

  trees.forEach(tree => {
    const section = document.createElement("div");
    section.className = "access-tree";
    section.id = tree.id;

    const header = document.createElement("button");
    header.type = "button";
    header.className = "access-tree-header";
    header.innerHTML = `
      <span class="access-tree-label">
        <span class="access-tree-icon">${tree.icon}</span>
        ${tree.label}
        <span class="access-tree-count">${tree.items.length}</span>
      </span>
      <svg class="access-tree-caret" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
    `;

    const body = document.createElement("div");
    body.className = "access-tree-body";

    if (tree.items.length === 0) {
      body.innerHTML = `<p class="access-tree-empty">Nenhum item cadastrado.</p>`;
    } else {
      const allRow = buildAccessRow("todos", "Todos", true, true);
      body.append(allRow);

      if (tree.id === "access-tree-cc") {
        // agrupa por gestão
        const grouped = {};
        state.costCenters.forEach(c => {
          const g = (c.management || "Sem gestão").trim();
          if (!grouped[g]) grouped[g] = [];
          grouped[g].push(c);
        });
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).forEach(([group, ccs]) => {
          const hdr = document.createElement("div");
          hdr.className = "ue-tree-subgroup-title";
          hdr.textContent = group;
          body.append(hdr);
          ccs.forEach(c => {
            const row = buildAccessRow(c.number, `${c.number} — ${c.name}`, isAdmin, false);
            row.style.paddingLeft = "20px";
            body.append(row);
          });
        });
      } else {
        tree.items.forEach(item => {
          body.append(buildAccessRow(item.id, item.name, isAdmin, false));
        });
      }
    }

    header.addEventListener("click", () => {
      const isOpen = section.classList.toggle("open");
      header.querySelector(".access-tree-caret").style.transform = isOpen ? "rotate(180deg)" : "";
    });

    section.append(header, body);
    container.append(section);
  });
}

function buildAccessRow(id, label, checked, isAll) {
  const row = document.createElement("div");
  row.className = "access-row" + (isAll ? " access-row-all" : "");

  const checkbox = document.createElement("span");
  checkbox.className = "access-checkbox" + (checked ? " access-checkbox-on" : "");
  checkbox.innerHTML = checked
    ? `<svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 5 9 10 3"/></svg>`
    : "";

  const text = document.createElement("span");
  text.className = "access-row-label";
  text.textContent = label;

  row.append(checkbox, text);
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────

function openHeadcountFromCatalog(loadType, returnView) {
  selectedHeadcountLoadType = loadType;
  headcountReturnView = returnView || null;
  const matchingBatch = getCurrentPeriodHcBatches(loadType)[0];
  selectedHeadcountBatchId = matchingBatch?.id || null;
  headcountRowsPage = 1;
  headcountRowsFilter = "";
  activeView = "headcountLoad";
  ensureHeadcountViewShell();
  renderHeadcountCatalog();
  renderHeadcountView();
  void ensureHeadcountBatchRowsLoaded(selectedHeadcountBatchId).then(() => {
    renderHeadcountView();
  });
  renderNavigation();
}
// ─── Headcount Realizado (relatório) ─────────────────────────────────────────
async function fetchHeadcountRealForYear(year) {
  const organizationId = await resolveOrganizationId();
  const pageSize = 1000;
  const rows = [];
  for (let month = 1; month <= 12; month += 1) {
    let offset = 0;
    while (true) {
      const page = await fetchSupabaseRowsSafe(
        "headcount_entries",
        `organization_id=eq.${organizationId}&reference_year=eq.${year}&reference_month=eq.${month}&load_type=eq.realizado&select=reference_month,cost_center_number,matricula,colab,cargo&order=id.asc&limit=${pageSize}&offset=${offset}`
      );
      rows.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
  }
  return rows;
}

// Fonte do custo (ledger com CC) do relatório de Headcount. Gestor/Analista
// buscam apenas os CCs permitidos no servidor; Admin busca tudo.
// Considera: gestão própria + gestões extras + CCs avulsos (extra_cc_ids).
function hcCostSource(year, isBudget) {
  if (isAccessRestricted()) {
    const allMgmts = getAllowedManagements();
    const mgmtFilter = buildOpexCostCenterFilter(allMgmts);
    const ccIds = new Set([...(mgmtFilter?.ids || [])]);
    (getExtraCcIds() || []).forEach(id => {
      if ((state.costCenters || []).some(cc => String(cc.id) === String(id))) ccIds.add(String(id));
    });
    if (!ccIds.size) {
      return {
        key: `${isBudget ? "budget" : "opex"}-cc-empty-${year}`,
        fetchFn: async () => []
      };
    }
    const mgmtKey = (allMgmts || []).join(",") || "__no_cc__";
    return {
      key: `${isBudget ? "budget" : "opex"}-cc-mgmt-${year}-${mgmtKey}`,
      fetchFn: () => (isBudget ? fetchBudgetLedgerForCcIds : fetchActualsLedgerForCcIds)(year, [...ccIds])
    };
  }
  return {
    key: `${isBudget ? "budget" : "opex"}-cc-${year}`,
    fetchFn: () => (isBudget ? fetchBudgetLedgerWithCcForYear : fetchActualsLedgerWithCcForYear)(year)
  };
}

async function ensureHcReportDataForYear(year) {
  const y = Number(year || state.currentPeriod?.year || 2026);
  const hcKey = `hc-real-${y}`;
  const { key: ccKey, fetchFn: ccFetch } = hcCostSource(y, false);
  if ((reportsLedgerCache.has(hcKey) && reportsLedgerCache.has(ccKey)) || hcReportLoadingYear === y) return;
  hcReportErrorMessage = "";
  hcReportLoadingYear = y;
  renderReportsView();
  try {
    const tasks = [];
    if (!reportsLedgerCache.has(hcKey)) {
      tasks.push(fetchHeadcountRealForYear(y).then((rows) => reportsLedgerCache.set(hcKey, { rows })));
    }
    if (!reportsLedgerCache.has(ccKey)) {
      tasks.push(ccFetch().then((rows) => reportsLedgerCache.set(ccKey, { rows })));
    }
    await Promise.all(tasks);
  } catch (error) {
    console.error(error);
    hcReportErrorMessage = String(error?.message || error || "Não foi possível carregar o Headcount Realizado.");
  } finally {
    hcReportLoadingYear = null;
    renderReportsView();
  }
}

function buildHcRealReport(year, hcRows, ledgerRows) {
  const ccAgg = new Map();
  const ensure = (cc) => {
    if (!ccAgg.has(cc)) ccAgg.set(cc, { heads: Array(12).fill(0), cost: Array(12).fill(0) });
    return ccAgg.get(cc);
  };
  for (const r of (hcRows || [])) {
    const cc = String(r.cost_center_number ?? r.costCenterNumber ?? "").trim();
    const mo = Number(r.reference_month ?? r.referenceMonth ?? 0);
    if (!cc || mo < 1 || mo > 12) continue;
    ensure(cc).heads[mo - 1] += 1;
  }
  for (const r of (ledgerRows || [])) {
    const code = normalizeCode(String(r.account_number ?? r.accountNumber ?? "").trim());
    if (!HC_PESSOAL_ACCOUNTS.has(code)) continue;
    const cc = String(r.cost_center_number ?? r.costCenterNumber ?? "").trim();
    const mo = Number(r.reference_month ?? r.referenceMonth ?? 0);
    const v = Number(r.amount);
    if (!cc || mo < 1 || mo > 12 || !Number.isFinite(v)) continue;
    ensure(cc).cost[mo - 1] += v;
  }
  const ccMeta = new Map(state.costCenters.map((c) => [String(c.number).trim(), c]));
  const mgmtMap = new Map();
  for (const [cc, agg] of ccAgg) {
    const meta = ccMeta.get(cc);
    const mgmt = ((meta?.management || "").trim()) || "Sem área";
    const name = meta?.name || cc;
    if (!mgmtMap.has(mgmt)) mgmtMap.set(mgmt, []);
    mgmtMap.get(mgmt).push({ number: cc, name, heads: agg.heads, cost: agg.cost });
  }
  const sections = [...mgmtMap.entries()].map(([mgmt, ccs]) => {
    ccs.sort((a, b) => String(a.number).localeCompare(String(b.number)));
    const heads = Array(12).fill(0), cost = Array(12).fill(0);
    for (const c of ccs) for (let i = 0; i < 12; i += 1) { heads[i] += c.heads[i]; cost[i] += c.cost[i]; }
    return { mgmt, ccs, heads, cost };
  }).sort((a, b) => b.heads.reduce((s, v) => s + v, 0) - a.heads.reduce((s, v) => s + v, 0));
  const totals = { heads: Array(12).fill(0), cost: Array(12).fill(0) };
  for (const sec of sections) for (let i = 0; i < 12; i += 1) { totals.heads[i] += sec.heads[i]; totals.cost[i] += sec.cost[i]; }
  return { sections, totals };
}

function hcFormatCell(mode, heads, cost) {
  if (mode === "custo") {
    if (!heads || heads <= 0) return "—";
    const cpc = Math.abs(Number(cost) || 0) / heads;
    if (!Number.isFinite(cpc) || cpc <= 0) return "—";
    return "R$ " + Math.round(cpc).toLocaleString("pt-BR");
  }
  return heads > 0 ? heads.toLocaleString("pt-BR") : "";
}

function buildHcRealTableMarkup(report, mode, expandedSet) {
  const R = '<span class="col-resizer" aria-hidden="true"></span>';
  const headCells = MONTH_LABELS.map((l) => `<th class="reports-value-cell">${escapeHtml(l)}${R}</th>`).join("");
  let body = "";
  const totCells = report.totals.heads
    .map((h, i) => `<td class="reports-value-cell reports-total-cell">${escapeHtml(hcFormatCell(mode, h, report.totals.cost[i]))}</td>`)
    .join("");
  body += `<tr class="is-synthetic hc-total-row"><td class="reports-label-cell reports-total-cell" style="--depth:0"><span>Marcher (total)</span></td>${totCells}</tr>`;
  for (const sec of report.sections) {
    const expanded = expandedSet.has(sec.mgmt);
    const cells = sec.heads
      .map((h, i) => `<td class="reports-value-cell">${escapeHtml(hcFormatCell(mode, h, sec.cost[i]))}</td>`)
      .join("");
    body += `<tr class="is-synthetic hc-mgmt-row" data-hc-mgmt="${escapeHtml(sec.mgmt)}"><td class="reports-label-cell" style="--depth:0"><span class="hc-caret">${expanded ? "▾" : "▸"}</span><span>${escapeHtml(sec.mgmt)}</span></td>${cells}</tr>`;
    if (expanded) {
      for (const cc of sec.ccs) {
        const cells2 = cc.heads.map((h, i) => {
          const txt = hcFormatCell(mode, h, cc.cost[i]);
          if (h > 0) {
            return `<td class="reports-value-cell hc-drillable" data-cc="${escapeHtml(cc.number)}" data-cc-name="${escapeHtml(cc.name)}" data-month="${i + 1}">${escapeHtml(txt)}</td>`;
          }
          return `<td class="reports-value-cell">${escapeHtml(txt)}</td>`;
        }).join("");
        body += `<tr class="is-analytic hc-cc-row"><td class="reports-label-cell" style="--depth:1"><span>${escapeHtml(cc.name)}</span> <span class="reports-code-cell">· ${escapeHtml(cc.number)}</span></td>${cells2}</tr>`;
      }
    }
  }
  return `<table class="reports-dre-table reports-hc-table" data-resizable-cols><thead><tr><th class="reports-label-cell">Gestão / Centro de custo${R}</th>${headCells}</tr></thead><tbody>${body}</tbody></table>`;
}

function initHcDrilldown(scopeEl, hcRows, year, mode, expandedSet) {
  if (!scopeEl) return;
  scopeEl.querySelectorAll(".hc-mgmt-row").forEach((row) => {
    row.addEventListener("click", () => {
      const mgmt = row.dataset.hcMgmt;
      if (expandedSet.has(mgmt)) expandedSet.delete(mgmt); else expandedSet.add(mgmt);
      renderReportsView();
    });
  });
  scopeEl.querySelectorAll(".hc-drillable").forEach((cell) => {
    cell.addEventListener("click", () => {
      const cc = cell.dataset.cc;
      const ccName = cell.dataset.ccName;
      const month = Number(cell.dataset.month);
      const colabs = (hcRows || []).filter((r) =>
        String(r.cost_center_number ?? r.costCenterNumber ?? "").trim() === cc &&
        Number(r.reference_month ?? r.referenceMonth ?? 0) === month
      );
      openHcCellPopover(cc, ccName, month, year, colabs);
    });
  });
}

function openHcCellPopover(ccNumber, ccName, month, year, colabs) {
  document.querySelectorAll(".hc-cell-popover-backdrop").forEach((el) => el.remove());
  const rows = (colabs || []).slice().sort((a, b) => String(a.colab || "").localeCompare(String(b.colab || ""), "pt-BR"));
  const head = `${escapeHtml(ccName)} — ${escapeHtml(formatMonthLabel(month))}/${year}`;
  const sub = `${rows.length} colaborador(es) · CC ${escapeHtml(ccNumber)}`;
  const bodyRows = rows.map((r) => `
      <tr>
        <td style="padding:6px 16px;color:var(--text-faint);white-space:nowrap;border-top:1px solid var(--line-soft)">${escapeHtml(String(r.matricula || ""))}</td>
        <td style="padding:6px 8px;border-top:1px solid var(--line-soft)">${escapeHtml(String(r.colab || ""))}</td>
        <td style="padding:6px 8px;color:var(--text-soft);border-top:1px solid var(--line-soft)">${escapeHtml(String(r.cargo || ""))}</td>
      </tr>`).join("") || `<tr><td colspan="3" style="padding:16px;color:var(--text-faint);text-align:center">Sem colaboradores neste mês.</td></tr>`;
  const backdrop = document.createElement("div");
  backdrop.className = "hc-cell-popover-backdrop";
  backdrop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:24px";
  backdrop.innerHTML = `
    <div class="hc-cell-popover" style="width:820px;max-width:94vw;max-height:80vh;overflow:auto;background:var(--bg-soft);border:1px solid var(--line);border-radius:14px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg-soft)">
        <div>
          <p style="margin:0;font-size:0.85rem;font-weight:500;color:var(--text)">${head}</p>
          <p style="margin:3px 0 0;font-size:0.68rem;color:var(--text-faint)">${sub}</p>
        </div>
        <button type="button" class="hc-popover-close" aria-label="Fechar" style="background:none;border:none;color:var(--text-faint);font-size:1.05rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.74rem;color:var(--text)">
        <thead><tr style="color:var(--text-faint)">
          <th style="text-align:left;padding:8px 16px;font-weight:500;width:18%">Mat.</th>
          <th style="text-align:left;padding:8px 8px;font-weight:500;width:46%">Colaborador</th>
          <th style="text-align:left;padding:8px 8px;font-weight:500;width:36%">Cargo</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;
  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector(".hc-popover-close")?.addEventListener("click", close);
  const esc = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } };
  document.addEventListener("keydown", esc);
  document.body.appendChild(backdrop);
}


async function fetchHeadcountBudgetForYear(year) {
  const organizationId = await resolveOrganizationId();
  const pageSize = 1000;
  const rows = [];
  for (let month = 1; month <= 12; month += 1) {
    let offset = 0;
    while (true) {
      const page = await fetchSupabaseRowsSafe(
        "headcount_entries",
        `organization_id=eq.${organizationId}&reference_year=eq.${year}&reference_month=eq.${month}&load_type=eq.orcado&select=reference_month,cost_center_number,matricula,colab,cargo&order=id.asc&limit=${pageSize}&offset=${offset}`
      );
      rows.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
  }
  return rows;
}

async function fetchBudgetLedgerWithCcForYear(year) {
  const organizationId = await resolveOrganizationId();
  const pageSize = 1000;
  const rows = [];
  for (let month = 1; month <= 12; month += 1) {
    let lastId = "00000000-0000-0000-0000-000000000000";
    while (true) {
      const page = await fetchSupabaseRowsSafe(
        "budget_ledger_entries",
        `organization_id=eq.${organizationId}&reference_year=eq.${year}&reference_month=eq.${month}&id=gt.${lastId}&select=id,account_number,cost_center_id,cost_center_number,amount,reference_month&order=id.asc&limit=${pageSize}`
      );
      rows.push(...page);
      if (page.length < pageSize) break;
      lastId = page[page.length - 1].id;
    }
  }
  return rows;
}

async function ensureHcBudgetReportDataForYear(year) {
  const y = Number(year || state.currentPeriod?.year || 2026);
  const hcKey = `hc-budget-${y}`;
  const { key: ccKey, fetchFn: ccFetch } = hcCostSource(y, true);
  if ((reportsLedgerCache.has(hcKey) && reportsLedgerCache.has(ccKey)) || hcBudgetReportLoadingYear === y) return;
  hcBudgetReportErrorMessage = "";
  hcBudgetReportLoadingYear = y;
  renderReportsView();
  try {
    const tasks = [];
    if (!reportsLedgerCache.has(hcKey)) {
      tasks.push(fetchHeadcountBudgetForYear(y).then((rows) => reportsLedgerCache.set(hcKey, { rows })));
    }
    if (!reportsLedgerCache.has(ccKey)) {
      // Custo planejado por CC é best-effort até o ledger de orçado expor cost_center_number
      tasks.push(
        ccFetch()
          .then((rows) => reportsLedgerCache.set(ccKey, { rows }))
          .catch(() => reportsLedgerCache.set(ccKey, { rows: [] }))
      );
    }
    await Promise.all(tasks);
  } catch (error) {
    console.error(error);
    hcBudgetReportErrorMessage = String(error?.message || error || "Não foi possível carregar o Headcount Planejado.");
  } finally {
    hcBudgetReportLoadingYear = null;
    renderReportsView();
  }
}

// Render compartilhado entre Headcount Realizado e Planejado
function renderHcReport(kind) {
  const detailPanel = document.querySelector("#reports-view .reports-table-card");
  if (!detailPanel) return;
  const year = Number(state.currentPeriod?.year || 2026);
  const mode = detailPanel.dataset.hcMode === "custo" ? "custo" : "quadro";
  const isBudget = kind === "budget";
  const hcKey = isBudget ? `hc-budget-${year}` : `hc-real-${year}`;
  const ccKey = hcCostSource(year, isBudget).key;
  const expandedSet = isBudget ? hcBudgetExpanded : hcReportExpanded;
  const errorMsg = isBudget ? hcBudgetReportErrorMessage : hcReportErrorMessage;
  const ensureFn = isBudget ? ensureHcBudgetReportDataForYear : ensureHcReportDataForYear;
  const periodoLabel = isBudget ? "planejado" : "realizado";

  const slot = document.querySelector("#opex-gestao-slot");
  if (slot) {
    slot.hidden = false;
    slot.innerHTML = `
      <div class="hc-mode-toggle" style="display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:0.72rem">
        <button type="button" data-hc-mode="quadro" style="padding:6px 13px;border:none;cursor:pointer;background:${mode === "quadro" ? "var(--blue-soft)" : "transparent"};color:${mode === "quadro" ? "var(--blue)" : "var(--text-faint)"}">Quadro</button>
        <button type="button" data-hc-mode="custo" style="padding:6px 13px;border:none;border-left:1px solid var(--line);cursor:pointer;background:${mode === "custo" ? "var(--blue-soft)" : "transparent"};color:${mode === "custo" ? "var(--blue)" : "var(--text-faint)"}">Custo/colab</button>
      </div>`;
    slot.querySelectorAll("[data-hc-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        detailPanel.dataset.hcMode = btn.dataset.hcMode;
        renderReportsView();
      });
    });
  }

  const hcCache = reportsLedgerCache.get(hcKey);
  const ccCache = reportsLedgerCache.get(ccKey);

  if (!hcCache || !ccCache) {
    detailPanel.innerHTML = `<div class="reports-table-wrap">${vpSkeletonTable(8, 12)}</div>`;
    void ensureFn(year);
    return;
  }
  if (errorMsg) {
    detailPanel.innerHTML = `<div class="reports-table-wrap"><div class="actuals-empty">${escapeHtml(errorMsg)}</div></div>`;
    return;
  }
  // Acesso por perfil: Gestor/Analista veem só os CCs da sua gestão (fail-closed:
  // sem CC → vazio). Filtra tanto o quadro (pessoas) quanto o custo na origem,
  // então a tabela E o drilldown saem restritos.
  const allowedCcs = getAllowedCcNumbers();
  const ccOf = (r) => String(r.cost_center_number ?? r.costCenterNumber ?? "").trim();
  const hcRows = allowedCcs ? (hcCache.rows || []).filter((r) => allowedCcs.has(ccOf(r))) : hcCache.rows;
  const ccRows = allowedCcs ? (ccCache.rows || []).filter((r) => allowedCcs.has(ccOf(r))) : ccCache.rows;

  const hcReport = buildHcRealReport(year, hcRows, ccRows);
  if (!hcReport.sections.length) {
    detailPanel.innerHTML = `<div class="reports-table-wrap"><div class="actuals-empty">Nenhum headcount ${periodoLabel} disponível para ${year}.</div></div>`;
    return;
  }
  detailPanel.innerHTML = `<div class="reports-table-wrap reports-hc-wrap">${buildHcRealTableMarkup(hcReport, mode, expandedSet)}</div>`;
  initAllReportTableResizers();
  initHcDrilldown(detailPanel, hcRows, year, mode, expandedSet);
}

const REPORT_TITLES = {
  dreSocReal:    "DRE Societário Realizado",
  dreGerReal:    "DRE Gerencial Realizado",
  dreDfsReal:    "DRE DFs Realizado",
  dreSocBudget:  "DRE Societário Budget",
  dreGerBudget:  "DRE Gerencial Budget",
  dreDfsBudget:  "DRE DFs Budget",
  opexReal:      "OPEX Realizado",
  opexBudget:    "OPEX Planejado",
  headcountReal: "Headcount Realizado",
  headcountBudget: "Headcount Planejado"
};

/*

  cardGrid.querySelectorAll("[data-report-id]").forEach((card) => {
    card.classList.toggle("active", card.dataset.reportId === selectedReportId);
  });

  // ── Favoritos ──────────────────────────────────────────────────────────────
  syncReportFavoriteButtons(cardGrid);

  if (!selectedReportId) {
    catalogCard.hidden = false;
    detailPanel.hidden = true;
    if (viewTitle && activeView === "reports") viewTitle.textContent = "Central de relatórios";
    detailPanel.innerHTML = `
      <div class="reports-detail-empty">
        <strong>Nenhum relatorio aberto</strong>
        <p>Selecione um dos cards acima para carregar a visualizacao correspondente.</p>
      </div>
    `;
    return;
  }

  catalogCard.hidden = true;
  detailPanel.hidden = false;
  if (viewTitle && activeView === "reports") viewTitle.textContent = REPORT_TITLES[selectedReportId] || "Relatório";

  if (reportsDreModule.renderSelectedDreReport(detailPanel, selectedReportId)) {
    return;
  }

  if (reportsOpexModule.renderSelectedOpexReport(detailPanel, selectedReportId)) {
    return;
  }

  if (reportsHeadcountModule.renderSelectedHeadcountReport(selectedReportId)) {
    return;
  }

  if (selectedReportId === "opexReal") {
    const year = Number(state.currentPeriod?.year || 2026);

    // ── Filtro Gestão
    const managements = [...new Set(
      state.costCenters
        .map((cc) => (cc.management || "").trim())
        .filter(Boolean)
    )].sort();
    const allOption = "Marcher";
    const baseMgmtOptions = [allOption, ...managements];
    const prevMgmt = detailPanel.dataset.opexMgmt || allOption;
    const { selectedMgmt, locked: mgmtLocked, allowedMgmts } = resolveManagementFilter(prevMgmt, baseMgmtOptions, allOption);
    const mgmtOptions = mgmtLocked ? [selectedMgmt] : (allowedMgmts || baseMgmtOptions);

    const validCcFilter = buildEffectiveOpexFilter(selectedMgmt);

    const header = `
      <div class="opex-filter-bar">
        <select class="opex-filter-select" id="opex-mgmt-select" ${mgmtLocked ? "disabled" : ""}>
          ${buildMgmtSelectOptions(mgmtOptions, selectedMgmt, mgmtLocked)}
        </select>
      </div>
    `;

    // Injeta filtro no slot do header global
    const opexSlot = document.querySelector("#opex-gestao-slot");
    if (opexSlot) {
      opexSlot.hidden = false;
      opexSlot.innerHTML = `
        <div class="opex-header-filter" style="display:flex;align-items:center;gap:10px">
          <select class="opex-filter-select" id="opex-mgmt-select-header" ${mgmtLocked ? "disabled" : ""}>
            ${buildMgmtSelectOptions(mgmtOptions, selectedMgmt, mgmtLocked)}
          </select>
          <button id="opex-hide-zeros-btn" type="button" style="
            height:32px;padding:0 12px;border-radius:8px;font-size:0.74rem;font-weight:500;
            border:1px solid ${opexHideZeros ? "var(--blue)" : "var(--line)"};
            background:${opexHideZeros ? "var(--blue-soft)" : "transparent"};
            color:${opexHideZeros ? "var(--blue)" : "var(--text-faint)"};
            cursor:pointer;white-space:nowrap;transition:all .15s
          ">Ocultar zeros</button>
        </div>
      `;
      const headerSel = opexSlot.querySelector("#opex-mgmt-select-header");
      if (headerSel) {
        headerSel.addEventListener("change", () => {
          detailPanel.dataset.opexMgmt = headerSel.value;
          if (headerSel.value !== allOption) {
            reportsLedgerCache.delete(`opex-mgmt-${year}-${headerSel.value}`);
          }
          renderReportsView();
        });
      }
      const hideZerosBtn = opexSlot.querySelector("#opex-hide-zeros-btn");
      if (hideZerosBtn) {
        hideZerosBtn.addEventListener("click", () => {
          opexHideZeros = !opexHideZeros;
          renderReportsView();
        });
      }
    }

    const ccCacheKey = `opex-cc-${year}`;

    // Para Marcher usa totals para a tabela (rápido), mas sempre garante o cache CC para drilldown
    if (selectedMgmt === allOption) {
      const cacheEntry = reportsLedgerCache.get(year);
      const rows = cacheEntry?.rows || [];
      const tableMarkup = buildOpexRealTableMarkup(rows, null, opexHideZeros);
      detailPanel.innerHTML = `<div class="opex-report-wrap reports-table-wrap"><div id="opex-table-inner">${tableMarkup}</div></div>`;
      const ccCached = reportsLedgerCache.get(ccCacheKey);
      if (ccCached) {
        const tableEl = detailPanel.querySelector(".reports-opex-table");
        if (tableEl) initOpexDrilldown(tableEl, ccCached.rows, null);
      } else {
        // Busca silenciosa em background para habilitar drilldown
        fetchActualsLedgerWithCcForYear(year).then((rows) => {
          reportsLedgerCache.set(ccCacheKey, { rows });
          if (selectedReportId === "opexReal") {
            const tableEl = detailPanel.querySelector(".reports-opex-table");
            if (tableEl) initOpexDrilldown(tableEl, rows, null);
          }
        }).catch(() => {});
      }
    } else {
      const effectiveCcIds = [...(validCcFilter?.ids || [])].filter(Boolean);
      const mgmtCacheKey = `opex-mgmt-${year}-${selectedMgmt}`;
      const cached = reportsLedgerCache.get(mgmtCacheKey);
      if (cached) {
        const tableMarkup = buildOpexRealTableMarkup(cached.rows, null, opexHideZeros);
        detailPanel.innerHTML = `<div class="opex-report-wrap reports-table-wrap"><div id="opex-table-inner">${tableMarkup}</div></div>`;
        const tableEl = detailPanel.querySelector(".reports-opex-table");
        if (tableEl) initOpexDrilldown(tableEl, cached.rows, null);
      } else {
        detailPanel.innerHTML = `<div class="opex-report-wrap reports-table-wrap"><div id="opex-table-inner">${vpSkeletonTable()}</div></div>`;
        fetchActualsLedgerForCcIds(year, effectiveCcIds).then((rows) => {
          reportsLedgerCache.set(mgmtCacheKey, { rows });
          if (selectedReportId === "opexReal" && detailPanel.dataset.opexMgmt === selectedMgmt) renderReportsView();
        }).catch(() => {
          if (selectedReportId === "opexReal") {
            detailPanel.querySelector("#opex-table-inner").innerHTML = `<div class="actuals-empty">Erro ao carregar dados com CC.</div>`;
          }
        });
        return;
      }
    }

    initAllReportTableResizers();
    return;
  }

  reportsDreModule.renderFallbackSocReal(detailPanel);
}
*/

// Gera o HTML de um skeleton em formato de tabela (cabeçalho + linhas com barras
// pulsantes). Usado nas áreas de relatório enquanto os dados carregam do Supabase.
function vpSkeletonTable(rows = 10, cols = 13) {
  const valBars = (n) =>
    Array.from({ length: n }, () => `<span class="vp-skel-bar vp-skel-bar--val"></span>`).join("");
  const head =
    `<div class="vp-skel-row vp-skel-row--head">` +
    `<span class="vp-skel-bar" style="width:46%"></span>` +
    valBars(cols) +
    `</div>`;
  const body = Array.from({ length: rows }, (_, i) => {
    const w = 28 + ((i * 17) % 46); // larguras variadas pra parecer orgânico
    return (
      `<div class="vp-skel-row">` +
      `<span class="vp-skel-bar" style="width:${w}%"></span>` +
      valBars(cols) +
      `</div>`
    );
  }).join("");
  return `<div class="vp-skeleton" aria-hidden="true">${head}${body}</div>`;
}
window.vpSkeletonTable = vpSkeletonTable;

// Pinta de vermelho-suave as células cujo valor é negativo (minus seguido de dígito).
// O placeholder vazio "-"/"—" não tem dígito, então não é colorido.
function colorizeNegativeCells(container) {
  if (!container) return;
  container.querySelectorAll(".reports-value-cell").forEach((cell) => {
    const txt = cell.textContent.trim();
    const isNeg = (txt.charAt(0) === "-" || txt.charAt(0) === "−" || txt.charAt(0) === "(") && /\d/.test(txt);
    cell.classList.toggle("val-neg", isNeg);
  });
}

function renderReportsView() {
  const cardGrid   = reportsCardGrid;
  const catalogCard = reportsCatalogCard;
  const detailPanel = reportsDetailPanel;
  if (!cardGrid || !catalogCard || !detailPanel) {
    return;
  }

  cardGrid.querySelectorAll("[data-report-id]").forEach((card) => {
    card.classList.toggle("active", card.dataset.reportId === selectedReportId);
  });

  syncReportFavoriteButtons(cardGrid);

  if (!selectedReportId) {
    catalogCard.hidden = false;
    detailPanel.hidden = true;
    if (viewTitle && activeView === "reports") {
      viewTitle.textContent = "Central de relatórios";
    }
    detailPanel.innerHTML = `
      <div class="reports-detail-empty">
        <strong>Nenhum relatorio aberto</strong>
        <p>Selecione um dos cards acima para carregar a visualizacao correspondente.</p>
      </div>
    `;
    return;
  }

  catalogCard.hidden = true;
  detailPanel.hidden = false;
  if (viewTitle && activeView === "reports") {
    viewTitle.textContent = REPORT_TITLES[selectedReportId] || "Relatório";
  }

  const rendered =
    reportsDreModule.renderSelectedDreReport(detailPanel, selectedReportId) ||
    reportsOpexModule.renderSelectedOpexReport(detailPanel, selectedReportId) ||
    reportsHeadcountModule.renderSelectedHeadcountReport(selectedReportId);

  if (!rendered) {
    reportsDreModule.renderFallbackSocReal(detailPanel);
  }

  colorizeNegativeCells(detailPanel);
}

function buildDreSocRealTableMarkup(report) {
  const R = '<span class="col-resizer" aria-hidden="true"></span>';
  const headerCells = MONTH_LABELS.map((label) => `<th>${escapeHtml(label)}${R}</th>`).join("");
  const bodyRows = report.rows.map((row) => {
    const isAnalytic = row.class !== "Sintetica";
    const valueCells = row.months.map((value, i) =>
      isAnalytic
        ? `<td class="reports-value-cell soc-drillable" data-account-code="${escapeHtml(row.code)}" data-month-idx="${i}">${escapeHtml(formatSignedCurrency(value))}</td>`
        : `<td class="reports-value-cell">${escapeHtml(formatSignedCurrency(value))}</td>`
    ).join("");
    return `
      <tr class="${row.class === "Sintetica" ? "is-synthetic" : "is-analytic"}">
        <td class="reports-code-cell">${escapeHtml(row.code)}</td>
        <td class="reports-label-cell soc-label-col" style="--depth:${row.depth}"><span>${escapeHtml(row.name)}</span></td>
        <td class="reports-class-cell">${escapeHtml(row.class)}</td>
        ${valueCells}
        <td class="reports-value-cell reports-total-cell">${escapeHtml(formatSignedCurrency(row.total))}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="reports-dre-table" data-resizable-cols>
      <colgroup>
        <col style="width:110px">
        <col style="width:340px">
        <col style="width:90px">
        ${MONTH_LABELS.map(() => '<col style="width:110px">').join("")}
        <col style="width:110px">
      </colgroup>
      <thead>
        <tr>
          <th>Cod Conta${R}</th>
          <th>Desc Moeda 1${R}</th>
          <th>Classe Conta${R}</th>
          ${headerCells}
          <th>Total${R}</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

function buildDreSocRealReport(year, ledgerRows = []) {
  const normalizedLedgerRows = ledgerRows.map((row) => ({
    code: normalizeCode(row.accountNumber ?? row.account_number),
    month: Number(row.referenceMonth ?? row.reference_month ?? extractMonthFromDate(row.entryDate ?? row.entry_date)),
    amount: Number(row.amount)
  })).filter((row) => row.code && row.month >= 1 && row.month <= 12 && Number.isFinite(row.amount));

  const rowByCode = new Map();

  const computeNode = (node, depth) => {
    const children = getDreChildren(node.code);
    const childRows = children.map((child) => computeNode(child, depth + 1));

    let months;
    if (node.code === "51401001") {
      months = sumMonthArrays(Array.from(rowByCode.values())
        .filter((item) => item.code !== "51401001" && item.class === "Analitica")
        .map((item) => item.months));
    } else if (node.class === "Sintetica") {
      months = sumMonthArrays(childRows.map((item) => item.months));
    } else if (node.code === "425001004") {
      months = zeroMonthArray();
    } else {
      months = zeroMonthArray();
      normalizedLedgerRows.forEach((row) => {
        if (row.code === node.code) {
          months[row.month - 1] += row.amount;
        }
      });
    }

    const reportRow = {
      code: node.code,
      name: node.name,
      class: node.class,
      depth,
      months,
      total: months.reduce((sum, value) => sum + value, 0)
    };
    rowByCode.set(node.code, reportRow);
    return reportRow;
  };

  const rootChildren = getDreChildren(ROOT_DRE_NODE.code);
  rootChildren.forEach((child) => computeNode(child, 0));
  const rows = [];
  const flattenNode = (node) => {
    const reportRow = rowByCode.get(node.code);
    if (reportRow) {
      rows.push(reportRow);
    }
    getDreChildren(node.code).forEach((child) => flattenNode(child));
  };
  rootChildren.forEach((child) => flattenNode(child));

  const resultRow = rows.find((row) => row.code === "51401001");
  const monthTotals = resultRow ? resultRow.months.slice() : zeroMonthArray();

  return {
    year: Number(year || state.currentPeriod?.year || 2026),
    rows,
    monthTotals,
    grandTotal: monthTotals.reduce((sum, value) => sum + value, 0)
  };
}

// ─── DRE GERENCIAL REAL ───────────────────────────────────────────────────────
// Mapeamento: cada linha do Gerencial = lista de contas analíticas do Societário
// Derivado das fórmulas da aba "DRE Ger Real" cruzadas com o mapeamento de linhas
// da aba "DRE Soc Real".
const DRE_GER_ACCOUNT_MAP = {
  receitaBruta: [
    "31101001","31101002","31101006","31101003","31101007","31101004","31101005",
    "31102001","31102002",
    "31103001","31103002","31103003","31103004"
  ],
  impostos: [
    "31203001","31203002","31203003","31203004","31203005","31203009","31203012"
  ],
  devolucoes: [
    "31201001","31201002","31201003","31201004"
  ],
  descontos: [
    "31202001","31202002","31202003","31202004"
  ],
  materiais: [
    "412010901"
  ],
  custosPessoal: [
    "4110300001001","4110300001002","4110300001003","4110300001004","4110300001005",
    "4110300001006","4110300001007","4110300001008","4110300001009","4110300001010",
    "4110300001011","4110300001012","4110300001013","4110300001014","4110300001015",
    "4110300001016","4110300001017","4110300001018","4110300001019","4110300001028",
    "4110300001020","4110300001029","4110300001031","4110300001030","4110300001021",
    "4110300001022","4110300001023","4110300001024","4110300001025","4110300001026",
    "4110300001027",
    "4110300002001","4110300002002","4110300002003","4110300002004","4110300002005",
    "4110300002006","4110300002007","4110300002008","4110300002009","4110300002010",
    "4110300002011","4110300002012","4110300002013","4110300002014","4110300002015",
    "4110300002016","4110300002017","4110300002018","4110300002019","4110300002020",
    "4110300002021","4110300002030","4110300002032","4110300002022","4110300002033",
    "4110300002031","4110300002023","4110300002024","4110300002025","4110300002026",
    "4110300002027","4110300002028","4110300002029",
    "4110300003001","4110300003002","4110300003003","4110300003004","4110300003005",
    "4110300003006","4110300003007","4110300003008","4110300003009","4110300003010",
    "4110300003011","4110300003012","4110300003013","4110300003014","4110300003015",
    "4110300003016","4110300003017","4110300003018","4110300003019","4110300003020",
    "4110300003021","4110300003022","4110300003023","4110300003024",
    "4110300004001","4110300004002","4110300004003","4110300004004","4110300004005",
    "4110300004006","4110300004007","4110300004008","4110300004009","4110300004010",
    "4110300004011","4110300004012","4110300004013","4110300004014","4110300004015",
    "4110300004016","4110300004017","4110300004018","4110300004019","4110300004020",
    "4110300004021","4110300004022",
    "411030002028","411030002029"
  ],
  demaisGGF: [
    "4110210101","4110210102","4110210103",
    "4110210201","4110210202","4110210203","4110210204",
    "4110210301","4110210302","4110210303","4110210304","4110210305","4110210306",
    "4110210401","4110210402","4110210403","4110210404","4110210405","4110210406",
    "4110210407","4110210408","4110210409","4110210410","4110210411","4110210412",
    "4110210413","4110210414","4110210415","4110210416","4110210417","4110210418",
    "4110210501","4110210502","4110210503","4110210504",
    "4110220301","4110220302","4110220303","4110220304","4110220305","4110220306",
    "4110220307",
    "4110220401",
    "4110220501","4110220502"
  ],
  custoAbsorcao: [
    "4110400001001",
    "4120100","4120101","4120102","4120103","4120104","4120105","4120106","4120107","4120108",
    "412010902","412010903"
  ],
  comissoes: [
    "42102001","42102002","42102003","42102004","42102005","42102006"
  ],
  demaisDespComerciais: [
    "42103001","42103002","42103003","42103004","42103005","42103006","42103007",
    "42103008","42103009","42103010","42103011",
    "42104001","42104002","42104003","42104004","42104005","42104006","42104007",
    "42104008","42104009","42104010","42104011","42104012",
    "42105001","42105002","42105003","42105004",
    "42106001","42106002","42106007","42106008","42106009","42106010","42106011","42106012","42106013",
    "42106014","42106015","42106016","42106017","42106018","42106019",
    "42107001","42107002",
    "42108001","42108002",
    "42109001","42109002","42109003","42109004","42109005","42109006",
    "42110001","42110002","42110003","42110004","42110005"
  ],
  despAdmin: [
    "42201000001031",
    "4220100001001","4220100001002","4220100001003","4220100001004","4220100001005",
    "4220100001006","4220100001007","4220100001008","4220100001009","4220100001010",
    "4220100001011","4220100001012","4220100001013","4220100001014","4220100001015",
    "4220100001016","4220100001017","4220100001018","4220100001019","4220100001020",
    "4220100001021","4220100001033","4220100001022","4220100001034","4220100001036",
    "4220100001035","4220100001023","4220100001024","4220100001025","4220100001026",
    "4220100001027","4220100001028","4220100001029","4220100001030","4220100001031",
    "4220100001032",
    "4220100002001","4220100002002","4220100002003","4220100002004","4220100002005",
    "4220100002006","4220100002007","4220100002008","4220100002009","4220100002010",
    "4220100002011","4220100002012","4220100002013","4220100002014","4220100002015",
    "4220100002016","4220100002017","4220100002018","4220100002019","4220100002020",
    "4220100002021","4220100002022",
    "4220100003001","4220100003002","4220100003003","4220100003004","4220100003005",
    "4220100003006","4220100003007","4220100003008","4220100003009","4220100003010",
    "4220100003011","4220100003012","4220100003013","4220100003014","4220100003015",
    "4220100003016","4220100003017","4220100003018","4220100003019","4220100003020",
    "4220100003021","4220100003022","4220100003023","4220100003024","4220100003025",
    "4220100003026","4220100003028","4220100003029","4220100003030","4220100003031",
    "4220100003032",
    "4220100004001","4220100004002","4220100004003","4220100004004","4220100004005",
    "4220100004006","4220100004007","4220100004008","4220100004009","4220100004010",
    "4220100004011","4220100004012","4220100004013","4220100004014","4220100004015",
    "4220100004016","4220100004017","4220100004018","4220100004019","4220100004020",
    "4220100004021","4220100004022",
    "4220100005001","4220100005002","4220100005003","4220100005004","4220100005005",
    "4220100005006","4220100005007","4220100005008","4220100005009","4220100005010",
    "4220100005011","4220100005012",
    "4220100006001","4220100006002","4220100006003","4220100006004","4220100006005",
    "4220100006006","4220100006007","4220100006008","4220100006009","4220100006010",
    "4220100006011","4220100006012",
    "42202001","42202002","42202003",
    "4220300010","42203001","42203002","42203003","42203004","42203005","42203006",
    "42203007","42203008","42203009",
    "4220400001","4220400002","4220400003","4220400004","4220400005","4220400006",
    "4220400008","4220400009","4220400012","4220400013","4220400015","4220400016",
    "4220400017","4220400018","4220400019","4220400020","4220400021","4220400022",
    "4220400023","4220400024","4220400025","4220400027",
    "42205001","42205002","42205003","42205004","42205005","42205006",
    "42207001","42207002",
    "42208001","42208002","42208003","42208004","42208005","42208006",
    "42209001","42209002","42209003","42209004","42209005","42209006","42209007",
    "42209008","42209009",
    "42210100001","42210100002","42210100003",
    "42210200001","42210200002","42210200003","42210200004","42210200005","42210200006",
    "42210200007","42210200008","42210200009","42210200010","42210200011","42210200012",
    "42210200014","42210200015","42210200016","42210200017","42210200018","42210200019",
    "42210200031","42210200020","42210200033","42210200034","42210200032",
    "422102000210","422102000211","422102000212","42210200022","42210200023",
    "42210200024","42210200025","42210200026","42210200027","4221020026"
  ],
  outrosResultados: [
    "3130300001",
    "3130300006","3130300007","3130300008","3130300009","3130300010","3130300011",
    "3130300012","3130300013",
    "42206001","42206002","42206003","42206004","42206005","42206006","42206007",
    "42206008","42206009","42206010",
    "42403001","42403002",
    "43106001","43106002","43106003","43106004",
    "44101001","44101002","44101003","44101004","44101005"
  ],
  depreciacao: [
    "4110220601","42301001"
  ],
  amortizacao: [
    "4110220602","42301002"
  ],
  despFinanceiras: [
    "42401001","42401002","42401003","42401004","42401005","42401006","42401007",
    "42401008","42401009","42401010","42401011","42401012"
  ],
  receitasFinanceiras: [
    "3130300002","3130300003","3130300004","3130300005",
    "42402001","42402002","42402003","42402004","42402005"
  ],
  irpj: [
    "425001001","425001002","425001003","425001004"
  ]
};

// id de linha → chave no DRE_GER_ACCOUNT_MAP (apenas onde divergem)
const DRE_GER_LINE_ID_TO_MAP_KEY = {
  demaisDesp: "demaisDespComerciais",
  despFin:    "despFinanceiras",
  recFin:     "receitasFinanceiras"
};

// Linhas compostas: usa ids de linhas (não chaves do mapa)
const DRE_GER_DRILLDOWN_COMPOSITE = {
  receitaLiquida: ["receitaBruta", "impostos", "devolucoes", "descontos"],
  lucroBruto:     ["receitaLiquida", "materiais", "custosPessoal", "demaisGGF", "custoAbsorcao"],
  despComerciais: ["comissoes", "demaisDesp"],
  ebitda:         ["lucroBruto", "despComerciais", "despAdmin", "outrosResultados"],
  resultadoOp:    ["ebitda", "depreciacao", "amortizacao"],
  resultadoFin:   ["despFin", "recFin"],
  lair:           ["resultadoOp", "resultadoFin"],
  resultadoExerc: ["lair", "irpj"]
};

// Resolve recursivamente todos os códigos analíticos que compõem uma linha
const _resolveGerCodesCache = new Map();
function resolveGerCodes(lineId) {
  if (_resolveGerCodesCache.has(lineId)) return _resolveGerCodesCache.get(lineId);
  const result = _resolveGerCodesInner(lineId, new Set());
  _resolveGerCodesCache.set(lineId, result);
  return result;
}
function _resolveGerCodesInner(lineId, visited) {
  if (visited.has(lineId)) return [];
  visited.add(lineId);
  const mapKey = DRE_GER_LINE_ID_TO_MAP_KEY[lineId] || lineId;
  if (DRE_GER_ACCOUNT_MAP[mapKey]) return DRE_GER_ACCOUNT_MAP[mapKey];
  const composite = DRE_GER_DRILLDOWN_COMPOSITE[lineId];
  if (!composite) return [];
  return composite.flatMap((subId) => _resolveGerCodesInner(subId, visited));
}

function buildDreGerRealReport(year, ledgerRows = []) {
  // Normalizar entradas do ledger
  const normalized = ledgerRows.map((row) => ({
    code: normalizeCode(row.accountNumber ?? row.account_number),
    month: Number(row.referenceMonth ?? row.reference_month ?? extractMonthFromDate(row.entryDate ?? row.entry_date)),
    amount: Number(row.amount)
  })).filter((row) => row.code && row.month >= 1 && row.month <= 12 && Number.isFinite(row.amount));

  // Agrupa por código de conta → array de 12 meses
  const byCode = new Map();
  normalized.forEach(({ code, month, amount }) => {
    if (!byCode.has(code)) byCode.set(code, zeroMonthArray());
    byCode.get(code)[month - 1] += amount;
  });

  // Soma de um conjunto de contas
  const sumCodes = (codes) => {
    return codes.reduce((acc, code) => {
      const months = byCode.get(code);
      if (months) months.forEach((v, i) => { acc[i] += v; });
      return acc;
    }, zeroMonthArray());
  };

  // Inverte sinal (receitas no ledger são negativas → positivas no DRE)
  const neg = (arr) => arr.map((v) => -v);

  // Calcular cada linha gerencial
  const receitaBruta     = neg(sumCodes(DRE_GER_ACCOUNT_MAP.receitaBruta));
  const impostos         = neg(sumCodes(DRE_GER_ACCOUNT_MAP.impostos));
  const devolucoes       = neg(sumCodes(DRE_GER_ACCOUNT_MAP.devolucoes));
  const descontos        = neg(sumCodes(DRE_GER_ACCOUNT_MAP.descontos));
  const receitaLiquida   = sumArrays([receitaBruta, impostos, devolucoes, descontos]);
  const materiais        = neg(sumCodes(DRE_GER_ACCOUNT_MAP.materiais));
  const custosPessoal    = neg(sumCodes(DRE_GER_ACCOUNT_MAP.custosPessoal));
  const demaisGGF        = neg(sumCodes(DRE_GER_ACCOUNT_MAP.demaisGGF));
  const custoAbsorcao    = neg(sumCodes(DRE_GER_ACCOUNT_MAP.custoAbsorcao));
  const lucroBruto       = sumArrays([receitaLiquida, materiais, custosPessoal, demaisGGF, custoAbsorcao]);
  const comissoes        = neg(sumCodes(DRE_GER_ACCOUNT_MAP.comissoes));
  const demaisDesp       = neg(sumCodes(DRE_GER_ACCOUNT_MAP.demaisDespComerciais));
  const despComerciais   = sumArrays([comissoes, demaisDesp]);
  const despAdmin        = neg(sumCodes(DRE_GER_ACCOUNT_MAP.despAdmin));
  const outrosResultados = neg(sumCodes(DRE_GER_ACCOUNT_MAP.outrosResultados));
  const ebitda           = sumArrays([lucroBruto, despComerciais, despAdmin, outrosResultados]);
  const depreciacao      = neg(sumCodes(DRE_GER_ACCOUNT_MAP.depreciacao));
  const amortizacao      = neg(sumCodes(DRE_GER_ACCOUNT_MAP.amortizacao));
  const resultadoOp      = sumArrays([ebitda, depreciacao, amortizacao]);
  const despFin          = neg(sumCodes(DRE_GER_ACCOUNT_MAP.despFinanceiras));
  const recFin           = neg(sumCodes(DRE_GER_ACCOUNT_MAP.receitasFinanceiras));
  const resultadoFin     = sumArrays([despFin, recFin]);
  const lair             = sumArrays([resultadoOp, resultadoFin]);
  const irpj             = neg(sumCodes(DRE_GER_ACCOUNT_MAP.irpj));
  const resultadoExerc   = sumArrays([lair, irpj]);

  // Calcular percentuais em relação à RL
  const pct = (arr) => arr.map((v, i) => receitaLiquida[i] !== 0 ? v / receitaLiquida[i] : 0);

  const lines = [
    { id: "receitaBruta",    label: "( = ) Receita Bruta",             months: receitaBruta,   kind: "result" },
    { id: "impostos",        label: "( - ) Impostos s/ Vendas",         months: impostos,       kind: "deduction" },
    { id: "devolucoes",      label: "( - ) Devoluções",                 months: devolucoes,     kind: "deduction" },
    { id: "descontos",       label: "( - ) Descontos",                  months: descontos,      kind: "deduction" },
    { id: "receitaLiquida",  label: "( = ) Receita Líquida",            months: receitaLiquida, kind: "subtotal" },
    { id: "materiais",       label: "( - ) Materiais",                  months: materiais,      kind: "deduction" },
    { id: "custosPessoal",   label: "( - ) Custo c/ Pessoal",           months: custosPessoal,  kind: "deduction" },
    { id: "demaisGGF",       label: "( - ) Demais GGF",                 months: demaisGGF,      kind: "deduction" },
    { id: "custoAbsorcao",   label: "( +/- ) Custo Absorção",           months: custoAbsorcao,  kind: "deduction" },
    { id: "ggfPct",          label: "GGF%",                             months: pct(sumArrays([custosPessoal, demaisGGF, custoAbsorcao])), kind: "percent" },
    { id: "lucroBruto",      label: "( = ) Lucro Bruto",                months: lucroBruto,     kind: "subtotal" },
    { id: "lbPct",           label: "LB%",                              months: pct(lucroBruto),kind: "percent" },
    { id: "despComerciais",  label: "( - ) Desp. Comerciais",           months: despComerciais, kind: "deduction" },
    { id: "dcPct",           label: "DC%",                              months: pct(despComerciais), kind: "percent" },
    { id: "comissoes",       label: "( - ) Comissão s/ Vendas",         months: comissoes,      kind: "detail" },
    { id: "demaisDesp",      label: "( - ) Demais Desp. Comerciais",    months: demaisDesp,     kind: "detail" },
    { id: "despAdmin",       label: "( - ) Desp. Administrativas",      months: despAdmin,      kind: "deduction" },
    { id: "daPct",           label: "DA%",                              months: pct(despAdmin), kind: "percent" },
    { id: "outrosResultados",label: "( +/- ) Outros Resultados",        months: outrosResultados, kind: "deduction" },
    { id: "ebitda",          label: "( = ) EBITDA",                     months: ebitda,         kind: "subtotal" },
    { id: "ebitdaPct",       label: "EBITDA%",                          months: pct(ebitda),    kind: "percent" },
    { id: "depreciacao",     label: "( - ) Depreciação",                months: depreciacao,    kind: "deduction" },
    { id: "amortizacao",     label: "( - ) Amortização",               months: amortizacao,    kind: "deduction" },
    { id: "resultadoOp",     label: "( = ) Resultado Operacional",      months: resultadoOp,    kind: "subtotal" },
    { id: "roPct",           label: "RO%",                              months: pct(resultadoOp), kind: "percent" },
    { id: "resultadoFin",    label: "( +/- ) Resultado Financeiro",     months: resultadoFin,   kind: "deduction" },
    { id: "rfPct",           label: "RF%",                              months: pct(resultadoFin), kind: "percent" },
    { id: "despFin",         label: "( - ) Despesas Financeiras",       months: despFin,        kind: "detail" },
    { id: "recFin",          label: "( + ) Receitas Financeiras",       months: recFin,         kind: "detail" },
    { id: "lair",            label: "( = ) Resultado antes IRPJ/CSLL",  months: lair,           kind: "subtotal" },
    { id: "lairPct",         label: "LAIR%",                            months: pct(lair),      kind: "percent" },
    { id: "irpj",            label: "( - ) Provisão para IRPJ/CSLL",   months: irpj,           kind: "deduction" },
    { id: "resultadoExerc",  label: "( = ) Resultado do Exercício",     months: resultadoExerc, kind: "result-final" },
    { id: "llPct",           label: "LL%",                              months: pct(resultadoExerc), kind: "percent" }
  ].map((line) => ({
    ...line,
    total: line.kind === "percent"
      ? (receitaLiquida.reduce((s, v) => s + v, 0) !== 0 ? line.months.reduce((s, v) => s + v, 0) / 12 : 0)
      : line.months.reduce((s, v) => s + v, 0)
  }));

  return { year, lines };
}

function sumArrays(arrays) {
  return arrays.reduce((acc, arr) => {
    arr.forEach((v, i) => { acc[i] += v; });
    return acc;
  }, zeroMonthArray());
}

function buildDreGerRealTableMarkup(report) {
  const R = '<span class="col-resizer" aria-hidden="true"></span>';
  const headerCells = MONTH_LABELS.map((label) => `<th>${escapeHtml(label)}${R}</th>`).join("");
  const bodyRows = report.lines.map((line) => {
    const isPercent = line.kind === "percent";
    const isSubtotal = line.kind === "subtotal" || line.kind === "result" || line.kind === "result-final";
    const isDetail = line.kind === "detail";

    const formatCell = (val) => {
      if (isPercent) {
        if (!Number.isFinite(val) || Math.abs(val) < 0.00001) return "-";
        return (val * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
      }
      return formatSignedCurrency(val);
    };

    const canDrilldown = !isPercent && line.kind !== "result-final" && resolveGerCodes(line.id).length > 0;
    const valueCells = line.months.map((v, i) => {
      if (canDrilldown) {
        return `<td class="reports-value-cell ger-drillable" data-line-id="${escapeHtml(line.id)}" data-month-idx="${i}">${escapeHtml(formatCell(v))}</td>`;
      }
      return `<td class="reports-value-cell">${escapeHtml(formatCell(v))}</td>`;
    }).join("");
    const totalCell = `<td class="reports-value-cell reports-total-cell">${escapeHtml(formatCell(line.total))}</td>`;

    let rowClass = "ger-row-normal";
    if (isSubtotal) rowClass = "ger-row-subtotal";
    else if (isPercent) rowClass = "ger-row-percent";
    else if (isDetail) rowClass = "ger-row-detail";
    if (line.kind === "result-final") rowClass = "ger-row-result-final";

    return `
      <tr class="${rowClass}">
        <td class="reports-label-cell ger-label-col"><span>${escapeHtml(line.label)}</span></td>
        ${valueCells}
        ${totalCell}
      </tr>
    `;
  }).join("");

  return `
    <table class="reports-dre-table reports-ger-table" data-resizable-cols>
      <colgroup>
        <col style="width:220px">
        ${MONTH_LABELS.map(() => '<col style="width:110px">').join("")}
        <col style="width:110px">
      </colgroup>
      <thead>
        <tr>
          <th>Linha Gerencial${R}</th>
          ${headerCells}
          <th>Total / Méd${R}</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}
// ─── FIM DRE GERENCIAL ────────────────────────────────────────────────────────

// ─── DRE DFs REAL ─────────────────────────────────────────────────────────────
// Mapeamentos extraídos diretamente das fórmulas da aba "DRE Soc Real PPT"
// cruzadas linha a linha com a aba "DRE Soc Real" do Excel de referência.

const DRE_DFS_ACCOUNT_MAP = {
  // =-SUM('DRE Soc Real'!D6:D20)-SUM('DRE Soc Real'!D23:D26)-SUM('DRE Soc Real'!D28:D31)
  vendas: [
    "31101001","31101002","31101006","31101003","31101007","31101004","31101005",
    "31102001","31102002",
    "31103001","31103002","31103003","31103004",
    "31201001","31201002","31201003","31201004",
    "31202001","31202002","31202003","31202004"
  ],
  // =-SUM('DRE Soc Real'!D33:D39)
  impostos: [
    "31203001","31203002","31203003","31203004","31203005","31203009","31203012"
  ],
  // =-'DRE Soc Real'!D248
  materiais: ["412010901"],
  // =-SUM(D115:D116, D119:D149, D151:D183, D185:D208, D210:D231, D233:D234, D61:D63, D65:D68, D70:D75, D77:D94, D96:D99, D102:D108, D110, D112:D113, D236, D238:D246, D249:D250)
  demaisCustos: [
    "4110220601","4110220602",
    "4110300001001","4110300001002","4110300001003","4110300001004","4110300001005",
    "4110300001006","4110300001007","4110300001008","4110300001009","4110300001010",
    "4110300001011","4110300001012","4110300001013","4110300001014","4110300001015",
    "4110300001016","4110300001017","4110300001018","4110300001019","4110300001028",
    "4110300001020","4110300001029","4110300001031","4110300001030","4110300001021",
    "4110300001022","4110300001023","4110300001024","4110300001025","4110300001026",
    "4110300001027",
    "4110300002001","4110300002002","4110300002003","4110300002004","4110300002005",
    "4110300002006","4110300002007","4110300002008","4110300002009","4110300002010",
    "4110300002011","4110300002012","4110300002013","4110300002014","4110300002015",
    "4110300002016","4110300002017","4110300002018","4110300002019","4110300002020",
    "4110300002021","4110300002030","4110300002032","4110300002022","4110300002033",
    "4110300002031","4110300002023","4110300002024","4110300002025","4110300002026",
    "4110300002027","4110300002028","4110300002029",
    "4110300003001","4110300003002","4110300003003","4110300003004","4110300003005",
    "4110300003006","4110300003007","4110300003008","4110300003009","4110300003010",
    "4110300003011","4110300003012","4110300003013","4110300003014","4110300003015",
    "4110300003016","4110300003017","4110300003018","4110300003019","4110300003020",
    "4110300003021","4110300003022","4110300003023","4110300003024",
    "4110300004001","4110300004002","4110300004003","4110300004004","4110300004005",
    "4110300004006","4110300004007","4110300004008","4110300004009","4110300004010",
    "4110300004011","4110300004012","4110300004013","4110300004014","4110300004015",
    "4110300004016","4110300004017","4110300004018","4110300004019","4110300004020",
    "4110300004021","4110300004022",
    "411030002028","411030002029",
    "4110210101","4110210102","4110210103",
    "4110210201","4110210202","4110210203","4110210204",
    "4110210301","4110210302","4110210303","4110210304","4110210305","4110210306",
    "4110210401","4110210402","4110210403","4110210404","4110210405","4110210406",
    "4110210407","4110210408","4110210409","4110210410","4110210411","4110210412",
    "4110210413","4110210414","4110210415","4110210416","4110210417","4110210418",
    "4110210501","4110210502","4110210503","4110210504",
    "4110220301","4110220302","4110220303","4110220304","4110220305","4110220306",
    "4110220307",
    "4110220401",
    "4110220501","4110220502",
    "4110400001001",
    "4120100","4120101","4120102","4120103","4120104","4120105","4120106","4120107","4120108",
    "412010902","412010903"
  ],
  // =-SUM(D256:D261, D263:D273, D275:D286, D288:D291, D293:D294, D296:D308, D310:D311, D313:D314, D316:D321, D323:D327)
  despComerciais: [
    "42102001","42102002","42102003","42102004","42102005","42102006",
    "42103001","42103002","42103003","42103004","42103005","42103006","42103007",
    "42103008","42103009","42103010","42103011",
    "42104001","42104002","42104003","42104004","42104005","42104006","42104007",
    "42104008","42104009","42104010","42104011","42104012",
    "42105001","42105002","42105003","42105004",
    "42106001","42106002","42106007","42106008","42106009","42106010","42106011",
    "42106012","42106013","42106014","42106015","42106016","42106017","42106018","42106019",
    "42107001","42107002",
    "42108001","42108002",
    "42109001","42109002","42109003","42109004","42109005","42109006",
    "42110001","42110002","42110003","42110004"
  ],
  // =-SUM(D588, D589, D330, D332:D367, D369:D390, D392:D422, D424:D445, D447:D458, D460:D471, D473:D475, D477:D486, D488:D509, D511:D516, D529:D530, D532:D537, D539:D547, D550:D552, D554:D586)
  despGA: [
    "42301001","42301002",
    "42201000001031",
    "4220100001001","4220100001002","4220100001003","4220100001004","4220100001005",
    "4220100001006","4220100001007","4220100001008","4220100001009","4220100001010",
    "4220100001011","4220100001012","4220100001013","4220100001014","4220100001015",
    "4220100001016","4220100001017","4220100001018","4220100001019","4220100001020",
    "4220100001021","4220100001033","4220100001022","4220100001034","4220100001036",
    "4220100001035","4220100001023","4220100001024","4220100001025","4220100001026",
    "4220100001027","4220100001028","4220100001029","4220100001030","4220100001031",
    "4220100001032",
    "4220100002001","4220100002002","4220100002003","4220100002004","4220100002005",
    "4220100002006","4220100002007","4220100002008","4220100002009","4220100002010",
    "4220100002011","4220100002012","4220100002013","4220100002014","4220100002015",
    "4220100002016","4220100002017","4220100002018","4220100002019","4220100002020",
    "4220100002021","4220100002022",
    "4220100003001","4220100003002","4220100003003","4220100003004","4220100003005",
    "4220100003006","4220100003007","4220100003008","4220100003009","4220100003010",
    "4220100003011","4220100003012","4220100003013","4220100003014","4220100003015",
    "4220100003016","4220100003017","4220100003018","4220100003019","4220100003020",
    "4220100003021","4220100003022","4220100003023","4220100003024","4220100003025",
    "4220100003026","4220100003028","4220100003029","4220100003030","4220100003031",
    "4220100003032",
    "4220100004001","4220100004002","4220100004003","4220100004004","4220100004005",
    "4220100004006","4220100004007","4220100004008","4220100004009","4220100004010",
    "4220100004011","4220100004012","4220100004013","4220100004014","4220100004015",
    "4220100004016","4220100004017","4220100004018","4220100004019","4220100004020",
    "4220100004021","4220100004022",
    "4220100005001","4220100005002","4220100005003","4220100005004","4220100005005",
    "4220100005006","4220100005007","4220100005008","4220100005009","4220100005010",
    "4220100005011","4220100005012",
    "4220100006001","4220100006002","4220100006003","4220100006004","4220100006005",
    "4220100006006","4220100006007","4220100006008","4220100006009","4220100006010",
    "4220100006011","4220100006012",
    "42202001","42202002","42202003",
    "4220300010","42203001","42203002","42203003","42203004","42203005","42203006",
    "42203007","42203008","42203009",
    "4220400001","4220400002","4220400003","4220400004","4220400005","4220400006",
    "4220400008","4220400009","4220400012","4220400013","4220400015","4220400016",
    "4220400017","4220400018","4220400019","4220400020","4220400021","4220400022",
    "4220400023","4220400024","4220400025","4220400027",
    "42205001","42205002","42205003","42205004","42205005","42205006",
    "42207001","42207002",
    "42208001","42208002","42208003","42208004","42208005","42208006",
    "42209001","42209002","42209003","42209004","42209005","42209006","42209007",
    "42209008","42209009",
    "42210100001","42210100002","42210100003",
    "42210200001","42210200002","42210200003","42210200004","42210200005","42210200006",
    "42210200007","42210200008","42210200009","42210200010","42210200011","42210200012",
    "42210200014","42210200015","42210200016","42210200017","42210200018","42210200019",
    "42210200031","42210200020","42210200033","42210200034","42210200032",
    "422102000210","422102000211","422102000212","42210200022","42210200023",
    "42210200024","42210200025","42210200026","42210200027","4221020026"
  ],
  // =-SUM('DRE Soc Real'!D43:D46, D604:D608)
  recFinanceiras: [
    "3130300002","3130300003","3130300004","3130300005",
    "42402001","42402002","42402003","42402004","42402005"
  ],
  // =-SUM('DRE Soc Real'!D591:D602)
  despFinanceiras: [
    "42401001","42401002","42401003","42401004","42401005","42401006","42401007",
    "42401008","42401009","42401010","42401011","42401012"
  ],
  // =-SUM(D42, D47:D54, D518:D527, D610:D611, D618:D621, D623:D627)
  outrosResultados: [
    "3130300001",
    "3130300006","3130300007","3130300008","3130300009","3130300010","3130300011",
    "3130300012","3130300013",
    "42206001","42206002","42206003","42206004","42206005","42206006","42206007",
    "42206008","42206009","42206010",
    "42403001","42403002",
    "43106001","43106002","43106003","43106004",
    "44101001","44101002","44101003","44101004","44101005"
  ],
  // =-SUM('DRE Soc Real'!D613:D616)
  irpj: ["425001001","425001002","425001003","425001004"]
};

function buildDreDfsRealReport(year, ledgerRows = [], prebuiltGerReport = null) {
  const normalized = ledgerRows.map((row) => ({
    code: normalizeCode(row.accountNumber ?? row.account_number),
    month: Number(row.referenceMonth ?? row.reference_month ?? extractMonthFromDate(row.entryDate ?? row.entry_date)),
    amount: Number(row.amount)
  })).filter((row) => row.code && row.month >= 1 && row.month <= 12 && Number.isFinite(row.amount));

  const sumCodes = (codes) => {
    const codeSet = new Set(codes);
    const months = zeroMonthArray();
    normalized.forEach((row) => {
      if (codeSet.has(row.code)) months[row.month - 1] += row.amount;
    });
    return months;
  };
  const sumArrays = (arrays) => arrays.reduce((acc, arr) => acc.map((v, i) => v + arr[i]), zeroMonthArray());
  const neg = (arr) => arr.map((v) => -v);
  const pct = (num, den) => den.map((d, i) => Math.abs(d) > 0.0001 ? num[i] / d : 0);

  // Cada linha: neg() porque no SOC receitas são crédito (negativo) e custos são débito (positivo)
  const vendas          = neg(sumCodes(DRE_DFS_ACCOUNT_MAP.vendas));
  const impostos        = neg(sumCodes(DRE_DFS_ACCOUNT_MAP.impostos));
  const recLiquida      = sumArrays([vendas, impostos]);
  const materiais       = neg(sumCodes(DRE_DFS_ACCOUNT_MAP.materiais));
  const demaisCustos    = neg(sumCodes(DRE_DFS_ACCOUNT_MAP.demaisCustos));
  const lucroBruto      = sumArrays([recLiquida, materiais, demaisCustos]);
  const despComerciais  = neg(sumCodes(DRE_DFS_ACCOUNT_MAP.despComerciais));
  const despGA          = neg(sumCodes(DRE_DFS_ACCOUNT_MAP.despGA));
  const recFinanceiras  = neg(sumCodes(DRE_DFS_ACCOUNT_MAP.recFinanceiras));
  const despFinanceiras = neg(sumCodes(DRE_DFS_ACCOUNT_MAP.despFinanceiras));
  const outrosResultados= neg(sumCodes(DRE_DFS_ACCOUNT_MAP.outrosResultados));
  const resultadoOp     = sumArrays([lucroBruto, despComerciais, despGA, recFinanceiras, despFinanceiras, outrosResultados]);
  const irpj            = neg(sumCodes(DRE_DFS_ACCOUNT_MAP.irpj));
  const resultadoExerc  = sumArrays([resultadoOp, irpj]);
  // EBITDA = valor do DRE Gerencial (='DRE Ger Real'!C30) — mesmo cálculo
  const gerReport   = prebuiltGerReport ?? buildDreGerRealReport(year, ledgerRows);
  const gerEbitda   = gerReport.lines.find((l) => l.id === "ebitda");
  const ebitdaCalc  = gerEbitda ? gerEbitda.months.slice() : zeroMonthArray();

  const lines = [
    { id: "receitaBruta",    label: "Receita Bruta",                      months: [],              kind: "section" },
    { id: "vendas",          label: "Venda de Produtos e Serviços",        months: vendas,          kind: "value" },
    { id: "deducoes",        label: "Deduções",                            months: [],              kind: "section" },
    { id: "impostos",        label: "Impostos s/ Vendas",                  months: impostos,        kind: "detail" },
    { id: "receitaLiquida",  label: "Receita Líquida",                     months: recLiquida,      kind: "subtotal" },
    { id: "cpv",             label: "Custo dos Produtos Vendidos",          months: [],              kind: "section" },
    { id: "materiais",       label: "Matéria-prima",                       months: materiais,       kind: "detail" },
    { id: "demaisCustos",    label: "Demais Custos",                       months: demaisCustos,    kind: "detail" },
    { id: "lucroBruto",      label: "Lucro Bruto",                         months: lucroBruto,      kind: "subtotal" },
    { id: "despOp",          label: "Despesas / Receitas Operacionais",    months: [],              kind: "section" },
    { id: "despComerciais",  label: "Despesas Comerciais",                 months: despComerciais,  kind: "detail" },
    { id: "despGA",          label: "Despesas Gerais e Administrativas",   months: despGA,          kind: "detail" },
    { id: "recFinanceiras",  label: "Receitas Financeiras",                months: recFinanceiras,  kind: "detail" },
    { id: "despFinanceiras", label: "Despesas Financeiras",                months: despFinanceiras, kind: "detail" },
    { id: "outrosResultados",label: "Outros Resultados",                   months: outrosResultados,kind: "detail" },
    { id: "resultadoOp",     label: "Resultado Operacional",               months: resultadoOp,     kind: "subtotal" },
    { id: "lair",            label: "Resultado antes IRPJ/CSLL",           months: resultadoOp,     kind: "subtotal" },
    { id: "irpj",            label: "Provisão para IRPJ / CSLL",           months: irpj,            kind: "detail" },
    { id: "resultadoExerc",  label: "Resultado do Exercício",              months: resultadoExerc,  kind: "result" },
    { id: "resultadoExercPct", label: "Resultado do Exercício %RL",        months: pct(resultadoExerc, recLiquida), kind: "percent" },
    { id: "ebitda",          label: "Ebitda",                              months: ebitdaCalc,      kind: "result" },
    { id: "ebitdaPct",       label: "Ebitda %RL",                          months: pct(ebitdaCalc, recLiquida), kind: "percent" }
  ];

  lines.forEach((line) => {
    if (line.kind !== "section") {
      line.total = line.months.reduce((s, v) => s + v, 0);
    }
  });

  return {
    year: Number(year || state.currentPeriod?.year || 2026),
    lines,
    grandTotal: resultadoExerc.reduce((s, v) => s + v, 0)
  };
}

function buildDreDfsRealTableMarkup(report) {
  const R = '<span class="col-resizer" aria-hidden="true"></span>';
  const headerCells = MONTH_LABELS.map((label) => `<th>${escapeHtml(label)}${R}</th>`).join("");

  const bodyRows = report.lines.map((line) => {
    if (line.kind === "section") {
      return `
        <tr class="dfs-row-section">
          <td class="reports-label-cell dfs-label-col" colspan="${MONTH_LABELS.length + 2}">
            <span>${escapeHtml(line.label)}</span>
          </td>
        </tr>
      `;
    }

    const isPercent  = line.kind === "percent";
    const isSubtotal = line.kind === "subtotal" || line.kind === "result";
    const isDetail   = line.kind === "detail";

    const formatCell = (val) => {
      if (isPercent) {
        if (!Number.isFinite(val) || Math.abs(val) < 0.00001) return "-";
        return (val * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
      }
      return formatSignedCurrency(val);
    };

    const valueCells = line.months.map((v) =>
      `<td class="reports-value-cell">${escapeHtml(formatCell(v))}</td>`
    ).join("");
    const totalCell = `<td class="reports-value-cell reports-total-cell">${escapeHtml(formatCell(line.total))}</td>`;

    let rowClass = "ger-row-normal";
    if (isSubtotal) rowClass = "ger-row-subtotal";
    else if (isPercent) rowClass = "ger-row-percent";
    else if (isDetail) rowClass = "ger-row-detail";

    return `
      <tr class="${rowClass}">
        <td class="reports-label-cell dfs-label-col"><span>${escapeHtml(line.label)}</span></td>
        ${valueCells}
        ${totalCell}
      </tr>
    `;
  }).join("");

  return `
    <table class="reports-dre-table reports-ger-table" data-resizable-cols>
      <colgroup>
        <col style="width:260px">
        ${MONTH_LABELS.map(() => '<col style="width:110px">').join("")}
        <col style="width:110px">
      </colgroup>
      <thead>
        <tr>
          <th>Linha DFs${R}</th>
          ${headerCells}
          <th>Total${R}</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}
// ─── FIM DRE DFs ──────────────────────────────────────────────────────────────

// ─── OPEX REAL ────────────────────────────────────────────────────────────────
// ── OPEX Planejado: espelha estrutura do OPEX Real usando cache de budget ───
function renderOpexBudgetReport(detailPanel) {
  const year = Number(state.currentPeriod?.year || 2026);

  // ── Filtro Gestão (mesma dinâmica do OPEX Real) ────────────────────────────
  const managements = [...new Set(
    state.costCenters.map((cc) => (cc.management || "").trim()).filter(Boolean)
  )].sort();
  const allOption  = "Marcher";
  const baseMgmtOptions = [allOption, ...managements];
  const prevMgmt   = detailPanel.dataset.opexMgmt || allOption;
  const { selectedMgmt, locked: mgmtLocked, allowedMgmts } = resolveManagementFilter(prevMgmt, baseMgmtOptions, allOption);
  const mgmtOptions = mgmtLocked ? [selectedMgmt] : (allowedMgmts || baseMgmtOptions);
  const validCcFilter = buildEffectiveOpexFilter(selectedMgmt);

  // ── Slot de filtro no header global (Gestão + esconder zeros) ──────────────
  const opexSlot = document.querySelector("#opex-gestao-slot");
  if (opexSlot) {
    opexSlot.hidden = false;
    opexSlot.innerHTML = `
      <div class="opex-header-filter" style="display:flex;align-items:center;gap:10px">
        <select class="opex-filter-select" id="opex-budget-mgmt-select-header" ${mgmtLocked ? "disabled" : ""}>
          ${buildMgmtSelectOptions(mgmtOptions, selectedMgmt, mgmtLocked)}
        </select>
        <button id="opex-budget-hide-zeros-btn" type="button" style="
          height:32px;padding:0 12px;border-radius:8px;font-size:0.74rem;font-weight:500;
          border:1px solid ${opexHideZeros ? "var(--blue)" : "var(--line)"};
          background:${opexHideZeros ? "var(--blue-soft)" : "transparent"};
          color:${opexHideZeros ? "var(--blue)" : "var(--text-faint)"};
          cursor:pointer;white-space:nowrap;transition:all .15s
        ">Ocultar zeros</button>
      </div>`;
    opexSlot.querySelector("#opex-budget-mgmt-select-header")?.addEventListener("change", (e) => {
      detailPanel.dataset.opexMgmt = e.target.value;
      renderReportsView();
    });
    opexSlot.querySelector("#opex-budget-hide-zeros-btn")?.addEventListener("click", () => {
      opexHideZeros = !opexHideZeros;
      renderReportsView();
    });
  }

  // Renderiza a tabela + drilldown a partir das linhas (já restritas à gestão).
  const renderBudgetOpexTable = (rows) => {
    const tableMarkup = buildOpexRealTableMarkup(rows, null, opexHideZeros);
    detailPanel.innerHTML = `<div class="opex-report-wrap reports-table-wrap"><div id="opex-budget-table-inner">${tableMarkup}</div></div>`;
    const tableEl = detailPanel.querySelector(".reports-opex-table");
    if (tableEl) initOpexDrilldown(tableEl, rows, null);
    initAllReportTableResizers();
  };

  if (selectedMgmt === allOption) {
    // Admin: ano inteiro com CC (todas as gestões), filtrado client-side se preciso.
    const ccCacheKey = `budget-cc-${year}`;
    const ccCached = reportsLedgerCache.get(ccCacheKey);
    if (!ccCached) {
      detailPanel.innerHTML = `<div class="opex-report-wrap reports-table-wrap"><div id="opex-budget-table-inner">${vpSkeletonTable()}</div></div>`;
      if (_opexBudgetCcLoadingYear !== year) {
        _opexBudgetCcLoadingYear = year;
        fetchBudgetLedgerWithCcForYear(year)
          .then((rows) => reportsLedgerCache.set(ccCacheKey, { rows }))
          .catch(() => reportsLedgerCache.set(ccCacheKey, { rows: [] }))
          .finally(() => {
            _opexBudgetCcLoadingYear = null;
            if (selectedReportId === "opexBudget") renderReportsView();
          });
      }
      return;
    }
    renderBudgetOpexTable(ccCached.rows || []);
  } else {
    // Gestor/Analista (travado): busca SÓ os CCs da gestão no servidor (rápido).
    const mgmtCacheKey = `budget-mgmt-${year}-${selectedMgmt}`;
    const cached = reportsLedgerCache.get(mgmtCacheKey);
    if (cached) {
      renderBudgetOpexTable(cached.rows || []);
    } else {
      detailPanel.innerHTML = `<div class="opex-report-wrap reports-table-wrap"><div id="opex-budget-table-inner">${vpSkeletonTable()}</div></div>`;
      const effectiveCcIds = [...(validCcFilter?.ids || [])].filter(Boolean);
      fetchBudgetLedgerForCcIds(year, effectiveCcIds)
        .then((rows) => {
          reportsLedgerCache.set(mgmtCacheKey, { rows });
          if (selectedReportId === "opexBudget") renderReportsView();
        })
        .catch(() => {
          if (selectedReportId === "opexBudget") {
            const inner = detailPanel.querySelector("#opex-budget-table-inner");
            if (inner) inner.innerHTML = `<div class="actuals-empty">Erro ao carregar dados de planejado.</div>`;
          }
        });
    }
  }
}


const OPEX_STRUCTURE = [
  { label: "CUSTOS DE PRODUÇÃO", kind: "section", groups: [
    { label: "MOD - MÃO-DE-OBRA DIRETA", accounts: ["4110300001001","4110300001002","4110300001007","4110300001008","4110300001009","4110300001010","4110300001011","4110300001028","4110300001029","4110300001031","4110300001019","4110300001020","4110300001030","4110300001026","4110300001014","4110300001015","4110300001016","4110300001017","4110300001022","4110300001027","4110300001003","4110300001023","4110300001025"] },
    { label: "MOI - MÃO-DE-OBRA INDIRETA", accounts: ["4110300002001","4110300002002","4110300002023","4110300002007","4110300002008","4110300002009","4110300002010","4110300002011","4110300002030","4110300002032","4110300002033","4110300002021","4110300002022","4110300002031","4110300002028","4110300002016","4110300002017","4110300002018","4110300002019","4110300002024","4110300002029","4110300002003","4110300002026","4110300002025"] },
    { label: "GGF - GASTOS GERAIS DE FABRICAÇÃO", accounts: ["4110210101","4110210102","4110210103","4110210201","4110210202","4110210203","4110210204","4110210301","4110210302","4110210303","4110210401","4110210402","4110210403","4110210404","4110210405","4110210406","4110210407","4110210408","4110210409","4110210410","4110210411","4110210412","4110210413","4110210414","4110210415","4110210416","4110210501","4110210502","4110210503","4110210504","4110210418","4110220301","4110220302","4110220303","4110220304","4110220305","4110220401","4110220501","4110220502"] }
  ]},
  { label: "DESPESAS OPERACIONAIS", kind: "section", groups: [
    { label: "DESPESAS COM PESSOAL - ADM", accounts: ["4220100001001","4220100001015","4220100001029","4220100001010","4220100001011","4220100001033","4220100001034","4220100001036","4220100001021","4220100001022","4220100001035","4220100001031","4220100001016","4220100001017","4220100001018","4220100001019","4220100001003","4220100001023"] },
    { label: "DESPESAS COM PESSOAL - COM", accounts: ["4220100003001","4220100003002","4220100003023","4220100003024","4220100003007","4220100003008","4220100003010","4220100003011","4220100003028","4220100003022","4220100003029","4220100003021","4220100003030","4220100003031","4220100003016","4220100003017","4220100003018","4220100003019","4220100003026","4220100003003","4220100003025","4220100003004"] },
    { label: "DESPESAS COM PESSOAL - ENG", accounts: ["42210200001","42210200002","422102000212","42210200007","42210200008","42210200010","42210200011","42210200031","42210200033","42210200034","42210200019","42210200020","42210200032","42210200014","42210200016","42210200017","42210200003"] },
    { label: "DESPESAS ADMINISTRATIVAS", accounts: ["4220400001","4220400002","4220400003","4220400004","4220400005","4220400006","4220400008","4220400012","4220400013","4220400015","4220400017","4220400020","4220400021","4220400022","4220400023","4220400024","42209003","42209005","42209006","42209007","42209008","42209009","42202001","42203001","42203003","42203004","42203005","42203006","42203007"] },
    { label: "DESPESAS DE MARKETING", accounts: ["42103001","42103002","42103003","42103005","42103006","42103007","42103008","42103009","42105001","42105002","42105003"] },
    { label: "DESPESAS C/ ASSISTÊNCIA TÉCNICA", accounts: ["42104001","42104002","42104003","42104004","42104005","42104006","42104007","42104008","42104009","42104010","42104012"] },
    { label: "CUSTO NÃO QUALIDADE", accounts: ["42108001","42108002"] },
    { label: "DESPESAS COMERCIAIS", accounts: ["42109002","42109003","42109004","42109005","42106001","42106002","42106007","42106008","42106009","42106010","42106011","42106013","42106014","42106016","42106017","42106018","42106019","42107001","42107002","42102001","42102003","42102004","42102005"] }
  ]}
];

function buildOpexRealTableMarkup(ledgerRows, validCcFilter, hideZeros = false) {
  // Remove debug logs
  const R = '<span class="col-resizer" aria-hidden="true"></span>';

  // ── Normaliza ledger filtrando por CC válidos (null = sem restrição)
  const normalized = ledgerRows.map((row) => ({
    code: normalizeCode(row.accountNumber ?? row.account_number),
    ccId: String(row.costCenterId ?? row.cost_center_id ?? "").trim(),
    cc: normalizeCode(row.costCenterNumber ?? row.cost_center_number),
    month: Number(row.referenceMonth ?? row.reference_month ?? extractMonthFromDate(row.entryDate ?? row.entry_date)),
    amount: Number(row.amount)
  })).filter((r) => {
    if (!r.code || r.month < 1 || r.month > 12 || !Number.isFinite(r.amount)) return false;
    return matchesOpexCostCenterFilter(validCcFilter, r.ccId, r.cc);
  });

  // ── Mapa: code → [12 meses]
  const monthsMap = new Map();
  normalized.forEach((r) => {
    if (!monthsMap.has(r.code)) monthsMap.set(r.code, Array(12).fill(0));
    monthsMap.get(r.code)[r.month - 1] += r.amount;
  });

  // ── Mapa de nomes: code → name (do dreNodes)
  const nameMap = new Map(state.dreNodes.map((n) => [String(n.code), n.name]));

  const sumMonths = (accounts) => {
    const total = Array(12).fill(0);
    accounts.forEach((code) => {
      const m = monthsMap.get(code);
      if (m) m.forEach((v, i) => { total[i] += v; });
    });
    return total;
  };

  const fmtVal = (v) => Math.abs(v) < 0.005 ? "—"
    : formatSignedCurrency(v);

  const headerCells = MONTH_LABELS.map((l) => `<th>${escapeHtml(l)}${R}</th>`).join("");

  let bodyRows = "";

  // Grand total
  const allAccounts = OPEX_STRUCTURE.flatMap((s) => s.groups.flatMap((g) => g.accounts));
  const grandTotal = sumMonths(allAccounts);
  const grandTotalRow = grandTotal.map((v) => `<td class="reports-value-cell">${escapeHtml(fmtVal(v))}</td>`).join("");
  bodyRows += `<tr class="opex-row-grand">
    <td class="reports-label-cell opex-code-col"></td>
    <td class="reports-label-cell opex-name-col"><span>TOTAL DE GASTOS OPERACIONAIS</span></td>
    ${grandTotalRow}
    <td class="reports-value-cell reports-total-cell">${escapeHtml(fmtVal(grandTotal.reduce((s,v)=>s+v,0)))}</td>
  </tr>`;

  OPEX_STRUCTURE.forEach((section) => {
    // Section header
    bodyRows += `<tr class="opex-row-section">
      <td class="reports-label-cell opex-code-col" colspan="${MONTH_LABELS.length + 3}">
        <span>${escapeHtml(section.label)}</span>
      </td>
    </tr>`;

    section.groups.forEach((group) => {
      const groupMonths = sumMonths(group.accounts);
      const groupTotal = groupMonths.reduce((s, v) => s + v, 0);
      const groupIsZero = groupMonths.every((v) => Math.abs(v) < 0.005);

      // Quando hideZeros está ativo, ocultar grupo inteiro se zerado
      if (hideZeros && groupIsZero) return;

      const groupCells = groupMonths.map((v) => `<td class="reports-value-cell">${escapeHtml(fmtVal(v))}</td>`).join("");

      bodyRows += `<tr class="opex-row-group">
        <td class="reports-label-cell opex-code-col"></td>
        <td class="reports-label-cell opex-name-col"><span>${escapeHtml(group.label)}</span></td>
        ${groupCells}
        <td class="reports-value-cell reports-total-cell">${escapeHtml(fmtVal(groupTotal))}</td>
      </tr>`;

      group.accounts.forEach((code) => {
        const months = monthsMap.get(code) || Array(12).fill(0);
        const total = months.reduce((s, v) => s + v, 0);
        if (hideZeros && months.every((v) => Math.abs(v) < 0.005)) return;
        const name = nameMap.get(code) || "";
        const cells = months.map((v, i) => `<td class="reports-value-cell opex-drillable" data-account="${escapeHtml(code)}" data-month-idx="${i}">${escapeHtml(fmtVal(v))}</td>`).join("");
        bodyRows += `<tr class="opex-row-account">
          <td class="reports-label-cell opex-code-col"><span class="opex-code">${escapeHtml(code)}</span></td>
          <td class="reports-label-cell opex-name-col"><span>${escapeHtml(name)}</span></td>
          ${cells}
          <td class="reports-value-cell reports-total-cell">${escapeHtml(fmtVal(total))}</td>
        </tr>`;
      });
    });
  });

  return `
    <table class="reports-dre-table reports-opex-table" data-resizable-cols>
      <colgroup>
        <col style="width:110px">
        <col style="width:260px">
        ${MONTH_LABELS.map(() => '<col style="width:100px">').join("")}
        <col style="width:110px">
      </colgroup>
      <thead>
        <tr>
          <th># Conta${R}</th>
          <th>Descritivo${R}</th>
          ${headerCells}
          <th>Total${R}</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}
// ─── FIM OPEX REAL ────────────────────────────────────────────────────────────

// Versão "efetiva" do filtro OPEX: gestão selecionada + extra_cc_ids do perfil.
// Usado no OPEX Real/Budget para Gestor/Analista com CCs avulsos extras.
function buildEffectiveOpexFilter(selectedMgmt) {
  const base = buildOpexCostCenterFilter(selectedMgmt);
  if (!isAccessRestricted()) return base;
  const extraIds = getExtraCcIds() || [];
  if (!extraIds.length) return base;
  const ids = new Set([...(base?.ids || [])]);
  const numbers = new Set([...(base?.numbers || [])]);
  (state.costCenters || []).forEach((cc) => {
    if (extraIds.some(id => String(id) === String(cc.id))) {
      if (cc.id) ids.add(String(cc.id).trim());
      const n = normalizeCode(cc.number);
      if (n) numbers.add(n);
    }
  });
  return { ids, numbers };
}

// management: string (única) ou array de strings. null/"Marcher" = sem filtro.
function buildOpexCostCenterFilter(management) {
  if (!management || management === "Marcher") return null;
  const mgmtList = Array.isArray(management) ? management : [management];
  if (!mgmtList.length) return null;
  const ids = new Set();
  const numbers = new Set();
  state.costCenters
    .filter((cc) => mgmtList.includes((cc.management || "").trim()))
    .forEach((cc) => {
      if (cc.id) ids.add(String(cc.id).trim());
      const normalizedNumber = normalizeCode(cc.number);
      if (normalizedNumber) numbers.add(normalizedNumber);
    });
  return { ids, numbers };
}

function matchesOpexCostCenterFilter(filter, costCenterId, costCenterNumber) {
  if (!filter) {
    return true;
  }
  const normalizedId = String(costCenterId || "").trim();
  if (normalizedId && filter.ids.has(normalizedId)) {
    return true;
  }
  const normalizedNumber = normalizeCode(costCenterNumber);
  return normalizedNumber ? filter.numbers.has(normalizedNumber) : false;
}

// ─── OPEX DRILLDOWN ───────────────────────────────────────────────────────────
let _opexPopover = null;
let _opexActiveCell = null;

function initOpexDrilldown(tableEl, ledgerRows, validCcFilter) {
  // Normaliza ledger CC
  const normalized = ledgerRows.map((row) => ({
    account:   normalizeCode(row.account_number ?? row.accountNumber),
    ccId:      String(row.cost_center_id ?? row.costCenterId ?? "").trim(),
    cc:        normalizeCode(row.cost_center_number ?? row.costCenterNumber),
    month:     Number(row.reference_month ?? row.referenceMonth ?? extractMonthFromDate(row.entry_date ?? row.entryDate)),
    date:      String(row.entry_date ?? row.entryDate ?? "").trim(),
    history:   String(row.history ?? "").trim(),
    amount:    Number(row.amount)
  })).filter((r) => r.account && r.month >= 1 && r.month <= 12 && Number.isFinite(r.amount));

  // Mapa CC → nome
  const ccNameMap = new Map(
    state.costCenters.map((cc) => [normalizeCode(cc.number), cc.name || ""])
  );

  tableEl.addEventListener("click", (event) => {
    const td = event.target.closest(".opex-drillable");
    if (!td) { closeOpexPopover(); return; }

    const account  = td.dataset.account;
    const monthIdx = Number(td.dataset.monthIdx);
    if (!account || isNaN(monthIdx)) return;

    if (_opexPopover?.dataset.account === account && Number(_opexPopover.dataset.monthIdx) === monthIdx) {
      closeOpexPopover(); return;
    }
    closeOpexPopover();

    if (_opexActiveCell) _opexActiveCell.classList.remove("opex-drillable-active");
    _opexActiveCell = td;
    td.classList.add("opex-drillable-active");

    const entries = normalized.filter((r) => {
      if (r.account !== account) return false;
      if (r.month - 1 !== monthIdx) return false;
      if (!matchesOpexCostCenterFilter(validCcFilter, r.ccId, r.cc)) return false;
      return true;
    });

    // Converter para o formato esperado por buildSocDrillPopover
    const socEntries = entries.map(r => ({
      entry_date:          r.date || "",
      cc:                  r.cc   || "",
      history:             r.history || "",
      amount:              r.amount
    }));

    const accountName = td.closest("tr")?.querySelector(".opex-name-col span")?.textContent || account;
    const monthLabel  = MONTH_LABELS[monthIdx] || String(monthIdx + 1);
    const total       = entries.reduce((s, r) => s + r.amount, 0);

    _opexPopover = buildSocDrillPopover(accountName, monthLabel, account, socEntries, total, monthIdx);
    document.body.appendChild(_opexPopover);
    positionAuditPopover(_opexPopover, td.getBoundingClientRect());
  });

  document.addEventListener("click", onDocClickCloseOpex, true);
}

function closeOpexPopover() {
  if (_opexPopover) { _opexPopover.remove(); _opexPopover = null; }
  if (_opexActiveCell) { _opexActiveCell.classList.remove("opex-drillable-active"); _opexActiveCell = null; }
}

function onDocClickCloseOpex(event) {
  if (_opexPopover && !_opexPopover.contains(event.target) && !event.target.closest(".opex-drillable")) {
    closeOpexPopover();
  }
}
// ─── FIM OPEX DRILLDOWN ───────────────────────────────────────────────────────

// ─── TRILHA DE AUDITORIA — DRE GERENCIAL ─────────────────────────────────────
let _auditPopover = null;

function initDreGerDrilldown(tableWrap, ledgerRows, year, source = "real") {
  // Totais mensais por conta (sem CC) — usado para Admin/super_admin (consolidado).
  const normalized = ledgerRows.map((row) => ({
    code: normalizeCode(row.accountNumber ?? row.account_number),
    name: String(row.accountName ?? row.account_name ?? ""),
    month: Number(row.referenceMonth ?? row.reference_month ?? extractMonthFromDate(row.entryDate ?? row.entry_date)),
    amount: Number(row.amount)
  })).filter((r) => r.code && r.month >= 1 && r.month <= 12 && Number.isFinite(r.amount));

  // Mapa código → nome (pega o primeiro nome encontrado no ledger; fallback no state.accounts)
  const nameByCode = new Map();
  normalized.forEach(({ code, name }) => {
    if (!nameByCode.has(code) && name) nameByCode.set(code, name);
  });
  state.accounts.forEach((acc) => {
    if (!nameByCode.has(acc.number)) nameByCode.set(acc.number, acc.name || "");
  });

  // Linhas ricas com CC — buscadas sob demanda só quando o perfil é restrito
  // (Gestor/Analista), para filtrar o drilldown pelos CCs da gestão.
  let richRows = null;
  let richFetched = false;
  const ensureRich = async () => {
    if (richFetched) return;
    richFetched = true;
    try {
      const rows = await (source === "budget" ? fetchBudgetLedgerFullForYear : fetchActualsLedgerFullForYear)(year);
      richRows = rows.map((row) => ({
        code: normalizeCode(row.account_number ?? ""),
        cc: String(row.cost_center_number ?? ""),
        month: Number(row.reference_month),
        amount: Number(row.amount)
      })).filter((r) => r.code && r.month >= 1 && r.month <= 12 && Number.isFinite(r.amount));
    } catch (e) {
      console.warn("Falha ao buscar ledger detalhado para drilldown gerencial", e);
      richRows = [];
    }
  };

  tableWrap.addEventListener("click", async (event) => {
    const td = event.target.closest(".ger-drillable");
    if (!td) {
      closeAuditPopover();
      return;
    }
    const lineId = td.dataset.lineId;
    const monthIdx = Number(td.dataset.monthIdx);
    if (!lineId || isNaN(monthIdx)) return;

    // Evita reabrir o mesmo
    if (_auditPopover && _auditPopover.dataset.lineId === lineId && Number(_auditPopover.dataset.monthIdx) === monthIdx) {
      closeAuditPopover();
      return;
    }
    closeAuditPopover();

    const codes = resolveGerCodes(lineId);
    if (!codes || !codes.length) return;

    const lineName = td.closest("tr")?.querySelector(".ger-label-col span")?.textContent || lineId;
    const monthLabel = MONTH_LABELS[monthIdx] || String(monthIdx + 1);
    const rect = td.getBoundingClientRect();

    // Drill-down respeita o acesso: Gestor/Analista só veem os CCs da sua gestão.
    const allowedCcs = getAllowedCcNumbers();

    const byCode = new Map();
    if (allowedCcs) {
      await ensureRich();
      (richRows || []).forEach(({ code, cc, month, amount }) => {
        if (month - 1 !== monthIdx) return;
        if (!codes.includes(code)) return;
        if (!allowedCcs.has(String(cc).trim())) return;
        byCode.set(code, (byCode.get(code) || 0) + amount);
      });
    } else {
      normalized.forEach(({ code, month, amount }) => {
        if (month - 1 !== monthIdx) return;
        if (!codes.includes(code)) return;
        byCode.set(code, (byCode.get(code) || 0) + amount);
      });
    }

    // Monta linhas ordenadas pelo código (oculta zeros para não poluir)
    const rows = codes
      .filter((code) => byCode.has(code))
      .map((code) => ({
        code,
        name: nameByCode.get(code) || "—",
        amount: byCode.get(code) || 0
      }))
      .filter((r) => r.amount !== 0);

    // Sem lançamentos visíveis: dá feedback no lugar de não fazer nada.
    if (!rows.length) {
      const msg = allowedCcs
        ? "Esta linha não possui lançamentos nos seus centros de custo."
        : "Sem lançamentos detalhados para esta linha.";
      _auditPopover = buildSocDrillEmptyPopover(lineName, monthLabel, lineId, monthIdx, msg);
      _auditPopover.dataset.lineId = lineId;
      document.body.appendChild(_auditPopover);
      positionAuditPopover(_auditPopover, rect);
      return;
    }

    const total = rows.reduce((s, r) => s + r.amount, 0);

    // Aplica sinal negativo igual ao cálculo do DRE (neg())
    const displayRows = rows.map((r) => ({ ...r, amount: -r.amount }));
    const displayTotal = -total;

    _auditPopover = buildAuditPopover(lineName, monthLabel, displayRows, displayTotal, lineId, monthIdx);
    document.body.appendChild(_auditPopover);
    positionAuditPopover(_auditPopover, rect);
  });

  // Fecha ao clicar fora
  document.addEventListener("click", onDocClickCloseAudit, true);
}



async function fetchActualsSocLedgerForYear(year) {
  const organizationId = await resolveOrganizationId();
  const pageSize = 1000;
  const rows = [];
  for (let month = 1; month <= 12; month++) {
    let offset = 0;
    while (true) {
      const page = await fetchSupabaseRowsSafe(
        "actuals_ledger_entries",
        `organization_id=eq.${organizationId}&reference_year=eq.${year}&reference_month=eq.${month}` +
        `&select=account_number,branch_code,cost_center_number,entry_date,history,lot_code,amount,reference_month` +
        `&order=entry_date.asc,id.asc&limit=${pageSize}&offset=${offset}`
      );
      rows.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
  }
  return rows;
}

function initDreSocDrilldown(tableWrap, year, source = "real") {
  // Normaliza com todos os campos de detalhe — realizado ou planejado (budget)
  const normalized = [];

  // Cache de ledger rico — busca na primeira interação
  let richRows = normalized;
  let richFetched = false;

  const ensureRichRows = async (year) => {
    if (richFetched) return;
    richFetched = true;
    try {
      const rows = await (source === "budget" ? fetchBudgetLedgerFullForYear : fetchActualsLedgerFullForYear)(year);
      richRows = rows.map((row) => ({
        code:    normalizeCode(row.account_number ?? ""),
        branch:  String(row.branch_code ?? ""),
        cc:      String(row.cost_center_number ?? ""),
        date:    String(row.entry_date ?? ""),
        history: String(row.history ?? ""),
        lot:     String(row.lot_code ?? ""),
        amount:  Number(row.amount),
        month:   Number(row.reference_month)
      })).filter((r) => r.code && r.month >= 1 && r.month <= 12 && Number.isFinite(r.amount));
    } catch (e) {
      console.warn("Falha ao buscar ledger detalhado para drilldown societário", e);
    }
  };

  tableWrap.addEventListener("click", async (event) => {
    const td = event.target.closest(".soc-drillable");
    if (!td) { closeSocPopover(); return; }

    const code = td.dataset.accountCode;
    const monthIdx = Number(td.dataset.monthIdx);
    if (!code || isNaN(monthIdx)) return;

    // Evita reabrir o mesmo
    if (_socPopover && _socPopover.dataset.code === code && Number(_socPopover.dataset.monthIdx) === monthIdx) {
      closeSocPopover(); return;
    }
    closeSocPopover();

    // Garantir dados ricos
    await ensureRichRows(year);

    const lineName = td.closest("tr")?.querySelector(".soc-label-col span")?.textContent || code;
    const monthLabel = MONTH_LABELS[monthIdx] || String(monthIdx + 1);
    const rect = td.getBoundingClientRect();

    // Drill-down respeita o acesso do perfil: Gestor/Analista só veem
    // lançamentos dos CCs da sua gestão (null = sem restrição → admin).
    const allowedCcs = getAllowedCcNumbers();
    const allForCell = richRows.filter(r => r.code === code && r.month - 1 === monthIdx);
    const entries = allowedCcs
      ? allForCell.filter(r => allowedCcs.has(String(r.cc).trim()))
      : allForCell;

    // Sem lançamentos visíveis: dá feedback no lugar de não fazer nada.
    if (!entries.length) {
      const ocultadoPorAcesso = allowedCcs && allForCell.length > 0;
      const msg = ocultadoPorAcesso
        ? "Este valor não possui lançamentos nos seus centros de custo."
        : "Sem lançamentos detalhados para esta linha.";
      _socPopover = buildSocDrillEmptyPopover(lineName, monthLabel, code, monthIdx, msg);
      document.body.appendChild(_socPopover);
      positionAuditPopover(_socPopover, rect);
      return;
    }

    const total = entries.reduce((s, r) => s + r.amount, 0);
    _socPopover = buildSocDrillPopover(lineName, monthLabel, code, entries, total, monthIdx);
    document.body.appendChild(_socPopover);
    positionAuditPopover(_socPopover, rect);
  });

  document.addEventListener("click", onDocClickCloseSoc, true);
}

let _socPopover = null;

function closeSocPopover() {
  if (_socPopover) { _socPopover.remove(); _socPopover = null; }
  document.removeEventListener("click", onDocClickCloseSoc, true);
}

function onDocClickCloseSoc(event) {
  if (!_socPopover) return;
  if (!_socPopover.contains(event.target) && !event.target.closest(".soc-drillable")) {
    closeSocPopover();
  }
}

function buildSocDrillEmptyPopover(lineName, monthLabel, code, monthIdx, message) {
  const pop = document.createElement("div");
  pop.dataset.code = code;
  pop.dataset.monthIdx = String(monthIdx);
  pop.style.cssText = "position:fixed;z-index:9800;background:var(--panel);border:0.5px solid var(--line);border-radius:12px;padding:16px 20px;min-width:300px;max-width:420px;box-shadow:0 20px 50px rgba(0,0,0,0.55)";
  pop.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
      <div>
        <p style="font-size:0.65rem;color:var(--text-faint);letter-spacing:0.07em;text-transform:uppercase;margin:0 0 3px">${escapeHtml(monthLabel)} · ${escapeHtml(code)}</p>
        <h4 style="font-size:0.9rem;font-weight:600;color:var(--text);margin:0">${escapeHtml(lineName)}</h4>
      </div>
      <button onclick="this.closest('[data-code]').remove()" style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:18px;padding:0 0 0 12px;line-height:1">×</button>
    </div>
    <p style="font-size:0.78rem;color:var(--text-soft);margin:0;display:flex;align-items:center;gap:8px;line-height:1.4">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--amber)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12.5"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      ${escapeHtml(message)}
    </p>
  `;
  return pop;
}

function buildSocDrillPopover(lineName, monthLabel, code, entries, total, monthIdx) {
  const fmt = (v) => formatSignedCurrency(v);
  // Mapa cc_number → nome do CC
  const ccNameMap = new Map(state.costCenters.map(c => [String(c.number || ""), c.name || ""]));
  const fmtDate = (d) => {
    if (!d) return "—";
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
  };

  const rows = entries
    .slice()
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .map((r) => `
      <tr>
        <td style="padding:4px 8px 4px 0;font-size:0.72rem;color:var(--text-faint);white-space:nowrap">${escapeHtml(fmtDate(r.date))}</td>
        <td style="padding:4px 8px;font-size:0.72rem;color:var(--text-faint);white-space:nowrap;font-family:monospace">${escapeHtml(r.cc || "—")}</td>
        <td style="padding:4px 8px;font-size:0.72rem;color:var(--text-soft);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(ccNameMap.get(r.cc||"") || "")}">${escapeHtml(ccNameMap.get(r.cc||"") || "—")}</td>
        <td style="padding:4px 8px;font-size:0.72rem;color:var(--text-soft);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.history)}">${escapeHtml(r.history || "—")}</td>
        <td style="padding:4px 0 4px 8px;font-size:0.72rem;color:var(--text);text-align:right;white-space:nowrap">${escapeHtml(fmt(r.amount))}</td>
      </tr>`).join("");

  const pop = document.createElement("div");
  pop.dataset.code = code;
  pop.dataset.monthIdx = String(monthIdx);
  pop.style.cssText = "position:fixed;z-index:9800;background:var(--panel);border:0.5px solid var(--line);border-radius:12px;padding:16px 20px;min-width:560px;max-width:700px;max-height:70vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,0.55)";
  pop.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
      <div>
        <p style="font-size:0.65rem;color:var(--text-faint);letter-spacing:0.07em;text-transform:uppercase;margin:0 0 3px">${escapeHtml(monthLabel)} · ${escapeHtml(code)}</p>
        <h4 style="font-size:0.9rem;font-weight:600;color:var(--text);margin:0">${escapeHtml(lineName)}</h4>
      </div>
      <button onclick="this.closest('[data-code]').remove()" style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:18px;padding:0 0 0 12px;line-height:1">×</button>
    </div>
    <div style="margin-bottom:12px;padding-bottom:10px;border-bottom:0.5px solid var(--line)">
      <span style="font-size:1.1rem;font-weight:700;color:var(--text)">${escapeHtml(fmt(total))}</span>
      <span style="font-size:0.72rem;color:var(--text-faint);margin-left:8px">${entries.length} lançamento(s)</span>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:0.5px solid var(--line)">
            <th style="padding:3px 8px 6px 0;font-size:0.62rem;color:var(--text-faint);text-align:left;font-weight:500;white-space:nowrap">Data</th>
            <th style="padding:3px 8px 6px;font-size:0.62rem;color:var(--text-faint);text-align:left;font-weight:500">CC</th>
            <th style="padding:3px 8px 6px;font-size:0.62rem;color:var(--text-faint);text-align:left;font-weight:500">Nome CC</th>
            <th style="padding:3px 8px 6px;font-size:0.62rem;color:var(--text-faint);text-align:left;font-weight:500">Histórico</th>
            <th style="padding:3px 0 6px 8px;font-size:0.62rem;color:var(--text-faint);text-align:right;font-weight:500">Valor</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  return pop;
}

function buildAuditPopover(lineName, monthLabel, rows, total, lineId, monthIdx) {
  const popover = document.createElement("div");
  popover.className = "ger-audit-popover";
  popover.dataset.lineId = lineId;
  popover.dataset.monthIdx = String(monthIdx);

  const hasData = rows.length > 0;

  const tableRows = rows.map((r) => `
    <tr>
      <td class="gap-code">${escapeHtml(r.code)}</td>
      <td class="gap-name">${escapeHtml(r.name)}</td>
      <td class="gap-val">${escapeHtml(formatSignedCurrency(r.amount))}</td>
    </tr>
  `).join("");

  popover.innerHTML = `
    <div class="gap-header">
      <span class="gap-title">${escapeHtml(lineName)}</span>
      <span class="gap-badge">${escapeHtml(monthLabel)}</span>
      <button class="gap-close" aria-label="Fechar">✕</button>
    </div>
    ${hasData ? `
    <div class="gap-table-wrap">
      <table class="gap-table">
        <thead>
          <tr>
            <th class="gap-code">Conta</th>
            <th class="gap-name">Descrição</th>
            <th class="gap-val">Valor</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div class="gap-footer">
      <span class="gap-footer-label">Total</span>
      <span class="gap-footer-val ${total < 0 ? "gap-neg" : total > 0 ? "gap-pos" : ""}">${escapeHtml(formatSignedCurrency(total))}</span>
    </div>
    ` : `<div class="gap-empty">Nenhum lançamento encontrado para este período.</div>`}
  `;

  popover.querySelector(".gap-close").addEventListener("click", (e) => {
    e.stopPropagation();
    closeAuditPopover();
  });

  return popover;
}

function positionAuditPopover(popover) {
  // Centraliza o popover na tela.
  popover.style.position = "fixed";
  popover.style.top = "50%";
  popover.style.left = "50%";
  popover.style.right = "auto";
  popover.style.transform = "translate(-50%, -50%)";
  popover.style.maxHeight = "82vh";
  popover.style.overflowY = "auto";
}

function closeAuditPopover() {
  if (_auditPopover) {
    _auditPopover.remove();
    _auditPopover = null;
  }
}

function onDocClickCloseAudit(event) {
  if (_auditPopover && !_auditPopover.contains(event.target) && !event.target.closest(".ger-drillable")) {
    closeAuditPopover();
  }
}
// ─── FIM TRILHA DE AUDITORIA ──────────────────────────────────────────────────

// ─── Column resize for report tables ─────────────────────────────────────────
function initTableColumnResize(table) {
  if (!table || table.dataset.colResizeInit) return;
  table.dataset.colResizeInit = "true";

  const ths = Array.from(table.querySelectorAll("thead tr th"));
  const cols = Array.from(table.querySelectorAll("colgroup col"));

  ths.forEach((th, colIdx) => {
    const handle = th.querySelector(".col-resizer");
    if (!handle) return;

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = th.getBoundingClientRect().width;

      const setWidth = (px) => {
        th.style.minWidth = px + "px";
        th.style.width    = px + "px";
        th.style.maxWidth = px + "px";
        const col = cols[colIdx];
        if (col) {
          col.style.width = px + "px";
          col.style.minWidth = px + "px";
        }
        table.querySelectorAll("tbody tr").forEach((tr) => {
          const td = tr.children[colIdx];
          if (td) {
            td.style.minWidth = px + "px";
            td.style.width    = px + "px";
            td.style.maxWidth = px + "px";
          }
        });
        updateFrozenOffsets(table);
      };

      const onMove = (ev) => {
        setWidth(Math.max(50, startW + ev.clientX - startX));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor     = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor     = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  });

  queueReportTableSync(table);

  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => queueReportTableSync(table));
    observer.observe(table);
    if (table.parentElement) {
      observer.observe(table.parentElement);
    }
    table.__colResizeObserver = observer;
  }

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => queueReportTableSync(table)).catch(() => {});
  }
}


function queueReportTableSync(table) {
  if (!table) return;
  if (table.__reportSyncFrame) {
    cancelAnimationFrame(table.__reportSyncFrame);
  }
  table.__reportSyncFrame = requestAnimationFrame(() => {
    table.__reportSyncFrame = null;
    updateFrozenOffsets(table);
  });
}

function updateFrozenOffsets(table) {
  if (!table) return;

  const headerCells = Array.from(table.querySelectorAll("thead tr th"));
  let runningLeft = 0;

  headerCells.forEach((th) => {
    const frozenClass = Array.from(th.classList).find((className) => /^col-frozen-\d+$/.test(className));
    if (!frozenClass) {
      return;
    }

    table.querySelectorAll(`.${frozenClass}`).forEach((cell) => {
      cell.style.left = `${runningLeft}px`;
    });

    runningLeft += th.getBoundingClientRect().width;
  });
}

function initAllReportTableResizers() {
  document.querySelectorAll("table[data-resizable-cols]").forEach((t) => {
    initTableColumnResize(t);
    queueReportTableSync(t);
  });
}

window.addEventListener("resize", () => {
  document.querySelectorAll("table[data-resizable-cols]").forEach((table) => queueReportTableSync(table));
});
// ─────────────────────────────────────────────────────────────────────────────

function zeroMonthArray() {
  return Array.from({ length: 12 }, () => 0);
}

function sumMonthArrays(arrays) {
  return arrays.reduce((acc, current) => {
    current.forEach((value, index) => {
      acc[index] += Number(value || 0);
    });
    return acc;
  }, zeroMonthArray());
}

function extractMonthFromDate(value) {
  const iso = normalizeDateInput(value);
  if (!iso) {
    return null;
  }
  return Number(String(iso).split("-")[1] || 0);
}

function formatSignedCurrency(value) {
  if (!Number.isFinite(Number(value)) || Math.abs(Number(value)) < 0.0001) {
    return "-";
  }
  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

async function ensureReportsDataForYear(year) {
  const normalizedYear = Number(year || state.currentPeriod?.year || 2026);
  if (reportsLedgerCache.has(normalizedYear) || reportsLoadingYear === normalizedYear) {
    return;
  }

  reportsErrorMessage = "";
  reportsLoadingYear = normalizedYear;
  renderReportsView();

  try {
    const rows = isSupabaseConfigured()
      ? await fetchActualsReportRowsForYear(normalizedYear)
      : await buildLocalLedgerEntriesForYear(normalizedYear);

    reportsLedgerCache.set(normalizedYear, { rows });
    reportsLastLoadedYear = normalizedYear;
    reportsLastLoadedAt = new Date().toISOString();
  } catch (error) {
    console.error(error);
    reportsErrorMessage = String(error?.message || error || "Nao foi possivel carregar o DRE Soc Real.");
  } finally {
    reportsLoadingYear = null;
    renderReportsView();
  }
}

function invalidateReportsForYear(year) {
  const normalizedYear = Number(year || state.currentPeriod?.year || 2026);
  reportsLedgerCache.delete(normalizedYear);
  reportsLedgerCache.delete(`opex-cc-${normalizedYear}`);
  _socFullLedgerCache.delete(normalizedYear);
  [...reportsLedgerCache.keys()]
    .filter((key) => typeof key === "string" && key.startsWith(`opex-mgmt-${normalizedYear}-`))
    .forEach((key) => reportsLedgerCache.delete(key));
  reportsErrorMessage = "";
  if (reportsLastLoadedYear === normalizedYear) {
    reportsLastLoadedYear = null;
    reportsLastLoadedAt = null;
  }
}

function invalidateBudgetReportsForYear(year) {
  const normalizedYear = Number(year || state.currentPeriod?.year || 2026);
  reportsBudgetCache.delete(normalizedYear);
  budgetReportsErrorMessage = "";
}

async function fetchActualsReportRowsForYear(year) {
  try {
    const monthlyTotalsRows = await fetchActualsMonthlyAccountTotalsForYear(year);
    if (monthlyTotalsRows.length > 0) {
      return monthlyTotalsRows;
    }
    return fetchActualsLedgerEntriesForYear(year);
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }
    return fetchActualsLedgerEntriesForYear(year);
  }
}

// ── Budget reports data loading ───────────────────────────────────────────────

async function ensureBudgetReportsDataForYear(year) {
  const normalizedYear = Number(year || state.currentPeriod?.year || 2026);
  if (reportsBudgetCache.has(normalizedYear) || budgetReportsLoadingYear === normalizedYear) return;

  budgetReportsErrorMessage = "";
  budgetReportsLoadingYear = normalizedYear;
  renderReportsView();

  try {
    const rows = isSupabaseConfigured()
      ? await fetchBudgetReportRowsForYear(normalizedYear)
      : await buildLocalBudgetLedgerEntriesForYear(normalizedYear);

    reportsBudgetCache.set(normalizedYear, { rows });
  } catch (error) {
    console.error(error);
    budgetReportsErrorMessage = String(error?.message || error || "Não foi possível carregar o DRE Budget.");
  } finally {
    budgetReportsLoadingYear = null;
    renderReportsView();
  }
}

async function fetchBudgetReportRowsForYear(year) {
  try {
    const monthlyTotalsRows = await fetchBudgetMonthlyAccountTotalsForYear(year);
    if (monthlyTotalsRows.length > 0) {
      return monthlyTotalsRows;
    }
    return fetchBudgetLedgerEntriesForYear(year);
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
    return fetchBudgetLedgerEntriesForYear(year);
  }
}

async function fetchBudgetMonthlyAccountTotalsForYear(year) {
  const organizationId = await resolveOrganizationId();
  const pageSize = 1000;
  const rows = [];
  let offset = 0;

  while (true) {
    const page = await fetchSupabaseRowsSafe(
      "budget_monthly_account_totals",
      `organization_id=eq.${organizationId}&reference_year=eq.${year}&select=account_number,reference_month,total_amount&order=reference_month.asc,account_number.asc&limit=${pageSize}&offset=${offset}`
    );
    rows.push(...page);
    if (page.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return rows.map((row) => ({
    account_number: row.account_number,
    reference_month: row.reference_month,
    amount: row.total_amount
  }));
}

async function fetchBudgetLedgerEntriesForYear(year) {
  const organizationId = await resolveOrganizationId();
  const pageSize = 1000;
  const rows = [];
  for (let month = 1; month <= 12; month++) {
    let offset = 0;
    while (true) {
      const page = await fetchSupabaseRowsSafe(
        "budget_ledger_entries",
        `organization_id=eq.${organizationId}&reference_year=eq.${year}&reference_month=eq.${month}&select=id,account_number,amount,reference_month&order=id.asc&limit=${pageSize}&offset=${offset}`
      );
      rows.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
  }
  return rows;
}

async function buildLocalBudgetLedgerEntriesForYear(year) {
  const appliedBatches = state.budgetBatches.filter((batch) =>
    batch.status === "applied" && Number(batch.referenceYear) === Number(year)
  );
  const rows = [];
  for (const batch of appliedBatches) {
    await ensureBudgetBatchRowsLoaded(batch.id, true);
    (state.budgetRowsByBatch[batch.id] || [])
      .filter((row) => row.validationStatus === "valid")
      .forEach((row) => {
        rows.push({
          account_number: row.accountNumber,
          amount: row.amount,
          reference_month: batch.referenceMonth
        });
      });
  }
  return rows;
}

async function fetchActualsMonthlyAccountTotalsForYear(year) {
  const organizationId = await resolveOrganizationId();
  const pageSize = 1000;
  const rows = [];
  let offset = 0;

  while (true) {
    const page = await fetchSupabaseRowsSafe(
      "actuals_monthly_account_totals",
      `organization_id=eq.${organizationId}&reference_year=eq.${year}&select=account_number,reference_month,total_amount&order=reference_month.asc,account_number.asc&limit=${pageSize}&offset=${offset}`
    );
    rows.push(...page);
    if (page.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return rows.map((row) => ({
    account_number: row.account_number,
    reference_month: row.reference_month,
    amount: row.total_amount
  }));
}

async function fetchActualsLedgerFullForYear(year) {
  const organizationId = await resolveOrganizationId();
  const pageSize = 1000;
  const rows = [];
  for (let month = 1; month <= 12; month++) {
    let offset = 0;
    while (true) {
      const page = await fetchSupabaseRowsSafe(
        "actuals_ledger_entries",
        `organization_id=eq.${organizationId}&reference_year=eq.${year}&reference_month=eq.${month}` +
        `&select=account_number,branch_code,cost_center_number,lot_code,history,amount,reference_month,entry_date` +
        `&order=entry_date.asc,id.asc&limit=${pageSize}&offset=${offset}`
      );
      rows.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
  }
  return rows;
}

async function fetchBudgetLedgerFullForYear(year) {
  const organizationId = await resolveOrganizationId();
  const pageSize = 1000;
  const rows = [];
  for (let month = 1; month <= 12; month++) {
    let offset = 0;
    while (true) {
      const page = await fetchSupabaseRowsSafe(
        "budget_ledger_entries",
        `organization_id=eq.${organizationId}&reference_year=eq.${year}&reference_month=eq.${month}` +
        `&select=account_number,branch_code,cost_center_number,lot_code,history,amount,reference_month` +
        `&order=id.asc&limit=${pageSize}&offset=${offset}`
      );
      rows.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
  }
  return rows;
}

async function fetchBudgetLedgerForCcIds(year, ccIds) {
  const organizationId = await resolveOrganizationId();
  const encodedIds = [...ccIds].join(",");
  if (!encodedIds) return [];
  const pageSize = 1000;
  const rows = [];
  for (let month = 1; month <= 12; month += 1) {
    let lastId = "00000000-0000-0000-0000-000000000000";
    while (true) {
      const page = await fetchSupabaseRowsSafe(
        "budget_ledger_entries",
        `organization_id=eq.${organizationId}&reference_year=eq.${year}&reference_month=eq.${month}&cost_center_id=in.(${encodedIds})&id=gt.${lastId}&select=id,account_number,cost_center_id,cost_center_number,amount,reference_month&order=id.asc&limit=${pageSize}`
      );
      rows.push(...page);
      if (page.length < pageSize) break;
      lastId = page[page.length - 1].id;
    }
  }
  return rows;
}

async function fetchBudgetLedgerForManagementYear(year, management) {
  const filter = buildOpexCostCenterFilter(management);
  const ccIds = [...(filter?.ids || [])].filter(Boolean);
  if (!ccIds.length) return [];
  return fetchBudgetLedgerForCcIds(year, ccIds);
}

async function fetchActualsLedgerEntriesForYear(year) {
  const organizationId = await resolveOrganizationId();
  const pageSize = 1000;
  const rows = [];

  for (let month = 1; month <= 12; month += 1) {
    let offset = 0;

    while (true) {
      const page = await fetchSupabaseRowsSafe(
        "actuals_ledger_entries",
        `organization_id=eq.${organizationId}&reference_year=eq.${year}&reference_month=eq.${month}&select=id,account_number,amount,reference_month,entry_date&order=id.asc&limit=${pageSize}&offset=${offset}`
      );
      rows.push(...page);
      if (page.length < pageSize) {
        break;
      }
      offset += pageSize;
    }
  }

  return rows;
}

async function fetchActualsLedgerWithCcForYear(year) {
  const organizationId = await resolveOrganizationId();
  const pageSize = 1000;
  const rows = [];

  for (let month = 1; month <= 12; month += 1) {
    let lastId = "00000000-0000-0000-0000-000000000000";
    while (true) {
      const page = await fetchSupabaseRowsSafe(
        "actuals_ledger_entries",
        `organization_id=eq.${organizationId}&reference_year=eq.${year}&reference_month=eq.${month}&id=gt.${lastId}&select=id,account_number,cost_center_id,cost_center_number,amount,reference_month,entry_date,history&order=id.asc&limit=${pageSize}`
      );
      rows.push(...page);
      if (page.length < pageSize) break;
      lastId = page[page.length - 1].id;
    }
  }
  return rows;
}

async function fetchActualsLedgerForCcIds(year, ccIds) {
  const organizationId = await resolveOrganizationId();
  const encodedIds = [...ccIds].join(",");
  if (!encodedIds) return [];
  const pageSize = 1000;
  const rows = [];
  for (let month = 1; month <= 12; month += 1) {
    let lastId = "00000000-0000-0000-0000-000000000000";
    while (true) {
      const page = await fetchSupabaseRowsSafe(
        "actuals_ledger_entries",
        `organization_id=eq.${organizationId}&reference_year=eq.${year}&reference_month=eq.${month}&cost_center_id=in.(${encodedIds})&id=gt.${lastId}&select=id,account_number,cost_center_id,cost_center_number,amount,reference_month,entry_date,history&order=id.asc&limit=${pageSize}`
      );
      rows.push(...page);
      if (page.length < pageSize) break;
      lastId = page[page.length - 1].id;
    }
  }
  return rows;
}

async function fetchActualsLedgerForManagementYear(year, management) {
  const filter = buildOpexCostCenterFilter(management);
  const ccIds = [...(filter?.ids || [])].filter(Boolean);
  if (!ccIds.length) return [];
  return fetchActualsLedgerForCcIds(year, ccIds);
}

async function buildLocalLedgerEntriesForYear(year) {
  const appliedBatches = state.actualsBatches.filter((batch) => (
    batch.status === "applied" && Number(batch.referenceYear) === Number(year)
  ));
  const rows = [];
  for (const batch of appliedBatches) {
    await ensureActualsBatchRowsLoaded(batch.id, true);
    (state.actualsRowsByBatch[batch.id] || [])
      .filter((row) => row.validationStatus === "valid")
      .forEach((row) => {
        rows.push({
          account_number: row.accountNumber,
          amount: row.amount,
          reference_month: batch.referenceMonth,
          entry_date: row.entryDate
        });
      });
  }
  return rows;
}

function renderBranchEditor() {
  return branchTreeModule.renderBranchEditor();
}

function renderDreTree() {
  return dreTreeModule.renderDreTree();
}

function renderDreEditor() {
  return dreTreeModule.renderDreEditor();
}

function renderCcTree() {
  return ccTreeModule.renderCcTree();
}

function renderCcEditor() {
  return ccTreeModule.renderCcEditor();
}

function handleDreDrop(sourceCode, targetCode) {
  const source = findDreNode(sourceCode);
  const target = targetCode === ROOT_DRE_NODE.code ? ROOT_DRE_NODE : findDreNode(targetCode);
  if (!source || !target) {
    return;
  }

  if (target.code !== ROOT_DRE_NODE.code && isDescendant(target.code, source.code)) {
    return;
  }

  const newParentCode = target.code === ROOT_DRE_NODE.code
    ? null
    : target.class === "Sintetica"
      ? target.code
      : target.parentCode || null;
  if (source.parentCode === newParentCode) {
    return;
  }

  state.dreNodes = state.dreNodes.map((node) => (
    node.code === source.code ? { ...node, parentCode: newParentCode } : node
  ));
  expandedDreCodes.add(newParentCode);
  selectedDreCode = source.code;
  persistAndRender();
}

function handleCcDrop(sourceCode, targetCode) {
  const source = findCcNode(sourceCode);
  const target = targetCode === ROOT_CC_NODE.code ? ROOT_CC_NODE : findCcNode(targetCode);
  if (!source || !target || source.class === "Sintetica") {
    return;
  }

  const newParentCode = target.code === ROOT_CC_NODE.code
    ? getCcTypeNodeCode(source.type)
    : target.class === "Sintetica"
      ? target.code
      : getCcTypeNodeCode(target.type);

  const newType = target.code === ROOT_CC_NODE.code
    ? source.type
    : target.class === "Sintetica"
      ? target.type
      : target.type;

  state.ccNodes = state.ccNodes.map((node) => (
    node.code === source.code ? { ...node, parentCode: newParentCode, type: newType } : node
  ));

  state.costCenters = state.costCenters.map((cc) => (
    cc.number === source.code ? { ...cc, type: newType } : cc
  ));

  if (newParentCode) {
    expandedCcCodes.add(newParentCode);
  }
  selectedCcCode = source.code;
  persistAndRender();
}

function buildTreeRoot() {
  return { ...ROOT_DRE_NODE };
}

function buildCcTreeRoot() {
  return { ...ROOT_CC_NODE };
}

function getBranches() {
  return state.branches
    .slice()
    .sort((left, right) => left.code.localeCompare(right.code, "pt-BR", { numeric: true }));
}

function findBranch(code) {
  return state.branches.find((branch) => branch.code === code) || null;
}

function getDreChildren(parentCode) {
  const normalizedParent = parentCode === ROOT_DRE_NODE.code ? null : parentCode;
  return state.dreNodes
    .filter((node) => (node.parentCode || null) === normalizedParent)
    .sort((left, right) => left.code.localeCompare(right.code, "pt-BR", { numeric: true }));
}

function findDreNode(code) {
  return state.dreNodes.find((node) => node.code === code) || null;
}

function getCcChildren(parentCode) {
  const normalizedParent = parentCode === ROOT_CC_NODE.code ? null : parentCode;
  return state.ccNodes
    .filter((node) => (node.parentCode || null) === normalizedParent)
    .sort((left, right) => left.code.localeCompare(right.code, "pt-BR", { numeric: true }));
}

function findCcNode(code) {
  return state.ccNodes.find((node) => node.code === code) || null;
}

function getNodeTone(node) {
  if (node.code === ROOT_DRE_NODE.code || node.class === "Sintetica") {
    return "synthetic";
  }
  if (node.origin === "actuals+structure") {
    return "actual";
  }
  return "analytic";
}

function describeBranchOrigin(origin) {
  if (origin === "seed") {
    return "Base inicial do app";
  }
  if (origin === "supabase") {
    return "Cadastro vindo do BD";
  }
  return "Cadastro manual";
}

function describeOrigin(origin) {
  if (origin === "actuals+structure") {
    return "Conta existente no seed e na estrutura do DRE";
  }
  if (origin === "estrutura") {
    return "Conta presente apenas na estrutura do DRE";
  }
  return "Conta criada manualmente";
}

function describeParent(parentCode) {
  if (!parentCode) {
    return ROOT_DRE_NODE.name;
  }
  const parent = findDreNode(parentCode);
  return parent ? `${parent.code} - ${parent.name}` : ROOT_DRE_NODE.name;
}

function describeCcParent(parentCode) {
  if (!parentCode) {
    return ROOT_CC_NODE.name;
  }
  const parent = findCcNode(parentCode);
  return parent ? `${parent.code} - ${parent.name}` : ROOT_CC_NODE.name;
}

function collectChildCodes(parentCode) {
  const collected = new Set();
  const stack = [parentCode];
  while (stack.length) {
    const current = stack.pop();
    state.dreNodes.forEach((node) => {
      if (node.parentCode === current) {
        collected.add(node.code);
        stack.push(node.code);
      }
    });
  }
  return collected;
}

function isDescendant(candidateCode, ancestorCode) {
  let cursor = findDreNode(candidateCode);
  while (cursor) {
    if (cursor.parentCode === ancestorCode) {
      return true;
    }
    cursor = cursor.parentCode ? findDreNode(cursor.parentCode) : null;
  }
  return false;
}

function generateDraftCode() {
  const base = "NOVA";
  let index = 1;
  while (findDreNode(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

function generateBranchDraftCode() {
  let index = 1;
  while (findBranch(String(index).padStart(2, "0"))) {
    index += 1;
  }
  return String(index).padStart(2, "0");
}

function generateCcDraftCode() {
  const base = "CC-NOVO";
  let index = 1;
  while (findCcNode(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

function getCcTypeNodeCode(type) {
  return state.ccNodes.find((node) => node.class === "Sintetica" && node.type === type)?.code || null;
}

function hasSupabaseBaseConfig() {
  return Boolean(
    supabaseConfig.projectUrl &&
    supabaseConfig.anonKey &&
    supabaseConfig.organizationName
  );
}

function isSupabaseConfigured() {
  return Boolean(hasSupabaseBaseConfig() && currentSession?.access_token);
}

function setSyncStatus(message, level = "ok") {
  if (!syncStatus) {
    return;
  }
  syncStatus.textContent = message;
  syncStatus.title = message;
  syncStatus.classList.remove("is-error", "is-warn");
  if (level === "error") {
    syncStatus.classList.add("is-error");
  } else if (level === "warn") {
    syncStatus.classList.add("is-warn");
  }
}

function formatSyncError(error) {
  const rawMessage = String(error?.message || error || "").trim();
  if (!rawMessage) {
    return "erro nao identificado";
  }

  if (rawMessage.includes("Organizacao") && rawMessage.includes("nao encontrada")) {
    return "usuario sem vinculo com a organizacao";
  }
  if (rawMessage.includes("JWT")) {
    return "sessao invalida";
  }
  if (rawMessage.includes("permission denied")) {
    return "sem permissao de leitura";
  }
  if (rawMessage.includes("Failed to fetch")) {
    return "sem resposta da API";
  }

  const compact = rawMessage
    .replaceAll(/\s+/g, " ")
    .replaceAll('"', "")
    .replaceAll("{", "")
    .replaceAll("}", "");

  return compact.slice(0, 90);
}

function buildAuthHeaders(token = null, extra = {}) {
  return {
    apikey: supabaseConfig.anonKey,
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra
  };
}

async function resolveOrganizationId() {
  if (organizationIdCache) {
    return organizationIdCache;
  }

  const rows = await fetchSupabaseRows(
    "organizations",
    `name=eq.${encodeURIComponent(supabaseConfig.organizationName)}&select=id&limit=1`
  );

  if (!rows.length) {
    throw new Error(`Organizacao ${supabaseConfig.organizationName} nao encontrada no BD.`);
  }

  organizationIdCache = rows[0].id;
  return organizationIdCache;
}

async function ensureSeedBranchesInSupabase(organizationId) {
  if (!organizationId || !isSupabaseConfigured()) {
    return;
  }

  const existingBranches = await fetchSupabaseRowsSafe(
    "branches",
    `organization_id=eq.${organizationId}&select=branch_code`
  );
  const existingCodes = new Set(
    existingBranches
      .map((row) => normalizeBranchCode(row.branch_code))
      .filter(Boolean)
  );
  const missingSeedBranches = branchSeed.branches.filter((branch) => !existingCodes.has(branch.code));

  if (!missingSeedBranches.length) {
    return;
  }

  await upsertSupabaseRows("branches", missingSeedBranches.map((branch) => ({
    organization_id: organizationId,
    branch_code: branch.code,
    branch_name: branch.name,
    origin: branch.origin || "seed",
    note: branch.note || ""
  })), ["organization_id", "branch_code"]);
}

async function ensureValidAccessToken() {
  if (!currentSession) {
    throw new Error("Sessao ausente.");
  }

  const expiresAt = Number(currentSession.expires_at || 0);
  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (expiresAt && expiresAt - nowInSeconds > 90) {
    return currentSession.access_token;
  }

  if (!currentSession.refresh_token) {
    throw new Error("Sessao expirada.");
  }

  const refreshed = await refreshSession(currentSession.refresh_token);
  applySession(refreshed);
  return currentSession.access_token;
}

async function authenticatedFetch(url, options = {}, retry = true) {
  const token = await ensureValidAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: buildAuthHeaders(token, options.headers || {})
  });

  if (response.status === 401 && retry && currentSession?.refresh_token) {
    const refreshed = await refreshSession(currentSession.refresh_token);
    applySession(refreshed);
    return authenticatedFetch(url, options, false);
  }

  return response;
}

async function fetchSupabaseRows(table, query) {
  const response = await authenticatedFetch(`${supabaseConfig.projectUrl}/rest/v1/${table}?${query}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

function isMissingRelationError(error, table) {
  const message = String(error?.message || error || "");
  if (!table) {
    return message.includes("does not exist")
      || message.includes("schema cache")
      || message.includes("PGRST205")
      || message.includes("PGRST116");
  }
  return message.includes(`relation \"public.${table}\" does not exist`)
    || message.includes(`relation 'public.${table}' does not exist`)
    || message.includes(`Could not find the table 'public.${table}' in the schema cache`)
    || (message.includes("PGRST205") && message.includes(`public.${table}`));
}

async function fetchSupabaseRowsSafe(table, query) {
  try {
    return await fetchSupabaseRows(table, query);
  } catch (error) {
    if (isMissingRelationError(error, table)) {
      return [];
    }
    throw error;
  }
}

async function upsertSupabaseRows(table, rows, conflictKeys) {
  const response = await authenticatedFetch(
    `${supabaseConfig.projectUrl}/rest/v1/${table}?on_conflict=${conflictKeys.join(",")}`,
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(rows)
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

async function deleteSupabaseRows(table, filters) {
  const response = await authenticatedFetch(`${supabaseConfig.projectUrl}/rest/v1/${table}?${filters}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=representation"
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response;
}

async function callSupabaseRpc(functionName, payload = {}) {
  const response = await authenticatedFetch(`${supabaseConfig.projectUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// Chama uma Supabase Edge Function (/functions/v1/<nome>) com o token do usuário.
async function callEdgeFunction(name, payload = {}) {
  const response = await authenticatedFetch(`${supabaseConfig.projectUrl}/functions/v1/${name}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.error || text || "Falha na função");
  }
  return data;
}

async function syncUserProfile() {
  if (!isSupabaseConfigured() || !currentUser?.id) {
    return;
  }

  try {
    setSyncStatus("Gravando perfil no BD...", "warn");
    const organizationId = await resolveOrganizationId();
    const profile = getResolvedProfile();

    // phone: coluna ainda não existe — adicionar após rodar migration:
    // ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone text DEFAULT '';
    const profilePayload = {
      organization_id: organizationId,
      user_id: currentUser.id,
      full_name: profile.name,
      email: profile.email,
      department: profile.department,
      profile_label: profile.role,
      photo_kind: profile.photoKind,
      photo_value: profile.photoValue
    };
    if (profile.phone) profilePayload.phone = profile.phone;

    await upsertSupabaseRows("user_profiles", [profilePayload], ["organization_id", "user_id"]);

    setSyncStatus("Perfil salvo no BD", "ok");
  } catch (error) {
    console.error(error);
    setSyncStatus(`Erro perfil: ${formatSyncError(error)}`, "error");
  }
}

async function syncDreNodeAndAccount(nodeCode) {
  if (!isSupabaseConfigured()) {
    return;
  }

  try {
    setSyncStatus("Gravando DRE no BD...", "warn");
    const organizationId = await resolveOrganizationId();
    const node = findDreNode(nodeCode);
    if (!node) {
      return;
    }

    let accountId = null;
    if (node.class === "Analitica") {
      const account = state.accounts.find((item) => item.number === node.code) || {
        control: "",
        number: node.code,
        name: node.name
      };

      const [savedAccount] = await upsertSupabaseRows("accounts", [{
        organization_id: organizationId,
        registration_control: account.control || "",
        account_number: account.number,
        account_name: account.name
      }], ["organization_id", "account_number"]);
      accountId = savedAccount?.id || null;
    }

    let parentNodeId = null;
    if (node.parentCode) {
      await syncDreNodeAndAccount(node.parentCode);
      const parentRows = await fetchSupabaseRows(
        "dre_plan_nodes",
        `organization_id=eq.${organizationId}&node_code=eq.${encodeURIComponent(node.parentCode)}&select=id&limit=1`
      );
      parentNodeId = parentRows[0]?.id || null;
    }

    const siblings = getDreChildren(node.parentCode || ROOT_DRE_NODE.code);
    const sortOrder = Math.max(1, siblings.findIndex((item) => item.code === node.code) + 1);

    await upsertSupabaseRows("dre_plan_nodes", [{
      organization_id: organizationId,
      account_id: accountId,
      parent_node_id: parentNodeId,
      node_code: node.code,
      node_name: node.name,
      node_class: node.class,
      sort_order: sortOrder,
      origin: node.origin || "manual",
      note: node.note || ""
    }], ["organization_id", "node_code"]);

    setSyncStatus("DRE salvo no BD", "ok");
  } catch (error) {
    console.error(error);
    setSyncStatus("Erro ao gravar DRE no BD", "error");
  }
}

async function syncBranch(branchCode) {
  if (!isSupabaseConfigured()) {
    return;
  }

  try {
    setSyncStatus("Gravando empresa/filial no BD...", "warn");
    const organizationId = await resolveOrganizationId();
    const branch = findBranch(branchCode);
    if (!branch) {
      return;
    }

    await upsertSupabaseRows("branches", [{
      organization_id: organizationId,
      branch_code: branch.code,
      branch_name: branch.name,
      origin: branch.origin === "seed" ? "manual" : branch.origin || "manual",
      note: branch.note || ""
    }], ["organization_id", "branch_code"]);

    setSyncStatus("Empresa/filial salva no BD", "ok");
  } catch (error) {
    console.error(error);
    setSyncStatus(`Erro filial: ${formatSyncError(error)}`, "error");
  }
}

async function syncCcNodeAndCostCenter(nodeCode) {
  if (!isSupabaseConfigured()) {
    return;
  }

  try {
    setSyncStatus("Gravando CC no BD...", "warn");
    const organizationId = await resolveOrganizationId();
    const node = findCcNode(nodeCode);
    if (!node) {
      return;
    }

    let costCenterId = null;
    if (node.class === "Analitica") {
      const costCenter = state.costCenters.find((item) => item.number === node.code) || {
        number: node.code,
        name: node.name,
        type: node.type,
        management: ""
      };

      const [savedCc] = await upsertSupabaseRows("cost_centers", [{
        organization_id: organizationId,
        cost_center_number: costCenter.number,
        cost_center_name: costCenter.name,
        cost_center_type: costCenter.type,
        cost_center_management: costCenter.management || null
      }], ["organization_id", "cost_center_number"]);
      costCenterId = savedCc?.id || null;
    }

    let parentNodeId = null;
    if (node.parentCode) {
      const parentRows = await fetchSupabaseRows(
        "cc_plan_nodes",
        `organization_id=eq.${organizationId}&node_code=eq.${encodeURIComponent(node.parentCode)}&select=id&limit=1`
      );
      parentNodeId = parentRows[0]?.id || null;
    }

    const siblings = getCcChildren(node.parentCode || ROOT_CC_NODE.code);
    const sortOrder = Math.max(1, siblings.findIndex((item) => item.code === node.code) + 1);

    await upsertSupabaseRows("cc_plan_nodes", [{
      organization_id: organizationId,
      cost_center_id: costCenterId,
      parent_node_id: parentNodeId,
      node_code: node.code,
      node_name: node.name,
      node_class: node.class,
      node_type: node.type,
      sort_order: sortOrder,
      origin: node.origin || "manual",
      note: node.note || ""
    }], ["organization_id", "node_code"]);

    setSyncStatus("CC salvo no BD", "ok");
  } catch (error) {
    console.error(error);
    setSyncStatus("Erro ao gravar CC no BD", "error");
  }
}

async function syncDeleteBranch(branchCode) {
  if (!isSupabaseConfigured()) {
    return;
  }

  try {
    setSyncStatus("Removendo empresa/filial no BD...", "warn");
    const organizationId = await resolveOrganizationId();
    await deleteSupabaseRows("branches", `organization_id=eq.${organizationId}&branch_code=eq.${encodeURIComponent(branchCode)}`);
    setSyncStatus("Empresa/filial removida no BD", "ok");
  } catch (error) {
    console.error(error);
    setSyncStatus(`Erro filial: ${formatSyncError(error)}`, "error");
  }
}

async function syncDeleteDreNode(nodeCode) {
  if (!isSupabaseConfigured()) {
    return;
  }
  try {
    setSyncStatus("Removendo DRE no BD...", "warn");
    const organizationId = await resolveOrganizationId();
    await deleteSupabaseRows("dre_plan_nodes", `organization_id=eq.${organizationId}&node_code=eq.${encodeURIComponent(nodeCode)}`);
    await deleteSupabaseRows("accounts", `organization_id=eq.${organizationId}&account_number=eq.${encodeURIComponent(nodeCode)}`);
    setSyncStatus("DRE removido no BD", "ok");
  } catch (error) {
    console.error(error);
    setSyncStatus("Erro ao remover DRE no BD", "error");
  }
}

async function syncDeleteCcNode(nodeCode) {
  if (!isSupabaseConfigured()) {
    return;
  }
  try {
    setSyncStatus("Removendo CC no BD...", "warn");
    const organizationId = await resolveOrganizationId();
    await deleteSupabaseRows("cc_plan_nodes", `organization_id=eq.${organizationId}&node_code=eq.${encodeURIComponent(nodeCode)}`);
    await deleteSupabaseRows("cost_centers", `organization_id=eq.${organizationId}&cost_center_number=eq.${encodeURIComponent(nodeCode)}`);
    setSyncStatus("CC removido no BD", "ok");
  } catch (error) {
    console.error(error);
    setSyncStatus("Erro ao remover CC no BD", "error");
  }
}

function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistableState(state, isSupabaseConfigured())));
  render();
}


// CARGA DE PLANEJADO
// Espelha a arquitetura da Carga de Realizado com adaptações semânticas:
// - Sem entry_date (planejado não tem data de lançamento individual)
// - Tabelas Supabase: budget_import_batches / budget_import_rows
// - RPC: apply_budget_import_batch
// ═══════════════════════════════════════════════════════════════════════════════

// CARGA DE HEADCOUNT
// ══════════════════════════════════════════════════════════════════════════════

function ensureHeadcountViewShell() {
  const view = views.headcountLoad;
  if (!view || view.dataset.ready === "true") return;

  view.innerHTML = `
    <div id="headcount-catalog" class="actuals-catalog">
      <div class="actuals-catalog-grid">
        <button class="actuals-catalog-card" type="button" data-hc-load-type="realizado">
          <span class="actuals-catalog-kicker">01</span>
          <strong>Realizado</strong>
          <p>Quadro de colaboradores ativos por CC no período.</p>
        </button>
        <button class="actuals-catalog-card" type="button" data-hc-load-type="orcado">
          <span class="actuals-catalog-kicker">02</span>
          <strong>Orçado</strong>
          <p>Quadro de colaboradores orçados por CC no período.</p>
        </button>
      </div>
    </div>

    <div id="headcount-detail" class="actuals-layout" style="display:none">
      <div class="content-card actuals-intake-card">
        <div class="actuals-intake-header">
          <div class="actuals-intake-controls">
            <button id="hc-period-button" class="actuals-period-trigger" type="button">
              <span class="actuals-period-kicker">Período</span>
              <strong id="hc-period-label">Jun/2026</strong>
            </button>
            <span id="hc-load-type-label" class="actuals-period-kicker" style="font-size:0.72rem;letter-spacing:0.07em;color:var(--text-faint);padding:0 4px;"></span>
            <select id="hc-load-mode" name="loadMode" class="actuals-mode-select">
              <option value="complete">Carga completa</option>
              <option value="additional">Carga adicional</option>
            </select>
          </div>
          <a href="https://jwjnvxshtdekzcprmsyl.supabase.co/storage/v1/object/public/Vecton_Templates/modelo-carga-headcount.xlsx" download="modelo-carga-headcount.xlsx" title="Baixar modelo de carga" style="display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel-alt);color:var(--text-faint);font-size:0.72rem;text-decoration:none;flex-shrink:0;transition:color .15s,border-color .15s" onmouseover="this.style.color='var(--blue)';this.style.borderColor='var(--blue)'" onmouseout="this.style.color='var(--text-faint)';this.style.borderColor='var(--line)'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>Modelo</a>
        </div>
        <form id="hc-upload-form" class="form-grid actuals-upload-form">
          <label class="full-span">
            Arquivo
            <input id="hc-file-input" name="file" type="file" accept=".xlsx,.xls,.csv">
          </label>
          <div class="editor-actions full-span">
            <button id="hc-import-button" class="primary-button" type="button">Importar arquivo</button>
            <button id="hc-create-manual-batch" class="ghost-button" type="button">Novo lote manual</button>
            <button class="ghost-button" type="button" data-back-to-hc-catalog>← Voltar</button>
          </div>
        </form>
        <div id="hc-upload-feedback" class="actuals-upload-feedback"></div>
      </div>

      <div class="content-card actuals-batch-card">
        <div class="card-toolbar">
          <div>
            <p class="section-kicker">Histórico</p>
            <h4 class="inline-card-title">Lotes</h4>
          </div>
        </div>
        <div id="hc-batch-list" class="actuals-batch-list"></div>
      </div>

      <div class="content-card actuals-detail-card">
        <div class="actuals-detail-head">
          <div class="editor-header actuals-detail-title">
            <p class="section-kicker">Detalhe</p>
            <h4 id="hc-batch-title">Selecione um lote</h4>
          </div>
          <div class="actuals-detail-actions">
            <button id="hc-delete-batch" class="delete-button secondary-danger" type="button">Excluir lote</button>
            <button id="hc-add-row" class="ghost-button" type="button">Adicionar linha</button>
            <button id="hc-apply-batch" class="primary-button" type="button">Aplicar lote</button>
          </div>
        </div>

        <div id="hc-batch-summary" class="actuals-summary-grid"></div>

        <div class="actuals-log-shell">
          <div class="actuals-log-head">
            <strong>Log de importação</strong>
            <span id="hc-log-caption">Sem lote carregado.</span>
          </div>
          <div id="hc-error-log" class="actuals-error-log"></div>
        </div>

        <div class="actuals-rows-toolbar">
          <label class="actuals-rows-search">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="hc-rows-search" type="text" placeholder="Buscar por CC, matrícula, colaborador, cargo...">
          </label>
          <span id="hc-rows-count" class="actuals-rows-count"></span>
        </div>

        <div class="table-shell actuals-table-shell">
          <table class="data-table actuals-table">
            <thead>
              <tr>
                <th class="actuals-col-row">#</th>
                <th class="actuals-col-branch">Empresa</th>
                <th class="actuals-col-cc">CC</th>
                <th class="actuals-col-lot">Matrícula</th>
                <th class="actuals-col-history">Colaborador</th>
                <th class="actuals-col-history">Cargo</th>
                <th class="actuals-col-status">Status</th>
                <th class="actuals-col-action">Ação</th>
              </tr>
            </thead>
            <tbody id="hc-rows-body"></tbody>
          </table>
        </div>

        <div id="hc-rows-pagination" class="actuals-rows-pagination"></div>
      </div>
    </div>
  `;

  view.dataset.ready = "true";
  bindHeadcountEvents();
}


function returnFromHeadcountDetail() {
  const destination = headcountReturnView || (selectedHeadcountLoadType === "orcado" ? "budgetLoad" : "actualsLoad");

  selectedHeadcountLoadType = null;
  selectedHeadcountBatchId = null;
  headcountRowsPage = 1;
  headcountRowsFilter = "";

  if (destination === "budgetLoad") {
    activeView = "budgetLoad";
    setSelectedBudgetLoadType(null);
    ensureBudgetViewShell();
    renderNavigation();
    renderBudgetCatalog();
    renderBudgetView();
    return;
  }

  activeView = "actualsLoad";
  setSelectedActualsLoadType(null);
  ensureActualsViewShell();
  renderNavigation();
  renderActualsCatalog();
  renderActualsView();
}

function bindHeadcountEvents() {
  const hcView = views.headcountLoad;

  // Catálogo
  hcView?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-hc-load-type]");
    if (card && !card.disabled) {
      selectedHeadcountLoadType = card.dataset.hcLoadType;
      renderHeadcountCatalog();
      renderHeadcountView();
      return;
    }
    if (event.target.closest("[data-back-to-hc-catalog]")) {
      returnFromHeadcountDetail();
      return;
    }
  });

  // Período
  document.querySelector("#hc-period-button")?.addEventListener("click", () => {
    periodTrigger?.click();
  });

  // Import
  document.querySelector("#hc-import-button")?.addEventListener("click", async () => {
    const fileInput = document.querySelector("#hc-file-input");
    const file = fileInput?.files?.[0];
    if (!file) { setHcFeedback("Selecione um arquivo para importar.", "error"); return; }
    const loadMode = document.querySelector("#hc-load-mode")?.value || "complete";
    if (loadMode === "complete") {
      if (!await appConfirm("Carga completa vai substituir o headcount do período. Deseja continuar?", "warn")) return;
    }
    try {
      setHcFeedback("Lendo arquivo...", "warn");
      const rows = await parseHeadcountFile(file);
      const batch = await createHeadcountBatch({ loadMode, sourceType: "file", sourceFileName: file.name });
      const prepared = rows.map((r, i) => normalizeImportedHcRow(batch.id, r, i + 1));
      await saveHeadcountRows(batch.id, prepared);
      selectedHeadcountBatchId = batch.id;
      fileInput.value = "";
      await refreshHeadcountBatch(batch.id);
      try {
        const applied = await autoApplyHeadcountBatch(batch.id, { auto: true });
        if (applied) {
          setHcFeedback(`Carga importada e aplicada com ${prepared.length} colaborador(es).`, "ok");
        } else {
          const refreshedBatch = getHcBatchById(batch.id);
          if (refreshedBatch?.status === "error") {
            setHcFeedback("Carga importada, mas não aplicada porque há linhas com erro.", "warn");
          } else {
            setHcFeedback(`Lote criado com ${prepared.length} colaborador(es).`, "ok");
          }
        }
      } catch (applyError) {
        console.error(applyError);
        setHcFeedback(`Carga importada, mas a aplicação automática falhou: ${String(applyError?.message || applyError)}`, "error");
      }
      renderHeadcountView();
    } catch (error) {
      console.error(error);
      setHcFeedback(String(error?.message || error || "Falha na importação."), "error");
    }
  });

  // Lote manual
  document.querySelector("#hc-create-manual-batch")?.addEventListener("click", async () => {
    try {
      const loadMode = document.querySelector("#hc-load-mode")?.value || "additional";
      const batch = await createHeadcountBatch({ loadMode, sourceType: "manual", sourceFileName: "" });
      selectedHeadcountBatchId = batch.id;
      headcountRowsPage = 1;
      headcountRowsFilter = "";
      renderHeadcountView();
    } catch (error) {
      setHcFeedback(String(error?.message || error || "Falha ao criar lote."), "error");
    }
  });

  // Selecionar lote
  const batchList = document.querySelector("#hc-batch-list");
  batchList?.addEventListener("click", async (event) => {
    const item = event.target.closest("[data-batch-id]");
    if (!item) return;
    selectedHeadcountBatchId = item.dataset.batchId;
    headcountRowsPage = 1;
    headcountRowsFilter = "";
    renderHeadcountView();
    await ensureHeadcountBatchRowsLoaded(selectedHeadcountBatchId, true);
    renderHeadcountView();
  });

  // Busca
  document.querySelector("#hc-rows-search")?.addEventListener("input", (e) => {
    headcountRowsFilter = e.target.value;
    headcountRowsPage = 1;
    renderHcRowsTable();
  });

  // Edição inline
  const rowsBody = document.querySelector("#hc-rows-body");
  rowsBody?.addEventListener("change", async (event) => {
    const rowEl = event.target.closest("tr[data-row-id]");
    if (!rowEl) return;
    await updateHcRowFromDom(rowEl);
  });

  // Excluir linha
  rowsBody?.addEventListener("click", async (event) => {
    const errBtn = event.target.closest("[data-hc-error-row]");
    if (errBtn) {
      event.stopPropagation();
      const rowId = errBtn.dataset.hcErrorRow;
      activeHcErrorRowId = activeHcErrorRowId === rowId ? null : rowId;
      renderHcRowsTable();
      return;
    }
    const btn = event.target.closest("[data-delete-row]");
    if (!btn) return;
    await deleteHcRow(btn.dataset.deleteRow);
  });

  document.addEventListener("click", (event) => {
    if (!activeHcErrorRowId) return;
    if (event.target.closest(".actuals-error-popover") || event.target.closest("[data-hc-error-row]")) return;
    activeHcErrorRowId = null;
    renderHcRowsTable();
  });

  // Adicionar linha
  document.querySelector("#hc-add-row")?.addEventListener("click", async () => {
    const batch = getSelectedHcBatch();
    if (!batch) return;
    const newRow = normalizeImportedHcRow(batch.id, {
      branchCode: state.branches[0]?.code || "01",
      costCenterNumber: "",
      matricula: "",
      colab: "",
      cargo: ""
    }, (getSelectedHcRows().length + 1));
    await saveHeadcountRows(batch.id, [newRow]);
    headcountRowsPage = Math.ceil((getSelectedHcRows().length) / HEADCOUNT_ROWS_PER_PAGE);
    renderHeadcountView();
  });

  // Excluir lote
  document.querySelector("#hc-delete-batch")?.addEventListener("click", async () => {
    const batch = getSelectedHcBatch();
    if (!batch) return;
    if (!await appConfirm("Deseja excluir este lote de headcount e todas as suas linhas? Esta ação não pode ser desfeita.", "danger")) return;
    try {
      if (isSupabaseConfigured()) {
        await deleteSupabaseRows("headcount_import_rows", `batch_id=eq.${encodeURIComponent(batch.id)}`);
        await deleteSupabaseRows("headcount_import_batches", `id=eq.${encodeURIComponent(batch.id)}`);
      }
      state.headcountBatches = state.headcountBatches.filter(b => b.id !== batch.id);
      delete state.headcountRowsByBatch[batch.id];
      selectedHeadcountBatchId = getCurrentPeriodHcBatches(selectedHeadcountLoadType)[0]?.id || null;
      if (selectedHeadcountBatchId) await loadHeadcountRows(selectedHeadcountBatchId, true);
      renderHeadcountView();
    } catch (error) {
      setHcFeedback(String(error?.message || error || "Falha ao excluir lote."), "error");
    }
  });

  // Aplicar lote
  document.querySelector("#hc-apply-batch")?.addEventListener("click", async () => {
    const batch = getSelectedHcBatch();
    if (!batch) {
      setHcFeedback("Selecione um lote para aplicar.", "warn");
      return;
    }
    try {
      setHcFeedback("Aplicando lote...", "warn");
      await ensureHeadcountBatchRowsLoaded(batch.id, true);
      recomputeLocalHcBatch(batch.id);
      const checkedBatch = getHcBatchById(batch.id);
      if (!checkedBatch || checkedBatch.totalRows === 0) {
        setHcFeedback("O lote ainda não tem linhas válidas para aplicar.", "warn");
        renderHeadcountView();
        return;
      }
      if (checkedBatch.errorRows > 0 || checkedBatch.status === "error") {
        setHcFeedback("Corrija as linhas com erro antes de aplicar o lote.", "error");
        renderHeadcountView();
        return;
      }
      const applied = await autoApplyHeadcountBatch(checkedBatch.id, { auto: false });
      if (applied) {
        setHcFeedback("Lote aplicado com sucesso.", "ok");
      } else {
        const refreshedBatch = getHcBatchById(checkedBatch.id);
        if (refreshedBatch?.status === "error") {
          setHcFeedback("Corrija as linhas com erro antes de aplicar o lote.", "error");
        } else if (refreshedBatch?.status === "draft") {
          setHcFeedback("O lote ainda não tem linhas válidas para aplicar.", "warn");
        } else {
          setHcFeedback("O lote não foi aplicado. Verifique o status do lote e tente novamente.", "warn");
        }
      }
      renderHeadcountView();
    } catch (error) {
      console.error(error);
      setHcFeedback(String(error?.message || error || "Falha ao aplicar lote."), "error");
    }
  });
}

function renderHeadcountCatalog() {
  const catalog = document.querySelector("#headcount-catalog");
  const detail = document.querySelector("#headcount-detail");
  if (!catalog || !detail) return;

  if (selectedHeadcountLoadType) {
    catalog.style.display = "none";
    detail.style.display = "";
    const label = document.querySelector("#hc-load-type-label");
    const hcName = selectedHeadcountLoadType === "orcado" ? "Planejado" : "Realizado";
    if (label) label.textContent = `HEADCOUNT — ${hcName.toUpperCase()}`;
    if (viewTitle && activeView === "headcountLoad") viewTitle.textContent = `Carga de Headcount ${hcName}`;
  } else {
    catalog.style.display = "";
    detail.style.display = "none";
    if (viewTitle && activeView === "headcountLoad") viewTitle.textContent = "Carga de Headcount";
  }
}

function getCurrentPeriodHcBatches(loadType = selectedHeadcountLoadType) {
  state.headcountBatches = Array.isArray(state.headcountBatches) ? state.headcountBatches : [];
  const year = Number(state.currentPeriod?.year || 2026);
  const month = Number(state.currentPeriod?.month || 1);
  return state.headcountBatches.filter((batch) =>
    (!loadType || batch.loadType === loadType)
    && Number(batch.referenceYear) === year
    && Number(batch.referenceMonth) === month
  );
}

function syncSelectedHeadcountBatchWithCurrentPeriod() {
  if (!selectedHeadcountLoadType) {
    selectedHeadcountBatchId = null;
    return;
  }

  const periodBatches = getCurrentPeriodHcBatches(selectedHeadcountLoadType);
  const selectedStillValid = periodBatches.some((batch) => batch.id === selectedHeadcountBatchId);
  if (!selectedStillValid) {
    selectedHeadcountBatchId = periodBatches[0]?.id || null;
    headcountRowsPage = 1;
    headcountRowsFilter = "";
  }
}

function renderHeadcountView() {
  syncSelectedHeadcountBatchWithCurrentPeriod();
  return headcountRenderModule.renderHeadcountView();
}

function renderHcBatchList() {
  return headcountRenderModule.renderHcBatchList();
  const container = document.querySelector("#hc-batch-list");
  if (!container) return;

  container.innerHTML = "";
  const batches = state.headcountBatches.filter(b =>
    !selectedHeadcountLoadType || b.loadType === selectedHeadcountLoadType
  );
  if (!batches.length) {
    const empty = document.createElement("div");
    empty.className = "actuals-empty";
    empty.textContent = "Nenhum lote carregado ainda.";
    container.append(empty);
    return;
  }

  batches.forEach((batch) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "actuals-batch-item";
    if (batch.id === selectedHeadcountBatchId) button.classList.add("active");
    button.dataset.batchId = batch.id;
    button.innerHTML = `
      <div class="actuals-batch-item-head">
        <strong>${escapeHtml(formatMonthLabel(batch.referenceMonth))}</strong>
        <span class="actuals-badge ${escapeHtml(getActualsStatusClass(batch.status))}">${escapeHtml(formatActualsStatus(batch.status))}</span>
      </div>
      <span>Ano base ${escapeHtml(String(batch.referenceYear))}</span>
      <span>${escapeHtml(batch.sourceType === "manual" ? "Manual" : batch.sourceFileName || "Arquivo")}</span>
      <span>${escapeHtml(batch.loadMode === "complete" ? "Carga completa" : "Carga adicional")} • ${batch.totalRows} linhas</span>
    `;
    container.append(button);
  });
}

function renderHcBatchSummary() {
  return headcountRenderModule.renderHcBatchSummary();
  const container = document.querySelector("#hc-batch-summary");
  const title = document.querySelector("#hc-batch-title");
  const caption = document.querySelector("#hc-log-caption");
  const applyButton = document.querySelector("#hc-apply-batch");
  const addRowButton = document.querySelector("#hc-add-row");
  const deleteBatchButton = document.querySelector("#hc-delete-batch");
  if (!container || !title || !caption || !applyButton || !addRowButton || !deleteBatchButton) return;

  const batch = getSelectedHcBatch();
  container.innerHTML = "";

  if (!batch) {
    title.textContent = "Selecione um lote";
    caption.textContent = "Sem lote carregado.";
    applyButton.disabled = true;
    addRowButton.disabled = true;
    deleteBatchButton.disabled = true;
    return;
  }

  title.textContent = `Ano ${batch.referenceYear} • ${formatMonthLabel(batch.referenceMonth)} • ${batch.sourceType === "manual" ? "Lote manual" : (batch.sourceFileName || "Lote importado")}`;
  caption.textContent = batch.errorRows > 0
    ? `${batch.errorRows} linha(s) com erro bloqueando a importação.`
    : `Lote com ${batch.validRows} linha(s) válidas.`;
  applyButton.disabled = batch.totalRows === 0 || batch.errorRows > 0;
  addRowButton.disabled = false;
  deleteBatchButton.disabled = false;

  [
    { label: "Ano base", value: String(batch.referenceYear) },
    { label: "Mês da carga", value: formatMonthLabel(batch.referenceMonth) },
    { label: "Tipo", value: batch.loadMode === "complete" ? "Carga completa" : "Carga adicional" },
    { label: "Origem", value: batch.sourceType === "manual" ? "Manual" : batch.sourceFileName || "Arquivo" },
    { label: "Linhas", value: String(batch.totalRows) },
    { label: "Válidas", value: String(batch.validRows) },
    { label: "Erros", value: String(batch.errorRows) },
    { label: "Status", value: formatActualsStatus(batch.status) }
  ].forEach((item) => {
    const stat = document.createElement("div");
    stat.className = "actuals-summary-card";
    stat.innerHTML = `<span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong>`;
    container.append(stat);
  });
}

function renderHcErrorLog() {
  return headcountRenderModule.renderHcErrorLog();
  const container = document.querySelector("#hc-error-log");
  if (!container) return;
  container.innerHTML = "";

  const batch = getSelectedHcBatch();
  if (!batch) {
    container.innerHTML = `<div class="actuals-empty">Sem lote selecionado.</div>`;
    return;
  }

  if (batch.errorRows === 0) {
    container.innerHTML = `<div class="actuals-success-box">Lote sem erros. O resumo fica concentrado no cabeçalho do lote.</div>`;
    return;
  }

  const rows = getSelectedHcRows();
  rows
    .filter((row) => row.validationStatus === "error")
    .forEach((row) => {
      const item = document.createElement("div");
      item.className = "actuals-error-item";
      item.innerHTML = `<strong>Linha ${row.rowNumber}</strong><span>${escapeHtml((row.validationErrors || []).join(" • "))}</span>`;
      container.append(item);
    });
}

function renderHcRowsTable() {
  return headcountRenderModule.renderHcRowsTable();
  const tbody = document.querySelector("#hc-rows-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!("_activeErrorRowId" in renderHcRowsTable)) renderHcRowsTable._activeErrorRowId = null;

  const batch = getSelectedHcBatch();
  if (batch && loadingHeadcountBatchIds.has(batch.id)) {
    tbody.append(buildEmptyRow("Carregando linhas...", 8));
    renderHcRowsPagination(0, 0);
    return;
  }

  const allRows = getSelectedHcRows().slice().sort((a, b) => a.rowNumber - b.rowNumber);
  const filter = headcountRowsFilter.toLowerCase().trim();
  const filtered = filter
    ? allRows.filter(r =>
        (r.costCenterNumber || "").toLowerCase().includes(filter) ||
        (r.matricula || "").toLowerCase().includes(filter) ||
        (r.colab || "").toLowerCase().includes(filter) ||
        (r.cargo || "").toLowerCase().includes(filter) ||
        (r.branchCode || "").toLowerCase().includes(filter) ||
        String(r.rowNumber).includes(filter)
      )
    : allRows;

  const countEl = document.querySelector("#hc-rows-count");
  if (countEl) countEl.textContent = filter ? `${filtered.length} de ${allRows.length} colaborador(es)` : `${allRows.length} colaborador(es)`;

  if (!filtered.length) {
    tbody.append(buildEmptyRow(filter ? "Nenhum resultado para este filtro." : "Nenhuma linha carregada.", 8));
    renderHcRowsPagination(0, 0);
    return;
  }

  const totalPages = Math.ceil(filtered.length / HEADCOUNT_ROWS_PER_PAGE);
  headcountRowsPage = Math.min(Math.max(1, headcountRowsPage), totalPages);
  const start = (headcountRowsPage - 1) * HEADCOUNT_ROWS_PER_PAGE;
  const pageRows = filtered.slice(start, start + HEADCOUNT_ROWS_PER_PAGE);

  const activeHcErrorRowId = renderHcRowsTable._activeErrorRowId || null;

  pageRows.forEach(row => {
    const tr = document.createElement("tr");
    tr.dataset.rowId = row.id;
    const isErrorOpen = activeHcErrorRowId === row.id && row.validationStatus === "error";
    const statusCell = row.validationStatus === "error"
      ? `<div class="actuals-status-wrap">
           <button class="actuals-badge is-error actuals-error-trigger" type="button" data-hc-error-row="${row.id}">${escapeHtml(formatActualsStatus(row.validationStatus))}</button>
           ${isErrorOpen ? `<div class="actuals-error-popover"><strong>Erros nesta linha</strong><ul>${(row.validationErrors || []).map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul></div>` : ""}
         </div>`
      : `<span class="actuals-badge ${escapeHtml(getActualsStatusClass(row.validationStatus))}">${escapeHtml(formatActualsStatus(row.validationStatus))}</span>`;
    tr.innerHTML = `
      <td class="actuals-col-row">${row.rowNumber}</td>
      <td class="actuals-col-branch"><input class="actuals-field actuals-field-branch" data-field="branchCode" type="text" inputmode="numeric" maxlength="10" value="${escapeHtml(row.branchCode || "")}"></td>
      <td class="actuals-col-cc"><input class="actuals-field actuals-field-cc" data-field="costCenterNumber" type="text" inputmode="numeric" maxlength="10" value="${escapeHtml(row.costCenterNumber || "")}"></td>
      <td class="actuals-col-lot"><input class="actuals-field actuals-field-lot" data-field="matricula" type="text" maxlength="20" value="${escapeHtml(row.matricula || "")}"></td>
      <td class="actuals-col-history"><input class="actuals-field actuals-field-history" data-field="colab" type="text" maxlength="80" value="${escapeHtml(row.colab || "")}"></td>
      <td class="actuals-col-history"><input class="actuals-field actuals-field-history" data-field="cargo" type="text" maxlength="80" value="${escapeHtml(row.cargo || "")}"></td>
      <td class="actuals-col-status">${statusCell}</td>
      <td class="actuals-col-action"><button class="table-icon-button table-icon-button-only" type="button" data-delete-row="${row.id}" aria-label="Excluir linha"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#vp-icon-trash"></use></svg></button></td>
    `;
    tbody.append(tr);
  });

  renderHcRowsPagination(headcountRowsPage, totalPages);
}

function renderHcRowsPagination(currentPage, totalPages) {
  return headcountRenderModule.renderHcRowsPagination(currentPage, totalPages);
  const container = document.querySelector("#hc-rows-pagination");
  if (!container) return;
  container.innerHTML = "";
  if (totalPages <= 1) return;

  const nav = document.createElement("div");
  nav.className = "rows-pagination-inner";
  const info = document.createElement("span");
  info.className = "rows-pagination-info";
  info.textContent = `Página ${currentPage} de ${totalPages}`;
  nav.append(info);

  const controls = document.createElement("div");
  controls.className = "rows-pagination-controls";
  const btnFirst = buildPaginationBtn("«", currentPage === 1, () => { headcountRowsPage = 1; renderHcRowsTable(); });
  const btnPrev  = buildPaginationBtn("‹ Anterior", currentPage === 1, () => { headcountRowsPage--; renderHcRowsTable(); });
  const pageButtons = buildPageNumberButtons(currentPage, totalPages).map(el => {
    if (el.tagName === "BUTTON" && !el.classList.contains("active")) {
      const p = Number(el.textContent);
      el.onclick = () => { headcountRowsPage = p; renderHcRowsTable(); };
    }
    return el;
  });
  const btnNext = buildPaginationBtn("Próximo ›", currentPage === totalPages, () => { headcountRowsPage++; renderHcRowsTable(); });
  const btnLast = buildPaginationBtn("»", currentPage === totalPages, () => { headcountRowsPage = totalPages; renderHcRowsTable(); });
  controls.append(btnFirst, btnPrev, ...pageButtons, btnNext, btnLast);
  nav.append(controls);
  container.append(nav);
}

async function updateHcRowFromDom(rowEl) {
  const rowId = rowEl.dataset.rowId;
  const batch = getSelectedHcBatch();
  const currentRow = getSelectedHcRows().find(r => r.id === rowId);
  if (!batch || !currentRow) return;

  const updated = normalizeImportedHcRow(batch.id, {
    id: currentRow.id,
    rowNumber: currentRow.rowNumber,
    branchCode: rowEl.querySelector('[data-field="branchCode"]').value,
    costCenterNumber: rowEl.querySelector('[data-field="costCenterNumber"]').value,
    matricula: rowEl.querySelector('[data-field="matricula"]').value,
    colab: rowEl.querySelector('[data-field="colab"]').value,
    cargo: rowEl.querySelector('[data-field="cargo"]').value
  }, currentRow.rowNumber);

  try {
    rowEl.classList.add("row-saving");
    await saveHeadcountRows(batch.id, [updated]);
    rowEl.classList.remove("row-saving");
    rowEl.classList.add("row-saved");
    setTimeout(() => rowEl.classList.remove("row-saved"), 1800);
  } catch (error) {
    rowEl.classList.remove("row-saving");
    rowEl.classList.add("row-save-error");
    setTimeout(() => rowEl.classList.remove("row-save-error"), 3000);
    setHcFeedback(String(error?.message || error || "Falha ao salvar linha."), "error");
  }
}

async function deleteHcRow(rowId) {
  const batch = getSelectedHcBatch();
  if (!batch) return;
  try {
    if (isSupabaseConfigured()) await deleteSupabaseRows("headcount_import_rows", `id=eq.${encodeURIComponent(rowId)}`);
    state.headcountRowsByBatch[batch.id] = getSelectedHcRows().filter(r => r.id !== rowId);
    recomputeLocalHcBatch(batch.id);
    renderHeadcountView();
  } catch (error) {
    setHcFeedback(String(error?.message || error || "Falha ao excluir linha."), "error");
  }
}

async function createHeadcountBatch({ loadMode, sourceType, sourceFileName }) {
  state.headcountBatches = Array.isArray(state.headcountBatches) ? state.headcountBatches : [];
  state.headcountRowsByBatch = state.headcountRowsByBatch && typeof state.headcountRowsByBatch === "object" ? state.headcountRowsByBatch : {};

  const batch = normalizeHcBatch({
    id: crypto.randomUUID(),
    referenceYear: state.currentPeriod.year,
    referenceMonth: state.currentPeriod.month,
    loadMode,
    loadType: selectedHeadcountLoadType || "realizado",
    sourceType,
    sourceFileName,
    status: "draft",
    totalRows: 0, errorRows: 0, validRows: 0,
    uploadedAt: new Date().toISOString()
  });

  state.headcountBatches = [batch, ...state.headcountBatches.filter(b => b.id !== batch.id)];
  state.headcountRowsByBatch[batch.id] = [];

  if (isSupabaseConfigured()) {
    const organizationId = await resolveOrganizationId();
    const [saved] = await upsertSupabaseRows("headcount_import_batches", [{
      id: batch.id,
      organization_id: organizationId,
      reference_year: batch.referenceYear,
      reference_month: batch.referenceMonth,
      load_mode: batch.loadMode,
      load_type: batch.loadType,
      source_type: batch.sourceType,
      source_file_name: batch.sourceFileName,
      status: batch.status,
      uploaded_by: currentUser?.id || null
    }], ["id"]);
    state.headcountBatches = [normalizeHcBatch(saved), ...state.headcountBatches.filter(b => b.id !== batch.id)];
  }

  persistAndRender();
  return getHcBatchById(batch.id);
}

async function saveHeadcountRows(batchId, rows) {
  state.headcountBatches = Array.isArray(state.headcountBatches) ? state.headcountBatches : [];
  state.headcountRowsByBatch = state.headcountRowsByBatch && typeof state.headcountRowsByBatch === "object" ? state.headcountRowsByBatch : {};
  if (!batchId) throw new Error("Lote de headcount não encontrado.");
  if (!rows.length) return;
  const validated = rows.map(r => validateHcRow(batchId, r));
  const currentRows = state.headcountRowsByBatch[batchId] || [];
  const merged = new Map(currentRows.map(r => [r.id, r]));
  validated.forEach(r => merged.set(r.id, r));
  state.headcountRowsByBatch[batchId] = Array.from(merged.values()).sort((a, b) => a.rowNumber - b.rowNumber);
  recomputeLocalHcBatch(batchId);

  if (!isSupabaseConfigured()) return;
  const organizationId = await resolveOrganizationId();
  const chunks = [];
  const chunkSize = 500;
  for (let i = 0; i < validated.length; i += chunkSize) chunks.push(validated.slice(i, i + chunkSize));
  for (const chunk of chunks) {
    await upsertSupabaseRows("headcount_import_rows", chunk.map(r => ({
      id: r.id,
      batch_id: r.batchId,
      organization_id: organizationId,
      row_number: r.rowNumber,
      branch_code: r.branchCode,
      cost_center_number: r.costCenterNumber,
      matricula: r.matricula,
      colab: r.colab,
      cargo: r.cargo,
      validation_status: r.validationStatus,
      validation_errors: r.validationErrors
    })), ["id"]);
  }
  recomputeLocalHcBatch(batchId);
  const batch = getHcBatchById(batchId);
  if (batch) {
    await upsertSupabaseRows("headcount_import_batches", [{
      id: batch.id,
      organization_id: organizationId,
      reference_year: batch.referenceYear || state.currentPeriod.year,
      reference_month: batch.referenceMonth || state.currentPeriod.month,
      load_mode: batch.loadMode || "complete",
      load_type: batch.loadType || selectedHeadcountLoadType || "realizado",
      source_type: batch.sourceType || "file",
      source_file_name: batch.sourceFileName || "",
      status: batch.status,
      total_rows: batch.totalRows,
      error_rows: batch.errorRows,
      valid_rows: batch.validRows
    }], ["id"]);
  }
  await refreshHeadcountBatch(batchId);
  setSyncStatus("Lote de headcount salvo no BD", "ok");
  return true;
}

async function refreshHeadcountBatch(batchId) {
  if (!isSupabaseConfigured()) { recomputeLocalHcBatch(batchId); return; }
  try {
    const organizationId = await resolveOrganizationId();
    const [saved] = await fetchSupabaseRowsSafe("headcount_import_batches",
      `id=eq.${batchId}&organization_id=eq.${organizationId}&select=id,reference_year,reference_month,load_mode,load_type,source_type,source_file_name,status,total_rows,error_rows,valid_rows,uploaded_at,applied_at&limit=1`);
    if (saved) {
      state.headcountBatches = [normalizeHcBatch(saved), ...state.headcountBatches.filter(b => b.id !== batchId)];
    }
    await loadHeadcountRows(batchId, true);
    const afterDb = getHcBatchById(batchId);
    if (afterDb && afterDb.status !== "applied") recomputeLocalHcBatch(batchId);
  } catch (_) { recomputeLocalHcBatch(batchId); }
  persistAndRender();
}

async function autoApplyHeadcountBatch(batchId, { auto = false } = {}) {
  const batch = getHcBatchById(batchId);
  if (!batch) throw new Error("Lote não encontrado.");
  if (batch.status === "applied") return true;

  if (!Array.isArray(state.headcountRowsByBatch?.[batchId])) {
    await loadHeadcountRows(batchId, true);
  }
  recomputeLocalHcBatch(batchId);

  const refreshed = getHcBatchById(batchId);
  if (!refreshed) throw new Error("Lote não encontrado.");
  if (refreshed.status === "applied") return true;
  if (refreshed.totalRows === 0 || refreshed.errorRows > 0 || refreshed.status === "error" || refreshed.status === "draft") return false;

  if (refreshed.loadMode === "complete" && !auto) {
    const confirmed = await appConfirm("Carga completa vai substituir o headcount do período. Deseja continuar?", "warn");
    if (!confirmed) return false;
  }

  if (!isSupabaseConfigured()) {
    refreshed.status = "applied";
    refreshed.appliedAt = new Date().toISOString();
    persistAndRender();
    setSyncStatus(auto ? "Carga de headcount aplicada localmente" : "Lote de headcount aplicado localmente", "ok");
    return true;
  }

  const organizationId = await resolveOrganizationId();
  setSyncStatus(auto ? "Aplicando carga de headcount no BD..." : "Aplicando lote de headcount no BD...", "warn");

  // Carga completa — remove registros do período/tipo antes
  if (refreshed.loadMode === "complete") {
    await deleteSupabaseRows("headcount_entries",
      `organization_id=eq.${organizationId}&reference_year=eq.${refreshed.referenceYear}&reference_month=eq.${refreshed.referenceMonth}&load_type=eq.${refreshed.loadType}`);
  }

  const rows = state.headcountRowsByBatch[batchId] || [];
  const entryRows = dedupeHeadcountRowsForApply(rows, refreshed);
  if (entryRows.length) {
    const chunks = [];
    for (let i = 0; i < entryRows.length; i += 500) chunks.push(entryRows.slice(i, i + 500));
    for (const chunk of chunks) {
      await upsertSupabaseRows("headcount_entries", chunk.map(r => ({
        id: crypto.randomUUID(),
        organization_id: organizationId,
        reference_year: refreshed.referenceYear,
        reference_month: refreshed.referenceMonth,
        load_type: refreshed.loadType,
        branch_code: r.branchCode,
        cost_center_number: r.costCenterNumber,
        matricula: r.matricula,
        colab: r.colab,
        cargo: r.cargo
      })), ["organization_id", "reference_year", "reference_month", "load_type", "matricula"]);
    }
  }

  await upsertSupabaseRows("headcount_import_batches", [{
    id: batchId,
    organization_id: organizationId,
    reference_year: refreshed.referenceYear || state.currentPeriod.year,
    reference_month: refreshed.referenceMonth || state.currentPeriod.month,
    load_mode: refreshed.loadMode || "complete",
    load_type: refreshed.loadType || selectedHeadcountLoadType || "realizado",
    source_type: refreshed.sourceType || "file",
    source_file_name: refreshed.sourceFileName || "",
    status: "applied",
    total_rows: refreshed.totalRows || 0,
    error_rows: refreshed.errorRows || 0,
    valid_rows: refreshed.validRows || 0,
    applied_at: new Date().toISOString()
  }], ["id"]);

  await refreshHeadcountBatch(batchId);
  setSyncStatus(auto ? "Carga de headcount aplicada no BD" : "Lote de headcount aplicado no BD", "ok");
  return true;
}



async function applyHeadcountBatch(batchId) {
  return autoApplyHeadcountBatch(batchId, { auto: false });
}

async function loadHeadcountRows(batchId, force = false) {
  if (!batchId) return;
  if (!force && Array.isArray(state.headcountRowsByBatch[batchId])) return;
  if (!isSupabaseConfigured()) { state.headcountRowsByBatch[batchId] = state.headcountRowsByBatch[batchId] || []; return; }

  const PAGE = 1000;
  let allRows = [], offset = 0;
  while (true) {
    const page = await fetchSupabaseRowsSafe("headcount_import_rows",
      `batch_id=eq.${batchId}&select=id,row_number,branch_code,cost_center_number,matricula,colab,cargo,validation_status,validation_errors&order=row_number.asc&limit=${PAGE}&offset=${offset}`);
    if (!page || page.length === 0) break;
    allRows = allRows.concat(page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  state.headcountRowsByBatch[batchId] = allRows.map(normalizeHcRow);
}

async function ensureHeadcountBatchRowsLoaded(batchId, force = false) {
  if (!batchId) return;
  if (!force && Array.isArray(state.headcountRowsByBatch[batchId])) return;
  if (loadingHeadcountBatchIds.has(batchId)) return;
  loadingHeadcountBatchIds.add(batchId);
  try { await loadHeadcountRows(batchId, force); } finally { loadingHeadcountBatchIds.delete(batchId); }
}

function recomputeLocalHcBatch(batchId) {
  const batch = getHcBatchById(batchId);
  if (!batch) return;
  const rows = state.headcountRowsByBatch[batchId] || [];
  batch.totalRows = rows.length;
  batch.errorRows = rows.filter(r => r.validationStatus === "error").length;
  batch.validRows = rows.filter(r => r.validationStatus === "valid").length;
  batch.status = rows.length === 0 ? "draft" : (batch.errorRows > 0 ? "error" : "ready");
}

function getSelectedHcBatch() { return getHcBatchById(selectedHeadcountBatchId); }
function getHcBatchById(id) {
  state.headcountBatches = Array.isArray(state.headcountBatches) ? state.headcountBatches : [];
  return state.headcountBatches.find(b => b.id === id) || null;
}
function getSelectedHcRows() {
  state.headcountRowsByBatch = state.headcountRowsByBatch && typeof state.headcountRowsByBatch === "object" ? state.headcountRowsByBatch : {};
  if (!selectedHeadcountBatchId) return [];
  return state.headcountRowsByBatch[selectedHeadcountBatchId] || [];
}

function normalizeHcBatch(row) {
  row = row && typeof row === "object" ? row : {};
  return {
    id: row.id,
    referenceYear: Number(row.referenceYear ?? row.reference_year ?? state.currentPeriod.year),
    referenceMonth: Number(row.referenceMonth ?? row.reference_month ?? state.currentPeriod.month),
    loadMode: row.loadMode ?? row.load_mode ?? "complete",
    loadType: row.loadType ?? row.load_type ?? "realizado",
    sourceType: row.sourceType ?? row.source_type ?? "file",
    sourceFileName: row.sourceFileName ?? row.source_file_name ?? "",
    status: row.status || "draft",
    totalRows: Number(row.totalRows ?? row.total_rows ?? 0),
    errorRows: Number(row.errorRows ?? row.error_rows ?? 0),
    validRows: Number(row.validRows ?? row.valid_rows ?? 0),
    uploadedAt: row.uploadedAt ?? row.uploaded_at ?? "",
    appliedAt: row.appliedAt ?? row.applied_at ?? ""
  };
}

function normalizeHcRow(row) {
  return {
    id: row.id || crypto.randomUUID(),
    batchId: row.batch_id || row.batchId || "",
    rowNumber: Number(row.row_number ?? row.rowNumber ?? 0),
    branchCode: String(row.branch_code ?? row.branchCode ?? ""),
    costCenterNumber: String(row.cost_center_number ?? row.costCenterNumber ?? ""),
    matricula: String(row.matricula ?? ""),
    colab: String(row.colab ?? ""),
    cargo: String(row.cargo ?? ""),
    validationStatus: row.validation_status ?? row.validationStatus ?? "pending",
    validationErrors: row.validation_errors ?? row.validationErrors ?? []
  };
}

function normalizeImportedHcRow(batchId, source, rowNumber) {
  return normalizeHcRow({
    id: source.id || crypto.randomUUID(),
    batchId,
    rowNumber,
    branchCode: String(source.branchCode ?? source.branch_code ?? source.Empresa ?? source.empresa ?? state.branches[0]?.code ?? "01"),
    costCenterNumber: String(source.costCenterNumber ?? source.cost_center_number ?? source.CC ?? source.cc ?? ""),
    matricula: String(source.matricula ?? source.Mat ?? source.mat ?? source.matricula ?? ""),
    colab: String(source.colab ?? source.Colab ?? source.colaborador ?? source.nome ?? ""),
    cargo: String((source.cargo ?? source["Cargo "] ?? source.Cargo ?? "")).trim(),
    validationStatus: source.validationStatus ?? "pending",
    validationErrors: source.validationErrors ?? []
  });
}

function validateHcRow(batchId, row) {
  const errors = [];
  if (!row.costCenterNumber) errors.push("Centro de custo obrigatório.");
  if (!row.matricula) errors.push("Matrícula obrigatória.");
  if (!row.colab) errors.push("Nome do colaborador obrigatório.");
  return {
    ...row,
    batchId,
    validationStatus: errors.length ? "error" : "valid",
    validationErrors: errors
  };
}

async function parseHeadcountFile(file) {
  if (!window.XLSX) throw new Error("Leitor de planilha não carregado.");
  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array", dense: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!rows.length) throw new Error("Arquivo sem linhas para importação.");
  return rows;
}

function dedupeHeadcountRowsForApply(rows, batch) {
  const unique = new Map();
  (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.validationStatus === "valid")
    .forEach((row) => {
      const matricula = String(row.matricula || "").trim();
      if (!matricula) return;
      const key = [
        Number(batch.referenceYear || state.currentPeriod.year),
        Number(batch.referenceMonth || state.currentPeriod.month),
        String(batch.loadType || selectedHeadcountLoadType || "realizado"),
        matricula.toLowerCase()
      ].join("|");
      unique.set(key, {
        ...row,
        matricula
      });
    });
  return Array.from(unique.values());
}

function setHcFeedback(message, type) {
  const el = document.querySelector("#hc-upload-feedback");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("is-error", "is-ok", "is-warn");
  el.classList.add(type === "error" ? "is-error" : type === "ok" ? "is-ok" : "is-warn");
  el.style.display = message ? "" : "none";
}

// ── FIM CARGA DE HEADCOUNT ════════════════════════════════════════════════════

// ── Normalizers & validators ────────────────────────────────────────────────

// FIM CARGA DE PLANEJADO
// ═══════════════════════════════════════════════════════════════════════════════
