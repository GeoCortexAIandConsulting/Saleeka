import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { RulesLlm } from '../src/services/llm.js';
import { signUp } from './helpers.js';

let repos: Repos;
let app: Awaited<ReturnType<typeof createApp>>;
const C = 'seed-mehndi-mustard';

beforeAll(async () => {
  repos = createMemoryRepos();
  app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
});

let n = 0;
async function player(name: string) {
  const agent = request.agent(app);
  const email = `admin-test${++n}@example.com`;
  await signUp(agent, { email, name });
  const me = await agent.get('/api/me');
  return { agent, email, id: me.body.user.id as string };
}

async function admin() {
  const agent = request.agent(app);
  expect((await agent.post('/api/admin/login').send({ username: 'boss', password: 'test-admin-password-123' })).status).toBe(200);
  return agent;
}

async function publishLook(agent: ReturnType<typeof request.agent>, challengeId = C) {
  const { body } = await agent.get(`/api/game/challenges/${challengeId}/items`);
  const cheapest = (slot: string) => [...body.items[slot]].sort((a: any, b: any) => a.price - b.price)[0];
  const main = cheapest('main');
  const items = [{ slot: 'main', productId: main.id }];
  if (!main.includesBottom) items.push({ slot: 'bottom', productId: cheapest('bottom').id });
  if (!main.includesDupatta) items.push({ slot: 'dupatta', productId: cheapest('dupatta').id });
  items.push({ slot: 'footwear', productId: cheapest('footwear').id });
  const res = await agent.post('/api/game/designs').send({ challengeId, items });
  expect(res.status).toBe(201);
  return res.body.design.id as string;
}

describe('admin sign-in', () => {
  it('needs the admin username and password, separate from player accounts', async () => {
    expect((await request(app).get('/api/admin/overview')).status).toBe(401);
    expect((await request(app).get('/api/admin/session')).body).toEqual({ configured: true, signedIn: false });
    expect((await request(app).post('/api/admin/login').send({ username: 'boss', password: 'wrong' })).status).toBe(401);
    expect((await request(app).post('/api/admin/login').send({ username: 'nobody', password: 'test-admin-password-123' })).status).toBe(401);

    // A player's session is not an admin session...
    const { agent } = await player('Sara');
    expect((await agent.get('/api/admin/users')).status).toBe(401);

    // ...and the admin session is not a player session.
    const boss = await admin();
    expect((await boss.get('/api/admin/session')).body.signedIn).toBe(true);
    expect((await boss.get('/api/admin/overview')).status).toBe(200);
    expect((await boss.get('/api/me')).status).toBe(401);

    await boss.post('/api/admin/logout').send({});
    expect((await boss.get('/api/admin/overview')).status).toBe(401);
  });
});

describe('players', () => {
  it('lists players with their email and numbers, and downloads them as a spreadsheet', async () => {
    const { email } = await player('Hina');
    const boss = await admin();
    const list = await boss.get('/api/admin/users').query({ search: email });
    expect(list.body.users).toHaveLength(1);
    expect(list.body.users[0]).toMatchObject({ email, verified: true, looks: 0, suspended: false });
    expect(list.body.users[0].passwordHash).toBeUndefined();
    const csv = await boss.get('/api/admin/users.csv');
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain(email);
  });

  it('suspends a player at once (open session and sign-in), and lets them back in', async () => {
    const { agent, email, id } = await player('Zoya');
    const boss = await admin();
    expect((await boss.post(`/api/admin/users/${id}`).send({ action: 'suspend' })).body.user.suspended).toBe(true);
    expect((await agent.get('/api/me')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'correct-horse-9' })).status).toBe(403);

    await boss.post(`/api/admin/users/${id}`).send({ action: 'unsuspend' });
    expect((await request(app).post('/api/auth/login').send({ email, password: 'correct-horse-9' })).status).toBe(200);
  });

  it('gives a player extra previews, and deletes an account with everything in it', async () => {
    const { agent, id } = await player('Maha');
    await publishLook(agent);
    const boss = await admin();
    const given = await boss.post(`/api/admin/users/${id}`).send({ action: 'credits', credits: 3 });
    expect(given.body.previews.earned).toBe(3);
    expect(given.body.stats.looks).toBe(1);

    expect((await boss.delete(`/api/admin/users/${id}`)).status).toBe(200);
    expect(await repos.users.findOne({ id })).toBeNull();
    expect(await repos.designs.count({ userId: id })).toBe(0);
    expect((await agent.get('/api/me')).status).toBe(401);
  });
});

