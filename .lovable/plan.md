# Release 1.2 — Enterprise User Management

This is a large, multi-domain release layered on top of Release 1.1. Below is the scoped plan; nothing existing will be renamed, removed, or reworked — only additive, backward-compatible changes.

## Scope Summary
Adds an enterprise-grade user, role, permission, branch/department, audit, and login-history layer on top of the current `profiles` / `user_roles` / `permissions` / `user_permission_overrides` / `audit_logs` schema. Notification architecture is prepared but not delivered. Owner Control Center is gated to Super Owner only. Cashier, POS, HR, Payroll, Attendance, Reports remain untouched.

## Database Changes (additive migration — safe defaults, no destructive DDL)

New columns (nullable, defaulted):
- `profiles`: `employee_no`, `national_id`, `job_title`, `department_id`, `company_id`, `employment_date`, `status` (enum: active/suspended/frozen/pending_approval/password_expired), `must_change_password`, `last_ip`, `last_device`, `last_user_agent`, `password_changed_at`, `approved_by`, `approved_at`.
- `branches`: `logo_url`, `photo_url`, `description`, `status`, `manager_id` (already may exist — checked with IF NOT EXISTS).
- `user_roles`: `department_id`, `company_id` (nullable).

New tables (all with GRANTs + RLS + policies):
- `companies` — tenant-scoped container (architecture only, auto-seeded with a "Default" company per tenant).
- `departments` — tenant/branch-scoped, name, description, manager_id, status.
- `job_titles` — tenant-scoped catalog.
- `employment_types` — tenant-scoped catalog (full-time, part-time, contract, …).
- `login_history` — user_id, tenant_id, login_at, logout_at, ip, user_agent, browser, os, device, session_duration.
- `notifications` — architecture only: id, tenant_id, audience_type (owner/manager/branch/department/user), audience_id, kind, urgency, scheduled_for, payload jsonb, created_at. No delivery worker.
- `custom_roles` already exists — extended with `copied_from` and helper RPC `clone_role_permissions(_src, _dst)`.
- `permissions` table gets additional rows (idempotent INSERT … ON CONFLICT) covering every page/operation verb listed (view/create/edit/delete/approve/reject/print/export/import/hide/freeze/restore/manage/settings/reports/dashboard/search/filter) for existing modules.

Audit trail: `audit_logs` already exists and is append-only. Add a REVOKE DELETE and a policy so no role (except service_role) can delete. Extend the `log_audit_change` trigger to more tables (login, permission changes, role changes) via new triggers — additive only.

## Server Functions (new, all under `src/lib/`)

- `users-admin.functions.ts` — list/search users with new fields, suspend/freeze/archive/approve, force password reset, change department/company, extending existing `users.functions.ts` (no edits to existing exports).
- `companies.functions.ts`, `departments.functions.ts`, `job-titles.functions.ts`, `employment-types.functions.ts` — CRUD for admins.
- `roles.functions.ts` — create custom role, clone permissions from another role, assign/revoke permissions per role.
- `login-history.functions.ts` — record on sign-in (called from client after successful login) and list for a user.
- `notifications.functions.ts` — create/list only, no delivery.

All protected with `requireSupabaseAuth` + role/permission checks. `supabaseAdmin` loaded inside handlers only.

## Client-side Login Instrumentation
`src/routes/auth.tsx` — after successful sign-in, call a new `recordLogin` server fn that captures IP (via server), user-agent (from request), and updates `profiles.last_login_at/last_ip/last_device/last_user_agent`. Also blocks sign-in when `status ∈ {suspended, frozen, pending_approval}` by immediately signing out and showing an Arabic message. No workflow change for healthy accounts.

## New Pages (all under `src/routes/_authenticated/`, additive routes only)

- `users-admin.tsx` — enterprise user table (photo, all new fields, filters, actions). Existing `users.tsx` untouched.
- `profile.tsx` — extended (edit, not replaced): tabs for Overview, Security (change password), Permissions (read-only view of effective perms), Login History, Assignment.
- `roles.tsx` — role management with clone.
- `companies.tsx`, `departments.tsx`, `job-titles.tsx`, `employment-types.tsx`.
- `owner-center.tsx` — Owner Control Center; Super Owner only (uses `useSuperOwner`). Aggregates: all tenants, all branches, all users, audit logs, login history, connected devices.
- `login-history.tsx` — per-user history viewer (owner + self).

Sidebar (`app-sidebar.tsx`) gets new entries gated by role/permission — existing entries untouched.

## Permission Catalog
Idempotent seed populates ~120 permission keys covering every existing page × verb. Built-in role defaults extended to cover the new keys so behavior for existing roles is unchanged (owner = all, manager = all except owner-only, cashier = POS only, etc.). No existing permission removed.

## Authentication Improvements
- New enum `account_status`.
- `profiles.status` defaults to `active` for existing users (backward compatible). New sign-ups get `pending_approval` **only when** the tenant has an owner already — the first user of a new tenant remains auto-active (keeps onboarding working).
- `must_change_password` flag surfaces a modal on next login.
- Password expiry check: `password_changed_at + interval` (config in `tenants` table via new nullable column `password_max_age_days`, null = never). No forced expiry unless owner sets it.

## Audit Trail
Extend triggers to log: `user_roles` changes, `user_permission_overrides` changes, `custom_roles` changes, `profiles.status` changes, `login_history` inserts. `audit_logs` DELETE revoked from all non-service roles.

## Notifications Foundation
Table + server fns only. No UI beyond a stub `notifications.tsx` list page for owner (read-only, empty state).

## Verification Steps
1. `bunx tsgo --noEmit` — expect 0 errors.
2. `bun run build` — expect success.
3. `bun run lint` — expect success (or unchanged baseline).
4. Playwright smoke: `/auth` sign-in, `/dashboard`, `/pos`, `/reports`, `/hr/payroll`, `/hr/attendance`, new `/users-admin`, `/owner-center`, `/profile`.
5. `supabase--linter` after migration.
6. Manual RLS check via `supabase--read_query` on new tables as anon/authenticated.

## Non-Goals (explicit)
- No changes to POS, cash sessions, sales, purchases, inventory, HR payroll/attendance/leaves, reports.
- No rename or drop of any table/column.
- No removal of any existing permission key or role.
- No notification delivery (email/push/in-app toaster).
- No multi-company data partitioning yet — `company_id` is nullable and unused by existing queries.

## Deliverables at End
- List of modified files.
- Migration summary.
- New components & routes.
- Security notes (RLS, audit immutability, admin-only surfaces).
- Recommendations for Release 1.3 (multi-company activation, notification delivery worker, SSO/SAML, WebAuthn/2FA, per-branch data residency).
