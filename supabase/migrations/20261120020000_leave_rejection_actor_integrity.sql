-- Preserve tenant-bound identity for the user rejecting a leave request.
-- The main leave workflow migration adds the rejection columns; this migration
-- adds the same tenant-membership and self-approval protections used for approval.
begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.leave_requests'::regclass
      and conname='leave_requests_rejected_by_fkey'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_rejected_by_fkey
      foreign key (rejected_by) references auth.users(id) on delete set null not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.leave_requests'::regclass
      and tgname='trg_tenant_user_leave_requests_rejected_by'
      and not tgisinternal
  ) then
    create trigger trg_tenant_user_leave_requests_rejected_by
    before insert or update of rejected_by, tenant_id on public.leave_requests
    for each row execute function private.enforce_tenant_user_membership('rejected_by');
  end if;
end $$;

create or replace function public.prevent_leave_self_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is not null
     and (
       old.created_by = auth.uid()
       or exists (
         select 1 from public.employees e
         where e.id = old.employee_id and e.user_id = auth.uid()
       )
     )
     and (
       new.status is distinct from old.status
       or new.created_by is distinct from old.created_by
       or new.employee_id is distinct from old.employee_id
       or new.tenant_id is distinct from old.tenant_id
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.rejected_by is distinct from old.rejected_by
       or new.rejected_at is distinct from old.rejected_at
       or new.rejection_reason is distinct from old.rejection_reason
     )
  then
    raise exception 'لا يمكنك اعتماد أو تغيير حالة طلب الإجازة الخاص بك'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

commit;
