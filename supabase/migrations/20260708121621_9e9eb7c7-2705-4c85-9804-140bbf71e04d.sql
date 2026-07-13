
-- 1. Super Owners table
CREATE TABLE IF NOT EXISTS public.super_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text
);
GRANT SELECT ON public.super_owners TO authenticated;
GRANT ALL ON public.super_owners TO service_role;
ALTER TABLE public.super_owners ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_super_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.super_owners WHERE user_id = _user_id);
$$;
REVOKE EXECUTE ON FUNCTION public.is_super_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_owner(uuid) TO authenticated, service_role;

CREATE POLICY "View super owners" ON public.super_owners
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Grant super owner" ON public.super_owners
  FOR INSERT TO authenticated WITH CHECK (public.is_super_owner(auth.uid()));
CREATE POLICY "Revoke super owner" ON public.super_owners
  FOR DELETE TO authenticated
  USING (public.is_super_owner(auth.uid()) AND user_id <> auth.uid());

-- 2. Permissions catalog
CREATE TABLE IF NOT EXISTS public.permissions (
  key text PRIMARY KEY,
  label_ar text NOT NULL,
  label_en text NOT NULL,
  category text NOT NULL,
  description text
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View permissions" ON public.permissions
  FOR SELECT TO authenticated USING (true);

-- 3. Custom roles
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_roles TO authenticated;
GRANT ALL ON public.custom_roles TO service_role;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view custom roles" ON public.custom_roles
  FOR SELECT TO authenticated
  USING (private.is_tenant_member(auth.uid(), tenant_id) OR public.is_super_owner(auth.uid()));
CREATE POLICY "Owners manage custom roles" ON public.custom_roles
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), tenant_id, 'owner') OR public.is_super_owner(auth.uid()))
  WITH CHECK (private.has_role(auth.uid(), tenant_id, 'owner') OR public.is_super_owner(auth.uid()));
CREATE TRIGGER trg_custom_roles_updated_at
  BEFORE UPDATE ON public.custom_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Role Permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  role_kind text NOT NULL CHECK (role_kind IN ('builtin','custom')),
  builtin_role app_role,
  custom_role_id uuid REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (role_kind='builtin' AND builtin_role IS NOT NULL AND custom_role_id IS NULL) OR
    (role_kind='custom'  AND custom_role_id IS NOT NULL AND builtin_role IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_builtin_uk
  ON public.role_permissions (COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), builtin_role, permission_key)
  WHERE role_kind = 'builtin';
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_custom_uk
  ON public.role_permissions (tenant_id, custom_role_id, permission_key)
  WHERE role_kind = 'custom';

GRANT SELECT, INSERT, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View role permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert role permissions" ON public.role_permissions
  FOR INSERT TO authenticated WITH CHECK (
    public.is_super_owner(auth.uid()) OR
    (tenant_id IS NOT NULL AND private.has_role(auth.uid(), tenant_id, 'owner'))
  );
CREATE POLICY "Delete role permissions" ON public.role_permissions
  FOR DELETE TO authenticated USING (
    public.is_super_owner(auth.uid()) OR
    (tenant_id IS NOT NULL AND private.has_role(auth.uid(), tenant_id, 'owner'))
  );

-- 5. has_permission function
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _tenant_id uuid, _permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_owner(_user_id) OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp
        ON rp.builtin_role = ur.role AND rp.role_kind = 'builtin'
       AND (rp.tenant_id = _tenant_id OR rp.tenant_id IS NULL)
      WHERE ur.user_id = _user_id AND ur.tenant_id = _tenant_id
        AND rp.permission_key = _permission_key
    );
$$;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid,uuid,text) TO authenticated, service_role;

-- 6. Super owner extended policies on core tables
CREATE POLICY "Super owner all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_owner(auth.uid()))
  WITH CHECK (public.is_super_owner(auth.uid()));

