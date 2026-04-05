-- =============================================================
-- FIX: Data Integrity Migration — Balance Recalculation
-- Date: 2026-04-05
-- =============================================================
-- STEP 1: Cancel duplicate production ledger entries
-- PR-0004/0005/0006 masing-masing punya 2 active entries identik
-- dari bug edit production run. Cancel yang kedua (later reference_id).
-- =============================================================

BEGIN;

-- 1a. Cancel duplicates: PR-0004 (reference 437d6ddb)
UPDATE accounting_ledger_entries
SET is_cancelled = true
WHERE reference_id = '437d6ddb-2255-43e1-8b07-a4ed570efde9'
  AND is_cancelled = false;
-- Expected: 3 rows (1.4.3 CR, 1.4.46 DR, + 1 other)

-- 1b. Cancel duplicates: PR-0005 (reference 559cf83d)
UPDATE accounting_ledger_entries
SET is_cancelled = true
WHERE reference_id = '559cf83d-6f5b-41f7-851b-1910ab27def4'
  AND is_cancelled = false;
-- Expected: 3 rows (1.4.3 CR, 1.4.46 DR, + 1 other)

-- 1c. Cancel duplicates: PR-0006 (reference 43fb80a8)
UPDATE accounting_ledger_entries
SET is_cancelled = true
WHERE reference_id = '43fb80a8-2213-48ea-ba73-e399569ca8a6'
  AND is_cancelled = false;
-- Expected: 3 rows (1.4.3 CR, 1.4.46 DR, + 1 other)

-- Verify: check that cancelled entries are balanced (DR = CR)
SELECT 'Cancelled duplicates check' as step,
  SUM(debit) as cancelled_dr, SUM(credit) as cancelled_cr,
  SUM(debit) - SUM(credit) as net
FROM accounting_ledger_entries
WHERE reference_id IN (
  '437d6ddb-2255-43e1-8b07-a4ed570efde9',
  '559cf83d-6f5b-41f7-851b-1910ab27def4',
  '43fb80a8-2213-48ea-ba73-e399569ca8a6'
)
AND is_cancelled = true
AND created_at >= '2026-04-05';

-- =============================================================
-- STEP 2: Recalculate ALL account balances from active ledger
-- Using computeImpact convention:
--   ASSET/EXPENSE: balance = SUM(debit) - SUM(credit)
--   LIABILITY/EQUITY/REVENUE: balance = SUM(credit) - SUM(debit)
-- =============================================================

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

-- =============================================================
-- STEP 3: Verification
-- =============================================================

-- 3a. Check all previously mismatched accounts
SELECT a."accountNumber", a.name, a.balance as new_balance
FROM accounts a
WHERE a."accountNumber" IN ('1.4.0','1.4.3','1.4.20','1.4.43','1.4.46','1.4.58','3.1','4.1','4.2','5.1')
ORDER BY a."accountNumber";

-- 3b. Global ledger balance check
SELECT 'Ledger balance check' as step,
  SUM(CASE WHEN is_cancelled = false THEN debit ELSE 0 END) as total_dr,
  SUM(CASE WHEN is_cancelled = false THEN credit ELSE 0 END) as total_cr,
  SUM(CASE WHEN is_cancelled = false THEN debit ELSE 0 END) -
  SUM(CASE WHEN is_cancelled = false THEN credit ELSE 0 END) as net
FROM accounting_ledger_entries;

-- 3c. Trial Balance (should be 0 when balanced)
SELECT 'Trial Balance check' as step,
  SUM(CASE
    WHEN a."rootType" IN ('ASSET','EXPENSE') THEN a.balance
    ELSE -a.balance
  END) as debit_minus_credit
FROM accounts a
WHERE a."isGroup" = false;

-- 3d. Check no more mismatches > 1 rupiah
SELECT 'Remaining mismatches' as step, COUNT(*) as count
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
) mismatches;

COMMIT;
