/* Deck de handover — DRE Real e Headcount (VectonPlan)
   Tema: dark do proprio app (tokens de styles.css :root). */
// pptxgenjs nao esta instalado no scratchpad; PPTX_LIB aponta para uma copia existente.
const pptxgen = (() => {
  try { return require("pptxgenjs"); }
  catch (_) { return require(process.env.PPTX_LIB); }
})();

// ── Tokens Vecton ────────────────────────────────────────────────────────────
const BG = "09090A", PANEL = "121317", PANEL2 = "0F1013", LINE = "2A2D34";
const TXT = "FFFFFF", SOFT = "A1A7B3", FAINT = "6B7280";
const BLUE = "4F7CFF", GREEN = "22C55E", RED = "EF4444", AMBER = "F59E0B",
      CYAN = "14B8A6", VIOLET = "8B5CF6";

const HEAD = "Cambria", BODY = "Calibri";
const W = 13.333, H = 7.5, M = 0.65, CW = W - 2 * M;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "VectonPlan";
pres.title = "DRE Real e Headcount — sistemática de carga e agregação";

const S = () => { const s = pres.addSlide(); s.background = { color: BG }; return s; };
const shadow = () => ({ type: "outer", color: "000000", blur: 14, offset: 3, angle: 90, opacity: 0.34 });

function header(s, block, num, title, sub) {
  s.addText(block.toUpperCase(), {
    x: M, y: 0.34, w: CW - 1, h: 0.26, fontFace: BODY, fontSize: 10.5,
    color: FAINT, bold: true, charSpacing: 2.2, margin: 0
  });
  s.addShape(pres.ShapeType.roundRect, {
    x: W - M - 0.62, y: 0.3, w: 0.62, h: 0.34, rectRadius: 0.08,
    fill: { color: PANEL }, line: { color: LINE, width: 0.75 }
  });
  s.addText(String(num), {
    x: W - M - 0.62, y: 0.3, w: 0.62, h: 0.34, fontFace: BODY, fontSize: 11,
    color: SOFT, align: "center", valign: "middle", margin: 0
  });
  s.addText(title, {
    x: M, y: 0.72, w: CW, h: 0.72, fontFace: HEAD, fontSize: 31, bold: true,
    color: TXT, margin: 0, valign: "middle"
  });
  if (sub) {
    s.addText(sub, {
      x: M, y: 1.46, w: CW, h: 0.42, fontFace: BODY, fontSize: 14.5,
      color: BLUE, margin: 0, valign: "top", italic: true
    });
  }
  return sub ? 2.05 : 1.66;
}

function card(s, o) {
  s.addShape(pres.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.06,
    fill: { color: o.fill || PANEL }, line: { color: o.line || LINE, width: 1 },
    shadow: shadow()
  });
}

function chip(s, x, y, d, txt, color) {
  s.addShape(pres.ShapeType.ellipse, {
    x, y, w: d, h: d, fill: { color: PANEL2 }, line: { color, width: 1.5 }
  });
  s.addText(txt, {
    x, y, w: d, h: d, fontFace: BODY, fontSize: d > 0.5 ? 15 : 12, bold: true,
    color, align: "center", valign: "middle", margin: 0
  });
}

function bullets(s, items, o) {
  s.addText(items.map((t, i) => ({
    text: t, options: { bullet: { code: "2022" }, breakLine: i < items.length - 1 }
  })), {
    x: o.x, y: o.y, w: o.w, h: o.h, fontFace: BODY, fontSize: o.size || 14,
    color: o.color || SOFT, lineSpacing: (o.size || 14) * 1.42,
    paraSpaceAfter: 7, margin: 0, valign: "top"
  });
}

function tableOf(s, head, rows, o) {
  s.addTable([
    head.map((h) => ({
      text: h, options: { bold: true, color: TXT, fill: { color: PANEL },
        fontSize: 12, fontFace: BODY }
    })),
    ...rows.map((r, i) => r.map((c, j) => ({
      text: c,
      options: {
        color: j === 0 ? TXT : SOFT, bold: j === 0,
        fill: { color: i % 2 ? PANEL2 : BG }, fontSize: o.size || 11.5, fontFace: BODY
      }
    })))
  ], {
    x: o.x, y: o.y, w: o.w, colW: o.colW, border: { type: "solid", color: LINE, pt: 0.5 },
    rowH: o.rowH || 0.34, valign: "middle", margin: [4, 8, 4, 8], autoPage: false
  });
}

function callout(s, o) {
  card(s, { x: o.x, y: o.y, w: o.w, h: o.h, fill: PANEL2, line: o.color });
  chip(s, o.x + 0.24, o.y + (o.h - 0.42) / 2, 0.42, o.glyph || "!", o.color);
  s.addText([
    { text: o.title + "  ", options: { bold: true, color: o.color } },
    { text: o.text, options: { color: SOFT } }
  ], {
    x: o.x + 0.82, y: o.y + 0.1, w: o.w - 1.06, h: o.h - 0.2,
    fontFace: BODY, fontSize: o.size || 12.5, valign: "middle", margin: 0,
    lineSpacing: (o.size || 12.5) * 1.36
  });
}

// grid de cards com titulo + descricao
function cardGrid(s, items, o) {
  const cols = o.cols, gap = o.gap ?? 0.26;
  const cw = (o.w - gap * (cols - 1)) / cols;
  items.forEach((it, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const x = o.x + c * (cw + gap), y = o.y + r * (o.h + (o.vgap ?? 0.26));
    const col = it.color || BLUE;
    card(s, { x, y, w: cw, h: o.h, fill: it.dim ? PANEL2 : PANEL, line: it.hi ? col : LINE });
    chip(s, x + 0.26, y + 0.26, 0.44, it.n ?? String(i + 1), col);
    s.addText(it.t, {
      x: x + 0.8, y: y + 0.24, w: cw - 1.02, h: 0.48, fontFace: BODY, fontSize: o.tSize || 13.5,
      bold: true, color: it.dim ? SOFT : TXT, margin: 0, valign: "middle"
    });
    if (it.d) s.addText(it.d, {
      x: x + 0.26, y: y + 0.84, w: cw - 0.52, h: o.h - 1.06, fontFace: BODY,
      fontSize: o.dSize || 11.5, color: it.dim ? FAINT : SOFT, margin: 0, valign: "top",
      lineSpacing: (o.dSize || 11.5) * 1.36
    });
  });
}

// passos numerados em coluna
function steps(s, items, o) {
  const h = o.h, gap = o.gap ?? 0.14;
  items.forEach((it, i) => {
    const y = o.y + i * (h + gap);
    card(s, { x: o.x, y, w: o.w, h, fill: i % 2 ? PANEL2 : PANEL });
    chip(s, o.x + 0.18, y + (h - 0.4) / 2, 0.4, String(i + 1), o.color || BLUE);
    s.addText(it, {
      x: o.x + 0.72, y, w: o.w - 0.94, h, fontFace: BODY, fontSize: o.size || 12.5,
      color: SOFT, valign: "middle", margin: 0, lineSpacing: (o.size || 12.5) * 1.3
    });
  });
}

const N = (s, t) => s.addNotes(t);

/* ════════════════ BLOCO 0 — ABERTURA ════════════════ */

// 1 — Capa
{
  const s = S();
  s.addShape(pres.ShapeType.ellipse, {
    x: 9.1, y: -1.7, w: 6.4, h: 6.4, fill: { color: BLUE, transparency: 92 }, line: { color: BG, width: 0 }
  });
  s.addShape(pres.ShapeType.ellipse, {
    x: 10.6, y: 3.4, w: 4.2, h: 4.2, fill: { color: VIOLET, transparency: 94 }, line: { color: BG, width: 0 }
  });
  s.addText("VECTONPLAN  ·  MARCHER BRASIL", {
    x: M, y: 2.05, w: 9, h: 0.3, fontFace: BODY, fontSize: 12, bold: true,
    color: BLUE, charSpacing: 3, margin: 0
  });
  s.addText("DRE Real e Headcount", {
    x: M, y: 2.5, w: 9.4, h: 0.95, fontFace: HEAD, fontSize: 47, bold: true, color: TXT, margin: 0
  });
  s.addText("Sistemática de carga e agregação", {
    x: M, y: 3.45, w: 9.4, h: 0.62, fontFace: HEAD, fontSize: 27, color: SOFT, margin: 0
  });
  s.addText("Handover de administração  ·  Julho / 2026", {
    x: M, y: 4.35, w: 9, h: 0.34, fontFace: BODY, fontSize: 14, color: FAINT, margin: 0
  });
  [["4", "cadastros"], ["2", "rotinas de carga"], ["5", "relatórios"]].forEach(([n, l], i) => {
    const x = M + i * 2.45;
    s.addText(n, { x, y: 5.15, w: 1.2, h: 0.66, fontFace: HEAD, fontSize: 40, bold: true, color: BLUE, margin: 0 });
    s.addText(l, { x, y: 5.83, w: 2.3, h: 0.3, fontFace: BODY, fontSize: 12, color: FAINT, margin: 0 });
  });
  N(s, "Enquadrar: esta apresentação é um manual de operação, não uma demo de produto. O objetivo é que quem assumir saiba diagnosticar problemas novos, não apenas repetir cliques.");
}

