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
  Object.assign(config.preview, { project: 'test-project', apiKey: '', free: 1, dailyLimit: 10, globalDailyCap: 1000, friendsForCredit: 1, likesForCredit: 3, friendCreditCap: 5, requireVerifiedEmail: true, off: false });
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

/** Signs up without opening the confirmation link: signed in, email not confirmed yet. */
async function unconfirmed({ ref }: { ref?: string } = {}) {
  const agent = request.agent(app);
  const email = `pending${++n}@example.com`;
  await agent.post('/api/auth/signup').send({ email, password: 'correct-horse-9', name: `Pending ${n}`, username: usernameFor(email), consent: true, ...(ref ? { ref } : {}) }).expect(201);
  const id = (await agent.get('/api/me')).body.user.id as string;
  return { agent, email, id };
}

describe('email confirmation', () => {
  it('sign-up signs the player in; the link confirms the email', async () => {
    const { agent, email } = await unconfirmed();
    expect((await agent.get('/api/me')).body.user.emailVerified).toBe(false);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'correct-horse-9' })).status).toBe(200);
    expect(linkTo(email)!.pathname).toBe('/verify');
    await agent.post('/api/auth/verify').send({ token: linkTo(email)!.searchParams.get('token') }).expect(200);
    expect((await agent.get('/api/me')).body.user.emailVerified).toBe(true);
  });

  it('an unconfirmed player can publish but not preview until they confirm', async () => {
    const { agent, email } = await unconfirmed();
    expect(await status(agent)).toMatchObject({ verified: false, blocked: 'verify' });
    const blocked = await preview(agent);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatch(/confirm your email/i);
    await publishNew(agent);
    await agent.post('/api/auth/verify').send({ token: linkTo(email)!.searchParams.get('token') }).expect(200);
    expect(await status(agent)).toMatchObject({ verified: true, blocked: null, left: 1 });
  });

  it('a signed-in player can ask for a new link, and hears "we just sent one" if they ask again too soon', async () => {
    const { agent, email } = await unconfirmed();
    await request(app).post('/api/me/verify/resend').expect(401); // signed out
    const soon = await agent.post('/api/me/verify/resend');
    expect(soon.status).toBe(429); // sign-up just sent one
    expect(soon.body.error).toMatch(/we just sent one/i);
    const before = sentInTests.filter((m) => m.to === email).length;
    await repos.users.update({ email }, { verifySentAt: new Date(Date.now() - 2 * 60 * 1000).toISOString() });
    const ok = await agent.post('/api/me/verify/resend');
    expect(ok.status).toBe(200);
    expect(ok.body.devLink).toMatch(/\/verify\?token=/);
    expect(sentInTests.filter((m) => m.to === email).length).toBe(before + 1);
    expect((await agent.post('/api/me/verify/resend').send()).status).toBe(429); // and again right away
    // Once confirmed there is nothing to send.
    await agent.post('/api/auth/verify').send({ token: linkTo(email)!.searchParams.get('token') }).expect(200);
    expect((await agent.post('/api/me/verify/resend')).body).toMatchObject({ ok: true, verified: true });
  });

  it('an invited friend counts only with a confirmed email, also when they confirm after publishing', async () => {
    const host = await player();
    const friends = [await unconfirmed({ ref: host.id }), await unconfirmed({ ref: host.id }), await unconfirmed({ ref: host.id })];
    for (const f of friends) await publishNew(f.agent);
    expect(await status(host.agent)).toMatchObject({ friends: 0, earned: 0 });
    for (const f of friends) await f.agent.post('/api/auth/verify').send({ token: linkTo(f.email)!.searchParams.get('token') }).expect(200);
    expect(await status(host.agent)).toMatchObject({ friends: 3, earned: 3 });
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

  it('an older account that never confirmed stays signed in and is asked to confirm', async () => {
    await repos.users.insert({ id: 'legacy-1', email: 'legacy@example.com', name: 'Legacy', passwordHash: 'x', consentAt: '2026-11-01T00:00:00Z', createdAt: '2026-11-01T00:00:00Z' });
    const res = await request(app).get('/api/me').set('Cookie', `${COOKIE}=${signToken('legacy-1')}`);
    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(false);
  });
});

