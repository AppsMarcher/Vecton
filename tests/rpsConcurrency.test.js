const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "src", "modules", "rps", "rpsModule.js");
let source = fs.readFileSync(modulePath, "utf8");
source = source.replace(
  "window.VECTON_RPS = { createRpsModule };",
  "window.VECTON_RPS = { createRpsModule, defaultPayload, mergePayloads, recoverLegacyPayload };"
);
global.window = {};
eval(source);

const { defaultPayload, mergePayloads, recoverLegacyPayload } = window.VECTON_RPS;
const clone = (value) => JSON.parse(JSON.stringify(value));

{
  const base = defaultPayload();
  const remote = clone(base);
  const local = clone(base);
  remote.dados["industrial|indicador-remoto|S4"] = "15";
  local.dados["supply|indicador-local|S4"] = "27";
  const merged = mergePayloads(base, remote, local).payload;
  assert.equal(merged.dados["industrial|indicador-remoto|S4"], "15");
  assert.equal(merged.dados["supply|indicador-local|S4"], "27");
}

{
  const remote = defaultPayload();
  remote.dados["industrial|valor-ja-na-nuvem|S4"] = "96";
  remote.dados["industrial|conflito|S4"] = "10";
  const legacyDraft = defaultPayload();
  legacyDraft.dados["industrial|valor-so-no-rascunho|S4"] = "21";
  legacyDraft.dados["industrial|conflito|S4"] = "20";
  const recovered = recoverLegacyPayload(remote, legacyDraft);
  assert.equal(recovered.payload.dados["industrial|valor-ja-na-nuvem|S4"], "96");
  assert.equal(recovered.payload.dados["industrial|valor-so-no-rascunho|S4"], "21");
  assert.equal(recovered.payload.dados["industrial|conflito|S4"], "10");
  assert.equal(recovered.conflicts, 1);
}

assert.match(source, /rpc\/rps_save_snapshot_atomic/);
assert.match(source, /data-rps-status/);
console.log("RPS concurrency tests passed");
