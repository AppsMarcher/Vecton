(function attachVectonReportsCapex(window) {
  "use strict";

  // Relatório "Capex Meta" (Central de Relatórios, seção CAPEX): investimentos salvos no formulário CAPEX
  // do cenário + depreciação/amortização incremental. Os dados vêm de planning_capex_report, que já
  // aplica o escopo de gestão/CC do perfil e nunca devolve a taxa de depreciação.
  function createReportsCapexModule(deps) {
    const { escapeHtml, callSupabaseRpc, resolveOrganizationId, fetchAllScenarios, exportRowsToExcel, exportButtonHtml } = deps;

    const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const ALL = "Marcher";
    const PROD_TYPES = new Set(["MOD", "MOI"]);
    const NATURE_LABEL = { depreciation: "Depreciação", amortization: "Amortização" };

    let _source = null;   // id do cenário
    let _mode = "gestao"; // "gestao" | "tipo"
    let _mgmt = ALL;      // gestão escolhida no seletor ("Marcher" = todas)
    let _ccSel = null;    // lista de CCs (números) quando a seleção mistura CCs; null = gestão inteira ou todas
    let _collapsed = new Set();
    let _popover = null;
    let _docListener = false;

    const fmt = (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sum = (list, fn) => list.reduce((n, x) => n + fn(x), 0);
    const monthSums = (list, key) => MONTHS.map((_, m) => sum(list, (i) => Number(i[key][m]) || 0));
    const total = (arr) => arr.reduce((a, b) => a + b, 0);
    const groupOf = (ccType) => (PROD_TYPES.has(ccType) ? "prod" : "adm");

    function closePopover() { if (_popover) { _popover.remove(); _popover = null; } }

    function render(detailPanel) {
      detailPanel.classList.add("dre-cmp-shell");
      closePopover();
      detailPanel.innerHTML = `
        <div class="vp-source-bar dre-cmp-bar capex-bar">
          <div class="capex-seg" id="capex-seg" role="group" aria-label="Agrupar">
            <button type="button" data-mode="gestao">Por gestão</button>
            <button type="button" data-mode="tipo">Por tipo</button>
          </div>
          <div class="opex-header-filter" style="display:flex;align-items:center;gap:10px">
            <div class="opex-cc-slot" id="capex-cc-slot"></div>
          </div>
          <span class="vp-source-label">Fonte</span>
          <select class="vp-source-sel" id="capex-src-sel"><option value="">Carregando…</option></select>
          ${window.vpExportIconButtonHtml("data-capex-export")}
        </div>
        <div id="capex-body"><div class="actuals-empty">Carregando...</div></div>`;
      const body = detailPanel.querySelector("#capex-body");
      let data = null;

      const segButtons = () => detailPanel.querySelectorAll("#capex-seg button");
      const syncSeg = () => segButtons().forEach((b) => b.classList.toggle("on", b.dataset.mode === _mode));
      syncSeg();

      const ccSlot = detailPanel.querySelector("#capex-cc-slot");
      const picker = window.VECTON_OPEX_CC_PICKER;
      // Árvore gestão -> CCs a partir dos próprios investimentos (a RPC já aplica o escopo do perfil).
      function ccTree() {
        const byMgmt = new Map();
        (data?.items || []).forEach((i) => {
          if (!i.management) return;
          if (!byMgmt.has(i.management)) byMgmt.set(i.management, new Map());
          byMgmt.get(i.management).set(String(i.cc_number), { id: String(i.cc_number), number: String(i.cc_number), name: i.cc_name || "" });
        });
        return [...byMgmt.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
          .map(([mgmt, ccs]) => ({ mgmt, ccs: [...ccs.values()].sort((a, b) => a.number.localeCompare(b.number, "pt-BR", { numeric: true })) }));
      }
      function mountCc() {
        const tree = ccTree();
        const valid = new Set(tree.flatMap((g) => g.ccs.map((c) => c.id)));
        if (_mgmt !== ALL && !tree.some((g) => g.mgmt === _mgmt)) _mgmt = ALL;
        if (_ccSel) { _ccSel = _ccSel.filter((id) => valid.has(id)); if (!_ccSel.length) _ccSel = null; }
        picker.mount(ccSlot, {
          tree, canAll: !!tree.length, allOption: ALL, ariaLabel: "Gestão",
          selectedMgmt: _ccSel ? picker.customLabel(tree, _ccSel) : _mgmt, customIds: _ccSel, partial: false,
          onApply: ({ mgmt, customIds }) => { _mgmt = mgmt; _ccSel = customIds; _collapsed = new Set(); mountCc(); paint(); }
        });
      }
      mountCc();
      detailPanel.querySelector("#capex-seg").addEventListener("click", (e) => {
        const b = e.target.closest("button[data-mode]");
        if (!b || b.dataset.mode === _mode) return;
        _mode = b.dataset.mode; _collapsed = new Set(); syncSeg(); paint();
      });
      detailPanel.querySelector("[data-capex-export]").addEventListener("click", () => {
        const t1 = body.querySelector("#capex-t1"), t2 = body.querySelector("#capex-t2");
        const srcName = detailPanel.querySelector("#capex-src-sel")?.selectedOptions?.[0]?.textContent?.trim() || "";
        window.vpExportTableToExcel(t1, "Capex Meta", [ccSlot.querySelector("button")?.textContent?.trim() || _mgmt, srcName], t2 ? [{ table: t2, title: "Depreciação" }] : []);
      });
      body.addEventListener("click", (e) => {
        const tg = e.target.closest("[data-toggle]");
        if (tg) { const id = tg.dataset.toggle; _collapsed.has(id) ? _collapsed.delete(id) : _collapsed.add(id); paint(); return; }
        const cell = e.target.closest("td.capex-v");
        if (cell) openPopover(cell);
      });
      if (!_docListener) {
        _docListener = true;
        document.addEventListener("click", (e) => {
          if (_popover && !_popover.contains(e.target) && !e.target.closest("td.capex-v")) closePopover();
        }, true);
      }

      function scoped() {
        const items = (data?.items || []).map((i) => ({ ...i, values: i.values.map(Number), dep: i.dep.map(Number), grp: groupOf(i.cc_type) }));
        if (_ccSel) { const picked = new Set(_ccSel); return items.filter((i) => picked.has(String(i.cc_number))); }
        return _mgmt === ALL ? items : items.filter((i) => (i.management || "") === _mgmt);
      }
      function scopedDep() {
        const rows = data?.depreciation || [];
        if (_ccSel) { const picked = new Set(_ccSel); return rows.filter((r) => picked.has(String(r.cc_number))); }
        return _mgmt === ALL ? rows : rows.filter((r) => (r.management || "") === _mgmt);
      }

      function paint() {
        if (!data) return;
        const items = scoped();
        if (!(data.items || []).length) {
          body.innerHTML = `<div class="actuals-empty">Nenhum investimento lançado no CAPEX deste cenário${_mgmt !== ALL || _ccSel ? "" : " dentro do seu escopo"}.</div>`;
          return;
        }
        const arr = monthSums(items, "values"), dep = monthSums(items, "dep");
        const totalCapex = total(arr), totalDep = total(dep);
        const by = (key) => { const m = new Map(); items.forEach((i) => m.set(i[key], (m.get(i[key]) || 0) + total(i.values))); return [...m.entries()].sort((a, b) => b[1] - a[1])[0] || ["—", 0]; };
        const topG = by("management"), topT = by("type");
        const pct = (v) => (totalCapex ? Math.round((v / totalCapex) * 100) : 0);
        body.innerHTML = `
          <div class="capex-kpis">
            <div class="capex-kpi"><small>CAPEX do ano</small><strong>R$ ${fmt(totalCapex)}</strong><span>${items.length} investimento(s) · ${escapeHtml(data.scenario.name)}</span></div>
            <div class="capex-kpi alt"><small>Depreciação + amortização no ano</small><strong>R$ ${fmt(totalDep)}</strong><span>${totalCapex ? (totalDep / totalCapex * 100).toFixed(1).replace(".", ",") : "0,0"}% do CAPEX · efeito no DRE</span></div>
            <div class="capex-kpi"><small>Maior gestão</small><strong>${escapeHtml(topG[0] || "—")}</strong><span>R$ ${fmt(topG[1])} · ${pct(topG[1])}% do total</span></div>
            <div class="capex-kpi alt"><small>Maior tipo de imobilizado</small><strong>${escapeHtml(topT[0])}</strong><span>R$ ${fmt(topT[1])} · ${pct(topT[1])}% do total</span></div>
          </div>
          <div class="capex-card">
            <h2>Investimentos</h2>
            <div class="capex-scroll"><table class="reports-dre-table" id="capex-t1">${table1(items)}</table></div>
          </div>
          <div class="capex-card">
            <h2>Depreciação e amortização incremental</h2>
            <div class="capex-scroll"><table class="reports-dre-table" id="capex-t2">${table2(items)}</table></div>
          </div>`;
      }

      const colgroup = `<colgroup><col style="width:340px"><col style="width:190px">${MONTHS.map(() => '<col style="width:104px">').join("")}<col style="width:116px"></colgroup>`;
      const thead = (a, b) => `<thead><tr><th class="col-frozen col-frozen-1" style="left:0">${a}</th><th class="col-frozen" style="position:sticky;left:340px;z-index:5">${b}</th>${MONTHS.map((m) => `<th>${m}</th>`).join("")}<th>Total</th></tr></thead>`;

      function row(cls, label, second, arr, key, ids, title) {
        const ref = ids.join(",");
        const cells = arr.map((v, m) => (Math.abs(v) >= 0.005
          ? `<td class="reports-value-cell capex-v" data-m="${m}" data-key="${key}" data-ids="${ref}" data-title="${escapeHtml(title)}" data-cls="${cls}">${fmt(v)}</td>`
          : `<td class="reports-value-cell capex-z">—</td>`)).join("");
        return `<tr class="capex-row ${cls}"><td class="reports-label-cell capex-f1 col-frozen col-frozen-1" style="left:0">${label}</td><td class="reports-label-cell capex-f2 col-frozen" style="position:sticky;left:340px;z-index:3">${second || ""}</td>${cells}<td class="reports-value-cell reports-total-cell">${fmt(total(arr))}</td></tr>`;
      }
      const idx = (list) => list.map((i) => items_all().indexOf(i));
      function items_all() { return _itemsAll; }
      let _itemsAll = [];

      function table1(items) {
        _itemsAll = items;
        const chev = (id) => `<span class="capex-chev" data-toggle="${id}">${_collapsed.has(id) ? "▸" : "▾"}</span>`;
        let h = colgroup + thead(_mode === "gestao" ? "Gestão / Centro de custo / Investimento" : "Tipo de imobilizado / Investimento", _mode === "gestao" ? "Tipo" : "Gestão · CC") + "<tbody>";
        if (_mode === "gestao") {
          [...new Set(items.map((i) => i.management || "—"))].forEach((g) => {
            const lg = items.filter((i) => (i.management || "—") === g), idg = "g:" + g;
            h += row("g1", chev(idg) + escapeHtml(g), "", monthSums(lg, "values"), "values", idx(lg), g);
            if (_collapsed.has(idg)) return;
            [...new Set(lg.map((i) => i.cc_number))].forEach((cc) => {
              const lc = lg.filter((i) => i.cc_number === cc), idc = "c:" + g + cc, name = `CC ${cc} · ${lc[0].cc_name}`;
              h += row("g2", chev(idc) + escapeHtml(name), "", monthSums(lc, "values"), "values", idx(lc), name);
              if (_collapsed.has(idc)) return;
              lc.forEach((i) => { h += row("it", escapeHtml(i.name), `<span class="capex-pill">${escapeHtml(i.type)}</span>`, i.values, "values", idx([i]), i.name); });
            });
          });
        } else {
          [...new Set(items.map((i) => i.type))].forEach((t) => {
            const lt = items.filter((i) => i.type === t), idt = "t:" + t;
            h += row("g1", chev(idt) + escapeHtml(t), "", monthSums(lt, "values"), "values", idx(lt), t);
            if (_collapsed.has(idt)) return;
            lt.forEach((i) => { h += row("it", escapeHtml(i.name), escapeHtml(`${i.management || "—"} · ${i.cc_number}`), i.values, "values", idx([i]), i.name); });
          });
        }
        return h + row("tot", "Total de investimentos", "", monthSums(items, "values"), "values", idx(items), "Total de investimentos") + "</tbody>";
      }

      function table2(items) {
        const rows = scopedDep();
        const dest = data.destinations || [];
        let h = colgroup + thead("Conta / descrição", "") + "<tbody>";
        const totals = Array(12).fill(0);
        [["prod", "Produção"], ["adm", "Administrativo"]].forEach(([grp, name]) => {
          const inGroup = (ccType) => groupOf(ccType) === grp;
          const li = items.filter((i) => i.grp === grp);
          const gRows = rows.filter((r) => inGroup(r.cc_type));
          if (!li.length && !gRows.length) return;
          h += `<tr class="capex-row g1"><td class="reports-label-cell capex-f1 col-frozen col-frozen-1" style="left:0">${name}</td><td class="reports-label-cell capex-f2 col-frozen" style="position:sticky;left:340px;z-index:3"></td>${MONTHS.map(() => "<td></td>").join("")}<td></td></tr>`;
          const sub = Array(12).fill(0);
          ["depreciation", "amortization"].forEach((nat) => {
            const accounts = [...new Set(dest.filter((d) => inGroup(d.cc_type)).map((d) => (nat === "depreciation" ? d.depreciation_account : d.amortization_account)))];
            const values = MONTHS.map((_, m) => sum(gRows.filter((r) => r.nature === nat && r.month === m + 1), (r) => Number(r.amount)));
            values.forEach((v, m) => { sub[m] += v; totals[m] += v; });
            const li2 = li.filter((i) => i.nature === nat);
            const label = `<span class="capex-acct">${escapeHtml(accounts.join(" / "))}</span>${NATURE_LABEL[nat]}`;
            h += row("it", label, "", values, "dep", idx(li2), `${accounts.join(" / ")} · ${NATURE_LABEL[nat]}`);
          });
          h += row("g2", `Subtotal ${name.toLowerCase()}`, "", sub, "dep", idx(li), `Subtotal ${name.toLowerCase()}`);
        });
        return h + row("tot", "Total depreciação e amortização do CAPEX", "", totals, "dep", idx(items), "Total depreciação e amortização") + "</tbody>";
      }

      function openPopover(td) {
        const m = Number(td.dataset.m), key = td.dataset.key, ids = td.dataset.ids ? td.dataset.ids.split(",").map(Number) : [];
        const list = ids.map((n) => _itemsAll[n]).filter(Boolean);
        const entries = list.map((i) => ({ i, value: Number(key === "dep" ? i.dep[m] : i.values[m]) })).filter((x) => Math.abs(x.value) >= 0.005);
        if (_popover && _popover.dataset.key === `${key}:${m}:${td.dataset.title}`) { closePopover(); return; }
        closePopover();
        const isDep = key === "dep";
        const ccByNumber = (i) => `${i.cc_number} · ${i.cc_name}`;
        const rows = entries.map(({ i, value }) => ({ origin: i.name, type: i.type, mgmt: i.management || "—", cc: ccByNumber(i), account: i.account || "", value, user: i.user || "—" }));
        const cols = [["origin", "Investimento", "left"], ["type", "Tipo", "left"], ["mgmt", "Gestão", "left"], ["cc", "CC", "left"], ...(isDep ? [["account", "Conta", "left"]] : []), ["value", isDep ? "Valor gerado no mês" : "Valor", "right"], ["user", "User", "left"]];
        let sortKey = "origin", sortDir = 1;
        const sorted = () => rows.slice().sort((a, b) => (sortKey === "value" ? a.value - b.value : String(a[sortKey]).localeCompare(String(b[sortKey]), "pt-BR", { numeric: true })) * sortDir);
        const thead2 = () => cols.map(([k, l, al]) => `<th data-sort="${k}" style="padding:3px 8px 6px;font-size:0.62rem;color:${sortKey === k ? "var(--blue)" : "var(--text-faint)"};text-align:${al};font-weight:500;white-space:nowrap;cursor:pointer;user-select:none">${l}${sortKey === k ? (sortDir === 1 ? " ↑" : " ↓") : ""}</th>`).join("");
        const cell = (v, extra = "") => `<td style="padding:4px 8px;font-size:0.72rem;color:var(--text-soft);white-space:nowrap;${extra}">${escapeHtml(v || "—")}</td>`;
        const tbody = () => sorted().map((r) => `<tr>${cell(r.origin)}${cell(r.type)}${cell(r.mgmt)}${cell(r.cc)}${isDep ? cell(r.account, "font-family:monospace;color:var(--text-faint)") : ""}<td style="padding:4px 0 4px 8px;font-size:0.72rem;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">${fmt(r.value)}</td>${cell(r.user)}</tr>`).join("");
        const pop = document.createElement("div");
        pop.dataset.key = `${key}:${m}:${td.dataset.title}`;
        pop.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9800;background:var(--panel);border:0.5px solid var(--line);border-radius:12px;padding:16px 20px;width:max-content;min-width:720px;max-width:96vw;max-height:80vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,0.55)";
        pop.innerHTML = `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
            <div>
              <p style="font-size:0.65rem;color:var(--text-faint);letter-spacing:0.07em;text-transform:uppercase;margin:0 0 3px">${MONTHS[m]}</p>
              <h4 style="font-size:0.9rem;font-weight:600;color:var(--text);margin:0">${escapeHtml(td.dataset.title)}</h4>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              ${rows.length ? exportBtn() : ""}
              <button type="button" data-close style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:18px;padding:0;line-height:1">×</button>
            </div>
          </div>
          <div style="display:flex;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:0.5px solid var(--line)">
            <span style="font-size:1.1rem;font-weight:700;color:var(--text)">${fmt(sum(rows, (r) => r.value))}</span>
            <span style="font-size:0.72rem;color:var(--text-faint);margin-left:8px">${rows.length} lançamento(s)</span>
          </div>
          <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="border-bottom:0.5px solid var(--line)">${thead2()}</tr></thead><tbody>${tbody()}</tbody></table></div>`;
        pop.addEventListener("click", (e) => {
          if (e.target.closest("[data-close]")) { closePopover(); return; }
          const th = e.target.closest("th[data-sort]");
          if (th) {
            e.stopPropagation();
            sortDir = th.dataset.sort === sortKey ? -sortDir : 1; sortKey = th.dataset.sort;
            pop.querySelector("thead tr").innerHTML = thead2(); pop.querySelector("tbody").innerHTML = tbody();
            return;
          }
          if (e.target.closest(".vp-export-btn")) {
            e.stopPropagation();
            exportRowsToExcel(sorted(), [
              { label: "Investimento", value: (r) => r.origin }, { label: "Tipo", value: (r) => r.type },
              { label: "Gestão", value: (r) => r.mgmt }, { label: "CC", value: (r) => r.cc },
              ...(isDep ? [{ label: "Conta", value: (r) => r.account }] : []),
              { label: "Valor", value: (r) => Number(r.value) || 0 }, { label: "User", value: (r) => r.user },
            ], `Detalhamento_${td.dataset.title}_${MONTHS[m]}`);
          }
        });
        document.body.appendChild(pop);
        _popover = pop;
      }
      const exportBtn = () => exportButtonHtml();

      // ── Carga: cenários com CAPEX + dados do selecionado ───────────────────────────────────────────
      (async () => {
        try {
          const scenarios = (await fetchAllScenarios()).filter((s) => s.planning_version === 1);
          const srcSel = detailPanel.querySelector("#capex-src-sel");
          if (!scenarios.length) { srcSel.innerHTML = '<option value="">Nenhum cenário</option>'; body.innerHTML = '<div class="actuals-empty">Nenhum cenário de planejamento com CAPEX disponível.</div>'; return; }
          if (!scenarios.some((s) => s.id === _source)) _source = (scenarios.find((s) => s.is_default) || scenarios[0]).id;
          srcSel.innerHTML = scenarios.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
          srcSel.value = _source;
          const load = async () => {
            body.innerHTML = '<div class="actuals-empty">Carregando...</div>';
            try {
              const org = await resolveOrganizationId();
              data = await callSupabaseRpc("planning_capex_report", { p_org: org, p_scenario: _source });
              mountCc();
              paint();
            } catch (e) {
              body.innerHTML = `<div class="actuals-empty">${escapeHtml(window.vpFriendlyError ? window.vpFriendlyError(e, "Não foi possível carregar o CAPEX.") : "Não foi possível carregar o CAPEX.")}</div>`;
            }
          };
          srcSel.addEventListener("change", () => { _source = srcSel.value; _collapsed = new Set(); load(); });
          await load();
        } catch (e) {
          body.innerHTML = '<div class="actuals-empty">Não foi possível carregar os cenários.</div>';
        }
      })();
    }

    function renderSelectedCapexReport(detailPanel, reportId) {
      if (reportId !== "capexBudget") return false;
      render(detailPanel);
      return true;
    }

    // Chamado ao abrir o relatório a partir do detalhe do cenário (card Capex em Planejamento).
    function setSource(scenarioId) { if (scenarioId) _source = scenarioId; }

    return { renderSelectedCapexReport, setSource };
  }

  window.VECTON_REPORTS_CAPEX = { createReportsCapexModule };
})(window);
