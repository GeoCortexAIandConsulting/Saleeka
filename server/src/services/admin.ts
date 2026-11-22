/**
 * The admin portal: statistics about players, looks, brands and AI previews, and the admin's actions
 * (suspend or delete a player, hide or delete a look or comment, hide a brand or product, run challenges).
 *
 * Everything here is for the admin only (routes/admin.ts checks the admin session). Player emails are
 * shown here and nowhere else.
 */
import { config } from '../config.js';
import type { Repos } from '../db/index.js';
import { AppError } from '../errors.js';
import { markSuspended } from '../middleware/auth.js';
import { OCCASIONS, type Challenge, type Design, type Gender, type Occasion, type Product, type Season, type Slot, type User } from '../types.js';
import { deleteGameData, featuredIds, challengeKey, challengeTitle, genderOf, isNew, launchOn, LAUNCH, listable, PUBLISHED, recount, weekIndex, weekStart } from './game.js';
import { deletePreviews, previewLimits, previewStatus } from './preview.js';
import { saveSettings, settings } from './settings.js';
import { uid } from './looks.js';

const DAY = 24 * 60 * 60 * 1000;
const PKT = 5 * 60 * 60 * 1000;
const ago = (days: number, now = Date.now()) => new Date(now - days * DAY).toISOString();
/** A day in Pakistan time, "2026-11-22". */
const dayKey = (iso: string) => new Date(Date.parse(iso) + PKT).toISOString().slice(0, 10);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const money = (n: number) => Math.round(n * 100) / 100;

/** Never sent to the admin page: password hash, link tokens, and the big photo and avatar fields. */
const LEAN: { omit: Array<keyof User & string> } = { omit: ['passwordHash', 'photo', 'avatar', 'verifyTokenHash', 'resetTokenHash'] };

const isPublishedStatus = (d: Design) => d.status !== 'draft';
const username = (u?: Pick<User, 'username' | 'name'> | null) => (u ? (u.username ?? u.name.split(/\s+/)[0]) : 'deleted player');

/** The last 30 days, oldest first, as Pakistan-time day keys. */
function lastDays(n = 30, now = Date.now()) {
  return Array.from({ length: n }, (_, i) => dayKey(new Date(now - (n - 1 - i) * DAY).toISOString()));
}
function perDay(dates: string[], days: string[]) {
  const count = new Map(days.map((d) => [d, 0]));
  for (const at of dates) {
    const k = dayKey(at);
    if (count.has(k)) count.set(k, count.get(k)! + 1);
  }
  return days.map((d) => count.get(d)!);
}

/**
 * When each player last did something since `since`: opened the site signed in, published or saved a
 * look, liked, commented, previewed, or clicked through to a shop.
 */
async function lastActivity(repos: Repos, since: string) {
  const [users, designs, votes, comments, events] = await Promise.all([
    repos.users.find({ lastActiveAt: { $gte: since } }, LEAN),
    repos.designs.find({ createdAt: { $gte: since } }),
    repos.designVotes.find({ at: { $gte: since } }),
    repos.comments.find({ at: { $gte: since } }),
    repos.events.find({ at: { $gte: since }, type: { $in: ['preview', 'click'] } }),
  ]);
  const last = new Map<string, string>();
  const seen = (id: string | undefined, at: string | undefined) => {
    if (!id || !at) return;
    const was = last.get(id);
    if (!was || at > was) last.set(id, at);
  };
  for (const u of users) seen(u.id, u.lastActiveAt);
  for (const d of designs) seen(d.userId, d.createdAt);
  for (const v of votes) seen(v.userId, v.at);
  for (const c of comments) seen(c.userId, c.at);
  for (const e of events) seen(e.userId, e.at);
  return last;
}

/* ------------------------------------ Overview ------------------------------------ */

export async function overview(repos: Repos, catalog: Product[]) {
  const now = Date.now();
  const [d1, d7, d30] = [ago(1, now), ago(7, now), ago(30, now)];
  const ids = await repos.users.find({}, { omit: [...LEAN.omit, 'email', 'name'] });
  const known = new Set(ids.map((u) => u.id));
  const active = await lastActivity(repos, d30);
  const activeIn = (since: string) => [...active].filter(([id, at]) => known.has(id) && at >= since).length;
  const verified = ids.filter((u) => u.emailVerifiedAt).length;
  const days = lastDays(30, now);

  const [published, drafts, hidden, published7, likes, dislikes, comments, previews, previews1, previews30, clicks, clicks7, recentDesigns, recentVotes, recentEvents, meta, brands] = await Promise.all([
    repos.designs.count(PUBLISHED),
    repos.designs.count({ status: 'draft' }),
    repos.designs.count({ hidden: true }),
    repos.designs.count({ ...PUBLISHED, createdAt: { $gte: d7 } }),
    repos.designVotes.count({ up: true }),
    repos.designVotes.count({ up: false }),
    repos.comments.count(),
    repos.events.count({ type: 'preview' }),
    repos.events.count({ type: 'preview', at: { $gte: d1 } }),
    repos.events.count({ type: 'preview', at: { $gte: d30 } }),
    repos.events.count({ type: 'click' }),
    repos.events.count({ type: 'click', at: { $gte: d7 } }),
    repos.designs.find({ ...PUBLISHED, createdAt: { $gte: d30 } }),
    repos.designVotes.find({ at: { $gte: d30 }, up: true }),
    repos.events.find({ at: { $gte: d30 }, type: { $in: ['preview', 'click'] } }),
    repos.meta.findOne({ id: 'catalog' }),
    repos.brands.find(),
  ]);
  const s = settings();
  const referred = ids.filter((u) => u.referredBy);
  return {
    players: {
      total: ids.length,
      verified,
      unverified: ids.length - verified,
      suspended: ids.filter((u) => u.suspended).length,
      new1: ids.filter((u) => u.createdAt >= d1).length,
      new7: ids.filter((u) => u.createdAt >= d7).length,
      new30: ids.filter((u) => u.createdAt >= d30).length,
      active1: activeIn(d1),
      active7: activeIn(d7),
      active30: activeIn(d30),
      inactive30: Math.max(0, (config.emailConfirmation ? verified : ids.length) - activeIn(d30)),
      withLooks: new Set((await repos.designs.find(PUBLISHED)).map((d) => d.userId)).size,
    },
    looks: { published, drafts, hidden, published7, likes, dislikes, comments },
    referrals: {
      joined: referred.length,
      published: referred.filter((u) => u.referralCounted).length,
      conversion: pct(referred.filter((u) => u.referralCounted).length, referred.length),
      inviters: new Set(referred.map((u) => u.referredBy)).size,
    },
    previews: { total: previews, today: previews1, last30: previews30, costTotal: money(previews * config.preview.costUsd), cost30: money(previews30 * config.preview.costUsd), costEach: config.preview.costUsd },
    shop: { clicks, clicks7 },
    catalog: {
      brands: brands.length,
      hiddenBrands: s.hiddenBrandIds.length,
      hiddenProducts: s.hiddenProductIds.length,
      inStock: catalog.length,
      newIn: catalog.filter((p) => isNew(p, now)).length,
      syncedAt: meta?.syncedAt ?? null,
      totalProducts: meta?.products ?? null,
    },
    daily: {
      days,
      signups: perDay(ids.map((u) => u.createdAt), days),
      looks: perDay(recentDesigns.map((d) => d.createdAt), days),
      likes: perDay(recentVotes.map((v) => v.at), days),
      previews: perDay(recentEvents.filter((e) => e.type === 'preview').map((e) => e.at), days),
      clicks: perDay(recentEvents.filter((e) => e.type === 'click').map((e) => e.at), days),
      active: days.map((d) => [...active.values()].filter((at) => dayKey(at) === d).length),
    },
  };
}

