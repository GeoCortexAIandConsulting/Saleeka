import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { RulesLlm } from '../src/services/llm.js';

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
  expect((await agent.post('/api/auth/signup').send({ email: `social${++n}@example.com`, password: 'correct-horse-9', name, consent: true })).status).toBe(201);
  return agent;
}

async function publishLook(agent: ReturnType<typeof request.agent>) {
  const { body } = await agent.get(`/api/game/challenges/${C}/items`);
  const cheapest = (slot: string) => [...body.items[slot]].sort((a: any, b: any) => a.price - b.price)[0];
  const main = cheapest('main');
  const items = [{ slot: 'main', productId: main.id }];
  if (!main.includesBottom) items.push({ slot: 'bottom', productId: cheapest('bottom').id });
  if (!main.includesDupatta) items.push({ slot: 'dupatta', productId: cheapest('dupatta').id });
  items.push({ slot: 'footwear', productId: cheapest('footwear').id });
  const res = await agent.post('/api/game/designs').send({ challengeId: C, items });
  expect(res.status).toBe(201);
  return res.body.design.id as string;
}

describe('notifications', () => {
  it('tells designers about likes and comments, and commenters about replies, never about themselves', async () => {
    const ayesha = await player('Ayesha Khan');
    const bilal = await player('Bilal');
    const look = await publishLook(ayesha);

    // Liking your own look tells no one.
    await ayesha.post(`/api/game/designs/${look}/vote`).send({ up: true });
    expect((await ayesha.get('/api/notifications/unread')).body.unread).toBe(0);

    // A like (tapped twice, then again) is one notification; taking it back removes it.
    await bilal.post(`/api/game/designs/${look}/vote`).send({ up: true });
    await bilal.post(`/api/game/designs/${look}/vote`).send({ up: true });
    expect((await ayesha.get('/api/notifications/unread')).body.unread).toBe(1);
    await bilal.post(`/api/game/designs/${look}/vote`).send({ up: null });
    expect((await ayesha.get('/api/notifications/unread')).body.unread).toBe(0);
    // A dislike is never announced.
    await bilal.post(`/api/game/designs/${look}/vote`).send({ up: false });
    expect((await ayesha.get('/api/notifications/unread')).body.unread).toBe(0);
    await bilal.post(`/api/game/designs/${look}/vote`).send({ up: true });

    // Bilal comments; Ayesha replies: each hears about the other.
    const c = (await bilal.post(`/api/game/designs/${look}/comments`).send({ text: 'Love the khussa!' })).body.comments[0];
    await ayesha.post(`/api/game/designs/${look}/comments`).send({ text: 'Thank you!', parentId: c.id });

    const mine = (await ayesha.get('/api/notifications')).body;
    expect(mine.unread).toBe(2);
    expect(mine.notifications.map((x: any) => [x.type, x.by])).toEqual([
      ['comment', 'Bilal'],
      ['like', 'Bilal'],
    ]);
    expect(mine.notifications[0]).toMatchObject({ lookId: look, text: 'Love the khussa!', read: false });
    expect(mine.notifications[0].lookTitle).toMatch(/Mehndi/);
    const his = (await bilal.get('/api/notifications')).body;
    expect(his.notifications).toEqual([expect.objectContaining({ type: 'reply', by: 'Ayesha', text: 'Thank you!' })]);

    // Opening the bell marks them read.
    await ayesha.post('/api/notifications/read');
    expect((await ayesha.get('/api/notifications/unread')).body.unread).toBe(0);

    // Deleting a comment removes its notifications (and its replies').
    await bilal.delete(`/api/game/comments/${c.id}`);
    expect((await ayesha.get('/api/notifications')).body.notifications.map((x: any) => x.type)).toEqual(['like']);
    expect((await bilal.get('/api/notifications')).body.notifications).toEqual([]);

    // Deleting an account removes what it sent.
    await bilal.delete('/api/me');
    expect((await ayesha.get('/api/notifications')).body.notifications).toEqual([]);
  });
});