describe('looks and comments', () => {
  it('hides a look from the Runway and brings it back; deletes looks and comments', async () => {
    const a = await player('Ayesha');
    const b = await player('Bilal');
    const look = await publishLook(a.agent);
    const said = await b.agent.post(`/api/game/designs/${look}/comments`).send({ text: 'Lovely colours' });
    expect(said.status).toBe(201);
    const boss = await admin();

    await boss.post(`/api/admin/looks/${look}`).send({ hidden: true });
    expect((await b.agent.get(`/api/feed/${look}`)).status).toBe(404);
    expect((await b.agent.get('/api/feed')).body.looks.some((l: any) => l.id === look)).toBe(false);
    expect((await boss.get('/api/admin/looks').query({ filter: 'hidden' })).body.looks.map((l: any) => l.id)).toContain(look);

    // A hidden look is not a draft: the designer saving a new draft never deletes it.
    const { body } = await a.agent.get(`/api/game/challenges/${C}/items`);
    const main = [...body.items.main].sort((x: any, y: any) => x.price - y.price)[0];
    await a.agent.post('/api/game/designs').send({ challengeId: C, items: [{ slot: 'main', productId: main.id }], draft: true });
    expect(await repos.designs.findOne({ id: look })).not.toBeNull();

    await boss.post(`/api/admin/looks/${look}`).send({ hidden: false });
    expect((await b.agent.get(`/api/feed/${look}`)).status).toBe(200);

    const comments = await boss.get('/api/admin/comments').query({ search: 'lovely' });
    expect(comments.body.comments[0]).toMatchObject({ text: 'Lovely colours', lookId: look });
    await boss.delete(`/api/admin/comments/${comments.body.comments[0].id}`);
    expect(await repos.comments.count({ designId: look })).toBe(0);

    await boss.delete(`/api/admin/looks/${look}`);
    expect(await repos.designs.findOne({ id: look })).toBeNull();
  });
});

describe('brands and products', () => {
  it('takes a brand or one product out of the Studio, and reports how players use a brand', async () => {
    const { agent } = await player('Iqra');
    await publishLook(agent);
    const boss = await admin();
    const brands = (await boss.get('/api/admin/brands')).body.brands;
    const used = brands.find((x: any) => x.picks > 0);
    expect(used).toBeTruthy();

    const report = await boss.get(`/api/admin/brands/${used.id}`);
    expect(report.body.reach.looks).toBeGreaterThan(0);
    expect(report.body.top.length).toBeGreaterThan(0);
    expect(report.body.summary).toContain(used.name);

    const pieces = async () => Object.values((await agent.get(`/api/game/challenges/${C}/items`)).body.items as Record<string, Array<{ id: string; brandId: string }>>).flat();
    const all = await pieces();
    const brandId = all[0].brandId;
    await boss.post(`/api/admin/brands/${brandId}`).send({ hidden: true });
    expect((await pieces()).some((p) => p.brandId === brandId)).toBe(false);
    expect((await agent.get('/api/brands')).body.brands.some((x: any) => x.id === brandId)).toBe(false);
    await boss.post(`/api/admin/brands/${brandId}`).send({ hidden: false });

    const one = all[0].id;
    await boss.post('/api/admin/products').send({ ids: [one], hidden: true });
    expect((await pieces()).some((p) => p.id === one)).toBe(false);
    const listed = await boss.get(`/api/admin/brands/${brandId}/products`).query({ hidden: '1' });
    expect(listed.body.products.map((p: any) => p.id)).toEqual([one]);
    await boss.post('/api/admin/products').send({ ids: [one], hidden: false });
    expect((await pieces()).some((p) => p.id === one)).toBe(true);
  });
});

