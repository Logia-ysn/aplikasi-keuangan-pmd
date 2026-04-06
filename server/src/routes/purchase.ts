import { Router } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateAccountBalance } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { CreatePurchaseInvoiceSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { systemAccounts } from '../services/systemAccounts';
import { logger } from '../lib/logger';
import { calcWeightedAverage } from '../utils/weightedAverage';

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

// GET /api/purchase/invoices/:id — detail single invoice
router.get('/:id', async (req, res) => {
  try {
    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id: req.params.id },
      include: {
        supplier: true,
        items: true,
        user: { select: { id: true, fullName: true } },
        depositApplications: {
          where: { isCancelled: false },
          include: {
            depositPayment: { select: { id: true, paymentNumber: true, date: true, amount: true } },
          },
        },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });

    const allocations = await prisma.paymentAllocation.findMany({
      where: { invoiceType: 'PurchaseInvoice', invoiceId: invoice.id },
      include: { payment: { select: { id: true, paymentNumber: true, date: true, amount: true, referenceNo: true } } },
      orderBy: { payment: { date: 'desc' } },
    });

    return res.json({ ...invoice, paymentAllocations: allocations });
  } catch (error) {
    logger.error({ error }, 'GET /purchase/invoices/:id error');
    return res.status(500).json({ error: 'Gagal mengambil detail invoice.' });
  }
});

