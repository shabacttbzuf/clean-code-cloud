
-- Attendance: prepare for richer statuses + biometric integration
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS biometric_ref TEXT,
  ADD COLUMN IF NOT EXISTS late_minutes NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_leave_minutes NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(6,2) DEFAULT 0;

-- Employees: salary type + auto-derived rates + schedule
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS salary_type TEXT DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS daily_salary NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS hourly_salary NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS working_hours_per_day NUMERIC(4,2) DEFAULT 8,
  ADD COLUMN IF NOT EXISTS working_days_per_month INTEGER DEFAULT 26,
  ADD COLUMN IF NOT EXISTS work_schedule JSONB;

-- Payroll items: enterprise breakdown
ALTER TABLE public.payroll_items
  ADD COLUMN IF NOT EXISTS working_hours NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attendance_days NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incentives_total NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS absence_deduction NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_deduction NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holidays_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leave_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(12,2);

-- Payroll runs: reject reason
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID;
