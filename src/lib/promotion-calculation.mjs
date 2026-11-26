/**
 * Calculate the promotion discount using the same eligibility and bundle rules
 * enforced by the transactional POS RPC.
 *
 * @param {object|null} offer
 * @param {Array<{product_id:string, unit_price:number, quantity:number}>} cart
 * @param {number} subtotal
 * @param {number} manualDiscount
 */
export function calculatePromotionDiscount({ offer, cart, subtotal, manualDiscount = 0 }) {
  if (!offer) return 0;

  const eligible = cart.filter((item) => !offer.product_id || item.product_id === offer.product_id);
  const eligibleSubtotal = eligible.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
  const minimumSubtotal = Math.max(0, Number(offer.minimum_subtotal) || 0);
  if (eligibleSubtotal <= 0 || eligibleSubtotal < minimumSubtotal) return 0;

  let amount = 0;
  if (offer.offer_type === "percentage") {
    amount = eligibleSubtotal * (Number(offer.discount_value) || 0) / 100;
  } else if (offer.offer_type === "fixed") {
    amount = Math.min(eligibleSubtotal, Number(offer.discount_value) || 0);
  } else {
    const rewardId = offer.reward_product_id || offer.product_id;
    const buyQuantity = Math.max(1, Math.floor(Number(offer.buy_quantity) || 1));
    const getQuantity = Math.max(1, Math.floor(Number(offer.get_quantity) || 1));
    const buyQty = cart.filter((item) => item.product_id === offer.product_id)
      .reduce((sum, item) => sum + Number(item.quantity), 0);
    const rewardQty = cart.filter((item) => item.product_id === rewardId)
      .reduce((sum, item) => sum + Number(item.quantity), 0);
    const reward = cart.find((item) => item.product_id === rewardId);
    const freeQty = rewardId === offer.product_id
      ? Math.floor(rewardQty / (buyQuantity + getQuantity)) * getQuantity
      : Math.min(rewardQty, Math.floor(buyQty / buyQuantity) * getQuantity);
    amount = freeQty * Number(reward?.unit_price ?? 0);
  }

  if (offer.max_discount !== null && offer.max_discount !== undefined) {
    amount = Math.min(amount, Math.max(0, Number(offer.max_discount) || 0));
  }
  return Math.max(0, Math.min(amount, Number(subtotal) - Math.max(0, Number(manualDiscount) || 0)));
}
