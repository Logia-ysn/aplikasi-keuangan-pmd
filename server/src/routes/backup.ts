import { Router } from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { roleMiddleware } from '../middleware/auth';
import { logger } from '../lib/logger';

const router = Router();

const BACKUP_DIR = path.resolve(process.cwd(), 'backups');
const MAX_BACKUPS = 5;

/** Ensure backup directory exists */
async function ensureBackupDir(): Promise<void> {
  try {
    await fs.promises.access(BACKUP_DIR);
  } catch {
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
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
async function rotateBackups(): Promise<void> {
  await ensureBackupDir();
  const entries = await fs.promises.readdir(BACKUP_DIR);
  const sqlGzFiles = entries.filter((f) => f.endsWith('.sql.gz'));

  const filesWithTime: Array<{ name: string; time: number }> = [];
  for (const f of sqlGzFiles) {
    const stat = await fs.promises.stat(path.join(BACKUP_DIR, f));
    filesWithTime.push({ name: f, time: stat.mtime.getTime() });
  }

  filesWithTime.sort((a, b) => b.time - a.time);

  // Remove oldest if exceeding MAX_BACKUPS
  const toRemove = filesWithTime.slice(MAX_BACKUPS);
  for (const f of toRemove) {
    try {
      await fs.promises.unlink(path.join(BACKUP_DIR, f.name));
      logger.info(`Backup rotated: deleted ${f.name}`);
    } catch (err) {
      logger.error({ err }, `Failed to delete backup ${f.name}`);
    }
  }
}

/** Spawn a pipeline and return a promise that resolves on success or rejects on failure */
function spawnPgDump(
  pgArgs: readonly string[],
  outputPath: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const pgDump = spawn('pg_dump', pgArgs, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const gzip = spawn('gzip', [], { stdio: ['pipe', 'pipe', 'pipe'] });
    const outStream = fs.createWriteStream(outputPath);

    let pgStderr = '';
    let gzipStderr = '';

    pgDump.stderr.on('data', (chunk: Buffer) => {
      pgStderr += chunk.toString();
    });
    gzip.stderr.on('data', (chunk: Buffer) => {
      gzipStderr += chunk.toString();
    });

    pgDump.stdout.pipe(gzip.stdin);
    gzip.stdout.pipe(outStream);

    const timer = setTimeout(() => {
      pgDump.kill('SIGTERM');
      gzip.kill('SIGTERM');
      finish(new Error('pg_dump timed out'));
    }, timeoutMs);

    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    pgDump.on('error', (err) => finish(new Error(`pg_dump spawn error: ${err.message}`)));
    gzip.on('error', (err) => finish(new Error(`gzip spawn error: ${err.message}`)));
    outStream.on('error', (err) => finish(new Error(`File write error: ${err.message}`)));

    pgDump.on('close', (code) => {
      if (code !== 0) {
        finish(new Error(`pg_dump exited with code ${code}: ${pgStderr}`));
      }
    });

    outStream.on('finish', () => {
      finish();
    });
  });
}

/** Spawn a gunzip | psql pipeline and return a promise */
function spawnPsqlRestore(
  inputPath: string,
  psqlArgs: readonly string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const gunzip = spawn('gunzip', ['-c', inputPath], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const psql = spawn('psql', psqlArgs, { env, stdio: ['pipe', 'pipe', 'pipe'] });

    let gunzipStderr = '';
    let psqlStderr = '';

    gunzip.stderr.on('data', (chunk: Buffer) => {
      gunzipStderr += chunk.toString();
    });
    psql.stderr.on('data', (chunk: Buffer) => {
      psqlStderr += chunk.toString();
    });

    gunzip.stdout.pipe(psql.stdin);

    const timer = setTimeout(() => {
      gunzip.kill('SIGTERM');
      psql.kill('SIGTERM');
      finish(new Error('psql restore timed out'));
    }, timeoutMs);

    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    gunzip.on('error', (err) => finish(new Error(`gunzip spawn error: ${err.message}`)));
    psql.on('error', (err) => finish(new Error(`psql spawn error: ${err.message}`)));

    gunzip.on('close', (code) => {
      if (code !== 0) {
        finish(new Error(`gunzip exited with code ${code}: ${gunzipStderr}`));
      }
    });

    psql.on('close', (code) => {
      if (code !== 0) {
        finish(new Error(`psql exited with code ${code}: ${psqlStderr}`));
      } else {
        finish();
      }
    });
  });
}

// GET /api/backup/list — list backup files
router.get('/list', roleMiddleware(['Admin']), async (_req, res) => {
  try {
    await ensureBackupDir();
    const entries = await fs.promises.readdir(BACKUP_DIR);
    const sqlGzFiles = entries.filter((f) => f.endsWith('.sql.gz'));

    const files: Array<{ filename: string; size: number; date: string }> = [];
    for (const f of sqlGzFiles) {
      const stat = await fs.promises.stat(path.join(BACKUP_DIR, f));
      files.push({
        filename: f,
        size: stat.size,
        date: stat.mtime.toISOString(),
      });
    }

    files.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return res.json(files);
  } catch (error) {
    logger.error({ error }, 'GET /backup/list error');
    return res.status(500).json({ error: 'Gagal membaca daftar backup.' });
  }
});

// POST /api/backup/create — trigger pg_dump
router.post('/create', roleMiddleware(['Admin']), async (_req, res) => {
  try {
    await ensureBackupDir();
    const { host, port, user, password, db } = parseDatabaseUrl();

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:\-T]/g, '').replace(/\..+$/, '').slice(0, 15);
    const filename = `backup-${timestamp}.sql.gz`;
    const filepath = path.join(BACKUP_DIR, filename);

    const env = { ...process.env, PGPASSWORD: password };
    const pgArgs = ['-h', host, '-p', port, '-U', user, '-d', db, '--no-owner', '--no-privileges'] as const;

    await spawnPgDump(pgArgs, filepath, env, 120_000);

    // Verify file was created
    try {
      await fs.promises.access(filepath);
    } catch {
      return res.status(500).json({ error: 'Backup gagal: file tidak terbuat.' });
    }

    const stat = await fs.promises.stat(filepath);

    // Auto-rotate
    await rotateBackups();

    return res.json({
      filename,
      size: stat.size,
      date: stat.mtime.toISOString(),
    });
  } catch (error: unknown) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'POST /backup/create error');
    return res.status(500).json({ error: 'Gagal membuat backup. Silakan coba lagi atau hubungi administrator.' });
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
    try {
      await fs.promises.access(filepath);
    } catch {
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
    try {
      await fs.promises.access(filepath);
    } catch {
      return res.status(404).json({ error: 'File backup tidak ditemukan.' });
    }

    const { host, port, user, password, db } = parseDatabaseUrl();
    const env = { ...process.env, PGPASSWORD: password };
    const psqlArgs = ['-h', host, '-p', port, '-U', user, '-d', db] as const;

    await spawnPsqlRestore(filepath, psqlArgs, env, 300_000);

    logger.info(`Backup restored: ${sanitized}`);
    return res.json({ message: `Restore berhasil dari ${sanitized}.` });
  } catch (error: unknown) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'POST /backup/restore error');
    return res.status(500).json({ error: 'Gagal restore backup. Silakan coba lagi atau hubungi administrator.' });
  }
});

export default router;
