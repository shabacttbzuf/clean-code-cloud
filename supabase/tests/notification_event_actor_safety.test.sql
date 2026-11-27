BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(6);

SELECT ok(
  pg_get_functiondef('private.notify_on_low_stock()'::regprocedure) LIKE '%v_actor_id%'
  AND pg_get_functiondef('private.notify_on_low_stock()'::regprocedure) LIKE '%set_config%'
  AND pg_get_functiondef('private.notify_on_low_stock()'::regprocedure) LIKE '%RAISE WARNING%',
  'Low-stock notifications use a trusted actor and fail open'
);

SELECT ok(
  pg_get_functiondef('private.notify_leave_request_events()'::regprocedure) LIKE '%v_actor_id%'
  AND pg_get_functiondef('private.notify_leave_request_events()'::regprocedure) LIKE '%set_config%'
  AND pg_get_functiondef('private.notify_leave_request_events()'::regprocedure) LIKE '%RAISE WARNING%',
  'HR notifications use a trusted actor and fail open'
);

SELECT ok(
  pg_get_functiondef('private.notify_branch_when_kitchen_ready()'::regprocedure) LIKE '%v_actor_id%'
  AND pg_get_functiondef('private.notify_branch_when_kitchen_ready()'::regprocedure) LIKE '%set_config%'
  AND pg_get_functiondef('private.notify_branch_when_kitchen_ready()'::regprocedure) LIKE '%RAISE WARNING%',
  'Kitchen-ready notifications use a trusted actor and fail open'
);

SELECT ok(
  pg_get_functiondef('private.notify_on_customer_credit_invoice()'::regprocedure) LIKE '%v_actor_id%'
  AND pg_get_functiondef('private.notify_on_customer_invoice_collection()'::regprocedure) LIKE '%v_actor_id%',
  'Invoice notifications attribute the event to an authorized company actor'
);

SELECT ok(
  pg_get_functiondef('private.notify_on_customer_credit_invoice()'::regprocedure) LIKE '%RETURN NEW%'
  AND pg_get_functiondef('private.notify_on_customer_invoice_collection()'::regprocedure) LIKE '%RETURN NEW%',
  'Invoice notification failures do not abort sales or collection events'
);

SELECT ok(
  NOT has_function_privilege('anon', 'private.notify_on_low_stock()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.notify_on_low_stock()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.notify_leave_request_events()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.notify_leave_request_events()', 'EXECUTE'),
  'API roles cannot invoke low-stock or HR trigger functions directly'
);

SELECT * FROM finish();
ROLLBACK;
