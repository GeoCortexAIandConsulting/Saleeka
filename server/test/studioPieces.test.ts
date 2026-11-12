import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { RulesLlm } from '../src/services/llm.js';

let repos: Repos;
let app: Awaited<ReturnType<typeof createApp>>;
let agent: ReturnType<typeof request.agent>;
const C = 'seed-mehndi-mustard';

beforeAll(async () => {
  repos = createMemoryRepos();
  app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
  agent = request.agent(app);
  expect((await agent.post('/api/auth/signup').send({ email: 'pieces@example.com', password: 'correct-horse-9', name: 'Hira', consent: true })).status).toBe(201);
});

const pieces = (query: Record<string, string | number>) => agent.get(`/api/game/challenges/${C}/pieces`).query(query);

describe('Studio piece browser', () => {
  it('offers only pieces that fit the challenge, 24 cards a page, with the brands and colours on offer', async () => {
    const allowed = new Set((await agent.get(`/api/game/challenges/${C}/items`)).body.items.main.map((p: any) => p.id));
    const res = await pieces({ slot: 'main' });
    expect(res.status).toBe(200);
    expect(res.body.groups.length).toBeGreaterThan(0);
    expect(res.body.groups.length).toBeLessThanOrEqual(24);
    for (const g of res.body.groups) for (const v of g.variants) expect(allowed.has(v.id)).toBe(true);
    expect(res.body.brands.length).toBeGreaterThan(0);
    expect(res.body.colors.length).toBeGreaterThan(0);
  });

  it('shows one card for a piece sold in several colours', async () => {
    const [p] = (await pieces({ slot: 'footwear' })).body.groups[0].variants;
    const base = (await repos.products.findOne({ id: p.id }))!;
    await repos.products.insert({ ...base, id: `${base.id}-teal`, colors: ['teal'], hex: '#0f766e' });
    const res = await pieces({ slot: 'footwear', q: base.title });
    const card = res.body.groups.find((g: any) => g.variants.some((v: any) => v.id === base.id));
    expect(card.variants.map((v: any) => v.id)).toEqual(expect.arrayContaining([base.id, `${base.id}-teal`]));
    // Filtering by colour keeps the card, with only that colour.
    const teal = await pieces({ slot: 'footwear', q: base.title, color: 'teal' });
    expect(teal.body.groups.find((g: any) => g.key === card.key).variants.map((v: any) => v.id)).toEqual([`${base.id}-teal`]);
  });

  it('sorts by price, filters by brand and price, and searches title and brand', async () => {
    const cheapest = (g: any) => Math.min(...g.variants.map((v: any) => v.price));
    const up = (await pieces({ slot: 'main', sort: 'price-asc' })).body.groups.map(cheapest);
    expect(up).toEqual([...up].sort((a, b) => a - b));
    const down = (await pieces({ slot: 'main', sort: 'price-desc' })).body.groups.map(cheapest);
    expect(down).toEqual([...down].sort((a, b) => b - a));

    const brand = (await pieces({ slot: 'main' })).body.brands[0].id;
    const ofBrand = (await pieces({ slot: 'main', brand })).body.groups;
    expect(ofBrand.every((g: any) => g.variants[0].brandId === brand)).toBe(true);

    const capped = (await pieces({ slot: 'main', max: 5000 })).body.groups;
    expect(capped.every((g: any) => g.variants.every((v: any) => v.price <= 5000))).toBe(true);

    const none = await pieces({ slot: 'main', q: 'zzz-no-such-piece' });
    expect(none.body).toMatchObject({ groups: [], total: 0 });
  });

  it('mixes brands in the first row of the best-match order', async () => {
    const first = (await pieces({ slot: 'main' })).body;
    if (first.brands.length < 2) return;
    expect(new Set(first.groups.slice(0, 3).map((g: any) => g.variants[0].brandId)).size).toBeGreaterThan(1);
  });

  it('rejects an unknown slot or sort', async () => {
    expect((await pieces({ slot: 'hat' })).status).toBe(400);
    expect((await pieces({ slot: 'main', sort: 'random' })).status).toBe(400);
  });
});

describe('a look on its own page', () => {
  it('shows a published look, never a draft', async () => {
    const { body } = await agent.get(`/api/game/challenges/${C}/items`);
    const cheapest = (slot: string) => [...body.items[slot]].sort((a: any, b: any) => a.price - b.price)[0];
    const main = cheapest('main');
    const items = [{ slot: 'main', productId: main.id }];
    if (!main.includesBottom) items.push({ slot: 'bottom', productId: cheapest('bottom').id });
    if (!main.includesDupatta) items.push({ slot: 'dupatta', productId: cheapest('dupatta').id });
    items.push({ slot: 'footwear', productId: cheapest('footwear').id });

    const draft = (await agent.post('/api/game/designs').send({ challengeId: C, items, draft: true })).body.design;
    expect((await agent.get(`/api/feed/${draft.id}`)).status).toBe(404);
    await agent.post(`/api/game/designs/${draft.id}/publish`);
    const res = await agent.get(`/api/feed/${draft.id}`);
    expect(res.status).toBe(200);
    expect(res.body.look).toMatchObject({ id: draft.id, by: 'Hira', mine: true, myVote: null, comments: 0 });
    expect(res.body.look.items.length).toBe(items.length);
  });
});
