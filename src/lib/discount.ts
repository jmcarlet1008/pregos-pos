/**
 * Net-of-assumed-VAT amount for a VAT-inclusive gross price — used only for the regular
 * (non-discounted) side of BIR reporting, matching the app's existing vatPortion() convention
 * in src/features/analytics/analyticsData.ts.
 */
export function netOfVat(grossAmount: number): number {
  return grossAmount / 1.12
}

/**
 * RA 9994 (Senior Citizen) / RA 10754 (PWD) discount for this non-VAT-registered business:
 * a flat 20% off the full price, with no separate VAT-removal step.
 */
export function seniorPwdDiscountedPrice(grossAmount: number): number {
  return grossAmount * 0.8
}

/** The 20% peso amount deducted — the BIR income-tax-deduction figure, not a tax credit. */
export function seniorPwdDiscountAmount(grossAmount: number): number {
  return grossAmount * 0.2
}
