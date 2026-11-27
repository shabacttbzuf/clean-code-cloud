import { useEffect } from "react";
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

/** Displays a published campaign only when its managed ad space is active and in scope. */
export function AdPlacement({ placement, variant = "card" }: {
  placement: PlacementKey;
  variant?: "banner" | "card";
}) {
  const { tenantId, userId, membership, role, isSuperOwner } = useActiveTenant();
  const isTenantOwner = role === "owner" && !membership?.company_id;
  const branchId = membership?.branch_id ?? null;

  const adQuery = useQuery({
    queryKey: ["published-ad-placement", tenantId, userId, membership?.company_id, branchId, placement],
    queryFn: async (): Promise<Campaign | null> => {
      if (!tenantId) return null;

      let spacesQuery = supabase.from("marketing_ad_spaces")
        .select("id,company_id,branch_id")
        .eq("tenant_id", tenantId)
        .eq("space_key", placement)
        .eq("is_active", true)
        .order("sort_order");
      if (membership?.company_id) spacesQuery = spacesQuery.eq("company_id", membership.company_id);
      else if (!isSuperOwner && !isTenantOwner) spacesQuery = spacesQuery.is("company_id", null);
      if (branchId) spacesQuery = spacesQuery.or(`branch_id.is.null,branch_id.eq.${branchId}`);
      else spacesQuery = spacesQuery.is("branch_id", null);

      const { data: spaces, error: spacesError } = await spacesQuery.limit(10);
      if (spacesError) throw spacesError;
      const space = (spaces ?? []).find((item) => item.branch_id === null || item.branch_id === branchId);
      if (!space) return null;

      let campaignsQuery = supabase.from("marketing_campaigns")
        .select("id,title,description,image_url,target_url,starts_at,ends_at,branch_id,target_branch_ids")
        .eq("tenant_id", tenantId)
        .eq("advertising_space_id", space.id)
        .eq("placement", placement)
        .eq("status", "active")
        .order("sort_order")
        .order("created_at", { ascending: false })
        .limit(12);
      if (membership?.company_id) campaignsQuery = campaignsQuery.eq("company_id", membership.company_id);
      else if (!isSuperOwner && !isTenantOwner) campaignsQuery = campaignsQuery.is("company_id", null);
      if (branchId) campaignsQuery = campaignsQuery.or(`branch_id.is.null,branch_id.eq.${branchId}`);
      else campaignsQuery = campaignsQuery.is("branch_id", null);

      const { data, error } = await campaignsQuery;
      if (error) throw error;
      const now = Date.now();
      return ((data ?? []) as Campaign[]).find((campaign) => {
        if (campaign.starts_at && new Date(campaign.starts_at).getTime() > now) return false;
        if (campaign.ends_at && new Date(campaign.ends_at).getTime() <= now) return false;
        const targets = campaign.target_branch_ids ?? [];
        return targets.length === 0 || (!!branchId && targets.includes(branchId));
      }) ?? null;
    },
    enabled: !!tenantId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const campaign = adQuery.data;
  useEffect(() => {
    if (!campaign?.id) return;
    void (async () => {
      try {
        const { error } = await (supabase.rpc as any)("record_marketing_campaign_event", {
          _campaign_id: campaign.id,
          _event_type: "impression",
        });
        if (error) console.warn("Ad placement impression tracking failed", error);
      } catch (error) {
        console.warn("Ad placement impression tracking failed", error);
      }
    })();
  }, [campaign?.id]);

  if (!campaign) return null;
  const target = safeTarget(campaign.target_url);
  const trackClick = () => {
    if (!campaign.id) return;
    void (async () => {
      try {
        await (supabase.rpc as any)("record_marketing_campaign_event", {
          _campaign_id: campaign.id,
          _event_type: "click",
        });
      } catch (error) {
        console.warn("Ad placement click tracking failed", error);
      }
    })();
  };

  return (
    <section aria-label="إعلان" className={variant === "banner"
      ? "relative overflow-hidden rounded-2xl border bg-card shadow-sm"
      : "relative overflow-hidden rounded-xl border bg-card shadow-sm"}>
      {campaign.image_url ? <img src={campaign.image_url} alt="" loading="lazy"
        className={variant === "banner" ? "absolute inset-0 h-full w-full object-cover opacity-25" : "h-32 w-full object-cover"} /> : null}
      <div className={variant === "banner"
        ? "relative flex min-h-32 items-center bg-gradient-to-l from-background/95 via-background/85 to-background/45 p-4 sm:p-6"
        : "relative space-y-2 bg-background/85 p-4"}>
        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-primary">إعلان</span>
          <h3 className="font-bold">{campaign.title}</h3>
          {campaign.description ? <p className="text-sm text-muted-foreground">{campaign.description}</p> : null}
          {target ? <a href={target} target="_blank" rel="noopener noreferrer" onClick={trackClick}
            className="inline-flex min-h-8 items-center rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90">عرض التفاصيل ←</a> : null}
        </div>
      </div>
    </section>
  );
}
