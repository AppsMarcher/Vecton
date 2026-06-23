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

    async function initializeAuth() {
      if (!hasSupabaseBaseConfig()) {
        showAuthShell("Preencha projectUrl, anonKey e organizationName em supabase-config.js.", "error");
        setSyncStatus("Configurar BD", "error");
        return;
      }

      setSyncStatus("Validando sessao...", "warn");

      // Convite/recuperação: se a URL trouxe tokens (link do email), abre o
      // fluxo de definir senha em vez do login normal.
      if (await handleInviteRecoveryFlow()) {
        return;
      }

      try {
        const restoredSession = await restoreSession();
        if (!restoredSession) {
          showAuthShell("Entre com seu usuario para carregar os dados.", "warn");
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

    // Lê tokens de auth vindos do link de email (hash da URL).
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

    // Fluxo de convite/recuperação: estabelece a sessão do token e abre o form
    // de definir senha. Retorna true se tratou (pra pular o login normal).
    async function handleInviteRecoveryFlow() {
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
        clearStoredSession();
        throw new Error(await response.text());
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

    function hideAuthShell() {
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

    function applyPhotoPreview(element, photoKind, photoValue, name) {
      if (!element) {
        return;
      }

      const initials = getUserInitials(name);
      element.textContent = initials;
      element.style.backgroundImage = "";
      element.classList.remove("has-photo");
      element.classList.remove("is-silhouette");

      if (photoKind === "upload" && photoValue) {
        element.style.backgroundImage = `linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04)), url("${photoValue.replaceAll('"', "%22")}")`;
        element.classList.add("has-photo");
        return;
      }

      if (photoKind === "avatar" && photoValue) {
        const avatar = FUN_AVATARS.find((item) => item.key === photoValue);
        if (avatar) {
          element.style.backgroundImage = `linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04)), url("${avatar.dataUrl.replaceAll('"', "%22")}")`;
          element.classList.add("has-photo");
          return;
        }
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
