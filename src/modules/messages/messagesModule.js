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
      isSupabaseConfigured,
      uploadToStorage,
      createStorageSignedUrl,
      appConfirm
    } = deps;

    const BUCKET = "message-attachments";
    const MAX_FILE_MB = 15;

    let _view = "list";        // list | thread | compose
    let _threads = [];
    let _thread = null;        // { thread_id, subject } em foco
    let _messages = [];
    let _users = [];
    let _composeTo = [];        // destinatários escolhidos no campo "Para"
    let _pendingFiles = [];     // arquivos escolhidos, ainda não enviados
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
      // <div role="button"> e não <button>: a linha carrega um botão de excluir
      // dentro, e botão dentro de botão é HTML inválido (o navegador desmonta a
      // árvore e o clique fica imprevisível).
      return _threads.map((t) => `
        <div class="notif-item msg-item${t.nao_lidas > 0 ? " unread" : ""}" role="button" tabindex="0" data-thread="${escapeHtml(t.thread_id)}">
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
          <button type="button" class="msg-thread-del" data-action="excluir-thread" data-thread="${escapeHtml(t.thread_id)}" title="Excluir conversa" aria-label="Excluir conversa">✕</button>
        </div>
      `).join("");
    }

    // Hora do envio (o usuário pediu hora, não "há X min").
    function formatHora(iso) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    // Tiques no padrão WhatsApp: 1 = enviada, 2 = entregue, 2 verdes = lida.
    // Em conversa com várias pessoas vale a regra de grupo — só sobe de estado
    // quando TODOS os destinatários receberam/leram (quem calcula é o banco).
    function tiquesMarkup(status) {
      if (!status) return "";
      const um = `<path d="M2 8.5l3.2 3.2L11.5 5"></path>`;
      const dois = `${um}<path d="M7.5 11.7L13.8 5"></path>`;
      const classe = status === "read" ? "msg-tick lido" : "msg-tick";
      const titulo = status === "read" ? "Lida" : (status === "delivered" ? "Entregue" : "Enviada");
      return `<svg class="${classe}" viewBox="0 0 16 16" aria-label="${titulo}"><title>${titulo}</title>${status === "sent" ? um : dois}</svg>`;
    }

    function anexosMarkup(m, minha) {
      const lista = Array.isArray(m.anexos) ? m.anexos : [];
      if (!lista.length) return "";
      return `<div class="msg-anexos">` + lista.map((a) => {
        const ehImagem = String(a.mime || "").startsWith("image/");
        if (ehImagem) {
          // A imagem carrega sob demanda (URL assinada) — ver hidrataImagens.
          return `<button type="button" class="msg-anexo-img" data-path="${escapeHtml(a.path)}" data-nome="${escapeHtml(a.name)}" title="${escapeHtml(a.name)}">
                    <span class="msg-anexo-loading">carregando imagem...</span>
                  </button>`;
        }
        return `<button type="button" class="msg-anexo-file" data-path="${escapeHtml(a.path)}" data-nome="${escapeHtml(a.name)}">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path></svg>
                  <span class="msg-anexo-nome">${escapeHtml(a.name)}</span>
                  <span class="msg-anexo-size">${formatTamanho(a.size)}</span>
                </button>`;
      }).join("") + `</div>`;
    }

    function formatTamanho(bytes) {
      const n = Number(bytes) || 0;
      if (n < 1024) return `${n} B`;
      if (n < 1048576) return `${Math.round(n / 1024)} KB`;
      return `${(n / 1048576).toFixed(1)} MB`;
    }

    function threadMarkup() {
      const eu = getCurrentUserId();
      const corpo = _loading
        ? `<div class="notif-empty">Carregando...</div>`
        : _messages.map((m) => {
            const minha = m.autor_id === eu;
            return `
            <div class="msg-bubble${minha ? " mine" : ""}" data-id="${escapeHtml(m.id)}">
              <div class="msg-bubble-head">
                <strong>${escapeHtml(m.autor || "")}</strong>
                <button type="button" class="msg-del" data-action="excluir" data-id="${escapeHtml(m.id)}" data-minha="${minha ? "1" : "0"}" title="Excluir mensagem" aria-label="Excluir mensagem">✕</button>
              </div>
              ${m.body ? `<p>${escapeHtml(m.body)}</p>` : ""}
              ${anexosMarkup(m, minha)}
              <div class="msg-bubble-foot">
                <span>${escapeHtml(formatHora(m.created_at))}</span>
                ${minha ? tiquesMarkup(m.status) : ""}
              </div>
            </div>`;
          }).join("");

      const pendentes = _pendingFiles.length
        ? `<div class="msg-pendentes">` + _pendingFiles.map((f, i) => `
             <span class="msg-pendente">${escapeHtml(f.name)}<button type="button" data-action="tirar-anexo" data-i="${i}" aria-label="Remover">✕</button></span>
           `).join("") + `</div>`
        : "";

      return `
        <div class="msg-thread-head">
          <button type="button" class="msg-back" data-action="voltar">← Voltar</button>
          <strong>${escapeHtml(_thread?.subject || "")}</strong>
        </div>
        <div class="msg-thread-body">${corpo}</div>
        ${pendentes}
        <div class="msg-reply">
          <button type="button" class="msg-attach" data-action="anexar" title="Anexar arquivo ou foto" aria-label="Anexar">+</button>
          <input type="file" id="msg-file" multiple hidden>
          <textarea id="msg-reply-text" rows="2" placeholder="Escreva sua resposta..."></textarea>
          <button type="button" class="primary-button" data-action="responder">Responder</button>
        </div>
      `;
    }

    // ── Campo "Para" (chips + autocomplete) ──────────────────────────────────
    // Substituiu a lista de checkboxes: com dezenas de usuários, marcar um a um
    // não escala. Comporta-se como o "Para:" de um cliente de e-mail.
    const RECENTES_KEY = "vp_msg_recent_recipients_v1";
    const MAX_RECENTES = 15;

    function getRecentes() {
      try { return JSON.parse(localStorage.getItem(RECENTES_KEY) || "[]"); } catch (_) { return []; }
    }
    function salvarRecentes(ids) {
      if (!ids.length) return;
      try {
        const merged = Array.from(new Set([...ids, ...getRecentes()])).slice(0, MAX_RECENTES);
        localStorage.setItem(RECENTES_KEY, JSON.stringify(merged));
      } catch (_) { /* localStorage indisponível não trava o envio */ }
    }

    function candidatos(query) {
      const eu = getCurrentUserId();
      const escolhidos = new Set(_composeTo.map((u) => u.user_id));
      const q = String(query || "").trim().toLowerCase();
      const livres = _users.filter((u) => u.user_id !== eu && !escolhidos.has(u.user_id));
      if (q) {
        return livres
          .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
          .slice(0, 8);
      }
      // Sem busca: quem você mais usa primeiro, depois o resto em ordem.
      const recentes = getRecentes();
      const ordenado = [...livres].sort((a, b) => {
        const ia = recentes.indexOf(a.user_id);
        const ib = recentes.indexOf(b.user_id);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.name.localeCompare(b.name);
      });
      return ordenado.slice(0, 8).map((u) => ({ ...u, recente: recentes.includes(u.user_id) }));
    }

    function renderChips() {
      const alvo = _container?.querySelector("#msg-para-chips");
      if (!alvo) return;
      alvo.innerHTML = _composeTo.map((u) => `
        <span class="msg-chip">${escapeHtml(u.name || u.email)}<button type="button" data-action="tirar-para" data-id="${escapeHtml(u.user_id)}" aria-label="Remover">✕</button></span>
      `).join("");
    }

    function renderSugestoes(query, mostrar) {
      const alvo = _container?.querySelector("#msg-para-sug");
      if (!alvo) return;
      if (!mostrar) { alvo.style.display = "none"; return; }
      const lista = candidatos(query);
      if (!lista.length) {
        alvo.innerHTML = `<div class="msg-sug-vazio">${query ? "Ninguém encontrado." : "Nenhum outro usuário cadastrado."}</div>`;
      } else {
        alvo.innerHTML = lista.map((u, i) => `
          <button type="button" class="msg-sug${i === 0 ? " ativa" : ""}" data-action="add-para" data-id="${escapeHtml(u.user_id)}">
            <span class="msg-sug-copy">
              <strong>${escapeHtml(u.name || u.email)}</strong>
              <span>${escapeHtml(u.email)}</span>
            </span>
            ${u.recente ? `<span class="msg-sug-tag">recente</span>` : ""}
          </button>`).join("");
      }
      alvo.style.display = "block";
    }

    function addPara(userId) {
      const u = _users.find((x) => x.user_id === userId);
      if (!u || _composeTo.some((x) => x.user_id === userId)) return;
      _composeTo.push(u);
      renderChips();
      const input = _container?.querySelector("#msg-para-input");
      if (input) { input.value = ""; input.focus(); }
      renderSugestoes("", false);
    }

    function tirarPara(userId) {
      _composeTo = _composeTo.filter((u) => u.user_id !== userId);
      renderChips();
    }

    function composeMarkup() {
      return `
        <div class="msg-thread-head">
          <button type="button" class="msg-back" data-action="voltar">← Voltar</button>
          <strong>Nova mensagem</strong>
        </div>
        <div class="msg-compose">
          <div class="msg-para" id="msg-para">
            <div class="msg-para-field" id="msg-para-field">
              <span class="msg-para-label">Para</span>
              <span id="msg-para-chips"></span>
              <input type="text" id="msg-para-input" placeholder="Digite um nome..." autocomplete="off">
            </div>
            <div class="msg-para-sug" id="msg-para-sug" style="display:none"></div>
          </div>
          <label class="msg-todos">
            <input type="checkbox" id="msg-org"> Enviar para toda a organização
          </label>
          <input type="text" id="msg-subject" placeholder="Assunto">
          <textarea id="msg-body" rows="4" placeholder="Escreva sua mensagem..."></textarea>
        </div>
        <div class="msg-reply">
          <button type="button" class="primary-button" data-action="enviar">Enviar</button>
        </div>
      `;
    }

    // Bucket privado: cada imagem precisa de URL assinada, então a bolha nasce
    // com um placeholder e a imagem entra quando a assinatura volta. Feito por
    // anexo (e não numa chamada só) porque são poucos por conversa.
    async function hidrataImagens() {
      if (!_container) return;
      const alvos = [..._container.querySelectorAll(".msg-anexo-img:not([data-pronta])")];
      for (const alvo of alvos) {
        alvo.dataset.pronta = "1";
        try {
          const url = await createStorageSignedUrl(BUCKET, alvo.dataset.path);
          const img = document.createElement("img");
          img.src = url;
          img.alt = alvo.dataset.nome || "";
          alvo.innerHTML = "";
          alvo.appendChild(img);
        } catch (error) {
          console.error(error);
          alvo.innerHTML = `<span class="msg-anexo-loading">falha ao carregar</span>`;
        }
      }
    }

    // Clique no anexo baixa o arquivo — o `download` no fim da URL assinada faz
    // o Storage devolver como anexo, com o nome original.
    async function baixarAnexo(path, nome) {
      try {
        const url = await createStorageSignedUrl(BUCKET, path);
        const a = document.createElement("a");
        a.href = `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(nome || "arquivo")}`;
        a.rel = "noopener";
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (error) {
        console.error(error);
        showToast(vpFriendlyError(error, "Falha ao abrir o anexo."), "error");
      }
    }

    function paint() {
      if (!_container) return;
      if (_view === "thread") {
        _container.innerHTML = threadMarkup();
        void hidrataImagens();
        return;
      }
      if (_view === "compose") {
        _container.innerHTML = composeMarkup();
        renderChips();
      } else {
        _container.innerHTML = `
          <div class="msg-toolbar">
            <button type="button" class="msg-new-btn" data-action="nova">+ Nova mensagem</button>
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
      const ids = _composeTo.map((u) => u.user_id);

      if (!subject.trim()) { showToast("Informe um assunto.", "error"); return; }
      if (!body.trim()) { showToast("Escreva a mensagem.", "error"); return; }
      if (!paraOrg && !ids.length) { showToast("Escolha ao menos um destinatário em Para.", "error"); return; }

      const btn = _container.querySelector('[data-action="enviar"]');
      if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }
      try {
        await callSupabaseRpc("send_message", {
          p_subject: subject,
          p_body: body,
          p_user_ids: paraOrg ? [] : ids,
          p_audience: paraOrg ? "organization" : "people"
        });
        // Lembra quem você usa — alimenta a ordenação do autocomplete.
        if (!paraOrg) salvarRecentes(ids);
        showToast("Mensagem enviada.");
        _view = "list";
        _composeTo = [];
        await loadThreads();
      } catch (error) {
        console.error(error);
        showToast(vpFriendlyError(error, "Falha ao enviar a mensagem."), "error");
        if (btn) { btn.disabled = false; btn.textContent = "Enviar"; }
      }
    }

    // Sobe cada arquivo e registra o anexo. O caminho começa pelo id da thread
    // porque é isso que a policy do Storage usa pra decidir o acesso.
    async function subirAnexos(messageId) {
      for (const file of _pendingFiles) {
        const seguro = file.name.replace(/[^\w.\- ]+/g, "_").slice(-80);
        const caminho = `${_thread.thread_id}/${crypto.randomUUID()}_${seguro}`;
        await uploadToStorage(BUCKET, caminho, file);
        await callSupabaseRpc("add_message_attachment", {
          p_message_id: messageId,
          p_path: caminho,
          p_file_name: file.name,
          p_mime: file.type || "",
          p_size: file.size || 0
        });
      }
      _pendingFiles = [];
    }

    async function responder() {
      const texto = _container.querySelector("#msg-reply-text")?.value || "";
      // Com anexo, o texto pode ficar vazio — mandar só a foto é legítimo.
      if (!texto.trim() && !_pendingFiles.length) {
        showToast("Escreva a resposta ou anexe um arquivo.", "error");
        return;
      }
      const btn = _container.querySelector('[data-action="responder"]');
      if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }
      try {
        const id = await callSupabaseRpc("reply_to_thread", {
          p_thread: _thread.thread_id,
          p_body: texto.trim() || "(anexo)"
        });
        if (_pendingFiles.length) await subirAnexos(id);
        _messages = await callSupabaseRpc("thread_messages", { p_thread: _thread.thread_id }) || [];
        paint();
      } catch (error) {
        console.error(error);
        showToast(vpFriendlyError(error, "Falha ao enviar a resposta."), "error");
        if (btn) { btn.disabled = false; btn.textContent = "Responder"; }
      }
    }

    async function excluirMensagem(id, minha) {
      // Apagar o que outra pessoa escreveu some pra todos e não tem volta —
      // esse merece confirmação. A própria mensagem sai direto.
      if (!minha && appConfirm) {
        const ok = await appConfirm("Excluir esta mensagem? Ela some para todos os participantes.");
        if (!ok) return;
      }
      try {
        await callSupabaseRpc("delete_message", { p_message_id: id });
        _messages = _messages.filter((m) => m.id !== id);
        if (!_messages.length) {
          // Assunto ficou sem mensagem: o banco apaga a thread, então volta.
          _view = "list";
          paint();
          await loadThreads();
          return;
        }
        paint();
        showToast("Mensagem excluída.");
      } catch (error) {
        console.error(error);
        showToast(vpFriendlyError(error, "Falha ao excluir a mensagem."), "error");
      }
    }

    async function excluirConversa(threadId) {
      const t = _threads.find((x) => x.thread_id === threadId);
      if (appConfirm) {
        const ok = await appConfirm(
          `Excluir a conversa "${t?.subject || "sem assunto"}"? Todas as mensagens somem para todos os participantes.`
        );
        if (!ok) return;
      }
      try {
        await callSupabaseRpc("delete_thread", { p_thread: threadId });
        _threads = _threads.filter((x) => x.thread_id !== threadId);
        if (_thread?.thread_id === threadId) { _view = "list"; _thread = null; }
        paint();
        showToast("Conversa excluída.");
        await loadThreads();
      } catch (error) {
        console.error(error);
        showToast(vpFriendlyError(error, "Falha ao excluir a conversa."), "error");
      }
    }

    function escolherArquivos(input) {
      const escolhidos = [...(input.files || [])];
      const grandes = escolhidos.filter((f) => f.size > MAX_FILE_MB * 1048576);
      if (grandes.length) {
        showToast(`"${grandes[0].name}" passa de ${MAX_FILE_MB} MB.`, "error");
      }
      _pendingFiles = _pendingFiles.concat(escolhidos.filter((f) => f.size <= MAX_FILE_MB * 1048576));
      input.value = "";
      paint();
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
          _composeTo = [];
          paint();
          void loadUsers().then(() => { if (_view === "compose") renderChips(); });
          return;
        }
        if (acao === "add-para") { addPara(event.target.closest("[data-id]").dataset.id); return; }
        if (acao === "tirar-para") { tirarPara(event.target.closest("[data-id]").dataset.id); return; }
        if (acao === "voltar") { _view = "list"; _pendingFiles = []; paint(); void loadThreads(); return; }
        if (acao === "enviar") { void enviar(); return; }
        if (acao === "responder") { void responder(); return; }
        if (acao === "excluir") {
          const alvo = event.target.closest("[data-id]");
          if (alvo) void excluirMensagem(alvo.dataset.id, alvo.dataset.minha === "1");
          return;
        }
        // Antes do clique da linha: o botão vive DENTRO dela e não pode abrir a
        // conversa no mesmo gesto.
        if (acao === "excluir-thread") {
          event.stopPropagation();
          const alvo = event.target.closest("[data-thread]");
          if (alvo) void excluirConversa(alvo.dataset.thread);
          return;
        }
        if (acao === "anexar") { container.querySelector("#msg-file")?.click(); return; }
        if (acao === "tirar-anexo") {
          const i = Number(event.target.closest("[data-i]")?.dataset.i);
          if (Number.isInteger(i)) { _pendingFiles.splice(i, 1); paint(); }
          return;
        }
        const anexo = event.target.closest(".msg-anexo-file, .msg-anexo-img");
        if (anexo) { void baixarAnexo(anexo.dataset.path, anexo.dataset.nome); return; }
        const item = event.target.closest(".msg-item");
        if (item) void openThread(item.dataset.thread);
      });
      container.addEventListener("change", (event) => {
        if (event.target.id === "msg-file") escolherArquivos(event.target);
      });

      // Campo "Para": as sugestões são repintadas sozinhas (sem paint() geral),
      // senão o input perderia o foco a cada tecla.
      container.addEventListener("input", (event) => {
        if (event.target.id !== "msg-para-input") return;
        renderSugestoes(event.target.value, true);
      });
      container.addEventListener("focusin", (event) => {
        if (event.target.id === "msg-para-input") renderSugestoes(event.target.value, true);
      });
      container.addEventListener("keydown", (event) => {
        if (event.target.id !== "msg-para-input") return;
        if (event.key === "Enter") {
          event.preventDefault();
          const primeira = container.querySelector(".msg-sug");
          if (primeira) addPara(primeira.dataset.id);
          return;
        }
        if (event.key === "Escape") { renderSugestoes("", false); return; }
        // Backspace no campo vazio tira o último chip — comportamento esperado
        // em campo de destinatários.
        if (event.key === "Backspace" && !event.target.value && _composeTo.length) {
          tirarPara(_composeTo[_composeTo.length - 1].user_id);
        }
      });
      // "Toda a organização" e o campo "Para" são mutuamente exclusivos.
      container.addEventListener("change", (event) => {
        if (event.target.id !== "msg-org") return;
        const para = container.querySelector("#msg-para");
        if (para) para.classList.toggle("disabled", event.target.checked);
        const input = container.querySelector("#msg-para-input");
        if (input) input.disabled = event.target.checked;
        if (event.target.checked) renderSugestoes("", false);
      });
    }

    // Marcar "entregue" tem que acontecer no POLLING, não só quando a aba é
    // aberta: o segundo tique significa "chegou no aparelho da pessoa", e isso
    // é verdade assim que o cliente dela busca as mensagens.
    async function markDelivered() {
      if (_disabled || !isSupabaseConfigured()) return;
      try {
        await callSupabaseRpc("mark_messages_delivered");
      } catch (error) {
        if (isMissingSchemaError(error)) _disabled = true;
        // Falha transitória não merece ruído: o próximo tick tenta de novo.
      }
    }

    return {
      renderMessagesInto: renderInto,
      setMessagesUnread: setUnread,
      getMessagesUnread: () => _unread,
      reloadMessages: loadThreads,
      markMessagesDelivered: markDelivered
    };
  }

  window.VECTON_MESSAGES = { createMessagesModule };
})(window);
