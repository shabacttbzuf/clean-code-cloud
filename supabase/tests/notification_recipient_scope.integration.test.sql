BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(28);

-- Isolated synthetic users and organization fixtures. This file runs only
-- against the ephemeral local Supabase database in CI and rolls everything back.
CREATE TEMP TABLE notification_scope_fixture (
  tenant_id uuid,
  owner_id uuid,
  manager_a_id uuid,
  manager_b_id uuid,
  waiter_a_id uuid,
  outsider_id uuid,
  company_a_id uuid,
  company_b_id uuid,
  branch_a_id uuid,
  branch_b_id uuid,
  sale_a_id uuid,
  sale_b_id uuid,
  low_stock_id uuid,
  kitchen_id uuid,
  leave_manager_id uuid,
  invoice_id uuid,
  campaign_id uuid,
  promotion_id uuid,
  admin_id uuid,
  leave_user_id uuid,
  owner_alert_id uuid
) ON COMMIT DROP;

INSERT INTO notification_scope_fixture (
  tenant_id, owner_id, manager_a_id, manager_b_id, waiter_a_id, outsider_id,
  company_a_id, company_b_id, branch_a_id, branch_b_id
)
VALUES (
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid()
);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT u.id, 'authenticated', 'authenticated',
       u.id::text || '@notification-scope.test',
       '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
       '{}'::jsonb, now(), now()
FROM notification_scope_fixture f
CROSS JOIN LATERAL (
  VALUES (f.owner_id), (f.manager_a_id), (f.manager_b_id),
         (f.waiter_a_id), (f.outsider_id)
) AS u(id);

SELECT set_config('request.jwt.claim.sub', owner_id::text, true)
FROM notification_scope_fixture;

INSERT INTO public.tenants (id, name, owner_id)
SELECT tenant_id, 'Notification RLS Fixture', owner_id
FROM notification_scope_fixture;

INSERT INTO public.companies (id, tenant_id, name)
SELECT company_a_id, tenant_id, 'Notification Fixture Company A'
FROM notification_scope_fixture
UNION ALL
SELECT company_b_id, tenant_id, 'Notification Fixture Company B'
FROM notification_scope_fixture;

INSERT INTO public.user_roles (user_id, tenant_id, role, company_id)
SELECT owner_id, tenant_id, 'owner'::public.app_role, NULL
FROM notification_scope_fixture
UNION ALL
SELECT manager_a_id, tenant_id, 'manager'::public.app_role, company_a_id
FROM notification_scope_fixture
UNION ALL
SELECT manager_b_id, tenant_id, 'manager'::public.app_role, company_b_id
FROM notification_scope_fixture
UNION ALL
SELECT waiter_a_id, tenant_id, 'waiter'::public.app_role, company_a_id
FROM notification_scope_fixture;

SELECT set_config('request.jwt.claim.sub', manager_a_id::text, true)
FROM notification_scope_fixture;

INSERT INTO public.branches (id, tenant_id, name, company_id)
SELECT branch_a_id, tenant_id, 'Notification Fixture Branch A', company_a_id
FROM notification_scope_fixture;

SELECT set_config('request.jwt.claim.sub', manager_b_id::text, true)
FROM notification_scope_fixture;

INSERT INTO public.branches (id, tenant_id, name, company_id)
SELECT branch_b_id, tenant_id, 'Notification Fixture Branch B', company_b_id
FROM notification_scope_fixture;

UPDATE public.user_roles ur
SET branch_id = f.branch_a_id
FROM notification_scope_fixture f
WHERE ur.user_id = f.waiter_a_id AND ur.tenant_id = f.tenant_id;

-- Company A event rows: manager, branch, owner, and user audiences.
SELECT set_config('request.jwt.claim.sub', manager_a_id::text, true)
FROM notification_scope_fixture;

