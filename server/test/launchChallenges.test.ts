import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { titleProblems } from '../src/catalog/titleCheck.js';
import { buildDemoCatalog } from '../src/data/seed.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { featuredIds, gameItems, LAUNCH_UNTIL, launchChallenges, pakistanTime, slotRules } from '../src/services/game.js';
import { RulesLlm } from '../src/services/llm.js';
import type { Product } from '../src/types.js';
import { signUp } from './helpers.js';

const catalog = buildDemoCatalog();
const LAUNCH_WEEK = Date.parse('2026-11-28T12:00:00+05:00');
const AFTER = Date.parse(LAUNCH_UNTIL) + 1000;
const byId = (slug: string) => launchChallenges().find((c) => c.id === `seed-${slug}`)!;

describe('the five launch challenges', () => {
  it('are featured, in order, during launch week only', () => {
    const ids = ['launch-mehndi-20k', 'launch-baraat-guest-35k', 'launch-walima-modest', 'launch-winter-wedding', 'launch-men-nikkah'].map((s) => `seed-${s}`);
    expect(featuredIds(LAUNCH_WEEK)).toEqual(ids);
    // Afterwards the weekly rotation is back (one for women, one for men), without the launch briefs.
    const later = featuredIds(AFTER);
    expect(later).toHaveLength(2);
    expect(later.some((id) => ids.includes(id))).toBe(false);
  });

  it('a look budget keeps room for the rest: the outfit up to 80%, other pieces up to 40%', () => {
    const c = byId('launch-mehndi-20k');
    const items = gameItems(catalog, c, Infinity);
    expect(items.main!.every((p) => p.price <= 16_000)).toBe(true);
    for (const slot of ['footwear', 'bag', 'jewelry'] as const) expect(items[slot]!.every((p) => p.price <= 8_000)).toBe(true);
  });

  it('winter wedding needs a shawl or coat; Nikkah needs a waistcoat and a shalwar kameez or kurta', () => {
    const winter = byId('launch-winter-wedding');
    const wMain = gameItems(catalog, winter, 1, new Date(LAUNCH_WEEK)).main![0];
    expect(slotRules(wMain, winter).layer).toBe('required');
    const nikkah = byId('launch-men-nikkah');
    const nItems = gameItems(catalog, nikkah, Infinity);
    expect(nItems.main!.length).toBeGreaterThan(0);
    expect(nItems.main!.every((p) => ['shalwar kameez', 'kurta'].includes(p.silhouette))).toBe(true);
    expect(slotRules(nItems.main![0], nikkah).waistcoat).toBe('required');
  });

  it('a shawl counts as the layer for the winter wedding', () => {
    const shawl: Product = { ...catalog.find((p) => p.slot === 'dupatta' && p.inStock)!, id: 'shawl-1', title: 'Maroon Karandi Shawl', seasons: ['winter'], occasions: ['walima', 'baraat'] };
    const layer = gameItems([...catalog, shawl], byId('launch-winter-wedding'), Infinity, new Date(LAUNCH_WEEK)).layer!;
    expect(layer.map((p) => p.id)).toContain('shawl-1');
    // Not for other briefs.
    expect(gameItems([...catalog, shawl], byId('launch-walima-modest'), Infinity, new Date(LAUNCH_WEEK)).layer!.map((p) => p.id)).not.toContain('shawl-1');
  });
});

describe('launch challenges in the app', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let repos: Repos;
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(LAUNCH_WEEK);
    repos = createMemoryRepos();
    app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
  });
  afterAll(() => vi.useRealTimers());

  it('lists them first, with their own titles and the prize line', async () => {
    const agent = request.agent(app);
    await signUp(agent, { email: 'launch@example.com', name: 'Launch' });
    const list = (await agent.get('/api/game/challenges')).body.challenges as Array<Record<string, unknown>>;
    expect(list.slice(0, 5).map((c) => c.title)).toEqual([
      'Mehndi look under PKR 20,000',
      'Baraat guest look under PKR 35,000',
      'Walima look, modest',
      'Winter wedding with a shawl or coat',
      'Nikkah: shalwar kameez and waistcoat',
    ]);
    for (const c of list.slice(0, 5)) expect(c).toMatchObject({ featured: true, prize: 'Top-voted look wins a PKR 10,000 voucher' });
    expect(list[0]).toMatchObject({ name: 'Mehndi', lookBudget: 20_000 });
    expect(list.slice(5).every((c) => c.prize === null)).toBe(true);
  });

  it('refuses a look over its budget, with a friendly message', async () => {
    const agent = request.agent(app);
    await signUp(agent, { email: 'budget-launch@example.com', name: 'Budget' });
    const { items } = (await agent.get('/api/game/challenges/seed-launch-mehndi-20k/items')).body;
    const dear = (slot: string) => [...items[slot]].sort((a: Product, b: Product) => b.price - a.price)[0];
    const main = dear('main');
    const pick = [{ slot: 'main', productId: main.id }, { slot: 'footwear', productId: dear('footwear').id }];
    if (!main.includesBottom) pick.push({ slot: 'bottom', productId: dear('bottom').id });
    if (!main.includesDupatta) pick.push({ slot: 'dupatta', productId: dear('dupatta').id });
    const total = pick.reduce((n, x) => n + [...Object.values(items)].flat().find((p: any) => p.id === x.productId)!.price, 0);
    const res = await agent.post('/api/game/designs').send({ challengeId: 'seed-launch-mehndi-20k', items: pick });
    if (total > 20_000) {
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Keep it under Rs 20,000/);
    } else expect(res.status).toBe(201);
  });
});

