import { Router } from 'express';
import os from 'os';
import path from 'path';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { roleMiddleware } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { UpdateCompanySettingsSchema } from '../utils/schemas';
import { logger } from '../lib/logger';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';

const router = Router();

// GET /api/settings/runtime — runtime info (platform, domain, versions)
router.get('/runtime', async (req, res) => {
  try {
    const protocol = req.protocol;
    const host = req.get('host') || 'localhost';
    const origin = req.get('origin') || `${protocol}://${host}`;

    // Detect platform
    const arch = os.arch();
    const platform = os.platform();
    const cpuModel = os.cpus()[0]?.model || '';
    const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10; // GB

    let platformLabel = `${platform} (${arch})`;
    if (cpuModel.toLowerCase().includes('raspberry') || cpuModel.toLowerCase().includes('bcm') || cpuModel.toLowerCase().includes('cortex')) {
      platformLabel = `Raspberry Pi (${arch})`;
    } else if (platform === 'linux' && arch === 'arm64') {
      platformLabel = `Linux ARM64`;
    } else if (platform === 'darwin') {
      platformLabel = `macOS (${arch})`;
    } else if (platform === 'win32') {
      platformLabel = `Windows (${arch})`;
    } else if (platform === 'linux') {
      platformLabel = `Linux (${arch})`;
    }

    // Detect if running in Docker
    const isDocker = await import('fs').then(fs =>
      fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv')
    ).catch(() => false);
    if (isDocker) platformLabel += ' (Docker)';

    return res.json({
      platform: platformLabel,
      domain: origin,
      hostname: os.hostname(),
      nodeVersion: process.version,
      memory: `${totalMem} GB`,
      uptime: Math.round(process.uptime()),
      env: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    logger.error({ error }, 'GET /settings/runtime error');
    return res.status(500).json({ error: 'Gagal mengambil info runtime.' });
  }
});

// GET /api/settings/company
router.get('/company', async (req, res) => {
  try {
    const settings = await prisma.companySettings.findFirst({ where: { slug: 'default' } });
    return res.json(settings);
  } catch (error) {
    logger.error({ error }, 'GET /settings/company error');
    return res.status(500).json({ error: 'Gagal mengambil pengaturan perusahaan.' });
  }
});

// PUT /api/settings/company (Admin only)
router.put('/company', roleMiddleware(['Admin']), async (req, res) => {
  const rawBody = req.body;
  const mergedBody = {
    ...rawBody,
    companyName: rawBody.companyName || rawBody.name,
    currency: rawBody.defaultCurrency || rawBody.currency,
    fiscalYearStartMonth: rawBody.fiscalYearStartMonth,
  };

  const body = validateBody(UpdateCompanySettingsSchema, mergedBody, res);
  if (!body) return;

  if (body.logoUrl && typeof body.logoUrl === 'string' && body.logoUrl.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: 'Ukuran logo terlalu besar (maks. ~4MB setelah encoding).' });
  }

  try {
    const data = {
      companyName: body.companyName ?? rawBody.name ?? 'Perusahaan Anda',
      address: body.address || null,
      phone: body.phone || null,
      email: body.email || null,
      taxId: body.taxId || null,
      defaultCurrency: body.currency || rawBody.defaultCurrency || 'IDR',
      fiscalYearStartMonth: body.fiscalYearStartMonth ?? 1,
      ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl || null }),
    };

    const result = await prisma.companySettings.upsert({
      where: { slug: 'default' },
      update: data,
      create: { ...data, slug: 'default' },
    });

    return res.json(result);
  } catch (error) {
    logger.error({ error }, 'PUT /settings/company error');
    return res.status(500).json({ error: 'Gagal menyimpan pengaturan perusahaan.' });
  }
});

