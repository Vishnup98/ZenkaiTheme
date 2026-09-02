export const ALIEXPRESS_PROMO_RULES = Object.freeze([
  Object.freeze({
    code: "LDUS04",
    minimumEligibleSubtotal: 30,
    discountAmount: 4,
    currency: "USD",
  }),
  Object.freeze({
    code: "LDUS02",
    minimumEligibleSubtotal: 15,
    discountAmount: 2,
    currency: "USD",
  }),
]);

export function couponForEligibleSubtotal(value, currency = "USD") {
  const subtotal = Number(value);
  if (!Number.isFinite(subtotal) || subtotal < 0 || currency !== "USD") return null;
  const rule = ALIEXPRESS_PROMO_RULES.find((candidate) => subtotal >= candidate.minimumEligibleSubtotal);
  if (!rule) return null;
  return {
    ...rule,
    eligibleSubtotal: Math.round((subtotal + Number.EPSILON) * 100) / 100,
    estimatedAfterCoupon: Math.round((Math.max(0, subtotal - rule.discountAmount) + Number.EPSILON) * 100) / 100,
    eligibilityBasis: "AliExpress item subtotal before shipping, tax, and checkout validation",
  };
}