/* ------------------------------------- Players ------------------------------------- */

export const USER_FILTERS = ['all', 'active', 'inactive', 'unverified', 'suspended', 'invited', 'no-looks'] as const;
export const USER_SORTS = ['new', 'old', 'active', 'looks', 'likes', 'invites'] as const;
export const PAGE = 50;

/** Every player with their numbers (the list, the CSV download). */
async function playerRows(repos: Repos) {
  const [users, designs, previews, active] = await Promise.all([
    repos.users.find({}, LEAN),
    repos.designs.find(),
    repos.events.find({ type: 'preview' }),
    lastActivity(repos, ago(365)),
  ]);
  const looks = new Map<string, { published: number; drafts: number; likes: number }>();
  for (const d of designs) {
    const x = looks.get(d.userId) ?? { published: 0, drafts: 0, likes: 0 };
    if (d.status === 'draft') x.drafts++;
    else {
      x.published++;
      x.likes += d.up;
    }
    looks.set(d.userId, x);
  }
  const invited = new Map<string, number>();
  for (const u of users) if (u.referredBy) invited.set(u.referredBy, (invited.get(u.referredBy) ?? 0) + 1);
  const used = new Map<string, number>();
  for (const e of previews) if (e.userId) used.set(e.userId, (used.get(e.userId) ?? 0) + 1);
  const byId = new Map(users.map((u) => [u.id, u]));
  return users.map((u) => {
    const l = looks.get(u.id) ?? { published: 0, drafts: 0, likes: 0 };
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      username: u.username ?? null,
      createdAt: u.createdAt,
      verified: Boolean(u.emailVerifiedAt),
      suspended: Boolean(u.suspended),
      lastSeen: active.get(u.id) ?? null,
      looks: l.published,
      drafts: l.drafts,
      likes: l.likes,
      /** Friends who signed up from their link */
      invited: invited.get(u.id) ?? 0,
      /** ...and of those, how many published a look */
      invitedPublished: u.referrals ?? 0,
      invitedBy: u.referredBy ? username(byId.get(u.referredBy)) : null,
      invitedById: u.referredBy ?? null,
      previewsUsed: used.get(u.id) ?? 0,
      previewCredits: u.previewCredits ?? 0,
    };
  });
}
type PlayerRow = Awaited<ReturnType<typeof playerRows>>[number];

export async function listUsers(repos: Repos, q: { search?: string; filter?: (typeof USER_FILTERS)[number]; sort?: (typeof USER_SORTS)[number]; page?: number }) {
  const month = ago(30);
  let rows = await playerRows(repos);
  // With email confirmation off, every account counts as a real player.
  const real = (r: PlayerRow) => r.verified || !config.emailConfirmation;
  const counts = {
    all: rows.length,
    active: rows.filter((r) => r.lastSeen && r.lastSeen >= month).length,
    inactive: rows.filter((r) => real(r) && (!r.lastSeen || r.lastSeen < month)).length,
    unverified: rows.filter((r) => !r.verified).length,
    suspended: rows.filter((r) => r.suspended).length,
    invited: rows.filter((r) => r.invitedById).length,
    'no-looks': rows.filter((r) => real(r) && !r.looks).length,
  };
  const f = q.filter ?? 'all';
  if (f === 'active') rows = rows.filter((r) => r.lastSeen && r.lastSeen >= month);
  if (f === 'inactive') rows = rows.filter((r) => real(r) && (!r.lastSeen || r.lastSeen < month));
  if (f === 'unverified') rows = rows.filter((r) => !r.verified);
  if (f === 'suspended') rows = rows.filter((r) => r.suspended);
  if (f === 'invited') rows = rows.filter((r) => r.invitedById);
  if (f === 'no-looks') rows = rows.filter((r) => real(r) && !r.looks);
  const term = q.search?.trim().toLowerCase();
  if (term) rows = rows.filter((r) => [r.email, r.name, r.username ?? '', r.id].some((x) => x.toLowerCase().includes(term)));
  const sorts: Record<(typeof USER_SORTS)[number], (a: PlayerRow, b: PlayerRow) => number> = {
    new: (a, b) => b.createdAt.localeCompare(a.createdAt),
    old: (a, b) => a.createdAt.localeCompare(b.createdAt),
    active: (a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''),
    looks: (a, b) => b.looks - a.looks,
    likes: (a, b) => b.likes - a.likes,
    invites: (a, b) => b.invited - a.invited || b.invitedPublished - a.invitedPublished,
  };
  rows.sort(sorts[q.sort ?? 'new']);
  const page = Math.max(0, q.page ?? 0);
  return { counts, total: rows.length, page, pages: Math.max(1, Math.ceil(rows.length / PAGE)), users: rows.slice(page * PAGE, page * PAGE + PAGE) };
}

/** Every player as a spreadsheet (CSV), for the admin's own records. */
export async function usersCsv(repos: Repos) {
  const rows = await playerRows(repos);
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const cols: Array<[string, (r: PlayerRow) => unknown]> = [
    ['Username', (r) => r.username ?? ''],
    ['Name', (r) => r.name],
    ['Email', (r) => r.email],
    ['Joined', (r) => r.createdAt.slice(0, 10)],
    ['Email confirmed', (r) => (r.verified ? 'yes' : 'no')],
    ['Last active', (r) => r.lastSeen?.slice(0, 10) ?? ''],
    ['Suspended', (r) => (r.suspended ? 'yes' : 'no')],
    ['Published looks', (r) => r.looks],
    ['Drafts', (r) => r.drafts],
    ['Likes received', (r) => r.likes],
    ['Friends invited', (r) => r.invited],
    ['Invited friends who published', (r) => r.invitedPublished],
    ['Invited by', (r) => r.invitedBy ?? ''],
    ['AI previews used', (r) => r.previewsUsed],
    ['Extra previews', (r) => r.previewCredits],
  ];
  // Quoted, and a leading = + - @ is defused so a spreadsheet never runs a cell as a formula.
  const cell = (v: unknown) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [cols.map(([h]) => cell(h)).join(','), ...rows.map((r) => cols.map(([, f]) => cell(f(r))).join(','))].join('\r\n');
}

