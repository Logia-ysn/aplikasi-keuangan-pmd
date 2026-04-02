import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { logger } from '../lib/logger';

const UPLOAD_BASE = process.env.UPLOAD_DIR || '/app/uploads/attachments';
const MAX_IMAGE_WIDTH = 1920;
const IMAGE_QUALITY = 80;

interface SaveResult {
  storedName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
}

function getSubDir(): string {
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function saveAttachment(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<SaveResult> {
  const uuid = crypto.randomUUID();
  const subDir = getSubDir();
  const dirPath = path.join(UPLOAD_BASE, subDir);
  await fs.mkdir(dirPath, { recursive: true });

  const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType);

  if (isImage) {
    try {
      // Dynamic import sharp (may not be available in dev)
      const sharp = (await import('sharp')).default;
      const compressed = await sharp(buffer)
        .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
        .webp({ quality: IMAGE_QUALITY })
        .toBuffer();

      const storedName = `${uuid}.webp`;
      const filePath = path.join(subDir, storedName);
      await fs.writeFile(path.join(UPLOAD_BASE, filePath), compressed);

      return {
        storedName,
        filePath,
        fileSize: compressed.length,
        mimeType: 'image/webp',
      };
    } catch (err) {
      // Fallback: save original if sharp fails
      logger.warn({ err }, 'Sharp compression failed, saving original');
    }
  }

  // PDF or fallback: save as-is
  const ext = mimeType === 'application/pdf' ? 'pdf' : path.extname(originalName).slice(1) || 'bin';
  const storedName = `${uuid}.${ext}`;
  const filePath = path.join(subDir, storedName);
  await fs.writeFile(path.join(UPLOAD_BASE, filePath), buffer);

  return { storedName, filePath, fileSize: buffer.length, mimeType };
}

export async function deleteAttachment(filePath: string): Promise<void> {
  const fullPath = path.join(UPLOAD_BASE, filePath);
  try {
    await fs.unlink(fullPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      logger.error({ err, filePath }, 'Failed to delete attachment file');
      throw err;
    }
  }
}

export function getFullPath(filePath: string): string {
  return path.join(UPLOAD_BASE, filePath);
}
