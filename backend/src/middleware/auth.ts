import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import type { UserRow } from '../types.js';
import { unauthorized } from './error.js';

export interface AuthenticatedRequest extends Request {
  user?: UserRow;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized());
    return;
  }

  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
    const user = getDb()
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(payload.sub) as UserRow | undefined;

    if (!user) {
      next(unauthorized('Session no longer valid'));
      return;
    }

    req.user = user;
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}
