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

60. `supabase/migrations/20261111232801_restaurant_image_storage_foundation.sql`

61. `supabase/migrations/20261111233538_marketing_campaigns_management.sql`

62. `supabase/migrations/20261112002129_supplier_payment_ledger.sql`

63. `supabase/migrations/20261112002432_supplier_ledger_fk_indexes_and_marketing_rls.sql`

64. `supabase/migrations/20261112002832_restrict_supplier_payment_mutations.sql`

65. `supabase/migrations/20261112003426_supplier_cash_session_integration.sql`

66. `supabase/migrations/20261112003745_supplier_cash_session_fk_index.sql`

67. `supabase/migrations/20261112004325_assignable_custom_roles.sql`

68. `supabase/migrations/20261112005125_owner_only_custom_role_management.sql`

69. `supabase/migrations/20261112005250_owner_only_custom_role_mutations.sql`

70. `supabase/migrations/20261112005412_protect_tenant_owner_from_custom_role_demotion.sql`

**الإجمالي: 70 ترحيلاً.**

71. `supabase/migrations/20261114141029_fix_atomic_stock_decrement_for_pos_checkout.sql`

72. `supabase/migrations/20261114141500_grant_authenticated_marketing_campaign_reads.sql`

**الإجمالي: 72 ترحيلاً.**

73. `supabase/migrations/20261115000001_customer_credit_accounts_and_collections.sql`
74. `supabase/migrations/20261115000002_customer_credit_sale_rpc.sql`
75. `supabase/migrations/20261115000003_customer_cash_collection_reconciliation.sql`

**الإجمالي: 75 ترحيلاً.**

76. `supabase/migrations/20261115000004_fix_customer_balance_aggregation.sql`

**الإجمالي: 76 ترحيلاً.**

77. `supabase/migrations/20261115000005_company_branch_creator_isolation.sql`

**الإجمالي: 77 ترحيلاً.**

78. `supabase/migrations/20261115000006_enforce_company_branch_rls.sql`

**الإجمالي: 78 ترحيلاً.**

79. `supabase/migrations/20261115000007_scope_cash_sessions_to_company.sql`

**الإجمالي: 79 ترحيلاً.**

80. `supabase/migrations/20261118000001_allow_company_members_to_read_assigned_company.sql`

**الإجمالي: 80 ترحيلاً.**

81. `supabase/migrations/20261118000002_company_creator_visibility_for_master_data.sql`

**الإجمالي: 81 ترحيلاً.**

82. `supabase/migrations/20261118000003_enforce_company_scope_across_operational_data.sql`

**الإجمالي: 82 ترحيلاً.**

83. `supabase/migrations/20261118000004_tighten_company_compound_scope_checks.sql`

**الإجمالي: 83 ترحيلاً.**

84. `supabase/migrations/20261118000005_index_company_creator_foreign_keys.sql`

**الإجمالي: 84 ترحيلاً.**

85. `supabase/migrations/20261118000006_platform_branding_and_notification_reads.sql`

86. `supabase/migrations/20261119000001_customer_credit_sale_cost_snapshot.sql`

**الإجمالي: 86 ترحيلاً.**

87. `supabase/migrations/20261119000002_scope_customer_payment_idempotency.sql`

**الإجمالي: 87 ترحيلاً.**

88. `supabase/migrations/20261119000003_scope_cash_session_close_to_branch.sql`

89. `supabase/migrations/20261119000004_deduplicate_notification_read_policies_and_index.sql`

90. `supabase/migrations/20261119000005_index_platform_branding_updated_by.sql`

91. `supabase/migrations/20261119000006_company_scope_marketing_notifications.sql`

**الإجمالي: 91 ترحيلاً.**
92. `supabase/migrations/20261119000007_user_role_company_scope.sql`

93. `supabase/migrations/20261119000008_bind_branch_access_and_helper_actors.sql`

94. `supabase/migrations/20261119000009_private_avatar_and_company_asset_scope.sql`

