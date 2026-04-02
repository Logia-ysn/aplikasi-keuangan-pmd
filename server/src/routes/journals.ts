import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateBalancesForItems } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { CreateJournalSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
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
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        (where.date as any).lte = end;
      }
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

  // Validate: each line must have either debit OR credit, not both
  for (const item of body.items) {
    if ((item.debit || 0) > 0 && (item.credit || 0) > 0) {
      return res.status(400).json({
        error: 'Satu baris jurnal tidak boleh memiliki debit dan kredit sekaligus.',
      });
    }
  }

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

      // Update party outstanding amounts (account-aware direction)
      for (const item of journalEntry.items) {
        if (item.partyId) {
          const account = await tx.account.findUnique({
            where: { id: item.accountId },
            select: { rootType: true },
          });
          // ASSET/EXPENSE (debit-normal): debit increases outstanding
          // LIABILITY/EQUITY/REVENUE (credit-normal): credit increases outstanding
          const impact = account?.rootType === 'ASSET' || account?.rootType === 'EXPENSE'
            ? Number(item.debit) - Number(item.credit)
            : Number(item.credit) - Number(item.debit);
          if (impact !== 0) {
            await tx.party.update({
              where: { id: item.partyId },
              data: { outstandingAmount: { increment: impact } },
            });
          }
        }
      }

      return journalEntry;
    }, { timeout: 15000 });

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /journals', 'Gagal menyimpan jurnal.');
  }
});

// GET /api/journals/:id — get single journal entry
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: {
        items: { include: { account: { select: { id: true, accountNumber: true, name: true, rootType: true } } } },
        user: { select: { fullName: true } },
      },
    });
    if (!entry) return res.status(404).json({ error: 'Jurnal tidak ditemukan.' });
    return res.json(entry);
  } catch (error) {
    logger.error({ error }, 'GET /journals/:id error');
    return res.status(500).json({ error: 'Gagal mengambil data jurnal.' });
  }
});

// PATCH /api/journals/:id/cancel — cancel a journal entry and reverse balances
router.patch('/:id/cancel', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  try {
    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: {
        items: { include: { account: { select: { rootType: true } } } },
        payment: { select: { id: true } },
      },
    });

    if (!entry) return res.status(404).json({ error: 'Jurnal tidak ditemukan.' });
    if (entry.status === 'Cancelled') return res.status(400).json({ error: 'Jurnal sudah dibatalkan.' });
    if (entry.payment) return res.status(400).json({ error: 'Jurnal ini terkait pembayaran. Batalkan pembayaran terlebih dahulu.' });

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Reverse account balances
      await updateBalancesForItems(
        tx,
        entry.items.map((i) => ({
          accountId: i.accountId,
          debit: Number(i.credit),  // swap: old credit becomes debit
          credit: Number(i.debit),  // swap: old debit becomes credit
        }))
      );

      // Reverse party outstanding amounts
      for (const item of entry.items) {
        if (item.partyId) {
          const isDebitNormal = item.account.rootType === 'ASSET' || item.account.rootType === 'EXPENSE';
          const reverseImpact = isDebitNormal
            ? Number(item.credit) - Number(item.debit)
            : Number(item.debit) - Number(item.credit);
          if (reverseImpact !== 0) {
            await tx.party.update({
              where: { id: item.partyId },
              data: { outstandingAmount: { increment: reverseImpact } },
            });
          }
        }
      }

      // Mark cancelled
      await tx.journalEntry.update({
        where: { id },
        data: { status: 'Cancelled', cancelledAt: new Date() },
      });

      // Add reversal ledger entries
      await tx.accountingLedgerEntry.createMany({
        data: entry.items.map((item) => ({
          date: new Date(),
          accountId: item.accountId,
          partyId: item.partyId,
          debit: item.credit,   // reversed
          credit: item.debit,   // reversed
          referenceType: 'JournalEntry' as const,
          referenceId: entry.id,
          description: `[BATAL] ${item.description || entry.narration}`,
          fiscalYearId: entry.fiscalYearId,
        })),
      });
    }, { timeout: 15000 });

    return res.json({ message: 'Jurnal berhasil dibatalkan.' });
  } catch (error: any) {
    return handleRouteError(res, error, 'PATCH /journals/:id/cancel', 'Gagal membatalkan jurnal.');
  }
});

export default router;
