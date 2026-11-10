-- Protect immutable financial and stock ledgers from direct client DML.
-- All transactional writes must go through validated SECURITY DEFINER RPCs.
BEGIN;

-- The anonymous API role must never mutate business or financial records.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.sales,
  public.sale_items,
  public.payments,
  public.cash_sessions,
  public.purchases,
  public.purchase_items,
  public.inventory_transactions,
  public.tenants,
  public.profiles,
  public.super_owners
FROM anon;

-- POS sale header, line items and payments are committed only by
-- create_sale_with_items(), which validates the caller, branch, prices,
-- inventory and cash session in one transaction.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.sales,
  public.sale_items,
  public.payments
FROM authenticated;

-- Purchase receiving and its stock ledger are committed only by
-- create_purchase_with_items(). Manual inventory changes are committed
-- by adjust_inventory_balance().
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.purchases,
  public.purchase_items,
  public.inventory_transactions
FROM authenticated;

-- A cashier may open a session (INSERT) but may only close it through the
-- server-calculated close_cash_session() RPC. Session history is not deletable.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.cash_sessions FROM authenticated;

-- Tenant creation is atomic through create_tenant_with_owner(). Prevent
-- direct tenant creation/deletion that could bypass profile/role invariants.
REVOKE INSERT, DELETE, TRUNCATE ON TABLE public.tenants FROM authenticated;

COMMIT;
