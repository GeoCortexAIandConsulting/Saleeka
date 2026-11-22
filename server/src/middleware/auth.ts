import type { NextFunction, Request, Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
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

/** Players the admin has suspended: their sessions stop working at once (kept in memory, see app.ts). */
const suspended = new Set<string>();

export function setSuspended(ids: Iterable<string>) {
  suspended.clear();
  for (const id of ids) suspended.add(id);
}

export function markSuspended(id: string, on: boolean) {
  if (on) suspended.add(id);
  else suspended.delete(id);
}

function readUserId(req: Request): string | null {
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  const token = req.cookies?.[COOKIE] ?? bearer;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub?: string; adm?: boolean };
    // An admin session is not a player session.
    if (!payload.sub || payload.adm) return null;
    return suspended.has(payload.sub) ? null : payload.sub;
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

/* ------------------------------- admin portal ------------------------------- */

export const ADMIN_COOKIE = 'saleeqa_admin';
const ADMIN_HOURS = 12;

/** Is the admin sign-in set up? (In production the password must be long.) */
export function adminConfigured(): boolean {
  const { username, password } = config.admin;
  return Boolean(username && password && (!config.isProd || password.length >= 12));
}

/**
 * Admin sessions are signed with a key that includes the admin password, so changing the password in
 * server/.env (or on Render) signs every admin session out.
 */
const adminSecret = () => `${config.jwtSecret}:admin:${createHash('sha256').update(`${config.admin.username}
${config.admin.password}`).digest('hex')}`;

const same = (a: string, b: string) => {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
};

/** Checks the admin username and password (in constant time, so guesses learn nothing from timing). */
export function adminCredentialsOk(username: string, password: string): boolean {
  if (!adminConfigured()) return false;
  // Both are always compared, so a wrong username takes as long as a wrong password.
  const u = same(username.trim().toLowerCase(), config.admin.username.toLowerCase());
  const p = same(password, config.admin.password);
  return u && p;
}

export function setAdminCookie(res: Response) {
  const token = jwt.sign({ sub: 'admin', adm: true }, adminSecret(), { expiresIn: `${ADMIN_HOURS}h` });
  res.cookie(ADMIN_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: config.isProd, maxAge: ADMIN_HOURS * 3600 * 1000, path: '/' });
}

export function isAdmin(req: Request): boolean {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (!token || !adminConfigured()) return false;
  try {
    const payload = jwt.verify(token, adminSecret()) as { adm?: boolean };
    return payload.adm === true;
  } catch {
    return false;
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!isAdmin(req)) return next(new AppError(401, 'Please sign in to the admin portal'));
  next();
}

/* ------------------------------- brand portal ------------------------------- */

export const BRAND_COOKIE = 'saleeqa_brand';
// Its own signing key, so a brand session is never a player or admin session (or the other way round).
const brandSecret = () => `${config.jwtSecret}:brand`;

export function setBrandCookie(res: Response, accountId: string) {
  const token = jwt.sign({ sub: accountId, brand: true }, brandSecret(), { expiresIn: '14d' });
  res.cookie(BRAND_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 14 * 24 * 3600 * 1000, path: '/' });
}

/** The brand account signed in on this request (its status is checked by the brand routes). */
export function readBrandAccountId(req: Request): string | null {
  const token = req.cookies?.[BRAND_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, brandSecret()) as { sub?: string; brand?: boolean };
    return payload.brand ? (payload.sub ?? null) : null;
  } catch {
    return null;
  }
}
