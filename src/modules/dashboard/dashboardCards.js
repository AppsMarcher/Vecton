(function attachVectonDashboardCards(window) {
  function createDashboardCardsModule(deps) {
    const {
      MONTH_LABELS,
      HC_PESSOAL_ACCOUNTS,
      getOpexStructure,
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
      setActiveView,
      setSelectedReportId,
      callSupabaseRpc
    } = deps;

    let dashOpexMgmt = "Marcher";
    let dashHcMgmt = "Marcher";
    let opexCcLoadingYear = null;
    let hcDashLoadingKey = null;
    let _opexAccum = false;
    let _lastOpexParams = null;
    const opexDonutCache = new Map();   // dkey → [{management, total}] (agregação server-side)
    let opexDonutLoadingKey = null;

    const MGMT_COLORS = [
      "#4f7cff", "#22c55e", "#f59e0b", "#8b5cf6", "#14b8a6",
      "#ef4444", "#06b6d4", "#f97316", "#a78bfa", "#6b7280"
    ];

    function getMgmtColor(index) {
      return MGMT_COLORS[index % MGMT_COLORS.length];
    }

    function renderDashOpexCards(year, monthIdx, allRealRows, allBudgetRows) {
      _lastOpexParams = { year, monthIdx, allRealRows, allBudgetRows };
      const pessoalAccounts = HC_PESSOAL_ACCOUNTS;
      const opexStructure = getOpexStructure();
      const allOpexAccounts = new Set(
        opexStructure.flatMap((section) => section.groups.flatMap((group) => group.accounts))
      );

      const allManagementsInCcs = [...new Set(
        state.costCenters.map((cc) => (cc.management || "").trim()).filter(Boolean)
      )].sort();

      // "Marcher" (consolidado) é sempre visível. Gestões específicas são
      // restritas às permitidas para Gestor/Analista; Admin vê todas.
      const allowedMgmts = getAllowedManagements();
      const mgmtOptions = allowedMgmts
        ? ["Marcher", ...allowedMgmts.filter((m) => allManagementsInCcs.includes(m))]
        : ["Marcher", ...allManagementsInCcs];

      // Garante que dashHcMgmt aponte para uma opção válida
      if (!mgmtOptions.includes(dashHcMgmt)) {
        dashHcMgmt = mgmtOptions[0] || "Marcher";
      }

      // toggle Mês / Acumulado no card de Opex
      let opexToggle = document.querySelector("#dash-opex-mode-toggle");
      if (!opexToggle) {
        opexToggle = document.createElement("div");
        opexToggle.id = "dash-opex-mode-toggle";
        opexToggle.className = "dre-mode-toggle dre-mode-toggle--inline";
        opexToggle.innerHTML = `<button class="dre-mode-btn active" data-mode="mes">Mês</button><button class="dre-mode-btn" data-mode="acumulado">Acumulado</button>`;
        const kicker = document.querySelector(".dash-opex-donut-kicker");
        if (kicker) kicker.after(opexToggle);
        opexToggle.addEventListener("click", (e) => {
          const btn = e.target.closest(".dre-mode-btn");
          if (!btn) return;
          _opexAccum = btn.dataset.mode === "acumulado";
          opexToggle.querySelectorAll(".dre-mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === (_opexAccum ? "acumulado" : "mes")));
          if (_lastOpexParams) {
            const { year: y, monthIdx: mi, allRealRows: rr } = _lastOpexParams;
            renderDashOpexDonut(y, mi, rr, allOpexAccounts, managements, _opexAccum);
          }
        });
      } else {
        opexToggle.querySelectorAll(".dre-mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === (_opexAccum ? "acumulado" : "mes")));
      }

      renderDashOpexDonut(year, monthIdx, allRealRows, allOpexAccounts, managements, _opexAccum);
      renderDashHcCard(year, monthIdx, allRealRows, pessoalAccounts, mgmtOptions);
    }

    function renderDashOpexDonut(year, monthIdx, allRealRows, allOpexAccounts, managements, accum = false) {
      const donutEl = document.querySelector("#dash-opex-donut-chart");
      const legendEl = document.querySelector("#dash-opex-donut-legend");
      if (!donutEl || !legendEl) return;

      const month = monthIdx + 1;

      // Exibição primária consolidada: o donut mostra TODAS as gestões da empresa.
      // O filtro por gestão do usuário acontece só no drill (fatia → relatório OPEX).
      const mgmtFilter = null;

      // Agregação server-side (RPC): soma o OPEX por gestão no Postgres e devolve
      // ~10 linhas, em vez de baixar o ano inteiro de lançamentos no cliente.
      const monthFrom = accum ? 1 : month;
      const monthTo = month;
      const dkey = `${year}-${monthFrom}-${monthTo}-${mgmtFilter || "all"}`;
      const agg = opexDonutCache.get(dkey);

      if (!agg && opexDonutLoadingKey !== dkey) {
        opexDonutLoadingKey = dkey;
        resolveOrganizationId().then((orgId) =>
          callSupabaseRpc("dash_opex_by_management", {
            p_org: orgId,
            p_year: year,
            p_month_from: monthFrom,
            p_month_to: monthTo,
            p_accounts: [...allOpexAccounts],
            p_management: mgmtFilter
          })
        ).then((totals) => {
          opexDonutCache.set(dkey, Array.isArray(totals) ? totals : []);
          opexDonutLoadingKey = null;
          renderDashOpexDonut(year, monthIdx, allRealRows, allOpexAccounts, managements, accum);
        }).catch((e) => {
          console.warn("Falha ao agregar OPEX por gestão", e);
          opexDonutCache.set(dkey, []);
          opexDonutLoadingKey = null;
          renderDashOpexDonut(year, monthIdx, allRealRows, allOpexAccounts, managements, accum);
        });
      }

      const mgmtTotals = new Map();
      let grandTotal = 0;
      for (const r of (agg || [])) {
        const mgmt = r.management || "Outros";
        const amount = Number(r.total) || 0;
        if (!Number.isFinite(amount) || amount === 0) continue;
        mgmtTotals.set(mgmt, (mgmtTotals.get(mgmt) || 0) + amount);
        grandTotal += amount;
      }

      const slices = [...mgmtTotals.entries()]
        .filter(([, value]) => value !== 0)
        .map(([name, value]) => ({ name, val: Math.abs(value) }))
        .sort((a, b) => b.val - a.val);

      if (slices.length === 0) {
        const msg = agg == null ? "Carregando..." : "Sem dados no mês";
        donutEl.innerHTML = `<svg viewBox="0 0 200 200" style="width:100%;height:100%">
          <circle cx="100" cy="100" r="74" fill="none" stroke="var(--line)" stroke-width="22" opacity="0.4"/>
          <text x="100" y="104" style="fill:var(--text-faint);font-size:10px;text-anchor:middle;font-family:inherit">${escapeHtml(msg)}</text>
        </svg>`;
        legendEl.innerHTML = "";
        return;
      }

      const CX = 100;
      const CY = 100;
      const R_OUT = 82;
      const R_IN = 54;
      const GAP_RAD = 0.018;
      const totalVal = slices.reduce((sum, slice) => sum + slice.val, 0) || 1;

      const fmtCenter = (value) => {
        if (Math.abs(value) >= 1e6) return `R$ ${(value / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
        if (Math.abs(value) >= 1e3) return `R$ ${(value / 1e3).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k`;
        return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      };

      const fmtVal = (value) => {
        if (Math.abs(value) >= 1e6) return `R$ ${(value / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
        if (Math.abs(value) >= 1e3) return `R$ ${(value / 1e3).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k`;
        return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      };

      function polarToXY(cx, cy, radius, angleDeg) {
        const rad = (angleDeg - 90) * Math.PI / 180;
        return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
      }

      function arcPath(cx, cy, rOut, rIn, startDeg, endDeg) {
        const gapDeg = GAP_RAD * 180 / Math.PI;
        const start = startDeg + gapDeg / 2;
        const end = endDeg - gapDeg / 2;
        if (end <= start) return "";
        const p1 = polarToXY(cx, cy, rOut, start);
        const p2 = polarToXY(cx, cy, rOut, end);
        const p3 = polarToXY(cx, cy, rIn, end);
        const p4 = polarToXY(cx, cy, rIn, start);
        const large = (end - start) > 180 ? 1 : 0;
        return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}
          A ${rOut} ${rOut} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}
          L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}
          A ${rIn} ${rIn} 0 ${large} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)} Z`;
      }

      let paths = "";
      let angle = 0;
      const colorMap = new Map();

      slices.forEach((slice, index) => {
        const sweep = (slice.val / totalVal) * 360;
        const color = getMgmtColor(index);
        colorMap.set(slice.name, color);
        const path = arcPath(CX, CY, R_OUT, R_IN, angle, angle + sweep);
        if (path) {
          paths += `<path d="${path}" fill="${color}" opacity="0.90"
            data-mgmt="${escapeHtml(slice.name)}"
            class="donut-slice" style="cursor:pointer;transition:opacity 120ms"/>`;
        }
        angle += sweep;
      });

      const absTotal = Math.abs(grandTotal);
      const centerLine1 = fmtCenter(absTotal);
      const periodLabel = accum
        ? `Jan–${MONTH_LABELS[monthIdx]}`
        : MONTH_LABELS[monthIdx];

      donutEl.innerHTML = `<svg viewBox="0 0 200 200" style="width:100%;height:100%;overflow:visible">
        ${paths}
        <text x="${CX}" y="${CY + 2}" style="fill:var(--text);font-size:14px;font-weight:700;text-anchor:middle;font-family:inherit">${escapeHtml(centerLine1)}</text>
        <text x="${CX}" y="${CY + 18}" style="fill:var(--text-faint);font-size:9px;text-anchor:middle;font-family:inherit">${escapeHtml(periodLabel)}</text>
      </svg>`;

      legendEl.innerHTML = slices.map((slice, index) => {
        const color = colorMap.get(slice.name) || getMgmtColor(index);
        const pct = ((slice.val / totalVal) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        const isClickable = slice.name !== "Outros";
        const nameColor = isClickable ? "color:var(--text-soft)" : "color:var(--text-faint)";
        return `<div class="dash-opex-legend-row" data-mgmt="${escapeHtml(slice.name)}" data-clickable="${isClickable}" data-color="${color}">
          <span class="dash-opex-legend-dot" style="background:${color}"></span>
          <span class="dash-opex-legend-name" style="${nameColor}">${escapeHtml(slice.name)}</span>
          <span class="dash-opex-legend-pct">${pct}%</span>
          <span class="dash-opex-legend-val">${escapeHtml(fmtVal(slice.val))}</span>
        </div>`;
      }).join("");

      const sliceEls = [...donutEl.querySelectorAll(".donut-slice")];
      const legendRows = [...legendEl.querySelectorAll(".dash-opex-legend-row")];

      const highlightMgmt = (mgmt) => {
        sliceEls.forEach((sliceEl) => {
          if (sliceEl.dataset.mgmt === mgmt) {
            sliceEl.style.opacity = "1";
            sliceEl.style.filter = "brightness(1.20)";
          } else {
            sliceEl.style.opacity = "0.35";
            sliceEl.style.filter = "";
          }
        });
        legendRows.forEach((row) => {
          if (row.dataset.mgmt === mgmt) {
            row.style.background = "rgba(255,255,255,0.07)";
            row.querySelector(".dash-opex-legend-name").style.color = "var(--text)";
            row.querySelector(".dash-opex-legend-val").style.color = "var(--text)";
          } else {
            row.style.background = "";
            row.querySelector(".dash-opex-legend-name").style.color = "var(--text-faint)";
            row.querySelector(".dash-opex-legend-val").style.color = "var(--text-faint)";
          }
        });
      };

      const resetAll = () => {
        sliceEls.forEach((sliceEl) => {
          sliceEl.style.opacity = "0.90";
          sliceEl.style.filter = "";
        });
        legendRows.forEach((row) => {
          const isClickable = row.dataset.mgmt !== "Outros";
          row.style.background = "";
          row.querySelector(".dash-opex-legend-name").style.color = isClickable ? "var(--text-soft)" : "var(--text-faint)";
          row.querySelector(".dash-opex-legend-val").style.color = "var(--text)";
        });
      };

      sliceEls.forEach((sliceEl) => {
        sliceEl.addEventListener("mouseenter", () => highlightMgmt(sliceEl.dataset.mgmt));
        sliceEl.addEventListener("mouseleave", resetAll);
        sliceEl.addEventListener("click", () => {
          const mgmt = sliceEl.dataset.mgmt;
          if (mgmt && mgmt !== "Outros") navigateToOpexReport(mgmt, sliceEl);
        });
      });

      // tooltip estilizado para linhas clicáveis
      let opexTip = document.querySelector("#dash-opex-legend-tip");
      if (!opexTip) {
        opexTip = document.createElement("div");
        opexTip.id = "dash-opex-legend-tip";
        opexTip.style.cssText = "position:fixed;z-index:9999;display:none;pointer-events:none;" +
          "background:#13161c;border:0.5px solid #2a2d34;border-radius:5px;padding:5px 9px;" +
          "font-size:0.68rem;color:#a1a7b3;white-space:nowrap";
        document.body.appendChild(opexTip);
      }

      legendRows.forEach((row) => {
        const mgmt = row.dataset.mgmt;
        const isClickable = row.dataset.clickable === "true";
        const sliceColor = row.dataset.color || "#a1a7b3";
        row.addEventListener("mouseenter", (e) => {
          highlightMgmt(mgmt);
          if (isClickable) {
            opexTip.innerHTML = `<span style="color:${sliceColor};font-weight:700">Ver OPEX → ${escapeHtml(mgmt)}</span>`;
            opexTip.style.display = "block";
            opexTip.style.left = `${e.clientX + 10}px`;
            opexTip.style.top = `${e.clientY - 28}px`;
          }
        });
        row.addEventListener("mousemove", (e) => {
          if (isClickable) {
            opexTip.style.left = `${e.clientX + 10}px`;
            opexTip.style.top = `${e.clientY - 28}px`;
          }
        });
        row.addEventListener("mouseleave", () => {
          resetAll();
          opexTip.style.display = "none";
        });
        if (isClickable) {
          row.addEventListener("click", () => navigateToOpexReport(mgmt, row));
        }
      });
    }

    function renderDashHcCard(year, monthIdx, allRealRows, pessoalAccounts, mgmtOptions) {
      const filterSlot = document.querySelector("#dash-hc-filter");
      if (filterSlot) {
        const existing = filterSlot.querySelector("select");
        if (!existing || existing.dataset.opts !== mgmtOptions.join(",")) {
          filterSlot.innerHTML = `<select class="dash-opex-filter-select">
            ${mgmtOptions.map((mgmt) => `<option value="${escapeHtml(mgmt)}" ${mgmt === dashHcMgmt ? "selected" : ""}>${escapeHtml(mgmt)}</option>`).join("")}
          </select>`;
          const selectEl = filterSlot.querySelector("select");
          selectEl.dataset.opts = mgmtOptions.join(",");
          selectEl.addEventListener("change", (event) => {
            dashHcMgmt = event.target.value;
            const freshReal = reportsLedgerCache.get(year)?.rows || [];
            renderDashHcCard(year, monthIdx, freshReal, pessoalAccounts, mgmtOptions);
          });
        } else {
          existing.value = dashHcMgmt;
        }
      }

      const month = monthIdx + 1;

      let pessoalSource = allRealRows;
      if (dashHcMgmt !== "Marcher") {
        const mgmtCcFilter = buildOpexCostCenterFilter(dashHcMgmt);
        const ccIds = [...(mgmtCcFilter?.ids || [])];
        const hcMgmtCacheKey = `dash-hc-cc-${year}-${dashHcMgmt}`;
        const hcMgmtCached = reportsLedgerCache.get(hcMgmtCacheKey);
        if (hcMgmtCached) {
          pessoalSource = hcMgmtCached.rows;
        } else if (!reportsLedgerCache.has(hcMgmtCacheKey) && hcDashLoadingKey !== hcMgmtCacheKey) {
          hcDashLoadingKey = hcMgmtCacheKey;
          (ccIds.length ? fetchActualsLedgerForCcIds(year, ccIds) : fetchActualsLedgerWithCcForYear(year))
            .then((fetched) => {
              reportsLedgerCache.set(hcMgmtCacheKey, { rows: fetched });
              hcDashLoadingKey = null;
              const freshReal = reportsLedgerCache.get(year)?.rows || [];
              renderDashHcCard(year, monthIdx, freshReal, pessoalAccounts, mgmtOptions);
            })
            .catch(() => { hcDashLoadingKey = null; });
          pessoalSource = [];
        } else {
          pessoalSource = [];
        }
      }

      const filteredPessoal = pessoalSource;

      const pessoalMonths = Array(12).fill(0);
      for (const row of filteredPessoal) {
        const code = String(row.account_number ?? row.accountNumber ?? "").trim();
        if (!pessoalAccounts.has(code)) continue;
        const rowMonth = Number(row.reference_month ?? row.referenceMonth ?? 0);
        const value = Number(row.amount ?? 0);
        if (rowMonth >= 1 && rowMonth <= 12 && Number.isFinite(value)) {
          pessoalMonths[rowMonth - 1] += value;
        }
      }

      renderDashHcKpi(year, month, pessoalMonths, monthIdx);
      renderDashHcLineChart("dash-hc-line-chart", pessoalMonths, monthIdx, allRealRows.length > 0 || pessoalSource.length > 0);
    }

    function renderDashHcKpi(year, month, pessoalMonths, monthIdx) {
      const totalEl = document.querySelector("#dash-hc-total");
      const cppEl = document.querySelector("#dash-hc-cpp");
      const colabEl = document.querySelector("#dash-hc-colab-label");
      if (!totalEl) return;

      const key = `${year}-${month}`;
      const data = hcDashCache.get(key) || null;

      if (!data) {
        totalEl.textContent = "—";
        if (cppEl) cppEl.textContent = "";
        if (colabEl) colabEl.textContent = "";
        void ensureHcDashData(year, month).then((loaded) => {
          if (loaded) renderDashHcKpi(year, month, pessoalMonths, monthIdx);
        });
        return;
      }

      const enriched = (data.realRows || []).map((row) => {
        const cc = state.costCenters.find((costCenter) => costCenter.number === row.cost_center_number);
        return { ...row, management: (cc?.management || "Sem area").trim() };
      });
      const filtered = dashHcMgmt === "Marcher"
        ? enriched
        : enriched.filter((row) => row.management === dashHcMgmt);

      const headcount = filtered.length > 0 ? filtered.length : (data.real > 0 ? data.real : 0);
      totalEl.textContent = headcount > 0 ? headcount.toLocaleString("pt-BR") : "—";
      if (colabEl) colabEl.textContent = headcount > 0 ? (headcount === 1 ? "colab" : "colabs") : "";

      if (cppEl) {
        const pessoalMes = pessoalMonths && monthIdx != null ? Math.abs(pessoalMonths[monthIdx] ?? 0) : 0;
        if (headcount > 0 && pessoalMes > 0) {
          const cpp = Math.round(pessoalMes / headcount);
          cppEl.textContent = `R$ ${cpp.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} p.p.`;
        } else {
          cppEl.textContent = "";
        }
      }

      // O total acima (KPI) é consolidado (empresa). Já o DRILL (popover ao clicar)
      // respeita o acesso: Gestor/Analista só veem colaboradores da sua gestão.
      const _hcRole = state.profile?.accessRole || "admin";
      const _hcUserMgmt = (state.profile?.management || "").trim();
      const drillRestricted = (_hcRole === "manager" || _hcRole === "analyst") && _hcUserMgmt;
      const drillSource = drillRestricted
        ? filtered.filter((row) => (row.management || "").trim() === _hcUserMgmt)
        : filtered;

      const mgmtMap = new Map();
      for (const row of drillSource) {
        const mgmt = row.management || "Sem area";
        if (!mgmtMap.has(mgmt)) mgmtMap.set(mgmt, []);
        mgmtMap.get(mgmt).push({
          ...row,
          ccName: (() => {
            const cc = state.costCenters.find((costCenter) => costCenter.number === row.cost_center_number);
            return cc?.name || row.cost_center_number || "";
          })()
        });
      }

      const byMgmt = [...mgmtMap.entries()]
        .map(([mgmt, entries]) => ({ mgmt, count: entries.length, entries }))
        .sort((a, b) => b.count - a.count);

      const drillTotal = drillSource.length;
      const initialMgmt = drillRestricted && byMgmt.length === 1 ? byMgmt[0].mgmt : null;
      const kpiBlock = totalEl.closest(".dash-hc-kpi-block");
      if (kpiBlock && headcount > 0 && byMgmt.length > 0) {
        const newBlock = kpiBlock.cloneNode(true);
        kpiBlock.parentNode.replaceChild(newBlock, kpiBlock);
        newBlock.style.cursor = "pointer";
        newBlock.addEventListener("click", () => openHcMgmtPopover(byMgmt, drillTotal, initialMgmt));
      }
    }

    function renderDashHcLineChart(containerId, pessoalMonths, focusMonthIdx, hasData) {
      const el = document.querySelector(`#${containerId}`);
      if (!el) return;

      const W = 460;
      const H = 110;
      const PAD_L = 6;
      const PAD_R = 6;
      const PAD_B = 18;
      const PAD_T = 8;
      const chartW = W - PAD_L - PAD_R;
      const chartH = H - PAD_B - PAD_T;

      const hasAnyVal = pessoalMonths.some((value) => value !== 0);
      if (!hasData || !hasAnyVal) {
        const msg = !hasData ? "Sem dados" : "Sem lancamentos de pessoal";
        el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100%">
          <text x="${W / 2}" y="${H / 2}" style="fill:var(--text-faint);font-size:10px;text-anchor:middle;font-family:inherit">${escapeHtml(msg)}</text>
        </svg>`;
        return;
      }

      const vals = pessoalMonths;
      const nonZero = vals.filter((value) => value !== 0);
      const minV = Math.min(...nonZero);
      const maxV = Math.max(...nonZero);
      const range = maxV - minV || 1;
      const padding = range * 0.12;
      const scaleMin = minV - padding;
      const scaleMax = maxV + padding;
      const scaleRange = scaleMax - scaleMin || 1;
      const groupW = chartW / 12;

      const toY = (value) => PAD_T + chartH - ((value - scaleMin) / scaleRange) * chartH;
      const toX = (index) => PAD_L + index * groupW + groupW / 2;

      const yTicks = 3;
      let yAxisHtml = "";
      for (let tick = 0; tick <= yTicks; tick += 1) {
        const value = scaleMin + (scaleRange * tick / yTicks);
        const y = toY(value);
        yAxisHtml += `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W - PAD_R}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="0.5" opacity="0.4"/>`;
      }

      const activePoints = [];
      for (let index = 0; index < 12; index += 1) {
        if (vals[index] !== 0) activePoints.push({ x: toX(index), y: toY(vals[index]) });
      }

      let pathD = "";
      if (activePoints.length > 1) {
        pathD = `M ${activePoints[0].x.toFixed(1)} ${activePoints[0].y.toFixed(1)}`;
        for (let index = 1; index < activePoints.length; index += 1) {
          const prev = activePoints[index - 1];
          const curr = activePoints[index];
          const cpX = ((prev.x + curr.x) / 2).toFixed(1);
          pathD += ` C ${cpX} ${prev.y.toFixed(1)}, ${cpX} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
        }
      }

      const gradId = `hc-line-grad-${containerId}`;
      let areaD = "";
      if (activePoints.length > 1) {
        const bottomY = (PAD_T + chartH).toFixed(1);
        areaD = `${pathD} L ${activePoints[activePoints.length - 1].x.toFixed(1)} ${bottomY} L ${activePoints[0].x.toFixed(1)} ${bottomY} Z`;
      }

      let labels = "";
      let dots = "";
      for (let index = 0; index < 12; index += 1) {
        const xc = toX(index).toFixed(1);
        const isFocus = index === focusMonthIdx;
        labels += `<text x="${xc}" y="${H - 3}" style="fill:${isFocus ? "#8b5cf6" : "var(--text-faint)"};font-size:8px;text-anchor:middle;font-family:inherit">${escapeHtml(MONTH_LABELS[index])}</text>`;
        if (vals[index] !== 0) {
          const cy = toY(vals[index]).toFixed(1);
          if (isFocus) {
            dots += `<circle cx="${xc}" cy="${cy}" r="4" fill="#8b5cf6" stroke="#0d1224" stroke-width="2"/>`;
          } else {
            dots += `<circle cx="${xc}" cy="${cy}" r="2.2" fill="#8b5cf6" opacity="0.7"/>`;
          }
        }
      }

      const svgId = `hc-line-svg-${containerId}`;
      el.innerHTML = `<svg id="${svgId}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%;overflow:visible">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        ${yAxisHtml}
        ${areaD ? `<path d="${areaD}" fill="url(#${gradId})"/>` : ""}
        ${pathD ? `<path d="${pathD}" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
        ${dots}
        ${labels}
      </svg>`;

      const svg = el.querySelector(`#${svgId}`);
      if (!svg) return;

      const fmtTip = (value) => {
        if (Math.abs(value) >= 1e6) return `R$ ${(value / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
        if (Math.abs(value) >= 1e3) return `R$ ${(value / 1e3).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k`;
        return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      };

      const tipId = `hc-htip-${containerId}`;
      let tip = document.getElementById(tipId);
      if (!tip) {
        tip = document.createElement("div");
        tip.id = tipId;
        tip.style.cssText = "position:fixed;z-index:9999;display:none;pointer-events:none;" +
          "background:#13161c;border:0.5px solid #2a2d34;border-radius:5px;padding:5px 9px;line-height:1.5;white-space:nowrap";
        document.body.appendChild(tip);
      }

      const overlay = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      overlay.setAttribute("x", "0");
      overlay.setAttribute("y", "0");
      overlay.setAttribute("width", String(W));
      overlay.setAttribute("height", String(H));
      overlay.setAttribute("fill", "transparent");
      overlay.style.cursor = "crosshair";
      svg.appendChild(overlay);

      overlay.addEventListener("mousemove", (event) => {
        const rect = svg.getBoundingClientRect();
        const xRel = (event.clientX - rect.left) * (W / rect.width);
        const monthIndex = Math.round((xRel - PAD_L) / groupW - 0.5);
        if (monthIndex >= 0 && monthIndex < 12 && vals[monthIndex] !== 0) {
          tip.innerHTML = `<span style="display:flex;justify-content:space-between;gap:14px">
            <span style="font-size:0.62rem;color:#a1a7b3">${escapeHtml(MONTH_LABELS[monthIndex])}</span>
            <span style="font-size:0.72rem;font-weight:700;color:#8b5cf6">${escapeHtml(fmtTip(vals[monthIndex]))}</span>
          </span>`;
          tip.style.display = "block";
          tip.style.left = `${event.clientX - tip.offsetWidth / 2}px`;
          tip.style.top = `${event.clientY - tip.offsetHeight - 10}px`;
        } else {
          tip.style.display = "none";
        }
      });
      overlay.addEventListener("mouseleave", () => {
        tip.style.display = "none";
      });
    }

    async function ensureHcDashData(year, month) {
      const key = `${year}-${month}`;
      if (hcDashCache.has(key)) return hcDashCache.get(key);
      if (hcDashLoadingKey === key) return null;
      hcDashLoadingKey = key;
      try {
        if (!isSupabaseConfigured()) {
          const real = state.headcountBatches
            .filter((batch) => batch.status === "applied" && Number(batch.referenceYear) === year && Number(batch.referenceMonth) === month && batch.loadType === "realizado")
            .reduce((sum, batch) => sum + (batch.validRows || 0), 0);
          const orcado = state.headcountBatches
            .filter((batch) => batch.status === "applied" && Number(batch.referenceYear) === year && Number(batch.referenceMonth) === month && batch.loadType === "orcado")
            .reduce((sum, batch) => sum + (batch.validRows || 0), 0);
          const data = { real, orcado, realRows: [], orcRows: [] };
          hcDashCache.set(key, data);
          return data;
        }

        const orgId = await resolveOrganizationId();
        const [realRows, orcRows] = await Promise.all([
          fetchSupabaseRowsSafe("headcount_entries", `organization_id=eq.${orgId}&reference_year=eq.${year}&reference_month=eq.${month}&load_type=eq.realizado&select=cost_center_number,matricula,colab,cargo`),
          fetchSupabaseRowsSafe("headcount_entries", `organization_id=eq.${orgId}&reference_year=eq.${year}&reference_month=eq.${month}&load_type=eq.orcado&select=matricula`)
        ]);
        const data = { real: realRows.length, orcado: orcRows.length, realRows, orcRows };
        hcDashCache.set(key, data);
        return data;
      } finally {
        hcDashLoadingKey = null;
      }
    }

    function openHcMgmtPopover(byMgmt, total, initialMgmt = null) {
      document.querySelector("#hc-mgmt-popover-overlay")?.remove();
      const overlay = document.createElement("div");
      overlay.id = "hc-mgmt-popover-overlay";
      overlay.style.cssText = "position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.50)";

      const buildLevel1 = () => `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div>
            <p style="font-size:0.65rem;color:var(--text-faint);letter-spacing:0.07em;text-transform:uppercase;margin-bottom:3px">HEADCOUNT REALIZADO</p>
            <h4 style="font-size:0.95rem;font-weight:600;color:var(--text);margin:0">Por area de gestao</h4>
          </div>
          <button class="hc-pop-close" style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:20px;line-height:1;padding:4px 8px">x</button>
        </div>
        <div style="margin-bottom:14px;padding-bottom:12px;border-bottom:0.5px solid var(--line)">
          <span style="font-size:1.7rem;font-weight:700;color:var(--text)">${total}</span>
          <span style="font-size:0.75rem;color:var(--text-faint);margin-left:6px">colaboradores</span>
        </div>
        <div>
          ${byMgmt.map(({ mgmt, count }) => {
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
            const barW = total > 0 ? Math.round((count / total) * 180) : 0;
            return `<div class="hc-pop-row" data-mgmt="${escapeHtml(mgmt)}" style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:0.5px solid var(--line);cursor:pointer">
              <span style="flex:0 0 150px;font-size:0.74rem;color:var(--text-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(mgmt)}">${escapeHtml(mgmt)}</span>
              <div style="flex:0 0 180px;height:7px;background:var(--panel-alt);border-radius:4px;overflow:hidden">
                <div style="width:${barW}px;height:100%;background:#4f7cff;border-radius:4px"></div>
              </div>
              <span style="flex:0 0 28px;font-size:0.74rem;font-weight:600;color:var(--text);text-align:right">${count}</span>
              <span style="flex:0 0 38px;font-size:0.72rem;color:var(--text-faint);text-align:right">${pct}%</span>
              <span style="font-size:11px;color:var(--text-faint);flex-shrink:0">></span>
            </div>`;
          }).join("")}
        </div>`;

      const SORT_FIELDS = {
        cc: (row) => (row.cost_center_number || "").padStart(10, "0"),
        ccName: (row) => (row.ccName || "").toLowerCase(),
        mat: (row) => Number(row.matricula) || 0,
        colab: (row) => (row.colab || "").toLowerCase(),
        cargo: (row) => (row.cargo || "").toLowerCase()
      };

      const buildLevel2 = (mgmt, sortKey, sortDir) => {
        const finalSortKey = sortKey || "colab";
        const finalSortDir = sortDir === undefined ? 1 : sortDir;
        const group = byMgmt.find((entry) => entry.mgmt === mgmt);
        const rawEntries = (group ? group.entries : []).slice();
        const sorter = SORT_FIELDS[finalSortKey] || SORT_FIELDS.colab;
        rawEntries.sort((a, b) => {
          const av = sorter(a);
          const bv = sorter(b);
          if (typeof av === "number") return (av - bv) * finalSortDir;
          return av.localeCompare(bv, "pt-BR") * finalSortDir;
        });

        const buildTh = (key, label) => {
          const active = key === finalSortKey;
          const arrow = active ? (finalSortDir === 1 ? " ^" : " v") : "";
          const padL = key === "cc" ? "0" : "8px";
          const padR = key === "cargo" ? "0" : "8px";
          return `<th data-sort="${key}" style="padding:4px ${padR} 6px ${padL};font-size:0.62rem;color:${active ? "var(--blue)" : "var(--text-faint)"};text-align:left;font-weight:${active ? "600" : "500"};cursor:pointer;user-select:none;white-space:nowrap">${escapeHtml(label)}${arrow}</th>`;
        };

        const rows = rawEntries.map((row) => `
          <tr style="border-bottom:0.5px solid var(--line)">
            <td style="padding:5px 8px 5px 0;font-size:0.68rem;color:var(--text-faint);white-space:nowrap">${escapeHtml(row.cost_center_number || "")}</td>
            <td style="padding:5px 8px;font-size:0.68rem;color:var(--text-soft);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(row.ccName || "")}">${escapeHtml(row.ccName || "")}</td>
            <td style="padding:5px 8px;font-size:0.68rem;color:var(--text-faint);white-space:nowrap">${escapeHtml(row.matricula || "")}</td>
            <td style="padding:5px 8px;font-size:0.68rem;color:var(--text);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(row.colab || "")}">${escapeHtml(row.colab || "")}</td>
            <td style="padding:5px 0 5px 8px;font-size:0.68rem;color:var(--text-soft);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(row.cargo || "")}">${escapeHtml(row.cargo || "")}</td>
          </tr>`).join("");

        const backBtn = byMgmt.length > 1
          ? `<button class="hc-pop-back" style="background:none;border:none;color:var(--blue);cursor:pointer;font-size:13px;padding:0;display:flex;align-items:center;gap:3px">< Voltar</button>`
          : "";

        return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <div style="display:flex;align-items:center;gap:10px">
              ${backBtn}
              <div>
                <p style="font-size:0.62rem;color:var(--text-faint);letter-spacing:0.07em;text-transform:uppercase;margin-bottom:3px">HEADCOUNT REALIZADO</p>
                <h4 style="font-size:0.95rem;font-weight:600;color:var(--text);margin:0">${escapeHtml(mgmt)}</h4>
              </div>
            </div>
            <button class="hc-pop-close" style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:20px;line-height:1;padding:4px 8px">x</button>
          </div>
          <div style="margin-bottom:14px;padding-bottom:12px;border-bottom:0.5px solid var(--line)">
            <span style="font-size:1.7rem;font-weight:700;color:var(--text)">${rawEntries.length}</span>
            <span style="font-size:0.75rem;color:var(--text-faint);margin-left:6px">colaboradores</span>
          </div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="border-bottom:0.5px solid var(--line)">
                ${buildTh("cc", "CC")}${buildTh("ccName", "Nome CC")}${buildTh("mat", "Mat.")}${buildTh("colab", "Colaborador")}${buildTh("cargo", "Cargo")}
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      };

      const inner = document.createElement("div");
      inner.style.cssText = "background:var(--panel);border:0.5px solid var(--line);border-radius:14px;padding:20px 24px;min-width:560px;max-width:640px;max-height:80vh;overflow-y:auto;box-shadow:0 24px 56px rgba(0,0,0,0.55)";
      overlay.appendChild(inner);
      document.body.appendChild(overlay);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) overlay.remove();
      });

      const renderPop = (level2mgmt = null, sortKey = "colab", sortDir = 1) => {
        inner.innerHTML = level2mgmt ? buildLevel2(level2mgmt, sortKey, sortDir) : buildLevel1();
        inner.querySelectorAll(".hc-pop-close").forEach((button) => button.addEventListener("click", () => overlay.remove()));
        inner.querySelector(".hc-pop-back")?.addEventListener("click", () => renderPop(null));
        if (!level2mgmt) {
          inner.querySelectorAll(".hc-pop-row").forEach((row) => {
            row.addEventListener("click", () => renderPop(row.dataset.mgmt));
          });
        } else {
          inner.querySelectorAll("th[data-sort]").forEach((th) => {
            th.addEventListener("click", () => {
              const key = th.dataset.sort;
              const dir = key === sortKey ? sortDir * -1 : 1;
              renderPop(level2mgmt, key, dir);
            });
          });
        }
      };

      renderPop(initialMgmt);
    }

    function navigateToOpexReport(mgmt, anchorEl) {
      // Gestor/Analista só drilla na própria gestão. Clicar numa fatia de outra
      // área mostra aviso de acesso em vez de navegar (e evita o spinner infinito,
      // já que o relatório travaria em RH e o re-render nunca casaria a gestão).
      const role = state.profile?.accessRole || "admin";
      const userMgmt = (state.profile?.management || "").trim();
      if ((role === "manager" || role === "analyst") && mgmt !== userMgmt) {
        showOpexNoAccessPopover(mgmt, anchorEl);
        return;
      }
      setSelectedReportId("opexReal");
      setActiveView("reports");
      renderNavigation();
      void Promise.resolve().then(() => {
        const detailPanel = document.querySelector("#reports-view .reports-table-card");
        if (detailPanel) detailPanel.dataset.opexMgmt = mgmt || "Marcher";
        renderReportsView();
      });
    }

    function showOpexNoAccessPopover(mgmt, anchorEl) {
      document.querySelector("#dash-opex-noaccess-pop")?.remove();
      const pop = document.createElement("div");
      pop.id = "dash-opex-noaccess-pop";
      pop.style.cssText = "position:fixed;z-index:9900;background:var(--panel);border:0.5px solid var(--line);" +
        "border-radius:10px;padding:12px 14px;max-width:300px;box-shadow:0 16px 40px rgba(0,0,0,0.5);" +
        "font-size:0.78rem;color:var(--text-soft);line-height:1.4;display:flex;align-items:center;gap:9px";
      pop.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--amber)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12.5"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>` +
        `<span>Você não tem acesso ao detalhamento de <strong style="color:var(--text)">${escapeHtml(mgmt)}</strong>.</span>`;
      document.body.appendChild(pop);

      // Centralizado na tela.
      pop.style.left = "50%";
      pop.style.top = "50%";
      pop.style.transform = "translate(-50%, -50%)";

      const dismiss = (e) => {
        if (!pop.contains(e.target)) {
          pop.remove();
          document.removeEventListener("click", dismiss, true);
        }
      };
      setTimeout(() => document.addEventListener("click", dismiss, true), 0);
      setTimeout(() => { pop.remove(); document.removeEventListener("click", dismiss, true); }, 4500);
    }

    return {
      renderDashOpexCards
    };
  }

  window.VECTON_DASHBOARD_CARDS = {
    createDashboardCardsModule
  };
})(window);
