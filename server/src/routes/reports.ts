import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { computeImpact } from '../utils/accountBalance';
import { ACCOUNT_NUMBERS } from '../constants/accountNumbers';
import { logger } from '../lib/logger';
import { compareAccountNumber } from '../utils/accountSort';

const router = Router();

function parseQueryDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  return d;
}

// GET /api/reports/trial-balance
router.get('/trial-balance', async (req, res) => {
  const { startDate: rawStart, endDate: rawEnd } = req.query;
  const startDate = parseQueryDate(rawStart);
  const endDate = parseQueryDate(rawEnd);
  if (rawStart && typeof rawStart === 'string' && rawStart !== '' && !startDate) {
    return res.status(400).json({ error: 'Parameter startDate tidak valid.' });
  }
  if (rawEnd && typeof rawEnd === 'string' && rawEnd !== '' && !endDate) {
    return res.status(400).json({ error: 'Parameter endDate tidak valid.' });
  }

  try {
    const where: Prisma.AccountingLedgerEntryWhereInput = { isCancelled: false };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) (where.date as any).gte = startDate;
      if (endDate) (where.date as any).lte = endDate;
    }

    const [entries, accounts] = await Promise.all([
      prisma.accountingLedgerEntry.groupBy({
        by: ['accountId'],
        where,
        _sum: { debit: true, credit: true },
      }),
      prisma.account.findMany({
        where: { isGroup: false },
        select: { id: true, name: true, accountNumber: true, accountType: true, rootType: true },
      }),
    ]);

    accounts.sort((a, b) => compareAccountNumber(a.accountNumber, b.accountNumber));
    const entryMap = new Map(entries.map((e) => [e.accountId, e]));

    const report = accounts
      .map((account) => {
        const entry = entryMap.get(account.id);
        const debit = Number(entry?._sum.debit || 0);
        const credit = Number(entry?._sum.credit || 0);
        return { ...account, debit, credit, balance: computeImpact(account.rootType as string, debit, credit) };
      })
      .filter((a) => a.debit !== 0 || a.credit !== 0);

    return res.json(report);
  } catch (error) {
    logger.error({ error }, 'GET /reports/trial-balance error');
    return res.status(500).json({ error: 'Gagal membuat laporan neraca saldo.' });
  }
});

