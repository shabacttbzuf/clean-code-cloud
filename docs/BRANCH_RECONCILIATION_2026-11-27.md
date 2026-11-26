# تقرير حصر الفروع ومصالحة main — 27 نوفمبر 2026

## النطاق وخط الأساس

- المستودع: `shabacttbzuf/clean-code-cloud`
- الفرع المستهدف: `integration/ui-ux-1.0`
- رأس الفرع عند بدء الفحص: `f492564d300eabc72a75302710e553ed2fd38646`
- عدد الفروع المرصودة: **90**، وعدد PRs المفتوحة: **18**.
- تمت مقارنة جميع الفروع الـ89 الأخرى مع فرع التكامل. مقارنة main: `main` متقدم 9 commits، والتكامل متقدم 308 commits عن merge base `7e4bff2e323f03ea1600c07ef9a1ba187ad5a650`.

## 1. فروع تاريخها مدمج أو أصبحت سلفاً للتكامل

هذه الفروع لا تحمل commits فريدة فوق التكامل (ahead = 0)، لذلك لا تُدمج مرة أخرى:

- `audit/prelaunch-security-and-release-hardening`
- `docs/update-production-audit-after-merges`
- `feature/enterprise-multicompany-identity-notifications`
- `feature/prelaunch-hardening`
- `fix/cash-session-company-scope`
- `fix/customer-payment-idempotency-scope`
- `fix/dashboard-auth-health-check`
- `integration/task-18-offline-sync`
- `reconcile/main-fixes-into-integration-v2`

## 2. فروع إصلاح مستقلة — مراجعة انتقائية مطلوبة

| الفرع | commits فريدة تقريباً | الملفات المتغيرة | القرار الحالي |
|---|---:|---:|---|
| `fix/hr-leave-approval-delete` | 11 | 7 | ترحيلات قرارات الإجازة موجودة في سلسلة التكامل؛ لا نسخ عشوائي |
| `fix/live-leave-decision-migration` | 4 | 4 | migration متابعة؛ يلزم مقارنة hash/اختبارات قبل إعادة النقل |
| `fix/notification-read-policy-index-dedup` | 6 | 4 | مراجعة فهارس وسياسات الإشعارات؛ لا إعادة تطبيق دون التحقق من وجود migration |
| `fix/pos-passcode-on-demand-any-length` | 6 | 4 | مرشح لمراجعة POS/الأمان؛ لا merge شامل قبل diff |
| `fix/promotion-api-grants-and-fk-indexes` | 2 | 2 | migration الفهارس والمنح موجودة في التكامل |
| `fix/promotion-same-sku-hardening` | 7 | 58 | branch متداخل مع UIUX/main؛ يلزم استخراج الفرق الحقيقي فقط |
| `fix/sales-receipt-order-details` | 35 | 8 | تغيير receipt/schema حساس؛ يلزم فحص التوافق المالي قبل النقل |
| `fix/security-definer-private-wrappers` | 2 | 2 | راجع migrations الحالية؛ لا تكرر نقل الدوال إلى private |
| `hardening/pre-sale-five-priorities` | 11 | 8 | مراجعة أمن/أداء؛ migration موجودة في التاريخ لكن يلزم التحقق من أثرها |
| `perf/index-platform-branding-updated-by` | 4 | 4 | فهرس داعم موجود في التكامل وفق مراجعة سابقة |
| `fix/ads-archive-lifecycle-stage-8` | 2 | 2 | إصلاح واجهة/اختبار مستقل؛ لم يُدمج بعد |

## 3. فروع قديمة أو متكررة أو متباعدة — لا تدمج ككتلة

