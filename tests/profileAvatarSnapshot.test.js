const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.window = { addEventListener: () => {} };

const modulePath = path.join(__dirname, "..", "src", "modules", "auth", "authSession.js");
eval(fs.readFileSync(modulePath, "utf8"));

const state = {
  profile: {
    name: "Rafael Guimaraes",
    photoKind: "upload",
    photoValue: "data:image/png;base64,foto-do-perfil"
  }
};
const auth = window.VECTON_AUTH.createAuthModule({
  AUTH_STORAGE_KEY: "auth-avatar-test",
  FUN_AVATARS: [{ key: "avatar-pronto", dataUrl: "data:image/svg+xml,avatar-pronto" }],
  state,
  getCurrentUser: () => ({ email: "rafael@example.com" })
});

assert.deepEqual(auth.getProfileAvatarSnapshot(), {
  name: "Rafael Guimaraes",
  initials: "RG",
  src: "data:image/png;base64,foto-do-perfil"
});

state.profile.photoKind = "avatar";
state.profile.photoValue = "avatar-pronto";
assert.equal(auth.getProfileAvatarSnapshot().src, "data:image/svg+xml,avatar-pronto");

state.profile.photoKind = "none";
state.profile.photoValue = "";
assert.equal(auth.getProfileAvatarSnapshot().src, "");
