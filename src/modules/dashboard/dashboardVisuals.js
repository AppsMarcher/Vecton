(function attachVectonDashboardVisuals(window) {
  function createDashboardVisualsModule(deps) {
    const {
      MONTH_LABELS,
      escapeHtml,
      formatSignedCurrency,
      state
    } = deps;

    function renderDashComboChart(containerId, barVals, lineVals, focusMonthIdx, hasReal, barColor, lineColor, lineLabel) {
      const el = document.querySelector(`#${containerId}`);
      if (!el) return;

      if (!hasReal) {
        el.innerHTML = `<div class="dash-empty">Sem dados para exibir</div>`;
        return;
      }

      const W = 460, H = 140, PAD_L = 6, PAD_R = 6, PAD_B = 20, PAD_T = 10;
      const chartW = W - PAD_L - PAD_R;
      const chartH = H - PAD_B - PAD_T;
      const groupW = chartW / 12;
      const barW = Math.min(groupW * 0.55, 22);

      const activeIdxs = barVals
        .map((v, i) => ({ v, i }))
        .filter(({ v }) => Number.isFinite(v) && v !== 0)
        .map(({ i }) => i);

      const activeBarVals = activeIdxs.map((i) => barVals[i]);
      const hasNeg = activeBarVals.some((v) => v < 0);
      const barMax = Math.max(...activeBarVals.map(Math.abs), 1);
      const maxV = Math.max(...activeBarVals, 0);
      const minV = Math.min(...activeBarVals, 0);
      const zeroY = hasNeg
        ? PAD_T + chartH * (maxV / (maxV - minV))
        : PAD_T + chartH;

      const barRect = (v) => {
        if (!hasNeg) {
          const h = Math.max(1, (v / barMax) * chartH);
          return { y: zeroY - h, h };
        }
        const range = maxV - minV || 1;
        const h = Math.max(1, Math.abs(v) / range * chartH);
        const y = v >= 0 ? zeroY - h : zeroY;
        return { y, h };
      };

      const activeLineVals = activeIdxs.map((i) => lineVals[i]).filter(Number.isFinite);
      const lineMin = Math.min(...activeLineVals, 0);
      const lineMax = Math.max(...activeLineVals, 0.01);
      const lineRange = lineMax - lineMin || 0.01;
      const lineY = (v) => PAD_T + chartH * (1 - (v - lineMin) / lineRange);

      const fmtBar = (v) => Math.abs(v) >= 1e6
        ? (v / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M"
        : Math.abs(v) >= 1e3
          ? (v / 1e3).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + "k"
          : v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      const fmtPct = (v) => (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
      const clamp01 = (v) => Math.max(0, Math.min(1, v));
      const hexToRgb = (color) => {
        const hex = String(color || "").trim().replace("#", "");
        if (hex.length !== 6) return { r: 79, g: 124, b: 255 };
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16)
        };
      };
      const mixColor = (color, target, amount) => {
        const base = hexToRgb(color);
        const to = hexToRgb(target);
        const t = clamp01(amount);
        const r = Math.round(base.r + (to.r - base.r) * t);
        const g = Math.round(base.g + (to.g - base.g) * t);
        const b = Math.round(base.b + (to.b - base.b) * t);
        return `rgb(${r}, ${g}, ${b})`;
      };
      const rgbaColor = (color, alpha) => {
        const rgb = hexToRgb(color);
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp01(alpha)})`;
      };
      const svgSafeId = containerId.replace(/[^a-z0-9_-]/gi, "-");
      const barGradientId = `dash-bar-grad-${svgSafeId}`;
      const barGlowId = `dash-bar-glow-${svgSafeId}`;
      const topGlow = mixColor(barColor, "#ffffff", 0.22);
      const midTone = mixColor(barColor, "#ffffff", 0.08);
      const deepTone = mixColor(barColor, "#050816", 0.42);

      let bars = "", labels = "", linePts = [], dots = "", tooltips = "";

      for (let i = 0; i < 12; i += 1) {
        const xGroup = PAD_L + i * groupW;
        const xCenter = xGroup + groupW / 2;
        const xBar = xCenter - barW / 2;
        const isFocus = i === focusMonthIdx;
        const hasData = activeIdxs.includes(i);

        labels += `<text x="${xCenter.toFixed(1)}" y="${H - 4}" class="dash-chart-label"
          ${isFocus ? `fill="${lineColor}"` : ""}>${escapeHtml(MONTH_LABELS[i])}</text>`;

        if (!hasData) continue;

        const bv = barVals[i];
        const lv = lineVals[i];
        const { y, h } = barRect(bv);

        const opacity = isFocus ? 1 : 0.76;
        const glossH = Math.max(8, h * 0.28);
        bars += `
          <g class="dash-bar-shell" style="opacity:${opacity}">
            <rect x="${xBar.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
              fill="url(#${barGradientId})" rx="4" filter="url(#${barGlowId})"/>
            <rect x="${(xBar + 1.1).toFixed(1)}" y="${(y + 1.2).toFixed(1)}" width="${Math.max(barW - 2.2, 1).toFixed(1)}" height="${Math.max(glossH - 1.2, 1).toFixed(1)}"
              fill="rgba(255,255,255,0.14)" rx="3"/>
            <rect x="${xBar.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
              fill="none" stroke="${rgbaColor(topGlow, 0.32)}" stroke-width="0.8" rx="4"/>
          </g>`;

        const ly = lineY(lv);
        linePts.push(`${xCenter.toFixed(1)},${ly.toFixed(1)}`);

        dots += `<circle cx="${xCenter.toFixed(1)}" cy="${ly.toFixed(1)}" r="${isFocus ? 3.5 : 2}"
          fill="${lineColor}" opacity="${isFocus ? 1 : 0.75}"/>`;

        tooltips += `<rect class="dash-tooltip" x="${xBar.toFixed(1)}" y="${y.toFixed(1)}"
          width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="transparent"
          data-bv="${escapeHtml(fmtBar(bv))}" data-lv="${escapeHtml(fmtPct(lv))}" data-lc="${lineColor}"/>`;
      }

      const zeroLine = `<line x1="${PAD_L}" y1="${zeroY.toFixed(1)}" x2="${W - PAD_R}" y2="${zeroY.toFixed(1)}"
        stroke="var(--line)" stroke-width="1" stroke-dasharray="3,3"/>`;
      const defs = `
        <defs>
          <linearGradient id="${barGradientId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${topGlow}"/>
            <stop offset="22%" stop-color="${midTone}"/>
            <stop offset="100%" stop-color="${deepTone}"/>
          </linearGradient>
          <filter id="${barGlowId}" x="-30%" y="-20%" width="160%" height="170%">
            <feDropShadow dx="0" dy="8" stdDeviation="5" flood-color="${rgbaColor(barColor, 0.24)}"/>
          </filter>
        </defs>`;

      let comboSmooth = "";
      if (linePts.length > 1) {
        const pts = linePts.map((p) => { const [x, y] = p.split(",").map(Number); return { x, y }; });
        let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
        for (let k = 1; k < pts.length; k += 1) {
          const prev = pts[k - 1];
          const curr = pts[k];
          const cpx = ((prev.x + curr.x) / 2).toFixed(1);
          d += ` C ${cpx} ${prev.y.toFixed(1)}, ${cpx} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
        }
        comboSmooth = `<path d="${d}" fill="none" stroke="${lineColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
      }

      const svgId = `combo-svg-${containerId}`;
      el.innerHTML = `<svg id="${svgId}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%;cursor:crosshair">
        ${defs}
        ${zeroLine}
        ${bars}
        ${comboSmooth}
        ${dots}
        ${tooltips}
        <rect x="0" y="0" width="${W}" height="${H}" fill="transparent" class="dash-hover-overlay"/>
        ${labels}
      </svg>`;

      const svg = el.querySelector(`#${svgId}`);
      const overlay = svg?.querySelector(".dash-hover-overlay");
      if (!overlay) return;

      const tipId = `combo-htip-${containerId}`;
      let tip = document.getElementById(tipId);
      if (!tip) {
        tip = document.createElement("div");
        tip.id = tipId;
        tip.style.cssText = "position:fixed;z-index:9999;display:none;pointer-events:none;" +
          "background:#13161c;border:0.5px solid #2a2d34;border-radius:5px;padding:5px 9px;line-height:1.5;white-space:nowrap";
        document.body.appendChild(tip);
      }

      const allZones = [...svg.querySelectorAll(".dash-tooltip")];
      const tooltipByMonth = new Map();
      activeIdxs.forEach((monthI, slot) => { tooltipByMonth.set(monthI, allZones[slot]); });

      const hideAll = () => { tip.style.display = "none"; };

      overlay.addEventListener("mousemove", (e) => {
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (W / rect.width);
        const monthI = Math.floor((x - PAD_L) / groupW);
        if (monthI >= 0 && monthI < 12 && tooltipByMonth.has(monthI)) {
          const d = tooltipByMonth.get(monthI);
          const bv = d.dataset.bv;
          const lv = d.dataset.lv;
          const lc = d.dataset.lc;
          tip.innerHTML =
            `<span style="display:flex;justify-content:space-between;gap:16px"><span style="font-size:0.62rem;color:#a1a7b3">Val</span><span style="font-size:0.72rem;font-weight:700;color:#fff">${bv}</span></span>` +
            `<span style="display:flex;justify-content:space-between;gap:16px"><span style="font-size:0.62rem;color:#a1a7b3">%</span><span style="font-size:0.72rem;font-weight:600;color:${lc}">${lv}</span></span>`;
          tip.style.display = "block";
          tip.style.left = (e.clientX - tip.offsetWidth / 2) + "px";
          tip.style.top = (e.clientY - tip.offsetHeight - 10) + "px";
        } else {
          hideAll();
        }
      });
      overlay.addEventListener("mouseleave", hideAll);
    }

    function renderDashAlerts(realReport, budgetReport, monthIdx, hasReal, hasBudget, compareLabel = "Budget") {
      const list = document.querySelector("#dash-alerts-list");
      const sub = document.querySelector("#dash-alerts-subtitle");
      if (!list) return;

      const month = MONTH_LABELS[monthIdx];
      if (sub) sub.textContent = `Destaques de ${month}.`;

      if (!hasReal) {
        list.innerHTML = `<div class="alert-item"><span class="alert-dot warning"></span><div><strong>Sem dados de realizado</strong><p>Importe e aplique um lote de realizado para ativar os alertas.</p></div></div>`;
        return;
      }

      const alerts = [];
      const getL = (rep, id) => rep.lines.find((l) => l.id === id);
      const m = (line) => line ? (line.months[monthIdx] ?? 0) : 0;

      if (hasBudget) {
        const ebReal = m(getL(realReport, "ebitda"));
        const ebBudg = m(getL(budgetReport, "ebitda"));
        if (ebBudg !== 0) {
          const varPct = (ebReal - ebBudg) / Math.abs(ebBudg);
          if (varPct < -0.05) {
            alerts.push({ dot: "danger", title: `EBITDA abaixo do ${compareLabel} em ${Math.abs(varPct * 100).toFixed(1)}%`, text: `Realizado: ${formatSignedCurrency(ebReal)} vs ${compareLabel}: ${formatSignedCurrency(ebBudg)}` });
          } else if (varPct > 0.05) {
            alerts.push({ dot: "positive", title: `EBITDA acima do ${compareLabel} em ${(varPct * 100).toFixed(1)}%`, text: `Realizado: ${formatSignedCurrency(ebReal)} vs ${compareLabel}: ${formatSignedCurrency(ebBudg)}` });
          } else {
            alerts.push({ dot: "warning", title: `EBITDA dentro do ${compareLabel}`, text: `Variação de ${(varPct * 100).toFixed(1)}% no mês.` });
          }
        }
      }

      if (hasBudget) {
        const rlReal = m(getL(realReport, "receitaLiquida"));
        const rlBudg = m(getL(budgetReport, "receitaLiquida"));
        if (rlBudg !== 0) {
          const varPct = (rlReal - rlBudg) / Math.abs(rlBudg);
          if (Math.abs(varPct) > 0.03) {
            const dir = varPct >= 0 ? "acima" : "abaixo";
            const dot = varPct >= 0 ? "positive" : "danger";
            alerts.push({ dot, title: `Receita Líquida ${dir} do ${compareLabel}`, text: `${dir === "acima" ? "+" : ""}${(varPct * 100).toFixed(1)}% em ${month}.` });
          }
        }
      }

      const pendingReal = state.actualsBatches.filter((b) => b.status === "ready").length;
      if (pendingReal > 0) {
        alerts.push({ dot: "warning", title: `${pendingReal} lote(s) de realizado aguardando aplicação`, text: "Acesse Carga de Realizado para aplicar." });
      }
      const pendingBudget = state.budgetBatches.filter((b) => b.status === "ready").length;
      if (pendingBudget > 0) {
        alerts.push({ dot: "warning", title: `${pendingBudget} lote(s) de planejado aguardando aplicação`, text: "Acesse Carga de Planejado para aplicar." });
      }

      if (!alerts.length) {
        alerts.push({ dot: "positive", title: "Tudo em ordem", text: `Nenhum alerta para ${month}.` });
      }

      list.innerHTML = alerts.map(({ dot, title, text }) => `
        <div class="alert-item">
          <span class="alert-dot ${escapeHtml(dot)}"></span>
          <div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>
        </div>
      `).join("");
    }

    return {
      renderDashComboChart,
      renderDashAlerts
    };
  }

  window.VECTON_DASHBOARD_VISUALS = {
    createDashboardVisualsModule
  };
})(window);
