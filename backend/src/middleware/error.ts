import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { config } from '../config.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'ERROR',
  ) {
    super(message);
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message, 'BAD_REQUEST');
}

export function unauthorized(message = 'Authentication required'): HttpError {
  return new HttpError(401, message, 'UNAUTHORIZED');
}

export function notFound(message = 'Not found'): HttpError {
  return new HttpError(404, message, 'NOT_FOUND');
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected error';

  if (message.includes('File too large')) {
    res.status(413).json({ error: 'File exceeds the maximum allowed size', code: 'FILE_TOO_LARGE' });
    return;
  }

  if (!config.isTest) {
    console.error('[medlog] unhandled error:', err);
  }

  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
}
