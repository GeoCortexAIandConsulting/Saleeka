import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('google-auth-library', () => ({ GoogleAuth: class { getAccessToken = async () => 'test-token'; } }));

import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { RulesLlm } from '../src/services/llm.js';
import { sendEmail, sentInTests } from '../src/services/email.js';
import { emailKey } from '../src/services/preview.js';
import { COOKIE, signToken } from '../src/middleware/auth.js';
import { linkTo, signUp, usernameFor } from './helpers.js';

let repos: Repos;
let app: Awaited<ReturnType<typeof createApp>>;
const realFetch = globalThis.fetch;
const saved = { ...config.preview };
let n = 0;
/** Milliseconds the fake Gemini takes to answer (to test two previews at once). */
let geminiDelay = 0;

beforeAll(async () => {
  repos = createMemoryRepos();
  app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
  for (const p of await repos.products.find()) await repos.products.update({ id: p.id }, { images: [`https://cdn.example/${p.id}.jpg`] });
  // A fake Gemini: every call is a new (tiny) image. Never touches Google.
  globalThis.fetch = vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    if (u.startsWith('https://cdn.example/')) return new Response(Buffer.from('photo'), { headers: { 'content-type': 'image/jpeg' } });
    if (u.includes('aiplatform.googleapis.com')) {
      if (geminiDelay) await new Promise((r) => setTimeout(r, geminiDelay));
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'cG5n' } }] } }] });
    }
    return realFetch(url, init);
  }) as typeof fetch;
});

beforeEach(() => {
  Object.assign(config.preview, { project: 'test-project', apiKey: '', free: 1, dailyLimit: 10, globalDailyCap: 1000, friendsForCredit: 3, friendCreditCap: 5, requireVerifiedEmail: true, off: false });
  geminiDelay = 0;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  Object.assign(config.preview, saved);
});

/** A player with a finished account (email confirmed), optionally invited by another player. */
async function player({ ref }: { ref?: string } = {}) {
  const agent = request.agent(app);
  const email = `budget${++n}@example.com`;
  await signUp(agent, { email, name: `Player ${n}`, ...(ref ? { ref } : {}) });
  const id = (await agent.get('/api/me')).body.user.id as string;
  return { agent, email, id };
}

/** A new draft look each time (a different pair of shoes), so every preview is a new image. */
let shoe = 0;
async function draft(agent: ReturnType<typeof request.agent>) {
  const { items } = (await agent.get('/api/game/challenges/seed-university-easy/items')).body;
  const main = items.main[0];
  const pick = [{ slot: 'main', productId: main.id }, { slot: 'footwear', productId: items.footwear[shoe++ % items.footwear.length].id }];
  if (!main.includesBottom) pick.push({ slot: 'bottom', productId: items.bottom[shoe % items.bottom.length].id });
  return (await agent.post('/api/game/designs').send({ challengeId: 'seed-university-easy', items: pick, draft: true }).expect(201)).body.design.id as string;
}
const preview = async (agent: ReturnType<typeof request.agent>) => agent.post(`/api/game/designs/${await draft(agent)}/preview`);
const publishNew = async (agent: ReturnType<typeof request.agent>) => agent.post(`/api/game/designs/${await draft(agent)}/publish`).expect(200);
const status = async (agent: ReturnType<typeof request.agent>) => (await agent.get('/api/game/preview')).body.status;

