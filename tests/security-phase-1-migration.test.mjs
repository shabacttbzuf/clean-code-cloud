import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261111000000_security_phase_1_hardening.sql", import.meta.url),
  "utf8",
);

test("tenant owner bootstrap is scoped to the tenant owner", () => {
  assert.match(migration, /Tenant owner bootstraps own owner role/);
  assert.match(migration, /t\.owner_id = auth\.uid\(\)/);
  assert.match(migration, /role = 'owner'/);
});

test("authenticated users cannot update administrative profile columns", () => {
  assert.match(migration, /REVOKE UPDATE ON TABLE public\.profiles FROM authenticated/);
  assert.match(migration, /GRANT UPDATE \(full_name, username, phone, avatar_url\)/);
});

test("leave requester cannot change their own request status", () => {
  assert.match(migration, /prevent_leave_self_approval/);
  assert.match(migration, /NEW\.status IS DISTINCT FROM OLD\.status/);
  assert.match(migration, /OLD\.created_by = auth\.uid\(\)/);
  assert.match(migration, /e\.user_id = auth\.uid\(\)/);
  assert.match(migration, /NEW\.approved_by IS DISTINCT FROM OLD\.approved_by/);
});

test("first super-owner bootstrap is serialized and service-role only", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.bootstrap_first_super_owner\(uuid\) FROM authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.bootstrap_first_super_owner\(uuid\) TO service_role/);
});

const payrollMigration = readFileSync(
  new URL("../supabase/migrations/20261111000001_payroll_atomic_rejection.sql", import.meta.url),
  "utf8",
);

test("payroll rejection is a single database transaction with state validation", () => {
  assert.match(payrollMigration, /FOR UPDATE/);
  assert.match(payrollMigration, /locked_run\.status NOT IN \('draft', 'approved'\)/);
  assert.match(payrollMigration, /GRANT EXECUTE ON FUNCTION public\.reject_payroll_run[^;]+TO service_role/);
});

const userAdminSource = readFileSync(
  new URL("../src/lib/users.functions.ts", import.meta.url),
  "utf8",
);

test("tenant administrators cannot manage users outside their tenant", () => {
  assert.match(userAdminSource, /assertTargetBelongsToTenant/);
  assert.match(userAdminSource, /المستخدم المستهدف لا ينتمي إلى المؤسسة المحددة/);
});

test("manager cannot grant privileged owner or manager roles", () => {
  assert.match(userAdminSource, /role !== "owner" && role !== "manager"/);
  assert.match(userAdminSource, /لا يحق للمدير منح صلاحيات المالك أو المدير/);
});

test("role changes use the atomic database function", () => {
  assert.match(userAdminSource, /replace_user_role_in_tenant/);
  assert.match(userAdminSource, /transfer_user_role_branch/);
});

