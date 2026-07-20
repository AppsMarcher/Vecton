(function attachVectonReportsBuilder(window) {
  "use strict";

  function createReportsBuilderModule(deps) {
    const {
      state, escapeHtml, MONTH_LABELS,
      fetchActualsLedgerWithCcForYear, reportsLedgerCache,
      fetchSupabaseRowsSafe, isSupabaseConfigured,
      resolveOrganizationId, getAllowedCcNumbers, getAccessRole,
      getCurrentUser, supabaseApiUrl, authenticatedFetch,
      setSelectedReportId, renderReportsView, getReportTitles, initFloatingScrollbar,
      onCatalogChanged,
    } = deps;

    // ── Cenários disponíveis ──────────────────────────────────────────
    // Para adicionar BP/FC: inclua uma entrada com type:"ledger".
    // Headcount usa type:"headcount" — cada linha vira amount:1 (contagem de colaboradores).
    const DATA_SOURCES = [
      { id: "actual",    label: "DRE Real",    type: "ledger",    table: "actuals_ledger_entries"  },
      { id: "budget",    label: "DRE Budget",  type: "ledger",    table: "budget_ledger_entries"   },
      { id: "hc_real",   label: "HC Real",     type: "headcount", loadType: "realizado", cacheKey: (y) => `hc-real-${y}`   },
      { id: "hc_budget", label: "HC Budget",   type: "headcount", loadType: "orcado",    cacheKey: (y) => `hc-budget-${y}` },
      // { id: "bp_actual", label: "BP Real",     type: "ledger", table: "bp_ledger_entries"  },
      // { id: "fc_actual", label: "FC Real",     type: "ledger", table: "fc_ledger_entries"  },
    ];

    // ── Card icons & colors ───────────────────────────────────────────

    const CARD_ICONS = {
      document:    `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>`,
      "bar-chart":  `<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`,
      "line-chart": `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
      "trending-up":`<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>`,
      dollar:       `<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>`,
      users:        `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
      briefcase:    `<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>`,
      "pie-chart":  `<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>`,
      layers:       `<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>`,
      target:       `<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`,
      package:      `<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>`,
      sliders:      `<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>`,
    };

    const CARD_COLORS = [
      { hex: "#4f7cff", label: "Azul"     },
      { hex: "#14b8a6", label: "Teal"     },
      { hex: "#f59e0b", label: "Âmbar"    },
      { hex: "#22c55e", label: "Verde"    },
      { hex: "#a855f7", label: "Roxo"     },
      { hex: "#f87171", label: "Vermelho" },
      { hex: "#fb923c", label: "Laranja"  },
      { hex: "#ec4899", label: "Rosa"     },
      { hex: "#6b7280", label: "Cinza"    },
    ];

    function hexToRgb(hex) {
      const h = hex.replace("#","");
      return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
    }

    function cardIconSvg(iconKey) {
      const path = CARD_ICONS[iconKey] || CARD_ICONS.document;
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
    }

    // ── Utils ─────────────────────────────────────────────────────────

    let _uidSeq = 0;
    const uid = () => "i" + (++_uidSeq) + Math.random().toString(36).slice(2, 5);

    function letterCode(i) {
      let s = "", n = i;
      do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
      return s;
    }

    function isAdmin() { return ["admin", "super_admin"].includes(getAccessRole()); }

    // ── State ─────────────────────────────────────────────────────────

    function blankConfig() {
      return {
        version: 2, label: "", description: "",
        icon: "document", color: "#4f7cff",
        options: { showDataInEditor: false, hideZeroRows: false, hideZeroCols: false, negativeRed: false, negativeParens: false, enableDrilldown: false, rowLabelWidth: 200 },
        rows: [], cols: [],
        access: { managements: [], ccNumbers: [] },
      };
    }

    let _cfg           = blankConfig();
    let _editingId     = null;
    let _savedReports  = [];
    let _activeTab     = "details";
    let _previewTimer  = null;
    let _sourceCache   = new Map();   // "sourceId:year" → enriched rows
    let _currentPanel  = null;
    let _activeMenu    = null;
    let _pendingEditId = null;        // set by openReportInBuilder when panel not yet mounted

    // ── Data fetching ─────────────────────────────────────────────────

    function enrichLedger(rows) {
      return rows.map(row => {
        const cc  = (state.costCenters || []).find(c => String(c.number) === String(row.cost_center_number));
        const dre = (state.dreNodes    || []).find(n => String(n.code)   === String(row.account_number));
        return {
          ...row,
          management:   (cc?.management || "").trim(),
          cc_name:      (cc?.name       || "").trim(),
          account_name: (dre?.label || dre?.name || "").trim(),
        };
      });
    }

    function applyRbac(rows) {
      const allowed = getAllowedCcNumbers();
      if (!allowed) return rows;
      return rows.filter(r => allowed.has(String(r.cost_center_number)));
    }

    async function fetchSourceYear(sourceId, year) {
      const key = `${sourceId}:${year}`;
      if (_sourceCache.has(key)) return _sourceCache.get(key);

      // Fonte de cenário: "scenario:<uuid>"
      if (sourceId.startsWith("scenario:")) {
        const scenarioId = sourceId.slice("scenario:".length);
        const orgId = await resolveOrganizationId();
        const url   = `${supabaseApiUrl}/rest/v1/forecast_ledger_entries` +
          `?organization_id=eq.${orgId}&scenario_id=eq.${scenarioId}&reference_year=eq.${year}` +
          `&select=reference_month,reference_year,account_number,cost_center_number,amount`;
        const res   = await authenticatedFetch(url);
        const raw   = res.ok ? await res.json() : [];
        const enriched = applyRbac(enrichLedger(raw));
        _sourceCache.set(key, enriched);
        return enriched;
      }

      const src = DATA_SOURCES.find(s => s.id === sourceId);
      if (!src) return [];

      let raw;
      if (sourceId === "actual") {
        const cached = reportsLedgerCache.get(year);
        raw = cached ? (cached.rows || []) : await fetchActualsLedgerWithCcForYear(year);
      } else if (src.type === "headcount") {
        // Tenta o cache do módulo HC (já carregado se o usuário abriu o relatório de HC)
        const cached = reportsLedgerCache.get(src.cacheKey(year));
        if (cached) {
          raw = (cached.rows || []).map(r => ({ ...r, amount: 1 }));
        } else {
          // Busca direto — cada linha representa 1 colaborador → amount: 1
          const orgId = await resolveOrganizationId();
          const url   = `${supabaseApiUrl}/rest/v1/headcount_entries` +
            `?organization_id=eq.${orgId}&reference_year=eq.${year}&load_type=eq.${src.loadType}` +
            `&select=reference_month,cost_center_number,matricula,colab,cargo&limit=10000`;
          const res   = await authenticatedFetch(url);
          const rows  = res.ok ? await res.json() : [];
          raw = rows.map(r => ({ ...r, amount: 1 }));
        }
      } else {
        // Ledger genérico (budget, futuro BP/FC)
        const orgId = await resolveOrganizationId();
        const url   = `${supabaseApiUrl}/rest/v1/${src.table}` +
          `?organization_id=eq.${orgId}&reference_year=eq.${year}` +
          `&select=reference_month,reference_year,account_number,cost_center_number,amount,load_type,branch_code`;
        const res   = await authenticatedFetch(url);
        raw         = res.ok ? await res.json() : [];
      }

      const enriched = applyRbac(enrichLedger(raw));
      console.log(`[VB] fetchSourceYear ${key}: ${raw.length} raw → ${enriched.length} after RBAC`);
      _sourceCache.set(key, enriched);
      return enriched;
    }

    function filterRows(rows, filters, period) {
      // Year is already scoped by fetchSourceYear (cache key = sourceId:year)
      // so only filter by month here to avoid breaking sources that omit reference_year
      return rows.filter(r => {
        if (period?.month && String(r.reference_month) !== String(period.month)) return false;
        const af = filters?.accountNumbers;
        if (af?.length && !af.includes(String(r.account_number))) return false;
        const cf = filters?.ccNumbers;
        if (cf?.length && !cf.includes(String(r.cost_center_number))) return false;
        const mf = filters?.managements;
        if (mf?.length && !mf.includes(r.management)) return false;
        return true;
      });
    }

    function filterAndSum(rows, filters, period) {
      const matched = filterRows(rows, filters, period);
      console.log("[VB] filterAndSum", { period, filters, totalRows: rows.length, matchedRows: matched.length });
      return matched.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    }

    // Fontes + filtros + lista de (mês,ano) que compõem uma célula — usado tanto pra somar
    // (computeMatrix) quanto pro drilldown (garante que o total do popover bate com a célula).
    function cellPlan(row, col) {
      const sources = row.source?.length ? row.source : (col.source?.length ? col.source : ["actual"]);
      const rAcc = row.filters?.accountNumbers || [];
      const cAcc = col.filters?.accountNumbers || [];
      const filters = {
        accountNumbers: rAcc.length && cAcc.length ? rAcc.filter(a => cAcc.includes(a)) : [...rAcc, ...cAcc],
        ccNumbers:   [...(row.filters?.ccNumbers   || []), ...(col.filters?.ccNumbers   || [])],
        managements: [...(row.filters?.managements || []), ...(col.filters?.managements || [])],
      };
      const periods = [];
      if (col.accumulate && col.periodFrom && col.periodTo) {
        let m = col.periodFrom.month, y = col.periodFrom.year;
        while (y < col.periodTo.year || (y === col.periodTo.year && m <= col.periodTo.month)) {
          periods.push({ month: m, year: y });
          if (++m > 12) { m = 1; y++; }
        }
      } else {
        const period = row.period?.type === "fixed" ? row.period : col.period;
        if (period?.month && period?.year) periods.push(period);
      }
      return { sources, filters, periods };
    }

    // ── Formula evaluator ─────────────────────────────────────────────

    function evalFormula(formula, ctx) {
      if (!formula?.trim()) return 0;
      let expr = formula
        .replace(/<([A-Z]+)>/g, (_, code) => {
          const v = ctx[code];
          return (typeof v === "number" && isFinite(v)) ? String(v) : "0";
        })
        .replace(/;/g, ",")
        .replace(/\bSE\s*\(/gi,        "IF_(")
        .replace(/\bRESULTADO\s*\(/gi, "ID_(")
        .replace(/\bOU\s*\(/gi,        "OR_(")
        .replace(/\bE\s*\(/gi,         "AND_(" );

      if (/[^0-9\s\+\-\*\/\(\)\.\,\_A-Za-z]/.test(expr)) return 0;
      try {
        // eslint-disable-next-line no-new-func
        return new Function("IF_","AND_","OR_","ID_","ABS","ROUND",
          `"use strict"; return (${expr});`)(
          (c, t, f) => c ? t : f,
          (...a) => a.every(Boolean),
          (...a) => a.some(Boolean),
          v => v, Math.abs, Math.round
        ) || 0;
      } catch { return 0; }
    }

    // ── Matrix computation ────────────────────────────────────────────

    async function computeMatrix(cfg) {
      const { rows, cols } = cfg;
      const matrix = rows.map(() => cols.map(() => null));

      // Pass 1 — data × data cells
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        if (row.type !== "data") continue;
        for (let ci = 0; ci < cols.length; ci++) {
          const col = cols[ci];
          if (col.type !== "data") continue;
          const { sources, filters, periods } = cellPlan(row, col);
          let total = 0;
          for (const p of periods) {
            for (const src of sources) {
              const data = await fetchSourceYear(src, p.year);
              total += filterAndSum(data, filters, p);
            }
          }
          matrix[ri][ci] = total;
        }
      }

      // Pass 2 — formula rows (per column)
      for (let ri = 0; ri < rows.length; ri++) {
        if (rows[ri].type !== "formula") continue;
        for (let ci = 0; ci < cols.length; ci++) {
          if (cols[ci].type === "blank") continue;
          const ctx = {};
          rows.forEach((_, ri2) => { if (matrix[ri2][ci] !== null) ctx[letterCode(ri2)] = matrix[ri2][ci]; });
          matrix[ri][ci] = evalFormula(rows[ri].formula, ctx);
        }
      }

      // Pass 3 — formula cols (per row)
      for (let ci = 0; ci < cols.length; ci++) {
        if (cols[ci].type !== "formula") continue;
        for (let ri = 0; ri < rows.length; ri++) {
          if (rows[ri].type === "blank") continue;
          const ctx = {};
          cols.forEach((_, ci2) => { if (matrix[ri][ci2] !== null) ctx[letterCode(ci2)] = matrix[ri][ci2]; });
          matrix[ri][ci] = evalFormula(cols[ci].formula, ctx);
        }
      }

      return matrix;
    }

    // ── Drilldown ─────────────────────────────────────────────────────

    async function fetchDrillRows(sources, filters, periods) {
      const bucket = [];
      for (const p of periods) {
        for (const src of sources) {
          const data = await fetchSourceYear(src, p.year);
          filterRows(data, filters, p).forEach(r => bucket.push({ ...r, __source: src }));
        }
      }
      return bucket;
    }

    function drillKindFor(sourceId) {
      if (sourceId === "actual") return "ledger-tx";
      if (sourceId.startsWith("scenario:")) return "ledger-cc";
      const src = DATA_SOURCES.find(s => s.id === sourceId);
      if (src?.type === "headcount") return "headcount";
      return "ledger-cc"; // budget e futuros ledgers agregados (sem lançamento individual)
    }

    let _drillPopover = null;
    let _drillKeyHandler = null;
    function closeDrillPopover() {
      if (_drillPopover) { _drillPopover.remove(); _drillPopover = null; }
      if (_drillKeyHandler) { document.removeEventListener("keydown", _drillKeyHandler); _drillKeyHandler = null; }
    }

    function fmtDate(iso) {
      if (!iso) return "";
      const [y, m, d] = String(iso).split("-");
      return d && m && y ? `${d}/${m}/${y}` : String(iso);
    }

    function drillTableHtml(kind, rows) {
      const esc = (v) => v ? escapeHtml(String(v)) : "";
      const th = "padding:6px 10px;border-bottom:1px solid var(--line);font-size:11px;text-align:left;color:var(--text-faint);white-space:nowrap;position:sticky;top:0;background:var(--panel)";
      const td = "padding:5px 10px;border-bottom:1px solid var(--line);font-size:12px;white-space:nowrap";

      if (!rows.length) return `<div style="padding:20px;text-align:center;color:var(--text-faint);font-size:12px">Sem lançamentos nesse recorte.</div>`;

      if (kind === "ledger-tx") {
        const sorted = [...rows].sort((a, b) => String(b.entry_date||"").localeCompare(String(a.entry_date||"")));
        const total = sorted.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        return `<table style="border-collapse:collapse;width:100%">
          <thead><tr>
            <th style="${th}">Data</th><th style="${th}">CC</th><th style="${th}">Conta</th>
            <th style="${th}">Histórico</th><th style="${th};text-align:right">Valor</th>
          </tr></thead>
          <tbody>${sorted.map(r => `<tr>
            <td style="${td}">${esc(fmtDate(r.entry_date))}</td>
            <td style="${td}">${esc(r.cost_center_number)} ${esc(r.cc_name)}</td>
            <td style="${td}">${esc(r.account_number)} ${esc(r.account_name)}</td>
            <td style="${td};white-space:normal;max-width:260px">${esc(r.history)}</td>
            <td style="${td};text-align:right;font-variant-numeric:tabular-nums">${esc(fmtNumber(r.amount,"n2"))}</td>
          </tr>`).join("")}</tbody>
          <tfoot><tr><td colspan="4" style="${td};font-weight:600;border-top:2px solid var(--line);border-bottom:none">Total</td>
            <td style="${td};text-align:right;font-weight:600;border-top:2px solid var(--line);border-bottom:none;font-variant-numeric:tabular-nums">${esc(fmtNumber(total,"n2"))}</td></tr></tfoot>
        </table>`;
      }

      if (kind === "headcount") {
        const sorted = [...rows].sort((a, b) => String(a.colab||"").localeCompare(String(b.colab||"")));
        return `<table style="border-collapse:collapse;width:100%">
          <thead><tr><th style="${th}">Matrícula</th><th style="${th}">Nome</th><th style="${th}">Cargo</th><th style="${th}">CC</th></tr></thead>
          <tbody>${sorted.map(r => `<tr>
            <td style="${td}">${esc(r.matricula)}</td><td style="${td}">${esc(r.colab)}</td>
            <td style="${td}">${esc(r.cargo)}</td><td style="${td}">${esc(r.cost_center_number)} ${esc(r.cc_name)}</td>
          </tr>`).join("")}</tbody>
          <tfoot><tr><td colspan="3" style="${td};font-weight:600;border-top:2px solid var(--line);border-bottom:none">Total de colaboradores</td>
            <td style="${td};text-align:right;font-weight:600;border-top:2px solid var(--line);border-bottom:none">${sorted.length}</td></tr></tfoot>
        </table>`;
      }

      // ledger-cc — sem lançamento individual (budget/cenário): agrupa por CC
      const byCc = new Map();
      rows.forEach(r => {
        const key = String(r.cost_center_number || "");
        const cur = byCc.get(key) || { cc: key, name: r.cc_name || "", total: 0 };
        cur.total += Number(r.amount) || 0;
        byCc.set(key, cur);
      });
      const grouped = [...byCc.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
      const total = grouped.reduce((s, r) => s + r.total, 0);
      return `<table style="border-collapse:collapse;width:100%">
        <thead><tr><th style="${th}">Centro de custo</th><th style="${th};text-align:right">Valor</th></tr></thead>
        <tbody>${grouped.map(r => `<tr>
          <td style="${td}">${esc(r.cc)} ${esc(r.name)}</td>
          <td style="${td};text-align:right;font-variant-numeric:tabular-nums">${esc(fmtNumber(r.total,"n2"))}</td>
        </tr>`).join("")}</tbody>
        <tfoot><tr><td style="${td};font-weight:600;border-top:2px solid var(--line);border-bottom:none">Total</td>
          <td style="${td};text-align:right;font-weight:600;border-top:2px solid var(--line);border-bottom:none;font-variant-numeric:tabular-nums">${esc(fmtNumber(total,"n2"))}</td></tr></tfoot>
      </table>`;
    }

    async function openCellDrilldown(row, col) {
      closeDrillPopover();
      const { sources, filters, periods } = cellPlan(row, col);
      const kind = drillKindFor(sources[0]);

      const overlay = document.createElement("div");
      overlay.style.cssText = `position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.65);
        display:flex;align-items:center;justify-content:center;padding:16px`;
      overlay.innerHTML = `<div style="background:var(--panel);border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.6);
        width:100%;max-width:720px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line);flex-shrink:0">
          <span style="font-size:14px;font-weight:600;color:var(--text)">${escapeHtml(row.name || "")} — ${escapeHtml(col.name || "")}</span>
          <button id="vbd-x" type="button" style="font-size:20px;background:none;border:none;cursor:pointer;color:var(--text-faint);line-height:1;padding:0 4px">&times;</button>
        </div>
        <div id="vbd-body" style="flex:1;overflow:auto"><div style="padding:20px;text-align:center;color:var(--text-faint);font-size:12px">Carregando...</div></div>
      </div>`;
      document.body.appendChild(overlay);
      _drillPopover = overlay;
      overlay.querySelector("#vbd-x").addEventListener("click", closeDrillPopover);
      overlay.addEventListener("click", e => { if (e.target === overlay) closeDrillPopover(); });
      _drillKeyHandler = e => { if (e.key === "Escape") closeDrillPopover(); };
      document.addEventListener("keydown", _drillKeyHandler);

      try {
        const rows = await fetchDrillRows(sources, filters, periods);
        if (_drillPopover !== overlay) return; // fechado antes de terminar o fetch
        overlay.querySelector("#vbd-body").innerHTML = drillTableHtml(kind, rows);
      } catch (err) {
        if (_drillPopover !== overlay) return;
        overlay.querySelector("#vbd-body").innerHTML =
          `<div style="padding:20px;color:var(--neg);font-size:12px">Erro ao buscar detalhe: ${escapeHtml(err.message)}</div>`;
      }
    }

    // ── Formatter ─────────────────────────────────────────────────────

    function fmtNumber(v, fmt, opts) {
      if (v === null || v === undefined) return "";
      const n = Number(v);
      if (!isFinite(n)) return "";
      const neg = n < 0;
      const abs = Math.abs(n);
      // Normalize legacy format names
      const f = { number:"n0", pct:"p1", pct1:"q1" }[fmt] || fmt || "n0";
      let s;
      if (f.startsWith("n")) {
        const dec = Number(f[1]) || 0;
        s = abs.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
      } else if (f.startsWith("p")) {
        const dec = Number(f[1]) || 0;
        s = (abs * 100).toFixed(dec).replace(".", ",") + "%";
      } else if (f.startsWith("q")) {
        const dec = Number(f[1]) || 0;
        s = abs.toFixed(dec).replace(".", ",") + "%";
      } else {
        s = abs.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      }
      if (opts?.negativeParens && neg) return `(${s})`;
      return neg ? `-${s}` : s;
    }

    // ── Report renderer ───────────────────────────────────────────────

    async function renderReportTable(container, cfg) {
      container.innerHTML = `<span style="font-size:12px;color:var(--text-faint)">Calculando...</span>`;
      try {
        const matrix = await computeMatrix(cfg);
        const { rows, cols, options } = cfg;
        const H = "padding:5px 12px;border-bottom:2px solid var(--line);font-size:11px;white-space:nowrap;background:var(--panel-hover)";
        const D = "padding:5px 12px;border-bottom:1px solid var(--line);white-space:nowrap";

        const visCols = cols.map((c, i) => i).filter(i => !cols[i].hidden);
        const visRows = rows.map((r, i) => i).filter(ri => {
          if (rows[ri].type === "blank") return true;
          if (!options?.hideZeroRows) return true;
          return visCols.some(ci => (matrix[ri][ci] || 0) !== 0);
        });
        const visFinalCols = visCols.filter(ci => {
          if (cols[ci].type === "blank") return true;
          if (!options?.hideZeroCols) return true;
          return visRows.some(ri => rows[ri].type !== "blank" && (matrix[ri][ci] || 0) !== 0);
        });

        if (!visRows.length) {
          container.innerHTML = `<span style="font-size:12px;color:var(--text-faint)">Sem dados.</span>`;
          return;
        }

        const esc = (v) => v ? escapeHtml(String(v)) : "";
        let html = `<div class="reports-table-wrap" style="overflow-x:auto"><table style="border-collapse:collapse;font-size:12px;width:100%"><thead><tr>`;
        const rlw = options?.rowLabelWidth || 200;
        html += `<th style="${H};text-align:left;font-weight:400;color:var(--text-faint);min-width:${rlw}px;width:${rlw}px"></th>`;
        for (const ci of visFinalCols) {
          const c = cols[ci];
          const colW = c.width || (c.type === "blank" ? 18 : 120);
          if (c.type === "blank") { html += `<th style="${H};width:${colW}px;min-width:${colW}px"></th>`; continue; }
          const hs = c.headerStyle || {};
          const hFontSize = FONT_SIZES[hs.fontSize || "md"] || 13;
          html += `<th style="${H};border-left:1px solid var(--line);text-align:${hs.align||"right"};
            font-weight:${hs.bold?"600":"500"};font-style:${hs.italic?"italic":"normal"};
            font-size:${hFontSize}px;width:${colW}px;min-width:${colW}px;
            color:${esc(hs.color)||"var(--text-soft)"};background:${esc(hs.bg)||"var(--panel-hover)"}">${esc(c.name)}</th>`;
        }
        html += `</tr></thead><tbody>`;

        for (const ri of visRows) {
          const r = rows[ri];
          if (r.type === "blank") {
            const h = { sm: "6", md: "14", lg: "22" }[r.style?.height] || "6";
            html += `<tr><td colspan="${visFinalCols.length + 1}"
              style="padding:${h}px 0;border-bottom:1px solid var(--line);background:${esc(r.style?.bg)||"transparent"}"></td></tr>`;
            continue;
          }
          const rs = r.style || {};
          const rowH      = rs.height > 0 ? `height:${rs.height}px;` : "";
          const valign    = rs.verticalAlign || "middle";
          const rowFontSz = FONT_SIZES[rs.fontSize || "md"] || 13;
          html += `<tr style="${rowH}">`;
          html += `<td style="${D};background:${esc(rs.bg)||"transparent"};color:${esc(rs.color)||"var(--text)"};
            font-weight:${rs.bold?"600":"400"};font-style:${rs.italic?"italic":"normal"};font-size:${rowFontSz}px;vertical-align:${valign};
            ${rs.underline?"text-decoration:underline;":""}padding-left:${rs.indent?`${(rs.indent||0)*16+12}px`:"12px"}">${esc(r.name)}</td>`;
          for (const ci of visFinalCols) {
            const c = cols[ci];
            const cW = c.width || (c.type === "blank" ? 18 : 120);
            if (c.type === "blank") { html += `<td style="border-left:1px solid var(--line);${D};background:var(--panel-hover);width:${cW}px;min-width:${cW}px"></td>`; continue; }
            const cs = c.cellStyle || {};
            // Hierarchy: row style is base; column cellStyle overrides when explicitly set
            const cellBold     = cs.bold   || rs.bold;
            const cellItalic   = cs.italic || rs.italic;
            const cellColor    = esc(cs.color) || esc(rs.color) || "var(--text)";
            const cellBg       = esc(cs.bg)    || esc(rs.bg)    || "transparent";
            const cellAlign    = cs.align  || "right";
            const cellFontSize = FONT_SIZES[cs.fontSize || rs.fontSize || "md"] || 13;
            const v      = matrix[ri][ci] ?? 0;
            const negRed = options?.negativeRed && v < 0;
            const effectiveFmt = c.numberFmt || r.numberFmt || "n0";
            const fmtd   = fmtNumber(v, effectiveFmt, options);
            const drillable = options?.enableDrilldown && r.type === "data" && c.type === "data";
            html += `<td ${drillable ? `class="vb-drill-td" data-ri="${ri}" data-ci="${ci}" title="Clique para ver o detalhe"` : ""}
              style="${D};border-left:1px solid var(--line);text-align:${cellAlign};
              font-variant-numeric:tabular-nums;vertical-align:${valign};font-size:${cellFontSize}px;
              background:${cellBg};
              color:${negRed ? "var(--neg)" : cellColor};
              font-weight:${cellBold ? "600" : "400"};
              font-style:${cellItalic ? "italic" : "normal"}${drillable ? ";cursor:pointer;text-decoration:underline dotted" : ""}">${esc(fmtd)}</td>`;
          }
          html += `</tr>`;
        }
        html += `</tbody></table></div>`;
        container.innerHTML = html;
        const wrap = container.querySelector(".reports-table-wrap");
        if (wrap && initFloatingScrollbar) initFloatingScrollbar(wrap);
        container.querySelectorAll(".vb-drill-td").forEach(td => {
          td.addEventListener("click", () => openCellDrilldown(rows[Number(td.dataset.ri)], cols[Number(td.dataset.ci)]));
        });
      } catch (err) {
        container.innerHTML = `<span style="font-size:12px;color:var(--neg)">${escapeHtml("Erro: " + err.message)}</span>`;
      }
    }

    // ── DB ────────────────────────────────────────────────────────────

    async function loadCustomReports() {
      if (!isSupabaseConfigured()) return [];
      const orgId = await resolveOrganizationId();
      if (!orgId) return [];
      _savedReports = (await fetchSupabaseRowsSafe("custom_reports",
        `organization_id=eq.${orgId}&order=created_at.asc&select=id,label,config,created_by`)) || [];
      return _savedReports;
    }

    async function saveReport(cfg, id) {
      const orgId = await resolveOrganizationId();
      const user  = getCurrentUser();
      const base  = `${supabaseApiUrl}/rest/v1/custom_reports`;
      if (id) {
        const res = await authenticatedFetch(`${base}?id=eq.${id}`, {
          method: "PATCH", headers: { Prefer: "return=representation" },
          body: JSON.stringify({ label: cfg.label, config: cfg }),
        });
        if (!res.ok) throw new Error(await res.text());
        return id;
      }
      const res = await authenticatedFetch(base, {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ organization_id: orgId, created_by: user?.id, label: cfg.label, config: cfg }),
      });
      if (!res.ok) throw new Error(await res.text());
      const [row] = await res.json();
      return row.id;
    }

    async function deleteReport(id) {
      const res = await authenticatedFetch(`${supabaseApiUrl}/rest/v1/custom_reports?id=eq.${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    }

    // ── Catalog ───────────────────────────────────────────────────────

    function canSeeReport(cfg) {
      const { managements = [], ccNumbers = [] } = cfg?.access || {};
      if (!managements.length && !ccNumbers.length) return true;
      if (isAdmin()) return true;
      if (getAllowedCcNumbers() === null) return true; // sem gestão/extras: igual admin
      const userMgmt  = (state.costCenters || []).find(c => getAllowedCcNumbers()?.has(String(c.number)))?.management || "";
      const allowedCc = getAllowedCcNumbers();
      if (managements.includes(userMgmt)) return true;
      if (allowedCc && ccNumbers.some(cc => allowedCc.has(cc))) return true;
      return false;
    }

    function injectCatalogCards() {
      const grid = document.querySelector("#reports-card-grid");
      if (!grid) return;
      grid.querySelectorAll("[data-custom-report]").forEach(el => el.remove());

      _savedReports.forEach(report => {
        const cfg    = report.config || {};
        const cardId = "custom_" + report.id;
        if (!canSeeReport(cfg)) return;
        getReportTitles()[cardId] = report.label;

        const cardColor = cfg.color || "#4f7cff";
        const cardRgb   = hexToRgb(cardColor);
        const cardIcon  = cfg.icon  || "document";

        const card = document.createElement("div");
        card.className = "reports-report-card";
        card.dataset.reportId     = cardId;
        card.dataset.customReport = "true";
        card.style.cssText = `position:relative;border-top-color:${cardColor}`;
        card.innerHTML = `
          <div class="rrc-top"><span class="rrc-icon-wrap"
            style="background:rgba(${cardRgb},.12);border-color:rgba(${cardRgb},.22);color:${cardColor}">
            ${cardIconSvg(cardIcon)}
          </span></div>
          <strong class="rrc-label">${escapeHtml(report.label)}</strong>
          <span class="rrc-subtitle">Relatório personalizado</span>
          ${isAdmin() ? `<button class="vb-opts-btn fc-card-menu-btn" data-id="${report.id}" type="button" title="Opções"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>` : ""}`;

        card.addEventListener("click", e => {
          if (e.target.closest(".vb-opts-btn")) return;
          setSelectedReportId(cardId);
          renderReportsView();
        });

        card.querySelector(".vb-opts-btn")?.addEventListener("click", e => {
          e.stopPropagation();
          showCardMenu(e.currentTarget, report.id);
        });

        grid.appendChild(card);
      });
    }

    function showCardMenu(btn, reportId) {
      if (_activeMenu) { _activeMenu.remove(); _activeMenu = null; }
      const menu = document.createElement("div");
      menu.style.cssText = `position:fixed;z-index:9999;background:var(--panel);border:1px solid var(--line);
        border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.5);padding:4px;min-width:140px`;
      const rect = btn.getBoundingClientRect();
      menu.style.top  = (rect.bottom + 4) + "px";
      menu.style.left = Math.max(8, rect.right - 140) + "px";

      const items = [
        { label: "Editar",  fn: () => openReportInBuilder(reportId) },
        { label: "Copiar",  fn: () => copyAndReload(reportId) },
        { label: "Remover", fn: () => removeAndReload(reportId), danger: true },
      ];
      items.forEach(({ label, fn, danger }) => {
        const btn2 = document.createElement("button");
        btn2.type = "button";
        btn2.textContent = label;
        btn2.style.cssText = `display:block;width:100%;text-align:left;padding:7px 12px;
          background:none;border:none;cursor:pointer;border-radius:7px;font-size:13px;
          color:${danger ? "var(--neg)" : "var(--text)"}`;
        btn2.onmouseenter = () => { btn2.style.background = "var(--panel-hover)"; };
        btn2.onmouseleave = () => { btn2.style.background = ""; };
        btn2.addEventListener("click", () => { menu.remove(); _activeMenu = null; fn(); });
        menu.appendChild(btn2);
      });

      document.body.appendChild(menu);
      _activeMenu = menu;
      setTimeout(() => {
        const close = e => { if (!menu.contains(e.target)) { menu.remove(); _activeMenu = null; document.removeEventListener("click", close); } };
        document.addEventListener("click", close);
      }, 0);
    }

    function openReportInBuilder(reportId) {
      const r = _savedReports.find(x => x.id === reportId || x.id === Number(reportId));
      if (!r) return;
      _cfg       = JSON.parse(JSON.stringify(r.config || blankConfig()));
      _cfg.label = r.label;
      _editingId = r.id;
      _sourceCache.clear();
      // Always go through renderReportsView so the detail panel is shown and _currentPanel is set
      _pendingEditId = r.id;
      setSelectedReportId(`custom_${r.id}`);
      renderReportsView();
    }

    async function copyAndReload(reportId) {
      const r = _savedReports.find(x => x.id === reportId || x.id === Number(reportId));
      if (!r) return;
      try {
        const cfg = { ...JSON.parse(JSON.stringify(r.config || blankConfig())), label: r.label + " (cópia)" };
        await saveReport(cfg, null);
        await loadCustomReports();
        injectCatalogCards();
        onCatalogChanged?.();
      } catch (e) { alert("Erro ao copiar: " + e.message); }
    }

    async function removeAndReload(reportId) {
      const r = _savedReports.find(x => x.id === reportId || x.id === Number(reportId));
      if (!confirm(`Remover "${r?.label || "este relatório"}"?`)) return;
      try {
        await deleteReport(reportId);
        await loadCustomReports();
        injectCatalogCards();
        onCatalogChanged?.();
        setSelectedReportId(null);
        renderReportsView();
      } catch (e) { alert("Erro ao remover: " + e.message); }
    }

    // ── Builder shell ─────────────────────────────────────────────────

    function renderBuilderInPanel(panel) {
      _currentPanel = panel;
      _activeTab    = "details";
      panel.innerHTML = `
        <div id="vb-root" style="display:flex;flex-direction:column;height:100%;overflow:hidden">
          <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;
            border-bottom:1px solid var(--line);flex-shrink:0;flex-wrap:wrap">
            <input id="vb-title" type="text" value="${escapeHtml(_cfg.label)}" placeholder="Nome do relatório"
              style="flex:1;min-width:160px;font-size:15px;font-weight:600;background:transparent;
              border:none;border-bottom:1px solid var(--line);padding:2px 0;color:var(--text);outline:none">
            <button id="vb-cancel" type="button"
              style="font-size:12px;padding:5px 12px;border:1px solid var(--line);
              border-radius:8px;background:none;color:var(--text-soft);cursor:pointer">Cancelar</button>
            <button id="vb-save" type="button"
              style="font-size:12px;padding:5px 14px;background:var(--blue-soft);color:var(--blue);
              border:1px solid rgba(79,124,255,.4);border-radius:8px;cursor:pointer;font-weight:500">Salvar</button>
          </div>
          <div style="display:flex;border-bottom:1px solid var(--line);flex-shrink:0;padding:0 16px">
            ${["details:Detalhes","report:Relatório","access:Acessos"].map(s => {
              const [id, lbl] = s.split(":");
              return `<button class="vb-tab" data-tab="${id}" type="button"
                style="padding:10px 16px;font-size:13px;background:none;border:none;
                border-bottom:2px solid ${id==="details"?"var(--blue)":"transparent"};
                color:${id==="details"?"var(--blue)":"var(--text-faint)"};cursor:pointer;margin-bottom:-1px">
                ${escapeHtml(lbl)}</button>`;
            }).join("")}
          </div>
          <div id="vb-body" style="flex:1;overflow-y:auto;padding:16px">${renderDetailsBody()}</div>
        </div>`;

      panel.querySelector("#vb-title").addEventListener("input", e => { _cfg.label = e.target.value; });
      panel.querySelector("#vb-cancel").addEventListener("click", () => { setSelectedReportId(null); renderReportsView(); });
      panel.querySelector("#vb-save").addEventListener("click", () => doSave(panel));
      panel.querySelectorAll(".vb-tab").forEach(btn => btn.addEventListener("click", () => switchTab(panel, btn.dataset.tab)));
      wireDetailsBody(panel);
    }

    function switchTab(panel, tab) {
      collectCurrent(panel);
      _activeTab = tab;
      const body = panel.querySelector("#vb-body");
      if (!body) return;
      body.innerHTML =
        tab === "details" ? renderDetailsBody() :
        tab === "report"  ? renderReportBody()  : renderAccessBody();
      panel.querySelectorAll(".vb-tab").forEach(b => {
        const a = b.dataset.tab === tab;
        b.style.borderBottomColor = a ? "var(--blue)" : "transparent";
        b.style.color = a ? "var(--blue)" : "var(--text-faint)";
      });
      if (tab === "details") wireDetailsBody(panel);
      if (tab === "report")  wireReportBody(panel);
      if (tab === "access")  wireAccessBody(panel);
      if (tab === "report" && _cfg.options?.showDataInEditor && _cfg.rows.length && _cfg.cols.length) scheduleGridData(panel);
    }

    // ── Details tab ───────────────────────────────────────────────────

    function renderDetailsBody() {
      const o    = _cfg.options || {};
      const icon = _cfg.icon  || "document";
      const col  = _cfg.color || "#4f7cff";

      const iconSwatches = Object.keys(CARD_ICONS).map(k => {
        const sel = k === icon;
        return `<button type="button" class="det-icon-sw" data-icon="${k}" title="${k}"
          style="width:38px;height:38px;border-radius:10px;border:2px solid ${sel?"var(--blue)":"var(--line)"};
          background:${sel?"var(--blue-soft)":"var(--panel-hover)"};cursor:pointer;
          display:inline-flex;align-items:center;justify-content:center;
          color:${sel?"var(--blue)":"var(--text-soft)"}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
            stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px">
            ${CARD_ICONS[k]}
          </svg>
        </button>`;
      }).join("");

      const colorSwatches = CARD_COLORS.map(c => {
        const sel = c.hex === col;
        return `<button type="button" class="det-color-sw" data-color="${c.hex}" title="${c.label}"
          style="width:26px;height:26px;border-radius:50%;background:${c.hex};border:3px solid ${sel?"#fff":"transparent"};
          outline:2px solid ${sel?c.hex:"transparent"};cursor:pointer;flex-shrink:0"></button>`;
      }).join("");

      return `<div style="display:flex;flex-direction:column;gap:16px;max-width:520px">
        <input type="hidden" id="det-icon"  value="${escapeHtml(icon)}">
        <input type="hidden" id="det-color" value="${escapeHtml(col)}">
        <div>
          <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">Nome</label>
          <input id="det-name" type="text" value="${escapeHtml(_cfg.label)}" placeholder="Nome do relatório"
            style="width:100%;font-size:14px;padding:7px 10px">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">Descrição</label>
          <textarea id="det-desc" rows="2" style="width:100%;font-size:13px;padding:7px 10px;resize:vertical"
            placeholder="Descrição opcional">${escapeHtml(_cfg.description || "")}</textarea>
        </div>
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <div>
            <div style="font-size:11px;color:var(--text-faint);margin-bottom:8px">Ícone do card</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;max-width:260px">${iconSwatches}</div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-faint);margin-bottom:8px">Cor do card</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">${colorSwatches}</div>
          </div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-faint);margin-bottom:8px">Opções de exibição</div>
          ${[["showDataInEditor","Exibir dados na edição do relatório"],
             ["hideZeroRows","Ocultar linhas zeradas"],["hideZeroCols","Ocultar colunas zeradas"],
             ["negativeRed","Negativos em vermelho"],["negativeParens","Negativos entre parênteses"],
             ["enableDrilldown","Habilitar drilldown nas células (clique mostra o detalhe)"]]
            .map(([k,lbl]) => `<label style="display:flex;align-items:center;gap:8px;font-size:13px;
              color:var(--text-soft);margin-bottom:6px;cursor:pointer">
              <input type="checkbox" class="det-opt" data-key="${k}" ${o[k]?"checked":""}
                style="width:14px;height:14px;accent-color:var(--blue)">
              ${escapeHtml(lbl)}</label>`).join("")}
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
            <label style="font-size:13px;color:var(--text-soft);white-space:nowrap">Largura da coluna de linhas</label>
            <input id="det-row-width" type="number" min="80" max="600" step="10"
              value="${o.rowLabelWidth || 200}"
              style="width:70px;font-size:13px;padding:4px 7px">
            <span style="font-size:12px;color:var(--text-faint)">px</span>
          </div>
        </div>
      </div>`;
    }

    function wireDetailsBody(panel) {
      const body = panel.querySelector("#vb-body");
      if (!body) return;
      body.querySelectorAll(".det-icon-sw").forEach(sw => {
        sw.addEventListener("click", () => {
          body.querySelectorAll(".det-icon-sw").forEach(s => {
            s.style.border = "2px solid var(--line)";
            s.style.background = "var(--panel-hover)";
            s.style.color = "var(--text-soft)";
          });
          sw.style.border = "2px solid var(--blue)";
          sw.style.background = "var(--blue-soft)";
          sw.style.color = "var(--blue)";
          const h = body.querySelector("#det-icon");
          if (h) h.value = sw.dataset.icon;
        });
      });
      body.querySelectorAll(".det-color-sw").forEach(sw => {
        sw.addEventListener("click", () => {
          body.querySelectorAll(".det-color-sw").forEach(s => {
            s.style.border = "3px solid transparent";
            s.style.outline = "2px solid transparent";
          });
          sw.style.border = "3px solid #fff";
          sw.style.outline = `2px solid ${sw.dataset.color}`;
          const h = body.querySelector("#det-color");
          if (h) h.value = sw.dataset.color;
        });
      });
    }

    // ── Report tab ────────────────────────────────────────────────────

    function renderReportBody() {
      const rows = _cfg.rows;
      const cols = _cfg.cols;

      const colHdrs = cols.map((c, ci) => {
        const code = letterCode(ci);
        const w    = c.width || (c.type === "blank" ? 30 : 120);
        const periodLabel = c.type !== "data" ? "" :
          c.accumulate && c.periodFrom && c.periodTo
            ? `<div style="font-size:9px;color:var(--cyan);margin-top:1px;white-space:nowrap">${escapeHtml((MONTH_LABELS[c.periodFrom.month-1]||"").slice(0,3))}/${c.periodFrom.year}–${escapeHtml((MONTH_LABELS[c.periodTo.month-1]||"").slice(0,3))}/${c.periodTo.year}</div>`
            : c.period?.month && c.period?.year
            ? `<div style="font-size:9px;color:var(--blue);margin-top:1px">${escapeHtml((MONTH_LABELS[c.period.month-1]||"").slice(0,3))}/${c.period.year}</div>`
            : "";
        return `<th class="vb-col-hdr" data-idx="${ci}" draggable="true"
          style="width:${w}px;min-width:${w}px;padding:6px 8px;border:1px solid var(--line);
          background:var(--panel-hover);cursor:pointer;vertical-align:top;user-select:none">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:2px;min-width:0">
            <div style="flex:1;overflow:hidden;min-width:0">
              <div style="font-size:9px;font-weight:700;color:var(--cyan)">${escapeHtml(code)}</div>
              <div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(c.name || "(vazio)")}</div>
              ${periodLabel}
            </div>
            <button class="vb-del-col" data-idx="${ci}" type="button"
              style="font-size:13px;background:none;border:none;cursor:pointer;color:var(--neg);
              padding:0;flex-shrink:0;line-height:1;opacity:0;transition:opacity .15s">&times;</button>
          </div>
        </th>`;
      }).join("");

      const rowsHtml = rows.map((r, ri) => {
        const code    = letterCode(ri);
        const isBlank = r.type === "blank";
        const cellsHtml = cols.map((c, ci) => {
          const align = c.cellStyle?.align || "right";
          return `<td class="vb-cell" data-ri="${ri}" data-ci="${ci}"
            style="padding:4px 8px;border:1px solid var(--line);text-align:${align};
            font-size:12px;background:${isBlank ? "var(--panel-hover)" : "transparent"};white-space:nowrap">
            <span class="vb-cell-val" style="color:var(--text-faint)"></span>
          </td>`;
        }).join("");

        return `<tr class="vb-grid-row" data-idx="${ri}">
          <td class="vb-row-hdr" data-idx="${ri}"
            style="padding:5px 10px;border:1px solid var(--line);
            background:${isBlank ? "var(--panel-hover)" : "var(--panel)"};cursor:pointer;
            position:sticky;left:0;z-index:1;min-width:${_cfg.options?.rowLabelWidth||200}px;max-width:${_cfg.options?.rowLabelWidth||200}px;width:${_cfg.options?.rowLabelWidth||200}px">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="vb-drag-handle" style="font-size:10px;color:var(--text-faint);cursor:grab;flex-shrink:0">⠿⠿</span>
              <span style="font-size:9px;font-weight:700;color:var(--blue);min-width:14px;flex-shrink:0">${escapeHtml(code)}</span>
              <span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                font-weight:${r.style?.bold ? "600" : "400"};font-style:${r.style?.italic ? "italic" : "normal"};
                color:${isBlank ? "var(--text-faint)" : "var(--text)"}">
                ${escapeHtml(r.name || "(vazio)")}
              </span>
              <button class="vb-del-row" data-idx="${ri}" type="button"
                style="font-size:13px;background:none;border:none;cursor:pointer;color:var(--neg);
                padding:0;flex-shrink:0;line-height:1;opacity:0;transition:opacity .15s">&times;</button>
            </div>
          </td>
          ${cellsHtml}
        </tr>`;
      }).join("");

      return `
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button id="vb-add-row" type="button"
            style="font-size:12px;padding:5px 12px;background:var(--blue-soft);color:var(--blue);
            border:1px solid rgba(79,124,255,.4);border-radius:7px;cursor:pointer">+ Nova linha</button>
          <button id="vb-add-col" type="button"
            style="font-size:12px;padding:5px 12px;background:rgba(20,184,166,.12);color:var(--cyan);
            border:1px solid rgba(20,184,166,.4);border-radius:7px;cursor:pointer">+ Nova coluna</button>
        </div>
        <div style="position:relative">
          <div id="vb-grid-scroll" style="overflow-x:auto">
            <table id="vb-grid-table" style="border-collapse:collapse;font-size:12px">
              <thead>
                <tr>
                  <th style="width:${_cfg.options?.rowLabelWidth||200}px;min-width:${_cfg.options?.rowLabelWidth||200}px;padding:0;border:1px solid var(--line);
                    background:var(--panel-hover);position:sticky;left:0;z-index:2"></th>
                  ${colHdrs}
                </tr>
              </thead>
              <tbody id="vb-grid-body">
                ${rowsHtml || `<tr><td colspan="${cols.length + 1}"
                  style="padding:24px;text-align:center;color:var(--text-faint);font-size:12px;border:1px solid var(--line)">
                  Nenhuma linha. Clique em "+ Nova linha" para começar.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div id="vb-hscroll-bar" style="overflow-x:auto;overflow-y:hidden;height:10px;margin-top:3px">
            <div id="vb-hscroll-inner" style="height:1px"></div>
          </div>
        </div>`;
    }

    function wireReportBody(panel) {
      panel.querySelector("#vb-add-row")?.addEventListener("click", () => openRowModal(panel, null));
      panel.querySelector("#vb-add-col")?.addEventListener("click", () => openColModal(panel, null));

      // Column headers: click = edit, hover = show × button
      panel.querySelectorAll(".vb-col-hdr").forEach(th => {
        th.addEventListener("click", e => {
          if (e.target.closest(".vb-del-col")) return;
          openColModal(panel, Number(th.dataset.idx));
        });
        th.addEventListener("mouseenter", () => { const d = th.querySelector(".vb-del-col"); if (d) d.style.opacity = "1"; });
        th.addEventListener("mouseleave", () => { const d = th.querySelector(".vb-del-col"); if (d) d.style.opacity = "0"; });
      });

      // Row headers: click = edit, row hover = show × button
      panel.querySelectorAll(".vb-row-hdr").forEach(td => {
        td.addEventListener("click", e => {
          if (e.target.closest(".vb-del-row")) return;
          openRowModal(panel, Number(td.dataset.idx));
        });
        const tr = td.closest("tr");
        tr?.addEventListener("mouseenter", () => { const d = td.querySelector(".vb-del-row"); if (d) d.style.opacity = "1"; });
        tr?.addEventListener("mouseleave", () => { const d = td.querySelector(".vb-del-row"); if (d) d.style.opacity = "0"; });
      });

      // Delete buttons
      panel.querySelectorAll(".vb-del-col").forEach(b => {
        b.addEventListener("click", e => { e.stopPropagation(); _cfg.cols.splice(Number(b.dataset.idx), 1); refreshReport(panel); });
      });
      panel.querySelectorAll(".vb-del-row").forEach(b => {
        b.addEventListener("click", e => { e.stopPropagation(); _cfg.rows.splice(Number(b.dataset.idx), 1); refreshReport(panel); });
      });

      // Drag to reorder rows
      const tbody = panel.querySelector("#vb-grid-body");
      if (tbody) {
        let srcRow = null;
        tbody.querySelectorAll(".vb-grid-row").forEach(tr => {
          tr.setAttribute("draggable", "true");
          tr.addEventListener("dragstart", e => {
            srcRow = tr; e.dataTransfer.effectAllowed = "move";
            setTimeout(() => { if (srcRow) srcRow.style.opacity = "0.4"; }, 0);
          });
          tr.addEventListener("dragend", () => {
            if (srcRow) srcRow.style.opacity = ""; srcRow = null;
            const newOrder = [...tbody.querySelectorAll(".vb-grid-row")].map(el => Number(el.dataset.idx));
            const copy = newOrder.map(i => _cfg.rows[i]);
            _cfg.rows.splice(0, _cfg.rows.length, ...copy);
            refreshReport(panel);
          });
          tr.addEventListener("dragover", e => {
            e.preventDefault();
            if (!srcRow || srcRow === tr) return;
            const rect = tr.getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) tbody.insertBefore(srcRow, tr); else tr.after(srcRow);
          });
        });
      }

      // Drag to reorder columns
      const thead = panel.querySelector("#vb-grid-table thead tr");
      if (thead) {
        let srcCol = null;
        thead.querySelectorAll(".vb-col-hdr").forEach(th => {
          th.addEventListener("dragstart", e => {
            srcCol = th; e.dataTransfer.effectAllowed = "move";
            setTimeout(() => { if (srcCol) srcCol.style.opacity = "0.5"; }, 0);
          });
          th.addEventListener("dragend", () => {
            if (srcCol) srcCol.style.opacity = ""; srcCol = null;
            const newOrder = [...thead.querySelectorAll(".vb-col-hdr")].map(el => Number(el.dataset.idx));
            const copy = newOrder.map(i => _cfg.cols[i]);
            _cfg.cols.splice(0, _cfg.cols.length, ...copy);
            refreshReport(panel);
          });
          th.addEventListener("dragover", e => {
            e.preventDefault();
            if (!srcCol || srcCol === th) return;
            const r = th.getBoundingClientRect();
            if (e.clientX < r.left + r.width / 2) thead.insertBefore(srcCol, th); else th.after(srcCol);
          });
        });
      }

      // Sync floating horizontal scrollbar
      const scrollEl = panel.querySelector("#vb-grid-scroll");
      const barEl    = panel.querySelector("#vb-hscroll-bar");
      const innerEl  = panel.querySelector("#vb-hscroll-inner");
      const tableEl  = panel.querySelector("#vb-grid-table");
      if (scrollEl && barEl && innerEl && tableEl) {
        const syncWidth = () => { innerEl.style.width = tableEl.scrollWidth + "px"; };
        syncWidth();
        if (typeof ResizeObserver !== "undefined") new ResizeObserver(syncWidth).observe(tableEl);
        let syncingBar = false, syncingGrid = false;
        scrollEl.addEventListener("scroll", () => { if (!syncingGrid) { syncingBar = true; barEl.scrollLeft = scrollEl.scrollLeft; syncingBar = false; } });
        barEl.addEventListener("scroll",    () => { if (!syncingBar)  { syncingGrid = true; scrollEl.scrollLeft = barEl.scrollLeft; syncingGrid = false; } });
      }

      // Load cell values if option is on
      if (_cfg.options?.showDataInEditor && _cfg.rows.length && _cfg.cols.length) {
        scheduleGridData(panel);
      }
    }

    function refreshReport(panel) {
      if (_activeTab !== "report") return;
      const body = panel.querySelector("#vb-body");
      if (!body) return;
      body.innerHTML = renderReportBody();
      wireReportBody(panel);
    }

    function scheduleGridData(panel) {
      clearTimeout(_previewTimer);
      _previewTimer = setTimeout(async () => {
        if (_activeTab !== "report") return;
        panel.querySelectorAll(".vb-cell-val").forEach(s => { s.style.color = "var(--text-faint)"; s.textContent = "…"; });
        try {
          const matrix = await computeMatrix(_cfg);
          const { rows, cols, options } = _cfg;
          panel.querySelectorAll(".vb-cell").forEach(td => {
            const ri   = Number(td.dataset.ri);
            const ci   = Number(td.dataset.ci);
            const span = td.querySelector(".vb-cell-val");
            if (!span) return;
            if (!rows[ri] || rows[ri].type === "blank") { span.textContent = ""; return; }
            const val = matrix[ri]?.[ci] ?? null;
            if (val === null) { span.textContent = ""; return; }
            const col  = cols[ci];
            const effectiveFmt = col?.numberFmt || rows[ri]?.numberFmt || "n0";
            const fmtd = fmtNumber(val, effectiveFmt, options);
            span.textContent = fmtd;
            span.style.color = (options?.negativeRed && val < 0) ? "var(--neg)" : "var(--text)";
            span.style.fontVariantNumeric = "tabular-nums";
          });
        } catch (err) { console.error("[VB] grid data error", err); }
      }, 600);
    }

    // ── Access tab ────────────────────────────────────────────────────

    function renderAccessBody() {
      const allMgmts = [...new Set((state.costCenters || []).map(c => c.management).filter(Boolean))].sort();
      const selMgmts = new Set(_cfg.access?.managements || []);
      const allCcs   = [...(state.costCenters || [])].sort((a, b) => String(a.number).localeCompare(String(b.number)));
      const selCcs   = new Set(_cfg.access?.ccNumbers || []);

      return `<div style="max-width:640px">
        <div style="font-size:12px;color:var(--text-faint);margin-bottom:14px">
          Deixe ambas as seções vazias para o relatório ser visível a todos os usuários.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <div style="font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;
              color:var(--text-faint);margin-bottom:8px">Gestão</div>
            <div style="display:flex;flex-direction:column;gap:5px;max-height:300px;overflow-y:auto">
              ${allMgmts.map(m => `<label style="display:flex;align-items:center;gap:8px;font-size:13px;
                color:var(--text-soft);cursor:pointer">
                <input type="checkbox" class="acc-mgmt" data-val="${escapeHtml(m)}" ${selMgmts.has(m)?"checked":""}
                  style="width:14px;height:14px;accent-color:var(--blue)">
                ${escapeHtml(m)}</label>`).join("") ||
                `<span style="font-size:12px;color:var(--text-faint)">Nenhuma gestão cadastrada.</span>`}
            </div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;
              color:var(--text-faint);margin-bottom:8px">Centro de Custo</div>
            <input id="acc-cc-search" type="text" placeholder="Buscar CC..."
              style="font-size:12px;padding:5px 8px;width:100%;margin-bottom:6px">
            <div id="acc-cc-list" style="display:flex;flex-direction:column;gap:5px;max-height:280px;overflow-y:auto">
              ${allCcs.map(cc => `<label class="acc-cc-lbl" style="display:flex;align-items:center;gap:8px;font-size:12px;
                color:var(--text-soft);cursor:pointer">
                <input type="checkbox" class="acc-cc" data-val="${escapeHtml(String(cc.number))}"
                  ${selCcs.has(String(cc.number))?"checked":""}
                  style="width:13px;height:13px;accent-color:var(--blue)">
                ${escapeHtml(cc.number)} — ${escapeHtml(cc.name || "")}</label>`).join("") ||
                `<span style="font-size:12px;color:var(--text-faint)">Nenhum CC cadastrado.</span>`}
            </div>
          </div>
        </div>
      </div>`;
    }

    function wireAccessBody(panel) {
      panel.querySelector("#acc-cc-search")?.addEventListener("input", e => {
        const q = e.target.value.toLowerCase();
        panel.querySelectorAll(".acc-cc-lbl").forEach(lbl => {
          lbl.style.display = !q || lbl.textContent.toLowerCase().includes(q) ? "" : "none";
        });
      });
    }

    // ── Collect form state ────────────────────────────────────────────

    function collectCurrent(panel) {
      const g = id => panel.querySelector(id);
      if (g("#det-name"))  _cfg.label       = g("#det-name").value;
      if (g("#det-desc"))  _cfg.description = g("#det-desc").value;
      if (g("#det-icon"))  _cfg.icon        = g("#det-icon").value  || "document";
      if (g("#det-color")) _cfg.color       = g("#det-color").value || "#4f7cff";
      panel.querySelectorAll(".det-opt").forEach(c => {
        _cfg.options = _cfg.options || {};
        _cfg.options[c.dataset.key] = c.checked;
      });
      const rwEl = g("#det-row-width");
      if (rwEl) _cfg.options.rowLabelWidth = Math.max(80, Math.min(600, Number(rwEl.value) || 200));
      const mgmts = [...panel.querySelectorAll(".acc-mgmt:checked")].map(c => c.dataset.val);
      const ccs   = [...panel.querySelectorAll(".acc-cc:checked")].map(c => c.dataset.val);
      if (mgmts.length || ccs.length) _cfg.access = { managements: mgmts, ccNumbers: ccs };
      if (g("#vb-title")) _cfg.label = g("#vb-title").value || _cfg.label;
    }

    // ── Save ──────────────────────────────────────────────────────────

    async function doSave(panel) {
      collectCurrent(panel);
      if (!_cfg.label.trim()) { alert("Informe um nome para o relatório."); return; }
      const btn = panel.querySelector("#vb-save");
      if (btn) { btn.disabled = true; btn.textContent = "Salvando..."; }
      try {
        const newId = await saveReport(_cfg, _editingId);
        await loadCustomReports();
        injectCatalogCards();
        onCatalogChanged?.();
        setSelectedReportId("custom_" + newId);
        renderReportsView();
      } catch (err) {
        alert("Erro ao salvar: " + err.message);
        if (btn) { btn.disabled = false; btn.textContent = "Salvar"; }
      }
    }

    // ── Drag-sort ─────────────────────────────────────────────────────

    function wireDrag(panel, listSel, itemSel, arr, onDone) {
      const list = panel.querySelector(listSel);
      if (!list) return;
      let src = null;
      list.querySelectorAll(itemSel).forEach(item => {
        item.addEventListener("dragstart", e => {
          src = item;
          e.dataTransfer.effectAllowed = "move";
          setTimeout(() => { if (src) src.style.opacity = "0.4"; }, 0);
        });
        item.addEventListener("dragend", () => {
          if (src) src.style.opacity = "";
          src = null;
          const newOrder = [...list.querySelectorAll(itemSel)].map(el => Number(el.dataset.idx));
          const copy = newOrder.map(i => arr[i]);
          arr.splice(0, arr.length, ...copy);
          onDone();
        });
        item.addEventListener("dragover", e => {
          e.preventDefault();
          if (!src || src === item) return;
          const half = item.getBoundingClientRect().height / 2;
          if (e.offsetY < half) list.insertBefore(src, item);
          else item.after(src);
        });
      });
      list.addEventListener("dragover", e => e.preventDefault());
    }

    // ── Modal factory ─────────────────────────────────────────────────

    // Botões de alinhamento/tamanho de fonte são radios disfarçados de botão (input
    // escondido dentro do <label>) — sem isso, clicar troca o valor de verdade (salva certo),
    // mas o botão não muda de cor na hora, dando impressão de que não fez nada.
    function wireToggleGroups(dlg) {
      dlg.querySelectorAll(".vb-toggle-btn input[type=radio]").forEach(radio => {
        radio.addEventListener("change", () => {
          dlg.querySelectorAll(`input[type=radio][name="${radio.name}"]`).forEach(r => {
            const lbl = r.closest(".vb-toggle-btn");
            if (!lbl) return;
            const active = r.checked;
            lbl.style.border     = `1px solid ${active ? "var(--blue)" : "var(--line)"}`;
            lbl.style.background = active ? "var(--blue-soft)" : "transparent";
            lbl.style.color      = active ? "var(--blue)" : "var(--text-faint)";
          });
        });
      });
    }

    function createModal(title, bodyHtml, onSave) {
      const overlay = document.createElement("div");
      overlay.style.cssText = `position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.65);
        display:flex;align-items:center;justify-content:center;padding:16px`;

      const dlg = document.createElement("div");
      dlg.style.cssText = `background:var(--panel);border-radius:14px;
        box-shadow:0 16px 48px rgba(0,0,0,.6);width:100%;max-width:580px;
        max-height:92vh;display:flex;flex-direction:column;overflow:hidden`;

      dlg.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:14px 18px;border-bottom:1px solid var(--line);flex-shrink:0">
          <span style="font-size:15px;font-weight:600;color:var(--text)">${escapeHtml(title)}</span>
          <button id="mdl-x" type="button" style="font-size:20px;background:none;border:none;
            cursor:pointer;color:var(--text-faint);line-height:1;padding:0 4px">&times;</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:16px 18px">${bodyHtml}</div>
        <div style="display:flex;justify-content:flex-end;gap:10px;padding:12px 18px;
          border-top:1px solid var(--line);flex-shrink:0">
          <button id="mdl-cancel" type="button"
            style="font-size:13px;padding:7px 16px;border:1px solid var(--line);border-radius:8px;
            background:none;color:var(--text-soft);cursor:pointer">Cancelar</button>
          <button id="mdl-save" type="button"
            style="font-size:13px;padding:7px 18px;background:var(--blue-soft);color:var(--blue);
            border:1px solid rgba(79,124,255,.4);border-radius:8px;cursor:pointer;font-weight:500">Salvar</button>
        </div>`;

      overlay.appendChild(dlg);
      document.body.appendChild(overlay);
      wireToggleGroups(dlg);

      const close = () => overlay.remove();
      dlg.querySelector("#mdl-x")?.addEventListener("click",      close);
      dlg.querySelector("#mdl-cancel")?.addEventListener("click",  close);
      dlg.querySelector("#mdl-save")?.addEventListener("click", () => { onSave(dlg); close(); });
      overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

      return dlg;
    }

    // ── Sources checkbox block ────────────────────────────────────────

    function sourcesHtml(selected) {
      const current = (selected || [])[0] || "actual";
      const label   = DATA_SOURCES.find(s => s.id === current)?.label || current;
      return `<div class="src-select" style="position:relative;display:inline-block;min-width:180px">
        <input type="hidden" class="src-value" value="${escapeHtml(current)}">
        <button type="button" class="src-trigger"
          style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;
          padding:7px 10px;font-size:13px;border:1px solid var(--line);border-radius:8px;
          background:var(--panel);color:var(--text);cursor:pointer">
          <span class="src-label">${escapeHtml(label)}</span>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style="flex-shrink:0;opacity:.5">
            <path d="M2 4l3.5 3.5L9 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="src-panel" style="display:none;position:absolute;top:calc(100% + 3px);left:0;right:0;
          z-index:400;background:var(--panel);border:1px solid var(--line);border-radius:8px;
          box-shadow:0 8px 24px rgba(0,0,0,.5);overflow:hidden">
          ${DATA_SOURCES.map((s, i) => `
            <div class="src-item" data-src="${escapeHtml(s.id)}" data-label="${escapeHtml(s.label)}"
              style="padding:8px 12px;font-size:13px;cursor:pointer;
              color:${current === s.id ? "var(--blue)" : "var(--text-soft)"};
              background:${current === s.id ? "var(--blue-soft)" : "transparent"}">
              ${escapeHtml(s.label)}
            </div>`).join("")}
        </div>
      </div>`;
    }

    function collectSources(dlg) {
      const val = dlg.querySelector(".src-value")?.value;
      return val ? [val] : ["actual"];
    }

    function wireSources(dlg) {
      dlg.querySelectorAll(".src-select").forEach(sel => {
        const hidden  = sel.querySelector(".src-value");
        const trigger = sel.querySelector(".src-trigger");
        const panel   = sel.querySelector(".src-panel");
        const lbl     = sel.querySelector(".src-label");

        trigger.addEventListener("click", e => {
          e.stopPropagation();
          panel.style.display = panel.style.display === "none" ? "block" : "none";
        });

        sel.querySelectorAll(".src-item").forEach(item => {
          item.addEventListener("mouseenter", () => {
            if (item.dataset.src !== hidden.value) item.style.background = "var(--panel-hover)";
          });
          item.addEventListener("mouseleave", () => {
            if (item.dataset.src !== hidden.value) item.style.background = "transparent";
          });
          item.addEventListener("click", () => {
            // reset all
            sel.querySelectorAll(".src-item").forEach(el => {
              el.style.background = "transparent";
              el.style.color      = "var(--text-soft)";
            });
            item.style.background = "var(--blue-soft)";
            item.style.color      = "var(--blue)";
            hidden.value  = item.dataset.src;
            lbl.textContent = item.dataset.label;
            panel.style.display = "none";
          });
        });

        const close = e => { if (!sel.contains(e.target)) panel.style.display = "none"; };
        document.addEventListener("click", close);
        new MutationObserver((_, obs) => {
          if (!document.contains(sel)) { document.removeEventListener("click", close); obs.disconnect(); }
        }).observe(document.body, { childList: true, subtree: true });
      });
    }

    // ── Font size helper ──────────────────────────────────────────────

    const FONT_SIZES = { sm: 11, md: 13, lg: 16 };

    function fontSizePickerHtml(prefix, selected) {
      const cur = selected || "md";
      return `<div style="display:flex;gap:2px;align-items:center">
        ${[["sm","A",11],["md","A",14],["lg","A",18]].map(([v, lbl, sz]) => {
          const active = cur === v;
          return `<label title="${v}" class="vb-toggle-btn" style="display:flex;align-items:center;justify-content:center;
            width:28px;height:26px;border-radius:6px;cursor:pointer;
            border:1px solid ${active ? "var(--blue)" : "var(--line)"};
            background:${active ? "var(--blue-soft)" : "transparent"};
            color:${active ? "var(--blue)" : "var(--text-faint)"};
            font-size:${sz}px;font-weight:700;line-height:1">
            <input type="radio" name="${prefix}-fsize" value="${v}" ${active ? "checked" : ""}
              style="position:absolute;opacity:0;width:0;height:0">${lbl}</label>`;
        }).join("")}
      </div>`;
    }

    // ── Number format helper ──────────────────────────────────────────

    const FMT_OPTIONS = [
      ["","(herdar da outra dimensão)"],
      ["n0","1.234"],       ["n1","1.234,9"],       ["n2","1.234,99"],       ["n3","1.234,999"],       ["n4","1.234,9999"],
      ["p0","12% (×100)"],  ["p1","12,9% (×100)"],  ["p2","12,99% (×100)"],  ["p3","12,999% (×100)"],  ["p4","12,9999% (×100)"],
      ["q0","12% (já %)"],  ["q1","12,9% (já %)"],  ["q2","12,99% (já %)"],  ["q3","12,999% (já %)"],  ["q4","12,9999% (já %)"],
    ];

    function buildFmtOpts(selected) {
      const norm = { number:"n0", pct:"p1", pct1:"q1" }[selected] || selected || "";
      return FMT_OPTIONS.map(([v, l]) =>
        `<option value="${v}" ${norm === v ? "selected" : ""}>${escapeHtml(l)}</option>`).join("");
    }

    // ── Row modal ─────────────────────────────────────────────────────

    function newRow() {
      return { id: uid(), name: "", type: "blank",
        source: ["actual"],
        filters: { accountNumbers: [], ccNumbers: [], managements: [] },
        period: { type: "base" }, formula: "", formulaType: "define", numberFmt: "",
        style: { bold: false, italic: false, underline: false, color: "", bg: "", indent: 0, height: null, verticalAlign: "middle", fontSize: "md" } };
    }

    function openRowModal(panel, idx) {
      const row = idx !== null ? JSON.parse(JSON.stringify(_cfg.rows[idx])) : newRow();
      const yr  = new Date().getFullYear();
      const allAccounts = [...new Map((state.dreNodes || []).map(n => [String(n.code), n])).values()];
      const allCcs      = [...(state.costCenters || [])].sort((a,b) => String(a.number).localeCompare(String(b.number)));
      const selAcc = new Set(row.filters?.accountNumbers || []);
      const selCc  = new Set(row.filters?.ccNumbers     || []);
      const rowRefs = _cfg.rows
        .map((r, i) => ({ r, i }))
        .filter(({ i }) => i !== idx)
        .map(({ r, i }) =>
          `<div class="ref-item" data-val="&lt;${letterCode(i)}&gt;"
            style="padding:5px 10px;cursor:pointer;font-size:12px;color:var(--text-soft);border-radius:5px">
            &lt;${escapeHtml(letterCode(i))}&gt; — ${escapeHtml(r.name || "(em branco)")}</div>`).join("");

      const monthOpts = MONTH_LABELS.map((m,i) =>
        `<option value="${i+1}" ${row.period?.month==i+1?"selected":""}>${m}</option>`).join("");
      const yearOpts  = Array.from({length:5},(_,i)=>yr-2+i).map(y =>
        `<option value="${y}" ${row.period?.year==y?"selected":""}>${y}</option>`).join("");

      const body = `<div style="display:flex;flex-direction:column;gap:13px">
        <div>
          <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">Nome</label>
          <input id="rm-name" type="text" value="${escapeHtml(row.name)}" placeholder="Informe o nome"
            style="width:100%;font-size:14px;padding:7px 10px">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:6px">Tipo</label>
          <div style="display:flex;gap:16px">
            ${["blank:Em branco","data:Dados","formula:Fórmula"].map(s => {
              const [v,lbl] = s.split(":");
              return `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
                <input type="radio" name="rm-type" value="${v}" ${row.type===v?"checked":""}
                  style="accent-color:var(--blue);width:14px;height:14px"> ${escapeHtml(lbl)}</label>`;
            }).join("")}
          </div>
        </div>

        <div id="rm-data" style="display:${row.type==="data"?"flex":"none"};flex-direction:column;gap:10px">
          <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
            <div>
              <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:6px">Origem / Cenário</label>
              ${sourcesHtml(row.source)}
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">
                Formato <span style="font-weight:400">(coluna sobrescreve)</span></label>
              <select id="rm-fmt-data" style="font-size:13px;padding:5px 8px">${buildFmtOpts(row.numberFmt)}</select>
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">
              Filtrar por conta <span style="font-weight:400">(vazio = todas)</span></label>
            <input id="rm-acc-q" type="text" placeholder="Buscar..."
              style="width:100%;font-size:12px;padding:4px 8px;margin-bottom:4px">
            <div id="rm-acc-list" style="max-height:110px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;padding:4px">
              ${allAccounts.map(n => {
                const code = String(n.code);
                return `<label class="acc-lbl" style="display:flex;align-items:center;gap:6px;font-size:12px;
                  padding:2px 4px;cursor:pointer;color:var(--text-soft)">
                  <input type="checkbox" class="rm-acc" data-val="${escapeHtml(code)}"
                    ${selAcc.has(code)?"checked":""}
                    style="accent-color:var(--blue);width:13px;height:13px;flex-shrink:0">
                  ${escapeHtml(code)} — ${escapeHtml(n.label||n.name||"")}</label>`;
              }).join("") || `<span style="font-size:12px;color:var(--text-faint)">Nenhuma conta.</span>`}
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">
              Filtrar por CC <span style="font-weight:400">(vazio = todos)</span></label>
            <input id="rm-cc-q" type="text" placeholder="Buscar..."
              style="width:100%;font-size:12px;padding:4px 8px;margin-bottom:4px">
            <div id="rm-cc-list" style="max-height:90px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;padding:4px">
              ${allCcs.map(cc => {
                const num = String(cc.number);
                return `<label class="cc-lbl" style="display:flex;align-items:center;gap:6px;font-size:12px;
                  padding:2px 4px;cursor:pointer;color:var(--text-soft)">
                  <input type="checkbox" class="rm-cc" data-val="${escapeHtml(num)}"
                    ${selCc.has(num)?"checked":""}
                    style="accent-color:var(--blue);width:13px;height:13px;flex-shrink:0">
                  ${escapeHtml(num)} — ${escapeHtml(cc.name||"")}</label>`;
              }).join("") || `<span style="font-size:12px;color:var(--text-faint)">Nenhum CC.</span>`}
            </div>
          </div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
            <div>
              <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:6px">Período</label>
              <div style="display:flex;gap:14px">
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
                  <input type="radio" name="rm-period" value="base"
                    ${(!row.period||row.period.type==="base")?"checked":""}
                    style="accent-color:var(--blue);width:14px;height:14px"> Da coluna</label>
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
                  <input type="radio" name="rm-period" value="fixed"
                    ${row.period?.type==="fixed"?"checked":""}
                    style="accent-color:var(--blue);width:14px;height:14px"> Data fixa</label>
              </div>
              <div id="rm-fixed" style="display:${row.period?.type==="fixed"?"flex":"none"};gap:8px;margin-top:8px;align-items:center">
                <select id="rm-month" style="font-size:13px;padding:5px">${monthOpts}</select>
                <span style="color:var(--text-faint)">/</span>
                <select id="rm-year"  style="font-size:13px;padding:5px">${yearOpts}</select>
              </div>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:6px">
                Altura <span style="font-weight:400">(px, vazio = auto)</span></label>
              <input id="rm-height" type="number" min="16" max="300" step="2"
                value="${row.style?.height || ''}"
                style="width:70px;font-size:13px;padding:5px 7px">
            </div>
          </div>
        </div>

        <div id="rm-formula" style="display:${row.type==="formula"?"flex":"none"};flex-direction:column;gap:10px">
          <div>
            <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">
              Expressão <span style="font-weight:400">(use &lt;A&gt;, &lt;B&gt;... para referenciar linhas)</span></label>
            <textarea id="rm-expr" rows="3"
              style="width:100%;font-size:13px;font-family:monospace;padding:7px 10px;resize:vertical"
              >${escapeHtml(row.formula||"")}</textarea>
            <div style="display:flex;gap:8px;margin-top:6px;position:relative">
              <div style="position:relative">
                <button type="button" id="rm-add-row"
                  style="font-size:11px;padding:3px 9px;border:1px solid var(--line);border-radius:6px;
                  background:var(--panel-hover);color:var(--text-soft);cursor:pointer">Adicionar linha</button>
                <div id="rm-row-picker" style="display:none;position:absolute;top:100%;left:0;z-index:200;
                  background:var(--panel);border:1px solid var(--line);border-radius:8px;
                  min-width:200px;max-height:160px;overflow-y:auto;margin-top:2px;box-shadow:0 4px 16px rgba(0,0,0,.4)">
                  ${rowRefs || `<div style="padding:8px 10px;font-size:12px;color:var(--text-faint)">Nenhuma linha ainda.</div>`}
                </div>
              </div>
              ${fnPickerBtn("rm")}
              <div>
                <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:2px">
                  Formato <span style="font-weight:400">(coluna sobrescreve)</span></label>
                <select id="rm-fmt-formula" style="font-size:13px;padding:4px 8px">${buildFmtOpts(row.numberFmt)}</select>
              </div>
            </div>
          </div>
        </div>

        ${styleSection("rs", row.style, false, (() => {
          const va = row.style?.verticalAlign || "middle";
          return fontSizePickerHtml("rs", row.style?.fontSize) + `<div style="display:flex;gap:2px">
            ${[
              ["top",    `<svg width="14" height="15" viewBox="0 0 14 15" fill="currentColor"><rect x="0" y="0" width="14" height="2" rx="1"/><rect x="0" y="3" width="14" height="2" rx="1"/><rect x="2" y="6.5" width="10" height="2" rx="1"/></svg>`],
              ["middle", `<svg width="14" height="15" viewBox="0 0 14 15" fill="currentColor"><rect x="0" y="3.5" width="14" height="2" rx="1"/><rect x="2" y="6.5" width="10" height="1" rx="0.5"/><rect x="0" y="8.5" width="14" height="2" rx="1"/></svg>`],
              ["bottom", `<svg width="14" height="15" viewBox="0 0 14 15" fill="currentColor"><rect x="2" y="6.5" width="10" height="2" rx="1"/><rect x="0" y="9.5" width="14" height="2" rx="1"/><rect x="0" y="13" width="14" height="2" rx="1"/></svg>`],
            ].map(([v, icon]) => {
              const active = va === v;
              return `<label title="${v}" class="vb-toggle-btn" style="display:flex;align-items:center;justify-content:center;
                width:28px;height:26px;border-radius:6px;cursor:pointer;
                border:1px solid ${active ? "var(--blue)" : "var(--line)"};
                background:${active ? "var(--blue-soft)" : "transparent"};
                color:${active ? "var(--blue)" : "var(--text-faint)"}">
                <input type="radio" name="rs-valign" value="${v}" ${active ? "checked" : ""}
                  style="position:absolute;opacity:0;width:0;height:0"> ${icon}</label>`;
            }).join("")}
          </div>`;
        })())}
      </div>`;

      const dlg = createModal("Nova linha", body, (d) => {
        row.name = d.querySelector("#rm-name")?.value || "";
        row.type   = d.querySelector("input[name='rm-type']:checked")?.value || "blank";
        row.source = collectSources(d);
        if (!row.source.length) row.source = ["actual"];
        row.filters = {
          accountNumbers: [...d.querySelectorAll(".rm-acc:checked")].map(c => c.dataset.val),
          ccNumbers:      [...d.querySelectorAll(".rm-cc:checked")].map(c => c.dataset.val),
          managements:    [],
        };
        const pt = d.querySelector("input[name='rm-period']:checked")?.value || "base";
        row.period = { type: pt };
        if (pt === "fixed") {
          row.period.month = Number(d.querySelector("#rm-month")?.value);
          row.period.year  = Number(d.querySelector("#rm-year")?.value);
        }
        row.formula     = d.querySelector("#rm-expr")?.value || "";
        row.formulaType = "define";
        row.numberFmt   = (row.type === "formula"
          ? d.querySelector("#rm-fmt-formula")?.value
          : d.querySelector("#rm-fmt-data")?.value) || "";
        row.style = collectStyle(d, "rs");
        const h = Number(d.querySelector("#rm-height")?.value);
        row.style.height        = h > 0 ? h : null;
        row.style.verticalAlign = d.querySelector("input[name='rs-valign']:checked")?.value || "middle";
        if (idx !== null) _cfg.rows[idx] = row; else _cfg.rows.push(row);
        refreshReport(panel);
      });

      // Type toggle
      dlg.querySelectorAll("input[name='rm-type']").forEach(r => r.addEventListener("change", () => {
        dlg.querySelector("#rm-data").style.display    = r.value === "data"    ? "flex" : "none";
        dlg.querySelector("#rm-formula").style.display = r.value === "formula" ? "flex" : "none";
      }));
      // Period toggle
      dlg.querySelectorAll("input[name='rm-period']").forEach(r => r.addEventListener("change", () => {
        dlg.querySelector("#rm-fixed").style.display = r.value==="fixed" ? "flex":"none";
      }));
      wireSources(dlg);
      searchFilter(dlg, "#rm-acc-q", ".acc-lbl");
      searchFilter(dlg, "#rm-cc-q",  ".cc-lbl");
      wireRefPicker(dlg, "#rm-add-row",    "#rm-row-picker",  "#rm-expr");
      wireFnPicker(dlg,  "#rm-fn-btn",     "#rm-fn-picker",   "#rm-expr");
    }

    // ── Col modal ─────────────────────────────────────────────────────

    function newCol() {
      const now = new Date();
      const m = now.getMonth()+1, y = now.getFullYear();
      return { id: uid(), name: "", type: "blank",
        source: ["actual"],
        filters: { accountNumbers: [], ccNumbers: [], managements: [] },
        period: { month: m, year: y },
        accumulate: false,
        periodFrom: { month: m, year: y },
        periodTo:   { month: m, year: y },
        hidden: false, formula: "", numberFmt: "", width: 120,
        headerStyle: { bold: false, italic: false, color: "", bg: "", align: "right", fontSize: "md" },
        cellStyle:   { bold: false, italic: false, color: "", bg: "", align: "right", fontSize: "md" } };
    }

    function openColModal(panel, idx) {
      const col = idx !== null ? JSON.parse(JSON.stringify(_cfg.cols[idx])) : newCol();
      const yr  = new Date().getFullYear();
      const monthOpts = MONTH_LABELS.map((m,i) =>
        `<option value="${i+1}" ${col.period?.month==i+1?"selected":""}>${m}</option>`).join("");
      const yearOpts  = Array.from({length:5},(_,i)=>yr-2+i).map(y =>
        `<option value="${y}" ${col.period?.year==y?"selected":""}>${y}</option>`).join("");
      const colRefs   = _cfg.cols
        .map((c, i) => ({ c, i }))
        .filter(({ i }) => i !== idx)
        .map(({ c, i }) =>
          `<div class="ref-item" data-val="&lt;${letterCode(i)}&gt;"
            style="padding:5px 10px;cursor:pointer;font-size:12px;color:var(--text-soft);border-radius:5px">
            &lt;${escapeHtml(letterCode(i))}&gt; — ${escapeHtml(c.name || "(em branco)")}</div>`).join("");

      const fmtOpts = () => buildFmtOpts(col.numberFmt);

      const body = `<div style="display:flex;flex-direction:column;gap:13px">
        <div style="display:flex;gap:10px;align-items:flex-end">
          <div style="flex:1">
            <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">Nome</label>
            <input id="cm-name" type="text" value="${escapeHtml(col.name)}" placeholder="Informe o nome"
              style="width:100%;font-size:14px;padding:7px 10px">
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">Largura (px)</label>
            <input id="cm-width" type="number" value="${col.width||120}" min="40" max="600" step="10"
              style="width:72px;font-size:13px;padding:7px 8px">
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;white-space:nowrap;padding-bottom:9px">
            <input type="checkbox" id="cm-hidden" ${col.hidden?"checked":""}
              style="width:13px;height:13px;accent-color:var(--amber)"> Ocultar na execução
          </label>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:6px">Tipo</label>
          <div style="display:flex;gap:16px">
            ${["blank:Em branco","data:Dados","formula:Fórmula"].map(s => {
              const [v,lbl] = s.split(":");
              return `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
                <input type="radio" name="cm-type" value="${v}" ${col.type===v?"checked":""}
                  style="accent-color:var(--blue);width:14px;height:14px"> ${escapeHtml(lbl)}</label>`;
            }).join("")}
          </div>
        </div>

        <div id="cm-data" style="display:${col.type==="data"?"flex":"none"};flex-direction:column;gap:10px">
          <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end">
            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                <label style="font-size:11px;color:var(--text-faint)">Período</label>
                <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;margin-left:12px">
                  <input type="checkbox" id="cm-accumulate" ${col.accumulate?"checked":""}
                    style="width:13px;height:13px;accent-color:var(--blue)"> Acumular
                </label>
              </div>
              <div id="cm-period-single" style="display:${col.accumulate?"none":"flex"};gap:8px;align-items:center">
                <select id="cm-month" style="font-size:13px;padding:5px">${monthOpts}</select>
                <span style="color:var(--text-faint)">/</span>
                <select id="cm-year"  style="font-size:13px;padding:5px">${yearOpts}</select>
              </div>
              <div id="cm-period-range" style="display:${col.accumulate?"flex":"none"};flex-direction:column;gap:5px">
                ${(["De","Até"]).map((lbl, side) => {
                  const p = side === 0 ? (col.periodFrom || col.period) : (col.periodTo || col.period);
                  const mOpts = MONTH_LABELS.map((mn,i) =>
                    `<option value="${i+1}" ${p?.month==i+1?"selected":""}>${mn}</option>`).join("");
                  const yOpts = Array.from({length:5},(_,i)=>yr-2+i).map(y =>
                    `<option value="${y}" ${p?.year==y?"selected":""}>${y}</option>`).join("");
                  const pfx  = side === 0 ? "cm-from" : "cm-to";
                  return `<div style="display:flex;gap:8px;align-items:center">
                    <span style="font-size:12px;color:var(--text-faint);min-width:22px">${lbl}</span>
                    <select id="${pfx}-month" style="font-size:13px;padding:5px">${mOpts}</select>
                    <span style="color:var(--text-faint)">/</span>
                    <select id="${pfx}-year"  style="font-size:13px;padding:5px">${yOpts}</select>
                  </div>`;
                }).join("")}
              </div>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">
              Formato <span style="font-weight:400">(sobrescreve linha)</span></label>
              <select id="cm-fmt" style="font-size:13px;padding:5px 8px">${fmtOpts()}</select>
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:6px">Origem / Cenário</label>
            ${sourcesHtml(col.source)}
          </div>
        </div>

        <div id="cm-formula" style="display:${col.type==="formula"?"flex":"none"};flex-direction:column;gap:10px">
          <div>
            <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">
              Expressão <span style="font-weight:400">(use &lt;A&gt;, &lt;B&gt;... para referenciar colunas)</span></label>
            <textarea id="cm-expr" rows="3"
              style="width:100%;font-size:13px;font-family:monospace;padding:7px 10px;resize:vertical"
              >${escapeHtml(col.formula||"")}</textarea>
            <div style="display:flex;gap:8px;margin-top:6px">
              <div style="position:relative">
                <button type="button" id="cm-add-col"
                  style="font-size:11px;padding:3px 9px;border:1px solid var(--line);border-radius:6px;
                  background:var(--panel-hover);color:var(--text-soft);cursor:pointer">Adicionar coluna</button>
                <div id="cm-col-picker" style="display:none;position:absolute;top:100%;left:0;z-index:200;
                  background:var(--panel);border:1px solid var(--line);border-radius:8px;
                  min-width:200px;max-height:160px;overflow-y:auto;margin-top:2px;box-shadow:0 4px 16px rgba(0,0,0,.4)">
                  ${colRefs || `<div style="padding:8px 10px;font-size:12px;color:var(--text-faint)">Nenhuma coluna ainda.</div>`}
                </div>
              </div>
              ${fnPickerBtn("cm")}
              <div>
                <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:2px">Formato</label>
                <select id="cm-ffmt" style="font-size:13px;padding:4px 8px">${fmtOpts()}</select>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div style="font-size:11px;color:var(--text-faint);margin-bottom:8px;font-weight:600">Estilo do Cabeçalho</div>
          ${styleSection("ch", col.headerStyle, true, fontSizePickerHtml("ch", col.headerStyle?.fontSize))}
          <div style="font-size:11px;color:var(--text-faint);margin-bottom:8px;margin-top:10px;font-weight:600">Estilo das Células</div>
          ${styleSection("cc", col.cellStyle, true, fontSizePickerHtml("cc", col.cellStyle?.fontSize))}
        </div>
      </div>`;

      const dlg = createModal("Nova coluna", body, (d) => {
        col.name   = d.querySelector("#cm-name")?.value || "";
        col.type   = d.querySelector("input[name='cm-type']:checked")?.value || "blank";
        col.hidden = d.querySelector("#cm-hidden")?.checked || false;
        col.width  = Math.max(40, Number(d.querySelector("#cm-width")?.value) || 120);
        col.source = collectSources(d);
        if (!col.source.length) col.source = ["actual"];
        col.accumulate = d.querySelector("#cm-accumulate")?.checked || false;
        col.period     = {
          month: Number(d.querySelector("#cm-month")?.value || 1),
          year:  Number(d.querySelector("#cm-year")?.value  || new Date().getFullYear()),
        };
        col.periodFrom = {
          month: Number(d.querySelector("#cm-from-month")?.value || 1),
          year:  Number(d.querySelector("#cm-from-year")?.value  || new Date().getFullYear()),
        };
        col.periodTo   = {
          month: Number(d.querySelector("#cm-to-month")?.value || 12),
          year:  Number(d.querySelector("#cm-to-year")?.value  || new Date().getFullYear()),
        };
        col.numberFmt = (col.type === "formula"
          ? d.querySelector("#cm-ffmt")?.value
          : d.querySelector("#cm-fmt")?.value) ?? "";
        col.formula   = d.querySelector("#cm-expr")?.value || "";
        col.headerStyle = collectStyleWithAlign(d, "ch");
        col.cellStyle   = collectStyleWithAlign(d, "cc");
        if (idx !== null) _cfg.cols[idx] = col; else _cfg.cols.push(col);
        refreshReport(panel);
      });

      dlg.querySelectorAll("input[name='cm-type']").forEach(r => r.addEventListener("change", () => {
        dlg.querySelector("#cm-data").style.display    = r.value==="data"    ? "flex":"none";
        dlg.querySelector("#cm-formula").style.display = r.value==="formula" ? "flex":"none";
      }));
      dlg.querySelector("#cm-accumulate")?.addEventListener("change", e => {
        dlg.querySelector("#cm-period-single").style.display = e.target.checked ? "none" : "flex";
        dlg.querySelector("#cm-period-range").style.display  = e.target.checked ? "flex" : "none";
      });
      wireSources(dlg);
      wireRefPicker(dlg, "#cm-add-col",  "#cm-col-picker", "#cm-expr");
      wireFnPicker(dlg,  "#cm-fn-btn",   "#cm-fn-picker",  "#cm-expr");
    }

    // ── Style helpers ─────────────────────────────────────────────────

    function styleSection(prefix, sty, withAlign, extraEnd = "") {
      const align = sty?.align || "right";
      return `<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">
          <input type="checkbox" id="${prefix}-bold" ${sty?.bold?"checked":""}
            style="accent-color:var(--blue);width:13px;height:13px"> <strong>N</strong></label>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">
          <input type="checkbox" id="${prefix}-italic" ${sty?.italic?"checked":""}
            style="accent-color:var(--blue);width:13px;height:13px"> <em>I</em></label>
        ${!withAlign ? `<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">
          <input type="checkbox" id="${prefix}-underline" ${sty?.underline?"checked":""}
            style="accent-color:var(--blue);width:13px;height:13px"> <u>S</u></label>` : ""}
        <label style="display:flex;align-items:center;gap:5px;font-size:12px">
          Cor <input type="color" id="${prefix}-color" value="${sty?.color||"#a1a7b3"}"
            style="width:26px;height:22px;border:none;cursor:pointer;padding:0"></label>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px">
          Fundo <input type="color" id="${prefix}-bg" value="${sty?.bg||"#121317"}"
            style="width:26px;height:22px;border:none;cursor:pointer;padding:0"></label>
        ${withAlign ? `<div style="display:flex;gap:2px">
          ${[
            ["left",   `<svg width="15" height="13" viewBox="0 0 15 13" fill="currentColor"><rect x="0" y="0"  width="15" height="2" rx="1"/><rect x="0" y="4"  width="10" height="2" rx="1"/><rect x="0" y="8"  width="15" height="2" rx="1"/><rect x="0" y="12" width="7"  height="1" rx="0.5"/></svg>`],
            ["center", `<svg width="15" height="13" viewBox="0 0 15 13" fill="currentColor"><rect x="0" y="0"  width="15" height="2" rx="1"/><rect x="2" y="4"  width="11" height="2" rx="1"/><rect x="0" y="8"  width="15" height="2" rx="1"/><rect x="4" y="12" width="7"  height="1" rx="0.5"/></svg>`],
            ["right",  `<svg width="15" height="13" viewBox="0 0 15 13" fill="currentColor"><rect x="0" y="0"  width="15" height="2" rx="1"/><rect x="5" y="4"  width="10" height="2" rx="1"/><rect x="0" y="8"  width="15" height="2" rx="1"/><rect x="8" y="12" width="7"  height="1" rx="0.5"/></svg>`],
          ].map(([v, icon]) => {
            const active = align === v;
            return `<label title="${v}" class="vb-toggle-btn" style="display:flex;align-items:center;justify-content:center;
              width:28px;height:26px;border-radius:6px;cursor:pointer;border:1px solid ${active?"var(--blue)":"var(--line)"};
              background:${active?"var(--blue-soft)":"transparent"};color:${active?"var(--blue)":"var(--text-faint)"}">
              <input type="radio" name="${prefix}-align" value="${v}" ${active?"checked":""}
                style="position:absolute;opacity:0;width:0;height:0"> ${icon}</label>`;
          }).join("")}
        </div>` : ""}
        ${extraEnd}
      </div>`;
    }

    function collectStyle(dlg, prefix) {
      return {
        bold:      dlg.querySelector(`#${prefix}-bold`)?.checked      || false,
        italic:    dlg.querySelector(`#${prefix}-italic`)?.checked    || false,
        underline: dlg.querySelector(`#${prefix}-underline`)?.checked || false,
        color:     dlg.querySelector(`#${prefix}-color`)?.value       || "",
        bg:        dlg.querySelector(`#${prefix}-bg`)?.value          || "",
        fontSize:  dlg.querySelector(`input[name="${prefix}-fsize"]:checked`)?.value || "md",
      };
    }

    function collectStyleWithAlign(dlg, prefix) {
      return {
        ...collectStyle(dlg, prefix),
        align: dlg.querySelector(`input[name="${prefix}-align"]:checked`)?.value || "right",
      };
    }

    // ── Picker helpers ────────────────────────────────────────────────

    function fnPickerBtn(prefix) {
      return `<div style="position:relative">
        <button type="button" id="${prefix}-fn-btn"
          style="font-size:11px;padding:3px 9px;border:1px solid var(--line);border-radius:6px;
          background:var(--panel-hover);color:var(--text-soft);cursor:pointer">Adicionar função</button>
        <div id="${prefix}-fn-picker" style="display:none;position:absolute;top:100%;left:0;z-index:200;
          background:var(--panel);border:1px solid var(--line);border-radius:8px;min-width:180px;
          margin-top:2px;box-shadow:0 4px 16px rgba(0,0,0,.4)">
          ${[["SE","SE(cond; ver; fal)"],["E","E(a; b)"],["OU","OU(a; b)"],["ABS","ABS(valor)"],["ROUND","ROUND(valor)"]].map(
            ([name, snippet]) =>
            `<div class="vb-fn-item" data-val="${escapeHtml(snippet)}"
              style="padding:7px 12px;cursor:pointer;font-size:12px;color:var(--text-soft);border-radius:6px">
              ${escapeHtml(name)}</div>`).join("")}
        </div>
      </div>`;
    }

    function wireRefPicker(dlg, btnSel, pickerSel, taSel) {
      const btn    = dlg.querySelector(btnSel);
      const picker = dlg.querySelector(pickerSel);
      const ta     = dlg.querySelector(taSel);
      if (!btn || !picker) return;
      btn.addEventListener("click", e => {
        e.stopPropagation();
        picker.style.display = picker.style.display === "none" ? "block" : "none";
      });
      picker.querySelectorAll(".ref-item").forEach(item => {
        item.addEventListener("mouseenter", () => { item.style.background = "var(--panel-hover)"; });
        item.addEventListener("mouseleave", () => { item.style.background = ""; });
        item.addEventListener("click", () => {
          if (ta) {
            const s = ta.selectionStart;
            const v = item.dataset.val;
            ta.value = ta.value.slice(0, s) + v + ta.value.slice(ta.selectionEnd);
            ta.selectionStart = ta.selectionEnd = s + v.length;
            ta.focus();
          }
          picker.style.display = "none";
        });
      });
    }

    function wireFnPicker(dlg, btnSel, pickerSel, taSel) {
      const btn    = dlg.querySelector(btnSel);
      const picker = dlg.querySelector(pickerSel);
      const ta     = dlg.querySelector(taSel);
      if (!btn || !picker) return;
      btn.addEventListener("click", e => {
        e.stopPropagation();
        picker.style.display = picker.style.display === "none" ? "block" : "none";
      });
      picker.querySelectorAll(".vb-fn-item").forEach(item => {
        item.addEventListener("mouseenter", () => { item.style.background = "var(--panel-hover)"; });
        item.addEventListener("mouseleave", () => { item.style.background = ""; });
        item.addEventListener("click", () => {
          if (ta) {
            const s = ta.selectionStart;
            const v = item.dataset.val;
            ta.value = ta.value.slice(0, s) + v + ta.value.slice(ta.selectionEnd);
            ta.selectionStart = ta.selectionEnd = s + v.length;
            ta.focus();
          }
          picker.style.display = "none";
        });
      });
    }

    function searchFilter(dlg, inputSel, itemSel) {
      dlg.querySelector(inputSel)?.addEventListener("input", e => {
        const q = e.target.value.toLowerCase();
        dlg.querySelectorAll(itemSel).forEach(el => {
          el.style.display = !q || el.textContent.toLowerCase().includes(q) ? "" : "none";
        });
      });
    }

    // ── Saved report viewer ───────────────────────────────────────────

    function renderSavedReport(panel, reportId) {
      const report = _savedReports.find(r => "custom_" + r.id === reportId);
      if (!report) return false;
      const cfg = report.config || blankConfig();

      panel.innerHTML = `<div style="padding:1.25rem">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1rem;gap:8px;flex-wrap:wrap">
          <div>
            <div style="font-size:16px;font-weight:600;color:var(--text)">${escapeHtml(cfg.label || report.label)}</div>
            ${cfg.description ? `<div style="font-size:12px;color:var(--text-faint);margin-top:2px">${escapeHtml(cfg.description)}</div>` : ""}
          </div>
          ${isAdmin() ? `<button id="vb-edit-btn" type="button"
            style="font-size:12px;padding:5px 14px;border:1px solid var(--line);border-radius:8px;
            background:none;color:var(--text-soft);cursor:pointer;flex-shrink:0">Editar</button>` : ""}
        </div>
        <div id="vb-report-out">
          <span style="font-size:12px;color:var(--text-faint)">Calculando...</span>
        </div>
      </div>`;

      panel.querySelector("#vb-edit-btn")?.addEventListener("click", () => {
        _cfg       = JSON.parse(JSON.stringify(cfg));
        _cfg.label = report.label;
        _editingId = report.id;
        _sourceCache.clear();
        renderBuilderInPanel(panel);
      });

      renderReportTable(panel.querySelector("#vb-report-out"), cfg);
      return true;
    }

    // ── Public API ────────────────────────────────────────────────────

    function handleBuilderView(panel, reportId) {
      _currentPanel = panel;
      // Gear menu "Editar" from catalog: _cfg/_editingId already loaded, just render builder
      if (_pendingEditId !== null) {
        _pendingEditId = null;
        renderBuilderInPanel(panel);
        return true;
      }
      if (reportId === "__new_report__") {
        _cfg = blankConfig(); _editingId = null;
        _sourceCache.clear();
        renderBuilderInPanel(panel);
        return true;
      }
      if (reportId?.startsWith("custom_")) return renderSavedReport(panel, reportId);
      return false;
    }

    return { loadCustomReports, injectCatalogCards, handleBuilderView };
  }

  window.VECTON_REPORTS_BUILDER = { createReportsBuilderModule };
})(window);
