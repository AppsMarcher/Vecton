const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

assert.match(
  styles,
  /#rps-view\.content-view\.active\s*\{[^}]*flex:\s*1 1 0;[^}]*overflow:\s*hidden;/s,
  "a view da RPS deve ocupar apenas a altura disponível e conter a rolagem"
);
assert.match(
  styles,
  /\.rps-root\s*\{[^}]*display:\s*flex;[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;/s,
  "a raiz da RPS deve propagar a altura limitada até a tabela"
);
assert.match(
  styles,
  /\.rps-table-scroll\s*\{[^}]*overflow:\s*auto;[^}]*overscroll-behavior:\s*contain;/s,
  "somente o contêiner da tabela deve receber a rolagem"
);
assert.match(
  styles,
  /\.rps-table thead th\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s,
  "os cabeçalhos das colunas devem permanecer visíveis"
);
assert.match(
  styles,
  /@media \(max-width:\s*720px\)[\s\S]*#rps-view\.content-view\.active\s*\{[^}]*flex:\s*none;[^}]*overflow:\s*visible;/,
  "em telas pequenas, a rolagem natural da página deve ser preservada"
);
assert.match(index, /styles\.css\?v=20260902d/, "o cache do CSS deve ser renovado");
