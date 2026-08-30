// Deck 1 — "A3 Estratégico: Guia Técnico de Administração" (gestor responsável)
"use strict";
const pptxgen = require("pptxgenjs");
const H = require("./helpers");
const { COLORS, A3_COLORS } = H;

const pptx = H.newDeck(pptxgen, "A3 Estratégico — Guia Técnico de Administração");

// ------------------------------------------------------------ 1. CAPA
{
  const s = pptx.addSlide();
  H.bg(s, COLORS.bg);
  // mosaico decorativo com as cores reais das 14 áreas (motivo repetido no resto do deck)
  const codes = Object.keys(A3_COLORS);
  let gx = 9.7, gy = 0.9;
  codes.forEach((code, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    s.addShape("roundRect", { x: gx + col * 0.95, y: gy + row * 0.95, w: 0.8, h: 0.8, rectRadius: 0.14, fill: { color: A3_COLORS[code], transparency: 87 }, line: { color: A3_COLORS[code], width: 1.25 } });
  });
  s.addShape("roundRect", { x: 0.75, y: 0.7, w: 0.34, h: 0.34, rectRadius: 0.07, fill: { color: COLORS.blue }, line: { type: "none" } });
  s.addText("VECTON PLANNING", { x: 1.2, y: 0.68, w: 4, h: 0.38, isTextBox: true, margin: 0, fontFace: H.FONT_HEAD, fontSize: 14, bold: true, color: COLORS.soft, charSpacing: 1 });
  s.addText("A3 ESTRATÉGICO", { x: 0.75, y: 3.15, w: 9, h: 0.5, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 16, bold: true, color: COLORS.blue, charSpacing: 3 });
  s.addText("Guia Técnico de Administração", { x: 0.72, y: 3.55, w: 10.5, h: 1.1, isTextBox: true, margin: 0, fontFace: H.FONT_HEAD, fontSize: 42, bold: true, color: COLORS.white });
  s.addText("Modelo de dados, telas, RBAC e rotinas de manutenção do módulo de Gestão Estratégica — para quem assume a administração.", {
    x: 0.75, y: 4.65, w: 8, h: 0.7, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 13, color: COLORS.soft, lineSpacingMultiple: 1.3
  });
  s.addText("Ciclo 2026 · Marcher Brasil Agroindustrial", { x: 0.75, y: 6.85, w: 6, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, color: COLORS.faint });
}

// ------------------------------------------------------------ 2. SUMÁRIO
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Roteiro", "O que este guia cobre", { pageNum: 2 });
  const items = [
    ["01", "Conceito", "O que é o módulo e como ele se encaixa no DRE, Comercial e Headcount"],
    ["02", "Modelo conceitual", "Ciclo → Cenário → A3 → Indicador → Registro mensal → Ação"],
    ["03", "As 3 telas", "Visão Geral, Detalhe do A3 e Lançamento Mensal"],
    ["04", "Catálogo 2026", "14 A3s, metas do Norte Verdadeiro e ~50 indicadores"],
    ["05", "RBAC", "Quem vê e quem edita cada A3"],
    ["06", "Administração", "Criar A3/indicador, Norte Verdadeiro, arquivar/restaurar"],
    ["07", "Fechamento de período", "Regra de completude e snapshot de meta"],
    ["08", "Notificações", "Alertas de meta e de prazo de ação"]
  ];
  const colW = 5.6, gapX = 0.35, gapY = 0.28, rowH = 1.28;
  items.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.55 + col * (colW + gapX);
    const y = 1.5 + row * (rowH + gapY);
    H.card(s, x, y, colW, rowH, {});
    s.addText(it[0], { x: x + 0.25, y: y + 0.18, w: 0.9, h: 0.7, isTextBox: true, margin: 0, fontFace: H.FONT_HEAD, fontSize: 30, bold: true, color: COLORS.blueDim === "1E2A57" ? COLORS.blue : COLORS.blue });
    s.addText(it[1], { x: x + 1.1, y: y + 0.2, w: colW - 1.35, h: 0.32, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 14, bold: true, color: COLORS.white });
    s.addText(it[2], { x: x + 1.1, y: y + 0.52, w: colW - 1.35, h: 0.65, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, color: COLORS.soft, lineSpacingMultiple: 1.2 });
  });
}

