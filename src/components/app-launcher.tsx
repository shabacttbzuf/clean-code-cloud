import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, LayoutGrid, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { appNavigationGroups } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AppLauncher() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { tenantId, userId } = useActiveTenant();
  const { isSuperOwner } = useSuperOwner();
  const permissions = useQuery({
    queryKey: ["app-launcher-permissions", tenantId, userId],
    queryFn: async () => {
      if (!tenantId) return new Set<string>();
      const { data, error } = await supabase.rpc("get_my_permissions", { _tenant_id: tenantId });
      if (error) throw error;
      return new Set<string>((data ?? []) as string[]);
    },
    enabled: !!tenantId && !!userId && !isSuperOwner,
    staleTime: 30_000,
  });
  const groups = useMemo(() => appNavigationGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      (isSuperOwner || (!!permissions.data && (!item.permission || permissions.data.has(item.permission)))) &&
      (item.title.toLocaleLowerCase("ar").includes(search.trim().toLocaleLowerCase("ar")) || group.label.includes(search.trim()))
    ),
  })).filter((group) => group.items.length), [isSuperOwner, permissions.data, search]);

  return (
    <div className="relative">
      <Button type="button" variant="outline" size="sm" className="gap-2 border-primary/20" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <LayoutGrid className="h-4 w-4" />
        <span className="hidden sm:inline">التطبيقات</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,420px)] rounded-2xl border bg-popover p-3 text-popover-foreground shadow-xl" dir="rtl">
          <div className="mb-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن تطبيق..." aria-label="البحث عن تطبيق" />
          </div>
          {permissions.isError ? <p role="alert" className="p-3 text-sm text-destructive">تعذر تحميل صلاحيات التطبيقات.</p> :
            permissions.isLoading && !isSuperOwner ? <p className="p-3 text-sm text-muted-foreground">جارٍ التحقق من الصلاحيات...</p> :
            groups.length ? groups.map((group) => (
              <section key={group.label} className="mb-3 last:mb-0">
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{group.label}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {group.items.map((item) => (
                    <Link key={item.url} to={item.url as any} onClick={() => setOpen(false)} className="flex min-h-16 items-center gap-2 rounded-xl border bg-card p-2 text-sm transition hover:border-primary/40 hover:bg-primary/5">
                      <item.icon className="h-4 w-4 shrink-0 text-primary" />
                      <span>{item.title}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )) : <p className="p-4 text-center text-sm text-muted-foreground">لا توجد تطبيقات مطابقة أو متاحة.</p>}
        </div>
      )}
    </div>
  );
}
