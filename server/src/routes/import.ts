import { Router } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateBalancesForItems } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { logger } from '../lib/logger';

const router = Router();

// Multer config: memory storage, max 5MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Format file tidak didukung. Gunakan CSV atau Excel (.xlsx/.xls).'));
    }
  },
});

// ─── Helper: Parse uploaded file to array of objects ─────────────────────────
function parseFile(buffer: Buffer, filename: string): Record<string, string>[] {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));

  if (ext === '.csv') {
    return parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
  }

  // Excel
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error('File Excel kosong.');
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[firstSheet], {
    defval: '',
    raw: false,
  });
  return rows;
}

// ─── POST /api/import/parties ────────────────────────────────────────────────
router.post(
  '/parties',
  roleMiddleware(['Admin', 'Accountant']),
  upload.single('file'),
  async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'File wajib diunggah.' });

    try {
      const rows = parseFile(req.file.buffer, req.file.originalname);
      const isPreview = req.query.preview === 'true';
      const errors: Array<{ row: number; message: string }> = [];
      const validRows: Array<{
        name: string;
        partyType: 'Customer' | 'Supplier' | 'Both';
        phone?: string;
        email?: string;
        address?: string;
        taxId?: string;
      }> = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2; // 1-indexed, +1 for header

        if (!r.name?.trim()) {
          errors.push({ row: rowNum, message: 'Kolom "name" wajib diisi.' });
          continue;
        }

        const partyType = (r.partyType || r.party_type || '').trim();
        if (!['Customer', 'Supplier', 'Both'].includes(partyType)) {
          errors.push({ row: rowNum, message: `partyType "${partyType}" tidak valid. Gunakan: Customer, Supplier, atau Both.` });
          continue;
        }

        validRows.push({
          name: r.name.trim(),
          partyType: partyType as 'Customer' | 'Supplier' | 'Both',
          phone: r.phone?.trim() || undefined,
          email: r.email?.trim() || undefined,
          address: r.address?.trim() || undefined,
          taxId: (r.taxId || r.tax_id || '').trim() || undefined,
        });
      }

      if (isPreview) {
        return res.json({ data: validRows, errors, total: rows.length });
      }

      // Insert valid rows
      let success = 0;
      for (const row of validRows) {
        try {
          await prisma.party.create({ data: row });
          success++;
        } catch (err: any) {
          errors.push({ row: 0, message: `Gagal insert "${row.name}": ${err.message}` });
        }
      }

      return res.json({ success, failed: rows.length - success, errors });
    } catch (error: any) {
      logger.error({ error }, 'POST /import/parties error');
      return res.status(400).json({ error: error.message || 'Gagal memproses file.' });
    }
  }
);

// ─── POST /api/import/coa ────────────────────────────────────────────────────
router.post(
  '/coa',
  roleMiddleware(['Admin', 'Accountant']),
  upload.single('file'),
  async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'File wajib diunggah.' });

    try {
      const rows = parseFile(req.file.buffer, req.file.originalname);
      const isPreview = req.query.preview === 'true';
      const errors: Array<{ row: number; message: string }> = [];
      const validTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

      interface COARow {
        accountNumber: string;
        name: string;
        rootType: string;
        accountType: string;
        parentNumber?: string;
        isGroup: boolean;
      }

      const validRows: COARow[] = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;

        const accountNumber = (r.accountNumber || r.account_number || '').trim();
        const name = (r.name || '').trim();
        const rootType = (r.rootType || r.root_type || '').trim().toUpperCase();
        const accountType = (r.accountType || r.account_type || rootType).trim().toUpperCase();
        const parentNumber = (r.parentNumber || r.parent_number || '').trim();
        const isGroupStr = (r.isGroup || r.is_group || '').toString().trim().toLowerCase();
        const isGroup = ['true', '1', 'yes', 'ya'].includes(isGroupStr);

        if (!accountNumber) {
          errors.push({ row: rowNum, message: 'Kolom "accountNumber" wajib diisi.' });
          continue;
        }
        if (!name) {
          errors.push({ row: rowNum, message: 'Kolom "name" wajib diisi.' });
          continue;
        }
        if (!validTypes.includes(rootType)) {
          errors.push({ row: rowNum, message: `rootType "${rootType}" tidak valid.` });
          continue;
        }

        validRows.push({ accountNumber, name, rootType, accountType, parentNumber, isGroup });
      }

      if (isPreview) {
        return res.json({ data: validRows, errors, total: rows.length });
      }

      // Insert valid rows — resolve parent by accountNumber
      let success = 0;
      for (const row of validRows) {
        try {
          let parentId: string | null = null;
          if (row.parentNumber) {
            const parent = await prisma.account.findUnique({
              where: { accountNumber: row.parentNumber },
              select: { id: true },
            });
            if (parent) parentId = parent.id;
          }

          await prisma.account.create({
            data: {
              accountNumber: row.accountNumber,
              name: row.name,
              rootType: row.rootType as any,
              accountType: row.accountType as any,
              parentId,
              isGroup: row.isGroup,
            },
          });
          success++;
        } catch (err: any) {
          errors.push({ row: 0, message: `Gagal insert akun "${row.accountNumber}": ${err.message}` });
        }
      }

      return res.json({ success, failed: rows.length - success, errors });
    } catch (error: any) {
      logger.error({ error }, 'POST /import/coa error');
      return res.status(400).json({ error: error.message || 'Gagal memproses file.' });
    }
  }
);