test("first super-owner bootstrap requires an explicit deployment allowlist", () => {
  const source = readFileSync(
    new URL("../src/lib/super-owner.functions.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /INITIAL_SUPER_OWNER_USER_ID/);
  assert.match(source, /bootstrap_first_super_owner/);
  assert.match(source, /initialOwnerId !== context\.userId/);
});

const roleMigration = readFileSync(
  new URL("../supabase/migrations/20261111000002_user_role_atomicity.sql", import.meta.url),
  "utf8",
);

test("role replacement and branch transfer are transactional service-role RPCs", () => {
  assert.match(roleMigration, /replace_user_role_in_tenant/);
  assert.match(roleMigration, /transfer_user_role_branch/);
  assert.match(roleMigration, /FOR UPDATE/);
  assert.match(roleMigration, /GRANT EXECUTE ON FUNCTION public\.replace_user_role_in_tenant[^;]+TO service_role/);
});

const visibilityMigration = readFileSync(
  new URL("../supabase/migrations/20261111000003_migrate_legacy_drizzle_visibility.sql", import.meta.url),
  "utf8",
);

test("legacy permission visibility rules are included in Supabase migrations", () => {
  assert.match(visibilityMigration, /private\.is_tenant_member/);
  assert.match(visibilityMigration, /View super owners/);
  assert.match(visibilityMigration, /View role permissions/);
  assert.match(visibilityMigration, /View permissions/);
});

const posMigration = readFileSync(
  new URL("../supabase/migrations/20261111000004_atomic_pos_checkout.sql", import.meta.url),
  "utf8",
);

test("POS checkout derives totals from database values and commits payment atomically", () => {
  assert.match(posMigration, /private\.can_access_branch/);
  assert.match(posMigration, /cs\.status = 'open'/);
  assert.match(posMigration, /v_product\.sale_price/);
  assert.match(posMigration, /INSERT INTO public\.payments/);
  assert.match(posMigration, /FOR UPDATE/);
  assert.match(posMigration, /ORDER BY \(value->>'product_id'\)::uuid/);
});

const operationsMigration = readFileSync(
  new URL("../supabase/migrations/20261111000005_atomic_purchases_inventory_cash.sql", import.meta.url),
  "utf8",
);

test("purchase receiving is atomic with stock transactions", () => {
  assert.match(operationsMigration, /create_purchase_with_items/);
  assert.match(operationsMigration, /INSERT INTO public\.purchase_items/);
  assert.match(operationsMigration, /FOR UPDATE/);
});

test("inventory adjustments update balance and transaction log together", () => {
  assert.match(operationsMigration, /adjust_inventory_balance/);
  assert.match(operationsMigration, /INSERT INTO public\.inventory_transactions/);
});

test("cash session expected balance is calculated from persisted cash payments", () => {
  assert.match(operationsMigration, /close_cash_session/);
  assert.match(operationsMigration, /sum\(p\.amount\)/);
  assert.match(operationsMigration, /p\.method = 'cash'/);
});

const auditNotificationsMigration = readFileSync(
  new URL("../supabase/migrations/20261111000006_audit_login_notification_security.sql", import.meta.url),
  "utf8",
);

test("authenticated clients cannot forge audit logs or rewrite login history", () => {
  assert.match(auditNotificationsMigration, /REVOKE INSERT ON TABLE public\.audit_logs FROM authenticated/);
  assert.match(auditNotificationsMigration, /REVOKE INSERT, UPDATE ON TABLE public\.login_history FROM authenticated/);
});

test("notification reads are filtered by audience and use per-user receipts", () => {
  assert.match(auditNotificationsMigration, /audience_type = 'user'/);
  assert.match(auditNotificationsMigration, /audience_type = 'branch'/);
  assert.match(auditNotificationsMigration, /audience_type = 'department'/);
  assert.match(auditNotificationsMigration, /CREATE TABLE IF NOT EXISTS public\.notification_reads/);
});

const onboardingMigration = readFileSync(
  new URL("../supabase/migrations/20261111000007_atomic_tenant_onboarding.sql", import.meta.url),
  "utf8",
);

test("tenant onboarding creates tenant, owner role, and profile scope atomically", () => {
  assert.match(onboardingMigration, /auth\.uid\(\)/);
  assert.match(onboardingMigration, /INSERT INTO public\.user_roles/);
  assert.match(onboardingMigration, /UPDATE public\.profiles/);
  assert.match(onboardingMigration, /GRANT EXECUTE ON FUNCTION public\.create_tenant_with_owner[^;]+TO authenticated/);
});

const enterpriseUsersSource = readFileSync(
  new URL("../src/lib/enterprise.functions.ts", import.meta.url),
  "utf8",
);

test("enterprise admin functions verify target tenant and protected role before admin writes", () => {
  assert.match(enterpriseUsersSource, /assertTargetUserManageable/);
  assert.match(enterpriseUsersSource, /المستخدم المستهدف لا ينتمي إلى المؤسسة المحددة/);
  assert.match(enterpriseUsersSource, /لا يحق للمدير إدارة حساب مالك المؤسسة أو مدير آخر/);
});

test("login history is recorded and closed using trusted server-side credentials", () => {
  assert.match(enterpriseUsersSource, /\.from\("login_history"\)/);
  assert.match(enterpriseUsersSource, /login_history_id/);
});

const payrollUniqueMigration = readFileSync(
  new URL("../supabase/migrations/20261111000008_payroll_period_uniqueness.sql", import.meta.url),
  "utf8",
);

test("payroll period uniqueness covers both branch and null-branch runs", () => {
  assert.match(payrollUniqueMigration, /WHERE branch_id IS NOT NULL/);
  assert.match(payrollUniqueMigration, /WHERE branch_id IS NULL/);
  assert.match(payrollUniqueMigration, /UNIQUE INDEX/);
});

const customRoleMigration = readFileSync(
  new URL("../supabase/migrations/20261111000009_secure_custom_role_clone.sql", import.meta.url),
  "utf8",
);

test("custom role cloning is restricted to service-role and same-tenant role ids", () => {
  assert.match(customRoleMigration, /Destination custom role does not belong to the tenant/);
  assert.match(customRoleMigration, /Source custom role does not belong to the tenant/);
  assert.match(customRoleMigration, /REVOKE ALL ON FUNCTION public\.clone_role_permissions[^;]+FROM authenticated/);
  assert.match(customRoleMigration, /GRANT EXECUTE ON FUNCTION public\.clone_role_permissions[^;]+TO service_role/);
});

const privilegeMigration = readFileSync(
  new URL("../supabase/migrations/20261111000010_minimize_client_write_privileges.sql", import.meta.url),
  "utf8",
);

test("direct client writes to tenant authorization tables are revoked", () => {
  assert.match(privilegeMigration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.user_roles FROM authenticated/);
  assert.match(privilegeMigration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.custom_roles FROM authenticated/);
  assert.match(privilegeMigration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.role_permissions FROM authenticated/);
  assert.match(privilegeMigration, /REVOKE INSERT ON TABLE public\.tenants FROM authenticated/);
  assert.match(privilegeMigration, /REVOKE INSERT ON TABLE public\.profiles FROM authenticated/);
});

test("tenant owner identity cannot be changed by direct client updates", () => {
  assert.match(privilegeMigration, /prevent_tenant_owner_id_change/);
  assert.match(privilegeMigration, /NEW\.owner_id IS DISTINCT FROM OLD\.owner_id/);
});

test("consolidated database snapshot contains every Supabase migration exactly once and in order", () => {
  const snapshot = readFileSync(
    new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url),
    "utf8",
  );
  const included = [...snapshot.matchAll(/SOURCE MIGRATION: ([^\n]+)/g)].map((match) => match[1].trim());
  const migrationFiles = readdirSync(new URL("../supabase/migrations/", import.meta.url))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.deepEqual(included, migrationFiles);
});

test("new SQL functions use valid paired dollar-quote delimiters", () => {
  const migrationNames = readdirSync(new URL("../supabase/migrations/", import.meta.url))
    .filter((name) => name.startsWith("20261111") && name.endsWith(".sql"));
  for (const name of migrationNames) {
    const sql = readFileSync(new URL("../supabase/migrations/" + name, import.meta.url), "utf8");
    assert.doesNotMatch(sql, /AS \$(?!\$)/, name);
    assert.equal((sql.match(/\$\$/g) ?? []).length % 2, 0, name);
  }
});


const financialLedgerMigration = readFileSync(
  new URL("../supabase/migrations/20261111000013_protect_financial_ledger_writes.sql", import.meta.url),
  "utf8",
);

test("financial ledgers reject direct client DML and preserve transactional RPC paths", () => {
  assert.match(financialLedgerMigration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE[\s\S]*public\.sales[\s\S]*FROM authenticated/);
  assert.match(financialLedgerMigration, /public\.payments[\s\S]*FROM authenticated/);
  assert.match(financialLedgerMigration, /public\.inventory_transactions[\s\S]*FROM authenticated/);
  assert.match(financialLedgerMigration, /REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public\.cash_sessions FROM authenticated/);
  assert.match(financialLedgerMigration, /REVOKE INSERT, DELETE, TRUNCATE ON TABLE public\.tenants FROM authenticated/);
});


const profitabilityMigration = readFileSync(
  new URL("../supabase/migrations/20261111000014_sale_cost_snapshots_profitability.sql", import.meta.url),
  "utf8",
);

test("checkout snapshots trusted product cost without trusting client input", () => {
  assert.match(profitabilityMigration, /cost_price_snapshot numeric\(12,2\)/);
  assert.match(profitabilityMigration, /v_product\.cost_price/);
  assert.match(profitabilityMigration, /cost_price_snapshot\s*\n\s*\)/);
  assert.match(profitabilityMigration, /SET search_path TO pg_catalog, public, pg_temp/);
});