// ------------------------------------------------------------ 3. O QUE É O MÓDULO
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Conceito", "Gestão à vista do plano estratégico", { pageNum: 3 });
  s.addText(
    "O módulo A3 Estratégico traduz o desdobramento de metas da Marcher (estilo Hoshin Kanri / A3 thinking) em um sistema vivo: " +
    "metas anuais da empresa (Norte Verdadeiro), organizadas em áreas estratégicas (A3), cada uma com indicadores (KPIs) acompanhados " +
    "mês a mês contra a meta, com causas/contramedidas e um plano de ação quando o resultado foge do combinado.",
    { x: 0.55, y: 1.4, w: 7.3, h: 1.7, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 14, color: COLORS.soft, lineSpacingMultiple: 1.4 }
  );
  const bullets = [
    ["Não duplica dado", "Boa parte dos indicadores é calculada em cima do que já existe no DRE Gerencial, no Comercial e no Headcount — não é digitado duas vezes."],
    ["Meta e realizado lado a lado", "Todo indicador compara o mês (e o acumulado) contra a meta do cenário vigente, com o mesmo motor de cenários do Planejamento."],
    ["Plano de ação embutido", "Quando um indicador foge da meta, o A3 já tem onde registrar causa, contramedida e um plano de ação com responsável e prazo."]
  ];
  let by = 1.4;
  bullets.forEach((b) => {
    H.card(s, 8.15, by, 4.6, 1.55, {});
    s.addText(b[0], { x: 8.4, y: by + 0.16, w: 4.1, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 12.5, bold: true, color: COLORS.blue });
    s.addText(b[1], { x: 8.4, y: by + 0.5, w: 4.1, h: 1.0, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, color: COLORS.soft, lineSpacingMultiple: 1.25 });
    by += 1.72;
  });
  s.addText("Origem: reestruturação do documento “#INDICADORES# 2026” da diretoria, cruzado com DRE Gerencial, Comercial e Headcount reais.", {
    x: 0.55, y: 6.55, w: 7.3, h: 0.4, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9.5, italic: true, color: COLORS.faint
  });
}

// ------------------------------------------------------------ 4. MODELO CONCEITUAL
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Arquitetura funcional", "Do ciclo anual ao lançamento do mês", { pageNum: 4 });
  const boxes = [
    ["Ciclo\n(ano)", "strategic_cycles — 1 por ano (2026)"],
    ["Cenário\nvigente", "strategic_scenarios — mesmo motor do Planejamento"],
    ["A3\n(mãe/filha)", "área estratégica, com Gestão responsável"],
    ["Indicador\n(KPI)", "direct (manual) · computed (auto)"],
    ["Registro\nmensal", "meta + realizado do mês, por A3+KPI"],
    ["Ação /\nCausa-contramedida", "plano de ação quando foge da meta"]
  ];
  const bw = 1.85, bh = 1.5, gap = 0.15;
  const totalW = boxes.length * bw + (boxes.length - 1) * gap;
  let bx = (13.333 - totalW) / 2;
  const by = 2.15;
  boxes.forEach((b, i) => {
    H.card(s, bx, by, bw, bh, { fill: i >= 3 ? COLORS.panelAlt : COLORS.panel });
    s.addText(b[0], { x: bx + 0.12, y: by + 0.18, w: bw - 0.24, h: 0.6, isTextBox: true, margin: 0, fontFace: H.FONT_HEAD, fontSize: 13, bold: true, color: COLORS.white, lineSpacingMultiple: 1.05 });
    s.addText(b[1], { x: bx + 0.12, y: by + 0.82, w: bw - 0.24, h: 0.6, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 8.5, color: COLORS.soft, lineSpacingMultiple: 1.2 });
    if (i < boxes.length - 1) {
      s.addText("›", { x: bx + bw, y: by + bh / 2 - 0.22, w: gap, h: 0.44, isTextBox: true, margin: 0, align: "center", valign: "middle", fontFace: H.FONT_HEAD, fontSize: 22, bold: true, color: COLORS.faint });
    }
    bx += bw + gap;
  });
  s.addText("Norte Verdadeiro (metas macro da empresa) fica um nível acima do Ciclo — aparece no topo da Tela 1, para toda a organização.", {
    x: 0.55, y: 4.1, w: 12.2, h: 0.4, isTextBox: true, margin: 0, align: "center", fontFace: H.FONT_BODY, fontSize: 11, italic: true, color: COLORS.faint
  });
  // nota RBAC por camada
  H.card(s, 0.55, 4.75, 12.23, 1.85, {});
  s.addText("Onde a Gestão (RBAC) entra em cada camada", { x: 0.85, y: 4.95, w: 8, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 12, bold: true, color: COLORS.white });
  const notes = [
    "A3 herda a Gestão de quem edita (Comercial, Industrial, RH…) — A3-filha herda da A3-mãe.",
    "Indicador não tem Gestão própria — pertence ao A3, catálogo é curado só por super_admin/admin.",
    "Registro mensal e Ação seguem a permissão da A3 onde vivem (ver slide de RBAC)."
  ];
  notes.forEach((n, i) => {
    s.addText("•  " + n, { x: 0.85, y: 5.35 + i * 0.4, w: 11.6, h: 0.36, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10.5, color: COLORS.soft });
  });
}

// ------------------------------------------------------------ 5. AS 3 TELAS
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Navegação", "As 3 telas do módulo", { pageNum: 5 });
  const cols = [
    { n: "1", t: "Visão Geral", d: "Norte Verdadeiro + lista de Áreas com status “dentro da meta / fora da meta”." },
    { n: "2", t: "Detalhe do A3", d: "Objetivo estratégico, gráfico real × meta por indicador, causas/contramedidas e plano de ação." },
    { n: "3", t: "Lançamento Mensal", d: "Grade de meta + realizado de cada indicador do A3, com fechamento de período." }
  ];
  const cw = 3.85, gap = 0.34;
  let cx = 0.55;
  cols.forEach((c) => {
    H.card(s, cx, 1.55, cw, 4.6, {});
    H.iconCircle(s, cx + 0.3, 1.85, 0.6, c.n, COLORS.blue);
    s.addText(c.t, { x: cx + 0.3, y: 2.6, w: cw - 0.6, h: 0.4, isTextBox: true, margin: 0, fontFace: H.FONT_HEAD, fontSize: 17, bold: true, color: COLORS.white });
    s.addText(c.d, { x: cx + 0.3, y: 3.05, w: cw - 0.6, h: 1.5, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 11.5, color: COLORS.soft, lineSpacingMultiple: 1.35 });
    cx += cw + gap;
  });
  s.addText("As telas seguintes recriam cada uma delas em detalhe.", { x: 0.55, y: 6.35, w: 11, h: 0.35, isTextBox: true, margin: 0, italic: true, fontFace: H.FONT_BODY, fontSize: 10.5, color: COLORS.faint });
}

