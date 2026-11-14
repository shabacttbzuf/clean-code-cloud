-- Cover all supplier ledger foreign keys and avoid per-row auth function evaluation in marketing RLS.
begin;

create index supplier_payments_branch_tenant_fk_idx
  on public.supplier_payments (branch_id, tenant_id);
create index supplier_payments_supplier_tenant_fk_idx
  on public.supplier_payments (supplier_id, tenant_id);
create index supplier_payments_created_by_fk_idx
  on public.supplier_payments (created_by);
create index marketing_campaigns_created_by_fk_idx
  on public.marketing_campaigns (created_by);

drop policy if exists "Tenant members read marketing campaigns" on public.marketing_campaigns;
create policy "Tenant members read marketing campaigns"
  on public.marketing_campaigns for select to authenticated
  using (
    private.is_tenant_member((select auth.uid()), tenant_id)
    or public.is_super_owner((select auth.uid()))
  );

drop policy if exists "Tenant admins manage marketing campaigns" on public.marketing_campaigns;
create policy "Tenant admins manage marketing campaigns"
  on public.marketing_campaigns for all to authenticated
  using (
    private.is_tenant_admin((select auth.uid()), tenant_id)
    or public.is_super_owner((select auth.uid()))
  )
  with check (
    private.is_tenant_admin((select auth.uid()), tenant_id)
    or public.is_super_owner((select auth.uid()))
  );

commit;
