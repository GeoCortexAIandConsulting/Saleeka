import type { Repos, ProfileDoc } from '../db/index.js';
import type { ChatConstraints, ChatSession, Occasion } from '../types.js';
import { composeLooks, swapSlot, type ComposeRequest, type ComposedLook } from './composer.js';
import { factsFor, hydrateLooks, persistLooks, sumPrice, uid, type HydratedLook } from './looks.js';
import type { Llm } from './llm.js';
import { styleLooks } from './stylist.js';
import { AppError } from '../errors.js';
import type { Slot } from '../types.js';

export interface ChatReply {
  sessionId: string;
  reply: string;
  looks: HydratedLook[];
  notes: string[];
  constraints: ChatConstraints;
  suggestions?: string[];
}

const MAX_FOLLOW_UPS = 2;

export function mergeConstraints(prev: ChatConstraints, next: ChatConstraints): ChatConstraints {
  return {
    occasion: next.occasion ?? prev.occasion,
    colors: next.colors.length ? next.colors : prev.colors,
    brands: next.brands.length ? next.brands : prev.brands,
    budgetMax: next.budgetMax ?? prev.budgetMax,
    extraModesty: next.extraModesty || prev.extraModesty,
  };
}

const OCCASION_SUGGESTIONS: Occasion[] = ['office', 'eid', 'mehndi', 'baraat', 'party', 'casual'];

/**
 * Try the request as asked; if fewer than 3 looks come back, relax one constraint at a
 * time and tell the shopper exactly what changed (never silently).
 */
export function composeWithRelaxation(
  catalog: Parameters<typeof composeLooks>[0],
  profile: ProfileDoc,
  c: ChatConstraints,
): { looks: ComposedLook[]; notes: string[]; request: ComposeRequest } {
  const base: ComposeRequest = {
    occasion: c.occasion,
    colors: c.colors,
    brands: c.brands,
    budgetMax: c.budgetMax,
    extraModesty: c.extraModesty,
  };
  let looks = composeLooks(catalog, profile, base);
  let request = base;
  const notes: string[] = [];
  if (looks.length >= 3) return { looks, notes, request };

  const steps: Array<{ note: string; req: ComposeRequest; applies: boolean }> = [
    { note: 'I widened the brands since few looks matched.', req: { ...base, brands: [] }, applies: c.brands.length > 0 },
    { note: 'I included nearby colours since few looks matched.', req: { ...base, brands: [], colors: [] }, applies: c.colors.length > 0 },
    {
      note: `I stretched your budget by about 25% to find more options.`,
      req: { ...base, brands: [], colors: [], budgetMax: Math.round(((c.budgetMax ?? profile.budgetMax) * 1.25) / 500) * 500 },
      applies: true,
    },
  ];
  for (const step of steps) {
    if (!step.applies) continue;
    const next = composeLooks(catalog, profile, step.req);
    if (next.length > looks.length) {
      looks = next;
      request = step.req;
      notes.push(step.note);
    }
    if (looks.length >= 3) break;
  }
  return { looks, notes, request };
}

