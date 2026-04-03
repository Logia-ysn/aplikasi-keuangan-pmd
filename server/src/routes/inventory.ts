import { Router } from 'express';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreateInventoryItemSchema, UpdateInventoryItemSchema, CreateStockMovementSchema, UpdateStockMovementSchema, CreateProductionRunSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { generateDocumentNumber } from '../utils/documentNumber';
import { updateAccountBalance } from '../utils/accountBalance';
import { systemAccounts } from '../services/systemAccounts';
import { logger } from '../lib/logger';
import { calcWeightedAverage } from '../utils/weightedAverage';

const router = Router();

// ─── Items ────────────────────────────────────────────────────────────────────

// GET /api/inventory/items
router.get('/items', async (req, res) => {
  try {
    const { page = '1', limit = '100', search, isActive } = req.query;
    const take = Math.min(Number(limit) || 100, 200);
    const skip = (Number(page) - 1) * take;

    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { code: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [allItems, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        include: { account: { select: { id: true, name: true, accountNumber: true } } },
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    // Sort by current stock quantity descending
    allItems.sort((a, b) => Number(b.currentStock) - Number(a.currentStock));

    const items = allItems.slice(skip, skip + take);
    return res.json({ data: items, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/items error');
    return res.status(500).json({ error: 'Gagal mengambil data item stok.' });
  }
});

// POST /api/inventory/items
router.post('/items', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateInventoryItemSchema, req.body, res);
  if (!body) return;

  try {
    const existing = await prisma.inventoryItem.findUnique({ where: { code: body.code } });
    if (existing) throw new BusinessError(`Kode item '${body.code}' sudah digunakan.`);

    const item = await prisma.inventoryItem.create({
      data: {
        code: body.code,
        name: body.name,
        unit: body.unit,
        category: body.category || null,
        description: body.description || null,
        minimumStock: body.minimumStock ?? 0,
        accountId: body.accountId || null,
      },
      include: { account: { select: { id: true, name: true, accountNumber: true } } },
    });
    return res.status(201).json(item);
  } catch (error: any) {
    if (error instanceof BusinessError) return res.status(400).json({ error: error.message });
    logger.error({ error }, 'POST /inventory/items error');
    return res.status(500).json({ error: 'Gagal membuat item stok.' });
  }
});

// PUT /api/inventory/items/:id
router.put('/items/:id', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const body = validateBody(UpdateInventoryItemSchema, req.body, res);
  if (!body) return;

  try {
    const item = await prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(body.code && { code: body.code }),
        ...(body.name && { name: body.name }),
        ...(body.unit && { unit: body.unit }),
        category: body.category ?? undefined,
        description: body.description ?? undefined,
        ...(body.minimumStock !== undefined && { minimumStock: body.minimumStock }),
        ...(body.accountId !== undefined && { accountId: body.accountId || null }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      include: { account: { select: { id: true, name: true, accountNumber: true } } },
    });
    return res.json(item);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Item stok tidak ditemukan.' });
    if (error instanceof BusinessError) return res.status(400).json({ error: error.message });
    logger.error({ error }, 'PUT /inventory/items/:id error');
    return res.status(500).json({ error: 'Gagal mengupdate item stok.' });
  }
});

// DELETE /api/inventory/items/:id
router.delete('/items/:id', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;

    // Check if item has stock movements
    const movementCount = await prisma.stockMovement.count({
      where: { itemId: id, isCancelled: false },
    });
    if (movementCount > 0) {
      return res.status(400).json({
        error: `Item memiliki ${movementCount} mutasi stok aktif. Batalkan semua mutasi terlebih dahulu atau nonaktifkan item.`,
      });
    }

    // Check if item is used in purchase/sales invoice items
    const purchaseUsage = await prisma.purchaseInvoiceItem.count({ where: { inventoryItemId: id as string } });
    const salesUsage = await prisma.salesInvoiceItem.count({ where: { inventoryItemId: id as string } });
    if (purchaseUsage > 0 || salesUsage > 0) {
      return res.status(400).json({
        error: 'Item sudah digunakan di invoice. Nonaktifkan item jika tidak ingin dipakai lagi.',
      });
    }

    // Safe to delete — also remove cancelled movements
    await prisma.stockMovement.deleteMany({ where: { itemId: id as string } });
    await prisma.inventoryItem.delete({ where: { id: id as string } });

    return res.json({ message: 'Item stok berhasil dihapus.' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Item stok tidak ditemukan.' });
    logger.error({ error }, 'DELETE /inventory/items/:id error');
    return res.status(500).json({ error: 'Gagal menghapus item stok.' });
  }
});

// ─── Movements ────────────────────────────────────────────────────────────────

