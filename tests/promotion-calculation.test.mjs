import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculatePromotionDiscount } from "../src/lib/promotion-calculation.mjs";

const migration = readFileSync(new URL("../supabase/migrations/20261127010000_fix_promotion_gift_eligibility_and_same_sku.sql", import.meta.url), "utf8");

test("same-SKU buy-two-get-one discounts only complete three-item bundles", () => {
  const offer = { product_id: "coffee", reward_product_id: "coffee", offer_type: "buy_x_get_y", buy_quantity: 2, get_quantity: 1, minimum_subtotal: 0, max_discount: null };
  const cart = [{ product_id: "coffee", unit_price: 10, quantity: 5 }];
  assert.equal(calculatePromotionDiscount({ offer, cart, subtotal: 50 }), 10);
});

test("same-SKU bundles do not grant a free item before the full bundle quantity", () => {
  const offer = { product_id: "coffee", reward_product_id: "coffee", offer_type: "buy_x_get_y", buy_quantity: 2, get_quantity: 1, minimum_subtotal: 0, max_discount: null };
  const cart = [{ product_id: "coffee", unit_price: 10, quantity: 2 }];
  assert.equal(calculatePromotionDiscount({ offer, cart, subtotal: 20 }), 0);
});

test("minimum subtotal is checked against eligible items, not unrelated cart items", () => {
  const offer = { product_id: "coffee", offer_type: "percentage", discount_value: 10, minimum_subtotal: 100, max_discount: null };
  const cart = [
    { product_id: "coffee", unit_price: 20, quantity: 1 },
    { product_id: "cake", unit_price: 100, quantity: 1 },
  ];
  assert.equal(calculatePromotionDiscount({ offer, cart, subtotal: 120 }), 0);
  assert.match(migration, /IF v_eligible_subtotal < v_offer\.minimum_subtotal THEN/);
});

test("manual discounts and promotion caps cannot exceed the remaining cart balance", () => {
  const offer = { product_id: null, offer_type: "fixed", discount_value: 80, minimum_subtotal: 0, max_discount: 60 };
  const cart = [{ product_id: "meal", unit_price: 100, quantity: 1 }];
  assert.equal(calculatePromotionDiscount({ offer, cart, subtotal: 100, manualDiscount: 50 }), 50);
});
