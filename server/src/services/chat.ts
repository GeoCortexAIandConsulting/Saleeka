import type { Repos, ProfileDoc } from '../db/index.js';
import type { ChatConstraints, ChatSession, Occasion } from '../types.js';
import { nearbyColors } from '../data/palette.js';
import { composeLooks, swapSlot, type ComposeRequest, type ComposedLook } from './composer.js';
import { factsFor, hydrateLooks, persistLooks, sumPrice, uid, type HydratedLook } from './looks.js';
import type { Llm } from './llm.js';
import { styleLooks } from './stylist.js';
import { AppError } from '../errors.js';
import type { Slot } from '../types.js';
import { recordSearchChallenge } from './game.js';

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
    wantsDupatta: next.wantsDupatta ?? prev.wantsDupatta,
    // "No dupatta" takes back an earlier request for a scarf.
    wantsScarf: next.wantsDupatta === false ? false : next.wantsScarf || prev.wantsScarf,
  };
}

function requestFrom(c: ChatConstraints): ComposeRequest {
  return {
    occasion: c.occasion,
    colors: c.colors,
    brands: c.brands,
    budgetMax: c.budgetMax,
    extraModesty: c.extraModesty,
    wantsDupatta: c.wantsDupatta,
    wantsScarf: c.wantsScarf,
  };
}

function plainList(names: string[]): string {
  const shown = names.slice(0, 3);
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} or ${shown[shown.length - 1]}` : shown[0];
}

/** Says exactly how the looks differ from the colours asked for; never a vague "nearby colours". */
function colourNote(looks: ComposedLook[], asked: string[]): string | null {
  const has = (l: ComposedLook, names: string[]) => l.items[0].product.colors.some((c) => names.includes(c));
  const near = nearbyColors(asked);
  const exact = looks.filter((l) => has(l, asked)).length;
  if (exact === looks.length) return null;
  const others = looks.filter((l) => !has(l, asked));
  const filler = others.every((l) => has(l, near))
    ? `close shades (${plainList([...new Set(others.flatMap((l) => l.items[0].product.colors.filter((c) => near.includes(c))))])})`
    : 'other colours';
  return exact === 0
    ? `Nothing in ${plainList(asked)} fits this request right now, so these use ${filler}.`
    : `Only ${exact} ${exact === 1 ? 'look' : 'looks'} in ${plainList(asked)} ${exact === 1 ? 'fits' : 'fit'} this request, so I added ${filler}.`;
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
  const base = requestFrom(c);
  let looks = composeLooks(catalog, profile, base);
  let request = base;
  const notes: string[] = [];
  if (looks.length >= 3) return { looks, notes, request };

  // Requested colours always stay first (preferColors): widening only fills the gaps around them.
  const preferColors = c.colors;
  const steps: Array<{ note?: string; req: ComposeRequest; applies: boolean }> = [
    { note: 'I widened the brands since few looks matched.', req: { ...base, brands: [] }, applies: c.brands.length > 0 },
    { req: { ...base, brands: [], colors: [...c.colors, ...nearbyColors(c.colors)], preferColors }, applies: c.colors.length > 0 },
    { req: { ...base, brands: [], colors: [], preferColors }, applies: c.colors.length > 0 },
    {
      note: `I stretched your budget by about 25% to find more options.`,
      req: { ...base, brands: [], colors: [], preferColors, budgetMax: Math.round(((c.budgetMax ?? profile.budgetMax) * 1.25) / 500) * 500 },
      applies: true,
    },
  ];
  for (const step of steps) {
    if (!step.applies) continue;
    const next = composeLooks(catalog, profile, step.req);
    if (next.length > looks.length) {
      looks = next;
      request = step.req;
      if (step.note) notes.push(step.note);
    }
    if (looks.length >= 3) break;
  }
  const colours = c.colors.length && looks.length ? colourNote(looks, c.colors) : null;
  if (colours) notes.push(colours);
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

  // The stylist and its ranking rounds dress women only, so menswear stays out.
  const catalog = (await repos.products.find()).filter((p) => p.gender !== 'male');
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
  // Feeds the dress-up game's challenges (structured request only); never blocks the reply.
  await recordSearchChallenge(repos, profile, constraints).catch((e) => console.warn('Could not record a game challenge:', e));
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
  // The stylist and its ranking rounds dress women only, so menswear stays out.
  const catalog = (await repos.products.find()).filter((p) => p.gender !== 'male');
  const occasion = look.occasion ?? undefined;
  // A swap must keep honouring what the shopper asked for in this chat.
  const sessions = await repos.sessions.find({ userId: profile.userId });
  const session = sessions.find((s) => s.lookIds.includes(lookId));
  const asked: ComposeRequest = session ? { ...requestFrom(session.constraints), occasion } : { occasion };

  if (slot === 'main') {
    const currentMain = hydrated.items.find((i) => i.slot === 'main')!.product;
    // Do not swap into an outfit already shown in a sibling look from the same chat.
    const siblingIds = session?.lookIds ?? [];
    const siblings = siblingIds.length ? await repos.looks.find({ id: { $in: siblingIds } }) : [];
    const shownMains = siblings.map((l) => l.items.find((i) => i.slot === 'main')?.productId).filter((x): x is string => !!x);
    const exclude = { excludeMainIds: [currentMain.id, ...shownMains], count: 1 };
    // Stay in the requested colours if any are left; otherwise rank them first among the rest.
    const alt =
      composeLooks(catalog, profile, { ...asked, ...exclude })[0] ??
      composeLooks(catalog, profile, { ...asked, ...exclude, brands: [], colors: [], preferColors: asked.colors })[0];
    if (!alt) throw new AppError(422, 'No other look matches right now');
    hydrated.items = alt.items;
  } else {
    // Looks can sit right at the budget, so an asked-for swap may use the same 25% stretch chat allows.
    const budget = asked.budgetMax ?? profile.budgetMax;
    const swapped =
      swapSlot(catalog, profile, hydrated.items, slot, occasion, budget, asked) ??
      swapSlot(catalog, profile, hydrated.items, slot, occasion, Math.round(budget * 1.25), asked);
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
