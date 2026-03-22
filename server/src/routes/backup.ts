import { Router } from 'express';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { roleMiddleware } from '../middleware/auth';
import { logger } from '../lib/logger';

const router = Router();

const BACKUP_DIR = path.resolve(process.cwd(), 'backups');
const MAX_BACKUPS = 5;

/** Ensure backup directory exists */
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/** Parse DATABASE_URL to extract connection params */
function parseDatabaseUrl(): { host: string; port: string; user: string; password: string; db: string } {
  const url = process.env.DATABASE_URL || '';
  try {
    const u = new URL(url);
    return {
      host: u.hostname || 'localhost',
      port: u.port || '5432',
      user: u.username || 'postgres',
      password: u.password || '',
      db: u.pathname.replace(/^\//, '') || 'finance',
    };
  } catch {
    // Fallback
    return { host: 'localhost', port: '5432', user: 'postgres', password: '', db: 'finance' };
  }
}

/** Auto-rotate: keep only last N backups */
function rotateBackups() {
  ensureBackupDir();
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.sql.gz'))
    .map((f) => ({
      name: f,
      time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);

  // Remove oldest if exceeding MAX_BACKUPS
  const toRemove = files.slice(MAX_BACKUPS);
  for (const f of toRemove) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, f.name));
      logger.info(`Backup rotated: deleted ${f.name}`);
    } catch (err) {
      logger.error({ err }, `Failed to delete backup ${f.name}`);
    }
  }
}

// GET /api/backup/list — list backup files
router.get('/list', roleMiddleware(['Admin']), async (_req, res) => {
  try {
    ensureBackupDir();
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.sql.gz'))
      .map((f) => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          filename: f,
          size: stat.size,
          date: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return res.json(files);
  } catch (error) {
    logger.error({ error }, 'GET /backup/list error');
    return res.status(500).json({ error: 'Gagal membaca daftar backup.' });
  }
});

// POST /api/backup/create — trigger pg_dump
router.post('/create', roleMiddleware(['Admin']), async (_req, res) => {
  try {
    ensureBackupDir();
    const { host, port, user, password, db } = parseDatabaseUrl();

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:\-T]/g, '').replace(/\..+$/, '').slice(0, 15);
    const filename = `backup-${timestamp}.sql.gz`;
    const filepath = path.join(BACKUP_DIR, filename);

    const env = { ...process.env, PGPASSWORD: password };
    const cmd = `pg_dump -h ${host} -p ${port} -U ${user} -d ${db} --no-owner --no-privileges | gzip > "${filepath}"`;

    execSync(cmd, { env, timeout: 120_000, shell: '/bin/sh' });

    // Verify file was created
    if (!fs.existsSync(filepath)) {
      return res.status(500).json({ error: 'Backup gagal: file tidak terbuat.' });
    }

    const stat = fs.statSync(filepath);

    // Auto-rotate
    rotateBackups();

    return res.json({
      filename,
      size: stat.size,
      date: stat.mtime.toISOString(),
    });
  } catch (error: any) {
    logger.error({ error: error?.message, stderr: error?.stderr?.toString() }, 'POST /backup/create error');
    return res.status(500).json({ error: `Gagal membuat backup: ${error?.message || 'Unknown error'}` });
  }
});

// GET /api/backup/download/:filename — download a backup file
router.get('/download/:filename', roleMiddleware(['Admin']), async (req, res) => {
  try {
    const filename = req.params.filename as string;

    // Sanitize filename to prevent directory traversal
    const sanitized = path.basename(filename);
    if (!sanitized.endsWith('.sql.gz')) {
      return res.status(400).json({ error: 'Format file tidak valid.' });
    }

    const filepath = path.join(BACKUP_DIR, sanitized);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File backup tidak ditemukan.' });
    }

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitized}"`);

    const stream = fs.createReadStream(filepath);
    stream.pipe(res);
  } catch (error) {
    logger.error({ error }, 'GET /backup/download error');
    return res.status(500).json({ error: 'Gagal mengunduh backup.' });
  }
});

// POST /api/backup/restore — restore from backup
router.post('/restore', roleMiddleware(['Admin']), async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Parameter filename wajib diisi.' });
    }

    // Sanitize filename
    const sanitized = path.basename(filename);
    if (!sanitized.endsWith('.sql.gz')) {
      return res.status(400).json({ error: 'Format file tidak valid.' });
    }

    const filepath = path.join(BACKUP_DIR, sanitized);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File backup tidak ditemukan.' });
    }

    const { host, port, user, password, db } = parseDatabaseUrl();
    const env = { ...process.env, PGPASSWORD: password };
    const cmd = `gunzip -c "${filepath}" | psql -h ${host} -p ${port} -U ${user} -d ${db}`;

    execSync(cmd, { env, timeout: 300_000, shell: '/bin/sh' });

    logger.info(`Backup restored: ${sanitized}`);
    return res.json({ message: `Restore berhasil dari ${sanitized}.` });
  } catch (error: any) {
    logger.error({ error: error?.message, stderr: error?.stderr?.toString() }, 'POST /backup/restore error');
    return res.status(500).json({ error: `Gagal restore backup: ${error?.message || 'Unknown error'}` });
  }
});

export default router;
