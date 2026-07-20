(function attachVectonDashboardModule(window) {
  let _dreAccum = false;
  let _lastDreParams = null;

  function createDashboardModule(deps) {
    const {
      MONTH_LABELS,
      escapeHtml,
      formatMonthLabel,
      buildDreGerRealReport,
      reportsLedgerCache,
      reportsBudgetCache,
      getDashCompare,
      state,
      getActiveView,
      setActiveView,
      setSelectedReportId,
      renderNavigation,
      ensureReportsDataForYear,
      renderReportsView,
      renderDashComboChart,
      renderDashAlerts,
      renderDashOpexCards
    } = deps;

    function renderDashboard() {
      if (getActiveView() !== "dashboard") return;

      const year = Number(state.currentPeriod?.year || 2026);
      const monthIdx = Number(state.currentPeriod?.month || 1) - 1;
      const prevMonthIdx = monthIdx === 0 ? null : monthIdx - 1;

      const realRows = reportsLedgerCache.get(year)?.rows || [];
      // Comparativo = cenário favorito da org (Budget quando não há favorito).
      const cmp = getDashCompare ? getDashCompare(year) : { label: "Budget", rows: reportsBudgetCache.get(year)?.rows || [] };
      const budgetRows = cmp.rows;
      const compareLabel = cmp.label || "Budget";
      const hasReal = realRows.length > 0;
      const hasBudget = budgetRows.length > 0;

      const realReport = buildDreGerRealReport(year, realRows);
      const budgetReport = buildDreGerRealReport(year, budgetRows);

      const getLine = (report, id) => report.lines.find((line) => line.id === id);

      const rl = getLine(realReport, "receitaLiquida");
      const eb = getLine(realReport, "ebitda");
      const ll = getLine(realReport, "resultadoExerc");
      const mat = getLine(realReport, "materiais");

      const mReal = (line) => (line ? (line.months[monthIdx] ?? 0) : 0);
      const mBudg = (line) => (line ? (line.months[monthIdx] ?? 0) : 0);
      const mPrev = (line) => (line && prevMonthIdx !== null ? (line.months[prevMonthIdx] ?? 0) : null);

      const setKpi = (numId, curId, trendId, value, prevValue, isPct = false) => {
        const numEl = document.querySelector(`#${numId}`);
        const curEl = document.querySelector(`#${curId}`);
        const trendEl = document.querySelector(`#${trendId}`);
        if (!numEl) return;

        if (!hasReal) {
          numEl.textContent = "\u2014";
          if (curEl) curEl.style.display = "none";
          if (trendEl) {
            trendEl.textContent = "Sem dados";
            trendEl.className = "kpi-trend neutral";
          }
          return;
        }

        if (curEl) curEl.style.display = "";
        numEl.textContent = isPct
          ? `${(value * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
          : value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

        if (trendEl && prevValue !== null) {
          const delta = prevValue !== 0 ? (value - prevValue) / Math.abs(prevValue) : 0;
          const sign = delta >= 0 ? "+" : "";
          const pctStr = (delta * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
          trendEl.textContent = `${sign}${pctStr}% vs mes anterior`;
          trendEl.className = `kpi-trend ${delta > 0.001 ? "positive" : delta < -0.001 ? "negative" : "neutral"}`;
        } else if (trendEl) {
          trendEl.textContent = "Primeiro mes do ano";
          trendEl.className = "kpi-trend neutral";
        }
      };

      const rlVal = mReal(rl);
      const ebVal = mReal(eb);
      const llVal = mReal(ll);
      const rlPrev = mPrev(rl);
      const ebPrev = mPrev(eb);
      const llPrev = mPrev(ll);
      const mEbitdaPct = rlVal !== 0 ? ebVal / rlVal : 0;
      const mEbitdaPctPrev = rlPrev !== null && rlPrev !== 0 ? mPrev(eb) / rlPrev : null;

      setKpi("kpi-rl-number", "kpi-rl-currency", "kpi-rl-trend", rlVal, rlPrev);
      setKpi("kpi-ebitda-number", "kpi-ebitda-currency", "kpi-ebitda-trend", ebVal, ebPrev);
      setKpi("kpi-ll-number", "kpi-ll-currency", "kpi-ll-trend", llVal, llPrev);

      const matEl = document.querySelector("#kpi-mat-number");
      const matTrEl = document.querySelector("#kpi-mat-trend");
      if (matEl) {
        if (!hasReal || !rlVal) {
          matEl.textContent = "\u2014";
          if (matTrEl) {
            matTrEl.textContent = "Sem dados";
            matTrEl.className = "kpi-trend neutral";
          }
        } else {
          const matVal = mReal(mat);
          const matPctVal = -(matVal / rlVal);
          const matPrev = mPrev(mat);
          const rlPrevVal = mPrev(rl);
          const matPctPrev = matPrev !== null && rlPrevVal ? -(matPrev / rlPrevVal) : null;
          matEl.textContent = `${(matPctVal * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
          if (matTrEl && matPctPrev !== null) {
            const pp = (matPctVal - matPctPrev) * 100;
            const sign = pp >= 0 ? "+" : "";
            matTrEl.textContent = `${sign}${pp.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p. vs mes anterior`;
            matTrEl.className = `kpi-trend ${pp > 0.05 ? "negative" : pp < -0.05 ? "positive" : "neutral"}`;
          } else if (matTrEl) {
            matTrEl.textContent = "Primeiro mes do ano";
            matTrEl.className = "kpi-trend neutral";
          }
        }
      }

      const mEbEl = document.querySelector("#kpi-mebitda-number");
      const mEbTr = document.querySelector("#kpi-mebitda-trend");
      if (mEbEl) {
        if (!hasReal) {
          mEbEl.textContent = "\u2014";
          if (mEbTr) {
            mEbTr.textContent = "Sem dados";
            mEbTr.className = "kpi-trend neutral";
          }
        } else {
          mEbEl.textContent = `${(mEbitdaPct * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
          if (mEbTr && mEbitdaPctPrev !== null) {
            const pp = (mEbitdaPct - mEbitdaPctPrev) * 100;
            const sign = pp >= 0 ? "+" : "";
            mEbTr.textContent = `${sign}${pp.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p. vs mes anterior`;
            mEbTr.className = `kpi-trend ${pp > 0.05 ? "positive" : pp < -0.05 ? "negative" : "neutral"}`;
          } else if (mEbTr) {
            mEbTr.textContent = "Primeiro mes do ano";
            mEbTr.className = "kpi-trend neutral";
          }
        }
      }

      const sparkColors = {
        "kpi-rl-spark": { stroke: "#4f7cff", fill: "rgba(79,124,255,0.18)" },
        "kpi-ebitda-spark": { stroke: "#22c55e", fill: "rgba(34,197,94,0.15)" },
        "kpi-mebitda-spark": { stroke: "#8b5cf6", fill: "rgba(139,92,246,0.15)" },
        "kpi-ll-spark": { stroke: "#f59e0b", fill: "rgba(245,158,11,0.15)" },
        "kpi-mat-spark": { stroke: "#14b8a6", fill: "rgba(20,184,166,0.15)" }
      };

      const renderSparkline = (containerId, lineData) => {
        const el = document.querySelector(`#${containerId}`);
        if (!el) return;
        el.innerHTML = "";
        if (!lineData || !hasReal) return;
        const vals = lineData.months.slice(0, monthIdx + 1);
        if (vals.length < 2) return;

        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const range = max - min || 1;
        const w = 100;
        const h = 28;
        const pad = 1;
        const baseColors = sparkColors[containerId] || { stroke: "#4f7cff", fill: "rgba(79,124,255,0.18)" };

        const trend = vals[vals.length - 1] - vals[0];
        const isNeg = trend < 0;
        const invertTrend = containerId === "kpi-mat-spark";
        const isBad = invertTrend ? !isNeg : isNeg;
        const dynamicFill = isBad ? "rgba(239,68,68,0.14)" : baseColors.fill;
        const dynamicStroke = isBad ? "#ef4444" : baseColors.stroke;

        const points = vals.map((value, index) => {
          const x = pad + (index / (vals.length - 1)) * (w - pad * 2);
          const y = h - pad - ((value - min) / range) * (h - pad * 2 - 2);
          return { x, y, value };
        });

        let pathD = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
        for (let index = 1; index < points.length; index += 1) {
          const prev = points[index - 1];
          const current = points[index];
          const cpX = ((prev.x + current.x) / 2).toFixed(2);
          pathD += ` C ${cpX} ${prev.y.toFixed(2)}, ${cpX} ${current.y.toFixed(2)}, ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
        }

        const areaD = `${pathD} L${points[points.length - 1].x.toFixed(2)},${h} L${points[0].x.toFixed(2)},${h} Z`;
        const svgId = `spark-svg-${containerId}`;
        const dotGroups = points.map((point, index) => {
          const label = MONTH_LABELS[index];
          const value = point.value;
          const formatted = Math.abs(value) >= 1e6
            ? `R$ ${(value / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`
            : Math.abs(value) >= 1e3
              ? `R$ ${(value / 1e3).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k`
              : `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
          return `<circle class="spark-dot" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="2.5"
            fill="${dynamicStroke}" opacity="0" stroke="none"
            data-label="${escapeHtml(label)}" data-val="${escapeHtml(formatted)}"/>`;
        }).join("");

        el.innerHTML = `<svg id="${svgId}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"
          style="width:100%;height:100%;overflow:visible">
          <path d="${areaD}" fill="${dynamicFill}"/>
          <path d="${pathD}" fill="none" stroke="${dynamicStroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          ${dotGroups}
        </svg>`;

        const tip = document.createElement("div");
        tip.style.cssText = "position:fixed;z-index:9999;display:none;pointer-events:none;" +
          "background:#13161c;border:0.5px solid #2a2d34;border-radius:5px;padding:5px 9px;line-height:1.5;white-space:nowrap";
        document.body.appendChild(tip);

        const svg = el.querySelector(`#${svgId}`);
        const allDots = [...svg.querySelectorAll(".spark-dot")];
        allDots.forEach((dot) => {
          dot.addEventListener("mouseenter", () => {
            tip.innerHTML = `<span style="display:flex;justify-content:space-between;gap:14px">` +
              `<span style="font-size:0.62rem;color:#a1a7b3">${escapeHtml(dot.dataset.label)}</span>` +
              `<span style="font-size:0.72rem;font-weight:700;color:${dynamicStroke}">${escapeHtml(dot.dataset.val)}</span>` +
              `</span>`;
            tip.style.display = "block";
            dot.setAttribute("opacity", "1");
            const rect = dot.getBoundingClientRect();
            tip.style.left = `${rect.left + rect.width / 2 - tip.offsetWidth / 2}px`;
            tip.style.top = `${rect.top - tip.offsetHeight - 8}px`;
          });
          dot.addEventListener("mousemove", () => {
            const rect = dot.getBoundingClientRect();
            tip.style.left = `${rect.left + rect.width / 2 - tip.offsetWidth / 2}px`;
            tip.style.top = `${rect.top - tip.offsetHeight - 8}px`;
          });
          dot.addEventListener("mouseleave", () => {
            dot.setAttribute("opacity", "0");
            tip.style.display = "none";
          });
        });
      };

      renderSparkline("kpi-rl-spark", rl);
      renderSparkline("kpi-ebitda-spark", eb);
      renderSparkline("kpi-mebitda-spark", getLine(realReport, "ebitda"));
      renderSparkline("kpi-ll-spark", ll);
      renderSparkline("kpi-mat-spark", mat);

      _lastDreParams = { realReport, budgetReport, monthIdx, hasReal, hasBudget, compareLabel };

      const dreTitle = document.querySelector("#dash-dre-title");
      if (dreTitle) dreTitle.textContent = "Demonstrativo de Resultados";

      // toggle M\u00eas / Acumulado
      let toggleEl = document.querySelector("#dash-dre-mode-toggle");
      if (!toggleEl) {
        toggleEl = document.createElement("div");
        toggleEl.id = "dash-dre-mode-toggle";
        toggleEl.className = "dre-mode-toggle";
        toggleEl.innerHTML = `<button class="dre-mode-btn active" data-mode="mes">M\u00eas</button><button class="dre-mode-btn" data-mode="acumulado">Acumulado</button>`;
        const dreSubtitleEl = document.querySelector("#dash-dre-subtitle");
        if (dreSubtitleEl) dreSubtitleEl.replaceWith(toggleEl);
        toggleEl.addEventListener("click", (e) => {
          const btn = e.target.closest(".dre-mode-btn");
          if (!btn) return;
          _dreAccum = btn.dataset.mode === "acumulado";
          toggleEl.querySelectorAll(".dre-mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === (_dreAccum ? "acumulado" : "mes")));
          if (_lastDreParams) {
            const { realReport: rr, budgetReport: br, monthIdx: mi, hasReal: hr, hasBudget: hb, compareLabel: cl } = _lastDreParams;
            renderDreBulletChart(rr, br, mi, hr, hb, _dreAccum, cl);
            renderDreGauges(rr, br, mi, hr, hb, _dreAccum, cl);
          }
        });
      } else {
        toggleEl.querySelectorAll(".dre-mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === (_dreAccum ? "acumulado" : "mes")));
      }

      renderDreBulletChart(realReport, budgetReport, monthIdx, hasReal, hasBudget, _dreAccum, compareLabel);
      renderDreGauges(realReport, budgetReport, monthIdx, hasReal, hasBudget, _dreAccum, compareLabel);

      const verDreBtn = document.querySelector("#dash-ver-dre");
      if (verDreBtn && !verDreBtn.dataset.bound) {
        verDreBtn.dataset.bound = "true";
        verDreBtn.addEventListener("click", () => {
          setSelectedReportId("dreGerReal");
          setActiveView("reports");
          renderNavigation();
          void ensureReportsDataForYear(Number(state.currentPeriod?.year || 2026));
          renderReportsView();
        });
      }

      const rlMonths = rl ? rl.months : Array(12).fill(0);
      const matMonths = mat ? mat.months : Array(12).fill(0);
      const matMonthsDisplay = matMonths.map((value) => -value);
      const matPctMonths = rlMonths.map((value, index) => (value !== 0 ? -matMonths[index] / value : 0));

      const ebMonths = eb ? eb.months : Array(12).fill(0);
      const mEbitdaMonths = rlMonths.map((value, index) => (value !== 0 ? ebMonths[index] / value : 0));

      const matBudgetLine = getLine(budgetReport, "materiais");
      const matBudgetMonthsDisplay = (matBudgetLine ? matBudgetLine.months : Array(12).fill(0)).map((value) => -value);
      const ebBudgetLine = getLine(budgetReport, "ebitda");
      const ebBudgetMonths = ebBudgetLine ? ebBudgetLine.months : Array(12).fill(0);

      renderDashComboChart("dash-mat-chart", matMonthsDisplay, matPctMonths, monthIdx, hasReal, "#14b8a6", "#5eead4", "% MP", hasBudget ? matBudgetMonthsDisplay : null, compareLabel);
      renderDashComboChart("dash-ebitda-chart", ebMonths, mEbitdaMonths, monthIdx, hasReal, "#4f7cff", "#93c5fd", "Mg EBITDA", hasBudget ? ebBudgetMonths : null, compareLabel);

      const injectComboLegend = (cardId, color) => {
        const header = document.querySelector(`#${cardId} .panel-header`);
        if (!header) return;
        let legend = header.querySelector(".dash-combo-legend");
        if (!hasBudget) {
          legend?.remove();
          return;
        }
        if (!legend) {
          legend = document.createElement("div");
          legend.className = "dash-combo-legend";
          (header.firstElementChild || header).appendChild(legend);
        }
        legend.innerHTML = `
          <span class="dash-combo-legend-item" style="color:${color}"><span class="dash-combo-legend-dot" style="background:${color}"></span>Real</span>
          <span class="dash-combo-legend-item" style="color:${color}"><span class="dash-combo-legend-dot dash-combo-legend-dot--ghost" style="border-color:${color}"></span>${escapeHtml(compareLabel)}</span>`;
      };
      injectComboLegend("dash-mat-card", "#14b8a6");
      injectComboLegend("dash-ebitda-card", "#4f7cff");

      if (hasReal) {
        const fmtAccum = (value) => {
          const abs = Math.abs(value);
          if (abs >= 1e6) return `R$ ${(value / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
          if (abs >= 1e3) return `R$ ${(value / 1e3).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k`;
          return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        };
        const fmtPct = (value) => `${(value * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

        const matAccum = matMonthsDisplay.slice(0, monthIdx + 1).reduce((sum, value) => sum + value, 0);
        const rlAccum = rlMonths.slice(0, monthIdx + 1).reduce((sum, value) => sum + value, 0);
        const matPctAccum = rlAccum !== 0 ? matAccum / rlAccum : 0;

        const ebAccum = ebMonths.slice(0, monthIdx + 1).reduce((sum, value) => sum + value, 0);
        const ebPctAccum = rlAccum !== 0 ? ebAccum / rlAccum : 0;

        const injectBadge = (cardId, valueStr, pctStr) => {
          const header = document.querySelector(`#${cardId} .panel-header`);
          if (!header) return;
          let badge = header.querySelector(".dash-accum-badge");
          if (!badge) {
            badge = document.createElement("div");
            badge.className = "dash-accum-badge ghost-button";
            header.appendChild(badge);
          }
          badge.innerHTML = `<span class="dash-accum-val">${escapeHtml(valueStr)}</span><span class="dash-accum-sep">&#183;</span><span class="dash-accum-pct">${escapeHtml(pctStr)}</span>`;
        };

        injectBadge("dash-mat-card", fmtAccum(matAccum), fmtPct(matPctAccum));
        injectBadge("dash-ebitda-card", fmtAccum(ebAccum), fmtPct(ebPctAccum));
      } else {
        ["dash-mat-card", "dash-ebitda-card"].forEach((id) => {
          document.querySelector(`#${id} .dash-accum-badge`)?.remove();
        });
      }

      renderDashOpexCards(year, monthIdx, realRows, budgetRows);
      renderDashAlerts(realReport, budgetReport, monthIdx, hasReal, hasBudget, compareLabel);
    }

    function renderDreBulletChart(realReport, budgetReport, monthIdx, hasReal, hasBudget, accum = false, compareLabel = "Budget") {
      const container = document.querySelector("#dash-dre-bullet");
      if (!container) return;

      if (!hasReal) {
        container.innerHTML = `<div class="dash-bullet-empty">Nenhum dado de realizado disponível.</div>`;
        return;
      }

      const getLine = (report, id) => report?.lines?.find((l) => l.id === id);
      const mVal = (report, id) => {
        const line = getLine(report, id);
        if (!line) return 0;
        if (accum) return line.months.slice(0, monthIdx + 1).reduce((s, v) => s + v, 0);
        return line.months[monthIdx] ?? 0;
      };

      const ggfReal   = mVal(realReport,   "custosPessoal") + mVal(realReport,   "demaisGGF");
      const ggfBudget = mVal(budgetReport,  "custosPessoal") + mVal(budgetReport,  "demaisGGF");

      const LINES = [
        { id: "receitaLiquida",  label: "Receita Líquida",      isCost: false, isSubtotal: true,  isResult: false, real: mVal(realReport, "receitaLiquida"),  budget: mVal(budgetReport, "receitaLiquida") },
        { id: "materiais",       label: "Matéria-prima",         isCost: true,  isSubtotal: false, isResult: false, real: mVal(realReport, "materiais"),       budget: mVal(budgetReport, "materiais") },
        { id: "ggf",             label: "GGF",                   isCost: true,  isSubtotal: false, isResult: false, real: ggfReal,                             budget: ggfBudget },
        { id: "despComerciais",  label: "Desp. Comerciais",      isCost: true,  isSubtotal: false, isResult: false, real: mVal(realReport, "despComerciais"),  budget: mVal(budgetReport, "despComerciais") },
        { id: "despAdmin",       label: "Desp. Administrativas", isCost: true,  isSubtotal: false, isResult: false, real: mVal(realReport, "despAdmin"),       budget: mVal(budgetReport, "despAdmin") },
        { id: "ebitda",          label: "EBITDA",                isCost: false, isSubtotal: true,  isResult: false, real: mVal(realReport, "ebitda"),          budget: mVal(budgetReport, "ebitda") },
        { id: "resultadoFin",    label: "Resultado Financeiro",  isCost: true,  isSubtotal: false, isResult: false, real: mVal(realReport, "resultadoFin"),    budget: mVal(budgetReport, "resultadoFin") },
        { id: "resultadoExerc",  label: "Lucro Líquido",         isCost: false, isSubtotal: true,  isResult: true,  real: mVal(realReport, "resultadoExerc"),  budget: mVal(budgetReport, "resultadoExerc") },
      ];

      const maxAbs = Math.max(...LINES.map((l) => Math.max(Math.abs(l.budget), Math.abs(l.real))), 1);

      const fmtVal = (v) => {
        const abs = Math.abs(v);
        if (abs >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
        if (abs >= 1e3) return `R$ ${(v / 1e3).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k`;
        return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      };
      const fmtPct = (v) => `${v >= 0 ? "+" : ""}${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

      const rows = LINES.map((line) => {
        const { id, isCost, isSubtotal, isResult, real, budget } = line;
        const label = isResult ? (real >= 0 ? "Lucro Líquido" : "Prejuízo") : line.label;
        const variance = real - budget;
        const isGood = hasBudget ? variance >= 0 : null;
        const varPct = hasBudget && budget !== 0 ? variance / Math.abs(budget) : null;
        const budgetW = Math.min(Math.abs(budget) / maxAbs * 100, 100).toFixed(1);
        const realW   = Math.min(Math.abs(real)   / maxAbs * 100, 100).toFixed(1);
        const barColor = !hasBudget ? "var(--blue)" : isGood ? "#22c55e" : "#ef4444";
        const varClass = !hasBudget ? "" : isGood ? "dash-bullet-var--pos" : "dash-bullet-var--neg";
        const rowMod = [isSubtotal ? "dash-bullet-row--sub" : "", isResult ? "dash-bullet-row--result" : ""].filter(Boolean).join(" ");

        return `<div class="dash-bullet-row ${rowMod}">
          <div class="dash-bullet-label">${escapeHtml(label)}</div>
          <div class="dash-bullet-track">
            ${hasBudget ? `<div class="dash-bullet-budget" style="width:${budgetW}%"></div>` : ""}
            <div class="dash-bullet-real" style="width:${realW}%;background:${barColor}"></div>
            ${hasBudget ? `<div class="dash-bullet-marker" style="left:${budgetW}%"></div>` : ""}
          </div>
          <div class="dash-bullet-vals">
            <span class="dash-bullet-real-val">${escapeHtml(fmtVal(real))}</span>
            ${varPct !== null ? `<span class="dash-bullet-pct ${varClass}">${escapeHtml(fmtPct(varPct))}</span>` : ""}
          </div>
        </div>`;
      }).join("");

      container.innerHTML = `
        ${hasBudget ? `<div class="dash-bullet-legend">
          <span class="dash-bullet-legend-item"><span class="dash-bullet-legend-budget"></span>${escapeHtml(compareLabel)}</span>
          <span class="dash-bullet-legend-item"><span class="dash-bullet-legend-marker"></span>Meta</span>
        </div>` : ""}
        <div class="dash-bullet-list">${rows}</div>
      `;
    }

    function renderDreGauges(realReport, budgetReport, monthIdx, hasReal, hasBudget, accum = false, compareLabel = "Budget") {
      const container = document.querySelector("#dash-dre-gauges");
      if (!container) return;

      if (!hasReal) { container.innerHTML = ""; return; }

      const getLine = (report, id) => report?.lines?.find((l) => l.id === id);
      const mVal = (report, id) => {
        const line = getLine(report, id);
        if (!line) return 0;
        if (accum) return line.months.slice(0, monthIdx + 1).reduce((s, v) => s + v, 0);
        return line.months[monthIdx] ?? 0;
      };

      const rl   = mVal(realReport, "receitaLiquida");
      const rlB  = mVal(budgetReport, "receitaLiquida");
      const mat  = mVal(realReport, "materiais");
      const matB = mVal(budgetReport, "materiais");
      const eb   = mVal(realReport, "ebitda");
      const ebB  = mVal(budgetReport, "ebitda");
      const ll   = mVal(realReport, "resultadoExerc");
      const llB  = mVal(budgetReport, "resultadoExerc");

      // pct: mat é negativo → inverte sinal para virar positivo
      const matPct  = rl  !== 0 ? -mat  / rl  : 0;
      const matPctB = rlB !== 0 ? -matB / rlB : 0;
      const ebPct   = rl  !== 0 ?  eb   / rl  : 0;
      const ebPctB  = rlB !== 0 ?  ebB  / rlB : 0;
      const llPct   = rl  !== 0 ?  ll   / rl  : 0;
      const llPctB  = rlB !== 0 ?  llB  / rlB : 0;

      const GAUGES = [
        { label: "% Material",   pct: matPct,  pctB: matPctB, color: "#14b8a6", invert: true  },
        { label: "EBITDA%",      pct: ebPct,   pctB: ebPctB,  color: "#8b5cf6", invert: false },
        { label: "Lucro Líq.%",  pct: llPct,   pctB: llPctB,  color: "#f59e0b", invert: false },
      ];

      // semicircle: raio 38, viewBox 96×80 — cy=58 deixa espaço para texto abaixo do arco
      const R = 38;
      const ARC_LEN = Math.PI * R; // ≈ 119.4
      const cx = 48, cy = 52;
      const x1 = cx - R, x2 = cx + R;

      const fmtPct = (v) =>
        `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

      // Rótulo curto da referência no subtexto do gauge (espaço minúsculo no SVG).
      const refShort = compareLabel === "Budget"
        ? "bud"
        : (compareLabel.length > 8 ? `${compareLabel.slice(0, 7)}…` : compareLabel);

      const dashFor = (pct) => {
        const clamped = Math.min(Math.max(pct, 0), 1);
        const fill = clamped * ARC_LEN;
        return `${fill.toFixed(1)} ${(ARC_LEN - fill + 0.1).toFixed(1)}`;
      };

      const gaugeHtml = GAUGES.map(({ label, pct, pctB, color, invert }) => {
        const isGood = hasBudget
          ? (invert ? pct <= pctB : pct >= pctB)
          : null;
        const displayColor = isGood === null ? color : isGood ? color : "#ef4444";
        const pctLabel = fmtPct(pct);
        const pctBLabel = hasBudget ? fmtPct(pctB) : null;

        return `<div class="dash-gauge-item">
          <svg viewBox="0 0 96 78" xmlns="http://www.w3.org/2000/svg" class="dash-gauge-svg" aria-hidden="true">
            <!-- trilha -->
            <path d="M${x1} ${cy} A${R} ${R} 0 0 1 ${x2} ${cy}"
              fill="none" stroke="var(--bg-inset,#1a1a2e)" stroke-width="8" stroke-linecap="round"/>
            <!-- budget (ref) -->
            ${hasBudget ? `<path d="M${x1} ${cy} A${R} ${R} 0 0 1 ${x2} ${cy}"
              fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" opacity="0.2"
              stroke-dasharray="${dashFor(pctB)}"/>` : ""}
            <!-- realizado -->
            <path d="M${x1} ${cy} A${R} ${R} 0 0 1 ${x2} ${cy}"
              fill="none" stroke="${displayColor}" stroke-width="8" stroke-linecap="round"
              stroke-dasharray="${dashFor(pct)}"/>
            <!-- valor -->
            <text x="${cx}" y="${cy + 2}" text-anchor="middle"
              font-size="11" font-weight="700" fill="${displayColor}" font-family="inherit">${escapeHtml(pctLabel)}</text>
            ${pctBLabel ? `<text x="${cx}" y="${cy + 16}" text-anchor="middle"
              font-size="7" fill="var(--text-faint)" font-family="inherit">${escapeHtml(refShort)} ${escapeHtml(pctBLabel)}</text>` : ""}
          </svg>
          <span class="dash-gauge-label">${escapeHtml(label)}</span>
        </div>`;
      }).join("");

      container.innerHTML = `<div class="dash-gauge-row">${gaugeHtml}</div>`;
    }

    return {
      renderDashboard
    };
  }

  window.VECTON_DASHBOARD_MODULE = {
    createDashboardModule
  };
})(window);
