/**
 * Usernames: how players are shown on the Runway (@areeba.styles), unique across Saleeqa.
 * 3 to 20 characters: letters, numbers, dots and underscores, starting and ending with a letter or
 * number. Stored in lower case, so "Areeba" and "areeba" are the same name.
 */
import type { Repos } from '../db/index.js';

export const USERNAME_RULE = /^[a-z0-9](?:[a-z0-9._]{1,18})[a-z0-9]$/;

/** Names that would confuse players or look official. */
const RESERVED = new Set([
  'admin', 'administrator', 'saleeqa', 'support', 'help', 'helpdesk', 'team', 'staff', 'official', 'moderator', 'mod',
  'runway', 'studio', 'account', 'login', 'signup', 'api', 'root', 'system', 'me', 'you', 'null', 'undefined', 'anonymous',
]);

export const normalizeUsername = (raw: string) => raw.trim().replace(/^@/, '').toLowerCase();

/** Why a name cannot be used, in words a player understands (null = the shape is fine). */
export function usernameProblem(name: string): string | null {
  if (name.length < 3) return 'Use at least 3 characters.';
  if (name.length > 20) return 'Use at most 20 characters.';
  if (!/^[a-z0-9._]+$/.test(name)) return 'Use only letters, numbers, dots and underscores.';
  if (!USERNAME_RULE.test(name)) return 'Start and end with a letter or number.';
  if (/[._]{2}/.test(name)) return 'No two dots or underscores in a row.';
  if (RESERVED.has(name) || name.startsWith('saleeqa')) return 'That name is reserved. Try another.';
  return null;
}

/** Is this name free for this player? (Their own current name counts as free.) */
export async function usernameCheck(repos: Repos, raw: string, forUserId?: string): Promise<{ username: string; available: boolean; reason?: string }> {
  const username = normalizeUsername(raw);
  const problem = usernameProblem(username);
  if (problem) return { username, available: false, reason: problem };
  const owner = await repos.users.findOne({ username });
  if (owner && owner.id !== forUserId) return { username, available: false, reason: 'That username is taken. Try another.' };
  return { username, available: true };
}
