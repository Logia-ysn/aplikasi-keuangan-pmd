import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

/**
 * Returns the correct balance impact for a given account root type.
 *
 * Normal balance sides:
 *   ASSET, EXPENSE  → debit-normal  (debit increases, credit decreases)
 *   LIABILITY, EQUITY, REVENUE → credit-normal (credit increases, debit decreases)
 */
export function computeImpact(rootType: string, debit: number | Decimal, credit: number | Decimal): number {
  const d = new Decimal(debit.toString());
  const c = new Decimal(credit.toString());
  if (rootType === 'ASSET' || rootType === 'EXPENSE') {
    return d.minus(c).toNumber();
  }
  return c.minus(d).toNumber();
}

/**
 * Update a single account's balance with correct direction logic.
 */
export async function updateAccountBalance(
  tx: Prisma.TransactionClient,
  accountId: string,
  debit: number | Decimal,
  credit: number | Decimal
): Promise<void> {
  const account = await tx.account.findUnique({
    where: { id: accountId },
    select: { rootType: true },
  });
  if (!account) return;

  const impact = computeImpact(account.rootType, debit, credit);
  await tx.account.update({
    where: { id: accountId },
    data: { balance: { increment: impact } },
  });
}

/**
 * Batch update balances for multiple journal items.
 */
export async function updateBalancesForItems(
  tx: Prisma.TransactionClient,
  items: Array<{ accountId: string; debit: number | Decimal; credit: number | Decimal }>
): Promise<void> {
  for (const item of items) {
    await updateAccountBalance(tx, item.accountId, item.debit, item.credit);
  }
}
