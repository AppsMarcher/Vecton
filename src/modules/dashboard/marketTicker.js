(function attachVectonMarketTicker(window) {
  const { escapeHtml } = window.VECTON_CORE_UTILS;

  const AWESOME_URL = "https://economia.awesomeapi.com.br/json/last/";
  const BRAPI_URL = "https://brapi.dev/api/quote/";
  const BRAPI_TOKEN = "4LwMAWvanm6vsnH4cAtfo7";
  const BCB_SGS_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.";

  const TICKER_ITEMS = [
    { id: "usd", label: "USD", source: "awesome", sourceLabel: "AwesomeAPI / Banco Central", pair: "USD-BRL", key: "USDBRL", prefix: "R$ ", decimals: 4, officialUrl: "https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes" },
    { id: "eur", label: "EUR", source: "awesome", sourceLabel: "AwesomeAPI / Banco Central", pair: "EUR-BRL", key: "EURBRL", prefix: "R$ ", decimals: 4, officialUrl: "https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes" },
    { id: "btc", label: "BTC", source: "awesome", sourceLabel: "AwesomeAPI", pair: "BTC-BRL", key: "BTCBRL", prefix: "R$ ", decimals: 2, officialUrl: "https://economia.awesomeapi.com.br/json/last/BTC-BRL" },
    { id: "ibov", label: "IBOV", source: "brapi", sourceLabel: "B3 / brapi", symbol: "^BVSP", prefix: "", decimals: 0, officialUrl: "https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/cotacoes/indices.htm" },
    { id: "selic", label: "SELIC", source: "bcb", sourceLabel: "Banco Central do Brasil", seriesId: "432", prefix: "", suffix: "% a.a.", decimals: 2, changeMode: "diff", historyDepth: 40, officialUrl: "https://www.bcb.gov.br/controleinflacao/historicotaxasjuros" },
    { id: "ipca12", label: "IPCA 12m", source: "bcb", sourceLabel: "Banco Central do Brasil", seriesId: "13522", prefix: "", suffix: "%", decimals: 2, changeMode: "relativePct", historyDepth: 6, officialUrl: "https://www.bcb.gov.br/controleinflacao/historicotaxasjuros" },
    // soy/corn/cattle: até 2026-08 buscavam direto do widget da CEPEA via
    // iframe escondido (scraping). A CEPEA passou a bloquear esse endpoint
    // com desafio Cloudflare (403 + "Cf-Mitigated: challenge"), então agora
    // lemos de public.market_commodities, um cache gravado 1x/dia por uma
    // Edge Function agendada (supabase/functions/market-commodities-worker)
    // que busca no GiroRural. Ver fetchVectonCommodities() abaixo.
    { id: "soy", label: "Soja", source: "vecton_db", sourceLabel: "GiroRural (CEPEA/B3)", prefix: "R$ ", suffix: "/sc", decimals: 2, officialUrl: "https://www.cepea.org.br/br/indicador/soja.aspx" },
    { id: "corn", label: "Milho", source: "vecton_db", sourceLabel: "GiroRural (CEPEA/B3)", prefix: "R$ ", suffix: "/sc", decimals: 2, officialUrl: "https://www.cepea.org.br/br/indicador/milho.aspx" },
    { id: "cattle", label: "Boi Gordo", source: "vecton_db", sourceLabel: "GiroRural (CEPEA/B3)", prefix: "R$ ", suffix: "/@", decimals: 2, officialUrl: "https://www.cepea.org.br/br/indicador/boi-gordo.aspx" }
  ];
  const TICKER_ITEM_MAP = new Map(TICKER_ITEMS.map((item) => [item.id, item]));

  const TICKER_FALLBACK = [
    { id: "usd", label: "USD", value: "Carregando...", change: "-", dir: "flat", mock: true },
    { id: "eur", label: "EUR", value: "Carregando...", change: "-", dir: "flat", mock: true },
    { id: "btc", label: "BTC", value: "Carregando...", change: "-", dir: "flat", mock: true },
    { id: "ibov", label: "IBOV", value: "Carregando...", change: "-", dir: "flat", mock: true },
    { id: "selic", label: "SELIC", value: "Carregando...", change: "-", dir: "flat", mock: true },
    { id: "ipca12", label: "IPCA 12m", value: "Carregando...", change: "-", dir: "flat", mock: true },
    { id: "soy", label: "Soja", value: "Carregando...", change: "-", dir: "flat", mock: true },
    { id: "corn", label: "Milho", value: "Carregando...", change: "-", dir: "flat", mock: true },
    { id: "cattle", label: "Boi Gordo", value: "Carregando...", change: "-", dir: "flat", mock: true }
  ];
  const TICKER_FALLBACK_MAP = new Map(TICKER_FALLBACK.map((item) => [item.id, item]));

  let tickerItems = TICKER_FALLBACK.slice();
  let tickerRefreshHandle = null;
  const tickerState = {};
  let tickerPopover = null;

  function buildTickerHtml(items) {
    const buildItem = (item) => `
      <button type="button" class="ticker-item${item.mock ? " ticker-mock" : ""}${item.stale ? " ticker-stale" : ""}" data-ticker-id="${escapeHtml(item.id || "")}" aria-label="Abrir fonte de ${escapeHtml(item.label)}" title="${escapeHtml(item.tooltip || "")}">
        <span class="ticker-label">${escapeHtml(item.label)}</span>
        <span class="ticker-value">${escapeHtml(item.value)}</span>
        <span class="ticker-change ${item.dir}">${escapeHtml(item.change)}</span>
      </button>
    `;
    return [...items, ...items, ...items, ...items].map(buildItem).join("");
  }

  function renderMarketTicker() {
    const track = document.querySelector("#market-ticker-track");
    if (!track) return;
    track.innerHTML = buildTickerHtml(tickerItems);
  }

  function ensureTickerPopover() {
    if (tickerPopover) return tickerPopover;
    tickerPopover = document.createElement("div");
    tickerPopover.className = "ticker-link-popover";
    tickerPopover.hidden = true;
    tickerPopover.innerHTML = `
      <div class="ticker-link-popover-head">
        <strong id="ticker-link-title">Fonte do indicador</strong>
        <button type="button" class="ticker-link-popover-close" data-ticker-popover-close aria-label="Fechar">×</button>
      </div>
      <p id="ticker-link-copy" class="ticker-link-popover-copy">Deseja abrir a fonte oficial deste indicador em uma nova janela?</p>
      <div class="ticker-link-popover-actions">
        <button type="button" class="ghost-button ticker-link-cancel" data-ticker-popover-cancel>Cancelar</button>
        <button type="button" class="primary-button ticker-link-open" data-ticker-popover-open>Abrir fonte</button>
      </div>
    `;
    document.body.appendChild(tickerPopover);
    return tickerPopover;
  }

  function closeTickerPopover() {
    const popover = ensureTickerPopover();
    popover.hidden = true;
    popover.removeAttribute("data-url");
  }

  function positionTickerPopover(anchor) {
    const popover = ensureTickerPopover();
    // Centralizado na tela.
    popover.style.position = "fixed";
    popover.style.left = "50%";
    popover.style.top = "50%";
    popover.style.right = "auto";
    popover.style.transform = "translate(-50%, -50%)";
  }

  function openTickerPopover(anchor, item) {
    const popover = ensureTickerPopover();
    if (!item?.officialUrl) return;
    popover.hidden = false;
    popover.dataset.url = item.officialUrl;
    popover.querySelector("#ticker-link-title").textContent = item.label;
    popover.querySelector("#ticker-link-copy").textContent = `Deseja abrir a fonte oficial de ${item.label} em uma nova janela?`;
    positionTickerPopover(anchor);
  }

  function formatTickerNumber(value, digits) {
    return Number(value).toLocaleString("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function formatTickerPct(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "-";
    return `${parsed > 0 ? "+" : ""}${formatTickerNumber(parsed, 2)}%`;
  }

  function formatTooltipDate(value) {
    if (!value) return "Atualizacao indisponivel";
    if (typeof value === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      return value;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function buildTickerTooltip(item, quote, stale = false) {
    const sourceLabel = item.sourceLabel || item.label;
    const dateLabel = formatTooltipDate(quote?.updatedAt || quote?.updatedAtText);
    const staleLabel = stale ? " (ultimo valor valido)" : "";
    return `Fonte: ${sourceLabel}\nAtualizacao: ${dateLabel}${staleLabel}`;
  }

  function getTickerDir(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed === 0) return "flat";
    return parsed > 0 ? "up" : "down";
  }

  function normalizeTickerItem(item, quote, stale = false) {
    if (!item || !quote || !Number.isFinite(quote.value)) return null;
    const valueNumber = quote.value;
    const changeNumber = quote.pct;
    const baseValue = item.prefix
      ? `${item.prefix}${formatTickerNumber(valueNumber, item.decimals)}`
      : formatTickerNumber(valueNumber, item.decimals);
    const formattedChange = item.changeMode === "diff"
      ? `${Number(changeNumber) > 0 ? "+" : ""}${formatTickerNumber(changeNumber, 2)} p.p.`
      : formatTickerPct(quote.pct);
    return {
      id: item.id,
      label: item.label,
      value: `${baseValue}${item.suffix || ""}`,
      change: formattedChange,
      dir: getTickerDir(changeNumber),
      stale,
      tooltip: buildTickerTooltip(item, quote, stale)
    };
  }

  function parsePtBrNumber(rawValue) {
    if (rawValue === null || rawValue === undefined) return NaN;
    const cleaned = String(rawValue)
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^\d,.-]/g, "");
    if (!cleaned) return NaN;

    if (cleaned.includes(",") && cleaned.includes(".")) {
      return Number(cleaned.replace(/\./g, "").replace(",", "."));
    }
    if (cleaned.includes(",")) {
      return Number(cleaned.replace(",", "."));
    }
    return Number(cleaned);
  }

  function parseBcbDate(value) {
    const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    return new Date(`${year}-${month}-${day}T00:00:00`);
  }

  function formatBcbDateParam(date) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  async function fetchAwesome(items) {
    const pairs = items.map((item) => item.pair).join(",");
    if (!pairs) return {};
    const response = await fetch(AWESOME_URL + pairs);
    if (!response.ok) throw new Error(`AwesomeAPI HTTP ${response.status}`);
    const data = await response.json();
    const output = {};
    items.forEach((item) => {
      const quote = data[item.key];
      if (!quote) return;
      output[item.id] = {
        value: Number.parseFloat(quote.bid),
        pct: Number.parseFloat(quote.pctChange),
        updatedAt: quote.create_date || new Date().toISOString()
      };
    });
    return output;
  }

  async function fetchBrapi(items, token) {
    const symbols = items.map((item) => item.symbol).join(",");
    if (!symbols) return {};
    const url = `${BRAPI_URL}${encodeURIComponent(symbols)}?token=${encodeURIComponent(token || "")}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`brapi HTTP ${response.status}`);
    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];
    const output = {};
    const normalizeBrapiSymbol = (value) => String(value || "")
      .toUpperCase()
      .replace(/^\^+/, "")
      .replace(/[^A-Z0-9]/g, "");
    items.forEach((item) => {
      const quote = results.find((entry) => {
        const symbol = normalizeBrapiSymbol(entry.symbol || entry.stock || entry.name);
        const target = normalizeBrapiSymbol(item.symbol);
        return symbol === target || symbol.includes(target) || target.includes(symbol);
      }) || (results.length === 1 ? results[0] : null);
      if (!quote) return;
      const value = Number(
        quote.regularMarketPrice
        ?? quote.regularMarketPreviousClose
        ?? quote.close
        ?? quote.price
      );
      const pct = Number(
        quote.regularMarketChangePercent
        ?? quote.changePercent
        ?? quote.variationPercent
        ?? 0
      );
      const marketTime = quote.regularMarketTime
        ?? quote.updatedAt
        ?? quote.updateTime
        ?? null;
      if (!Number.isFinite(value)) return;
      const marketTimestamp = Number(marketTime);
      output[item.id] = {
        value,
        pct: Number.isFinite(pct) ? pct : 0,
        updatedAt: Number.isFinite(marketTimestamp) && marketTimestamp > 0
          ? new Date(marketTimestamp * 1000).toISOString()
          : new Date().toISOString()
      };
    });
    return output;
  }

  async function fetchBcb(items) {
    if (!items.length) return {};
    const output = {};

    await Promise.all(items.map(async (item) => {
      try {
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - Number(item.lookbackDays || 550));

        const params = new URLSearchParams({
          formato: "json",
          dataInicial: formatBcbDateParam(startDate),
          dataFinal: formatBcbDateParam(endDate)
        });
        const url = `${BCB_SGS_URL}${item.seriesId}/dados?${params.toString()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`BCB HTTP ${response.status}`);

        const data = await response.json();
        const rows = (Array.isArray(data) ? data : [])
          .map((row) => ({
            ...row,
            parsedDate: parseBcbDate(row?.data),
            parsedValue: parsePtBrNumber(row?.valor)
          }))
          .filter((row) => row.parsedDate && Number.isFinite(row.parsedValue))
          .sort((a, b) => a.parsedDate - b.parsedDate);

        const current = rows[rows.length - 1];
        const currentValue = current?.parsedValue;
        if (!Number.isFinite(currentValue)) return;

        const previousRow = [...rows]
          .slice(0, -1)
          .reverse()
          .find((row) => row.parsedValue !== currentValue) || rows[rows.length - 2];
        const previousValue = previousRow?.parsedValue;

        const changeValue = item.changeMode === "relativePct"
          ? (Number.isFinite(previousValue) && previousValue !== 0
            ? ((currentValue - previousValue) / previousValue) * 100
            : 0)
          : (Number.isFinite(previousValue) ? currentValue - previousValue : 0);

        output[item.id] = {
          value: currentValue,
          pct: changeValue,
          updatedAtText: current?.data || ""
        };
      } catch (error) {
        console.warn(`[ticker] BCB falhou para ${item.label}:`, error);
      }
    }));

    return output;
  }


  // Persiste o ultimo quote valido de cada item (todas as fontes) entre
  // recarregamentos de pagina. Sem isso, se a fonte falhar
  // (ex: brapi com cota estourada — token e' fixo no cliente, cota
  // compartilhada por TODAS as abas/usuarios) logo no primeiro fetch da
  // sessao, o item fica preso em "Carregando..." pra sempre: tickerState
  // nunca chega a existir pra esse id, entao nao ha nada pra marcar como
  // "stale" (o marcador stale so cobre item que ja tinha sucesso ANTES,
  // na mesma sessao). Com o cache, reabrir a pagina reidrata o ultimo
  // valor conhecido (marcado stale) em vez de voltar a mostrar o mock.
  const TICKER_STATE_KEY = "vecton-ticker-state-v1";

  function loadTickerStateCache() {
    try { return JSON.parse(localStorage.getItem(TICKER_STATE_KEY) || "{}"); }
    catch { return {}; }
  }

  function saveTickerStateCache() {
    try { localStorage.setItem(TICKER_STATE_KEY, JSON.stringify(tickerState)); }
    catch {}
  }

  // soy/corn/cattle: le o cache gravado 1x/dia pela Edge Function
  // market-commodities-worker (ver supabase/functions/market-commodities-worker)
  // em vez de buscar direto na CEPEA (bloqueada por Cloudflare desde 2026-08).
  // Mesmo dado publico que os demais indicadores do ticker (USD/SELIC/IBOV),
  // por isso segue sem token de sessao, so a chave anonima do projeto.
  async function fetchVectonCommodities(items) {
    if (!items.length) return {};
    const config = window.FORECASTAPP_SUPABASE || {};
    if (!config.projectUrl || !config.anonKey) return {};

    const ids = items.map((item) => item.id).join(",");
    const url = `${config.projectUrl}/rest/v1/market_commodities?select=item_id,value,pct,quote_date,updated_at&item_id=in.(${ids})`;
    const response = await fetch(url, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`
      }
    });
    if (!response.ok) throw new Error(`market_commodities HTTP ${response.status}`);

    const rows = await response.json();
    const output = {};
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const value = Number(row.value);
      if (!Number.isFinite(value)) return;
      output[row.item_id] = {
        value,
        pct: Number(row.pct) || 0,
        updatedAtText: row.quote_date || null,
        updatedAt: row.updated_at
      };
    });
    return output;
  }

  function rebuildTickerItems() {
    tickerItems = TICKER_ITEMS.map((item) => {
      const quote = tickerState[item.id];
      const normalized = normalizeTickerItem(item, quote, quote?.stale);
      if (normalized) return normalized;
      const fallback = TICKER_FALLBACK_MAP.get(item.id);
      return fallback ? { ...fallback } : null;
    }).filter(Boolean);
  }

  function bindTickerInteractions() {
    const track = document.querySelector("#market-ticker-track");
    if (!track || track.dataset.bound === "true") return;
    track.dataset.bound = "true";

    track.addEventListener("click", (event) => {
      const itemButton = event.target.closest("[data-ticker-id]");
      if (!itemButton) return;
      const item = TICKER_ITEM_MAP.get(itemButton.dataset.tickerId);
      if (!item?.officialUrl) return;
      event.preventDefault();
      openTickerPopover(itemButton, item);
    });

    document.addEventListener("click", (event) => {
      const popover = ensureTickerPopover();
      if (popover.hidden) return;
      if (event.target.closest(".ticker-link-popover")) return;
      if (event.target.closest("[data-ticker-id]")) return;
      closeTickerPopover();
    });

    window.addEventListener("resize", () => {
      const popover = ensureTickerPopover();
      if (popover.hidden) return;
      closeTickerPopover();
    });

    const popover = ensureTickerPopover();
    popover.addEventListener("click", (event) => {
      if (event.target.closest("[data-ticker-popover-close]") || event.target.closest("[data-ticker-popover-cancel]")) {
        closeTickerPopover();
        return;
      }
      if (event.target.closest("[data-ticker-popover-open]")) {
        const url = popover.dataset.url;
        if (url) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
        closeTickerPopover();
      }
    });
  }

  // brapi (IBOV) tem cota mensal curta (15.000 req/mes) — uma aba aberta
  // sozinha ja consome isso em poucos dias no ciclo de 60s do resto do
  // ticker. Por isso o brapi tem seu proprio intervalo, bem mais longo;
  // os demais itens (awesome/bcb/vecton_db) continuam no ciclo de 60s normal.
  const BRAPI_REFRESH_MS = 60 * 60 * 1000; // 60 minutos
  let lastBrapiFetchAt = 0;

  async function fetchTickerLive() {
    const awesomeItems = TICKER_ITEMS.filter((item) => item.source === "awesome");
    const brapiItems = TICKER_ITEMS.filter((item) => item.source === "brapi");
    const bcbItems = TICKER_ITEMS.filter((item) => item.source === "bcb");
    const vectonDbItems = TICKER_ITEMS.filter((item) => item.source === "vecton_db");

    const shouldFetchBrapi = brapiItems.length > 0 && (Date.now() - lastBrapiFetchAt >= BRAPI_REFRESH_MS);
    // marca o timestamp na TENTATIVA (nao no sucesso) pra nao martelar a API
    // a cada 60s enquanto a cota estiver estourada — so tenta de novo apos
    // o intervalo cheio, sucesso ou falha.
    if (shouldFetchBrapi) lastBrapiFetchAt = Date.now();

    const staleKeys = new Set([
      ...awesomeItems.map((item) => item.id),
      ...(shouldFetchBrapi ? brapiItems.map((item) => item.id) : []),
      ...bcbItems.map((item) => item.id),
      ...vectonDbItems.map((item) => item.id)
    ]);
    Object.keys(tickerState).forEach((key) => {
      if (!staleKeys.has(key)) return;
      tickerState[key] = { ...tickerState[key], stale: true };
    });

    const [awesomeResult, brapiResult, bcbResult, vectonDbResult] = await Promise.allSettled([
      fetchAwesome(awesomeItems),
      shouldFetchBrapi ? fetchBrapi(brapiItems, BRAPI_TOKEN) : Promise.resolve({}),
      fetchBcb(bcbItems),
      fetchVectonCommodities(vectonDbItems)
    ]);

    if (awesomeResult.status === "fulfilled") {
      Object.entries(awesomeResult.value).forEach(([key, quote]) => {
        tickerState[key] = { ...quote, stale: false };
      });
    } else {
      console.warn("[ticker] AwesomeAPI falhou:", awesomeResult.reason);
    }

    if (brapiResult.status === "fulfilled") {
      Object.entries(brapiResult.value).forEach(([key, quote]) => {
        tickerState[key] = { ...quote, stale: false };
      });
    } else if (shouldFetchBrapi) {
      console.warn("[ticker] brapi falhou:", brapiResult.reason);
    }

    if (bcbResult.status === "fulfilled") {
      Object.entries(bcbResult.value).forEach(([key, quote]) => {
        tickerState[key] = { ...quote, stale: false };
      });
    } else {
      console.warn("[ticker] BCB falhou:", bcbResult.reason);
    }

    if (vectonDbResult.status === "fulfilled") {
      Object.entries(vectonDbResult.value).forEach(([key, quote]) => {
        tickerState[key] = { ...quote, stale: false };
      });
    } else {
      console.warn("[ticker] market_commodities falhou:", vectonDbResult.reason);
    }

    saveTickerStateCache();
    rebuildTickerItems();
    renderMarketTicker();
  }

  function startMarketTicker() {
    // Reidrata o ultimo valor valido de cada item (ver comentario em
    // TICKER_STATE_KEY) antes do primeiro fetch — assim, se a fonte falhar
    // agora, o ticker mostra o ultimo valor conhecido (marcado stale) em
    // vez do mock "Carregando...".
    Object.entries(loadTickerStateCache()).forEach(([id, quote]) => {
      if (quote && Number.isFinite(quote.value)) tickerState[id] = { ...quote, stale: true };
    });
    rebuildTickerItems();
    renderMarketTicker();
    bindTickerInteractions();
    void fetchTickerLive();
    if (tickerRefreshHandle) clearInterval(tickerRefreshHandle);
    tickerRefreshHandle = setInterval(() => {
      void fetchTickerLive();
    }, 60 * 1000);
  }

  window.VECTON_MARKET_TICKER = {
    startMarketTicker
  };
})(window);
