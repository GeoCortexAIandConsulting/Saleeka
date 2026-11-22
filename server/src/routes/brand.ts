/**
 * The brand portal's API (/api/brand/...). Brands apply, and once the admin approves them they sign in
 * with their own email and password (a session separate from players and the admin).
 */
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PALETTE } from '../data/palette.js';
import type { Repos } from '../db/index.js';
import { AppError } from '../errors.js';
import { BRAND_COOKIE, readBrandAccountId, setBrandCookie } from '../middleware/auth.js';
import { devLink } from '../services/accounts.js';
import { brandReport } from '../services/admin.js';
import {
  applicationSchema,
  applyBrand,
  brandForgot,
  brandReset,
  bulkCreate,
  CATEGORY_LABEL,
  changePassword,
  COLUMNS,
  createItems,
  deleteItems,
  getItem,
  ITEM_FILTERS,
  itemSchema,
  listItems,
  loginBrand,
  MAX_ROWS,
  profileSchema,
  publicAccount,
  quickSchema,
  quickUpdate,
  statusProblem,
  updateItem,
  updateProfile,
  uploadImage,
} from '../services/brandPortal.js';
import { uid } from '../services/looks.js';
import { MEN_SLOTS, OCCASIONS, WOMEN_GAME_SLOTS, type BrandAccount, type Product } from '../types.js';

export interface BrandRouteOptions {
  repos: Repos;
  allInStock: () => Promise<Product[]>;
  rateLimit: boolean;
}

const page = z.coerce.number().int().min(0).max(10_000).optional();

