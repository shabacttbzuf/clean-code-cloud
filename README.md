# Restaurant Accounting System — نظام محاسبة المطاعم

نظام محاسبي متكامل متعدد المستأجرين (Multi-tenant SaaS) لإدارة المطاعم والفروع والمنتجات والموظفين، مبنيّ على **TanStack Start + React 19 + Tailwind v4 + shadcn/ui + Lovable Cloud** (PostgreSQL + Auth + Storage + RLS).

## ✅ المرحلة 1 — الأساس المكتمل

- 🔐 **مصادقة** بالبريد وكلمة السر (تشفير bcrypt، فحص HIBP للكلمات المسربة).
- 🏢 **متعدد المطاعم** (Multi-tenant) مع عزل كامل عبر RLS.
- 👥 **6 أدوار** (مالك، مدير، محاسب، كاشير، مخزن، نادل) في جدول منفصل.
- 🌿 **إدارة الفروع** (اسم، عنوان، هاتف، رقم ضريبي، عملة).
- 🏷️ **الأقسام** (مشروبات، وجبات، حلويات، إضافات — تُنشأ افتراضياً).
- 📦 **المنتجات** مع رفع صور، أسعار تكلفة/بيع، وحدات، وحدود مخزون.
- 🌗 **الوضع الليلي** + واجهة عربية RTL كاملة (خط Cairo).
- 📱 **متجاوب** للجوال والكمبيوتر.

## 🗺️ المراحل القادمة

- **المرحلة 2:** POS، المبيعات، جلسات الصندوق، فواتير PDF.
- **المرحلة 3:** المخزون، الموردون، المشتريات، التنبيهات.
- **المرحلة 4:** المصروفات، التقارير، Dashboard تحليلي مع رسوم.

## 🏗️ البنية التقنية

| الطبقة | التقنية |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind v4, shadcn/ui |
| Routing | TanStack Router (file-based) |
| Data fetching | TanStack Query |
| Runtime | TanStack Start على Cloudflare Workers |
| Backend | Lovable Cloud (PostgreSQL + Auth + Storage) |
| Server code | TanStack Server Functions (بدل Node/Express) |
| ORM | Supabase-js + Postgres RLS (بدل Prisma) |

> **ملاحظة:** الطلب الأصلي ذكر Node/Express + Prisma، لكن Lovable يعمل على TanStack Start فوق Cloudflare Workers. النتيجة الوظيفية والأمنية مكافئة تماماً، مع تكامل GitHub الثنائي.

## 📁 هيكل المشروع

```
src/
├── routes/
│   ├── __root.tsx              # الجذر + الثيم + Query + Auth listener
│   ├── index.tsx               # الصفحة الرئيسية العامة
│   ├── auth.tsx                # تسجيل الدخول / إنشاء حساب
│   ├── onboarding.tsx          # إنشاء المطعم الأول
│   └── _authenticated/         # كل الصفحات المحمية
│       ├── route.tsx           # Layout + Sidebar + Auth gate
│       ├── dashboard.tsx
│       ├── branches.tsx
│       ├── categories.tsx
│       ├── products.tsx
│       ├── users.tsx
│       └── settings.tsx
├── hooks/
│   ├── use-auth-session.ts     # جلسة Supabase الحية
│   └── use-active-tenant.ts    # المطعم الحالي + الدور
├── components/
│   ├── app-sidebar.tsx
│   ├── page-header.tsx
│   └── ui/                     # shadcn/ui
├── lib/
│   ├── theme.tsx               # ThemeProvider
│   └── fonts.ts
├── integrations/supabase/      # (مُولَّد — لا يُعدَّل يدوياً)
└── styles.css                  # design tokens
```

## 🗃️ قاعدة البيانات

الجداول:

- `tenants` — المطاعم
- `profiles` — الملف الشخصي (مرتبط بـ auth.users)
- `user_roles` — الأدوار (منفصل عن profiles للأمان)
- `branches` — الفروع
- `categories` — الأقسام
- `products` — المنتجات

كل الجداول عليها **RLS مُفعّل** + سياسات تعزل بيانات كل مطعم.

## 🚀 التشغيل

المشروع يعمل مباشرة داخل بيئة Lovable. عند فتح المشروع:

1. Preview URL يعمل تلقائياً — لا حاجة لتشغيل `npm run dev` يدوياً.
2. قاعدة البيانات مُدارة من Lovable Cloud — لا حاجة لتنصيب PostgreSQL.
3. المتغيرات البيئية تُحقن تلقائياً في وقت التشغيل.

**للتشغيل محلياً بعد الرفع لـ GitHub:**

```bash
bun install
bun run dev
```

## 🔒 الأمان

- ✅ كلمات السر مُشفّرة (bcrypt) + فحص HIBP.
- ✅ RLS على كل الجداول — عزل كامل بين المطاعم.
- ✅ الأدوار في جدول منفصل — يمنع Privilege Escalation.
- ✅ Storage مُقيّد بمجلد المطعم عبر سياسات storage.objects.
- ✅ التحقق من المدخلات كل مرة عبر Zod.
- ✅ حماية CSRF ذاتية عبر Supabase Auth.

## 📤 الرفع إلى GitHub

في Lovable: افتح **+ (بجانب Chat) → GitHub → Connect project** — يتم إنشاء مستودع جديد ومزامنته تلقائياً في الاتجاهين.

## 📜 الترخيص

Copyright © 2026 — كل الحقوق محفوظة.
