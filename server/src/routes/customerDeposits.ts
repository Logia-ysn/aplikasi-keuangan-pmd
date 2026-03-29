import { Router } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateAccountBalance } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { ApplyCustomerDepositSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { ACCOUNT_NUMBERS } from '../constants/accountNumbers';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/customer-deposits — list all customer deposits
router.get('/', async (req, res) => {
  try {
    const { partyId, status } = req.query;

    const where: Prisma.PaymentWhereInput = { paymentType: 'CustomerDeposit' };
    if (partyId) where.partyId = partyId as string;
    if (status) where.status = status as any;

    const deposits = await prisma.payment.findMany({
      where,
      include: {
        party: true,
        account: { select: { id: true, name: true, accountNumber: true } },
        customerDepositApplications: {
          where: { isCancelled: false },
          select: { id: true, appliedAmount: true, salesInvoiceId: true, appliedAt: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    const data = deposits.map((d) => {
      const totalApplied = d.customerDepositApplications.reduce(
        (sum, app) => sum.plus(new Decimal(app.appliedAmount.toString())),
        new Decimal(0)
      );
      const remaining = new Decimal(d.amount.toString()).minus(totalApplied);
      return {
        ...d,
        totalApplied: totalApplied.toNumber(),
        remaining: remaining.toNumber(),
      };
    });

    return res.json({ data });
  } catch (error) {
    logger.error({ error }, 'GET /customer-deposits error');
    return res.status(500).json({ error: 'Gagal mengambil data uang muka pelanggan.' });
  }
});

// GET /api/customer-deposits/balance/:partyId — deposit balance per customer
router.get('/balance/:partyId', async (req, res) => {
  try {
    const { partyId } = req.params;

    const deposits = await prisma.payment.findMany({
      where: { partyId, paymentType: 'CustomerDeposit', status: 'Submitted' },
      include: {
        account: { select: { id: true, name: true, accountNumber: true } },
        customerDepositApplications: {
          where: { isCancelled: false },
          select: { id: true, appliedAmount: true, salesInvoiceId: true, appliedAt: true },
        },
      },
      orderBy: { date: 'asc' },
    });

    const items = deposits.map((d) => {
      const totalApplied = d.customerDepositApplications.reduce(
        (sum, app) => sum.plus(new Decimal(app.appliedAmount.toString())),
        new Decimal(0)
      );
      const remaining = new Decimal(d.amount.toString()).minus(totalApplied);
      return {
        id: d.id,
        paymentNumber: d.paymentNumber,
        date: d.date,
        amount: Number(d.amount),
        totalApplied: totalApplied.toNumber(),
        remaining: remaining.toNumber(),
        referenceNo: d.referenceNo,
        account: d.account,
      };
    }).filter((d) => d.remaining > 0.01);

    const totalBalance = items.reduce((sum, d) => sum + d.remaining, 0);

    return res.json({ data: items, totalBalance });
  } catch (error) {
    logger.error({ error }, 'GET /customer-deposits/balance error');
    return res.status(500).json({ error: 'Gagal mengambil saldo uang muka pelanggan.' });
  }
});

// POST /api/customer-deposits/apply — apply deposit to sales invoice
router.post('/apply', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(ApplyCustomerDepositSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Lock rows to prevent concurrent application
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${body.depositPaymentId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM sales_invoices WHERE id = ${body.salesInvoiceId} FOR UPDATE`;

      const deposit = await tx.payment.findUnique({
        where: { id: body.depositPaymentId },
        include: { customerDepositApplications: { where: { isCancelled: false } } },
      });
      if (!deposit) throw new BusinessError('Deposit tidak ditemukan.');
      if (deposit.paymentType !== 'CustomerDeposit') throw new BusinessError('Pembayaran bukan tipe Uang Muka Pelanggan.');
      if (deposit.status !== 'Submitted') throw new BusinessError('Deposit sudah dibatalkan.');

      const invoice = await tx.salesInvoice.findUnique({
        where: { id: body.salesInvoiceId },
        include: { customer: true },
      });
      if (!invoice) throw new BusinessError('Invoice penjualan tidak ditemukan.');
      if (invoice.status === 'Cancelled') throw new BusinessError('Invoice sudah dibatalkan.');
      if (invoice.status === 'Paid') throw new BusinessError('Invoice sudah lunas.');

      if (deposit.partyId !== invoice.partyId) {
        throw new BusinessError('Deposit dan invoice harus dari pelanggan yang sama.');
      }

      const totalApplied = deposit.customerDepositApplications.reduce(
        (sum, app) => sum.plus(new Decimal(app.appliedAmount.toString())),
        new Decimal(0)
      );
      const depositRemaining = new Decimal(deposit.amount.toString()).minus(totalApplied);
      const invoiceOutstanding = new Decimal(invoice.outstanding.toString());
      const applyAmount = new Decimal(body.amount);

      if (applyAmount.gt(depositRemaining)) {
        throw new BusinessError(`Sisa deposit hanya Rp ${depositRemaining.toFixed(2)}. Tidak cukup.`);
      }
      if (applyAmount.gt(invoiceOutstanding)) {
        throw new BusinessError(`Sisa outstanding invoice hanya Rp ${invoiceOutstanding.toFixed(2)}.`);
      }

      const parsedDate = new Date();
      const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

      const arAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.AR } });
      const depositAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.CUSTOMER_DEPOSIT } });
      if (!arAccount || !depositAccount) throw new BusinessError('Konfigurasi akun AR/Uang Muka Pelanggan tidak ditemukan.');

      const applyAmountNum = applyAmount.toNumber();

      // Create journal: DR Uang Muka Pelanggan / CR Piutang Usaha
      const jvNumber = await generateDocumentNumber(tx, 'JV', parsedDate, fiscalYear.id);
      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber: jvNumber,
          date: parsedDate,
          narration: `Aplikasi Uang Muka Pelanggan: ${deposit.paymentNumber} → ${invoice.invoiceNumber}`,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: [
              { accountId: depositAccount.id, partyId: invoice.partyId, debit: applyAmountNum, credit: 0, description: `Aplikasi UM Pelanggan: ${deposit.paymentNumber}` },
              { accountId: arAccount.id, partyId: invoice.partyId, debit: 0, credit: applyAmountNum, description: `Aplikasi UM Pelanggan: ${deposit.paymentNumber}` },
            ],
          },
        },
      });

      await tx.accountingLedgerEntry.createMany({
        data: [
          { date: parsedDate, accountId: depositAccount.id, partyId: invoice.partyId, debit: applyAmountNum, credit: 0, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Aplikasi UM Pelanggan: ${deposit.paymentNumber}`, fiscalYearId: fiscalYear.id },
          { date: parsedDate, accountId: arAccount.id, partyId: invoice.partyId, debit: 0, credit: applyAmountNum, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Aplikasi UM Pelanggan: ${deposit.paymentNumber}`, fiscalYearId: fiscalYear.id },
        ],
      });

      await updateAccountBalance(tx, depositAccount.id, applyAmountNum, 0);  // DR liability (reduce)
      await updateAccountBalance(tx, arAccount.id, 0, applyAmountNum);       // CR AR (reduce)

      // Update invoice outstanding
      const newOutstanding = invoiceOutstanding.minus(applyAmount);
      const newStatus = newOutstanding.lte(new Decimal('0.01')) ? 'Paid' : 'PartiallyPaid';
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { outstanding: newOutstanding.toNumber(), status: newStatus },
      });

      // Update party balances
      await tx.party.update({
        where: { id: invoice.partyId },
        data: {
          outstandingAmount: { decrement: applyAmountNum },
          customerDepositBalance: { decrement: applyAmountNum },
        },
      });

      // Create application record
      const application = await tx.customerDepositApplication.create({
        data: {
          depositPaymentId: deposit.id,
          salesInvoiceId: invoice.id,
          appliedAmount: applyAmountNum,
          journalEntryId: journalEntry.id,
          createdBy: req.user!.userId,
        },
      });

      return application;
    }, { timeout: 15000 });

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /customer-deposits/apply', 'Gagal mengaplikasikan uang muka pelanggan.');
  }
});

// POST /api/customer-deposits/apply/:id/cancel — cancel deposit application
router.post('/apply/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const application = await tx.customerDepositApplication.findUnique({
        where: { id: req.params.id as string },
        include: {
          depositPayment: true,
          salesInvoice: { include: { customer: true } },
          journalEntry: { include: { items: true } },
        },
      });
      if (!application) throw new BusinessError('Aplikasi uang muka tidak ditemukan.');
      if (application.isCancelled) throw new BusinessError('Aplikasi sudah dibatalkan.');

      const applyAmount = new Decimal(application.appliedAmount.toString());
      const applyAmountNum = applyAmount.toNumber();

      // Cancel journal entry
      if (application.journalEntry) {
        await tx.journalEntry.update({
          where: { id: application.journalEntry.id },
          data: { status: 'Cancelled', cancelledAt: new Date() },
        });
        await tx.accountingLedgerEntry.updateMany({
          where: { referenceId: application.journalEntry.id },
          data: { isCancelled: true },
        });

        // Reverse account balances from journal items
        for (const item of application.journalEntry.items) {
          await updateAccountBalance(tx, item.accountId, Number(item.credit), Number(item.debit));
        }
      }

      // Restore invoice outstanding
      const invoice = application.salesInvoice;
      const newOutstanding = new Decimal(invoice.outstanding.toString()).plus(applyAmount);
      const newStatus = newOutstanding.gte(new Decimal(invoice.grandTotal.toString())) ? 'Submitted' : 'PartiallyPaid';
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { outstanding: newOutstanding.toNumber(), status: newStatus },
      });

      // Restore party balances
      await tx.party.update({
        where: { id: invoice.partyId },
        data: {
          outstandingAmount: { increment: applyAmountNum },
          customerDepositBalance: { increment: applyAmountNum },
        },
      });

      // Mark application as cancelled
      await tx.customerDepositApplication.update({
        where: { id: application.id },
        data: { isCancelled: true, cancelledAt: new Date() },
      });

      return { id: application.id, status: 'Cancelled' };
    }, { timeout: 15000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /customer-deposits/apply/:id/cancel', 'Gagal membatalkan aplikasi uang muka pelanggan.');
  }
});

export default router;
