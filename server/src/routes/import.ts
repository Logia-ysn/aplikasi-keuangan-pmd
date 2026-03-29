import { Router } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
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

// ─── Helper: Sanitize cell value to prevent formula injection ────────────────
function sanitizeCellValue(value: unknown): string {
  const str = String(value ?? '').trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

// ─── Helper: Parse uploaded file to array of objects ─────────────────────────
async function parseFile(buffer: Buffer, filename: string): Promise<Record<string, string>[]> {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));

  if (ext === '.csv') {
    return parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
  }

  // Excel (.xlsx / .xls)
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('File Excel kosong.');

  const headers: string[] = [];
  const rows: Record<string, string>[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // Ensure headers array is properly indexed by column number
        while (headers.length < colNumber) {
          headers.push('');
        }
        headers[colNumber - 1] = String(cell.value ?? '').trim();
      });
    } else {
      const rowData: Record<string, string> = {};
      // Initialize all headers with empty string (equivalent to defval: '')
      for (const h of headers) {
        rowData[h] = '';
      }
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header !== undefined) {
          rowData[header] = String(cell.value ?? '');
        }
      });
      rows.push(rowData);
    }
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
      const rows = await parseFile(req.file.buffer, req.file.originalname);
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
          name: sanitizeCellValue(r.name),
          partyType: partyType as 'Customer' | 'Supplier' | 'Both',
          phone: r.phone?.trim() ? sanitizeCellValue(r.phone) : undefined,
          email: r.email?.trim() ? sanitizeCellValue(r.email) : undefined,
          address: r.address?.trim() ? sanitizeCellValue(r.address) : undefined,
          taxId: (r.taxId || r.tax_id || '').trim() ? sanitizeCellValue(r.taxId || r.tax_id) : undefined,
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
      const rows = await parseFile(req.file.buffer, req.file.originalname);
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

        validRows.push({
          accountNumber,
          name: sanitizeCellValue(name),
          rootType,
          accountType,
          parentNumber,
          isGroup,
        });
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
      const rows = await parseFile(req.file.buffer, req.file.originalname);
      const isPreview = req.query.preview === 'true';
      const errors: Array<{ row: number; message: string }> = [];

      // Group rows by date+narration into journal entries
      const groups = new Map<string, Array<{ accountNumber: string; debit: number; credit: number; description?: string; rowNum: number }>>();

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;

        const date = (r.date || '').trim();
        const narration = sanitizeCellValue(r.narration);
        const accountNumber = (r.accountNumber || r.account_number || '').trim();
        const debit = parseFloat(r.debit || '0') || 0;
        const credit = parseFloat(r.credit || '0') || 0;
        const description = sanitizeCellValue(r.description);

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
        const separatorIndex = key.indexOf('||');
        const date = key.substring(0, separatorIndex);
        const narration = key.substring(separatorIndex + 2);
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

// ─── POST /api/import/inventory ──────────────────────────────────────────────
router.post(
  '/inventory',
  roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']),
  upload.single('file'),
  async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'File wajib diunggah.' });

    try {
      const rows = await parseFile(req.file.buffer, req.file.originalname);
      const isPreview = req.query.preview === 'true';
      const errors: Array<{ row: number; message: string }> = [];
      const validRows: Array<{
        code: string;
        name: string;
        unit: string;
        category?: string;
        description?: string;
        minimumStock?: number;
      }> = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;

        const code = (r.code || '').trim();
        const name = (r.name || '').trim();
        const unit = (r.unit || '').trim();

        if (!code) {
          errors.push({ row: rowNum, message: 'Kolom "code" wajib diisi.' });
          continue;
        }
        if (!name) {
          errors.push({ row: rowNum, message: 'Kolom "name" wajib diisi.' });
          continue;
        }
        if (!unit) {
          errors.push({ row: rowNum, message: 'Kolom "unit" wajib diisi.' });
          continue;
        }

        const minStockStr = (r.minimumStock || r.minimum_stock || '').trim();
        const minimumStock = minStockStr ? parseFloat(minStockStr) : undefined;
        if (minimumStock !== undefined && isNaN(minimumStock)) {
          errors.push({ row: rowNum, message: `minimumStock "${minStockStr}" bukan angka valid.` });
          continue;
        }

        validRows.push({
          code: sanitizeCellValue(code),
          name: sanitizeCellValue(name),
          unit: sanitizeCellValue(unit),
          category: r.category?.trim() ? sanitizeCellValue(r.category) : undefined,
          description: r.description?.trim() ? sanitizeCellValue(r.description) : undefined,
          minimumStock,
        });
      }

      if (isPreview) {
        return res.json({ data: validRows, errors, total: rows.length });
      }

      let success = 0;
      for (const row of validRows) {
        try {
          await prisma.inventoryItem.create({ data: row });
          success++;
        } catch (err: any) {
          const msg = err.code === 'P2002'
            ? `Kode "${row.code}" sudah digunakan.`
            : err.message;
          errors.push({ row: 0, message: `Gagal insert "${row.code}": ${msg}` });
        }
      }

      return res.json({ success, failed: rows.length - success, errors });
    } catch (error: any) {
      logger.error({ error }, 'POST /import/inventory error');
      return res.status(400).json({ error: error.message || 'Gagal memproses file.' });
    }
  }
);

