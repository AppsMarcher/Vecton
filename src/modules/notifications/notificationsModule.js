// Central de Notificações — sininho do header + tela de configuração.
//
// Origem dos eventos é o BANCO (trigger da migration 092 nas tabelas de lote),
// não este módulo: aqui só lemos o feed, marcamos como lido e configuramos as
// flags. Ver o cabeçalho de supabase/092_create_notifications.sql pro desenho
// completo.
//
// Entrega por POLLING (60s + refetch ao voltar pra aba), não Realtime: o app
// não carrega o supabase-js (tudo é REST cru via authenticatedFetch), e
// "carga aplicada" acontece algumas vezes por mês — latência de 1 min é
// irrelevante perto do custo de somar WebSocket + client novo ao bundle.
(function attachVectonNotificationsModule(window) {
  function createNotificationsModule(deps) {
    const {
      escapeHtml,
      state,
      resolveOrganizationId,
      callSupabaseRpc,
      fetchSupabaseRowsSafe,
      upsertSupabaseRows,
      isSupabaseConfigured,
      isAdmin,
      showToast,
      getCurrentUserId,
      openReportFromNotification,
      vpFriendlyError
    } = deps;

    const POLL_MS = 60000;
    const FEED_LIMIT = 30;

    let _items = [];
    let _unread = 0;
    let _timer = null;
    let _popover = null;
    let _loadingFeed = false;
    // Migration 092 ainda não rodada (ou Supabase não configurado): a central
    // se desliga sozinha em vez de ficar logando erro a cada minuto.
    let _disabled = false;

    const KIND_ICONS = {
      actuals_batch_applied: "vp-icon-upload",
      budget_batch_applied: "vp-icon-upload",
      headcount_batch_applied: "vp-icon-users",
      comercial_realizado_batch_applied: "vp-icon-briefcase",
      comercial_planejado_batch_applied: "vp-icon-target"
    };

    function iconFor(kind) {
      return KIND_ICONS[kind] || "vp-icon-bell";
    }

    // "não existe função" (PGRST202) / "não existe tabela" (PGRST205): a
    // migration não rodou. Qualquer outro erro é transitório e não desliga nada.
    function isMissingSchemaError(error) {
      const msg = String(error?.message || error || "");
      return msg.includes("PGRST202")
        || msg.includes("PGRST205")
        || msg.includes("does not exist")
        || msg.includes("schema cache");
    }

    function formatRelative(iso) {
      const then = new Date(iso).getTime();
      if (!Number.isFinite(then)) return "";
      const diffMin = Math.floor((Date.now() - then) / 60000);
      if (diffMin < 1) return "agora";
      if (diffMin < 60) return `há ${diffMin} min`;
      const diffH = Math.floor(diffMin / 60);
      if (diffH < 24) return `há ${diffH} h`;
      const diffD = Math.floor(diffH / 24);
      if (diffD === 1) return "ontem";
      if (diffD < 7) return `há ${diffD} dias`;
      const d = new Date(then);
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    // ── Badge ────────────────────────────────────────────────────────────────
    function renderBadge() {
      const badge = document.querySelector("#notifications-badge");
      if (!badge) return;
      // display explícito: o CSS base do badge é display:none, então string
      // vazia deixaria ele invisível pra sempre (mesma armadilha já documentada
      // nos botões de Relatórios).
      if (_unread > 0) {
        badge.textContent = _unread > 99 ? "99+" : String(_unread);
        badge.style.display = "flex";
      } else {
        badge.textContent = "";
        badge.style.display = "none";
      }
    }

    async function refreshCount() {
      if (_disabled || !isSupabaseConfigured()) return;
      try {
        const result = await callSupabaseRpc("notifications_unread_count");
        _unread = Number(result) || 0;
        renderBadge();
      } catch (error) {
        if (isMissingSchemaError(error)) {
          _disabled = true;
          _unread = 0;
          renderBadge();
          return;
        }
        // Rede instável / sessão renovando: silencioso, tenta no próximo tick.
        console.debug("notificações: falha ao contar não lidas", error);
      }
    }

    // ── Popover ──────────────────────────────────────────────────────────────
    function closePopover() {
      if (!_popover) return;
      _popover.remove();
      _popover = null;
      document.removeEventListener("keydown", onPopoverKey);
    }

    function onPopoverKey(event) {
      if (event.key === "Escape") closePopover();
    }

    function feedBodyMarkup() {
      if (_disabled) {
        return `<div class="notif-empty">Central de notificações ainda não configurada no banco.</div>`;
      }
      if (_loadingFeed) {
        return `<div class="notif-empty">Carregando...</div>`;
      }
      if (!_items.length) {
        return `<div class="notif-empty">Nenhuma notificação por aqui.</div>`;
      }
      return _items.map((item) => `
        <button class="notif-item${item.is_read ? "" : " unread"}" type="button" data-id="${escapeHtml(item.id)}">
          <span class="notif-item-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${iconFor(item.kind)}"></use></svg></span>
          <span class="notif-item-copy">
            <strong>${escapeHtml(item.title || "")}</strong>
            <span class="notif-item-body">${escapeHtml(item.body || "")}</span>
          </span>
          <span class="notif-item-time">${escapeHtml(formatRelative(item.created_at))}</span>
        </button>
      `).join("");
    }

    function paintPopoverBody() {
      if (!_popover) return;
      const body = _popover.querySelector("#notif-list");
      if (body) body.innerHTML = feedBodyMarkup();
      const markAll = _popover.querySelector("#notif-mark-all");
      if (markAll) markAll.disabled = _disabled || !_items.some((i) => !i.is_read);
    }

    async function loadFeed() {
      if (_disabled || !isSupabaseConfigured()) return;
      _loadingFeed = true;
      paintPopoverBody();
      try {
        const rows = await callSupabaseRpc("notifications_feed", { p_limit: FEED_LIMIT });
        _items = Array.isArray(rows) ? rows : [];
        _unread = _items.filter((i) => !i.is_read).length;
        renderBadge();
      } catch (error) {
        if (isMissingSchemaError(error)) {
          _disabled = true;
        } else {
          console.error(error);
          showToast(vpFriendlyError(error, "Falha ao carregar notificações."), "error");
        }
      } finally {
        _loadingFeed = false;
        paintPopoverBody();
      }
    }

    async function markRead(ids) {
      if (_disabled || !ids.length) return;
      try {
        await callSupabaseRpc("notifications_mark_read", { p_ids: ids });
        _items = _items.map((i) => (ids.includes(i.id) ? { ...i, is_read: true } : i));
        _unread = _items.filter((i) => !i.is_read).length;
        renderBadge();
        paintPopoverBody();
      } catch (error) {
        console.error(error);
      }
    }

    async function markAllRead() {
      if (_disabled) return;
      try {
        await callSupabaseRpc("notifications_mark_all_read");
        _items = _items.map((i) => ({ ...i, is_read: true }));
        _unread = 0;
        renderBadge();
        paintPopoverBody();
      } catch (error) {
        console.error(error);
        showToast(vpFriendlyError(error, "Falha ao marcar como lidas."), "error");
      }
    }

    function openPopover() {
      closePopover();
      const backdrop = document.createElement("div");
      backdrop.className = "notif-backdrop";
      // Popover centralizado na tela, não ancorado ao sino — é o padrão de
      // todos os popovers do app.
      backdrop.innerHTML = `
        <div class="notif-popover" role="dialog" aria-label="Notificações">
          <div class="notif-head">
            <strong>Notificações</strong>
            <button type="button" id="notif-mark-all" class="notif-mark-all">Marcar todas como lidas</button>
          </div>
          <div class="notif-list" id="notif-list"></div>
        </div>
      `;
      document.body.appendChild(backdrop);
      _popover = backdrop;

      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) closePopover();
      });
      backdrop.querySelector("#notif-mark-all").addEventListener("click", () => void markAllRead());
      backdrop.querySelector("#notif-list").addEventListener("click", (event) => {
        const btn = event.target.closest(".notif-item");
        if (!btn) return;
        const item = _items.find((i) => i.id === btn.dataset.id);
        if (!item) return;
        void markRead([item.id]);
        closePopover();
        if (item.target_report_id) {
          openReportFromNotification(item.target_report_id, item.ref_year, item.ref_month);
        }
      });
      setTimeout(() => document.addEventListener("keydown", onPopoverKey), 0);

      paintPopoverBody();
      void loadFeed();
    }

    // ── Ciclo de vida ────────────────────────────────────────────────────────
    function bindBell() {
      const trigger = document.querySelector("#notifications-trigger");
      if (!trigger || trigger.dataset.bound === "1") return;
      trigger.dataset.bound = "1";
      trigger.addEventListener("click", () => {
        if (_popover) closePopover();
        else openPopover();
      });
    }

    function onVisibility() {
      if (document.visibilityState === "visible") void refreshCount();
    }

    function start() {
      bindBell();
      if (_timer) return;
      void refreshCount();
      _timer = setInterval(() => void refreshCount(), POLL_MS);
      document.addEventListener("visibilitychange", onVisibility);
    }

    function stop() {
      if (_timer) clearInterval(_timer);
      _timer = null;
      document.removeEventListener("visibilitychange", onVisibility);
      closePopover();
      _items = [];
      _unread = 0;
      _disabled = false;
      renderBadge();
    }

    // ── Tela Parâmetros → Notificações ───────────────────────────────────────
    let _types = [];
    let _settings = new Map();

    function settingsRowMarkup(type) {
      const cfg = _settings.get(type.kind) || { in_app: true, email: false, email_recipients: [] };
      const recipients = Array.isArray(cfg.email_recipients) ? cfg.email_recipients.join(", ") : "";
      return `
        <tr data-kind="${escapeHtml(type.kind)}">
          <td>
            <strong class="notif-cfg-label">${escapeHtml(type.label)}</strong>
            <span class="notif-cfg-desc">${escapeHtml(type.description || "")}</span>
          </td>
          <td class="notif-cfg-flag">
            <input type="checkbox" data-field="in_app"${cfg.in_app ? " checked" : ""} aria-label="Sininho">
          </td>
          <td class="notif-cfg-flag">
            <input type="checkbox" data-field="email"${cfg.email ? " checked" : ""} aria-label="E-mail">
          </td>
          <td>
            <input type="text" class="notif-cfg-recipients" data-field="email_recipients"
              value="${escapeHtml(recipients)}"
              placeholder="email@empresa.com, outro@empresa.com"${cfg.email ? "" : " disabled"}>
          </td>
        </tr>
      `;
    }

    function paintSettings() {
      const body = document.querySelector("#notif-config-body");
      if (!body) return;
      if (!_types.length) {
        body.innerHTML = `<tr><td colspan="4" class="users-empty">Nenhum tipo de evento cadastrado. Rode a migration 092.</td></tr>`;
        return;
      }
      body.innerHTML = _types.map(settingsRowMarkup).join("");
    }

    async function loadAndRenderSettings() {
      const body = document.querySelector("#notif-config-body");
      if (!body) return;
      body.innerHTML = `<tr><td colspan="4" class="users-empty">Carregando...</td></tr>`;
      try {
        const orgId = await resolveOrganizationId();
        const [types, settings] = await Promise.all([
          fetchSupabaseRowsSafe("notification_event_types", "order=sort_order.asc"),
          fetchSupabaseRowsSafe("notification_settings", `organization_id=eq.${orgId}`)
        ]);
        _types = types || [];
        _settings = new Map((settings || []).map((row) => [row.kind, row]));
        paintSettings();
      } catch (error) {
        console.error(error);
        body.innerHTML = `<tr><td colspan="4" class="users-empty">${escapeHtml(vpFriendlyError(error, "Falha ao carregar as notificações."))}</td></tr>`;
      }
    }

    function parseRecipients(raw) {
      return String(raw || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    async function persistRow(kind, patch) {
      const orgId = await resolveOrganizationId();
      const current = _settings.get(kind) || { in_app: true, email: false, email_recipients: [] };
      const merged = {
        organization_id: orgId,
        kind,
        in_app: patch.in_app !== undefined ? patch.in_app : current.in_app,
        email: patch.email !== undefined ? patch.email : current.email,
        email_recipients: patch.email_recipients !== undefined ? patch.email_recipients : (current.email_recipients || []),
        updated_at: new Date().toISOString(),
        updated_by: getCurrentUserId()
      };
      // Upsert com a linha COMPLETA (não parcial): a política de escrita é
      // admin da org e todos os NOT NULL vão preenchidos, então o WITH CHECK do
      // INSERT proposto passa — que é o que quebra em upsert parcial.
      await upsertSupabaseRows("notification_settings", [merged], ["organization_id", "kind"]);
      _settings.set(kind, merged);
    }

    function bindSettings() {
      const table = document.querySelector("#notif-config-table");
      if (!table || table.dataset.bound === "1") return;
      table.dataset.bound = "1";

      table.addEventListener("change", async (event) => {
        const input = event.target;
        const row = input.closest("tr[data-kind]");
        if (!row || !isAdmin()) return;
        const kind = row.dataset.kind;
        const field = input.dataset.field;
        if (field !== "in_app" && field !== "email") return;

        const recipientsInput = row.querySelector(".notif-cfg-recipients");
        if (field === "email" && recipientsInput) recipientsInput.disabled = !input.checked;

        try {
          await persistRow(kind, { [field]: input.checked });
          showToast("Notificações atualizadas.");
        } catch (error) {
          console.error(error);
          input.checked = !input.checked;
          if (field === "email" && recipientsInput) recipientsInput.disabled = !input.checked;
          showToast(vpFriendlyError(error, "Falha ao salvar a configuração."), "error");
        }
      });

      // Destinatários salvam no blur (mesmo padrão do rename inline das seções
      // de relatórios), não a cada tecla.
      table.addEventListener("focusout", async (event) => {
        const input = event.target;
        if (!input.classList || !input.classList.contains("notif-cfg-recipients")) return;
        const row = input.closest("tr[data-kind]");
        if (!row || !isAdmin()) return;
        const kind = row.dataset.kind;
        const list = parseRecipients(input.value);
        const invalid = list.filter((e) => !EMAIL_RE.test(e));
        if (invalid.length) {
          showToast(`E-mail inválido: ${invalid[0]}`, "error");
          return;
        }
        const current = _settings.get(kind)?.email_recipients || [];
        if (list.join(",") === current.join(",")) return;
        try {
          await persistRow(kind, { email_recipients: list });
          input.value = list.join(", ");
          showToast("Destinatários atualizados.");
        } catch (error) {
          console.error(error);
          showToast(vpFriendlyError(error, "Falha ao salvar os destinatários."), "error");
        }
      });
    }

    return {
      startNotifications: start,
      stopNotifications: stop,
      refreshNotificationsCount: refreshCount,
      loadAndRenderNotificationSettings: loadAndRenderSettings,
      bindNotificationSettings: bindSettings
    };
  }

  window.VECTON_NOTIFICATIONS = { createNotificationsModule };
})(window);
