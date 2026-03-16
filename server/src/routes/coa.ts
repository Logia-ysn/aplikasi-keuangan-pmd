import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { roleMiddleware } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreateAccountSchema, UpdateAccountSchema } from '../utils/schemas';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/coa — hierarchical account tree
router.get('/', async (req, res) => {
  try {
    const allAccounts = await prisma.account.findMany({
      orderBy: { accountNumber: 'asc' },
    });

    const buildTree = (accounts: typeof allAccounts, parentId: string | null = null): any[] =>
      accounts
        .filter((acc) => acc.parentId === parentId)
        .map((acc) => ({ ...acc, children: buildTree(accounts, acc.id) }));

    return res.json(buildTree(allAccounts));
  } catch (error) {
    logger.error({ error }, 'GET /coa error');
    return res.status(500).json({ error: 'Gagal mengambil daftar akun.' });
  }
});

// GET /api/coa/flat — flat list (for dropdowns)
router.get('/flat', async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { isActive: true },
      orderBy: { accountNumber: 'asc' },
      select: {
        id: true,
        accountNumber: true,
        name: true,
        accountType: true,
        rootType: true,
        isGroup: true,
        balance: true,
      },
    });
    return res.json(accounts);
  } catch (error) {
    logger.error({ error }, 'GET /coa/flat error');
    return res.status(500).json({ error: 'Gagal mengambil daftar akun.' });
  }
});

// POST /api/coa — create new account (Admin only)
router.post('/', roleMiddleware(['Admin']), async (req, res) => {
  const body = validateBody(CreateAccountSchema, req.body, res);
  if (!body) return;

  try {
    const account = await prisma.account.create({
      data: {
        accountNumber: body.accountNumber,
        name: body.name,
        accountType: body.accountType,
        rootType: body.rootType,
        isGroup: body.isGroup ?? false,
        parentId: body.parentId || null,
      },
    });
    return res.status(201).json(account);
  } catch (error: any) {
    logger.error({ error }, 'POST /coa error');
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Nomor akun sudah digunakan.' });
    }
    return res.status(500).json({ error: 'Gagal membuat akun.' });
  }
});

// PUT /api/coa/:id — update account (Admin only)
router.put('/:id', roleMiddleware(['Admin']), async (req, res) => {
  const id = req.params.id as string;
  const body = validateBody(UpdateAccountSchema, req.body, res);
  if (!body) return;

  try {
    // If accountNumber is changing, check uniqueness
    if (body.accountNumber) {
      const existing = await prisma.account.findFirst({
        where: { accountNumber: body.accountNumber, id: { not: id } },
      });
      if (existing) return res.status(409).json({ error: 'Nomor akun sudah digunakan oleh akun lain.' });
    }

    // If trying to un-group (isGroup: false), check no children exist
    if (body.isGroup === false) {
      const childCount = await prisma.account.count({ where: { parentId: id } });
      if (childCount > 0) return res.status(400).json({ error: 'Tidak dapat mengubah akun grup yang masih memiliki sub-akun.' });
    }

    const account = await prisma.account.update({
      where: { id },
      data: {
        ...(body.accountNumber && { accountNumber: body.accountNumber }),
        ...(body.name && { name: body.name }),
        ...(body.isGroup !== undefined && { isGroup: body.isGroup }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    return res.json(account);
  } catch (error: any) {
    logger.error({ error }, 'PUT /coa/:id error');
    if (error.code === 'P2025') return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    if (error.code === 'P2002') return res.status(409).json({ error: 'Nomor akun sudah digunakan.' });
    return res.status(500).json({ error: 'Gagal mengupdate akun.' });
  }
});

// DELETE /api/coa/:id — delete account with safety checks (Admin only)
router.delete('/:id', roleMiddleware(['Admin']), async (req, res) => {
  const id = req.params.id as string;

  try {
    // 1. Check no child accounts
    const childCount = await prisma.account.count({ where: { parentId: id } });
    if (childCount > 0) {
      return res.status(400).json({ error: 'Tidak dapat menghapus akun yang masih memiliki sub-akun. Hapus sub-akun terlebih dahulu.' });
    }

    // 2. Check no ledger entries
    const ledgerCount = await prisma.accountingLedgerEntry.count({ where: { accountId: id, isCancelled: false } });
    if (ledgerCount > 0) {
      return res.status(400).json({ error: 'Tidak dapat menghapus akun yang sudah memiliki transaksi.' });
    }

    // 3. Check zero balance
    const account = await prisma.account.findUnique({ where: { id }, select: { balance: true, name: true } });
    if (!account) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    if (Number(account.balance) !== 0) {
      return res.status(400).json({ error: `Tidak dapat menghapus akun dengan saldo tidak nol (${Number(account.balance).toLocaleString('id-ID')}).` });
    }

    await prisma.account.delete({ where: { id } });
    return res.json({ message: 'Akun berhasil dihapus.' });
  } catch (error: any) {
    logger.error({ error }, 'DELETE /coa/:id error');
    if (error.code === 'P2025') return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    return res.status(500).json({ error: 'Gagal menghapus akun.' });
  }
});

export default router;