export async function handleChat(
  repos: Repos,
  llm: Llm,
  profile: ProfileDoc,
  message: string,
  sessionId?: string,
): Promise<ChatReply> {
  const brands = await repos.brands.find();
  let session: ChatSession | null = sessionId
    ? await repos.sessions.findOne({ id: sessionId, userId: profile.userId })
    : null;
  if (sessionId && !session) throw new AppError(404, 'Chat session not found');
  if (!session) {
    session = {
      id: uid(),
      userId: profile.userId,
      constraints: { colors: [], brands: [] },
      followUps: 0,
      messages: [],
      lookIds: [],
      createdAt: new Date().toISOString(),
    };
    await repos.sessions.insert(session);
  }

  const parsed = await llm.parseRequest(message, { brands });
  const constraints = mergeConstraints(session.constraints, parsed);
  const now = new Date().toISOString();
  session.messages.push({ role: 'user', text: message, at: now });

  // Ask a follow-up only when something essential is missing, and never more than twice.
  if (!constraints.occasion && session.followUps < MAX_FOLLOW_UPS) {
    const reply = 'Happy to style you! Which occasion is this for?';
    session.followUps += 1;
    session.constraints = constraints;
    session.messages.push({ role: 'assistant', text: reply, at: now });
    await repos.sessions.upsert(session);
    return { sessionId: session.id, reply, looks: [], notes: [], constraints, suggestions: OCCASION_SUGGESTIONS };
  }
  if (!constraints.occasion) constraints.occasion = profile.occasions[0];

  const catalog = await repos.products.find();
  // Rules find which request can be met (relaxing it if needed, and saying so); the stylist styles it.
  const { looks: ruleLooks, notes, request } = composeWithRelaxation(catalog, profile, constraints);
  const styled = ruleLooks.length ? await styleLooks(llm, catalog, profile, request) : { looks: [], notes: [], styledByAi: 0 };
  const composed = styled.looks;
  if (composed.length === 0) {
    const reply =
      'I could not find a complete look for that. Try a higher budget, fewer colour limits, or a different occasion.';
    session.constraints = constraints;
    session.messages.push({ role: 'assistant', text: reply, at: now });
    await repos.sessions.upsert(session);
    return { sessionId: session.id, reply, looks: [], notes, constraints };
  }

  // The stylist's own notes; looks the rules filled in get an explanation from facts.
  const missing = composed.filter((_, i) => !styled.notes[i]);
  const explained = missing.length ? await llm.explain(missing.map((c) => factsFor(c, profile)), profile) : [];
  let k = 0;
  const reasons = composed.map((_, i) => styled.notes[i] || explained[k++] || '');
  const looks = await persistLooks(repos, profile.userId, composed, 'chat', reasons);
  const reply = `Here ${looks.length === 1 ? 'is 1 look' : `are ${looks.length} looks`} for your ${constraints.occasion}. Pick one, swap any piece, or tell me what to change.`;
  session.constraints = constraints;
  session.lookIds.push(...looks.map((l) => l.id));
  session.messages.push({ role: 'assistant', text: reply, at: now });
  await repos.sessions.upsert(session);
  return { sessionId: session.id, reply, looks, notes, constraints };
}

export async function swapLookItem(
  repos: Repos,
  profile: ProfileDoc,
  lookId: string,
  slot: Slot,
): Promise<HydratedLook> {
  const look = await repos.looks.findOne({ id: lookId, userId: profile.userId });
  if (!look) throw new AppError(404, 'Look not found');
  const [hydrated] = await hydrateLooks(repos, [look]);
  const catalog = await repos.products.find();
  const occasion = look.occasion ?? undefined;

  if (slot === 'main') {
    const currentMain = hydrated.items.find((i) => i.slot === 'main')!.product;
    // Do not swap into an outfit already shown in a sibling look from the same chat.
    const sessions = await repos.sessions.find({ userId: profile.userId });
    const siblingIds = sessions.find((s) => s.lookIds.includes(lookId))?.lookIds ?? [];
    const siblings = siblingIds.length ? await repos.looks.find({ id: { $in: siblingIds } }) : [];
    const shownMains = siblings.map((l) => l.items.find((i) => i.slot === 'main')?.productId).filter((x): x is string => !!x);
    const alt = composeLooks(catalog, profile, { occasion, excludeMainIds: [currentMain.id, ...shownMains], count: 1 })[0];
    if (!alt) throw new AppError(422, 'No other look matches right now');
    hydrated.items = alt.items;
  } else {
    const swapped = swapSlot(catalog, profile, hydrated.items, slot, occasion, profile.budgetMax);
    if (!swapped) throw new AppError(422, `No other ${slot} fits this look and your budget`);
    hydrated.items = swapped;
  }
  const total = sumPrice(hydrated.items);
  const updated = await repos.looks.update(
    { id: lookId },
    { items: hydrated.items.map((i) => ({ slot: i.slot, productId: i.product.id })), total, reason: '' },
  );
  await repos.events.insert({ id: uid(), userId: profile.userId, type: 'swap', lookId, at: new Date().toISOString() });
  const [out] = await hydrateLooks(repos, [updated!]);
  return out;
}
