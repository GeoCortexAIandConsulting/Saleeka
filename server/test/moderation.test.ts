import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { BRANDS_TTL_MS, disabledBrands } from '../src/services/brands.js';
import { RulesLlm } from '../src/services/llm.js';
import { withUtm } from '../src/services/utm.js';
import { signUp } from './helpers.js';

type Agent = ReturnType<typeof request.agent>;
type P = { id: string; brandId: string; price: number; includesBottom?: boolean; includesDupatta?: boolean };

let repos: Repos;
let app: Awaited<ReturnType<typeof createApp>>;
const savedKey = config.adminKey;
let n = 0;
const CHALLENGE = 'seed-mehndi-mustard';

beforeAll(async () => {
  config.adminKey = 'test-admin';
  repos = createMemoryRepos();
  app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
});
afterAll(() => {
  config.adminKey = savedKey;
});

const admin = <T extends { set: (k: string, v: string) => T }>(r: T) => r.set('x-admin-key', 'test-admin');
async function player(): Promise<Agent> {
  const agent = request.agent(app);
  await signUp(agent, { email: `mod${++n}@example.com`, name: `Mod ${n}` });
  return agent;
}
/** Publishes a complete look for the Mehndi challenge; returns its id and pieces. */
async function publishLook(agent: Agent, avoidBrand?: string) {
  const { items } = (await agent.get(`/api/game/challenges/${CHALLENGE}/items`)).body as { items: Record<string, P[]> };
  const pickOf = (slot: string) => items[slot].filter((p) => p.brandId !== avoidBrand).sort((a, b) => a.price - b.price)[0] ?? items[slot][0];
  const main = pickOf('main');
  const pick = [{ slot: 'main', productId: main.id }, { slot: 'footwear', productId: pickOf('footwear').id }];
  if (!main.includesBottom) pick.push({ slot: 'bottom', productId: pickOf('bottom').id });
  if (!main.includesDupatta) pick.push({ slot: 'dupatta', productId: pickOf('dupatta').id });
  const res = await agent.post('/api/game/designs').send({ challengeId: CHALLENGE, items: pick });
  expect(res.status, res.body.error).toBe(201);
  return { id: res.body.design.id as string, main, pick };
}

describe('click-outs carry UTM tags', () => {
  it('adds utm_source, utm_medium and utm_campaign, keeping the link’s own query and anchor', () => {
    const out = new URL(withUtm('https://shop.example/p/1?variant=7&utm_source=old#reviews', 'mehndi|any|3|dupatta'));
    expect(out.searchParams.get('variant')).toBe('7');
    expect(out.searchParams.getAll('utm_source')).toEqual(['saleeqa']);
    expect(out.searchParams.get('utm_medium')).toBe('referral');
    expect(out.searchParams.get('utm_campaign')).toBe('mehndi|any|3|dupatta');
    expect(out.hash).toBe('#reviews');
    expect(withUtm('not a link', 'look')).toBe('not a link');
  });

  it('/api/go uses the look’s challenge key as the campaign, else "look", and counts the click', async () => {
    const agent = await player();
    const look = await publishLook(agent);
    await repos.products.update({ id: look.main.id }, { url: 'https://shop.example/p/1?variant=7' });
    const res = await agent.get(`/api/go/${look.main.id}?look=${look.id}`).expect(302);
    const to = new URL(res.headers.location);
    const key = (await repos.challenges.findOne({ id: CHALLENGE }))!.key;
    expect(to.origin + to.pathname).toBe('https://shop.example/p/1');
    expect(Object.fromEntries(to.searchParams)).toEqual({ variant: '7', utm_source: 'saleeqa', utm_medium: 'referral', utm_campaign: key });
    const plain = new URL((await request(app).get(`/api/go/${look.main.id}`).expect(302)).headers.location);
    expect(plain.searchParams.get('utm_campaign')).toBe('look');
    expect(await repos.events.count({ type: 'click', productId: look.main.id })).toBe(2);
  });
});

