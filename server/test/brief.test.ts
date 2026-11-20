import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { RulesLlm } from '../src/services/llm.js';
import { signUp } from './helpers.js';

let repos: Repos;
let app: Awaited<ReturnType<typeof createApp>>;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  repos = createMemoryRepos();
  app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
  agent = request.agent(app);
  await signUp(agent, { email: 'brief@example.com', password: 'correct-horse-9', name: 'Brief', consent: true });
});

const brief = (body: object) => agent.post('/api/game/briefs').send({ gender: 'female', ...body });

describe("Studio: what's on your mind today", () => {
  it('needs an account, like the rest of the Studio', async () => {
    await request(app).post('/api/game/briefs').send({ gender: 'female', text: 'casual' }).expect(401);
  });

  it('needs words or a choice', async () => {
    await brief({}).expect(400);
  });

  it('reads the words into a private challenge and lists the brands that fit, most first', async () => {
    const res = await brief({ text: 'something for a mehndi, modest please' }).expect(200);
    const c = res.body.challenge;
    expect(c).toMatchObject({ occasion: 'mehndi', modest: true, wantsDupatta: true, custom: true, gender: 'female' });
    expect(c.id).toMatch(/^brief-/);
    expect(res.body.brands.length).toBeGreaterThan(0);
    const counts = res.body.brands.map((b: { count: number }) => b.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    // Never in the public challenge list, but it opens like any other.
    const list = (await agent.get('/api/game/challenges')).body.challenges;
    expect(list.some((x: { id: string }) => x.id === c.id)).toBe(false);
    expect((await agent.get(`/api/game/challenges/${c.id}`).expect(200)).body.challenge.id).toBe(c.id);
  });

  it('the same brief gives the same challenge', async () => {
    const a = (await brief({ occasion: 'party', colour: 'black' })).body.challenge.id;
    const b = (await brief({ occasion: 'party', colour: 'black' })).body.challenge.id;
    expect(a).toBe(b);
  });

  it('dropdowns win over the words', async () => {
    const c = (await brief({ text: 'office wear', occasion: 'eid', coverage: 'relaxed' }).expect(200)).body.challenge;
    expect(c.occasion).toBe('eid');
    expect(c.modest).toBe(false);
  });

  it('turns to menswear when the words are clearly for a man', async () => {
    const c = (await brief({ text: 'eid kurta for my husband' }).expect(200)).body.challenge;
    expect(c.gender).toBe('male');
    expect(c.wantsDupatta).toBe(false);
  });

  it('a budget keeps only that price tier, and kept brands narrow the Studio to them', async () => {
    const first = (await brief({ occasion: 'casual', budget: 'budget' }).expect(200)).body;
    expect(first.challenge.tiers).toEqual(['budget']);
    expect(first.brands.every((b: { tier: string }) => b.tier === 'budget')).toBe(true);

    const keep = first.brands[0].id;
    const narrowed = (await brief({ occasion: 'casual', budget: 'budget', brands: [keep] }).expect(200)).body;
    expect(narrowed.challenge.brandIds).toEqual([keep]);
    const pieces = (await agent.get(`/api/game/challenges/${narrowed.challenge.id}/pieces?slot=main`).expect(200)).body;
    expect(pieces.groups.length).toBeGreaterThan(0);
    expect(pieces.groups.every((g: { variants: Array<{ brandId: string }> }) => g.variants[0].brandId === keep)).toBe(true);
  });

  it('a look can be designed for the brief', async () => {
    const { challenge } = (await brief({ occasion: 'casual' }).expect(200)).body;
    const items = (await agent.get(`/api/game/challenges/${challenge.id}/items`).expect(200)).body.items;
    const main = items.main[0];
    const pick = [{ slot: 'main', productId: main.id }];
    if (!main.includesBottom) pick.push({ slot: 'bottom', productId: items.bottom[0].id });
    pick.push({ slot: 'footwear', productId: items.footwear[0].id });
    const res = await agent.post('/api/game/designs').send({ challengeId: challenge.id, items: pick });
    expect(res.status).toBe(201);
    expect(res.body.design.challenge.id).toBe(challenge.id);
  });
});
