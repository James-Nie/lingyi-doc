import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContextStorage } from '../logger/request-context';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming.trim()
    ? incoming.trim()
    : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  requestContextStorage.run({ requestId }, () => next());
}
