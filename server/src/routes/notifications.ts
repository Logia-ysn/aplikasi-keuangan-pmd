import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/notifications — list for current user
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);
    return res.json({ data: notifications, unreadCount });
  } catch (error) {
    logger.error({ error }, 'GET /notifications error');
    return res.status(500).json({ error: 'Gagal mengambil notifikasi.' });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const count = await prisma.notification.count({
      where: { userId, isRead: false },
    });
    return res.json({ count });
  } catch (error) {
    logger.error({ error }, 'GET /notifications/unread-count error');
    return res.status(500).json({ error: 'Gagal mengambil jumlah notifikasi.' });
  }
});

// PATCH /api/notifications/:id/read — mark single as read
router.patch('/:id/read', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const notification = await prisma.notification.updateMany({
      where: { id: req.params.id as string, userId },
      data: { isRead: true },
    });
    if (notification.count === 0) {
      return res.status(404).json({ error: 'Notifikasi tidak ditemukan.' });
    }
    return res.json({ message: 'Notifikasi ditandai sudah dibaca.' });
  } catch (error) {
    logger.error({ error }, 'PATCH /notifications/:id/read error');
    return res.status(500).json({ error: 'Gagal menandai notifikasi.' });
  }
});

// PATCH /api/notifications/read-all — mark all as read for current user
router.patch('/read-all', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return res.json({ message: 'Semua notifikasi ditandai sudah dibaca.' });
  } catch (error) {
    logger.error({ error }, 'PATCH /notifications/read-all error');
    return res.status(500).json({ error: 'Gagal menandai semua notifikasi.' });
  }
});

// POST /api/notifications/check — Admin: trigger notification checks
router.post('/check', roleMiddleware(['Admin']), async (_req: AuthRequest, res) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get all Admin/Accountant users to notify
    const targetUsers = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['Admin', 'Accountant'] } },
      select: { id: true },
    });
    const userIds = targetUsers.map((u) => u.id);

    let created = 0;

    // 1. Check overdue sales invoices
    const overdueSalesInvoices = await prisma.salesInvoice.findMany({
      where: {
        status: { notIn: ['Paid', 'Cancelled', 'Draft'] },
        dueDate: { lt: now },
      },
      include: { customer: { select: { name: true } } },
    });

    for (const inv of overdueSalesInvoices) {
      // Check for duplicate in last 24h
      const existing = await prisma.notification.findFirst({
        where: {
          type: 'invoice_overdue',
          createdAt: { gte: oneDayAgo },
          metadata: { path: ['invoiceId'], equals: inv.id },
        },
      });
      if (existing) continue;

      // Create notification for each target user
      await prisma.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          type: 'invoice_overdue',
          title: 'Invoice Penjualan Jatuh Tempo',
          message: `Invoice ${inv.invoiceNumber} untuk ${inv.customer.name} sudah melewati jatuh tempo.`,
          metadata: { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, invoiceType: 'sales' },
        })),
      });
      created += userIds.length;
    }

    // 2. Check overdue purchase invoices
    const overduePurchaseInvoices = await prisma.purchaseInvoice.findMany({
      where: {
        status: { notIn: ['Paid', 'Cancelled', 'Draft'] },
        dueDate: { lt: now },
      },
      include: { supplier: { select: { name: true } } },
    });

    for (const inv of overduePurchaseInvoices) {
      const existing = await prisma.notification.findFirst({
        where: {
          type: 'invoice_overdue',
          createdAt: { gte: oneDayAgo },
          metadata: { path: ['invoiceId'], equals: inv.id },
        },
      });
      if (existing) continue;

      await prisma.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          type: 'invoice_overdue',
          title: 'Invoice Pembelian Jatuh Tempo',
          message: `Invoice ${inv.invoiceNumber} untuk ${inv.supplier.name} sudah melewati jatuh tempo.`,
          metadata: { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, invoiceType: 'purchase' },
        })),
      });
      created += userIds.length;
    }

    // 3. Check low stock inventory items
    const lowStockItems = await prisma.inventoryItem.findMany({
      where: {
        isActive: true,
        minimumStock: { gt: 0 },
        currentStock: { lte: prisma.inventoryItem.fields.minimumStock as any },
      },
    });

    // Since Prisma doesn't support comparing columns directly, do it in code
    const allActiveItems = await prisma.inventoryItem.findMany({
      where: { isActive: true, minimumStock: { gt: 0 } },
    });
    const lowItems = allActiveItems.filter(
      (item) => Number(item.currentStock) <= Number(item.minimumStock)
    );

    for (const item of lowItems) {
      const existing = await prisma.notification.findFirst({
        where: {
          type: 'low_stock',
          createdAt: { gte: oneDayAgo },
          metadata: { path: ['itemId'], equals: item.id },
        },
      });
      if (existing) continue;

      await prisma.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          type: 'low_stock',
          title: 'Stok Rendah',
          message: `Stok ${item.name} (${item.code}) tersisa ${Number(item.currentStock)} ${item.unit}, di bawah minimum ${Number(item.minimumStock)} ${item.unit}.`,
          metadata: { itemId: item.id, itemCode: item.code },
        })),
      });
      created += userIds.length;
    }

    return res.json({
      message: `Pengecekan selesai. ${created} notifikasi baru dibuat.`,
      created,
    });
  } catch (error) {
    logger.error({ error }, 'POST /notifications/check error');
    return res.status(500).json({ error: 'Gagal menjalankan pengecekan notifikasi.' });
  }
});

export default router;
