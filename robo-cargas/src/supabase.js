// Total de linhas a partir do cabecalho Content-Range do PostgREST ("0-0/596", "*/0", "0-9/*").
export function totalDoContentRange(valor) {
  const m = /\/(\d+)\s*$/.exec(String(valor ?? ""));
  return m ? Number(m[1]) : null;
}

// Cliente minimo do Supabase (Auth por senha + PostgREST + RPC) sem dependencias.
export class Supabase {
  constructor({ url, anonKey }) {
    this.url = url.replace(/\/$/, "");
    this.anonKey = anonKey;
    this.token = null;
  }

  async signIn(email, password) {
    const res = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: this.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Login no Vecton falhou (${res.status}): ${body.error_description || body.msg || body.message || "erro"}`);
    this.token = body.access_token;
    this.session = body; // access_token, refresh_token, expires_at, user... (usada pelo navegador dos relatorios)
    return body.user;
  }

  headers(extra = {}) {
    return { apikey: this.anonKey, Authorization: `Bearer ${this.token || this.anonKey}`, "Content-Type": "application/json", ...extra };
  }

  async request(method, path, { body, prefer } = {}) {
    const res = await fetch(`${this.url}${path}`, {
      method,
      headers: this.headers(prefer ? { Prefer: prefer } : {}),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = data && typeof data === "object" ? [data.message, data.details, data.hint].filter(Boolean).join(" | ") : String(data || res.statusText);
      throw new Error(`${method} ${path.split("?")[0]} -> ${res.status}: ${msg}`);
    }
    return data;
  }

  select(table, query = "") { return this.request("GET", `/rest/v1/${table}?${query}`); }
  insert(table, rows, { returning = false } = {}) {
    return this.request("POST", `/rest/v1/${table}`, { body: rows, prefer: returning ? "return=representation" : "return=minimal" });
  }
  update(table, query, patch) { return this.request("PATCH", `/rest/v1/${table}?${query}`, { body: patch, prefer: "return=minimal" }); }
  rpc(fn, args) { return this.request("POST", `/rest/v1/rpc/${fn}`, { body: args }); }

  // Conta as linhas de uma consulta sem baixa-las (Prefer: count=exact).
  async count(table, query = "") {
    const res = await fetch(`${this.url}/rest/v1/${table}?${query}&select=id&limit=1`, {
      headers: this.headers({ Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" })
    });
    if (!res.ok) throw new Error(`COUNT ${table} -> ${res.status}: ${await res.text()}`);
    const total = totalDoContentRange(res.headers.get("content-range"));
    if (total == null) throw new Error(`COUNT ${table}: resposta sem Content-Range`);
    return total;
  }

  // PostgREST limita cada resposta (padrao 1000 linhas): pagina por Range ate acabar.
  async selectAll(table, query = "", pageSize = 1000) {
    const out = [];
    for (let from = 0; ; from += pageSize) {
      const res = await fetch(`${this.url}/rest/v1/${table}?${query}`, {
        headers: this.headers({ Range: `${from}-${from + pageSize - 1}`, "Range-Unit": "items" })
      });
      if (!res.ok) throw new Error(`GET ${table} -> ${res.status}: ${await res.text()}`);
      const page = await res.json();
      out.push(...page);
      if (page.length < pageSize) return out;
    }
  }
}
