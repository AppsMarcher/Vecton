// Mantido autocontido para também permitir deploy direto pelo Supabase Dashboard.
// A CLI pode continuar usando o mesmo arquivo sem configuração adicional.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const ACTIVE_BUCKET = "rps-attachments";
export const BACKUP_BUCKET = "rps-attachments-backup";
const PAGE_SIZE = 100;
const FILE_CONCURRENCY = 3;

type StorageEntry = {
  name: string;
  id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type BackupParams = {
  organizationId: string;
  year: number;
  month: number;
  kind: "scheduled" | "manual" | "pre_restore";
  createdBy?: string | null;
  sourceRestoreId?: string | null;
};

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export function createAnonClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url || !anonKey) throw new Error("SUPABASE_URL/SUPABASE_ANON_KEY não configurados.");
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

export function corsHeaders(request: Request) {
  return {
    "Access-Control-Allow-Origin": request.headers.get("origin") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-rps-backup-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function json(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

export function periodKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function periodStoragePrefix(organizationId: string, year: number, month: number) {
  return `${organizationId}/${periodKey(year, month)}`;
}

function joinPath(base: string, name: string) {
  return base ? `${base}/${name}` : name;
}

function isFolder(entry: StorageEntry) {
  return !entry.id && !entry.metadata;
}

export async function listFilesRecursive(client: any, bucket: string, path = "") {
  const result: Array<{ path: string; metadata: Record<string, unknown> | null }> = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client.storage.from(bucket).list(path, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Falha ao listar ${bucket}/${path}: ${error.message}`);
    const entries = (data || []) as StorageEntry[];
    for (const entry of entries) {
      const fullPath = joinPath(path, entry.name);
      if (isFolder(entry)) result.push(...await listFilesRecursive(client, bucket, fullPath));
      else result.push({ path: fullPath, metadata: entry.metadata || null });
    }
    if (entries.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return result;
}

export async function removePaths(client: any, bucket: string, paths: string[]) {
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await client.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (error) throw new Error(`Falha ao remover arquivos de ${bucket}: ${error.message}`);
  }
}

export async function removePrefix(client: any, bucket: string, prefix: string) {
  const files = await listFilesRecursive(client, bucket, prefix);
  if (files.length) await removePaths(client, bucket, files.map(file => file.path));
  return files.length;
}

async function sha256(blob: Blob) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  return Array.from(bytes).map(value => value.toString(16).padStart(2, "0")).join("");
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, worker));
  return output;
}

async function insertManifest(client: any, rows: Record<string, unknown>[]) {
  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await client.from("rps_backup_files").insert(rows.slice(index, index + 200));
    if (error) throw new Error(`Falha ao gravar manifesto: ${error.message}`);
  }
}

export async function createVerifiedBackup(client: any, params: BackupParams) {
  const { data: runId, error: captureError } = await client.rpc("rps_capture_backup", {
    p_organization_id: params.organizationId,
    p_ano: params.year,
    p_mes: params.month,
    p_kind: params.kind,
    p_created_by: params.createdBy || null,
    p_source_restore_id: params.sourceRestoreId || null,
  });
  if (captureError || !runId) throw new Error(`Falha ao capturar snapshot: ${captureError?.message || "run_id ausente"}`);

  const { data: run, error: runError } = await client.from("rps_backup_runs")
    .select("id,storage_prefix").eq("id", runId).single();
  if (runError || !run) throw new Error(`Falha ao carregar execução do backup: ${runError?.message || "não encontrada"}`);

  try {
    const sourcePrefix = periodStoragePrefix(params.organizationId, params.year, params.month);
    const sourceFiles = await listFilesRecursive(client, ACTIVE_BUCKET, sourcePrefix);
    let expectedBytes = 0;

    const manifest = await mapConcurrent(sourceFiles, FILE_CONCURRENCY, async file => {
      const { data: sourceBlob, error: sourceError } = await client.storage.from(ACTIVE_BUCKET).download(file.path);
      if (sourceError || !sourceBlob) throw new Error(`Falha ao ler ${file.path}: ${sourceError?.message || "arquivo ausente"}`);
      const sourceHash = await sha256(sourceBlob);
      const backupPath = `${run.storage_prefix}/${file.path}`;
      const contentType = String(file.metadata?.mimetype || sourceBlob.type || "application/octet-stream");
      const { error: uploadError } = await client.storage.from(BACKUP_BUCKET).upload(backupPath, sourceBlob, {
        contentType,
        upsert: false,
      });
      if (uploadError) throw new Error(`Falha ao copiar ${file.path}: ${uploadError.message}`);

      const { data: verificationBlob, error: verificationError } = await client.storage.from(BACKUP_BUCKET).download(backupPath);
      if (verificationError || !verificationBlob) throw new Error(`Falha ao verificar ${backupPath}: ${verificationError?.message || "arquivo ausente"}`);
      const verificationHash = await sha256(verificationBlob);
      if (verificationHash !== sourceHash || verificationBlob.size !== sourceBlob.size) {
        throw new Error(`Verificação de integridade falhou para ${file.path}`);
      }
      expectedBytes += sourceBlob.size;
      return {
        run_id: run.id,
        original_path: file.path,
        backup_path: backupPath,
        size_bytes: sourceBlob.size,
        sha256: sourceHash,
        content_type: contentType,
      };
    });

    await insertManifest(client, manifest);
    const { error: finalizeError } = await client.from("rps_backup_runs").update({
      status: "ready",
      completed_at: new Date().toISOString(),
      expected_file_count: manifest.length,
      verified_file_count: manifest.length,
      expected_bytes: expectedBytes,
      verified_bytes: expectedBytes,
      error_message: null,
    }).eq("id", run.id);
    if (finalizeError) throw new Error(`Falha ao finalizar backup: ${finalizeError.message}`);
    return { runId: run.id as string, fileCount: manifest.length, bytes: expectedBytes };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada no backup.";
    await client.from("rps_backup_runs").update({
      status: "failed", completed_at: new Date().toISOString(), error_message: message,
    }).eq("id", run.id);
    throw error;
  } finally {
    await client.from("rps_maintenance_locks").delete().eq("backup_run_id", run.id);
  }
}

async function getManifest(client: any, runId: string) {
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await client.from("rps_backup_files")
      .select("original_path,backup_path,size_bytes,sha256,content_type")
      .eq("run_id", runId).order("id").range(from, from + 999);
    if (error) throw new Error(`Falha ao ler manifesto: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < 1000) break;
    from += 1000;
  }
  return rows;
}

export async function applyStorageBackup(client: any, runId: string, stageToken: string) {
  const { data: run, error: runError } = await client.from("rps_backup_runs")
    .select("id,organization_id,ano,mes,status,verified_file_count,verified_bytes")
    .eq("id", runId).single();
  if (runError || !run || run.status !== "ready") throw new Error("Backup de anexos indisponível.");
  const manifest = await getManifest(client, runId);
  if (manifest.length !== Number(run.verified_file_count || 0)) throw new Error("Manifesto de anexos incompleto.");

  const stagingRoot = `_rps_restore_staging/${stageToken}`;
  try {
    const staged = await mapConcurrent(manifest, FILE_CONCURRENCY, async file => {
      const { data: blob, error } = await client.storage.from(BACKUP_BUCKET).download(file.backup_path);
      if (error || !blob) throw new Error(`Falha ao ler backup ${file.original_path}: ${error?.message || "ausente"}`);
      if (blob.size !== Number(file.size_bytes) || await sha256(blob) !== file.sha256) {
        throw new Error(`Backup corrompido: ${file.original_path}`);
      }
      const stagePath = `${stagingRoot}/${file.original_path}`;
      const { error: stageError } = await client.storage.from(ACTIVE_BUCKET).upload(stagePath, blob, {
        contentType: file.content_type || blob.type || "application/octet-stream",
        upsert: false,
      });
      if (stageError) throw new Error(`Falha no staging de ${file.original_path}: ${stageError.message}`);
      return { ...file, stagePath };
    });

    const activePrefix = periodStoragePrefix(run.organization_id, run.ano, run.mes);
    const currentFiles = await listFilesRecursive(client, ACTIVE_BUCKET, activePrefix);
    if (currentFiles.length) await removePaths(client, ACTIVE_BUCKET, currentFiles.map(file => file.path));

    await mapConcurrent(staged, FILE_CONCURRENCY, async file => {
      const { data: blob, error } = await client.storage.from(ACTIVE_BUCKET).download(file.stagePath);
      if (error || !blob) throw new Error(`Staging indisponível para ${file.original_path}`);
      const { error: uploadError } = await client.storage.from(ACTIVE_BUCKET).upload(file.original_path, blob, {
        contentType: file.content_type || blob.type || "application/octet-stream",
        upsert: true,
      });
      if (uploadError) throw new Error(`Falha ao publicar ${file.original_path}: ${uploadError.message}`);
      const { data: finalBlob, error: finalError } = await client.storage.from(ACTIVE_BUCKET).download(file.original_path);
      if (finalError || !finalBlob || finalBlob.size !== Number(file.size_bytes) || await sha256(finalBlob) !== file.sha256) {
        throw new Error(`Verificação final falhou para ${file.original_path}`);
      }
      return true;
    });
    return { fileCount: manifest.length, bytes: Number(run.verified_bytes || 0), deletedCount: currentFiles.length };
  } finally {
    await removePrefix(client, ACTIVE_BUCKET, stagingRoot).catch(() => 0);
  }
}

export async function cleanupExpiredBackups(client: any) {
  const { data: runs, error } = await client.from("rps_backup_runs")
    .select("id,storage_prefix").lt("retention_until", new Date().toISOString())
    .in("status", ["ready", "failed"]).limit(500);
  if (error) throw new Error(`Falha ao listar backups expirados: ${error.message}`);
  let deletedRuns = 0;
  let deletedFiles = 0;
  for (const run of runs || []) {
    deletedFiles += await removePrefix(client, BACKUP_BUCKET, run.storage_prefix);
    const { error: filesError } = await client.from("rps_backup_files").delete().eq("run_id", run.id);
    if (filesError) throw new Error(`Falha ao limpar manifesto expirado: ${filesError.message}`);
    const { error: snapshotError } = await client.from("rps_backup_snapshots").delete().eq("run_id", run.id);
    if (snapshotError) throw new Error(`Falha ao limpar snapshot expirado: ${snapshotError.message}`);
    const { error: expireError } = await client.from("rps_backup_runs").update({
      status: "expired", error_message: null, metadata: { storage_removed_at: new Date().toISOString() },
    }).eq("id", run.id);
    if (expireError) throw new Error(`Falha ao expirar backup: ${expireError.message}`);
    deletedRuns += 1;
  }
  return { deletedRuns, deletedFiles };
}

export async function requireRpsAdmin(request: Request, organizationId: string) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Não autenticado.");
  const authClient = createAnonClient();
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) throw new Error("Sessão inválida.");
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from("user_profiles")
    .select("access_role").eq("organization_id", organizationId)
    .eq("user_id", authData.user.id).maybeSingle();
  if (profileError || !profile || !["admin", "super_admin"].includes(profile.access_role)) {
    throw new Error("Somente administradores podem gerenciar backups da RPS.");
  }
  return { admin, user: authData.user };
}

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