// GET /api/inventory/movements
router.get('/movements', async (req, res) => {
  try {
    const { page = '1', limit = '50', itemId, movementType, startDate, endDate } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const where: any = {};
    if (itemId) where.itemId = itemId;
    if (movementType) where.movementType = movementType;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          item: { select: { id: true, name: true, code: true, unit: true } },
          offsetAccount: { select: { id: true, name: true, accountNumber: true } },
        },
        orderBy: [{ movementNumber: 'desc' }],
        skip,
        take,
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return res.json({ data: movements, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/movements error');
    return res.status(500).json({ error: 'Gagal mengambil data gerakan stok.' });
  }
});

// POST /api/inventory/movements
router.post('/movements', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateStockMovementSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get active fiscal year for this transaction date
      const txDate = new Date(body.date);
      const fiscalYear = await tx.fiscalYear.findFirst({
        where: {
          isClosed: false,
          startDate: { lte: txDate },
          endDate: { gte: txDate },
        },
      });
      if (!fiscalYear) throw new BusinessError('Tidak ada tahun fiskal aktif untuk tanggal transaksi ini.');

      // 2. Get item
      const item = await tx.inventoryItem.findUnique({ where: { id: body.itemId } });
      if (!item) throw new BusinessError('Item stok tidak ditemukan.');
      if (!item.isActive) throw new BusinessError('Item stok tidak aktif.');

      const qty = body.quantity;
      const isOut = body.movementType === 'Out' || body.movementType === 'AdjustmentOut';
      const isIn = body.movementType === 'In' || body.movementType === 'AdjustmentIn';

      // 3. Validate stock availability (only for regular Out, not AdjustmentOut which is a correction)
      if (body.movementType === 'Out' && Number(item.currentStock) < qty) {
        throw new BusinessError(
          `Stok tidak cukup. Stok saat ini: ${Number(item.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${item.unit}`
        );
      }

      // 4. Generate movement number
      const movementDate = new Date(body.date);
      const movementNumber = await generateDocumentNumber(tx, 'SM', movementDate, fiscalYear.id);

      // 5. Calculate total value
      const unitCost = body.unitCost ?? 0;
      const totalValue = qty * unitCost;

      // 6. Update stock + weighted average cost
      const stockDelta = isIn ? qty : -qty;
      const updateData: Record<string, unknown> = { currentStock: { increment: stockDelta } };
      if (isIn && unitCost > 0) {
        updateData.averageCost = calcWeightedAverage(item.currentStock, item.averageCost, qty, unitCost);
      }
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: updateData,
      });

      // 7. GL posting — skip for Adjustment types (stock opname corrections)
      const isAdjustment = body.movementType === 'AdjustmentIn' || body.movementType === 'AdjustmentOut';
      let resolvedOffsetAccountId = body.offsetAccountId || null;
      let journalEntryId: string | null = null;
      if (totalValue > 0 && !isAdjustment) {
        // Use item's accountId or fall back to default INVENTORY account (1.4.0)
        let inventoryAccountId = item.accountId;
        if (!inventoryAccountId) {
          const defaultInvAccount = await systemAccounts.getAccount('INVENTORY');
          inventoryAccountId = defaultInvAccount.id;
        }

        // If no offset account provided, use Ekuitas Saldo Awal as default for opening stock
        if (!resolvedOffsetAccountId) {
          const openingEquity = await systemAccounts.getAccount('OPENING_EQUITY');
          resolvedOffsetAccountId = openingEquity.id;
        }

        // Prevent offset account being the same as inventory account (would cancel out)
        if (resolvedOffsetAccountId === inventoryAccountId) {
          const openingEquity = await systemAccounts.getAccount('OPENING_EQUITY');
          resolvedOffsetAccountId = openingEquity.id;
        }

        const userId = req.user!.userId;
        const typeLabels: Record<string, string> = {
          In: 'Stok Masuk',
          Out: 'Stok Keluar',
          AdjustmentIn: 'Penyesuaian Stok +',
          AdjustmentOut: 'Penyesuaian Stok −',
        };

        // Determine DR/CR
        let debitAccountId: string;
        let creditAccountId: string;

        if (isIn) {
          debitAccountId = inventoryAccountId;
          creditAccountId = resolvedOffsetAccountId!;
        } else {
          debitAccountId = resolvedOffsetAccountId!;
          creditAccountId = inventoryAccountId;
        }

        const entryNumber = await generateDocumentNumber(tx, 'JV', movementDate, fiscalYear.id);

        const je = await tx.journalEntry.create({
          data: {
            entryNumber,
            date: movementDate,
            status: 'Submitted',
            submittedAt: new Date(),
            narration: `${typeLabels[body.movementType]}: ${item.name} ${qty} ${item.unit}${body.notes ? ' - ' + body.notes : ''}`,
            fiscalYearId: fiscalYear.id,
            createdBy: userId,
            items: {
              create: [
                { accountId: debitAccountId, debit: totalValue, credit: 0 },
                { accountId: creditAccountId, debit: 0, credit: totalValue },
              ],
            },
          },
          include: { items: true },
        });

        // Post to immutable ledger
        await tx.accountingLedgerEntry.createMany({
          data: [
            {
              accountId: debitAccountId,
              date: movementDate,
              debit: totalValue,
              credit: 0,
              referenceType: 'StockMovement',
              referenceId: je.id,
              fiscalYearId: fiscalYear.id,
            },
            {
              accountId: creditAccountId,
              date: movementDate,
              debit: 0,
              credit: totalValue,
              referenceType: 'StockMovement',
              referenceId: je.id,
              fiscalYearId: fiscalYear.id,
            },
          ],
        });

        // Update account balances
        await updateAccountBalance(tx, debitAccountId, totalValue, 0);
        await updateAccountBalance(tx, creditAccountId, 0, totalValue);

        journalEntryId = je.id;
      }

      // 8. Create movement record
      const movement = await tx.stockMovement.create({
        data: {
          movementNumber,
          date: movementDate,
          itemId: item.id,
          movementType: body.movementType as any,
          quantity: qty,
          unitCost,
          totalValue,
          notes: body.notes || null,
          referenceType: body.referenceType || null,
          referenceId: body.referenceId || null,
          referenceNumber: body.referenceNumber || null,
          offsetAccountId: resolvedOffsetAccountId || body.offsetAccountId || null,
          journalEntryId,
          fiscalYearId: fiscalYear.id,
          createdById: req.user!.userId,
        },
        include: {
          item: { select: { id: true, name: true, code: true, unit: true } },
        },
      });

      return movement;
    }, { timeout: 15000 });

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /inventory/movements', 'Gagal mencatat gerakan stok.');
  }
});