// POST /api/settings/generate-dummy — Generate dummy transactions (Admin only)
router.post('/generate-dummy', roleMiddleware(['Admin']), async (req, res) => {
  try {
    const admin = await prisma.user.findFirst({ where: { role: 'Admin' } });
    if (!admin) return res.status(400).json({ error: 'User admin tidak ditemukan.' });

    const fiscalYear = await prisma.fiscalYear.findFirst({ where: { isClosed: false }, orderBy: { startDate: 'desc' } });
    if (!fiscalYear) return res.status(400).json({ error: 'Tidak ada tahun fiskal aktif.' });

    // Get account IDs
    const accounts = await prisma.account.findMany({ where: { isGroup: false } });
    const acctMap = new Map(accounts.map(a => [a.accountNumber, a.id]));
    const kasId = acctMap.get('1.1.1');
    const bankId = acctMap.get('1.1.2');
    const arId = acctMap.get('1.1.3');
    const invId = acctMap.get('1.1.4');
    const apId = acctMap.get('2.1.1');
    const salesId = acctMap.get('4.1.1');
    const cogsId = acctMap.get('5.1.1');
    const gajiId = acctMap.get('5.2.2');
    const listrikId = acctMap.get('5.2.1');

    if (!kasId || !salesId || !arId || !apId) {
      return res.status(400).json({ error: 'Akun dasar (Kas, AR, AP, Sales) belum tersedia. Jalankan seed terlebih dahulu.' });
    }

    const results = { parties: 0, salesInvoices: 0, purchaseInvoices: 0, payments: 0, journals: 0, inventoryItems: 0, movements: 0, productionRuns: 0 };

    await prisma.$transaction(async (tx) => {
      // --- Dummy Parties ---
      const customerNames = [
        'Toko Beras Sejahtera', 'UD Pangan Jaya', 'CV Makmur Abadi', 'Toko Beras Melati',
        'PT Beras Nusantara', 'UD Sumber Rezeki', 'Toko Beras Cirebon', 'CV Padi Emas',
      ];
      const supplierNames = [
        'Petani Gabah Subur', 'KUD Tani Makmur', 'UD Gabah Cirebon', 'CV Padi Indah',
        'Kelompok Tani Sejahtera', 'UD Gabah Prima',
      ];

      const customers = [];
      for (const name of customerNames) {
        const p = await tx.party.create({
          data: { name, partyType: 'Customer', phone: '08' + Math.floor(1000000000 + Math.random() * 9000000000).toString().slice(0, 10), address: 'Cirebon, Jawa Barat', isDummy: true },
        });
        customers.push(p);
        results.parties++;
      }

      const suppliers = [];
      for (const name of supplierNames) {
        const p = await tx.party.create({
          data: { name, partyType: 'Supplier', phone: '08' + Math.floor(1000000000 + Math.random() * 9000000000).toString().slice(0, 10), address: 'Indramayu, Jawa Barat', isDummy: true },
        });
        suppliers.push(p);
        results.parties++;
      }

      // --- Dummy Inventory Items ---
      const itemDefs = [
        { code: 'GBH-GKP', name: 'Gabah Kering Panen (GKP)', unit: 'Kg', category: 'Bahan Baku', minimumStock: 5000 },
        { code: 'GBH-GKG', name: 'Gabah Kering Giling (GKG)', unit: 'Kg', category: 'Bahan Baku', minimumStock: 3000 },
        { code: 'BRS-PRM', name: 'Beras Premium', unit: 'Kg', category: 'Produk Jadi', minimumStock: 2000 },
        { code: 'BRS-MED', name: 'Beras Medium', unit: 'Kg', category: 'Produk Jadi', minimumStock: 1000 },
        { code: 'BKT-001', name: 'Bekatul', unit: 'Kg', category: 'Produk Sampingan', minimumStock: 500 },
        { code: 'SKM-001', name: 'Sekam', unit: 'Kg', category: 'Produk Sampingan', minimumStock: 200 },
        { code: 'MNR-001', name: 'Menir', unit: 'Kg', category: 'Produk Sampingan', minimumStock: 300 },
      ];

      const items = [];
      for (const def of itemDefs) {
        const existing = await tx.inventoryItem.findFirst({ where: { code: def.code } });
        if (!existing) {
          const item = await tx.inventoryItem.create({
            data: { ...def, isDummy: true, currentStock: 0, accountId: invId },
          });
          items.push(item);
          results.inventoryItems++;
        }
      }

      // --- Dummy Transactions (last 3 months) ---
      const now = new Date();
      for (let monthOffset = 2; monthOffset >= 0; monthOffset--) {
        const month = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);

        // Purchase invoices (buy gabah from suppliers) — 3 per month
        for (let i = 0; i < 3; i++) {
          const day = 5 + i * 8;
          const date = new Date(month.getFullYear(), month.getMonth(), Math.min(day, 28));
          const supplier = suppliers[i % suppliers.length];
          const qty = 1000 + Math.floor(Math.random() * 4000);
          const rate = 4500 + Math.floor(Math.random() * 1000);
          const subtotal = new Decimal(qty).mul(rate);
          const taxAmt = subtotal.mul(11).div(100);
          const grandTotal = subtotal.plus(taxAmt).toDecimalPlaces(2).toNumber();

          const fy = await getOpenFiscalYear(tx, date);
          const invNum = await generateDocumentNumber(tx, 'PI', date, fy.id);

          const pi = await tx.purchaseInvoice.create({
            data: {
              invoiceNumber: invNum, date, partyId: supplier.id, status: 'Submitted',
              grandTotal, outstanding: grandTotal, taxPct: 11, potongan: 0, biayaLain: 0,
              fiscalYearId: fy.id, createdBy: admin.id, submittedAt: date, isDummy: true,
              items: { create: [{ itemName: 'Gabah GKP', quantity: qty, unit: 'Kg', rate, discount: 0, amount: subtotal.toNumber(), accountId: cogsId || invId!, description: '' }] },
            },
          });

          // GL posting
          const jvNum = await generateDocumentNumber(tx, 'JV', date, fy.id);
          await tx.journalEntry.create({
            data: {
              entryNumber: jvNum, date, narration: 'Pembelian gabah - ' + supplier.name,
              status: 'Submitted', fiscalYearId: fy.id, createdBy: admin.id, submittedAt: date,
              items: { create: [
                { accountId: cogsId || invId!, debit: grandTotal, credit: 0 },
                { accountId: apId!, debit: 0, credit: grandTotal },
              ]},
            },
          });

          // Ledger entries
          await tx.accountingLedgerEntry.createMany({ data: [
            { accountId: cogsId || invId!, date, debit: grandTotal, credit: 0, referenceId: pi.id, referenceType: 'PurchaseInvoice', fiscalYearId: fy.id },
            { accountId: apId!, date, debit: 0, credit: grandTotal, referenceId: pi.id, referenceType: 'PurchaseInvoice', fiscalYearId: fy.id },
          ]});

          results.purchaseInvoices++;
        }

        // Sales invoices — 5 per month
        for (let i = 0; i < 5; i++) {
          const day = 3 + i * 5;
          const date = new Date(month.getFullYear(), month.getMonth(), Math.min(day, 28));
          const customer = customers[i % customers.length];
          const qty = 200 + Math.floor(Math.random() * 800);
          const rate = 12000 + Math.floor(Math.random() * 4000);
          const subtotal = new Decimal(qty).mul(rate);
          const taxAmt = subtotal.mul(11).div(100);
          const grandTotal = subtotal.plus(taxAmt).toDecimalPlaces(2).toNumber();

          const fy = await getOpenFiscalYear(tx, date);
          const siInvNum = await generateDocumentNumber(tx, 'SI', date, fy.id);

          const si = await tx.salesInvoice.create({
            data: {
              invoiceNumber: siInvNum, date, partyId: customer.id, status: 'Submitted',
              grandTotal, outstanding: grandTotal, taxPct: 11, potongan: 0, biayaLain: 0,
              dueDate: new Date(date.getTime() + 30 * 86400000),
              fiscalYearId: fy.id, createdBy: admin.id, submittedAt: date, isDummy: true,
              items: { create: [{ itemName: 'Beras Premium', quantity: qty, unit: 'Kg', rate, discount: 0, amount: subtotal.toNumber(), accountId: salesId!, description: '' }] },
            },
          });

          // GL posting
          const siJvNum = await generateDocumentNumber(tx, 'JV', date, fy.id);
          await tx.journalEntry.create({
            data: {
              entryNumber: siJvNum, date, narration: 'Penjualan beras - ' + customer.name,
              status: 'Submitted', fiscalYearId: fy.id, createdBy: admin.id, submittedAt: date,
              items: { create: [
                { accountId: arId!, debit: grandTotal, credit: 0 },
                { accountId: salesId!, debit: 0, credit: grandTotal },
              ]},
            },
          });

          await tx.accountingLedgerEntry.createMany({ data: [
            { accountId: arId!, date, debit: grandTotal, credit: 0, referenceId: si.id, referenceType: 'SalesInvoice', fiscalYearId: fy.id },
            { accountId: salesId!, date, debit: 0, credit: grandTotal, referenceId: si.id, referenceType: 'SalesInvoice', fiscalYearId: fy.id },
          ]});

          results.salesInvoices++;
        }

        // Journal entries (expenses) — 2 per month
        // Gaji
        const gajiDate = new Date(month.getFullYear(), month.getMonth(), 25);
        const gajiAmount = 8000000 + Math.floor(Math.random() * 4000000);
        const fyGaji = await getOpenFiscalYear(tx, gajiDate);
        const jeGaji = await generateDocumentNumber(tx, 'JV', gajiDate, fyGaji.id);
        await tx.journalEntry.create({
          data: {
            entryNumber: jeGaji, date: gajiDate, narration: 'Gaji karyawan bulan ' + (month.getMonth() + 1),
            status: 'Submitted', fiscalYearId: fyGaji.id, createdBy: admin.id, submittedAt: gajiDate,
            items: { create: [
              { accountId: gajiId || kasId!, debit: gajiAmount, credit: 0 },
              { accountId: kasId!, debit: 0, credit: gajiAmount },
            ]},
          },
        });
        await tx.accountingLedgerEntry.createMany({ data: [
          { accountId: gajiId || kasId!, date: gajiDate, debit: gajiAmount, credit: 0, referenceType: 'JournalEntry', referenceId: 'dummy-gaji', fiscalYearId: fyGaji.id },
          { accountId: kasId!, date: gajiDate, debit: 0, credit: gajiAmount, referenceType: 'JournalEntry', referenceId: 'dummy-gaji', fiscalYearId: fyGaji.id },
        ]});
        results.journals++;

        // Listrik
        const listrikDate = new Date(month.getFullYear(), month.getMonth(), 10);
        const listrikAmount = 1500000 + Math.floor(Math.random() * 1000000);
        const fyListrik = await getOpenFiscalYear(tx, listrikDate);
        const jeListrik = await generateDocumentNumber(tx, 'JV', listrikDate, fyListrik.id);
        await tx.journalEntry.create({
          data: {
            entryNumber: jeListrik, date: listrikDate, narration: 'Listrik & air bulan ' + (month.getMonth() + 1),
            status: 'Submitted', fiscalYearId: fyListrik.id, createdBy: admin.id, submittedAt: listrikDate,
            items: { create: [
              { accountId: listrikId || kasId!, debit: listrikAmount, credit: 0 },
              { accountId: kasId!, debit: 0, credit: listrikAmount },
            ]},
          },
        });
        await tx.accountingLedgerEntry.createMany({ data: [
          { accountId: listrikId || kasId!, date: listrikDate, debit: listrikAmount, credit: 0, referenceType: 'JournalEntry', referenceId: 'dummy-listrik', fiscalYearId: fyListrik.id },
          { accountId: kasId!, date: listrikDate, debit: 0, credit: listrikAmount, referenceType: 'JournalEntry', referenceId: 'dummy-listrik', fiscalYearId: fyListrik.id },
        ]});
        results.journals++;
      }

      // --- Dummy Stock Movements & Production Runs ---
      // Reload dummy items (may have been created above or exist already)
      const dummyItems = await tx.inventoryItem.findMany({ where: { isDummy: true } });
      const itemByCode = new Map(dummyItems.map(i => [i.code, i]));

      const gkpItem = itemByCode.get('GBH-GKP');
      const gkgItem = itemByCode.get('GBH-GKG');
      const berasPrm = itemByCode.get('BRS-PRM');
      const berasMed = itemByCode.get('BRS-MED');
      const bekatul = itemByCode.get('BKT-001');
      const sekam = itemByCode.get('SKM-001');
      const menir = itemByCode.get('MNR-001');

      if (gkpItem && gkgItem && berasPrm) {
        const { generateDocumentNumber: genSM } = await import('../utils/documentNumber');
        const { getOpenFiscalYear: getFY } = await import('../utils/fiscalYear');

        for (let monthOffset = 2; monthOffset >= 0; monthOffset--) {
          const month = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);

          // Stock In: Gabah GKP masuk dari pembelian — 2x per bulan
          for (let i = 0; i < 2; i++) {
            const date = new Date(month.getFullYear(), month.getMonth(), 6 + i * 12);
            const fy = await getFY(tx, date);
            const qty = 3000 + Math.floor(Math.random() * 5000);
            const unitCost = 4500 + Math.floor(Math.random() * 800);
            const smNum = await genSM(tx, 'SM', date, fy.id);
            await tx.stockMovement.create({
              data: {
                movementNumber: smNum, date, itemId: gkpItem.id, movementType: 'In',
                quantity: qty, unitCost, totalValue: qty * unitCost,
                offsetAccountId: kasId!, notes: 'Pembelian gabah GKP',
                fiscalYearId: fy.id, createdById: admin.id,
              },
            });
            await tx.inventoryItem.update({ where: { id: gkpItem.id }, data: { currentStock: { increment: qty } } });
            results.movements++;
          }

          // Stock Out: GKP keluar untuk proses giling — 1x per bulan
          const gilingDate = new Date(month.getFullYear(), month.getMonth(), 15);
          const gilingFy = await getFY(tx, gilingDate);
          const gilingQty = 4000 + Math.floor(Math.random() * 3000);
          const smOutNum = await genSM(tx, 'SM', gilingDate, gilingFy.id);
          await tx.stockMovement.create({
            data: {
              movementNumber: smOutNum, date: gilingDate, itemId: gkpItem.id, movementType: 'Out',
              quantity: gilingQty, unitCost: 0, totalValue: 0,
              notes: 'Proses giling ke GKG', referenceType: 'ProductionRun',
              fiscalYearId: gilingFy.id, createdById: admin.id,
            },
          });
          await tx.inventoryItem.update({ where: { id: gkpItem.id }, data: { currentStock: { decrement: gilingQty } } });
          results.movements++;

          // Stock In: GKG hasil proses giling (rendemen ~85%)
          const gkgQty = Math.round(gilingQty * 0.85);
          const smGkgNum = await genSM(tx, 'SM', gilingDate, gilingFy.id);
          await tx.stockMovement.create({
            data: {
              movementNumber: smGkgNum, date: gilingDate, itemId: gkgItem.id, movementType: 'In',
              quantity: gkgQty, unitCost: 0, totalValue: 0,
              notes: 'Hasil giling dari GKP', referenceType: 'ProductionRun',
              fiscalYearId: gilingFy.id, createdById: admin.id,
            },
          });
          await tx.inventoryItem.update({ where: { id: gkgItem.id }, data: { currentStock: { increment: gkgQty } } });
          results.movements++;

          // Production Run: GKG → Beras Premium + Bekatul + Sekam + Menir
          const prodDate = new Date(month.getFullYear(), month.getMonth(), 18);
          const prodFy = await getFY(tx, prodDate);
          const prodNum = await genSM(tx, 'PR', prodDate, prodFy.id);
          const inputGkg = 2500 + Math.floor(Math.random() * 2000);
          const outBeras = Math.round(inputGkg * 0.62);
          const outBekatul = Math.round(inputGkg * 0.08);
          const outSekam = Math.round(inputGkg * 0.20);
          const outMenir = Math.round(inputGkg * 0.05);
          const rendemen = Math.round((outBeras / inputGkg) * 10000) / 100;

          await tx.productionRun.create({
            data: {
              runNumber: prodNum, date: prodDate, rendemenPct: rendemen,
              notes: 'Produksi beras premium bulan ' + (month.getMonth() + 1),
              fiscalYearId: prodFy.id, createdById: admin.id,
              items: {
                create: [
                  { itemId: gkgItem.id, lineType: 'Input', quantity: inputGkg },
                  { itemId: berasPrm.id, lineType: 'Output', quantity: outBeras, rendemenPct: rendemen },
                  ...(bekatul ? [{ itemId: bekatul.id, lineType: 'Output' as const, quantity: outBekatul }] : []),
                  ...(sekam ? [{ itemId: sekam.id, lineType: 'Output' as const, quantity: outSekam }] : []),
                  ...(menir ? [{ itemId: menir.id, lineType: 'Output' as const, quantity: outMenir }] : []),
                ],
              },
            },
          });

          // Update stock for production
          await tx.inventoryItem.update({ where: { id: gkgItem.id }, data: { currentStock: { decrement: inputGkg } } });
          await tx.inventoryItem.update({ where: { id: berasPrm.id }, data: { currentStock: { increment: outBeras } } });
          if (bekatul) await tx.inventoryItem.update({ where: { id: bekatul.id }, data: { currentStock: { increment: outBekatul } } });
          if (sekam) await tx.inventoryItem.update({ where: { id: sekam.id }, data: { currentStock: { increment: outSekam } } });
          if (menir) await tx.inventoryItem.update({ where: { id: menir.id }, data: { currentStock: { increment: outMenir } } });
          results.productionRuns++;

          // Stock Out: Beras keluar (terjual) — 2x per bulan
          for (let i = 0; i < 2; i++) {
            const sellDate = new Date(month.getFullYear(), month.getMonth(), 20 + i * 4);
            const sellFy = await getFY(tx, sellDate);
            const sellQty = 300 + Math.floor(Math.random() * 500);
            const smSellNum = await genSM(tx, 'SM', sellDate, sellFy.id);
            await tx.stockMovement.create({
              data: {
                movementNumber: smSellNum, date: sellDate, itemId: berasPrm.id, movementType: 'Out',
                quantity: sellQty, unitCost: 12000, totalValue: sellQty * 12000,
                offsetAccountId: kasId!, notes: 'Penjualan beras premium',
                fiscalYearId: sellFy.id, createdById: admin.id,
              },
            });
            await tx.inventoryItem.update({ where: { id: berasPrm.id }, data: { currentStock: { decrement: sellQty } } });
            results.movements++;
          }

          // Adjustment: Stok opname (kecil) — 1x per bulan pada bekatul
          if (bekatul) {
            const adjDate = new Date(month.getFullYear(), month.getMonth(), 28);
            const adjFy = await getFY(tx, adjDate);
            const adjQty = 10 + Math.floor(Math.random() * 30);
            const smAdjNum = await genSM(tx, 'SM', adjDate, adjFy.id);
            await tx.stockMovement.create({
              data: {
                movementNumber: smAdjNum, date: adjDate, itemId: bekatul.id, movementType: 'AdjustmentOut',
                quantity: adjQty, unitCost: 0, totalValue: 0,
                notes: 'Stok opname — selisih bekatul', fiscalYearId: adjFy.id, createdById: admin.id,
              },
            });
            await tx.inventoryItem.update({ where: { id: bekatul.id }, data: { currentStock: { decrement: adjQty } } });
            results.movements++;
          }
        }

        // Second production run type: GKG → Beras Medium (lower rendemen)
        if (berasMed) {
          const prodDate2 = new Date(now.getFullYear(), now.getMonth(), 10);
          const prodFy2 = await getFY(tx, prodDate2);
          const prodNum2 = await genSM(tx, 'PR', prodDate2, prodFy2.id);
          const inputQty2 = 2000;
          const outBeras2 = Math.round(inputQty2 * 0.58);
          const rendemen2 = Math.round((outBeras2 / inputQty2) * 10000) / 100;

          await tx.productionRun.create({
            data: {
              runNumber: prodNum2, date: prodDate2, rendemenPct: rendemen2,
              notes: 'Produksi beras medium', fiscalYearId: prodFy2.id, createdById: admin.id,
              items: {
                create: [
                  { itemId: gkgItem.id, lineType: 'Input', quantity: inputQty2 },
                  { itemId: berasMed.id, lineType: 'Output', quantity: outBeras2, rendemenPct: rendemen2 },
                ],
              },
            },
          });
          await tx.inventoryItem.update({ where: { id: gkgItem.id }, data: { currentStock: { decrement: inputQty2 } } });
          await tx.inventoryItem.update({ where: { id: berasMed.id }, data: { currentStock: { increment: outBeras2 } } });
          results.productionRuns++;
        }
      }
    }, { timeout: 120000 });

    logger.info({ results }, 'Dummy data generated');
    return res.json({ message: 'Data dummy berhasil dibuat.', results });
  } catch (error) {
    logger.error({ error }, 'POST /settings/generate-dummy error');
    return res.status(500).json({ error: 'Gagal membuat data dummy.' });
  }
});

