import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateAccountBalance } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { CreatePaymentSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { ACCOUNT_NUMBERS } from '../constants/accountNumbers';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/payments
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '50' } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        include: { party: true },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.payment.count(),
    ]);

    return res.json({ data: payments, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /payments error');
    return res.status(500).json({ error: 'Gagal mengambil data pembayaran.' });
  }
});

// POST /api/payments — record payment/receipt
router.post('/', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(CreatePaymentSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const parsedDate = new Date(body.date);
      if (isNaN(parsedDate.getTime())) {
        throw new BusinessError('Format tanggal tidak valid.');
      }

      const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

      // Verify account exists and is a cash/bank account
      const bankAccount = await tx.account.findUnique({ where: { id: body.accountId } });
      if (!bankAccount) throw new BusinessError('Akun kas/bank tidak ditemukan.');
      const isCashAccount = ACCOUNT_NUMBERS.CASH.some(
        (prefix) => bankAccount.accountNumber.startsWith(prefix)
      );
      if (!isCashAccount) {
        throw new BusinessError('Akun yang dipilih bukan akun kas/bank.');
      }

      // Verify party exists and is active
      const party = await tx.party.findUnique({ where: { id: body.partyId } });
      if (!party) throw new BusinessError('Data mitra tidak ditemukan.');
      if (!party.isActive) throw new BusinessError('Mitra sudah tidak aktif.');

      const arAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.AR } });
      const apAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.AP } });
      if (!arAccount || !apAccount) throw new BusinessError('Konfigurasi akun AR/AP tidak ditemukan.');

      const paymentNumber = await generateDocumentNumber(tx, 'PAY', parsedDate, fiscalYear.id);
      const numAmount = body.amount;

      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          date: parsedDate,
          partyId: body.partyId,
          paymentType: body.paymentType,
          accountId: body.accountId,
          amount: numAmount,
          status: 'Submitted',
          referenceNo: body.referenceNo || null,
          notes: body.notes || null,
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
        },
      });

      // Determine GL posting sides
      // Receive (customer paying us): Dr Bank/Kas, Cr AR
      // Pay (us paying vendor):       Dr AP, Cr Bank/Kas
      let debitAccountId: string;
      let creditAccountId: string;

      if (body.paymentType === 'Receive') {
        debitAccountId = body.accountId;       // Bank/Kas
        creditAccountId = arAccount.id;        // AR
      } else {
        debitAccountId = apAccount.id;         // AP
        creditAccountId = body.accountId;      // Bank/Kas
      }

      // Check journal entry number uniqueness before creating
      const jvNumber = `JV-${paymentNumber}`;
      const existingJV = await tx.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
      if (existingJV) {
        throw new BusinessError(`Nomor jurnal ${jvNumber} sudah ada. Silakan coba lagi.`);
      }

      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber: jvNumber,
          date: parsedDate,
          narration: `Pembayaran ${body.paymentType}: ${paymentNumber} - ${party.name}`,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: [
              {
                accountId: debitAccountId,
                partyId: body.paymentType === 'Pay' ? body.partyId : null,
                debit: numAmount,
                credit: 0,
                description: `Pembayaran: ${paymentNumber}`,
              },
              {
                accountId: creditAccountId,
                partyId: body.paymentType === 'Receive' ? body.partyId : null,
                debit: 0,
                credit: numAmount,
                description: `Pembayaran: ${paymentNumber}`,
              },
            ],
          },
        },
      });

      await tx.accountingLedgerEntry.createMany({
        data: [
          {
            date: parsedDate,
            accountId: debitAccountId,
            partyId: body.paymentType === 'Pay' ? body.partyId : null,
            debit: numAmount,
            credit: 0,
            referenceType: 'JournalEntry',
            referenceId: journalEntry.id,
            description: `Pembayaran: ${paymentNumber}`,
            fiscalYearId: fiscalYear.id,
          },
          {
            date: parsedDate,
            accountId: creditAccountId,
            partyId: body.paymentType === 'Receive' ? body.partyId : null,
            debit: 0,
            credit: numAmount,
            referenceType: 'JournalEntry',
            referenceId: journalEntry.id,
            description: `Pembayaran: ${paymentNumber}`,
            fiscalYearId: fiscalYear.id,
          },
        ],
      });

      await updateAccountBalance(tx, debitAccountId, numAmount, 0);
      await updateAccountBalance(tx, creditAccountId, 0, numAmount);

      // Update party outstanding
      await tx.party.update({
        where: { id: body.partyId },
        data: { outstandingAmount: { decrement: numAmount } },
      });

      // Auto-allocate payment to oldest outstanding invoices
      const unallocatedAmount = await autoAllocatePayment(tx, payment.id, body.partyId, body.paymentType, numAmount);

      if (unallocatedAmount > 0.01) {
        logger.warn({ paymentId: payment.id, unallocatedAmount }, 'Overpayment: sisa pembayaran tidak teralokasi');
      }

      return { ...payment, party, unallocatedAmount };
    }, { timeout: 15000 }); // 15s timeout for advisory lock safety

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /payments', 'Gagal menyimpan pembayaran.');
  }
});

