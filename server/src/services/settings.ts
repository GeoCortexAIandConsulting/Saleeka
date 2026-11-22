import type { Repos } from '../db/index.js';
import type { AppSettings } from '../types.js';

/**
 * The switches the admin changes in the admin portal (hidden brands and products, featured challenges,
 * preview limits). Read on every request, so they are kept in memory: loaded when the API starts,
 * replaced at once when the admin saves, and re-read every half minute (another server, or a manual edit).
 */
const DEFAULTS: AppSettings = { id: 'settings', hiddenBrandIds: [], hiddenProductIds: [], featuredIds: [], winners: {}, updatedAt: '' };

let current: AppSettings = DEFAULTS;

const withDefaults = (s: Partial<AppSettings> | null): AppSettings => ({ ...DEFAULTS, ...(s ?? {}), id: 'settings' });

/** The current settings (defaults until loadSettings has run). */
export const settings = (): AppSettings => current;

export async function loadSettings(repos: Repos): Promise<AppSettings> {
  current = withDefaults(await repos.settings.findOne({ id: 'settings' }));
  return current;
}

/** Saves a change; `undefined` clears a field (back to the server/.env value). */
export async function saveSettings(repos: Repos, patch: Partial<Omit<AppSettings, 'id' | 'updatedAt'>>): Promise<AppSettings> {
  const base = withDefaults(await repos.settings.findOne({ id: 'settings' }));
  const next = { ...base, ...patch, id: 'settings' as const, updatedAt: new Date().toISOString() };
  for (const k of Object.keys(next) as Array<keyof AppSettings>) if (next[k] === undefined) delete next[k];
  await repos.settings.upsert(next);
  current = next;
  return current;
}
