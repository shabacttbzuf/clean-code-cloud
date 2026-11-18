-- Supplier payment ledger is append-only at the SQL privilege layer as well as by RLS.
begin;
revoke all on table public.supplier_payments from anon, authenticated;
grant select, insert on table public.supplier_payments to authenticated;
commit;
