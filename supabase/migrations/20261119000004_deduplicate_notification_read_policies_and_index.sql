-- Remove duplicate receipt policies and an identical index introduced by
-- the platform branding/notification-read migration. Keep the established
-- title-cased policies and the pre-existing idx_notification_reads_user index.
begin;

drop policy if exists "users read own notification receipts" on public.notification_reads;
drop policy if exists "users create own notification receipts" on public.notification_reads;
drop policy if exists "users update own notification receipts" on public.notification_reads;

drop index if exists public.notification_reads_user_read_at_idx;

commit;
