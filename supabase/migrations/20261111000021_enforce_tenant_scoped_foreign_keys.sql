-- Enforce tenant consistency for every single-column FK whose parent is tenant-scoped.
-- Existing data was audited before rollout; all checked relationships were clean.
BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_same_tenant_foreign_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_parent_id uuid;
  v_tenant_id uuid;
  v_parent_matches boolean;
BEGIN
  v_parent_id := NULLIF(to_jsonb(NEW)->>TG_ARGV[1], '')::uuid;
  IF v_parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_tenant_id := NULLIF(to_jsonb(NEW)->>'tenant_id', '')::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required for tenant-scoped reference on %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM public.%I WHERE %I = $1 AND tenant_id = $2)',
    TG_ARGV[0], TG_ARGV[2]
  )
  INTO v_parent_matches
  USING v_parent_id, v_tenant_id;

  IF NOT v_parent_matches THEN
    RAISE EXCEPTION 'Tenant mismatch: %.% must reference a row in the same tenant',
      TG_TABLE_NAME, TG_ARGV[1]
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_same_tenant_foreign_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_same_tenant_foreign_key() TO service_role;

DO $$
DECLARE
  c record;
  v_trigger_name text;
BEGIN
  FOR c IN
    SELECT con.conname, con.conrelid, con.confrelid,
           child_ns.nspname AS child_schema, child.relname AS child_table,
           parent.relname AS parent_table,
           child_att.attname AS child_column,
           parent_att.attname AS parent_column
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN pg_attribute child_att ON child_att.attrelid = con.conrelid AND child_att.attnum = con.conkey[1]
    JOIN pg_attribute parent_att ON parent_att.attrelid = con.confrelid AND parent_att.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND child_ns.nspname = 'public'
      AND parent_ns.nspname = 'public'
      AND cardinality(con.conkey) = 1
      AND child_att.attname <> 'tenant_id'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=con.conrelid AND a.attname='tenant_id' AND NOT a.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=con.confrelid AND a.attname='tenant_id' AND NOT a.attisdropped)
  LOOP
    v_trigger_name := left('trg_tenant_fk_' || c.conname, 60);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', v_trigger_name, c.child_schema, c.child_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I, tenant_id ON %I.%I FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key(%L, %L, %L)',
      v_trigger_name, c.child_column, c.child_schema, c.child_table,
      c.parent_table, c.child_column, c.parent_column
    );
  END LOOP;
END;
$$;

COMMIT;
