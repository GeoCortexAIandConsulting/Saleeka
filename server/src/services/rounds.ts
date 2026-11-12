import type { Repos, ProfileDoc } from '../db/index.js';
import type { Look, Occasion, RoundRecord } from '../types.js';
import { composeLooks, type ComposeRequest, type ComposedLook } from './composer.js';
import { styleLooks } from './stylist.js';
import type { Llm } from './llm.js';
import { persistLooks, uid, hydrateLooks, type HydratedLook } from './looks.js';
import { addWeight, productFeatures } from './taste.js';
import { summarize } from './profile.js';
import { AppError } from '../errors.js';

export const MAX_ROUNDS = 4;

export const QUICK_TAGS = [
  'love_color',
  'love_style',
  'too_heavy',
  'too_plain',
  'too_bold',
  'not_my_brand',
  'too_revealing',
  'wrong_occasion',
] as const;
export type QuickTag = (typeof QUICK_TAGS)[number];

export async function createRound(
  repos: Repos,
  profile: ProfileDoc,
  llm?: Llm,
): Promise<{ round: RoundRecord; looks: HydratedLook[] }> {
  const previous = await repos.rounds.find({ userId: profile.userId });
  const open = previous.find((r) => !r.completedAt);
  if (open) {
    const looks = await repos.looks.find({ id: { $in: open.lookIds } });
    return { round: open, looks: await hydrateLooks(repos, orderBy(looks, open.lookIds)) };
  }
  if (previous.length >= MAX_ROUNDS) throw new AppError(409, 'All ranking rounds are complete');

  const index = previous.length + 1;
  const occasion: Occasion = profile.occasions[(index - 1) % profile.occasions.length];
  const seenMains = new Set<string>();
  for (const r of previous) {
    const ls = await repos.looks.find({ id: { $in: r.lookIds } });
    ls.forEach((l) => seenMains.add(l.items.find((i) => i.slot === 'main')!.productId));
  }
  // The stylist and its ranking rounds dress women only, so menswear stays out.
  const catalog = (await repos.products.find()).filter((p) => p.gender !== 'male');
  // Find a request that can be met, then let the stylist (when a model is set up) style it as complete outfits.
  let request: ComposeRequest = { occasion, excludeMainIds: [...seenMains] };
  let composed = composeLooks(catalog, profile, request);
  if (composed.length < 3) composed = composeLooks(catalog, profile, (request = { occasion }));
  if (composed.length === 0) composed = composeLooks(catalog, profile, (request = {})); // any of the user's occasions
  if (llm && composed.length) composed = (await styleLooks(llm, catalog, profile, request)).looks;
  if (composed.length === 0) throw new AppError(422, 'No looks match your preferences yet. Try relaxing coverage or budget.');

  // Neutral labels and a rotated order so position and wording do not bias the ranking.
  const neutral = composed.map((c, i): ComposedLook => ({ ...c, label: `Look ${'ABC'[i]}` }));
  const rotated = rotate(neutral, index % neutral.length);
  const looks = await persistLooks(repos, profile.userId, rotated, 'round');
  const round: RoundRecord = {
    id: uid(),
    userId: profile.userId,
    index,
    lookIds: looks.map((l) => l.id),
    createdAt: new Date().toISOString(),
  };
  await repos.rounds.insert(round);
  return { round, looks };
}

export interface SubmitInput {
  ranks: string[];
  tags?: Record<string, string[]>;
  note?: string;
}

const RANK_FACTOR = [0.6, 0.1, -0.5];

