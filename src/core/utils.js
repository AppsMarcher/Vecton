(function attachVectonCoreUtils(global) {
const {
  COST_CENTER_MANAGEMENT_OPTIONS,
  MONTH_LABELS,
  ROOT_CC_NODE,
  ROOT_DRE_NODE
} = global.VECTON_CORE_CONSTANTS;

function normalizeHeaderName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeCode(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeDateInput(value) {
  if (!value) return "";
  if (typeof value === "number" && window.XLSX?.SSF?.parse_date_code) {
    const parsed = window.XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, day, month, year] = slash;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const shortSlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (shortSlash) {
    const [, first, second, year2] = shortSlash;
    const year = Number(year2) >= 70 ? `19${year2}` : `20${year2}`;
    return `${year}-${second.padStart(2, "0")}-${first.padStart(2, "0")}`;
  }
  return "";
}

function parseLocalizedAmount(value) {
  if (typeof value === "number") return value;
  const raw = String(value || "").trim();
  if (!raw) return NaN;
  return Number(raw.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
}

function dateMatchesPeriod(isoDate, year, month) {
  const [dateYear, dateMonth] = String(isoDate || "").split("-").map(Number);
  return dateYear === Number(year) && dateMonth === Number(month);
}

function buildPeriodDate(year, month) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

function formatMonthLabel(month) {
  return MONTH_LABELS[Math.max(0, Math.min(11, Number(month) - 1))];
}

function formatPeriodLabel(year, month) {
  return `${formatMonthLabel(month)}/${year}`;
}

function formatDisplayDate(value) {
  const iso = normalizeDateInput(value);
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function formatAmountInput(value) {
  if (!Number.isFinite(Number(value))) return "";
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatActualsStatus(status) {
  const map = {
    draft: "Rascunho",
    validating: "Validando",
    error: "Com erro",
    ready: "Pronto",
    applied: "Aplicado",
    cancelled: "Cancelado",
    valid: "Valida",
    pending: "Pendente"
  };
  return map[status] || status;
}

function getActualsStatusClass(status) {
  if (status === "error") return "is-error";
  if (status === "applied" || status === "valid" || status === "ready") return "is-ok";
  return "is-warn";
}

function formatActualsFieldName(key) {
  const map = {
    entryDate: "data",
    accountNumber: "conta",
    branchCode: "empresa",
    amount: "valor"
  };
  return map[key] || key;
}

function formatFileSize(bytes) {
  const numeric = Number(bytes || 0);
  if (numeric <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(numeric) / Math.log(1024)), units.length - 1);
  const value = numeric / (1024 ** power);
  return `${value.toFixed(value >= 100 || power === 0 ? 0 : 1)} ${units[power]}`;
}

function chunkArray(items, chunkSize) {
  const normalizedChunkSize = Math.max(1, Number(chunkSize) || 1);
  const chunks = [];
  for (let index = 0; index < items.length; index += normalizedChunkSize) {
    chunks.push(items.slice(index, index + normalizedChunkSize));
  }
  return chunks;
}

function isStatementTimeoutError(error) {
  const message = String(error?.message || error || "");
  return message.includes('"code":"57014"') || message.includes("statement timeout") || message.includes("canceling statement due to statement timeout");
}

// Traduz erros técnicos (Postgres/PostgREST/rede) em mensagens amigáveis com
// orientação de ajuste. Mensagens já em português (lançadas pelo app ou por
// "raise exception" nas RPCs) passam direto.
function vpFriendlyError(error, fallback = "Ocorreu um erro inesperado.") {
  const raw = String(error?.message || error || "").trim();
  if (!raw) return fallback;

  let parsed = null;
  if (raw.startsWith("{")) {
    try { parsed = JSON.parse(raw); } catch (_) {}
  }
  const code = String(parsed?.code || "");
  const msg = String(parsed?.message || raw);
  const lower = msg.toLowerCase();

  if (code === "42501" || lower.includes("row-level security") || lower.includes("permission denied")) {
    return "Você não tem permissão para esta ação. Confirme com o administrador se o seu perfil tem acesso de edição nesta área.";
  }
  if (code === "57014" || lower.includes("statement timeout")) {
    return "A operação demorou além do limite do servidor e foi cancelada. Tente novamente; se o problema continuar, avise o administrador.";
  }
  if (code === "23505" || lower.includes("duplicate key")) {
    return "Registro duplicado: já existe um item com estes mesmos dados.";
  }
  if (code === "23503" || lower.includes("foreign key")) {
    return "Este registro está vinculado a outros dados do sistema e não pode ser excluído ou alterado.";
  }
  if (code === "23502" || lower.includes("null value in column")) {
    return "Há um campo obrigatório sem valor. Revise os dados e tente novamente.";
  }
  if (code === "22P02" || lower.includes("invalid input syntax")) {
    return "Um dos valores está em formato inválido (número, data ou código). Revise os dados e tente novamente.";
  }
  if (code === "PGRST301" || lower.includes("jwt") || lower.includes("sessao expirada") || lower.includes("sessao ausente")) {
    return "Sua sessão expirou. Atualize a página (F5) e entre novamente.";
  }
  if (code === "PGRST205" || code === "42P01" || lower.includes("schema cache") || lower.includes("does not exist")) {
    return "O banco de dados está desatualizado em relação ao aplicativo. Avise o administrador do sistema.";
  }
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed")) {
    return "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
  }
  if (msg.includes("Organizacao") && msg.includes("nao encontrada")) {
    return "Seu usuário não está vinculado à organização no banco de dados. Avise o administrador do sistema.";
  }

  // RPCs sinalizam regras de negócio via "raise exception" (P0001) com texto em português
  if (code === "P0001" && parsed?.message) {
    return parsed.message;
  }

  // Mensagens curtas sem cara de erro técnico já são amigáveis (lançadas pelo próprio app)
  if (!parsed && raw.length <= 180 && !/[{}\[\]]|error:|exception|constraint|violates/i.test(raw)) {
    return raw;
  }

  const compact = msg.replace(/\s+/g, " ").replace(/["{}\[\]]/g, "").slice(0, 140);
  return `${fallback} Detalhe técnico: ${compact} — se precisar de ajuda, envie esta mensagem ao administrador.`;
}

function isActualsApplyTimeoutError(error) {
  return isStatementTimeoutError(error);
}

function normalizeBranchCode(value) {
  const digitsOnly = String(value || "").replace(/\D/g, "");
  return digitsOnly.slice(0, 2).padStart(Math.min(2, Math.max(1, digitsOnly.length)), "0");
}

function normalizeCostCenterManagement(value, names) {
  const normalized = String(value || "").trim();
  const list = (names && names.length) ? names : COST_CENTER_MANAGEMENT_OPTIONS;
  return list.includes(normalized) ? normalized : "";
}

function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildFunAvatars() {
  return [
    { key: "alien-green", label: "Alien verde", dataUrl: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="22" fill="#D5F5E3"/><ellipse cx="40" cy="44" rx="22" ry="20" fill="#54B948"/><ellipse cx="31" cy="40" rx="6" ry="9" fill="#1B1B1B"/><ellipse cx="49" cy="40" rx="6" ry="9" fill="#1B1B1B"/><path d="M28 54c7 5 17 5 24 0" stroke="#1B1B1B" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M40 18v10" stroke="#54B948" stroke-width="4" stroke-linecap="round"/><circle cx="40" cy="14" r="5" fill="#54B948"/></svg>`) },
    { key: "robot-blue", label: "Robo azul", dataUrl: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="22" fill="#D9EEFF"/><rect x="18" y="20" width="44" height="40" rx="12" fill="#4597E6"/><rect x="28" y="32" width="8" height="8" rx="2" fill="#fff"/><rect x="44" y="32" width="8" height="8" rx="2" fill="#fff"/><rect x="30" y="48" width="20" height="4" rx="2" fill="#103B66"/><path d="M40 14v8" stroke="#103B66" stroke-width="4" stroke-linecap="round"/><circle cx="40" cy="11" r="4" fill="#F59E0B"/></svg>`) },
    { key: "cat-orange", label: "Gato laranja", dataUrl: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="22" fill="#FFF1D6"/><path d="M24 28l8-12 8 10M56 28l-8-12-8 10" fill="#F28C28"/><circle cx="40" cy="42" r="20" fill="#F28C28"/><circle cx="33" cy="40" r="3" fill="#1B1B1B"/><circle cx="47" cy="40" r="3" fill="#1B1B1B"/><path d="M36 49c3 3 5 3 8 0" stroke="#1B1B1B" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M22 44h10M48 44h10M21 50h12M47 50h12" stroke="#B45309" stroke-width="2" stroke-linecap="round"/></svg>`) },
    { key: "planet-purple", label: "Planeta roxo", dataUrl: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="22" fill="#EEE2FF"/><circle cx="40" cy="40" r="20" fill="#8B5CF6"/><ellipse cx="40" cy="44" rx="28" ry="8" fill="none" stroke="#F59E0B" stroke-width="5"/><circle cx="32" cy="35" r="3" fill="#fff"/><circle cx="48" cy="45" r="4" fill="#C4B5FD"/><circle cx="22" cy="24" r="3" fill="#F59E0B"/><circle cx="58" cy="20" r="2" fill="#F59E0B"/></svg>`) },
    { key: "ghost-mint", label: "Fantasma menta", dataUrl: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="22" fill="#DDFCF4"/><path d="M24 56V36c0-10 7-18 16-18s16 8 16 18v20l-6-4-4 4-6-4-6 4-4-4z" fill="#34D399"/><circle cx="34" cy="36" r="4" fill="#143B36"/><circle cx="46" cy="36" r="4" fill="#143B36"/><path d="M33 46c4 3 10 3 14 0" stroke="#143B36" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`) },
    { key: "rocket-red", label: "Foguete vermelho", dataUrl: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="22" fill="#FFE4E4"/><path d="M40 16c11 8 13 22 13 31L40 58 27 47c0-9 2-23 13-31z" fill="#EF4444"/><circle cx="40" cy="35" r="6" fill="#DBEAFE"/><path d="M30 50l-8 10 10-3M50 50l8 10-10-3" fill="#F59E0B"/><path d="M40 58l-5 8h10z" fill="#F97316"/></svg>`) }
  ];
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

function getDefaultExpandedCodes(nodes) {
  return nodes
    .filter((node) => node.code.length <= 5 || ["3", "4", "51401001"].includes(node.code))
    .map((node) => node.code)
    .concat(ROOT_DRE_NODE.code);
}

function getDefaultExpandedCcCodes(nodes) {
  return nodes
    .filter((node) => node.class === "Sintetica")
    .map((node) => node.code)
    .concat(ROOT_CC_NODE.code);
}

function buildEmptyRow(message, colspan) {
  const row = document.createElement("tr");
  row.className = "empty-row";
  const cell = document.createElement("td");
  cell.colSpan = colspan;
  cell.textContent = message;
  row.append(cell);
  return row;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

global.VECTON_CORE_UTILS = {
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
};
})(window);
