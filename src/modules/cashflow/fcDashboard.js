(function (window) {
  "use strict";
  const M = window.VECTON_FC_MODEL;
  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const fmt = v => v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const num = v => Math.abs(v) < .000001 ? 0 : v;
  const negative = v => v < -.000001 ? "fc-negative" : "";
  function createDashboard(deps) {
    const esc = deps.escapeHtml;
    let host, root, type = "year", detail = false, user = null, error = "", loading = false, revision = 0;
    let loaded = null, loadKey = "", entered = false;
    let simulation=null, scenarioList=[], saving=false;
    const expanded = new Set();
    let observer, width = 0, frame;
    const q = selector => root.querySelector(selector);
    const access = () => Boolean(deps.getUserId()) && deps.canAccess();
    function reset() { simulation=null; scenarioList=[]; saving=false; revision++; loaded = null; loadKey = ""; error = ""; detail = false; loading = false; entered = false; expanded.clear(); observer?.disconnect(); }
    function invalidate() { simulation=null; revision++; loadKey = ""; loading = false; loaded = null; }
    function leave() { entered = false; observer?.disconnect(); }
    function renderSelected(panel, id) {
      if (id !== "cashFlow") { observer?.disconnect(); entered = false; return false; }
      if (user !== deps.getUserId()) { reset(); user = deps.getUserId(); }
      host = panel;
      if (!access()) { reset(); host.innerHTML = '<div class="reports-detail-empty">Seu perfil não permite acessar o Fluxo de Caixa.</div>'; return true; }
      const nextKey = `${user}:${deps.getPeriod().year}`;
      if (!entered || nextKey !== loadKey) { entered = true; void refresh(); }
      else render();
      return true;
    }
    async function refresh() {
      const token = ++revision, session = deps.getUserId(), year = Number(deps.getPeriod().year);
      simulation=null; saving=false; scenarioList=[]; loadKey = `${session}:${year}`; loading = true; error = ""; loaded = null; render();
      try {
        const result = await deps.service.load(year);
        if (token !== revision || session !== deps.getUserId()) return;
        loaded = result;
        if(deps.service.scenarios) {
          try { const list=await deps.service.scenarios(year); if(token===revision && session===deps.getUserId()) scenarioList=list; }
          catch(e) { if(token===revision) error=`Não foi possível listar os cenários. ${e.message}`; }
        }
      } catch(e) { if (token === revision) error = `Não foi possível ler a carga anual. ${e.message}`; }
      finally { if (token === revision) { loading = false; if (access() && deps.isActive()) render(); } }
    }
    function render() {
      if (!host || !access()) return;
      const { year: rawYear, month: rawMonth } = deps.getPeriod();
      const year = Number(rawYear), month = Math.max(1, Math.min(12, Number(rawMonth)));
      const report = simulation || loaded?.report || null;
      const officialLabel = `${loaded?.report?.year || year} Oficial`;
      const period = type === "year" ? String(year) : type === "month" ? `${MONTHS[month - 1]}/${year}` : `Jan–${MONTHS[month - 1]}/${year}`;
      observer?.disconnect();
      host.innerHTML = `<div class="fc-dashboard">
        <div class="fc-heading"><div><h2>${detail ? "Fluxo de caixa detalhado" : "Fluxo de caixa"}</h2><p>Empresa consolidada · ${period} · Valores em R$</p></div><div class="fc-header-controls"><div class="fc-period-control"><div class="fc-period-seg" role="group" aria-label="Visão do fluxo de caixa">${[["month", "Mês"], ["YTD", "YTD"], ["year", "Ano"]].map(([key, label]) => `<button type="button" class="period-month-button" data-fc-period="${key}" aria-pressed="${type === key}">${label}</button>`).join("")}</div></div><label class="fc-header-scenario"><span>Cenário</span> <select data-fc-scenario ${loading || saving ? "disabled" : ""}><option value="">${officialLabel}</option>${scenarioList.map(n=>`<option value="${esc(n.id)}" ${loaded?.scenario?.id===n.id ? "selected" : ""} title="${esc(n.name)} · ${n.is_shared ? "Compartilhado" : "Pessoal"} · ${new Date(n.created_at).toLocaleString("pt-BR")}">${esc(n.name)}</option>`).join("")}</select></label>${window.VECTON_FC_EXPORT.menu(loading || saving || !report)}</div></div>
        ${loading ? '<p class="fc-load-status" role="status">Carregando o fluxo de caixa…</p>' : !report ? '<p class="fc-load-status">Nenhuma carga anual aplicada para este ano</p>' : ""}
        ${error ? `<p class="fc-message fc-negative" role="alert">${esc(error)}</p>` : ""}
        ${detail ? `<div class="fc-simulation-bar">${report ? `<input data-fc-scenario-name aria-label="Nome do novo cenário" maxlength="15" placeholder="Nome do novo cenário" ${saving ? "disabled" : ""}><button class="ghost-button" data-fc-save ${saving ? "disabled" : ""}>${saving ? "Salvando…" : "Salvar novo cenário"}</button><button class="ghost-button" data-fc-restore ${!simulation || saving ? "disabled" : ""}>Desfazer alterações</button>` : ""}${canDeleteScenario() ? `<button class="delete-button secondary-danger" data-fc-delete ${saving || loading ? "disabled" : ""}>Excluir cenário</button>` : ""}<span role="status">${simulation ? "Simulação com alterações não salvas" : loaded?.scenario ? "Cenário salvo · " + esc(loaded.scenario.name) : officialLabel}</span></div>` : ""}
        ${detail ? detailMarkup(report, year, month) : dashboardMarkup(report, year, month, period)}
      </div>`;
      root = host.querySelector(".fc-dashboard");
      window.VECTON_FC_EXPORT.bind(root,()=>({report:simulation||loaded?.report,type,month,detail,period,scenario:loaded?.scenario?.name||officialLabel,dirty:Boolean(simulation)}),deps);
      q("[data-fc-scenario]").onchange=event=>{void switchScenario(event.target.value);};
      q("[data-fc-delete]")?.addEventListener("click",()=>{void deleteScenario();});
      q("[data-fc-save]")?.addEventListener("click",()=>{void saveScenario();});
      q("[data-fc-restore]")?.addEventListener("click",async()=>{if(await discardChanges()){simulation=null;render();}});
      root.querySelectorAll("[data-fc-edit]").forEach(input=>{
        input.onchange=()=>editValue(input);
        input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();input.blur();} if(event.key==='Escape'){input.value=input.dataset.original;input.blur();}};
      });
      root.querySelectorAll("[data-fc-period]").forEach(button => { button.onclick = () => { type = button.dataset.fcPeriod; render(); }; });
      q("[data-fc-detail]")?.addEventListener("click", () => { detail = true; render(); q("[data-fc-back]")?.focus(); });
      root.querySelectorAll("[data-fc-back]").forEach(button => button.addEventListener("click", () => { detail = false; render(); q("[data-fc-detail]")?.focus(); }));
      root.querySelectorAll("[data-fc-expand]").forEach(button => { button.onclick = () => { const key = button.dataset.fcExpand; expanded.has(key) ? expanded.delete(key) : expanded.add(key); render(); }; });
      if (report && !detail) {
        const draw = () => { if (!root?.isConnected || !q(".fc-trend")) return; drawTrend(report, month); drawBridge(report, month); };
        draw(); width = root.clientWidth;
        observer = new ResizeObserver(() => { if (root.clientWidth !== width) { width = root.clientWidth; cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); } });
        observer.observe(root);
      }
    }
    async function discardChanges() {
      return !simulation || !deps.confirm || await deps.confirm("Descartar as alterações não salvas desta simulação?");
    }
    async function switchScenario(id) {
      if(saving || loading) return;
      if(!await discardChanges()){render();return;}
      if(!id){await refresh();return;}
      const token=++revision, session=deps.getUserId();
      loading=true;simulation=null;error="";render();
      try {
        const result=await deps.service.scenario(id);
        if(token===revision && session===deps.getUserId()) loaded=result;
      } catch(e){if(token===revision) error=e.message;}
      finally{if(token===revision){loading=false;render();}}
    }
    function canDeleteScenario() {
      const scenario=loaded?.scenario;
      return Boolean(scenario && (scenario.created_by===deps.getUserId() || scenario.is_shared && deps.isAdmin?.()));
    }
    async function deleteScenario() {
      if(!canDeleteScenario() || saving || loading) return;
      const selected=loaded.scenario, token=revision, session=deps.getUserId();
      if(!await deps.confirm(`Excluir o cenário “${selected.name}”? Esta ação não pode ser desfeita.${simulation ? " As alterações não salvas também serão descartadas." : ""}`)) return;
      if(token!==revision || session!==deps.getUserId() || loaded?.scenario?.id!==selected.id || !canDeleteScenario() || saving || loading) return;
      saving=true;error="";render();
      try {
        await deps.service.deleteScenario(selected.id);
        if(token!==revision || session!==deps.getUserId()) return;
        await refresh();
      } catch(e) {if(token===revision){error=`Não foi possível excluir o cenário. ${e.message}`;}}
      finally {if(token===revision){saving=false;render();}}
    }
    async function saveScenario() {
      if(!loaded || saving || loading) return;
      const name=q("[data-fc-scenario-name]").value.trim();
      if([...name].length>15){q("[data-fc-scenario-name]").setCustomValidity("Use no máximo 15 caracteres.");q("[data-fc-scenario-name]").reportValidity();return;}
      q("[data-fc-scenario-name]").setCustomValidity("");
      if(!name){q("[data-fc-scenario-name]").focus();return;}
      const token=revision, session=deps.getUserId(), report=simulation||loaded.report;
      saving=true;error="";render();
      try {
        const id=await deps.service.saveScenario(loaded,report,name);
        if(token!==revision || session!==deps.getUserId()) return;
        const [saved,list]=await Promise.all([deps.service.scenario(id),deps.service.scenarios(report.year)]);
        if(token!==revision || session!==deps.getUserId()) return;
        loaded=saved;scenarioList=list;simulation=null;
      } catch(e){if(token===revision) error=`Não foi possível salvar o cenário. ${e.message}`;}
      finally{if(token===revision){saving=false;render();}}
    }
    function editValue(input) {
      if(saving || loading || !loaded || !access()) return;
      const current=simulation||loaded.report, key=input.dataset.fcEdit, month=Number(input.dataset.month);
      if(!["Fcst","Bud"].includes(current.kinds[month])) return;
      const text=input.value.trim();
      const valid=/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,4})?$/.test(text);
      const value=Number(text.replace(/\./g,"").replace(",","."));
      if(!valid || !Number.isFinite(value) || Math.abs(value)>=1e16 || key==='quantities' && (!Number.isSafeInteger(value)||value<0)) {
        input.setCustomValidity(key==='quantities'?"Informe uma quantidade inteira e não negativa.":"Informe um valor válido, por exemplo: -1.250.000,50."); input.reportValidity();input.value=input.dataset.original;input.setCustomValidity("");return;
      }
      input.setCustomValidity("");
      if(key!=='quantities' && !current.structure.some(n=>n.seed_key===key && n.node_class==='Analitica')) return;
      const movements=Object.fromEntries(Object.entries(current.movements).map(([k,v])=>[k,[...v]])), quantities=[...current.quantities];
      if(key==='quantities') quantities[month]=value; else movements[key][month]=value;
      simulation=M.calculate({...current,movements,quantities},current.structure);
      const scroll=q('.fc-detail-scroll'), top=scroll.scrollTop,left=scroll.scrollLeft;
      const name=q('[data-fc-scenario-name]')?.value||"";
      render();q('.fc-detail-scroll').scrollTop=top;q('.fc-detail-scroll').scrollLeft=left;q('[data-fc-scenario-name]').value=name;
    }
    const emptyChart = '<div class="fc-chart-empty">Aguardando dados do período</div>';
    const footer = '<div class="fc-panel-footer"><span>Saldo é posição de fechamento; movimentos acumulam conforme a visão.</span><span>R$</span></div>';
    function dashboardMarkup(report, year, month, period) {
      const selected = report && M.select(report, type, month);
      const cards = [["Saldo final", selected?.closing, selected ? `Posição em ${MONTHS[selected.end - 1]}/${year}` : period], ["Geração líquida", selected?.sum("net"), period], ["Caixa operacional", selected?.sum("operacional"), period], ["Menor saldo mensal", selected?.minimum, period]];
      return `<div class="fc-kpis">${cards.map(([label, value, caption]) => `<article class="fc-kpi"><span>${label}</span><strong class="${negative(value)}"><small>R$</small> ${fmt(value)}</strong><small>${caption}</small></article>`).join("")}</div>
        <div class="fc-chart-grid"><section class="fc-panel"><header><h3>Evolução do saldo</h3><span>R$</span></header><div class="fc-legend"><span class="fc-legend-real">Real</span><span class="fc-legend-fcst">Fcst</span><span class="fc-legend-bud">Bud</span></div><div class="fc-trend">${emptyChart}</div></section><section class="fc-panel"><header><h3>Saídas operacionais</h3><span>R$</span></header>${ranking(selected)}</section></div>
        <section class="fc-panel"><header><h3>Ponte do FC</h3><span>${period} · R$</span></header><div class="fc-bridge">${emptyChart}</div></section>
        <section class="fc-panel"><header><h3>Demonstrativo gerencial</h3><button class="ghost-button" type="button" data-fc-detail>Ver FC detalhado</button></header><div class="fc-table-scroll"><table><thead><tr><th>Atividade</th>${(type === "year" ? [`Até ${MONTHS[month - 1]}`, "Restante do ano", String(year)] : [period]).map(label => `<th>${label}</th>`).join("")}</tr></thead><tbody>${summary(report, month)}</tbody></table></div>${footer}</section>`;
    }
    function ranking(selected) {
      if (!selected) return emptyChart;
      const total = -selected.sum("saidas");
      const items = [["linha-19", "Matéria-prima"], ["linha-26", "RH"], ["linha-48", "Serviços de terceiros"], ["linha-30", "Comissões"]].map(([key, name]) => ({ name, value: -selected.sum(key) }));
      const rest = total - items.reduce((s, n) => s + n.value, 0);
      items.sort((a, b) => b.value - a.value); items.push({ name: "Demais saídas", value: rest });
      return `<div class="fc-ranking">${items.map(({ name, value }) => { const percent = total ? value / total * 100 : 0; return `<div data-fc-rank><div><span>${name}</span><strong>${fmt(value)} <small>· ${percent.toFixed(0)}%</small></strong></div><div class="fc-bar-track"><span style="width:${Math.max(0, Math.min(100, percent))}%"></span></div></div>`; }).join("")}</div><div class="fc-ranking-total"><span>Total das saídas</span><strong>${fmt(total)}</strong></div>`;
    }
    function summary(report, month) {
      function cells(key) {
        if (!report) return Array(type === "year" ? 3 : 1).fill('<td>—</td>').join("");
        const selected = M.select(report, type, month);
        const values = type !== "year" ? [key === "balance" ? selected.closing : selected.sum(key)] : key === "balance" ? [report.values.balance[month - 1], report.values.balance[11], report.values.balance[11]] : [report.values[key].slice(0, month).reduce((a,b) => a+b, 0), report.values[key].slice(month).reduce((a,b) => a+b, 0), selected.sum(key)];
        return values.map(v => `<td class="${negative(v)}">${fmt(num(v))}</td>`).join("");
      }
      function row(key, name, total = false, depth = 0) {
        const children = report?.structure.filter(n => n.parent_key === key) || [];
        return `<tr class="${total ? "fc-total-row" : ""}"><th scope="row" style="padding-left:${10 + depth * 18}px">${children.length ? `<button type="button" data-fc-expand="${esc(key)}" aria-expanded="${expanded.has(key)}">${expanded.has(key) ? "−" : "+"} ${esc(name)}</button>` : esc(name)}</th>${cells(key)}</tr>` + (expanded.has(key) ? children.map(n => row(n.seed_key, n.name, false, depth + 1)).join("") : "");
      }
      return [["entradas", "Entradas operacionais"], ["saidas", "Saídas operacionais"], ["operacional", "Caixa operacional", true], ["investimentos", "Investimentos"], ["financeiro", "Financeiro"], ["net", "Geração líquida de caixa", true], ["balance", "Saldo final", true]].map(args => row(...args)).join("");
    }
    function detailMarkup(report, year, month) {
      let rows = "";
      if (report) {
        const ordered = [];
        const visit = parent => report.structure.filter(n => n.parent_key === parent)
          .sort((a,b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"))
          .forEach(n => {
            const row = { name: n.name, key: n.seed_key, analytic: n.node_class === "Analitica" };
            const closing = ["operacional", "investimentos", "financeiro"].includes(n.seed_key);
            if (!closing) ordered.push(row);
            visit(n.seed_key);
            if (closing) ordered.push(row);
          });
        visit(null);
        const fixed = [
          { order: 4, name: "Máquinas vendidas", values: report.quantities || Array(12).fill(0), quantity: true, key: "quantities" },
          { order: 5, name: "Saldo inicial", values: [report.opening, ...report.values.balance.slice(0, 11)], position: true },
          { order: 6, name: "Saldos bancários", key: "balance", position: true },
          { order: 8, name: "Geração líquida de caixa", key: "net" },
          ...ordered,
          { order: 94, name: "Fluxo de Caixa Líquido", key: "net" }
        ];
        rows = fixed.map(row => {
          const values = row.values || report.values[row.key];
          const total = row.position ? (row.order === 5 ? report.opening : values[11]) : values.reduce((a,b) => a+b, 0);
          return `<tr class="${row.analytic ? "fc-detail-analytic" : "fc-total-row"}"><th scope="row">${esc(row.name)}</th>${[...values, total].map((v, i) => `<td class="${negative(v)} ${i === month - 1 ? "fc-reference-col" : ""}">${i<12 && ["Fcst","Bud"].includes(report.kinds[i]) && (row.analytic || row.quantity) ? `<input class="fc-simulation-input ${negative(v)}" data-fc-edit="${esc(row.key)}" data-month="${i}" data-original="${v.toLocaleString("pt-BR",{maximumFractionDigits:4})}" aria-label="${esc(row.name)} · ${MONTHS[i]} ${report.kinds[i]}" inputmode="decimal" value="${v.toLocaleString("pt-BR",{maximumFractionDigits:4})}" ${saving ? "disabled" : ""}>` : row.quantity ? v.toLocaleString("pt-BR") : fmt(num(v))}</td>`).join("")}</tr>`;
        }).join("");
      }
      return `<section class="fc-panel"><header><h3>Fluxo de caixa detalhado · ${year}</h3><button class="ghost-button" type="button" data-fc-back>Voltar ao dashboard</button></header><div class="fc-table-scroll fc-detail-scroll" tabindex="0" aria-label="Fluxo de caixa completo, role para consultar todas as contas e meses"><table><thead><tr><th>Atividade</th>${MONTHS.map((m,i) => `<th class="${i === month - 1 ? "fc-reference-col" : ""}">${m}<small>${report?.kinds[i] || "—"}</small></th>`).join("")}<th>${year}</th></tr></thead><tbody>${rows}</tbody></table></div><div class="fc-panel-footer"><span>Fcst/Bud: edite contas e quantidades · Real bloqueado · Subtotais e saldos calculados</span><span>R$</span></div></section>`;
    }
    function drawTrend(report, month) {
      const holder = q(".fc-trend"), selected = M.select(report, type, month);
      const values = type === "month" ? [selected.opening, selected.closing] : report.values.balance.slice(0, selected.end);
      const labels = type === "month" ? ["Inicial", MONTHS[month - 1]] : MONTHS.slice(0, selected.end);
      const kinds = type === "month" ? [month > 1 ? report.kinds[month - 2] : "Real", report.kinds[month - 1]] : report.kinds.slice(0, selected.end);
      const w = Math.max(280, holder.clientWidth), h = 245, left = 82, right = w - 14, top = 18, bottom = 204;
      const low = Math.min(0, ...values), high = Math.max(0, ...values), span = Math.max(1, high - low), min = low < 0 ? low - span * .1 : 0, max = high + span * .15;
      const step = (right - left) / Math.max(1, values.length - 1), x = i => values.length === 1 ? (left + right) / 2 : left + step * i, y = v => bottom - (v - min) / (max - min) * (bottom - top);
      let svg = '<defs><linearGradient id="fc-trend-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#8b5cf6" stop-opacity=".27"/><stop offset="1" stop-color="#8b5cf6" stop-opacity=".015"/></linearGradient></defs>';
      kinds.forEach((kind,i) => { if (kind !== "Real") { const start = i ? x(i) - step / 2 : left, end = i === values.length - 1 ? right : x(i) + step / 2; svg += `<rect data-forecast-zone x="${start}" y="${top}" width="${Math.max(0, end - start)}" height="${bottom - top}" fill="#4f7cff" opacity=".10"/>`; } });
      for (let i = 0; i <= 3; i++) { const v = min + (max - min) * i / 3; svg += `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" class="fc-grid-line"/><text x="${left - 7}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`; }
      const curve = i => `C ${(x(i-1)+x(i))/2} ${y(values[i-1])}, ${(x(i-1)+x(i))/2} ${y(values[i])}, ${x(i)} ${y(values[i])}`;
      if (values.length > 1) svg += `<path d="M ${x(0)} ${y(values[0])} ${values.slice(1).map((_,i) => curve(i+1)).join(" ")} L ${x(values.length-1)} ${y(0)} L ${x(0)} ${y(0)} Z" fill="url(#fc-trend-fill)"/>`;
      values.forEach((v,i) => {
        if (i) svg += `<path data-fc-curve d="M ${x(i-1)} ${y(values[i-1])} ${curve(i)}" fill="none" stroke="${kinds[i] === "Bud" ? "#d8aa58" : "#8b5cf6"}" stroke-width="2.4" stroke-linecap="round" ${kinds[i] !== "Real" ? 'stroke-dasharray="5 4"' : ""}/>`;
        svg += `<circle cx="${x(i)}" cy="${y(v)}" r="2.8" fill="${kinds[i] === "Bud" ? "#d8aa58" : "#8b5cf6"}"/>`;
        if (w > 450 || values.length < 5 || (i % 2 === 0 && i < values.length - 2) || i === values.length - 1) svg += `<text x="${x(i)}" y="229" text-anchor="${i === values.length - 1 ? "end" : "middle"}">${labels[i]}</text>`;
      });
      holder.innerHTML = `<svg viewBox="0 0 ${w} ${h}" tabindex="0" role="img" aria-label="Evolução do saldo. Use as setas para consultar os valores.">${svg}<line class="fc-crosshair" y1="${top}" y2="${bottom}" visibility="hidden"/></svg><div class="fc-chart-tip" role="tooltip" hidden></div>`;
      const chart = holder.querySelector("svg"), tip = holder.querySelector(".fc-chart-tip"), cross = holder.querySelector(".fc-crosshair"); let index = 0;
      function show(i) { index = i; tip.innerHTML = `<span>${labels[i]} · ${kinds[i]}</span><strong>R$ ${fmt(values[i])}</strong>`; tip.hidden = false; tip.style.left = `${Math.max(0, Math.min(w - tip.offsetWidth, x(i) - tip.offsetWidth / 2))}px`; tip.style.top = `${Math.max(0, y(values[i]) - 44)}px`; cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible"); }
      function hide() { tip.hidden = true; cross.setAttribute("visibility", "hidden"); }
      chart.onpointermove = event => { const bounds = chart.getBoundingClientRect(); show(Math.max(0, Math.min(values.length - 1, Math.round(((event.clientX - bounds.left) * w / bounds.width - left) / step)))); };
      chart.onpointerleave = hide; chart.onblur = hide; chart.onfocus = () => show(index);
      chart.onkeydown = event => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); show(Math.max(0, Math.min(values.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)))); } if (event.key === "Escape") hide(); };
    }
    function drawBridge(report, month) {
      const holder = q(".fc-bridge"), s = M.select(report, type, month), values = [s.opening, s.sum("operacional"), s.sum("investimentos"), s.sum("financeiro"), s.closing];
      const labels = ["Saldo inicial", "Operacional", "Investimentos", "Financeiro", "Saldo final"], levels = [0, values[0], values[0]+values[1], values[0]+values[1]+values[2], 0];
      const w = Math.max(300, holder.clientWidth), h = w < 520 ? 245 : 215, bottom = h - 52;
      const low = Math.min(0, ...levels, ...levels.map((v,i) => v + values[i])), high = Math.max(0, ...levels, ...levels.map((v,i) => v + values[i])), span = Math.max(1, high - low);
      const y = v => bottom - (v - low) / span * (bottom - 38), step = (w - 24) / 5, bw = Math.min(100, step * .6);
      let svg = '<defs>' + [["blue", "#668dff", "#243e8c"], ["cyan", "#36c8bd", "#075564"], ["red", "#fa8b91", "#8e2938"]].map(([id,a,b]) => `<linearGradient id="fc-bridge-${id}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join("") + '</defs>';
      svg += `<line x1="12" x2="${w-12}" y1="${y(0)}" y2="${y(0)}" class="fc-grid-line"/>`;
      values.forEach((v,i) => { const a = levels[i], b = a+v, x = 12+i*step+(step-bw)/2; svg += `<rect x="${x}" y="${y(Math.max(a,b))}" width="${bw}" height="${Math.max(1, Math.abs(y(a)-y(b)))}" rx="4" fill="url(#fc-bridge-${i===0 || i===4 ? "blue" : v >= 0 ? "cyan" : "red"})"/><text class="fc-svg-value" x="${x+bw/2}" y="${y(Math.max(a,b))-9}" text-anchor="middle">${v > 0 && i > 0 && i < 4 ? "+" : ""}${fmt(num(v))}</text><text x="${x+bw/2}" y="${bottom+23}" text-anchor="${w<520 ? "end" : "middle"}" ${w<520 ? `transform="rotate(-27 ${x+bw/2} ${bottom+23})"` : ""}>${labels[i]}</text>`; if (i<4) svg += `<line x1="${x+bw}" x2="${x+step}" y1="${y(b)}" y2="${y(b)}" class="fc-grid-line"/>`; });
      holder.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Ponte do FC: saldo inicial, operacional, investimentos, financeiro e saldo final">${svg}</svg>`;
    }
    return { renderSelected, reset, invalidate, leave };
  }
  window.VECTON_FC_DASHBOARD = { createDashboard };
})(window);
