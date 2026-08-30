// Helpers compartilhados pelos 2 decks do módulo A3 Estratégico (Vecton Planning).
// Paleta = paleta REAL do módulo (--sa3-* em strategicModule.js), não genérica.
"use strict";

const COLORS = {
  bg: "0A0A0D",
  bgSoft: "111318",
  panel: "16181D",
  panelAlt: "1B1D23",
  panelHover: "20222A",
  line: "2A2D34",
  lineSoft: "34363E",
  text: "FFFFFF",
  soft: "A1A7B3",
  faint: "6B7280",
  blue: "4F7CFF",
  blueDim: "1E2A57",
  pos: "4ADE80",
  posDim: "163826",
  neg: "F87171",
  negDim: "3A1E1E",
  amber: "F59E0B",
  amberDim: "3A2A0E",
  violet: "8B5CF6",
  white: "FFFFFF"
};

// Cores reais das 14 A3 (tools/strategic-a3-catalog-2026.json)
const A3_COLORS = {
  ebitda: "4F7CFF",
  comercial: "14B8A6",
  supply_chain: "F59E0B",
  fabril: "8B5CF6",
  produto: "F472B6",
  areas_tecnicas: "6366F1",
  engenharia: "4F7CFF",
  marketing: "FB923C",
  pessoas: "A78BFA",
  exportacao: "14B8A6",
  pecuaria: "14B8A6",
  pecas: "14B8A6",
  estoques: "F59E0B",
  compras: "F59E0B"
};

const FONT_HEAD = "Calibri";
const FONT_BODY = "Calibri";

function newDeck(pptxgen, subtitle) {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
  pptx.layout = "WIDE";
  pptx.author = "VectonPlan";
  pptx.company = "Marcher Brasil";
  pptx.subject = subtitle || "";
  return pptx;
}

function bg(slide, color) {
  slide.background = { color: color || COLORS.bg };
}

// Kicker + título no topo de qualquer slide de conteúdo.
function slideHeader(slide, kicker, title, opts = {}) {
  bg(slide, COLORS.bg);
  if (kicker) {
    slide.addText(kicker.toUpperCase(), {
      x: 0.55, y: 0.38, w: 10, h: 0.3, isTextBox: true, margin: 0,
      fontFace: FONT_BODY, fontSize: 11, bold: true, color: COLORS.blue, charSpacing: 2
    });
  }
  slide.addText(title, {
    x: 0.55, y: kicker ? 0.63 : 0.45, w: 11.6, h: 0.6, isTextBox: true, margin: 0,
    fontFace: FONT_HEAD, fontSize: opts.titleSize || 28, bold: true, color: COLORS.white
  });
  if (opts.pageNum) {
    slide.addText(String(opts.pageNum), {
      x: 12.7, y: 7.08, w: 0.5, h: 0.3, isTextBox: true, margin: 0,
      fontFace: FONT_BODY, fontSize: 10, color: COLORS.faint, align: "right"
    });
  }
  slide.addText("A3 Estratégico · Vecton Planning", {
    x: 0.55, y: 7.08, w: 6, h: 0.3, isTextBox: true, margin: 0,
    fontFace: FONT_BODY, fontSize: 9, color: COLORS.faint
  });
}

// Retângulo "card" no estilo .sa3-card (painel escuro, borda sutil, cantos arredondados).
function card(slide, x, y, w, h, opts = {}) {
  slide.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.09,
    fill: { color: opts.fill || COLORS.panel },
    line: { color: opts.line || COLORS.lineSoft, width: opts.lineWidth || 1 },
    shadow: opts.noShadow ? undefined : { type: "outer", color: "000000", opacity: 0.35, blur: 12, offset: 3, angle: 90 }
  });
}

