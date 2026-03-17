import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateBalancesForItems } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { CreateJournalSchema } from '../utils/schemas';
import { BusinessError } from '../utils/errors';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/journals — list all journal entries
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '50', startDate, endDate } = req.query;
    const skip = (Number(page) - 1) * Math.min(Number(limit), 200);
    const take = Math.min(Number(limit) || 50, 200);

    const where: Prisma.JournalEntryWhereInput = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) (where.date as any).gte = new Date(startDate as string);
      if (endDate) (where.date as any).lte = new Date(endDate as string);
    }

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          items: { include: { account: { select: { accountNumber: true, name: true } } } },
          user: { select: { fullName: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.journalEntry.count({ where }),
    ]);

    return res.json({ data: entries, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /journals error');
    return res.status(500).json({ error: 'Gagal mengambil data jurnal.' });
  }
});

// POST /api/journals — create journal entry
router.post('/', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateJournalSchema, req.body, res);
  if (!body) return;

  const totalDebit = body.items.reduce((s, i) => s + (i.debit || 0), 0);
  const totalCredit = body.items.reduce((s, i) => s + (i.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return res.status(400).json({
      error: `Jurnal tidak seimbang. Total Debit (${totalDebit}) ≠ Total Kredit (${totalCredit}).`,
    });
  }

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const parsedDate = new Date(body.date);
      const fiscalYear = await getOpenFiscalYear(tx, parsedDate);
      const entryNumber = await generateDocumentNumber(tx, 'JV', parsedDate, fiscalYear.id);

      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: parsedDate,
          narration: body.narration,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: body.items.map((item) => ({
              accountId: item.accountId,
              partyId: item.partyId || null,
              debit: item.debit || 0,
              credit: item.credit || 0,
              description: item.description || body.narration,
            })),
          },
        },
        include: { items: true },
      });

      // Post to immutable ledger
      await tx.accountingLedgerEntry.createMany({
        data: journalEntry.items.map((item) => ({
          date: parsedDate,
          accountId: item.accountId,
          partyId: item.partyId,
          debit: item.debit,
          credit: item.credit,
          referenceType: 'JournalEntry',
          referenceId: journalEntry.id,
          description: item.description || body.narration,
          fiscalYearId: fiscalYear.id,
        })),
      });

      // Update account balances with correct direction
      await updateBalancesForItems(
        tx,
        journalEntry.items.map((i) => ({
          accountId: i.accountId,
          debit: Number(i.debit),
          credit: Number(i.credit),
        }))
      );

      // Update party outstanding amounts
      for (const item of journalEntry.items) {
        if (item.partyId) {
          const impact = Number(item.debit) - Number(item.credit);
          await tx.party.update({
            where: { id: item.partyId },
            data: { outstandingAmount: { increment: impact } },
          });
        }
      }

      return journalEntry;
    });

    return res.status(201).json(result);
  } catch (error: any) {
    if (error instanceof BusinessError) {
      return res.status(400).json({ error: error.message });
    }
    if (error?.code === 'P2025') {
      return res.status(400).json({ error: 'Data terkait tidak ditemukan (akun/tahun fiskal).' });
    }
    logger.error({ error, stack: error?.stack }, 'POST /journals error');
    return res.status(500).json({ error: error?.message || 'Gagal menyimpan jurnal.' });
  }
});

export default router;
