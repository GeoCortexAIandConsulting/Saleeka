import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { RulesLlm } from '../src/services/llm.js';
import { minModestyFor } from '../src/services/modesty.js';
import { modestAnswers } from './fixtures.js';
import { signUp } from './helpers.js';

let repos: Repos;
let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  repos = createMemoryRepos();
  app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
});

let n = 0;
async function player() {
  const agent = request.agent(app);
  const res = await signUp(agent, { email: `player${++n}@example.com`, password: 'correct-horse-9', name: 'Player', consent: true });
  expect(res.status).toBe(201);
  return agent;
}

type P = { id: string; price: number; brandId: string; colors: string[]; modesty: number; includesBottom: boolean; includesDupatta: boolean; silhouette: string };

/** The cheapest valid design for a challenge, built the way the game's sidebar builds it. */
function cheapestDesign(items: Record<string, P[]>, wantsDupatta: boolean) {
  const cheapest = (slot: string) => [...items[slot]].sort((a, b) => a.price - b.price)[0];
  const main = cheapest('main');
  const pick = [{ slot: 'main', productId: main.id }];
  if (!main.includesBottom) pick.push({ slot: 'bottom', productId: cheapest('bottom').id });
  if (wantsDupatta && !main.includesDupatta) pick.push({ slot: 'dupatta', productId: cheapest('dupatta').id });
  pick.push({ slot: 'footwear', productId: cheapest('footwear').id });
  return { main, pick };
}

describe('landing page demo', () => {
  it('shows a Mehndi challenge with up to four real pieces per slot to anyone, from different brands first', async () => {
    // Its own app: the demo is cached, and it only offers pieces with photos.
    const demoRepos = createMemoryRepos();
    const demoApp = await createApp({ repos: demoRepos, llm: new RulesLlm(), rateLimit: false });
    for (const p of await demoRepos.products.find()) await demoRepos.products.update({ id: p.id }, { images: [`https://cdn.example/${p.id}.jpg`] });
    const res = await request(demoApp).get('/api/demo/look'); // no account
    expect(res.status).toBe(200);
    expect(res.body.challenge).toMatchObject({ occasion: 'mehndi', wantsDupatta: true });
    for (const slot of ['main', 'bottom', 'dupatta', 'footwear', 'bag', 'jewelry']) {
      const list = res.body.items[slot];
      expect(list.length).toBeGreaterThan(0);
      expect(list.length).toBeLessThanOrEqual(4);
      expect(list.every((p: any) => p.images?.length)).toBe(true);
    }
    const mains = res.body.items.main;
    const brands = new Set(mains.map((p: any) => p.brandId));
    const available = new Set((await demoRepos.products.find({ slot: 'main' })).map((p) => p.brandId));
    expect(brands.size).toBe(Math.min(mains.length, available.size));
  });
});

