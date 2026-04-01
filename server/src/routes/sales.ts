import { Router } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateAccountBalance } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { CreateSalesInvoiceSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { systemAccounts } from '../services/systemAccounts';
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
        items: { include: { serviceItem: { select: { id: true, code: true, name: true } } } },
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

    // Get customer deposit applications for this invoice
    const depositApplications = await prisma.customerDepositApplication.findMany({
      where: { salesInvoiceId: invoice.id, isCancelled: false },
      include: { depositPayment: { select: { id: true, paymentNumber: true, date: true, amount: true } } },
      orderBy: { appliedAt: 'desc' },
    });

    return res.json({ ...invoice, paymentAllocations: allocations, depositApplications });
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

      const arAccount = await systemAccounts.getAccount('AR');
      const salesAccount = await systemAccounts.getAccount('SALES');

      const inventoryAccount = await systemAccounts.getAccount('INVENTORY');
      const cogsAccount = await systemAccounts.getAccount('COGS');

      // Resolve per-item accountId (service items may have their own revenue account)
      const resolvedItems: Array<{
        itemName: string; itemType: string; inventoryItemId: string | null;
        serviceItemId: string | null; quantity: number; unit: string;
        rate: number; discount: number; amount: number; accountId: string;
        description: string | null;
      }> = [];

      for (const item of body.items) {
        const itemAmount = new Decimal(item.quantity)
          .mul(new Decimal(item.rate))
          .mul(new Decimal(1).minus(new Decimal(item.discount ?? 0).div(100)))
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .toNumber();

        // Determine the revenue account for this line
        let lineAccountId = salesAccount.id;
        if (item.accountId) {
          const customAccount = await tx.account.findUnique({ where: { id: item.accountId } });
          if (customAccount) lineAccountId = customAccount.id;
        } else if (item.serviceItemId) {
          const svc = await tx.serviceItem.findUnique({ where: { id: item.serviceItemId } });
          if (svc) lineAccountId = svc.accountId;
        }

        resolvedItems.push({
          itemName: item.itemName,
          itemType: item.itemType || 'product',
          inventoryItemId: item.inventoryItemId || null,
          serviceItemId: item.serviceItemId || null,
          quantity: item.quantity,
          unit: item.unit || 'pcs',
          rate: item.rate,
          discount: item.discount ?? 0,
          amount: itemAmount,
          accountId: lineAccountId,
          description: item.description || null,
        });
      }

      const subtotal = resolvedItems.reduce((sum, item) => sum.plus(new Decimal(item.amount)), new Decimal(0));
      const taxAmount = subtotal.mul(new Decimal(body.taxPct ?? 0).div(100));
      const grandTotal = subtotal
        .plus(taxAmount)
        .minus(new Decimal(body.potongan ?? 0))
        .plus(new Decimal(body.biayaLain ?? 0))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const grandTotalNum = grandTotal.toNumber();
      const invoiceNumber = await generateDocumentNumber(tx, 'SI', parsedDate, fiscalYear.id);

      const invoice = await tx.salesInvoice.create({
        data: {
          invoiceNumber,
          date: parsedDate,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          partyId: body.partyId,
          grandTotal: grandTotalNum,
          outstanding: grandTotalNum,
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
          items: { create: resolvedItems },
        },
        include: { customer: true, items: true },
      });

      // Group line items by accountId for multi-account GL posting
      const revenueByAccount = new Map<string, Decimal>();
      for (const ri of resolvedItems) {
        const prev = revenueByAccount.get(ri.accountId) ?? new Decimal(0);
        revenueByAccount.set(ri.accountId, prev.plus(new Decimal(ri.amount)));
      }

      // Adjustment for tax/potongan/biayaLain: allocate to the largest revenue account
      const adjustmentAmount = grandTotal.minus(subtotal);
      if (!adjustmentAmount.isZero()) {
        let primaryAccountId = salesAccount.id;
        let maxAmount = new Decimal(0);
        for (const [accId, amt] of revenueByAccount) {
          if (amt.greaterThan(maxAmount)) { maxAmount = amt; primaryAccountId = accId; }
        }
        const prev = revenueByAccount.get(primaryAccountId) ?? new Decimal(0);
        revenueByAccount.set(primaryAccountId, prev.plus(adjustmentAmount));
      }

      // Build multi-line journal: 1 DR (AR) + N CR (revenue accounts)
      const creditJournalItems: Array<{ accountId: string; debit: number; credit: number; description: string }> = [];
      for (const [accId, amt] of revenueByAccount) {
        const creditNum = amt.toDecimalPlaces(2).toNumber();
        if (creditNum === 0) continue;
        const acc = await tx.account.findUnique({ where: { id: accId }, select: { name: true } });
        creditJournalItems.push({
          accountId: accId, debit: 0, credit: creditNum,
          description: `${acc?.name ?? 'Penjualan'}: ${invoice.invoiceNumber}`,
        });
      }

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
              { accountId: arAccount.id, partyId: body.partyId, debit: grandTotalNum, credit: 0, description: `Piutang: ${invoice.invoiceNumber}` },
              ...creditJournalItems,
            ],
          },
        },
      });

      // Ledger entries: 1 DR + N CR
      const ledgerData = [
        { date: parsedDate, accountId: arAccount.id, partyId: body.partyId, debit: grandTotalNum, credit: 0, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Piutang: ${invoice.invoiceNumber}`, fiscalYearId: fiscalYear.id },
        ...creditJournalItems.map((ci) => ({
          date: parsedDate, accountId: ci.accountId, debit: 0, credit: ci.credit,
          referenceType: 'JournalEntry', referenceId: journalEntry.id,
          description: ci.description, fiscalYearId: fiscalYear.id,
        })),
      ];
      await tx.accountingLedgerEntry.createMany({ data: ledgerData });

      // Update account balances: DR AR + CR each revenue account
      await updateAccountBalance(tx, arAccount.id, grandTotalNum, 0);
      for (const ci of creditJournalItems) {
        await updateAccountBalance(tx, ci.accountId, 0, ci.credit);
      }
      await tx.party.update({ where: { id: body.partyId }, data: { outstandingAmount: { increment: grandTotalNum } } });

      // Auto-deduct inventory for items linked to InventoryItem
      let totalCogs = new Decimal(0);
      for (const item of invoice.items) {
        const invItemId = item.inventoryItemId;
        if (!invItemId) continue;

        const inventoryItem = await tx.inventoryItem.findUnique({ where: { id: invItemId } });
        if (!inventoryItem || !inventoryItem.isActive) continue;

        const qty = Number(item.quantity);
        const lineAmount = Number(item.amount);

        // Reduce stock
        await tx.inventoryItem.update({
          where: { id: inventoryItem.id },
          data: { currentStock: { decrement: qty } },
        });

        // Create stock movement Out
        const movementNumber = await generateDocumentNumber(tx, 'SM', parsedDate, fiscalYear.id);
        const unitCost = new Decimal(item.amount.toString()).div(new Decimal(item.quantity.toString())).toDecimalPlaces(2).toNumber();
        await tx.stockMovement.create({
          data: {
            movementNumber,
            date: parsedDate,
            itemId: inventoryItem.id,
            movementType: 'Out',
            quantity: qty,
            unitCost,
            totalValue: lineAmount,
            referenceType: 'SalesInvoice',
            referenceId: invoice.id,
            notes: `Auto dari ${invoice.invoiceNumber}`,
            createdById: req.user!.userId,
            fiscalYearId: fiscalYear.id,
          },
        });

        totalCogs = totalCogs.plus(new Decimal(lineAmount));
        logger.info({ invoiceId: invoice.id, itemId: inventoryItem.id, qty }, 'Auto stock deduction from sales');
      }

      // Post COGS journal if any inventory items were sold
      const totalCogsNum = totalCogs.toDecimalPlaces(2).toNumber();
      if (totalCogsNum > 0) {
        const cogsJvNumber = `JV-COGS-${invoice.invoiceNumber}`;
        const cogsJournal = await tx.journalEntry.create({
          data: {
            entryNumber: cogsJvNumber,
            date: parsedDate,
            narration: `HPP Penjualan: ${invoice.invoiceNumber} - ${invoice.customer.name}`,
            status: 'Submitted',
            fiscalYearId: fiscalYear.id,
            createdBy: req.user!.userId,
            submittedAt: new Date(),
            items: {
              create: [
                { accountId: cogsAccount.id, debit: totalCogsNum, credit: 0, description: `HPP: ${invoice.invoiceNumber}` },
                { accountId: inventoryAccount.id, debit: 0, credit: totalCogsNum, description: `Persediaan keluar: ${invoice.invoiceNumber}` },
              ],
            },
          },
        });

        await tx.accountingLedgerEntry.createMany({
          data: [
            { date: parsedDate, accountId: cogsAccount.id, debit: totalCogsNum, credit: 0, referenceType: 'JournalEntry', referenceId: cogsJournal.id, description: `HPP: ${invoice.invoiceNumber}`, fiscalYearId: fiscalYear.id },
            { date: parsedDate, accountId: inventoryAccount.id, debit: 0, credit: totalCogsNum, referenceType: 'JournalEntry', referenceId: cogsJournal.id, description: `Persediaan keluar: ${invoice.invoiceNumber}`, fiscalYearId: fiscalYear.id },
          ],
        });

        await updateAccountBalance(tx, cogsAccount.id, totalCogsNum, 0);        // EXPENSE: debit → +balance
        await updateAccountBalance(tx, inventoryAccount.id, 0, totalCogsNum);    // ASSET: credit → -balance
      }

      return invoice;
    }, { timeout: 15000 });

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /sales/invoices', 'Gagal menyimpan invoice penjualan.');
  }
});

// PUT /api/sales/invoices/:id — edit invoice (notes, dueDate, terms)
router.put('/:id', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  try {
    const invoice = await prisma.salesInvoice.findUnique({ where: { id: req.params.id as string } });
    if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });
    if (invoice.status === 'Cancelled') return res.status(400).json({ error: 'Invoice sudah dibatalkan, tidak bisa diedit.' });

    const { notes, dueDate, terms } = req.body;
    const data: Prisma.SalesInvoiceUpdateInput = {};
    if (notes !== undefined) data.notes = notes;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (terms !== undefined) data.terms = terms || null;

    const updated = await prisma.salesInvoice.update({ where: { id: invoice.id }, data });
    return res.json(updated);
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /sales/invoices/:id', 'Gagal memperbarui invoice.');
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

      // Check for active customer deposit applications
      const activeDepositApps = await tx.customerDepositApplication.count({
        where: { salesInvoiceId: invoice.id, isCancelled: false },
      });
      if (activeDepositApps > 0) {
        throw new BusinessError('Invoice memiliki alokasi uang muka pelanggan aktif. Batalkan alokasi terlebih dahulu.');
      }

      // Cancel the invoice
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { status: 'Cancelled', outstanding: 0, cancelledAt: new Date() },
      });

      // Cancel ledger entries from the auto-posted journal
      const jvNumber = `JV-${invoice.invoiceNumber}`;
      const journal = await tx.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
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

      // Reverse account balances using journal items (supports multi-account)
      if (journal) {
        const journalItems = await tx.journalItem.findMany({ where: { journalEntryId: journal.id } });
        for (const ji of journalItems) {
          await updateAccountBalance(tx, ji.accountId, Number(ji.credit), Number(ji.debit));
        }
      }

      // Reverse COGS journal if exists
      const cogsJvNumber = `JV-COGS-${invoice.invoiceNumber}`;
      const cogsJournal = await tx.journalEntry.findUnique({ where: { entryNumber: cogsJvNumber } });
      if (cogsJournal) {
        await tx.journalEntry.update({
          where: { id: cogsJournal.id },
          data: { status: 'Cancelled', cancelledAt: new Date() },
        });
        await tx.accountingLedgerEntry.updateMany({
          where: { referenceId: cogsJournal.id },
          data: { isCancelled: true },
        });

        // Reverse COGS and inventory balances
        const cogsAccount = await systemAccounts.getAccount('COGS');
        const inventoryAccount = await systemAccounts.getAccount('INVENTORY');
        // Sum the COGS amount from journal items
        const cogsItems = await tx.journalItem.findMany({ where: { journalEntryId: cogsJournal.id } });
        const cogsDebitTotal = cogsItems.reduce((sum, ji) => sum + Number(ji.debit), 0);
        if (cogsDebitTotal > 0) await updateAccountBalance(tx, cogsAccount.id, 0, cogsDebitTotal);
        if (cogsDebitTotal > 0) await updateAccountBalance(tx, inventoryAccount.id, cogsDebitTotal, 0);
      }

      // Reverse stock movements created from this invoice
      const stockMovements = await tx.stockMovement.findMany({
        where: { referenceType: 'SalesInvoice', referenceId: invoice.id, isCancelled: false },
      });
      for (const sm of stockMovements) {
        await tx.inventoryItem.update({
          where: { id: sm.itemId },
          data: { currentStock: { increment: Number(sm.quantity) } },
        });
        await tx.stockMovement.update({
          where: { id: sm.id },
          data: { isCancelled: true },
        });
      }

      // Reverse party outstanding
      await tx.party.update({
        where: { id: invoice.partyId },
        data: { outstandingAmount: { decrement: Number(invoice.grandTotal) } },
      });

      return { id: invoice.id, status: 'Cancelled' };
    }, { timeout: 15000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /sales/invoices/:id/cancel', 'Gagal membatalkan invoice.');
  }
});

export default router;
