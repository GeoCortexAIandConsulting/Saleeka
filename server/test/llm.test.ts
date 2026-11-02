import { describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleLlm, parseFeedbackRules, parseRequestRules } from '../src/services/llm.js';
import { DEMO_BRANDS } from '../src/data/seed.js';
import { profileFor } from './fixtures.js';

const ctx = { brands: DEMO_BRANDS };

describe('rule-based request parsing', () => {
  it('reads occasion, colours, brands and budget from English', () => {
    const c = parseRequestRules('I need a mehndi outfit, yellow or green, from Demo Loom or Studio, under 20k', ctx);
    expect(c.occasion).toBe('mehndi');
    expect(c.colors).toEqual(expect.arrayContaining(['mustard', 'emerald']));
    expect(c.brands).toEqual(expect.arrayContaining(['b_loom', 'b_studio']));
    expect(c.budgetMax).toBe(20000);
  });
  it('understands Roman Urdu', () => {
    const c = parseRequestRules('shaadi ke liye gulabi suit chahiye, budget 15 hazar', ctx);
    expect(c.occasion).toBe('baraat');
    expect(c.colors).toEqual(expect.arrayContaining(['pink', 'blush']));
    expect(c.budgetMax).toBe(15000);
  });
  it('handles plain rupee amounts and modesty hints', () => {
    const c = parseRequestRules('office wear, full sleeves, Rs. 12,000', ctx);
    expect(c.occasion).toBe('office');
    expect(c.budgetMax).toBe(12000);
    expect(c.extraModesty).toBe(true);
  });
  it('returns no occasion for vague messages', () => {
    expect(parseRequestRules('hi', ctx).occasion).toBeUndefined();
  });
});

describe('rule-based feedback parsing', () => {
  it('extracts colour likes and dislikes and coverage hints', () => {
    const f = parseFeedbackRules('I love emerald. The red one is too revealing and too heavy.');
    expect(f.likeColors).toContain('emerald');
    expect(f.dislikeColors).toContain('red');
    expect(f.wantsMoreCoverage).toBe(true);
    expect(f.wantsLessEmbellishment).toBe(true);
  });
});

describe('OpenAI-compatible provider', () => {
  const reply = (content: string) =>
    vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));

  it('uses model output but drops invented colours and brands', async () => {
    const f = reply('Sure! {"occasion":"eid","colors":["emerald","not-a-colour"],"brands":["b_loom","b_fake"],"budgetMax":18000,"extraModesty":false}');
    const llm = new OpenAiCompatibleLlm('http://x/v1', 'm', '', f as unknown as typeof fetch);
    const c = await llm.parseRequest('eid ke liye hara', ctx);
    expect(c.occasion).toBe('eid');
    expect(c.colors).toContain('emerald');
    expect(c.colors).not.toContain('not-a-colour');
    expect(c.brands).toEqual(['b_loom']);
    expect(c.budgetMax).toBe(18000);
  });
  it('falls back to rules when the model fails or returns garbage', async () => {
    const bad = vi.fn(async () => new Response('nope', { status: 500 }));
    const llm = new OpenAiCompatibleLlm('http://x/v1', 'm', '', bad as unknown as typeof fetch);
    const c = await llm.parseRequest('office outfit under 10k', ctx);
    expect(c.occasion).toBe('office');
    const garbage = new OpenAiCompatibleLlm('http://x/v1', 'm', '', reply('not json at all') as unknown as typeof fetch);
    expect((await garbage.parseRequest('walima look', ctx)).occasion).toBe('walima');
  });
  it('falls back to template explanations when the count is wrong', async () => {
    const llm = new OpenAiCompatibleLlm('http://x/v1', 'm', '', reply('{"reasons":["only one"]}') as unknown as typeof fetch);
    const facts = ['A', 'B'].map((label) => ({
      label, occasion: null, total: 9000, tasteHits: [],
      items: [{ slot: 'main', title: 'emerald kurta', brand: 'Demo Loom', price: 5000, colors: ['emerald'] }],
    }));
    const out = await llm.explain(facts, profileFor());
    expect(out).toHaveLength(2);
    expect(out[0].toLowerCase()).toContain('emerald kurta');
    expect(out[0][0]).toBe(out[0][0].toUpperCase());
  });
});
