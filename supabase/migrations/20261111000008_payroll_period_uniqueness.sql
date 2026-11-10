-- Enforce one payroll run per tenant, period, and branch.
-- Separate partial indexes are required because NULL branch_id values do not
-- compare equal in ordinary PostgreSQL unique constraints.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_runs_tenant_branch_period
  ON public.payroll_runs (tenant_id, branch_id, period_year, period_month)
  WHERE branch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_runs_tenant_unbranched_period
  ON public.payroll_runs (tenant_id, period_year, period_month)
  WHERE branch_id IS NULL;

COMMIT;
