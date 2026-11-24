import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";

type PlacementKey = "welcome" | "main" | "sidebar" | "offers" | "in_page" | "dashboard_banner" | "dashboard_card" | "pos_promo";

type Campaign = {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  target_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  target_branch_ids: string[];
};

function safeTarget(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Renders a published ad only when its independently managed placement is enabled. */
export function AdPlacement({ placement, variant = "card" }: {
  placement: PlacementKey;
  variant?: "banner" | "card";
}) {
  const { tenantId, membership, role, isSuperOwner } = useActiveTenant();
  const isTenantOwner = role === "owner" && !membership?.company_id;

  const ad = useQuery({
    queryKey: ["published-ad-placement", tenantId, membership?.company_id, membership?.branch_id, placement],
    queryFn: async (): Promise<Campaign | null> => {
      if (!tenantId) return null;

      let slotQuery = (supabase.from("marketing_ad_placements" as any) as any)
        .select("is_enabled")
        .eq("tenant_id", tenantId)
        .eq("placement_key", placement);
      if (membership?.company_id) slotQuery = slotQuery.eq("company_id", membership.company_id);
      else slotQuery = slotQuery.is("company_id", null);
      const { data: slot, error: slotError } = await slotQuery.maybeSingle();
      if (slotError) throw slotError;
      if (!slot?.is_enabled) return null;

      let query = supabase.from("marketing_campaigns")
        .select("id,title,description,image_url,target_url,starts_at,ends_at,target_branch_ids")
        .eq("tenant_id", tenantId)
        .eq("placement", placement)
        .eq("status", "active")
        .order("sort_order")
        .limit(12);
      if (membership?.company_id) query = query.eq("company_id", membership.company_id);
      else if (!isSuperOwner && !isTenantOwner) query = query.is("company_id", null);

      const { data, error } = await query;
      if (error) throw error;
      const now = Date.now();
      const candidates = (data ?? []) as Campaign[];
      return candidates.find((campaign) => {
        if (campaign.starts_at && new Date(campaign.starts_at).getTime() > now) return false;
        if (campaign.ends_at && new Date(campaign.ends_at).getTime() <= now) return false;
        const targets = campaign.target_branch_ids ?? [];
        if (targets.length === 0) return true;
        return !!membership?.branch_id && targets.includes(membership.branch_id);
      }) ?? null;
    },
    enabled: !!tenantId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const campaign = ad.data;
  if (!campaign) return null;
  const target = safeTarget(campaign.target_url);

  return (
    <section aria-label="إعلان" className={variant === "banner"
      ? "relative overflow-hidden rounded-2xl border bg-card shadow-sm"
      : "relative overflow-hidden rounded-xl border bg-card shadow-sm"}>
      {campaign.image_url ? (
        <img src={campaign.image_url} alt="" loading="lazy"
          className={variant === "banner" ? "absolute inset-0 h-full w-full object-cover opacity-25" : "h-32 w-full object-cover"} />
      ) : null}
      <div className={variant === "banner"
        ? "relative flex min-h-32 items-center bg-gradient-to-l from-background/95 via-background/85 to-background/45 p-4 sm:p-6"
        : "relative space-y-2 bg-background/85 p-4"}>
        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-primary">إعلان</span>
          <h3 className="font-bold">{campaign.title}</h3>
          {campaign.description ? <p className="text-sm text-muted-foreground">{campaign.description}</p> : null}
          {target ? <a href={target} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-8 items-center rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90">عرض التفاصيل ←</a> : null}
        </div>
      </div>
    </section>
  );
}
