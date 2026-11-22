import request from 'supertest';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { RulesLlm } from '../src/services/llm.js';
import { parseRow } from '../src/services/brandPortal.js';
import { sentInTests } from '../src/services/email.js';
import { signUp } from './helpers.js';

let repos: Repos;
let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  repos = createMemoryRepos();
  app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
});

let n = 0;
const application = (over: Record<string, unknown> = {}) => ({
  email: `brand${++n}@example.com`,
  password: 'brand-pass-123',
  contactName: 'Sana Malik',
  phone: '03001234567',
  brandName: `Rang Studio ${n}`,
  website: 'https://rang.example.pk',
  tier: 'mid',
  sells: 'female',
  ...over,
});

async function admin() {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'boss', password: 'test-admin-password-123' });
  return agent;
}

/** Applies, gets approved, signs in: an approved brand's agent and its account id. */
async function approvedBrand(over: Record<string, unknown> = {}) {
  const body = application(over);
  await request(app).post('/api/brand/apply').send(body);
  const account = (await repos.brandAccounts.findOne({ email: body.email }))!;
  await (await admin()).post(`/api/admin/brand-accounts/${account.id}`).send({ action: 'approve' });
  const agent = request.agent(app);
  expect((await agent.post('/api/brand/login').send({ email: body.email, password: body.password })).status).toBe(200);
  return { agent, id: account.id };
}

const suit = {
  title: 'Embroidered lawn 3-piece suit',
  slot: 'main',
  gender: 'female',
  price: 8990,
  colors: ['emerald'],
  url: 'https://rang.example.pk/products/lawn-suit',
  images: ['https://cdn.example.pk/lawn-suit.jpg'],
  includesDupatta: true,
  includesBottom: true,
};

describe('brand accounts', () => {
  it('cannot sign in until the admin approves, then gets an email and can', async () => {
    const body = application();
    const applied = await request(app).post('/api/brand/apply').send(body);
    expect(applied.status).toBe(201);
    expect((await request(app).post('/api/brand/apply').send(body)).status).toBe(409);

    const waiting = await request(app).post('/api/brand/login').send({ email: body.email, password: body.password });
    expect(waiting.status).toBe(403);
    expect(waiting.body.error).toMatch(/reviewing/);

    const boss = await admin();
    const list = await boss.get('/api/admin/brand-accounts').query({ status: 'pending' });
    const account = list.body.accounts.find((a: any) => a.email === body.email);
    expect(account.status).toBe('pending');
    expect((await boss.get('/api/admin/waiting')).body.brands).toBeGreaterThan(0);

    await boss.post(`/api/admin/brand-accounts/${account.id}`).send({ action: 'approve' });
    expect(sentInTests.at(-1)).toMatchObject({ to: body.email });
    expect(sentInTests.at(-1)!.subject).toMatch(/approved/);
    const brand = await repos.brands.findOne({ accountId: account.id });
    expect(brand?.name).toBe(body.brandName);

    const agent = request.agent(app);
    expect((await agent.post('/api/brand/login').send({ email: body.email, password: body.password })).status).toBe(200);
    expect((await agent.get('/api/brand/me')).body.account.brandId).toBe(brand!.id);
    // A brand session is not a player session.
    expect((await agent.get('/api/me')).status).toBe(401);
  });

  it('a turned-down brand is told why; a suspended brand is signed out and its pieces leave the Studio', async () => {
    const body = application();
    await request(app).post('/api/brand/apply').send(body);
    const account = (await repos.brandAccounts.findOne({ email: body.email }))!;
    const boss = await admin();
    await boss.post(`/api/admin/brand-accounts/${account.id}`).send({ action: 'reject', note: 'We could not find your shop online' });
    const no = await request(app).post('/api/brand/login').send({ email: body.email, password: body.password });
    expect(no.status).toBe(403);
    expect(no.body.error).toMatch(/could not find your shop/);

    const { agent, id } = await approvedBrand();
    await boss.post(`/api/admin/brand-accounts/${id}`).send({ action: 'suspend', note: 'Fake stock' });
    expect((await agent.get('/api/brand/me')).status).toBe(403);
  });
});