// ------------------------------------------------------------ 6. TELA 1 MOCKUP
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Tela 1", "Visão Geral — Norte Verdadeiro + Áreas", { pageNum: 6 });
  const area = H.appFrame(s, { breadcrumb: "A3 Estratégicos", active: "A3 Estratégicos" });
  const pad = 0.28;
  const cx = area.x + pad, cy = area.y + pad, cw = area.w - pad * 2;
  H.card(s, cx, cy, cw, 1.35, { line: COLORS.blue, lineWidth: 1.5 });
  s.addText("Norte Verdadeiro", { x: cx + 0.22, y: cy + 0.14, w: 4, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 13, bold: true, color: COLORS.white });
  s.addText("Metas anuais do ciclo 2026", { x: cx + 0.22, y: cy + 0.42, w: 5, h: 0.24, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9, color: COLORS.faint });
  const goals = [["Receita Líquida", "R$ 200 milhões"], ["Pecuária", "R$ 40 milhões"], ["Exportação", "R$ 10 milhões"], ["EBITDA", "Superior a 20%"], ["Trilha de Carreira", "Crescimento p/ todos"], ["Capacidade Fabril", "Adequada ao mercado"]];
  const gw = (cw - 0.44) / 6 - 0.06;
  goals.forEach((g, i) => {
    const gx = cx + 0.22 + i * (gw + 0.07);
    s.addShape("roundRect", { x: gx, y: cy + 0.72, w: gw, h: 0.5, rectRadius: 0.05, fill: { color: COLORS.panelAlt }, line: { color: COLORS.lineSoft, width: 0.75 } });
    s.addText(g[0], { x: gx + 0.07, y: cy + 0.76, w: gw - 0.14, h: 0.18, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 6.7, color: COLORS.faint });
    s.addText(g[1], { x: gx + 0.07, y: cy + 0.94, w: gw - 0.14, h: 0.24, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 8, bold: true, color: COLORS.white });
  });

  const ly = cy + 1.35 + 0.22;
  s.addText("Áreas", { x: cx, y: ly, w: 3, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 13, bold: true, color: COLORS.white });
  H.pill(s, cx + cw - 3.55, ly - 0.02, 1.55, 0.32, "Itens arquivados", "muted");
  H.pill(s, cx + cw - 1.85, ly - 0.02, 1.55, 0.32, "+ Criar A3", "blue");
  const rows = [
    ["EBITDA", "4F7CFF", "E", "4 indicadores", "1/4 dentro da meta", "neg"],
    ["Comercial", "14B8A6", "C", "2 indicadores · 3 A3 filhos", "2/2 dentro da meta", "pos"],
    ["Supply Chain", "F59E0B", "S", "2 indicadores · 2 A3 filhos", "Sem dado", "muted"],
    ["Fabril", "8B5CF6", "F", "4 indicadores", "3/4 dentro da meta", "neg"],
    ["Pessoas", "A78BFA", "P", "10 indicadores", "8/9 dentro da meta", "neg"]
  ];
  let ry = ly + 0.42;
  rows.forEach((r) => {
    H.areaRow(s, cx, ry, cw, { color: r[1], letter: r[2], name: "A3 " + r[0], sub: r[3], badgeText: r[4], badgeTone: r[5] });
    ry += 0.64;
  });
}

