
-- Release 1.2 — Enterprise User Management (additive, backward compatible)

-- 1) account_status enum
DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM ('active','suspended','frozen','pending_approval','password_expired','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extend profiles (all nullable / safe defaults)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_no TEXT,
  ADD COLUMN IF NOT EXISTS national_id TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS department_id UUID,
  ADD COLUMN IF NOT EXISTS company_id UUID,
  ADD COLUMN IF NOT EXISTS employment_date DATE,
  ADD COLUMN IF NOT EXISTS status public.account_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_ip TEXT,
  ADD COLUMN IF NOT EXISTS last_device TEXT,
  ADD COLUMN IF NOT EXISTS last_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- 3) Extend branches
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- 4) Extend user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS department_id UUID,
  ADD COLUMN IF NOT EXISTS company_id UUID;

-- 5) Tenants — password policy
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS password_max_age_days INTEGER,
  ADD COLUMN IF NOT EXISTS require_owner_approval BOOLEAN NOT NULL DEFAULT true;

-- 6) Companies (architecture only)
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  legal_name TEXT,
  tax_number TEXT,
  logo_url TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "companies_tenant_read" ON public.companies;
CREATE POLICY "companies_tenant_read" ON public.companies FOR SELECT TO authenticated
  USING (public.is_super_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = companies.tenant_id));
DROP POLICY IF EXISTS "companies_admin_write" ON public.companies;
CREATE POLICY "companies_admin_write" ON public.companies FOR ALL TO authenticated
  USING (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']))
  WITH CHECK (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']));

-- 7) Departments
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  photo_url TEXT,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "departments_tenant_read" ON public.departments;
CREATE POLICY "departments_tenant_read" ON public.departments FOR SELECT TO authenticated
  USING (public.is_super_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = departments.tenant_id));
DROP POLICY IF EXISTS "departments_admin_write" ON public.departments;
CREATE POLICY "departments_admin_write" ON public.departments FOR ALL TO authenticated
  USING (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']))
  WITH CHECK (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']));

-- 8) Job titles
CREATE TABLE IF NOT EXISTS public.job_titles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_titles TO authenticated;
GRANT ALL ON public.job_titles TO service_role;
ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_titles_tenant_read" ON public.job_titles;
CREATE POLICY "job_titles_tenant_read" ON public.job_titles FOR SELECT TO authenticated
  USING (public.is_super_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = job_titles.tenant_id));
DROP POLICY IF EXISTS "job_titles_admin_write" ON public.job_titles;
CREATE POLICY "job_titles_admin_write" ON public.job_titles FOR ALL TO authenticated
  USING (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']))
  WITH CHECK (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']));

-- 9) Employment types
CREATE TABLE IF NOT EXISTS public.employment_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employment_types TO authenticated;
GRANT ALL ON public.employment_types TO service_role;
ALTER TABLE public.employment_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employment_types_tenant_read" ON public.employment_types;
CREATE POLICY "employment_types_tenant_read" ON public.employment_types FOR SELECT TO authenticated
  USING (public.is_super_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = employment_types.tenant_id));
DROP POLICY IF EXISTS "employment_types_admin_write" ON public.employment_types;
CREATE POLICY "employment_types_admin_write" ON public.employment_types FOR ALL TO authenticated
  USING (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']))
  WITH CHECK (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']));

-- 10) Login history
CREATE TABLE IF NOT EXISTS public.login_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  event TEXT NOT NULL DEFAULT 'login',
  login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logout_at TIMESTAMPTZ,
  ip TEXT,
  user_agent TEXT,
  browser TEXT,
  os TEXT,
  device TEXT,
  session_duration_seconds INTEGER
);
GRANT SELECT, INSERT, UPDATE ON public.login_history TO authenticated;
GRANT ALL ON public.login_history TO service_role;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_login_history_user ON public.login_history(user_id, login_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_tenant ON public.login_history(tenant_id, login_at DESC);
DROP POLICY IF EXISTS "login_history_self_read" ON public.login_history;
CREATE POLICY "login_history_self_read" ON public.login_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id
    OR public.is_super_owner(auth.uid())
    OR (tenant_id IS NOT NULL AND public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])));
DROP POLICY IF EXISTS "login_history_self_write" ON public.login_history;
CREATE POLICY "login_history_self_write" ON public.login_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "login_history_self_update" ON public.login_history;
CREATE POLICY "login_history_self_update" ON public.login_history FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 11) Notifications architecture
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  audience_type TEXT NOT NULL CHECK (audience_type IN ('owner','manager','branch','department','user','all')),
  audience_id UUID,
  kind TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','urgent','critical')),
  title TEXT NOT NULL,
  body TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON public.notifications(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_audience ON public.notifications(audience_type, audience_id);
DROP POLICY IF EXISTS "notifications_read" ON public.notifications;
CREATE POLICY "notifications_read" ON public.notifications FOR SELECT TO authenticated
  USING (public.is_super_owner(auth.uid())
    OR (tenant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = notifications.tenant_id)));