test("historical unknown costs are not fabricated and profitability is RLS-invoker safe", () => {
  assert.match(profitabilityMigration, /NULL means historical cost is unknown/);
  assert.match(profitabilityMigration, /WITH \(security_invoker = true\)/);
  assert.match(profitabilityMigration, /items_with_unknown_cost/);
  assert.match(profitabilityMigration, /THEN NULL/);
  assert.match(profitabilityMigration, /WHERE s\.status = 'completed'/);
});

test("complete database snapshot includes migration 14 exactly once", () => {
  const snapshot = readFileSync(
    new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url),
    "utf8",
  );
  assert.equal(
    [...snapshot.matchAll(/SOURCE MIGRATION: 20261111000014_sale_cost_snapshots_profitability\.sql/g)].length,
    1,
  );
});


const finalSecurityMigration = readFileSync(
  new URL("../supabase/migrations/20261111000015_security_stock_consistency.sql", import.meta.url),
  "utf8",
);

test("security helper RPCs cannot probe another user's authorization state", () => {
  assert.ok(finalSecurityMigration.includes("SET SCHEMA private"));
  assert.ok(finalSecurityMigration.includes("_user_id IS DISTINCT FROM auth.uid()"));
  assert.ok(finalSecurityMigration.includes("private.user_has_role_in_tenant"));
  assert.ok(finalSecurityMigration.includes("private.was_hired_by"));
});