/** One player: account, numbers, looks, comments, the friends they invited, preview allowance. */
export async function userDetail(repos: Repos, id: string) {
  const user = (await repos.users.find({ id }, LEAN))[0];
  if (!user) throw new AppError(404, 'Player not found');
  const [profile, designs, comments, invited, inviter, previews, votesGiven, lastSeen] = await Promise.all([
    repos.profiles.findOne({ id }),
    repos.designs.find({ userId: id }, { sort: { createdAt: -1 } }),
    repos.comments.find({ userId: id }, { sort: { at: -1 }, limit: 50 }),
    repos.users.find({ referredBy: id }, LEAN),
    user.referredBy ? repos.users.findOne({ id: user.referredBy }) : null,
    repos.events.count({ userId: id, type: 'preview' }),
    repos.designVotes.count({ userId: id }),
    lastActivity(repos, ago(365)),
  ]);
  const commentLooks = await looksById(repos, comments.map((c) => c.designId));
  const full = (await repos.users.findOne({ id }))!;
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username ?? null,
      createdAt: user.createdAt,
      verified: Boolean(user.emailVerifiedAt),
      verifiedAt: user.emailVerifiedAt ?? null,
      suspended: Boolean(user.suspended),
      suspendedAt: user.suspendedAt ?? null,
      lastSeen: lastSeen.get(id) ?? null,
      hasPhoto: Boolean(full.photo),
      invitedBy: inviter ? { id: inviter.id, username: username(inviter) } : null,
    },
    profile: profile
      ? { gender: profile.gender ?? null, ageRange: profile.ageRange ?? null, coverage: profile.coverage, budgetMin: profile.budgetMin, budgetMax: profile.budgetMax, occasions: profile.occasions, colorsLiked: profile.colorsLiked }
      : null,
    stats: {
      looks: designs.filter(isPublishedStatus).length,
      drafts: designs.filter((d) => d.status === 'draft').length,
      hidden: designs.filter((d) => d.hidden).length,
      likes: designs.filter(isPublishedStatus).reduce((n, d) => n + d.up, 0),
      comments: await repos.comments.count({ userId: id }),
      votesGiven,
      previews,
    },
    previews: await previewStatus(repos, id),
    looks: await lookRows(repos, designs),
    comments: comments.map((c) => ({ id: c.id, text: c.text, at: c.at, lookId: c.designId, lookTitle: commentLooks.get(c.designId) ?? 'a deleted look', reply: Boolean(c.parentId) })),
    invited: invited.map((u) => ({ id: u.id, username: username(u), joined: u.createdAt, published: Boolean(u.referralCounted) })),
  };
}

async function looksById(repos: Repos, ids: string[]) {
  const designs = ids.length ? await repos.designs.find({ id: { $in: [...new Set(ids)] } }) : [];
  const challenges = designs.length ? await repos.challenges.find({ id: { $in: [...new Set(designs.map((d) => d.challengeId))] } }) : [];
  const title = new Map(challenges.map((c) => [c.id, challengeTitle(c)]));
  return new Map(designs.map((d) => [d.id, title.get(d.challengeId) ?? 'a look']));
}

export const USER_ACTIONS = ['suspend', 'unsuspend', 'verify', 'credits', 'rename'] as const;

export async function userAction(repos: Repos, id: string, action: (typeof USER_ACTIONS)[number], value?: { credits?: number; username?: string; name?: string }) {
  const user = await repos.users.findOne({ id });
  if (!user) throw new AppError(404, 'Player not found');
  const now = new Date().toISOString();
  if (action === 'suspend') {
    await repos.users.update({ id }, { suspended: true, suspendedAt: now });
    markSuspended(id, true);
  } else if (action === 'unsuspend') {
    await repos.users.update({ id }, { suspended: undefined, suspendedAt: undefined });
    markSuspended(id, false);
  } else if (action === 'verify') {
    if (!user.emailVerifiedAt) await repos.users.update({ id }, { emailVerifiedAt: now, verifyTokenHash: undefined });
  } else if (action === 'credits') {
    const by = Math.trunc(value?.credits ?? 0);
    if (!by || Math.abs(by) > 50) throw new AppError(400, 'Give between 1 and 50 previews (or take some away with a minus number)');
    await repos.users.update({ id }, { previewCredits: Math.max(0, (user.previewCredits ?? 0) + by) });
  } else if (action === 'rename') {
    const changes: Partial<User> = {};
    if (value?.name?.trim()) changes.name = value.name.trim().slice(0, 80);
    if (value?.username !== undefined) changes.username = value.username; // checked by the route
    await repos.users.update({ id }, changes);
  }
  return userDetail(repos, id);
}

/** Deletes everything held about a player (the same as the player's own "Delete my account"). */
export async function deleteAccount(repos: Repos, id: string) {
  await deleteGameData(repos, id);
  await deletePreviews(repos, id);
  await repos.looks.delete({ userId: id });
  await repos.rounds.delete({ userId: id });
  await repos.sessions.delete({ userId: id });
  await repos.events.delete({ userId: id });
  await repos.profiles.delete({ id });
  await repos.users.delete({ id });
  markSuspended(id, false);
}

/* -------------------------------------- Looks -------------------------------------- */

export const LOOK_FILTERS = ['published', 'draft', 'hidden', 'all'] as const;
export const LOOK_SORTS = ['new', 'old', 'likes'] as const;

/** Looks as admin rows: who made it, for which challenge, the counts, a picture. */
async function lookRows(repos: Repos, designs: Design[]) {
  if (!designs.length) return [];
  const productIds = [...new Set(designs.flatMap((d) => d.items.map((i) => i.productId)))];
  const [products, challenges, users, comments] = await Promise.all([
    repos.products.find({ id: { $in: productIds } }),
    repos.challenges.find({ id: { $in: [...new Set(designs.map((d) => d.challengeId))] } }),
    repos.users.find({ id: { $in: [...new Set(designs.map((d) => d.userId))] } }, LEAN),
    repos.comments.find({ designId: { $in: designs.map((d) => d.id) } }),
  ]);
  const pById = new Map(products.map((p) => [p.id, p]));
  const cById = new Map(challenges.map((c) => [c.id, c]));
  const uById = new Map(users.map((u) => [u.id, u]));
  const talk = new Map<string, number>();
  for (const c of comments) talk.set(c.designId, (talk.get(c.designId) ?? 0) + 1);
  return designs.map((d) => {
    const pieces = d.items.map((i) => pById.get(i.productId)).filter((p): p is Product => Boolean(p));
    const main = pieces.find((p) => p.slot === 'main') ?? pieces[0];
    const c = cById.get(d.challengeId);
    return {
      id: d.id,
      status: d.status === 'draft' ? ('draft' as const) : ('published' as const),
      hidden: Boolean(d.hidden),
      userId: d.userId,
      by: username(uById.get(d.userId)),
      email: uById.get(d.userId)?.email ?? null,
      challenge: c ? challengeTitle(c) : 'Deleted challenge',
      challengeId: d.challengeId,
      brands: [...new Set(pieces.map((p) => p.brandName))],
      pieces: pieces.length,
      total: d.total,
      up: d.up,
      down: d.down,
      comments: talk.get(d.id) ?? 0,
      createdAt: d.createdAt,
      previewUrl: d.previewId ? `/api/previews/${d.previewId}` : null,
      image: main?.images?.[0] ?? null,
    };
  });
}

