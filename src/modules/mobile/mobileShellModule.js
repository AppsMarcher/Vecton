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
      comercialPainelMobileModule
    } = deps;

    const BREAKPOINT_QUERY = "(max-width: 767px)";
    const MODULES = [
      {
        key: "painelVendas", nome: "Painel de Vendas",
        desc: "Faturamento, carteira e meta por coordenação e território.",
        accent: "#4F7CFF", icon: "pie", reportId: "comercialPainel", available: true
      },
      {
        key: "a3", nome: "A3 Estratégico",
        desc: "Norte Verdadeiro, metas e indicadores por gestão.",
        accent: "#8b5cf6", icon: "target", reportId: null, available: false
      }
    ];

    let rootEl = null, screenEl = null;
    let activeModuleKey = null;
    let profileOpen = false;
    let mediaQuery = null;
    let started = false;

    function moduleIconSvg(name) {
      if (name === "target") {
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="currentColor" stroke-width="2"/></svg>';
      }
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2v10l7 4a10 10 0 1 0-7-14Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
    }

    function visibleModules() {
      return MODULES.filter((m) => m.available && (!m.reportId || canSeeReport(m.reportId)));
    }

    // ---------------------------------------------------------------- header

    function renderHeader(showModuleChrome) {
      return '<header class="vmob-header">' +
        '<button type="button" class="vmob-brand" id="vmob-brand-btn" aria-label="Início · Módulos"><span class="vmob-brand-mark">V</span>Vecton</button>' +
        '<span class="vmob-header-right">' +
        '<button type="button" class="vmob-avatar" id="vmob-avatar-btn" aria-haspopup="true" aria-expanded="' + profileOpen + '">' + initials() + "</button>" +
        "</span>" +
        '<div class="vmob-profile-pop' + (profileOpen ? " is-open" : "") + '" id="vmob-profile-pop">' +
        '<button type="button" id="vmob-logout-btn" class="is-danger">Sair</button>' +
        "</div>" +
        "</header>";
    }

    function initials() {
      // Reaproveita o mesmo texto que o avatar da sidebar desktop já mostra
      // (#user-avatar) — evita reimplementar a lógica de nome->iniciais e
      // garante que os dois avatares nunca divirjam.
      const desktopAvatar = document.querySelector("#user-avatar");
      if (desktopAvatar && desktopAvatar.textContent.trim()) return desktopAvatar.textContent.trim();
      const user = getCurrentUser ? getCurrentUser() : null;
      const name = (user && (user.name || user.email)) || "?";
      return name.trim().slice(0, 2).toUpperCase();
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
      return '<div class="vmob-crumbbar"><p class="vmob-menu-eyebrow">Vecton &middot; Mobile</p><h2 class="vmob-level-title" tabindex="-1">Módulos</h2></div>' +
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
      const showChrome = !activeModuleKey; // período/refresh do próprio módulo ficam por conta dele
      rootEl.innerHTML = renderHeader(showChrome) + '<div class="vmob-scroll" id="vmob-scroll"><div id="vmob-screen"></div></div>';
      screenEl = rootEl.querySelector("#vmob-screen");
      bindHeaderEvents();
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
      const logoutBtn = rootEl.querySelector("#vmob-logout-btn");
      if (brandBtn) brandBtn.addEventListener("click", goToMenu);
      if (avatarBtn) avatarBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleProfile(); });
      if (logoutBtn) logoutBtn.addEventListener("click", () => { handleLogout && handleLogout(); });
    }

    function toggleProfile() {
      profileOpen = !profileOpen;
      const pop = rootEl.querySelector("#vmob-profile-pop");
      const btn = rootEl.querySelector("#vmob-avatar-btn");
      if (pop) pop.classList.toggle("is-open", profileOpen);
      if (btn) btn.setAttribute("aria-expanded", String(profileOpen));
    }

    function goToMenu() {
      if (activeModuleKey === "painelVendas" && comercialPainelMobileModule) comercialPainelMobileModule.unmount();
      activeModuleKey = null;
      profileOpen = false;
      renderShell();
    }

    function openModule(key) {
      const mod = MODULES.find((m) => m.key === key);
      if (!mod || !mod.available) return;
      if (mod.reportId && !canSeeReport(mod.reportId)) return;
      activeModuleKey = key;
      profileOpen = false;
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
    }

    function deactivate() {
      if (activeModuleKey === "painelVendas" && comercialPainelMobileModule) comercialPainelMobileModule.unmount();
      activeModuleKey = null;
      document.body.classList.remove("mobile-shell-active");
      if (rootEl) {
        rootEl.removeEventListener("click", handleRootClick);
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
      }
      return isMobileEntry();
    }

    return { init, activate, deactivate, isMobileEntry };
  }

  window.VECTON_MOBILE_SHELL = { createMobileShellModule };
})(window);
