const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function createClassList(initial = []) {
  const names = new Set(initial);
  return {
    add: (...items) => items.forEach((item) => names.add(item)),
    remove: (...items) => items.forEach((item) => names.delete(item)),
    contains: (item) => names.has(item),
    toggle: (item, force) => {
      const enabled = force === undefined ? !names.has(item) : Boolean(force);
      if (enabled) names.add(item);
      else names.delete(item);
      return enabled;
    }
  };
}

function createElement(id = "") {
  const listeners = new Map();
  const attributes = new Map();
  return {
    id,
    dataset: {},
    style: {},
    classList: createClassList(),
    textContent: "",
    innerHTML: "",
    hidden: false,
    querySelector: () => null,
    setAttribute(name, value) {
      attributes.set(name, String(value));
      this[name] = String(value);
    },
    getAttribute(name) { return attributes.get(name) ?? null; },
    removeAttribute(name) {
      attributes.delete(name);
      delete this[name];
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(type, event = {}) { listeners.get(type)?.(event); }
  };
}

const documentListeners = new Map();
global.document = {
  body: { classList: createClassList() },
  querySelector: () => null,
  addEventListener: (type, listener) => documentListeners.set(type, listener),
  dispatchEvent: (event) => documentListeners.get(event.type)?.(event)
};

let blobUrlCount = 0;
const revokedBlobUrls = [];
global.window = {
  atob,
  URL: {
    createObjectURL: () => `blob:avatar-${++blobUrlCount}`,
    revokeObjectURL: (url) => revokedBlobUrls.push(url)
  },
  matchMedia: () => ({ matches: true, addEventListener: () => {} }),
  visualViewport: {
    height: 800,
    offsetTop: 0,
    addEventListener: () => {}
  },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  setTimeout: (_callback, delay) => delay,
  clearTimeout: () => {}
};

const modulePath = path.join(__dirname, "..", "src", "modules", "mobile", "mobileShellModule.js");
eval(fs.readFileSync(modulePath, "utf8"));

const elements = new Map();
const rootListeners = new Map();
const root = {
  hidden: true,
  style: {},
  htmlWrites: 0,
  _innerHTML: "",
  set innerHTML(value) {
    this._innerHTML = value;
    this.htmlWrites += 1;
    elements.clear();
    if (!value) return;
    ["vmob-brand-btn", "vmob-avatar-btn", "vmob-messenger-btn", "vmob-logout-btn", "vmob-profile-pop", "vmob-screen"]
      .forEach((id) => elements.set(id, createElement(id)));
    const avatar = elements.get("vmob-avatar-btn");
    const avatarPhoto = createElement("vmob-avatar-photo");
    const avatarFallback = createElement("vmob-avatar-fallback");
    avatar.querySelector = (selector) => {
      if (selector === ".vmob-avatar-photo") return avatarPhoto;
      if (selector === ".vmob-avatar-fallback") return avatarFallback;
      return null;
    };
  },
  get innerHTML() { return this._innerHTML; },
  querySelector(selector) { return elements.get(selector.replace(/^#/, "")) || null; },
  addEventListener(type, listener) { rootListeners.set(type, listener); },
  removeEventListener(type, listener) {
    if (rootListeners.get(type) === listener) rootListeners.delete(type);
  },
  dispatch(type, event) { rootListeners.get(type)?.(event); }
};

const painel = {
  mounts: 0,
  unmounts: 0,
  mount: () => { painel.mounts += 1; },
  unmount: () => { painel.unmounts += 1; }
};

let avatarSnapshot = {
  name: "Rafael Guimaraes",
  initials: "RG",
  src: "data:image/png;base64,Zm90by1kby1wZXJmaWw="
};

const shell = window.VECTON_MOBILE_SHELL.createMobileShellModule({
  canSeeReport: () => true,
  getCurrentUser: () => ({ name: "Rafael Guimaraes" }),
  getProfileAvatarSnapshot: () => avatarSnapshot,
  comercialPainelMobileModule: painel
});

assert.equal(shell.init(root), true);
shell.activate(root);

const originalAvatar = root.querySelector("#vmob-avatar-btn");
const originalAvatarPhoto = originalAvatar.querySelector(".vmob-avatar-photo");
assert.equal(originalAvatarPhoto.getAttribute("src"), "blob:avatar-1");
assert.equal(originalAvatarPhoto.hidden, false);
assert.equal(originalAvatar.classList.contains("has-photo"), true);
assert.equal(originalAvatar.style.backgroundImage, "", "a foto mobile não deve mais depender de background-image");

for (let index = 0; index < 40; index += 1) {
  const moduleTile = {
    dataset: { mobileAction: "open-module", mobileKey: "painelVendas" },
    closest: (selector) => selector === "[data-mobile-action]" ? moduleTile : null
  };
  root.dispatch("click", { target: moduleTile });
  elements.get("vmob-brand-btn").dispatch("click");

  const currentAvatar = root.querySelector("#vmob-avatar-btn");
  assert.equal(currentAvatar, originalAvatar, "a navegação não deve recriar o nó do avatar");
  assert.equal(currentAvatar.querySelector(".vmob-avatar-photo"), originalAvatarPhoto, "a imagem do avatar também deve persistir");
  assert.equal(originalAvatarPhoto.getAttribute("src"), "blob:avatar-1");
  assert.equal(currentAvatar.classList.contains("has-photo"), true);
}

assert.equal(root.htmlWrites, 1, "o shell deve montar o cabeçalho apenas uma vez por ativação");
assert.equal(painel.mounts, 40);
assert.equal(painel.unmounts, 40);

assert.equal(blobUrlCount, 1, "as transições não devem recriar a Blob URL da mesma foto");

avatarSnapshot = { ...avatarSnapshot, src: "data:image/png;base64,Zm90by1hdHVhbGl6YWRh" };
document.dispatchEvent({ type: "vecton:avatar-updated" });
assert.equal(originalAvatarPhoto.getAttribute("src"), "blob:avatar-2");
assert.deepEqual(revokedBlobUrls, ["blob:avatar-1"]);

originalAvatarPhoto.dispatch("error");
assert.equal(originalAvatarPhoto.hidden, true);
assert.equal(originalAvatar.classList.contains("is-silhouette"), true);
document.dispatchEvent({ type: "vecton:avatar-updated" });
assert.equal(originalAvatarPhoto.hidden, false, "uma nova sincronização deve recuperar a imagem após erro de carga");
assert.equal(originalAvatar.classList.contains("has-photo"), true);

shell.deactivate();
assert.equal(root.hidden, true);
assert.deepEqual(revokedBlobUrls, ["blob:avatar-1", "blob:avatar-2"]);
