/**
 * "What's on your mind today?": a player's own Studio brief instead of a set challenge.
 *
 * The player writes anything ("something casual in black for winter, under 5k") and/or picks from a
 * few dropdowns. The words are read the same way the stylist reads a request; the dropdowns win
 * where both say something. The result is a private 'custom' challenge (never in the public list),
 * so the rest of the Studio, the preview and the Runway work exactly as for a set challenge.
 *
 * Only the structured brief is kept, never the player's words.
 */
import { createHash } from 'node:crypto';
import type { Repos } from '../db/index.js';
import { AppError } from '../errors.js';
import type { Challenge, Gender, Occasion, Product, Season, Tier } from '../types.js';
import { currentSeason } from './composer.js';
import { challengeKey, gameItems, publicChallenge } from './game.js';
import { parseRequestRules, type Llm } from './llm.js';

/** The colour dropdown: families, each read the way the stylist reads the word. */
export const COLOUR_FAMILIES = ['black', 'white', 'red', 'pink', 'green', 'blue', 'yellow', 'purple', 'orange', 'brown', 'grey', 'gold', 'pastel'] as const;
export type ColourFamily = (typeof COLOUR_FAMILIES)[number];

export const BUDGETS = ['budget', 'mid', 'premium'] as const;
export const COVERAGES = ['relaxed', 'modest'] as const;

export interface BriefInput {
  text?: string;
  gender: Gender;
  occasion?: Occasion;
  colour?: ColourFamily;
  budget?: Tier;
  coverage?: (typeof COVERAGES)[number];
  /** Brands the player kept from the ones that fit (empty or absent: every brand) */
  brands?: string[];
}

export interface BrandFit {
  id: string;
  name: string;
  tier: Tier;
  /** Outfits from this brand that fit the brief */
  count: number;
}

const MALE_WORDS = /\b(men|man|mens|men's|male|husband|groom|dulha|boy|boys|him|his|brother|bhai|father|abbu|abba|son|beta|sherwani|waistcoat|prince coat)\b/i;
const FEMALE_WORDS = /\b(women|woman|female|wife|bride|dulhan|girl|girls|her|sister|behan|mother|ammi|daughter|beti|dupatta|saree|sari|lehenga)\b/i;
const WINTER_WORDS = /\b(winter|winters|sardi|sardiyon|thand|thandi|cold|chilly|khaddar|karandi|velvet|shawl|coat|sweater|jacket)\b/i;
const SUMMER_WORDS = /\b(summer|summers|garmi|garmiyon|hot|lawn|breezy)\b/i;

/** Who the look is for: the words win only when they clearly say the other side. */
function genderFrom(text: string, picked: Gender): Gender {
  if (picked === 'female' && MALE_WORDS.test(text) && !FEMALE_WORDS.test(text)) return 'male';
  if (picked === 'male' && FEMALE_WORDS.test(text) && !MALE_WORDS.test(text)) return 'female';
  return picked;
}

function seasonFrom(text: string): Season | undefined {
  if (WINTER_WORDS.test(text) && !SUMMER_WORDS.test(text)) return 'winter';
  if (SUMMER_WORDS.test(text) && !WINTER_WORDS.test(text)) return 'summer';
  return undefined;
}

/** Brands with fitting outfits, most first. */
export function brandsThatFit(catalog: Product[], c: Challenge): BrandFit[] {
  const mains = gameItems(catalog, { ...c, brandIds: undefined }, Infinity).main ?? [];
  const by = new Map<string, BrandFit>();
  for (const p of mains) {
    const b = by.get(p.brandId) ?? { id: p.brandId, name: p.brandName, tier: p.tier, count: 0 };
    b.count++;
    by.set(p.brandId, b);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Reads the brief, makes (or reuses) its private challenge and lists the brands that fit it.
 * If nothing fits, the colour, then the budget, then the price cap are let go, and `relaxed` says so.
 */
export async function makeBrief(repos: Repos, llm: Llm, catalog: Product[], input: BriefInput) {
  const text = (input.text ?? '').trim();
  const known = await repos.brands.find();
  let words = text ? parseRequestRules(text, { brands: known }) : { colors: [], brands: [] as string[] };
  if (text) words = await llm.parseRequest(text, { brands: known }).catch(() => words);

  const gender = genderFrom(text, input.gender);
  const male = gender === 'male';
  const occasion: Occasion = input.occasion ?? words.occasion ?? 'casual';
  const colors = input.colour ? parseRequestRules(input.colour, { brands: [] }).colors : words.colors;
  const modest = input.coverage === 'modest' || (input.coverage !== 'relaxed' && Boolean(words.extraModesty));
  const coverage = male ? 1 : modest ? 4 : input.coverage === 'relaxed' ? 2 : 3;
  const wantsDupatta = !male && (words.wantsDupatta ?? modest);
  const named = known.filter((b) => (input.brands?.length ? input.brands : words.brands).includes(b.id)).map((b) => b.id);

  const brief: Omit<Challenge, 'id' | 'key' | 'source' | 'asks' | 'createdAt'> = {
    occasion,
    colors: [...new Set(colors)].sort().slice(0, 6),
    coverage,
    wantsDupatta,
    ...(male ? { gender } : {}),
    ...(seasonFrom(text) ? { season: seasonFrom(text) } : {}),
    ...(input.budget ? { tiers: [input.budget] } : {}),
    ...(named.length ? { brandIds: named.sort() } : {}),
    ...(words.budgetMax ? { maxPrice: words.budgetMax } : {}),
  };

  // Nothing fits: let go of the narrowest wishes first, and say which.
  const relaxed: string[] = [];
  const draft = (b: typeof brief) => ({ ...b, id: '', key: '', source: 'custom' as const, asks: 0, createdAt: '' });
  let fits = brandsThatFit(catalog, draft(brief));
  for (const [field, label] of [['colors', 'colour'], ['maxPrice', 'price'], ['tiers', 'budget'], ['season', 'season']] as const) {
    if (fits.length) break;
    const has = field === 'colors' ? brief.colors.length : brief[field];
    if (!has) continue;
    if (field === 'colors') brief.colors = [];
    else delete brief[field];
    relaxed.push(label);
    fits = brandsThatFit(catalog, draft(brief));
  }
  if (!fits.length) throw new AppError(404, 'Nothing in stock fits that yet. Try another occasion or fewer wishes.');
  // Kept brands that have nothing for this brief are dropped rather than leaving an empty Studio.
  if (brief.brandIds) {
    brief.brandIds = brief.brandIds.filter((id) => fits.some((f) => f.id === id));
    if (!brief.brandIds.length) {
      delete brief.brandIds;
      relaxed.push('brands');
    }
  }

  // Own keys, so a brief never takes over (or clashes with) a set challenge that asks the same.
  const key = `custom|${challengeKey(brief)}`;
  let challenge = await repos.challenges.findOne({ key });
  if (!challenge) {
    const id = `brief-${createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
    challenge = { ...brief, id, key, source: 'custom', asks: 0, createdAt: new Date().toISOString() };
    // Two players with the same brief at the same moment: the second one uses the first's.
    await repos.challenges.insert(challenge).catch(() => undefined);
    challenge = (await repos.challenges.findOne({ id })) ?? challenge;
  }
  return {
    challenge: publicChallenge(challenge, 0),
    brands: fits,
    relaxed,
    /** The season the Studio ranks for when the brief names none */
    season: brief.season ?? currentSeason(),
  };
}
