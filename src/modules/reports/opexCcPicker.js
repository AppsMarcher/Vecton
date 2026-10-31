(function attachVectonOpexCcPicker(window) {
  // Seletor unico de Gestao + Centros de Custo do OPEX Real/Meta, com caixa de
  // selecao em cada gestao e em cada CC (multipla selecao). A escolha vira um
  // de tres estados que o relatorio ja sabe tratar: "Marcher" (tudo), uma gestao
  // inteira, ou uma lista de CCs (mesmo caminho do acesso parcial).
  const ALL = "Marcher";

  // Arvore gestao -> CCs que o usuario pode escolher (respeita o acesso parcial).
  function buildTree(costCenters, mgmtOptions, partialMgmts, allOption = ALL) {
    return (mgmtOptions || []).filter((mgmt) => mgmt && mgmt !== allOption).map((mgmt) => {
      const partial = partialMgmts?.get(mgmt);
      const allowed = partial ? new Set([...partial].map(String)) : null;
      const ccs = (costCenters || [])
        .filter((cc) => (cc.management || "").trim() === mgmt && (!allowed || allowed.has(String(cc.id))))
        .map((cc) => ({ id: String(cc.id), number: String(cc.number ?? ""), name: cc.name || "" }))
        .sort((a, b) => a.number.localeCompare(b.number, "pt-BR", { numeric: true }));
      return { mgmt, ccs };
    }).filter((group) => group.ccs.length);
  }

  function readCustom(detailPanel) {
    try {
      const ids = JSON.parse(detailPanel?.dataset?.opexCc || "null");
      return Array.isArray(ids) ? ids.map(String) : null;
    } catch (_) {
      return null;
    }
  }

  function writeCustom(detailPanel, customIds) {
    if (customIds?.length) detailPanel.dataset.opexCc = JSON.stringify(customIds);
    else delete detailPanel.dataset.opexCc;
  }

  function customLabel(tree, ids) {
    const picked = new Set(ids);
    const parts = tree.map((group) => ({ group, ccs: group.ccs.filter((cc) => picked.has(cc.id)) })).filter((part) => part.ccs.length);
    if (parts.length === 1) {
      const { group, ccs } = parts[0];
      return ccs.length === 1 ? `${group.mgmt} · ${ccs[0].number}` : `${group.mgmt} · ${ccs.length} CCs`;
    }
    return `${parts.length} gestões · ${parts.reduce((n, part) => n + part.ccs.length, 0)} CCs`;
  }

  // Aplica a selecao de CCs por cima do que resolveManagementFilter devolveu:
  // vira uma "gestao parcial" sintetica (chave = rotulo), que os relatorios ja filtram por IDs.
  function applyCustom(base, customIds, tree) {
    const valid = new Set(tree.flatMap((group) => group.ccs.map((cc) => cc.id)));
    const ids = (customIds || []).filter((id) => valid.has(String(id)));
    if (!ids.length) return { ...base, customIds: null };
    const label = customLabel(tree, ids);
    const partialMgmts = new Map(base.partialMgmts || []);
    partialMgmts.set(label, ids);
    return { ...base, selectedMgmt: label, partialMgmts, customIds: ids };
  }

  // Selecao -> estado do relatorio: tudo = Marcher, gestao inteira = a gestao, resto = lista de CCs.
  function resolveSelection(tree, ids, canAll, allOption = ALL) {
    const set = new Set(ids);
    const total = tree.reduce((n, group) => n + group.ccs.length, 0);
    if (canAll && set.size === total) return { mgmt: allOption, customIds: null };
    const whole = tree.find((group) => group.ccs.length === set.size && group.ccs.every((cc) => set.has(cc.id)));
    if (whole) return { mgmt: whole.mgmt, customIds: null };
    const first = tree.find((group) => group.ccs.some((cc) => set.has(cc.id)));
    return { mgmt: first?.mgmt || allOption, customIds: [...set] };
  }

  function currentIds(tree, { selectedMgmt, customIds, allOption = ALL }) {
    if (customIds?.length) return new Set(customIds);
    if (selectedMgmt === allOption) return new Set(tree.flatMap((group) => group.ccs.map((cc) => cc.id)));
    const group = tree.find((item) => item.mgmt === selectedMgmt);
    return new Set((group?.ccs || []).map((cc) => cc.id));
  }

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  let openPopover = null;
  function closeOpen() {
    if (openPopover) { openPopover.close(); openPopover = null; }
  }

  // slot: elemento que recebe o botao; o popover vai para o <body> (position: fixed).
  function mount(slot, opts) {
    closeOpen();
    const { tree, canAll, allOption = ALL, selectedMgmt, customIds, partial, onApply, ariaLabel, allowEmpty = false, popClass = "" } = opts;
    const total = tree.reduce((n, group) => n + group.ccs.length, 0);
    const label = customIds?.length ? selectedMgmt : `${selectedMgmt}${partial ? " · parcial" : ""}`;
    const disabled = !canAll && total <= 1;
    slot.innerHTML = `<button type="button" class="opex-filter-select opex-cc-trigger" data-opex-mgmt-label${ariaLabel ? ` aria-label="${esc(ariaLabel)}"` : ""} aria-haspopup="dialog" aria-expanded="false"${disabled ? " disabled" : ""}>${esc(label)}</button>`;
    const trigger = slot.querySelector("button");
    if (disabled) return;

    trigger.addEventListener("click", () => {
      if (openPopover?.trigger === trigger) { closeOpen(); return; }
      closeOpen();
      openPopover = open(trigger, { tree, canAll, allOption, draft: currentIds(tree, { selectedMgmt, customIds, allOption }), selectedMgmt, onApply, allowEmpty, popClass });
    });
  }

  function open(trigger, { tree, canAll, allOption, draft, selectedMgmt, onApply, allowEmpty, popClass }) {
    const total = tree.reduce((n, group) => n + group.ccs.length, 0);
    const expanded = new Set(tree
      .filter((group) => {
        const n = group.ccs.filter((cc) => draft.has(cc.id)).length;
        return tree.length === 1 || (n > 0 && n < group.ccs.length) || group.mgmt === selectedMgmt;
      })
      .map((group) => group.mgmt));

    const pop = document.createElement("div");
    pop.className = popClass ? `opex-cc-pop ${popClass}` : "opex-cc-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Gestões e centros de custo");
    document.body.appendChild(pop);

    function paint() {
      const scroll = pop.querySelector(".opex-cc-list")?.scrollTop || 0;
      const allCount = draft.size;
      const rows = [];
      if (canAll) {
        rows.push(`<label class="opex-cc-row opex-cc-all"><input type="checkbox" data-all><span class="opex-cc-name">${esc(allOption)}</span><em>todos os CCs</em></label>`);
      }
      tree.forEach((group) => {
        const n = group.ccs.filter((cc) => draft.has(cc.id)).length;
        const isOpen = expanded.has(group.mgmt);
        rows.push(`<div class="opex-cc-row opex-cc-g">
          <input type="checkbox" data-g="${esc(group.mgmt)}" aria-label="Selecionar ${esc(group.mgmt)}">
          <button type="button" class="opex-cc-exp" data-exp="${esc(group.mgmt)}" aria-expanded="${isOpen}"><span class="opex-cc-name">${esc(group.mgmt)}</span><em>${n ? `${n}/` : ""}${group.ccs.length} CCs</em><i class="opex-cc-chev${isOpen ? " open" : ""}" aria-hidden="true">›</i></button>
        </div>`);
        if (isOpen) {
          group.ccs.forEach((cc) => rows.push(`<label class="opex-cc-row opex-cc-c"><input type="checkbox" data-c="${esc(cc.id)}"${draft.has(cc.id) ? " checked" : ""}><span class="opex-cc-num">${esc(cc.number)}</span><span class="opex-cc-name">${esc(cc.name)}</span></label>`));
        }
      });
      pop.innerHTML = `<div class="opex-cc-list">${rows.join("")}</div>
        <div class="opex-cc-foot"><span class="opex-cc-count">${allCount ? `${allCount} de ${total} CCs` : (allowEmpty ? "Nenhum CC: lançamento sem centro de custo" : "Selecione ao menos um CC")}</span><button type="button" class="opex-cc-apply" data-apply>Aplicar</button></div>`;
      pop.querySelector(".opex-cc-list").scrollTop = scroll;
      const allBox = pop.querySelector("input[data-all]");
      if (allBox) { allBox.checked = allCount === total; allBox.indeterminate = allCount > 0 && allCount < total; }
      tree.forEach((group) => {
        const box = [...pop.querySelectorAll("input[data-g]")].find((el) => el.dataset.g === group.mgmt);
        const n = group.ccs.filter((cc) => draft.has(cc.id)).length;
        if (box) { box.checked = n === group.ccs.length; box.indeterminate = n > 0 && n < group.ccs.length; }
      });
    }

    function place() {
      const rect = trigger.getBoundingClientRect();
      const width = 300;
      pop.style.width = `${width}px`;
      pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
      pop.style.top = `${rect.bottom + 4}px`;
      pop.style.setProperty("--opex-cc-max", `${Math.max(180, Math.min(380, window.innerHeight - rect.bottom - 80))}px`);
    }

    pop.addEventListener("change", (event) => {
      const el = event.target;
      if (el.matches("input[data-all]")) {
        draft.clear();
        if (el.checked) tree.forEach((group) => group.ccs.forEach((cc) => draft.add(cc.id)));
      } else if (el.matches("input[data-g]")) {
        const group = tree.find((item) => item.mgmt === el.dataset.g);
        group?.ccs.forEach((cc) => (el.checked ? draft.add(cc.id) : draft.delete(cc.id)));
      } else if (el.matches("input[data-c]")) {
        if (el.checked) draft.add(el.dataset.c); else draft.delete(el.dataset.c);
      }
      paint();
    });
    pop.addEventListener("click", (event) => {
      const exp = event.target.closest("[data-exp]");
      if (exp) {
        const key = exp.dataset.exp;
        if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
        paint();
        return;
      }
      if (event.target.closest("[data-apply]")) {
        if (!draft.size) {
          if (!allowEmpty) return;
          closeOpen();
          onApply({ mgmt: allOption, customIds: null, empty: true });
          return;
        }
        const result = resolveSelection(tree, [...draft], canAll, allOption);
        closeOpen();
        onApply(result);
      }
    });

    const onDocDown = (event) => { if (!pop.contains(event.target) && !trigger.contains(event.target)) closeOpen(); };
    const onKey = (event) => { if (event.key === "Escape") { closeOpen(); trigger.focus(); } };
    const onMove = (event) => {
      if (pop.contains(event.target)) return;
      if (event.target === document || event.target.contains?.(trigger)) place();
    };
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", closeOpen);

    trigger.setAttribute("aria-expanded", "true");
    paint();
    place();
    return {
      trigger,
      close() {
        document.removeEventListener("mousedown", onDocDown, true);
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("scroll", onMove, true);
        window.removeEventListener("resize", closeOpen);
        trigger.setAttribute("aria-expanded", "false");
        pop.remove();
      }
    };
  }

  window.VECTON_OPEX_CC_PICKER = { ALL, buildTree, readCustom, writeCustom, customLabel, applyCustom, resolveSelection, currentIds, mount, closeOpen };
})(typeof window !== "undefined" ? window : globalThis);