// POST /api/purchase/invoices — create purchase invoice
router.post('/', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const body = validateBody(CreatePurchaseInvoiceSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const parsedDate = new Date(body.date);
      if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');
      const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

      const party = await tx.party.findUnique({ where: { id: body.partyId } });
      if (!party) throw new BusinessError('Data supplier tidak ditemukan.');
      if (!party.isActive) throw new BusinessError('Supplier sudah tidak aktif.');

      const apAccount = await systemAccounts.getAccount('AP');
      const inventoryAccount = await systemAccounts.getAccount('INVENTORY');

      const itemsWithAmount = body.items.map((item) => {
        const base = new Decimal(item.quantity).mul(new Decimal(item.rate));
        const disc = base.mul(new Decimal(item.discount ?? 0).div(100));
        const amount = base.minus(disc).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        return { ...item, computedAmount: amount };
      });
      const subtotal = itemsWithAmount.reduce((sum, item) => sum.plus(item.computedAmount), new Decimal(0));
      // Per-item tax: sum each item's tax amount
      const taxAmount = itemsWithAmount.reduce((sum, item) => {
        return sum.plus(item.computedAmount.mul(new Decimal(item.taxPct ?? 0).div(100)));
      }, new Decimal(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const grandTotal = subtotal
        .plus(taxAmount)
        .minus(new Decimal(body.potongan ?? 0))
        .plus(new Decimal(body.biayaLain ?? 0))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const grandTotalNum = grandTotal.toNumber();
      const invoiceNumber = await generateDocumentNumber(tx, 'PI', parsedDate, fiscalYear.id);

      // Pre-fetch inventory items to resolve item-specific accounts
      const invItemIds = body.items.map((i) => i.inventoryItemId).filter(Boolean) as string[];
      const inventoryItems = invItemIds.length > 0
        ? await tx.inventoryItem.findMany({ where: { id: { in: invItemIds } } })
        : [];
      const invItemMap = new Map(inventoryItems.map((i) => [i.id, i]));

      const invoice = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber,
          date: parsedDate,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          partyId: body.partyId,
          grandTotal: grandTotalNum,
          outstanding: grandTotalNum,
          taxPct: 0, // tax is per-item now
          potongan: body.potongan ?? 0,
          biayaLain: body.biayaLain ?? 0,
          status: 'Submitted',
          notes: body.notes || null,
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: itemsWithAmount.map((item) => {
              const linkedItem = item.inventoryItemId ? invItemMap.get(item.inventoryItemId) : null;
              const itemAccountId = linkedItem?.accountId || inventoryAccount.id;
              return {
                itemName: item.itemName,
                inventoryItemId: item.inventoryItemId || null,
                quantity: item.quantity,
                unit: item.unit || 'pcs',
                rate: item.rate,
                discount: item.discount ?? 0,
                amount: item.computedAmount.toNumber(),
                taxPct: item.taxPct ?? 0,
                accountId: itemAccountId,
                description: item.description || null,
              };
            }),
          },
        },
        include: { supplier: true, items: true },
      });

      // Landed cost allocation: distribute non-linked items' cost + invoice-level
      // adjustment (biayaLain - potongan) to linked items proportionally by value.
      // Non-linked = service/fee items (rental, commission, risk) and discounts/extras
      // are folded into COGS of the goods received, not left in generic 1.4.0.
      const linkedInvItems = invoice.items.filter((i) => i.inventoryItemId);
      const nonLinkedInvItems = invoice.items.filter((i) => !i.inventoryItemId);
      const linkedSubtotal = linkedInvItems.reduce((s, i) => s.plus(new Decimal(i.amount.toString())), new Decimal(0));
      const nonLinkedTotal = nonLinkedInvItems.reduce((s, i) => s.plus(new Decimal(i.amount.toString())), new Decimal(0));
      const adjustmentRemainder = new Decimal(body.biayaLain ?? 0).minus(new Decimal(body.potongan ?? 0));
      const landedCostPool = nonLinkedTotal.plus(adjustmentRemainder);
      const canDistribute = linkedInvItems.length > 0 && linkedSubtotal.gt(0) && !landedCostPool.isZero();

      // effectiveAmount per invoice item (original + allocated share)
      const effectiveAmountMap = new Map<string, Decimal>();
      if (canDistribute) {
        let allocatedSoFar = new Decimal(0);
        linkedInvItems.forEach((invItem, idx) => {
          const original = new Decimal(invItem.amount.toString());
          let share: Decimal;
          if (idx === linkedInvItems.length - 1) {
            // Last item absorbs rounding remainder
            share = landedCostPool.minus(allocatedSoFar);
          } else {
            share = landedCostPool.mul(original).div(linkedSubtotal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
            allocatedSoFar = allocatedSoFar.plus(share);
          }
          effectiveAmountMap.set(invItem.id, original.plus(share));
        });
      }

      // Auto-post journal entry: Dr Inventory (per item account), Cr AP
      // Build DR entries using item-specific inventory accounts when available
      const debitByAccount = new Map<string, { amount: number; names: string[] }>();
      let itemsTotal = 0;

      for (const invItem of invoice.items) {
        // Skip non-linked items when landed cost distribution is active
        // (their cost has been absorbed into linked items' effective amount)
        if (canDistribute && !invItem.inventoryItemId) continue;

        let drAccountId = inventoryAccount.id; // default: generic 1.4.0

        if (invItem.inventoryItemId) {
          const linkedItem = await tx.inventoryItem.findUnique({ where: { id: invItem.inventoryItemId } });
          if (linkedItem?.accountId) {
            drAccountId = linkedItem.accountId; // use item-specific account (e.g. 1.4.5)
          }
        }

        const effective = effectiveAmountMap.get(invItem.id);
        const amt = effective ? effective.toNumber() : Number(invItem.amount);
        itemsTotal += amt;
        const existing = debitByAccount.get(drAccountId);
        if (existing) {
          existing.amount += amt;
          existing.names.push(invItem.itemName);
        } else {
          debitByAccount.set(drAccountId, { amount: amt, names: [invItem.itemName] });
        }
      }

      // Note: adjustmentRemainder (potongan/biayaLain) is now folded into landedCostPool
      // above and distributed proportionally to linked items. If canDistribute is false
      // (no linked items), fallback: apply to generic 1.4.0 to keep books balanced.
      if (!canDistribute && !adjustmentRemainder.isZero()) {
        const adjNum = adjustmentRemainder.toNumber();
        const existing = debitByAccount.get(inventoryAccount.id);
        if (existing) {
          existing.amount += adjNum;
        } else {
          debitByAccount.set(inventoryAccount.id, { amount: adjNum, names: ['Biaya tambahan'] });
        }
      }

      // Add tax GL entry (DR PPN Masukan / TAX_INPUT) if there's any tax
      const taxAmountNum = taxAmount.toNumber();
      if (taxAmountNum > 0) {
        const taxInputAccount = await systemAccounts.getAccount('TAX_INPUT');
        debitByAccount.set(taxInputAccount.id, { amount: taxAmountNum, names: ['PPN Masukan'] });
      }

      const jvNumber = `JV-${invoice.invoiceNumber}`;
      const debitJournalItems = Array.from(debitByAccount.entries()).map(([accountId, data]) => ({
        accountId,
        debit: data.amount,
        credit: 0,
        description: `Persediaan ${data.names.join(', ')}: ${invoice.invoiceNumber}`,
      }));

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
              ...debitJournalItems,
              { accountId: apAccount.id, partyId: body.partyId, debit: 0, credit: grandTotalNum, description: `Hutang: ${invoice.invoiceNumber}` },
            ],
          },
        },
      });

      // Post to immutable ledger
      const ledgerData = [
        ...debitJournalItems.map((d) => ({
          date: parsedDate, accountId: d.accountId, debit: d.debit, credit: 0,
          referenceType: 'JournalEntry', referenceId: journalEntry.id,
          description: d.description, fiscalYearId: fiscalYear.id,
        })),
        {
          date: parsedDate, accountId: apAccount.id, partyId: body.partyId,
          debit: 0, credit: grandTotalNum,
          referenceType: 'JournalEntry', referenceId: journalEntry.id,
          description: `Hutang: ${invoice.invoiceNumber}`, fiscalYearId: fiscalYear.id,
        },
      ];
      await tx.accountingLedgerEntry.createMany({ data: ledgerData });

      // Update account balances
      for (const [accountId, data] of debitByAccount.entries()) {
        await updateAccountBalance(tx, accountId, data.amount, 0); // ASSET: debit → +balance
      }
      await updateAccountBalance(tx, apAccount.id, 0, grandTotalNum); // LIABILITY: credit → +balance
      await tx.party.update({ where: { id: body.partyId }, data: { outstandingAmount: { increment: grandTotalNum } } });

      // Auto-create stock movements for items linked to inventory
      for (const item of invoice.items) {
        const invItemId = item.inventoryItemId;
        if (!invItemId) continue;

        const inventoryItem = await tx.inventoryItem.findUnique({ where: { id: invItemId } });
        if (!inventoryItem || !inventoryItem.isActive) continue;

        const movementNumber = await generateDocumentNumber(tx, 'SM', parsedDate, fiscalYear.id);
        // Use effectiveAmount (original + allocated landed cost) for inventory valuation
        const effectiveAmount = effectiveAmountMap.get(item.id) ?? new Decimal(item.amount.toString());
        const unitCost = effectiveAmount.div(new Decimal(item.quantity.toString())).toDecimalPlaces(2).toNumber();
        const totalValue = effectiveAmount.toNumber();

        // Recalculate weighted average cost
        const newAvgCost = calcWeightedAverage(
          inventoryItem.currentStock,
          inventoryItem.averageCost,
          Number(item.quantity),
          unitCost,
        );

        await tx.inventoryItem.update({
          where: { id: inventoryItem.id },
          data: {
            currentStock: { increment: Number(item.quantity) },
            averageCost: newAvgCost,
          },
        });

        await tx.stockMovement.create({
          data: {
            movementNumber,
            date: parsedDate,
            itemId: inventoryItem.id,
            movementType: 'In',
            quantity: Number(item.quantity),
            unitCost,
            totalValue,
            referenceType: 'PurchaseInvoice',
            referenceId: invoice.id,
            notes: `Auto dari ${invoice.invoiceNumber}`,
            createdById: req.user!.userId,
            fiscalYearId: fiscalYear.id,
          },
        });

        logger.info({ invoiceId: invoice.id, itemId: inventoryItem.id, qty: Number(item.quantity) }, 'Auto stock movement from purchase');
      }

      return invoice;
    }, { timeout: 15000 });

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /purchase/invoices', 'Gagal menyimpan invoice pembelian.');
  }
});