export async function listLooks(repos: Repos, q: { filter?: (typeof LOOK_FILTERS)[number]; sort?: (typeof LOOK_SORTS)[number]; search?: string; challengeId?: string; page?: number }) {
  const f = q.filter ?? 'published';
  const where: Record<string, unknown> = f === 'published' ? { ...PUBLISHED } : f === 'draft' ? { status: 'draft' } : f === 'hidden' ? { hidden: true } : {};
  if (q.challengeId) where.challengeId = q.challengeId;
  const term = q.search?.trim().toLowerCase();
  if (term) {
    const users = (await repos.users.find({}, LEAN)).filter((u) => [u.email, u.name, u.username ?? ''].some((x) => x.toLowerCase().includes(term)));
    where.userId = { $in: users.map((u) => u.id) };
  }
  const sort = q.sort === 'likes' ? { up: -1 as const, createdAt: -1 as const } : q.sort === 'old' ? { createdAt: 1 as const } : { createdAt: -1 as const };
  const total = await repos.designs.count(where);
  const page = Math.max(0, q.page ?? 0);
  const designs = await repos.designs.find(where, { sort, skip: page * 24, limit: 24 });
  return { total, page, pages: Math.max(1, Math.ceil(total / 24)), looks: await lookRows(repos, designs) };
}

/** One look for the admin: pieces, comments, and every like with what is known about who gave it. */
export async function lookDetail(repos: Repos, id: string) {
  const d = await repos.designs.findOne({ id });
  if (!d) throw new AppError(404, 'Look not found');
  const [row] = await lookRows(repos, [d]);
  const [products, comments, votes] = await Promise.all([
    repos.products.find({ id: { $in: d.items.map((i) => i.productId) } }),
    repos.comments.find({ designId: id }, { sort: { at: 1 } }),
    repos.designVotes.find({ designId: id }, { sort: { at: 1 } }),
  ]);
  const people = await repos.users.find({ id: { $in: [...new Set([...comments.map((c) => c.userId), ...votes.map((v) => v.userId)])] } }, LEAN);
  const who = new Map(people.map((u) => [u.id, u]));
  const designer = await repos.users.findOne({ id: d.userId });
  const pById = new Map(products.map((p) => [p.id, p]));
  return {
    look: row,
    items: d.items.map((i) => {
      const p = pById.get(i.productId);
      return { slot: i.slot, id: i.productId, title: p?.title ?? 'Removed product', brand: p?.brandName ?? '', price: p?.price ?? 0, image: p?.images?.[0] ?? null, inStock: p?.inStock ?? false, url: p?.url ?? null };
    }),
    comments: comments.map((c) => ({ id: c.id, text: c.text, at: c.at, by: username(who.get(c.userId)), userId: c.userId, reply: Boolean(c.parentId) })),
    votes: votes.map((v) => ({ ...voteMerit(v, who.get(v.userId), d, designer), by: username(who.get(v.userId)), userId: v.userId, up: v.up, at: v.at })),
  };
}

export async function setLookHidden(repos: Repos, id: string, hidden: boolean) {
  const d = await repos.designs.update({ id }, { hidden: hidden ? true : undefined });
  if (!d) throw new AppError(404, 'Look not found');
}

/** Deletes a look with its likes, comments and notifications (and its preview image if no other look uses it). */
export async function deleteLook(repos: Repos, id: string) {
  const d = await repos.designs.findOne({ id });
  if (!d) throw new AppError(404, 'Look not found');
  await repos.designVotes.delete({ designId: id });
  await repos.comments.delete({ designId: id });
  await repos.notifications.delete({ designId: id });
  await repos.designs.delete({ id });
  if (d.previewId && !(await repos.designs.count({ previewId: d.previewId }))) await repos.previews.delete({ id: d.previewId });
  const s = settings();
  const won = Object.entries(s.winners).filter(([, look]) => look === id);
  if (won.length) await saveSettings(repos, { winners: Object.fromEntries(Object.entries(s.winners).filter(([, look]) => look !== id)) });
}

/* ------------------------------------- Comments ------------------------------------- */

export async function listAllComments(repos: Repos, q: { search?: string; page?: number }) {
  const term = q.search?.trim().toLowerCase();
  const page = Math.max(0, q.page ?? 0);
  let rows = await repos.comments.find({}, { sort: { at: -1 }, ...(term ? {} : { skip: page * PAGE, limit: PAGE }) });
  let total = term ? 0 : await repos.comments.count();
  if (term) {
    rows = rows.filter((c) => c.text.toLowerCase().includes(term));
    total = rows.length;
    rows = rows.slice(page * PAGE, page * PAGE + PAGE);
  }
  const users = rows.length ? await repos.users.find({ id: { $in: [...new Set(rows.map((c) => c.userId))] } }, LEAN) : [];
  const who = new Map(users.map((u) => [u.id, u]));
  const titles = await looksById(repos, rows.map((c) => c.designId));
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE)),
    comments: rows.map((c) => ({ id: c.id, text: c.text, at: c.at, by: username(who.get(c.userId)), userId: c.userId, email: who.get(c.userId)?.email ?? null, lookId: c.designId, lookTitle: titles.get(c.designId) ?? 'a deleted look', reply: Boolean(c.parentId) })),
  };
}

/** Deletes a comment, the replies under it, and the notifications they made. */
export async function deleteAnyComment(repos: Repos, id: string) {
  const c = await repos.comments.findOne({ id });
  if (!c) throw new AppError(404, 'Comment not found');
  const gone = [c.id, ...(await repos.comments.find({ parentId: c.id })).map((r) => r.id)];
  await repos.notifications.delete({ commentId: { $in: gone } });
  await repos.comments.delete({ parentId: c.id });
  await repos.comments.delete({ id: c.id });
  return { deleted: gone.length };
}

/* -------------------------------------- Brands -------------------------------------- */

/**
 * How players use each brand's pieces: in published looks (pieces picked, looks, players, likes),
 * clicks through to the brand's shop, and what is in stock. `catalog` is every in-stock piece,
 * hidden ones included.
 */
async function usage(repos: Repos) {
  const designs = await repos.designs.find({ status: { $ne: 'draft' } });
  const ids = [...new Set(designs.flatMap((d) => d.items.map((i) => i.productId)))];
  const products = ids.length ? await repos.products.find({ id: { $in: ids } }) : [];
  return { designs, product: new Map(products.map((p) => [p.id, p])) };
}