// ─── GET /api/import/template/:type ─────────────────────────────────────────
// Download current data as editable Excel template for re-upload
router.get(
  '/template/:type',
  roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']),
  async (req: AuthRequest, res) => {
    const { type } = req.params;

    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Data');

      if (type === 'coa') {
        sheet.columns = [
          { header: 'accountNumber', key: 'accountNumber', width: 15 },
          { header: 'name', key: 'name', width: 35 },
          { header: 'rootType', key: 'rootType', width: 12 },
          { header: 'accountType', key: 'accountType', width: 12 },
          { header: 'parentNumber', key: 'parentNumber', width: 15 },
          { header: 'isGroup', key: 'isGroup', width: 10 },
        ];

        const accounts = await prisma.account.findMany({
          include: { parent: { select: { accountNumber: true } } },
          orderBy: { accountNumber: 'asc' },
        });

        for (const acc of accounts) {
          sheet.addRow({
            accountNumber: acc.accountNumber,
            name: acc.name,
            rootType: acc.rootType,
            accountType: acc.accountType,
            parentNumber: acc.parent?.accountNumber ?? '',
            isGroup: acc.isGroup ? 'true' : 'false',
          });
        }
      } else if (type === 'parties') {
        sheet.columns = [
          { header: 'name', key: 'name', width: 30 },
          { header: 'partyType', key: 'partyType', width: 12 },
          { header: 'phone', key: 'phone', width: 18 },
          { header: 'email', key: 'email', width: 25 },
          { header: 'address', key: 'address', width: 40 },
          { header: 'taxId', key: 'taxId', width: 20 },
        ];

        const parties = await prisma.party.findMany({
          where: { isActive: true, isDummy: false },
          orderBy: { name: 'asc' },
        });

        for (const p of parties) {
          sheet.addRow({
            name: p.name,
            partyType: p.partyType,
            phone: p.phone ?? '',
            email: p.email ?? '',
            address: p.address ?? '',
            taxId: p.taxId ?? '',
          });
        }
      } else if (type === 'inventory') {
        sheet.columns = [
          { header: 'code', key: 'code', width: 15 },
          { header: 'name', key: 'name', width: 30 },
          { header: 'unit', key: 'unit', width: 10 },
          { header: 'category', key: 'category', width: 20 },
          { header: 'description', key: 'description', width: 35 },
          { header: 'minimumStock', key: 'minimumStock', width: 15 },
        ];

        const items = await prisma.inventoryItem.findMany({
          where: { isActive: true, isDummy: false },
          orderBy: { code: 'asc' },
        });

        for (const item of items) {
          sheet.addRow({
            code: item.code,
            name: item.name,
            unit: item.unit,
            category: item.category ?? '',
            description: item.description ?? '',
            minimumStock: Number(item.minimumStock),
          });
        }
      } else {
        return res.status(400).json({ error: `Tipe "${type}" tidak didukung. Gunakan: coa, parties, inventory.` });
      }

      // Style header row
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F0FE' },
      };

      const safeName = type.replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="template_${safeName}.xlsx"`);

      const buffer = await workbook.xlsx.writeBuffer();
      return res.send(Buffer.from(buffer as ArrayBuffer));
    } catch (error: any) {
      logger.error({ error }, `GET /import/template/${type} error`);
      return res.status(500).json({ error: 'Gagal membuat template.' });
    }
  }
);

export default router;
