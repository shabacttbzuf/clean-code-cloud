-- Enable realtime delivery for the existing, RLS-protected notification tables.
-- Do not recreate the publication or alter any existing publication membership.
BEGIN;
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'notification_reads'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_reads;
    END IF;
  END IF;
END
$migration$;
COMMIT;
