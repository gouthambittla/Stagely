import { Response } from 'express';
import { Prisma } from '@prisma/client';

/** An error whose message is safe to show to API clients, with the HTTP status to send. */
export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const forbidden = (message: string) => new HttpError(403, message);
export const notFound = (message: string) => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);

/** Parses a route/query id, throwing 400 unless it is a positive integer. */
export function parseId(value: unknown, name = 'id'): number {
  const raw = typeof value === 'string' ? value.trim() : value;
  const id = typeof raw === 'number' ? raw : /^\d+$/.test(String(raw)) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw badRequest(`${name} must be a positive integer`);
  }
  return id;
}

/**
 * Validates an optional/required free-text field and returns it trimmed.
 * Keeps unbounded client input out of the database.
 */
export function parseText(
  value: unknown,
  name: string,
  { required = false, max = 500 }: { required?: boolean; max?: number } = {}
): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${name} is required`);
    return undefined;
  }
  if (typeof value !== 'string') throw badRequest(`${name} must be a string`);
  const trimmed = value.trim();
  if (required && trimmed.length === 0) throw badRequest(`${name} is required`);
  if (trimmed.length > max) throw badRequest(`${name} must be at most ${max} characters`);
  return trimmed;
}

/** Maps any thrown value to a status code and a client-safe message. */
export function toHttpError(err: unknown, fallbackStatus = 500): { status: number; message: string } {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return { status: 409, message: 'Resource already exists' };
    if (err.code === 'P2025') return { status: 404, message: 'Resource not found' };
    return { status: 500, message: 'Internal server error' };
  }
  if (
    err instanceof Prisma.PrismaClientValidationError ||
    err instanceof Prisma.PrismaClientUnknownRequestError ||
    err instanceof Prisma.PrismaClientRustPanicError ||
    err instanceof Prisma.PrismaClientInitializationError
  ) {
    return { status: 500, message: 'Internal server error' };
  }

  const anyErr = err as { statusCode?: unknown; message?: unknown } | null;
  const explicit = typeof anyErr?.statusCode === 'number' ? anyErr.statusCode : undefined;
  const status = explicit ?? fallbackStatus;
  if (status >= 500) return { status, message: 'Internal server error' };

  const message = typeof anyErr?.message === 'string' && anyErr.message ? anyErr.message : 'Request failed';
  return { status, message };
}

/**
 * Sends an error response. Business errors thrown by services (plain Error or HttpError)
 * keep their message; anything that maps to 5xx is logged server-side and returned generically.
 */
export function sendError(res: Response, err: unknown, fallbackStatus = 500): void {
  const { status, message } = toHttpError(err, fallbackStatus);
  if (status >= 500) {
    console.error('Unhandled request error:', err);
  }
  res.status(status).json({ error: message });
}
