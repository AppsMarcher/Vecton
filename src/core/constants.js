(function attachVectonCoreConstants(global) {
const STORAGE_KEY = "forecastapp-master-data-v2";
const AUTH_STORAGE_KEY = "forecastapp-auth-session-v1";
const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MAX_BROWSER_XLSX_BYTES = 50 * 1024 * 1024;
const MAX_BROWSER_TEXT_IMPORT_BYTES = 80 * 1024 * 1024;
const ACTUALS_IMPORT_UPSERT_CHUNK_SIZE = 200;

const extractedSeed = global.FORECASTAPP_SEED || {};
const dreSeed = global.FORECASTAPP_DRE || { nodes: [] };
const ccSeed = global.FORECASTAPP_CC || { costCenters: [], nodes: [] };
const supabaseConfig = global.FORECASTAPP_SUPABASE || {};

const branchSeed = {
  branches: [
    { code: "01", name: "Matriz Gravatai", origin: "seed", note: "" },
    { code: "02", name: "Filial MT", origin: "seed", note: "" }
  ]
};

const defaultProfile = {
  name: "",
  email: "",
  phone: "",
  photoKind: "none",
  photoValue: "",
  department: "",
  role: "Administrador"
};

const SILHOUETTE_AVATAR = "silhouette";

const COST_CENTER_MANAGEMENT_OPTIONS = [
  "Diretoria",
  "Controladoria",
  "Recursos Humanos",
  "Supply Chain",
  "Industrial",
  "Engenharia",
  "Marketing",
  "Produto",
  "Qualidade",
  "Comercial"
];

const ROOT_BRANCH_NODE = {
  code: "ROOT_BRANCH",
  name: "EMPRESA / FILIAL"
};

const ROOT_DRE_NODE = {
  code: "ROOT_DRE",
  name: "DEMONSTRATIVO DE RESULTADOS",
  class: "Sintetica",
  parentCode: null,
  origin: "estrutura"
};

const ROOT_CC_NODE = {
  code: "ROOT_CC",
  name: "PLANO DE CENTROS DE CUSTOS",
  class: "Sintetica",
  parentCode: null,
  type: "ROOT",
  origin: "estrutura"
};

const VIEW_HEADER_METADATA = {
  dashboard: { kicker: "DASHBOARD",     title: "Cockpit Executivo" },
  planning:  { kicker: "PLANEJAMENTO",  title: "Repositório de Cenários" },
  reports:   { kicker: "RELATÓRIOS",    title: "Central de relatórios" },
  branchPlan: { kicker: "PARÂMETROS", title: "Empresa / filial" },
  drePlan:     { kicker: "PARÂMETROS", title: "Plano de contas" },
  managements: { kicker: "PARÂMETROS", title: "Gestões" },
  ccPlan:      { kicker: "PARÂMETROS", title: "Centro de custos" },
  actualsLoad: { kicker: "PARÂMETROS", title: "Carga de realizado" },
  budgetLoad: { kicker: "PARÂMETROS", title: "Carga de planejado" },
  headcountLoad:   { kicker: "PARÂMETROS", title: "Carga de headcount" },
  users:           { kicker: "PARÂMETROS", title: "Usuários" },
  accessProfiles:  { kicker: "PARÂMETROS", title: "Perfis de Acesso" },
  comProdutos:       { kicker: "PARÂMETROS", title: "Produtos" },
  comClientes:       { kicker: "PARÂMETROS", title: "Clientes" },
  comTerritorios:    { kicker: "PARÂMETROS", title: "Território" },
  comCoordenacoes:   { kicker: "PARÂMETROS", title: "Coordenação" },
  comTipos:          { kicker: "PARÂMETROS", title: "Tipo" },
  comCulturas:       { kicker: "PARÂMETROS", title: "Cultura" },
  comLinhasNegocio:  { kicker: "PARÂMETROS", title: "Linha de Negócio" },
  comVendedores:     { kicker: "PARÂMETROS", title: "Vendedores" },
  comAtribuicao:     { kicker: "PARÂMETROS", title: "Atribuição Território → Responsável" },
  comercialVendas:   { kicker: "PARÂMETROS", title: "Carga de Vendas realizadas" },
  comercialPlanejado:{ kicker: "PARÂMETROS", title: "Carga de Vendas planejadas" }
};

global.VECTON_CORE_CONSTANTS = {
  STORAGE_KEY,
  AUTH_STORAGE_KEY,
  MONTH_LABELS,
  MAX_BROWSER_XLSX_BYTES,
  MAX_BROWSER_TEXT_IMPORT_BYTES,
  ACTUALS_IMPORT_UPSERT_CHUNK_SIZE,
  extractedSeed,
  dreSeed,
  ccSeed,
  supabaseConfig,
  branchSeed,
  defaultProfile,
  SILHOUETTE_AVATAR,
  COST_CENTER_MANAGEMENT_OPTIONS,
  ROOT_BRANCH_NODE,
  ROOT_DRE_NODE,
  ROOT_CC_NODE,
  VIEW_HEADER_METADATA
};
})(window);
