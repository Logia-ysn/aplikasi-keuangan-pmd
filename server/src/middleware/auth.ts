import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { prisma } from '../lib/prisma';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // Extract token: prefer cookie, fall back to Authorization header
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.substring(7)
      : null);

  if (!token) {
    return res.status(401).json({ error: 'Akses ditolak: Token tidak ditemukan.' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Akses ditolak: Token tidak valid atau kadaluarsa.' });
  }

  // Check if token has been revoked (blacklisted)
  const isBlacklisted = await prisma.tokenBlacklist.findUnique({ where: { token } });
  if (isBlacklisted) {
    return res.status(401).json({ error: 'Token has been revoked.' });
  }

  // CSRF validation for state-changing requests using cookie auth
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const csrfFromHeader = req.headers['x-csrf-token'] as string;
    const csrfFromCookie = req.cookies?.['csrf-token'];
    if (!csrfFromHeader || !csrfFromCookie || csrfFromHeader !== csrfFromCookie) {
      // Only enforce CSRF if using cookie auth (not Bearer token)
      if (req.cookies?.token && !req.headers.authorization) {
        return res.status(403).json({ error: 'Invalid CSRF token.' });
      }
    }
  }

  req.user = payload;
  next();
};

export const roleMiddleware = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Akses ditolak: Tidak memiliki izin.' });
    }
    next();
  };
};