// 2 — O que está sendo entregue
{
  const s = S();
  const y = header(s, "Bloco 0 · Abertura", 2, "O que está sendo entregue",
    "Duas rotinas de carga que alimentam cinco relatórios e o Dashboard");
  cardGrid(s, [
    { n: "1", t: "Cadastros", color: CYAN, d: "Empresas · Plano de Contas · Centros de Custo · Gestões.\n\nDefinem as chaves válidas. Sem eles, nenhuma carga entra." },
    { n: "2", t: "Cargas", color: BLUE, hi: true, d: "Realizado (DRE) e Headcount.\n\nO arquivo do ERP/RH vira lote, é validado e só então vira lançamento oficial." },
    { n: "3", t: "Relatórios", color: VIOLET, d: "DRE Societário · Gerencial · DFs · OPEX · Headcount, mais os cards do Dashboard." }
  ], { x: M, y, w: CW, h: 2.72, cols: 3 });
  callout(s, {
    x: M, y: y + 3.05, w: CW, h: 0.86, color: AMBER, glyph: "!",
    title: "Regra que vale para o deck inteiro:",
    text: "erro de carga quase sempre é erro de cadastro. O arquivo costuma estar certo — falta a chave do outro lado."
  });
  N(s, "Deixar claro desde já que erro de carga quase sempre é erro de cadastro. Esse é o fio condutor de toda a apresentação.");
}

/* ════════════════ BLOCO 1 — MODELO MENTAL ════════════════ */

// 3 — A espinha dorsal
{
  const s = S();
  const y = header(s, "Bloco 1 · Modelo mental", 3, "A espinha dorsal",
    "O número do relatório é montado em 6 etapas — saber em qual delas o problema está resolve 90% dos casos");
  const items = [
    { t: "Cadastro", d: "define as chaves válidas", c: CYAN },
    { t: "Lote", d: "o arquivo entra como rascunho", c: BLUE },
    { t: "Validação", d: "amarra a chave ao ID", c: BLUE },
    { t: "Ledger", d: "só o válido vira oficial", c: GREEN },
    { t: "Resumo", d: "pré-agrega conta × mês", c: GREEN },
    { t: "Estrutura", d: "árvore aplicada na leitura", c: VIOLET }
  ];
  const gap = 0.2, cw = (CW - gap * 5) / 6;
  items.forEach((it, i) => {
    const x = M + i * (cw + gap);
    card(s, { x, y: y + 0.35, w: cw, h: 2.95 });
    chip(s, x + (cw - 0.5) / 2, y + 0.58, 0.5, String(i + 1), it.c);
    s.addText(it.t, { x: x + 0.1, y: y + 1.2, w: cw - 0.2, h: 0.36, fontFace: BODY, fontSize: 13.5, bold: true, color: TXT, align: "center", margin: 0 });
    s.addText(it.d, { x: x + 0.12, y: y + 1.58, w: cw - 0.24, h: 1.6, fontFace: BODY, fontSize: 10.5, color: FAINT, align: "center", margin: 0, lineSpacing: 14 });
    if (i < 5) s.addText("›", { x: x + cw, y: y + 0.58, w: gap, h: 0.5, fontFace: BODY, fontSize: 17, color: LINE, align: "center", valign: "middle", margin: 0 });
  });
  callout(s, {
    x: M, y: 5.55, w: CW, h: 0.8, color: BLUE, glyph: "?",
    title: "Diagnóstico:",
    text: "antes de mexer em qualquer coisa, pergunte em qual das 6 etapas o número parou. Cada etapa tem uma tela e uma causa própria."
  });
  N(s, "Slide mais importante do deck. Reaproveitar este gráfico mentalmente nos blocos seguintes: quando aparecer um erro, localizar a etapa.");
}

// 4 — O lote é um rascunho
{
  const s = S();
  const y = header(s, "Bloco 1 · Modelo mental", 4, "Conceito 1 — o lote é um rascunho", "Importar ≠ publicar");
  const st = [
    { t: "draft", d: "criado, sem linhas ou incompleto", c: FAINT },
    { t: "error", d: "tem linha inválida — bloqueado", c: RED },
    { t: "ready", d: "tudo válido, aguardando aplicar", c: AMBER },
    { t: "applied", d: "virou lançamento oficial", c: GREEN }
  ];
  const gap = 0.42, cw = (CW - gap * 3) / 4;
  st.forEach((it, i) => {
    const x = M + i * (cw + gap);
    card(s, { x, y: y + 0.3, w: cw, h: 1.5, line: it.c });
    s.addText(it.t, { x, y: y + 0.48, w: cw, h: 0.42, fontFace: BODY, fontSize: 17, bold: true, color: it.c, align: "center", margin: 0 });
    s.addText(it.d, { x: x + 0.14, y: y + 0.94, w: cw - 0.28, h: 0.72, fontFace: BODY, fontSize: 11, color: SOFT, align: "center", margin: 0, lineSpacing: 14 });
    if (i < 3) s.addText("→", { x: x + cw, y: y + 0.3, w: gap, h: 1.5, fontFace: BODY, fontSize: 16, color: LINE, align: "center", valign: "middle", margin: 0 });
  });
  bullets(s, [
    "Enquanto não estiver aplicado, o lote não aparece em relatório nenhum — pode importar sem medo.",
    "O app tenta aplicar automaticamente logo após a importação; havendo erro, o lote para em error.",
    "Aplicar é reversível: excluir um lote aplicado remove os lançamentos que ele gerou."
  ], { x: M, y: y + 2.12, w: CW, h: 1.5, size: 14 });
  N(s, "Reforçar a tranquilidade: importar não estraga nada. O risco está em aplicar carga completa no período errado — isso vem no bloco 8.");
}

// 5 — Estrutura aplicada na leitura
{
  const s = S();
  const y = header(s, "Bloco 1 · Modelo mental", 5, "Conceito 2 — a estrutura é aplicada na leitura",
    "O ledger guarda conta, CC, valor e data. Ele não guarda 'linha do DRE' nem 'gestão'.");
  card(s, { x: M, y: y + 0.28, w: CW / 2 - 0.2, h: 1.5, fill: PANEL2 });
  s.addText("O que É gravado", { x: M + 0.26, y: y + 0.42, w: 4, h: 0.3, fontFace: BODY, fontSize: 12, bold: true, color: GREEN, margin: 0 });
  s.addText("conta · centro de custo · valor · data · histórico", { x: M + 0.26, y: y + 0.76, w: CW / 2 - 0.72, h: 0.6, fontFace: BODY, fontSize: 13, color: SOFT, margin: 0 });
  card(s, { x: M + CW / 2 + 0.2, y: y + 0.28, w: CW / 2 - 0.2, h: 1.5, fill: PANEL2 });
  s.addText("O que é RESOLVIDO na hora de abrir", { x: M + CW / 2 + 0.46, y: y + 0.42, w: 5, h: 0.3, fontFace: BODY, fontSize: 12, bold: true, color: VIOLET, margin: 0 });
  s.addText("linha do DRE (árvore) · gestão do CC · grupo do OPEX", { x: M + CW / 2 + 0.46, y: y + 0.76, w: CW / 2 - 0.72, h: 0.6, fontFace: BODY, fontSize: 13, color: SOFT, margin: 0 });
  callout(s, {
    x: M, y: y + 2.02, w: CW, h: 1.0, color: GREEN, glyph: "+",
    title: "Consequência boa:",
    text: "reorganizar a árvore de contas ou trocar a gestão de um CC reclassifica todo o histórico — sem recarregar nada."
  });
  callout(s, {
    x: M, y: y + 3.22, w: CW, h: 1.0, color: RED, glyph: "!",
    title: "Consequência perigosa:",
    text: "essa mudança é retroativa. Meses já fechados mudam de aparência na hora, sem aviso e sem registro."
  });
  N(s, "Este é o ponto que mais gera o comentário 'o relatório mudou sozinho'. Enfatizar bastante — volta no bloco 7.");
}

// 6 — Quem valida é o banco
{
  const s = S();
  const y = header(s, "Bloco 1 · Modelo mental", 6, "Conceito 3 — quem valida é o banco",
    "A tela mostra o erro, mas quem decide é o servidor");
  const cw = (CW - 0.5) / 2;
  card(s, { x: M, y: y + 0.3, w: cw, h: 2.5 });
  chip(s, M + 0.3, y + 0.55, 0.5, "1", BLUE);
  s.addText("Na gravação de cada linha", { x: M + 0.92, y: y + 0.55, w: cw - 1.2, h: 0.5, fontFace: BODY, fontSize: 14, bold: true, color: TXT, valign: "middle", margin: 0 });
  bullets(s, [
    "Um gatilho no banco confere a linha e resolve os IDs de conta, CC e empresa.",
    "O resultado (válida / erro + motivo) volta gravado na própria linha."
  ], { x: M + 0.3, y: y + 1.2, w: cw - 0.6, h: 1.5, size: 12.5 });
  card(s, { x: M + cw + 0.5, y: y + 0.3, w: cw, h: 2.5 });
  chip(s, M + cw + 0.8, y + 0.55, 0.5, "2", GREEN);
  s.addText("Por isso duas coisas são verdade", { x: M + cw + 1.42, y: y + 0.55, w: cw - 1.2, h: 0.5, fontFace: BODY, fontSize: 14, bold: true, color: TXT, valign: "middle", margin: 0 });
  bullets(s, [
    "\"Revalidar lote\" funciona: regrava as linhas e força nova conferência, já com o cadastro corrigido.",
    "Não existe forçar pela tela: o banco recusa aplicar lote com qualquer linha em erro."
  ], { x: M + cw + 0.8, y: y + 1.2, w: cw - 0.6, h: 1.5, size: 12.5 });
  callout(s, {
    x: M, y: y + 3.06, w: CW, h: 0.8, color: CYAN, glyph: "i",
    title: "Na prática:",
    text: "corrigir o cadastro sem revalidar não muda nada — o lote continua com o diagnóstico antigo gravado."
  });
  N(s, "Explicar que a validação do navegador é só um espelho para dar resposta rápida. A que vale é a do banco.");
}

/* ════════════════ BLOCO 2 — CADASTROS ════════════════ */

