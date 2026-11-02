/**
 * Runs the same collection contract against a real MongoDB. Skipped unless MONGODB_URI is set:
 *   MONGODB_URI=mongodb://localhost:27017 npm run test:mongo
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryCollection, type Collection } from '../src/db/collection.js';
import { MongoCollection, connectMongo } from '../src/db/mongo.js';

type Item = { id: string; name: string; qty: number; note?: string };
const uri = process.env.MONGODB_URI;

function contract(make: () => Promise<Collection<Item>>) {
  it('inserts, finds, updates, upserts, counts and deletes', async () => {
    const c = await make();
    await c.insert({ id: 'a', name: 'alpha', qty: 1 });
    await c.insert({ id: 'b', name: 'beta', qty: 2 });
    expect((await c.findOne({ id: 'a' }))?.name).toBe('alpha');
    expect(await c.findOne({ id: 'zzz' })).toBeNull();
    expect((await c.find({ id: { $in: ['a', 'b'] } })).length).toBe(2);
    expect((await c.update({ id: 'a' }, { qty: 5 }))?.qty).toBe(5);
    expect((await c.findOne({ id: 'a' }))?.name).toBe('alpha'); // update is a merge, not a replace
    await c.upsert({ id: 'c', name: 'gamma', qty: 3 });
    await c.upsert({ id: 'c', name: 'gamma2', qty: 3 });
    expect((await c.findOne({ id: 'c' }))?.name).toBe('gamma2');
    expect(await c.count()).toBe(3);
    expect(await c.delete({ name: 'beta' })).toBe(1);
    expect(await c.count()).toBe(2);
  });

  it('removes a field when it is updated to undefined (e.g. deleting a photo)', async () => {
    const c = await make();
    await c.insert({ id: 'u1', name: 'with note', qty: 1, note: 'private' });
    await c.update({ id: 'u1' }, { note: undefined, qty: 2 });
    const doc = (await c.findOne({ id: 'u1' }))!;
    expect(doc.qty).toBe(2);
    expect(doc.note).toBeUndefined();
    expect('note' in doc && doc.note !== undefined).toBe(false); // gone, not stored as null
  });
}

describe('MemoryCollection contract', () => {
  contract(async () => new MemoryCollection<Item>());
});

describe.skipIf(!uri)('MongoCollection contract (real MongoDB)', () => {
  let close: () => Promise<void>;
  let name = '';
  beforeAll(async () => {
    const { client } = await connectMongo(uri!, 'saleeqa_test');
    close = () => client.close();
    name = `contract_${Date.now()}`;
  });
  afterAll(async () => {
    const { client, db } = await connectMongo(uri!, 'saleeqa_test');
    await db.collection(name).drop().catch(() => {});
    await client.close();
    await close();
  });
  contract(async () => {
    const { db } = await connectMongo(uri!, 'saleeqa_test');
    return new MongoCollection<Item>(db, name);
  });
});
