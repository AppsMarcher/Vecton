// Deck 2 — "A3 Estratégico: Guia do Usuário" (quem lança dado / acompanha metas)
"use strict";
const pptxgen = require("pptxgenjs");
const H = require("./helpers");
const { COLORS, A3_COLORS } = H;

const pptx = H.newDeck(pptxgen, "A3 Estratégico — Guia do Usuário");

// ------------------------------------------------------------ 1. CAPA
{
  const s = pptx.addSlide();
  H.bg(s, COLORS.bg);
  const codes = Object.keys(A3_COLORS);
  let gx = 9.7, gy = 0.9;
  codes.forEach((code, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    s.addShape("roundRect", { x: gx + col * 0.95, y: gy + row * 0.95, w: 0.8, h: 0.8, rectRadius: 0.14, fill: { color: A3_COLORS[code], transparency: 87 }, line: { color: A3_COLORS[code], width: 1.25 } });
  });
  s.addShape("roundRect", { x: 0.75, y: 0.7, w: 0.34, h: 0.34, rectRadius: 0.07, fill: { color: COLORS.blue }, line: { type: "none" } });
  s.addText("VECTON PLANNING", { x: 1.2, y: 0.68, w: 4, h: 0.38, isTextBox: true, margin: 0, fontFace: H.FONT_HEAD, fontSize: 14, bold: true, color: COLORS.soft, charSpacing: 1 });
  s.addText("A3 ESTRATÉGICO", { x: 0.75, y: 3.15, w: 9, h: 0.5, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 16, bold: true, color: COLORS.blue, charSpacing: 3 });
  s.addText("Guia do Usuário", { x: 0.72, y: 3.55, w: 10.5, h: 1.1, isTextBox: true, margin: 0, fontFace: H.FONT_HEAD, fontSize: 42, bold: true, color: COLORS.white });
  s.addText("Como acompanhar sua meta, lançar indicadores e registrar ações — passo a passo.", {
    x: 0.75, y: 4.65, w: 8, h: 0.6, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 13, color: COLORS.soft, lineSpacingMultiple: 1.3
  });
  s.addText("Ciclo 2026 · Marcher Brasil Agroindustrial", { x: 0.75, y: 6.85, w: 6, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, color: COLORS.faint });
}

// ------------------------------------------------------------ 2. SUMÁRIO
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Roteiro", "O que você vai aprender", { pageNum: 2 });
  const items = [
    ["01", "O que é o A3", "Por que a Marcher usa esse painel e o que ele muda no seu dia a dia"],
    ["02", "Como acessar", "Onde encontrar o módulo dentro do Vecton"],
    ["03", "Visão Geral e Detalhe", "Navegar pelas metas e abrir a sua área"],
    ["04", "Lançar um indicador", "Passo a passo: digitação direta ou conferência do valor automático"],
    ["05", "Causas e plano de ação", "O que fazer quando o resultado foge da meta"],
    ["06", "Anexos", "Guardar evidência junto do número lançado"],
    ["07", "Fechamento e alertas", "O que muda quando o mês fecha, e o que você recebe por notificação"],
    ["08", "Administração (resumo)", "Para quem também cuida do catálogo de A3/indicadores"]
  ];
  const colW = 5.6, gapX = 0.35, gapY = 0.28, rowH = 1.28;
  items.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.55 + col * (colW + gapX);
    const y = 1.5 + row * (rowH + gapY);
    H.card(s, x, y, colW, rowH, {});
    s.addText(it[0], { x: x + 0.25, y: y + 0.18, w: 0.9, h: 0.7, isTextBox: true, margin: 0, fontFace: H.FONT_HEAD, fontSize: 30, bold: true, color: COLORS.blue });
    s.addText(it[1], { x: x + 1.1, y: y + 0.2, w: colW - 1.35, h: 0.32, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 14, bold: true, color: COLORS.white });
    s.addText(it[2], { x: x + 1.1, y: y + 0.52, w: colW - 1.35, h: 0.65, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, color: COLORS.soft, lineSpacingMultiple: 1.2 });
  });
}

