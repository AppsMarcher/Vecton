import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("C:/Users/rguimaraes/Downloads/#INDICADORES# 2026.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
await fs.mkdir("./renders", { recursive: true });

const rendered = [];
for (let index = 0; ; index += 1) {
  let sheet;
  try {
    sheet = workbook.worksheets.getItemAt(index);
  } catch {
    break;
  }
  if (!sheet) break;
  const safe = `${String(index).padStart(2, "0")}-${sheet.name.replace(/[<>:"/\\|?*#]+/g, "-").trim()}.png`;
  const preview = await workbook.render({
    sheetName: sheet.name,
    autoCrop: "all",
    scale: 0.8,
    format: "png",
  });
  const bytes = new Uint8Array(await preview.arrayBuffer());
  await fs.writeFile(`./renders/${safe}`, bytes);
  rendered.push({ name: sheet.name, file: safe, bytes: bytes.length });
  console.log(JSON.stringify(rendered.at(-1)));
}