test("stock writes enforce tenant branch ownership and prevent negative inventory", () => {
  assert.ok(finalSecurityMigration.includes("Branch does not belong to the requested tenant"));
  assert.ok(finalSecurityMigration.includes("public.inventory.quantity + EXCLUDED.quantity >= 0"));
  assert.ok(finalSecurityMigration.includes("Insufficient stock or inventory tenant mismatch"));
  assert.ok(finalSecurityMigration.includes("branch_id = _branch_id"));
  assert.ok(finalSecurityMigration.includes("FOR UPDATE"));
});

const returnsMigration = readFileSync(
  new URL("../supabase/migrations/20261111000016_auditable_returns_and_refunds.sql", import.meta.url),
  "utf8",
);

test("customer refunds are immutable auditable records and cannot exceed original sold quantities", () => {
  assert.ok(returnsMigration.includes("CREATE TABLE public.sale_refunds"));
  assert.ok(returnsMigration.includes("CREATE TABLE public.sale_refund_items"));
  assert.ok(returnsMigration.includes("create_sale_refund"));
  assert.ok(returnsMigration.includes("Refund quantity exceeds the remaining quantity"));
  assert.ok(returnsMigration.includes("inventory_transactions"));
  assert.ok(returnsMigration.includes("REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sale_refunds"));
});

test("supplier returns reverse inventory atomically and preserve purchase source records", () => {
  assert.ok(returnsMigration.includes("CREATE TABLE public.purchase_returns"));
  assert.ok(returnsMigration.includes("CREATE TABLE public.purchase_return_items"));
  assert.ok(returnsMigration.includes("create_purchase_return"));
  assert.ok(returnsMigration.includes("Return quantity exceeds the remaining purchased quantity"));
  assert.ok(returnsMigration.includes("'purchase_return'"));
  assert.ok(returnsMigration.includes("FOR UPDATE"));
});

test("cash close reconciles cash refunds and profitability subtracts returned goods", () => {
  assert.ok(returnsMigration.includes("r.cash_session_id=v_session.id"));
  assert.ok(returnsMigration.includes("refunded_net_revenue"));
  assert.ok(returnsMigration.includes("restocked_quantity"));
  assert.ok(returnsMigration.includes("security_invoker = true"));
});

test("complete database snapshot includes migrations 15 and 16 exactly once", () => {
  const snapshot = readFileSync(
    new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url),
    "utf8",
  );
  for (const name of [
    "20261111000015_security_stock_consistency.sql",
    "20261111000016_auditable_returns_and_refunds.sql",
  ]) {
    assert.equal(snapshot.split("SOURCE MIGRATION: " + name).length - 1, 1);
  }
});

const indexesMigration = readFileSync(
  new URL("../supabase/migrations/20261111000017_index_uncovered_foreign_keys.sql", import.meta.url),
  "utf8",
);

test("all previously uncovered foreign-key columns receive leading-key indexes", () => {
  assert.ok(indexesMigration.includes("idx_attendance_tenant_id_fk"));
  assert.ok(indexesMigration.includes("idx_role_permissions_permission_key_fk"));
  assert.ok(indexesMigration.includes("idx_purchase_return_items_product_id_fk"));
  assert.ok(indexesMigration.includes("idx_sale_refunds_cash_session_id_fk"));
  assert.ok(indexesMigration.includes("CREATE INDEX IF NOT EXISTS"));
});

test("complete database snapshot includes migration 17 exactly once", () => {
  const snapshot = readFileSync(
    new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url),
    "utf8",
  );
  assert.equal(snapshot.split("SOURCE MIGRATION: 20261111000017_index_uncovered_foreign_keys.sql").length - 1, 1);
});


const rlsPerformanceMigration = readFileSync(
  new URL("../supabase/migrations/20261111000018_optimize_rls_auth_uid_initplans.sql", import.meta.url),
  "utf8",
);