// GET /api/reports/profit-loss
router.get('/profit-loss', async (req, res) => {
  const { startDate: rawStart, endDate: rawEnd } = req.query;
  const startDate = parseQueryDate(rawStart);
  const endDate = parseQueryDate(rawEnd);
  if (rawStart && typeof rawStart === 'string' && rawStart !== '' && !startDate) {
    return res.status(400).json({ error: 'Parameter startDate tidak valid.' });
  }
  if (rawEnd && typeof rawEnd === 'string' && rawEnd !== '' && !endDate) {
    return res.status(400).json({ error: 'Parameter endDate tidak valid.' });
  }

  try {
    const where: Prisma.AccountingLedgerEntryWhereInput = {
      isCancelled: false,
      account: { OR: [{ rootType: 'REVENUE' as any }, { rootType: 'EXPENSE' as any }] },
    };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) (where.date as any).gte = startDate;
      if (endDate) (where.date as any).lte = endDate;
    }

    const [allAccounts, entries] = await Promise.all([
      prisma.account.findMany({
        where: { OR: [{ rootType: 'REVENUE' as any }, { rootType: 'EXPENSE' as any }] },
      }),
      prisma.accountingLedgerEntry.groupBy({
        by: ['accountId'],
        where,
        _sum: { debit: true, credit: true },
      }),
    ]);
    allAccounts.sort((a, b) => compareAccountNumber(a.accountNumber, b.accountNumber));

    const summaryMap = new Map(
      entries.map((e) => [
        e.accountId,
        { debit: Number(e._sum.debit || 0), credit: Number(e._sum.credit || 0) },
      ])
    );

    // O(n) with pre-built Maps instead of O(n²) allAccounts.find/filter
    const accountById = new Map(allAccounts.map((a) => [a.id, a]));
    const childrenOf = new Map<string | null, typeof allAccounts>();
    for (const a of allAccounts) {
      if (!childrenOf.has(a.parentId)) childrenOf.set(a.parentId, []);
      childrenOf.get(a.parentId)!.push(a);
    }

    const getBalance = (accountId: string): number => {
      const summ = summaryMap.get(accountId);
      const account = accountById.get(accountId);
      let balance = 0;
      if (summ && account) {
        balance = account.rootType === 'REVENUE' ? summ.credit - summ.debit : summ.debit - summ.credit;
      }
      for (const child of childrenOf.get(accountId) ?? []) {
        balance += getBalance(child.id);
      }
      return balance;
    };

    const buildHierarchy = (parentId: string | null): any[] =>
      (childrenOf.get(parentId) ?? [])
        .map((a) => ({
          id: a.id,
          name: a.name,
          accountNumber: a.accountNumber,
          isGroup: a.isGroup,
          balance: getBalance(a.id),
          children: a.isGroup ? buildHierarchy(a.id) : [],
        }))
        .filter((a) => a.balance !== 0 || a.isGroup);

    const revenueRoot = allAccounts.find((a) => a.isGroup && a.rootType === 'REVENUE' && !a.parentId);
    const revenueAccounts = buildHierarchy(revenueRoot?.id || null);

    // Handle ALL root-level EXPENSE accounts (both group and non-group like HPP account 5)
    const expenseRoots = allAccounts.filter((a) => a.rootType === 'EXPENSE' && !a.parentId);
    const expenseAccounts: any[] = [];
    for (const root of expenseRoots) {
      if (root.isGroup) {
        expenseAccounts.push(...buildHierarchy(root.id));
      } else {
        const balance = getBalance(root.id);
        if (balance !== 0) {
          expenseAccounts.push({
            id: root.id,
            name: root.name,
            accountNumber: root.accountNumber,
            isGroup: root.isGroup,
            balance,
            children: [],
          });
        }
      }
    }
    expenseAccounts.sort((a: any, b: any) => compareAccountNumber(a.accountNumber, b.accountNumber));

    const totalRevenue = revenueAccounts.reduce((s: number, a: any) => s + Number(a.balance), 0);
    const totalExpense = expenseAccounts.reduce((s: number, a: any) => s + Number(a.balance), 0);

    return res.json({
      revenue: revenueAccounts,
      expense: expenseAccounts,
      totalRevenue,
      totalExpense,
      netProfit: totalRevenue - totalExpense,
    });
  } catch (error) {
    logger.error({ error }, 'GET /reports/profit-loss error');
    return res.status(500).json({ error: 'Gagal membuat laporan laba rugi.' });
  }
});

