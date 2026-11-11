-- Explicit least-privilege grants for return ledgers and safe defaults for future API objects.
BEGIN;

REVOKE ALL ON TABLE
  public.sale_refunds,
  public.sale_refund_items,
  public.purchase_returns,
  public.purchase_return_items
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.sale_refunds,
  public.sale_refund_items,
  public.purchase_returns,
  public.purchase_return_items
TO authenticated, service_role;

REVOKE ALL ON TABLE public.sales_profitability FROM anon;
GRANT SELECT ON TABLE public.sales_profitability TO authenticated, service_role;

-- Prevent future public objects from becoming Data API reachable by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