export async function brandList(repos: Repos, catalog: Product[]) {
  const [brands, { designs, product }] = await Promise.all([repos.brands.find(), usage(repos)]);
  const s = settings();
  const hiddenBrands = new Set(s.hiddenBrandIds);
  const hiddenProducts = new Set(s.hiddenProductIds);
  const month = ago(30);
  const visible = designs.filter((d) => !d.hidden);
  const stats = new Map<string, { looks: Set<string>; picks: number; players: Set<string>; likes: number }>();
  for (const d of visible) {
    const inLook = new Set<string>();
    for (const i of d.items) {
      const b = product.get(i.productId)?.brandId;
      if (!b) continue;
      const x = stats.get(b) ?? { looks: new Set(), picks: 0, players: new Set(), likes: 0 };
      x.picks++;
      x.looks.add(d.id);
      x.players.add(d.userId);
      if (!inLook.has(b)) x.likes += d.up;
      inLook.add(b);
      stats.set(b, x);
    }
  }
  const rows = await Promise.all(
    brands.map(async (b) => {
      const pieces = catalog.filter((p) => p.brandId === b.id);
      const [total, clicks, clicks30] = await Promise.all([
        repos.products.count({ brandId: b.id }),
        repos.events.count({ brandId: b.id, type: 'click' }),
        repos.events.count({ brandId: b.id, type: 'click', at: { $gte: month } }),
      ]);
      const x = stats.get(b.id);
      const checked = pieces.reduce((m, p) => (p.checkedAt && p.checkedAt > m ? p.checkedAt : m), '');
      return {
        id: b.id,
        name: b.name,
        tier: b.tier,
        hidden: hiddenBrands.has(b.id),
        products: total,
        inStock: pieces.length,
        newIn: pieces.filter((p) => isNew(p)).length,
        hiddenProducts: pieces.filter((p) => hiddenProducts.has(p.id)).length,
        women: pieces.filter((p) => genderOf(p) === 'female').length,
        men: pieces.filter((p) => genderOf(p) === 'male').length,
        lastChecked: checked || null,
        looks: x?.looks.size ?? 0,
        picks: x?.picks ?? 0,
        players: x?.players.size ?? 0,
        likes: x?.likes ?? 0,
        clicks,
        clicks30,
        share: pct(x?.looks.size ?? 0, visible.length),
      };
    }),
  );
  rows.sort((a, b) => b.picks - a.picks || b.inStock - a.inStock || a.name.localeCompare(b.name));
  return { looks: visible.length, brands: rows };
}

/** Everything to show a brand what Saleeqa does for it: the "pitch" report. */
export async function brandReport(repos: Repos, catalog: Product[], brandId: string) {
  const brand = await repos.brands.findOne({ id: brandId });
  if (!brand) throw new AppError(404, 'Brand not found');
  const now = Date.now();
  const [{ designs, product }, all, clicks, challenges, impressions] = await Promise.all([
    usage(repos),
    brandList(repos, catalog),
    repos.events.find({ brandId, type: 'click' }),
    repos.challenges.find(),
    repos.events.count({ brandId, type: 'impression' }),
  ]);
  const visible = designs.filter((d) => !d.hidden);
  const mine = visible.filter((d) => d.items.some((i) => product.get(i.productId)?.brandId === brandId));
  const cById = new Map(challenges.map((c) => [c.id, c]));
  const row = all.brands.find((b) => b.id === brandId)!;
  const rank = all.brands.filter((b) => b.picks > 0).findIndex((b) => b.id === brandId);

  // Pieces picked, per product and per slot; occasions; the brands players pair them with.
  const picks = new Map<string, { n: number; looks: Set<string> }>();
  const bySlot = new Map<Slot, number>();
  const byOccasion = new Map<Occasion, number>();
  const byGender = { female: 0, male: 0 };
  const pairs = new Map<string, number>();
  for (const d of mine) {
    const c = cById.get(d.challengeId);
    if (c) byOccasion.set(c.occasion, (byOccasion.get(c.occasion) ?? 0) + 1);
    byGender[c ? genderOf(c) : 'female']++;
    const others = new Set<string>();
    for (const i of d.items) {
      const p = product.get(i.productId);
      if (!p) continue;
      if (p.brandId === brandId) {
        const x = picks.get(p.id) ?? { n: 0, looks: new Set() };
        x.n++;
        x.looks.add(d.id);
        picks.set(p.id, x);
        bySlot.set(i.slot, (bySlot.get(i.slot) ?? 0) + 1);
      } else others.add(p.brandName);
    }
    for (const o of others) pairs.set(o, (pairs.get(o) ?? 0) + 1);
  }
  const clicksByProduct = new Map<string, number>();
  for (const e of clicks) if (e.productId) clicksByProduct.set(e.productId, (clicksByProduct.get(e.productId) ?? 0) + 1);

  // Who styles the brand: age ranges from the players' taste quiz (only those who answered).
  const players = [...new Set(mine.map((d) => d.userId))];
  const profiles = players.length ? await repos.profiles.find({ id: { $in: players } }) : [];
  const ages = new Map<string, number>();
  for (const p of profiles) if (p.ageRange) ages.set(p.ageRange, (ages.get(p.ageRange) ?? 0) + 1);

  // The last 8 weeks: looks with the brand, and shop clicks.
  const thisWeek = weekIndex(now);
  const weeks = Array.from({ length: 8 }, (_, k) => thisWeek - 7 + k).map((i) => {
    const [from, to] = [weekStart(i), weekStart(i + 1)];
    return { start: from, looks: mine.filter((d) => d.createdAt >= from && d.createdAt < to).length, clicks: clicks.filter((e) => e.at >= from && e.at < to).length };
  });

  const pieces = catalog.filter((p) => p.brandId === brandId);
  const prices = pieces.map((p) => p.price).sort((a, b) => a - b);
  const month = ago(30, now);
  const looks30 = mine.filter((d) => d.createdAt >= month);
  const top = [...picks]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 12)
    .map(([id, x]) => {
      const p = product.get(id)!;
      return { id, title: p.title, slot: p.slot, price: p.price, image: p.images?.[0] ?? null, inStock: p.inStock, url: p.url, picks: x.n, looks: x.looks.size, clicks: clicksByProduct.get(id) ?? 0 };
    });
  const players30 = new Set(looks30.map((d) => d.userId)).size;
  const clicks30 = clicks.filter((e) => e.at >= month).length;
  return {
    brand: { id: brand.id, name: brand.name, tier: brand.tier, hidden: row.hidden },
    catalog: {
      total: row.products,
      inStock: row.inStock,
      newIn: row.newIn,
      women: row.women,
      men: row.men,
      hiddenProducts: row.hiddenProducts,
      lastChecked: row.lastChecked,
      priceMin: prices[0] ?? null,
      priceMedian: prices.length ? prices[Math.floor(prices.length / 2)] : null,
      priceMax: prices.at(-1) ?? null,
      bySlot: countBy(pieces.map((p) => p.slot)),
    },
    reach: {
      looks: mine.length,
      share: row.share,
      rank: rank >= 0 ? rank + 1 : null,
      brandsRanked: all.brands.filter((b) => b.picks > 0).length,
      picks: row.picks,
      players: players.length,
      likes: mine.reduce((n, d) => n + d.up, 0),
      comments: mine.length ? await repos.comments.count({ designId: { $in: mine.map((d) => d.id) } }) : 0,
      withPreview: mine.filter((d) => d.previewId).length,
      clicks: clicks.length,
      clickers: new Set(clicks.map((e) => e.userId).filter(Boolean)).size,
      impressions,
      looks30: looks30.length,
      players30,
      clicks30,
    },
    bySlot: [...bySlot].map(([slot, n]) => ({ slot, n })).sort((a, b) => b.n - a.n),
    byOccasion: [...byOccasion].map(([occasion, n]) => ({ occasion, n })).sort((a, b) => b.n - a.n),
    byGender,
    ages: [...ages].map(([range, n]) => ({ range, n })).sort((a, b) => a.range.localeCompare(b.range)),
    pairedWith: [...pairs].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 6),
    weeks,
    top,
    summary:
      `In the last 30 days, ${players30} player${players30 === 1 ? '' : 's'} styled ${looks30.length} look${looks30.length === 1 ? '' : 's'} with ${brand.name} pieces on Saleeqa, ` +
      `and ${clicks30} shopper click${clicks30 === 1 ? '' : 's'} went to ${brand.name}'s website. ` +
      `In total, players picked ${row.picks} ${brand.name} piece${row.picks === 1 ? '' : 's'} for ${mine.length} published look${mine.length === 1 ? '' : 's'}` +
      (rank >= 0 ? `, making ${brand.name} number ${rank + 1} of ${all.brands.filter((b) => b.picks > 0).length} brands players styled.` : '.'),
  };
}