// ------------------------------------------------------------ 7. TELA 2 MOCKUP
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Tela 2", "Detalhe do A3 — objetivo, gráfico e plano de ação", { pageNum: 7 });
  const area = H.appFrame(s, { breadcrumb: "A3 Estratégicos › A3 Comercial", active: "A3 Estratégicos" });
  const pad = 0.26;
  const cx = area.x + pad, cy = area.y + pad, cw = area.w - pad * 2;

  H.card(s, cx, cy, cw, 1.0, {});
  s.addText("A3 Comercial", { x: cx + 0.2, y: cy + 0.12, w: 4, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_HEAD, fontSize: 14, bold: true, color: A3_COLORS.comercial });
  s.addText("OBJETIVO ESTRATÉGICO", { x: cx + 0.2, y: cy + 0.46, w: 3, h: 0.18, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 7, bold: true, color: COLORS.faint, charSpacing: 1 });
  s.addText("Crescer faturamento e volume com mix saudável entre Grãos, Pecuária, Peças e Exportação.", { x: cx + 0.2, y: cy + 0.64, w: cw - 2.2, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9.5, color: COLORS.soft });
  H.pill(s, cx + cw - 1.9, cy + 0.22, 1.7, 0.32, "Preenchimento mensal", "blue");

  const chartY = cy + 1.2;
  H.card(s, cx, chartY, cw * 0.62, 3.0, {});
  s.addText("Faturamento — Realizado x Meta mensal", { x: cx + 0.18, y: chartY + 0.1, w: cw * 0.62 - 0.4, h: 0.24, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, bold: true, color: COLORS.white });
  H.kpiChart(pptx, s, cx + 0.1, chartY + 0.32, cw * 0.62 - 0.2, 2.55, {
    title: "",
    categories: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul"],
    actual: [14.2, 15.8, 13.9, 16.4, 17.1, 18.0, 17.4],
    target: [15, 15, 15, 16, 16, 17, 17],
    unit: "R$ mi"
  });

  const rx = cx + cw * 0.62 + 0.2, rw = cw * 0.38 - 0.2;
  H.card(s, rx, chartY, rw, 1.42, {});
  s.addText("Causas e contramedidas", { x: rx + 0.16, y: chartY + 0.1, w: rw - 0.3, h: 0.24, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, bold: true, color: COLORS.white });
  H.pill(s, rx + 0.16, chartY + 0.4, 0.7, 0.24, "Causa", "warn");
  s.addText("Chuva atrasou colheita em MT/GO em março", { x: rx + 0.95, y: chartY + 0.4, w: rw - 1.1, h: 0.24, isTextBox: true, margin: 0, valign: "middle", fontFace: H.FONT_BODY, fontSize: 8.5, color: COLORS.soft });
  H.pill(s, rx + 0.16, chartY + 0.72, 1.15, 0.24, "Contramedida", "pos");
  s.addText("Reforço comercial no Oeste em abril", { x: rx + 1.4, y: chartY + 0.72, w: rw - 1.55, h: 0.24, isTextBox: true, margin: 0, valign: "middle", fontFace: H.FONT_BODY, fontSize: 8.5, color: COLORS.soft });
  H.button(s, rx + 0.16, chartY + 1.05, 1.6, 0.28, "+ Novo item", {});

  H.card(s, rx, chartY + 1.56, rw, 1.44, {});
  s.addText("Plano de ação", { x: rx + 0.16, y: chartY + 1.66, w: rw - 0.3, h: 0.24, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, bold: true, color: COLORS.white });
  s.addText("Reforçar time comercial no Oeste", { x: rx + 0.16, y: chartY + 1.95, w: rw - 0.3, h: 0.22, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 8.7, bold: true, color: COLORS.text });
  H.pill(s, rx + 0.16, chartY + 2.2, 1.0, 0.24, "Em andamento", "warn");
  s.addText("Prazo 30/09 · 60%", { x: rx + 1.25, y: chartY + 2.2, w: rw - 1.4, h: 0.24, isTextBox: true, margin: 0, valign: "middle", fontFace: H.FONT_BODY, fontSize: 8, color: COLORS.faint });
  H.button(s, rx + 0.16, chartY + 2.55, 1.6, 0.28, "+ Nova ação", {});
}

// ------------------------------------------------------------ 8. TELA 3 MOCKUP
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Tela 3", "Lançamento mensal — os modos de indicador", { pageNum: 8 });
  const area = H.appFrame(s, { breadcrumb: "A3 Estratégicos › A3 Comercial › Lançamento", active: "A3 Estratégicos" });
  const pad = 0.26;
  const cx = area.x + pad, cy = area.y + pad, cw = area.w - pad * 2;

  H.card(s, cx, cy, cw, 0.55, {});
  s.addText("A3 Comercial — lançamento mensal · Jul/2026", { x: cx + 0.2, y: cy + 0.14, w: 6, h: 0.28, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 11, bold: true, color: COLORS.white });
  H.pill(s, cx + cw - 3.7, cy + 0.13, 1.5, 0.3, "Período aberto", "pos");
  H.pill(s, cx + cw - 2.05, cy + 0.13, 1.85, 0.3, "Fechar período", "blue");

  const modes = [
    { m: "DIRECT", n: "Faturamento Exportação", d: "Meta e realizado digitados manualmente todo mês — modo padrão de praticamente todo o catálogo hoje.", ex: "Real: R$ 820 mil" },
    { m: "COMPUTED · Auto", n: "EBITDA % Mensal", d: "Calculado a partir do DRE Gerencial/Comercial/Headcount — “Sincronizar automáticos” traz a sugestão, mas ainda dá pra ajustar.", ex: "Real: 21,4%" }
  ];
  const rw = (cw - 0.3) / 2, rh = 1.9;
  modes.forEach((md, i) => {
    const rx = cx + i * (rw + 0.3), ryy = cy + 0.75;
    H.card(s, rx, ryy, rw, rh, {});
    H.pill(s, rx + 0.2, ryy + 0.18, 1.9, 0.28, md.m, "blue");
    s.addText(md.n, { x: rx + 0.2, y: ryy + 0.56, w: rw - 0.4, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 13, bold: true, color: COLORS.white });
    s.addText(md.d, { x: rx + 0.2, y: ryy + 0.9, w: rw - 0.4, h: 0.75, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9.8, color: COLORS.soft, lineSpacingMultiple: 1.3 });
    s.addText(md.ex, { x: rx + 0.2, y: ryy + rh - 0.36, w: rw - 0.4, h: 0.26, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9.5, bold: true, color: COLORS.pos });
  });

  const noteY = cy + 0.75 + rh + 0.22;
  H.card(s, cx, noteY, cw, area.h - (noteY - area.y) - 0.15, { fill: COLORS.bg, line: COLORS.line, noShadow: true });
  s.addText("Nota histórica — modos “Direcionadores” e “Composição” descontinuados (29/08/2026)", { x: cx + 0.2, y: noteY + 0.14, w: cw - 0.4, h: 0.28, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10.5, bold: true, color: COLORS.amber });
  s.addText(
    "O catálogo já teve indicadores nos modos entry_mode “drivers” (ex.: Turnover, calculado por admissões/demissões/quadro) e “breakdown” " +
    "(composição em linhas). Por pedido do usuário, todos foram convertidos para “direct” (migrations 169-171) — o cálculo passou a ser feito " +
    "fora da ferramenta, só o resultado final é digitado. As tabelas de suporte (strategic_kpi_drivers, strategic_kpi_breakdown_rows) e o " +
    "histórico já lançado continuam no banco, só saem de uso — a UI ainda sabe renderizar os dois modos se algum indicador voltar a usá-los.",
    { x: cx + 0.2, y: noteY + 0.46, w: cw - 0.4, h: 0.9, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9.3, color: COLORS.soft, lineSpacingMultiple: 1.3 }
  );
}

