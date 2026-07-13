# إصدار 1.1 — تحسينات إنتاجية بدون كسر توافقي

سأنفّذ 7 مهام على 3 دفعات، مع الحفاظ الكامل على الميزات وقاعدة البيانات الحالية (إضافة فقط، بدون حذف أو إعادة تسمية).

---

## المهمة 1 — تحسين شاشة الكاشير (تصميم فقط)

الملف: `src/routes/_authenticated/pos.tsx`

- تصغير الأبعاد: البطاقات، الخطوط، والحشو، وإبقاء الأزرار مناسبة للمس (min 40px).
- إعادة توزيع الأعمدة بشبكة CSS Grid مع قيم مرنة:
  - الأقسام: `w-20 lg:w-24` عمود أيقونات مضغوط.
  - المنتجات: شبكة `grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6` ببطاقات صغيرة.
  - الفاتورة: عمود ثابت `w-[320px] xl:w-[360px]` مع جدول مضغوط.
- استخدام `h-[calc(100vh-3rem)]` مع `overflow-hidden` على المستوى العام و`overflow-auto` داخل كل قسم فقط، لتفادي التمرير الكلي.
- الحفاظ الكامل على منطق العربة، الخصومات، الدفع، الطباعة، والمسودات (لا تغيير لأي state أو mutation).

## المهمة 2 — استقرار وحدة التقارير

الملف: `src/routes/_authenticated/reports.tsx`

- تشخيص التجميد: قد يكون بسبب جلب كميات كبيرة (sales/sale_items بدون تحديد فترة أو limit) أو حسابات مزامنة ثقيلة في الرندر.
- الإصلاح:
  - إضافة نطاق تاريخ افتراضي (آخر 30 يوم) قبل أي استعلام.
  - `useMemo` لجميع الحسابات المشتقة.
  - تقسيم الاستعلامات لكل بطاقة/رسم مستقل مع `staleTime` مناسب.
  - Lazy load للرسوم البيانية الثقيلة عبر `React.lazy` + `Suspense`.
  - إضافة حد أعلى (`.limit()`) للاستعلامات الأولية مع فلترة بالفرع والتاريخ.
- لا تغيير في الـ schema.

## المهمة 3 — أنواع حالة الحضور (migration توسعية)

- إضافة قيم جديدة لعمود `attendance.status` (نصي حالياً، لن يكسر البيانات القديمة):
  present, late, early_leave, absent, absent_excused, absent_unexcused, weekly_holiday, annual_leave, sick_leave, official_holiday, mission, training, suspended, overtime.
- إضافة أعمدة nullable للتحضير المستقبلي:
  - `attendance.source TEXT DEFAULT 'manual'` (manual/biometric/kiosk/api)
  - `attendance.device_id TEXT NULL`
  - `attendance.biometric_ref TEXT NULL`
- طبقة تجريد `src/lib/attendance-devices.ts` (interface فقط، بدون تنفيذ فعلي) لتحضير التكامل البصمي والطباعة لاحقاً.
- تحديث UI: `hr.attendance.tsx` لدعم كل الأنواع بألوان دلالية.

## المهمة 4 — محرك الرواتب المؤسسي (توسعي)

- migration:
  - `employees`: إضافة أعمدة nullable: `salary_type` (monthly/daily/hourly, default 'monthly')، `daily_salary`، `hourly_salary`، `working_hours_per_day` (default 8)، `work_schedule` JSONB nullable، `working_days_per_month` (default 26).
  - `payroll_items`: إضافة أعمدة nullable: `working_hours`، `attendance_days`، `overtime_hours`، `overtime_amount`، `incentives_total`، `absence_deduction`، `late_deduction`، `holidays_count`، `leave_days`.
  - `payroll_runs`: إضافة `rejection_reason TEXT NULL` وتوسيع status ليقبل `rejected`.
- تحديث `hr.functions.ts`:
  - `runMonthlyPayroll`: احتساب Daily = Monthly / working_days_per_month، Hourly = Daily / working_hours_per_day، حساب الحسميات على الأساسي (Base) وليس الإجمالي.
  - إضافة `rejectPayroll(id, reason)` — يعيد الحالة إلى draft ويسمح بإعادة الاحتساب.
- UI في `hr.payroll.tsx`: أزرار موافقة/رفض + عرض تفصيلي.

## المهمة 5 — تسجيل الموظف

- `hr.employees.tsx`: إضافة الحقول الجديدة (نوع الراتب، ساعات العمل اليومية، جدول العمل، تاريخ التوظيف موجود بالفعل).
- حساب تلقائي للراتب اليومي والساعي (عرض live).

## المهمة 6 — سلامة التطوير

- كل الأعمدة الجديدة NULLABLE أو ذات قيم افتراضية آمنة.
- لا حذف/إعادة تسمية.
- سياسات RLS الحالية تبقى كما هي؛ لا تغيير في الأدوار.

## المهمة 7 — التحقق النهائي

- تشغيل `tsgo` + build.
- فحص الأخطاء في console الجديد.
- التأكد من عمل كل الصفحات (سريع بـ Playwright على المسارات الرئيسية).
- تقرير بجميع الملفات المعدلة.

---

## الملفات المتوقع تعديلها

- **migration جديدة**: توسعة `attendance`, `employees`, `payroll_items`, `payroll_runs`.
- `src/routes/_authenticated/pos.tsx` — تكثيف التخطيط.
- `src/routes/_authenticated/reports.tsx` — استقرار + lazy.
- `src/routes/_authenticated/hr.attendance.tsx` — أنواع الحضور.
- `src/routes/_authenticated/hr.employees.tsx` — حقول جديدة.
- `src/routes/_authenticated/hr.payroll.tsx` — رفض/إعادة احتساب.
- `src/lib/hr.functions.ts` — محرك الرواتب الموسّع + rejectPayroll.
- `src/lib/attendance-devices.ts` (جديد) — واجهة تجريد.

هل أبدأ التنفيذ؟
