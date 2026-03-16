import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateAccountBalance } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { CreatePurchaseInvoiceSchema } from '../utils/schemas';
import { BusinessError } from '../utils/errors';
import { ACCOUNT_NUMBERS } from '../constants/accountNumbers';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/purchase/invoices
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '50', status, partyId } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const where: Prisma.PurchaseInvoiceWhereInput = {};
    if (status) where.status = status as any;
    if (partyId) where.partyId = partyId as string;

    const [invoices, total] = await Promise.all([
      prisma.purchaseInvoice.findMany({
        where,
        include: { supplier: true, items: true },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.purchaseInvoice.count({ where }),
    ]);

    return res.json({ data: invoices, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /purchase/invoices error');
    return res.status(500).json({ error: 'Gagal mengambil data invoice pembelian.' });
  }
});

// POST /api/purchase/invoices — create purchase invoice
router.post('/', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(CreatePurchaseInvoiceSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const parsedDate = new Date(body.date);
      const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

      const apAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.AP } });
      const inventoryAccount = await tx.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.INVENTORY } });
      if (!apAccount || !inventoryAccount) throw new BusinessError('Konfigurasi akun AP/Persediaan tidak ditemukan.');

      const subtotal = body.items.reduce((sum, item) => {
        const base = item.quantity * item.rate;
        const disc = base * ((item.discount ?? 0) / 100);
        return sum + base - disc;
      }, 0);
      const taxAmount = subtotal * ((body.taxPct ?? 0) / 100);
      const grandTotal = subtotal + taxAmount - (body.potongan ?? 0) + (body.biayaLain ?? 0);
      const invoiceNumber = await generateDocumentNumber(tx, 'PI', parsedDate, fiscalYear.id);

      const invoice = await tx.purchaseInvoice.create({
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
              accountId: inventoryAccount.id,
              description: item.description || null,
            })),
          },
        },
        include: { supplier: true, items: true },
      });

      // Auto-post journal entry: Dr Inventory, Cr AP
      const jvNumber = `JV-${invoice.invoiceNumber}`;
      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber: jvNumber,
          date: parsedDate,
          narration: `Pembelian: ${invoice.invoiceNumber} - ${invoice.supplier.name}`,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: [
              { accountId: inventoryAccount.id, debit: grandTotal, credit: 0, description: `Persediaan: ${invoice.invoiceNumber}` },
              { accountId: apAccount.id, partyId: body.partyId, debit: 0, credit: grandTotal, description: `Hutang: ${invoice.invoiceNumber}` },
            ],
          },
        },
      });

      await tx.accountingLedgerEntry.createMany({
        data: [
          { date: parsedDate, accountId: inventoryAccount.id, debit: grandTotal, credit: 0, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Persediaan: ${invoice.invoiceNumber}`, fiscalYearId: fiscalYear.id },
          { date: parsedDate, accountId: apAccount.id, partyId: body.partyId, debit: 0, credit: grandTotal, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Hutang: ${invoice.invoiceNumber}`, fiscalYearId: fiscalYear.id },
        ],
      });

      await updateAccountBalance(tx, inventoryAccount.id, grandTotal, 0);   // ASSET: debit → +balance
      await updateAccountBalance(tx, apAccount.id, 0, grandTotal);          // LIABILITY: credit → +balance
      await tx.party.update({ where: { id: body.partyId }, data: { outstandingAmount: { increment: grandTotal } } });

      return invoice;
    });

    return res.status(201).json(result);
  } catch (error: any) {
    if (error instanceof BusinessError) {
      return res.status(400).json({ error: error.message });
    }
    logger.error({ error }, 'POST /purchase/invoices error');
    return res.status(500).json({ error: 'Gagal menyimpan invoice pembelian.' });
  }
});

export default router;
