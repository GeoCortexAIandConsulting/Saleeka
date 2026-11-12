import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { RulesLlm } from '../src/services/llm.js';

let repos: Repos;
let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  repos = createMemoryRepos();
  app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
  for (const p of await repos.products.find()) await repos.products.update({ id: p.id }, { images: [`https://cdn.example/${p.id}.jpg`] });
});

async function player(name: string) {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/signup').send({ email: `${name.toLowerCase()}${Math.random()}@example.com`, password: 'correct-horse-9', name, consent: true })).status).toBe(201);
  return agent;
}

describe('challenge covers', () => {
  it('gives challenges a real outfit photo that fits them, a different one each where possible', async () => {
    const a = await player('Sadia');
    const list = (await a.get('/api/game/challenges')).body.challenges;
    const covered = list.filter((c: any) => c.cover);
    expect(covered.length).toBeGreaterThan(list.length / 2);
    const mehndi = list.find((c: any) => c.id === 'seed-mehndi-mustard');
    const fits = (await a.get('/api/game/challenges/seed-mehndi-mustard/items')).body.items.main.map((p: any) => p.images[0]);
    expect(fits).toContain(mehndi.cover);
    const women = covered.filter((c: any) => c.gender === 'female').map((c: any) => c.cover);
    expect(new Set(women).size).toBeGreaterThan(women.length / 2);
  });
});

describe('landing showcase', () => {
  it('shows trending looks that have a model image, with a comment, to anyone, without private fields', async () => {
    const a = await player('Noor');
    const b = await player('Omar');
    const { body } = await a.get('/api/game/challenges/seed-mehndi-mustard/items');
    const cheapest = (slot: string) => [...body.items[slot]].sort((x: any, y: any) => x.price - y.price)[0];
    const main = cheapest('main');
    const items = [{ slot: 'main', productId: main.id }];
    if (!main.includesBottom) items.push({ slot: 'bottom', productId: cheapest('bottom').id });
    if (!main.includesDupatta) items.push({ slot: 'dupatta', productId: cheapest('dupatta').id });
    items.push({ slot: 'footwear', productId: cheapest('footwear').id });
    const pictured = (await a.post('/api/game/designs').send({ challengeId: 'seed-mehndi-mustard', items })).body.design.id;
    const plain = (await a.post('/api/game/designs').send({ challengeId: 'seed-mehndi-mustard', items })).body.design.id;
    await repos.previews.insert({ id: 'pv1', userId: 'x', key: 'k', mime: 'image/png', data: 'AA==', at: new Date().toISOString() });
    await repos.designs.update({ id: pictured }, { previewId: 'pv1' });
    await b.post(`/api/game/designs/${pictured}/comments`).send({ text: 'Gorgeous!' });

    const res = await request(app).get('/api/showcase'); // no account
    expect(res.status).toBe(200);
    expect(res.body.looks.map((l: any) => l.id)).toEqual([pictured]);
    expect(res.body.looks).not.toContainEqual(expect.objectContaining({ id: plain }));
    expect(res.body.looks[0]).toMatchObject({ by: 'Noor', previewUrl: '/api/previews/pv1', comment: { by: 'Omar', text: 'Gorgeous!' } });
    for (const field of ['byId', 'mine', 'myVote']) expect(res.body.looks[0]).not.toHaveProperty(field);
  });
});