// ------------------------------------------------------------ 3. O QUE É / POR QUE
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Para começar", "Por que existe o A3 Estratégico", { pageNum: 3 });
  s.addText(
    "É o painel onde a meta da sua área vira número, mês a mês — sem depender de planilha solta. Você lança o resultado, " +
    "vê como está em relação à meta, e registra o que está sendo feito quando alguma coisa foge do combinado.",
    { x: 0.55, y: 1.4, w: 7.3, h: 1.5, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 14, color: COLORS.soft, lineSpacingMultiple: 1.4 }
  );
  const bullets = [
    ["Sua meta, sempre visível", "Assim que você abre a sua área, já vê realizado x meta do mês e do ano — sem pedir relatório pra ninguém."],
    ["Menos planilha, mais decisão", "O número entra uma vez; o gráfico, o acumulado e o alerta de meta são automáticos a partir daí."],
    ["Seu histórico fica registrado", "Causa, contramedida e ação ficam junto do indicador — dá pra olhar para trás e entender o que foi feito."]
  ];
  let by = 1.4;
  bullets.forEach((b) => {
    H.card(s, 8.15, by, 4.6, 1.55, {});
    s.addText(b[0], { x: 8.4, y: by + 0.16, w: 4.1, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 12.5, bold: true, color: COLORS.blue });
    s.addText(b[1], { x: 8.4, y: by + 0.5, w: 4.1, h: 1.0, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, color: COLORS.soft, lineSpacingMultiple: 1.25 });
    by += 1.72;
  });
}

// ------------------------------------------------------------ 4. COMO ACESSAR
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Primeiro passo", "Como acessar o módulo", { pageNum: 4 });
  const area = H.appFrame(s, { breadcrumb: "A3 Estratégicos", active: "A3 Estratégicos", w: 7.6 });
  const steps = [
    ["Faça login no Vecton", "Com seu e-mail e senha de sempre, em vecton.marcher.com.br."],
    ["Abra o menu “A3 Estratégicos”", "Fica na barra lateral esquerda, junto dos outros módulos do Vecton."],
    ["Escolha o mês no topo", "O seletor de período (canto superior direito) define de qual mês você está vendo/lançando dado."]
  ];
  const tx = area.outer.x + area.outer.w + 0.35, tw = 12.23 - area.outer.w - 0.35;
  let ty = 1.55;
  steps.forEach((st, i) => {
    H.stepBadge(s, tx, ty, i + 1);
    H.stepText(s, tx + 0.6, ty, tw - 0.6, st[0], st[1]);
    ty += 1.35;
  });
}

