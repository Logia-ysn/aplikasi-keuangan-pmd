import { Prisma } from '@prisma/client';

/**
 * Returns the correct balance impact for a given account root type.
 *
 * Normal balance sides:
 *   ASSET, EXPENSE  → debit-normal  (debit increases, credit decreases)
 *   LIABILITY, EQUITY, REVENUE → credit-normal (credit increases, debit decreases)
 */
export function computeImpact(rootType: string, debit: number, credit: number): number {
  if (rootType === 'ASSET' || rootType === 'EXPENSE') {
    return debit - credit;
  }
  return credit - debit;
}

/**
 * Update a single account's balance with correct direction logic.
 */
export async function updateAccountBalance(
  tx: Prisma.TransactionClient,
  accountId: string,
  debit: number,
  credit: number
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
  items: Array<{ accountId: string; debit: number; credit: number }>
): Promise<void> {
  for (const item of items) {
    await updateAccountBalance(tx, item.accountId, item.debit, item.credit);
  }
}
