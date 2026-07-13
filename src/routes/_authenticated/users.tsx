import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Plus,
  Users as UsersIcon,
  MoreVertical,
  Key,
  UserX,
  UserCheck,
  ArrowLeftRight,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  createUser,
  updateUserPassword,
  toggleUserStatus,
  changeUserRole,
  transferUserToBranch,
} from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

const ROLES = [
  { value: "owner", label: "المالك" },
  { value: "manager", label: "المدير" },
  { value: "accountant", label: "المحاسب" },
  { value: "cashier", label: "الكاشير" },
  { value: "warehouse", label: "المخزن" },
  { value: "waiter", label: "النادل" },
  { value: "kitchen", label: "المطبخ" },
] as const;

const roleColors: Record<string, string> = {
  owner: "bg-primary/15 text-primary",
  manager: "bg-accent/25 text-accent-foreground",
  accountant: "bg-chart-3/15 text-chart-3",
  cashier: "bg-chart-2/15 text-chart-2",
  warehouse: "bg-chart-4/15 text-chart-4",
  waiter: "bg-chart-5/15 text-chart-5",
  kitchen: "bg-muted text-foreground",
};

type Row = {
  role_id: string;
  user_id: string;
  role: string;
  branch_id: string | null;
  full_name: string | null;
  username: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
};

