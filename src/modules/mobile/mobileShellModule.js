(function attachVectonMobileShell(window) {
  // Shell mobile do Vecton: abaixo do breakpoint (matchMedia, checado 1x no
  // boot — nunca em todo resize) o app não mostra mais a sidebar/catálogo
  // completo, e sim um Menu com os módulos mobile já plugados. Hoje só o
  // Painel de Vendas está pronto; o A3 Estratégico aparece como "Em breve"
  // (card presente, sem tela construída ainda) — o mockup validado em
  // Artifact já provou esse desenho antes deste módulo existir.
  //
  // Política (decisão do usuário, 2026-08-31): abaixo do breakpoint é SEMPRE
  // um destes 3 estados — Menu, um módulo aberto, ou "sem acesso" — nunca a
  // sidebar/catálogo desktop. Sem link de escape pra tela cheia, nem admin.
  function createMobileShellModule(deps) {
    const {
      canSeeReport,
      getCurrentUser,
      handleLogout,
      comercialPainelMobileModule,
      messagesModule
    } = deps;

    const BREAKPOINT_QUERY = "(max-width: 767px)";
    const MODULES = [
      {
        key: "painelVendas", nome: "Painel de Vendas",
        desc: "Faturamento, carteira e meta por coordenação e território.",
        accent: "#4F7CFF", icon: "pie", reportId: "comercialPainel", available: true
      },
      {
        key: "a3", nome: "A3 Estratégicos",
        desc: "Norte Verdadeiro, metas e indicadores por gestão.",
        accent: "#8b5cf6", icon: "target", reportId: null, available: false
      }
    ];

    let rootEl = null, screenEl = null;
    let activeModuleKey = null;
    let profileOpen = false;
    let mediaQuery = null;
    let started = false;
    let vvRaf = 0;
    let vvTimers = [];

    // Reaproveita os mesmos <symbol> do sprite SVG global (index.html) que os
    // cards de relatório do desktop usam via <use> -- ícone idêntico, não uma
    // aproximação desenhada à mão.
    function moduleIconSvg(name) {
      if (name === "target") {
        return '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><use href="#vp-icon-target"></use></svg>';
      }
      return '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><use href="#vp-icon-pie"></use></svg>';
    }

    function visibleModules() {
      return MODULES.filter((m) => m.available && (!m.reportId || canSeeReport(m.reportId)));
    }

    // ---------------------------------------------------------------- header

    function renderHeader() {
      return '<header class="vmob-header">' +
        '<button type="button" class="vmob-brand" id="vmob-brand-btn" aria-label="Início · Módulos"><img class="vmob-brand-logo" src="logo-branco.png" alt="Vecton Planning"></button>' +
        '<span class="vmob-header-right">' +
        '<button type="button" class="vmob-avatar" id="vmob-avatar-btn" aria-haspopup="true" aria-expanded="' + profileOpen + '"></button>' +
        "</span>" +
        '<div class="vmob-profile-pop' + (profileOpen ? " is-open" : "") + '" id="vmob-profile-pop">' +
        // Mesmo símbolo do "vp-icon-chat" que o botão de Mensagens usa na
        // barra do desktop (index.html, sprite SVG global) -- correlação
        // visual pedida pelo usuário, não uma aproximação desenhada à mão.
        '<button type="button" id="vmob-messenger-btn"><svg class="vmob-pop-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#vp-icon-chat"></use></svg><span>Messenger</span></button>' +
        // Ícone padrão de "sair" (porta + seta), não o "⏻" (ligar/desligar)
        // que o botão de Sair do desktop usa -- pedido do usuário foi só
        // "um símbolo padrão de sair", não replicar o glyph do desktop.
        '<button type="button" id="vmob-logout-btn" class="is-danger"><svg class="vmob-pop-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg><span>Sair</span></button>' +
        "</div>" +
        "</header>";
    }

    // Reaproveita o AVATAR já resolvido da sidebar desktop (#user-avatar) --
    // texto (iniciais) E foto de perfil quando cadastrada (background-image +
    // classe has-photo, mesma convenção de .avatar-block em styles.css).
    // Nunca reimplementa a lógica de nome/foto -> os dois avatares não podem
    // divergir. Chamado depois do avatar existir no DOM (paintAvatar, não
    // dentro do template HTML), porque copia estilo computado, não texto puro.
    function paintAvatar(el) {
      if (!el) return;
      const desktopAvatar = document.querySelector("#user-avatar");
      if (desktopAvatar) {
        el.textContent = desktopAvatar.textContent;
        const bg = desktopAvatar.style.backgroundImage;
        el.style.backgroundImage = bg || "";
        el.classList.toggle("has-photo", desktopAvatar.classList.contains("has-photo"));
        el.classList.toggle("is-silhouette", desktopAvatar.classList.contains("is-silhouette"));
        return;
      }
      const user = getCurrentUser ? getCurrentUser() : null;
      const name = (user && (user.name || user.email)) || "?";
      el.textContent = name.trim().slice(0, 2).toUpperCase();
    }

    // ---------------------------------------------------------------- menu

    function renderMenu() {
      const mods = visibleModules();
      if (!mods.length) return renderNoAccess();
      const tiles = MODULES.map((m) => {
        const canOpen = m.available && (!m.reportId || canSeeReport(m.reportId));
        const tag = canOpen ? "button" : "div";
        const attrs = canOpen ? (' type="button" data-mobile-action="open-module" data-mobile-key="' + m.key + '"') : "";
        const badge = m.available ? "" : '<span class="vmob-module-badge">Em breve</span>';
        const chev = canOpen ? '<svg class="vmob-chev" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : "";
        if (m.available && m.reportId && !canSeeReport(m.reportId)) return ""; // sem permissão -> nem lista
        return "<" + tag + ' class="vmob-module-card' + (canOpen ? "" : " is-soon") + '" style="--vmob-module-accent:' + m.accent + '"' + attrs + ">" +
          '<span class="vmob-module-icon">' + moduleIconSvg(m.icon) + "</span>" +
          '<span class="vmob-module-body"><span class="vmob-module-name">' + m.nome + badge + '</span><span class="vmob-module-desc">' + m.desc + "</span></span>" +
          chev +
          "</" + tag + ">";
      }).join("");
      return '<div class="vmob-crumbbar"><h2 class="vmob-level-title" tabindex="-1">Módulos Mobile</h2></div>' +
        '<div class="vmob-section"><div class="vmob-module-list">' + tiles + "</div></div>";
    }

    function renderNoAccess() {
      return '<div class="vmob-state">' +
        '<div class="vmob-state-icon vmob-state-icon--warn"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" stroke-width="2"/></svg></div>' +
        '<p class="vmob-state-title">Sem acesso mobile</p>' +
        '<p class="vmob-state-copy">Você não possui acesso a nenhum módulo mobile disponível no momento.</p>' +
        '<button type="button" class="vmob-state-btn vmob-ghost" id="vmob-noaccess-logout">Sair</button>' +
        "</div>";
    }

    // ---------------------------------------------------------------- render raiz

    function renderShell() {
      if (!rootEl) return;
      // O cabeçalho (com o avatar) só é montado 1x por ativação -- recriá-lo
      // a cada troca de tela reatribuía a foto de perfil (base64, às vezes
      // pesada) num <button> NOVO toda vez via paintAvatar/bindHeaderEvents.
      // Em sessões mobile com várias idas e vindas ao Menu isso degradava no
      // Safari/iOS até a foto simplesmente parar de pintar (bug reincidente,
      // relatado pelo usuário 2026-09-02 -- "some, F5 traz de volta" já
      // tinha sido corrigido pro caso do carregamento no login, mas não pro
      // churn de recriar o nó do avatar a cada navegação). Só o conteúdo de
      // #vmob-screen troca entre Menu/módulo; o header e o avatar sobrevivem
      // à navegação inteira, exatamente como o avatar da sidebar desktop
      // (#user-avatar) também nunca é recriado.
      if (!screenEl) {
        rootEl.innerHTML = renderHeader() + '<div class="vmob-scroll" id="vmob-scroll"><div id="vmob-screen"></div></div>';
        screenEl = rootEl.querySelector("#vmob-screen");
        bindHeaderEvents();
      }
      paintScreen();
    }

    function paintScreen() {
      if (!screenEl) return;
      if (!activeModuleKey) {
        screenEl.innerHTML = renderMenu();
        return;
      }
      // Módulo mobile assume o próprio conteúdo de #vmob-screen (mount/unmount).
      if (activeModuleKey === "painelVendas" && comercialPainelMobileModule) {
        comercialPainelMobileModule.mount(screenEl);
      }
    }

    function bindHeaderEvents() {
      const brandBtn = rootEl.querySelector("#vmob-brand-btn");
      const avatarBtn = rootEl.querySelector("#vmob-avatar-btn");
      const messengerBtn = rootEl.querySelector("#vmob-messenger-btn");
      const logoutBtn = rootEl.querySelector("#vmob-logout-btn");
      if (brandBtn) brandBtn.addEventListener("click", goToMenu);
      if (avatarBtn) {
        paintAvatar(avatarBtn);
        avatarBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleProfile(); });
      }
      if (messengerBtn) {
        messengerBtn.addEventListener("click", () => {
          toggleProfile();
          messagesModule && messagesModule.toggleContatos();
        });
      }
      if (logoutBtn) logoutBtn.addEventListener("click", () => { handleLogout && handleLogout(); });
    }

    function toggleProfile() {
      profileOpen = !profileOpen;
      syncProfilePopover();
    }

    // Reflete `profileOpen` no popover já existente no DOM. Antes disso era
    // "de graça" (o header inteiro nascia de novo a cada renderShell()); com
    // o header persistente (ver renderShell) isso deixou de acontecer
    // sozinho -- sem isto o popover ficaria aberto ao trocar de tela.
    function syncProfilePopover() {
      if (!rootEl) return;
      const pop = rootEl.querySelector("#vmob-profile-pop");
      const btn = rootEl.querySelector("#vmob-avatar-btn");
      if (pop) pop.classList.toggle("is-open", profileOpen);
      if (btn) btn.setAttribute("aria-expanded", String(profileOpen));
    }

    function goToMenu() {
      if (activeModuleKey === "painelVendas" && comercialPainelMobileModule) comercialPainelMobileModule.unmount();
      activeModuleKey = null;
      profileOpen = false;
      syncProfilePopover();
      renderShell();
    }

    function openModule(key) {
      const mod = MODULES.find((m) => m.key === key);
      if (!mod || !mod.available) return;
      if (mod.reportId && !canSeeReport(mod.reportId)) return;
      activeModuleKey = key;
      profileOpen = false;
      syncProfilePopover();
      renderShell();
    }

    function handleRootClick(event) {
      const el = event.target.closest("[data-mobile-action]");
      if (el) {
        const action = el.dataset.mobileAction;
        if (action === "open-module") openModule(el.dataset.mobileKey);
      }
      const noAccessLogout = event.target.closest("#vmob-noaccess-logout");
      if (noAccessLogout) { handleLogout && handleLogout(); return; }
      if (profileOpen && !event.target.closest("#vmob-profile-pop") && !event.target.closest("#vmob-avatar-btn")) {
        toggleProfile();
      }
    }

    // ------------------------------------------------------ viewport (teclado)

    // Mesmo bug documentado em messagesModule.js::ajustarAlturaVisual: no
    // iOS Safari (e navegadores baseados nele) `position:fixed` fica
    // ancorado na "layout viewport" (documento inteiro), não na "visual
    // viewport" (o que está de fato visível). O login termina com o campo
    // de senha ainda focado -- o Safari rola a página pra manter o campo
    // acima do teclado, e o shell mobile, ancorado na layout viewport que
    // não rolou, nasce com o topo fora da área visível (bug relatado pelo
    // usuário, 2026-09-02 -- só "resolvia" dando um resize manual na tela,
    // que força o Safari a recalcular o layout). `releaseAuthViewport` em
    // authSession.js já zera o scroll do documento, mas isso não cobre o
    // deslocamento do VisualViewport em si -- por isso o bug voltou. Fix:
    // reaplica `top`/`height` a partir do VisualViewport, igual ao painel
    // de mensagens. O teclado anima em etapas -> reagenda em vários frames
    // curtos, sem polling fixo.
    function ajustarViewportShell() {
      if (!rootEl || !document.body.classList.contains("mobile-shell-active")) return;
      const vv = window.visualViewport;
      if (!vv) return;
      rootEl.style.height = Math.max(1, Math.round(vv.height)) + "px";
      rootEl.style.top = Math.max(0, Math.round(vv.offsetTop || 0)) + "px";
    }

    function agendarAjusteViewportShell() {
      if (!document.body.classList.contains("mobile-shell-active")) return;
      if (vvRaf) window.cancelAnimationFrame(vvRaf);
      vvRaf = window.requestAnimationFrame(() => { vvRaf = 0; ajustarViewportShell(); });
      vvTimers.forEach((timer) => clearTimeout(timer));
      vvTimers = [70, 180, 360, 560, 900].map((delay) => window.setTimeout(ajustarViewportShell, delay));
    }

    // ---------------------------------------------------------------- boot

    function isMobileEntry() {
      return !!(mediaQuery && mediaQuery.matches);
    }

    function activate(root) {
      rootEl = root;
      rootEl.hidden = false;
      // Visibilidade real é via body.mobile-shell-active (styles.css) --
      // mesmo padrão de body.auth-only já usado pro shell de login. Evita
      // brigar de especificidade com a regra .app-layout{display:grid}.
      document.body.classList.add("mobile-shell-active");
      rootEl.addEventListener("click", handleRootClick);
      activeModuleKey = null;
      renderShell();
      // Aplica de imediato (cobre o caso comum) e reagenda pros próximos
      // frames -- se o login acabou de fechar o teclado, o VisualViewport
      // ainda está no meio da animação de fechamento.
      ajustarViewportShell();
      agendarAjusteViewportShell();
    }

    function deactivate() {
      if (activeModuleKey === "painelVendas" && comercialPainelMobileModule) comercialPainelMobileModule.unmount();
      activeModuleKey = null;
      // profileOpen é variável do módulo (sobrevive ao unmount) -- sem
      // resetar aqui, sair com o popover do avatar aberto (avatar > Sair)
      // fazia o próximo login já nascer com o popover aberto (renderHeader
      // usa profileOpen pra montar a classe is-open).
      profileOpen = false;
      if (vvRaf) { window.cancelAnimationFrame(vvRaf); vvRaf = 0; }
      vvTimers.forEach((timer) => clearTimeout(timer));
      vvTimers = [];
      document.body.classList.remove("mobile-shell-active");
      if (rootEl) {
        rootEl.removeEventListener("click", handleRootClick);
        rootEl.style.top = "";
        rootEl.style.height = "";
        rootEl.hidden = true;
        rootEl.innerHTML = "";
      }
      rootEl = null; screenEl = null;
    }

    // Decide 1x no boot (não em todo resize) se o app abre no shell mobile ou
    // no shell desktop de sempre. `onChange` é chamado só quando a janela
    // CRUZA o breakpoint depois do boot (ex.: girar um tablet) — não a cada
    // pixel de resize.
    function init(root, onChange) {
      mediaQuery = window.matchMedia(BREAKPOINT_QUERY);
      if (!started) {
        started = true;
        mediaQuery.addEventListener("change", (e) => onChange && onChange(e.matches));
        // paintAvatar copia o #user-avatar do desktop 1x, no momento em que
        // o cabeçalho mobile é montado -- se nesse instante a foto ainda
        // não tinha carregado do Supabase (renderUserProfile roda de novo
        // assim que carrega), o avatar mobile ficava em branco pra sempre,
        // sem nunca re-sincronizar (bug relatado pelo usuário, 2026-08-31:
        // "some, F5 traz de volta"). authSession.js dispara este evento
        // toda vez que atualiza o avatar de verdade.
        document.addEventListener("vecton:avatar-updated", () => {
          const btn = rootEl?.querySelector("#vmob-avatar-btn");
          if (btn) paintAvatar(btn);
        });
        window.visualViewport?.addEventListener("resize", agendarAjusteViewportShell);
        window.visualViewport?.addEventListener("scroll", agendarAjusteViewportShell);
      }
      return isMobileEntry();
    }

    return { init, activate, deactivate, isMobileEntry };
  }

  window.VECTON_MOBILE_SHELL = { createMobileShellModule };
})(window);
