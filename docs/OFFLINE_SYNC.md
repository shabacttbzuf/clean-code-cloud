# Offline Sync — Release Gate

## Current implementation boundary

The browser queue in `src/lib/offline-sync.ts` is a durable IndexedDB transport. The only enabled business handler in this change is `kitchen_status`, backed by a transactional idempotency RPC. No financial or inventory-ledger operation is registered.

IndexedDB is device-local persistence, not encryption. Do not enqueue passwords, access tokens, payment credentials, full card data, or unnecessary personal data. The server remains the source of truth.

## Supported operation matrix

| Operation | Offline support | Safety boundary |
| --- | --- | --- |
| Kitchen order status (`kitchen_status`) | Supported, limited | Only the status transition is queued; server checks actor, current permission, branch access, transition validity and idempotency. |
| POS checkout and sales | Not supported (online-only) | No offline posting, invoice numbering or stock effects. |
| Payments, refunds and cash movements | Not supported (online-only) | No offline financial balance changes. |
| Returns and purchase receiving | Not supported (online-only) | No offline inventory or supplier/customer ledger changes. |
| Stock deductions, adjustments and transfers | Not supported (online-only) | No offline quantity or valuation changes. |
| Payroll, expenses, journals and taxes | Not supported (online-only) | No offline payroll or accounting postings. |

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

Only explicitly approved, non-financial operations may be registered with `registerOfflineHandler(type, { offlineSafe: true, idempotentServerSide: true, send })`. Registration and replay both reject handlers without the server-idempotency assertion. The function rejects the known financial and stock-ledger operation types. The kitchen status handler sends the same operation UUID on every retry to `set_kitchen_order_status_idempotent`; the migration stores the result in a private RLS-enabled ledger and rechecks the authenticated actor, current `kitchen.manage` permission, and branch access.

## Current UI and behavior

- The authenticated workspace displays network state, queued / failed / blocked / conflict / synced counts and the last successful sync timestamp for the active user and workspace scope.
- The queue stores UUID, idempotency key, payload, creation/update times, user/tenant/company/branch scope, dependencies, attempt count, status, retry time, error and successful sync time.
- Automatic replay starts on browser `online` events and a periodic online check. Failed operations use bounded exponential backoff. Independent operations may continue after another operation fails.
- Conflicts remain visible with their error details and are not overwritten or retried automatically. Transient failures use bounded exponential backoff and stop after 12 automatic attempts; authorization / validation / missing-record failures become blocked, and users can explicitly re-evaluate blocked or failed work after fixing the cause. Conflicts are never automatically retried. Identical pending payloads are deduplicated atomically inside a single IndexedDB readwrite transaction, and a reused idempotency key with a different payload is rejected. IndexedDB leases reduce duplicate sends across tabs; the server idempotency ledger remains the final duplicate-delivery guarantee.
- Successful kitchen replays update the local operation state and invalidate the kitchen queue query.
- No hosted Supabase migration or production database write is part of this change.

## Required acceptance tests before production

The migration adds pgTAP checks for the private ledger, grants, fixed privileged boundary, replay authorization, and atomic result persistence. Browser + local Supabase end-to-end testing is still required for repeated offline/online transitions, reload with pending work, duplicate delivery, server commit followed by lost response, stale-version conflict, expired session / revoked permission, user switching, tenant/company/branch switching, null-company and exact branch isolation, idempotency-key reuse with altered payload, dependency failure, partial batch success, IndexedDB transaction abort, and storage quota failure.

Do not merge or enable business handlers until the tests above and the CI typecheck, unit tests, production build, and clean Supabase migration reset pass.
