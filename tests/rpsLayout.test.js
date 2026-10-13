const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const moduleSource = fs.readFileSync(path.join(__dirname, "..", "src", "modules", "rps", "rpsModule.js"), "utf8");
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
  /\.rps-area-row th\s*\{[^}]*position:\s*sticky;[^}]*top:\s*var\(--rps-head-h,\s*38px\);/s,
  "o cabeçalho da área deve ficar fixo abaixo do cabeçalho das colunas, na altura medida"
);
assert.match(
  moduleSource,
  /setProperty\("--rps-head-h"/,
  "a altura real do cabeçalho das colunas deve ser medida em JS"
);
assert.match(
  moduleSource,
  /<tbody class="rps-area-group">/,
  "cada área deve ser um tbody próprio para o sticky trocar de área"
);
assert.match(
  styles,
  /@media \(max-width:\s*720px\)[\s\S]*#rps-view\.content-view\.active\s*\{[^}]*flex:\s*none;[^}]*overflow:\s*visible;/,
  "em telas pequenas, a rolagem natural da página deve ser preservada"
);
const cssAsset = index.match(/href="(styles\.css\?v=[^"]+)"/)?.[1];
assert.ok(cssAsset, "o CSS deve possuir uma versão de cache");
const worker = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
assert.ok(worker.includes(`"./${cssAsset}"`), "o PWA deve usar a mesma versão de CSS do HTML");
