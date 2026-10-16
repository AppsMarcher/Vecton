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
    const UF_EXTERIOR = "EX";
    const MODEL_TOKEN_RE = /(TRANSGRAIN|INGRAIN|OUTGRAIN|CARGOGRAIN)\s*-?\s*([\d.]+\+?)/;
    // Valor unitario de NF abaixo disso nao e de maquina (peca/lancamento errado
    // no AltForce): a linha fica fora da carga.
    const MIN_VALOR_MAQUINA = 10000;
    // Modelos sem nome_reduzido no cadastro: casam direto pelo codigo do produto.
    const PRODUTO_CODIGO_POR_MODELO = {
      TRANSGRAIN90: "09103075", // CJ. TRANSGRAIN PARA IN90
      TRANSGRAIN91: "09103075",
      TRANSGRAIN215: "08203065" // TRANSGRAIN 215 (inclui "Kit transgrain 215")
    };
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
        { label: "Ignoradas (valor de NF suspeito)", value: String(lastSummary.ignoradas || 0) },
        { label: "Sem preço de máquina", value: String(lastSummary.semPreco || 0) },
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
        const { rows: sheetRows, itens, parcelas } = await parseFile(file);
        setFeedback("Resolvendo cadastros de produto e revenda...", "warn");
        const organizationId = await resolveOrganizationId();
        const { produtos, clientes } = await loadCadastrosParaMatch(organizationId);
        const existing = isSupabaseConfigured() && loadMode === "additional"
          ? new Set((await fetchAllSupabaseRows("garantia_ativacoes", `organization_id=eq.${organizationId}&select=numero`)).map((r) => r.numero))
          : new Set();

        const allParsed = garantirNumerosUnicos(
          sheetRows.map((raw) => aplicarAbasAuxiliares(normalizeImportedRow(raw), { itens, parcelas }))
        );
        const parsedRows = allParsed.filter((row) => !isValorSuspeito(row));
        const ignoradas = allParsed.length - parsedRows.length;
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
          ignoradas,
          semPreco: resolved.filter((row) => row.precoMaquina == null).length,
          novas: resolved.filter((row) => !existing.has(row.numero)).length,
          atualizadas: resolved.filter((row) => existing.has(row.numero)).length,
          semRevenda: resolved.filter((row) => (row.codCliente || row.revendaRaw) && !row.clienteId).length,
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
        fetchAllSupabaseRows("comercial_clientes", `organization_id=eq.${organizationId}&select=id,codigo,descricao,uf`)
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
      const rows = sheetRows.map((sourceRow) => {
        const out = { rawPayload: sourceRow };
        Object.entries(headerMap).forEach(([key, header]) => { out[key] = sourceRow[header]; });
        return out;
      });
      return { rows, itens: readItens(workbook), parcelas: readParcelas(workbook) };
    }

    // Abas auxiliares do AltForce, ligadas a ativacao por (numero de serie, numero). Sao opcionais:
    // sem elas a carga segue so com a aba AltForce (preco = valor unitario da linha, sem parcelas).
    function findSheet(workbook, token) {
      const name = workbook.SheetNames.find((n) => normalizeName(n).includes(token));
      return name ? workbook.Sheets[name] : null;
    }

    function readAuxSheet(workbook, token, aliases) {
      const sheet = findSheet(workbook, token);
      if (!sheet) return [];
      const rawRows = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
      if (!rawRows.length) return [];
      const map = {};
      Object.keys(rawRows[0]).forEach((header) => {
        const normalized = normalizeHeaderName(header);
        Object.entries(aliases).forEach(([key, options]) => {
          if (!map[key] && options.includes(normalized)) map[key] = header;
        });
      });
      return rawRows.map((src) => {
        const out = {};
        Object.entries(map).forEach(([key, header]) => { out[key] = src[header]; });
        return out;
      });
    }

    function chaveAtivacao(serie, numero) {
      return `${String(serie || "").trim()}|${String(numero || "").trim()}`;
    }

    // Itens da NF agrupados por (serie, numero) da ativacao.
    function readItens(workbook) {
      const lista = readAuxSheet(workbook, "ITENS", {
        serie: ["numerodeserie"],
        numero: ["numero"],
        seriesItem: ["numerosdeserie"],
        valorUnitario: ["valorunitario"],
        descricao: ["descricao"]
      });
      const map = new Map();
      lista.forEach((it) => {
        const key = chaveAtivacao(it.serie, it.numero);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({
          seriesItem: String(it.seriesItem || ""),
          valorUnitario: parseAmount(it.valorUnitario),
          descricao: String(it.descricao || "")
        });
      });
      return map;
    }

    function readParcelas(workbook) {
      const lista = readAuxSheet(workbook, "PARCEL", {
        serie: ["numerodeserie"],
        numero: ["numero"],
        data: ["data"],
        tipo: ["tipo"],
        valor: ["valor"]
      });
      const map = new Map();
      lista.forEach((p) => {
        const key = chaveAtivacao(p.serie, p.numero);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ data: normalizeDateInput(p.data) || null, tipo: String(p.tipo || ""), valor: parseAmount(p.valor) });
      });
      map.forEach((list) => list.sort((a, b) => String(a.data || "").localeCompare(String(b.data || ""))));
      return map;
    }

    // Preco da maquina em NF com varios itens: o item cujo numero de serie (ou descricao) cita a
    // serie da ativacao; senao o de maior valor cuja descricao cita o modelo; senao o item unico.
    // Sem aba de itens/sem item da ativacao, cai no valor unitario da linha do AltForce.
    function resolverPreco(row, itensDaAtivacao) {
      const linha = row.nfValorUnitario;
      if (!itensDaAtivacao || !itensDaAtivacao.length) {
        return { preco: linha, origem: linha != null ? "linha" : null };
      }
      const serie = normalizeName(row.numeroSerie).replace(/ /g, "");
      const compacto = (txt) => normalizeName(txt).replace(/ /g, "");
      let escolhido = serie
        ? itensDaAtivacao.find((it) => compacto(it.seriesItem).includes(serie) || compacto(it.descricao).includes(serie))
        : null;
      if (!escolhido && row.modeloNormalizado) {
        const modelo = row.modeloNormalizado.replace(/\s+/g, "");
        escolhido = itensDaAtivacao
          .filter((it) => compacto(it.descricao).includes(modelo))
          .sort((a, b) => (b.valorUnitario || 0) - (a.valorUnitario || 0))[0] || null;
      }
      if (!escolhido && itensDaAtivacao.length === 1) escolhido = itensDaAtivacao[0];
      if (!escolhido || escolhido.valorUnitario == null) return { preco: null, origem: null };
      return { preco: escolhido.valorUnitario, origem: "item" };
    }

    // Financiamento por palavra-chave nas informacoes adicionais da NF (espelha a funcao SQL
    // garantia_classificar_financiamento; a ordem e a prioridade).
    function classificarFinanciamento(texto) {
      const x = normalizeName(texto).toLowerCase();
      if (!x) return "Não identificado";
      if (/\bbnb\b/.test(x)) return "BNB";
      if (/(finame|bndes)/.test(x)) return "Finame/BNDES";
      if (/consorcio/.test(x)) return "Consórcio";
      if (/aliena\w* fiduciaria/.test(x)) return "Alienação fiduciária";
      if (/reserva de dominio/.test(x)) return "Reserva de domínio";
      if (/financ/.test(x)) return "Financiamento (outro)";
      if (/(\bpix\b|a vista)/.test(x)) return "À vista/PIX";
      return "Não identificado";
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
        codCliente: ["codcliente"],
        nomeCliente: ["nomecliente"],
        vendedorRevenda: ["geralvendedordarevenda"],
        dataLocalizacao: ["detalheslocalizacaodata"],
        pais: ["detalheslocalizacaoenderecopais"],
        uf: ["detalheslocalizacaoenderecoestado"],
        cidade: ["detalheslocalizacaoenderecocidade"],
        endereco: ["detalheslocalizacaoendereco"],
        nfNumero: ["detalhesnotafiscaln"],
        nfSerie: ["detalhesnotafiscalserie"],
        nfValorUnitario: ["detalhesnotafiscalvalorunitario"],
        nfQuantidade: ["detalhesnotafiscalquantidade"],
        nfValorTotal: ["detalhesnotafiscalvalortotal"],
        nfEmissao: ["detalhesnotafiscalemissao"],
        emServicoDesde: ["detalhesdatasdagarantiaemservicodesde"],
        dataCompra: ["detalhesdatasdagarantiacompra"],
        dataEmissaoNf: ["detalhesdatasdagarantiaemissaonf"],
        nfCfop: ["detalhesnotafiscalcfop"],
        nfNaturezaOperacao: ["detalhesnotafiscalnaturezadaoperacao"],
        nfDestinatarioDoc: ["detalhesnotafiscalcpfcnpjdodestinatario"],
        nfFormaPagamento: ["detalhesnotafiscalformasdepagamento"],
        nfInfoAdicionais: ["detalhesnotafiscalinformacoesadicionais"]
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
      // AltForce informa "Outro" para maquinas destinadas a exportacao.
      if (upper === "OUTRO" || upper === "EXTERIOR" || upper === UF_EXTERIOR) return UF_EXTERIOR;
      if (upper.length === 2 && UF_CODES.has(upper)) return upper;
      const byName = UF_BY_NAME[normalizeName(raw)];
      return byName || "";
    }

    function isPaisExterior(pais) {
      const norm = normalizeName(pais);
      return Boolean(norm) && norm !== "BRASIL" && norm !== "BRAZIL";
    }

    function extractModeloNormalizado(produtoRaw) {
      const upper = stripAccents(produtoRaw).toUpperCase();
      const match = upper.match(MODEL_TOKEN_RE);
      return match ? `${match[1]}${match[2].replace(/\./g, "")}` : "";
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

    // "Numero" do AltForce e a chave do upsert, mas a exportacao traz numeros
    // repetidos (uma ativacao com varias maquinas) e linhas sem numero. Nesses
    // casos a chave vira "numero/serie" (ou "S/serie"), estavel entre cargas.
    function garantirNumerosUnicos(rows) {
      const contagem = new Map();
      rows.forEach((row) => contagem.set(row.numero, (contagem.get(row.numero) || 0) + 1));
      return rows.map((row) => {
        if (row.numero && contagem.get(row.numero) === 1) return row;
        const serie = row.numeroSerie || "";
        return { ...row, numero: `${row.numero || "S"}/${serie}` };
      });
    }

    function isValorSuspeito(row) {
      return row.precoMaquina != null && row.precoMaquina < MIN_VALOR_MAQUINA;
    }

    // Cod_Cliente/Nome_Cliente vem de PROCV: "#N/A" (ou vazio) = sem cadastro.
    function cleanCodigo(value) {
      const text = String(value ?? "").trim();
      return !text || text.startsWith("#") ? "" : text;
    }

    // Codigo comparavel: sem zeros a esquerda ("002691" = "2691").
    function chaveCodigo(value) {
      return String(value ?? "").trim().replace(/^0+(?=.)/, "");
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
        codCliente: cleanCodigo(raw.codCliente),
        nomeCliente: cleanCodigo(raw.nomeCliente),
        vendedorRevenda: String(raw.vendedorRevenda || "").trim(),
        dataLocalizacao: normalizeDateInput(raw.dataLocalizacao) || null,
        pais: String(raw.pais || "").trim(),
        uf: normalizeUf(raw.uf) || (isPaisExterior(raw.pais) ? UF_EXTERIOR : ""),
        cidade: String(raw.cidade || "").trim(),
        endereco: String(raw.endereco || "").trim(),
        nfNumero: String(raw.nfNumero || "").trim(),
        nfSerie: String(raw.nfSerie || "").trim(),
        nfValorUnitario: parseAmount(raw.nfValorUnitario),
        nfQuantidade: parseAmount(raw.nfQuantidade),
        nfValorTotal: parseAmount(raw.nfValorTotal),
        nfEmissao: normalizeDateInput(raw.nfEmissao) || null,
        emServicoDesde: normalizeDateInput(raw.emServicoDesde) || null,
        dataCompra: normalizeDateInput(raw.dataCompra) || null,
        dataEmissaoNf: normalizeDateInput(raw.dataEmissaoNf) || null,
        nfCfop: String(raw.nfCfop || "").trim(),
        nfNaturezaOperacao: String(raw.nfNaturezaOperacao || "").trim(),
        nfDestinatarioDoc: String(raw.nfDestinatarioDoc || "").replace(/\D/g, ""),
        nfFormaPagamento: String(raw.nfFormaPagamento || "").trim(),
        nfInfoAdicionais: String(raw.nfInfoAdicionais || "").trim(),
        financiamento: classificarFinanciamento(raw.nfInfoAdicionais),
        precoMaquina: parseAmount(raw.nfValorUnitario),
        precoOrigem: parseAmount(raw.nfValorUnitario) != null ? "linha" : null,
        parcelas: null,
        rawPayload: raw.rawPayload || {}
      };
    }

    // Aplica as abas auxiliares (itens e parcelas) a uma linha ja normalizada. Precisa rodar antes de
    // garantirNumerosUnicos, pois a ligacao usa o "Numero" original da ativacao.
    function aplicarAbasAuxiliares(row, extras) {
      const chave = chaveAtivacao(row.numeroSerie, row.numero);
      const { preco, origem } = resolverPreco(row, extras.itens.get(chave));
      const parcelas = extras.parcelas.get(chave) || null;
      return { ...row, precoMaquina: preco, precoOrigem: origem, parcelas };
    }

    // Casamento por normalizacao + igualdade/prefixo (sem fuzzy probabilistico):
    // produto por token de modelo (nome_reduzido), revenda pelo codigo do cliente
    // (Cod_Cliente da planilha = comercial_clientes.codigo).
    function resolveMatches(row, produtos, clientes) {
      let produtoId = null;
      if (row.modeloNormalizado) {
        const alvo = row.modeloNormalizado.replace(/\s+/g, "");
        const codigo = PRODUTO_CODIGO_POR_MODELO[alvo];
        const found = codigo
          ? produtos.find((p) => String(p.codigo || "").trim() === codigo)
          : produtos.find((p) => String(p.nomeReduzido || p.nome_reduzido || "").toUpperCase().replace(/\s+/g, "") === alvo);
        produtoId = found ? found.id : null;
      }

      // Chave principal: codigo do cliente da planilha = comercial_clientes.codigo (mesma chave das vendas).
      let clienteId = null;
      if (row.codCliente) {
        const alvoCodigo = chaveCodigo(row.codCliente);
        clienteId = clientes.find((c) => chaveCodigo(c.codigo) === alvoCodigo)?.id || null;
      }
      // Sem casamento por codigo nao ha fallback por nome: a linha fica sem cliente_id e e listada
      // como inconsistencia no relatorio.
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
        cod_cliente: row.codCliente || null,
        nome_cliente: row.nomeCliente || null,
        vendedor_revenda: row.vendedorRevenda || null,
        data_localizacao: row.dataLocalizacao,
        pais: row.pais || null,
        uf: row.uf || null,
        cidade: row.cidade || null,
        endereco: row.endereco || null,
        nf_numero: row.nfNumero || null,
        nf_serie: row.nfSerie || null,
        nf_valor_unitario: row.nfValorUnitario,
        nf_quantidade: row.nfQuantidade,
        nf_valor_total: row.nfValorTotal,
        nf_emissao: row.nfEmissao,
        em_servico_desde: row.emServicoDesde,
        data_compra: row.dataCompra,
        data_emissao_nf: row.dataEmissaoNf,
        nf_cfop: row.nfCfop || null,
        nf_natureza_operacao: row.nfNaturezaOperacao || null,
        nf_destinatario_doc: row.nfDestinatarioDoc || null,
        nf_forma_pagamento: row.nfFormaPagamento || null,
        nf_info_adicionais: row.nfInfoAdicionais || null,
        financiamento: row.financiamento || null,
        preco_maquina: row.precoMaquina,
        preco_origem: row.precoOrigem,
        parcelas: row.parcelas,
        parcelas_qtd: row.parcelas ? row.parcelas.length : null,
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
