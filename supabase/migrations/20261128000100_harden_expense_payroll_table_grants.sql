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

-- Payroll runs/items must not have a permissive DELETE policy. Replace the former
-- FOR ALL policies with explicit INSERT and UPDATE policies; server-only rollback
-- and rejection RPCs continue to use their privileged execution path.
DROP POLICY IF EXISTS payroll_runs_write ON public.payroll_runs;
DROP POLICY IF EXISTS payroll_items_write ON public.payroll_items;
DROP POLICY IF EXISTS permission_scope_payroll_runs_delete ON public.payroll_runs;
DROP POLICY IF EXISTS permission_scope_payroll_items_delete ON public.payroll_items;

CREATE POLICY payroll_runs_insert_access
ON public.payroll_runs
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_super_owner((SELECT auth.uid() AS uid))
  OR private.user_has_role_in_tenant((SELECT auth.uid() AS uid), tenant_id, ARRAY['owner'::text])
  OR (
    private.user_has_role_in_tenant((SELECT auth.uid() AS uid), tenant_id, ARRAY['manager'::text])
    AND (
      branch_id IS NULL
      OR branch_id IN (
        SELECT profiles.branch_id
        FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid() AS uid)
      )
    )
  )
);

CREATE POLICY payroll_runs_update_access
ON public.payroll_runs
FOR UPDATE
TO authenticated
USING (
  private.is_super_owner((SELECT auth.uid() AS uid))
  OR private.user_has_role_in_tenant((SELECT auth.uid() AS uid), tenant_id, ARRAY['owner'::text])
  OR (
    private.user_has_role_in_tenant((SELECT auth.uid() AS uid), tenant_id, ARRAY['manager'::text])
    AND (
      branch_id IS NULL
      OR branch_id IN (
        SELECT profiles.branch_id
        FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid() AS uid)
      )
    )
  )
)
WITH CHECK (
  private.is_super_owner((SELECT auth.uid() AS uid))
  OR private.user_has_role_in_tenant((SELECT auth.uid() AS uid), tenant_id, ARRAY['owner'::text])
  OR (
    private.user_has_role_in_tenant((SELECT auth.uid() AS uid), tenant_id, ARRAY['manager'::text])
    AND (
      branch_id IS NULL
      OR branch_id IN (
        SELECT profiles.branch_id
        FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid() AS uid)
      )
    )
  )
);

CREATE POLICY payroll_items_insert_access
ON public.payroll_items
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_super_owner((SELECT auth.uid() AS uid))
  OR private.user_has_role_in_tenant((SELECT auth.uid() AS uid), tenant_id, ARRAY['owner'::text, 'manager'::text])
);

CREATE POLICY payroll_items_update_access
ON public.payroll_items
FOR UPDATE
TO authenticated
USING (
  private.is_super_owner((SELECT auth.uid() AS uid))
  OR private.user_has_role_in_tenant((SELECT auth.uid() AS uid), tenant_id, ARRAY['owner'::text, 'manager'::text])
)
WITH CHECK (
  private.is_super_owner((SELECT auth.uid() AS uid))
  OR private.user_has_role_in_tenant((SELECT auth.uid() AS uid), tenant_id, ARRAY['owner'::text, 'manager'::text])
);

COMMIT;
