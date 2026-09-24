(function attachVectonGarantiaAtivacoesCarga(window) {
  // Carga de Ativacoes de Garantia (fonte: exportacao do AltForce, aba
  // "AltForce" da planilha "Ativacoes de garantia.xlsx"). Diferente da Carga
  // de Vendas (comercialVendasCargaModule): aqui nao ha lote/status/auditoria
  // nem competencia mes/ano — e uma carga recorrente e aditiva, upsert direto
  // por (organization_id, numero), sem grade editavel linha a linha.
  function createGarantiaAtivacoesCargaModule(deps) {
    const {
      state,
      views,
      escapeHtml,
      formatDisplayDate,
      normalizeDateInput,
      normalizeHeaderName,
      chunkArray,
      isSupabaseConfigured,
      fetchAllSupabaseRows,
      upsertSupabaseRows,
      deleteSupabaseRows,
      appConfirm,
      resolveOrganizationId,
      formatFileSize,
      onBack,
      MAX_BROWSER_XLSX_BYTES,
      UPSERT_CHUNK_SIZE
    } = deps;

    const CHUNK = UPSERT_CHUNK_SIZE || 200;
    const SHEET_NAME = "AltForce";

    const UF_BY_NAME = {
      ACRE: "AC", ALAGOAS: "AL", AMAPA: "AP", AMAZONAS: "AM", BAHIA: "BA", CEARA: "CE",
      "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", GOIAS: "GO", MARANHAO: "MA",
      "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS", "MINAS GERAIS": "MG", PARA: "PA",
      PARAIBA: "PB", PARANA: "PR", PERNAMBUCO: "PE", PIAUI: "PI", "RIO DE JANEIRO": "RJ",
      "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS", RONDONIA: "RO", RORAIMA: "RR",
      "SANTA CATARINA": "SC", "SAO PAULO": "SP", SERGIPE: "SE", TOCANTINS: "TO"
    };
    const UF_CODES = new Set(Object.values(UF_BY_NAME));
    const MODEL_TOKEN_RE = /(TRANSGRAIN|INGRAIN|OUTGRAIN)\s*-?\s*(\d+\+?)/;

    let rows = [];
    let loading = false;
    let lastSummary = null;
    let lastError = null;
    let searchTerm = "";

    // -------------------------------------------------------------- shell

    function ensureViewShell() {
      const view = views.garantiaAtivacoesCarga;
      if (!view || view.dataset.ready === "true") return;

      view.innerHTML = `
        <div id="garcarga-detail" class="actuals-layout">
          <div class="content-card actuals-intake-card">
            <div class="card-toolbar">
              <div>
                <p class="section-kicker">Upload</p>
                <h4 class="inline-card-title">Carga de Ativações de Garantia</h4>
              </div>
            </div>
            <p class="actuals-intake-hint" id="garcarga-mode-hint">
              Carga adicional: reimportar atualiza as ativações existentes (pelo campo "Número") e
              adiciona as novas, sem apagar nada.
            </p>
            <form id="garcarga-upload-form" class="form-grid actuals-upload-form">
              <div class="full-span garcarga-file-row">
                <label class="vecton-file-field">
                  Arquivo
                  <span class="vecton-file-trigger">
                    <span class="vecton-file-btn">Selecionar arquivo</span>
                    <span class="vecton-file-name" data-file-name>Nenhum arquivo selecionado</span>
                  </span>
                  <input id="garcarga-file-input" name="file" type="file" accept=".xlsx,.xls" class="vecton-file-native">
                </label>
                <label class="garcarga-mode-field">
                  Modo de carga
                  <select id="garcarga-load-mode" class="actuals-mode-select">
                    <option value="additional">Carga adicional</option>
                    <option value="complete">Carga completa</option>
                  </select>
                </label>
              </div>
              <div class="editor-actions full-span">
                <button class="primary-button" type="submit">Importar arquivo</button>
                <button id="garcarga-back" class="ghost-button" type="button">&larr; Voltar</button>
              </div>
            </form>
            <div id="garcarga-upload-feedback" class="actuals-upload-feedback"></div>
          </div>

          <div class="content-card actuals-batch-card">
            <div class="card-toolbar">
              <div>
                <p class="section-kicker">Última carga</p>
                <h4 class="inline-card-title">Resumo</h4>
              </div>
            </div>
            <div id="garcarga-summary" class="actuals-summary-grid garcarga-summary-grid"></div>
          </div>

          <div class="content-card actuals-detail-card">
            <div class="actuals-detail-head">
              <div class="editor-header actuals-detail-title">
                <p class="section-kicker">Dados carregados</p>
                <h4 class="inline-card-title">Ativações de garantia</h4>
              </div>
            </div>
            <div class="actuals-rows-toolbar">
              <label class="actuals-rows-search">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input id="garcarga-search" type="text" placeholder="Buscar por número, produto, revenda, vendedor, cidade...">
              </label>
              <span id="garcarga-rows-count" class="actuals-rows-count"></span>
            </div>
            <div class="table-shell actuals-table-shell">
              <table class="data-table actuals-table garcarga-table">
                <thead>
                  <tr>
                    <th class="garcarga-col-numero">Número</th><th class="garcarga-col-status">Status</th><th>Produto</th><th class="garcarga-col-modelo">Modelo</th><th>Revenda</th>
                    <th>Vendedor</th><th>Cidade</th><th class="garcarga-col-uf">UF</th><th class="garcarga-col-valor">Valor NF unit.</th><th class="garcarga-col-cadastro">Cadastro</th>
                  </tr>
                </thead>
                <tbody id="garcarga-rows-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      view.dataset.ready = "true";
      bindEvents();
    }

    function bindEvents() {
      document.querySelector("#garcarga-upload-form")?.addEventListener("submit", handleUploadSubmit);
      document.querySelector("#garcarga-file-input")?.addEventListener("change", (event) => {
        const nameEl = event.target.closest(".vecton-file-field")?.querySelector("[data-file-name]");
        if (nameEl) nameEl.textContent = event.target.files?.[0]?.name || "Nenhum arquivo selecionado";
      });
      document.querySelector("#garcarga-back")?.addEventListener("click", () => onBack?.());
      document.querySelector("#garcarga-search")?.addEventListener("input", (event) => {
        searchTerm = event.target.value;
        renderRowsTable();
      });
      document.querySelector("#garcarga-load-mode")?.addEventListener("change", (event) => {
        updateModeHint(event.target.value);
      });
    }

    function updateModeHint(mode) {
      const hint = document.querySelector("#garcarga-mode-hint");
      if (!hint) return;
      hint.textContent = mode === "complete"
        ? 'Carga completa: apaga TODAS as ativações de garantia já carregadas para esta organização e substitui pelas desta planilha (aba "AltForce").'
        : 'Carga adicional: reimportar atualiza as ativações existentes (pelo campo "Número") e adiciona as novas, sem apagar nada.';
    }

    // -------------------------------------------------------------- render

    function renderView() {
      ensureViewShell();
      renderSummary();
      renderRowsTable();
    }

    function renderSummary() {
      const container = document.querySelector("#garcarga-summary");
      if (!container) return;
      container.innerHTML = "";
      if (!lastSummary) {
        container.innerHTML = `<div class="actuals-empty">Nenhuma carga realizada nesta sessão ainda.</div>`;
        return;
      }
      [
        { label: "Linhas na planilha", value: String(lastSummary.total) },
        { label: "Novas", value: String(lastSummary.novas) },
        { label: "Atualizadas", value: String(lastSummary.atualizadas) },
        { label: "Sem correspondência de revenda", value: String(lastSummary.semRevenda) },
        { label: "Sem correspondência de produto", value: String(lastSummary.semProduto) }
      ].forEach((item) => {
        const stat = document.createElement("div");
        stat.className = "actuals-summary-card";
        stat.innerHTML = `<span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong>`;
        container.append(stat);
      });
    }

    function renderRowsTable() {
      const tbody = document.querySelector("#garcarga-rows-body");
      if (!tbody) return;
      tbody.innerHTML = "";

      if (loading) {
        tbody.append(buildEmptyRowLocal("Carregando ativações...", 10));
        return;
      }
      if (lastError) {
        tbody.append(buildEmptyRowLocal(lastError, 10));
        return;
      }

      const filter = searchTerm.toLowerCase().trim();
      const filtered = filter
        ? rows.filter((row) =>
            [row.numero, row.produtoRaw, row.revendaRaw, row.vendedorRevenda, row.cidade, row.uf]
              .some((value) => String(value || "").toLowerCase().includes(filter))
          )
        : rows;

      const countEl = document.querySelector("#garcarga-rows-count");
      if (countEl) countEl.textContent = filter ? `${filtered.length} de ${rows.length} linha(s)` : `${rows.length} linha(s)`;

      if (!filtered.length) {
        tbody.append(buildEmptyRowLocal(filter ? "Nenhuma linha encontrada para este filtro." : "Nenhuma ativação carregada ainda.", 10));
        return;
      }

      filtered.slice(0, 500).forEach((row) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(row.numero || "")}</td>
          <td>${escapeHtml(row.status || "")}</td>
          <td title="${escapeHtml(row.produtoRaw || "")}">${escapeHtml(row.produtoRaw || "")}</td>
          <td>${escapeHtml(row.modeloNormalizado || "—")}</td>
          <td>${escapeHtml(row.revendaRaw || "")}</td>
          <td>${escapeHtml(row.vendedorRevenda || "")}</td>
          <td>${escapeHtml(row.cidade || "")}</td>
          <td>${escapeHtml(row.uf || "")}</td>
          <td>${row.nfValorUnitario == null ? "—" : Number(row.nfValorUnitario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
          <td>${escapeHtml(formatDisplayDate(row.cadastradoEm) || "")}</td>
        `;
        tbody.append(tr);
      });
    }

    function buildEmptyRowLocal(message, colspan) {
      const tr = document.createElement("tr");
      tr.className = "empty-row";
      const td = document.createElement("td");
      td.colSpan = colspan;
      td.textContent = message;
      tr.append(td);
      return tr;
    }

    // -------------------------------------------------------------- upload

    async function handleUploadSubmit(event) {
      event.preventDefault();
      const fileInput = document.querySelector("#garcarga-file-input");
      const file = fileInput?.files?.[0];
      const loadMode = document.querySelector("#garcarga-load-mode")?.value === "complete" ? "complete" : "additional";
      if (!file) {
        setFeedback("Selecione um arquivo para importar.", "error");
        return;
      }
      if (file.size > MAX_BROWSER_XLSX_BYTES) {
        setFeedback(`Arquivo muito grande para importação no navegador (${formatFileSize(file.size)}).`, "error");
        return;
      }
      if (loadMode === "complete") {
        const confirmed = await appConfirm(
          "Carga completa vai apagar TODAS as ativações de garantia já carregadas e substituir pelas desta planilha. Deseja continuar?",
          "warn"
        );
        if (!confirmed) return;
      }
      try {
        setFeedback("Lendo arquivo...", "warn");
        const sheetRows = await parseFile(file);
        setFeedback("Resolvendo cadastros de produto e revenda...", "warn");
        const organizationId = await resolveOrganizationId();
        const { produtos, clientes } = await loadCadastrosParaMatch(organizationId);
        const existing = isSupabaseConfigured() && loadMode === "additional"
          ? new Set((await fetchAllSupabaseRows("garantia_ativacoes", `organization_id=eq.${organizationId}&select=numero`)).map((r) => r.numero))
          : new Set();

        const parsedRows = sheetRows.map((raw) => normalizeImportedRow(raw));
        const resolved = parsedRows.map((row) => resolveMatches(row, produtos, clientes));

        const payloadRows = resolved.map((row) => toPayload(organizationId, row));
        if (isSupabaseConfigured()) {
          if (loadMode === "complete") {
            setFeedback("Apagando ativações existentes...", "warn");
            await deleteSupabaseRows("garantia_ativacoes", `organization_id=eq.${organizationId}`);
          }
          const chunks = chunkArray(payloadRows, CHUNK);
          for (let index = 0; index < chunks.length; index += 1) {
            if (chunks.length > 1) setFeedback(`Gravando: bloco ${index + 1} de ${chunks.length}...`, "warn");
            await upsertSupabaseRows("garantia_ativacoes", chunks[index], ["organization_id", "numero"], { minimal: true });
          }
        }

        lastSummary = {
          total: resolved.length,
          novas: resolved.filter((row) => !existing.has(row.numero)).length,
          atualizadas: resolved.filter((row) => existing.has(row.numero)).length,
          semRevenda: resolved.filter((row) => row.revendaRaw && !row.clienteId).length,
          semProduto: resolved.filter((row) => row.produtoRaw && !row.produtoId).length
        };
        lastError = null;
        fileInput.value = "";
        const nameEl = document.querySelector("[data-file-name]");
        if (nameEl) nameEl.textContent = "Nenhum arquivo selecionado";

        await loadAndRender();
        setFeedback(`Carga concluída: ${lastSummary.novas} nova(s), ${lastSummary.atualizadas} atualizada(s).`, "ok");
      } catch (error) {
        console.error(error);
        setFeedback(vpFriendlyError(error, "Falha na importação."), "error");
      }
    }

    async function loadCadastrosParaMatch(organizationId) {
      if (!isSupabaseConfigured()) return { produtos: [], clientes: [] };
      const [produtos, clientes] = await Promise.all([
        fetchAllSupabaseRows("comercial_produtos", `organization_id=eq.${organizationId}&select=id,nome_reduzido,codigo`),
        fetchAllSupabaseRows("comercial_clientes", `organization_id=eq.${organizationId}&select=id,descricao,uf`)
      ]);
      return { produtos: produtos || [], clientes: clientes || [] };
    }

    // ------------------------------------------------------ parse / normalize

    async function parseFile(file) {
      if (!window.XLSX) throw new Error("Leitor de planilha não carregado no navegador.");
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true, dense: true });
      const sheetName = workbook.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : workbook.SheetNames[0];
      if (!sheetName) throw new Error("Arquivo sem abas para leitura.");
      const worksheet = workbook.Sheets[sheetName];
      const sheetRows = window.XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: true });
      if (!sheetRows.length) throw new Error(`Aba "${sheetName}" sem linhas para importação.`);
      const headerMap = mapHeaders(Object.keys(sheetRows[0]));
      const required = ["numero", "produtoRaw", "revendaRaw"];
      const missing = required.filter((key) => !headerMap[key]);
      if (missing.length) {
        throw new Error(`Colunas obrigatórias ausentes no arquivo: ${missing.join(", ")}. Confirme que é a exportação do AltForce (aba "AltForce").`);
      }
      return sheetRows.map((sourceRow) => {
        const out = { rawPayload: sourceRow };
        Object.entries(headerMap).forEach(([key, header]) => { out[key] = sourceRow[header]; });
        return out;
      });
    }

    function mapHeaders(headers) {
      const aliases = {
        numero: ["numero"],
        numeroSerie: ["numerodeserie"],
        quemCadastrou: ["quemcadastrou"],
        cadastradoEm: ["datadocadastro"],
        status: ["geralstatus"],
        produtoRaw: ["geralproduto"],
        clienteFinal: ["geralcliente"],
        revendaRaw: ["geralrevenda"],
        vendedorRevenda: ["geralvendedordarevenda"],
        dataLocalizacao: ["detalheslocalizacaodata"],
        pais: ["detalheslocalizacaoenderecopais"],
        uf: ["detalheslocalizacaoenderecoestado"],
        cidade: ["detalheslocalizacaoenderecocidade"],
        endereco: ["detalheslocalizacaoendereco"],
        nfNumero: ["detalhesnotafiscaln"],
        nfSerie: ["detalhesnotafiscalserie"],
        nfValorUnitario: ["detalhesnotafiscalvalorunitario"],
        nfValorTotal: ["detalhesnotafiscalvalortotal"],
        nfEmissao: ["detalhesnotafiscalemissao"],
        emServicoDesde: ["detalhesdatasdagarantiaemservicodesde"],
        dataCompra: ["detalhesdatasdagarantiacompra"],
        dataEmissaoNf: ["detalhesdatasdagarantiaemissaonf"]
      };
      const result = {};
      headers.forEach((header) => {
        const normalized = normalizeHeaderName(header);
        Object.entries(aliases).forEach(([key, options]) => {
          if (!result[key] && options.includes(normalized)) result[key] = header;
        });
      });
      return result;
    }

    function stripAccents(value) {
      return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
    }

    function normalizeName(value) {
      return stripAccents(value).toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    }

    function normalizeUf(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      const upper = raw.toUpperCase();
      if (upper.length === 2 && UF_CODES.has(upper)) return upper;
      const byName = UF_BY_NAME[normalizeName(raw)];
      return byName || "";
    }

    function extractModeloNormalizado(produtoRaw) {
      const upper = stripAccents(produtoRaw).toUpperCase();
      const match = upper.match(MODEL_TOKEN_RE);
      return match ? `${match[1]}${match[2]}` : "";
    }

    function parseDateTime(value) {
      // "Data do cadastro" vem como "DD/MM/AAAA HH:mm" (texto) ou Date (xlsx cellDates).
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
      const raw = String(value || "").trim();
      if (!raw) return null;
      const [datePart, timePart] = raw.split(/\s+/);
      const iso = normalizeDateInput(datePart);
      if (!iso) return null;
      const time = /^\d{1,2}:\d{2}/.test(timePart || "") ? timePart : "00:00";
      const d = new Date(`${iso}T${time}:00`);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }

    function parseAmount(value) {
      if (value === "" || value === null || value === undefined) return null;
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      const raw = String(value).trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    }

    function normalizeImportedRow(raw) {
      const produtoRaw = String(raw.produtoRaw || "").trim();
      return {
        numero: String(raw.numero || "").trim(),
        numeroSerie: String(raw.numeroSerie || "").trim(),
        quemCadastrou: String(raw.quemCadastrou || "").trim(),
        cadastradoEm: parseDateTime(raw.cadastradoEm),
        status: String(raw.status || "").trim(),
        produtoRaw,
        modeloNormalizado: extractModeloNormalizado(produtoRaw),
        clienteFinal: String(raw.clienteFinal || "").trim(),
        revendaRaw: String(raw.revendaRaw || "").trim(),
        vendedorRevenda: String(raw.vendedorRevenda || "").trim(),
        dataLocalizacao: normalizeDateInput(raw.dataLocalizacao) || null,
        pais: String(raw.pais || "").trim(),
        uf: normalizeUf(raw.uf),
        cidade: String(raw.cidade || "").trim(),
        endereco: String(raw.endereco || "").trim(),
        nfNumero: String(raw.nfNumero || "").trim(),
        nfSerie: String(raw.nfSerie || "").trim(),
        nfValorUnitario: parseAmount(raw.nfValorUnitario),
        nfValorTotal: parseAmount(raw.nfValorTotal),
        nfEmissao: normalizeDateInput(raw.nfEmissao) || null,
        emServicoDesde: normalizeDateInput(raw.emServicoDesde) || null,
        dataCompra: normalizeDateInput(raw.dataCompra) || null,
        dataEmissaoNf: normalizeDateInput(raw.dataEmissaoNf) || null,
        rawPayload: raw.rawPayload || {}
      };
    }

    // Casamento por normalizacao + igualdade/prefixo (sem fuzzy probabilistico):
    // produto por token de modelo (nome_reduzido), revenda por nome normalizado
    // contra comercial_clientes.descricao, desempatando por UF quando ha varios.
    function resolveMatches(row, produtos, clientes) {
      let produtoId = null;
      if (row.modeloNormalizado) {
        const alvo = row.modeloNormalizado.replace(/\s+/g, "");
        const found = produtos.find((p) => String(p.nomeReduzido || p.nome_reduzido || "").toUpperCase().replace(/\s+/g, "") === alvo);
        produtoId = found ? found.id : null;
      }

      let clienteId = null;
      if (row.revendaRaw) {
        const alvo = normalizeName(row.revendaRaw);
        const candidatos = clientes.filter((c) => {
          const norm = normalizeName(c.descricao);
          if (!norm) return false;
          if (norm === alvo) return true;
          if (norm.length > alvo.length) return norm.startsWith(alvo) && norm[alvo.length] === " ";
          return alvo.startsWith(norm) && alvo[norm.length] === " ";
        });
        if (candidatos.length) {
          const porUf = row.uf ? candidatos.find((c) => c.uf === row.uf) : null;
          clienteId = (porUf || candidatos[0]).id;
        }
      }

      return { ...row, produtoId, clienteId };
    }

    function toPayload(organizationId, row) {
      return {
        organization_id: organizationId,
        numero: row.numero,
        numero_serie: row.numeroSerie || null,
        status: row.status || null,
        quem_cadastrou: row.quemCadastrou || null,
        cadastrado_em: row.cadastradoEm,
        produto_raw: row.produtoRaw || null,
        modelo_normalizado: row.modeloNormalizado || null,
        produto_id: row.produtoId,
        cliente_final: row.clienteFinal || null,
        revenda_raw: row.revendaRaw || null,
        cliente_id: row.clienteId,
        vendedor_revenda: row.vendedorRevenda || null,
        data_localizacao: row.dataLocalizacao,
        pais: row.pais || null,
        uf: row.uf || null,
        cidade: row.cidade || null,
        endereco: row.endereco || null,
        nf_numero: row.nfNumero || null,
        nf_serie: row.nfSerie || null,
        nf_valor_unitario: row.nfValorUnitario,
        nf_valor_total: row.nfValorTotal,
        nf_emissao: row.nfEmissao,
        em_servico_desde: row.emServicoDesde,
        data_compra: row.dataCompra,
        data_emissao_nf: row.dataEmissaoNf,
        raw_payload: row.rawPayload || {}
      };
    }

    function normalizeFetchedRow(row) {
      return {
        numero: row.numero,
        status: row.status,
        produtoRaw: row.produto_raw,
        modeloNormalizado: row.modelo_normalizado,
        revendaRaw: row.revenda_raw,
        vendedorRevenda: row.vendedor_revenda,
        cidade: row.cidade,
        uf: row.uf,
        nfValorUnitario: row.nf_valor_unitario,
        cadastradoEm: row.cadastrado_em
      };
    }

    // ------------------------------------------------------ persistence

    async function loadAndRender() {
      ensureViewShell();
      loading = true;
      lastError = null;
      renderView();
      try {
        if (isSupabaseConfigured()) {
          const organizationId = await resolveOrganizationId();
          const fetched = await fetchAllSupabaseRows(
            "garantia_ativacoes",
            `organization_id=eq.${organizationId}&select=id,numero,status,produto_raw,modelo_normalizado,revenda_raw,vendedor_revenda,cidade,uf,nf_valor_unitario,cadastrado_em&order=cadastrado_em.desc`
          );
          rows = (fetched || []).map(normalizeFetchedRow);
        } else {
          rows = [];
        }
      } catch (error) {
        console.error(error);
        lastError = vpFriendlyError(error, "Falha ao carregar ativações de garantia.");
        rows = [];
      } finally {
        loading = false;
        renderView();
      }
    }

    function setFeedback(message, level = "warn") {
      const feedback = document.querySelector("#garcarga-upload-feedback");
      if (!feedback) return;
      feedback.textContent = message;
      feedback.classList.remove("is-error", "is-ok", "is-warn");
      feedback.classList.add(level === "error" ? "is-error" : level === "ok" ? "is-ok" : "is-warn");
    }

    return {
      ensureViewShell,
      renderView,
      loadAndRender
    };
  }

  window.VECTON_GARANTIA_ATIVACOES_CARGA = { createGarantiaAtivacoesCargaModule };
})(window);
