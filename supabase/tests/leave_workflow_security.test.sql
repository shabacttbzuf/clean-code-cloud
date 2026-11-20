begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

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

select * from finish();
rollback;
