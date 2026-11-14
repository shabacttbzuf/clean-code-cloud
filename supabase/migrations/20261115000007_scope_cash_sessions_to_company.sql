-- Close cash-session mutation paths across company boundaries.
begin;

drop policy if exists company_scope_cash_sessions_insert on public.cash_sessions;
create policy company_scope_cash_sessions_insert on public.cash_sessions
as restrictive for insert to authenticated
with check (
  private.can_access_branch((select auth.uid()),tenant_id,branch_id)
  and cashier_id=(select auth.uid())
);

drop policy if exists company_scope_cash_sessions_update on public.cash_sessions;
create policy company_scope_cash_sessions_update on public.cash_sessions
as restrictive for update to authenticated
using (
  private.can_access_branch((select auth.uid()),tenant_id,branch_id)
  and (cashier_id=(select auth.uid()) or exists(
    select 1 from public.super_owners so where so.user_id=(select auth.uid())
  ) or exists(
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.tenant_id=cash_sessions.tenant_id
      and ur.company_id=(select b.company_id from public.branches b where b.id=cash_sessions.branch_id)
      and ur.role in ('owner','manager')
  ))
)
with check (
  private.can_access_branch((select auth.uid()),tenant_id,branch_id)
  and (cashier_id=(select auth.uid()) or exists(
    select 1 from public.super_owners so where so.user_id=(select auth.uid())
  ) or exists(
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.tenant_id=cash_sessions.tenant_id
      and ur.company_id=(select b.company_id from public.branches b where b.id=cash_sessions.branch_id)
      and ur.role in ('owner','manager')
  ))
);

drop policy if exists company_scope_cash_sessions_delete on public.cash_sessions;
create policy company_scope_cash_sessions_delete on public.cash_sessions
as restrictive for delete to authenticated
using (
  private.can_access_branch((select auth.uid()),tenant_id,branch_id)
  and (exists(select 1 from public.super_owners so where so.user_id=(select auth.uid()))
    or exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.tenant_id=cash_sessions.tenant_id
      and ur.company_id=(select b.company_id from public.branches b where b.id=cash_sessions.branch_id)
      and ur.role in ('owner','manager')))
);

commit;