DROP POLICY IF EXISTS "notifications_admin_write" ON public.notifications;
CREATE POLICY "notifications_admin_write" ON public.notifications FOR ALL TO authenticated
  USING (public.is_super_owner(auth.uid()) OR (tenant_id IS NOT NULL AND public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])))
  WITH CHECK (public.is_super_owner(auth.uid()) OR (tenant_id IS NOT NULL AND public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])));

-- 12) Custom roles — copied_from
ALTER TABLE public.custom_roles
  ADD COLUMN IF NOT EXISTS copied_from_builtin public.app_role,
  ADD COLUMN IF NOT EXISTS copied_from_custom UUID REFERENCES public.custom_roles(id) ON DELETE SET NULL;

-- 13) Immutable audit_logs — revoke delete
REVOKE DELETE ON public.audit_logs FROM PUBLIC;
REVOKE DELETE ON public.audit_logs FROM authenticated;
REVOKE DELETE ON public.audit_logs FROM anon;
DROP POLICY IF EXISTS "audit_logs_no_delete" ON public.audit_logs;
CREATE POLICY "audit_logs_no_delete" ON public.audit_logs FOR DELETE TO authenticated USING (false);

-- 14) Permission catalog seed (idempotent — ~150 keys)
INSERT INTO public.permissions (key, label_ar, label_en, category, description) VALUES
  -- dashboard
  ('dashboard.view','عرض لوحة التحكم','View Dashboard','dashboard',NULL),
  -- pos / sales
  ('pos.view','عرض نقطة البيع','View POS','sales',NULL),
  ('pos.create_sale','إنشاء بيع','Create sale','sales',NULL),
  ('pos.refund','استرجاع','Refund','sales',NULL),
  ('pos.hold','تعليق فاتورة','Hold ticket','sales',NULL),
  ('sales.view','عرض المبيعات','View sales','sales',NULL),
  ('sales.export','تصدير المبيعات','Export sales','sales',NULL),
  ('sales.print','طباعة الفاتورة','Print invoice','sales',NULL),
  ('sales.delete','حذف بيع','Delete sale','sales',NULL),
  ('sales.approve','اعتماد بيع','Approve sale','sales',NULL),
  ('sales.reject','رفض بيع','Reject sale','sales',NULL),
  -- cash sessions
  ('cash.view','عرض جلسات الصندوق','View cash sessions','sales',NULL),
  ('cash.open','فتح صندوق','Open cash session','sales',NULL),
  ('cash.close','إغلاق صندوق','Close cash session','sales',NULL),
  -- products / catalog
  ('products.view','عرض المنتجات','View products','catalog',NULL),
  ('products.create','إضافة منتج','Create product','catalog',NULL),
  ('products.edit','تعديل منتج','Edit product','catalog',NULL),
  ('products.delete','حذف منتج','Delete product','catalog',NULL),
  ('products.import','استيراد منتجات','Import products','catalog',NULL),
  ('products.export','تصدير منتجات','Export products','catalog',NULL),
  ('categories.view','عرض الأقسام','View categories','catalog',NULL),
  ('categories.manage','إدارة الأقسام','Manage categories','catalog',NULL),
  -- inventory
  ('inventory.view','عرض المخزون','View inventory','inventory',NULL),
  ('inventory.adjust','تعديل المخزون','Adjust inventory','inventory',NULL),
  ('inventory.transfer','نقل المخزون','Transfer inventory','inventory',NULL),
  ('inventory.movements.view','عرض حركات المخزون','View inventory movements','inventory',NULL),
  ('inventory.export','تصدير المخزون','Export inventory','inventory',NULL),
  -- purchases
  ('purchases.view','عرض المشتريات','View purchases','inventory',NULL),
  ('purchases.create','إنشاء أمر شراء','Create purchase','inventory',NULL),
  ('purchases.edit','تعديل مشتريات','Edit purchase','inventory',NULL),
  ('purchases.approve','اعتماد مشتريات','Approve purchase','inventory',NULL),
  ('purchases.delete','حذف مشتريات','Delete purchase','inventory',NULL),
  ('suppliers.view','عرض الموردين','View suppliers','inventory',NULL),
  ('suppliers.manage','إدارة الموردين','Manage suppliers','inventory',NULL),
  -- crm
  ('customers.view','عرض العملاء','View customers','crm',NULL),
  ('customers.manage','إدارة العملاء','Manage customers','crm',NULL),
  ('customers.export','تصدير العملاء','Export customers','crm',NULL),
  -- finance
  ('expenses.view','عرض المصاريف','View expenses','finance',NULL),
  ('expenses.manage','إدارة المصاريف','Manage expenses','finance',NULL),
  ('expenses.approve','اعتماد مصروف','Approve expense','finance',NULL),
  ('expense_categories.manage','إدارة أقسام المصاريف','Manage expense categories','finance',NULL),
  -- reports
  ('reports.view','عرض التقارير','View reports','reports',NULL),
  ('reports.export','تصدير التقارير','Export reports','reports',NULL),
  ('reports.filter','تصفية التقارير','Filter reports','reports',NULL),
  -- branches
  ('branches.view','عرض الفروع','View branches','branches',NULL),
  ('branches.create','إضافة فرع','Create branch','branches',NULL),
  ('branches.edit','تعديل فرع','Edit branch','branches',NULL),
  ('branches.delete','حذف فرع','Delete branch','branches',NULL),
  ('branches.manage','إدارة الفروع','Manage branches','branches',NULL),
  -- users
  ('users.view','عرض المستخدمين','View users','users',NULL),
  ('users.create','إضافة مستخدم','Create user','users',NULL),
  ('users.edit','تعديل مستخدم','Edit user','users',NULL),
  ('users.delete','حذف مستخدم','Delete user','users',NULL),
  ('users.suspend','تعليق مستخدم','Suspend user','users',NULL),
  ('users.freeze','تجميد مستخدم','Freeze user','users',NULL),
  ('users.archive','أرشفة مستخدم','Archive user','users',NULL),
  ('users.approve','اعتماد مستخدم','Approve user','users',NULL),
  ('users.reset_password','إعادة تعيين كلمة السر','Reset password','users',NULL),
  ('users.change_role','تغيير الدور','Change role','users',NULL),
  ('users.change_branch','تغيير الفرع','Change branch','users',NULL),
  ('users.change_department','تغيير القسم','Change department','users',NULL),
  ('users.change_company','تغيير الشركة','Change company','users',NULL),
  ('users.force_password_reset','إجبار تغيير كلمة السر','Force password reset','users',NULL),
  ('users.export','تصدير المستخدمين','Export users','users',NULL),
  -- roles / permissions
  ('roles.view','عرض الأدوار','View roles','system',NULL),
  ('roles.manage','إدارة الأدوار','Manage roles','system',NULL),
  ('permissions.view','عرض الصلاحيات','View permissions','system',NULL),
  ('permissions.manage','إدارة الصلاحيات','Manage permissions','system',NULL),
  -- companies / departments / job titles / employment types
  ('companies.view','عرض الشركات','View companies','system',NULL),
  ('companies.manage','إدارة الشركات','Manage companies','system',NULL),
  ('departments.view','عرض الأقسام الإدارية','View departments','system',NULL),
  ('departments.manage','إدارة الأقسام الإدارية','Manage departments','system',NULL),
  ('job_titles.view','عرض المسميات الوظيفية','View job titles','system',NULL),
  ('job_titles.manage','إدارة المسميات الوظيفية','Manage job titles','system',NULL),
  ('employment_types.view','عرض أنواع التوظيف','View employment types','system',NULL),
  ('employment_types.manage','إدارة أنواع التوظيف','Manage employment types','system',NULL),
  -- system / audit
  ('audit.view','عرض سجل التدقيق','View audit logs','system',NULL),
  ('audit.export','تصدير سجل التدقيق','Export audit logs','system',NULL),
  ('login_history.view','عرض سجل الدخول','View login history','system',NULL),
  ('settings.view','عرض الإعدادات','View settings','system',NULL),
  ('settings.manage','إدارة الإعدادات','Manage settings','system',NULL),
  ('owner_center.access','الوصول لمركز تحكم المالك','Access Owner Center','system',NULL),
  -- HR
  ('hr.employees.view','عرض الموظفين','View employees','operations',NULL),
  ('hr.employees.manage','إدارة الموظفين','Manage employees','operations',NULL),
  ('hr.attendance.view','عرض الحضور','View attendance','operations',NULL),
  ('hr.attendance.manage','إدارة الحضور','Manage attendance','operations',NULL),
  ('hr.leaves.view','عرض الإجازات','View leaves','operations',NULL),
  ('hr.leaves.approve','اعتماد إجازات','Approve leaves','operations',NULL),
  ('hr.leaves.reject','رفض إجازات','Reject leaves','operations',NULL),
  ('hr.payroll.view','عرض الرواتب','View payroll','operations',NULL),
  ('hr.payroll.manage','إدارة الرواتب','Manage payroll','operations',NULL),
  ('hr.compensation.view','عرض التعويضات','View compensation','operations',NULL),
  ('hr.compensation.manage','إدارة التعويضات','Manage compensation','operations',NULL),
  -- notifications
  ('notifications.view','عرض الإشعارات','View notifications','system',NULL),
  ('notifications.manage','إدارة الإشعارات','Manage notifications','system',NULL)