// ------------------------------------------------------------ 9. CATÁLOGO 2026
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Catálogo do ciclo 2026", "14 A3s, 6 metas do Norte Verdadeiro, ~50 indicadores", { pageNum: 9 });
  const a3s = [
    ["EBITDA", "ebitda", "—", "4"], ["Comercial", "comercial", "—", "2"], ["Supply Chain", "supply_chain", "—", "2"],
    ["Fabril", "fabril", "—", "4"], ["Produto", "produto", "—", "3"], ["Áreas Técnicas", "areas_tecnicas", "—", "5"],
    ["Engenharia", "engenharia", "—", "6"], ["Marketing", "marketing", "—", "4"], ["Pessoas", "pessoas", "—", "10"],
    ["Exportação", "exportacao", "Comercial", "4"], ["Pecuária", "pecuaria", "Comercial", "3"], ["Peças", "pecas", "Comercial", "2"],
    ["Estoques", "estoques", "Supply Chain", "4"], ["Compras", "compras", "Supply Chain", "7"]
  ];
  const cw = 1.72, ch = 0.98, gapx = 0.06, gapy = 0.1;
  let sx = 0.55, sy = 1.45;
  a3s.forEach((a, i) => {
    const col = i % 7, row = Math.floor(i / 7);
    const x = sx + col * (cw + gapx), y = sy + row * (ch + gapy);
    const color = A3_COLORS[a[1]];
    s.addShape("roundRect", { x, y, w: cw, h: ch, rectRadius: 0.07, fill: { color: COLORS.panelAlt }, line: { color, width: 1.2 } });
    s.addText(a[0], { x: x + 0.09, y: y + 0.1, w: cw - 0.18, h: 0.42, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10.5, bold: true, color: COLORS.white, lineSpacingMultiple: 1.0 });
    s.addText(a[3] + " ind.", { x: x + 0.09, y: y + ch - 0.28, w: cw - 0.18, h: 0.2, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 8, color });
    if (a[2] !== "—") s.addText("filha de " + a[2], { x: x + 0.09, y: y + 0.5, w: cw - 0.18, h: 0.2, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 6.6, color: COLORS.faint });
  });
  const notesY = sy + 2 * (ch + gapy) + 0.15;
  H.card(s, 0.55, notesY, 12.23, 1.5, {});
  s.addText("Como manter o catálogo saudável", { x: 0.8, y: notesY + 0.16, w: 8, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 12, bold: true, color: COLORS.white });
  const tips = [
    "Indicadores marcados “pending” no catálogo de origem entram inativos — não aparecem em relatório até a fórmula ser validada.",
    "A3-filha herda Gestão e cor da A3-mãe automaticamente — não precisa (nem dá para) redefinir na criação.",
    "Todo indicador criado pela tela é sempre entry_mode “direct” — modos computed/drivers/breakdown vêm de configuração de banco."
  ];
  tips.forEach((t, i) => {
    s.addText("•  " + t, { x: 0.8, y: notesY + 0.52 + i * 0.32, w: 11.7, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9.7, color: COLORS.soft });
  });
}