// GET /api/inventory/movements/:id — single movement for edit
router.get('/movements/:id', async (req, res) => {
  try {
    const id = req.params.id as string;
    const movement = await prisma.stockMovement.findUnique({
      where: { id },
      include: {
        item: { select: { id: true, name: true, code: true, unit: true } },
        offsetAccount: { select: { id: true, name: true, accountNumber: true } },
      },
    });
    if (!movement) return res.status(404).json({ error: 'Gerakan stok tidak ditemukan.' });
    return res.json(movement);
  } catch (error) {
    return handleRouteError(res, error, 'GET /inventory/movements/:id', 'Gagal mengambil data gerakan stok.');
  }
});

// PUT /api/inventory/movements/:id — edit movement (cancel old + create new)
router.put('/movements/:id', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const body = validateBody(UpdateStockMovementSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Load existing movement
      const oldMov = await tx.stockMovement.findUnique({
        where: { id },
        include: { item: true },
      });
      if (!oldMov) throw new BusinessError('Gerakan stok tidak ditemukan.');
      if (oldMov.isCancelled) throw new BusinessError('Gerakan stok sudah dibatalkan, tidak bisa diedit.');

      // Reject if movement is linked to ProductionRun
      if (oldMov.referenceType === 'ProductionRun') {
        throw new BusinessError('Gerakan stok dari proses produksi tidak dapat diedit secara langsung.');
      }

      // 2. Reverse old stock impact
      const oldIsIn = oldMov.movementType === 'In' || oldMov.movementType === 'AdjustmentIn';
      const oldQty = Number(oldMov.quantity);
      const oldReverseDelta = oldIsIn ? -oldQty : oldQty;

      // Check if reversal would cause negative stock
      const currentStock = Number(oldMov.item.currentStock);
      if (currentStock + oldReverseDelta < 0) {
        throw new BusinessError('Tidak dapat mengedit: pembalikan stok lama menyebabkan stok negatif.');
      }

      await tx.inventoryItem.update({
        where: { id: oldMov.itemId },
        data: { currentStock: { increment: oldReverseDelta } },
      });

      // 3. Reverse old GL entries if exist
      if (oldMov.journalEntryId) {
        const oldJe = await tx.journalEntry.findUnique({
          where: { id: oldMov.journalEntryId },
          include: { items: true },
        });
        if (oldJe) {
          for (const jeItem of oldJe.items) {
            await updateAccountBalance(tx, jeItem.accountId, Number(jeItem.credit), Number(jeItem.debit));
          }
          await tx.accountingLedgerEntry.updateMany({
            where: { referenceId: oldMov.journalEntryId },
            data: { isCancelled: true },
          });
          await tx.journalEntry.update({
            where: { id: oldMov.journalEntryId },
            data: { status: 'Cancelled', cancelledAt: new Date() },
          });
        }
      }

      // 4. Apply new stock impact
      const newIsIn = body.movementType === 'In' || body.movementType === 'AdjustmentIn';
      const newIsOut = body.movementType === 'Out' || body.movementType === 'AdjustmentOut';
      const newQty = body.quantity;

      // Re-fetch stock after reversal
      const itemAfterReversal = await tx.inventoryItem.findUnique({ where: { id: oldMov.itemId } });
      if (!itemAfterReversal) throw new BusinessError('Item stok tidak ditemukan.');

      if (body.movementType === 'Out' && Number(itemAfterReversal.currentStock) < newQty) {
        throw new BusinessError(
          `Stok tidak cukup. Stok saat ini (setelah pembalikan): ${Number(itemAfterReversal.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${itemAfterReversal.unit}`
        );
      }

      const newStockDelta = newIsIn ? newQty : -newQty;
      await tx.inventoryItem.update({
        where: { id: oldMov.itemId },
        data: { currentStock: { increment: newStockDelta } },
      });

      // 5. Create new GL entries if needed (skip for Adjustment types)
      const newUnitCost = body.unitCost ?? 0;
      const newTotalValue = newQty * newUnitCost;
      let newJournalEntryId: string | null = null;
      let resolvedEditOffsetAccountId = body.offsetAccountId || null;
      const newIsAdjustment = body.movementType === 'AdjustmentIn' || body.movementType === 'AdjustmentOut';

      if (newTotalValue > 0 && !newIsAdjustment) {
        let inventoryAccountId = itemAfterReversal.accountId;
        if (!inventoryAccountId) {
          const defaultInvAccount = await systemAccounts.getAccount('INVENTORY');
          inventoryAccountId = defaultInvAccount.id;
        }

        // Auto-resolve offset account if not provided
        if (!resolvedEditOffsetAccountId) {
          const openingEquity = await systemAccounts.getAccount('OPENING_EQUITY');
          resolvedEditOffsetAccountId = openingEquity.id;
        }

        // Prevent offset account being the same as inventory account (would cancel out)
        if (resolvedEditOffsetAccountId === inventoryAccountId) {
          const openingEquity = await systemAccounts.getAccount('OPENING_EQUITY');
          resolvedEditOffsetAccountId = openingEquity.id;
        }

        const typeLabels: Record<string, string> = {
          In: 'Stok Masuk',
          Out: 'Stok Keluar',
          AdjustmentIn: 'Penyesuaian Stok +',
          AdjustmentOut: 'Penyesuaian Stok −',
        };

        let debitAccountId: string;
        let creditAccountId: string;

        if (newIsIn) {
          debitAccountId = inventoryAccountId;
          creditAccountId = resolvedEditOffsetAccountId;
        } else {
          debitAccountId = resolvedEditOffsetAccountId;
          creditAccountId = inventoryAccountId;
        }

        const movementDate = new Date(body.date);
        const fiscalYear = await tx.fiscalYear.findFirst({
          where: { isClosed: false, startDate: { lte: movementDate }, endDate: { gte: movementDate } },
        });
        if (!fiscalYear) throw new BusinessError('Tidak ada tahun fiskal aktif untuk tanggal transaksi ini.');

        const entryNumber = await generateDocumentNumber(tx, 'JV', movementDate, fiscalYear.id);

        const je = await tx.journalEntry.create({
          data: {
            entryNumber,
            date: movementDate,
            status: 'Submitted',
            submittedAt: new Date(),
            narration: `${typeLabels[body.movementType]}: ${itemAfterReversal.name} ${newQty} ${itemAfterReversal.unit}${body.notes ? ' - ' + body.notes : ''} (Edit)`,
            fiscalYearId: fiscalYear.id,
            createdBy: req.user!.userId,
            items: {
              create: [
                { accountId: debitAccountId, debit: newTotalValue, credit: 0 },
                { accountId: creditAccountId, debit: 0, credit: newTotalValue },
              ],
            },
          },
          include: { items: true },
        });

        await tx.accountingLedgerEntry.createMany({
          data: [
            { accountId: debitAccountId, date: movementDate, debit: newTotalValue, credit: 0, referenceType: 'StockMovement', referenceId: je.id, fiscalYearId: fiscalYear.id },
            { accountId: creditAccountId, date: movementDate, debit: 0, credit: newTotalValue, referenceType: 'StockMovement', referenceId: je.id, fiscalYearId: fiscalYear.id },
          ],
        });

        await updateAccountBalance(tx, debitAccountId, newTotalValue, 0);
        await updateAccountBalance(tx, creditAccountId, 0, newTotalValue);

        newJournalEntryId = je.id;
      }

      // 6. Update the movement record
      const updated = await tx.stockMovement.update({
        where: { id },
        data: {
          date: new Date(body.date),
          movementType: body.movementType as any,
          quantity: newQty,
          unitCost: newUnitCost,
          totalValue: newTotalValue,
          notes: body.notes || null,
          referenceType: body.referenceType || null,
          referenceNumber: body.referenceNumber || null,
          offsetAccountId: resolvedEditOffsetAccountId || body.offsetAccountId || null,
          journalEntryId: newJournalEntryId,
        },
        include: {
          item: { select: { id: true, name: true, code: true, unit: true } },
        },
      });

      return updated;
    }, { timeout: 15000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /inventory/movements/:id', 'Gagal mengupdate gerakan stok.');
  }
});

