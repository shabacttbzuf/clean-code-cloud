-- Evaluate auth.uid() once per statement in RLS policy predicates.
-- This preserves each policy's exact boolean logic while avoiding repeated
-- per-row JWT claim evaluation on large scans.
BEGIN;

DO $$
DECLARE
  p record;
  v_using text;
  v_check text;
  v_sql text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        COALESCE(qual, '') LIKE '%auth.uid()%'
        OR COALESCE(with_check, '') LIKE '%auth.uid()%'
      )
  LOOP
    v_using := CASE
      WHEN p.qual IS NULL THEN NULL
      ELSE replace(p.qual, 'auth.uid()', '(select auth.uid())')
    END;
    v_check := CASE
      WHEN p.with_check IS NULL THEN NULL
      ELSE replace(p.with_check, 'auth.uid()', '(select auth.uid())')
    END;

    v_sql := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF v_using IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_using);
    END IF;
    IF v_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;
    EXECUTE v_sql;
  END LOOP;
END;
$$;

COMMIT;
