# مصالحة سجل Supabase الإنتاجي مع ملفات المستودع — 28 نوفمبر 2026

## النطاق وطريقة الفحص

- المستودع: `shabacttbzuf/clean-code-cloud`
- الفرع المرجعي وقت الفحص: `main` — `4a6592e16b00975c67877a5071e28070b5b82a5f`
- مشروع Supabase: `elflszuqcznexrepblsz`
- الحالة: قراءة فقط (Read-only).
- قاعدة البيانات: PostgreSQL 17.11، وحالة المشروع `ACTIVE_HEALTHY`.
- لم يتم تنفيذ `db push` أو `migration repair` أو DDL أو DML أو أي تغيير على بيانات الإنتاج.

## أرقام السجل

| المصدر | العدد |
|---|---:|
| ملفات `supabase/migrations` في main | 139 |
| مراجع ملفات migrations في `MIGRATION_MANIFEST.md` | 139 |
| ملفات محلية غير مذكورة في manifest | 0 |
| سجل migrations البعيد في Supabase | 117 |
| أسماء محلية متطابقة بعد تطبيع بادئة الإصدار وفواصل UUID | 112 |
| أسماء محلية لا يقابلها اسم بعيد مطابق | 27 |
| أسماء بعيدة لا يقابلها اسم ملف محلي مطابق | 5 |
| فرق العدد الصافي | 22 |

تطبيع المطابقة يحذف بادئة الإصدار ذات 14 رقماً عند المقارنة، ويوحد الشرطة والشرطة السفلية في معرفات UUID. لذلك فإن اختلاف الاسم لا يثبت وحده أن SQL لم يُنفذ؛ بعض الترحيلات البعيدة أُعيدت تسميتها أو نُفذت تحت إصدارات/أسماء مختلفة. لكن وجود 27 اسماً محلياً غير مطابق و5 أسماء بعيدة بلا مصدر مطابق يستلزم مصالحة دلالية لكل ترحيل قبل أي نشر قاعدة بيانات.

## الأسماء المحلية غير المطابقة للسجل البعيد

```text
20261111000034_allow_super_owners_tenant_admin_rls
20261115000005_company_branch_creator_isolation
20261115000006_enforce_company_branch_rls
20261115000007_scope_cash_sessions_to_company
20261118000001_allow_company_members_to_read_assigned_company
20261120010000_secure_leave_decisions_and_deletion
20261125000100_offline_sync_kitchen_idempotency
20261125010000_granular_section_action_permissions
20261125020000_granular_marketing_rls_alignment
20261125030000_section_crud_permissions
20261125060000_audit_history_permission_reads
20261125070000_private_purchase_rpc_wrappers
20261125080000_permission_override_write_gates
20261125090000_sensitive_action_audit_triggers
20261125100000_prevent_direct_expense_deletion
20261125110000_prevent_product_history_deletion
20261126220000_inventory_adjustment_permission_and_branch_guard
20261127010000_fix_promotion_gift_eligibility_and_same_sku
20261127020000_ads_multi_branch_targeting_and_placements
20261127030000_notification_realtime_publication
20261127040000_low_stock_event_notifications
20261127040100_hr_leave_event_notifications
20261127040200_overdue_kitchen_order_notifications
20261127040300_customer_invoice_event_notifications
20261127040400_notification_scope_archive_and_missing_sources
20261127040500_notification_kitchen_ready_actor_safety
20261127050000_redact_customer_notification_payloads
```

## أسماء موجودة في السجل البعيد دون ملف مصدر مطابق

```text
seed_restaurant_catalog_and_departments
allow_branch_scoped_staff_to_view_assigned_branch
secure_leave_decisions_and_deletion_live_repair
ads_placements_branch_targeting
ads_placements_company_fk_index
```

## فحص RLS والأمن المباشر

