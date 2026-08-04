import {
  applyStorageBackup,
  corsHeaders,
  createVerifiedBackup,
  json,
  requireRpsAdmin,
} from "../_shared/rps-backup.ts";

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
      const now = new Date().toISOString();
      const [{ data: backups, error: backupsError }, { data: restores, error: restoresError }, { data: lock, error: lockError }] = await Promise.all([
        admin.from("rps_backup_runs")
          .select("id,kind,status,captured_at,completed_at,retention_until,source_version,snapshot_hash,verified_file_count,verified_bytes,created_by,source_restore_id")
          .eq("organization_id", organizationId).eq("ano", year).eq("mes", month)
          .eq("status", "ready").gt("retention_until", now).order("captured_at", { ascending: false }).limit(80),
        admin.from("rps_restore_operations")
          .select("id,backup_run_id,safety_backup_run_id,status,phase,started_at,finished_at,initiated_by,files_replaced,bytes_replaced,error_message,rollback_error")
          .eq("organization_id", organizationId).eq("ano", year).eq("mes", month)
          .order("started_at", { ascending: false }).limit(20),
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
