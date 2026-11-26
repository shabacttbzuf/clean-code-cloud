# Agent Execution Log

## 2026-11-26 — Autonomous integration run

### Repository state
- Repository: `shabacttbzuf/clean-code-cloud`
- Target branch: `integration/ui-ux-1.0`
- PR: #72 (draft; base `main`, head `integration/ui-ux-1.0`)
- Starting branch SHA: `9a887552ca2fb1700fc9fb04664c5b6c199aac34`
- PR #72 is open, draft, and currently reports mergeable; it is explicitly a verification-only PR and must not be merged into production.

### Task 01 — UI/UX Design System
- Existing implementation found in PR #50, branch `work/uiux-01-design`, head SHA `c27bd79b85c08541ea3eca4d61184944783c0aa0`.
- PR #50 changes 8 files: shared CI workflow, design-system documentation, design primitives, table component, design tokens, stylesheet, dashboard quality tests, and design-system tests.
- Verified PR #50 workflow run `45720997262` on its head SHA: **success**. All 14 reported job steps completed successfully, including TypeScript, tests, production build, Chromium offline acceptance, clean local Supabase migrations, and pgTAP.
- The target integration branch does not contain the task-01 design artifacts (fetches of `src/lib/design-tokens.ts`, `src/components/ui/design-primitives.tsx`, and `tests/design-system.test.mjs` return 404).
- Safe integration is blocked: PR #50 is based on `work/ui-ux-1.0-complete`; comparison against the target integration branch reports **diverged**, with PR #50 head 15 commits ahead and target branch 53 commits ahead of the merge base. Replacing whole files would overwrite intervening integration changes, while no verified three-way resolution is available through the current file-level operation.
- The target branch's `package.json` exposes `build`, `typecheck`, and `test`; it does **not** define the requested `test:ui` script. Do not claim that command passed or silently substitute another command.
- Status: **not integrated; do not mark Task 01 complete on the target branch**. Preserve PR #50 and all source branches. Resume by performing a proper three-way merge of PR #50's 8-file change set onto the current integration head, preserving later integration edits, then run the available checks and add/implement a genuine UI test script only if justified by the repository's established test setup.

### Database safety
- Supabase project `elflszuqcznexrepblsz` is ACTIVE_HEALTHY.
- Development branch listing returned no branches. The required `copilot-dev` branch is therefore not present.
- No Supabase SQL, migrations, production data, or production `main` database branch were modified. Do not run DB operations until `copilot-dev` is confirmed to exist.

### Execution boundary
- Tasks 02–21 were not started because Task 01 is not safely integrated, and the prompt does not include the detailed specifications for tasks 03–20.
- No production merge, force-push, destructive operation, database mutation, or test weakening was performed.


## متابعة إصلاح Cloudflare Quick Tunnel — 26 نوفمبر 2026

- نُفذ إصلاح محدود في `vite.config.ts` على فرع `integration/ui-ux-1.0` للسماح بنطاقات Quick Tunnel فقط عبر `server.allowedHosts: [".trycloudflare.com"]` بدلاً من السماح العام بكل المضيفين.
- Commit: `4f1274a107bd16da35a4a6973adb0150468c117c`.
- فحص PR #72 بعد التعديل يؤكد أن رأسه يطابق هذا الالتزام. GitHub يعرض `mergeable=false` حالياً؛ لا دمج.
- فحص واجهة CI المتاحة لم يُظهر حتى الآن Workflow Run أو Status check مرتبطاً بهذا الالتزام؛ لذلك لا يُدّعى نجاح CI لهذا التعديل.
- لم تُجرَ أي تغييرات على قاعدة البيانات أو الأسرار أو `main`.
- مشكلة الصفحة البيضاء لم تُثبت أنها حُلّت بمجرد إصلاح Host allowlist؛ يلزم إعادة تشغيل Vite محلياً بعد تعديل الإعداد، ثم فحص Console/Network وتأكيد متغيرات Supabase في بيئة التشغيل. ملف `.env.example` يحدد المتغيرين المطلوبين للمتصفح: `VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY`، لكن لا يمكن قراءة ملف `.env` المحلي عبر GitHub.