// ------------------------------------------------------------ 5. TELA 1 — NAVEGAR
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Tela 1", "Visão Geral — como navegar", { pageNum: 5 });
  const area = H.appFrame(s, { breadcrumb: "A3 Estratégicos", active: "A3 Estratégicos", w: 8.3 });
  const pad = 0.24;
  const cx = area.x + pad, cy = area.y + pad, cw = area.w - pad * 2;
  H.card(s, cx, cy, cw, 1.05, { line: COLORS.blue, lineWidth: 1.5 });
  s.addText("Norte Verdadeiro", { x: cx + 0.18, y: cy + 0.1, w: 4, h: 0.24, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 11, bold: true, color: COLORS.white });
  const goals = [["Receita Líquida", "R$ 200 mi"], ["Pecuária", "R$ 40 mi"], ["EBITDA", "> 20%"]];
  const gw = (cw - 0.36) / 3 - 0.06;
  goals.forEach((g, i) => {
    const gxx = cx + 0.18 + i * (gw + 0.06);
    s.addShape("roundRect", { x: gxx, y: cy + 0.4, w: gw, h: 0.5, rectRadius: 0.05, fill: { color: COLORS.panelAlt }, line: { color: COLORS.lineSoft, width: 0.75 } });
    s.addText(g[0], { x: gxx + 0.08, y: cy + 0.45, w: gw - 0.16, h: 0.18, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 7.5, color: COLORS.faint });
    s.addText(g[1], { x: gxx + 0.08, y: cy + 0.64, w: gw - 0.16, h: 0.22, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9.5, bold: true, color: COLORS.white });
  });
  const rows = [
    ["EBITDA", "4F7CFF", "E", "1/4 dentro da meta", "neg"],
    ["Comercial", "14B8A6", "C", "2/2 dentro da meta", "pos"],
    ["Fabril", "8B5CF6", "F", "3/4 dentro da meta", "neg"]
  ];
  let ry = cy + 1.35;
  rows.forEach((r) => {
    H.areaRow(s, cx, ry, cw, { color: r[1], letter: r[2], name: "A3 " + r[0], sub: "clique para abrir", badgeText: r[3], badgeTone: r[4] });
    ry += 0.64;
  });

  const tx = area.outer.x + area.outer.w + 0.3, tw = 12.23 - area.outer.w - 0.3;
  const legend = [
    ["Norte Verdadeiro", "Metas macro da empresa para o ano — informativo, você não edita aqui."],
    ["Lista de Áreas", "Cada linha é um A3. O selo à direita mostra quantos indicadores estão dentro da meta."],
    ["Clique numa Área", "Abre o A3 digital dela: objetivo, gráficos e plano de ação."]
  ];
  let ly = 1.5;
  legend.forEach((l, i) => {
    H.stepBadge(s, tx, ly, i + 1, 0.36);
    s.addText(l[0], { x: tx + 0.5, y: ly - 0.04, w: tw - 0.5, h: 0.26, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 11.5, bold: true, color: COLORS.white });
    s.addText(l[1], { x: tx + 0.5, y: ly + 0.22, w: tw - 0.5, h: 0.6, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9.3, color: COLORS.soft, lineSpacingMultiple: 1.25 });
    ly += 1.02;
  });
}

// ------------------------------------------------------------ 6. TELA 2 — LER O GRÁFICO
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Tela 2", "Abrindo uma Área — como ler o gráfico", { pageNum: 6 });
  const area = H.appFrame(s, { breadcrumb: "A3 Estratégicos › A3 Comercial", active: "A3 Estratégicos", w: 8.3 });
  const pad = 0.22;
  const cx = area.x + pad, cy = area.y + pad, cw = area.w - pad * 2;
  H.card(s, cx, cy, cw, 0.72, {});
  s.addText("A3 Comercial", { x: cx + 0.16, y: cy + 0.1, w: 4, h: 0.26, isTextBox: true, margin: 0, fontFace: H.FONT_HEAD, fontSize: 12, bold: true, color: A3_COLORS.comercial });
  s.addText("Crescer faturamento e volume com mix saudável entre Grãos, Pecuária, Peças e Exportação.", { x: cx + 0.16, y: cy + 0.4, w: cw - 0.32, h: 0.28, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 8.3, color: COLORS.soft });
  const chartY = cy + 0.9;
  H.card(s, cx, chartY, cw, 3.1, {});
  s.addText("Faturamento — Realizado x Meta mensal", { x: cx + 0.16, y: chartY + 0.1, w: cw - 0.3, h: 0.22, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, bold: true, color: COLORS.white });
  H.kpiChart(pptx, s, cx + 0.1, chartY + 0.34, cw - 0.2, 2.65, {
    title: "", categories: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul"],
    actual: [14.2, 15.8, 13.9, 16.4, 17.1, 18.0, 17.4], target: [15, 15, 15, 16, 16, 17, 17]
  });

  const tx = area.outer.x + area.outer.w + 0.3, tw = 12.23 - area.outer.w - 0.3;
  const legend = [
    ["Barra azul = Realizado", "O que já foi lançado naquele mês."],
    ["Linha laranja = Meta", "O combinado para o mês — comparação direta com a barra."],
    ["No app, a cor da barra muda", "Verde = dentro da meta. Vermelha = fora (ou dentro da margem de atenção) — simplificado aqui em azul só para ilustrar."],
    ["Abaixo do gráfico", "Causas/contramedidas e o plano de ação do indicador."]
  ];
  let ly = 1.5;
  legend.forEach((l, i) => {
    H.stepBadge(s, tx, ly, i + 1, 0.36);
    s.addText(l[0], { x: tx + 0.5, y: ly - 0.04, w: tw - 0.5, h: 0.26, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 11.5, bold: true, color: COLORS.white });
    s.addText(l[1], { x: tx + 0.5, y: ly + 0.22, w: tw - 0.5, h: 0.55, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9.3, color: COLORS.soft, lineSpacingMultiple: 1.25 });
    ly += 0.95;
  });
}

