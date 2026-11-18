-- Cover the complete composite supplier-payment to cash-session foreign key.
begin;
drop index if exists public.supplier_payments_cash_session_idx;
create index supplier_payments_cash_session_fk_idx
  on public.supplier_payments (cash_session_id, tenant_id, branch_id);
commit;