CREATE POLICY "Super owner view tenants" ON public.tenants
  FOR SELECT TO authenticated USING (public.is_super_owner(auth.uid()));
CREATE POLICY "Super owner update tenants" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.is_super_owner(auth.uid()))
  WITH CHECK (public.is_super_owner(auth.uid()));

CREATE POLICY "Super owner view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_super_owner(auth.uid()));
CREATE POLICY "Super owner update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_super_owner(auth.uid()))
  WITH CHECK (public.is_super_owner(auth.uid()));

-- 7. Seed permissions
INSERT INTO public.permissions (key, label_ar, label_en, category) VALUES
  ('branches.view','عرض الفروع','View branches','branches'),
  ('branches.manage','إدارة الفروع','Manage branches','branches'),
  ('users.view','عرض المستخدمين','View users','users'),
  ('users.manage','إدارة المستخدمين','Manage users','users'),
  ('users.change_password','تغيير كلمات المرور','Change passwords','users'),
  ('products.view','عرض المنتجات','View products','catalog'),
  ('products.manage','إدارة المنتجات','Manage products','catalog'),
  ('categories.manage','إدارة الأقسام','Manage categories','catalog'),
  ('pos.use','استخدام نقطة البيع','Use POS','sales'),
  ('sales.view','عرض الفواتير','View sales','sales'),
  ('sales.refund','استرجاع فاتورة','Refund sales','sales'),
  ('cash.open_close','فتح/إغلاق الصندوق','Open/close cash','sales'),
  ('inventory.view','عرض المخزون','View inventory','inventory'),
  ('inventory.adjust','تعديل المخزون','Adjust inventory','inventory'),
  ('suppliers.manage','إدارة الموردين','Manage suppliers','inventory'),
  ('purchases.manage','إدارة المشتريات','Manage purchases','inventory'),
  ('customers.manage','إدارة العملاء','Manage customers','crm'),
  ('expenses.view','عرض المصروفات','View expenses','finance'),
  ('expenses.manage','إدارة المصروفات','Manage expenses','finance'),
  ('reports.view','عرض التقارير','View reports','reports'),
  ('reports.export','تصدير التقارير','Export reports','reports'),
  ('audit.view','عرض سجل العمليات','View audit log','system'),
  ('kitchen.view','عرض طلبات المطبخ','View kitchen','operations'),
  ('waiter.orders','إدارة طلبات النادل','Manage waiter orders','operations')
ON CONFLICT (key) DO NOTHING;

-- 8. Seed default role -> permissions (global defaults with tenant_id NULL)
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'owner'::app_role, key FROM public.permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'manager'::app_role, key FROM public.permissions
WHERE key NOT IN ('users.change_password','audit.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key) VALUES
  (NULL,'builtin','cashier','pos.use'),
  (NULL,'builtin','cashier','sales.view'),
  (NULL,'builtin','cashier','cash.open_close'),
  (NULL,'builtin','cashier','products.view'),
  (NULL,'builtin','cashier','customers.manage'),
  (NULL,'builtin','accountant','sales.view'),
  (NULL,'builtin','accountant','expenses.view'),
  (NULL,'builtin','accountant','expenses.manage'),
  (NULL,'builtin','accountant','reports.view'),
  (NULL,'builtin','accountant','reports.export'),
  (NULL,'builtin','accountant','inventory.view'),
  (NULL,'builtin','warehouse','inventory.view'),
  (NULL,'builtin','warehouse','inventory.adjust'),
  (NULL,'builtin','warehouse','suppliers.manage'),
  (NULL,'builtin','warehouse','purchases.manage'),
  (NULL,'builtin','warehouse','products.view'),
  (NULL,'builtin','waiter','waiter.orders'),
  (NULL,'builtin','waiter','products.view'),
  (NULL,'builtin','waiter','customers.manage'),
  (NULL,'builtin','kitchen','kitchen.view')
ON CONFLICT DO NOTHING;
