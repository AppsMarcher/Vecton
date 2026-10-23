(function attachVectonCargasAutomatizadasModule(window) {
  // Secao "Carga de Realizado - Automatizadas" (Parametros > Carga de Realizado).
  // Um card por carga automatica (tabela carga_automatica_config, executada pelo robo no servidor):
  // mostra ligada/pausada, horarios, ultima execucao (carga_automatica_log) e o botao "Carregar agora",
  // que grava um pedido em carga_automatica_pedido; o robo atende na proxima rodada da tarefa agendada.
  function createCargasAutomatizadasModule(deps) {
    const {
      escapeHtml,
      resolveOrganizationId,
      fetchSupabaseRowsSafe,
      insertSupabaseRows,
      appConfirm,
      appAlert,
      showToast,
      onCargaConcluida,
      getActiveView,
      isSupabaseConfigured
    } = deps;

    const TZ = "America/Sao_Paulo";
    const POLL_MS = 10000;
    const MIN_REFRESH_MS = 15000;

    // Cargas conhecidas pela tela: rotulo, cor do card e icone. Uma nova carga automatica
    // (ex.: DRE) entra aqui e ganha o card sozinha quando existir em carga_automatica_config.
    const JOBS = {
      dre: {
        label: "DRE",
        color: "blue",
        icon: '<path d="M3 3h18v18H3z"/><path d="M3 9h18M9 21V9"/>'
      },
      vendas: {
        label: "Volumes de Vendas",
        color: "cyan",
        icon: '<path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.4 5.6A1 1 0 0 0 6.6 20H19"/><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>'
      }
    };
    // BP: carga de mes fechado, so sob demanda; o card ganha o seletor do mes a carregar.
    JOBS.bp = {
      label: "Balanço Patrimonial",
      color: "purple",
      onDemandMonth: true,
      icon: '<path d="M12 3v18M5 7h14M5 7l-2 6a3 3 0 0 0 6 0L7 7M19 7l-2 6a3 3 0 0 0 6 0l-2-6"/>'
    };
    const FALLBACK_ICON = '<path d="M12 2v20M5 9l7-7 7 7"/>';

    let root = null;
    let data = { configs: [], logs: [], pedidos: [] };
    let loadedOnce = false;
    let lastFetchAt = 0;
    let pollTimer = null;
    let busyJobs = new Set();
    let knownOpen = new Map();
    const chosenMonth = {};

    const label = (job) => JOBS[job]?.label || job;

    function formatWhen(iso) {
      if (!iso) return "—";
      try {
        return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ });
      } catch { return "—"; }
    }

    function monthLabelNow() {
      try {
        return new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: TZ });
      } catch { return "mês corrente"; }
    }

    const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const monthValue = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
    const monthText = (value) => {
      const [y, m] = String(value).split("-").map(Number);
      return `${MONTH_NAMES[m - 1]}/${y}`;
    };

    const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const MIN_YEAR = 2000;
    let openPicker = null; // job com o seletor de mes aberto
    const pickerYear = {}; // ano exibido no seletor de cada job

    // Mes corrente no fuso de Sao Paulo.
    function nowParts() {
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
      return { y: now.getFullYear(), m: now.getMonth() + 1 };
    }

    // So meses ja encerrados (antes do mes corrente) podem ser carregados.
    function isClosed(y, m) {
      const n = nowParts();
      return y * 12 + m < n.y * 12 + n.m;
    }

    function previousMonthValue() {
      const { y, m } = nowParts();
      return m === 1 ? monthValue(y - 1, 12) : monthValue(y, m - 1);
    }

    function selectedMonth(job) {
      const value = chosenMonth[job];
      if (value) {
        const [y, m] = value.split("-").map(Number);
        if (isClosed(y, m)) return value;
      }
      return previousMonthValue();
    }

    // Seletor de mes no mesmo formato do seletor de periodo do cabecalho (ano com setas + grade de meses).
    function monthPickerHtml(job, busy) {
      const selected = selectedMonth(job);
      const selectedYear = Number(selected.slice(0, 4));
      const viewYear = pickerYear[job] ?? selectedYear;
      const open = openPicker === job;
      const popover = open ? `
        <div class="period-popover auto-carga-popover" role="dialog" aria-label="Mês da carga">
          <div class="period-popover-header">
            <button class="period-nav-button" type="button" data-auto-carga-year="-1" aria-label="Ano anterior" ${viewYear <= MIN_YEAR ? "disabled" : ""}>‹</button>
            <strong>${viewYear}</strong>
            <button class="period-nav-button" type="button" data-auto-carga-year="1" aria-label="Próximo ano" ${viewYear >= nowParts().y ? "disabled" : ""}>›</button>
          </div>
          <p class="period-popover-caption">Selecione o mês fechado a carregar.</p>
          <div class="period-month-grid">${MONTH_ABBR.map((name, i) => {
            const value = monthValue(viewYear, i + 1);
            return `<button type="button" class="period-month-button${value === selected ? " active" : ""}" data-auto-carga-pick="${value}" ${isClosed(viewYear, i + 1) ? "" : "disabled"}>${name}</button>`;
          }).join("")}</div>
        </div>` : "";
      return `<div class="auto-carga-picker"><button type="button" class="auto-carga-picker-trigger" data-auto-carga-picker="${escapeHtml(job)}" aria-haspopup="dialog" aria-expanded="${open}" ${busy ? "disabled" : ""}><b>${escapeHtml(monthText(selected))}</b><span aria-hidden="true">▾</span></button>${popover}</div>`;
    }

    function windowText(cfg) {
      const back = Number(cfg.meses_atras || 0);
      const ahead = Number(cfg.meses_frente || 0);
      if (!back && !ahead) return "mês corrente";
      return `mês corrente${back ? ` + ${back} anterior(es)` : ""}${ahead ? ` + ${ahead} seguinte(s)` : ""}`;
    }

    function latestBy(rows, job) {
      return rows.find((r) => r.job === job) || null;
    }

    const STATUS_TEXT = { ok: "Aplicada", erro: "Erro", bloqueada: "Bloqueada", sem_mudanca: "Sem mudanças", simulacao: "Simulação" };
    const PEDIDO_TEXT = { pendente: "aguardando o robô", executando: "robô executando", concluido: "concluído", erro: "com erro" };

    // Linha padrao do card: rotulo em coluna fixa + valor, igual nas tres cargas.
    const row = (k, v) => `<div class="auto-carga-row"><span class="auto-carga-k">${k}</span><span class="auto-carga-v">${v}</span></div>`;

    function cardHtml(cfg) {
      const meta = JOBS[cfg.job] || {};
      const log = latestBy(data.logs, cfg.job);
      const pedido = latestBy(data.pedidos, cfg.job);
      const open = pedido && (pedido.status === "pendente" || pedido.status === "executando");
      const busy = open || busyJobs.has(cfg.job);
      const onDemandMonth = !!meta.onDemandMonth;
      const horarios = (cfg.horarios || []).join(" · ") || (onDemandMonth ? "Sob demanda" : "—");

      let last = '<span class="auto-carga-muted">Nenhuma execução registrada.</span>';
      if (log) {
        const cls = log.status === "ok" ? "ok" : (log.status === "bloqueada" ? "warn" : "err");
        const linhas = log.total_rows != null ? ` · ${Number(log.total_rows).toLocaleString("pt-BR")} linhas` : "";
        last = `<b>${escapeHtml(formatWhen(log.started_at))}</b> · <span class="auto-carga-status auto-carga-status--${cls}">${escapeHtml(STATUS_TEXT[log.status] || log.status)}</span>${escapeHtml(linhas)}`;
        if (log.status !== "ok" && log.mensagem) last += `<br><span class="auto-carga-muted">${escapeHtml(String(log.mensagem).slice(0, 160))}</span>`;
      }

      let pedidoHtml = '<span class="auto-carga-muted">Nenhum pedido.</span>';
      if (pedido) {
        const cls = pedido.status === "erro" ? "err" : (pedido.status === "concluido" ? "ok" : "warn");
        const ref = pedido.reference_year ? ` · ref. ${escapeHtml(monthValue(pedido.reference_year, pedido.reference_month))}` : "";
        pedidoHtml = `<b>${escapeHtml(formatWhen(pedido.requested_at))}</b>${ref} · <span class="auto-carga-status auto-carga-status--${cls}">${escapeHtml(PEDIDO_TEXT[pedido.status] || pedido.status)}</span>`
          + (!open && pedido.resultado ? `<br><span class="auto-carga-muted">${escapeHtml(String(pedido.resultado).slice(0, 200))}</span>` : "")
          + (open ? '<br><span class="auto-carga-muted">O robô atende o pedido em até 5 minutos.</span>' : "");
      }

      const monthHtml = onDemandMonth
        ? monthPickerHtml(cfg.job, busy)
        : `<b>${escapeHtml(windowText(cfg).replace(/^./, (c) => c.toUpperCase()))}</b>`;

      return `
        <div class="load-catalog-card load-catalog-card--${meta.color || "blue"} load-catalog-card--static" data-auto-carga="${escapeHtml(cfg.job)}">
          <div class="auto-carga-head">
            <span class="lcc-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${meta.icon || FALLBACK_ICON}</svg></span>
            <strong>${escapeHtml(label(cfg.job))}</strong>
            <span class="auto-carga-badge ${cfg.enabled ? "is-on" : "is-off"}">${cfg.enabled ? "Ligada" : "Pausada"}</span>
          </div>
          <div class="auto-carga-meta">
            ${row("Horários", `<b>${escapeHtml(horarios)}</b>`)}
            ${row("Mês da carga", monthHtml)}
            ${row("Última carga", last)}
            ${row("Último pedido", pedidoHtml)}
          </div>
          <div class="auto-carga-actions">
            <button type="button" class="primary-button auto-carga-run" data-auto-carga-run="${escapeHtml(cfg.job)}" ${busy ? "disabled" : ""}>${busy ? "Pedido em andamento…" : "Carregar agora"}</button>
          </div>
        </div>`;
    }

    // Ordem dos cards: DRE | Balanço Patrimonial | Volumes de Vendas; cargas novas vão para o fim.
    const CARD_ORDER = ["dre", "bp", "vendas"];
    const orderOf = (job) => { const i = CARD_ORDER.indexOf(job); return i < 0 ? CARD_ORDER.length : i; };

    function render() {
      if (!root) return;
      if (!loadedOnce) {
        root.innerHTML = '<div class="actuals-empty">Carregando…</div>';
        return;
      }
      if (!data.configs.length) {
        root.innerHTML = '<div class="actuals-empty">Nenhuma carga automática configurada.</div>';
        return;
      }
      root.innerHTML = [...data.configs].sort((x, y) => orderOf(x.job) - orderOf(y.job)).map(cardHtml).join("");
    }

    async function fetchData() {
      const org = await resolveOrganizationId();
      const base = `organization_id=eq.${org}`;
      const [configs, logs, pedidos] = await Promise.all([
        fetchSupabaseRowsSafe("carga_automatica_config", `${base}&select=job,descricao,enabled,horarios,meses_atras,meses_frente&order=job.asc`),
        fetchSupabaseRowsSafe("carga_automatica_log", `${base}&select=job,status,started_at,total_rows,rows_fat,rows_cart,mensagem&order=started_at.desc&limit=40`),
        fetchSupabaseRowsSafe("carga_automatica_pedido", `${base}&select=id,job,status,requested_at,started_at,finished_at,resultado,reference_year,reference_month&order=requested_at.desc&limit=30`)
      ]);
      return { configs: configs || [], logs: logs || [], pedidos: pedidos || [] };
    }

    function announceFinished(prevOpen) {
      // Avisa (toast) quando um pedido que estava em aberto termina.
      prevOpen.forEach((_, id) => {
        const p = data.pedidos.find((x) => x.id === id);
        if (!p || p.status === "pendente" || p.status === "executando") return;
        const ok = p.status === "concluido";
        if (ok) { try { onCargaConcluida?.(); } catch (e) { console.error(e); } }
        showToast?.(`${label(p.job)}: ${ok ? "carga concluída" : "carga com problema"}${p.resultado ? ` — ${String(p.resultado).slice(0, 140)}` : ""}`, ok ? "success" : "error");
      });
    }

    function openPedidos() {
      return new Map(data.pedidos.filter((p) => p.status === "pendente" || p.status === "executando").map((p) => [p.id, p]));
    }

    function schedulePoll() {
      clearTimeout(pollTimer);
      pollTimer = null;
      if (!root || !root.isConnected || !openPedidos().size) return;
      pollTimer = setTimeout(() => refresh({ force: true }), POLL_MS);
    }

    async function refresh({ force = false } = {}) {
      root = root && root.isConnected ? root : document.querySelector("#auto-cargas-root");
      if (!root || !isSupabaseConfigured?.()) return;
      if (getActiveView && getActiveView() !== "actualsLoad") { clearTimeout(pollTimer); return; }
      if (!force && Date.now() - lastFetchAt < MIN_REFRESH_MS) return;
      lastFetchAt = Date.now();
      try {
        const before = knownOpen;
        data = await fetchData();
        loadedOnce = true;
        knownOpen = openPedidos();
        announceFinished(before);
      } catch (err) {
        console.error(err);
        if (!loadedOnce) {
          root.innerHTML = '<div class="actuals-empty">Não foi possível carregar as cargas automáticas.</div>';
          return;
        }
      }
      render();
      schedulePoll();
    }

    function friendlyError(err) {
      const msg = String(err?.message || "");
      if (msg.includes("duplicate key") || msg.includes("uq_carga_automatica_pedido_aberto")) return "Já existe um pedido em andamento para esta carga.";
      if (msg.includes("row-level security") || msg.includes("42501")) return "Seu perfil não tem permissão para solicitar cargas automáticas.";
      if (msg.includes("carga_automatica_pedido") && msg.includes("does not exist")) return "A tabela de pedidos ainda não existe no banco (migration 263).";
      if (msg.includes("reference_year") || msg.includes("reference_month")) return "O banco ainda não tem o mês do pedido (migration 308).";
      return "Não foi possível registrar o pedido. Tente novamente.";
    }

    async function request(job) {
      if (busyJobs.has(job)) return;
      const onDemandMonth = !!JOBS[job]?.onDemandMonth;
      const month = onDemandMonth ? selectedMonth(job) : null;
      const ok = await appConfirm(
        onDemandMonth
          ? `Carregar agora: ${label(job)} de ${monthText(month)}?\n\nIsto substitui o fechamento de ${monthText(month)} (saldo acumulado até o último dia do mês) com os dados atuais do Protheus. O robô atende o pedido em até 5 minutos.`
          : `Carregar agora: ${label(job)}?\n\nIsto apaga e regrava ${monthLabelNow()} com os dados atuais do Protheus e envia os avisos de carga aplicada. O robô atende o pedido em até 5 minutos.`,
        "warn"
      );
      if (!ok) return;
      busyJobs.add(job);
      render();
      try {
        const org = await resolveOrganizationId();
        await insertSupabaseRows("carga_automatica_pedido", [{ organization_id: org, job, status: "pendente", ...(month ? { reference_year: Number(month.slice(0, 4)), reference_month: Number(month.slice(5)) } : {}) }]);
        showToast?.(`Pedido enviado: ${label(job)}. O robô atende em até 5 minutos.`, "success");
      } catch (err) {
        console.error(err);
        await appAlert?.(friendlyError(err));
      } finally {
        busyJobs.delete(job);
      }
      await refresh({ force: true });
    }

    function bind(rootEl) {
      root = rootEl;
      if (!root || root.dataset.bound === "1") return;
      root.dataset.bound = "1";
      const closePicker = () => {
        if (!openPicker) return;
        openPicker = null;
        render();
      };
      if (typeof document !== "undefined") {
        document.addEventListener("pointerdown", (event) => { if (openPicker && !event.target.closest(".auto-carga-picker")) closePicker(); });
        document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePicker(); });
      }
      root.addEventListener("click", (event) => {
        const trigger = event.target.closest("[data-auto-carga-picker]");
        if (trigger && !trigger.disabled) {
          const job = trigger.dataset.autoCargaPicker;
          if (openPicker === job) openPicker = null;
          else { openPicker = job; pickerYear[job] = Number(selectedMonth(job).slice(0, 4)); }
          render();
          return;
        }
        const nav = event.target.closest("[data-auto-carga-year]");
        if (nav && !nav.disabled && openPicker) {
          pickerYear[openPicker] = Math.min(nowParts().y, Math.max(MIN_YEAR, (pickerYear[openPicker] ?? nowParts().y) + Number(nav.dataset.autoCargaYear)));
          render();
          return;
        }
        const pick = event.target.closest("[data-auto-carga-pick]");
        if (pick && !pick.disabled && openPicker) {
          chosenMonth[openPicker] = pick.dataset.autoCargaPick;
          openPicker = null;
          render();
          return;
        }
        const btn = event.target.closest("[data-auto-carga-run]");
        if (btn && !btn.disabled) request(btn.dataset.autoCargaRun);
      });
    }

    return { bind, refresh, render, _setData: (d) => { data = d; loadedOnce = true; render(); } };
  }

  window.VECTON_CARGAS_AUTOMATIZADAS_MODULE = { createCargasAutomatizadasModule };
})(window);