function pill(slide, x, y, w, h, text, tone) {
  const tones = {
    pos: { fill: COLORS.posDim, color: COLORS.pos },
    neg: { fill: COLORS.negDim, color: COLORS.neg },
    warn: { fill: COLORS.amberDim, color: COLORS.amber },
    muted: { fill: COLORS.panelAlt, color: COLORS.faint },
    blue: { fill: COLORS.blueDim, color: COLORS.blue }
  };
  const t = tones[tone] || tones.muted;
  slide.addShape("roundRect", { x, y, w, h, rectRadius: h / 2, fill: { color: t.fill }, line: { type: "none" } });
  slide.addText(text, {
    x, y, w, h, isTextBox: true, margin: 0, align: "center", valign: "middle",
    fontFace: FONT_BODY, fontSize: 10, bold: true, color: t.color
  });
}

// Moldura do app: topo (logo+breadcrumb+período) + sidebar esquerda com o item ativo
// destacado — mesmo chrome real do Vecton, reaproveitado em toda tela "mockup" pra dar
// consistência visual (motivo do deck) sem precisar de print real.
const SIDEBAR_ITEMS = ["Dashboard", "RPS Gestão", "Relatórios Gerenciais", "A3 Estratégicos", "Planejamento", "Parâmetros"];

function appFrame(slide, { breadcrumb = "A3 Estratégicos", period = "Ago/2026", active = "A3 Estratégicos", x = 0.55, y = 1.15, w = 12.23, h = 5.75 } = {}) {
  // moldura externa
  slide.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.06,
    fill: { color: COLORS.bgSoft }, line: { color: COLORS.line, width: 1 },
    shadow: { type: "outer", color: "000000", opacity: 0.45, blur: 18, offset: 4, angle: 90 }
  });
  // barra superior
  const topH = 0.5;
  slide.addShape("rect", { x, y, w, h: topH, fill: { color: COLORS.panel }, line: { type: "none" } });
  slide.addShape("line", { x, y: y + topH, w, h: 0, line: { color: COLORS.line, width: 1 } });
  slide.addShape("roundRect", { x: x + 0.22, y: y + 0.13, w: 0.24, h: 0.24, rectRadius: 0.05, fill: { color: COLORS.blue }, line: { type: "none" } });
  slide.addText("VECTON", { x: x + 0.52, y: y + 0.1, w: 1.3, h: 0.3, isTextBox: true, margin: 0, fontFace: FONT_HEAD, fontSize: 11, bold: true, color: COLORS.white });
  slide.addText(`GESTÃO ESTRATÉGICA   ›   ${breadcrumb}`, {
    x: x + 2.0, y: y + 0.1, w: 6, h: 0.3, isTextBox: true, margin: 0,
    fontFace: FONT_BODY, fontSize: 10, color: COLORS.soft
  });
  pill(slide, x + w - 1.55, y + 0.1, 1.15, 0.3, period, "muted");

  // sidebar
  const sbW = 2.15;
  slide.addShape("rect", { x, y: y + topH, w: sbW, h: h - topH, fill: { color: COLORS.panel }, line: { type: "none" } });
  slide.addShape("line", { x: x + sbW, y: y + topH, w: 0, h: h - topH, line: { color: COLORS.line, width: 1 } });
  let iy = y + topH + 0.28;
  SIDEBAR_ITEMS.forEach((item) => {
    const isActive = item === active;
    if (isActive) {
      slide.addShape("roundRect", { x: x + 0.12, y: iy - 0.06, w: sbW - 0.24, h: 0.36, rectRadius: 0.06, fill: { color: COLORS.blueDim }, line: { type: "none" } });
    }
    slide.addText(item, {
      x: x + 0.3, y: iy - 0.06, w: sbW - 0.5, h: 0.36, isTextBox: true, margin: 0, valign: "middle",
      fontFace: FONT_BODY, fontSize: 10.5, bold: isActive, color: isActive ? COLORS.white : COLORS.soft
    });
    iy += 0.5;
  });

  return { x: x + sbW, y: y + topH, w: w - sbW, h: h - topH, outer: { x, y, w, h } };
}

