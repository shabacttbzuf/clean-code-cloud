import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { upsertJobTitle, deleteJobTitle } from "@/lib/enterprise.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/job-titles")({ component: JobTitlesPage });

function JobTitlesPage() {
  const { tenantId, role, loading } = useActiveTenant();
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertJobTitle);
  const delFn = useServerFn(deleteJobTitle);
  const [name, setName] = useState("");
  const canAccess = role === "owner" || role === "manager";

  const q = useQuery({
    queryKey: ["job-titles-list", tenantId],
    queryFn: async () =>
      (await supabase.from("job_titles").select("*").eq("tenant_id", tenantId!).order("name")).data ?? [],
    enabled: !!tenantId && canAccess,
  });

  const add = useMutation({
    mutationFn: () => upsertFn({ data: { tenant_id: tenantId!, name: name.trim() } }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["job-titles-list", tenantId] });
      toast.success("تمت الإضافة");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, tenant_id: tenantId! } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-titles-list", tenantId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <Loader2 className="mx-auto my-12 h-6 w-6 animate-spin text-primary" />;
  if (!canAccess)
    return (
      <div className="space-y-6">
        <PageHeader title="المسميات الوظيفية" />
        <Card>
          <CardContent className="flex items-center gap-3 p-8 text-muted-foreground">
            <ShieldAlert className="h-5 w-5 text-destructive" /> غير مصرح.
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader title="المسميات الوظيفية" subtitle="كتالوج المسميات الوظيفية." />
      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex gap-2">
            <Input placeholder="مسمى وظيفي جديد" value={name} onChange={(e) => setName(e.target.value)} />
            <Button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
              <Plus className="ml-2 h-4 w-4" /> إضافة
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {(q.data ?? []).map((j: any) => (
              <div key={j.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{j.name}</span>
                <Button size="icon" variant="ghost" onClick={() => confirm("حذف؟") && del.mutate(j.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