describe('email confirmation finishes the account', () => {
  it('the account cannot be used until the link is opened; the link signs the player in', async () => {
    const email = `new${++n}@example.com`;
    const visitor = request.agent(app);
    const res = await visitor.post('/api/auth/signup').send({ email, password: 'correct-horse-9', name: 'New', username: usernameFor(email), consent: true });
    expect(res.status).toBe(201);
    expect((await visitor.get('/api/me')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'correct-horse-9' })).status).toBe(403);
    expect(linkTo(email)!.pathname).toBe('/verify');
    await visitor.post('/api/auth/verify').send({ token: linkTo(email)!.searchParams.get('token') }).expect(200);
    expect((await visitor.get('/api/me')).body.user.emailVerified).toBe(true);
    // From now on, a normal sign-in.
    expect((await request(app).post('/api/auth/login').send({ email, password: 'correct-horse-9' })).status).toBe(200);
  });

  it('a link works once, a wrong one is refused, and only a hash of it is stored', async () => {
    const email = `once${++n}@example.com`;
    await request(app).post('/api/auth/signup').send({ email, password: 'correct-horse-9', name: 'Once', username: usernameFor(email), consent: true }).expect(201);
    const token = linkTo(email)!.searchParams.get('token')!;
    const user = (await repos.users.findOne({ email }))!;
    expect(user.verifyTokenHash).toBeTruthy();
    expect(JSON.stringify(user)).not.toContain(token);
    await request(app).post('/api/auth/verify').send({ token: 'x'.repeat(43) }).expect(400);
    await request(app).post('/api/auth/verify').send({ token }).expect(200);
    await request(app).post('/api/auth/verify').send({ token }).expect(400);
  });

  it('a new link can be asked for by email, but not more than once a minute', async () => {
    const email = `again${++n}@example.com`;
    await request(app).post('/api/auth/signup').send({ email, password: 'correct-horse-9', name: 'Again', username: usernameFor(email), consent: true }).expect(201);
    const before = sentInTests.filter((m) => m.to === email).length;
    await request(app).post('/api/auth/verify/resend').send({ email }).expect(200); // sign-up just sent one
    expect(sentInTests.filter((m) => m.to === email).length).toBe(before);
    await repos.users.update({ email }, { verifySentAt: new Date(Date.now() - 2 * 60 * 1000).toISOString() });
    await request(app).post('/api/auth/verify/resend').send({ email }).expect(200);
    expect(sentInTests.filter((m) => m.to === email).length).toBe(before + 1);
  });

  it('a link stops working after 7 days', async () => {
    const email = `old${++n}@example.com`;
    await request(app).post('/api/auth/signup').send({ email, password: 'correct-horse-9', name: 'Old', username: usernameFor(email), consent: true }).expect(201);
    await repos.users.update({ email }, { verifySentAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() });
    const res = await request(app).post('/api/auth/verify').send({ token: linkTo(email)!.searchParams.get('token') });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/);
  });

  it('an older account that never confirmed is signed out and asked to confirm once', async () => {
    await repos.users.insert({ id: 'legacy-1', email: 'legacy@example.com', name: 'Legacy', passwordHash: 'x', consentAt: '2026-11-01T00:00:00Z', createdAt: '2026-11-01T00:00:00Z' });
    const res = await request(app).get('/api/me').set('Cookie', `${COOKIE}=${signToken('legacy-1')}`);
    expect(res.status).toBe(401);
    expect(String(res.headers['set-cookie'])).toContain(`${COOKIE}=;`);
  });
});

describe('preview budget', () => {
  it('one free preview for life, then a friendly message about inviting friends', async () => {
    const { agent } = await player();
    expect(await status(agent)).toMatchObject({ left: 1, free: 1, friendsToGo: 3 });
    expect((await preview(agent)).status).toBe(200);
    const second = await preview(agent);
    expect(second.status).toBe(429);
    expect(second.body.error).toMatch(/3 friends who join from your share link/);
    expect(await status(agent)).toMatchObject({ left: 0, used: 1, blocked: 'used-up' });
  });

  it('every 3 friends who join from the share link and publish a look earn one more preview', async () => {
    const host = await player();
    await preview(host.agent);
    const friends = [await player({ ref: host.id }), await player({ ref: host.id })];
    // Joining is not enough: a friend counts when they publish their first look, and only once.
    for (const f of friends) {
      await publishNew(f.agent);
      await publishNew(f.agent);
    }
    expect(await status(host.agent)).toMatchObject({ friends: 2, friendsToGo: 1, earned: 0, left: 0 });
    const third = await player({ ref: host.id });
    expect((await status(host.agent)).friends).toBe(2);
    await publishNew(third.agent);
    expect(await status(host.agent)).toMatchObject({ friends: 3, friendsToGo: 3, earned: 1, left: 1, blocked: null });
    expect((await preview(host.agent)).status).toBe(200);

    const news = JSON.stringify((await host.agent.get('/api/notifications')).body);
    expect(news).toMatch(/You earned a free AI preview!/);
    expect(news).toMatch(/1 more friend for a free AI preview/);
  });

  it('a share link from nobody, or a friend who never publishes, earns nothing', async () => {
    const host = await player();
    await player({ ref: 'no-such-player' });
    const quiet = await player({ ref: host.id });
    expect((await repos.users.findOne({ id: quiet.id }))!.referredBy).toBe(host.id);
    expect(await status(host.agent)).toMatchObject({ friends: 0, earned: 0 });
  });

  it('previews earned from friends stop at the cap', async () => {
    config.preview.friendCreditCap = 1;
    const host = await player();
    for (let i = 0; i < 6; i++) await publishNew((await player({ ref: host.id })).agent);
    expect(await status(host.agent)).toMatchObject({ friends: 6, earned: 1, friendsToGo: 0 });
  });

  it('a daily cap across all players: “come back tomorrow”', async () => {
    const before = await repos.events.count({ type: 'preview' });
    config.preview.globalDailyCap = before + 1;
    const a = await player();
    const b = await player();
    expect((await preview(a.agent)).status).toBe(200);
    const res = await preview(b.agent);
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/come back tomorrow/i);
  });

  it('the per-player daily limit still applies', async () => {
    config.preview.free = 10;
    config.preview.dailyLimit = 1;
    const { agent } = await player();
    expect((await preview(agent)).status).toBe(200);
    const res = await preview(agent);
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/today/);
  });

  it('deleting the account and signing up again with the same email does not bring the free preview back', async () => {
    const { agent, email } = await player();
    expect((await preview(agent)).status).toBe(200);
    await agent.delete('/api/me').expect(200);
    expect(await repos.previewUsage.findOne({ id: emailKey(email) })).toMatchObject({ used: 1 });
    expect(JSON.stringify(await repos.previewUsage.find())).not.toContain(email);

    const again = request.agent(app);
    await signUp(again, { email, name: 'Again' });
    expect(await status(again)).toMatchObject({ used: 1, left: 0, blocked: 'used-up' });
  });

  it('PREVIEWS_OFF, or a limit of 0, rests previews for everyone with one friendly message', async () => {
    const { agent } = await player();
    for (const off of [{ off: true }, { globalDailyCap: 0 }, { dailyLimit: 0 }]) {
      Object.assign(config.preview, { off: false, globalDailyCap: 1000, dailyLimit: 10 }, off);
      expect(await status(agent)).toMatchObject({ blocked: 'off', message: 'Previews are resting for today. Publish your look now.' });
      const res = await preview(agent);
      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/resting/);
    }
  });

  it('a second preview while the first is still being made is refused kindly', async () => {
    config.preview.free = 5;
    geminiDelay = 150;
    const { agent } = await player();
    // Two quick taps on the same look (a player has one draft per challenge).
    const a = await draft(agent);
    const [r1, r2] = await Promise.all([agent.post(`/api/game/designs/${a}/preview`), agent.post(`/api/game/designs/${a}/preview`)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 429]);
    expect([r1, r2].find((r) => r.status === 429)!.body.error).toMatch(/still being made/);
    // Once it is done, the next one works.
    expect((await preview(agent)).status).toBe(200);
  });
});

