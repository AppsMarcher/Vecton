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
      vpFriendlyError,
      messagesTab            // aba "Mensagens" (messagesModule); opcional
    } = deps;

    const POLL_MS = 60000;
    const FEED_LIMIT = 30;
    // Abre sozinho uma vez por sessão quando há mensagem não lida — decisão do
    // usuário. sessionStorage (e não localStorage) porque "sessão" aqui é a
    // aba/navegação atual: fechou e voltou depois, avisa de novo.
    const AUTO_OPEN_KEY = "vp_inbox_auto_opened_v1";

    let _items = [];
    let _unread = 0;          // notificações
    let _unreadMsgs = 0;      // mensagens
    let _tab = "notificacoes";
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

    // ── Badges ───────────────────────────────────────────────────────────────
    function pintarBadge(seletor, valor) {
      const badge = document.querySelector(seletor);
      if (!badge) return;
      // display explícito: o CSS base do badge é display:none, então string
      // vazia deixaria ele invisível pra sempre (mesma armadilha já documentada
      // nos botões de Relatórios).
      if (valor > 0) {
        badge.textContent = valor > 99 ? "99+" : String(valor);
        badge.style.display = "flex";
      } else {
        badge.textContent = "";
        badge.style.display = "none";
      }
    }

    function renderBadge() {
      pintarBadge("#notifications-badge", _unread);
      pintarBadge("#messages-badge", _unreadMsgs);
      if (!_popover) return;
      const chipN = _popover.querySelector('[data-tab="notificacoes"] .inbox-tab-count');
      const chipM = _popover.querySelector('[data-tab="mensagens"] .inbox-tab-count');
      if (chipN) chipN.textContent = _unread > 0 ? String(_unread) : "";
      if (chipM) chipM.textContent = _unreadMsgs > 0 ? String(_unreadMsgs) : "";
    }

    // UMA consulta periódica pras duas caixas (RPC inbox_counts, migration 094).
    // Uma chamada por caixa dobraria o tráfego de fundo — e foi requisição
    // periódica extra que expôs a corrida de renovação de token em 2026-08-03.
    // Se a 094 ainda não rodou, cai na contagem só de notificações da 092.
    async function refreshCount() {
      if (_disabled || !isSupabaseConfigured()) return;
      // Aba em segundo plano não consulta: sem isso o timer gera tráfego (e
      // renovação de token) o dia inteiro numa aba que ninguém está olhando.
      // Ao voltar pra aba o visibilitychange já dispara uma atualização.
      if (document.visibilityState === "hidden") return;
      try {
        const linhas = await callSupabaseRpc("inbox_counts");
        const c = Array.isArray(linhas) ? linhas[0] : linhas;
        _unread = Number(c?.notificacoes) || 0;
        _unreadMsgs = Number(c?.mensagens) || 0;
        if (messagesTab) messagesTab.setMessagesUnread(_unreadMsgs);
        renderBadge();
        autoAbrirSeTiverMensagem();
      } catch (error) {
        if (isMissingSchemaError(error)) {
          try {
            const result = await callSupabaseRpc("notifications_unread_count");
            _unread = Number(result) || 0;
            _unreadMsgs = 0;
            renderBadge();
            return;
          } catch (e2) {
            if (isMissingSchemaError(e2)) {
              _disabled = true;
              _unread = 0;
              _unreadMsgs = 0;
              renderBadge();
              return;
            }
          }
        }
        // Rede instável / sessão renovando: silencioso, tenta no próximo tick.
        console.debug("caixa de entrada: falha ao contar não lidas", error);
      }
    }

    function autoAbrirSeTiverMensagem() {
      if (_unreadMsgs <= 0 || _popover) return;
      try {
        if (sessionStorage.getItem(AUTO_OPEN_KEY) === "1") return;
        sessionStorage.setItem(AUTO_OPEN_KEY, "1");
      } catch (_) {
        return;   // sem sessionStorage, não insiste
      }
      openPopover("mensagens");
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

    function trocarAba(tab) {
      _tab = tab === "mensagens" && messagesTab ? "mensagens" : "notificacoes";
      if (!_popover) return;
      _popover.querySelectorAll(".inbox-tab").forEach((b) => {
        b.classList.toggle("active", b.dataset.tab === _tab);
      });
      const painelN = _popover.querySelector("#inbox-pane-notificacoes");
      const painelM = _popover.querySelector("#inbox-pane-mensagens");
      // display explícito nos dois sentidos (o CSS base do painel tem display
      // próprio, então string vazia não serviria pra esconder).
      if (painelN) painelN.style.display = _tab === "notificacoes" ? "flex" : "none";
      if (painelM) painelM.style.display = _tab === "mensagens" ? "flex" : "none";
      if (_tab === "notificacoes") {
        void loadFeed();
      } else if (messagesTab && painelM) {
        messagesTab.renderMessagesInto(painelM, (n) => {
          _unreadMsgs = n;
          renderBadge();
        });
      }
    }

    function openPopover(tab) {
      closePopover();
      const backdrop = document.createElement("div");
      backdrop.className = "notif-backdrop";
      // Popover centralizado na tela, não ancorado ao ícone — é o padrão de
      // todos os popovers do app. Sino e cartinha abrem o MESMO painel, cada um
      // na sua aba.
      backdrop.innerHTML = `
        <div class="notif-popover" role="dialog" aria-label="Caixa de entrada">
          <div class="inbox-tabs">
            <button type="button" class="inbox-tab" data-tab="notificacoes">
              Notificações <span class="inbox-tab-count"></span>
            </button>
            ${messagesTab ? `<button type="button" class="inbox-tab" data-tab="mensagens">
              Mensagens <span class="inbox-tab-count"></span>
            </button>` : ""}
          </div>
          <div class="inbox-pane" id="inbox-pane-notificacoes">
            <div class="notif-head">
              <strong>Notificações</strong>
              <button type="button" id="notif-mark-all" class="notif-mark-all">Marcar todas como lidas</button>
            </div>
            <div class="notif-list" id="notif-list"></div>
          </div>
          <div class="inbox-pane" id="inbox-pane-mensagens" style="display:none"></div>
        </div>
      `;
      document.body.appendChild(backdrop);
      _popover = backdrop;

      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) closePopover();
      });
      backdrop.querySelectorAll(".inbox-tab").forEach((b) => {
        b.addEventListener("click", () => trocarAba(b.dataset.tab));
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
      renderBadge();
      trocarAba(tab);   // já carrega a aba escolhida (sino → notificações, carta → mensagens)
    }

    // ── Ciclo de vida ────────────────────────────────────────────────────────
    // Sino e cartinha abrem o mesmo painel, cada um na sua aba. Clicar no ícone
    // com o painel já aberto naquela aba fecha; em outra aba, só troca.
    function bindBell() {
      const alvos = [
        { seletor: "#notifications-trigger", aba: "notificacoes" },
        { seletor: "#messages-trigger", aba: "mensagens" }
      ];
      alvos.forEach(({ seletor, aba }) => {
        const trigger = document.querySelector(seletor);
        if (!trigger || trigger.dataset.bound === "1") return;
        trigger.dataset.bound = "1";
        trigger.addEventListener("click", () => {
          if (_popover && _tab === aba) closePopover();
          else if (_popover) trocarAba(aba);
          else openPopover(aba);
        });
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
      _unreadMsgs = 0;
      _disabled = false;
      renderBadge();
      // Logout limpa a marca de "já abri nesta sessão": o próximo usuário a
      // entrar neste navegador merece ver as mensagens dele.
      try { sessionStorage.removeItem(AUTO_OPEN_KEY); } catch (_) { /* indisponível */ }
    }

    // ── Tela Parâmetros → Notificações ───────────────────────────────────────
    let _types = [];
    let _settings = new Map();
    let _users = [];        // usuários cadastrados na org (nome + e-mail)

    function recipientsOf(kind) {
      const cfg = _settings.get(kind);
      return Array.isArray(cfg?.email_recipients) ? cfg.email_recipients : [];
    }

    // Rótulo do botão: mostra o e-mail quando é um só (informação útil de
    // relance) e cai na contagem a partir de dois, senão a célula estoura.
    function recipientsLabel(list) {
      if (!list.length) return "Ninguém selecionado";
      if (list.length === 1) {
        const user = _users.find((u) => u.email === list[0]);
        return user?.name || list[0];
      }
      return `${list.length} destinatários`;
    }

    function settingsRowMarkup(type) {
      const cfg = _settings.get(type.kind) || { in_app: true, email: false, email_recipients: [] };
      const list = Array.isArray(cfg.email_recipients) ? cfg.email_recipients : [];
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
            <button type="button" class="notif-rcpt-trigger${list.length ? " has-value" : ""}"
              data-kind="${escapeHtml(type.kind)}"${cfg.email ? "" : " disabled"}>
              <span class="notif-rcpt-label">${escapeHtml(recipientsLabel(list))}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
            </button>
          </td>
        </tr>
      `;
    }

    // ── Seletor de destinatários ─────────────────────────────────────────────
    // Painel em position:fixed ancorado ao botão, montado no <body>: o card da
    // tabela tem overflow:hidden, então um painel absoluto dentro dela seria
    // cortado (visível principalmente na última linha).
    let _picker = null;

    function closePicker(persist = true) {
      if (!_picker) return;
      const { kind, selected, changed, el, trigger } = _picker;
      _picker = null;
      el.remove();
      document.removeEventListener("keydown", onPickerKey, true);
      document.removeEventListener("mousedown", onPickerOutside, true);
      window.removeEventListener("resize", onPickerReposition, true);
      window.removeEventListener("scroll", onPickerReposition, true);

      const list = [...selected];
      if (trigger) {
        trigger.classList.toggle("has-value", list.length > 0);
        const label = trigger.querySelector(".notif-rcpt-label");
        if (label) label.textContent = recipientsLabel(list);
      }
      // Grava uma vez, ao fechar — e não a cada clique de checkbox.
      if (persist && changed) {
        persistRow(kind, { email_recipients: list })
          .then(() => showToast("Destinatários atualizados."))
          .catch((error) => {
            console.error(error);
            showToast(vpFriendlyError(error, "Falha ao salvar os destinatários."), "error");
          });
      }
    }

    function onPickerKey(event) {
      if (event.key === "Escape") { event.stopPropagation(); closePicker(); }
    }

    function onPickerOutside(event) {
      if (!_picker) return;
      if (_picker.el.contains(event.target) || _picker.trigger.contains(event.target)) return;
      closePicker();
    }

    function onPickerReposition() {
      if (_picker) positionPicker(_picker.el, _picker.trigger);
    }

    function positionPicker(panel, trigger) {
      const r = trigger.getBoundingClientRect();
      const h = panel.offsetHeight;
      const espacoAbaixo = window.innerHeight - r.bottom;
      // Abre pra cima quando não cabe embaixo (linhas do fim da tabela).
      const top = (espacoAbaixo < h + 12 && r.top > h + 12) ? r.top - h - 6 : r.bottom + 6;
      panel.style.top = `${Math.max(8, top)}px`;
      panel.style.left = `${Math.max(8, Math.min(r.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 8))}px`;
    }

    function pickerOptionsMarkup(selected) {
      const cadastrados = _users.map((u) => ({ ...u, externo: false }));
      // E-mail que está salvo mas não pertence a nenhum usuário: continua
      // aparecendo (marcado) num grupo à parte, senão sumiria da tela sem a
      // pessoa perceber que ainda vai receber.
      const externos = [...selected]
        .filter((mail) => !_users.some((u) => u.email === mail))
        .map((mail) => ({ email: mail, name: mail, externo: true }));

      const linha = (o) => `
        <label class="notif-rcpt-opt">
          <input type="checkbox" value="${escapeHtml(o.email)}"${selected.has(o.email) ? " checked" : ""}>
          <span class="notif-rcpt-opt-copy">
            <strong>${escapeHtml(o.name || o.email)}</strong>
            ${o.name && o.name !== o.email ? `<span>${escapeHtml(o.email)}</span>` : ""}
          </span>
        </label>`;

      let html = cadastrados.length
        ? cadastrados.map(linha).join("")
        : `<div class="notif-rcpt-vazio">Nenhum usuário cadastrado.</div>`;
      if (externos.length) {
        html += `<div class="notif-rcpt-grupo">Fora do Vecton</div>` + externos.map(linha).join("");
      }
      return html;
    }

    function openPicker(kind, trigger) {
      closePicker();
      const selected = new Set(recipientsOf(kind));
      const panel = document.createElement("div");
      panel.className = "notif-rcpt-panel";
      panel.innerHTML = `
        <div class="notif-rcpt-opts">${pickerOptionsMarkup(selected)}</div>
        <div class="notif-rcpt-add">
          <input type="email" placeholder="Adicionar e-mail de fora do Vecton" aria-label="Adicionar e-mail externo">
          <button type="button" class="notif-rcpt-add-btn">Adicionar</button>
        </div>
      `;
      document.body.appendChild(panel);
      _picker = { kind, trigger, el: panel, selected, changed: false };
      positionPicker(panel, trigger);

      panel.querySelector(".notif-rcpt-opts").addEventListener("change", (event) => {
        const input = event.target;
        if (input.type !== "checkbox") return;
        if (input.checked) selected.add(input.value);
        else selected.delete(input.value);
        _picker.changed = true;
      });

      const addInput = panel.querySelector(".notif-rcpt-add input");
      const addBtn = panel.querySelector(".notif-rcpt-add-btn");
      const adicionar = () => {
        const mail = addInput.value.trim().toLowerCase();
        if (!mail) return;
        if (!EMAIL_RE.test(mail)) { showToast(`E-mail inválido: ${mail}`, "error"); return; }
        if (selected.has(mail)) { addInput.value = ""; return; }
        selected.add(mail);
        _picker.changed = true;
        addInput.value = "";
        panel.querySelector(".notif-rcpt-opts").innerHTML = pickerOptionsMarkup(selected);
        positionPicker(panel, trigger);
      };
      addBtn.addEventListener("click", adicionar);
      addInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); adicionar(); }
      });

      document.addEventListener("keydown", onPickerKey, true);
      document.addEventListener("mousedown", onPickerOutside, true);
      window.addEventListener("resize", onPickerReposition, true);
      window.addEventListener("scroll", onPickerReposition, true);
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
        const [types, settings, users] = await Promise.all([
          fetchSupabaseRowsSafe("notification_event_types", "order=sort_order.asc"),
          fetchSupabaseRowsSafe("notification_settings", `organization_id=eq.${orgId}`),
          fetchSupabaseRowsSafe("user_profiles", `organization_id=eq.${orgId}&select=full_name,email&order=full_name.asc`)
        ]);
        _types = types || [];
        _settings = new Map((settings || []).map((row) => [row.kind, row]));
        _users = (users || [])
          .map((u) => ({ email: String(u.email || "").trim().toLowerCase(), name: String(u.full_name || "").trim() }))
          .filter((u) => u.email)
          // Mesma pessoa pode ter mais de um perfil; a lista é de e-mails.
          .filter((u, i, arr) => arr.findIndex((o) => o.email === u.email) === i);
        paintSettings();
      } catch (error) {
        console.error(error);
        body.innerHTML = `<tr><td colspan="4" class="users-empty">${escapeHtml(vpFriendlyError(error, "Falha ao carregar as notificações."))}</td></tr>`;
      }
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

        const rcptTrigger = row.querySelector(".notif-rcpt-trigger");
        if (field === "email" && rcptTrigger) {
          rcptTrigger.disabled = !input.checked;
          // Desligar o e-mail com o seletor aberto deixaria um painel órfão.
          if (!input.checked && _picker && _picker.trigger === rcptTrigger) closePicker();
        }

        try {
          await persistRow(kind, { [field]: input.checked });
          showToast("Notificações atualizadas.");
        } catch (error) {
          console.error(error);
          input.checked = !input.checked;
          if (field === "email" && rcptTrigger) rcptTrigger.disabled = !input.checked;
          showToast(vpFriendlyError(error, "Falha ao salvar a configuração."), "error");
        }
      });

      // Abre o seletor de destinatários. A gravação acontece ao FECHAR o
      // painel, não a cada clique de checkbox.
      table.addEventListener("click", (event) => {
        const trigger = event.target.closest(".notif-rcpt-trigger");
        if (!trigger || trigger.disabled || !isAdmin()) return;
        if (_picker && _picker.trigger === trigger) { closePicker(); return; }
        openPicker(trigger.dataset.kind, trigger);
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