ON CONFLICT (key) DO NOTHING;

-- 15) Default builtin role permissions — owner gets all, others get sensible subset
-- Owner: all
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'owner'::public.app_role, key FROM public.permissions
ON CONFLICT DO NOTHING;

-- Manager: everything except owner_center + user destructive
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'manager'::public.app_role, key FROM public.permissions
WHERE key NOT IN ('owner_center.access','users.delete','users.archive','users.change_company','companies.manage','roles.manage','permissions.manage')
ON CONFLICT DO NOTHING;

-- Cashier: POS, view products, view customers
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'cashier'::public.app_role, k FROM (VALUES
  ('dashboard.view'),('pos.view'),('pos.create_sale'),('pos.hold'),('sales.print'),
  ('sales.view'),('products.view'),('customers.view'),('cash.view'),('cash.open'),('cash.close')
) AS t(k)
ON CONFLICT DO NOTHING;

-- Accountant
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'accountant'::public.app_role, k FROM (VALUES
  ('dashboard.view'),('sales.view'),('sales.export'),('reports.view'),('reports.export'),('reports.filter'),
  ('expenses.view'),('expenses.manage'),('expenses.approve'),('expense_categories.manage'),
  ('purchases.view'),('customers.view'),('audit.view'),('hr.payroll.view')
) AS t(k)
ON CONFLICT DO NOTHING;

