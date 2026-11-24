import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, HEALTH_DB_MS } from '../src/app.js';
import { createMemoryRepos } from '../src/db/index.js';
import { covered, INDEXES } from '../src/db/indexes.js';
import { RulesLlm } from '../src/services/llm.js';
import { settingWarnings } from '../src/settingsCheck.js';

const ROOT = join(__dirname, '..', '..');
const files = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (['node_modules', '.next', 'dist', '.catalog-cache'].includes(f)) return [];
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(f) ? [p] : [];
  });
/** Every setting a folder's code reads: process.env.NAME and envCount('NAME', …). */
const settingsRead = (dir: string) =>
  new Set(files(dir, /\.(ts|tsx|mjs)$/).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/process\.env\.([A-Z_]+)|envCount\('([A-Z_]+)'/g)].map((m) => m[1] ?? m[2])));

describe('render.yaml lists every setting the code reads', () => {
  const yaml = readFileSync(join(ROOT, 'render.yaml'), 'utf8');
  const [api, web] = yaml.split(/name: saleeqa-web/);
  const listed = (part: string) => new Set([...part.matchAll(/- key: ([A-Z_]+)/g)].map((m) => m[1]));

  it('the API', () => {
    // Set by Render or by the test runner, only for the catalog sync on GitHub, or only with LLM_PROVIDER=openai (documented there).
    const notNeeded = new Set(['PORT', 'VITEST', 'CATALOG_CACHE', 'LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY', 'LLM_STYLE_TIMEOUT_MS']);
    const missing = [...settingsRead(join(ROOT, 'server', 'src'))].filter((s) => !notNeeded.has(s) && !listed(api).has(s));
    expect(missing).toEqual([]);
    expect(api).toMatch(/plan: standard/); // at least 1 GB of memory
  });

  it('the website', () => {
    const missing = [...settingsRead(join(ROOT, 'web', 'app')), ...settingsRead(join(ROOT, 'web', 'lib')), ...settingsRead(join(ROOT, 'web', 'components'))].filter(
      (s) => s !== 'NODE_ENV' && !listed(web).has(s),
    );
    expect(missing).toEqual([]);
    expect(web).toMatch(/plan: starter/);
  });
});

describe('start-up warnings for missing optional settings', () => {
  it('one plain warning per missing setting, none when all are set', () => {
    const all = {
      MONGODB_URI: 'mongodb+srv://x',
      WEB_ORIGIN: 'https://saleeqa.pk',
      ADMIN_KEY: 'k',
      EMAIL_PROVIDER: 'brevo',
      EMAIL_API_KEY: 'x',
      EMAIL_FROM: 'Saleeqa <hi@saleeqa.pk>',
      GOOGLE_API_KEY: 'g',
      LAUNCH_ENDS: '2026-12-03',
    };
    expect(settingWarnings(all)).toEqual([]);
    const none = settingWarnings({});
    for (const name of ['MONGODB_URI', 'WEB_ORIGIN', 'ADMIN_KEY', 'EMAIL_PROVIDER', 'GOOGLE_API_KEY', 'LAUNCH_ENDS']) {
      expect(none.filter((w) => w.startsWith(`Setting ${name}:`)), name).toHaveLength(1);
    }
    expect(settingWarnings({ ...all, EMAIL_API_KEY: '' })).toEqual([expect.stringMatching(/^Setting EMAIL_API_KEY: not set, so brevo cannot send/)]);
    expect(settingWarnings({ ...all, PREVIEWS_OFF: 'true' })).toEqual([expect.stringMatching(/^Setting PREVIEWS_OFF: is true/)]);
  });
});

describe('database indexes for the busy lookups', () => {
  it('covers users by email, looks by challenge and date, events by type/user/brand/date, previews by key, and the rest', () => {
    const busy: Array<[string, string[]]> = [
      ['users', ['email']],
      ['users', ['verifyTokenHash']],
      ['users', ['resetTokenHash']],
      ['designs', ['challengeId', 'status', 'createdAt']],
      ['designs', ['status', 'createdAt']],
      ['designs', ['userId', 'createdAt']],
      ['events', ['type', 'at']],
      ['events', ['userId', 'type', 'at']],
      ['events', ['brandId', 'type', 'at']],
      ['previews', ['key']],
      ['products', ['inStock']],
      ['products', ['brandId', 'inStock']],
      ['comments', ['designId', 'at']],
      ['comments', ['parentId']],
      ['notifications', ['userId', 'at']],
      ['reports', ['status', 'at']],
      ['reports', ['target', 'targetId', 'status']],
      ['challenges', ['key']],
    ];
    for (const [collection, fields] of busy) expect(covered(collection, fields), `${collection} by ${fields.join(', ')}`).toBe(true);
    // Unique where it must be.
    expect(INDEXES.find((i) => i.collection === 'users' && 'email' in i.keys)?.options?.unique).toBe(true);
    expect(INDEXES.find((i) => i.collection === 'challenges' && 'key' in i.keys)?.options?.unique).toBe(true);
  });
});

describe('/api/health', () => {
  it('is ok when the database answers', async () => {
    const app = await createApp({ repos: createMemoryRepos(), llm: new RulesLlm(), rateLimit: false });
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ ok: true, db: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('says 503 when the database fails, or does not answer within 2 seconds', async () => {
    const repos = createMemoryRepos();
    const app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
    repos.ping = () => Promise.reject(new Error('down'));
    expect((await request(app).get('/api/health').expect(503)).body).toMatchObject({ ok: false, db: 'error' });
    repos.ping = () => new Promise(() => {}); // never answers
    const started = Date.now();
    expect((await request(app).get('/api/health').expect(503)).body).toMatchObject({ ok: false, db: 'timeout' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(HEALTH_DB_MS - 50);
    expect(Date.now() - started).toBeLessThan(HEALTH_DB_MS + 1500);
  }, 10_000);
});
