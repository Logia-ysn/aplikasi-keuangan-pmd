-- =============================================================
-- FIX: Cancel duplicate retro-sm ledger entries
-- Date: 2026-04-05
-- =============================================================
-- retro-sm-0030/0031: Duplikat dari SO-202604-0003
-- retro-sm-0032/0033/0034: Duplikat dari SO-202604-0004
-- retro-sm-0038/0039/0040: Orphaned (stock movements sudah cancelled)
-- =============================================================

BEGIN;

-- Step 1: Cancel ALL retro-sm entries
UPDATE accounting_ledger_entries
SET is_cancelled = true
WHERE reference_id LIKE 'retro-sm-%'
  AND is_cancelled = false;
-- Expected: 16 rows (8 references × 2 sides each)

-- Step 2: Recalculate ALL account balances from active ledger
UPDATE accounts a
SET balance = COALESCE(sub.new_balance, 0)
FROM (
  SELECT
    a2.id,
    CASE
      WHEN a2."rootType" IN ('ASSET', 'EXPENSE')
        THEN COALESCE(SUM(CASE WHEN ale.is_cancelled = false THEN ale.debit ELSE 0 END), 0)
           - COALESCE(SUM(CASE WHEN ale.is_cancelled = false THEN ale.credit ELSE 0 END), 0)
      ELSE
        COALESCE(SUM(CASE WHEN ale.is_cancelled = false THEN ale.credit ELSE 0 END), 0)
           - COALESCE(SUM(CASE WHEN ale.is_cancelled = false THEN ale.debit ELSE 0 END), 0)
    END as new_balance
  FROM accounts a2
  LEFT JOIN accounting_ledger_entries ale ON ale.account_id = a2.id
  WHERE a2."isGroup" = false
  GROUP BY a2.id, a2."rootType"
) sub
WHERE a.id = sub.id
  AND a."isGroup" = false;

-- Step 3: Verification

-- 3a. Compare stock value vs account balance
SELECT
  ii.code,
  ii.name,
  ii.current_stock as stok_kg,
  ii.average_cost as avg_cost,
  ROUND(ii.current_stock * ii.average_cost, 2) as stock_value,
  a.balance as account_balance,
  ROUND(a.balance - ii.current_stock * ii.average_cost, 2) as selisih,
  CASE
    WHEN ii.current_stock > 0 THEN ROUND(a.balance / ii.current_stock, 2)
    ELSE 0
  END as nilai_per_kg
FROM inventory_items ii
LEFT JOIN accounts a ON ii.account_id = a.id
WHERE ii.is_active = true AND ii.current_stock > 0
ORDER BY ABS(a.balance - ii.current_stock * ii.average_cost) DESC;

-- 3b. Trial Balance
SELECT 'Trial Balance' as check,
  SUM(CASE WHEN a."rootType" IN ('ASSET','EXPENSE') THEN a.balance ELSE -a.balance END) as result
FROM accounts a WHERE a."isGroup" = false;

-- 3c. Ledger global balance
SELECT 'Ledger Balance' as check,
  SUM(CASE WHEN is_cancelled = false THEN debit ELSE 0 END) -
  SUM(CASE WHEN is_cancelled = false THEN credit ELSE 0 END) as result
FROM accounting_ledger_entries;

-- 3d. Remaining mismatches
SELECT 'Remaining mismatches' as check, COUNT(*) as result
FROM (
  SELECT a.id
  FROM accounts a
  LEFT JOIN accounting_ledger_entries ale ON ale.account_id = a.id
  WHERE a."isGroup" = false
  GROUP BY a.id, a."accountNumber", a."rootType", a.balance
  HAVING ABS(
    a.balance - CASE
      WHEN a."rootType" IN ('ASSET','EXPENSE')
        THEN COALESCE(SUM(CASE WHEN ale.is_cancelled = false THEN ale.debit ELSE 0 END), 0)
           - COALESCE(SUM(CASE WHEN ale.is_cancelled = false THEN ale.credit ELSE 0 END), 0)
      ELSE
        COALESCE(SUM(CASE WHEN ale.is_cancelled = false THEN ale.credit ELSE 0 END), 0)
           - COALESCE(SUM(CASE WHEN ale.is_cancelled = false THEN ale.debit ELSE 0 END), 0)
    END
  ) > 1
) m;

-- 3e. Check GKG-IR (1.4.6) should now be 0
SELECT '1.4.6 balance' as check, a.balance as result
FROM accounts a WHERE a."accountNumber" = '1.4.6';

COMMIT;
