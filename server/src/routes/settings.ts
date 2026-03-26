import { Router } from 'express';
import os from 'os';
import path from 'path';
import { prisma } from '../lib/prisma';
import { roleMiddleware } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { UpdateCompanySettingsSchema } from '../utils/schemas';
import { logger } from '../lib/logger';

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