describe('brand items', () => {
  it('waits for approval before players see it; price and stock change at once; other edits are checked again', async () => {
    const { agent } = await approvedBrand();
    const made = await agent.post('/api/brand/items').send(suit);
    expect(made.status).toBe(201);
    const id = made.body.item.id;
    expect(made.body.item.status).toBe('pending');
    expect(await repos.products.findOne({ id: `bi:${id}` })).toBeNull();

    const boss = await admin();
    const queue = await boss.get('/api/admin/review');
    expect(queue.body.items.map((i: any) => i.id)).toContain(id);
    await boss.post('/api/admin/review').send({ ids: [id], approve: true });

    const product = (await repos.products.findOne({ id: `bi:${id}` }))!;
    expect(product).toMatchObject({ title: suit.title, price: 8990, inStock: true, source: 'brand', includesDupatta: true, includesBottom: true, slot: 'main' });
    expect(product.modesty).toBeGreaterThan(0);
    expect(product.occasions.length).toBeGreaterThan(0);

    // Players can pick it in the Studio: it is in the catalogue the game reads.
    const player = request.agent(app);
    await signUp(player, { email: 'brand-shopper@example.com', name: 'Shopper' });
    const fits = await boss.post('/api/admin/challenges').send({ title: 'Any colour test', occasion: product.occasions[0], gender: 'female', colors: [], coverage: 1, wantsDupatta: false });
    const { body } = await player.get(`/api/game/challenges/${fits.body.id}/pieces`).query({ slot: 'main', brand: product.brandId });
    expect(JSON.stringify(body)).toContain(`bi:${id}`);

    await agent.patch(`/api/brand/items/${id}`).send({ price: 7990, inStock: false });
    expect(await repos.products.findOne({ id: `bi:${id}` })).toMatchObject({ price: 7990, inStock: false });
    expect((await agent.get(`/api/brand/items/${id}`)).body.item.status).toBe('approved');

    const edited = await agent.put(`/api/brand/items/${id}`).send({ ...suit, title: 'Embroidered lawn suit (new colour)' });
    expect(edited.body.item.status).toBe('pending');
    await boss.post('/api/admin/review').send({ ids: [id], approve: false, note: 'Photo does not match' });
    const rejected = (await agent.get('/api/brand/items').query({ filter: 'rejected' })).body.items[0];
    expect(rejected).toMatchObject({ id, note: 'Photo does not match' });

    expect((await agent.post('/api/brand/items/delete').send({ ids: [id] })).body.deleted).toBe(1);
    expect(await repos.products.findOne({ id: `bi:${id}` })).toBeNull();
  });

  it('only lets a brand add pieces it sells, with known colours, and never touch another brand’s pieces', async () => {
    const { agent } = await approvedBrand({ sells: 'female' });
    expect((await agent.post('/api/brand/items').send({ ...suit, gender: 'male', slot: 'main' })).status).toBe(400);
    expect((await agent.post('/api/brand/items').send({ ...suit, colors: ['sky-ish'] })).status).toBe(400);
    expect((await agent.post('/api/brand/items').send({ ...suit, images: ['http://insecure.example/a.jpg'] })).status).toBe(400);
    // Colour worked out from the name when none is chosen.
    const auto = await agent.post('/api/brand/items').send({ ...suit, title: 'Black chiffon kurta', colors: [] });
    expect(auto.body.item.colors).toEqual(['black']);

    const other = await approvedBrand();
    expect((await other.agent.get(`/api/brand/items/${auto.body.item.id}`)).status).toBe(404);
    expect((await other.agent.post('/api/brand/items/delete').send({ ids: [auto.body.item.id] })).body.deleted).toBe(0);

    // Deleting a brand with no pieces in any look removes the brand too.
    const me = (await other.agent.get('/api/brand/me')).body.account;
    await (await admin()).delete(`/api/admin/brand-accounts/${me.id}`);
    expect(await repos.brands.findOne({ id: me.brandId })).toBeNull();
  });

  it('uploads photos (shrunk to WebP) that players can load', async () => {
    const { agent } = await approvedBrand();
    const png = await sharp({ create: { width: 2400, height: 3000, channels: 3, background: '#6b2d5c' } }).png().toBuffer();
    const up = await agent.post('/api/brand/images').send({ dataUrl: `data:image/png;base64,${png.toString('base64')}` });
    expect(up.status).toBe(201);
    const img = await request(app).get(up.body.url);
    expect(img.headers['content-type']).toBe('image/webp');
    const meta = await sharp(img.body).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1600);

    const made = await agent.post('/api/brand/items').send({ ...suit, images: [up.body.url] });
    expect(made.status).toBe(201);
    // Another brand cannot use this brand's uploaded photo.
    const other = await approvedBrand();
    expect((await other.agent.post('/api/brand/items').send({ ...suit, images: [up.body.url] })).status).toBe(400);
  });

  it('adds a spreadsheet: good rows wait for approval, bad rows come back with the reason', async () => {
    const { agent } = await approvedBrand({ sells: 'both' });
    const rows = [
      { title: 'Printed lawn kurta', category: 'Kurta', for: 'Women', price: 'Rs 3,490', photos: 'https://cdn.example.pk/k.jpg', link: 'https://rang.example.pk/k', colours: 'blush', sizes: 'S|M', in_stock: 'yes' },
      { title: 'Peshawari chappal', category: 'shoes', for: 'men', price: '4500', photos: 'https://cdn.example.pk/c.jpg', link: 'https://rang.example.pk/c', colours: 'brown' },
      { title: 'No price here', category: 'bag', for: 'women', price: '', photos: 'https://cdn.example.pk/b.jpg', link: 'https://rang.example.pk/b', colours: 'black' },
      { title: 'Mystery', category: 'spaceship', for: 'women', price: '100', photos: 'https://cdn.example.pk/m.jpg', link: 'https://rang.example.pk/m' },
    ];
    const res = await agent.post('/api/brand/items/bulk').send({ rows });
    expect(res.body.created).toBe(2);
    expect(res.body.errors.map((e: any) => e.row)).toEqual([2, 3]);
    expect(res.body.errors[1].message).toMatch(/spaceship/);
    const items = (await agent.get('/api/brand/items').query({ filter: 'pending' })).body.items;
    expect(items.find((i: any) => i.title === 'Peshawari chappal')).toMatchObject({ slot: 'footwear', gender: 'male', price: 4500 });
  });

  it('reads spreadsheet rows the way people write them', () => {
    const r = parseRow({ Title: 'Silk dupatta', Category: 'Dupatta', For: 'W', Price: 'PKR 2,500', Photos: 'https://x.pk/a.jpg | https://x.pk/b.jpg', Link: 'https://x.pk/d', Work: 'Heavy', Season: 'Winter', 'In stock': 'No' });
    expect(r).toMatchObject({ slot: 'dupatta', gender: 'female', price: 2500, images: ['https://x.pk/a.jpg', 'https://x.pk/b.jpg'], embellishment: 3, season: 'winter', inStock: false });
  });

  it('shows the brand its own statistics', async () => {
    const { agent } = await approvedBrand();
    const res = await agent.get('/api/brand/overview');
    expect(res.status).toBe(200);
    expect(res.body.report.summary).toContain('Rang Studio');
    expect(res.body.counts).toMatchObject({ all: 0 });
  });
});

