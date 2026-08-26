// Roda 1x/dia via pg_cron (ver supabase/120_market_commodities_schedule.sql),
// busca soja/milho/boi gordo no GiroRural e grava em public.market_commodities.
// Substitui o scraping por iframe da CEPEA (bloqueado por Cloudflare desde
// 2026-08 — ver comentário em src/modules/dashboard/marketTicker.js).
//
// TODO(alinhamento pendente): o endpoint exato, os headers de autenticação e
// o formato da resposta do GiroRural ainda não foram confirmados (a doc
// completa exige login). GIRORURAL_ENDPOINT/parseGiroRuralResponse abaixo
// são um esqueleto a ajustar assim que tivermos uma resposta real de
// exemplo — não fazer deploy antes disso.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GIRORURAL_BASE_URL = "https://api.girorural.com";
// Ajustar para o endpoint real (ex: /api/v1/grains/physical/all) assim que
// confirmado com a doc autenticada.
const GIRORURAL_ENDPOINT = "/api/v1/grains/physical/all";

type CommodityRow = {
  item_id: "soy" | "corn" | "cattle";
  label: string;
  value: number;
  pct: number;
  unit: string;
  source: string;
  quote_date: string | null;
  updated_at: string;
};

function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function corsHeaders(request: Request) {
  return {
    "Access-Control-Allow-Origin": request.headers.get("origin") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-market-commodities-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

// TODO: ajustar aos nomes de campo reais do GiroRural quando confirmados.
function parseGiroRuralResponse(payload: any): CommodityRow[] {
  const now = new Date().toISOString();
  const items: Array<{ id: CommodityRow["item_id"]; label: string; unit: string; key: string }> = [
    { id: "soy", label: "Soja", unit: "R$/sc", key: "soja" },
    { id: "corn", label: "Milho", unit: "R$/sc", key: "milho" },
    { id: "cattle", label: "Boi Gordo", unit: "R$/@", key: "boi_gordo" },
  ];
  const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const rows: CommodityRow[] = [];
  for (const item of items) {
    const entry = list.find((row: any) =>
      String(row?.produto || row?.commodity || row?.key || "").toLowerCase().includes(item.key));
    const value = Number(entry?.valor ?? entry?.value ?? entry?.price);
    if (!Number.isFinite(value)) continue;
    const pct = Number(entry?.variacao ?? entry?.pct ?? entry?.change_percent ?? 0);
    rows.push({
      item_id: item.id,
      label: item.label,
      value,
      pct: Number.isFinite(pct) ? pct : 0,
      unit: item.unit,
      source: "girorural",
      quote_date: entry?.data ?? entry?.date ?? null,
      updated_at: now,
    });
  }
  return rows;
}

async function fetchGiroRural(): Promise<CommodityRow[]> {
  const apiKey = Deno.env.get("GIRORURAL_API_KEY") || "";
  if (!apiKey) throw new Error("GIRORURAL_API_KEY não configurada.");

  const response = await fetch(`${GIRORURAL_BASE_URL}${GIRORURAL_ENDPOINT}`, {
    headers: { "X-API-Key": apiKey, "Accept": "application/json" },
  });
  if (!response.ok) throw new Error(`GiroRural HTTP ${response.status}`);
  const payload = await response.json();
  const rows = parseGiroRuralResponse(payload);
  if (!rows.length) throw new Error("GiroRural retornou payload sem itens reconhecidos.");
  return rows;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Método não suportado." }, 405);

  const expectedSecret = Deno.env.get("MARKET_COMMODITIES_CRON_SECRET") || "";
  const suppliedSecret = request.headers.get("x-market-commodities-secret") || "";
  if (!expectedSecret || suppliedSecret !== expectedSecret) return json(request, { error: "Não autorizado." }, 401);

  try {
    const rows = await fetchGiroRural();
    const admin = createAdminClient();
    const { error } = await admin.from("market_commodities").upsert(rows, { onConflict: "item_id" });
    if (error) throw new Error(`Falha ao gravar market_commodities: ${error.message}`);
    return json(request, { ok: true, updated: rows.map((row) => row.item_id) });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Falha inesperada." }, 500);
  }
});