// ------------------------------------------------------------ 7. PASSO A PASSO — LANÇAR INDICADOR SIMPLES
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Passo a passo", "Lançar um indicador (direto ou automático)", { pageNum: 7 });
  const area = H.appFrame(s, { breadcrumb: "A3 Estratégicos › A3 Comercial › Lançamento", active: "A3 Estratégicos", w: 7.5 });
  const pad = 0.24;
  const cx = area.x + pad, cy = area.y + pad, cw = area.w - pad * 2;
  H.card(s, cx, cy, cw, 0.5, {});
  s.addText("A3 Comercial — lançamento mensal · Jul/2026", { x: cx + 0.16, y: cy + 0.13, w: cw - 0.3, h: 0.26, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9.5, bold: true, color: COLORS.white });
  const ry0 = cy + 0.7;
  s.addShape("roundRect", { x: cx, y: ry0, w: cw, h: 1.15, rectRadius: 0.06, fill: { color: COLORS.panelAlt }, line: { color: COLORS.blue, width: 1.25 } });
  s.addText("Faturamento Exportação", { x: cx + 0.16, y: ry0 + 0.08, w: cw - 0.3, h: 0.24, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, bold: true, color: COLORS.white });
  H.field(s, cx + 0.16, ry0 + 0.32, (cw - 0.5) / 2, "Meta", "R$ 800 mil", { h: 0.42 });
  H.field(s, cx + 0.16 + (cw - 0.5) / 2 + 0.18, ry0 + 0.32, (cw - 0.5) / 2, "Real", "820000", { h: 0.42 });
  H.button(s, cx + cw - 1.3, ry0 + 0.8, 1.1, 0.28, "Salvar", { primary: true });
  s.addText("EBITDA % Mensal", { x: cx + 0.16, y: ry0 + 1.35, w: 3, h: 0.22, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 9, color: COLORS.faint });
  H.pill(s, cx + 2.05, ry0 + 1.32, 0.7, 0.24, "Auto", "blue");

  const tx = area.outer.x + area.outer.w + 0.3, tw = 12.23 - area.outer.w - 0.3;
  const steps = [
    ["Abra “Preenchimento mensal”", "Dentro do A3, no canto superior direito da tela."],
    ["Encontre o indicador", "Cada linha é um KPI — nome, meta e campo de realizado."],
    ["Digite o Real (ou confira o Auto)", "Indicadores “Auto” já vêm calculados — “Sincronizar automáticos” atualiza a sugestão, mas você ainda pode ajustar."],
    ["Clique em Salvar", "Um “✓ Salvo” aparece rapidinho ao lado — se sair sem salvar, o sistema avisa."]
  ];
  let ty = 1.5;
  steps.forEach((st, i) => {
    H.stepBadge(s, tx, ty, i + 1);
    H.stepText(s, tx + 0.6, ty, tw - 0.6, st[0], st[1]);
    ty += 1.28;
  });
}

