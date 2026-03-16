import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { roleMiddleware } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { UpdateCompanySettingsSchema } from '../utils/schemas';
import { logger } from '../lib/logger';

const router = Router();

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
  };

  const body = validateBody(UpdateCompanySettingsSchema, mergedBody, res);
  if (!body) return;

  if (body.logoUrl && typeof body.logoUrl === 'string' && body.logoUrl.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: 'Ukuran logo terlalu besar (maks. ~4MB setelah encoding).' });
  }

  try {
    const data = {
      companyName: body.companyName ?? rawBody.name ?? 'PMD Finance',
      address: body.address || null,
      phone: body.phone || null,
      email: body.email || null,
      taxId: body.taxId || null,
      defaultCurrency: body.currency || rawBody.defaultCurrency || 'IDR',
      fiscalYearStartMonth: rawBody.fiscalYearStartMonth ?? 1,
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

export default router;
