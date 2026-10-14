(function attachVectonReportEmail(window) {
  // Tela "Enviar por e-mail" ÚNICA dos relatórios (padrão do Painel de Vendas): Painel de Vendas,
  // Fluxo de Caixa e Evolutivo de Margens. O PDF nasce no servidor (Edge Function send-report-email)
  // a partir do html que cada relatório monta (buildHtml). Destinatários lembrados em localStorage.
  //
  // Uso: const email = window.VECTON_REPORT_EMAIL.create({ escapeHtml, callEdgeFunction });
  //      email.open({ subtitle, subject, bodyText, filename, buildHtml, isSessionValid? });
  function create(deps) {
    const { escapeHtml, callEdgeFunction } = deps;
    ensureStyle();
    let emailEl = null;

    // Destinatarios lembrados entre envios (localStorage, por navegador/usuario
    // -- nao e um cadastro de servidor). Toggle unico controla as duas pontas:
    // ligado = salva os e-mails usados E sugere os ja salvos; desligado = nem
    // salva nem sugere (nao fica juntando dado silenciosamente).
    const EMAIL_SUGGEST_LIST_KEY = "vp_cvp_email_recipients_v1";
    const EMAIL_SUGGEST_TOGGLE_KEY = "vp_cvp_email_suggest_on_v1";
    const MAX_SAVED_RECIPIENTS = 30;

    function getSuggestEnabled() {
      try { return localStorage.getItem(EMAIL_SUGGEST_TOGGLE_KEY) !== "0"; } catch (_) { return true; } // default ligado
    }
    function setSuggestEnabled(on) {
      try { localStorage.setItem(EMAIL_SUGGEST_TOGGLE_KEY, on ? "1" : "0"); } catch (_) { /* localStorage indisponivel */ }
    }
    function getSavedRecipients() {
      try { return JSON.parse(localStorage.getItem(EMAIL_SUGGEST_LIST_KEY) || "[]"); } catch (_) { return []; }
    }
    function saveRecipients(emails) {
      if (!getSuggestEnabled() || !emails.length) return;
      try {
        const merged = Array.from(new Set([...emails, ...getSavedRecipients()])).slice(0, MAX_SAVED_RECIPIENTS);
        localStorage.setItem(EMAIL_SUGGEST_LIST_KEY, JSON.stringify(merged));
      } catch (_) { /* localStorage indisponivel/cheio -- nao trava o envio */ }
    }

    function closeEmailModal() {
      if (!emailEl) return;
      emailEl.remove();
      emailEl = null;
      document.removeEventListener("keydown", onEmailKey);
    }
    function onEmailKey(e) { if (e.key === "Escape") closeEmailModal(); }

    // Popover de alerta (erro de validacao/envio ou confirmacao de sucesso),
    // sempre exibido por cima do modal de e-mail. Escuta Escape em fase de
    // captura + stopPropagation pra impedir que o Escape "vaze" pro listener
    // do modal de e-mail (onEmailKey) e feche o modal por baixo do popover.
    function showEmailAlert(message, kind, onOk) {
      const backdrop = document.createElement("div");
      backdrop.className = "cvp-alert-backdrop";
      const isErr = kind === "err";
      backdrop.innerHTML = `
        <div class="cvp-alert" role="alertdialog" aria-modal="true">
          <div class="cvp-alert-row">
            <div class="cvp-alert-icon ${isErr ? "err" : "ok"}">
              ${isErr
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>'}
            </div>
            <div class="cvp-alert-msg">${escapeHtml(message)}</div>
          </div>
          <div class="cvp-alert-actions"><button type="button" class="cvp-alert-ok">OK</button></div>
        </div>
      `;
      document.body.appendChild(backdrop);
      const okBtn = backdrop.querySelector(".cvp-alert-ok");
      function dismiss() {
        backdrop.remove();
        document.removeEventListener("keydown", onKey, true);
        if (onOk) onOk();
      }
      function onKey(e) {
        if (e.key === "Escape" || e.key === "Enter") { e.stopPropagation(); dismiss(); }
      }
      okBtn.addEventListener("click", dismiss);
      backdrop.addEventListener("click", (e) => { if (e.target === backdrop) dismiss(); });
      document.addEventListener("keydown", onKey, true);
      okBtn.focus();
    }

    function open({ subtitle, subject: defaultSubject, bodyText: defaultBody, filename, buildHtml, isSessionValid }) {
      closeEmailModal();
      const suggestOn = getSuggestEnabled();

      const backdrop = document.createElement("div");
      backdrop.className = "cvp-email-backdrop";
      backdrop.innerHTML = `
        <div class="cvp-email">
          <div class="cvp-email-head">
            <div><h3>Enviar por e-mail</h3><p>${escapeHtml(subtitle)}</p></div>
            <button type="button" class="cvp-email-x" aria-label="Fechar">✕</button>
          </div>
          <div class="cvp-email-body">
            <div class="cvp-email-row">
              <label for="cvp-email-to">Para</label>
              <input id="cvp-email-to" type="text" placeholder="email@empresa.com, outro@empresa.com" autocomplete="off">
              <div class="cvp-email-suggest-box" data-for="cvp-email-to"></div>
            </div>
            <div class="cvp-email-row">
              <label for="cvp-email-cc">Cc</label>
              <input id="cvp-email-cc" type="text" placeholder="opcional" autocomplete="off">
              <div class="cvp-email-suggest-box" data-for="cvp-email-cc"></div>
            </div>
            <div class="cvp-email-row">
              <label for="cvp-email-subject">Assunto</label>
              <input id="cvp-email-subject" type="text" value="${escapeHtml(defaultSubject)}">
            </div>
            <div class="cvp-email-attach-wrap">
              <div class="cvp-email-attach">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                <span>${escapeHtml(filename)}</span>
              </div>
            </div>
            <div class="cvp-email-row cvp-email-row-text">
              <textarea id="cvp-email-text" class="cvp-email-text" aria-label="Texto do e-mail">${escapeHtml(defaultBody)}</textarea>
            </div>
          </div>
          <div class="cvp-email-msg" id="cvp-email-msg"></div>
          <div class="cvp-email-footer">
            <label class="cvp-email-remember"><input type="checkbox" id="cvp-email-remember"${suggestOn ? " checked" : ""}> Lembrar destinatários para próximos envios</label>
            <div class="cvp-email-actions">
              <button type="button" id="cvp-email-cancel">Cancelar</button>
              <button type="button" id="cvp-email-send" class="primary">Enviar</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
      emailEl = backdrop;
      backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeEmailModal(); });
      backdrop.querySelector(".cvp-email-x").addEventListener("click", closeEmailModal);
      backdrop.querySelector("#cvp-email-cancel").addEventListener("click", closeEmailModal);
      setTimeout(() => document.addEventListener("keydown", onEmailKey), 0);

      const toInput = backdrop.querySelector("#cvp-email-to");
      const ccInput = backdrop.querySelector("#cvp-email-cc");
      const subjectInput = backdrop.querySelector("#cvp-email-subject");
      const textInput = backdrop.querySelector("#cvp-email-text");
      const rememberChk = backdrop.querySelector("#cvp-email-remember");
      const msgEl = backdrop.querySelector("#cvp-email-msg");
      const sendBtn = backdrop.querySelector("#cvp-email-send");
      const fields = [toInput, ccInput, subjectInput, textInput];
      toInput.focus();

      rememberChk.addEventListener("change", () => setSuggestEnabled(rememberChk.checked));

      // Autocomplete dos destinatarios lembrados. Um <input list=datalist>
      // nativo nao serve aqui: ao escolher uma sugestao, o navegador
      // substitui o VALOR INTEIRO do campo pela opcao escolhida -- apagando
      // os e-mails ja digitados antes da virgula. Por isso cada input ganha
      // um dropdown proprio que completa só o token atual (texto depois da
      // ultima virgula), preservando o resto da lista.
      function attachEmailSuggest(inputEl) {
        const box = backdrop.querySelector(`.cvp-email-suggest-box[data-for="${inputEl.id}"]`);
        if (!box) return;
        let activeIndex = -1;

        function currentToken() {
          const parts = inputEl.value.split(",");
          return { parts, token: parts[parts.length - 1].trim() };
        }
        function hide() {
          box.classList.remove("open");
          box.innerHTML = "";
          activeIndex = -1;
        }
        function items() { return Array.from(box.querySelectorAll(".cvp-email-suggest-item")); }
        function setActive(index) {
          const list = items();
          if (!list.length) return;
          activeIndex = (index + list.length) % list.length;
          list.forEach((el, i) => el.classList.toggle("active", i === activeIndex));
        }
        function applySuggestion(email) {
          const { parts } = currentToken();
          const before = parts.slice(0, -1).map((p) => p.trim()).filter(Boolean);
          inputEl.value = before.concat([email]).join(", ") + ", ";
          hide();
          inputEl.focus();
        }
        function render() {
          if (!getSuggestEnabled()) { hide(); return; }
          const { parts, token } = currentToken();
          if (!token) { hide(); return; }
          const already = new Set(parts.slice(0, -1).map((p) => p.trim().toLowerCase()).filter(Boolean));
          const needle = token.toLowerCase();
          const matches = getSavedRecipients()
            .filter((e) => e.toLowerCase().includes(needle) && e.toLowerCase() !== needle && !already.has(e.toLowerCase()))
            .slice(0, 8);
          if (!matches.length) { hide(); return; }
          box.innerHTML = matches.map((e) => `<div class="cvp-email-suggest-item" data-email="${escapeHtml(e)}">${escapeHtml(e)}</div>`).join("");
          box.classList.add("open");
          activeIndex = -1;
        }

        inputEl.addEventListener("input", render);
        inputEl.addEventListener("focus", render);
        inputEl.addEventListener("blur", () => setTimeout(hide, 150));
        inputEl.addEventListener("keydown", (e) => {
          if (!box.classList.contains("open")) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIndex + 1); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIndex - 1); }
          else if (e.key === "Enter" && activeIndex >= 0) { e.preventDefault(); applySuggestion(items()[activeIndex].dataset.email); }
          else if (e.key === "Escape") { hide(); }
        });
        box.addEventListener("mousedown", (e) => {
          const item = e.target.closest(".cvp-email-suggest-item");
          if (item) { e.preventDefault(); applySuggestion(item.dataset.email); }
        });
      }
      attachEmailSuggest(toInput);
      attachEmailSuggest(ccInput);

      function setMsg(text, kind) {
        msgEl.textContent = text || "";
        msgEl.className = "cvp-email-msg" + (kind ? ` ${kind}` : "");
      }
      function parseEmails(raw) {
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
      }

      async function handleSend() {
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const to = parseEmails(toInput.value);
        const cc = parseEmails(ccInput.value);
        if (!to.length) { showEmailAlert("Informe ao menos um destinatário em Para.", "err"); return; }
        const invalid = to.concat(cc).filter((e) => !EMAIL_RE.test(e));
        if (invalid.length) {
          showEmailAlert(`E-mail inválido: ${invalid.join(", ")}. Separe múltiplos endereços por vírgula (,).`, "err");
          return;
        }
        if (!subjectInput.value.trim()) { showEmailAlert("Informe o assunto.", "err"); return; }

        sendBtn.disabled = true;
        fields.forEach((el) => { el.disabled = true; });
        try {
          setMsg("Montando relatório…", "warn");
          if (isSessionValid && !isSessionValid()) throw new Error("A sessão mudou. Reabra o relatório.");
          const html = await buildHtml();
          if (emailEl !== backdrop) return; // fechou durante a montagem
          setMsg("Gerando PDF e enviando e-mail…", "warn");
          await callEdgeFunction("send-report-email", {
            to,
            cc: cc.length ? cc : undefined,
            subject: subjectInput.value.trim(),
            filename,
            body_text: textInput.value,
            html
          });
          if (emailEl !== backdrop) return;
          if (rememberChk.checked) saveRecipients(to.concat(cc));
          setMsg("", "");
          showEmailAlert("E-mail enviado com sucesso.", "ok", () => { if (emailEl === backdrop) closeEmailModal(); });
        } catch (e) {
          console.error("enviar por e-mail:", e);
          if (emailEl !== backdrop) return;
          setMsg("", "");
          sendBtn.disabled = false;
          fields.forEach((el) => { el.disabled = false; });
          showEmailAlert(e?.message || "Falha ao enviar o e-mail.", "err");
        }
      }

      sendBtn.addEventListener("click", handleSend);
    }

    return { open, close: closeEmailModal };
  }

  function ensureStyle() {
    if (document.getElementById("vp-report-email-style")) return;
    const s = document.createElement("style");
    s.id = "vp-report-email-style";
    s.textContent = `
        .cvp-email-backdrop { position:fixed; inset:0; z-index:9900; background:var(--theme-overlay, rgba(0,0,0,.55)); display:flex; align-items:center; justify-content:center; padding:20px; }
        .cvp-email { background:var(--theme-surface, #121317); border:1px solid var(--theme-border, #2a2d34); border-radius:14px; box-shadow:0 30px 80px var(--theme-shadow-color, rgba(0,0,0,.65)); color:var(--theme-ink, #fff); width:85vw; height:85vh; min-width:420px; min-height:380px; display:flex; flex-direction:column; overflow:hidden; }
        .cvp-email-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 20px; border-bottom:1px solid var(--theme-border, #2a2d34); flex:none; }
        .cvp-email-head h3 { font-size:14px; font-weight:600; margin:0; }
        .cvp-email-head p { font-size:11.5px; color:var(--cvp-faint); margin:2px 0 0; }
        .cvp-email-x { background:none; border:none; color:var(--theme-ink-muted, #6b7280); font-size:16px; cursor:pointer; line-height:1; padding:0 2px; }
        .cvp-email-x:hover { color:var(--theme-ink, #fff); }
        .cvp-email-body { flex:1; min-height:0; overflow-y:auto; padding:14px 20px; display:flex; flex-direction:column; }
        .cvp-email-row { position:relative; display:flex; align-items:center; gap:12px; border-bottom:1px solid var(--theme-border, rgba(255,255,255,.16)); padding:9px 0; flex:none; }
        .cvp-email-row label { flex:none; width:64px; font-size:11px; font-weight:600; letter-spacing:.03em; text-transform:uppercase; color:var(--cvp-faint); }
        .cvp-email-row input { flex:1; min-width:0; background:transparent; border:none; color:var(--theme-ink, #fff); font-size:13px; font-family:inherit; padding:4px 0; outline:none; }
        .cvp-email-suggest-box { display:none; position:absolute; top:calc(100% + 2px); left:76px; right:0; z-index:20; background:var(--theme-surface, #1a1c22); border:1px solid var(--theme-border, #2a2d34); border-radius:8px; box-shadow:0 12px 32px var(--theme-shadow-color, rgba(0,0,0,.45)); max-height:168px; overflow-y:auto; }
        .cvp-email-suggest-box.open { display:block; }
        .cvp-email-suggest-item { padding:7px 10px; font-size:12.5px; color:var(--cvp-soft); cursor:pointer; }
        .cvp-email-suggest-item:hover, .cvp-email-suggest-item.active { background:var(--theme-surface-tint, rgba(255,255,255,.07)); color:var(--theme-ink, #fff); }
        .cvp-email-row-text { align-items:stretch; border-bottom:none; flex:1; min-height:0; margin-top:4px; }
        .cvp-email-text { flex:1; min-height:0; resize:none; background:var(--cvp-bg-soft); border:1px solid var(--cvp-line); border-radius:10px; color:var(--theme-ink, #fff); font-size:13px; font-family:inherit; line-height:1.5; padding:10px 12px; outline:none; }
        .cvp-email-text:focus { border-color:#4f7cff; }
        .cvp-email-attach-wrap { border-bottom:1px solid var(--theme-border, rgba(255,255,255,.16)); padding:9px 0; flex:none; }
        .cvp-email-attach { display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--cvp-soft); background:var(--cvp-bg-soft); border:1px solid var(--cvp-line); border-radius:8px; padding:6px 10px; align-self:flex-start; }
        .cvp-email-attach svg { width:13px; height:13px; flex:none; color:var(--cvp-faint); }
        .cvp-email-msg { font-size:12px; padding:0 20px; min-height:16px; flex:none; }
        .cvp-email-msg.err { color:var(--cvp-neg); }
        .cvp-email-msg.ok { color:var(--cvp-pos); }
        .cvp-email-msg.warn { color:var(--theme-ink-amber, #f59e0b); }
        .cvp-email-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 20px; border-top:1px solid var(--theme-border, #2a2d34); flex:none; }
        .cvp-email-remember { display:flex; align-items:center; gap:7px; font-size:11.5px; color:var(--cvp-soft); cursor:pointer; user-select:none; white-space:nowrap; flex:none; }
        .cvp-email-remember input { accent-color:#4f7cff; }
        .cvp-email-actions { display:flex; justify-content:flex-end; gap:8px; }
        .cvp-email-actions button { border-radius:10px; padding:9px 16px; font-size:12.5px; font-weight:600; font-family:inherit; cursor:pointer; border:1px solid var(--cvp-line); background:transparent; color:var(--cvp-soft); }
        .cvp-email-actions button:hover { color:var(--cvp-text); border-color:#4f7cff; }
        .cvp-email-actions button.primary { background:#4f7cff; border-color:#4f7cff; color:#fff; }
        .cvp-email-actions button.primary:hover { background:#3f6bef; }
        .cvp-email-actions button:disabled { opacity:.55; cursor:default; }
        .cvp-alert-backdrop { position:fixed; inset:0; z-index:9950; background:var(--theme-overlay, rgba(0,0,0,.5)); display:flex; align-items:center; justify-content:center; padding:20px; }
        .cvp-alert { background:var(--theme-surface, #1a1c22); border:1px solid var(--theme-border, #2a2d34); border-radius:14px; box-shadow:0 30px 80px var(--theme-shadow-color, rgba(0,0,0,.65)); color:var(--theme-ink, #fff); width:100%; max-width:360px; padding:20px; display:flex; flex-direction:column; gap:16px; }
        .cvp-alert-row { display:flex; align-items:flex-start; gap:12px; }
        .cvp-alert-icon { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex:none; }
        .cvp-alert-icon.err { background:rgba(239,68,68,.15); color:var(--theme-ink-red, #f87171); }
        .cvp-alert-icon.ok { background:rgba(34,197,94,.15); color:var(--theme-ink-green, #4ade80); }
        .cvp-alert-icon svg { width:17px; height:17px; }
        .cvp-alert-msg { font-size:13px; line-height:1.5; color:var(--theme-ink, #e5e7eb); padding-top:5px; }
        .cvp-alert-actions { display:flex; justify-content:flex-end; }
        .cvp-alert-actions button { border-radius:10px; padding:8px 22px; font-size:12.5px; font-weight:600; font-family:inherit; cursor:pointer; border:1px solid #4f7cff; background:#4f7cff; color:#fff; }
        .cvp-alert-actions button:hover { background:#3f6bef; }
    `;
    document.head.appendChild(s);
  }

  window.VECTON_REPORT_EMAIL = { create };
})(window);
