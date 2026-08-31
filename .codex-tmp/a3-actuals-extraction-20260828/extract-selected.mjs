import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/Users/rguimaraes/Downloads/#INDICADORES# 2026.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));

const selections = [
  ["A3 EBITDA", "V1:AP8"],
  ["A3  COMERCIAL", "W1:AI8"],
  ["A3 SUPPLY CHAIN", "X1:BJ8"],
  ["A3  FABRIL", "W1:BG8"],
  ["A3 FORMATAÇÃO ÁREA TÉCNICA", "X1:BF8"],
  ["A3  PEP", "W1:BH8"],
  ["A3  MARKETING", "X1:AZ8"],
  ["A3  ENGENHARIA", "W1:CB8"],
  ["A3 PESSOAS ", "X1:DQ8"],
  ["A3 Filho exportação ", "W1:BC8"],
  ["A3 Filho pecuária", "W1:AX8"],
  ["A3 Filho Peças", "W1:AP8"],
  ["A3 Filho estoques", "X1:BK8"],
  ["A3 Filho Compras", "W1:BZ8"],
];

const out = [];
for (const [sheetName, address] of selections) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const range = sheet.getRange(address);
  let numberFormat = null;
  try {
    numberFormat = range.format.numberFormat;
  } catch {
    // Some imported workbooks expose formats only through computed style.
  }
  out.push({
    sheet: sheetName,
    address,
    values: range.values,
    formulas: range.formulas,
    numberFormat,
  });
}

await fs.writeFile(
  new URL("./selected-ranges.json", import.meta.url),
  JSON.stringify(out, null, 2),
  "utf8",
);

console.log(JSON.stringify(out.map(({ sheet, address }) => ({ sheet, address })), null, 2));
