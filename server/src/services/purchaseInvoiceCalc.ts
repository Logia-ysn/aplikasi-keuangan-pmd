// Purchase invoice line-level calculation helpers.
//
// Rice-mill raw material pricing flow per item:
//   timbanganTruk  (informational, NOT used for calc)
//   refaksi        (kg deducted for moisture/dirt)
//   timbanganDiterima = the weight the company actually pays for
//                      (source of truth; mirrored into `quantity`)
//   rate           = price per kg
//   ppnPct / pphPct = per-item tax percentages (manual)
//   potonganItem   = per-item deduction amount (IDR, not percent)
//
// Final amount (stored as `amount` and used everywhere downstream):
//   subtotal   = quantity × rate × (1 - discount/100)
//   ppnAmount  = subtotal × ppnPct / 100
//   pphAmount  = subtotal × pphPct / 100
//   hargaAkhir = subtotal + ppnAmount − pphAmount − potonganItem
//
// Design decision (confirmed with user):
//   * PPN/PPh amounts are folded into `amount` — NOT posted as separate GL lines.
//   * WAC / unit cost for stock valuation includes everything (PPN, PPh, potongan,
//     landed cost share) → "harga include semua".
//   * Header `potongan` becomes a derived cache: SUM(items.potonganItem).

import Decimal from 'decimal.js';

export interface RawPurchaseItemInput {
  quantity: number;
  rate: number;
  discount?: number;
  taxPct?: number;
  pphPct?: number;
  potonganItem?: number;
  timbanganDiterima?: number | null;
}

export interface ComputedPurchaseItem {
  effectiveQuantity: Decimal;
  subtotal: Decimal;
  ppnAmount: Decimal;
  pphAmount: Decimal;
  hargaAkhir: Decimal; // final item amount (what goes into `amount` column)
}

const D = (v: number | string | undefined | null): Decimal =>
  new Decimal(v ?? 0);

/**
 * Compute the effective quantity used for pricing & stock movement.
 * When timbanganDiterima is provided (rice mill flow) it overrides quantity.
 */
export function effectiveQuantity(
  input: Pick<RawPurchaseItemInput, 'quantity' | 'timbanganDiterima'>,
): Decimal {
  if (input.timbanganDiterima != null && input.timbanganDiterima > 0) {
    return D(input.timbanganDiterima);
  }
  return D(input.quantity);
}

export function computePurchaseItem(
  input: RawPurchaseItemInput,
): ComputedPurchaseItem {
  const qty = effectiveQuantity(input);
  const base = qty.mul(D(input.rate));
  const discPct = D(input.discount ?? 0).div(100);
  const subtotal = base
    .minus(base.mul(discPct))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const ppnAmount = subtotal
    .mul(D(input.taxPct ?? 0).div(100))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const pphAmount = subtotal
    .mul(D(input.pphPct ?? 0).div(100))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const potongan = D(input.potonganItem ?? 0);

  const hargaAkhir = subtotal
    .plus(ppnAmount)
    .minus(pphAmount)
    .minus(potongan)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    effectiveQuantity: qty,
    subtotal,
    ppnAmount,
    pphAmount,
    hargaAkhir,
  };
}

/**
 * Sum of potonganItem across lines — becomes the header `potongan` cache.
 */
export function sumPotonganItem(
  items: Array<{ potonganItem?: number }>,
): Decimal {
  return items.reduce(
    (sum, i) => sum.plus(D(i.potonganItem ?? 0)),
    new Decimal(0),
  );
}
