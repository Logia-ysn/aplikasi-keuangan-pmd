import { Router } from 'express';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { roleMiddleware } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreateTaxConfigSchema, UpdateTaxConfigSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';

const router = Router();

// ─── Tax Config CRUD ─────────────────────────────────────────────────────────

// GET /api/tax/config — list all tax configs
router.get('/config', async (_req, res) => {
  try {
    const configs = await prisma.taxConfig.findMany({
      orderBy: [{ isActive: 'desc' }, { type: 'asc' }, { name: 'asc' }],
    });
    return res.json(configs);
  } catch (error) {
    return handleRouteError(res, error, 'GET /tax/config', 'Gagal mengambil data konfigurasi pajak.');
  }
});

// POST /api/tax/config — create tax config (Admin only)
router.post('/config', roleMiddleware(['Admin']), async (req, res) => {
  const body = validateBody(CreateTaxConfigSchema, req.body, res);
  if (!body) return;

  try {
    const config = await prisma.taxConfig.create({
      data: {
        name: body.name,
        rate: body.rate,
        type: body.type,
        accountId: body.accountId || null,
      },
    });
    return res.status(201).json(config);
  } catch (error) {
    return handleRouteError(res, error, 'POST /tax/config', 'Gagal membuat konfigurasi pajak.');
  }
});

// PUT /api/tax/config/:id — update tax config
router.put('/config/:id', roleMiddleware(['Admin']), async (req, res) => {
  const body = validateBody(UpdateTaxConfigSchema, req.body, res);
  if (!body) return;

  try {
    const id = req.params.id as string;
    const existing = await prisma.taxConfig.findUnique({ where: { id } });
    if (!existing) throw new BusinessError('Konfigurasi pajak tidak ditemukan.');

    const config = await prisma.taxConfig.update({
      where: { id },
      data: body,
    });
    return res.json(config);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /tax/config/:id', 'Gagal mengupdate konfigurasi pajak.');
  }
});

// DELETE /api/tax/config/:id — soft delete (set isActive=false)
router.delete('/config/:id', roleMiddleware(['Admin']), async (req, res) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.taxConfig.findUnique({ where: { id } });
    if (!existing) throw new BusinessError('Konfigurasi pajak tidak ditemukan.');

    await prisma.taxConfig.update({
      where: { id },
      data: { isActive: false },
    });
    return res.json({ message: 'Konfigurasi pajak berhasil dinonaktifkan.' });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /tax/config/:id', 'Gagal menghapus konfigurasi pajak.');
  }
});

// ─── Tax Report ──────────────────────────────────────────────────────────────

// GET /api/tax/report — tax summary grouped by month
router.get('/report', async (req, res) => {
  try {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Parameter startDate dan endDate wajib diisi.' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Get all submitted/paid sales invoices in range with tax > 0
    const salesInvoices = await prisma.salesInvoice.findMany({
      where: {
        date: { gte: start, lte: end },
        status: { in: ['Submitted', 'Paid', 'PartiallyPaid', 'Overdue'] },
        taxPct: { gt: 0 },
      },
      select: { date: true, grandTotal: true, taxPct: true },
    });

    // Get all submitted/paid purchase invoices in range with tax > 0
    const purchaseInvoices = await prisma.purchaseInvoice.findMany({
      where: {
        date: { gte: start, lte: end },
        status: { in: ['Submitted', 'Paid', 'PartiallyPaid', 'Overdue'] },
        taxPct: { gt: 0 },
      },
      select: { date: true, grandTotal: true, taxPct: true },
    });

    // Group by month using Decimal for precision
    const monthMap = new Map<string, { ppnKeluaran: Decimal; ppnMasukan: Decimal; pph: Decimal }>();

    for (const inv of salesInvoices) {
      const d = new Date(inv.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthMap.get(key) || { ppnKeluaran: new Decimal(0), ppnMasukan: new Decimal(0), pph: new Decimal(0) };

      // Calculate tax amount: grandTotal already includes tax, so tax = grandTotal * taxPct / (100 + taxPct)
      const grandTotal = new Decimal(inv.grandTotal.toString());
      const taxPct = new Decimal(inv.taxPct.toString());
      const taxAmount = grandTotal.mul(taxPct).div(new Decimal(100).plus(taxPct));
      entry.ppnKeluaran = entry.ppnKeluaran.plus(taxAmount);
      monthMap.set(key, entry);
    }

    for (const inv of purchaseInvoices) {
      const d = new Date(inv.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthMap.get(key) || { ppnKeluaran: new Decimal(0), ppnMasukan: new Decimal(0), pph: new Decimal(0) };

      const grandTotal = new Decimal(inv.grandTotal.toString());
      const taxPct = new Decimal(inv.taxPct.toString());
      const taxAmount = grandTotal.mul(taxPct).div(new Decimal(100).plus(taxPct));
      entry.ppnMasukan = entry.ppnMasukan.plus(taxAmount);
      monthMap.set(key, entry);
    }

    // Sort by month — round accumulated totals at the end
    const months = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        ppnKeluaran: data.ppnKeluaran.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
        ppnMasukan: data.ppnMasukan.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
        pph: data.pph.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
        net: data.ppnKeluaran.minus(data.ppnMasukan).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      }));

    const totalPpnKeluaran = months.reduce((s, m) => s.plus(new Decimal(m.ppnKeluaran)), new Decimal(0));
    const totalPpnMasukan = months.reduce((s, m) => s.plus(new Decimal(m.ppnMasukan)), new Decimal(0));
    const totalPph = months.reduce((s, m) => s.plus(new Decimal(m.pph)), new Decimal(0));
    const totals = {
      ppnKeluaran: totalPpnKeluaran.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      ppnMasukan: totalPpnMasukan.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      pph: totalPph.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      net: totalPpnKeluaran.minus(totalPpnMasukan).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    };

    return res.json({ months, totals });
  } catch (error) {
    return handleRouteError(res, error, 'GET /tax/report', 'Gagal mengambil laporan pajak.');
  }
});

export default router;
