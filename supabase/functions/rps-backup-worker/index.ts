import {
  cleanupExpiredBackups,
  corsHeaders,
  createAdminClient,
  createVerifiedBackup,
  json,
} from "../_shared/rps-backup.ts";

function localDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localPeriod() {
  const [year, month] = localDateKey().split("-").map(Number);
  return { year, month };
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Método não suportado." }, 405);

  const expectedSecret = Deno.env.get("RPS_BACKUP_CRON_SECRET") || "";
  const suppliedSecret = request.headers.get("x-rps-backup-secret") || "";
  if (!expectedSecret || suppliedSecret !== expectedSecret) return json(request, { error: "Não autorizado." }, 401);

  try {
    const admin = createAdminClient();
    const today = localDateKey();
    const dayStart = `${today}T00:00:00-03:00`;
    const { data: snapshotRows, error } = await admin.from("rps_snapshots")
      .select("organization_id,ano,mes,updated_at").order("organization_id").order("ano").order("mes");
    if (error) throw new Error(`Falha ao listar períodos da RPS: ${error.message}`);
    const current = localPeriod();
    const recentlyChangedAt = Date.now() - (8 * 24 * 60 * 60 * 1000);
    const snapshots = (snapshotRows || []).filter(snapshot =>
      (Number(snapshot.ano) === current.year && Number(snapshot.mes) === current.month)
      || new Date(snapshot.updated_at || 0).getTime() >= recentlyChangedAt
    );

    const results: Array<Record<string, unknown>> = [];
    for (const snapshot of snapshots) {
      const { data: existing } = await admin.from("rps_backup_runs").select("id,status")
        .eq("organization_id", snapshot.organization_id).eq("ano", snapshot.ano).eq("mes", snapshot.mes)
        .eq("kind", "scheduled").gte("captured_at", dayStart).in("status", ["building", "ready"]).limit(1).maybeSingle();
      if (existing) {
        results.push({ organizationId: snapshot.organization_id, year: snapshot.ano, month: snapshot.mes, skipped: true, runId: existing.id });
        continue;
      }
      try {
        const result = await createVerifiedBackup(admin, {
          organizationId: snapshot.organization_id,
          year: snapshot.ano,
          month: snapshot.mes,
          kind: "scheduled",
        });
        results.push({ organizationId: snapshot.organization_id, year: snapshot.ano, month: snapshot.mes, ...result });
      } catch (backupError) {
        results.push({
          organizationId: snapshot.organization_id,
          year: snapshot.ano,
          month: snapshot.mes,
          error: backupError instanceof Error ? backupError.message : "Falha inesperada",
        });
      }
    }

    const cleanup = await cleanupExpiredBackups(admin);
    const failures = results.filter(result => result.error).length;
    return json(request, { ok: failures === 0, date: today, periods: results.length, failures, results, cleanup }, failures ? 207 : 200);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Falha inesperada no backup semanal." }, 500);
  }
});
