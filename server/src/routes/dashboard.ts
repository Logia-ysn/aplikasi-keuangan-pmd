import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ACCOUNT_NUMBERS } from '../constants/accountNumbers';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/dashboard/metrics
router.get('/metrics', async (req, res) => {
  try {
    const cashAccounts = await prisma.account.findMany({
      where: {
        OR: ACCOUNT_NUMBERS.CASH.map((num) => ({ accountNumber: { startsWith: num } })),
        isGroup: false,
        isActive: true,
      },
    });
    const cashBalance = cashAccounts.reduce((sum, acc) => sum + Number(acc.balance), 0);

    const [arAcc, apAcc] = await Promise.all([
      prisma.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.AR } }),
      prisma.account.findFirst({ where: { accountNumber: ACCOUNT_NUMBERS.AP } }),
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
      accountsPayable: Math.max(0, Number(apAcc?.balance || 0)),
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

export default router;
