import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Never touch Google in tests: a fake sign-in, and a fake Gemini behind fetch.
vi.mock('google-auth-library', () => ({ GoogleAuth: class { getAccessToken = async () => 'test-token'; } }));

import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { RulesLlm } from '../src/services/llm.js';

const PNG = Buffer.from('fake-png').toString('base64');
let repos: Repos;
let app: Awaited<ReturnType<typeof createApp>>;
const gemini: Array<{ parts: any[] }> = [];
const realFetch = globalThis.fetch;
const saved = { ...config.preview };

beforeAll(async () => {
  repos = createMemoryRepos();
  app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
  for (const p of await repos.products.find()) await repos.products.update({ id: p.id }, { images: [`https://cdn.example/${p.id}.jpg`] });
  globalThis.fetch = vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    if (u.startsWith('https://cdn.example/')) return new Response(Buffer.from('photo'), { headers: { 'content-type': 'image/jpeg' } });
    if (u.includes('aiplatform.googleapis.com')) {
      gemini.push({ parts: JSON.parse(init.body).contents[0].parts });
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG } }] } }] });
    }
    return realFetch(url, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  Object.assign(config.preview, saved);
});

async function draftLook() {
  const agent = request.agent(app);
  const email = `preview${Math.random().toString(36).slice(2)}@example.com`;
  expect((await agent.post('/api/auth/signup').send({ email, password: 'correct-horse-9', name: 'Ayesha', consent: true })).status).toBe(201);
  const { body } = await agent.get('/api/game/challenges/seed-mehndi-mustard/items');
  const cheapest = (slot: string) => [...body.items[slot]].sort((a: any, b: any) => a.price - b.price)[0];
  const main = cheapest('main');
  const items = [{ slot: 'main', productId: main.id }];
  if (!main.includesBottom) items.push({ slot: 'bottom', productId: cheapest('bottom').id });
  if (!main.includesDupatta) items.push({ slot: 'dupatta', productId: cheapest('dupatta').id });
  items.push({ slot: 'footwear', productId: cheapest('footwear').id });
  const res = await agent.post('/api/game/designs').send({ challengeId: 'seed-mehndi-mustard', items, draft: true });
  expect(res.status).toBe(201);
  return { agent, design: res.body.design, items };
}

describe('AI look preview', () => {
  it('is hidden while no Google Cloud project is set', async () => {
    config.preview.project = '';
    const { agent, design } = await draftLook();
    expect((await agent.get('/api/game/preview')).body).toEqual({ enabled: false });
    expect((await agent.post(`/api/game/designs/${design.id}/preview`)).status).toBe(404);
  });

  it('dresses one fixed model in exactly the chosen pieces, reuses it, then publishes with the look', async () => {
    config.preview.project = 'test-project';
    gemini.length = 0;
    const { agent, design, items } = await draftLook();
    expect((await agent.get('/api/game/preview')).body).toEqual({ enabled: true });

    const res = await agent.post(`/api/game/designs/${design.id}/preview`);
    expect(res.status).toBe(200);
    expect(res.body.design.previewUrl).toMatch(/^\/api\/previews\//);
    // First call makes the base model photo (text only), the second dresses it: model + one photo per piece.
    expect(gemini).toHaveLength(2);
    expect(gemini[0].parts.every((p) => p.text)).toBe(true);
    expect(gemini[1].parts.filter((p) => p.inlineData)).toHaveLength(1 + items.length);
    expect(gemini[1].parts.at(-1).text).toMatch(/no rings/i);

    // The image is served to signed-in players only; the base model photo is never served.
    const img = await agent.get(res.body.design.previewUrl);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toMatch(/image\/png/);
    // A draft's image is private to its designer.
    expect((await request(app).get(res.body.design.previewUrl)).status).toBe(404);
    const base = (await repos.previews.find()).find((p) => p.id.startsWith('base-female-'))!;
    expect(base).toBeTruthy();
    expect((await agent.get(`/api/previews/${base.id}`)).status).toBe(404);
    // A lively model, not a blank face.
    expect(gemini[0].parts[0].text).toMatch(/smile/);
    expect(gemini[1].parts.at(-1).text).toMatch(/never blank/);

    // "Try another model": the next model (made once) wears the same look, as a new image.
    const other = await agent.post(`/api/game/designs/${design.id}/preview`).send({ anotherModel: true });
    expect(other.status).toBe(200);
    expect(other.body.design.previewUrl).not.toBe(res.body.design.previewUrl);
    expect(gemini).toHaveLength(4);
    const bases = (await repos.previews.find()).filter((p) => p.id.startsWith('base-female-'));
    expect(bases).toHaveLength(2);
    gemini.length = 2;

    // The same pieces again: no new image.
    const again = await agent.post('/api/game/designs').send({ challengeId: 'seed-mehndi-mustard', items, draft: true });
    expect((await agent.post(`/api/game/designs/${again.body.design.id}/preview`)).body.design.previewUrl).toBe(res.body.design.previewUrl);
    expect(gemini).toHaveLength(2);

    // Published, the look carries its preview onto the Runway.
    expect((await agent.post(`/api/game/designs/${again.body.design.id}/publish`)).status).toBe(200);
    const feed = await agent.get('/api/feed');
    expect(feed.body.looks.find((l: any) => l.id === again.body.design.id).previewUrl).toBe(res.body.design.previewUrl);
    // Published, its image opens for anyone with the link (shared on WhatsApp).
    expect((await request(app).get(res.body.design.previewUrl)).status).toBe(200);
  });

  it('limits new images per player per day, and deleting the account deletes their previews', async () => {
    config.preview.project = 'test-project';
    config.preview.dailyLimit = 1;
    const { agent, design } = await draftLook();
    expect((await agent.post(`/api/game/designs/${design.id}/preview`)).status).toBe(200);
    // A different look is a new image, over today's limit.
    const { body } = await agent.get('/api/game/challenges/seed-mehndi-mustard/items');
    const shoes = [...body.items.footwear].sort((a: any, b: any) => b.price - a.price)[0];
    const items = (await repos.designs.findOne({ id: design.id }))!.items.map((i) => (i.slot === 'footwear' ? { ...i, productId: shoes.id } : i));
    const other = await agent.post('/api/game/designs').send({ challengeId: 'seed-mehndi-mustard', items, draft: true });
    const limited = await agent.post(`/api/game/designs/${other.body.design.id}/preview`);
    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatch(/today/);

    const me = (await agent.get('/api/me')).body;
    const userId = me.user?.id ?? me.id;
    expect((await repos.previews.find({ userId })).length).toBe(1);
    expect((await agent.delete('/api/me')).status).toBe(200);
    expect(await repos.previews.find({ userId })).toHaveLength(0);
  });
});
