begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_column('public','leave_requests','rejected_by','Leave requests store the rejecting user separately');
select has_column('public','leave_requests','rejected_at','Leave requests store rejection time separately');

select ok(
  exists(select 1 from pg_policies where schemaname='public' and tablename='leave_requests'
    and policyname='permission_gate_leave_requests_delete' and cmd='DELETE' and permissive='RESTRICTIVE'),
  'Leave deletion requires the restrictive owner/manager/Super Owner gate'
);

select ok(
  exists(select 1 from pg_trigger where tgrelid='public.leave_requests'::regclass
    and tgname='trg_validate_leave_request_transition' and not tgisinternal),
  'Leave decisions and date ranges are validated by a database trigger'
);

select ok(
  exists(select 1 from pg_trigger where tgrelid='public.leave_requests'::regclass
    and tgname='trg_prevent_deleting_payroll_linked_leave' and not tgisinternal),
  'Leave linked to approved or paid payroll cannot be deleted'
);

select ok(
  exists(select 1 from pg_constraint where conrelid='public.leave_requests'::regclass
    and conname='leave_requests_valid_date_range'),
  'Leave date range constraint exists'
);

select ok(
  exists(select 1 from pg_constraint where conrelid='public.leave_requests'::regclass
    and conname='leave_requests_positive_days'),
  'Leave day count must be positive'
);


select ok(
  exists(select 1 from pg_constraint where conrelid='public.leave_requests'::regclass
    and conname='leave_requests_rejected_by_fkey'),
  'Rejecting user is constrained to a real auth user'
);

select ok(
  exists(select 1 from pg_trigger where tgrelid='public.leave_requests'::regclass
    and tgname='trg_tenant_user_leave_requests_rejected_by' and not tgisinternal),
  'Rejecting user must belong to the same tenant'
);

select ok(
  position('new.rejected_by' in pg_get_functiondef('public.prevent_leave_self_approval()'::regprocedure)) > 0
  and position('new.rejected_at' in pg_get_functiondef('public.prevent_leave_self_approval()'::regprocedure)) > 0,
  'Employees cannot self-reject or alter rejection audit metadata'
);

select * from finish();
rollback;
