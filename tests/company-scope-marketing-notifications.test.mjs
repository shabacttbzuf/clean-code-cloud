import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261119000006_company_scope_marketing_notifications.sql", import.meta.url),
  "utf8",
);
const ads = readFileSync(
  new URL("../src/routes/_authenticated/ads.tsx", import.meta.url),
  "utf8",
);
const enterprise = readFileSync(
  new URL("../src/lib/enterprise.functions.ts", import.meta.url),
  "utf8",
);

test("branch access preserves tenant-owner visibility and scopes company managers", () => {
  assert.match(migration, /ur\.role = 'owner' and ur\.company_id is null/i);
  assert.match(migration, /ur\.company_id = b\.company_id/i);
  assert.match(migration, /private\.can_access_branch\(uuid,uuid,uuid\)/i);
  assert.match(migration, /_user_id = \(select auth\.uid\(\)\)/i);
});

test("notifications are scoped to company, branch, and department audiences", () => {
  assert.match(migration, /alter table public\.notifications[\s\S]*add column if not exists company_id uuid/i);
  assert.match(migration, /drop policy if exists notifications_admin_write/i);
  assert.match(migration, /create policy notifications_admin_insert/i);
  assert.match(migration, /company_scope_notifications_select[\s\S]*as restrictive/i);
  assert.match(migration, /audience_type='branch'[\s\S]*private\.can_access_branch/i);
  assert.match(migration, /audience_type='department'[\s\S]*d\.company_id/i);
  assert.match(migration, /notification branch audience belongs to another company/i);
});

test("marketing campaigns enforce company scope in RLS and on writes", () => {
  assert.match(migration, /alter table public\.marketing_campaigns[\s\S]*add column if not exists company_id uuid/i);
  assert.match(migration, /marketing_campaigns_enforce_company_scope/i);
  assert.match(migration, /marketing_campaigns_company_id_idx/i);
  assert.match(migration, /notifications_company_id_idx/i);
  assert.match(migration, /company_scope_marketing_campaigns_select[\s\S]*as restrictive/i);
  assert.match(migration, /join public\.branches b on b\.id=ur\.branch_id/i);
  assert.match(migration, /join public\.departments d on d\.id=ur\.department_id/i);
  assert.match(migration, /company_scope_marketing_campaigns_update[\s\S]*with check/i);
  assert.match(migration, /campaign company must belong to the same tenant/i);
});

test("dedicated ads page creates campaigns for the active company and scopes company reads", () => {
  assert.match(ads, /membership\?\.company_id/);
  assert.match(ads, /company_id: editingId \? editingCompanyId/);
  assert.match(ads, /query = query\.eq\("company_id", membership\.company_id\)/);
  assert.match(ads, /select\("id,company_id,title/);
});

test("notification server function accepts only an explicit company scope that the database validates", () => {
  assert.match(enterprise, /company_id: uuid\.nullable\(\)\.optional\(\)/);
  assert.match(enterprise, /company_id: data\.company_id \?\? null/);
});

test("migration is backward-compatible and does not delete business data", () => {
  assert.match(migration, /begin;[\s\S]*commit;/i);
  assert.doesNotMatch(migration, /drop table|truncate|delete from/i);
  assert.match(migration, /update public\.marketing_campaigns[\s\S]*set company_id=/i);
  assert.match(migration, /update public\.notifications[\s\S]*set company_id=/i);
  assert.match(migration, /set search_path = pg_catalog, public, private, pg_temp/i);
});

test("tenant owners retain tenant-wide company and branch administration", () => {
  assert.match(migration, /create or replace function private\.is_company_member/i);
  assert.match(migration, /create or replace function private\.can_access_creator_company/i);
  assert.match(migration, /drop policy if exists company_scope_branches_insert/i);
  assert.match(migration, /company_scope_branches_update[\s\S]*ur\.role='owner' and ur\.company_id is null/i);
});

test("legacy unassigned notifications and campaigns are not exposed as tenant-wide by default", () => {
  assert.match(migration, /company_id is null and \([\s\S]*notifications\.created_by is null/i);
  assert.match(migration, /creator_role\.role='owner' and creator_role\.company_id is null/i);
  assert.match(migration, /company_id is null and \([\s\S]*marketing_campaigns\.created_by is null/i);
  assert.doesNotMatch(migration, /using \(\s*company_id is null\s+or/i);
});

test("company-scoped notification and marketing writes enforce feature permissions", () => {
  assert.match(migration, /company_scope_notifications_insert[\s\S]*notifications\.manage/i);
  assert.match(migration, /company_scope_notifications_update[\s\S]*notifications\.manage/i);
  assert.match(migration, /company_scope_notifications_delete[\s\S]*notifications\.manage/i);
  assert.match(migration, /company_scope_marketing_campaigns_insert[\s\S]*settings\.manage/i);
  assert.match(migration, /company_scope_marketing_campaigns_update[\s\S]*settings\.manage/i);
  assert.match(migration, /company_scope_marketing_campaigns_delete[\s\S]*settings\.manage/i);
});
