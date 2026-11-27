-- Financial and payroll records must not be directly deleted or truncated by API roles.
-- Preserve the existing authenticated read/insert/update workflows; destructive
-- operations remain available only through explicitly authorized server RPCs.
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE
  public.expenses,
  public.payroll_runs,
  public.payroll_items
FROM PUBLIC, anon;

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.expenses,
  public.payroll_runs,
  public.payroll_items
FROM PUBLIC, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.expenses,
  public.payroll_runs,
  public.payroll_items
TO authenticated;

COMMIT;
