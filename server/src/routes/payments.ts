import { Router } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
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

// GET /api/payments/cash-journals — journal entries affecting cash/bank accounts (not already linked to payments)
router.get('/cash-journals', async (_req, res) => {
  try {
    // Find journal items that touch cash accounts (1.1.x) and aren't linked to payments
    const cashItems = await prisma.journalItem.findMany({
      where: {
        account: { accountNumber: { startsWith: '1.1' }, isGroup: false },
        journalEntry: {
          status: { not: 'Cancelled' },
          // Exclude journals linked to payments (they start with JV-PAY)
          entryNumber: { not: { startsWith: 'JV-PAY' } },
        },
      },
      include: {
        journalEntry: true,
        account: true,
      },
      orderBy: { journalEntry: { date: 'desc' } },
      take: 100,
    });

    // Resolve party names for items with partyId
    const partyIds = [...new Set(cashItems.map((i) => i.partyId).filter((id): id is string => id != null))];
    const parties = partyIds.length > 0
      ? await prisma.party.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true } })
      : [];
    const partyMap = new Map(parties.map((p) => [p.id, p.name]));

    const data = cashItems.map((item) => ({
      id: item.id,
      journalEntryId: item.journalEntryId,
      date: item.journalEntry.date,
      entryNumber: item.journalEntry.entryNumber,
      narration: item.journalEntry.narration,
      partyName: item.partyId ? partyMap.get(item.partyId) ?? null : null,
      amount: Number(item.credit) > 0 ? Number(item.credit) : Number(item.debit),
      isCredit: Number(item.credit) > 0,
      status: item.journalEntry.status,
    }));

    return res.json({ data });
  } catch (error) {
    logger.error({ error }, 'GET /payments/cash-journals error');
    return res.status(500).json({ error: 'Gagal mengambil data jurnal kas.' });
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

      // ── VendorDeposit branch: DR Uang Muka Vendor / CR Kas ──────────────
      if (body.paymentType === 'VendorDeposit') {
        if (party.partyType !== 'Supplier' && party.partyType !== 'Both') {
          throw new BusinessError('Uang muka hanya dapat dibuat untuk Supplier.');
        }
        const depositAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.VENDOR_DEPOSIT } });
        if (!depositAccount) throw new BusinessError('Akun Uang Muka Vendor (1.2.1) tidak ditemukan.');

        const jvNumber = `JV-${paymentNumber}`;
        const existingJV = await tx.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
        if (existingJV) throw new BusinessError(`Nomor jurnal ${jvNumber} sudah ada. Silakan coba lagi.`);

        const journalEntry = await tx.journalEntry.create({
          data: {
            entryNumber: jvNumber,
            date: parsedDate,
            narration: `Uang Muka Vendor: ${paymentNumber} - ${party.name}`,
            status: 'Submitted',
            fiscalYearId: fiscalYear.id,
            createdBy: req.user!.userId,
            submittedAt: new Date(),
            items: {
              create: [
                { accountId: depositAccount.id, partyId: body.partyId, debit: numAmount, credit: 0, description: `Uang Muka: ${paymentNumber}` },
                { accountId: body.accountId, debit: 0, credit: numAmount, description: `Uang Muka: ${paymentNumber}` },
              ],
            },
          },
        });

        await tx.accountingLedgerEntry.createMany({
          data: [
            { date: parsedDate, accountId: depositAccount.id, partyId: body.partyId, debit: numAmount, credit: 0, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Uang Muka: ${paymentNumber}`, fiscalYearId: fiscalYear.id },
            { date: parsedDate, accountId: body.accountId, debit: 0, credit: numAmount, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Uang Muka: ${paymentNumber}`, fiscalYearId: fiscalYear.id },
          ],
        });

        await updateAccountBalance(tx, depositAccount.id, numAmount, 0);
        await updateAccountBalance(tx, body.accountId, 0, numAmount);

        await tx.party.update({
          where: { id: body.partyId },
          data: { depositBalance: { increment: numAmount } },
        });

        return { ...payment, party, unallocatedAmount: 0 };
      }

      // ── Receive / Pay branch ────────────────────────────────────────────
      const arAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.AR } });
      const apAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.AP } });
      if (!arAccount || !apAccount) throw new BusinessError('Konfigurasi akun AR/AP tidak ditemukan.');

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

      // Auto-allocate payment to oldest outstanding invoices
      const unallocatedAmount = await autoAllocatePayment(tx, payment.id, body.partyId, body.paymentType, numAmount);

      // Update party outstanding by the amount actually allocated (not full payment)
      const allocatedAmount = new Decimal(numAmount).minus(new Decimal(unallocatedAmount)).toNumber();
      if (allocatedAmount > 0) {
        await tx.party.update({
          where: { id: body.partyId },
          data: { outstandingAmount: { decrement: allocatedAmount } },
        });
      }

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

      const numAmount = new Decimal(payment.amount.toString());

      // ── VendorDeposit cancel branch ─────────────────────────────────────
      if (payment.paymentType === 'VendorDeposit') {
        const activeApps = await tx.vendorDepositApplication.count({
          where: { depositPaymentId: payment.id, isCancelled: false },
        });
        if (activeApps > 0) {
          throw new BusinessError('Deposit memiliki alokasi aktif. Batalkan alokasi terlebih dahulu.');
        }

        const jvNumber = `JV-${payment.paymentNumber}`;
        const journal = await tx.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
        if (journal) {
          await tx.journalEntry.update({ where: { id: journal.id }, data: { status: 'Cancelled', cancelledAt: new Date() } });
          await tx.accountingLedgerEntry.updateMany({ where: { referenceId: journal.id }, data: { isCancelled: true } });
        }

        const depositAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.VENDOR_DEPOSIT } });
        const numAmountVal = numAmount.toNumber();
        if (depositAccount) await updateAccountBalance(tx, depositAccount.id, 0, numAmountVal);
        await updateAccountBalance(tx, payment.accountId, numAmountVal, 0);

        await tx.party.update({
          where: { id: payment.partyId },
          data: { depositBalance: { decrement: numAmountVal } },
        });

        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'Cancelled', cancelledAt: new Date() },
        });

        return { id: payment.id, status: 'Cancelled' };
      }

      // ── Receive / Pay cancel branch ─────────────────────────────────────
      // Reverse payment allocations
      const allocations = await tx.paymentAllocation.findMany({
        where: { paymentId: payment.id },
      });

      for (const alloc of allocations) {
        const allocAmt = new Decimal(alloc.allocatedAmount.toString());
        if (alloc.invoiceType === 'SalesInvoice') {
          const inv = await tx.salesInvoice.findUnique({ where: { id: alloc.invoiceId } });
          if (inv) {
            const newOutstanding = new Decimal(inv.outstanding.toString()).plus(allocAmt);
            const newOutstandingNum = newOutstanding.toNumber();
            await tx.salesInvoice.update({
              where: { id: inv.id },
              data: { outstanding: newOutstandingNum, status: newOutstanding.gte(new Decimal(inv.grandTotal.toString())) ? 'Submitted' : 'PartiallyPaid' },
            });
          }
        } else if (alloc.invoiceType === 'PurchaseInvoice') {
          const inv = await tx.purchaseInvoice.findUnique({ where: { id: alloc.invoiceId } });
          if (inv) {
            const newOutstanding = new Decimal(inv.outstanding.toString()).plus(allocAmt);
            const newOutstandingNum = newOutstanding.toNumber();
            await tx.purchaseInvoice.update({
              where: { id: inv.id },
              data: { outstanding: newOutstandingNum, status: newOutstanding.gte(new Decimal(inv.grandTotal.toString())) ? 'Submitted' : 'PartiallyPaid' },
            });
          }
        }
      }

      // Delete allocations
      await tx.paymentAllocation.deleteMany({ where: { paymentId: payment.id } });

      // Cancel related ledger entries — match the JV number format used on creation
      const jvNumber = `JV-${payment.paymentNumber}`;
      const journal = await tx.journalEntry.findUnique({
        where: { entryNumber: jvNumber },
      });
      if (journal) {
        await tx.journalEntry.update({
          where: { id: journal.id },
          data: { status: 'Cancelled', cancelledAt: new Date() },
        });
        await tx.accountingLedgerEntry.updateMany({
          where: { referenceId: journal.id },
          data: { isCancelled: true },
        });
      }

      // Reverse account balances
      const arAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.AR } });
      const apAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.AP } });
      const numAmountVal = numAmount.toNumber();

      if (payment.paymentType === 'Receive') {
        await updateAccountBalance(tx, payment.accountId, 0, numAmountVal); // reverse bank debit
        if (arAccount) await updateAccountBalance(tx, arAccount.id, numAmountVal, 0); // reverse AR credit
      } else {
        if (apAccount) await updateAccountBalance(tx, apAccount.id, 0, numAmountVal); // reverse AP debit
        await updateAccountBalance(tx, payment.accountId, numAmountVal, 0); // reverse bank credit
      }

      // Reverse party outstanding — use sum of actual reversed allocations, not full payment amount
      const totalAllocated = allocations.reduce(
        (sum, a) => sum.plus(new Decimal(a.allocatedAmount.toString())),
        new Decimal(0)
      );
      await tx.party.update({
        where: { id: payment.partyId },
        data: { outstandingAmount: { increment: totalAllocated.toNumber() } },
      });

      // Mark payment as cancelled
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'Cancelled', cancelledAt: new Date() },
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
  let remaining = new Decimal(amount);

  // Lock invoice rows to prevent concurrent allocation
  if (paymentType === 'Receive') {
    await tx.$queryRaw`SELECT id FROM sales_invoices WHERE party_id = ${partyId} AND status IN ('Submitted', 'PartiallyPaid', 'Overdue') FOR UPDATE`;
  } else {
    await tx.$queryRaw`SELECT id FROM purchase_invoices WHERE party_id = ${partyId} AND status IN ('Submitted', 'PartiallyPaid', 'Overdue') FOR UPDATE`;
  }

  if (paymentType === 'Receive') {
    const invoices = await tx.salesInvoice.findMany({
      where: { partyId, status: { in: ['Submitted', 'PartiallyPaid', 'Overdue'] } },
      orderBy: { date: 'asc' },
    });

    for (const inv of invoices) {
      if (remaining.lte(0)) break;
      const outstanding = new Decimal(inv.outstanding.toString());
      const allocate = Decimal.min(remaining, outstanding);
      remaining = remaining.minus(allocate);

      const newOutstanding = outstanding.minus(allocate);
      const newStatus = newOutstanding.lte(new Decimal('0.01')) ? 'Paid' : 'PartiallyPaid';

      await tx.salesInvoice.update({
        where: { id: inv.id },
        data: { outstanding: newOutstanding.toNumber(), status: newStatus },
      });

      await tx.paymentAllocation.create({
        data: {
          paymentId,
          invoiceType: 'SalesInvoice',
          invoiceId: inv.id,
          allocatedAmount: allocate.toNumber(),
        },
      });
    }
  } else {
    const invoices = await tx.purchaseInvoice.findMany({
      where: { partyId, status: { in: ['Submitted', 'PartiallyPaid', 'Overdue'] } },
      orderBy: { date: 'asc' },
    });

    for (const inv of invoices) {
      if (remaining.lte(0)) break;
      const outstanding = new Decimal(inv.outstanding.toString());
      const allocate = Decimal.min(remaining, outstanding);
      remaining = remaining.minus(allocate);

      const newOutstanding = outstanding.minus(allocate);
      const newStatus = newOutstanding.lte(new Decimal('0.01')) ? 'Paid' : 'PartiallyPaid';

      await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: { outstanding: newOutstanding.toNumber(), status: newStatus },
      });

      await tx.paymentAllocation.create({
        data: {
          paymentId,
          invoiceType: 'PurchaseInvoice',
          invoiceId: inv.id,
          allocatedAmount: allocate.toNumber(),
        },
      });
    }
  }

  return remaining.gt(0) ? remaining.toNumber() : 0;
}

export default router;