- `fix/security-phase-1`: 124 commits فريدة تقريباً و786 خلف التكامل؛ مصدر تاريخي قديم، ودمجه يعيد migrations وتعريفات أقدم.
- `integration/task-15-permissions`: 121 ahead و50 behind و79 ملفاً؛ CI سابق فشل في pgTAP. نُقل إصلاح inventory المحدد انتقائياً إلى التكامل، ولا يُدمج الفرع كله.
- `work/uiux-15-permissions`: 180 ahead و308 behind؛ فرع تاريخي واسع ومتداخل مع نسخ أحدث.
- عائلة offline validation (`feature/offline-sync-ci-validation*`, `validation/offline-sync-user-scope-20261125`, `ci/validate-offline-sync-18-20261125`) متداخلة مع التنفيذ الحالي؛ لا تُستبدل migrations الحالية بنسخ قديمة.
- فروع `work/uiux-01` إلى `work/uiux-20` متفرعة من قواعد أقدم، وتُراجع تغييراتها الفريدة حسب المهمة بدلاً من دمج تاريخها.
- `test/operational-transaction-regressions` و`test/tenant-isolation-rls-regression`: ملفات اختبارات مطابقة للتغطية الموجودة في التكامل بحسب المراجعة السابقة؛ لا تكرار.
- `reconcile/main-fixes-into-integration`: محاولة سابقة متباعدة وفشل CI في dashboard branch-cache؛ استُبدلت بالمراجعة v2 التي أصبحت سلفاً للتكامل.

## 4. فحص commits main التسعة

| SHA مختصر | التغيير | قرار التكامل |
|---|---|---|
| `ea700f5` | إضافة اختبار حذف المصروف | أُزيل في commit التالي؛ لا تغيير نهائي |
| `46c24d8` | التراجع عن اختبار المصروف | محتوى نهائي فارغ |
| `735fb4b` | استكمال UI/UX 1.0 وproduction hardening | جميع مساراته موجودة في التكامل؛ نسخ التكامل أحدث في RTL/offline/cache/security |
| `d8f69dd` | فهارس مفاتيح الإعلانات | migration موجودة في التكامل |
| `410b189` | فحص صحة المصادقة | commit بلا ملفات متغيرة |
| `4fc1f60` | تدقيق Task 16 واختبار pgTAP | التقرير والاختبار موجودان؛ نسخة التكامل أدق في فحص CRUD/scoping |
| `414825a` | تعزيز اختبار سياسات الإعلانات | اختبارات التكامل تشمل assertions إضافية |
| `d90c52e` | تحديث tracker | سجل التكامل أحدث |
| `c93d6e0` | تسجيل نجاح CI | سجل التكامل أحدث |

**فحص شجرة Git:** شجرة main تحتوي 377 مدخلاً، وشجرة التكامل 395؛ لم يوجد أي مسار في main مفقود من التكامل. الملفات المتباينة تمت مراجعتها انتقائياً. لا حاجة لاستبدال snapshot/manifest من main؛ فرع التكامل يحتفظ بترحيل offline kitchen وترحيل inventory الإضافيين (119 ترحيلاً محلياً مقابل 117 في manifest main).

## 5. فرع مرفوض بسبب migrations فارغة

`reconcile/security-notifications-into-integration` متقدم 4 commits ولا يتأخر عن التكامل، لكنه يضيف 19 ملف migration فارغاً (0 bytes، SHA فارغ موحد `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391`) وworkflow مؤقتاً بصلاحية `contents: write` يولد أسماء migrations فارغة تلقائياً. لا تُدمج هذه الملفات ولا يُعتد بنجاح workflow على أنه تحقق SQL.

## 6. إصلاح نُقل الآن

تم تحسين `src/routes/_authenticated/pos.tsx`:
- مفتاح cache يشمل tenant/user/company/branch.
- إذا كان للطلب فرع نشط، تظهر الحملات العامة وحملات هذا الفرع فقط.
- إذا لم يوجد فرع نشط، تظهر الحملات العامة فقط.
- أضيف اختبار مصدر في `tests/dashboard-quality.test.mjs`.
- لا يتطلب هذا التعديل migration لأنه لا يغير schema.

## 7. بوابة الاختبار والدمج

- آخر CI قبل تعديل POS: Run #2587 / `45893413771` على SHA `f492564d300eabc72a75302710e553ed2fd38646`: SUCCESS بجميع المراحل.
- تعديل POS الجديد لم يُختبر بعد؛ يجب انتظار CI الجديد.
- PR #84 لا يُدمج قبل إعادة المصالحة والتحقق؛ PR #72 لا يُدمج إلى main إلا بعد اكتمال مراجعة الفروع ونجاح TypeScript والاختبارات والبناء وChromium وmigrations النظيفة وpgTAP على رأس واحد.
- لا توجد تغييرات على قاعدة الإنتاج أو بياناتها، ولا force-push أو حذف فروع.

