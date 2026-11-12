import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useSuperOwner } from "@/hooks/use-super-owner";
import {
  setUserStatus,
  approveUser,
  forcePasswordReset,
  updateUserEnterpriseProfile,
} from "@/lib/enterprise.functions";
import { changeUserRole, transferUserToBranch, updateUserPassword } from "@/lib/users.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Search, ShieldAlert, KeyRound, UserCheck, Ban, Snowflake, Archive } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/users-admin")({
  component: UsersAdminPage,
});

type EnterpriseUser = {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  employee_no: string | null;
  national_id: string | null;
  job_title: string | null;
  department_id: string | null;
  company_id: string | null;
  employment_date: string | null;
  status: string;
  last_login_at: string | null;
  last_ip: string | null;
  last_device: string | null;
  created_at: string;
  branch_id: string | null;
  tenant_id: string | null;
  role?: string | null;
  custom_role_id?: string | null;
  custom_role_name?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  suspended: "معلّق",
  frozen: "مجمّد",
  pending_approval: "بانتظار الاعتماد",
  password_expired: "كلمة السر منتهية",
  archived: "مؤرشف",
};

function UsersAdminPage() {
  const { tenantId, role, loading } = useActiveTenant();
  const { isSuperOwner } = useSuperOwner();
  const qc = useQueryClient();

  const canAccess = role === "owner" || role === "manager" || isSuperOwner;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editing, setEditing] = useState<EnterpriseUser | null>(null);

  const setStatusFn = useServerFn(setUserStatus);
  const approveFn = useServerFn(approveUser);
  const forceResetFn = useServerFn(forcePasswordReset);
  const updateProfileFn = useServerFn(updateUserEnterpriseProfile);
  const changeRoleFn = useServerFn(changeUserRole);
  const transferBranchFn = useServerFn(transferUserToBranch);
  const setPwdFn = useServerFn(updateUserPassword);

  const usersQ = useQuery({
    queryKey: ["users-admin", tenantId],
    queryFn: async () => {
      if (!tenantId) return [] as EnterpriseUser[];
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role, branch_id, custom_role_id")
        .eq("tenant_id", tenantId);
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select(
          "id, full_name, username, email, phone, avatar_url, employee_no, national_id, job_title, department_id, company_id, employment_date, status, last_login_at, last_ip, last_device, created_at, branch_id, tenant_id",
        )
        .in("id", ids);
      const customIds = Array.from(new Set((roles ?? []).map((r) => r.custom_role_id).filter(Boolean))) as string[];
      const { data: customRoles, error: customRolesError } = customIds.length
        ? await supabase.from("custom_roles").select("id, name").eq("tenant_id", tenantId).in("id", customIds)
        : { data: [], error: null };
      if (customRolesError) throw customRolesError;
      const customMap = new Map((customRoles ?? []).map((r) => [r.id, r.name] as const));
      const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r] as const));
      return (profiles ?? []).map((p) => {
        const assignment = roleMap.get(p.id);
        return { ...p, role: assignment?.role ?? null, custom_role_id: assignment?.custom_role_id ?? null,
          custom_role_name: assignment?.custom_role_id ? customMap.get(assignment.custom_role_id) ?? "دور مخصص" : null };
      }) as EnterpriseUser[];
    },
    enabled: !!tenantId && canAccess,
  });

  const customRolesQ = useQuery({
    queryKey: ["custom-roles", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("custom_roles").select("id, name").eq("tenant_id", tenantId!).order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && canAccess,
  });

  const branchesQ = useQuery({
    queryKey: ["branches", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("tenant_id", tenantId!);
      return data ?? [];
    },
    enabled: !!tenantId && canAccess,
  });

  const departmentsQ = useQuery({
    queryKey: ["departments", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .order("name");
      return data ?? [];
    },
    enabled: !!tenantId && canAccess,
  });

  const companiesQ = useQuery({
    queryKey: ["companies", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .order("name");
      return data ?? [];
    },
    enabled: !!tenantId && canAccess,
  });

  const filtered = useMemo(() => {
    const list = usersQ.data ?? [];
    return list.filter((u) => {
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const s = search.trim().toLowerCase();
      return (
        (u.full_name ?? "").toLowerCase().includes(s) ||
        (u.email ?? "").toLowerCase().includes(s) ||
        (u.employee_no ?? "").toLowerCase().includes(s) ||
        (u.username ?? "").toLowerCase().includes(s) ||
        (u.phone ?? "").toLowerCase().includes(s)
      );
    });
  }, [usersQ.data, search, statusFilter]);

  const doStatus = useMutation({
    mutationFn: (v: { user_id: string; status: string }) =>
      setStatusFn({ data: { user_id: v.user_id, tenant_id: tenantId!, status: v.status as any } }),
    onSuccess: () => {
      toast.success("تم تحديث الحالة");
      qc.invalidateQueries({ queryKey: ["users-admin", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doApprove = useMutation({
    mutationFn: (user_id: string) => approveFn({ data: { user_id, tenant_id: tenantId! } }),
    onSuccess: () => {
      toast.success("تم اعتماد المستخدم");
      qc.invalidateQueries({ queryKey: ["users-admin", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doForceReset = useMutation({
    mutationFn: (user_id: string) => forceResetFn({ data: { user_id, tenant_id: tenantId! } }),
    onSuccess: () => toast.success("سيُطلب من المستخدم تغيير كلمة المرور"),
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <PageHeader title="إدارة المستخدمين" />
        <Card>
          <CardContent className="flex items-center gap-3 p-8 text-muted-foreground">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            هذه الصفحة متاحة للمالك أو المدير فقط.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة المستخدمين (مؤسسات)"
        subtitle="بحث وتصفية شاملة، تعديل بيانات، تغيير حالة، إعادة تعيين كلمة السر."
      />

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pr-9"
                placeholder="ابحث بالاسم / الإيميل / الرقم الوظيفي..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {usersQ.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستخدم</TableHead>
                    <TableHead>الدور</TableHead>
                    <TableHead>الرقم الوظيفي</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>آخر دخول</TableHead>
                    <TableHead>الجهاز</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            {u.avatar_url && <AvatarImage src={u.avatar_url} alt={u.full_name ?? ""} />}
                            <AvatarFallback>{(u.full_name ?? "?").charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="text-sm font-medium">{u.full_name?.trim() || u.username?.trim() || "مستخدم"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{u.custom_role_name ?? u.role ?? "—"}</Badge>
                      </TableCell>
                      <TableCell dir="ltr">{u.employee_no ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={u.status === "active" ? "default" : "secondary"}>
                          {STATUS_LABEL[u.status] ?? u.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleString("ar-EG") : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{u.last_device ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                            تعديل
                          </Button>
                          {u.status === "pending_approval" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => doApprove.mutate(u.id)}
                              disabled={doApprove.isPending}
                            >
                              <UserCheck className="ml-1 h-3 w-3" /> اعتماد
                            </Button>
                          )}
                          {u.status !== "suspended" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => doStatus.mutate({ user_id: u.id, status: "suspended" })}
                            >
                              <Ban className="ml-1 h-3 w-3" /> تعليق
                            </Button>
                          )}
                          {u.status !== "frozen" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => doStatus.mutate({ user_id: u.id, status: "frozen" })}
                            >
                              <Snowflake className="ml-1 h-3 w-3" /> تجميد
                            </Button>
                          )}
                          {u.status !== "archived" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => doStatus.mutate({ user_id: u.id, status: "archived" })}
                            >
                              <Archive className="ml-1 h-3 w-3" /> أرشفة
                            </Button>
                          )}
                          {u.status !== "active" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => doStatus.mutate({ user_id: u.id, status: "active" })}
                            >
                              تفعيل
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => doForceReset.mutate(u.id)}
                          >
                            <KeyRound className="ml-1 h-3 w-3" /> إجبار تغيير كلمة السر
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        لا توجد نتائج.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <EditUserDialog
          user={editing}
          tenantId={tenantId!}
          branches={branchesQ.data ?? []}
          departments={departmentsQ.data ?? []}
          companies={companiesQ.data ?? []}
          customRoles={customRolesQ.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["users-admin", tenantId] });
            setEditing(null);
          }}
          updateProfileFn={updateProfileFn}
          changeRoleFn={changeRoleFn}
          transferBranchFn={transferBranchFn}
          setPwdFn={setPwdFn}
        />
      )}
    </div>
  );
}

function EditUserDialog(props: {
  user: EnterpriseUser;
  tenantId: string;
  branches: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  customRoles: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  updateProfileFn: ReturnType<typeof useServerFn<typeof updateUserEnterpriseProfile>>;
  changeRoleFn: ReturnType<typeof useServerFn<typeof changeUserRole>>;
  transferBranchFn: ReturnType<typeof useServerFn<typeof transferUserToBranch>>;
  setPwdFn: ReturnType<typeof useServerFn<typeof updateUserPassword>>;
}) {
  const { user, tenantId, branches, departments, companies, customRoles } = props;
  const [form, setForm] = useState({
    full_name: user.full_name ?? "",
    phone: user.phone ?? "",
    employee_no: user.employee_no ?? "",
    national_id: user.national_id ?? "",
    job_title: user.job_title ?? "",
    employment_date: user.employment_date ?? "",
    department_id: user.department_id ?? "",
    company_id: user.company_id ?? "",
    branch_id: user.branch_id ?? "",
    role: user.custom_role_id ? "waiter" : user.role ?? "cashier",
    custom_role_id: user.custom_role_id ?? "",
    new_password: "",
  });

  const save = useMutation({
    mutationFn: async () => {
      await props.updateProfileFn({
        data: {
          user_id: user.id,
          tenant_id: tenantId,
          patch: {
            full_name: form.full_name || undefined,
            phone: form.phone || null,
            employee_no: form.employee_no || null,
            national_id: form.national_id || null,
            job_title: form.job_title || null,
            employment_date: form.employment_date || null,
            department_id: form.department_id || null,
            company_id: form.company_id || null,
          },
        },
      });
      if ((form.role && form.role !== user.role) || form.custom_role_id !== (user.custom_role_id ?? "")) {
        await props.changeRoleFn({
          data: {
            user_id: user.id,
            tenant_id: tenantId,
            role: form.role as any,
            custom_role_id: form.custom_role_id || null,
            branch_id: form.branch_id || null,
          },
        });
      }
      if ((form.branch_id || null) !== (user.branch_id || null)) {
        // Look up the current role row to transfer branch
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (roleRow) {
          await props.transferBranchFn({
            data: { user_role_id: roleRow.id, tenant_id: tenantId, branch_id: form.branch_id || null },
          });
        }
      }
      if (form.new_password) {
        await props.setPwdFn({
          data: { user_id: user.id, new_password: form.new_password, tenant_id: tenantId },
        });
      }
    },
    onSuccess: () => {
      toast.success("تم الحفظ");
      props.onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>تعديل بيانات المستخدم</DialogTitle>
          <DialogDescription dir="ltr" className="text-xs">
            {user.email ?? user.id}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="الاسم الكامل" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
          <Field label="الهاتف" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} dir="ltr" />
          <Field label="الرقم الوظيفي" value={form.employee_no} onChange={(v) => setForm({ ...form, employee_no: v })} />
          <Field label="الهوية الوطنية (اختياري)" value={form.national_id} onChange={(v) => setForm({ ...form, national_id: v })} />
          <Field label="المسمى الوظيفي" value={form.job_title} onChange={(v) => setForm({ ...form, job_title: v })} />
          <Field label="تاريخ التوظيف" type="date" value={form.employment_date ?? ""} onChange={(v) => setForm({ ...form, employment_date: v })} />
          <SelectField
            label="القسم"
            value={form.department_id}
            onChange={(v) => setForm({ ...form, department_id: v })}
            options={[{ id: "", name: "—" }, ...departments]}
          />
          <SelectField
            label="الشركة"
            value={form.company_id}
            onChange={(v) => setForm({ ...form, company_id: v })}
            options={[{ id: "", name: "—" }, ...companies]}
          />
          <SelectField
            label="الفرع"
            value={form.branch_id}
            onChange={(v) => setForm({ ...form, branch_id: v })}
            options={[{ id: "", name: "بدون فرع" }, ...branches]}
          />
          <SelectField
            label="الدور"
            value={form.custom_role_id ? `custom:${form.custom_role_id}` : form.role}
            onChange={(v) => v.startsWith("custom:")
              ? setForm({ ...form, role: "waiter", custom_role_id: v.slice(7) })
              : setForm({ ...form, role: v, custom_role_id: "" })}
            options={[
              { id: "owner", name: "owner" },
              { id: "manager", name: "manager" },
              { id: "accountant", name: "accountant" },
              { id: "cashier", name: "cashier" },
              { id: "warehouse", name: "warehouse" },
              { id: "waiter", name: "waiter" },
              { id: "kitchen", name: "kitchen" },
              ...customRoles.map((r) => ({ id: `custom:${r.id}`, name: `مخصص: ${r.name}` })),
            ]}
          />
          <Field
            label="كلمة سر جديدة (اختياري)"
            value={form.new_password}
            onChange={(v) => setForm({ ...form, new_password: v })}
            type="password"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose}>إلغاء</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; type?: string; dir?: string }) {
  return (
    <div>
      <Label>{props.label}</Label>
      <Input
        dir={props.dir}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <div>
      <Label>{props.label}</Label>
      <Select value={props.value || "__none__"} onValueChange={(v) => props.onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((o) => (
            <SelectItem key={o.id || "__none__"} value={o.id || "__none__"}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
