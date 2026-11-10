import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../drizzle/migrations/0000_scope_permission_visibility.sql', import.meta.url), 'utf8');
test('owner list is restricted to super owners', () => {
  assert.match(sql, /ALTER POLICY "View super owners"[^;]+USING \(public\.is_super_owner\(auth\.uid\(\)\)\)/);
});
test('role permissions preserve global defaults but scope tenant rows to members', () => {
  assert.match(sql, /ALTER POLICY "View role permissions"[^;]+tenant_id IS NULL OR private\.is_tenant_member\(auth\.uid\(\), tenant_id\)/);
});
test('permission catalog requires a tenant profile or super owner', () => {
  assert.match(sql, /ALTER POLICY "View permissions"[^;]+p\.id = auth\.uid\(\) AND p\.tenant_id IS NOT NULL/);
});