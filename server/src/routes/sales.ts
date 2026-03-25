import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateAccountBalance } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { CreateSalesInvoiceSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { ACCOUNT_NUMBERS } from '../constants/accountNumbers';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/sales/invoices
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '50', status, partyId } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const where: Prisma.SalesInvoiceWhereInput = {};
    if (status) where.status = status as any;
    if (partyId) where.partyId = partyId as string;

    const [invoices, total] = await Promise.all([
      prisma.salesInvoice.findMany({
        where,
        include: { customer: true, items: true },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.salesInvoice.count({ where }),
    ]);

    return res.json({ data: invoices, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /sales/invoices error');
    return res.status(500).json({ error: 'Gagal mengambil data invoice penjualan.' });
  }
});

// GET /api/sales/invoices/:id — detail single invoice
router.get('/:id', async (req, res) => {
  try {
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        items: true,
        user: { select: { id: true, fullName: true } },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });

    // Get payment allocations for this invoice
    const allocations = await prisma.paymentAllocation.findMany({
      where: { invoiceType: 'SalesInvoice', invoiceId: invoice.id },
      include: { payment: { select: { id: true, paymentNumber: true, date: true, amount: true, referenceNo: true } } },
      orderBy: { payment: { date: 'desc' } },
    });

    return res.json({ ...invoice, paymentAllocations: allocations });
  } catch (error) {
    logger.error({ error }, 'GET /sales/invoices/:id error');
    return res.status(500).json({ error: 'Gagal mengambil detail invoice.' });
  }
});

// POST /api/sales/invoices — create sales invoice
router.post('/', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateSalesInvoiceSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const parsedDate = new Date(body.date);
      if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');
      const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

      const party = await tx.party.findUnique({ where: { id: body.partyId } });
      if (!party) throw new BusinessError('Data pelanggan tidak ditemukan.');
      if (!party.isActive) throw new BusinessError('Pelanggan sudah tidak aktif.');

      const arAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.AR } });
      const salesAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.SALES } });
      if (!arAccount || !salesAccount) throw new BusinessError('Konfigurasi akun AR/Penjualan tidak ditemukan.');

      const subtotal = body.items.reduce((sum, item) => {
        const base = item.quantity * item.rate;
        const disc = base * ((item.discount ?? 0) / 100);
        return sum + base - disc;
      }, 0);
      const taxAmount = subtotal * ((body.taxPct ?? 0) / 100);
      const grandTotal = subtotal + taxAmount - (body.potongan ?? 0) + (body.biayaLain ?? 0);
      const invoiceNumber = await generateDocumentNumber(tx, 'SI', parsedDate, fiscalYear.id);

      const invoice = await tx.salesInvoice.create({
        data: {
          invoiceNumber,
          date: parsedDate,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          partyId: body.partyId,
          grandTotal,
          outstanding: grandTotal,
          taxPct: body.taxPct ?? 0,
          potongan: body.potongan ?? 0,
          biayaLain: body.biayaLain ?? 0,
          labelPotongan: body.labelPotongan || null,
          labelBiaya: body.labelBiaya || null,
          terms: body.terms || null,
          status: 'Submitted',
          notes: body.notes || null,
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: body.items.map((item) => ({
              itemName: item.itemName,
              quantity: item.quantity,
              unit: item.unit || 'pcs',
              rate: item.rate,
              discount: item.discount ?? 0,
              amount: item.quantity * item.rate * (1 - (item.discount ?? 0) / 100),
              accountId: salesAccount.id,
              description: item.description || null,
            })),
          },
        },
        include: { customer: true, items: true },
      });

      // Auto-post journal entry: Dr AR, Cr Sales
      const jvNumber = `JV-${invoice.invoiceNumber}`;
      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber: jvNumber,
          date: parsedDate,
          narration: `Penjualan: ${invoice.invoiceNumber} - ${invoice.customer.name}`,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: [
              { accountId: arAccount.id, partyId: body.partyId, debit: grandTotal, credit: 0, description: `Piutang: ${invoice.invoiceNumber}` },
              { accountId: salesAccount.id, debit: 0, credit: grandTotal, description: `Penjualan: ${invoice.invoiceNumber}` },
            ],
          },
        },
      });

      await tx.accountingLedgerEntry.createMany({
        data: [
          { date: parsedDate, accountId: arAccount.id, partyId: body.partyId, debit: grandTotal, credit: 0, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Piutang: ${invoice.invoiceNumber}`, fiscalYearId: fiscalYear.id },
          { date: parsedDate, accountId: salesAccount.id, debit: 0, credit: grandTotal, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Penjualan: ${invoice.invoiceNumber}`, fiscalYearId: fiscalYear.id },
        ],
      });

      await updateAccountBalance(tx, arAccount.id, grandTotal, 0);       // ASSET: debit → +balance
      await updateAccountBalance(tx, salesAccount.id, 0, grandTotal);    // REVENUE: credit → +balance
      await tx.party.update({ where: { id: body.partyId }, data: { outstandingAmount: { increment: grandTotal } } });

      return invoice;
    }, { timeout: 15000 });

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /sales/invoices', 'Gagal menyimpan invoice penjualan.');
  }
});

// POST /api/sales/invoices/:id/cancel — cancel sales invoice
router.post('/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const invoice = await tx.salesInvoice.findUnique({
        where: { id: req.params.id as string },
        include: { customer: true },
      });
      if (!invoice) throw new BusinessError('Invoice tidak ditemukan.');
      if (invoice.status === 'Cancelled') throw new BusinessError('Invoice sudah dibatalkan.');
      if (invoice.status === 'Paid') throw new BusinessError('Invoice sudah lunas, tidak bisa dibatalkan.');

      // Check if there are payment allocations
      const allocations = await tx.paymentAllocation.findMany({
        where: { invoiceType: 'SalesInvoice', invoiceId: invoice.id },
      });
      if (allocations.length > 0) {
        throw new BusinessError('Invoice memiliki pembayaran teralokasi. Batalkan pembayaran terlebih dahulu.');
      }

      // Cancel the invoice
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { status: 'Cancelled', outstanding: 0 },
      });

      // Cancel related ledger entries
      await tx.accountingLedgerEntry.updateMany({
        where: { referenceId: invoice.id },
        data: { isCancelled: true },
      });

      // Also cancel ledger entries from the auto-posted journal
      const jvNumber = `JV-${invoice.invoiceNumber}`;
      const journal = await tx.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
      if (journal) {
        await tx.accountingLedgerEntry.updateMany({
          where: { referenceId: journal.id },
          data: { isCancelled: true },
        });
      }

      // Reverse account balances
      const arAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.AR } });
      const salesAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.SALES } });
      if (arAccount) await updateAccountBalance(tx, arAccount.id, 0, Number(invoice.grandTotal));
      if (salesAccount) await updateAccountBalance(tx, salesAccount.id, Number(invoice.grandTotal), 0);

      // Reverse party outstanding
      await tx.party.update({
        where: { id: invoice.partyId },
        data: { outstandingAmount: { decrement: Number(invoice.outstanding) } },
      });

      return { id: invoice.id, status: 'Cancelled' };
    }, { timeout: 15000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /sales/invoices/:id/cancel', 'Gagal membatalkan invoice.');
  }
});

export default router;
