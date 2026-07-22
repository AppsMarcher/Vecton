import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("templates/modelo-carga-vendas.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
const summary = await workbook.inspect({
  kind: "workbook,sheet,table,region",
  maxChars: 4000,
  tableMaxRows: 10,
  tableMaxCols: 20,
});
console.log(summary.ndjson);