// POST /api/payments/:id/cancel — cancel payment and reverse allocations
router.post('/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const payment = await tx.payment.findUnique({
        where: { id: req.params.id as string },
        include: { party: true },
      });
      if (!payment) throw new BusinessError('Pembayaran tidak ditemukan.');
      if (payment.status === 'Cancelled') throw new BusinessError('Pembayaran sudah dibatalkan.');

      const numAmount = Number(payment.amount);

      // Reverse payment allocations
      const allocations = await tx.paymentAllocation.findMany({
        where: { paymentId: payment.id },
      });

      for (const alloc of allocations) {
        const allocAmt = Number(alloc.allocatedAmount);
        if (alloc.invoiceType === 'SalesInvoice') {
          const inv = await tx.salesInvoice.findUnique({ where: { id: alloc.invoiceId } });
          if (inv) {
            const newOutstanding = Number(inv.outstanding) + allocAmt;
            await tx.salesInvoice.update({
              where: { id: inv.id },
              data: { outstanding: newOutstanding, status: newOutstanding >= Number(inv.grandTotal) ? 'Submitted' : 'PartiallyPaid' },
            });
          }
        } else if (alloc.invoiceType === 'PurchaseInvoice') {
          const inv = await tx.purchaseInvoice.findUnique({ where: { id: alloc.invoiceId } });
          if (inv) {
            const newOutstanding = Number(inv.outstanding) + allocAmt;
            await tx.purchaseInvoice.update({
              where: { id: inv.id },
              data: { outstanding: newOutstanding, status: newOutstanding >= Number(inv.grandTotal) ? 'Submitted' : 'PartiallyPaid' },
            });
          }
        }
      }

      // Delete allocations
      await tx.paymentAllocation.deleteMany({ where: { paymentId: payment.id } });

      // Cancel related ledger entries
      const jvNumber = `JV-PAY-${payment.paymentNumber.replace('PAY-', '')}`;
      const journal = await tx.journalEntry.findFirst({
        where: { entryNumber: { contains: payment.paymentNumber } },
      });
      if (journal) {
        await tx.accountingLedgerEntry.updateMany({
          where: { referenceId: journal.id },
          data: { isCancelled: true },
        });
      }

      // Reverse account balances
      const arAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.AR } });
      const apAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.AP } });

      if (payment.paymentType === 'Receive') {
        await updateAccountBalance(tx, payment.accountId, 0, numAmount); // reverse bank debit
        if (arAccount) await updateAccountBalance(tx, arAccount.id, numAmount, 0); // reverse AR credit
      } else {
        if (apAccount) await updateAccountBalance(tx, apAccount.id, 0, numAmount); // reverse AP debit
        await updateAccountBalance(tx, payment.accountId, numAmount, 0); // reverse bank credit
      }

      // Reverse party outstanding
      await tx.party.update({
        where: { id: payment.partyId },
        data: { outstandingAmount: { increment: numAmount } },
      });

      // Mark payment as cancelled
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'Cancelled' },
      });

      return { id: payment.id, status: 'Cancelled' };
    }, { timeout: 15000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /payments/:id/cancel', 'Gagal membatalkan pembayaran.');
  }
});

/**
 * Auto-allocate the payment amount to outstanding invoices (oldest-first).
 */
async function autoAllocatePayment(
  tx: Prisma.TransactionClient,
  paymentId: string,
  partyId: string,
  paymentType: string,
  amount: number
): Promise<number> {
  let remaining = amount;

  if (paymentType === 'Receive') {
    const invoices = await tx.salesInvoice.findMany({
      where: { partyId, status: { in: ['Submitted', 'PartiallyPaid', 'Overdue'] } },
      orderBy: { date: 'asc' },
    });

    for (const inv of invoices) {
      if (remaining <= 0) break;
      const allocate = Math.min(remaining, Number(inv.outstanding));
      remaining -= allocate;

      const newOutstanding = Number(inv.outstanding) - allocate;
      const newStatus = newOutstanding <= 0.01 ? 'Paid' : 'PartiallyPaid';

      await tx.salesInvoice.update({
        where: { id: inv.id },
        data: { outstanding: newOutstanding, status: newStatus },
      });

      await tx.paymentAllocation.create({
        data: {
          paymentId,
          invoiceType: 'SalesInvoice',
          invoiceId: inv.id,
          allocatedAmount: allocate,
        },
      });
    }
  } else {
    const invoices = await tx.purchaseInvoice.findMany({
      where: { partyId, status: { in: ['Submitted', 'PartiallyPaid', 'Overdue'] } },
      orderBy: { date: 'asc' },
    });

    for (const inv of invoices) {
      if (remaining <= 0) break;
      const allocate = Math.min(remaining, Number(inv.outstanding));
      remaining -= allocate;

      const newOutstanding = Number(inv.outstanding) - allocate;
      const newStatus = newOutstanding <= 0.01 ? 'Paid' : 'PartiallyPaid';

      await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: { outstanding: newOutstanding, status: newStatus },
      });

      await tx.paymentAllocation.create({
        data: {
          paymentId,
          invoiceType: 'PurchaseInvoice',
          invoiceId: inv.id,
          allocatedAmount: allocate,
        },
      });
    }
  }

  return remaining > 0 ? remaining : 0;
}

export default router;
