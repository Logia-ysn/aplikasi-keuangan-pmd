import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateAccountBalance } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { CreatePaymentSchema } from '../utils/schemas';
import { BusinessError } from '../utils/errors';
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
      const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

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
        include: { party: true },
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

      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber: `JV-${payment.paymentNumber}`,
          date: parsedDate,
          narration: `Pembayaran ${body.paymentType}: ${payment.paymentNumber} - ${payment.party.name}`,
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
                description: `Pembayaran: ${payment.paymentNumber}`,
              },
              {
                accountId: creditAccountId,
                partyId: body.paymentType === 'Receive' ? body.partyId : null,
                debit: 0,
                credit: numAmount,
                description: `Pembayaran: ${payment.paymentNumber}`,
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
            description: `Pembayaran: ${payment.paymentNumber}`,
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
            description: `Pembayaran: ${payment.paymentNumber}`,
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
      await autoAllocatePayment(tx, payment.id, body.partyId, body.paymentType, numAmount);

      return payment;
    });

    return res.status(201).json(result);
  } catch (error: any) {
    if (error instanceof BusinessError) {
      return res.status(400).json({ error: error.message });
    }
    logger.error({ error }, 'POST /payments error');
    return res.status(500).json({ error: 'Gagal menyimpan pembayaran.' });
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
): Promise<void> {
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
}

export default router;