// GET /api/reports/balance-sheet
router.get('/balance-sheet', async (req, res) => {
  const parsedDate = parseQueryDate(req.query.date);
  if (req.query.date && typeof req.query.date === 'string' && req.query.date !== '' && !parsedDate) {
    return res.status(400).json({ error: 'Parameter date tidak valid.' });
  }
  const targetDate = parsedDate ?? new Date();

  try {
    const [allAccounts, entries, revAgg, expAgg] = await Promise.all([
      prisma.account.findMany({
        where: { OR: [{ rootType: 'ASSET' as any }, { rootType: 'LIABILITY' as any }, { rootType: 'EQUITY' as any }] },
      }),
      prisma.accountingLedgerEntry.groupBy({
        by: ['accountId'],
        where: { date: { lte: targetDate }, isCancelled: false },
        _sum: { debit: true, credit: true },
      }),
      prisma.accountingLedgerEntry.aggregate({
        where: { date: { lte: targetDate }, isCancelled: false, account: { rootType: 'REVENUE' as any } },
        _sum: { debit: true, credit: true },
      }),
      prisma.accountingLedgerEntry.aggregate({
        where: { date: { lte: targetDate }, isCancelled: false, account: { rootType: 'EXPENSE' as any } },
        _sum: { debit: true, credit: true },
      }),
    ]);

    allAccounts.sort((a, b) => compareAccountNumber(a.accountNumber, b.accountNumber));
    const summaryMap = new Map(
      entries.map((e) => [e.accountId, { debit: Number(e._sum.debit || 0), credit: Number(e._sum.credit || 0) }])
    );

    // O(n) with pre-built Maps
    const accountById = new Map(allAccounts.map((a) => [a.id, a]));
    const childrenOf = new Map<string | null, typeof allAccounts>();
    for (const a of allAccounts) {
      if (!childrenOf.has(a.parentId)) childrenOf.set(a.parentId, []);
      childrenOf.get(a.parentId)!.push(a);
    }

    const getBalance = (accountId: string): number => {
      const summ = summaryMap.get(accountId);
      const account = accountById.get(accountId);
      let balance = 0;
      if (summ && account) {
        balance = account.rootType === 'ASSET' ? summ.debit - summ.credit : summ.credit - summ.debit;
      }
      for (const child of childrenOf.get(accountId) ?? []) {
        balance += getBalance(child.id);
      }
      return balance;
    };

    const buildHierarchy = (parentId: string | null, type: string): any[] =>
      (childrenOf.get(parentId) ?? [])
        .filter((a) => a.rootType === type)
        .map((a) => ({
          id: a.id,
          name: a.name,
          accountNumber: a.accountNumber,
          isGroup: a.isGroup,
          balance: getBalance(a.id),
          children: a.isGroup ? buildHierarchy(a.id, type) : [],
        }))
        .filter((a) => a.balance !== 0 || a.isGroup);

    const assets = buildHierarchy(null, 'ASSET');
    const liabilities = buildHierarchy(null, 'LIABILITY');
    const equity = buildHierarchy(null, 'EQUITY');

    const currentProfit =
      (Number(revAgg._sum?.credit || 0) - Number(revAgg._sum?.debit || 0)) -
      (Number(expAgg._sum?.debit || 0) - Number(expAgg._sum?.credit || 0));

    // Remove real 3.3.1 account from hierarchy to avoid double-counting with synthetic entry
    const filterOutCurrentProfit = (items: any[]): any[] =>
      items
        .map((item) => ({
          ...item,
          children: item.children ? filterOutCurrentProfit(item.children) : [],
        }))
        .filter((item) => item.accountNumber !== ACCOUNT_NUMBERS.CURRENT_PROFIT);
    const filteredEquity = filterOutCurrentProfit(equity);

    filteredEquity.push({
      id: 'current-profit',
      name: 'Laba Tahun Berjalan',
      accountNumber: ACCOUNT_NUMBERS.CURRENT_PROFIT,
      isGroup: false,
      balance: currentProfit,
      children: [],
    });

    return res.json({
      assets,
      liabilities,
      equity: filteredEquity,
      totalAssets: assets.reduce((s: number, a: any) => s + a.balance, 0),
      totalLiabilities: liabilities.reduce((s: number, a: any) => s + a.balance, 0),
      totalEquity: filteredEquity.reduce((s: number, a: any) => s + a.balance, 0),
    });
  } catch (error) {
    logger.error({ error }, 'GET /reports/balance-sheet error');
    return res.status(500).json({ error: 'Gagal membuat laporan neraca.' });
  }
});