describe('preview budget', () => {
  it('one free preview for life, then a friendly message about likes and friends', async () => {
    const { agent } = await player();
    expect(await status(agent)).toMatchObject({ left: 1, free: 1, friendsToGo: 1 });
    expect((await preview(agent)).status).toBe(200);
    const second = await preview(agent);
    expect(second.status).toBe(429);
    expect(second.body.error).toMatch(/Get another when 3 people like one of your looks, or when a friend joins from your link and publishes a look/);
    expect(await status(agent)).toMatchObject({ left: 0, used: 1, blocked: 'used-up' });
  });

  it('each friend who joins from the share link earns +1 preview with their FIRST published look', async () => {
    const host = await player();
    await preview(host.agent);
    expect(await status(host.agent)).toMatchObject({ left: 0, blocked: 'used-up' });
    const friend = await player({ ref: host.id });
    expect((await repos.users.findOne({ id: friend.id }))!.referredBy).toBe(host.id);
    // Joining, or saving a draft, is not enough.
    await draft(friend.agent);
    expect(await status(host.agent)).toMatchObject({ friends: 0, earned: 0 });
    await publishNew(friend.agent);
    expect(await status(host.agent)).toMatchObject({ friends: 1, earned: 1, left: 1, blocked: null });
    // Once per friend: more looks from the same friend earn nothing more.
    await publishNew(friend.agent);
    expect(await status(host.agent)).toMatchObject({ friends: 1, earned: 1 });
    const news = (await host.agent.get('/api/notifications')).body.notifications as Array<{ type: string; text: string }>;
    expect(news.filter((x) => x.type === 'friend').map((x) => x.text)).toEqual(['Player joined from your link: +1 preview']);
  });

  it('friends earn at most 5 previews ever; the sixth friend still says thanks', async () => {
    const host = await player();
    for (let i = 0; i < 6; i++) await publishNew((await player({ ref: host.id })).agent);
    expect(await status(host.agent)).toMatchObject({ friends: 6, earned: 5, canEarn: false });
    const texts = ((await host.agent.get('/api/notifications')).body.notifications as Array<{ text: string }>).map((x) => x.text);
    expect(texts.filter((t) => t.endsWith('+1 preview'))).toHaveLength(5);
    expect(texts).toContain('Player joined from your link. Thanks for sharing Saleeqa!');
  });

  it('never for yourself', async () => {
    const me = await player();
    await repos.users.update({ id: me.id }, { referredBy: me.id });
    await publishNew(me.agent);
    expect(await status(me.agent)).toMatchObject({ friends: 0, earned: 0 });
    // And signing up with a made-up or empty ref links to nobody.
    const odd = await player({ ref: 'no-such-player' });
    expect((await repos.users.findOne({ id: odd.id }))!.referredBy).toBeUndefined();
  });

  it('with PREVIEW_FRIENDS_FOR_CREDIT=3, every 3 friends earn one more preview', async () => {
    config.preview.friendsForCredit = 3;
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
    expect(news).toMatch(/Player joined from your link: \+1 preview/);
    expect(news).toMatch(/Player joined from your link: 1 more friend for a free preview/);
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
    expect(await status(host.agent)).toMatchObject({ friends: 6, earned: 1, friendsToGo: 0, canEarn: false });
  });

  describe('previews earned from likes', () => {
  const like = (agent: ReturnType<typeof request.agent>, id: string, up: boolean | null = true) => agent.post(`/api/game/designs/${id}/vote`).send({ up }).expect(200);
  const publishedId = async (agent: ReturnType<typeof request.agent>) => {
    const id = await draft(agent);
    await agent.post(`/api/game/designs/${id}/publish`).expect(200);
    return id;
  };

  it('a look liked by 3 other confirmed players earns its designer one preview, once per look', async () => {
    const host = await player();
    await preview(host.agent);
    const look = await publishedId(host.agent);
    const fans = [await player(), await player(), await player(), await player()];
    await like(host.agent, look); // the designer's own like never counts
    await like(fans[0].agent, look);
    await like(fans[1].agent, look);
    expect(await status(host.agent)).toMatchObject({ earned: 0, left: 0, blocked: 'used-up' });
    await like(fans[2].agent, look);
    expect(await status(host.agent)).toMatchObject({ earned: 1, left: 1, blocked: null });
    expect(JSON.stringify((await host.agent.get('/api/notifications')).body)).toMatch(/You earned a free AI preview!/);
    // Taking a like back and liking again, or a fourth like, earns nothing more for this look.
    await like(fans[2].agent, look, null);
    await like(fans[2].agent, look);
    await like(fans[3].agent, look);
    expect((await status(host.agent)).earned).toBe(1);
    // Another look can earn one more.
    const second = await publishedId(host.agent);
    for (const f of fans.slice(0, 3)) await like(f.agent, second);
    expect((await status(host.agent)).earned).toBe(2);
  });

  it('likes from players who have not confirmed their email do not count', async () => {
    const host = await player();
    const look = await publishedId(host.agent);
    const pending = [await unconfirmed(), await unconfirmed()];
    await like((await player()).agent, look);
    for (const p of pending) await like(p.agent, look);
    expect((await status(host.agent)).earned).toBe(0);
  });

  it('likes and friends share one cap', async () => {
    config.preview.friendCreditCap = 1;
    const host = await player();
    for (let i = 0; i < 3; i++) await publishNew((await player({ ref: host.id })).agent);
    expect(await status(host.agent)).toMatchObject({ earned: 1, canEarn: false });
    const look = await publishedId(host.agent);
    for (let i = 0; i < 3; i++) await like((await player()).agent, look);
    expect((await status(host.agent)).earned).toBe(1);
  });
  });

  it('a daily cap across all players: “resting for today”', async () => {
    const before = await repos.events.count({ type: 'preview' });
    config.preview.globalDailyCap = before + 1;
    const a = await player();
    const b = await player();
    expect((await preview(a.agent)).status).toBe(200);
    const res = await preview(b.agent);
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/resting for today.*preview it tomorrow/i);
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
      expect(await status(agent)).toMatchObject({ blocked: 'off', message: 'Previews are resting for today. Publish your look now and preview it tomorrow.' });
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
