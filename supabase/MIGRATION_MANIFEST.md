# سجل ترحيلات قاعدة البيانات

## سلسلة Supabase الرسمية

الترحيلات التالية مرتبة زمنياً. ملفات 2026-07 هي السجل التاريخي الأصلي، والملفات 2026-11 إضافات إصلاحية جديدة:

1. `supabase/migrations/20260708094803_0abf76e5-e999-489c-9f9f-af2ec48c2447.sql`
2. `supabase/migrations/20260708094827_ba868018-6233-4a11-b86d-ec87b34d165f.sql`
3. `supabase/migrations/20260708094855_2d42d4d3-974b-41f1-a822-d4af29ba3fa4.sql`
4. `supabase/migrations/20260708095952_8c2590f8-b111-43db-9c5b-240523fb0b88.sql`
5. `supabase/migrations/20260708100059_a041ad16-4ef9-4902-9c28-f630f405cf7b.sql`
6. `supabase/migrations/20260708102607_a2feee88-17b2-4756-ac03-25ea6a398c4f.sql`
7. `supabase/migrations/20260708102622_4a6a58b6-aaf2-4cc7-81c1-7ed10d9f7d49.sql`
8. `supabase/migrations/20260708103031_793d9cf8-044c-4a1c-b9c4-3552cfb05eb5.sql`
9. `supabase/migrations/20260708103319_4726725b-f908-4f4d-b4a9-483be8635d1c.sql`
10. `supabase/migrations/20260708114937_16c34a95-ccdb-437c-a98a-430f2b57fed2.sql`
11. `supabase/migrations/20260708115005_d3758a2a-cb16-420a-8b5b-434296fffdee.sql`
12. `supabase/migrations/20260708121532_63109e4a-4999-48fa-ba26-c9c6968a0477.sql`
13. `supabase/migrations/20260708121621_9e9eb7c7-2705-4c85-9804-140bbf71e04d.sql`
14. `supabase/migrations/20260708122804_4488bafc-2277-466d-8627-9a82d5e82e32.sql`
15. `supabase/migrations/20260708132855_24cda317-e651-4e4d-96e6-aa91149d44c8.sql`
16. `supabase/migrations/20260708141902_50aeceea-6624-4c01-9c18-59b23a39f358.sql`
17. `supabase/migrations/20260708142949_ceaaa981-625e-4dcc-a9ae-70db885a420d.sql`
18. `supabase/migrations/20260708154516_12f5c89f-0f7d-4cb2-a3e5-89ac8612169c.sql`
19. `supabase/migrations/20260713042737_a94617b9-318b-412a-85c3-7a9fad166275.sql`
20. `supabase/migrations/20260713052537_47658ce2-66b0-4b5a-8503-949464409d3c.sql`
21. `supabase/migrations/20261111000000_security_phase_1_hardening.sql`
22. `supabase/migrations/20261111000001_payroll_atomic_rejection.sql`
23. `supabase/migrations/20261111000002_user_role_atomicity.sql`
24. `supabase/migrations/20261111000003_migrate_legacy_drizzle_visibility.sql`

25. `supabase/migrations/20261111000004_atomic_pos_checkout.sql`

26. `supabase/migrations/20261111000005_atomic_purchases_inventory_cash.sql`

27. `supabase/migrations/20261111000006_audit_login_notification_security.sql`

28. `supabase/migrations/20261111000007_atomic_tenant_onboarding.sql`

29. `supabase/migrations/20261111000008_payroll_period_uniqueness.sql`

30. `supabase/migrations/20261111000009_secure_custom_role_clone.sql`

31. `supabase/migrations/20261111000010_minimize_client_write_privileges.sql`

32. `supabase/migrations/20261111000011_restrict_security_definer_execution.sql`
33. `supabase/migrations/20261111000012_secure_super_owner_status.sql`
34. `supabase/migrations/20261111000013_protect_financial_ledger_writes.sql`
35. `supabase/migrations/20261111000014_sale_cost_snapshots_profitability.sql`
36. `supabase/migrations/20261111000015_security_stock_consistency.sql`
37. `supabase/migrations/20261111000016_auditable_returns_and_refunds.sql`
38. `supabase/migrations/20261111000017_index_uncovered_foreign_keys.sql`
39. `supabase/migrations/20261111000018_optimize_rls_auth_uid_initplans.sql`
40. `supabase/migrations/20261111000019_harden_definer_paths_and_inventory_branch_scope.sql`
41. `supabase/migrations/20261111000020_super_owner_return_visibility.sql`
42. `supabase/migrations/20261111000021_enforce_tenant_scoped_foreign_keys.sql`
43. `supabase/migrations/20261111000022_grant_private_tenant_trigger_execute.sql`
44. `supabase/migrations/20261111000023_least_privilege_return_api_and_defaults.sql`
45. `supabase/migrations/20261111000024_read_only_profitability_view.sql`
46. `supabase/migrations/20261111000025_immutable_tenant_scope_and_branch_memberships.sql`
47. `supabase/migrations/20261111000026_strict_tenant_immutability.sql`
48. `supabase/migrations/20261111000027_validate_unconstrained_tenant_references.sql`
49. `supabase/migrations/20261111000028_validate_notification_receipts.sql`
50. `supabase/migrations/20261111000029_validate_role_notification_audiences.sql`
51. `supabase/migrations/20261111000030_prevent_cash_refund_overdraw.sql`
52. `supabase/migrations/20261111000031_add_purchase_returned_status.sql`
53. `supabase/migrations/20261111000032_mark_fully_returned_purchases.sql`
54. `supabase/migrations/20261111000033_require_active_branch_for_sales_and_sessions.sql`



## ترحيل Drizzle القديم

يوجد ملف واحد قديم:
`drizzle/migrations/0000_scope_permission_visibility.sql`

تم نقل أثره الوظيفي إلى الترحيل رقم 24 في سلسلة Supabase. لا تشغّل الملف القديم منفرداً بعد تشغيل سلسلة Supabase حتى لا تعيد تطبيق تغييرات السياسات.

## ملف SQL الشامل

`supabase/COMPLETE_DATABASE.sql` يجمع محتويات جميع الترحيلات المتسلسلة بالترتيب، وهو Snapshot كامل لإعادة البناء من قاعدة فارغة.

**المسار الموصى به:** `supabase db push` لأنه يحافظ على سجل الترحيلات. لا تشغّل Snapshot يدوياً ثم تشغّل `db push` على القاعدة نفسها؛ اختر طريقة واحدة فقط.

55. `supabase/migrations/20261111000034_allow_super_owners_tenant_admin_rls.sql`
56. `supabase/migrations/20261111030810_prevent_negative_inventory_bootstrap.sql`
57. `supabase/migrations/20261111033000_enforce_role_permissions.sql`
58. `supabase/migrations/20261111035000_get_my_permissions_invoker.sql`
59. `supabase/migrations/20261111040000_fix_cashier_pos_checkout_permissions.sql`

60. `supabase/migrations/20261112010000_restaurant_image_storage_foundation.sql`

61. `supabase/migrations/20261112020000_marketing_campaigns_management.sql`

62. `supabase/migrations/20261112030000_supplier_payment_ledger.sql`

63. `supabase/migrations/20261112033000_supplier_ledger_fk_indexes_and_marketing_rls.sql`

**الإجمالي: 63 ترحيلاً.**