- جداول `public` المرصودة: 56.
- جميع الجداول الـ56 لديها RLS مفعّل.
- دوال `SECURITY DEFINER` في `public` المرصودة: 12؛ جميعها تضبط `search_path`، ولم يظهر منح EXECUTE إلى `anon` أو `authenticated` في الفحص.
- جدولان عليهما RLS دون سياسات: `marketing_campaign_events` و`pos_access_credentials`. لم يظهر لهما منح مباشر لـ`anon` أو `authenticated`؛ لا تُضف سياسات عامة لمعالجة تنبيه Advisor.
- Supabase Security Advisor: تحذير واحد بشأن تعطيل Leaked Password Protection، ومعلومتان بشأن الجدولين أعلاه.
- Performance Advisor: 121 تنبيهاً عن تعدد سياسات permissive و62 فهرساً غير مستخدم. هذه تنبيهات للمراجعة وليست مبرراً لحذف السياسات أو الفهارس؛ السياسات restrictive الموجودة قد تفرض حدوداً إضافية بمنطق AND.

## نقطة P1: منح الكتابة والحذف على الجداول المالية

أظهر فحص كتالوج PostgreSQL أن `anon` و`authenticated` يملكان منحاً مباشراً لـSELECT/INSERT/UPDATE/DELETE على:
- `public.expenses`
- `public.payroll_runs`
- `public.payroll_items`

RLS مفعّل، وسياسات authenticated الحالية تتضمن حدود صلاحيات ونطاق شركة/فرع؛ لذلك لا يعني وجود GRANT وحده تجاوز RLS. لكنه يمنح سطح كتابة مباشر واسعاً، كما أن سياسة حذف المصروفات لا تزال موجودة في القاعدة الحية. ملف المصدر المحلي `20261125100000_prevent_direct_expense_deletion.sql` غير مطابق لسجل migrations البعيد. كما أن حذف مسيرات الرواتب وبنودها ما زال مسموحاً ضمن بعض سياسات الصلاحيات الحالية.

يلزم مراجعة مسارات الحذف في التطبيق، ثم إعداد ترحيل متوافق واختبارات سلبية في بيئة منفصلة قبل اعتماد سحب منح DELETE. لم تُنفذ أي تغييرات على الإنتاج.

أما `payments` فظهر له SELECT فقط، و`marketing_campaign_events` و`pos_access_credentials` لا يملكان منحاً مباشراً لأدوار API في هذا الفحص.

## الرواتب ومنع التكرار

- توجد فهارس فريدة على `payroll_runs` للفترة والفرع، بما فيها فهرس جزئي منفصل لحالة `branch_id IS NULL`؛ هذا يحمي من تكرار المسير غير المرتبط بفرع.
- توجد كذلك فهرسة فريدة أقدم على `(tenant_id, branch_id, period_year, period_month)`؛ لا تُحذف تلقائياً قبل فحص اعتمادياتها.
- الفحص البرمجي الحالي لـ`runMonthlyPayroll` ينشئ المسير والبنود ويربط المكافآت والخصومات عبر عدة طلبات، ثم يحاول التنظيف عند الفشل؛ هذا ليس بديلاً عن معاملة PostgreSQL ذرية.
- `markPayrollPaid` يحدّث حالة المسير إلى `paid` ولا يظهر في مساره الحالي إنشاء قيد محاسبي/حركة صندوق ذرية. يلزم إكمال تصميم دورة الصرف المحاسبية على Staging قبل اعتماد هذه الوظيفة للإنتاج.

## قرار المصالحة

1. يمنع تشغيل `supabase db push` أو `migration repair` على الإنتاج اعتماداً على فرق العدد فقط.
2. لا تُعاد إضافة أي migration بالاسم نفسه قبل مقارنة محتواها مع الأثر الفعلي في المخطط.
3. يجب استعادة مصادر الترحيلات البعيدة الخمسة أو توثيق مصدرها البديل.
4. يجب فحص كل ترحيل من الأسماء المحلية الـ27 مقابل تعريفات الجداول والسياسات والدوال والفهارس الحالية.
5. يجب إعداد قاعدة Staging مستقلة واختبار الاستعادة والـmigrations وpgTAP قبل أي ترحيل إنتاجي.
6. لا يُعتبر المشروع متوافقاً مع قاعدة الإنتاج حتى تنتهي المصالحة ويثبت التطابق.

هذا التقرير يسجل نتائج فحص قراءة فقط؛ ولا يشكل موافقة على تطبيق migrations أو تعديل بيانات الإنتاج.