describe("men's styling", () => {
  it("keeps men's and women's challenges, pieces and Runway looks apart", async () => {
    const agent = await player();
    const challenges = (await agent.get('/api/game/challenges')).body.challenges;
    const menC = challenges.filter((c: any) => c.gender === 'male');
    const womenC = challenges.filter((c: any) => c.gender === 'female');
    expect(menC.length).toBeGreaterThanOrEqual(5);
    expect(womenC.length).toBeGreaterThanOrEqual(10);

    // A men's challenge offers men's slots and only menswear; a women's one never offers menswear.
    const men = (await agent.get('/api/game/challenges/seed-men-eid-white/items')).body.items;
    expect(Object.keys(men).sort()).toEqual(['accessory', 'bottom', 'footwear', 'layer', 'main', 'waistcoat']);
    const all = await repos.products.find();
    const isMale = new Set(all.filter((p) => p.gender === 'male').map((p) => p.id));
    for (const list of Object.values(men) as any[][]) expect(list.every((p) => isMale.has(p.id))).toBe(true);
    const women = (await agent.get('/api/game/challenges/seed-eid-white/items')).body.items;
    for (const list of Object.values(women) as any[][]) expect(list.some((p) => isMale.has(p.id))).toBe(false);

    // A kurta (no bottom of its own) needs a bottom and shoes; a waistcoat and an accessory are optional.
    const kurta = men.main.find((p: any) => !p.includesBottom);
    const items = [
      { slot: 'main', productId: kurta.id },
      { slot: 'bottom', productId: men.bottom[0].id },
      { slot: 'waistcoat', productId: men.waistcoat[0].id },
      { slot: 'footwear', productId: men.footwear[0].id },
      { slot: 'accessory', productId: men.accessory[0].id },
    ];
    const noShoes = await agent.post('/api/game/designs').send({ challengeId: 'seed-men-eid-white', items: items.filter((i) => i.slot !== 'footwear') });
    expect(noShoes.status).toBe(400);
    expect(noShoes.body.error).toMatch(/shoes/);
    const dupatta = (await agent.get('/api/game/challenges/seed-eid-white/items')).body.items.dupatta[0];
    expect((await agent.post('/api/game/designs').send({ challengeId: 'seed-men-eid-white', items: [...items, { slot: 'dupatta', productId: dupatta.id }] })).status).toBe(400);
    const made = await agent.post('/api/game/designs').send({ challengeId: 'seed-men-eid-white', items });
    expect(made.status).toBe(201);
    const mensLook = made.body.design.id;

    // The Runway shows both, or only one side.
    const womensLook = (await agent.post('/api/game/designs').send({ challengeId: 'seed-eid-white', items: cheapestDesign(women, true).pick })).body.design.id;
    const ids = async (q: string) => (await agent.get(`/api/feed${q}`)).body.looks.map((l: any) => l.id);
    expect(await ids('')).toEqual(expect.arrayContaining([mensLook, womensLook]));
    expect(await ids('?gender=male')).toContain(mensLook);
    expect(await ids('?gender=male')).not.toContain(womensLook);
    expect(await ids('?gender=female')).not.toContain(mensLook);
    expect((await agent.get('/api/feed')).body.looks.find((l: any) => l.id === mensLook).challenge.gender).toBe('male');
    await repos.designs.delete({});
  });

  it("offers a men's demo on the landing page", async () => {
    const demoRepos = createMemoryRepos();
    const demoApp = await createApp({ repos: demoRepos, llm: new RulesLlm(), rateLimit: false });
    for (const p of await demoRepos.products.find()) await demoRepos.products.update({ id: p.id }, { images: [`https://cdn.example/${p.id}.jpg`] });
    const res = await request(demoApp).get('/api/demo/look?gender=male');
    expect(res.status).toBe(200);
    expect(res.body.challenge).toMatchObject({ gender: 'male', occasion: 'eid' });
    expect(Object.keys(res.body.items).sort()).toEqual(['accessory', 'bottom', 'footwear', 'layer', 'main', 'waistcoat']);
    expect(res.body.items.main.every((p: any) => p.gender === 'male')).toBe(true);
  });
});