// PUT /api/inventory/movements/:id/cancel
router.put('/movements/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  try {
    await prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.findUnique({
        where: { id },
        include: { item: true },
      });
      if (!movement) throw new BusinessError('Gerakan stok tidak ditemukan.');
      if (movement.isCancelled) throw new BusinessError('Gerakan stok sudah dibatalkan.');

      const isIn = movement.movementType === 'In' || movement.movementType === 'AdjustmentIn';
      const isOut = movement.movementType === 'Out' || movement.movementType === 'AdjustmentOut';
      const qty = Number(movement.quantity);

      // Validate reversal won't cause negative stock
      if (isIn && Number(movement.item.currentStock) < qty) {
        throw new BusinessError('Tidak dapat membatalkan: stok tidak mencukupi untuk pembalikan.');
      }

      // Reverse stock
      const reverseDelta = isOut ? qty : -qty;
      await tx.inventoryItem.update({
        where: { id: movement.itemId },
        data: { currentStock: { increment: reverseDelta } },
      });

      // Cancel journal entry if exists
      if (movement.journalEntryId) {
        await tx.journalEntry.update({
          where: { id: movement.journalEntryId },
          data: { status: 'Cancelled', cancelledAt: new Date() },
        });
        await tx.accountingLedgerEntry.updateMany({
          where: { referenceId: movement.journalEntryId },
          data: { isCancelled: true },
        });
        // Reverse account balances
        const je = await tx.journalEntry.findUnique({
          where: { id: movement.journalEntryId },
          include: { items: true },
        });
        if (je) {
          for (const jeItem of je.items) {
            await updateAccountBalance(tx, jeItem.accountId, Number(jeItem.credit), Number(jeItem.debit));
          }
        }
      }

      await tx.stockMovement.update({
        where: { id },
        data: { isCancelled: true },
      });
    }, { timeout: 15000 });

    return res.json({ message: 'Gerakan stok berhasil dibatalkan.' });
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /inventory/movements/:id/cancel', 'Gagal membatalkan gerakan stok.');
  }
});

