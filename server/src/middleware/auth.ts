import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../errors.js';

export const COOKIE = 'saleeqa_token';

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '14d' });
}

export function setAuthCookie(res: Response, userId: string) {
  res.cookie(COOKIE, signToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 14 * 24 * 3600 * 1000,
    path: '/',
  });
}

function readUserId(req: Request): string | null {
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  const token = req.cookies?.[COOKIE] ?? bearer;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  res.locals.userId = readUserId(req);
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const id = readUserId(req);
  if (!id) return next(new AppError(401, 'Please sign in'));
  res.locals.userId = id;
  next();
}
