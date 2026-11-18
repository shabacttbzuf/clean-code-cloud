-- Supplier payment ledger: immutable, tenant- and branch-scoped records.
-- Cash drawer balances are intentionally not modified by this ledger.
begin;

alter table public.suppliers
  add constraint suppliers_id_tenant_unique unique (id, tenant_id);

alter table public.branches
  add constraint branches_id_tenant_unique unique (id, tenant_id);

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  supplier_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','card','transfer','cheque','other')),
  reference text,
  notes text,
  paid_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint supplier_payments_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete restrict,
  constraint supplier_payments_branch_tenant_fkey foreign key (branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict,
  constraint supplier_payments_supplier_tenant_fkey foreign key (supplier_id, tenant_id) references public.suppliers(id, tenant_id) on delete restrict,
  constraint supplier_payments_created_by_fkey foreign key (created_by) references auth.users(id) on delete restrict,
  constraint supplier_payments_reference_length check (reference is null or length(reference) <= 120),
  constraint supplier_payments_notes_length check (notes is null or length(notes) <= 1000)
);

create index supplier_payments_tenant_supplier_date_idx
  on public.supplier_payments (tenant_id, supplier_id, paid_at desc, id desc);
create index supplier_payments_branch_date_idx
  on public.supplier_payments (tenant_id, branch_id, paid_at desc);

alter table public.supplier_payments enable row level security;

create policy supplier_payments_select
  on public.supplier_payments for select to authenticated
  using (
    (public.is_super_owner((select auth.uid()))
      or public.has_permission((select auth.uid()), tenant_id, 'suppliers.view'))
    and private.can_access_branch((select auth.uid()), tenant_id, branch_id)
  );

create policy supplier_payments_insert
  on public.supplier_payments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (public.is_super_owner((select auth.uid()))
      or public.has_permission((select auth.uid()), tenant_id, 'suppliers.manage'))
    and private.can_access_branch((select auth.uid()), tenant_id, branch_id)
  );

comment on table public.supplier_payments is
  'Immutable supplier payment ledger. Does not mutate cash sessions or accounting cash balances.';

commit;