// POST /api/settings/delete-dummy — Delete only dummy data (Admin only)
router.post('/delete-dummy', roleMiddleware(['Admin']), async (_req, res) => {
  try {
    const results = { parties: 0, salesInvoices: 0, purchaseInvoices: 0, inventoryItems: 0, movements: 0, productionRuns: 0 };

    await prisma.$transaction(async (tx) => {
      // Delete dummy invoice items, ledger entries, journals linked to dummy invoices
      const dummySI = await tx.salesInvoice.findMany({ where: { isDummy: true }, select: { id: true } });
      const dummyPI = await tx.purchaseInvoice.findMany({ where: { isDummy: true }, select: { id: true } });
      const siIds = dummySI.map(s => s.id);
      const piIds = dummyPI.map(p => p.id);

      // Delete related payment allocations and payments
      if (siIds.length > 0) {
        await tx.paymentAllocation.deleteMany({ where: { invoiceType: 'SalesInvoice', invoiceId: { in: siIds } } });
      }
      if (piIds.length > 0) {
        await tx.paymentAllocation.deleteMany({ where: { invoiceType: 'PurchaseInvoice', invoiceId: { in: piIds } } });
      }

      // Delete ledger entries linked to dummy invoices
      if (siIds.length > 0) {
        await tx.accountingLedgerEntry.deleteMany({ where: { referenceId: { in: siIds } } });
      }
      if (piIds.length > 0) {
        await tx.accountingLedgerEntry.deleteMany({ where: { referenceId: { in: piIds } } });
      }

      // Delete invoice items then invoices
      if (siIds.length > 0) {
        await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: { in: siIds } } });
        results.salesInvoices = (await tx.salesInvoice.deleteMany({ where: { isDummy: true } })).count;
      }
      if (piIds.length > 0) {
        await tx.purchaseInvoiceItem.deleteMany({ where: { purchaseInvoiceId: { in: piIds } } });
        results.purchaseInvoices = (await tx.purchaseInvoice.deleteMany({ where: { isDummy: true } })).count;
      }

      // Delete production runs linked to dummy inventory items
      const dummyItems = await tx.inventoryItem.findMany({ where: { isDummy: true }, select: { id: true } });
      if (dummyItems.length > 0) {
        const itemIds = dummyItems.map(i => i.id);

        // Find production runs that use dummy items
        const dummyProdItems = await tx.productionRunItem.findMany({
          where: { itemId: { in: itemIds } },
          select: { productionRunId: true },
        });
        const prodRunIds = [...new Set(dummyProdItems.map(p => p.productionRunId))];
        if (prodRunIds.length > 0) {
          await tx.productionRunItem.deleteMany({ where: { productionRunId: { in: prodRunIds } } });
          results.productionRuns = (await tx.productionRun.deleteMany({ where: { id: { in: prodRunIds } } })).count;
        }

        // Delete stock movements and inventory items
        results.movements = (await tx.stockMovement.deleteMany({ where: { itemId: { in: itemIds } } })).count;
        results.inventoryItems = (await tx.inventoryItem.deleteMany({ where: { isDummy: true } })).count;
      }

      // Delete dummy parties
      results.parties = (await tx.party.deleteMany({ where: { isDummy: true } })).count;
    }, { timeout: 60000 });

    logger.info({ results }, 'Dummy data deleted');
    return res.json({ message: 'Data dummy berhasil dihapus.', results });
  } catch (error) {
    logger.error({ error }, 'POST /settings/delete-dummy error');
    return res.status(500).json({ error: 'Gagal menghapus data dummy.' });
  }
});

