import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { roleMiddleware } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreatePartySchema, UpdatePartySchema } from '../utils/schemas';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/parties
router.get('/', async (req, res) => {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const { page = '1', limit = '100' } = req.query;
    const take = Math.min(Number(limit) || 100, 200);
    const skip = (Number(page) - 1) * take;

    const where = type ? { partyType: type as any } : {};

    const [parties, total] = await Promise.all([
      prisma.party.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      prisma.party.count({ where }),
    ]);

    return res.json({ data: parties, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /parties error');
    return res.status(500).json({ error: 'Gagal mengambil data pihak.' });
  }
});

// GET /api/parties/dashboard — MUST be before /:id routes
router.get('/dashboard', async (_req, res) => {
  try {
    const now = new Date();

    const parties = await prisma.party.findMany({
      where: { isActive: true, isDummy: false },
      select: {
        id: true, name: true, partyType: true,
        outstandingAmount: true, depositBalance: true, customerDepositBalance: true,
      },
    });

    const customers = parties.filter(p => p.partyType === 'Customer' || p.partyType === 'Both');
    const suppliers = parties.filter(p => p.partyType === 'Supplier' || p.partyType === 'Both');

    const totalPiutang = customers.reduce((s, p) => s + Math.max(0, Number(p.outstandingAmount)), 0);
    const totalHutang = suppliers.reduce((s, p) => s + Math.max(0, Number(p.outstandingAmount)), 0);
    const totalCustomerDeposit = customers.reduce((s, p) => s + Number(p.customerDepositBalance), 0);
    const totalVendorDeposit = suppliers.reduce((s, p) => s + Number(p.depositBalance), 0);

    const topCustomers = customers
      .filter(p => Number(p.outstandingAmount) > 0)
      .sort((a, b) => Number(b.outstandingAmount) - Number(a.outstandingAmount))
      .slice(0, 10)
      .map(p => ({ id: p.id, name: p.name, outstanding: Number(p.outstandingAmount) }));

    const topVendors = suppliers
      .filter(p => Number(p.outstandingAmount) > 0)
      .sort((a, b) => Number(b.outstandingAmount) - Number(a.outstandingAmount))
      .slice(0, 10)
      .map(p => ({ id: p.id, name: p.name, outstanding: Number(p.outstandingAmount) }));

    // Aging piutang
    const salesInvoices = await prisma.salesInvoice.findMany({
      where: { status: { in: ['Submitted', 'PartiallyPaid'] }, outstanding: { gt: 0 } },
      select: {
        id: true, invoiceNumber: true, date: true, dueDate: true,
        grandTotal: true, outstanding: true,
        customer: { select: { id: true, name: true } },
      },
    });

    const aging = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    const agingInvoices: any[] = [];
    for (const inv of salesInvoices) {
      const refDate = inv.dueDate || inv.date;
      const days = Math.floor((now.getTime() - new Date(refDate).getTime()) / 86400000);
      const amt = Number(inv.outstanding);
      if (days <= 0) aging.current += amt;
      else if (days <= 30) aging.d30 += amt;
      else if (days <= 60) aging.d60 += amt;
      else if (days <= 90) aging.d90 += amt;
      else aging.over90 += amt;
      if (days > 0) {
        agingInvoices.push({
          id: inv.id, invoiceNumber: inv.invoiceNumber,
          customerName: inv.customer.name,
          outstanding: amt, daysOverdue: days,
          dueDate: inv.dueDate || inv.date,
        });
      }
    }
    agingInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Aging hutang
    const purchaseInvoices = await prisma.purchaseInvoice.findMany({
      where: { status: { in: ['Submitted', 'PartiallyPaid'] }, outstanding: { gt: 0 } },
      select: {
        id: true, invoiceNumber: true, date: true, dueDate: true,
        grandTotal: true, outstanding: true,
        supplier: { select: { id: true, name: true } },
      },
    });

    const agingHutang = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    const agingHutangInvoices: any[] = [];
    for (const inv of purchaseInvoices) {
      const refDate = inv.dueDate || inv.date;
      const days = Math.floor((now.getTime() - new Date(refDate).getTime()) / 86400000);
      const amt = Number(inv.outstanding);
      if (days <= 0) agingHutang.current += amt;
      else if (days <= 30) agingHutang.d30 += amt;
      else if (days <= 60) agingHutang.d60 += amt;
      else if (days <= 90) agingHutang.d90 += amt;
      else agingHutang.over90 += amt;
      if (days > 0) {
        agingHutangInvoices.push({
          id: inv.id, invoiceNumber: inv.invoiceNumber,
          supplierName: inv.supplier.name,
          outstanding: amt, daysOverdue: days,
          dueDate: inv.dueDate || inv.date,
        });
      }
    }
    agingHutangInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Recent payments
    const recentPayments = await prisma.payment.findMany({
      where: { status: 'Submitted' },
      include: {
        party: { select: { name: true } },
        account: { select: { name: true, accountNumber: true } },
      },
      orderBy: { date: 'desc' },
      take: 10,
    });

    return res.json({
      summary: {
        totalCustomers: customers.length,
        totalSuppliers: suppliers.length,
        totalPiutang,
        totalHutang,
        totalCustomerDeposit,
        totalVendorDeposit,
      },
      topCustomers,
      topVendors,
      agingPiutang: aging,
      agingPiutangInvoices: agingInvoices.slice(0, 10),
      agingHutang,
      agingHutangInvoices: agingHutangInvoices.slice(0, 10),
      recentPayments: recentPayments.map(p => ({
        id: p.id,
        paymentNumber: p.paymentNumber,
        date: p.date,
        paymentType: p.paymentType,
        amount: Number(p.amount),
        partyName: p.party.name,
        accountName: p.account.name,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'GET /parties/dashboard error');
    return res.status(500).json({ error: 'Gagal mengambil data dashboard.' });
  }
});

// POST /api/parties
router.post('/', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req, res) => {
  const body = validateBody(CreatePartySchema, req.body, res);
  if (!body) return;

  try {
    const party = await prisma.party.create({
      data: {
        name: body.name,
        partyType: body.partyType,
        phone: body.phone || null,
        email: body.email || null,
        address: body.address || null,
        taxId: body.taxId || null,
      },
    });
    return res.status(201).json(party);
  } catch (error) {
    logger.error({ error }, 'POST /parties error');
    return res.status(500).json({ error: 'Gagal membuat data pihak.' });
  }
});

// PUT /api/parties/:id
router.put('/:id', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req, res) => {
  const id = req.params.id as string;
  const body = validateBody(UpdatePartySchema, req.body, res);
  if (!body) return;

  try {
    const party = await prisma.party.update({
      where: { id },
      data: {
        name: body.name,
        partyType: body.partyType,
        phone: body.phone,
        email: body.email,
        address: body.address,
        taxId: body.taxId,
        isActive: body.isActive,
      },
    });
    return res.json(party);
  } catch (error: any) {
    logger.error({ error }, 'PUT /parties/:id error');
    if (error.code === 'P2025') return res.status(404).json({ error: 'Data pihak tidak ditemukan.' });
    return res.status(500).json({ error: 'Gagal mengupdate data pihak.' });
  }
});

// DELETE /api/parties/:id
router.delete('/:id', roleMiddleware(['Admin']), async (req, res) => {
  const id = req.params.id as string;

  try {
    const [salesCount, purchaseCount, paymentCount] = await Promise.all([
      prisma.salesInvoice.count({ where: { partyId: id } }),
      prisma.purchaseInvoice.count({ where: { partyId: id } }),
      prisma.payment.count({ where: { partyId: id } }),
    ]);

    const totalLinked = salesCount + purchaseCount + paymentCount;

    if (totalLinked > 0) {
      await prisma.party.update({
        where: { id },
        data: { isActive: false },
      });
      return res.json({
        message: `Mitra dinonaktifkan karena memiliki ${totalLinked} transaksi terkait.`,
        deactivated: true,
      });
    }

    await prisma.party.delete({ where: { id } });
    return res.json({ message: 'Mitra berhasil dihapus.', deleted: true });
  } catch (error: any) {
    logger.error({ error }, 'DELETE /parties/:id error');
    if (error.code === 'P2025') return res.status(404).json({ error: 'Data mitra tidak ditemukan.' });
    return res.status(500).json({ error: 'Gagal menghapus data mitra.' });
  }
});

export default router;
