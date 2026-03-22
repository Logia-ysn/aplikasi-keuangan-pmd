import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { authMiddleware } from './middleware/auth';
import { auditTrailMiddleware } from './middleware/auditTrail';
import { logger } from './lib/logger';

// Route handlers
import authRoutes from './routes/auth';
import coaRoutes from './routes/coa';
import journalRoutes from './routes/journals';
import salesRoutes from './routes/sales';
import purchaseRoutes from './routes/purchase';
import paymentRoutes from './routes/payments';
import partyRoutes from './routes/parties';
import dashboardRoutes from './routes/dashboard';
import reportRoutes from './routes/reports';
import settingsRoutes from './routes/settings';
import fiscalYearRoutes from './routes/fiscalYears';
import inventoryRoutes from './routes/inventory';
import searchRoutes from './routes/search';
import usersRoutes from './routes/users';
import auditRoutes from './routes/audit';
import notificationRoutes from './routes/notifications';
import recurringRoutes from './routes/recurring';
import importRoutes from './routes/import';
import reconciliationRoutes from './routes/reconciliation';
import taxRoutes from './routes/tax';

const app = express();
const port = process.env.PORT || 3001;

// ─── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  'http://localhost:5173,http://localhost:3000'
)
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, same-origin)
      if (!origin) return callback(null, true);
      // Allow explicitly listed origins
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return callback(null, true);
      // Auto-allow same-origin: if frontend is served by this Express server,
      // the browser may still send Origin header — always allow it
      try {
        const originHost = new URL(origin).hostname;
        if (
          originHost === 'localhost' ||
          originHost === '127.0.0.1'
        ) {
          return callback(null, true);
        }
      } catch { /* invalid origin URL, fall through */ }
      logger.warn({ origin, allowedOrigins }, 'CORS origin blocked');
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// ─── Body Parsing ──────────────────────────────────────────────────────────────
// 5mb agar upload logo (base64 ~4MB) bisa masuk sebelum sampai ke /api/settings
app.use(express.json({ limit: '5mb' }));

// ─── Rate Limiter ──────────────────────────────────────────────────────────────
const apiRateLimit = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ─── Public Routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ─── Protected Routes ──────────────────────────────────────────────────────────
app.use('/api', apiRateLimit);
app.use('/api', authMiddleware);
app.use('/api', auditTrailMiddleware);

app.use('/api/coa', coaRoutes);
app.use('/api/journals', journalRoutes);
app.use('/api/sales/invoices', salesRoutes);
app.use('/api/purchase/invoices', purchaseRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/parties', partyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/fiscal-years', fiscalYearRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/import', importRoutes);
app.use('/api/reconciliation', reconciliationRoutes);
app.use('/api/tax', taxRoutes);

// ─── Serve Frontend (Production) ──────────────────────────────────────────────
// In production, serve the built React client from ../client/dist
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*path', (_req, res, next) => {
  // Only serve index.html for non-API routes (SPA fallback)
  if (_req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next(); // If file doesn't exist, fall through
  });
});

// ─── Global Error Handler ──────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── Process Handlers ──────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled rejection'));
process.on('SIGTERM', () => { logger.info('SIGTERM received, shutting down'); process.exit(0); });

app.listen(port, () => {
  logger.info(`Server running at http://localhost:${port}`);
});
