-- Expand action-level permissions for operational and enterprise master-data sections.
-- Existing *.manage grants remain compatible and are mirrored into the new keys.
BEGIN;

INSERT INTO public.permissions (key, label_ar, label_en, category)
VALUES
  ('categories.create','إضافة التصنيفات','Create categories','catalog'),
  ('categories.edit','تعديل التصنيفات','Edit categories','catalog'),
  ('categories.delete','حذف التصنيفات','Delete categories','catalog'),
  ('categories.print','طباعة التصنيفات','Print categories','catalog'),
  ('categories.export','تصدير التصنيفات','Export categories','catalog'),
  ('customers.create','إضافة العملاء','Create customers','crm'),
  ('customers.edit','تعديل العملاء','Edit customers','crm'),
  ('customers.delete','إيقاف العملاء','Deactivate customers','crm'),
  ('customers.print','طباعة العملاء','Print customers','crm'),
  ('customers.export','تصدير العملاء','Export customers','crm'),
  ('expenses.create','إضافة المصروفات','Create expenses','finance'),
  ('expenses.edit','تعديل المصروفات','Edit expenses','finance'),
  ('expenses.delete','حذف المصروفات','Delete expenses','finance'),
  ('expenses.print','طباعة المصروفات','Print expenses','finance'),
  ('expenses.export','تصدير المصروفات','Export expenses','finance'),
  ('expense_categories.create','إضافة تصنيفات المصروفات','Create expense categories','finance'),
  ('expense_categories.edit','تعديل تصنيفات المصروفات','Edit expense categories','finance'),
  ('expense_categories.delete','حذف تصنيفات المصروفات','Delete expense categories','finance'),
  ('suppliers.create','إضافة الموردين','Create suppliers','purchasing'),
  ('suppliers.edit','تعديل الموردين','Edit suppliers','purchasing'),
  ('suppliers.delete','إيقاف الموردين','Deactivate suppliers','purchasing'),
  ('suppliers.print','طباعة الموردين','Print suppliers','purchasing'),
  ('suppliers.export','تصدير الموردين','Export suppliers','purchasing'),
  ('departments.create','إضافة الأقسام','Create departments','hr'),
  ('departments.edit','تعديل الأقسام','Edit departments','hr'),
  ('departments.delete','حذف الأقسام','Delete departments','hr'),
  ('departments.print','طباعة الأقسام','Print departments','hr'),
  ('departments.export','تصدير الأقسام','Export departments','hr'),
  ('job_titles.create','إضافة المسميات الوظيفية','Create job titles','hr'),
  ('job_titles.edit','تعديل المسميات الوظيفية','Edit job titles','hr'),
  ('job_titles.delete','حذف المسميات الوظيفية','Delete job titles','hr'),
  ('job_titles.print','طباعة المسميات الوظيفية','Print job titles','hr'),
  ('job_titles.export','تصدير المسميات الوظيفية','Export job titles','hr'),
  ('employment_types.create','إضافة أنواع التوظيف','Create employment types','hr'),
  ('employment_types.edit','تعديل أنواع التوظيف','Edit employment types','hr'),
  ('employment_types.delete','حذف أنواع التوظيف','Delete employment types','hr'),
  ('employment_types.print','طباعة أنواع التوظيف','Print employment types','hr'),
  ('employment_types.export','تصدير أنواع التوظيف','Export employment types','hr'),
  ('companies.create','إضافة الشركات','Create companies','system'),
  ('companies.edit','تعديل الشركات','Edit companies','system'),
  ('companies.delete','حذف الشركات','Delete companies','system'),
  ('companies.print','طباعة الشركات','Print companies','system'),
  ('companies.export','تصدير الشركات','Export companies','system'),
  ('hr.employees.create','إضافة الموظفين','Create employees','hr'),
  ('hr.employees.edit','تعديل الموظفين','Edit employees','hr'),
  ('hr.employees.delete','حذف الموظفين','Delete employees','hr'),
  ('hr.employees.print','طباعة الموظفين','Print employees','hr'),
  ('hr.employees.export','تصدير الموظفين','Export employees','hr'),
  ('hr.attendance.create','تسجيل الحضور','Create attendance records','hr'),
  ('hr.attendance.edit','تعديل الحضور','Edit attendance records','hr'),
  ('hr.attendance.delete','حذف سجلات الحضور','Delete attendance records','hr'),
  ('hr.attendance.export','تصدير الحضور','Export attendance','hr'),
  ('hr.compensation.create','إضافة المستحقات والاستقطاعات','Create compensation records','hr'),
  ('hr.compensation.edit','تعديل المستحقات والاستقطاعات','Edit compensation records','hr'),
  ('hr.compensation.delete','حذف المستحقات والاستقطاعات','Delete compensation records','hr'),
  ('hr.compensation.print','طباعة المستحقات والاستقطاعات','Print compensation','hr'),
  ('hr.compensation.export','تصدير المستحقات والاستقطاعات','Export compensation','hr'),
  ('hr.leaves.create','إنشاء طلبات الإجازة','Create leave requests','hr'),
  ('hr.leaves.edit','تعديل طلبات الإجازة','Edit leave requests','hr'),
  ('hr.leaves.delete','حذف طلبات الإجازة','Delete leave requests','hr'),
  ('hr.leaves.export','تصدير الإجازات','Export leave requests','hr'),
  ('hr.payroll.export','تصدير الرواتب','Export payroll','hr'),
  ('notifications.create','إنشاء الإشعارات','Create notifications','system'),
  ('notifications.edit','تعديل الإشعارات','Edit notifications','system'),
  ('notifications.delete','حذف الإشعارات','Delete notifications','system'),
  ('branches.print','طباعة الفروع','Print branches','branches'),
  ('branches.export','تصدير الفروع','Export branches','branches'),
  ('products.print','طباعة المنتجات','Print products','catalog'),
  ('products.export','تصدير المنتجات','Export products','catalog'),
  ('purchases.print','طباعة المشتريات','Print purchases','purchasing'),
  ('purchases.export','تصدير المشتريات','Export purchases','purchasing'),
  ('inventory.print','طباعة المخزون','Print inventory','inventory'),
  ('inventory.export','تصدير المخزون','Export inventory','inventory'),
  ('cash.print','طباعة الورديات','Print cash sessions','finance'),
  ('cash.export','تصدير الورديات','Export cash sessions','finance')
