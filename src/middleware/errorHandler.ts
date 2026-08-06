import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

function isConnectionError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code?: unknown }).code);
    return ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEOUT', 'ESOCKET'].includes(code);
  }
  return false;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION', message: 'Invalid query parameters', details: err.flatten().fieldErrors },
    });
    return;
  }
  if (isConnectionError(err)) {
    res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
};
