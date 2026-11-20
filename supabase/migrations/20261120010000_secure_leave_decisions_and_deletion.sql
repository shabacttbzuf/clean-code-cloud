-- Harden leave request decisions, date validation, and deletion.
-- Existing leave records are retained; new decisions get separate approval/rejection metadata.
begin;

alter table public.leave_requests
  add column if not exists rejected_by uuid,
  add column if not exists rejected_at timestamptz;

alter table public.leave_requests
  add constraint leave_requests_valid_date_range
  check (start_date <= end_date) not valid;

alter table public.leave_requests
  add constraint leave_requests_positive_days
  check (days_count > 0) not valid;

create or replace function public.validate_leave_request_transition()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.start_date > new.end_date then
    raise exception 'تاريخ نهاية الإجازة يجب ألا يسبق تاريخ بدايتها' using errcode = '22007';
  end if;
  if new.days_count <= 0 then
    raise exception 'عدد أيام الإجازة يجب أن يكون أكبر من صفر' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'لا يمكن تغيير قرار طلب إجازة تمت معالجته' using errcode = '55000';
    end if;

    if new.status = 'approved' then
      if new.approved_by is null or new.approved_at is null then
        raise exception 'بيانات اعتماد الإجازة غير مكتملة' using errcode = '23514';
      end if;
      new.rejected_by := null;
      new.rejected_at := null;
      new.rejection_reason := null;
    elsif new.status = 'rejected' then
      if new.rejected_by is null or new.rejected_at is null
         or nullif(btrim(new.rejection_reason), '') is null then
        raise exception 'يجب تسجيل سبب الرفض وهوية الرافض ووقت الرفض' using errcode = '23514';
      end if;
      new.approved_by := null;
      new.approved_at := null;
    elsif new.status not in ('cancelled') then
      raise exception 'حالة الإجازة المطلوبة غير مسموح بها' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_leave_request_transition on public.leave_requests;
create trigger trg_validate_leave_request_transition
before insert or update on public.leave_requests
for each row execute function public.validate_leave_request_transition();

create or replace function public.prevent_deleting_payroll_linked_leave()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.payroll_items pi
    join public.payroll_runs pr
      on pr.id = pi.payroll_run_id
     and pr.tenant_id = pi.tenant_id
    where pi.tenant_id = old.tenant_id
      and pi.employee_id = old.employee_id
      and pi.leave_days > 0
      and pr.status in ('approved', 'paid')
      and make_date(pr.period_year, pr.period_month, 1)
          <= date_trunc('month', old.end_date)::date
      and (make_date(pr.period_year, pr.period_month, 1) + interval '1 month - 1 day')::date
          >= date_trunc('month', old.start_date)::date
  ) then
    raise exception 'لا يمكن حذف إجازة احتسبت ضمن مسير رواتب معتمد أو مدفوع' using errcode = '55000';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevent_deleting_payroll_linked_leave on public.leave_requests;
create trigger trg_prevent_deleting_payroll_linked_leave
before delete on public.leave_requests
for each row execute function public.prevent_deleting_payroll_linked_leave();

-- A delete requires a tenant owner/manager or the platform Super Owner.
-- The existing restrictive company boundary policy remains in force as an additional guard.
drop policy if exists permission_gate_leave_requests_delete on public.leave_requests;
create policy permission_gate_leave_requests_delete
on public.leave_requests as restrictive
for delete to authenticated
using (
  public.is_super_owner((select auth.uid()))
  or private.user_has_role_in_tenant((select auth.uid()), tenant_id, array['owner','manager']::text[])
);

-- Keep decision writes limited to an unprocessed request and a matching explicit permission.
drop policy if exists permission_gate_leave_requests_update_decision on public.leave_requests;
create policy permission_gate_leave_requests_update_decision
on public.leave_requests as restrictive
for update to authenticated
using (
  status = 'pending'
  and (
    public.is_super_owner((select auth.uid()))
    or private.has_permission((select auth.uid()), tenant_id, 'hr.leaves.approve')
    or private.has_permission((select auth.uid()), tenant_id, 'hr.leaves.reject')
    or (
      exists (
        select 1 from public.employees e
        where e.id = leave_requests.employee_id
          and e.tenant_id = leave_requests.tenant_id
          and e.user_id = (select auth.uid())
      )
    )
  )
)
with check (
  public.is_super_owner((select auth.uid()))
  or (
    status = 'approved'
    and private.has_permission((select auth.uid()), tenant_id, 'hr.leaves.approve')
  )
  or (
    status = 'rejected'
    and private.has_permission((select auth.uid()), tenant_id, 'hr.leaves.reject')
  )
  or (
    status = 'pending'
    and exists (
      select 1 from public.employees e
      where e.id = leave_requests.employee_id
        and e.tenant_id = leave_requests.tenant_id
        and e.user_id = (select auth.uid())
    )
  )
);

commit;
