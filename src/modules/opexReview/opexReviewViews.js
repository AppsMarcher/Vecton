(function attachOpexReviewViews(window) {
  "use strict";
  // Templates do módulo: ícone de existência de registro e sinaleira. Tooltips seguem o padrão .cockpit-tip (data-tip).
  const C = window.VECTON_OPEX_REVIEW_CORE;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const money = value => {
    if (!Number.isFinite(value)) return "—";
    const abs = Math.abs(value);
    return `R$ ${abs >= 1000 ? `${(abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  };
  const tipAttr = rows => `data-tip data-tip-rows='${esc(JSON.stringify(rows))}'`;
  const DOC_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false"><path d="M4 1.75h5.2L12.5 5v9.25H4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 1.75V5h3.5M6 8h4M6 10.5h4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

  function presenceLabel(p) {
    const parts = [];
    if (p.analyses) parts.push(`${plural(p.analyses, "análise registrada", "análises registradas")}`);
    if (p.actions) parts.push(`${plural(p.actions, "plano de ação", "planos de ação")}${p.actions ? `, ${p.open} em aberto` : ""}`);
    return parts.join(" · ");
  }
  /** Célula do ícone: vazia sem registro (nunca um ícone cinza simulando registro). */
  function recordCell(p, extra = "") {
    if (!p || (!p.analyses && !p.actions)) return "";
    const label = presenceLabel(p);
    const cancelled = p.analyses > 0 && p.cancelled === p.analyses; // todas as análises do registro canceladas: ícone com borda vermelha
    return `<span class="opex-rec${cancelled ? " opex-rec--cancelled" : ""}" role="img" tabindex="0" aria-label="${esc(label)}" ${tipAttr([{ label: "Registro", value: label }])}${extra}>${DOC_ICON}</span>`;
  }
  /** Soma a presença das linhas (conta × CC) de um grupo, só das contas presentes na seleção atual. */
  function groupPresence(review, group) {
    if (!review) return null;
    const total = { analyses: 0, actions: 0, open: 0, cancelled: 0 };
    for (const row of group.accounts || []) {
      const p = row.ccId ? review.presence.get(`${row.ccId}|${row.code}`) : null;
      if (p) { total.analyses += p.analyses; total.actions += p.actions; total.open += p.open; total.cancelled += p.cancelled || 0; }
    }
    return total;
  }
  const LEVEL_NAME = { red: "Vermelho", yellow: "Amarelo", green: "Verde" };
  const LEVEL_MEANING = { red: "variação relevante", yellow: "variação moderada", green: "variação dentro do limite" };
  /** Célula da sinaleira. Sempre com texto equivalente para leitores de tela e teclado. */
  function signalCell(review, actual, comparison) {
    if (!review) return "";
    if (review.thresholdsError || !review.thresholds) {
      return `<span class="opex-signal opex-signal--na" role="img" tabindex="0" aria-label="Sinaleira indisponível" ${tipAttr([{ label: "Sinaleira", value: "Parâmetros indisponíveis" }])}>—</span>`;
    }
    const result = C.classifyVariance({ actual, comparison }, review.thresholds);
    if (!result.level) return `<span class="opex-signal opex-signal--na" role="img" tabindex="0" aria-label="Sem classificação: base indisponível" ${tipAttr([{ label: "Sinaleira", value: "Base indisponível" }])}>—</span>`;
    const t = review.thresholds;
    const rows = [
      { label: "Sinaleira", value: `${LEVEL_NAME[result.level]} · ${LEVEL_MEANING[result.level]}` },
      { label: "Variação %", value: result.noBase ? "Sem base" : `${result.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` },
      { label: "Sinaliza", value: t.direction === "both" ? "Acima e abaixo da meta" : t.direction === "under" ? "Somente abaixo da meta" : "Somente acima da meta" },
      { label: "Vermelho a partir de", value: `${money(t.redMoney)} ou ${t.redPct.toLocaleString("pt-BR")}%` },
      { label: "Amarelo a partir de", value: `${money(t.yellowMoney)} ou ${t.yellowPct.toLocaleString("pt-BR")}%` }
    ];
    return `<span class="opex-signal opex-signal--${result.level}" role="img" tabindex="0" data-level="${result.level}" aria-label="${esc(`${LEVEL_NAME[result.level]}: ${LEVEL_MEANING[result.level]}`)}" ${tipAttr(rows)}></span>`;
  }

  // ------------------------------------------------------------------ painel "Analisar variação"
  const NATURES = [["recurring", "Recorrente"], ["temporary", "Temporal"], ["one_off", "Pontual"], ["data_issue", "Problema de informação"]];
  const STATES = [["in_analysis", "Em análise"], ["analyzed", "Analisado"], ["cancelled", "Cancelado"]];
  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const PERIOD = { month: "Mês", YTD: "YTD", year: "Ano" };
  const brl = value => Number.isFinite(value) ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
  const tone = value => value == null || Math.abs(value) < 0.005 ? "neutral" : value < 0 ? "positive" : "negative";
  const signed = value => !Number.isFinite(value) ? "—" : `${value > 0 ? "+" : ""}${brl(value)}`;
  const dateBr = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"; };
  const options = (list, selected) => list.map(([value, label]) => `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`).join("");

  /** Classificador padrão das tabelas: <th data-sort> clicável, ↑/↓ e azul (--blue) quando ativo. */
  const sortTh = (label, key, sort) => {
    const active = sort?.key === key;
    return `<th scope="col" data-sort="${esc(key)}" class="cockpit-sortable${active ? " cockpit-sort-active" : ""}" style="cursor:pointer;user-select:none${active ? ";color:var(--blue)" : ""}">${esc(label)}${active ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</th>`;
  };
  const nextSort = (sort, key) => ({ key, dir: sort?.key === key ? -sort.dir : 1 });
  /** Ordena sem alterar a lista original: devolve [{ r, i }] (i = posição original) com texto em pt-BR e números por diferença. */
  function sortItems(items, getters, sort) {
    const rows = items.map((r, i) => ({ r, i }));
    const get = sort && getters[sort.key];
    if (!get) return rows;
    return rows.sort((a, b) => {
      const x = get(a.r), y = get(b.r);
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "pt-BR", { numeric: true });
      return (cmp * sort.dir) || (a.i - b.i);
    });
  }

  /** Botão padrão de voltar do app (círculo com seta), com a legenda no cartão .cockpit-tip. */
  const backButton = (attr, tipValue) => `<button type="button" class="opex-back-icon" ${attr} aria-label="${esc(tipValue)}" ${tipAttr([{ label: "Voltar", value: tipValue }])}><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M13 8l-4 4 4 4M9 12h7"/></svg></button>`;

  function panelShell(m) {
    const crumb = (label, value) => `<div class="opex-crumb"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
    const tabs = [["cause", "Analisar variação"], ["plan", `Plano de ação${m.actionCount ? ` · ${m.actionCount}` : ""}`], ["ledger", "Ver lançamentos"]];
    return `
      <div class="gap-header">
        ${backButton("data-opex-back", "Voltar à tela anterior")}
        <span class="gap-title">${esc(m.account.code)} · ${esc(m.account.name)}</span>
        <span class="gap-badge">${esc(window.VECTON_COCKPIT_FORMAT.periodBadge(m.ctx.periodType, m.ctx.month, m.ctx.year))}</span>
        <button class="gap-close" type="button" aria-label="Fechar" data-opex-close>✕</button>
      </div>
      <div class="opex-crumbs">${crumb("Grupo", m.groupName)}${crumb("Centro de custo", `${m.account.ccNumber} · ${m.account.ccName}`)}${crumb("Competência", `${MONTHS[m.ctx.month - 1]}/${m.ctx.year}`)}${crumb("Comparado com", m.sourceLabel)}</div>
      <div class="opex-summary">
        <div><span>${esc(m.comparisonLabel)}</span><strong>${brl(m.summary.comparison)}</strong></div>
        <div><span>${esc(m.actualLabel)}</span><strong>${brl(m.summary.actual)}</strong></div>
        <div><span>Variação</span><strong class="kpi-trend ${tone(m.summary.variance)}">${signed(m.summary.variance)}</strong></div>
        <div><span>Variação %</span><strong class="kpi-trend ${tone(m.summary.variance)}">${m.summary.variancePct == null ? "Sem base" : `${m.summary.variancePct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</strong></div>
      </div>
      <div class="opex-tabs" role="tablist">${tabs.map(([id, label]) => `<button type="button" role="tab" class="opex-tab" data-opex-tab="${id}" aria-selected="${m.tab === id}">${esc(label)}${id === "cause" && m.dirty ? ' <span class="opex-draft">Rascunho</span>' : ""}</button>`).join("")}</div>
      <div class="opex-banner" data-opex-banner role="alert" hidden></div>
      <div class="opex-scroll"><div class="opex-body" role="tabpanel" data-opex-body></div>
      <div class="opex-attach-host" data-opex-attachments></div></div>`;
  }

  function causeTab(m) {
    const d = m.draft, ro = m.canWrite ? "" : " disabled";
    const changed = m.dataChanged ? '<div class="opex-banner opex-banner--warn" role="status">A base mudou desde esta análise. Reavalie a causa e salve para registrar uma nova versão.</div>' : "";
    return `${changed}
      <div class="opex-form opex-form--cause">
        <label class="opex-field"><span>Natureza</span><select data-f="nature"${ro}><option value="">Selecione</option>${options(NATURES, d.nature)}</select></label>
        <label class="opex-field"><span>Situação</span><select data-f="analysisState"${ro}>${options(STATES, d.analysisState)}</select></label>
        <label class="opex-check"><input type="checkbox" data-f="monitor"${d.monitor ? " checked" : ""}${ro}><span>Monitorar</span></label>
        <label class="opex-field opex-field--wide"><span>Causa da variação</span><textarea data-f="cause" rows="4" maxlength="8000"${ro}>${esc(d.cause)}</textarea></label>
        <label class="opex-field opex-field--wide"><span>Efeito nos próximos meses</span><textarea data-f="futureEffect" rows="3" maxlength="8000"${ro}>${esc(d.futureEffect)}</textarea></label>
        <label class="opex-field opex-field--narrow"><span>Impacto financeiro esperado (R$)</span><input type="text" inputmode="decimal" data-f="impact" value="${esc(d.impact)}"${ro}></label>
      </div>
      <div class="opex-foot"><span class="opex-meta">${m.version ? `Versão ${m.version}` : "Sem análise registrada"}</span>${m.canWrite ? `<button type="button" class="ghost-button opex-primary" data-opex-save${m.saving ? " disabled" : ""}>${m.saving ? "Salvando…" : "Salvar análise"}</button>` : ""}</div>`;
  }

  function ledgerTab(m) {
    const l = m.ledger;
    if (!l || l.status === "loading") return '<div class="opex-empty" role="status">Carregando lançamentos…</div>';
    if (l.status === "error") return '<div class="opex-empty" role="alert">Não foi possível carregar os lançamentos. <button type="button" class="ghost-button" data-opex-ledger-retry>Tentar novamente</button></div>';
    const sort = l.sort, active = key => sort.key === key;
    const th = (key, label, right) => `<th scope="col" data-sort="${key}" class="cockpit-sortable${active(key) ? " cockpit-sort-active" : ""}"${right ? ' style="text-align:right"' : ""}>${esc(label)}${active(key) ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</th>`;
    const rows = l.rows.slice().sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      return sort.dir * (typeof va === "number" ? va - vb : String(va ?? "").localeCompare(String(vb ?? ""), "pt-BR", { numeric: true }));
    });
    const shown = rows.slice(0, 1000);
    const total = l.rows.reduce((sum, r) => sum + r.amount, 0);
    const label = m.ctx.periodType === "year" ? `Realizado até ${MONTHS[m.ctx.month - 1]}/${m.ctx.year}` : "Total realizado";
    if (!l.rows.length) return `<div class="opex-empty" role="status">Sem lançamentos realizados para este contexto.</div><div class="opex-foot"><span class="opex-meta">${esc(label)}: ${brl(0)}</span></div>`;
    return `<div class="gap-table-wrap"><table class="gap-table opex-ledger"><thead><tr>${th("entry_date", "Data")}${th("branch_code", "Filial")}${th("history", "Histórico")}${th("lot_code", "Lote")}${th("amount", "Valor", true)}</tr></thead>
      <tbody>${shown.map(r => `<tr><td class="gap-code">${dateBr(r.entry_date)}</td><td class="gap-code">${esc(r.branch_code || "")}</td><td class="gap-name">${esc(r.history || "")}</td><td class="gap-code">${esc(r.lot_code || "")}</td><td class="gap-val">${brl(r.amount)}</td></tr>`).join("")}</tbody>
      <tfoot><tr class="gap-total-row"><td colspan="4">${esc(label)} · ${l.rows.length.toLocaleString("pt-BR")} lançamentos${l.rows.length > shown.length ? ` (exibindo ${shown.length.toLocaleString("pt-BR")}; o total considera todos)` : ""}</td><td class="gap-val">${brl(total)}</td></tr></tfoot></table></div>`;
  }

  function planTab(m) { return m.planHtml || '<div class="opex-empty" role="status">Nenhuma ação registrada.</div>'; }


  // ------------------------------------------------------------------ Parâmetros da sinaleira
  const fmtMoney = value => Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = value => Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  /** Texto já formatado (pt-BR) vira o valor exibido; texto digitado e ainda inválido é preservado. */
  const paramText = (key, value) => {
    if (value == null || value === "") return "";
    if (typeof value === "string") return value;
    return key.endsWith("Pct") ? fmtPct(value) : fmtMoney(value);
  };
  function paramsPanel(m) {
    const ro = m.thresholds.canEdit ? "" : " disabled";
    const field = (key, label) => `<label class="opex-field"><span>${esc(label)}</span><input type="text" inputmode="decimal" data-p="${key}" value="${esc(paramText(key, m.values[key]))}"${ro}></label>`;
    const check = (key, label) => `<label class="opex-check"><input type="checkbox" data-p="${key}"${m.values[key] ? " checked" : ""}${ro}><span>${esc(label)}</span></label>`;
    const direction = `<div class="opex-field opex-field--wide"><span>Sinalizar</span><div class="opex-checks">${check("above", "Acima da meta (real maior que a meta)")}${check("below", "Abaixo da meta (real menor que a meta)")}</div></div>`;
    return `${m.inline ? "" : '<div class="gap-header"><span class="gap-title">Parâmetros da sinaleira</span><button class="gap-close" type="button" aria-label="Fechar" data-opex-params-close>✕</button></div>'}
      <div class="opex-body"><div class="opex-banner" data-opex-banner role="alert" hidden></div>
      <div class="opex-form opex-form--params">${field("yellowMoney", "Amarelo a partir de (R$)")}${field("yellowPct", "Amarelo a partir de (%)")}${field("redMoney", "Vermelho a partir de (R$)")}${field("redPct", "Vermelho a partir de (%)")}${direction}</div>
      <div class="opex-foot"><span class="opex-meta">${m.thresholds.version ? `Versão ${m.thresholds.version}` : "Valores padrão"}</span>${m.thresholds.canEdit ? `<button type="button" class="ghost-button opex-primary" data-opex-params-save${m.saving ? " disabled" : ""}>${m.saving ? "Salvando…" : "Salvar"}</button>` : ""}</div></div>`;
  }

  const recHeader = '<th scope="col" class="opex-col-rec"><span class="cockpit-sr-only">Registro de análise ou plano de ação</span></th>';
  /** Cabeçalho "Sinal" ordenável (vermelho → amarelo → verde ao ordenar de cima para baixo). */
  const signalHeader = (active, dir) => `<th scope="col" data-sort="signal" class="opex-col-sig cockpit-sortable${active ? " cockpit-sort-active" : ""}" style="cursor:pointer;user-select:none${active ? ";color:var(--blue)" : ""}">Sinal${active ? (dir === 1 ? " ↑" : " ↓") : ""}</th>`;
  /** Valor de ordenação da sinaleira: menor = mais grave (vermelho 0, amarelo 1, verde 2, sem classificação 3). */
  function signalSortValue(review, actual, comparison) {
    if (!review || review.thresholdsError || !review.thresholds) return 3;
    const level = C.classifyVariance({ actual, comparison }, review.thresholds).level;
    return level === "red" ? 0 : level === "yellow" ? 1 : level === "green" ? 2 : 3;
  }
  window.VECTON_OPEX_REVIEW_VIEWS = { sortTh, nextSort, sortItems, backButton, paramsPanel, panelShell, causeTab, ledgerTab, planTab, brl, dateBr, NATURES, STATES, MONTHS, esc, recordCell, groupPresence, signalCell, recHeader, signalHeader, signalSortValue, presenceLabel, tipAttr };
})(window);