## تحقق CI بعد استكمال نظام التصميم — 26 نوفمبر 2026

- رأس فرع التكامل المختبر: `b3b1abc324620f85e61b38cbcf25defce91c88c0`.
- GitHub Actions CI Run #2558، Run ID `45886240067`: **SUCCESS**.
- Job `verify` ID `140137541095` اكتمل بنجاح.
- نجحت جميع الخطوات: تثبيت Bun والاعتماديات، Lint لوحدات الخادم، TypeScript، الاختبارات، Production Build، اختبار Chromium لقبول Offline Sync، إعداد Supabase CLI، تشغيل Supabase محلياً، تطبيق جميع migrations على قاعدة اختبار نظيفة، pgTAP، وإيقاف Supabase المحلي.
- هذا يثبت نجاح خط التحقق الآلي على SHA المذكور فقط؛ لا يثبت التشغيل على جهاز Android للمستخدم أو اختبار جميع الأدوار والصفحات ببيانات واقعية.
- PR #72 لا يزال مفتوحاً ومسودة وغير قابل للدمج حالياً (`mergeable=false`, `mergeable_state=dirty`). مقارنة `main...integration/ui-ux-1.0` تظهر 282 commit في جهة التكامل و7 commits في جهة `main` بعد نقطة الالتقاء؛ لم يُجرَ merge أو rebase أو force-push.
- لا توجد مراجعات PR مسجلة أو review threads حالياً.
- لم تُطبق أي Migration على Supabase الإنتاجي، ولم تتغير بيانات الإنتاج أو الأسرار، ولم يتم الدمج إلى `main`.
- الخطوة التالية: مراجعة التغييرات السبعة الموجودة في `main` ومقارنتها مع النسخ الموجودة في فرع التكامل قبل أي محاولة مصالحة، ثم متابعة فجوات المهام 08–20 الموثقة في تدقيق المهمة 21.

## استكمال المهمة 08 — المساحات الإعلانية والاستهداف بالفرع — 26 نوفمبر 2026

- نُقلت التغييرات الخاصة بإدارة المساحات الإعلانية والاستهداف بالفرع انتقائياً إلى فرع التكامل، دون دمج تاريخ `main` أو إعادة تأسيس الفرع.
- أضيفت الترحيلات `20261126190000_marketing_ad_spaces_and_branch_targeting.sql` و`20261126200000_scope_marketing_analytics_to_branch.sql` و`20261126210000_marketing_advertising_foreign_key_indexes.sql`، فأصبحت سلسلة الفرع تضم 118 ترحيلاً بعد ترحيل Offline Sync رقم 115.
- أضيف جدول `public.marketing_ad_spaces` بنطاق المؤسسة/الشركة/الفرع، وربط الحملات بالمساحة والفرع، والتحقق من تطابق نطاق الشركة والفرع عبر triggers، وسياسات RLS تقييدية، وتقييد تسجيل الأحداث والتحليلات بحسب الفرع.
- حُدّثت صفحة الإعلانات لإنشاء المساحات واختيار الفرع والمساحة للحملة، وعرض المساحات وإيقافها/تفعيلها بصلاحية قاعدة البيانات، مع بقاء الحملات القديمة مدعومة عبر placement.
- حُدّثت أنواع Supabase المولدة، وملف `supabase/COMPLETE_DATABASE.sql`، و`supabase/MIGRATION_MANIFEST.md`، واختبارات pgTAP واختبارات المصدر. كما أصبحت مفاتيح React Query لبيانات الإعلانات والمساحات تتضمن المستخدم والشركة والفرع لتجنب إعادة استخدام ذاكرة نطاق سابق.
- عُدّل اختبار صلاحيات الحملات ليشمل السياسات التقييدية الأربع للشركة والأربع للفرع؛ وحُدّثت اختبارات الصفحة لتطابق حمولة الفرع والمساحة ومفاتيح الذاكرة الجديدة.
- CI Run #2571، ID `45888936765` على SHA `319cb4c01389004b790ed0fbf0d8c4e406439737`: SUCCESS، بما في ذلك TypeScript والاختبارات والبناء وChromium وSupabase المحلي وتطبيق جميع migrations على قاعدة نظيفة وpgTAP.
- CI Run #2574، ID `45889500727` على SHA `a7861d1a40d1ba252381efe88852abdb1c544779`: SUCCESS، بعد إصلاح اختبار قديم كان يثبت queryKey قبل إضافة نطاق المستخدم والفرع.
- CI Run #2576، ID `45889919858` على SHA `bf8e7fd90860fe516c5582438bd58dca30201dfd`: SUCCESS. نجحت كل الخطوات، بما فيها TypeScript و304 اختبارات Node في دورة الاختبار السابقة، وProduction Build وChromium، وتطبيق 118 ترحيلاً على قاعدة Supabase محلية نظيفة وpgTAP، ثم التنظيف.
- حدود الإنجاز: لا تزال المساحات لا تدعم إعادة التسمية أو الحذف من الواجهة، ويلزم اختبار يدوي على Android/HTTPS والتحقق من ظهور الحملات لكل نطاق مستخدم. لذلك تبقى المهمة 08 جزئية ولا تُعلن مكتملة.
- PR #72 ما زال مفتوحاً ومسودة و`mergeable=false` / `dirty`. آخر مقارنة مع `main`: فرع التكامل متقدم بـ300 commit ومتأخر بـ9 commits. لا دمج أو rebase أو force-push.
- لم تُطبق أي Migration على Supabase الإنتاجي، ولم تتغير بيانات الإنتاج أو الأسرار، ولم يحدث دمج إلى `main`.

