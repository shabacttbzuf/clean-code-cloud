import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pos = readFileSync(new URL("../src/routes/_authenticated/pos.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("../src/routes/_authenticated/profile.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../src/lib/pos-access.functions.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261122030000_pos_cashier_access_credentials.sql", import.meta.url), "utf8");

test("POS passphrases are stored as server-derived hashes and never exposed to client roles", () => {
  assert.match(server, /scryptSync\(data\.passcode, salt, 64\)/);
  assert.match(server, /timingSafeEqual/);
  assert.match(server, /failed_attempts/);
  assert.match(server, /15 \* 60 \* 1000/);
  assert.match(server, /eq\("user_id", context\.userId\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.pos_access_credentials FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT ALL ON TABLE public\.pos_access_credentials TO service_role/);
  assert.doesNotMatch(migration, /CREATE POLICY/i);
});

test("each user configures their own POS passphrase from the personal profile", () => {
  assert.match(profile, /كلمة مرور نقطة البيع/);
  assert.match(profile, /setMyPosPasscode/);
  assert.match(profile, /posPasscodeConfirm/);
  assert.match(profile, /posAccessQuery\.data\?\.configured/);
});

test("POS asks for a passphrase only after the user explicitly chooses to open the POS or start a shift", () => {
  assert.match(pos, /function POSPage\(\) \{\s*return <POSWorkspace \/>/);
  assert.match(pos, /requestPosUnlock\(true\)/);
  assert.match(pos, /requestPosUnlock\(false\)/);
  assert.match(pos, /verifyMyPosPasscode/);
  assert.match(pos, /POSPasscodeDialog/);
  assert.match(pos, /pos-access-unlocked-v1/);
  assert.doesNotMatch(pos.slice(pos.indexOf("function POSPage"), pos.indexOf("function loadDrafts")), /verifyMyPosPasscode|if \(!unlocked\)/);
});

test("POS passphrase accepts any non-empty value up to 128 characters", () => {
  assert.match(server, /passcode: z\.string\(\)\.min\(1/);
  assert.doesNotMatch(server, /passcode: z\.string\(\)\.min\(8/);
  assert.match(profile, /!posPasscode/);
  assert.doesNotMatch(profile, /posPasscode\.length < 8|minLength=\{8\}/);
});

test("POS workspace restores cart and checkout state after navigating between workspace tabs", () => {
  assert.match(pos, /pos-workspace-v1/);
  assert.match(pos, /sessionStorage\.setItem\(key, JSON\.stringify\(snapshot\)\)/);
  assert.match(pos, /restoredWorkspace\.cart/);
  assert.match(pos, /restoredWorkspace\.selectedCustomerId/);
  assert.match(pos, /restoredWorkspace\.orderType/);
  assert.match(pos, /restoredWorkspace\.reviewOpen/);
});