### تصحيح CI لفرع POS

فشل Run #2588 في اختبار Node لأن شرط branch filter لم يكن موجوداً فعلياً رغم إضافة cache key. أُضيف الشرط إلى الاستعلام وأُصلح الاختبار؛ ينتظر الإصلاح CI جديداً.

## نقل انتقائي من Task 11 — التقارير

تم اعتماد نسخة التقارير المحمية من `work/uiux-11-reports` فقط، دون دمج تاريخ الفرع القديم. التغيير يفرض صلاحيات كل مجال ونطاق الشركة/الفرع، ويمنع إظهار تكلفة وربحية المخزون/المبيعات دون صلاحية مالية مزدوجة. أضيف اختبار مصدر مستقل؛ لا migration مطلوبة.

تصحيح TypeScript بعد Run #2590: مسارات عدم الصلاحية داخل callbacks `fetchAllRows` تعيد الآن Promise بنتيجة فارغة بدلاً من مصفوفة مباشرة. لم يتغير نطاق البيانات أو الصلاحيات.

تصحيح ثانٍ لتقارير Task 11: تم تحديد نوع مصفوفة الشركات والفروع صراحةً لتجنب اتحاد `never[]` مع صفوف الشركة في TypeScript.

تصحيح إضافي بعد Run #2592: `companiesQuery` يعيد array مباشرة، بينما callbacks المرقمة في `fetchAllRows` تعيد نتيجة Promise.

## نقل مركز الدعم وصحة النظام

نُقلت صفحة الدعم ومكتبة الفحص واختباراتها انتقائياً. لا تغييرات قاعدة بيانات، ولا يتم تخزين بيانات التشخيص أو الأسرار محلياً.

## مراجعة نهائية لمصالحة main — تحديث 27 نوفمبر 2026

- رأس التكامل بعد إضافة مركز الدعم: `a18a2da4436d4804a749b38abf567aca5cf27d24`؛ رأس main: `c93d6e0683e60dacf0572ae5d62fdd8cf3eddce3`.
- مقارنة Git: التكامل متقدم 315 commit ومتأخر 9 commits؛ merge base `7e4bff2e323f03ea1600c07ef9a1ba187ad5a650`.
- حصر الفروع: 90 فرعاً و18 PR مفتوحاً. طلبا #72 و#84 ما زالا Draft وحالة GitHub لهما `mergeable=false / dirty`.
- PR #84 يحتوي 59 مساراً: 41 متطابقاً و18 مختلفاً، ولا يوجد مسار في main غير موجود في شجرة التكامل. بعد فحص الفروق، احتفظنا بنسخ التكامل الأحدث في 17 مساراً. لم ننقل نسخة `profile.tsx` من main لأنها تعرض `national_id` في صفحة المستخدم الذاتية، بينما اختبار الخصوصية الحالي يمنع ذلك صراحةً. لا يُنفذ دمج PR #84 بالجملة.
- commits main التسعة تمت مراجعتها؛ اختبار حذف المصروف أُضيف ثم أزيل، وبقية التغييرات الوظيفية ذات الصلة موجودة في التكامل أو بنسخة أحدث. لا حاجة لنسخ snapshot/manifest من main: تكاملنا يحتفظ بترحيل offline kitchen وترحيل inventory الإضافيين (119 مقابل 117 في نسخة main).
- فروع إصلاح الإجازات، وسياسات قراءة الإشعارات، وPOS passcode، وتفاصيل إيصال البيع، وprivate wrappers، وpre-sale hardening، وفهرس platform branding: migrations/الملفات الأساسية المقابلة موجودة في شجرة التكامل؛ لا تكرار أو دمج تاريخها القديم.
- CI Run #2593 على SHA `356433a` وRun #2594 على SHA `a18a2da` نجحا. Run #2594 شمل TypeScript والاختبارات والبناء وChromium ومigrations النظيفة وpgTAP.
- لم يحدث دمج إلى main أو تعديل لقاعدة الإنتاج. يبقى حل divergence/dirty state شرطاً قبل الدمج النهائي.