## المرحلة 15 — ضبط صلاحية تعديل المخزون — 26 نوفمبر 2026

- كشف فحص فرع `integration/task-15-permissions` أن migration `20261111000019_harden_definer_paths_and_inventory_branch_scope.sql` أعادت دالة `adjust_inventory_balance` إلى فحص دور `warehouse` أو مدير المؤسسة، متجاوزة `inventory.adjust` رغم أن ترحيلاً أسبق كان قد أضاف الفحص الدقيق.
- أُضيف ترحيل متابعة `20261126220000_inventory_adjustment_permission_and_branch_guard.sql`: يفرض `inventory.adjust` مع نطاق الفرع، يثبت `search_path`، ويحتفظ بقفل المنتج والتحديث الذري وسجل `inventory_transactions`.
- أُلغيت صلاحيات DML المباشر للمستخدمين الموثقين على `public.inventory` مع إبقاء SELECT وامتيازات `service_role`، وأزيلت سياسة الإدارة الواسعة؛ جميع تغييرات الرصيد تمر عبر RPC الذي يسجل الحركة.
- حُدثت صفحة المخزون لاستخدام `hasPermission("inventory.adjust")` بدلاً من استنتاج السماح من اسم الدور، مع إعادة التحقق قبل تنفيذ mutation.
- أضيف اختبار Node واختبار pgTAP للتحقق من الصلاحية، الفرع، سجل الحركة، وعدم منح DML المباشر.
- ملاحظة تدقيق PR #79: CI على SHA `861ded99c862bf2840cec13897b40dc0f1c7615a` نجح في TypeScript والاختبارات والبناء وتطبيق migrations، لكنه فشل في pgTAP. فشل RPC inventory حقيقي بسبب غياب فحص `inventory.adjust` و`private.can_access_branch` في النسخة المستبدلة؛ بعض اختبارات الحذف وسياسة قراءة المخزون كانت تتحقق من أسماء/أنواع سياسات قديمة أو لا تميز permissive عن restrictive. لم يُدمج PR #79.
- لم تُطبق أي تغييرات على Supabase الإنتاجي.

## تصحيح فشل pgTAP في المرحلة 15 — تغليف RPC المخزون — 26 نوفمبر 2026