export function brandRoutes(app: Express, { repos, allInStock, rateLimit: limit }: BrandRouteOptions) {
  const pass = (_q: Request, _s: Response, n: NextFunction) => n();
  const authLimiter = limit ? rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many tries. Wait 15 minutes and try again.' } }) : pass;
  const uploadLimiter = limit ? rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many uploads at once: wait a minute and carry on.' } }) : pass;

  /** The signed-in, approved brand account (a pending, turned-down or paused one is signed out with the reason). */
  const requireBrand = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = readBrandAccountId(req);
      const account = id ? await repos.brandAccounts.findOne({ id }) : null;
      if (!account) throw new AppError(401, 'Please sign in to your brand account');
      const problem = statusProblem(account);
      if (problem) {
        res.clearCookie(BRAND_COOKIE, { path: '/' });
        throw new AppError(403, problem);
      }
      res.locals.brand = account;
      next();
    } catch (e) {
      next(e);
    }
  };
  const brandOf = (res: Response) => res.locals.brand as BrandAccount;

  app.use('/api/brand', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  /* ------------------------------ applying and signing in ------------------------------ */
  app.post('/api/brand/apply', authLimiter, async (req, res) => {
    const a = await applyBrand(repos, applicationSchema.parse(req.body));
    res.status(201).json({ pending: true, email: a.email, brandName: a.brandName });
  });

  app.post('/api/brand/login', authLimiter, async (req, res) => {
    const body = z.object({ email: z.string().max(120), password: z.string().min(1).max(100) }).parse(req.body);
    const a = await loginBrand(repos, body.email, body.password);
    setBrandCookie(res, a.id);
    res.json({ account: publicAccount(a) });
  });

  app.post('/api/brand/logout', (_req, res) => {
    res.clearCookie(BRAND_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.post('/api/brand/forgot', authLimiter, async (req, res) => {
    const { email } = z.object({ email: z.string().email().max(120) }).parse(req.body);
    const url = await brandForgot(repos, email).catch((e) => void console.warn('Brand reset email failed:', (e as Error).message));
    res.json({ ok: true, ...(devLink(url ?? undefined) ? { devLink: devLink(url ?? undefined) } : {}) });
  });

  app.post('/api/brand/reset', authLimiter, async (req, res) => {
    const body = z.object({ token: z.string().min(20).max(200), password: z.string().min(8, 'Use at least 8 characters').max(100) }).parse(req.body);
    const a = await brandReset(repos, body.token, body.password);
    setBrandCookie(res, a.id);
    res.json({ account: publicAccount(a) });
  });

  /** The words and lists the brand pages need (categories, colours, spreadsheet columns). */
  app.get('/api/brand/options', (_req, res) => {
    res.json({
      categories: { female: WOMEN_GAME_SLOTS.map((s) => ({ value: s, label: CATEGORY_LABEL[s] })), male: MEN_SLOTS.map((s) => ({ value: s, label: CATEGORY_LABEL[s] })) },
      colours: Object.entries(PALETTE).map(([name, c]) => ({ name, hex: c.hex })),
      occasions: OCCASIONS,
      columns: COLUMNS,
      maxRows: MAX_ROWS,
    });
  });

  /* -------------------------------- everything else -------------------------------- */
  app.get('/api/brand/me', requireBrand, (_req, res) => {
    res.json({ account: publicAccount(brandOf(res)) });
  });

  app.patch('/api/brand/me', requireBrand, async (req, res) => {
    const a = await updateProfile(repos, brandOf(res), profileSchema.parse(req.body));
    res.json({ account: publicAccount(a) });
  });

  app.post('/api/brand/password', requireBrand, async (req, res) => {
    const body = z.object({ current: z.string().min(1).max(100), next: z.string().min(8, 'Use at least 8 characters').max(100) }).parse(req.body);
    await changePassword(repos, brandOf(res), body.current, body.next);
    res.json({ ok: true });
  });

  // The brand's statistics: the same report the admin uses to pitch, about this brand's pieces only.
  app.get('/api/brand/overview', requireBrand, async (_req, res) => {
    const a = brandOf(res);
    const [report, items] = await Promise.all([brandReport(repos, await allInStock(), a.brandId!), listItems(repos, a, { page: 0 })]);
    res.json({ report, counts: items.counts });
  });

  app.get('/api/brand/items', requireBrand, async (req, res) => {
    const q = z.object({ filter: z.enum(ITEM_FILTERS).optional(), search: z.string().max(100).optional(), page }).parse(req.query);
    res.json(await listItems(repos, brandOf(res), q));
  });

  app.get('/api/brand/items/:id', requireBrand, async (req, res) => {
    res.json({ item: await getItem(repos, brandOf(res), String(req.params.id)) });
  });

  app.post('/api/brand/items', requireBrand, async (req, res) => {
    const [item] = await createItems(repos, brandOf(res), [itemSchema.parse(req.body)]);
    res.status(201).json({ item });
  });

  app.put('/api/brand/items/:id', requireBrand, async (req, res) => {
    res.json({ item: await updateItem(repos, brandOf(res), String(req.params.id), itemSchema.parse(req.body)) });
  });

  // Price, sizes and stock: no new approval needed.
  app.patch('/api/brand/items/:id', requireBrand, async (req, res) => {
    res.json({ item: await quickUpdate(repos, brandOf(res), String(req.params.id), quickSchema.parse(req.body)) });
  });

  app.post('/api/brand/items/delete', requireBrand, async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string().max(80)).min(1).max(500) }).parse(req.body);
    res.json({ deleted: await deleteItems(repos, brandOf(res), ids) });
  });

  // A spreadsheet, sent in parts of up to MAX_ROWS rows. Parts of one upload share a batch id.
  app.post('/api/brand/items/bulk', express.json({ limit: '2mb' }), requireBrand, async (req, res) => {
    const body = z
      .object({ rows: z.array(z.record(z.string(), z.string().max(4000))).min(1).max(MAX_ROWS, `Up to ${MAX_ROWS} rows at a time`), batchId: z.string().max(60).optional() })
      .parse(req.body);
    const batchId = body.batchId ?? uid();
    res.json({ batchId, ...(await bulkCreate(repos, brandOf(res), body.rows, batchId)) });
  });

  app.post('/api/brand/images', express.json({ limit: '8mb' }), uploadLimiter, requireBrand, async (req, res) => {
    const { dataUrl } = z.object({ dataUrl: z.string().max(11_000_000, 'That photo is too large (over 8 MB)') }).parse(req.body);
    res.status(201).json(await uploadImage(repos, brandOf(res), dataUrl));
  });

  // Uploaded photos are public, like the brands' own photo links: players see them in the Studio.
  app.get('/api/brand-images/:id', async (req, res) => {
    const img = await repos.brandImages.findOne({ id: String(req.params.id) });
    if (!img) throw new AppError(404, 'Photo not found');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.type(img.mime).send(Buffer.from(img.data, 'base64'));
  });
}