## حصر الفروع التسعين — مقارنة موثقة عند SHA 5c39eb8

أُجريت مقارنة GitHub لكل الفروع التسعين مع رأس التكامل `5c39eb89d2be006fb10d6044dfa01819b24df644`. بعد هذه اللقطة أضيف التزامان خاصان بإصلاح اختبار pgTAP فقط (`68d2ab7` و`7f34bc2`) دون تغيير ملفات التطبيق أو migrations؛ لذلك بقي تصنيف الفروع الوظيفي كما هو.

- 80 فرعاً تحمل commits غير موجودة في تاريخ التكامل؛ 79 منها تُظهر اختلاف ملفات، وفرع واحد `feature/production-pos-responsive` يحتوي commit فارغاً بلا فروق ملفات.
- 9 فروع لا تحمل commits فريدة وهي خلف التكامل؛ وفرع التكامل نفسه هو المرجع المطابق.
- لا يعني ahead وجود ميزة جديدة قابلة للدمج: أرقام ahead/behind تاريخية، والاختلافات تشمل نسخاً قديمة ومكررة من ملفات أصبحت أحدث في التكامل.

| الفرع | Ahead | Behind | Files |
|---|---:|---:|---:|
| `audit/prelaunch-security-and-release-hardening` | 0 | 395 | 0 |
| `ci/validate-offline-sync-18-20261125` | 49 | 340 | 10 |
| `docs/migration-reconciliation-evidence` | 1 | 373 | 1 |
| `docs/update-production-audit-after-merges` | 0 | 378 | 0 |
| `feat/ads-permission-separation-stage-8` | 8 | 353 | 8 |
| `feat/kitchen-display-foundation` | 9 | 364 | 7 |
| `feat/kitchen-display-workflow` | 8 | 363 | 8 |
| `feat/kitchen-tables-pos-workflow` | 16 | 365 | 10 |
| `feat/notification-deep-links-stage-10` | 32 | 351 | 12 |
| `feat/pos-cashier-password-session-persistence` | 15 | 343 | 9 |
| `feat/profile-completeness-stage-14` | 5 | 346 | 3 |
| `feat/promotions-stage-9` | 15 | 352 | 11 |
| `feat/reports-analytics-stage-11` | 9 | 350 | 3 |
| `feat/restaurant-tables-pos-order-types` | 33 | 362 | 12 |
| `feat/role-catalog-permission-tools` | 7 | 362 | 4 |
| `feat/settings-hardening-stage-13` | 10 | 347 | 7 |
| `feat/sidebar-free-workspace-pos-ads-fix` | 13 | 350 | 10 |
| `feat/stage-15-security-branch-isolation-hardening` | 4 | 345 | 4 |
| `feat/stage-16-responsive-brand-system` | 2 | 344 | 2 |
| `feat/support-system-health-stage-12-rebased` | 6 | 348 | 6 |
| `feat/support-system-health-stage-12` | 11 | 349 | 6 |
| `feat/ui-ux-1-0-dashboard-reference` | 6 | 359 | 4 |
| `feat/ui-ux-1-0-foundation` | 20 | 360 | 8 |
| `feat/ui-ux-dashboard-reference-stage-5-7` | 8 | 356 | 2 |
| `feat/ui-ux-independent-ad-management` | 27 | 357 | 14 |
| `feat/ui-ux-stage-2-company-switcher` | 3 | 356 | 1 |
| `feature/enterprise-multicompany-identity-notifications` | 0 | 401 | 0 |
| `feature/offline-sync-ci-validation` | 44 | 340 | 11 |
| `feature/offline-sync-ci-validation-2` | 45 | 340 | 11 |
| `feature/offline-sync-ci-validation-3` | 46 | 340 | 11 |
| `feature/prelaunch-hardening` | 0 | 394 | 0 |
| `feature/production-pos-responsive` | 1 | 402 | 0 |
| `feature/uiux-06-verify` | 10 | 130 | 5 |
| `fix/ads-archive-lifecycle-stage-8` | 2 | 354 | 2 |
| `fix/cash-session-company-scope` | 0 | 381 | 0 |
| `fix/customer-payment-idempotency-scope` | 0 | 386 | 0 |
| `fix/dashboard-auth-health-check` | 0 | 338 | 0 |
| `fix/desktop-sidebar-visibility` | 9 | 365 | 7 |
| `fix/hr-leave-approval-delete` | 11 | 368 | 7 |
| `fix/live-leave-decision-migration` | 4 | 366 | 4 |
| `fix/marketing-advertising-fk-indexes` | 12 | 340 | 56 |
| `fix/marketing-company-read-isolation` | 16 | 364 | 6 |
| `fix/migration-snapshot-sync` | 2 | 371 | 2 |
| `fix/notification-read-policy-index-dedup` | 6 | 377 | 4 |
| `fix/permissions-security-stage-15` | 6 | 345 | 5 |
| `fix/pgtap-json-validation-assertions` | 2 | 370 | 1 |
| `fix/pos-passcode-on-demand-any-length` | 6 | 341 | 4 |
| `fix/promotion-api-grants-and-fk-indexes` | 2 | 342 | 2 |
| `fix/promotion-same-sku-hardening` | 7 | 340 | 58 |
| `fix/sales-receipt-order-details` | 35 | 360 | 8 |
| `fix/security-definer-private-wrappers` | 2 | 372 | 2 |
| `fix/security-phase-1` | 124 | 818 | 64 |
| `hardening/pre-sale-five-priorities` | 11 | 374 | 8 |
| `integration/task-15-permissions` | 121 | 82 | 79 |
| `integration/task-18-offline-sync` | 0 | 84 | 0 |
| `integration/ui-ux-1.0` | 0 | 0 | 0 |
| `main` | 9 | 340 | 59 |
| `perf/index-platform-branding-updated-by` | 4 | 376 | 4 |
| `reconcile/main-fixes-into-integration` | 2 | 35 | 7 |
| `reconcile/main-fixes-into-integration-v2` | 0 | 33 | 0 |
| `reconcile/security-notifications-into-integration` | 4 | 32 | 20 |
| `security/company-scope-notifications-marketing` | 122 | 375 | 24 |
| `test/operational-transaction-regressions` | 3 | 368 | 1 |
| `test/tenant-isolation-rls-regression` | 2 | 369 | 1 |
| `validation/offline-sync-user-scope-20261125` | 47 | 340 | 10 |
| `work/fix-uiux-18-typecheck` | 87 | 340 | 13 |
| `work/fix-uiux-18-typecheck-clean` | 87 | 340 | 13 |
| `work/ui-ux-1.0-complete` | 22 | 130 | 13 |
| `work/uiux-01-design` | 15 | 130 | 8 |
| `work/uiux-02-header` | 23 | 130 | 5 |
| `work/uiux-03-tabs` | 123 | 130 | 30 |
| `work/uiux-04-app-launcher` | 14 | 130 | 4 |
| `work/uiux-05-home` | 36 | 130 | 7 |
| `work/uiux-05-home-final` | 13 | 130 | 5 |
| `work/uiux-05-home-rebased` | 1 | 130 | 1 |
| `work/uiux-06-statistics` | 13 | 130 | 4 |
| `work/uiux-07-orders-kitchen` | 12 | 130 | 4 |
| `work/uiux-08-ads` | 17 | 130 | 13 |
| `work/uiux-09-promotions` | 9 | 340 | 4 |
| `work/uiux-10-notifications` | 66 | 340 | 24 |
| `work/uiux-11-reports` | 40 | 130 | 1 |
| `work/uiux-12-support-health` | 15 | 340 | 4 |
| `work/uiux-13-settings` | 14 | 340 | 6 |
| `work/uiux-14-profile` | 2 | 340 | 1 |
| `work/uiux-15-permissions` | 180 | 340 | 67 |
| `work/uiux-16-database-security` | 23 | 340 | 2 |
| `work/uiux-17-offline-foundation` | 52 | 344 | 19 |
| `work/uiux-18-offline-sync` | 88 | 340 | 13 |
| `work/uiux-19-responsive` | 34 | 340 | 15 |
| `work/uiux-20-performance` | 44 | 340 | 29 |

