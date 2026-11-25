-- All stock balance changes must pass through an atomic RPC that records an inventory transaction.
BEGIN;

DROP POLICY IF EXISTS "Warehouse and admins manage inventory" ON public.inventory;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.inventory FROM PUBLIC, anon, authenticated;

COMMIT;