- كشف CI Run #2583 على SHA `280348ac7f02628ef8bc992721114791d8c0cb7f` أن إضافة `adjust_inventory_balance` كدالة SECURITY DEFINER في المخطط العام خالفت اختبارات العزل التي تمنع الدوال العامة ذات الامتيازات من أن تكون قابلة للاستدعاء مباشرة.
- صُحح التصميم: التنفيذ الحساس أصبح `private.adjust_inventory_balance` كدالة SECURITY DEFINER مع صلاحية `inventory.adjust` ونطاق الفرع و`search_path` ثابت؛ أما `public.adjust_inventory_balance` فأصبح غلافاً SECURITY INVOKER فقط.
- حُدث pgTAP ليتحقق من أن الغلاف العام ليس SECURITY DEFINER، وأن التنفيذ الخاص فقط يحمل الامتيازات، وأن كلاهما يمنع anon، مع استمرار اختبار DML المباشر وسجل حركة المخزون.
- فشل Run #2583 كان في pgTAP فقط؛ TypeScript والاختبارات والبناء وChromium وتطبيق migrations نجحت. يلزم نجاح CI جديد قبل اعتماد الإصلاح.

## 2026-11-27 — حصر الفروع ومصالحة تغييرات main

- حُصر المستودع: 90 فرعاً و18 PR مفتوحاً وقت الفحص. تمت مقارنة جميع الفروع الـ89 الأخرى مع `integration/ui-ux-1.0`، وليس الاعتماد على أسماء الفروع وحدها.
- `main` يحتوي 9 commits غير موجودة في تاريخ التكامل، بينما التكامل يحتوي 308 commits بعد نقطة الالتقاء. فُحصت commits التسعة وملفاتها، وقورنت أشجار الملفات: كل مسارات `main` الـ377 موجودة في التكامل (لا توجد ملفات main مفقودة). نسخ التكامل أحدث/أكثر تقييداً في غالبية الملفات المتباينة، لذلك لا يُستبدل بها.
- التسعة: إضافة اختبار حذف مصروف ثم التراجع عنه (لا أثر نهائي)، اكتمال UI/UX 1.0، فهارس مفاتيح الإعلانات، commit فارغ لفحص صحة المصادقة، تدقيق Task 16، تعزيز اختبارات RLS، تحديث tracker، وسجل CI. وثيقة التدقيق واختبارات Task 16 وفهارس الإعلانات موجودة في التكامل بالفعل.
- فُحصت الفروق الحساسة: نسخة التكامل من POS تحتاج إضافة ترشيح branch_id ومفتاح cache يشمل الفرع؛ نُفذ ذلك الآن مع قصر جلسة الشركة/المؤسسة بلا فرع على الحملات العامة فقط. نسخة التكامل من المطبخ تحتفظ بمزامنة offline idempotent، واختبارات RLS فيها أقوى من نظيرتها في main. لم تُنقل بيانات الهوية الحساسة (national_id/IP/device/password metadata) إلى صفحة الملف الذاتي؛ اختبار الخصوصية الحالي يمنع كشفها هناك.
- لا حاجة إلى migration جديدة لتعديل POS؛ لم يتغير schema. لا تعديل لملف snapshot أو manifest في هذه الدفعة.
- فرع `reconcile/security-notifications-into-integration` متقدم 4 commits ولا يتأخر عن التكامل، لكنه يضيف 19 ملف SQL فارغاً (0 bytes، جميعها SHA `e69de29...`) وworkflow مؤقتاً بصلاحية `contents: write` يولّد ملفات ترحيل فارغة تلقائياً. رُفض دمجه؛ نجاح workflow لا يثبت صلاحية migrations.
- الفروع التي تاريخها مدمج/سلف للتكامل (ahead=0): `audit/prelaunch-security-and-release-hardening`, `docs/update-production-audit-after-merges`, `feature/enterprise-multicompany-identity-notifications`, `feature/prelaunch-hardening`, `fix/cash-session-company-scope`, `fix/customer-payment-idempotency-scope`, `fix/dashboard-auth-health-check`, `integration/task-18-offline-sync`, `reconcile/main-fixes-into-integration-v2`.
- فروع تحتاج مراجعة انتقائية ولا تُدمج كتلة واحدة: `integration/task-15-permissions` (121 commits ahead/50 behind و79 ملفاً؛ فشل pgTAP في نسخته السابقة)، فروع offline validation المتعددة، `fix/security-phase-1` (تاريخ قديم متباعد)، وفروع UI/UX 01–20. بعض إصلاحات هذه الفروع نُقلت انتقائياً بالفعل؛ انظر تقرير المصالحة.
- أحدث CI قبل هذه الدفعة: Run #2587 / `45893413771` على SHA `f492564d300eabc72a75302710e553ed2fd38646`: SUCCESS، بما في ذلك TypeScript والاختبارات والبناء وChromium وmigrations على قاعدة محلية نظيفة وpgTAP.
- لم يحدث merge إلى `main` أو تعديل على قاعدة الإنتاج.

