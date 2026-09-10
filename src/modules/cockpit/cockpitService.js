(function attachCockpitService(window) {
  "use strict";
  const norm = value => String(value ?? "").replace(/\D/g, "");
  const quote = value => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const list = values => `(${values.map(quote).join(",")})`;
  const chunk = (values, size = 80) => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size));
  async function mapLimit(items, work) {
    const result = new Array(items.length); let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
      while (next < items.length) { const i = next++; result[i] = await work(items[i]); }
    }));
    return result.flat();
  }
  function createCockpitService(deps) {
    const cache = new Map(); let generation = 0;
    const invalidate = () => { generation++; cache.clear(); };
    function cached(key, loader) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.time < 30000) return entry.promise;
      const promise = Promise.resolve().then(loader); cache.set(key, { time: Date.now(), promise });
      promise.catch(() => { if (cache.get(key)?.promise === promise) cache.delete(key); });
      return promise;
    }
    async function pages(table, query, totals = false) {
      const rows = []; let cursor = "00000000-0000-0000-0000-000000000000", offset = 0;
      while (true) {
        const page = await deps.readRows(table, `${query}&${totals ? `order=reference_month.asc,account_number.asc&offset=${offset}` : `id=gt.${cursor}&order=id.asc`}&limit=1000`);
        rows.push(...page);
        if (page.length < 1000) return rows;
        if (!totals && (!page[page.length - 1].id || page[page.length - 1].id === cursor)) throw new Error("Paginação sem progresso");
        cursor = page[page.length - 1].id; offset += page.length;
      }
    }
    async function ledger(table, base, accounts, centers) {
      if (!accounts.length || (centers && !centers.length)) return [];
      const scopes = centers ? chunk(centers).map(ccs => {
        const ids = ccs.map(cc => cc.id).filter(Boolean), numbers = ccs.map(cc => String(cc.number)).filter(Boolean);
        return `&or=${encodeURIComponent(`(${[ids.length ? `cost_center_id.in.${list(ids)}` : "", numbers.length ? `cost_center_number.in.${list(numbers)}` : ""].filter(Boolean).join(",")})`)}`;
      }) : [""];
      const requests = chunk(accounts).flatMap(codes => scopes.map(scope => `${base}${scope}&account_number=in.${encodeURIComponent(list(codes))}&select=id,reference_month,account_number,cost_center_id,cost_center_number,amount`));
      const rows = await mapLimit(requests, query => pages(table, query));
      return [...new Map(rows.map(row => [row.id, row])).values()];
    }
    async function headcount(table, base, centers) {
      if (centers && !centers.length) return [];
      const scopes = centers ? chunk([...new Set(centers.map(cc => String(cc.number)))]).map(numbers => `&cost_center_number=in.${encodeURIComponent(list(numbers))}`) : [""];
      try { return await mapLimit(scopes, scope => pages(table, `${base}${scope}&select=id,reference_month,cost_center_number`)); }
      catch (error) { if (deps.isMissingRelationError?.(error, table)) return []; throw error; }
    }
    async function revenue(table, base, codes, year) {
      let rows;
      try { rows = await pages(table, `${base}&account_number=in.${encodeURIComponent(list(codes))}&select=account_number,reference_month,total_amount`, true); }
      catch (error) { if (!deps.isMissingRelationError?.(error, table)) throw error; rows = []; }
      let normalized = rows.map(row => ({ ...row, amount: row.total_amount }));
      if (!rows.length) normalized = await pages(table.replace("monthly_account_totals", "ledger_entries"), `${base}&account_number=in.${encodeURIComponent(list(codes))}&select=id,account_number,reference_month,amount`);
      const coverage = new Set(normalized.map(row => Number(row.reference_month)));
      return deps.buildDreReport(year, normalized).receitaLiquida.map((value, i) => coverage.has(i + 1) ? value : null);
    }
    async function load(filters) {
      if (!deps.isConfigured()) throw new Error("Supabase não configurado");
      const access = deps.getManagementAccess(filters.management);
      if (!access.options.includes(filters.management)) throw new Error("Gestão não autorizada");
      const org = await deps.resolveOrganizationId(), state = deps.getState();
      const groups = deps.getOpexStructure().flatMap(section => section.groups.map(group => ({ name: group.label, accounts: [...group.accounts] })));
      const accounts = [...new Set(groups.flatMap(group => group.accounts))], centers = access.centers;
      const accountNames = (state.dreNodes || []).map(node => ({ code: node.code, name: node.name }));
      const base = `organization_id=eq.${encodeURIComponent(org)}&reference_year=eq.${filters.year}`;
      const favorites = await cached(`${org}:${generation}:favorite:${filters.year}`, () => deps.readRows("forecast_scenarios", `${base}&is_default=eq.true&select=id,name,cutoff_month&limit=1`));
      const favorite = favorites[0], compareBase = favorite ? `${base}&scenario_id=eq.${encodeURIComponent(favorite.id)}` : base;
      const key = JSON.stringify([org, generation, deps.getSessionKey(), filters.year, favorite?.id || "budget", centers, groups]);
      const source = await cached(key, async () => {
        const codes = deps.getRevenueAccounts();
        const sources = await Promise.all([
          ledger("actuals_ledger_entries", base, accounts, centers),
          ledger(favorite ? "forecast_ledger_entries" : "budget_ledger_entries", compareBase, accounts, centers),
          headcount("headcount_entries", `${base}&load_type=eq.realizado`, centers),
          headcount(favorite ? "forecast_headcount_entries" : "headcount_entries", `${compareBase}${favorite ? "" : "&load_type=eq.orcado"}`, centers),
          // Only account/month revenue totals cross management boundaries; no people/CC details.
          cached(`${org}:${generation}:revenue:${filters.year}:real`, () => revenue("actuals_monthly_account_totals", base, codes, filters.year)),
          cached(`${org}:${generation}:revenue:${filters.year}:${favorite?.id || "budget"}`, () => revenue(favorite ? "forecast_monthly_account_totals" : "budget_monthly_account_totals", compareBase, codes, filters.year))
        ]);
        const ccById = new Map(state.costCenters.map(cc => [String(cc.id), cc]));
        const allowed = centers ? new Set(centers.map(cc => norm(cc.number))) : null;
        const scoped = rows => rows.map(row => ({ ...row, cost_center_number: ccById.get(String(row.cost_center_id))?.number ?? row.cost_center_number })).filter(row => !allowed || allowed.has(norm(row.cost_center_number)));
        return { actualRows: scoped(sources[0]), comparisonRows: scoped(sources[1]), headcountRows: scoped(sources[2]), comparisonHeadcountRows: scoped(sources[3]),
          revenueActual: sources[4], revenueComparison: sources[5], groups, costCenters: state.costCenters, accountNames,
          personnelAccounts: [...deps.getPersonnelAccounts()], hasForecast: !!favorite, comparisonLabel: favorite?.name || "Budget",
          warnings: favorite ? [] : ["Budget é o favorito no Planejamento. Sem cenário Forecast favorito, os meses futuros não são estimados."] };
      });
      return window.VECTON_COCKPIT_DATA.aggregate(filters, source);
    }
    return { load, invalidate };
  }
  window.VECTON_COCKPIT_SERVICE = { createCockpitService };
})(window);