## تصحيح مراجعة main وPR #84

- PR #84 يحتوي 59 مساراً؛ عند مقارنة blobs بين شجرتي التكامل وmain كانت 26 نسخة متطابقة و33 مختلفة، ولا يوجد مسار من main مفقود في التكامل.
- commit `735fb4b` وحده غيّر 55 ملفاً: 24 متطابقة و31 مختلفة؛ جميع مساراته موجودة في التكامل. الفروق المهمة في التكامل أكثر صرامة: لا cache offline لصلاحيات Super Owner/permissions، لا حذف مباشر للفروع أو المنتجات أو المصروفات، صلاحيات CRUD دقيقة، نطاق فرع في dashboard/POS، مطبخ offline idempotent، وتقارير محكومة بالصلاحيات.
- تغييرات main الأخرى المفيدة موجودة: فحص `supabase.auth.getUser()` في health probe للوحة، فهارس marketing، تقرير Task 16، وحماية حذف المصروفات. اختبار Task 16 الآن يحافظ على 14 assertion ويقيس أسماء السياسات الثماني المقصودة تحديداً.
- لم يُنقل `national_id` إلى الصفحة الذاتية. لم تُنسخ ملفات manifest/snapshot الأقدم من main.
- تصحيح توثيقي: PR #86 كان لتحديد الحملات حسب الفرع وتحديث لوحة التحكم، وليس PR دمج تاريخ main. PR #84 يظل طلباً متقادماً؛ لا يُدمج بالجملة.