INSERT INTO public.notifications (
  tenant_id, company_id, audience_type, audience_id, kind,
  title, body, payload, created_by
)
SELECT f.tenant_id, f.company_a_id, v.audience_type, v.audience_id,
       v.kind, v.title, v.body, jsonb_build_object('fixture_event', v.kind),
       f.manager_a_id
FROM notification_scope_fixture f
CROSS JOIN LATERAL (
  SELECT 'branch'::text AS audience_type, f.branch_a_id AS audience_id,
         'sale_recorded'::text AS kind, 'Fixture sale'::text AS title,
         'Branch sale event'::text AS body
  UNION ALL SELECT 'branch', f.branch_a_id, 'low_stock', 'Fixture stock alert', 'Low stock event'
  UNION ALL SELECT 'branch', f.branch_a_id, 'kitchen_order_delayed', 'Fixture kitchen alert', 'Delayed kitchen event'
  UNION ALL SELECT 'manager', NULL::uuid, 'hr_leave_requested', 'Fixture leave request', 'Leave request event'
  UNION ALL SELECT 'manager', NULL::uuid, 'customer_credit_invoice_issued', 'Fixture invoice', 'Restricted invoice details'
  UNION ALL SELECT 'manager', NULL::uuid, 'campaign_activated', 'Fixture campaign', 'Campaign event'
  UNION ALL SELECT 'manager', NULL::uuid, 'promotion_activated', 'Fixture promotion', 'Promotion event'
  UNION ALL SELECT 'manager', NULL::uuid, 'admin_account_status_changed', 'Fixture account alert', 'Account status event'
  UNION ALL SELECT 'user', f.waiter_a_id, 'hr_leave_approved', 'Fixture leave decision', 'Personal leave decision'
  UNION ALL SELECT 'owner', NULL::uuid, 'fixture_owner_only', 'Fixture owner alert', 'Owner-only event'
) AS v;

-- Company B event row is deliberately inaccessible to Company A's manager.
SELECT set_config('request.jwt.claim.sub', manager_b_id::text, true)
FROM notification_scope_fixture;

INSERT INTO public.notifications (
  tenant_id, company_id, audience_type, audience_id, kind,
  title, body, payload, created_by
)
SELECT tenant_id, company_b_id, 'branch', branch_b_id, 'sale_recorded',
       'Company B sale', 'Company B private event',
       jsonb_build_object('fixture_event', 'sale_recorded'), manager_b_id
FROM notification_scope_fixture;

UPDATE notification_scope_fixture f
SET sale_a_id = (
      SELECT n.id FROM public.notifications n
      WHERE n.tenant_id=f.tenant_id AND n.company_id=f.company_a_id AND n.kind='sale_recorded'
    ),
    sale_b_id = (
      SELECT n.id FROM public.notifications n
      WHERE n.tenant_id=f.tenant_id AND n.company_id=f.company_b_id AND n.kind='sale_recorded'
    ),
    low_stock_id = (
      SELECT n.id FROM public.notifications n
      WHERE n.tenant_id=f.tenant_id AND n.kind='low_stock' AND n.company_id=f.company_a_id
    ),
    kitchen_id = (
      SELECT n.id FROM public.notifications n
      WHERE n.tenant_id=f.tenant_id AND n.kind='kitchen_order_delayed' AND n.company_id=f.company_a_id
    ),
    leave_manager_id = (
      SELECT n.id FROM public.notifications n
      WHERE n.tenant_id=f.tenant_id AND n.kind='hr_leave_requested' AND n.company_id=f.company_a_id
    ),
    invoice_id = (
      SELECT n.id FROM public.notifications n
      WHERE n.tenant_id=f.tenant_id AND n.kind='customer_credit_invoice_issued' AND n.company_id=f.company_a_id
    ),
    campaign_id = (
      SELECT n.id FROM public.notifications n
      WHERE n.tenant_id=f.tenant_id AND n.kind='campaign_activated' AND n.company_id=f.company_a_id
    ),
    promotion_id = (
      SELECT n.id FROM public.notifications n
      WHERE n.tenant_id=f.tenant_id AND n.kind='promotion_activated' AND n.company_id=f.company_a_id
    ),
    admin_id = (
      SELECT n.id FROM public.notifications n
      WHERE n.tenant_id=f.tenant_id AND n.kind='admin_account_status_changed' AND n.company_id=f.company_a_id
    ),
    leave_user_id = (
      SELECT n.id FROM public.notifications n
      WHERE n.tenant_id=f.tenant_id AND n.kind='hr_leave_approved' AND n.company_id=f.company_a_id
    ),
    owner_alert_id = (
      SELECT n.id FROM public.notifications n
      WHERE n.tenant_id=f.tenant_id AND n.kind='fixture_owner_only' AND n.company_id=f.company_a_id
    );

