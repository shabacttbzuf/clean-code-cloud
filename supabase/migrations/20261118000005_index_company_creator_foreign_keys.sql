-- Cover the newly introduced company/creator foreign keys with matching indexes.
begin;

create index if not exists branches_company_id_idx
  on public.branches (company_id);

create index if not exists customer_payments_branch_tenant_idx
  on public.customer_payments (branch_id, tenant_id);

create index if not exists customer_payments_created_by_idx
  on public.customer_payments (created_by);

create index if not exists customer_payments_customer_tenant_idx
  on public.customer_payments (customer_id, tenant_id);

create index if not exists customer_payments_sale_customer_tenant_idx
  on public.customer_payments (sale_id, customer_id, tenant_id);

create index if not exists customer_payments_session_tenant_branch_idx
  on public.customer_payments (cash_session_id, tenant_id, branch_id);

create index if not exists customers_created_by_idx
  on public.customers (created_by);

create index if not exists products_created_by_idx
  on public.products (created_by);

create index if not exists sales_customer_tenant_idx
  on public.sales (customer_id, tenant_id);

create index if not exists suppliers_created_by_idx
  on public.suppliers (created_by);

commit;
