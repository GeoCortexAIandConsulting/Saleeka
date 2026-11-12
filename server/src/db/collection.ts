/**
 * A deliberately tiny collection interface. The production implementation is a thin
 * pass-through to the official MongoDB driver (see mongo.ts). The in-memory
 * implementation below is used for local demos and tests, and supports the same
 * operations: equality filters plus `$in`, `$ne` and the comparisons `$lt`, `$lte`, `$gt`, `$gte`
 * (a subset of MongoDB's own query language, so both behave the same), with sort, skip and limit.
 */
export type Doc = { id: string } & Record<string, any>;

type Ops<V> = { $in?: V[]; $ne?: V; $lt?: V; $lte?: V; $gt?: V; $gte?: V };
export type Filter<T> = {
  [K in keyof T]?: T[K] | Ops<T[K]>;
};

/** Which documents to return: `sort` is field to 1 (ascending) or -1 (descending), in order of priority. */
export interface FindOptions<T> {
  sort?: Partial<Record<keyof T & string, 1 | -1>>;
  skip?: number;
  limit?: number;
}

export interface Collection<T extends Doc> {
  insert(doc: T): Promise<T>;
  findOne(filter: Filter<T>): Promise<T | null>;
  find(filter?: Filter<T>, options?: FindOptions<T>): Promise<T[]>;
  /** Shallow-merge `patch` into the first matching document. */
  update(filter: Filter<T>, patch: Partial<T>): Promise<T | null>;
  /** Replace or insert by id. */
  upsert(doc: T): Promise<T>;
  delete(filter: Filter<T>): Promise<number>;
  /** Adds `by` to a number field of the first matching document in one step (safe when requests overlap). */
  increment(filter: Filter<T>, field: keyof T & string, by?: number): Promise<void>;
  count(filter?: Filter<T>): Promise<number>;
}

const OPS = ['$in', '$ne', '$lt', '$lte', '$gt', '$gte'];
const isOps = (c: unknown): c is Ops<any> => Boolean(c) && typeof c === 'object' && !Array.isArray(c) && Object.keys(c as object).some((k) => OPS.includes(k));

function matches<T extends Doc>(doc: T, filter: Filter<T>): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    const value = (doc as any)[key];
    if (!isOps(cond)) return value === cond;
    // Like MongoDB, comparisons never match a missing field; $ne does.
    const has = value !== undefined && value !== null;
    return (
      (cond.$in === undefined || cond.$in.includes(value)) &&
      (!('$ne' in cond) || value !== cond.$ne) &&
      (cond.$lt === undefined || (has && value < cond.$lt)) &&
      (cond.$lte === undefined || (has && value <= cond.$lte)) &&
      (cond.$gt === undefined || (has && value > cond.$gt)) &&
      (cond.$gte === undefined || (has && value >= cond.$gte))
    );
  });
}

/** Sorts, skips and limits, as MongoDB does. */
export function applyOptions<T extends Doc>(docs: T[], options: FindOptions<T> = {}): T[] {
  const keys = Object.entries(options.sort ?? {}) as Array<[string, 1 | -1]>;
  if (keys.length) {
    docs.sort((a, b) => {
      for (const [k, dir] of keys) {
        const x = (a as any)[k];
        const y = (b as any)[k];
        if (x === y) continue;
        if (x === undefined || x === null) return -dir;
        if (y === undefined || y === null) return dir;
        return (x < y ? -1 : 1) * dir;
      }
      return 0;
    });
  }
  const from = options.skip ?? 0;
  return docs.slice(from, options.limit === undefined ? undefined : from + options.limit);
}

export class MemoryCollection<T extends Doc> implements Collection<T> {
  private docs = new Map<string, T>();

  async insert(doc: T) {
    if (this.docs.has(doc.id)) throw new Error(`Duplicate id ${doc.id}`);
    this.docs.set(doc.id, structuredClone(doc));
    return doc;
  }
  async increment(filter: Filter<T>, field: keyof T & string, by = 1) {
    for (const [id, d] of this.docs) {
      if (matches(d, filter)) {
        this.docs.set(id, { ...d, [field]: (Number((d as any)[field]) || 0) + by });
        return;
      }
    }
  }
  async findOne(filter: Filter<T>) {
    for (const d of this.docs.values()) if (matches(d, filter)) return structuredClone(d);
    return null;
  }
  async find(filter: Filter<T> = {}, options?: FindOptions<T>) {
    return applyOptions([...this.docs.values()].filter((d) => matches(d, filter)), options).map((d) => structuredClone(d));
  }
  async update(filter: Filter<T>, patch: Partial<T>) {
    for (const [id, d] of this.docs) {
      if (matches(d, filter)) {
        const next = { ...d, ...patch } as T;
        this.docs.set(id, next);
        return structuredClone(next);
      }
    }
    return null;
  }
  async upsert(doc: T) {
    this.docs.set(doc.id, structuredClone(doc));
    return doc;
  }
  async delete(filter: Filter<T>) {
    let n = 0;
    for (const [id, d] of [...this.docs]) {
      if (matches(d, filter)) {
        this.docs.delete(id);
        n++;
      }
    }
    return n;
  }
  async count(filter: Filter<T> = {}) {
    return (await this.find(filter)).length;
  }
}
