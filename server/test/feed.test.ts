import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { RulesLlm } from '../src/services/llm.js';
import { FEED_PAGE } from '../src/services/game.js';

let repos: Repos;
let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  repos = createMemoryRepos();
  app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
});

let n = 0;
async function player(name = 'Ayesha Khan') {
  const agent = request.agent(app);
  await agent.post('/api/auth/signup').send({ email: `feed${++n}@example.com`, password: 'correct-horse-9', name, consent: true });
  return agent;
}

async function publishLook(agent: Awaited<ReturnType<typeof player>>, draft = false) {
  const { body } = await agent.get('/api/game/challenges/seed-party-black/items');
  const cheapest = (slot: string) => [...body.items[slot]].sort((a: any, b: any) => a.price - b.price)[0];
  const main = cheapest('main');
  const items = [{ slot: 'main', productId: main.id }, { slot: 'footwear', productId: cheapest('footwear').id }];
  if (!main.includesBottom) items.push({ slot: 'bottom', productId: cheapest('bottom').id });
  const res = await agent.post('/api/game/designs').send({ challengeId: 'seed-party-black', items, draft });
  expect(res.status).toBe(201);
  return res.body.design.id as string;
}

describe('My taste feed', () => {
  it('shows every published look newest first, with only a first name, never drafts', async () => {
    const ayesha = await player('Ayesha Khan');
    const sana = await player('Sana');
    const older = await publishLook(ayesha);
    const newer = await publishLook(sana);
    await publishLook(sana, true); // a private draft

    expect((await request(app).get('/api/feed')).status).toBe(401);
    const res = await ayesha.get('/api/feed');
    expect(res.status).toBe(200);
    const ids = res.body.looks.map((l: any) => l.id);
    expect(ids.slice(0, 2)).toEqual([newer, older]);
    expect(ids).toHaveLength(2);
    const mine = res.body.looks.find((l: any) => l.id === older);
    expect(mine).toMatchObject({ by: 'Ayesha', mine: true, myVote: null, comments: 0 });
    expect(JSON.stringify(res.body)).not.toMatch(/Khan|@example\.com|userId/);
  });

  it('lets players like, dislike, change or take back their vote, on their own look too', async () => {
    const owner = await player();
    const fan = await player();
    const id = await publishLook(owner);
    const look = async (agent: typeof fan) => (await agent.get('/api/feed')).body.looks.find((l: any) => l.id === id);

    expect((await fan.post(`/api/game/designs/${id}/vote`).send({ up: true })).status).toBe(200);
    expect(await look(fan)).toMatchObject({ up: 1, down: 0, myVote: 'up' });
    await fan.post(`/api/game/designs/${id}/vote`).send({ up: false });
    expect(await look(fan)).toMatchObject({ up: 0, down: 1, myVote: 'down' });
    await fan.post(`/api/game/designs/${id}/vote`).send({ up: null });
    expect(await look(fan)).toMatchObject({ up: 0, down: 0, myVote: null });
    expect((await owner.post(`/api/game/designs/${id}/vote`).send({ up: true })).status).toBe(200);
    expect(await look(owner)).toMatchObject({ up: 1, down: 0, myVote: 'up' });
    expect(await look(fan)).toMatchObject({ up: 1, myVote: null });
  });

  it('takes replies in one-level threads; deleting a comment or an account removes its replies', async () => {
    const owner = await player('Hira Ali');
    const fan = await player('Zara Malik');
    const other = await player('Mina');
    const id = await publishLook(owner);
    const other2 = await publishLook(owner);

    // The designer can comment on their own look.
    const top = (await owner.post(`/api/game/designs/${id}/comments`).send({ text: 'Styled this for Eid' })).body.comments[0];
    expect(top).toMatchObject({ by: 'Hira', parentId: null });
    const r1 = await fan.post(`/api/game/designs/${id}/comments`).send({ text: 'Gorgeous', parentId: top.id });
    expect(r1.status).toBe(201);
    const reply = r1.body.comments.find((c: any) => c.text === 'Gorgeous');
    expect(reply.parentId).toBe(top.id);
    // A reply to a reply joins the same thread.
    const r2 = (await owner.post(`/api/game/designs/${id}/comments`).send({ text: 'Thank you!', parentId: reply.id })).body.comments;
    expect(r2.find((c: any) => c.text === 'Thank you!').parentId).toBe(top.id);
    // A parent must be a comment on the same look.
    expect((await fan.post(`/api/game/designs/${other2}/comments`).send({ text: 'x', parentId: top.id })).status).toBe(404);
    expect((await fan.post(`/api/game/designs/${id}/comments`).send({ text: 'x', parentId: 'nope' })).status).toBe(404);

    // Deleting the top comment takes its replies with it.
    expect((await owner.delete(`/api/game/comments/${top.id}`)).status).toBe(200);
    expect((await fan.get(`/api/game/designs/${id}/comments`)).body.comments).toHaveLength(0);

    // Deleting an account removes replies others left under that account's comments.
    const mina = (await other.post(`/api/game/designs/${id}/comments`).send({ text: 'Where is the bag from?' })).body.comments[0];
    await fan.post(`/api/game/designs/${id}/comments`).send({ text: 'Limelight I think', parentId: mina.id });
    await other.delete('/api/me');
    expect((await fan.get(`/api/game/designs/${id}/comments`)).body.comments).toHaveLength(0);
  });

  it('takes comments, which the commenter or the designer can delete', async () => {
    const owner = await player('Hira Ali');
    const fan = await player('Zara Malik');
    const stranger = await player();
    const id = await publishLook(owner);

    expect((await fan.post(`/api/game/designs/${id}/comments`).send({ text: '   ' })).status).toBe(400);
    expect((await fan.post(`/api/game/designs/${id}/comments`).send({ text: 'x'.repeat(301) })).status).toBe(400);
    const added = await fan.post(`/api/game/designs/${id}/comments`).send({ text: '  Love   the khussa with this!  ' });
    expect(added.status).toBe(201);
    expect(added.body.comments).toEqual([expect.objectContaining({ by: 'Zara', text: 'Love the khussa with this!', mine: true, canDelete: true })]);
    await stranger.post(`/api/game/designs/${id}/comments`).send({ text: 'Nice' });

    const seen = (await owner.get(`/api/game/designs/${id}/comments`)).body.comments;
    expect(seen.map((c: any) => c.text)).toEqual(['Love the khussa with this!', 'Nice']);
    expect(seen.every((c: any) => c.canDelete)).toBe(true); // the designer can tidy their own look
    expect((await owner.get('/api/feed')).body.looks.find((l: any) => l.id === id).comments).toBe(2);

    const zaras = seen[0].id;
    expect((await stranger.delete(`/api/game/comments/${zaras}`)).status).toBe(403);
    expect((await owner.delete(`/api/game/comments/${zaras}`)).status).toBe(200);

    // Drafts take no comments; deleting an account removes its comments.
    const draft = await publishLook(owner, true);
    expect((await fan.post(`/api/game/designs/${draft}/comments`).send({ text: 'hi' })).status).toBe(404);
    await stranger.delete('/api/me');
    expect((await owner.get(`/api/game/designs/${id}/comments`)).body.comments).toHaveLength(0);
  });

  it('pages through older looks', async () => {
    const busy = await player();
    for (let i = 0; i < FEED_PAGE + 2; i++) await publishLook(busy);
    const first = (await busy.get('/api/feed')).body;
    expect(first.looks).toHaveLength(FEED_PAGE);
    expect(first.next).toBeTruthy();
    const second = (await busy.get(`/api/feed?before=${encodeURIComponent(first.next)}`)).body;
    expect(second.looks.length).toBeGreaterThan(0);
    const firstIds = new Set(first.looks.map((l: any) => l.id));
    expect(second.looks.some((l: any) => firstIds.has(l.id))).toBe(false);
    // Every look appears exactly once across the pages, even ones made in the same millisecond.
    const total = (await busy.get('/api/feed')).body.looks.length + second.looks.length;
    expect(total).toBe((await repos.designs.find()).filter((d) => d.status !== 'draft').length);
  });
});
