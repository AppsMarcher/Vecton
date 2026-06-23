(function attachVectonMarketTicker(window) {
  const { escapeHtml } = window.VECTON_CORE_UTILS;

  const AWESOME_URL = "https://economia.awesomeapi.com.br/json/last/";
  const BRAPI_URL = "https://brapi.dev/api/quote/";
  const BRAPI_TOKEN = "4LwMAWvanm6vsnH4cAtfo7";
  const BCB_SGS_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.";
  const CEPEA_WIDGET_BASE = "https://cepea.org.br/br/widgetproduto.js.php";
  const CEPEA_INDICATORS = {
    soy: 92,
    corn: 77
  };

  const TICKER_ITEMS = [
    { id: "usd", label: "USD", source: "awesome", sourceLabel: "AwesomeAPI / Banco Central", pair: "USD-BRL", key: "USDBRL", prefix: "R$ ", decimals: 4, officialUrl: "https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes" },
    { id: "eur", label: "EUR", source: "awesome", sourceLabel: "AwesomeAPI / Banco Central", pair: "EUR-BRL", key: "EURBRL", prefix: "R$ ", decimals: 4, officialUrl: "https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes" },
    { id: "btc", label: "BTC", source: "awesome", sourceLabel: "AwesomeAPI", pair: "BTC-BRL", key: "BTCBRL", prefix: "R$ ", decimals: 2, officialUrl: "https://economia.awesomeapi.com.br/json/last/BTC-BRL" },
    { id: "ibov", label: "IBOV", source: "brapi", sourceLabel: "B3 / brapi", symbol: "^BVSP", prefix: "", decimals: 0, officialUrl: "https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/cotacoes/indices.htm" },
    { id: "selic", label: "SELIC", source: "bcb", sourceLabel: "Banco Central do Brasil", seriesId: "432", prefix: "", suffix: "% a.a.", decimals: 2, changeMode: "diff", historyDepth: 40, officialUrl: "https://www.bcb.gov.br/controleinflacao/historicotaxasjuros" },
    { id: "ipca12", label: "IPCA 12m", source: "bcb", sourceLabel: "Banco Central do Brasil", seriesId: "13522", prefix: "", suffix: "%", decimals: 2, changeMode: "relativePct", historyDepth: 6, officialUrl: "https://www.bcb.gov.br/controleinflacao/historicotaxasjuros" },
    { id: "soy", label: "Soja", source: "cepea", sourceLabel: "CEPEA/ESALQ", indicatorId: CEPEA_INDICATORS.soy, prefix: "R$ ", suffix: "/sc", decimals: 2, officialUrl: "https://www.cepea.org.br/br/indicador/soja.aspx" },
    { id: "corn", label: "Milho", source: "cepea", sourceLabel: "CEPEA/ESALQ", indicatorId: CEPEA_INDICATORS.corn, prefix: "R$ ", suffix: "/sc", decimals: 2, officialUrl: "https://www.cepea.org.br/br/indicador/milho.aspx" }
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
    { id: "corn", label: "Milho", value: "Carregando...", change: "-", dir: "flat", mock: true }
  ];
  const TICKER_FALLBACK_MAP = new Map(TICKER_FALLBACK.map((item) => [item.id, item]));

  let tickerItems = TICKER_FALLBACK.slice();
  let tickerRefreshHandle = null;
  const tickerState = {};
  let cepeaHost = null;
  const cepeaFrames = new Map();
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

  function ensureCepeaHost() {
    if (cepeaHost) return cepeaHost;
    cepeaHost = document.createElement("div");
    cepeaHost.setAttribute("aria-hidden", "true");
    cepeaHost.style.cssText = [
      "position:absolute",
      "left:-9999px",
      "top:0",
      "width:1px",
      "height:1px",
      "overflow:hidden",
      "opacity:0",
      "pointer-events:none"
    ].join(";");
    document.body.appendChild(cepeaHost);
    return cepeaHost;
  }

  function buildCepeaSrcdoc(indicatorId) {
    const scriptUrl = `${CEPEA_WIDGET_BASE}?fonte=arial&tamanho=10&largura=320px&corfundo=111214&cortexto=f3f4f6&corlinha=16181d&id_indicador%5B%5D=${indicatorId}`;
    return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;overflow:hidden;background:#111214;color:#f3f4f6"><script src="${scriptUrl}"></script></body></html>`;
  }

  function getCepeaFrame(item) {
    ensureCepeaHost();
    if (cepeaFrames.has(item.id)) {
      return cepeaFrames.get(item.id);
    }
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "display:block;width:320px;height:120px;border:0;overflow:hidden;";
    cepeaHost.appendChild(frame);
    cepeaFrames.set(item.id, frame);
    return frame;
  }

  function extractCepeaQuoteFromDocument(doc) {
    const text = String(doc?.body?.innerText || doc?.body?.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return null;

    const currencyMatch = text.match(/R\$\s*([\d.]+,\d{2})/i);
    const numberMatches = text.match(/[\d.]+,\d{2}/g) || [];
    const percentMatch = text.match(/([+\-−]?\d+,\d{2})\s*%/);

    const value = parsePtBrNumber(currencyMatch?.[1] || numberMatches[0]);
    const pct = parsePtBrNumber(percentMatch?.[1] || "0");

    if (!Number.isFinite(value)) return null;
    return {
      value,
      pct: Number.isFinite(pct) ? pct : 0,
      updatedAt: new Date().toISOString()
    };
  }

  function loadCepeaItem(item) {
    return new Promise((resolve, reject) => {
      const frame = getCepeaFrame(item);
      let finished = false;

      const finish = (result, error = null) => {
        if (finished) return;
        finished = true;
        frame.removeEventListener("load", onLoad);
        clearTimeout(timeoutId);
        timers.forEach((timer) => clearTimeout(timer));
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      };

      const tryRead = () => {
        try {
          const quote = extractCepeaQuoteFromDocument(frame.contentDocument);
          if (quote) finish(quote);
        } catch (_) {
          // aguarda proxima tentativa
        }
      };

      const onLoad = () => {
        tryRead();
        timers.push(setTimeout(tryRead, 400));
        timers.push(setTimeout(tryRead, 1200));
        timers.push(setTimeout(tryRead, 2500));
      };

      const timers = [];
      const timeoutId = setTimeout(() => {
        finish(null, new Error(`CEPEA timeout (${item.label})`));
      }, 6000);

      frame.addEventListener("load", onLoad, { once: false });
      frame.srcdoc = buildCepeaSrcdoc(item.indicatorId);
    });
  }

  const CEPEA_PREV_KEY = "vecton-cepea-prev-v1";

  function loadCepeaPrevCache() {
    try { return JSON.parse(localStorage.getItem(CEPEA_PREV_KEY) || "{}"); }
    catch { return {}; }
  }

  function saveCepeaPrevCache(cache) {
    try { localStorage.setItem(CEPEA_PREV_KEY, JSON.stringify(cache)); }
    catch {}
  }

  // Mantém today/prev separados para calcular variação entre dias.
  // Se o dia mudou: today vira prev antes de ser sobrescrito.
  // Múltiplos fetches no mesmo dia atualizam today sem tocar em prev.
  // Fallback entry.prev garante que seeds manuais (today=null) não sejam descartados.
  function updateCepeaEntry(cache, id, dateStr, value) {
    const entry = cache[id] || {};
    if (entry.today?.date === dateStr) {
      cache[id] = { today: { date: dateStr, value }, prev: entry.prev || null };
    } else {
      cache[id] = { today: { date: dateStr, value }, prev: entry.today || entry.prev || null };
    }
  }

  // Seed inicial: preços de referência para a primeira variação antes do cache acumular dados reais.
  // Remove as entradas de seed quando o app já tiver valores reais (today preenchido).
  function initCepeaPrevCache() {
    const cache = loadCepeaPrevCache();
    const seeds = {
      soy:  { date: "2026-06-22", value: 132.84 },
      corn: { date: "2026-06-22", value: 62.97 }
    };
    let changed = false;
    for (const [id, seed] of Object.entries(seeds)) {
      // Semeia se prev está ausente — cobre tanto localStorage vazio quanto
      // entradas existentes com prev:null deixadas por versões anteriores do código.
      if (!cache[id]?.prev) {
        cache[id] = { today: cache[id]?.today || null, prev: seed };
        changed = true;
      }
    }
    if (changed) saveCepeaPrevCache(cache);
  }

  async function fetchCepea(items) {
    if (!items.length) return {};
    const output = {};
    const prevCache = loadCepeaPrevCache();
    const today = new Date().toISOString().slice(0, 10);

    await Promise.all(items.map(async (item) => {
      const quote = await loadCepeaItem(item);
      if (!quote) return;

      let pct = quote.pct || 0;

      // Se o widget não forneceu %, calcula a partir do preço do dia anterior
      // guardado em localStorage (disponível a partir da segunda abertura do app).
      if (pct === 0) {
        const prev = prevCache[item.id]?.prev;
        if (prev && prev.date !== today && Number.isFinite(prev.value) && prev.value !== 0) {
          pct = ((quote.value - prev.value) / prev.value) * 100;
        }
      }

      updateCepeaEntry(prevCache, item.id, today, quote.value);
      output[item.id] = { ...quote, pct };
    }));

    saveCepeaPrevCache(prevCache);
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

  async function fetchTickerLive() {
    const awesomeItems = TICKER_ITEMS.filter((item) => item.source === "awesome");
    const brapiItems = TICKER_ITEMS.filter((item) => item.source === "brapi");
    const bcbItems = TICKER_ITEMS.filter((item) => item.source === "bcb");
    const cepeaItems = TICKER_ITEMS.filter((item) => item.source === "cepea");

    Object.keys(tickerState).forEach((key) => {
      tickerState[key] = { ...tickerState[key], stale: true };
    });

    const [awesomeResult, brapiResult, bcbResult, cepeaResult] = await Promise.allSettled([
      fetchAwesome(awesomeItems),
      fetchBrapi(brapiItems, BRAPI_TOKEN),
      fetchBcb(bcbItems),
      fetchCepea(cepeaItems)
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
    } else {
      console.warn("[ticker] brapi falhou:", brapiResult.reason);
    }

    if (bcbResult.status === "fulfilled") {
      Object.entries(bcbResult.value).forEach(([key, quote]) => {
        tickerState[key] = { ...quote, stale: false };
      });
    } else {
      console.warn("[ticker] BCB falhou:", bcbResult.reason);
    }

    if (cepeaResult.status === "fulfilled") {
      Object.entries(cepeaResult.value).forEach(([key, quote]) => {
        tickerState[key] = { ...quote, stale: false };
      });
    } else {
      console.warn("[ticker] CEPEA falhou:", cepeaResult.reason);
    }

    rebuildTickerItems();
    renderMarketTicker();
  }

  function startMarketTicker() {
    initCepeaPrevCache();
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
