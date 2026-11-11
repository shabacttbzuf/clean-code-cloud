-- The profitability view is read-only by design; expose SELECT only.
BEGIN;
REVOKE ALL ON TABLE public.sales_profitability FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE public.sales_profitability TO authenticated, service_role;
COMMIT;