// 7 — Onde ficam os cadastros
{
  const s = S();
  const y = header(s, "Bloco 2 · Cadastros", 7, "Onde ficam os cadastros",
    "Tudo em Parâmetros — menu visível apenas para perfil admin");
  cardGrid(s, [
    { n: "A", t: "Empresas", color: CYAN, d: "Filiais que aparecem na coluna Empresa do arquivo." },
    { n: "B", t: "Plano de Contas", color: BLUE, d: "Árvore do DRE. Criar nó analítico é o que cria a conta." },
    { n: "C", t: "Gestões", color: VIOLET, d: "Nomeia as áreas. Não vincula CC — só exibe." },
    { n: "D", t: "Centro de Custos", color: AMBER, d: "Árvore por Tipo. Aqui se define a Gestão de cada CC." }
  ], { x: M, y, w: CW, h: 2.3, cols: 4 });
  callout(s, {
    x: M, y: y + 2.62, w: CW, h: 0.86, color: BLUE, glyph: "i",
    title: "No mesmo menu:",
    text: "Carga de Realizado e Carga de Planejado — as duas rotinas operacionais que vamos ver nos blocos 3 e 5."
  });
  N(s, "Mostrar o menu lateral expandido. Se o menu Parâmetros não aparece, o perfil não é admin — é a primeira coisa a checar num acesso novo.");
}

// 8 — Empresas
{
  const s = S();
  const y = header(s, "Bloco 2 · Cadastros", 8, "Empresas (filiais)",
    "O código da empresa tem que ter exatamente 2 dígitos");
  const cw = (CW - 0.5) / 2;
  card(s, { x: M, y: y + 0.3, w: cw, h: 2.4 });
  s.addText("Campos", { x: M + 0.3, y: y + 0.52, w: 3, h: 0.32, fontFace: BODY, fontSize: 12, bold: true, color: BLUE, charSpacing: 1.4, margin: 0 });
  bullets(s, [
    "Código — 2 dígitos, obrigatório (ex.: 01, 02)",
    "Nome da filial",
    "Observação — campo livre"
  ], { x: M + 0.3, y: y + 0.98, w: cw - 0.6, h: 1.3, size: 13 });
  card(s, { x: M + cw + 0.5, y: y + 0.3, w: cw, h: 2.4, fill: PANEL2 });
  s.addText("Por que importa", { x: M + cw + 0.8, y: y + 0.52, w: 3.5, h: 0.32, fontFace: BODY, fontSize: 12, bold: true, color: AMBER, charSpacing: 1.4, margin: 0 });
  bullets(s, [
    "É a coluna Empresa do arquivo de carga — obrigatória em toda linha.",
    "Empresa não cadastrada derruba a linha inteira em erro.",
    "Código com 1 ou 3 dígitos é recusado pelo banco."
  ], { x: M + cw + 0.8, y: y + 0.98, w: cw - 0.6, h: 1.3, size: 13 });
  N(s, "Cadastro mais simples dos quatro e o que menos dá problema — as filiais mudam pouco.");
}

// 9 — Plano de Contas
{
  const s = S();
  const y = header(s, "Bloco 2 · Cadastros", 9, "Plano de Contas",
    "Criar um nó Analítico na árvore é o que cria a conta contábil");
  const cw = (CW - 0.5) / 2;
  card(s, { x: M, y: y + 0.26, w: cw, h: 1.16, line: VIOLET });
  s.addText("Nó Sintético", { x: M + 0.28, y: y + 0.4, w: cw - 0.5, h: 0.32, fontFace: BODY, fontSize: 14, bold: true, color: VIOLET, margin: 0 });
  s.addText("Totalizador. Não recebe lançamento — soma os filhos.", { x: M + 0.28, y: y + 0.76, w: cw - 0.56, h: 0.5, fontFace: BODY, fontSize: 12, color: SOFT, margin: 0 });
  card(s, { x: M + cw + 0.5, y: y + 0.26, w: cw, h: 1.16, line: GREEN });
  s.addText("Nó Analítico", { x: M + cw + 0.78, y: y + 0.4, w: cw - 0.5, h: 0.32, fontFace: BODY, fontSize: 14, bold: true, color: GREEN, margin: 0 });
  s.addText("Folha. Recebe lançamento e existe como conta no cadastro.", { x: M + cw + 0.78, y: y + 0.76, w: cw - 0.56, h: 0.5, fontFace: BODY, fontSize: 12, color: SOFT, margin: 0 });
  bullets(s, [
    "Ao salvar um nó Analítico, o app grava duas coisas de uma vez: a conta no cadastro e o nó na árvore, já vinculados.",
    "O código do nó É o número da conta — não são campos independentes.",
    "Excluir um nó exclui também a conta correspondente."
  ], { x: M, y: y + 1.66, w: CW, h: 1.35, size: 13.5 });
  callout(s, {
    x: M, y: y + 3.06, w: CW, h: 0.96, color: RED, glyph: "!",
    title: "Trava no banco:",
    text: "nó analítico ativo sem conta vinculada — ou com número diferente do código do nó — é recusado. Criada depois de um incidente real em que ~90 contas existiam na árvore e nunca tinham sido criadas no cadastro."
  });
  N(s, "Explicar que essa trava é uma cicatriz de incidente. Antes dela, a árvore e o cadastro podiam divergir em silêncio, e a carga falhava com 'Conta não cadastrada' numa conta que estava visível na tela.");
}

// 10 — Centro de Custos
{
  const s = S();
  const y = header(s, "Bloco 2 · Cadastros", 10, "Centro de Custos",
    "O CC vive na árvore por Tipo; a Gestão é um atributo dele");
  s.addText("TIPO — define a posição na árvore", { x: M, y: y + 0.24, w: 6, h: 0.3, fontFace: BODY, fontSize: 11.5, bold: true, color: FAINT, charSpacing: 1.6, margin: 0 });
  ["MOD", "MOI", "ADM", "COM", "ENG"].forEach((t, i) => {
    const x = M + i * 1.34;
    card(s, { x, y: y + 0.62, w: 1.16, h: 0.6, fill: PANEL2 });
    s.addText(t, { x, y: y + 0.62, w: 1.16, h: 0.6, fontFace: BODY, fontSize: 14, bold: true, color: CYAN, align: "center", valign: "middle", margin: 0 });
  });
  card(s, { x: M + 7.1, y: y + 0.22, w: CW - 7.1, h: 1.36, line: AMBER });
  s.addText("GESTÃO — define o agrupamento nos relatórios", { x: M + 7.34, y: y + 0.38, w: CW - 7.6, h: 0.3, fontFace: BODY, fontSize: 11.5, bold: true, color: AMBER, charSpacing: 1.2, margin: 0 });
  s.addText("Editável somente em nó Analítico. É o campo de maior alcance do sistema — bloco 7.", { x: M + 7.34, y: y + 0.74, w: CW - 7.62, h: 0.68, fontFace: BODY, fontSize: 12, color: SOFT, margin: 0, lineSpacing: 15 });
  bullets(s, [
    "Salvar grava o CC no cadastro com número, nome, tipo e gestão.",
    "Trocar o Tipo move o CC de lugar na árvore; trocar a Gestão muda como ele soma nos relatórios. São coisas diferentes.",
    "CC sem gestão preenchida cai em \"Sem área\" no Headcount e fica fora dos filtros por gestão do OPEX."
  ], { x: M, y: y + 1.76, w: CW, h: 1.5, size: 13.5 });
  N(s, "Ponto de confusão frequente: Tipo e Gestão parecem redundantes mas servem a coisas diferentes. Tipo = estrutura contábil. Gestão = responsabilidade gerencial.");
}

// 11 — Gestões
{
  const s = S();
  const y = header(s, "Bloco 2 · Cadastros", 11, "Gestões",
    "A tela de Gestões nomeia as áreas. A amarração é feita na tela de Centros de Custo.");
  const cw = (CW - 0.5) / 2;
  card(s, { x: M, y: y + 0.28, w: cw, h: 2.32 });
  s.addText("O que a tela faz", { x: M + 0.3, y: y + 0.5, w: 4, h: 0.32, fontFace: BODY, fontSize: 12, bold: true, color: GREEN, charSpacing: 1.4, margin: 0 });
  bullets(s, [
    "Criar, renomear e excluir gestão.",
    "Expandir mostra os CCs vinculados — somente leitura.",
    "Renomear faz cascata nos CCs que usavam o nome antigo."
  ], { x: M + 0.3, y: y + 0.94, w: cw - 0.6, h: 1.3, size: 12.5 });
  card(s, { x: M + cw + 0.5, y: y + 0.28, w: cw, h: 2.32, fill: PANEL2 });
  s.addText("Para vincular um CC", { x: M + cw + 0.8, y: y + 0.5, w: 4, h: 0.32, fontFace: BODY, fontSize: 12, bold: true, color: AMBER, charSpacing: 1.4, margin: 0 });
  s.addText("Parâmetros → Centro de Custos → selecionar o nó Analítico → campo Gestão → Salvar.", {
    x: M + cw + 0.8, y: y + 0.94, w: cw - 0.6, h: 0.8, fontFace: BODY, fontSize: 13, color: TXT, margin: 0, lineSpacing: 17
  });
  s.addText("Excluir uma gestão não apaga CC: os vinculados ficam sem gestão e caem em \"Sem área\".", {
    x: M + cw + 0.8, y: y + 1.8, w: cw - 0.6, h: 0.6, fontFace: BODY, fontSize: 12, color: SOFT, margin: 0, lineSpacing: 15
  });
  callout(s, {
    x: M, y: y + 2.94, w: CW, h: 0.86, color: GREEN, glyph: "+",
    title: "Desde 31/07/2026:",
    text: "gestão criada aqui fica imediatamente disponível no dropdown do cadastro de CC. Antes a lista era fixa e a gestão nova não podia ser vinculada."
  });
  N(s, "Se alguém tiver usado o sistema antes dessa data, pode ter memória de que 'não dava para criar gestão nova'. Agora dá.");
}

/* ════════════════ BLOCO 3 — CARGA DO DRE REALIZADO ════════════════ */