// ------------------------------------------------------------ 10. RBAC
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Controle de acesso", "Quem vê e quem edita cada A3", { pageNum: 10 });
  const cols = [
    { t: "Super Admin / Admin", sub: "acesso total, sempre", rows: ["Vê todos os A3 e indicadores", "Edita qualquer A3, sem restrição", "Único que mexe no catálogo (criar/editar/arquivar A3 e KPI)", "Único que edita o Norte Verdadeiro"] },
    { t: "Gestor (manager)", sub: "visão total, edição pela própria Gestão", rows: ["Vê TODOS os A3 (visão sempre completa)", "Edita só A3 cuja Gestão bate com a dele (ex.: Comercial edita A3 Comercial)", "Pode ganhar acesso extra a um A3 específico fora da própria Gestão", "Não mexe no catálogo nem no Norte Verdadeiro"] },
    { t: '"A3 Estratégicos" (gestao_estrategica)', sub: "acesso pontual, concedido por A3", rows: ["Só vê os A3 explicitamente concedidos a ele", "Edita só se a concessão for em modo “gravação”", "Perfil combinável com outros papéis (não substitui)", "Pensado p/ quem cuida de 1-2 áreas específicas, sem ver o resto"] }
  ];
  const cw = 3.95, gap = 0.19;
  let cx = 0.55;
  cols.forEach((c, ci) => {
    H.card(s, cx, 1.5, cw, 5.15, { fill: ci === 0 ? COLORS.panelAlt : COLORS.panel });
    s.addText(c.t, { x: cx + 0.22, y: 1.68, w: cw - 0.44, h: 0.55, isTextBox: true, margin: 0, fontFace: H.FONT_HEAD, fontSize: 14.5, bold: true, color: COLORS.white, lineSpacingMultiple: 1.05 });
    s.addText(c.sub, { x: cx + 0.22, y: 2.24, w: cw - 0.44, h: 0.4, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9.5, italic: true, color: COLORS.blue });
    let ry = 2.75;
    c.rows.forEach((r) => {
      s.addShape("roundRect", { x: cx + 0.22, y: ry + 0.03, w: 0.09, h: 0.09, rectRadius: 0.02, fill: { color: COLORS.faint }, line: { type: "none" } });
      s.addText(r, { x: cx + 0.42, y: ry - 0.06, w: cw - 0.64, h: 0.62, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, color: COLORS.soft, lineSpacingMultiple: 1.2 });
      ry += 0.82;
    });
    cx += cw + gap;
  });
  s.addText("Regra fixa: qualquer outro perfil (Analista, etc.) não vê o módulo — bloqueado no banco (RLS), não só escondido no menu.", {
    x: 0.55, y: 6.78, w: 12.2, h: 0.3, isTextBox: true, margin: 0, italic: true, fontFace: H.FONT_BODY, fontSize: 9.5, color: COLORS.faint
  });
}

// ------------------------------------------------------------ 11. ADMIN: CRIAR A3
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Administração", "Criar um novo A3", { pageNum: 11 });
  const area = H.appFrame(s, { breadcrumb: "A3 Estratégicos", active: "A3 Estratégicos" });
  const modal = H.modalMock(s, area, { title: "Criar A3", subtitle: "Cria uma nova área estratégica no catálogo. Indicadores são adicionados depois, de dentro da área.", w: 5.4, h: 4.4 });
  let fy = modal.contentY;
  H.button(s, modal.x + 0.3, fy, 2.3, 0.4, "A3-mãe (nova área)", { primary: true });
  H.button(s, modal.x + 2.75, fy, 2.35, 0.4, "A3-filha (dentro de área)", {});
  fy += 0.6;
  H.field(s, modal.x + 0.3, fy, modal.w - 0.6, "Gestão responsável", "Comercial");
  fy += 0.65;
  H.field(s, modal.x + 0.3, fy, modal.w - 0.6, "Nome", "Logística");
  fy += 0.75;
  s.addText("Define quem (Gestor) edita esta A3. Deixe em branco para métrica consolidada sem Gestor único (ex.: EBITDA).", { x: modal.x + 0.3, y: fy, w: modal.w - 0.6, h: 0.5, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9, italic: true, color: COLORS.faint, lineSpacingMultiple: 1.2 });
  H.button(s, modal.x + modal.w - 2.9, modal.y + modal.h - 0.55, 1.3, 0.36, "Cancelar", {});
  H.button(s, modal.x + modal.w - 1.5, modal.y + modal.h - 0.55, 1.2, 0.36, "Criar A3", { primary: true });
}

// ------------------------------------------------------------ 12. ADMIN: CRIAR INDICADOR
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Administração", "Criar um novo indicador (KPI)", { pageNum: 12 });
  const area = H.appFrame(s, { breadcrumb: "A3 Estratégicos › A3 Comercial", active: "A3 Estratégicos" });
  const modal = H.modalMock(s, area, { title: "Criar indicador", subtitle: "Meta e realizado deste indicador são sempre digitados manualmente, mês a mês.", w: 5.6, h: 5.0 });
  let fy = modal.contentY;
  H.field(s, modal.x + 0.3, fy, modal.w - 0.6, "Nome", "Custo por tonelada");
  fy += 0.6;
  H.field(s, modal.x + 0.3, fy, (modal.w - 0.75) / 2, "Unidade de medida", "R$ (Reais)");
  H.field(s, modal.x + 0.3 + (modal.w - 0.75) / 2 + 0.15, fy, (modal.w - 0.75) / 2, "Casas decimais", "0");
  fy += 0.6;
  H.field(s, modal.x + 0.3, fy, (modal.w - 0.75) / 2, "Direção da meta", "Maior é melhor");
  H.field(s, modal.x + 0.3 + (modal.w - 0.75) / 2 + 0.15, fy, (modal.w - 0.75) / 2, "Acumulado no ano", "Soma");
  fy += 0.75;
  s.addText("Indicador criado por aqui é sempre entry_mode “direct” — os modos automáticos (computed/drivers/breakdown) exigem configuração de banco, fora desta tela.", {
    x: modal.x + 0.3, y: fy, w: modal.w - 0.6, h: 0.6, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9, italic: true, color: COLORS.faint, lineSpacingMultiple: 1.25
  });
  H.button(s, modal.x + modal.w - 3.1, modal.y + modal.h - 0.55, 1.3, 0.36, "Cancelar", {});
  H.button(s, modal.x + modal.w - 1.7, modal.y + modal.h - 0.55, 1.7, 0.36, "Criar indicador", { primary: true });
}