// ─── Production Runs ─────────────────────────────────────────────────────────

// GET /api/inventory/production-runs
router.get('/production-runs', async (req, res) => {
  try {
    const { page = '1', limit = '50', startDate, endDate } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const where: any = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }

    const [runs, total] = await Promise.all([
      prisma.productionRun.findMany({
        where,
        include: {
          items: {
            include: {
              item: { select: { id: true, name: true, unit: true, code: true } },
            },
          },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.productionRun.count({ where }),
    ]);

    return res.json({ data: runs, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/production-runs error');
    return res.status(500).json({ error: 'Gagal mengambil data proses produksi.' });
  }
});

// POST /api/inventory/production-runs
router.post('/production-runs', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateProductionRunSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get active fiscal year for this transaction date
      const txDate = new Date(body.date);
      const fiscalYear = await tx.fiscalYear.findFirst({
        where: {
          isClosed: false,
          startDate: { lte: txDate },
          endDate: { gte: txDate },
        },
      });
      if (!fiscalYear) throw new BusinessError('Tidak ada tahun fiskal aktif untuk tanggal transaksi ini.');

      // 2. Pre-fetch all input and output items in a single query
      const allItemIds = [...body.inputs.map((i) => i.itemId), ...body.outputs.map((o) => o.itemId)];
      const allItems = await tx.inventoryItem.findMany({ where: { id: { in: allItemIds } } });
      const itemMap = new Map(allItems.map((i) => [i.id, i]));

      // Validate input items
      for (const input of body.inputs) {
        const item = itemMap.get(input.itemId);
        if (!item) throw new BusinessError(`Item input tidak ditemukan.`);
        if (!item.isActive) throw new BusinessError(`Item '${item.name}' tidak aktif.`);
        if (Number(item.currentStock) < input.quantity) {
          throw new BusinessError(
            `Stok '${item.name}' tidak cukup. Stok saat ini: ${Number(item.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${item.unit}`
          );
        }
      }

      // 3. Validate output items exist and are active
      for (const output of body.outputs) {
        const item = itemMap.get(output.itemId);
        if (!item) throw new BusinessError(`Item output tidak ditemukan.`);
        if (!item.isActive) throw new BusinessError(`Item output '${item.name}' tidak aktif.`);
      }

      // 4. Generate run number
      const runDate = new Date(body.date);
      const runNumber = await generateDocumentNumber(tx, 'PR', runDate, fiscalYear.id);

      // 5. Calculate rendemenPct (only if single input)
      let rendemenPct: number | null = null;
      if (body.inputs.length === 1) {
        const totalOutput = body.outputs.reduce((s, o) => s + o.quantity, 0);
        rendemenPct = (totalOutput / body.inputs[0].quantity) * 100;
      }

      // 6. Create the ProductionRun header
      const run = await tx.productionRun.create({
        data: {
          runNumber,
          date: runDate,
          notes: body.notes || null,
          referenceType: body.referenceType || null,
          referenceId: body.referenceId || null,
          referenceNumber: body.referenceNumber || null,
          rendemenPct: rendemenPct !== null ? rendemenPct : null,
          fiscalYearId: fiscalYear.id,
          createdById: req.user!.userId,
        },
      });

      // 7. Process inputs: reduce stock + create StockMovement Out (with averageCost)
      let totalInputValue = new Decimal(0);
      for (const input of body.inputs) {
        const item = itemMap.get(input.itemId);
        if (!item) continue;

        const avgCost = Number(item.averageCost);
        const inputUnitCost = avgCost > 0 ? avgCost : 0;
        const inputTotalValue = new Decimal(input.quantity).mul(new Decimal(inputUnitCost)).toDecimalPlaces(2).toNumber();
        totalInputValue = totalInputValue.plus(new Decimal(inputTotalValue));

        await tx.inventoryItem.update({
          where: { id: input.itemId },
          data: { currentStock: { decrement: input.quantity } },
        });

        const movNumber = await generateDocumentNumber(tx, 'SM', runDate, fiscalYear.id);
        await tx.stockMovement.create({
          data: {
            movementNumber: movNumber,
            date: runDate,
            itemId: input.itemId,
            movementType: 'Out',
            quantity: input.quantity,
            unitCost: inputUnitCost,
            totalValue: inputTotalValue,
            referenceType: 'ProductionRun',
            referenceId: run.id,
            referenceNumber: runNumber,
            notes: body.notes || null,
            fiscalYearId: fiscalYear.id,
            createdById: req.user!.userId,
          },
        });
      }

      // 8. Process outputs: increase stock + create StockMovement In (with user-entered HPP/kg)
      let totalOutputValue = new Decimal(0);
      for (const output of body.outputs) {
        const outputItem = await tx.inventoryItem.findUnique({ where: { id: output.itemId } });
        const unitCost = output.unitPrice ?? 0;

        const newAvgCost = outputItem && unitCost > 0
          ? calcWeightedAverage(outputItem.currentStock, outputItem.averageCost, output.quantity, unitCost)
          : undefined;

        await tx.inventoryItem.update({
          where: { id: output.itemId },
          data: {
            currentStock: { increment: output.quantity },
            ...(newAvgCost !== undefined ? { averageCost: newAvgCost } : {}),
          },
        });
        const totalValue = new Decimal(output.quantity).mul(new Decimal(unitCost)).toDecimalPlaces(2).toNumber();
        totalOutputValue = totalOutputValue.plus(new Decimal(totalValue));

        const movNumber = await generateDocumentNumber(tx, 'SM', runDate, fiscalYear.id);
        await tx.stockMovement.create({
          data: {
            movementNumber: movNumber,
            date: runDate,
            itemId: output.itemId,
            movementType: 'In',
            quantity: output.quantity,
            unitCost,
            totalValue,
            referenceType: 'ProductionRun',
            referenceId: run.id,
            referenceNumber: runNumber,
            notes: body.notes || null,
            fiscalYearId: fiscalYear.id,
            createdById: req.user!.userId,
          },
        });
      }

      // 8b. GL posting: DR output accounts / CR input accounts / CR conversion cost (if any)
      const defaultInvAccount = await systemAccounts.getAccount('INVENTORY');
      const inputNames = body.inputs.map(i => itemMap.get(i.itemId)?.name || '').join(', ');
      const outputNames = body.outputs.map(o => itemMap.get(o.itemId)?.name || '').join(', ');

      const jvNumber = `JV-${runNumber}`;
      const journalItems: { accountId: string; debit: number; credit: number; description: string }[] = [];

      // CR each input item's account
      let totalInputCost = new Decimal(0);
      for (const input of body.inputs) {
        const item = itemMap.get(input.itemId);
        if (!item) continue;
        const avgCost = Number(item.averageCost);
        const val = new Decimal(input.quantity).mul(new Decimal(avgCost > 0 ? avgCost : 0)).toDecimalPlaces(2).toNumber();
        if (val <= 0) continue;
        totalInputCost = totalInputCost.plus(new Decimal(val));
        const acctId = item.accountId || defaultInvAccount.id;
        journalItems.push({
          accountId: acctId,
          debit: 0, credit: val,
          description: `Bahan baku keluar ${item.name}: ${runNumber}`,
        });
      }

      // DR each output item's account (at HPP/unit price set by user)
      let totalOutputCost = new Decimal(0);
      for (const output of body.outputs) {
        const unitCost = output.unitPrice ?? 0;
        const val = new Decimal(output.quantity).mul(new Decimal(unitCost)).toDecimalPlaces(2).toNumber();
        if (val <= 0) continue;
        totalOutputCost = totalOutputCost.plus(new Decimal(val));
        const outItem = await tx.inventoryItem.findUnique({ where: { id: output.itemId }, select: { accountId: true, name: true } });
        const acctId = outItem?.accountId || defaultInvAccount.id;
        journalItems.push({
          accountId: acctId,
          debit: val, credit: 0,
          description: `Produksi masuk ${outItem?.name || ''}: ${runNumber}`,
        });
      }

      // Balance the journal: difference goes to COGS (HPP Beras)
      const diff = totalOutputCost.minus(totalInputCost).toDecimalPlaces(2).toNumber();
      if (Math.abs(diff) > 0) {
        const cogsAccount = await systemAccounts.getAccount('COGS');
        if (diff > 0) {
          // Output > Input: HPP produksi (CR to balance)
          journalItems.push({
            accountId: cogsAccount.id,
            debit: 0, credit: diff,
            description: `HPP konversi produksi: ${runNumber}`,
          });
        } else {
          // Output < Input: rugi produksi (DR)
          journalItems.push({
            accountId: cogsAccount.id,
            debit: Math.abs(diff), credit: 0,
            description: `HPP rugi produksi: ${runNumber}`,
          });
        }
      }

      if (journalItems.length > 0) {
        const journalEntry = await tx.journalEntry.create({
          data: {
            entryNumber: jvNumber,
            date: runDate,
            narration: `Produksi: ${runNumber} — ${inputNames} → ${outputNames}`,
            status: 'Submitted',
            fiscalYearId: fiscalYear.id,
            createdBy: req.user!.userId,
            submittedAt: new Date(),
            items: { create: journalItems },
          },
        });

        await tx.accountingLedgerEntry.createMany({
          data: journalItems.map(ji => ({
            date: runDate,
            accountId: ji.accountId,
            debit: ji.debit,
            credit: ji.credit,
            referenceType: 'JournalEntry',
            referenceId: journalEntry.id,
            description: ji.description,
            fiscalYearId: fiscalYear.id,
          })),
        });

        // Update account balances per account
        const balanceMap = new Map<string, { debit: number; credit: number }>();
        for (const ji of journalItems) {
          const entry = balanceMap.get(ji.accountId) || { debit: 0, credit: 0 };
          entry.debit += ji.debit;
          entry.credit += ji.credit;
          balanceMap.set(ji.accountId, entry);
        }
        for (const [acctId, bal] of balanceMap) {
          await updateAccountBalance(tx, acctId, bal.debit, bal.credit);
        }
      }

      // 9. Create ProductionRunItems for record-keeping
      const lineItems = [
        ...body.inputs.map(i => ({
          productionRunId: run.id,
          itemId: i.itemId,
          lineType: 'Input',
          quantity: i.quantity,
          unitPrice: null as number | null,
          rendemenPct: null as number | null,
        })),
        ...body.outputs.map((o) => {
          let rPct: number | null = null;
          if (body.inputs.length === 1) {
            rPct = (o.quantity / body.inputs[0].quantity) * 100;
          }
          return {
            productionRunId: run.id,
            itemId: o.itemId,
            lineType: 'Output',
            quantity: o.quantity,
            unitPrice: o.unitPrice ?? null,
            rendemenPct: rPct,
          };
        }),
      ];

      await tx.productionRunItem.createMany({ data: lineItems });

      // Return full run with items
      return tx.productionRun.findUnique({
        where: { id: run.id },
        include: {
          items: {
            include: {
              item: { select: { id: true, name: true, unit: true, code: true } },
            },
          },
        },
      });
    }, { timeout: 30000 }); // heavy: multiple stock movements + GL entries

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /inventory/production-runs', 'Gagal mencatat proses produksi.');
  }
});