export async function submitRound(
  repos: Repos,
  llm: Llm,
  profile: ProfileDoc,
  roundId: string,
  input: SubmitInput,
): Promise<{ profile: ProfileDoc; roundsDone: number; roundsLeft: number; learned: string[] }> {
  const round = await repos.rounds.findOne({ id: roundId, userId: profile.userId });
  if (!round) throw new AppError(404, 'Round not found');
  if (round.completedAt) throw new AppError(409, 'Round already submitted');
  const expected = [...round.lookIds].sort().join(',');
  if ([...new Set(input.ranks)].sort().join(',') !== expected) {
    throw new AppError(400, 'Rank every look in the round exactly once');
  }
  const tags = input.tags ?? {};
  for (const [lookId, list] of Object.entries(tags)) {
    if (!round.lookIds.includes(lookId)) throw new AppError(400, 'Tag for a look that is not in this round');
    const bad = list.find((t) => !(QUICK_TAGS as readonly string[]).includes(t));
    if (bad) throw new AppError(400, `Unknown tag: ${bad}`);
  }

  const looks = await hydrateLooks(repos, await repos.looks.find({ id: { $in: round.lookIds } }));
  const byId = new Map(looks.map((l) => [l.id, l]));
  const taste = { ...profile.taste };
  const learned: string[] = [];

  // 1. Rank signal: every item in a look nudges its features, the main piece most.
  input.ranks.forEach((lookId, pos) => {
    const look = byId.get(lookId)!;
    for (const it of look.items) {
      const weight = RANK_FACTOR[pos] * (it.slot === 'main' ? 1 : 0.4);
      for (const f of productFeatures(it.product)) addWeight(taste, f, weight);
    }
  });

  // 2. Quick tags: explicit reasons are stronger than rank alone.
  let coverage = profile.coverage;
  for (const [lookId, list] of Object.entries(tags)) {
    const main = byId.get(lookId)!.items.find((i) => i.slot === 'main')!.product;
    for (const tag of list as QuickTag[]) {
      switch (tag) {
        case 'love_color':
          addWeight(taste, `color:${main.colors[0]}`, 1.5);
          learned.push(`You like ${main.colors[0]}`);
          break;
        case 'love_style':
          addWeight(taste, `silhouette:${main.silhouette}`, 1.2);
          learned.push(`You like the ${main.silhouette} cut`);
          break;
        case 'too_heavy':
          [2, 3].forEach((n) => addWeight(taste, `embell:${n}`, -1));
          [0, 1].forEach((n) => addWeight(taste, `embell:${n}`, 0.5));
          learned.push('You prefer less embellishment');
          break;
        case 'too_plain':
          [0, 1].forEach((n) => addWeight(taste, `embell:${n}`, -1));
          [2, 3].forEach((n) => addWeight(taste, `embell:${n}`, 0.6));
          learned.push('You want more detail and embellishment');
          break;
        case 'too_bold':
          addWeight(taste, `color:${main.colors[0]}`, -1);
          addWeight(taste, `family:${productFeatures(main).find((f) => f.startsWith('family:'))?.slice(7)}`, -0.6);
          learned.push('You prefer softer colours');
          break;
        case 'not_my_brand':
          addWeight(taste, `brand:${main.brandId}`, -2);
          learned.push(`You would rather skip ${main.brandName}`);
          break;
        case 'too_revealing':
          coverage = Math.min(5, coverage + 1);
          learned.push('You want more coverage');
          break;
        case 'wrong_occasion':
          break;
      }
    }
  }

  // 3. Free text: a model (or rules) turns it into structured updates.
  let colorsAvoided = profile.colorsAvoided;
  if (input.note?.trim()) {
    const fb = await llm.parseFeedback(input.note.slice(0, 600));
    fb.likeColors.forEach((c) => {
      addWeight(taste, `color:${c}`, 1.5);
      learned.push(`You like ${c}`);
    });
    fb.dislikeColors.forEach((c) => {
      addWeight(taste, `color:${c}`, -2);
      learned.push(`Less ${c} from now on`);
    });
    if (fb.wantsMoreCoverage) coverage = Math.min(5, coverage + 1);
    if (fb.wantsLessEmbellishment) [2, 3].forEach((n) => addWeight(taste, `embell:${n}`, -1));
    if (fb.wantsMoreEmbellishment) [2, 3].forEach((n) => addWeight(taste, `embell:${n}`, 1));
  }

  const roundsDone = profile.roundsDone + 1;
  const next: ProfileDoc = {
    ...profile,
    taste,
    coverage,
    colorsAvoided,
    roundsDone,
    updatedAt: new Date().toISOString(),
  };
  next.summary = summarize(next);
  await repos.profiles.upsert(next);
  await repos.rounds.update(
    { id: round.id },
    { ranks: input.ranks, tags, note: input.note, completedAt: new Date().toISOString() },
  );
  return { profile: next, roundsDone, roundsLeft: Math.max(0, MAX_ROUNDS - roundsDone), learned: [...new Set(learned)] };
}

function rotate<T>(arr: T[], by: number): T[] {
  return arr.map((_, i) => arr[(i + by) % arr.length]);
}

function orderBy(looks: Look[], ids: string[]): Look[] {
  const m = new Map(looks.map((l) => [l.id, l]));
  return ids.map((id) => m.get(id)!).filter(Boolean);
}