// ------------------------------------------------------------ 8. PASSO A PASSO — CAUSAS/CONTRAMEDIDAS
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Passo a passo", "Registrar causa e contramedida", { pageNum: 8 });
  const area = H.appFrame(s, { breadcrumb: "A3 Estratégicos › A3 Comercial", active: "A3 Estratégicos", w: 7.5 });
  const modal = H.modalMock(s, area, { title: "", w: 6.2, h: 2.7 });
  s.addText("Causas e contramedidas", { x: modal.x + 0.3, y: modal.y + 0.26, w: modal.w - 0.6, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_HEAD, fontSize: 14, bold: true, color: COLORS.white });
  let fy = modal.y + 0.7;
  H.field(s, modal.x + 0.3, fy, 1.7, "Tipo", "Causa");
  H.field(s, modal.x + 2.15, fy, modal.w - 2.45, "Descrição", "Chuva atrasou colheita em MT/GO");
  fy += 0.65;
  s.addText("Anexo (opcional)", { x: modal.x + 0.3, y: fy, w: 3, h: 0.2, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 8, bold: true, color: COLORS.faint });
  H.button(s, modal.x + 0.3, fy + 0.22, 2.0, 0.34, "Selecionar arquivo", {});
  H.button(s, modal.x + modal.w - 2.7, modal.y + modal.h - 0.55, 1.3, 0.36, "Cancelar", {});
  H.button(s, modal.x + modal.w - 1.3, modal.y + modal.h - 0.55, 1.1, 0.36, "Adicionar", { primary: true });

  const tx = area.outer.x + area.outer.w + 0.3, tw = 12.23 - area.outer.w - 0.3;
  const steps = [
    ["Abra o indicador fora da meta", "Cada indicador tem sua própria seção de “Causas e contramedidas”, logo abaixo do gráfico."],
    ["Clique em “+ Novo item”", "Escolha o tipo: Causa (o que aconteceu) ou Contramedida (o que você vai fazer)."],
    ["Descreva em 1 frase", "Direto ao ponto — o objetivo é registrar, não redigir um relatório."],
    ["Anexe evidência se fizer sentido", "Print, planilha, e-mail — o que ajudar quem for revisar depois."]
  ];
  let ty = 1.5;
  steps.forEach((st, i) => {
    H.stepBadge(s, tx, ty, i + 1);
    H.stepText(s, tx + 0.6, ty, tw - 0.6, st[0], st[1]);
    ty += 1.28;
  });
}

