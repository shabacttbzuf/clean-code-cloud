import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
  bootstrapSuperOwner,
  grantSuperOwner,
  revokeSuperOwner,
  toggleRolePermission,
} from "@/lib/super-owner.functions";
import { seedDemoData } from "@/lib/demo-data.functions";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Crown, Loader2, ShieldAlert, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

// ---------- permissions catalog ----------
type Permission = { key: string; label_ar: string; category: string };
type RolePerm = { builtin_role: string | null; permission_key: string; tenant_id: string | null };

const BUILTIN_ROLES = [
  { key: "owner", label: "المالك" },
  { key: "manager", label: "المدير" },
  { key: "cashier", label: "الكاشير" },
  { key: "accountant", label: "المحاسب" },
  { key: "warehouse", label: "المخزن" },
  { key: "waiter", label: "النادل" },
  { key: "kitchen", label: "المطبخ" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  branches: "الفروع",
  users: "المستخدمون",
  catalog: "الكتالوج",
  sales: "المبيعات",
  inventory: "المخزون",
  crm: "العملاء",
  finance: "المالية",
  reports: "التقارير",
  system: "النظام",
  operations: "العمليات",
};

const permissionsQO = {
  queryKey: ["permissions-catalog"] as const,
  queryFn: async (): Promise<Permission[]> => {
    const { data, error } = await supabase
      .from("permissions")
      .select("key, label_ar, category")
      .order("category")
      .order("key");
    if (error) throw error;
    return data ?? [];
  },
};

const rolePermsQO = {
  queryKey: ["role-permissions-global"] as const,
  queryFn: async (): Promise<RolePerm[]> => {
    const { data, error } = await supabase
      .from("role_permissions")
      .select("builtin_role, permission_key, tenant_id")
      .is("tenant_id", null)
      .eq("role_kind", "builtin");
    if (error) throw error;
    return (data ?? []) as RolePerm[];
  },
};

function AdminPage() {
  const { isSuperOwner, totalCount, loading, refetch } = useSuperOwner();

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة إدارة النظام"
        subtitle="المالك الرئيسي والأدوار والصلاحيات."
      />

      {totalCount === 0 && <BootstrapCard onDone={refetch} />}

      {!isSuperOwner && totalCount > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-center gap-3 py-4 text-sm">
            <ShieldAlert className="h-5 w-5 text-warning shrink-0" />
            <span>هذه الصفحة متاحة للمالك الرئيسي فقط. راجع مالك النظام لطلب الصلاحية.</span>
          </CardContent>
        </Card>
      )}

      {isSuperOwner && (
        <Tabs defaultValue="super-owners">
          <TabsList>
            <TabsTrigger value="super-owners">المالك الرئيسي</TabsTrigger>
            <TabsTrigger value="roles">الأدوار والصلاحيات</TabsTrigger>
            <TabsTrigger value="demo">بيانات تجريبية</TabsTrigger>
          </TabsList>
          <TabsContent value="super-owners" className="mt-4">
            <SuperOwnersTab />
          </TabsContent>
          <TabsContent value="roles" className="mt-4">
            <RolesTab />
          </TabsContent>
          <TabsContent value="demo" className="mt-4">
            <DemoDataTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ============================================================
// Demo data tab (Phase 5)
// ============================================================
function DemoDataTab() {
  const { tenantId, tenant } = useActiveTenant();
  const seed = useServerFn(seedDemoData);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => seed({ data: { tenant_id: tenantId! } }),
    onSuccess: (res: { stats: Record<string, number> }) => {
      const s = res.stats;
      toast.success(`تم إدخال: ${s.branches} فرع، ${s.categories} قسم، ${s.products} منتج، ${s.customers} عميل، ${s.suppliers} مورد`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>بيانات تجريبية للمطعم الحالي</CardTitle>
        <CardDescription>
          يُضيف فروعاً وأقساماً ومنتجات وعملاء وموردين إلى المطعم <b>{tenant?.name}</b>.
          العملية آمنة ولا تكرّر البيانات الموجودة.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => mut.mutate()} disabled={!tenantId || mut.isPending}>
          {mut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          إدخال البيانات التجريبية
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Bootstrap
// ============================================================
function BootstrapCard({ onDone }: { onDone: () => void }) {
  const { user } = useAuthSession();
  const bootstrap = useServerFn(bootstrapSuperOwner);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => bootstrap(),
    onSuccess: () => {
      toast.success("تم تعيينك كمالك رئيسي للنظام");
      qc.invalidateQueries({ queryKey: ["super-owner-status"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <div className="flex items-start gap-3">
          <Crown className="h-6 w-6 text-primary" />
          <div>
            <CardTitle>تعيين المالك الرئيسي</CardTitle>
            <CardDescription>
              لا يوجد مالك رئيسي معيَّن للنظام بعد. اضغط الزر لتعيين نفسك ({user?.email}) كمالك رئيسي.
              بعد ذلك لا يمكن لأحد الحصول على هذه الصلاحية إلا منك.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          تعيين نفسي كمالك رئيسي
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Super Owners tab
// ============================================================
function SuperOwnersTab() {
  const { user } = useAuthSession();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const listQuery = useQuery({
    queryKey: ["super-owners-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("super_owners")
        .select("user_id, granted_at, notes")
        .order("granted_at");
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] };
      const map = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      return (data ?? []).map((r) => ({
        ...r,
        full_name: map.get(r.user_id) ?? null,
      }));
    },
  });

  const grantFn = useServerFn(grantSuperOwner);
  const revokeFn = useServerFn(revokeSuperOwner);

  const grantMut = useMutation({
    mutationFn: () => grantFn({ data: { email, notes: notes || undefined } }),
    onSuccess: () => {
      toast.success("تمت الإضافة");
      setEmail("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["super-owners-list"] });
      qc.invalidateQueries({ queryKey: ["super-owner-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: (userId: string) => revokeFn({ data: { user_id: userId } }),
    onSuccess: () => {
      toast.success("تمت الإزالة");
      qc.invalidateQueries({ queryKey: ["super-owners-list"] });
      qc.invalidateQueries({ queryKey: ["super-owner-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>الملّاك الرئيسيون الحاليون</CardTitle>
          <CardDescription>
            صلاحية مطلقة على كل المطاعم والفروع والبيانات.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (listQuery.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا يوجد.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>ملاحظات</TableHead>
                  <TableHead>تاريخ التعيين</TableHead>
                  <TableHead className="text-left">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(listQuery.data ?? []).map((r) => {
                  const isSelf = r.user_id === user?.id;
                  return (
                    <TableRow key={r.user_id}>
                      <TableCell className="font-medium">
                        {r.full_name ?? "—"}
                        {isSelf && <Badge variant="secondary" className="mr-2">أنت</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.notes ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {new Date(r.granted_at).toLocaleDateString("ar-EG")}
                      </TableCell>
                      <TableCell className="text-left">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isSelf || revokeMut.isPending}
                          onClick={() => {
                            if (confirm(`إزالة صلاحية المالك الرئيسي من ${r.full_name ?? r.user_id}؟`)) {
                              revokeMut.mutate(r.user_id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            إضافة مالك رئيسي
          </CardTitle>
          <CardDescription>يجب أن يكون المستخدم مسجّلاً في النظام أولاً.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">ملاحظات (اختياري)</Label>
            <Input
              id="notes"
              placeholder="سبب المنح..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            disabled={!email || grantMut.isPending}
            onClick={() => grantMut.mutate()}
          >
            {grantMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            منح الصلاحية
          </Button>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            المالك الرئيسي يستطيع الوصول لكل بيانات النظام. امنح الصلاحية بحذر.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Roles & Permissions tab
// ============================================================
function RolesTab() {
  const permQuery = useQuery(permissionsQO);
  const rpQuery = useQuery(rolePermsQO);
  const qc = useQueryClient();
  const toggleFn = useServerFn(toggleRolePermission);

  const permissions = permQuery.data ?? [];
  const rolePerms = rpQuery.data ?? [];

  const grouped = useMemo(() => {
    const g = new Map<string, Permission[]>();
    for (const p of permissions) {
      if (!g.has(p.category)) g.set(p.category, []);
      g.get(p.category)!.push(p);
    }
    return Array.from(g.entries());
  }, [permissions]);

  const permSet = useMemo(() => {
    const s = new Set<string>();
    for (const rp of rolePerms) s.add(`${rp.builtin_role}::${rp.permission_key}`);
    return s;
  }, [rolePerms]);

  const toggleMut = useMutation({
    mutationFn: (v: { role: string; permission_key: string; enabled: boolean }) =>
      toggleFn({ data: v as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-permissions-global"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (permQuery.isLoading || rpQuery.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>مصفوفة الصلاحيات</CardTitle>
        <CardDescription>
          صلاحيات افتراضية لكل دور مدمج. التعديل يسري على كل المطاعم.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px]">الصلاحية</TableHead>
              {BUILTIN_ROLES.map((r) => (
                <TableHead key={r.key} className="text-center">{r.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.map(([cat, perms]) => (
              <Fragment key={cat}>
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={1 + BUILTIN_ROLES.length} className="text-xs font-semibold">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </TableCell>
                </TableRow>
                {perms.map((p) => (
                  <TableRow key={p.key}>
                    <TableCell>
                      <div className="text-sm">{p.label_ar}</div>
                      <div className="text-[10px] text-muted-foreground" dir="ltr">{p.key}</div>
                    </TableCell>
                    {BUILTIN_ROLES.map((r) => {
                      const enabled = permSet.has(`${r.key}::${p.key}`);
                      return (
                        <TableCell key={r.key} className="text-center">
                          <Checkbox
                            checked={enabled}
                            disabled={toggleMut.isPending}
                            onCheckedChange={(v) =>
                              toggleMut.mutate({
                                role: r.key,
                                permission_key: p.key,
                                enabled: !!v,
                              })
                            }
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

