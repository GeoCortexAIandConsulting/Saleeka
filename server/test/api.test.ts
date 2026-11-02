import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { RulesLlm } from '../src/services/llm.js';
import { modestAnswers } from './fixtures.js';

let repos: Repos;
let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  repos = createMemoryRepos();
  app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
});

async function signedIn(email: string) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/signup')
    .send({ email, password: 'correct-horse-9', name: 'Test User', consent: true });
  expect(res.status).toBe(201);
  return agent;
}

describe('auth and privacy', () => {
  it('rejects signup without consent, short passwords and duplicates', async () => {
    const base = { email: 'a@example.com', password: 'correct-horse-9', name: 'A' };
    expect((await request(app).post('/api/auth/signup').send({ ...base, consent: false })).status).toBe(400);
    expect((await request(app).post('/api/auth/signup').send({ ...base, password: 'short', consent: true })).status).toBe(400);
    expect((await request(app).post('/api/auth/signup').send({ ...base, consent: true })).status).toBe(201);
    expect((await request(app).post('/api/auth/signup').send({ ...base, consent: true })).status).toBe(409);
  });

  it('logs in with the right password only and never leaks the hash', async () => {
    const ok = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'correct-horse-9' });
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).not.toContain('passwordHash');
    expect(ok.headers['set-cookie'][0]).toContain('HttpOnly');
    expect((await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'wrong-password' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong-password' })).status).toBe(401);
  });

  it('protects personal endpoints', async () => {
    for (const path of ['/api/me', '/api/profile', '/api/looks/saved']) {
      expect((await request(app).get(path)).status).toBe(401);
    }
    expect((await request(app).post('/api/chat').send({ message: 'hi' })).status).toBe(401);
    expect((await request(app).post('/api/rounds')).status).toBe(401);
  });
});

describe('taste quiz', () => {
  it('serves questions with brand options filled in', async () => {
    const res = await request(app).get('/api/quiz/questions');
    const brandsQ = res.body.questions.find((q: any) => q.id === 'brandsLiked');
    expect(brandsQ.options.length).toBeGreaterThan(3);
    expect(res.body.questions.length).toBeGreaterThanOrEqual(12);
  });

  it('requires the quiz before rounds or chat', async () => {
    const agent = await signedIn('noquiz@example.com');
    expect((await agent.post('/api/rounds')).status).toBe(409);
    expect((await agent.post('/api/chat').send({ message: 'eid outfit' })).status).toBe(409);
  });

  it('rejects invalid answers', async () => {
    const agent = await signedIn('badquiz@example.com');
    expect((await agent.post('/api/quiz/answers').send({ ...modestAnswers, colorsLiked: ['not-a-colour'] })).status).toBe(400);
    expect((await agent.post('/api/quiz/answers').send({ ...modestAnswers, colorsAvoided: ['emerald'] })).status).toBe(400);
    expect((await agent.post('/api/quiz/answers').send({ ...modestAnswers, coverage: '9' })).status).toBe(400);
  });
});