function countBy<K extends string>(keys: K[]) {
  const m = new Map<K, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
}

export const PRODUCT_SORTS = ['picks', 'clicks', 'new', 'price-asc', 'price-desc'] as const;

/** A brand's in-stock pieces (hidden ones included), with how often players picked and clicked each. */
export async function brandProducts(repos: Repos, catalog: Product[], brandId: string, q: { search?: string; sort?: (typeof PRODUCT_SORTS)[number]; hiddenOnly?: boolean; page?: number }) {
  const hidden = new Set(settings().hiddenProductIds);
  let pieces = catalog.filter((p) => p.brandId === brandId);
  const term = q.search?.trim().toLowerCase();
  if (term) pieces = pieces.filter((p) => p.title.toLowerCase().includes(term) || p.id.toLowerCase().includes(term));
  if (q.hiddenOnly) pieces = pieces.filter((p) => hidden.has(p.id));
  const [{ designs, product }, clicks] = await Promise.all([usage(repos), repos.events.find({ brandId, type: 'click' })]);
  const picks = new Map<string, number>();
  for (const d of designs) for (const i of d.items) if (product.get(i.productId)?.brandId === brandId) picks.set(i.productId, (picks.get(i.productId) ?? 0) + 1);
  const clicked = new Map<string, number>();
  for (const e of clicks) if (e.productId) clicked.set(e.productId, (clicked.get(e.productId) ?? 0) + 1);
  const sorts: Record<(typeof PRODUCT_SORTS)[number], (a: Product, b: Product) => number> = {
    picks: (a, b) => (picks.get(b.id) ?? 0) - (picks.get(a.id) ?? 0) || (clicked.get(b.id) ?? 0) - (clicked.get(a.id) ?? 0),
    clicks: (a, b) => (clicked.get(b.id) ?? 0) - (clicked.get(a.id) ?? 0),
    new: (a, b) => (b.arrivedAt ?? '').localeCompare(a.arrivedAt ?? ''),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
  };
  pieces = [...pieces].sort(sorts[q.sort ?? 'picks']);
  const page = Math.max(0, q.page ?? 0);
  const per = 40;
  return {
    total: pieces.length,
    page,
    pages: Math.max(1, Math.ceil(pieces.length / per)),
    products: pieces.slice(page * per, page * per + per).map((p) => ({
      id: p.id,
      title: p.title,
      slot: p.slot,
      gender: genderOf(p),
      price: p.price,
      image: p.images?.[0] ?? null,
      url: p.url,
      isNew: isNew(p),
      arrivedAt: p.arrivedAt ?? null,
      hidden: hidden.has(p.id),
      picks: picks.get(p.id) ?? 0,
      clicks: clicked.get(p.id) ?? 0,
    })),
  };
}

export async function setBrandHidden(repos: Repos, brandId: string, hidden: boolean) {
  if (!(await repos.brands.findOne({ id: brandId }))) throw new AppError(404, 'Brand not found');
  const ids = new Set(settings().hiddenBrandIds);
  if (hidden) ids.add(brandId);
  else ids.delete(brandId);
  await saveSettings(repos, { hiddenBrandIds: [...ids] });
}

export async function setProductsHidden(repos: Repos, productIds: string[], hidden: boolean) {
  const ids = new Set(settings().hiddenProductIds);
  for (const id of productIds) {
    if (hidden) ids.add(id);
    else ids.delete(id);
  }
  await saveSettings(repos, { hiddenProductIds: [...ids] });
}

/** The catalogue players see: without hidden brands and products. */
export function visibleCatalog(catalog: Product[]): Product[] {
  const s = settings();
  if (!s.hiddenBrandIds.length && !s.hiddenProductIds.length) return catalog;
  const brands = new Set(s.hiddenBrandIds);
  const products = new Set(s.hiddenProductIds);
  return catalog.filter((p) => !brands.has(p.brandId) && !products.has(p.id));
}

/* ------------------------------------ Challenges ------------------------------------ */

export async function challengeList(repos: Repos) {
  const all = await repos.challenges.find();
  const designs = await repos.designs.find({ challengeId: { $in: all.map((c) => c.id) } });
  const per = new Map<string, { looks: number; drafts: number; likes: number; players: Set<string> }>();
  for (const d of designs) {
    const x = per.get(d.challengeId) ?? { looks: 0, drafts: 0, likes: 0, players: new Set() };
    if (d.status === 'draft') x.drafts++;
    else if (!d.hidden) {
      x.looks++;
      x.likes += d.up;
      x.players.add(d.userId);
    }
    per.set(d.challengeId, x);
  }
  const featured = featuredIds();
  const auto = !settings().featuredIds.length;
  const rows = all
    .filter((c) => c.source !== 'custom')
    .map((c) => {
      const x = per.get(c.id);
      return {
        id: c.id,
        title: challengeTitle(c),
        source: c.source,
        occasion: c.occasion,
        gender: genderOf(c),
        season: c.season ?? null,
        colors: c.colors,
        coverage: c.coverage,
        wantsDupatta: c.wantsDupatta,
        budget: c.budget ?? null,
        required: c.required ?? [],
        prize: c.prize ?? null,
        launch: Boolean(c.launch),
        hidden: Boolean(c.hidden),
        listed: listable(c),
        asks: c.asks,
        featured: featured.includes(c.id),
        looks: x?.looks ?? 0,
        drafts: x?.drafts ?? 0,
        likes: x?.likes ?? 0,
        players: x?.players.size ?? 0,
        createdAt: c.createdAt,
      };
    });
  rows.sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.listed) - Number(a.listed) || b.looks - a.looks || a.title.localeCompare(b.title));
  const custom = all.filter((c) => c.source === 'custom');
  return {
    autoFeatured: auto,
    launchOn: launchOn(),
    challenges: rows,
    // Players' own briefs ("What's on your mind today?"): never listed, counted here.
    custom: { count: custom.length, looks: designs.filter((d) => custom.some((c) => c.id === d.challengeId) && d.status !== 'draft').length },
  };
}

export interface ChallengeInput {
  title: string;
  occasion: Occasion;
  gender: Gender;
  colors: string[];
  coverage: number;
  wantsDupatta: boolean;
  season?: Season | null;
  budget?: number | null;
  required?: Slot[];
  prize?: string | null;
}

