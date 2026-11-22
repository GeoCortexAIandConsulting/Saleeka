/**
 * The admin portal's API (/api/admin/...). Signing in uses the admin username and password from
 * server/.env (ADMIN_USERNAME, ADMIN_PASSWORD), separate from player accounts; every other route
 * needs that admin session.
 */
import type { Express, NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Repos } from '../db/index.js';
import { AppError } from '../errors.js';
import { ADMIN_COOKIE, adminConfigured, adminCredentialsOk, isAdmin, requireAdmin, setAdminCookie } from '../middleware/auth.js';
import { OCCASIONS, ALL_SLOTS, type Product } from '../types.js';
import { usernameCheck } from '../services/usernames.js';
import { approveBrand, deleteBrandAccount, listBrandAccounts, rejectBrand, reviewItems, reviewQueue, suspendBrand } from '../services/brandPortal.js';
import {
  brandList,
  brandProducts,
  brandReport,
  challengeList,
  createChallenge,
  deleteAccount,
  deleteAnyComment,
  deleteChallenge,
  deleteLook,
  listAllComments,
  listLooks,
  listUsers,
  LOOK_FILTERS,
  LOOK_SORTS,
  lookDetail,
  overview,
  previewStats,
  PRODUCT_SORTS,
  referralStats,
  removeVotesBy,
  setBrandHidden,
  setChallengeHidden,
  setFeatured,
  setLookHidden,
  setPreviewLimits,
  setProductsHidden,
  setWinner,
  updateChallenge,
  userAction,
  userDetail,
  USER_FILTERS,
  USER_SORTS,
  usersCsv,
  winnerBoard,
} from '../services/admin.js';

export interface AdminRouteOptions {
  repos: Repos;
  /** Every in-stock piece, hidden ones included */
  allInStock: () => Promise<Product[]>;
  rateLimit: boolean;
}

const page = z.coerce.number().int().min(0).max(10_000).optional();
const id = z.string().min(1).max(200);

const challengeSchema = z.object({
  title: z.string().trim().min(3, 'Give the challenge a title').max(80),
  occasion: z.enum(OCCASIONS as [string, ...string[]]),
  gender: z.enum(['female', 'male']),
  colors: z.array(z.string().max(30)).max(6).default([]),
  coverage: z.number().int().min(1).max(5),
  wantsDupatta: z.boolean(),
  season: z.enum(['summer', 'winter']).nullable().optional(),
  budget: z.number().int().min(1000).max(2_000_000).nullable().optional(),
  required: z.array(z.enum(ALL_SLOTS as [string, ...string[]])).max(4).optional(),
  prize: z.string().max(120).nullable().optional(),
});

