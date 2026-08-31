import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/Users/rguimaraes/Downloads/#INDICADORES# 2026.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));

function columnName(index) {
  let value = index + 1;
  let out = "";
  while (value > 0) {
    value -= 1;
    out = String.fromCharCode(65 + (value % 26)) + out;
    value = Math.floor(value / 26);
  }
  return out;
}

const sheets = [];
const chartSeries = [];
for (let index = 0; ; index += 1) {
  let sheet;
  try {
    sheet = workbook.worksheets.getItemAt(index);
  } catch {
    break;
  }
  if (!sheet) break;

  for (const chart of sheet.charts?.items || []) {
    const series = [];
    for (const item of chart.series?.items || []) {
      let seriesValues = null;
      const formula = String(item.formula || "").replace(/^=/, "");
      const match = formula.match(/^(?:'([^']+)'|([^!]+))!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/);
      if (match && match[3] === match[5]) {
            const sheetName = match[1] !== undefined ? match[1] : match[2].trim();
            const sourceSheet = workbook.worksheets.getItem(sheetName);
        seriesValues = sourceSheet.getRange(`${match[3]}${match[4]}:${match[5]}${match[6]}`).values.flat();
      }
      series.push({
        name: item.name,
        formula: item.formula,
        categoryFormula: item.categoryFormula,
        values: seriesValues,
      });
    }
    chartSeries.push({ sheet: sheet.name, title: chart.title, series });
  }
  const used = sheet.getUsedRange();
  const rowCount = Math.min(22, used?.rowCount || 22);
  const colCount = used?.columnCount || 1;
  if (colCount <= 21) {
    sheets.push({ name: sheet.name, blocks: [] });
    continue;
  }

  const range = sheet.getRangeByIndexes(0, 21, rowCount, colCount - 21);
  const values = range.values;
  const formulas = range.formulas;
  const blocks = [];

  for (let relativeCol = 0; relativeCol < values[0].length - 1; relativeCol += 1) {
    const title = values[0][relativeCol];
    const nextHeader = String(values[0][relativeCol + 1] ?? "").trim().toLowerCase();
    if (title == null || !["mês", "mes", "meses"].includes(nextHeader)) continue;

    let endCol = relativeCol;
    while (endCol + 1 < values[0].length && values[0][endCol + 1] != null && values[0][endCol + 1] !== "") {
      endCol += 1;
    }

    const fields = [];
    for (let c = relativeCol; c <= endCol; c += 1) {
      const absoluteCol = 21 + c;
      fields.push({
        column: columnName(absoluteCol),
        header: String(values[0][c] ?? "").trim(),
        values: Array.from({ length: 12 }, (_, offset) => values[offset + 1]?.[c] ?? null),
        formulas: Array.from({ length: 12 }, (_, offset) => formulas[offset + 1]?.[c] ?? null),
        summaryValue: values[13]?.[c] ?? null,
        summaryFormula: formulas[13]?.[c] ?? null,
      });
    }
    blocks.push({ title: String(title).trim(), fields });
  }
  sheets.push({ name: sheet.name, blocks });
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 500 },
  maxChars: 20000,
});

await fs.writeFile(
  ".codex-tmp/a3-actuals-extraction-20260828/actual-blocks.json",
  JSON.stringify({ sourcePath, sheets, formulaErrors: errors.ndjson }, null, 2),
  "utf8",
);

await fs.writeFile(
  ".codex-tmp/a3-actuals-extraction-20260828/chart-series.json",
  JSON.stringify(chartSeries, null, 2),
  "utf8",
);

console.log(JSON.stringify({
  sheets: sheets.map((sheet) => ({ name: sheet.name, blocks: sheet.blocks.length })),
  formulaErrors: errors.ndjson ? errors.ndjson.split("\n").filter(Boolean).length : 0,
}, null, 2));