describe('brand switch', () => {
  it('admin routes need the admin key', async () => {
    await request(app).get('/api/admin/brands').expect(403);
    await request(app).get('/api/admin/brands').set('x-admin-key', 'wrong').expect(403);
    const { brands } = (await admin(request(app).get('/api/admin/brands')).expect(200)).body;
    expect(brands.length).toBeGreaterThan(1);
    expect(brands.every((b: { enabled: boolean }) => b.enabled)).toBe(true);
  });

  it('a switched-off brand disappears from Studio, pieces, the demo, look pages and click-outs, and comes back', async () => {
    const agent = await player();
    const look = await publishLook(agent);
    const brand = look.main.brandId;
    const has = (body: unknown) => JSON.stringify(body).includes(`"brandId":"${brand}"`);
    expect(has((await agent.get(`/api/game/challenges/${CHALLENGE}/items`)).body)).toBe(true);

    await admin(request(app).patch(`/api/admin/brands/${brand}`)).send({ enabled: false }).expect(200);
    expect(has((await agent.get(`/api/game/challenges/${CHALLENGE}/items`)).body)).toBe(false);
    expect(has((await agent.get(`/api/game/challenges/${CHALLENGE}/pieces?slot=main`)).body)).toBe(false);
    expect(has((await request(app).get('/api/demo/look')).body)).toBe(false);
    expect(has((await request(app).get(`/api/feed/${look.id}`)).body)).toBe(false);
    expect((await request(app).get('/api/brands')).body.brands.map((b: { id: string }) => b.id)).not.toContain(brand);
    await request(app).get(`/api/go/${look.main.id}`).expect(404);
    // Its pieces can no longer go into a new look.
    const again = await agent.post('/api/game/designs').send({ challengeId: CHALLENGE, items: look.pick });
    expect(again.status).toBe(400);
    expect((await admin(request(app).get('/api/admin/brands')).expect(200)).body.brands.find((b: { id: string }) => b.id === brand).enabled).toBe(false);

    await admin(request(app).patch(`/api/admin/brands/${brand}`)).send({ enabled: true }).expect(200);
    expect(has((await agent.get(`/api/game/challenges/${CHALLENGE}/items`)).body)).toBe(true);
    expect(has((await request(app).get(`/api/feed/${look.id}`)).body)).toBe(true);
    await admin(request(app).patch('/api/admin/brands/no-such-brand')).send({ enabled: false }).expect(404);
  });

  it('other servers see a switch within a minute (the list is re-read once it is a minute old)', async () => {
    const own = createMemoryRepos();
    await own.brands.insert({ id: 'b1', name: 'One', tier: 'mid' });
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      expect((await disabledBrands(own)).size).toBe(0);
      await own.brands.update({ id: 'b1' }, { enabled: false }); // switched off by another server
      expect((await disabledBrands(own)).size).toBe(0); // still the copy read a moment ago
      vi.setSystemTime(Date.now() + BRANDS_TTL_MS + 1);
      expect([...(await disabledBrands(own))]).toEqual(['b1']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('reports', () => {
  it('a signed-in player reports a look or a comment with a reason, once per thing', async () => {
    const designer = await player();
    const reporter = await player();
    const look = await publishLook(designer);
    await request(app).post('/api/reports').send({ target: 'look', id: look.id, reason: 'spam' }).expect(401);
    await reporter.post('/api/reports').send({ target: 'look', id: look.id, reason: 'not a reason' }).expect(400);
    await designer.post('/api/reports').send({ target: 'look', id: look.id, reason: 'spam' }).expect(400); // their own
    await reporter.post('/api/reports').send({ target: 'look', id: 'no-such-look', reason: 'spam' }).expect(404);
    await reporter.post('/api/reports').send({ target: 'look', id: look.id, reason: 'spam' }).expect(201);
    await reporter.post('/api/reports').send({ target: 'look', id: look.id, reason: 'offensive', note: 'Rude words in the photo' }).expect(201);
    const mine = await repos.reports.find({ targetId: look.id });
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ reason: 'offensive', note: 'Rude words in the photo', status: 'open' });

    await designer.post(`/api/game/designs/${look.id}/comments`).send({ text: 'Buy followers at spam.example' }).expect(201);
    const comment = (await repos.comments.findOne({ designId: look.id, text: 'Buy followers at spam.example' }))!;
    await reporter.post('/api/reports').send({ target: 'comment', id: comment.id, reason: 'spam' }).expect(201);
    expect(await repos.reports.count({ target: 'comment', targetId: comment.id })).toBe(1);
  });

  it('is rate limited per player', async () => {
    const own = createMemoryRepos();
    const limited = await createApp({ repos: own, llm: new RulesLlm(), rateLimit: true });
    const designer = request.agent(limited);
    const reporter = request.agent(limited);
    await signUp(designer, { email: 'rl-designer@example.com', name: 'Designer' });
    await signUp(reporter, { email: 'rl-reporter@example.com', name: 'Reporter' });
    const { items } = (await designer.get(`/api/game/challenges/${CHALLENGE}/items`)).body as { items: Record<string, P[]> };
    const main = items.main[0];
    const pick = [{ slot: 'main', productId: main.id }, { slot: 'footwear', productId: items.footwear[0].id }];
    if (!main.includesBottom) pick.push({ slot: 'bottom', productId: items.bottom[0].id });
    if (!main.includesDupatta) pick.push({ slot: 'dupatta', productId: items.dupatta[0].id });
    const id = (await designer.post('/api/game/designs').send({ challengeId: CHALLENGE, items: pick }).expect(201)).body.design.id;
    for (let i = 0; i < 10; i++) await reporter.post('/api/reports').send({ target: 'look', id, reason: 'spam' }).expect(201);
    const over = await reporter.post('/api/reports').send({ target: 'look', id, reason: 'spam' });
    expect(over.status).toBe(429);
    expect(over.body.error).toMatch(/try again in a little while/);
  });

  it('admins list open reports, hide a look (and put it back), delete a comment, and close a report', async () => {
    const designer = await player();
    const a = await player();
    const b = await player();
    const look = await publishLook(designer);
    await a.post('/api/reports').send({ target: 'look', id: look.id, reason: 'inappropriate' }).expect(201);
    await b.post('/api/reports').send({ target: 'look', id: look.id, reason: 'offensive' }).expect(201);
    await request(app).get('/api/admin/reports').expect(403);
    const open = (await admin(request(app).get('/api/admin/reports')).expect(200)).body.reports.filter((r: { look: { id: string } }) => r.look?.id === look.id);
    expect(open).toHaveLength(2);
    expect(open[0]).toMatchObject({ target: 'look', status: 'open', reports: 2, look: { id: look.id, hidden: false } });

    // Hidden: gone from its page, the Runway and the designer's profile; the reports close.
    await admin(request(app).post(`/api/admin/looks/${look.id}/hide`)).send({ hidden: true }).expect(200);
    await request(app).get(`/api/feed/${look.id}`).expect(404);
    expect((await a.get('/api/feed')).body.looks.map((l: { id: string }) => l.id)).not.toContain(look.id);
    const designerId = (await repos.designs.findOne({ id: look.id }))!.userId;
    expect((await a.get(`/api/players/${designerId}`)).body.looks?.map((l: { id: string }) => l.id) ?? []).not.toContain(look.id);
    await a.post('/api/reports').send({ target: 'look', id: look.id, reason: 'spam' }).expect(404);
    expect(await repos.reports.count({ targetId: look.id, status: 'open' })).toBe(0);
    expect((await repos.reports.find({ targetId: look.id })).every((r) => r.outcome === 'hidden')).toBe(true);
    // A new draft by the designer never deletes the hidden look.
    await publishLook(designer);
    expect(await repos.designs.findOne({ id: look.id })).toBeTruthy();
    await admin(request(app).post(`/api/admin/looks/${look.id}/hide`)).send({ hidden: false }).expect(200);
    await request(app).get(`/api/feed/${look.id}`).expect(200);

    // A comment: deleted with its replies; its report closes.
    await designer.post(`/api/game/designs/${look.id}/comments`).send({ text: 'Rude remark' }).expect(201);
    const comment = (await repos.comments.findOne({ designId: look.id, text: 'Rude remark' }))!;
    await a.post(`/api/game/designs/${look.id}/comments`).send({ text: 'A reply', parentId: comment.id });
    await b.post('/api/reports').send({ target: 'comment', id: comment.id, reason: 'offensive' }).expect(201);
    const listed = (await admin(request(app).get('/api/admin/reports')).expect(200)).body.reports.find((r: { targetId: string }) => r.targetId === comment.id);
    expect(listed).toMatchObject({ target: 'comment', comment: { text: 'Rude remark' } });
    await admin(request(app).delete(`/api/admin/comments/${comment.id}`)).expect(200);
    expect(await repos.comments.count({ designId: look.id })).toBe(0);
    expect((await repos.reports.findOne({ targetId: comment.id }))).toMatchObject({ status: 'closed', outcome: 'deleted' });

    // Closing with no action.
    const other = await publishLook(designer);
    await a.post('/api/reports').send({ target: 'look', id: other.id, reason: 'other', note: 'Not sure' }).expect(201);
    const report = (await repos.reports.findOne({ targetId: other.id }))!;
    await admin(request(app).post(`/api/admin/reports/${encodeURIComponent(report.id)}/close`)).expect(200);
    expect(await repos.reports.findOne({ id: report.id })).toMatchObject({ status: 'closed', outcome: 'no-action' });
    const closed = (await admin(request(app).get('/api/admin/reports?status=closed')).expect(200)).body.reports;
    expect(closed.map((r: { id: string }) => r.id)).toContain(report.id);
    await request(app).get(`/api/feed/${other.id}`).expect(200); // still on show
  });

  it('deleting your account deletes your reports', async () => {
    const designer = await player();
    const reporter = await player();
    const look = await publishLook(designer);
    await reporter.post('/api/reports').send({ target: 'look', id: look.id, reason: 'spam' }).expect(201);
    await reporter.delete('/api/me').expect(200);
    expect(await repos.reports.count({ targetId: look.id })).toBe(0);
  });
});
