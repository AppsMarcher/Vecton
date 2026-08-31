import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import fs from "node:fs/promises";

const workbookPath = "C:/Users/rguimaraes/Downloads/#INDICADORES# 2026.xlsx";
const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheetOverview = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 20000,
});

const workbookOverview = await workbook.inspect({
  kind: "workbook,sheet,table,definedName,drawing",
  maxChars: 40000,
  tableMaxRows: 10,
  tableMaxCols: 20,
  tableMaxCellChars: 120,
});

const sheets = [];
for (let index = 0; ; index += 1) {
  let sheet;
  try {
    sheet = workbook.worksheets.getItemAt(index);
  } catch {
    break;
  }
  if (!sheet) break;
  const used = sheet.getUsedRange();
  const address = used?.address || null;
  const formulas = await workbook.inspect({
    kind: "formula",
    sheetId: sheet.name,
    range: address || "A1:Z200",
    maxChars: 30000,
    options: { maxResults: 1000 },
  });
  const regions = await workbook.inspect({
    kind: "region",
    sheetId: sheet.name,
    range: address || "A1:Z200",
    maxChars: 50000,
    tableMaxRows: 80,
    tableMaxCols: 40,
    tableMaxCellChars: 150,
  });
  const drawings = await workbook.inspect({
    kind: "drawing",
    sheetId: sheet.name,
    maxChars: 20000,
  });
  sheets.push({
    index,
    name: sheet.name,
    usedRange: address,
    formulas: formulas.ndjson,
    regions: regions.ndjson,
    drawings: drawings.ndjson,
    tables: sheet.tables?.items?.map((table) => ({ name: table.name })) || [],
    charts: sheet.charts?.items?.map((chart) => ({
      name: chart.name,
      type: chart.type,
      title: chart.title,
      series: chart.series?.items?.map((series) => ({
        name: series.name,
        formula: series.formula,
        categoryFormula: series.categoryFormula,
      })) || [],
    })) || [],
  });
}

const report = JSON.stringify({
  sheetOverview: sheetOverview.ndjson,
  workbookOverview: workbookOverview.ndjson,
  sheets,
}, null, 2);
await fs.writeFile("./workbook-report.json", report, "utf8");
console.log(JSON.stringify({
  reportChars: report.length,
  sheets: sheets.map((sheet) => ({
    name: sheet.name,
    usedRange: sheet.usedRange,
    formulaChars: sheet.formulas.length,
    regionChars: sheet.regions.length,
    drawingChars: sheet.drawings.length,
    tables: sheet.tables.length,
    charts: sheet.charts.length,
  })),
}, null, 2));
