export interface PromotionCalculationOffer {
  product_id: string | null;
  reward_product_id: string | null;
  offer_type: "percentage" | "fixed" | "buy_x_get_y";
  discount_value: number;
  minimum_subtotal: number;
  max_discount: number | null;
  buy_quantity: number;
  get_quantity: number;
}

export interface PromotionCalculationCartItem {
  product_id: string;
  unit_price: number;
  quantity: number;
}

export function calculatePromotionDiscount(input: {
  offer: PromotionCalculationOffer | null;
  cart: PromotionCalculationCartItem[];
  subtotal: number;
  manualDiscount?: number;
}): number;