### تصحيح اختبار عزل حملات POS — 27 نوفمبر 2026

- CI Run #2588 `45899977148` على commit المصالحة الأول فشل في اختبار Node الجديد فقط: أُضيف مفتاح cache بالفرع، لكن شرط ترشيح `branch_id` لم يُدرج بسبب عدم تطابق نص الاستبدال.
- أُضيف الآن شرط SQL client query صريح: الفرع النشط يرى حملاته والحملات العامة؛ وبدون فرع نشط تظهر الحملات العامة فقط. تم تبسيط assertion إلى `String.includes` لتجنب escaping غير صحيح في regex.
- لا تغييرات DB؛ ننتظر إعادة CI.

## 2026-11-27 — دمج حماية التقارير من فرع Task 11

- راجعت `work/uiux-11-reports` (40 commits ahead/99 behind؛ تغيير جوهري في `reports.tsx` فقط) ونقلت الملف انتقائياً بعد مراجعة استعلاماته.
- أصبحت صفحة التقارير تتحقق من `reports.view`، وتفصل الصلاحيات حسب المبيعات والمصروفات والصندوق والمشتريات والمخزون والموظفين والحضور والإعلانات والعروض.
- بيانات التكلفة وربحية الأصناف وقيمة المخزون لا تُقرأ إلا عند توفر صلاحية المبيعات والمصروفات معاً؛ بقية الوحدات لا تستعلم عن بيانات غير مسموحة.
- جميع استعلامات البيانات تقيد الشركة والفروع المسموح بها، وتعيد مجموعة فارغة عند عدم وجود فروع مسموحة بدلاً من توسيع الاستعلام.
- مفتاح cache يشمل المستخدم والشركة والفرع وبصمة الصلاحيات والفترة، وتصدير التقارير/تعديل الفلاتر يتطلبان صلاحياتهما المستقلة.
- أضيف `tests/reports-permission-scope.test.mjs`. لا migration مطلوبة؛ تغيير واجهة واستعلامات فقط.
- CI Run #2589 `45900519526` على SHA `92cc4ca73d9fe196429a35bf78fc915e06d09755` نجح بالكامل: TypeScript، tests، build، Chromium offline، migrations على قاعدة نظيفة، وpgTAP.
- التعديل الجديد ينتظر CI جديداً قبل اعتماده.

### تصحيح TypeScript في تقارير Task 11 — 27 نوفمبر 2026

- فشل CI Run #2590 `45900981731` في Typecheck فقط: callbacks الممررة إلى `fetchAllRows` أعادت مصفوفة فارغة مباشرة في مسارات عدم السماح، بينما العقد يتطلب PromiseLike بنتيجة `{data,error}`.
- تم تحويل جميع مسارات الإغلاق الآمن داخل callbacks إلى `Promise.resolve({ data: [], error: null })`؛ تبقى نتائج عدم وجود صلاحية فارغة ولا توسع نطاق الاستعلام.
- لا تغييرات DB؛ ينتظر إصلاح TypeScript CI جديداً.

### تصحيح نوع استعلام الشركات والفروع في تقارير Task 11 — 27 نوفمبر 2026

