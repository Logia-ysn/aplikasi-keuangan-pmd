import { Router } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateAccountBalance, updateBalancesForItems } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { systemAccounts } from '../services/systemAccounts';
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
        openingBalance: number;
        depositBalance: number;
        customerDepositBalance: number;
      }> = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;

        if (!r.name?.trim()) {
          errors.push({ row: rowNum, message: 'Kolom "name" wajib diisi.' });
          continue;
        }

        const partyType = (r.partyType || r.party_type || '').trim();
        if (!['Customer', 'Supplier', 'Both'].includes(partyType)) {
          errors.push({ row: rowNum, message: `partyType "${partyType}" tidak valid. Gunakan: Customer, Supplier, atau Both.` });
          continue;
        }

        const openingBalanceStr = (r.openingBalance || r.opening_balance || r.outstandingAmount || r.outstanding_amount || r.saldoAwal || r.saldo_awal || r.piutang || r.hutang || r.balance || '').toString().trim();
        const openingBalance = openingBalanceStr ? parseFloat(openingBalanceStr) : 0;
        if (isNaN(openingBalance)) {
          errors.push({ row: rowNum, message: `openingBalance "${openingBalanceStr}" bukan angka valid.` });
          continue;
        }

        const depositBalanceStr = (r.depositBalance || r.deposit_balance || r.saldoDeposit || r.saldo_deposit || r.uangMuka || r.uang_muka || '').trim();
        const depositBalance = depositBalanceStr ? parseFloat(depositBalanceStr) : 0;
        if (isNaN(depositBalance)) {
          errors.push({ row: rowNum, message: `depositBalance "${depositBalanceStr}" bukan angka valid.` });
          continue;
        }

        const custDepositStr = (r.customerDepositBalance || r.customer_deposit_balance || r.depositPelanggan || r.deposit_pelanggan || '').trim();
        const customerDepositBalance = custDepositStr ? parseFloat(custDepositStr) : 0;
        if (isNaN(customerDepositBalance)) {
          errors.push({ row: rowNum, message: `customerDepositBalance "${custDepositStr}" bukan angka valid.` });
          continue;
        }

        validRows.push({
          name: sanitizeCellValue(r.name),
          partyType: partyType as 'Customer' | 'Supplier' | 'Both',
          phone: r.phone?.trim() ? sanitizeCellValue(r.phone) : undefined,
          email: r.email?.trim() ? sanitizeCellValue(r.email) : undefined,
          address: r.address?.trim() ? sanitizeCellValue(r.address) : undefined,
          taxId: (r.taxId || r.tax_id || '').trim() ? sanitizeCellValue(r.taxId || r.tax_id) : undefined,
          openingBalance,
          depositBalance,
          customerDepositBalance,
        });
      }

      if (isPreview) {
        return res.json({ data: validRows, errors, total: rows.length });
      }

      // Insert valid rows
      let success = 0;
      for (const row of validRows) {
        try {
          const { openingBalance, depositBalance: rawDepositBalance, customerDepositBalance: rawCustomerDepositBalance, ...partyData } = row;

          // If customer has depositBalance but no customerDepositBalance, treat it as customer deposit
          const isCustomerType = row.partyType === 'Customer';
          const depositBalance = isCustomerType ? 0 : rawDepositBalance;
          const customerDepositBalance = isCustomerType
            ? (rawCustomerDepositBalance || rawDepositBalance)
            : rawCustomerDepositBalance;

          // Find existing party by name or create new
          let party = await prisma.party.findFirst({
            where: { name: row.name, partyType: row.partyType },
          });
          const partyFields = {
            ...partyData,
            outstandingAmount: openingBalance,
            depositBalance,
            customerDepositBalance,
          };
          if (party) {
            party = await prisma.party.update({
              where: { id: party.id },
              data: partyFields,
            });
          } else {
            party = await prisma.party.create({
              data: partyFields,
            });
          }

          // Create opening balance journals if needed
          const needsJournal = openingBalance > 0 || depositBalance > 0 || customerDepositBalance > 0;
          if (needsJournal) {
            const isCustomer = row.partyType === 'Customer' || row.partyType === 'Both';
            const isSupplier = row.partyType === 'Supplier' || row.partyType === 'Both';
            const arAccount = await systemAccounts.getAccount('AR');
            const apAccount = await systemAccounts.getAccount('AP');
            const vendorDepositAccount = await systemAccounts.getAccount('VENDOR_DEPOSIT');
            const customerDepositAccount = await systemAccounts.getAccount('CUSTOMER_DEPOSIT');
            const openingEquityAccount = await systemAccounts.getAccount('OPENING_EQUITY');

            {
              const now = new Date();
              const fiscalYear = await getOpenFiscalYear(prisma as any, now);

              // 1) AR/AP opening balance journal
              if (openingBalance > 0) {
                const receivableAccount = isCustomer ? arAccount : apAccount;
                {
                  const jvNumber = await generateDocumentNumber(prisma as any, 'JV', now, fiscalYear.id);
                  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                    const journal = await tx.journalEntry.create({
                      data: {
                        entryNumber: jvNumber,
                        date: now,
                        narration: `Saldo awal ${isCustomer ? 'piutang' : 'hutang'}: ${row.name}`,
                        status: 'Submitted',
                        fiscalYearId: fiscalYear.id,
                        createdBy: req.user!.userId,
                        submittedAt: now,
                        items: {
                          create: isCustomer
                            ? [
                                { accountId: receivableAccount.id, partyId: party.id, debit: openingBalance, credit: 0, description: `Saldo awal piutang: ${row.name}` },
                                { accountId: openingEquityAccount.id, debit: 0, credit: openingBalance, description: `Saldo awal piutang: ${row.name}` },
                              ]
                            : [
                                { accountId: openingEquityAccount.id, debit: openingBalance, credit: 0, description: `Saldo awal hutang: ${row.name}` },
                                { accountId: receivableAccount.id, partyId: party.id, debit: 0, credit: openingBalance, description: `Saldo awal hutang: ${row.name}` },
                              ],
                        },
                      },
                      include: { items: true },
                    });

                    await tx.accountingLedgerEntry.createMany({
                      data: journal.items.map((item) => ({
                        date: now,
                        accountId: item.accountId,
                        partyId: item.partyId,
                        debit: item.debit,
                        credit: item.credit,
                        referenceType: 'JournalEntry' as const,
                        referenceId: journal.id,
                        description: item.description || `Saldo awal: ${row.name}`,
                        fiscalYearId: fiscalYear.id,
                      })),
                    });

                    await updateBalancesForItems(
                      tx,
                      journal.items.map((i) => ({ accountId: i.accountId, debit: Number(i.debit), credit: Number(i.credit) }))
                    );
                  }, { timeout: 15000 });
                }
              }

              // 2) Vendor deposit: create Payment record + GL journal
              if (depositBalance > 0 && isSupplier) {
                await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                  const payNumber = await generateDocumentNumber(tx, 'PAY', now, fiscalYear.id);
                  const jvNumber = await generateDocumentNumber(tx, 'JV', now, fiscalYear.id);

                  // GL journal: DR Uang Muka Pembelian (1.3) / CR Ekuitas Saldo Awal
                  const journal = await tx.journalEntry.create({
                    data: {
                      entryNumber: jvNumber,
                      date: now,
                      narration: `Saldo awal uang muka vendor: ${row.name}`,
                      status: 'Submitted',
                      fiscalYearId: fiscalYear.id,
                      createdBy: req.user!.userId,
                      submittedAt: now,
                      items: {
                        create: [
                          { accountId: vendorDepositAccount.id, partyId: party.id, debit: depositBalance, credit: 0, description: `Saldo awal uang muka vendor: ${row.name}` },
                          { accountId: openingEquityAccount.id, debit: 0, credit: depositBalance, description: `Saldo awal uang muka vendor: ${row.name}` },
                        ],
                      },
                    },
                    include: { items: true },
                  });

                  // Payment record so it appears in vendor deposit module
                  await tx.payment.create({
                    data: {
                      paymentNumber: payNumber,
                      date: now,
                      paymentType: 'VendorDeposit',
                      partyId: party.id,
                      accountId: vendorDepositAccount.id,
                      amount: depositBalance,
                      status: 'Submitted',
                      notes: `Saldo awal uang muka vendor dari import: ${row.name}`,
                      createdBy: req.user!.userId,
                      journalEntryId: journal.id,
                      fiscalYearId: fiscalYear.id,
                      submittedAt: now,
                    },
                  });

                  await tx.accountingLedgerEntry.createMany({
                    data: journal.items.map((item) => ({
                      date: now,
                      accountId: item.accountId,
                      partyId: item.partyId,
                      debit: item.debit,
                      credit: item.credit,
                      referenceType: 'JournalEntry' as const,
                      referenceId: journal.id,
                      description: item.description || `Saldo awal uang muka vendor: ${row.name}`,
                      fiscalYearId: fiscalYear.id,
                    })),
                  });

                  await updateBalancesForItems(
                    tx,
                    journal.items.map((i) => ({ accountId: i.accountId, debit: Number(i.debit), credit: Number(i.credit) }))
                  );
                }, { timeout: 15000 });
              }

              // 3) Customer deposit: create Payment record + GL journal
              if (customerDepositBalance > 0 && isCustomer) {
                await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                  const payNumber = await generateDocumentNumber(tx, 'PAY', now, fiscalYear.id);
                  const jvNumber = await generateDocumentNumber(tx, 'JV', now, fiscalYear.id);

                  // GL journal: DR Ekuitas Saldo Awal / CR Uang Muka Pelanggan (2.1.2)
                  const journal = await tx.journalEntry.create({
                    data: {
                      entryNumber: jvNumber,
                      date: now,
                      narration: `Saldo awal uang muka pelanggan: ${row.name}`,
                      status: 'Submitted',
                      fiscalYearId: fiscalYear.id,
                      createdBy: req.user!.userId,
                      submittedAt: now,
                      items: {
                        create: [
                          { accountId: openingEquityAccount.id, debit: customerDepositBalance, credit: 0, description: `Saldo awal uang muka pelanggan: ${row.name}` },
                          { accountId: customerDepositAccount.id, partyId: party.id, debit: 0, credit: customerDepositBalance, description: `Saldo awal uang muka pelanggan: ${row.name}` },
                        ],
                      },
                    },
                    include: { items: true },
                  });

                  // Payment record so it appears in customer deposit module
                  await tx.payment.create({
                    data: {
                      paymentNumber: payNumber,
                      date: now,
                      paymentType: 'CustomerDeposit',
                      partyId: party.id,
                      accountId: customerDepositAccount.id,
                      amount: customerDepositBalance,
                      status: 'Submitted',
                      notes: `Saldo awal uang muka pelanggan dari import: ${row.name}`,
                      createdBy: req.user!.userId,
                      journalEntryId: journal.id,
                      fiscalYearId: fiscalYear.id,
                      submittedAt: now,
                    },
                  });

                  await tx.accountingLedgerEntry.createMany({
                    data: journal.items.map((item) => ({
                      date: now,
                      accountId: item.accountId,
                      partyId: item.partyId,
                      debit: item.debit,
                      credit: item.credit,
                      referenceType: 'JournalEntry' as const,
                      referenceId: journal.id,
                      description: item.description || `Saldo awal uang muka pelanggan: ${row.name}`,
                      fiscalYearId: fiscalYear.id,
                    })),
                  });

                  await updateBalancesForItems(
                    tx,
                    journal.items.map((i) => ({ accountId: i.accountId, debit: Number(i.debit), credit: Number(i.credit) }))
                  );
                }, { timeout: 15000 });
              }
            }
          }

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
        openingBalance: number;
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
        const openingBalanceStr = (r.openingBalance || r.opening_balance || r.outstandingAmount || r.outstanding_amount || r.saldoAwal || r.saldo_awal || r.piutang || r.hutang || r.balance || '').toString().trim();
        const openingBalance = openingBalanceStr ? parseFloat(openingBalanceStr) : 0;

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
        if (isNaN(openingBalance)) {
          errors.push({ row: rowNum, message: `openingBalance "${openingBalanceStr}" bukan angka valid.` });
          continue;
        }

        validRows.push({
          accountNumber,
          name: sanitizeCellValue(name),
          rootType,
          accountType,
          parentNumber,
          isGroup,
          openingBalance,
        });
      }

      // Auto-detect isGroup: any account that is a parent of another should be a group
      const allNumbers = new Set(validRows.map((r) => r.accountNumber));
      for (const row of validRows) {
        const parts = row.accountNumber.split('.');
        // Mark all ancestor numbers as groups
        for (let depth = 1; depth < parts.length; depth++) {
          const ancestor = parts.slice(0, depth).join('.');
          const ancestorRow = validRows.find((r) => r.accountNumber === ancestor);
          if (ancestorRow) ancestorRow.isGroup = true;
        }
      }

      // Sort by account number depth so parents are inserted before children
      validRows.sort((a, b) => {
        const depthA = a.accountNumber.split('.').length;
        const depthB = b.accountNumber.split('.').length;
        if (depthA !== depthB) return depthA - depthB;
        return a.accountNumber.localeCompare(b.accountNumber, undefined, { numeric: true });
      });

      if (isPreview) {
        return res.json({ data: validRows, errors, total: rows.length });
      }

      // Insert valid rows — resolve parent by accountNumber
      let success = 0;
      for (const row of validRows) {
        try {
          // Auto-derive parentNumber from accountNumber if not provided
          // e.g. "1.4.5" → parent "1.4", "1.4" → parent "1", "1" → no parent
          let effectiveParentNumber = row.parentNumber;
          if (!effectiveParentNumber) {
            const parts = row.accountNumber.split('.');
            if (parts.length > 1) {
              effectiveParentNumber = parts.slice(0, -1).join('.');
            }
          }

          let parentId: string | null = null;
          if (effectiveParentNumber) {
            const parent = await prisma.account.findUnique({
              where: { accountNumber: effectiveParentNumber },
              select: { id: true },
            });
            if (parent) parentId = parent.id;
          }

          const upsertData = {
            name: row.name,
            rootType: row.rootType as any,
            accountType: row.accountType as any,
            parentId,
            isGroup: row.isGroup,
          };

          const account = await prisma.account.upsert({
            where: { accountNumber: row.accountNumber },
            update: upsertData,
            create: { accountNumber: row.accountNumber, ...upsertData },
          });

          // Create opening balance GL journal for non-group accounts with balance
          if (row.openingBalance !== 0 && !row.isGroup) {
            const openingEquity = await systemAccounts.getAccount('OPENING_EQUITY');
            if (account.id !== openingEquity.id) {
              const now = new Date();
              const fiscalYear = await getOpenFiscalYear(prisma as any, now);
              const jvNumber = await generateDocumentNumber(prisma as any, 'JV', now, fiscalYear.id);
              const absAmount = Math.abs(row.openingBalance);

              // ASSET/EXPENSE normal balance = debit, LIABILITY/EQUITY/REVENUE normal balance = credit
              const isDebitNormal = ['ASSET', 'EXPENSE'].includes(row.rootType);
              const isPositive = row.openingBalance > 0;

              // Positive balance on debit-normal account → DR account / CR retained
              // Positive balance on credit-normal account → CR account / DR retained
              const accountDebit = (isDebitNormal === isPositive) ? absAmount : 0;
              const accountCredit = (isDebitNormal === isPositive) ? 0 : absAmount;

              await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                const journal = await tx.journalEntry.create({
                  data: {
                    entryNumber: jvNumber,
                    date: now,
                    narration: `Saldo awal akun: ${row.accountNumber} - ${row.name}`,
                    status: 'Submitted',
                    fiscalYearId: fiscalYear.id,
                    createdBy: req.user!.userId,
                    submittedAt: now,
                    items: {
                      create: [
                        { accountId: account.id, debit: accountDebit, credit: accountCredit, description: `Saldo awal: ${row.accountNumber} - ${row.name}` },
                        { accountId: openingEquity.id, debit: accountCredit, credit: accountDebit, description: `Saldo awal: ${row.accountNumber} - ${row.name}` },
                      ],
                    },
                  },
                  include: { items: true },
                });

                await tx.accountingLedgerEntry.createMany({
                  data: journal.items.map((item: any) => ({
                    date: now,
                    accountId: item.accountId,
                    debit: item.debit,
                    credit: item.credit,
                    referenceType: 'JournalEntry' as const,
                    referenceId: journal.id,
                    description: item.description || `Saldo awal: ${row.accountNumber}`,
                    fiscalYearId: fiscalYear.id,
                  })),
                });

                await updateBalancesForItems(
                  tx,
                  journal.items.map((i: any) => ({ accountId: i.accountId, debit: Number(i.debit), credit: Number(i.credit) }))
                );
              }, { timeout: 15000 });
            }
          }

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
        openingQty: number;
        openingPrice: number;
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

        const openingQtyStr = (r.openingQty || r.opening_qty || r.stokAwal || r.stok_awal || '').trim();
        const openingQty = openingQtyStr ? parseFloat(openingQtyStr) : 0;
        const openingPriceStr = (r.openingPrice || r.opening_price || r.hargaAwal || r.harga_awal || '').trim();
        const openingPrice = openingPriceStr ? parseFloat(openingPriceStr) : 0;

        if (isNaN(openingQty)) {
          errors.push({ row: rowNum, message: `openingQty "${openingQtyStr}" bukan angka valid.` });
          continue;
        }
        if (isNaN(openingPrice)) {
          errors.push({ row: rowNum, message: `openingPrice "${openingPriceStr}" bukan angka valid.` });
          continue;
        }

        validRows.push({
          code: sanitizeCellValue(code),
          name: sanitizeCellValue(name),
          unit: sanitizeCellValue(unit),
          category: r.category?.trim() ? sanitizeCellValue(r.category) : undefined,
          description: r.description?.trim() ? sanitizeCellValue(r.description) : undefined,
          minimumStock,
          openingQty,
          openingPrice,
        });
      }

      if (isPreview) {
        return res.json({ data: validRows, errors, total: rows.length });
      }

      let success = 0;
      for (const row of validRows) {
        try {
          const { openingQty, openingPrice, ...itemData } = row;

          const item = await prisma.inventoryItem.upsert({
            where: { code: row.code },
            update: { name: itemData.name, unit: itemData.unit, category: itemData.category, description: itemData.description, minimumStock: itemData.minimumStock },
            create: itemData,
          });

          // Create opening stock movement if qty > 0
          if (openingQty > 0 && openingPrice > 0) {
            const totalValue = openingQty * openingPrice;

            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
              const now = new Date();
              const fiscalYear = await getOpenFiscalYear(tx, now);
              const mvNumber = await generateDocumentNumber(tx, 'SM', now, fiscalYear.id);

              await tx.stockMovement.create({
                data: {
                  movementNumber: mvNumber,
                  itemId: item.id,
                  movementType: 'In',
                  quantity: openingQty,
                  unitCost: openingPrice,
                  totalValue,
                  date: now,
                  referenceType: 'OpeningBalance',
                  notes: `Stok awal dari import: ${row.code} - ${row.name}`,
                  createdById: req.user!.userId,
                  fiscalYearId: fiscalYear.id,
                },
              });

              // GL: DR Inventory / CR Ekuitas Saldo Awal
              const invAccount = item.accountId
                ? await tx.account.findUnique({ where: { id: item.accountId } })
                : await systemAccounts.getAccount('INVENTORY');
              const openingEquity = await systemAccounts.getAccount('OPENING_EQUITY');

              if (invAccount) {
                const jvNumber = await generateDocumentNumber(tx, 'JV', now, fiscalYear.id);
                const journal = await tx.journalEntry.create({
                  data: {
                    entryNumber: jvNumber,
                    date: now,
                    narration: `Saldo awal stok: ${row.code} - ${row.name}`,
                    status: 'Submitted',
                    fiscalYearId: fiscalYear.id,
                    createdBy: req.user!.userId,
                    submittedAt: now,
                    items: {
                      create: [
                        { accountId: invAccount.id, debit: totalValue, credit: 0, description: `Saldo awal stok: ${row.code}` },
                        { accountId: openingEquity.id, debit: 0, credit: totalValue, description: `Saldo awal stok: ${row.code}` },
                      ],
                    },
                  },
                  include: { items: true },
                });

                await tx.accountingLedgerEntry.createMany({
                  data: journal.items.map((ji) => ({
                    date: now,
                    accountId: ji.accountId,
                    debit: ji.debit,
                    credit: ji.credit,
                    referenceType: 'JournalEntry' as const,
                    referenceId: journal.id,
                    description: ji.description || `Saldo awal stok: ${row.code}`,
                    fiscalYearId: fiscalYear.id,
                  })),
                });

                await updateBalancesForItems(
                  tx,
                  journal.items.map((i) => ({ accountId: i.accountId, debit: Number(i.debit), credit: Number(i.credit) }))
                );
              }
            }, { timeout: 15000 });
          }

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
          { header: 'openingBalance', key: 'openingBalance', width: 18 },
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
            openingBalance: Number(acc.balance),
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
          { header: 'openingBalance', key: 'openingBalance', width: 18 },
          { header: 'depositBalance', key: 'depositBalance', width: 18 },
          { header: 'customerDepositBalance', key: 'customerDepositBalance', width: 22 },
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
            openingBalance: Number(p.outstandingAmount),
            depositBalance: Number(p.depositBalance),
            customerDepositBalance: Number(p.customerDepositBalance),
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
          { header: 'openingQty', key: 'openingQty', width: 15 },
          { header: 'openingPrice', key: 'openingPrice', width: 18 },
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
            openingQty: '',
            openingPrice: '',
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