// ------------------------------------------------------------ 9. PASSO A PASSO — PLANO DE AÇÃO
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Passo a passo", "Criar e acompanhar uma ação", { pageNum: 9 });
  const area = H.appFrame(s, { breadcrumb: "A3 Estratégicos › A3 Comercial", active: "A3 Estratégicos", w: 7.7 });
  const modal = H.modalMock(s, area, { title: "", w: 6.6, h: 4.5 });
  s.addText("Nova ação", { x: modal.x + 0.3, y: modal.y + 0.24, w: modal.w - 0.6, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_HEAD, fontSize: 14, bold: true, color: COLORS.white });
  let fy = modal.y + 0.65;
  H.field(s, modal.x + 0.3, fy, modal.w - 0.6, "Descrição da ação", "Reforçar time comercial no Oeste");
  fy += 0.62;
  const third = (modal.w - 0.9) / 3;
  H.field(s, modal.x + 0.3, fy, third, "Prazo", "30/09/2026");
  H.field(s, modal.x + 0.3 + third + 0.15, fy, third, "Status", "Em andamento");
  H.field(s, modal.x + 0.3 + 2 * (third + 0.15), fy, third, "Prioridade", "Alta");
  fy += 0.62;
  H.field(s, modal.x + 0.3, fy, (modal.w - 0.75) / 2, "Progresso", "60%");
  H.field(s, modal.x + 0.3 + (modal.w - 0.75) / 2 + 0.15, fy, (modal.w - 0.75) / 2, "Responsáveis", "2 selecionados");
  fy += 0.62;
  s.addText("Anexos (opcional)", { x: modal.x + 0.3, y: fy, w: 3, h: 0.2, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 8, bold: true, color: COLORS.faint });
  H.button(s, modal.x + 0.3, fy + 0.22, 1.6, 0.32, "+ Anexar", {});
  H.button(s, modal.x + modal.w - 2.9, modal.y + modal.h - 0.55, 1.3, 0.36, "Cancelar", {});
  H.button(s, modal.x + modal.w - 1.5, modal.y + modal.h - 0.55, 1.2, 0.36, "Salvar ação", { primary: true });

  const tx = area.outer.x + area.outer.w + 0.3, tw = 12.23 - area.outer.w - 0.3;
  const steps = [
    ["“+ Nova ação” no indicador", "Mesmo lugar das causas/contramedidas, na aba de plano de ação."],
    ["Descreva e defina prazo", "Status começa em “Não iniciada” — mude conforme o trabalho avança."],
    ["Marque prioridade e progresso", "Campos opcionais, mas ajudam quem revisa o A3 a priorizar."],
    ["Adicione responsáveis", "Todo mundo marcado recebe notificação quando é atribuído."],
    ["Volte sempre que o status mudar", "Editar é o mesmo botão — “Concluída”/“Cancelada” travam novos anexos."]
  ];
  let ty = 1.5;
  steps.forEach((st, i) => {
    H.stepBadge(s, tx, ty, i + 1);
    H.stepText(s, tx + 0.6, ty, tw - 0.6, st[0], st[1]);
    ty += 1.1;
  });
}

// ------------------------------------------------------------ 10. ANEXOS
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Evidências", "Anexar documentos de suporte", { pageNum: 10 });
  H.card(s, 0.55, 1.5, 6.0, 2.3, {});
  s.addText("Ícone de clipe no indicador", { x: 0.8, y: 1.7, w: 5.5, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 12.5, bold: true, color: COLORS.white });
  s.addShape("roundRect", { x: 0.8, y: 2.15, w: 5.5, h: 0.55, rectRadius: 0.06, fill: { color: COLORS.panelAlt }, line: { color: COLORS.lineSoft, width: 1 } });
  s.addText("EBITDA % Mensal", { x: 1.0, y: 2.3, w: 3.2, h: 0.26, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, bold: true, color: COLORS.white });
  s.addText("Anexos", { x: 4.7, y: 2.24, w: 0.7, h: 0.3, isTextBox: true, margin: 0, align: "right", valign: "middle", fontFace: H.FONT_BODY, fontSize: 9, color: COLORS.faint });
  H.pill(s, 5.5, 2.26, 0.45, 0.3, "3", "blue");
  s.addText("O número mostra quantos arquivos já foram anexados NESTE mês, ao lado do clipe do indicador.", { x: 0.8, y: 2.85, w: 5.5, h: 0.7, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, color: COLORS.soft, lineSpacingMultiple: 1.25 });

  H.card(s, 6.85, 1.5, 5.93, 2.3, {});
  s.addText("Onde mais dá pra anexar", { x: 7.1, y: 1.7, w: 5.4, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 12.5, bold: true, color: COLORS.white });
  const spots = ["Cada causa/contramedida", "Cada ação do plano (enquanto não estiver concluída/cancelada)", "O registro mensal do indicador (ícone de clipe)"];
  let sy = 2.1;
  spots.forEach((sp) => {
    s.addText("•  " + sp, { x: 7.1, y: sy, w: 5.4, h: 0.35, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10, color: COLORS.soft });
    sy += 0.5;
  });

  H.card(s, 0.55, 4.05, 12.23, 2.0, {});
  s.addText("Regras práticas", { x: 0.8, y: 4.25, w: 8, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 12.5, bold: true, color: COLORS.white });
  const rules = [
    "Limite de 20 MB por arquivo — o sistema avisa se passar disso.",
    "O anexo do indicador vale só para o mês selecionado no topo — troque de mês para ver os anexos daquele período.",
    "Clique num anexo já existente para abrir e conferir, sem precisar baixar."
  ];
  rules.forEach((r, i) => {
    s.addText("•  " + r, { x: 0.8, y: 4.6 + i * 0.42, w: 11.7, h: 0.38, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10.5, color: COLORS.soft });
  });
}