SELECT set_config('test.notification.owner', owner_id::text, true),
       set_config('test.notification.manager_a', manager_a_id::text, true),
       set_config('test.notification.manager_b', manager_b_id::text, true),
       set_config('test.notification.waiter_a', waiter_a_id::text, true),
       set_config('test.notification.outsider', outsider_id::text, true),
       set_config('test.notification.company_a', company_a_id::text, true),
       set_config('test.notification.company_b', company_b_id::text, true),
       set_config('test.notification.sale_a', sale_a_id::text, true),
       set_config('test.notification.sale_b', sale_b_id::text, true),
       set_config('test.notification.low_stock', low_stock_id::text, true),
       set_config('test.notification.kitchen', kitchen_id::text, true),
       set_config('test.notification.leave_manager', leave_manager_id::text, true),
       set_config('test.notification.invoice', invoice_id::text, true),
       set_config('test.notification.campaign', campaign_id::text, true),
       set_config('test.notification.promotion', promotion_id::text, true),
       set_config('test.notification.admin', admin_id::text, true),
       set_config('test.notification.leave_user', leave_user_id::text, true),
       set_config('test.notification.owner_alert', owner_alert_id::text, true)
FROM notification_scope_fixture;

-- Manager A: own company and feature permissions only.
SELECT set_config('request.jwt.claim.sub', current_setting('test.notification.manager_a'), true);
SELECT is(private.can_read_notification(current_setting('test.notification.sale_a')::uuid), true, 'Company A manager can read own branch sales event');
SELECT is(private.can_read_notification(current_setting('test.notification.sale_b')::uuid), false, 'Company A manager cannot read Company B sales event');
SELECT is(private.can_read_notification(current_setting('test.notification.low_stock')::uuid), true, 'Company manager can read branch stock alert');
SELECT is(private.can_read_notification(current_setting('test.notification.kitchen')::uuid), true, 'Company manager can read delayed kitchen alert');
SELECT is(private.can_read_notification(current_setting('test.notification.leave_manager')::uuid), true, 'Company manager with HR permission can read leave request');
SELECT is(private.can_read_notification(current_setting('test.notification.invoice')::uuid), true, 'Company manager with sales permission can read invoice alert');
SELECT is(private.can_read_notification(current_setting('test.notification.campaign')::uuid), true, 'Company manager with ads permission can read campaign alert');
SELECT is(private.can_read_notification(current_setting('test.notification.promotion')::uuid), true, 'Company manager with promotions permission can read offer alert');
SELECT is(private.can_read_notification(current_setting('test.notification.admin')::uuid), true, 'Company manager with users permission can read account alert');
SELECT is(private.can_read_notification(current_setting('test.notification.owner_alert')::uuid), false, 'Company manager cannot read owner-only notification');
SELECT is(private.can_read_notification(current_setting('test.notification.leave_user')::uuid), false, 'Company manager cannot read another employee personal notification');