// Linha "Área" da Tela 1 (ícone quadrado colorido + nome + contagem + pill de status).
function areaRow(slide, x, y, w, { color, letter, name, sub, badgeText, badgeTone = "muted" }) {
  const h = 0.56;
  slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.07, fill: { color: COLORS.panelAlt }, line: { color: COLORS.lineSoft, width: 1 } });
  slide.addShape("roundRect", { x: x + 0.14, y: y + 0.11, w: 0.34, h: 0.34, rectRadius: 0.06, fill: { color, transparency: 80 }, line: { type: "none" } });
  slide.addText(letter, { x: x + 0.14, y: y + 0.11, w: 0.34, h: 0.34, isTextBox: true, margin: 0, align: "center", valign: "middle", fontFace: FONT_HEAD, fontSize: 12, bold: true, color: color });
  slide.addText(name, { x: x + 0.62, y: y + 0.06, w: w - 2.4, h: 0.26, isTextBox: true, margin: 0, fontFace: FONT_BODY, fontSize: 12, bold: true, color: COLORS.white });
  slide.addText(sub, { x: x + 0.62, y: y + 0.3, w: w - 2.4, h: 0.22, isTextBox: true, margin: 0, fontFace: FONT_BODY, fontSize: 9, color: COLORS.faint });
  if (badgeText) pill(slide, x + w - 1.85, y + h / 2 - 0.15, 1.6, 0.3, badgeText, badgeTone);
}

// KPI combo chart nativo (barras = realizado, linha = meta) — usado na tela de Detalhe.
function kpiChart(pptx, slide, x, y, w, h, { title, categories, actual, target, unit }) {
  const barData = [{ name: "Realizado", labels: categories, values: actual }];
  const lineData = [{ name: "Meta", labels: categories, values: target }];
  slide.addChart(
    [
      { type: pptx.ChartType.bar, data: barData, options: { chartColors: [COLORS.blue] } },
      { type: pptx.ChartType.line, data: lineData, options: { chartColors: [COLORS.amber], lineSize: 2.5, lineDataSymbol: "circle", lineDataSymbolSize: 5 } }
    ],
    {
      x, y, w, h,
      showTitle: !!title, title, titleColor: COLORS.soft, titleFontSize: 11, titleFontFace: FONT_BODY,
      showLegend: true, legendPos: "b", legendColor: COLORS.soft, legendFontSize: 9,
      catAxisLabelColor: COLORS.faint, catAxisLabelFontSize: 9, catAxisLineColor: COLORS.line,
      valAxisLabelColor: COLORS.faint, valAxisLabelFontSize: 9, valAxisLineColor: COLORS.line,
      valGridLine: { color: COLORS.line, size: 0.5 },
      catGridLine: { style: "none" },
      chartArea: { fill: { color: COLORS.panelAlt } },
      plotArea: { fill: { color: COLORS.panelAlt } },
      barGapWidthPct: 40,
      valAxisMinVal: 0
    }
  );
}

// Botão retangular (estilo .sa3-btn).
function button(slide, x, y, w, h, text, { primary = false } = {}) {
  slide.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.06,
    fill: primary ? { color: COLORS.blue } : { type: "none" },
    line: { color: primary ? COLORS.blue : COLORS.line, width: 1 }
  });
  slide.addText(text, {
    x, y, w, h, isTextBox: true, margin: 0, align: "center", valign: "middle",
    fontFace: FONT_BODY, fontSize: 10, bold: true, color: primary ? COLORS.white : COLORS.soft
  });
}