function UsersPage() {
  const { tenantId, isAdmin, userId } = useActiveTenant();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [pwdUser, setPwdUser] = useState<Row | null>(null);
  const [roleUser, setRoleUser] = useState<Row | null>(null);
  const [transferUser, setTransferUser] = useState<Row | null>(null);

  const { data: branches } = useQuery({
    queryKey: ["branches-lite", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .order("name");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["team-full", tenantId],
    queryFn: async (): Promise<Row[]> => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role, branch_id")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, username, phone, avatar_url, is_active, last_login_at")
        .in("id", ids);
      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (roles ?? []).map((r) => {
        const p = map.get(r.user_id);
        return {
          role_id: r.id,
          user_id: r.user_id,
          role: r.role,
          branch_id: r.branch_id,
          full_name: p?.full_name ?? null,
          username: p?.username ?? null,
          phone: p?.phone ?? null,
          avatar_url: p?.avatar_url ?? null,
          is_active: p?.is_active ?? true,
          last_login_at: p?.last_login_at ?? null,
        };
      });
    },
    enabled: !!tenantId,
  });

  const branchName = useMemo(() => {
    const m = new Map((branches ?? []).map((b) => [b.id, b.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "بدون فرع");
  }, [branches]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الموظفون"
        subtitle="إدارة كاملة لفريق مطعمك: إضافة، صلاحيات، تفعيل، ونقل بين الفروع."
        action={
          isAdmin ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="ml-2 h-4 w-4" />
              إضافة موظف
            </Button>
          ) : null
        }
      />

      {!isAdmin && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-center gap-3 py-3 text-sm">
            <Shield className="h-4 w-4 text-warning" />
            <span>عرض للقراءة فقط. لإضافة/تعديل الموظفين تحتاج صلاحية مالك أو مدير.</span>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (rows ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <UsersIcon className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">لا يوجد موظفون بعد</p>
            {isAdmin && (
              <Button variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus className="ml-2 h-4 w-4" />
                إضافة أول موظف
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(rows ?? []).map((r) => {
            const isSelf = r.user_id === userId;
            return (
              <Card key={r.role_id} className={!r.is_active ? "opacity-60" : ""}>
                <CardContent className="flex items-start gap-3 p-4">
                  <Avatar className="h-12 w-12">
                    {r.avatar_url && <AvatarImage src={r.avatar_url} alt={r.full_name ?? ""} />}
                    <AvatarFallback>{(r.full_name ?? "?").charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {r.full_name || "—"}
                          {isSelf && <span className="mr-2 text-xs text-muted-foreground">(أنت)</span>}
                        </div>
                        {r.username && (
                          <div className="truncate text-xs text-muted-foreground">@{r.username}</div>
                        )}
                        {r.phone && (
                          <div className="text-xs text-muted-foreground" dir="ltr">
                            {r.phone}
                          </div>
                        )}
                      </div>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setRoleUser(r)}>
                              <Shield className="ml-2 h-4 w-4" />
                              تغيير الدور
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTransferUser(r)}>
                              <ArrowLeftRight className="ml-2 h-4 w-4" />
                              نقل إلى فرع
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPwdUser(r)}>
                              <Key className="ml-2 h-4 w-4" />
                              تغيير كلمة المرور
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={isSelf}
                              onClick={() => toggleStatus(r, !r.is_active, tenantId!, qc)}
                            >
                              {r.is_active ? (
                                <>
                                  <UserX className="ml-2 h-4 w-4" />
                                  إيقاف الحساب
                                </>
                              ) : (
                                <>
                                  <UserCheck className="ml-2 h-4 w-4" />
                                  تفعيل الحساب
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${roleColors[r.role] ?? "bg-muted"}`}
                      >
                        {ROLES.find((x) => x.value === r.role)?.label ?? r.role}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                        {branchName(r.branch_id)}
                      </span>
                      {!r.is_active && (
                        <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] text-destructive">
                          موقوف
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 text-[11px] text-muted-foreground">
                      {r.last_login_at
                        ? `آخر دخول: ${new Date(r.last_login_at).toLocaleString("ar-EG")}`
                        : "لم يسجّل الدخول بعد"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={tenantId}
        branches={branches ?? []}
      />
      <PasswordDialog user={pwdUser} onClose={() => setPwdUser(null)} tenantId={tenantId} />
      <RoleDialog
        user={roleUser}
        onClose={() => setRoleUser(null)}
        tenantId={tenantId}
        branches={branches ?? []}
      />
      <TransferDialog
        user={transferUser}
        onClose={() => setTransferUser(null)}
        tenantId={tenantId}
        branches={branches ?? []}
      />
    </div>
  );
}

async function toggleStatus(row: Row, active: boolean, tenantId: string, qc: ReturnType<typeof useQueryClient>) {
  try {
    await toggleUserStatus({
      data: { user_id: row.user_id, tenant_id: tenantId, is_active: active },
    });
    toast.success(active ? "تم تفعيل الحساب" : "تم إيقاف الحساب");
    qc.invalidateQueries({ queryKey: ["team-full", tenantId] });
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "فشل التحديث");
  }
}

function CreateUserDialog({
  open,
  onOpenChange,
  tenantId,
  branches,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string | null;
  branches: Array<{ id: string; name: string }>;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createUser);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    username: "",
    phone: "",
    role: "cashier" as (typeof ROLES)[number]["value"],
    branch_id: "none",
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("لا يوجد مطعم نشط");
      return createFn({
        data: {
          tenant_id: tenantId,
          email: form.email.trim(),
          password: form.password,
          full_name: form.full_name.trim(),
          username: form.username.trim() || null,
          phone: form.phone.trim() || null,
          role: form.role,
          branch_id: form.branch_id === "none" ? null : form.branch_id,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم إنشاء الموظف بنجاح");
      qc.invalidateQueries({ queryKey: ["team-full", tenantId] });
      onOpenChange(false);
      setForm({
        email: "",
        password: "",
        full_name: "",
        username: "",
        phone: "",
        role: "cashier",
        branch_id: "none",
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل الإنشاء"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة موظف جديد</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>الاسم الكامل *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <Label>اسم المستخدم</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>البريد الإلكتروني *</Label>
              <Input type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>الهاتف</Label>
              <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>كلمة المرور * (6+ أحرف)</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>الدور</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الفرع</Label>
              <Select value={form.branch_id} onValueChange={(v) => setForm({ ...form, branch_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون فرع محدد</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.email || !form.password || !form.full_name}
          >
            {mut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            إنشاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({
  user,
  onClose,
  tenantId,
}: {
  user: Row | null;
  onClose: () => void;
  tenantId: string | null;
}) {
  const [pwd, setPwd] = useState("");
  const updateFn = useServerFn(updateUserPassword);
  const mut = useMutation({
    mutationFn: async () => {
      if (!user || !tenantId) return;
      return updateFn({ data: { user_id: user.user_id, new_password: pwd, tenant_id: tenantId } });
    },
    onSuccess: () => {
      toast.success("تم تغيير كلمة المرور");
      setPwd("");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل التغيير"),
  });
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تغيير كلمة مرور {user?.full_name}</DialogTitle>
        </DialogHeader>
        <div>
          <Label>كلمة المرور الجديدة (6+ أحرف)</Label>
          <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || pwd.length < 6}>
            {mut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({
  user,
  onClose,
  tenantId,
  branches,
}: {
  user: Row | null;
  onClose: () => void;
  tenantId: string | null;
  branches: Array<{ id: string; name: string }>;
}) {
  const qc = useQueryClient();
  const [role, setRole] = useState<string>("cashier");
  const [branchId, setBranchId] = useState<string>("none");
  const changeFn = useServerFn(changeUserRole);
  const mut = useMutation({
    mutationFn: async () => {
      if (!user || !tenantId) return;
      return changeFn({
        data: {
          user_id: user.user_id,
          tenant_id: tenantId,
          role: role as any,
          branch_id: branchId === "none" ? null : branchId,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم تحديث الدور");
      qc.invalidateQueries({ queryKey: ["team-full", tenantId] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل التحديث"),
  });
  return (
    <Dialog
      open={!!user}
      onOpenChange={(o) => {
        if (!o) onClose();
        else if (user) {
          setRole(user.role);
          setBranchId(user.branch_id ?? "none");
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تغيير دور {user?.full_name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>الدور</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الفرع</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون فرع محدد</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({
  user,
  onClose,
  tenantId,
  branches,
}: {
  user: Row | null;
  onClose: () => void;
  tenantId: string | null;
  branches: Array<{ id: string; name: string }>;
}) {
  const qc = useQueryClient();
  const [branchId, setBranchId] = useState<string>("none");
  const transferFn = useServerFn(transferUserToBranch);
  const mut = useMutation({
    mutationFn: async () => {
      if (!user || !tenantId) return;
      return transferFn({
        data: {
          user_role_id: user.role_id,
          tenant_id: tenantId,
          branch_id: branchId === "none" ? null : branchId,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم نقل الموظف");
      qc.invalidateQueries({ queryKey: ["team-full", tenantId] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل النقل"),
  });
  return (
    <Dialog
      open={!!user}
      onOpenChange={(o) => {
        if (!o) onClose();
        else if (user) setBranchId(user.branch_id ?? "none");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>نقل {user?.full_name} إلى فرع</DialogTitle>
        </DialogHeader>
        <div>
          <Label>الفرع الهدف</Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون فرع محدد</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            نقل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
