import { Router } from 'express';
import { roleMiddleware } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { recalculateAccountBalances } from '../utils/accountBalance';

const router = Router();

interface CheckResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  count: number;
  details?: unknown[];
  fixable: boolean;
}

// ── GET /api/health-check — Run all diagnostic checks ────────────────────────
router.get('/', roleMiddleware(['Admin']), async (_req, res) => {
  try {
    const checks: CheckResult[] = await Promise.all([
      checkAleSync(),
      checkAccountBalanceDrift(),
      checkUnbalancedJournals(),
      checkOrphanAle(),
      checkStockMovementMismatch(),
    ]);

    const overallStatus = checks.some((c) => c.status === 'error')
      ? 'error'
      : checks.some((c) => c.status === 'warning')
        ? 'warning'
        : 'ok';

    res.json({ success: true, data: { status: overallStatus, checks } });
  } catch (error) {
    logger.error(error, 'Health check failed');
    res.status(500).json({ success: false, error: 'Gagal menjalankan health check' });
  }
});

// ── POST /api/health-check/fix/:check — Auto-fix a specific check ────────────
router.post('/fix/:check', roleMiddleware(['Admin']), async (req, res) => {
  const { check } = req.params;

  try {
    let result: { fixed: number; message: string };

    switch (check) {
      case 'ale-sync':
        result = await fixAleSync();
        break;
      case 'account-balance-drift':
        result = await fixAccountBalanceDrift();
        break;
      case 'orphan-ale':
        result = await fixOrphanAle();
        break;
      default:
        return res.status(400).json({ success: false, error: 'Check tidak dapat diperbaiki otomatis' });
    }

    logger.info({ check, result }, 'Health check fix applied');
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(error, `Health check fix failed: ${check}`);
    res.status(500).json({ success: false, error: 'Gagal memperbaiki masalah' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CHECK FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 1. ALE vs JournalItem sync
 * Compare ALE totals (per account, for JournalEntry references) against JournalItem totals.
 */
async function checkAleSync(): Promise<CheckResult> {
  const mismatches = await prisma.$queryRaw<Array<{
    account_id: string;
    account_code: string;
    account_name: string;
    ji_debit: number;
    ji_credit: number;
    ale_debit: number;
    ale_credit: number;
  }>>`
    WITH ji_totals AS (
      SELECT jea.account_id,
             SUM(jea.debit)  AS total_debit,
             SUM(jea.credit) AS total_credit
        FROM journal_entry_accounts jea
        JOIN journal_entries je ON je.id = jea.journal_entry_id
       WHERE je.status != 'Cancelled'
       GROUP BY jea.account_id
    ),
    ale_totals AS (
      SELECT ale.account_id,
             SUM(ale.debit)  AS total_debit,
             SUM(ale.credit) AS total_credit
        FROM accounting_ledger_entries ale
       WHERE ale.reference_type = 'JournalEntry'
         AND ale.is_cancelled = false
       GROUP BY ale.account_id
    )
    SELECT COALESCE(ji.account_id, ale.account_id) AS account_id,
           a."accountNumber" AS account_code,
           a.name AS account_name,
           COALESCE(ji.total_debit, 0)  AS ji_debit,
           COALESCE(ji.total_credit, 0) AS ji_credit,
           COALESCE(ale.total_debit, 0) AS ale_debit,
           COALESCE(ale.total_credit, 0) AS ale_credit
      FROM ji_totals ji
      FULL OUTER JOIN ale_totals ale ON ji.account_id = ale.account_id
      JOIN accounts a ON a.id = COALESCE(ji.account_id, ale.account_id)
     WHERE COALESCE(ji.total_debit, 0) != COALESCE(ale.total_debit, 0)
        OR COALESCE(ji.total_credit, 0) != COALESCE(ale.total_credit, 0)
     ORDER BY a."accountNumber"
  `;

  return {
    name: 'ALE vs JournalItem Sync',
    status: mismatches.length > 0 ? 'error' : 'ok',
    message: mismatches.length > 0
      ? `${mismatches.length} akun memiliki perbedaan antara ALE dan JournalItem`
      : 'ALE dan JournalItem sinkron',
    count: mismatches.length,
    details: mismatches.slice(0, 20),
    fixable: true,
  };
}

/**
 * 2. Account balance drift
 * Compare accounts.balance against computed balance from JournalItems.
 */
async function checkAccountBalanceDrift(): Promise<CheckResult> {
  const drifts = await prisma.$queryRaw<Array<{
    account_id: string;
    account_code: string;
    account_name: string;
    root_type: string;
    stored_balance: number;
    computed_balance: number;
    drift: number;
  }>>`
    WITH computed AS (
      SELECT jea.account_id,
             a."rootType" AS root_type,
             CASE
               WHEN a."rootType" IN ('ASSET', 'EXPENSE')
                 THEN SUM(jea.debit) - SUM(jea.credit)
               ELSE SUM(jea.credit) - SUM(jea.debit)
             END AS computed_balance
        FROM journal_entry_accounts jea
        JOIN journal_entries je ON je.id = jea.journal_entry_id
        JOIN accounts a ON a.id = jea.account_id
       WHERE je.status != 'Cancelled'
       GROUP BY jea.account_id, a."rootType"
    )
    SELECT c.account_id,
           a."accountNumber" AS account_code,
           a.name AS account_name,
           c.root_type,
           a.balance AS stored_balance,
           c.computed_balance,
           ABS(a.balance - c.computed_balance) AS drift
      FROM computed c
      JOIN accounts a ON a.id = c.account_id
     WHERE ABS(a.balance - c.computed_balance) > 0.01
     ORDER BY ABS(a.balance - c.computed_balance) DESC
     LIMIT 20
  `;

  return {
    name: 'Account Balance Drift',
    status: drifts.length > 0 ? 'warning' : 'ok',
    message: drifts.length > 0
      ? `${drifts.length} akun memiliki saldo yang tidak sesuai dengan jurnal`
      : 'Semua saldo akun sesuai',
    count: drifts.length,
    details: drifts,
    fixable: true,
  };
}

/**
 * 3. Unbalanced journal entries
 * Find posted journals where total debit != total credit.
 */
async function checkUnbalancedJournals(): Promise<CheckResult> {
  const unbalanced = await prisma.$queryRaw<Array<{
    journal_id: string;
    entry_number: string;
    total_debit: number;
    total_credit: number;
    difference: number;
  }>>`
    SELECT je.id AS journal_id,
           je.entry_number,
           SUM(jea.debit)  AS total_debit,
           SUM(jea.credit) AS total_credit,
           ABS(SUM(jea.debit) - SUM(jea.credit)) AS difference
      FROM journal_entries je
      JOIN journal_entry_accounts jea ON jea.journal_entry_id = je.id
     WHERE je.status = 'Submitted'
     GROUP BY je.id, je.entry_number
    HAVING ABS(SUM(jea.debit) - SUM(jea.credit)) > 0.01
     ORDER BY difference DESC
     LIMIT 20
  `;

  return {
    name: 'Unbalanced Journal Entries',
    status: unbalanced.length > 0 ? 'error' : 'ok',
    message: unbalanced.length > 0
      ? `${unbalanced.length} jurnal tidak balance (debit ≠ kredit)`
      : 'Semua jurnal balance',
    count: unbalanced.length,
    details: unbalanced,
    fixable: false,
  };
}

/**
 * 4. Orphan ALE entries
 * ALE entries whose source record no longer exists.
 */
async function checkOrphanAle(): Promise<CheckResult> {
  const orphans = await prisma.$queryRaw<Array<{
    ale_id: string;
    reference_type: string;
    reference_id: string;
    account_code: string;
    debit: number;
    credit: number;
  }>>`
    SELECT ale.id AS ale_id,
           ale.reference_type,
           ale.reference_id,
           a."accountNumber" AS account_code,
           ale.debit,
           ale.credit
      FROM accounting_ledger_entries ale
      JOIN accounts a ON a.id = ale.account_id
     WHERE ale.is_cancelled = false
       AND (
         (ale.reference_type = 'JournalEntry'
           AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = ale.reference_id))
         OR
         (ale.reference_type = 'StockMovement'
           AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.id = ale.reference_id))
         OR
         (ale.reference_type = 'StockOpname'
           AND NOT EXISTS (SELECT 1 FROM stock_opnames so WHERE so.id = ale.reference_id))
       )
     ORDER BY ale.reference_type
     LIMIT 30
  `;

  return {
    name: 'Orphan ALE Entries',
    status: orphans.length > 0 ? 'warning' : 'ok',
    message: orphans.length > 0
      ? `${orphans.length} entri ALE merujuk ke record yang tidak ada`
      : 'Tidak ada ALE orphan',
    count: orphans.length,
    details: orphans.slice(0, 20),
    fixable: true,
  };
}

/**
 * 5. Stock vs movement mismatch
 * Compare product currentStock against sum of stock movements.
 */
async function checkStockMovementMismatch(): Promise<CheckResult> {
  const mismatches = await prisma.$queryRaw<Array<{
    item_id: string;
    item_name: string;
    code: string;
    stored_stock: number;
    computed_stock: number;
    difference: number;
  }>>`
    WITH computed AS (
      SELECT sm.item_id,
             SUM(CASE WHEN sm.movement_type IN ('In', 'AdjustmentIn') THEN sm.quantity ELSE -sm.quantity END) AS total_stock
        FROM stock_movements sm
       WHERE sm.is_cancelled = false
       GROUP BY sm.item_id
    )
    SELECT i.id AS item_id,
           i.name AS item_name,
           i.code,
           i.current_stock AS stored_stock,
           COALESCE(c.total_stock, 0) AS computed_stock,
           ABS(i.current_stock - COALESCE(c.total_stock, 0)) AS difference
      FROM inventory_items i
      LEFT JOIN computed c ON c.item_id = i.id
     WHERE ABS(i.current_stock - COALESCE(c.total_stock, 0)) > 0.001
     ORDER BY difference DESC
     LIMIT 20
  `;

  return {
    name: 'Stock vs Movement Mismatch',
    status: mismatches.length > 0 ? 'warning' : 'ok',
    message: mismatches.length > 0
      ? `${mismatches.length} produk memiliki stok tidak sesuai dengan movement`
      : 'Semua stok produk sesuai',
    count: mismatches.length,
    details: mismatches,
    fixable: false,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// FIX FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fix ALE sync: delete all JournalEntry ALEs and recreate from JournalItems.
 */
async function fixAleSync(): Promise<{ fixed: number; message: string }> {
  return await prisma.$transaction(async (tx) => {
    // Delete all JournalEntry ALE entries
    const deleted = await tx.accountingLedgerEntry.deleteMany({
      where: { referenceType: 'JournalEntry' },
    });

    // Recreate from JournalItems for all journal entries (Posted + Cancelled)
    const journalEntries = await tx.journalEntry.findMany({
      include: { items: true },
    });

    let created = 0;
    for (const je of journalEntries) {
      const isCancelled = je.status === 'Cancelled';
      for (const item of je.items) {
        await tx.accountingLedgerEntry.create({
          data: {
            date: je.date,
            accountId: item.accountId,
            partyId: item.partyId,
            debit: item.debit,
            credit: item.credit,
            referenceType: 'JournalEntry',
            referenceId: je.id,
            description: item.description || je.narration || '',
            fiscalYearId: je.fiscalYearId,
            isCancelled,
          },
        });
        created++;
      }
    }

    return {
      fixed: created,
      message: `Dihapus ${deleted.count} ALE lama, dibuat ${created} ALE baru dari JournalItem`,
    };
  }, { timeout: 120000 });
}

/**
 * Fix account balance drift: recalculate all account balances from JournalItems.
 */
async function fixAccountBalanceDrift(): Promise<{ fixed: number; message: string }> {
  return await prisma.$transaction(async (tx) => {
    await recalculateAccountBalances(tx);
    const count = await tx.account.count();
    return { fixed: count, message: `Dihitung ulang saldo ${count} akun dari jurnal` };
  }, { timeout: 60000 });
}

/**
 * Fix orphan ALE: mark orphan entries as cancelled.
 */
async function fixOrphanAle(): Promise<{ fixed: number; message: string }> {
  const result = await prisma.$executeRaw`
    UPDATE accounting_ledger_entries ale
       SET is_cancelled = true
     WHERE ale.is_cancelled = false
       AND (
         (ale.reference_type = 'JournalEntry'
           AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = ale.reference_id))
         OR
         (ale.reference_type = 'StockMovement'
           AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.id = ale.reference_id))
         OR
         (ale.reference_type = 'StockOpname'
           AND NOT EXISTS (SELECT 1 FROM stock_opnames so WHERE so.id = ale.reference_id))
       )
  `;

  return { fixed: result, message: `${result} entri ALE orphan ditandai sebagai cancelled` };
}

export default router;
