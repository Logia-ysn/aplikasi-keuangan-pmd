import { Prisma } from '@prisma/client';

/**
 * Generates a sequential document number using advisory locks to prevent
 * race conditions under concurrent requests.
 *
 * Format: {prefix}-YYYYMM-XXXX  e.g. SI-202603-0001
 */
export async function generateDocumentNumber(
  tx: Prisma.TransactionClient,
  prefix: 'JV' | 'SI' | 'PI' | 'PAY' | 'SM' | 'PR',
  date: Date,
  fiscalYearId: string
): Promise<string> {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const yearMonth = `${year}${month}`;

  // Use a deterministic advisory lock key per (prefix, yearMonth)
  // so parallel requests for same prefix+month are serialised
  const lockKey = `${prefix}-${yearMonth}`.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

  let count = 0;
  if (prefix === 'SI') {
    count = await tx.salesInvoice.count({ where: { fiscalYearId } });
  } else if (prefix === 'PI') {
    count = await tx.purchaseInvoice.count({ where: { fiscalYearId } });
  } else if (prefix === 'PAY') {
    count = await tx.payment.count({ where: { fiscalYearId } });
  } else if (prefix === 'SM') {
    count = await tx.stockMovement.count({ where: { fiscalYearId } });
  } else if (prefix === 'PR') {
    count = await tx.productionRun.count({ where: { fiscalYearId } });
  } else {
    count = await tx.journalEntry.count({ where: { fiscalYearId } });
  }

  return `${prefix}-${yearMonth}-${String(count + 1).padStart(4, '0')}`;
}