-- Branch waiter: branch membership is insufficient without the event feature permission.
SELECT set_config('request.jwt.claim.sub', current_setting('test.notification.waiter_a'), true);
SELECT is(private.can_read_notification(current_setting('test.notification.low_stock')::uuid), true, 'Branch waiter with inventory permission can read low-stock alert');
SELECT is(private.can_read_notification(current_setting('test.notification.kitchen')::uuid), true, 'Branch waiter with kitchen permission can read delayed kitchen alert');
SELECT is(private.can_read_notification(current_setting('test.notification.sale_a')::uuid), false, 'Branch waiter without sales permission cannot read sales alert');
SELECT is(private.can_read_notification(current_setting('test.notification.leave_user')::uuid), true, 'Employee can read their own HR decision notification');
SELECT is(private.can_read_notification(current_setting('test.notification.leave_manager')::uuid), false, 'Employee cannot read management HR notification');

-- Company B manager is isolated from Company A; tenant-wide owner retains legitimate oversight.
SELECT set_config('request.jwt.claim.sub', current_setting('test.notification.manager_b'), true);
SELECT is(private.can_read_notification(current_setting('test.notification.sale_b')::uuid), true, 'Company B manager can read own branch sales event');
SELECT is(private.can_read_notification(current_setting('test.notification.sale_a')::uuid), false, 'Company B manager cannot read Company A sales event');

SELECT set_config('request.jwt.claim.sub', current_setting('test.notification.owner'), true);
SELECT is(private.can_read_notification(current_setting('test.notification.sale_a')::uuid), true, 'Tenant-wide owner can read Company A event');
SELECT is(private.can_read_notification(current_setting('test.notification.sale_b')::uuid), true, 'Tenant-wide owner can read Company B event');
SELECT is(private.can_read_notification(current_setting('test.notification.campaign')::uuid), true, 'Tenant-wide owner can read company manager campaign alert');
SELECT is(private.can_read_notification(current_setting('test.notification.owner_alert')::uuid), true, 'Tenant-wide owner can read owner-only alert');

SELECT set_config('request.jwt.claim.sub', current_setting('test.notification.outsider'), true);
SELECT is(private.can_read_notification(current_setting('test.notification.sale_a')::uuid), false, 'User outside the tenant cannot read any tenant notification');

-- Administrative writes must not cross the company boundary.
SELECT set_config('request.jwt.claim.sub', current_setting('test.notification.manager_a'), true);
SELECT is(private.can_manage_notification_scope(
  current_setting('test.notification.company_a')::uuid,
  current_setting('test.notification.company_a')::uuid
), true, 'Company A manager can manage notifications in Company A');
SELECT is(private.can_manage_notification_scope(
  current_setting('test.notification.company_a')::uuid,
  current_setting('test.notification.company_b')::uuid
), false, 'Company A manager cannot create or alter notifications in Company B');

SELECT set_config('request.jwt.claim.sub', current_setting('test.notification.owner'), true);
SELECT is(private.can_manage_notification_scope(
  current_setting('test.notification.company_a')::uuid,
  current_setting('test.notification.company_b')::uuid
), true, 'Tenant-wide owner can administer notifications across tenant companies');

-- Verify the real table RLS filters the same recipient matrix, not just the helper.
SELECT set_config('request.jwt.claim.sub', current_setting('test.notification.manager_a'), true);
SET LOCAL ROLE authenticated;
DO $assert_manager_a$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.notifications;
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'Company A manager expected 8 notifications, received %', v_count;
  END IF;
END;
$assert_manager_a$;
RESET ROLE;
SELECT ok(true, 'Notifications SELECT RLS returns only the eight authorized Company A manager events');

SELECT set_config('request.jwt.claim.sub', current_setting('test.notification.waiter_a'), true);
SET LOCAL ROLE authenticated;
DO $assert_waiter_a$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.notifications;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Branch waiter expected 3 permission-scoped notifications, received %', v_count;
  END IF;
END;
$assert_waiter_a$;
RESET ROLE;
SELECT ok(true, 'Notifications SELECT RLS filters branch events by both branch and feature permission');

SELECT * FROM finish();
ROLLBACK;
