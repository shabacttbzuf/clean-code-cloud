import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Loader2, Search, UserRound, Briefcase, Building2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { ImageUploader } from "@/components/image-uploader";
import { formatMoney, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/hr/employees")({
  component: EmployeesPage,
});

type Employee = {
  id: string; tenant_id: string; user_id: string | null; branch_id: string | null;
  employee_no: string | null; full_name: string; job_title: string | null;
  department: string | null; phone: string | null; email: string | null;
  national_id: string | null; hire_date: string; contract_type: string;
  base_salary: number; hourly_rate: number; bank_name: string | null;
  bank_account: string | null; emergency_contact: string | null;
  avatar_url: string | null; status: string; notes: string | null;
  salary_type?: string | null; daily_salary?: number | null; hourly_salary?: number | null;
  working_hours_per_day?: number | null; working_days_per_month?: number | null;
  work_schedule?: any;
};
type Branch = { id: string; name: string };

const schema = z.object({
  full_name: z.string().trim().min(2, "الاسم قصير").max(120),
  employee_no: z.string().trim().max(30).optional().or(z.literal("")),
  job_title: z.string().trim().max(80).optional().or(z.literal("")),
  department: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  national_id: z.string().trim().max(30).optional().or(z.literal("")),
  branch_id: z.string().uuid().nullable().optional(),
  hire_date: z.string(),
  contract_type: z.enum(["full_time","part_time","contract","hourly"]),
  base_salary: z.number().min(0),
  hourly_rate: z.number().min(0),
  bank_name: z.string().trim().max(60).optional().or(z.literal("")),
  bank_account: z.string().trim().max(60).optional().or(z.literal("")),
  emergency_contact: z.string().trim().max(60).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  avatar_url: z.string().url().nullable().optional(),
  status: z.enum(["active","suspended","terminated"]),
  salary_type: z.enum(["monthly","daily","hourly"]).default("monthly"),
  working_hours_per_day: z.number().min(1).max(24).default(8),
  working_days_per_month: z.number().int().min(1).max(31).default(26),
  daily_salary: z.number().min(0).nullable().optional(),
  hourly_salary: z.number().min(0).nullable().optional(),
  work_schedule: z.string().max(400).optional().or(z.literal("")),
});

const contractLabels: Record<string, string> = {
  full_time: "دوام كامل", part_time: "دوام جزئي", contract: "عقد", hourly: "بالساعة",
};
const statusColors: Record<string, string> = {
  active: "bg-success/15 text-success", suspended: "bg-chart-4/15 text-chart-4", terminated: "bg-destructive/15 text-destructive",
};
const statusLabels: Record<string, string> = { active: "نشط", suspended: "موقوف", terminated: "منتهي" };

