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
import { SLOTS, type AvatarFace } from './types.js';
import { seedIfEmpty } from './data/seedDb.js';

export interface AppOptions {
  repos: Repos;
  llm: Llm;
  /** Disable rate limits (tests) */
  rateLimit?: boolean;
}

export async function createApp({ repos, llm, rateLimit: limit = true }: AppOptions) {
  await seedIfEmpty(repos);
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
    const { round, looks } = await createRound(repos, profile);
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
    res.json(await handleChat(repos, llm, profile, body.message, body.sessionId));
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
    res.json({ look: await swapLookItem(repos, profile, String(req.params.id), slot as (typeof SLOTS)[number]) });
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