describe('dress-up game', () => {
  it('the Studio needs an account (made with a confirmed email); visitors only learn whether previews are on', async () => {
    const guest = request(app);
    await guest.get('/api/game/challenges').expect(401);
    await guest.get('/api/game/challenges/seed-mehndi-mustard').expect(401);
    await guest.get('/api/game/challenges/seed-mehndi-mustard/items').expect(401);
    await guest.get('/api/game/challenges/seed-mehndi-mustard/pieces?slot=main').expect(401);
    expect((await guest.get('/api/game/preview').expect(200)).body).not.toHaveProperty('status');
    await guest.post('/api/game/designs').send({ challengeId: 'seed-mehndi-mustard', items: [] }).expect(401);
    await guest.post('/api/game/designs/any/preview').expect(401);
    await guest.post('/api/game/designs/any/publish').expect(401);
    await guest.get('/api/game/designs/mine').expect(401);
  });

  it('needs no quiz, and ships with seeded challenges', async () => {
    const agent = await player();
    const res = await agent.get('/api/game/challenges');
    expect(res.status).toBe(200);
    expect(res.body.challenges.length).toBeGreaterThanOrEqual(10);
    expect(res.body.challenges.find((c: any) => c.id === 'seed-mehndi-mustard').title).toBe('Mehndi outfit · mustard, lemon');
  });

  it('every seeded challenge can be completed straight away (no brand step, no budget)', async () => {
    const agent = await player();
    for (const c of (await agent.get('/api/game/challenges')).body.challenges) {
      const { body } = await agent.get(`/api/game/challenges/${c.id}/items`);
      expect(body.items.main.length, c.id).toBeGreaterThan(0);
      const { pick } = cheapestDesign(body.items, c.wantsDupatta);
      const res = await agent.post('/api/game/designs').send({ challengeId: c.id, items: pick });
      expect(res.status, `${c.id}: ${res.body.error}`).toBe(201);
    }
    await repos.designs.delete({});
  });

  it('lists the best fit for the challenge first, not the cheapest', async () => {
    const agent = await player();
    const { body } = await agent.get('/api/game/challenges/seed-mehndi-mustard/items');
    // Festive: a dressy kind (khussa or heels, clutch or potli, jhumkay or sets) leads each accessory list when one exists.
    const dressy = ['heel', 'khussa', 'clutch', 'potli', 'jhumkay', 'necklace set', 'maang tikka'];
    for (const slot of ['footwear', 'bag', 'jewelry']) {
      const list = body.items[slot] as P[];
      if (list.some((p) => dressy.includes(p.silhouette))) expect(dressy, slot).toContain(list[0].silhouette);
    }
    // Outfits mainly in the asked colour come before ones with only a touch of it.
    const mains = body.items.main as P[];
    const firstTouch = mains.findIndex((p) => !body.challenge.colors.includes(p.colors[0]));
    if (firstTouch >= 0) expect(mains.slice(firstTouch).every((p) => !body.challenge.colors.includes(p.colors[0]))).toBe(true);
  });

  it('only offers pieces that meet the challenge, from every brand: colours, coverage and occasion', async () => {
    const agent = await player();
    const res = await agent.get('/api/game/challenges/seed-walima-pastel-modest/items');
    expect(res.status).toBe(200);
    const { challenge, items } = res.body;
    expect(items.main.length).toBeGreaterThan(0);
    expect(new Set((items.main as P[]).map((p) => p.brandId)).size).toBeGreaterThan(1); // more than one brand on offer
    for (const p of items.main as P[]) {
      expect(p.colors.some((c) => challenge.colors.includes(c))).toBe(true);
      expect(p.modesty).toBeGreaterThanOrEqual(minModestyFor(challenge.coverage));
      expect(p.silhouette).not.toBe('western');
    }
    // Festive: no sneakers or totes.
    for (const p of [...items.footwear, ...items.bag] as P[]) expect(['sneaker', 'tote', 'shoulder bag']).not.toContain(p.silhouette);
    expect((await agent.get('/api/game/challenges/nope/items')).status).toBe(404);
  });

  it('saves a complete design with its total, and rejects incomplete or foreign ones', async () => {
    const agent = await player();
    const challengeId = 'seed-eid-white';
    const { body } = await agent.get(`/api/game/challenges/${challengeId}/items`);
    const { main, pick } = cheapestDesign(body.items, body.challenge.wantsDupatta);

    const ok = await agent.post('/api/game/designs').send({ challengeId, items: pick });
    expect(ok.status).toBe(201);
    expect(ok.body.design.items.length).toBe(pick.length);
    // No budget limit in the game, but the total is kept for matching looks to shoppers' budgets later.
    const price = (slot: string, id: string) => (body.items[slot] as P[]).find((p) => p.id === id)!.price;
    expect(ok.body.design.total).toBe(pick.reduce((s, i) => s + price(i.slot, i.productId), 0));
    expect(body.challenge.budgetMax).toBeUndefined();
    // The design records the brands its clothes came from.
    const stored = await repos.designs.findOne({ id: ok.body.design.id });
    expect(stored!.brandIds).toContain(main.brandId);

    const noShoes = pick.filter((i) => i.slot !== 'footwear');
    expect((await agent.post('/api/game/designs').send({ challengeId, items: noShoes })).body.error).toMatch(/shoes/);
    const foreign = (await repos.products.find({ slot: 'main' })).find((p) => !body.items.main.some((m: P) => m.id === p.id))!;
    const swapped = pick.map((i) => (i.slot === 'main' ? { slot: 'main', productId: foreign.id } : i));
    expect((await agent.post('/api/game/designs').send({ challengeId, items: swapped })).status).toBe(400);
    if (main.includesBottom) {
      const extra = [...pick, { slot: 'bottom', productId: body.items.bottom[0].id }];
      expect((await agent.post('/api/game/designs').send({ challengeId, items: extra })).status).toBe(400);
    }
    // The dearest pieces are fine too: the game has no budget.
    const dearest = (slot: string) => [...(body.items[slot] as P[])].sort((a, b) => b.price - a.price)[0];
    const dmain = dearest('main');
    const dear = [{ slot: 'main', productId: dmain.id }, { slot: 'footwear', productId: dearest('footwear').id }];
    if (!dmain.includesBottom) dear.push({ slot: 'bottom', productId: dearest('bottom').id });
    if (body.challenge.wantsDupatta && !dmain.includesDupatta) dear.push({ slot: 'dupatta', productId: dearest('dupatta').id });
    expect((await agent.post('/api/game/designs').send({ challengeId, items: dear })).status).toBe(201);
  });

  it('lets players rate a design once (never offering their own to rate), and deletes it with the account', async () => {
    const designer = await player();
    const { body } = await designer.get('/api/game/challenges/seed-party-black/items');
    const { pick } = cheapestDesign(body.items, body.challenge.wantsDupatta);
    const made = await designer.post('/api/game/designs').send({ challengeId: 'seed-party-black', items: pick });
    expect(made.status).toBe(201);
    const id = made.body.design.id;
    // The designer may like their own look (then takes it back so the counts below start at zero).
    expect((await designer.post(`/api/game/designs/${id}/vote`).send({ up: true })).status).toBe(200);
    expect((await designer.post(`/api/game/designs/${id}/vote`).send({ up: null })).status).toBe(200);

    const rater = await player();
    let next = (await rater.get('/api/game/rate/next')).body.design;
    const seen: string[] = [];
    while (next && next.id !== id) {
      seen.push(next.id);
      await rater.post(`/api/game/designs/${next.id}/vote`).send({ up: false });
      next = (await rater.get('/api/game/rate/next')).body.design;
    }
    expect(next.id).toBe(id);
    expect(next.challenge.title).toContain('Party');
    await rater.post(`/api/game/designs/${id}/vote`).send({ up: true });
    await rater.post(`/api/game/designs/${id}/vote`).send({ up: true }); // a second vote replaces the first
    const mine = (await designer.get('/api/game/designs/mine')).body.designs;
    expect(mine[0]).toMatchObject({ id, up: 1, down: 0 });
    expect((await rater.get('/api/game/rate/next')).body.design?.id).not.toBe(id);

    expect((await rater.delete('/api/me')).status).toBe(200);
    expect((await designer.get('/api/game/designs/mine')).body.designs[0]).toMatchObject({ id, up: 0, down: 0 });
    expect((await designer.delete('/api/me')).status).toBe(200);
    expect(await repos.designs.findOne({ id })).toBeNull();
  });

  it('turns stylist searches into challenges once two shoppers ask, without storing who asked', async () => {
    const ask = async () => {
      const agent = await player();
      expect((await agent.post('/api/quiz/answers').send(modestAnswers)).status).toBe(201);
      const chat = await agent.post('/api/chat').send({ message: 'eid outfit, navy, under 28k' });
      expect(chat.body.looks.length).toBeGreaterThan(0);
      return agent;
    };
    const first = await ask();
    const hidden = (await first.get('/api/game/challenges')).body.challenges.filter((c: any) => c.fromShoppers);
    expect(hidden).toHaveLength(0);
    await ask();
    const shown = (await first.get('/api/game/challenges')).body.challenges.filter((c: any) => c.fromShoppers);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ occasion: 'eid', colors: ['navy'], asks: 2 });
    expect(shown[0].budgetMax).toBeUndefined();
    const stored = await repos.challenges.findOne({ id: shown[0].id });
    expect(JSON.stringify(stored)).not.toMatch(/userId|message|example\.com/);
  });
});
