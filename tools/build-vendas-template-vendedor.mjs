import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("templates/modelo-carga-vendas.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("Carga Vendas");

// Reutiliza a formatação da última coluna existente e só acrescenta a nova.
sheet.getRange("I1:I23").copyTo(sheet.getRange("J1:J23"), "all");
sheet.getRange("J1:J9").values = [
  ["cod_vendedor"], ["'000636"], ["'000672"], ["'000590"], [""], ["'000673"], [""], ["'000633"], [""]
];
sheet.getRange("J11:J23").clear({ applyTo: "contents" });
sheet.getRange("A12").values = [["origem      -> FAT = item já faturado (NF emitida)  |  CART = item em carteira (pedido a faturar)"]];
sheet.getRange("A20").values = [["cod_vendedor -> código completo do vendedor como TEXTO (preserve os zeros). OBRIGATÓRIO para FAT e CART."]];
sheet.getRange("A21").values = [["%MB         -> margem bruta em % (OPCIONAL; ex: 31,8% = 0,318)."]];
sheet.getRange("A23").values = [["O sistema DERIVA sozinho (não coloque na planilha): coordenação, responsável, linha de negócio, cultura, cidade/UF. Campanhas usam cod_vendedor + vigência da ATRIBUIÇÃO."]];
sheet.getRange("J1:J9").format.numberFormat = "@";
sheet.getRange("J1:J23").format.columnWidth = 18;
sheet.getRange("J1").format = {
  fill: "#1F3B57",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center"
};

const check = await workbook.inspect({ kind: "table,region", sheetId: "Carga Vendas", range: "A1:J23", maxChars: 3000, tableMaxRows: 10, tableMaxCols: 10 });
console.log(check.ndjson);
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save("templates/modelo-carga-vendas-vendedor.xlsx");
const preview = await workbook.render({ sheetName: "Carga Vendas", autoCrop: "all", scale: 1.4, format: "png" });
await fs.writeFile("tools/vendas-template-vendedor-preview.png", new Uint8Array(await preview.arrayBuffer()));