test("RLS policies cache auth.uid() once per statement without changing policy logic", () => {
  assert.ok(rlsPerformanceMigration.includes("ALTER POLICY"));
  assert.ok(rlsPerformanceMigration.includes("replace(p.qual, 'auth.uid()', '(select auth.uid())')"));
  assert.ok(rlsPerformanceMigration.includes("replace(p.with_check, 'auth.uid()', '(select auth.uid())')"));
});

test("complete database snapshot includes migration 18 exactly once", () => {
  const snapshot = readFileSync(
    new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url),
    "utf8",
  );
  assert.equal(snapshot.split("SOURCE MIGRATION: 20261111000018_optimize_rls_auth_uid_initplans.sql").length - 1, 1);
});


const finalDefinerMigration = readFileSync(
  new URL("../supabase/migrations/20261111000019_harden_definer_paths_and_inventory_branch_scope.sql", import.meta.url),
  "utf8",
);

test("warehouse inventory adjustment is restricted to the assigned branch", () => {
  assert.ok(finalDefinerMigration.includes("role = 'warehouse'"));
  assert.ok(finalDefinerMigration.includes("AND branch_id = _branch_id"));
  assert.ok(!finalDefinerMigration.includes("branch_id IS NULL OR branch_id = _branch_id"));
  assert.ok(finalDefinerMigration.includes("is_active = true"));
});

test("remaining SECURITY DEFINER functions pin pg_catalog before application schemas", () => {
  assert.ok(finalDefinerMigration.includes("ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public, pg_temp"));
  assert.ok(finalDefinerMigration.includes("ALTER FUNCTION public.touch_last_login() SET search_path = pg_catalog, public, pg_temp"));
  assert.ok(finalDefinerMigration.includes("ALTER FUNCTION private.can_access_branch(uuid, uuid, uuid) SET search_path = pg_catalog, public, private, pg_temp"));
});

test("complete database snapshot includes migration 19 exactly once", () => {
  const snapshot = readFileSync(
    new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url),
    "utf8",
  );
  assert.equal(snapshot.split("SOURCE MIGRATION: 20261111000019_harden_definer_paths_and_inventory_branch_scope.sql").length - 1, 1);
});


const superOwnerReturnsMigration = readFileSync(
  new URL("../supabase/migrations/20261111000020_super_owner_return_visibility.sql", import.meta.url),
  "utf8",
);

test("super owners retain cross-tenant read visibility for audited returns", () => {
  assert.ok(superOwnerReturnsMigration.includes('ALTER POLICY "Members view refunds in accessible branches"'));
  assert.ok(superOwnerReturnsMigration.includes('ALTER POLICY "Members view supplier returns in accessible branches"'));
  assert.ok(superOwnerReturnsMigration.includes("public.is_super_owner((select auth.uid()))"));
});

test("complete database snapshot includes migration 20 exactly once", () => {
  const snapshot = readFileSync(
    new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url),
    "utf8",
  );
  assert.equal(snapshot.split("SOURCE MIGRATION: 20261111000020_super_owner_return_visibility.sql").length - 1, 1);
});


const tenantFkMigration = readFileSync(
  new URL("../supabase/migrations/20261111000021_enforce_tenant_scoped_foreign_keys.sql", import.meta.url),
  "utf8",
);
const tenantFkGrantMigration = readFileSync(
  new URL("../supabase/migrations/20261111000022_grant_private_tenant_trigger_execute.sql", import.meta.url),
  "utf8",
);

test("tenant-scoped foreign keys are protected by database-level same-tenant triggers", () => {
  assert.ok(tenantFkMigration.includes("private.enforce_same_tenant_foreign_key"));
  assert.ok(tenantFkMigration.includes("parent_table"));
  assert.ok(tenantFkMigration.includes("Tenant mismatch"));
  assert.ok(tenantFkMigration.includes("BEFORE INSERT OR UPDATE OF"));
  assert.ok(tenantFkGrantMigration.includes("TO authenticated, service_role"));
});

test("complete database snapshot includes tenant integrity migrations exactly once", () => {
  const snapshot = readFileSync(
    new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url),
    "utf8",
  );
  assert.equal(snapshot.split("SOURCE MIGRATION: 20261111000021_enforce_tenant_scoped_foreign_keys.sql").length - 1, 1);
  assert.equal(snapshot.split("SOURCE MIGRATION: 20261111000022_grant_private_tenant_trigger_execute.sql").length - 1, 1);
});


