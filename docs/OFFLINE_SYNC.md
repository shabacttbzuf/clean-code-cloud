# Offline Sync — Release Gate

## Current implementation boundary

The browser queue in `src/lib/offline-sync.ts` is a durable IndexedDB transport foundation. It deliberately has **no business-operation handlers registered by default**. Therefore no business write is silently queued or replayed before its authorization and idempotency contract has been implemented.

IndexedDB is device-local persistence, not encryption. Do not enqueue passwords, access tokens, payment credentials, full card data, or unnecessary personal data. The server remains the source of truth.

## Operations that must remain online-only

Until each database RPC has a reviewed transactional idempotency contract, keep these operations online-only:

- POS checkout, invoice creation, invoice numbering and sales posting.
- Payment collection, cash-session movements and refunds.
- Customer and supplier returns.
- Inventory deductions, adjustments, purchase receiving and stock transfers.
- Payroll, accounting journals, tax posting and any operation that changes a financial balance.

The client must not optimistically label any of these as completed. A local draft is not a posted transaction.

## Requirements before registering an offline handler

Every handler must:

1. Use a stable `idempotencyKey` equal to the queued operation UUID.
2. Submit the key to a server endpoint that persists the key and the domain mutation in the **same database transaction**, protected by a unique constraint.
3. Return the original committed result when the same key is received again; never apply the mutation twice.
4. Derive the authenticated actor from the verified Supabase session on the server, not from queued payload data.
5. Re-check current membership, role, permission, tenant, company and branch at replay time. Captured scope is routing metadata, not authorization.
6. Check the server-side version / `updated_at` precondition and return a conflict rather than overwrite newer server data.
7. Validate dependencies and process them in dependency order.
8. Return success only after the server confirms the committed transaction.

Only explicitly approved, non-financial operations may be registered with `registerOfflineHandler(type, { offlineSafe: true, send })`. The function rejects the known financial and stock-ledger operation types.

## Current UI and behavior

- The authenticated workspace displays network state, queued / failed / conflict / synced counts and the last successful sync timestamp for the active user and workspace scope.
- The queue stores UUID, idempotency key, payload, creation/update times, user/tenant/company/branch scope, dependencies, attempt count, status, retry time, error and successful sync time.
- Automatic replay starts on browser `online` events and a periodic online check. Failed operations use bounded exponential backoff. Independent operations may continue after another operation fails.
- Conflicts remain visible and are not overwritten automatically.
- No hosted Supabase migration or production database write is part of this change.

## Required acceptance tests before production

Add browser + local Supabase integration tests for: repeated offline/online transitions; browser reload with pending operations; duplicate delivery of one idempotency key; server commit followed by lost client response; stale-version conflict; expired session / revoked permission; user switching; tenant/company/branch switching; dependency failure; partial batch success; IndexedDB transaction abort; and offline storage quota failure.

Do not merge or enable business handlers until the tests above and the CI typecheck, unit tests, production build, and clean Supabase migration reset pass.