describe('Runway sorting', () => {
  it('orders by new, trending (likes and comments, fresher first) and top of the week, with pages', async () => {
    const a = await player('Sara');
    const b = await player('Hina');
    const quiet = await publishLook(a);
    const loved = await publishLook(a);
    const old = await publishLook(b);
    // An old look with many likes: top for all time, but not this week.
    await repos.designs.update({ id: old }, { createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(), up: 50 });
    await b.post(`/api/game/designs/${loved}/vote`).send({ up: true });
    await b.post(`/api/game/designs/${loved}/comments`).send({ text: 'Stunning' });

    const ids = async (sort: string) => (await a.get(`/api/feed?sort=${sort}`)).body.looks.map((l: any) => l.id);
    expect((await ids('new')).indexOf(loved)).toBeLessThan((await ids('new')).indexOf(quiet));
    expect((await ids('trending'))[0]).toBe(loved);
    const top = await ids('top');
    expect(top[0]).toBe(loved);
    expect(top).not.toContain(old);
    expect((await a.get('/api/feed?sort=random')).status).toBe(400);

    // One occasion only (from each look's challenge), in every order, with women's/men's too.
    for (const sort of ['new', 'trending', 'top']) {
      const mehndi = (await a.get(`/api/feed?sort=${sort}&occasion=mehndi`)).body.looks;
      expect(mehndi.length).toBeGreaterThan(0);
      expect(mehndi.every((l: any) => l.challenge.occasion === 'mehndi')).toBe(true);
      expect((await a.get(`/api/feed?sort=${sort}&occasion=baraat`)).body.looks).toEqual([]);
    }
    expect((await a.get('/api/feed?occasion=mehndi&gender=male')).body.looks).toEqual([]);
    expect((await a.get('/api/feed?occasion=picnic')).status).toBe(400);

    // Ranked pages continue by position.
    for (let i = 0; i < 12; i++) await publishLook(a);
    const p1 = (await a.get('/api/feed?sort=trending')).body;
    expect(p1.next).toBe('12');
    const p2 = (await a.get(`/api/feed?sort=trending&before=${p1.next}`)).body;
    expect(p2.looks.length).toBeGreaterThan(0);
    expect(p2.looks.some((l: any) => p1.looks.some((x: any) => x.id === l.id))).toBe(false);
  });
});

describe('shared links', () => {
  it('opens a published look and its comments for anyone, read-only; never a draft', async () => {
    const zara = await player('Zara');
    const look = await publishLook(zara);
    await zara.post(`/api/game/designs/${look}/comments`).send({ text: 'My Mehndi pick' });
    const visitor = request(app);
    const res = await visitor.get(`/api/feed/${look}`);
    expect(res.status).toBe(200);
    expect(res.body.look).toMatchObject({ id: look, by: 'Zara', mine: false, myVote: null, comments: 1 });
    const comments = (await visitor.get(`/api/game/designs/${look}/comments`)).body.comments;
    expect(comments).toEqual([expect.objectContaining({ text: 'My Mehndi pick', mine: false, canDelete: false })]);
    // Liking or commenting still needs an account.
    expect((await visitor.post(`/api/game/designs/${look}/vote`).send({ up: true })).status).toBe(401);
    expect((await visitor.post(`/api/game/designs/${look}/comments`).send({ text: 'hi' })).status).toBe(401);
    expect((await visitor.get('/api/feed')).status).toBe(401);
  });
});

describe('live counts and private notifications', () => {
  it('shows anyone live like and comment counts; only the designer gets the notifications', async () => {
    const sara = await player('Sara Ahmed');
    const omar = await player('Omar');
    const zainab = await player('Zainab');
    const look = await publishLook(sara);
    const anon = request.agent(app); // no account
    const counts = async () => (await anon.get(`/api/feed/counts?ids=${look},nope`)).body.counts;

    // Public: no account needed; unknown ids are left out.
    expect(await counts()).toEqual({ [look]: { likes: 0, comments: 0 } });
    await omar.post(`/api/game/designs/${look}/vote`).send({ up: true });
    await zainab.post(`/api/game/designs/${look}/vote`).send({ up: true });
    await omar.post(`/api/game/designs/${look}/comments`).send({ text: 'Lovely colours' });
    expect(await counts()).toEqual({ [look]: { likes: 2, comments: 1 } });

    // Sara is told; the others see nothing of hers, and nobody can read someone else's list.
    const mine = (await sara.get('/api/notifications')).body;
    expect(mine.unread).toBe(3);
    expect(mine.notifications.map((n: any) => n.type).sort()).toEqual(['comment', 'like', 'like']);
    for (const other of [omar, zainab]) {
      expect((await other.get('/api/notifications/unread')).body.unread).toBe(0);
      expect((await other.get('/api/notifications')).body.notifications).toEqual([]);
    }
    expect((await anon.get('/api/notifications')).status).toBe(401);

    // A draft's counts are never shown.
    const items = (await repos.designs.findOne({ id: look }))!.items;
    const draft = (await sara.post('/api/game/designs').send({ challengeId: C, items, draft: true })).body.design;
    expect((await anon.get(`/api/feed/counts?ids=${draft.id}`)).body.counts).toEqual({});
  });
});