describe('one sign-in for players and brands', () => {
  it('tells a brand from a player and opens the right dashboard', async () => {
    const body = application();
    await request(app).post('/api/brand/apply').send(body);
    // Waiting for approval: told so on the shared sign-in too.
    const waiting = await request(app).post('/api/auth/login').send({ email: body.email, password: body.password });
    expect(waiting.status).toBe(403);
    expect(waiting.body.error).toMatch(/reviewing/);

    const account = (await repos.brandAccounts.findOne({ email: body.email }))!;
    await (await admin()).post(`/api/admin/brand-accounts/${account.id}`).send({ action: 'approve' });
    const brand = request.agent(app);
    const signedIn = await brand.post('/api/auth/login').send({ email: body.email.toUpperCase(), password: body.password });
    expect(signedIn.body.kind).toBe('brand');
    expect((await brand.get('/api/brand/me')).status).toBe(200);
    expect((await brand.get('/api/me')).status).toBe(401);

    // A player, by email or by username.
    const player = request.agent(app);
    await signUp(player, { email: 'one-login@example.com', name: 'Mahnoor', username: 'mahnoor_one' });
    const byName = await request.agent(app).post('/api/auth/login').send({ email: '@Mahnoor_One', password: 'correct-horse-9' });
    expect(byName.body).toMatchObject({ kind: 'player', user: { username: 'mahnoor_one' } });
    expect((await request(app).post('/api/auth/login').send({ email: 'one-login@example.com', password: 'nope' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: body.email, password: 'nope' })).status).toBe(401);
  });

  it('opens both when the same email and password are a player and a brand', async () => {
    const both = request.agent(app);
    await signUp(both, { email: 'both-kinds@example.com', name: 'Both', password: 'same-pass-123' });
    await request(app).post('/api/brand/apply').send(application({ email: 'both-kinds@example.com', password: 'same-pass-123' }));
    const account = (await repos.brandAccounts.findOne({ email: 'both-kinds@example.com' }))!;
    await (await admin()).post(`/api/admin/brand-accounts/${account.id}`).send({ action: 'approve' });
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ email: 'both-kinds@example.com', password: 'same-pass-123' })).body.kind).toBe('both');
    expect((await agent.get('/api/me')).status).toBe(200);
    expect((await agent.get('/api/brand/me')).status).toBe(200);
  });
});
