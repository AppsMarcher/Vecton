(function attachVectonAuth(window) {
  function createAuthModule(deps) {
    const {
      AUTH_STORAGE_KEY,
      FUN_AVATARS,
      state,
      loginForm,
      loginFeedback,
      authShell,
      userAvatar,
      userName,
      profileForm,
      setSyncStatus,
      hasSupabaseBaseConfig,
      hydrateFromSupabase,
      buildAuthHeaders,
      supabaseConfig,
      onLogoutCleanup,
      getCurrentSession,
      setCurrentSession,
      getCurrentUser,
      setCurrentUser,
      getProfileDraft,
      setProfileDraft
    } = deps;

    // Sincroniza a sessão entre ABAS/JANELAS do mesmo navegador (2026-08-31,
    // bug real: admin com Usuários aberto em 2 abas levava "Invalid Refresh
    // Token: Refresh Token Not Found" ao reenviar convite/senha). O Supabase
    // rotaciona o refresh token a cada uso (é de uso único) — com 2 abas da
    // mesma sessão, se UMA renova, a token em memória da OUTRA fica obsoleta;
    // na próxima renovação dela, o servidor rejeita porque aquele token já
    // foi consumido. O evento "storage" só dispara nas abas que NÃO fizeram a
    // escrita, então isso mantém toda aba aberta com o token mais recente sem
    // precisar de round-trip nenhum. Ver também o retry defensivo em
    // refreshSession() abaixo, que cobre a janela de corrida bem estreita em
    // que a requisição desta aba já saiu com o token velho antes do evento
    // "storage" chegar.
    window.addEventListener("storage", (event) => {
      if (event.key !== AUTH_STORAGE_KEY) return;
      if (!event.newValue) {
        // Logout (ou sessão derrubada) em outra aba — reflete aqui também.
        clearSessionState();
        showAuthShell("Sessao encerrada.", "ok");
        return;
      }
      try {
        const session = JSON.parse(event.newValue);
        setCurrentSession(session);
        setCurrentUser(session?.user || null);
      } catch (error) {
        console.error("Falha ao sincronizar sessao entre abas", error);
      }
    });

    async function initializeAuth() {
      if (!hasSupabaseBaseConfig()) {
        showAuthShell("Preencha projectUrl, anonKey e organizationName em supabase-config.js.", "error");
        setSyncStatus("Configurar BD", "error");
        return;
      }

      setSyncStatus("Validando sessao...", "warn");

      // Convite/recuperação: se a URL trouxe tokens (link do email), abre o
      // fluxo de definir senha em vez do login normal. try/catch aqui é
      // defesa-em-profundidade: um erro não previsto neste trecho NÃO pode
      // propagar pra fora de initializeAuth() e derrubar o resto do
      // bootstrap() do app (header, período, render) — já aconteceu uma vez
      // (bug de TDZ do reportCardLabelsCache, 2026-08-27) e nada aqui dentro
      // é crítico o bastante pra justificar travar o app inteiro por causa
      // disso; na pior hipótese o usuário só cai no login normal.
      try {
        if (await handleInviteRecoveryFlow()) {
          return;
        }
      } catch (error) {
        console.error("handleInviteRecoveryFlow falhou:", error);
      }

      try {
        const restoredSession = await restoreSession();
        if (!restoredSession) {
          showAuthShell("", "warn");
          setSyncStatus("Nao autenticado", "warn");
          return;
        }

        applySession(restoredSession);
        renderUserProfile();
        hideAuthShell();
        await hydrateFromSupabase();
      } catch (error) {
        console.error(error);
        clearSessionState();
        showAuthShell("Sua sessao nao pode ser restaurada. Entre novamente.", "error");
        setSyncStatus("Sessao expirada", "error");
      }
    }

    // Lê tokens de auth vindos do link de email (hash da URL) — formato
    // ANTIGO, mantido só por compatibilidade com convites/recuperações já
    // enviados antes de 2026-08-27 (ver getQueryTokenHash/verifyOtpTokenHash
    // abaixo pro formato atual).
    function getUrlAuthTokens() {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash || window.location.search.replace(/^\?/, ""));
      return {
        accessToken: params.get("access_token"),
        refreshToken: params.get("refresh_token") || "",
        expiresIn: Number(params.get("expires_in") || 3600),
        type: params.get("type") || "",
        errorDesc: params.get("error_description") || params.get("error") || ""
      };
    }

    // Lê token_hash + type da QUERY STRING do link de email — formato ATUAL
    // (2026-08-27), ver nota grande em handleInviteRecoveryFlow sobre o
    // porquê da troca.
    function getQueryTokenHash() {
      const params = new URLSearchParams(window.location.search);
      return { tokenHash: params.get("token_hash") || "", type: params.get("type") || "" };
    }

    // Troca token_hash+type por uma sessão de verdade — equivalente REST do
    // supabase-js `verifyOtp({token_hash, type})`. POST (não GET): só roda
    // quando o JS do app executa, nunca por um simples fetch de reputação de
    // URL (ver nota abaixo).
    async function verifyOtpTokenHash(type, tokenHash) {
      const response = await fetch(`${supabaseConfig.projectUrl}/auth/v1/verify`, {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ type, token_hash: tokenHash })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    }

    // Fluxo de convite/recuperação: estabelece a sessão do token e abre o form
    // de definir senha. Retorna true se tratou (pra pular o login normal).
    //
    // MUDANÇA 2026-08-27 — por que o link do e-mail não é mais o action_link
    // bruto do GoTrue: usuários reportavam "Link inválido ou expirado" logo
    // no PRIMEIRO clique do convite (nunca tinham aberto antes). Causa: o
    // action_link (`/auth/v1/verify?token=...&type=invite&redirect_to=...`)
    // é um GET de USO ÚNICO — o Microsoft Defender for Office 365 (Safe
    // Links, ativo no tenant @marcher.com.br, mesmo tenant que já
    // sobrescrevia o "Sender name" via GAL) faz varredura em TEMPO DE ENTREGA
    // do e-mail: busca a URL pra checar reputação/phishing ANTES de qualquer
    // humano abrir a mensagem — isso já consome o token, então o clique real
    // do usuário sempre cai em "already used". Fix (mesma técnica recomendada
    // pelo Supabase pra esse cenário): o e-mail agora linka pro PRÓPRIO app
    // com `?token_hash=...&type=...` na query (link normal pro nosso
    // domínio, sem nenhum efeito colateral em ser só buscado/pré-carregado) e
    // a troca de fato (POST /auth/v1/verify, só roda quando o JS executa)
    // acontece aqui, no carregamento real da página pelo navegador do
    // usuário — scanners de reputação de link tipicamente não executam JS.
    // invite-user/resend-invite/resend-password/forgot-password (Edge
    // Functions) constroem esse link a partir de `linkData.properties.
    // hashed_token` em vez de usar `action_link`.
    // Texto do gate por tipo de link -- ver markup em index.html
    // (#confirm-invite-form) e a nota grande logo acima dele sobre por que
    // este gate existe (scanners de segurança que executam JS consumiam o
    // token_hash de uso único sozinhos, antes do clique real do usuário).
    const TOKEN_TYPE_COPY = {
      invite: { title: "Você recebeu um convite", copy: "Um administrador criou seu acesso ao VectonPlan. Clique abaixo para continuar e definir sua senha." },
      recovery: { title: "Redefinir senha", copy: "Clique abaixo para continuar e definir uma nova senha." },
      email_change: { title: "Confirmar novo e-mail", copy: "Clique abaixo para confirmar a alteração do seu e-mail." },
      magiclink: { title: "Entrar no VectonPlan", copy: "Clique abaixo para continuar." },
      signup: { title: "Confirmar cadastro", copy: "Clique abaixo para confirmar seu cadastro." }
    };

    async function verifyAndShowSetPassword(type, tokenHash) {
      const session = await verifyOtpTokenHash(type, tokenHash);
      applySession(session);
      showSetPasswordForm();
      setSyncStatus("Defina sua senha", "warn");
    }

    // Mostra o gate e só chama verifyAndShowSetPassword() no CLIQUE do
    // botão -- nunca automaticamente no load da página (ver nota em
    // index.html #confirm-invite-form sobre o porquê).
    function showConfirmGate(type, tokenHash) {
      showAuthShell("", "warn");
      const gate = document.querySelector("#confirm-invite-form");
      if (loginForm) loginForm.style.display = "none";
      const setForm = document.querySelector("#set-password-form");
      if (setForm) setForm.style.display = "none";
      if (!gate) {
        // index.html sem o markup novo (deploy dessincronizado, cache velho
        // de SW etc.) -- cai pro comportamento antigo (auto-verifica) em vez
        // de travar o usuário sem tela nenhuma pra continuar.
        verifyAndShowSetPassword(type, tokenHash).catch((error) => {
          console.error(error);
          showAuthShell("Link inválido ou expirado. Peça um novo convite ou uma nova redefinição de senha.", "error");
        });
        return;
      }

      gate.style.display = "";
      const texts = TOKEN_TYPE_COPY[type] || TOKEN_TYPE_COPY.invite;
      const titleEl = gate.querySelector("#confirm-invite-title");
      const copyEl = gate.querySelector("#confirm-invite-copy");
      const feedback = gate.querySelector("#confirm-invite-feedback");
      const btn = gate.querySelector("#confirm-invite-btn");
      if (titleEl) titleEl.textContent = texts.title;
      if (copyEl) copyEl.textContent = texts.copy;
      if (feedback) { feedback.textContent = ""; feedback.className = "auth-feedback"; }

      if (btn) {
        // onclick (não addEventListener) de propósito -- cada chamada de
        // showConfirmGate() é pra um token_hash novo, então substituir o
        // handler anterior em vez de empilhar é o comportamento certo.
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            await verifyAndShowSetPassword(type, tokenHash);
            gate.style.display = "none";
          } catch (error) {
            console.error(error);
            if (feedback) {
              feedback.textContent = "Link inválido ou expirado. Peça um novo convite ou uma nova redefinição de senha.";
              feedback.classList.add("is-error");
            }
            btn.disabled = false;
          }
        };
      }
    }

    async function handleInviteRecoveryFlow() {
      const q = getQueryTokenHash();
      if (q.tokenHash && ["invite", "recovery", "signup", "email_change", "magiclink"].includes(q.type)) {
        history.replaceState(null, "", window.location.pathname);
        clearSessionState();
        onLogoutCleanup();
        showConfirmGate(q.type, q.tokenHash);
        return true;
      }

      // Formato antigo (hash da URL) — só pra links já enviados antes desta
      // mudança ainda funcionarem se clicados a tempo.
      const t = getUrlAuthTokens();
      if (!t.accessToken || !["invite", "recovery", "signup"].includes(t.type)) {
        if (t.errorDesc) {
          showAuthShell(`Link inválido ou expirado: ${t.errorDesc}`, "error");
          history.replaceState(null, "", window.location.pathname);
          return true;
        }
        return false;
      }

      // Limpa o hash pra um refresh não reprocessar o token.
      history.replaceState(null, "", window.location.pathname);

      // Garante estado limpo — pode ter outra sessão ativa no mesmo browser.
      clearSessionState();
      onLogoutCleanup();

      try {
        const resp = await fetch(`${supabaseConfig.projectUrl}/auth/v1/user`, {
          headers: buildAuthHeaders(t.accessToken)
        });
        const user = resp.ok ? await resp.json() : null;
        applySession({
          access_token: t.accessToken,
          refresh_token: t.refreshToken,
          expires_at: Math.floor(Date.now() / 1000) + t.expiresIn,
          token_type: "bearer",
          user
        });
      } catch (error) {
        console.error(error);
      }

      showSetPasswordForm();
      setSyncStatus("Defina sua senha", "warn");
      return true;
    }

    function showSetPasswordForm() {
      showAuthShell("", "warn");
      const setForm = document.querySelector("#set-password-form");
      if (loginForm) loginForm.style.display = "none";
      if (!setForm) return;
      setForm.style.display = "";

      const pw = setForm.querySelector("#setpw-password");
      const confirm = setForm.querySelector("#setpw-confirm");
      const feedback = setForm.querySelector("#setpw-feedback");
      const toggle = setForm.querySelector("#setpw-toggle");

      if (toggle && !toggle.dataset.bound) {
        toggle.dataset.bound = "1";
        toggle.addEventListener("click", () => {
          const show = pw.type === "password";
          pw.type = show ? "text" : "password";
          toggle.classList.toggle("active", show);
        });
      }

      if (!setForm.dataset.bound) {
        setForm.dataset.bound = "1";
        setForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const p1 = pw.value, p2 = confirm.value;
          feedback.className = "auth-feedback";
          if (p1.length < 6) { feedback.textContent = "A senha precisa de ao menos 6 caracteres."; feedback.classList.add("is-error"); return; }
          if (p1 !== p2) { feedback.textContent = "As senhas não conferem."; feedback.classList.add("is-error"); return; }
          const btn = setForm.querySelector("button[type=submit]");
          btn.disabled = true;
          feedback.textContent = "";
          try {
            const resp = await fetch(`${supabaseConfig.projectUrl}/auth/v1/user`, {
              method: "PUT",
              headers: buildAuthHeaders(getCurrentSession()?.access_token),
              body: JSON.stringify({ password: p1 })
            });
            if (!resp.ok) throw new Error(await resp.text());
            setForm.style.display = "none";
            if (loginForm) loginForm.style.display = "";
            hideAuthShell();
            await hydrateFromSupabase();
            renderUserProfile();
          } catch (error) {
            console.error(error);
            feedback.textContent = "Não foi possível definir a senha. O link pode ter expirado — peça um novo convite.";
            feedback.classList.add("is-error");
            btn.disabled = false;
          }
        });
      }
      pw.focus();
    }

    async function handleLoginSubmit(event) {
      event.preventDefault();

      const submitButton = loginForm?.querySelector("button[type=submit]");
      const submitLabel = submitButton?.querySelector("span");

      if (!hasSupabaseBaseConfig()) {
        showAuthFeedback("Preencha primeiro o supabase-config.js.", "error");
        return;
      }

      const formData = new FormData(loginForm);
      const email = String(formData.get("email") || "").trim();
      const password = String(formData.get("password") || "");

      if (!email || !password) {
        showAuthFeedback("Informe e-mail e senha.", "error");
        return;
      }

      try {
        if (submitButton) submitButton.disabled = true;
        if (submitLabel) submitLabel.textContent = "Entrando...";
        showAuthFeedback("Entrando...", "ok");
        const session = await signInWithPassword(email, password);
        applySession(session);
        loginForm.reset();
        // Entra no app já; o overlay de blur do hydrate cobre os dados enquanto
        // carregam (sem expor o perfil/dados do usuário anterior).
        hideAuthShell();
        await hydrateFromSupabase();
        renderUserProfile();
      } catch (error) {
        console.error(error);
        clearSessionState();
        showAuthShell(parseAuthError(error), "error");
        setSyncStatus("Falha no login", "error");
      } finally {
        if (submitButton) submitButton.disabled = false;
        if (submitLabel) submitLabel.textContent = "Entrar";
      }
    }

    // "Esqueci minha senha": usa o e-mail já digitado no campo de login e
    // pede o link de recuperação via Edge Function forgot-password (NÃO o
    // endpoint público GoTrue /auth/v1/recover — esse manda pelo SMTP do
    // painel/Office365, que pra destinatários @marcher.com.br tem o nome do
    // remetente sobrescrito pelo GAL do Outlook, "no reply - Marcher Brasil"
    // em vez de "VectonPlan". Mesmo fix já aplicado em convite/resend-password
    // — ver [[project_vecton_plan]] 2026-08-26/27). Ao clicar no link do
    // e-mail, o usuário volta pro app com type=recovery na URL, tratado pelo
    // mesmo handleInviteRecoveryFlow() que já existe pra convite.
    async function requestPasswordRecovery() {
      if (!hasSupabaseBaseConfig()) {
        showAuthFeedback("Preencha primeiro o supabase-config.js.", "error");
        return;
      }

      const email = String(document.querySelector("#login-email")?.value || "").trim();
      if (!email) {
        showAuthFeedback("Informe seu e-mail no campo acima para recuperar a senha.", "error");
        return;
      }

      try {
        showAuthFeedback("Enviando e-mail de recuperação...", "ok");
        const redirectTo = window.location.origin + window.location.pathname;
        // Sem token de sessão (usuário deslogado) — só a anon key, igual
        // signInWithPassword. A function é pública (--no-verify-jwt) de
        // propósito e responde {ok:true} genérico sempre, exista o e-mail ou
        // não, pra não virar oráculo de enumeração.
        const response = await fetch(`${supabaseConfig.projectUrl}/functions/v1/forgot-password`, {
          method: "POST",
          headers: buildAuthHeaders(),
          body: JSON.stringify({ email, redirect_to: redirectTo })
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        showAuthFeedback("Se o e-mail estiver cadastrado, enviamos um link de recuperação.", "ok");
      } catch (error) {
        console.error(error);
        showAuthFeedback("Não foi possível enviar o e-mail de recuperação. Tente novamente.", "error");
      }
    }

    async function handleLogout() {
      const currentSession = getCurrentSession();
      if (currentSession?.access_token) {
        try {
          await fetch(`${supabaseConfig.projectUrl}/auth/v1/logout`, {
            method: "POST",
            headers: buildAuthHeaders(currentSession.access_token)
          });
        } catch (error) {
          console.error(error);
        }
      }

      clearSessionState();
      if (typeof onLogoutCleanup === "function") {
        onLogoutCleanup();
      }
      setSyncStatus("Nao autenticado", "warn");
      showAuthShell("Sessao encerrada.", "ok");
    }

    async function restoreSession() {
      const stored = readStoredSession();
      if (!stored) {
        return null;
      }

      const expiresAt = Number(stored.expires_at || 0);
      const nowInSeconds = Math.floor(Date.now() / 1000);
      if (expiresAt && expiresAt - nowInSeconds > 90) {
        return stored;
      }

      if (!stored.refresh_token) {
        clearStoredSession();
        return null;
      }

      return refreshSession(stored.refresh_token);
    }

    async function signInWithPassword(email, password) {
      const response = await fetch(`${supabaseConfig.projectUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    }

    async function refreshSession(refreshToken) {
      const response = await fetch(`${supabaseConfig.projectUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      if (!response.ok) {
        const bodyText = await response.text();
        // Só derruba a sessão quando o servidor REJEITA o token de fato
        // (400/401/403). Em 5xx ou instabilidade do lado do Supabase o token
        // continua válido — apagar a sessão aí é jogar o usuário pra fora à toa,
        // e com o polling do sininho rodando o dia todo essa chance deixou de
        // ser desprezível.
        if ([400, 401, 403].includes(response.status)) {
          // Antes de desistir: outra aba/janela da MESMA sessão pode ter
          // rotacionado esse refresh token entre o momento em que ESTA aba
          // leu o valor da memória e o momento em que a requisição chegou no
          // servidor (o listener de "storage" acima cobre o caso comum,
          // fora dessa janela de corrida bem estreita) — se o localStorage
          // já tem um token DIFERENTE do que acabou de falhar, tenta uma
          // vez com ele antes de encerrar a sessão de verdade.
          const stored = readStoredSession();
          if (stored?.refresh_token && stored.refresh_token !== refreshToken) {
            return refreshSession(stored.refresh_token);
          }
          clearStoredSession();
        }
        throw new Error(bodyText);
      }

      return response.json();
    }

    function applySession(session) {
      setCurrentSession(session);
      setCurrentUser(session?.user || null);
      hydrateProfileFromCurrentUser();
      saveStoredSession(session);
    }

    function clearSessionState() {
      setCurrentSession(null);
      setCurrentUser(null);
      setProfileDraft(null);
      clearStoredSession();
      renderUserProfile();
    }

    function readStoredSession() {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      try {
        return JSON.parse(raw);
      } catch (error) {
        console.error("Falha ao carregar sessao local", error);
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
      }
    }

    function saveStoredSession(session) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    }

    function clearStoredSession() {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    function showAuthShell(message = "", level = "warn") {
      document.body.classList.add("auth-only");
      authShell.classList.add("active");
      showAuthFeedback(message, level);
    }

    function releaseAuthViewport() {
      // No celular, o submit ocorre com o campo de senha ainda focado. Safari
      // e Chrome mantêm por alguns frames o scroll criado pelo teclado; se o
      // shell mobile (position:fixed) nasce nesse intervalo, seu topo fica
      // fora da área visível. Retira o foco e zera tanto os dois scroll roots
      // usados pelos browsers quanto o viewport depois da animação do teclado.
      const focused = document.activeElement;
      if (focused && authShell?.contains(focused) && typeof focused.blur === "function") {
        focused.blur();
      }

      const resetScroll = () => {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        window.scrollTo(0, 0);
      };

      resetScroll();
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(resetScroll);
      }
      window.setTimeout(resetScroll, 350);
    }

    function hideAuthShell() {
      releaseAuthViewport();
      document.body.classList.remove("auth-only");
      authShell.classList.remove("active");
      showAuthFeedback("", "warn");
    }

    function showAuthFeedback(message, level = "warn") {
      if (!loginFeedback) {
        return;
      }

      loginFeedback.textContent = message;
      loginFeedback.classList.remove("is-error", "is-ok");
      if (level === "error") {
        loginFeedback.classList.add("is-error");
      } else if (level === "ok") {
        loginFeedback.classList.add("is-ok");
      }
    }

    function renderUserProfile() {
      const resolvedProfile = getResolvedProfile();
      const displayName = resolvedProfile.name || "Usuario";

      if (userName) {
        userName.textContent = displayName;
      }
      applyPhotoPreview(userAvatar, resolvedProfile.photoKind, resolvedProfile.photoValue, displayName);
      // Avisa quem copiou o estado deste avatar (hoje só o shell mobile,
      // paintAvatar em mobileShellModule.js) que ele acabou de ser
      // atualizado. Sem isso, um shell mobile que já tinha renderizado seu
      // próprio avatar ANTES desta chamada (a foto ainda não tinha carregado
      // do Supabase) ficava com o avatar em branco pra sempre até o
      // usuário dar F5 -- ele só copia #user-avatar 1x, no momento em que
      // monta o cabeçalho, sem re-sincronizar depois.
      document.dispatchEvent(new CustomEvent("vecton:avatar-updated"));
    }

    function getUserDisplayName() {
      const currentUser = getCurrentUser();
      return currentUser?.user_metadata?.full_name
        || currentUser?.user_metadata?.name
        || currentUser?.email
        || "Usuario";
    }

    function getResolvedProfile() {
      const currentUser = getCurrentUser();
      return {
        name: state.profile?.name || getUserDisplayName(),
        email: state.profile?.email || currentUser?.email || "",
        phone: state.profile?.phone || "",
        photoKind: state.profile?.photoKind || "none",
        photoValue: state.profile?.photoValue || "",
        department: state.profile?.department || "",
        role: state.profile?.role || "Administrador"
      };
    }

    function getEditableProfile() {
      const profileDraft = getProfileDraft();
      return profileDraft ? { ...profileDraft } : { ...getResolvedProfile() };
    }

    function updateProfileDraftFromForm() {
      if (!profileForm) {
        return;
      }

      const nextDraft = {
        ...getEditableProfile(),
        name: document.querySelector("#profile-name").value.trim(),
        email: document.querySelector("#profile-email").value.trim(),
        phone: document.querySelector("#profile-phone")?.value.trim() || "",
        department: document.querySelector("#profile-department").value.trim(),
        role: document.querySelector("#profile-role").value.trim() || "Administrador"
      };
      setProfileDraft(nextDraft);
      document.querySelector("#profile-preview-name").textContent = nextDraft.name || "Usuario";
      document.querySelector("#profile-preview-role").textContent = nextDraft.role || "Administrador";
      applyPhotoPreview(document.querySelector("#profile-photo-trigger"), nextDraft.photoKind, nextDraft.photoValue, nextDraft.name);
    }

    function hydrateProfileFromCurrentUser() {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        return;
      }

      state.profile = {
        ...state.profile,
        name: state.profile?.name || getUserDisplayName(),
        email: state.profile?.email || currentUser.email || "",
        role: state.profile?.role || "Administrador"
      };
      if (!getProfileDraft()) {
        setProfileDraft({ ...state.profile });
      }
    }

    function getUserInitials(name) {
      const cleaned = String(name || "USUARIO").trim();
      const parts = cleaned.split(/\s+/).filter(Boolean);
      return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "FG";
    }

    function resolveProfilePhotoSource(photoKind, photoValue) {
      if (photoKind === "upload" && photoValue) {
        return String(photoValue);
      }

      if (photoKind === "avatar" && photoValue) {
        return FUN_AVATARS.find((item) => item.key === photoValue)?.dataUrl || "";
      }

      return "";
    }

    // Fonte única para qualquer representação do avatar. O desktop ainda
    // usa background-image por compatibilidade visual; o shell mobile consome
    // o mesmo snapshot em um <img> real, que o Safari preserva/redecodifica de
    // forma mais confiável durante as transições do app.
    function getProfileAvatarSnapshot() {
      const profile = getResolvedProfile();
      const name = profile.name || "Usuario";
      return {
        name,
        initials: getUserInitials(name),
        src: resolveProfilePhotoSource(profile.photoKind, profile.photoValue)
      };
    }

    function applyPhotoPreview(element, photoKind, photoValue, name) {
      if (!element) {
        return;
      }

      const initials = getUserInitials(name);
      element.textContent = initials;
      element.style.backgroundImage = "";
      element.classList.remove("has-photo");
      element.classList.remove("is-silhouette");

      const photoSource = resolveProfilePhotoSource(photoKind, photoValue);
      if (photoSource) {
        element.style.backgroundImage = `linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04)), url("${photoSource.replaceAll('"', "%22")}")`;
        element.classList.add("has-photo");
        return;
      }

      element.classList.add("is-silhouette");
    }

    function parseAuthError(error) {
      const message = String(error?.message || error || "");
      if (message.includes("Invalid login credentials")) {
        return "E-mail ou senha invalidos.";
      }
      if (message.includes("Email not confirmed")) {
        return "E-mail ainda nao confirmado.";
      }
      if (message.includes("refresh_token")) {
        return "Sua sessao expirou. Entre novamente.";
      }
      return "Nao foi possivel autenticar.";
    }

    return {
      initializeAuth,
      handleLoginSubmit,
      requestPasswordRecovery,
      handleLogout,
      refreshSession,
      applySession,
      clearSessionState,
      showAuthShell,
      hideAuthShell,
      showAuthFeedback,
      renderUserProfile,
      getUserDisplayName,
      getResolvedProfile,
      getProfileAvatarSnapshot,
      getEditableProfile,
      updateProfileDraftFromForm,
      applyPhotoPreview,
      parseAuthError
    };
  }

  window.VECTON_AUTH = {
    createAuthModule
  };
})(window);