// GET /api/reports/cash-flow
router.get('/cash-flow', async (req, res) => {
  const { startDate: rawStart, endDate: rawEnd } = req.query;
  const parsedStart = parseQueryDate(rawStart);
  const parsedEnd = parseQueryDate(rawEnd);
  if (rawStart && typeof rawStart === 'string' && rawStart !== '' && !parsedStart) {
    return res.status(400).json({ error: 'Parameter startDate tidak valid.' });
  }
  if (rawEnd && typeof rawEnd === 'string' && rawEnd !== '' && !parsedEnd) {
    return res.status(400).json({ error: 'Parameter endDate tidak valid.' });
  }
  const start = parsedStart ?? new Date(new Date().getFullYear(), 0, 1);
  const end = parsedEnd ?? new Date();

  try {
    const cashAccounts = await prisma.account.findMany({
      where: {
        OR: ACCOUNT_NUMBERS.CASH.map((prefix) => ({ accountNumber: { startsWith: prefix } })),
        isGroup: false,
        isActive: true,
      },
    });
    const cashAccountIds = cashAccounts.map((a) => a.id);

    const cashEntries = await prisma.accountingLedgerEntry.findMany({
      where: { accountId: { in: cashAccountIds }, date: { gte: start, lte: end }, isCancelled: false },
      take: 50000,
    });

    const refIds = [...new Set(cashEntries.map((e) => e.referenceId).filter((id): id is string => !!id))];

    const offsettingEntries = await prisma.accountingLedgerEntry.findMany({
      where: { referenceId: { in: refIds }, accountId: { notIn: cashAccountIds }, isCancelled: false },
      include: { account: { select: { name: true, rootType: true, accountNumber: true } } },
      take: 50000,
    });

    let operating = 0;
    let investing = 0;
    let financing = 0;
    const operatingDetails: any[] = [];
    const investingDetails: any[] = [];
    const financingDetails: any[] = [];

    offsettingEntries.forEach((ent) => {
      const amount = Number(ent.credit) - Number(ent.debit);
      const rootType = ent.account.rootType as string;
      const accNum = ent.account.accountNumber;

      if (rootType === 'REVENUE' || rootType === 'EXPENSE' || accNum.startsWith(ACCOUNT_NUMBERS.AR) || accNum.startsWith(ACCOUNT_NUMBERS.AP)) {
        operating += amount;
        operatingDetails.push({ name: ent.account.name, amount });
      } else if (accNum.startsWith('1.6') || accNum.startsWith('1.7')) {
        investing += amount;
        investingDetails.push({ name: ent.account.name, amount });
      } else if (rootType === 'EQUITY' || accNum.startsWith('2.3')) {
        financing += amount;
        financingDetails.push({ name: ent.account.name, amount });
      } else {
        operating += amount;
        operatingDetails.push({ name: ent.account.name, amount });
      }
    });

    return res.json({
      operating,
      investing,
      financing,
      netChange: operating + investing + financing,
      details: { operating: operatingDetails, investing: investingDetails, financing: financingDetails },
    });
  } catch (error) {
    logger.error({ error }, 'GET /reports/cash-flow error');
    return res.status(500).json({ error: 'Gagal membuat laporan arus kas.' });
  }
});

