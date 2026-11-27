BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(2);

SELECT ok(
  pg_get_functiondef('private.notify_on_customer_credit_invoice()'::regprocedure)
    NOT LIKE '%''customer_id'',%'
  AND pg_get_functiondef('private.notify_on_customer_credit_invoice()'::regprocedure)
    NOT LIKE '%''total'',%'
  AND pg_get_functiondef('private.notify_on_customer_credit_invoice()'::regprocedure)
    NOT LIKE '%''payment_method'',%',
  'Credit-invoice notification payload omits customer identifiers and invoice financial details'
);

SELECT ok(
  pg_get_functiondef('private.notify_on_customer_invoice_collection()'::regprocedure)
    NOT LIKE '%''customer_payment_id'',%'
  AND pg_get_functiondef('private.notify_on_customer_invoice_collection()'::regprocedure)
    NOT LIKE '%''payment_amount'',%'
  AND pg_get_functiondef('private.notify_on_customer_invoice_collection()'::regprocedure)
    NOT LIKE '%''remaining_balance'',%'
  AND pg_get_functiondef('private.notify_on_customer_invoice_collection()'::regprocedure)
    NOT LIKE '%تم استلام دفعة بقيمة%',
  'Collection notifications omit payment identifiers, amounts, and remaining balances'
);

SELECT * FROM finish();
ROLLBACK;