// 12 — Onde e o que
{
  const s = S();
  const y = header(s, "Bloco 3 · Carga do DRE Realizado", 12, "O catálogo de carga",
    "Parâmetros → Carga de Realizado → card DRE");
  cardGrid(s, [
    { n: "✓", t: "DRE", color: BLUE, hi: true, d: "Ativo. É o objeto deste bloco." },
    { n: "—", t: "Balanço Patrimonial", color: FAINT, dim: true, d: "Em breve — sem modelo de dados." },
    { n: "—", t: "Fluxo de Caixa", color: FAINT, dim: true, d: "Em breve — sem modelo de dados." },
    { n: "→", t: "Volumes de Vendas", color: CYAN, d: "Atalho para o módulo Comercial." },
    { n: "→", t: "Headcount", color: VIOLET, d: "Atalho para o módulo de HC — bloco 5." }
  ], { x: M, y, w: CW, h: 2.16, cols: 5, tSize: 12, dSize: 10.5 });
  callout(s, {
    x: M, y: y + 2.48, w: CW, h: 0.86, color: FAINT, glyph: "i",
    title: "Leitura do catálogo:",
    text: "os dois cards cinzas são roadmap, não bug. Os dois com seta apenas levam a outra tela — a carga acontece lá."
  });
  N(s, "Evitar que a pessoa tente clicar em Balanço/Fluxo achando que está quebrado.");
}

// 13 — Duas decisões antes do arquivo
{
  const s = S();
  const y = header(s, "Bloco 3 · Carga do DRE Realizado", 13, "Antes de importar: duas decisões",
    "Período e modo de carga são definidos antes de escolher o arquivo");
  const cw = (CW - 0.5) / 2;
  card(s, { x: M, y: y + 0.28, w: cw, h: 1.1, fill: PANEL2 });
  chip(s, M + 0.26, y + 0.53, 0.6, "1", BLUE);
  s.addText([{ text: "Período\n", options: { bold: true, color: TXT, fontSize: 14 } },
             { text: "vem do seletor do app; o lote nasce carimbado com esse mês/ano", options: { color: SOFT, fontSize: 12 } }],
    { x: M + 1.0, y: y + 0.28, w: cw - 1.24, h: 1.1, fontFace: BODY, valign: "middle", margin: 0, lineSpacing: 16 });
  card(s, { x: M + cw + 0.5, y: y + 0.28, w: cw, h: 1.1, fill: PANEL2 });
  chip(s, M + cw + 0.76, y + 0.53, 0.6, "2", BLUE);
  s.addText([{ text: "Modo de carga\n", options: { bold: true, color: TXT, fontSize: 14 } },
             { text: "define o que acontece com o que já existe no período", options: { color: SOFT, fontSize: 12 } }],
    { x: M + cw + 1.5, y: y + 0.28, w: cw - 1.24, h: 1.1, fontFace: BODY, valign: "middle", margin: 0, lineSpacing: 16 });
  card(s, { x: M, y: y + 1.6, w: cw, h: 1.72, line: RED });
  s.addText("Carga completa", { x: M + 0.28, y: y + 1.78, w: cw - 0.5, h: 0.34, fontFace: BODY, fontSize: 15, bold: true, color: RED, margin: 0 });
  s.addText("Apaga o realizado inteiro daquela competência e substitui pelo lote. Pede confirmação.", { x: M + 0.28, y: y + 2.16, w: cw - 0.56, h: 0.66, fontFace: BODY, fontSize: 12.5, color: SOFT, margin: 0, lineSpacing: 16 });
  s.addText("Use no fechamento do mês.", { x: M + 0.28, y: y + 2.84, w: cw - 0.56, h: 0.3, fontFace: BODY, fontSize: 12, bold: true, color: TXT, margin: 0 });
  card(s, { x: M + cw + 0.5, y: y + 1.6, w: cw, h: 1.72, line: GREEN });
  s.addText("Carga adicional", { x: M + cw + 0.78, y: y + 1.78, w: cw - 0.5, h: 0.34, fontFace: BODY, fontSize: 15, bold: true, color: GREEN, margin: 0 });
  s.addText("Convive com o que já existe. Só substitui as linhas do próprio lote.", { x: M + cw + 0.78, y: y + 2.16, w: cw - 0.56, h: 0.66, fontFace: BODY, fontSize: 12.5, color: SOFT, margin: 0, lineSpacing: 16 });
  s.addText("Use para ajuste pontual.", { x: M + cw + 0.78, y: y + 2.84, w: cw - 0.56, h: 0.3, fontFace: BODY, fontSize: 12, bold: true, color: TXT, margin: 0 });
  N(s, "Regra prática: fechamento do mês = completa; ajuste pontual = adicional. O risco da completa com período errado volta no slide 36.");
}

// 14 — O arquivo
{
  const s = S();
  const y = header(s, "Bloco 3 · Carga do DRE Realizado", 14, "O arquivo",
    "Use o botão Modelo. O leitor aceita variações de nome de coluna, mas não colunas faltando.");
  tableOf(s, ["Campo no sistema", "Coluna no arquivo", "Obrigatória"], [
    ["Data", "Data", "Sim"],
    ["Conta", "Conta", "Sim"],
    ["Empresa", "Empresa · Filial · Filial de Origem", "Sim"],
    ["Valor", "Valor", "Sim"],
    ["Centro de Custos", "Centro de Custos · C. Custo · CC", "Não"],
    ["Histórico", "Histórico", "Não"],
    ["Lote", "Lote · Lote Sub Doc Linha", "Não"]
  ], { x: M, y: y + 0.22, w: 7.8, colW: [2.2, 4.1, 1.5], rowH: 0.38 });
  card(s, { x: M + 8.1, y: y + 0.22, w: CW - 8.1, h: 3.04, fill: PANEL2 });
  s.addText("Detalhes que pegam", { x: M + 8.34, y: y + 0.4, w: 3.4, h: 0.3, fontFace: BODY, fontSize: 12, bold: true, color: AMBER, charSpacing: 1.2, margin: 0 });
  bullets(s, [
    "Só a primeira aba é lida.",
    "Nomes de coluna são normalizados: sem acento, sem espaço, minúsculo.",
    "CSV aceita ; ou ,",
    "Limites: ~50 MB Excel, ~80 MB texto."
  ], { x: M + 8.34, y: y + 0.8, w: CW - 8.6, h: 1.9, size: 11.5 });
  N(s, "Se a planilha vier com a aba de dados em segundo lugar, a importação lê a aba errada e reclama de colunas ausentes. Checar isso primeiro quando o erro for 'colunas obrigatórias ausentes'.");
}

// 15 — O que acontece ao importar
{
  const s = S();
  const y = header(s, "Bloco 3 · Carga do DRE Realizado", 15, "O que acontece ao clicar em Importar",
    "Um clique percorre o caminho todo, se estiver tudo certo");
  steps(s, [
    "Lê o arquivo no navegador.",
    "Cria o lote com status rascunho.",
    "Normaliza cada linha — conta, CC e empresa viram só dígitos; o valor aceita formato brasileiro.",
    "Grava as linhas em blocos de 200; cada bloco é validado pelo banco na gravação.",
    "O banco recalcula os contadores do lote e define o status.",
    "Não havendo erro, aplica automaticamente."
  ], { x: M, y: y + 0.24, w: CW, h: 0.56, gap: 0.12 });
  callout(s, {
    x: M, y: y + 4.36, w: CW, h: 0.66, color: CYAN, glyph: "i",
    title: "Barra de progresso:",
    text: "em arquivos grandes a tela informa \"bloco N de M\" — é a gravação em lotes de 200 do passo 4."
  });
  N(s, "A normalização do passo 3 explica por que conta com ponto ou traço no arquivo funciona: o sistema tira tudo que não é dígito dos dois lados da comparação.");
}

// 16 — As regras de validação
{
  const s = S();
  const y = header(s, "Bloco 3 · Carga do DRE Realizado", 16, "O que a validação confere",
    "Decorar estas regras é decorar o troubleshooting inteiro");
  tableOf(s, ["Mensagem de erro", "O que significa"], [
    ["Data obrigatória", "célula vazia ou em formato ilegível"],
    ["Data fora da competência do lote", "mês/ano da linha diferente do período do lote"],
    ["Empresa obrigatória / não cadastrada", "falta a empresa, ou o código não existe em Empresas"],
    ["Conta obrigatória / não cadastrada", "falta a conta, ou ela não existe no Plano de Contas"],
    ["Centro de custos não cadastrado", "CC preenchido mas inexistente — CC vazio é aceito"],
    ["Valor obrigatório", "valor não numérico"]
  ], { x: M, y: y + 0.24, w: CW, colW: [4.9, 7.13], rowH: 0.44, size: 12.5 });
  callout(s, {
    x: M, y: 5.55, w: CW, h: 0.9, color: AMBER, glyph: "!",
    title: "Repare na exceção:",
    text: "CC em branco passa na validação. O lançamento entra no DRE normalmente, mas fica fora do OPEX por gestão e do custo do Headcount — some do rateio sem gerar erro."
  });
  N(s, "Essa exceção do CC vazio é sutil e importante: não gera erro nenhum, mas distorce OPEX e Headcount. Vale conferir se o extrato do ERP traz CC em todas as linhas de despesa.");
}

// 17 — O que a aplicação faz
{
  const s = S();
  const y = header(s, "Bloco 3 · Carga do DRE Realizado", 17, "O que a aplicação faz no banco",
    "Operação única, transacional e com permissão verificada");
  steps(s, [
    "Confere se o usuário tem permissão de edição na organização.",
    "Recusa lote vazio ou com qualquer linha em erro.",
    "Apaga o alvo — a competência inteira se for completa, só o lote se for adicional.",
    "Insere os lançamentos oficiais.",
    "Recalcula a tabela-resumo conta × mês daquele mês.",
    "Marca o lote como aplicado, com autor e horário."
  ], { x: M, y: y + 0.24, w: CW, h: 0.56, gap: 0.12, color: GREEN });
  callout(s, {
    x: M, y: y + 4.36, w: CW, h: 0.66, color: GREEN, glyph: "+",
    title: "Tudo ou nada:",
    text: "se qualquer passo falhar, nada é gravado — não existe estado intermediário de meia-carga aplicada."
  });
  N(s, "O passo 5 é o que faz o relatório abrir rápido — próximo slide.");
}

