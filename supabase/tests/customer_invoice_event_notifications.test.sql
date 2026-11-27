BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(5);

SELECT ok(
  to_regprocedure('private.notify_on_customer_credit_invoice()') IS NOT NULL
  AND to_regprocedure('private.notify_on_customer_invoice_collection()') IS NOT NULL,
  'Both invoice notification trigger functions exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='trg_notify_customer_credit_invoice'
      AND tgrelid='public.sales'::regclass
      AND NOT tgisinternal
  )
  AND EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='trg_notify_customer_invoice_collection'
      AND tgrelid='public.customer_payments'::regclass
      AND NOT tgisinternal
  ),
  'Invoice and collection notifications are attached to their actual event tables'
);

SELECT ok(
  NOT has_function_privilege('anon', 'private.notify_on_customer_credit_invoice()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.notify_on_customer_credit_invoice()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.notify_on_customer_invoice_collection()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.notify_on_customer_invoice_collection()', 'EXECUTE'),
  'Trigger functions cannot be invoked directly by API roles'
);

SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid='private.notify_on_customer_credit_invoice()'::regprocedure)
  AND (SELECT prosecdef FROM pg_proc WHERE oid='private.notify_on_customer_invoice_collection()'::regprocedure),
  'Both invoice event functions execute with their hardened definer context'
);

SELECT ok(
  (SELECT array_to_string(proconfig, ',') FROM pg_proc
    WHERE oid='private.notify_on_customer_credit_invoice()'::regprocedure)
      LIKE '%search_path=pg_catalog, public, private, pg_temp%'
  AND
  (SELECT array_to_string(proconfig, ',') FROM pg_proc
    WHERE oid='private.notify_on_customer_invoice_collection()'::regprocedure)
      LIKE '%search_path=pg_catalog, public, private, pg_temp%',
  'Both invoice event functions pin search_path'
);

SELECT * FROM finish();
ROLLBACK;
