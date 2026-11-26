import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const profile = readFileSync(new URL("../src/routes/_authenticated/profile.tsx", import.meta.url), "utf8");
const userFunctions = readFileSync(new URL("../src/lib/users.functions.ts", import.meta.url), "utf8");

test("profile page reads the signed-in user's permitted profile and tenant-scoped assignment names", () => {
  for (const field of [
    "employee_no", "job_title", "department_id", "branch_id", "company_id",
    "employment_date", "status", "is_active", "last_login_at", "created_at",
  ]) assert.ok(profile.includes(field), `missing permitted profile field: ${field}`);
  assert.match(profile, /\.eq\("id", user\.id\)/);
  assert.match(profile, /\.eq\("tenant_id", data\.tenant_id\)/);
  assert.match(profile, /branch_name/);
  assert.match(profile, /company_name/);
  assert.match(profile, /department_name/);
});

test("profile page does not query or expose national ID, device, IP, or internal security metadata", () => {
  for (const sensitiveField of [
    "national_id", "last_device", "last_ip", "approved_at",
    "password_changed_at", "must_change_password", "showNationalId",
  ]) assert.equal(profile.includes(sensitiveField), false, `sensitive field must not appear in profile page: ${sensitiveField}`);
  assert.match(profile, /بيانات العمل والنطاق/);
  assert.match(profile, /معلومات الحساب والأمان/);
  assert.match(profile, /تغيير كلمة المرور/);
});

test("profile page edits only self-service identity fields through the protected server function", () => {
  assert.match(profile, /full_name: form\.full_name\.trim\(\)/);
  assert.match(profile, /username: form\.username\.trim\(\)/);
  assert.match(profile, /phone: form\.phone\.trim\(\)/);
  assert.match(userFunctions, /patch: \{/);
  assert.match(userFunctions, /updatedProfile/);
  assert.match(userFunctions, /\.eq\("id", context\.userId\)/);
});

test("profile errors are visible and retryable, and private avatar uploads remain user-scoped", () => {
  assert.match(profile, /profileQuery\.refetch\(\)/);
  assert.match(profile, /avatarTenantId/);
  assert.match(profile, /restaurant-private-assets/);
  assert.match(userFunctions, /parts\[2\] !== context\.userId/);
  assert.match(userFunctions, /private:\/\//);
});