// 18 — Por que o relatório abre rápido
{
  const s = S();
  const y = header(s, "Bloco 3 · Carga do DRE Realizado", 18, "Por que o relatório abre rápido",
    "O relatório não lê lançamento a lançamento");
  const cw = (CW - 0.5) / 2;
  card(s, { x: M, y: y + 0.3, w: cw, h: 2.1, fill: PANEL2 });
  s.addText("MILHARES", { x: M, y: y + 0.55, w: cw, h: 0.6, fontFace: HEAD, fontSize: 33, bold: true, color: FAINT, align: "center", margin: 0 });
  s.addText("de lançamentos no ledger", { x: M, y: y + 1.18, w: cw, h: 0.3, fontFace: BODY, fontSize: 12.5, color: SOFT, align: "center", margin: 0 });
  s.addText("lido só no drilldown, no OPEX e no Headcount — onde o CC é necessário", { x: M + 0.4, y: y + 1.55, w: cw - 0.8, h: 0.5, fontFace: BODY, fontSize: 11, color: FAINT, align: "center", margin: 0, lineSpacing: 14 });
  card(s, { x: M + cw + 0.5, y: y + 0.3, w: cw, h: 2.1, line: BLUE });
  s.addText("CENTENAS", { x: M + cw + 0.5, y: y + 0.55, w: cw, h: 0.6, fontFace: HEAD, fontSize: 33, bold: true, color: BLUE, align: "center", margin: 0 });
  s.addText("de linhas na tabela-resumo", { x: M + cw + 0.5, y: y + 1.18, w: cw, h: 0.3, fontFace: BODY, fontSize: 12.5, color: TXT, align: "center", margin: 0 });
  s.addText("uma linha por conta e mês — é o que os DREs realmente leem", { x: M + cw + 0.9, y: y + 1.55, w: cw - 0.8, h: 0.5, fontFace: BODY, fontSize: 11, color: SOFT, align: "center", margin: 0, lineSpacing: 14 });
  bullets(s, [
    "A tabela-resumo é recalculada a cada aplicação de lote — nunca fica velha.",
    "Depois de aplicar, o cache do ano é limpo: o relatório já abre atualizado, sem precisar recarregar a página."
  ], { x: M, y: y + 2.72, w: CW, h: 1.1, size: 13.5 });
  N(s, "Se alguém perguntar por que o OPEX demora mais que o DRE: é exatamente isso — OPEX precisa do CC, que só existe no ledger detalhado.");
}

/* ════════════════ BLOCO 4 — ERROS E CORREÇÃO ════════════════ */

// 19 — Como o erro aparece
{
  const s = S();
  const y = header(s, "Bloco 4 · Erros e correção", 19, "Como o erro aparece",
    "O app não esconde erro — ele bloqueia a aplicação");
  cardGrid(s, [
    { n: "1", t: "No cabeçalho", color: RED, d: "Contadores Linhas · Válidas · Erros · Status. É o primeiro lugar a olhar." },
    { n: "2", t: "Na linha", color: AMBER, d: "Badge vermelho clicável abre o popover com o diagnóstico daquela linha." },
    { n: "3", t: "No botão", color: FAINT, d: "\"Aplicar lote\" fica desabilitado enquanto houver qualquer erro." },
    { n: "4", t: "Revalidar", color: GREEN, d: "Botão \"Revalidar lote\" só aparece quando existe erro a corrigir." }
  ], { x: M, y, w: CW, h: 2.4, cols: 4 });
  callout(s, {
    x: M, y: y + 2.72, w: CW, h: 0.82, color: CYAN, glyph: "i",
    title: "Para achar as linhas:",
    text: "a busca do lote filtra por conta, CC, histórico e número do lote — útil quando são poucas linhas ruins em milhares."
  });
  N(s, "Mostrar o print do lote em erro apontando os três lugares.");
}

// 20 — O ciclo de correção
{
  const s = S();
  const y = header(s, "Bloco 4 · Erros e correção", 20, "O ciclo de correção",
    "Corrigir cadastro → revalidar → aplicar. Nunca apagar o lote e recomeçar.");
  steps(s, [
    "Abrir o lote e clicar no badge de erro para ler o diagnóstico.",
    "Ir ao cadastro correspondente e criar ou corrigir a chave que falta.",
    "Voltar em Carga de Realizado e clicar em Revalidar lote.",
    "Conferir que Erros = 0 e o status virou pronto.",
    "Aplicar lote."
  ], { x: M, y: y + 0.3, w: CW, h: 0.62, gap: 0.16 });
  callout(s, {
    x: M, y: y + 4.24, w: CW, h: 0.8, color: BLUE, glyph: "i",
    title: "Atalho:",
    text: "o botão ↻ em cada linha revalida só aquela linha — útil para corrigir um caso isolado sem reprocessar o lote inteiro."
  });
  N(s, "Insistir: refazer a importação do zero é desperdício e gera lote duplicado. O ciclo revalidar preserva as correções manuais já feitas na grade.");
}

// 21 — Receita por tipo de erro
{
  const s = S();
  const y = header(s, "Bloco 4 · Erros e correção", 21, "Receita por tipo de erro",
    "Cada mensagem tem um destino de cadastro");
  tableOf(s, ["Mensagem", "Onde ir", "O que fazer"], [
    ["Conta não cadastrada", "Plano de Contas", "criar nó Analítico com o código idêntico ao do arquivo, no pai correto"],
    ["Centro de custos não cadastrado", "Centro de Custos", "criar nó Analítico sob o Tipo certo e escolher a Gestão"],
    ["Empresa não cadastrada", "Empresas", "criar a filial com código de 2 dígitos"],
    ["Data fora da competência", "— (não é cadastro)", "o período do lote está errado, ou o extrato veio com datas de outro mês"],
    ["Valor obrigatório", "— (é o arquivo)", "célula em texto ou vazia; corrigir na grade ou no arquivo"]
  ], { x: M, y: y + 0.24, w: CW, colW: [3.5, 2.5, 6.03], rowH: 0.51, size: 11.5 });
  callout(s, {
    x: M, y: 5.55, w: CW, h: 0.92, color: AMBER, glyph: "!",
    title: "Ao criar conta nova, lembre do slide 33:",
    text: "ela entra sozinha no DRE Societário, mas não no Gerencial, DFs, OPEX nem no custo do Headcount."
  });
  N(s, "Esta é a tabela para imprimir e deixar colada na mesa. É o slide mais consultado depois que a apresentação acaba.");
}

// 22 — Edição e exclusão
{
  const s = S();
  const y = header(s, "Bloco 4 · Erros e correção", 22, "Edição e exclusão",
    "Dá para corrigir na própria grade, e dá para desfazer");
  cardGrid(s, [
    { n: "✎", t: "Editar na grade", color: BLUE, d: "Qualquer célula do lote é editável. Ao sair do campo, salva e revalida sozinha, com sinal visual de salvo ou de erro." },
    { n: "+", t: "Lançamento avulso", color: GREEN, d: "\"Adicionar lançamento\" e \"Novo lote manual\" cobrem ajustes que não valem um arquivo." },
    { n: "✕", t: "Excluir lote", color: RED, d: "Se já aplicado, o sistema desfaz a aplicação — remove os lançamentos e recalcula o resumo — antes de excluir. Tudo numa transação." }
  ], { x: M, y, w: CW, h: 2.5, cols: 3 });
  callout(s, {
    x: M, y: y + 2.82, w: CW, h: 0.82, color: CYAN, glyph: "i",
    title: "Rastreabilidade:",
    text: "lote, linha e lançamento têm trilha de auditoria no banco, com autor e horário de cada mudança."
  });
  N(s, "A auditoria existe no banco mas não tem tela. Se precisar investigar quem mudou o quê, é consulta direta no Supabase.");
}

/* ════════════════ BLOCO 5 — CARGA DE HEADCOUNT ════════════════ */

// 23 — Os três destinos
{
  const s = S();
  const y = header(s, "Bloco 5 · Carga de Headcount", 23, "Três destinos distintos",
    "É fácil errar o destino — e o erro só aparece depois, no relatório");
  cardGrid(s, [
    { n: "1", t: "Realizado", color: GREEN, d: "Quadro efetivo do mês. É o que alimenta o relatório de Headcount Realizado e o card do Dashboard." },
    { n: "2", t: "Orçado", color: AMBER, d: "Quadro planejado do orçamento anual. Alimenta o Headcount Planejado." },
    { n: "3", t: "Cenário", color: VIOLET, d: "Quadro de um cenário de forecast específico. Escolher o cenário no dropdown e clicar em Abrir." }
  ], { x: M, y, w: CW, h: 2.5, cols: 3 });
  callout(s, {
    x: M, y: y + 2.82, w: CW, h: 0.86, color: AMBER, glyph: "!",
    title: "Confira antes de importar:",
    text: "o destino escolhido fica carimbado no lote e aparece no topo da tela de carga. É ele que separa realizado de orçado nos relatórios."
  });
  N(s, "Entradas possíveis: Carga de Realizado → card Headcount, ou Carga de Planejado → Headcount. Os dois caminhos levam ao mesmo catálogo.");
}