// ------------------------------------------------------------ 11. FECHAMENTO DE PERÍODO — PARA VOCÊ
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Rotina mensal", "O que muda quando o período fecha", { pageNum: 11 });
  const cols = [
    ["Período aberto", "Você lança, edita e corrige à vontade — nada trava.", COLORS.pos, "pos"],
    ["Período fechado", "Meta e realizado ficam somente-leitura — pra editar de novo, alguém precisa reabrir.", COLORS.neg, "neg"],
    ["Precisa corrigir um mês fechado?", "Fale com o Gestor da sua área ou com um administrador — só quem edita aquele A3 pode reabrir.", COLORS.amber, "warn"]
  ];
  let cx = 0.55;
  const cw = 3.95, gap = 0.19;
  cols.forEach((c) => {
    H.card(s, cx, 1.6, cw, 4.4, {});
    H.pill(s, cx + 0.25, 1.85, 2.6, 0.34, c[0], c[3]);
    s.addText(c[1], { x: cx + 0.25, y: 2.4, w: cw - 0.5, h: 2.5, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 12, color: COLORS.soft, lineSpacingMultiple: 1.4 });
    cx += cw + gap;
  });
  s.addText("Dica: o botão “Fechar período” / “Reabrir período” fica no topo da tela de Preenchimento Mensal.", {
    x: 0.55, y: 6.35, w: 12.2, h: 0.4, isTextBox: true, margin: 0, italic: true, fontFace: H.FONT_BODY, fontSize: 10.5, color: COLORS.faint
  });
}

// ------------------------------------------------------------ 12. NOTIFICAÇÕES
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Fique de olho", "Notificações que você pode receber", { pageNum: 12 });
  const rows = [
    ["Indicador fora da meta", "Quando o A3 que você acompanha fecha o mês com algum indicador em atenção ou fora da meta.", COLORS.neg],
    ["Prazo de ação vencendo", "Se você é responsável por uma ação, um aviso chega até 3 dias antes do prazo — e outro se ela vencer.", COLORS.amber],
    ["Você foi atribuído a uma ação", "Sempre que alguém te adiciona como responsável de uma ação do plano.", COLORS.blue]
  ];
  let ry = 1.6;
  rows.forEach((r) => {
    H.card(s, 0.55, ry, 12.23, 1.42, {});
    s.addShape("roundRect", { x: 0.8, y: ry + 0.24, w: 0.14, h: 0.94, rectRadius: 0.03, fill: { color: r[2] }, line: { type: "none" } });
    s.addText(r[0], { x: 1.1, y: ry + 0.16, w: 10.9, h: 0.3, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 13, bold: true, color: COLORS.white });
    s.addText(r[1], { x: 1.1, y: ry + 0.52, w: 11.3, h: 0.8, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10.5, color: COLORS.soft, lineSpacingMultiple: 1.3 });
    ry += 1.6;
  });
  s.addText("Notificações aparecem no sino, no topo do Vecton — o mesmo lugar dos outros módulos.", {
    x: 0.55, y: ry + 0.1, w: 12.2, h: 0.35, isTextBox: true, margin: 0, italic: true, fontFace: H.FONT_BODY, fontSize: 9.5, color: COLORS.faint
  });
}

