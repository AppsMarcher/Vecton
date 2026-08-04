(function attachVectonDialogs(window) {
  function createDialogOverlay() {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:9900;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);animation:fadeInOv .12s ease";
    return overlay;
  }

  function createDialogBox(icon, label, title, message) {
    const box = document.createElement("div");
    box.style.cssText = "background:var(--panel);border:0.5px solid var(--line);border-radius:14px;padding:24px 28px;min-width:360px;max-width:460px;box-shadow:0 24px 56px rgba(0,0,0,0.55);animation:slideUpDlg .14s ease";
    box.innerHTML =
      "<div style=\"display:flex;align-items:flex-start;gap:14px;margin-bottom:18px\">" +
        "<span style=\"font-size:20px;line-height:1;flex-shrink:0;margin-top:1px\">" + icon + "</span>" +
        "<div>" +
          "<p style=\"font-size:0.65rem;color:var(--text-faint);letter-spacing:0.07em;text-transform:uppercase;margin:0 0 4px\">" + label + "</p>" +
          "<h4 style=\"font-size:0.95rem;font-weight:600;color:var(--text);margin:0 0 6px\">" + title + "</h4>" +
          "<p style=\"font-size:0.82rem;color:var(--text-soft);margin:0;line-height:1.55\">" + message + "</p>" +
        "</div>" +
      "</div>";
    return box;
  }

  function ensureDialogStyles() {
    if (document.getElementById("app-dialog-styles")) return;
    const style = document.createElement("style");
    style.id = "app-dialog-styles";
    style.textContent = "@keyframes fadeInOv{from{opacity:0}to{opacity:1}}@keyframes slideUpDlg{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}";
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
      const overlay = createDialogOverlay();
      const box = createDialogBox(cfg.icon, cfg.label, cfg.label, message);
      const footer = document.createElement("div");
      footer.style.cssText = "display:flex;justify-content:flex-end";

      const button = document.createElement("button");
      button.textContent = "OK";
      button.style.cssText = "padding:8px 22px;border-radius:8px;border:none;background:" + cfg.btnColor + ";color:#fff;font-size:0.82rem;font-weight:600;cursor:pointer";
      button.addEventListener("click", () => {
        overlay.remove();
        resolve();
      });

      footer.appendChild(button);
      box.appendChild(footer);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      button.focus();
    });
  }

  function appConfirm(message, type) {
    const cfg = {
      danger: { icon: "🗑️", label: "CONFIRMAR EXCLUSÃO", confirmLabel: "Excluir", confirmColor: "var(--red)" },
      warn: { icon: "⚠️", label: "CONFIRMAR AÇÃO", confirmLabel: "Confirmar", confirmColor: "var(--amber)" },
      info: { icon: "ℹ️", label: "CONFIRMAR", confirmLabel: "Confirmar", confirmColor: "var(--blue)" }
    }[type || "warn"] || { icon: "⚠️", label: "CONFIRMAR AÇÃO", confirmLabel: "Confirmar", confirmColor: "var(--amber)" };

    return new Promise((resolve) => {
      const overlay = createDialogOverlay();
      const box = createDialogBox(cfg.icon, cfg.label, cfg.label, message);
      const footer = document.createElement("div");
      footer.style.cssText = "display:flex;justify-content:flex-end;gap:10px";

      const cancelButton = document.createElement("button");
      cancelButton.textContent = "Cancelar";
      cancelButton.style.cssText = "padding:8px 18px;border-radius:8px;border:1px solid var(--line);background:var(--panel-alt);color:var(--text-soft);font-size:0.82rem;cursor:pointer";
      cancelButton.addEventListener("click", () => {
        overlay.remove();
        resolve(false);
      });

      const confirmButton = document.createElement("button");
      confirmButton.textContent = cfg.confirmLabel;
      confirmButton.style.cssText = "padding:8px 22px;border-radius:8px;border:none;background:" + cfg.confirmColor + ";color:#fff;font-size:0.82rem;font-weight:600;cursor:pointer";
      confirmButton.addEventListener("click", () => {
        overlay.remove();
        resolve(true);
      });

      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          overlay.remove();
          resolve(false);
        }
        if (event.key === "Enter") {
          overlay.remove();
          resolve(true);
        }
      });

      footer.appendChild(cancelButton);
      footer.appendChild(confirmButton);
      box.appendChild(footer);
      overlay.appendChild(box);
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
      document.body.appendChild(overlay);

      const close = (value) => {
        overlay.remove();
        resolve(value);
      };
      cancelButton.addEventListener("click", () => close(null));
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
    appPrompt
  };
})(window);