// ------------------------------------------------------------ 13. ADMIN: NORTE VERDADEIRO + ARQUIVADOS
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Administração", "Norte Verdadeiro e itens arquivados", { pageNum: 13 });
  const lw = 6.0;
  H.card(s, 0.55, 1.5, lw, 5.3, {});
  s.addText("Editar Norte Verdadeiro", { x: 0.8, y: 1.68, w: 5.5, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 13, bold: true, color: COLORS.white });
  s.addText("Metas anuais macro da empresa — aparecem no topo da Tela 1, para todo mundo.", { x: 0.8, y: 1.98, w: 5.4, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9, color: COLORS.faint });
  const goals = [["Receita Líquida", "R$ 200 milhões"], ["EBITDA", "Superior a 20%"], ["Trilha de Carreira", "Oportunidade de crescimento para todos"]];
  let gy = 2.4;
  goals.forEach((g) => {
    s.addShape("roundRect", { x: 0.8, y: gy, w: lw - 0.5, h: 0.8, rectRadius: 0.06, fill: { color: COLORS.panelAlt }, line: { color: COLORS.line, width: 1 } });
    H.field(s, 0.95, gy + 0.06, 2.2, "Título", g[0], { h: 0.34 });
    H.field(s, 3.25, gy + 0.06, lw - 0.5 - 2.4, "Meta", g[1], { h: 0.34 });
    gy += 0.95;
  });
  H.button(s, 0.8, gy + 0.1, lw - 0.5, 0.35, "+ Nova meta", {});
  H.button(s, 0.8 + lw - 0.5 - 2.5, 1.5 + 5.3 - 0.55, 1.15, 0.36, "Cancelar", {});
  H.button(s, 0.8 + lw - 0.5 - 1.2, 1.5 + 5.3 - 0.55, 1.05, 0.36, "Salvar", { primary: true });

  const rx = 0.55 + lw + 0.3, rw = 12.23 - lw - 0.3;
  H.card(s, rx, 1.5, rw, 5.3, {});
  s.addText("Itens arquivados", { x: rx + 0.25, y: 1.68, w: rw - 0.5, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 13, bold: true, color: COLORS.white });
  s.addText("Excluir A3/indicador não apaga — arquiva (is_active=false). Aqui dá pra restaurar ou excluir de vez.", { x: rx + 0.25, y: 1.98, w: rw - 0.5, h: 0.4, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9, color: COLORS.faint, lineSpacingMultiple: 1.2 });
  const arch = [["A3 Logística Reversa", "Sem gestão · desativada em 12/03/2026", "A3"], ["% Estoque obsoleto legado", "OBS_LEGACY · desativado em 02/02/2026", "KPI"]];
  let ay = 2.55;
  arch.forEach((a) => {
    s.addShape("roundRect", { x: rx + 0.25, y: ay, w: rw - 0.5, h: 0.7, rectRadius: 0.06, fill: { color: COLORS.panelAlt }, line: { color: COLORS.line, width: 1 } });
    s.addText(a[0], { x: rx + 0.42, y: ay + 0.1, w: rw - 3.0, h: 0.24, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, bold: true, color: COLORS.white });
    s.addText(a[1], { x: rx + 0.42, y: ay + 0.36, w: rw - 3.0, h: 0.22, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 8, color: COLORS.faint });
    H.button(s, rx + rw - 2.55, ay + 0.17, 1.1, 0.36, "Restaurar", { primary: true });
    H.button(s, rx + rw - 1.35, ay + 0.17, 1.05, 0.36, "Excluir", {});
    ay += 0.85;
  });
  s.addText("Excluir de vez só é permitido se o item não tiver histórico lançado — a regra é validada no banco, a mensagem de erro já vem pronta.", {
    x: rx + 0.25, y: ay + 0.15, w: rw - 0.5, h: 0.6, isTextBox: true, margin: 0, italic: true, fontFace: H.FONT_BODY, fontSize: 9, color: COLORS.faint, lineSpacingMultiple: 1.2
  });
}

