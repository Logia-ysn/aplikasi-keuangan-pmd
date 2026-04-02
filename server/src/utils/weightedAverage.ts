import Decimal from 'decimal.js';

/**
 * Recalculate weighted average cost after a stock-in movement.
 *
 * Formula:
 *   newAvgCost = (currentQty × currentAvgCost + inQty × inUnitCost) / (currentQty + inQty)
 *
 * @param currentQty  - Current stock quantity BEFORE the new movement
 * @param currentAvgCost - Current weighted average cost per unit
 * @param inQty - Quantity being added
 * @param inUnitCost - Unit cost of the incoming stock
 * @returns New weighted average cost (rounded to 2 decimals)
 */
export function calcWeightedAverage(
  currentQty: number | Decimal,
  currentAvgCost: number | Decimal,
  inQty: number | Decimal,
  inUnitCost: number | Decimal,
): number {
  const cQty = new Decimal(currentQty.toString());
  const cCost = new Decimal(currentAvgCost.toString());
  const iQty = new Decimal(inQty.toString());
  const iCost = new Decimal(inUnitCost.toString());

  const totalQty = cQty.plus(iQty);
  if (totalQty.isZero()) return 0;

  const totalValue = cQty.times(cCost).plus(iQty.times(iCost));
  return totalValue.div(totalQty).toDecimalPlaces(2).toNumber();
}
