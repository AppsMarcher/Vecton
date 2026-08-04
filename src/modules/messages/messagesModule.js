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
// Mensagens, anexos e digitação chegam por Supabase Realtime. Um polling lento
// permanece apenas como contingência quando o WebSocket estiver desconectado.
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
      appConfirm,
      resolverFoto,
      createRealtimeClient,
      getSupabaseConfig,
      getAccessToken

    } = deps;

    const BUCKET = "message-attachments";
    const MAX_FILE_MB = 15;
    const POLL_FALLBACK_MS = 30000;
    const POLL_CONTATOS_MS = 30000;
    const THUMB_MAX = 320;
    const LADOS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
    const MIN_LARGURA = 320;
    const MIN_ALTURA = 260;
    const MIN_PAINEL_LARGURA = 240;
    const MIN_PAINEL_ALTURA = 360;
    const AJUSTES_PREFIX = "vecton-messenger-settings-v1";
    const AJUSTES_PADRAO = Object.freeze({
      som: "msn",
      corLinha: "#4f7cff",
      corTexto: "#e8edf8",
      corFundo: "#000000"
    });
    const SONS_MENSAGEM = Object.freeze({
      msn: "assets/msn-message.mp3?v=20260804b",
      icq: "assets/icq.mp3?v=20260804a"
    });

    let _painel = null;
    let _configJanela = null;
    let _contatos = [];
    let _grupos = [];
    let _busca = "";
    let _unread = 0;
    let _disabled = false;
    let _onCountChange = null;
    let _timerAbertas = null;
    let _timerContatos = null;
    let _zIndex = 9500;
    let _realtimeClient = null;
    let _realtimeChannel = null;
    let _realtimeOnline = false;
    let _iniciandoRealtime = null;
    let _audioContext = null;
    let _ajustes = { ...AJUSTES_PADRAO };
    const _secoesRecolhidas = { online: false, offline: false };
    const _audioBuffers = new Map();
    const _audiosCarregando = new Map();
    const _eventosMensagemVistos = new Set();

    const EVENTOS_LIBERAR_AUDIO = ["pointerdown", "keydown", "touchstart"];
    const SOM_ATENCAO_URL = "assets/msn-wizz.mp3?v=20260804a";
    const EMOJIS = [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "🙂",
      "😉", "😍", "🥰", "😘", "😎", "🤓", "🤩", "🥳", "😏", "😴",
      "😢", "😭", "😤", "😡", "🤯", "😱", "🤔", "🤭", "🫡", "🙏",
      "👍", "👎", "👏", "🙌", "🤝", "💪", "👌", "✌️", "🤞", "👀",
      "❤️", "💙", "💚", "💛", "💜", "🧡", "💔", "🔥", "✨", "🎉",
      "✅", "❌", "⚠️", "💡", "📌", "🚀", "🏆", "☕", "🍻", "🌟"
    ];

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

    function emojisMarkup() {
      return EMOJIS.map((emoji) => `
        <button type="button" class="msn-emoji-opcao" data-action="inserir-emoji" data-emoji="${emoji}" aria-label="Inserir ${emoji}">${emoji}</button>
      `).join("");
    }

    function alcasRedimensionamentoMarkup() {
      return LADOS.map((lado) => `<div class="msn-resize ${lado}" data-lado="${lado}"></div>`).join("");
    }

    function chaveAjustes() {
      return `${AJUSTES_PREFIX}:${getCurrentUserId?.() || "anonimo"}`;
    }

    function corValida(value, fallback) {
      return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
    }

    function carregarAjustesLocais() {
      try {
        const salvo = JSON.parse(localStorage.getItem(chaveAjustes()) || "null") || {};
        _ajustes = {
          som: Object.hasOwn(SONS_MENSAGEM, salvo.som) ? salvo.som : AJUSTES_PADRAO.som,
          corLinha: corValida(salvo.corLinha, AJUSTES_PADRAO.corLinha),
          corTexto: corValida(salvo.corTexto, AJUSTES_PADRAO.corTexto),
          corFundo: corValida(salvo.corFundo, AJUSTES_PADRAO.corFundo)
        };
      } catch (_) {
        _ajustes = { ...AJUSTES_PADRAO };
      }
    }

    function salvarAjustesLocais() {
      try { localStorage.setItem(chaveAjustes(), JSON.stringify(_ajustes)); } catch (_) { /* best effort */ }
    }

    function aplicarTemaEm(elemento, ajustes = _ajustes) {
      if (!elemento) return;
      elemento.style.setProperty("--blue", ajustes.corLinha);
      elemento.style.setProperty("--line", ajustes.corLinha);
      elemento.style.setProperty("--text", ajustes.corTexto);
      elemento.style.setProperty("--text-soft", ajustes.corTexto);
      elemento.style.setProperty("--text-faint", ajustes.corTexto);
      elemento.style.setProperty("--bg-soft", ajustes.corFundo);
      elemento.style.setProperty("--panel", ajustes.corFundo);
      elemento.style.setProperty("--panel-strong", ajustes.corFundo);
      elemento.style.backgroundColor = ajustes.corFundo;
      elemento.style.color = ajustes.corTexto;
    }

    function aplicarTemaMessenger(ajustes = _ajustes) {
      aplicarTemaEm(_painel, ajustes);
      aplicarTemaEm(_configJanela, ajustes);
      aplicarTemaEm(_menu, ajustes);
      _janelas.forEach((ctx) => aplicarTemaEm(ctx.el, ajustes));
    }

    function obterAudioContext() {
      if (_audioContext && _audioContext.state !== "closed") return _audioContext;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      _audioContext = new Ctx();
      return _audioContext;
    }

    function carregarSom(url, nome) {
      if (_audioBuffers.has(url)) return Promise.resolve(_audioBuffers.get(url));
      if (_audiosCarregando.has(url)) return _audiosCarregando.get(url);
      const ctx = obterAudioContext();
      if (!ctx) return Promise.resolve(null);
      const carregamento = fetch(url, { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then((dados) => ctx.decodeAudioData(dados))
        .then((buffer) => {
          _audioBuffers.set(url, buffer);
          return buffer;
        })
        .catch((error) => {
          console.debug(`Messenger: falha ao carregar o som de ${nome}`, error);
          return null;
        })
        .finally(() => { _audiosCarregando.delete(url); });
      _audiosCarregando.set(url, carregamento);
      return carregamento;
    }

    const carregarSomMensagem = () => carregarSom(SONS_MENSAGEM[_ajustes.som], `mensagem ${_ajustes.som}`);
    const carregarSomAtencao = () => carregarSom(SOM_ATENCAO_URL, "chamar atenção");

    function removerDesbloqueioAudio() {
      EVENTOS_LIBERAR_AUDIO.forEach((evento) => document.removeEventListener(evento, liberarAudio));
    }

    function liberarAudio() {
      try {
        const ctx = obterAudioContext();
        if (!ctx) return;
        const pronto = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
        void pronto.then(() => {
          void carregarSomMensagem();
          void carregarSomAtencao();
          if (ctx.state === "running") removerDesbloqueioAudio();
        }).catch(() => {});
      } catch (_) { /* o navegador pode bloquear áudio antes de uma interação */ }
    }

    function prepararAudio() {
      EVENTOS_LIBERAR_AUDIO.forEach((evento) => document.addEventListener(evento, liberarAudio, { passive: true }));
      void carregarSomMensagem();
      void carregarSomAtencao();
    }

    async function tocarSom(carregar) {
      try {
        const ctx = obterAudioContext();
        if (!ctx) return;
        if (ctx.state === "suspended") await ctx.resume();
        const buffer = await carregar();
        if (!buffer || ctx.state !== "running") return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => source.disconnect();
        source.start();
      } catch (_) { /* som é enfeite: nunca pode quebrar o envio */ }
    }

    const tocarSomMensagem = () => tocarSom(carregarSomMensagem);
    const tocarSomAtencao = () => tocarSom(carregarSomAtencao);

    function setUnread(n) {
      _unread = Number(n) || 0;
      if (_unread <= 0) pararAlertaCartinha();
      if (_onCountChange) _onCountChange(_unread);
    }

    async function reconciliarNaoLidas() {
      if (_disabled || !isSupabaseConfigured()) return;
      try {
        const total = await callSupabaseRpc("messages_unread_count");
        setUnread(total);
      } catch (error) {
        // A migration nova pode chegar alguns instantes depois do front-end.
        // Nesse intervalo, a contagem periódica antiga continua funcionando.
        if (!isMissingSchemaError(error)) console.debug("messenger: falha ao reconciliar não lidas", error);
      }
    }

    function piscarCartinha() {
      document.querySelector("#messages-trigger")?.classList.add("msn-alerta");
    }

    function pararAlertaCartinha() {
      document.querySelector("#messages-trigger")?.classList.remove("msn-alerta");
    }

    // ── Painel de contatos ───────────────────────────────────────────────────
    function contatosFiltrados() {
      const q = _busca.trim().toLowerCase();
      if (!q) return _contatos;
      return _contatos.filter((c) => c.nome.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    }

    // Foto do perfil do Vecton na lista, com a mesma resolução do avatar do
    // cabeçalho: 'upload' guarda data URL, 'avatar' guarda a chave de um dos
    // avatares prontos. Sem foto, cai na inicial do nome.
    function avatarMarkup(c) {
      const url = resolverFoto ? resolverFoto(c.foto_kind, c.foto_value) : null;
      const presenca = escapeHtml(c.presenca || "offline");
      if (url) {
        return `<span class="msn-avatar ${presenca} com-foto" style="background-image:url(&quot;${escapeHtml(url)}&quot;)"></span>`;
      }
      return `<span class="msn-avatar ${presenca}">${escapeHtml((c.nome || "?").slice(0, 1).toUpperCase())}</span>`;
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

      const lista = contatosFiltrados();
      const online = lista.filter((c) => c.presenca !== "offline");
      const offline = lista.filter((c) => c.presenca === "offline");

      const bloco = (pessoas) => pessoas.map((c) => `
        <div class="msn-contato${c.__sel ? " selecionado" : ""}${c.presenca === "offline" ? " off" : ""}" role="button" tabindex="0" data-user="${escapeHtml(c.user_id)}" data-titulo="${escapeHtml(c.nome)}" title="Duplo clique para conversar">
          ${avatarMarkup(c)}
          <span class="msn-contato-copy">
            <strong>${escapeHtml(c.nome)}</strong>
            <span>${escapeHtml(c.recado || c.email)}</span>
          </span>
          ${c.nao_lidas > 0 ? `<span class="msn-badge">${c.nao_lidas}</span>` : ""}
        </div>`).join("");

      const secaoContatos = (status, titulo, pessoas, vazio = "") => {
        const recolhida = _secoesRecolhidas[status];
        return `
          <button type="button" class="msn-secao msn-secao-toggle" data-action="alternar-secao" data-status="${status}" aria-expanded="${recolhida ? "false" : "true"}">
            ${titulo} (${pessoas.length})
          </button>
          <div class="msn-secao-conteudo" data-status-conteudo="${status}"${recolhida ? " hidden" : ""}>
            ${pessoas.length ? bloco(pessoas) : vazio}
          </div>`;
      };

      return `
        <div class="msn-head">
          <div class="msn-head-menu">
            <button type="button" class="msn-icon-btn" data-action="abrir-ajustes" title="Opções do Vecton Messenger" aria-label="Abrir opções do Vecton Messenger">☰</button>
          </div>
          <img class="msn-head-logo" src="assets/vecton-messenger.png?v=20260804c" alt="Vecton Messenger">
          <div class="msn-head-acoes">
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
          ${_grupos.length ? `<div class="msn-secao">Grupos (${_grupos.length})</div>${grupos}` : ""}
          ${secaoContatos("online", "Online", online, `<div class="msn-vazio">Ninguém online agora.</div>`)}
          ${secaoContatos("offline", "Offline", offline)}
          ${!lista.length ? `<div class="msn-vazio">Nenhum contato encontrado.</div>` : ""}
        </div>
        <div class="msn-rodape">
          <button type="button" class="msn-rodape-btn" data-action="novo-grupo">Conversa em grupo</button>
        </div>
      `;
    }

    function pintarPainel() {
      if (!_painel) return;
      const markup = painelMarkup() + alcasRedimensionamentoMarkup();
      const foco = _painel.contains(document.activeElement) ? document.activeElement?.id : "";
      const campoFocado = foco ? _painel.querySelector(`#${foco}`) : null;
      const selecaoInicio = campoFocado?.selectionStart;
      const selecaoFim = campoFocado?.selectionEnd;
      const scrollTop = _painel.querySelector(".msn-lista")?.scrollTop || 0;

      if (_painel.__markupAtual !== markup) {
        _painel.innerHTML = markup;
        _painel.__markupAtual = markup;
        const lista = _painel.querySelector(".msn-lista");
        if (lista) lista.scrollTop = scrollTop;
      }

      const sel = _painel.querySelector("#msn-presenca");
      if (sel && document.activeElement !== sel && _meuPerfil.presenca) sel.value = _meuPerfil.presenca;
      const rec = _painel.querySelector("#msn-recado");
      if (rec && document.activeElement !== rec) rec.value = _meuPerfil.recado || "";
      // Uma atualização real também não pode roubar o foco nem a seleção.
      if (foco) {
        const el = _painel.querySelector(`#${foco}`);
        el?.focus();
        if (selecaoInicio != null && selecaoFim != null) el?.setSelectionRange(selecaoInicio, selecaoFim);
      }
    }

    const _meuPerfil = { presenca: "disponivel", recado: "", nickname: "" };

    async function carregarMeuPerfil() {
      if (_disabled || !isSupabaseConfigured()) return;
      try {
        const rows = await callSupabaseRpc("messenger_my_state");
        const perfil = Array.isArray(rows) ? rows[0] : rows;
        if (!perfil) return;
        _meuPerfil.presenca = perfil.presenca || "disponivel";
        _meuPerfil.recado = perfil.recado || "";
        _meuPerfil.nickname = perfil.nickname || "";
        pintarPainel();
      } catch (error) {
        if (!isMissingSchemaError(error)) console.debug("messenger: falha ao carregar presença", error);
      }
    }

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
      pararAlertaCartinha();
      if (_painel) { fecharPainel(); return; }
      _painel = document.createElement("div");
      _painel.className = "msn-painel";
      const markupInicial = painelMarkup() + alcasRedimensionamentoMarkup();
      _painel.innerHTML = markupInicial;
      _painel.__markupAtual = markupInicial;
      document.body.appendChild(_painel);
      aplicarTemaEm(_painel);
      ligarPainelMovel(_painel);

      _painel.addEventListener("click", (event) => {
        const acao = event.target.closest("[data-action]")?.dataset.action;
        if (acao === "fechar-painel") { fecharPainel(); return; }
        if (acao === "abrir-ajustes") { abrirConfiguracoes(); return; }
        if (acao === "novo-grupo") { void criarGrupo(); return; }
        if (acao === "alternar-secao") {
          const status = event.target.closest("[data-status]")?.dataset.status;
          if (status === "online" || status === "offline") {
            _secoesRecolhidas[status] = !_secoesRecolhidas[status];
            pintarPainel();
            _painel?.querySelector(`[data-action="alternar-secao"][data-status="${status}"]`)?.focus();
          }
          return;
        }
        const linha = event.target.closest("[data-user], [data-thread]");
        if (linha) abrirMenuContato(linha, event.clientX, event.clientY);
      });
      _painel.addEventListener("dblclick", (event) => {
        // O duplo clique dispara um clique antes, que abriu o menu — fecha.
        fecharMenu();
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

      void Promise.all([carregarMeuPerfil(), carregarContatos(), reconciliarNaoLidas()]);
      if (!_timerContatos) _timerContatos = setInterval(() => void carregarContatos(), POLL_CONTATOS_MS);
    }

    function fecharPainel() {
      _painel?.remove();
      _painel = null;
      fecharConfiguracoes(true);
      if (_timerContatos) clearInterval(_timerContatos);
      _timerContatos = null;
    }

    function ajustesDoFormulario(form) {
      return {
        som: form.querySelector('[name="msn-config-som"]:checked')?.value || AJUSTES_PADRAO.som,
        corLinha: corValida(form.querySelector('[name="msn-config-linha"]')?.value, AJUSTES_PADRAO.corLinha),
        corTexto: corValida(form.querySelector('[name="msn-config-texto"]')?.value, AJUSTES_PADRAO.corTexto),
        corFundo: corValida(form.querySelector('[name="msn-config-fundo"]')?.value, AJUSTES_PADRAO.corFundo)
      };
    }

    function preencherFormularioAjustes(form, ajustes, nickname) {
      const som = form.querySelector(`[name="msn-config-som"][value="${ajustes.som}"]`);
      if (som) som.checked = true;
      const linha = form.querySelector('[name="msn-config-linha"]');
      const texto = form.querySelector('[name="msn-config-texto"]');
      const fundo = form.querySelector('[name="msn-config-fundo"]');
      const apelido = form.querySelector('[name="msn-config-nickname"]');
      if (linha) linha.value = ajustes.corLinha;
      if (texto) texto.value = ajustes.corTexto;
      if (fundo) fundo.value = ajustes.corFundo;
      if (apelido) apelido.value = nickname || "";
    }

    function fecharConfiguracoes(reverter = true) {
      if (!_configJanela) return;
      const originais = _configJanela.__ajustesOriginais;
      _configJanela.remove();
      _configJanela = null;
      if (reverter && originais) aplicarTemaMessenger(originais);
    }

    function abrirConfiguracoes() {
      if (_configJanela) {
        _zIndex += 1;
        _configJanela.style.zIndex = String(_zIndex);
        _configJanela.querySelector('[name="msn-config-nickname"]')?.focus();
        return;
      }

      const el = document.createElement("div");
      el.className = "msn-janela msn-config-janela";
      el.__ajustesOriginais = { ..._ajustes };
      el.innerHTML = `
        <div class="msn-jan-head">
          <div class="msn-jan-acoes"><button type="button" class="msn-icon-btn" data-config-action="fechar" title="Fechar">✕</button></div>
        </div>
        <form class="msn-config-form">
          <div class="msn-config-intro"><strong>Personalize seu Messenger</strong><span>Som, identidade e aparência ficam sob seu controle.</span></div>
          <label class="msn-config-field"><span>Nickname</span><input type="text" name="msn-config-nickname" maxlength="40" placeholder="Como você aparecerá na lista"><small>Substitui seu nome somente dentro do Messenger.</small></label>
          <fieldset class="msn-config-fieldset">
            <legend>Toque de nova mensagem</legend>
            <label class="msn-config-sound"><input type="radio" name="msn-config-som" value="msn"><span><b>MSN</b><small>Toque clássico do Messenger</small></span><button type="button" data-config-preview="msn" title="Ouvir MSN">▶</button></label>
            <label class="msn-config-sound"><input type="radio" name="msn-config-som" value="icq"><span><b>ICQ</b><small>Toque clássico do ICQ</small></span><button type="button" data-config-preview="icq" title="Ouvir ICQ">▶</button></label>
          </fieldset>
          <fieldset class="msn-config-fieldset msn-config-colors">
            <legend>Cores do aplicativo</legend>
            <label><span>Linha</span><input type="color" name="msn-config-linha"></label>
            <label><span>Letras</span><input type="color" name="msn-config-texto"></label>
            <label><span>Fundo</span><input type="color" name="msn-config-fundo"></label>
          </fieldset>
          <div class="msn-config-actions"><button type="button" data-config-action="padrao">Restaurar padrão</button><button type="submit" class="primary-button">Salvar ajustes</button></div>
        </form>
        ${alcasRedimensionamentoMarkup()}`;
      _configJanela = el;
      preencherFormularioAjustes(el.querySelector("form"), _ajustes, _meuPerfil.nickname);
      document.body.appendChild(el);
      aplicarTemaEm(el);
      ligarRedimensionamento(el);

      const largura = el.getBoundingClientRect().width || 560;
      const painelRect = _painel?.getBoundingClientRect();
      const limiteDireito = painelRect ? painelRect.left - 12 : window.innerWidth - 20;
      el.style.left = `${Math.max(12, limiteDireito - largura)}px`;
      el.style.top = `${Math.max(12, painelRect?.top ?? 60)}px`;
      _zIndex += 1;
      el.style.zIndex = String(_zIndex);

      const head = el.querySelector(".msn-jan-head");
      head.addEventListener("mousedown", (event) => {
        if (event.target.closest("button")) return;
        const rect = el.getBoundingClientRect();
        const dx = event.clientX - rect.left;
        const dy = event.clientY - rect.top;
        const mover = (moveEvent) => {
          el.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, moveEvent.clientX - dx))}px`;
          el.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, moveEvent.clientY - dy))}px`;
        };
        const soltar = () => {
          document.removeEventListener("mousemove", mover);
          document.removeEventListener("mouseup", soltar);
        };
        document.addEventListener("mousemove", mover);
        document.addEventListener("mouseup", soltar);
        event.preventDefault();
      });

      const form = el.querySelector("form");
      const atualizarPreview = () => aplicarTemaMessenger(ajustesDoFormulario(form));
      form.addEventListener("input", (event) => {
        if (event.target.matches('input[type="color"]')) atualizarPreview();
      });
      form.addEventListener("change", (event) => {
        if (event.target.name === "msn-config-som") {
          const som = event.target.value;
          void tocarSom(() => carregarSom(SONS_MENSAGEM[som], `prévia ${som}`));
        }
      });
      el.addEventListener("click", (event) => {
        const action = event.target.closest("[data-config-action]")?.dataset.configAction;
        if (action === "fechar") { fecharConfiguracoes(true); return; }
        if (action === "padrao") {
          preencherFormularioAjustes(form, AJUSTES_PADRAO, "");
          aplicarTemaMessenger(AJUSTES_PADRAO);
          return;
        }
        const preview = event.target.closest("[data-config-preview]")?.dataset.configPreview;
        if (preview) void tocarSom(() => carregarSom(SONS_MENSAGEM[preview], `prévia ${preview}`));
      });
      el.addEventListener("keydown", (event) => { if (event.key === "Escape") fecharConfiguracoes(true); });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector('[type="submit"]');
        const nickname = form.querySelector('[name="msn-config-nickname"]').value.trim();
        submit.disabled = true;
        try {
          await callSupabaseRpc("set_messenger_nickname", { p_nickname: nickname || null });
          _meuPerfil.nickname = nickname;
          _ajustes = ajustesDoFormulario(form);
          salvarAjustesLocais();
          aplicarTemaMessenger();
          await carregarContatos();
          showToast("Ajustes do Messenger salvos.", "success");
          fecharConfiguracoes(false);
        } catch (error) {
          showToast(vpFriendlyError(error, "Não foi possível salvar os ajustes."), "error");
        } finally {
          submit.disabled = false;
        }
      });

      el.querySelector('[name="msn-config-nickname"]')?.focus();
    }

    function normalizarPosicaoPainel(el) {
      if (el.style.transform === "none") return;
      const r = el.getBoundingClientRect();
      el.style.left = `${r.left}px`;
      el.style.top = `${r.top}px`;
      el.style.right = "auto";
      el.style.transform = "none";
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
    }

    function ligarPainelMovel(el) {
      ligarRedimensionamento(el, MIN_PAINEL_LARGURA, MIN_PAINEL_ALTURA, () => normalizarPosicaoPainel(el));
      el.addEventListener("mousedown", (ev) => {
        const head = ev.target.closest(".msn-head");
        if (!head || ev.target.closest("button") || ev.target.closest(".msn-resize")) return;
        normalizarPosicaoPainel(el);
        const r = el.getBoundingClientRect();
        const dx = ev.clientX - r.left;
        const dy = ev.clientY - r.top;
        const mover = (e) => {
          const maxLeft = Math.max(0, window.innerWidth - r.width);
          const maxTop = Math.max(0, window.innerHeight - r.height);
          el.style.left = `${Math.max(0, Math.min(maxLeft, e.clientX - dx))}px`;
          el.style.top = `${Math.max(0, Math.min(maxTop, e.clientY - dy))}px`;
        };
        const soltar = () => {
          document.removeEventListener("mousemove", mover);
          document.removeEventListener("mouseup", soltar);
        };
        document.addEventListener("mousemove", mover);
        document.addEventListener("mouseup", soltar);
        ev.preventDefault();
      });
    }

    // ── Menu do contato ──────────────────────────────────────────────────────
    // O clique simples abre este menu em vez de marcar direto: marcar repintava
    // o painel e destruía o elemento ENTRE os dois cliques, fazendo o navegador
    // disparar o dblclick no painel (ancestral comum, sem data-user) — o duplo
    // clique nunca abria a conversa. Aqui nada é repintado no clique.
    let _menu = null;

    function fecharMenu() {
      _menu?.remove();
      _menu = null;
      document.removeEventListener("mousedown", aoClicarFora, true);
      document.removeEventListener("keydown", aoTeclarNoMenu);
    }

    function aoClicarFora(event) {
      if (_menu && !_menu.contains(event.target)) fecharMenu();
    }

    function aoTeclarNoMenu(event) {
      if (event.key === "Escape") fecharMenu();
    }

    function abrirMenuContato(linha, x, y) {
      fecharMenu();
      const ehGrupo = Boolean(linha.dataset.thread);
      const titulo = linha.dataset.titulo || "";
      const contato = ehGrupo ? null : _contatos.find((c) => c.user_id === linha.dataset.user);
      const marcado = Boolean(contato?.__sel);

      _menu = document.createElement("div");
      _menu.className = "msn-menu";
      _menu.innerHTML = `
        <div class="msn-menu-titulo">${escapeHtml(titulo)}</div>
        <button type="button" data-item="abrir">Iniciar bate-papo</button>
        ${ehGrupo
          ? `<button type="button" data-item="sair-grupo">Sair do grupo</button>`
          : `<button type="button" data-item="marcar">${marcado ? "Desmarcar da seleção" : "Marcar para grupo"}</button>`}
      `;
      document.body.appendChild(_menu);
      aplicarTemaEm(_menu);

      // Posiciona no cursor, sem deixar vazar pra fora da tela.
      const r = _menu.getBoundingClientRect();
      _menu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
      _menu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;

      _menu.addEventListener("click", (event) => {
        const item = event.target.closest("[data-item]")?.dataset.item;
        if (!item) return;
        fecharMenu();
        if (item === "abrir") {
          if (ehGrupo) abrirJanela(linha.dataset.thread, titulo);
          else void abrirConversaCom(linha.dataset.user, titulo);
          return;
        }
        if (item === "marcar" && contato) {
          contato.__sel = !contato.__sel;
          // Alterna a classe no próprio elemento: repintar aqui traria de volta
          // o bug que quebrava o duplo clique.
          linha.classList.toggle("selecionado", contato.__sel);
          return;
        }
        if (item === "sair-grupo") {
          const ctx = _janelas.get(linha.dataset.thread)
            || { threadId: linha.dataset.thread, el: document.createElement("div") };
          void sairDaConversa(ctx);
        }
      });

      setTimeout(() => {
        document.addEventListener("mousedown", aoClicarFora, true);
        document.addEventListener("keydown", aoTeclarNoMenu);
      }, 0);
    }

    async function abrirConversaCom(userId, titulo) {
      try {
        const threadId = await callSupabaseRpc("open_direct_thread", { p_user: userId });
        abrirJanela(threadId, titulo, { userId });
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
    function janelaMarkup(titulo, contato = null) {
      return `
        <div class="msn-jan-head">
          <div class="msn-jan-identidade">
            ${contato ? avatarMarkup(contato) : ""}
            <strong class="msn-jan-titulo" title="${escapeHtml(titulo || "Conversa")}">${escapeHtml(titulo || "Conversa")}</strong>
          </div>
          <div class="msn-jan-acoes">
            <button type="button" class="msn-icon-btn" data-action="aba-conversa" title="Conversa">💬</button>
            <button type="button" class="msn-icon-btn" data-action="aba-midias" title="Mídias">📎</button>
            <button type="button" class="msn-icon-btn" data-action="zumbido" title="Chamar atenção">⚡</button>
            <button type="button" class="msn-icon-btn" data-action="limpar-conversa" title="Limpar conversa">⎋</button>
            <button type="button" class="msn-icon-btn" data-action="fechar" title="Fechar">✕</button>
          </div>
        </div>
        <div class="msn-jan-corpo" data-pane="conversa"></div>
        <div class="msn-jan-corpo" data-pane="midias" style="display:none"></div>
        <div class="msn-digitando"></div>
        <div class="msn-jan-compositor">
          <button type="button" class="msn-icon-btn" data-action="anexar" title="Anexar">＋</button>
          <input type="file" class="msn-file" multiple hidden>
          <div class="msn-input-wrap">
            <textarea class="msn-input" rows="2" placeholder="Escreva... (Enter envia, Shift+Enter quebra linha)"></textarea>
            <button type="button" class="msn-emoji-trigger" data-action="emoji-menu" title="Emojis" aria-label="Abrir seletor de emojis" aria-expanded="false">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><circle cx="9" cy="10" r="1" class="msn-emoji-olho"></circle><circle cx="15" cy="10" r="1" class="msn-emoji-olho"></circle><path d="M8.5 14c.9 1.4 2 2 3.5 2s2.6-.6 3.5-2"></path></svg>
            </button>
            <div class="msn-emoji-menu" role="dialog" aria-label="Emojis" hidden>${emojisMarkup()}</div>
          </div>
          <button type="button" class="primary-button" data-action="enviar">Enviar</button>
        </div>
        <div class="msn-pendentes"></div>
      `;
    }

    function abrirJanela(threadId, titulo, opcoes = {}) {
      const existente = _janelas.get(threadId);
      if (existente) { frente(existente); return existente; }

      const el = document.createElement("div");
      el.className = "msn-janela";
      el.dataset.thread = threadId;
      const contato = _contatos.find((item) =>
        (opcoes.userId && String(item.user_id) === String(opcoes.userId))
        || (item.thread_id && String(item.thread_id) === String(threadId))
      ) || null;
      const grupo = _grupos.find((item) => String(item.thread_id) === String(threadId)) || null;
      const tituloExibido = grupo
        ? `Grupo: ${grupo.titulo || titulo || "Participantes"}`
        : titulo;
      el.innerHTML = janelaMarkup(tituloExibido, contato) + alcasRedimensionamentoMarkup();
      document.body.appendChild(el);
      aplicarTemaEm(el);

      // Nasce encostada à ESQUERDA do painel de contatos, como no MSN — não no
      // meio da tela. Cascata só pra segunda janela em diante não cobrir a
      // primeira.
      const larguraJanela = el.getBoundingClientRect().width || 560;
      const painelRect = _painel?.getBoundingClientRect();
      const direitaDoEspaco = painelRect ? painelRect.left - 12 : window.innerWidth - 20;
      const n = _janelas.size;
      el.style.left = `${Math.max(12, direitaDoEspaco - larguraJanela - n * 26)}px`;
      el.style.top = `${Math.max(12, (painelRect?.top ?? 60) + n * 26)}px`;

      const ctx = { el, threadId, titulo: tituloExibido, mensagens: [], mensagensOcultas: new Set(), aba: "conversa", pendentes: [], ultimoId: null, focada: true };
      _janelas.set(threadId, ctx);
      frente(ctx);
      ligarJanela(ctx);
      if (opcoes.carregar !== false) void carregarMensagens(ctx, true);

      if (!_timerAbertas) {
        _timerAbertas = setInterval(() => {
          if (!_realtimeOnline) void tickAbertas();
        }, POLL_FALLBACK_MS);
      }
      return ctx;
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

    // Redimensionar por QUALQUER borda ou canto. O `resize: both` do CSS só
    // oferece a alcinha do canto inferior direito, que é o que existia antes.
    function ligarRedimensionamento(el, minLargura = MIN_LARGURA, minAltura = MIN_ALTURA, preparar = null) {
      el.addEventListener("mousedown", (ev) => {
        const alca = ev.target.closest(".msn-resize");
        if (!alca) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (preparar) preparar();
        const lado = alca.dataset.lado;
        const r = el.getBoundingClientRect();
        const x0 = ev.clientX;
        const y0 = ev.clientY;

        const mover = (e) => {
          const dx = e.clientX - x0;
          const dy = e.clientY - y0;
          let { left, top, width, height } = { left: r.left, top: r.top, width: r.width, height: r.height };
          if (lado.includes("e")) width = r.width + dx;
          if (lado.includes("s")) height = r.height + dy;
          if (lado.includes("w")) { width = r.width - dx; left = r.left + dx; }
          if (lado.includes("n")) { height = r.height - dy; top = r.top + dy; }
          // Trava no mínimo sem deixar a janela "andar" quando puxada pela
          // borda esquerda/superior além do limite.
          if (width < minLargura) { if (lado.includes("w")) left = r.right - minLargura; width = minLargura; }
          if (height < minAltura) { if (lado.includes("n")) top = r.bottom - minAltura; height = minAltura; }
          el.style.left = `${Math.max(0, left)}px`;
          el.style.top = `${Math.max(0, top)}px`;
          el.style.width = `${width}px`;
          el.style.height = `${height}px`;
        };
        const soltar = () => {
          document.removeEventListener("mousemove", mover);
          document.removeEventListener("mouseup", soltar);
        };
        document.addEventListener("mousemove", mover);
        document.addEventListener("mouseup", soltar);
      });
    }

    function ligarJanela(ctx) {
      const { el } = ctx;
      el.addEventListener("mousedown", () => frente(ctx), true);
      ligarRedimensionamento(el);

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
        const menuEmoji = el.querySelector(".msn-emoji-menu");
        const botaoEmoji = el.querySelector(".msn-emoji-trigger");
        if (acao === "emoji-menu") {
          const abrir = menuEmoji.hidden;
          menuEmoji.hidden = !abrir;
          botaoEmoji.setAttribute("aria-expanded", String(abrir));
          if (!abrir) el.querySelector(".msn-input")?.focus();
          return;
        }
        if (acao === "inserir-emoji") {
          const input = el.querySelector(".msn-input");
          const emoji = event.target.closest("[data-emoji]")?.dataset.emoji || "";
          const inicio = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
          const fim = Number.isInteger(input.selectionEnd) ? input.selectionEnd : inicio;
          input.setRangeText(emoji, inicio, fim, "end");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          menuEmoji.hidden = true;
          botaoEmoji.setAttribute("aria-expanded", "false");
          input.focus();
          return;
        }
        if (menuEmoji && !menuEmoji.hidden) {
          menuEmoji.hidden = true;
          botaoEmoji?.setAttribute("aria-expanded", "false");
        }
        if (acao === "fechar") { fecharJanela(ctx); return; }
        if (acao === "enviar") { void enviar(ctx); return; }
        if (acao === "anexar") { el.querySelector(".msn-file").click(); return; }
        if (acao === "zumbido") { void enviarZumbido(ctx); return; }
        if (acao === "limpar-conversa") { limparConversa(ctx); return; }
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
        if (ev.key === "Escape") {
          el.querySelector(".msn-emoji-menu").hidden = true;
          el.querySelector(".msn-emoji-trigger").setAttribute("aria-expanded", "false");
          return;
        }
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
          const aviso = !m.body || m.body === "enviou um zumbido" ? "chamou sua atenção!" : m.body;
          return `<div class="msn-nudge-aviso">${escapeHtml(m.autor)} ${escapeHtml(aviso)}</div>`;
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

    async function carregarMensagens(ctx, primeira, efeitos = true) {
      try {
        const rows = await callSupabaseRpc("thread_messages", { p_thread: ctx.threadId }) || [];
        const ultimo = rows.length ? rows[rows.length - 1] : null;
        const chegouNova = !primeira && ultimo && ultimo.id !== ctx.ultimoId;
        const nudgeNovo = chegouNova && ultimo.kind === "nudge" && ultimo.autor_id !== getCurrentUserId();

        ctx.mensagens = rows.filter((mensagem) => !ctx.mensagensOcultas.has(String(mensagem.id)));
        ctx.ultimoId = ultimo?.id || null;
        pintarConversa(ctx);

        if (efeitos && chegouNova && ultimo.autor_id !== getCurrentUserId()) {
          if (nudgeNovo) chacoalhar(ctx);
          else tocarSomMensagem();
        }
        await callSupabaseRpc("messages_mark_thread_read", { p_thread: ctx.threadId });
        await reconciliarNaoLidas();
        if (_painel) void carregarContatos();
      } catch (error) {
        if (isMissingSchemaError(error)) _disabled = true;
        else console.debug("conversa: falha ao atualizar", error);
      }
    }

    function chacoalhar(ctx, comSom = true) {
      ctx.el.classList.remove("chacoalha");
      void ctx.el.offsetWidth;      // reinicia a animação
      ctx.el.classList.add("chacoalha");
      if (comSom) tocarSomAtencao();
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
        showToast(vpFriendlyError(error, "Falha ao chamar atenção."), "error");
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

    function limparConversa(ctx) {
      ctx.mensagens.forEach((mensagem) => ctx.mensagensOcultas.add(String(mensagem.id)));
      ctx.mensagens = [];
      pintarConversa(ctx);
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
    async function atualizarDigitando(ctx) {
      if (!ctx?.focada) return;
      try {
        const quem = await callSupabaseRpc("thread_typing", { p_thread: ctx.threadId }) || [];
        const nomes = quem.map((q) => q.nome).filter(Boolean);
        ctx.el.querySelector(".msn-digitando").textContent =
          nomes.length ? `${nomes.join(", ")} está digitando...` : "";
      } catch (_) { /* silencioso */ }
    }

    async function tickAbertas() {
      for (const ctx of _janelas.values()) {
        await carregarMensagens(ctx);
        await atualizarDigitando(ctx);
      }
    }

    // ── Supabase Realtime ────────────────────────────────────────────────
    async function contextoDoEvento(threadId) {
      const rows = await callSupabaseRpc("messenger_event_context", { p_thread: threadId });
      return Array.isArray(rows) ? rows[0] : rows;
    }

    async function aoReceberMensagem(payload) {
      const mensagem = payload?.new;
      if (!mensagem?.thread_id || mensagem.author_user_id === getCurrentUserId()) return;
      const eventoId = String(mensagem.id || "");
      if (eventoId && _eventosMensagemVistos.has(eventoId)) return;
      if (eventoId) {
        _eventosMensagemVistos.add(eventoId);
        if (_eventosMensagemVistos.size > 500) {
          _eventosMensagemVistos.delete(_eventosMensagemVistos.values().next().value);
        }
      }

      if (mensagem.kind === "nudge") tocarSomAtencao();
      else tocarSomMensagem();
      setUnread(_unread + 1);
      if (_painel) void carregarContatos();

      try {
        const contexto = await contextoDoEvento(mensagem.thread_id);
        if (!contexto) return;
        _meuPerfil.presenca = contexto.presenca || _meuPerfil.presenca;
        _meuPerfil.recado = contexto.recado || _meuPerfil.recado;

        const disponivel = _meuPerfil.presenca === "disponivel";
        const existente = _janelas.get(mensagem.thread_id);
        if (disponivel) {
          pararAlertaCartinha();
          const ctx = abrirJanela(mensagem.thread_id, contexto.titulo, { carregar: false });
          await carregarMensagens(ctx, false, false);
          if (mensagem.kind === "nudge") chacoalhar(ctx, false);
          frente(ctx);
        } else {
          // Ocupado, ausente e invisível não roubam o foco da pessoa.
          piscarCartinha();
          if (existente) await carregarMensagens(existente, false, false);
          else await reconciliarNaoLidas();
        }
      } catch (error) {
        console.debug("messenger realtime: falha ao tratar mensagem", error);
        piscarCartinha();
        void reconciliarNaoLidas();
      }
    }

    function aoReceberAnexo(payload) {
      const anexo = payload?.new;
      const ctx = anexo?.thread_id ? _janelas.get(anexo.thread_id) : null;
      if (!ctx) return;
      void carregarMensagens(ctx, true, false);
      if (ctx.aba === "midias") void carregarMidias(ctx);
    }

    function aoReceberDigitacao(payload) {
      const digitacao = payload?.new;
      if (!digitacao?.thread_id || digitacao.user_id === getCurrentUserId()) return;
      const ctx = _janelas.get(digitacao.thread_id);
      if (ctx) void atualizarDigitando(ctx);
    }

    async function iniciarRealtime() {
      if (_realtimeChannel || _iniciandoRealtime || !isSupabaseConfigured()) return _iniciandoRealtime;
      if (!createRealtimeClient || !getSupabaseConfig || !getAccessToken) {
        console.debug("Marcher Messenger: cliente Realtime indisponível; usando contingência.");
        return null;
      }

      _iniciandoRealtime = (async () => {
        const config = getSupabaseConfig();
        const token = await getAccessToken();
        _realtimeClient = createRealtimeClient(config.projectUrl, config.anonKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          realtime: { worker: true, heartbeatIntervalMs: 15000 }
        });
        _realtimeClient.realtime.setAuth(token);
        _realtimeChannel = _realtimeClient
          .channel(`marcher-messenger-${getCurrentUserId()}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" },
            (payload) => void aoReceberMensagem(payload))
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_attachments" },
            aoReceberAnexo)
          .on("postgres_changes", { event: "*", schema: "public", table: "message_typing" },
            aoReceberDigitacao)
          .subscribe((status) => {
            _realtimeOnline = status === "SUBSCRIBED";
            if (_realtimeOnline) void markDelivered();
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              console.debug(`Marcher Messenger Realtime: ${status}; contingência ativa.`);
            }
          });
      })().catch((error) => {
        _realtimeOnline = false;
        _realtimeChannel = null;
        _realtimeClient = null;
        console.debug("Marcher Messenger: falha ao conectar Realtime", error);
      }).finally(() => { _iniciandoRealtime = null; });

      return _iniciandoRealtime;
    }

    async function atualizarAuthRealtime() {
      if (!_realtimeClient || !getAccessToken) return;
      try {
        _realtimeClient.realtime.setAuth(await getAccessToken());
      } catch (error) {
        console.debug("Marcher Messenger: falha ao renovar autenticação Realtime", error);
      }
    }

    async function iniciar() {
      carregarAjustesLocais();
      prepararAudio();
      await carregarMeuPerfil();
      await iniciarRealtime();
    }

    function pararRealtime() {
      _realtimeOnline = false;
      if (_realtimeClient && _realtimeChannel) void _realtimeClient.removeChannel(_realtimeChannel);
      _realtimeChannel = null;
      _realtimeClient = null;
      _iniciandoRealtime = null;
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
      pararAlertaCartinha();
      removerDesbloqueioAudio();
      if (_audioContext && _audioContext.state !== "closed") void _audioContext.close().catch(() => {});
      _audioContext = null;
      _audioBuffers.clear();
      _audiosCarregando.clear();
      _eventosMensagemVistos.clear();
      pararRealtime();
    }

    async function markDelivered() {
      if (_disabled || !isSupabaseConfigured()) return;
      try { await callSupabaseRpc("mark_messages_delivered"); }
      catch (error) { if (isMissingSchemaError(error)) _disabled = true; }
    }

    // Captura inclusive a interação de login, antes de o Messenger conectar.
    prepararAudio();

    return {
      startMessages: iniciar,
      toggleContatos: abrirPainel,
      setMessagesUnread: (n) => { setUnread(n); if (_painel) void carregarContatos(); },
      onMessagesCountChange: (fn) => { _onCountChange = fn; },
      showUnreadAlert: piscarCartinha,
      refreshRealtimeAuth: atualizarAuthRealtime,
      markMessagesDelivered: markDelivered,
      stopMessages: parar
    };
  }

  window.VECTON_MESSAGES = { createMessagesModule };
})(window);