const leastPrivilegeMigration = readFileSync(
  new URL("../supabase/migrations/20261111000023_least_privilege_return_api_and_defaults.sql", import.meta.url),
  "utf8",
);
const readOnlyViewMigration = readFileSync(
  new URL("../supabase/migrations/20261111000024_read_only_profitability_view.sql", import.meta.url),
  "utf8",
);

test("new return tables expose authenticated read access only and revoke anonymous access", () => {
  assert.ok(leastPrivilegeMigration.includes("REVOKE ALL ON TABLE"));
  assert.ok(leastPrivilegeMigration.includes("FROM anon, authenticated"));
  assert.ok(leastPrivilegeMigration.includes("GRANT SELECT"));
  assert.ok(leastPrivilegeMigration.includes("ALTER DEFAULT PRIVILEGES"));
  assert.ok(readOnlyViewMigration.includes("REVOKE ALL ON TABLE public.sales_profitability"));
});

test("complete database snapshot includes least-privilege migrations exactly once", () => {
  const snapshot = readFileSync(
    new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url),
    "utf8",
  );
  assert.equal(snapshot.split("SOURCE MIGRATION: 20261111000023_least_privilege_return_api_and_defaults.sql").length - 1, 1);
  assert.equal(snapshot.split("SOURCE MIGRATION: 20261111000024_read_only_profitability_view.sql").length - 1, 1);
});


const tenantScopeMigration = readFileSync(
  new URL("../supabase/migrations/20261111000025_immutable_tenant_scope_and_branch_memberships.sql", import.meta.url),
  "utf8",
);
const strictTenantMigration = readFileSync(
  new URL("../supabase/migrations/20261111000026_strict_tenant_immutability.sql", import.meta.url),
  "utf8",
);
const unconstrainedTenantMigration = readFileSync(
  new URL("../supabase/migrations/20261111000027_validate_unconstrained_tenant_references.sql", import.meta.url),
  "utf8",
);
const notificationReceiptMigration = readFileSync(
  new URL("../supabase/migrations/20261111000028_validate_notification_receipts.sql", import.meta.url),
  "utf8",
);

test("tenant scope cannot be reassigned and optional branch memberships are tenant-validated", () => {
  assert.ok(tenantScopeMigration.includes("prevent_tenant_scope_reassignment"));
  assert.ok(tenantScopeMigration.includes("trg_tenant_fk_user_roles_branch_id"));
  assert.ok(tenantScopeMigration.includes("trg_tenant_fk_profiles_branch_id"));
  assert.ok(strictTenantMigration.includes("NEW.tenant_id IS DISTINCT FROM OLD.tenant_id"));
});

test("non-FK organization, actor, notification and inventory references are tenant-validated", () => {
  assert.ok(unconstrainedTenantMigration.includes("enforce_tenant_user_membership"));
  assert.ok(unconstrainedTenantMigration.includes("enforce_notification_audience_tenant"));
  assert.ok(unconstrainedTenantMigration.includes("enforce_inventory_reference_tenant"));
  assert.ok(unconstrainedTenantMigration.includes("user_roles"));
  assert.ok(unconstrainedTenantMigration.includes("sale_refunds"));
});

test("notification receipts cannot be forged for users outside the notification tenant", () => {
  assert.ok(notificationReceiptMigration.includes("enforce_notification_read_tenant"));
  assert.ok(notificationReceiptMigration.includes("Notification reader must belong to the notification tenant"));
});

test("complete database snapshot includes tenant-scope migrations exactly once", () => {
  const snapshot = readFileSync(
    new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url),
    "utf8",
  );
  for (const [name] of files) {
    assert.equal(snapshot.split("SOURCE MIGRATION: " + name).length - 1, 1);
  }
});


const roleAudienceMigration = readFileSync(
  new URL("../supabase/migrations/20261111000029_validate_role_notification_audiences.sql", import.meta.url),
  "utf8",
);

test("owner and manager notification audiences validate against tenant role membership", () => {
  assert.ok(roleAudienceMigration.includes("WHEN 'owner' THEN"));
  assert.ok(roleAudienceMigration.includes("WHEN 'manager' THEN"));
  assert.ok(roleAudienceMigration.includes("role='owner'"));
  assert.ok(roleAudienceMigration.includes("role='manager'"));
});

test("complete database snapshot includes role notification audience migration once", () => {
  const snapshot = readFileSync(
    new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url),
    "utf8",
  );
  assert.equal(snapshot.split("SOURCE MIGRATION: 20261111000029_validate_role_notification_audiences.sql").length - 1, 1);
});