**الإجمالي: 94 ترحيلاً.**

95. `supabase/migrations/20261119010000_pre_sale_security_performance_hardening.sql`

**الإجمالي: 95 ترحيلاً.**

96. `supabase/migrations/20261120000000_move_authenticated_definers_to_private_wrappers.sql`

**الإجمالي: 96 ترحيلاً.**

97. `supabase/migrations/20261120010000_secure_leave_decisions_and_deletion.sql`

**الإجمالي: 97 ترحيلاً.**

98. `supabase/migrations/20261120020000_leave_rejection_actor_integrity.sql`

**الإجمالي: 98 ترحيلاً.**

99. `supabase/migrations/20261120030000_enforce_company_scope_marketing_reads.sql`

**الإجمالي: 99 ترحيلاً.**

100. `supabase/migrations/20261120040000_kitchen_order_workflow.sql`

**الإجمالي: 100 ترحيلاً.**

101. `supabase/migrations/20261120050000_restaurant_tables_pos_order_types.sql`

**الإجمالي: 101 ترحيلاً.**

102. `supabase/migrations/20261120060000_sale_table_name_receipt_snapshot.sql`

**الإجمالي: 102 ترحيلاً.**

103. `supabase/migrations/20261121010000_separate_ads_management_permission.sql`

**الإجمالي: 103 ترحيلاً.**

104. `supabase/migrations/20261121020000_promotional_offers_and_pos_redemptions.sql`

**الإجمالي: 104 ترحيلاً.**

105. `supabase/migrations/20261121025000_promotions_read_permission_scope.sql`

**الإجمالي: 105 ترحيلاً.**

106. `supabase/migrations/20261121030000_notification_deep_links.sql`

**الإجمالي: 106 ترحيلاً.**

107. `supabase/migrations/20261121040000_reconcile_ads_campaign_write_permissions.sql`

**الإجمالي: 107 ترحيلاً.**

108. `supabase/migrations/20261122010000_stage15_fk_index_and_security_regression_guards.sql`

**الإجمالي: 108 ترحيلاً.**

109. `supabase/migrations/20261122030000_pos_cashier_access_credentials.sql`

**الإجمالي: 109 ترحيلاً.**

110. `supabase/migrations/20261122040000_grant_promotions_api_access_and_fk_indexes.sql`

**الإجمالي: 110 ترحيلاً.**

111. `supabase/migrations/20261124010000_marketing_campaign_analytics.sql`

**الإجمالي: 111 ترحيلاً.**

112. `supabase/migrations/20261124020000_restore_marketing_campaign_write_grants.sql`

**الإجمالي: 112 ترحيلاً.**

113. `supabase/migrations/20261124021000_marketing_campaign_events_fk_indexes.sql`

**الإجمالي: 113 ترحيلاً.**

114. `supabase/migrations/20261124151227_move_marketing_analytics_to_private_wrappers.sql`

**الإجمالي: 114 ترحيلاً.**

115. `supabase/migrations/20261126210000_marketing_advertising_foreign_key_indexes.sql`

**الإجمالي: 115 ترحيلاً.**

116. `supabase/migrations/20261126190000_marketing_ad_spaces_and_branch_targeting.sql`

**الإجمالي: 116 ترحيلاً.**

117. `supabase/migrations/20261126200000_scope_marketing_analytics_to_branch.sql`

**الإجمالي: 117 ترحيلاً.**


ترحيل الفهارس رقم 115 يضيف فهارس جزئية ومركبة لمفاتيح الإعلانات الخارجية، ولا يغيّر بيانات الأعمال أو سياسات الوصول.

ملاحظة ترتيب: يُنفّذ ترحيل الفهارس بعد إنشاء مساحات الإعلانات وإضافة نطاق الفرع إلى أحداث الحملات، لذلك يأتي بعد الترحيلين 116 و117 في ترتيب الملفات الزمني.