// ─── POST /api/import/journals ───────────────────────────────────────────────
router.post(
  '/journals',
  roleMiddleware(['Admin', 'Accountant']),
  upload.single('file'),
  async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'File wajib diunggah.' });

    try {
      const rows = parseFile(req.file.buffer, req.file.originalname);
      const isPreview = req.query.preview === 'true';
      const errors: Array<{ row: number; message: string }> = [];

      // Group rows by date+narration into journal entries
      const groups = new Map<string, Array<{ accountNumber: string; debit: number; credit: number; description?: string; rowNum: number }>>();

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;

        const date = (r.date || '').trim();
        const narration = (r.narration || '').trim();
        const accountNumber = (r.accountNumber || r.account_number || '').trim();
        const debit = parseFloat(r.debit || '0') || 0;
        const credit = parseFloat(r.credit || '0') || 0;
        const description = (r.description || '').trim();

        if (!date) { errors.push({ row: rowNum, message: 'Kolom "date" wajib diisi.' }); continue; }
        if (!narration) { errors.push({ row: rowNum, message: 'Kolom "narration" wajib diisi.' }); continue; }
        if (!accountNumber) { errors.push({ row: rowNum, message: 'Kolom "accountNumber" wajib diisi.' }); continue; }
        if (debit === 0 && credit === 0) { errors.push({ row: rowNum, message: 'Debit atau credit harus diisi.' }); continue; }

        const key = `${date}||${narration}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ accountNumber, debit, credit, description, rowNum });
      }

      // Validate balance per group
      const validGroups: Array<{ date: string; narration: string; items: typeof groups extends Map<string, infer V> ? V : never }> = [];
      for (const [key, items] of groups) {
        const [date, narration] = key.split('||');
        const totalDebit = items.reduce((s, i) => s + i.debit, 0);
        const totalCredit = items.reduce((s, i) => s + i.credit, 0);

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          for (const item of items) {
            errors.push({ row: item.rowNum, message: `Jurnal "${narration}" tidak seimbang: Debit=${totalDebit}, Credit=${totalCredit}` });
          }
          continue;
        }

        validGroups.push({ date, narration, items });
      }

      if (isPreview) {
        return res.json({
          data: validGroups.map((g) => ({
            date: g.date,
            narration: g.narration,
            items: g.items.map((i) => ({ accountNumber: i.accountNumber, debit: i.debit, credit: i.credit, description: i.description })),
          })),
          errors,
          total: rows.length,
          journalCount: validGroups.length,
        });
      }

      // Create journal entries
      let success = 0;
      const userId = req.user!.userId;

      for (const group of validGroups) {
        try {
          await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const parsedDate = new Date(group.date);
            if (isNaN(parsedDate.getTime())) throw new Error(`Tanggal "${group.date}" tidak valid.`);

            const fiscalYear = await getOpenFiscalYear(tx, parsedDate);
            const entryNumber = await generateDocumentNumber(tx, 'JV', parsedDate, fiscalYear.id);

            // Resolve account numbers to IDs
            const itemsWithIds = [];
            for (const item of group.items) {
              const account = await tx.account.findUnique({
                where: { accountNumber: item.accountNumber },
                select: { id: true },
              });
              if (!account) throw new Error(`Akun "${item.accountNumber}" tidak ditemukan.`);
              itemsWithIds.push({
                accountId: account.id,
                debit: item.debit,
                credit: item.credit,
                description: item.description || group.narration,
              });
            }

            const journalEntry = await tx.journalEntry.create({
              data: {
                entryNumber,
                date: parsedDate,
                narration: group.narration,
                status: 'Submitted',
                fiscalYearId: fiscalYear.id,
                createdBy: userId,
                submittedAt: new Date(),
                items: { create: itemsWithIds },
              },
              include: { items: true },
            });

            // Post to immutable ledger
            await tx.accountingLedgerEntry.createMany({
              data: journalEntry.items.map((item) => ({
                date: parsedDate,
                accountId: item.accountId,
                partyId: item.partyId,
                debit: item.debit,
                credit: item.credit,
                referenceType: 'JournalEntry',
                referenceId: journalEntry.id,
                description: item.description || group.narration,
                fiscalYearId: fiscalYear.id,
              })),
            });

            await updateBalancesForItems(
              tx,
              journalEntry.items.map((i) => ({
                accountId: i.accountId,
                debit: Number(i.debit),
                credit: Number(i.credit),
              }))
            );
          }, { timeout: 15000 });

          success++;
        } catch (err: any) {
          errors.push({ row: 0, message: `Gagal import jurnal "${group.narration}": ${err.message}` });
        }
      }

      return res.json({
        success,
        failed: validGroups.length - success,
        errors,
        totalJournals: validGroups.length,
      });
    } catch (error: any) {
      logger.error({ error }, 'POST /import/journals error');
      return res.status(400).json({ error: error.message || 'Gagal memproses file.' });
    }
  }
);

export default router;
