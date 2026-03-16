import { describe, it, expect, vi } from 'vitest';
import { generateDocumentNumber } from '../documentNumber';

/**
 * Factory: builds a minimal Prisma transaction mock with configurable counts.
 */
function makeTx(counts: { si?: number; pi?: number; pay?: number; jv?: number } = {}) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    salesInvoice: { count: vi.fn().mockResolvedValue(counts.si ?? 0) },
    purchaseInvoice: { count: vi.fn().mockResolvedValue(counts.pi ?? 0) },
    payment: { count: vi.fn().mockResolvedValue(counts.pay ?? 0) },
    journalEntry: { count: vi.fn().mockResolvedValue(counts.jv ?? 0) },
  } as any;
}

const FISCAL_YEAR_ID = 'fy-2026';
const MARCH_2026 = new Date('2026-03-15');

describe('generateDocumentNumber — format', () => {
  it('generates SI-202603-0001 for first sales invoice in March 2026', async () => {
    const tx = makeTx({ si: 0 });
    const num = await generateDocumentNumber(tx, 'SI', MARCH_2026, FISCAL_YEAR_ID);
    expect(num).toBe('SI-202603-0001');
  });

  it('generates PI-202603-0003 when 2 purchase invoices already exist', async () => {
    const tx = makeTx({ pi: 2 });
    const num = await generateDocumentNumber(tx, 'PI', MARCH_2026, FISCAL_YEAR_ID);
    expect(num).toBe('PI-202603-0003');
  });

  it('generates PAY-202603-0010 when 9 payments already exist', async () => {
    const tx = makeTx({ pay: 9 });
    const num = await generateDocumentNumber(tx, 'PAY', MARCH_2026, FISCAL_YEAR_ID);
    expect(num).toBe('PAY-202603-0010');
  });

  it('generates JV-202601-0001 for first journal entry in January', async () => {
    const tx = makeTx({ jv: 0 });
    const jan = new Date('2026-01-05');
    const num = await generateDocumentNumber(tx, 'JV', jan, FISCAL_YEAR_ID);
    expect(num).toBe('JV-202601-0001');
  });

  it('pads sequence to 4 digits', async () => {
    const tx = makeTx({ si: 9 });
    const num = await generateDocumentNumber(tx, 'SI', MARCH_2026, FISCAL_YEAR_ID);
    expect(num).toBe('SI-202603-0010');
  });

  it('handles sequence ≥ 1000 without truncation', async () => {
    const tx = makeTx({ jv: 999 });
    const num = await generateDocumentNumber(tx, 'JV', MARCH_2026, FISCAL_YEAR_ID);
    expect(num).toBe('JV-202603-1000');
  });
});

describe('generateDocumentNumber — model routing', () => {
  it('queries salesInvoice.count for prefix SI', async () => {
    const tx = makeTx();
    await generateDocumentNumber(tx, 'SI', MARCH_2026, FISCAL_YEAR_ID);
    expect(tx.salesInvoice.count).toHaveBeenCalledWith({ where: { fiscalYearId: FISCAL_YEAR_ID } });
    expect(tx.purchaseInvoice.count).not.toHaveBeenCalled();
  });

  it('queries purchaseInvoice.count for prefix PI', async () => {
    const tx = makeTx();
    await generateDocumentNumber(tx, 'PI', MARCH_2026, FISCAL_YEAR_ID);
    expect(tx.purchaseInvoice.count).toHaveBeenCalledWith({ where: { fiscalYearId: FISCAL_YEAR_ID } });
    expect(tx.salesInvoice.count).not.toHaveBeenCalled();
  });

  it('queries payment.count for prefix PAY', async () => {
    const tx = makeTx();
    await generateDocumentNumber(tx, 'PAY', MARCH_2026, FISCAL_YEAR_ID);
    expect(tx.payment.count).toHaveBeenCalledWith({ where: { fiscalYearId: FISCAL_YEAR_ID } });
  });

  it('queries journalEntry.count for prefix JV', async () => {
    const tx = makeTx();
    await generateDocumentNumber(tx, 'JV', MARCH_2026, FISCAL_YEAR_ID);
    expect(tx.journalEntry.count).toHaveBeenCalledWith({ where: { fiscalYearId: FISCAL_YEAR_ID } });
  });

  it('acquires advisory lock before counting', async () => {
    const tx = makeTx();
    await generateDocumentNumber(tx, 'SI', MARCH_2026, FISCAL_YEAR_ID);
    // $executeRaw must be called (advisory lock) before the count query
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    const lockCallOrder = tx.$executeRaw.mock.invocationCallOrder[0];
    const countCallOrder = tx.salesInvoice.count.mock.invocationCallOrder[0];
    expect(lockCallOrder).toBeLessThan(countCallOrder);
  });
});