// PUT /api/inventory/production-runs/:id/cancel
router.put('/production-runs/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  try {
    await prisma.$transaction(async (tx) => {
      const run = await tx.productionRun.findUnique({
        where: { id },
        include: { items: { include: { item: true } } },
      });
      if (!run) throw new BusinessError('Data proses produksi tidak ditemukan.');
      if (run.isCancelled) throw new BusinessError('Proses produksi sudah dibatalkan.');

      // Find all related StockMovements
      const movements = await tx.stockMovement.findMany({
        where: { referenceType: 'ProductionRun', referenceId: id, isCancelled: false },
        include: { item: true },
      });

      // Collect output item IDs that need averageCost recalculation
      const outputItemIds = new Set<string>();

      // Reverse each movement
      for (const mov of movements) {
        const isIn = mov.movementType === 'In' || mov.movementType === 'AdjustmentIn';
        const isOut = mov.movementType === 'Out' || mov.movementType === 'AdjustmentOut';
        const qty = Number(mov.quantity);

        // Check reversal won't cause negative stock for 'In' movements (reversing In = subtract)
        if (isIn && Number(mov.item.currentStock) < qty) {
          throw new BusinessError(
            `Tidak dapat membatalkan: stok '${mov.item.name}' tidak mencukupi untuk pembalikan.`
          );
        }

        if (isIn) outputItemIds.add(mov.itemId);

        const reverseDelta = isOut ? qty : -qty;
        await tx.inventoryItem.update({
          where: { id: mov.itemId },
          data: { currentStock: { increment: reverseDelta } },
        });

        await tx.stockMovement.update({
          where: { id: mov.id },
          data: { isCancelled: true },
        });
      }

      // Recalculate averageCost for output items from remaining active In movements
      for (const itemId of outputItemIds) {
        const activeInMovements = await tx.stockMovement.findMany({
          where: {
            itemId,
            movementType: { in: ['In', 'AdjustmentIn'] },
            isCancelled: false,
          },
          select: { quantity: true, unitCost: true },
        });

        if (activeInMovements.length === 0) {
          await tx.inventoryItem.update({
            where: { id: itemId },
            data: { averageCost: 0 },
          });
        } else {
          let totalQty = new Decimal(0);
          let totalValue = new Decimal(0);
          for (const m of activeInMovements) {
            const q = new Decimal(Number(m.quantity));
            const c = new Decimal(Number(m.unitCost));
            totalQty = totalQty.plus(q);
            totalValue = totalValue.plus(q.mul(c));
          }
          const newAvgCost = totalQty.gt(0)
            ? totalValue.div(totalQty).toDecimalPlaces(2).toNumber()
            : 0;
          await tx.inventoryItem.update({
            where: { id: itemId },
            data: { averageCost: newAvgCost },
          });
        }
      }

      // Cancel related journal entry + ledger entries
      const jvNumber = `JV-${run.runNumber}`;
      const journal = await tx.journalEntry.findUnique({
        where: { entryNumber: jvNumber },
        include: { items: true },
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
        // Reverse account balances
        for (const ji of journal.items) {
          await updateAccountBalance(tx, ji.accountId, Number(ji.credit), Number(ji.debit));
        }
      }

      // Mark run as cancelled
      await tx.productionRun.update({
        where: { id },
        data: { isCancelled: true },
      });
    }, { timeout: 15000 });

    return res.json({ message: 'Proses produksi berhasil dibatalkan.' });
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /inventory/production-runs/:id/cancel', 'Gagal membatalkan proses produksi.');
  }
});