// Campo rotulado (label + caixa de input) — usado nos mockups de modal/formulário.
function field(slide, x, y, w, label, value, { h = 0.5 } = {}) {
  slide.addText(label.toUpperCase(), { x, y, w, h: 0.2, isTextBox: true, margin: 0, fontFace: FONT_BODY, fontSize: 8, bold: true, color: COLORS.faint, charSpacing: 1 });
  slide.addShape("roundRect", { x, y: y + 0.22, w, h: h - 0.22, rectRadius: 0.05, fill: { color: COLORS.panelAlt }, line: { color: COLORS.line, width: 1 } });
  slide.addText(value || "", { x: x + 0.12, y: y + 0.22, w: w - 0.24, h: h - 0.22, isTextBox: true, margin: 0, valign: "middle", fontFace: FONT_BODY, fontSize: 10, color: value ? COLORS.text : COLORS.faint });
}

// Modal centralizado (overlay + card) — estilo openSa3Modal().
function modalMock(slide, frameArea, { title, subtitle, w = 5.6, h = 4.3 } = {}) {
  const { x: fx, y: fy, w: fw, h: fh } = frameArea.outer;
  slide.addShape("rect", { x: fx, y: fy, w: fw, h: fh, fill: { color: "000000", transparency: 45 }, line: { type: "none" } });
  const mx = fx + (fw - w) / 2;
  const my = fy + (fh - h) / 2;
  slide.addShape("roundRect", {
    x: mx, y: my, w, h, rectRadius: 0.1,
    fill: { color: COLORS.panel }, line: { color: COLORS.lineSoft, width: 1 },
    shadow: { type: "outer", color: "000000", opacity: 0.5, blur: 20, offset: 6, angle: 90 }
  });
  slide.addText(title, { x: mx + 0.3, y: my + 0.24, w: w - 0.6, h: 0.35, isTextBox: true, margin: 0, fontFace: FONT_HEAD, fontSize: 15, bold: true, color: COLORS.white });
  if (subtitle) {
    slide.addText(subtitle, { x: mx + 0.3, y: my + 0.58, w: w - 0.6, h: 0.45, isTextBox: true, margin: 0, fontFace: FONT_BODY, fontSize: 9.5, color: COLORS.soft, lineSpacingMultiple: 1.15 });
  }
  return { x: mx, y: my, w, h, contentY: my + (subtitle ? 1.05 : 0.7) };
}

// Círculo numerado pra sequências "passo a passo".
function stepBadge(slide, x, y, num, size = 0.42) {
  slide.addShape("ellipse", { x, y, w: size, h: size, fill: { color: COLORS.blue }, line: { type: "none" } });
  slide.addText(String(num), { x, y, w: size, h: size, isTextBox: true, margin: 0, align: "center", valign: "middle", fontFace: FONT_HEAD, fontSize: 15, bold: true, color: COLORS.white });
}

// Bloco de texto de um passo (título + descrição), à direita de um stepBadge.
function stepText(slide, x, y, w, title, desc, { titleColor = COLORS.white } = {}) {
  slide.addText(title, { x, y: y - 0.04, w, h: 0.28, isTextBox: true, margin: 0, fontFace: FONT_BODY, fontSize: 13, bold: true, color: titleColor });
  slide.addText(desc, { x, y: y + 0.24, w, h: 0.7, isTextBox: true, margin: 0, fontFace: FONT_BODY, fontSize: 10.5, color: COLORS.soft, lineSpacingMultiple: 1.2 });
}

// Ícone circular simples com glifo de texto (fallback leve sem dependências de svg/sharp).
function iconCircle(slide, x, y, size, glyph, color) {
  slide.addShape("ellipse", { x, y, w: size, h: size, fill: { color, transparency: 85 }, line: { type: "none" } });
  slide.addText(glyph, { x, y, w: size, h: size, isTextBox: true, margin: 0, align: "center", valign: "middle", fontFace: FONT_BODY, fontSize: size * 34, bold: true, color: color });
}

module.exports = {
  COLORS, A3_COLORS, FONT_HEAD, FONT_BODY,
  newDeck, bg, slideHeader, card, pill, appFrame, areaRow, kpiChart, button, field, modalMock, stepBadge, stepText, iconCircle
};
