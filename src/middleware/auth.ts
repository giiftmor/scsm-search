import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function createAuthMiddleware(apiKeys: string[]) {
  return function auth(req: Request, res: Response, next: NextFunction): void {
    const provided = req.header('x-api-key');
    if (!provided || !apiKeys.some((key) => constantTimeEqual(key, provided))) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid API key' } });
      return;
    }
    next();
  };
}
