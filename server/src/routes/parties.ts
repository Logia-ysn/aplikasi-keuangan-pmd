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

// POST /api/parties
router.post('/', roleMiddleware(['Admin', 'Accountant']), async (req, res) => {
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
router.put('/:id', roleMiddleware(['Admin', 'Accountant']), async (req, res) => {
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

// DELETE /api/parties/:id — soft-delete / hard-delete with safety check
router.delete('/:id', roleMiddleware(['Admin']), async (req, res) => {
  const id = req.params.id as string;

  try {
    // Check for linked transactions
    const [salesCount, purchaseCount, paymentCount] = await Promise.all([
      prisma.salesInvoice.count({ where: { partyId: id } }),
      prisma.purchaseInvoice.count({ where: { partyId: id } }),
      prisma.payment.count({ where: { partyId: id } }),
    ]);

    const totalLinked = salesCount + purchaseCount + paymentCount;

    if (totalLinked > 0) {
      // Soft-delete: deactivate instead of hard-delete
      await prisma.party.update({
        where: { id },
        data: { isActive: false },
      });
      return res.json({
        message: `Mitra dinonaktifkan karena memiliki ${totalLinked} transaksi terkait.`,
        deactivated: true,
      });
    }

    // No linked transactions — safe to hard-delete
    await prisma.party.delete({ where: { id } });
    return res.json({ message: 'Mitra berhasil dihapus.', deleted: true });
  } catch (error: any) {
    logger.error({ error }, 'DELETE /parties/:id error');
    if (error.code === 'P2025') return res.status(404).json({ error: 'Data mitra tidak ditemukan.' });
    return res.status(500).json({ error: 'Gagal menghapus data mitra.' });
  }
});

export default router;