export function adminRoutes(app: Express, { repos, allInStock, rateLimit: limit }: AdminRouteOptions) {
  // A handful of tries, then a 15-minute wait: the password cannot be guessed by trying many.
  const loginLimiter = limit
    ? rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many tries. Wait 15 minutes and try again.' } })
    : (_q: Request, _s: Response, n: NextFunction) => n();

  // Admin answers are never cached by the browser or a proxy.
  app.use('/api/admin', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/admin/session', (req, res) => {
    res.json({ configured: adminConfigured(), signedIn: isAdmin(req) });
  });

  app.post('/api/admin/login', loginLimiter, (req, res) => {
    const body = z.object({ username: z.string().max(100), password: z.string().max(200) }).parse(req.body);
    if (!adminConfigured()) throw new AppError(503, 'The admin login is not set up yet: add ADMIN_USERNAME and ADMIN_PASSWORD to the server settings.');
    if (!adminCredentialsOk(body.username, body.password)) throw new AppError(401, 'Username or password is incorrect');
    setAdminCookie(res);
    res.json({ signedIn: true });
  });

  app.post('/api/admin/logout', (_req, res) => {
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    res.json({ signedIn: false });
  });

  // Everything below needs the admin session.
  app.use('/api/admin', requireAdmin);

  /* -------------------------------- overview -------------------------------- */
  app.get('/api/admin/overview', async (_req, res) => {
    res.json(await overview(repos, await allInStock()));
  });

  /* --------------------------------- players --------------------------------- */
  app.get('/api/admin/users', async (req, res) => {
    const q = z
      .object({ search: z.string().max(100).optional(), filter: z.enum(USER_FILTERS).optional(), sort: z.enum(USER_SORTS).optional(), page })
      .parse(req.query);
    res.json(await listUsers(repos, q));
  });

  app.get('/api/admin/users.csv', async (_req, res) => {
    res.set('Content-Disposition', `attachment; filename="saleeqa-players-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.type('text/csv').send(`﻿${await usersCsv(repos)}`); // the mark makes Excel read the file as UTF-8
  });

  app.get('/api/admin/users/:id', async (req, res) => {
    res.json(await userDetail(repos, id.parse(req.params.id)));
  });

  app.post('/api/admin/users/:id', async (req, res) => {
    const userId = id.parse(req.params.id);
    const body = z
      .object({
        action: z.enum(['suspend', 'unsuspend', 'verify', 'credits', 'rename', 'remove-votes']),
        credits: z.number().int().min(-50).max(50).optional(),
        username: z.string().max(40).optional(),
        name: z.string().max(80).optional(),
      })
      .parse(req.body);
    if (body.action === 'remove-votes') {
      const removed = await removeVotesBy(repos, userId);
      return res.json({ removed, ...(await userDetail(repos, userId)) });
    }
    let username: string | undefined;
    if (body.action === 'rename' && body.username !== undefined) {
      const check = await usernameCheck(repos, body.username, userId);
      if (!check.available) throw new AppError(400, check.reason ?? 'Please choose another username.');
      username = check.username;
    }
    res.json(await userAction(repos, userId, body.action, { credits: body.credits, username, name: body.name }));
  });

  app.delete('/api/admin/users/:id', async (req, res) => {
    const userId = id.parse(req.params.id);
    if (!(await repos.users.findOne({ id: userId }))) throw new AppError(404, 'Player not found');
    await deleteAccount(repos, userId);
    res.json({ deleted: true });
  });

  app.get('/api/admin/referrals', async (_req, res) => {
    res.json(await referralStats(repos));
  });

  /* ---------------------------------- looks ---------------------------------- */
  app.get('/api/admin/looks', async (req, res) => {
    const q = z
      .object({ filter: z.enum(LOOK_FILTERS).optional(), sort: z.enum(LOOK_SORTS).optional(), search: z.string().max(100).optional(), challengeId: z.string().max(200).optional(), page })
      .parse(req.query);
    res.json(await listLooks(repos, q));
  });

  app.get('/api/admin/looks/:id', async (req, res) => {
    res.json(await lookDetail(repos, id.parse(req.params.id)));
  });

  app.post('/api/admin/looks/:id', async (req, res) => {
    const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
    await setLookHidden(repos, id.parse(req.params.id), hidden);
    res.json({ hidden });
  });

  app.delete('/api/admin/looks/:id', async (req, res) => {
    await deleteLook(repos, id.parse(req.params.id));
    res.json({ deleted: true });
  });

  /* -------------------------------- comments -------------------------------- */
  app.get('/api/admin/comments', async (req, res) => {
    const q = z.object({ search: z.string().max(100).optional(), page }).parse(req.query);
    res.json(await listAllComments(repos, q));
  });

  app.delete('/api/admin/comments/:id', async (req, res) => {
    res.json(await deleteAnyComment(repos, id.parse(req.params.id)));
  });

  /* ---------------------------------- brands ---------------------------------- */
  app.get('/api/admin/brands', async (_req, res) => {
    res.json(await brandList(repos, await allInStock()));
  });

  app.get('/api/admin/brands/:id', async (req, res) => {
    res.json(await brandReport(repos, await allInStock(), id.parse(req.params.id)));
  });

  app.post('/api/admin/brands/:id', async (req, res) => {
    const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
    await setBrandHidden(repos, id.parse(req.params.id), hidden);
    res.json({ hidden });
  });

  app.get('/api/admin/brands/:id/products', async (req, res) => {
    const q = z
      .object({ search: z.string().max(100).optional(), sort: z.enum(PRODUCT_SORTS).optional(), hidden: z.enum(['1']).optional(), page })
      .parse(req.query);
    res.json(await brandProducts(repos, await allInStock(), id.parse(req.params.id), { ...q, hiddenOnly: q.hidden === '1' }));
  });

  app.post('/api/admin/products', async (req, res) => {
    const body = z.object({ ids: z.array(id).min(1).max(200), hidden: z.boolean() }).parse(req.body);
    await setProductsHidden(repos, body.ids, body.hidden);
    res.json({ hidden: body.hidden });
  });

  /* -------------------------------- challenges -------------------------------- */
  app.get('/api/admin/challenges', async (_req, res) => {
    res.json(await challengeList(repos));
  });

  app.post('/api/admin/challenges', async (req, res) => {
    const c = await createChallenge(repos, challengeSchema.parse(req.body) as Parameters<typeof createChallenge>[1]);
    res.status(201).json({ id: c.id });
  });

  app.put('/api/admin/challenges/:id', async (req, res) => {
    const c = await updateChallenge(repos, id.parse(req.params.id), challengeSchema.parse(req.body) as Parameters<typeof updateChallenge>[2]);
    res.json({ id: c.id });
  });

  app.post('/api/admin/challenges/:id/hidden', async (req, res) => {
    const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
    await setChallengeHidden(repos, id.parse(req.params.id), hidden);
    res.json({ hidden });
  });

  app.delete('/api/admin/challenges/:id', async (req, res) => {
    await deleteChallenge(repos, id.parse(req.params.id));
    res.json({ deleted: true });
  });

  app.put('/api/admin/featured', async (req, res) => {
    const { ids } = z.object({ ids: z.array(id).max(8) }).parse(req.body);
    await setFeatured(repos, ids);
    res.json(await challengeList(repos));
  });

  /* ------------------------------- week winners ------------------------------- */
  app.get('/api/admin/winners', async (req, res) => {
    const q = z.object({ period: z.string().max(40).optional(), challenges: z.string().max(200).optional() }).parse(req.query);
    res.json(await winnerBoard(repos, q.period ?? '', q.challenges ?? 'all'));
  });

  app.put('/api/admin/winners', async (req, res) => {
    const body = z.object({ period: z.string().max(40), lookId: id.nullable() }).parse(req.body);
    await setWinner(repos, body.period, body.lookId);
    res.json({ ok: true });
  });

  /* ------------------------------ brand portal ------------------------------ */
  // What waits for the admin: brand applications and uploaded pieces (shown as badges in the menu).
  app.get('/api/admin/waiting', async (_req, res) => {
    const [brands, items] = await Promise.all([repos.brandAccounts.count({ status: 'pending' }), repos.brandItems.count({ status: 'pending' })]);
    res.json({ brands, items });
  });

  app.get('/api/admin/brand-accounts', async (req, res) => {
    const q = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'suspended']).optional() }).parse(req.query);
    res.json(await listBrandAccounts(repos, q.status));
  });

  app.post('/api/admin/brand-accounts/:id', async (req, res) => {
    const body = z.object({ action: z.enum(['approve', 'reject', 'suspend']), note: z.string().trim().max(300).default('') }).parse(req.body);
    const accountId = id.parse(req.params.id);
    if (body.action === 'approve') await approveBrand(repos, accountId);
    if (body.action === 'reject') await rejectBrand(repos, accountId, body.note);
    if (body.action === 'suspend') await suspendBrand(repos, accountId, body.note);
    res.json({ ok: true });
  });

  app.delete('/api/admin/brand-accounts/:id', async (req, res) => {
    await deleteBrandAccount(repos, id.parse(req.params.id));
    res.json({ deleted: true });
  });

  app.get('/api/admin/review', async (req, res) => {
    const q = z.object({ accountId: z.string().max(80).optional(), page }).parse(req.query);
    res.json(await reviewQueue(repos, q));
  });

  app.post('/api/admin/review', async (req, res) => {
    const body = z.object({ ids: z.array(id).min(1).max(500), approve: z.boolean(), note: z.string().trim().max(300).default('') }).parse(req.body);
    res.json({ done: await reviewItems(repos, body.ids, body.approve, body.note) });
  });

  /* -------------------------------- AI previews -------------------------------- */
  app.get('/api/admin/previews', async (_req, res) => {
    res.json(await previewStats(repos));
  });

  app.put('/api/admin/previews', async (req, res) => {
    const n = z.number().int().min(0).max(10_000).nullable().optional();
    const body = z.object({ off: z.boolean().nullable().optional(), free: n, dailyLimit: n, globalDailyCap: n }).parse(req.body);
    res.json(await setPreviewLimits(repos, body));
  });
}
