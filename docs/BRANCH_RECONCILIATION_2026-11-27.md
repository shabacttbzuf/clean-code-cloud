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