-- Warehouse
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'warehouse'::public.app_role, k FROM (VALUES
  ('dashboard.view'),('inventory.view'),('inventory.adjust'),('inventory.transfer'),('inventory.movements.view'),('inventory.export'),
  ('products.view'),('purchases.view'),('purchases.create'),('purchases.edit'),('suppliers.view'),('suppliers.manage')
) AS t(k)
ON CONFLICT DO NOTHING;

-- Waiter
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'waiter'::public.app_role, k FROM (VALUES
  ('dashboard.view'),('pos.view'),('pos.create_sale'),('pos.hold'),('products.view'),('customers.view')
) AS t(k)
ON CONFLICT DO NOTHING;

-- Kitchen
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'kitchen'::public.app_role, k FROM (VALUES
  ('dashboard.view'),('pos.view'),('products.view')
) AS t(k)
ON CONFLICT DO NOTHING;

-- 16) Seed a Default company per existing tenant (idempotent)
INSERT INTO public.companies (tenant_id, name, is_active)
SELECT t.id, t.name, true FROM public.tenants t
WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.tenant_id = t.id)
ON CONFLICT DO NOTHING;

-- 17) Backfill profiles.email from auth.users (safe, one-time)
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

-- 18) Backfill profiles.status from is_active
UPDATE public.profiles
SET status = CASE WHEN is_active THEN 'active'::public.account_status ELSE 'suspended'::public.account_status END
WHERE status IS NULL;

-- 19) updated_at trigger for new tables
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_departments_updated BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_job_titles_updated BEFORE UPDATE ON public.job_titles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_employment_types_updated BEFORE UPDATE ON public.employment_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 20) Clone role permissions helper
CREATE OR REPLACE FUNCTION public.clone_role_permissions(
  _tenant_id UUID,
  _dst_custom_role_id UUID,
  _src_builtin public.app_role DEFAULT NULL,
  _src_custom_role_id UUID DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  IF _src_builtin IS NOT NULL THEN
    INSERT INTO public.role_permissions (tenant_id, role_kind, custom_role_id, permission_key)
    SELECT _tenant_id, 'custom', _dst_custom_role_id, permission_key
    FROM public.role_permissions
    WHERE role_kind = 'builtin' AND builtin_role = _src_builtin AND (tenant_id IS NULL OR tenant_id = _tenant_id)
    ON CONFLICT DO NOTHING;
  ELSIF _src_custom_role_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (tenant_id, role_kind, custom_role_id, permission_key)
    SELECT _tenant_id, 'custom', _dst_custom_role_id, permission_key
    FROM public.role_permissions
    WHERE role_kind = 'custom' AND custom_role_id = _src_custom_role_id
    ON CONFLICT DO NOTHING;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- 21) Audit trigger extensions for critical tables
DO $$ BEGIN
  CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_audit_user_permission_overrides AFTER INSERT OR UPDATE OR DELETE ON public.user_permission_overrides
    FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_audit_custom_roles AFTER INSERT OR UPDATE OR DELETE ON public.custom_roles
    FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
