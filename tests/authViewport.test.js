const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const calls = { blur: 0, scroll: [], raf: 0, timeout: [] };
const bodyClasses = new Set(["auth-only"]);
const shellClasses = new Set(["active"]);
const focusedField = { blur: () => { calls.blur += 1; } };

global.window = {
  addEventListener: () => {},
  scrollTo: (x, y) => calls.scroll.push([x, y]),
  requestAnimationFrame: (callback) => { calls.raf += 1; callback(); },
  setTimeout: (callback, delay) => { calls.timeout.push(delay); callback(); }
};
global.document = {
  activeElement: focusedField,
  documentElement: { scrollTop: 48 },
  body: {
    scrollTop: 48,
    classList: { remove: (name) => bodyClasses.delete(name), add: (name) => bodyClasses.add(name) }
  }
};

const authShell = {
  contains: (element) => element === focusedField,
  classList: { remove: (name) => shellClasses.delete(name), add: (name) => shellClasses.add(name) }
};
const feedbackClasses = new Set();
const loginFeedback = {
  textContent: "Entrando...",
  classList: {
    add: (name) => feedbackClasses.add(name),
    remove: (...names) => names.forEach((name) => feedbackClasses.delete(name))
  }
};

const modulePath = path.join(__dirname, "..", "src", "modules", "auth", "authSession.js");
eval(fs.readFileSync(modulePath, "utf8"));

const auth = window.VECTON_AUTH.createAuthModule({
  AUTH_STORAGE_KEY: "auth-test",
  authShell,
  loginFeedback
});
auth.hideAuthShell();

assert.equal(calls.blur, 1, "o campo de login deve perder foco antes da troca de shell");
assert.deepEqual(calls.scroll, [[0, 0], [0, 0], [0, 0]], "o scroll deve ser restaurado imediatamente, no frame seguinte e após o teclado");
assert.equal(calls.raf, 1);
assert.deepEqual(calls.timeout, [350]);
assert.equal(document.documentElement.scrollTop, 0);
assert.equal(document.body.scrollTop, 0);
assert.equal(bodyClasses.has("auth-only"), false);
assert.equal(shellClasses.has("active"), false);
assert.equal(loginFeedback.textContent, "");
