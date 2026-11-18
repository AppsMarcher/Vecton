(function attachOpexReviewService(window) {
  "use strict";
  // Acesso aos RPCs do módulo e cache autorizado: chave sempre por organização + usuário + contexto,
  // nunca compartilhando resposta financeira entre sessões. Respostas em voo da sessão anterior são descartadas.
  const rowKey = (costCenterId, accountNumber) => `${costCenterId}|${String(accountNumber).trim()}`;
  // O PostgREST devolve o erro do Postgres como JSON em error.message: {code,message}.
  function parseError(error) {
    let code = "", hint = "", message = String(error?.message || error || "");
    try { const body = JSON.parse(message); code = body.code || ""; hint = body.hint || ""; message = body.message || message; } catch { /* texto simples */ }
    const kind = code === "40001" ? "conflict" : code === "42501" ? "forbidden" : code === "22023" ? "validation" : "error";
    return { kind, code, hint, message };
  }
  function createOpexReviewService({ rpc, readRows, resolveOrganizationId, getSessionKey, uploadFile, signUrl }) {
    const cache = new Map();
    let generation = 0;
    const invalidate = () => { generation++; cache.clear(); };
    function cached(key, loader, ttl = 30000) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.time < ttl) return entry.promise;
      const promise = Promise.resolve().then(loader);
      cache.set(key, { time: Date.now(), promise });
      promise.catch(() => { if (cache.get(key)?.promise === promise) cache.delete(key); });
      return promise;
    }
    const sessionKey = async () => `${await resolveOrganizationId()}:${getSessionKey()}:${generation}`;
    async function guarded(loader) {
      const started = generation;
      const result = await loader();
      if (started !== generation) throw new Error("Sessão alterada durante a consulta");
      return result;
    }
    async function thresholds() {
      const org = await resolveOrganizationId();
      const base = await sessionKey();
      const raw = await cached(`${base}:thresholds`, () => guarded(() => rpc("opex_get_thresholds", { p_org: org })));
      return { yellowMoney: Number(raw.yellowMoney), yellowPct: Number(raw.yellowPct), redMoney: Number(raw.redMoney), redPct: Number(raw.redPct),
        direction: ["both", "under"].includes(raw.direction) ? raw.direction : "over", version: Number(raw.version), canEdit: Boolean(raw.canEdit), updatedAt: raw.updatedAt || null };
    }
    async function saveThresholds(values, expectedVersion) {
      const org = await resolveOrganizationId();
      const saved = await rpc("opex_save_thresholds", { p_org: org, p_values: values, p_expected_version: expectedVersion });
      invalidate();
      return saved;
    }
    // Em lote por abertura (blocos de 2000 linhas, limite do servidor: 5000 por chamada); só retorna CCs que o usuário pode ler.
    const PRESENCE_CHUNK = 2000;
    const digest = text => { let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
    async function presence(ctx, rows) {
      const map = new Map();
      if (!ctx.sourceKey || !rows.length) return map;
      const base = await sessionKey();
      const ctxKey = JSON.stringify([ctx.year, ctx.periodType, ctx.month, ctx.sourceKey, ctx.scopeKey || ""]);
      const chunks = [];
      for (let i = 0; i < rows.length; i += PRESENCE_CHUNK) chunks.push(rows.slice(i, i + PRESENCE_CHUNK));
      const lists = await Promise.all(chunks.map(chunk => {
        const key = `${base}:presence:${ctxKey}:${chunk.length}:${digest(chunk.map(r => rowKey(r.cc, r.account)).sort().join(","))}`;
        return cached(key, () => guarded(() => rpc("opex_record_presence", { p_ctx: { ...ctx, scopeKey: ctx.scopeKey || "" }, p_rows: chunk })));
      }));
      for (const list of lists) for (const item of list || []) map.set(rowKey(item.costCenterId, item.accountNumber), { analyses: Number(item.analyses), actions: Number(item.actions), open: Number(item.open), cancelled: Number(item.cancelled || 0) });
      return map;
    }
    async function deleteRecord(type, id) {
      const result = await rpc("opex_delete_record", { p_type: type, p_id: id });
      invalidate();
      return result;
    }
    const ctxPayload = ctx => ({ costCenterId: ctx.costCenterId, accountNumber: ctx.accountNumber, year: ctx.year, periodType: ctx.periodType,
      month: ctx.month, sourceKey: ctx.sourceKey, scopeKey: ctx.scopeKey || "", groupName: ctx.groupName || "", accountName: ctx.accountName || "" });
    // Nunca em cache: causa/anexos são lidos a cada abertura para refletir a versão atual.
    const getAnalysis = ctx => guarded(() => rpc("opex_get_analysis", { p_ctx: ctxPayload(ctx) }));
    async function saveAnalysis(ctx, fields, expectedVersion, idemKey) {
      const saved = await rpc("opex_save_analysis", { p_ctx: ctxPayload(ctx), p_fields: fields, p_expected_version: expectedVersion, p_idem_key: idemKey });
      invalidate();
      return saved;
    }
    // Lançamentos reais da conta + CC, sob demanda, só até o corte (visão anual não fabrica lançamentos futuros).
    async function loadLedger(ctx) {
      const org = await resolveOrganizationId();
      const monthFilter = ctx.periodType === "month" ? `&reference_month=eq.${ctx.month}` : `&reference_month=lte.${ctx.month}`;
      const base = `organization_id=eq.${encodeURIComponent(org)}&reference_year=eq.${ctx.year}${monthFilter}&account_number=eq.${encodeURIComponent(ctx.accountNumber)}&cost_center_id=eq.${encodeURIComponent(ctx.costCenterId)}`;
      const rows = []; let cursor = "00000000-0000-0000-0000-000000000000";
      while (true) {
        const page = await guarded(() => readRows("actuals_ledger_entries", `${base}&id=gt.${cursor}&select=id,entry_date,reference_month,branch_code,history,lot_code,amount&order=id.asc&limit=1000`));
        rows.push(...page);
        if (page.length < 1000) break;
        const last = page[page.length - 1].id;
        if (!last || last === cursor) throw new Error("Paginação sem progresso");
        cursor = last;
      }
      return rows;
    }
    // ------------------------------------------------------------ ações (DTO operacional)
    const newKey = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const ctxOnly = ctx => ctxPayload(ctx);
    const actionsForAnalysis = ctx => guarded(() => rpc("opex_actions_for_analysis", { p_ctx: ctxOnly(ctx) }));
    const assignableUsers = costCenterId => guarded(() => rpc("opex_assignable_users", { p_cc: costCenterId }));
    const assignableForAction = actionId => guarded(() => rpc("opex_assignable_for_action", { p_action: actionId }));
    const getAction = actionId => guarded(() => rpc("opex_get_action", { p_action_id: actionId }));
    async function createAction(ctx, fields, idemKey) {
      const created = await rpc("opex_create_action", { p_ctx: ctxOnly(ctx), p_fields: fields, p_idem_key: idemKey || newKey() });
      invalidate();
      return created;
    }
    // Mutações do executor/dono. Cada uma exige a versão vista pela tela (controle otimista) e uma chave idempotente por tentativa.
    const mutations = {
      ack: (a, k) => rpc("opex_ack_action", { p_action_id: a.id, p_cycle: a.assignmentCycle, p_expected_version: a.version, p_idem_key: k }),
      comment: (a, k, text) => rpc("opex_comment_action", { p_action_id: a.id, p_text: text, p_idem_key: k }),
      submit: (a, k, note) => rpc("opex_submit_action", { p_action_id: a.id, p_note: note, p_expected_version: a.version, p_idem_key: k }),
      validate: (a, k) => rpc("opex_validate_action", { p_action_id: a.id, p_expected_version: a.version, p_idem_key: k }),
      return: (a, k, reason) => rpc("opex_return_action", { p_action_id: a.id, p_reason: reason, p_expected_version: a.version, p_idem_key: k }),
      reassign: (a, k, userId) => rpc("opex_reassign_action", { p_action_id: a.id, p_new_assignee: userId, p_expected_version: a.version, p_idem_key: k }),
      terms: (a, k, fields) => rpc("opex_update_action_terms", { p_action_id: a.id, p_fields: fields, p_expected_version: a.version, p_idem_key: k })
    };
    async function mutate(op, action, idemKey, arg) {
      const result = await mutations[op](action, idemKey || newKey(), arg);
      invalidate();
      return result;
    }
    const myActions = (filters, cursor) => guarded(() => rpc("opex_my_actions", { p_filters: filters || {}, p_cursor: cursor || null }));
    const entryPending = limit => guarded(() => rpc("opex_entry_pending", { p_limit: limit || 10 }));
    const hubResponsibles = () => guarded(() => rpc("opex_hub_responsibles", {}));
    const listRecords = (filters, cursor) => guarded(() => rpc("opex_list_records", { p_filters: filters || {}, p_cursor: cursor || null }));

    // ------------------------------------------------------------ anexos
    const listAttachments = entity => guarded(() => rpc("opex_list_attachments", { p_entity: entity }));
    // prepare → upload ao Storage → finalize. Falha em qualquer etapa devolve o erro para o arquivo, sem apagar o resto.
    async function uploadAttachment(entity, file) {
      const prepared = await rpc("opex_prepare_upload", { p_entity: entity, p_meta: { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size } });
      await uploadFile(prepared.bucket, prepared.path, file);
      return rpc("opex_finalize_upload", { p_attachment_id: prepared.attachmentId });
    }
    // Reautoriza no servidor e só então assina uma URL de curta duração (a policy do Storage repete a checagem).
    async function attachmentUrl(attachmentId) {
      const access = await rpc("opex_attachment_access", { p_attachment_id: attachmentId });
      return { url: await signUrl(access.bucket, access.path, access.expiresIn || 60), fileName: access.fileName, mimeType: access.mimeType };
    }
    const shareAttachment = (actionId, attachmentId, confirmRestricted) => rpc("opex_share_attachment", { p_action_id: actionId, p_attachment_id: attachmentId, p_confirm_restricted: Boolean(confirmRestricted) });
    const revokeShare = (actionId, attachmentId) => rpc("opex_revoke_share", { p_action_id: actionId, p_attachment_id: attachmentId });
    const removeAttachment = attachmentId => rpc("opex_remove_attachment", { p_attachment_id: attachmentId });

    return { deleteRecord, thresholds, saveThresholds, presence, getAnalysis, saveAnalysis, loadLedger, invalidate, rowKey, rpc, parseError, newKey,
      actionsForAnalysis, assignableUsers, assignableForAction, getAction, createAction, mutate, myActions, entryPending, listRecords, hubResponsibles,
      listAttachments, uploadAttachment, attachmentUrl, shareAttachment, revokeShare, removeAttachment };
  }
  window.VECTON_OPEX_REVIEW_SERVICE = { createOpexReviewService, rowKey, parseError };
})(window);