function EmployeesPage() {
  const { tenantId, tenant, isAdmin } = useActiveTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");

  const q = useQuery({
    queryKey: ["employees", tenantId],
    queryFn: async (): Promise<Employee[]> => {
      const { data, error } = await supabase.from("employees").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
    enabled: !!tenantId,
  });

  const branches = useQuery({
    queryKey: ["branches-min", tenantId],
    queryFn: async (): Promise<Branch[]> => {
      const { data, error } = await supabase.from("branches").select("id, name").eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
    enabled: !!tenantId,
  });

  const branchName = (id: string | null) => branches.data?.find((b) => b.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    let list = q.data ?? [];
    if (statusFilter !== "all") list = list.filter((e) => e.status === statusFilter);
    if (branchFilter !== "all") list = list.filter((e) => e.branch_id === branchFilter);
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((e) =>
      e.full_name.toLowerCase().includes(s) ||
      (e.employee_no ?? "").toLowerCase().includes(s) ||
      (e.phone ?? "").toLowerCase().includes(s) ||
      (e.job_title ?? "").toLowerCase().includes(s)
    );
  }, [q.data, search, statusFilter, branchFilter]);

  const upsert = useMutation({
    mutationFn: async (v: z.infer<typeof schema>) => {
      const payload: any = {
        ...v,
        employee_no: v.employee_no || null,
        job_title: v.job_title || null,
        department: v.department || null,
        phone: v.phone || null,
        email: v.email || null,
        national_id: v.national_id || null,
        bank_name: v.bank_name || null,
        bank_account: v.bank_account || null,
        emergency_contact: v.emergency_contact || null,
        notes: v.notes || null,
        avatar_url: v.avatar_url ?? null,
        branch_id: v.branch_id || null,
        tenant_id: tenantId!,
        work_schedule: v.work_schedule ? { note: v.work_schedule } : null,
      };
      if (editing) {
        const { error } = await supabase.from("employees").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees", tenantId] });
      toast.success("تم الحفظ");
      setOpen(false); setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees", tenantId] }); toast.success("تم الحذف"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل الحذف"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="الموظفون" subtitle={`${filtered.length} موظف`}
        action={isAdmin && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button><Plus className="ml-2 h-4 w-4" />موظف جديد</Button></DialogTrigger>
            <EmployeeDialog initial={editing} tenantId={tenantId!} branches={branches.data ?? []} onSubmit={(v) => upsert.mutate(v)} pending={upsert.isPending} />
          </Dialog>
        )}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="ابحث بالاسم، الرقم الوظيفي، أو المسمى..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="suspended">موقوف</SelectItem>
            <SelectItem value="terminated">منتهي</SelectItem>
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="الفرع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفروع</SelectItem>
            {(branches.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <UserRound className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">لا يوجد موظفون</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => (
            <Card key={e.id}>
              <CardContent className="p-4">
                <div className="mb-3 flex items-start gap-3">
                  {e.avatar_url ? (
                    <img src={e.avatar_url} alt={e.full_name} className="h-14 w-14 rounded-full object-cover" />
                  ) : (
                    <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                      {e.full_name.slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-semibold">{e.full_name}</div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${statusColors[e.status]}`}>{statusLabels[e.status]}</span>
                    </div>
                    {e.job_title && <div className="truncate text-xs text-muted-foreground">{e.job_title}</div>}
                    {e.employee_no && <div className="mt-0.5 text-[10px] font-mono text-muted-foreground">#{e.employee_no}</div>}
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2"><Briefcase className="h-3 w-3" />{contractLabels[e.contract_type]}</div>
                  <div className="flex items-center gap-2"><Building2 className="h-3 w-3" />{branchName(e.branch_id)}</div>
                  <div className="flex items-center gap-2"><DollarSign className="h-3 w-3" /><span className="num text-foreground">{formatMoney(e.base_salary)}</span> {tenant?.currency}</div>
                  <div className="text-[10px]">التوظيف: {formatDate(e.hire_date)}</div>
                </div>
                {isAdmin && (
                  <div className="mt-3 flex gap-1 border-t pt-3">
                    <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setEditing(e); setOpen(true); }}>
                      <Edit className="ml-2 h-3 w-3" />تعديل
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm(`حذف "${e.full_name}"؟`)) del.mutate(e.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeDialog({ initial, tenantId, branches, onSubmit, pending }: {
  initial: Employee | null; tenantId: string; branches: Branch[];
  onSubmit: (v: z.infer<typeof schema>) => void; pending: boolean;
}) {
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [empNo, setEmpNo] = useState(initial?.employee_no ?? "");
  const [jobTitle, setJobTitle] = useState(initial?.job_title ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [nationalId, setNationalId] = useState(initial?.national_id ?? "");
  const [branchId, setBranchId] = useState<string | null>(initial?.branch_id ?? null);
  const [hireDate, setHireDate] = useState(initial?.hire_date ?? new Date().toISOString().slice(0, 10));
  const [contractType, setContractType] = useState<any>(initial?.contract_type ?? "full_time");
  const [baseSalary, setBaseSalary] = useState(String(initial?.base_salary ?? 0));
  const [hourlyRate, setHourlyRate] = useState(String(initial?.hourly_rate ?? 0));
  const [bankName, setBankName] = useState(initial?.bank_name ?? "");
  const [bankAccount, setBankAccount] = useState(initial?.bank_account ?? "");
  const [emergency, setEmergency] = useState(initial?.emergency_contact ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial?.avatar_url ?? null);
  const [status, setStatus] = useState<any>(initial?.status ?? "active");
  const [salaryType, setSalaryType] = useState<any>(initial?.salary_type ?? "monthly");
  const [workingHours, setWorkingHours] = useState(String(initial?.working_hours_per_day ?? 8));
  const [workingDays, setWorkingDays] = useState(String(initial?.working_days_per_month ?? 26));
  const [workSchedule, setWorkSchedule] = useState<string>(
    initial?.work_schedule && typeof initial.work_schedule === "object" && initial.work_schedule.note ? String(initial.work_schedule.note) : "",
  );

  const baseNum = Number(baseSalary) || 0;
  const daysNum = Math.max(1, Number(workingDays) || 26);
  const hoursNum = Math.max(1, Number(workingHours) || 8);
  const autoDaily = baseNum / daysNum;
  const autoHourly = autoDaily / hoursNum;

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>{initial ? "تعديل موظف" : "موظف جديد"}</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        try {
          onSubmit(schema.parse({
            full_name: fullName, employee_no: empNo, job_title: jobTitle, department, phone, email,
            national_id: nationalId, branch_id: branchId, hire_date: hireDate,
            contract_type: contractType, base_salary: Number(baseSalary) || 0, hourly_rate: Number(hourlyRate) || 0,
            bank_name: bankName, bank_account: bankAccount, emergency_contact: emergency,
            notes, avatar_url: avatarUrl, status,
            salary_type: salaryType,
            working_hours_per_day: hoursNum,
            working_days_per_month: daysNum,
            daily_salary: +autoDaily.toFixed(2),
            hourly_salary: +autoHourly.toFixed(2),
            work_schedule: workSchedule,
          }));
        } catch (err) { if (err instanceof z.ZodError) toast.error(err.issues[0].message); }
      }}>
        <ImageUploader tenantId={tenantId} folder="avatars" value={avatarUrl} onChange={setAvatarUrl} label="الصورة الشخصية" />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>الاسم الكامل *</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
          <div className="space-y-2"><Label>الرقم الوظيفي</Label><Input value={empNo} onChange={(e) => setEmpNo(e.target.value)} /></div>
          <div className="space-y-2"><Label>المسمى الوظيفي</Label><Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></div>
          <div className="space-y-2"><Label>القسم</Label><Input value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
          <div className="space-y-2"><Label>الهاتف</Label><Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-2"><Label>البريد</Label><Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-2"><Label>الهوية</Label><Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} /></div>
          <div className="space-y-2"><Label>الفرع</Label>
            <Select value={branchId ?? "_none"} onValueChange={(v) => setBranchId(v === "_none" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— بدون —</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>تاريخ التوظيف</Label><Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>نوع العقد</Label>
            <Select value={contractType} onValueChange={setContractType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">دوام كامل</SelectItem>
                <SelectItem value="part_time">دوام جزئي</SelectItem>
                <SelectItem value="contract">عقد</SelectItem>
                <SelectItem value="hourly">بالساعة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>الراتب الأساسي</Label><Input type="number" min="0" step="0.01" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} /></div>
          <div className="space-y-2"><Label>سعر الساعة</Label><Input type="number" min="0" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} /></div>
          <div className="space-y-2"><Label>نوع الراتب</Label>
            <Select value={salaryType} onValueChange={setSalaryType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">شهري</SelectItem>
                <SelectItem value="daily">يومي</SelectItem>
                <SelectItem value="hourly">بالساعة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>ساعات العمل اليومية</Label>
            <Input type="number" min="1" max="24" step="0.5" value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} />
          </div>
          <div className="space-y-2"><Label>أيام العمل الشهرية</Label>
            <Input type="number" min="1" max="31" value={workingDays} onChange={(e) => setWorkingDays(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>الراتب اليومي (تلقائي)</Label>
            <Input value={autoDaily.toFixed(2)} readOnly className="bg-muted/50 num" />
          </div>
          <div className="space-y-2">
            <Label>الراتب بالساعة (تلقائي)</Label>
            <Input value={autoHourly.toFixed(2)} readOnly className="bg-muted/50 num" />
          </div>
          <div className="space-y-2"><Label>البنك</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
          <div className="space-y-2"><Label>رقم الحساب</Label><Input dir="ltr" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} /></div>
          <div className="space-y-2"><Label>اتصال للطوارئ</Label><Input dir="ltr" value={emergency} onChange={(e) => setEmergency(e.target.value)} /></div>
          <div className="space-y-2"><Label>الحالة</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="suspended">موقوف</SelectItem>
                <SelectItem value="terminated">منتهي</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2"><Label>جدول العمل (وصف مختصر)</Label>
          <Textarea value={workSchedule} onChange={(e) => setWorkSchedule(e.target.value)} rows={2} placeholder="مثال: السبت - الخميس، 9 صباحاً - 5 مساءً" />
        </div>
        <div className="space-y-2"><Label>ملاحظات</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}