// POST /api/settings/reset-data — Reset all data and re-seed (Admin only, development)
router.post('/reset-data', roleMiddleware(['Admin']), async (req, res) => {
  const body = req.body;
  if (body?.confirmation !== 'RESET') {
    return res.status(400).json({ error: 'Ketik RESET untuk mengonfirmasi.' });
  }

  try {
    // Delete all data in correct order (respect FK constraints)
    await prisma.$transaction(async (tx) => {
      // Clear token blacklist
      await tx.tokenBlacklist.deleteMany();
      // Clear notifications
      await tx.notification.deleteMany();
      // Clear audit logs
      await tx.auditLog.deleteMany();
      // Clear bank reconciliation items then reconciliations
      await tx.bankReconciliationItem.deleteMany();
      await tx.bankReconciliation.deleteMany();
      // Clear recurring templates
      await tx.recurringTemplate.deleteMany();
      // Clear payment allocations then payments
      await tx.paymentAllocation.deleteMany();
      await tx.payment.deleteMany();
      // Clear invoice items then invoices
      await tx.salesInvoiceItem.deleteMany();
      await tx.salesInvoice.deleteMany();
      await tx.purchaseInvoiceItem.deleteMany();
      await tx.purchaseInvoice.deleteMany();
      // Clear production run items then runs
      await tx.productionRunItem.deleteMany();
      await tx.productionRun.deleteMany();
      // Clear stock movements
      await tx.stockMovement.deleteMany();
      // Clear inventory items
      await tx.inventoryItem.deleteMany();
      // Clear journal items, ledger entries, then journals
      await tx.journalItem.deleteMany();
      await tx.accountingLedgerEntry.deleteMany();
      await tx.journalEntry.deleteMany();
      // Clear parties
      await tx.party.deleteMany();
      // Clear accounts
      await tx.account.deleteMany();
      // Clear tax config
      await tx.taxConfig.deleteMany();
      // Clear fiscal years
      await tx.fiscalYear.deleteMany();
      // Clear company settings
      await tx.companySettings.deleteMany();
      // Clear users — seed will recreate them
      await tx.user.deleteMany();
    }, { timeout: 60000 });

    // Re-seed by running the seed script
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    try {
      await execFileAsync('npx', ['tsx', 'prisma/seed.ts'], {
        cwd: path.resolve(__dirname, '../..'),
        env: { ...process.env },
        timeout: 30000,
      });
    } catch (seedError) {
      logger.error({ error: seedError }, 'Seed failed after reset');
      return res.status(500).json({ error: 'Data berhasil dihapus, tapi gagal re-seed. Silakan restart server.' });
    }

    logger.info('Database reset and re-seeded successfully');
    return res.json({ message: 'Data berhasil direset. Silakan login ulang.' });
  } catch (error) {
    logger.error({ error }, 'POST /settings/reset-data error');
    return res.status(500).json({ error: 'Gagal mereset data.' });
  }
});

export default router;