- CI Run #2591 `45901124683` اجتاز الخطأ السابق، ثم كشف Typecheck خطأً ثانياً: إرجاع `[]` في `companiesQuery` جعل نوع النتيجة اتحاداً لا يملك `.map` في عرض قائمة الشركات.
- أُضيف نوع صريح لمخرجات استعلامي الشركات والفروع `Array<{ id: string; name: string }>`، مع إبقاء الإرجاع الفارغ آمناً.
- لا تغييرات DB؛ ينتظر Typecheck جديداً.

### تصحيح أخير لنوع companiesQuery — 27 نوفمبر 2026

- Run #2592 كشف أن تحويل جميع حالات `return []` إلى Promise داخل صفحة التقارير أصاب أيضاً `companiesQuery` العادي، الذي يجب أن يعيد مصفوفة مباشرة؛ لذلك ظهر اتحاد نوع غير صالح.
- أُعيد `companiesQuery` إلى مصفوفة فارغة عادية، مع الإبقاء على Promise الفارغ حصراً داخل callbacks الخاصة بـ `fetchAllRows`.

## 2026-11-27 — دمج فحص صحة النظام ومركز الدعم

- نُقل مركز الدعم المحسن من `work/uiux-12-support-health` مع helper مستقل `support-health.mjs` وتعريفات TypeScript واختبارات.
- الفحوصات تشمل اتصال المضيف، الإنترنت، REST/قاعدة البيانات، Auth، الجلسة الحالية، وStorage؛ تنفذ بالتوازي مع مهلة إلغاء، وتحديث دوري كل 60 ثانية وحد أدنى 5 ثوانٍ بين المحاولات.
- تفاصيل HTTP التقنية تظهر فقط لـ Super Owner أو من يملك `settings.view`/`audit.view`; ملخص التشخيص المنسوخ لا يتضمن access/refresh tokens أو مفاتيح أو بيانات شخصية أو نصوص أخطاء خام.
- لا يستخدم المركز localStorage ولا يكتب إلى قاعدة البيانات. تم تكييف الاختبار ليتوافق مع رابط مركز الدعم في قائمة البحث العامة الحالية ورسالة التحذير الفعلية في الواجهة.
- CI Run #2593 `45901417219` على SHA `356433aa4aacf63a91ab61dabf88a6eebda5286e` نجح بعد إصلاح تقارير Task 11 بجميع مراحل TypeScript والاختبارات والبناء وChromium وmigrations النظيفة وpgTAP.
- إضافة مركز الدعم تنتظر CI جديداً.

## تحديث 27 نوفمبر — اكتمال فحص CI ومصالحة main
- رأس التكامل الحالي `a18a2da4436d4804a749b38abf567aca5cf27d24`; المقارنة مع main: 315 ahead و9 behind.
- CI Run #2594 (`45901884912`) على هذا الرأس نجح بالكامل، بما في ذلك TypeScript، اختبارات Node، build، Chromium offline sync، migrations على قاعدة Supabase نظيفة، وpgTAP.
- حُسم فحص PR #84: 59 ملفاً، 41 متطابقاً و18 مختلفاً؛ احتُفظ بالنسخ الأكثر اكتمالاً في التكامل، ولم تُنقل نسخة صفحة الملف الشخصي التي تكشف رقم الهوية الذاتية. لا دمج عشوائي.
- تصحيح للسجل السابق: مركز الدعم لم يعد ينتظر CI؛ تحقق Run #2594 ناجح.

### إصلاح assertion الخاص بمنع الكتابة المباشرة للمخزون — 27 نوفمبر 2026

- CI Run #2598 `45904253297` على SHA `f63eb729e6e99f29d47e316e36457910cb6d75b6` فشل في اختبار Node واحد فقط: regex في `tests/inventory-balance-rpc-only.test.mjs` كان يبحث عن backslash حرفي قبل النقطة في اسم الجدول، بينما SQL صحيح ويحتوي `public.inventory`.
- صُحح regex ليطابق النقطة الحرفية في اسم الجدول. لم يتغير SQL أو الصلاحيات أو سلوك النظام.
- ينتظر هذا التصحيح تشغيل CI كامل على SHA جديد؛ لا يعتبر الإصلاح ناجحاً حتى ينجح.

