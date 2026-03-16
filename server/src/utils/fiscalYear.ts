import { Prisma } from '@prisma/client';

/**
 * Find the open fiscal year that contains the given date.
 * Throws if not found or already closed.
 */
export async function getOpenFiscalYear(
  tx: Prisma.TransactionClient,
  date: Date
) {
  const fiscalYear = await tx.fiscalYear.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
      isClosed: false,
    },
  });

  if (!fiscalYear) {
    throw new Error('Tahun fiskal tidak ditemukan atau sudah ditutup untuk tanggal ini.');
  }

  return fiscalYear;
}