// ─── Dashboard ───────────────────────────────────────────────────────────────

// GET /api/inventory/dashboard/metrics — KPI summary
router.get('/dashboard/metrics', async (_req, res) => {
  try {
    const [totalItems, activeItems, lowStockRaw, movements, inventoryValueResult] = await Promise.all([
      prisma.inventoryItem.count(),
      prisma.inventoryItem.count({ where: { isActive: true, currentStock: { gt: 0 } } }),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) as count FROM inventory_items
        WHERE is_active = true AND minimum_stock > 0 AND current_stock <= minimum_stock`,
      prisma.stockMovement.count({
        where: {
          isCancelled: false,
          date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
        }
      }),
      prisma.$queryRaw<[{ total: bigint }]>`
        SELECT COALESCE(SUM(
          CASE WHEN sm.movement_type IN ('In', 'AdjustmentIn') THEN sm.total_value
               ELSE -sm.total_value END
        ), 0) AS total
        FROM stock_movements sm
        JOIN inventory_items ii ON sm.item_id = ii.id
        WHERE ii.is_active = true AND sm.is_cancelled = false
      `,
    ]);

    const lowStockCount = Number(lowStockRaw[0]?.count ?? 0);

    return res.json({
      totalItems,
      activeItems,
      lowStockCount,
      movementsThisMonth: movements,
      inventoryValue: Math.max(0, Number(inventoryValueResult[0]?.total || 0)),
    });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/metrics error');
    return res.status(500).json({ error: 'Gagal mengambil metrik gudang.' });
  }
});

// GET /api/inventory/dashboard/by-category — Stock distribution by category
router.get('/dashboard/by-category', async (_req, res) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: { category: true, currentStock: true },
    });

    const categoryMap = new Map<string, { itemCount: number; totalQty: number }>();
    for (const item of items) {
      const cat = item.category || 'Lainnya';
      const entry = categoryMap.get(cat) || { itemCount: 0, totalQty: 0 };
      entry.itemCount++;
      entry.totalQty += Number(item.currentStock);
      categoryMap.set(cat, entry);
    }

    const result = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      itemCount: data.itemCount,
      totalQuantity: data.totalQty,
    })).sort((a, b) => b.totalQuantity - a.totalQuantity);

    return res.json(result);
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/by-category error');
    return res.status(500).json({ error: 'Gagal mengambil data kategori.' });
  }
});

// GET /api/inventory/dashboard/movement-trend — 6-month movement trend
router.get('/dashboard/movement-trend', async (_req, res) => {
  try {
    const months = 6;
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    const movements = await prisma.stockMovement.findMany({
      where: { isCancelled: false, date: { gte: startDate } },
      select: { date: true, movementType: true, quantity: true },
    });

    // Group by month
    const monthMap = new Map<string, { inQty: number; outQty: number; adjInQty: number; adjOutQty: number }>();

    // Initialize all months
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, { inQty: 0, outQty: 0, adjInQty: 0, adjOutQty: 0 });
    }

    for (const m of movements) {
      const d = new Date(m.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthMap.get(key);
      if (!entry) continue;
      const qty = Number(m.quantity);
      switch (m.movementType) {
        case 'In': entry.inQty += qty; break;
        case 'Out': entry.outQty += qty; break;
        case 'AdjustmentIn': entry.adjInQty += qty; break;
        case 'AdjustmentOut': entry.adjOutQty += qty; break;
      }
    }

    const result = Array.from(monthMap.entries()).map(([month, data]) => ({
      month,
      ...data,
      netChange: data.inQty + data.adjInQty - data.outQty - data.adjOutQty,
    }));

    return res.json(result);
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/movement-trend error');
    return res.status(500).json({ error: 'Gagal mengambil tren pergerakan.' });
  }
});

// GET /api/inventory/dashboard/top-items — All active items sorted by stock value (qty × avg cost) desc
router.get('/dashboard/top-items', async (_req, res) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, unit: true, category: true, currentStock: true, minimumStock: true, averageCost: true },
    });

    const mapped = items.map(i => {
      const currentStock = Number(i.currentStock);
      const minimumStock = Number(i.minimumStock);
      const averageCost = Number(i.averageCost);
      return {
        ...i,
        currentStock,
        minimumStock,
        averageCost,
        stockValue: currentStock * averageCost,
        stockPct: minimumStock > 0 ? Math.round(currentStock / minimumStock * 100) : null,
      };
    });

    mapped.sort((a, b) => b.stockValue - a.stockValue);

    return res.json(mapped);
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/top-items error');
    return res.status(500).json({ error: 'Gagal mengambil data item.' });
  }
});

// GET /api/inventory/dashboard/recent-movements — Last 10 movements
router.get('/dashboard/recent-movements', async (_req, res) => {
  try {
    const movements = await prisma.stockMovement.findMany({
      where: { isCancelled: false },
      orderBy: { date: 'desc' },
      take: 10,
      select: {
        id: true, movementNumber: true, date: true, movementType: true,
        quantity: true, totalValue: true, notes: true,
        item: { select: { name: true, unit: true, code: true } },
      },
    });

    return res.json(movements.map(m => ({
      ...m,
      quantity: Number(m.quantity),
      totalValue: Number(m.totalValue),
    })));
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/recent-movements error');
    return res.status(500).json({ error: 'Gagal mengambil riwayat pergerakan.' });
  }
});

// GET /api/inventory/dashboard/production-stats — Production run stats
router.get('/dashboard/production-stats', async (_req, res) => {
  try {
    const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [totalRuns, thisMonthRuns, runs] = await Promise.all([
      prisma.productionRun.count({ where: { isCancelled: false } }),
      prisma.productionRun.count({ where: { isCancelled: false, date: { gte: thisMonth } } }),
      prisma.productionRun.findMany({
        where: { isCancelled: false, rendemenPct: { not: null } },
        select: { rendemenPct: true },
        orderBy: { date: 'desc' },
        take: 50,
      }),
    ]);

    const avgRendemen = runs.length > 0
      ? Math.round(runs.reduce((s, r) => s + Number(r.rendemenPct), 0) / runs.length * 100) / 100
      : 0;

    return res.json({
      totalRuns,
      thisMonthRuns,
      avgRendemen,
    });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/production-stats error');
    return res.status(500).json({ error: 'Gagal mengambil statistik produksi.' });
  }
});

export default router;