describe('title check (challenges:check)', () => {
  it('spots codes, broken characters and odd items, and leaves clean titles alone', () => {
    expect(titleProblems('Rts | Red Kurta')).toContain('code');
    expect(titleProblems('Lawn Kurta KF-2231')).toContain('code');
    expect(titleProblems('D-Blue Wash &amp; Wear')).toContain('broken');
    expect(titleProblems('Girls Frock')).toContain('odd');
    expect(titleProblems('Gift Card')).toContain('odd');
    expect(titleProblems('Cream Embroidered Kurta')).toEqual([]);
    expect(titleProblems('Stitched 3-Piece Lawn Suit')).toEqual([]);
  });
});

describe('launch board, deadline and sitemap', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let repos: Repos;
  let n = 0;
  type P = { id: string; price: number; includesBottom?: boolean; includesDupatta?: boolean };
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(LAUNCH_WEEK);
    repos = createMemoryRepos();
    app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
  });
  afterAll(() => vi.useRealTimers());

  const player = async () => {
    const agent = request.agent(app);
    await signUp(agent, { email: `board${++n}@example.com`, name: `Board ${n}` });
    return agent;
  };
  /** A published look for a challenge, from its cheapest pieces (within any budget), plus what it requires. */
  async function publish(agent: ReturnType<typeof request.agent>, challengeId: string, draft = false) {
    const { body } = await agent.get(`/api/game/challenges/${challengeId}/items`);
    const cheapest = (slot: string) => [...(body.items[slot] as P[])].sort((a, b) => a.price - b.price)[0];
    const main = cheapest('main');
    const pick = [{ slot: 'main', productId: main.id }, { slot: 'footwear', productId: cheapest('footwear').id }];
    if (!main.includesBottom) pick.push({ slot: 'bottom', productId: cheapest('bottom').id });
    if (body.challenge.wantsDupatta && !main.includesDupatta) pick.push({ slot: 'dupatta', productId: cheapest('dupatta').id });
    for (const s of body.challenge.requires as string[]) if (!pick.some((x) => x.slot === s)) pick.push({ slot: s, productId: cheapest(s).id });
    const res = await agent.post('/api/game/designs').send({ challengeId, items: pick, draft });
    expect(res.status, res.body.error).toBe(201);
    return res.body.design.id as string;
  }

  it('reads LAUNCH_ENDS as Pakistan time unless it names an offset', () => {
    expect(pakistanTime('2026-12-03T23:59:59')).toBe('2026-12-03T18:59:59.000Z');
    expect(pakistanTime('2026-12-03')).toBe('2026-12-03T18:59:59.000Z');
    expect(pakistanTime('2026-12-04T00:00:00Z')).toBe('2026-12-04T00:00:00.000Z');
    expect(pakistanTime('')).toBeNull();
    expect(pakistanTime('soon')).toBeNull();
  });

  it('the launch board: open to guests, the five challenges and prize, the 10 most liked launch looks', async () => {
    const designer = await player();
    const fans = [await player(), await player(), await player()];
    const mehndi = await publish(designer, 'seed-launch-mehndi-20k');
    const nikkah = await publish(designer, 'seed-launch-men-nikkah');
    const elsewhere = await publish(designer, 'seed-party-black'); // not a launch challenge
    for (const f of fans) await f.post(`/api/game/designs/${nikkah}/vote`).send({ up: true }).expect(200);
    await fans[0].post(`/api/game/designs/${mehndi}/vote`).send({ up: true }).expect(200);
    for (const f of fans) await f.post(`/api/game/designs/${elsewhere}/vote`).send({ up: true }).expect(200);

    const res = await request(app).get('/api/game/launch').expect(200);
    expect(res.body).toMatchObject({ active: true, prize: 'Top-voted look wins a PKR 10,000 voucher', endsAt: LAUNCH_UNTIL });
    expect(res.body.challenges.map((c: { name: string }) => c.name)).toEqual(['Mehndi', 'Baraat', 'Walima', 'Winter wedding', 'Nikkah']);
    expect(res.body.top.map((l: { id: string }) => l.id)).toEqual([nikkah, mehndi]);
    expect(res.body.top[0].up).toBe(3);

    // Eleven more looks: the board shows ten.
    for (let i = 0; i < 11; i++) await publish(await player(), 'seed-launch-walima-modest');
    expect((await request(app).get('/api/game/launch')).body.top).toHaveLength(10);
  }, 60_000); // makes 15 accounts: slow on a busy machine

  it('ends at the deadline', async () => {
    vi.setSystemTime(Date.parse(LAUNCH_UNTIL) + 1);
    try {
      expect((await request(app).get('/api/game/launch').expect(200)).body).toEqual({ active: false });
    } finally {
      vi.setSystemTime(LAUNCH_WEEK);
    }
  });

  it('the sitemap route lists published looks only, newest first, with only ids and dates', async () => {
    const agent = await player();
    const older = await publish(agent, 'seed-launch-baraat-guest-35k');
    vi.setSystemTime(LAUNCH_WEEK + 60_000);
    const newer = await publish(agent, 'seed-launch-mehndi-20k');
    const draft = await publish(agent, 'seed-launch-mehndi-20k', true);
    const hidden = await publish(await player(), 'seed-launch-baraat-guest-35k');
    await repos.designs.update({ id: hidden }, { hidden: true });
    const { looks } = (await request(app).get('/api/sitemap/looks').expect(200)).body as { looks: Array<{ id: string; at: string }> };
    const ids = looks.map((l) => l.id);
    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
    expect(ids).not.toContain(draft);
    expect(ids).not.toContain(hidden);
    expect(looks.every((l) => Object.keys(l).sort().join() === 'at,id')).toBe(true);
    vi.setSystemTime(LAUNCH_WEEK);
  });
});