// 24 — O arquivo de headcount
{
  const s = S();
  const y = header(s, "Bloco 5 · Carga de Headcount", 24, "O arquivo de Headcount",
    "Não existe coluna de valor — cada linha é uma pessoa");
  card(s, { x: M, y: y + 0.28, w: 4.5, h: 2.34, line: VIOLET });
  s.addText("1 linha", { x: M, y: y + 0.62, w: 4.5, h: 0.66, fontFace: HEAD, fontSize: 38, bold: true, color: VIOLET, align: "center", margin: 0 });
  s.addText("= 1 pessoa", { x: M, y: y + 1.3, w: 4.5, h: 0.4, fontFace: BODY, fontSize: 17, color: TXT, align: "center", margin: 0 });
  s.addText("O número do relatório é a contagem de linhas por CC e mês. Não há valor a somar.", { x: M + 0.42, y: y + 1.78, w: 3.66, h: 0.7, fontFace: BODY, fontSize: 11.5, color: SOFT, align: "center", margin: 0, lineSpacing: 15 });
  tableOf(s, ["Coluna", "Papel"], [
    ["Empresa", "filial do colaborador"],
    ["CC", "centro de custo — define a gestão no relatório"],
    ["Matrícula", "identidade da pessoa — ver slide 26"],
    ["Colaborador", "nome, aparece no drilldown"],
    ["Cargo", "aparece no drilldown"]
  ], { x: M + 4.9, y: y + 0.28, w: CW - 4.9, colW: [2.2, 4.93], rowH: 0.39, size: 12 });
  s.addText("Mesma lógica de período e de modo (completa × adicional) da carga de DRE. Botão Modelo disponível na tela.", {
    x: M, y: y + 2.86, w: CW, h: 0.4, fontFace: BODY, fontSize: 13, color: SOFT, margin: 0
  });
  N(s, "Pessoas sem CC não entram — CC é uma das três checagens obrigatórias.");
}

// 25 — Validação mais frouxa
{
  const s = S();
  const y = header(s, "Bloco 5 · Carga de Headcount", 25, "A validação aqui é mais frouxa",
    "O Headcount confere muito menos que o DRE — a responsabilidade é do operador");
  const cw = (CW - 0.5) / 2;
  card(s, { x: M, y: y + 0.28, w: cw, h: 2.5, line: GREEN });
  s.addText("DRE Realizado", { x: M + 0.3, y: y + 0.48, w: cw - 0.6, h: 0.34, fontFace: BODY, fontSize: 15, bold: true, color: GREEN, margin: 0 });
  s.addText("6 checagens no banco", { x: M + 0.3, y: y + 0.84, w: cw - 0.6, h: 0.34, fontFace: BODY, fontSize: 12.5, color: TXT, margin: 0 });
  bullets(s, [
    "Gatilho no servidor, impossível de contornar",
    "Confere existência de conta, CC e empresa",
    "Trilha de auditoria completa"
  ], { x: M + 0.3, y: y + 1.26, w: cw - 0.6, h: 1.4, size: 12 });
  card(s, { x: M + cw + 0.5, y: y + 0.28, w: cw, h: 2.5, line: RED });
  s.addText("Headcount", { x: M + cw + 0.8, y: y + 0.48, w: cw - 0.6, h: 0.34, fontFace: BODY, fontSize: 15, bold: true, color: RED, margin: 0 });
  s.addText("3 checagens no navegador", { x: M + cw + 0.8, y: y + 0.84, w: cw - 0.6, h: 0.34, fontFace: BODY, fontSize: 12.5, color: TXT, margin: 0 });
  bullets(s, [
    "CC preenchido · matrícula preenchida · nome preenchido",
    "NÃO confere se o CC existe no cadastro",
    "Sem gatilho de banco e sem tabela de auditoria"
  ], { x: M + cw + 0.8, y: y + 1.26, w: cw - 0.6, h: 1.4, size: 12 });
  callout(s, {
    x: M, y: y + 3.02, w: CW, h: 0.88, color: RED, glyph: "!",
    title: "O que isso custa:",
    text: "CC digitado errado entra sem reclamar e vai parar em \"Sem área\" no relatório. Confira o relatório logo após a carga, procurando essa seção."
  });
  N(s, "Este slide justifica o item de conferência do checklist do slide 35. É a diferença de maturidade entre os dois módulos.");
}

// 26 — Regra da matrícula
{
  const s = S();
  const y = header(s, "Bloco 5 · Carga de Headcount", 26, "A regra da matrícula",
    "1 matrícula = 1 pessoa por competência. Duplicata não soma: sobrescreve.");
  const rows = [
    { m: "10432", c: "CC 1101 — Produção", s: "vale", col: GREEN },
    { m: "10432", c: "CC 2205 — Manutenção", s: "vence (é a última)", col: AMBER },
    { m: "10877", c: "CC 1101 — Produção", s: "vale", col: GREEN }
  ];
  s.addText("No arquivo", { x: M, y: y + 0.22, w: 4, h: 0.3, fontFace: BODY, fontSize: 11.5, bold: true, color: FAINT, charSpacing: 1.6, margin: 0 });
  rows.forEach((r, i) => {
    const yy = y + 0.6 + i * 0.62;
    card(s, { x: M, y: yy, w: 7.4, h: 0.52, fill: i === 0 ? PANEL2 : PANEL });
    s.addText(r.m, { x: M + 0.24, y: yy, w: 1.2, h: 0.52, fontFace: BODY, fontSize: 13, bold: true, color: i === 0 ? FAINT : TXT, valign: "middle", margin: 0 });
    s.addText(r.c, { x: M + 1.5, y: yy, w: 3.4, h: 0.52, fontFace: BODY, fontSize: 12, color: SOFT, valign: "middle", margin: 0 });
    s.addText(r.s, { x: M + 5.0, y: yy, w: 2.2, h: 0.52, fontFace: BODY, fontSize: 11.5, bold: true, color: r.col, valign: "middle", align: "right", margin: 0 });
  });
  card(s, { x: M + 7.9, y: y + 0.6, w: CW - 7.9, h: 1.76, line: BLUE });
  s.addText("2", { x: M + 7.9, y: y + 0.8, w: CW - 7.9, h: 0.7, fontFace: HEAD, fontSize: 40, bold: true, color: BLUE, align: "center", margin: 0 });
  s.addText("pessoas no relatório\ne a 10432 conta no CC 2205", { x: M + 8.14, y: y + 1.5, w: CW - 8.38, h: 0.7, fontFace: BODY, fontSize: 11.5, color: SOFT, align: "center", margin: 0, lineSpacing: 15 });
  bullets(s, [
    "A deduplicação usa ano + mês + destino + matrícula. Se a matrícula repete, a última linha vence e a anterior é descartada em silêncio.",
    "Efeito prático: quem trocou de CC no meio do mês conta uma vez só, no CC da última linha do arquivo.",
    "Linhas sem matrícula são ignoradas na aplicação."
  ], { x: M, y: y + 2.62, w: CW, h: 1.4, size: 13 });
  N(s, "Este é o motivo número 1 de 'o número não bate com o RH'. Se o RH manda um extrato com movimentação, a mesma pessoa pode aparecer duas vezes.");
}

/* ════════════════ BLOCO 6 — AGREGAÇÃO DO HEADCOUNT ════════════════ */

// 27 — Duas fontes
{
  const s = S();
  const y = header(s, "Bloco 6 · Agregação do Headcount", 27, "O relatório cruza duas fontes",
    "Quadro e custo vêm de lugares diferentes — e podem divergir");
  const cw = 4.9;
  card(s, { x: M, y: y + 0.24, w: cw, h: 1.6, line: VIOLET });
  s.addText("Quadro (pessoas)", { x: M + 0.26, y: y + 0.42, w: cw - 0.5, h: 0.32, fontFace: BODY, fontSize: 14, bold: true, color: VIOLET, margin: 0 });
  s.addText("Contagem de linhas da carga de Headcount, por CC e mês.", { x: M + 0.26, y: y + 0.8, w: cw - 0.52, h: 0.66, fontFace: BODY, fontSize: 12, color: SOFT, margin: 0, lineSpacing: 15 });
  card(s, { x: M, y: y + 2.06, w: cw, h: 1.6, line: CYAN });
  s.addText("Custo", { x: M + 0.26, y: y + 2.24, w: cw - 0.5, h: 0.32, fontFace: BODY, fontSize: 14, bold: true, color: CYAN, margin: 0 });
  s.addText("Soma do ledger do DRE realizado por CC e mês, filtrado por uma lista de contas de pessoal.", { x: M + 0.26, y: y + 2.62, w: cw - 0.52, h: 0.8, fontFace: BODY, fontSize: 12, color: SOFT, margin: 0, lineSpacing: 15 });
  s.addText("›", { x: M + cw + 0.1, y: y + 1.4, w: 0.5, h: 0.9, fontFace: BODY, fontSize: 30, color: LINE, align: "center", valign: "middle", margin: 0 });
  card(s, { x: M + cw + 0.7, y: y + 0.9, w: CW - cw - 0.7, h: 1.9, line: BLUE });
  s.addText("Encontro pelo CC", { x: M + cw + 0.96, y: y + 1.12, w: 4, h: 0.34, fontFace: BODY, fontSize: 15, bold: true, color: BLUE, margin: 0 });
  s.addText("A chave do centro de custo é o único elo entre as duas fontes. Nada mais as liga.", { x: M + cw + 0.96, y: y + 1.52, w: CW - cw - 1.22, h: 0.66, fontFace: BODY, fontSize: 12.5, color: SOFT, margin: 0, lineSpacing: 16 });
  s.addText("Se as duas cargas não estiverem no mesmo mês, o custo por colaborador sai distorcido.", { x: M + cw + 0.96, y: y + 2.18, w: CW - cw - 1.22, h: 0.5, fontFace: BODY, fontSize: 12, bold: true, color: AMBER, margin: 0, lineSpacing: 15 });
  N(s, "Divergência clássica: carga de HC feita, carga de DRE do mesmo mês ainda não. O quadro aparece e o custo sai zerado ou parcial.");
}

