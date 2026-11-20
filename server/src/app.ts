import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { ZodError, z } from 'zod';
import { config } from './config.js';
import { AppError } from './errors.js';
import type { Repos, ProfileDoc } from './db/index.js';
import type { Llm } from './services/llm.js';
import { COOKIE, optionalAuth, requireAuth, setAuthCookie } from './middleware/auth.js';
import { answersSchema, buildProfile, currentAnswers, publicQuestions, updateProfileAnswers, validateAnswerOptions } from './services/profile.js';
import { createRound, submitRound, MAX_ROUNDS, QUICK_TAGS } from './services/rounds.js';
import { handleChat, swapLookItem } from './services/chat.js';
import { hydrateLooks, uid } from './services/looks.js';
import { createCatalogStore } from './services/catalogStore.js';
import { liveStock } from './services/liveStock.js';
import { ALL_SLOTS, OCCASIONS, SLOTS, slotsFor, type AvatarFace, type Occasion, type Product } from './types.js';
import { seedIfEmpty } from './data/seedDb.js';
import { BODY_SIZES, deletePreviews, previewDesign, previewEnabled } from './services/preview.js';
import { challengeCovers, liveCounts, showcase, FEED_SORTS, listNotifications, markNotificationsRead, playerProfile, unreadCount, weekly } from './services/game.js';
import { addComment, deleteComment, deleteGameData, feed, feedLook, gamePieces, PIECE_SORTS, gameItems, isPublished, listComments, publishDesign, hydrateDesigns, listChallenges, loadChallenge, nextDesignToRate, publicChallenge, seedChallenges, submitDesign, voteDesign } from './services/game.js';

export interface AppOptions {
  repos: Repos;
  llm: Llm;
  /** Disable rate limits (tests) */
  rateLimit?: boolean;
  /** How often the in-memory catalogue checks for a new catalog sync (default: 1 minute; 0 = read the database every time, as in tests) */
  catalogCacheMs?: number;
}