// GET /api/reports/aging
router.get('/aging', async (req, res) => {
  const type = (req.query.type as string) === 'Supplier' ? 'Supplier' : 'Customer';
  const targetDate = new Date();

  try {
    let invoices: any[];
    if (type === 'Customer') {
      invoices = await prisma.salesInvoice.findMany({
        where: { status: { in: ['Submitted', 'PartiallyPaid', 'Overdue'] } },
        include: { customer: { select: { name: true } } },
        orderBy: { date: 'asc' },
        take: 10000,
      });
    } else {
      invoices = await prisma.purchaseInvoice.findMany({
        where: { status: { in: ['Submitted', 'PartiallyPaid', 'Overdue'] } },
        include: { supplier: { select: { name: true } } },
        orderBy: { date: 'asc' },
        take: 10000,
      });
    }

    const aging: Record<string, { current: number; 1: number; 31: number; 61: number; 91: number; total: number }> = {};

    invoices.forEach((inv: any) => {
      const partyName = type === 'Customer' ? inv.customer.name : inv.supplier.name;
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.date);
      const diffDays = Math.ceil((targetDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const amt = Number(inv.outstanding);

      if (!aging[partyName]) {
        aging[partyName] = { current: 0, 1: 0, 31: 0, 61: 0, 91: 0, total: 0 };
      }

      aging[partyName].total += amt;
      if (diffDays <= 0) aging[partyName].current += amt;
      else if (diffDays <= 30) aging[partyName][1] += amt;
      else if (diffDays <= 60) aging[partyName][31] += amt;
      else if (diffDays <= 90) aging[partyName][61] += amt;
      else aging[partyName][91] += amt;
    });

    return res.json(Object.entries(aging).map(([name, data]) => ({ name, ...data })));
  } catch (error) {
    logger.error({ error }, 'GET /reports/aging error');
    return res.status(500).json({ error: 'Gagal membuat laporan aging.' });
  }
});

// GET /api/reports/ledger-detail — detailed ledger entries for a specific account
router.get('/ledger-detail', async (req, res) => {
  const { accountId, startDate: rawStart, endDate: rawEnd } = req.query;

  if (!accountId || typeof accountId !== 'string') {
    return res.status(400).json({ error: 'Parameter accountId wajib diisi.' });
  }

  const startDate = parseQueryDate(rawStart);
  const endDate = parseQueryDate(rawEnd);
  if (rawStart && typeof rawStart === 'string' && rawStart !== '' && !startDate) {
    return res.status(400).json({ error: 'Parameter startDate tidak valid.' });
  }
  if (rawEnd && typeof rawEnd === 'string' && rawEnd !== '' && !endDate) {
    return res.status(400).json({ error: 'Parameter endDate tidak valid.' });
  }

  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, name: true, accountNumber: true, rootType: true },
    });
    if (!account) {
      return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    }

    const where: Prisma.AccountingLedgerEntryWhereInput = {
      accountId,
      isCancelled: false,
    };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) (where.date as any).gte = startDate;
      if (endDate) (where.date as any).lte = endDate;
    }

    const entries = await prisma.accountingLedgerEntry.findMany({
      where,
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        debit: true,
        credit: true,
        description: true,
        referenceType: true,
        referenceId: true,
      },
      take: 10000,
    });

    // Compute running balance
    const isDebitNormal = account.rootType === 'ASSET' || account.rootType === 'EXPENSE';
    let runningBalance = 0;
    const rows = entries.map((e) => {
      const debit = Number(e.debit);
      const credit = Number(e.credit);
      runningBalance += isDebitNormal ? (debit - credit) : (credit - debit);
      return {
        ...e,
        debit,
        credit,
        runningBalance,
      };
    });

    return res.json({
      accountId: account.id,
      accountName: account.name,
      accountNumber: account.accountNumber,
      entries: rows,
    });
  } catch (error) {
    logger.error({ error }, 'GET /reports/ledger-detail error');
    return res.status(500).json({ error: 'Gagal mengambil detail buku besar.' });
  }
});

// POST /api/reports/export — export to Excel
router.post('/export', async (req, res) => {
  const { filename, data } = req.body;
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Data tidak valid untuk ekspor.' });
  }
  if (data.length > 50000) {
    return res.status(400).json({ error: 'Data terlalu banyak untuk ekspor (maks. 50.000 baris).' });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // Add headers from first data row keys
    if (data.length > 0) {
      worksheet.columns = Object.keys(data[0]).map((key) => ({
        header: key,
        key,
        width: 20,
      }));
    }

    // Add rows
    data.forEach((row: Record<string, unknown>) => worksheet.addRow(row));

    // Style header row
    worksheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const safeName = (filename || 'report').replace(/[^\w\-\.]/g, '_').slice(0, 100);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.xlsx"`);
    return res.send(Buffer.from(buffer));
  } catch (error) {
    logger.error({ error }, 'POST /reports/export error');
    return res.status(500).json({ error: 'Gagal ekspor ke Excel.' });
  }
});

export default router;
