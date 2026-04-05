import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { roleMiddleware } from '../middleware/auth';
import { systemAccounts } from '../services/systemAccounts';
import { logger } from '../lib/logger';

const router = Router();

// All dashboard endpoints require at least Viewer role
router.use(roleMiddleware(['Admin', 'Accountant', 'Viewer']));

// GET /api/dashboard/metrics
router.get('/metrics', async (req, res) => {
  try {
    const cashAccounts = await systemAccounts.getAccounts('CASH');
    // Fetch actual balances for cash accounts
    const cashAccountRecords = await prisma.account.findMany({
      where: { id: { in: cashAccounts.map((a) => a.id) }, isGroup: false, isActive: true },
    });
    const cashBalance = cashAccountRecords.reduce((sum, acc) => sum + Number(acc.balance), 0);

    const [arMapping, vendorDepositMapping, inventoryValueResult, totalLiabilities] = await Promise.all([
      systemAccounts.getAccount('AR'),
      systemAccounts.getAccount('VENDOR_DEPOSIT'),
      prisma.$queryRaw<[{ total: bigint }]>`
        SELECT COALESCE(SUM(
          CASE WHEN sm.movement_type IN ('In', 'AdjustmentIn') THEN sm.total_value
               ELSE -sm.total_value END
        ), 0) AS total
        FROM stock_movements sm
        JOIN inventory_items ii ON sm.item_id = ii.id
        WHERE ii.is_active = true AND sm.is_cancelled = false
      `,
      // Sum all LIABILITY account balances for total hutang
      prisma.account.aggregate({
        where: { rootType: 'LIABILITY' as any, isGroup: false, isActive: true },
        _sum: { balance: true },
      }),
    ]);

    const [arAcc, vendorDepositAcc] = await Promise.all([
      prisma.account.findUnique({ where: { id: arMapping.id }, select: { balance: true } }),
      prisma.account.findUnique({ where: { id: vendorDepositMapping.id }, select: { balance: true } }),
    ]);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [revEntries, expEntries] = await Promise.all([
      prisma.accountingLedgerEntry.aggregate({
        where: { date: { gte: startOfMonth }, isCancelled: false, account: { rootType: 'REVENUE' as any } },
        _sum: { credit: true, debit: true },
      }),
      prisma.accountingLedgerEntry.aggregate({
        where: { date: { gte: startOfMonth }, isCancelled: false, account: { rootType: 'EXPENSE' as any } },
        _sum: { credit: true, debit: true },
      }),
    ]);

    const netRevenue = Number(revEntries._sum?.credit || 0) - Number(revEntries._sum?.debit || 0);
    const netExpense = Number(expEntries._sum?.debit || 0) - Number(expEntries._sum?.credit || 0);
    const netProfit = netRevenue - netExpense;

    return res.json({
      cashBalance,
      accountsReceivable: Math.max(0, Number(arAcc?.balance || 0)),
      accountsPayable: Math.max(0, Number(totalLiabilities._sum?.balance || 0)),
      vendorDeposit: Math.max(0, Number(vendorDepositAcc?.balance || 0)),
      inventoryValue: Math.max(0, Number(inventoryValueResult[0]?.total || 0)),
      netProfit,
    });
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/metrics error');
    return res.status(500).json({ error: 'Gagal mengambil metrik dashboard.' });
  }
});

// GET /api/dashboard/charts — 6-month revenue vs expense (single SQL query)
router.get('/charts', async (req, res) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const rows = await prisma.$queryRaw<Array<{ month: Date; pendapatan: bigint; beban: bigint }>>`
      SELECT
        date_trunc('month', ale.date) AS month,
        COALESCE(SUM(CASE WHEN a."rootType" = 'REVENUE' THEN ale.credit - ale.debit ELSE 0 END), 0) AS pendapatan,
        COALESCE(SUM(CASE WHEN a."rootType" = 'EXPENSE' THEN ale.debit - ale.credit ELSE 0 END), 0) AS beban
      FROM accounting_ledger_entries ale
      JOIN accounts a ON ale.account_id = a.id
      WHERE ale.date >= ${sixMonthsAgo}
        AND ale.is_cancelled = false
        AND a."rootType" IN ('REVENUE', 'EXPENSE')
      GROUP BY date_trunc('month', ale.date)
      ORDER BY month ASC
    `;

    // Build month labels and fill missing months with 0
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        name: d.toLocaleString('id-ID', { month: 'short' }),
      };
    });

    const rowMap = new Map(
      rows.map((r) => {
        const d = new Date(r.month);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return [key, { pendapatan: Math.max(0, Number(r.pendapatan)), beban: Math.max(0, Number(r.beban)) }];
      })
    );

    const chartData = months.map((m) => ({
      name: m.name,
      pendapatan: rowMap.get(m.key)?.pendapatan ?? 0,
      beban: rowMap.get(m.key)?.beban ?? 0,
    }));

    return res.json(chartData);
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/charts error');
    return res.status(500).json({ error: 'Gagal mengambil data chart.' });
  }
});