describe('full shopper journey', () => {
  it('quiz -> 4 ranking rounds -> chat -> swap -> save -> click-out -> report -> delete', async () => {
    const agent = await signedIn('journey@example.com');

    const quiz = await agent.post('/api/quiz/answers').send(modestAnswers);
    expect(quiz.status).toBe(201);
    expect(quiz.body.profile.summary).toContain('modest');
    const before = quiz.body.profile.taste['color:emerald'];

    // Four ranking rounds with tags and a free-text note.
    const seenMains = new Set<string>();
    for (let i = 1; i <= 4; i++) {
      const round = await agent.post('/api/rounds');
      expect(round.status).toBe(200);
      expect(round.body.round.index).toBe(i);
      const looks = round.body.looks;
      expect(looks).toHaveLength(3);
      looks.forEach((l: any) => {
        expect(l.label).toMatch(/^Look [ABC]$/); // neutral labels
        expect(seenMains.has(l.items[0].product.id)).toBe(false); // no repeats across rounds
        seenMains.add(l.items[0].product.id);
      });
      // Asking again returns the same open round, not a new one.
      const again = await agent.post('/api/rounds');
      expect(again.body.round.id).toBe(round.body.round.id);

      const ids = looks.map((l: any) => l.id);
      const submit = await agent.post(`/api/rounds/${round.body.round.id}/submit`).send({
        ranks: [ids[1], ids[2], ids[0]],
        tags: { [ids[1]]: ['love_color'], [ids[0]]: ['too_heavy'] },
        note: i === 1 ? 'I love emerald but the red one is too revealing' : undefined,
      });
      expect(submit.status).toBe(200);
      expect(submit.body.roundsDone).toBe(i);
      expect(submit.body.learned.length).toBeGreaterThan(0);
      // Submitting twice is refused.
      expect((await agent.post(`/api/rounds/${round.body.round.id}/submit`).send({ ranks: ids })).status).toBe(409);
    }
    expect((await agent.post('/api/rounds')).status).toBe(409); // all rounds done

    const profile = (await agent.get('/api/profile')).body.profile;
    expect(profile.roundsDone).toBe(4);
    expect(profile.taste['color:emerald']).not.toBe(before); // taste actually moved
    expect(profile.coverage).toBeGreaterThanOrEqual(4); // coverage only ever increases from feedback

    // Chat: a vague message gets one follow-up, then looks.
    const hi = await agent.post('/api/chat').send({ message: 'hi, need an outfit' });
    expect(hi.status).toBe(200);
    expect(hi.body.looks).toHaveLength(0);
    expect(hi.body.suggestions).toContain('eid');
    const chat = await agent.post('/api/chat').send({ message: 'mehndi outfit, green, under 30k', sessionId: hi.body.sessionId });
    expect(chat.status).toBe(200);
    expect(chat.body.looks.length).toBeGreaterThan(0);
    expect(chat.body.constraints.occasion).toBe('mehndi');
    for (const look of chat.body.looks) {
      expect(look.total).toBeLessThanOrEqual(37500); // 30k, allowing the disclosed 25% stretch
      expect(look.reason).toBeTruthy();
      expect(look.items[0].slot).toBe('main');
      expect(look.items.reduce((n: number, i: any) => n + i.product.price, 0)).toBe(look.total);
    }

    // Swap the footwear: a different product comes back and the total is recomputed.
    const look = chat.body.looks[0];
    const oldShoes = look.items.find((i: any) => i.slot === 'footwear').product.id;
    const swap = await agent.post(`/api/looks/${look.id}/swap`).send({ slot: 'footwear' });
    expect(swap.status).toBe(200);
    const newShoes = swap.body.look.items.find((i: any) => i.slot === 'footwear').product.id;
    expect(newShoes).not.toBe(oldShoes);
    expect(swap.body.look.items.reduce((n: number, i: any) => n + i.product.price, 0)).toBe(swap.body.look.total);

    // Swapping the main outfit never duplicates an outfit shown in a sibling look.
    const shown = new Set(chat.body.looks.map((l: any) => l.items[0].product.id));
    const mainSwap = await agent.post(`/api/looks/${chat.body.looks[1].id}/swap`).send({ slot: 'main' });
    if (mainSwap.status === 200) {
      const newMain = mainSwap.body.look.items[0].product.id;
      expect(shown.has(newMain)).toBe(false);
    } else {
      expect(mainSwap.status).toBe(422); // honest "nothing else fits" is acceptable
    }

    // Save, list, unsave.
    expect((await agent.post(`/api/looks/${look.id}/save`).send({ saved: true })).status).toBe(200);
    const saved = await agent.get('/api/looks/saved');
    expect(saved.body.looks.map((l: any) => l.id)).toContain(look.id);
    expect((await agent.post(`/api/looks/${look.id}/save`).send({ saved: false })).status).toBe(200);
    expect((await agent.get('/api/looks/saved')).body.looks).toHaveLength(0);

    // Click-out is tracked and redirects to the brand's own page.
    const main = swap.body.look.items[0].product;
    const go = await agent.get(`/api/go/${main.id}?look=${look.id}`);
    expect(go.status).toBe(302);
    expect(go.headers.location).toBe(main.url);

    // Partner report needs the admin key and shows real counts.
    expect((await request(app).get(`/api/partners/${main.brandId}/report`)).status).toBe(403);
    const report = await request(app).get(`/api/partners/${main.brandId}/report`).set('x-admin-key', 'test-admin-key');
    expect(report.status).toBe(200);
    expect(report.body.clicks).toBeGreaterThanOrEqual(1);
    expect(report.body.impressions).toBeGreaterThan(report.body.clicks);

    // Privacy: delete everything.
    expect((await agent.delete('/api/me')).body.deleted).toBe(true);
    expect((await agent.get('/api/me')).status).toBe(401);
    expect(await repos.profiles.count({ userId: profile.userId })).toBe(0);
    expect(await repos.looks.count({ userId: profile.userId })).toBe(0);
    expect(await repos.users.count({ id: profile.userId })).toBe(0);
  });

  it('keeps users apart: no access to another user\'s rounds or looks', async () => {
    const a = await signedIn('iso-a@example.com');
    const b = await signedIn('iso-b@example.com');
    await a.post('/api/quiz/answers').send(modestAnswers);
    await b.post('/api/quiz/answers').send(modestAnswers);
    const round = await a.post('/api/rounds');
    const ids = round.body.looks.map((l: any) => l.id);
    expect((await b.post(`/api/rounds/${round.body.round.id}/submit`).send({ ranks: ids })).status).toBe(404);
    expect((await b.post(`/api/looks/${ids[0]}/save`).send({ saved: true })).status).toBe(404);
    expect((await b.post(`/api/looks/${ids[0]}/swap`).send({ slot: 'footwear' })).status).toBe(404);
  });

  it('validates round submissions', async () => {
    const agent = await signedIn('validate@example.com');
    await agent.post('/api/quiz/answers').send(modestAnswers);
    const round = await agent.post('/api/rounds');
    const ids = round.body.looks.map((l: any) => l.id);
    const id = round.body.round.id;
    expect((await agent.post(`/api/rounds/${id}/submit`).send({ ranks: [ids[0]] })).status).toBe(400);
    expect((await agent.post(`/api/rounds/${id}/submit`).send({ ranks: [ids[0], ids[0], ids[1]] })).status).toBe(400);
    expect((await agent.post(`/api/rounds/${id}/submit`).send({ ranks: ids, tags: { [ids[0]]: ['hack'] } })).status).toBe(400);
    expect((await agent.post(`/api/rounds/${id}/submit`).send({ ranks: ids, tags: { nope: ['love_color'] } })).status).toBe(400);
  });

  it('is honest when nothing fits and discloses relaxed constraints', async () => {
    const agent = await signedIn('relax@example.com');
    await agent.post('/api/quiz/answers').send(modestAnswers);
    const impossible = await agent.post('/api/chat').send({ message: 'eid outfit under 1000' });
    expect(impossible.body.looks).toHaveLength(0);
    expect(impossible.body.reply).toMatch(/could not find/i);
    const narrow = await agent.post('/api/chat').send({ message: 'office outfit, red, from Demo Heritage, under 12k' });
    if (narrow.body.looks.length) expect(Array.isArray(narrow.body.notes)).toBe(true);
  });
});
