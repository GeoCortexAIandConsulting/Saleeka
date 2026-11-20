/**
 * Email verification and password reset. Each link carries a random token; only its SHA-256 is kept
 * on the account, so a leaked database does not give working links. A reset link works once, for an
 * hour; a newer link replaces an older one.
 */
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import type { Repos } from '../db/index.js';
import { AppError } from '../errors.js';
import type { User } from '../types.js';
import { resetEmail, sendEmail, verifyEmail } from './email.js';

const HOUR = 60 * 60 * 1000;
/** A player can ask for a new verification email once a minute. */
const RESEND_AFTER_MS = 60 * 1000;
/** A verification link works for 7 days. */
const VERIFY_FOR_MS = 7 * 24 * HOUR;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hash(token) };
};
const link = (path: string, token: string) => `${config.webOrigin}${path}?token=${encodeURIComponent(token)}`;

/** Sends (or re-sends) the "confirm your email" link. */
export async function sendVerification(repos: Repos, user: User, { force = false } = {}): Promise<string | undefined> {
  if (user.emailVerifiedAt) return;
  if (!force && user.verifySentAt && Date.now() - Date.parse(user.verifySentAt) < RESEND_AFTER_MS) {
    throw new AppError(429, 'We just sent one: please check your inbox (and spam) and try again in a minute.');
  }
  const { token, hash: h } = newToken();
  await repos.users.update({ id: user.id }, { verifyTokenHash: h, verifySentAt: new Date().toISOString() });
  const url = link('/verify', token);
  await sendEmail(verifyEmail(user.email, user.name, url));
  return url;
}

export async function confirmEmail(repos: Repos, token: string): Promise<User> {
  const user = await repos.users.findOne({ verifyTokenHash: hash(token) });
  // The link is good for a week from when it was sent (a new link replaces the old one).
  const fresh = user?.verifySentAt && Date.now() - Date.parse(user.verifySentAt) < VERIFY_FOR_MS;
  if (!user || !fresh) throw new AppError(400, 'This link has expired or was already used. On the sign-in page, ask for a new one.');
  await repos.users.update({ id: user.id }, { emailVerifiedAt: new Date().toISOString(), verifyTokenHash: undefined });
  return (await repos.users.findOne({ id: user.id }))!;
}

/** Always answers the same way, so nobody can find out which emails have an account. */
export async function forgotPassword(repos: Repos, email: string): Promise<string | undefined> {
  const user = await repos.users.findOne({ email });
  if (!user) return;
  const { token, hash: h } = newToken();
  await repos.users.update({ id: user.id }, { resetTokenHash: h, resetExpiresAt: new Date(Date.now() + HOUR).toISOString() });
  const url = link('/reset', token);
  await sendEmail(resetEmail(user.email, user.name, url));
  return url;
}

/** Sets the new password. Opening the link also proves the email works, so it counts as verified. */
export async function resetPassword(repos: Repos, token: string, password: string): Promise<User> {
  const user = await repos.users.findOne({ resetTokenHash: hash(token) });
  if (!user || !user.resetExpiresAt || Date.parse(user.resetExpiresAt) < Date.now()) {
    throw new AppError(400, 'This reset link has expired or was already used. Please ask for a new one.');
  }
  await repos.users.update(
    { id: user.id },
    {
      passwordHash: await bcrypt.hash(password, 10),
      resetTokenHash: undefined,
      resetExpiresAt: undefined,
      ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date().toISOString(), verifyTokenHash: undefined }),
    },
  );
  return (await repos.users.findOne({ id: user.id }))!;
}

/**
 * On a laptop with no email service, the link is also handed to the page, so the owner can test
 * sign-up without an inbox. Never on a live server, and never once a real email service is set up.
 */
export const devLink = (url: string | undefined) => (!config.isProd && (config.email.provider === 'log' || !config.email.apiKey) ? url : undefined);