// GET /api/dashboard/top-customers — top 5 customers by total sales
router.get('/top-customers', async (req, res) => {
  try {
    const results = await prisma.salesInvoice.groupBy({
      by: ['partyId'],
      where: { status: { notIn: ['Draft', 'Cancelled'] } },
      _sum: { grandTotal: true },
      orderBy: { _sum: { grandTotal: 'desc' } },
      take: 5,
    });

    const partyIds = results.map((r) => r.partyId);
    const parties = await prisma.party.findMany({
      where: { id: { in: partyIds } },
      select: { id: true, name: true },
    });
    const partyMap = new Map(parties.map((p) => [p.id, p.name]));

    const data = results.map((r, i) => ({
      rank: i + 1,
      partyId: r.partyId,
      partyName: partyMap.get(r.partyId) || 'Unknown',
      total: Number(r._sum.grandTotal || 0),
    }));

    return res.json(data);
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/top-customers error');
    return res.status(500).json({ error: 'Gagal mengambil data pelanggan teratas.' });
  }
});

// GET /api/dashboard/overdue — overdue invoices
router.get('/overdue', async (req, res) => {
  try {
    const now = new Date();

    const [salesOverdue, purchaseOverdue] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: {
          dueDate: { lt: now },
          outstanding: { gt: 0 },
          status: { notIn: ['Draft', 'Cancelled', 'Paid'] },
        },
        include: { customer: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      prisma.purchaseInvoice.findMany({
        where: {
          dueDate: { lt: now },
          outstanding: { gt: 0 },
          status: { notIn: ['Draft', 'Cancelled', 'Paid'] },
        },
        include: { supplier: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
    ]);

    const data = [
      ...salesOverdue.map((inv) => ({
        type: 'sales' as const,
        invoiceNumber: inv.invoiceNumber,
        partyName: inv.customer.name,
        amount: Number(inv.outstanding),
        dueDate: inv.dueDate,
        daysOverdue: Math.ceil((now.getTime() - new Date(inv.dueDate!).getTime()) / (1000 * 60 * 60 * 24)),
      })),
      ...purchaseOverdue.map((inv) => ({
        type: 'purchase' as const,
        invoiceNumber: inv.invoiceNumber,
        partyName: inv.supplier.name,
        amount: Number(inv.outstanding),
        dueDate: inv.dueDate,
        daysOverdue: Math.ceil((now.getTime() - new Date(inv.dueDate!).getTime()) / (1000 * 60 * 60 * 24)),
      })),
    ]
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 10);

    return res.json(data);
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/overdue error');
    return res.status(500).json({ error: 'Gagal mengambil data invoice jatuh tempo.' });
  }
});

// GET /api/dashboard/expense-breakdown — expenses by category for current month
router.get('/expense-breakdown', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const entries = await prisma.accountingLedgerEntry.groupBy({
      by: ['accountId'],
      where: {
        date: { gte: startOfMonth },
        isCancelled: false,
        account: { rootType: 'EXPENSE' as any },
      },
      _sum: { debit: true, credit: true },
    });

    const accountIds = entries.map((e) => e.accountId);
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, name: true, accountNumber: true },
    });
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    const data = entries
      .map((e) => {
        const acc = accountMap.get(e.accountId);
        const amount = Number(e._sum.debit || 0) - Number(e._sum.credit || 0);
        return {
          accountId: e.accountId,
          accountName: acc?.name || 'Unknown',
          accountNumber: acc?.accountNumber || '',
          amount: Math.max(0, amount),
        };
      })
      .filter((d) => d.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    return res.json(data);
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/expense-breakdown error');
    return res.status(500).json({ error: 'Gagal mengambil data breakdown beban.' });
  }
});

// GET /api/dashboard/stock-alerts — items where currentStock < minimumStock
router.get('/stock-alerts', async (req, res) => {
  try {
    const rawAlerts = await prisma.$queryRaw<any[]>`
      SELECT id, code, name, unit, category, current_stock AS "currentStock", minimum_stock AS "minimumStock"
      FROM inventory_items
      WHERE is_active = true AND minimum_stock > 0 AND current_stock <= minimum_stock
      ORDER BY current_stock ASC
      LIMIT 20
    `;

    const alerts = rawAlerts.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      currentStock: Number(item.currentStock),
      minimumStock: Number(item.minimumStock),
      status: Number(item.currentStock) === 0 ? 'Habis' : 'Rendah',
    }));

    return res.json(alerts);
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/stock-alerts error');
    return res.status(500).json({ error: 'Gagal mengambil data stok alert.' });
  }
});

export default router;
