import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const profile = readFileSync(new URL("../src/routes/_authenticated/profile.tsx", import.meta.url), "utf8");
const userFunctions = readFileSync(new URL("../src/lib/users.functions.ts", import.meta.url), "utf8");

test("profile page loads the complete self profile and tenant-scoped assignment names", () => {
  for (const field of [
    "employee_no", "national_id", "job_title", "department_id", "branch_id", "company_id",
    "employment_date", "status", "is_active", "last_login_at", "last_device", "last_ip",
    "created_at", "approved_at", "password_changed_at", "must_change_password",
  ]) assert.ok(profile.includes(field), `missing profile field: ${field}`);
  assert.match(profile, /\.eq\("id", user\.id\)/);
  assert.match(profile, /\.eq\("tenant_id", data\.tenant_id\)/);
  assert.match(profile, /branch_name/);
  assert.match(profile, /company_name/);
  assert.match(profile, /department_name/);
});

test("profile page exposes editable identity fields but keeps employment and security metadata read-only", () => {
  assert.match(profile, /full_name: form\.full_name\.trim\(\)/);
  assert.match(profile, /username: form\.username\.trim\(\)/);
  assert.match(profile, /phone: form\.phone\.trim\(\)/);
  assert.match(profile, /national_id/);
  assert.match(profile, /showNationalId/);
  assert.match(profile, /ملف العمل والنطاق|بيانات العمل والنطاق/);
  assert.match(profile, /معلومات الحساب والأمان/);
  assert.match(profile, /تغيير كلمة المرور/);
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