ON CONFLICT (key) DO NOTHING;

-- Mirror existing manage/view defaults into the new action keys for built-in
-- and custom roles. This only adds grants; it never revokes prior permissions.
WITH permission_map(legacy_key, new_key) AS (VALUES
  ('categories.manage','categories.create'),('categories.manage','categories.edit'),('categories.manage','categories.delete'),
  ('categories.view','categories.print'),('categories.view','categories.export'),
  ('customers.manage','customers.create'),('customers.manage','customers.edit'),('customers.manage','customers.delete'),
  ('customers.view','customers.print'),('customers.view','customers.export'),
  ('expenses.manage','expenses.create'),('expenses.manage','expenses.edit'),('expenses.manage','expenses.delete'),
  ('expenses.view','expenses.print'),('expenses.view','expenses.export'),
  ('expense_categories.manage','expense_categories.create'),('expense_categories.manage','expense_categories.edit'),('expense_categories.manage','expense_categories.delete'),
  ('suppliers.manage','suppliers.create'),('suppliers.manage','suppliers.edit'),('suppliers.manage','suppliers.delete'),
  ('suppliers.view','suppliers.print'),('suppliers.view','suppliers.export'),
  ('departments.manage','departments.create'),('departments.manage','departments.edit'),('departments.manage','departments.delete'),
  ('departments.view','departments.print'),('departments.view','departments.export'),
  ('job_titles.manage','job_titles.create'),('job_titles.manage','job_titles.edit'),('job_titles.manage','job_titles.delete'),
  ('job_titles.view','job_titles.print'),('job_titles.view','job_titles.export'),
  ('employment_types.manage','employment_types.create'),('employment_types.manage','employment_types.edit'),('employment_types.manage','employment_types.delete'),
  ('employment_types.view','employment_types.print'),('employment_types.view','employment_types.export'),
  ('companies.manage','companies.create'),('companies.manage','companies.edit'),('companies.manage','companies.delete'),
  ('companies.view','companies.print'),('companies.view','companies.export'),
  ('hr.employees.manage','hr.employees.create'),('hr.employees.manage','hr.employees.edit'),('hr.employees.manage','hr.employees.delete'),
  ('hr.employees.view','hr.employees.print'),('hr.employees.view','hr.employees.export'),
  ('hr.attendance.manage','hr.attendance.create'),('hr.attendance.manage','hr.attendance.edit'),('hr.attendance.manage','hr.attendance.delete'),
  ('hr.attendance.view','hr.attendance.export'),
  ('hr.compensation.manage','hr.compensation.create'),('hr.compensation.manage','hr.compensation.edit'),('hr.compensation.manage','hr.compensation.delete'),
  ('hr.compensation.view','hr.compensation.print'),('hr.compensation.view','hr.compensation.export'),
  ('hr.manage','hr.leaves.create'),('hr.manage','hr.leaves.edit'),('hr.manage','hr.leaves.delete'),
  ('hr.leaves.view','hr.leaves.export'),('hr.payroll.view','hr.payroll.export'),
  ('notifications.manage','notifications.create'),('notifications.manage','notifications.edit'),('notifications.manage','notifications.delete'),
  ('branches.view','branches.print'),('branches.view','branches.export'),
  ('products.view','products.print'),('products.view','products.export'),
  ('purchases.view','purchases.print'),('purchases.view','purchases.export'),
  ('inventory.view','inventory.print'),('inventory.view','inventory.export'),
  ('cash.view','cash.print'),('cash.view','cash.export')
)
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, custom_role_id, permission_key)
SELECT rp.tenant_id, rp.role_kind, rp.builtin_role, rp.custom_role_id, pm.new_key
FROM public.role_permissions rp
JOIN permission_map pm ON pm.legacy_key=rp.permission_key
WHERE (rp.role_kind='builtin' AND rp.tenant_id IS NULL)
   OR (rp.role_kind='custom' AND rp.tenant_id IS NOT NULL AND rp.custom_role_id IS NOT NULL)
