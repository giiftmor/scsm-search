import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { pino, type Logger } from 'pino';

function isConnectionError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code?: unknown }).code);
    return ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEOUT', 'ESOCKET', 'ECONNRESET', 'EPIPE', 'ECONNABORTED'].includes(code);
  }
  return false;
}

// pino-http mounts a per-request logger before this handler in createApp; the
// silent fallback only covers standalone mounts (tests), keeping output clean.
const fallbackLogger = pino({ level: process.env.LOG_LEVEL ?? 'silent' });

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid query parameters' } });
    return;
  }
  const log: Logger = (req as unknown as { log?: Logger }).log ?? fallbackLogger;
  if (isConnectionError(err)) {
    log.warn({ err }, 'database unavailable');
    res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
    return;
  }
  log.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
};