## 27 نوفمبر 2026 — إغلاق فشل Task 16 pgTAP

- Run #2599 على SHA `5c39eb8` كشف assertion يحصي 11 سياسة restrictive بدلاً من الثماني سياسات company/branch المقصودة. تضييق الاستعلام إلى أسماء السياسات الثماني حل هذا الالتباس.
- أثناء التصحيح كُشفت إزالة غير مقصودة لخمس assertions أخرى في اختبار Task 16؛ أُعيدت جميعها، وأصبح `SELECT plan(14)` يطابق 14 اختباراً فعلياً. لم يتم إسقاط اختبارات payroll/profile/promotions أو إضعافها.
- CI Run #2602 `45905522571` على SHA `7f34bc247c9be72cfffe607c80baa8c9945804c6`: **SUCCESS** في TypeScript وNode tests وProduction build وChromium offline sync وبدء Supabase المحلي وتطبيق جميع migrations على قاعدة نظيفة وpgTAP والتنظيف.
- تمت مقارنة PR #84: 59 ملفاً، 26 متطابقاً و33 مختلفاً، ولا يوجد مسار main مفقود. ملفات التكامل المختلفة أكثر اكتمالاً/أماناً في المسارات الحساسة. PR #86 هو إصلاح استهداف إعلانات Dashboard بالفرع، وليس مصالحة main.
- تمت مراجعة PR #79؛ لا يُدمج بالجملة لأن migrations القديمة 250400/250500 مكررة داخل private wrappers الحالية، وترحيل inventory القديم مستبدل بترحيل 2622 الأحدث. التحديثات الدقيقة للصفحات موجودة في التكامل.
- تم حصر 90 فرعاً: 80 تحمل commits خارج تاريخ التكامل، 79 منها تختلف ملفاتها؛ 9 خلف التكامل بلا commits فريدة، وفرع التكامل مطابق.
- 128 migration و128 manifest entry و128 snapshot marker متطابقة في الأسماء. أضيف اختبار Node للتحقق من أسماء ومحتوى كل migration في snapshot.
- لا تغيير في Supabase الإنتاجي. الخطوة التالية: merge ancestry لـ main إلى integration مع الحفاظ على شجرة التكامل، ثم CI جديد على SHA الناتج.

## تصحيح اختبار تطابق Snapshot — 27 نوفمبر 2026

- CI Run #2603 `45906176966` على SHA `1b7f4f9fee361b3131ad8deee5f0b8f503a69775` نجح في TypeScript، لكنه كشف اختلافاً نصياً في migration `20261111000011`.
- الفحص أظهر أن SQL التنفيذي متطابق، بينما تختلف التعليقات التوضيحية وعناوين الترحيل بين المصدر و`COMPLETE_DATABASE.sql`. لذلك لا ينبغي مقارنة النص الخام حرفياً.
- عُدّل اختبار المزامنة ليطابق أسماء الملفات والـ markers، ثم يقارن SQL التنفيذي بعد إزالة أسطر التعليقات وتوحيد المسافات فقط. لا يتم تجاهل أي عبارة SQL أو ترتيبها.
- ينتظر التصحيح CI جديداً على SHA جديد؛ لم تتغير migrations أو سياسات قاعدة البيانات في هذا الإصلاح.

### تطبيع اختبار Snapshot التنفيذي — 27 نوفمبر 2026

- Run #2606 على SHA `518ccedbdb4bda055ded465c01c0e16ff578a91e` كشف اختلاف whitespace حول الأقواس داخل جسم دالة PL/pgSQL في migration `20261111000012`، وليس اختلافاً في منطق SQL.
- جرى تقوية normalizer ليزيل التعليقات ويطبع المسافات خارج السلاسل النصية والمعرّفات فقط، مع الحفاظ على محتوى النصوص المقتبسة وترتيب العبارات. بذلك يختبر التطابق التنفيذي دون فرض تطابق التنسيق.
- ينتظر هذا التعديل CI جديداً؛ لم يتم تعديل migration أو snapshot أو RLS في هذه الخطوة.