describe('challenges and winners', () => {
  it('creates, features, hides and deletes a challenge', async () => {
    const { agent } = await player('Rida');
    const boss = await admin();
    const made = await boss.post('/api/admin/challenges').send({ title: 'Office in pastels', occasion: 'office', gender: 'female', colors: [], coverage: 3, wantsDupatta: false });
    expect(made.status).toBe(201);
    const id = made.body.id;
    expect((await agent.get('/api/game/challenges')).body.challenges.find((c: any) => c.id === id)?.title).toBe('Office in pastels');

    const featured = await boss.put('/api/admin/featured').send({ ids: [id] });
    expect(featured.body.autoFeatured).toBe(false);
    expect((await agent.get('/api/game/challenges')).body.challenges.find((c: any) => c.id === id).featured).toBe(true);
    await boss.put('/api/admin/featured').send({ ids: [] });

    await boss.post(`/api/admin/challenges/${id}/hidden`).send({ hidden: true });
    expect((await agent.get('/api/game/challenges')).body.challenges.some((c: any) => c.id === id)).toBe(false);
    expect((await agent.get(`/api/game/challenges/${id}`)).status).toBe(404);

    // Built-in challenges can be hidden but never deleted; one made here can, while it has no looks.
    expect((await boss.delete(`/api/admin/challenges/${C}`)).status).toBe(400);
    expect((await boss.delete(`/api/admin/challenges/${id}`)).status).toBe(200);
  });

  it("ranks the week by trusted likes (never the designer's own), and marks the winner", async () => {
    const a = await player('Noor');
    const b = await player('Amna');
    const c = await player('Fiza');
    const first = await publishLook(a.agent);
    const second = await publishLook(b.agent);
    // The first look only has its designer's own like; the second has two from others.
    await a.agent.post(`/api/game/designs/${first}/vote`).send({ up: true });
    await a.agent.post(`/api/game/designs/${second}/vote`).send({ up: true });
    await c.agent.post(`/api/game/designs/${second}/vote`).send({ up: true });
    const boss = await admin();
    const board = await boss.get('/api/admin/winners');
    const rows = board.body.looks.filter((l: any) => [first, second].includes(l.id));
    expect(rows[0].id).toBe(second);
    expect(rows.find((l: any) => l.id === first).trustedLikes).toBe(0);
    expect(rows.find((l: any) => l.id === second).trustedLikes).toBe(2);

    await boss.put('/api/admin/winners').send({ period: board.body.period.key, lookId: second });
    expect((await boss.get('/api/admin/winners').query({ period: board.body.period.key })).body.winner).toBe(second);
  });
});

describe('AI previews and the overview', () => {
  it('switches previews off for everyone from the admin portal, and back to the server setting', async () => {
    const { id } = await player('Sana');
    const boss = await admin();
    const off = await boss.put('/api/admin/previews').send({ off: true, globalDailyCap: 50 });
    expect(off.body.limits).toMatchObject({ off: true, globalDailyCap: 50 });
    expect((await boss.get(`/api/admin/users/${id}`)).body.previews.blocked).toBe('off');

    const back = await boss.put('/api/admin/previews').send({ off: false, globalDailyCap: null });
    expect(back.body.limits.off).toBe(false);
    expect(back.body.limits.fromAdmin.globalDailyCap).toBe(false);
  });

  it('counts players, invites and previews in the overview', async () => {
    const inviter = await player('Mehwish');
    const friend = request.agent(app);
    await signUp(friend, { email: 'invited-friend@example.com', name: 'Friend', ref: inviter.id });
    const boss = await admin();
    const o = (await boss.get('/api/admin/overview')).body;
    expect(o.players.total).toBeGreaterThan(1);
    expect(o.referrals.joined).toBeGreaterThanOrEqual(1);
    expect(o.daily.days).toHaveLength(30);
    const refs = (await boss.get('/api/admin/referrals')).body;
    expect(refs.top.find((r: any) => r.id === inviter.id)?.joined).toBe(1);
  });
});