// ------------------------------------------------------------ 14. FECHAMENTO DE PERÍODO
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Rotina mensal", "Fechamento de período", { pageNum: 14 });
  s.addText("Fechar o período de um A3 “trava” o mês: os registros deixam de poder ser editados até alguém reabrir.", {
    x: 0.55, y: 1.4, w: 12.2, h: 0.4, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 13, color: COLORS.soft
  });
  const steps = [
    ["Validação de completude", "Só fecha se TODO indicador primário ativo do A3 tiver meta E realizado lançados no mês. Faltando algum, o sistema lista pelo nome o que falta."],
    ["Snapshot de verdade", "Ao fechar, a meta e o cenário vigente daquele instante são copiados para dentro do registro do mês — não é só uma referência."],
    ["Meses fechados nunca mudam sozinhos", "Mesmo que a meta do cenário mude depois (ex.: revisão de orçamento), o mês fechado continua mostrando a meta que valia na hora do fechamento."],
    ["Reabrir é reversível, refechar atualiza o snapshot", "Reabrir libera edição de novo; fechar outra vez sempre recaptura cenário/meta vigentes NA HORA desse novo fechamento."]
  ];
  const colW = 5.95, gap = 0.33, rowH = 1.85;
  steps.forEach((st, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.55 + col * (colW + gap), y = 2.0 + row * (rowH + 0.25);
    H.card(s, x, y, colW, rowH, {});
    H.stepBadge(s, x + 0.22, y + 0.22, i + 1);
    H.stepText(s, x + 0.85, y + 0.22, colW - 1.1, st[0], st[1]);
  });
}

// ------------------------------------------------------------ 15. NOTIFICAÇÕES
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Alertas", "Notificações do módulo", { pageNum: 15 });
  const rows = [
    ["A3: indicador fora da meta", "Broadcast · lista fixa definida pelo admin", "Dispara ao FECHAR o período de um A3, se algum indicador ficou em atenção ou fora da meta — 1 notificação consolidada por A3+mês.", COLORS.neg],
    ["A3: prazo de ação vencendo/vencida", "Por pessoa · só o(s) Responsável(is)", "Avisa até 3 dias antes do prazo e de novo quando vence/já venceu — no máximo 1x cada, por ação.", COLORS.amber],
    ["A3: você foi atribuído a uma ação", "Por pessoa · só quem foi adicionado", "Dispara quando alguém é incluído como Responsável de uma ação do plano.", COLORS.blue]
  ];
  let ry = 1.55;
  rows.forEach((r) => {
    H.card(s, 0.55, ry, 12.23, 1.42, {});
    s.addShape("roundRect", { x: 0.8, y: ry + 0.24, w: 0.14, h: 0.94, rectRadius: 0.03, fill: { color: r[3] }, line: { type: "none" } });
    s.addText(r[0], { x: 1.1, y: ry + 0.16, w: 7.6, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 13, bold: true, color: COLORS.white });
    H.pill(s, 9.0, ry + 0.16, 3.5, 0.3, r[1], "muted");
    s.addText(r[2], { x: 1.1, y: ry + 0.52, w: 11.3, h: 0.8, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10.5, color: COLORS.soft, lineSpacingMultiple: 1.3 });
    ry += 1.6;
  });
  s.addText("Configuração dos destinatários broadcast fica em Parâmetros › Notificações — mesma Central usada pelos outros módulos do Vecton.", {
    x: 0.55, y: ry + 0.1, w: 12.2, h: 0.35, isTextBox: true, margin: 0, italic: true, fontFace: H.FONT_BODY, fontSize: 9.5, color: COLORS.faint
  });
}

// ------------------------------------------------------------ 16. CHECKLIST + ENCERRAMENTO
{
  const s = pptx.addSlide();
  H.bg(s, COLORS.bg);
  s.addText("CHECKLIST DO ADMINISTRADOR", { x: 0.75, y: 0.75, w: 8, h: 0.35, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 12, bold: true, color: COLORS.blue, charSpacing: 2 });
  s.addText("Rotina sugerida", { x: 0.72, y: 1.05, w: 8, h: 0.7, isTextBox: true, margin: 0, fontFace: H.FONT_HEAD, fontSize: 34, bold: true, color: COLORS.white });
  const checklist = [
    "Todo início de mês: conferir se há indicador “pending” esperando validação de fórmula no catálogo.",
    "Antes de fechar um A3: revisar se causas/contramedidas foram registradas para indicadores fora da meta.",
    "Ao mudar responsável de área: ajustar Gestão do A3 e/ou concessões extra_strategic_a3_ids do perfil.",
    "Ao revisar orçamento no meio do ano: lembrar que meses JÁ FECHADOS não refletem a mudança automaticamente.",
    "Trimestral: revisar itens arquivados — restaurar o que voltou a fazer sentido, excluir o que não tem mais histórico pendente."
  ];
  let cy = 2.05;
  checklist.forEach((c) => {
    s.addShape("roundRect", { x: 0.75, y: cy + 0.03, w: 0.22, h: 0.22, rectRadius: 0.04, fill: { type: "none" }, line: { color: COLORS.blue, width: 1.5 } });
    s.addText(c, { x: 1.15, y: cy - 0.06, w: 10.8, h: 0.5, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 13, color: COLORS.soft, lineSpacingMultiple: 1.25 });
    cy += 0.72;
  });
  s.addText("Dúvidas técnicas sobre o módulo: time de Controladoria / TI da Marcher.", {
    x: 0.75, y: 6.6, w: 10, h: 0.4, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 11, color: COLORS.faint
  });
}

// Deck final vive FORA do repo (Área de Trabalho), mesmo padrão do Sincerão —
// ver [[project_sincerao]]. Este script fica versionado aqui só como gerador.
pptx.writeFile({ fileName: __dirname + "/../../../A3 Estrategico - Guia Tecnico de Administracao.pptx" }).then((f) => console.log("OK:", f));