const challengeFields = (input: ChallengeInput) => {
  if (!OCCASIONS.includes(input.occasion)) throw new AppError(400, 'Pick an occasion');
  return {
    title: input.title.trim(),
    occasion: input.occasion,
    ...(input.gender === 'male' ? { gender: 'male' as const } : {}),
    colors: [...new Set(input.colors)].slice(0, 6),
    coverage: Math.min(5, Math.max(1, Math.round(input.coverage))),
    wantsDupatta: input.gender === 'male' ? false : input.wantsDupatta,
    ...(input.season ? { season: input.season } : {}),
    ...(input.budget ? { budget: input.budget } : {}),
    ...(input.required?.length ? { required: input.required } : {}),
    ...(input.prize?.trim() ? { prize: input.prize.trim() } : {}),
  };
};

/** A new challenge made in the admin portal (listed for players at once). */
export async function createChallenge(repos: Repos, input: ChallengeInput) {
  const id = `admin-${uid().slice(0, 8)}`;
  const fields = challengeFields(input);
  // Its own key, so it never merges with a stylist search for the same thing.
  const c: Challenge = { ...fields, id, key: `${challengeKey(fields)}|admin=${id}`, source: 'admin', asks: 0, createdAt: new Date().toISOString() };
  await repos.challenges.insert(c);
  return c;
}

/** Only challenges made in the admin portal can be edited (the built-in ones are reset from the code on each start). */
export async function updateChallenge(repos: Repos, id: string, input: ChallengeInput) {
  const c = await repos.challenges.findOne({ id });
  if (!c) throw new AppError(404, 'Challenge not found');
  if (c.source !== 'admin') throw new AppError(400, 'Only challenges made here can be edited. You can hide built-in ones.');
  const fields = challengeFields(input);
  const next: Challenge = { id: c.id, source: 'admin', asks: c.asks, createdAt: c.createdAt, ...(c.hidden ? { hidden: true } : {}), ...fields, key: `${challengeKey(fields)}|admin=${id}` };
  await repos.challenges.upsert(next);
  return next;
}

export async function setChallengeHidden(repos: Repos, id: string, hidden: boolean) {
  const c = await repos.challenges.update({ id }, { hidden: hidden ? true : undefined });
  if (!c) throw new AppError(404, 'Challenge not found');
  // A hidden challenge cannot stay featured.
  if (hidden && settings().featuredIds.includes(id)) await saveSettings(repos, { featuredIds: settings().featuredIds.filter((x) => x !== id) });
}

/** Deletes a challenge made in the admin portal, only while it has no looks (otherwise hide it). */
export async function deleteChallenge(repos: Repos, id: string) {
  const c = await repos.challenges.findOne({ id });
  if (!c) throw new AppError(404, 'Challenge not found');
  if (c.source !== 'admin') throw new AppError(400, 'Built-in challenges cannot be deleted. Hide it instead.');
  if (await repos.designs.count({ challengeId: id })) throw new AppError(400, 'Players already made looks for this challenge. Hide it instead.');
  await repos.challenges.delete({ id });
  if (settings().featuredIds.includes(id)) await saveSettings(repos, { featuredIds: settings().featuredIds.filter((x) => x !== id) });
}

/** The featured challenges: the admin's pick, or [] to go back to the automatic weekly rotation. */
export async function setFeatured(repos: Repos, ids: string[]) {
  const found = ids.length ? await repos.challenges.find({ id: { $in: ids } }) : [];
  const ok = ids.filter((id) => found.some((c) => c.id === id && listable(c)));
  if (ok.length !== ids.length) throw new AppError(400, 'A featured challenge must be one players can see');
  await saveSettings(repos, { featuredIds: [...new Set(ok)].slice(0, 8) });
}

/* ------------------------------------ Week winners ------------------------------------ */

/**
 * How much a like should count when choosing a winner. A like counts ("trusted") when it is from
 * someone else, with a confirmed email, not suspended, given before the week closed. Likes from an
 * account made less than a day before, or from the designer's friends (invited by them, or the one
 * who invited them), still count but are flagged, so the admin can judge them.
 */
function voteMerit(v: { userId: string; up: boolean; at: string }, voter: User | undefined, d: Design, designer: User | null, closes?: string) {
  const flags: string[] = [];
  if (v.userId === d.userId) flags.push('own look');
  if (!voter) flags.push('deleted account');
  else {
    if (config.emailConfirmation && !voter.emailVerifiedAt) flags.push('email not confirmed');
    if (voter.suspended) flags.push('suspended');
    if (Date.parse(v.at) - Date.parse(voter.createdAt) < DAY) flags.push('new account');
    if (voter.referredBy === d.userId || (designer?.referredBy && designer.referredBy === voter.id)) flags.push('friend');
  }
  if (closes && v.at >= closes) flags.push('after the deadline');
  const trusted = v.up && !flags.some((f) => f !== 'friend' && f !== 'new account');
  return { flags, trusted, friend: flags.includes('friend'), fresh: flags.includes('new account') };
}

/** The periods the admin can judge: the launch (while its challenges exist), and the last 12 weeks. */
export function winnerPeriods(now = Date.now()) {
  const i = weekIndex(now);
  const weeks = Array.from({ length: 12 }, (_, k) => i - k).map((w) => ({ key: weekStart(w), label: k0(w, i), start: weekStart(w), end: weekStart(w + 1) }));
  return [{ key: 'launch', label: 'Launch week challenges', start: null as string | null, end: config.launchEnds ? new Date(config.launchEnds).toISOString() : null }, ...weeks];
}
function k0(w: number, now: number) {
  const start = new Date(Date.parse(weekStart(w)) + PKT);
  const label = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return w === now ? `This week (from ${label})` : w === now - 1 ? `Last week (from ${label})` : `Week of ${label}`;
}

/**
 * The best looks of a period, by merit: trusted likes first, then comments from other players, then
 * the earlier look (it got there first). `challenges`: 'featured' (the period's featured challenges), 'all', or one id.
 */
