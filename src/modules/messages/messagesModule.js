// Correio interno estilo MSN.
//
// Duas peças independentes:
//   • PAINEL DE CONTATOS (20vw x 85vh, encostado à direita) — lista de pessoas
//     da organização com presença e recado pessoal, mais os grupos. Duplo
//     clique abre a conversa.
//   • JANELAS DE CONVERSA flutuantes, várias ao mesmo tempo, arrastáveis e
//     redimensionáveis.
//
// Separado do sininho desde a 098: notificação e mensagem viraram telas
// distintas. O que continua compartilhado é o POLLING de 60s do
// notificationsModule (RPC inbox_counts), que traz as duas contagens e serve de
// batimento de presença — nunca criar um segundo timer global pra isso.
//
// Enquanto há janela aberta roda um polling curto (4s) só das conversas
// abertas: é o que faz "está digitando" e a chegada de mensagem parecerem
// instantâneos sem WebSocket.
(function attachVectonMessagesModule(window) {
  function createMessagesModule(deps) {
    const {
      escapeHtml,
      callSupabaseRpc,
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
    const POLL_ABERTAS_MS = 4000;
    const POLL_CONTATOS_MS = 30000;
    const THUMB_MAX = 320;

    let _painel = null;
    let _contatos = [];
    let _grupos = [];
    let _busca = "";
    let _unread = 0;
    let _disabled = false;
    let _onCountChange = null;
    let _timerAbertas = null;
    let _timerContatos = null;
    let _zIndex = 9500;

    // thread_id -> { el, titulo, mensagens, aba, ultimoId, digitando }
    const _janelas = new Map();

    function isMissingSchemaError(error) {
      const msg = String(error?.message || error || "");
      return msg.includes("PGRST202") || msg.includes("PGRST205")
        || msg.includes("does not exist") || msg.includes("schema cache");
    }

    function formatHora(iso) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    function formatTamanho(bytes) {
      const n = Number(bytes) || 0;
      if (n < 1024) return `${n} B`;
      if (n < 1048576) return `${Math.round(n / 1024)} KB`;
      return `${(n / 1048576).toFixed(1)} MB`;
    }

    // Som curto sintetizado — evita carregar arquivo de áudio só pra isso.
    function bip(freq = 880) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.07, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start();
        setTimeout(() => { try { osc.stop(); ctx.close(); } catch (_) {} }, 260);
      } catch (_) { /* som é enfeite: nunca pode quebrar o envio */ }
    }

    function setUnread(n) {
      _unread = Number(n) || 0;
      if (_onCountChange) _onCountChange(_unread);
    }

    // ── Painel de contatos ───────────────────────────────────────────────────
    function contatosFiltrados() {
      const q = _busca.trim().toLowerCase();
      if (!q) return _contatos;
      return _contatos.filter((c) => c.nome.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    }

    function painelMarkup() {
      if (_disabled) {
        return `<div class="msn-vazio">Correio interno ainda não configurado no banco.</div>`;
      }
      const grupos = _grupos.map((g) => `
        <div class="msn-contato msn-grupo" role="button" tabindex="0" data-thread="${escapeHtml(g.thread_id)}" data-titulo="${escapeHtml(g.titulo)}">
          <span class="msn-avatar grupo">${escapeHtml((g.titulo || "G").slice(0, 1).toUpperCase())}</span>
          <span class="msn-contato-copy">
            <strong>${escapeHtml(g.titulo)}</strong>
            <span>${g.membros} participantes</span>
          </span>
          ${g.nao_lidas > 0 ? `<span class="msn-badge">${g.nao_lidas}</span>` : ""}
        </div>`).join("");

      const pessoas = contatosFiltrados().map((c) => `
        <div class="msn-contato${c.__sel ? " selecionado" : ""}" role="button" tabindex="0" data-user="${escapeHtml(c.user_id)}" data-titulo="${escapeHtml(c.nome)}" title="Duplo clique para conversar · clique simples para marcar e formar grupo">
          <span class="msn-avatar ${escapeHtml(c.presenca)}">${escapeHtml(c.nome.slice(0, 1).toUpperCase())}</span>
          <span class="msn-contato-copy">
            <strong>${escapeHtml(c.nome)}</strong>
            <span>${escapeHtml(c.recado || c.email)}</span>
          </span>
          ${c.nao_lidas > 0 ? `<span class="msn-badge">${c.nao_lidas}</span>` : ""}
        </div>`).join("");

      const online = _contatos.filter((c) => c.presenca !== "offline").length;
      return `
        <div class="msn-head">
          <strong>Contatos</strong>
          <div class="msn-head-acoes">
            <button type="button" class="msn-icon-btn" data-action="novo-grupo" title="Novo grupo">＋</button>
            <button type="button" class="msn-icon-btn" data-action="fechar-painel" title="Fechar">✕</button>
          </div>
        </div>
        <div class="msn-eu">
          <select id="msn-presenca" class="msn-presenca">
            <option value="disponivel">Disponível</option>
            <option value="ausente">Ausente</option>
            <option value="ocupado">Ocupado</option>
            <option value="invisivel">Invisível</option>
          </select>
          <input type="text" id="msn-recado" class="msn-recado" placeholder="Escreva um recado..." maxlength="80">
        </div>
        <div class="msn-busca"><input type="text" id="msn-busca" placeholder="Buscar contato..." value="${escapeHtml(_busca)}"></div>
        <div class="msn-lista">
          ${_grupos.length ? `<div class="msn-secao">Grupos</div>${grupos}` : ""}
          <div class="msn-secao">Contatos · ${online} online</div>
          ${pessoas || `<div class="msn-vazio">Nenhum contato encontrado.</div>`}
        </div>
      `;
    }

    function pintarPainel() {
      if (!_painel) return;
      const foco = document.activeElement?.id;
      const posBusca = document.querySelector("#msn-busca")?.selectionStart;
      _painel.innerHTML = painelMarkup();
      const sel = _painel.querySelector("#msn-presenca");
      if (sel && _meuPerfil.presenca) sel.value = _meuPerfil.presenca;
      const rec = _painel.querySelector("#msn-recado");
      if (rec) rec.value = _meuPerfil.recado || "";
      // Repintar não pode roubar o foco de quem está digitando na busca.
      if (foco === "msn-busca") {
        const el = _painel.querySelector("#msn-busca");
        el?.focus();
        if (posBusca != null) el?.setSelectionRange(posBusca, posBusca);
      }
    }

    const _meuPerfil = { presenca: "disponivel", recado: "" };

    async function carregarContatos() {
      if (_disabled || !isSupabaseConfigured()) return;
      try {
        const [contatos, grupos] = await Promise.all([
          callSupabaseRpc("contacts_list"),
          callSupabaseRpc("groups_list")
        ]);
        _contatos = Array.isArray(contatos) ? contatos : [];
        _grupos = Array.isArray(grupos) ? grupos : [];
        pintarPainel();
      } catch (error) {
        if (isMissingSchemaError(error)) { _disabled = true; pintarPainel(); return; }
        console.debug("contatos: falha ao carregar", error);
      }
    }

    function abrirPainel() {
      if (_painel) { fecharPainel(); return; }
      _painel = document.createElement("div");
      _painel.className = "msn-painel";
      _painel.innerHTML = painelMarkup();
      document.body.appendChild(_painel);

      _painel.addEventListener("click", (event) => {
        const acao = event.target.closest("[data-action]")?.dataset.action;
        if (acao === "fechar-painel") { fecharPainel(); return; }
        if (acao === "novo-grupo") { void criarGrupo(); return; }
        // Clique simples marca o contato (pra formar grupo); o duplo abre a
        // conversa. Como o duplo dispara clique antes, marcar e desmarcar em
        // sequência não atrapalha — o estado volta ao que era.
        const pessoa = event.target.closest("[data-user]");
        if (pessoa) {
          const c = _contatos.find((x) => x.user_id === pessoa.dataset.user);
          if (c) { c.__sel = !c.__sel; pintarPainel(); }
        }
      });
      _painel.addEventListener("dblclick", (event) => {
        const alvo = event.target.closest("[data-user], [data-thread]");
        if (!alvo) return;
        if (alvo.dataset.thread) abrirJanela(alvo.dataset.thread, alvo.dataset.titulo);
        else void abrirConversaCom(alvo.dataset.user, alvo.dataset.titulo);
      });
      _painel.addEventListener("input", (event) => {
        if (event.target.id === "msn-busca") { _busca = event.target.value; pintarPainel(); }
      });
      _painel.addEventListener("change", (event) => {
        if (event.target.id === "msn-presenca") {
          _meuPerfil.presenca = event.target.value;
          void callSupabaseRpc("set_my_presence", { p_choice: event.target.value }).catch(() => {});
        }
      });
      _painel.addEventListener("focusout", (event) => {
        if (event.target.id !== "msn-recado") return;
        _meuPerfil.recado = event.target.value;
        void callSupabaseRpc("set_my_presence", {
          p_choice: _meuPerfil.presenca, p_status: event.target.value
        }).catch(() => {});
      });

      void carregarContatos();
      if (!_timerContatos) _timerContatos = setInterval(() => void carregarContatos(), POLL_CONTATOS_MS);
    }

    function fecharPainel() {
      _painel?.remove();
      _painel = null;
      if (_timerContatos) clearInterval(_timerContatos);
      _timerContatos = null;
    }

    async function abrirConversaCom(userId, titulo) {
      try {
        const threadId = await callSupabaseRpc("open_direct_thread", { p_user: userId });
        abrirJanela(threadId, titulo);
      } catch (error) {
        console.error(error);
        showToast(vpFriendlyError(error, "Falha ao abrir a conversa."), "error");
      }
    }

    async function criarGrupo() {
      const escolhidos = _contatos.filter((c) => c.__sel);
      if (escolhidos.length < 2) {
        showToast("Marque pelo menos duas pessoas com um clique antes de criar o grupo.", "error");
        return;
      }
      // Sem nome: o título cai nos nomes dos participantes (groups_list resolve).
      const nome = null;
      try {
        const threadId = await callSupabaseRpc("create_group_thread", {
          p_name: nome,
          p_user_ids: escolhidos.map((c) => c.user_id)
        });
        _contatos.forEach((c) => { c.__sel = false; });
        await carregarContatos();
        abrirJanela(threadId, nome || "Grupo");
      } catch (error) {
        console.error(error);
        showToast(vpFriendlyError(error, "Falha ao criar o grupo."), "error");
      }
    }

    // ── Janela de conversa ───────────────────────────────────────────────────
    function janelaMarkup(titulo) {
      return `
        <div class="msn-jan-head">
          <strong class="msn-jan-titulo">${escapeHtml(titulo || "Conversa")}</strong>
          <div class="msn-jan-acoes">
            <button type="button" class="msn-icon-btn" data-action="aba-conversa" title="Conversa">💬</button>
            <button type="button" class="msn-icon-btn" data-action="aba-midias" title="Mídias">🖼</button>
            <button type="button" class="msn-icon-btn" data-action="zumbido" title="Enviar zumbido">🔔</button>
            <button type="button" class="msn-icon-btn" data-action="sair" title="Sair da conversa">⎋</button>
            <button type="button" class="msn-icon-btn" data-action="fechar" title="Fechar">✕</button>
          </div>
        </div>
        <div class="msn-jan-corpo" data-pane="conversa"></div>
        <div class="msn-jan-corpo" data-pane="midias" style="display:none"></div>
        <div class="msn-digitando"></div>
        <div class="msn-jan-compositor">
          <button type="button" class="msn-icon-btn" data-action="anexar" title="Anexar">＋</button>
          <input type="file" class="msn-file" multiple hidden>
          <textarea class="msn-input" rows="2" placeholder="Escreva... (Enter envia, Shift+Enter quebra linha)"></textarea>
          <button type="button" class="primary-button" data-action="enviar">Enviar</button>
        </div>
        <div class="msn-pendentes"></div>
      `;
    }

    function abrirJanela(threadId, titulo) {
      const existente = _janelas.get(threadId);
      if (existente) { frente(existente); return; }

      const el = document.createElement("div");
      el.className = "msn-janela";
      el.dataset.thread = threadId;
      el.innerHTML = janelaMarkup(titulo);
      // Cascata pra duas janelas não nascerem exatamente uma sobre a outra.
      const n = _janelas.size;
      el.style.left = `${90 + n * 28}px`;
      el.style.top = `${90 + n * 28}px`;
      document.body.appendChild(el);

      const ctx = { el, threadId, titulo, mensagens: [], aba: "conversa", pendentes: [], ultimoId: null, focada: true };
      _janelas.set(threadId, ctx);
      frente(ctx);
      ligarJanela(ctx);
      void carregarMensagens(ctx, true);

      if (!_timerAbertas) {
        _timerAbertas = setInterval(() => void tickAbertas(), POLL_ABERTAS_MS);
      }
    }

    function frente(ctx) {
      _zIndex += 1;
      ctx.el.style.zIndex = String(_zIndex);
      _janelas.forEach((c) => { c.focada = c === ctx; });
      ctx.el.querySelector(".msn-input")?.focus();
    }

    function fecharJanela(ctx) {
      ctx.el.remove();
      _janelas.delete(ctx.threadId);
      if (!_janelas.size && _timerAbertas) {
        clearInterval(_timerAbertas);
        _timerAbertas = null;
      }
    }

    function ligarJanela(ctx) {
      const { el } = ctx;
      el.addEventListener("mousedown", () => frente(ctx), true);

      // Arrastar pela barra de título.
      const head = el.querySelector(".msn-jan-head");
      head.addEventListener("mousedown", (ev) => {
        if (ev.target.closest("button")) return;
        const r = el.getBoundingClientRect();
        const dx = ev.clientX - r.left;
        const dy = ev.clientY - r.top;
        const mover = (e) => {
          el.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, e.clientX - dx))}px`;
          el.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dy))}px`;
        };
        const soltar = () => {
          document.removeEventListener("mousemove", mover);
          document.removeEventListener("mouseup", soltar);
        };
        document.addEventListener("mousemove", mover);
        document.addEventListener("mouseup", soltar);
        ev.preventDefault();
      });

      el.addEventListener("click", (event) => {
        const acao = event.target.closest("[data-action]")?.dataset.action;
        if (acao === "fechar") { fecharJanela(ctx); return; }
        if (acao === "enviar") { void enviar(ctx); return; }
        if (acao === "anexar") { el.querySelector(".msn-file").click(); return; }
        if (acao === "zumbido") { void enviarZumbido(ctx); return; }
        if (acao === "sair") { void sairDaConversa(ctx); return; }
        if (acao === "aba-conversa" || acao === "aba-midias") {
          ctx.aba = acao === "aba-midias" ? "midias" : "conversa";
          el.querySelector('[data-pane="conversa"]').style.display = ctx.aba === "conversa" ? "block" : "none";
          el.querySelector('[data-pane="midias"]').style.display = ctx.aba === "midias" ? "block" : "none";
          if (ctx.aba === "midias") void carregarMidias(ctx);
          return;
        }
        if (acao === "excluir-msg") {
          const id = event.target.closest("[data-id]")?.dataset.id;
          if (id) void excluirMensagem(ctx, id, event.target.closest("[data-minha]")?.dataset.minha === "1");
          return;
        }
        if (acao === "tirar-anexo") {
          const i = Number(event.target.closest("[data-i]")?.dataset.i);
          if (Number.isInteger(i)) { ctx.pendentes.splice(i, 1); pintarPendentes(ctx); }
          return;
        }
        const anexo = event.target.closest("[data-path]");
        if (anexo) { void baixarAnexo(anexo.dataset.path, anexo.dataset.nome); }
      });

      const input = el.querySelector(".msn-input");
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); void enviar(ctx); }
      });
      // Avisa que está digitando, no máximo uma vez a cada 3s.
      let ultimoAviso = 0;
      input.addEventListener("input", () => {
        const agora = Date.now();
        if (agora - ultimoAviso < 3000) return;
        ultimoAviso = agora;
        void callSupabaseRpc("set_typing", { p_thread: ctx.threadId }).catch(() => {});
      });
      // Colar imagem do clipboard (print) direto na conversa.
      input.addEventListener("paste", (ev) => {
        const itens = [...(ev.clipboardData?.items || [])];
        const arquivos = itens.filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter(Boolean);
        if (!arquivos.length) return;
        ev.preventDefault();
        ctx.pendentes.push(...arquivos);
        pintarPendentes(ctx);
      });

      el.querySelector(".msn-file").addEventListener("change", (ev) => {
        const escolhidos = [...(ev.target.files || [])];
        const grandes = escolhidos.filter((f) => f.size > MAX_FILE_MB * 1048576);
        if (grandes.length) showToast(`"${grandes[0].name}" passa de ${MAX_FILE_MB} MB.`, "error");
        ctx.pendentes.push(...escolhidos.filter((f) => f.size <= MAX_FILE_MB * 1048576));
        ev.target.value = "";
        pintarPendentes(ctx);
      });

      // Arrastar arquivo pra dentro da janela.
      el.addEventListener("dragover", (ev) => { ev.preventDefault(); el.classList.add("arrastando"); });
      el.addEventListener("dragleave", () => el.classList.remove("arrastando"));
      el.addEventListener("drop", (ev) => {
        ev.preventDefault();
        el.classList.remove("arrastando");
        const arquivos = [...(ev.dataTransfer?.files || [])].filter((f) => f.size <= MAX_FILE_MB * 1048576);
        if (arquivos.length) { ctx.pendentes.push(...arquivos); pintarPendentes(ctx); }
      });
    }

    // ── Conteúdo da janela ───────────────────────────────────────────────────
    function tiquesMarkup(status) {
      if (!status) return "";
      const um = `<path d="M2 8.5l3.2 3.2L11.5 5"></path>`;
      const dois = `${um}<path d="M7.5 11.7L13.8 5"></path>`;
      const titulo = status === "read" ? "Lida" : (status === "delivered" ? "Entregue" : "Enviada");
      return `<svg class="msg-tick${status === "read" ? " lido" : ""}" viewBox="0 0 16 16"><title>${titulo}</title>${status === "sent" ? um : dois}</svg>`;
    }

    function anexosMarkup(anexos) {
      const lista = Array.isArray(anexos) ? anexos : [];
      if (!lista.length) return "";
      return `<div class="msg-anexos">` + lista.map((a) => {
        if (String(a.mime || "").startsWith("image/")) {
          return `<button type="button" class="msg-anexo-img" data-path="${escapeHtml(a.path)}" data-thumb="${escapeHtml(a.thumb || a.path)}" data-nome="${escapeHtml(a.name)}">
                    <span class="msg-anexo-loading">carregando...</span></button>`;
        }
        return `<button type="button" class="msg-anexo-file" data-path="${escapeHtml(a.path)}" data-nome="${escapeHtml(a.name)}">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path></svg>
                  <span class="msg-anexo-nome">${escapeHtml(a.name)}</span>
                  <span class="msg-anexo-size">${formatTamanho(a.size)}</span>
                </button>`;
      }).join("") + `</div>`;
    }

    function pintarConversa(ctx) {
      const pane = ctx.el.querySelector('[data-pane="conversa"]');
      const eu = getCurrentUserId();
      pane.innerHTML = ctx.mensagens.map((m) => {
        if (m.kind === "nudge") {
          return `<div class="msn-nudge-aviso">${escapeHtml(m.autor)} ${escapeHtml(m.body || "enviou um zumbido")}</div>`;
        }
        const minha = m.autor_id === eu;
        return `
          <div class="msg-bubble${minha ? " mine" : ""}" data-id="${escapeHtml(m.id)}">
            <div class="msg-bubble-head">
              <strong>${escapeHtml(m.autor || "")}</strong>
              <button type="button" class="msg-del" data-action="excluir-msg" data-id="${escapeHtml(m.id)}" data-minha="${minha ? "1" : "0"}" title="Excluir">✕</button>
            </div>
            ${m.body ? `<p>${escapeHtml(m.body)}</p>` : ""}
            ${anexosMarkup(m.anexos)}
            <div class="msg-bubble-foot"><span>${escapeHtml(formatHora(m.created_at))}</span>${minha ? tiquesMarkup(m.status) : ""}</div>
          </div>`;
      }).join("") || `<div class="msn-vazio">Nenhuma mensagem ainda. Diga oi.</div>`;
      pane.scrollTop = pane.scrollHeight;
      void hidratarImagens(pane);
    }

    async function hidratarImagens(escopo) {
      for (const alvo of [...escopo.querySelectorAll(".msg-anexo-img:not([data-pronta])")]) {
        alvo.dataset.pronta = "1";
        try {
          // Usa a miniatura quando existe: a galeria e a conversa carregam sem
          // baixar o original.
          const url = await createStorageSignedUrl(BUCKET, alvo.dataset.thumb || alvo.dataset.path);
          const img = document.createElement("img");
          img.src = url;
          img.alt = alvo.dataset.nome || "";
          alvo.innerHTML = "";
          alvo.appendChild(img);
        } catch (_) {
          alvo.innerHTML = `<span class="msg-anexo-loading">falha ao carregar</span>`;
        }
      }
    }

    function pintarPendentes(ctx) {
      const alvo = ctx.el.querySelector(".msn-pendentes");
      alvo.innerHTML = ctx.pendentes.map((f, i) => `
        <span class="msg-pendente">${escapeHtml(f.name || "imagem colada")}<button type="button" data-action="tirar-anexo" data-i="${i}">✕</button></span>
      `).join("");
    }

    async function carregarMensagens(ctx, primeira) {
      try {
        const rows = await callSupabaseRpc("thread_messages", { p_thread: ctx.threadId }) || [];
        const ultimo = rows.length ? rows[rows.length - 1] : null;
        const chegouNova = !primeira && ultimo && ultimo.id !== ctx.ultimoId;
        const nudgeNovo = chegouNova && ultimo.kind === "nudge" && ultimo.autor_id !== getCurrentUserId();

        ctx.mensagens = rows;
        ctx.ultimoId = ultimo?.id || null;
        pintarConversa(ctx);

        if (chegouNova && ultimo.autor_id !== getCurrentUserId()) {
          bip();
          if (nudgeNovo) chacoalhar(ctx);
        }
        await callSupabaseRpc("messages_mark_thread_read", { p_thread: ctx.threadId });
      } catch (error) {
        if (isMissingSchemaError(error)) _disabled = true;
        else console.debug("conversa: falha ao atualizar", error);
      }
    }

    function chacoalhar(ctx) {
      ctx.el.classList.remove("chacoalha");
      void ctx.el.offsetWidth;      // reinicia a animação
      ctx.el.classList.add("chacoalha");
      bip(440);
    }

    async function carregarMidias(ctx) {
      const pane = ctx.el.querySelector('[data-pane="midias"]');
      pane.innerHTML = `<div class="msn-vazio">Carregando...</div>`;
      try {
        const itens = await callSupabaseRpc("thread_media", { p_thread: ctx.threadId }) || [];
        const imagens = itens.filter((i) => String(i.mime || "").startsWith("image/"));
        const arquivos = itens.filter((i) => !String(i.mime || "").startsWith("image/"));
        pane.innerHTML = `
          ${imagens.length ? `<div class="msn-secao">Imagens</div><div class="msn-galeria">${
            imagens.map((a) => `<button type="button" class="msg-anexo-img" data-path="${escapeHtml(a.path)}" data-thumb="${escapeHtml(a.thumb || a.path)}" data-nome="${escapeHtml(a.nome)}"><span class="msg-anexo-loading">...</span></button>`).join("")
          }</div>` : ""}
          ${arquivos.length ? `<div class="msn-secao">Arquivos</div>${
            arquivos.map((a) => `<button type="button" class="msg-anexo-file" data-path="${escapeHtml(a.path)}" data-nome="${escapeHtml(a.nome)}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path></svg>
              <span class="msg-anexo-nome">${escapeHtml(a.nome)}</span><span class="msg-anexo-size">${formatTamanho(a.tamanho)}</span></button>`).join("")
          }` : ""}
          ${!itens.length ? `<div class="msn-vazio">Nada compartilhado nesta conversa.</div>` : ""}
        `;
        void hidratarImagens(pane);
      } catch (error) {
        pane.innerHTML = `<div class="msn-vazio">${escapeHtml(vpFriendlyError(error, "Falha ao carregar as mídias."))}</div>`;
      }
    }

    // ── Envio ────────────────────────────────────────────────────────────────
    // Miniatura gerada no cliente: a conversa e a galeria carregam rápido sem
    // baixar o original de vários MB.
    async function gerarThumb(file) {
      if (!String(file.type || "").startsWith("image/")) return null;
      try {
        const bitmap = await createImageBitmap(file);
        const escala = Math.min(1, THUMB_MAX / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * escala);
        canvas.height = Math.round(bitmap.height * escala);
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return await new Promise((r) => canvas.toBlob(r, "image/webp", 0.8));
      } catch (_) {
        return null;   // sem miniatura, a conversa usa o original
      }
    }

    async function subirAnexos(ctx, messageId) {
      for (const file of ctx.pendentes) {
        const nome = (file.name || `imagem-${Date.now()}.png`).replace(/[^\w.\- ]+/g, "_").slice(-80);
        const base = `${ctx.threadId}/${crypto.randomUUID()}`;
        await uploadToStorage(BUCKET, `${base}_${nome}`, file);

        let thumbPath = null;
        const thumb = await gerarThumb(file);
        if (thumb) {
          thumbPath = `${base}_thumb.webp`;
          await uploadToStorage(BUCKET, thumbPath, thumb);
        }
        await callSupabaseRpc("add_message_attachment", {
          p_message_id: messageId,
          p_path: `${base}_${nome}`,
          p_file_name: file.name || nome,
          p_mime: file.type || "",
          p_size: file.size || 0,
          p_thumb: thumbPath
        });
      }
      ctx.pendentes = [];
      pintarPendentes(ctx);
    }

    async function enviar(ctx) {
      const input = ctx.el.querySelector(".msn-input");
      const texto = input.value.trim();
      if (!texto && !ctx.pendentes.length) return;
      input.value = "";
      try {
        const id = await callSupabaseRpc("reply_to_thread", {
          p_thread: ctx.threadId,
          p_body: texto || "(anexo)"
        });
        if (ctx.pendentes.length) await subirAnexos(ctx, id);
        await carregarMensagens(ctx);
      } catch (error) {
        console.error(error);
        input.value = texto;
        showToast(vpFriendlyError(error, "Falha ao enviar."), "error");
      }
    }

    async function enviarZumbido(ctx) {
      try {
        await callSupabaseRpc("send_nudge", { p_thread: ctx.threadId });
        chacoalhar(ctx);
        await carregarMensagens(ctx);
      } catch (error) {
        showToast(vpFriendlyError(error, "Falha ao enviar o zumbido."), "error");
      }
    }

    async function excluirMensagem(ctx, id, minha) {
      if (!minha && appConfirm) {
        const ok = await appConfirm("Excluir esta mensagem? Ela some para todos os participantes.");
        if (!ok) return;
      }
      try {
        await callSupabaseRpc("delete_message", { p_message_id: id });
        await carregarMensagens(ctx);
      } catch (error) {
        showToast(vpFriendlyError(error, "Falha ao excluir."), "error");
      }
    }

    async function sairDaConversa(ctx) {
      if (appConfirm) {
        const ok = await appConfirm("Sair desta conversa? Ela some da sua lista.");
        if (!ok) return;
      }
      try {
        await callSupabaseRpc("leave_thread", { p_thread: ctx.threadId });
        fecharJanela(ctx);
        await carregarContatos();
      } catch (error) {
        showToast(vpFriendlyError(error, "Falha ao sair da conversa."), "error");
      }
    }

    async function baixarAnexo(path, nome) {
      try {
        const url = await createStorageSignedUrl(BUCKET, path);
        const a = document.createElement("a");
        a.href = `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(nome || "arquivo")}`;
        a.target = "_blank";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (error) {
        showToast(vpFriendlyError(error, "Falha ao abrir o anexo."), "error");
      }
    }

    // ── Polling curto das janelas abertas ────────────────────────────────────
    async function tickAbertas() {
      if (document.visibilityState === "hidden") return;
      for (const ctx of _janelas.values()) {
        await carregarMensagens(ctx);
        if (ctx.focada) {
          try {
            const quem = await callSupabaseRpc("thread_typing", { p_thread: ctx.threadId }) || [];
            const nomes = quem.map((q) => q.nome).filter(Boolean);
            ctx.el.querySelector(".msn-digitando").textContent =
              nomes.length ? `${nomes.join(", ")} está digitando...` : "";
          } catch (_) { /* silencioso */ }
        }
      }
    }

    function parar() {
      _janelas.forEach((c) => c.el.remove());
      _janelas.clear();
      fecharPainel();
      if (_timerAbertas) clearInterval(_timerAbertas);
      _timerAbertas = null;
      _contatos = [];
      _grupos = [];
      _unread = 0;
      _disabled = false;
    }

    async function markDelivered() {
      if (_disabled || !isSupabaseConfigured()) return;
      try { await callSupabaseRpc("mark_messages_delivered"); }
      catch (error) { if (isMissingSchemaError(error)) _disabled = true; }
    }

    return {
      toggleContatos: abrirPainel,
      setMessagesUnread: (n) => { setUnread(n); if (_painel) void carregarContatos(); },
      onMessagesCountChange: (fn) => { _onCountChange = fn; },
      markMessagesDelivered: markDelivered,
      stopMessages: parar
    };
  }

  window.VECTON_MESSAGES = { createMessagesModule };
})(window);
