import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { featuredIds, LAUNCH, launchOn, weekEnds, weekIndex } from '../src/services/game.js';
import { RulesLlm } from '../src/services/llm.js';
import { signUp } from './helpers.js';

let repos: Repos;
let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  repos = createMemoryRepos();
  app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
});

let n = 0;
async function player(name: string) {
  const agent = request.agent(app);
  expect((await signUp(agent, { email: `wk${++n}@example.com`, password: 'correct-horse-9', name, consent: true })).status).toBe(201);
  return agent;
}

async function publish(agent: ReturnType<typeof request.agent>, challengeId: string) {
  const { body } = await agent.get(`/api/game/challenges/${challengeId}/items`);
  const cheapest = (slot: string) => [...body.items[slot]].sort((a: any, b: any) => a.price - b.price)[0];
  const main = cheapest('main');
  const items = [{ slot: 'main', productId: main.id }];
  if (!main.includesBottom) items.push({ slot: 'bottom', productId: cheapest('bottom').id });
  if (body.challenge.wantsDupatta && !main.includesDupatta && body.items.dupatta) items.push({ slot: 'dupatta', productId: cheapest('dupatta').id });
  items.push({ slot: 'footwear', productId: cheapest('footwear').id });
  for (const slot of body.challenge.required ?? []) if (!items.some((x) => x.slot === slot)) items.push({ slot, productId: cheapest(slot).id });
  const res = await agent.post('/api/game/designs').send({ challengeId, items });
  expect(res.status).toBe(201);
  return res.body.design.id as string;
}

/** Runs the API as if it were this moment (only the clock is changed; timers run as usual). */
function pretendItIs(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

describe('challenge of the week', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('features the launch challenges only during the launch', () => {
    expect(launchOn(Date.parse('2025-01-13T12:00:00+05:00'))).toBe(false);
    expect(launchOn(Date.parse('2026-06-10T12:00:00+05:00'))).toBe(false);
    expect(launchOn(Date.parse('2026-11-28T12:00:00+05:00'))).toBe(true);
    expect(launchOn(Date.parse('2026-12-14T12:00:00+05:00'))).toBe(false);
    expect(featuredIds(Date.parse('2026-11-28T12:00:00+05:00'))).toEqual(LAUNCH.map((c) => `seed-${c.slug}`));
  });

  it('features one women’s and one men’s challenge, the same all week, moving on each Monday (Pakistan time)', () => {
    // Monday 13 Jan 2025, 00:00 in Pakistan = Sunday 12 Jan, 19:00 UTC.
    const monday = Date.UTC(2025, 0, 12, 19, 0, 0);
    expect(weekIndex(monday - 1)).toBe(weekIndex(monday) - 1);
    expect(featuredIds(monday)).toEqual(featuredIds(monday + 6.9 * 24 * 3600 * 1000));
    expect(featuredIds(monday)).not.toEqual(featuredIds(monday + 7 * 24 * 3600 * 1000));
    expect(new Date(weekEnds(monday)).getTime()).toBe(monday + 7 * 24 * 3600 * 1000);
    const [women, men] = featuredIds(monday);
    expect(women).toMatch(/^seed-(?!men-)/);
    expect(men).toMatch(/^seed-men-/);
  });

  it('lists this week’s challenges first, and ranks this week’s looks for them by likes', async () => {
    // An ordinary week, after the launch: one women's and one men's challenge.
    pretendItIs('2026-12-14T12:00:00+05:00');
    const a = await player('Mahnoor');
    const b = await player('Danish');
    const list = (await a.get('/api/game/challenges')).body.challenges;
    const [women] = featuredIds();
    // The Studio lists women's and men's challenges apart: each list starts with its featured one.
    expect(list.filter((c: any) => c.gender === 'female')[0]).toMatchObject({ id: women, featured: true });
    expect(list.filter((c: any) => c.featured)).toHaveLength(2);

    const quiet = await publish(a, women);
    const loved = await publish(a, women);
    await b.post(`/api/game/designs/${loved}/vote`).send({ up: true });
    const week = (await b.get('/api/game/weekly')).body;
    expect(week.challenges.map((c: any) => c.id)).toEqual(featuredIds());
    expect(week.challenges[0].designs).toBe(2);
    expect(week.top.map((l: any) => l.id).slice(0, 2)).toEqual([loved, quiet]);
    expect(new Date(week.endsAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('during the launch, features every launch challenge with its prize, until the launch ends', async () => {
    pretendItIs('2026-11-28T12:00:00+05:00');
    const a = await player('Hira');
    const launch = LAUNCH.map((c) => `seed-${c.slug}`);
    const list = (await a.get('/api/game/challenges')).body.challenges;
    expect(list.filter((c: any) => c.featured).map((c: any) => c.id).sort()).toEqual([...launch].sort());
    expect(list.find((c: any) => c.id === launch[0]).prize).toMatch(/voucher/);
    const look = await publish(a, launch[0]);
    const week = (await a.get('/api/game/weekly')).body;
    expect(week).toMatchObject({ launch: true });
    expect(week.challenges.map((c: any) => c.id)).toEqual(launch);
    expect(week.top.map((l: any) => l.id)).toContain(look);
    expect(new Date(week.endsAt).toISOString()).toBe(new Date('2026-12-04T23:59:59+05:00').toISOString());
  });
});

describe('player profiles', () => {
  it('shows a player’s first name, published looks and likes earned, never drafts or their email', async () => {
    const a = await player('Ayesha Khan');
    const b = await player('Bilal');
    const look = await publish(a, 'seed-mehndi-mustard');
    await b.post(`/api/game/designs/${look}/vote`).send({ up: true });
    const feedLook = (await b.get(`/api/feed/${look}`)).body.look;
    const res = await b.get(`/api/players/${feedLook.byId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Ayesha', me: false, stats: { looks: 1, likes: 1 } });
    expect(res.body.looks.map((l: any) => l.id)).toEqual([look]);
    expect(JSON.stringify(res.body)).not.toMatch(/@example\.com|Khan/);
    expect((await a.get(`/api/players/${feedLook.byId}`)).body.me).toBe(true);
    expect((await b.get('/api/players/nobody')).status).toBe(404);
    expect((await request(app).get(`/api/players/${feedLook.byId}`)).status).toBe(401);
  });
});
