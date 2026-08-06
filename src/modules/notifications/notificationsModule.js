// Central de Notificações — sininho do header + tela de configuração.
//
// Origem dos eventos é o BANCO (trigger da migration 092 nas tabelas de lote),
// não este módulo: aqui só lemos o feed, marcamos como lido e configuramos as
// flags. Ver o cabeçalho de supabase/092_create_notifications.sql pro desenho
// completo.
//
// As notificações administrativas continuam no polling de 60s. O Marcher
// Messenger usa uma conexão Realtime própria, iniciada por este módulo junto
// com o ciclo autenticado da aplicação.
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
      appConfirm,
      messagesTab            // aba "Mensagens" (messagesModule); opcional
    } = deps;

    const POLL_MS = 60000;
    const FEED_LIMIT = 30;
    let _items = [];
    let _unread = 0;          // notificações
    let _unreadMsgs = 0;      // mensagens
    let _messagesRevision = 0; // impede polling antigo de sobrescrever leitura recente

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
      comercial_planejado_batch_applied: "vp-icon-target",
      rps_gestao_reminder: "vp-icon-activity"
    };

    // 0=domingo..6=sábado — mesma convenção do extract(dow) do Postgres,
    // usada direto em schedule_weekday (ver migration 110). Sem tradução.
    const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

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
    }

    // UMA consulta periódica pras duas caixas (RPC inbox_counts, migration 094).
    // Uma chamada por caixa dobraria o tráfego de fundo — e foi requisição
    // periódica extra que expôs a corrida de renovação de token em 2026-08-03.
    // Se a 094 ainda não rodou, cai na contagem só de notificações da 092.
    async function refreshCount() {
      if (_disabled || !isSupabaseConfigured()) return;
      const messagesRevisionNoInicio = _messagesRevision;
      try {
        const linhas = await callSupabaseRpc("inbox_counts");
        const c = Array.isArray(linhas) ? linhas[0] : linhas;
        _unread = Number(c?.notificacoes) || 0;
        // Se o Messenger marcou uma conversa como lida enquanto esta RPC
        // estava em voo, o resultado pertence a um snapshot antigo. Nesse
        // caso, preservamos a reconciliação mais nova feita pelo Messenger.
        if (_messagesRevision === messagesRevisionNoInicio) {
          _unreadMsgs = Number(c?.mensagens) || 0;
          if (messagesTab) {
            void messagesTab.refreshRealtimeAuth();
            messagesTab.setMessagesUnread(_unreadMsgs);
            if (_unreadMsgs > 0) messagesTab.showUnreadAlert();
            // Segundo tique = "chegou no aparelho da pessoa", então marcar
            // entrega faz parte do polling, não da abertura da aba.
            if (_unreadMsgs > 0) void messagesTab.markMessagesDelivered();
          }
        }
        renderBadge();
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
      // <div role="button"> porque a linha carrega o botão de lida/não lida
      // dentro — botão dentro de botão é HTML inválido.
      return _items.map((item) => `
        <div class="notif-item${item.is_read ? "" : " unread"}" role="button" tabindex="0" data-id="${escapeHtml(item.id)}">
          <span class="notif-item-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${iconFor(item.kind)}"></use></svg></span>
          <span class="notif-item-copy">
            <strong>${escapeHtml(item.title || "")}</strong>
            <span class="notif-item-body">${escapeHtml(item.body || "")}</span>
          </span>
          <span class="notif-item-time">${escapeHtml(formatRelative(item.created_at))}</span>
          <button type="button" class="notif-toggle" data-action="alternar-lida" data-id="${escapeHtml(item.id)}"
                  title="${item.is_read ? "Marcar como não lida" : "Marcar como lida"}"
                  aria-label="${item.is_read ? "Marcar como não lida" : "Marcar como lida"}">${item.is_read ? "○" : "●"}</button>
        </div>
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

    // Alterna lida/não lida no item — o clique na linha continua abrindo o
    // relatório, então o estado precisa de botão próprio.
    async function alternarLida(id) {
      const item = _items.find((i) => i.id === id);
      if (!item || _disabled) return;
      const virarLida = !item.is_read;
      try {
        await callSupabaseRpc(virarLida ? "notifications_mark_read" : "notifications_mark_unread", { p_ids: [id] });
        item.is_read = virarLida;
        _unread = _items.filter((i) => !i.is_read).length;
        renderBadge();
        paintPopoverBody();
      } catch (error) {
        console.error(error);
        showToast(vpFriendlyError(error, "Falha ao alterar a notificação."), "error");
      }
    }

    // "Limpar" é por usuário: a notificação é uma linha da organização que todos
    // veem, então apagar sumiria da tela de todo mundo. O banco guarda um marco
    // e esconde o que existe até agora.
    async function limparTela() {
      if (_disabled) return;
      if (appConfirm) {
        const ok = await appConfirm("Limpar as notificações? Elas somem da sua tela; as próximas continuam chegando.");
        if (!ok) return;
      }
      try {
        await callSupabaseRpc("notifications_clear");
        _items = [];
        _unread = 0;
        renderBadge();
        paintPopoverBody();
      } catch (error) {
        console.error(error);
        showToast(vpFriendlyError(error, "Falha ao limpar as notificações."), "error");
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
      // Tela exclusiva das notificações (60% x 45%). O correio virou tela
      // separada, com painel de contatos próprio.
      backdrop.innerHTML = `
        <div class="notif-popover" role="dialog" aria-label="Notificações">
          <div class="notif-head">
            <strong>Notificações</strong>
            <div class="notif-head-acoes">
              <button type="button" id="notif-mark-all" class="notif-mark-all">Marcar como lidas</button>
              <button type="button" id="notif-clear" class="notif-mark-all">Limpar</button>
            </div>
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
      backdrop.querySelector("#notif-clear").addEventListener("click", () => void limparTela());
      backdrop.querySelector("#notif-list").addEventListener("click", (event) => {
        // O botão de lida/não lida vem antes: ele vive dentro da linha e não
        // pode disparar a navegação no mesmo gesto.
        if (event.target.closest('[data-action="alternar-lida"]')) {
          event.stopPropagation();
          void alternarLida(event.target.closest("[data-id]").dataset.id);
          return;
        }
        const linha = event.target.closest(".notif-item");
        if (!linha) return;
        const item = _items.find((i) => i.id === linha.dataset.id);
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
      void loadFeed();
    }

    // ── Ciclo de vida ────────────────────────────────────────────────────────
    // Telas separadas: o sino abre as notificações, a cartinha abre a lista de
    // contatos do correio (que tem janelas próprias).
    function bindBell() {
      const sino = document.querySelector("#notifications-trigger");
      if (sino && sino.dataset.bound !== "1") {
        sino.dataset.bound = "1";
        sino.addEventListener("click", () => { if (_popover) closePopover(); else openPopover(); });
      }
      const carta = document.querySelector("#messages-trigger");
      if (carta && carta.dataset.bound !== "1" && messagesTab) {
        carta.dataset.bound = "1";
        carta.addEventListener("click", () => messagesTab.toggleContatos());
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") void refreshCount();
    }

    function start() {
      bindBell();
      if (_timer) return;
      if (messagesTab) {
        messagesTab.onMessagesCountChange((n) => {
          _messagesRevision += 1;
          _unreadMsgs = Number(n) || 0;
          renderBadge();
        });
        void messagesTab.startMessages();
      }
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
      _messagesRevision = 0;
      _disabled = false;
      renderBadge();
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

    // Valor default de cada campo quando a org ainda não tem linha em
    // notification_settings pra esse kind (org nova, ou tipo recém-criado
    // antes do primeiro fetch semear a linha).
    const DEFAULT_CFG = { in_app: true, email: false, email_recipients: [], is_active: true, schedule_weekday: null, schedule_time: null };

    function scheduleRowMarkup(cfg) {
      const weekdayOptions = WEEKDAY_LABELS
        .map((label, idx) => `<option value="${idx}"${cfg.schedule_weekday === idx ? " selected" : ""}>${escapeHtml(label)}</option>`)
        .join("");
      const timeValue = cfg.schedule_time ? escapeHtml(String(cfg.schedule_time).slice(0, 5)) : "";
      return `
        <div class="notif-sched-row">
          <label>Dia da semana
            <select data-field="schedule_weekday" aria-label="Dia da semana">
              <option value="">Selecione</option>
              ${weekdayOptions}
            </select>
          </label>
          <label>Horário
            <input type="time" data-field="schedule_time" value="${timeValue}" aria-label="Horário">
          </label>
        </div>
      `;
    }

    // Bloco de 2 linhas por evento: linha 1 = nome+descrição do evento,
    // linha 2 = todos os controles (sininho/e-mail/destinatários/ativo, e o
    // dia/horário quando for o tipo agendado) juntos numa barra só. Antes
    // cada controle vivia numa coluna própria de uma tabela larga; virou
    // lista de blocos pra caber melhor e deixar o texto do evento respirar.
    function settingsRowMarkup(type) {
      const cfg = { ...DEFAULT_CFG, ..._settings.get(type.kind) };
      const list = Array.isArray(cfg.email_recipients) ? cfg.email_recipients : [];
      const isScheduled = type.trigger_mode === "scheduled";
      return `
        <div class="notif-cfg-row" data-kind="${escapeHtml(type.kind)}">
          <div class="notif-cfg-info">
            <strong class="notif-cfg-label">${escapeHtml(type.label)}</strong>
            <span class="notif-cfg-desc">${escapeHtml(type.description || "")}</span>
          </div>
          <div class="notif-cfg-controls">
            <label class="notif-cfg-toggle">
              <input type="checkbox" data-field="in_app"${cfg.in_app ? " checked" : ""} aria-label="Sininho">
              <span>Sininho</span>
            </label>
            <label class="notif-cfg-toggle">
              <input type="checkbox" data-field="email"${cfg.email ? " checked" : ""} aria-label="E-mail">
              <span>E-mail</span>
            </label>
            <button type="button" class="notif-rcpt-trigger${list.length ? " has-value" : ""}"
              data-kind="${escapeHtml(type.kind)}"${cfg.email ? "" : " disabled"}>
              <span class="notif-rcpt-label">${escapeHtml(recipientsLabel(list))}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
            </button>
            ${isScheduled ? scheduleRowMarkup(cfg) : ""}
            <label class="notif-cfg-toggle notif-cfg-toggle-active">
              <input type="checkbox" data-field="is_active"${cfg.is_active !== false ? " checked" : ""} aria-label="Ativo">
              <span>Ativo</span>
            </label>
          </div>
        </div>
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
        body.innerHTML = `<div class="users-empty">Nenhum tipo de evento cadastrado. Rode a migration 092.</div>`;
        return;
      }
      body.innerHTML = _types.map(settingsRowMarkup).join("");
    }

    async function loadAndRenderSettings() {
      const body = document.querySelector("#notif-config-body");
      if (!body) return;
      body.innerHTML = `<div class="users-empty">Carregando...</div>`;
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
        body.innerHTML = `<div class="users-empty">${escapeHtml(vpFriendlyError(error, "Falha ao carregar as notificações."))}</div>`;
      }
    }

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    async function persistRow(kind, patch) {
      const orgId = await resolveOrganizationId();
      const current = { ...DEFAULT_CFG, ..._settings.get(kind) };
      const merged = {
        organization_id: orgId,
        kind,
        in_app: patch.in_app !== undefined ? patch.in_app : current.in_app,
        email: patch.email !== undefined ? patch.email : current.email,
        email_recipients: patch.email_recipients !== undefined ? patch.email_recipients : (current.email_recipients || []),
        is_active: patch.is_active !== undefined ? patch.is_active : current.is_active,
        schedule_weekday: patch.schedule_weekday !== undefined ? patch.schedule_weekday : current.schedule_weekday,
        schedule_time: patch.schedule_time !== undefined ? patch.schedule_time : current.schedule_time,
        updated_at: new Date().toISOString(),
        updated_by: getCurrentUserId()
      };
      // Upsert com a linha COMPLETA (não parcial): a política de escrita é
      // admin da org e todos os NOT NULL vão preenchidos, então o WITH CHECK do
      // INSERT proposto passa — que é o que quebra em upsert parcial.
      await upsertSupabaseRows("notification_settings", [merged], ["organization_id", "kind"]);
      _settings.set(kind, merged);
    }

    const CHECKBOX_FIELDS = ["in_app", "email", "is_active"];
    const SCHEDULE_FIELDS = ["schedule_weekday", "schedule_time"];

    // Valor atual (já salvo) de um campo — usado pra restaurar a tela se o
    // upsert falhar, sem precisar repintar a linha inteira.
    function currentFieldValue(kind, field) {
      const cfg = { ...DEFAULT_CFG, ..._settings.get(kind) };
      return cfg[field];
    }

    function bindSettings() {
      const list = document.querySelector("#notif-config-body");
      if (!list || list.dataset.bound === "1") return;
      list.dataset.bound = "1";

      list.addEventListener("change", async (event) => {
        const input = event.target;
        const row = input.closest(".notif-cfg-row");
        if (!row || !isAdmin()) return;
        const kind = row.dataset.kind;
        const field = input.dataset.field;
        const isCheckbox = CHECKBOX_FIELDS.includes(field);
        const isSchedule = SCHEDULE_FIELDS.includes(field);
        if (!isCheckbox && !isSchedule) return;

        const rcptTrigger = row.querySelector(".notif-rcpt-trigger");
        if (field === "email" && rcptTrigger) {
          rcptTrigger.disabled = !input.checked;
          // Desligar o e-mail com o seletor aberto deixaria um painel órfão.
          if (!input.checked && _picker && _picker.trigger === rcptTrigger) closePicker();
        }

        const value = isCheckbox
          ? input.checked
          : field === "schedule_weekday"
            ? (input.value === "" ? null : Number(input.value))
            : (input.value || null); // schedule_time: "" -> null

        try {
          await persistRow(kind, { [field]: value });
          showToast("Notificações atualizadas.");
        } catch (error) {
          console.error(error);
          const previous = currentFieldValue(kind, field);
          if (isCheckbox) {
            input.checked = !!previous;
            if (field === "email" && rcptTrigger) rcptTrigger.disabled = !input.checked;
          } else {
            input.value = previous === null || previous === undefined
              ? ""
              : (field === "schedule_time" ? String(previous).slice(0, 5) : String(previous));
          }
          showToast(vpFriendlyError(error, "Falha ao salvar a configuração."), "error");
        }
      });

      // Abre o seletor de destinatários. A gravação acontece ao FECHAR o
      // painel, não a cada clique de checkbox.
      list.addEventListener("click", (event) => {
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
