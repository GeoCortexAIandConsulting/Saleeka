import { MongoClient, type Db, type Filter as MongoFilter } from 'mongodb';
import type { Collection, Doc, Filter, FindOptions } from './collection.js';

/**
 * Pass-through adapter to the official MongoDB driver. Documents use our string `id`
 * field as the primary key (stored as `_id`), so no ObjectId handling leaks out.
 *
 * NOTE: the build environment this was written in could not reach a MongoDB server,
 * so this adapter is type-checked but has not been run against a live database.
 * Run `npm run test:mongo` against a real MongoDB (see README) before relying on it.
 */
export class MongoCollection<T extends Doc> implements Collection<T> {
  constructor(private readonly db: Db, private readonly name: string) {}

  private get col() {
    return this.db.collection<any>(this.name);
  }
  private toFilter(filter: Filter<T>): MongoFilter<any> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(filter)) out[k === 'id' ? '_id' : k] = v;
    return out;
  }
  private fromDoc(raw: any): T {
    const { _id, ...rest } = raw;
    return { id: _id, ...rest } as T;
  }
  private toDoc(doc: T) {
    const { id, ...rest } = doc;
    return { _id: id, ...rest };
  }

  async insert(doc: T) {
    await this.col.insertOne(this.toDoc(doc));
    return doc;
  }
  async increment(filter: Filter<T>, field: keyof T & string, by = 1) {
    await this.col.updateOne(this.toFilter(filter), { $inc: { [field]: by } });
  }
  async findOne(filter: Filter<T>) {
    const raw = await this.col.findOne(this.toFilter(filter));
    return raw ? this.fromDoc(raw) : null;
  }
  async find(filter: Filter<T> = {}, options: FindOptions<T> = {}) {
    let cursor = this.col.find(this.toFilter(filter));
    if (options.sort) cursor = cursor.sort(Object.fromEntries(Object.entries(options.sort).map(([k, v]) => [k === 'id' ? '_id' : k, v as 1 | -1])));
    if (options.skip) cursor = cursor.skip(options.skip);
    if (options.limit !== undefined) cursor = cursor.limit(options.limit);
    const raw = await cursor.toArray();
    return raw.map((r) => this.fromDoc(r));
  }
  async update(filter: Filter<T>, patch: Partial<T>) {
    const { id: _ignored, ...rest } = patch as Record<string, unknown>;
    // `undefined` means "remove the field" (e.g. deleting a photo), so it is unset, not stored as null.
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) $unset[k] = '';
      else $set[k] = v;
    }
    const raw = await this.col.findOneAndUpdate(
      this.toFilter(filter),
      { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
      { returnDocument: 'after' },
    );
    return raw ? this.fromDoc(raw) : null;
  }
  async upsert(doc: T) {
    const { _id, ...rest } = this.toDoc(doc);
    await this.col.replaceOne({ _id }, rest, { upsert: true });
    return doc;
  }
  async delete(filter: Filter<T>) {
    const res = await this.col.deleteMany(this.toFilter(filter));
    return res.deletedCount;
  }
  async count(filter: Filter<T> = {}) {
    return this.col.countDocuments(this.toFilter(filter));
  }
}

export async function connectMongo(uri: string, dbName: string) {
  const client = new MongoClient(uri);
  await client.connect();
  return { client, db: client.db(dbName) };
}
