import { describe, expect, it } from 'vitest';
import { formality, stylingOptions } from '../src/services/composer.js';
import { RulesLlm, type Llm, type StyleBrief, type StylePick } from '../src/services/llm.js';
import { styleLooks } from '../src/services/stylist.js';
import { catalog, profileFor } from './fixtures.js';

const winter = new Date('2026-11-01T10:00:00Z');

/** A fake stylist that returns whatever we tell it to, given the brief. */
function fakeStylist(answer: (brief: StyleBrief) => StylePick[] | null): Llm & { briefs: StyleBrief[] } {
  const rules = new RulesLlm();
  const briefs: StyleBrief[] = [];
  return {
    name: 'fake',
    briefs,
    parseRequest: rules.parseRequest.bind(rules),
    parseFeedback: rules.parseFeedback.bind(rules),
    explain: rules.explain.bind(rules),
    async style(brief) {
      briefs.push(brief);
      return answer(brief);
    },
  };
}

const ids = (l: { items: Array<{ slot: string; product: { id: string } }> }) => Object.fromEntries(l.items.map((i) => [i.slot, i.product.id]));
/** Brief items are one-line strings: "P12 | title | brand | ..."; this returns the alias. */
const aliasOf = (line?: string) => line?.split(' | ')[0];

describe('AI stylist', () => {
  const profile = profileFor();
  const req = { occasion: 'eid' as const };

  it('gives the model only shortlisted, rule-approved items, under short aliases', async () => {
    const llm = fakeStylist(() => null);
    await styleLooks(llm, catalog, profile, req);
    const brief = llm.briefs[0];
    expect(brief.outfits.length).toBeGreaterThan(2);
    for (const o of brief.outfits) {
      expect(aliasOf(o.item)).toMatch(/^P\d+$/);
      for (const list of Object.values(o.options)) for (const item of list) expect(aliasOf(item)).toMatch(/^P\d+$/);
    }
    const realIds = catalog.map((p) => p.id);
    const text = JSON.stringify(brief);
    expect(realIds.some((id) => text.includes(`"${id}`) || text.includes(` ${id} `))).toBe(false); // no real ids leak in
  });

  it('uses the stylist picks and notes when they are valid', async () => {
    const llm = fakeStylist((brief) =>
      brief.outfits.slice(0, 3).map((o) => ({
        main: aliasOf(o.item)!,
        bottom: aliasOf(o.options.bottom?.[1] ?? o.options.bottom?.[0]),
        dupatta: aliasOf(o.options.dupatta?.[0]),
        footwear: aliasOf(o.options.footwear?.[1] ?? o.options.footwear?.[0]),
        bag: aliasOf(o.options.bag?.[0]),
        jewelry: aliasOf(o.options.jewelry?.[0]),
        note: `Stylist note for ${aliasOf(o.item)}`,
      })),
    );
    const out = await styleLooks(llm, catalog, profile, req);
    expect(out.styledByAi).toBe(3);
    expect(out.looks).toHaveLength(3);
    // Notes are kept only for looks exactly as the stylist picked them.
    expect(out.notes.filter((n) => n.startsWith('Stylist note')).length).toBeGreaterThan(0);
    expect(out.looks.map((l) => l.label)).toEqual(expect.arrayContaining(['Best match', 'Fresh pick']));
  });

  it('never lets an invented, foreign or missing piece through, and keeps looks complete and in budget', async () => {
    const llm = fakeStylist((brief) => {
      const [a, b] = brief.outfits;
      return [
        // An id that does not exist, a shoe from another outfit's shortlist, no bag or jewellery.
        { main: aliasOf(a.item)!, footwear: aliasOf(b.options.footwear?.[0]) ?? 'P9999', bag: 'P424242', note: 'x' },
        // An outfit that is not in the brief at all.
        { main: 'P123456', note: 'y' },
      ];
    });
    const { options, maxBudget } = stylingOptions(catalog, profile, req, {}, winter);
    const out = await styleLooks(llm, catalog, profile, req);
    expect(out.looks).toHaveLength(3);
    const first = out.looks[0];
    const option = options.find((o) => o.main.id === first.items[0].product.id)!;
    const got = ids(first);
    // Footwear came from this outfit's own shortlist, and bag + jewellery were filled in.
    expect(option.options.footwear!.map((p) => p.id)).toContain(got.footwear);
    if (option.options.bag?.length) expect(got.bag).toBeDefined();
    if (option.options.jewelry?.length) expect(got.jewelry).toBeDefined();
    if (option.needs.bottom) expect(got.bottom).toBeDefined();
    for (const look of out.looks) {
      expect(look.total).toBeLessThanOrEqual(maxBudget);
      expect(look.items.every((i) => i.product.inStock)).toBe(true);
    }
    expect(out.styledByAi).toBe(1); // the invalid second pick was replaced by the rule composer
    expect(out.notes[0]).toBe(''); // pieces were filled in, so the stylist's note no longer fits
  });

  it('falls back to the rule composer when the model is unavailable', async () => {
    const out = await styleLooks(new RulesLlm(), catalog, profile, req);
    expect(out.styledByAi).toBe(0);
    expect(out.looks).toHaveLength(3);
    for (const look of out.looks) {
      const slots = look.items.map((i) => i.slot);
      expect(slots).toEqual(expect.arrayContaining(['main', 'footwear', 'jewelry']));
    }
  });

  it('matches accessories to how dressed-up the outfit is', () => {
    const formal = catalog.find((p) => p.slot === 'main' && p.embellishment === 3)!;
    const casual = catalog.find((p) => p.slot === 'main' && p.embellishment === 0)!;
    const heel = catalog.find((p) => p.slot === 'footwear' && p.silhouette === 'heel')!;
    const sneaker = catalog.find((p) => p.slot === 'footwear' && p.silhouette === 'sneaker')!;
    expect(formality(formal)).toBeGreaterThan(formality(casual));
    expect(formality(heel)).toBeGreaterThan(formality(sneaker));
  });
});