// ------------------------------------------------------------ 13. ADMINISTRAÇÃO DO CATÁLOGO (RESUMO)
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Para quem também administra", "Cuidando do catálogo (resumo)", { pageNum: 13 });
  s.addText("Se o seu perfil também cuida do módulo (super_admin, admin, ou acesso concedido pontualmente), estas 4 ações estão na própria Tela 1/2:", {
    x: 0.55, y: 1.4, w: 12.2, h: 0.4, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 12.5, color: COLORS.soft
  });
  const items = [
    ["+ Criar A3", "Nova área estratégica (mãe ou filha de uma já existente)."],
    ["+ Criar indicador", "Novo KPI dentro de um A3 — sempre no modo manual (meta e real digitados)."],
    ["Editar Norte Verdadeiro", "Ajusta as metas macro da empresa, exibidas para todo mundo na Tela 1."],
    ["Itens arquivados", "Restaura um A3/indicador excluído, ou apaga de vez (se não tiver histórico)."]
  ];
  const cw = 5.95, gap = 0.33, rowH = 1.75;
  items.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.55 + col * (cw + gap), y = 2.0 + row * (rowH + 0.25);
    H.card(s, x, y, cw, rowH, {});
    H.pill(s, x + 0.25, y + 0.22, 2.2, 0.34, it[0], "blue");
    s.addText(it[1], { x: x + 0.25, y: y + 0.75, w: cw - 0.5, h: 0.85, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 11, color: COLORS.soft, lineSpacingMultiple: 1.3 });
  });
  s.addText("Não tem esses botões na sua tela? Você não precisa deles — é sinal de que seu acesso está certo. Peça a um admin se precisar de algo aqui.", {
    x: 0.55, y: 6.55, w: 12.2, h: 0.4, isTextBox: true, margin: 0, italic: true, fontFace: H.FONT_BODY, fontSize: 10, color: COLORS.faint
  });
}

// ------------------------------------------------------------ 14. FAQ + ENCERRAMENTO
{
  const s = pptx.addSlide();
  H.slideHeader(s, "Antes de terminar", "Perguntas frequentes", { pageNum: 14 });
  const faq = [
    ["Errei um número — dá para corrigir?", "Sim, enquanto o período estiver aberto. Basta digitar de novo e salvar."],
    ["Meu indicador é “Auto” — preciso fazer alguma coisa?", "Só conferir. Se o valor calculado não bater, avise o administrador — a fórmula pode precisar de ajuste."],
    ["Não vejo um A3 que deveria ver", "Fale com seu gestor ou com um administrador — acesso é concedido por área, não é automático."],
    ["Posso apagar uma ação por engano?", "Excluir é reversível apenas via reabertura; prefira mudar o status para “Cancelada” em vez de excluir."]
  ];
  const cw = 5.95, gap = 0.33, rowH = 1.7;
  faq.forEach((f, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.55 + col * (cw + gap), y = 1.55 + row * (rowH + 0.25);
    H.card(s, x, y, cw, rowH, {});
    s.addText("P: " + f[0], { x: x + 0.25, y: y + 0.18, w: cw - 0.5, h: 0.45, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 11.5, bold: true, color: COLORS.blue, lineSpacingMultiple: 1.15 });
    s.addText("R: " + f[1], { x: x + 0.25, y: y + 0.68, w: cw - 0.5, h: 0.9, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10.5, color: COLORS.soft, lineSpacingMultiple: 1.25 });
  });
  s.addText("Dúvidas do dia a dia: fale com seu Gestor. Dúvidas de acesso/cadastro: administrador do módulo (Controladoria / TI).", {
    x: 0.55, y: 6.6, w: 12.2, h: 0.4, isTextBox: true, margin: 0, fontFace: H.FONT_BODY, fontSize: 10.5, color: COLORS.faint
  });
}

// Deck final vive FORA do repo (Área de Trabalho), mesmo padrão do Sincerão —
// ver [[project_sincerao]]. Este script fica versionado aqui só como gerador.
pptx.writeFile({ fileName: __dirname + "/../../../A3 Estrategico - Guia do Usuario.pptx" }).then((f) => console.log("OK:", f));
