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

function validPeriod(year: number, month: number) {
  return Number.isInteger(year) && year >= 2000 && year <= 2200 && Number.isInteger(month) && month >= 1 && month <= 12;
}

async function updateOperation(admin: any, restoreId: string, patch: Record<string, unknown>) {
  const { error } = await admin.from("rps_restore_operations").update(patch).eq("id", restoreId);
  if (error) throw new Error(`Falha ao atualizar auditoria da restauração: ${error.message}`);
}

async function finishOperation(
  admin: any,
  restoreId: string,
  status: "succeeded" | "failed" | "rolled_back" | "rollback_failed",
  phase: string,
  errorMessage?: string | null,
  rollbackError?: string | null,
) {
  const { error } = await admin.rpc("rps_finish_restore", {
    p_restore_id: restoreId,
    p_status: status,
    p_phase: phase,
    p_error_message: errorMessage || null,
    p_rollback_error: rollbackError || null,
  });
  if (error) throw new Error(`Falha ao finalizar restauração: ${error.message}`);
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Método não suportado." }, 405);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "Corpo JSON inválido." }, 400);
  }

  const organizationId = String(body.organization_id || "");
  const year = Number(body.year);
  const month = Number(body.month);
  if (!organizationId || !validPeriod(year, month)) return json(request, { error: "Organização ou período inválido." }, 400);

  let context;
  try {
    context = await requireRpsAdmin(request, organizationId);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Não autorizado." }, 403);
  }
  const { admin, user } = context;
  const action = String(body.action || "list");

  try {
    if (action === "list") {
      // Lista organization-wide (todos os períodos empilhados, mais recente
      // primeiro) — não filtra mais por ano/mes. O período de cada backup/
      // restauração vem junto (ano,mes) pra a tela poder rotular e, no caso
      // de restore, mirar de volta no período de origem do próprio backup
      // (rps_start_restore já exige v_run.ano/mes = destino, então só se
      // restaura um backup no mês em que ele foi capturado).
      const now = new Date().toISOString();
      const [{ data: backups, error: backupsError }, { data: restores, error: restoresError }, { data: lock, error: lockError }] = await Promise.all([
        admin.from("rps_backup_runs")
          .select("id,ano,mes,kind,status,captured_at,completed_at,retention_until,source_version,snapshot_hash,verified_file_count,verified_bytes,created_by,source_restore_id")
          .eq("organization_id", organizationId)
          .eq("status", "ready").gt("retention_until", now).order("captured_at", { ascending: false }).limit(300),
        admin.from("rps_restore_operations")
          .select("id,ano,mes,backup_run_id,safety_backup_run_id,status,phase,started_at,finished_at,initiated_by,files_replaced,bytes_replaced,error_message,rollback_error")
          .eq("organization_id", organizationId)
          .order("started_at", { ascending: false }).limit(40),
        admin.from("rps_maintenance_locks").select("restore_id,locked_at,expires_at")
          .eq("organization_id", organizationId).eq("ano", year).eq("mes", month)
          .gt("expires_at", now).maybeSingle(),
      ]);
      if (backupsError) throw new Error(backupsError.message);
      if (restoresError) throw new Error(restoresError.message);
      if (lockError) throw new Error(lockError.message);
      return json(request, { backups: backups || [], restores: restores || [], lock: lock || null });
    }

    if (action === "backup_now") {
      const { data: lock } = await admin.from("rps_maintenance_locks").select("restore_id")
        .eq("organization_id", organizationId).eq("ano", year).eq("mes", month)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (lock) return json(request, { error: "O período está bloqueado por uma restauração em andamento." }, 423);
      const result = await createVerifiedBackup(admin, {
        organizationId, year, month, kind: "manual", createdBy: user.id,
      });
      return json(request, { ok: true, ...result });
    }

    if (action === "delete") {
      const backupRunId = String(body.backup_run_id || "");
      if (!backupRunId) return json(request, { error: "Selecione um backup para excluir." }, 400);

      const { data: run, error: runError } = await admin.from("rps_backup_runs")
        .select("id,organization_id,status,storage_prefix").eq("id", backupRunId).maybeSingle();
      if (runError) throw new Error(runError.message);
      if (!run || run.organization_id !== organizationId) return json(request, { error: "Backup não encontrado." }, 404);
      if (run.status !== "ready") return json(request, { error: "Este backup não está mais disponível." }, 409);

      // Mesma faxina do expurgo automático (cleanupExpiredBackups): apaga os
      // arquivos e o manifesto, mas mantém a LINHA do run como registro
      // histórico (status "expired" — não existe status "deleted" na tabela,
      // e reaproveitar o mesmo é semanticamente igual: "não pode mais ser
      // restaurado"). Preserva a auditoria de restaurações que referenciam
      // esse run_id (safety_backup_run_id / backup_run_id).
      const deletedFiles = await removePrefix(admin, BACKUP_BUCKET, run.storage_prefix);
      const { error: filesError } = await admin.from("rps_backup_files").delete().eq("run_id", run.id);
      if (filesError) throw new Error(`Falha ao limpar manifesto: ${filesError.message}`);
      const { error: snapshotError } = await admin.from("rps_backup_snapshots").delete().eq("run_id", run.id);
      if (snapshotError) throw new Error(`Falha ao limpar snapshot: ${snapshotError.message}`);
      const { error: expireError } = await admin.from("rps_backup_runs").update({
        status: "expired",
        error_message: null,
        metadata: { deleted_at: new Date().toISOString(), deleted_by: user.id },
      }).eq("id", run.id);
      if (expireError) throw new Error(`Falha ao marcar backup como excluído: ${expireError.message}`);

      return json(request, { ok: true, deletedFiles });
    }

    if (action !== "restore") return json(request, { error: "Ação não suportada." }, 400);
    const backupRunId = String(body.backup_run_id || "");
    if (!backupRunId) return json(request, { error: "Selecione um backup." }, 400);

    const { data: restoreId, error: startError } = await admin.rpc("rps_start_restore", {
      p_organization_id: organizationId,
      p_ano: year,
      p_mes: month,
      p_backup_run_id: backupRunId,
      p_initiated_by: user.id,
    });
    if (startError || !restoreId) return json(request, { error: startError?.message || "Não foi possível iniciar a restauração." }, 409);

    let safetyRunId = "";
    let storageMayHaveChanged = false;
    let databaseApplied = false;
    try {
      const safety = await createVerifiedBackup(admin, {
        organizationId,
        year,
        month,
        kind: "pre_restore",
        createdBy: user.id,
        sourceRestoreId: restoreId,
      });
      safetyRunId = safety.runId;
      await updateOperation(admin, restoreId, {
        safety_backup_run_id: safetyRunId,
        status: "running",
        phase: "safety_backup_ready",
        details: { safety_file_count: safety.fileCount, safety_bytes: safety.bytes },
      });

      storageMayHaveChanged = true;
      const storageResult = await applyStorageBackup(admin, backupRunId, `${restoreId}-target`);
      await updateOperation(admin, restoreId, {
        phase: "storage_applied",
        files_replaced: storageResult.fileCount,
        bytes_replaced: storageResult.bytes,
      });

      const { data: restoredVersion, error: databaseError } = await admin.rpc("rps_apply_restore_snapshot", {
        p_restore_id: restoreId,
      });
      if (databaseError) throw new Error(`Falha ao aplicar snapshot: ${databaseError.message}`);
      databaseApplied = true;
      await finishOperation(admin, restoreId, "succeeded", "completed");
      return json(request, {
        ok: true,
        restoreId,
        backupRunId,
        safetyBackupRunId: safetyRunId,
        restoredVersion,
        filesRestored: storageResult.fileCount,
        bytesRestored: storageResult.bytes,
      });
    } catch (restoreError) {
      const restoreMessage = restoreError instanceof Error ? restoreError.message : "Falha inesperada na restauração.";
      let rollbackMessage = "";
      let rolledBack = false;
      const { data: persistedOperation } = await admin.from("rps_restore_operations")
        .select("phase,safety_backup_run_id").eq("id", restoreId).maybeSingle();
      if (persistedOperation?.phase === "database_applied") databaseApplied = true;
      if (!safetyRunId && persistedOperation?.safety_backup_run_id) safetyRunId = persistedOperation.safety_backup_run_id;
      if (safetyRunId) {
        try {
          if (storageMayHaveChanged) await applyStorageBackup(admin, safetyRunId, `${restoreId}-rollback`);
          if (databaseApplied) {
            const { error: rollbackDbError } = await admin.rpc("rps_rollback_restore_snapshot", { p_restore_id: restoreId });
            if (rollbackDbError) throw new Error(rollbackDbError.message);
          }
          await finishOperation(admin, restoreId, "rolled_back", "rollback_completed", restoreMessage);
          rolledBack = true;
        } catch (rollbackError) {
          rollbackMessage = rollbackError instanceof Error ? rollbackError.message : "Falha inesperada no rollback.";
          await finishOperation(admin, restoreId, "rollback_failed", "rollback_failed", restoreMessage, rollbackMessage).catch(() => undefined);
        }
      } else {
        await finishOperation(admin, restoreId, "failed", "safety_backup_failed", restoreMessage).catch(() => undefined);
      }
      return json(request, {
        error: restoreMessage,
        restoreId,
        rolledBack,
        rollbackError: rollbackMessage || null,
      }, rolledBack ? 409 : 500);
    }
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Falha inesperada no gerenciamento dos backups." }, 500);
  }
});