export async function winnerBoard(repos: Repos, period: string, challenges = 'all') {
  const periods = winnerPeriods();
  const p = periods.find((x) => x.key === period) ?? periods[1];
  const launchIds = LAUNCH.map((c) => `seed-${c.slug}`);
  let designs = (await repos.designs.find(p.key === 'launch' ? { challengeId: { $in: launchIds } } : { createdAt: { $gte: p.start!, $lt: p.end! } })).filter(isPublishedStatus);
  if (p.key === 'launch' && p.end) designs = designs.filter((d) => d.createdAt < p.end!);
  if (challenges === 'featured' && p.key !== 'launch') {
    const ids = featuredIds(Date.parse(p.start!) + DAY);
    designs = designs.filter((d) => ids.includes(d.challengeId));
  } else if (challenges !== 'all' && challenges !== 'featured') designs = designs.filter((d) => d.challengeId === challenges);
  const [votes, comments] = designs.length
    ? await Promise.all([repos.designVotes.find({ designId: { $in: designs.map((d) => d.id) } }), repos.comments.find({ designId: { $in: designs.map((d) => d.id) } })])
    : [[], []];
  const people = await repos.users.find({ id: { $in: [...new Set([...votes.map((v) => v.userId), ...designs.map((d) => d.userId)])] } }, LEAN);
  const who = new Map(people.map((u) => [u.id, u]));
  const closes = p.end ?? undefined;
  const scored = designs.map((d) => {
    const designer = who.get(d.userId) ?? null;
    const mine = votes.filter((v) => v.designId === d.id);
    const merits = mine.map((v) => voteMerit(v, who.get(v.userId), d, designer, closes));
    const trusted = merits.filter((m) => m.trusted).length;
    const friendLikes = merits.filter((m) => m.trusted && m.friend).length;
    const newAccountLikes = merits.filter((m) => m.trusted && m.fresh).length;
    const flagged = mine.filter((v, k) => v.up && !merits[k].trusted).length;
    const talk = comments.filter((c) => c.designId === d.id && c.userId !== d.userId && (!closes || c.at < closes)).length;
    return { d, trusted, friendLikes, newAccountLikes, flagged, talk, merit: trusted };
  });
  scored.sort((a, b) => b.merit - a.merit || b.talk - a.talk || a.d.createdAt.localeCompare(b.d.createdAt));
  const top = scored.slice(0, 30);
  const rows = await lookRows(repos, top.map((x) => x.d));
  const winner = settings().winners[p.key] ?? null;
  return {
    period: p,
    periods: periods.map(({ key, label }) => ({ key, label })),
    winner,
    total: designs.length,
    looks: rows.map((r, k) => ({ ...r, trustedLikes: top[k].trusted, friendLikes: top[k].friendLikes, newAccountLikes: top[k].newAccountLikes, flaggedLikes: top[k].flagged, otherComments: top[k].talk, merit: top[k].merit })),
  };
}

export async function setWinner(repos: Repos, period: string, lookId: string | null) {
  if (!winnerPeriods().some((p) => p.key === period)) throw new AppError(400, 'Unknown week');
  if (lookId && !(await repos.designs.findOne({ id: lookId }))) throw new AppError(404, 'Look not found');
  const winners = { ...settings().winners };
  if (lookId) winners[period] = lookId;
  else delete winners[period];
  await saveSettings(repos, { winners });
}

/* ------------------------------------ AI previews ------------------------------------ */

export async function previewStats(repos: Repos) {
  const now = Date.now();
  const days = lastDays(30, now);
  const [d1, d7, d30] = [ago(1, now), ago(7, now), ago(30, now)];
  const [total, today, week, recent] = await Promise.all([
    repos.events.count({ type: 'preview' }),
    repos.events.count({ type: 'preview', at: { $gte: d1 } }),
    repos.events.count({ type: 'preview', at: { $gte: d7 } }),
    repos.events.find({ type: 'preview', at: { $gte: d30 } }),
  ]);
  const per = new Map<string, number>();
  for (const e of recent) if (e.userId) per.set(e.userId, (per.get(e.userId) ?? 0) + 1);
  const topIds = [...per].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const users = topIds.length ? await repos.users.find({ id: { $in: topIds.map(([id]) => id) } }, LEAN) : [];
  const who = new Map(users.map((u) => [u.id, u]));
  const s = settings();
  const limits = previewLimits();
  const cost = config.preview.costUsd;
  return {
    enabled: Boolean(config.preview.project || config.preview.apiKey),
    costEach: cost,
    total,
    today,
    week,
    month: recent.length,
    costTotal: money(total * cost),
    costToday: money(today * cost),
    costWeek: money(week * cost),
    costMonth: money(recent.length * cost),
    daily: { days, previews: perDay(recent.map((e) => e.at), days) },
    top: topIds.map(([id, n]) => ({ id, n, username: username(who.get(id)), email: who.get(id)?.email ?? null })),
    limits: {
      off: limits.off,
      offInEnv: config.preview.off,
      free: limits.free,
      dailyLimit: limits.dailyLimit,
      globalDailyCap: limits.globalDailyCap,
      friendsForCredit: limits.friendsForCredit,
      friendCreditCap: limits.friendCreditCap,
      // Where each number comes from: the admin portal, or server/.env
      fromAdmin: { off: s.previewsOff !== undefined, free: s.previewFree !== undefined, dailyLimit: s.previewDailyLimit !== undefined, globalDailyCap: s.previewGlobalDailyCap !== undefined },
      env: { free: config.preview.free, dailyLimit: config.preview.dailyLimit, globalDailyCap: config.preview.globalDailyCap },
      maxDailySpend: money(limits.globalDailyCap * cost),
    },
  };
}

export async function setPreviewLimits(repos: Repos, input: { off?: boolean | null; free?: number | null; dailyLimit?: number | null; globalDailyCap?: number | null }) {
  const pick = (v: number | null | undefined, cur: number | undefined) => (v === undefined ? cur : v === null ? undefined : Math.max(0, Math.min(10_000, Math.trunc(v))));
  const s = settings();
  await saveSettings(repos, {
    previewsOff: input.off === undefined ? s.previewsOff : input.off ? true : undefined,
    previewFree: pick(input.free, s.previewFree),
    previewDailyLimit: pick(input.dailyLimit, s.previewDailyLimit),
    previewGlobalDailyCap: pick(input.globalDailyCap, s.previewGlobalDailyCap),
  });
  return previewStats(repos);
}

/* ------------------------------------- Invites ------------------------------------- */

export async function referralStats(repos: Repos) {
  const users = await repos.users.find({}, LEAN);
  const byId = new Map(users.map((u) => [u.id, u]));
  const referred = users.filter((u) => u.referredBy);
  const per = new Map<string, { joined: number; published: number }>();
  for (const u of referred) {
    const x = per.get(u.referredBy!) ?? { joined: 0, published: 0 };
    x.joined++;
    if (u.referralCounted) x.published++;
    per.set(u.referredBy!, x);
  }
  const days = lastDays(30);
  return {
    joined: referred.length,
    published: referred.filter((u) => u.referralCounted).length,
    conversion: pct(referred.filter((u) => u.referralCounted).length, referred.length),
    shareOfPlayers: pct(referred.length, users.length),
    inviters: per.size,
    creditsEarned: users.reduce((n, u) => n + (u.referralCredits ?? 0), 0),
    daily: { days, joined: perDay(referred.map((u) => u.createdAt), days) },
    top: [...per]
      .sort((a, b) => b[1].published - a[1].published || b[1].joined - a[1].joined)
      .slice(0, 50)
      .map(([id, x]) => ({ id, username: username(byId.get(id)), email: byId.get(id)?.email ?? null, joined: x.joined, published: x.published, credits: byId.get(id)?.referralCredits ?? 0 })),
    recent: referred
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30)
      .map((u) => ({ id: u.id, username: username(u), joined: u.createdAt, published: Boolean(u.referralCounted), invitedBy: username(byId.get(u.referredBy!)), invitedById: u.referredBy })),
  };
}

/** Removes votes a suspended or deleted player left, and recounts (used after suspending a vote farmer). */
export async function removeVotesBy(repos: Repos, userId: string) {
  const votes = await repos.designVotes.find({ userId });
  await repos.designVotes.delete({ userId });
  await repos.notifications.delete({ actorId: userId, type: 'like' });
  for (const id of new Set(votes.map((v) => v.designId))) await recount(repos, id);
  return votes.length;
}

