-- Grant the authenticated app role the minimum table privileges required by the RLS policies.
-- POS credentials remain service-role-only.
BEGIN;

REVOKE ALL ON TABLE public.promotional_offers, public.promotion_redemptions
  FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.promotional_offers
  TO authenticated;
GRANT SELECT ON TABLE public.promotion_redemptions
  TO authenticated;

-- Cover foreign-key lookups reported by Supabase's performance advisor.
CREATE INDEX IF NOT EXISTS idx_pos_access_credentials_user_id_fk
  ON public.pos_access_credentials (user_id);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_branch_id_fk
  ON public.promotion_redemptions (branch_id);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_company_id_fk
  ON public.promotion_redemptions (company_id);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_promotion_id_fk
  ON public.promotion_redemptions (promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_redeemed_by_fk
  ON public.promotion_redemptions (redeemed_by);
CREATE INDEX IF NOT EXISTS idx_promotional_offers_branch_id_fk
  ON public.promotional_offers (branch_id);
CREATE INDEX IF NOT EXISTS idx_promotional_offers_company_id_fk
  ON public.promotional_offers (company_id);
CREATE INDEX IF NOT EXISTS idx_promotional_offers_created_by_fk
  ON public.promotional_offers (created_by);
CREATE INDEX IF NOT EXISTS idx_promotional_offers_reward_product_id_fk
  ON public.promotional_offers (reward_product_id);

COMMIT;
