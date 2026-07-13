
-- =========================================================
-- HR / Payroll system
-- =========================================================

-- Employees ------------------------------------------------
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  employee_no TEXT,
  full_name TEXT NOT NULL,
  job_title TEXT,
  department TEXT,
  phone TEXT,
  email TEXT,
  national_id TEXT,
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  contract_type TEXT NOT NULL DEFAULT 'full_time' CHECK (contract_type IN ('full_time','part_time','contract','hourly')),
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  bank_name TEXT,
  bank_account TEXT,
  emergency_contact TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','terminated')),
  termination_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, employee_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_read" ON public.employees FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
  OR (public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager','accountant']) AND (branch_id IS NULL OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())))
  OR user_id = auth.uid()
);
CREATE POLICY "employees_write" ON public.employees FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
  OR (public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager']) AND (branch_id IS NULL OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())))
)
WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
  OR (public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager']) AND (branch_id IS NULL OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())))
);

CREATE TRIGGER employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_employees_tenant ON public.employees(tenant_id);
CREATE INDEX idx_employees_branch ON public.employees(branch_id);
CREATE INDEX idx_employees_user ON public.employees(user_id);

-- Leave types ---------------------------------------------
CREATE TABLE public.leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days_per_year INTEGER NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT true,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  color TEXT DEFAULT '#3b82f6',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_types TO authenticated;
GRANT ALL ON public.leave_types TO service_role;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_types_read" ON public.leave_types FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND tenant_id = leave_types.tenant_id)
);
CREATE POLICY "leave_types_write" ON public.leave_types FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
) WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
);
CREATE TRIGGER leave_types_updated_at BEFORE UPDATE ON public.leave_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Leave requests ------------------------------------------
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id UUID REFERENCES public.leave_types(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count NUMERIC(5,2) NOT NULL DEFAULT 1,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_requests_read" ON public.leave_requests FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager','accountant'])
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "leave_requests_write" ON public.leave_requests FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid() AND leave_requests.status = 'pending')
) WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid())
);
CREATE TRIGGER leave_requests_updated_at BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_leave_requests_employee ON public.leave_requests(employee_id);
CREATE INDEX idx_leave_requests_tenant_status ON public.leave_requests(tenant_id, status);

-- Attendance ----------------------------------------------
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  hours_worked NUMERIC(6,2) NOT NULL DEFAULT 0,
  is_late BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','leave','holiday','half_day')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_read" ON public.attendance FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager','accountant'])
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = attendance.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "attendance_write" ON public.attendance FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
) WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
);
CREATE TRIGGER attendance_updated_at BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_attendance_employee_date ON public.attendance(employee_id, date DESC);

-- Bonuses -------------------------------------------------
CREATE TABLE public.bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT,
  bonus_type TEXT NOT NULL DEFAULT 'other' CHECK (bonus_type IN ('performance','eid','annual','overtime','other')),
  applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payroll_item_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonuses TO authenticated;
GRANT ALL ON public.bonuses TO service_role;
ALTER TABLE public.bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bonuses_read" ON public.bonuses FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager','accountant'])
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = bonuses.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "bonuses_write" ON public.bonuses FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
) WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
);
CREATE TRIGGER bonuses_updated_at BEFORE UPDATE ON public.bonuses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_bonuses_employee ON public.bonuses(employee_id);

-- Deductions ----------------------------------------------
CREATE TABLE public.deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT,
  deduction_type TEXT NOT NULL DEFAULT 'other' CHECK (deduction_type IN ('absence','late','advance','insurance','loan','other')),
  applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payroll_item_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deductions TO authenticated;
GRANT ALL ON public.deductions TO service_role;
ALTER TABLE public.deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deductions_read" ON public.deductions FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager','accountant'])
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = deductions.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "deductions_write" ON public.deductions FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
) WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
);
CREATE TRIGGER deductions_updated_at BEFORE UPDATE ON public.deductions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_deductions_employee ON public.deductions(employee_id);

-- Payroll runs --------------------------------------------
CREATE TABLE public.payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),
  total_gross NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_bonuses NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_net NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','cancelled')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, branch_id, period_year, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated;
GRANT ALL ON public.payroll_runs TO service_role;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_runs_read" ON public.payroll_runs FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','accountant'])
  OR (public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager']) AND (branch_id IS NULL OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())))
);
CREATE POLICY "payroll_runs_write" ON public.payroll_runs FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
  OR (public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager']) AND (branch_id IS NULL OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())))
) WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
  OR (public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager']) AND (branch_id IS NULL OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())))
);
CREATE TRIGGER payroll_runs_updated_at BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Payroll items -------------------------------------------
CREATE TABLE public.payroll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonuses_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  overtime_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross NUMERIC(12,2) NOT NULL DEFAULT 0,
  net NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(payroll_run_id, employee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_items TO authenticated;
GRANT ALL ON public.payroll_items TO service_role;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_items_read" ON public.payroll_items FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager','accountant'])
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = payroll_items.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "payroll_items_write" ON public.payroll_items FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
) WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
);
CREATE TRIGGER payroll_items_updated_at BEFORE UPDATE ON public.payroll_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_payroll_items_run ON public.payroll_items(payroll_run_id);

-- Add FK from bonuses/deductions.payroll_item_id ----------
ALTER TABLE public.bonuses ADD CONSTRAINT bonuses_payroll_item_fk FOREIGN KEY (payroll_item_id) REFERENCES public.payroll_items(id) ON DELETE SET NULL;
ALTER TABLE public.deductions ADD CONSTRAINT deductions_payroll_item_fk FOREIGN KEY (payroll_item_id) REFERENCES public.payroll_items(id) ON DELETE SET NULL;

-- Audit triggers on new HR tables -------------------------
CREATE TRIGGER audit_employees AFTER INSERT OR UPDATE OR DELETE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_payroll_runs AFTER INSERT OR UPDATE OR DELETE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_leave_requests AFTER INSERT OR UPDATE OR DELETE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_bonuses AFTER INSERT OR UPDATE OR DELETE ON public.bonuses FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_deductions AFTER INSERT OR UPDATE OR DELETE ON public.deductions FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

-- Permissions catalog additions ---------------------------
INSERT INTO public.permissions(key, label_ar, label_en, category) VALUES
  ('hr.view', 'عرض الموارد البشرية', 'View HR', 'hr'),
  ('hr.manage', 'إدارة الموارد البشرية', 'Manage HR', 'hr'),
  ('leaves.approve', 'اعتماد الإجازات', 'Approve leaves', 'hr'),
  ('payroll.run', 'تشغيل الرواتب', 'Run payroll', 'payroll'),
  ('payroll.approve', 'اعتماد الرواتب', 'Approve payroll', 'payroll')
ON CONFLICT (key) DO NOTHING;

-- Wire defaults to builtin roles --------------------------
INSERT INTO public.role_permissions(role_kind, builtin_role, permission_key, tenant_id) VALUES
  ('builtin', 'owner', 'hr.view', NULL),
  ('builtin', 'owner', 'hr.manage', NULL),
  ('builtin', 'owner', 'leaves.approve', NULL),
  ('builtin', 'owner', 'payroll.run', NULL),
  ('builtin', 'owner', 'payroll.approve', NULL),
  ('builtin', 'manager', 'hr.view', NULL),
  ('builtin', 'manager', 'hr.manage', NULL),
  ('builtin', 'manager', 'leaves.approve', NULL),
  ('builtin', 'manager', 'payroll.run', NULL),
  ('builtin', 'accountant', 'hr.view', NULL),
  ('builtin', 'accountant', 'payroll.run', NULL)
ON CONFLICT DO NOTHING;
