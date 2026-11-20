import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryRepos } from '../src/db/index.js';
import { RulesLlm } from '../src/services/llm.js';
import { signUp } from './helpers.js';

type P = { id: string; includesBottom: boolean; includesDupatta: boolean };
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const app = await createApp({ repos: createMemoryRepos(), llm: new RulesLlm(), rateLimit: false });
  agent = request.agent(app);
  await signUp(agent, { email: 'multi@example.com', password: 'correct-horse-9', name: 'Multi', consent: true });
});

/** A complete look for a challenge, plus `extra` pieces of one slot. */
async function look(challengeId: string, slot: string, extra: number) {
  const { items } = (await agent.get(`/api/game/challenges/${challengeId}/items`).expect(200)).body as { items: Record<string, P[]> };
  const main = items.main[0];
  const pick = [{ slot: 'main', productId: main.id }];
  if (!main.includesBottom) pick.push({ slot: 'bottom', productId: items.bottom[0].id });
  pick.push({ slot: 'footwear', productId: items.footwear[0].id });
  const pool = items[slot] ?? [];
  expect(pool.length).toBeGreaterThanOrEqual(extra);
  for (const p of pool.slice(0, extra)) pick.push({ slot, productId: p.id });
  return pick;
}

const send = (challengeId: string, items: object[]) => agent.post('/api/game/designs').send({ challengeId, items, draft: true });

describe('several pieces in one slot', () => {
  it('a men’s look can wear more than one accessory (a watch and a belt)', async () => {
    const items = await look('seed-men-casual', 'accessory', 2);
    const res = await send('seed-men-casual', items);
    expect(res.status).toBe(201);
    expect(res.body.design.items.filter((i: { slot: string }) => i.slot === 'accessory')).toHaveLength(2);
  });

  it('a women’s look can wear up to three pieces of jewellery, not four', async () => {
    const three = await look('seed-university-easy', 'jewelry', 3);
    const res = await send('seed-university-easy', three);
    expect(res.status).toBe(201);
    expect(res.body.design.total).toBeGreaterThan(0);
    const four = await look('seed-university-easy', 'jewelry', 4);
    const r4 = await send('seed-university-easy', four);
    expect(r4.status).toBe(400);
    expect(r4.body.error).toMatch(/up to 3/i);
  });

  it('the same piece cannot be added twice', async () => {
    const items = await look('seed-university-easy', 'jewelry', 1);
    const again = items[items.length - 1];
    expect((await send('seed-university-easy', [...items, again])).status).toBe(400);
  });

  it('other slots still take one piece', async () => {
    const items = await look('seed-university-easy', 'footwear', 1);
    // look() already added one pair of shoes; a second pair makes two.
    const res = await send('seed-university-easy', items);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/one piece per slot/i);
  });
});