// PUT /api/purchase/invoices/:id — edit invoice (notes, dueDate)
router.put('/:id', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  try {
    const invoice = await prisma.purchaseInvoice.findUnique({ where: { id: req.params.id as string } });
    if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });
    if (invoice.status === 'Cancelled') return res.status(400).json({ error: 'Invoice sudah dibatalkan, tidak bisa diedit.' });

    const { notes, dueDate } = req.body;
    const data: Prisma.PurchaseInvoiceUpdateInput = {};
    if (notes !== undefined) data.notes = notes;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

    const updated = await prisma.purchaseInvoice.update({ where: { id: invoice.id }, data });
    return res.json(updated);
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /purchase/invoices/:id', 'Gagal memperbarui invoice.');
  }
});

// POST /api/purchase/invoices/:id/cancel — cancel purchase invoice
router.post('/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: req.params.id as string },
        include: { supplier: true },
      });
      if (!invoice) throw new BusinessError('Invoice tidak ditemukan.');
      if (invoice.status === 'Cancelled') throw new BusinessError('Invoice sudah dibatalkan.');
      if (invoice.status === 'Paid') throw new BusinessError('Invoice sudah lunas, tidak bisa dibatalkan.');

      const allocations = await tx.paymentAllocation.findMany({
        where: { invoiceType: 'PurchaseInvoice', invoiceId: invoice.id },
      });
      if (allocations.length > 0) {
        throw new BusinessError('Invoice memiliki pembayaran teralokasi. Batalkan pembayaran terlebih dahulu.');
      }

      const activeDepositApps = await tx.vendorDepositApplication.count({
        where: { purchaseInvoiceId: invoice.id, isCancelled: false },
      });
      if (activeDepositApps > 0) {
        throw new BusinessError('Invoice memiliki alokasi uang muka aktif. Batalkan alokasi terlebih dahulu.');
      }

      await tx.purchaseInvoice.update({
        where: { id: invoice.id },
        data: { status: 'Cancelled', outstanding: 0, cancelledAt: new Date() },
      });

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

      // Reverse account balances from journal entry items (swap debit/credit)
      if (journal) {
        const jeItems = await tx.journalItem.findMany({ where: { journalEntryId: journal.id } });
        for (const jeItem of jeItems) {
          await updateAccountBalance(tx, jeItem.accountId, Number(jeItem.credit), Number(jeItem.debit));
        }
      } else {
        // Fallback: reverse generic accounts
        const apAccount = await systemAccounts.getAccount('AP');
        const inventoryAccount = await systemAccounts.getAccount('INVENTORY');
        await updateAccountBalance(tx, inventoryAccount.id, 0, Number(invoice.grandTotal));
        await updateAccountBalance(tx, apAccount.id, Number(invoice.grandTotal), 0);
      }

      await tx.party.update({
        where: { id: invoice.partyId },
        data: { outstandingAmount: { decrement: Number(invoice.grandTotal) } },
      });

      // Reverse stock movements created from this invoice
      const stockMovements = await tx.stockMovement.findMany({
        where: { referenceType: 'PurchaseInvoice', referenceId: invoice.id, isCancelled: false },
      });
      for (const sm of stockMovements) {
        await tx.inventoryItem.update({
          where: { id: sm.itemId },
          data: { currentStock: { decrement: Number(sm.quantity) } },
        });
        await tx.stockMovement.update({
          where: { id: sm.id },
          data: { isCancelled: true },
        });
      }

      return { id: invoice.id, status: 'Cancelled' };
    }, { timeout: 15000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /purchase/invoices/:id/cancel', 'Gagal membatalkan invoice.');
  }
});

export default router;