export async function createApp({ repos, llm, rateLimit: limit = true, catalogCacheMs }: AppOptions) {
  await seedIfEmpty(repos);
  await seedChallenges(repos);
  // In-stock pieces, held in memory and swapped in after each catalog sync (see catalogStore.ts).
  const catalogTtl = catalogCacheMs ?? (limit ? 60_000 : 0);
  const store = createCatalogStore(repos, { checkMs: catalogTtl });
  const catalog = () => store.get();
  if (catalogTtl) catalog().catch((e) => console.warn('Could not load the catalogue at start-up:', e)); // warm it before the first visitor
  const app = express();
  if (config.isProd) app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.webOrigin, credentials: true }));
  // Small bodies everywhere; the profile photo and avatar uploads get their own, larger limits below.
  const smallJson = express.json({ limit: '50kb' });
  const BIG_BODIES = new Set(['/api/me/photo', '/api/me/avatar']);
  app.use((req, res, next) => (BIG_BODIES.has(req.path) ? next() : smallJson(req, res, next)));
  app.use(cookieParser());

  const authLimiter = limit
    ? rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false })
    : (_q: Request, _s: Response, n: NextFunction) => n();
  const chatLimiter = limit
    ? rateLimit({ windowMs: 10 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false })
    : (_q: Request, _s: Response, n: NextFunction) => n();

  // Each preview is a paid AI image: no bursts (the daily limit is in services/preview.ts).
  const previewLimiter = limit
    ? rateLimit({ windowMs: 60 * 1000, limit: 3, standardHeaders: true, legacyHeaders: false, message: { error: 'One preview at a time, please: try again in a minute.' } })
    : (_req: Request, _res: Response, next: NextFunction) => next();
  // Likes are cheap to send, so a script could flood them (and the notifications they make).
  const voteLimiter = limit
    ? rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Slow down a little: try again in a minute.' } })
    : (_q: Request, _s: Response, n: NextFunction) => n();
  // Live stock checks ask the brands' shops: a few per look page, never a flood.
  const liveLimiter = limit
    ? rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many stock checks: try again in a minute.' } })
    : (_req: Request, _res: Response, next: NextFunction) => next();
  const commentLimiter = limit
    ? rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Slow down a little: try commenting again in a few minutes.' } })
    : (_q: Request, _s: Response, n: NextFunction) => n();

  const uidOf = (res: Response) => res.locals.userId as string;
  const loadProfile = async (userId: string): Promise<ProfileDoc> => {
    const p = await repos.profiles.findOne({ id: userId });
    if (!p) throw new AppError(409, 'Complete the taste quiz first');
    return p;
  };
  const publicUser = (u: { id: string; email: string; name: string; photo?: string; photoUpdatedAt?: string; avatar?: AvatarFace }) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    // The photo itself is fetched from /api/me/photo; this version string busts the browser cache on change.
    photoVersion: u.photo ? (u.photoUpdatedAt ?? '1') : null,
    avatarVersion: u.avatar ? u.avatar.updatedAt : null,
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, llm: llm.name });
  });

  /* ------------------------------- auth ------------------------------- */
  const signupSchema = z.object({
    email: z.string().email().max(120).transform((s) => s.toLowerCase().trim()),
    password: z.string().min(8).max(100),
    name: z.string().trim().min(1).max(60),
    consent: z.literal(true, { message: 'Please accept the privacy terms to continue' }),
  });

  app.post('/api/auth/signup', authLimiter, async (req, res) => {
    const body = signupSchema.parse(req.body);
    if (await repos.users.findOne({ email: body.email })) throw new AppError(409, 'An account with this email already exists');
    const now = new Date().toISOString();
    const user = {
      id: uid(),
      email: body.email,
      name: body.name,
      passwordHash: await bcrypt.hash(body.password, 10),
      consentAt: now,
      createdAt: now,
    };
    await repos.users.insert(user);
    setAuthCookie(res, user.id);
    res.status(201).json({ user: publicUser(user) });
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const body = z
      .object({ email: z.string().email().transform((s) => s.toLowerCase().trim()), password: z.string().min(1).max(100) })
      .parse(req.body);
    const user = await repos.users.findOne({ email: body.email });
    const ok = user ? await bcrypt.compare(body.password, user.passwordHash) : false;
    if (!user || !ok) throw new AppError(401, 'Email or password is incorrect');
    setAuthCookie(res, user.id);
    res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/me', requireAuth, async (_req, res) => {
    const user = await repos.users.findOne({ id: uidOf(res) });
    if (!user) throw new AppError(401, 'Please sign in');
    const profile = await repos.profiles.findOne({ id: user.id });
    res.json({
      user: publicUser(user),
      hasProfile: !!profile,
      roundsDone: profile?.roundsDone ?? 0,
      maxRounds: MAX_ROUNDS,
      // From the taste quiz: which side of the Studio to open first
      gender: profile?.gender ?? null,
    });
  });

  app.patch('/api/me', requireAuth, async (req, res) => {
    const body = z.object({ name: z.string().trim().min(1, 'Please enter your name').max(80) }).parse(req.body);
    await repos.users.update({ id: uidOf(res) }, { name: body.name });
    const user = await repos.users.findOne({ id: uidOf(res) });
    res.json({ user: publicUser(user!) });
  });

  /* --------------------------- profile photo --------------------------- */
  const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  app.put('/api/me/photo', requireAuth, express.json({ limit: '400kb' }), async (req, res) => {
    const body = z.object({ dataUrl: z.string().max(380_000, 'Photo is too large').regex(PHOTO, 'Please upload a JPG, PNG or WebP image') }).parse(req.body);
    const now = new Date().toISOString();
    await repos.users.update({ id: uidOf(res) }, { photo: body.dataUrl, photoUpdatedAt: now });
    res.json({ photoVersion: now });
  });

  app.get('/api/me/photo', requireAuth, async (_req, res) => {
    const user = await repos.users.findOne({ id: uidOf(res) });
    const m = user?.photo?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) throw new AppError(404, 'No photo');
    res.set('Cache-Control', 'private, max-age=31536000'); // URL carries a version, so it can be cached
    res.type(m[1]).send(Buffer.from(m[2], 'base64'));
  });

  app.delete('/api/me/photo', requireAuth, async (_req, res) => {
    await repos.users.update({ id: uidOf(res) }, { photo: undefined, photoUpdatedAt: undefined });
    res.json({ deleted: true });
  });

  /* ---------------------------- 3D avatar face ---------------------------- */
  // The selfie is turned into a face mesh in the browser; only the mesh numbers and a small,
  // edge-blended face image arrive here. Never shared, removable any time, gone with DELETE /api/me.
  const FACE_POINTS = 468;
  const avatarSchema = z.object({
    points: z.array(z.number().finite().min(-30).max(30)).length(FACE_POINTS * 3),
    uvs: z.array(z.number().finite().min(0).max(1)).length(FACE_POINTS * 2),
    texture: z.string().max(200_000, 'Face image is too large').regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'Face image must be a JPEG'),
    skinHex: z.string().regex(/^#[0-9a-f]{6}$/i),
  });
  const round3 = (n: number) => Math.round(n * 1000) / 1000;

  app.put('/api/me/avatar', requireAuth, express.json({ limit: '300kb' }), async (req, res) => {
    const body = avatarSchema.parse(req.body);
    const updatedAt = new Date().toISOString();
    const avatar: AvatarFace = { points: body.points.map(round3), uvs: body.uvs.map(round3), texture: body.texture, skinHex: body.skinHex.toLowerCase(), updatedAt };
    await repos.users.update({ id: uidOf(res) }, { avatar });
    res.json({ avatarVersion: updatedAt });
  });

  app.get('/api/me/avatar', requireAuth, async (_req, res) => {
    const user = await repos.users.findOne({ id: uidOf(res) });
    if (!user?.avatar) throw new AppError(404, 'No avatar yet');
    const { points, uvs, skinHex, updatedAt } = user.avatar;
    res.set('Cache-Control', 'private, no-cache');
    res.json({ points, uvs, skinHex, avatarVersion: updatedAt });
  });

  app.get('/api/me/avatar/face', requireAuth, async (_req, res) => {
    const user = await repos.users.findOne({ id: uidOf(res) });
    const m = user?.avatar?.texture.match(/^data:image\/jpeg;base64,(.+)$/);
    if (!m) throw new AppError(404, 'No avatar yet');
    res.set('Cache-Control', 'private, max-age=31536000'); // requested with ?v=<version>
    res.type('image/jpeg').send(Buffer.from(m[1], 'base64'));
  });

  app.delete('/api/me/avatar', requireAuth, async (_req, res) => {
    await repos.users.update({ id: uidOf(res) }, { avatar: undefined });
    res.json({ deleted: true });
  });

  // Privacy promise: one call deletes everything we hold about the user (photo and avatar included).
  app.delete('/api/me', requireAuth, async (_req, res) => {
    const id = uidOf(res);
    await deleteGameData(repos, id);
    await deletePreviews(repos, id);
    await repos.looks.delete({ userId: id });
    await repos.rounds.delete({ userId: id });
    await repos.sessions.delete({ userId: id });
    await repos.events.delete({ userId: id });
    await repos.profiles.delete({ id });
    await repos.users.delete({ id });
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ deleted: true });
  });

  /* ------------------------------- quiz ------------------------------- */
  app.get('/api/quiz/questions', async (_req, res) => {
    res.json({ questions: publicQuestions(await repos.brands.find()) });
  });

  app.post('/api/quiz/answers', requireAuth, async (req, res) => {
    const answers = answersSchema.parse(req.body);
    const brands = await repos.brands.find();
    const problem = validateAnswerOptions(answers, brands);
    if (problem) throw new AppError(400, problem);
    const existing = await repos.profiles.findOne({ id: uidOf(res) });
    const built = buildProfile(uidOf(res), answers, brands);
    // Retaking the quiz restarts the taste model but keeps the round counter honest.
    const doc: ProfileDoc = { ...built, id: uidOf(res), roundsDone: existing?.roundsDone ?? 0 };
    await repos.profiles.upsert(doc);
    res.status(201).json({ profile: doc });
  });

  app.get('/api/profile', requireAuth, async (_req, res) => {
    res.json({ profile: await loadProfile(uidOf(res)) });
  });

  // For the Account page: the answers as they stand now, ready to edit.
  app.get('/api/profile/answers', requireAuth, async (_req, res) => {
    res.json({ answers: currentAnswers(await loadProfile(uidOf(res))) });
  });

  // Change some answers later without retaking the quiz or losing what ranking rounds learned.
  app.patch('/api/profile/answers', requireAuth, async (req, res) => {
    const changes = z.record(z.string(), z.unknown()).parse(req.body);
    const existing = await loadProfile(uidOf(res));
    const out = updateProfileAnswers(existing, changes, await repos.brands.find());
    if ('problem' in out) throw new AppError(400, out.problem!);
    const doc: ProfileDoc = { ...out.profile, id: existing.id };
    await repos.profiles.upsert(doc);
    res.json({ profile: doc, answers: currentAnswers(doc) });
  });

  /* ------------------------------ rounds ------------------------------ */
  app.post('/api/rounds', requireAuth, async (_req, res) => {
    const profile = await loadProfile(uidOf(res));
    const { round, looks } = await createRound(repos, profile, llm, catalog);
    res.json({ round: { id: round.id, index: round.index, max: MAX_ROUNDS }, looks, quickTags: QUICK_TAGS });
  });

  app.post('/api/rounds/:id/submit', requireAuth, async (req, res) => {
    const body = z
      .object({
        ranks: z.array(z.string()).min(1).max(5),
        tags: z.record(z.string(), z.array(z.string()).max(4)).optional(),
        note: z.string().max(600).optional(),
      })
      .parse(req.body);
    const profile = await loadProfile(uidOf(res));
    const out = await submitRound(repos, llm, profile, String(req.params.id), body);
    res.json({
      roundsDone: out.roundsDone,
      roundsLeft: out.roundsLeft,
      learned: out.learned,
      summary: out.profile.summary,
    });
  });

  /* ------------------------------- chat ------------------------------- */
  app.post('/api/chat', requireAuth, chatLimiter, async (req, res) => {
    const body = z.object({ message: z.string().trim().min(1).max(500), sessionId: z.string().optional() }).parse(req.body);
    const profile = await loadProfile(uidOf(res));
    res.json(await handleChat(repos, llm, profile, body.message, body.sessionId, catalog));
  });

  /* ------------------------------- looks ------------------------------ */
  app.get('/api/looks/saved', requireAuth, async (_req, res) => {
    const looks = await repos.looks.find({ userId: uidOf(res), saved: true });
    looks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ looks: await hydrateLooks(repos, looks) });
  });

  app.post('/api/looks/:id/save', requireAuth, async (req, res) => {
    const { saved } = z.object({ saved: z.boolean() }).parse(req.body);
    const look = await repos.looks.findOne({ id: String(req.params.id), userId: uidOf(res) });
    if (!look) throw new AppError(404, 'Look not found');
    await repos.looks.update({ id: look.id }, { saved });
    if (saved) {
      const products = await repos.products.find({ id: { $in: look.items.map((i) => i.productId) } });
      for (const p of products) {
        await repos.events.insert({ id: uid(), userId: uidOf(res), type: 'save', productId: p.id, brandId: p.brandId, lookId: look.id, at: new Date().toISOString() });
      }
    }
    res.json({ id: look.id, saved });
  });

  app.post('/api/looks/:id/swap', requireAuth, async (req, res) => {
    const { slot } = z.object({ slot: z.enum(SLOTS as [string, ...string[]]) }).parse(req.body);
    const profile = await loadProfile(uidOf(res));
    res.json({ look: await swapLookItem(repos, profile, String(req.params.id), slot as (typeof SLOTS)[number], catalog) });
  });

  /* -------------------------------- game -------------------------------- */
  // Challenge cover photos, for every open challenge: worked out from the whole catalogue, so kept
  // for 10 minutes (a newly asked-for challenge gets its cover within that time).
  let coverCache: { at: number; covers: Promise<Map<string, string>> } | null = null;
  const covers = () => {
    if (!coverCache || Date.now() - coverCache.at > 10 * 60 * 1000 || !catalogTtl) {
      const made = (async () => {
        const ids = (await listChallenges(repos)).map((c) => c.id);
        const all = await repos.challenges.find({ id: { $in: ids } });
        const ordered = ids.map((id) => all.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
        return challengeCovers(await catalog(), ordered);
      })();
      made.catch(() => (coverCache = null));
      coverCache = { at: Date.now(), covers: made };
    }
    return coverCache.covers;
  };

  // The landing page's Runway: real trending looks, open to everyone (they are public pages).
  let showcaseCache: { at: number; body: unknown } | null = null;
  app.get('/api/showcase', async (_req, res) => {
    if (!showcaseCache || Date.now() - showcaseCache.at > 5 * 60 * 1000 || !catalogTtl) showcaseCache = { at: Date.now(), body: { looks: await showcase(repos) } };
    res.set('Cache-Control', 'public, max-age=300');
    res.json(showcaseCache.body);
  });

  // The dress-up game needs an account but not the quiz, so new players can start straight away.
  app.get('/api/game/challenges', requireAuth, async (_req, res) => {
    const [challenges, cover] = await Promise.all([listChallenges(repos), covers()]);
    res.json({ challenges: challenges.map((c) => ({ ...c, cover: cover.get(c.id) ?? null })) });
  });

  // Everything that fits the challenge, from every brand, best fit first.
  // The landing page's demo: a women's Mehndi or a men's Eid challenge with a few real pieces per
  // slot, open to everyone. Up to four per slot, from different brands where possible; cached so
  // visitors never load the whole catalogue each time.
  const demoCache = new Map<string, { at: number; body: unknown }>();
  app.get('/api/demo/look', async (req, res) => {
    const gender = req.query.gender === 'male' ? 'male' : 'female';
    let cached = demoCache.get(gender);
    if (!cached || Date.now() - cached.at > 10 * 60 * 1000) {
      const ids = gender === 'male' ? ['seed-men-eid-white', 'seed-men-mehndi'] : ['seed-mehndi-mustard', 'seed-mehndi-green'];
      let challenge = null;
      for (const id of ids) challenge ??= await repos.challenges.findOne({ id });
      if (!challenge) throw new AppError(404, 'No demo challenge');
      const all = gameItems(await catalog(), challenge);
      // A first impression: clean names (no "Rts | …" catalogue codes or broken characters), no abayas
      // standing in for a dupatta, and prices most shoppers recognise.
      const showcase = (p: Product) => /^[A-Za-z][A-Za-z0-9 '’&.-]{2,40}$/.test(p.title) && !/abaya/i.test(p.title) && p.price <= 60000;
      const pick = (list: Product[] = []) => {
        const photo = list.filter((p) => p.images?.length);
        const nice = photo.filter(showcase);
        const withPhoto = nice.length >= 3 ? nice : photo;
        const out: Product[] = [];
        for (const p of withPhoto) if (out.length < 4 && !out.some((o) => o.brandId === p.brandId)) out.push(p);
        for (const p of withPhoto) if (out.length < 4 && !out.includes(p)) out.push(p);
        return out;
      };
      const items = Object.fromEntries(slotsFor(gender).map((s) => [s, pick(all[s])]));
      cached = { at: Date.now(), body: { challenge: publicChallenge(challenge, 0), items } };
      demoCache.set(gender, cached);
    }
    res.set('Cache-Control', 'public, max-age=600');
    res.json(cached.body);
  });

  app.get('/api/game/challenges/:id/items', requireAuth, async (req, res) => {
    const challenge = await loadChallenge(repos, String(req.params.id));
    res.json({ challenge: publicChallenge(challenge, 0), items: gameItems(await catalog(), challenge) });
  });

  // One slot's pieces for a challenge: colour variants grouped, searched, filtered, sorted and paged.
  const piecesQuery = z.object({
    slot: z.enum(ALL_SLOTS as [string, ...string[]]),
    q: z.string().trim().max(60).optional(),
    brand: z.string().max(80).optional(),
    color: z.string().max(30).optional(),
    min: z.coerce.number().min(0).optional(),
    max: z.coerce.number().min(0).optional(),
    sort: z.enum(PIECE_SORTS).optional(),
    page: z.coerce.number().int().min(1).max(500).optional(),
  });
  app.get('/api/game/challenges/:id/pieces', requireAuth, async (req, res) => {
    const challenge = await loadChallenge(repos, String(req.params.id));
    const query = piecesQuery.parse(req.query);
    res.json(gamePieces(await catalog(), challenge, query as Parameters<typeof gamePieces>[2]));
  });

  const designSchema = z.object({
    challengeId: z.string().min(1).max(80),
    items: z.array(z.object({ slot: z.enum(ALL_SLOTS as [string, ...string[]]), productId: z.string().max(200) })).min(1).max(ALL_SLOTS.length),
    /** true: keep it private to preview on the model first, then publish */
    draft: z.boolean().optional(),
  });

  app.post('/api/game/designs', requireAuth, async (req, res) => {
    const body = designSchema.parse(req.body);
    const design = await submitDesign(repos, uidOf(res), body as Parameters<typeof submitDesign>[2]);
    res.status(201).json({ design: (await hydrateDesigns(repos, [design]))[0] });
  });

  // Publish a draft once the player is happy with how it looks on the model.
  app.post('/api/game/designs/:id/publish', requireAuth, async (req, res) => {
    const design = await publishDesign(repos, uidOf(res), String(req.params.id));
    res.json({ design: (await hydrateDesigns(repos, [design]))[0] });
  });

  // The AI preview of a draft on a model: is it switched on, make one (about half a minute), show one.
  app.get('/api/game/preview', requireAuth, (_req, res) => {
    res.json({ enabled: previewEnabled() });
  });

  app.post('/api/game/designs/:id/preview', requireAuth, previewLimiter, async (req, res) => {
    const { anotherModel, size } = z.object({ anotherModel: z.boolean().optional(), size: z.enum(BODY_SIZES).optional() }).parse(req.body ?? {});
    const design = await previewDesign(repos, uidOf(res), String(req.params.id), { anotherModel, size });
    res.json({ design: (await hydrateDesigns(repos, [design]))[0] });
  });

  // A look's image: open to everyone once the look is published (shared links show it), and to
  // its designer while it is a draft. The base model photos are never served.
  app.get('/api/previews/:id', optionalAuth, async (req, res) => {
    const id = String(req.params.id);
    const p = await repos.previews.findOne({ id });
    if (!p || !p.userId) throw new AppError(404, 'Preview not found');
    if (p.userId !== res.locals.userId) {
      const published = (await repos.designs.find({ previewId: id })).some(isPublished);
      if (!published) throw new AppError(404, 'Preview not found');
    }
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.type(p.mime).send(Buffer.from(p.data, 'base64'));
  });

  app.get('/api/game/designs/mine', requireAuth, async (_req, res) => {
    const mine = (await repos.designs.find({ userId: uidOf(res) })).filter(isPublished);
    mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ designs: await hydrateDesigns(repos, mine) });
  });

  app.get('/api/game/rate/next', requireAuth, async (_req, res) => {
    res.json({ design: await nextDesignToRate(repos, uidOf(res)) });
  });

  app.post('/api/game/designs/:id/vote', requireAuth, voteLimiter, async (req, res) => {
    const { up } = z.object({ up: z.boolean().nullable() }).parse(req.body);
    await voteDesign(repos, uidOf(res), String(req.params.id), up);
    res.json({ ok: true });
  });

  /* ------------------------------ My taste feed ------------------------------ */
  // Everyone's published looks, newest first (signed-in players only).
  app.get('/api/feed', requireAuth, async (req, res) => {
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const gender = req.query.gender === 'male' || req.query.gender === 'female' ? req.query.gender : undefined;
    const sort = z.enum(FEED_SORTS).optional().parse(req.query.sort);
    const occasion = z.enum(OCCASIONS as [Occasion, ...Occasion[]]).optional().parse(req.query.occasion || undefined);
    res.json(await feed(repos, uidOf(res), before, { gender, occasion }, sort));
  });

  // Live like and comment counts for the looks on screen (polled by the Runway and look pages).
  // Public like the look pages; before /api/feed/:id so "counts" is not read as a look id.
  const countsQuery = z.object({ ids: z.string().min(1).max(3000).transform((s) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 60)) });
  app.get('/api/feed/counts', async (req, res) => {
    const { ids } = countsQuery.parse(req.query);
    res.set('Cache-Control', 'no-store');
    res.json({ counts: await liveCounts(repos, ids) });
  });

  // One look, for its own page on the Runway. Shared links open it for anyone, read-only.
  app.get('/api/feed/:id', optionalAuth, async (req, res) => {
    res.json({ look: await feedLook(repos, res.locals.userId ?? '', String(req.params.id)) });
  });

  app.get('/api/game/designs/:id/comments', optionalAuth, async (req, res) => {
    res.json({ comments: await listComments(repos, res.locals.userId ?? '', String(req.params.id)) });
  });

  // This week's featured challenges and their most liked looks so far.
  app.get('/api/game/weekly', requireAuth, async (_req, res) => {
    const [week, cover] = await Promise.all([weekly(repos, uidOf(res)), covers()]);
    res.json({ ...week, challenges: week.challenges.map((c) => ({ ...c, cover: cover.get(c.id) ?? null })) });
  });

  // A player's page: their looks and the likes they earned (first name only).
  app.get('/api/players/:id', requireAuth, async (req, res) => {
    res.json(await playerProfile(repos, uidOf(res), String(req.params.id)));
  });

  /* ------------------------------ notifications ------------------------------ */
  // Likes on your looks, comments on them, and replies to your comments.
  app.get('/api/notifications', requireAuth, async (_req, res) => {
    res.json(await listNotifications(repos, uidOf(res)));
  });

  app.get('/api/notifications/unread', requireAuth, async (_req, res) => {
    res.json({ unread: await unreadCount(repos, uidOf(res)) });
  });

  app.post('/api/notifications/read', requireAuth, async (_req, res) => {
    await markNotificationsRead(repos, uidOf(res));
    res.json({ ok: true });
  });

  app.post('/api/game/designs/:id/comments', requireAuth, commentLimiter, async (req, res) => {
    const { text, parentId } = z
      .object({ text: z.string().trim().min(1, 'Write a comment first').max(300, 'Keep comments under 300 characters'), parentId: z.string().max(64).optional() })
      .parse(req.body);
    res.status(201).json({ comments: await addComment(repos, uidOf(res), String(req.params.id), text, parentId) });
  });

  app.delete('/api/game/comments/:id', requireAuth, async (req, res) => {
    await deleteComment(repos, uidOf(res), String(req.params.id));
    res.json({ deleted: true });
  });

  /* ------------------------------- live stock ------------------------------- */
  // Is it still in stock, at what price? Asked of the brand's shop for the pieces of one look, when
  // someone is about to buy. Public, like the look pages that use it.
  const liveQuery = z.object({ ids: z.string().min(1).max(1200).transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12)) });
  app.get('/api/products/live', liveLimiter, async (req, res) => {
    const { ids } = liveQuery.parse(req.query);
    res.set('Cache-Control', 'private, max-age=300');
    res.json({ products: await liveStock(repos, ids, store) });
  });

  /* ----------------------- click-out tracking + partners ----------------------- */
  app.get('/api/brands', async (_req, res) => {
    res.json({ brands: await repos.brands.find() });
  });

  // Every "buy" button goes through here so brands get attributed clicks.
  app.get('/api/go/:productId', optionalAuth, async (req, res) => {
    const product = await repos.products.findOne({ id: String(req.params.productId) });
    if (!product) throw new AppError(404, 'Product not found');
    await repos.events.insert({
      id: uid(),
      userId: res.locals.userId ?? undefined,
      type: 'click',
      productId: product.id,
      brandId: product.brandId,
      lookId: typeof req.query.look === 'string' ? req.query.look : undefined,
      at: new Date().toISOString(),
    });
    res.redirect(302, product.url);
  });

  app.get('/api/partners/:brandId/report', async (req, res) => {
    if (!config.adminKey || req.headers['x-admin-key'] !== config.adminKey) throw new AppError(403, 'Forbidden');
    const events = await repos.events.find({ brandId: String(req.params.brandId) });
    const count = (t: string) => events.filter((e) => e.type === t).length;
    const impressions = count('impression');
    const clicks = count('click');
    res.json({
      brandId: req.params.brandId,
      impressions,
      clicks,
      saves: count('save'),
      clickRate: impressions ? Math.round((clicks / impressions) * 1000) / 10 : 0,
    });
  });

  /* ---------------------------- errors ---------------------------- */
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'Not found')));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