// 28 — Como as linhas são agrupadas
{
  const s = S();
  const y = header(s, "Bloco 6 · Agregação do Headcount", 28, "Como as linhas são agrupadas",
    "A hierarquia é Gestão → Centro de Custo, e ela vem do cadastro de CC");
  const layers = [
    { t: "Marcher (total)", d: "linha de topo — soma tudo", c: BLUE, ind: 0 },
    { t: "Gestão", d: "seções, ordenadas por total de pessoas (maior primeiro)", c: VIOLET, ind: 0.5 },
    { t: "Centro de Custo", d: "dentro da seção, ordenados por número — clicável", c: CYAN, ind: 1.0 }
  ];
  layers.forEach((l, i) => {
    const yy = y + 0.26 + i * 0.86;
    card(s, { x: M + l.ind, y: yy, w: 7.6 - l.ind, h: 0.7, fill: PANEL, line: l.c });
    s.addText(l.t, { x: M + l.ind + 0.26, y: yy, w: 3, h: 0.7, fontFace: BODY, fontSize: 13.5, bold: true, color: l.c, valign: "middle", margin: 0 });
    s.addText(l.d, { x: M + l.ind + 2.7, y: yy, w: 4.6 - l.ind, h: 0.7, fontFace: BODY, fontSize: 11.5, color: SOFT, valign: "middle", margin: 0 });
  });
  card(s, { x: M + 8.1, y: y + 0.26, w: CW - 8.1, h: 2.3, fill: PANEL2, line: AMBER });
  s.addText("\"Sem área\"", { x: M + 8.34, y: y + 0.46, w: 3.4, h: 0.34, fontFace: BODY, fontSize: 15, bold: true, color: AMBER, margin: 0 });
  s.addText("Bucket para onde vai todo CC que:", { x: M + 8.34, y: y + 0.86, w: CW - 8.6, h: 0.3, fontFace: BODY, fontSize: 11.5, color: SOFT, margin: 0 });
  bullets(s, [
    "não tem gestão preenchida no cadastro, ou",
    "não existe no cadastro de CC"
  ], { x: M + 8.34, y: y + 1.22, w: CW - 8.6, h: 0.9, size: 11.5, color: TXT });
  s.addText("Seção inesperada aqui = erro de carga ou cadastro faltando.", { x: M + 8.34, y: y + 2.06, w: CW - 8.6, h: 0.4, fontFace: BODY, fontSize: 11, color: AMBER, margin: 0, lineSpacing: 14 });
  s.addText("Clicar na gestão expande e recolhe os centros de custo daquela seção.", {
    x: M, y: y + 3.0, w: 7.6, h: 0.4, fontFace: BODY, fontSize: 12.5, color: SOFT, margin: 0
  });
  N(s, "Mostrar o print do relatório com as três camadas anotadas.");
}

// 29 — Os dois modos
{
  const s = S();
  const y = header(s, "Bloco 6 · Agregação do Headcount", 29, "Os dois modos de leitura",
    "O mesmo relatório mostra duas grandezas — o toggle fica no topo");
  const cw = (CW - 0.5) / 2;
  card(s, { x: M, y: y + 0.3, w: cw, h: 2.5, line: VIOLET });
  s.addText("Quadro", { x: M + 0.3, y: y + 0.5, w: cw - 0.6, h: 0.4, fontFace: BODY, fontSize: 18, bold: true, color: VIOLET, margin: 0 });
  s.addText("Número de pessoas", { x: M + 0.3, y: y + 0.92, w: cw - 0.6, h: 0.32, fontFace: BODY, fontSize: 13, color: TXT, margin: 0 });
  bullets(s, [
    "Célula vazia significa zero pessoas naquele CC e mês.",
    "É o modo de conferência contra a folha do RH."
  ], { x: M + 0.3, y: y + 1.34, w: cw - 0.6, h: 1.2, size: 12.5 });
  card(s, { x: M + cw + 0.5, y: y + 0.3, w: cw, h: 2.5, line: CYAN });
  s.addText("Custo / colab", { x: M + cw + 0.8, y: y + 0.5, w: cw - 0.6, h: 0.4, fontFace: BODY, fontSize: 18, bold: true, color: CYAN, margin: 0 });
  s.addText("Custo de pessoal do CC ÷ nº de pessoas", { x: M + cw + 0.8, y: y + 0.92, w: cw - 0.6, h: 0.32, fontFace: BODY, fontSize: 13, color: TXT, margin: 0 });
  bullets(s, [
    "Arredondado. Mostra \"—\" quando não há pessoas ou o custo é zero.",
    "O custo é usado em módulo: no razão as despesas entram negativas."
  ], { x: M + cw + 0.8, y: y + 1.34, w: cw - 0.6, h: 1.2, size: 12.5 });
  callout(s, {
    x: M, y: y + 3.06, w: CW, h: 0.82, color: AMBER, glyph: "!",
    title: "Valor absurdo em custo/colab:",
    text: "quase sempre é carga de DRE e de Headcount em meses diferentes, ou CC trocado numa das duas."
  });
  N(s, "O toggle Quadro / Custo-colab fica no mesmo lugar onde o OPEX tem o seletor de gestão.");
}

// 30 — Drilldown
{
  const s = S();
  const y = header(s, "Bloco 6 · Agregação do Headcount", 30, "Drilldown e conferência",
    "Toda célula de CC com pessoas é clicável — é assim que se audita o número");
  const cw = (CW - 0.5) / 2;
  card(s, { x: M, y: y + 0.28, w: cw, h: 2.42 });
  s.addText("O que o clique abre", { x: M + 0.3, y: y + 0.48, w: 4, h: 0.32, fontFace: BODY, fontSize: 12, bold: true, color: BLUE, charSpacing: 1.4, margin: 0 });
  bullets(s, [
    "Lista de matrícula · colaborador · cargo daquele CC naquele mês.",
    "Botão Excel exporta a lista na ordem exibida.",
    "Perfis Gestor e Analista veem só os CCs da própria gestão; admin vê tudo."
  ], { x: M + 0.3, y: y + 0.9, w: cw - 0.6, h: 1.6, size: 12.5 });
  card(s, { x: M + cw + 0.5, y: y + 0.28, w: cw, h: 2.42, fill: PANEL2, line: GREEN });
  s.addText("Roteiro de conferência", { x: M + cw + 0.8, y: y + 0.48, w: 4, h: 0.32, fontFace: BODY, fontSize: 12, bold: true, color: GREEN, charSpacing: 1.4, margin: 0 });
  steps(s, [
    "Comparar o total do relatório com a folha do RH.",
    "Divergiu? Abrir a gestão e achar o CC suspeito.",
    "Clicar na célula e comparar nome a nome."
  ], { x: M + cw + 0.8, y: y + 0.92, w: cw - 0.6, h: 0.5, gap: 0.08, color: GREEN, size: 11.5 });
  N(s, "Na prática, a divergência quase sempre é matrícula duplicada (slide 26) ou CC fora do cadastro (slide 25).");
}

/* ════════════════ BLOCO 7 — CC ↔ GESTÃO ════════════════ */

// 31 — Um campo, cinco consequências
{
  const s = S();
  const y = header(s, "Bloco 7 · CC ↔ Gestão", 31, "Um campo, cinco consequências",
    "A Gestão do CC é o cadastro de maior alavancagem do sistema");
  cardGrid(s, [
    { n: "1", t: "Headcount", color: VIOLET, d: "Define as seções do relatório." },
    { n: "2", t: "OPEX", color: CYAN, d: "Filtro por gestão no Real e no Planejado." },
    { n: "3", t: "Dashboard", color: BLUE, d: "Donut de OPEX por gestão." },
    { n: "4", t: "Acesso", color: AMBER, d: "Gestor e Analista ficam travados nos CCs da própria gestão." },
    { n: "5", t: "Personalizados", color: GREEN, d: "Qualquer relatório do construtor que use CC." }
  ], { x: M, y, w: CW, h: 2.2, cols: 5, tSize: 12.5, dSize: 11 });
  callout(s, {
    x: M, y: y + 2.52, w: CW, h: 0.88, color: RED, glyph: "!",
    title: "Inclusive segurança:",
    text: "a consequência 4 não é cosmética. Mudar a gestão de um CC muda quem enxerga aquele dado — é uma decisão de acesso, não só de layout."
  });
  N(s, "Muita gente trata o campo Gestão como rótulo de relatório. Ele também é controle de acesso — por isso não se mexe sem avisar.");
}

// 32 — Ponto único de verdade
{
  const s = S();
  const y = header(s, "Bloco 7 · CC ↔ Gestão", 32, "Um único ponto de verdade",
    "Não existe outro lugar para amarrar CC a gestão");
  card(s, { x: M, y: y + 0.3, w: CW, h: 1.06, line: BLUE });
  s.addText("Parâmetros  →  Centro de Custos  →  nó Analítico  →  campo Gestão  →  Salvar", {
    x: M, y: y + 0.3, w: CW, h: 1.06, fontFace: BODY, fontSize: 17, bold: true, color: TXT,
    align: "center", valign: "middle", margin: 0
  });
  bullets(s, [
    "A tela Gestões só nomeia e exibe — o próprio app avisa isso na tela.",
    "O lançamento não guarda a gestão: ela é resolvida toda vez que o relatório é montado.",
    "Por isso, mudou a gestão de um CC, todo o histórico se reorganiza — sem recarregar nada."
  ], { x: M, y: y + 1.64, w: CW, h: 1.5, size: 14 });
  callout(s, {
    x: M, y: y + 3.2, w: CW, h: 0.82, color: AMBER, glyph: "!",
    title: "Antes de reorganizar áreas:",
    text: "avise quem usa os relatórios. Meses fechados vão mudar de aparência no mesmo instante, sem registro da mudança."
  });
  N(s, "Volta o conceito 2 do slide 5, agora com consequência prática de governança.");
}

