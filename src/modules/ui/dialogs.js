(function attachVectonDialogs(window) {
  const TOAST_CONFIG = {
    success: { icon: "✓", title: "Concluído", role: "status", duration: 4200 },
    error: { icon: "!", title: "Não foi possível concluir", role: "alert", duration: 6500 },
    warn: { icon: "!", title: "Atenção", role: "alert", duration: 6000 },
    info: { icon: "i", title: "Informação", role: "status", duration: 5000 }
  };

  function normalizeToastType(type) {
    return ({ ok: "success", warning: "warn", danger: "error" })[type] || (TOAST_CONFIG[type] ? type : "info");
  }

  function showToast(message, type, options) {
    const normalizedType = normalizeToastType(type || "success");
    const config = TOAST_CONFIG[normalizedType];
    const opts = options && typeof options === "object" ? options : {};
    const text = String(message || "").trim();
    if (!text) return () => {};

    let host = document.querySelector("#vp-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "vp-toast-host";
      host.setAttribute("aria-label", "Mensagens do sistema");
      document.body.appendChild(host);
    }

    // Evita empilhar a mesma resposta quando uma ação dispara mais de um
    // callback, e mantém no máximo quatro mensagens visíveis.
    host.querySelectorAll(".vp-toast").forEach((item) => {
      if (item.dataset.toastType === normalizedType && item.dataset.toastMessage === text) item.remove();
    });
    while (host.children.length >= 4) host.firstElementChild?.remove();

    const toast = document.createElement("div");
    toast.className = `vp-toast vp-toast-${normalizedType}`;
    toast.dataset.toastType = normalizedType;
    toast.dataset.toastMessage = text;
    toast.setAttribute("role", config.role);
    toast.setAttribute("aria-atomic", "true");

    const icon = document.createElement("span");
    icon.className = "vp-toast-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = config.icon;

    const copy = document.createElement("div");
    copy.className = "vp-toast-copy";
    const title = document.createElement("strong");
    title.className = "vp-toast-title";
    title.textContent = String(opts.title || config.title);
    const body = document.createElement("p");
    body.className = "vp-toast-message";
    body.textContent = text;
    copy.append(title, body);

    const closeButton = document.createElement("button");
    closeButton.className = "vp-toast-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Fechar mensagem");
    closeButton.textContent = "×";

    toast.append(icon, copy, closeButton);
    host.appendChild(toast);

    let removed = false;
    let timerId = null;
    let startedAt = 0;
    let remaining = Math.max(1800, Number(opts.duration || config.duration) + Math.min(text.length * 18, 1800));

    const dismiss = () => {
      if (removed) return;
      removed = true;
      if (timerId) window.clearTimeout(timerId);
      toast.classList.remove("show");
      toast.classList.add("is-leaving");
      window.setTimeout(() => toast.remove(), 220);
    };
    const startTimer = () => {
      if (removed || timerId) return;
      startedAt = Date.now();
      timerId = window.setTimeout(dismiss, remaining);
    };
    const pauseTimer = () => {
      if (!timerId || removed) return;
      window.clearTimeout(timerId);
      timerId = null;
      remaining = Math.max(500, remaining - (Date.now() - startedAt));
    };

    closeButton.addEventListener("click", dismiss);
    toast.addEventListener("mouseenter", pauseTimer);
    toast.addEventListener("mouseleave", startTimer);
    toast.addEventListener("focusin", pauseTimer);
    toast.addEventListener("focusout", startTimer);
    window.requestAnimationFrame(() => toast.classList.add("show"));
    startTimer();
    return dismiss;
  }

  function createDialogOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "vp-app-dialog-overlay";
    overlay.tabIndex = -1;
    // z-index 10500 (não 9900) — bug reportado pelo usuário (2026-08-29):
    // confirmar exclusão de anexo dentro do carrossel de anexos (.rps-
    // attachment-carousel, z-index 10100) ficava atrás dele, invisível.
    // appAlert/appConfirm/appPrompt são o app inteiro compartilhando esta
    // função — o diálogo é sempre pra bloquear tudo até responder, então
    // sempre deve ficar acima de QUALQUER overlay existente; 10500 folga
    // acima do maior z-index hoje no app (10100, o carrossel).
    overlay.style.cssText = "position:fixed;inset:0;z-index:10500;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);animation:fadeInOv .12s ease";
    return overlay;
  }

  function createDialogBox(icon, label, title, message) {
    const box = document.createElement("div");
    const titleId = `vp-dialog-title-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const messageId = `${titleId}-message`;
    box.className = "vp-app-dialog";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", titleId);
    box.setAttribute("aria-describedby", messageId);
    box.style.cssText = "background:var(--panel);border:0.5px solid var(--line);border-radius:14px;padding:24px 28px;min-width:360px;max-width:460px;box-shadow:0 24px 56px rgba(0,0,0,0.55);animation:slideUpDlg .14s ease";
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:flex-start;gap:14px;margin-bottom:18px";
    const iconEl = document.createElement("span");
    iconEl.setAttribute("aria-hidden", "true");
    iconEl.style.cssText = "font-size:20px;line-height:1;flex-shrink:0;margin-top:1px";
    iconEl.textContent = icon;
    const copy = document.createElement("div");
    const eyebrow = document.createElement("p");
    eyebrow.style.cssText = "font-size:0.65rem;color:var(--text-faint);letter-spacing:0.07em;text-transform:uppercase;margin:0 0 4px";
    eyebrow.textContent = label;
    const heading = document.createElement("h4");
    heading.id = titleId;
    heading.style.cssText = "font-size:0.95rem;font-weight:600;color:var(--text);margin:0 0 6px";
    heading.textContent = title;
    const description = document.createElement("p");
    description.id = messageId;
    description.style.cssText = "font-size:0.82rem;color:var(--text-soft);margin:0;line-height:1.55;white-space:pre-line";
    description.textContent = String(message || "");
    copy.append(eyebrow, heading, description);
    header.append(iconEl, copy);
    box.appendChild(header);
    return box;
  }

  function ensureDialogStyles() {
    if (document.getElementById("app-dialog-styles")) return;
    const style = document.createElement("style");
    style.id = "app-dialog-styles";
    style.textContent = "@keyframes fadeInOv{from{opacity:0}to{opacity:1}}@keyframes slideUpDlg{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media(max-width:560px){.vp-app-dialog-overlay{padding:12px}.vp-app-dialog{box-sizing:border-box;min-width:0!important;width:100%;padding:20px!important}}@media(prefers-reduced-motion:reduce){.vp-app-dialog-overlay,.vp-app-dialog{animation:none!important}}";
    document.head.appendChild(style);
  }

  function appAlert(message, type) {
    const cfg = {
      error: { icon: "⚠️", label: "ATENÇÃO", btnColor: "var(--red)" },
      warn: { icon: "⚠️", label: "AVISO", btnColor: "var(--amber)" },
      info: { icon: "ℹ️", label: "INFORMAÇÃO", btnColor: "var(--blue)" },
      success: { icon: "✅", label: "SUCESSO", btnColor: "var(--green)" }
    }[type || "info"] || { icon: "ℹ️", label: "INFORMAÇÃO", btnColor: "var(--blue)" };

    return new Promise((resolve) => {
      const previousFocus = document.activeElement;
      let settled = false;
      const overlay = createDialogOverlay();
      const box = createDialogBox(cfg.icon, cfg.label, cfg.label, message);
      const footer = document.createElement("div");
      footer.style.cssText = "display:flex;justify-content:flex-end";

      const button = document.createElement("button");
      button.textContent = "OK";
      button.style.cssText = "padding:8px 22px;border-radius:8px;border:none;background:" + cfg.btnColor + ";color:#fff;font-size:0.82rem;font-weight:600;cursor:pointer";
      const close = () => {
        if (settled) return;
        settled = true;
        overlay.remove();
        if (!document.querySelector(".vp-app-dialog-overlay")) document.body.classList.remove("dialog-open");
        previousFocus?.focus?.();
        resolve();
      };
      button.addEventListener("click", close);
      overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
      overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });

      footer.appendChild(button);
      box.appendChild(footer);
      overlay.appendChild(box);
      document.body.classList.add("dialog-open");
      document.body.appendChild(overlay);
      button.focus();
    });
  }

  function appConfirm(message, type) {
    const cfg = {
      danger: { icon: "🗑️", label: "CONFIRMAR EXCLUSÃO", confirmLabel: "Excluir", confirmColor: "var(--red)" },
      deactivate: { icon: "🔒", label: "CONFIRMAR INATIVAÇÃO", confirmLabel: "Inativar", confirmColor: "var(--red)" },
      activate: { icon: "🔓", label: "CONFIRMAR ATIVAÇÃO", confirmLabel: "Ativar", confirmColor: "var(--green)" },
      warn: { icon: "⚠️", label: "CONFIRMAR AÇÃO", confirmLabel: "Confirmar", confirmColor: "var(--amber)" },
      info: { icon: "ℹ️", label: "CONFIRMAR", confirmLabel: "Confirmar", confirmColor: "var(--blue)" }
    }[type || "warn"] || { icon: "⚠️", label: "CONFIRMAR AÇÃO", confirmLabel: "Confirmar", confirmColor: "var(--amber)" };

    return new Promise((resolve) => {
      const previousFocus = document.activeElement;
      let settled = false;
      const overlay = createDialogOverlay();
      const box = createDialogBox(cfg.icon, cfg.label, cfg.label, message);
      const footer = document.createElement("div");
      footer.style.cssText = "display:flex;justify-content:flex-end;gap:10px";

      const cancelButton = document.createElement("button");
      cancelButton.textContent = "Cancelar";
      cancelButton.style.cssText = "padding:8px 18px;border-radius:8px;border:1px solid var(--line);background:var(--panel-alt);color:var(--text-soft);font-size:0.82rem;cursor:pointer";
      const close = (value) => {
        if (settled) return;
        settled = true;
        overlay.remove();
        if (!document.querySelector(".vp-app-dialog-overlay")) document.body.classList.remove("dialog-open");
        previousFocus?.focus?.();
        resolve(value);
      };
      cancelButton.addEventListener("click", () => close(false));

      const confirmButton = document.createElement("button");
      confirmButton.textContent = cfg.confirmLabel;
      confirmButton.style.cssText = "padding:8px 22px;border-radius:8px;border:none;background:" + cfg.confirmColor + ";color:#fff;font-size:0.82rem;font-weight:600;cursor:pointer";
      confirmButton.addEventListener("click", () => close(true));

      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") close(false);
      });
      overlay.addEventListener("click", (event) => { if (event.target === overlay) close(false); });

      footer.appendChild(cancelButton);
      footer.appendChild(confirmButton);
      box.appendChild(footer);
      overlay.appendChild(box);
      document.body.classList.add("dialog-open");
      document.body.appendChild(overlay);
      confirmButton.focus();
    });
  }

  // Regra de interface do Vecton: entradas e confirmações usam este sistema,
  // nunca os popovers nativos alert/confirm/prompt do navegador.
  function appPrompt(options) {
    const config = options && typeof options === "object" ? options : { title: "Editar", fields: [] };
    const fields = Array.isArray(config.fields) ? config.fields : [];
    return new Promise((resolve) => {
      const previousFocus = document.activeElement;
      let settled = false;
      const overlay = createDialogOverlay();
      const box = createDialogBox(
        config.icon || "✦",
        config.eyebrow || "VECTON",
        config.title || "Editar",
        config.message || "Preencha os campos abaixo."
      );
      const form = document.createElement("form");
      form.style.cssText = "display:grid;gap:14px";
      const controls = new Map();

      fields.forEach((field) => {
        const wrapper = document.createElement("label");
        wrapper.style.cssText = "display:grid;gap:6px;color:var(--text-soft);font-size:0.68rem;font-weight:600";
        const caption = document.createElement("span");
        caption.textContent = field.label || field.name || "Campo";
        wrapper.appendChild(caption);

        let control;
        if (field.type === "select") {
          control = document.createElement("select");
          (field.options || []).forEach((option) => {
            const item = document.createElement("option");
            item.value = String(option.value ?? option.label ?? "");
            item.textContent = String(option.label ?? option.value ?? "");
            if (String(field.value ?? "") === item.value) item.selected = true;
            control.appendChild(item);
          });
        } else if (field.type === "textarea") {
          control = document.createElement("textarea");
          control.rows = Number(field.rows || 4);
          control.value = String(field.value ?? "");
        } else {
          control = document.createElement("input");
          control.type = field.type || "text";
          control.value = String(field.value ?? "");
        }
        control.name = String(field.name || "field");
        control.required = Boolean(field.required);
        control.placeholder = String(field.placeholder || "");
        control.style.cssText = "width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid var(--line);border-radius:8px;outline:none;background:var(--panel-alt);color:var(--text);font:inherit;resize:vertical";
        control.addEventListener("focus", () => { control.style.borderColor = "var(--blue)"; });
        control.addEventListener("blur", () => { control.style.borderColor = "var(--line)"; });
        controls.set(control.name, control);
        wrapper.appendChild(control);
        form.appendChild(wrapper);
      });

      const footer = document.createElement("div");
      footer.style.cssText = "display:flex;justify-content:flex-end;gap:10px;margin-top:4px";
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.textContent = config.cancelLabel || "Cancelar";
      cancelButton.style.cssText = "padding:8px 18px;border-radius:8px;border:1px solid var(--line);background:var(--panel-alt);color:var(--text-soft);font-size:0.82rem;cursor:pointer";
      const confirmButton = document.createElement("button");
      confirmButton.type = "submit";
      confirmButton.textContent = config.confirmLabel || "Confirmar";
      confirmButton.style.cssText = "padding:8px 22px;border-radius:8px;border:none;background:var(--blue);color:#fff;font-size:0.82rem;font-weight:600;cursor:pointer";
      footer.appendChild(cancelButton);
      footer.appendChild(confirmButton);
      form.appendChild(footer);
      box.appendChild(form);
      overlay.appendChild(box);
      document.body.classList.add("dialog-open");
      document.body.appendChild(overlay);

      const close = (value) => {
        if (settled) return;
        settled = true;
        overlay.remove();
        if (!document.querySelector(".vp-app-dialog-overlay")) document.body.classList.remove("dialog-open");
        previousFocus?.focus?.();
        resolve(value);
      };
      cancelButton.addEventListener("click", () => close(null));
      overlay.addEventListener("click", (event) => { if (event.target === overlay) close(null); });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") close(null);
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        close(Object.fromEntries(Array.from(controls, ([name, control]) => [name, control.value])));
      });
      const firstControl = controls.values().next().value;
      (firstControl || confirmButton).focus();
      if (firstControl?.select && firstControl.tagName === "INPUT") firstControl.select();
    });
  }

  ensureDialogStyles();

  window.VECTON_DIALOGS = {
    appAlert,
    appConfirm,
    appPrompt,
    showToast
  };
})(window);