ON CONFLICT DO NOTHING;

-- Replace the action gates for these tables. Existing tenant/company/branch
-- scope policies remain in force; legacy manage keys remain valid fallbacks.
DO $section_crud_gates$
DECLARE
  r record;
  v_table text;
  v_insert text;
  v_update text;
  v_delete text;
  v_legacy text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('categories','categories.create','categories.edit','categories.delete','categories.manage'),
    ('customers','customers.create','customers.edit','customers.delete','customers.manage'),
    ('expenses','expenses.create','expenses.edit','expenses.delete','expenses.manage'),
    ('expense_categories','expense_categories.create','expense_categories.edit','expense_categories.delete','expense_categories.manage'),
    ('suppliers','suppliers.create','suppliers.edit','suppliers.delete','suppliers.manage'),
    ('departments','departments.create','departments.edit','departments.delete','departments.manage'),
    ('job_titles','job_titles.create','job_titles.edit','job_titles.delete','job_titles.manage'),
    ('employment_types','employment_types.create','employment_types.edit','employment_types.delete','employment_types.manage'),
    ('companies','companies.create','companies.edit','companies.delete','companies.manage'),
    ('employees','hr.employees.create','hr.employees.edit','hr.employees.delete','hr.employees.manage'),
    ('attendance','hr.attendance.create','hr.attendance.edit','hr.attendance.delete','hr.attendance.manage'),
    ('bonuses','hr.compensation.create','hr.compensation.edit','hr.compensation.delete','hr.compensation.manage'),
    ('deductions','hr.compensation.create','hr.compensation.edit','hr.compensation.delete','hr.compensation.manage'),
    ('leave_types','hr.leaves.create','hr.leaves.edit','hr.leaves.delete','hr.manage'),
    ('notifications','notifications.create','notifications.edit','notifications.delete','notifications.manage'),
    ('purchase_returns','purchases.returns.create','purchases.returns.edit','purchases.returns.delete','purchases.manage'),
    ('purchase_return_items','purchases.returns.create','purchases.returns.edit','purchases.returns.delete','purchases.manage')
  ) AS m(table_name, insert_key, update_key, delete_key, legacy_key)
  LOOP
    v_table := r.table_name;
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=v_table AND column_name='tenant_id') THEN CONTINUE; END IF;

    EXECUTE format('DROP POLICY IF EXISTS permission_gate_%I_insert ON public.%I',v_table,v_table);
    EXECUTE format('CREATE POLICY permission_gate_%I_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_permission((select auth.uid()), tenant_id, %L) OR public.has_permission((select auth.uid()), tenant_id, %L))',v_table,v_table,r.insert_key,r.legacy_key);

    EXECUTE format('DROP POLICY IF EXISTS permission_gate_%I_update ON public.%I',v_table,v_table);
    EXECUTE format('CREATE POLICY permission_gate_%I_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_permission((select auth.uid()), tenant_id, %L) OR public.has_permission((select auth.uid()), tenant_id, %L)) WITH CHECK (public.has_permission((select auth.uid()), tenant_id, %L) OR public.has_permission((select auth.uid()), tenant_id, %L))',v_table,v_table,r.update_key,r.legacy_key,r.update_key,r.legacy_key);

    EXECUTE format('DROP POLICY IF EXISTS permission_gate_%I_delete ON public.%I',v_table,v_table);
    EXECUTE format('CREATE POLICY permission_gate_%I_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_permission((select auth.uid()), tenant_id, %L) OR public.has_permission((select auth.uid()), tenant_id, %L))',v_table,v_table,r.delete_key,r.legacy_key);
  END LOOP;
END
$section_crud_gates$;

COMMIT;
