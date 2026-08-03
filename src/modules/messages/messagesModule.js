// Correio interno — a aba "Mensagens" do popover compartilhado com o sininho.
//
// Este módulo cuida só do CONTEÚDO da aba (lista de assuntos, conversa,
// composição). Quem monta o popover, as abas e o polling é o
// notificationsModule — que recebe este módulo como dependência. Divisão
// escolhida pra existir UMA consulta periódica só (RPC inbox_counts): uma
// chamada por caixa dobraria o tráfego de fundo.
//
// Modelo (migration 094): assunto (thread) com participantes definidos no
// envio; resposta é visível a todos os participantes.
(function attachVectonMessagesModule(window) {
  function createMessagesModule(deps) {
    const {
      escapeHtml,
      callSupabaseRpc,
      fetchSupabaseRowsSafe,
      resolveOrganizationId,
      showToast,
      vpFriendlyError,
      getCurrentUserId,
      isSupabaseConfigured
    } = deps;

    let _view = "list";        // list | thread | compose
    let _threads = [];
    let _thread = null;        // { thread_id, subject } em foco
    let _messages = [];
    let _users = [];
    let _unread = 0;
    let _loading = false;
    let _disabled = false;     // migration 094 ainda não rodada
    let _container = null;
    let _onCountChange = null;

    function isMissingSchemaError(error) {
      const msg = String(error?.message || error || "");
      return msg.includes("PGRST202") || msg.includes("PGRST205")
        || msg.includes("does not exist") || msg.includes("schema cache");
    }

    function formatRelative(iso) {
      const then = new Date(iso).getTime();
      if (!Number.isFinite(then)) return "";
      const min = Math.floor((Date.now() - then) / 60000);
      if (min < 1) return "agora";
      if (min < 60) return `há ${min} min`;
      const h = Math.floor(min / 60);
      if (h < 24) return `há ${h} h`;
      const d = Math.floor(h / 24);
      if (d === 1) return "ontem";
      if (d < 7) return `há ${d} dias`;
      const dt = new Date(then);
      return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
    }

    function setUnread(n) {
      _unread = Number(n) || 0;
      if (_onCountChange) _onCountChange(_unread);
    }

    // ── Markup ───────────────────────────────────────────────────────────────
    function listMarkup() {
      if (_disabled) return `<div class="notif-empty">Correio interno ainda não configurado no banco.</div>`;
      if (_loading) return `<div class="notif-empty">Carregando...</div>`;
      if (!_threads.length) {
        return `<div class="notif-empty">Nenhuma mensagem. Use "Nova mensagem" para falar com alguém.</div>`;
      }
      return _threads.map((t) => `
        <button class="notif-item msg-item${t.nao_lidas > 0 ? " unread" : ""}" type="button" data-thread="${escapeHtml(t.thread_id)}">
          <span class="notif-item-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#vp-icon-mail"></use></svg></span>
          <span class="notif-item-copy">
            <strong>${escapeHtml(t.subject || "(sem assunto)")}</strong>
            <span class="notif-item-body">${escapeHtml(t.last_author || "")}: ${escapeHtml((t.last_body || "").slice(0, 90))}</span>
            <span class="msg-item-meta">${t.audience === "organization" ? "Toda a organização" : `${t.participantes} participantes`}</span>
          </span>
          <span class="notif-item-time">
            ${escapeHtml(formatRelative(t.last_at))}
            ${t.nao_lidas > 0 ? `<span class="msg-count">${t.nao_lidas}</span>` : ""}
          </span>
        </button>
      `).join("");
    }

    function threadMarkup() {
      const eu = getCurrentUserId();
      const corpo = _loading
        ? `<div class="notif-empty">Carregando...</div>`
        : _messages.map((m) => `
            <div class="msg-bubble${m.autor_id === eu ? " mine" : ""}">
              <div class="msg-bubble-head">
                <strong>${escapeHtml(m.autor || "")}</strong>
                <span>${escapeHtml(formatRelative(m.created_at))}</span>
              </div>
              <p>${escapeHtml(m.body || "")}</p>
            </div>
          `).join("");
      return `
        <div class="msg-thread-head">
          <button type="button" class="msg-back" data-action="voltar">← Voltar</button>
          <strong>${escapeHtml(_thread?.subject || "")}</strong>
        </div>
        <div class="msg-thread-body">${corpo}</div>
        <div class="msg-reply">
          <textarea id="msg-reply-text" rows="2" placeholder="Escreva sua resposta..."></textarea>
          <button type="button" class="primary-button" data-action="responder">Responder</button>
        </div>
      `;
    }

    function composeMarkup() {
      const opcoes = _users
        .filter((u) => u.user_id !== getCurrentUserId())   // não faz sentido mandar pra si
        .map((u) => `
          <label class="notif-rcpt-opt">
            <input type="checkbox" value="${escapeHtml(u.user_id)}">
            <span class="notif-rcpt-opt-copy">
              <strong>${escapeHtml(u.name || u.email)}</strong>
              ${u.name && u.email ? `<span>${escapeHtml(u.email)}</span>` : ""}
            </span>
          </label>`).join("");
      return `
        <div class="msg-thread-head">
          <button type="button" class="msg-back" data-action="voltar">← Voltar</button>
          <strong>Nova mensagem</strong>
        </div>
        <div class="msg-compose">
          <input type="text" id="msg-subject" placeholder="Assunto">
          <label class="msg-todos">
            <input type="checkbox" id="msg-org"> Enviar para toda a organização
          </label>
          <div class="msg-people" id="msg-people">${opcoes || `<div class="notif-rcpt-vazio">Nenhum outro usuário cadastrado.</div>`}</div>
          <textarea id="msg-body" rows="4" placeholder="Escreva sua mensagem..."></textarea>
        </div>
        <div class="msg-reply">
          <button type="button" class="primary-button" data-action="enviar">Enviar</button>
        </div>
      `;
    }

    function paint() {
      if (!_container) return;
      if (_view === "thread") _container.innerHTML = threadMarkup();
      else if (_view === "compose") _container.innerHTML = composeMarkup();
      else {
        _container.innerHTML = `
          <div class="msg-toolbar">
            <button type="button" class="reports-toolbar-btn" data-action="nova">+ Nova mensagem</button>
          </div>
          <div class="msg-list">${listMarkup()}</div>
        `;
      }
    }

    // ── Dados ────────────────────────────────────────────────────────────────
    async function loadThreads() {
      if (_disabled || !isSupabaseConfigured()) return;
      _loading = true;
      paint();
      try {
        const rows = await callSupabaseRpc("messages_feed", { p_limit: 30 });
        _threads = Array.isArray(rows) ? rows : [];
      } catch (error) {
        if (isMissingSchemaError(error)) _disabled = true;
        else {
          console.error(error);
          showToast(vpFriendlyError(error, "Falha ao carregar as mensagens."), "error");
        }
      } finally {
        _loading = false;
        paint();
      }
    }

    async function openThread(threadId) {
      const t = _threads.find((x) => x.thread_id === threadId);
      _thread = t ? { thread_id: t.thread_id, subject: t.subject } : { thread_id: threadId, subject: "" };
      _view = "thread";
      _messages = [];
      _loading = true;
      paint();
      try {
        _messages = await callSupabaseRpc("thread_messages", { p_thread: threadId }) || [];
        // Abrir o assunto marca tudo dele como lido.
        await callSupabaseRpc("messages_mark_thread_read", { p_thread: threadId });
        const lidas = t?.nao_lidas || 0;
        if (lidas > 0) {
          if (t) t.nao_lidas = 0;
          setUnread(Math.max(0, _unread - lidas));
        }
      } catch (error) {
        console.error(error);
        showToast(vpFriendlyError(error, "Falha ao abrir a conversa."), "error");
      } finally {
        _loading = false;
        paint();
      }
    }

    async function loadUsers() {
      try {
        const orgId = await resolveOrganizationId();
        const rows = await fetchSupabaseRowsSafe(
          "user_profiles",
          `organization_id=eq.${orgId}&select=user_id,full_name,email&order=full_name.asc`
        );
        _users = (rows || [])
          .map((u) => ({
            user_id: u.user_id,
            name: String(u.full_name || "").trim(),
            email: String(u.email || "").trim()
          }))
          .filter((u) => u.user_id);
      } catch (error) {
        console.error(error);
        _users = [];
      }
    }

    async function enviar() {
      const subject = _container.querySelector("#msg-subject")?.value || "";
      const body = _container.querySelector("#msg-body")?.value || "";
      const paraOrg = Boolean(_container.querySelector("#msg-org")?.checked);
      const ids = [..._container.querySelectorAll("#msg-people input:checked")].map((i) => i.value);

      if (!subject.trim()) { showToast("Informe um assunto.", "error"); return; }
      if (!body.trim()) { showToast("Escreva a mensagem.", "error"); return; }
      if (!paraOrg && !ids.length) { showToast("Selecione ao menos um destinatário.", "error"); return; }

      const btn = _container.querySelector('[data-action="enviar"]');
      if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }
      try {
        await callSupabaseRpc("send_message", {
          p_subject: subject,
          p_body: body,
          p_user_ids: paraOrg ? [] : ids,
          p_audience: paraOrg ? "organization" : "people"
        });
        showToast("Mensagem enviada.");
        _view = "list";
        await loadThreads();
      } catch (error) {
        console.error(error);
        showToast(vpFriendlyError(error, "Falha ao enviar a mensagem."), "error");
        if (btn) { btn.disabled = false; btn.textContent = "Enviar"; }
      }
    }

    async function responder() {
      const texto = _container.querySelector("#msg-reply-text")?.value || "";
      if (!texto.trim()) { showToast("Escreva a resposta.", "error"); return; }
      const btn = _container.querySelector('[data-action="responder"]');
      if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }
      try {
        await callSupabaseRpc("reply_to_thread", { p_thread: _thread.thread_id, p_body: texto });
        _messages = await callSupabaseRpc("thread_messages", { p_thread: _thread.thread_id }) || [];
        paint();
      } catch (error) {
        console.error(error);
        showToast(vpFriendlyError(error, "Falha ao enviar a resposta."), "error");
        if (btn) { btn.disabled = false; btn.textContent = "Responder"; }
      }
    }

    // ── Entrada usada pelo notificationsModule ───────────────────────────────
    function renderInto(container, onCountChange) {
      _container = container;
      _onCountChange = onCountChange || _onCountChange;
      _view = "list";
      _thread = null;
      paint();
      void loadThreads();

      if (container.dataset.bound === "1") return;
      container.dataset.bound = "1";
      container.addEventListener("click", (event) => {
        const acao = event.target.closest("[data-action]")?.dataset.action;
        if (acao === "nova") {
          _view = "compose";
          paint();
          void loadUsers().then(() => { if (_view === "compose") paint(); });
          return;
        }
        if (acao === "voltar") { _view = "list"; paint(); void loadThreads(); return; }
        if (acao === "enviar") { void enviar(); return; }
        if (acao === "responder") { void responder(); return; }
        const item = event.target.closest(".msg-item");
        if (item) void openThread(item.dataset.thread);
      });
      // "Toda a organização" e escolha individual são mutuamente exclusivas.
      container.addEventListener("change", (event) => {
        if (event.target.id !== "msg-org") return;
        const lista = container.querySelector("#msg-people");
        if (lista) lista.classList.toggle("disabled", event.target.checked);
        lista?.querySelectorAll("input").forEach((i) => { i.disabled = event.target.checked; });
      });
    }

    return {
      renderMessagesInto: renderInto,
      setMessagesUnread: setUnread,
      getMessagesUnread: () => _unread,
      reloadMessages: loadThreads
    };
  }

  window.VECTON_MESSAGES = { createMessagesModule };
})(window);