## تسوية PR #79 / المهمة 15

- فرع `integration/task-15-permissions` يحمل 121 commit فريداً و79 مساراً مختلفاً عند المقارنة مع لقطة التكامل؛ لا يُدمج بالجملة.
- التحديثات الأساسية للصفحات والمساعدات موجودة في التكامل: `hasPermission` للعمليات، منع حذف المنتجات/الفروع، أرشفة المنتج، وإغلاق جلسات النقدية وفق الصلاحية والنطاق.
- `20261125070000_private_purchase_rpc_wrappers.sql` في التكامل يضم منطق `purchases.create` و`purchases.returns.create` في private SECURITY DEFINER functions مع أغلفة public SECURITY INVOKER وفحوص نطاق/مورد أقوى؛ لذلك `20261125040000` و`20261125050000` من PR #79 قديمان ومكرران وظيفياً.
- `20261126220000_inventory_adjustment_permission_and_branch_guard.sql` يستبدل `20261125120000_inventory_balance_rpc_only.sql` بحماية أشمل تشمل `inventory.adjust`، نطاق الفرع، منع INSERT/UPDATE/DELETE/TRUNCATE المباشر، وسجل الحركة.
- أُضيفت مصفوفة تغطية الصلاحيات إلى وثائق التكامل، وتظل الفجوات المسجلة فيها مفتوحة حتى تغطية كل انتقال حالة واختبارات سلبية لكل دور. لا يُدمج تاريخ PR #79.

## توحيد migrations والتحقق

- عند SHA `5c39eb8`: 128 ملف migration، 128 إدخالاً في `MIGRATION_MANIFEST.md`، و128 marker في `COMPLETE_DATABASE.sql`؛ لم يظهر أي اسم ناقص أو زائد.
- أضيف اختبار Node يقارن أسماء الملفات مع manifest وsnapshot ويتحقق من تضمين محتوى كل migration داخل كتلة snapshot المقابلة.
- CI Run #2602 / `45905522571` على SHA `7f34bc247c9be72cfffe607c80baa8c9945804c6`: **SUCCESS**؛ نجح TypeScript والاختبارات والبناء وChromium، وتطبيق جميع migrations على قاعدة Supabase محلية نظيفة، وجميع اختبارات pgTAP.
- لا تغيير في قاعدة الإنتاج. لم يحدث الدمج إلى main بعد.

## خطة حسم PR #72

- بعد مراجعة commits main التسعة والاحتفاظ بنسخ التكامل الأحدث، سيُسجل main كأصل ثانٍ في merge commit على فرع التكامل مع الإبقاء على شجرة التكامل الحالية.
- سيعاد تشغيل CI كاملاً على SHA merge commit نفسه. بعدها فقط يعاد فحص mergeability وPR reviews، ثم يجهز PR #72 للدمج ويُدمج إذا ظل CI أخضر ولم تظهر تعارضات أو حماية فرع تمنع ذلك.
