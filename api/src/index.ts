import 'express-async-errors';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { pinoHttp } from 'pino-http';

import { config } from './config.js';
import { logger } from './util/logger.js';
import { HttpError, InternalError } from './util/errors.js';

import { authRouter } from './auth/routes.js';
import { locationsRouter } from './routes/locations.js';
import { ticketsRouter } from './routes/tickets.js';
import { documentsRouter, uploadErrorHandler } from './routes/documents.js';
import { adminRouter } from './routes/admin.js';
import { drasRouter } from './routes/dras.js';
import { faTrackersRouter } from './routes/faTrackers.js';
import { leasesRouter } from './routes/leases.js';

const app = express();

// Trust the Railway proxy so req.ip reflects the real client
app.set('trust proxy', 1);

app.use(pinoHttp({ logger }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(cors({
  origin: [config.FRONTEND_URL_LEGAL, config.FRONTEND_URL_PORTAL],
  credentials: true,
}));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// API v1
app.use('/api/v1/auth',      authRouter);
app.use('/api/v1/locations', locationsRouter);
app.use('/api/v1/tickets',   ticketsRouter);
app.use('/api/v1/documents', documentsRouter);
app.use('/api/v1/admin',     adminRouter);
app.use('/api/v1/dras',      drasRouter);
app.use('/api/v1/fa-trackers', faTrackersRouter);
app.use('/api/v1/locations',  leasesRouter);  // mounts /:id/leases/extract, /:id/leases/existing, /:id/leases (POST)

// Multer-specific error wrapper
app.use(uploadErrorHandler);

// 404 for unknown routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
});

// Central error handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    if (err.status >= 500) {
      req.log.error({ err, url: req.url, method: req.method }, 'http error');
    } else {
      req.log.warn({ err, url: req.url, method: req.method }, 'http error');
    }
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  const msg = err instanceof Error ? err.message : 'Unknown error';
  req.log.error({ err }, 'unhandled error');
  const safeErr = new InternalError();
  res.status(safeErr.status).json({ error: { code: safeErr.code, message: msg } });
});

app.listen(config.PORT, () => {
  const pat = config.AIRTABLE_PAT_LEGAL;
  logger.info({
    port: config.PORT,
    env: config.NODE_ENV,
    patLen: pat.length,
    patPrefix: pat.slice(0, 10),
    patSuffix: pat.slice(-6),
    patHasSpace: /\s/.test(pat),
    patLastCharCode: pat.charCodeAt(pat.length - 1),
  }, 'pub-legal-api listening');
});