describe('settings', () => {
  it('reads 0 from the environment as 0, and empty or nonsense as the default', async () => {
    const { envCount } = await import('../src/config.js');
    const set = (v: string | undefined) => (v === undefined ? delete process.env.TEST_COUNT : (process.env.TEST_COUNT = v));
    set('0');
    expect(envCount('TEST_COUNT', 300)).toBe(0);
    set('25');
    expect(envCount('TEST_COUNT', 300)).toBe(25);
    for (const v of ['', ' ', 'abc', '-3', undefined]) {
      set(v);
      expect(envCount('TEST_COUNT', 300)).toBe(300);
    }
    set(undefined);
  });

  it('on a live server, an email that cannot be sent is never printed (it holds a sign-in link)', async () => {
    const was = { vitest: process.env.VITEST, prod: config.isProd, email: { ...config.email } };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      delete process.env.VITEST;
      Object.assign(config, { isProd: true });
      Object.assign(config.email, { provider: 'log', apiKey: '' });
      await sendEmail({ to: 'someone@example.com', subject: 'Reset your password', text: 'https://saleeqa.example/reset?token=SECRET', html: '' });
      const printed = [...log.mock.calls, ...warn.mock.calls].flat().join(' ');
      expect(printed).not.toContain('SECRET');
      expect(printed).not.toContain('someone@example.com');
      expect(printed).toMatch(/not set up/);
    } finally {
      process.env.VITEST = was.vitest;
      Object.assign(config, { isProd: was.prod });
      Object.assign(config.email, was.email);
      log.mockRestore();
      warn.mockRestore();
    }
  });
});

describe('forgot password', () => {
  it('sends a reset link that sets a new password once, and signs the player in', async () => {
    const { email } = await player();
    const guest = request.agent(app);
    await guest.post('/api/auth/forgot').send({ email }).expect(200);
    const link = linkTo(email)!;
    expect(link.pathname).toBe('/reset');
    const token = link.searchParams.get('token');
    await guest.post('/api/auth/reset').send({ token, password: 'a-new-password-1' }).expect(200);
    expect((await guest.get('/api/me')).status).toBe(200);
    await request(app).post('/api/auth/login').send({ email, password: 'correct-horse-9' }).expect(401);
    await request(app).post('/api/auth/login').send({ email, password: 'a-new-password-1' }).expect(200);
    await guest.post('/api/auth/reset').send({ token, password: 'another-pass-2' }).expect(400);
  });

  it('answers the same for an unknown email, and sends nothing', async () => {
    const count = sentInTests.length;
    await request(app).post('/api/auth/forgot').send({ email: 'nobody@example.com' }).expect(200);
    expect(sentInTests.length).toBe(count);
  });

  it('an hour-old link no longer works', async () => {
    const { email, id } = await player();
    await request(app).post('/api/auth/forgot').send({ email }).expect(200);
    const token = linkTo(email)!.searchParams.get('token');
    await repos.users.update({ id }, { resetExpiresAt: new Date(Date.now() - 1000).toISOString() });
    await request(app).post('/api/auth/reset').send({ token, password: 'a-new-password-1' }).expect(400);
  });
});