// 33 — O que não é automático
{
  const s = S();
  const y = header(s, "Bloco 7 · CC ↔ Gestão", 33, "O que NÃO é automático",
    "Criar uma conta nova no Plano de Contas não a coloca em todos os relatórios");
  tableOf(s, ["Relatório", "Conta nova entra sozinha?", "Por quê"], [
    ["DRE Societário", "Sim", "é dirigido pela árvore do Plano de Contas"],
    ["Ledger e drilldown", "Sim", "leem o lançamento diretamente"],
    ["DRE Gerencial", "Não", "usa lista de contas fixa no código"],
    ["DRE DFs", "Não", "usa lista de contas fixa no código"],
    ["OPEX", "Não", "estrutura de grupos fixa no código"],
    ["Custo do Headcount", "Não", "lista de contas de pessoal fixa no código"]
  ], { x: M, y: y + 0.24, w: CW, colW: [3.6, 3.4, 5.03], rowH: 0.44, size: 12 });
  callout(s, {
    x: M, y: 5.55, w: CW, h: 0.94, color: RED, glyph: "!",
    title: "Sintoma típico:",
    text: "conta nova de pessoal aparece no Societário, mas o custo por colaborador do Headcount não muda. Toda conta nova relevante exige pedido de ajuste no código — registrar como item de backlog."
  });
  N(s, "Este é o principal débito técnico conhecido do módulo. Deixar registrado junto com o handover para não virar surpresa daqui a seis meses.");
}

/* ════════════════ BLOCO 8 — RUNBOOK E RISCOS ════════════════ */

// 34 — Runbook mensal
{
  const s = S();
  const y = header(s, "Bloco 8 · Runbook e riscos", 34, "Runbook do fechamento mensal",
    "A rotina inteira em nove passos");
  const cw = (CW - 0.5) / 2;
  s.addText("DRE REALIZADO", { x: M, y: y + 0.16, w: cw, h: 0.3, fontFace: BODY, fontSize: 11.5, bold: true, color: BLUE, charSpacing: 1.6, margin: 0 });
  steps(s, [
    "Ajustar o período para o mês de fechamento.",
    "Extrair o razão do ERP no layout do Modelo.",
    "Carga de Realizado → DRE → Carga completa → importar.",
    "Zero erros? Se não, ciclo de correção → revalidar → aplicar.",
    "Conferir o cabeçalho: status aplicado, Erros = 0."
  ], { x: M, y: y + 0.54, w: cw, h: 0.68, gap: 0.13 });
  s.addText("HEADCOUNT E CONFERÊNCIA", { x: M + cw + 0.5, y: y + 0.16, w: cw, h: 0.3, fontFace: BODY, fontSize: 11.5, bold: true, color: VIOLET, charSpacing: 1.6, margin: 0 });
  const s2 = ["Extrair o quadro de pessoal do RH no layout do Modelo.",
    "Carga de Realizado → Headcount → Realizado → completa.",
    "Abrir o relatório: total contra o RH e checar \"Sem área\".",
    "Validar DRE Societário e OPEX do mês contra o fechamento contábil."];
  s2.forEach((t, i) => {
    const yy = y + 0.54 + i * 0.81;
    card(s, { x: M + cw + 0.5, y: yy, w: cw, h: 0.68, fill: i % 2 ? PANEL2 : PANEL });
    chip(s, M + cw + 0.68, yy + 0.14, 0.4, String(i + 6), VIOLET);
    s.addText(t, { x: M + cw + 1.22, y: yy, w: cw - 1.44, h: 0.68, fontFace: BODY, fontSize: 12, color: SOFT, valign: "middle", margin: 0, lineSpacing: 15 });
  });
  N(s, "Este é o slide para imprimir. A ordem importa: DRE antes de Headcount, senão o custo por colaborador sai sem base.");
}

// 35 — Checklist de sanidade
{
  const s = S();
  const y = header(s, "Bloco 8 · Runbook e riscos", 35, "Checklist de sanidade pós-carga",
    "Cinco conferências rápidas que pegam quase todo problema");
  const items = [
    "Lote com status aplicado e Erros = 0.",
    "Total do DRE Societário do mês bate com o fechamento contábil.",
    "Nenhuma seção \"Sem área\" inesperada no relatório de Headcount.",
    "Total de pessoas bate com a folha do RH.",
    "Custo por colaborador dentro da faixa esperada."
  ];
  items.forEach((t, i) => {
    const yy = y + 0.24 + i * 0.76;
    card(s, { x: M, y: yy, w: CW, h: 0.62, fill: i % 2 ? PANEL2 : PANEL });
    s.addShape(pres.ShapeType.roundRect, {
      x: M + 0.24, y: yy + 0.14, w: 0.34, h: 0.34, rectRadius: 0.06,
      fill: { color: BG }, line: { color: GREEN, width: 1.4 }
    });
    s.addText(t, { x: M + 0.78, y: yy, w: CW - 1.0, h: 0.62, fontFace: BODY, fontSize: 13.5, color: SOFT, valign: "middle", margin: 0 });
  });
  s.addText("O último item é o mais sensível: valor absurdo indica carga de DRE e de Headcount em meses diferentes, ou CC trocado.", {
    x: M, y: y + 4.1, w: CW, h: 0.4, fontFace: BODY, fontSize: 12.5, color: FAINT, italic: true, margin: 0
  });
  N(s, "Cinco minutos de conferência evitam um mês inteiro de relatório errado circulando na diretoria.");
}

// 36 — O que nunca fazer
{
  const s = S();
  const y = header(s, "Bloco 8 · Runbook e riscos", 36, "O que nunca fazer",
    "Cinco ações de alto risco");
  const bad = [
    { t: "Carga completa com período errado", d: "Apaga o realizado inteiro de um mês já fechado." },
    { t: "Excluir CC ou conta com lançamento", d: "O banco impede, mas a tentativa gera confusão. Reclassifique em vez de excluir." },
    { t: "Trocar gestão de CC no fechamento", d: "Muda o histórico de todos os relatórios na hora, inclusive quem enxerga o quê." },
    { t: "Recarregar HC com matrícula duplicada", d: "Não soma — sobrescreve. A última linha vence." },
    { t: "Excluir lote aplicado sem saber", d: "Isso remove os lançamentos que ele gerou." }
  ];
  const gap = 0.24, cwd = (CW - gap * 2) / 3;
  bad.forEach((b, i) => {
    const r = Math.floor(i / 3), c = i % 3;
    const x = M + c * (cwd + gap), yy = y + 0.24 + r * 1.72;
    card(s, { x, y: yy, w: cwd, h: 1.52, fill: PANEL2, line: RED });
    chip(s, x + 0.24, yy + 0.24, 0.4, "✕", RED);
    s.addText(b.t, { x: x + 0.74, y: yy + 0.18, w: cwd - 0.96, h: 0.52, fontFace: BODY, fontSize: 12.5, bold: true, color: TXT, valign: "middle", margin: 0, lineSpacing: 15 });
    s.addText(b.d, { x: x + 0.24, y: yy + 0.78, w: cwd - 0.48, h: 0.62, fontFace: BODY, fontSize: 11, color: SOFT, margin: 0, lineSpacing: 14 });
  });
  N(s, "Fechar o bloco com tom prático, não alarmista: nenhuma dessas é irreversível, mas todas custam tempo e credibilidade.");
}

// 37 — Encerramento
{
  const s = S();
  s.addShape(pres.ShapeType.ellipse, {
    x: -1.9, y: 3.9, w: 5.6, h: 5.6, fill: { color: BLUE, transparency: 93 }, line: { color: BG, width: 0 }
  });
  s.addText("ENCERRAMENTO", { x: M, y: 0.7, w: 8, h: 0.3, fontFace: BODY, fontSize: 11.5, bold: true, color: BLUE, charSpacing: 2.4, margin: 0 });
  s.addText("O que fica documentado", { x: M, y: 1.1, w: 9, h: 0.7, fontFace: HEAD, fontSize: 33, bold: true, color: TXT, margin: 0 });
  const cw = (CW - 0.5) / 2;
  card(s, { x: M, y: 2.1, w: cw, h: 2.15 });
  s.addText("Para operar", { x: M + 0.3, y: 2.3, w: 4, h: 0.32, fontFace: BODY, fontSize: 12, bold: true, color: GREEN, charSpacing: 1.4, margin: 0 });
  bullets(s, [
    "Modelos de carga: botão Modelo em cada tela.",
    "Perfil necessário: admin — Parâmetros só aparece para admin.",
    "Slides 21, 34 e 35 são os de consulta diária."
  ], { x: M + 0.3, y: 2.72, w: cw - 0.6, h: 1.3, size: 12.5 });
  card(s, { x: M + cw + 0.5, y: 2.1, w: cw, h: 2.15, fill: PANEL2, line: AMBER });
  s.addText("Débitos a acompanhar", { x: M + cw + 0.8, y: 2.3, w: 4, h: 0.32, fontFace: BODY, fontSize: 12, bold: true, color: AMBER, charSpacing: 1.4, margin: 0 });
  bullets(s, [
    "Listas de contas fixas no código — slide 33.",
    "Validação de Headcount mais frouxa que a do DRE — slide 25.",
    "Auditoria existe no banco, mas não tem tela."
  ], { x: M + cw + 0.8, y: 2.72, w: cw - 0.6, h: 1.3, size: 12.5 });
  card(s, { x: M, y: 4.55, w: CW, h: 1.0, line: BLUE });
  s.addText([
    { text: "Ao reportar um problema, envie:  ", options: { bold: true, color: TXT } },
    { text: "print do erro  ·  identificação do lote  ·  mês de competência  ·  o que já foi tentado", options: { color: SOFT } }
  ], { x: M + 0.3, y: 4.55, w: CW - 0.6, h: 1.0, fontFace: BODY, fontSize: 14, valign: "middle", margin: 0 });
  s.addText("VectonPlan  ·  vecton.marcher.com.br", { x: M, y: 5.9, w: CW, h: 0.34, fontFace: BODY, fontSize: 11.5, color: FAINT, margin: 0 });
  N(s, "Fechar reforçando que o roteiro em markdown fica no repositório, em docs/, e pode ser atualizado quando o sistema mudar.");
}

const OUT = process.argv[2] || "deck.pptx";
pres.writeFile({ fileName: OUT }).then(() => console.log("OK:", OUT));
