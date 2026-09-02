const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "modules", "messages", "messagesModule.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.doesNotMatch(
  source,
  /<select[^>]+id="msn-presenca"/,
  "o status não deve abrir o seletor branco nativo do iOS"
);
assert.match(source, /aria-haspopup="listbox"/, "o botão deve anunciar o seletor de status");
assert.match(source, /class="msn-presenca-menu" role="listbox"/, "as opções devem usar o menu visual do app");
assert.match(source, /data-presenca-value="\$\{item\.valor\}"/, "cada opção deve carregar o status correspondente");
assert.match(source, /class="msn-presenca-dot" data-presenca=/, "o status atual e as opções devem exibir a bolinha colorida");
assert.match(source, /callSupabaseRpc\("set_my_presence", \{ p_choice: presenca\.valor \}\)/, "a escolha deve continuar sendo salva no perfil");

assert.match(
  styles,
  /\.msn-presenca-menu\s*\{[^}]*border:\s*1px solid var\(--msn-divider\);[^}]*border-radius:\s*12px;[^}]*background:\s*var\(--msn-surface-raised\);/s,
  "o menu deve manter o padrão escuro, contornado e arredondado dos filtros"
);
assert.match(styles, /\.msn-presenca-dot\[data-presenca="ausente"\]/, "Ausente deve ter cor própria");
assert.match(styles, /\.msn-presenca-dot\[data-presenca="ocupado"\]/, "Ocupado deve ter cor própria");
assert.match(styles, /\.msn-presenca-dot\[data-presenca="invisivel"\]/, "Invisível deve ter cor própria");
assert.match(index, /messagesModule\.js\?v=20260902a/, "o cache do módulo de mensagens deve ser renovado");

console.log("messages presence picker tests: ok");
